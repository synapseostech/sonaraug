/**
 * Postgres access for the Supabase backend. SERVER ONLY.
 *
 * Every request runs inside a transaction that adopts the caller's identity the
 * same way Supabase's Data API does: `SET LOCAL ROLE authenticated` (or `anon`)
 * plus the verified JWT claims in `request.jwt.claims`. Row Level Security is
 * therefore the enforcement layer, exactly as it would be through PostgREST.
 *
 * `withService` adopts `service_role` (bypasses RLS). It is reserved for system
 * operations that have their own server-side checks: the payment processor,
 * notifications, email logs, audit of self-service actions, media registration,
 * and display-only lookups. Each call site says why.
 */
import pg from "pg";
import { backendConfig, BackendConfigError } from "../backend-config.ts";

export type Db = pg.PoolClient;

const globalPool = globalThis as unknown as { __sonaraPgPool?: pg.Pool };

function pool(): pg.Pool {
  if (globalPool.__sonaraPgPool) return globalPool.__sonaraPgPool;
  const config = backendConfig();
  if (config.kind !== "supabase") throw new BackendConfigError(["Postgres requested while the dev backend is active"]);
  const created = new pg.Pool({
    connectionString: config.supabase.databaseUrl,
    ssl: config.supabase.databaseSsl === "require" ? { rejectUnauthorized: true } : false,
    max: Number(process.env.SONARA_DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "sonara-web",
  });
  // A failed idle client must not crash the process.
  created.on("error", (error) => console.error(`[db] idle client error: ${error.message}`));
  globalPool.__sonaraPgPool = created;
  return created;
}

export type Identity =
  | { kind: "anon" }
  | { kind: "user"; userId: string; claims: Record<string, unknown> }
  | { kind: "service"; reason: string };

async function run<T>(identity: Identity, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    // Bounded work per request; a runaway query cannot hold a pooled connection.
    await client.query("set local statement_timeout = '15s'");
    if (identity.kind === "user") {
      const claims = JSON.stringify({ ...identity.claims, sub: identity.userId, role: "authenticated" });
      await client.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', 'authenticated', true)", [claims, identity.userId]);
      await client.query("set local role authenticated");
    } else if (identity.kind === "anon") {
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true), set_config('request.jwt.claim.sub', '', true)");
      await client.query("set local role anon");
    } else {
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true), set_config('request.jwt.claim.sub', '', true)");
      await client.query("set local role service_role");
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** As the signed-in user (RLS applies). */
export const withUser = <T>(userId: string, claims: Record<string, unknown>, fn: (db: Db) => Promise<T>) => run({ kind: "user", userId, claims }, fn);
/** As an anonymous visitor (RLS applies). */
export const withAnon = <T>(fn: (db: Db) => Promise<T>) => run({ kind: "anon" }, fn);
/** As the platform (RLS bypassed). Callers must have done their own authorisation. */
export const withService = <T>(reason: string, fn: (db: Db) => Promise<T>) => run({ kind: "service", reason }, fn);

/** Postgres error codes the services translate into user-facing messages. */
export function pgCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : null;
}

export async function closePool(): Promise<void> {
  const p = globalPool.__sonaraPgPool;
  globalPool.__sonaraPgPool = undefined;
  if (p) await p.end();
}
