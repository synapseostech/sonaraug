-- =============================================================================
-- 0090 — Triggers and business rules
-- =============================================================================
-- Rules that must hold no matter which app, worker or SQL console writes the
-- row. Anything enforced only in the client is not enforced at all.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. updated_at maintenance (all mutable tables)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'updated_at'
      )
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Search vectors (English stemming would mangle Luganda, so use 'simple')
-- ---------------------------------------------------------------------------
create or replace function app_private.stations_search_vector()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.search_vector :=
      setweight(to_tsvector('simple', coalesce(new.name, '')), 'A')
   || setweight(to_tsvector('simple', coalesce(new.tagline, '')), 'B')
   || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger stations_search_vector before insert or update of name, tagline, description
  on public.stations for each row execute function app_private.stations_search_vector();

create or replace function app_private.podcasts_search_vector()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.search_vector :=
      setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
   || setweight(to_tsvector('simple', coalesce(new.author_display, '')), 'B')
   || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger podcasts_search_vector before insert or update of title, author_display, description
  on public.podcasts for each row execute function app_private.podcasts_search_vector();

create or replace function app_private.episodes_search_vector()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.search_vector :=
      setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
   || setweight(to_tsvector('simple', coalesce(new.summary, '')), 'B')
   || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger podcast_episodes_search_vector before insert or update of title, summary, description
  on public.podcast_episodes for each row execute function app_private.episodes_search_vector();

create or replace function app_private.videos_search_vector()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.search_vector :=
      setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
   || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger videos_search_vector before insert or update of title, description
  on public.videos for each row execute function app_private.videos_search_vector();

create or replace function app_private.channels_search_vector()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.search_vector :=
      setweight(to_tsvector('simple', coalesce(new.name, '')), 'A')
   || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger creator_channels_search_vector before insert or update of name, description
  on public.creator_channels for each row execute function app_private.channels_search_vector();

-- ---------------------------------------------------------------------------
-- 3. Publish gate for radio stations
-- ---------------------------------------------------------------------------
-- A station may only become public when (a) its organisation is verified,
-- (b) at least one endpoint has been probed as playable, and (c) a rights
-- record is in force for Uganda. Without (c) a retransmission would be
-- unlicensed, which is a legal risk we refuse to take silently.
create or replace function app_private.enforce_station_publishable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verified boolean;
  v_playable integer;
  v_rights   integer;
begin
  if new.status <> 'published' then
    return new;
  end if;
  -- Only check on the transition into published, so unrelated edits to an
  -- already-public station are not blocked by unrelated constraints.
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

  select count(*) into v_rights
  from public.rights_records r
  where r.station_id = new.id
    and r.licence_type <> 'unknown'
    and r.valid_from <= current_date
    and (r.valid_to is null or r.valid_to >= current_date)
    and 'UG' = any (r.territory_codes);

  if v_rights = 0 then
    raise exception 'Station % has no rights record in force for Uganda', new.id
      using errcode = '23514',
            hint = 'Record the broadcaster authorisation in rights_records first.';
  end if;

  new.published_at := coalesce(new.published_at, now());
  return new;
end;
$$;

create trigger stations_publish_gate before insert or update of status on public.stations
  for each row execute function app_private.enforce_station_publishable();

-- ---------------------------------------------------------------------------
-- 4. A backup stream must belong to the same station as its primary
-- ---------------------------------------------------------------------------
create or replace function app_private.enforce_backup_same_station()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_station uuid;
begin
  if new.backup_of_stream_id is null then
    return new;
  end if;
  select station_id into v_station from public.station_streams where id = new.backup_of_stream_id;
  if v_station is null then
    raise exception 'Backup stream % does not exist', new.backup_of_stream_id using errcode = '23503';
  end if;
  if v_station <> new.station_id then
    raise exception 'A backup stream must belong to the same station' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger station_streams_backup_check before insert or update of backup_of_stream_id, station_id
  on public.station_streams for each row execute function app_private.enforce_backup_same_station();

-- ---------------------------------------------------------------------------
-- 5. Append-only tables cannot be rewritten
-- ---------------------------------------------------------------------------
create or replace function app_private.reject_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Table % is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function app_private.reject_mutation();
create trigger moderation_actions_append_only before update or delete on public.moderation_actions
  for each row execute function app_private.reject_mutation();

-- ---------------------------------------------------------------------------
-- 6. Audit trail for sensitive tables
-- ---------------------------------------------------------------------------
create or replace function app_private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  v_action := lower(tg_op);
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    v_action,
    tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid else (to_jsonb(new) ->> 'id')::uuid end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organisations', 'stations', 'campaigns', 'rights_records',
    'verification_requests', 'platform_roles', 'payouts'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Profile provisioning for new auth users
-- ---------------------------------------------------------------------------
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Anonymous listeners get no profile row: they can stream radio without
  -- handing us any personal data. A profile is created on registration.
  if new.is_anonymous = true then
    return new;
  end if;

  insert into public.profiles (id, display_name, is_anonymous)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Listener'),
    false
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (profile_id) values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();
