import { test } from "node:test";
import assert from "node:assert/strict";
import { alice, guest, outsider, owner, poll, response } from "./_helpers.ts";
import { assertCanView, assertCanVote, assertOwner, canSeeResults, effectiveStatus } from "../lib/server/polls.ts";
import { HttpError } from "../lib/server/errors.ts";

const err = (status: number, code: string) => (e: unknown) => e instanceof HttpError && e.status === status && e.code === code;

test("no session -> 401 for every poll", () => {
  assert.throws(() => assertCanView(poll(), null), err(401, "unauthenticated"));
  assert.throws(() => assertCanView(poll({}, { access: "public" }), null), err(401, "unauthenticated"));
});

test("org poll: same tenant ok, other tenant and guests -> 403 wrong_tenant", () => {
  const p = poll();
  assertCanView(p, alice);
  assertCanVote(p, alice);
  assert.throws(() => assertCanView(p, outsider), err(403, "wrong_tenant"));
  assert.throws(() => assertCanView(p, guest), err(403, "wrong_tenant"));
});

test("public poll: guests and other tenants may vote", () => {
  const p = poll({}, { access: "public" });
  assertCanVote(p, guest);
  assertCanVote(p, outsider);
});

test("draft: owner only, 404 for others, nobody can vote", () => {
  const p = poll({ status: "draft" }, { access: "public" });
  assertCanView(p, owner);
  assert.throws(() => assertCanView(p, alice), err(404, "not_found"));
  assert.throws(() => assertCanVote(p, owner), err(409, "closed"));
  assert.throws(() => assertOwner(p, alice), err(404, "not_found"));
});

test("closed and past closesAt: readable but voting -> 409 closed", () => {
  const closedPoll = poll({ status: "closed" });
  assertCanView(closedPoll, alice);
  assert.throws(() => assertCanVote(closedPoll, alice), err(409, "closed"));

  const expired = poll({}, { closesAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(effectiveStatus(expired), "closed");
  assert.throws(() => assertCanVote(expired, alice), err(409, "closed"));

  const future = poll({}, { closesAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(effectiveStatus(future), "open");
  assertCanVote(future, alice);
});

test("owner bypasses tenant checks; non-owner management -> 403", () => {
  const p = poll({ tenantId: "other" });
  assertCanView(p, owner);
  assertOwner(p, owner);
  assert.throws(() => assertOwner(poll(), alice), err(403, "forbidden"));
  assert.throws(() => assertOwner(poll(), null), err(401, "unauthenticated"));
});

test("canSeeResults by visibility", () => {
  const done = response(alice, {}, { completed: true });
  const partial = response(alice, {}, { completed: false });
  assert.equal(canSeeResults(poll({}, { resultsVisibility: "owner_only" }), owner, null), true);
  assert.equal(canSeeResults(poll({}, { resultsVisibility: "owner_only" }), alice, done), false);
  assert.equal(canSeeResults(poll({}, { resultsVisibility: "always" }), alice, null), true);
  assert.equal(canSeeResults(poll({}, { resultsVisibility: "after_vote" }), alice, partial), false);
  assert.equal(canSeeResults(poll({}, { resultsVisibility: "after_vote" }), alice, done), true);
  assert.equal(canSeeResults(poll({}, { resultsVisibility: "after_close" }), alice, done), false);
  assert.equal(canSeeResults(poll({ status: "closed" }, { resultsVisibility: "after_close" }), alice, null), true);
  assert.equal(
    canSeeResults(poll({}, { resultsVisibility: "after_close", closesAt: "2000-01-01T00:00:00Z" }), alice, null), true);
});
