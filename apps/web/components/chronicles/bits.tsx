import Link from "next/link";
import { Artwork, LockIcon } from "@kito/ui";
import { AI_DISCLOSURE_LABEL, MEDICAL_DISCLAIMER } from "@kito/chronicles";
import type { EpisodeView } from "../../lib/server/chronicles.ts";
import type { McSeries } from "../../lib/server/types.ts";
import { formatDuration } from "../../lib/format.ts";
import { formatDate } from "../sonara/ui.tsx";

export function TierBadge({ view }: { view: Pick<EpisodeView, "tier" | "access"> }) {
  if (view.tier === "free") return <span className="mc-free">Free</span>;
  if (view.access.allowed) return <span className="mc-free">Included</span>;
  return (
    <span className="mc-lock">
      <LockIcon size={13} /> Premium
    </span>
  );
}

export function SourceBadge({ control }: { control: EpisodeView["control"] }) {
  if (control === "provider") return <span className="sn-pill sn-pill--info">Plays on NotebookLM</span>;
  if (control === "sonara") return <span className="sn-pill sn-pill--accent">Sonara player</span>;
  return <span className="sn-pill">Audio coming soon</span>;
}

export function EpisodeRows({ views, showSeries = false }: { views: EpisodeView[]; showSeries?: boolean }) {
  return (
    <div className="mc-episodes">
      {views.map((view) => (
        <div className="mc-ep" key={view.episode.id}>
          <span className="mc-ep__index" aria-hidden="true">
            {view.episode.episodeNumber ?? view.position ?? "·"}
          </span>
          <div>
            <p className="mc-ep__title">
              <Link href={`/medical-chronicles/${view.episode.slug}`}>{view.episode.title}</Link>
            </p>
            <p className="mc-ep__meta">
              {showSeries ? <span>{view.series.title}</span> : null}
              {view.episode.season ? <span>S{view.episode.season} · E{view.episode.episodeNumber ?? "–"}</span> : null}
              {view.episode.durationSeconds ? <span>{formatDuration(view.episode.durationSeconds)}</span> : null}
              <span>{formatDate(view.episode.publishedAt)}</span>
              {view.episode.aiDisclosure && view.episode.aiDisclosure !== "human_produced" ? <span>{AI_DISCLOSURE_LABEL[view.episode.aiDisclosure]}</span> : null}
              {view.episode.status !== "published" ? <span className="sn-pill sn-pill--warn">{view.episode.status.replace("_", " ")} · staff preview</span> : null}
            </p>
          </div>
          <div className="mc-ep__side">
            <TierBadge view={view} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SeriesCard({ series, episodeCount, freeCount }: { series: McSeries; episodeCount: number; freeCount: number }) {
  return (
    <Link href={`/medical-chronicles/series/${series.slug}`} className="mc-card">
      <div className="mc-card__art">
        <Artwork seed={series.id} title={series.title} />
      </div>
      <p className="mc-card__title">{series.title}</p>
      <p className="mc-card__meta">
        {episodeCount} episode{episodeCount === 1 ? "" : "s"}
        {series.requiresSubscription ? ` · ${Math.min(freeCount, episodeCount)} free` : " · all free"}
        {series.isSample ? " · sample" : ""}
      </p>
    </Link>
  );
}

export function Disclaimer() {
  return (
    <aside className="mc-disclaimer" aria-label="Educational content notice">
      <strong>Educational content.</strong> {MEDICAL_DISCLAIMER}
    </aside>
  );
}
