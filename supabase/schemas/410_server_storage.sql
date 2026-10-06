-- Ein einzelner Partitionsmesswert, ausschließlich für Plattformbetreiber lesbar.
create table public.server_storage_status (
    id smallint primary key default 1 check (id = 1),
    total_bytes bigint not null check (total_bytes > 0),
    used_bytes bigint not null check (used_bytes >= 0),
    available_bytes bigint not null check (available_bytes >= 0),
    reported_at timestamptz not null default now(),
    constraint server_storage_capacity check (used_bytes + available_bytes <= total_bytes)
);

comment on table public.server_storage_status is
    'Aktuelle Belegung der Server-Rootpartition. Keine Pfade, Kontodaten oder Prozessinformationen.';

alter table public.server_storage_status enable row level security;
revoke all on public.server_storage_status from public, anon, authenticated, service_role;
grant select on public.server_storage_status to authenticated;

create policy "Betreiber lesen den Server-Speicherstand" on public.server_storage_status
    for select to authenticated
    using ((select public.is_platform_operator()));

-- Nur der lokal provisionierte Meldezugang erhält EXECUTE. Er bekommt keine
-- Tabellenrechte; der festgelegte Datensatz verhindert wachsende Messhistorien.
create or replace function public.report_server_storage(
    p_total_bytes bigint,
    p_used_bytes bigint,
    p_available_bytes bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.server_storage_status (id, total_bytes, used_bytes, available_bytes, reported_at)
    values (1, p_total_bytes, p_used_bytes, p_available_bytes, statement_timestamp())
    on conflict (id) do update set
        total_bytes = excluded.total_bytes,
        used_bytes = excluded.used_bytes,
        available_bytes = excluded.available_bytes,
        reported_at = excluded.reported_at;
$$;

revoke all on function public.report_server_storage(bigint, bigint, bigint)
    from public, anon, authenticated, service_role;

comment on function public.report_server_storage(bigint, bigint, bigint) is
    'Ersetzt ausschließlich den einen Partitionsmesswert. EXECUTE nur für den lokal eingerichteten Meldezugang.';
