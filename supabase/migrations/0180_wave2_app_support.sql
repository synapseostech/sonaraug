-- =============================================================================
-- 0180 — Wave 2: small additions the Supabase application adapter relies on
-- =============================================================================
-- * Sample-content flags so generated test content can never pass as real.
-- * Public play counts (aggregate only; no listener rows are exposed).
-- * Refund decisions enforced in the database (finance, not on own requests).
-- * Display names of Medical Chronicles reviewers for the public episode page.
--
-- Reversal: drop the functions and policy below and the two is_sample columns.
-- =============================================================================

alter table public.mc_series   add column is_sample boolean not null default false;
alter table public.mc_episodes add column is_sample boolean not null default false;

create or replace function public.mc_play_counts()
returns table (episode_id uuid, plays bigint)
language sql stable security definer set search_path = '' as $$
  select l.episode_id, count(*)::bigint
  from public.mc_listening_events l
  where app_private.mc_episode_is_public(l.episode_id)
  group by l.episode_id;
$$;

/** The name shown next to "medical review recorded by …" on a public episode page. */
create or replace function public.mc_reviewer_names()
returns table (profile_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select distinct p.id, p.display_name
  from public.mc_episodes e
  join public.profiles p on p.id = e.last_reviewed_by
  where app_private.mc_episode_is_public(e.id) or app_private.can_edit_chronicles();
$$;

grant update (status, decided_by, decided_at, decision_note) on public.refund_requests to authenticated;
create policy refund_requests_finance_decide on public.refund_requests for update to authenticated
  using (app_private.is_finance() and requested_by <> auth.uid())
  with check (app_private.is_finance() and decided_by = auth.uid() and requested_by <> auth.uid());

revoke all on function public.mc_play_counts(), public.mc_reviewer_names() from public;
grant execute on function public.mc_play_counts(), public.mc_reviewer_names() to anon, authenticated, service_role;

/**
 * Signs out ONE of the caller's own devices. Deleting the auth session revokes
 * its refresh tokens; Sonara verifies every request with Supabase Auth, which
 * then reports the session as gone. Other users' sessions are never affected.
 */
create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  delete from auth.sessions where id = p_session_id and user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated, service_role;
