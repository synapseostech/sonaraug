import Link from "next/link";
import { notFound } from "next/navigation";
import { staffCan } from "@kito/auth";
import { episodeTier } from "@kito/chronicles";
import { DataTable, Empty, Notice, PageHeader, Panel, Pill, formatDate } from "../../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../../lib/server/auth.ts";
import { adminChronicles } from "../../../../../lib/server/chronicles.ts";
import { SeriesForm, SeriesStatusForm } from "../../forms.tsx";
import { EditorialPill } from "../../status.tsx";
import { SERIES_DONE } from "../../messages.ts";

export default async function SeriesEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; done?: string }> }) {
  const { id } = await params;
  const { created, done } = await searchParams;
  const viewer = await requireStaff("chronicles:edit", `/admin/medical-chronicles/series/${id}`);
  const { series: all, episodes: allEpisodes, categories, settings } = await adminChronicles(viewer);
  const series = all.find((s) => s.id === id);
  if (!series) notFound();
  const now = new Date();
  const ordering = allEpisodes.filter((e) => e.seriesId === id).map((e) => ({ id: e.id, seriesId: e.seriesId, season: e.season, episodeNumber: e.episodeNumber, publishedAt: e.publishedAt, status: e.status, accessOverride: e.accessOverride }));
  const episodes = allEpisodes
    .filter((e) => e.seriesId === id)
    .sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || (a.episodeNumber ?? 1e9) - (b.episodeNumber ?? 1e9));
  const canReview = staffCan(viewer.roles, "chronicles:review");
  return (
    <>
      <PageHeader
        eyebrow={<>Series · <Pill tone={series.status === "published" ? "ok" : "neutral"}>{series.status}</Pill></>}
        title={series.title}
        actions={
          <>
            <Link className="kt-btn kt-btn--primary kt-btn--sm" href={`/admin/medical-chronicles/episodes/new?series=${series.id}`}>Add episode</Link>
            <Link className="kt-btn kt-btn--secondary kt-btn--sm" href={`/medical-chronicles/series/${series.slug}`}>Preview</Link>
          </>
        }
      />
      {created ? <Notice tone="ok">Series created as a draft. Add episodes, then publish it.</Notice> : null}
      {done && SERIES_DONE[done] ? <Notice tone={SERIES_DONE[done].tone}>{SERIES_DONE[done].text}</Notice> : null}
      {series.isSample ? <Notice tone="warn">Sample content for local testing.</Notice> : null}
      <div className="sn-admin-grid">
        <div className="sn-stack--lg">
          <Panel title="Episodes" subtitle="Tier shows what listeners get now, from published order and overrides.">
            <DataTable
              caption="Episodes in this series"
              rows={episodes}
              rowKey={(e) => e.id}
              empty={<Empty title="No episodes yet" />}
              columns={[
                { key: "n", header: "#", cell: (e) => `S${e.season ?? 1}·E${e.episodeNumber ?? "–"}` },
                { key: "t", header: "Title", cell: (e) => <Link className="sn-link" href={`/admin/medical-chronicles/episodes/${e.id}`}>{e.title}</Link> },
                { key: "s", header: "Status", cell: (e) => <EditorialPill status={e.status} publishedAt={e.publishedAt} /> },
                {
                  key: "tier",
                  header: "Tier",
                  cell: (e) => {
                    const tier = episodeTier(ordering.find((o) => o.id === e.id)!, { id: series.id, requiresSubscription: series.requiresSubscription, freeEpisodeAllowance: series.freeEpisodeAllowance }, ordering, now, settings.defaultFreeEpisodeAllowance);
                    return <Pill tone={tier === "free" ? "accent" : "warn"}>{tier}{e.accessOverride !== "inherit" ? " (override)" : ""}</Pill>;
                  },
                },
                { key: "src", header: "Audio", cell: (e) => (e.source ? (e.source.status === "active" ? e.source.kind.replace("_", " ") : <Pill tone="danger">{e.source.status}</Pill>) : <Pill tone="warn">none</Pill>) },
                { key: "p", header: "Published", cell: (e) => formatDate(e.publishedAt) },
              ]}
            />
          </Panel>
          <Panel title="Details">
            <SeriesForm
              values={series}
              categories={categories}
              otherSeries={all.filter((s) => s.id !== id).map((s) => ({ value: s.id, label: s.title }))}
              canChangeAccess={canReview}
              defaultAllowance={settings.defaultFreeEpisodeAllowance}
            />
          </Panel>
        </div>
        <div className="sn-stack">
          <Panel title="Publication">
            <p className="sn-small">Published {formatDate(series.publishedAt)}. Publishing a series shows only its published episodes.</p>
            <SeriesStatusForm id={series.id} status={series.status} canReview={canReview} />
          </Panel>
        </div>
      </div>
    </>
  );
}
