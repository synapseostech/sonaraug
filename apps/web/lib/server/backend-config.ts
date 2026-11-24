/**
 * Which backend serves this process — decided once, from the environment, and
 * FAIL-CLOSED:
 *
 *   SONARA_BACKEND=dev       Local JSON store + development auth. Allowed only
 *                            outside production (or with SONARA_ALLOW_DEV_BACKEND=1
 *                            for a local production-build smoke test). Never a fallback.
 *   SONARA_BACKEND=supabase  Supabase Auth + Supabase Postgres (RLS enforced).
 *                            Every required variable must be present and well-formed.
 *   unset                    development → dev; production → supabase (and therefore
 *                            an error if Supabase is not configured).
 *
 * A misconfigured backend throws BackendConfigError on every request. Pure: reads
 * only the object passed in, so it is unit-tested without touching process.env.
 */

export type BackendKind = "dev" | "supabase";

export type SupabaseSettings = {
  url: string;
  publishableKey: string;
  secretKey: string;
  databaseUrl: string;
  /** Postgres TLS: "require" for hosted projects; "disable" only for a localhost stack. */
  databaseSsl: "require" | "disable";
};

export type BackendConfig = { kind: "dev" } | { kind: "supabase"; supabase: SupabaseSettings };

export class BackendConfigError extends Error {
  readonly problems: readonly string[];
  constructor(problems: string[]) {
    super(`Sonara backend is not correctly configured: ${problems.join("; ")}`);
    this.name = "BackendConfigError";
    this.problems = problems;
  }
}

type Env = Record<string, string | undefined>;

const isLocalHost = (host: string) => host === "127.0.0.1" || host === "localhost" || host === "::1";

export function resolveBackendConfig(env: Env): BackendConfig {
  const production = env.NODE_ENV === "production";
  const requested = (env.SONARA_BACKEND ?? "").trim();
  if (requested && requested !== "dev" && requested !== "supabase") {
    throw new BackendConfigError([`SONARA_BACKEND must be "dev" or "supabase", got "${requested}"`]);
  }
  const kind: BackendKind = requested ? (requested as BackendKind) : production ? "supabase" : "dev";

  if (kind === "dev") {
    if (production && env.SONARA_ALLOW_DEV_BACKEND !== "1") {
      throw new BackendConfigError(["the development backend cannot run in production"]);
    }
    return { kind: "dev" };
  }

  const problems: string[] = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() ?? "";
  const databaseUrl = env.SUPABASE_DB_URL?.trim() ?? "";

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(url);
  } catch {
    problems.push("NEXT_PUBLIC_SUPABASE_URL is missing or not a URL");
  }
  if (parsedUrl && parsedUrl.protocol !== "https:" && !isLocalHost(parsedUrl.hostname)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL must use https (http is allowed only for a localhost stack)");
  }
  if (!publishableKey) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing");
  if (!secretKey) problems.push("SUPABASE_SECRET_KEY is missing");
  if (secretKey && secretKey === publishableKey) problems.push("SUPABASE_SECRET_KEY must not equal the publishable key");
  if (secretKey.startsWith("sb_publishable_")) problems.push("SUPABASE_SECRET_KEY holds a publishable key");

  let dbHost = "";
  try {
    const db = new URL(databaseUrl);
    if (db.protocol !== "postgres:" && db.protocol !== "postgresql:") throw new Error("protocol");
    dbHost = db.hostname;
  } catch {
    problems.push("SUPABASE_DB_URL is missing or not a postgres:// URL");
  }
  if (problems.length) throw new BackendConfigError(problems);

  const local = isLocalHost(dbHost);
  if (production && local && env.SONARA_ALLOW_DEV_BACKEND !== "1") {
    throw new BackendConfigError(["SUPABASE_DB_URL points at localhost in production"]);
  }
  return { kind: "supabase", supabase: { url, publishableKey, secretKey, databaseUrl, databaseSsl: local ? "disable" : "require" } };
}

let cached: BackendConfig | null = null;

/** The process-wide configuration. Throws (every time) if misconfigured. */
export function backendConfig(): BackendConfig {
  if (cached) return cached;
  cached = resolveBackendConfig(process.env);
  return cached;
}

export const backendKind = (): BackendKind => backendConfig().kind;
