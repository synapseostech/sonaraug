import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnv, SERVER_ONLY_KEYS, type EnvShape } from "./env.ts";

const SHAPE: EnvShape = {
  NEXT_PUBLIC_SUPABASE_URL: "required",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "required",
  SUPABASE_SERVICE_ROLE_KEY: "production-required",
  DATA_SAVER_DEFAULT: "optional",
};

test("accepts a minimal valid development environment", () => {
  const issues = validateEnv(
    { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
    SHAPE,
  );
  assert.deepEqual(issues, []);
});

test("reports every missing required variable, not just the first", () => {
  const issues = validateEnv({}, SHAPE);
  const keys = issues.map((i) => i.key).sort();
  assert.deepEqual(keys, ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
});

test("treats whitespace-only values as missing", () => {
  const issues = validateEnv(
    { NEXT_PUBLIC_SUPABASE_URL: "   ", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
    SHAPE,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.key, "NEXT_PUBLIC_SUPABASE_URL");
});

test("enforces production-only requirements only in production", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  assert.deepEqual(validateEnv(env, SHAPE, { isProduction: false }), []);
  assert.equal(validateEnv(env, SHAPE, { isProduction: true })[0]?.key, "SUPABASE_SERVICE_ROLE_KEY");
});

test("rejects a non-URL where a URL is required", () => {
  const issues = validateEnv(
    { NEXT_PUBLIC_SUPABASE_URL: "not-a-url", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
    SHAPE,
  );
  assert.equal(issues[0]?.problem, "must be an absolute http(s) URL");
});

test("rejects loose booleans such as 1 / yes / TRUE", () => {
  const base = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  for (const bad of ["1", "yes", "TRUE", "on"]) {
    const issues = validateEnv({ ...base, DATA_SAVER_DEFAULT: bad }, SHAPE);
    assert.equal(issues[0]?.key, "DATA_SAVER_DEFAULT", `expected ${bad} to be rejected`);
  }
  assert.deepEqual(validateEnv({ ...base, DATA_SAVER_DEFAULT: "true" }, SHAPE), []);
});

test("never treats a server-only secret as client-safe", () => {
  assert.ok(SERVER_ONLY_KEYS.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(SERVER_ONLY_KEYS.includes("SUPABASE_SECRET_KEY"));
  assert.ok(SERVER_ONLY_KEYS.includes("SUPABASE_DB_URL"));
  assert.ok(SERVER_ONLY_KEYS.includes("SUPABASE_DB_CA_CERT"));
  assert.ok(SERVER_ONLY_KEYS.includes("SMTP_PASS"));
  assert.ok(SERVER_ONLY_KEYS.includes("GROQ_API_KEY"));
  assert.ok(!SERVER_ONLY_KEYS.some((k) => k.startsWith("NEXT_PUBLIC_")));
});
