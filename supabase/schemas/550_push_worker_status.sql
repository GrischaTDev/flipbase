-- Lebenszeichen des Push-Workers fuer den Systemzustand der Administration.
-- Ein einzelner Meldestand mit Zaehlern; keine Geraete, Endpunkte oder Inhalte.

create table public.push_worker_runtime_status (
    id smallint primary key default 1 check (id = 1),
    reported_at timestamptz not null,
    enabled boolean not null,
    waiting integer not null check (waiting >= 0),
    retry integer not null check (retry >= 0),
    configuration_error integer not null check (configuration_error >= 0)
);

comment on table public.push_worker_runtime_status is
    'Letzte Betriebsmeldung des Push-Workers; eine alte oder fehlende Meldung ist kein gesunder Betrieb.';

alter table public.push_worker_runtime_status enable row level security;
revoke all on public.push_worker_runtime_status from public, anon, authenticated, service_role;
grant select, insert, update on public.push_worker_runtime_status to service_role;

-- Betreiber lesen den Stand nur ueber platform_system_health.
create policy "Push-Worker liest seinen Meldestand" on public.push_worker_runtime_status
    for select to service_role
    using (true);

create policy "Push-Worker legt seinen Meldestand an" on public.push_worker_runtime_status
    for insert to service_role
    with check (id = 1);

create policy "Push-Worker aktualisiert seinen Meldestand" on public.push_worker_runtime_status
    for update to service_role
    using (id = 1)
    with check (id = 1);

create or replace function public.push_worker_report_status(
    p_enabled boolean,
    p_waiting integer,
    p_retry integer,
    p_configuration_error integer
)
returns void
language sql
security invoker
volatile
set search_path = ''
as $$
    insert into public.push_worker_runtime_status (
        id, reported_at, enabled, waiting, retry, configuration_error
    )
    values (
        1, now(), coalesce(p_enabled, false),
        greatest(coalesce(p_waiting, 0), 0),
        greatest(coalesce(p_retry, 0), 0),
        greatest(coalesce(p_configuration_error, 0), 0)
    )
    on conflict (id) do update
    set reported_at = excluded.reported_at,
        enabled = excluded.enabled,
        waiting = excluded.waiting,
        retry = excluded.retry,
        configuration_error = excluded.configuration_error;
$$;

comment on function public.push_worker_report_status(boolean, integer, integer, integer) is
    'Speichert die Betriebsmeldung des Push-Workers; nur fuer den Dienstschluessel.';

revoke all on function public.push_worker_report_status(boolean, integer, integer, integer)
    from public, anon, authenticated;
grant execute on function public.push_worker_report_status(boolean, integer, integer, integer)
    to service_role;
