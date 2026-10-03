-- Dauerhafte Statusmeldungen für manuelle Vinted-Aktualisierungen.
-- Betroffene Tabelle: marketplace_operations. Weder Anbieter- noch Benutzertoken werden gespeichert.
create table public.marketplace_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  connection_id uuid not null,
  requested_by uuid not null references auth.users(id),
  kind text not null default 'sync' check (kind = 'sync'),
  state text not null default 'queued' check (state in ('queued', 'running', 'succeeded', 'failed')),
  stage text check (stage in ('browser', 'profile', 'publications', 'conversations', 'sales', 'persist', 'cleanup')),
  error_code text check (error_code in ('browser', 'identity', 'profile', 'publications', 'conversations', 'sales', 'messages', 'transaction', 'parse', 'persist', 'cleanup', 'access', 'interrupted')),
  runner_id uuid,
  counts jsonb check (counts is null or jsonb_typeof(counts) = 'object'),
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  source_results jsonb check (source_results is null or jsonb_typeof(source_results) = 'object'),
  authorization_kind text check (authorization_kind in ('manual_read', 'scheduled_read')),
  authorization_version bigint check (authorization_version = 1),
  schedule_id bigint,
  schedule_authorization_version bigint,
  worker_epoch bigint,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  browser_session_id uuid,
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_operations is 'Kontogebundene, dauerhafte Statusmeldungen für Datenabrufe; keine Token oder Vinted-Inhalte.';
create unique index marketplace_one_active_operation on public.marketplace_operations (workspace_id, connection_id) where state in ('queued', 'running');
create index marketplace_operations_scope on public.marketplace_operations (workspace_id, connection_id, created_at desc);
create index marketplace_operations_requester on public.marketplace_operations (requested_by, workspace_id);
alter table public.marketplace_operations enable row level security;
revoke all on public.marketplace_operations from public, anon, authenticated;
grant select on public.marketplace_operations to authenticated;
grant all on public.marketplace_operations to service_role;
create policy "Administrators read account operations" on public.marketplace_operations
for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads account operations" on public.marketplace_operations
for select to service_role using (true);
create policy "Worker inserts account operations" on public.marketplace_operations
for insert to service_role with check (true);
create policy "Worker updates account operations" on public.marketplace_operations
for update to service_role using (true) with check (true);
create policy "Worker deletes account operations" on public.marketplace_operations
for delete to service_role using (true);

create or replace function public.marketplace_sync_enqueue(p_workspace_id uuid, p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_operation public.marketplace_operations;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  perform 1 from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id
      and marketplace = 'vinted' and execution_mode = 'cloud' and status = 'connected' for update;
  if not found then raise exception 'Konto nicht verbunden' using errcode = '22023'; end if;
  insert into public.marketplace_operations (workspace_id, connection_id, requested_by, authorization_kind, authorization_version)
    values (p_workspace_id, p_connection_id, (select auth.uid()), 'manual_read', 1)
    on conflict (workspace_id, connection_id) where state in ('queued', 'running') do nothing
    returning * into v_operation;
  if v_operation.id is null then
    select * into v_operation from public.marketplace_operations
      where workspace_id = p_workspace_id and connection_id = p_connection_id
        and state in ('queued', 'running');
  end if;
  if v_operation.id is null then raise exception 'Auftrag konnte nicht angelegt werden'; end if;
  -- Der ausdrückliche Klick erteilt eine neue einmalige Freigabe; laufende Aufträge bleiben unverändert.
  if v_operation.state='queued' and v_operation.authorization_kind='scheduled_read' and v_operation.authorization_version=1 then
    update public.marketplace_operations set requested_by=(select auth.uid()),authorization_kind='manual_read',schedule_id=null,schedule_authorization_version=null
      where id=v_operation.id and state='queued' and authorization_kind='scheduled_read' returning * into v_operation;
  end if;
  return jsonb_build_object('id', v_operation.id, 'requestedBy', v_operation.requested_by,
    'state', v_operation.state, 'stage', v_operation.stage);
end;
$$;
revoke all on function public.marketplace_sync_enqueue(uuid, uuid) from public, anon;
grant execute on function public.marketplace_sync_enqueue(uuid, uuid) to authenticated;
