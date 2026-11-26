import type { PlaybackErrorCode } from "./types.ts";

/**
 * Bridge between the browser's HTMLMediaElement and our playback vocabulary.
 *
 * Kept in the shared package (rather than in the web app) because the mobile
 * player faces the same questions: "is this failure worth retrying?", "can this
 * device decode this format?". Both must be answerable without a DOM.
 */

/**
 * `MediaError.code` → our error vocabulary.
 *
 * MediaError is famously coarse: a CORS block, a 404 and an HTML error page all
 * arrive as MEDIA_ERR_SRC_NOT_SUPPORTED. The mapping below therefore prefers
 * the *recoverable* interpretation where the distinction matters to a listener
 * on a flaky connection, and never claims "unsupported" when we are simply
 * offline.
 */
export function classifyMediaError(
  mediaErrorCode: number | null | undefined,
  options: { online?: boolean } = {},
): PlaybackErrorCode {
  if (options.online === false) return "network_unreachable";

  switch (mediaErrorCode) {
    case 1: // MEDIA_ERR_ABORTED — usually our own teardown, never user-facing
      return "network_unreachable";
    case 2: // MEDIA_ERR_NETWORK
      return "network_unreachable";
    case 3: // MEDIA_ERR_DECODE
      return "decode_failed";
    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
      return "stream_rejected";
    default:
      return "unknown";
  }
}

export type StreamFormatKind = "mp3" | "aac" | "hls";

const MIME_BY_FORMAT: Record<StreamFormatKind, string> = {
  mp3: "audio/mpeg",
  aac: "audio/aac",
  hls: "application/vnd.apple.mpegurl",
};

export type FormatSupport = {
  readonly supported: boolean;
  /** "probably" | "maybe" | "" as returned by canPlayType, normalised. */
  readonly confidence: "probably" | "maybe" | "no";
  readonly mimeType: string;
  /** True when the format needs a library on this browser (e.g. hls.js). */
  readonly needsLibrary: boolean;
};

/**
 * Decide whether the current browser can open a stream format.
 *
 * HLS is the interesting case: Safari and current Chrome play `m3u8` natively,
 * older Chrome and Firefox do not. The caller passes the browser's own
 * `canPlayType`, so the decision is made by the device rather than by a
 * user-agent string — and the answer is testable without a browser.
 */
export function formatSupport(
  format: StreamFormatKind,
  canPlayType: (mimeType: string) => string,
  options: { hlsLibrarySupported?: boolean } = {},
): FormatSupport {
  const mimeType = MIME_BY_FORMAT[format];
  const raw = canPlayType(mimeType).trim().toLowerCase();
  const confidence: FormatSupport["confidence"] =
    raw === "probably" ? "probably" : raw === "maybe" ? "maybe" : "no";

  if (format === "hls") {
    // Native HLS is only ever reported as "maybe" (Chrome/Safari) or "".
    const needsLibrary = confidence === "no";
    return {
      supported: !needsLibrary || options.hlsLibrarySupported === true,
      confidence,
      mimeType,
      needsLibrary,
    };
  }

  return { supported: confidence !== "no", confidence, mimeType, needsLibrary: false };
}
