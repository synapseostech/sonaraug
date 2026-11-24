-- =============================================================================
-- Test helpers. Available to every RLS test file.
-- =============================================================================
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

/** Asserts a query returns exactly N rows. Use for RLS visibility checks. */
create or replace function tests.assert_rows(p_sql text, p_expected bigint, p_message text)
returns void language plpgsql as $$
declare v_count bigint;
begin
  execute format('select count(*) from (%s) q', p_sql) into v_count;
  if v_count is distinct from p_expected then
    raise exception 'ASSERTION FAILED: % (expected % row(s), got %)', p_message, p_expected, v_count;
  end if;
end;
$$;

/** Asserts a DML statement affects exactly N rows (RLS silently filters writes). */
create or replace function tests.assert_affected(p_sql text, p_expected bigint, p_message text)
returns void language plpgsql as $$
declare v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  if v_count is distinct from p_expected then
    raise exception 'ASSERTION FAILED: % (expected % row(s) affected, got %)', p_message, p_expected, v_count;
  end if;
end;
$$;

/** Asserts a statement is refused by RLS or privileges. */
create or replace function tests.assert_denied(p_sql text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege then
      return;
    when others then
      if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%permission denied'
         or sqlerrm ilike '%append-only%' then
        return;
      end if;
      raise;
  end;
  raise exception 'ASSERTION FAILED: % (statement was allowed)', p_message;
end;
$$;

/** Asserts a statement is refused with a specific message fragment. */
create or replace function tests.assert_rejected(p_sql text, p_fragment text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_fragment || '%' then
      return;
    end if;
    raise exception 'ASSERTION FAILED: % (raised "%" which does not mention "%")', p_message, sqlerrm, p_fragment;
  end;
  raise exception 'ASSERTION FAILED: % (statement was allowed)', p_message;
end;
$$;

/** Become an authenticated user. Must be called inside a transaction. */
create or replace function tests.login(p_profile_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
end;
$$;

/** Become an anonymous visitor. Must be called inside a transaction. */
create or replace function tests.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
