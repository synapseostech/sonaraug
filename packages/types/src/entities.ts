import type {
  AccountStatus,
  ContentStatus,
  MonetisationStatus,
  StreamStatus,
  VerificationStatus,
  Visibility,
} from "./status.ts";

/** ISO-8601 timestamp with timezone, e.g. "2026-11-18T21:55:00+03:00". */
export type IsoDateTime = string;
export type Uuid = string;
/** Money in minor units (UGX has no minor unit, so this equals whole shillings). */
export type MinorUnits = number;

export type StationSummary = {
  readonly id: Uuid;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly artworkUrl: string | null;
  readonly categoryId: string | null;
  readonly regionCode: string | null;
  readonly languageCodes: readonly string[];
  readonly isFeatured: boolean;
  readonly isLive: boolean;
  /** Null when no stream has been verified as playable. */
  readonly streamStatus: StreamStatus | null;
};

export type StationDetail = StationSummary & {
  readonly description: string | null;
  readonly frequencyText: string | null;
  readonly websiteUrl: string | null;
  readonly organisation: { readonly id: Uuid; readonly name: string; readonly slug: string };
  readonly programmes: readonly ProgrammeSummary[];
};

export type ProgrammeSummary = {
  readonly id: Uuid;
  readonly title: string;
  readonly presenterNames: readonly string[];
  readonly schedule: readonly ScheduleSlot[];
};

export type ScheduleSlot = {
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly timezone: string;
};

export type PodcastSummary = {
  readonly id: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly episodeCount: number;
  readonly categoryId: string | null;
  readonly languageCode: string | null;
  readonly latestEpisodeAt: IsoDateTime | null;
};

export type EpisodeSummary = {
  readonly id: Uuid;
  readonly podcastId: Uuid;
  readonly title: string;
  readonly durationSeconds: number | null;
  readonly publishedAt: IsoDateTime;
  readonly artworkUrl: string | null;
  readonly downloadAllowed: boolean;
};

export type VideoSummary = {
  readonly id: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly thumbnailUrl: string | null;
  readonly durationSeconds: number | null;
  readonly publishedAt: IsoDateTime;
  readonly channel: { readonly id: Uuid; readonly name: string; readonly isVerified: boolean };
};

export type ChannelSummary = {
  readonly id: Uuid;
  readonly slug: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly isVerified: boolean;
  readonly monetisationStatus: MonetisationStatus;
};

/** Row shapes for the tables the listener app reads directly through RLS. */
export type ProfileRow = {
  readonly id: Uuid;
  readonly handle: string | null;
  readonly display_name: string;
  readonly bio: string | null;
  readonly avatar_asset_id: Uuid | null;
  readonly country_code: string;
  readonly locale: string;
  readonly status: AccountStatus;
  readonly created_at: IsoDateTime;
};

export type StationRow = {
  readonly id: Uuid;
  readonly org_id: Uuid;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly artwork_asset_id: Uuid | null;
  readonly category_id: string | null;
  readonly region_code: string | null;
  readonly language_codes: string[];
  readonly status: ContentStatus;
  readonly is_featured: boolean;
  readonly published_at: IsoDateTime | null;
};

export type OrganisationRow = {
  readonly id: Uuid;
  readonly slug: string;
  readonly legal_name: string;
  readonly trading_name: string | null;
  readonly org_type: "broadcaster" | "creator_network" | "advertiser" | "agency";
  readonly verification_status: VerificationStatus;
  readonly verified_at: IsoDateTime | null;
};

export type VideoRow = {
  readonly id: Uuid;
  readonly channel_id: Uuid;
  readonly slug: string;
  readonly title: string;
  readonly status: ContentStatus;
  readonly visibility: Visibility;
  readonly published_at: IsoDateTime | null;
  readonly allow_comments: boolean;
};

/** Reference data shape used by filters and pickers. */
export type ReferenceItem = { readonly code: string; readonly label: string };
