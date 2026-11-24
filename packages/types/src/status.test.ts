import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlayableStream, isPubliclyVisible, PLAYABLE_STREAM_STATUSES } from "./status.ts";
import type { StreamStatus } from "./status.ts";

test("only published, public content is visible to listeners", () => {
  assert.equal(isPubliclyVisible("published"), true);
  assert.equal(isPubliclyVisible("published", "public"), true);
  assert.equal(isPubliclyVisible("published", "unlisted"), false);
  assert.equal(isPubliclyVisible("published", "private"), false);
  for (const status of ["draft", "pending_review", "scheduled", "unpublished", "blocked", "removed", "archived"] as const) {
    assert.equal(isPubliclyVisible(status), false, `${status} must never be public`);
  }
});

test("only verified-playable streams reach listeners", () => {
  assert.equal(isPlayableStream("playable"), true);
  assert.equal(isPlayableStream("degraded"), true);
  for (const status of ["registered", "verified", "reachable", "failed", "revoked"] as const) {
    assert.equal(isPlayableStream(status), false, `${status} must not be served`);
  }
});

test("registered-but-unverified streams are excluded from the playable set", () => {
  const statuses: StreamStatus[] = ["registered", "verified", "reachable", "playable"];
  assert.deepEqual(statuses.filter(isPlayableStream), ["playable"]);
  assert.ok(!PLAYABLE_STREAM_STATUSES.includes("registered"));
});
