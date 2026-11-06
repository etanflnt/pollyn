import { test } from "node:test";
import assert from "node:assert/strict";
import { owner, poll, alice } from "./_helpers.ts";
import {
  DEFAULT_SETTINGS, applyPollInput, blankPoll, sanitizeMedia, sanitizeQuestions, sanitizeSettings, validateForPublish,
} from "../lib/server/polls.ts";
import { applyResponseInput, sanitizeAnswers } from "../lib/server/responses.ts";
import { HttpError } from "../lib/server/errors.ts";

const is400 = (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === "bad_request";

test("create defaults: draft, untitled, default settings, owner tenant", () => {
  const p = applyPollInput(blankPoll(owner), { title: "   " }, { create: true });
  assert.equal(p.title, "Untitled poll");
  assert.equal(p.status, "draft");
  assert.deepEqual(p.settings, DEFAULT_SETTINGS);
  assert.equal(p.tenantId, owner.tenantId);
  assert.equal(p.ownerId, owner.id);
});

test("text is trimmed, collapsed and capped", () => {
  const p = applyPollInput(blankPoll(owner), { title: "  Hi\u0000  there ".padEnd(500, "x"), description: " a\r\nb " }, { create: true });
  assert.equal(p.title.length, 200);
  assert.ok(p.title.startsWith("Hi there"));
  assert.equal(p.description, "a\nb");
});

test("question and option count caps", () => {
  const q = (i: number) => ({ id: `q${i}`, type: "text", title: "t", required: false, options: [], allowSuggestions: false });
  assert.throws(() => sanitizeQuestions(Array.from({ length: 51 }, (_, i) => q(i))), is400);
  assert.equal(sanitizeQuestions(Array.from({ length: 50 }, (_, i) => q(i))).length, 50);
  const opts = Array.from({ length: 31 }, (_, i) => ({ id: `o${i}`, label: `O${i}` }));
  assert.throws(() => sanitizeQuestions([{ id: "q", type: "single", title: "x", options: opts }]), is400);
});

test("question types, maxChoices, suggestions only for choice questions", () => {
  assert.throws(() => sanitizeQuestions([{ id: "q", type: "essay", title: "x" }]), is400);
  assert.throws(() => sanitizeQuestions([{ id: "q", type: "multiple", title: "x", options: [], maxChoices: 0 }]), is400);
  const [m, r, s] = sanitizeQuestions([
    { id: "m", type: "multiple", title: "x", options: [{ id: "a", label: "A" }], maxChoices: 2, allowSuggestions: true },
    { id: "r", type: "rating", title: "x", options: [{ id: "a", label: "A" }], maxChoices: 3, allowSuggestions: true },
    { id: "s", type: "single", title: "x", options: [], maxChoices: 3 },
  ]);
  assert.equal(m.maxChoices, 2);
  assert.equal(m.allowSuggestions, true);
  assert.deepEqual(r.options, []);
  assert.equal(r.maxChoices, null);
  assert.equal(r.allowSuggestions, false);
  assert.equal(s.maxChoices, null);
});

test("bad or duplicate ids are replaced", () => {
  const qs = sanitizeQuestions([
    { id: "../evil", type: "text", title: "a" },
    { id: "same", type: "single", title: "b", options: [{ id: "x", label: "1" }, { id: "x", label: "2" }] },
    { id: "same", type: "text", title: "c" },
  ]);
  assert.notEqual(qs[0].id, "../evil");
  assert.notEqual(qs[1].id, qs[2].id);
  assert.notEqual(qs[1].options[0].id, qs[1].options[1].id);
});

test("suggestedBy is server-owned: forged values dropped, existing kept, missing suggestions preserved", () => {
  const existing = sanitizeQuestions([{ id: "q", type: "single", title: "x", allowSuggestions: true, options: [{ id: "a", label: "A" }] }]);
  existing[0].options.push({ id: "s1", label: "Ramen", suggestedBy: { userId: alice.id, name: alice.name } });
  const next = sanitizeQuestions(
    [{ id: "q", type: "single", title: "x", allowSuggestions: true, options: [{ id: "a", label: "A", suggestedBy: { userId: "hacker", name: "H" } }] }],
    existing,
  );
  assert.equal(next[0].options[0].suggestedBy, null);
  assert.equal(next[0].options.length, 2, "stale builder payload must not drop voter suggestions");
  assert.deepEqual(next[0].options[1].suggestedBy, { userId: alice.id, name: alice.name });
});

test("media validation", () => {
  assert.throws(() => sanitizeMedia({ kind: "image", url: "javascript:alert(1)" }, true, "x"), is400);
  assert.throws(() => sanitizeMedia({ kind: "video", url: "https://youtu.be/x" }, false, "x"), is400);
  assert.throws(() => sanitizeMedia({ kind: "image", url: "/api/uploads/../../etc/passwd" }, true, "x"), is400);
  assert.deepEqual(sanitizeMedia({ kind: "image", url: "/api/uploads/0123456789abcdef0123456789abcdef.png", alt: " a " }, true, "x"),
    { kind: "image", url: "/api/uploads/0123456789abcdef0123456789abcdef.png", alt: "a" });
  assert.equal(sanitizeMedia(null, true, "x"), null);
});

test("settings are validated and merged shallowly", () => {
  const s = sanitizeSettings({ access: "public", closesAt: "2030-01-01T10:00:00Z" }, { ...DEFAULT_SETTINGS, theme: "mint" });
  assert.equal(s.access, "public");
  assert.equal(s.theme, "mint");
  assert.equal(s.closesAt, "2030-01-01T10:00:00.000Z");
  assert.throws(() => sanitizeSettings({ access: "world" }, DEFAULT_SETTINGS), is400);
  assert.throws(() => sanitizeSettings({ anonymous: "yes" }, DEFAULT_SETTINGS), is400);
  assert.throws(() => sanitizeSettings({ closesAt: "soon" }, DEFAULT_SETTINGS), is400);
  assert.equal(sanitizeSettings({ closesAt: null }, s).closesAt, null);
});

test("publishing requires title, questions, titled questions and non-empty options", () => {
  assert.throws(() => validateForPublish({ title: "", questions: poll().questions }), is400);
  assert.throws(() => validateForPublish({ title: "x", questions: [] }), is400);
  const qs = poll().questions;
  qs[0].options[0].label = "";
  assert.throws(() => validateForPublish({ title: "x", questions: qs }), is400);
  validateForPublish({ title: "x", questions: poll().questions });
  // drafts can be autosaved incomplete; opening checks the rules
  const draft = applyPollInput(blankPoll(owner), { title: "", questions: [] }, { create: true });
  assert.throws(() => applyPollInput(draft, { status: "open" }, { create: false }), is400);
});

test("answers: option ids, single/multiple limits, rating range, text", () => {
  const p = poll();
  // removed/unknown option ids are dropped silently (owner may edit a live poll)
  assert.deepEqual(sanitizeAnswers(p, { q1: { optionIds: ["nope", "pizza"] } }), { q1: { optionIds: ["pizza"] } });
  assert.throws(() => sanitizeAnswers(p, { q1: { optionIds: ["pizza", "sushi"] } }), is400);
  assert.throws(() => sanitizeAnswers(p, { q2: { optionIds: ["tea", "coffee", "juice"] } }), is400);
  for (const bad of [0, 6, 3.5, "5"]) assert.throws(() => sanitizeAnswers(p, { q3: { rating: bad } }), is400);
  const a = sanitizeAnswers(p, {
    q1: { optionIds: ["pizza"] }, q2: { optionIds: ["tea", "tea"] }, q3: { rating: 4 }, q4: { text: "  yum  " }, zzz: { text: "x" },
  });
  assert.deepEqual(a, { q1: { optionIds: ["pizza"] }, q2: { optionIds: ["tea"] }, q3: { rating: 4 }, q4: { text: "yum" } });
  assert.deepEqual(sanitizeAnswers(p, { q1: { optionIds: [] }, q4: { text: "   " } }), {});
});

test("responses: required on completion, completion is sticky, step clamped", () => {
  const p = poll();
  assert.throws(() => applyResponseInput(p, alice, null, { answers: { q1: { optionIds: ["pizza"] } }, currentStep: 9, completed: true }), is400);
  const partial = applyResponseInput(p, alice, null, { answers: { q1: { optionIds: ["pizza"] } }, currentStep: 99, completed: false });
  assert.equal(partial.completed, false);
  assert.equal(partial.currentStep, p.questions.length + 1);
  const done = applyResponseInput(p, alice, partial, { answers: { q1: { optionIds: ["pizza"] }, q3: { rating: 5 } }, currentStep: 5, completed: true });
  assert.equal(done.completed, true);
  assert.ok(done.completedAt);
  assert.equal(done.id, partial.id);
  const edited = applyResponseInput(p, alice, done, { answers: { q1: { optionIds: ["sushi"] }, q3: { rating: 2 } }, currentStep: 1, completed: false });
  assert.equal(edited.completed, true, "a submitted response stays submitted");
  assert.equal(edited.completedAt, done.completedAt);
  assert.throws(() => applyResponseInput(p, alice, done, { answers: { q1: { optionIds: ["sushi"] } }, currentStep: 1, completed: false }), is400);
});
