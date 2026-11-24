/**
 * Migration planner tests (Wave 2 §10).
 *
 * These prove the properties that matter before anything is imported:
 * deterministic ids, duplicate detection, ordering preservation, and the
 * absolute rule that simulator transactions never become financial records.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, episodeOrder, normaliseStore, renderReport, sqlText, stableUuid, validateStore } from "./sonara-migrate.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function makeStore(overrides = {}) {
  const now = "2026-11-20T09:00:00.000Z";
  const store = {
    schemaVersion: 1,
    users: [{ id: "usr_1", email: "editor@example.org", displayName: "Editor", passwordHash: "scrypt$secret", status: "active", roles: ["content_editor"], createdAt: now }],
    sessions: [{ id: "sess_1", userId: "usr_1" }],
    tokens: [{ hash: "tok", userId: "usr_1" }],
    mcCategories: [{ id: "cat_anatomy", slug: "anatomy", name: "Anatomy", description: "", kind: "topic", sortOrder: 20, isActive: true, createdAt: now, updatedAt: now }],
    mcSeries: [{ id: "ser_1", slug: "the-ward-round", title: "The Ward Round", description: "", coverAssetId: null, categoryId: "cat_anatomy", specialtyId: null, editorDisplay: "Ed", hostDisplay: "Host", status: "published", requiresSubscription: true, freeEpisodeAllowance: 2, publishedAt: now, seoTitle: "", seoDescription: "", relatedSeriesIds: [], isSample: false, createdBy: "usr_1", createdAt: now, updatedAt: now }],
    mcEpisodes: [
      { id: "ep_2", seriesId: "ser_1", slug: "second", title: "Second", description: "", season: 1, episodeNumber: 2, coverAssetId: null, durationSeconds: 600, transcript: "", contentNotes: "", references: [], aiDisclosure: "ai_generated", accessOverride: "inherit", downloadAllowed: false, status: "published", version: 2, source: { kind: "notebooklm_link", url: "https://notebooklm.google.com/notebook/abc123", assetId: null, status: "active", statusNote: "", checkedAt: now, updatedAt: now }, submittedBy: "usr_1", submittedAt: now, lastEditedBy: null, approvedVersion: 2, approvedBy: "usr_2", approvedAt: now, publishedAt: now, withdrawnAt: null, withdrawnReason: null, lastReviewedAt: now, lastReviewedBy: "usr_2", relatedEpisodeIds: [], isSample: false, createdBy: "usr_1", createdAt: now, updatedAt: now },
      { id: "ep_1", seriesId: "ser_1", slug: "first", title: "First", description: "", season: 1, episodeNumber: 1, coverAssetId: null, durationSeconds: 600, transcript: "", contentNotes: "", references: [], aiDisclosure: null, accessOverride: "free", downloadAllowed: false, status: "published", version: 1, source: { kind: "notebooklm_link", url: "https://notebooklm.google.com/notebook/def456", assetId: null, status: "active", statusNote: "", checkedAt: now, updatedAt: now }, submittedBy: "usr_1", submittedAt: now, lastEditedBy: null, approvedVersion: 1, approvedBy: "usr_2", approvedAt: now, publishedAt: now, withdrawnAt: null, withdrawnReason: null, lastReviewedAt: now, lastReviewedBy: "usr_2", relatedEpisodeIds: [], isSample: false, createdBy: "usr_1", createdAt: now, updatedAt: now },
    ],
    mcVersions: [{ id: "ver_1", episodeId: "ep_1", version: 1, snapshot: { title: "First" }, changeNote: "initial", editedBy: "usr_1", createdAt: now }],
    mcEditorialEvents: [{ id: "evt_1", episodeId: "ep_1", actorId: "usr_2", action: "approve", fromStatus: "in_review", toStatus: "approved", version: 1, note: "", createdAt: now }],
    mcCorrections: [],
    media: [],
    plans: [{ id: "plan_listener_monthly", audience: "listener", code: "listener-monthly", name: "Listener monthly", description: "", interval: "monthly", amount: 1500000, currency: "UGX", active: true, trialDays: 0, features: [], creatorLimits: null, providerPlanId: null, priceIsPlaceholder: true, sortOrder: 10 }],
    promos: [],
    subscriptions: [{ id: "sub_sim", userId: "usr_1", planId: "plan_listener_monthly", audience: "listener", status: "active", currentPeriodStart: now, currentPeriodEnd: now, cancelAtPeriodEnd: false, cancelledAt: null, renewalMode: "manual", providerSubscriptionId: "sim_abc", isTrial: false, appliedTransactionIds: ["tx_sim"], createdAt: now, updatedAt: now }],
    transactions: [
      { id: "tx_sim", txRef: "SON-SIM-1", userId: "usr_1", planId: "plan_listener_monthly", audience: "listener", purpose: "new", amount: 1500000, currency: "UGX", promoCodeId: null, status: "successful", provider: "flutterwave", environment: "simulator", providerTransactionId: "sim_1", verifiedAt: now, createdAt: now, updatedAt: now },
      { id: "tx_live", txRef: "SON-LIVE-1", userId: "usr_1", planId: "plan_listener_monthly", audience: "listener", purpose: "new", amount: 1500000, currency: "UGX", promoCodeId: null, status: "successful", provider: "flutterwave", environment: "live", providerTransactionId: "fwl_1", verifiedAt: now, createdAt: now, updatedAt: now },
    ],
    webhookEvents: [{ id: "wh_1", provider: "flutterwave", processingStatus: "processed" }],
    overrides: [], refunds: [], listening: [], saved: [], notifications: [], outbox: [{ id: "mail_1", to: "editor@example.test", subject: "Reset", text: "https://sonara.test/reset?token=secret" }],
    audit: [{ id: "aud_1", action: "plan.update", seq: 1 }],
    creatorApplications: [],
    settings: { defaultFreeEpisodeAllowance: 2 },
    ...overrides,
  };
  return store;
}

const idsOf = (text) => [...text.matchAll(/insert into public\.(\w+)/g)].map((match) => match[1]);

test("ids map to stable, well-formed UUIDs and never collide across kinds", () => {
  const a = stableUuid("mc_episode", "ep_1");
  assert.match(a, UUID);
  assert.equal(stableUuid("mc_episode", "ep_1"), a);
  assert.notEqual(stableUuid("mc_series", "ep_1"), a);
  assert.notEqual(stableUuid("mc_episode", "ep_2"), a);
});

test("an unsupported store version is refused before anything else happens", () => {
  const { store, issues } = normaliseStore({ schemaVersion: 2, users: [] });
  assert.equal(store, null);
  assert.ok(issues.some((issue) => issue.severity === "error" && /schemaVersion/.test(issue.message)));
});

test("unknown collections are reported, never silently dropped", () => {
  const { unknownKeys, issues } = normaliseStore({ schemaVersion: 1, users: [], somethingNew: [{ id: "x" }] });
  assert.deepEqual(unknownKeys, ["somethingNew"]);
  assert.ok(issues.some((issue) => issue.collection === "somethingNew" && /preserved/.test(issue.message)));
});

test("duplicate ids, dangling references and duplicate ordering are blocking errors", () => {
  const store = makeStore();
  store.mcEpisodes.push({ ...store.mcEpisodes[0], id: "ep_1" }); // duplicate id
  store.mcEpisodes.push({ ...store.mcEpisodes[0], id: "ep_3", slug: "third" }); // same season+number
  store.mcSeries.push({ ...store.mcSeries[0], id: "ser_2", slug: "other", categoryId: "cat_missing" });
  store.transactions.push({ ...store.transactions[0] }); // duplicate txRef
  const issues = validateStore(store);
  const messages = issues.filter((i) => i.severity === "error").map((i) => i.message).join(" | ");
  assert.match(messages, /duplicate id/);
  assert.match(messages, /duplicate \(series, season, episode_number\)/);
  assert.match(messages, /does not exist/);
  assert.match(messages, /duplicate txRef/);
});

test("self-approval and publishing without approval are refused by the validator", () => {
  const store = makeStore();
  store.mcEpisodes[0].approvedBy = store.mcEpisodes[0].submittedBy;
  store.mcEpisodes[1].approvedBy = null;
  const errors = validateStore(store).filter((i) => i.severity === "error").map((i) => i.message).join(" | ");
  assert.match(errors, /self-approval/);
  assert.match(errors, /no approval recorded/);
});

test("simulator transactions are quarantined and appear in no SQL statement", () => {
  const plan = buildPlan(makeStore());
  assert.equal(plan.quarantined.simulated, 1);
  assert.equal(plan.quarantined.liveReview, 1);
  const allSql = plan.sql.map((file) => file.body).join("\n");
  assert.ok(!allSql.includes("SON-SIM-1"), "the simulator reference must not reach SQL");
  assert.ok(!allSql.includes("sim_1"));
  const quarantine = plan.json["simulated-financial.json"];
  assert.match(quarantine.warning, /Never import these as financial records/);
  assert.equal(quarantine.transactions.length, 1);
  assert.equal(quarantine.subscriptions.length, 1, "the subscription built on the simulator payment is quarantined with it");
  assert.equal(plan.json["subscriptions-review.json"].length, 0);
  assert.equal(plan.json["live-financial-review.json"].transactions.length, 1);
});

test("passwords, sessions, tokens and the development outbox never leave the store", () => {
  const plan = buildPlan(makeStore());
  const exported = JSON.stringify(plan.json);
  assert.ok(!exported.includes("scrypt$secret"));
  assert.ok(!exported.includes("sess_1"));
  assert.ok(!exported.includes("token=secret"));
  for (const skipped of ["sessions", "tokens", "outbox", "users.passwordHash"]) {
    assert.ok(plan.notMigrated.some((entry) => entry.collection === skipped), `${skipped} must be listed as not migrated`);
  }
  // The user record itself is exported, with the note to recreate via Auth.
  assert.match(plan.json["users.json"][0].note, /Supabase Auth/);
});

test("episode ordering is by season and number, and the free allowance is preserved", () => {
  const plan = buildPlan(makeStore());
  const sql = plan.sql.find((file) => file.name === "30_episodes.sql").body;
  const first = sql.indexOf("'first'");
  const second = sql.indexOf("'second'");
  assert.ok(first > 0 && second > first, "episode 1 must be inserted before episode 2");
  const seriesSql = plan.sql.find((file) => file.name === "20_series.sql").body;
  assert.match(seriesSql, /2, '\d{4}-\d{2}-\d{2}/, "free_episode_allowance 2 is carried over");
  assert.equal(episodeOrder({ season: 1, episodeNumber: 2 }, { season: 1, episodeNumber: 10 }), -8);
  assert.ok(episodeOrder({ season: null, episodeNumber: 1 }, { season: 1, episodeNumber: 1 }) > 0, "an unseasoned episode sorts after a numbered season");
});

test("external sources keep their exact URL and access overrides are written", () => {
  const plan = buildPlan(makeStore());
  const sources = plan.sql.find((file) => file.name === "40_sources.sql").body;
  assert.match(sources, /https:\/\/notebooklm\.google\.com\/notebook\/abc123/);
  const episodes = plan.sql.find((file) => file.name === "30_episodes.sql").body;
  assert.match(episodes, /'free'::public\.mc_access_override/);
  assert.match(episodes, /'ai_generated'::public\.mc_ai_disclosure/);
});

test("catalogue SQL is marked as requiring profiles first", () => {
  const plan = buildPlan(makeStore());
  const order = Object.fromEntries(plan.sql.map((file) => [file.name, file.requiresProfiles]));
  assert.equal(order["00_categories.sql"], false);
  assert.equal(order["10_plans.sql"], false);
  assert.equal(order["20_series.sql"], true);
  assert.equal(order["50_editorial.sql"], true);
});

test("SQL literals are escaped and null-safe", () => {
  assert.equal(sqlText("O'Brien"), "'O''Brien'");
  assert.equal(sqlText(null), "null");
  assert.equal(sqlText(undefined), "null");
});

test("the report counts every collection and names the files", () => {
  const store = makeStore();
  const plan = buildPlan(store);
  const report = renderReport({ source: "apps/web/.data/sonara-dev.json", generatedAt: "now", issues: validateStore(store), plan });
  assert.match(report, /# Sonara development-store migration report/);
  assert.match(report, /sql\/00_categories\.sql/);
  assert.match(report, /Simulator\/test transactions \| 1 \|/);
  assert.match(report, /never imported/);
  assert.match(report, /Deliberately not migrated/);
  assert.ok(idsOf(plan.sql[0].body).every((table) => table === "mc_categories"));
});

test("generated sample content and test-fixture accounts are excluded, not imported", () => {
  const store = makeStore();
  store.mcSeries[0].isSample = true;
  store.mcEpisodes.forEach((episode) => { episode.isSample = true; });
  store.users[0].email = "editor@example.test";
  // A synthetic approver must not block a plan that excludes the sample entirely.
  store.mcEpisodes[0].approvedBy = "local-cli";
  const plan = buildPlan(store);
  assert.equal(plan.quarantined.sampleEpisodes, 2);
  assert.equal(plan.quarantined.sampleUsers, 1);
  const catalogue = plan.sql.find((file) => file.name === "30_episodes.sql").body;
  assert.ok(!catalogue.includes("'first'"), "sample episodes must not reach SQL");
  assert.deepEqual(plan.json["users.json"], []);
  assert.ok(plan.notMigrated.some((entry) => entry.collection === "sample content"));
  assert.ok(plan.notMigrated.some((entry) => entry.collection === "test-fixture users"));
  assert.deepEqual(validateStore(store).filter((issue) => issue.severity === "error"), []);
});

test("the real human_produced disclosure is accepted", () => {
  const store = makeStore();
  store.mcEpisodes[1].aiDisclosure = "human_produced";
  assert.deepEqual(validateStore(store).filter((issue) => issue.severity === "error"), []);
  assert.match(buildPlan(store).sql.find((file) => file.name === "30_episodes.sql").body, /'human_produced'::public\.mc_ai_disclosure/);
});

test("an empty store produces a valid, empty plan rather than an error", () => {
  const store = makeStore({ mcEpisodes: [], mcSeries: [], mcVersions: [], mcEditorialEvents: [], transactions: [], subscriptions: [], users: [] });
  const plan = buildPlan(store);
  assert.equal(plan.quarantined.simulated, 0);
  assert.ok(plan.sql.every((file) => typeof file.body === "string"));
  assert.deepEqual(validateStore(store).filter((i) => i.severity === "error"), []);
});
