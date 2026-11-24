-- =============================================================================
-- 0100 — Row Level Security
-- =============================================================================
-- Every table is RLS-protected. There is no `using (true)` anywhere.
--
-- The helper functions live in app_private and are SECURITY DEFINER so they can
-- read membership tables the caller cannot see, without creating recursive
-- policies. They take explicit arguments and return booleans, so exposing them
-- to clients reveals nothing beyond the caller's own access.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_roles pr
    where pr.profile_id = auth.uid() and pr.role in ('super_admin', 'admin')
  );
$$;

create or replace function app_private.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_roles pr
    where pr.profile_id = auth.uid() and pr.role in ('super_admin', 'admin', 'moderator')
  );
$$;

create or replace function app_private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_roles pr where pr.profile_id = auth.uid());
$$;

create or replace function app_private.has_org_role(p_org_id uuid, p_roles public.org_member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organisation_members m
    where m.org_id = p_org_id
      and m.profile_id = auth.uid()
      and m.accepted_at is not null
      and m.role = any (p_roles)
  );
$$;

create or replace function app_private.is_org_member(p_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organisation_members m
    where m.org_id = p_org_id and m.profile_id = auth.uid() and m.accepted_at is not null
  );
$$;

/** True when the organisation has no accepted owner yet (onboarding bootstrap). */
create or replace function app_private.can_bootstrap_owner(p_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.organisation_members m
    where m.org_id = p_org_id and m.role = 'owner' and m.accepted_at is not null
  );
$$;

create or replace function app_private.org_is_verified(p_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organisations o
    where o.id = p_org_id and o.verification_status = 'verified' and o.verified_at is not null
  );
$$;

create or replace function app_private.station_org_id(p_station_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.org_id from public.stations s where s.id = p_station_id;
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
  );
$$;

create or replace function app_private.stream_is_public(p_stream_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.station_streams st
    where st.id = p_stream_id
      and st.status in ('playable', 'degraded')
      and app_private.station_is_public(st.station_id)
  );
$$;

create or replace function app_private.podcast_org_id(p_podcast_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.org_id from public.podcasts p where p.id = p_podcast_id;
$$;

create or replace function app_private.podcast_channel_id(p_podcast_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.channel_id from public.podcasts p where p.id = p_podcast_id;
$$;

create or replace function app_private.podcast_is_public(p_podcast_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.podcasts p
    where p.id = p_podcast_id and p.status = 'published' and p.published_at <= now()
      and (
        (p.org_id is not null and app_private.org_is_verified(p.org_id))
        or (p.channel_id is not null and exists (
              select 1 from public.creator_channels c
              where c.id = p.channel_id and c.status = 'published'
            ))
      )
  );
$$;

create or replace function app_private.owns_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.creator_channels c
    join public.creators cr on cr.id = c.creator_id
    where c.id = p_channel_id and cr.profile_id = auth.uid()
  );
$$;

create or replace function app_private.channel_org_id(p_channel_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select cr.org_id
  from public.creator_channels c
  join public.creators cr on cr.id = c.creator_id
  where c.id = p_channel_id;
$$;

create or replace function app_private.can_edit_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.owns_channel(p_channel_id)
      or exists (
        select 1 from public.creator_channels c
        join public.creators cr on cr.id = c.creator_id
        where c.id = p_channel_id
          and cr.org_id is not null
          and app_private.has_org_role(cr.org_id, array['owner','admin','editor']::public.org_member_role[])
      );
$$;

create or replace function app_private.channel_is_public(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.creator_channels c
    where c.id = p_channel_id and c.status = 'published'
      and (c.creator_id in (select id from public.creators))
  );
$$;

create or replace function app_private.video_is_public(p_video_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.videos v
    join public.creator_channels c on c.id = v.channel_id
    where v.id = p_video_id
      and v.status = 'published'
      and v.visibility = 'public'
      and v.published_at <= now()
      and c.status = 'published'
  );
$$;

create or replace function app_private.advertiser_org_id(p_advertiser_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.org_id from public.advertisers a where a.id = p_advertiser_id;
$$;

create or replace function app_private.is_advertiser_member(p_advertiser_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.advertisers a
    where a.id = p_advertiser_id and app_private.is_org_member(a.org_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app_private to anon, authenticated, service_role;
grant execute on all functions in schema app_private to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
-- Two write paths are intentionally open to anonymous visitors: reporting
-- abusive content, and recording playback reliability telemetry.
grant insert on public.content_reports to anon;
grant insert on public.playback_events to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role, authenticated;

-- Defence in depth: even if a policy is misconfigured, these writes are refused
-- at the privilege layer.
revoke insert, update, delete on public.audit_logs from anon, authenticated;
revoke insert, update, delete on public.moderation_actions from anon, authenticated;
revoke update, delete on public.playback_events from anon, authenticated;
revoke insert, update, delete on public.stream_health_checks from anon, authenticated;
revoke insert, update, delete on public.stream_incidents from anon, authenticated;
revoke insert, update, delete on public.impressions from anon, authenticated;
revoke insert, update, delete on public.clicks from anon, authenticated;
revoke insert, update, delete on public.platform_roles from anon, authenticated;
revoke insert, update, delete on public.payouts from anon, authenticated;
revoke update, delete on public.audit_logs from authenticated;

-- A listener may edit their own presentation but never their role, status,
-- consent flags they did not grant, or account state.
-- An author may edit their own wording, but may not move a comment into a
-- moderation state. Soft-deleting is done through delete_own_comment(), because
-- PostgreSQL rejects an UPDATE that would make the row invisible to the
-- author's own SELECT policy.
revoke update on public.comments from authenticated;
grant update (body) on public.comments to authenticated;

revoke update on public.profiles from authenticated;
grant update (display_name, handle, bio, avatar_asset_id, locale,
              marketing_consent, analytics_consent, ads_consent)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    -- 'p' = partitioned table. Missing these would leave playback_events and
    -- stream_health_checks readable by the public.
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- =============================================================================
-- Policies
-- =============================================================================

-- profiles -------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (status = 'active' and handle is not null and deleted_at is null);

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all to authenticated using (app_private.is_platform_admin())
  with check (app_private.is_platform_admin());

-- platform_roles -------------------------------------------------------------
create policy platform_roles_select_own on public.platform_roles
  for select to authenticated using (profile_id = auth.uid());

create policy platform_roles_admin_read on public.platform_roles
  for select to authenticated using (app_private.is_platform_admin());

-- organisations --------------------------------------------------------------
create policy organisations_select_member on public.organisations
  for select to authenticated using (app_private.is_org_member(id));

create policy organisations_select_verified on public.organisations
  for select to anon, authenticated using (verification_status = 'verified');

create policy organisations_insert_self on public.organisations
  for insert to authenticated with check (created_by = auth.uid());

create policy organisations_update_admin on public.organisations
  for update to authenticated
  using (app_private.has_org_role(id, array['owner','admin']::public.org_member_role[]))
  with check (app_private.has_org_role(id, array['owner','admin']::public.org_member_role[]));

create policy organisations_admin_all on public.organisations
  for all to authenticated using (app_private.is_platform_admin())
  with check (app_private.is_platform_admin());

-- organisation_members -------------------------------------------------------
create policy org_members_select on public.organisation_members
  for select to authenticated using (app_private.is_org_member(org_id));

create policy org_members_insert_manage on public.organisation_members
  for insert to authenticated
  with check (
    app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[])
    -- The creator of an organisation becomes its first owner.
    or (profile_id = auth.uid() and role = 'owner' and app_private.can_bootstrap_owner(org_id))
  );

create policy org_members_update_accept on public.organisation_members
  for update to authenticated
  using (profile_id = auth.uid() and accepted_at is null)
  with check (profile_id = auth.uid());

create policy org_members_update_manage on public.organisation_members
  for update to authenticated
  using (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]))
  with check (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]));

create policy org_members_delete_manage on public.organisation_members
  for delete to authenticated
  using (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]));

-- organisation_invitations ---------------------------------------------------
create policy org_invitations_manage on public.organisation_invitations
  for all to authenticated
  using (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]))
  with check (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]));

-- verification_requests ------------------------------------------------------
create policy verification_select_org on public.verification_requests
  for select to authenticated using (app_private.is_org_member(org_id));

create policy verification_insert_org on public.verification_requests
  for insert to authenticated
  with check (
    app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[])
    and submitted_by = auth.uid()
    and status = 'pending'
  );

create policy verification_review on public.verification_requests
  for update to authenticated
  using (app_private.is_platform_admin())
  with check (app_private.is_platform_admin());

-- media_assets ---------------------------------------------------------------
create policy media_select_org on public.media_assets
  for select to authenticated
  using (owner_org_id is not null and app_private.is_org_member(owner_org_id));

create policy media_select_own on public.media_assets
  for select to authenticated using (owner_profile_id = auth.uid());

-- Public artwork (station art, podcast covers, thumbnails) must be readable by
-- anonymous listeners. Only ready images and caption files qualify; audio and
-- video masters are always signed.
create policy media_select_public_artwork on public.media_assets
  for select to anon, authenticated
  using (status = 'ready' and kind in ('image', 'caption'));

create policy media_insert_owner on public.media_assets
  for insert to authenticated
  with check (owner_profile_id = auth.uid() or app_private.is_org_member(owner_org_id));

create policy media_update_owner on public.media_assets
  for update to authenticated
  using (owner_profile_id = auth.uid() or app_private.has_org_role(owner_org_id, array['owner','admin','editor']::public.org_member_role[]))
  with check (owner_profile_id = auth.uid() or app_private.has_org_role(owner_org_id, array['owner','admin','editor']::public.org_member_role[]));

-- stations -------------------------------------------------------------------
create policy stations_select_public on public.stations
  for select to anon, authenticated
  using (status = 'published' and published_at <= now() and app_private.org_is_verified(org_id));

create policy stations_select_org on public.stations
  for select to authenticated using (app_private.is_org_member(org_id));

create policy stations_insert_org on public.stations
  for insert to authenticated
  with check (app_private.has_org_role(org_id, array['owner','admin','editor']::public.org_member_role[]));

create policy stations_update_org on public.stations
  for update to authenticated
  using (app_private.has_org_role(org_id, array['owner','admin','editor']::public.org_member_role[]))
  with check (app_private.has_org_role(org_id, array['owner','admin','editor']::public.org_member_role[]));

create policy stations_delete_org_admin on public.stations
  for delete to authenticated
  using (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]));

create policy stations_admin_all on public.stations
  for all to authenticated using (app_private.is_platform_admin())
  with check (app_private.is_platform_admin());

-- station_streams ------------------------------------------------------------
create policy streams_select_playable on public.station_streams
  for select to anon, authenticated using (app_private.stream_is_public(id));

create policy streams_select_org on public.station_streams
  for select to authenticated using (app_private.is_org_member(app_private.station_org_id(station_id)));

create policy streams_write_org on public.station_streams
  for all to authenticated
  using (app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin','editor']::public.org_member_role[]))
  with check (app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin','editor']::public.org_member_role[]));

-- programmes / schedules / presenters -----------------------------------------
create policy programmes_select_public on public.programmes
  for select to anon, authenticated
  using (status = 'published' and app_private.station_is_public(station_id));

create policy programmes_manage_org on public.programmes
  for all to authenticated
  using (app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin','editor','presenter']::public.org_member_role[]))
  with check (app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin','editor','presenter']::public.org_member_role[]));

create policy schedules_select_public on public.schedules
  for select to anon, authenticated using (app_private.station_is_public(station_id));

create policy schedules_manage_org on public.schedules
  for all to authenticated
  using (app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin','editor','presenter']::public.org_member_role[]))
  with check (app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin','editor','presenter']::public.org_member_role[]));

create policy presenters_select_public on public.presenters
  for select to anon, authenticated using (app_private.org_is_verified(org_id));

create policy presenters_manage_org on public.presenters
  for all to authenticated
  using (app_private.has_org_role(org_id, array['owner','admin','editor']::public.org_member_role[]))
  with check (app_private.has_org_role(org_id, array['owner','admin','editor']::public.org_member_role[]));

-- podcasts -------------------------------------------------------------------
create policy podcasts_select_public on public.podcasts
  for select to anon, authenticated using (app_private.podcast_is_public(id));

create policy podcasts_select_owner on public.podcasts
  for select to authenticated
  using (
    (org_id is not null and app_private.is_org_member(org_id))
    or (channel_id is not null and app_private.can_edit_channel(channel_id))
  );

create policy podcasts_write_owner on public.podcasts
  for all to authenticated
  using (
    (org_id is not null and app_private.has_org_role(org_id, array['owner','admin','editor']::public.org_member_role[]))
    or (channel_id is not null and app_private.can_edit_channel(channel_id))
  )
  with check (
    (org_id is not null and app_private.has_org_role(org_id, array['owner','admin','editor']::public.org_member_role[]))
    or (channel_id is not null and app_private.can_edit_channel(channel_id))
  );

-- rss_feeds: operational detail, never public.
create policy rss_feeds_owner on public.rss_feeds
  for all to authenticated
  using (app_private.is_org_member(app_private.podcast_org_id(podcast_id)) or app_private.can_edit_channel(app_private.podcast_channel_id(podcast_id)))
  with check (app_private.is_org_member(app_private.podcast_org_id(podcast_id)) or app_private.can_edit_channel(app_private.podcast_channel_id(podcast_id)));

create policy episodes_select_public on public.podcast_episodes
  for select to anon, authenticated
  using (status = 'published' and published_at <= now() and app_private.podcast_is_public(podcast_id));

create policy episodes_select_owner on public.podcast_episodes
  for select to authenticated
  using (app_private.is_org_member(app_private.podcast_org_id(podcast_id)) or app_private.can_edit_channel(app_private.podcast_channel_id(podcast_id)));

create policy episodes_write_owner on public.podcast_episodes
  for all to authenticated
  using (
    app_private.has_org_role(app_private.podcast_org_id(podcast_id), array['owner','admin','editor']::public.org_member_role[])
    or app_private.can_edit_channel(app_private.podcast_channel_id(podcast_id))
  )
  with check (
    app_private.has_org_role(app_private.podcast_org_id(podcast_id), array['owner','admin','editor']::public.org_member_role[])
    or app_private.can_edit_channel(app_private.podcast_channel_id(podcast_id))
  );

-- creators / channels --------------------------------------------------------
create policy creators_select_self on public.creators
  for select to authenticated using (profile_id = auth.uid());

create policy creators_select_public on public.creators
  for select to anon, authenticated using (verification_status = 'verified');

create policy creators_insert_self on public.creators
  for insert to authenticated with check (profile_id = auth.uid());

create policy creators_update_self on public.creators
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy channels_select_public on public.creator_channels
  for select to anon, authenticated using (status = 'published' and published_at <= now());

create policy channels_select_owner on public.creator_channels
  for select to authenticated using (app_private.can_edit_channel(id));

create policy channels_write_owner on public.creator_channels
  for all to authenticated
  using (app_private.can_edit_channel(id))
  with check (app_private.can_edit_channel(id));

-- videos ---------------------------------------------------------------------
create policy videos_select_public on public.videos
  for select to anon, authenticated using (app_private.video_is_public(id));

create policy videos_select_owner on public.videos
  for select to authenticated using (app_private.can_edit_channel(channel_id));

create policy videos_write_owner on public.videos
  for all to authenticated
  using (app_private.can_edit_channel(channel_id))
  with check (app_private.can_edit_channel(channel_id));

create policy video_assets_select_public on public.video_assets
  for select to anon, authenticated using (app_private.video_is_public(video_id));

create policy video_assets_owner on public.video_assets
  for all to authenticated
  using (app_private.can_edit_channel((select v.channel_id from public.videos v where v.id = video_id)))
  with check (app_private.can_edit_channel((select v.channel_id from public.videos v where v.id = video_id)));

create policy captions_select_public on public.captions
  for select to anon, authenticated using (app_private.video_is_public(video_id));

create policy captions_owner on public.captions
  for all to authenticated
  using (app_private.can_edit_channel((select v.channel_id from public.videos v where v.id = video_id)))
  with check (app_private.can_edit_channel((select v.channel_id from public.videos v where v.id = video_id)));

-- engagement: strictly own rows ----------------------------------------------
create policy favourites_own on public.favourites
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy follows_own on public.follows
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy playlists_own on public.playlists
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy playlist_items_own on public.playlist_items
  for all to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.profile_id = auth.uid()))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.profile_id = auth.uid()));

create policy playback_progress_own on public.playback_progress
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy playback_events_insert on public.playback_events
  for insert to anon, authenticated with check (profile_id is null or profile_id = auth.uid());

create policy playback_events_select_own on public.playback_events
  for select to authenticated using (profile_id = auth.uid());

create policy comments_select_visible on public.comments
  for select to anon, authenticated using (status = 'visible');

create policy comments_insert_own on public.comments
  for insert to authenticated with check (profile_id = auth.uid() and status = 'visible');

create policy comments_update_own on public.comments
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());


create policy reactions_own on public.reactions
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- advertising ----------------------------------------------------------------
create policy advertisers_member on public.advertisers
  for select to authenticated using (app_private.is_org_member(org_id));

create policy advertisers_manage on public.advertisers
  for all to authenticated
  using (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]))
  with check (app_private.has_org_role(org_id, array['owner','admin']::public.org_member_role[]));

create policy placements_read on public.placements
  for select to authenticated using (true);
create policy placements_admin on public.placements
  for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy campaigns_member on public.campaigns
  for all to authenticated
  using (app_private.is_advertiser_member(advertiser_id))
  with check (app_private.is_advertiser_member(advertiser_id));

create policy campaigns_admin on public.campaigns
  for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy advertisements_member on public.advertisements
  for all to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and app_private.is_advertiser_member(c.advertiser_id)))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and app_private.is_advertiser_member(c.advertiser_id)));

create policy campaign_placements_member on public.campaign_placements
  for all to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and app_private.is_advertiser_member(c.advertiser_id)))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and app_private.is_advertiser_member(c.advertiser_id)));

create policy frequency_caps_member on public.frequency_caps
  for all to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and app_private.is_advertiser_member(c.advertiser_id)))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and app_private.is_advertiser_member(c.advertiser_id)));

-- Delivery data is readable by the advertiser, writable only by the server.
create policy impressions_member_read on public.impressions
  for select to authenticated
  using (exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and app_private.is_advertiser_member(c.advertiser_id)
  ));

create policy impressions_admin_read on public.impressions
  for select to authenticated using (app_private.is_platform_admin());

create policy clicks_member_read on public.clicks
  for select to authenticated
  using (exists (
    select 1 from public.impressions i
    join public.campaigns c on c.id = i.campaign_id
    where i.id = impression_id and app_private.is_advertiser_member(c.advertiser_id)
  ));

create policy payouts_read_payee on public.payouts
  for select to authenticated
  using (
    (creator_id is not null and exists (select 1 from public.creators cr where cr.id = creator_id and cr.profile_id = auth.uid()))
    or (org_id is not null and app_private.has_org_role(org_id, array['owner','billing']::public.org_member_role[]))
  );

create policy payouts_finance on public.payouts
  for select to authenticated using (app_private.is_platform_admin());

-- trust & safety -------------------------------------------------------------
create policy reports_insert on public.content_reports
  for insert to anon, authenticated
  with check (reporter_profile_id is null or reporter_profile_id = auth.uid());

create policy reports_select_own on public.content_reports
  for select to authenticated using (reporter_profile_id = auth.uid());

create policy reports_moderate on public.content_reports
  for all to authenticated
  using (app_private.is_moderator()) with check (app_private.is_moderator());

create policy moderation_actions_read on public.moderation_actions
  for select to authenticated using (app_private.is_moderator());

create policy moderation_actions_insert on public.moderation_actions
  for insert to authenticated with check (app_private.is_moderator());

create policy rights_records_read_org on public.rights_records
  for select to authenticated
  using (
    (station_id is not null and app_private.is_org_member(app_private.station_org_id(station_id)))
    or (podcast_id is not null and app_private.is_org_member(app_private.podcast_org_id(podcast_id)))
    or (video_id is not null and app_private.is_org_member(app_private.channel_org_id((select v.channel_id from public.videos v where v.id = video_id))))
  );

create policy rights_records_manage_org on public.rights_records
  for all to authenticated
  using (
    (station_id is not null and app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin']::public.org_member_role[]))
    or (podcast_id is not null and app_private.has_org_role(app_private.podcast_org_id(podcast_id), array['owner','admin']::public.org_member_role[]))
  )
  with check (
    (station_id is not null and app_private.has_org_role(app_private.station_org_id(station_id), array['owner','admin']::public.org_member_role[]))
    or (podcast_id is not null and app_private.has_org_role(app_private.podcast_org_id(podcast_id), array['owner','admin']::public.org_member_role[]))
  );

create policy rights_records_admin on public.rights_records
  for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using (app_private.is_platform_admin());

-- notifications --------------------------------------------------------------
create policy notification_prefs_own on public.notification_preferences
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy push_tokens_own on public.push_tokens
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- reference data: world readable, staff writable ------------------------------
create policy categories_read on public.content_categories
  for select to anon, authenticated using (true);
create policy categories_admin on public.content_categories
  for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy languages_read on public.languages
  for select to anon, authenticated using (true);
create policy languages_admin on public.languages
  for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy regions_read on public.regions
  for select to anon, authenticated using (true);
create policy regions_admin on public.regions
  for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy programme_presenters_read on public.programme_presenters
  for select to anon, authenticated
  using (exists (select 1 from public.programmes p where p.id = programme_id and p.status = 'published'));
create policy programme_presenters_manage on public.programme_presenters
  for all to authenticated
  using (exists (
    select 1 from public.programmes p
    where p.id = programme_id
      and app_private.has_org_role(app_private.station_org_id(p.station_id), array['owner','admin','editor']::public.org_member_role[])
  ))
  with check (exists (
    select 1 from public.programmes p
    where p.id = programme_id
      and app_private.has_org_role(app_private.station_org_id(p.station_id), array['owner','admin','editor']::public.org_member_role[])
  ));

-- Moderators must be able to *see* what they are moderating.
create policy comments_select_moderator on public.comments
  for select to authenticated using (app_private.is_moderator());


-- ---------------------------------------------------------------------------
-- Author-initiated comment deletion
-- ---------------------------------------------------------------------------
create or replace function public.delete_own_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select c.profile_id into v_owner from public.comments c where c.id = p_comment_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Comment not found' using errcode = '42501';
  end if;

  update public.comments
     set status = 'deleted',
         body = '',
         moderation_reason = 'author_deleted'
   where id = p_comment_id;
end;
$$;

revoke all on function public.delete_own_comment(uuid) from public, anon;
grant execute on function public.delete_own_comment(uuid) to authenticated;

comment on function public.delete_own_comment(uuid) is
  'Soft-deletes a comment for its author. Elevated rights are required because the row then becomes invisible to the author''s own SELECT policy.';


-- ---------------------------------------------------------------------------
-- Moderated comment state changes
-- ---------------------------------------------------------------------------
-- Moderation deliberately does not happen through a plain UPDATE: the client
-- cannot set `status`, and every state change must leave an audit row. The RPC
-- applies both writes in one transaction.
create or replace function public.moderate_comment(
  p_comment_id uuid,
  p_action public.moderation_action,
  p_reason text default null
)
returns public.moderation_action
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_exists boolean;
begin
  if not app_private.is_moderator() then
    raise exception 'Moderation requires a moderator role' using errcode = '42501';
  end if;

  select exists (select 1 from public.comments c where c.id = p_comment_id) into v_exists;
  if not v_exists then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;

  v_status := case p_action
                when 'hide' then 'hidden'
                when 'restore' then 'visible'
                when 'approve' then 'visible'
                when 'remove' then 'deleted'
              end;

  if v_status is null then
    raise exception 'Unsupported moderation action "%" for comments', p_action using errcode = '22023';
  end if;

  update public.comments
     set status = v_status,
         moderation_reason = coalesce(p_reason, moderation_reason)
   where id = p_comment_id;

  insert into public.moderation_actions (moderator_profile_id, comment_id, action, reason_code)
  values (auth.uid(), p_comment_id, p_action, p_reason);

  return p_action;
end;
$$;

revoke all on function public.moderate_comment(uuid, public.moderation_action, text) from public, anon;
grant execute on function public.moderate_comment(uuid, public.moderation_action, text) to authenticated;
