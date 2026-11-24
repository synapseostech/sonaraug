import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEdit,
  decideEpisodeAccess,
  episodeTier,
  parseAudioSource,
  parseAuthorisedUrl,
  parseNotebookLmLink,
  publishedOrder,
  sniffAudioType,
  slugify,
  submissionBlockers,
  transition,
  uniqueSlug,
  type EditorialEpisode,
  type EpisodeForOrdering,
} from "./index.ts";

const NOW = new Date("2026-11-23T12:00:00Z");
const series = { id: "s1", requiresSubscription: true, freeEpisodeAllowance: null, status: "published" };

function ep(id: string, n: number, extra: Partial<EpisodeForOrdering> = {}): EpisodeForOrdering {
  return {
    id,
    seriesId: "s1",
    season: 1,
    episodeNumber: n,
    publishedAt: `2026-11-0${Math.min(n, 9)}T08:00:00Z`,
    status: "published",
    accessOverride: "inherit",
    ...extra,
  };
}

const anon = { signedIn: false, listenerPremium: false, canPreviewUnpublished: false };
const freeUser = { signedIn: true, listenerPremium: false, canPreviewUnpublished: false };
const subscriber = { signedIn: true, listenerPremium: true, canPreviewUnpublished: false };

/* ---------------------------------------------------------------- sources */

test("MC-2 a NotebookLM share link is accepted and normalised", () => {
  const result = parseNotebookLmLink("https://notebooklm.google.com/notebook/abc123DEF_-x?authuser=1#frag");
  assert.equal(result.ok, true);
  if (result.ok && result.source.kind === "notebooklm_link") {
    assert.equal(result.source.url, "https://notebooklm.google.com/notebook/abc123DEF_-x");
    assert.equal(result.source.notebookId, "abc123DEF_-x");
  }
  assert.equal(parseNotebookLmLink("https://notebooklm.google.com/notebook/abc123def/audio").ok, true);
});

test("MC-3 invalid and unsupported links are rejected safely", () => {
  const cases: [string, string][] = [
    ["", "empty"],
    ["not a url", "not_a_url"],
    ["http://notebooklm.google.com/notebook/abc123def", "insecure_scheme"],
    ["javascript:alert(1)", "insecure_scheme"],
    ["https://user:pw@notebooklm.google.com/notebook/abc123def", "credentials_in_url"],
    ["https://notebooklm.google.com.evil.example/notebook/abc123def", "unsupported_provider"],
    ["https://evil.example/?u=notebooklm.google.com", "unsupported_provider"],
    ["https://notebooklm.google.com:8443/notebook/abc123def", "unsupported_provider"],
    ["https://notebooklm.google.com/", "not_a_notebook_link"],
    ["https://notebooklm.google.com/notebook/<script>", "not_a_notebook_link"],
    ["https://notebooklm.google.com/notebook/abc123def/a/b/c", "not_a_notebook_link"],
  ];
  for (const [input, error] of cases) {
    const result = parseNotebookLmLink(input);
    assert.equal(result.ok, false, input);
    if (!result.ok) assert.equal(result.error, error, input);
  }
});

test("authorised URLs must be https on an allow-listed host and never an IP or local host", () => {
  const hosts = ["media.example.org"];
  assert.equal(parseAuthorisedUrl("https://media.example.org/a.mp3", hosts).ok, true);
  for (const bad of [
    "https://other.example.org/a.mp3",
    "https://127.0.0.1/a.mp3",
    "https://[::1]/a.mp3",
    "https://localhost/a.mp3",
    "https://2130706433/a.mp3",
    "http://media.example.org/a.mp3",
    "https://media.example.org:8080/a.mp3",
  ]) {
    assert.equal(parseAuthorisedUrl(bad, hosts).ok, false, bad);
  }
  assert.equal(parseAuthorisedUrl("https://media.example.org/a.mp3", []).ok, false, "empty allow-list allows nothing");
});

test("MC-4 an uploaded asset reference is accepted only in the expected format", () => {
  assert.equal(parseAudioSource({ kind: "uploaded_audio", assetId: "asset_0123456789" }, { allowedHosts: [] }).ok, true);
  assert.equal(parseAudioSource({ kind: "uploaded_audio", assetId: "../../etc/passwd" }, { allowedHosts: [] }).ok, false);
});

test("audio uploads are identified by magic bytes, not the claimed type", () => {
  assert.equal(sniffAudioType(new TextEncoder().encode("ID3\u0004....")), "audio/mpeg");
  assert.equal(sniffAudioType(new Uint8Array([0xff, 0xfb, 0x90, 0x00])), "audio/mpeg");
  assert.equal(sniffAudioType(new TextEncoder().encode("OggS....")), "audio/ogg");
  assert.equal(sniffAudioType(new TextEncoder().encode("RIFF....WAVE")), "audio/wav");
  assert.equal(sniffAudioType(new TextEncoder().encode("....ftypM4A ")), "audio/mp4");
  assert.equal(sniffAudioType(new TextEncoder().encode("<html><script>")), null);
  assert.equal(sniffAudioType(new TextEncoder().encode("%PDF-1.7")), null);
});

/* ----------------------------------------------------------------- access */

test("L-4 / MC-6 the first two published episodes are free by default", () => {
  const eps = [ep("e1", 1), ep("e2", 2), ep("e3", 3)];
  assert.deepEqual(
    eps.map((e) => episodeTier(e, series, eps, NOW)),
    ["free", "free", "premium"],
  );
});

test("L-5 the third episode is locked without entitlement, for visitors and free accounts", () => {
  const eps = [ep("e1", 1), ep("e2", 2), ep("e3", 3)];
  const e3 = eps[2]!;
  const asAnon = decideEpisodeAccess({ episode: e3, series, allEpisodes: eps, viewer: anon, now: NOW });
  assert.deepEqual([asAnon.allowed, asAnon.reason], [false, "sign_in_required"]);
  const asFree = decideEpisodeAccess({ episode: e3, series, allEpisodes: eps, viewer: freeUser, now: NOW });
  assert.deepEqual([asFree.allowed, asFree.reason], [false, "subscription_required"]);
});

test("L-6 an entitled listener can access premium episodes", () => {
  const eps = [ep("e1", 1), ep("e2", 2), ep("e3", 3)];
  const decision = decideEpisodeAccess({ episode: eps[2]!, series, allEpisodes: eps, viewer: subscriber, now: NOW });
  assert.deepEqual([decision.allowed, decision.reason], [true, "subscriber"]);
});

test("MC-6 order is by season then episode number, not by insertion order", () => {
  const eps = [ep("late", 3), ep("first", 1, { season: 1 }), ep("s2e1", 1, { season: 2 }), ep("second", 2)];
  assert.deepEqual(publishedOrder(eps, "s1", NOW).map((e) => e.id), ["first", "second", "late", "s2e1"]);
  assert.equal(episodeTier(eps[0]!, series, eps, NOW), "premium");
  assert.equal(episodeTier(eps[1]!, series, eps, NOW), "free");
});

test("MC-6 drafts, scheduled and withdrawn episodes take no position", () => {
  const eps = [
    ep("draft", 1, { status: "draft", publishedAt: null }),
    ep("withdrawn", 2, { status: "withdrawn" }),
    ep("scheduled", 3, { publishedAt: "2027-01-01T00:00:00Z" }),
    ep("a", 4),
    ep("b", 5),
    ep("c", 6),
  ];
  assert.deepEqual(
    ["a", "b", "c"].map((id) => episodeTier(eps.find((e) => e.id === id)!, series, eps, NOW)),
    ["free", "free", "premium"],
  );
});

test("MC-5 overrides beat position, and the allowance counts positions", () => {
  const eps = [ep("e1", 1), ep("e2", 2, { accessOverride: "premium" }), ep("e3", 3), ep("e4", 4, { accessOverride: "free" })];
  assert.deepEqual(
    eps.map((e) => episodeTier(e, series, eps, NOW)),
    ["free", "premium", "premium", "free"],
  );
});

test("the allowance is configurable per series, and an ungated series is entirely free", () => {
  const eps = [ep("e1", 1), ep("e2", 2), ep("e3", 3)];
  assert.deepEqual(eps.map((e) => episodeTier(e, { ...series, freeEpisodeAllowance: 0 }, eps, NOW)), ["premium", "premium", "premium"]);
  assert.deepEqual(eps.map((e) => episodeTier(e, { ...series, freeEpisodeAllowance: 3 }, eps, NOW)), ["free", "free", "free"]);
  assert.deepEqual(eps.map((e) => episodeTier(e, { ...series, requiresSubscription: false }, eps, NOW)), ["free", "free", "free"]);
  assert.deepEqual(eps.map((e) => episodeTier(e, series, eps, NOW, 1)), ["free", "premium", "premium"], "platform default applies when null");
});

test("MC-9 an unapproved episode is not publicly available, even to subscribers", () => {
  const eps = [ep("draft", 1, { status: "approved", publishedAt: null })];
  const decision = decideEpisodeAccess({ episode: eps[0]!, series, allEpisodes: eps, viewer: subscriber, now: NOW });
  assert.deepEqual([decision.allowed, decision.reason], [false, "not_published"]);
  const staff = decideEpisodeAccess({
    episode: eps[0]!,
    series,
    allEpisodes: eps,
    viewer: { ...freeUser, canPreviewUnpublished: true },
    now: NOW,
  });
  assert.deepEqual([staff.allowed, staff.reason], [true, "staff_preview"]);
});

test("an episode in an unpublished series is not public", () => {
  const eps = [ep("e1", 1)];
  const decision = decideEpisodeAccess({ episode: eps[0]!, series: { ...series, status: "draft" }, allEpisodes: eps, viewer: subscriber, now: NOW });
  assert.equal(decision.allowed, false);
});

test("free episodes can be restricted to signed-in accounts by a platform setting", () => {
  const eps = [ep("e1", 1)];
  const open = decideEpisodeAccess({ episode: eps[0]!, series, allEpisodes: eps, viewer: anon, now: NOW });
  assert.equal(open.allowed, true);
  const gated = decideEpisodeAccess({ episode: eps[0]!, series, allEpisodes: eps, viewer: anon, now: NOW, freeRequiresAccount: true });
  assert.deepEqual([gated.allowed, gated.reason], [false, "sign_in_required"]);
});

/* -------------------------------------------------------------- editorial */

const ready: EditorialEpisode = {
  status: "draft",
  version: 3,
  title: "Cardiac cycle",
  description: "Pressure-volume loops explained.",
  hasSource: true,
  references: [{ title: "Guyton and Hall, ch. 9" }],
  aiDisclosure: "ai_generated",
  submittedBy: null,
  lastEditedBy: "editor",
  approvedVersion: null,
  publishedAt: null,
};
const editor = { id: "editor", canEdit: true, canReview: false };
const reviewer = { id: "reviewer", canEdit: true, canReview: true };

test("MC-8 an editor submits and a different reviewer approves and publishes", () => {
  const submitted = transition(ready, { type: "submit" }, editor, NOW);
  assert.equal(submitted.ok, true);
  const inReview = { ...ready, status: "in_review" as const, submittedBy: "editor" };
  const approved = transition(inReview, { type: "approve" }, reviewer, NOW);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.patch.approvedVersion, 3);
  const published = transition({ ...inReview, status: "approved", approvedVersion: 3 }, { type: "publish" }, reviewer, NOW);
  assert.equal(published.ok, true);
  if (published.ok) assert.equal(published.patch.publishedAt, NOW.toISOString());
});

test("C-6 nobody can approve or publish their own work", () => {
  const ownReview = { ...ready, status: "in_review" as const, submittedBy: "reviewer", lastEditedBy: "reviewer" };
  const result = transition(ownReview, { type: "approve" }, reviewer, NOW);
  assert.deepEqual(result.ok ? null : result.error, "self_approval");
  const ownPublish = transition({ ...ownReview, status: "approved", approvedVersion: 3 }, { type: "publish" }, reviewer, NOW);
  assert.deepEqual(ownPublish.ok ? null : ownPublish.error, "self_approval");
});

test("an editor without review rights cannot approve", () => {
  const result = transition({ ...ready, status: "in_review", submittedBy: "x", lastEditedBy: "x" }, { type: "approve" }, editor, NOW);
  assert.deepEqual(result.ok ? null : result.error, "forbidden");
});

test("submission needs a source, a reference, an AI disclosure and a description", () => {
  const bare: EditorialEpisode = { ...ready, hasSource: false, references: [{ title: "  " }], aiDisclosure: null, description: "" };
  assert.deepEqual(submissionBlockers(bare), ["missing_source", "missing_references", "missing_ai_disclosure", "missing_description"]);
  const result = transition(bare, { type: "submit" }, editor, NOW);
  assert.deepEqual(result.ok ? null : result.error, "missing_source");
});

test("publishing needs an approval of the current version", () => {
  const stale = { ...ready, status: "approved" as const, submittedBy: "editor", approvedVersion: 2 };
  const result = transition(stale, { type: "publish" }, reviewer, NOW);
  assert.deepEqual(result.ok ? null : result.error, "stale_approval");
});

test("a future publish date schedules; a past date publishes now", () => {
  const approved = { ...ready, status: "approved" as const, submittedBy: "editor", approvedVersion: 3 };
  const future = transition(approved, { type: "publish", publishAt: "2026-12-01T09:00:00Z" }, reviewer, NOW);
  assert.equal(future.ok && future.event, "scheduled");
  const past = transition(approved, { type: "publish", publishAt: "2020-01-01T00:00:00Z" }, reviewer, NOW);
  assert.equal(past.ok && past.patch.publishedAt, NOW.toISOString());
});

test("withdrawal needs a reason; reopening returns to draft and clears approval", () => {
  const live = { ...ready, status: "published" as const, approvedVersion: 3, publishedAt: NOW.toISOString() };
  assert.equal(transition(live, { type: "withdraw", reason: " " }, reviewer, NOW).ok, false);
  const withdrawn = transition(live, { type: "withdraw", reason: "Dosage error reported" }, reviewer, NOW);
  assert.equal(withdrawn.ok, true);
  const reopened = transition({ ...live, status: "withdrawn" }, { type: "reopen" }, editor, NOW);
  assert.equal(reopened.ok && reopened.patch.approvedVersion, null);
});

test("editing after approval returns to draft; editing a live episode requires a correction note", () => {
  const approved = { ...ready, status: "approved" as const, approvedVersion: 3 };
  const edit = applyEdit(approved, ["description"], editor, null);
  assert.equal(edit.ok && edit.patch.status, "draft");
  assert.equal(edit.ok && edit.patch.version, 4);

  const live = { ...ready, status: "published" as const };
  const silent = applyEdit(live, ["references"], editor, null);
  assert.equal(silent.ok, false);
  const corrected = applyEdit(live, ["references"], editor, "Corrected the cited guideline year");
  assert.equal(corrected.ok && corrected.isCorrection, true);
  assert.equal(corrected.ok && corrected.patch.status, undefined, "a correction keeps the episode live");

  assert.equal(applyEdit({ ...ready, status: "withdrawn" }, ["title"], editor, null).ok, false);
});

/* ------------------------------------------------------------------ slugs */

test("slugs are stable, ascii and unique", () => {
  assert.equal(slugify("Obstetrics & Gynaecology"), "obstetrics-and-gynaecology");
  assert.equal(slugify("  Paediatrics: Fever in Children!  "), "paediatrics-fever-in-children");
  assert.equal(slugify("Ünïcödé"), "unicode");
  assert.equal(uniqueSlug("Cardio", new Set(["cardio", "cardio-2"])), "cardio-3");
});
