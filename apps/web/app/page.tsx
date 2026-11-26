"use client";

import Link from "next/link";
import { Artwork, Badge, Button, EmptyState, Scroller, SectionHeader } from "@kito/ui";
import { PlayIcon } from "@kito/ui";
import { EpisodeRow, PlayPauseButton, PodcastCard, StationCard, VideoCard } from "../components/cards.tsx";
import { LANGUAGE_LABELS } from "../lib/data/catalogue.ts";
import {
  featuredStation,
  featuredVideo,
  getPodcast,
  realStations,
  recentEpisodes,
  stations,
  trendingPodcasts,
  verifiedStations,
  videos,
} from "../lib/data/queries.ts";
import { formatCount, resumeLabel } from "../lib/format.ts";
import { useLibrary } from "../lib/library.tsx";
import { stationPlayable } from "../lib/playables.ts";
import { usePlayer } from "../lib/player.tsx";

export default function HomePage() {
  const library = useLibrary();
  const player = usePlayer();
  const featured = stationPlayable(featuredStation);
  const popularStations = [...stations].sort((a, b) => (b.listeners ?? 0) - (a.listeners ?? 0)).slice(0, 8);
  const episodes = recentEpisodes(6);
  const trending = trendingPodcasts(6);
  const recommended = videos.slice(0, 4);

  return (
    <>
      <section className="hero">
        <div>
          <p className="hero__eyebrow">
            {/* "Verified live" only when the stream is both technically verified and rights-cleared. */}
            {featured.audioUrl ? <Badge tone="live">Verified live</Badge> : <Badge tone="demo">Awaiting authorisation</Badge>}
            Real Ugandan radio · {featuredStation.city}
          </p>
          <h1 className="hero__title">{featuredStation.name}</h1>
          <p className="hero__desc">{featuredStation.description}</p>
          <div className="hero__actions">
            <Button variant="primary" onClick={() => player.play(featured)} disabled={!featured.audioUrl}>
              <PlayIcon size={15} /> {featured.audioUrl ? "Listen live" : "Rights clearance pending"}
            </Button>
            <Link href={`/radio/${featuredStation.slug}`} className="kt-btn kt-btn--secondary">
              Station details
            </Link>
          </div>
          <div className="hero__meta">
            <span>{featuredStation.frequency ?? "Frequency not verified"}</span>
            <span>·</span>
            <span>{featuredStation.languages.map((code) => LANGUAGE_LABELS[code] ?? code).join(" & ")}</span>
            <span>·</span>
            <span>{featured.live?.bitrateKbps ? `${featured.live.bitrateKbps} kbps MP3 · audible playback verified` : "Live stream"}</span>
          </div>
        </div>
        <div className="hero__art">
          <Artwork seed={featuredStation.id} title={featuredStation.name} shape="round" />
        </div>
      </section>

      {library.continueListening.length > 0 ? (
        <section className="block">
          <SectionHeader title="Continue listening" subtitle="Picks up where you stopped" action={{ href: "/library", label: "My library" }} />
          <div className="stack">
            {library.continueListening.slice(0, 3).map((entry) => (
              <div key={entry.key} className="creator-row">
                <div className="creator-row__art">
                  <Artwork seed={entry.seed} title={entry.title} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 className="card__title">{entry.title}</h3>
                  <p className="card__sub">{entry.subtitle}</p>
                  <div className="kt-progress" style={{ marginTop: 8, maxWidth: 320 }}>
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
        </section>
      ) : null}

      {realStations.length > 0 ? (
        <section className="block">
          <SectionHeader
            title={verifiedStations.length > 0 ? "Ugandan radio, verified" : "Real Ugandan radio"}
            subtitle={
              verifiedStations.length > 0
                ? `${verifiedStations.length} of ${realStations.length} real stations are streaming now — every endpoint tested in a browser`
                : `${realStations.length} real stations listed; playback requires both station permission and music rights clearance`
            }
            action={{ href: "/radio", label: "Radio directory" }}
          />
          <Scroller label="Real Ugandan stations">
            {realStations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </Scroller>
        </section>
      ) : null}

      <section className="block">
        <SectionHeader
          title="Popular stations"
          subtitle="Demo catalogue with invented listener figures"
          action={{ href: "/radio", label: "All stations" }}
        />
        <Scroller label="Popular stations">
          {popularStations.map((station) => (
            <StationCard key={station.id} station={station} />
          ))}
        </Scroller>
      </section>

      <section className="block">
        <SectionHeader title="Trending podcasts" subtitle="Most followed shows this week" action={{ href: "/podcasts", label: "Browse podcasts" }} />
        <Scroller label="Trending podcasts">
          {trending.map((podcast) => (
            <PodcastCard key={podcast.id} podcast={podcast} />
          ))}
        </Scroller>
      </section>

      <section className="block">
        <SectionHeader title="Recently added episodes" action={{ href: "/podcasts", label: "See all episodes" }} />
        <div className="episode-list">
          {episodes.map((episode, index) => {
            const show = getPodcast(episode.show.slug);
            if (!show) return null;
            return <EpisodeRow key={episode.id} episode={episode} podcast={show} index={index} />;
          })}
        </div>
      </section>

      <section className="block">
        <SectionHeader title="Featured video" subtitle="Documentary and vlog from Ugandan creators" action={{ href: "/watch", label: "Watch" }} />
        <div className="detail-cols" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 24 }}>
          <div>
            <Link href={`/watch/${featuredVideo.slug}`} aria-label={featuredVideo.title}>
              <Artwork seed={featuredVideo.id} title={featuredVideo.title} shape="wide" />
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <PlayPauseButton item={{ key: `video:${featuredVideo.id}`, kind: "video", title: featuredVideo.title, subtitle: featuredVideo.creator, seed: featuredVideo.id, href: `/watch/${featuredVideo.slug}`, durationSeconds: featuredVideo.durationSeconds, audioUrl: null }} size="md" />
              <div>
                <Link href={`/watch/${featuredVideo.slug}`}>
                  <h3 className="card__title">{featuredVideo.title}</h3>
                </Link>
                <p className="card__sub">
                  {featuredVideo.creator} · {formatCount(featuredVideo.views)} views
                </p>
              </div>
            </div>
          </div>
          <div className="stack">
            {recommended.slice(0, 3).map((video) => (
              <div key={video.id} className="creator-row">
                <div className="creator-row__art" style={{ width: 84 }}>
                  <Artwork seed={video.id} title={video.title} shape="wide" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/watch/${video.slug}`}>
                    <h3 className="card__title">{video.title}</h3>
                  </Link>
                  <p className="card__sub">{video.creator}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <SectionHeader title="Recommended for you" subtitle="A mix based on this week's catalogue" />
        <div className="grid grid--cards">
          {recommended.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      </section>

      {library.history.length > 0 ? (
        <section className="block">
          <SectionHeader title="Recently played" action={{ href: "/library", label: "History" }} />
          <div className="grid grid--cards">
            {library.history.slice(0, 6).map((entry) => (
              <Link key={entry.key} href={entry.href} className="card">
                <div className="card__art">
                  <Artwork seed={entry.seed} title={entry.title} />
                </div>
                <h3 className="card__title">{entry.title}</h3>
                <p className="card__sub">{entry.subtitle}</p>
                <p className="card__meta">{entry.kind === "live" ? "Radio" : entry.kind === "episode" ? "Episode" : "Video"}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {library.history.length === 0 ? (
        <section className="block">
          <EmptyState
            title="Your library starts here"
            description="Play a station or an episode and it will appear here, along with anything you favourite, follow or save for later."
            action={
              <Link href="/radio" className="kt-btn kt-btn--primary kt-btn--sm">
                Browse radio
              </Link>
            }
          />
        </section>
      ) : null}

      <p className="notice">
        <strong>Catalogue status.</strong> Station, show, episode and video records include both genuine broadcaster metadata and clearly
        labelled demo catalogue content. Stream evidence and broadcaster permission do not by themselves establish music rights: playback
        remains blocked until both are cleared for Sonara.
      </p>
    </>
  );
}
