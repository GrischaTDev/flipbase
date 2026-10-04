-- Lokales Postfach: getrennte Nachrichtenfreigabe, Cursor und atomarer Lesekopie-Import.
-- Betroffene Tabellen: marketplace_local_extension_grants, marketplace_connections,
-- marketplace_account_entries und marketplace_account_sync_sources.
-- Aus dem deklarativen Schema erzeugt; unbeteiligte bestehende Schemaabweichungen entfernt.
-- RPC-Rechte ausdrücklich ergänzt, da der Abgleich öffentliche Defaultrechte nicht vollständig erfasst.

alter table public.marketplace_local_extension_grants add column messages_read boolean default false not null;
alter table public.marketplace_local_extension_grants add column inbox_next_page integer default 1 not null;
alter table public.marketplace_local_extension_grants add constraint marketplace_local_extension_grants_inbox_next_page_check check (inbox_next_page >= 1 and inbox_next_page <= 20);

create or replace function public.marketplace_approve_local_extension(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_expected_external_account_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expected_external_account_id is null or p_expected_external_account_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültige lokale Freigabe' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.status in ('paused','blocked') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_connection.external_account_id is not null and v_connection.external_account_id<>p_expected_external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping'))
    or exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','running','outcome_unknown'))
    or exists(select 1 from public.marketplace_sync_schedules where workspace_id=p_workspace_id and connection_id=p_connection_id and enabled) then raise exception 'Cloudbetrieb muss zuerst beendet werden' using errcode='55P03'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if found and v_grant.revoked_at is null and v_grant.expires_at>clock_timestamp() then
    if v_connection.execution_mode='local' and v_grant.token_hash=p_token_hash and v_grant.approved_by=(select auth.uid()) and v_grant.external_account_id=p_expected_external_account_id then
      return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
    end if;
    raise exception 'Lokale Installation bereits verbunden' using errcode='55P03';
  end if;
  if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  insert into public.marketplace_local_extension_grants(workspace_id,connection_id,approved_by,token_hash,external_account_id,expires_at)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_token_hash,p_expected_external_account_id,clock_timestamp()+interval '24 hours')
    on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,token_hash=excluded.token_hash,external_account_id=excluded.external_account_id,expires_at=excluded.expires_at,last_seen_at=null,revoked_at=null,messages_read=false,inbox_next_page=1 returning * into v_grant;
  update public.marketplace_connections set external_account_id=p_expected_external_account_id,execution_mode='local',status='needs_login',resume_status=null,capabilities='{}'::jsonb,updated_at=clock_timestamp() where id=p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at);
end;
$function$;

create function public.marketplace_approve_local_inbox(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_expected_external_account_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expected_external_account_id is null or p_expected_external_account_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültige Freigabe' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') or v_connection.external_account_id is distinct from p_expected_external_account_id then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if not found or v_grant.token_hash<>p_token_hash or v_grant.approved_by<>(select auth.uid()) or v_grant.external_account_id<>p_expected_external_account_id or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp() then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_local_extension_grants set messages_read=true where id=v_grant.id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',true);
end;
$function$;

create function public.marketplace_import_local_inbox(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_batch jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_parent uuid; v_existing public.marketplace_account_entries; v_conversations integer:=0; v_messages integer:=0; v_page integer; v_next_page integer; v_complete boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_batch))<>6
    or exists(select 1 from jsonb_object_keys(p_batch) field where field<>all(array['identity','observedAt','page','nextPage','conversationsComplete','entries']))
    or octet_length(p_batch::text)>524288 or jsonb_typeof(p_batch->'identity') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_batch->'identity'))<>1 or p_batch->'identity'->>'id' is distinct from v_grant.external_account_id
    or jsonb_typeof(p_batch->'entries') is distinct from 'array' or jsonb_array_length(p_batch->'entries')>220
    or jsonb_typeof(p_batch->'conversationsComplete') is distinct from 'boolean'
    or jsonb_typeof(p_batch->'page') is distinct from 'number' or jsonb_typeof(p_batch->'nextPage') is distinct from 'number'
    or jsonb_typeof(p_batch->'observedAt') is distinct from 'string' then raise exception 'Ungültiger Inboximport' using errcode='22023'; end if;
  begin v_observed:=(p_batch->>'observedAt')::timestamptz; v_page:=(p_batch->>'page')::integer; v_next_page:=(p_batch->>'nextPage')::integer;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'Ungültiger Inboximport' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('conversations','messages')),'-infinity')
    or v_page<>v_grant.inbox_next_page or v_page not between 1 and 20 or v_next_page not between 1 and 20
    or (v_next_page<>1 and v_next_page<>v_page+1) then raise exception 'Veralteter Inboximport' using errcode='22023'; end if;
  v_complete:=(p_batch->>'conversationsComplete')::boolean;
  if exists(select 1 from jsonb_array_elements(p_batch->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Doppelte Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_batch->'entries') order by (value->>'kind'='message') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or jsonb_typeof(v_entry->'body') is distinct from 'object'
      or v_entry->>'kind' not in ('conversation','message') or v_entry->>'kind' is null
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^(?:[1-9][0-9]{0,31}|event:[0-9a-f]{64})$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry) field where field<>all(array['kind','externalId','parentExternalId','sortAt','body']))
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='conversation' then array['title','text','occurredAt','sourceUpdatedAt','detailCheckedAt','unread','imageUrl'] else array['title','text','occurredAt','direction','messageType','priceLabel'] end))
      or jsonb_typeof(v_entry->'body'->'title') is distinct from 'string' or char_length(v_entry->'body'->>'title') not between 1 and 500
      or jsonb_typeof(v_entry->'body'->'text') is distinct from 'string' and jsonb_typeof(v_entry->'body'->'text') is distinct from 'null'
      or char_length(v_entry->'body'->>'text')>10000
      or jsonb_typeof(v_entry->'body'->'occurredAt') is distinct from 'string' then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) or not isfinite((v_entry->'body'->>'occurredAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    if v_entry->>'kind'='conversation' then
      v_conversations:=v_conversations+1;
      if v_conversations>20 or v_entry ? 'parentExternalId' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
        or (select count(*) from jsonb_object_keys(v_entry->'body'))<>7
        or jsonb_typeof(v_entry->'body'->'sourceUpdatedAt') is distinct from 'string'
        or jsonb_typeof(v_entry->'body'->'detailCheckedAt') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'unread') not in ('boolean','null')
        or jsonb_typeof(v_entry->'body'->'imageUrl') not in ('string','null') then raise exception 'Ungültiges Gespräch' using errcode='22023'; end if;
      begin
        if not isfinite((v_entry->'body'->>'sourceUpdatedAt')::timestamptz)
          or (v_entry->'body'->>'detailCheckedAt' is not null and not isfinite((v_entry->'body'->>'detailCheckedAt')::timestamptz)) then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end if;
      exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'externalId' for update;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'conversation',v_entry->>'externalId',
          case when v_existing.id is not null and v_existing.body->>'sourceUpdatedAt'=v_entry->'body'->>'sourceUpdatedAt' and v_entry->'body'->>'detailCheckedAt' is null
            then v_entry->'body' || jsonb_build_object('text',v_existing.body->'text','occurredAt',v_existing.body->'occurredAt','detailCheckedAt',v_existing.body->'detailCheckedAt') else v_entry->'body' end,
          (v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    else
      v_messages:=v_messages+1;
      if v_messages>200 or jsonb_typeof(v_entry->'parentExternalId') is distinct from 'string' or v_entry->>'parentExternalId' !~ '^[1-9][0-9]{0,31}$'
        or (select count(*) from jsonb_object_keys(v_entry->'body'))<>6
        or not exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation' and e->>'externalId'=v_entry->>'parentExternalId')
        or v_entry->'body'->>'direction' not in ('inbound','outbound','unknown')
        or jsonb_typeof(v_entry->'body'->'messageType') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'priceLabel') not in ('string','null') then raise exception 'Ungültige Nachricht' using errcode='22023'; end if;
      select id into v_parent from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'parentExternalId';
      if v_parent is null then raise exception 'Nachricht ohne Gespräch' using errcode='22023'; end if;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='message' and external_id=v_entry->>'externalId' for update;
      if v_existing.id is not null and v_existing.parent_id<>v_parent then raise exception 'Nachricht mit anderem Gespräch' using errcode='22023'; end if;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'message',v_entry->>'externalId',v_parent,v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at where public.marketplace_account_entries.parent_id=excluded.parent_id;
    end if;
  end loop;
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
    values(p_workspace_id,p_connection_id,'conversations',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end),
      (p_workspace_id,p_connection_id,'messages','partial',v_observed,v_observed,null)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  update public.marketplace_connections set capabilities=capabilities || '{"conversations.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set inbox_next_page=v_next_page,last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'observedAt',v_observed,'counts',jsonb_build_object('conversation',v_conversations,'message',v_messages),'conversationsComplete',v_complete,'nextPage',v_next_page);
end;
$function$;

create or replace function public.marketplace_ingest_local_extension(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_snapshot jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_count integer:=0; v_complete boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or (v_connection.external_account_id is not null and v_connection.external_account_id<>v_grant.external_account_id) then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if p_snapshot is null then
    update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
    return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',v_grant.messages_read);
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>524288
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object' or p_snapshot->'identity'->>'id' is distinct from v_grant.external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array' or jsonb_array_length(p_snapshot->'entries')>501
    or jsonb_typeof(p_snapshot->'publicationsComplete') is distinct from 'boolean' or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or jsonb_typeof(p_snapshot->'identity'->'username') is distinct from 'string' or char_length(p_snapshot->'identity'->>'username') not between 1 and 120 then raise exception 'Ungültiger lokaler Import' using errcode='22023'; end if;
  begin v_observed:=(p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Abrufzeit' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('profile','publications')),'-infinity') then raise exception 'Veralteter Import' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind'='profile')<>1
    or exists(select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Ungültige Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or v_entry->>'kind' is null or v_entry->>'kind' not in ('profile','publication')
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='profile' then array['username','displayName','location','bio','bioState','imageUrl','feedbackCount','feedbackReputation','positiveFeedbackCount','neutralFeedbackCount','negativeFeedbackCount','itemCount','observedAt'] else array['title','text','textState','occurredAt','price','currency','status','imageUrl','imageUrls','metrics','promoted','brand','size','priceLabel','isClosed','isReserved'] end))
      or (v_entry->>'kind'='profile' and (v_entry->>'externalId'<>v_grant.external_account_id or v_entry->'body'->>'username' is distinct from p_snapshot->'identity'->>'username')) then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_entry->>'kind',v_entry->>'externalId',v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
      on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    if v_entry->>'kind'='publication' then v_count:=v_count+1; end if;
  end loop;
  v_complete:=(p_snapshot->>'publicationsComplete')::boolean;
  -- Auch vollständige lokale Lesekopien löschen niemals Anzeigen oder interpretieren fehlende Datensätze als Verkauf.
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
    values(p_workspace_id,p_connection_id,'profile','complete',v_observed,v_observed,v_observed),
      (p_workspace_id,p_connection_id,'publications',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,
      last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  update public.marketplace_connections set external_account_id=v_grant.external_account_id,status='connected',capabilities=capabilities || '{"profile.read":"verified","listings.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  -- Der bestehende Connection-Trigger sendet account_imported mit last_synced_at.
  return jsonb_build_object('ok',true,'counts',jsonb_build_object('profile',1,'publication',v_count),'observedAt',v_observed);
end;
$function$;

create or replace function public.marketplace_list_connections(p_workspace_id uuid)
 returns jsonb
 language plpgsql
 STABLE
 set search_path to ''
as $function$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  return jsonb_build_object('canManage', true, 'connections', coalesce((
    select jsonb_agg(jsonb_build_object(
      'workspaceId', c.workspace_id, 'connectionId', c.id, 'marketplace', c.marketplace,
      'displayName', c.display_name, 'externalAccountId', c.external_account_id,
      'status', c.status, 'executionMode', c.execution_mode, 'capabilities', c.capabilities,
      'allowedActions', case when c.execution_mode = 'local' then
        jsonb_build_array('profile.read', 'listings.read') || case when c.capabilities->>'conversations.read' = 'verified' then jsonb_build_array('conversations.read') else '[]'::jsonb end
        else jsonb_build_array('profile.read', 'listings.read', 'metrics.read', 'conversations.read', 'messages.sendText', 'listings.update', 'listings.publish', 'sales.read') end,
      'lastSyncedAt', c.last_synced_at
    ) order by c.created_at, c.id) from public.marketplace_connections c
    where c.workspace_id = p_workspace_id and c.marketplace = 'vinted'
  ), '[]'::jsonb));
end;
$function$;

create function public.marketplace_local_inbox_state(p_workspace_id uuid, p_connection_id uuid, p_token_hash text)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_versions jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('externalId',e.external_id,'sourceUpdatedAt',e.body->>'sourceUpdatedAt',
    'detailCheckedAt',e.body->>'detailCheckedAt','text',e.body->>'text','occurredAt',e.body->>'occurredAt') order by e.sort_at desc,e.id desc),'[]'::jsonb)
    into v_versions from (select * from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' order by sort_at desc,id desc limit 400) e;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',true,'nextPage',v_grant.inbox_next_page,'versions',v_versions);
end;
$function$;

create or replace function public.marketplace_read_local_extension(p_workspace_id uuid, p_connection_id uuid)
 returns jsonb
 language plpgsql
 STABLE SECURITY DEFINER
 set search_path to ''
as $function$
declare v_grant public.marketplace_local_extension_grants;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('binding',case when v_grant.id is null then null else jsonb_build_object('externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'lastSeenAt',v_grant.last_seen_at,'revoked',v_grant.revoked_at is not null,'messagesRead',v_grant.messages_read) end);
end;
$function$;

revoke all on function public.marketplace_approve_local_inbox(uuid,uuid,text,text) from public,anon;
grant execute on function public.marketplace_approve_local_inbox(uuid,uuid,text,text) to authenticated;
revoke all on function public.marketplace_local_inbox_state(uuid,uuid,text),public.marketplace_import_local_inbox(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_local_inbox_state(uuid,uuid,text),public.marketplace_import_local_inbox(uuid,uuid,text,jsonb) to service_role;
