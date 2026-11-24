"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Artwork, Badge, Button, Chip, EmptyState, PlayIcon, SectionHeader } from "@kito/ui";
import { EpisodeRow, PodcastCard } from "../../components/cards.tsx";
import { CATEGORY_LABELS, podcasts, type Category } from "../../lib/data/catalogue.ts";
import { featuredPodcast, getPodcast, recentEpisodes, trendingPodcasts } from "../../lib/data/queries.ts";
import { formatCount } from "../../lib/format.ts";
import { episodePlayable, episodePlayables } from "../../lib/playables.ts";
import { usePlayer } from "../../lib/player.tsx";

export default function PodcastsPage() {
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");

  const categories = useMemo(() => Array.from(new Set(podcasts.map((podcast) => podcast.category))), []);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return podcasts.filter((podcast) => {
      if (category !== "all" && podcast.category !== category) return false;
      if (!term) return true;
      return [podcast.title, podcast.creator, podcast.description].join(" ").toLowerCase().includes(term);
    });
  }, [query, category]);

  const latest = featuredPodcast.episodes[0];
  const latestItem = latest ? episodePlayable(latest, featuredPodcast) : null;

  return (
    <>
      <Link href="/medical-chronicles" className="mc-band" aria-label="Medical Chronicles: educational medical audio from Sonara">
        <span className="mc-band__brand">
          <span className="mc-band__mark" aria-hidden="true">
            M
          </span>
          <span>
            Medical Chronicles <span className="sn-small">· Sonara&apos;s educational medical audio. First episodes of every series free.</span>
          </span>
        </span>
        <span className="kt-btn kt-btn--secondary kt-btn--sm">Open</span>
      </Link>
      <section className="hero">
        <div>
          <p className="hero__eyebrow">
            <Badge tone="demo">Featured show</Badge> Podcasts
          </p>
          <h1 className="hero__title">{featuredPodcast.title}</h1>
          <p className="hero__desc">{featuredPodcast.description}</p>
          <div className="hero__actions">
            {latestItem ? (
              <Button variant="primary" onClick={() => player.play(latestItem, { context: episodePlayables(featuredPodcast) })}>
                <PlayIcon size={15} /> Play latest episode
              </Button>
            ) : null}
            <Link href={`/podcasts/${featuredPodcast.slug}`} className="kt-btn kt-btn--secondary">
              All episodes
            </Link>
          </div>
          <div className="hero__meta">
            <span>{featuredPodcast.creator}</span>
            <span>·</span>
            <span>{featuredPodcast.episodes.length} episodes</span>
            <span>·</span>
            <span>{formatCount(featuredPodcast.followers)} followers</span>
          </div>
        </div>
        <div className="hero__art">
          <Artwork seed={featuredPodcast.id} title={featuredPodcast.title} />
        </div>
      </section>

      <div className="filters">
        <div className="filters__row">
          <label className="filters__label" htmlFor="podcast-search">
            Search
          </label>
          <input
            id="podcast-search"
            style={{ flex: 1, maxWidth: 320, height: 40, padding: "0 14px", borderRadius: 999, border: "1px solid var(--kt-border)", background: "var(--kt-bg)", color: "var(--kt-text)" }}
            placeholder="Show or creator"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="filters__results">
            {results.length} of {podcasts.length} shows
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
      </div>

      <section className="block">
        <SectionHeader title="Shows" subtitle={`${results.length} show${results.length === 1 ? "" : "s"}`} />
        {results.length === 0 ? (
          <EmptyState title="No shows match" description="Try another category or clear the search." />
        ) : (
          <div className="grid grid--cards">
            {results.map((podcast) => (
              <PodcastCard key={podcast.id} podcast={podcast} />
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader title="New episodes this week" subtitle="Across every show in the catalogue" />
        <div className="episode-list">
          {recentEpisodes(5).map((episode, index) => {
            const show = getPodcast(episode.show.slug);
            if (!show) return null;
            return <EpisodeRow key={episode.id} episode={episode} podcast={show} index={index} />;
          })}
        </div>
      </section>

      <section className="block">
        <SectionHeader title="Trending this week" subtitle="By followers in the demo catalogue" />
        <div className="grid grid--cards">
          {trendingPodcasts(4).map((podcast) => (
            <PodcastCard key={podcast.id} podcast={podcast} />
          ))}
        </div>
      </section>
    </>
  );
}
