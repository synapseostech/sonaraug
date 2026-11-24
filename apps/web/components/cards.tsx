"use client";

import Link from "next/link";
import { Artwork, Badge, IconButton, PlayIcon, PauseIcon } from "@kito/ui";
import type { Episode, Podcast, Station, Video } from "../lib/data/catalogue.ts";
import { CATEGORY_LABELS, LANGUAGE_LABELS } from "../lib/data/catalogue.ts";
import { formatCount, formatDuration, formatRelativeDate } from "../lib/format.ts";
import { useLibrary } from "../lib/library.tsx";
import { usePlayer } from "../lib/player.tsx";
import type { Playable } from "../lib/player.tsx";
import { episodePlayable, stationPlayable, videoPlayable } from "../lib/playables.ts";
import { ChevronRightIcon, HeartIcon, PlusIcon } from "@kito/ui";
import { STREAM_STATUS_LABEL, STREAM_STATUS_TONE, stationStreamStatus } from "../lib/data/streams.ts";

/* -------------------------------------------------------------------------- */
/* Shared play control                                                        */
/* -------------------------------------------------------------------------- */

export function PlayPauseButton({
  item,
  context,
  size = "md",
  label,
}: {
  item: Playable;
  context?: Playable[];
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const player = usePlayer();
  const active = player.isCurrent(item.key);
  const playing = active && (player.status === "playing" || player.status === "buffering");
  // A station with a registry entry that is not `playable` must not offer a
  // play button that only fails after the click.
  const blocked = Boolean(item.live && (!item.audioUrl || item.live.status !== "playable"));
  const loading = active && (player.status === "loading" || player.status === "reconnecting");
  const unavailableLabel =
    item.live?.status === "unsupported"
      ? `${item.title} cannot be played in this browser`
      : item.live?.status === "unverified"
        ? `${item.title} stream has not been verified`
        : `${item.title} is temporarily unavailable`;
  return (
    <IconButton
      label={blocked ? unavailableLabel : label ?? (playing ? `Pause ${item.title}` : `Play ${item.title}`)}
      size={size}
      tone="accent"
      aria-pressed={playing}
      onClick={() => player.play(item, { context })}
      disabled={blocked || loading}
      aria-disabled={blocked || loading}
    >
      {playing ? <PauseIcon size={size === "lg" ? 22 : 18} /> : <PlayIcon size={size === "lg" ? 22 : 18} />}
    </IconButton>
  );
}

/* -------------------------------------------------------------------------- */
/* Station                                                                    */
/* -------------------------------------------------------------------------- */

/** Honest status for a station: verified live, unsupported, or demo. */
export function StationStatusBadge({ station }: { station: Station }) {
  if (station.origin === "demo") return <Badge tone="demo">Demo</Badge>;
  const status = stationStreamStatus(station.slug);
  if (!status) return null;
  return <Badge tone={STREAM_STATUS_TONE[status]}>{STREAM_STATUS_LABEL[status]}</Badge>;
}

/** What the live stream is doing right now, if it is the current item. */
export function StationPlayState({ item }: { item: Playable }) {
  const player = usePlayer();
  if (!player.isCurrent(item.key)) return null;
  const text =
    player.status === "playing"
      ? "Playing now"
      : player.status === "buffering"
        ? "Buffering…"
        : player.status === "reconnecting"
          ? `Reconnecting${player.liveConnection.attempt ? ` (${player.liveConnection.attempt}/${player.liveConnection.maxAttempts})` : ""}…`
        : player.status === "loading"
          ? "Connecting…"
          : player.status === "error"
            ? "Stream unavailable"
            : "Paused";
  return (
    <span className={`station-state station-state--${player.status}`} role="status">
      <span className="station-state__dot" aria-hidden="true" />
      {text}
    </span>
  );
}

export function StationTile({ station }: { station: Station }) {
  const library = useLibrary();
  const item = stationPlayable(station);
  const favourite = library.isFavouriteStation(station.slug);
  return (
    <article className="station-tile">
      <Link href={`/radio/${station.slug}`} className="station-tile__art" aria-label={station.name}>
        <Artwork seed={station.id} title={station.name} shape="round" />
      </Link>
      <div className="station-tile__body">
        <Link href={`/radio/${station.slug}`}>
          <h3 className="station-tile__name">{station.name}</h3>
          <p className="station-tile__meta">
            {station.frequency} · {station.city}
          </p>
        </Link>
        <div className="station-tile__tags">
          <StationStatusBadge station={station} />
          {station.categories.slice(0, 1).map((category) => (
            <Badge key={category}>{CATEGORY_LABELS[category]}</Badge>
          ))}
        </div>
        <StationPlayState item={item} />
      </div>
      <div className="station-tile__action">
        <IconButton
          label={favourite ? `Remove ${station.name} from favourites` : `Add ${station.name} to favourites`}
          size="sm"
          aria-pressed={favourite}
          onClick={() => library.toggleFavouriteStation(station.slug)}
        >
          <HeartIcon filled={favourite} size={16} />
        </IconButton>
        <PlayPauseButton item={item} size="sm" />
      </div>
    </article>
  );
}

export function StationCard({ station }: { station: Station }) {
  const item = stationPlayable(station);
  const languages = station.languages.map((code) => LANGUAGE_LABELS[code] ?? code).join(", ");
  return (
    <article className="card">
      <div className="card__art">
        <Link href={`/radio/${station.slug}`} aria-label={station.name}>
          <Artwork seed={station.id} title={station.name} />
        </Link>
        <div className="card__play">
          <PlayPauseButton item={item} size="sm" />
        </div>
      </div>
      <Link href={`/radio/${station.slug}`}>
        <h3 className="card__title">{station.name}</h3>
        <p className="card__sub">
          {station.frequency} · {station.city}
        </p>
        <p className="card__meta">
          <StationStatusBadge station={station} />
          <span>{languages}</span>
        </p>
      </Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Podcast + episode                                                          */
/* -------------------------------------------------------------------------- */

export function PodcastCard({ podcast }: { podcast: Podcast }) {
  const latest = podcast.episodes[0];
  const item = latest ? episodePlayable(latest, podcast) : null;
  return (
    <article className="card">
      <div className="card__art">
        <Link href={`/podcasts/${podcast.slug}`} aria-label={podcast.title}>
          <Artwork seed={podcast.id} title={podcast.title} />
        </Link>
        {item ? (
          <div className="card__play">
            <PlayPauseButton item={item} context={podcast.episodes.map((episode) => episodePlayable(episode, podcast))} size="sm" />
          </div>
        ) : null}
      </div>
      <Link href={`/podcasts/${podcast.slug}`}>
        <h3 className="card__title">{podcast.title}</h3>
        <p className="card__sub">{podcast.creator}</p>
        <p className="card__meta">
          {CATEGORY_LABELS[podcast.category]}
          <span className="dot-sep">{formatCount(podcast.followers)} followers</span>
        </p>
      </Link>
    </article>
  );
}

export function EpisodeRow({
  episode,
  podcast,
  index,
  context,
  showProgress = true,
}: {
  episode: Episode;
  podcast: Podcast;
  index?: number;
  context?: Playable[];
  showProgress?: boolean;
}) {
  const player = usePlayer();
  const library = useLibrary();
  const item = episodePlayable(episode, podcast);
  const progress = library.progressFor(item.key);
  const active = player.isCurrent(item.key);
  const percent = progress ? Math.min(100, (progress.positionSeconds / progress.durationSeconds) * 100) : 0;

  return (
    <div className="episode-row">
      <div className={`episode-row__index${active ? " is-playing" : ""}`}>{(index ?? 0) + 1}</div>
      <div>
        <h3 className={`episode-row__title${active ? " is-playing" : ""}`}>{episode.title}</h3>
        <p className="episode-row__desc">{episode.description}</p>
        <div className="episode-row__meta">
          <span>{formatRelativeDate(episode.publishedAt)}</span>
          <span>·</span>
          <span>{formatDuration(episode.durationSeconds)}</span>
          {progress && showProgress ? (
            <>
              <span>·</span>
              <span className="is-playing">{Math.round(percent)}% played</span>
            </>
          ) : null}
        </div>
        {progress && showProgress ? (
          <div className="episode-row__progress">
            <div className="kt-progress">
              <div className="kt-progress__fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
      </div>
      <div className="episode-row__actions">
        <IconButton
          label={library.isEpisodeSaved(episode.id) ? `Remove ${episode.title} from saved episodes` : `Save ${episode.title}`}
          size="sm"
          aria-pressed={library.isEpisodeSaved(episode.id)}
          onClick={() => library.toggleSavedEpisode(episode.id)}
        >
          <HeartIcon filled={library.isEpisodeSaved(episode.id)} size={16} />
        </IconButton>
        <IconButton label={`Add ${episode.title} to queue`} size="sm" onClick={() => player.addToQueue(item)}>
          <PlusIcon size={16} />
        </IconButton>
        <PlayPauseButton item={item} context={context} size="sm" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Video + creator                                                            */
/* -------------------------------------------------------------------------- */

export function VideoCard({ video }: { video: Video }) {
  const item = videoPlayable(video);
  return (
    <article className="card">
      <div className="card__art">
        <Link href={`/watch/${video.slug}`} aria-label={video.title}>
          <Artwork seed={video.id} title={video.title} shape="wide" />
        </Link>
        <div className="card__play">
          <PlayPauseButton item={item} size="sm" />
        </div>
      </div>
      <Link href={`/watch/${video.slug}`}>
        <h3 className="card__title">{video.title}</h3>
        <p className="card__sub">{video.creator}</p>
        <p className="card__meta">
          {formatDuration(video.durationSeconds)} · {formatCount(video.views)} views
        </p>
      </Link>
    </article>
  );
}

export function CreatorRow({ name, slug, bio, followers }: { name: string; slug: string; bio: string; followers: number }) {
  return (
    <Link href={`/watch?creator=${slug}`} className="creator-row">
      <div className="creator-row__art">
        <Artwork seed={slug} title={name} shape="round" />
      </div>
      <div style={{ minWidth: 0 }}>
        <h3 className="card__title">{name}</h3>
        <p className="card__sub">{bio}</p>
        <p className="card__meta">{formatCount(followers)} followers</p>
      </div>
      <ChevronRightIcon size={16} />
    </Link>
  );
}
