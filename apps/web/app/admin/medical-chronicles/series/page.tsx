import Link from "next/link";
import { DataTable, Empty, PageHeader, Pill, formatDate } from "../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../lib/server/auth.ts";
import { adminChronicles } from "../../../../lib/server/chronicles.ts";

export const metadata = { title: "Series · Medical Chronicles admin" };

export default async function SeriesListPage() {
  const viewer = await requireStaff("chronicles:edit", "/admin/medical-chronicles/series");
  const { series, episodes, categories, settings } = await adminChronicles(viewer);
  return (
    <>
      <PageHeader title="Series" actions={<Link className="kt-btn kt-btn--primary kt-btn--sm" href="/admin/medical-chronicles/series/new">New series</Link>} />
      <DataTable
        caption="Medical Chronicles series"
        rows={series}
        rowKey={(s) => s.id}
        empty={<Empty title="No series yet" action={<Link className="kt-btn kt-btn--primary" href="/admin/medical-chronicles/series/new">Create the first series</Link>} />}
        columns={[
          { key: "t", header: "Title", cell: (s) => <Link className="sn-link" href={`/admin/medical-chronicles/series/${s.id}`}>{s.title}</Link> },
          { key: "c", header: "Topic", cell: (s) => categories.find((c) => c.id === s.categoryId)?.name ?? "—" },
          { key: "st", header: "Status", cell: (s) => <Pill tone={s.status === "published" ? "ok" : s.status === "archived" ? "danger" : "neutral"}>{s.status}</Pill> },
          { key: "a", header: "Access", cell: (s) => (s.requiresSubscription ? `${s.freeEpisodeAllowance ?? settings.defaultFreeEpisodeAllowance} free, then premium` : "All free") },
          { key: "e", header: "Episodes", numeric: true, cell: (s) => episodes.filter((e) => e.seriesId === s.id).length },
          { key: "u", header: "Updated", cell: (s) => formatDate(s.updatedAt) },
        ]}
      />
    </>
  );
}
