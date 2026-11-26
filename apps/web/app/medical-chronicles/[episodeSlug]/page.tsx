import Link from "next/link";
import { notFound } from "next/navigation";
import { staffCan } from "@kito/auth";
import { AI_DISCLAIMER, AI_DISCLOSURE_LABEL } from "@kito/chronicles";
import { Disclaimer, SourceBadge, TierBadge } from "../../../components/chronicles/bits.tsx";
import { EpisodePlayer, SaveEpisodeButton } from "../../../components/chronicles/episode-player.tsx";
import { StudyStudio, StudyTeaser } from "../../../components/chronicles/study-studio.tsx";
import { Notice, Panel, formatDate } from "../../../components/sonara/ui.tsx";
import { formatDuration } from "../../../lib/format.ts";
import { getViewer } from "../../../lib/server/auth.ts";
import { episodeBySlug, playbackDescriptor } from "../../../lib/server/chronicles.ts";
import { groqConfigured } from "../../../lib/server/groq.ts";

export async function generateMetadata({ params }: { params: Promise<{ episodeSlug: string }> }) {
  const { episodeSlug } = await params;
  const result = await episodeBySlug(episodeSlug, null);
  if (!result) return { title: "Episode not found" };
  return { title: `${result.view.episode.title} · Medical Chronicles`, description: result.view.episode.description.slice(0, 160) };
}

export default async function EpisodePage({ params }: { params: Promise<{ episodeSlug: string }> }) {
  const { episodeSlug } = await params;
  const viewer = await getViewer();
  const result = await episodeBySlug(episodeSlug, viewer);
  if (!result) notFound();
  const { view, study, studySummary, extras, previous, next, corrections, reviewer, related, saved, preview, category } = result;
  const { episode, series } = view;
  const descriptor = playbackDescriptor(view);
  const aiProduced = episode.aiDisclosure === "ai_generated" || episode.aiDisclosure === "ai_assisted";
  const withdrawn = episode.status === "withdrawn";

  return (
    <div>
      {preview && !withdrawn ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title="Staff preview">
            Status: {episode.status.replace("_", " ")}. Listeners cannot see this episode.
            {viewer && staffCan(viewer.roles, "chronicles:edit") ? (
              <>
                {" "}
                <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${episode.id}`}>
                  Open in the editor
                </Link>
              </>
            ) : null}
          </Notice>
        </div>
      ) : null}
      {withdrawn ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="danger" title="This episode has been withdrawn">
            {episode.withdrawnReason ? `Reason: ${episode.withdrawnReason}. ` : ""}It is no longer available to play.
          </Notice>
        </div>
      ) : null}
      <nav aria-label="Breadcrumb" className="sn-small" style={{ marginBottom: 12 }}>
        <Link className="sn-link" href={`/medical-chronicles/series/${series.slug}`}>
          {series.title}
        </Link>
        {category ? <> · {category.name}</> : null}
      </nav>

      <div className="mc-episode">
        <div className="sn-stack--lg">
          <header>
            <h1 className="mc-episode__title">{episode.title}</h1>
            <p className="mc-ep__meta">
              {episode.season ? <span>Season {episode.season}</span> : null}
              {episode.episodeNumber !== null ? <span>Episode {episode.episodeNumber}</span> : null}
              {episode.durationSeconds ? <span>{formatDuration(episode.durationSeconds)}</span> : null}
              <span>Published {formatDate(episode.publishedAt)}</span>
              <TierBadge view={view} />
              <SourceBadge control={view.control} />
              {episode.aiDisclosure ? <span className={`sn-pill ${aiProduced ? "sn-pill--warn" : ""}`}>{AI_DISCLOSURE_LABEL[episode.aiDisclosure]}</span> : null}
            </p>
          </header>

          {episode.description ? (
            <div className="sn-prose">
              {episode.description.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : null}

          {aiProduced ? <Notice tone="warn" title="AI-generated audio">{AI_DISCLAIMER}</Notice> : null}

          {!withdrawn && view.access.allowed && (study || studySummary?.notes) ? (
            <StudyStudio
              episodeId={episode.id}
              slug={episode.slug}
              study={study}
              extras={extras}
              notesExist={Boolean(studySummary?.notes)}
              aiAvailable={groqConfigured()}
              signedIn={Boolean(viewer)}
            />
          ) : null}
          {!withdrawn && !view.access.allowed && studySummary && descriptor.state === "locked" ? (
            <StudyTeaser flashcards={studySummary.flashcards} questions={studySummary.questions} notes={studySummary.notes} slug={episode.slug} signedIn={Boolean(viewer)} />
          ) : null}

          <Panel title="Editorial record" subtitle="Publishing an episode is not the same as a clinical verification.">
            <ul className="sn-checklist">
              <li className="is-done">Approved for publication by the Sonara editorial team</li>
              <li className={episode.lastReviewedAt ? "is-done" : "is-todo"}>
                {episode.lastReviewedAt
                  ? `Medical review recorded on ${formatDate(episode.lastReviewedAt)}${reviewer ? ` by ${reviewer}` : ""} (version ${episode.version})`
                  : "No separate medical review has been recorded for this episode"}
              </li>
              <li className={corrections.length ? "is-done" : "is-todo"}>
                {corrections.length ? `${corrections.length} correction${corrections.length === 1 ? "" : "s"} published (see below)` : "No corrections published"}
              </li>
            </ul>
          </Panel>

          <Panel title="References and source material">
            {episode.references.length ? (
              <ol className="mc-refs">
                {episode.references.map((r, i) => (
                  <li key={i}>
                    {r.url && /^https:\/\//.test(r.url) ? (
                      <a className="sn-link" href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                    {r.citation ? <span className="sn-small"> — {r.citation}</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sn-small">No references listed.</p>
            )}
          </Panel>

          {episode.contentNotes ? (
            <Panel title="Content notes">
              <p className="sn-prose" style={{ margin: 0 }}>
                {episode.contentNotes}
              </p>
            </Panel>
          ) : null}

          {episode.transcript && descriptor.state === "ready" ? (
            <Panel title="Transcript">
              <div className="mc-transcript" tabIndex={0} aria-label="Transcript">
                {episode.transcript}
              </div>
            </Panel>
          ) : null}

          {corrections.length ? (
            <Panel title="Corrections">
              <ul className="sn-timeline">
                {corrections.map((c) => (
                  <li key={c.id}>
                    <time dateTime={c.createdAt}>{formatDate(c.createdAt, true)} · version {c.version}</time>
                    {c.summary}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Disclaimer />
        </div>

        <aside className="sn-stack">
          {withdrawn ? null : (
            <EpisodePlayer
              episodeId={episode.id}
              slug={episode.slug}
              title={episode.title}
              seriesTitle={series.title}
              seriesId={series.id}
              durationSeconds={episode.durationSeconds}
              descriptor={descriptor}
              signedIn={Boolean(viewer)}
            />
          )}
          <div className="sn-row">
            <SaveEpisodeButton episodeId={episode.id} saved={saved} signedIn={Boolean(viewer)} />
          </div>
          <Panel title="In this series">
            <div className="sn-stack">
              {previous ? (
                <Link className="sn-link" href={`/medical-chronicles/${previous.slug}`}>
                  ← Previous episode
                </Link>
              ) : null}
              {next ? (
                <Link className="sn-link" href={`/medical-chronicles/${next.slug}`}>
                  Next episode →
                </Link>
              ) : null}
              <Link className="sn-link" href={`/medical-chronicles/series/${series.slug}`}>
                All episodes
              </Link>
            </div>
          </Panel>
          {related.length ? (
            <Panel title="Related episodes">
              <ul className="sn-timeline">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link className="sn-link" href={`/medical-chronicles/${r.slug}`}>
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
