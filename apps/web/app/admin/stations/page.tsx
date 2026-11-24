"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { marketFor } from "@kito/studio";
import type { StationSubmission, StationSubmissionStatus } from "@kito/studio";
import { DataTable, DemoBadge, EmptyHint, PageHead, Panel, Stat, StatusPill } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

const STATUS_FILTERS: readonly (StationSubmissionStatus | "all")[] = [
  "all",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
  "draft",
];

export default function AdminStationsPage() {
  const studio = useStudio();
  const [status, setStatus] = useState<StationSubmissionStatus | "all">("all");
  const [term, setTerm] = useState("");

  const rows = useMemo(
    () =>
      studio.state.submissions.filter((entry) => {
        if (status !== "all" && entry.status !== status) return false;
        if (!term.trim()) return true;
        const needle = term.trim().toLowerCase();
        return (
          entry.name.toLowerCase().includes(needle) ||
          entry.city.toLowerCase().includes(needle) ||
          entry.region.toLowerCase().includes(needle) ||
          (entry.frequency ?? "").toLowerCase().includes(needle)
        );
      }),
    [studio.state.submissions, status, term],
  );

  const counts = (value: StationSubmissionStatus) => studio.state.submissions.filter((entry) => entry.status === value).length;

  const columns: readonly Column<StationSubmission>[] = [
    {
      key: "station",
      header: "Station",
      render: (submission) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {submission.name}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {submission.frequency ?? "no frequency"} · {submission.city} · {marketFor(submission.country).name}
            {submission.isDemo ? " · demo record" : ""}
          </p>
        </div>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      width: "120px",
      render: (submission) => <span className="ws-mono">{submission.submittedAt ? submission.submittedAt.slice(0, 10) : "—"}</span>,
    },
    {
      key: "streams",
      header: "Streams",
      width: "140px",
      render: (submission) => {
        const healthy = submission.streams.filter((stream) => stream.health === "healthy").length;
        const failing = submission.streams.filter((stream) => stream.health === "failing").length;
        return (
          <span className="ws-row__sub">
            {submission.streams.length} endpoints · {healthy} healthy{failing ? ` · ${failing} failing` : ""}
          </span>
        );
      },
    },
    {
      key: "permission",
      header: "Authorisation",
      width: "150px",
      render: (submission) => <StatusPill kind="plain" value={submission.integrationPermission.replace(/_/g, " ")} />,
    },
    { key: "status", header: "Status", width: "160px", render: (submission) => <StatusPill kind="station" value={submission.status} /> },
    {
      key: "open",
      header: "",
      width: "110px",
      render: (submission) => (
        <Link className="kt-btn kt-btn--secondary kt-btn--sm" href={`/admin/stations/${submission.id}`}>
          Inspect
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Station submissions"
        description="Inspect evidence, stream verification and authorisation before recording a decision."
        actions={<DemoBadge />}
      />

      <div className="ws-stats">
        <Stat label="Submitted" value={counts("submitted")} hint="Not yet opened" />
        <Stat label="In review" value={counts("under_review")} hint="Being assessed" />
        <Stat label="Changes requested" value={counts("changes_requested")} hint="Returned to broadcaster" />
        <Stat label="Approved" value={counts("approved")} hint="Listable" tone={counts("approved") > 0 ? "ok" : undefined} />
        <Stat label="Suspended" value={counts("suspended")} hint="Hidden from the directory" tone={counts("suspended") > 0 ? "warn" : undefined} />
      </div>

      <Panel
        title={`${rows.length} submission${rows.length === 1 ? "" : "s"}`}
        subtitle="Filter by status, name, city or frequency"
      >
        <div className="ws-filters">
          <input
            className="ws-input"
            type="search"
            value={term}
            placeholder="Search station, city or frequency"
            aria-label="Search station submissions"
            onChange={(event) => setTerm(event.target.value)}
          />
          <select className="ws-input ws-input--select" value={status} aria-label="Filter by status" onChange={(event) => setStatus(event.target.value as StationSubmissionStatus | "all")}>
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All statuses" : value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          empty={<EmptyHint title="No submissions match">Clear the filters to see every submission.</EmptyHint>}
        />
      </Panel>
    </>
  );
}
