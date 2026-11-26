/**
 * Supabase storage adapter: loads the rows a service needs into the shared
 * record shapes, and persists what the service changed.
 *
 *  - Reads run as the scope's identity, so RLS decides what is visible.
 *  - Writes diff "before" and "after" per collection and run as the scope's
 *    identity for caller-owned tables (RLS, column grants and triggers decide),
 *    or elevate to service_role for system tables (audit, notifications,
 *    payments, media registration) — reached only after the service authorised
 *    the action.
 *  - Role changes and entitlement overrides by a signed-in staff member go
 *    through the audited RPCs, so the database applies its own rules too.
 *  - Any database refusal (RLS, privilege, trigger, constraint) aborts the whole
 *    transaction and surfaces as an AccessError or CommandError.
 */
import { staffCan } from "@kito/auth";
import { normaliseStudySet } from "@kito/chronicles";
import type { PlatformRole } from "@kito/types";
import type { Viewer } from "../auth.ts";
import { AccessError, CommandError } from "../errors.ts";
import type { DataShape, OutboxEmail, PlatformSettings, UserRecord } from "../types.ts";
import { COLLECTIONS, SETTING_KEYS, type CollectionDef, type CollectionName } from "./collections.ts";
import { optionalQuery, pgCode, withAnon, withService, withUser, type Db } from "./db.ts";

export type Identity = { as: "anon" } | { as: "user"; viewer: Viewer } | { as: "service"; reason: string };
/**
 * `system: true` reads the rows as the platform (RLS bypassed). Used only for
 * display data the caller's role legitimately needs but cannot select itself
 * (e.g. reviewer names, other users' reminder notifications for a billing job).
 */
export type Filter = true | { where: string; params?: unknown[]; system?: boolean };
export type Load = Partial<Record<CollectionName, Filter>>;
export type Scope = Identity & { load: Load; lock?: boolean };

export const emptyData = (settings: PlatformSettings): DataShape => ({
  schemaVersion: 1,
  users: [],
  sessions: [],
  tokens: [],
  mcCategories: [],
  mcSeries: [],
  mcEpisodes: [],
  mcVersions: [],
  mcEditorialEvents: [],
  mcCorrections: [],
  media: [],
  plans: [],
  promos: [],
  subscriptions: [],
  transactions: [],
  webhookEvents: [],
  overrides: [],
  refunds: [],
  listening: [],
  saved: [],
  notifications: [],
  outbox: [],
  audit: [],
  creatorApplications: [],
  settings,
});

const DEFAULT_SETTINGS: PlatformSettings = {
  defaultFreeEpisodeAllowance: 2,
  freeRequiresAccount: false,
  graceDays: 3,
  trialsEnabled: false,
  defaultCurrency: "UGX",
  livePaymentsEnabled: false,
  maintenanceMode: false,
  regions: ["UG"],
  authorisedAudioHosts: [],
  termsVersion: "2026-11-draft",
  privacyVersion: "2026-11-draft",
};

async function loadSettings(db: Db): Promise<PlatformSettings> {
  const { rows } = await db.query("select key, value from public.platform_settings");
  const byKey = new Map(rows.map((r) => [String(r.key), r.value]));
  const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const [field, key] of Object.entries(SETTING_KEYS)) if (byKey.has(key)) settings[field] = byKey.get(key);
  return settings as PlatformSettings;
}

/* --------------------------------------------------------------------- roles */

async function elevate<T>(db: Db, identity: Identity, fn: () => Promise<T>): Promise<T> {
  if (identity.as === "service") return fn();
  await db.query("set local role service_role");
  try {
    return await fn();
  } finally {
    await db.query(`set local role ${identity.as === "user" ? "authenticated" : "anon"}`);
  }
}

const canReadSources = (identity: Identity) => identity.as === "service" || (identity.as === "user" && staffCan(identity.viewer.roles, "chronicles:edit"));

/* ---------------------------------------------------------------------- load */

async function loadCollection<T>(db: Db, def: CollectionDef<T>, filter: Filter, lock: boolean): Promise<T[]> {
  const where = filter === true ? "" : ` where ${filter.where}`;
  const params = filter === true ? [] : (filter.params ?? []);
  const from = def.table === "profiles" ? "public.profiles t join auth.users u on u.id = t.id" : `public.${def.table} t`;
  const forUpdate = lock && def.table !== "profiles" ? " for update of t" : "";
  const { rows } = await db.query(`select ${def.select} from ${from}${where}${forUpdate}`, params);
  return rows.map((r) => def.fromRow(r));
}

async function attachSources(db: Db, identity: Identity, episodes: DataShape["mcEpisodes"]): Promise<void> {
  if (episodes.length === 0) return;
  const ids = episodes.map((e) => e.id);
  if (canReadSources(identity)) {
    const { rows } = await db.query("select * from public.mc_episode_sources where episode_id = any($1::uuid[])", [ids]);
    const map = new Map(rows.map((r) => [String(r.episode_id), r]));
    for (const e of episodes) {
      const r = map.get(e.id);
      e.source = r ? { kind: r.kind, url: r.url ?? null, assetId: r.asset_id ?? null, status: r.status, statusNote: r.status_note ?? "", checkedAt: r.checked_at ? new Date(r.checked_at).toISOString() : null, updatedAt: new Date(r.updated_at).toISOString() } : null;
    }
    const study =
      (await optionalQuery(db, "select episode_id, flashcards, quiz, notes_md from public.mc_episode_study where episode_id = any($1::uuid[])", [ids])) ??
      (await optionalQuery(db, "select episode_id, flashcards, quiz from public.mc_episode_study where episode_id = any($1::uuid[])", [ids]));
    const studyMap = new Map((study?.rows ?? []).map((r) => [String(r.episode_id), r]));
    for (const e of episodes) {
      const r = studyMap.get(e.id);
      e.study = r ? normaliseStudySet({ flashcards: r.flashcards, quiz: r.quiz, notes: r.notes_md ?? "" }) : null;
    }
    return;
  }
  // Listeners see the kind and availability only; the location comes from mc_episode_playback().
  const { rows } = await db.query("select * from public.mc_public_source_info()");
  const map = new Map(rows.map((r) => [String(r.episode_id), r]));
  for (const e of episodes) {
    const r = map.get(e.id);
    e.source = r ? { kind: r.kind, url: null, assetId: null, status: r.status, statusNote: r.status_note ?? "", checkedAt: null, updatedAt: e.updatedAt } : null;
  }
}

export async function loadData(db: Db, identity: Identity, load: Load, lock = false): Promise<DataShape> {
  const data = emptyData(await loadSettings(db));
  for (const [name, filter] of Object.entries(load) as [CollectionName, Filter][]) {
    if (!filter) continue;
    const def = COLLECTIONS[name] as CollectionDef<unknown>;
    // Emails live in auth.users and media metadata is platform-registered: read as the platform.
    const system = name === "users" || name === "media" || (filter !== true && filter.system === true);
    const rows = system ? await elevate(db, identity, () => loadCollection(db, def, filter, lock && name !== "users")) : await loadCollection(db, def, filter, lock);
    (data as unknown as Record<string, unknown[]>)[name] = rows;
  }
  if (load.mcEpisodes) await attachSources(db, identity, data.mcEpisodes);
  return data;
}

/* ------------------------------------------------------------------- persist */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stable = (v: unknown) => JSON.stringify(v);

function translate(error: unknown): never {
  const code = pgCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (code === "42501" || /row-level security|permission denied/i.test(message)) throw new AccessError(`database refused: ${message}`);
  if (code === "23505") throw new CommandError("That already exists (it must be unique).");
  if (code === "23514" || code === "23503" || code === "22P02" || code === "P0001" || code === "23502") throw new CommandError(message.replace(/^.*?: /, ""));
  throw error;
}

async function exec(db: Db, sql: string, params: unknown[], expectRow = false): Promise<number> {
  try {
    const result = await db.query(sql, params);
    if (expectRow && result.rowCount === 0) throw new AccessError(`database refused: no row affected (${sql.slice(0, 60)}…)`);
    return result.rowCount ?? 0;
  } catch (error) {
    if (error instanceof AccessError) throw error;
    translate(error);
  }
}

function keyWhere(def: CollectionDef<unknown>, item: unknown, offset: number): { sql: string; params: unknown[] } {
  const cols = def.key.split(",");
  if (cols.length === 1) return { sql: `${cols[0]} = $${offset}`, params: [def.idOf(item)] };
  const row = def.toRow!(item);
  return { sql: cols.map((c, i) => `${c} = $${offset + i}`).join(" and "), params: cols.map((c) => row[c]) };
}

async function insertRow(db: Db, def: CollectionDef<unknown>, item: unknown): Promise<void> {
  const row = { ...def.toRow!(item) };
  for (const col of def.insertOmit ?? []) delete row[col];
  // Identity-keyed tables generate their own ids.
  if (def.table === "mc_episode_versions" || def.table === "mc_editorial_events") delete row.id;
  const cols = Object.keys(row);
  await exec(db, `insert into public.${def.table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c]));
}

async function updateRow(db: Db, def: CollectionDef<unknown>, before: unknown, after: unknown): Promise<void> {
  const a = def.toRow!(after);
  const b = def.toRow!(before);
  const changed = Object.keys(a).filter((c) => stable(a[c]) !== stable(b[c]));
  if (changed.length === 0) return;
  const where = keyWhere(def, after, changed.length + 1);
  await exec(db, `update public.${def.table} set ${changed.map((c, i) => `${c} = $${i + 1}`).join(", ")} where ${where.sql}`, [...changed.map((c) => a[c]), ...where.params], true);
}

async function deleteRow(db: Db, def: CollectionDef<unknown>, item: unknown): Promise<void> {
  const where = keyWhere(def, item, 1);
  await exec(db, `delete from public.${def.table} where ${where.sql}`, where.params, true);
}

type Diff<T> = { added: T[]; changed: [T, T][]; removed: T[] };
function diff<T>(def: CollectionDef<T>, before: readonly T[], after: readonly T[]): Diff<T> {
  const prev = new Map(before.map((x) => [def.idOf(x), x]));
  const next = new Map(after.map((x) => [def.idOf(x), x]));
  const result: Diff<T> = { added: [], changed: [], removed: [] };
  for (const [id, item] of next) {
    const old = prev.get(id);
    if (!old) result.added.push(item);
    else if (stable(old) !== stable(item)) result.changed.push([old, item]);
  }
  for (const [id, item] of prev) if (!next.has(id)) result.removed.push(item);
  return result;
}

const CALLER_PROFILE_COLUMNS: Record<string, (u: UserRecord) => unknown> = {
  display_name: (u) => u.displayName,
  bio: (u) => u.bio,
  phone: (u) => u.phone,
  country_code: (u) => u.country,
  locale: (u) => u.locale,
  preferences: (u) => JSON.stringify(u.preferences),
  email_preferences: (u) => JSON.stringify(u.emailPreferences),
  marketing_consent: (u) => u.marketingConsent,
  profile_completed_at: (u) => u.profileCompletedAt,
};
const SYSTEM_PROFILE_COLUMNS: Record<string, (u: UserRecord) => unknown> = {
  status: (u) => u.status,
  suspended_reason: (u) => u.suspendedReason,
  terms_version: (u) => u.termsVersion || null,
  privacy_version: (u) => u.privacyVersion || null,
  terms_accepted_at: (u) => u.termsAcceptedAt || null,
  deletion_requested_at: (u) => u.deletionRequestedAt,
};

async function persistUsers(db: Db, identity: Identity, before: readonly UserRecord[], after: readonly UserRecord[]): Promise<void> {
  const prev = new Map(before.map((u) => [u.id, u]));
  for (const u of after) {
    const old = prev.get(u.id);
    if (!old || stable(old) === stable(u)) continue;
    const self = identity.as === "user" && identity.viewer.id === u.id;
    const callerCols = Object.entries(CALLER_PROFILE_COLUMNS).filter(([, get]) => stable(get(u)) !== stable(get(old)));
    if (callerCols.length) {
      const run = () => exec(db, `update public.profiles set ${callerCols.map(([c], i) => `${c} = $${i + 1}`).join(", ")} where id = $${callerCols.length + 1}`, [...callerCols.map(([, g]) => g(u)), u.id], true);
      // Users edit their own profile under RLS; anyone else's is a platform action.
      if (self || identity.as === "service") await run();
      else await elevate(db, identity, run);
    }
    if (self && !old.deletionRequestedAt && u.deletionRequestedAt) await exec(db, "select public.request_account_deletion()", []);
    const systemCols = Object.entries(SYSTEM_PROFILE_COLUMNS).filter(([c, get]) => stable(get(u)) !== stable(get(old)) && !(self && c === "deletion_requested_at"));
    if (systemCols.length) {
      await elevate(db, identity, () => exec(db, `update public.profiles set ${systemCols.map(([c], i) => `${c} = $${i + 1}`).join(", ")} where id = $${systemCols.length + 1}`, [...systemCols.map(([, g]) => g(u)), u.id], true));
    }
    const added = u.roles.filter((r) => !old.roles.includes(r));
    const removed = old.roles.filter((r) => !u.roles.includes(r));
    for (const [role, change] of [...added.map((r) => [r, "grant"] as const), ...removed.map((r) => [r, "revoke"] as const)] as [PlatformRole, "grant" | "revoke"][]) {
      if (identity.as === "user") await exec(db, `select public.${change}_platform_role($1, $2)`, [u.id, role]);
      else if (change === "grant") await exec(db, "insert into public.platform_roles (profile_id, role) values ($1, $2) on conflict do nothing", [u.id, role]);
      else await exec(db, "delete from public.platform_roles where profile_id = $1 and role = $2", [u.id, role]);
    }
  }
}

async function persistOverrides(db: Db, identity: Identity, d: Diff<DataShape["overrides"][number]>): Promise<void> {
  for (const o of d.added) {
    if (identity.as === "user") {
      await exec(db, "select public.grant_entitlement_override($1, $2, $3, $4, $5, $6)", [o.userId, o.audience, o.effect, o.reason, o.validUntil, o.planId]);
    } else {
      await exec(db, "insert into public.entitlement_overrides (id, profile_id, audience, effect, plan_id, valid_from, valid_until, reason, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [o.id, o.userId, o.audience, o.effect, o.planId, o.validFrom, o.validUntil, o.reason, o.createdBy]);
    }
  }
  for (const [old, o] of d.changed) {
    if (!old.revokedAt && o.revokedAt) {
      const reason = (o as { revokeReason?: string | null }).revokeReason ?? "Revoked by staff";
      if (identity.as === "user") await exec(db, "select public.revoke_entitlement_override($1, $2)", [o.id, reason]);
      else await exec(db, "update public.entitlement_overrides set revoked_at = $2, revoked_by = $3, revoke_reason = $4 where id = $1", [o.id, o.revokedAt, o.revokedBy, reason], true);
    }
  }
}

async function persistAudit(db: Db, identity: Identity, added: DataShape["audit"]): Promise<void> {
  if (added.length === 0) return;
  await elevate(db, identity, async () => {
    for (const a of added) {
      const entityId = a.entityId && UUID.test(a.entityId) ? a.entityId : null;
      const after = entityId || !a.entityId ? a.after : { entityRef: a.entityId, value: a.after };
      await exec(db, "insert into public.audit_logs (actor_profile_id, actor_role, action, entity_type, entity_id, before, after, reason, request_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        a.actorId && UUID.test(a.actorId) ? a.actorId : null,
        a.actorRoles.join(",") || null,
        a.action,
        a.entityType,
        entityId,
        a.before === null || a.before === undefined ? null : JSON.stringify(a.before),
        after === null || after === undefined ? null : JSON.stringify(after),
        a.reason,
        a.requestId.slice(0, 80),
      ]);
    }
  });
}

async function persistSettings(db: Db, identity: Identity, before: PlatformSettings, after: PlatformSettings): Promise<void> {
  for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof PlatformSettings, string][]) {
    if (stable(before[field]) === stable(after[field])) continue;
    const run = () => exec(db, "update public.platform_settings set value = $2, updated_by = $3, updated_at = now() where key = $1", [key, JSON.stringify(after[field]), identity.as === "user" ? identity.viewer.id : null], true);
    await (identity.as === "user" ? run() : elevate(db, identity, run));
  }
}

const ORDER: CollectionName[] = [
  "mcCategories", "mcSeries", "media", "mcEpisodes", "mcVersions", "mcEditorialEvents", "mcCorrections",
  "plans", "promos", "subscriptions", "transactions", "refunds", "webhookEvents", "listening", "saved", "notifications", "creatorApplications",
];

export async function persistData(db: Db, identity: Identity, before: DataShape, after: DataShape): Promise<OutboxEmail[]> {
  await persistUsers(db, identity, before.users, after.users);
  for (const name of ORDER) {
    const def = COLLECTIONS[name] as CollectionDef<unknown>;
    const d = diff(def, (before as unknown as Record<string, unknown[]>)[name] ?? [], (after as unknown as Record<string, unknown[]>)[name] ?? []);
    if (!d.added.length && !d.changed.length && !d.removed.length) continue;
    const write = async () => {
      for (const item of d.added) await insertRow(db, def, item);
      if (!def.insertOnly) for (const [old, item] of d.changed) await updateRow(db, def, old, item);
      for (const item of d.removed) {
        if (!def.deletable) throw new CommandError(`Deleting ${name} records is not supported.`);
        await deleteRow(db, def, item);
      }
    };
    await (def.writer === "system" ? elevate(db, identity, write) : write());
    if (name === "mcEpisodes") {
      await persistSources(db, before, after);
      await persistStudy(db, before, after);
    }
    if (name === "subscriptions") await persistSubscriptionPayments(db, identity, before, after);
  }
  await persistOverrides(db, identity, diff(COLLECTIONS.overrides, before.overrides, after.overrides));
  await persistSettings(db, identity, before.settings, after.settings);
  await persistAudit(db, identity, after.audit.slice(before.audit.length));
  return after.outbox.slice(before.outbox.length);
}

async function persistSources(db: Db, before: DataShape, after: DataShape): Promise<void> {
  const prev = new Map(before.mcEpisodes.map((e) => [e.id, e.source]));
  for (const e of after.mcEpisodes) {
    const old = prev.get(e.id) ?? null;
    if (stable(old) === stable(e.source) || !e.source) continue;
    const s = e.source;
    await exec(db, `insert into public.mc_episode_sources (episode_id, kind, url, asset_id, status, status_note, checked_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,now())
      on conflict (episode_id) do update set kind = excluded.kind, url = excluded.url, asset_id = excluded.asset_id, status = excluded.status,
        status_note = excluded.status_note, checked_at = excluded.checked_at, updated_at = now()`, [e.id, s.kind, s.url, s.assetId, s.status, s.statusNote, s.checkedAt]);
  }
}

async function persistStudy(db: Db, before: DataShape, after: DataShape): Promise<void> {
  if (!after.mcEpisodes.some((e) => e.study) && !before.mcEpisodes.some((e) => e.study)) return;
  const prev = new Map(before.mcEpisodes.map((e) => [e.id, e.study]));
  for (const e of after.mcEpisodes) {
    const old = prev.get(e.id) ?? null;
    if (stable(old) === stable(e.study)) continue;
    if (!e.study) {
      await exec(db, "delete from public.mc_episode_study where episode_id = $1", [e.id]);
      continue;
    }
    await exec(db, `insert into public.mc_episode_study (episode_id, flashcards, quiz, notes_md, updated_at)
      values ($1, $2::jsonb, $3::jsonb, $4, now())
      on conflict (episode_id) do update set flashcards = excluded.flashcards, quiz = excluded.quiz, notes_md = excluded.notes_md, updated_at = now()`, [e.id, JSON.stringify(e.study.flashcards), JSON.stringify(e.study.quiz), e.study.notes]);
  }
}

async function persistSubscriptionPayments(db: Db, identity: Identity, before: DataShape, after: DataShape): Promise<void> {
  const prev = new Map(before.subscriptions.map((s) => [s.id, new Set(s.appliedTransactionIds)]));
  await elevate(db, identity, async () => {
    for (const s of after.subscriptions) {
      const seen = prev.get(s.id) ?? new Set<string>();
      for (const txId of s.appliedTransactionIds) {
        if (seen.has(txId)) continue;
        // Primary key on transaction_id: a transaction can be credited once, ever.
        await exec(db, "insert into public.subscription_payments (transaction_id, subscription_id, period_start, period_end) values ($1, $2, $3, $4)", [txId, s.id, s.currentPeriodStart, s.currentPeriodEnd]);
      }
    }
  });
}

/* ---------------------------------------------------------------- run scopes */

function runAs<T>(identity: Identity, fn: (db: Db) => Promise<T>): Promise<T> {
  if (identity.as === "user") return withUser(identity.viewer.id, { email: identity.viewer.email, session_id: identity.viewer.sessionId }, fn);
  if (identity.as === "anon") return withAnon(fn);
  return withService(identity.reason, fn);
}

export async function sbRead(scope: Scope): Promise<DataShape> {
  return runAs(scope, (db) => loadData(db, scope, scope.load, false));
}

export async function sbWrite<T>(scope: Scope, mutate: (data: DataShape) => T | Promise<T>): Promise<{ result: T; outbox: OutboxEmail[] }> {
  return runAs(scope, async (db) => {
    const before = await loadData(db, scope, scope.load, scope.lock ?? true);
    const draft = structuredClone(before);
    const result = await mutate(draft);
    const outbox = await persistData(db, scope, before, draft);
    return { result, outbox };
  });
}

/** Run raw SQL as a scope's identity (for RPCs such as mc_episode_playback). */
export function sbQuery<T>(identity: Identity, fn: (db: Db) => Promise<T>): Promise<T> {
  return runAs(identity, fn);
}
