"use client";

import Link from "next/link";
import { DataTable, DemoBadge, EmptyHint, Notice, PageHead, Panel, Stat, StatusPill } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import type { Channel } from "@kito/studio";
import { useStudio } from "../../../lib/studio/store.tsx";

type CreatorRow = Channel & {
  shows: number;
  episodes: number;
  videos: number;
  rightsGaps: number;
  readiness: string[];
};

export default function AdminCreatorsPage() {
  const studio = useStudio();

  const rows: CreatorRow[] = studio.state.channels.map((channel) => {
    const shows = studio.state.shows.filter((show) => show.channelId === channel.id);
    const episodes = studio.state.episodes.filter((episode) => shows.some((show) => show.id === episode.showId));
    const videos = studio.state.videos.filter((video) => video.channelId === channel.id);
    const rightsGaps =
      shows.filter((show) => show.rights === "undisclosed").length +
      episodes.filter((episode) => episode.rights === "undisclosed").length +
      videos.filter((video) => video.rights === "undisclosed").length;

    const readiness: string[] = [];
    readiness.push(channel.bio.trim().length >= 20 ? "Bio present" : "Bio missing");
    readiness.push(channel.languages.length > 0 ? "Languages set" : "No languages");
    readiness.push(shows.length > 0 ? `${shows.length} show${shows.length === 1 ? "" : "s"}` : "No shows yet");
    readiness.push(rightsGaps === 0 ? "Rights declared everywhere" : `${rightsGaps} item(s) with undeclared rights`);
    return { ...channel, shows: shows.length, episodes: episodes.length, videos: videos.length, rightsGaps, readiness };
  });

  const blocked = rows.filter((row) => row.rightsGaps > 0).length;

  const columns: readonly Column<CreatorRow>[] = [
    {
      key: "channel",
      header: "Channel",
      render: (row) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {row.name}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            /{row.slug} · {row.kind} · {row.languages.join(", ")}
          </p>
        </div>
      ),
    },
    {
      key: "content",
      header: "Content",
      width: "170px",
      render: (row) => (
        <span className="ws-row__sub">
          {row.shows} shows · {row.episodes} episodes · {row.videos} video
        </span>
      ),
    },
    {
      key: "rights",
      header: "Rights",
      width: "140px",
      render: (row) => <StatusPill kind="plain" value={row.rightsGaps === 0 ? "complete" : `${row.rightsGaps} gap(s)`} />,
    },
    {
      key: "readiness",
      header: "Readiness checklist",
      render: (row) => <span className="ws-row__sub">{row.readiness.join(" · ")}</span>,
    },
    {
      key: "open",
      header: "",
      width: "120px",
      render: (row) => (
        <Link className="kt-btn kt-btn--secondary kt-btn--sm" href="/admin/content">
          Review content
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Creator applications"
        description="Readiness of every creator channel: identity, content and rights coverage, derived from the same records the studio writes."
        actions={<DemoBadge />}
      />

      <Notice tone="warn">
        <strong>No application records exist yet.</strong> This build has seeded channels and no creator registration flow, so there is nothing
        to approve. This screen computes readiness from real local data instead of inventing an application status, and it cannot grant
        anything. A real version needs a <code>channels</code> table, an application state machine and reviewer-only RLS.
      </Notice>

      <div className="ws-stats">
        <Stat label="Channels" value={rows.length} hint="Seeded demo creators" />
        <Stat label="With rights gaps" value={blocked} hint="Cannot publish those items" tone={blocked ? "warn" : "ok"} />
        <Stat label="Shows awaiting review" value={studio.state.shows.filter((show) => show.reviewStatus === "pending").length} hint="Blocks their episodes" />
      </div>

      <Panel title="Channels" subtitle="Readiness derived from channel, show, episode and video records">
        <DataTable
          columns={columns}
          rows={rows}
          empty={<EmptyHint title="No channels">Reset the demo data to restore the seeded creator channel.</EmptyHint>}
        />
      </Panel>
    </>
  );
}
