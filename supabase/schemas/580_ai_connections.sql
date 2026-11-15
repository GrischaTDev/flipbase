-- Accountgebundene KI-Freigaben. Die Token-Identität ist die Freigabe, niemals ein App-Benutzer.
create table public.ai_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.oauth_clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  access_mode text not null check (access_mode in ('read', 'edit')),
  accounts_changed_at timestamptz,
  authorization_id text not null unique,
  session_id uuid,
  connected_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);
comment on table public.ai_connections is 'Persönliche OAuth-Freigaben; zufällige UUID als getrennte Token-Identität ohne App-Benutzerrechte.';
create unique index ai_connections_active_client_idx on public.ai_connections(user_id, client_id) where revoked_at is null;
create index ai_connections_client_idx on public.ai_connections(client_id);
create index ai_connections_workspace_idx on public.ai_connections(workspace_id);
create index ai_connections_session_idx on public.ai_connections(session_id);
alter table public.ai_connections enable row level security;
revoke all on public.ai_connections from public, anon, authenticated, service_role;
grant select on public.ai_connections to authenticated;
create policy "Eigene KI-Verbindungen lesen" on public.ai_connections for select to authenticated using (user_id = (select auth.uid()));

create table public.ai_connection_accounts (
  id bigint generated always as identity primary key,
  ai_connection_id uuid not null references public.ai_connections(id) on delete cascade,
  connection_id uuid not null references public.marketplace_connections(id) on delete cascade,
  unique(ai_connection_id, connection_id)
);
comment on table public.ai_connection_accounts is 'Ausdrücklich freigegebene Vinted-Konten; neue Konten erweitern eine Freigabe nicht.';
create index ai_connection_accounts_connection_idx on public.ai_connection_accounts(connection_id);
alter table public.ai_connection_accounts enable row level security;
revoke all on public.ai_connection_accounts from public, anon, authenticated, service_role;
revoke all on sequence public.ai_connection_accounts_id_seq from public,anon,authenticated,service_role;

create table public.ai_connection_requests (
  id uuid primary key,
  ai_connection_id uuid not null references public.ai_connections(id) on delete cascade,
  action text not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp()
);
comment on table public.ai_connection_requests is 'Atomarer Wiederholschutz für KI-Fachaktionen; kein zusätzliches Buchungs- oder Auftragssystem.';
create index ai_connection_requests_connection_idx on public.ai_connection_requests(ai_connection_id);
alter table public.ai_connection_requests enable row level security;
revoke all on public.ai_connection_requests from public, anon, authenticated, service_role;

create policy "ai_connections anon select denied" on public.ai_connections for select to anon using (false);
create policy "ai_connections anon insert denied" on public.ai_connections for insert to anon with check (false);
create policy "ai_connections anon update denied" on public.ai_connections for update to anon using (false) with check (false);
create policy "ai_connections anon delete denied" on public.ai_connections for delete to anon using (false);
create policy "ai_connections authenticated insert denied" on public.ai_connections for insert to authenticated with check (false);
create policy "ai_connections authenticated update denied" on public.ai_connections for update to authenticated using (false) with check (false);
create policy "ai_connections authenticated delete denied" on public.ai_connections for delete to authenticated using (false);
create policy "ai_connection_accounts anon select denied" on public.ai_connection_accounts for select to anon using (false);
create policy "ai_connection_accounts anon insert denied" on public.ai_connection_accounts for insert to anon with check (false);
create policy "ai_connection_accounts anon update denied" on public.ai_connection_accounts for update to anon using (false) with check (false);
create policy "ai_connection_accounts anon delete denied" on public.ai_connection_accounts for delete to anon using (false);
create policy "ai_connection_accounts authenticated select denied" on public.ai_connection_accounts for select to authenticated using (false);
create policy "ai_connection_accounts authenticated insert denied" on public.ai_connection_accounts for insert to authenticated with check (false);
create policy "ai_connection_accounts authenticated update denied" on public.ai_connection_accounts for update to authenticated using (false) with check (false);
create policy "ai_connection_accounts authenticated delete denied" on public.ai_connection_accounts for delete to authenticated using (false);
create policy "ai_connection_requests anon select denied" on public.ai_connection_requests for select to anon using (false);
create policy "ai_connection_requests anon insert denied" on public.ai_connection_requests for insert to anon with check (false);
create policy "ai_connection_requests anon update denied" on public.ai_connection_requests for update to anon using (false) with check (false);
create policy "ai_connection_requests anon delete denied" on public.ai_connection_requests for delete to anon using (false);
create policy "ai_connection_requests authenticated select denied" on public.ai_connection_requests for select to authenticated using (false);
create policy "ai_connection_requests authenticated insert denied" on public.ai_connection_requests for insert to authenticated with check (false);
create policy "ai_connection_requests authenticated update denied" on public.ai_connection_requests for update to authenticated using (false) with check (false);
create policy "ai_connection_requests authenticated delete denied" on public.ai_connection_requests for delete to authenticated using (false);

alter table public.marketplace_listing_jobs add column ai_connection_id uuid references public.ai_connections(id) on delete restrict;
create index marketplace_listing_jobs_ai_connection_idx on public.marketplace_listing_jobs(ai_connection_id);

alter table public.marketplace_account_actions add column ai_connection_id uuid references public.ai_connections(id) on delete restrict;
create index marketplace_account_actions_ai_connection_idx on public.marketplace_account_actions(ai_connection_id);

create function public.ai_connection_grant(p_authorization_id text, p_workspace_id uuid, p_access_mode text, p_connection_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_client_id uuid; v_id uuid; g public.ai_connections;
begin
  if auth.role() <> 'authenticated' or auth.jwt() ? 'client_id' or auth.uid() is null
    or not public.can_access_workspace(p_workspace_id) or p_access_mode not in ('read','edit')
    or cardinality(p_connection_ids) > 50 then
    raise exception 'Diese KI-Verbindung kann nicht freigegeben werden.' using errcode='42501';
  end if;
  select client_id into v_client_id from auth.oauth_authorizations
    where authorization_id=p_authorization_id and status='pending' and expires_at>clock_timestamp() and (user_id is null or user_id=auth.uid());
  if not found then raise exception 'Die Anmeldung ist abgelaufen.' using errcode='22023'; end if;
  if p_access_mode='edit' and not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=auth.uid() and role in ('owner','admin','member','accountant')) then
    raise exception 'Deine Workspace-Rolle erlaubt keine Bearbeitung.' using errcode='42501';
  end if;
  if exists(select 1 from unnest(p_connection_ids) selected(id) where not exists(
    select 1 from public.marketplace_connections c where c.id=selected.id and c.workspace_id=p_workspace_id
    and c.marketplace='vinted' and public.marketplace_can_manage(p_workspace_id))) then
    raise exception 'Ein Vinted-Konto ist nicht zugänglich.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||v_client_id::text,0));
  select * into g from public.ai_connections where authorization_id=p_authorization_id;
  if found then
    if g.revoked_at is not null or g.user_id<>auth.uid() or g.workspace_id<>p_workspace_id or g.access_mode<>p_access_mode
      or (select coalesce(array_agg(connection_id order by connection_id),'{}'::uuid[]) from public.ai_connection_accounts where ai_connection_id=g.id)
        is distinct from (select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) from unnest(p_connection_ids) selected(id)) then
      raise exception 'Die Zustimmung wurde bereits mit einer anderen Freigabe verwendet.' using errcode='22023';
    end if;
    return g.id;
  end if;
  update public.ai_connections set revoked_at=clock_timestamp() where user_id=auth.uid() and client_id=v_client_id and revoked_at is null;
  update auth.oauth_authorizations set status='expired',expires_at=clock_timestamp()
    where user_id=auth.uid() and client_id=v_client_id and authorization_id<>p_authorization_id and status='approved';
  insert into public.ai_connections(user_id,client_id,workspace_id,access_mode,authorization_id)
    values(auth.uid(),v_client_id,p_workspace_id,p_access_mode,p_authorization_id) returning id into v_id;
  insert into public.ai_connection_accounts(ai_connection_id,connection_id) select v_id,id from unnest(p_connection_ids) selected(id) group by id;
  return v_id;
end $$;
revoke all on function public.ai_connection_grant(text,uuid,text,uuid[]) from public,anon;
grant execute on function public.ai_connection_grant(text,uuid,text,uuid[]) to authenticated;

create function public.ai_connection_revoke(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'authenticated' or auth.jwt() ? 'client_id' then raise insufficient_privilege; end if;
  update public.ai_connections set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_id and user_id=auth.uid();
end $$;
revoke all on function public.ai_connection_revoke(uuid) from public,anon;
grant execute on function public.ai_connection_revoke(uuid) to authenticated;

create function public.ai_connection_update(p_id uuid, p_workspace_id uuid, p_access_mode text, p_connection_ids uuid[], p_expected_access_mode text, p_expected_connection_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare g public.ai_connections; current_accounts uuid[]; expected_accounts uuid[];
begin
  if auth.role()<>'authenticated' or auth.jwt() ? 'client_id' or auth.uid() is null
    or not public.can_access_workspace(p_workspace_id) then raise insufficient_privilege; end if;
  if p_access_mode is null or p_access_mode not in ('read','edit') or p_connection_ids is null
    or cardinality(p_connection_ids)>50 or p_expected_access_mode is null or p_expected_connection_ids is null then
    raise exception 'Die KI-Freigabe ist unvollständig.' using errcode='22023';
  end if;
  select * into g from public.ai_connections
    where id=p_id and user_id=auth.uid() and workspace_id=p_workspace_id and revoked_at is null for update;
  if not found then raise insufficient_privilege; end if;
  select coalesce(array_agg(connection_id order by connection_id),'{}'::uuid[]) into current_accounts
    from public.ai_connection_accounts where ai_connection_id=g.id;
  select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into expected_accounts from unnest(p_expected_connection_ids) selected(id);
  if g.access_mode<>p_expected_access_mode or current_accounts is distinct from expected_accounts then
    raise exception 'Die Freigabe wurde inzwischen geändert. Lade die Verbindungen neu.' using errcode='40001';
  end if;
  if p_access_mode='edit' and not exists(select 1 from public.workspace_members
    where workspace_id=g.workspace_id and user_id=g.user_id and role in ('owner','admin','member','accountant')) then
    raise exception 'Deine Workspace-Rolle erlaubt keine Bearbeitung.' using errcode='42501';
  end if;
  if exists(select 1 from unnest(p_connection_ids) selected(id) where not exists(
    select 1 from public.marketplace_connections c where c.id=selected.id and c.workspace_id=g.workspace_id
      and c.marketplace='vinted' and public.marketplace_can_manage(g.workspace_id))) then
    raise exception 'Ein Vinted-Konto ist nicht zugänglich.' using errcode='42501';
  end if;
  update public.ai_connections set access_mode=p_access_mode,
    accounts_changed_at=case when current_accounts is distinct from
      (select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) from unnest(p_connection_ids) selected(id))
      then clock_timestamp() else accounts_changed_at end where id=g.id;
  delete from public.ai_connection_accounts where ai_connection_id=g.id and not (connection_id=any(p_connection_ids));
  insert into public.ai_connection_accounts(ai_connection_id,connection_id)
    select g.id,id from unnest(p_connection_ids) selected(id) group by id on conflict(ai_connection_id,connection_id) do nothing;
end $$;
revoke all on function public.ai_connection_update(uuid,uuid,text,uuid[],text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.ai_connection_update(uuid,uuid,text,uuid[],text,uuid[]) to authenticated;

create function public.ai_connection_access_token_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb:=event->'claims'; g public.ai_connections; s auth.sessions;
begin
  select * into s from auth.sessions where id=(c->>'session_id')::uuid;
  if nullif(c->>'client_id','') is null and s.oauth_client_id is null then return event; end if;
  select * into g from public.ai_connections where user_id=(event->>'user_id')::uuid
    and client_id=(c->>'client_id')::uuid and revoked_at is null for update;
  if g.id is null or s.id is null or s.user_id<>g.user_id or s.oauth_client_id is distinct from g.client_id
    or s.created_at<g.created_at then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Die KI-Freigabe ist nicht mehr gültig.'));
  end if;
  if g.session_id is null then update public.ai_connections set session_id=s.id where id=g.id; end if;
  -- anon besitzt kein authenticated-Erbe. Der getrennte sub sperrt auch Auth-/Worker-Benutzerendpunkte.
  c:=c||jsonb_build_object('sub',g.id,'role','anon','email','','phone','','user_metadata','{}'::jsonb,'app_metadata','{}'::jsonb);
  return jsonb_build_object('claims',c);
end $$;
revoke all on function public.ai_connection_access_token_hook(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ai_connection_access_token_hook(jsonb) to supabase_auth_admin;

create function public.ai_connection_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.ai_connections; v_role text;
begin
  select * into g from public.ai_connections where id=auth.uid() and client_id::text=auth.jwt()->>'client_id' and revoked_at is null;
  if auth.role()<>'anon' or g.id is null or not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=g.user_id and oauth_client_id=g.client_id and created_at>=g.created_at and (not_after is null or not_after>now()))
    or not exists(select 1 from auth.users where id=g.user_id and deleted_at is null and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<now()))
    or not public.workspace_access_is_valid(g.workspace_id)
    or not exists(select 1 from public.workspaces where id=g.workspace_id and archived_at is null) then
    raise exception 'Die KI-Freigabe ist nicht mehr gültig.' using errcode='42501';
  end if;
  select role::text into v_role from public.workspace_members where workspace_id=g.workspace_id and user_id=g.user_id;
  if v_role is null then raise insufficient_privilege; end if;
  return jsonb_build_object('id',g.id,'user_id',g.user_id,'session_id',auth.jwt()->>'session_id','workspace_id',g.workspace_id,
    'workspace_name',(select name from public.workspaces where id=g.workspace_id),'role',v_role,
    'access_mode',case when v_role in ('owner','admin','member','accountant') then g.access_mode else 'read' end,
    'connection_ids',case when v_role in ('owner','admin') then coalesce((select jsonb_agg(connection_id) from public.ai_connection_accounts where ai_connection_id=g.id),'[]'::jsonb) else '[]'::jsonb end,
    'accounts',case when v_role in ('owner','admin') then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'status',c.status,'execution_mode',c.execution_mode))
      from public.ai_connection_accounts a join public.marketplace_connections c on c.id=a.connection_id where a.ai_connection_id=g.id and c.workspace_id=g.workspace_id and c.marketplace='vinted'),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.ai_connection_context() from public,authenticated,service_role;
grant execute on function public.ai_connection_context() to anon;

-- Nur ein tatsächlich beantworteter MCP-Aufruf markiert die Einrichtung als verbunden.
create function public.ai_connection_connected()
returns void language plpgsql security definer set search_path='' as $$
declare ctx jsonb:=public.ai_connection_context();
begin
  update public.ai_connections set connected_at=coalesce(connected_at,clock_timestamp())
    where id=(ctx->>'id')::uuid and revoked_at is null and connected_at is null;
end $$;
revoke all on function public.ai_connection_connected() from public,authenticated,service_role;
grant execute on function public.ai_connection_connected() to anon;

-- Der Token-Gateway bindet den nativen Code vor UND nach der Ausgabe an dieselbe Freigabe.
create function public.ai_connection_token_grant(p_client_id uuid,p_code text)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare a auth.oauth_authorizations; g public.ai_connections;
begin
  select * into a from auth.oauth_authorizations where client_id=p_client_id and authorization_code=p_code
    and status='approved' and expires_at>clock_timestamp();
  if a.id is null then raise insufficient_privilege; end if;
  select * into g from public.ai_connections where authorization_id=a.authorization_id;
  if not found then
    -- Native Wiederanmeldung mit bestehender Zustimmung: nur nach der aktuellen Freigabe angelegte Codes.
    select * into g from public.ai_connections where user_id=a.user_id and client_id=a.client_id
      and revoked_at is null and session_id is not null and a.created_at>=created_at;
  end if;
  if g.id is null or g.revoked_at is not null or g.user_id<>a.user_id or g.client_id<>a.client_id then raise insufficient_privilege; end if;
  return g.id;
end $$;
revoke all on function public.ai_connection_token_grant(uuid,text) from public,anon,authenticated;
grant execute on function public.ai_connection_token_grant(uuid,text) to service_role;

create function public.ai_connection_settings(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role()<>'authenticated' or auth.jwt() ? 'client_id' or not public.can_access_workspace(p_workspace_id) then raise insufficient_privilege; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'client_id',g.client_id,'client_name',coalesce(c.client_name,'KI-Client'),
    'access_mode',g.access_mode,'created_at',g.created_at,'revoked_at',g.revoked_at,'connected',g.connected_at is not null and exists(select 1 from auth.sessions s where s.user_id=g.user_id and s.oauth_client_id=g.client_id and s.created_at>=g.created_at and (s.not_after is null or s.not_after>now())),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.connection_id,'display_name',account.display_name))
      from public.ai_connection_accounts a join public.marketplace_connections account on account.id=a.connection_id where a.ai_connection_id=g.id),'[]'::jsonb)))
    from (select distinct on (client_id) * from public.ai_connections where user_id=auth.uid() and workspace_id=p_workspace_id order by client_id,created_at desc) g
    join auth.oauth_clients c on c.id=g.client_id),'[]'::jsonb);
end $$;
revoke all on function public.ai_connection_settings(uuid) from public,anon;
grant execute on function public.ai_connection_settings(uuid) to authenticated;

create function public.ai_sale_draft_valid(p_draft jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; key text;
begin
  if p_draft is null or jsonb_typeof(p_draft)<>'object' or p_draft->>'version' is distinct from '1'
    or jsonb_typeof(p_draft->'lines') is distinct from 'array' or jsonb_typeof(p_draft->'additionalCosts') is distinct from 'array'
    or jsonb_array_length(p_draft->'lines')>1000 or jsonb_array_length(p_draft->'additionalCosts')>100 then return false; end if;
  foreach key in array array['platform','saleDate','shippingMode','externalOrderId','buyerNotes'] loop
    if jsonb_typeof(p_draft->key) is distinct from 'string' or length(p_draft->>key)>20000 then return false; end if;
  end loop;
  if p_draft->>'shippingMode' not in ('unknown','seller_arranged','platform_prepaid','pickup')
    or (p_draft->>'saleDate'<>'' and p_draft->>'saleDate' !~ '^\d{4}-\d{2}-\d{2}$') then return false; end if;
  foreach key in array array['platformFee','shippingCost','shippingRevenue'] loop
    if p_draft->key='null'::jsonb and key<>'shippingRevenue' then continue; end if;
    if jsonb_typeof(p_draft->key) is distinct from 'number' or p_draft->>key !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or (p_draft->>key)::numeric>9999999999.99 then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_draft->'lines') loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'target') is distinct from 'string'
      or length(item->>'target')>600 or item->>'target' !~ '^(free:.+|inventory:[0-9a-f-]{36}|catalog:[0-9a-f-]{36})$'
      or jsonb_typeof(item->'quantity') is distinct from 'number' or item->>'quantity' !~ '^[1-9][0-9]{0,5}$'
      or jsonb_typeof(item->'unitSalePrice') is distinct from 'number' or item->>'unitSalePrice' !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or (item->>'unitSalePrice')::numeric>9999999999.99
      or not (item ? 'purchaseId') or (item->'purchaseId'<>'null'::jsonb and item->>'purchaseId' !~ '^[0-9a-f-]{36}$') then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_draft->'additionalCosts') loop
    if jsonb_typeof(item)<>'object' or coalesce(item->>'category','') not in ('packaging','payment_fee','promotion','other')
      or jsonb_typeof(item->'description') is distinct from 'string' or length(item->>'description')>500
      or jsonb_typeof(item->'amount') is distinct from 'number' or item->>'amount' !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or (item->>'amount')::numeric>9999999999.99 then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.ai_sale_draft_valid(jsonb) from public,anon,authenticated,service_role;

create function public.ai_connection_call(p_action text, p_input jsonb default '{}', p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  ctx jsonb:=public.ai_connection_context(); original_claims text:=current_setting('request.jwt.claims',true);
  ws uuid:=(ctx->>'workspace_id')::uuid; actor uuid:=(ctx->>'user_id')::uuid;
  result jsonb; prior public.ai_connection_requests; entity text; row_data jsonb; source_id uuid;
  account_id uuid; queued_action_id uuid; draft public.marketplace_listing_drafts; saved public.sale_drafts;
  write_action boolean:=p_action not in ('read_records','read_vinted_draft','list_vinted_drafts','read_vinted_job','read_vinted_entries','export_audit_snapshot','read_action_result','read_file');
  invoice_data jsonb; invoice_items jsonb; subtotal numeric; shipping numeric; item public.inventory_items;
  bank public.bank_transactions; target_amount numeric; target_title text; target_type text; order_id uuid; tax_mode text;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>262144 then
    raise exception 'Ungültige Werkzeugdaten.' using errcode='22023';
  end if;
  if write_action and (ctx->>'access_mode'<>'edit' or ctx->>'role' not in ('owner','admin','member','accountant')) then
    raise exception 'Diese Verbindung darf nur lesen.' using errcode='42501';
  end if;
  if p_action like '%vinted%' and ctx->>'role' not in ('owner','admin') then raise insufficient_privilege; end if;
  if write_action then
    if p_request_id is null then raise exception 'Eine Vorgangskennung ist erforderlich.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
    select * into prior from public.ai_connection_requests where id=p_request_id;
    if found then
      if prior.ai_connection_id<>(ctx->>'id')::uuid or prior.action<>p_action or prior.input<>p_input then
        raise exception 'Die Vorgangskennung gehört zu anderen Daten.' using errcode='22023';
      end if;
      return public.ai_connection_call('read_action_result',jsonb_build_object('action_id',p_request_id),null);
    end if;
  end if;
  -- Nur innerhalb dieser geprüften Transaktion erhält die bestehende Fachlogik den echten Akteur.
  perform set_config('request.jwt.claims',(auth.jwt()||jsonb_build_object('sub',actor,'role','authenticated'))::text,true);
  if not public.can_access_workspace(ws) then raise insufficient_privilege; end if;
  if p_action='read_action_result' then
    select * into prior from public.ai_connection_requests r where r.id=(p_input->>'action_id')::uuid and r.ai_connection_id=(ctx->>'id')::uuid;
    if not found then raise no_data_found; end if;
    if prior.action like '%vinted%' and not public.marketplace_can_manage(ws) then raise insufficient_privilege; end if;
    if prior.action like '%vinted%' and exists(select 1 from public.ai_connections
      where id=(ctx->>'id')::uuid and accounts_changed_at>prior.created_at) then
      raise exception 'Die Kontofreigabe wurde geändert. Lies den aktuellen Entwurf oder Auftragsstand erneut; führe die Aktion nicht mit einer neuen Vorgangskennung aus.' using errcode='42501';
    end if;
    if prior.action='set_vinted_price' then
      select jsonb_build_object('action',public.marketplace_account_action_public(a)) into result from public.marketplace_account_actions a
        join public.ai_connection_accounts c on c.connection_id=a.connection_id and c.ai_connection_id=a.ai_connection_id
        where a.ai_connection_id=(ctx->>'id')::uuid and a.workspace_id=ws and a.public_id=(prior.result#>>'{action,id}')::uuid;
      if result is null then raise no_data_found; end if;
    else result:=prior.result; end if;
  elsif p_action='read_records' then
    entity:=p_input->>'entity';
    if entity not in ('inventory_items','catalog_products','purchases','purchase_lines','sale_drafts','sales','sale_lines','invoices','store_orders','expenses','expense_categories','sources','suppliers','bank_transactions','purchase_documents','expense_documents') then
      raise exception 'Dieser Datenbereich wird nicht angeboten.' using errcode='22023';
    end if;
    if entity in ('purchase_documents','expense_documents') then
      execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select d.* from public.%I d join public.%I p on p.id=d.%I where p.workspace_id=$1 and ($2 is null or d.id::text=$2) order by d.id limit 50 offset $3) r',
        entity,case when entity='purchase_documents' then 'purchases' else 'expenses' end,case when entity='purchase_documents' then 'purchase_id' else 'expense_id' end)
        into result using ws,nullif(p_input->>'id',''),greatest(0,least(coalesce((p_input->>'offset')::integer,0),10000));
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select * from public.%I where workspace_id=$1 and ($2 is null or id::text=$2) and ($3 is null or to_jsonb(%I)::text ilike ''%%''||$3||''%%'') order by id limit 50 offset $4) r',entity,entity)
        into result using ws,nullif(p_input->>'id',''),nullif(left(p_input->>'query',200),''),greatest(0,least(coalesce((p_input->>'offset')::integer,0),10000));
    end if;
    result:=jsonb_build_object('records',result,'limit',50,'offset',coalesce((p_input->>'offset')::integer,0));
  elsif p_action='read_file' then
    if p_input->>'kind'='purchase_document' then
      select jsonb_build_object('bucket','purchase-documents','path',storage_path,'fileName',original_file_name,'mimeType',mime_type) into result
        from public.purchase_documents where workspace_id=ws and id=(p_input->>'id')::uuid;
    elsif p_input->>'kind'='expense_document' then
      select jsonb_build_object('bucket','expense-documents','path',storage_path,'fileName',original_file_name,'mimeType',mime_type) into result
        from public.expense_documents where workspace_id=ws and id=(p_input->>'id')::uuid;
    elsif p_input->>'kind'='vinted_image' and public.marketplace_can_manage(ws) then
      select jsonb_build_object('bucket','marketplace-listing-media','path',i.storage_path,'fileName',i.file_name,'mimeType',i.mime_type) into result
        from public.marketplace_listing_images i join public.marketplace_listing_drafts d on d.id=i.draft_id
        where i.workspace_id=ws and i.id=(p_input->>'id')::bigint and i.state='ready'
        and (d.connection_id is null or exists(select 1 from public.ai_connection_accounts where ai_connection_id=(ctx->>'id')::uuid and connection_id=d.connection_id));
    end if;
    if result is null or not exists(select 1 from storage.objects where bucket_id=result->>'bucket' and name=result->>'path') then raise no_data_found; end if;
  elsif p_action in ('finalize_purchase','receive_purchase_lines') then
    if ctx->>'role'='accountant' then raise insufficient_privilege; end if;
    perform public.lock_workspace_shop(ws);
    perform 1 from public.purchases where id=(p_input->>'purchase_id')::uuid and workspace_id=ws and updated_at=(p_input->>'expected_updated_at')::timestamptz for update;
    if not found then raise exception 'Der Einkauf wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
    if p_action='finalize_purchase' then result:=public.finalize_purchase_costing(ws,(p_input->>'purchase_id')::uuid);
    else result:=public.receive_purchase_lines(ws,(p_input->>'purchase_id')::uuid,p_input->'lines'); end if;
  elsif p_action in ('create_purchase','update_purchase_draft') then
    if ctx->>'role'='accountant' then raise insufficient_privilege; end if;
    if p_action='create_purchase' then
      result:=public.create_purchase(ws,(p_input->'purchase')||jsonb_build_object('request_id',p_request_id),coalesce(p_input->'expenses','[]'),coalesce(p_input->'lines','[]'));
    else
      perform public.lock_workspace_shop(ws);
      perform 1 from public.purchases where id=(p_input->>'purchase_id')::uuid and workspace_id=ws and updated_at=(p_input->>'expected_updated_at')::timestamptz for update;
      if not found then raise exception 'Der Einkaufsentwurf wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
      result:=public.update_purchase_draft(ws,(p_input->>'purchase_id')::uuid,(p_input->'purchase'),coalesce(p_input->'expenses','[]'),coalesce(p_input->'lines','[]'));
    end if;
  elsif p_action='record_sale' then
    if ctx->>'role'='accountant' then raise insufficient_privilege; end if;
    result:=public.record_sale(ws,(p_input->'sale')||jsonb_build_object('booking_key',p_request_id),p_input->'lines');
  elsif p_action='save_sale_draft' then
    if ctx->>'role'='accountant' or not public.ai_sale_draft_valid(p_input->'draft') then
      raise exception 'Der Verkaufsentwurf ist ungültig.' using errcode='22023';
    end if;
    source_id:=coalesce(nullif(p_input->>'id','')::uuid,p_request_id);
    if exists(select 1 from jsonb_array_elements(p_input->'draft'->'lines') l where
      (l->>'target' like 'inventory:%' and not exists(select 1 from public.inventory_items where workspace_id=ws and id=substring(l->>'target' from 11)::uuid))
      or (l->>'target' like 'catalog:%' and not exists(select 1 from public.catalog_products where workspace_id=ws and id=substring(l->>'target' from 9)::uuid))
      or (l->'purchaseId'<>'null'::jsonb and not exists(select 1 from public.purchases where workspace_id=ws and id=(l->>'purchaseId')::uuid))) then raise insufficient_privilege; end if;
    select * into saved from public.sale_drafts where id=source_id and workspace_id=ws for update;
    if not found and p_input ? 'id' then raise no_data_found; end if;
    if found and saved.updated_at is distinct from (p_input->>'expected_updated_at')::timestamptz then
      raise exception 'Der Verkaufsentwurf wurde zwischenzeitlich geändert.' using errcode='40001';
    end if;
    select coalesce(sum((value->>'quantity')::integer*(value->>'unitSalePrice')::numeric),0) into subtotal from jsonb_array_elements(p_input->'draft'->'lines');
    insert into public.sale_drafts(id,workspace_id,created_by,title,sale_amount,draft)
      values(source_id,ws,actor,coalesce(p_input->>'title',''),subtotal,p_input->'draft')
      on conflict(id) do update set title=excluded.title,sale_amount=excluded.sale_amount,draft=excluded.draft
        where sale_drafts.workspace_id=ws returning to_jsonb(sale_drafts) into result;
    if result is null then raise insufficient_privilege; end if;
  elsif p_action='update_inventory_item' then
    if ctx->>'role'='accountant' or jsonb_typeof(p_input->'changes') is distinct from 'object'
      or (p_input->'changes')-array['title','description','model','condition','sku','ean','expected_value','category_id','brand_id']<>'{}'::jsonb then raise insufficient_privilege; end if;
    select * into item from public.inventory_items where workspace_id=ws and id=(p_input->>'id')::uuid and archived_at is null for update;
    if not found then raise no_data_found; end if;
    if item.updated_at is distinct from (p_input->>'expected_updated_at')::timestamptz then raise exception 'Der Artikel wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
    if p_input->'changes' ? 'expected_value' and p_input->'changes'->'expected_value'<>'null'::jsonb
      and (p_input->'changes'->>'expected_value' !~ '^[0-9]+(\.[0-9]{1,2})?$' or (p_input->'changes'->>'expected_value')::numeric>9999999999.99) then raise exception 'Ungültiger Betrag.' using errcode='22023'; end if;
    item:=jsonb_populate_record(item,p_input->'changes');
    if nullif(btrim(item.title),'') is null then raise exception 'Der Artikeltitel fehlt.' using errcode='22023'; end if;
    update public.inventory_items set title=item.title,description=item.description,model=item.model,condition=item.condition,
      sku=item.sku,ean=item.ean,expected_value=item.expected_value,category_id=item.category_id,brand_id=item.brand_id,updated_at=clock_timestamp()
      where id=item.id and workspace_id=ws returning to_jsonb(inventory_items) into result;
  elsif p_action='create_expense' then
    row_data:=p_input->'expense';
    if jsonb_typeof(row_data) is distinct from 'object' then raise exception 'Ungültige Ausgabe.' using errcode='22023'; end if;
    insert into public.expenses(workspace_id,created_by,category_id,title,vendor_name,quantity,gross_amount,vat_rate,expense_date,due_date,status,payment_date,notes)
      values(ws,actor,(row_data->>'category_id')::uuid,row_data->>'title',row_data->>'vendor_name',coalesce((row_data->>'quantity')::integer,1),
        (row_data->>'gross_amount')::numeric,(row_data->>'vat_rate')::numeric,(row_data->>'expense_date')::date,(row_data->>'due_date')::date,
        coalesce(row_data->>'status','open'),(row_data->>'payment_date')::date,row_data->>'notes') returning to_jsonb(expenses) into result;
  elsif p_action='export_audit_snapshot' then
    result:=public.export_audit_snapshot(ws,coalesce(p_input->'filter','{}'));
  elsif p_action in ('assign_bank_transaction','book_bank_transaction') then
    if ctx->>'role' not in ('owner','admin','accountant') then raise insufficient_privilege; end if;
    select * into bank from public.bank_transactions where workspace_id=ws and id=(p_input->>'transaction_id')::uuid for update;
    if not found then raise no_data_found; end if;
    if bank.currency<>'EUR' or bank.currency is distinct from p_input->>'expected_currency'
      or bank.amount is distinct from (p_input->>'expected_amount')::numeric or bank.status is distinct from p_input->>'expected_status'
      or bank.match_json is distinct from nullif(p_input->'expected_match','null'::jsonb) then
      raise exception 'Die Bankbewegung wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
    if p_action='assign_bank_transaction' then
      if bank.status not in ('pending','matched') then raise invalid_parameter_value; end if;
      target_type:=p_input->>'target_type'; source_id:=(p_input->>'target_id')::uuid;
      if target_type='sale' and bank.amount>0 then
        select sale_price,coalesce(record_number,'Verkauf') into target_amount,target_title from public.sales where workspace_id=ws and id=source_id and voided_at is null and returned_at is null for update;
      elsif target_type='store_order' and bank.amount>0 then
        select total,order_number into target_amount,target_title from public.store_orders where workspace_id=ws and id=source_id and payment_status='pending' for update;
      elsif target_type='purchase' and bank.amount<0 then
        select purchase_price,title into target_amount,target_title from public.purchases where workspace_id=ws and id=source_id and entry_status<>'draft' for update;
      elsif target_type='operating_expense' and bank.amount<0 then
        select gross_amount,title into target_amount,target_title from public.expenses where workspace_id=ws and id=source_id and deleted_at is null for update;
      end if;
      if target_amount is null or target_amount<=0 or target_amount is distinct from (p_input->>'expected_target_amount')::numeric then raise exception 'Das Zuordnungsziel wurde geändert oder ist nicht verfügbar.' using errcode='40001'; end if;
      update public.bank_transactions set status='matched',match_json=jsonb_build_object('targetType',target_type,'targetId',source_id,'targetReference',target_title,
        'targetName',target_title,'targetAmount',target_amount,'confidence',100,'confidenceLabel','manual') where id=bank.id returning to_jsonb(bank_transactions) into result;
    else
      if bank.status<>'matched' or coalesce(bank.match_json->>'targetType','unknown') not in ('sale','store_order','purchase','operating_expense') then raise invalid_parameter_value; end if;
      order_id:=case when bank.match_json->>'targetType'='store_order' then (bank.match_json->>'targetId')::uuid else null end;
      result:=to_jsonb(public.book_bank_transaction(ws,bank.id,clock_timestamp(),order_id));
    end if;
  elsif p_action='create_invoice' then
    source_id:=nullif(p_input->>'sale_id','')::uuid; order_id:=nullif(p_input->>'store_order_id','')::uuid;
    if (source_id is null)=(order_id is null) then raise invalid_parameter_value; end if;
    if source_id is not null then select to_jsonb(s) into row_data from public.sales s where id=source_id and workspace_id=ws;
    else select to_jsonb(o) into row_data from public.store_orders o where id=order_id and workspace_id=ws; end if;
    if row_data is null then raise no_data_found; end if;
    select jsonb_build_object('invoice',to_jsonb(i),'created',false) into result from public.invoices i where workspace_id=ws and (sale_id=source_id or store_order_id=order_id);
    if result is null then
      invoice_data:=p_input->'invoice';
      if jsonb_typeof(invoice_data->'buyer') is distinct from 'object'
        or nullif(btrim(invoice_data->'buyer'->>'name'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'street'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'postalCode'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'country'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'city'),'') is null then
        raise exception 'Name und vollständige Rechnungsadresse fehlen.' using errcode='22023';
      end if;
      if source_id is not null then
        select jsonb_agg(jsonb_build_object('title',title_snapshot,'quantity',quantity,'unit_price',unit_sale_price,'total_price',line_total) order by created_at,id),
          sum(line_total) into invoice_items,subtotal from public.sale_lines where sale_id=source_id and workspace_id=ws;
        select l.tax_mode into tax_mode from public.sale_lines l where l.sale_id=source_id and l.workspace_id=ws order by l.created_at,l.id limit 1;
        shipping:=coalesce((row_data->>'shipping_revenue')::numeric,0);
        if subtotal+shipping is distinct from coalesce((row_data->>'sale_price_total')::numeric,(row_data->>'sale_price')::numeric) then raise exception 'Die Rechnungspositionen passen nicht zum gebuchten Verkauf.' using errcode='22023'; end if;
      else
        select jsonb_agg(jsonb_build_object('title',item_title,'quantity',quantity,'unit_price',price,'total_price',round(quantity*price,2)) order by id),sum(round(quantity*price,2))
          into invoice_items,subtotal from public.store_order_items where store_order_id=order_id;
        shipping:=coalesce((row_data->>'shipping_cost')::numeric,0);
        if subtotal is distinct from (row_data->>'subtotal')::numeric or subtotal+shipping is distinct from (row_data->>'total')::numeric then raise invalid_parameter_value; end if;
        select w.tax_mode into tax_mode from public.workspaces w where id=ws;
      end if;
      if invoice_items is null or tax_mode is null then raise exception 'Die gebuchten Rechnungspositionen fehlen.' using errcode='22023'; end if;
      invoice_data:=invoice_data||jsonb_build_object('subtotal',subtotal,'shipping_cost',shipping,'total',subtotal+shipping,'tax_mode',tax_mode,'tax_clause',
        case tax_mode when 'regular_19' then 'Der Gesamtbetrag enthält die gesetzliche Umsatzsteuer in Höhe von 19%.'
          when 'kleinunternehmer_19' then 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).'
          else 'Sonderregelung für Gebrauchtgegenstände nach § 25a UStG (Differenzbesteuerung). Ein gesonderter Ausweis der Umsatzsteuer erfolgt nicht.' end);
      result:=public.create_or_get_invoice(ws,source_id,order_id,invoice_data,invoice_items);
    end if;
  elsif p_action like '%vinted%' then
    if not public.marketplace_can_manage(ws) then raise insufficient_privilege; end if;
    account_id:=nullif(p_input->>'connection_id','')::uuid;
    if p_action in ('read_vinted_draft','save_vinted_draft','enqueue_vinted_listing','prepare_vinted_image_upload','import_vinted_original_photos') then
      select * into draft from public.marketplace_listing_drafts where id=(p_input->>'draft_id')::bigint and workspace_id=ws;
      if not found then raise no_data_found; end if;
      account_id:=draft.connection_id;
    end if;
    if account_id is not null and not exists(select 1 from public.ai_connection_accounts a join public.marketplace_connections c on c.id=a.connection_id
      where a.ai_connection_id=(ctx->>'id')::uuid and a.connection_id=account_id and c.workspace_id=ws and c.marketplace='vinted') then raise insufficient_privilege; end if;
    if p_action='set_vinted_price' then
      if account_id is null or not public.marketplace_can_manage_cloud(ws)
        or not exists(select 1 from public.marketplace_connections where id=account_id and workspace_id=ws and marketplace='vinted' and execution_mode='cloud' and status='connected')
        or not exists(select 1 from public.marketplace_account_entries where workspace_id=ws and connection_id=account_id and id=(p_input->>'entry_id')::uuid and kind='publication')
        or jsonb_typeof(p_input->'expected_price_cents') is distinct from 'number' or jsonb_typeof(p_input->'price_cents') is distinct from 'number'
        or p_input->>'expected_price_cents' !~ '^[1-9][0-9]{0,7}$' or p_input->>'price_cents' !~ '^[1-9][0-9]{0,7}$' then raise insufficient_privilege; end if;
      perform pg_advisory_xact_lock(91731,1);
      if exists(select 1 from public.marketplace_account_actions a where a.workspace_id=ws and a.connection_id=account_id and a.request_id=p_request_id
        and a.ai_connection_id is distinct from (ctx->>'id')::uuid) then raise unique_violation; end if;
      result:=public.marketplace_account_action_enqueue(ws,account_id,p_request_id,'price_save',
        jsonb_build_object('entryId',p_input->'entry_id','expectedPriceCents',p_input->'expected_price_cents','priceCents',p_input->'price_cents'));
      queued_action_id:=(result#>>'{action,id}')::uuid;
      update public.marketplace_account_actions set ai_connection_id=(ctx->>'id')::uuid where public_id=queued_action_id and requested_by=actor;
    elsif p_action='read_vinted_entries' then
      if account_id is null or coalesce(p_input->>'kind','') not in ('profile','publication','conversation','message','sale','activity') then raise insufficient_privilege; end if;
      select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into result from (select e.* from public.marketplace_account_entries e
        where e.workspace_id=ws and e.connection_id=account_id and e.kind=p_input->>'kind'
          and (nullif(p_input->>'id','') is null or e.id::text=p_input->>'id') order by e.sort_at desc,e.id limit 50 offset greatest(0,least(coalesce((p_input->>'offset')::integer,0),10000))) e;
    elsif p_action='import_vinted_original_photos' then
      if draft.relist_external_id is null or draft.connection_id is null then raise invalid_parameter_value; end if;
      if draft.revision is distinct from (p_input->>'expected_revision')::bigint then raise serialization_failure; end if;
      result:=jsonb_build_object('status','accepted','requestId',p_request_id);
    elsif p_action='prepare_vinted_image_upload' then
      result:=public.marketplace_reserve_listing_image(draft.id::text,p_input->>'file_name',p_input->>'mime_type',(p_input->>'byte_size')::bigint);
    elsif p_action='list_vinted_drafts' then
      select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into result from (select d.* from public.marketplace_listing_drafts d where d.workspace_id=ws
        and (d.connection_id is null or exists(select 1 from public.ai_connection_accounts where ai_connection_id=(ctx->>'id')::uuid and connection_id=d.connection_id)) order by d.updated_at desc,d.id limit 50) d;
    elsif p_action='read_vinted_draft' then result:=public.marketplace_read_listing_draft(draft.id::text);
    elsif p_action='create_vinted_draft' then result:=public.marketplace_create_listing_draft(ws,account_id,p_input->'content',nullif(p_input->>'inventory_item_id','')::uuid,p_request_id);
    elsif p_action='create_vinted_relist' then
      if account_id is null then raise insufficient_privilege; end if;
      result:=public.marketplace_create_relisting_draft(ws,account_id,p_input->'content',p_request_id,p_input->>'external_id');
    elsif p_action='save_vinted_draft' then result:=public.marketplace_save_listing_draft(draft.id::text,(p_input->>'expected_revision')::bigint,p_input->'content',account_id);
    elsif p_action='enqueue_vinted_listing' then
      if account_id is null then raise insufficient_privilege; end if;
      perform pg_advisory_xact_lock(91731,1);
      if exists(select 1 from public.marketplace_listing_jobs j where j.workspace_id=ws and j.requested_by=actor and j.request_id=p_request_id
        and j.ai_connection_id is distinct from (ctx->>'id')::uuid) then raise unique_violation; end if;
      result:=public.marketplace_enqueue_listing(draft.id::text,(p_input->>'expected_revision')::bigint,p_input->>'action',p_request_id,false,
        nullif(p_input->>'scheduled_at','')::timestamptz,p_input->>'time_zone','pause_after_30_minutes');
      update public.marketplace_listing_jobs set ai_connection_id=(ctx->>'id')::uuid where id=(result->>'id')::bigint and requested_by=actor;
    elsif p_action='read_vinted_job' then
      select to_jsonb(j)-array['snapshot','claim_token','claim_local_token_hash','provider_result'] into result from public.marketplace_listing_jobs j
        join public.ai_connection_accounts a on a.connection_id=j.connection_id where j.workspace_id=ws and j.id=(p_input->>'job_id')::bigint and a.ai_connection_id=(ctx->>'id')::uuid;
      if result is null then raise no_data_found; end if;
    else raise exception 'Unbekanntes Werkzeug.' using errcode='22023'; end if;
  else raise exception 'Unbekanntes Werkzeug.' using errcode='22023'; end if;
  perform set_config('request.jwt.claims',original_claims,true);
  if write_action then insert into public.ai_connection_requests(id,ai_connection_id,action,input,result) values(p_request_id,(ctx->>'id')::uuid,p_action,p_input,result); end if;
  return result;
exception when others then
  perform set_config('request.jwt.claims',original_claims,true);
  raise;
end $$;
revoke all on function public.ai_connection_call(text,jsonb,uuid) from public,authenticated,service_role;
grant execute on function public.ai_connection_call(text,jsonb,uuid) to anon;

create function public.ai_connection_image_upload(p_grant_id uuid,p_auth_session_id uuid,p_image_id text,p_operation text,p_expected_revision bigint default null,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original_claims text:=current_setting('request.jwt.claims',true); g public.ai_connections; ctx jsonb; img public.marketplace_listing_images;
  draft public.marketplace_listing_drafts; result jsonb; prior public.ai_connection_requests; input jsonb;
begin
  if auth.role()<>'service_role' then raise insufficient_privilege; end if;
  select * into g from public.ai_connections where id=p_grant_id;
  if g.id is null then raise insufficient_privilege; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g.id,'role','anon','client_id',g.client_id,'session_id',p_auth_session_id)::text,true);
  ctx:=public.ai_connection_context();
  if g.access_mode<>'edit' then raise insufficient_privilege; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g.user_id,'role','authenticated')::text,true);
  if not public.marketplace_can_manage(g.workspace_id) then raise insufficient_privilege; end if;
  select * into img from public.marketplace_listing_images where id=p_image_id::bigint and workspace_id=g.workspace_id and created_by=g.user_id;
  select * into draft from public.marketplace_listing_drafts where id=img.draft_id and deleted_at is null;
  if img.id is null or draft.id is null or not exists(select 1 from public.ai_connection_requests r where r.ai_connection_id=g.id and r.action='prepare_vinted_image_upload' and r.result->>'id'=p_image_id)
    or (draft.connection_id is not null and not exists(select 1 from public.ai_connection_accounts where ai_connection_id=g.id and connection_id=draft.connection_id)) then raise insufficient_privilege; end if;
  if p_operation='describe' then
    result:=jsonb_build_object('bucket','marketplace-listing-media','path',img.storage_path,'mimeType',img.mime_type,'byteSize',img.byte_size);
    if p_request_id is not null then
      select * into prior from public.ai_connection_requests where id=p_request_id;
      if found then
        if prior.ai_connection_id<>g.id or prior.action<>'commit_vinted_image' or prior.input<>jsonb_build_object('image_id',p_image_id,'expected_revision',p_expected_revision) then raise invalid_parameter_value; end if;
        result:=result||jsonb_build_object('completed',prior.result);
      end if;
    end if;
  elsif p_operation='commit' then
    if p_request_id is null or p_expected_revision is null then raise invalid_parameter_value; end if;
    input:=jsonb_build_object('image_id',p_image_id,'expected_revision',p_expected_revision);
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
    select * into prior from public.ai_connection_requests where id=p_request_id;
    if found then
      if prior.ai_connection_id<>g.id or prior.action<>'commit_vinted_image' or prior.input<>input then raise invalid_parameter_value; end if;
      result:=prior.result;
    else
      result:=public.marketplace_commit_listing_image(draft.id::text,p_expected_revision,p_image_id,null);
      insert into public.ai_connection_requests(id,ai_connection_id,action,input,result) values(p_request_id,g.id,'commit_vinted_image',input,result);
    end if;
  else raise invalid_parameter_value; end if;
  perform set_config('request.jwt.claims',original_claims,true);
  return result;
exception when others then perform set_config('request.jwt.claims',original_claims,true); raise;
end $$;
revoke all on function public.ai_connection_image_upload(uuid,uuid,text,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.ai_connection_image_upload(uuid,uuid,text,text,bigint,uuid) to service_role;

create function public.ai_connection_original_photos(p_grant_id uuid,p_auth_session_id uuid,p_request_id uuid,p_operation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original_claims text:=current_setting('request.jwt.claims',true); g public.ai_connections; ctx jsonb;
  r public.ai_connection_requests; draft public.marketplace_listing_drafts; result jsonb; sources jsonb;
begin
  if auth.role()<>'service_role' then raise insufficient_privilege; end if;
  select * into g from public.ai_connections where id=p_grant_id;
  if g.id is null then raise insufficient_privilege; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g.id,'role','anon','client_id',g.client_id,'session_id',p_auth_session_id)::text,true);
  ctx:=public.ai_connection_context();
  if g.access_mode<>'edit' then raise insufficient_privilege; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g.user_id,'role','authenticated')::text,true);
  if not public.marketplace_can_manage(g.workspace_id) then raise insufficient_privilege; end if;
  select * into r from public.ai_connection_requests where id=p_request_id and ai_connection_id=g.id and action='import_vinted_original_photos';
  select * into draft from public.marketplace_listing_drafts where id=(r.input->>'draft_id')::bigint and workspace_id=g.workspace_id and deleted_at is null;
  if draft.id is null or draft.relist_external_id is null or not exists(select 1 from public.ai_connection_accounts where ai_connection_id=g.id and connection_id=draft.connection_id) then raise insufficient_privilege; end if;
  if p_operation='describe' then
    sources:=public.marketplace_read_listing_photo_sources(g.workspace_id,draft.connection_id,array[draft.relist_external_id]);
    if jsonb_array_length(sources->'items')<>1 or jsonb_array_length(sources->'items'->0->'draft'->'images') not between 1 and 20 then
      raise exception 'Für dieses Inserat sind keine gespeicherten Originalfotos verfügbar.' using errcode='22023'; end if;
    result:=jsonb_build_object('draftId',draft.id::text,'expectedRevision',r.input->'expected_revision','images',sources->'items'->0->'draft'->'images');
  elsif p_operation='finish' then
    result:=jsonb_build_object('status','completed','requestId',r.id,'draft',public.marketplace_listing_draft_document(draft));
    update public.ai_connection_requests set result=ai_connection_original_photos.result where id=r.id;
  elsif p_operation='fail' then
    result:=jsonb_build_object('status','incomplete','requestId',r.id,'error','Der Originalfoto-Transfer ist unvollständig. Bitte den Entwurf neu lesen oder im Vinted-Editor öffnen.');
    update public.ai_connection_requests as requests set result=ai_connection_original_photos.result where requests.id=r.id and requests.result->>'status'<>'completed';
  else raise invalid_parameter_value; end if;
  perform set_config('request.jwt.claims',original_claims,true);
  return result;
exception when others then perform set_config('request.jwt.claims',original_claims,true); raise;
end $$;
revoke all on function public.ai_connection_original_photos(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_connection_original_photos(uuid,uuid,uuid,text) to service_role;

create function public.ai_connection_execution_valid(p_grant_id uuid,p_requested_by uuid,p_workspace_id uuid,p_connection_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_grant_id is null or exists(
    select 1 from public.ai_connections g join public.ai_connection_accounts a on a.ai_connection_id=g.id
    join auth.users u on u.id=g.user_id join public.workspace_members m on m.workspace_id=g.workspace_id and m.user_id=g.user_id
    where g.id=p_grant_id and g.user_id=p_requested_by and g.workspace_id=p_workspace_id and m.role in ('owner','admin')
      and g.access_mode='edit' and g.revoked_at is null and a.connection_id=p_connection_id
      and u.deleted_at is null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now())
      and exists(select 1 from auth.sessions s where s.user_id=g.user_id and s.oauth_client_id=g.client_id and s.created_at>=g.created_at and (s.not_after is null or s.not_after>now()))
  );
$$;
revoke all on function public.ai_connection_execution_valid(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_connection_execution_valid(uuid,uuid,uuid,uuid) to service_role;

create function public.ai_connection_listing_job_valid(p_job public.marketplace_listing_jobs)
returns boolean language sql stable security definer set search_path='' as $$
  select public.ai_connection_execution_valid(p_job.ai_connection_id,p_job.requested_by,p_job.workspace_id,p_job.connection_id);
$$;
revoke all on function public.ai_connection_listing_job_valid(public.marketplace_listing_jobs) from public,anon,authenticated;
grant execute on function public.ai_connection_listing_job_valid(public.marketplace_listing_jobs) to service_role;

-- Dieselbe Prüfung gilt beim Claim und erneut unmittelbar vor einer externen Aktion.
create or replace function public.marketplace_listing_job_valid(p_job public.marketplace_listing_jobs)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_image jsonb; v_inventory_id uuid;
begin
  if not public.ai_connection_listing_job_valid(p_job) then return false; end if;
  if p_job.connection_id is null or not public.marketplace_listing_permission_valid(p_job.permission_id,p_job.requested_by,p_job.authorization_version) then return false; end if;
  if jsonb_typeof(p_job.snapshot->'images')<>'array' or jsonb_array_length(p_job.snapshot->'images') not between 1 and 20 then return false; end if;
  for v_image in select value from jsonb_array_elements(p_job.snapshot->'images') loop
    if not exists(select 1 from public.marketplace_listing_images image join storage.objects object on object.bucket_id='marketplace-listing-media' and object.name=image.storage_path
      where image.id=(v_image->>'id')::bigint and image.workspace_id=p_job.workspace_id and image.draft_id=p_job.draft_id and image.state='ready'
        and image.storage_path=v_image->>'storagePath' and image.mime_type=v_image->>'mimeType' and image.byte_size=(v_image->>'byteSize')::bigint
        and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type) then return false; end if;
  end loop;
  v_inventory_id:=(p_job.snapshot->>'inventoryItemId')::uuid;
  if v_inventory_id is not null and not exists(select 1 from public.inventory_items item join public.inventory_item_sale_states sale on sale.inventory_item_id=item.id and sale.workspace_id=item.workspace_id
    where item.workspace_id=p_job.workspace_id and item.id=v_inventory_id and item.archived_at is null and item.status in ('ready','listed') and sale.sale_state='no_active_sale') then return false; end if;
  return true;
end $$;

create or replace function public.marketplace_account_action_authorized(p_action public.marketplace_account_actions)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_connection public.marketplace_connections;
begin
  if p_action.ai_connection_id is not null and (p_action.kind<>'price_save' or not public.ai_connection_execution_valid(
    p_action.ai_connection_id,p_action.requested_by,p_action.workspace_id,p_action.connection_id)) then return false; end if;
  if not public.marketplace_account_action_user_authorized(p_action.workspace_id,p_action.requested_by) then return false; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_action.workspace_id and id=p_action.connection_id and marketplace='vinted' for share;
  if not found then return false; end if;
  if p_action.kind='cloud_session_open' then
    return v_connection.execution_mode='cloud' and v_connection.status not in ('paused','blocked')
      and v_connection.browser_dialog_id=(p_action.payload->>'dialogId')::uuid and v_connection.browser_dialog_user_id=p_action.requested_by
      and v_connection.browser_presence_expires_at>clock_timestamp() and exists(select 1 from public.marketplace_browser_profiles
        where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id and provider_profile_id=p_action.provider_profile_id);
  end if;
  if p_action.kind='cloud_setup_open' then
    return exists(select 1 from public.marketplace_cloud_setups setup where setup.public_id=(p_action.payload->>'setupId')::uuid
      and setup.workspace_id=p_action.workspace_id and setup.connection_id=p_action.connection_id and setup.requested_by=p_action.requested_by
      and setup.state in ('login','verified') and setup.expires_at>clock_timestamp() and setup.provider_profile_id=p_action.provider_profile_id
      and setup.browser_dialog_id=(p_action.payload->>'dialogId')::uuid and setup.browser_presence_expires_at>clock_timestamp());
  end if;
  if v_connection.execution_mode<>'cloud' or v_connection.status not in ('connected','needs_login','paused') or v_connection.external_account_id is distinct from p_action.external_account_id
    or not public.marketplace_cloud_network_valid(p_action.workspace_id,p_action.connection_id)
    or not exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id and provider_profile_id=p_action.provider_profile_id) then return false; end if;
  if p_action.entry_id is not null and not exists(select 1 from public.marketplace_account_entries where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id
      and id=p_action.entry_id and kind=p_action.entry_kind and external_id=p_action.external_id) then return false; end if;
  -- Ein eigener wartender direkter Auftrag bleibt gültig; die gemeinsame Ressourcenauswahl ordnet Relist und Änderungen.
  return true;
end;
$$;
