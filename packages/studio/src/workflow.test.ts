import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStreamCheck,
  canTransition,
  canTransitionSubmission,
  creatorMayTransition,
  episodePublishBlockers,
  mayApprove,
  replaceEndpointUrl,
  stationListable,
  submissionTransitionActorRole,
  transitionsFrom,
  videoPublishBlockers,
} from "./workflow.ts";
import type { Episode, Show, StationSubmissionStatus, StreamEndpointDraft, VideoItem } from "./types.ts";

const NOW = "2026-11-22T09:00:00.000Z";

function episode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "ep-1",
    showId: "show-1",
    seasonNumber: 1,
    number: 1,
    title: "Episode one",
    description: "A long enough description for publishing checks.",
    audioSource: "recording",
    mediaAssetId: "asset-1",
    durationSeconds: 1800,
    explicit: false,
    rights: "original",
    publicationStatus: "review",
    reviewStatus: "approved",
    scheduledFor: null,
    publishedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    reviewNote: null,
    history: [],
    ...overrides,
  };
}

function endpoint(overrides: Partial<StreamEndpointDraft> = {}): StreamEndpointDraft {
  return {
    id: "s1",
    label: "Primary",
    url: "https://stream.example.ug/live",
    role: "primary",
    format: "mp3",
    bitrateKbps: 128,
    health: "unverified",
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    verifiedByPlatform: false,
    history: [],
    ...overrides,
  };
}

const show: Show = {
  id: "show-1",
  channelId: "ch-1",
  title: "Show",
  slug: "show",
  description: "A show description that is long enough.",
  categories: ["Society & Culture"],
  languages: ["English"],
  hosts: [],
  artworkSeed: "seed",
  artworkDataUrl: null,
  explicit: false,
  createdAt: NOW,
  reviewStatus: "approved",
  rights: "original",
};

/* Pipeline ---------------------------------------------------------------- */

test("a creator schedules an approved item but never publishes straight from review", () => {
  assert.equal(creatorMayTransition("creator", "review", "scheduled"), true);
  assert.equal(creatorMayTransition("creator", "review", "published"), false);
  assert.equal(creatorMayTransition("creator", "scheduled", "published"), true);
});

test("the publication pipeline advances one step at a time", () => {
  assert.equal(canTransition("draft", "recording"), true);
  assert.equal(canTransition("editing", "review"), true);
  assert.equal(canTransition("review", "published"), true);
});

test("a creator cannot skip review straight to published", () => {
  assert.equal(canTransition("draft", "published"), false);
  assert.equal(canTransition("editing", "published"), false);
});

test("review can bounce back for edits, published can only be withdrawn", () => {
  assert.deepEqual([...transitionsFrom("review")].sort(), ["editing", "published", "rejected", "scheduled"].sort());
  assert.deepEqual(transitionsFrom("published"), ["withdrawn"]);
});

/* Review gating ------------------------------------------------------------ */

test("a fully prepared episode has no publish blockers", () => {
  assert.deepEqual(episodePublishBlockers(episode(), show), []);
});

test("publishing without reviewer approval is blocked", () => {
  const blockers = episodePublishBlockers(episode({ reviewStatus: "pending" }), show);
  assert.ok(blockers.some((b) => b.code === "review"));
});

test("an unapproved show blocks every episode beneath it", () => {
  const blockers = episodePublishBlockers(episode(), { ...show, reviewStatus: "pending" });
  assert.ok(blockers.some((b) => b.code === "show_review"));
});

test("undeclared rights block publication", () => {
  const blockers = episodePublishBlockers(episode({ rights: "undisclosed" }), show);
  assert.ok(blockers.some((b) => b.code === "rights"));
});

test("an episode with no audio cannot publish", () => {
  const blockers = episodePublishBlockers(episode({ audioSource: "none", mediaAssetId: null, durationSeconds: null }), show);
  assert.ok(blockers.some((b) => b.code === "audio"));
});

test("a video draft with no file cannot publish and reports every reason", () => {
  const video: VideoItem = {
    id: "v1",
    channelId: "ch-1",
    title: "Vlog",
    description: "short",
    category: "Documentary",
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
    createdAt: NOW,
    updatedAt: NOW,
    reviewNote: null,
    history: [],
  };
  const codes = videoPublishBlockers(video).map((b) => b.code);
  assert.ok(codes.includes("audio") && codes.includes("rights") && codes.includes("review") && codes.includes("status"));
});

/* Roles ------------------------------------------------------------------- */

test("creators may submit for review but never approve", () => {
  assert.equal(creatorMayTransition("creator", "editing", "review"), true);
  assert.equal(mayApprove("creator"), false);
  assert.equal(mayApprove("broadcaster"), false);
  assert.equal(mayApprove("reviewer"), true);
  assert.equal(mayApprove("admin"), true);
});

test("creators cannot jump from review to published in one action", () => {
  assert.equal(creatorMayTransition("creator", "review", "published"), false);
  assert.equal(creatorMayTransition("reviewer", "review", "published"), true);
});

/* Station submissions ----------------------------------------------------- */

test("submission lifecycle follows the documented states", () => {
  const legal: [StationSubmissionStatus, StationSubmissionStatus][] = [
    ["draft", "submitted"],
    ["submitted", "under_review"],
    ["under_review", "approved"],
    ["under_review", "changes_requested"],
    ["changes_requested", "submitted"],
    ["approved", "suspended"],
  ];
  for (const [from, to] of legal) assert.equal(canTransitionSubmission(from, to), true, `${from} → ${to}`);
  assert.equal(canTransitionSubmission("draft", "approved"), false);
  assert.equal(canTransitionSubmission("rejected", "approved"), false);
});

test("a broadcaster cannot approve their own station submission", () => {
  assert.equal(submissionTransitionActorRole("under_review", "approved", "broadcaster"), false);
  assert.equal(submissionTransitionActorRole("under_review", "approved", "reviewer"), true);
  assert.equal(submissionTransitionActorRole("draft", "submitted", "broadcaster"), true);
});

/* Stream verification ----------------------------------------------------- */

test("a broadcaster cannot mark their own stream verified", () => {
  const outcome = applyStreamCheck(endpoint(), "broadcaster", { result: "healthy", detail: "looks fine" }, NOW);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /platform stream monitor/i);
});

test("the platform monitor records a healthy check with evidence", () => {
  const outcome = applyStreamCheck(
    endpoint(),
    "platform_monitor",
    { result: "healthy", detail: "200 audio/mpeg, decoded", decodedBytes: 706351, sustainedSeconds: 44 },
    NOW,
  );
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.endpoint.health, "healthy");
    assert.equal(outcome.endpoint.verifiedByPlatform, true);
    assert.equal(outcome.endpoint.lastSuccessAt, NOW);
    assert.equal(outcome.endpoint.history.length, 1);
    assert.equal(outcome.endpoint.history[0]?.sustainedSeconds, 44);
  }
});

test("a failing check records the failure without erasing the last success", () => {
  const previouslyHealthy = endpoint({
    health: "healthy",
    verifiedByPlatform: true,
    lastSuccessAt: "2026-11-01T00:00:00.000Z",
  });
  const failing = applyStreamCheck(previouslyHealthy, "platform_monitor", { result: "failing", detail: "connection reset" }, NOW);
  assert.equal(failing.ok, true);
  if (failing.ok) {
    assert.equal(failing.endpoint.health, "failing");
    assert.equal(failing.endpoint.lastFailureReason, "connection reset");
    assert.equal(failing.endpoint.lastSuccessAt, "2026-11-01T00:00:00.000Z");
  }
});

test("replacing a stream URL invalidates the previous verification", () => {
  const verified = endpoint({ health: "healthy", verifiedByPlatform: true, lastSuccessAt: NOW });
  const replaced = replaceEndpointUrl(verified, "https://new.example.ug/live");
  assert.equal(replaced.url, "https://new.example.ug/live");
  assert.equal(replaced.health, "unverified");
  assert.equal(replaced.verifiedByPlatform, false);
  assert.equal(replaced.lastSuccessAt, null);
});

test("a station is only listable when approved, healthy and permitted", () => {
  const healthy = [endpoint({ health: "healthy", verifiedByPlatform: true })];
  assert.equal(stationListable("approved", healthy, "granted"), true);
  assert.equal(stationListable("approved", healthy, "pending"), false);
  assert.equal(stationListable("under_review", healthy, "granted"), false);
  assert.equal(stationListable("approved", [endpoint({ health: "failing" })], "granted"), false);
});
