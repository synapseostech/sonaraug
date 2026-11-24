import { notFound } from "next/navigation";
import { EpisodeRows, SeriesCard } from "../../../../components/chronicles/bits.tsx";
import { Empty, PageHeader } from "../../../../components/sonara/ui.tsx";
import { getViewer } from "../../../../lib/server/auth.ts";
import { searchChronicles } from "../../../../lib/server/chronicles.ts";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await searchChronicles(await getViewer(), { category: slug });
  if (!result.category) notFound();
  const count = (id: string) => result.episodes.filter((e) => e.series.id === id).length;
  return (
    <div>
      <PageHeader eyebrow={result.category.kind === "specialty" ? "Specialty" : "Topic"} title={result.category.name} description={result.category.description || undefined} />
      {result.series.length === 0 ? (
        <Empty title={`No ${result.category.name} series yet`}>Check back soon, or browse other topics.</Empty>
      ) : (
        <>
          <section className="mc-section">
            <div className="mc-section__head">
              <h2>Series</h2>
            </div>
            <div className="mc-cards">
              {result.series.map((s) => (
                <SeriesCard key={s.id} series={s} episodeCount={count(s.id)} freeCount={s.requiresSubscription ? (s.freeEpisodeAllowance ?? 2) : count(s.id)} />
              ))}
            </div>
          </section>
          <section className="mc-section">
            <div className="mc-section__head">
              <h2>Episodes</h2>
            </div>
            <EpisodeRows views={result.episodes} showSeries />
          </section>
        </>
      )}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug.replace(/-/g, " ")} · Medical Chronicles` };
}
