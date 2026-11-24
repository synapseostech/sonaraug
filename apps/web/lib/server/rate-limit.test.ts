/**
 * Rate-limit accounting (N-6). The dev limiter is in-memory and per process;
 * these tests pin the window behaviour, not a distributed guarantee.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, memoryHit, type Bucket } from "./rate-limit-core.ts";

const bucket: Bucket = { name: "login:account", max: 3, windowSeconds: 900 };
const START = Date.parse("2026-11-23T12:00:00.000Z");

test("the first hit opens the window and counts it", () => {
  const store = new Map();
  assert.equal(memoryHit(store, "k", bucket, START), true);
  assert.deepEqual(store.get("k"), { start: START, hits: 1 });
});

test("hits are refused once the maximum is reached inside the window", () => {
  const store = new Map();
  const results = [0, 1, 2, 3].map((offset) => memoryHit(store, "k", bucket, START + offset));
  assert.deepEqual(results, [true, true, true, false]);
  assert.equal(store.get("k")?.hits, 4);
});

test("the window resets after it elapses", () => {
  const store = new Map();
  for (let i = 0; i < 4; i += 1) memoryHit(store, "k", bucket, START + i);
  assert.equal(memoryHit(store, "k", bucket, START + bucket.windowSeconds * 1000), true);
  assert.equal(store.get("k")?.hits, 1);
});

test("buckets are independent and keys are per subject", () => {
  const store = new Map();
  // Callers namespace the key with the bucket name (see allow() in rate-limit.ts).
  const key = (name: string, subject: string) => `${name}:${subject}`;
  memoryHit(store, key(bucket.name, "a"), bucket, START);
  memoryHit(store, key(bucket.name, "a"), bucket, START + 1);
  memoryHit(store, key(bucket.name, "a"), bucket, START + 2);
  assert.equal(memoryHit(store, key(bucket.name, "a"), bucket, START + 3), false);
  assert.equal(memoryHit(store, key(bucket.name, "b"), bucket, START + 3), true);
  assert.equal(memoryHit(store, key("reset:account", "a"), bucket, START + 3), true);
});

test("the auth buckets are stricter than a human needs and stricter than an attacker likes", () => {
  assert.equal(LIMITS.loginPerAccount.max, 10);
  assert.equal(LIMITS.loginPerAccount.windowSeconds, 900);
  assert.ok(LIMITS.registerPerAccount.max <= 3);
  assert.ok(LIMITS.resetPerAccount.max <= 3);
  assert.ok(LIMITS.checkoutPerUser.windowSeconds <= 600);
  // Hashed names carry no PII by themselves.
  for (const bucket of Object.values(LIMITS)) assert.match(bucket.name, /^[a-z]+:[a-z]+$/);
});
