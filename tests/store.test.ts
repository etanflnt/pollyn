// Integration tests against an in-memory PGlite Postgres (TP_DB_PATH=":memory:" set in _helpers).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { alice, bob, carol, guest, owner, questions } from "./_helpers.ts";
import {
  buildPollView, createPoll, deletePoll, duplicatePoll, getPollRaw, listMyPolls, updatePoll,
} from "../lib/server/polls.ts";
import { addSuggestion, deleteOption, getResponse, listResponses, upsertResponse } from "../lib/server/responses.ts";
import { createDraw, listDraws } from "../lib/server/draws.ts";
import { readUpload, saveUpload } from "../lib/server/uploads.ts";
import { closeDb, dbKind, queryOne } from "../lib/server/db.ts";
import { HttpError } from "../lib/server/errors.ts";

after(() => closeDb());

async function openPoll(over: Record<string, unknown> = {}) {
  const p = await createPoll({ title: "Lunch", questions: questions(), ...over }, owner);
  return updatePoll(p, { status: "open" });
}

const status = (n: number) => (e: unknown) => e instanceof HttpError && e.status === n;

test("uses PGlite when DATABASE_URL is unset", async () => {
  assert.equal(await dbKind(), "pglite");
});

test("create, read by id and slug, patch merges settings shallowly", async () => {
  const p = await createPoll({ title: "Lunch", settings: { access: "public" } }, owner);
  assert.equal(p.status, "draft");
  assert.match(p.slug, /^[a-z2-9]{7}$/);
  assert.equal((await getPollRaw(p.id))?.id, p.id);
  assert.equal((await getPollRaw(p.slug))?.id, p.id);
  assert.equal(await getPollRaw("nope"), null);
  const u = await updatePoll(p, { settings: { theme: "sunset" } });
  assert.equal(u.settings.access, "public");
  assert.equal(u.settings.theme, "sunset");
  assert.equal((await getPollRaw(p.id))?.settings.theme, "sunset");
});

test("responses upsert per user and resume", async () => {
  const p = await openPoll();
  const r1 = await upsertResponse(p, alice, { answers: { q1: { optionIds: ["pizza"] } }, currentStep: 2, completed: false });
  const r2 = await upsertResponse(p, alice, { answers: { q1: { optionIds: ["sushi"] }, q3: { rating: 4 } }, currentStep: 5, completed: true });
  assert.equal(r1.id, r2.id);
  assert.equal(r2.completed, true);
  assert.equal((await listResponses(p.id)).length, 1);
  const saved = (await getResponse(p.id, alice.id))!;
  assert.equal(saved.completed, true);
  assert.equal(saved.currentStep, 5);
  assert.deepEqual(saved.answers.q1, { optionIds: ["sushi"] });
  const view = await buildPollView(p, alice, saved);
  assert.equal(view.participantCount, 1);
  assert.equal(view.canSeeResults, true); // default after_vote
  assert.equal(view.isOwner, false);
});

test("concurrent first saves keep one row and completion stays sticky", async () => {
  const p = await openPoll();
  const done = { answers: { q1: { optionIds: ["pizza"] }, q3: { rating: 4 } }, currentStep: 5, completed: true };
  const partial = { answers: { q1: { optionIds: ["pizza"] }, q3: { rating: 4 } }, currentStep: 2, completed: false };
  await Promise.all([upsertResponse(p, bob, done), upsertResponse(p, bob, partial), upsertResponse(p, bob, partial)]);
  const rows = (await listResponses(p.id)).filter((r) => r.userId === bob.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].completed, true);
});

test("suggestions: appended with suggestedBy, deduped case-insensitively, validated", async () => {
  const p = await openPoll();
  const a = await addSuggestion(p.id, "q1", "  Ramen  ", alice);
  assert.equal(a.label, "Ramen");
  assert.deepEqual(a.suggestedBy, { userId: alice.id, name: alice.name });
  const b = await addSuggestion(p.id, "q1", "RAMEN", bob);
  assert.equal(b.id, a.id);
  const pizza = await addSuggestion(p.id, "q1", "pizza", bob);
  assert.equal(pizza.id, "pizza");
  assert.equal((await getPollRaw(p.id))!.questions[0].options.length, 4);
  await assert.rejects(addSuggestion(p.id, "q2", "Water", alice), status(400));
  await assert.rejects(addSuggestion(p.id, "q1", "x".repeat(61), alice), status(400));
  await assert.rejects(addSuggestion(p.id, "zz", "x", alice), status(404));
  // a stale builder PATCH does not wipe the suggestion
  const after = await updatePoll((await getPollRaw(p.id))!, { questions: questions() });
  assert.ok(after.questions[0].options.some((o) => o.id === a.id));
});

test("concurrent suggestions are all kept (row lock)", async () => {
  const p = await openPoll();
  const labels = ["Ramen", "Curry", "Pho", "Burgers", "Salad", "Kebab"];
  await Promise.all(labels.map((l, i) => addSuggestion(p.id, "q1", l, i % 2 ? alice : bob)));
  const opts = (await getPollRaw(p.id))!.questions[0].options.map((o) => o.label);
  for (const l of labels) assert.ok(opts.includes(l), `missing ${l}`);
});

test("anonymous polls hide suggesters from other viewers", async () => {
  const p = await openPoll({ settings: { anonymous: true } });
  await addSuggestion(p.id, "q1", "Ramen", alice);
  const fresh = (await getPollRaw(p.id))!;
  const forBob = (await buildPollView(fresh, bob, null)).poll.questions[0].options.at(-1)!;
  assert.deepEqual(forBob.suggestedBy, { userId: "", name: "Anonymous" });
  const forAlice = (await buildPollView(fresh, alice, null)).poll.questions[0].options.at(-1)!;
  assert.equal(forAlice.suggestedBy?.userId, alice.id);
});

test("deleting an option strips it from answers", async () => {
  const p = await openPoll();
  await upsertResponse(p, alice, { answers: { q1: { optionIds: ["pizza"] }, q2: { optionIds: ["tea", "coffee"] }, q3: { rating: 3 } }, currentStep: 5, completed: true });
  await upsertResponse(p, bob, { answers: { q2: { optionIds: ["tea"] } }, currentStep: 2, completed: false });
  await deleteOption(p, "q2", "tea");
  assert.deepEqual((await getResponse(p.id, alice.id))!.answers.q2, { optionIds: ["coffee"] });
  assert.equal((await getResponse(p.id, bob.id))!.answers.q2, undefined);
  assert.ok(!(await getPollRaw(p.id))!.questions[1].options.some((o) => o.id === "tea"));
  await assert.rejects(deleteOption(p, "q2", "tea"), status(404));
});

test("draws persist newest first; delete cascades; list counts; duplicate", async () => {
  const p = await openPoll();
  await upsertResponse(p, alice, { answers: { q1: { optionIds: ["pizza"] }, q3: { rating: 3 } }, currentStep: 5, completed: true });
  await upsertResponse(p, bob, { answers: { q1: { optionIds: ["pizza"] }, q3: { rating: 3 } }, currentStep: 5, completed: true });
  await upsertResponse(p, carol, { answers: {}, currentStep: 1, completed: false });
  const d1 = await createDraw(p, await listResponses(p.id), { game: "raffle", source: "participants", winners: 2 }, owner);
  assert.equal(d1.entries.length, 2);
  assert.equal(new Set(d1.winners).size, 2);
  const d2 = await createDraw(p, await listResponses(p.id), { game: "spinner", source: "options", questionId: "q1", winners: 1 }, owner);
  const d3 = await createDraw(p, await listResponses(p.id), { game: "entries", source: "custom", entries: [{ label: "A", weight: 1 }], winners: 1 }, owner);
  assert.deepEqual((await listDraws(p.id)).map((d) => d.id), [d3.id, d2.id, d1.id]);

  const summary = (await listMyPolls(owner)).find((s) => s.id === p.id)!;
  assert.equal(summary.started, 3);
  assert.equal(summary.completed, 2);
  assert.equal(typeof summary.started, "number");
  assert.equal(summary.questionCount, 4);
  assert.equal((await listMyPolls(guest)).length, 0);

  const copy = await duplicatePoll((await getPollRaw(p.id))!, owner);
  assert.equal(copy.status, "draft");
  assert.notEqual(copy.slug, p.slug);
  assert.equal(copy.questions.length, 4);

  await deletePoll(p.id);
  assert.equal(await getPollRaw(p.id), null);
  assert.equal((await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM responses WHERE poll_id = $1", [p.id]))!.n, 0);
  assert.equal((await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM draws WHERE poll_id = $1", [p.id]))!.n, 0);
});

test("uploads round-trip through the database", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 255, 254, 0]);
  const name = await saveUpload(png, owner.id);
  assert.match(name, /^[a-f0-9]{32}\.png$/);
  const got = (await readUpload(name))!;
  assert.equal(got.contentType, "image/png");
  assert.deepEqual(Array.from(got.bytes), Array.from(png));
  assert.equal(await readUpload("0123456789abcdef0123456789abcdef.png"), null);
  await assert.rejects(saveUpload(new TextEncoder().encode("<svg/>")), status(400));
  await assert.rejects(saveUpload(new Uint8Array(3 * 1024 * 1024 + 1).fill(0xff)), status(400));
});
