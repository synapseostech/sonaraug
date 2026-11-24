"use client";

/**
 * Studio repository + store.
 *
 * The interface below is the seam that a Supabase-backed implementation will
 * replace. Everything is local, persisted to `localStorage`, and guarded by the
 * pure permission rules in `@kito/studio` — so the same UI cannot accidentally
 * let a creator approve their own work once a real backend arrives.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  applyStreamCheck,
  broadcasterMayEdit,
  creatorMayTransition,
  mayApprove,
  replaceEndpointUrl,
  submissionTransitionActorRole,
} from "@kito/studio";
import type {
  ActorRole,
  AuditEntry,
  BroadcastSession,
  Channel,
  ContentReport,
  Episode,
  IntegrationPermission,
  MediaAsset,
  ModerationRecord,
  ProgrammeSlot,
  PublicationStatus,
  ReviewStatus,
  Show,
  StationSubmission,
  StationSubmissionStatus,
  StreamCheckInput,
  StreamEndpointDraft,
  VideoItem,
} from "@kito/studio";
import { STUDIO_SEED } from "./seed.ts";
import { resetVideoComments } from "./comments.ts";

const STORAGE_KEY = "kito.studio.v1";

export type StudioActor = {
  name: string;
  role: ActorRole;
  channelId: string;
  /** Shown in the UI so nobody mistakes simulated permissions for real ones. */
  simulated: true;
};

export type StudioState = {
  version: 1;
  actor: StudioActor;
  channels: Channel[];
  shows: Show[];
  episodes: Episode[];
  videos: VideoItem[];
  submissions: StationSubmission[];
  media: MediaAsset[];
  reports: ContentReport[];
  moderation: ModerationRecord[];
  programmes: ProgrammeSlot[];
  sessions: BroadcastSession[];
};

type Result = { ok: true } | { ok: false; reason: string };

function uid(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function audit(action: string, actor: string, role: ActorRole, reason: string | null, from: string | null, to: string | null): AuditEntry {
  return { id: uid("audit"), at: nowIso(), actor, actorRole: role, action, reason, fromStatus: from, toStatus: to };
}

function initialState(): StudioState {
  return {
    version: 1,
    actor: { name: "Aisha Namutebi", role: "creator", channelId: "ch-namutebi", simulated: true },
    channels: [...STUDIO_SEED.channels],
    shows: [...STUDIO_SEED.shows],
    episodes: [...STUDIO_SEED.episodes],
    videos: [...STUDIO_SEED.videos],
    submissions: [...STUDIO_SEED.submissions],
    media: [...STUDIO_SEED.media],
    reports: [...STUDIO_SEED.reports],
    moderation: [...STUDIO_SEED.moderation],
    programmes: [...STUDIO_SEED.programmes],
    sessions: [...STUDIO_SEED.sessions],
  };
}

/* Runtime-only object URLs for local recordings. Never persisted — a blob URL
 * is meaningless after a reload, and pretending otherwise would be a lie. */
const objectUrls = new Map<string, string>();
export function registerObjectUrl(id: string, url: string): void {
  objectUrls.set(id, url);
}
export function objectUrlFor(id: string): string | null {
  return objectUrls.get(id) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Repository interface                                                       */
/* -------------------------------------------------------------------------- */

export type StudioApi = {
  state: StudioState;
  actor: StudioActor;
  setRole: (role: ActorRole, name?: string) => void;
  channel: Channel | undefined;
  showFor: (showId: string) => Show | undefined;
  episodesFor: (showId: string) => Episode[];
  updateChannel: (patch: Partial<Channel>) => void;

  createShow: (input: { title: string; description: string; categories: string[]; languages: string[]; hosts: string[] }) => Show;
  updateShow: (id: string, patch: Partial<Show>) => void;
  submitShowForReview: (id: string) => Result;

  createEpisode: (showId: string, input?: { title?: string; seasonNumber?: number }) => Episode;
  updateEpisode: (id: string, patch: Partial<Episode>) => void;
  attachMediaToEpisode: (episodeId: string, asset: Omit<MediaAsset, "id" | "createdAt" | "localOnly">) => MediaAsset;
  transitionEpisode: (id: string, to: PublicationStatus) => Result;
  submitEpisodeForReview: (id: string) => Result;

  createVideo: (input: { title: string; description?: string; category?: string }) => VideoItem;
  updateVideo: (id: string, patch: Partial<VideoItem>) => void;
  attachVideoFile: (id: string, file: { name: string; sizeBytes: number; durationSeconds: number | null }) => void;
  transitionVideo: (id: string, to: PublicationStatus) => Result;
  submitVideoForReview: (id: string) => Result;

  addMediaAsset: (asset: Omit<MediaAsset, "id" | "createdAt" | "localOnly">) => MediaAsset;

  createSubmission: (input: Partial<StationSubmission> & { name: string }) => StationSubmission;
  updateSubmission: (id: string, patch: Partial<StationSubmission>) => Result;
  submitSubmission: (id: string) => Result;
  addStream: (submissionId: string, input: { label: string; url: string; role: "primary" | "backup"; format: StreamEndpointDraft["format"] }) => Result;
  replaceStreamUrl: (submissionId: string, endpointId: string, url: string) => Result;
  testStream: (submissionId: string, endpointId: string) => Promise<{ ok: boolean; detail: string }>;

  reviewSubmission: (
    id: string,
    action: "start_review" | "approve" | "reject" | "request_changes" | "suspend" | "reinstate",
    reason: string,
  ) => Result;
  setIntegrationPermission: (id: string, permission: IntegrationPermission) => Result;

  reviewShow: (id: string, verdict: "approve" | "reject" | "changes_requested", note: string) => Result;
  reviewEpisode: (id: string, verdict: "approve" | "reject" | "changes_requested", note: string) => Result;
  reviewVideo: (id: string, verdict: "approve" | "reject" | "changes_requested", note: string) => Result;
  resolveReport: (id: string, status: "actioned" | "dismissed", reason: string) => void;

  updateSession: (id: string, patch: Partial<BroadcastSession>) => void;
  startBroadcast: (id: string) => Result;
  stopBroadcast: (id: string) => void;
  addProgramme: (input: Omit<ProgrammeSlot, "id">) => void;

  resetStudio: () => void;
};

const StudioContext = createContext<StudioApi | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudioState>(initialState);
  const hydrated = useRef(false);

  /* Load once, then persist (debounced) ---------------------------------- */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StudioState;
        if (parsed.version === 1) setState({ ...parsed, actor: { ...parsed.actor, simulated: true } });
      }
    } catch {
      // A corrupt local store must never break the studio.
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const write = () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Quota exceeded (long recordings): state stays in memory.
      }
    };
    const timer = setTimeout(write, 350);
    // Flush synchronously on unmount so navigating between the studio and the
    // admin console never loses the action that was just taken.
    return () => {
      clearTimeout(timer);
      write();
    };
  }, [state]);

  /**
   * A soft route change unmounts the provider and flushes, but a hard reload or
   * a new tab does not. Write the latest state when the page is being hidden so
   * a decision taken a moment before navigating is never lost.
   */
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current));
      } catch {
        // Quota exceeded: the in-memory state is still authoritative for this tab.
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  const patchState = useCallback((updater: (previous: StudioState) => StudioState) => setState(updater), []);

  const addModeration = useCallback((records: ModerationRecord[], record: Omit<ModerationRecord, "id" | "at">): ModerationRecord[] => {
    return [{ id: uid("mod"), at: nowIso(), ...record }, ...records];
  }, []);

  /* Channel + shows ------------------------------------------------------ */
  const updateChannel = useCallback(
    (patch: Partial<Channel>) => {
      patchState((previous) => ({
        ...previous,
        channels: previous.channels.map((channel) => (channel.id === previous.actor.channelId ? { ...channel, ...patch } : channel)),
      }));
    },
    [patchState],
  );

  const createShow = useCallback<StudioApi["createShow"]>(
    (input) => {
      const id = uid("show");
      const show: Show = {
        id,
        channelId: state.actor.channelId,
        title: input.title,
        slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        description: input.description,
        categories: input.categories,
        languages: input.languages,
        hosts: input.hosts.filter(Boolean).map((name) => ({ id: uid("host"), name, role: "Host" })),
        artworkSeed: id,
        artworkDataUrl: null,
        explicit: false,
        createdAt: nowIso(),
        reviewStatus: "not_submitted",
        rights: "original",
      };
      patchState((previous) => ({ ...previous, shows: [...previous.shows, show] }));
      return show;
    },
    [patchState, state.actor.channelId],
  );

  const updateShow = useCallback<StudioApi["updateShow"]>(
    (id, patch) => {
      patchState((previous) => ({
        ...previous,
        shows: previous.shows.map((show) => (show.id === id ? { ...show, ...patch } : show)),
      }));
    },
    [patchState],
  );

  const submitShowForReview = useCallback<StudioApi["submitShowForReview"]>(
    (id) => {
      const show = state.shows.find((entry) => entry.id === id);
      if (!show) return { ok: false, reason: "Show not found." };
      if (show.description.trim().length < 20) return { ok: false, reason: "Add a description of at least 20 characters before submitting." };
      if (show.categories.length === 0) return { ok: false, reason: "Select at least one category." };
      updateShow(id, { reviewStatus: "pending" });
      return { ok: true };
    },
    [state.shows, updateShow],
  );

  /* Episodes ------------------------------------------------------------- */
  const createEpisode = useCallback<StudioApi["createEpisode"]>(
    (showId, input) => {
      const siblings = state.episodes.filter((episode) => episode.showId === showId);
      const nextNumber = siblings.reduce((max, episode) => Math.max(max, episode.number), 0) + 1;
      const id = uid("ep");
      const episode: Episode = {
        id,
        showId,
        seasonNumber: input?.seasonNumber ?? 1,
        number: nextNumber,
        title: input?.title ?? `Episode ${nextNumber}`,
        description: "",
        audioSource: "none",
        mediaAssetId: null,
        durationSeconds: null,
        explicit: false,
        rights: "undisclosed",
        publicationStatus: "draft",
        reviewStatus: "not_submitted",
        scheduledFor: null,
        publishedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        reviewNote: null,
        history: [],
      };
      patchState((previous) => ({ ...previous, episodes: [...previous.episodes, episode] }));
      return episode;
    },
    [patchState, state.episodes],
  );

  const updateEpisode = useCallback<StudioApi["updateEpisode"]>(
    (id, patch) => {
      patchState((previous) => ({
        ...previous,
        episodes: previous.episodes.map((episode) =>
          episode.id === id ? { ...episode, ...patch, updatedAt: nowIso() } : episode,
        ),
      }));
    },
    [patchState],
  );

  const addMediaAsset = useCallback<StudioApi["addMediaAsset"]>(
    (asset) => {
      const created: MediaAsset = { ...asset, id: uid("asset"), createdAt: nowIso(), localOnly: true };
      patchState((previous) => ({ ...previous, media: [created, ...previous.media] }));
      return created;
    },
    [patchState],
  );

  const attachMediaToEpisode = useCallback<StudioApi["attachMediaToEpisode"]>(
    (episodeId, asset) => {
      const created = addMediaAsset(asset);
      patchState((previous) => ({
        ...previous,
        episodes: previous.episodes.map((episode) =>
          episode.id === episodeId
            ? {
                ...episode,
                mediaAssetId: created.id,
                audioSource: asset.kind === "recording" ? "recording" : "upload",
                durationSeconds: asset.durationSeconds,
                publicationStatus: episode.publicationStatus === "draft" ? "editing" : episode.publicationStatus,
                updatedAt: nowIso(),
              }
            : episode,
        ),
      }));
      return created;
    },
    [addMediaAsset, patchState],
  );

  const transitionEpisode = useCallback<StudioApi["transitionEpisode"]>(
    (id, to) => {
      const episode = state.episodes.find((entry) => entry.id === id);
      if (!episode) return { ok: false, reason: "Episode not found." };
      if (!creatorMayTransition(state.actor.role, episode.publicationStatus, to)) {
        return { ok: false, reason: `A ${state.actor.role} cannot move this episode from ${episode.publicationStatus} to ${to}.` };
      }
      if (to === "review" && episode.audioSource === "none") {
        return { ok: false, reason: "Record or attach audio before sending the episode to review." };
      }
      if ((to === "published" || to === "scheduled") && episode.reviewStatus !== "approved") {
        return { ok: false, reason: "A reviewer must approve the episode before it can be scheduled or published." };
      }
      const historyEntry = audit(`move ${episode.publicationStatus} → ${to}`, state.actor.name, state.actor.role, null, episode.publicationStatus, to);
      updateEpisode(id, {
        publicationStatus: to,
        publishedAt: to === "published" ? nowIso() : episode.publishedAt,
        reviewStatus: to === "review" ? "pending" : episode.reviewStatus,
        history: [historyEntry, ...episode.history],
      });
      return { ok: true };
    },
    [state.actor.name, state.actor.role, state.episodes, updateEpisode],
  );

  const submitEpisodeForReview = useCallback<StudioApi["submitEpisodeForReview"]>(
    (id) => transitionEpisode(id, "review"),
    [transitionEpisode],
  );

  /* Videos --------------------------------------------------------------- */
  const createVideo = useCallback<StudioApi["createVideo"]>(
    (input) => {
      const id = uid("vid");
      const video: VideoItem = {
        id,
        channelId: state.actor.channelId,
        title: input.title,
        description: input.description ?? "",
        category: input.category ?? "Documentary",
        tags: [],
        visibility: "private",
        thumbnail: "auto",
        fileName: null,
        fileSizeBytes: null,
        durationSeconds: null,
        rights: "undisclosed",
        publicationStatus: "draft",
        reviewStatus: "not_submitted",
        publishedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        reviewNote: null,
        history: [],
      };
      patchState((previous) => ({ ...previous, videos: [video, ...previous.videos] }));
      return video;
    },
    [patchState, state.actor.channelId],
  );

  const updateVideo = useCallback<StudioApi["updateVideo"]>(
    (id, patch) => {
      patchState((previous) => ({
        ...previous,
        videos: previous.videos.map((video) => (video.id === id ? { ...video, ...patch, updatedAt: nowIso() } : video)),
      }));
    },
    [patchState],
  );

  const attachVideoFile = useCallback<StudioApi["attachVideoFile"]>(
    (id, file) => {
      updateVideo(id, {
        fileName: file.name,
        fileSizeBytes: file.sizeBytes,
        durationSeconds: file.durationSeconds,
        publicationStatus: "editing",
      });
    },
    [updateVideo],
  );

  const transitionVideo = useCallback<StudioApi["transitionVideo"]>(
    (id, to) => {
      const video = state.videos.find((entry) => entry.id === id);
      if (!video) return { ok: false, reason: "Video not found." };
      if (!creatorMayTransition(state.actor.role, video.publicationStatus, to)) {
        return { ok: false, reason: `A ${state.actor.role} cannot move this video from ${video.publicationStatus} to ${to}.` };
      }
      if (to === "review" && !video.fileName) return { ok: false, reason: "Select a local video file before submitting for review." };
      if ((to === "published" || to === "scheduled") && video.reviewStatus !== "approved") {
        return { ok: false, reason: "A reviewer must approve the video before it can be scheduled or published." };
      }
      updateVideo(id, {
        publicationStatus: to,
        publishedAt: to === "published" ? nowIso() : video.publishedAt,
        reviewStatus: to === "review" ? "pending" : video.reviewStatus,
        history: [audit(`move ${video.publicationStatus} → ${to}`, state.actor.name, state.actor.role, null, video.publicationStatus, to), ...video.history],
      });
      return { ok: true };
    },
    [state.actor.name, state.actor.role, state.videos, updateVideo],
  );

  const submitVideoForReview = useCallback<StudioApi["submitVideoForReview"]>(
    (id) => transitionVideo(id, "review"),
    [transitionVideo],
  );

  /* Broadcast submissions ------------------------------------------------- */
  const createSubmission = useCallback<StudioApi["createSubmission"]>(
    (input) => {
      const id = input.id ?? uid("sub");
      const created: StationSubmission = {
        id,
        name: input.name,
        frequency: input.frequency ?? null,
        country: input.country ?? "UG",
        region: input.region ?? "Central",
        city: input.city ?? "Kampala",
        languages: input.languages ?? ["English"],
        genres: input.genres ?? ["Talk"],
        description: input.description ?? "",
        website: input.website ?? null,
        logoSeed: id,
        logoDataUrl: input.logoDataUrl ?? null,
        status: "draft",
        operatingStatus: "unknown",
        integrationPermission: "not_requested",
        streams: [],
        evidence: {
          ownershipStatement: "",
          broadcastingLicence: "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          documents: [],
        },
        submittedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        changeRequest: null,
        decisions: [],
        isDemo: true,
      };
      patchState((previous) => ({ ...previous, submissions: [created, ...previous.submissions] }));
      return created;
    },
    [patchState],
  );

  const updateSubmission = useCallback<StudioApi["updateSubmission"]>(
    (id, patch) => {
      const submission = state.submissions.find((entry) => entry.id === id);
      if (!submission) return { ok: false, reason: "Submission not found." };
      if (!broadcasterMayEdit(submission.status) && state.actor.role === "broadcaster") {
        return { ok: false, reason: `A station cannot be edited while it is ${submission.status.replace(/_/g, " ")}.` };
      }
      patchState((previous) => ({
        ...previous,
        submissions: previous.submissions.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: nowIso() } : entry)),
      }));
      return { ok: true };
    },
    [patchState, state.actor.role, state.submissions],
  );

  const submitSubmission = useCallback<StudioApi["submitSubmission"]>(
    (id) => {
      const submission = state.submissions.find((entry) => entry.id === id);
      if (!submission) return { ok: false, reason: "Submission not found." };
      if (!submissionTransitionActorRole(submission.status, "submitted", "broadcaster")) {
        return { ok: false, reason: `This submission is ${submission.status.replace(/_/g, " ")} and cannot be submitted again.` };
      }
      if (submission.streams.length === 0) return { ok: false, reason: "Add at least one stream endpoint before submitting." };
      if (!submission.evidence.ownershipStatement.trim()) return { ok: false, reason: "Add an ownership statement before submitting." };
      if (!submission.evidence.broadcastingLicence.trim()) return { ok: false, reason: "Add the broadcasting licence reference before submitting." };
      patchState((previous) => ({
        ...previous,
        submissions: previous.submissions.map((entry) =>
          entry.id === id ? { ...entry, status: "submitted", submittedAt: nowIso(), updatedAt: nowIso() } : entry,
        ),
      }));
      return { ok: true };
    },
    [patchState, state.submissions],
  );

  const addStream = useCallback<StudioApi["addStream"]>(
    (submissionId, input) => {
      const submission = state.submissions.find((entry) => entry.id === submissionId);
      if (!submission) return { ok: false, reason: "Submission not found." };
      if (!broadcasterMayEdit(submission.status) && state.actor.role === "broadcaster") {
        return { ok: false, reason: "Streams cannot be changed while the station is under review." };
      }
      if (!/^https?:\/\/[^\s]+$/i.test(input.url)) return { ok: false, reason: "Enter a full http(s) stream URL." };
      const created: StreamEndpointDraft = {
        id: uid("str"),
        label: input.label,
        url: input.url,
        role: input.role,
        format: input.format,
        bitrateKbps: null,
        health: "unverified",
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        verifiedByPlatform: false,
        history: [],
      };
      patchState((previous) => ({
        ...previous,
        submissions: previous.submissions.map((entry) =>
          entry.id === submissionId ? { ...entry, streams: [...entry.streams, created], updatedAt: nowIso() } : entry,
        ),
      }));
      return { ok: true };
    },
    [patchState, state.actor.role, state.submissions],
  );

  const replaceStreamUrl = useCallback<StudioApi["replaceStreamUrl"]>(
    (submissionId, endpointId, url) => {
      if (!/^https?:\/\/[^\s]+$/i.test(url)) return { ok: false, reason: "Enter a full http(s) stream URL." };
      patchState((previous) => ({
        ...previous,
        submissions: previous.submissions.map((entry) =>
          entry.id === submissionId
            ? {
                ...entry,
                streams: entry.streams.map((stream) => (stream.id === endpointId ? replaceEndpointUrl(stream, url) : stream)),
                updatedAt: nowIso(),
              }
            : entry,
        ),
      }));
      return { ok: true };
    },
    [patchState],
  );

  /**
   * Simulated platform monitor. The broadcaster may request a test, but the
   * verdict is produced by the platform role — never by the broadcaster's own
   * claim. No server-side checker exists in this phase, and the UI says so.
   */
  const testStream = useCallback<StudioApi["testStream"]>(
    async (submissionId, endpointId) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const submission = state.submissions.find((entry) => entry.id === submissionId);
      const stream = submission?.streams.find((entry) => entry.id === endpointId);
      if (!stream) return { ok: false, detail: "Endpoint not found." };

      const knownBad = /kidepo|bwindi|nile|lakeside/i.test(stream.url);
      const input: StreamCheckInput = knownBad
        ? { result: "failing", detail: "Simulated monitor: connection returned an HTML page, not audio.", decodedBytes: 0, sustainedSeconds: 0 }
        : { result: "healthy", detail: "Simulated monitor: 200 audio/mpeg, decoded 198 kB over 12s.", decodedBytes: 198_400, sustainedSeconds: 12 };

      const outcome = applyStreamCheck(stream, "platform_monitor", input, nowIso());
      if (!outcome.ok) return { ok: false, detail: outcome.reason };

      patchState((previous) => ({
        ...previous,
        submissions: previous.submissions.map((entry) =>
          entry.id === submissionId
            ? {
                ...entry,
                streams: entry.streams.map((item) => (item.id === endpointId ? outcome.endpoint : item)),
                updatedAt: nowIso(),
              }
            : entry,
        ),
      }));
      return { ok: input.result === "healthy", detail: input.detail };
    },
    [patchState, state.submissions],
  );

  /* Admin: station review ------------------------------------------------- */
  const reviewSubmission = useCallback<StudioApi["reviewSubmission"]>(
    (id, action, reason) => {
      const submission = state.submissions.find((entry) => entry.id === id);
      if (!submission) return { ok: false, reason: "Submission not found." };
      if (!mayApprove(state.actor.role)) return { ok: false, reason: "Only a reviewer or administrator can record a listing decision." };
      if (reason.trim().length < 8) return { ok: false, reason: "Record a reason of at least 8 characters — decisions are auditable." };

      const map: Record<typeof action, StationSubmissionStatus> = {
        start_review: "under_review",
        approve: "approved",
        reject: "rejected",
        request_changes: "changes_requested",
        suspend: "suspended",
        reinstate: "approved",
      };
      const to = map[action];
      if (!submissionTransitionActorRole(submission.status, to, state.actor.role)) {
        return { ok: false, reason: `Cannot move a ${submission.status.replace(/_/g, " ")} submission to ${to.replace(/_/g, " ")}.` };
      }
      if (action === "approve" && !submission.streams.some((stream) => stream.health === "healthy")) {
        return { ok: false, reason: "Approve only after at least one stream has passed a platform check." };
      }

      const decision = audit(action, state.actor.name, state.actor.role, reason, submission.status, to);
      patchState((previous) => ({
        ...previous,
        submissions: previous.submissions.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: to,
                operatingStatus: to === "approved" ? "on_air" : to === "suspended" ? "suspended" : entry.operatingStatus,
                changeRequest: action === "request_changes" ? reason : entry.changeRequest,
                integrationPermission: action === "approve" ? (entry.integrationPermission === "not_requested" ? "pending" : entry.integrationPermission) : entry.integrationPermission,
                decisions: [decision, ...entry.decisions],
                updatedAt: nowIso(),
              }
            : entry,
        ),
        moderation: addModeration(previous.moderation, {
          targetKind: "station",
          targetTitle: submission.name,
          action: action === "request_changes" ? "request_changes" : action === "approve" ? "approve" : action === "suspend" ? "suspend" : "reject",
          reason,
          actor: `${state.actor.name} (${state.actor.role})`,
        }),
      }));
      return { ok: true };
    },
    [addModeration, patchState, state.actor.name, state.actor.role, state.submissions],
  );

  const setIntegrationPermission = useCallback<StudioApi["setIntegrationPermission"]>(
    (id, permission) => {
      if (!mayApprove(state.actor.role)) return { ok: false, reason: "Only a reviewer or administrator can change integration permissions." };
      patchState((previous) => ({
        ...previous,
        submissions: previous.submissions.map((entry) => (entry.id === id ? { ...entry, integrationPermission: permission, updatedAt: nowIso() } : entry)),
      }));
      return { ok: true };
    },
    [patchState, state.actor.role],
  );

  /* Admin: content review ------------------------------------------------- */
  /**
   * Show-level review. Episodes inherit their show's approval, so a new show
   * must clear review before any of its episodes can be published.
   */
  const reviewShow = useCallback<StudioApi["reviewShow"]>(
    (id, verdict, note) => {
      const show = state.shows.find((entry) => entry.id === id);
      if (!show) return { ok: false, reason: "Show not found." };
      if (!mayApprove(state.actor.role)) return { ok: false, reason: "Only a reviewer or administrator can approve a show." };
      if (note.trim().length < 8) return { ok: false, reason: "Record a reason of at least 8 characters." };
      const reviewStatus: ReviewStatus = verdict === "approve" ? "approved" : verdict === "reject" ? "rejected" : "changes_requested";
      patchState((previous) => ({
        ...previous,
        shows: previous.shows.map((entry) => (entry.id === id ? { ...entry, reviewStatus } : entry)),
        moderation: addModeration(previous.moderation, {
          targetKind: "podcast_episode",
          targetTitle: `${show.title} (show)`,
          action: verdict === "approve" ? "approve" : verdict === "reject" ? "reject" : "request_changes",
          reason: note,
          actor: `${state.actor.name} (${state.actor.role})`,
        }),
      }));
      return { ok: true };
    },
    [addModeration, patchState, state.actor.name, state.actor.role, state.shows],
  );

  const reviewEpisode = useCallback<StudioApi["reviewEpisode"]>(
    (id, verdict, note) => {
      const episode = state.episodes.find((entry) => entry.id === id);
      if (!episode) return { ok: false, reason: "Episode not found." };
      if (!mayApprove(state.actor.role)) return { ok: false, reason: "Only a reviewer or administrator can approve content." };
      if (note.trim().length < 8) return { ok: false, reason: "Record a reason of at least 8 characters." };
      const reviewStatus: ReviewStatus = verdict === "approve" ? "approved" : verdict === "reject" ? "rejected" : "changes_requested";
      patchState((previous) => ({
        ...previous,
        episodes: previous.episodes.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                reviewStatus,
                publicationStatus: verdict === "reject" ? "rejected" : verdict === "changes_requested" ? "editing" : entry.publicationStatus,
                reviewNote: note,
                history: [audit(`review: ${verdict}`, state.actor.name, state.actor.role, note, entry.reviewStatus, reviewStatus), ...entry.history],
                updatedAt: nowIso(),
              }
            : entry,
        ),
        moderation: addModeration(previous.moderation, {
          targetKind: "podcast_episode",
          targetTitle: episode.title,
          action: verdict === "approve" ? "approve" : verdict === "reject" ? "reject" : "request_changes",
          reason: note,
          actor: `${state.actor.name} (${state.actor.role})`,
        }),
      }));
      return { ok: true };
    },
    [addModeration, patchState, state.actor.name, state.actor.role, state.episodes],
  );

  const reviewVideo = useCallback<StudioApi["reviewVideo"]>(
    (id, verdict, note) => {
      const video = state.videos.find((entry) => entry.id === id);
      if (!video) return { ok: false, reason: "Video not found." };
      if (!mayApprove(state.actor.role)) return { ok: false, reason: "Only a reviewer or administrator can approve content." };
      if (note.trim().length < 8) return { ok: false, reason: "Record a reason of at least 8 characters." };
      const reviewStatus: ReviewStatus = verdict === "approve" ? "approved" : verdict === "reject" ? "rejected" : "changes_requested";
      patchState((previous) => ({
        ...previous,
        videos: previous.videos.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                reviewStatus,
                publicationStatus: verdict === "reject" ? "rejected" : verdict === "changes_requested" ? "editing" : entry.publicationStatus,
                reviewNote: note,
                history: [audit(`review: ${verdict}`, state.actor.name, state.actor.role, note, entry.reviewStatus, reviewStatus), ...entry.history],
                updatedAt: nowIso(),
              }
            : entry,
        ),
        moderation: addModeration(previous.moderation, {
          targetKind: "video",
          targetTitle: video.title,
          action: verdict === "approve" ? "approve" : verdict === "reject" ? "reject" : "request_changes",
          reason: note,
          actor: `${state.actor.name} (${state.actor.role})`,
        }),
      }));
      return { ok: true };
    },
    [addModeration, patchState, state.actor.name, state.actor.role, state.videos],
  );

  const resolveReport = useCallback<StudioApi["resolveReport"]>(
    (id, status, reason) => {
      const report = state.reports.find((entry) => entry.id === id);
      if (!report || !mayApprove(state.actor.role)) return;
      patchState((previous) => ({
        ...previous,
        reports: previous.reports.map((entry) => (entry.id === id ? { ...entry, status } : entry)),
        moderation: addModeration(previous.moderation, {
          targetKind: report.targetKind,
          targetTitle: report.targetTitle,
          action: status === "actioned" ? "remove_content" : "dismiss_report",
          reason,
          actor: `${state.actor.name} (${state.actor.role})`,
        }),
      }));
    },
    [addModeration, patchState, state.actor.name, state.actor.role, state.reports],
  );

  /* Live (simulated) ------------------------------------------------------ */
  const updateSession = useCallback<StudioApi["updateSession"]>(
    (id, patch) => {
      patchState((previous) => ({
        ...previous,
        sessions: previous.sessions.map((session) => (session.id === id ? { ...session, ...patch } : session)),
      }));
    },
    [patchState],
  );

  const startBroadcast = useCallback<StudioApi["startBroadcast"]>(
    (id) => {
      const session = state.sessions.find((entry) => entry.id === id);
      if (!session) return { ok: false, reason: "Session not found." };
      if (!session.ingestTarget || session.ingestTarget.includes("not configured")) {
        // Never leave the control stuck in "connecting" after a refused start.
        updateSession(id, { simulatedState: "idle" });
        return { ok: false, reason: "No ingest endpoint is configured. RTMP/SRT ingest is not part of this build." };
      }
      updateSession(id, { simulatedState: "live", startedAt: nowIso(), listenersDemo: 0 });
      return { ok: true };
    },
    [state.sessions, updateSession],
  );

  const stopBroadcast = useCallback<StudioApi["stopBroadcast"]>(
    (id) => {
      updateSession(id, { simulatedState: "stopped", startedAt: null });
    },
    [updateSession],
  );

  const addProgramme = useCallback<StudioApi["addProgramme"]>(
    (input) => {
      patchState((previous) => ({ ...previous, programmes: [...previous.programmes, { ...input, id: uid("pr") }] }));
    },
    [patchState],
  );

  const setRole = useCallback<StudioApi["setRole"]>(
    (role, name) => {
      setState((previous) => ({
        ...previous,
        actor: { ...previous.actor, role, name: name ?? previous.actor.name },
      }));
    },
    [],
  );

  const resetStudio = useCallback(() => {
    resetVideoComments();
    setState(initialState());
  }, []);

  const channel = state.channels.find((entry) => entry.id === state.actor.channelId);

  const api = useMemo<StudioApi>(
    () => ({
      state,
      actor: state.actor,
      channel,
      setRole,
      showFor: (showId) => state.shows.find((show) => show.id === showId),
      episodesFor: (showId) => state.episodes.filter((episode) => episode.showId === showId).sort((a, b) => a.number - b.number),
      updateChannel,
      createShow,
      updateShow,
      submitShowForReview,
      createEpisode,
      updateEpisode,
      attachMediaToEpisode,
      transitionEpisode,
      submitEpisodeForReview,
      createVideo,
      updateVideo,
      attachVideoFile,
      transitionVideo,
      submitVideoForReview,
      addMediaAsset,
      createSubmission,
      updateSubmission,
      submitSubmission,
      addStream,
      replaceStreamUrl,
      testStream,
      reviewSubmission,
      setIntegrationPermission,
      reviewShow,
      reviewEpisode,
      reviewVideo,
      resolveReport,
      updateSession,
      startBroadcast,
      stopBroadcast,
      addProgramme,
      resetStudio,
    }),
    [
      state,
      channel,
      setRole,
      updateChannel,
      createShow,
      updateShow,
      submitShowForReview,
      createEpisode,
      updateEpisode,
      attachMediaToEpisode,
      transitionEpisode,
      submitEpisodeForReview,
      createVideo,
      updateVideo,
      attachVideoFile,
      transitionVideo,
      submitVideoForReview,
      addMediaAsset,
      createSubmission,
      updateSubmission,
      submitSubmission,
      addStream,
      replaceStreamUrl,
      testStream,
      reviewSubmission,
      setIntegrationPermission,
      reviewShow,
      reviewEpisode,
      reviewVideo,
      resolveReport,
      updateSession,
      startBroadcast,
      stopBroadcast,
      addProgramme,
      resetStudio,
    ],
  );

  return <StudioContext.Provider value={api}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioApi {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
}
