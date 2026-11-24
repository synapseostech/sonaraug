-- =============================================================================
-- 0140 — Creator applications, in-app notifications, audited role grants
-- =============================================================================
-- * A creator application is reviewed by staff. Paying for a creator plan never
--   approves an application, and an applicant can never approve their own.
-- * Notifications belong to their recipient; only the server creates them.
-- * Platform roles change only through grant/revoke RPCs that apply the rules in
--   packages/auth/src/staff.ts: no self-changes, only super_admin touches the
--   admin roles, and the last super_admin stays.
--
-- Reversal: drop the functions and tables at the bottom.
-- =============================================================================

create table public.creator_applications (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  display_name        text not null,
  biography           text not null,
  content_category    text not null,
  show_proposal       text not null,
  rights_declaration  boolean not null,
  terms_version       text not null,
  status              text not null default 'submitted',
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  decision_reason     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint creator_applications_status check (status in ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn')),
  constraint creator_applications_rights check (rights_declaration),
  constraint creator_applications_lengths check (
    char_length(display_name) between 2 and 80 and char_length(biography) between 20 and 4000 and char_length(show_proposal) between 20 and 4000
  ),
  constraint creator_applications_decision check (
    status not in ('approved', 'rejected') or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint creator_applications_not_self_reviewed check (reviewed_by is distinct from profile_id)
);

create unique index creator_applications_one_open on public.creator_applications (profile_id)
  where status in ('submitted', 'under_review');

create or replace function app_private.guard_creator_application()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.profile_id <> auth.uid() or new.status <> 'submitted' or new.reviewed_by is not null then
      raise exception 'an application is submitted by its applicant, unreviewed' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.profile_id = auth.uid() and not app_private.is_moderator() then
    -- The applicant may only withdraw.
    if new.status not in (old.status, 'withdrawn') or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'applicants can only withdraw their application' using errcode = '42501';
    end if;
    return new;
  end if;
  if not app_private.is_moderator() then
    raise exception 'only staff can review creator applications' using errcode = '42501';
  end if;
  if new.status in ('approved', 'rejected') and new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger creator_applications_guard before insert or update on public.creator_applications
  for each row execute function app_private.guard_creator_application();
create trigger creator_applications_updated_at before update on public.creator_applications
  for each row execute function app_private.set_updated_at();

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null default '',
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint notifications_link_relative check (link is null or link ~ '^/[^/]')
);

create index notifications_inbox_idx on public.notifications (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Role grants
-- ---------------------------------------------------------------------------
create or replace function public.grant_platform_role(p_profile_id uuid, p_role public.platform_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_profile_id = auth.uid() then
    raise exception 'you cannot change your own roles' using errcode = '42501';
  end if;
  if not app_private.is_platform_admin() then
    raise exception 'only administrators can grant roles' using errcode = '42501';
  end if;
  if p_role in ('super_admin', 'admin') and not app_private.has_platform_role(array['super_admin']::public.platform_role[]) then
    raise exception 'only a super administrator can grant administrator roles' using errcode = '42501';
  end if;
  insert into public.platform_roles (profile_id, role, granted_by) values (p_profile_id, p_role, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.revoke_platform_role(p_profile_id uuid, p_role public.platform_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_profile_id = auth.uid() then
    raise exception 'you cannot change your own roles' using errcode = '42501';
  end if;
  if not app_private.is_platform_admin() then
    raise exception 'only administrators can revoke roles' using errcode = '42501';
  end if;
  if p_role in ('super_admin', 'admin') and not app_private.has_platform_role(array['super_admin']::public.platform_role[]) then
    raise exception 'only a super administrator can revoke administrator roles' using errcode = '42501';
  end if;
  if p_role = 'super_admin' and (select count(*) from public.platform_roles where role = 'super_admin') <= 1 then
    raise exception 'the last super administrator cannot be removed';
  end if;
  delete from public.platform_roles where profile_id = p_profile_id and role = p_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------
revoke execute on function public.grant_platform_role(uuid, public.platform_role), public.revoke_platform_role(uuid, public.platform_role) from public, anon;
grant execute on function public.grant_platform_role(uuid, public.platform_role), public.revoke_platform_role(uuid, public.platform_role) to authenticated, service_role;

grant select, insert, update on public.creator_applications to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.creator_applications, public.notifications to service_role;

alter table public.creator_applications enable row level security;
alter table public.notifications enable row level security;

create policy creator_applications_owner_read on public.creator_applications for select to authenticated
  using (profile_id = auth.uid() or app_private.is_moderator());
create policy creator_applications_owner_insert on public.creator_applications for insert to authenticated
  with check (profile_id = auth.uid());
create policy creator_applications_update on public.creator_applications for update to authenticated
  using (profile_id = auth.uid() or app_private.is_moderator())
  with check (profile_id = auth.uid() or app_private.is_moderator());

create policy notifications_owner_read on public.notifications for select to authenticated using (profile_id = auth.uid());
create policy notifications_owner_mark_read on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create trigger creator_applications_audit after insert or update or delete on public.creator_applications
  for each row execute function app_private.audit_row_change();

-- Reversal (manual):
--   drop function public.revoke_platform_role(uuid, public.platform_role), public.grant_platform_role(uuid, public.platform_role),
--     app_private.guard_creator_application();
--   drop table public.notifications, public.creator_applications;
