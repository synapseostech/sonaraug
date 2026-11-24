/**
 * Creator/broadcaster domain contracts.
 *
 * These mirror the eventual database shapes (stations, station_streams, channels,
 * podcasts, episodes, videos, moderation) so a Supabase repository can replace
 * the local mock repository without touching a single component.
 *
 * Nothing here is platform-specific: the same types serve the web studio, the
 * admin console and, later, the mobile creator app.
 */

/* -------------------------------------------------------------------------- */
/* Market vocabulary                                                          */
/* -------------------------------------------------------------------------- */

export type CountryCode = "UG" | "KE" | "TZ" | "RW" | "SS";

export type Market = {
  readonly code: CountryCode;
  readonly name: string;
  /** ISO 3166-1 alpha-2, used for flags and future per-market configuration. */
  readonly iso: string;
  readonly regions: readonly string[];
  readonly languages: readonly string[];
  /** Markets we have actually modelled content for. */
  readonly live: boolean;
};

/* -------------------------------------------------------------------------- */
/* Shared workflow vocabulary                                                 */
/* -------------------------------------------------------------------------- */

/** Every content item moves through the same publication pipeline. */
export type PublicationStatus =
  | "draft"
  | "recording"
  | "editing"
  | "review"
  | "scheduled"
  | "published"
  | "rejected"
  | "withdrawn";

/** The platform's verdict, never the creator's. */
export type ReviewStatus = "not_submitted" | "pending" | "approved" | "changes_requested" | "rejected";

export type RightsDeclaration = "original" | "licensed" | "broadcaster_authorised" | "undisclosed";

export type ContentKind = "podcast_episode" | "video" | "radio_programme";

/** Roles that exist in this build. Real authorisation arrives with Supabase Auth + RLS. */
export type ActorRole = "creator" | "broadcaster" | "reviewer" | "admin" | "platform_monitor";

export type AuditEntry = {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly actorRole: ActorRole;
  readonly action: string;
  readonly reason: string | null;
  /** Status before and after, so history is readable without joining tables. */
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
};

/* -------------------------------------------------------------------------- */
/* Radio: stations, streams, submissions                                      */
/* -------------------------------------------------------------------------- */

export type OperatingStatus = "on_air" | "off_air" | "unknown" | "suspended";

/** Technical reachability. Deliberately separate from legal authorisation. */
export type StreamHealth = "unverified" | "healthy" | "failing" | "blocked";

/** Who may rebroadcast. Separate axis from StreamHealth — never collapse these. */
export type IntegrationPermission = "not_requested" | "pending" | "granted" | "denied" | "third_party_only";

export type StreamFormat = "mp3" | "aac" | "hls" | "opus";

export type StreamEndpointDraft = {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly role: "primary" | "backup";
  readonly format: StreamFormat;
  readonly bitrateKbps: number | null;
  /** Only a platform monitor may set this — enforced in workflow.ts. */
  readonly health: StreamHealth;
  readonly lastCheckedAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastFailureReason: string | null;
  readonly verifiedByPlatform: boolean;
  readonly history: readonly StreamCheck[];
};

export type StreamCheck = {
  readonly id: string;
  readonly at: string;
  readonly actorRole: ActorRole;
  readonly result: "healthy" | "failing";
  readonly detail: string;
  readonly decodedBytes: number | null;
  readonly sustainedSeconds: number | null;
};

export type StationSubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "suspended";

export type StationEvidence = {
  readonly ownershipStatement: string;
  readonly broadcastingLicence: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly documents: readonly { readonly id: string; readonly name: string; readonly note: string }[];
};

export type StationSubmission = {
  readonly id: string;
  readonly name: string;
  readonly frequency: string | null;
  readonly country: CountryCode;
  readonly region: string;
  readonly city: string;
  readonly languages: readonly string[];
  readonly genres: readonly string[];
  readonly description: string;
  readonly website: string | null;
  readonly logoSeed: string;
  readonly logoDataUrl: string | null;
  readonly status: StationSubmissionStatus;
  readonly operatingStatus: OperatingStatus;
  readonly integrationPermission: IntegrationPermission;
  readonly streams: readonly StreamEndpointDraft[];
  readonly evidence: StationEvidence;
  readonly submittedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly changeRequest: string | null;
  readonly decisions: readonly AuditEntry[];
  /** True for the demo submissions seeded locally — never a real partnership claim. */
  readonly isDemo: boolean;
};

/* -------------------------------------------------------------------------- */
/* Creator: channels, shows, episodes, videos                                 */
/* -------------------------------------------------------------------------- */

export type Channel = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly kind: "podcast" | "video" | "both";
  readonly bio: string;
  readonly avatarSeed: string;
  readonly country: CountryCode;
  readonly languages: readonly string[];
  readonly createdAt: string;
  /** Demo metric — labelled as such wherever it is rendered. */
  readonly followersDemo: number;
};

export type Host = { readonly id: string; readonly name: string; readonly role: string };

export type Show = {
  readonly id: string;
  readonly channelId: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly categories: readonly string[];
  readonly languages: readonly string[];
  readonly hosts: readonly Host[];
  readonly artworkSeed: string;
  readonly artworkDataUrl: string | null;
  readonly explicit: boolean;
  readonly createdAt: string;
  /** Channel-level review: a show must be approved before its episodes can publish. */
  readonly reviewStatus: ReviewStatus;
  readonly rights: RightsDeclaration;
};

export type Episode = {
  readonly id: string;
  readonly showId: string;
  readonly seasonNumber: number;
  readonly number: number;
  readonly title: string;
  readonly description: string;
  readonly audioSource: "none" | "recording" | "upload";
  readonly mediaAssetId: string | null;
  readonly durationSeconds: number | null;
  readonly explicit: boolean;
  readonly rights: RightsDeclaration;
  readonly publicationStatus: PublicationStatus;
  readonly reviewStatus: ReviewStatus;
  readonly scheduledFor: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewNote: string | null;
  readonly history: readonly AuditEntry[];
};

export type VideoItem = {
  readonly id: string;
  readonly channelId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly visibility: "private" | "unlisted" | "public";
  readonly thumbnail: "auto" | "custom";
  readonly fileName: string | null;
  readonly fileSizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly rights: RightsDeclaration;
  readonly publicationStatus: PublicationStatus;
  readonly reviewStatus: ReviewStatus;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewNote: string | null;
  readonly history: readonly AuditEntry[];
};

/** Local-only media. There is no cloud storage in this phase and the UI says so. */
export type MediaAsset = {
  readonly id: string;
  readonly name: string;
  readonly kind: "recording" | "upload";
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number | null;
  readonly createdAt: string;
  readonly localOnly: true;
  readonly source: string;
};

/* -------------------------------------------------------------------------- */
/* Live broadcasting (simulated)                                              */
/* -------------------------------------------------------------------------- */

export type ProgrammeSlot = {
  readonly id: string;
  readonly stationId: string;
  readonly title: string;
  readonly host: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly notes: string;
};

export type BroadcastSession = {
  readonly id: string;
  readonly stationId: string;
  readonly title: string;
  readonly host: string;
  readonly startedAt: string | null;
  /** Purely a local simulation: no RTMP/SRT ingest exists in this phase. */
  readonly simulatedState: "idle" | "connecting" | "live" | "stopped";
  readonly listenersDemo: number;
  readonly ingestTarget: string;
};

/* -------------------------------------------------------------------------- */
/* Moderation and reporting                                                   */
/* -------------------------------------------------------------------------- */

export type ContentReport = {
  readonly id: string;
  readonly targetKind: "podcast_episode" | "video" | "station" | "comment";
  readonly targetId: string;
  readonly targetTitle: string;
  readonly reason: string;
  readonly detail: string;
  readonly reporter: string;
  readonly createdAt: string;
  readonly status: "open" | "actioned" | "dismissed";
};

export type ModerationRecord = {
  readonly id: string;
  readonly at: string;
  readonly targetKind: ContentReport["targetKind"];
  readonly targetTitle: string;
  readonly action: "approve" | "reject" | "request_changes" | "suspend" | "dismiss_report" | "remove_content";
  readonly reason: string;
  readonly actor: string;
};
