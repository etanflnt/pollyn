import { test } from "node:test";
import assert from "node:assert/strict";
import { alice, bob, carol, poll, response } from "./_helpers.ts";
import { computeResults } from "../lib/server/results.ts";

function sample() {
  return [
    response(alice, { q1: { optionIds: ["pizza"] }, q2: { optionIds: ["tea", "coffee"] }, q3: { rating: 5 }, q4: { text: "More pizza" } }),
    response(bob, { q1: { optionIds: ["pizza"] }, q2: { optionIds: ["tea"] }, q3: { rating: 2 } }),
    response(carol, { q1: { optionIds: ["sushi"] } }, { completed: false, completedAt: null, currentStep: 2 }),
  ];
}

test("tallies completed responses, ratings and texts", () => {
  const r = computeResults(poll(), sample(), { isOwner: true });
  assert.equal(r.started, 3);
  assert.equal(r.completed, 2);
  const [q1, q2, q3, q4] = r.questions;
  assert.deepEqual(q1.options.map((o) => [o.optionId, o.count]), [["pizza", 2], ["sushi", 0], ["tacos", 0]]);
  assert.equal(q1.answered, 2);
  assert.deepEqual(q2.options.map((o) => o.count), [2, 1, 0]);
  assert.equal(q3.ratingAverage, 3.5);
  assert.deepEqual(q3.ratingDistribution, [0, 1, 0, 0, 1]);
  assert.deepEqual(q4.texts?.map((t) => t.text), ["More pizza"]);
  assert.equal(q1.ratingAverage, null);
  assert.equal(q1.texts, null);
  assert.deepEqual(q3.options, []);
});

test("dropOff is owner-only and counts unfinished responses by step", () => {
  const owner = computeResults(poll(), sample(), { isOwner: true });
  assert.deepEqual(owner.dropOff, [0, 0, 1, 0, 0, 0]);
  assert.equal(computeResults(poll({}, { resultsVisibility: "always" }), sample(), { isOwner: false }).dropOff, null);
});

test("names: owner sees names, voters only with showVoterNames, nobody when anonymous", () => {
  const ownerView = computeResults(poll(), sample(), { isOwner: true });
  assert.deepEqual(ownerView.questions[0].options[0].voters, ["ALICE", "BOB"]);
  assert.equal(ownerView.questions[3].texts?.[0].name, "ALICE");

  const voterHidden = computeResults(poll({}, { showVoterNames: false }), sample(), { isOwner: false });
  assert.equal(voterHidden.questions[0].options[0].voters, null);
  assert.equal(voterHidden.questions[3].texts?.[0].name, null);

  const voterShown = computeResults(poll({}, { showVoterNames: true }), sample(), { isOwner: false });
  assert.deepEqual(voterShown.questions[0].options[0].voters, ["ALICE", "BOB"]);

  for (const isOwner of [true, false]) {
    const anon = computeResults(poll({}, { anonymous: true, showVoterNames: true }), sample(), { isOwner });
    assert.equal(anon.questions[0].options[0].voters, null);
    assert.equal(anon.questions[3].texts?.[0].name, null);
  }
});

test("showVoteCounts=false hides started/completed from voters but keeps option counts", () => {
  const r = computeResults(poll({}, { showVoteCounts: false }), sample(), { isOwner: false });
  assert.equal(r.started, 0);
  assert.equal(r.completed, 0);
  assert.equal(r.questions[0].options[0].count, 2);
  const o = computeResults(poll({}, { showVoteCounts: false }), sample(), { isOwner: true });
  assert.equal(o.started, 3);
});

test("answers for deleted options are ignored", () => {
  const p = poll();
  p.questions[0].options = p.questions[0].options.filter((o) => o.id !== "pizza");
  const r = computeResults(p, sample(), { isOwner: true });
  assert.equal(r.questions[0].answered, 0);
  assert.equal(r.questions[0].options.length, 2);
});
