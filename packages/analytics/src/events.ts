/**
 * Typed analytics catalogue.
 *
 * Two hard rules, both enforced at runtime here rather than by convention:
 *  1. Nothing is sent without consent for that category (Uganda DPPA 2019).
 *  2. No event may carry personal data. Playback analytics is about content
 *     and reliability, not about identifying a listener.
 */

export type AnalyticsCategory = "product" | "playback" | "advertising";

export type ConsentState = {
  readonly product: boolean;
  readonly playback: boolean;
  readonly advertising: boolean;
};

export type Platform = "android" | "ios" | "web";

export type EventEnvelope = {
  readonly name: string;
  readonly category: AnalyticsCategory;
  readonly properties: Readonly<Record<string, string | number | boolean | null>>;
  readonly occurredAt: string;
  readonly platform: Platform;
  readonly appVersion: string;
  /** Rotating, non-reversible session identifier. Never a user id. */
  readonly sessionId: string;
};

type PropValue = string | number | boolean | null;

export type EventDefinitions = {
  app_open: { category: "product"; properties: { cold_start: boolean } };
  screen_view: { category: "product"; properties: { screen: string } };
  search_performed: { category: "product"; properties: { query_length: number; result_count: number } };
  signup_completed: { category: "product"; properties: { method: "email" | "phone" | "apple" | "google" } };
  follow_added: { category: "product"; properties: { target: "station" | "podcast" | "channel" } };
  favourite_added: { category: "product"; properties: { target: "station" | "podcast" | "episode" | "video" } };

  station_play_start: { category: "playback"; properties: { station_id: string; endpoint_index: number; bitrate_kbps: number | null } };
  station_play_error: {
    category: "playback";
    properties: { station_id: string; error_code: string; endpoint_index: number; startup_ms: number | null };
  };
  episode_play_start: { category: "playback"; properties: { episode_id: string; podcast_id: string } };
  episode_progress: {
    category: "playback";
    properties: { episode_id: string; position_bucket: number; speed: number; completed: boolean };
  };
  video_play_start: { category: "playback"; properties: { video_id: string; channel_id: string } };
  rebuffer: { category: "playback"; properties: { media: "radio" | "podcast" | "video"; duration_ms: number } };

  ad_impression: { category: "advertising"; properties: { campaign_id: string; placement: string; advertisement_id: string } };
  ad_click: { category: "advertising"; properties: { campaign_id: string; placement: string; advertisement_id: string } };
};

export type EventName = keyof EventDefinitions;

/** Keys that would indicate personal data leaked into an event. */
const FORBIDDEN_KEY_PATTERN = /(email|phone|msisdn|name|address|dob|birth|password|token|ip|device_id|user_id)/i;

export class AnalyticsPrivacyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsPrivacyError";
  }
}

export function assertNoPersonalData(properties: Readonly<Record<string, PropValue>>): void {
  for (const key of Object.keys(properties)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new AnalyticsPrivacyError(`Analytics property "${key}" looks like personal data and is not allowed.`);
    }
  }
}

/** Email addresses and phone numbers must never appear in values either. */
const PII_VALUE_PATTERNS = [/@/, /^\+?\d{9,}$/];

export function assertNoPersonalDataValues(properties: Readonly<Record<string, PropValue>>): void {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;
    if (PII_VALUE_PATTERNS.some((p) => p.test(value))) {
      throw new AnalyticsPrivacyError(`Analytics property "${key}" contains a value that looks like personal data.`);
    }
  }
}

const CATEGORY_BY_NAME: Record<EventName, AnalyticsCategory> = {
  app_open: "product",
  screen_view: "product",
  search_performed: "product",
  signup_completed: "product",
  follow_added: "product",
  favourite_added: "product",
  station_play_start: "playback",
  station_play_error: "playback",
  episode_play_start: "playback",
  episode_progress: "playback",
  video_play_start: "playback",
  rebuffer: "playback",
  ad_impression: "advertising",
  ad_click: "advertising",
};

export const categoryOf = (name: EventName): AnalyticsCategory => CATEGORY_BY_NAME[name];

/** Consent is per category: accepting product analytics does not accept ad tracking. */
export function hasConsent(consent: ConsentState, category: AnalyticsCategory): boolean {
  switch (category) {
    case "product":
      return consent.product;
    case "playback":
      return consent.playback;
    case "advertising":
      return consent.advertising;
  }
}

export function buildEvent<N extends EventName>(
  name: N,
  properties: EventDefinitions[N]["properties"],
  context: { consent: ConsentState; platform: Platform; appVersion: string; sessionId: string; now?: () => Date },
): EventEnvelope | null {
  const category = CATEGORY_BY_NAME[name];
  if (!hasConsent(context.consent, category)) return null;

  assertNoPersonalData(properties as Readonly<Record<string, PropValue>>);
  assertNoPersonalDataValues(properties as Readonly<Record<string, PropValue>>);

  return Object.freeze({
    name,
    category,
    properties: Object.freeze({ ...properties }),
    occurredAt: (context.now ?? (() => new Date()))().toISOString(),
    platform: context.platform,
    appVersion: context.appVersion,
    sessionId: context.sessionId,
  });
}

export const NO_CONSENT: ConsentState = Object.freeze({ product: false, playback: false, advertising: false });
