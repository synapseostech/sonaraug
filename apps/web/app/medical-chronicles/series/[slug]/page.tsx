import Link from "next/link";
import { notFound } from "next/navigation";
import { Artwork } from "@kito/ui";
import { Disclaimer, EpisodeRows, SeriesCard } from "../../../../components/chronicles/bits.tsx";
import { Empty, Notice } from "../../../../components/sonara/ui.tsx";
import { getViewer } from "../../../../lib/server/auth.ts";
import { seriesBySlug } from "../../../../lib/server/chronicles.ts";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await seriesBySlug(slug, null);
  if (!result) return { title: "Series not found" };
  return { title: result.series.seoTitle || `${result.series.title} · Medical Chronicles`, description: result.series.seoDescription || result.series.description.slice(0, 160) };
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  const result = await seriesBySlug(slug, viewer);
  if (!result) notFound();
  const { series, episodes, category, specialty, related, preview, settings } = result;
  const allowance = series.freeEpisodeAllowance ?? settings.defaultFreeEpisodeAllowance;
  const locked = episodes.filter((e) => !e.access.allowed).length;

  return (
    <div>
      {preview ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title="Staff preview">
            This series is not published. Listeners cannot see it.
          </Notice>
        </div>
      ) : null}
      {series.isSample ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title="Sample content">
            This series was generated for local testing. Its audio is a test tone, not a medical programme.
          </Notice>
        </div>
      ) : null}
      <header className="mc-series-hero">
        <div className="mc-series-hero__art">
          <Artwork seed={series.id} title={series.title} />
        </div>
        <div>
          <p className="sn-head__eyebrow">
            Series{category ? ` · ${category.name}` : ""}
            {specialty ? ` · ${specialty.name}` : ""}
          </p>
          <h1 className="mc-episode__title">{series.title}</h1>
          <p className="sn-head__desc">{series.description}</p>
          <p className="sn-small">
            {series.hostDisplay ? `Host: ${series.hostDisplay}` : null}
            {series.hostDisplay && series.editorDisplay ? " · " : null}
            {series.editorDisplay ? `Editor: ${series.editorDisplay}` : null}
          </p>
          <div className="sn-row">
            {series.requiresSubscription ? (
              <span className="sn-pill sn-pill--accent">
                First {allowance} episode{allowance === 1 ? "" : "s"} free
              </span>
            ) : (
              <span className="sn-pill sn-pill--accent">All episodes free</span>
            )}
            {locked > 0 ? (
              <Link className="kt-btn kt-btn--primary kt-btn--sm" href="/subscribe/listener">
                Unlock {locked} premium episode{locked === 1 ? "" : "s"}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mc-section" aria-labelledby="eps">
        <div className="mc-section__head">
          <h2 id="eps">Episodes</h2>
          <span className="sn-small">In published order</span>
        </div>
        {episodes.length ? <EpisodeRows views={episodes} /> : <Empty title="No episodes published yet" />}
      </section>

      <div className="mc-section">
        <Disclaimer />
      </div>

      {related.length ? (
        <section className="mc-section" aria-labelledby="rel">
          <div className="mc-section__head">
            <h2 id="rel">Related series</h2>
          </div>
          <div className="mc-cards">
            {related.map((s) => (
              <SeriesCard key={s.id} series={s} episodeCount={0} freeCount={0} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
