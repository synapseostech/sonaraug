import type { LiveRadioSource, PodcastEpisodeSource, RadioEndpoint, VideoSource } from "./types.ts";

export const endpoint = (over: Partial<RadioEndpoint> & { id: string }): RadioEndpoint => ({
  url: `https://stream.example/${over.id}`,
  protocol: "icecast",
  codec: "mp3",
  bitrateKbps: 128,
  isPrimary: false,
  ...over,
});

export const liveRadio = (over: Partial<LiveRadioSource> = {}): LiveRadioSource => ({
  kind: "live_radio",
  id: "source-radio",
  stationId: "station-1",
  title: "Kampala FM",
  endpoints: [endpoint({ id: "ep-1", isPrimary: true })],
  ...over,
});

export const episode = (over: Partial<PodcastEpisodeSource> = {}): PodcastEpisodeSource => ({
  kind: "podcast_episode",
  id: "source-ep",
  episodeId: "episode-1",
  podcastId: "podcast-1",
  title: "Episode 1",
  audioUrl: "https://audio.example/ep1.mp3",
  durationSeconds: 1800,
  downloadAllowed: true,
  ...over,
});

export const video = (over: Partial<VideoSource> = {}): VideoSource => ({
  kind: "video",
  id: "source-video",
  videoId: "video-1",
  channelId: "channel-1",
  title: "Vlog 1",
  hlsUrl: "https://video.example/v1.m3u8",
  durationSeconds: 600,
  captionLanguages: ["en"],
  ...over,
});
