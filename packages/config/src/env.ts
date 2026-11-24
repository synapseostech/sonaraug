/**
 * Dependency-free environment validation.
 *
 * Deliberately not built on a schema library: this module is imported by the
 * build config of every app, so it must work before node_modules resolution
 * and must never be the reason a deploy fails to parse. It is strict by
 * default — a missing required variable throws a single aggregated error.
 */

export type EnvShape = Record<string, "required" | "optional" | "production-required">;

export type ValidationIssue = { key: string; problem: string };

const URL_KEYS = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "POSTHOG_HOST",
  "R2_ENDPOINT",
]);

const BOOLEAN_KEYS = new Set([
  "FF_ENABLE_DOWNLOADS",
  "FF_ENABLE_COMMENTS",
  "FF_ENABLE_ADVERTISING",
  "DATA_SAVER_DEFAULT",
]);

/** Variables that must never be present in a client bundle. */
export const SERVER_ONLY_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_ACCESS_TOKEN",
  "SMTP_PASS",
  "CLOUDFLARE_API_TOKEN",
  "R2_SECRET_ACCESS_KEY",
  "STREAM_WEBHOOK_SECRET",
  "SENTRY_DSN",
  "FLW_SECRET_KEY",
  "FLW_WEBHOOK_SECRET_HASH",
] as const;

const isBrowserSafeUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Validate a parsed environment. Returns issues instead of throwing so that
 * tests can assert on the full list, and callers can decide how to fail.
 */
export function validateEnv(
  source: Record<string, string | undefined>,
  shape: EnvShape,
  options: { isProduction?: boolean } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isProduction = options.isProduction ?? false;

  for (const [key, requirement] of Object.entries(shape)) {
    const raw = source[key];
    const value = raw?.trim();
    const missing = value === undefined || value.length === 0;

    if (missing) {
      const required = requirement === "required" || (requirement === "production-required" && isProduction);
      if (required) {
        issues.push({ key, problem: "is required but missing or empty" });
      }
      continue;
    }

    if (URL_KEYS.has(key) && !isBrowserSafeUrl(value)) {
      issues.push({ key, problem: "must be an absolute http(s) URL" });
    }

    if (BOOLEAN_KEYS.has(key) && value !== "true" && value !== "false") {
      issues.push({ key, problem: "must be the literal string true or false" });
    }
  }

  if (isProduction && source.NODE_ENV !== "production") {
    issues.push({ key: "NODE_ENV", problem: "must be 'production' in a production deployment" });
  }

  return issues;
}

export function assertEnv(source: Record<string, string | undefined>, shape: EnvShape, options: { isProduction?: boolean } = {}): void {
  const issues = validateEnv(source, shape, options);
  if (issues.length === 0) return;
  const message = ["Invalid environment configuration:", ...issues.map((i) => `  - ${i.key} ${i.problem}`)].join("\n");
  throw new Error(message);
}
