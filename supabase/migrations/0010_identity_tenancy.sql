-- =============================================================================
-- 0010 — Identity and tenancy
-- =============================================================================
-- profiles.id is the Supabase auth user id: one person, one profile, no
-- shadow identity table. Platform roles (staff) are deliberately separate from
-- organisation roles (tenants) so a broadcaster editor can never become staff
-- by editing their own membership.
-- =============================================================================

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  handle            citext unique,
  display_name      text not null default 'Listener',
  bio               text,
  -- FK added in 0020 once media_assets exists (circular dependency).
  avatar_asset_id   uuid,
  country_code      char(2) not null default 'UG',
  locale            text not null default 'en-UG',
  status            public.account_status not null default 'active',
  -- Supabase anonymous sessions let people listen to radio without signing up.
  is_anonymous      boolean not null default false,
  marketing_consent boolean not null default false,
  analytics_consent boolean not null default false,
  ads_consent       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint profiles_handle_format check (handle is null or handle ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 80),
  constraint profiles_deleted_is_marked check (status <> 'deleted' or deleted_at is not null)
);

comment on table public.profiles is
  'One row per authenticated user. Anonymous radio listeners exist in auth.users but hold no profile row until they register.';

create table public.platform_roles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.platform_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, role)
);

comment on table public.platform_roles is
  'Platform staff roles. Writable only by service_role (edge functions) — never by a client, by policy.';

create table public.organisations (
  id                  uuid primary key default gen_random_uuid(),
  slug                citext not null unique,
  legal_name          text not null,
  trading_name        text,
  org_type            public.org_type not null,
  description         text,
  logo_asset_id       uuid,  -- FK added in 0020
  country_code        char(2) not null default 'UG',
  contact_email       citext not null,
  contact_phone       text,
  verification_status public.verification_status not null default 'unverified',
  verified_at         timestamptz,
  created_by          uuid references public.profiles (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint organisations_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  constraint organisations_verified_consistency
    check ((verification_status = 'verified') = (verified_at is not null))
);

create index organisations_type_idx on public.organisations (org_type);
create index organisations_verification_idx on public.organisations (verification_status)
  where verification_status <> 'verified';

create table public.organisation_members (
  org_id      uuid not null references public.organisations (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        public.org_member_role not null default 'editor',
  invited_by  uuid references public.profiles (id) on delete set null,
  invited_at  timestamptz not null default now(),
  -- NULL means the invitation has not been accepted; accepted rows grant rights.
  accepted_at timestamptz,
  primary key (org_id, profile_id)
);

create index organisation_members_profile_idx on public.organisation_members (profile_id);
create index organisation_members_active_idx on public.organisation_members (org_id)
  where accepted_at is not null;

comment on column public.organisation_members.accepted_at is
  'NULL = pending invitation. RLS helpers require a non-NULL value, so an unaccepted invite grants nothing.';

-- Exactly one owner per organisation, enforced structurally.
create unique index organisation_members_single_owner
  on public.organisation_members (org_id)
  where role = 'owner' and accepted_at is not null;

create table public.organisation_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  email       citext not null,
  role        public.org_member_role not null,
  invited_by  uuid references public.profiles (id) on delete set null,
  -- Only a hash is stored; the raw token lives in the invitation email.
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint organisation_invitations_expiry check (expires_at > created_at),
  constraint organisation_invitations_not_owner check (role <> 'owner')
);

create index organisation_invitations_org_idx on public.organisation_invitations (org_id);
create index organisation_invitations_email_idx on public.organisation_invitations (email)
  where accepted_at is null;

create table public.verification_requests (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations (id) on delete cascade,
  kind               text not null check (kind in ('broadcaster_licence', 'business_registration', 'identity', 'rights_authorisation')),
  document_asset_id  uuid,  -- FK added in 0020
  status             public.verification_status not null default 'pending',
  submitted_by       uuid references public.profiles (id) on delete set null,
  submitted_at       timestamptz not null default now(),
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  decision_reason    text,
  constraint verification_requests_review_consistency
    check ((reviewed_by is null) = (reviewed_at is null))
);

create index verification_requests_queue_idx
  on public.verification_requests (status, submitted_at)
  where status in ('pending', 'submitted');
