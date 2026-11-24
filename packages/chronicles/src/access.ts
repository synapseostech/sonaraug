/**
 * Medical Chronicles access rules.
 *
 * The rule, stated once:
 *   - A series that does not require a subscription is entirely free.
 *   - Otherwise the first N *published* episodes of the series, in published
 *     order, are free, where N is the series allowance (platform default 2).
 *   - An episode-level override ("free" or "premium") beats the position rule.
 *   - Premium episodes need an active listener entitlement.
 *
 * "Published order" is (season, episode number, publish time, id). Drafts,
 * scheduled-but-not-yet-live and withdrawn episodes take no position, so
 * withdrawing episode 1 makes the next published episode free. The allowance
 * counts positions: overriding episode 2 to premium does NOT make episode 3 free.
 *
 * These functions are pure and run on the server. The UI only displays their
 * result; it never decides access.
 */

export type AccessOverride = "inherit" | "free" | "premium";

export const DEFAULT_FREE_EPISODE_ALLOWANCE = 2;
export const MAX_FREE_EPISODE_ALLOWANCE = 500;

export type SeriesAccessConfig = {
  readonly id: string;
  readonly requiresSubscription: boolean;
  /** Null means "use the platform default". */
  readonly freeEpisodeAllowance: number | null;
};

export type EpisodeForOrdering = {
  readonly id: string;
  readonly seriesId: string;
  readonly season: number | null;
  readonly episodeNumber: number | null;
  readonly publishedAt: string | null;
  readonly status: string;
  readonly accessOverride: AccessOverride;
};

/** True when an episode is live for the public at `now`. */
export function isPubliclyLive(episode: Pick<EpisodeForOrdering, "status" | "publishedAt">, now: Date): boolean {
  if (episode.status !== "published" || !episode.publishedAt) return false;
  return Date.parse(episode.publishedAt) <= now.getTime();
}

export function compareEpisodes(a: EpisodeForOrdering, b: EpisodeForOrdering): number {
  const season = (a.season ?? 1) - (b.season ?? 1);
  if (season !== 0) return season;
  const number = (a.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (b.episodeNumber ?? Number.MAX_SAFE_INTEGER);
  if (number !== 0) return number;
  const time = Date.parse(a.publishedAt ?? "") - Date.parse(b.publishedAt ?? "");
  if (Number.isFinite(time) && time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Publicly live episodes of a series, in published order. */
export function publishedOrder<T extends EpisodeForOrdering>(episodes: readonly T[], seriesId: string, now: Date): T[] {
  return episodes.filter((e) => e.seriesId === seriesId && isPubliclyLive(e, now)).sort(compareEpisodes);
}

export function effectiveAllowance(series: SeriesAccessConfig, platformDefault = DEFAULT_FREE_EPISODE_ALLOWANCE): number {
  const value = series.freeEpisodeAllowance ?? platformDefault;
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, MAX_FREE_EPISODE_ALLOWANCE);
}

export type EpisodeTier = "free" | "premium";

/**
 * Tier of one episode. Episodes that are not publicly live still get a tier
 * (from their override, else premium when the series is gated) so editors can
 * preview what listeners will see.
 */
export function episodeTier(
  episode: EpisodeForOrdering,
  series: SeriesAccessConfig,
  allEpisodes: readonly EpisodeForOrdering[],
  now: Date,
  platformDefault = DEFAULT_FREE_EPISODE_ALLOWANCE,
): EpisodeTier {
  if (!series.requiresSubscription) return "free";
  if (episode.accessOverride === "free") return "free";
  if (episode.accessOverride === "premium") return "premium";
  const order = publishedOrder(allEpisodes, series.id, now);
  const position = order.findIndex((e) => e.id === episode.id);
  if (position === -1) return "premium";
  return position < effectiveAllowance(series, platformDefault) ? "free" : "premium";
}

export type ViewerAccess = {
  readonly signedIn: boolean;
  /** From the entitlement engine; listener audience only. */
  readonly listenerPremium: boolean;
  /** Staff with Medical Chronicles edit/review rights may preview unpublished work. */
  readonly canPreviewUnpublished: boolean;
};

export type AccessReason =
  | "free_episode"
  | "subscriber"
  | "staff_preview"
  | "subscription_required"
  | "sign_in_required"
  | "not_published"
  | "withdrawn";

export type AccessDecision = { readonly allowed: boolean; readonly tier: EpisodeTier; readonly reason: AccessReason };

export function decideEpisodeAccess(input: {
  episode: EpisodeForOrdering;
  series: SeriesAccessConfig & { status: string };
  allEpisodes: readonly EpisodeForOrdering[];
  viewer: ViewerAccess;
  now: Date;
  platformDefaultAllowance?: number;
  /** Platform setting: free episodes need a (free) account. Default false. */
  freeRequiresAccount?: boolean;
}): AccessDecision {
  const { episode, series, viewer, now } = input;
  const tier = episodeTier(episode, series, input.allEpisodes, now, input.platformDefaultAllowance);
  const live = isPubliclyLive(episode, now) && series.status === "published";

  if (!live) {
    if (viewer.canPreviewUnpublished) return { allowed: true, tier, reason: "staff_preview" };
    return { allowed: false, tier, reason: episode.status === "withdrawn" ? "withdrawn" : "not_published" };
  }
  if (tier === "free") {
    if (input.freeRequiresAccount && !viewer.signedIn) return { allowed: false, tier, reason: "sign_in_required" };
    return { allowed: true, tier, reason: "free_episode" };
  }
  if (viewer.listenerPremium) return { allowed: true, tier, reason: "subscriber" };
  if (viewer.canPreviewUnpublished) return { allowed: true, tier, reason: "staff_preview" };
  return { allowed: false, tier, reason: viewer.signedIn ? "subscription_required" : "sign_in_required" };
}

export const ACCESS_MESSAGES: Record<AccessReason, string> = {
  free_episode: "Free episode",
  subscriber: "Included in your subscription",
  staff_preview: "Staff preview — not necessarily visible to listeners",
  subscription_required: "This episode needs a Sonara listener subscription.",
  sign_in_required: "Sign in or create a free account to continue.",
  not_published: "This episode is not published.",
  withdrawn: "This episode has been withdrawn.",
};
