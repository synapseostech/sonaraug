/**
 * Backend selection must fail closed (Wave 2 §6): production without Supabase
 * configuration cannot silently fall back to the local JSON store.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { BackendConfigError, resolveBackendConfig, stripPostgresTlsParameters } from "./backend-config.ts";

const GOOD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://sonara-test.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
  SUPABASE_SECRET_KEY: "sb_secret_xyz",
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.sonara-test.supabase.co:5432/postgres",
};

test("development defaults to the local backend", () => {
  assert.deepEqual(resolveBackendConfig({ NODE_ENV: "development" }), { kind: "dev" });
});

test("production without Supabase configuration fails closed", () => {
  assert.throws(
    () => resolveBackendConfig({ NODE_ENV: "production" }),
    (error: unknown) => error instanceof BackendConfigError && error.message.includes("NEXT_PUBLIC_SUPABASE_URL"),
  );
});

test("the development backend cannot run in production unless explicitly allowed for a smoke test", () => {
  assert.throws(
    () => resolveBackendConfig({ NODE_ENV: "production", SONARA_BACKEND: "dev" }),
    /development backend cannot run in production/,
  );
  assert.deepEqual(resolveBackendConfig({ NODE_ENV: "production", SONARA_BACKEND: "dev", SONARA_ALLOW_DEV_BACKEND: "1" }), { kind: "dev" });
  // The flag is not a default: 0 / empty / absent all refuse.
  for (const flag of ["", "0", "true"]) {
    assert.throws(() => resolveBackendConfig({ NODE_ENV: "production", SONARA_BACKEND: "dev", SONARA_ALLOW_DEV_BACKEND: flag }));
  }
});

test("an unknown backend name is refused rather than guessed", () => {
  assert.throws(() => resolveBackendConfig({ NODE_ENV: "development", SONARA_BACKEND: "sqlite" }), /must be "dev" or "supabase"/);
});

test("a complete Supabase configuration resolves with TLS required off localhost", () => {
  const config = resolveBackendConfig({ NODE_ENV: "production", ...GOOD });
  assert.equal(config.kind, "supabase");
  if (config.kind !== "supabase") return;
  assert.equal(config.supabase.databaseSsl, "require");
  assert.equal(config.supabase.url, GOOD.NEXT_PUBLIC_SUPABASE_URL);
});

test("the optional Supabase CA accepts PEM values with escaped newlines", () => {
  const ca = "-----BEGIN CERTIFICATE-----\\ncertificate-data\\n-----END CERTIFICATE-----";
  const config = resolveBackendConfig({ NODE_ENV: "production", ...GOOD, SUPABASE_DB_CA_CERT: ca });
  assert.equal(config.kind === "supabase" && config.supabase.databaseCa, ca.replace(/\\n/g, "\n"));
});

test("a malformed Supabase CA is rejected", () => {
  assert.throws(
    () => resolveBackendConfig({ NODE_ENV: "production", ...GOOD, SUPABASE_DB_CA_CERT: "not a PEM certificate" }),
    /SUPABASE_DB_CA_CERT must contain a PEM-encoded certificate/,
  );
});

test("Postgres TLS URL parameters cannot override explicit verified TLS settings", () => {
  const url = "postgresql://user:secret@pooler.example.com:6543/postgres?sslmode=require&sslrootcert=%2Ftmp%2Fca.crt&application_name=sonara";
  assert.equal(
    stripPostgresTlsParameters(url),
    "postgresql://user:secret@pooler.example.com:6543/postgres?application_name=sonara",
  );
});

test("a localhost database is allowed for development and refused in production without the smoke-test flag", () => {
  const local = { ...GOOD, SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:55422/postgres" };
  const dev = resolveBackendConfig({ NODE_ENV: "development", SONARA_BACKEND: "supabase", ...local });
  assert.equal(dev.kind === "supabase" && dev.supabase.databaseSsl, "disable");
  assert.throws(() => resolveBackendConfig({ NODE_ENV: "production", SONARA_BACKEND: "supabase", ...local }), /localhost in production/);
  assert.equal(resolveBackendConfig({ NODE_ENV: "production", SONARA_BACKEND: "supabase", ...local, SONARA_ALLOW_DEV_BACKEND: "1" }).kind, "supabase");
});

test("a publishable key can never be used as the server secret", () => {
  assert.throws(
    () => resolveBackendConfig({ NODE_ENV: "production", ...GOOD, SUPABASE_SECRET_KEY: GOOD.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }),
    /must not equal the publishable key/,
  );
  assert.throws(
    () => resolveBackendConfig({ NODE_ENV: "production", ...GOOD, SUPABASE_SECRET_KEY: "sb_publishable_other" }),
    /holds a publishable key/,
  );
});

test("plain http is only accepted for a localhost Supabase stack", () => {
  assert.throws(
    () => resolveBackendConfig({ NODE_ENV: "production", ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "http://sonara.example.com" }),
    /must use https/,
  );
  assert.equal(
    resolveBackendConfig({ NODE_ENV: "development", SONARA_BACKEND: "supabase", ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).kind,
    "supabase",
  );
});

test("every missing or malformed value is reported together, not one at a time", () => {
  try {
    resolveBackendConfig({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
    assert.fail("expected BackendConfigError");
  } catch (error) {
    assert.ok(error instanceof BackendConfigError);
    assert.equal(error.problems.length, 4, error.problems.join(" | "));
  }
});

test("a non-postgres database URL is refused", () => {
  assert.throws(
    () => resolveBackendConfig({ NODE_ENV: "production", ...GOOD, SUPABASE_DB_URL: "mysql://db.example.com/x" }),
    /postgres:\/\//,
  );
});
