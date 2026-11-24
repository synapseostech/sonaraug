"use client";

import Link from "next/link";
import { useState } from "react";
import { episodePublishBlockers, formatRssDuration, videoPublishBlockers } from "@kito/studio";
import {
  EmptyHint,
  LinkButton,
  Notice,
  PageHead,
  Panel,
  PublicationPill,
  ReviewPill,
  Stat,
  WorkflowStepper,
} from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

const STAGES = ["draft", "recording", "editing", "review", "scheduled", "published"] as const;

export default function PublishingPage() {
  const studio = useStudio();
  const [message, setMessage] = useState<string | null>(null);

  const episodes = studio.state.episodes;
  const videos = studio.state.videos;
  const ready = episodes.filter((episode) => episode.reviewStatus === "approved" && episode.publicationStatus !== "published");

  return (
    <>
      <PageHead
        title="Publishing"
        description="One queue for podcasts, video and radio programmes. Publishing is gated by a reviewer's approval and by a declared rights basis."
        actions={<LinkButton href="/admin/content">Open review queue</LinkButton>}
      />

      <div className="ws-stats">
        <Stat label="Awaiting review" value={episodes.filter((e) => e.publicationStatus === "review").length + videos.filter((v) => v.publicationStatus === "review").length} tone="warn" />
        <Stat label="Approved, not published" value={ready.length} tone={ready.length ? "warn" : "ok"} />
        <Stat label="Published episodes" value={episodes.filter((e) => e.publicationStatus === "published").length} />
        <Stat label="Published video" value={videos.filter((v) => v.publicationStatus === "published").length} />
      </div>

      {message ? <Notice tone={/cannot|must|blocked/i.test(message) ? "warn" : "ok"}>{message}</Notice> : null}

      <Notice>
        <strong>Local publication only.</strong> “Published” here means the item has completed the workflow in this browser. No audio or video
        is hosted, no feed is registered and nothing is distributed.
      </Notice>

      <Panel title="Podcast episodes" subtitle="Draft → recording → editing → review → scheduled → published">
        <div className="ws-stack">
          {episodes.length === 0 ? <EmptyHint title="No episodes yet" /> : null}
          {episodes.map((episode) => {
            const show = studio.showFor(episode.showId);
            const blockers = episodePublishBlockers(episode, show);
            return (
              <div key={episode.id} className="ws-row">
                <div className="ws-row__body">
                  <Link href={`/studio/episodes/${episode.id}`} className="ws-row__title" style={{ textDecoration: "none" }}>
                    {episode.title}
                  </Link>
                  <p className="ws-row__sub">
                    {show?.title} · S{episode.seasonNumber}E{episode.number}
                    {episode.durationSeconds ? ` · ${formatRssDuration(episode.durationSeconds)}` : " · no audio"}
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <WorkflowStepper status={episode.publicationStatus} />
                  </div>
                </div>
                <div className="ws-row__meta">
                  <PublicationPill status={episode.publicationStatus} />
                  <ReviewPill status={episode.reviewStatus} />
                  {episode.reviewStatus === "approved" && episode.publicationStatus !== "published" ? (
                    <button
                      type="button"
                      className="kt-btn kt-btn--primary kt-btn--sm"
                      onClick={() => {
                        const next = episode.publicationStatus === "scheduled" ? "published" : "scheduled";
                        const result = studio.transitionEpisode(episode.id, next);
                        setMessage(result.ok ? `“${episode.title}” moved to ${next} — local state only.` : result.reason);
                      }}
                    >
                      {episode.publicationStatus === "scheduled" ? "Publish" : "Schedule"}
                    </button>
                  ) : blockers.length > 0 ? (
                    <span className="ws-row__sub">{blockers.length} blocker{blockers.length === 1 ? "" : "s"}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Video" subtitle="Same pipeline, same review gate">
        <div className="ws-stack">
          {videos.length === 0 ? <EmptyHint title="No video drafts yet" action={<LinkButton href="/studio/video">Create one</LinkButton>} /> : null}
          {videos.map((video) => {
            const blockers = videoPublishBlockers(video);
            return (
              <div key={video.id} className="ws-row">
                <div className="ws-row__body">
                  <Link href={`/studio/video/${video.id}`} className="ws-row__title" style={{ textDecoration: "none" }}>
                    {video.title}
                  </Link>
                  <p className="ws-row__sub">
                    {video.fileName ?? "no file selected"} · {video.visibility}
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <WorkflowStepper status={video.publicationStatus} />
                  </div>
                </div>
                <div className="ws-row__meta">
                  <PublicationPill status={video.publicationStatus} />
                  <ReviewPill status={video.reviewStatus} />
                  {video.reviewStatus === "approved" && video.publicationStatus !== "published" ? (
                    <button
                      type="button"
                      className="kt-btn kt-btn--primary kt-btn--sm"
                      onClick={() => {
                        const next = video.publicationStatus === "scheduled" ? "published" : "scheduled";
                        const result = studio.transitionVideo(video.id, next);
                        setMessage(result.ok ? `“${video.title}” moved to ${next} — local state only.` : result.reason);
                      }}
                    >
                      {video.publicationStatus === "scheduled" ? "Publish" : "Schedule"}
                    </button>
                  ) : blockers.length > 0 ? (
                    <span className="ws-row__sub">{blockers.length} blocker{blockers.length === 1 ? "" : "s"}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Stage overview" subtitle="Where everything sits right now">
        <div className="ws-grid-stages">
          {STAGES.map((stage) => {
            const episodesHere = episodes.filter((episode) => episode.publicationStatus === stage).length;
            const videosHere = videos.filter((video) => video.publicationStatus === stage).length;
            return (
              <div key={stage} className="ws-stage">
                <p className="ws-stat__label">{stage}</p>
                <p className="ws-stat__value">{episodesHere + videosHere}</p>
                <p className="ws-stat__hint">
                  {episodesHere} episode{episodesHere === 1 ? "" : "s"} · {videosHere} video
                </p>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
