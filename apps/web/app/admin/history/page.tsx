"use client";

import { useState } from "react";
import type { ModerationRecord } from "@kito/studio";
import { DataTable, DemoBadge, EmptyHint, PageHead, Panel, Stat, StatusPill } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

const ACTIONS = ["all", "approve", "reject", "request_changes", "suspend", "dismiss_report", "remove_content"] as const;

export default function AdminHistoryPage() {
  const studio = useStudio();
  const [action, setAction] = useState<(typeof ACTIONS)[number]>("all");
  const [term, setTerm] = useState("");

  const records = studio.state.moderation
    .filter((record) => action === "all" || record.action === action)
    .filter((record) => {
      if (!term.trim()) return true;
      const needle = term.trim().toLowerCase();
      return record.targetTitle.toLowerCase().includes(needle) || record.reason.toLowerCase().includes(needle) || record.actor.toLowerCase().includes(needle);
    })
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

  const columns: readonly Column<ModerationRecord>[] = [
    { key: "at", header: "When", width: "150px", render: (record) => <span className="ws-mono">{record.at.slice(0, 16).replace("T", " ")}</span> },
    {
      key: "target",
      header: "Target",
      render: (record) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {record.targetTitle}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {record.targetKind.replace(/_/g, " ")}
          </p>
        </div>
      ),
    },
    { key: "action", header: "Action", width: "160px", render: (record) => <StatusPill kind="plain" value={record.action.replace(/_/g, " ")} /> },
    { key: "reason", header: "Reason", render: (record) => <span className="ws-row__sub">{record.reason}</span> },
    { key: "actor", header: "Actor", width: "190px", render: (record) => <span className="ws-mono">{record.actor}</span> },
  ];

  return (
    <>
      <PageHead
        title="Moderation history"
        description="Append-only record of platform decisions. Entries are written by the actions you take, not editable afterwards."
        actions={<DemoBadge />}
      />

      <div className="ws-stats">
        <Stat label="Entries" value={studio.state.moderation.length} hint="All decisions" />
        <Stat label="Approvals" value={studio.state.moderation.filter((record) => record.action === "approve").length} hint="Station or content" />
        <Stat label="Removals" value={studio.state.moderation.filter((record) => record.action === "remove_content").length} hint="Reported content" />
        <Stat label="Suspensions" value={studio.state.moderation.filter((record) => record.action === "suspend").length} hint="Listings" />
      </div>

      <Panel
        title={`${records.length} entr${records.length === 1 ? "y" : "ies"}`}
        subtitle="Newest first — search by target, reason or actor"
      >
        <div className="ws-filters">
          <input
            className="ws-input"
            type="search"
            value={term}
            aria-label="Search moderation history"
            placeholder="Search target, reason or actor"
            onChange={(event) => setTerm(event.target.value)}
          />
          <select className="ws-input ws-input--select" value={action} aria-label="Filter by action" onChange={(event) => setAction(event.target.value as (typeof ACTIONS)[number])}>
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All actions" : value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={records}
          empty={<EmptyHint title="No moderation entries">Record a station or content decision and it will appear here.</EmptyHint>}
        />
      </Panel>

      <Panel title="Why this is only local" subtitle="Audit integrity depends on the database work that is still outstanding">
        <ul className="ws-list">
          <li>These entries live in <code>localStorage</code> and can be cleared by anyone with access to this browser.</li>
          <li>A real audit trail needs an append-only table with revokes on UPDATE/DELETE and RLS that prevents actor impersonation.</li>
          <li>The audit found moderation history could be lost through cascading deletes; that must be fixed server-side before this is real.</li>
        </ul>
      </Panel>
    </>
  );
}
