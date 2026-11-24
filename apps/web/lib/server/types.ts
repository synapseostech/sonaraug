/**
 * Record shapes held by the server-side repository. They mirror the Postgres
 * tables in supabase/migrations 0010–0140 (camelCase here, snake_case there) so
 * the local development store can be replaced by the Supabase adapter without
 * changing callers.
 */
import type { PlatformRole } from "@kito/types";
import type {
  EntitlementOverride,
  PaymentTransaction,
  Plan,
  PromoCode,
  Subscription,
} from "@kito/billing";
import type { AccessOverride, AiDisclosure, EditorialStatus, Reference, SourceKind, SourceStatus } from "@kito/chronicles";

export type AccountStatus = "active" | "suspended" | "deleted";

export type NotificationKind =
  | "welcome"
  | "email_verification"
  | "password_reset"
  | "subscription_confirmed"
  | "payment_receipt"
  | "payment_failed"
  | "renewal_reminder"
  | "subscription_cancelled"
  | "creator_application_received"
  | "creator_application_decided"
  | "episode_submitted"
  | "episode_decided"
  | "episode_published"
  | "security_event";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: AccountStatus;
  emailVerifiedAt: string | null;
  roles: PlatformRole[];
  termsVersion: string;
  privacyVersion: string;
  termsAcceptedAt: string;
  profileCompletedAt: string | null;
  bio: string;
  phone: string | null;
  country: string;
  locale: string;
  preferences: { playbackSpeed: number; autoplayNext: boolean; dataSaver: boolean };
  /** Kind → email enabled. Security and transactional notices are always sent. */
  emailPreferences: Partial<Record<NotificationKind, boolean>>;
  marketingConsent: boolean;
  failedLogins: number;
  lockedUntil: string | null;
  deletionRequestedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = {
  /** sha256 of the cookie token; the token itself is never stored. */
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string;
};

export type TokenRecord = {
  hash: string;
  userId: string;
  kind: "verify_email" | "reset_password";
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export type McCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: "topic" | "specialty";
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type McSeries = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverAssetId: string | null;
  categoryId: string | null;
  specialtyId: string | null;
  editorDisplay: string;
  hostDisplay: string;
  status: "draft" | "published" | "archived";
  requiresSubscription: boolean;
  freeEpisodeAllowance: number | null;
  publishedAt: string | null;
  seoTitle: string;
  seoDescription: string;
  relatedSeriesIds: string[];
  isSample: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McEpisodeSource = {
  kind: SourceKind;
  url: string | null;
  assetId: string | null;
  status: SourceStatus;
  statusNote: string;
  checkedAt: string | null;
  updatedAt: string;
};

export type McEpisode = {
  id: string;
  seriesId: string;
  slug: string;
  title: string;
  description: string;
  season: number | null;
  episodeNumber: number | null;
  coverAssetId: string | null;
  durationSeconds: number | null;
  transcript: string;
  contentNotes: string;
  references: Reference[];
  aiDisclosure: AiDisclosure | null;
  accessOverride: AccessOverride;
  downloadAllowed: boolean;
  status: EditorialStatus;
  version: number;
  source: McEpisodeSource | null;
  submittedBy: string | null;
  submittedAt: string | null;
  lastEditedBy: string | null;
  approvedVersion: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
  lastReviewedAt: string | null;
  lastReviewedBy: string | null;
  relatedEpisodeIds: string[];
  isSample: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McVersion = { id: string; episodeId: string; version: number; snapshot: Omit<McEpisode, "source"> & { source: McEpisodeSource | null }; changeNote: string; editedBy: string; createdAt: string };
export type McEditorialEvent = { id: string; episodeId: string; actorId: string; action: string; fromStatus: EditorialStatus; toStatus: EditorialStatus; version: number; note: string; createdAt: string };
export type McCorrection = { id: string; episodeId: string; version: number; summary: string; correctedBy: string; createdAt: string };

export type MediaAsset = {
  id: string;
  kind: "audio" | "image";
  mime: string;
  bytes: number;
  sha256: string;
  storage: "local_disk";
  path: string;
  originalName: string;
  uploadedBy: string;
  createdAt: string;
};

export type WebhookEventRecord = {
  id: string;
  provider: "flutterwave";
  idempotencyKey: string | null;
  eventType: string | null;
  providerTransactionId: string | null;
  txRef: string | null;
  signatureValid: boolean;
  processingStatus: "received" | "processed" | "ignored" | "failed" | "rejected" | "duplicate";
  error: string | null;
  /** Stored only for signed deliveries, with customer PII reduced. */
  payloadSummary: Record<string, unknown> | null;
  receivedAt: string;
  processedAt: string | null;
  attempts: number;
};

export type RefundRequest = {
  id: string;
  transactionId: string;
  requestedBy: string;
  reason: string;
  status: "requested" | "approved" | "rejected" | "processing" | "refunded";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
};

export type ListeningEntry = { id: string; userId: string; episodeId: string; startedAt: string; lastPositionSeconds: number; durationSeconds: number | null; control: "sonara" | "provider" };
export type SavedEntry = { userId: string; episodeId: string; savedAt: string };

export type NotificationRecord = { id: string; userId: string; kind: NotificationKind; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };
export type OutboxEmail = { id: string; to: string; kind: NotificationKind; subject: string; text: string; createdAt: string; provider: "dev_outbox" };

export type AuditRecord = {
  id: string;
  seq: number;
  actorId: string | null;
  actorRoles: PlatformRole[];
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  requestId: string;
  occurredAt: string;
  /** Hash chain: sha256(prevHash + this record). Detects edits to the log file. */
  prevHash: string;
  hash: string;
};

export type CreatorApplication = {
  id: string;
  userId: string;
  displayName: string;
  biography: string;
  contentCategory: string;
  showProposal: string;
  rightsDeclaration: boolean;
  termsVersion: string;
  status: "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSettings = {
  defaultFreeEpisodeAllowance: number;
  freeRequiresAccount: boolean;
  graceDays: number;
  trialsEnabled: boolean;
  defaultCurrency: string;
  livePaymentsEnabled: boolean;
  maintenanceMode: boolean;
  regions: string[];
  authorisedAudioHosts: string[];
  termsVersion: string;
  privacyVersion: string;
};

export type DataShape = {
  schemaVersion: 1;
  users: UserRecord[];
  sessions: SessionRecord[];
  tokens: TokenRecord[];
  mcCategories: McCategory[];
  mcSeries: McSeries[];
  mcEpisodes: McEpisode[];
  mcVersions: McVersion[];
  mcEditorialEvents: McEditorialEvent[];
  mcCorrections: McCorrection[];
  media: MediaAsset[];
  plans: Plan[];
  promos: PromoCode[];
  subscriptions: Subscription[];
  transactions: PaymentTransaction[];
  webhookEvents: WebhookEventRecord[];
  overrides: EntitlementOverride[];
  refunds: RefundRequest[];
  listening: ListeningEntry[];
  saved: SavedEntry[];
  notifications: NotificationRecord[];
  outbox: OutboxEmail[];
  audit: AuditRecord[];
  creatorApplications: CreatorApplication[];
  settings: PlatformSettings;
};
