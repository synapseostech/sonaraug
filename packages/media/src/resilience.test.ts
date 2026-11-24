import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTEMPTS_PER_ENDPOINT,
  BASE_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  advanceEndpoint,
  backoffDelayMs,
  orderEndpoints,
} from "./resilience.ts";
import { classifyFailure, describePlaybackError } from "./errors.ts";
import { endpoint } from "./fixtures.test-helpers.ts";
import type { PlaybackErrorCode } from "./types.ts";

test("backoff grows exponentially and is capped", () => {
  assert.equal(backoffDelayMs(0), BASE_RETRY_DELAY_MS);
  assert.equal(backoffDelayMs(1), BASE_RETRY_DELAY_MS * 2);
  assert.equal(backoffDelayMs(2), BASE_RETRY_DELAY_MS * 4);
  assert.equal(backoffDelayMs(50), MAX_RETRY_DELAY_MS);
  assert.equal(backoffDelayMs(-5), BASE_RETRY_DELAY_MS, "negative attempts must not produce sub-base delays");
});

test("endpoint failover keeps a healthy primary first and preserves order", () => {
  const ordered = orderEndpoints([
    endpoint({ id: "low", bitrateKbps: 64 }),
    endpoint({ id: "primary", bitrateKbps: 96, isPrimary: true }),
    endpoint({ id: "high", bitrateKbps: 192 }),
  ]);
  assert.deepEqual(ordered.map((e) => e.id), ["primary", "high", "low"]);
});

test("data saver prefers the lowest bitrate, ignoring the primary flag for ordering within reason", () => {
  const ordered = orderEndpoints(
    [
      endpoint({ id: "primary", bitrateKbps: 192, isPrimary: true }),
      endpoint({ id: "low", bitrateKbps: 48 }),
      endpoint({ id: "mid", bitrateKbps: 96 }),
    ],
    { dataSaver: true },
  );
  // Primary still leads (it is the station's canonical endpoint), then cheapest.
  assert.equal(ordered[0]?.id, "primary");
  assert.deepEqual(ordered.slice(1).map((e) => e.id), ["low", "mid"]);
});

test("endpoints without a known bitrate are never dropped", () => {
  const ordered = orderEndpoints([
    endpoint({ id: "unknown", bitrateKbps: null }),
    endpoint({ id: "known", bitrateKbps: 64, isPrimary: true }),
  ]);
  assert.equal(ordered.length, 2);
});

test("failover gives each endpoint a fixed number of attempts", () => {
  let progress = { endpointIndex: 0, attempt: 0, exhausted: false };
  for (let i = 1; i < ATTEMPTS_PER_ENDPOINT; i += 1) {
    progress = advanceEndpoint(progress.endpointIndex, progress.attempt, 2);
    assert.equal(progress.endpointIndex, 0);
  }
  progress = advanceEndpoint(progress.endpointIndex, progress.attempt, 2);
  assert.equal(progress.endpointIndex, 1);
  assert.equal(progress.attempt, 0);
  assert.equal(progress.exhausted, false);
});

test("failover reports exhaustion at the end of the list", () => {
  let progress = { endpointIndex: 0, attempt: 0, exhausted: false };
  for (let i = 0; i < 10; i += 1) progress = advanceEndpoint(progress.endpointIndex, progress.attempt, 1);
  assert.equal(progress.exhausted, true);
});

test("an empty endpoint list is exhausted immediately rather than looping", () => {
  assert.equal(advanceEndpoint(0, 0, 0).exhausted, true);
});

test("transport failures map onto the playback error vocabulary", () => {
  assert.equal(classifyFailure({ offline: true }), "network_unreachable");
  assert.equal(classifyFailure({ timedOut: true }), "network_unreachable");
  assert.equal(classifyFailure({ httpStatus: 404 }), "not_found");
  assert.equal(classifyFailure({ httpStatus: 410 }), "not_found");
  assert.equal(classifyFailure({ httpStatus: 403 }), "stream_rejected");
  assert.equal(classifyFailure({ httpStatus: 415 }), "unsupported_format");
  assert.equal(classifyFailure({ httpStatus: 503 }), "decode_failed");
  assert.equal(classifyFailure({}), "unknown");
});

test("every error code has user-facing copy and no technical leakage", () => {
  const codes: PlaybackErrorCode[] = [
    "network_unreachable",
    "stream_rejected",
    "unsupported_format",
    "decode_failed",
    "not_found",
    "geo_blocked",
    "unknown",
  ];
  for (const code of codes) {
    const error = describePlaybackError(code);
    assert.ok(error.message.length > 10, `${code} needs real copy`);
    assert.ok(!/\b(http|err_|code \d|undefined|null)\b/i.test(error.message), `${code} leaks technical detail`);
    assert.ok(error.message.endsWith("."), `${code} copy should be a sentence`);
  }
});

test("non-recoverable errors are not offered a retry", () => {
  assert.equal(describePlaybackError("not_found").recoverable, false);
  assert.equal(describePlaybackError("geo_blocked").recoverable, false);
  assert.equal(describePlaybackError("network_unreachable").recoverable, true);
});
