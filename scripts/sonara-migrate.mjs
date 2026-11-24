#!/usr/bin/env node
// =============================================================================
// Sonara — development-store migration planner (Wave 2 §10)
// =============================================================================
// Reads the local development JSON store, validates it, and produces:
//
//   report.md                  what will move, what will not, and why
//   report.json                the same data, machine-readable
//   sql/00_categories.sql      reference data, safe to run first
//   sql/10_plans.sql           plans (prices are placeholders unless approved)
//   sql/20_series.sql          catalogue (needs profiles for created_by)
//   sql/30_episodes.sql
//   sql/40_sources.sql
//   sql/50_editorial.sql       versions, editorial events, corrections
//   json/*.json                everything that must go through a reviewed,
//                              API-based import (users, subscriptions, payments…)
//
// Rules it enforces:
//   * IDs are preserved by mapping each local prefixed id to a deterministic
//     UUID (sha256 of kind + id). Re-running the planner yields the same UUIDs.
//   * Simulated financial activity is NEVER emitted as SQL. Every transaction
//     whose environment is "simulator" or "test" goes to
//     json/simulated-financial.json and is listed for a human decision.
//   * Password hashes, sessions, one-time tokens and the development outbox are
//     never exported. Users must be created through Supabase Auth (Admin API or
//     invitations) and must reset their password.
//   * Nothing is silently dropped: every collection in the store appears in the
//     report as migrated (SQL), exported (JSON), quarantined or deliberately
//     skipped, with a reason.
//
// Usage:
//   node scripts/sonara-migrate.mjs --data-dir apps/web/.data --out .tmp/migrate
//   node scripts/sonara-migrate.mjs --data-dir apps/web/.data --dry-run
//
// There is no "apply" mode. This tool never connects to a database.
// =============================================================================
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                */
/* -------------------------------------------------------------------------- */

/** Deterministic UUID (version 8 layout) for a local id, so references survive. */
export function stableUuid(kind, localId) {
  const hex = createHash("sha256").update(`sonara-migration:v1:${kind}:${localId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "8";
  hex[16] = "89ab"[parseInt(hex[16], 16) % 4];
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/* -------------------------------------------------------------------------- */
/* SQL helpers                                                                */
/* -------------------------------------------------------------------------- */

export function sqlText(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}
export function sqlBool(value) {
  return value ? "true" : "false";
}
export function sqlInt(value) {
  return value === null || value === undefined ? "null" : String(Math.trunc(Number(value)));
}
export function sqlJson(value) {
  if (value === null || value === undefined) return "'[]'::jsonb";
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}
export function sqlUuidArray(values) {
  if (!values || values.length === 0) return "'{}'::uuid[]";
  return `array[${values.map((v) => `${sqlText(v)}::uuid`).join(", ")}]::uuid[]`;
}
export function sqlTimestamp(value) {
  return value ? `${sqlText(value)}::timestamptz` : "null";
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** Collections we understand. Anything else is preserved verbatim in report. */
export const KNOWN_COLLECTIONS = [
  "users", "sessions", "tokens", "mcCategories", "mcSeries", "mcEpisodes", "mcVersions",
  "mcEditorialEvents", "mcCorrections", "media", "plans", "promos", "subscriptions",
  "transactions", "webhookEvents", "overrides", "refunds", "listening", "saved",
  "notifications", "outbox", "audit", "creatorApplications", "settings",
];

const SERIES_STATUS = new Set(["draft", "published", "archived"]);
const EPISODE_STATUS = new Set(["draft", "submitted", "in_review", "approved", "published", "withdrawn", "changes_requested", "rejected", "archived"]);
const SOURCE_KINDS = new Set(["notebooklm_link", "uploaded_audio", "authorised_url"]);
const AI_DISCLOSURE = new Set(["human_produced", "ai_assisted", "ai_generated"]);
const ACCESS_OVERRIDE = new Set(["inherit", "free", "premium"]);

export function readStore(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return normaliseStore(raw);
}

export function normaliseStore(raw) {
  const issues = [];
  if (!raw || typeof raw !== "object") {
    return { store: null, issues: [{ severity: "error", message: "the store is not an object" }], unknownKeys: [] };
  }
  if (raw.schemaVersion !== 1) {
    issues.push({ severity: "error", message: `schemaVersion ${String(raw.schemaVersion)} is not supported (expected 1)` });
    // Refuse rather than guess at an unknown shape.
    return { store: null, issues, unknownKeys: [] };
  }
  const store = {};
  for (const key of KNOWN_COLLECTIONS) {
    const value = raw[key];
    if (Array.isArray(value)) store[key] = value;
    else if (key === "settings" && value && typeof value === "object") store[key] = value;
    else if (value !== undefined) issues.push({ severity: "error", collection: key, message: "expected an array" });
    else store[key] = key === "settings" ? null : [];
  }
  const unknownKeys = Object.keys(raw).filter((key) => key !== "schemaVersion" && !KNOWN_COLLECTIONS.includes(key));
  for (const key of unknownKeys) issues.push({ severity: "warning", collection: key, message: "unmapped collection — preserved verbatim in the report, not migrated" });
  return { store, issues, unknownKeys };
}

const ids = (collection) => new Set(collection.map((record) => record.id).filter(Boolean));

export function validateStore(store) {
  const issues = [];
  const add = (severity, collection, id, message) => issues.push({ severity, collection, id, message });

  for (const key of KNOWN_COLLECTIONS) {
    if (!Array.isArray(store[key])) continue;
    const seen = new Set();
    for (const record of store[key]) {
      if (!record || typeof record !== "object") { add("error", key, null, "record is not an object"); continue; }
      // Tokens are keyed by their hash and saved entries by (user, episode).
      if (!record.id && key !== "saved" && key !== "tokens") { add("error", key, null, "record has no id"); continue; }
      if (record.id && seen.has(record.id)) add("error", key, record.id, "duplicate id");
      if (record.id) seen.add(record.id);
    }
  }

  const categoryIds = ids(store.mcCategories ?? []);
  const seriesIds = ids(store.mcSeries ?? []);
  const episodeIds = ids(store.mcEpisodes ?? []);
  const planIds = ids(store.plans ?? []);
  const transactionIds = ids(store.transactions ?? []);
  const mediaIds = ids(store.media ?? []);
  const userIds = ids(store.users ?? []);

  const seenSlugs = new Set();
  for (const series of store.mcSeries ?? []) {
    if (series.categoryId && !categoryIds.has(series.categoryId)) add("error", "mcSeries", series.id, `category ${series.categoryId} does not exist`);
    if (series.specialtyId && !categoryIds.has(series.specialtyId)) add("error", "mcSeries", series.id, `specialty ${series.specialtyId} does not exist`);
    if (!SERIES_STATUS.has(series.status)) add("error", "mcSeries", series.id, `unknown status ${series.status}`);
    if (series.status === "published" && !series.publishedAt) add("error", "mcSeries", series.id, "published series has no publishedAt");
    if (series.coverAssetId && !mediaIds.has(series.coverAssetId)) add("warning", "mcSeries", series.id, `cover asset ${series.coverAssetId} is missing — will be null`);
    if (series.createdBy && !userIds.has(series.createdBy)) add("warning", "mcSeries", series.id, `creator ${series.createdBy} is not in the store — created_by will be null`);
    if (seenSlugs.has(`series:${series.slug}`)) add("error", "mcSeries", series.id, `duplicate slug ${series.slug}`);
    seenSlugs.add(`series:${series.slug}`);
    for (const related of series.relatedSeriesIds ?? []) {
      if (!seriesIds.has(related)) add("warning", "mcSeries", series.id, `related series ${related} is missing — dropped from the array`);
    }
  }

  const sampleSeries = new Set((store.mcSeries ?? []).filter((s) => s.isSample).map((s) => s.id));
  const orderSeen = new Set();
  for (const episode of store.mcEpisodes ?? []) {
    const isSample = episode.isSample || sampleSeries.has(episode.seriesId);
    if (!seriesIds.has(episode.seriesId)) add("error", "mcEpisodes", episode.id, `series ${episode.seriesId} does not exist`);
    if (!EPISODE_STATUS.has(episode.status)) add("error", "mcEpisodes", episode.id, `unknown status ${episode.status}`);
    if (episode.status === "published" && !episode.publishedAt) add("error", "mcEpisodes", episode.id, "published episode has no publishedAt");
    // Sample content is generated test material and is never imported, so its
    // synthetic actor ("local-cli") is not treated as a missing approver.
    if (!isSample && episode.status === "published" && (!episode.approvedBy || !episode.approvedVersion)) add("error", "mcEpisodes", episode.id, "published episode has no approval recorded");
    if (!isSample && episode.approvedBy && episode.approvedBy === episode.submittedBy) add("error", "mcEpisodes", episode.id, "self-approval would violate mc_episodes_no_self_approval");
    if (episode.status === "withdrawn" && !episode.withdrawnAt) add("error", "mcEpisodes", episode.id, "withdrawn episode has no withdrawnAt");
    if (seenSlugs.has(`episode:${episode.slug}`)) add("error", "mcEpisodes", episode.id, `duplicate slug ${episode.slug}`);
    seenSlugs.add(`episode:${episode.slug}`);
    const orderKey = `${episode.seriesId}:${episode.season ?? "null"}:${episode.episodeNumber ?? "null"}`;
    if (episode.episodeNumber !== null && episode.episodeNumber !== undefined) {
      if (orderSeen.has(orderKey)) add("error", "mcEpisodes", episode.id, "duplicate (series, season, episode_number) — the database requires unique ordering");
      orderSeen.add(orderKey);
    }
    const source = episode.source;
    if (source) {
      if (!SOURCE_KINDS.has(source.kind)) add("error", "mcEpisodes", episode.id, `unknown source kind ${source.kind}`);
      if (source.kind === "uploaded_audio" && (!source.assetId || !mediaIds.has(source.assetId))) add("error", "mcEpisodes", episode.id, "uploaded source points at a missing asset");
      if (source.kind !== "uploaded_audio" && !/^https:\/\//.test(source.url ?? "")) add("error", "mcEpisodes", episode.id, "external source is not an https URL");
    }
    if (episode.aiDisclosure && !AI_DISCLOSURE.has(episode.aiDisclosure)) add("error", "mcEpisodes", episode.id, `unknown aiDisclosure ${episode.aiDisclosure}`);
    if (episode.accessOverride && !ACCESS_OVERRIDE.has(episode.accessOverride)) add("error", "mcEpisodes", episode.id, `unknown accessOverride ${episode.accessOverride}`);
    for (const person of ["createdBy", "submittedBy", "lastEditedBy", "approvedBy", "lastReviewedBy"]) {
      if (episode[person] && !userIds.has(episode[person])) add("warning", "mcEpisodes", episode.id, `${person} ${episode[person]} is not in the store — column will be null`);
    }
    for (const related of episode.relatedEpisodeIds ?? []) {
      if (!episodeIds.has(related)) add("warning", "mcEpisodes", episode.id, `related episode ${related} is missing — dropped from the array`);
    }
  }

  const versionSeen = new Set();
  for (const version of store.mcVersions ?? []) {
    if (!episodeIds.has(version.episodeId)) add("error", "mcVersions", version.id, "episode does not exist");
    const key = `${version.episodeId}:${version.version}`;
    if (versionSeen.has(key)) add("error", "mcVersions", version.id, "duplicate episode version number");
    versionSeen.add(key);
  }

  const txRefs = new Set();
  for (const tx of store.transactions ?? []) {
    if (txRefs.has(tx.txRef)) add("error", "transactions", tx.id, `duplicate txRef ${tx.txRef}`);
    txRefs.add(tx.txRef);
    if (!planIds.has(tx.planId)) add("warning", "transactions", tx.id, `plan ${tx.planId} is missing`);
    if (tx.userId && !userIds.has(tx.userId)) add("error", "transactions", tx.id, "user does not exist in the store");
  }

  for (const sub of store.subscriptions ?? []) {
    if (!planIds.has(sub.planId)) add("error", "subscriptions", sub.id, `plan ${sub.planId} is missing`);
    for (const txId of sub.appliedTransactionIds ?? []) {
      if (!transactionIds.has(txId)) add("warning", "subscriptions", sub.id, `applied transaction ${txId} is missing`);
    }
  }

  for (const plan of store.plans ?? []) {
    if (!Number.isInteger(plan.amount) || plan.amount <= 0) add("error", "plans", plan.id, "amount must be a positive integer in minor units");
    if (!plan.priceIsPlaceholder) add("warning", "plans", plan.id, "price is marked approved — confirm against the owner's decision register before importing");
  }

  const seenEmails = new Set();
  for (const user of store.users ?? []) {
    const email = (user.email ?? "").toLowerCase();
    if (!email) add("error", "users", user.id, "missing email");
    if (seenEmails.has(email)) add("error", "users", user.id, `duplicate email ${email}`);
    seenEmails.add(email);
    if (user.passwordHash) add("info", "users", user.id, "password hash is intentionally not exported — the account must be created through Supabase Auth and reset its password");
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

const byKey = (a, b) => String(a).localeCompare(String(b));

/** Season/episode ordering: published order is what the free allowance counts. */
export function episodeOrder(a, b) {
  const season = (a.season ?? Number.MAX_SAFE_INTEGER) - (b.season ?? Number.MAX_SAFE_INTEGER);
  if (season !== 0) return season;
  const number = (a.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (b.episodeNumber ?? Number.MAX_SAFE_INTEGER);
  if (number !== 0) return number;
  return byKey(a.createdAt ?? "", b.createdAt ?? "");
}

export function buildPlan(store) {
  const userMap = new Map((store.users ?? []).map((user) => [user.id, stableUuid("profile", user.id)]));
  const categoryMap = new Map((store.mcCategories ?? []).map((c) => [c.id, stableUuid("mc_category", c.id)]));
  const seriesMap = new Map((store.mcSeries ?? []).map((s) => [s.id, stableUuid("mc_series", s.id)]));
  const episodeMap = new Map((store.mcEpisodes ?? []).map((e) => [e.id, stableUuid("mc_episode", e.id)]));
  const mediaMap = new Map((store.media ?? []).map((m) => [m.id, stableUuid("media_asset", m.id)]));
  const planMap = new Map((store.plans ?? []).map((p) => [p.id, stableUuid("plan", p.id)]));

  const person = (id) => (id && userMap.get(id)) || null;
  const media = (id) => (id && mediaMap.get(id)) || null;
  const relatedSeries = (list) => (list ?? []).map((id) => seriesMap.get(id)).filter(Boolean);
  const relatedEpisodes = (list) => (list ?? []).map((id) => episodeMap.get(id)).filter(Boolean);

  const categories = [...(store.mcCategories ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  // Generated sample content (test tones, demo series) is never imported: it
  // would become real catalogue with a synthetic approver.
  const sampleSeriesIds = new Set((store.mcSeries ?? []).filter((s) => s.isSample).map((s) => s.id));
  const allEpisodes = store.mcEpisodes ?? [];
  const series = [...(store.mcSeries ?? [])].filter((s) => !s.isSample).sort((a, b) => byKey(a.slug, b.slug));
  const episodes = allEpisodes
    .filter((e) => !e.isSample && !sampleSeriesIds.has(e.seriesId))
    .sort((a, b) => byKey(a.seriesId, b.seriesId) || episodeOrder(a, b));
  const sampleEpisodes = allEpisodes.length - episodes.length;
  const sampleUsers = (store.users ?? []).filter((user) => /\.test$/i.test(user.email ?? ""));
  const realUsers = (store.users ?? []).filter((user) => !sampleUsers.includes(user));
  const plans = [...(store.plans ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const categoriesSql = [
    "-- Sonara migration: Medical Chronicles categories.",
    "-- Generated by scripts/sonara-migrate.mjs — review before running. Safe to run first:",
    "-- it references no profiles and no media.",
    "",
    ...categories.map((c) =>
      `insert into public.mc_categories (id, slug, name, description, kind, sort_order, is_active, created_at, updated_at)\n` +
      `values (${sqlText(categoryMap.get(c.id))}::uuid, ${sqlText(c.slug)}, ${sqlText(c.name)}, ${sqlText(c.description ?? "")}, ${sqlText(c.kind)}, ${sqlInt(c.sortOrder)}, ${sqlBool(c.isActive)}, ${sqlTimestamp(c.createdAt)}, ${sqlTimestamp(c.updatedAt)})\n` +
      `on conflict (id) do nothing;`,
    ),
    "",
  ].join("\n");

  const plansSql = [
    "-- Sonara migration: subscription plans.",
    "-- amount is integer minor units (UGX has no minor unit, so 1 = UGX 1).",
    "-- price_is_placeholder is carried over: do not flip it without the owner's price decision.",
    "",
    ...plans.map((p) =>
      `insert into public.subscription_plans (id, audience, code, name, description, interval, amount, currency, is_active, trial_days, features, creator_limits, price_is_placeholder, sort_order)\n` +
      `values (${sqlText(planMap.get(p.id))}::uuid, ${sqlText(p.audience)}, ${sqlText(p.code)}, ${sqlText(p.name)}, ${sqlText(p.description ?? "")}, ${sqlText(p.interval)}, ${sqlInt(p.amount)}, ${sqlText(p.currency)}, ${sqlBool(p.active)}, ${sqlInt(p.trialDays ?? 0)}, ${sqlJson(p.features ?? [])}, ${p.creatorLimits ? sqlJson(p.creatorLimits) : "null"}, ${sqlBool(p.priceIsPlaceholder)}, ${sqlInt(p.sortOrder)})\n` +
      `on conflict (id) do nothing;`,
    ),
    "",
  ].join("\n");

  const seriesSql = [
    "-- Sonara migration: Medical Chronicles series.",
    "-- REQUIRES: profiles already exist (created_by is a foreign key), otherwise",
    "-- the insert fails. created_by is null when the author was not in the store.",
    "",
    ...series.map((s) =>
      `insert into public.mc_series (id, slug, title, description, cover_asset_id, category_id, specialty_id, editor_display, host_display, status, requires_subscription, free_episode_allowance, published_at, seo_title, seo_description, related_series_ids, created_by, created_at, updated_at)\n` +
      `values (${sqlText(seriesMap.get(s.id))}::uuid, ${sqlText(s.slug)}, ${sqlText(s.title)}, ${sqlText(s.description ?? "")}, ${media(s.coverAssetId) ? `${sqlText(media(s.coverAssetId))}::uuid` : "null"}, ${categoryMap.get(s.categoryId) ? `${sqlText(categoryMap.get(s.categoryId))}::uuid` : "null"}, ${categoryMap.get(s.specialtyId) ? `${sqlText(categoryMap.get(s.specialtyId))}::uuid` : "null"}, ${sqlText(s.editorDisplay)}, ${sqlText(s.hostDisplay)}, ${sqlText(s.status)}, ${sqlBool(s.requiresSubscription)}, ${sqlInt(s.freeEpisodeAllowance)}, ${sqlTimestamp(s.publishedAt)}, ${sqlText(s.seoTitle ?? "")}, ${sqlText(s.seoDescription ?? "")}, ${sqlUuidArray(relatedSeries(s.relatedSeriesIds))}, ${person(s.createdBy) ? `${sqlText(person(s.createdBy))}::uuid` : "null"}, ${sqlTimestamp(s.createdAt)}, ${sqlTimestamp(s.updatedAt)})\n` +
      `on conflict (id) do nothing;`,
    ),
    "",
  ].join("\n");

  const episodesSql = [
    "-- Sonara migration: Medical Chronicles episodes.",
    "-- Ordering columns (season, episode_number) are preserved exactly: the free",
    "-- allowance is computed from publication order, so a changed number changes",
    "-- who can listen for free.",
    "",
    ...episodes.map((e) =>
      `insert into public.mc_episodes (id, series_id, slug, title, description, season, episode_number, cover_asset_id, duration_seconds, transcript, content_notes, reference_list, ai_disclosure, access_override, download_allowed, status, version, submitted_by, submitted_at, last_edited_by, approved_version, approved_by, approved_at, published_at, withdrawn_at, withdrawn_reason, last_reviewed_at, last_reviewed_by, related_episode_ids, created_by, created_at, updated_at)\n` +
      `values (${sqlText(episodeMap.get(e.id))}::uuid, ${sqlText(seriesMap.get(e.seriesId))}::uuid, ${sqlText(e.slug)}, ${sqlText(e.title)}, ${sqlText(e.description ?? "")}, ${sqlInt(e.season)}, ${sqlInt(e.episodeNumber)}, ${media(e.coverAssetId) ? `${sqlText(media(e.coverAssetId))}::uuid` : "null"}, ${sqlInt(e.durationSeconds)}, ${sqlText(e.transcript ?? "")}, ${sqlText(e.contentNotes ?? "")}, ${sqlJson(e.references ?? [])}, ${e.aiDisclosure ? `${sqlText(e.aiDisclosure)}::public.mc_ai_disclosure` : "null"}, ${sqlText(e.accessOverride ?? "inherit")}::public.mc_access_override, ${sqlBool(e.downloadAllowed)}, ${sqlText(e.status)}::public.mc_editorial_status, ${sqlInt(e.version ?? 1)}, ${person(e.submittedBy) ? `${sqlText(person(e.submittedBy))}::uuid` : "null"}, ${sqlTimestamp(e.submittedAt)}, ${person(e.lastEditedBy) ? `${sqlText(person(e.lastEditedBy))}::uuid` : "null"}, ${sqlInt(e.approvedVersion)}, ${person(e.approvedBy) ? `${sqlText(person(e.approvedBy))}::uuid` : "null"}, ${sqlTimestamp(e.approvedAt)}, ${sqlTimestamp(e.publishedAt)}, ${sqlTimestamp(e.withdrawnAt)}, ${sqlText(e.withdrawnReason)}, ${sqlTimestamp(e.lastReviewedAt)}, ${person(e.lastReviewedBy) ? `${sqlText(person(e.lastReviewedBy))}::uuid` : "null"}, ${sqlUuidArray(relatedEpisodes(e.relatedEpisodeIds))}, ${person(e.createdBy) ? `${sqlText(person(e.createdBy))}::uuid` : "null"}, ${sqlTimestamp(e.createdAt)}, ${sqlTimestamp(e.updatedAt)})\n` +
      `on conflict (id) do nothing;`,
    ),
    "",
  ].join("\n");

  const sourcesSql = [
    "-- Sonara migration: episode audio sources.",
    "-- External links keep their exact URL. NotebookLM links are not fetched or",
    "-- scraped; the provider's own sharing rules still apply.",
    "",
    ...episodes.filter((e) => e.source).map((e) => {
      const s = e.source;
      return `insert into public.mc_episode_sources (episode_id, kind, url, asset_id, provider_ref, status, status_note, checked_at, created_by, updated_at)\n` +
        `values (${sqlText(episodeMap.get(e.id))}::uuid, ${sqlText(s.kind)}::public.mc_source_kind, ${s.url ? sqlText(s.url) : "null"}, ${s.assetId && media(s.assetId) ? `${sqlText(media(s.assetId))}::uuid` : "null"}, null, ${sqlText(s.status)}::public.mc_source_status, ${sqlText(s.statusNote ?? "")}, ${sqlTimestamp(s.checkedAt)}, ${person(e.createdBy) ? `${sqlText(person(e.createdBy))}::uuid` : "null"}, ${sqlTimestamp(s.updatedAt)})\n` +
        `on conflict (episode_id) do nothing;`;
    }),
    "",
  ].join("\n");

  const editorialSql = [
    "-- Sonara migration: episode versions, editorial events and corrections.",
    "-- REQUIRES: profiles and episodes exist. Identity numbers from the dev store",
    "-- are kept in the version snapshot so no history is rewritten.",
    "",
    ...(store.mcVersions ?? []).map((v) =>
      `insert into public.mc_episode_versions (episode_id, version, snapshot, change_note, edited_by, created_at)\n` +
      `values (${sqlText(episodeMap.get(v.episodeId))}::uuid, ${sqlInt(v.version)}, ${sqlJson(v.snapshot)}, ${sqlText(v.changeNote ?? "")}, ${person(v.editedBy) ? `${sqlText(person(v.editedBy))}::uuid` : "null"}, ${sqlTimestamp(v.createdAt)})\n` +
      `on conflict (episode_id, version) do nothing;`,
    ),
    ...(store.mcEditorialEvents ?? []).map((ev) =>
      `insert into public.mc_editorial_events (episode_id, actor_id, action, from_status, to_status, version, note, created_at)\n` +
      `values (${sqlText(episodeMap.get(ev.episodeId))}::uuid, ${person(ev.actorId) ? `${sqlText(person(ev.actorId))}::uuid` : "null"}, ${sqlText(ev.action)}, ${sqlText(ev.fromStatus)}::public.mc_editorial_status, ${sqlText(ev.toStatus)}::public.mc_editorial_status, ${sqlInt(ev.version)}, ${sqlText(ev.note ?? "")}, ${sqlTimestamp(ev.createdAt)});`,
    ),
    ...(store.mcCorrections ?? []).map((c) =>
      `insert into public.mc_corrections (id, episode_id, version, summary, corrected_by, created_at)\n` +
      `values (${sqlText(stableUuid("mc_correction", c.id))}::uuid, ${sqlText(episodeMap.get(c.episodeId))}::uuid, ${sqlInt(c.version)}, ${sqlText(c.summary)}, ${person(c.correctedBy) ? `${sqlText(person(c.correctedBy))}::uuid` : "null"}, ${sqlTimestamp(c.createdAt)})\n` +
      `on conflict (id) do nothing;`,
    ),
    "",
  ].join("\n");

  /* Financial activity ------------------------------------------------------ */
  const allTransactions = store.transactions ?? [];
  const simulated = allTransactions.filter((tx) => tx.environment !== "live");
  const real = allTransactions.filter((tx) => tx.environment === "live");
  const simulatedIds = new Set(simulated.map((tx) => tx.id));
  const simulatedSubscriptions = (store.subscriptions ?? []).filter((sub) =>
    (sub.appliedTransactionIds ?? []).some((id) => simulatedIds.has(id)) || (sub.providerSubscriptionId ?? "").startsWith("sim_"));
  const reviewSubscriptions = (store.subscriptions ?? []).filter((sub) => !simulatedSubscriptions.includes(sub));

  const json = {
    "users.json": realUsers.map((user) => ({
      localId: user.id,
      targetProfileId: userMap.get(user.id),
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      roles: user.roles,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
      termsAcceptedAt: user.termsAcceptedAt,
      country: user.country,
      locale: user.locale,
      createdAt: user.createdAt,
      // Deliberately absent: passwordHash, sessions, tokens.
      note: "Create this person through Supabase Auth (invite or admin createUser), then set the profile row to this target id. They must set a password.",
    })),
    "creator-applications.json": (store.creatorApplications ?? []).map((app) => ({ ...app, targetId: stableUuid("creator_application", app.id), targetUserId: searchUser(userMap, app.userId), targetReviewedBy: searchUser(userMap, app.reviewedBy) })),
    "media-manifest.json": (store.media ?? []).map((asset) => ({
      localId: asset.id,
      targetId: mediaMap.get(asset.id),
      kind: asset.kind,
      mime: asset.mime,
      bytes: asset.bytes,
      sha256: asset.sha256,
      originalName: asset.originalName,
      uploadedBy: searchUser(userMap, asset.uploadedBy),
      createdAt: asset.createdAt,
      note: "The file is on local disk. Upload it to object storage first, verify its SHA-256, then register the asset with this id.",
    })),
    "subscriptions-review.json": reviewSubscriptions.map((sub) => ({ ...sub, targetId: stableUuid("subscription", sub.id), targetPlanId: planMap.get(sub.planId), targetUserId: searchUser(userMap, sub.userId) })),
    "simulated-financial.json": {
      warning: "DEVELOPMENT SIMULATOR RECORDS. Never import these as financial records. They moved no money and prove nothing. Keep them only as an archive of what was demonstrated.",
      subscriptions: simulatedSubscriptions.map((sub) => ({ ...sub, targetId: stableUuid("subscription", sub.id) })),
      transactions: simulated.map((tx) => ({ ...tx, targetId: stableUuid("payment_transaction", tx.id), targetPlanId: planMap.get(tx.planId), targetUserId: searchUser(userMap, tx.userId) })),
      webhookEvents: store.webhookEvents ?? [],
    },
    "live-financial-review.json": {
      warning: "Transactions marked environment=live. Confirm each one against the provider dashboard before importing; none are imported automatically.",
      transactions: real.map((tx) => ({ ...tx, targetId: stableUuid("payment_transaction", tx.id) })),
      refunds: (store.refunds ?? []).map((r) => ({ ...r, targetId: stableUuid("refund", r.id) })),
      overrides: (store.overrides ?? []).map((o) => ({ ...o, targetUserId: searchUser(userMap, o.userId ?? o.profileId), targetCreatedBy: searchUser(userMap, o.createdBy) })),
    },
    "notifications.json": (store.notifications ?? []).map((n) => ({ ...n, targetId: stableUuid("notification", n.id), targetUserId: searchUser(userMap, n.userId) })),
    "listening-history.json": {
      note: "Listening history references episodes; import only after the catalogue is in place. Provider-controlled playback has no reliable position and is exported as-is.",
      entries: (store.listening ?? []).map((entry) => ({ ...entry, targetUserId: searchUser(userMap, entry.userId), targetEpisodeId: episodeMap.get(entry.episodeId) ?? null })),
      saved: (store.saved ?? []).map((entry) => ({ ...entry, targetUserId: searchUser(userMap, entry.userId), targetEpisodeId: episodeMap.get(entry.episodeId) ?? null })),
    },
    "audit-archive.json": {
      note: "The development audit chain cannot be appended to the production chain. Keep this as an archive; production audit starts empty and records every action from then on.",
      records: (store.audit ?? []).map((record) => ({ ...record })),
    },
    "promo-codes.json": (store.promos ?? []).map((promo) => ({ ...promo, targetId: stableUuid("promo", promo.id), targetPlanIds: (promo.planIds ?? []).map((id) => planMap.get(id)).filter(Boolean) })),
    "settings.json": store.settings,
    "unknown-collections.json": store.__unknown ?? [],
  };

  const notMigrated = [
    ...(sampleEpisodes > 0 || (store.mcSeries ?? []).length !== series.length
      ? [{ collection: "sample content", reason: `${sampleEpisodes} sample episode(s) and their series are generated test material (is_sample) with a synthetic approver. Never imported; create real content instead.` }]
      : []),
    ...(sampleUsers.length > 0
      ? [{ collection: "test-fixture users", reason: `${sampleUsers.length} account(s) on *.test addresses are test fixtures. Excluded from users.json so they cannot become real accounts.` }]
      : []),
    { collection: "sessions", reason: "Security: cookies are meaningless on a new deployment and must never be replayed." },
    { collection: "tokens", reason: "One-time verification/reset token hashes are intentionally discarded." },
    { collection: "outbox", reason: "Development email outbox. It is not a delivery record; production email starts empty." },
    { collection: "users.passwordHash", reason: "Portable password hashes are not a supported Supabase Auth import path. Accounts are re-created and reset." },
  ];

  const counts = Object.fromEntries(
    KNOWN_COLLECTIONS.map((key) => [key, Array.isArray(store[key]) ? store[key].length : store[key] ? 1 : 0]),
  );

  return {
    counts,
    idMaps: { users: userMap, categories: categoryMap, series: seriesMap, episodes: episodeMap, plans: planMap, media: mediaMap },
    sql: [
      { name: "00_categories.sql", body: categoriesSql, requiresProfiles: false },
      { name: "10_plans.sql", body: plansSql, requiresProfiles: false },
      { name: "20_series.sql", body: seriesSql, requiresProfiles: true },
      { name: "30_episodes.sql", body: episodesSql, requiresProfiles: true },
      { name: "40_sources.sql", body: sourcesSql, requiresProfiles: true },
      { name: "50_editorial.sql", body: editorialSql, requiresProfiles: true },
    ],
    json,
    quarantined: { simulated: simulated.length, simulatedSubscriptions: simulatedSubscriptions.length, liveReview: real.length, sampleEpisodes, sampleUsers: sampleUsers.length },
    notMigrated,
  };
}

function searchUser(map, localId) {
  return localId ? map.get(localId) ?? null : null;
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

export function renderReport({ source, generatedAt, issues, plan }) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  const rows = Object.entries(plan.counts).map(([key, count]) => `| ${key} | ${count} |`).join("\n");
  const files = plan.sql.map((file) => `| \`sql/${file.name}\` | ${file.requiresProfiles ? "after profiles exist" : "safe first"} |`).join("\n");
  const skipped = plan.notMigrated.map((entry) => `- **${entry.collection}** — ${entry.reason}`).join("\n");
  const issueList = (list) => (list.length === 0 ? "_none_" : list.slice(0, 200).map((i) => `- ${i.collection ?? ""}${i.id ? ` \`${i.id}\`` : ""}: ${i.message}`).join("\n"));

  return `# Sonara development-store migration report

- **Source:** \`${source}\`
- **Generated:** ${generatedAt}
- **Mode:** plan only. Nothing was written to any database, and this tool has no mode that does.
- **Validation:** ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} note(s)

## Record counts

| Collection | Records |
|---|---|
${rows}

## SQL to review and run

| File | Order |
|---|---|
${files}

All inserts use deterministic UUIDs derived from the local ids (\`sha256("sonara-migration:v1:<kind>:<id>")\`), so
series → episode references, ordering columns and editorial history survive the move. Re-running the planner
produces identical ids. Category and plan inserts are independent; the catalogue needs profiles first.

## Financial activity — quarantined

| Kind | Records | Handling |
|---|---|---|
| Simulator/test transactions | ${plan.quarantined.simulated} | \`json/simulated-financial.json\` — **archive only, never imported** |
| Subscriptions built on those transactions | ${plan.quarantined.simulatedSubscriptions} | quarantined with them |
| Transactions marked live | ${plan.quarantined.liveReview} | \`json/live-financial-review.json\` — verify against the provider dashboard first |

A simulator transaction moved no money. Importing one would fabricate a payment history and could grant access
that was never paid for, so none is converted into a financial record.

## Deliberately not migrated

${skipped}

## Errors (blocking)

${issueList(errors)}

## Warnings

${issueList(warnings)}

## Notes

${issueList(infos)}

## Manual steps that cannot be SQL

1. Create the Supabase project (docs/SONARA_SUPABASE_SETUP.md), apply \`supabase/migrations\`, then \`pnpm test:db\`.
2. Create each user in \`json/users.json\` through Supabase Auth (Admin API or invitation). Copy the returned
   user id into the target profile row using \`targetProfileId\`. They set a new password.
3. Grant staff roles with the audited \`app_private.grant_platform_role\` RPC — never by editing metadata.
4. Upload media from \`json/media-manifest.json\` to object storage, verify SHA-256, then register the asset.
5. Run the SQL in order, then the JSON imports, then reconcile: \`select count(*) from public.mc_episodes\` must
   equal the episode count above.
`;
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const args = { dataDir: "apps/web/.data", out: ".tmp/sonara-migration", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

export function run(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.dataDir) {
    console.log("usage: node scripts/sonara-migrate.mjs [--data-dir DIR] [--out DIR] [--dry-run]");
    return 0;
  }
  const file = join(args.dataDir, "sonara-dev.json");
  let raw;
  try {
    raw = readStore(file);
  } catch (error) {
    console.error(`Cannot read ${file}: ${error.message}`);
    console.error("Start the dev backend once (or run the seed) to create the store, or pass --data-dir.");
    return 2;
  }
  const { store, issues } = raw;
  if (!store) {
    console.error("The store is unreadable; nothing planned.");
    return 1;
  }
  issues.push(...validateStore(store));
  const plan = buildPlan(store);
  const generatedAt = new Date().toISOString();
  const report = renderReport({ source: file, generatedAt, issues, plan });
  const errors = issues.filter((i) => i.severity === "error");

  if (args.dryRun) {
    console.log(report);
    return errors.length > 0 ? 1 : 0;
  }

  mkdirSync(join(args.out, "sql"), { recursive: true });
  mkdirSync(join(args.out, "json"), { recursive: true });
  for (const entry of plan.sql) writeFileSync(join(args.out, "sql", entry.name), entry.body);
  for (const [name, body] of Object.entries(plan.json)) writeFileSync(join(args.out, "json", name), JSON.stringify(body, null, 2));
  writeFileSync(join(args.out, "report.md"), report);
  writeFileSync(join(args.out, "report.json"), JSON.stringify({ source: file, generatedAt, counts: plan.counts, quarantined: plan.quarantined, notMigrated: plan.notMigrated, issues }, null, 2));

  console.log(`Planned ${Object.values(plan.counts).reduce((total, count) => total + count, 0)} records.`);
  console.log(`Report: ${join(args.out, "report.md")}`);
  if (errors.length > 0) {
    console.error(`${errors.length} blocking error(s) — see the report. Nothing should be imported until they are fixed.`);
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = run(process.argv.slice(2));
}
