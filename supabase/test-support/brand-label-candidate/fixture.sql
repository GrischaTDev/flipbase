-- Ausschließlich für den vom beiliegenden Runner NEU erzeugten Testcluster.
-- Kein Abbild des gesamten Flipbase-Schemas oder von Supabase Auth.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.platform_operators(user_id uuid primary key references auth.users(id));
alter table public.platform_operators enable row level security;
create function public.is_platform_operator() returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.platform_operators where user_id = (select auth.uid()));
$$;
create table public.workspaces(id uuid primary key, access_valid boolean not null);
create table public.workspace_members(workspace_id uuid references public.workspaces(id), user_id uuid references auth.users(id));
create function public.workspace_access_is_valid(p_workspace_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((select access_valid from public.workspaces where id = p_workspace_id), false);
$$;
revoke all on function public.workspace_access_is_valid(uuid) from public, anon, authenticated;
grant execute on function public.workspace_access_is_valid(uuid) to service_role;

insert into auth.users values ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003');
insert into public.platform_operators values ('00000000-0000-0000-0000-000000000001');
insert into public.workspaces values ('10000000-0000-0000-0000-000000000001', true),
 ('10000000-0000-0000-0000-000000000002', false);
insert into public.workspace_members values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003');

-- Testhilfen, absichtlich nicht Teil des Schemakandidaten.
create schema label_test;
grant usage on schema label_test to authenticated, anon;
create function label_test.assert_true(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
    if p_ok is distinct from true then raise exception 'ASSERTION FAILED: %', p_name; end if;
    raise notice 'PASS: %', p_name;
end;
$$;
create function label_test.expect_error(p_sql text, p_state text, p_name text) returns void language plpgsql security invoker as $$
declare caught text;
begin
    begin
        execute p_sql;
    exception when others then
        get stacked diagnostics caught = returned_sqlstate;
    end;
    if caught is distinct from p_state then
        raise exception 'ASSERTION FAILED: %, expected %, got %', p_name, p_state, coalesce(caught, 'success');
    end if;
    raise notice 'PASS: %', p_name;
end;
$$;
grant execute on all functions in schema label_test to authenticated, anon;
