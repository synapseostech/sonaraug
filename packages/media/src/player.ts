import { capabilitiesFor } from "./capabilities.ts";
import { describePlaybackError } from "./errors.ts";
import { advanceEndpoint, backoffDelayMs } from "./resilience.ts";
import type { PlaybackError, PlaybackErrorCode, PlaybackSource, PlayerStatus } from "./types.ts";

/** A track shorter than this cannot be meaningfully resumed. */
export const MIN_RESUMABLE_SECONDS = 30;
/** Remaining seconds at which an on-demand item counts as finished. */
export const COMPLETION_THRESHOLD_SECONDS = 5;
/** Failures tolerated on on-demand content before surfacing an error. */
export const MAX_ON_DEMAND_ATTEMPTS = 3;

export type PlayerState = {
  readonly status: PlayerStatus;
  readonly source: PlaybackSource | null;
  readonly endpointIndex: number;
  readonly attempt: number;
  readonly positionSeconds: number;
  readonly durationSeconds: number | null;
  readonly bufferedSeconds: number;
  readonly rate: number;
  readonly error: PlaybackError | null;
  /** Epoch ms at which an automatic retry becomes due. Null when none pending. */
  readonly retryAtMs: number | null;
  readonly dataSaver: boolean;
  /**
   * Incremented whenever the host must (re)open the media URL. The host watches
   * this instead of the URL, so retrying the same endpoint is still observable.
   */
  readonly session: number;
};

export const initialPlayerState: PlayerState = Object.freeze({
  status: "idle",
  source: null,
  endpointIndex: 0,
  attempt: 0,
  positionSeconds: 0,
  durationSeconds: null,
  bufferedSeconds: 0,
  rate: 1,
  error: null,
  retryAtMs: null,
  dataSaver: false,
  session: 0,
});

export type PlayerAction =
  | { type: "load"; source: PlaybackSource; dataSaver?: boolean }
  | { type: "play" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "ready" }
  | { type: "progress"; positionSeconds: number; bufferedSeconds?: number }
  | { type: "stall" }
  | { type: "ended" }
  | { type: "failure"; code: PlaybackErrorCode; atMs: number }
  | { type: "tick"; nowMs: number }
  | { type: "seek"; positionSeconds: number }
  | { type: "setRate"; rate: number }
  | { type: "setDataSaver"; enabled: boolean };

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;

const durationOf = (source: PlaybackSource | null): number | null =>
  source !== null && source.kind !== "live_radio" ? source.durationSeconds : null;

/**
 * Pure playback reducer.
 *
 * All platform players (react-native-track-player, HTMLMediaElement, hls.js)
 * dispatch into this. Keeping the policy here — rather than in each app — is
 * what makes "live radio cannot seek" and "resume where you stopped" testable
 * without a device.
 */
export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "load": {
      const capabilities = capabilitiesFor(action.source);
      const emptyLiveQueue =
        action.source.kind === "live_radio" && action.source.endpoints.length === 0;

      if (emptyLiveQueue) {
        return {
          ...initialPlayerState,
          status: "error",
          source: action.source,
          dataSaver: action.dataSaver ?? state.dataSaver,
          error: describePlaybackError("stream_rejected"),
        };
      }

      return {
        ...initialPlayerState,
        status: "loading",
        source: action.source,
        durationSeconds: capabilities.hasDuration ? durationOf(action.source) : null,
        dataSaver: action.dataSaver ?? state.dataSaver,
        session: state.session + 1,
      };
    }

    case "play": {
      if (state.source === null) return state;
      if (state.status === "error") return state;
      return { ...state, status: state.status === "paused" ? "loading" : "playing" };
    }

    case "pause": {
      if (state.source === null) return state;
      if (!capabilitiesFor(state.source).canPause) return state;
      return { ...state, status: "paused" };
    }

    case "stop":
      return {
        ...initialPlayerState,
        dataSaver: state.dataSaver,
        session: state.session + 1,
      };

    case "ready": {
      if (state.status !== "loading" && state.status !== "buffering") return state;
      return { ...state, status: "playing", attempt: 0, error: null, retryAtMs: null };
    }

    case "progress": {
      const duration = state.durationSeconds;
      const position = clamp(action.positionSeconds, 0, duration ?? Number.MAX_SAFE_INTEGER);
      const buffered =
        action.bufferedSeconds === undefined ? state.bufferedSeconds : Math.max(state.bufferedSeconds, action.bufferedSeconds);
      const finished = duration !== null && position >= duration - COMPLETION_THRESHOLD_SECONDS;
      return {
        ...state,
        positionSeconds: position,
        bufferedSeconds: buffered,
        status: finished && state.status === "playing" ? "ended" : state.status,
      };
    }

    case "stall":
      return state.status === "playing" ? { ...state, status: "buffering" } : state;

    case "ended": {
      if (state.source !== null && state.source.kind === "live_radio") return state;
      return {
        ...state,
        status: "ended",
        positionSeconds: state.durationSeconds ?? state.positionSeconds,
      };
    }

    case "failure": {
      const error = describePlaybackError(action.code);
      if (state.source === null) return state;

      if (state.source.kind === "live_radio") {
        const progress = advanceEndpoint(state.endpointIndex, state.attempt, state.source.endpoints.length);
        if (progress.exhausted) {
          return { ...state, status: "error", error, retryAtMs: null, attempt: progress.attempt };
        }
        return {
          ...state,
          status: "buffering",
          endpointIndex: progress.endpointIndex,
          attempt: progress.attempt,
          error: null,
          // Delay is derived from the attempt that just failed (0-based), so the
          // first retry waits BASE_RETRY_DELAY_MS rather than double it.
          retryAtMs: action.atMs + backoffDelayMs(state.attempt),
          session: state.session + 1,
        };
      }

      const attempt = state.attempt + 1;
      if (attempt > MAX_ON_DEMAND_ATTEMPTS) {
        return { ...state, status: "error", error, attempt, retryAtMs: null };
      }
      return {
        ...state,
        status: "buffering",
        attempt,
        error: null,
        retryAtMs: action.atMs + backoffDelayMs(attempt - 1),
        session: state.session + 1,
      };
    }

    case "tick": {
      if (state.retryAtMs === null || action.nowMs < state.retryAtMs) return state;
      return { ...state, status: "loading", retryAtMs: null, error: null };
    }

    case "seek": {
      if (state.source === null) return state;
      if (!capabilitiesFor(state.source).canSeek) return state;
      const duration = state.durationSeconds;
      const position = clamp(action.positionSeconds, 0, duration ?? Number.MAX_SAFE_INTEGER);
      return { ...state, positionSeconds: position, status: state.status === "ended" ? "paused" : state.status };
    }

    case "setRate": {
      if (state.source === null || !capabilitiesFor(state.source).canChangeSpeed) return state;
      return { ...state, rate: clamp(action.rate, 0.5, 3) };
    }

    case "setDataSaver": {
      if (state.dataSaver === action.enabled) return state;
      const replayLive = action.enabled !== state.dataSaver && state.source?.kind === "live_radio" && state.status !== "idle";
      return {
        ...state,
        dataSaver: action.enabled,
        // Changing data-saver on a live stream requires re-opening the URL at
        // a different bitrate; on-demand players handle this themselves.
        session: replayLive ? state.session + 1 : state.session,
        endpointIndex: replayLive ? 0 : state.endpointIndex,
        attempt: replayLive ? 0 : state.attempt,
      };
    }

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** Whether the UI should offer a "resume from" affordance. */
export function shouldOfferResume(
  source: PlaybackSource | null,
  progress: { positionSeconds: number; completed: boolean } | null,
): boolean {
  if (source === null || progress === null) return false;
  if (source.kind === "live_radio") return false;
  if (progress.completed) return false;
  if (source.durationSeconds < MIN_RESUMABLE_SECONDS) return false;
  return progress.positionSeconds >= MIN_RESUMABLE_SECONDS;
}

/** Progress fraction for a seek bar. Always 0 for live radio. */
export function progressFraction(state: PlayerState): number {
  if (state.durationSeconds === null || state.durationSeconds <= 0) return 0;
  return clamp(state.positionSeconds / state.durationSeconds, 0, 1);
}
