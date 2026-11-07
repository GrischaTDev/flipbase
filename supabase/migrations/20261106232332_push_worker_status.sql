-- Lebenszeichen des Push-Workers: neue Tabelle push_worker_runtime_status (eine Meldezeile)
-- mit Funktion push_worker_report_status; platform_system_health liefert zusaetzlich pushWorker.
-- Keine bestehenden Daten betroffen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

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

create or replace function public.platform_system_health()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
    if not public.is_platform_operator() then
        raise exception 'Nur Betreiber duerfen den Systemzustand lesen'
            using errcode = '42501';
    end if;

    return jsonb_build_object(
        'checkedAt', now(),
        'marketplaceWorker', (
            select jsonb_build_object(
                'heartbeatAt', runtime.heartbeat_at,
                'expiresAt', runtime.expires_at
            )
            from public.marketplace_worker_runtime as runtime
            where runtime.id = 1
        ),
        'feedBot', (
            select jsonb_build_object(
                'reportedAt', status.reported_at,
                'requestsLastMinute', status.requests_last_minute,
                'rejectedLastMinute', status.rejected_last_minute,
                'requestBudget', status.request_budget,
                'lastCycleError', status.last_cycle_error,
                'vintedLastSuccessAt', status.vinted_last_success_at
            )
            from public.sniper_runtime_status as status
            where status.id = 1
        ),
        'pushWorker', (
            select jsonb_build_object(
                'reportedAt', push.reported_at,
                'enabled', push.enabled,
                'waiting', push.waiting,
                'retry', push.retry,
                'configurationError', push.configuration_error
            )
            from public.push_worker_runtime_status as push
            where push.id = 1
        ),
        'storage', (
            select jsonb_build_object(
                'reportedAt', storage.reported_at,
                'totalBytes', storage.total_bytes,
                'usedBytes', storage.used_bytes
            )
            from public.server_storage_status as storage
            where storage.id = 1
        ),
        'operationsLastHour', (
            select jsonb_build_object(
                'queued', count(*) filter (where operation.state = 'queued'),
                'running', count(*) filter (where operation.state = 'running'),
                'succeeded', count(*) filter (where operation.state = 'succeeded'),
                'failed', count(*) filter (where operation.state = 'failed')
            )
            from public.marketplace_operations as operation
            where operation.created_at >= now() - interval '1 hour'
                or operation.state in ('queued', 'running')
        ),
        'cloudIps', (
            select jsonb_build_object(
                'enabled', count(*) filter (where ip.enabled and ip.expires_at > now()),
                'expiringSoon', count(*) filter (
                    where ip.enabled
                        and ip.expires_at > now()
                        and ip.expires_at <= now() + interval '7 days'
                ),
                'expired', count(*) filter (where ip.expires_at <= now())
            )
            from public.marketplace_cloud_ips as ip
        )
    );
end;
$$;

comment on function public.platform_system_health() is
    'Systemzustand fuer die Administration: Worker-, Bot-, Push-, Speicher-, Auftrags- und IP-Lebenszeichen.';
