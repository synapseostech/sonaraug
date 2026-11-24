/**
 * Email configuration boundary (Wave 2 §7).
 *
 * No message is ever sent by these tests. They pin the provider resolution and
 * the rule that authentication links never reach the delivery log.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { EmailConfigError, SENSITIVE_KINDS, resolveEmailConfig } from "./email.ts";

const GOOD = { SONARA_EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.eu.example.org", EMAIL_FROM: "Sonara <no-reply@example.org>" };

test("without configuration nothing is sent and messages are recorded as logged", () => {
  assert.deepEqual(resolveEmailConfig({}), { provider: "log" });
});

test("an SMTP host alone selects smtp, and a missing host is refused for the smtp provider", () => {
  assert.equal(resolveEmailConfig({ SMTP_HOST: "smtp.example.org", EMAIL_FROM: "a@example.org" }).provider, "smtp");
  assert.throws(() => resolveEmailConfig({ SONARA_EMAIL_PROVIDER: "smtp" }), EmailConfigError);
  assert.throws(() => resolveEmailConfig({ SONARA_EMAIL_PROVIDER: "sendgrid" }), /must be smtp, log or none/);
});

test("the sender address must be a real address", () => {
  assert.throws(() => resolveEmailConfig({ ...GOOD, EMAIL_FROM: "Sonara" }), /EMAIL_FROM/);
  assert.throws(() => resolveEmailConfig({ ...GOOD, EMAIL_FROM: "no-reply@" }), /EMAIL_FROM/);
});

test("TLS is required by default for a remote relay and can be disabled only explicitly", () => {
  const remote = resolveEmailConfig(GOOD);
  assert.equal(remote.provider === "smtp" && remote.smtp.requireTls, true);
  const local = resolveEmailConfig({ ...GOOD, SMTP_HOST: "127.0.0.1", SMTP_PORT: "55425" });
  assert.equal(local.provider === "smtp" && local.smtp.requireTls, false);
  const forced = resolveEmailConfig({ ...GOOD, SMTP_REQUIRE_TLS: "true", SMTP_HOST: "127.0.0.1" });
  assert.equal(forced.provider === "smtp" && forced.smtp.requireTls, true);
});

test("port 465 implies implicit TLS", () => {
  const config = resolveEmailConfig({ ...GOOD, SMTP_PORT: "465" });
  assert.equal(config.provider === "smtp" && config.smtp.secure, true);
  assert.throws(() => resolveEmailConfig({ ...GOOD, SMTP_PORT: "0" }), /SMTP_PORT/);
});

test("a localhost relay is refused in production", () => {
  assert.throws(
    () => resolveEmailConfig({ ...GOOD, SMTP_HOST: "127.0.0.1", NODE_ENV: "production" }),
    /localhost in production/,
  );
});

test("authentication messages are marked sensitive so their links are never stored", () => {
  assert.ok(SENSITIVE_KINDS.has("email_verification"));
  assert.ok(SENSITIVE_KINDS.has("password_reset"));
  assert.ok(!SENSITIVE_KINDS.has("payment_receipt"));
  assert.ok(!SENSITIVE_KINDS.has("creator_application_decided"));
});
