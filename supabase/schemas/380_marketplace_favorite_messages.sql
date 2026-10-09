-- Kontoweise Favoritennachrichten mit ausdrücklicher Aktivierung und dauerhaftem Versuchsschutz.
create or replace function public.marketplace_favorite_message_config_valid(p_config jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_rule jsonb; v_text jsonb; v_day jsonb; v_offer jsonb;
begin
  if jsonb_typeof(p_config) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_config)) not between 4 and 5
    or exists(select 1 from jsonb_object_keys(p_config) key where key not in ('templates','rules','delayMinutes','timezone','offer'))
    or not p_config ?& array['templates','rules','delayMinutes','timezone']
    or p_config->>'timezone'<>'Europe/Berlin'
    or jsonb_typeof(p_config->'delayMinutes') is distinct from 'number'
    or (p_config->>'delayMinutes')::numeric not between 0 and 10080
    or (p_config->>'delayMinutes')::numeric<>trunc((p_config->>'delayMinutes')::numeric)
    or jsonb_typeof(p_config->'templates') is distinct from 'array'
    or jsonb_array_length(p_config->'templates') not between 1 and 10
    or jsonb_typeof(p_config->'rules') is distinct from 'array' or jsonb_array_length(p_config->'rules')>20 then return false; end if;
  v_offer:=p_config->'offer';
  if v_offer is not null and v_offer<>'null'::jsonb then
    if jsonb_typeof(v_offer) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_offer))<>2
      or not v_offer ?& array['type','value'] or jsonb_typeof(v_offer->'type') is distinct from 'string'
      or v_offer->>'type' not in ('amount','percentage') or jsonb_typeof(v_offer->'value') is distinct from 'number'
      or (v_offer->>'value')::numeric<=0 or (v_offer->>'value')::numeric>1000000
      or (v_offer->>'value')::numeric*100<>trunc((v_offer->>'value')::numeric*100)
      or (v_offer->>'type'='percentage' and (v_offer->>'value')::numeric not between 1 and 50) then return false; end if;
  end if;
  for v_rule in select value from jsonb_array_elements(p_config->'rules') loop
    if jsonb_typeof(v_rule) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_rule))<>7
      or not v_rule ?& array['name','startHour','endHour','days','minPrice','maxPrice','templates']
      or jsonb_typeof(v_rule->'name') is distinct from 'string' or char_length(v_rule->>'name') not between 1 and 80
      or jsonb_typeof(v_rule->'templates') is distinct from 'array' or jsonb_array_length(v_rule->'templates') not between 1 and 10
      or jsonb_typeof(v_rule->'days') is distinct from 'array' or jsonb_array_length(v_rule->'days')>7 then return false; end if;
    if (v_rule->'startHour'='null'::jsonb)<>(v_rule->'endHour'='null'::jsonb) then return false; end if;
    if v_rule->'startHour'<>'null'::jsonb and (
      jsonb_typeof(v_rule->'startHour')<>'number' or jsonb_typeof(v_rule->'endHour')<>'number'
      or (v_rule->>'startHour')::numeric not between 0 and 23 or (v_rule->>'endHour')::numeric not between 0 and 23
      or (v_rule->>'startHour')::numeric<>trunc((v_rule->>'startHour')::numeric)
      or (v_rule->>'endHour')::numeric<>trunc((v_rule->>'endHour')::numeric)
      or v_rule->>'startHour'=v_rule->>'endHour') then return false; end if;
    for v_day in select value from jsonb_array_elements(v_rule->'days') loop
      if jsonb_typeof(v_day)<>'number' or v_day::numeric not between 1 and 7 or v_day::numeric<>trunc(v_day::numeric) then return false; end if;
    end loop;
    if v_rule->'minPrice'<>'null'::jsonb and (jsonb_typeof(v_rule->'minPrice')<>'number' or (v_rule->>'minPrice')::numeric not between 0 and 1000000) then return false; end if;
    if v_rule->'maxPrice'<>'null'::jsonb and (jsonb_typeof(v_rule->'maxPrice')<>'number' or (v_rule->>'maxPrice')::numeric not between 0 and 1000000) then return false; end if;
    if v_rule->'minPrice'<>'null'::jsonb and v_rule->'maxPrice'<>'null'::jsonb and (v_rule->>'minPrice')::numeric>(v_rule->>'maxPrice')::numeric then return false; end if;
  end loop;
  for v_text in select value from jsonb_array_elements(p_config->'templates') union all
    select text.value from jsonb_array_elements(p_config->'rules') rule cross join lateral jsonb_array_elements(rule->'templates') text loop
    if jsonb_typeof(v_text)<>'string' or char_length(btrim(v_text#>>'{}')) not between 1 and 2000
      or (v_text#>>'{}') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.marketplace_favorite_message_config_valid(jsonb) from public,anon;
grant execute on function public.marketplace_favorite_message_config_valid(jsonb) to authenticated,service_role;

create table public.marketplace_favorite_message_settings (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  enabled boolean not null default false,
  config jsonb not null check (public.marketplace_favorite_message_config_valid(config)),
  version bigint not null default 1,
  activated_at timestamptz,
  external_account_id text,
  grant_generation bigint,
  execution_mode text not null default 'local' check(execution_mode in ('local','cloud')),
  approved_by uuid references auth.users(id) on delete cascade,
  cloud_authorization_version bigint,
  last_checked_at timestamptz,
  unique(workspace_id,connection_id),
  foreign key(workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade
);
comment on table public.marketplace_favorite_message_settings is 'Explizite, kontogebundene Freigabe für Favoritennachrichten; Zeiten gelten in Europe/Berlin.';
alter table public.marketplace_favorite_message_settings enable row level security;
revoke all on public.marketplace_favorite_message_settings from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.marketplace_favorite_message_settings to service_role;
revoke all on sequence public.marketplace_favorite_message_settings_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_favorite_message_settings_id_seq to service_role;
create policy "Worker reads favorite message settings" on public.marketplace_favorite_message_settings for select to service_role using(true);
create policy "Worker inserts favorite message settings" on public.marketplace_favorite_message_settings for insert to service_role with check(true);
create policy "Worker updates favorite message settings" on public.marketplace_favorite_message_settings for update to service_role using(true) with check(true);
create policy "Worker deletes favorite message settings" on public.marketplace_favorite_message_settings for delete to service_role using(true);

create table public.marketplace_favorite_message_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  connection_id uuid not null,
  external_id uuid not null,
  actor_id text not null check(actor_id ~ '^[1-9][0-9]{0,31}$'),
  item_id text not null check(item_id ~ '^[1-9][0-9]{0,31}$'),
  event_at timestamptz not null,
  setting_version bigint not null,
  execution_mode text not null default 'local' check(execution_mode in ('local','cloud')),
  external_account_id text,
  cloud_authorization_version bigint,
  cloud_browser_session_id uuid,
  cloud_worker_id uuid,
  cloud_worker_epoch bigint,
  cloud_runner_id uuid,
  cloud_phase text check(cloud_phase in ('message','offer')),
  state text not null default 'queued' check(state in ('queued','claimed','sending','sent','failed','outcome_unknown','skipped','cancelled')),
  message_text text,
  title text not null,
  claim_token uuid,
  lease_expires_at timestamptz,
  external_message_id text,
  offer_config jsonb,
  offer_state text not null default 'not_requested' check(offer_state in ('not_requested','pending','claimed','sending','sent','failed','outcome_unknown','skipped')),
  external_conversation_id text,
  external_transaction_id text,
  offer_price_cents bigint,
  external_offer_id text,
  offer_error_code text,
  error_code text,
  updated_at timestamptz not null default now(),
  unique(workspace_id,connection_id,external_id),
  unique(workspace_id,connection_id,actor_id,item_id),
  foreign key(workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade
);
comment on table public.marketplace_favorite_message_events is 'Favoritenereignis und genau ein dauerhafter Versandversuch pro Interessent/Artikel; unklare Ergebnisse werden nicht automatisch wiederholt.';
create index marketplace_favorite_message_events_queue on public.marketplace_favorite_message_events(workspace_id,connection_id,state,event_at);
create index marketplace_favorite_message_events_sent_message on public.marketplace_favorite_message_events(workspace_id,connection_id,external_message_id) where state='sent' and external_message_id is not null;
create index marketplace_favorite_message_events_offer_queue on public.marketplace_favorite_message_events(workspace_id,connection_id,offer_state,event_at) where state='sent';
alter table public.marketplace_favorite_message_events enable row level security;
revoke all on public.marketplace_favorite_message_events from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.marketplace_favorite_message_events to service_role;
create policy "Worker reads favorite message events" on public.marketplace_favorite_message_events for select to service_role using(true);
create policy "Worker inserts favorite message events" on public.marketplace_favorite_message_events for insert to service_role with check(true);
create policy "Worker updates favorite message events" on public.marketplace_favorite_message_events for update to service_role using(true) with check(true);
create policy "Worker deletes favorite message events" on public.marketplace_favorite_message_events for delete to service_role using(true);

create or replace function public.marketplace_cloud_favorite_settings_valid(p_workspace_id uuid,p_connection_id uuid)
returns boolean language sql volatile security invoker set search_path='' as $$
  select exists(select 1 from public.marketplace_favorite_message_settings settings
    where settings.workspace_id=p_workspace_id and settings.connection_id=p_connection_id and settings.enabled
      and settings.execution_mode='cloud' and settings.cloud_authorization_version is not null
      and public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,settings.approved_by,settings.cloud_authorization_version)
      and settings.external_account_id=(select external_account_id from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id));
$$;
revoke all on function public.marketplace_cloud_favorite_settings_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_settings_valid(uuid,uuid) to service_role;

create or replace function public.marketplace_read_favorite_messages(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_settings public.marketplace_favorite_message_settings; v_events jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'eventAt',e.event_at,'state',case when e.state='sending' and e.lease_expires_at<=now() then 'outcome_unknown' else e.state end,'text',e.message_text,'errorCode',e.error_code,
    'offerState',case when e.offer_state='sending' and e.lease_expires_at<=now() then 'outcome_unknown' else e.offer_state end,'offerPriceCents',e.offer_price_cents,'offerErrorCode',e.offer_error_code) order by e.event_at desc,e.id desc),'[]'::jsonb) into v_events
    from (select * from public.marketplace_favorite_message_events where workspace_id=p_workspace_id and connection_id=p_connection_id order by event_at desc,id desc limit 30) e;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'enabled',coalesce(v_settings.enabled,false),
    'active',public.marketplace_cloud_favorite_settings_valid(p_workspace_id,p_connection_id) or (coalesce(v_settings.enabled,false) and v_settings.execution_mode='local' and exists(select 1 from public.marketplace_local_extension_grants g join public.marketplace_connections c on c.workspace_id=g.workspace_id and c.id=g.connection_id
      where g.workspace_id=p_workspace_id and g.connection_id=p_connection_id and g.revoked_at is null and g.expires_at>now() and g.messages_read and g.messages_send and g.grant_generation=v_settings.grant_generation and g.external_account_id=v_settings.external_account_id and c.external_account_id=g.external_account_id and c.execution_mode='local' and c.status='connected')),
    'config',v_settings.config,'version',coalesce(v_settings.version,0),'lastCheckedAt',v_settings.last_checked_at,'events',v_events);
end;
$$;
revoke all on function public.marketplace_read_favorite_messages(uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_favorite_messages(uuid,uuid) to authenticated;

create or replace function public.marketplace_save_favorite_messages(p_workspace_id uuid,p_connection_id uuid,p_enabled boolean,p_config jsonb,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_settings public.marketplace_favorite_message_settings; v_grant public.marketplace_local_extension_grants; v_connection public.marketplace_connections; v_permission public.marketplace_cloud_message_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid()))
    or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_enabled is null or p_expected_version is null or not public.marketplace_favorite_message_config_valid(p_config) then raise exception 'Ungültige Favoriteneinstellung' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_settings.version,0)<>p_expected_version then raise exception 'Einstellung inzwischen geändert' using errcode='40001'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if p_enabled and v_connection.execution_mode='local' and (v_connection.status<>'connected' or v_grant.id is null or v_grant.approved_by<>(select auth.uid())
    or not v_grant.messages_read or not v_grant.messages_send or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or v_connection.external_account_id is distinct from v_grant.external_account_id) then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  if p_enabled and v_connection.execution_mode='cloud' and not public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid())) then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  insert into public.marketplace_favorite_message_settings(workspace_id,connection_id,enabled,config,version,activated_at,external_account_id,grant_generation,execution_mode,approved_by,cloud_authorization_version)
    values(p_workspace_id,p_connection_id,p_enabled,p_config,1,case when p_enabled then clock_timestamp() end,v_connection.external_account_id,case when v_connection.execution_mode='local' then v_grant.grant_generation end,v_connection.execution_mode,(select auth.uid()),case when v_connection.execution_mode='cloud' then v_permission.authorization_version end)
    on conflict(workspace_id,connection_id) do update set enabled=excluded.enabled,config=excluded.config,version=public.marketplace_favorite_message_settings.version+1,
      activated_at=case when excluded.enabled and (not public.marketplace_favorite_message_settings.enabled or public.marketplace_favorite_message_settings.execution_mode is distinct from excluded.execution_mode or public.marketplace_favorite_message_settings.cloud_authorization_version is distinct from excluded.cloud_authorization_version or public.marketplace_favorite_message_settings.grant_generation is distinct from excluded.grant_generation or public.marketplace_favorite_message_settings.external_account_id is distinct from excluded.external_account_id) then clock_timestamp() else public.marketplace_favorite_message_settings.activated_at end,
      external_account_id=excluded.external_account_id,grant_generation=excluded.grant_generation,execution_mode=excluded.execution_mode,approved_by=excluded.approved_by,cloud_authorization_version=excluded.cloud_authorization_version;
  -- Neue Regeln ändern keinen bereits begonnenen Versuch. Noch wartende Texte werden verworfen.
  update public.marketplace_favorite_message_events set state='cancelled',error_code='settings_changed',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','claimed');
  update public.marketplace_favorite_message_events set offer_state='skipped',offer_error_code='configuration_changed',lease_expires_at=null,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and offer_state in ('pending','claimed');
  return public.marketplace_read_favorite_messages(p_workspace_id,p_connection_id);
end;
$$;
revoke all on function public.marketplace_save_favorite_messages(uuid,uuid,boolean,jsonb,bigint) from public,anon;
grant execute on function public.marketplace_save_favorite_messages(uuid,uuid,boolean,jsonb,bigint) to authenticated;

create or replace function public.marketplace_local_favorites_state(p_workspace_id uuid,p_connection_id uuid,p_token_hash text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_settings public.marketplace_favorite_message_settings;
begin
  -- Der normale Lesepfad bestätigt auch eine deaktivierte Automatik, ohne Schreibrechte auszudehnen.
  perform public.marketplace_local_inbox_state(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,
    'enabled',coalesce(v_settings.enabled,false) and v_settings.execution_mode='local' and v_grant.messages_send and v_settings.external_account_id=v_grant.external_account_id and v_settings.grant_generation=v_grant.grant_generation);
end;
$$;
revoke all on function public.marketplace_local_favorites_state(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorites_state(uuid,uuid,text) to service_role;

create or replace function public.marketplace_record_favorite_events(p_workspace_id uuid,p_connection_id uuid,p_external_account_id text,p_execution_mode text,p_events jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_settings public.marketplace_favorite_message_settings; v_event jsonb; v_publication public.marketplace_account_entries; v_at timestamptz; v_id uuid;
begin
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if not coalesce(v_settings.enabled,false) or v_settings.execution_mode is distinct from p_execution_mode or v_settings.external_account_id is distinct from p_external_account_id then return jsonb_build_object('ok',true,'skipped',true); end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>200 or octet_length(p_events::text)>131072 then raise exception 'Ungültige Favoriten' using errcode='22023'; end if;
  for v_event in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(v_event) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_event))<>4
      or not v_event ?& array['externalId','actorId','itemId','eventAt']
      or jsonb_typeof(v_event->'externalId') is distinct from 'string' or jsonb_typeof(v_event->'eventAt') is distinct from 'string'
      or jsonb_typeof(v_event->'actorId') is distinct from 'string' or jsonb_typeof(v_event->'itemId') is distinct from 'string'
      or v_event->>'actorId' !~ '^[1-9][0-9]{0,31}$' or v_event->>'itemId' !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültiges Favoritenereignis' using errcode='22023'; end if;
    begin v_at:=(v_event->>'eventAt')::timestamptz; v_id:=(v_event->>'externalId')::uuid; exception when others then raise exception 'Ungültiges Favoritenereignis' using errcode='22023'; end;
    if v_at is null or v_id is null or not isfinite(v_at) or v_at>clock_timestamp()+interval '1 minute' then raise exception 'Ungültiges Favoritenereignis' using errcode='22023'; end if;
    if v_at<=v_settings.activated_at or v_event->>'actorId'=p_external_account_id then continue; end if;
    select * into v_publication from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='publication' and external_id=v_event->>'itemId';
    if not found or v_publication.body->'isClosed' is distinct from 'false'::jsonb or v_publication.body->'isReserved'='true'::jsonb then continue; end if;
    insert into public.marketplace_favorite_message_events(workspace_id,connection_id,external_id,actor_id,item_id,event_at,setting_version,title,execution_mode,external_account_id,cloud_authorization_version)
      values(p_workspace_id,p_connection_id,v_id,v_event->>'actorId',v_event->>'itemId',v_at,v_settings.version,coalesce(v_publication.body->>'title','Artikel'),p_execution_mode,p_external_account_id,v_settings.cloud_authorization_version) on conflict do nothing;
  end loop;
  update public.marketplace_favorite_message_settings set last_checked_at=clock_timestamp() where id=v_settings.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_record_favorite_events(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_record_favorite_events(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.marketplace_import_local_favorites(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_events jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_settings public.marketplace_favorite_message_settings;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if v_settings.execution_mode is distinct from 'local' or not coalesce(v_settings.enabled,false) or v_settings.grant_generation is distinct from v_grant.grant_generation or v_settings.external_account_id is distinct from v_grant.external_account_id then return jsonb_build_object('ok',true,'skipped',true); end if;
  return public.marketplace_record_favorite_events(p_workspace_id,p_connection_id,v_grant.external_account_id,'local',p_events);
end;
$$;
revoke all on function public.marketplace_import_local_favorites(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_import_local_favorites(uuid,uuid,text,jsonb) to service_role;

create or replace function public.marketplace_favorite_message_text(p_config jsonb,p_price numeric,p_at timestamptz,p_seed uuid)
returns text language plpgsql stable security invoker set search_path='' as $$
declare v_rule jsonb; v_templates jsonb:=p_config->'templates'; v_local timestamp:=p_at at time zone 'Europe/Berlin'; v_hour integer; v_start integer; v_end integer; v_index integer;
begin
  v_hour:=extract(hour from v_local);
  for v_rule in select value from jsonb_array_elements(p_config->'rules') loop
    v_start:=(v_rule->>'startHour')::integer; v_end:=(v_rule->>'endHour')::integer;
    if v_start is not null and not (case when v_start<v_end then v_hour>=v_start and v_hour<v_end else v_hour>=v_start or v_hour<v_end end) then continue; end if;
    if jsonb_array_length(v_rule->'days')>0 and not (v_rule->'days' @> jsonb_build_array(extract(isodow from v_local)::integer)) then continue; end if;
    if (v_rule->>'minPrice' is not null or v_rule->>'maxPrice' is not null) and p_price is null then continue; end if;
    if p_price<(v_rule->>'minPrice')::numeric or p_price>(v_rule->>'maxPrice')::numeric then continue; end if;
    v_templates:=v_rule->'templates'; exit;
  end loop;
  -- Stabile Auswahl statt eines neuen Zufallstexts bei wiederholter Ergebnismeldung.
  v_index:=get_byte(extensions.digest(p_seed::text,'sha256'),0)%jsonb_array_length(v_templates);
  return v_templates->>v_index;
end;
$$;
revoke all on function public.marketplace_favorite_message_text(jsonb,numeric,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_favorite_message_text(jsonb,numeric,timestamptz,uuid) to service_role;

create or replace function public.marketplace_local_favorite_claim(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_offer_supported boolean)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_settings public.marketplace_favorite_message_settings; v_event public.marketplace_favorite_message_events; v_publication public.marketplace_account_entries; v_text text; v_price numeric;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if v_settings.execution_mode is distinct from 'local' or not coalesce(v_settings.enabled,false) or v_settings.grant_generation<>v_grant.grant_generation or v_settings.external_account_id<>v_grant.external_account_id then return jsonb_build_object('ok',true,'command',null); end if;
  update public.marketplace_favorite_message_events set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp() where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set state='queued',claim_token=null,lease_expires_at=null where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='claimed' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set offer_state='outcome_unknown',offer_error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sent' and offer_state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set offer_state='pending',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sent' and offer_state='claimed' and lease_expires_at<=clock_timestamp();
  if coalesce(p_offer_supported,false) then
    select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id
      and state='sent' and offer_state='pending' and setting_version=v_settings.version order by event_at,id limit 1 for update skip locked;
    if found then
      -- Der bestätigte Text wird bei Wiederaufnahme nie erneut verschickt; sein eigenes Gespräch ist kein Ausschlussgrund.
      update public.marketplace_favorite_message_events set offer_state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
      return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_event.id,'claimToken',v_event.claim_token,'actorId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,
        'offer',v_event.offer_config,'stage','offer','conversationId',v_event.external_conversation_id,'transactionId',v_event.external_transaction_id,'externalMessageId',v_event.external_message_id));
    end if;
  end if;
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='queued' and setting_version=v_settings.version
    and (coalesce(p_offer_supported,false) or v_settings.config->'offer' is null or v_settings.config->'offer'='null'::jsonb)
    and event_at+make_interval(mins=>(v_settings.config->>'delayMinutes')::integer)<=clock_timestamp() order by event_at,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'command',null); end if;
  select * into v_publication from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='publication' and external_id=v_event.item_id;
  if not found or v_publication.body->'isClosed' is distinct from 'false'::jsonb or v_publication.body->'isReserved'='true'::jsonb
    or exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and body->>'partnerId'=v_event.actor_id) then
    update public.marketplace_favorite_message_events set state='skipped',error_code='existing_conversation_or_inactive_item',updated_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'command',null);
  end if;
  if jsonb_typeof(v_publication.body->'price')='number' then v_price:=(v_publication.body->>'price')::numeric; end if;
  v_text:=replace(public.marketplace_favorite_message_text(v_settings.config,v_price,clock_timestamp(),v_event.id),'{article}',v_event.title);
  if char_length(v_text)>2000 then
    update public.marketplace_favorite_message_events set state='failed',error_code='invalid_template',updated_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'command',null);
  end if;
  update public.marketplace_favorite_message_events set state='claimed',message_text=v_text,offer_config=nullif(v_settings.config->'offer','null'::jsonb),claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
  return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_event.id,'claimToken',v_event.claim_token,'actorId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,'offer',v_event.offer_config,'stage','message'));
end;
$$;
revoke all on function public.marketplace_local_favorite_claim(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_claim(uuid,uuid,text,boolean) to service_role;

-- Ältere Erweiterungen erhalten ausschließlich Textaufträge.
create or replace function public.marketplace_local_favorite_claim(p_workspace_id uuid,p_connection_id uuid,p_token_hash text)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select public.marketplace_local_favorite_claim(p_workspace_id,p_connection_id,p_token_hash,false);
$$;
revoke all on function public.marketplace_local_favorite_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_claim(uuid,uuid,text) to service_role;

create or replace function public.marketplace_local_favorite_start(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_event_id uuid,p_claim_token uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and claim_token=p_claim_token for update;
  if not found or v_event.state<>'claimed' or v_event.lease_expires_at<=clock_timestamp() or not coalesce(v_settings.enabled,false) or v_event.setting_version<>v_settings.version
    or v_settings.grant_generation<>v_grant.grant_generation or v_settings.external_account_id<>v_grant.external_account_id then raise exception 'Favoritenfreigabe ungültig' using errcode='42501'; end if;
  update public.marketplace_favorite_message_events set state='sending',lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_local_favorite_start(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_start(uuid,uuid,text,uuid,uuid) to service_role;

create or replace function public.marketplace_local_favorite_finish(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_event_id uuid,p_claim_token uuid,p_outcome text,p_external_message_id text default null,p_error_code text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_event public.marketplace_favorite_message_events;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and claim_token=p_claim_token for update;
  if not found or p_token_hash is distinct from (select token_hash from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id) then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('sent','failed','outcome_unknown','skipped') or (p_outcome='sent' and (p_external_message_id is null or p_external_message_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_message_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiges Favoritenergebnis' using errcode='22023'; end if;
  if v_event.state in ('sent','failed','skipped','outcome_unknown') then
    if v_event.state=p_outcome and v_event.external_message_id is not distinct from p_external_message_id then return jsonb_build_object('ok',true); end if;
    if not (v_event.state='outcome_unknown' and p_outcome='sent') then raise exception 'Ergebnis bereits erfasst' using errcode='23505'; end if;
  elsif v_event.state<>'sending' and not(v_event.state='claimed' and p_outcome in ('failed','outcome_unknown')) then raise exception 'Versand nicht gestartet' using errcode='42501'; end if;
  update public.marketplace_favorite_message_events set state=p_outcome,external_message_id=p_external_message_id,error_code=p_error_code,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_local_favorite_finish(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_finish(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;

-- Dieser Beleg trennt den bestätigten Text vom noch nicht gestarteten Angebot.
create or replace function public.marketplace_local_favorite_message_sent(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_event_id uuid,p_claim_token uuid,p_external_message_id text,p_conversation_id text,p_transaction_id text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_grant public.marketplace_local_extension_grants; v_offer_state text; v_offer_error text;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and claim_token=p_claim_token for update;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if v_event.id is null or v_grant.id is null or p_token_hash is distinct from v_grant.token_hash then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
  if p_external_message_id is null or p_external_message_id !~ '^[1-9][0-9]{0,31}$' or p_conversation_id is null or p_conversation_id !~ '^[1-9][0-9]{0,31}$'
    or (p_transaction_id is not null and p_transaction_id !~ '^[1-9][0-9]{0,31}$') then raise exception 'Ungültiger Nachrichtenbeleg' using errcode='22023'; end if;
  if v_event.state='sent' then
    if v_event.external_message_id is not distinct from p_external_message_id and v_event.external_conversation_id is not distinct from p_conversation_id
      and v_event.external_transaction_id is not distinct from p_transaction_id then return jsonb_build_object('ok',true); end if;
    raise exception 'Ergebnis bereits erfasst' using errcode='23505';
  end if;
  if v_event.state not in ('sending','outcome_unknown') then raise exception 'Versand nicht gestartet' using errcode='42501'; end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  v_offer_state:='not_requested';
  if v_event.offer_config is not null then
    if v_settings.execution_mode is distinct from 'local' or not coalesce(v_settings.enabled,false) or v_settings.version<>v_event.setting_version or v_settings.grant_generation is distinct from v_grant.grant_generation
      or v_settings.external_account_id is distinct from v_grant.external_account_id then v_offer_state:='skipped'; v_offer_error:='configuration_changed';
    elsif p_transaction_id is null then v_offer_state:='skipped'; v_offer_error:='missing_transaction';
    else v_offer_state:='pending'; end if;
  end if;
  update public.marketplace_favorite_message_events set state='sent',external_message_id=p_external_message_id,external_conversation_id=p_conversation_id,external_transaction_id=p_transaction_id,error_code=null,
    offer_state=v_offer_state,offer_error_code=v_offer_error,lease_expires_at=case when v_offer_state='pending' then least(v_grant.expires_at,clock_timestamp()+interval '90 seconds') end,updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_local_favorite_message_sent(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_message_sent(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;

create or replace function public.marketplace_validate_favorite_offer_price(p_offer jsonb,p_original_price_cents bigint,p_offer_price_cents bigint)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare v_expected_price numeric;
begin
  if p_original_price_cents is null or p_original_price_cents not between 1 and 100000000 or p_offer_price_cents is null then raise exception 'Ungültiger Angebotspreis' using errcode='22023'; end if;
  v_expected_price:=case when p_offer->>'type'='amount' then p_original_price_cents-(p_offer->>'value')::numeric*100
    else round(p_original_price_cents*(100-(p_offer->>'value')::numeric)/100) end;
  -- Eigene konservative Grenze: mindestens die Hälfte des aktuellen Preises, keine behauptete offizielle Anbietergrenze.
  if p_offer_price_cents<>v_expected_price or p_offer_price_cents<=0 or p_offer_price_cents>=p_original_price_cents or p_offer_price_cents<ceil(p_original_price_cents::numeric/2) then
    raise exception 'Ungültiger Angebotspreis' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.marketplace_validate_favorite_offer_price(jsonb,bigint,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_validate_favorite_offer_price(jsonb,bigint,bigint) to service_role;

create or replace function public.marketplace_local_favorite_offer_start(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_event_id uuid,p_claim_token uuid,p_original_price_cents bigint,p_offer_price_cents bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_expected_price numeric;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and claim_token=p_claim_token for update;
  if not found or v_event.state<>'sent' or v_event.external_message_id is null or v_event.external_conversation_id is null or v_event.external_transaction_id is null
    or v_event.offer_state not in ('pending','claimed') or v_event.offer_config is null or v_event.lease_expires_at is null or v_event.lease_expires_at<=clock_timestamp()
    or not coalesce(v_settings.enabled,false) or v_event.setting_version<>v_settings.version or v_settings.grant_generation<>v_grant.grant_generation
    or v_settings.external_account_id<>v_grant.external_account_id then raise exception 'Angebotsfreigabe ungültig' using errcode='42501'; end if;
  perform public.marketplace_validate_favorite_offer_price(v_event.offer_config,p_original_price_cents,p_offer_price_cents);
  update public.marketplace_favorite_message_events set offer_state='sending',offer_price_cents=p_offer_price_cents,lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_local_favorite_offer_start(uuid,uuid,text,uuid,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_offer_start(uuid,uuid,text,uuid,uuid,bigint,bigint) to service_role;

create or replace function public.marketplace_local_favorite_offer_finish(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_event_id uuid,p_claim_token uuid,p_outcome text,p_external_offer_id text default null,p_error_code text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_event public.marketplace_favorite_message_events;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and claim_token=p_claim_token for update;
  if not found or p_token_hash is distinct from (select token_hash from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id) then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('sent','failed','outcome_unknown','skipped') or (p_outcome='sent' and (p_external_offer_id is null or p_external_offer_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_offer_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiges Angebotsergebnis' using errcode='22023'; end if;
  if v_event.state<>'sent' or v_event.offer_config is null then raise exception 'Nachricht nicht bestätigt' using errcode='42501'; end if;
  -- Eine abgeschlossene Leseprüfung darf den währenddessen widerrufenen Auftrag bestätigen, aber nicht wiederbeleben.
  if v_event.offer_state='skipped' and v_event.offer_error_code='configuration_changed' and v_event.offer_price_cents is null and p_outcome in ('failed','skipped') then
    return jsonb_build_object('ok',true);
  end if;
  if v_event.offer_state in ('sent','failed','skipped','outcome_unknown') then
    if v_event.offer_state=p_outcome and v_event.external_offer_id is not distinct from p_external_offer_id and v_event.offer_error_code is not distinct from p_error_code then return jsonb_build_object('ok',true); end if;
    if not(v_event.offer_state='outcome_unknown' and p_outcome='sent' and v_event.offer_price_cents is not null) then raise exception 'Ergebnis bereits erfasst' using errcode='23505'; end if;
  elsif v_event.offer_state<>'sending' and not(v_event.offer_state in ('pending','claimed') and p_outcome in ('failed','skipped')) then raise exception 'Angebot nicht gestartet' using errcode='42501'; end if;
  update public.marketplace_favorite_message_events set offer_state=p_outcome,external_offer_id=p_external_offer_id,offer_error_code=p_error_code,lease_expires_at=null,updated_at=clock_timestamp() where id=v_event.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_local_favorite_offer_finish(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_offer_finish(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;
