-- =============================================================================
-- 0110 — Security hardening (engineering audit 2026-11-22, findings F-1..F-15)
-- =============================================================================
-- 0100 decided WHO may write a row. It did not decide WHICH COLUMNS a tenant may
-- write, so tenants could set the very fields that the platform is supposed to
-- attest: their own verification status, their own stream health, their own
-- rights verification, their own media pipeline state. Exploit probes against
-- 0001-0100 showed that an unverified broadcaster could publish an unprobed,
-- unlicensed station with no staff involvement, and that any signed-in user
-- could take over any organisation. See docs/SONARA_SECURITY_STATUS.md.
--
-- Principle applied here: a column that records a platform judgement
-- (verified, playable, licensed, ready, public, counted) is written only by a
-- trusted writer — service_role (edge functions, workers), the migration
-- owner, a SECURITY DEFINER RPC, or a platform admin — never by a tenant.
--
-- Additive only: no table, column or policy from earlier migrations is
-- dropped except where it is immediately re-created with a tighter rule.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Who counts as a trusted writer
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: it must see the CALLER's role. Inside a
-- SECURITY DEFINER RPC current_user is the function owner, so audited RPCs are
-- trusted by construction.
create or replace function app_private.is_trusted_writer()
returns boolean language sql stable security invoker set search_path = '' as $$
  select current_user not in ('anon', 'authenticated') or app_private.is_platform_admin();
$$;

comment on function app_private.is_trusted_writer() is
  'True for service_role, the migration owner, SECURITY DEFINER RPCs and platform admins. Tenants are never trusted writers.';

-- Generic guard: TG_ARGV holds "column=value" pairs. On INSERT the column must
-- equal value (NULL = SQL null); on UPDATE the column must not change.
create or replace function app_private.guard_trusted_columns()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_arg      text;
  v_col      text;
  v_expected text;
  v_new      jsonb := to_jsonb(new);
  v_old      jsonb;
begin
  if app_private.is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  foreach v_arg in array tg_argv loop
    v_col := split_part(v_arg, '=', 1);
    v_expected := nullif(split_part(v_arg, '=', 2), 'NULL');
    if tg_op = 'INSERT' then
      if (v_new ->> v_col) is distinct from v_expected then
        raise exception '%.% is set by the platform, not by clients', tg_table_name, v_col
          using errcode = '42501';
      end if;
    elsif (v_new -> v_col) is distinct from (v_old -> v_col) then
      raise exception '%.% is set by the platform, not by clients', tg_table_name, v_col
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- F-1 Broadcaster/organisation verification is staff-only
-- F-14 Creator verification, monetisation, badges and counters are platform-owned
-- ---------------------------------------------------------------------------
create trigger organisations_guard_trust before insert or update on public.organisations
  for each row execute function app_private.guard_trusted_columns('verification_status=unverified', 'verified_at=NULL');

create trigger creators_guard_trust before insert or update on public.creators
  for each row execute function app_private.guard_trusted_columns('verification_status=unverified', 'monetisation_status=ineligible');

create trigger creator_channels_guard_trust before insert or update on public.creator_channels
  for each row execute function app_private.guard_trusted_columns('is_verified=false');

create trigger podcasts_guard_trust before insert or update on public.podcasts
  for each row execute function app_private.guard_trusted_columns('monetisation_status=ineligible');

create trigger videos_guard_trust before insert or update on public.videos
  for each row execute function app_private.guard_trusted_columns('view_count_cached=0');

create trigger podcast_episodes_guard_trust before insert or update on public.podcast_episodes
  for each row execute function app_private.guard_trusted_columns('play_count_cached=0');

-- ---------------------------------------------------------------------------
-- F-2 Stream playability is attested by the stream monitor, never the tenant
-- ---------------------------------------------------------------------------
create or replace function app_private.guard_station_stream()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if app_private.is_trusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'registered' or new.last_verified_at is not null
       or new.last_checked_at is not null or new.consecutive_failures <> 0 then
      raise exception 'A new endpoint starts as registered; the stream monitor decides playability'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- A tenant may withdraw its own endpoint, but may not promote it.
  if new.status is distinct from old.status and new.status <> 'revoked' then
    raise exception 'station_streams.status is set by the stream monitor, not by clients'
      using errcode = '42501';
  end if;
  if new.last_verified_at is distinct from old.last_verified_at
     or new.last_checked_at is distinct from old.last_checked_at
     or new.consecutive_failures is distinct from old.consecutive_failures then
    raise exception 'Stream verification fields are set by the stream monitor, not by clients'
      using errcode = '42501';
  end if;

  -- Pointing a verified endpoint somewhere else voids its verification:
  -- otherwise a listed station could be silently redirected to any URL.
  if new.url is distinct from old.url or new.protocol is distinct from old.protocol then
    new.status := case when new.status = 'revoked' then 'revoked'::public.stream_status else 'registered'::public.stream_status end;
    new.last_verified_at := null;
  end if;
  return new;
end;
$$;

create trigger station_streams_guard_trust before insert or update on public.station_streams
  for each row execute function app_private.guard_station_stream();

-- ---------------------------------------------------------------------------
-- F-3 Rights records: tenants may submit evidence; only staff may verify it
-- ---------------------------------------------------------------------------
create or replace function app_private.guard_rights_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if app_private.is_trusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verified_by is not null or new.verified_at is not null then
      raise exception 'Rights records are verified by platform staff, not by the submitting organisation'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- A tenant may clear a verification (e.g. by withdrawing), never set one.
  if (new.verified_by is distinct from old.verified_by and new.verified_by is not null)
     or (new.verified_at is distinct from old.verified_at and new.verified_at is not null) then
    raise exception 'Rights records are verified by platform staff, not by the submitting organisation'
      using errcode = '42501';
  end if;

  -- Any substantive edit to verified evidence sends it back for review.
  if (new.station_id, new.podcast_id, new.episode_id, new.video_id, new.rights_holder_name,
      new.licence_type, new.territory_codes, new.valid_from, new.valid_to, new.exclusivity,
      new.document_asset_id)
     is distinct from
     (old.station_id, old.podcast_id, old.episode_id, old.video_id, old.rights_holder_name,
      old.licence_type, old.territory_codes, old.valid_from, old.valid_to, old.exclusivity,
      old.document_asset_id) then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger rights_records_guard_trust before insert or update on public.rights_records
  for each row execute function app_private.guard_rights_record();

-- ---------------------------------------------------------------------------
-- F-11 Public visibility requires a VERIFIED rights record in force TODAY
-- ---------------------------------------------------------------------------
-- Previously the rights check ran only at the moment of publishing, so a
-- station stayed public after its licence expired or was withdrawn.
create or replace function app_private.station_has_rights_in_force(p_station_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rights_records r
    where r.station_id = p_station_id
      and r.licence_type <> 'unknown'
      and r.verified_at is not null
      and r.valid_from <= current_date
      and (r.valid_to is null or r.valid_to >= current_date)
      and 'UG' = any (r.territory_codes)
  );
$$;

create or replace function app_private.station_is_public(p_station_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.stations s
    join public.organisations o on o.id = s.org_id
    where s.id = p_station_id
      and s.status = 'published'
      and s.published_at <= now()
      and o.verification_status = 'verified'
      and app_private.station_has_rights_in_force(s.id)
  );
$$;

drop policy if exists stations_select_public on public.stations;
create policy stations_select_public on public.stations
  for select to anon, authenticated
  using (
    status = 'published' and published_at <= now()
    and app_private.org_is_verified(org_id)
    and app_private.station_has_rights_in_force(id)
  );

-- The publish gate now also requires the rights record to be staff-verified.
create or replace function app_private.enforce_station_publishable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verified boolean;
  v_playable integer;
begin
  if new.status <> 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  select exists (
    select 1 from public.organisations o
    where o.id = new.org_id and o.verification_status = 'verified'
  ) into v_verified;

  if not v_verified then
    raise exception 'Station cannot be published: organisation % is not verified', new.org_id
      using errcode = '42501',
            hint = 'Complete organisation verification before publishing.';
  end if;

  select count(*) into v_playable
  from public.station_streams s
  where s.station_id = new.id and s.status in ('playable', 'degraded');

  if v_playable = 0 then
    raise exception 'Station % has no playable stream', new.id
      using errcode = '23514',
            hint = 'Wait for the stream monitor to verify at least one endpoint.';
  end if;

  if not app_private.station_has_rights_in_force(new.id) then
    raise exception 'Station % has no rights record in force for Uganda', new.id
      using errcode = '23514',
            hint = 'Record the broadcaster authorisation in rights_records and have platform staff verify it.';
  end if;

  new.published_at := coalesce(new.published_at, now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- F-4 Invitation acceptance / F-5 organisation takeover
-- ---------------------------------------------------------------------------
create or replace function app_private.org_created_by_me(p_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organisations o
    where o.id = p_org_id and o.created_by = auth.uid()
  );
$$;

-- Bootstrap ownership only for the person who created the organisation, and
-- only as an accepted row (a pending owner row was the takeover vehicle).
drop policy if exists org_members_insert_manage on public.organisation_members;
create policy org_members_insert_manage on public.organisation_members
  for insert to authenticated
  with check (
    app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[])
    or (
      profile_id = auth.uid()
      and role = 'owner'
      and accepted_at is not null
      and app_private.can_bootstrap_owner(org_id)
      and app_private.org_created_by_me(org_id)
    )
  );

-- An invitee must be able to see their own pending invitation in order to accept it.
create policy org_members_select_own on public.organisation_members
  for select to authenticated using (profile_id = auth.uid());

create or replace function app_private.guard_membership()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_org        uuid := case when tg_op = 'INSERT' then new.org_id else old.org_id end;
  v_is_owner   boolean;
  v_is_manager boolean;
begin
  if app_private.is_trusted_writer() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_is_owner := app_private.has_org_role(v_org, array['owner']::public.org_member_role[]);
  v_is_manager := app_private.has_org_role(v_org, array['owner','admin']::public.org_member_role[]);

  if tg_op = 'INSERT' then
    if new.role = 'owner' and not (
         new.profile_id = auth.uid()
         and app_private.can_bootstrap_owner(new.org_id)
         and app_private.org_created_by_me(new.org_id)) then
      raise exception 'Only the founder of an organisation can claim its ownership'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and not v_is_owner then
      raise exception 'Only the owner can remove the owner membership' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.org_id is distinct from old.org_id or new.profile_id is distinct from old.profile_id then
    raise exception 'A membership cannot be moved to another organisation or person' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    if not v_is_manager then
      raise exception 'Only organisation owners or admins can change roles' using errcode = '42501';
    end if;
    if (new.role = 'owner' or old.role = 'owner') and not v_is_owner then
      raise exception 'Only the owner can grant or remove ownership' using errcode = '42501';
    end if;
  end if;
  if new.accepted_at is distinct from old.accepted_at then
    if old.accepted_at is not null then
      raise exception 'An accepted membership cannot be un-accepted; remove the member instead' using errcode = '42501';
    end if;
    if new.profile_id <> auth.uid() then
      raise exception 'Only the invited person can accept an invitation' using errcode = '42501';
    end if;
  end if;
  if new.invited_by is distinct from old.invited_by or new.invited_at is distinct from old.invited_at then
    raise exception 'Invitation provenance cannot be rewritten' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organisation_members_guard before insert or update or delete on public.organisation_members
  for each row execute function app_private.guard_membership();

-- Token-based acceptance for organisation_invitations (the table had no accept path).
create or replace function public.accept_organisation_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv   public.organisation_invitations%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in to accept an invitation' using errcode = '42501';
  end if;

  select * into v_inv
  from public.organisation_invitations i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  -- One message for every failure mode, so the RPC is not a token oracle.
  if not found or v_inv.accepted_at is not null or v_inv.expires_at <= now()
     or v_email = '' or v_email <> lower(v_inv.email::text) then
    raise exception 'This invitation is invalid, expired, or was issued to a different email address'
      using errcode = '42501';
  end if;

  insert into public.organisation_members (org_id, profile_id, role, invited_by, invited_at, accepted_at)
  values (v_inv.org_id, auth.uid(), v_inv.role, v_inv.invited_by, v_inv.created_at, now())
  on conflict (org_id, profile_id) do update
    set accepted_at = coalesce(public.organisation_members.accepted_at, now());

  update public.organisation_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end;
$$;

revoke all on function public.accept_organisation_invitation(text) from public, anon;
grant execute on function public.accept_organisation_invitation(text) to authenticated;

comment on function public.accept_organisation_invitation(text) is
  'Accepts an organisation invitation by raw token. Requires the caller''s JWT email to match the invitation. Production must also require a confirmed email.';

-- ---------------------------------------------------------------------------
-- F-6 Consent flags and account fields are not public profile data
-- ---------------------------------------------------------------------------
-- RLS chooses rows; it cannot hide columns. profiles_select_public exposed
-- every column of every listener with a handle, including consent choices.
revoke select on public.profiles from anon, authenticated;
grant select (id, handle, display_name, bio, avatar_asset_id, created_at)
  on public.profiles to anon, authenticated;

create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- F-7 Media metadata exposure / F-13 media pipeline status bypass
-- ---------------------------------------------------------------------------
-- Public artwork is now an explicit, platform-set flag rather than "any ready
-- image", which also covered identity documents and licence scans.
alter table public.media_assets add column if not exists is_public boolean not null default false;

comment on column public.media_assets.is_public is
  'Set by the media pipeline when an image/caption is attached as public artwork. Never client-writable.';

drop policy if exists media_select_public_artwork on public.media_assets;
create policy media_select_public_artwork on public.media_assets
  for select to anon, authenticated
  using (is_public and status = 'ready' and kind in ('image', 'caption'));

-- Object keys, provider ids, checksums and free-form metadata (EXIF, uploader
-- details) are never returned to clients; signed URLs come from an edge function.
revoke select on public.media_assets from anon, authenticated;
grant select (id, kind, mime_type, duration_seconds, width, height, status, is_public, updated_at)
  on public.media_assets to anon;
grant select (id, kind, mime_type, duration_seconds, width, height, status, is_public, updated_at,
              storage_backend, size_bytes, owner_org_id, owner_profile_id, created_at)
  on public.media_assets to authenticated;

create trigger media_assets_guard_trust before insert or update on public.media_assets
  for each row execute function app_private.guard_trusted_columns(
    'status=pending_upload', 'is_public=false', 'provider_asset_id=NULL', 'checksum_sha256=NULL',
    'storage_backend=r2');

-- A client-supplied object key must live under its owner's prefix, so one
-- tenant can never register (and later obtain a signed URL for) another's object.
create or replace function app_private.guard_media_ownership()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_prefix text;
begin
  if app_private.is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'UPDATE' and (
       new.storage_key is distinct from old.storage_key
       or new.external_url is distinct from old.external_url
       or new.owner_org_id is distinct from old.owner_org_id
       or new.owner_profile_id is distinct from old.owner_profile_id) then
    raise exception 'Media location and ownership are fixed once registered' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.external_url is not null then
      raise exception 'External media is registered by the platform, not by clients' using errcode = '42501';
    end if;
    v_prefix := case when new.owner_org_id is not null
                     then 'org/' || new.owner_org_id::text || '/'
                     else 'user/' || new.owner_profile_id::text || '/' end;
    if new.storage_key is null or left(new.storage_key, length(v_prefix)) <> v_prefix then
      raise exception 'storage_key must start with %', v_prefix using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger media_assets_guard_ownership before insert or update on public.media_assets
  for each row execute function app_private.guard_media_ownership();

-- ---------------------------------------------------------------------------
-- F-8 Partitions bypassed RLS
-- ---------------------------------------------------------------------------
-- 0100 enabled RLS on parents only, while `grant ... on all tables` reached
-- the partitions. Querying playback_events_default directly returned every
-- listener's events; stream_health_checks_default was writable. Clients must
-- go through the parent, so partitions get no client privileges at all.
create or replace function app_private.secure_partition(p_partition regclass)
returns void language plpgsql security definer set search_path = '' as $$
begin
  execute format('alter table %s enable row level security', p_partition);
  execute format('revoke all on %s from anon, authenticated', p_partition);
end;
$$;

revoke all on function app_private.secure_partition(regclass) from public, anon, authenticated;

comment on function app_private.secure_partition(regclass) is
  'Call for every new partition (e.g. monthly playback_events / stream_health_checks partitions created by workers).';

do $$
declare
  v_part regclass;
begin
  for v_part in
    select c.oid::regclass
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    -- relkind r/p only: partitioned indexes are flagged relispartition too.
    where n.nspname = 'public' and c.relispartition and c.relkind in ('r', 'p')
  loop
    perform app_private.secure_partition(v_part);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges for the new helpers (do not rely on PUBLIC defaults, which a
-- Supabase project may have changed). Policy helpers must be executable by the
-- API roles because policies run as the caller.
-- ---------------------------------------------------------------------------
grant execute on function app_private.is_trusted_writer() to anon, authenticated, service_role;
grant execute on function app_private.station_has_rights_in_force(uuid) to anon, authenticated, service_role;
grant execute on function app_private.org_created_by_me(uuid) to anon, authenticated, service_role;
grant execute on function app_private.secure_partition(regclass) to service_role;
