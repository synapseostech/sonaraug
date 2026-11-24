import type { Capabilities, PlaybackSource } from "./types.ts";

const LIVE_RADIO: Capabilities = Object.freeze({
  canSeek: false,
  canPause: false,
  canChangeSpeed: false,
  canDownload: false,
  hasDuration: false,
  supportsBackground: true,
  reportsProgress: false,
});

const NOTHING: Capabilities = Object.freeze({
  canSeek: false,
  canPause: false,
  canChangeSpeed: false,
  canDownload: false,
  hasDuration: false,
  supportsBackground: false,
  reportsProgress: false,
});

/**
 * Capabilities for on-demand audio and video.
 * Downloads are gated by the per-episode permission flag, never by the player.
 */
export function capabilitiesFor(source: PlaybackSource | null): Capabilities {
  if (source === null) return NOTHING;

  switch (source.kind) {
    case "live_radio":
      return LIVE_RADIO;
    case "podcast_episode":
      return Object.freeze({
        canSeek: true,
        canPause: true,
        canChangeSpeed: true,
        canDownload: source.downloadAllowed,
        hasDuration: true,
        supportsBackground: true,
        reportsProgress: true,
      });
    case "video":
      return Object.freeze({
        canSeek: true,
        canPause: true,
        canChangeSpeed: true,
        canDownload: false,
        hasDuration: true,
        supportsBackground: false,
        reportsProgress: true,
      });
  }
}
