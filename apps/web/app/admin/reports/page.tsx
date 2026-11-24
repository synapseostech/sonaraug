"use client";

import { useState } from "react";
import type { ContentReport } from "@kito/studio";
import { DataTable, DemoBadge, EmptyHint, Field, Notice, PageHead, Panel, Stat, StatusPill, TextArea } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

export default function AdminReportsPage() {
  const studio = useStudio();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [status, setStatus] = useState<"all" | "open" | "actioned" | "dismissed">("open");

  const reports = studio.state.reports.filter((report) => status === "all" || report.status === status);
  const selected = studio.state.reports.find((report) => report.id === selectedId);
  const open = studio.state.reports.filter((report) => report.status === "open").length;

  const resolve = (verdict: "actioned" | "dismissed") => {
    if (!selected) return;
    if (reason.trim().length < 8) {
      setMessage({ tone: "warn", text: "Record a reason of at least 8 characters before resolving a report." });
      return;
    }
    studio.resolveReport(selected.id, verdict, reason.trim());
    setMessage({ tone: "ok", text: `Report ${verdict}. A moderation record was written.` });
    setReason("");
    setSelectedId(null);
  };

  const columns: readonly Column<ContentReport>[] = [
    {
      key: "target",
      header: "Reported item",
      render: (report) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {report.targetTitle}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {report.targetKind.replace(/_/g, " ")} · reported by {report.reporter}
          </p>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (report) => (
        <div>
          <p style={{ margin: 0, fontSize: 13 }}>{report.reason}</p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {report.detail}
          </p>
        </div>
      ),
    },
    { key: "created", header: "Reported", width: "120px", render: (report) => <span className="ws-mono">{report.createdAt.slice(0, 10)}</span> },
    { key: "status", header: "Status", width: "120px", render: (report) => <StatusPill kind="plain" value={report.status} /> },
    {
      key: "act",
      header: "",
      width: "90px",
      render: (report) =>
        report.status === "open" ? (
          <button
            type="button"
            className="kt-btn kt-btn--secondary kt-btn--sm"
            onClick={() => {
              setSelectedId(report.id);
              setReason("");
              setMessage(null);
            }}
          >
            Resolve
          </button>
        ) : (
          <span className="ws-row__sub">closed</span>
        ),
    },
  ];

  return (
    <>
      <PageHead
        title="Reported content"
        description="Triage listener reports, then record the decision. Every resolution writes a moderation entry."
        actions={<DemoBadge />}
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="ws-stats">
        <Stat label="Open" value={open} hint="Awaiting triage" tone={open ? "warn" : "ok"} />
        <Stat label="Actioned" value={studio.state.reports.filter((report) => report.status === "actioned").length} hint="Content removed" />
        <Stat label="Dismissed" value={studio.state.reports.filter((report) => report.status === "dismissed").length} hint="No action taken" />
      </div>

      <Panel
        title="Reports"
        subtitle="Local demo reports — no listener report form exists in this build"
        actions={
          <div className="ws-chips">
            {(["open", "actioned", "dismissed", "all"] as const).map((value) => (
              <button key={value} type="button" className={`ws-chip${status === value ? " ws-chip--on" : ""}`} onClick={() => setStatus(value)}>
                {value}
              </button>
            ))}
          </div>
        }
      >
        <DataTable columns={columns} rows={reports} empty={<EmptyHint title="No reports in this state">Try “All” to see closed reports.</EmptyHint>} />
      </Panel>

      <Panel
        title={selected ? `Resolve: ${selected.targetTitle}` : "Resolution"}
        subtitle={selected ? `${selected.reason} — ${selected.detail}` : "Choose a report to resolve"}
      >
        {!selected ? (
          <EmptyHint title="No report selected">Pick “Resolve” on an open report.</EmptyHint>
        ) : (
          <>
            <Field label="Decision reason" hint="At least 8 characters. Appears in the moderation history." htmlFor="report-reason">
              <TextArea id="report-reason" rows={3} value={reason} onChange={setReason} placeholder="e.g. Comment contains a spam link; hidden and reporter notified." />
            </Field>
            <div className="ws-actions">
              <button type="button" className="kt-btn kt-btn--primary" onClick={() => resolve("actioned")}>
                Action content
              </button>
              <button type="button" className="kt-btn kt-btn--secondary" onClick={() => resolve("dismissed")}>
                Dismiss report
              </button>
            </div>
            <Notice tone="info">
              “Action content” records a removal decision. In this build it does not delete media, because no media is hosted — it updates local
              state and appends an audit entry.
            </Notice>
          </>
        )}
      </Panel>
    </>
  );
}
