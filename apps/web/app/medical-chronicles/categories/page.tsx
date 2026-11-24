import Link from "next/link";
import { PageHeader } from "../../../components/sonara/ui.tsx";
import { getViewer } from "../../../lib/server/auth.ts";
import { publicCatalogue } from "../../../lib/server/chronicles.ts";

export const metadata = { title: "Topics and specialties · Medical Chronicles" };

export default async function CategoriesPage() {
  const { categories, series, episodes } = await publicCatalogue(await getViewer());
  const groups = [
    { kind: "topic", title: "Topics" },
    { kind: "specialty", title: "Specialties" },
  ] as const;
  return (
    <div>
      <PageHeader title="Topics and specialties" description="Browse Medical Chronicles by subject. Categories are managed by the Sonara editorial team." />
      {groups.map((group) => (
        <section key={group.kind} className="mc-section" aria-labelledby={`g-${group.kind}`}>
          <div className="mc-section__head">
            <h2 id={`g-${group.kind}`}>{group.title}</h2>
          </div>
          <div className="mc-cards">
            {categories
              .filter((c) => c.kind === group.kind)
              .map((c) => {
                const s = series.filter((x) => x.categoryId === c.id || x.specialtyId === c.id);
                const n = episodes.filter((e) => s.some((x) => x.id === e.series.id)).length;
                return (
                  <Link key={c.id} href={`/medical-chronicles/category/${c.slug}`} className="mc-card">
                    <p className="mc-card__title">{c.name}</p>
                    <p className="mc-card__meta">
                      {s.length} series · {n} episode{n === 1 ? "" : "s"}
                    </p>
                    {c.description ? <p className="mc-card__meta">{c.description}</p> : null}
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
