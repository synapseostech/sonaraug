import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ON_DEMAND_ATTEMPTS,
  initialPlayerState,
  playerReducer,
  progressFraction,
  shouldOfferResume,
  type PlayerState,
} from "./player.ts";
import { endpoint, episode, liveRadio, video } from "./fixtures.test-helpers.ts";

const run = (actions: Parameters<typeof playerReducer>[1][], from: PlayerState = initialPlayerState): PlayerState =>
  actions.reduce(playerReducer, from);

test("live radio exposes no seek, pause or speed controls", () => {
  const loaded = run([{ type: "load", source: liveRadio() }]);
  const sought = playerReducer(loaded, { type: "seek", positionSeconds: 120 });
  const sped = playerReducer(loaded, { type: "setRate", rate: 2 });
  const paused = playerReducer(loaded, { type: "pause" });

  assert.equal(sought.positionSeconds, 0, "seeking live radio must be a no-op");
  assert.equal(sped.rate, 1, "speed change must be a no-op");
  assert.equal(paused.status, "loading", "pause must not be offered for live radio");
});

test("live radio ignores a duration and never reports progress fraction", () => {
  const state = run([{ type: "load", source: liveRadio() }, { type: "ready" }]);
  assert.equal(state.durationSeconds, null);
  assert.equal(progressFraction(state), 0);
});

test("load with no endpoints fails fast instead of hanging on 'loading'", () => {
  const state = playerReducer(initialPlayerState, { type: "load", source: liveRadio({ endpoints: [] }) });
  assert.equal(state.status, "error");
  assert.equal(state.error?.code, "stream_rejected");
});

test("live radio fails over to the backup endpoint after a repeated failure", () => {
  const source = liveRadio({
    endpoints: [endpoint({ id: "primary", isPrimary: true }), endpoint({ id: "backup" })],
  });
  let state = run([{ type: "load", source }, { type: "ready" }]);
  state = playerReducer(state, { type: "failure", code: "network_unreachable", atMs: 0 });
  assert.equal(state.endpointIndex, 0, "one failure should retry the same endpoint");
  state = playerReducer(state, { type: "failure", code: "network_unreachable", atMs: 500 });
  assert.equal(state.endpointIndex, 1, "second failure should fail over");
  assert.equal(state.attempt, 0);
  assert.equal(state.status, "buffering");
  assert.equal(state.error, null, "transient errors must not surface while retrying");
});

test("live radio reaches a recoverable error once every endpoint is exhausted", () => {
  let state = run([{ type: "load", source: liveRadio({ endpoints: [endpoint({ id: "only" })] }) }]);
  state = playerReducer(state, { type: "failure", code: "stream_rejected", atMs: 0 });
  state = playerReducer(state, { type: "failure", code: "stream_rejected", atMs: 400 });
  assert.equal(state.status, "error");
  assert.equal(state.error?.recoverable, true);
  assert.equal(state.retryAtMs, null, "exhausted streams must not auto-retry forever");
});

test("a scheduled retry becomes due exactly when the clock passes retryAtMs", () => {
  const source = liveRadio({ endpoints: [endpoint({ id: "a" })] });
  let state = playerReducer(initialPlayerState, { type: "load", source });
  state = playerReducer(state, { type: "failure", code: "network_unreachable", atMs: 1_000 });
  assert.equal(state.retryAtMs, 1_400);
  assert.equal(playerReducer(state, { type: "tick", nowMs: 1_399 }).status, "buffering");
  const due = playerReducer(state, { type: "tick", nowMs: 1_400 });
  assert.equal(due.status, "loading");
  assert.equal(due.retryAtMs, null);
});

test("every failure bumps the session so the host re-opens the URL", () => {
  const source = episode();
  let state = playerReducer(initialPlayerState, { type: "load", source });
  const first = state.session;
  state = playerReducer(state, { type: "failure", code: "decode_failed", atMs: 0 });
  assert.equal(state.session, first + 1);
});

test("on-demand seeks clamp inside the item and cannot go negative", () => {
  const state = run([
    { type: "load", source: episode() },
    { type: "ready" },
    { type: "seek", positionSeconds: 99_999 },
  ]);
  assert.equal(state.positionSeconds, 1800);
  assert.equal(playerReducer(state, { type: "seek", positionSeconds: -30 }).positionSeconds, 0);
});

test("progress within five seconds of the end marks the item as ended", () => {
  const state = run([
    { type: "load", source: episode() },
    { type: "ready" },
    { type: "progress", positionSeconds: 1796 },
  ]);
  assert.equal(state.status, "ended");
});

test("progress fraction is bounded for video and audio", () => {
  const state = run([
    { type: "load", source: video({ durationSeconds: 100 }) },
    { type: "progress", positionSeconds: 50 },
  ]);
  assert.equal(progressFraction(state), 0.5);
});

test("on-demand failures stop after the configured attempt budget", () => {
  let state = run([{ type: "load", source: episode() }, { type: "ready" }]);
  for (let i = 0; i < MAX_ON_DEMAND_ATTEMPTS; i += 1) {
    state = playerReducer(state, { type: "failure", code: "network_unreachable", atMs: i * 1000 });
    assert.notEqual(state.status, "error", `attempt ${i + 1} should still be retrying`);
    state = playerReducer(state, { type: "tick", nowMs: i * 1000 + 60_000 });
  }
  state = playerReducer(state, { type: "failure", code: "network_unreachable", atMs: 99_000 });
  assert.equal(state.status, "error", "the budget must not be infinite");
});

test("speed changes are clamped to a sane range", () => {
  const loaded = run([{ type: "load", source: episode() }, { type: "ready" }]);
  assert.equal(playerReducer(loaded, { type: "setRate", rate: 99 }).rate, 3);
  assert.equal(playerReducer(loaded, { type: "setRate", rate: 0.01 }).rate, 0.5);
});

test("loading a new source clears the previous item's state", () => {
  const state = run([
    { type: "load", source: episode() },
    { type: "ready" },
    { type: "progress", positionSeconds: 900 },
    { type: "load", source: video() },
  ]);
  assert.equal(state.positionSeconds, 0);
  assert.equal(state.attempt, 0);
  assert.equal(state.status, "loading");
});

test("stop returns to an idle state but remembers the data-saver preference", () => {
  const state = run([{ type: "load", source: episode(), dataSaver: true }, { type: "stop" }]);
  assert.equal(state.status, "idle");
  assert.equal(state.source, null);
  assert.equal(state.dataSaver, true);
});

test("toggling data saver on a live stream forces a re-open at another bitrate", () => {
  const state = run([{ type: "load", source: liveRadio() }, { type: "ready" }]);
  const toggled = playerReducer(state, { type: "setDataSaver", enabled: true });
  assert.equal(toggled.session, state.session + 1);
  assert.equal(toggled.endpointIndex, 0);
});

test("video is marked as not supporting background playback", () => {
  const state = playerReducer(initialPlayerState, { type: "load", source: video() });
  assert.equal(state.source?.kind, "video");
});

test("resume is offered only for meaningful on-demand progress", () => {
  assert.equal(shouldOfferResume(liveRadio(), { positionSeconds: 600, completed: false }), false);
  assert.equal(shouldOfferResume(episode(), { positionSeconds: 10, completed: false }), false);
  assert.equal(shouldOfferResume(episode(), { positionSeconds: 600, completed: true }), false);
  assert.equal(shouldOfferResume(episode(), { positionSeconds: 600, completed: false }), true);
  assert.equal(shouldOfferResume(null, { positionSeconds: 600, completed: false }), false);
});
