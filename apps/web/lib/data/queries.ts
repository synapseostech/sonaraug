import {
  creators,
  podcasts,
  stations,
  videos,
  type Category,
  type Creator,
  type Episode,
  type Podcast,
  type Region,
  type Station,
  type Video,
} from "./catalogue.ts";

/** Re-exported so pages can import catalogue and lookups from one module. */
export { creators, podcasts, stations, videos };

export type EpisodeWithShow = Episode & {
  show: Pick<Podcast, "slug" | "title" | "creator" | "category">;
};

/* -------------------------------------------------------------------------- */
/* Real vs demo, and stream-aware selections                                  */
/* -------------------------------------------------------------------------- */

import { stationStreamStatus } from "./streams.ts";

/** Real Ugandan broadcasters integrated in this phase. */
export const realStations = stations.filter((station) => station.origin === "broadcaster");

/** Fictional sample stations, kept so the directory still exercises every filter. */
export const demoStations = stations.filter((station) => station.origin === "demo");

/** Real stations whose stream passed browser playback verification. */
export const verifiedStations = realStations.filter((station) => stationStreamStatus(station.slug) === "playable");

/**
 * The hero station. Prefers a verified real stream so the front door of the
 * product is something a listener can actually hear.
 */
export const featuredStation = verifiedStations[0] ?? realStations[0] ?? stations[0]!;
export const featuredVideo = videos[4]!;
export const featuredPodcast = podcasts[0]!;

export function getStation(slug: string): Station | undefined {
  return stations.find((station) => station.slug === slug);
}

export function getPodcast(slug: string): Podcast | undefined {
  return podcasts.find((podcast) => podcast.slug === slug);
}

export function getVideo(slug: string): Video | undefined {
  return videos.find((video) => video.slug === slug);
}

export function getCreator(slug: string): Creator | undefined {
  return creators.find((creator) => creator.slug === slug);
}

export function allEpisodes(): EpisodeWithShow[] {
  return podcasts
    .flatMap((podcast) =>
      podcast.episodes.map((episode) => ({
        ...episode,
        show: {
          slug: podcast.slug,
          title: podcast.title,
          creator: podcast.creator,
          category: podcast.category,
        },
      })),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function recentEpisodes(limit = 8): EpisodeWithShow[] {
  return allEpisodes().slice(0, limit);
}

export function trendingPodcasts(limit = 6): Podcast[] {
  return [...podcasts].sort((a, b) => b.followers - a.followers).slice(0, limit);
}

export function stationsByCategory(category: Category | "all"): Station[] {
  if (category === "all") return stations;
  return stations.filter((station) => station.categories.includes(category));
}

export function relatedStations(station: Station, limit = 4): Station[] {
  return stations
    .filter((candidate) => candidate.id !== station.id)
    .map((candidate) => {
      const shared = candidate.categories.filter((category) => station.categories.includes(category)).length;
      const sameRegion = candidate.region === station.region ? 1 : 0;
      return { candidate, score: shared * 2 + sameRegion };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function relatedPodcasts(podcast: Podcast, limit = 4): Podcast[] {
  return podcasts
    .filter((candidate) => candidate.slug !== podcast.slug)
    .sort((a, b) => {
      const aScore = a.category === podcast.category ? 1 : 0;
      const bScore = b.category === podcast.category ? 1 : 0;
      return bScore - aScore || b.followers - a.followers;
    })
    .slice(0, limit);
}

export function relatedVideos(video: Video, limit = 4): Video[] {
  return videos
    .filter((candidate) => candidate.slug !== video.slug)
    .sort((a, b) => {
      const aScore = a.creatorSlug === video.creatorSlug ? 2 : a.category === video.category ? 1 : 0;
      const bScore = b.creatorSlug === video.creatorSlug ? 2 : b.category === video.category ? 1 : 0;
      return bScore - aScore || b.views - a.views;
    })
    .slice(0, limit);
}

export function videosByCreator(creatorSlug: string): Video[] {
  return videos.filter((video) => video.creatorSlug === creatorSlug);
}

export function stationRegions(): Region[] {
  return Array.from(new Set(stations.map((station) => station.region)));
}

export function stationLanguages(): string[] {
  return Array.from(new Set(stations.flatMap((station) => station.languages))).sort();
}

export function stationCategories(): Category[] {
  return Array.from(new Set(stations.flatMap((station) => station.categories)));
}

export type SearchResults = {
  stations: Station[];
  podcasts: Podcast[];
  episodes: EpisodeWithShow[];
  videos: Video[];
  creators: Creator[];
  total: number;
};

export function search(query: string): SearchResults {
  const term = query.trim().toLowerCase();
  if (term.length === 0) {
    return { stations: [], podcasts: [], episodes: [], videos: [], creators: [], total: 0 };
  }
  const matches = (...fields: Array<string | string[]>) =>
    fields
      .flat()
      .join(" ")
      .toLowerCase()
      .includes(term);

  const stationHits = stations.filter((station) =>
    matches(station.name, station.city, station.tagline, station.description, station.categories, station.languages),
  );
  const podcastHits = podcasts.filter((podcast) =>
    matches(podcast.title, podcast.creator, podcast.description, podcast.category),
  );
  const episodeHits = allEpisodes().filter((episode) =>
    matches(episode.title, episode.description, episode.show.title, episode.show.creator),
  );
  const videoHits = videos.filter((video) =>
    matches(video.title, video.creator, video.description, video.category),
  );
  const creatorHits = creators.filter((creator) => matches(creator.name, creator.bio));

  return {
    stations: stationHits,
    podcasts: podcastHits,
    episodes: episodeHits,
    videos: videoHits,
    creators: creatorHits,
    total: stationHits.length + podcastHits.length + episodeHits.length + videoHits.length + creatorHits.length,
  };
}
