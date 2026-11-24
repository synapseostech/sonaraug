import Link from "next/link";
import { DataTable, Empty, PageHeader, formatDate } from "../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../lib/server/auth.ts";
import { adminChronicles } from "../../../../lib/server/chronicles.ts";
import { EditorialPill } from "../status.tsx";

export const metadata = { title: "Episodes · Medical Chronicles admin" };

export default async function EpisodesListPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; series?: string }> }) {
  const viewer = await requireStaff("chronicles:edit", "/admin/medical-chronicles/episodes");
  const params = await searchParams;
  const { series, episodes } = await adminChronicles(viewer);
  const q = (params.q ?? "").toLowerCase();
  const rows = episodes.filter((e) => (!q || e.title.toLowerCase().includes(q)) && (!params.status || e.status === params.status) && (!params.series || e.seriesId === params.series));
  return (
    <>
      <PageHeader title="Episodes" />
      <form className="sn-toolbar" role="search" aria-label="Filter episodes">
        <input className="ws-input" type="search" name="q" defaultValue={params.q} placeholder="Search titles" aria-label="Search titles" />
        <select className="ws-input ws-input--select" name="status" defaultValue={params.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {["draft", "in_review", "changes_requested", "approved", "published", "withdrawn"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select className="ws-input ws-input--select" name="series" defaultValue={params.series ?? ""} aria-label="Series">
          <option value="">Any series</option>
          {series.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <button className="kt-btn kt-btn--secondary kt-btn--sm" type="submit">Filter</button>
      </form>
      <DataTable
        caption="Episodes"
        rows={rows}
        rowKey={(e) => e.id}
        empty={<Empty title="No matching episodes" />}
        columns={[
          { key: "t", header: "Title", cell: (e) => <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link> },
          { key: "s", header: "Series", cell: (e) => series.find((s) => s.id === e.seriesId)?.title ?? "—" },
          { key: "n", header: "#", cell: (e) => `S${e.season ?? 1}·E${e.episodeNumber ?? "–"}` },
          { key: "st", header: "Status", cell: (e) => <EditorialPill status={e.status} publishedAt={e.publishedAt} /> },
          { key: "v", header: "Version", numeric: true, cell: (e) => e.version },
          { key: "u", header: "Updated", cell: (e) => formatDate(e.updatedAt, true) },
        ]}
      />
    </>
  );
}
