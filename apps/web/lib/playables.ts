import { type Episode, type Podcast, type Station, type Video } from "./data/catalogue.ts";
import { getStreamRecord, playableEndpoint, stationStreamStatus } from "./data/streams.ts";
import type { LiveStreamInfo, Playable } from "./player.tsx";

/** Maps catalogue records onto the player contract. One place, one direction. */
export function stationPlayable(station: Station): Playable {
  const endpoint = playableEndpoint(station.slug);
  const record = getStreamRecord(station.slug);
  const status = stationStreamStatus(station.slug);

  const live: LiveStreamInfo | undefined =
    status === null
      ? undefined
      : {
          status,
          format: endpoint?.format ?? null,
          bitrateKbps: endpoint?.bitrateKbps ?? null,
          codec: endpoint?.codec ?? null,
          endpointUrl: endpoint?.url ?? null,
          source: record?.discovery ?? "not_discovered",
          rights: record?.rights ?? "not_reviewed",
          verifiedAt: endpoint?.evidence.checkedAt ?? null,
          officialWebsite: station.officialWebsite ?? null,
        };

  return {
    key: `live:${station.slug}`,
    kind: "live",
    title: station.name,
    // No duplicated city when the dial position is unverified.
    subtitle: station.frequency ? `${station.frequency} · ${station.city}` : `${station.city} · live radio`,
    seed: station.id,
    href: `/radio/${station.slug}`,
    /** Null for demo stations and for real stations with no verified endpoint. */
    audioUrl: endpoint?.url ?? null,
    live,
  };
}

export function episodePlayable(episode: Episode, podcast: Podcast): Playable {
  return {
    key: `episode:${episode.id}`,
    kind: "episode",
    title: episode.title,
    subtitle: `${podcast.title} · ${podcast.creator}`,
    seed: podcast.id,
    href: `/podcasts/${podcast.slug}`,
    durationSeconds: episode.durationSeconds,
    audioUrl: null,
  };
}

export function episodePlayables(podcast: Podcast): Playable[] {
  return podcast.episodes.map((episode) => episodePlayable(episode, podcast));
}

export function videoPlayable(video: Video): Playable {
  return {
    key: `video:${video.id}`,
    kind: "video",
    title: video.title,
    subtitle: video.creator,
    seed: video.id,
    href: `/watch/${video.slug}`,
    durationSeconds: video.durationSeconds,
    audioUrl: null,
  };
}
