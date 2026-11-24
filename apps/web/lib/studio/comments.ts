"use client";

/**
 * Local comment moderation for video drafts.
 *
 * Comments are seeded, stored under a versioned localStorage key and never sent
 * anywhere. The shape mirrors what a `comments` table will return once the
 * database findings from the audit are resolved, so this hook can be replaced
 * by a real repository without touching the screens that use it.
 */

import { useCallback, useEffect, useState } from "react";

export type StudioCommentStatus = "visible" | "hidden" | "removed";

export type StudioComment = {
  readonly id: string;
  readonly videoId: string;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
  readonly status: StudioCommentStatus;
};

const STORAGE_KEY = "kito.studio.comments.v1";

const SEED: readonly StudioComment[] = [
  {
    id: "cmt-1",
    videoId: "vid-market-film",
    author: "Brenda K.",
    body: "The sound at the market was so clear — did you record it separately?",
    createdAt: "2026-11-18T09:24:00.000Z",
    status: "visible",
  },
  {
    id: "cmt-2",
    videoId: "vid-market-film",
    author: "anonymous",
    body: "Subscribe to my channel for free data bundles http://not-a-real-link.example",
    createdAt: "2026-11-18T11:02:00.000Z",
    status: "hidden",
  },
  {
    id: "cmt-3",
    videoId: "vid-market-film",
    author: "Okello M.",
    body: "Please do the northern route next, the Gulu road segment would be great.",
    createdAt: "2026-11-19T06:41:00.000Z",
    status: "visible",
  },
  {
    id: "cmt-4",
    videoId: "vid-studio-tour",
    author: "Sarah N.",
    body: "The boda boda interview is exactly what I wanted to see.",
    createdAt: "2026-11-20T14:10:00.000Z",
    status: "visible",
  },
];

type Stored = { version: 1; comments: StudioComment[] };

function read(): StudioComment[] {
  if (typeof window === "undefined") return [...SEED];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...SEED];
    const parsed = JSON.parse(raw) as Stored;
    if (parsed?.version !== 1 || !Array.isArray(parsed.comments)) return [...SEED];
    return parsed.comments;
  } catch {
    return [...SEED];
  }
}

function write(comments: StudioComment[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, comments } satisfies Stored));
  } catch {
    /* storage full or blocked — the UI keeps its in-memory value */
  }
}

/** Used by the workspace "reset demo data" action. */
export function resetVideoComments(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function useVideoComments(videoId: string) {
  const [all, setAll] = useState<StudioComment[]>(() => read());

  useEffect(() => {
    setAll(read());
  }, []);

  const commit = useCallback((next: StudioComment[]) => {
    setAll(next);
    write(next);
  }, []);

  const setStatus = useCallback(
    (commentId: string, status: StudioCommentStatus) => {
      commit(all.map((comment) => (comment.id === commentId ? { ...comment, status } : comment)));
    },
    [all, commit],
  );

  const comments = all.filter((comment) => comment.videoId === videoId);

  return {
    comments,
    visible: comments.filter((comment) => comment.status === "visible").length,
    hidden: comments.filter((comment) => comment.status === "hidden").length,
    hide: (id: string) => setStatus(id, "hidden"),
    restore: (id: string) => setStatus(id, "visible"),
    remove: (id: string) => setStatus(id, "removed"),
  };
}
