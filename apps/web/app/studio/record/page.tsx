"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatRssDuration } from "@kito/studio";
import {
  ActionRow,
  Field,
  LinkButton,
  Notice,
  PageHead,
  Panel,
  Select,
  Stat,
} from "../../../components/studio-ui.tsx";
import { registerObjectUrl, useStudio } from "../../../lib/studio/store.tsx";
import { useRecorder } from "../../../lib/studio/use-recorder.ts";

export default function RecordPage() {
  return (
    <Suspense fallback={<p className="ws-row__sub">Loading recorder…</p>}>
      <RecordView />
    </Suspense>
  );
}

function RecordView() {
  const studio = useStudio();
  const params = useSearchParams();
  const targetEpisodeId = params.get("episode") ?? "";
  const recorder = useRecorder();
  const [selectedEpisode, setSelectedEpisode] = useState(targetEpisodeId);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const episodes = studio.state.episodes;
  const caps = recorder.capabilities;
  const recording = recorder.phase === "recording";
  const paused = recorder.phase === "paused";
  const hasTake = recorder.phase === "stopped" && recorder.blobUrl !== null;

  const save = async (mode: "library" | "episode") => {
    if (!recorder.blobUrl || !caps.mimeType) return;
    const duration = await recorder.measureDuration();
    const payload = {
      name: `recording-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.webm`,
      kind: "recording" as const,
      mimeType: caps.mimeType,
      sizeBytes: recorder.blobSize,
      durationSeconds: duration,
      source: "Recorded in this browser",
    };

    if (mode === "library") {
      const asset = studio.addMediaAsset(payload);
      registerObjectUrl(asset.id, recorder.blobUrl);
      setSavedMessage(`Saved “${asset.name}” to your local media library (${formatRssDuration(duration ?? 0)}).`);
      return;
    }

    if (!selectedEpisode) {
      setSavedMessage("Choose an episode first — or save to the media library instead.");
      return;
    }
    const asset = studio.attachMediaToEpisode(selectedEpisode, payload);
    registerObjectUrl(asset.id, recorder.blobUrl);
    setSavedMessage(`Attached “${asset.name}” to the selected episode. It stays on this device.`);
  };

  return (
    <>
      <PageHead
        title="Recording studio"
        description="Record with the browser's own MediaRecorder, preview the take, then save it locally or attach it to an episode."
        actions={
          <LinkButton href="/studio/media">Media library</LinkButton>
        }
      />

      {caps.unsupportedReason ? (
        <Notice tone="danger">
          <strong>Recording is not available in this browser.</strong> {caps.unsupportedReason}
        </Notice>
      ) : null}

      <div className="ws-stats">
        <Stat label="Recorder" value={caps.mediaRecorder ? "Available" : "Unavailable"} hint={caps.mimeType ?? "no audio mime type"} tone={caps.mediaRecorder ? "ok" : "warn"} />
        <Stat label="Pause / resume" value={caps.pauseResume ? "Supported" : "Not supported"} hint={caps.pauseResume ? "MediaRecorder.pause()" : "Stop and start a new take"} />
        <Stat label="Input meter" value={caps.analyser ? "Live" : "Off"} hint={caps.analyser ? "Web Audio analyser" : "AudioContext unavailable"} />
        <Stat label="Device selection" value={caps.deviceSelection ? "Available" : "Hidden"} hint="Labels appear after permission" />
      </div>

      <Panel
        title="Microphone"
        subtitle="Choose an input, grant permission, then record. Audio never leaves this browser."
        actions={
          recorder.phase === "idle" || recorder.phase === "error" ? (
            <button type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => void recorder.requestPermission()} disabled={!caps.getUserMedia}>
              Enable microphone
            </button>
          ) : null
        }
      >
        {recorder.devices.length > 0 ? (
          <Field label="Input device" htmlFor="mic-device" hint="Switching input re-opens the microphone.">
            <Select
              id="mic-device"
              value={recorder.deviceId}
              onChange={(value) => recorder.setDeviceId(value)}
              options={recorder.devices.map((device) => ({ value: device.deviceId, label: device.label }))}
              disabled={recording || paused}
            />
          </Field>
        ) : (
          <p className="ws-row__sub" style={{ margin: 0 }}>
            No input devices listed yet. Device names only become available after microphone permission is granted.
          </p>
        )}

        {recorder.error ? (
          <Notice tone="danger">
            <strong>Microphone problem.</strong> {recorder.error}
          </Notice>
        ) : null}

        <div className="rec-stage">
          <div className="rec-meter" aria-hidden="true">
            <div className="rec-meter__fill" style={{ width: `${Math.round(recorder.level * 100)}%` }} />
          </div>
          <div className="rec-wave" aria-hidden="true">
            {recorder.levels.length === 0
              ? Array.from({ length: 48 }).map((_, index) => <span key={index} className="rec-wave__bar" style={{ height: 4 }} />)
              : recorder.levels.map((value, index) => <span key={index} className="rec-wave__bar" style={{ height: `${Math.max(4, value * 100)}%` }} />)}
          </div>
          <div className="rec-status">
            <span className={`rec-dot rec-dot--${recorder.phase}`} aria-hidden="true" />
            <strong className="rec-time">{formatRssDuration(recorder.seconds)}</strong>
            <span className="ws-row__sub" role="status">
              {recorder.phase === "idle"
                ? "Ready when you are"
                : recorder.phase === "requesting"
                  ? "Waiting for microphone permission…"
                  : recorder.phase === "ready"
                    ? "Microphone open — press record"
                    : recorder.phase === "recording"
                      ? "Recording"
                      : recorder.phase === "paused"
                        ? "Paused"
                        : recorder.phase === "stopped"
                          ? "Take ready to preview"
                          : "Recorder error"}
            </span>
          </div>
        </div>

        <ActionRow>
          <button
            type="button"
            className="kt-btn kt-btn--primary"
            onClick={() => void recorder.start()}
            disabled={!caps.mediaRecorder || recording || paused || recorder.phase === "requesting"}
          >
            {recorder.phase === "ready" ? "Start recording" : "Record"}
          </button>
          <button type="button" className="kt-btn kt-btn--secondary" onClick={recorder.pause} disabled={!recording || !caps.pauseResume}>
            Pause
          </button>
          <button type="button" className="kt-btn kt-btn--secondary" onClick={recorder.resume} disabled={!paused}>
            Resume
          </button>
          <button type="button" className="kt-btn kt-btn--ghost" onClick={recorder.stop} disabled={!recording && !paused}>
            Stop
          </button>
          {recorder.phase === "stopped" ? (
            <button type="button" className="kt-btn kt-btn--ghost" onClick={recorder.reset}>
              Discard take
            </button>
          ) : null}
        </ActionRow>

        {!caps.pauseResume ? (
          <p className="ws-row__sub" style={{ margin: 0 }}>
            This browser does not support pausing a recording. Stop the take and record another one.
          </p>
        ) : null}
      </Panel>

      {hasTake ? (
        <Panel title="Preview the take" subtitle="Listen before you keep it. Nothing has been saved yet.">
          <audio controls src={recorder.blobUrl ?? undefined} style={{ width: "100%" }} />
          <div className="ws-form-grid">
            <Field label="Local file" hint="Downloads from a blob URL — no server involved.">
              <div className="ws-row" style={{ padding: "8px 10px" }}>
                <div className="ws-row__body">
                  <p className="ws-row__title">recording.webm</p>
                  <p className="ws-row__sub">
                    {(recorder.blobSize / 1024 / 1024).toFixed(1)} MB · {caps.mimeType}
                  </p>
                </div>
                <a className="kt-btn kt-btn--secondary kt-btn--sm" href={recorder.blobUrl ?? "#"} download="kito-recording.webm">
                  Download
                </a>
              </div>
            </Field>
            <Field label="Attach to episode" htmlFor="target-episode" hint="Optional — you can also keep it in the media library.">
              <Select
                id="target-episode"
                value={selectedEpisode}
                onChange={setSelectedEpisode}
                options={[{ value: "", label: "Do not attach" }, ...episodes.map((episode) => ({ value: episode.id, label: `${episode.title} (S${episode.seasonNumber}E${episode.number})` }))]}
              />
            </Field>
          </div>
          <ActionRow>
            <button type="button" className="kt-btn kt-btn--primary kt-btn--sm" onClick={() => void save("library")}>
              Save to media library
            </button>
            <button type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => void save("episode")} disabled={!selectedEpisode}>
              Attach to episode
            </button>
          </ActionRow>
          {savedMessage ? <Notice tone="ok">{savedMessage}</Notice> : null}
        </Panel>
      ) : null}

      <Notice>
        <strong>What this is not.</strong> There is no multi-track editing, no remote recording and no upload service. A take exists as a blob
        in this tab; saving stores its metadata in the local workspace so the episode workflow is real, but the audio itself is not persisted
        after a reload — download it if you want to keep it.
      </Notice>
    </>
  );
}
