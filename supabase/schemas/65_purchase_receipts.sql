-- Persistente Request-Ergebnisse verhindern doppelte Wareneingänge nach Netzwerkfehlern.
create table public.purchase_receipt_requests (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  purchase_id uuid not null,
  request_id uuid not null,
  request_lines jsonb not null check (jsonb_typeof(request_lines) = 'array'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, request_id),
  foreign key (workspace_id, purchase_id) references public.purchases(workspace_id, id) on delete restrict
);
comment on table public.purchase_receipt_requests is 'Unveränderliche Ergebnisse autorisierter Wareneingangsrequests; kein zweites Bestandsbuch.';
create index purchase_receipt_requests_purchase_idx on public.purchase_receipt_requests(workspace_id, purchase_id);
alter table public.purchase_receipt_requests enable row level security;
revoke all on table public.purchase_receipt_requests from public, anon, authenticated;
grant select on table public.purchase_receipt_requests to authenticated;
create policy "Wareneingangsrequests lesen" on public.purchase_receipt_requests
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));

create function public.receive_purchase_lines_idempotent(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_request_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.purchase_receipt_requests;
  v_response jsonb;
  v_archived_at timestamptz;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Eine Request-ID ist für den Wareneingang erforderlich.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('receipt:' || p_workspace_id::text || ':' || p_request_id::text, 0)
  );
  select * into v_previous from public.purchase_receipt_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_previous.purchase_id is distinct from p_purchase_id
      or v_previous.request_lines is distinct from p_lines then
      raise exception using errcode = '22023', message = 'Die Request-ID wurde bereits für einen anderen Wareneingang verwendet.';
    end if;
    return v_previous.response;
  end if;

  -- Archivierung und Buchung werden bis Transaktionsende gegeneinander gesperrt.
  select archived_at into v_archived_at from public.workspaces
    where id = p_workspace_id for share;
  if v_archived_at is not null then
    raise exception using errcode = '55000', message = 'Der Workspace ist archiviert.';
  end if;

  -- Der vorhandene Kern hält Einkaufs-/Positionslocks, Mengenprüfung und Ereignisse atomar.
  v_response := public.receive_purchase_lines(p_workspace_id, p_purchase_id, p_lines);
  insert into public.purchase_receipt_requests(id,workspace_id,purchase_id,request_id,request_lines,response)
    values (gen_random_uuid(),p_workspace_id,p_purchase_id,p_request_id,p_lines,v_response);
  return v_response;
end;
$$;
alter function public.receive_purchase_lines_idempotent(uuid,uuid,uuid,jsonb) owner to postgres;
revoke all on function public.receive_purchase_lines_idempotent(uuid,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.receive_purchase_lines_idempotent(uuid,uuid,uuid,jsonb) to authenticated;
