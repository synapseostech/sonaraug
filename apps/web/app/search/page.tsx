"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Artwork, Badge, Chip, EmptyState, SectionHeader } from "@kito/ui";
import { PodcastCard, StationTile, VideoCard } from "../../components/cards.tsx";
import { search } from "../../lib/data/queries.ts";
import { formatDuration, formatRelativeDate } from "../../lib/format.ts";

type Filter = "all" | "stations" | "podcasts" | "episodes" | "videos";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="muted">Loading search…</p>}>
      <SearchQuery />
    </Suspense>
  );
}

function SearchQuery() {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  return <SearchView key={query} initialQuery={query} />;
}

function SearchView({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const results = search(query);
  const hasQuery = query.trim().length > 0;

  const sections: Array<{ key: Filter; count: number; show: boolean }> = [
    { key: "stations", count: results.stations.length, show: filter === "all" || filter === "stations" },
    { key: "podcasts", count: results.podcasts.length, show: filter === "all" || filter === "podcasts" },
    { key: "episodes", count: results.episodes.length, show: filter === "all" || filter === "episodes" },
    { key: "videos", count: results.videos.length, show: filter === "all" || filter === "videos" },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
        <p>Find a station, a show, an episode or a video across the demo catalogue.</p>
      </div>

      <div className="filters">
        <div className="filters__row">
          <label className="filters__label" htmlFor="global-search">
            Query
          </label>
          <input
            id="global-search"
            autoFocus
            style={{ flex: 1, maxWidth: 420, height: 42, padding: "0 16px", borderRadius: 999, border: "1px solid var(--kt-border)", background: "var(--kt-bg)", color: "var(--kt-text)" }}
            placeholder="Try “Kampala”, “Luganda”, “football”…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="filters__results">{hasQuery ? `${results.total} results` : ""}</span>
        </div>
        <div className="filters__row">
          <span className="filters__label">Show</span>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Everything
          </Chip>
          {sections.map((section) => (
            <Chip key={section.key} active={filter === section.key} onClick={() => setFilter(section.key)}>
              {section.key.charAt(0).toUpperCase() + section.key.slice(1)} ({section.count})
            </Chip>
          ))}
        </div>
      </div>

      {!hasQuery ? (
        <EmptyState
          title="Search the catalogue"
          description="Type a station name, a city, a language, a show or a topic. Results update as you type."
        />
      ) : results.total === 0 ? (
        <EmptyState title={`No results for “${query}”`} description="Try a shorter phrase, or browse radio and podcasts directly." />
      ) : (
        <>
          {filter === "all" || filter === "stations" ? (
            results.stations.length > 0 ? (
              <section className="block">
                <SectionHeader title="Stations" subtitle={`${results.stations.length} found`} />
                <div className="grid grid--stations">
                  {results.stations.map((station) => (
                    <StationTile key={station.id} station={station} />
                  ))}
                </div>
              </section>
            ) : null
          ) : null}

          {filter === "all" || filter === "podcasts" ? (
            results.podcasts.length > 0 ? (
              <section className="block">
                <SectionHeader title="Podcasts" subtitle={`${results.podcasts.length} found`} />
                <div className="grid grid--cards">
                  {results.podcasts.map((podcast) => (
                    <PodcastCard key={podcast.id} podcast={podcast} />
                  ))}
                </div>
              </section>
            ) : null
          ) : null}

          {filter === "all" || filter === "episodes" ? (
            results.episodes.length > 0 ? (
              <section className="block">
                <SectionHeader title="Episodes" subtitle={`${results.episodes.length} found`} />
                <div className="stack">
                  {results.episodes.slice(0, 8).map((episode) => (
                    <Link key={episode.id} href={`/podcasts/${episode.show.slug}`} className="creator-row">
                      <div className="creator-row__art">
                        <Artwork seed={episode.show.slug} title={episode.show.title} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="card__title">{episode.title}</h3>
                        <p className="card__sub">{episode.show.title}</p>
                        <p className="card__meta">
                          {formatRelativeDate(episode.publishedAt)} · {formatDuration(episode.durationSeconds)}
                        </p>
                      </div>
                      <Badge tone="demo">Episode</Badge>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null
          ) : null}

          {filter === "all" || filter === "videos" ? (
            results.videos.length > 0 ? (
              <section className="block">
                <SectionHeader title="Videos" subtitle={`${results.videos.length} found`} />
                <div className="grid grid--wide">
                  {results.videos.map((video) => (
                    <VideoCard key={video.id} video={video} />
                  ))}
                </div>
              </section>
            ) : null
          ) : null}

          {results.creators.length > 0 ? (
            <section className="block">
              <SectionHeader title="Creators" subtitle={`${results.creators.length} found`} />
              <div className="stack">
                {results.creators.map((creator) => (
                  <Link key={creator.slug} href={`/watch?creator=${creator.slug}`} className="creator-row">
                    <div className="creator-row__art">
                      <Artwork seed={creator.slug} title={creator.name} shape="round" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="card__title">{creator.name}</h3>
                      <p className="card__sub">{creator.bio}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
