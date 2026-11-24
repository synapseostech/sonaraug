"use client";

import Link from "next/link";
import { Artwork } from "@kito/ui";
import { PageHead, Panel, Stat, Notice, EmptyHint, LinkButton, PublicationPill, ReviewPill } from "../../components/studio-ui.tsx";
import { useStudio } from "../../lib/studio/store.tsx";
import { formatRssDuration } from "@kito/studio";

export default function StudioOverviewPage() {
  const studio = useStudio();
  const channel = studio.channel;
  const shows = studio.state.shows;
  const episodes = studio.state.episodes;
  const videos = studio.state.videos;

  const inReview = episodes.filter((episode) => episode.publicationStatus === "review");
  const drafts = episodes.filter((episode) => ["draft", "recording", "editing"].includes(episode.publicationStatus));
  const published = episodes.filter((episode) => episode.publicationStatus === "published");
  const missingAudio = episodes.filter((episode) => episode.audioSource === "none");
  const videoDrafts = videos.filter((video) => video.publicationStatus !== "published");

  const nextActions = [
    ...shows
      .filter((show) => show.reviewStatus === "not_submitted")
      .map((show) => ({ key: `show-${show.id}`, label: `Submit “${show.title}” for review`, href: `/studio/podcasts/${show.slug}`, why: "A show must be approved before its episodes can publish." })),
    ...missingAudio
      .slice(0, 2)
      .map((episode) => ({
        key: `audio-${episode.id}`,
        label: `Record audio for “${episode.title}”`,
        href: `/studio/record?episode=${episode.id}`,
        why: "Episodes cannot move into review without audio.",
      })),
    ...inReview.map((episode) => ({
      key: `review-${episode.id}`,
      label: `“${episode.title}” is waiting on a reviewer`,
      href: `/admin/content`,
      why: "Open the admin console (switch role to Reviewer) to approve it.",
    })),
  ];

  return (
    <>
      <PageHead
        title={`Good morning, ${studio.actor.name.split(" ")[0]}`}
        description={`${channel?.name ?? "Your channel"} · ${channel?.bio ?? ""}`}
        actions={
          <>
            <LinkButton href="/studio/record" variant="primary">
              Record something
            </LinkButton>
            <LinkButton href="/studio/podcasts">New show</LinkButton>
          </>
        }
      />

      <div className="ws-stats">
        <Stat label="Shows" value={shows.length} hint={`${shows.filter((s) => s.reviewStatus === "approved").length} approved`} />
        <Stat label="Episodes" value={episodes.length} hint={`${published.length} published`} />
        <Stat label="In review" value={inReview.length} hint="Awaiting a reviewer" tone={inReview.length > 0 ? "warn" : undefined} />
        <Stat label="Drafts" value={drafts.length} hint="Draft, recording or editing" />
        <Stat label="Video" value={videos.length} hint={`${videoDrafts.length} unpublished`} />
        <Stat label="Local media" value={studio.state.media.length} hint="Recordings and files in this browser" />
      </div>

      <Notice tone="warn">
        <strong>Local workspace.</strong> Everything in the studio is stored in this browser only. Publishing updates local state — nothing is
        uploaded, hosted or distributed, and no feed URL exists yet.
      </Notice>

      <div className="ws-cols">
        <Panel title="Next actions" subtitle="Ordered by what blocks publishing">
          {nextActions.length === 0 ? (
            <EmptyHint title="Nothing blocking you" action={<LinkButton href="/studio/publishing">Open publishing queue</LinkButton>}>
              Every show is approved and every episode has audio.
            </EmptyHint>
          ) : (
            <div className="ws-stack">
              {nextActions.map((action) => (
                <div key={action.key} className="ws-row">
                  <div className="ws-row__body">
                    <Link href={action.href} className="ws-row__title" style={{ textDecoration: "none" }}>
                      {action.label}
                    </Link>
                    <p className="ws-row__sub">{action.why}</p>
                  </div>
                  <Link href={action.href} className="kt-btn kt-btn--ghost kt-btn--sm">
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent content" actions={<LinkButton href="/studio/episodes">All episodes</LinkButton>}>
          <div className="ws-stack">
            {episodes.slice(0, 4).map((episode) => {
              const show = studio.showFor(episode.showId);
              return (
                <div key={episode.id} className="ws-row">
                  <div className="ws-row__art" style={{ width: 48 }}>
                    <Artwork seed={show?.artworkSeed ?? episode.id} title={show?.title ?? "Show"} />
                  </div>
                  <div className="ws-row__body">
                    <p className="ws-row__title">{episode.title}</p>
                    <p className="ws-row__sub">
                      {show?.title ?? "Unknown show"} · S{episode.seasonNumber}E{episode.number}
                      {episode.durationSeconds ? ` · ${formatRssDuration(episode.durationSeconds)}` : ""}
                    </p>
                  </div>
                  <div className="ws-row__meta">
                    <PublicationPill status={episode.publicationStatus} />
                    <ReviewPill status={episode.reviewStatus} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Workspace model" subtitle="How the studio is put together">
        <div className="ws-cols">
          <div className="ws-stack">
            <p className="ws-row__sub" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Shows belong to your channel; episodes belong to a show. Everything moves through the same pipeline —{" "}
              <strong>draft → recording → editing → review → scheduled → published</strong> — and publishing always requires a reviewer&apos;s
              approval, never your own.
            </p>
            <p className="ws-row__sub" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Audio and video files stay on this device. They are referenced by name and size so the workflow is real, but no upload service
              exists in this build.
            </p>
          </div>
          <div className="ws-stack">
            {shows.map((show) => (
              <div key={show.id} className="ws-row">
                <div className="ws-row__body">
                  <Link href={`/studio/podcasts/${show.slug}`} className="ws-row__title" style={{ textDecoration: "none" }}>
                    {show.title}
                  </Link>
                  <p className="ws-row__sub">{studio.episodesFor(show.id).length} episodes</p>
                </div>
                <ReviewPill status={show.reviewStatus} />
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}
