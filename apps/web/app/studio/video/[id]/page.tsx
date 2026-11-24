"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { PublicationStatus, RightsDeclaration, VideoItem } from "@kito/studio";
import { formatRssDuration, transitionsFrom, videoPublishBlockers } from "@kito/studio";
import {
  BackLink,
  DemoBadge,
  EmptyHint,
  Field,
  Notice,
  PageHead,
  Panel,
  PublicationPill,
  ReviewPill,
  Select,
  Stat,
  TextArea,
  TextInput,
  WorkflowStepper,
} from "../../../../components/studio-ui.tsx";
import { objectUrlFor, registerObjectUrl, useStudio } from "../../../../lib/studio/store.tsx";
import { useVideoComments } from "../../../../lib/studio/comments.ts";

const CATEGORIES = ["Documentary", "Music", "Comedy", "News", "Culture", "Education", "Lifestyle"] as const;

const RIGHTS_OPTIONS: readonly { value: RightsDeclaration; label: string }[] = [
  { value: "undisclosed", label: "Not declared yet" },
  { value: "original", label: "My own original work" },
  { value: "licensed", label: "Licensed music / footage" },
  { value: "broadcaster_authorised", label: "Broadcaster-authorised material" },
];

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private — only me" },
  { value: "unlisted", label: "Unlisted — link only" },
  { value: "public", label: "Public — listed on the channel" },
] as const;

/** Deterministic, clearly-labelled demo numbers. No analytics pipeline is connected. */
function demoStats(video: VideoItem) {
  const seed = [...video.id].reduce((total, char) => total + char.charCodeAt(0), 0);
  const factor = video.publicationStatus === "published" ? 1 : 0.18;
  return {
    views: Math.round(((seed % 4200) + 180) * factor),
    completion: 30 + (seed % 55),
    watchHours: Math.round((((seed % 4200) + 180) * factor * (seed % 900)) / 3600),
  };
}

function durationOfFile(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const studio = useStudio();
  const video = studio.state.videos.find((entry) => entry.id === params.id);
  const comments = useVideoComments(params.id);
  const [message, setMessage] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  const blockers = useMemo(() => (video ? videoPublishBlockers(video) : []), [video]);

  if (!video) {
    return (
      <>
        <BackLink href="/studio/video">Video studio</BackLink>
        <EmptyHint title="Video not found" action={<Link className="kt-btn kt-btn--secondary kt-btn--sm" href="/studio/video">Back to videos</Link>}>
          This draft may have been removed, or the demo data was reset.
        </EmptyHint>
      </>
    );
  }

  const fileUrl = objectUrlFor(video.id);
  const thumbUrl = objectUrlFor(`thumb:${video.id}`);
  const stats = demoStats(video);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const duration = await durationOfFile(file);
    studio.attachVideoFile(video.id, { name: file.name, sizeBytes: file.size, durationSeconds: duration });
    registerObjectUrl(video.id, URL.createObjectURL(file));
    setMessage(
      duration
        ? `Selected “${file.name}” (${formatRssDuration(duration)}). Preview plays from this device only.`
        : `Selected “${file.name}”. Duration could not be read for this format — preview may not play in your browser.`,
    );
  };

  const pickThumbnail = (file: File | undefined) => {
    if (!file) return;
    registerObjectUrl(`thumb:${video.id}`, URL.createObjectURL(file));
    studio.updateVideo(video.id, { thumbnail: "custom" });
    setMessage("Thumbnail set from your device. It is not uploaded anywhere.");
  };

  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (!tag || video.tags.includes(tag)) return;
    studio.updateVideo(video.id, { tags: [...video.tags, tag].slice(0, 12) });
    setTagDraft("");
  };

  const move = (to: PublicationStatus) => {
    const result = studio.transitionVideo(video.id, to);
    setMessage(result.ok ? `Moved to ${to}. Local state only.` : result.reason);
  };

  return (
    <>
      <BackLink href="/studio/video">Video studio</BackLink>

      <PageHead
        title={video.title}
        description={`${video.category} · updated ${video.updatedAt.slice(0, 10)}`}
        actions={
          <div className="ws-actions">
            <PublicationPill status={video.publicationStatus} />
            <ReviewPill status={video.reviewStatus} />
          </div>
        }
      />

      {message ? <Notice tone={message.includes("cannot") || message.includes("Select") ? "warn" : "info"}>{message}</Notice> : null}

      <Panel title="Publishing pipeline" subtitle="Video cannot reach Published without review approval">
        <WorkflowStepper status={video.publicationStatus} />
        <div className="ws-actions" style={{ marginTop: 16 }}>
          {transitionsFrom(video.publicationStatus).map((to) => (
            <button key={to} type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => move(to)}>
              Move to {to}
            </button>
          ))}
        </div>
        {blockers.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <Notice tone="warn">
              <strong>{blockers.length} item{blockers.length === 1 ? "" : "s"} still block publishing:</strong>
              <ul className="ws-list">
                {blockers.map((blocker) => (
                  <li key={blocker.code}>{blocker.message}</li>
                ))}
              </ul>
            </Notice>
          </div>
        ) : (
          <Notice tone="ok">No publishing blockers remain for this video.</Notice>
        )}
        {video.reviewNote ? <Notice tone="info">Reviewer note: {video.reviewNote}</Notice> : null}
      </Panel>

      <div className="ws-split">
        <Panel title="Local file and preview" subtitle="Selected from this device — never uploaded">
          <div className="ws-form">
            <Field label="Video file" hint="MP4, WebM or MOV. The browser plays it from a local object URL." htmlFor="video-file">
              <input
                id="video-file"
                className="ws-input"
                type="file"
                accept="video/*"
                onChange={(event) => void pickFile(event.target.files?.[0])}
              />
            </Field>
          </div>

          {fileUrl ? (
            <div className="ws-videopreview">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={fileUrl} controls preload="metadata" className="ws-videopreview__el" />
              <p className="ws-row__sub">
                Previewing <strong>{video.fileName}</strong>
                {video.fileSizeBytes ? ` · ${(video.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
                {video.durationSeconds ? ` · ${formatRssDuration(video.durationSeconds)}` : ""}
              </p>
            </div>
          ) : video.fileName ? (
            <Notice tone="warn">
              <strong>Preview unavailable in this session.</strong> The draft references “{video.fileName}”, but object URLs do not survive a
              reload. Select the file again to preview it.
            </Notice>
          ) : (
            <EmptyHint title="No file selected">Choose a video above to enable the player and submit for review.</EmptyHint>
          )}

          <Notice tone="warn">
            <strong>Not hosted video.</strong> There is no transcoding, no adaptive streaming and no public URL. The listener Watch section
            does not show this file.
          </Notice>
        </Panel>

        <Panel title="Metadata" subtitle="Saved locally as you type">
          <div className="ws-form">
            <Field label="Title" htmlFor="v-title">
              <TextInput id="v-title" value={video.title} onChange={(value) => studio.updateVideo(video.id, { title: value })} />
            </Field>
            <Field label="Description" hint="At least 20 characters before publishing">
              <TextArea rows={5} value={video.description} onChange={(value) => studio.updateVideo(video.id, { description: value })} />
            </Field>
            <Field label="Category" htmlFor="v-category">
              <Select
                id="v-category"
                value={video.category}
                onChange={(value) => studio.updateVideo(video.id, { category: value })}
                options={CATEGORIES.map((value) => ({ value, label: value }))}
              />
            </Field>
            <Field label="Visibility" hint="Local intent only — nothing is served publicly" htmlFor="v-visibility">
              <Select
                id="v-visibility"
                value={video.visibility}
                onChange={(value) => studio.updateVideo(video.id, { visibility: value as VideoItem["visibility"] })}
                options={VISIBILITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
            </Field>
            <Field label="Rights declaration" hint="A reviewer checks this before approving" htmlFor="v-rights">
              <Select
                id="v-rights"
                value={video.rights}
                onChange={(value) => studio.updateVideo(video.id, { rights: value as RightsDeclaration })}
                options={RIGHTS_OPTIONS}
              />
            </Field>
            <Field label="Tags" hint={`${video.tags.length}/12`}>
              <div className="ws-tagrow">
                <input
                  className="ws-input"
                  value={tagDraft}
                  placeholder="Add a tag and press Enter"
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={addTag}>
                  Add
                </button>
              </div>
              {video.tags.length > 0 ? (
                <div className="ws-chips" style={{ marginTop: 8 }}>
                  {video.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="ws-chip ws-chip--on"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => studio.updateVideo(video.id, { tags: video.tags.filter((entry) => entry !== tag) })}
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className="ws-field__hint">No tags yet.</p>
              )}
            </Field>
            <Field label="Thumbnail" hint="Automatic (first frame) or an image from your device">
              <div className="ws-actions">
                <button
                  type="button"
                  className={`ws-chip${video.thumbnail === "auto" ? " ws-chip--on" : ""}`}
                  onClick={() => studio.updateVideo(video.id, { thumbnail: "auto" })}
                >
                  Auto (first frame)
                </button>
                <label className="ws-chip" style={{ cursor: "pointer" }}>
                  Choose image…
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => pickThumbnail(event.target.files?.[0])}
                  />
                </label>
              </div>
              {thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt="Custom thumbnail preview" className="ws-thumbpreview" />
              ) : (
                <p className="ws-field__hint">Currently using: {video.thumbnail === "auto" ? "automatic frame" : "custom image (session lost)"}</p>
              )}
            </Field>
          </div>
        </Panel>
      </div>

      <div className="ws-split">
        <Panel title="Watch statistics" subtitle="Illustrative demo numbers" actions={<DemoBadge />}>
          <div className="ws-stats ws-stats--tight">
            <Stat label="Views" value={stats.views.toLocaleString()} hint="Demo" />
            <Stat label="Average completion" value={`${stats.completion}%`} hint="Demo" />
            <Stat label="Watch hours" value={stats.watchHours.toLocaleString()} hint="Demo" />
          </div>
          <p className="ws-row__sub">
            These numbers come from a deterministic placeholder function, not from real viewers. A production build needs a playback telemetry
            pipeline and the analytics RLS work from the audit before any figure here can be trusted.
          </p>
        </Panel>

        <Panel
          title="Comments management"
          subtitle={`${comments.visible} visible · ${comments.hidden} hidden`}
          actions={<span className="ws-row__sub">Local demo comments</span>}
        >
          {comments.comments.length === 0 ? (
            <EmptyHint title="No comments yet">Comments appear here once this build has any viewer input.</EmptyHint>
          ) : (
            <ul className="ws-comments">
              {comments.comments.map((comment) => (
                <li key={comment.id} className={`ws-comment ws-comment--${comment.status}`}>
                  <div className="ws-comment__head">
                    <strong>{comment.author}</strong>
                    <span className="ws-mono">{comment.createdAt.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <p className="ws-comment__body">{comment.body}</p>
                  <div className="ws-actions">
                    {comment.status !== "visible" ? (
                      <button type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => comments.restore(comment.id)}>
                        Restore
                      </button>
                    ) : (
                      <button type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => comments.hide(comment.id)}>
                        Hide
                      </button>
                    )}
                    <button
                      type="button"
                      className="kt-btn kt-btn--ghost kt-btn--sm"
                      disabled={comment.status === "removed"}
                      onClick={() => comments.remove(comment.id)}
                    >
                      Remove
                    </button>
                    <span className="ws-row__sub">status: {comment.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="History" subtitle="Every status change with the actor who made it">
        {video.history.length === 0 ? (
          <EmptyHint title="Nothing recorded yet">Move this video through the pipeline to build a history.</EmptyHint>
        ) : (
          <ul className="ws-history">
            {video.history.map((entry) => (
              <li key={entry.id}>
                <span className="ws-mono">{entry.at.slice(0, 16).replace("T", " ")}</span>
                <span>
                  <strong>{entry.action}</strong> by {entry.actor} ({entry.actorRole})
                </span>
                {entry.reason ? <span className="ws-row__sub">{entry.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
