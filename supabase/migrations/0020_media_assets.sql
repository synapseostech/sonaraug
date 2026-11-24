-- =============================================================================
-- 0020 — Media assets
-- =============================================================================
-- Byte storage lives outside PostgreSQL (Cloudflare R2 / Stream). This table
-- holds only metadata: what the file is, who owns it, what state it is in, and
-- where the pipeline put it. Nothing here ever stores a file.
-- =============================================================================

create table public.media_assets (
  id                uuid primary key default gen_random_uuid(),
  kind              public.media_kind not null,
  storage_backend   public.storage_backend not null,
  -- Object key for R2/external storage. Never a public URL for private media.
  storage_key       text,
  external_url      text,
  mime_type         text not null,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  checksum_sha256   text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  duration_seconds  numeric(10, 3) check (duration_seconds is null or duration_seconds >= 0),
  width             integer check (width is null or width > 0),
  height            integer check (height is null or height > 0),
  status            public.media_status not null default 'pending_upload',
  -- Ownership: exactly one of org or profile. Enables a creator's personal
  -- library and an organisation's shared library without a nullable mess.
  owner_org_id      uuid references public.organisations (id) on delete cascade,
  owner_profile_id  uuid references public.profiles (id) on delete cascade,
  provider_asset_id text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint media_assets_owner_exactly_one check (num_nonnulls(owner_org_id, owner_profile_id) = 1),
  constraint media_assets_location_present check (storage_key is not null or external_url is not null),
  constraint media_assets_checksum_required_when_ready
    check (status <> 'ready' or checksum_sha256 is not null or kind = 'image')
);

create index media_assets_org_idx on public.media_assets (owner_org_id, created_at desc)
  where owner_org_id is not null;
create index media_assets_profile_idx on public.media_assets (owner_profile_id, created_at desc)
  where owner_profile_id is not null;
create index media_assets_processing_idx on public.media_assets (status)
  where status in ('uploading', 'processing');
create index media_assets_provider_idx on public.media_assets (provider_asset_id)
  where provider_asset_id is not null;

comment on column public.media_assets.storage_key is
  'Private object key. Clients receive short-lived signed URLs from the media-token edge function, never this value.';

-- Deferred FKs: these tables were created before media_assets (circularity).
alter table public.profiles
  add constraint profiles_avatar_asset_fk
  foreign key (avatar_asset_id) references public.media_assets (id) on delete set null;

alter table public.organisations
  add constraint organisations_logo_asset_fk
  foreign key (logo_asset_id) references public.media_assets (id) on delete set null;

alter table public.verification_requests
  add constraint verification_requests_document_fk
  foreign key (document_asset_id) references public.media_assets (id) on delete restrict;
