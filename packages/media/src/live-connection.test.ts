import assert from "node:assert/strict";
import test from "node:test";
import { classifyMediaError, formatSupport } from "./live-connection.ts";
import { describePlaybackError } from "./errors.ts";
import { backoffDelayMs, MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS } from "./resilience.ts";

/* Error classification ----------------------------------------------------- */

test("a network-level media failure is treated as recoverable, not unsupported", () => {
  assert.equal(classifyMediaError(2), "network_unreachable");
  assert.equal(describePlaybackError(classifyMediaError(2)).recoverable, true);
});

test("being offline outranks whatever the media element reports", () => {
  // A stream that fails while the device is offline must say "check your
  // connection", never "this format is unsupported".
  assert.equal(classifyMediaError(4, { online: false }), "network_unreachable");
  assert.equal(classifyMediaError(null, { online: false }), "network_unreachable");
});

test("an undecodable payload is a decode failure", () => {
  assert.equal(classifyMediaError(3), "decode_failed");
});

test("SRC_NOT_SUPPORTED reports a rejected stream so the listener can retry", () => {
  // Browsers collapse CORS blocks, 404s and HTML error pages into code 4. It is
  // more honest to offer a retry than to declare the station unsupported.
  assert.equal(classifyMediaError(4), "stream_rejected");
  assert.equal(describePlaybackError(classifyMediaError(4)).recoverable, true);
});

test("an aborted load never surfaces as a decode error to the listener", () => {
  assert.equal(classifyMediaError(1), "network_unreachable");
  assert.equal(classifyMediaError(undefined), "unknown");
  assert.equal(classifyMediaError(99), "unknown");
});

/* Format support ----------------------------------------------------------- */

test("mp3 is playable wherever the browser says it probably can", () => {
  const support = formatSupport("mp3", () => "probably");
  assert.equal(support.supported, true);
  assert.equal(support.needsLibrary, false);
  assert.equal(support.mimeType, "audio/mpeg");
});

test("hls on a browser with native support needs no library", () => {
  // Chrome 158 and Safari answer "maybe" for application/vnd.apple.mpegurl.
  const support = formatSupport("hls", () => "maybe");
  assert.equal(support.supported, true);
  assert.equal(support.needsLibrary, false);
});

test("hls on a browser without native support is flagged as needing a library", () => {
  // Older Chrome and Firefox answer "" — the UI must not pretend it will work.
  const support = formatSupport("hls", () => "");
  assert.equal(support.supported, false);
  assert.equal(support.needsLibrary, true);
  assert.equal(support.mimeType, "application/vnd.apple.mpegurl");
});

test("format probing is case and whitespace insensitive", () => {
  assert.equal(formatSupport("aac", () => "  ProBably ").confidence, "probably");
  assert.equal(formatSupport("aac", () => "MAYBE").confidence, "maybe");
  assert.equal(formatSupport("aac", () => "").confidence, "no");
});

/* Retry policy that the web host consumes -------------------------------- */

test("live retry delays grow from a sub-second first attempt and stay capped", () => {
  assert.equal(backoffDelayMs(0), BASE_RETRY_DELAY_MS);
  assert.ok(backoffDelayMs(1) > backoffDelayMs(0));
  assert.equal(backoffDelayMs(20), MAX_RETRY_DELAY_MS);
  assert.ok(backoffDelayMs(-5) >= BASE_RETRY_DELAY_MS, "negative attempts must not produce a zero delay");
});
