"use client";

import { useEffect, useRef, useState } from "react";
import type { BroadcastSession } from "@kito/studio";
import {
  DemoBadge,
  EmptyHint,
  Field,
  Notice,
  PageHead,
  Panel,
  Select,
  Stat,
  StatusPill,
  TextInput,
} from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

function clock(value: string | null): string {
  if (!value) return "—";
  return value.slice(11, 16);
}

function dayLabel(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

export default function LiveBroadcastPage() {
  const studio = useStudio();
  const sessions = studio.state.sessions;
  const [activeId, setActiveId] = useState(sessions[0]?.id ?? "");
  const session = sessions.find((entry) => entry.id === activeId) ?? sessions[0];
  const [message, setMessage] = useState<string | null>(null);
  const [programmeTitle, setProgrammeTitle] = useState("");
  const [programmeHost, setProgrammeHost] = useState("");
  const [programmeStart, setProgrammeStart] = useState("");
  const [programmeMinutes, setProgrammeMinutes] = useState("60");

  const live = session?.simulatedState === "live";
  const sessionId = session?.id ?? "";
  const listeners = session?.listenersDemo ?? 0;
  const updateRef = useRef(studio.updateSession);
  updateRef.current = studio.updateSession;

  /* Demo listener counter: a local random walk, clearly not real telemetry. */
  useEffect(() => {
    if (!live || !sessionId) return;
    const timer = setInterval(() => {
      const drift = Math.round((Math.random() - 0.42) * 12);
      const next = Math.max(3, Math.min(320, listeners + drift));
      updateRef.current(sessionId, { listenersDemo: next });
    }, 4000);
    return () => clearInterval(timer);
  }, [live, sessionId, listeners]);

  if (!session) {
    return (
      <>
        <PageHead title="Live broadcast" description="No broadcast session is configured." />
        <EmptyHint title="No session">Reset the demo data to restore the seeded broadcast session.</EmptyHint>
      </>
    );
  }

  const programmes = [...studio.state.programmes]
    .filter((slot) => slot.stationId === session.stationId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const start = () => {
    setMessage("Requesting simulcast start…");
    studio.updateSession(session.id, { simulatedState: "connecting" });
    window.setTimeout(() => {
      const result = studio.startBroadcast(session.id);
      setMessage(result.ok ? "Simulcast state is now ‘live’ — locally simulated. Nothing is transmitted." : result.reason);
    }, 1200);
  };

  const stop = () => {
    studio.stopBroadcast(session.id);
    setMessage("Simulated broadcast stopped. Listener demo counter reset.");
  };

  const addProgramme = () => {
    if (programmeTitle.trim().length < 3 || !programmeStart) {
      setMessage("A programme needs a title and a start time.");
      return;
    }
    studio.addProgramme({
      stationId: session.stationId,
      title: programmeTitle.trim(),
      host: programmeHost.trim() || "Unassigned",
      startsAt: new Date(programmeStart).toISOString(),
      durationMinutes: Number(programmeMinutes) || 60,
      notes: "",
    });
    setProgrammeTitle("");
    setProgrammeHost("");
    setMessage("Programme added to the schedule (local state).");
  };

  const update = (patch: Partial<BroadcastSession>) => studio.updateSession(session.id, patch);

  return (
    <>
      <PageHead
        title="Live broadcast"
        description="Prepare a programme, configure the (future) ingest target and rehearse the start/stop flow locally."
        actions={<DemoBadge />}
      />

      <Notice tone="warn">
        <strong>No ingest exists in this build.</strong> Starting a broadcast only changes a local state value. There is no RTMP/SRT receiver,
        no transcoder, no HLS packager and no public delivery — nothing is transmitted and no listener can connect. The interface is shaped so
        a real ingest service can be attached later without redesigning it.
      </Notice>

      {sessions.length > 1 ? (
        <Field label="Session">
          <Select value={session.id} onChange={setActiveId} options={sessions.map((entry) => ({ value: entry.id, label: entry.title }))} />
        </Field>
      ) : null}

      {message ? <Notice tone={/not |need|No ingest/i.test(message) ? "warn" : "info"}>{message}</Notice> : null}

      <div className="ws-split">
        <Panel
          title="Broadcast control"
          subtitle={`${session.title} · ${session.host}`}
          actions={<StatusPill kind="plain" value={session.simulatedState} />}
        >
          <div className="rec-stage">
            <div className="rec-stage__head">
              <p className="rec-time">{live ? "00:00" : "—"}</p>
              <div className="ws-actions">
                <span className={`rec-dot${live ? " rec-dot--live" : ""}`} aria-hidden="true" />
                <span className="ws-row__sub">
                  {session.simulatedState === "live"
                    ? "Simulated on-air"
                    : session.simulatedState === "connecting"
                      ? "Connecting (simulated)…"
                      : session.simulatedState === "stopped"
                        ? "Stopped"
                        : "Idle"}
                </span>
              </div>
            </div>

            <dl className="ws-kv">
              <dt>Ingest target</dt>
              <dd className="ws-mono">{session.ingestTarget}</dd>
              <dt>Delivery</dt>
              <dd>Not configured — no HLS output exists in this build.</dd>
              <dt>Started at</dt>
              <dd>{session.startedAt ? session.startedAt.slice(0, 16).replace("T", " ") : "—"}</dd>
              <dt>Listeners (demo)</dt>
              <dd>{session.listenersDemo.toLocaleString()} — placeholder counter, not real audience data</dd>
            </dl>

            <div className="rec-controls">
              <button type="button" className="kt-btn kt-btn--primary" onClick={start} disabled={live || session.simulatedState === "connecting"}>
                {session.simulatedState === "connecting" ? "Connecting…" : "Start simulated broadcast"}
              </button>
              <button type="button" className="kt-btn kt-btn--secondary" onClick={stop} disabled={!live && session.simulatedState !== "connecting"}>
                Stop
              </button>
            </div>
          </div>

          <Field label="Ingest target" hint="Reserved example host. A real deployment would receive a provisioned RTMP/SRT URL from the ingest service.">
            <TextInput value={session.ingestTarget} onChange={(value) => update({ ingestTarget: value })} />
          </Field>
          <Field label="Programme title">
            <TextInput value={session.title} onChange={(value) => update({ title: value })} />
          </Field>
          <Field label="Host on air">
            <TextInput value={session.host} onChange={(value) => update({ host: value })} />
          </Field>
        </Panel>

        <Panel title="Future connection path" subtitle="What a production build would require">
          <ol className="ws-list">
            <li>Broadcaster pushes RTMP or SRT to a dedicated ingest endpoint with a per-station stream key.</li>
            <li>Ingest service validates the key, records the session and forwards to a transcoder.</li>
            <li>Transcoder produces HLS renditions and segment storage with a short retention window.</li>
            <li>Delivery serves the playlist over HTTPS; the listener app plays it with the existing engine.</li>
            <li>Monitoring watches segment freshness, and the station page flips to “live” only from real evidence.</li>
          </ol>
          <Notice tone="info">
            Each of those steps is infrastructure we have not provisioned. Until it exists, this screen rehearses the workflow and states
            plainly that nothing is being transmitted.
          </Notice>
        </Panel>
      </div>

      <div className="ws-stats">
        <Stat label="Programmes scheduled" value={programmes.length} hint="Local records" />
        <Stat label="Session state" value={session.simulatedState} hint="Simulated" />
        <Stat label="Demo listeners" value={session.listenersDemo.toLocaleString()} hint="Placeholder counter" />
        <Stat label="Ingest" value={session.ingestTarget.includes("not configured") ? "unset" : "configured"} hint="No server is listening" />
      </div>

      <Panel title="Broadcast schedule" subtitle="Programme metadata — not derived from any real station schedule">
        {programmes.length === 0 ? (
          <EmptyHint title="Nothing scheduled yet">Add a programme below to build a rehearsal schedule.</EmptyHint>
        ) : (
          <ul className="ws-schedule">
            {programmes.map((slot) => (
              <li key={slot.id} className="ws-schedule__item">
                <div className="ws-schedule__time">
                  <span className="ws-mono">{dayLabel(slot.startsAt)}</span>
                  <strong>{clock(slot.startsAt)}</strong>
                </div>
                <div>
                  <p className="ws-row__title" style={{ margin: 0 }}>
                    {slot.title}
                  </p>
                  <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
                    {slot.host} · {slot.durationMinutes} min{slot.notes ? ` · ${slot.notes}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="ws-form-grid">
          <Field label="Programme title" htmlFor="pr-title">
            <TextInput id="pr-title" value={programmeTitle} onChange={setProgrammeTitle} placeholder="e.g. Evening drive" />
          </Field>
          <Field label="Host" htmlFor="pr-host">
            <TextInput id="pr-host" value={programmeHost} onChange={setProgrammeHost} placeholder="Presenter name" />
          </Field>
          <Field label="Starts" htmlFor="pr-start">
            <input
              id="pr-start"
              className="ws-input"
              type="datetime-local"
              value={programmeStart}
              onChange={(event) => setProgrammeStart(event.target.value)}
            />
          </Field>
          <Field label="Duration (minutes)">
            <TextInput value={programmeMinutes} onChange={setProgrammeMinutes} type="number" />
          </Field>
        </div>
        <div className="ws-actions">
          <button type="button" className="kt-btn kt-btn--secondary" onClick={addProgramme}>
            Add programme
          </button>
        </div>
      </Panel>
    </>
  );
}
