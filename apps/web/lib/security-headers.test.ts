/**
 * Security header policy tests (F-15 / N-7).
 *
 * These pin the *policy*, not a running server. The browser-level check (a real
 * response carrying the header, and no CSP violations in the console) is in
 * scripts/sonara-e2e.mjs › SEC-HDR.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_SECURITY_HEADERS,
  HSTS_VALUE,
  buildContentSecurityPolicy,
  isHttpsRequest,
  mediaOriginsFrom,
  safeMediaOrigin,
  securityHeaders,
} from "./security-headers.ts";

const directive = (policy: string, name: string): string => {
  const found = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  assert.ok(found, `directive ${name} is missing from ${policy}`);
  return found;
};

test("production CSP uses a nonce and strict-dynamic, never unsafe-inline or unsafe-eval for scripts", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "abc123",
    production: true,
    mediaOrigins: ["https://stream.example.ug", "http://insecure.example.ug"],
  });
  const scripts = directive(policy, "script-src");
  assert.match(scripts, /'nonce-abc123'/);
  assert.match(scripts, /'strict-dynamic'/);
  assert.ok(!scripts.includes("'unsafe-inline'"), "script-src must not allow inline scripts");
  assert.ok(!scripts.includes("'unsafe-eval'"), "script-src must not allow eval");
});

test("production CSP forbids frames, objects and foreign form targets", () => {
  const policy = buildContentSecurityPolicy({ nonce: "n", production: true, mediaOrigins: [] });
  assert.equal(directive(policy, "object-src"), "object-src 'none'");
  assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
  assert.equal(directive(policy, "frame-src"), "frame-src 'none'");
  assert.equal(directive(policy, "form-action"), "form-action 'self'");
  assert.equal(directive(policy, "base-uri"), "base-uri 'self'");
});

test("only allow-listed https media origins are added to media-src and connect-src", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "n",
    production: true,
    mediaOrigins: ["https://beatfm.edge.cloudrad.io", "http://plain.example.ug"],
  });
  const media = directive(policy, "media-src");
  assert.match(media, /https:\/\/beatfm\.edge\.cloudrad\.io/);
  assert.ok(!media.includes("plain.example.ug"), "an http origin must never be allow-listed");
  assert.match(media, /blob:/);
  assert.match(directive(policy, "connect-src"), /https:\/\/beatfm\.edge\.cloudrad\.io/);
});

test("development adds eval and websockets for the HMR client only", () => {
  const policy = buildContentSecurityPolicy({ nonce: "n", production: false, dev: true, mediaOrigins: [] });
  const scripts = directive(policy, "script-src");
  assert.match(scripts, /'unsafe-eval'/);
  assert.match(directive(policy, "connect-src"), /ws:/);
});

test("HSTS is emitted only for an HTTPS request", () => {
  const plain = securityHeaders({ nonce: "n", production: false, https: false, mediaOrigins: [] });
  assert.ok(!plain.some(([name]) => name === "Strict-Transport-Security"), "no HSTS over http");
  const secure = securityHeaders({ nonce: "n", production: true, https: true, mediaOrigins: [] });
  const hsts = secure.find(([name]) => name === "Strict-Transport-Security");
  assert.deepEqual(hsts, ["Strict-Transport-Security", HSTS_VALUE]);
  assert.match(HSTS_VALUE, /max-age=63072000/);
  assert.match(HSTS_VALUE, /includeSubDomains/);
  assert.ok(!HSTS_VALUE.includes("preload"), "preload needs an explicit owner decision");
});

test("upgrade-insecure-requests is only added on a production HTTPS response", () => {
  const http = buildContentSecurityPolicy({ nonce: "n", production: true, https: false, mediaOrigins: [] });
  assert.ok(!http.includes("upgrade-insecure-requests"));
  const https = buildContentSecurityPolicy({ nonce: "n", production: true, https: true, mediaOrigins: [] });
  assert.match(https, /upgrade-insecure-requests/);
});

test("base headers deny framing and sniffing without duplicating the policy", () => {
  const names = BASE_SECURITY_HEADERS.map(([name]) => name);
  assert.ok(names.includes("X-Content-Type-Options"));
  assert.ok(names.includes("X-Frame-Options"));
  assert.ok(!names.includes("Content-Security-Policy"), "CSP is per-request, never static");
  const all = securityHeaders({ nonce: "n", production: true, https: true, mediaOrigins: [] }).map(([name]) => name);
  assert.equal(new Set(all).size, all.length, "no duplicate header names");
});

test("media origins are normalised to https origins and junk is dropped", () => {
  assert.equal(safeMediaOrigin("https://stream.example.ug/live?x=1"), "https://stream.example.ug");
  assert.equal(safeMediaOrigin("http://stream.example.ug/live"), null);
  assert.equal(safeMediaOrigin("javascript:alert(1)"), null);
  assert.equal(safeMediaOrigin("not a url"), null);
  assert.deepEqual(
    mediaOriginsFrom(["https://b.example.ug/x", "https://b.example.ug/y", "http://a.example.ug", null, undefined, ""]),
    ["https://b.example.ug"],
  );
});

test("https detection honours a trusted proxy header", () => {
  assert.equal(isHttpsRequest("https:", null), true);
  assert.equal(isHttpsRequest("http:", "https"), true);
  assert.equal(isHttpsRequest("http:", "http"), false);
  assert.equal(isHttpsRequest("http:", "HTTPS, http"), true);
  assert.equal(isHttpsRequest("http:", null), false);
});
