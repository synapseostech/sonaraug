"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/** A listener-owned item that is rendered directly from storage (no join needed). */
export type SavedRef = {
  key: string;
  kind: "live" | "episode" | "video";
  title: string;
  subtitle: string;
  seed: string;
  href: string;
  at: number;
};

export type ProgressEntry = SavedRef & {
  positionSeconds: number;
  durationSeconds: number;
};

type PersistedLibrary = {
  version: 1;
  favouriteStations: string[];
  followedPodcasts: string[];
  savedEpisodes: string[];
  watchLater: string[];
  history: SavedRef[];
  progress: Record<string, ProgressEntry>;
};

const STORAGE_KEY = "kito.library.v1";

const EMPTY: PersistedLibrary = {
  version: 1,
  favouriteStations: [],
  followedPodcasts: [],
  savedEpisodes: [],
  watchLater: [],
  history: [],
  progress: {},
};

type LibraryApi = {
  hydrated: boolean;
  favouriteStations: string[];
  followedPodcasts: string[];
  savedEpisodes: string[];
  watchLater: string[];
  history: SavedRef[];
  continueListening: ProgressEntry[];
  isFavouriteStation: (slug: string) => boolean;
  isFollowingPodcast: (slug: string) => boolean;
  isEpisodeSaved: (id: string) => boolean;
  isWatchLater: (id: string) => boolean;
  toggleFavouriteStation: (slug: string) => void;
  toggleFollowPodcast: (slug: string) => void;
  toggleSavedEpisode: (id: string) => void;
  toggleWatchLater: (id: string) => void;
  recordPlay: (item: SavedRef) => void;
  saveProgress: (item: SavedRef, positionSeconds: number, durationSeconds: number) => void;
  progressFor: (key: string) => ProgressEntry | undefined;
  clearHistory: () => void;
  resetLibrary: () => void;
};

const LibraryContext = createContext<LibraryApi | null>(null);

function load(): PersistedLibrary {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PersistedLibrary>;
    if (parsed.version !== 1) return EMPTY;
    return {
      version: 1,
      favouriteStations: parsed.favouriteStations ?? [],
      followedPodcasts: parsed.followedPodcasts ?? [],
      savedEpisodes: parsed.savedEpisodes ?? [],
      watchLater: parsed.watchLater ?? [],
      history: parsed.history ?? [],
      progress: parsed.progress ?? {},
    };
  } catch {
    return EMPTY;
  }
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [value, ...list];
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedLibrary>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  // Debounced persistence: playback progress changes several times a second and
  // must not turn into synchronous storage writes on the main thread.
  useEffect(() => {
    if (!hydrated) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage can be full or blocked (private mode); the app keeps working in memory.
      }
    }, 400);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [state, hydrated]);

  const api = useMemo<LibraryApi>(() => {
    const isIn = (list: string[], value: string) => list.includes(value);
    return {
      hydrated,
      favouriteStations: state.favouriteStations,
      followedPodcasts: state.followedPodcasts,
      savedEpisodes: state.savedEpisodes,
      watchLater: state.watchLater,
      history: state.history,
      continueListening: Object.values(state.progress)
        .filter((entry) => entry.positionSeconds > 20 && entry.durationSeconds - entry.positionSeconds > 4)
        .sort((a, b) => b.at - a.at),
      isFavouriteStation: (slug) => isIn(state.favouriteStations, slug),
      isFollowingPodcast: (slug) => isIn(state.followedPodcasts, slug),
      isEpisodeSaved: (id) => isIn(state.savedEpisodes, id),
      isWatchLater: (id) => isIn(state.watchLater, id),
      toggleFavouriteStation: (slug) =>
        setState((current) => ({ ...current, favouriteStations: toggle(current.favouriteStations, slug) })),
      toggleFollowPodcast: (slug) =>
        setState((current) => ({ ...current, followedPodcasts: toggle(current.followedPodcasts, slug) })),
      toggleSavedEpisode: (id) =>
        setState((current) => ({ ...current, savedEpisodes: toggle(current.savedEpisodes, id) })),
      toggleWatchLater: (id) =>
        setState((current) => ({ ...current, watchLater: toggle(current.watchLater, id) })),
      recordPlay: (item) =>
        setState((current) => ({
          ...current,
          history: [item, ...current.history.filter((entry) => entry.key !== item.key)].slice(0, 40),
        })),
      saveProgress: (item, positionSeconds, durationSeconds) => {
        if (durationSeconds <= 0) return;
        setState((current) => ({
          ...current,
          progress: {
            ...current.progress,
            [item.key]: { ...item, positionSeconds, durationSeconds },
          },
        }));
      },
      progressFor: (key) => state.progress[key],
      clearHistory: () => setState((current) => ({ ...current, history: [], progress: {} })),
      resetLibrary: () => setState(EMPTY),
    };
  }, [state, hydrated]);

  return <LibraryContext.Provider value={api}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryApi {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used inside LibraryProvider");
  return context;
}

export const useIsFavouriteStation = (slug: string): boolean => useLibrary().isFavouriteStation(slug);
