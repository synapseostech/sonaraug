import Link from "next/link";
import { DataTable, Empty, PageHeader, formatDate } from "../../../components/sonara/ui.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";
import { savedEpisodes } from "../../../lib/server/users.ts";

export const metadata = { title: "Saved" };

export default async function SavedPage() {
  const viewer = await requireViewer("/account/saved");
  const rows = await savedEpisodes(viewer);
  return (
    <>
      <PageHeader title="Saved episodes" description="Medical Chronicles episodes you saved. Saved radio stations and shows stay in your on-device Library." />
      <DataTable
        caption="Saved episodes"
        rows={rows}
        rowKey={(r) => r.saved.episodeId}
        empty={<Empty title="No saved episodes" action={<Link className="kt-btn kt-btn--primary" href="/medical-chronicles">Find something to save</Link>} />}
        columns={[
          { key: "ep", header: "Episode", cell: (r) => (r.episode ? <Link className="sn-link" href={`/medical-chronicles/${r.episode.slug}`}>{r.episode.title}</Link> : "Removed episode") },
          { key: "series", header: "Series", cell: (r) => r.series?.title ?? "—" },
          { key: "when", header: "Saved", cell: (r) => formatDate(r.saved.savedAt) },
        ]}
      />
    </>
  );
}
