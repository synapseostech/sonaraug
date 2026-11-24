import Link from "next/link";
import { DataTable, Empty, PageHeader, formatDate } from "../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../lib/server/auth.ts";
import { adminChronicles } from "../../../../lib/server/chronicles.ts";
import { EditorialPill } from "../status.tsx";

export const metadata = { title: "Review queue · Medical Chronicles" };

export default async function ReviewQueuePage() {
  const viewer = await requireStaff("chronicles:edit", "/admin/medical-chronicles/review");
  const { episodes, series, users } = await adminChronicles(viewer);
  const queue = episodes.filter((e) => ["in_review", "approved", "changes_requested"].includes(e.status)).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const name = (id: string | null) => users.find((u) => u.id === id)?.displayName ?? "—";
  return (
    <>
      <PageHeader title="Review queue" description="Oldest submissions first. You cannot approve episodes you edited or submitted." />
      <DataTable
        caption="Review queue"
        rows={queue}
        rowKey={(e) => e.id}
        empty={<Empty title="The queue is clear" />}
        columns={[
          { key: "t", header: "Episode", cell: (e) => <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link> },
          { key: "s", header: "Series", cell: (e) => series.find((s) => s.id === e.seriesId)?.title ?? "—" },
          { key: "st", header: "Status", cell: (e) => <EditorialPill status={e.status} /> },
          { key: "by", header: "Submitted by", cell: (e) => `${name(e.submittedBy)}${e.submittedBy === viewer.id || e.lastEditedBy === viewer.id ? " (you)" : ""}` },
          { key: "at", header: "Submitted", cell: (e) => formatDate(e.submittedAt, true) },
        ]}
      />
    </>
  );
}
