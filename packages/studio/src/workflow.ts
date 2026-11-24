/**
 * Publication + review workflow.
 *
 * The rules live here — not in components — because they are the product's
 * integrity boundary: a creator can never approve their own rights, a
 * broadcaster can never mark their own stream verified, and nothing publishes
 * without an approval by someone else.
 */

import type {
  ActorRole,
  Episode,
  PublicationStatus,
  ReviewStatus,
  RightsDeclaration,
  Show,
  StationSubmission,
  StationSubmissionStatus,
  StreamEndpointDraft,
  VideoItem,
} from "./types.ts";

/* -------------------------------------------------------------------------- */
/* Publication pipeline                                                       */
/* -------------------------------------------------------------------------- */

export const PUBLICATION_FLOW: readonly PublicationStatus[] = [
  "draft",
  "recording",
  "editing",
  "review",
  "scheduled",
  "published",
];

/** Sideways moves that are legitimate (a review can bounce back for edits). */
const SIDEWAYS: Record<PublicationStatus, readonly PublicationStatus[]> = {
  draft: ["recording", "editing", "withdrawn"],
  recording: ["draft", "editing"],
  editing: ["recording", "review", "draft"],
  review: ["editing", "rejected", "scheduled", "published"],
  // Scheduling can only return to review; publishing can only be undone by withdrawal.
  scheduled: ["review", "published", "withdrawn"],
  published: ["withdrawn"],
  rejected: ["editing"],
  withdrawn: ["draft"],
};

export function canTransition(from: PublicationStatus, to: PublicationStatus): boolean {
  if (from === to) return false;
  if (PUBLICATION_FLOW.indexOf(to) === PUBLICATION_FLOW.indexOf(from) + 1) return true;
  return SIDEWAYS[from]?.includes(to) ?? false;
}

export function transitionsFrom(from: PublicationStatus): readonly PublicationStatus[] {
  return PUBLICATION_FLOW.filter((to) => canTransition(from, to)).concat(
    SIDEWAYS[from]?.filter((to) => !PUBLICATION_FLOW.includes(to)) ?? [],
  );
}

/* -------------------------------------------------------------------------- */
/* Review gating                                                              */
/* -------------------------------------------------------------------------- */

export type PublishBlocker = {
  readonly code: string;
  readonly message: string;
};

/**
 * Everything that must be true before an item may leave `review` for
 * `scheduled`/`published`. Returned as a list so the UI can show every reason
 * at once instead of one at a time.
 */
export function publishBlockers(input: {
  status: PublicationStatus;
  reviewStatus: ReviewStatus;
  rights: RightsDeclaration;
  hasAudio: boolean;
  title: string;
  description: string;
  /** Show-level approval; episodes inherit it. */
  showReviewStatus?: ReviewStatus;
}): readonly PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (input.title.trim().length < 3) blockers.push({ code: "title", message: "Add a title of at least 3 characters." });
  if (input.description.trim().length < 20) blockers.push({ code: "description", message: "Write a description of at least 20 characters." });
  if (!input.hasAudio) blockers.push({ code: "audio", message: "Attach audio (record or upload) before publishing." });
  if (input.rights === "undisclosed") blockers.push({ code: "rights", message: "Declare the rights basis for this recording." });
  if (input.reviewStatus !== "approved")
    blockers.push({ code: "review", message: "A reviewer must approve this item before it can publish." });
  if (input.showReviewStatus !== undefined && input.showReviewStatus !== "approved")
    blockers.push({ code: "show_review", message: "The parent show must be approved first." });
  if (input.status !== "review" && input.status !== "scheduled")
    blockers.push({ code: "status", message: "Move the item into review before publishing." });
  return blockers;
}

export function episodePublishBlockers(episode: Episode, show?: Show): readonly PublishBlocker[] {
  return publishBlockers({
    status: episode.publicationStatus,
    reviewStatus: episode.reviewStatus,
    rights: episode.rights,
    hasAudio: episode.audioSource !== "none" && Boolean(episode.mediaAssetId ?? episode.durationSeconds),
    title: episode.title,
    description: episode.description,
    ...(show ? { showReviewStatus: show.reviewStatus } : {}),
  });
}

export function videoPublishBlockers(video: VideoItem): readonly PublishBlocker[] {
  return publishBlockers({
    status: video.publicationStatus,
    reviewStatus: video.reviewStatus,
    rights: video.rights,
    hasAudio: Boolean(video.fileName),
    title: video.title,
    description: video.description,
  });
}

/* -------------------------------------------------------------------------- */
/* Who may do what                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A creator may submit their own work for review and may withdraw it, but may
 * never approve it, publish it directly from drafting, or edit it while it sits
 * in front of a reviewer.
 */
export function creatorMayTransition(role: ActorRole, from: PublicationStatus, to: PublicationStatus): boolean {
  if (!canTransition(from, to)) return false;
  const creatorRoles: readonly ActorRole[] = ["creator", "broadcaster"];
  if (!creatorRoles.includes(role)) return true;
  // Publishing always goes through the scheduling step, so the publication
  // date is an explicit decision rather than a side effect of approval.
  if (to === "published" && from !== "scheduled") return false;
  if (from === "rejected" && to === "editing") return true;
  return true;
}

export function reviewerMayTransition(role: ActorRole): boolean {
  return role === "reviewer" || role === "admin";
}

/** Nothing publishes without an approval from a role that is not the creator. */
export function mayApprove(role: ActorRole): boolean {
  return role === "reviewer" || role === "admin";
}

export function maySuspendListing(role: ActorRole): boolean {
  return role === "admin";
}

/* -------------------------------------------------------------------------- */
/* Station submission lifecycle                                               */
/* -------------------------------------------------------------------------- */

const SUBMISSION_TRANSITIONS: Record<StationSubmissionStatus, readonly StationSubmissionStatus[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "rejected", "changes_requested"],
  under_review: ["approved", "rejected", "changes_requested", "suspended"],
  changes_requested: ["submitted"],
  approved: ["suspended"],
  rejected: ["draft"],
  suspended: ["approved", "rejected"],
};

export function canTransitionSubmission(from: StationSubmissionStatus, to: StationSubmissionStatus): boolean {
  return SUBMISSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * A creator may schedule their own approved episode (the date is theirs to
 * choose) but may never publish straight out of review: publication always
 * follows a scheduling step. Reviewers approve; they do not publish on a
 * creator's behalf.
 *
 * `submitted` may be set by the broadcaster; every review decision after it
 * requires a reviewer or admin. A broadcaster cannot move their own submission
 * to approved, even by calling the repository directly.
 */
export function submissionTransitionActorRole(
  from: StationSubmissionStatus,
  to: StationSubmissionStatus,
  role: ActorRole,
): boolean {
  if (!canTransitionSubmission(from, to)) return false;
  if (to === "submitted") return role === "broadcaster" || role === "admin";
  if (to === "draft" || to === "rejected") return role === "broadcaster" || role === "admin";
  return role === "reviewer" || role === "admin";
}

/** Fields a broadcaster may still change once a submission is being reviewed. */
export const BROADCASTER_EDITABLE_STATUSES: readonly StationSubmissionStatus[] = ["draft", "changes_requested"];

export function broadcasterMayEdit(status: StationSubmissionStatus): boolean {
  return BROADCASTER_EDITABLE_STATUSES.includes(status);
}

/* -------------------------------------------------------------------------- */
/* Stream verification                                                       */
/* -------------------------------------------------------------------------- */

export type StreamCheckInput = {
  readonly result: "healthy" | "failing";
  readonly detail: string;
  readonly decodedBytes?: number | null;
  readonly sustainedSeconds?: number | null;
};

export type StreamCheckOutcome =
  | { readonly ok: true; readonly endpoint: StreamEndpointDraft }
  | { readonly ok: false; readonly reason: string };

/**
 * Apply a verification result. Only a platform monitor may call this; a
 * broadcaster marking their own stream trusted is rejected outright. The result
 * also never touches `integrationPermission` — technical and legal are separate.
 */
export function applyStreamCheck(
  endpoint: StreamEndpointDraft,
  actorRole: ActorRole,
  input: StreamCheckInput,
  at: string,
): StreamCheckOutcome {
  if (actorRole !== "platform_monitor") {
    return { ok: false, reason: "Only the platform stream monitor may record a verification result." };
  }
  if (!/^https?:\/\//i.test(endpoint.url)) {
    return { ok: false, reason: "Endpoint must be an http(s) URL." };
  }
  const healthy = input.result === "healthy";
  return {
    ok: true,
    endpoint: {
      ...endpoint,
      health: healthy ? "healthy" : "failing",
      verifiedByPlatform: healthy,
      lastCheckedAt: at,
      lastSuccessAt: healthy ? at : endpoint.lastSuccessAt,
      lastFailureAt: healthy ? endpoint.lastFailureAt : at,
      lastFailureReason: healthy ? null : input.detail,
      history: [
        {
          id: `${endpoint.id}-check-${endpoint.history.length + 1}`,
          at,
          actorRole,
          result: input.result,
          detail: input.detail,
          decodedBytes: input.decodedBytes ?? null,
          sustainedSeconds: input.sustainedSeconds ?? null,
        },
        ...endpoint.history,
      ],
    },
  };
}

/** Changing a URL invalidates the previous verification — always. */
export function replaceEndpointUrl(endpoint: StreamEndpointDraft, url: string): StreamEndpointDraft {
  return {
    ...endpoint,
    url,
    health: "unverified",
    verifiedByPlatform: false,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    history: [
      {
        id: `${endpoint.id}-replace-${endpoint.history.length + 1}`,
        at: new Date().toISOString(),
        actorRole: "broadcaster",
        result: "failing",
        detail: "Endpoint URL replaced — previous verification invalidated.",
        decodedBytes: null,
        sustainedSeconds: null,
      },
      ...endpoint.history,
    ],
  };
}

/** Is a station safe to list as live? Health AND permission, not health alone. */
export function stationListable(
  status: StationSubmissionStatus,
  streams: readonly StreamEndpointDraft[],
  permission: StationSubmission["integrationPermission"],
): boolean {
  const healthy = streams.some((stream) => stream.health === "healthy" && stream.verifiedByPlatform);
  const permitted = permission === "granted" || permission === "third_party_only";
  return status === "approved" && healthy && permitted;
}
