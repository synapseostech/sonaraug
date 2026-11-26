/**
 * Mapping between Postgres rows (supabase/migrations) and the record shapes the
 * services use (lib/server/types.ts, @kito/billing). One definition per
 * collection: which table, how to read it, how to write it, and as whom.
 *
 *   writer "caller"  — persisted with the request's identity (RLS + triggers decide)
 *   writer "system"  — persisted with service_role; only reached after the service
 *                      has authorised the action (payment processor, notifications,
 *                      audit, media registration)
 */
import type { EntitlementOverride, PaymentTransaction, Plan, PromoCode, Subscription } from "@kito/billing";
import type {
  AuditRecord,
  CreatorApplication,
  ListeningEntry,
  McCategory,
  McCorrection,
  McEditorialEvent,
  McEpisode,
  McSeries,
  McVersion,
  MediaAsset,
  NotificationRecord,
  PlatformSettings,
  RefundRequest,
  SavedEntry,
  UserRecord,
  WebhookEventRecord,
} from "../types.ts";

type Row = Record<string, unknown>;

export const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoReq = (v: unknown): string => iso(v) ?? new Date(0).toISOString();
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export type CollectionDef<T> = {
  table: string;
  /** Primary-key column used for updates and deletes. */
  key: string;
  idOf: (item: T) => string;
  /** SELECT list (may use the table alias `t`). */
  select: string;
  fromRow: (row: Row) => T;
  /** Columns to write. Omitted ⇒ the collection is read-only through the generic persister. */
  toRow?: (item: T) => Row;
  /** Generated keys (identity) are not written on insert. */
  insertOmit?: readonly string[];
  writer: "caller" | "system";
  insertOnly?: boolean;
  deletable?: boolean;
};

/* ------------------------------------------------------------- Medical Chronicles */

export const mcCategories: CollectionDef<McCategory> = {
  table: "mc_categories",
  key: "id",
  idOf: (c) => c.id,
  select: "t.*",
  fromRow: (r) => ({ id: String(r.id), slug: String(r.slug), name: String(r.name), description: text(r.description), kind: r.kind as McCategory["kind"], sortOrder: Number(r.sort_order), isActive: Boolean(r.is_active), createdAt: isoReq(r.created_at), updatedAt: isoReq(r.updated_at) }),
  toRow: (c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, kind: c.kind, sort_order: c.sortOrder, is_active: c.isActive }),
  writer: "caller",
};

export const mcSeries: CollectionDef<McSeries> = {
  table: "mc_series",
  key: "id",
  idOf: (s) => s.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), slug: String(r.slug), title: String(r.title), description: text(r.description), coverAssetId: str(r.cover_asset_id),
    categoryId: str(r.category_id), specialtyId: str(r.specialty_id), editorDisplay: text(r.editor_display), hostDisplay: text(r.host_display),
    status: r.status as McSeries["status"], requiresSubscription: Boolean(r.requires_subscription), freeEpisodeAllowance: num(r.free_episode_allowance),
    publishedAt: iso(r.published_at), seoTitle: text(r.seo_title), seoDescription: text(r.seo_description), relatedSeriesIds: (r.related_series_ids as string[] | null) ?? [],
    isSample: Boolean(r.is_sample), createdBy: str(r.created_by), createdAt: isoReq(r.created_at), updatedAt: isoReq(r.updated_at),
  }),
  toRow: (s) => ({
    id: s.id, slug: s.slug, title: s.title, description: s.description, cover_asset_id: s.coverAssetId, category_id: s.categoryId, specialty_id: s.specialtyId,
    editor_display: s.editorDisplay, host_display: s.hostDisplay, status: s.status, requires_subscription: s.requiresSubscription,
    free_episode_allowance: s.freeEpisodeAllowance, published_at: s.publishedAt, seo_title: s.seoTitle, seo_description: s.seoDescription,
    related_series_ids: s.relatedSeriesIds, is_sample: s.isSample, created_by: s.createdBy,
  }),
  writer: "caller",
};

/** Episodes; the audio source lives in mc_episode_sources and is persisted separately. */
export const mcEpisodes: CollectionDef<McEpisode> = {
  table: "mc_episodes",
  key: "id",
  idOf: (e) => e.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), seriesId: String(r.series_id), slug: String(r.slug), title: String(r.title), description: text(r.description),
    season: num(r.season), episodeNumber: num(r.episode_number), coverAssetId: str(r.cover_asset_id), durationSeconds: num(r.duration_seconds),
    transcript: text(r.transcript), contentNotes: text(r.content_notes), references: (r.reference_list as McEpisode["references"]) ?? [],
    aiDisclosure: (r.ai_disclosure as McEpisode["aiDisclosure"]) ?? null, accessOverride: r.access_override as McEpisode["accessOverride"],
    downloadAllowed: Boolean(r.download_allowed), status: r.status as McEpisode["status"], version: Number(r.version), source: null, study: null,
    submittedBy: str(r.submitted_by), submittedAt: iso(r.submitted_at), lastEditedBy: str(r.last_edited_by), approvedVersion: num(r.approved_version),
    approvedBy: str(r.approved_by), approvedAt: iso(r.approved_at), publishedAt: iso(r.published_at), withdrawnAt: iso(r.withdrawn_at),
    withdrawnReason: str(r.withdrawn_reason), lastReviewedAt: iso(r.last_reviewed_at), lastReviewedBy: str(r.last_reviewed_by),
    relatedEpisodeIds: (r.related_episode_ids as string[] | null) ?? [], isSample: Boolean(r.is_sample), createdBy: str(r.created_by),
    createdAt: isoReq(r.created_at), updatedAt: isoReq(r.updated_at),
  }),
  toRow: (e) => ({
    id: e.id, series_id: e.seriesId, slug: e.slug, title: e.title, description: e.description, season: e.season, episode_number: e.episodeNumber,
    cover_asset_id: e.coverAssetId, duration_seconds: e.durationSeconds, transcript: e.transcript, content_notes: e.contentNotes,
    reference_list: JSON.stringify(e.references), ai_disclosure: e.aiDisclosure, access_override: e.accessOverride, download_allowed: e.downloadAllowed,
    status: e.status, version: e.version, submitted_by: e.submittedBy, submitted_at: e.submittedAt, approved_version: e.approvedVersion,
    approved_by: e.approvedBy, approved_at: e.approvedAt, published_at: e.publishedAt, withdrawn_at: e.withdrawnAt, withdrawn_reason: e.withdrawnReason,
    last_reviewed_at: e.lastReviewedAt, last_reviewed_by: e.lastReviewedBy, related_episode_ids: e.relatedEpisodeIds, is_sample: e.isSample,
    created_by: e.createdBy,
  }),
  writer: "caller",
};

export const mcVersions: CollectionDef<McVersion> = {
  table: "mc_episode_versions",
  key: "id",
  idOf: (v) => v.id,
  select: "t.*",
  fromRow: (r) => ({ id: String(r.id), episodeId: String(r.episode_id), version: Number(r.version), snapshot: r.snapshot as McVersion["snapshot"], changeNote: text(r.change_note), editedBy: text(r.edited_by), createdAt: isoReq(r.created_at) }),
  toRow: (v) => ({ episode_id: v.episodeId, version: v.version, snapshot: JSON.stringify(v.snapshot), change_note: v.changeNote, edited_by: v.editedBy }),
  writer: "caller",
  insertOnly: true,
};

export const mcEditorialEvents: CollectionDef<McEditorialEvent> = {
  table: "mc_editorial_events",
  key: "id",
  idOf: (e) => e.id,
  select: "t.*",
  fromRow: (r) => ({ id: String(r.id), episodeId: String(r.episode_id), actorId: text(r.actor_id), action: String(r.action), fromStatus: r.from_status as McEditorialEvent["fromStatus"], toStatus: r.to_status as McEditorialEvent["toStatus"], version: Number(r.version), note: text(r.note), createdAt: isoReq(r.created_at) }),
  toRow: (e) => ({ episode_id: e.episodeId, actor_id: e.actorId, action: e.action, from_status: e.fromStatus, to_status: e.toStatus, version: e.version, note: e.note }),
  writer: "caller",
  insertOnly: true,
};

export const mcCorrections: CollectionDef<McCorrection> = {
  table: "mc_corrections",
  key: "id",
  idOf: (c) => c.id,
  select: "t.*",
  fromRow: (r) => ({ id: String(r.id), episodeId: String(r.episode_id), version: Number(r.version), summary: String(r.summary), correctedBy: text(r.corrected_by), createdAt: isoReq(r.created_at) }),
  toRow: (c) => ({ id: c.id, episode_id: c.episodeId, version: c.version, summary: c.summary, corrected_by: c.correctedBy }),
  writer: "caller",
  insertOnly: true,
};

export const media: CollectionDef<MediaAsset> = {
  table: "media_assets",
  key: "id",
  idOf: (m) => m.id,
  select: "t.*",
  fromRow: (r) => {
    const meta = (r.metadata as Record<string, unknown>) ?? {};
    return { id: String(r.id), kind: r.kind === "image" ? "image" : "audio", mime: String(r.mime_type), bytes: Number(r.size_bytes ?? 0), sha256: text(r.checksum_sha256), storage: r.storage_backend === "supabase" ? "supabase" : "local_disk", path: text(r.storage_key), originalName: text(meta.originalName), uploadedBy: text(r.owner_profile_id), createdAt: isoReq(r.created_at) };
  },
  toRow: (m) => ({ id: m.id, kind: m.kind, storage_backend: m.storage === "supabase" ? "supabase" : "local_dev", storage_key: m.path, mime_type: m.mime, size_bytes: m.bytes, checksum_sha256: m.sha256, status: "ready", owner_profile_id: m.uploadedBy, metadata: JSON.stringify({ originalName: m.originalName }) }),
  writer: "system",
  insertOnly: true,
};

/* ----------------------------------------------------------------------- billing */

export const plans: CollectionDef<Plan> = {
  table: "subscription_plans",
  key: "id",
  idOf: (p) => p.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), audience: r.audience as Plan["audience"], code: String(r.code), name: String(r.name), description: text(r.description),
    interval: r.interval as Plan["interval"], amount: Number(r.amount), currency: String(r.currency).trim(), active: Boolean(r.is_active), trialDays: Number(r.trial_days),
    features: (r.features as string[]) ?? [], creatorLimits: (r.creator_limits as Plan["creatorLimits"]) ?? null, providerPlanId: str(r.provider_plan_id),
    priceIsPlaceholder: Boolean(r.price_is_placeholder), sortOrder: Number(r.sort_order),
  }),
  toRow: (p) => ({
    id: p.id, audience: p.audience, code: p.code, name: p.name, description: p.description, interval: p.interval, amount: p.amount, currency: p.currency,
    is_active: p.active, trial_days: p.trialDays, features: JSON.stringify(p.features), creator_limits: p.creatorLimits ? JSON.stringify(p.creatorLimits) : null,
    provider_plan_id: p.providerPlanId, price_is_placeholder: p.priceIsPlaceholder, sort_order: p.sortOrder,
  }),
  writer: "caller",
};

export const promos: CollectionDef<PromoCode> = {
  table: "promo_codes",
  key: "id",
  idOf: (p) => p.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), code: String(r.code), description: text(r.description), percentOff: num(r.percent_off), amountOff: num(r.amount_off), currency: r.currency ? String(r.currency).trim() : null,
    planIds: (r.plan_ids as string[] | null) ?? null, validFrom: iso(r.valid_from), validUntil: iso(r.valid_until), maxRedemptions: num(r.max_redemptions),
    redemptions: Number(r.redemptions), active: Boolean(r.is_active),
  }),
  toRow: (p) => ({
    id: p.id, code: p.code, description: p.description, percent_off: p.percentOff, amount_off: p.amountOff, currency: p.currency, plan_ids: p.planIds,
    valid_from: p.validFrom, valid_until: p.validUntil, max_redemptions: p.maxRedemptions, redemptions: p.redemptions, is_active: p.active,
  }),
  writer: "caller",
};

export const subscriptions: CollectionDef<Subscription> = {
  table: "subscriptions",
  key: "id",
  idOf: (s) => s.id,
  select: "t.*, coalesce((select array_agg(sp.transaction_id::text order by sp.applied_at) from public.subscription_payments sp where sp.subscription_id = t.id), '{}') as applied_ids",
  fromRow: (r) => ({
    id: String(r.id), userId: String(r.profile_id), planId: String(r.plan_id), audience: r.audience as Subscription["audience"], status: r.status as Subscription["status"],
    currentPeriodStart: iso(r.current_period_start), currentPeriodEnd: iso(r.current_period_end), cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    cancelledAt: iso(r.cancelled_at), renewalMode: r.renewal_mode as Subscription["renewalMode"], providerSubscriptionId: str(r.provider_subscription_id),
    isTrial: Boolean(r.is_trial), appliedTransactionIds: (r.applied_ids as string[]) ?? [], createdAt: isoReq(r.created_at), updatedAt: isoReq(r.updated_at),
  }),
  toRow: (s) => ({
    id: s.id, profile_id: s.userId, plan_id: s.planId, audience: s.audience, status: s.status, current_period_start: s.currentPeriodStart,
    current_period_end: s.currentPeriodEnd, cancel_at_period_end: s.cancelAtPeriodEnd, cancelled_at: s.cancelledAt, renewal_mode: s.renewalMode,
    provider_subscription_id: s.providerSubscriptionId, is_trial: s.isTrial,
  }),
  writer: "system",
};

export const transactions: CollectionDef<PaymentTransaction> = {
  table: "payment_transactions",
  key: "id",
  idOf: (t) => t.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), txRef: String(r.tx_ref), userId: String(r.profile_id), planId: String(r.plan_id), audience: r.audience as PaymentTransaction["audience"],
    purpose: r.purpose as PaymentTransaction["purpose"], amount: Number(r.amount), currency: String(r.currency).trim(), promoCodeId: str(r.promo_code_id),
    status: r.status as PaymentTransaction["status"], provider: "flutterwave", environment: r.environment as PaymentTransaction["environment"],
    providerTransactionId: str(r.provider_transaction_id), providerRef: str(r.provider_ref), paymentType: str(r.payment_type), chargedAmount: num(r.charged_amount),
    overpaid: Boolean(r.overpaid), failureReason: str(r.failure_reason), verifiedAt: iso(r.verified_at), subscriptionId: str(r.subscription_id),
    refundStatus: r.refund_status as PaymentTransaction["refundStatus"], providerTxRef: str(r.provider_tx_ref), createdAt: isoReq(r.created_at), updatedAt: isoReq(r.updated_at),
  }),
  toRow: (t) => ({
    id: t.id, tx_ref: t.txRef, profile_id: t.userId, plan_id: t.planId, audience: t.audience, purpose: t.purpose, amount: t.amount, currency: t.currency,
    promo_code_id: t.promoCodeId, status: t.status, environment: t.environment, provider_transaction_id: t.providerTransactionId, provider_ref: t.providerRef,
    payment_type: t.paymentType, charged_amount: t.chargedAmount, overpaid: t.overpaid, failure_reason: t.failureReason, verified_at: t.verifiedAt,
    subscription_id: t.subscriptionId, refund_status: t.refundStatus, provider_tx_ref: t.providerTxRef ?? null,
  }),
  writer: "system",
};

export const webhookEvents: CollectionDef<WebhookEventRecord> = {
  table: "payment_webhook_events",
  key: "id",
  idOf: (w) => w.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), provider: "flutterwave", idempotencyKey: str(r.idempotency_key), eventType: str(r.event_type), providerTransactionId: str(r.provider_transaction_id),
    txRef: str(r.tx_ref), signatureValid: Boolean(r.signature_valid), processingStatus: r.processing_status as WebhookEventRecord["processingStatus"], error: str(r.error),
    payloadSummary: (r.payload as Record<string, unknown>) ?? null, receivedAt: isoReq(r.received_at), processedAt: iso(r.processed_at), attempts: Number(r.attempts),
  }),
  toRow: (w) => ({
    id: w.id, idempotency_key: w.idempotencyKey, event_type: w.eventType, provider_transaction_id: w.providerTransactionId, tx_ref: w.txRef, signature_valid: w.signatureValid,
    processing_status: w.processingStatus, error: w.error, payload: w.payloadSummary ? JSON.stringify(w.payloadSummary) : null, received_at: w.receivedAt, processed_at: w.processedAt, attempts: w.attempts,
  }),
  writer: "system",
};

export const overrides: CollectionDef<EntitlementOverride> = {
  table: "entitlement_overrides",
  key: "id",
  idOf: (o) => o.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), userId: String(r.profile_id), audience: r.audience as EntitlementOverride["audience"], effect: r.effect as EntitlementOverride["effect"], planId: str(r.plan_id),
    validFrom: isoReq(r.valid_from), validUntil: iso(r.valid_until), reason: String(r.reason), createdBy: String(r.created_by), createdAt: isoReq(r.created_at),
    revokedAt: iso(r.revoked_at), revokedBy: str(r.revoked_by),
  }),
  // Written only through the audited RPCs grant_/revoke_entitlement_override (see persist.ts).
  writer: "caller",
};

export const refunds: CollectionDef<RefundRequest> = {
  table: "refund_requests",
  key: "id",
  idOf: (r) => r.id,
  select: "t.*",
  fromRow: (r) => ({ id: String(r.id), transactionId: String(r.transaction_id), requestedBy: String(r.requested_by), reason: String(r.reason), status: r.status as RefundRequest["status"], decidedBy: str(r.decided_by), decidedAt: iso(r.decided_at), decisionNote: str(r.decision_note), createdAt: isoReq(r.created_at) }),
  toRow: (r) => ({ id: r.id, transaction_id: r.transactionId, requested_by: r.requestedBy, reason: r.reason, status: r.status, decided_by: r.decidedBy, decided_at: r.decidedAt, decision_note: r.decisionNote }),
  writer: "caller",
};

/* ------------------------------------------------------------- people and activity */

export const listening: CollectionDef<ListeningEntry> = {
  table: "mc_listening_events",
  key: "id",
  idOf: (l) => l.id,
  select: "t.*",
  fromRow: (r) => ({ id: String(r.id), userId: String(r.profile_id), episodeId: String(r.episode_id), startedAt: isoReq(r.started_at), lastPositionSeconds: Number(r.last_position_seconds), durationSeconds: num(r.duration_seconds), control: r.control as ListeningEntry["control"] }),
  toRow: (l) => ({ id: l.id, profile_id: l.userId, episode_id: l.episodeId, started_at: l.startedAt, last_position_seconds: l.lastPositionSeconds, duration_seconds: l.durationSeconds, control: l.control }),
  writer: "caller",
};

export const saved: CollectionDef<SavedEntry> = {
  table: "mc_saved_episodes",
  key: "profile_id,episode_id",
  idOf: (s) => `${s.userId}|${s.episodeId}`,
  select: "t.*",
  fromRow: (r) => ({ userId: String(r.profile_id), episodeId: String(r.episode_id), savedAt: isoReq(r.saved_at) }),
  toRow: (s) => ({ profile_id: s.userId, episode_id: s.episodeId, saved_at: s.savedAt }),
  writer: "caller",
  insertOnly: true,
  deletable: true,
};

export const notifications: CollectionDef<NotificationRecord> = {
  table: "notifications",
  key: "id",
  idOf: (n) => n.id,
  select: "t.*",
  fromRow: (r) => ({ id: String(r.id), userId: String(r.profile_id), kind: r.kind as NotificationRecord["kind"], title: String(r.title), body: text(r.body), link: str(r.link), readAt: iso(r.read_at), createdAt: isoReq(r.created_at) }),
  toRow: (n) => ({ id: n.id, profile_id: n.userId, kind: n.kind, title: n.title, body: n.body, link: n.link, read_at: n.readAt }),
  writer: "system",
};

export const audit: CollectionDef<AuditRecord> = {
  table: "audit_logs",
  key: "id",
  idOf: (a) => a.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), seq: Number(r.id), actorId: str(r.actor_profile_id), actorRoles: (str(r.actor_role) ?? "").split(",").filter(Boolean) as AuditRecord["actorRoles"],
    action: String(r.action), entityType: String(r.entity_type), entityId: str(r.entity_id), before: r.before ?? null, after: r.after ?? null, reason: str(r.reason),
    requestId: text(r.request_id), occurredAt: isoReq(r.occurred_at), prevHash: text(r.prev_hash), hash: text(r.hash),
  }),
  writer: "system",
  insertOnly: true,
};

export const creatorApplications: CollectionDef<CreatorApplication> = {
  table: "creator_applications",
  key: "id",
  idOf: (a) => a.id,
  select: "t.*",
  fromRow: (r) => ({
    id: String(r.id), userId: String(r.profile_id), displayName: String(r.display_name), biography: String(r.biography), contentCategory: String(r.content_category),
    showProposal: String(r.show_proposal), rightsDeclaration: Boolean(r.rights_declaration), termsVersion: String(r.terms_version), status: r.status as CreatorApplication["status"],
    reviewedBy: str(r.reviewed_by), reviewedAt: iso(r.reviewed_at), decisionReason: str(r.decision_reason), createdAt: isoReq(r.created_at), updatedAt: isoReq(r.updated_at),
  }),
  toRow: (a) => ({
    id: a.id, profile_id: a.userId, display_name: a.displayName, biography: a.biography, content_category: a.contentCategory, show_proposal: a.showProposal,
    rights_declaration: a.rightsDeclaration, terms_version: a.termsVersion, status: a.status, decision_reason: a.decisionReason,
  }),
  writer: "caller",
};

/** Profiles joined to auth.users (read with service_role: emails are not client-readable). */
export const users: CollectionDef<UserRecord> = {
  table: "profiles",
  key: "id",
  idOf: (u) => u.id,
  select: `t.*, u.email::text as email, u.email_confirmed_at, u.banned_until,
    coalesce((select array_agg(pr.role::text order by pr.role) from public.platform_roles pr where pr.profile_id = t.id), '{}') as roles`,
  fromRow: (r) => {
    const prefs = (r.preferences as UserRecord["preferences"]) ?? { playbackSpeed: 1, autoplayNext: true, dataSaver: true };
    return {
      id: String(r.id), email: text(r.email).toLowerCase(), passwordHash: "", displayName: String(r.display_name), status: r.status as UserRecord["status"],
      emailVerifiedAt: iso(r.email_confirmed_at), roles: (r.roles as UserRecord["roles"]) ?? [], termsVersion: text(r.terms_version), privacyVersion: text(r.privacy_version),
      termsAcceptedAt: iso(r.terms_accepted_at) ?? "", profileCompletedAt: iso(r.profile_completed_at), bio: text(r.bio), phone: str(r.phone),
      country: String(r.country_code).trim(), locale: text(r.locale), preferences: prefs, emailPreferences: (r.email_preferences as UserRecord["emailPreferences"]) ?? {},
      marketingConsent: Boolean(r.marketing_consent), failedLogins: 0, lockedUntil: null, deletionRequestedAt: iso(r.deletion_requested_at),
      suspendedReason: str(r.suspended_reason), createdAt: isoReq(r.created_at), updatedAt: isoReq(r.updated_at),
    };
  },
  writer: "caller",
};

/** platform_settings key ↔ PlatformSettings field. */
export const SETTING_KEYS: Record<keyof PlatformSettings, string> = {
  defaultFreeEpisodeAllowance: "chronicles.default_free_episode_allowance",
  freeRequiresAccount: "chronicles.free_requires_account",
  graceDays: "billing.grace_days",
  trialsEnabled: "billing.trials_enabled",
  defaultCurrency: "billing.default_currency",
  livePaymentsEnabled: "billing.live_payments_enabled",
  maintenanceMode: "platform.maintenance_mode",
  regions: "platform.regions",
  authorisedAudioHosts: "media.authorised_audio_hosts",
  termsVersion: "policy.terms_version",
  privacyVersion: "policy.privacy_version",
};

export const COLLECTIONS = {
  mcCategories,
  mcSeries,
  mcEpisodes,
  mcVersions,
  mcEditorialEvents,
  mcCorrections,
  media,
  plans,
  promos,
  subscriptions,
  transactions,
  webhookEvents,
  overrides,
  refunds,
  listening,
  saved,
  notifications,
  audit,
  creatorApplications,
  users,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
