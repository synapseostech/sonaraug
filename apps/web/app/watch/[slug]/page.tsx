"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Artwork, Badge, Button, EmptyState, HeartIcon, PlayIcon, PlusIcon, SectionHeader } from "@kito/ui";
import { PlayPauseButton } from "../../../components/cards.tsx";
import { CATEGORY_LABELS } from "../../../lib/data/catalogue.ts";
import { getCreator, getVideo, relatedVideos } from "../../../lib/data/queries.ts";
import { formatCount, formatDuration, formatRelativeDate } from "../../../lib/format.ts";
import { useLibrary } from "../../../lib/library.tsx";
import { videoPlayable } from "../../../lib/playables.ts";
import { usePlayer } from "../../../lib/player.tsx";

export default function VideoPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const video = getVideo(slug);
  const player = usePlayer();
  const library = useLibrary();

  if (!video) {
    return (
      <EmptyState
        title="Video not found"
        description="That video is not in the demo catalogue."
        action={
          <Link href="/watch" className="kt-btn kt-btn--secondary kt-btn--sm">
            Back to Watch
          </Link>
        }
      />
    );
  }

  const item = videoPlayable(video);
  const creator = getCreator(video.creatorSlug);
  const related = relatedVideos(video, 4);
  const saved = library.isWatchLater(video.id);
  const active = player.isCurrent(item.key);

  return (
    <>
      <Link href="/watch" className="small muted" style={{ display: "inline-block", marginBottom: 18 }}>
        ← Watch
      </Link>

      <div className="detail-cols" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px" }}>
        <div>
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", border: "1px solid var(--kt-border)" }}>
            <Artwork seed={video.id} title={video.title} shape="wide" />
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.28)" }}>
              <PlayPauseButton item={item} size="lg" />
            </div>
            <span style={{ position: "absolute", right: 12, bottom: 12 }}>
              <Badge tone="demo">Demo · no video stream</Badge>
            </span>
          </div>

          <h1 className="detail-hdr__title" style={{ marginTop: 20 }}>
            {video.title}
          </h1>
          <div className="detail-hdr__meta">
            <Badge tone="demo">{CATEGORY_LABELS[video.category]}</Badge>
            <span>{video.creator}</span>
            <span>·</span>
            <span>{formatCount(video.views)} views</span>
            <span>·</span>
            <span>{formatRelativeDate(video.publishedAt)}</span>
            <span>·</span>
            <span>{formatDuration(video.durationSeconds)}</span>
          </div>

          <div className="detail-hdr__actions" style={{ marginBottom: 20 }}>
            <Button variant="primary" onClick={() => player.play(item)}>
              <PlayIcon size={15} /> {active && player.status === "playing" ? "Pause" : "Play"}
            </Button>
            <Button variant="secondary" onClick={() => library.toggleWatchLater(video.id)} aria-pressed={saved}>
              <HeartIcon filled={saved} size={15} /> {saved ? "Saved" : "Watch later"}
            </Button>
            <Button variant="ghost" onClick={() => player.addToQueue(item)}>
              <PlusIcon size={15} /> Add to queue
            </Button>
          </div>

          <div className="side-panel" style={{ position: "static" }}>
            <h2>Description</h2>
            <p className="small muted" style={{ lineHeight: 1.7, margin: 0 }}>
              {video.description}
            </p>
            {creator ? (
              <>
                <div className="divider" />
                <h2>Creator</h2>
                <p className="small muted" style={{ margin: 0 }}>
                  <strong style={{ color: "var(--kt-text)" }}>{creator.name}</strong> — {creator.bio}
                </p>
              </>
            ) : null}
          </div>

          <p className="notice" style={{ marginTop: 18 }}>
            <strong>No video hosting connected.</strong> This build plays the demo playback state only. Cloudflare Stream or Mux is not
            provisioned, so no video file is transferred.
          </p>
        </div>

        <aside>
          <SectionHeader title="Related videos" />
          <div className="stack">
            {related.map((candidate) => (
              <div key={candidate.id} className="creator-row">
                <div className="creator-row__art" style={{ width: 96 }}>
                  <Artwork seed={candidate.id} title={candidate.title} shape="wide" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link href={`/watch/${candidate.slug}`}>
                    <h3 className="card__title">{candidate.title}</h3>
                  </Link>
                  <p className="card__sub">{candidate.creator}</p>
                  <p className="card__meta">{formatDuration(candidate.durationSeconds)}</p>
                </div>
                <PlayPauseButton item={videoPlayable(candidate)} size="sm" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
