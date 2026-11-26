"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Hls from "hls.js";
import { backoffDelayMs, classifyMediaError, describePlaybackError, formatSupport } from "@kito/media";
import type { PlaybackErrorCode, StreamFormatKind } from "@kito/media";
import { useLibrary } from "./library.tsx";
import type { SavedRef } from "./library.tsx";
import type { DiscoveryMethod, RightsStatus, StreamFormat, StreamStatus } from "./data/streams.ts";

export type PlayableKind = "live" | "episode" | "video";

/** Everything the UI needs to describe a live stream honestly. */
export type LiveStreamInfo = {
  status: StreamStatus;
  format: StreamFormat | null;
  bitrateKbps: number | null;
  codec: string | null;
  endpointUrl: string | null;
  source: DiscoveryMethod;
  rights: RightsStatus;
  /** ISO date of the last successful browser check, from the stream registry. */
  verifiedAt: string | null;
  officialWebsite: string | null;
};

export type Playable = {
  key: string;
  kind: PlayableKind;
  title: string;
  subtitle: string;
  /** Artwork seed — matches the catalogue id so colours stay stable. */
  seed: string;
  href: string;
  /** Undefined for live radio: a live stream has no known duration. */
  durationSeconds?: number;
  /** Real stream URL, resolved from the registry. Null when nothing is verified. */
  audioUrl?: string | null;
  /** Present for live radio only: provenance and verification of the stream. */
  live?: LiveStreamInfo;
  /**
   * On-demand audio the server has authorised (Medical Chronicles). When set on a
   * non-live item, a real audio element drives position, seek, speed and ending.
   * Without it, on-demand items are previews with no audio.
   */
  progressUrl?: string;
};

/**
 * `buffering` and `reconnecting` are distinct on purpose: one means the audio is
 * filling its buffer, the other means we lost the connection and are retrying.
 * A listener on a flaky mobile connection deserves to know which is happening.
 */
export type PlayerStatus = "idle" | "loading" | "buffering" | "reconnecting" | "playing" | "paused" | "error";

/** Live-connection detail exposed to the UI. */
export type LiveConnection = {
  /** True when a real HTMLAudioElement is driving playback. */
  real: boolean;
  /** Automatic retry currently in flight (1-based); 0 when healthy or idle. */
  attempt: number;
  maxAttempts: number;
  /** False when this browser cannot decode the station's format (e.g. HLS on Firefox). */
  browserCanPlay: boolean;
  /** Human explanation when the format is unsupported. */
  formatNote: string | null;
};

type PlayerApi = {
  current: Playable | null;
  status: PlayerStatus;
  positionSeconds: number;
  speed: number;
  volume: number;
  muted: boolean;
  queue: Playable[];
  expanded: boolean;
  errorMessage: string | null;
  liveConnection: LiveConnection;
  hasNext: boolean;
  hasPrevious: boolean;
  /** Starts an item, or toggles it when it is already the current item. */
  play: (item: Playable, options?: { context?: Playable[] }) => void;
  toggle: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  skipBy: (deltaSeconds: number) => void;
  next: () => void;
  previous: () => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  addToQueue: (item: Playable) => void;
  playNext: (item: Playable) => void;
  removeFromQueue: (key: string) => void;
  clearQueue: () => void;
  expand: () => void;
  collapse: () => void;
  isCurrent: (key: string) => boolean;
  retry: () => void;
};

const PlayerContext = createContext<PlayerApi | null>(null);

const TUNE_IN_MS = 420;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/**
 * Automatic reconnection budget for a live stream. Four attempts span roughly
 * 0.4s + 0.8s + 1.6s + 3.2s of backoff before we hand control back to the
 * listener — long enough to ride out a tunnel, short enough not to lie about a
 * station that is genuinely off air.
 */
const MAX_LIVE_ATTEMPTS = 4;

function toSavedRef(item: Playable): SavedRef {
  return {
    key: item.key,
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle,
    seed: item.seed,
    href: item.href,
    at: Date.now(),
  };
}

/** A real, browser-playable stream. */
function isRealLive(item: Playable | null): item is Playable & { audioUrl: string } {
  return Boolean(item && item.kind === "live" && item.audioUrl);
}

/** Real on-demand audio (an authorised episode file): seekable, with a true position. */
function isRealOnDemand(item: Playable | null): item is Playable & { audioUrl: string } {
  return Boolean(item && item.kind !== "live" && item.audioUrl);
}

const isRealAudio = (item: Playable | null): item is Playable & { audioUrl: string } => isRealLive(item) || isRealOnDemand(item);

function formatOf(item: Playable): StreamFormat {
  return item.live?.format ?? "mp3";
}

/**
 * Appending a cache-busting parameter makes a retry a genuinely new request
 * rather than a re-use of a dead connection. Broadcast origins ignore unknown
 * query parameters.
 */
function withCacheBuster(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("_r", String(Date.now()));
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Browser format probe. HLS is the interesting case (see @kito/media). */
function probeFormat(item: Playable): { supported: boolean; note: string | null } {
  if (typeof window === "undefined") return { supported: true, note: null };
  const probe = document.createElement("audio");
  const support = formatSupport(formatOf(item) as StreamFormatKind, (mime) => probe.canPlayType(mime), {
    hlsLibrarySupported: formatOf(item) === "hls" && Hls.isSupported(),
  });
  if (support.supported) return { supported: true, note: null };
  return {
    supported: false,
    note:
      formatOf(item) === "hls"
        ? "This browser does not support HLS playback."
        : "This browser cannot play the station's audio format.",
  };
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const library = useLibrary();
  const libraryRef = useRef(library);
  libraryRef.current = library;

  const [current, setCurrent] = useState<Playable | null>(null);
  const [status, setStatusState] = useState<PlayerStatus>("idle");
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [queue, setQueue] = useState<Playable[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [context, setContext] = useState<{ items: Playable[]; index: number } | null>(null);
  const [liveConnection, setLiveConnection] = useState<LiveConnection>({
    real: false,
    attempt: 0,
    maxAttempts: MAX_LIVE_ATTEMPTS,
    browserCanPlay: true,
    formatNote: null,
  });

  const tuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);

  /* Refs mirroring state that DOM event handlers must read synchronously. */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hlsFailureHandledRef = useRef(false);
  const currentRef = useRef<Playable | null>(null);
  const statusRef = useRef<PlayerStatus>("idle");
  const attemptRef = useRef(0);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  /** True while we intentionally tear down src, so the resulting error is ignored. */
  const releasingRef = useRef(false);
  /** Position to apply once on-demand metadata has loaded (resume / retry). */
  const pendingSeekRef = useRef<number | null>(null);
  const speedRef = useRef(1);
  const endedRef = useRef<() => void>(() => undefined);
  const lastServerReport = useRef(0);

  const setStatus = useCallback((next: PlayerStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const clearTuneTimer = useCallback(() => {
    if (tuneTimer.current) {
      clearTimeout(tuneTimer.current);
      tuneTimer.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  const destroyHls = useCallback(() => {
    const hls = hlsRef.current;
    hlsRef.current = null;
    hls?.destroy();
  }, []);

  /**
   * Stops the audio element and releases the socket. Called before every switch
   * so two stations can never play at once, and so a paused live stream does not
   * keep a connection (and a broadcaster's bandwidth) open.
   */
  const releaseAudio = useCallback(() => {
    clearRetryTimer();
    destroyHls();
    const el = audioRef.current;
    if (!el) return;
    releasingRef.current = true;
    el.pause();
    el.removeAttribute("src");
    el.load();
    // Let the abort event settle before we start trusting error events again.
    setTimeout(() => {
      releasingRef.current = false;
    }, 0);
  }, [clearRetryTimer, destroyHls]);

  /* Opens (or re-opens) the real stream. */
  const openStream = useCallback(
    (item: Playable, options: { retry?: boolean } = {}) => {
      const el = audioRef.current;
      if (!el || !item.audioUrl) return;
      destroyHls();
      hlsFailureHandledRef.current = false;
      clearRetryTimer();
      setErrorMessage(null);
      setStatus("loading");
      // Only a live retry needs a fresh connection; on-demand files resume by Range request.
      const url = options.retry && item.kind === "live" ? withCacheBuster(item.audioUrl) : item.audioUrl;
      const playElement = () => {
        const started = el.play();
        if (started && typeof started.catch === "function") {
          started.catch((error: DOMException) => {
            if (error?.name === "AbortError") return;
            if (error?.name === "NotAllowedError") {
              setStatus("paused");
              setErrorMessage("Your browser blocked autoplay. Press play to start the stream.");
              return;
            }
            failRef.current(classifyMediaError(el.error?.code ?? null, { online: navigator.onLine }));
          });
        }
      };
      if (item.kind === "live" && formatOf(item) === "hls" && !formatSupport("hls", (mime) => el.canPlayType(mime)).supported) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (hlsRef.current === hls) playElement();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || hlsRef.current !== hls) return;
          hlsFailureHandledRef.current = true;
          hlsRef.current = null;
          hls.destroy();
          failRef.current(data.type === Hls.ErrorTypes.NETWORK_ERROR ? "network_unreachable" : "decode_failed");
        });
        hls.loadSource(url);
        hls.attachMedia(el);
        return;
      }
      try {
        el.src = url;
      } catch {
        setStatus("error");
        setErrorMessage(describePlaybackError("unsupported_format").message);
        return;
      }
      playElement();
    },
    [clearRetryTimer, destroyHls, setStatus],
  );

  /* Reconnect with backoff, or give up and offer a manual retry. */
  const handleFailure = useCallback(
    (code: PlaybackErrorCode) => {
      const item = currentRef.current;
      if (!isRealLive(item)) return;
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      setLiveConnection((previous) => ({ ...previous, attempt }));
      const described = describePlaybackError(code);
      setErrorMessage(described.message);

      if (attempt > MAX_LIVE_ATTEMPTS) {
        setStatus("error");
        return;
      }

      setStatus("reconnecting");
      clearRetryTimer();
      retryTimer.current = setTimeout(() => {
        const target = currentRef.current;
        if (!target) return;
        openStream(target, { retry: true });
      }, backoffDelayMs(attempt - 1));
    },
    [clearRetryTimer, openStream, setStatus],
  );

  const failRef = useRef(handleFailure);
  failRef.current = handleFailure;
  const openRef = useRef(openStream);
  openRef.current = openStream;

  /* The audio element, created once and reused for the life of the app. */
  useEffect(() => {
    const el = new Audio();
    el.preload = "none";
    el.volume = volumeRef.current;
    el.muted = mutedRef.current;
    // Attached (not just referenced) so the element is discoverable in devtools,
    // survives React re-renders, and can be inspected by the browser test suite.
    el.dataset.testid = "live-audio";
    el.style.display = "none";
    document.body.appendChild(el);

    const onPlaying = () => {
      attemptRef.current = 0;
      setLiveConnection((previous) => ({ ...previous, attempt: 0 }));
      setErrorMessage(null);
      setStatus("playing");
    };
    const onWaiting = () => {
      if (statusRef.current === "playing") setStatus("buffering");
    };
    const onPause = () => {
      if (releasingRef.current) return;
      if (statusRef.current === "playing" || statusRef.current === "buffering") setStatus("paused");
    };
    const onError = () => {
      if (releasingRef.current) return;
      if (hlsFailureHandledRef.current) return;
      const item = currentRef.current;
      if (isRealOnDemand(item)) {
        // On-demand files do not auto-reconnect; the listener can retry from where they were.
        setStatus("error");
        setErrorMessage(describePlaybackError(classifyMediaError(el.error?.code ?? null, { online: navigator.onLine })).message);
        return;
      }
      if (!isRealLive(item)) return;
      failRef.current(classifyMediaError(el.error?.code ?? null, { online: navigator.onLine }));
    };
    const onTimeUpdate = () => {
      if (isRealOnDemand(currentRef.current)) setPositionSeconds(el.currentTime);
    };
    const onLoadedMetadata = () => {
      const item = currentRef.current;
      if (!isRealOnDemand(item)) return;
      el.playbackRate = speedRef.current;
      if (pendingSeekRef.current !== null && Number.isFinite(el.duration)) {
        el.currentTime = Math.min(pendingSeekRef.current, Math.max(0, el.duration - 1));
        pendingSeekRef.current = null;
      }
      // Trust the file over catalogue metadata for the real duration.
      if (Number.isFinite(el.duration) && el.duration > 0 && Math.round(el.duration) !== item.durationSeconds) {
        const updated = { ...item, durationSeconds: Math.round(el.duration) };
        currentRef.current = updated;
        setCurrent(updated);
      }
    };
    const onEnded = () => {
      if (isRealOnDemand(currentRef.current)) endedRef.current();
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("ended", onEnded);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("stalled", onWaiting);
    el.addEventListener("pause", onPause);
    el.addEventListener("error", onError);
    audioRef.current = el;

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("stalled", onWaiting);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("error", onError);
      releasingRef.current = true;
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
      audioRef.current = null;
    };
  }, [setStatus]);

  /* Volume and mute drive the element directly, so the effect is audible. */
  useEffect(() => {
    volumeRef.current = volume;
    const el = audioRef.current;
    if (el) el.volume = volume;
  }, [volume]);

  useEffect(() => {
    speedRef.current = speed;
    const el = audioRef.current;
    if (el && isRealOnDemand(currentRef.current)) el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    mutedRef.current = muted;
    const el = audioRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  /* Network loss and recovery ------------------------------------------- */
  useEffect(() => {
    const goOffline = () => {
      if (!isRealLive(currentRef.current)) return;
      const live = statusRef.current;
      if (live !== "playing" && live !== "buffering" && live !== "loading") return;
      setErrorMessage(describePlaybackError("network_unreachable").message);
      setStatus("reconnecting");
    };
    const goOnline = () => {
      const item = currentRef.current;
      if (!isRealLive(item)) return;
      if (statusRef.current !== "reconnecting" && statusRef.current !== "error") return;
      attemptRef.current = 0;
      openRef.current(item, { retry: true });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [setStatus]);

  /* Tab visibility: audio keeps playing in a background tab (real browser
   * behaviour, not a claimed lock-screen feature). When the tab comes back we
   * resynchronise the UI with the element rather than trusting old state. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const el = audioRef.current;
      if (!el || !isRealLive(currentRef.current)) return;
      if (el.error) return;
      if (!el.paused && statusRef.current !== "playing") setStatus("playing");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [setStatus]);

  /** Resumes where the listener stopped, if that is a meaningful place to resume. */
  const resumePositionFor = useCallback((item: Playable): number => {
    if (item.kind === "live" || !item.durationSeconds) return 0;
    const saved = libraryRef.current.progressFor(item.key);
    if (!saved) return 0;
    const nearEnd = item.durationSeconds - saved.positionSeconds < 8;
    return saved.positionSeconds > 20 && !nearEnd ? saved.positionSeconds : 0;
  }, []);

  const start = useCallback(
    (item: Playable, options?: { context?: Playable[]; at?: number }) => {
      clearTuneTimer();
      // One stream at a time: always tear the previous one down first.
      releaseAudio();
      attemptRef.current = 0;
      currentRef.current = item;
      setCurrent(item);
      setErrorMessage(null);
      setPositionSeconds(options?.at ?? resumePositionFor(item));
      setContext(
        options?.context
          ? { items: options.context, index: Math.max(0, options.context.findIndex((entry) => entry.key === item.key)) }
          : null,
      );
      lastSaved.current = 0;
      libraryRef.current.recordPlay(toSavedRef(item));

      if (isRealLive(item)) {
        const probe = probeFormat(item);
        setLiveConnection({
          real: true,
          attempt: 0,
          maxAttempts: MAX_LIVE_ATTEMPTS,
          browserCanPlay: probe.supported,
          formatNote: probe.note,
        });
        if (!probe.supported) {
          setStatus("error");
          setErrorMessage(probe.note);
          return;
        }
        openStream(item);
        return;
      }

      if (isRealOnDemand(item)) {
        setLiveConnection({ real: true, attempt: 0, maxAttempts: MAX_LIVE_ATTEMPTS, browserCanPlay: true, formatNote: null });
        const at = options?.at ?? resumePositionFor(item);
        pendingSeekRef.current = at > 0 ? at : null;
        lastServerReport.current = 0;
        openStream(item);
        return;
      }

      setLiveConnection({
        real: false,
        attempt: 0,
        maxAttempts: MAX_LIVE_ATTEMPTS,
        browserCanPlay: true,
        formatNote: null,
      });
      setStatus("loading");
      tuneTimer.current = setTimeout(() => setStatus("playing"), TUNE_IN_MS);
    },
    [clearTuneTimer, openStream, releaseAudio, resumePositionFor, setStatus],
  );

  const pause = useCallback(() => {
    const item = currentRef.current;
    if (isRealAudio(item)) {
      clearRetryTimer();
      audioRef.current?.pause();
    }
    setStatus("paused");
  }, [clearRetryTimer, setStatus]);

  const retry = useCallback(() => {
    const item = currentRef.current;
    if (!item) return;
    if (isRealLive(item)) {
      attemptRef.current = 0;
      setLiveConnection((previous) => ({ ...previous, attempt: 0 }));
      openStream(item, { retry: true });
      return;
    }
    if (isRealOnDemand(item)) {
      pendingSeekRef.current = audioRef.current?.currentTime || null;
      openStream(item, { retry: true });
      return;
    }
    clearTuneTimer();
    setErrorMessage(null);
    setStatus("loading");
    tuneTimer.current = setTimeout(() => setStatus("playing"), TUNE_IN_MS);
  }, [clearTuneTimer, openStream, setStatus]);

  const toggle = useCallback(() => {
    const item = currentRef.current;
    if (!item) return;
    const live = statusRef.current;

    if (isRealLive(item)) {
      if (live === "playing" || live === "buffering") {
        pause();
        return;
      }
      if (live === "paused" || live === "reconnecting" || live === "error") {
        // Resuming a live stream rejoins the live edge; there is nothing to "un-pause".
        retry();
      }
      return;
    }

    if (isRealOnDemand(item)) {
      if (live === "playing" || live === "buffering") {
        pause();
        return;
      }
      if (live === "error") {
        retry();
        return;
      }
      const el = audioRef.current;
      if (!el) return;
      if (!el.src) {
        retry();
        return;
      }
      setStatus("loading");
      el.play().catch((error: DOMException) => {
        if (error?.name === "NotAllowedError") {
          setStatus("paused");
          setErrorMessage("Your browser blocked playback. Press play again.");
        }
      });
      return;
    }

    if (live === "playing") setStatus("paused");
    else if (live === "paused" || live === "error") setStatus("playing");
  }, [pause, retry, setStatus]);

  const play = useCallback(
    (item: Playable, options?: { context?: Playable[] }) => {
      if (current && current.key === item.key) {
        toggle();
        return;
      }
      start(item, options);
    },
    [current, start, toggle],
  );

  const seek = useCallback(
    (seconds: number) => {
      if (!current || current.kind === "live") return;
      const el = audioRef.current;
      const duration = current.durationSeconds ?? (el && Number.isFinite(el.duration) ? el.duration : 0);
      const target = Math.min(Math.max(0, seconds), duration);
      if (isRealOnDemand(current) && el) {
        if (Number.isFinite(el.duration)) el.currentTime = target;
        else pendingSeekRef.current = target;
      }
      setPositionSeconds(target);
      lastSaved.current = 0;
    },
    [current],
  );

  const skipBy = useCallback(
    (delta: number) => {
      if (!current || current.kind === "live") return;
      seek(positionSeconds + delta);
    },
    [current, positionSeconds, seek],
  );

  const next = useCallback(() => {
    if (queue.length > 0) {
      const [head, ...rest] = queue;
      setQueue(rest);
      if (head) start(head, { context: context?.items });
      return;
    }
    if (context && context.index + 1 < context.items.length) {
      const upcoming = context.items[context.index + 1];
      if (upcoming) start(upcoming, { context: context.items });
    }
  }, [context, queue, start]);

  const previous = useCallback(() => {
    if (positionSeconds > 3) {
      seek(0);
      return;
    }
    if (context && context.index > 0) {
      const earlier = context.items[context.index - 1];
      if (earlier) start(earlier, { context: context.items });
      return;
    }
    seek(0);
  }, [context, positionSeconds, seek, start]);

  const setSpeed = useCallback((value: number) => {
    if (SPEEDS.includes(value as (typeof SPEEDS)[number])) setSpeedState(value);
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(Math.min(1, Math.max(0, value)));
    if (value > 0) setMuted(false);
  }, []);

  const addToQueue = useCallback((item: Playable) => {
    setQueue((existing) => (existing.some((entry) => entry.key === item.key) ? existing : [...existing, item]));
  }, []);

  const playNext = useCallback((item: Playable) => {
    setQueue((existing) => [item, ...existing.filter((entry) => entry.key !== item.key)]);
  }, []);

  const removeFromQueue = useCallback((key: string) => {
    setQueue((existing) => existing.filter((entry) => entry.key !== key));
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  /* Playback clock ------------------------------------------------------- */
  useEffect(() => {
    if (status !== "playing" || !current) return;
    // Real on-demand audio reports its own position through timeupdate.
    if (isRealOnDemand(current)) return;
    if (current.kind === "live") {
      // Elapsed listening time. Live radio is not seekable, so this is never
      // presented as a position within a programme.
      const id = setInterval(() => setPositionSeconds((value) => value + 0.5), 500);
      return () => clearInterval(id);
    }
    const id = setInterval(() => {
      setPositionSeconds((value) => {
        const nextValue = value + 0.5 * speed;
        const duration = current.durationSeconds ?? 0;
        return duration > 0 ? Math.min(nextValue, duration) : nextValue;
      });
    }, 500);
    return () => clearInterval(id);
  }, [status, current, speed]);

  /* Completion ----------------------------------------------------------- */
  endedRef.current = () => {
    const item = currentRef.current;
    if (!item) return;
    setStatus("paused");
    if (item.durationSeconds) libraryRef.current.saveProgress(toSavedRef(item), item.durationSeconds, item.durationSeconds);
    if (queue.length > 0 || (context && context.index + 1 < context.items.length)) next();
  };

  useEffect(() => {
    if (!current || current.kind === "live" || !current.durationSeconds) return;
    if (isRealOnDemand(current)) return;
    if (status !== "playing") return;
    if (positionSeconds < current.durationSeconds) return;
    setStatus("paused");
    libraryRef.current.saveProgress(toSavedRef(current), current.durationSeconds, current.durationSeconds);
    if (queue.length > 0 || (context && context.index + 1 < context.items.length)) {
      next();
    }
  }, [positionSeconds, current, status, queue.length, context, next, setStatus]);

  /* Progress checkpointing ----------------------------------------------- */
  useEffect(() => {
    if (!current || current.kind === "live" || !current.durationSeconds) return;
    if (Math.abs(positionSeconds - lastSaved.current) < 5) return;
    lastSaved.current = positionSeconds;
    libraryRef.current.saveProgress(toSavedRef(current), positionSeconds, current.durationSeconds);
    // Signed-in listening history on the server, at most every 15 seconds.
    if (current.progressUrl && Math.abs(positionSeconds - lastServerReport.current) >= 15) {
      lastServerReport.current = positionSeconds;
      void fetch(current.progressUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionSeconds }) }).catch(() => undefined);
    }
  }, [positionSeconds, current]);

  useEffect(
    () => () => {
      clearTuneTimer();
      clearRetryTimer();
    },
    [clearTuneTimer, clearRetryTimer],
  );

  const api = useMemo<PlayerApi>(
    () => ({
      current,
      status,
      positionSeconds,
      speed,
      volume,
      muted,
      queue,
      expanded,
      errorMessage,
      liveConnection,
      hasNext: queue.length > 0 || Boolean(context && context.index + 1 < context.items.length),
      hasPrevious: Boolean(context && context.index > 0) || positionSeconds > 3,
      play,
      toggle,
      pause,
      seek,
      skipBy,
      next,
      previous,
      setSpeed,
      setVolume,
      toggleMute: () => setMuted((value) => !value),
      addToQueue,
      playNext,
      removeFromQueue,
      clearQueue,
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
      isCurrent: (key) => current?.key === key && status !== "idle",
      retry,
    }),
    [
      current,
      status,
      positionSeconds,
      speed,
      volume,
      muted,
      queue,
      expanded,
      errorMessage,
      liveConnection,
      context,
      play,
      toggle,
      pause,
      seek,
      skipBy,
      next,
      previous,
      setSpeed,
      setVolume,
      addToQueue,
      playNext,
      removeFromQueue,
      clearQueue,
      retry,
    ],
  );

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside PlayerProvider");
  return context;
}

export const PLAYBACK_SPEEDS = SPEEDS;
