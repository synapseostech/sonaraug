import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateOrReservedHost, isReservedIpAddress, publicUrlSchema, ugandaPhoneSchema } from "./common.ts";
import { streamEndpointCreateSchema } from "./catalogue.ts";
import { campaignCreateSchema } from "./ads.ts";

test("SSRF guard blocks loopback, private ranges and metadata endpoints", () => {
  const blocked = [
    "localhost",
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.10",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "metadata.google.internal",
    "studio.local",
  ];
  for (const host of blocked) {
    assert.equal(isPrivateOrReservedHost(host), true, `${host} must be blocked`);
  }
});

test("SSRF guard blocks IPv4-mapped, NAT64, tunnelled and other reserved literals (audit F-9)", () => {
  const blocked = [
    // Loopback and cloud metadata hidden inside IPv6, in the hex form URL parsers produce.
    "[::ffff:127.0.0.1]",
    "[::ffff:7f00:1]",
    "[::ffff:a9fe:a9fe]",
    "::ffff:10.0.0.1",
    "[::127.0.0.1]",
    "[::7f00:1]",
    "[64:ff9b::a9fe:a9fe]",
    "[2002:7f00:1::]",
    "[2001:0:4136:e378::1]",
    "[fec0::1]",
    "[ff02::1]",
    "[2001:db8::1]",
    "[::]",
    // Reserved IPv4 ranges.
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.0.1",
    "192.0.2.10",
    "203.0.113.9",
    // Legacy numeric forms when the guard is called without a URL parser.
    "2130706433",
    "0x7f.0.0.1",
    "127.1",
    "0177.0.0.1",
  ];
  for (const host of blocked) {
    assert.equal(isPrivateOrReservedHost(host), true, `${host} must be blocked`);
  }
  for (const url of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:a9fe:a9fe]/latest/meta-data", "http://[64:ff9b::a9fe:a9fe]/", "http://198.18.0.1/"]) {
    assert.equal(publicUrlSchema({ allowHttp: true }).safeParse(url).success, false, `${url} must be rejected`);
  }
});

test("reserved-address check is usable on resolved addresses and keeps public IPv6 open", () => {
  assert.equal(isReservedIpAddress("10.1.2.3"), true);
  assert.equal(isReservedIpAddress("::1"), true);
  assert.equal(isReservedIpAddress("2c0f:fe38::1"), false, "public African IPv6 must be allowed");
  assert.equal(isReservedIpAddress("[2606:4700:4700::1111]"), false);
  assert.equal(isReservedIpAddress("196.43.133.1"), false, "public Ugandan IPv4 must be allowed");
  assert.equal(isReservedIpAddress("stream.example.ug"), false, "names are not addresses; resolve first");
  assert.equal(isPrivateOrReservedHost("[2c0f:fe38::1]"), false);
});

test("SSRF guard allows ordinary public hosts", () => {
  for (const host of ["stream.kampalafm.co.ug", "8.8.8.8", "203.0.114.20", "cdn.example.com"]) {
    assert.equal(isPrivateOrReservedHost(host), false, `${host} must be allowed`);
  }
});

test("URL schema rejects embedded credentials", () => {
  const parsed = publicUrlSchema().safeParse("https://user:pass@example.com/stream");
  assert.equal(parsed.success, false);
});

test("URL schema rejects http unless explicitly permitted", () => {
  assert.equal(publicUrlSchema().safeParse("http://example.com/a").success, false);
  assert.equal(publicUrlSchema({ allowHttp: true }).safeParse("http://example.com/a").success, true);
});

test("a broadcaster cannot register a stream pointing at internal infrastructure", () => {
  const result = streamEndpointCreateSchema.safeParse({
    stationId: "6f1c2a9e-0f0a-4f5f-9d1e-3b0b8f1a2c3d",
    protocol: "icecast",
    url: "http://192.168.0.12:8000/live",
  });
  assert.equal(result.success, false);
  const messages = result.success ? [] : result.error.issues.map((i) => i.message);
  assert.ok(messages.some((m) => m.includes("publicly reachable")), messages.join("; "));
});

test("HLS endpoints must be https even though legacy icecast may be http", () => {
  const base = { stationId: "6f1c2a9e-0f0a-4f5f-9d1e-3b0b8f1a2c3d" };
  assert.equal(streamEndpointCreateSchema.safeParse({ ...base, protocol: "hls", url: "http://cdn.example.com/s.m3u8" }).success, false);
  assert.equal(streamEndpointCreateSchema.safeParse({ ...base, protocol: "hls", url: "https://cdn.example.com/s.m3u8" }).success, true);
  assert.equal(streamEndpointCreateSchema.safeParse({ ...base, protocol: "icecast", url: "http://stream.example.com:8000/live" }).success, true);
});

test("Ugandan phone numbers normalise to E.164", () => {
  for (const input of ["0771234567", "+256771234567", "256771234567", "0771 234 567", "0771-234-567"]) {
    assert.equal(ugandaPhoneSchema.parse(input), "+256771234567", input);
  }
  for (const bad of ["0812345678", "07712345", "+254712345678", "not-a-phone"]) {
    assert.equal(ugandaPhoneSchema.safeParse(bad).success, false, bad);
  }
});

test("campaign budgets are integer shillings and reject float money", () => {
  const base = {
    advertiserId: "6f1c2a9e-0f0a-4f5f-9d1e-3b0b8f1a2c3d",
    name: "Launch",
    objective: "awareness" as const,
    startsAt: "2026-12-01",
    endsAt: "2026-12-31",
    totalBudgetUgx: 500_000,
  };
  assert.equal(campaignCreateSchema.safeParse(base).success, true);
  assert.equal(campaignCreateSchema.safeParse({ ...base, totalBudgetUgx: 500_000.5 }).success, false);
  assert.equal(campaignCreateSchema.safeParse({ ...base, totalBudgetUgx: -100 }).success, false);
});

test("campaign end must follow start and daily cannot exceed total", () => {
  const base = {
    advertiserId: "6f1c2a9e-0f0a-4f5f-9d1e-3b0b8f1a2c3d",
    name: "Launch",
    objective: "awareness" as const,
    startsAt: "2026-12-31",
    endsAt: "2026-12-01",
    totalBudgetUgx: 100_000,
  };
  assert.equal(campaignCreateSchema.safeParse(base).success, false);
  assert.equal(
    campaignCreateSchema.safeParse({ ...base, startsAt: "2026-12-01", endsAt: "2026-12-31", dailyBudgetUgx: 500_000 }).success,
    false,
  );
});
