import { test } from "node:test";
import assert from "node:assert/strict";
import { alice, bob, carol, poll, response } from "./_helpers.ts";
import { buildEntries, parseDrawInput, pickWinners } from "../lib/server/draws.ts";
import { HttpError } from "../lib/server/errors.ts";

const is400 = (e: unknown) => e instanceof HttpError && e.status === 400;

test("pickWinners never repeats and clamps to entry count", () => {
  const entries = Array.from({ length: 10 }, (_, i) => ({ label: `E${i}`, weight: (i % 3) + 1 }));
  for (let k = 0; k < 200; k++) {
    const w = pickWinners(entries, 10);
    assert.equal(w.length, 10);
    assert.equal(new Set(w).size, 10);
  }
  assert.equal(pickWinners(entries, 99).length, 10);
  assert.equal(pickWinners(entries, 0).length, 1);
});

test("pickWinners maps tickets to entries by weight (deterministic)", () => {
  const entries = [{ label: "a", weight: 1 }, { label: "b", weight: 3 }, { label: "c", weight: 2 }];
  // tickets: a=[0], b=[1,2,3], c=[4,5]
  assert.deepEqual(pickWinners(entries, 1, () => 0), [0]);
  assert.deepEqual(pickWinners(entries, 1, () => 3), [1]);
  assert.deepEqual(pickWinners(entries, 1, () => 5), [2]);
  // after removing b (total 3: a=[0], c=[1,2]) ticket 1 -> c
  let calls = 0;
  assert.deepEqual(pickWinners(entries, 2, (max) => (calls++ === 0 ? 2 : (assert.equal(max, 3), 1))), [1, 2]);
});

test("pickWinners is weighted (statistical)", () => {
  const entries = [{ label: "light", weight: 1 }, { label: "heavy", weight: 9 }];
  let heavy = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (pickWinners(entries, 1)[0] === 1) heavy++;
  const ratio = heavy / N;
  assert.ok(ratio > 0.87 && ratio < 0.93, `heavy ratio ${ratio}`);
});

test("participants: completed only, bonus tickets for suggestions, anonymous labels", () => {
  const p = poll();
  p.questions[0].options.push({ id: "s1", label: "Ramen", suggestedBy: { userId: bob.id, name: bob.name } });
  p.questions[0].options.push({ id: "s2", label: "Curry", suggestedBy: { userId: bob.id, name: bob.name } });
  const rs = [response(alice, {}), response(bob, {}), response(carol, {}, { completed: false, completedAt: null })];
  const plain = buildEntries(p, rs, { game: "raffle", source: "participants", winners: 1 });
  assert.deepEqual(plain, [{ label: "ALICE", weight: 1 }, { label: "BOB", weight: 1 }]);
  const bonus = buildEntries(p, rs, { game: "raffle", source: "participants", winners: 1, bonusForSuggestions: true });
  assert.deepEqual(bonus, [{ label: "ALICE", weight: 1 }, { label: "BOB", weight: 3 }]);
  const anon = buildEntries({ ...p, settings: { ...p.settings, anonymous: true } }, rs, { game: "raffle", source: "participants", winners: 1 });
  assert.deepEqual(anon.map((e) => e.label), ["Voter #1", "Voter #2"]);
});

test("options: weight = votes, min 1; requires a choice question", () => {
  const rs = [response(alice, { q1: { optionIds: ["pizza"] } }), response(bob, { q1: { optionIds: ["pizza"] } })];
  const e = buildEntries(poll(), rs, { game: "spinner", source: "options", questionId: "q1", winners: 1 });
  assert.deepEqual(e, [{ label: "Pizza", weight: 2 }, { label: "Sushi", weight: 1 }, { label: "Tacos", weight: 1 }]);
  assert.throws(() => buildEntries(poll(), rs, { game: "spinner", source: "options", questionId: "q3", winners: 1 }), is400);
  assert.throws(() => buildEntries(poll(), rs, { game: "spinner", source: "options", winners: 1 }), is400);
});

test("custom: trimmed, empties dropped, weights clamped, max 500", () => {
  const e = buildEntries(poll(), [], {
    game: "entries", source: "custom", winners: 1,
    entries: [{ label: "  A  ", weight: 0 }, { label: "", weight: 5 }, { label: "B", weight: 1000 }, { label: "C", weight: 2.7 }],
  });
  assert.deepEqual(e, [{ label: "A", weight: 1 }, { label: "B", weight: 100 }, { label: "C", weight: 2 }]);
  const many = Array.from({ length: 501 }, (_, i) => ({ label: `x${i}`, weight: 1 }));
  assert.throws(() => buildEntries(poll(), [], { game: "entries", source: "custom", winners: 1, entries: many }), is400);
  assert.throws(() => buildEntries(poll(), [], { game: "entries", source: "custom", winners: 1, entries: [] }), is400);
});

test("draw input validation", () => {
  assert.throws(() => parseDrawInput({ game: "dice", source: "custom", winners: 1 }), is400);
  assert.throws(() => parseDrawInput({ game: "spinner", source: "everyone", winners: 1 }), is400);
  assert.throws(() => parseDrawInput({ game: "spinner", source: "custom", winners: 0 }), is400);
  assert.equal(parseDrawInput({ game: "spinner", source: "custom" }).winners, 1);
});
