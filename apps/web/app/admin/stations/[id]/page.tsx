"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { canTransitionSubmission, marketFor, stationListable } from "@kito/studio";
import type { IntegrationPermission } from "@kito/studio";
import {
  BackLink,
  EmptyHint,
  Field,
  Notice,
  PageHead,
  Panel,
  Select,
  StatusPill,
  TextArea,
} from "../../../../components/studio-ui.tsx";
import { useStudio } from "../../../../lib/studio/store.tsx";

const ACTIONS = [
  { value: "start_review", label: "Start review", to: "under_review" },
  { value: "approve", label: "Approve listing", to: "approved" },
  { value: "request_changes", label: "Request changes", to: "changes_requested" },
  { value: "reject", label: "Reject", to: "rejected" },
  { value: "suspend", label: "Suspend listing", to: "suspended" },
  { value: "reinstate", label: "Reinstate listing", to: "approved" },
] as const;

const PERMISSIONS: readonly { value: IntegrationPermission; label: string }[] = [
  { value: "not_requested", label: "Not requested" },
  { value: "pending", label: "Authorisation pending" },
  { value: "granted", label: "Rebroadcast authorised" },
  { value: "denied", label: "Authorisation denied" },
  { value: "third_party_only", label: "Third-party aggregator only" },
];

export default function AdminStationReviewPage() {
  const params = useParams<{ id: string }>();
  const studio = useStudio();
  const submission = studio.state.submissions.find((entry) => entry.id === params.id);
  const submissionForActions = studio.state.submissions.find((entry) => entry.id === params.id);
  const availableActions = ACTIONS.filter((entry) => !submissionForActions || canTransitionSubmission(submissionForActions.status, entry.to));
  const [action, setAction] = useState<(typeof ACTIONS)[number]["value"]>(availableActions[0]?.value ?? "start_review");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  if (!submission) {
    return (
      <>
        <BackLink href="/admin/stations">Station submissions</BackLink>
        <EmptyHint title="Submission not found" action={<Link className="kt-btn kt-btn--secondary kt-btn--sm" href="/admin/stations">Back to the queue</Link>}>
          The demo data may have been reset.
        </EmptyHint>
      </>
    );
  }

  const healthy = submission.streams.filter((stream) => stream.health === "healthy").length;
  const currentAction = availableActions.some((entry) => entry.value === action) ? action : (availableActions[0]?.value ?? action);
  const listable = stationListable(submission.status, submission.streams, submission.integrationPermission);

  const decide = () => {
    const result = studio.reviewSubmission(submission.id, currentAction, reason);
    if (!result.ok) {
      setMessage({ tone: "warn", text: result.reason });
      return;
    }
    setMessage({ tone: "ok", text: `Decision recorded: ${currentAction.replace(/_/g, " ")}. The broadcaster sees it immediately.` });
    setReason("");
  };

  const permission = (value: IntegrationPermission) => {
    const result = studio.setIntegrationPermission(submission.id, value);
    setMessage(result.ok ? { tone: "ok", text: `Authorisation set to ${value.replace(/_/g, " ")}.` } : { tone: "warn", text: result.reason });
  };

  return (
    <>
      <BackLink href="/admin/stations">Station submissions</BackLink>

      <PageHead
        title={submission.name}
        description={`${submission.city}, ${submission.region} · ${marketFor(submission.country).name}${submission.frequency ? ` · ${submission.frequency}` : ""}`}
        actions={
          <div className="ws-actions">
            <StatusPill kind="station" value={submission.status} />
            <StatusPill kind="plain" value={listable ? "listable" : "not listable"} />
          </div>
        }
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="ws-split">
        <Panel title="Station details" subtitle="As supplied by the broadcaster">
          <dl className="ws-kv">
            <dt>Frequency</dt>
            <dd>{submission.frequency ?? "not supplied"}</dd>
            <dt>Website</dt>
            <dd>{submission.website ?? "not supplied"}</dd>
            <dt>Languages</dt>
            <dd>{submission.languages.join(", ")}</dd>
            <dt>Genres</dt>
            <dd>{submission.genres.join(", ")}</dd>
            <dt>Description</dt>
            <dd>{submission.description || "not supplied"}</dd>
            <dt>Operating status</dt>
            <dd>{submission.operatingStatus.replace(/_/g, " ")}</dd>
            <dt>Submitted</dt>
            <dd>{submission.submittedAt ? submission.submittedAt.slice(0, 16).replace("T", " ") : "not submitted"}</dd>
            <dt>Record origin</dt>
            <dd>{submission.isDemo ? "demo record created locally — not a real partnership" : "broadcaster submission"}</dd>
          </dl>
        </Panel>

        <Panel title="Evidence" subtitle="Ownership and broadcasting authorisation">
          <div className="ws-evidence">
            <p style={{ margin: 0 }}>
              <strong>Ownership:</strong> {submission.evidence.ownershipStatement || "not supplied"}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Licence reference:</strong> {submission.evidence.broadcastingLicence || "not supplied"}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Contact:</strong> {submission.evidence.contactName || "—"}
              {submission.evidence.contactEmail ? ` · ${submission.evidence.contactEmail}` : ""}
              {submission.evidence.contactPhone ? ` · ${submission.evidence.contactPhone}` : ""}
            </p>
            <div>
              <strong>Documents:</strong>{" "}
              {submission.evidence.documents.length === 0
                ? "none attached"
                : submission.evidence.documents.map((document) => `${document.name} (${document.note})`).join("; ")}
            </div>
          </div>
          <Notice tone="warn">
            <strong>Evidence is asserted, not verified.</strong> No document upload, signature check or registry lookup exists in this build. An
            approval here is a local demo decision.
          </Notice>
        </Panel>
      </div>

      <Panel title="Stream verification" subtitle={`${healthy} of ${submission.streams.length} endpoints passed a platform check`}>
        {submission.streams.length === 0 ? (
          <EmptyHint title="No endpoints submitted">The broadcaster must supply at least one stream before approval is possible.</EmptyHint>
        ) : (
          <div className="ws-streamlist">
            {submission.streams.map((stream) => (
              <article key={stream.id} className="ws-streamcard">
                <header className="ws-streamcard__head">
                  <div>
                    <p className="ws-row__title" style={{ margin: 0 }}>
                      {stream.label} <span className="ws-row__sub">· {stream.role}</span>
                    </p>
                    <p className="ws-mono ws-row__sub" style={{ margin: "4px 0 0" }}>
                      {stream.url}
                    </p>
                  </div>
                  <div className="ws-actions">
                    <StatusPill kind="stream" value={stream.health} />
                    <StatusPill kind="plain" value={stream.format.toUpperCase()} />
                    <StatusPill kind="plain" value={stream.verifiedByPlatform ? "verified by platform" : "unverified"} />
                  </div>
                </header>
                <dl className="ws-kv">
                  <dt>Last success</dt>
                  <dd>{stream.lastSuccessAt ? stream.lastSuccessAt.slice(0, 16).replace("T", " ") : "—"}</dd>
                  <dt>Last failure</dt>
                  <dd>{stream.lastFailureAt ? `${stream.lastFailureAt.slice(0, 16).replace("T", " ")} — ${stream.lastFailureReason ?? ""}` : "—"}</dd>
                </dl>
                {stream.history.length > 0 ? (
                  <details className="ws-streamcard__history">
                    <summary>Verification history ({stream.history.length})</summary>
                    <ul className="ws-history">
                      {stream.history.map((check, index) => (
                        <li key={`${stream.id}-h-${index}`}>
                          <span className="ws-mono">{check.at.slice(0, 16).replace("T", " ")}</span>
                          <span>
                            <strong>{check.result}</strong> by {check.actorRole}
                          </span>
                          <span className="ws-row__sub">{check.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <Field
          label="Rebroadcast authorisation"
          hint="Separate from technical health. A healthy stream with no authorisation still cannot be listed."
          htmlFor="integration-permission"
        >
          <Select
            id="integration-permission"
            value={submission.integrationPermission}
            onChange={(value) => permission(value as IntegrationPermission)}
            options={PERMISSIONS}
          />
        </Field>

        {!listable ? (
          <Notice tone="warn">
            This station is <strong>not listable</strong>. Listing requires an approved submission, at least one healthy platform-verified
            endpoint, and an authorisation of “granted” or “third-party aggregator only”.
          </Notice>
        ) : (
          <Notice tone="ok">This station meets every condition for listing in the directory.</Notice>
        )}
      </Panel>

      <Panel title="Record a decision" subtitle="Reasons of at least 8 characters are mandatory and kept in the audit trail">
        <div className="ws-form">
          <Field label="Decision" htmlFor="decision-action">
            <Select
              id="decision-action"
              value={currentAction}
              onChange={(value) => setAction(value as typeof action)}
              options={availableActions.map((entry) => ({ value: entry.value, label: entry.label }))}
            />
          </Field>
          <Field label="Reason" hint="Visible to the broadcaster on their submission page" htmlFor="decision-reason">
            <TextArea
              id="decision-reason"
              rows={3}
              value={reason}
              onChange={setReason}
              placeholder="e.g. Endpoint returns audio/mpeg and decoded 198 kB over 12s; ownership statement and licence reference present."
            />
          </Field>
        </div>
        {availableActions.length > 0 && availableActions[0]?.value === "start_review" ? (
          <Notice tone="info">
            This submission is waiting to be opened. Start the review first; approval becomes available once it is
            <strong> under review</strong> — the transition rules do not allow submitted → approved directly.
          </Notice>
        ) : null}
        <div className="ws-actions">
          <button type="button" className="kt-btn kt-btn--primary" onClick={decide}>
            Record decision
          </button>
          <Link className="kt-btn kt-btn--ghost" href="/admin/history">
            Moderation history
          </Link>
        </div>
      </Panel>

      <Panel title="Decision log" subtitle="Newest first">
        {submission.decisions.length === 0 ? (
          <EmptyHint title="No decisions recorded">This submission has not been reviewed yet.</EmptyHint>
        ) : (
          <ul className="ws-history">
            {submission.decisions.map((decision) => (
              <li key={decision.id}>
                <span className="ws-mono">{decision.at.slice(0, 16).replace("T", " ")}</span>
                <span>
                  <strong>{decision.action.replace(/_/g, " ")}</strong> by {decision.actor} ({decision.actorRole})
                </span>
                <span className="ws-row__sub">{decision.reason}</span>
                <span className="ws-row__sub">
                  {decision.fromStatus?.replace(/_/g, " ") ?? "—"} → {decision.toStatus?.replace(/_/g, " ") ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
