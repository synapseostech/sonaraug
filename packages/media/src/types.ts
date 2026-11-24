/**
 * Media contracts shared by mobile, web, workers and edge functions.
 *
 * These types are the single definition of "what can be played". They are
 * deliberately free of any player-library types so that react-native-track-player
 * (mobile), HTMLMediaElement (web) and hls.js all map onto the same model.
 */

export type SourceKind = "live_radio" | "podcast_episode" | "video";

export type StreamProtocol = "icecast" | "shoutcast" | "hls" | "https_mp3" | "https_aac";

/** A single playable endpoint for a live station. */
export type RadioEndpoint = {
  readonly id: string;
  readonly url: string;
  readonly protocol: StreamProtocol;
  readonly codec: string | null;
  readonly bitrateKbps: number | null;
  readonly isPrimary: boolean;
};

type BaseSource = {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly artworkUrl?: string;
  readonly artist?: string;
};

export type LiveRadioSource = BaseSource & {
  readonly kind: "live_radio";
  readonly stationId: string;
  readonly endpoints: readonly RadioEndpoint[];
  /** Server-reported "now playing"; optional because not all streams publish ICY metadata. */
  readonly nowPlaying?: string;
};

export type PodcastEpisodeSource = BaseSource & {
  readonly kind: "podcast_episode";
  readonly episodeId: string;
  readonly podcastId: string;
  readonly audioUrl: string;
  readonly durationSeconds: number;
  readonly downloadAllowed: boolean;
};

export type VideoSource = BaseSource & {
  readonly kind: "video";
  readonly videoId: string;
  readonly channelId: string;
  readonly hlsUrl: string;
  readonly durationSeconds: number;
  readonly captionLanguages: readonly string[];
};

export type PlaybackSource = LiveRadioSource | PodcastEpisodeSource | VideoSource;

/**
 * What the current source can actually do. The UI renders controls from this
 * object, so a control that cannot work is never shown — the brief explicitly
 * forbids seeking/rewinding live radio.
 */
export type Capabilities = {
  readonly canSeek: boolean;
  readonly canPause: boolean;
  readonly canChangeSpeed: boolean;
  readonly canDownload: boolean;
  readonly hasDuration: boolean;
  readonly supportsBackground: boolean;
  readonly reportsProgress: boolean;
};

export type PlaybackErrorCode =
  | "network_unreachable"
  | "stream_rejected"
  | "unsupported_format"
  | "decode_failed"
  | "not_found"
  | "geo_blocked"
  | "unknown";

export type PlaybackError = {
  readonly code: PlaybackErrorCode;
  /** Safe, user-facing text. Never a raw provider message. */
  readonly message: string;
  /** Whether the UI should offer a "try again" affordance. */
  readonly recoverable: boolean;
};

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "buffering" | "ended" | "error";
