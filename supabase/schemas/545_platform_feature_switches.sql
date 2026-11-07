-- Zentrale Not-Aus-Schalter fuer Kernbereiche und die Systemuebersicht der Administration.
--
-- Ein abgeschalteter Bereich zeigt allen Nutzern eine Wartungsseite, und die
-- Server-Dienste nehmen fuer ihn keine neuen Auftraege an. Bereits laufende
-- Auftraege enden regulaer; wartende bleiben stehen, bis der Bereich wieder an ist.

create table public.platform_feature_switches (
    feature_key text primary key
        check (feature_key in ('vinted', 'ebay', 'kleinanzeigen', 'vinted_feed')),
    enabled boolean not null default true,
    maintenance_message text
        check (maintenance_message is null or char_length(maintenance_message) between 1 and 280),
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null
);

-- Bewusst ein fester Fachschluessel statt einer laufenden Nummer: Frontend,
-- Worker und Bot fragen genau diese vier Bereiche ab, eine Nummer haette dort
-- keine Bedeutung.
comment on table public.platform_feature_switches is
    'Betreiberschalter je Kernbereich. Aus bedeutet Wartungsseite fuer Nutzer und keine neuen Serverauftraege.';

create index platform_feature_switches_updated_by_idx
    on public.platform_feature_switches (updated_by);

alter table public.platform_feature_switches enable row level security;
revoke all on public.platform_feature_switches from public, anon, authenticated, service_role;
grant select on public.platform_feature_switches to authenticated, service_role;

-- Jeder angemeldete Nutzer muss wissen, ob ein Bereich geschlossen ist.
-- Geaendert wird ausschliesslich ueber set_platform_feature_switch.
create policy "Angemeldete lesen die Bereichsschalter" on public.platform_feature_switches
    for select to authenticated
    using (true);

create policy "Dienste lesen die Bereichsschalter" on public.platform_feature_switches
    for select to service_role
    using (true);

insert into public.platform_feature_switches (feature_key)
values ('vinted'), ('ebay'), ('kleinanzeigen'), ('vinted_feed')
on conflict (feature_key) do nothing;

-- Fuer Datenbankfunktionen der Server- und Erweiterungsauftraege: Ist der Bereich offen?
-- Ohne Eintrag gilt ein Bereich als offen, wie im Frontend und in den Diensten.
create or replace function public.platform_feature_enabled(p_feature_key text)
returns boolean
language sql
security invoker
stable
set search_path = ''
as $$
    select coalesce(
        (
            select switch.enabled
            from public.platform_feature_switches as switch
            where switch.feature_key = p_feature_key
        ),
        true
    );
$$;

comment on function public.platform_feature_enabled(text) is
    'Liefert false nur fuer einen vom Betreiber abgeschalteten Bereich.';

revoke all on function public.platform_feature_enabled(text) from public, anon;
grant execute on function public.platform_feature_enabled(text) to authenticated, service_role;

create or replace function public.set_platform_feature_switch(
    p_feature_key text,
    p_enabled boolean,
    p_maintenance_message text default null
)
returns public.platform_feature_switches
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
    v_row public.platform_feature_switches;
begin
    if not public.is_platform_operator() then
        raise exception 'Nur Betreiber duerfen Bereiche schalten'
            using errcode = '42501';
    end if;
    if p_enabled is null then
        raise exception 'Schalterstellung fehlt' using errcode = '22023';
    end if;

    update public.platform_feature_switches
    set enabled = p_enabled,
        maintenance_message = nullif(btrim(p_maintenance_message), ''),
        updated_at = now(),
        updated_by = (select auth.uid())
    where feature_key = p_feature_key
    returning * into v_row;

    if not found then
        raise exception 'Unbekannter Bereich' using errcode = '22023';
    end if;
    return v_row;
end;
$$;

comment on function public.set_platform_feature_switch(text, boolean, text) is
    'Schaltet einen Kernbereich fuer alle Nutzer ein oder aus; nur fuer Betreiber.';

alter function public.set_platform_feature_switch(text, boolean, text) owner to postgres;
revoke all on function public.set_platform_feature_switch(text, boolean, text) from public, anon;
grant execute on function public.set_platform_feature_switch(text, boolean, text) to authenticated;

-- Liefert der Administration die letzten Lebenszeichen der Server-Dienste.
-- Der Push-Stand kommt aus public.push_worker_runtime_status (550_push_worker_status.sql).
-- Nur Zeitpunkte, Zaehler und feste Fehlertexte; keine Kontodaten, Pfade oder
-- Proxyzugaenge.
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

alter function public.platform_system_health() owner to postgres;
revoke all on function public.platform_system_health() from public, anon;
grant execute on function public.platform_system_health() to authenticated;
