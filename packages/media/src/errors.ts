import type { PlaybackError, PlaybackErrorCode } from "./types.ts";

/**
 * User-facing copy for playback failures.
 *
 * Written for a listener on a slow connection in Uganda, not for a developer:
 * every message says what happened and what they can do. Raw provider or
 * network messages must never reach the UI.
 */
const CATALOGUE: Record<PlaybackErrorCode, { message: string; recoverable: boolean }> = {
  network_unreachable: {
    message: "You appear to be offline. Check your connection and try again.",
    recoverable: true,
  },
  stream_rejected: {
    message: "This station is not responding right now. Please try another station.",
    recoverable: true,
  },
  unsupported_format: {
    message: "This audio format is not supported on your device.",
    recoverable: false,
  },
  decode_failed: {
    message: "This item could not be played. Please try again later.",
    recoverable: true,
  },
  not_found: {
    message: "This content is no longer available.",
    recoverable: false,
  },
  geo_blocked: {
    message: "This content is not available in your region.",
    recoverable: false,
  },
  unknown: {
    message: "Something went wrong while playing this content.",
    recoverable: true,
  },
};

export function describePlaybackError(code: PlaybackErrorCode): PlaybackError {
  const entry = CATALOGUE[code] ?? CATALOGUE.unknown;
  return Object.freeze({ code, message: entry.message, recoverable: entry.recoverable });
}

/** Map a transport-level signal onto our error vocabulary. */
export function classifyFailure(input: { httpStatus?: number; offline?: boolean; timedOut?: boolean }): PlaybackErrorCode {
  if (input.offline === true) return "network_unreachable";
  if (input.timedOut === true) return "network_unreachable";
  const status = input.httpStatus;
  if (status === undefined) return "unknown";
  if (status === 404 || status === 410) return "not_found";
  if (status === 401 || status === 403) return "stream_rejected";
  if (status === 415) return "unsupported_format";
  if (status >= 400 && status < 500) return "stream_rejected";
  if (status >= 500) return "decode_failed";
  return "unknown";
}
