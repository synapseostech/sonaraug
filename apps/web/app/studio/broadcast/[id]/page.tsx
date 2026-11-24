"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GENRES, MARKETS, marketFor, broadcasterMayEdit } from "@kito/studio";
import type { StreamEndpointDraft, StreamFormat, StationSubmission } from "@kito/studio";
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
  TextInput,
  ToggleChips,
} from "../../../../components/studio-ui.tsx";
import { useStudio } from "../../../../lib/studio/store.tsx";

const FORMATS: readonly { value: StreamFormat; label: string }[] = [
  { value: "mp3", label: "MP3 (Icecast / Shoutcast)" },
  { value: "aac", label: "AAC" },
  { value: "hls", label: "HLS playlist (.m3u8)" },
  { value: "opus", label: "Opus / WebM" },
];

function when(value: string | null): string {
  return value ? value.slice(0, 16).replace("T", " ") : "—";
}

function StreamRow({
  submission,
  stream,
  canEdit,
  onTest,
}: {
  submission: StationSubmission;
  stream: StreamEndpointDraft;
  canEdit: boolean;
  onTest: (endpointId: string) => Promise<void>;
}) {
  const studio = useStudio();
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const test = async () => {
    setBusy(true);
    setMessage("Requesting a platform check…");
    await onTest(stream.id);
    setBusy(false);
    setMessage(null);
  };

  const replace = () => {
    const result = studio.replaceStreamUrl(submission.id, stream.id, replacement.trim());
    setMessage(result.ok ? "URL replaced — previous verification cleared." : result.reason);
    if (result.ok) {
      setReplacement("");
      setShowReplace(false);
    }
  };

  return (
    <article className="ws-streamcard">
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
          {stream.verifiedByPlatform ? <StatusPill kind="plain" value="platform verified" /> : <StatusPill kind="plain" value="not verified" />}
        </div>
      </header>

      <dl className="ws-kv">
        <dt>Last checked</dt>
        <dd>{when(stream.lastCheckedAt)}</dd>
        <dt>Last success</dt>
        <dd>{when(stream.lastSuccessAt)}</dd>
        <dt>Last failure</dt>
        <dd>
          {when(stream.lastFailureAt)}
          {stream.lastFailureReason ? ` — ${stream.lastFailureReason}` : ""}
        </dd>
        <dt>Bitrate</dt>
        <dd>{stream.bitrateKbps ? `${stream.bitrateKbps} kbps` : "not reported by the endpoint"}</dd>
      </dl>

      {message ? <Notice tone={message.includes("replaced") ? "ok" : "info"}>{message}</Notice> : null}

      <div className="ws-actions">
        <button type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => void test()} disabled={busy || !canEdit}>
          {busy ? "Checking…" : "Request platform check"}
        </button>
        <button type="button" className="kt-btn kt-btn--ghost kt-btn--sm" onClick={() => setShowReplace((value) => !value)} disabled={!canEdit}>
          Replace URL
        </button>
      </div>

      {showReplace ? (
        <div className="ws-tagrow">
          <input
            className="ws-input"
            value={replacement}
            placeholder="https://new-endpoint.example/live"
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button type="button" className="kt-btn kt-btn--primary kt-btn--sm" onClick={replace}>
            Replace
          </button>
        </div>
      ) : null}

      {stream.history.length > 0 ? (
        <details className="ws-streamcard__history">
          <summary>Verification history ({stream.history.length})</summary>
          <ul className="ws-history">
            {stream.history.map((check, index) => (
              <li key={`${stream.id}-check-${index}`}>
                <span className="ws-mono">{check.at.slice(0, 16).replace("T", " ")}</span>
                <span>
                  <strong>{check.result}</strong> by {check.actorRole}
                </span>
                <span className="ws-row__sub">{check.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="ws-row__sub">No verification attempts recorded yet.</p>
      )}
    </article>
  );
}

export default function BroadcastStationPage() {
  const params = useParams<{ id: string }>();
  const studio = useStudio();
  const submission = studio.state.submissions.find((entry) => entry.id === params.id);
  const [message, setMessage] = useState<string | null>(null);
  const [label, setLabel] = useState("Backup stream");
  const [url, setUrl] = useState("");
  const [role, setRole] = useState<"primary" | "backup">("backup");
  const [format, setFormat] = useState<StreamFormat>("mp3");

  if (!submission) {
    return (
      <>
        <BackLink href="/studio/broadcast">Station onboarding</BackLink>
        <EmptyHint title="Submission not found" action={<Link className="kt-btn kt-btn--secondary kt-btn--sm" href="/studio/broadcast">Back to onboarding</Link>}>
          This station may have been removed, or the demo data was reset.
        </EmptyHint>
      </>
    );
  }

  const editable = broadcasterMayEdit(submission.status);
  const market = marketFor(submission.country);
  const canSubmit = editable && submission.streams.length > 0;

  const patch = (fields: Partial<StationSubmission>) => {
    const result = studio.updateSubmission(submission.id, fields);
    if (!result.ok) setMessage(result.reason);
  };

  const patchEvidence = (fields: Partial<StationSubmission["evidence"]>) => {
    patch({ evidence: { ...submission.evidence, ...fields } });
  };

  const submit = () => {
    const result = studio.submitSubmission(submission.id);
    setMessage(result.ok ? "Submitted for platform review." : result.reason);
  };

  const addStream = () => {
    if (!url.trim()) {
      setMessage("Enter the stream URL your own player uses.");
      return;
    }
    const result = studio.addStream(submission.id, { label: label.trim() || "Stream", url: url.trim(), role, format });
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setMessage("Endpoint added. It stays unverified until the platform check runs.");
    setUrl("");
  };

  const testStream = async (endpointId: string) => {
    const result = await studio.testStream(submission.id, endpointId);
    setMessage(`Platform monitor: ${result.detail}`);
  };

  return (
    <>
      <BackLink href="/studio/broadcast">Station onboarding</BackLink>

      <PageHead
        title={submission.name}
        description={`${submission.city}, ${submission.region} · ${market.name}${submission.frequency ? ` · ${submission.frequency}` : ""}`}
        actions={
          <div className="ws-actions">
            <StatusPill kind="station" value={submission.status} />
            <StatusPill kind="plain" value={`integration: ${submission.integrationPermission.replace(/_/g, " ")}`} />
          </div>
        }
      />

      {message ? <Notice tone={/cannot|Add |Enter|not |only/i.test(message) ? "warn" : "info"}>{message}</Notice> : null}

      {submission.status === "changes_requested" && submission.changeRequest ? (
        <Notice tone="warn">
          <strong>Platform requested changes:</strong> {submission.changeRequest}
        </Notice>
      ) : null}

      {!editable ? (
        <Notice tone="info">
          This submission is <strong>{submission.status.replace(/_/g, " ")}</strong> and is read-only for broadcasters. Editing reopens when
          the platform requests changes or returns it to draft.
        </Notice>
      ) : null}

      <div className="ws-split">
        <Panel title="Station information" subtitle="Shared with the platform review team">
          <div className="ws-form">
            <Field label="Station name">
              <TextInput value={submission.name} onChange={(value) => patch({ name: value })} disabled={!editable} />
            </Field>
            <Field label="Frequency" hint="Leave blank for online-only stations">
              <TextInput value={submission.frequency ?? ""} onChange={(value) => patch({ frequency: value.trim() || null })} disabled={!editable} />
            </Field>
            <Field label="Market">
              <Select
                value={submission.country}
                disabled={!editable}
                onChange={(value) => {
                  const next = marketFor(value as StationSubmission["country"]);
                  patch({ country: next.code, region: next.regions[0] ?? "National" });
                }}
                options={MARKETS.map((entry) => ({ value: entry.code, label: entry.name }))}
              />
            </Field>
            <Field label="Region">
              <Select
                value={submission.region}
                disabled={!editable}
                onChange={(value) => patch({ region: value })}
                options={market.regions.map((value) => ({ value, label: value }))}
              />
            </Field>
            <Field label="City / town">
              <TextInput value={submission.city} onChange={(value) => patch({ city: value })} disabled={!editable} />
            </Field>
            <Field label="Official website" hint="Must be a site you control">
              <TextInput value={submission.website ?? ""} onChange={(value) => patch({ website: value.trim() || null })} disabled={!editable} />
            </Field>
            <Field label="Description">
              <TextArea rows={3} value={submission.description} onChange={(value) => patch({ description: value })} disabled={!editable} />
            </Field>
            <Field label="Languages">
              <ToggleChips
                options={market.languages}
                selected={submission.languages}
                disabled={!editable}
                onToggle={(value) =>
                  patch({
                    languages: submission.languages.includes(value)
                      ? submission.languages.filter((entry) => entry !== value)
                      : [...submission.languages, value],
                  })
                }
              />
            </Field>
            <Field label="Genres">
              <ToggleChips
                options={GENRES}
                selected={submission.genres}
                disabled={!editable}
                onToggle={(value) =>
                  patch({
                    genres: submission.genres.includes(value)
                      ? submission.genres.filter((entry) => entry !== value)
                      : [...submission.genres, value],
                  })
                }
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Ownership and broadcasting evidence" subtitle="Required before the platform will consider a listing">
          <div className="ws-form">
            <Field label="Ownership statement" hint="Who operates the station and under what entity" htmlFor="ev-ownership">
              <TextArea
                id="ev-ownership"
                rows={3}
                value={submission.evidence.ownershipStatement}
                disabled={!editable}
                onChange={(value) => patchEvidence({ ownershipStatement: value })}
                placeholder="e.g. Operated by Rwenzori Media Ltd, registered in Uganda."
              />
            </Field>
            <Field label="Broadcasting licence reference" hint="UCC licence or exemption reference" htmlFor="ev-licence">
              <TextInput
                id="ev-licence"
                value={submission.evidence.broadcastingLicence}
                disabled={!editable}
                onChange={(value) => patchEvidence({ broadcastingLicence: value })}
                placeholder="e.g. UCC/BC/2025/0142"
              />
            </Field>
            <Field label="Contact name" htmlFor="ev-contact-name">
              <TextInput id="ev-contact-name" value={submission.evidence.contactName} disabled={!editable} onChange={(value) => patchEvidence({ contactName: value })} />
            </Field>
            <Field label="Contact email" htmlFor="ev-contact-email">
              <TextInput id="ev-contact-email" value={submission.evidence.contactEmail} disabled={!editable} onChange={(value) => patchEvidence({ contactEmail: value })} />
            </Field>
            <Field label="Contact phone" htmlFor="ev-contact-phone">
              <TextInput id="ev-contact-phone" value={submission.evidence.contactPhone} disabled={!editable} onChange={(value) => patchEvidence({ contactPhone: value })} />
            </Field>
          </div>

          <div className="ws-evidence">
            <strong>Documents</strong>
            {submission.evidence.documents.length === 0 ? (
              <p className="ws-row__sub" style={{ margin: 0 }}>
                No documents attached. A production build would accept uploads into tenant-scoped storage with signed URLs; this build records
                references only and uploads nothing.
              </p>
            ) : (
              <ul className="ws-list">
                {submission.evidence.documents.map((document) => (
                  <li key={document.id}>
                    <strong>{document.name}</strong> — {document.note}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ws-actions">
            <button type="button" className="kt-btn kt-btn--primary" onClick={submit} disabled={!canSubmit}>
              {submission.status === "changes_requested" ? "Resubmit for review" : "Submit for platform review"}
            </button>
            {!canSubmit && editable ? <span className="ws-row__sub">Add at least one stream endpoint first.</span> : null}
          </div>
        </Panel>
      </div>

      <Panel
        title="Stream endpoints"
        subtitle="Multiple endpoints are supported. A broadcaster cannot verify its own stream."
      >
        {submission.streams.length === 0 ? (
          <EmptyHint title="No endpoints yet">Add the URL your own web player loads, not one copied from a directory.</EmptyHint>
        ) : (
          <div className="ws-streamlist">
            {submission.streams.map((stream) => (
              <StreamRow key={stream.id} submission={submission} stream={stream} canEdit={editable} onTest={testStream} />
            ))}
          </div>
        )}

        <Notice tone="info">
          <strong>What “request check” does.</strong> It records a simulated platform-monitor result against the endpoint, because no
          server-side checker exists in this phase. The verdict is attributed to <code>platform_monitor</code>, never to you, and any URL
          replacement clears the previous verification.
        </Notice>

        <div className="ws-form-grid">
          <Field label="Label" htmlFor="stream-label">
            <TextInput id="stream-label" value={label} onChange={setLabel} disabled={!editable} />
          </Field>
          <Field label="Stream URL" hint="http(s) only" htmlFor="stream-url">
            <TextInput id="stream-url" value={url} onChange={setUrl} placeholder="https://stream.example.ug/live" disabled={!editable} />
          </Field>
          <Field label="Role" htmlFor="stream-role">
            <Select
              id="stream-role"
              value={role}
              onChange={(value) => setRole(value as "primary" | "backup")}
              options={[
                { value: "primary", label: "Primary" },
                { value: "backup", label: "Backup" },
              ]}
              disabled={!editable}
            />
          </Field>
          <Field label="Format" htmlFor="stream-format">
            <Select id="stream-format" value={format} onChange={(value) => setFormat(value as StreamFormat)} options={FORMATS} disabled={!editable} />
          </Field>
        </div>
        <div className="ws-actions">
          <button type="button" className="kt-btn kt-btn--secondary" onClick={addStream} disabled={!editable}>
            Add endpoint
          </button>
        </div>
      </Panel>

      <Panel title="Platform decisions" subtitle="Immutable record of what the platform decided and why">
        {submission.decisions.length === 0 ? (
          <EmptyHint title="No decisions yet">A reviewer records a decision with a reason once the submission is reviewed.</EmptyHint>
        ) : (
          <ul className="ws-history">
            {submission.decisions.map((decision) => (
              <li key={decision.id}>
                <span className="ws-mono">{decision.at.slice(0, 16).replace("T", " ")}</span>
                <span>
                  <strong>{decision.action}</strong> by {decision.actor} ({decision.actorRole})
                </span>
                {decision.reason ? <span className="ws-row__sub">{decision.reason}</span> : null}
                <span className="ws-row__sub">
                  {decision.fromStatus ?? "—"} → {decision.toStatus ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
