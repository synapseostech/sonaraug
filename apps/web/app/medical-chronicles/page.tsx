import Link from "next/link";
import { staffCan } from "@kito/auth";
import { Disclaimer, EpisodeRows, SeriesCard } from "../../components/chronicles/bits.tsx";
import { Empty } from "../../components/sonara/ui.tsx";
import { getViewer } from "../../lib/server/auth.ts";
import { publicCatalogue } from "../../lib/server/chronicles.ts";

export const metadata = {
  title: "Medical Chronicles",
  description: "Educational audio programmes on medicine and health, from Sonara. First episodes of every series are free.",
};

export default async function MedicalChroniclesHome() {
  const viewer = await getViewer();
  const { categories, series, episodes, listens, settings } = await publicCatalogue(viewer);
  const countFor = (seriesId: string) => episodes.filter((e) => e.series.id === seriesId).length;
  const freeFor = (s: (typeof series)[number]) => (s.requiresSubscription ? (s.freeEpisodeAllowance ?? settings.defaultFreeEpisodeAllowance) : countFor(s.id));
  const featured = [...series].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, 4);
  const recent = episodes.slice(0, 8);
  const free = episodes.filter((e) => e.tier === "free").slice(0, 6);
  const premium = episodes.filter((e) => e.tier === "premium").slice(0, 6);
  const recommended = [...episodes].sort((a, b) => (listens.get(b.episode.id) ?? 0) - (listens.get(a.episode.id) ?? 0)).slice(0, 6);
  const hasListens = recommended.some((e) => (listens.get(e.episode.id) ?? 0) > 0);
  const used = (id: string) => series.filter((s) => s.categoryId === id || s.specialtyId === id).length;
  const topics = categories.filter((c) => c.kind === "topic");
  const specialties = categories.filter((c) => c.kind === "specialty");

  return (
    <div>
      <section className="mc-hero">
        <div>
          <p className="mc-hero__eyebrow">Sonara editorial · Educational audio</p>
          <h1>Medical Chronicles</h1>
          <p>
            Audio programmes on anatomy, physiology, clinical skills and public health, for students and health workers. The first {settings.defaultFreeEpisodeAllowance}{" "}
            episodes of every series are free; a listener subscription unlocks the rest.
          </p>
          <form action="/medical-chronicles/search" className="mc-search" role="search" aria-label="Search Medical Chronicles">
            <input className="ws-input" type="search" name="q" placeholder="Search topics, series or episodes" aria-label="Search Medical Chronicles" />
            <select className="ws-input ws-input--select" name="category" aria-label="Topic or specialty" defaultValue="">
              <option value="">All topics</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="ws-input ws-input--select" name="access" aria-label="Access" defaultValue="">
              <option value="">Free and premium</option>
              <option value="free">Free only</option>
              <option value="premium">Premium only</option>
            </select>
            <button className="kt-btn kt-btn--primary" type="submit">
              Search
            </button>
          </form>
        </div>
        <div className="mc-hero__aside">
          <Disclaimer />
          <Link className="kt-btn kt-btn--secondary" href="/medical-chronicles/subscribe">
            How the subscription works
          </Link>
        </div>
      </section>

      {series.length === 0 ? (
        <Empty
          title="No series published yet"
          action={
            viewer && staffCan(viewer.roles, "chronicles:edit") ? (
              <Link className="kt-btn kt-btn--primary" href="/admin/medical-chronicles/series/new">
                Create the first series
              </Link>
            ) : null
          }
        >
          Medical Chronicles programmes appear here once the editorial team publishes them.
        </Empty>
      ) : (
        <>
          <section className="mc-section" aria-labelledby="mc-featured">
            <div className="mc-section__head">
              <h2 id="mc-featured">Featured series</h2>
            </div>
            <div className="mc-cards">
              {featured.map((s) => (
                <SeriesCard key={s.id} series={s} episodeCount={countFor(s.id)} freeCount={freeFor(s)} />
              ))}
            </div>
          </section>

          <section className="mc-section" aria-labelledby="mc-recent">
            <div className="mc-section__head">
              <h2 id="mc-recent">Recently published</h2>
              <Link className="sn-link" href="/medical-chronicles/search">
                All episodes
              </Link>
            </div>
            <EpisodeRows views={recent} showSeries />
          </section>

          {hasListens ? (
            <section className="mc-section" aria-labelledby="mc-recommended">
              <div className="mc-section__head">
                <h2 id="mc-recommended">Most played</h2>
                <span className="sn-small">From recorded plays on Sonara</span>
              </div>
              <EpisodeRows views={recommended} showSeries />
            </section>
          ) : null}

          <div className="sn-grid-2 mc-section">
            <section aria-labelledby="mc-free">
              <div className="mc-section__head">
                <h2 id="mc-free">Free to listen</h2>
                <Link className="sn-link" href="/medical-chronicles/search?access=free">
                  More
                </Link>
              </div>
              {free.length ? <EpisodeRows views={free} showSeries /> : <Empty title="No free episodes yet" />}
            </section>
            <section aria-labelledby="mc-premium">
              <div className="mc-section__head">
                <h2 id="mc-premium">Premium</h2>
                <Link className="sn-link" href="/medical-chronicles/search?access=premium">
                  More
                </Link>
              </div>
              {premium.length ? <EpisodeRows views={premium} showSeries /> : <Empty title="No premium episodes yet" />}
            </section>
          </div>
        </>
      )}

      <section className="mc-section" aria-labelledby="mc-topics">
        <div className="mc-section__head">
          <h2 id="mc-topics">Topics</h2>
        </div>
        <div className="mc-chips">
          {topics.map((c) => (
            <Link key={c.id} className="mc-chip" href={`/medical-chronicles/category/${c.slug}`}>
              {c.name}
              {used(c.id) ? ` · ${used(c.id)}` : ""}
            </Link>
          ))}
        </div>
      </section>
      <section className="mc-section" aria-labelledby="mc-specialties">
        <div className="mc-section__head">
          <h2 id="mc-specialties">Specialties</h2>
        </div>
        <div className="mc-chips">
          {specialties.map((c) => (
            <Link key={c.id} className="mc-chip" href={`/medical-chronicles/category/${c.slug}`}>
              {c.name}
              {used(c.id) ? ` · ${used(c.id)}` : ""}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
