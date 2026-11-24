"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Artwork, Badge, Button, Chip, EmptyState, PlayIcon, SectionHeader } from "@kito/ui";
import { CreatorRow, PlayPauseButton, VideoCard } from "../../components/cards.tsx";
import { CATEGORY_LABELS, creators, videos, type Category } from "../../lib/data/catalogue.ts";
import { featuredVideo } from "../../lib/data/queries.ts";
import { formatCount, formatDuration, resumeLabel } from "../../lib/format.ts";
import { useLibrary } from "../../lib/library.tsx";
import { videoPlayable } from "../../lib/playables.ts";
import { usePlayer } from "../../lib/player.tsx";

export default function WatchPage() {
  return (
    <Suspense fallback={<p className="muted">Loading videos…</p>}>
      <WatchQuery />
    </Suspense>
  );
}

/** Reads ?creator=<slug> so creator links land on a filtered view. */
function WatchQuery() {
  const params = useSearchParams();
  const creator = params.get("creator") ?? "all";
  return <WatchView key={creator} initialCreator={creator} />;
}

function WatchView({ initialCreator }: { initialCreator: string }) {
  const player = usePlayer();
  const library = useLibrary();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [creatorSlug, setCreatorSlug] = useState<string>(initialCreator);

  const categories = useMemo(() => Array.from(new Set(videos.map((video) => video.category))), []);
  const videoCreators = useMemo(() => creators.filter((creator) => creator.kind === "video"), []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return videos.filter((video) => {
      if (category !== "all" && video.category !== category) return false;
      if (creatorSlug !== "all" && video.creatorSlug !== creatorSlug) return false;
      if (!term) return true;
      return [video.title, video.creator, video.description].join(" ").toLowerCase().includes(term);
    });
  }, [query, category, creatorSlug]);

  const continueWatching = library.continueListening.filter((entry) => entry.kind === "video");
  const featured = videoPlayable(featuredVideo);

  return (
    <>
      <section className="hero">
        <div>
          <p className="hero__eyebrow">
            <Badge tone="demo">Featured</Badge> Watch
          </p>
          <h1 className="hero__title">{featuredVideo.title}</h1>
          <p className="hero__desc">{featuredVideo.description}</p>
          <div className="hero__actions">
            <Button variant="primary" onClick={() => player.play(featured)}>
              <PlayIcon size={15} /> Play video
            </Button>
            <Link href={`/watch/${featuredVideo.slug}`} className="kt-btn kt-btn--secondary">
              Video page
            </Link>
          </div>
          <div className="hero__meta">
            <span>{featuredVideo.creator}</span>
            <span>·</span>
            <span>{formatDuration(featuredVideo.durationSeconds)}</span>
            <span>·</span>
            <span>{formatCount(featuredVideo.views)} views (demo)</span>
          </div>
        </div>
        <div className="hero__art">
          <Artwork seed={featuredVideo.id} title={featuredVideo.title} shape="wide" />
        </div>
      </section>

      {continueWatching.length > 0 ? (
        <section className="block">
          <SectionHeader title="Continue watching" />
          <div className="grid grid--cards">
            {continueWatching.slice(0, 4).map((entry) => (
              <div key={entry.key} className="card">
                <Link href={entry.href} className="card__art">
                  <Artwork seed={entry.seed} title={entry.title} shape="wide" />
                </Link>
                <h3 className="card__title">{entry.title}</h3>
                <p className="card__sub">{entry.subtitle}</p>
                <p className="card__meta">{resumeLabel(entry.positionSeconds, entry.durationSeconds)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="filters">
        <div className="filters__row">
          <label className="filters__label" htmlFor="video-search">
            Search
          </label>
          <input
            id="video-search"
            style={{ flex: 1, maxWidth: 320, height: 40, padding: "0 14px", borderRadius: 999, border: "1px solid var(--kt-border)", background: "var(--kt-bg)", color: "var(--kt-text)" }}
            placeholder="Title or creator"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="filters__results">
            {results.length} of {videos.length} videos
          </span>
        </div>
        <div className="filters__row">
          <span className="filters__label">Category</span>
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All
          </Chip>
          {categories.map((value) => (
            <Chip key={value} active={category === value} onClick={() => setCategory(value)}>
              {CATEGORY_LABELS[value]}
            </Chip>
          ))}
        </div>
        <div className="filters__row">
          <span className="filters__label">Creator</span>
          <Chip active={creatorSlug === "all"} onClick={() => setCreatorSlug("all")}>
            All
          </Chip>
          {videoCreators.map((creator) => (
            <Chip key={creator.slug} active={creatorSlug === creator.slug} onClick={() => setCreatorSlug(creator.slug)}>
              {creator.name}
            </Chip>
          ))}
        </div>
      </div>

      <section className="block">
        <SectionHeader title={category === "all" && creatorSlug === "all" ? "Trending videos" : "Matching videos"} subtitle={`${results.length} video${results.length === 1 ? "" : "s"}`} />
        {results.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try a different category or clear the creator filter." />
        ) : (
          <div className="grid grid--wide">
            {results.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="Popular creators" subtitle="Ugandan channels in the demo catalogue" />
        <div className="grid grid--stations">
          {videoCreators.map((creator) => (
            <CreatorRow key={creator.slug} name={creator.name} slug={creator.slug} bio={creator.bio} followers={creator.followers} />
          ))}
        </div>
      </section>

      <section className="block">
        <SectionHeader title="Watch later" action={{ href: "/library", label: "My library" }} />
        {library.watchLater.length === 0 ? (
          <EmptyState title="Nothing saved for later" description="Use the watch-later button on any video to build a queue for the evening." />
        ) : (
          <div className="grid grid--cards">
            {videos
              .filter((video) => library.watchLater.includes(video.id))
              .map((video) => (
                <div key={video.id} className="card">
                  <Link href={`/watch/${video.slug}`} className="card__art">
                    <Artwork seed={video.id} title={video.title} shape="wide" />
                  </Link>
                  <h3 className="card__title">{video.title}</h3>
                  <p className="card__sub">{video.creator}</p>
                  <div style={{ marginTop: 8 }}>
                    <PlayPauseButton item={videoPlayable(video)} size="sm" />
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </>
  );
}
