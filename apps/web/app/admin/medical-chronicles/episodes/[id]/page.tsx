import Link from "next/link";
import { notFound } from "next/navigation";
import { staffCan } from "@kito/auth";
import { describeEditorialError, formatFlashcards, formatQuiz, SOURCE_PROVIDERS, submissionBlockers } from "@kito/chronicles";
import { KeyValues, Notice, PageHeader, Panel, Pill, formatDate } from "../../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../../lib/server/auth.ts";
import { adminEpisode } from "../../../../../lib/server/chronicles.ts";
import { storageStatus } from "../../../../../lib/server/media.ts";
import { groqConfigured } from "../../../../../lib/server/groq.ts";
import { EditorialForms, EpisodeForm, MedicalReviewForm, SourceForm, SourceStatusForm, StudyForm } from "../../forms.tsx";
import { EditorialPill } from "../../status.tsx";
import { EDITORIAL_DONE } from "../../messages.ts";

export default async function EpisodeEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; done?: string }> }) {
  const { id } = await params;
  const { created, done } = await searchParams;
  const viewer = await requireStaff("chronicles:edit", `/admin/medical-chronicles/episodes/${id}`);
  const data = await adminEpisode(viewer, id);
  if (!data || !data.series) notFound();
  const { episode, series, tier, versions, events, corrections, asset, media, name, allowedHosts, seriesEpisodes } = data;
  const canReview = staffCan(viewer.roles, "chronicles:review");
  const isSelf = episode.lastEditedBy === viewer.id || episode.submittedBy === viewer.id;
  const blockers = submissionBlockers({ status: episode.status, version: episode.version, title: episode.title, description: episode.description, hasSource: Boolean(episode.source), references: episode.references, aiDisclosure: episode.aiDisclosure, submittedBy: episode.submittedBy, lastEditedBy: episode.lastEditedBy, approvedVersion: episode.approvedVersion, publishedAt: episode.publishedAt });
  const published = episode.status === "published";
  const storage = storageStatus();

  return (
    <>
      <PageHeader
        eyebrow={<Link className="sn-link" href={`/admin/medical-chronicles/series/${series.id}`}>{series.title}</Link>}
        title={episode.title}
        actions={
          <>
            <EditorialPill status={episode.status} publishedAt={episode.publishedAt} />
            <Link className="kt-btn kt-btn--secondary kt-btn--sm" href={`/medical-chronicles/${episode.slug}`}>Preview page</Link>
          </>
        }
      />
      {created ? <Notice tone="ok">Draft created. Attach audio, add references, then submit for review.</Notice> : null}
      {done && EDITORIAL_DONE[done] ? <Notice tone={EDITORIAL_DONE[done].tone}>{EDITORIAL_DONE[done].text}</Notice> : null}
      {episode.isSample ? <Notice tone="warn">Sample content for local testing.</Notice> : null}
      <div className="sn-admin-grid">
        <div className="sn-stack--lg">
          <Panel title="Audio source" subtitle={episode.source ? SOURCE_PROVIDERS[episode.source.kind].note : "No audio attached yet."}>
            {episode.source ? (
              <KeyValues
                items={[
                  ["Type", SOURCE_PROVIDERS[episode.source.kind].label],
                  ["Playback", SOURCE_PROVIDERS[episode.source.kind].control === "sonara" ? "Sonara player (full controls)" : "Provider-controlled (link out, no progress)"],
                  ["Location", episode.source.url ? <span key="u" className="sn-mono">{episode.source.url}</span> : asset ? `${asset.originalName} · ${asset.mime} · ${Math.round(asset.bytes / 1024)} KB · sha256 ${asset.sha256.slice(0, 12)}…` : "—"],
                  ["Availability", <Pill key="a" tone={episode.source.status === "active" ? "ok" : "danger"}>{episode.source.status}</Pill>],
                ]}
              />
            ) : null}
            {episode.source?.kind === "uploaded_audio" ? (
              <audio controls preload="none" src={`/api/media/${episode.source.assetId}?e=${episode.id}`} style={{ width: "100%", marginTop: 12 }}>
                Your browser cannot play this preview.
              </audio>
            ) : null}
            <hr className="sn-divider" />
            <SourceForm
              episodeId={episode.id}
              published={published}
              current={episode.source ? { kind: episode.source.kind, url: episode.source.url, assetId: episode.source.assetId } : null}
              assets={media.map((m) => ({ value: m.id, label: `${m.originalName} · ${formatDate(m.createdAt)}` }))}
              allowedHosts={allowedHosts}
              uploadsAvailable={storage.available}
              directUpload={storage.backend === "supabase"}
            />
            <p className="sn-small">{storage.note}</p>
            {episode.source ? (
              <>
                <hr className="sn-divider" />
                <SourceStatusForm episodeId={episode.id} status={episode.source.status} note={episode.source.statusNote} />
              </>
            ) : null}
          </Panel>
          <Panel
            title="Study materials (NotebookLM Studio)"
            subtitle={
              episode.study
                ? `${episode.study.flashcards.length} flashcards · ${episode.study.quiz.length} quiz questions · ${episode.study.notes ? "notes attached" : "no notes"}. Subscribers study them on the episode page.`
                : "Flashcards and a quiz from the same notebook. Subscribers study them on the episode page, inside Sonara."
            }
          >
            <StudyForm
              episodeId={episode.id}
              title={episode.title}
              published={published}
              notes={episode.study?.notes ?? ""}
              aiAvailable={groqConfigured()}
              flashcards={episode.study ? formatFlashcards(episode.study.flashcards) : ""}
              quiz={episode.study ? formatQuiz(episode.study.quiz) : ""}
            />
          </Panel>
          <Panel title="Details">
            <EpisodeForm
              seriesId={series.id}
              values={episode}
              published={published}
              canReview={canReview}
              siblings={seriesEpisodes.map((e) => ({ value: e.id, label: e.title }))}
            />
          </Panel>
          <Panel title="Version history" subtitle="Every save creates a version. Snapshots are kept.">
            <ul className="sn-timeline">
              {versions.map((v) => (
                <li key={v.id}>
                  <time>{formatDate(v.createdAt, true)}</time>
                  Version {v.version} by {name(v.editedBy)} — {v.changeNote}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="sn-stack">
          <Panel title="Workflow">
            <KeyValues
              items={[
                ["Status", <EditorialPill key="s" status={episode.status} publishedAt={episode.publishedAt} />],
                ["Listener tier now", <Pill key="t" tone={tier === "free" ? "accent" : "warn"}>{tier}</Pill>],
                ["Version", episode.version],
                ["Last edited by", name(episode.lastEditedBy) ?? "—"],
                ["Submitted by", name(episode.submittedBy) ?? "—"],
                ["Approved", episode.approvedBy ? `v${episode.approvedVersion} by ${name(episode.approvedBy)}` : "—"],
                ["Published", formatDate(episode.publishedAt, true)],
                ["Medical review", episode.lastReviewedAt ? `${formatDate(episode.lastReviewedAt)} by ${name(episode.lastReviewedBy)}` : "None recorded"],
              ]}
            />
            {blockers.length && (episode.status === "draft" || episode.status === "changes_requested") ? (
              <Notice tone="warn" title="Before you can submit">
                <ul className="sn-checklist">
                  {blockers.map((b) => (
                    <li key={b} className="is-todo">{describeEditorialError(b)}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            {canReview && isSelf && (episode.status === "in_review" || episode.status === "approved") ? (
              <Notice tone="info">You edited or submitted this episode, so another reviewer must approve and publish it.</Notice>
            ) : null}
            <EditorialForms
              episodeId={episode.id}
              status={episode.status}
              actions={{ submit: blockers.length === 0, review: canReview && !isSelf, publish: canReview && !isSelf, withdraw: canReview, reopen: true }}
            />
          </Panel>
          {canReview && !isSelf ? (
            <Panel title="Medical review" subtitle="A separate record from publication approval. Listeners see who reviewed which version and when.">
              <MedicalReviewForm episodeId={episode.id} />
            </Panel>
          ) : null}
          <Panel title="Editorial events">
            <ul className="sn-timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <time>{formatDate(e.createdAt, true)}</time>
                  {e.action.replace(/_/g, " ")} by {name(e.actorId)} (v{e.version}){e.note ? ` — ${e.note}` : ""}
                </li>
              ))}
              {events.length === 0 ? <li>No events yet.</li> : null}
            </ul>
          </Panel>
          <Panel title="Corrections">
            <ul className="sn-timeline">
              {corrections.map((c) => (
                <li key={c.id}>
                  <time>{formatDate(c.createdAt, true)}</time>v{c.version}: {c.summary}
                </li>
              ))}
              {corrections.length === 0 ? <li>None.</li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
