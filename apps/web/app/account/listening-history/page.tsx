import Link from "next/link";
import { DataTable, Empty, PageHeader, formatDate } from "../../../components/sonara/ui.tsx";
import { formatDuration } from "../../../lib/format.ts";
import { requireViewer } from "../../../lib/server/auth.ts";
import { listeningHistory } from "../../../lib/server/users.ts";

export const metadata = { title: "Listening history" };

export default async function ListeningHistoryPage() {
  const viewer = await requireViewer("/account/listening-history");
  const rows = await listeningHistory(viewer);
  return (
    <>
      <PageHeader title="Listening history" description="Medical Chronicles episodes you started while signed in. Radio, podcasts and video history is kept on this device in your Library." />
      <DataTable
        caption="Listening history"
        rows={rows}
        rowKey={(r) => r.entry.id}
        empty={<Empty title="Nothing yet" action={<Link className="kt-btn kt-btn--primary" href="/medical-chronicles">Browse Medical Chronicles</Link>} />}
        columns={[
          { key: "when", header: "Started", cell: (r) => formatDate(r.entry.startedAt, true) },
          { key: "ep", header: "Episode", cell: (r) => (r.episode ? <Link className="sn-link" href={`/medical-chronicles/${r.episode.slug}`}>{r.episode.title}</Link> : "Removed episode") },
          { key: "series", header: "Series", cell: (r) => r.series?.title ?? "—" },
          {
            key: "pos",
            header: "Progress",
            cell: (r) => (r.entry.control === "provider" ? "Played on NotebookLM (not tracked)" : r.entry.lastPositionSeconds ? `${formatDuration(r.entry.lastPositionSeconds)}${r.entry.durationSeconds ? ` of ${formatDuration(r.entry.durationSeconds)}` : ""}` : "Started"),
          },
        ]}
      />
    </>
  );
}
