"use client";

import { useMemo } from "react";
import { formatRssDuration } from "@kito/studio";
import {
  DataTable,
  DemoBadge,
  EmptyHint,
  Notice,
  PageHead,
  Panel,
  PublicationPill,
  Stat,
} from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

type Row = { id: string; title: string; kind: "Episode" | "Video"; length: number | null; stage: string; demo: number };

/**
 * Demo numbers are derived from the item id so they are stable across renders
 * and reloads. They are not measurements and the page says so in three places.
 */
function demoViews(id: string, published: boolean): number {
  const seed = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return Math.round(((seed % 3100) + 90) * (published ? 1 : 0.12));
}

export default function AnalyticsPage() {
  const studio = useStudio();

  const rows = useMemo<Row[]>(() => {
    const episodes: Row[] = studio.state.episodes.map((episode) => ({
      id: episode.id,
      title: episode.title,
      kind: "Episode",
      length: episode.durationSeconds,
      stage: episode.publicationStatus,
      demo: demoViews(episode.id, episode.publicationStatus === "published"),
    }));
    const videos: Row[] = studio.state.videos.map((video) => ({
      id: video.id,
      title: video.title,
      kind: "Video",
      length: video.durationSeconds,
      stage: video.publicationStatus,
      demo: demoViews(video.id, video.publicationStatus === "published"),
    }));
    return [...episodes, ...videos].sort((a, b) => b.demo - a.demo);
  }, [studio.state.episodes, studio.state.videos]);

  const published = rows.filter((row) => row.stage === "published");
  const totalDemo = rows.reduce((total, row) => total + row.demo, 0);
  const minutes = studio.state.episodes.reduce((total, episode) => total + (episode.durationSeconds ?? 0), 0);

  const columns: readonly Column<Row>[] = [
    {
      key: "title",
      header: "Content",
      render: (row) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {row.title}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {row.kind}
          </p>
        </div>
      ),
    },
    { key: "stage", header: "Stage", width: "140px", render: (row) => <PublicationPill status={row.stage as never} /> },
    {
      key: "length",
      header: "Length",
      width: "90px",
      render: (row) => <span className="ws-table__num">{row.length ? formatRssDuration(row.length) : "—"}</span>,
    },
    {
      key: "views",
      header: "Views (demo)",
      width: "120px",
      render: (row) => <span className="ws-table__num">{row.demo.toLocaleString()}</span>,
    },
  ];

  return (
    <>
      <PageHead
        title="Analytics"
        description="A summary of what exists in this workspace. No playback telemetry is collected in this build."
        actions={<DemoBadge />}
      />

      <Notice tone="warn">
        <strong>These numbers are not measurements.</strong> There is no listener telemetry, no server-side counting and no analytics pipeline
        connected. Every figure on this page is derived from local demo data and the length of the item ids, and would be replaced by real
        aggregation once the database and RLS findings are resolved.
      </Notice>

      <div className="ws-stats">
        <Stat label="Items" value={rows.length} hint="Episodes and videos" />
        <Stat label="Published" value={published.length} hint="Local records only" />
        <Stat label="Audio produced" value={formatRssDuration(minutes)} hint="Sum of episode durations" />
        <Stat label="Demo views" value={totalDemo.toLocaleString()} hint="Placeholder" />
      </div>

      <Panel title="Content performance (demo)" subtitle="Ranked by the placeholder view figure">
        <DataTable
          columns={columns}
          rows={rows}
          empty={<EmptyHint title="No content yet">Create an episode or a video draft to populate this view.</EmptyHint>}
        />
      </Panel>

      <Panel title="What real analytics needs" subtitle="Deliberately not built in this phase">
        <ul className="ws-list">
          <li>A playback event pipeline with server-assigned ids — the audit found anonymous clients could read playback telemetry, so this stays unbuilt until that is fixed.</li>
          <li>Aggregation jobs per channel, show and episode, with retention rules that respect the Uganda DPPA.</li>
          <li>Consent-aware identifiers: no third-party trackers, no fingerprinting of listeners.</li>
          <li>Rights-aware reporting so a broadcaster can see retransmission figures for their own stream only.</li>
        </ul>
      </Panel>
    </>
  );
}
