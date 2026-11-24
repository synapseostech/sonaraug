/**
 * String unions mirroring the PostgreSQL enum types in supabase/migrations.
 *
 * They are written by hand rather than generated so that a schema change
 * without a type update fails `pnpm typecheck` in CI (see docs/decisions/
 * ADR-0005-generated-types.md for the generated layer that sits on top).
 */

export type AccountStatus = "active" | "suspended" | "deleted";
export type PlatformRole =
  | "super_admin"
  | "admin"
  | "moderator"
  | "support"
  | "finance"
  /** Medical Chronicles: drafts and edits episodes. */
  | "content_editor"
  /** Medical Chronicles: reviews, approves, publishes and withdraws. */
  | "medical_reviewer";
export type OrgType = "broadcaster" | "creator_network" | "advertiser" | "agency";
export type VerificationStatus = "unverified" | "pending" | "submitted" | "verified" | "rejected" | "suspended";
export type OrgMemberRole = "owner" | "admin" | "editor" | "presenter" | "analyst" | "billing";
export type ContentStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "published"
  | "unpublished"
  | "blocked"
  | "removed"
  | "archived";
export type StreamStatus = "registered" | "verified" | "reachable" | "playable" | "degraded" | "failed" | "revoked";
export type MonetisationStatus = "ineligible" | "pending" | "eligible" | "active" | "suspended";
export type Visibility = "public" | "unlisted" | "private";

/** Statuses a listener is allowed to see. Single source of truth for the public API. */
export const PUBLIC_CONTENT_STATUS: ContentStatus = "published";
/** Stream statuses that may be served to a listener. */
export const PLAYABLE_STREAM_STATUSES: readonly StreamStatus[] = ["playable", "degraded"];

export const isPubliclyVisible = (status: ContentStatus, visibility: Visibility = "public"): boolean =>
  status === PUBLIC_CONTENT_STATUS && visibility === "public";

export const isPlayableStream = (status: StreamStatus): boolean => PLAYABLE_STREAM_STATUSES.includes(status);
