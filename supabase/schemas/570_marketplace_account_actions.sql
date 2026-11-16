-- Dauerhafte direkte Cloudaufträge, gemeinsame Konto-/Poolvergabe und private Statushinweise.
create table public.marketplace_browser_pool_settings (
  id bigint generated always as identity primary key check (id=1),
  max_browsers integer not null default 2 check (max_browsers between 1 and 8),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
comment on table public.marketplace_browser_pool_settings is 'Betreibergrenze des gemeinsamen Cloud-Browserpools; die kleinere bestätigte Hostgrenze gilt.';
insert into public.marketplace_browser_pool_settings(id) overriding system value values(1);
create index marketplace_browser_pool_settings_user on public.marketplace_browser_pool_settings(updated_by);
alter table public.marketplace_browser_pool_settings enable row level security;
revoke all on public.marketplace_browser_pool_settings from public,anon,authenticated;
grant select on public.marketplace_browser_pool_settings to authenticated;
grant all on public.marketplace_browser_pool_settings to service_role;
revoke all on sequence public.marketplace_browser_pool_settings_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_browser_pool_settings_id_seq to service_role;
create policy "Betreiber lesen Browserkapazität" on public.marketplace_browser_pool_settings for select to authenticated using ((select public.is_platform_operator()));
create policy "Worker liest Browserkapazität" on public.marketplace_browser_pool_settings for select to service_role using (true);
create policy "Worker legt Browserkapazität an" on public.marketplace_browser_pool_settings for insert to service_role with check (true);
create policy "Worker ändert Browserkapazität" on public.marketplace_browser_pool_settings for update to service_role using (true) with check (true);
create policy "Worker löscht Browserkapazität" on public.marketplace_browser_pool_settings for delete to service_role using (true);

alter table public.marketplace_worker_runtime
  add column broker_capacity integer not null default 0 check(broker_capacity between 0 and 8),
  add column broker_capacity_verified_at timestamptz;
alter table public.marketplace_cloud_setups
  add column browser_dialog_id uuid,
  add column browser_presence_expires_at timestamptz;
alter table public.marketplace_connections
  add column browser_dialog_id uuid,
  add column browser_dialog_user_id uuid references auth.users(id) on delete set null,
  add column browser_presence_expires_at timestamptz;
create index marketplace_connections_browser_dialog_user on public.marketplace_connections(browser_dialog_user_id);

-- Ein gemeinsamer Annahmezähler erhält auch zwischen unterschiedlichen Auftragstabellen die Reihenfolge.
create sequence public.marketplace_browser_queue_order;
revoke all on sequence public.marketplace_browser_queue_order from public,anon,authenticated;
grant usage,select on sequence public.marketplace_browser_queue_order to service_role;
alter table public.marketplace_operations add column queue_order bigint not null default nextval('public.marketplace_browser_queue_order');
alter table public.marketplace_local_message_outbox add column queue_order bigint not null default nextval('public.marketplace_browser_queue_order');
alter table public.marketplace_negotiation_jobs add column queue_order bigint not null default nextval('public.marketplace_browser_queue_order');
alter table public.marketplace_listing_jobs add column queue_order bigint not null default nextval('public.marketplace_browser_queue_order');
alter table public.marketplace_favorite_message_events add column queue_order bigint not null default nextval('public.marketplace_browser_queue_order');
-- Bereits wartende Arbeit behält beim Wechsel ihre bisher belegbare zeitliche Reihenfolge.
do $$
declare v_job record;
begin
  for v_job in
    select * from (
      select 'marketplace_operations'::text as table_name,id::text as job_id,created_at as accepted_at from public.marketplace_operations where state in ('queued','running')
      union all select 'marketplace_local_message_outbox',id::text,created_at from public.marketplace_local_message_outbox where execution_mode='cloud' and state in ('queued','claimed','sending','outcome_unknown')
      union all select 'marketplace_negotiation_jobs',id::text,created_at from public.marketplace_negotiation_jobs where execution_mode='cloud' and state in ('queued','claimed','sending','outcome_unknown')
      union all select 'marketplace_listing_jobs',id::text,created_at from public.marketplace_listing_jobs where execution_mode='cloud' and state in ('queued','paused','claimed','writing','outcome_unknown')
      union all select 'marketplace_favorite_message_events',id::text,event_at from public.marketplace_favorite_message_events where execution_mode='cloud' and (state in ('queued','claimed','sending','outcome_unknown') or offer_state in ('pending','claimed','sending','outcome_unknown'))
    ) jobs order by accepted_at,table_name,job_id loop
    execute format('update public.%I set queue_order=nextval(''public.marketplace_browser_queue_order'') where id::text=$1',v_job.table_name) using v_job.job_id;
  end loop;
end;
$$;

create table public.marketplace_account_actions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  workspace_id uuid not null,
  connection_id uuid not null,
  requested_by uuid not null references auth.users(id),
  request_id uuid not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  kind text not null check(kind in ('profile_details_read','profile_details_save','profile_cities_read','profile_edit_read','profile_edit_save','listing_category_read','listing_content_read','listing_content_save','listing_edit_read','listing_edit_save','listing_edit_intent','listing_delete','price_save','conversations_read','shipping_label_request','outcome_reconcile','cloud_setup_open','cloud_session_open')),
  payload jsonb check(payload is null or (jsonb_typeof(payload)='object' and octet_length(payload::text)<=1048576)),
  external_account_id text,
  provider_profile_id text,
  entry_id uuid,
  entry_kind text check(entry_kind in ('profile','publication','conversation','sale')),
  external_id text,
  resource_key text,
  title text,
  is_write boolean not null,
  reconciliation_action_id uuid references public.marketplace_account_actions(public_id),
  state text not null default 'queued' check(state in ('queued','running','succeeded','failed','outcome_unknown','cancelled')),
  version bigint not null default 1 check(version between 1 and 9007199254740991),
  queue_order bigint not null default nextval('public.marketplace_browser_queue_order'),
  claim_token uuid,
  worker_id uuid,
  worker_epoch bigint,
  runner_id uuid,
  browser_session_id uuid references public.marketplace_browser_sessions(public_id),
  lease_expires_at timestamptz,
  absolute_expires_at timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 3),
  write_started_at timestamptz,
  result jsonb check(result is null or octet_length(result::text)<=4194304),
  error_code text check(error_code is null or error_code ~ '^[a-z_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  history_purged_at timestamptz,
  unique(workspace_id,connection_id,request_id),
  foreign key(workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade,
  check((history_purged_at is null and payload is not null) or (history_purged_at is not null and state in ('succeeded','failed','cancelled') and payload is null and result is null)),
  check(state<>'running' or (claim_token is not null and worker_id is not null and worker_epoch is not null and runner_id is not null and browser_session_id is not null))
);
comment on table public.marketplace_account_actions is 'Unveränderlich angenommene direkte Cloudaktionen; nach 30 Tagen bleibt nur die Anfragequittung, unklare Wirkungen bleiben erhalten.';
create index marketplace_account_actions_scope on public.marketplace_account_actions(workspace_id,connection_id,created_at desc);
create index marketplace_account_actions_due on public.marketplace_account_actions(queue_order) where state='queued';
create index marketplace_account_actions_requester on public.marketplace_account_actions(requested_by);
create index marketplace_account_actions_resource on public.marketplace_account_actions(workspace_id,connection_id,resource_key,queue_order) where is_write and state in ('queued','running','outcome_unknown');
create index marketplace_account_actions_reconciliation on public.marketplace_account_actions(reconciliation_action_id);
create index marketplace_account_actions_session on public.marketplace_account_actions(browser_session_id);
create index marketplace_account_actions_retention on public.marketplace_account_actions(finished_at) where history_purged_at is null and state in ('succeeded','failed','cancelled');
alter table public.marketplace_account_actions enable row level security;
revoke all on public.marketplace_account_actions from public,anon,authenticated;
grant all on public.marketplace_account_actions to service_role;
revoke all on sequence public.marketplace_account_actions_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_account_actions_id_seq to service_role;
create policy "Worker liest direkte Cloudaufträge" on public.marketplace_account_actions for select to service_role using (true);
create policy "Worker legt direkte Cloudaufträge an" on public.marketplace_account_actions for insert to service_role with check (true);
create policy "Worker ändert direkte Cloudaufträge" on public.marketplace_account_actions for update to service_role using (true) with check (true);
create policy "Worker löscht direkte Cloudaufträge" on public.marketplace_account_actions for delete to service_role using (true);
alter table public.marketplace_browser_sessions add column account_action_id uuid references public.marketplace_account_actions(public_id);
create index marketplace_browser_sessions_action on public.marketplace_browser_sessions(account_action_id);

create or replace function public.marketplace_set_browser_pool_size(p_max_browsers integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not public.is_platform_operator() then raise exception 'Nur Betreiber dürfen die Browserkapazität ändern' using errcode='42501'; end if;
  if p_max_browsers is null or p_max_browsers not between 1 and 8 then raise exception 'Ungültige Browserkapazität' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_browser_pool_settings set max_browsers=p_max_browsers,updated_at=clock_timestamp(),updated_by=(select auth.uid()) where id=1;
  return jsonb_build_object('maxBrowsers',p_max_browsers);
end;
$$;

create or replace function public.marketplace_browser_capacity_report(p_worker_id uuid,p_worker_epoch bigint,p_capacity integer)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
begin
  if p_capacity is null or p_capacity not between 0 and 8 then raise exception 'Ungültige Hostkapazität' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_worker_runtime set broker_capacity=p_capacity,broker_capacity_verified_at=clock_timestamp()
    where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp();
  return found;
end;
$$;

create or replace function public.marketplace_browser_effective_capacity()
returns integer language sql stable security invoker set search_path='' as $$
  select coalesce((select least(settings.max_browsers,runtime.broker_capacity)
    from public.marketplace_browser_pool_settings settings cross join public.marketplace_worker_runtime runtime
    where settings.id=1 and runtime.id=1 and runtime.expires_at>statement_timestamp()
      and runtime.broker_capacity_verified_at>statement_timestamp()-interval '45 seconds'),0);
$$;

create or replace function public.marketplace_browser_slot_status(p_workspace_id uuid,p_connection_id uuid)
returns text language sql stable security invoker set search_path='' as $$
  select case when exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping')) then 'account_busy'
    when (select count(*) from public.marketplace_browser_sessions where workspace_id=p_workspace_id and state in ('active','stopping'))>=2 then 'pool_busy'
    when (select count(*) from public.marketplace_browser_sessions where state in ('active','stopping'))>=public.marketplace_browser_effective_capacity() then 'pool_busy'
    else null end;
$$;

create or replace function public.marketplace_cloud_setup_presence(p_workspace_id uuid,p_setup_id uuid,p_dialog_id uuid,p_connected boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_setup public.marketplace_cloud_setups; v_expiry timestamptz;
begin
  if p_dialog_id is null or p_connected is null or not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Einrichtungszugriff verweigert' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id and workspace_id=p_workspace_id and requested_by=(select auth.uid()) for update;
  if not found or v_setup.state not in ('reserved','login','verified') then raise exception 'Einrichtung nicht verfügbar' using errcode='22023'; end if;
  if p_connected then
    if v_setup.browser_presence_expires_at>clock_timestamp() and v_setup.browser_dialog_id is distinct from p_dialog_id then raise exception 'Einrichtung ist bereits geöffnet' using errcode='55P03'; end if;
    v_expiry:=clock_timestamp()+interval '30 seconds';
    update public.marketplace_cloud_setups set browser_dialog_id=p_dialog_id,browser_presence_expires_at=v_expiry where id=v_setup.id;
  elsif v_setup.browser_dialog_id=p_dialog_id then
    update public.marketplace_cloud_setups set browser_dialog_id=null,browser_presence_expires_at=null where id=v_setup.id;
    update public.marketplace_account_actions set state='cancelled',error_code='dialog_closed',finished_at=clock_timestamp()
      where kind='cloud_setup_open' and payload->>'setupId'=p_setup_id::text and payload->>'dialogId'=p_dialog_id::text and state='queued';
  end if;
  select * into v_setup from public.marketplace_cloud_setups where id=v_setup.id;
  return public.marketplace_cloud_setup_public(v_setup);
end;
$$;

create or replace function public.marketplace_account_action_target(p_action public.marketplace_account_actions)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('accountId',p_action.external_account_id,'externalId',p_action.external_id,
    'entryId',p_action.entry_id,'entryKind',p_action.entry_kind,'body',entry.body)
  from (select 1) singleton left join public.marketplace_account_entries entry on entry.id=p_action.entry_id
    and entry.workspace_id=p_action.workspace_id and entry.connection_id=p_action.connection_id
    and entry.kind=p_action.entry_kind and entry.external_id=p_action.external_id;
$$;

create or replace function public.marketplace_browser_dialog_presence(p_workspace_id uuid,p_connection_id uuid,p_dialog_id uuid,p_connected boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.marketplace_connections; v_expiry timestamptz;
begin
  if p_dialog_id is null or p_connected is null or not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' and execution_mode='cloud' for update;
  if not found then raise exception 'Cloudkonto ist nicht verfügbar' using errcode='22023'; end if;
  if p_connected then
    if v_connection.browser_presence_expires_at>clock_timestamp() and (v_connection.browser_dialog_id is distinct from p_dialog_id or v_connection.browser_dialog_user_id is distinct from (select auth.uid())) then
      raise exception 'Anmeldung ist bereits geöffnet' using errcode='55P03';
    end if;
    v_expiry:=clock_timestamp()+interval '30 seconds';
    update public.marketplace_connections set browser_dialog_id=p_dialog_id,browser_dialog_user_id=(select auth.uid()),browser_presence_expires_at=v_expiry where id=v_connection.id;
  elsif v_connection.browser_dialog_id=p_dialog_id and v_connection.browser_dialog_user_id=(select auth.uid()) then
    update public.marketplace_connections set browser_dialog_id=null,browser_dialog_user_id=null,browser_presence_expires_at=null where id=v_connection.id;
    update public.marketplace_account_actions set state='cancelled',error_code='dialog_closed',finished_at=clock_timestamp()
      where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='cloud_session_open' and payload->>'dialogId'=p_dialog_id::text and state='queued';
  end if;
  return jsonb_build_object('connected',p_connected,'expiresAt',v_expiry);
end;
$$;

-- Nur der interne Server darf die aktuelle anonyme/gesperrte Identität ohne gespeichertes Nutzer-JWT prüfen.
create or replace function public.marketplace_account_action_user_authorized(p_workspace_id uuid,p_user_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.workspace_access_is_valid(p_workspace_id) then return false; end if;
  perform 1 from auth.users where id=p_user_id and not is_anonymous and (banned_until is null or banned_until<=clock_timestamp()) for share;
  return found;
end;
$$;

create or replace function public.marketplace_account_action_authorized(p_action public.marketplace_account_actions)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_connection public.marketplace_connections;
begin
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

create or replace function public.marketplace_account_action_public(p_action public.marketplace_account_actions)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_wait text; v_blocker uuid;
begin
  if p_action.state='queued' then
    if p_action.is_write and p_action.resource_key is not null then
      select public_id into v_blocker from public.marketplace_account_actions where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id
        and is_write and resource_key=p_action.resource_key and state='outcome_unknown' and queue_order<p_action.queue_order order by queue_order limit 1;
    end if;
    v_wait:=case when v_blocker is not null or (p_action.is_write and p_action.resource_key is not null and exists(
        select 1 from public.marketplace_browser_queue_entries() previous where previous.workspace_id=p_action.workspace_id and previous.connection_id=p_action.connection_id
          and previous.is_write and previous.resource_key=p_action.resource_key and previous.queue_order<p_action.queue_order and previous.state='outcome_unknown')) then 'dependency_unresolved'
      when p_action.kind not in ('cloud_setup_open','cloud_session_open') and (not public.marketplace_cloud_write_available(p_action.workspace_id,p_action.connection_id)
        or exists(select 1 from public.marketplace_connections where workspace_id=p_action.workspace_id and id=p_action.connection_id and status in ('needs_login','paused'))) then 'account_paused'
      else public.marketplace_browser_slot_status(p_action.workspace_id,p_action.connection_id) end;
  end if;
  return jsonb_build_object('id',p_action.public_id,'workspaceId',p_action.workspace_id,'connectionId',p_action.connection_id,'requestId',p_action.request_id,
    'kind',p_action.kind,'state',p_action.state,'version',p_action.version,'waitReason',v_wait,'errorCode',p_action.error_code,'result',p_action.result,'entryId',p_action.entry_id,'title',p_action.title,
    'imageUrl',(select coalesce(entry.body->>'imageUrl',entry.body->>'itemImageUrl') from public.marketplace_account_entries entry
      where entry.id=p_action.entry_id and entry.workspace_id=p_action.workspace_id and entry.connection_id=p_action.connection_id),
    'createdAt',p_action.created_at,'startedAt',p_action.started_at,'finishedAt',p_action.finished_at,'updatedAt',p_action.updated_at,
    'historyPurged',p_action.history_purged_at is not null,'resultExpired',p_action.history_purged_at is not null,'blockedByActionId',v_blocker);
end;
$$;

create or replace function public.marketplace_account_action_enqueue(p_workspace_id uuid,p_connection_id uuid,p_request_id uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_action public.marketplace_account_actions; v_connection public.marketplace_connections; v_entry public.marketplace_account_entries;
  v_setup public.marketplace_cloud_setups; v_parent public.marketplace_account_actions; v_profile text; v_hash text; v_entry_kind text; v_entry_id uuid; v_write boolean; v_resource text; v_allowed text[];
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) or not public.workspace_access_is_valid(p_workspace_id)
    or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_request_id is null or p_kind is null or p_kind not in ('profile_details_read','profile_details_save','profile_cities_read','profile_edit_read','profile_edit_save','listing_category_read','listing_content_read','listing_content_save','listing_edit_read','listing_edit_save','listing_edit_intent','listing_delete','price_save','conversations_read','shipping_label_request','outcome_reconcile','cloud_setup_open','cloud_session_open')
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1048576
    or p_payload ?| array['workspaceId','connectionId','requestId','userId','userAccessToken','accessToken','authorization','cookie','cookies'] then raise exception 'Ungültiger Cloudauftrag' using errcode='22023'; end if;
  v_allowed:=case p_kind
    when 'price_save' then array['entryId','expectedPriceCents','priceCents']
    when 'listing_delete' then array['entryId']
    when 'listing_edit_read' then array['entryId']
    when 'listing_content_read' then array['entryId']
    when 'listing_edit_save' then array['entryId','fields']
    when 'listing_edit_intent' then array['entryId','intent']
    when 'listing_content_save' then array['entryId','base','content','photos']
    when 'listing_category_read' then array['categoryId','categoryLabel']
    when 'conversations_read' then array['conversationId']
    when 'shipping_label_request' then array['saleId']
    when 'profile_details_save' then array['changes','expected']
    when 'profile_edit_save' then array['about','expectedAbout']
    when 'profile_cities_read' then array['query']
    when 'outcome_reconcile' then array['actionId']
    when 'cloud_setup_open' then array['setupId','dialogId']
    when 'cloud_session_open' then array['dialogId']
    else array[]::text[] end;
  if exists(select 1 from jsonb_object_keys(p_payload) field where not field=any(v_allowed)) then raise exception 'Ungültige Auftragsfelder' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_kind,p_payload)::text,'utf8'),'sha256'),'hex');
  select * into v_action from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id;
  if found then
    if v_action.requested_by<>(select auth.uid()) or v_action.kind<>p_kind or v_action.request_hash<>v_hash then raise exception 'Anfragekennung bereits mit anderem Inhalt verwendet' using errcode='23505'; end if;
    return jsonb_build_object('action',public.marketplace_account_action_public(v_action));
  end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if (select count(*) from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and state='queued')>=50 then
    raise exception 'Für dieses Konto warten bereits 50 Aktionen. Warte, bis eine ausgeführt oder abgebrochen wurde.' using errcode='P0001',detail='account_action_queue_full';
  end if;
  v_write:=p_kind in ('profile_details_save','profile_edit_save','listing_content_save','listing_edit_save','listing_edit_intent','listing_delete','price_save','shipping_label_request');
  if p_kind='cloud_setup_open' then
    if (select count(*) from jsonb_object_keys(p_payload))<>2 or not (p_payload ?& array['setupId','dialogId']) then raise exception 'Ungültiger Einrichtungsauftrag' using errcode='22023'; end if;
    select * into v_setup from public.marketplace_cloud_setups where public_id=(p_payload->>'setupId')::uuid and workspace_id=p_workspace_id and connection_id=p_connection_id and requested_by=(select auth.uid());
    if not found or v_setup.state not in ('login','verified') or v_setup.browser_dialog_id is distinct from (p_payload->>'dialogId')::uuid or v_setup.browser_presence_expires_at is null or v_setup.browser_presence_expires_at<=clock_timestamp() then raise exception 'Einrichtungsdialog ist nicht verbunden' using errcode='22023'; end if;
    v_profile:=v_setup.provider_profile_id;
  elsif p_kind='cloud_session_open' then
    if v_connection.execution_mode<>'cloud' or v_connection.status in ('paused','blocked') or v_connection.browser_dialog_id is distinct from (p_payload->>'dialogId')::uuid
      or v_connection.browser_dialog_user_id is distinct from (select auth.uid()) or v_connection.browser_presence_expires_at is null or v_connection.browser_presence_expires_at<=clock_timestamp() then
      raise exception 'Anmeldedialog ist nicht verbunden' using errcode='22023'; end if;
    select provider_profile_id into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id;
  else
    if v_connection.execution_mode<>'cloud' or v_connection.status<>'connected' or v_connection.external_account_id is null then raise exception 'Konto ist nicht verbunden' using errcode='22023'; end if;
    select provider_profile_id into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id;
    if p_kind like 'listing_%' and p_kind<>'listing_category_read' or p_kind='price_save' then
      v_entry_kind:='publication'; v_entry_id:=(p_payload->>'entryId')::uuid;
    elsif p_kind='conversations_read' then v_entry_kind:='conversation'; v_entry_id:=(p_payload->>'conversationId')::uuid;
    elsif p_kind='shipping_label_request' then v_entry_kind:='sale'; v_entry_id:=(p_payload->>'saleId')::uuid;
    elsif p_kind like 'profile_%' or p_kind='listing_category_read' then v_entry_kind:='profile';
    elsif p_kind='outcome_reconcile' then
      select * into v_parent from public.marketplace_account_actions where public_id=(p_payload->>'actionId')::uuid and workspace_id=p_workspace_id and connection_id=p_connection_id;
      if not found or v_parent.state<>'outcome_unknown' or v_parent.external_account_id is distinct from v_connection.external_account_id then raise exception 'Kein passendes ungeklärtes Ergebnis' using errcode='22023'; end if;
    end if;
    if v_entry_kind is not null then
      select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind=v_entry_kind
        and ((v_entry_id is not null and id=v_entry_id) or (v_entry_id is null and v_entry_kind='profile' and external_id=v_connection.external_account_id));
      if not found or v_entry.external_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Kontoeintrag ist nicht verfügbar' using errcode='22023'; end if;
    end if;
    if p_kind='price_save' and (jsonb_typeof(p_payload->'priceCents') is distinct from 'number' or (p_payload->>'priceCents')::numeric not between 1 and 100000000 or (p_payload->>'priceCents')::numeric<>trunc((p_payload->>'priceCents')::numeric)
      or jsonb_typeof(p_payload->'expectedPriceCents') is distinct from 'number') then raise exception 'Ungültiger Preisauftrag' using errcode='22023'; end if;
    if p_kind='listing_category_read' and (jsonb_typeof(p_payload->'categoryId') is distinct from 'number' or (p_payload->>'categoryId')::numeric not between 1 and 2147483647) then raise exception 'Ungültige Kategorie' using errcode='22023'; end if;
    if p_kind='profile_cities_read' and (jsonb_typeof(p_payload->'query') is distinct from 'string' or char_length(btrim(p_payload->>'query')) not between 2 and 80) then raise exception 'Ungültige Stadtsuche' using errcode='22023'; end if;
    if p_kind='profile_edit_save' and (jsonb_typeof(p_payload->'about') is distinct from 'string' or char_length(p_payload->>'about')>2000) then raise exception 'Ungültiger Profiltext' using errcode='22023'; end if;
    if p_kind='profile_details_save' and (jsonb_typeof(p_payload->'changes') is distinct from 'object' or jsonb_typeof(p_payload->'expected') is distinct from 'object') then raise exception 'Ungültige Profiländerung' using errcode='22023'; end if;
    if p_kind='listing_edit_save' and jsonb_typeof(p_payload->'fields') is distinct from 'object' then raise exception 'Ungültige Inseratänderung' using errcode='22023'; end if;
    if p_kind='listing_edit_intent' and jsonb_typeof(p_payload->'intent') is distinct from 'object' then raise exception 'Ungültige Inseratänderung' using errcode='22023'; end if;
    if p_kind='listing_content_save' and (not public.marketplace_listing_content_valid(p_payload->'base') or not public.marketplace_listing_content_valid(p_payload->'content')) then raise exception 'Ungültige Inseratangaben' using errcode='22023'; end if;
    if v_write then v_resource:=case v_entry_kind when 'publication' then 'listing:'||v_entry.external_id when 'sale' then 'shipping_label:'||v_entry.external_id else 'profile:'||v_connection.external_account_id end; end if;
  end if;
  if v_profile is null then raise exception 'Browserprofil fehlt' using errcode='22023'; end if;
  insert into public.marketplace_account_actions(workspace_id,connection_id,requested_by,request_id,request_hash,kind,payload,external_account_id,provider_profile_id,entry_id,entry_kind,external_id,resource_key,title,is_write,reconciliation_action_id)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_request_id,v_hash,p_kind,p_payload,v_connection.external_account_id,v_profile,v_entry.id,v_entry_kind,v_entry.external_id,v_resource,left(v_entry.body->>'title',500),v_write,v_parent.public_id) returning * into v_action;
  return jsonb_build_object('action',public.marketplace_account_action_public(v_action));
end;
$$;

create or replace function public.marketplace_account_action_read(p_workspace_id uuid,p_connection_id uuid,p_action_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_action public.marketplace_account_actions;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_action from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and public_id=p_action_id;
  if not found then raise exception 'Auftrag nicht gefunden' using errcode='22023'; end if;
  return jsonb_build_object('action',public.marketplace_account_action_public(v_action));
end;
$$;

create or replace function public.marketplace_account_action_find(p_workspace_id uuid,p_connection_id uuid,p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_action public.marketplace_account_actions;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_action from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id and requested_by=(select auth.uid());
  return jsonb_build_object('action',case when found then public.marketplace_account_action_public(v_action) else null end);
end;
$$;

create or replace function public.marketplace_account_actions_read(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actions jsonb;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  with selected as (
    select action from public.marketplace_account_actions action
      where action.workspace_id=p_workspace_id and action.connection_id=p_connection_id and action.history_purged_at is null
        and action.state in ('queued','running','outcome_unknown')
    union all
    (select action from public.marketplace_account_actions action
      where action.workspace_id=p_workspace_id and action.connection_id=p_connection_id and action.history_purged_at is null
        and action.state in ('succeeded','failed','cancelled')
      order by action.updated_at desc,action.id desc limit 10)
  )
  -- Fachresultate vor dem JSON-Aufbau ersetzen; der Einzelabruf bleibt vollständig.
  select coalesce(jsonb_agg(public.marketplace_account_action_public(jsonb_populate_record(selected.action,
      jsonb_build_object('result',case when (selected.action).state='failed' and (selected.action).result->>'status'='conflict'
        then jsonb_build_object('status','conflict') else null end))) order by (selected.action).queue_order),'[]'::jsonb) into v_actions
    from selected;
  return jsonb_build_object('actions',v_actions);
end;
$$;

create or replace function public.marketplace_account_action_cancel(p_workspace_id uuid,p_connection_id uuid,p_action_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_action public.marketplace_account_actions;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_action from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and public_id=p_action_id for update;
  if not found then raise exception 'Auftrag nicht gefunden' using errcode='22023'; end if;
  if v_action.state='queued' then update public.marketplace_account_actions set state='cancelled',finished_at=clock_timestamp() where id=v_action.id returning * into v_action;
  elsif v_action.state<>'cancelled' then raise exception 'Nur wartende Aktionen können abgebrochen werden' using errcode='22023'; end if;
  return jsonb_build_object('action',public.marketplace_account_action_public(v_action));
end;
$$;

create or replace function public.marketplace_account_action_reconcile(p_workspace_id uuid,p_connection_id uuid,p_action_id uuid,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  return public.marketplace_account_action_enqueue(p_workspace_id,p_connection_id,p_request_id,'outcome_reconcile',jsonb_build_object('actionId',p_action_id));
end;
$$;

create or replace function public.marketplace_cloud_setup_public(p_setup public.marketplace_cloud_setups)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('workspaceId',p_setup.workspace_id,'connectionId',p_setup.connection_id,'setupId',p_setup.public_id,'state',p_setup.state,
    'sessionId',session.public_id,'startState',case when action.state='running' then 'starting' when session.state in ('active','stopping') then 'running' when action.state='queued' then 'queued' else 'idle' end,
    'waitReason',case when action.state='queued' then public.marketplace_browser_slot_status(p_setup.workspace_id,p_setup.connection_id) end,'version',coalesce(action.version,1),'startActionId',action.public_id)
  from (select 1) singleton
  left join lateral(select * from public.marketplace_account_actions where workspace_id=p_setup.workspace_id and connection_id=p_setup.connection_id
    and kind='cloud_setup_open' and payload->>'setupId'=p_setup.public_id::text order by queue_order desc limit 1) action on true
  left join lateral(select * from public.marketplace_browser_sessions where cloud_setup_id=p_setup.public_id and state in ('active','stopping') order by created_at desc limit 1) session on true;
$$;

create or replace function public.marketplace_account_action_check(p_action_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid,p_renew boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_action public.marketplace_account_actions; v_session public.marketplace_browser_sessions;
  v_inactive jsonb:='{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null,"target":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_action from public.marketplace_account_actions where public_id=p_action_id and claim_token=p_claim_token and worker_id=p_worker_id and worker_epoch=p_worker_epoch
    and runner_id=p_runner_id and state='running' and lease_expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp() for update;
  if not found or not public.marketplace_account_action_authorized(v_action) then return v_inactive; end if;
  if v_action.kind not in ('cloud_setup_open','cloud_session_open') and not exists(select 1 from public.marketplace_connections where workspace_id=v_action.workspace_id and id=v_action.connection_id and status='connected') then return v_inactive; end if;
  select * into v_session from public.marketplace_browser_sessions where public_id=v_action.browser_session_id and account_action_id=v_action.public_id
    and workspace_id=v_action.workspace_id and connection_id=v_action.connection_id and provider_profile_id=v_action.provider_profile_id and started_by=v_action.requested_by
    and worker_id=p_worker_id and worker_epoch=p_worker_epoch and state='active' and expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  if p_renew then
    update public.marketplace_browser_sessions set heartbeat_at=clock_timestamp(),expires_at=least(clock_timestamp()+interval '90 seconds',absolute_expires_at) where id=v_session.id returning * into v_session;
    update public.marketplace_account_actions set lease_expires_at=v_session.expires_at where id=v_action.id;
  end if;
  return jsonb_build_object('active',true,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,
    'target',public.marketplace_account_action_target(v_action));
end;
$$;

create or replace function public.marketplace_account_action_begin_write(p_action_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
begin
  if public.marketplace_account_action_check(p_action_id,p_claim_token,p_worker_id,p_worker_epoch,p_runner_id,false)->>'active'<>'true' then return false; end if;
  update public.marketplace_account_actions set write_started_at=coalesce(write_started_at,clock_timestamp()) where public_id=p_action_id and is_write;
  return found;
end;
$$;

create or replace function public.marketplace_account_action_finish(p_action_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid,p_state text,p_result jsonb default null,p_error_code text default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_action public.marketplace_account_actions; v_parent public.marketplace_account_actions; v_verified timestamptz; v_reason text;
begin
  if p_state is null or p_state not in ('succeeded','failed','outcome_unknown') or (p_result is not null and octet_length(p_result::text)>4194304)
    or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiger Auftragsabschluss' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_action from public.marketplace_account_actions where public_id=p_action_id and claim_token=p_claim_token and worker_id=p_worker_id and worker_epoch=p_worker_epoch and runner_id=p_runner_id for update;
  if not found then return false; end if;
  if v_action.state in ('succeeded','failed','cancelled') then return v_action.state=p_state and v_action.result is not distinct from p_result and v_action.error_code is not distinct from p_error_code; end if;
  if v_action.state not in ('running','outcome_unknown') then return false; end if;
  -- Ein später belegter Abschluss desselben Versuchs ist zulässig, ein fremder neuer Besitzer nicht.
  if not exists(select 1 from public.marketplace_browser_sessions where public_id=v_action.browser_session_id and workspace_id=v_action.workspace_id
    and connection_id=v_action.connection_id and worker_id=p_worker_id and worker_epoch=p_worker_epoch and started_by=v_action.requested_by) then return false; end if;
  if v_action.is_write and p_state='succeeded' and v_action.write_started_at is null and not coalesce((
    coalesce(p_result->'noWriteNeeded'='true'::jsonb,false) and (
      p_result->>'status'='confirmed' or (v_action.kind='shipping_label_request' and p_result->>'outcome'='ready' and p_result->'requested'='false'::jsonb))
  ),false) then raise exception 'Schreibbeginn fehlt' using errcode='42501'; end if;
  if p_state='outcome_unknown' and (not v_action.is_write or v_action.write_started_at is null) then raise exception 'Keine ungeklärte Anbieterwirkung' using errcode='22023'; end if;
  if p_state='succeeded' and v_action.kind='outcome_reconcile' and p_result->>'resolution' in ('succeeded','failed') then
    select * into v_parent from public.marketplace_account_actions where public_id=v_action.reconciliation_action_id and workspace_id=v_action.workspace_id
      and connection_id=v_action.connection_id and external_account_id=v_action.external_account_id and state='outcome_unknown' for update;
    begin v_verified:=(p_result->>'verifiedAt')::timestamptz; exception when others then raise exception 'Ungültiger Prüfnachweis' using errcode='22023'; end;
    if not found or p_result->>'reconciledActionId' is distinct from v_parent.public_id::text or v_verified is null or not isfinite(v_verified)
      or v_verified<v_action.started_at or v_verified>clock_timestamp()+interval '1 minute' then raise exception 'Ungültiger Prüfnachweis' using errcode='22023'; end if;
    if jsonb_typeof(p_result->'providerResult') is distinct from 'object' or p_result->'providerResult'='{}'::jsonb
      or (p_result->>'resolution'='succeeded' and not coalesce(case when v_parent.kind='shipping_label_request'
        then p_result->'providerResult'->>'outcome'='ready' and p_result->'providerResult'->'requested'='false'::jsonb
        else p_result->'providerResult'->>'status'='confirmed' end,false)) then
      raise exception 'Fachlicher Prüfnachweis fehlt' using errcode='22023';
    end if;
    -- Der ursprüngliche Aufruf erhält sein typgerechtes Ergebnis; Prüfmetadaten bleiben im verknüpften Prüfauftrag.
    update public.marketplace_account_actions set state=p_result->>'resolution',error_code=null,result=p_result->'providerResult',finished_at=clock_timestamp() where id=v_parent.id;
  end if;
  update public.marketplace_account_actions set state=p_state,result=p_result,error_code=p_error_code,finished_at=clock_timestamp(),lease_expires_at=null where id=v_action.id;
  v_reason:=case p_error_code when 'login_required' then 'needs_login' when 'identity_changed' then 'needs_login' when 'challenge_required' then 'challenge' when 'rate_limited' then 'rate_limited' end;
  if v_reason is not null and v_action.kind<>'cloud_setup_open' and exists(select 1 from public.marketplace_connections connection
    join public.marketplace_browser_profiles profile on profile.workspace_id=connection.workspace_id and profile.connection_id=connection.id
    where connection.workspace_id=v_action.workspace_id and connection.id=v_action.connection_id and connection.external_account_id=v_action.external_account_id and profile.provider_profile_id=v_action.provider_profile_id) then
    insert into public.marketplace_sync_schedules(workspace_id,connection_id,enabled,activated_by,paused_reason,retry_after,consecutive_failures)
      values(v_action.workspace_id,v_action.connection_id,false,v_action.requested_by,v_reason,case when v_reason='rate_limited' then clock_timestamp()+interval '15 minutes' end,1)
      on conflict(workspace_id,connection_id) do update set enabled=case when v_reason='rate_limited' then public.marketplace_sync_schedules.enabled else false end,
        authorization_version=public.marketplace_sync_schedules.authorization_version+1,paused_reason=v_reason,
        retry_after=case when v_reason='rate_limited' then clock_timestamp()+interval '15 minutes' end,next_due_at=null,
        consecutive_failures=public.marketplace_sync_schedules.consecutive_failures+1,updated_at=clock_timestamp()
      where public.marketplace_sync_schedules.updated_at<=v_action.started_at;
  end if;
  if v_action.kind in ('cloud_setup_open','cloud_session_open') and p_state='succeeded' then
    update public.marketplace_browser_sessions set account_action_id=null,expires_at=absolute_expires_at where public_id=v_action.browser_session_id
      and (v_action.kind='cloud_session_open' or cloud_setup_id=(v_action.payload->>'setupId')::uuid);
  end if;
  return true;
end;
$$;

create or replace function public.marketplace_account_action_retry(p_action_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid,p_error_code text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_action public.marketplace_account_actions;
begin
  if p_error_code is null or p_error_code not in ('network','browser_unavailable','timeout','begin_unconfirmed','provider_failed') then return false; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_action from public.marketplace_account_actions where public_id=p_action_id and claim_token=p_claim_token and worker_id=p_worker_id and worker_epoch=p_worker_epoch and runner_id=p_runner_id and state='running' for update;
  if not found or v_action.write_started_at is not null or v_action.attempts>=3 or not public.marketplace_account_action_authorized(v_action)
    or not exists(select 1 from public.marketplace_browser_sessions where public_id=v_action.browser_session_id and state='closed') then return false; end if;
  update public.marketplace_account_actions set state='queued',claim_token=null,worker_id=null,worker_epoch=null,runner_id=null,browser_session_id=null,
    lease_expires_at=null,absolute_expires_at=null,error_code=null,started_at=null,finished_at=null where id=v_action.id;
  return true;
end;
$$;

create or replace function public.marketplace_account_actions_recover(p_worker_id uuid,p_worker_epoch bigint)
returns integer language plpgsql volatile security invoker set search_path='' as $$
declare v_count integer:=0; v_action public.marketplace_account_actions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return 0; end if;
  for v_action in select action.* from public.marketplace_account_actions action where state='running' and
    (worker_id<>p_worker_id or worker_epoch<>p_worker_epoch or lease_expires_at<=clock_timestamp()
      or exists(select 1 from public.marketplace_browser_sessions where public_id=action.browser_session_id and state='closed')) for update loop
    if v_action.write_started_at is not null then
      update public.marketplace_account_actions set state='outcome_unknown',error_code='interrupted',lease_expires_at=null,finished_at=clock_timestamp() where id=v_action.id;
    elsif exists(select 1 from public.marketplace_browser_sessions where public_id=v_action.browser_session_id and state='closed') then
      update public.marketplace_account_actions set state=case when v_action.attempts<3 and public.marketplace_account_action_authorized(v_action) then 'queued' else 'failed' end,
        error_code=case when v_action.attempts<3 and public.marketplace_account_action_authorized(v_action) then null else 'interrupted' end,
        claim_token=null,worker_id=null,worker_epoch=null,runner_id=null,browser_session_id=null,lease_expires_at=null,absolute_expires_at=null,started_at=null,
        finished_at=case when v_action.attempts<3 and public.marketplace_account_action_authorized(v_action) then null else clock_timestamp() end where id=v_action.id;
    end if;
    v_count:=v_count+1;
  end loop;
  update public.marketplace_account_actions action set state='cancelled',error_code=case when kind in ('cloud_setup_open','cloud_session_open') then 'dialog_closed' else 'authorization_revoked' end,finished_at=clock_timestamp()
    where state='queued' and not public.marketplace_account_action_authorized(action);
  return v_count;
end;
$$;

create or replace function public.marketplace_account_actions_purge_history(p_limit integer default 200)
returns integer language plpgsql volatile security invoker set search_path='' as $$
declare v_count integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Ungültige Bereinigungsgröße' using errcode='22023'; end if;
  with selected as (
    select id from public.marketplace_account_actions where state in ('succeeded','failed','cancelled') and history_purged_at is null and finished_at<clock_timestamp()-interval '30 days'
      order by finished_at,id limit p_limit for update skip locked
  ) update public.marketplace_account_actions action set payload=null,result=null,error_code=null,external_account_id=null,provider_profile_id=null,entry_id=null,entry_kind=null,external_id=null,resource_key=null,title=null,
    claim_token=null,worker_id=null,worker_epoch=null,runner_id=null,browser_session_id=null,lease_expires_at=null,absolute_expires_at=null,write_started_at=null,history_purged_at=clock_timestamp()
    from selected where action.id=selected.id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.marketplace_browser_queue_entries()
returns table(kind text,job_id text,workspace_id uuid,connection_id uuid,queue_order bigint,created_at timestamptz,is_user boolean,state text,resource_key text,is_write boolean)
language sql stable security invoker set search_path='' as $$
  select 'account_action'::text,a.public_id::text,a.workspace_id,a.connection_id,a.queue_order,a.created_at,true,a.state,a.resource_key,a.is_write
    from public.marketplace_account_actions a where a.state in ('queued','running','outcome_unknown')
  union all select 'sync',o.id::text,o.workspace_id,o.connection_id,o.queue_order,o.created_at,o.authorization_kind='manual_read',o.state,null,false
    from public.marketplace_operations o where o.state in ('queued','running')
  union all select 'message',m.id::text,m.workspace_id,m.connection_id,m.queue_order,m.created_at,true,
    case when m.state in ('claimed','sending') then 'running' else m.state end,null,true
    from public.marketplace_local_message_outbox m where m.execution_mode='cloud' and m.state in ('queued','claimed','sending','outcome_unknown')
  union all select 'negotiation',j.id::text,j.workspace_id,j.connection_id,j.queue_order,j.created_at,not j.automated,
    case when j.state in ('claimed','sending') then 'running' else j.state end,
    case when j.action<>'message' then 'offer:'||coalesce(j.source_offer->>'offerId',j.thread_id::text) end,true
    from public.marketplace_negotiation_jobs j where j.execution_mode='cloud' and j.state in ('queued','claimed','sending','outcome_unknown')
  union all select 'listing',j.id::text,j.workspace_id,j.connection_id,j.queue_order,j.created_at,true,
    case when j.state in ('claimed','writing') then 'running' else j.state end,
    'listing:'||coalesce(j.snapshot->>'relistExternalId',j.external_id,'draft:'||j.draft_id::text),true
    from public.marketplace_listing_jobs j where j.execution_mode='cloud' and j.state in ('queued','paused','claimed','writing','outcome_unknown')
  union all select case when e.state='sent' then 'favorite_offer' else 'favorite_message' end,e.id::text,e.workspace_id,e.connection_id,e.queue_order,e.event_at,false,
    case when e.state='sent' then case when e.offer_state='pending' then 'queued' when e.offer_state in ('claimed','sending') then 'running' else e.offer_state end
      when e.state in ('claimed','sending') then 'running' else e.state end,'favorite:'||e.id::text,true
    from public.marketplace_favorite_message_events e where e.execution_mode='cloud' and (e.state in ('queued','claimed','sending','outcome_unknown') or (e.state='sent' and e.offer_state in ('pending','claimed','sending','outcome_unknown')));
$$;

create or replace function public.marketplace_browser_job_ready(p_kind text,p_job_id text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
begin
  case p_kind
  when 'account_action' then return exists(select 1 from public.marketplace_account_actions a where public_id=p_job_id::uuid and state='queued'
    and public.marketplace_account_action_authorized(a) and (kind in ('cloud_setup_open','cloud_session_open') or exists(select 1 from public.marketplace_connections c where c.workspace_id=a.workspace_id and c.id=a.connection_id and c.status='connected'))
    and (kind in ('outcome_reconcile','cloud_setup_open','cloud_session_open') or public.marketplace_cloud_write_available(workspace_id,connection_id)));
  when 'sync' then return exists(select 1 from public.marketplace_operations o join public.marketplace_connections c on c.workspace_id=o.workspace_id and c.id=o.connection_id
    left join public.marketplace_sync_schedules s on s.id=o.schedule_id
    where o.id=p_job_id::uuid and o.state='queued' and o.authorization_version=1 and c.execution_mode='cloud' and c.status='connected'
      and public.marketplace_sync_authorization_valid(o.workspace_id,o.requested_by) and public.marketplace_cloud_network_valid(o.workspace_id,o.connection_id)
      and (o.authorization_kind='manual_read' or (o.authorization_kind='scheduled_read' and s.enabled and s.authorization_version=o.schedule_authorization_version and s.activated_by=o.requested_by)));
  when 'message' then return exists(select 1 from public.marketplace_local_message_outbox m where id=p_job_id::uuid and execution_mode='cloud' and state='queued'
    and public.marketplace_cloud_write_available(workspace_id,connection_id) and public.marketplace_cloud_message_permission_valid(workspace_id,connection_id,requested_by,cloud_authorization_version));
  when 'negotiation' then return exists(select 1 from public.marketplace_negotiation_jobs j where id=p_job_id::uuid and execution_mode='cloud' and state='queued' and due_at<=clock_timestamp()
    and public.marketplace_cloud_write_available(workspace_id,connection_id) and public.marketplace_negotiation_job_valid(j));
  when 'listing' then return exists(select 1 from public.marketplace_listing_jobs j where id=p_job_id::bigint and execution_mode='cloud' and state='queued' and public.marketplace_listing_job_valid(j)
    and public.marketplace_cloud_write_available(workspace_id,connection_id) and ((j.snapshot ? 'relistExternalId' and j.relist_publish_at is null)
      or public.marketplace_listing_job_timing(coalesce(j.relist_publish_at,j.scheduled_at),j.late_policy,clock_timestamp())='due'));
  when 'favorite_message','favorite_offer' then return exists(select 1 from public.marketplace_favorite_message_events e join public.marketplace_favorite_message_settings settings using(workspace_id,connection_id)
    join public.marketplace_sync_schedules schedule using(workspace_id,connection_id)
    where e.id=p_job_id::uuid and e.execution_mode='cloud' and settings.execution_mode='cloud' and settings.enabled and schedule.enabled and schedule.paused_reason is null
      and (schedule.retry_after is null or schedule.retry_after<=clock_timestamp()) and e.setting_version=settings.version and e.external_account_id=settings.external_account_id and e.cloud_authorization_version=settings.cloud_authorization_version
      and public.marketplace_cloud_write_available(e.workspace_id,e.connection_id) and public.marketplace_cloud_favorite_settings_valid(e.workspace_id,e.connection_id)
      and ((p_kind='favorite_offer' and e.state='sent' and e.offer_state='pending') or (p_kind='favorite_message' and e.state='queued' and e.event_at+make_interval(mins=>(settings.config->>'delayMinutes')::integer)<=clock_timestamp())));
  else return false;
  end case;
end;
$$;

create or replace function public.marketplace_browser_next_work(p_include_scheduled boolean default true,p_enabled_kinds text[] default array['account_action','sync','message','negotiation','listing','favorite_message','favorite_offer'])
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_job record;
begin
  perform pg_advisory_xact_lock(91731,1);
  for v_job in select q.* from public.marketplace_browser_queue_entries() q where q.state='queued' and q.kind=any(p_enabled_kinds)
    and (q.kind<>'sync' or q.is_user or p_include_scheduled)
    and public.marketplace_browser_slot_status(q.workspace_id,q.connection_id) is null
    and (not q.is_write or q.resource_key is null or not exists(select 1 from public.marketplace_browser_queue_entries() previous
      where previous.workspace_id=q.workspace_id and previous.connection_id=q.connection_id and previous.is_write and previous.resource_key=q.resource_key
        and previous.queue_order<q.queue_order and previous.state in ('queued','paused','running','outcome_unknown')))
    order by case when q.kind='sync' and q.is_user=false and q.created_at>clock_timestamp()-interval '5 minutes' then 1 else 0 end,q.queue_order,q.kind,q.job_id loop
    if public.marketplace_browser_job_ready(v_job.kind,v_job.job_id) then return jsonb_build_object('kind',v_job.kind,'jobId',v_job.job_id,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id); end if;
  end loop;
  return null;
end;
$$;

create or replace function public.marketplace_browser_job_eligible(p_kind text,p_job_id text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_job record;
begin
  select * into v_job from public.marketplace_browser_queue_entries() where kind=p_kind and job_id=p_job_id and state='queued';
  if not found or public.marketplace_browser_slot_status(v_job.workspace_id,v_job.connection_id) is not null then return false; end if;
  if v_job.is_write and v_job.resource_key is not null and exists(select 1 from public.marketplace_browser_queue_entries() previous
    where previous.workspace_id=v_job.workspace_id and previous.connection_id=v_job.connection_id and previous.is_write and previous.resource_key=v_job.resource_key
      and previous.queue_order<v_job.queue_order and previous.state in ('queued','paused','running','outcome_unknown')) then return false; end if;
  return public.marketplace_browser_job_ready(p_kind,p_job_id);
end;
$$;

create or replace function public.marketplace_account_action_claim(p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid,p_target_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_action public.marketplace_account_actions; v_session public.marketplace_browser_sessions; v_parent public.marketplace_account_actions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found or p_runner_id is null then return null; end if;
  select * into v_action from public.marketplace_account_actions where public_id=p_target_id and state='queued' for update;
  if not found or not public.marketplace_browser_job_eligible('account_action',v_action.public_id::text) then return null; end if;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at,account_action_id,cloud_setup_id)
    values(v_action.workspace_id,v_action.connection_id,v_action.requested_by,v_action.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes',v_action.public_id,
      case when v_action.kind='cloud_setup_open' then (v_action.payload->>'setupId')::uuid end) returning * into v_session;
  update public.marketplace_account_actions set state='running',claim_token=gen_random_uuid(),worker_id=p_worker_id,worker_epoch=p_worker_epoch,runner_id=p_runner_id,browser_session_id=v_session.public_id,
    lease_expires_at=v_session.expires_at,absolute_expires_at=v_session.absolute_expires_at,attempts=attempts+1,started_at=clock_timestamp() where id=v_action.id returning * into v_action;
  if v_action.reconciliation_action_id is not null then select * into v_parent from public.marketplace_account_actions where public_id=v_action.reconciliation_action_id; end if;
  return jsonb_build_object('actionId',v_action.public_id,'claimToken',v_action.claim_token,'workspaceId',v_action.workspace_id,'connectionId',v_action.connection_id,'userId',v_action.requested_by,
    'externalAccountId',v_action.external_account_id,'providerProfileId',v_action.provider_profile_id,'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'actionKind',v_action.kind,'payload',v_action.payload,'target',public.marketplace_account_action_target(v_action),
    'reconciliationContext',case when v_parent.id is not null then jsonb_build_object('actionId',v_parent.public_id,'kind',v_parent.kind,'payload',v_parent.payload,'target',public.marketplace_account_action_target(v_parent),'result',v_parent.result,'startedAt',v_parent.started_at) end);
end;
$$;

create or replace function public.marketplace_sync_prepare_scheduled()
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v_schedule public.marketplace_sync_schedules; v_connection public.marketplace_connections;
begin
  perform pg_advisory_xact_lock(91731,1);
  for v_schedule in select * from public.marketplace_sync_schedules where enabled and next_due_at<=clock_timestamp()
    and (retry_after is null or retry_after<=clock_timestamp()) order by next_due_at,id loop
    select * into v_connection from public.marketplace_connections where workspace_id=v_schedule.workspace_id and id=v_schedule.connection_id and marketplace='vinted' for update;
    perform 1 from public.marketplace_sync_schedules where id=v_schedule.id for update;
    if v_connection.execution_mode<>'cloud' or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_schedule.workspace_id,v_schedule.activated_by)
      or not public.marketplace_cloud_network_valid(v_schedule.workspace_id,v_schedule.connection_id) then
      update public.marketplace_sync_schedules set enabled=false,authorization_version=authorization_version+1,paused_reason='access_revoked',next_due_at=null,updated_at=clock_timestamp() where id=v_schedule.id;
      continue;
    end if;
    insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,schedule_id,schedule_authorization_version)
      values(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.activated_by,'scheduled_read',1,v_schedule.id,v_schedule.authorization_version)
      on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
    update public.marketplace_sync_schedules set next_due_at=public.marketplace_next_sync_due_at(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.interval_minutes),updated_at=clock_timestamp() where id=v_schedule.id;
  end loop;
end;
$$;

create or replace function public.marketplace_browser_prepare_work(p_worker_id uuid,p_worker_epoch bigint,p_include_scheduled boolean)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  perform public.marketplace_account_actions_recover(p_worker_id,p_worker_epoch);
  perform public.marketplace_account_actions_purge_history();
  if p_include_scheduled then perform public.marketplace_sync_prepare_scheduled(); end if;
  perform public.marketplace_expire_cloud_listing_attempts();
  update public.marketplace_local_message_outbox m set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=m.cloud_browser_session_id and state='closed'));
  update public.marketplace_local_message_outbox m set state='queued',claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,updated_at=clock_timestamp()
    where execution_mode='cloud' and state='claimed' and exists(select 1 from public.marketplace_browser_sessions where public_id=m.cloud_browser_session_id and state='closed');
  update public.marketplace_local_message_outbox m set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where execution_mode='cloud' and state in ('queued','claimed') and not public.marketplace_cloud_message_permission_valid(workspace_id,connection_id,requested_by,cloud_authorization_version);
  update public.marketplace_negotiation_jobs j set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=j.cloud_browser_session_id and state='closed'));
  update public.marketplace_negotiation_jobs j set state='queued',claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,updated_at=clock_timestamp()
    where execution_mode='cloud' and state='claimed' and exists(select 1 from public.marketplace_browser_sessions where public_id=j.cloud_browser_session_id and state='closed');
  update public.marketplace_favorite_message_events e set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=e.cloud_browser_session_id and state='closed'));
  update public.marketplace_favorite_message_events e set offer_state='outcome_unknown',offer_error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and offer_state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=e.cloud_browser_session_id and state='closed'));
  update public.marketplace_favorite_message_events e set state=case when state='claimed' then 'queued' else state end,offer_state=case when offer_state='claimed' then 'pending' else offer_state end,
    claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,updated_at=clock_timestamp()
    where execution_mode='cloud' and (state='claimed' or offer_state='claimed') and exists(select 1 from public.marketplace_browser_sessions where public_id=e.cloud_browser_session_id and state='closed');
end;
$$;

create or replace function public.marketplace_browser_work_claim(p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid,p_include_scheduled boolean default false,p_enabled_kinds text[] default array['account_action','message','negotiation','listing','favorite_message','favorite_offer','sync'])
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_next jsonb; v_claim jsonb; v_index integer;
begin
  if p_runner_id is null or p_include_scheduled is null or p_enabled_kinds is null or not p_enabled_kinds<@array['account_action','message','negotiation','listing','favorite_message','favorite_offer','sync'] then raise exception 'Ungültige Auftragsauswahl' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  perform public.marketplace_browser_prepare_work(p_worker_id,p_worker_epoch,p_include_scheduled);
  for v_index in 1..128 loop
    v_next:=public.marketplace_browser_next_work(p_include_scheduled,p_enabled_kinds);
    if v_next is null then return null; end if;
    case v_next->>'kind'
      when 'account_action' then v_claim:=public.marketplace_account_action_claim(p_worker_id,p_worker_epoch,p_runner_id,(v_next->>'jobId')::uuid);
      when 'sync' then v_claim:=public.marketplace_sync_dispatch_claim(p_worker_id,p_worker_epoch,p_runner_id,p_include_scheduled,(v_next->>'jobId')::uuid);
      when 'message' then v_claim:=public.marketplace_cloud_message_claim(p_worker_id,p_worker_epoch,p_runner_id,(v_next->>'jobId')::uuid);
      when 'negotiation' then v_claim:=public.marketplace_cloud_negotiation_claim(p_worker_id,p_worker_epoch,p_runner_id,(v_next->>'jobId')::uuid);
      when 'listing' then v_claim:=public.marketplace_cloud_listing_claim(p_worker_id,p_worker_epoch,p_runner_id,v_next->>'jobId');
      when 'favorite_message','favorite_offer' then v_claim:=public.marketplace_cloud_favorite_claim(p_worker_id,p_worker_epoch,p_runner_id,(v_next->>'jobId')::uuid);
    end case;
    if v_claim is not null then return jsonb_build_object('kind',v_next->>'kind','claim',v_claim); end if;
    -- Ein verworfenes Favoritenereignis darf den nächsten gültigen Auftrag nicht blockieren.
    if public.marketplace_browser_job_ready(v_next->>'kind',v_next->>'jobId') then return null; end if;
  end loop;
  return null;
end;
$$;

create or replace function public.marketplace_account_action_guard()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  if row(new.public_id,new.workspace_id,new.connection_id,new.requested_by,new.request_id,new.request_hash,new.kind,new.queue_order,new.created_at,new.is_write,new.reconciliation_action_id)
    is distinct from row(old.public_id,old.workspace_id,old.connection_id,old.requested_by,old.request_id,old.request_hash,old.kind,old.queue_order,old.created_at,old.is_write,old.reconciliation_action_id) then
    raise exception 'Angenommene Anfrage ist unveränderlich' using errcode='22023';
  end if;
  if new.history_purged_at is null and row(new.payload,new.external_account_id,new.provider_profile_id,new.entry_id,new.entry_kind,new.external_id,new.resource_key,new.title)
    is distinct from row(old.payload,old.external_account_id,old.provider_profile_id,old.entry_id,old.entry_kind,old.external_id,old.resource_key,old.title) then
    raise exception 'Angenommener Inhalt ist unveränderlich' using errcode='22023';
  end if;
  if old.history_purged_at is not null and row(new.payload,new.result,new.state,new.history_purged_at) is distinct from row(old.payload,old.result,old.state,old.history_purged_at) then
    raise exception 'Anfragequittung ist unveränderlich' using errcode='22023';
  end if;
  if row(new.state,new.error_code,new.result,new.started_at,new.finished_at,new.history_purged_at)
    is distinct from row(old.state,old.error_code,old.result,old.started_at,old.finished_at,old.history_purged_at) then
    new.version:=old.version+1; new.updated_at:=clock_timestamp();
  else new.version:=old.version; new.updated_at:=old.updated_at;
  end if;
  return new;
end;
$$;
create trigger marketplace_account_action_guard before update on public.marketplace_account_actions for each row execute function public.marketplace_account_action_guard();

create or replace function public.marketplace_revoke_account_actions()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
declare v_workspace uuid; v_connection uuid;
begin
  if tg_table_name='marketplace_connections' then
    if new.execution_mode is not distinct from old.execution_mode and new.external_account_id is not distinct from old.external_account_id and new.status not in ('disconnected','blocked') then return new; end if;
    v_workspace:=new.workspace_id; v_connection:=new.id;
  else
    if tg_op='UPDATE' and new.provider_profile_id is not distinct from old.provider_profile_id then return new; end if;
    v_workspace:=old.workspace_id; v_connection:=old.connection_id;
  end if;
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_account_actions set state=case when state='queued' then 'cancelled' when write_started_at is null then 'failed' else 'outcome_unknown' end,
    error_code='authorization_revoked',finished_at=clock_timestamp(),lease_expires_at=null
    where workspace_id=v_workspace and connection_id=v_connection and kind<>'cloud_setup_open' and state in ('queued','running');
  update public.marketplace_browser_sessions session set state='stopping',stop_reason='interrupted'
    where session.workspace_id=v_workspace and session.connection_id=v_connection and session.account_action_id is not null and session.state='active';
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger marketplace_revoke_account_action_identity after update of execution_mode,external_account_id,status on public.marketplace_connections for each row execute function public.marketplace_revoke_account_actions();
create trigger marketplace_revoke_account_action_profile after update of provider_profile_id or delete on public.marketplace_browser_profiles for each row execute function public.marketplace_revoke_account_actions();

create or replace function public.marketplace_notify_account_actions()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.version=old.version then return new; end if;
  perform realtime.send(jsonb_build_object('workspaceId',new.workspace_id,'connectionId',new.connection_id,'id',new.public_id),
    'account_actions_changed','workspace:'||new.workspace_id::text||':marketplace_account:'||new.connection_id::text,true);
  return new;
end;
$$;
create trigger marketplace_notify_account_actions after insert or update on public.marketplace_account_actions for each row execute function public.marketplace_notify_account_actions();

create or replace function public.marketplace_notify_waiting_account_actions()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
declare v_account record;
begin
  if tg_table_name='marketplace_browser_sessions' and tg_op='UPDATE' then
    if new.state=old.state then return new; end if;
  elsif tg_table_name='marketplace_worker_runtime' and tg_op='UPDATE' then
    if new.broker_capacity=old.broker_capacity and old.broker_capacity_verified_at>clock_timestamp()-interval '45 seconds' then return new; end if;
  end if;
  for v_account in select distinct workspace_id,connection_id from public.marketplace_account_actions where state='queued' loop
    perform realtime.send(jsonb_build_object('workspaceId',v_account.workspace_id,'connectionId',v_account.connection_id),
      'account_actions_changed','workspace:'||v_account.workspace_id::text||':marketplace_account:'||v_account.connection_id::text,true);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger marketplace_notify_waiting_account_sessions after insert or update or delete on public.marketplace_browser_sessions for each row execute function public.marketplace_notify_waiting_account_actions();
create trigger marketplace_notify_waiting_account_capacity after update on public.marketplace_browser_pool_settings for each row execute function public.marketplace_notify_waiting_account_actions();
create trigger marketplace_notify_waiting_account_host_capacity after update on public.marketplace_worker_runtime for each row execute function public.marketplace_notify_waiting_account_actions();
create policy "Kontoverwalter empfangen direkte Cloudaufträge" on realtime.messages for select to authenticated using (
  extension='broadcast' and private and topic=(select realtime.topic()) and exists(select 1 from public.marketplace_connections connection
    where realtime.messages.topic='workspace:'||connection.workspace_id::text||':marketplace_account:'||connection.id::text and public.marketplace_can_manage_cloud(connection.workspace_id))
);

-- Interne Helfer bleiben ausschließlich im geprüften Serverkontext; öffentliche RPCs prüfen die aktuellen Nutzerrechte.
do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (
    p.proname like 'marketplace_account_action%' or p.proname in ('marketplace_set_browser_pool_size','marketplace_browser_capacity_report','marketplace_browser_effective_capacity',
      'marketplace_browser_slot_status','marketplace_cloud_setup_presence','marketplace_browser_dialog_presence','marketplace_browser_queue_entries','marketplace_browser_job_ready','marketplace_browser_next_work',
      'marketplace_browser_job_eligible','marketplace_sync_prepare_scheduled','marketplace_browser_prepare_work','marketplace_browser_work_claim','marketplace_revoke_account_actions','marketplace_notify_account_actions','marketplace_notify_waiting_account_actions')) loop
    execute format('revoke all on function %s from public,anon,authenticated',v_function);
    execute format('grant execute on function %s to service_role',v_function);
  end loop;
end;
$$;
grant execute on function public.marketplace_set_browser_pool_size(integer),public.marketplace_cloud_setup_presence(uuid,uuid,uuid,boolean),
  public.marketplace_browser_dialog_presence(uuid,uuid,uuid,boolean),
  public.marketplace_account_action_enqueue(uuid,uuid,uuid,text,jsonb),public.marketplace_account_action_read(uuid,uuid,uuid),
  public.marketplace_account_action_find(uuid,uuid,uuid),public.marketplace_account_actions_read(uuid,uuid),public.marketplace_account_action_cancel(uuid,uuid,uuid),
  public.marketplace_account_action_reconcile(uuid,uuid,uuid,uuid) to authenticated;
