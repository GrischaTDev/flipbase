-- migration: 20260915150000_sniper_run_state_and_origin.sql
-- purpose: add run_state, next_attempt_at and error fields to sniper_queries and create sniper_origin_state table
-- affected tables: sniper_queries, sniper_origin_state

alter table public.sniper_queries
    add column if not exists run_state text not null default 'ready'
        check (run_state in ('ready', 'cooldown', 'blocked', 'invalid')),
    add column if not exists next_attempt_at timestamptz,
    add column if not exists last_attempt_at timestamptz,
    add column if not exists last_success_at timestamptz,
    add column if not exists last_error_kind text,
    add column if not exists last_error_at timestamptz,
    add column if not exists last_error_message text;

create table if not exists public.sniper_origin_state (
    origin text primary key,
    state text not null default 'ready' check (state in ('ready', 'cooldown', 'blocked')),
    blocked_until timestamptz,
    reason text,
    probe_in_flight boolean not null default false,
    updated_at timestamptz not null default now()
);

comment on table public.sniper_origin_state is
    'Zentraler Zugangs- und Sperrzustand fuer externe Marktplatz-Origins.';

alter table public.sniper_origin_state enable row level security;
revoke all on public.sniper_origin_state from public, anon, authenticated;
grant select on public.sniper_origin_state to authenticated;
grant select, insert, update, delete on public.sniper_origin_state to service_role;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'sniper_origin_state'
          and policyname = 'sniper_origin_state_operator_select'
    ) then
        create policy "sniper_origin_state_operator_select" on public.sniper_origin_state
            for select to authenticated using ((select public.is_platform_operator()));
    end if;
end $$;

insert into public.sniper_origin_state (origin, state)
values ('vinted', 'ready')
on conflict (origin) do nothing;
