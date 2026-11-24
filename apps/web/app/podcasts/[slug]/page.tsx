"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Artwork, Badge, Button, EmptyState, HeartIcon, PlayIcon, PlusIcon, SectionHeader } from "@kito/ui";
import { EpisodeRow, PodcastCard } from "../../../components/cards.tsx";
import { CATEGORY_LABELS, LANGUAGE_LABELS } from "../../../lib/data/catalogue.ts";
import { getPodcast, relatedPodcasts } from "../../../lib/data/queries.ts";
import { formatCount, formatRelativeDate } from "../../../lib/format.ts";
import { useLibrary } from "../../../lib/library.tsx";
import { episodePlayable, episodePlayables } from "../../../lib/playables.ts";
import { usePlayer } from "../../../lib/player.tsx";

export default function PodcastPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const podcast = getPodcast(slug);
  const player = usePlayer();
  const library = useLibrary();

  if (!podcast) {
    return (
      <EmptyState
        title="Show not found"
        description="That podcast is not in the demo catalogue."
        action={
          <Link href="/podcasts" className="kt-btn kt-btn--secondary kt-btn--sm">
            Back to podcasts
          </Link>
        }
      />
    );
  }

  const context = episodePlayables(podcast);
  const latest = podcast.episodes[0];
  const latestItem = latest ? episodePlayable(latest, podcast) : null;
  const following = library.isFollowingPodcast(podcast.slug);
  const similar = relatedPodcasts(podcast, 3);

  return (
    <>
      <Link href="/podcasts" className="small muted" style={{ display: "inline-block", marginBottom: 18 }}>
        ← All podcasts
      </Link>

      <header className="detail-hdr">
        <div className="detail-hdr__art">
          <Artwork seed={podcast.id} title={podcast.title} />
        </div>
        <div className="detail-hdr__info">
          <p className="detail-hdr__kind">Podcast · demo catalogue</p>
          <h1 className="detail-hdr__title">{podcast.title}</h1>
          <p className="detail-hdr__desc">{podcast.description}</p>
          <div className="detail-hdr__meta">
            <Badge tone="demo">{CATEGORY_LABELS[podcast.category]}</Badge>
            <span>{podcast.creator}</span>
            <span>·</span>
            <span>{podcast.episodes.length} episodes</span>
            <span>·</span>
            <span>{formatCount(podcast.followers)} followers (demo)</span>
            <span>·</span>
            <span>{podcast.languages.map((code) => LANGUAGE_LABELS[code] ?? code).join(" & ")}</span>
          </div>
          <div className="detail-hdr__actions">
            {latestItem ? (
              <Button variant="primary" onClick={() => player.play(latestItem, { context })}>
                <PlayIcon size={15} /> Play latest
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => library.toggleFollowPodcast(podcast.slug)} aria-pressed={following}>
              <HeartIcon filled={following} size={15} /> {following ? "Following" : "Follow"}
            </Button>
            {latestItem ? (
              <Button variant="ghost" onClick={() => player.addToQueue(latestItem)}>
                <PlusIcon size={15} /> Queue latest
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="detail-cols">
        <div>
          <SectionHeader title="All episodes" subtitle="Newest first" />
          <div className="episode-list">
            {podcast.episodes.map((episode, index) => (
              <EpisodeRow key={episode.id} episode={episode} podcast={podcast} index={index} context={context} />
            ))}
          </div>
        </div>

        <aside className="side-panel">
          <h2>About the show</h2>
          <p className="small muted" style={{ lineHeight: 1.65 }}>
            {podcast.description}
          </p>
          <dl className="small muted" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", margin: "14px 0 0" }}>
            <dt>Host</dt>
            <dd style={{ margin: 0 }}>{podcast.creator}</dd>
            <dt>Category</dt>
            <dd style={{ margin: 0 }}>{CATEGORY_LABELS[podcast.category]}</dd>
            <dt>Latest</dt>
            <dd style={{ margin: 0 }}>{latest ? formatRelativeDate(latest.publishedAt) : "—"}</dd>
          </dl>
          <div className="divider" />
          <h2>Similar shows</h2>
          <div className="stack">
            {similar.map((candidate) => (
              <PodcastCard key={candidate.id} podcast={candidate} />
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
