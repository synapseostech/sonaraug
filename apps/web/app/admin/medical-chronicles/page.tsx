import Link from "next/link";
import { DataTable, Empty, PageHeader, Panel, Stat, Stats, formatDate } from "../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../lib/server/auth.ts";
import { adminChronicles } from "../../../lib/server/chronicles.ts";
import { EditorialPill } from "./status.tsx";

export const metadata = { title: "Medical Chronicles · Admin" };

export default async function McDashboard() {
  const viewer = await requireStaff("chronicles:edit", "/admin/medical-chronicles");
  const { series, episodes, corrections } = await adminChronicles(viewer);
  const count = (s: string) => episodes.filter((e) => e.status === s).length;
  const unavailable = episodes.filter((e) => e.source && e.source.status !== "active");
  const scheduled = episodes.filter((e) => e.status === "published" && e.publishedAt && Date.parse(e.publishedAt) > Date.now());
  const noSource = episodes.filter((e) => !e.source && e.status !== "withdrawn");
  const seriesTitle = (id: string) => series.find((s) => s.id === id)?.title ?? "—";
  return (
    <>
      <PageHeader
        title="Medical Chronicles"
        description="Sonara-owned educational audio. Editors draft; a different reviewer approves and publishes."
        actions={
          <>
            <Link className="kt-btn kt-btn--primary kt-btn--sm" href="/admin/medical-chronicles/series/new">New series</Link>
            <Link className="kt-btn kt-btn--secondary kt-btn--sm" href="/medical-chronicles">View public pages</Link>
          </>
        }
      />
      <Stats>
        <Stat label="Series" value={series.length} hint={`${series.filter((s) => s.status === "published").length} published`} />
        <Stat label="Drafts" value={count("draft")} />
        <Stat label="In review" value={count("in_review")} tone={count("in_review") ? "warn" : undefined} />
        <Stat label="Approved, unpublished" value={count("approved")} />
        <Stat label="Published" value={count("published")} tone="ok" />
        <Stat label="Withdrawn" value={count("withdrawn")} />
        <Stat label="Sources unavailable" value={unavailable.length} tone={unavailable.length ? "warn" : undefined} />
      </Stats>
      <div className="sn-grid-2">
        <Panel title="Waiting for review" actions={<Link className="sn-link" href="/admin/medical-chronicles/review">Review queue</Link>}>
          <DataTable
            caption="Episodes in review"
            rows={episodes.filter((e) => e.status === "in_review" || e.status === "approved")}
            rowKey={(e) => e.id}
            empty={<Empty title="Nothing waiting" />}
            columns={[
              { key: "t", header: "Episode", cell: (e) => <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link> },
              { key: "s", header: "Series", cell: (e) => seriesTitle(e.seriesId) },
              { key: "st", header: "Status", cell: (e) => <EditorialPill status={e.status} /> },
            ]}
          />
        </Panel>
        <Panel title="Needs attention">
          <ul className="sn-timeline">
            {unavailable.map((e) => (
              <li key={e.id}>
                Source unavailable: <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link>
              </li>
            ))}
            {noSource.slice(0, 10).map((e) => (
              <li key={e.id}>
                No audio attached: <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link>
              </li>
            ))}
            {scheduled.map((e) => (
              <li key={e.id}>
                Scheduled for {formatDate(e.publishedAt, true)}: <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link>
              </li>
            ))}
            {unavailable.length + noSource.length + scheduled.length === 0 ? <li>Nothing needs attention.</li> : null}
          </ul>
        </Panel>
        <Panel title="Recently updated">
          <DataTable
            caption="Recently updated episodes"
            rows={episodes.slice(0, 8)}
            rowKey={(e) => e.id}
            empty={<Empty title="No episodes yet" />}
            columns={[
              { key: "t", header: "Episode", cell: (e) => <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link> },
              { key: "st", header: "Status", cell: (e) => <EditorialPill status={e.status} publishedAt={e.publishedAt} /> },
              { key: "u", header: "Updated", cell: (e) => formatDate(e.updatedAt, true) },
            ]}
          />
        </Panel>
        <Panel title="Recent corrections">
          {corrections.length ? (
            <ul className="sn-timeline">
              {[...corrections].reverse().slice(0, 8).map((c) => (
                <li key={c.id}>
                  <time>{formatDate(c.createdAt, true)}</time>
                  {episodes.find((e) => e.id === c.episodeId)?.title}: {c.summary}
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No corrections yet" />
          )}
        </Panel>
      </div>
    </>
  );
}
