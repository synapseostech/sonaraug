"use client";

import Link from "next/link";
import { Artwork, Button, EmptyState, PlayIcon, SectionHeader } from "@kito/ui";
import { PlayPauseButton } from "../../components/cards.tsx";
import { podcasts, stations, videos } from "../../lib/data/queries.ts";
import { formatDuration, resumeLabel } from "../../lib/format.ts";
import { useLibrary } from "../../lib/library.tsx";
import { episodePlayable, stationPlayable, videoPlayable } from "../../lib/playables.ts";
import { usePlayer } from "../../lib/player.tsx";

export default function LibraryPage() {
  const library = useLibrary();
  const player = usePlayer();

  const favouriteStations = stations.filter((station) => library.favouriteStations.includes(station.slug));
  const followedPodcasts = podcasts.filter((podcast) => library.followedPodcasts.includes(podcast.slug));
  const savedEpisodes = podcasts.flatMap((podcast) =>
    podcast.episodes
      .filter((episode) => library.savedEpisodes.includes(episode.id))
      .map((episode) => ({ episode, podcast })),
  );
  const watchLater = videos.filter((video) => library.watchLater.includes(video.id));
  const history = library.history;

  return (
    <>
      <div className="page-head">
        <h1>My Library</h1>
        <p>
          Favourites, follows, saved episodes and your listening history. Everything here is stored locally in this browser — no account is
          required and nothing is sent to a server in this build.
        </p>
      </div>

      <section className="block">
        <SectionHeader title="Continue listening" subtitle={`${library.continueListening.length} in progress`} />
        {library.continueListening.length === 0 ? (
          <EmptyState
            title="Nothing in progress"
            description="Episodes and videos you start will appear here so you can pick them up again."
            action={
              <Link href="/podcasts" className="kt-btn kt-btn--primary kt-btn--sm">
                Find something to listen to
              </Link>
            }
          />
        ) : (
          <div className="stack">
            {library.continueListening.map((entry) => (
              <div key={entry.key} className="creator-row">
                <div className="creator-row__art">
                  <Artwork seed={entry.seed} title={entry.title} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={entry.href}>
                    <h3 className="card__title">{entry.title}</h3>
                  </Link>
                  <p className="card__sub">{entry.subtitle}</p>
                  <div className="kt-progress" style={{ marginTop: 8, maxWidth: 340 }}>
                    <div
                      className="kt-progress__fill"
                      style={{ width: `${Math.min(100, (entry.positionSeconds / entry.durationSeconds) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="small muted">{resumeLabel(entry.positionSeconds, entry.durationSeconds)}</span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    player.play({
                      key: entry.key,
                      kind: entry.kind,
                      title: entry.title,
                      subtitle: entry.subtitle,
                      seed: entry.seed,
                      href: entry.href,
                      durationSeconds: entry.durationSeconds,
                    })
                  }
                >
                  <PlayIcon size={13} /> Resume
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="Favourite stations" subtitle={`${favouriteStations.length} saved`} />
        {favouriteStations.length === 0 ? (
          <EmptyState title="No favourite stations yet" description="Tap the heart on any station to keep it here." />
        ) : (
          <div className="grid grid--stations">
            {favouriteStations.map((station) => (
              <div key={station.id} className="creator-row">
                <div className="creator-row__art">
                  <Artwork seed={station.id} title={station.name} shape="round" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/radio/${station.slug}`}>
                    <h3 className="card__title">{station.name}</h3>
                  </Link>
                  <p className="card__sub">
                    {station.frequency} · {station.city}
                  </p>
                </div>
                <PlayPauseButton item={stationPlayable(station)} size="sm" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="Followed podcasts" subtitle={`${followedPodcasts.length} shows`} />
        {followedPodcasts.length === 0 ? (
          <EmptyState title="Not following any shows" description="Follow a podcast and new episodes will be easy to find." />
        ) : (
          <div className="grid grid--cards">
            {followedPodcasts.map((podcast) => (
              <div key={podcast.id} className="card">
                <Link href={`/podcasts/${podcast.slug}`} className="card__art">
                  <Artwork seed={podcast.id} title={podcast.title} />
                </Link>
                <Link href={`/podcasts/${podcast.slug}`}>
                  <h3 className="card__title">{podcast.title}</h3>
                  <p className="card__sub">{podcast.creator}</p>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="Saved episodes" subtitle={`${savedEpisodes.length} episodes`} />
        {savedEpisodes.length === 0 ? (
          <EmptyState title="No saved episodes" description="Save an episode with the heart button on any episode list." />
        ) : (
          <div className="stack">
            {savedEpisodes.map(({ episode, podcast }) => (
              <div key={episode.id} className="creator-row">
                <div className="creator-row__art">
                  <Artwork seed={podcast.id} title={podcast.title} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="card__title">{episode.title}</h3>
                  <p className="card__sub">
                    {podcast.title} · {formatDuration(episode.durationSeconds)}
                  </p>
                </div>
                <PlayPauseButton item={episodePlayable(episode, podcast)} size="sm" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="Watch later" subtitle={`${watchLater.length} videos`} />
        {watchLater.length === 0 ? (
          <EmptyState title="Nothing saved to watch" description="Use “Watch later” on any video to add it here." />
        ) : (
          <div className="grid grid--cards">
            {watchLater.map((video) => (
              <div key={video.id} className="card">
                <Link href={`/watch/${video.slug}`} className="card__art">
                  <Artwork seed={video.id} title={video.title} shape="wide" />
                </Link>
                <Link href={`/watch/${video.slug}`}>
                  <h3 className="card__title">{video.title}</h3>
                  <p className="card__sub">{video.creator}</p>
                </Link>
                <div style={{ marginTop: 8 }}>
                  <PlayPauseButton item={videoPlayable(video)} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="Playback queue" subtitle={`${player.queue.length} waiting`} />
        {player.queue.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="Use the + button on episodes, videos or the queue button in the player to line things up."
            action={
              <Link href="/radio" className="kt-btn kt-btn--secondary kt-btn--sm">
                Browse radio
              </Link>
            }
          />
        ) : (
          <div className="stack">
            {player.queue.map((entry, index) => (
              <div key={entry.key} className="creator-row">
                <span className="small muted" style={{ width: 20, textAlign: "center" }}>
                  {index + 1}
                </span>
                <div className="creator-row__art">
                  <Artwork seed={entry.seed} title={entry.title} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="card__title">{entry.title}</h3>
                  <p className="card__sub">{entry.subtitle}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    player.removeFromQueue(entry.key);
                    player.play(entry);
                  }}
                >
                  Play now
                </Button>
                <Button variant="ghost" size="sm" onClick={() => player.removeFromQueue(entry.key)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="Recently played" subtitle={`${history.length} items`} />
        {history.length === 0 ? (
          <EmptyState title="No history yet" description="Playback history is recorded locally as you listen." />
        ) : (
          <>
            <div className="grid grid--cards">
              {history.slice(0, 12).map((entry) => (
                <div key={entry.key} className="card">
                  <Link href={entry.href} className="card__art">
                    <Artwork seed={entry.seed} title={entry.title} shape={entry.kind === "video" ? "wide" : "square"} />
                  </Link>
                  <Link href={entry.href}>
                    <h3 className="card__title">{entry.title}</h3>
                    <p className="card__sub">{entry.subtitle}</p>
                    <p className="card__meta">
                      {entry.kind === "live" ? "Radio" : entry.kind === "episode" ? "Episode" : "Video"}
                    </p>
                  </Link>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <Button variant="ghost" size="sm" onClick={library.clearHistory}>
                Clear history
              </Button>
            </div>
          </>
        )}
      </section>

      <p className="notice">
        <strong>Local-only library.</strong> This build has no accounts and no database connection: favourites, follows, saved items and progress
        live in this browser&apos;s local storage. Clearing site data removes them.
      </p>
    </>
  );
}
