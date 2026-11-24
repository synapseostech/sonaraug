import { test } from "node:test";
import assert from "node:assert/strict";
import { AnalyticsPrivacyError, NO_CONSENT, buildEvent, categoryOf, hasConsent } from "./events.ts";

const ctx = {
  consent: { product: true, playback: true, advertising: false },
  platform: "android" as const,
  appVersion: "1.0.0",
  sessionId: "s-1",
  now: () => new Date("2026-11-18T21:55:00.000Z"),
};

test("nothing is emitted without consent", () => {
  const event = buildEvent("app_open", { cold_start: true }, { ...ctx, consent: NO_CONSENT });
  assert.equal(event, null);
});

test("advertising events require advertising consent specifically", () => {
  const event = buildEvent("ad_impression", { campaign_id: "c1", placement: "home_hero", advertisement_id: "a1" }, ctx);
  assert.equal(event, null, "product consent must not imply ad consent");

  const consented = buildEvent("ad_impression", { campaign_id: "c1", placement: "home_hero", advertisement_id: "a1" }, {
    ...ctx,
    consent: { ...ctx.consent, advertising: true },
  });
  assert.equal(consented?.category, "advertising");
});

test("emitted events carry an ISO timestamp and no user identifier", () => {
  const event = buildEvent("screen_view", { screen: "radio" }, ctx);
  assert.ok(event);
  assert.equal(event.occurredAt, "2026-11-18T21:55:00.000Z");
  assert.ok(!("userId" in event));
  assert.ok(!("user_id" in event));
});

test("personal-data-shaped keys are rejected", () => {
  assert.throws(
    () => buildEvent("screen_view", { email: "a@b.co" } as never, ctx),
    AnalyticsPrivacyError,
  );
  assert.throws(
    () => buildEvent("screen_view", { device_id: "abc" } as never, ctx),
    AnalyticsPrivacyError,
  );
});

test("personal-data-shaped values are rejected", () => {
  assert.throws(() => buildEvent("screen_view", { screen: "user@example.com" }, ctx), AnalyticsPrivacyError);
  assert.throws(() => buildEvent("screen_view", { screen: "+256700000000" }, ctx), AnalyticsPrivacyError);
});

test("ordinary values are accepted", () => {
  const event = buildEvent("station_play_error", {
    station_id: "st-1",
    error_code: "stream_rejected",
    endpoint_index: 1,
    startup_ms: 2345,
  }, ctx);
  assert.ok(event);
  assert.equal(event.properties.error_code, "stream_rejected");
});

test("category mapping is explicit for every event", () => {
  assert.equal(categoryOf("app_open"), "product");
  assert.equal(categoryOf("rebuffer"), "playback");
  assert.equal(categoryOf("ad_click"), "advertising");
});

test("consent lookup is independent per category", () => {
  assert.equal(hasConsent({ product: true, playback: false, advertising: false }, "playback"), false);
  assert.equal(hasConsent({ product: true, playback: false, advertising: false }, "product"), true);
});
