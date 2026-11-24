"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RightsDeclaration } from "@kito/studio";
import { DataTable, DemoBadge, EmptyHint, Notice, PageHead, Panel, Stat, StatusPill } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

type RightsRow = {
  id: string;
  title: string;
  kind: "Episode" | "Video" | "Show" | "Station";
  rights: RightsDeclaration | string;
  review: string;
  detail: string;
  href: string;
};

export default function AdminRightsPage() {
  const studio = useStudio();
  const [onlyUndeclared, setOnlyUndeclared] = useState(false);

  const rows = useMemo<RightsRow[]>(() => {
    const shows: RightsRow[] = studio.state.shows.map((show) => ({
      id: show.id,
      title: show.title,
      kind: "Show",
      rights: show.rights,
      review: show.reviewStatus,
      detail: `${show.hosts.length} host${show.hosts.length === 1 ? "" : "s"} · ${show.languages.join(", ")}`,
      href: `/studio/podcasts/${show.slug}`,
    }));
    const episodes: RightsRow[] = studio.state.episodes.map((episode) => ({
      id: episode.id,
      title: episode.title,
      kind: "Episode",
      rights: episode.rights,
      review: episode.reviewStatus,
      detail: `audio ${episode.audioSource} · ${episode.publicationStatus}`,
      href: `/studio/episodes/${episode.id}`,
    }));
    const videos: RightsRow[] = studio.state.videos.map((video) => ({
      id: video.id,
      title: video.title,
      kind: "Video",
      rights: video.rights,
      review: video.reviewStatus,
      detail: `${video.category} · ${video.fileName ?? "no file"}`,
      href: `/studio/video/${video.id}`,
    }));
    const stations: RightsRow[] = studio.state.submissions
      .filter((submission) => submission.status !== "draft")
      .map((submission) => ({
        id: submission.id,
        title: submission.name,
        kind: "Station",
        rights: `integration: ${submission.integrationPermission.replace(/_/g, " ")}`,
        review: submission.status.replace(/_/g, " "),
        detail: submission.evidence.broadcastingLicence
          ? `licence ${submission.evidence.broadcastingLicence}`
          : "no licence reference supplied",
        href: `/admin/stations/${submission.id}`,
      }));
    return [...stations, ...shows, ...episodes, ...videos];
  }, [studio.state.submissions, studio.state.shows, studio.state.episodes, studio.state.videos]);

  const filtered = onlyUndeclared ? rows.filter((row) => String(row.rights).includes("undisclosed") || String(row.rights).includes("not_requested")) : rows;
  const undeclared = rows.filter((row) => String(row.rights).includes("undisclosed") || String(row.rights).includes("not_requested")).length;

  const columns: readonly Column<RightsRow>[] = [
    {
      key: "title",
      header: "Item",
      render: (row) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {row.title}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {row.kind} · {row.detail}
          </p>
        </div>
      ),
    },
    {
      key: "rights",
      header: "Rights / authorisation",
      width: "220px",
      render: (row) => (
        <StatusPill kind="plain" value={String(row.rights).replace(/_/g, " ")} />
      ),
    },
    { key: "review", header: "Review state", width: "160px", render: (row) => <span className="ws-row__sub">{row.review}</span> },
    {
      key: "open",
      header: "",
      width: "90px",
      render: (row) => (
        <Link className="kt-btn kt-btn--secondary kt-btn--sm" href={row.href}>
          Open
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Rights evidence"
        description="Every rights declaration in one place, so a reviewer can see what basis each item claims before it publishes."
        actions={<DemoBadge />}
      />

      <Notice tone="info">
        <strong>What is checked.</strong> Content cannot be published while rights are undeclared, and a station cannot be listed without an
        explicit rebroadcast authorisation. Those rules are enforced in <code>@kito/studio</code> and covered by unit tests, not just by this
        screen.
      </Notice>

      <div className="ws-stats">
        <Stat label="Items tracked" value={rows.length} hint="Stations, shows, episodes, video" />
        <Stat label="Undeclared" value={undeclared} hint="Blocked from publishing" tone={undeclared ? "warn" : "ok"} />
        <Stat label="Stations with licence ref" value={studio.state.submissions.filter((entry) => entry.evidence.broadcastingLicence).length} hint="Asserted, not verified" />
      </div>

      <Panel
        title={`${filtered.length} record${filtered.length === 1 ? "" : "s"}`}
        subtitle="Rights declarations and rebroadcast authorisations"
        actions={
          <div className="ws-chips">
            <button type="button" className={`ws-chip${onlyUndeclared ? " ws-chip--on" : ""}`} aria-pressed={onlyUndeclared} onClick={() => setOnlyUndeclared((value) => !value)}>
              Undeclared only
            </button>
          </div>
        }
      >
        <DataTable columns={columns} rows={filtered} empty={<EmptyHint title="Nothing to show">Every tracked item has a declared rights basis.</EmptyHint>} />
      </Panel>

      <Panel title="Legal limits of this build" subtitle="Stated plainly">
        <ul className="ws-list">
          <li>No document upload, no signature verification and no registry lookup against UCC licence records.</li>
          <li>No contracts, no retransmission agreements and no takedown workflow with external parties.</li>
          <li>Authorisation flags are locally stored demo values; they do not grant any legal right.</li>
        </ul>
      </Panel>
    </>
  );
}
