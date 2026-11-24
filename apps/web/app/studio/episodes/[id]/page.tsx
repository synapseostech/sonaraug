"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@kito/ui";
import { episodePublishBlockers, formatRssDuration, transitionsFrom } from "@kito/studio";
import type { PublicationStatus, RightsDeclaration } from "@kito/studio";
import {
  ActionRow,
  BackLink,
  Field,
  LinkButton,
  Notice,
  PageHead,
  Panel,
  PublicationPill,
  ReviewPill,
  Select,
  StatusPill,
  TextArea,
  TextInput,
  WorkflowStepper,
} from "../../../../components/studio-ui.tsx";
import { objectUrlFor, registerObjectUrl, useStudio } from "../../../../lib/studio/store.tsx";

const RIGHTS_OPTIONS: readonly { value: RightsDeclaration; label: string }[] = [
  { value: "undisclosed", label: "Not declared yet" },
  { value: "original", label: "Original — recorded by me" },
  { value: "licensed", label: "Licensed music/sound used" },
  { value: "broadcaster_authorised", label: "Authorised by a broadcaster" },
];

/** Read a local file's duration without uploading it anywhere. */
function durationOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const value = Number.isFinite(audio.duration) ? Math.round(audio.duration) : null;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

export default function EpisodeEditorPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const studio = useStudio();
  const [message, setMessage] = useState<string | null>(null);

  const episode = studio.state.episodes.find((entry) => entry.id === id);
  const show = episode ? studio.showFor(episode.showId) : undefined;

  if (!episode) {
    return (
      <EmptyState
        title="Episode not found"
        description="It may have been removed from this local workspace."
        action={
          <Link href="/studio/episodes" className="kt-btn kt-btn--secondary kt-btn--sm">
            Back to episodes
          </Link>
        }
      />
    );
  }

  const blockers = episodePublishBlockers(episode, show);
  const asset = episode.mediaAssetId ? studio.state.media.find((entry) => entry.id === episode.mediaAssetId) : undefined;
  const previewUrl = episode.mediaAssetId ? objectUrlFor(episode.mediaAssetId) : null;

  const move = (to: PublicationStatus) => {
    const result = studio.transitionEpisode(episode.id, to);
    setMessage(result.ok ? `Moved to ${to}.` : result.reason);
  };

  const onUpload = async (file: File) => {
    const duration = await durationOf(file);
    const created = studio.attachMediaToEpisode(episode.id, {
      name: file.name,
      kind: "upload",
      mimeType: file.type || "audio/mpeg",
      sizeBytes: file.size,
      durationSeconds: duration,
      source: "Selected from this device",
    });
    registerObjectUrl(created.id, URL.createObjectURL(file));
    setMessage(`Attached “${file.name}”. It stays on this device.`);
  };

  const allowed = transitionsFrom(episode.publicationStatus);

  return (
    <>
      <BackLink href={show ? `/studio/podcasts/${show.slug}` : "/studio/episodes"}>{show?.title ?? "Episodes"}</BackLink>

      <PageHead
        title={episode.title}
        description={`Season ${episode.seasonNumber}, episode ${episode.number}${episode.durationSeconds ? ` · ${formatRssDuration(episode.durationSeconds)}` : ""}`}
        actions={
          <>
            <PublicationPill status={episode.publicationStatus} />
            <ReviewPill status={episode.reviewStatus} />
          </>
        }
      />

      {message ? <Notice tone={/cannot|must|blocked|not/i.test(message) ? "warn" : "ok"}>{message}</Notice> : null}
      {episode.reviewNote ? (
        <Notice tone={episode.reviewStatus === "approved" ? "ok" : "warn"}>
          <strong>Reviewer note.</strong> {episode.reviewNote}
        </Notice>
      ) : null}

      <Panel title="Publication pipeline" subtitle="Only a reviewer can approve. Publishing updates local state only.">
        <WorkflowStepper status={episode.publicationStatus} />
        <ActionRow>
          {allowed.map((to) => (
            <button key={to} type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => move(to)}>
              Move to {to}
            </button>
          ))}
        </ActionRow>
        {blockers.length > 0 ? (
          <Notice tone="warn">
            <strong>{blockers.length} thing{blockers.length === 1 ? "" : "s"} would block publishing:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          </Notice>
        ) : (
          <Notice tone="ok">Nothing is blocking this episode — the next reviewer approval can schedule it.</Notice>
        )}
      </Panel>

      <div className="ws-cols">
        <Panel title="Metadata" subtitle="Feeds the RSS item and the listener catalogue">
          <Field label="Title" htmlFor="ep-title">
            <TextInput id="ep-title" value={episode.title} onChange={(value) => studio.updateEpisode(episode.id, { title: value })} />
          </Field>
          <Field label="Episode artwork" hint="Optional. Falls back to the show artwork; a chosen image lives in this session only.">
            <div className="ws-row" style={{ alignItems: "center", gap: 10 }}>
              {objectUrlFor(`art:ep:${episode.id}`) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={objectUrlFor(`art:ep:${episode.id}`) ?? ""} alt="" className="ws-row__art" />
              ) : (
                <span className="ws-row__art" aria-hidden="true">
                  no art
                </span>
              )}
              <label className="kt-btn kt-btn--secondary kt-btn--sm" style={{ cursor: "pointer" }}>
                Choose image…
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    registerObjectUrl(`art:ep:${episode.id}`, URL.createObjectURL(file));
                    setMessage("Episode artwork selected for this session. Nothing was uploaded.");
                  }}
                />
              </label>
            </div>
          </Field>
          <Field label="Description" htmlFor="ep-desc" hint="At least 20 characters before review.">
            <TextArea id="ep-desc" value={episode.description} onChange={(value) => studio.updateEpisode(episode.id, { description: value })} rows={4} />
          </Field>
          <div className="ws-form-grid">
            <Field label="Season" htmlFor="ep-season">
              <TextInput
                id="ep-season"
                type="number"
                value={String(episode.seasonNumber)}
                onChange={(value) => studio.updateEpisode(episode.id, { seasonNumber: Math.max(1, Number(value) || 1) })}
              />
            </Field>
            <Field label="Episode number" htmlFor="ep-number">
              <TextInput
                id="ep-number"
                type="number"
                value={String(episode.number)}
                onChange={(value) => studio.updateEpisode(episode.id, { number: Math.max(1, Number(value) || 1) })}
              />
            </Field>
          </div>
          <Field label="Rights declaration" htmlFor="ep-rights" hint="A reviewer checks this — it cannot be skipped.">
            <Select
              id="ep-rights"
              value={episode.rights}
              onChange={(value) => studio.updateEpisode(episode.id, { rights: value as RightsDeclaration })}
              options={RIGHTS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          </Field>
          <label className="ws-check">
            <input
              type="checkbox"
              checked={episode.explicit}
              onChange={(event) => studio.updateEpisode(episode.id, { explicit: event.target.checked })}
            />
            <span>Explicit content (adds the advisory flag to the feed item)</span>
          </label>
          <Field
            label="Publication date"
            htmlFor="ep-schedule"
            hint="Optional. Scheduling and publishing are local state changes — nothing is distributed."
          >
            {episode.publicationStatus === "published" ? (
              <TextInput value={episode.publishedAt?.slice(0, 16).replace("T", " ") ?? "Published"} onChange={() => undefined} disabled />
            ) : (
              <input
                id="ep-schedule"
                className="ws-input"
                type="datetime-local"
                value={episode.scheduledFor?.slice(0, 16) ?? ""}
                onChange={(event) =>
                  studio.updateEpisode(episode.id, { scheduledFor: event.target.value ? new Date(event.target.value).toISOString() : null })
                }
              />
            )}
          </Field>
        </Panel>

        <div className="ws-stack">
          <Panel title="Audio" subtitle="Recorded or selected on this device">
            {asset ? (
              <div className="ws-stack">
                <div className="ws-row">
                  <div className="ws-row__body">
                    <p className="ws-row__title">{asset.name}</p>
                    <p className="ws-row__sub">
                      {asset.source} · {(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      {asset.durationSeconds ? ` · ${formatRssDuration(asset.durationSeconds)}` : ""}
                    </p>
                  </div>
                  <StatusPill kind="plain" value={asset.kind} />
                </div>
                {previewUrl ? (
                  <audio controls src={previewUrl} style={{ width: "100%" }} />
                ) : (
                  <Notice tone="warn">
                    This file was saved in an earlier session. The metadata is here, but the audio blob is gone — local files are not
                    persisted across reloads. Record or select the file again to preview it.
                  </Notice>
                )}
                <ActionRow>
                  <LinkButton href={`/studio/record?episode=${episode.id}`}>Re-record</LinkButton>
                </ActionRow>
              </div>
            ) : (
              <div className="ws-stack">
                <p className="ws-row__sub" style={{ margin: 0 }}>
                  No audio attached yet. Episodes cannot enter review without it.
                </p>
                <ActionRow>
                  <LinkButton href={`/studio/record?episode=${episode.id}`} variant="primary">
                    Open recording studio
                  </LinkButton>
                </ActionRow>
              </div>
            )}

            <Field label="Or select an audio file" htmlFor="ep-file" hint="Local file only — nothing is uploaded.">
              <input
                id="ep-file"
                className="ws-input"
                type="file"
                accept="audio/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUpload(file);
                }}
              />
            </Field>
          </Panel>

          <Panel title="History" subtitle="Every transition is recorded">
            {episode.history.length === 0 ? (
              <p className="ws-row__sub" style={{ margin: 0 }}>
                No transitions yet.
              </p>
            ) : (
              <div className="ws-stack">
                {episode.history.map((entry) => (
                  <div key={entry.id} className="ws-row" style={{ padding: "8px 10px" }}>
                    <div className="ws-row__body">
                      <p className="ws-row__title" style={{ fontSize: 13 }}>
                        {entry.action}
                      </p>
                      <p className="ws-row__sub">
                        {entry.actor} · {entry.actorRole} · {new Date(entry.at).toLocaleString()}
                      </p>
                    </div>
                    {entry.fromStatus && entry.toStatus ? (
                      <span className="ws-mono">
                        {entry.fromStatus} → {entry.toStatus}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
