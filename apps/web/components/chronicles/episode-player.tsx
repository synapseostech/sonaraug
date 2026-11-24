"use client";

import Link from "next/link";
import { useState } from "react";
import { brand } from "@kito/config";
import { Button, ExternalIcon, PauseIcon, PlayIcon } from "@kito/ui";
import { usePlayer, type Playable } from "../../lib/player.tsx";
import type { PlaybackDescriptor } from "../../lib/server/chronicles.ts";

type Props = {
  episodeId: string;
  slug: string;
  title: string;
  seriesTitle: string;
  seriesId: string;
  durationSeconds: number | null;
  descriptor: PlaybackDescriptor;
  signedIn: boolean;
};

/**
 * The listening panel on an episode page.
 *  - Sonara-controlled audio plays in Sonara's player (seek, speed, progress).
 *  - NotebookLM audio opens on NotebookLM. Sonara does not embed it, cannot see
 *    its progress and says so.
 * The server decided what this component receives; it decides nothing itself.
 */
export function EpisodePlayer(props: Props) {
  const player = usePlayer();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `mc:${props.episodeId}`;
  const current = player.isCurrent(key);
  const d = props.descriptor;

  if (d.state === "locked") {
    const next = `/medical-chronicles/${props.slug}`;
    return (
      <div data-episode-id={props.episodeId} className="mc-paywall" role="region" aria-label="Subscription required">
        <h2>{d.reason === "sign_in_required" ? "Sign in to listen" : d.reason === "withdrawn" ? "This episode has been withdrawn" : d.reason === "not_published" ? "Not published" : "Premium episode"}</h2>
        {d.reason === "subscription_required" || d.reason === "sign_in_required" ? (
          <>
            <p className="sn-small">
              The first episodes of each series are free. This one is part of the Sonara listener subscription, which unlocks every premium Medical Chronicles
              episode.
            </p>
            <div className="sn-row">
              <Link className="kt-btn kt-btn--primary" href="/subscribe/listener">
                See listener plans
              </Link>
              {!props.signedIn ? (
                <Link className="kt-btn kt-btn--ghost" href={`/auth/login?next=${encodeURIComponent(next)}`}>
                  Sign in
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    );
  }
  if (d.state === "unavailable") {
    return (
      <div data-episode-id={props.episodeId} className="mc-paywall" role="status">
        <h2>Audio unavailable</h2>
        <p className="sn-small">{d.note}</p>
      </div>
    );
  }
  if (d.state === "no_source") {
    return (
      <div data-episode-id={props.episodeId} className="mc-paywall" role="status">
        <h2>Audio not attached yet</h2>
        <p className="sn-small">This episode has no audio source yet.</p>
      </div>
    );
  }

  if (d.mode === "external") {
    const recordListen = () => {
      // History only; the page already holds the link because the server allowed access.
      void fetch(`/api/chronicles/episodes/${props.episodeId}/playback`, { method: "POST", keepalive: true }).catch(() => undefined);
    };
    return (
      <div data-episode-id={props.episodeId} className="mc-player">
        <span className="mc-player__control">
          <span className="sn-pill sn-pill--info">Provider-controlled playback</span>
        </span>
        <p className="sn-small" style={{ margin: 0 }}>
          This programme is a NotebookLM Audio Overview. It plays on NotebookLM in a new tab, under Google&apos;s sharing settings. Sonara does not control that
          player and cannot show your progress or resume position.
        </p>
        <a className="kt-btn kt-btn--primary" href={d.url} target="_blank" rel="noopener noreferrer" onClick={recordListen}>
          <ExternalIcon size={16} /> Listen on NotebookLM
        </a>
        <p className="sn-small" style={{ margin: 0 }}>
          If the link no longer opens, the share may have been withdrawn. Let us know at {brand.supportEmail}.
        </p>
      </div>
    );
  }

  const start = async () => {
    setError(null);
    if (current) {
      player.toggle();
      return;
    }
    setBusy(true);
    try {
      // Ask the server again at the moment of playing: access may have changed since the page loaded.
      const response = await fetch(`/api/chronicles/episodes/${props.episodeId}/playback`, { method: "POST" });
      const result = (await response.json()) as { ok: boolean; mode?: string; url?: string; message?: string };
      if (!result.ok || result.mode !== "sonara" || !result.url) {
        setError(result.message ?? "This episode cannot be played right now.");
        return;
      }
      const item: Playable = {
        key,
        kind: "episode",
        title: props.title,
        subtitle: `Medical Chronicles · ${props.seriesTitle}`,
        seed: props.seriesId,
        href: `/medical-chronicles/${props.slug}`,
        durationSeconds: props.durationSeconds ?? undefined,
        audioUrl: result.url,
        progressUrl: props.signedIn ? `/api/chronicles/episodes/${props.episodeId}/progress` : undefined,
      };
      player.play(item);
    } catch {
      setError("We could not reach Sonara. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const playing = current && (player.status === "playing" || player.status === "buffering");
  return (
    <div data-episode-id={props.episodeId} className="mc-player">
      <span className="mc-player__control">
        <span className="sn-pill sn-pill--accent">Sonara player</span> seek, speed and resume supported
      </span>
      <Button variant="primary" onClick={start} disabled={busy} aria-pressed={playing}>
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />} {busy ? "Loading…" : playing ? "Pause" : current ? "Resume" : "Play episode"}
      </Button>
      {current && player.status === "error" ? <p className="sn-small" role="alert">{player.errorMessage}</p> : null}
      {error ? <p className="sn-small" role="alert">{error}</p> : null}
      {!props.signedIn ? <p className="sn-small" style={{ margin: 0 }}>Sign in to keep your listening history across devices.</p> : null}
    </div>
  );
}

export function SaveEpisodeButton({ episodeId, saved, signedIn }: { episodeId: string; saved: boolean; signedIn: boolean }) {
  const [state, setState] = useState(saved);
  const [message, setMessage] = useState<string | null>(null);
  if (!signedIn) return null;
  return (
    <>
      <button
        type="button"
        className="kt-btn kt-btn--ghost kt-btn--sm"
        aria-pressed={state}
        onClick={async () => {
          const response = await fetch(`/api/chronicles/episodes/${episodeId}/save`, { method: "POST" });
          const result = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; saved?: boolean; message?: string };
          if (result.ok) setState(Boolean(result.saved));
          else setMessage(result.message ?? "Could not save.");
        }}
      >
        {state ? "Saved" : "Save episode"}
      </button>
      {message ? <span className="sn-small" role="alert">{message}</span> : null}
    </>
  );
}
