"use client";

import Link from "next/link";
import type { StationSubmissionStatus } from "@kito/studio";
import { DataTable, DemoBadge, EmptyHint, PageHead, Panel, Stat, StatusPill } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

const OPEN_STATUSES: readonly StationSubmissionStatus[] = ["submitted", "under_review", "changes_requested"];

export default function AdminOverviewPage() {
  const studio = useStudio();
  const submissions = studio.state.submissions;
  const episodes = studio.state.episodes;
  const videos = studio.state.videos;
  const reports = studio.state.reports;

  const awaitingReview = episodes.filter((episode) => episode.reviewStatus === "pending").length + videos.filter((video) => video.reviewStatus === "pending").length;
  const openReports = reports.filter((report) => report.status === "open").length;
  const approvedStations = submissions.filter((entry) => entry.status === "approved").length;
  const undisclosedRights =
    episodes.filter((episode) => episode.rights === "undisclosed").length + videos.filter((video) => video.rights === "undisclosed").length;

  const queue: readonly {
    id: string;
    title: string;
    kind: string;
    status: string;
    why: string;
    href: string;
  }[] = [
    ...submissions
      .filter((entry) => OPEN_STATUSES.includes(entry.status))
      .map((entry) => ({
        id: entry.id,
        title: entry.name,
        kind: "Station submission",
        status: entry.status,
        why: entry.streams.some((stream) => stream.health === "healthy") ? "A stream passed a platform check" : "No stream has passed a platform check",
        href: `/admin/stations/${entry.id}`,
      })),
    ...episodes
      .filter((episode) => episode.reviewStatus === "pending")
      .map((episode) => ({
        id: episode.id,
        title: episode.title,
        kind: "Podcast episode",
        status: "pending review",
        why: episode.audioSource === "none" ? "No audio attached" : `Audio: ${episode.audioSource}`,
        href: "/admin/content",
      })),
    ...videos
      .filter((video) => video.reviewStatus === "pending")
      .map((video) => ({
        id: video.id,
        title: video.title,
        kind: "Video",
        status: "pending review",
        why: video.fileName ? "Local file attached" : "No file attached",
        href: "/admin/content",
      })),
  ];

  const columns: readonly Column<(typeof queue)[number]>[] = [
    {
      key: "title",
      header: "Item",
      render: (row) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {row.title}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {row.kind} · {row.why}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", width: "160px", render: (row) => <StatusPill kind="plain" value={row.status.replace(/_/g, " ")} /> },
    {
      key: "open",
      header: "",
      width: "90px",
      render: (row) => (
        <Link className="kt-btn kt-btn--secondary kt-btn--sm" href={row.href}>
          Review
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Review operations (demo data)"
        description="Everything waiting on a platform decision, and the state of the listings already approved."
        actions={<DemoBadge />}
      />

      <div className="ws-stats">
        <Stat label="Awaiting content review" value={awaitingReview} hint="Episodes and videos" tone={awaitingReview > 0 ? "warn" : undefined} />
        <Stat label="Station queue" value={submissions.filter((entry) => OPEN_STATUSES.includes(entry.status)).length} hint="Submitted or in review" />
        <Stat label="Approved listings" value={approvedStations} hint="Station pages allowed" tone={approvedStations > 0 ? "ok" : undefined} />
        <Stat label="Open reports" value={openReports} hint="Reported content" tone={openReports > 0 ? "warn" : undefined} />
        <Stat label="Undisclosed rights" value={undisclosedRights} hint="Cannot publish until declared" />
      </div>

      <Panel title="Decision queue" subtitle="Ordered by what unblocks the most work">
        <DataTable columns={columns} rows={queue} empty={<EmptyHint title="Queue is clear">Nothing is waiting on a platform decision.</EmptyHint>} />
      </Panel>

      <div className="ws-split">
        <Panel title="Moderation rules enforced in code" subtitle="Not just convention — these live in @kito/studio and are unit tested">
          <ul className="ws-list">
            <li>A creator cannot approve their own episode or video, whatever the UI allows.</li>
            <li>A broadcaster cannot mark its own stream healthy; only <code>platform_monitor</code> can record a check.</li>
            <li>A station cannot be approved until at least one endpoint has passed a platform check.</li>
            <li>Replacing a stream URL clears the previous verification automatically.</li>
            <li>Approval of a listing and authorisation to rebroadcast are separate fields.</li>
          </ul>
        </Panel>

        <Panel title="What this console cannot do" subtitle="Because the security findings are unresolved">
          <ul className="ws-list">
            <li>It is not connected to Supabase, so no real user data exists here.</li>
            <li>There is no authentication: the role switcher is a local simulation.</li>
            <li>Decisions are stored in <code>localStorage</code> on this device only.</li>
            <li>Suspending a listing does not stop any real stream, because we do not host any stream.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
