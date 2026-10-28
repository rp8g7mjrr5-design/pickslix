import { test } from "node:test";
import assert from "node:assert/strict";
import { extendUntil } from "./pro.ts";
import { MAX_REWARDS, referralProblem } from "./referrals.ts";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const ok = { userId: "new", referrerId: "friend", createdAt: NOW - 3600_000, alreadyReferred: false, rewards: 0, now: NOW };

test("referralProblem lets a brand-new account claim a friend's invite", () => {
  assert.equal(referralProblem(ok), null);
});

test("referralProblem turns away self-invites, repeats, old accounts, dead links and maxed-out inviters", () => {
  assert.match(referralProblem({ ...ok, referrerId: null })!, /isn't valid/);
  assert.match(referralProblem({ ...ok, referrerId: "new" })!, /yourself/);
  assert.match(referralProblem({ ...ok, alreadyReferred: true })!, /already/);
  assert.match(referralProblem({ ...ok, createdAt: NOW - 5 * 86400_000 })!, /new accounts/);
  assert.match(referralProblem({ ...ok, rewards: MAX_REWARDS })!, /most times/);
});

test("extendUntil stacks on a running trial and restarts an expired one", () => {
  assert.equal(extendUntil(undefined, 7, NOW), "2026-11-04T12:00:00.000Z");
  assert.equal(extendUntil("2026-10-30T12:00:00.000Z", 7, NOW), "2026-11-06T12:00:00.000Z");
  assert.equal(extendUntil("2026-10-01T00:00:00.000Z", 7, NOW), "2026-11-04T12:00:00.000Z");
});
