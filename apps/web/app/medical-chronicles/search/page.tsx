import { EpisodeRows, SeriesCard } from "../../../components/chronicles/bits.tsx";
import { Empty, PageHeader } from "../../../components/sonara/ui.tsx";
import { getViewer } from "../../../lib/server/auth.ts";
import { searchChronicles } from "../../../lib/server/chronicles.ts";

export const metadata = { title: "Search · Medical Chronicles" };

export default async function McSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; access?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 120);
  const access = params.access === "free" || params.access === "premium" ? params.access : "";
  const result = await searchChronicles(await getViewer(), { q, category: params.category, access });
  return (
    <div>
      <PageHeader title="Search Medical Chronicles" />
      <form className="mc-search" role="search" aria-label="Search Medical Chronicles" style={{ marginBottom: 24 }}>
        <input className="ws-input" type="search" name="q" defaultValue={q} placeholder="Topic, series, episode or reference" aria-label="Search terms" />
        <select className="ws-input ws-input--select" name="category" defaultValue={params.category ?? ""} aria-label="Topic or specialty">
          <option value="">All topics</option>
          {result.categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="ws-input ws-input--select" name="access" defaultValue={access} aria-label="Access">
          <option value="">Free and premium</option>
          <option value="free">Free only</option>
          <option value="premium">Premium only</option>
        </select>
        <button className="kt-btn kt-btn--primary" type="submit">
          Search
        </button>
      </form>
      <p className="sn-small" role="status">
        {result.series.length} series · {result.episodes.length} episode{result.episodes.length === 1 ? "" : "s"}
      </p>
      {result.series.length ? (
        <section className="mc-section">
          <div className="mc-section__head">
            <h2>Series</h2>
          </div>
          <div className="mc-cards">
            {result.series.map((s) => (
              <SeriesCard key={s.id} series={s} episodeCount={result.episodes.filter((e) => e.series.id === s.id).length} freeCount={s.freeEpisodeAllowance ?? 2} />
            ))}
          </div>
        </section>
      ) : null}
      <section className="mc-section">
        <div className="mc-section__head">
          <h2>Episodes</h2>
        </div>
        {result.episodes.length ? <EpisodeRows views={result.episodes} showSeries /> : <Empty title="No matching episodes">Try a broader term or another topic.</Empty>}
      </section>
    </div>
  );
}
