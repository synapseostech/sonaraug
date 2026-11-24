/**
 * The storage boundary every service uses.
 *
 *   readData(scope)            → records visible to the scope's identity
 *   writeData(scope, mutate)   → load, mutate, persist atomically
 *
 * dev backend:      the scope is ignored; the whole local JSON store is used
 *                   (unchanged behaviour from Wave 1).
 * supabase backend: only the collections/rows named in `scope.load` are loaded,
 *                   as the scope's identity (RLS applies), locked for writes, and
 *                   the diff is persisted (see sb/store.ts). Anything a mutation
 *                   reads must therefore be listed in its scope.
 *
 * Supabase-only side effects (play counts, playable-source lookup, auth bans,
 * email delivery) are also here so services stay backend-agnostic.
 */
import { backendKind } from "./backend-config.ts";
import type { Viewer } from "./auth.ts";
import { read as devRead, transact as devTransact } from "./store.ts";
import type { DataShape } from "./types.ts";
import { sbQuery, sbRead, sbWrite, type Identity, type Load, type Scope } from "./sb/store.ts";
import { deliverEmails } from "./email.ts";

export type { Identity, Load, Scope };

export const isSupabase = (): boolean => backendKind() === "supabase";

export const asViewer = (viewer: Viewer | null): Identity => (viewer ? { as: "user", viewer } : { as: "anon" });
export const asService = (reason: string): Identity => ({ as: "service", reason });
export const scope = (identity: Identity, load: Load, lock?: boolean): Scope => ({ ...identity, load, lock });

/** Filter helpers for the supabase loader (SQL against table alias `t`). */
export const where = (sql: string, ...params: unknown[]) => ({ where: sql, params });
/** As `where`, but read as the platform (see Filter.system). */
export const whereSystem = (sql: string, ...params: unknown[]) => ({ where: sql, params, system: true });

export async function readData(s: Scope): Promise<Readonly<DataShape>> {
  if (!isSupabase()) return devRead();
  return sbRead(s);
}

export async function writeData<T>(s: Scope, mutate: (data: DataShape) => T | Promise<T>): Promise<T> {
  if (!isSupabase()) return devTransact(mutate);
  const { result, outbox } = await sbWrite(s, mutate);
  // Emails are sent after the transaction commits, never for a rolled-back change.
  await deliverEmails(outbox);
  return result;
}

/** Public play counts per episode (aggregate only). Undefined in dev: computed from the store. */
export async function playCounts(): Promise<ReadonlyMap<string, number> | undefined> {
  if (!isSupabase()) return undefined;
  return sbQuery({ as: "anon" }, async (db) => {
    const { rows } = await db.query("select episode_id, plays from public.mc_play_counts()");
    return new Map(rows.map((r) => [String(r.episode_id), Number(r.plays)]));
  });
}

/**
 * Supabase: fills an episode's real source location from mc_episode_playback(),
 * which returns a row only if the DATABASE grants this identity access. Listeners
 * otherwise only ever see the source kind. No-op in dev (the store holds sources).
 */
export async function fillPlayableSource(data: DataShape, viewer: Viewer | null, episodeId: string): Promise<boolean> {
  if (!isSupabase()) return true;
  const episode = data.mcEpisodes.find((e) => e.id === episodeId);
  if (!episode) return false;
  return sbQuery(asViewer(viewer), async (db) => {
    const { rows } = await db.query("select kind, url, asset_id, status from public.mc_episode_playback($1)", [episodeId]);
    const row = rows[0];
    if (!row) return false;
    episode.source = {
      kind: row.kind,
      url: row.url ?? null,
      assetId: row.asset_id ?? null,
      status: row.status,
      statusNote: episode.source?.statusNote ?? "",
      checkedAt: episode.source?.checkedAt ?? null,
      updatedAt: episode.source?.updatedAt ?? episode.updatedAt,
    };
    return true;
  });
}

/** Supabase: block or unblock sign-in at the auth provider when an account is suspended or reactivated. */
export async function applyAuthBan(userId: string, suspended: boolean): Promise<void> {
  if (!isSupabase()) return;
  const { adminClient } = await import("./sb/supabase.ts");
  const { error } = await adminClient().auth.admin.updateUserById(userId, { ban_duration: suspended ? "876000h" : "none" });
  if (error) throw new Error(`auth provider refused the ${suspended ? "ban" : "unban"}: ${error.message}`);
}
