-- =============================================================================
-- 0002 — Enumerated types
-- =============================================================================
-- Enums are used instead of free-text status columns so that an invalid state
-- is a database error rather than a silently broken screen. Adding a value
-- later is a cheap `alter type`; removing one is not, so each list is kept
-- deliberately small.
-- =============================================================================

create type public.account_status as enum ('active', 'suspended', 'deleted');

create type public.platform_role as enum ('super_admin', 'admin', 'moderator', 'support', 'finance');

create type public.org_type as enum ('broadcaster', 'creator_network', 'advertiser', 'agency');

create type public.verification_status as enum
  ('unverified', 'pending', 'submitted', 'verified', 'rejected', 'suspended');

create type public.org_member_role as enum
  ('owner', 'admin', 'editor', 'presenter', 'analyst', 'billing');

-- One status vocabulary for all publishable content. Not every value is legal
-- for every entity; the per-table transitions are enforced by triggers.
create type public.content_status as enum
  ('draft', 'pending_review', 'scheduled', 'published', 'unpublished', 'blocked', 'removed', 'archived');

-- Media pipeline lifecycle. `quarantined` exists so a failed virus/format check
-- can never be served, even by accident.
create type public.media_status as enum
  ('pending_upload', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'quarantined');

create type public.media_kind as enum ('audio', 'video', 'image', 'caption', 'document');

create type public.storage_backend as enum ('r2', 'cloudflare_stream', 'mux', 'external');

-- registered -> verified -> reachable -> playable, with degradation paths.
-- Only `playable` (and `degraded`, briefly) may be served to listeners.
create type public.stream_status as enum
  ('registered', 'verified', 'reachable', 'playable', 'degraded', 'failed', 'revoked');

create type public.stream_protocol as enum ('icecast', 'shoutcast', 'hls', 'https_mp3', 'https_aac');

create type public.episode_source as enum ('upload', 'rss', 'external_url');

create type public.visibility as enum ('public', 'unlisted', 'private');

create type public.reaction_kind as enum ('like', 'dislike', 'love', 'insightful');

create type public.report_reason as enum
  ('copyright', 'harassment', 'hate', 'sexual', 'violence', 'spam', 'misinformation', 'other');

create type public.report_status as enum ('open', 'triaged', 'actioned', 'dismissed', 'duplicate');

create type public.moderation_action as enum
  ('approve', 'reject', 'hide', 'restore', 'remove', 'suspend_account', 'reinstate_account', 'age_restrict', 'none');

create type public.licence_type as enum
  ('owned', 'licensed', 'broadcaster_authorised', 'creative_commons', 'public_domain', 'unknown');

create type public.campaign_status as enum
  ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected');

create type public.ad_kind as enum ('image', 'audio', 'video', 'html');

create type public.payout_status as enum
  ('accrued', 'approved', 'processing', 'paid', 'failed', 'cancelled');

create type public.monetisation_status as enum
  ('ineligible', 'pending', 'eligible', 'active', 'suspended');
