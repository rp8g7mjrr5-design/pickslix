import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { checkPass, newKey, proRequired, redeemCode } from "./pro.ts";

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.LIFETIME_CODES;
  delete process.env.KV_REST_API_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
});

test("keys look like PSX-XXXX-XXXX-XXXX and don't repeat", () => {
  const keys = new Set(Array.from({ length: 200 }, newKey));
  assert.equal(keys.size, 200);
  for (const k of keys) assert.match(k, /^PSX(-[A-HJ-NP-Z2-9]{4}){3}$/);
});

test("nothing is locked until Stripe or lifetime codes are set up", () => {
  assert.equal(proRequired(), false);
  process.env.LIFETIME_CODES = "LIFE-AAAA-BBBB";
  assert.equal(proRequired(), true);
});

test("a lifetime code works once and gives a working lifetime key", async () => {
  process.env.LIFETIME_CODES = " life-test-0001 , LIFE-TEST-0002";
  assert.deepEqual(await redeemCode("NOPE"), { error: "That code isn't valid." });
  const first = await redeemCode("life-test-0001");
  assert.ok("key" in first);
  const pass = await checkPass(first.key.toLowerCase());
  assert.equal(pass?.plan, "lifetime");
  assert.deepEqual(await redeemCode("LIFE-TEST-0001"), { error: "That code has already been used." });
  assert.ok("key" in (await redeemCode("LIFE-TEST-0002")));
});

test("unknown or malformed keys aren't Pro", async () => {
  assert.equal(await checkPass(""), null);
  assert.equal(await checkPass("hello"), null);
  assert.equal(await checkPass(newKey()), null);
});
