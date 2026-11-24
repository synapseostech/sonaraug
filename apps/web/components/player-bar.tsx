"use client";

import Link from "next/link";
import {
  Artwork,
  Badge,
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  ForwardIcon,
  HeartIcon,
  IconButton,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  Range,
  RewindIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
} from "@kito/ui";
import { featuredStation } from "../lib/data/queries.ts";
import { formatDuration } from "../lib/format.ts";
import { useLibrary } from "../lib/library.tsx";
import { PLAYBACK_SPEEDS, usePlayer } from "../lib/player.tsx";
import type { Playable } from "../lib/player.tsx";
import { stationPlayable } from "../lib/playables.ts";
import { useEffect, useMemo, useRef } from "react";

/**
 * Live state copy. Deliberately distinguishes buffering from reconnecting from
 * error: a listener needs to know whether to wait or to intervene.
 */
function liveStateLabel(player: ReturnType<typeof usePlayer>): string {
  switch (player.status) {
    case "loading":
      return "Connecting…";
    case "buffering":
      return "Buffering…";
    case "reconnecting": {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return `${offline ? "You are offline — " : ""}Reconnecting${player.liveConnection.attempt ? ` (${player.liveConnection.attempt}/${player.liveConnection.maxAttempts})` : ""}…`;
    }
    case "playing":
      return "On air";
    case "paused":
      return "Paused — resume rejoins live";
    case "error":
      return player.errorMessage ?? "Stream unavailable";
    default:
      return "Not connected";
  }
}

/** Provenance block for a verified stream; demo hint everywhere else. */
function StreamFacts({ item }: { item: Playable }) {
  if (!item.live || item.live.status !== "playable") {
    return <p className="playerbar__sub" style={{ marginTop: 8 }}>Demo playback — no audio stream is connected in this build.</p>;
  }
  const bits = [
    item.live.codec ?? (item.live.format === "hls" ? "HLS" : "MP3"),
    item.live.bitrateKbps ? `${item.live.bitrateKbps} kbps` : null,
    item.live.verifiedAt ? `verified ${item.live.verifiedAt}` : null,
  ].filter(Boolean);
  return (
    <p className="playerbar__sub" style={{ marginTop: 8 }}>
      Verified live stream · {bits.join(" · ")}
      {item.live.rights === "third_party_aggregator" ? " · rights unconfirmed" : ""}
    </p>
  );
}

export function PlayerBar() {
  const player = usePlayer();
  const library = useLibrary();
  const current = player.current;

  const favouriteStation = useMemo(() => {
    if (!current || current.kind !== "live") return null;
    const slug = current.key.replace("live:", "");
    return { slug, active: library.isFavouriteStation(slug) };
  }, [current, library]);

  if (!current) {
    const start = stationPlayable(featuredStation);
    return (
      <div className="playerbar">
        <div className="playerbar__inner" style={{ gridTemplateColumns: "1fr auto" }}>
          <div className="playerbar__empty">
            <PlayIcon size={16} />
            <span>{start.audioUrl ? `Nothing playing yet. Start with ${featuredStation.name}.` : "Nothing playing yet."}</span>
          </div>
          <div className="playerbar__extra">
            {/* Never offer a one-tap start for a station that cannot produce audio. */}
            {start.audioUrl ? (
              <Button variant="primary" size="sm" onClick={() => player.play(start)}>
                <PlayIcon size={14} /> Start listening
              </Button>
            ) : (
              <Link href="/radio" className="kt-btn kt-btn--secondary kt-btn--sm">
                Browse stations
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const live = current.kind === "live";
  const playing = player.status === "playing";
  const loading = player.status === "loading";
  const duration = current.durationSeconds ?? 0;

  return (
    <>
      <div className="playerbar">
        <div className="playerbar__inner">
          <div className="playerbar__now">
            <div className="playerbar__art">
              <Artwork seed={current.seed} title={current.title} shape={live ? "round" : "square"} />
            </div>
            <div className="playerbar__meta">
              <p className="playerbar__title">{current.title}</p>
              <p className="playerbar__sub">{current.subtitle}</p>
              {!live && !current.audioUrl ? (
                <p className="playerbar__sub playerbar__preview">
                  <Badge tone="demo">Preview</Badge> no audio in this build
                </p>
              ) : null}
            </div>
            {favouriteStation ? (
              <IconButton
                label={favouriteStation.active ? "Remove station from favourites" : "Add station to favourites"}
                size="sm"
                aria-pressed={favouriteStation.active}
                onClick={() => library.toggleFavouriteStation(favouriteStation.slug)}
              >
                <HeartIcon filled={favouriteStation.active} size={16} />
              </IconButton>
            ) : null}
          </div>

          <div>
            <div className="playerbar__controls">
              <IconButton
                label="Previous"
                size="sm"
                onClick={player.previous}
                disabled={!player.hasPrevious}
              >
                <SkipBackIcon size={16} />
              </IconButton>
              <IconButton
                label={playing ? "Pause" : loading ? "Tuning in" : "Play"}
                size="lg"
                tone="accent"
                onClick={() => player.toggle()}
                aria-pressed={playing}
              >
                {playing || player.status === "buffering" ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
              </IconButton>
              <IconButton label="Next" size="sm" onClick={player.next} disabled={!player.hasNext}>
                <SkipForwardIcon size={16} />
              </IconButton>
            </div>

            {live ? (
              <div className="playerbar__live">
                {current.live?.status === "playable" ? <Badge tone="live">Live</Badge> : <Badge tone="demo">Demo</Badge>}
                <span className={`playerbar__livestate playerbar__livestate--${player.status}`}>{liveStateLabel(player)}</span>
                {current.live?.status === "playable" ? (
                  <>
                    <span>·</span>
                    <span>
                      {current.live.bitrateKbps ? `${current.live.bitrateKbps} kbps ` : ""}
                      {current.live.format === "hls" ? "HLS" : "MP3"}
                    </span>
                  </>
                ) : null}
                <span>·</span>
                <span>{formatDuration(player.positionSeconds)} listening</span>
              </div>
            ) : (
              <div className="playerbar__scrub">
                <span className="playerbar__time">{formatDuration(player.positionSeconds)}</span>
                <Range
                  label="Seek within episode"
                  value={Math.min(player.positionSeconds, duration)}
                  max={duration}
                  step={1}
                  onValueChange={(value) => player.seek(value)}
                />
                <span className="playerbar__time">{formatDuration(duration)}</span>
              </div>
            )}
          </div>

          <div className="playerbar__extra">
            {live && player.status === "error" ? (
              <Button variant="secondary" size="sm" onClick={player.retry}>
                Retry stream
              </Button>
            ) : null}
            {!live && current.audioUrl && player.status === "error" ? (
              <Button variant="secondary" size="sm" onClick={player.retry} title={player.errorMessage ?? undefined}>
                Retry
              </Button>
            ) : null}
            <IconButton label={player.muted ? "Unmute" : "Mute"} size="sm" onClick={player.toggleMute} aria-pressed={player.muted}>
              <VolumeIcon muted={player.muted} size={17} />
            </IconButton>
            <div className="playerbar__volume">
              <Range
                label="Volume"
                value={Math.round((player.muted ? 0 : player.volume) * 100)}
                max={100}
                onValueChange={(value) => player.setVolume(value / 100)}
              />
            </div>
            <IconButton label="Queue" size="sm" onClick={player.expand}>
              <QueueIcon size={17} />
            </IconButton>
            <IconButton label="Expand player" size="sm" className="playerbar__expand" onClick={player.expand}>
              <ChevronUpIcon size={17} />
            </IconButton>
          </div>
        </div>
      </div>
      {player.expanded ? <FullPlayer /> : null}
    </>
  );
}

function FullPlayer() {
  const player = usePlayer();
  const current = player.current;
  const collapseRef = useRef(player.collapse);
  collapseRef.current = player.collapse;

  // The expanded player owns the viewport: lock background scrolling and let
  // Escape close it, the way a modal should behave. Mount-only, so the 500ms
  // playback clock cannot tear the listener down and re-add it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") collapseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!current) return null;

  const live = current.kind === "live";
  const verified = current.live?.status === "playable";
  const playing = player.status === "playing";
  const duration = current.durationSeconds ?? 0;

  return (
    <div className="fullplayer" role="dialog" aria-modal="true" aria-label="Now playing">
      <div className="fullplayer__top">
        <span className="fullplayer__label">
          {live
            ? verified
              ? "Live radio · verified stream"
              : "Live radio · demo (no stream connected)"
            : current.kind === "video"
              ? "Video · audio demo"
              : "Now playing · demo"}
        </span>
        <IconButton label="Collapse player" onClick={player.collapse}>
          <ChevronDownIcon size={20} />
        </IconButton>
      </div>

      <div className="fullplayer__stage">
        <div className="fullplayer__art">
          <Artwork seed={current.seed} title={current.title} shape={live ? "round" : "square"} />
        </div>
        <div className="fullplayer__info">
          <h1 className="fullplayer__title">{current.title}</h1>
          <p className="fullplayer__sub">{current.subtitle}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {verified ? <Badge tone="live">Verified live</Badge> : live ? <Badge tone="demo">Demo</Badge> : null}
            <Button variant="ghost" size="sm" onClick={() => player.addToQueue(current)}>
              Add to queue
            </Button>
            <Link href={current.href} className="kt-btn kt-btn--ghost kt-btn--sm">
              Open page
            </Link>
          </div>
          <StreamFacts item={current} />
          {live && player.errorMessage ? (
            <div className="stream-error" role="alert">
              <p>{player.errorMessage}</p>
              <Button variant="secondary" size="sm" onClick={player.retry}>
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="fullplayer__bottom">
        <div className="fullplayer__controls">
          <div className="fullplayer__buttons">
            <IconButton label="Back 15 seconds" onClick={() => player.skipBy(-15)} disabled={live}>
              <RewindIcon size={20} />
            </IconButton>
            <IconButton label="Previous" onClick={player.previous} disabled={!player.hasPrevious}>
              <SkipBackIcon size={20} />
            </IconButton>
            <IconButton
              label={playing ? "Pause" : "Play"}
              size="lg"
              tone="accent"
              onClick={() => player.toggle()}
              style={{ width: 56, height: 56 }}
            >
              {playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
            </IconButton>
            <IconButton label="Next" onClick={player.next} disabled={!player.hasNext}>
              <SkipForwardIcon size={20} />
            </IconButton>
            <IconButton label="Forward 15 seconds" onClick={() => player.skipBy(15)} disabled={live}>
              <ForwardIcon size={20} />
            </IconButton>
          </div>

          {live ? (
            <div className="live-strip">
              {verified ? <Badge tone="live">Live</Badge> : <Badge tone="demo">Demo</Badge>}
              <span>
                {liveStateLabel(player)} · {formatDuration(player.positionSeconds)} in this session
                {verified ? " · live radio has no seek or rewind" : ""}
              </span>
            </div>
          ) : (
            <div>
              <div className="fullplayer__scrub">
                <Range
                  label="Seek within episode"
                  value={Math.min(player.positionSeconds, duration)}
                  max={duration}
                  onValueChange={(value) => player.seek(value)}
                />
              </div>
              <div className="fullplayer__times">
                <span>{formatDuration(player.positionSeconds)}</span>
                <span>-{formatDuration(Math.max(0, duration - player.positionSeconds))}</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="small muted">Speed</span>
            {PLAYBACK_SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                className={`kt-chip${player.speed === value ? " kt-chip--active" : ""}`}
                onClick={() => player.setSpeed(value)}
                disabled={live}
                aria-pressed={player.speed === value}
              >
                {value}×
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconButton label={player.muted ? "Unmute" : "Mute"} onClick={player.toggleMute}>
              <VolumeIcon muted={player.muted} size={18} />
            </IconButton>
            <div style={{ flex: 1 }}>
              <Range
                label="Volume"
                value={Math.round((player.muted ? 0 : player.volume) * 100)}
                max={100}
                onValueChange={(value) => player.setVolume(value / 100)}
              />
            </div>
            <span className="small muted" style={{ minWidth: 32, textAlign: "right" }}>
              {Math.round((player.muted ? 0 : player.volume) * 100)}%
            </span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {verified
              ? "Volume, mute and pause control the live audio stream directly."
              : "Volume and output controls are wired to the audio engine; they have no audible effect until a real stream is connected."}
          </p>
        </div>

        <div className="fullplayer__queue">
          <h2>Queue · {player.queue.length}</h2>
          {player.queue.length === 0 ? (
            <p className="small muted">
              Nothing queued. Use the <QueueIcon size={14} /> or + buttons on any show, episode or video.
            </p>
          ) : (
            <>
              <div className="queue-list">
                {player.queue.map((item: Playable) => (
                  <div key={item.key} className="queue-item">
                    <div className="queue-item__art">
                      <Artwork seed={item.seed} title={item.title} />
                    </div>
                    <div className="queue-item__body">
                      <p className="queue-item__title">{item.title}</p>
                      <p className="queue-item__sub">{item.subtitle}</p>
                    </div>
                    <IconButton
                      label={`Play ${item.title} next`}
                      size="sm"
                      onClick={() => {
                        player.removeFromQueue(item.key);
                        player.play(item);
                      }}
                    >
                      <PlayIcon size={14} />
                    </IconButton>
                    <IconButton label={`Remove ${item.title} from queue`} size="sm" onClick={() => player.removeFromQueue(item.key)}>
                      <CloseIcon size={14} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={player.clearQueue} block>
                Clear queue
              </Button>
            </>
          )}
          <p className="small muted" style={{ marginTop: "auto", paddingTop: 16 }}>
            {live ? "Live stream — no progress bar by design" : "Progress saves to your library automatically"}
          </p>
        </div>
      </div>
    </div>
  );
}
