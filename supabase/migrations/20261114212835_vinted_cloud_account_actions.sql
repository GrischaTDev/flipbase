-- Dauerhafte Vinted-Cloudaktionen und kontogebundene parallele Browserausführung.
-- Betroffen: marketplace_connections, marketplace_browser_sessions, marketplace_worker_runtime,
-- marketplace_cloud_setups und bestehende Abgleich-, Nachrichten-, Verhandlungs-, Inserat- und Favoritenaufträge.
-- Neue Tabellen: marketplace_account_actions und marketplace_browser_pool_settings.
-- Destruktiv: Alte Claim-Signaturen entfallen zugunsten der gezielten gemeinsamen Vergabe;
-- wartende Aufträge und ihre ursprüngliche Reihenfolge bleiben erhalten.
-- Alle Sperren werden vorab gemeinsam erworben; ein Fehlversuch gibt die bereits gehaltenen Sperren frei.
do $$
declare v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      lock table auth.users, public.workspaces, public.marketplace_connections,
        public.marketplace_account_entries, public.marketplace_browser_profiles,
        public.marketplace_browser_sessions, public.marketplace_worker_runtime,
        public.marketplace_cloud_setups, public.marketplace_operations,
        public.marketplace_local_message_outbox, public.marketplace_negotiation_jobs,
        public.marketplace_listing_jobs, public.marketplace_favorite_message_events, realtime.messages
        in access exclusive mode nowait;
      exit;
    exception when lock_not_available then
      if v_attempt >= 600 then
        raise exception 'Die Marktplatztabellen waren 120 Sekunden lang nicht frei.' using errcode='55P03';
      end if;
      perform pg_catalog.pg_sleep(0.2);
    end;
  end loop;
end;
$$;

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

drop function public.marketplace_cloud_favorite_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid);

drop function public.marketplace_cloud_listing_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid);

drop function public.marketplace_cloud_message_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid);

drop function public.marketplace_cloud_negotiation_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid);

drop function public.marketplace_sync_dispatch_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid, p_include_scheduled boolean);

create sequence public.marketplace_browser_queue_order;

grant all on sequence public.marketplace_browser_queue_order to service_role;

create function public.marketplace_account_action_begin_write (
  p_action_id    uuid,
  p_claim_token  uuid,
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  if public.marketplace_account_action_check(p_action_id,p_claim_token,p_worker_id,p_worker_epoch,p_runner_id,false)->>'active'<>'true' then return false; end if;
  update public.marketplace_account_actions set write_started_at=coalesce(write_started_at,clock_timestamp()) where public_id=p_action_id and is_write;
  return found;
end;
$function$;

revoke all on function public.marketplace_account_action_begin_write(uuid, uuid, uuid, bigint, uuid) from public;

grant all on function public.marketplace_account_action_begin_write(uuid, uuid, uuid, bigint, uuid) to service_role;

create function public.marketplace_account_action_cancel (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_action_id     uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_action_cancel(uuid, uuid, uuid) from public;

grant all on function public.marketplace_account_action_cancel(uuid, uuid, uuid) to authenticated;

grant all on function public.marketplace_account_action_cancel(uuid, uuid, uuid) to service_role;

create function public.marketplace_account_action_check (
  p_action_id    uuid,
  p_claim_token  uuid,
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_renew        boolean default false
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_action_check(uuid, uuid, uuid, bigint, uuid, boolean) from public;

grant all on function public.marketplace_account_action_check(uuid, uuid, uuid, bigint, uuid, boolean) to service_role;

create function public.marketplace_account_action_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_target_id    uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_action_claim(uuid, bigint, uuid, uuid) from public;

grant all on function public.marketplace_account_action_claim(uuid, bigint, uuid, uuid) to service_role;

create function public.marketplace_account_action_enqueue (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_request_id    uuid,
  p_kind          text,
  p_payload       jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_action_enqueue(uuid, uuid, uuid, text, jsonb) from public;

grant all on function public.marketplace_account_action_enqueue(uuid, uuid, uuid, text, jsonb) to authenticated;

grant all on function public.marketplace_account_action_enqueue(uuid, uuid, uuid, text, jsonb) to service_role;

create function public.marketplace_account_action_find (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_request_id    uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_action public.marketplace_account_actions;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_action from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id and requested_by=(select auth.uid());
  return jsonb_build_object('action',case when found then public.marketplace_account_action_public(v_action) else null end);
end;
$function$;

revoke all on function public.marketplace_account_action_find(uuid, uuid, uuid) from public;

grant all on function public.marketplace_account_action_find(uuid, uuid, uuid) to authenticated;

grant all on function public.marketplace_account_action_find(uuid, uuid, uuid) to service_role;

create function public.marketplace_account_action_finish (
  p_action_id    uuid,
  p_claim_token  uuid,
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_state        text,
  p_result       jsonb  default null::jsonb,
  p_error_code   text   default null::text
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_action_finish(uuid, uuid, uuid, bigint, uuid, text, jsonb, text) from public;

grant all on function public.marketplace_account_action_finish(uuid, uuid, uuid, bigint, uuid, text, jsonb, text) to service_role;

create function public.marketplace_account_action_guard()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_action_guard() from public;

grant all on function public.marketplace_account_action_guard() to service_role;

create function public.marketplace_account_action_read (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_action_id     uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_action public.marketplace_account_actions;
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_action from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and public_id=p_action_id;
  if not found then raise exception 'Auftrag nicht gefunden' using errcode='22023'; end if;
  return jsonb_build_object('action',public.marketplace_account_action_public(v_action));
end;
$function$;

revoke all on function public.marketplace_account_action_read(uuid, uuid, uuid) from public;

grant all on function public.marketplace_account_action_read(uuid, uuid, uuid) to authenticated;

grant all on function public.marketplace_account_action_read(uuid, uuid, uuid) to service_role;

create function public.marketplace_account_action_reconcile (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_action_id     uuid,
  p_request_id    uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  return public.marketplace_account_action_enqueue(p_workspace_id,p_connection_id,p_request_id,'outcome_reconcile',jsonb_build_object('actionId',p_action_id));
end;
$function$;

revoke all on function public.marketplace_account_action_reconcile(uuid, uuid, uuid, uuid) from public;

grant all on function public.marketplace_account_action_reconcile(uuid, uuid, uuid, uuid) to authenticated;

grant all on function public.marketplace_account_action_reconcile(uuid, uuid, uuid, uuid) to service_role;

create function public.marketplace_account_action_retry (
  p_action_id    uuid,
  p_claim_token  uuid,
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_error_code   text
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare v_action public.marketplace_account_actions;
begin
  if p_error_code is null or p_error_code not in ('network','browser_unavailable','timeout','begin_unconfirmed') then return false; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_action from public.marketplace_account_actions where public_id=p_action_id and claim_token=p_claim_token and worker_id=p_worker_id and worker_epoch=p_worker_epoch and runner_id=p_runner_id and state='running' for update;
  if not found or v_action.write_started_at is not null or v_action.attempts>=3 or not public.marketplace_account_action_authorized(v_action)
    or not exists(select 1 from public.marketplace_browser_sessions where public_id=v_action.browser_session_id and state='closed') then return false; end if;
  update public.marketplace_account_actions set state='queued',claim_token=null,worker_id=null,worker_epoch=null,runner_id=null,browser_session_id=null,
    lease_expires_at=null,absolute_expires_at=null,error_code=null,started_at=null,finished_at=null where id=v_action.id;
  return true;
end;
$function$;

revoke all on function public.marketplace_account_action_retry(uuid, uuid, uuid, bigint, uuid, text) from public;

grant all on function public.marketplace_account_action_retry(uuid, uuid, uuid, bigint, uuid, text) to service_role;

create function public.marketplace_account_action_user_authorized (
  p_workspace_id uuid,
  p_user_id      uuid
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.workspace_access_is_valid(p_workspace_id) then return false; end if;
  perform 1 from auth.users where id=p_user_id and not is_anonymous and (banned_until is null or banned_until<=clock_timestamp()) for share;
  return found;
end;
$function$;

revoke all on function public.marketplace_account_action_user_authorized(uuid, uuid) from public;

grant all on function public.marketplace_account_action_user_authorized(uuid, uuid) to service_role;

create function public.marketplace_account_actions_purge_history (
  p_limit integer default 200
)
  returns integer
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_actions_purge_history(integer) from public;

grant all on function public.marketplace_account_actions_purge_history(integer) to service_role;

create function public.marketplace_account_actions_read (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_actions_read(uuid, uuid) from public;

grant all on function public.marketplace_account_actions_read(uuid, uuid) to authenticated;

grant all on function public.marketplace_account_actions_read(uuid, uuid) to service_role;

create function public.marketplace_account_actions_recover (
  p_worker_id    uuid,
  p_worker_epoch bigint
)
  returns integer
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_actions_recover(uuid, bigint) from public;

grant all on function public.marketplace_account_actions_recover(uuid, bigint) to service_role;

create or replace function public.marketplace_apply_vinted_import (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid,
  p_user_id       uuid,
  p_snapshot      jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_connection public.marketplace_connections;
  v_session public.marketplace_browser_sessions;
  v_observed_at timestamptz;
  v_entry jsonb;
  v_area text;
  v_status text;
  v_failure text;
  v_kind text;
  v_parent_id uuid;
  v_body jsonb;
  v_old_feedback jsonb;
  v_counts jsonb := '{"profile":0,"publication":0,"conversation":0,"message":0,"sale":0}';
begin
  if not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(91731, 1);
  -- Gleiche Sperrreihenfolge wie die bestehenden Browser-RPCs: Konto, dann Sitzung.
  select * into v_connection from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found or v_connection.execution_mode <> 'cloud' or v_connection.status <> 'connected' then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = p_user_id for update;
  if not found or v_session.state <> 'active' or v_session.expires_at <= clock_timestamp() then
    raise exception 'Sitzungszugriff verweigert' using errcode = '42501';
  end if;
  -- Alte manuelle Sitzungen bleiben während des getrennten Worker-Rollouts nutzbar.
  if v_session.worker_epoch is not null and not exists (
    select 1 from public.marketplace_worker_runtime where worker_id = v_session.worker_id
      and worker_epoch = v_session.worker_epoch and expires_at > clock_timestamp()
  ) then raise exception 'Worker nicht mehr aktiv' using errcode = '42501'; end if;
  if v_session.account_action_id is not null and not exists (
    select 1 from public.marketplace_account_actions action where action.public_id=v_session.account_action_id
      and action.browser_session_id=v_session.public_id and action.kind='conversations_read' and action.state='running'
      and action.workspace_id=p_workspace_id and action.connection_id=p_connection_id and action.requested_by=p_user_id
      and action.worker_id=v_session.worker_id and action.worker_epoch=v_session.worker_epoch
      and public.marketplace_account_action_check(action.public_id,action.claim_token,action.worker_id,action.worker_epoch,action.runner_id,false)->>'active'='true'
      and jsonb_typeof(p_snapshot->'entries')='array' and not exists(
        select 1 from jsonb_array_elements(p_snapshot->'entries') entry where entry->>'kind' not in ('profile','conversation','message')
          or (entry->>'kind'='conversation' and entry->>'externalId' is distinct from action.external_id)
          or (entry->>'kind'='message' and entry->>'parentExternalId' is distinct from action.external_id))
  ) then raise exception 'Auftragsgebundener Importzugriff verweigert' using errcode='42501'; end if;
  if v_session.operation_id is not null and not exists (
    select 1 from public.marketplace_operations o
      left join public.marketplace_sync_schedules s on s.id=o.schedule_id and s.workspace_id=o.workspace_id and s.connection_id=o.connection_id
    where o.id=v_session.operation_id and o.browser_session_id=v_session.public_id and o.state='running'
      and o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.requested_by=p_user_id
      and o.worker_epoch=v_session.worker_epoch and o.authorization_version=1 and o.lease_expires_at>clock_timestamp()
      and (o.authorization_kind='manual_read' or (o.authorization_kind='scheduled_read' and s.enabled
        and s.authorization_version=o.schedule_authorization_version and s.activated_by=o.requested_by))
  ) then raise exception 'Auftragsfreigabe widerrufen' using errcode='42501'; end if;
  -- Lesesperren verhindern Rechteentzug zwischen Prüfung und abschließendem Schreiben.
  perform 1 from public.platform_operators where user_id = p_user_id for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object'
    or p_snapshot->'identity'->>'id' is distinct from v_connection.external_account_id then
    raise exception 'Kontoidentität stimmt nicht überein' using errcode = '42501';
  end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'areas') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or (p_snapshot ? 'rejectedSaleIds' and jsonb_typeof(p_snapshot->'rejectedSaleIds') is distinct from 'array') then
    raise exception 'Ungültiger Import' using errcode = '22023';
  end if;
  begin
    v_observed_at := (p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Ungültige Abrufzeit' using errcode = '22023';
  end;
  if not isfinite(v_observed_at) or v_observed_at <= (
    select max(observed_at) from public.marketplace_account_sync_sources where workspace_id = p_workspace_id and connection_id = p_connection_id
  ) then raise exception 'Veralteter Import' using errcode = '22023'; end if;

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    v_failure := p_snapshot->'areas'->v_area->>'failure';
    if jsonb_typeof(p_snapshot->'areas'->v_area) is distinct from 'object'
      or v_status is null or v_status not in ('complete','partial','failed')
      or (v_failure is not null and v_failure not in ('unauthorized','forbidden','rate_limited','provider_unavailable','invalid_response','timeout','network','browser_context'))
      or (v_status = 'failed' and v_failure is null) or (v_area = 'profile' and v_status <> 'complete') then
      raise exception 'Ungültiger Quellenstatus' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'profile') <> 1
    or exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*) > 1) then
    raise exception 'Profil oder eindeutige Einträge fehlen' using errcode = '22023';
  end if;
  select body->'feedbacks' into v_old_feedback from public.marketplace_account_entries
    where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'profile';

  -- Gleiche Kontosperre und Einstellungsfassung für Ausgangsbasis und alle
  -- tatsächlich übernommenen Inserate dieses Batches.
  perform public.marketplace_prepare_favorite_import(p_workspace_id,p_connection_id,v_observed_at);

  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') order by (value->>'kind' = 'message') loop
    v_kind := v_entry->>'kind';
    v_area := case v_kind when 'profile' then 'profile' when 'publication' then 'publications' when 'conversation' then 'conversations' when 'message' then 'messages' when 'sale' then 'sales' end;
    if v_area is null or jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or char_length(v_entry->>'externalId') not between 1 and 256
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or p_snapshot->'areas'->v_area->>'status' = 'failed'
      or (v_kind = 'profile' and v_entry->>'externalId' is distinct from v_connection.external_account_id)
      or (v_kind <> 'message' and v_entry ? 'parentExternalId') then
      raise exception 'Ungültiger Kontoeintrag' using errcode = '22023';
    end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode = '22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ungültige Eintragszeit' using errcode = '22023';
    end;
    v_parent_id := null;
    if v_kind = 'message' then
      select id into v_parent_id from public.marketplace_account_entries
        where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'conversation' and external_id = v_entry->>'parentExternalId';
      if v_parent_id is null or (p_snapshot->'areas'->'conversations'->>'status' = 'complete' and not exists (
        select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'conversation' and e->>'externalId' = v_entry->>'parentExternalId'
      )) then raise exception 'Nachricht ohne Kontogespräch' using errcode = '22023'; end if;
    end if;
    v_body := v_entry->'body';
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' <> 'failed' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Bewertungen' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_array_elements(v_body->'feedbacks') feedback where jsonb_typeof(feedback) <> 'object'
        or jsonb_typeof(feedback->'id') is distinct from 'string' or char_length(feedback->>'id') not between 1 and 256) then
        raise exception 'Ungültige Bewertungskennung' using errcode = '22023';
      end if;
    end if;
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'failed' then
      v_body := (v_body - 'feedbacks') || case when v_old_feedback is null then '{}'::jsonb else jsonb_build_object('feedbacks',v_old_feedback) end;
    elsif v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'partial' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Teilbewertungen' using errcode = '22023'; end if;
      v_body := jsonb_set(v_body,'{feedbacks}',coalesce((
        select jsonb_agg(merged.value order by merged.position) from (
          select distinct on (source.value->>'id') source.value, source.position from (
            select value, ordinality as position from jsonb_array_elements(v_body->'feedbacks') with ordinality
            union all
            select value, ordinality + jsonb_array_length(v_body->'feedbacks') from jsonb_array_elements(coalesce(v_old_feedback,'[]')) with ordinality
          ) source order by source.value->>'id',source.position
        ) merged
      ),'[]'::jsonb));
    end if;
    if v_kind='publication' and not public.marketplace_relisting_import_allowed(p_workspace_id,p_connection_id,v_entry->>'externalId') then continue; end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_kind,v_entry->>'externalId',v_parent_id,v_body,(v_entry->>'sortAt')::timestamptz,v_observed_at)
      on conflict (workspace_id,connection_id,kind,external_id) do update
        set parent_id = excluded.parent_id,body = excluded.body,sort_at = excluded.sort_at,observed_at = excluded.observed_at
        where public.marketplace_account_entries.observed_at <= excluded.observed_at;
    if found then
      v_counts := jsonb_set(v_counts,array[v_kind],to_jsonb((v_counts->>v_kind)::int + 1));
      if v_kind='publication' then perform public.marketplace_accept_relisting_import(p_workspace_id,p_connection_id,v_entry->>'externalId',v_observed_at); end if;
    end if;
  end loop;

  -- Nur nachweislich vollständige Listen dürfen fehlende alte Einträge entfernen.
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.observed_at < v_observed_at and a.kind in ('publication','conversation')
    and (a.kind<>'publication' or public.marketplace_relisting_import_allowed(p_workspace_id,p_connection_id,a.external_id,true))
    and not exists (select 1 from public.marketplace_account_entries child where child.parent_id = a.id and child.observed_at >= v_observed_at)
    and p_snapshot->'areas'->(case a.kind when 'publication' then 'publications' else 'conversations' end)->>'status' = 'complete'
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = a.kind and e->>'externalId' = a.external_id);
  if exists (select 1 from jsonb_array_elements(coalesce(p_snapshot->'rejectedSaleIds','[]')) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 256)
    or (jsonb_array_length(coalesce(p_snapshot->'rejectedSaleIds','[]')) > 0 and p_snapshot->'areas'->'sales'->>'status' = 'failed') then
    raise exception 'Ungültige Verkaufsbereinigung' using errcode = '22023';
  end if;
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.kind = 'sale' and a.body->>'saleState' is null and a.observed_at < v_observed_at and a.external_id in (select jsonb_array_elements_text(coalesce(p_snapshot->'rejectedSaleIds','[]')))
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'sale' and e->>'externalId' = a.external_id);

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,failure,observed_at,last_success_at,last_complete_at)
      values(p_workspace_id,p_connection_id,v_area,v_status,p_snapshot->'areas'->v_area->>'failure',v_observed_at,
        case when v_status <> 'failed' then v_observed_at end,case when v_status = 'complete' then v_observed_at end)
      on conflict (workspace_id,connection_id,area) do update set status = excluded.status,failure = excluded.failure,observed_at = excluded.observed_at,
        last_success_at = coalesce(excluded.last_success_at,public.marketplace_account_sync_sources.last_success_at),
        last_complete_at = coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  end loop;
  if not exists (select 1 from jsonb_each(p_snapshot->'areas') a where a.value->>'status' = 'failed') then
    update public.marketplace_connections set last_synced_at = v_observed_at where id = p_connection_id and (last_synced_at is null or last_synced_at < v_observed_at);
  end if;
  if v_session.expires_at <= clock_timestamp() then raise exception 'Sitzung während des Imports abgelaufen' using errcode = '42501'; end if;
  perform public.marketplace_finalize_favorite_import(p_workspace_id,p_connection_id,v_observed_at,p_snapshot->'areas'->'publications'->>'status' <> 'failed');
  if p_snapshot ? 'favoriteEvents' and public.marketplace_cloud_favorite_settings_valid(p_workspace_id,p_connection_id) then
    perform public.marketplace_record_favorite_events(p_workspace_id,p_connection_id,v_connection.external_account_id,'cloud',p_snapshot->'favoriteEvents');
  end if;
  if p_snapshot ? 'inboxEvents' then
    if (p_snapshot->'inboxEvents'->>'observedAt')::timestamptz is distinct from v_observed_at then raise exception 'Ungültiger Eingangsstand' using errcode='22023'; end if;
    perform public.marketplace_record_message_event_batch(p_workspace_id,p_connection_id,v_connection.external_account_id,p_snapshot->'inboxEvents');
  end if;
  return v_counts;
end;
$function$;

create function public.marketplace_browser_capacity_report (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_capacity     integer
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  if p_capacity is null or p_capacity not between 0 and 8 then raise exception 'Ungültige Hostkapazität' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_worker_runtime set broker_capacity=p_capacity,broker_capacity_verified_at=clock_timestamp()
    where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp();
  return found;
end;
$function$;

revoke all on function public.marketplace_browser_capacity_report(uuid, bigint, integer) from public;

grant all on function public.marketplace_browser_capacity_report(uuid, bigint, integer) to service_role;

create function public.marketplace_browser_dialog_presence (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_dialog_id     uuid,
  p_connected     boolean
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_browser_dialog_presence(uuid, uuid, uuid, boolean) from public;

grant all on function public.marketplace_browser_dialog_presence(uuid, uuid, uuid, boolean) to authenticated;

grant all on function public.marketplace_browser_dialog_presence(uuid, uuid, uuid, boolean) to service_role;

create function public.marketplace_browser_effective_capacity()
  returns integer
  language sql
  stable
  set search_path to ''
  as $function$
  select coalesce((select least(settings.max_browsers,runtime.broker_capacity)
    from public.marketplace_browser_pool_settings settings cross join public.marketplace_worker_runtime runtime
    where settings.id=1 and runtime.id=1 and runtime.expires_at>statement_timestamp()
      and runtime.broker_capacity_verified_at>statement_timestamp()-interval '45 seconds'),0);
$function$;

revoke all on function public.marketplace_browser_effective_capacity() from public;

grant all on function public.marketplace_browser_effective_capacity() to service_role;

create function public.marketplace_browser_job_eligible (
  p_kind   text,
  p_job_id text
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
declare v_job record;
begin
  select * into v_job from public.marketplace_browser_queue_entries() where kind=p_kind and job_id=p_job_id and state='queued';
  if not found or public.marketplace_browser_slot_status(v_job.workspace_id,v_job.connection_id) is not null then return false; end if;
  if v_job.is_write and v_job.resource_key is not null and exists(select 1 from public.marketplace_browser_queue_entries() previous
    where previous.workspace_id=v_job.workspace_id and previous.connection_id=v_job.connection_id and previous.is_write and previous.resource_key=v_job.resource_key
      and previous.queue_order<v_job.queue_order and previous.state in ('queued','paused','running','outcome_unknown')) then return false; end if;
  return public.marketplace_browser_job_ready(p_kind,p_job_id);
end;
$function$;

revoke all on function public.marketplace_browser_job_eligible(text, text) from public;

grant all on function public.marketplace_browser_job_eligible(text, text) to service_role;

create function public.marketplace_browser_job_ready (
  p_kind   text,
  p_job_id text
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_browser_job_ready(text, text) from public;

grant all on function public.marketplace_browser_job_ready(text, text) to service_role;

create function public.marketplace_browser_next_work (
  p_include_scheduled boolean default true,
  p_enabled_kinds     text[]  default array['account_action'::text,
  'sync'::text,
  'message'::text,
  'negotiation'::text,
  'listing'::text,
  'favorite_message'::text,
  'favorite_offer'::text]
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_browser_next_work(boolean, text[]) from public;

grant all on function public.marketplace_browser_next_work(boolean, text[]) to service_role;

create function public.marketplace_browser_prepare_work (
  p_worker_id         uuid,
  p_worker_epoch      bigint,
  p_include_scheduled boolean
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_browser_prepare_work(uuid, bigint, boolean) from public;

grant all on function public.marketplace_browser_prepare_work(uuid, bigint, boolean) to service_role;

create function public.marketplace_browser_queue_entries()
  returns table (
    kind          text,
    job_id        text,
    workspace_id  uuid,
    connection_id uuid,
    queue_order   bigint,
    created_at    timestamp with time zone,
    is_user       boolean,
    state         text,
    resource_key  text,
    is_write      boolean
  )
  language sql
  stable
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_browser_queue_entries() from public;

grant all on function public.marketplace_browser_queue_entries() to service_role;

create or replace function public.marketplace_browser_session_check (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_status text; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' and execution_mode = 'cloud' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = (select auth.uid()) and cloud_setup_id is null and account_action_id is null for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode = '42501'; end if;
  if v_session.state = 'active' and (v_session.expires_at <= clock_timestamp() or v_status in ('paused', 'blocked')
    or not public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id)
    or (v_session.worker_epoch is not null and not exists(select 1 from public.marketplace_worker_runtime where id=1
      and worker_id=v_session.worker_id and worker_epoch=v_session.worker_epoch and expires_at>clock_timestamp()))) then
    update public.marketplace_browser_sessions set state = 'stopping',
      stop_reason = case when v_status in ('paused', 'blocked') then 'paused' else 'expired' end
      where id = v_session.id returning * into v_session;
  end if;
  v_active := v_session.state = 'active' and v_session.expires_at > clock_timestamp();
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state,
    'expiresAt', v_session.expires_at, 'active', v_active);
end;
$function$;

create or replace function public.marketplace_browser_session_reserve (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_status text; v_profile_id text; v_session public.marketplace_browser_sessions;
begin
  -- Reservierung und Poolzählung bleiben in derselben kurzen Transaktionssperre.
  perform pg_advisory_xact_lock(91731, 1);
  if not public.marketplace_can_manage_cloud(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select status into v_status from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' and execution_mode = 'cloud' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_status in ('paused', 'blocked') then raise exception 'Verbindung ist nicht verfügbar' using errcode = '22023'; end if;
  select provider_profile_id into v_profile_id from public.marketplace_browser_profiles
    where workspace_id = p_workspace_id and connection_id = p_connection_id;
  if not found then raise exception 'Browserprofil fehlt' using errcode = '22023'; end if;
  if public.marketplace_browser_slot_status(p_workspace_id,p_connection_id) is not null
  then raise exception 'Konto wird bereits bedient oder bereinigt' using errcode = '55P03'; end if;
  insert into public.marketplace_browser_sessions (workspace_id, connection_id, started_by, provider_profile_id, expires_at)
    values (p_workspace_id, p_connection_id, (select auth.uid()), v_profile_id, clock_timestamp() + interval '10 minutes')
    returning * into v_session;
  return jsonb_build_object('id', v_session.public_id, 'workspaceId', v_session.workspace_id,
    'connectionId', v_session.connection_id, 'state', v_session.state, 'expiresAt', v_session.expires_at);
end;
$function$;

create function public.marketplace_browser_slot_status (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns text
  language sql
  stable
  set search_path to ''
  as $function$
  select case when exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping')) then 'account_busy'
    when (select count(*) from public.marketplace_browser_sessions where state in ('active','stopping'))>=public.marketplace_browser_effective_capacity() then 'pool_busy'
    else null end;
$function$;

revoke all on function public.marketplace_browser_slot_status(uuid, uuid) from public;

grant all on function public.marketplace_browser_slot_status(uuid, uuid) to service_role;

create function public.marketplace_browser_work_claim (
  p_worker_id         uuid,
  p_worker_epoch      bigint,
  p_runner_id         uuid,
  p_include_scheduled boolean default false,
  p_enabled_kinds     text[]  default array['account_action'::text,
  'message'::text,
  'negotiation'::text,
  'listing'::text,
  'favorite_message'::text,
  'favorite_offer'::text,
  'sync'::text]
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_browser_work_claim(uuid, bigint, uuid, boolean, text[]) from public;

grant all on function public.marketplace_browser_work_claim(uuid, bigint, uuid, boolean, text[]) to service_role;

create or replace function public.marketplace_cancel_unknown_negotiation_followups()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if new.state='outcome_unknown' and old.state is distinct from new.state then
    -- Lokale Folgen bleiben unverändert; Cloudfolgen warten auf einen belegten Ausgang ihres Vorgängers.
    with recursive following as (
      select id from public.marketplace_negotiation_jobs where predecessor_id=new.id
      union all select job.id from public.marketplace_negotiation_jobs job join following on job.predecessor_id=following.id
    ) update public.marketplace_negotiation_jobs set state=case when new.execution_mode='cloud' then state else 'cancelled' end,
      error_code=case when new.execution_mode='cloud' then 'dependency_unresolved' else 'predecessor_not_sent' end,updated_at=clock_timestamp()
      where id in(select id from following) and state in ('queued','claimed');
  end if;
  return null;
end;
$function$;

create function public.marketplace_cloud_favorite_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_target_id    uuid   default null::uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions; v_publication public.marketplace_account_entries; v_phase text; v_price numeric; v_text text; v_next jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  update public.marketplace_favorite_message_events set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed'));
  update public.marketplace_favorite_message_events set offer_state='outcome_unknown',offer_error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and offer_state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed'));
  -- Erst ein bestätigter physischer Stopp gibt einen nicht begonnenen Versuch wieder frei.
  update public.marketplace_favorite_message_events set state=case when state='claimed' then 'queued' else state end,offer_state=case when offer_state='claimed' then 'pending' else offer_state end,claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,cloud_phase=null
    where execution_mode='cloud' and (state='claimed' or offer_state='claimed') and exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed');
  update public.marketplace_favorite_message_events event set state=case when state in ('queued','claimed') then 'cancelled' else state end,offer_state=case when offer_state in ('pending','claimed') then 'skipped' else offer_state end,error_code=case when state in ('queued','claimed') then 'authorization_expired' else error_code end,offer_error_code=case when offer_state in ('pending','claimed') then 'configuration_changed' else offer_error_code end
    where event.execution_mode='cloud' and not public.marketplace_cloud_favorite_settings_valid(event.workspace_id,event.connection_id);
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work();
    if v_next is null or v_next->>'kind' not in ('favorite_message','favorite_offer') then return null; end if;
    p_target_id:=(v_next->>'jobId')::uuid;
  end if;
  if not public.marketplace_browser_job_eligible('favorite_message',p_target_id::text) and not public.marketplace_browser_job_eligible('favorite_offer',p_target_id::text) then return null; end if;
  select event.* into v_event from public.marketplace_favorite_message_events event
    join public.marketplace_favorite_message_settings settings using(workspace_id,connection_id)
    join public.marketplace_sync_schedules schedule using(workspace_id,connection_id)
    where event.id=p_target_id and public.marketplace_browser_slot_status(event.workspace_id,event.connection_id) is null
      and event.execution_mode='cloud' and settings.execution_mode='cloud' and settings.enabled
      and event.setting_version=settings.version and event.external_account_id=settings.external_account_id and event.cloud_authorization_version=settings.cloud_authorization_version
      and schedule.enabled and schedule.paused_reason is null and (schedule.retry_after is null or schedule.retry_after<=clock_timestamp())
      and public.marketplace_cloud_write_available(event.workspace_id,event.connection_id)
      and public.marketplace_cloud_favorite_settings_valid(event.workspace_id,event.connection_id)
      and ((event.state='sent' and event.offer_state='pending') or (event.state='queued' and event.event_at+make_interval(mins=>(settings.config->>'delayMinutes')::integer)<=clock_timestamp()))
    order by case when event.offer_state='pending' then 0 else 1 end,event.event_at,event.id limit 1 for update of event skip locked;
  if not found then return null; end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id for update;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id for update;
  v_phase:=case when v_event.state='sent' then 'offer' else 'message' end;
  if v_phase='message' then
    select * into v_publication from public.marketplace_account_entries where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id and kind='publication' and external_id=v_event.item_id;
    if not found or v_publication.body->'isClosed' is distinct from 'false'::jsonb or v_publication.body->'isReserved'='true'::jsonb
      or exists(select 1 from public.marketplace_account_entries where workspace_id=v_event.workspace_id and connection_id=v_event.connection_id and kind='conversation' and body->>'partnerId'=v_event.actor_id) then
      update public.marketplace_favorite_message_events set state='skipped',error_code='existing_conversation_or_inactive_item',updated_at=clock_timestamp() where id=v_event.id;
      return null;
    end if;
    if jsonb_typeof(v_publication.body->'price')='number' then v_price:=(v_publication.body->>'price')::numeric; end if;
    v_text:=replace(public.marketplace_favorite_message_text(v_settings.config,v_price,clock_timestamp(),v_event.id),'{article}',v_event.title);
    if char_length(v_text)>2000 then
      update public.marketplace_favorite_message_events set state='failed',error_code='invalid_template',updated_at=clock_timestamp() where id=v_event.id;
      return null;
    end if;
  end if;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_event.workspace_id,v_event.connection_id,v_settings.approved_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_favorite_message_events set state=case when v_phase='message' then 'claimed' else state end,offer_state=case when v_phase='offer' then 'claimed' else offer_state end,
    message_text=case when v_phase='message' then v_text else message_text end,offer_config=case when v_phase='message' then nullif(v_settings.config->'offer','null'::jsonb) else offer_config end,
    claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id,cloud_phase=v_phase,updated_at=clock_timestamp()
    where id=v_event.id returning * into v_event;
  return jsonb_build_object('eventId',v_event.id,'claimToken',v_event.claim_token,'workspaceId',v_event.workspace_id,'connectionId',v_event.connection_id,'userId',v_settings.approved_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_settings.cloud_authorization_version,'settingsVersion',v_settings.version,'externalAccountId',v_event.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'phase',v_phase,
    'command',jsonb_build_object('recipientId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,'offer',v_event.offer_config,'conversationId',v_event.external_conversation_id,'transactionId',v_event.external_transaction_id,'externalMessageId',v_event.external_message_id));
end;
$function$;

revoke all on function public.marketplace_cloud_favorite_claim(uuid, bigint, uuid, uuid) from public;

grant all on function public.marketplace_cloud_favorite_claim(uuid, bigint, uuid, uuid) to service_role;

create function public.marketplace_cloud_listing_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_target_id    text   default null::text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_job public.marketplace_listing_jobs; v_permission public.marketplace_listing_permissions; v_session public.marketplace_browser_sessions; v_next jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt.' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  perform public.marketplace_expire_cloud_listing_attempts();
  update public.marketplace_listing_jobs job set state='cancelled',error_code='authorization_revoked',lease_expires_at=null
    where execution_mode='cloud' and state in ('queued','paused','claimed') and not (job.state='paused' and job.error_code='editing') and not public.marketplace_listing_job_valid(job);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='paused';
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work();
    if v_next is null or v_next->>'kind'<>'listing' then return null; end if;
    p_target_id:=v_next->>'jobId';
  end if;
  if not public.marketplace_browser_job_eligible('listing',p_target_id) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_valid(job)
    and job.id=p_target_id::bigint and public.marketplace_browser_slot_status(job.workspace_id,job.connection_id) is null
    and ((job.snapshot ? 'relistExternalId' and job.relist_publish_at is null) or public.marketplace_listing_job_timing(coalesce(job.relist_publish_at,job.scheduled_at),job.late_policy,clock_timestamp())='due')
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_listing_permissions where id=v_job.permission_id for update;
  perform public.marketplace_bind_relisting_entry(v_job);
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_job.workspace_id,v_job.connection_id,v_job.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,absolute_expires_at=v_session.absolute_expires_at,
    cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'userId',v_job.requested_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_job.authorization_version,'externalAccountId',v_job.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'action',v_job.action,'snapshot',v_job.snapshot || case when v_job.snapshot ? 'relistExternalId' then jsonb_build_object('relistStage',case when v_job.relist_publish_at is null then 'delete' else 'publish' end) else '{}'::jsonb end);
end;
$function$;

revoke all on function public.marketplace_cloud_listing_claim(uuid, bigint, uuid, text) from public;

grant all on function public.marketplace_cloud_listing_claim(uuid, bigint, uuid, text) to service_role;

create function public.marketplace_cloud_message_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_target_id    uuid   default null::uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_message public.marketplace_local_message_outbox; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions; v_next jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp()
      or exists(select 1 from public.marketplace_browser_sessions session where session.public_id=cloud_browser_session_id and session.state='closed'));
  -- Ein Ablauf ist keine Freigabe des physischen Profils; erst nach bestätigtem Stopp neu claimen.
  update public.marketplace_local_message_outbox message set state='queued',claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,updated_at=clock_timestamp()
    where message.execution_mode='cloud' and message.state='claimed'
      and exists(select 1 from public.marketplace_browser_sessions session where session.public_id=message.cloud_browser_session_id and session.state='closed');
  update public.marketplace_local_message_outbox message set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where message.execution_mode='cloud' and message.state in ('queued','claimed')
      and not public.marketplace_cloud_message_permission_valid(message.workspace_id,message.connection_id,message.requested_by,message.cloud_authorization_version);
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work();
    if v_next is null or v_next->>'kind'<>'message' then return null; end if;
    p_target_id:=(v_next->>'jobId')::uuid;
  end if;
  if not public.marketplace_browser_job_eligible('message',p_target_id::text) then return null; end if;
  select * into v_message from public.marketplace_local_message_outbox where execution_mode='cloud' and state='queued'
    and id=p_target_id and public.marketplace_browser_slot_status(workspace_id,connection_id) is null
    and public.marketplace_cloud_write_available(workspace_id,connection_id)
    order by created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=v_message.workspace_id and connection_id=v_message.connection_id for update;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_message.workspace_id,v_message.connection_id,v_message.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_local_message_outbox set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,
    cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id,updated_at=clock_timestamp()
    where id=v_message.id returning * into v_message;
  return jsonb_build_object('messageId',v_message.id,'claimToken',v_message.claim_token,'workspaceId',v_message.workspace_id,'connectionId',v_message.connection_id,'userId',v_message.requested_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_message.cloud_authorization_version,
    'externalAccountId',v_message.external_account_id,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,
    'command',jsonb_build_object('externalConversationId',v_message.external_conversation_id,'text',v_message.message_text,'attachment',case when v_message.attachment_name is null then null else jsonb_build_object('name',v_message.attachment_name,'mimeType',v_message.attachment_mime_type,'base64',v_message.attachment_base64) end));
end;
$function$;

revoke all on function public.marketplace_cloud_message_claim(uuid, bigint, uuid, uuid) from public;

grant all on function public.marketplace_cloud_message_claim(uuid, bigint, uuid, uuid) to service_role;

create function public.marketplace_cloud_negotiation_claim (
  p_worker_id    uuid,
  p_worker_epoch bigint,
  p_runner_id    uuid,
  p_target_id    uuid   default null::uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_job public.marketplace_negotiation_jobs; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions; v_next jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  update public.marketplace_negotiation_jobs set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp() where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed'));
  -- Eine abgelaufene Browserlease gibt das Profil erst nach bestätigtem physischem Stopp frei.
  update public.marketplace_negotiation_jobs set state='queued',claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,updated_at=clock_timestamp()
    where execution_mode='cloud' and state='claimed' and exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed');
  update public.marketplace_negotiation_jobs job set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp() where execution_mode='cloud' and state in ('queued','claimed') and due_at is not null and not public.marketplace_negotiation_job_valid(job)
    and not exists(select 1 from public.marketplace_negotiation_jobs predecessor where predecessor.id=job.predecessor_id and predecessor.state='outcome_unknown');
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work();
    if v_next is null or v_next->>'kind'<>'negotiation' then return null; end if;
    p_target_id:=(v_next->>'jobId')::uuid;
  end if;
  if not public.marketplace_browser_job_eligible('negotiation',p_target_id::text) then return null; end if;
  select * into v_job from public.marketplace_negotiation_jobs job where id=p_target_id and execution_mode='cloud' and state='queued'
    and public.marketplace_browser_slot_status(workspace_id,connection_id) is null and due_at<=clock_timestamp()
    and public.marketplace_negotiation_job_valid(job) order by due_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=v_job.workspace_id and connection_id=v_job.connection_id for update;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_job.workspace_id,v_job.connection_id,v_job.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_negotiation_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id,updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'userId',v_job.requested_by,'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_job.cloud_authorization_version,'externalAccountId',v_job.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'command',v_job.command,
    'sourceOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' and not exists(select 1 from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent') then v_job.source_offer end,
    'confirmedOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' then (select jsonb_build_object('command',confirmed.command,'externalId',confirmed.external_id) from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent' and confirmed.external_id ~ '^[1-9][0-9]{0,31}$' order by confirmed.finished_at desc limit 1) end);
end;
$function$;

revoke all on function public.marketplace_cloud_negotiation_claim(uuid, bigint, uuid, uuid) from public;

grant all on function public.marketplace_cloud_negotiation_claim(uuid, bigint, uuid, uuid) to service_role;

create function public.marketplace_cloud_setup_presence (
  p_workspace_id uuid,
  p_setup_id     uuid,
  p_dialog_id    uuid,
  p_connected    boolean
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_cloud_setup_presence(uuid, uuid, uuid, boolean) from public;

grant all on function public.marketplace_cloud_setup_presence(uuid, uuid, uuid, boolean) to authenticated;

grant all on function public.marketplace_cloud_setup_presence(uuid, uuid, uuid, boolean) to service_role;

create or replace function public.marketplace_cloud_setup_public (
  p_setup public.marketplace_cloud_setups
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('workspaceId',p_setup.workspace_id,'connectionId',p_setup.connection_id,'setupId',p_setup.public_id,'state',p_setup.state,
    'sessionId',session.public_id,'startState',case when action.state='running' then 'starting' when session.state in ('active','stopping') then 'running' when action.state='queued' then 'queued' else 'idle' end,
    'waitReason',case when action.state='queued' then public.marketplace_browser_slot_status(p_setup.workspace_id,p_setup.connection_id) end,'version',coalesce(action.version,1),'startActionId',action.public_id)
  from (select 1) singleton
  left join lateral(select * from public.marketplace_account_actions where workspace_id=p_setup.workspace_id and connection_id=p_setup.connection_id
    and kind='cloud_setup_open' and payload->>'setupId'=p_setup.public_id::text order by queue_order desc limit 1) action on true
  left join lateral(select * from public.marketplace_browser_sessions where cloud_setup_id=p_setup.public_id and state in ('active','stopping') order by created_at desc limit 1) session on true;
$function$;

create or replace function public.marketplace_cloud_setup_session_check (
  p_workspace_id uuid,
  p_setup_id     uuid,
  p_session_id   uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setup public.marketplace_cloud_setups; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id;
  select * into v_session from public.marketplace_browser_sessions where cloud_setup_id=p_setup_id and public_id=p_session_id and started_by=(select auth.uid()) and account_action_id is null for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode='42501'; end if;
  v_active:=v_session.state='active' and v_session.expires_at>clock_timestamp() and v_setup.expires_at>clock_timestamp()
    and v_setup.state in ('login','verified') and exists(select 1 from public.marketplace_cloud_ips where id=v_setup.cloud_ip_id and enabled and country_code='DE' and is_dedicated_isp and verified_at is not null and expires_at>clock_timestamp())
    and exists(select 1 from public.marketplace_worker_runtime where id=1 and worker_id=v_session.worker_id and worker_epoch=v_session.worker_epoch and expires_at>clock_timestamp());
  return jsonb_build_object('id',v_session.public_id,'workspaceId',v_session.workspace_id,'connectionId',v_session.connection_id,'active',v_active);
end;
$function$;

create or replace function public.marketplace_cloud_setup_session_reserve (
  p_workspace_id uuid,
  p_setup_id     uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setup public.marketplace_cloud_setups; v_session public.marketplace_browser_sessions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id for update;
  if v_setup.state not in ('login','verified') or v_setup.provider_profile_id is null or v_setup.expires_at<=clock_timestamp() then raise exception 'Einrichtung nicht verfügbar' using errcode='55000'; end if;
  if public.marketplace_browser_slot_status(p_workspace_id,v_setup.connection_id) is not null then raise exception 'Browser wird bereits bedient oder bereinigt' using errcode='55P03'; end if;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,cloud_setup_id)
    values(p_workspace_id,v_setup.connection_id,(select auth.uid()),v_setup.provider_profile_id,least(v_setup.expires_at,clock_timestamp()+interval '10 minutes'),p_setup_id) returning * into v_session;
  return jsonb_build_object('id',v_session.public_id,'workspaceId',v_session.workspace_id,'connectionId',v_session.connection_id,'state',v_session.state,'expiresAt',v_session.expires_at);
end;
$function$;

create function public.marketplace_notify_account_actions()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if tg_op='UPDATE' and new.version=old.version then return new; end if;
  perform realtime.send(jsonb_build_object('workspaceId',new.workspace_id,'connectionId',new.connection_id,'id',new.public_id),
    'account_actions_changed','workspace:'||new.workspace_id::text||':marketplace_account:'||new.connection_id::text,true);
  return new;
end;
$function$;

revoke all on function public.marketplace_notify_account_actions() from public;

grant all on function public.marketplace_notify_account_actions() to service_role;

create function public.marketplace_notify_waiting_account_actions()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_notify_waiting_account_actions() from public;

grant all on function public.marketplace_notify_waiting_account_actions() to service_role;

create or replace function public.marketplace_prevent_unresolved_browser_delete()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if exists (select 1 from public.marketplace_browser_sessions
    where workspace_id = old.workspace_id and connection_id = old.id and state in ('active', 'stopping')) then
    raise exception 'Browsersitzung muss zuerst beendet werden' using errcode = '23503';
  end if;
  -- Beim bisherigen Workspace-Cascade ist der Elternsatz schon entfernt; die physische Browsersperre oben gilt trotzdem.
  if exists(select 1 from public.workspaces where id=old.workspace_id) and exists(select 1 from public.marketplace_account_actions where workspace_id=old.workspace_id and connection_id=old.id and state in ('queued','running','outcome_unknown')) then
    raise exception 'Wartende, laufende oder ungeklärte Aktionen müssen zuerst abgeschlossen oder abgebrochen werden' using errcode='23503';
  end if;
  return old;
end;
$function$;

create or replace function public.marketplace_read_action_overview (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_actions jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id)
    -- Die reine Lesefunktion prüft denselben Nutzerstatus ohne die Schreibsperre des Versandhelpers.
    or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  with actions as (
    select 'negotiation:'||job.id as id,'negotiation'::text as source,job.id as source_id,job.action as kind,job.automated as is_automated,
      case when job.state='sending' and job.lease_expires_at<=statement_timestamp() then 'outcome_unknown'
        when job.state in ('claimed','sending') then 'running' when job.state='sent' then 'succeeded' else job.state end as state,
      job.conversation_id,job.message_id,job.source_offer->>'offerId' as offer_id,conversation.body->>'title' as partner_name,
      coalesce(conversation.body->>'itemTitle',publication.body->>'title') as item_title,
      case when coalesce(job.command->>'priceCents',job.command->>'offeredPriceCents') ~ '^[0-9]{1,9}$'
        then coalesce(job.command->>'priceCents',job.command->>'offeredPriceCents')::integer end as price_cents,
      job.command->>'currency' as currency,
      case when job.action='message' then left(job.command->>'text',160) end as text_preview,
      job.created_at,job.updated_at,job.error_code
    from public.marketplace_negotiation_jobs job
    left join public.marketplace_account_entries conversation on conversation.workspace_id=job.workspace_id and conversation.connection_id=job.connection_id and conversation.id=job.conversation_id and conversation.kind='conversation'
    left join public.marketplace_negotiation_threads thread on thread.workspace_id=job.workspace_id and thread.connection_id=job.connection_id and thread.id=job.thread_id
    left join public.marketplace_account_entries publication on publication.workspace_id=job.workspace_id and publication.connection_id=job.connection_id and publication.kind='publication' and publication.external_id=thread.item_id
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id
    union all
    select 'message:'||outbox.id,'message',outbox.id,'message',false,
      case when outbox.state='sending' and outbox.lease_expires_at<=statement_timestamp() then 'outcome_unknown'
        when outbox.state in ('claimed','sending') then 'running' when outbox.state='sent' then 'succeeded' else outbox.state end,
      outbox.conversation_id,message.id,null::text,conversation.body->>'title',conversation.body->>'itemTitle',null::integer,null::text,
      left(outbox.message_text,160),outbox.created_at,outbox.updated_at,outbox.error_code
    from public.marketplace_local_message_outbox outbox
    left join public.marketplace_account_entries conversation on conversation.workspace_id=outbox.workspace_id and conversation.connection_id=outbox.connection_id and conversation.id=outbox.conversation_id and conversation.kind='conversation'
    left join public.marketplace_account_entries message on message.workspace_id=outbox.workspace_id and message.connection_id=outbox.connection_id and message.parent_id=outbox.conversation_id and message.kind='message' and message.external_id=outbox.external_message_id
    where outbox.workspace_id=p_workspace_id and outbox.connection_id=p_connection_id
    union all
    select 'sync:'||operation.id,'sync',operation.id,'sync',false,operation.state,null::uuid,null::uuid,null::text,null::text,null::text,null::integer,null::text,null::text,
      operation.created_at,coalesce(operation.finished_at,operation.heartbeat_at,operation.started_at,operation.created_at),operation.error_code
    from public.marketplace_operations operation where operation.workspace_id=p_workspace_id and operation.connection_id=p_connection_id
  ), selected as (
    select * from actions where state in ('queued','running','outcome_unknown')
    union all
    (select * from actions where state not in ('queued','running','outcome_unknown') order by updated_at desc,id desc limit 10)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'source',source,'sourceId',source_id,'kind',kind,'isAutomated',is_automated,'state',state,
    'conversationId',conversation_id,'messageId',message_id,'offerId',offer_id,'partnerName',partner_name,'itemTitle',item_title,
    'priceCents',price_cents,'currency',currency,'textPreview',text_preview,'createdAt',created_at,'updatedAt',updated_at,'errorCode',error_code,
    'waitReason',case when state='queued' then case when error_code='dependency_unresolved' then 'dependency_unresolved'
      when not public.marketplace_cloud_write_available(p_workspace_id,p_connection_id) then 'account_paused'
      else public.marketplace_browser_slot_status(p_workspace_id,p_connection_id) end end)
    order by created_at,id),'[]'::jsonb) into v_actions from selected;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'actions',v_actions);
end;
$function$;

create function public.marketplace_revoke_account_actions()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_revoke_account_actions() from public;

grant all on function public.marketplace_revoke_account_actions() to service_role;

create function public.marketplace_set_browser_pool_size (
  p_max_browsers integer
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  if not public.is_platform_operator() then raise exception 'Nur Betreiber dürfen die Browserkapazität ändern' using errcode='42501'; end if;
  if p_max_browsers is null or p_max_browsers not between 1 and 8 then raise exception 'Ungültige Browserkapazität' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_browser_pool_settings set max_browsers=p_max_browsers,updated_at=clock_timestamp(),updated_by=(select auth.uid()) where id=1;
  return jsonb_build_object('maxBrowsers',p_max_browsers);
end;
$function$;

revoke all on function public.marketplace_set_browser_pool_size(integer) from public;

grant all on function public.marketplace_set_browser_pool_size(integer) to authenticated;

grant all on function public.marketplace_set_browser_pool_size(integer) to service_role;

create function public.marketplace_sync_dispatch_claim (
  p_worker_id         uuid,
  p_worker_epoch      bigint,
  p_runner_id         uuid,
  p_include_scheduled boolean default false,
  p_target_id         uuid    default null::uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_runtime public.marketplace_worker_runtime; v_schedule public.marketplace_sync_schedules; v_operation public.marketplace_operations;
  v_connection public.marketplace_connections; v_session public.marketplace_browser_sessions; v_profile text; v_next jsonb;
begin
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_runtime from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  if p_include_scheduled then
    for v_schedule in select * from public.marketplace_sync_schedules where enabled and next_due_at<=clock_timestamp()
      and (retry_after is null or retry_after<=clock_timestamp()) order by next_due_at,id loop
      select * into v_connection from public.marketplace_connections where workspace_id=v_schedule.workspace_id and id=v_schedule.connection_id and marketplace='vinted' for update;
      perform 1 from public.marketplace_sync_schedules where id=v_schedule.id for update;
      if v_connection.execution_mode <> 'cloud' or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_schedule.workspace_id,v_schedule.activated_by)
        or not public.marketplace_cloud_network_valid(v_schedule.workspace_id,v_schedule.connection_id) then
        update public.marketplace_sync_schedules set enabled=false,authorization_version=authorization_version+1,paused_reason='access_revoked',next_due_at=null,updated_at=clock_timestamp() where id=v_schedule.id;
        continue;
      end if;
      insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,schedule_id,schedule_authorization_version)
        values(v_schedule.workspace_id,v_schedule.connection_id,v_schedule.activated_by,'scheduled_read',1,v_schedule.id,v_schedule.authorization_version)
        on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
      -- Verpasste Zyklen werden zusammengefasst, auch wenn das Konto noch beschäftigt ist.
      update public.marketplace_sync_schedules set next_due_at=clock_timestamp()+make_interval(mins=>v_schedule.interval_minutes),updated_at=clock_timestamp() where id=v_schedule.id;
    end loop;
  end if;
  if p_target_id is null then
    v_next:=public.marketplace_browser_next_work(p_include_scheduled);
    if v_next is null or v_next->>'kind'<>'sync' then return null; end if;
    p_target_id:=(v_next->>'jobId')::uuid;
  end if;
  if not public.marketplace_browser_job_eligible('sync',p_target_id::text) then return null; end if;
  for v_operation in select * from public.marketplace_operations where state='queued' and authorization_version=1
    and id=p_target_id and public.marketplace_browser_slot_status(workspace_id,connection_id) is null
    and (authorization_kind='manual_read' or p_include_scheduled) order by created_at,id loop
    select * into v_connection from public.marketplace_connections where workspace_id=v_operation.workspace_id and id=v_operation.connection_id and marketplace='vinted' for update;
    v_schedule := null;
    if v_operation.authorization_kind='scheduled_read' then
      select * into v_schedule from public.marketplace_sync_schedules where id=v_operation.schedule_id and workspace_id=v_operation.workspace_id and connection_id=v_operation.connection_id for update;
    end if;
    perform 1 from public.marketplace_operations where id=v_operation.id and state='queued' for update;
    if not found then continue; end if;
    if v_operation.authorization_kind is null or v_connection.execution_mode <> 'cloud' or v_connection.status is distinct from 'connected' or not public.marketplace_sync_authorization_valid(v_operation.workspace_id,v_operation.requested_by)
      or not public.marketplace_cloud_network_valid(v_operation.workspace_id,v_operation.connection_id)
      or (v_operation.authorization_kind='scheduled_read' and (v_schedule.id is null or not v_schedule.enabled or v_schedule.authorization_version is distinct from v_operation.schedule_authorization_version or v_schedule.activated_by<>v_operation.requested_by)) then
      update public.marketplace_operations set state='failed',error_code='access',finished_at=clock_timestamp() where id=v_operation.id;
      continue;
    end if;
    select provider_profile_id into v_profile from public.marketplace_browser_profiles where workspace_id=v_operation.workspace_id and connection_id=v_operation.connection_id;
    if v_profile is null then
      update public.marketplace_operations set state='failed',error_code='browser',finished_at=clock_timestamp() where id=v_operation.id;
      continue;
    end if;
    insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,operation_id,heartbeat_at,absolute_expires_at)
      values(v_operation.workspace_id,v_operation.connection_id,v_operation.requested_by,v_profile,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,v_operation.id,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
    update public.marketplace_operations set state='running',stage='browser',runner_id=p_runner_id,worker_epoch=p_worker_epoch,
      started_at=clock_timestamp(),heartbeat_at=clock_timestamp(),lease_expires_at=v_session.expires_at,browser_session_id=v_session.public_id where id=v_operation.id;
    if v_schedule.id is not null then update public.marketplace_sync_schedules set last_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_schedule.id; end if;
    return jsonb_build_object('operationId',v_operation.id,'workspaceId',v_operation.workspace_id,'connectionId',v_operation.connection_id,'userId',v_operation.requested_by,
      'runnerId',p_runner_id,'workerEpoch',p_worker_epoch,'authorizationKind',v_operation.authorization_kind,'authorizationVersion',v_operation.authorization_version,
      'scheduleAuthorizationVersion',v_operation.schedule_authorization_version,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
  end loop;
  return null;
end;
$function$;

revoke all on function public.marketplace_sync_dispatch_claim(uuid, bigint, uuid, boolean, uuid) from public;

grant all on function public.marketplace_sync_dispatch_claim(uuid, bigint, uuid, boolean, uuid) to service_role;

create function public.marketplace_sync_prepare_scheduled()
  returns void
  language plpgsql
  set search_path to ''
  as $function$
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
    update public.marketplace_sync_schedules set next_due_at=clock_timestamp()+make_interval(mins=>v_schedule.interval_minutes),updated_at=clock_timestamp() where id=v_schedule.id;
  end loop;
end;
$function$;

revoke all on function public.marketplace_sync_prepare_scheduled() from public;

grant all on function public.marketplace_sync_prepare_scheduled() to service_role;

create or replace function public.marketplace_worker_claim (
  p_worker_id uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_runtime public.marketplace_worker_runtime;
begin
  if p_worker_id is null then raise exception 'Workerkennung fehlt' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_runtime from public.marketplace_worker_runtime where id=1 for update;
  if found and v_runtime.expires_at > clock_timestamp() and v_runtime.worker_id <> p_worker_id then return null; end if;
  if v_runtime.id is null then
    -- Singletonkennung ist absichtlich fest; Sequenzwerte werden bei Rollback nicht zurückgesetzt.
    insert into public.marketplace_worker_runtime(id,worker_id,worker_epoch,heartbeat_at,expires_at) overriding system value
      values(1,p_worker_id,1,clock_timestamp(),clock_timestamp()+interval '90 seconds') returning * into v_runtime;
  elsif v_runtime.expires_at <= clock_timestamp() then
    update public.marketplace_worker_runtime set worker_id=p_worker_id,worker_epoch=worker_epoch+1,broker_capacity=0,broker_capacity_verified_at=null,
      heartbeat_at=clock_timestamp(),expires_at=clock_timestamp()+interval '90 seconds' where id=1 returning * into v_runtime;
  end if;
  return jsonb_build_object('workerId',v_runtime.worker_id,'workerEpoch',v_runtime.worker_epoch,'expiresAt',v_runtime.expires_at);
end;
$function$;

create table public.marketplace_account_actions (
  id                       bigint                   generated always as identity not null,
  public_id                uuid                     default gen_random_uuid() not null,
  workspace_id             uuid                     not null,
  connection_id            uuid                     not null,
  requested_by             uuid                     not null,
  request_id               uuid                     not null,
  request_hash             text                     not null,
  kind                     text                     not null,
  payload                  jsonb,
  external_account_id      text,
  provider_profile_id      text,
  entry_id                 uuid,
  entry_kind               text,
  external_id              text,
  resource_key             text,
  title                    text,
  is_write                 boolean                  not null,
  reconciliation_action_id uuid,
  state                    text                     default 'queued'::text not null,
  version                  bigint                   default 1 not null,
  queue_order              bigint                   default nextval('public.marketplace_browser_queue_order'::regclass) not null,
  claim_token              uuid,
  worker_id                uuid,
  worker_epoch             bigint,
  runner_id                uuid,
  browser_session_id       uuid,
  lease_expires_at         timestamp with time zone,
  absolute_expires_at      timestamp with time zone,
  attempts                 integer                  default 0 not null,
  write_started_at         timestamp with time zone,
  result                   jsonb,
  error_code               text,
  created_at               timestamp with time zone default clock_timestamp() not null,
  updated_at               timestamp with time zone default clock_timestamp() not null,
  started_at               timestamp with time zone,
  finished_at              timestamp with time zone,
  history_purged_at        timestamp with time zone
);

create function public.marketplace_account_action_authorized (
  p_action public.marketplace_account_actions
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_account_action_authorized(public.marketplace_account_actions) from public;

grant all on function public.marketplace_account_action_authorized(public.marketplace_account_actions) to service_role;

create function public.marketplace_account_action_public (
  p_action public.marketplace_account_actions
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
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
    'createdAt',p_action.created_at,'startedAt',p_action.started_at,'finishedAt',p_action.finished_at,'updatedAt',p_action.updated_at,
    'historyPurged',p_action.history_purged_at is not null,'resultExpired',p_action.history_purged_at is not null,'blockedByActionId',v_blocker);
end;
$function$;

revoke all on function public.marketplace_account_action_public(public.marketplace_account_actions) from public;

grant all on function public.marketplace_account_action_public(public.marketplace_account_actions) to service_role;

create function public.marketplace_account_action_target (
  p_action public.marketplace_account_actions
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
  select jsonb_build_object('accountId',p_action.external_account_id,'externalId',p_action.external_id,
    'entryId',p_action.entry_id,'entryKind',p_action.entry_kind,'body',entry.body)
  from (select 1) singleton left join public.marketplace_account_entries entry on entry.id=p_action.entry_id
    and entry.workspace_id=p_action.workspace_id and entry.connection_id=p_action.connection_id
    and entry.kind=p_action.entry_kind and entry.external_id=p_action.external_id;
$function$;

revoke all on function public.marketplace_account_action_target(public.marketplace_account_actions) from public;

grant all on function public.marketplace_account_action_target(public.marketplace_account_actions) to service_role;

comment on table public.marketplace_account_actions is 'Unveränderlich angenommene direkte Cloudaktionen; nach 30 Tagen bleibt nur die Anfragequittung, unklare Wirkungen bleiben erhalten.';

alter table public.marketplace_account_actions
  enable row level security;

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_attempts_check check (attempts >= 0 and attempts <= 3);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_browser_session_id_fkey foreign key (browser_session_id) references public.marketplace_browser_sessions(public_id);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_check check (history_purged_at is null and payload is not null or history_purged_at is
    not null and (state = any (array['succeeded'::text, 'failed'::text, 'cancelled'::text])) and payload is null and result is null);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_check1 check (state <> 'running'::text or claim_token is not null and worker_id is not null and worker_epoch is
    not null and runner_id is not null and browser_session_id is not null);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_entry_kind_check check (entry_kind = any (array['profile'::text, 'publication'::text, 'conversation'::text, 'sale'::text]));

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_error_code_check check (error_code is null or error_code ~ '^[a-z_]{1,80}$'::text);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_kind_check
    check
    (kind = any (array['profile_details_read'::text, 'profile_details_save'::text, 'profile_cities_read'::text, 'profile_edit_read'::text, 'profile_edit_save'::text,
    'listing_category_read'::text,
    'listing_content_read'::text,
    'listing_content_save'::text,
    'listing_edit_read'::text,
    'listing_edit_save'::text,
    'listing_edit_intent'::text,
    'listing_delete'::text,
    'price_save'::text, 'conversations_read'::text, 'shipping_label_request'::text, 'outcome_reconcile'::text, 'cloud_setup_open'::text, 'cloud_session_open'::text]));

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_payload_check check (payload is null or jsonb_typeof(payload) = 'object'::text and octet_length(payload::text) <= 1048576);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_pkey primary key (id);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_public_id_key unique (public_id);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_reconciliation_action_id_fkey foreign key (reconciliation_action_id) references public.marketplace_account_actions(public_id);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_request_hash_check check (request_hash ~ '^[a-f0-9]{64}$'::text);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_requested_by_fkey foreign key (requested_by) references auth.users(id);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_result_check check (result is null or octet_length(result::text) <= 4194304);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_state_check
    check (state = any (array['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'outcome_unknown'::text, 'cancelled'::text]));

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_version_check check (version >= 1 and version <= '9007199254740991'::bigint);

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_workspace_id_connection_id_fkey foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id)
    on delete cascade;

alter table public.marketplace_account_actions
  add constraint marketplace_account_actions_workspace_id_connection_id_requ_key unique (workspace_id, connection_id, request_id);

grant all on public.marketplace_account_actions to service_role;

create index marketplace_account_actions_retention on public.marketplace_account_actions (finished_at)
  where history_purged_at is null and (state = any (array['succeeded'::text, 'failed'::text, 'cancelled'::text]));

create index marketplace_account_actions_resource on public.marketplace_account_actions (workspace_id, connection_id, resource_key, queue_order)
  where is_write and (state = any (array['queued'::text, 'running'::text, 'outcome_unknown'::text]));

create index marketplace_account_actions_requester on public.marketplace_account_actions (requested_by);

create index marketplace_account_actions_due on public.marketplace_account_actions (queue_order)
  where state = 'queued'::text;

create index marketplace_account_actions_scope on public.marketplace_account_actions (workspace_id, connection_id, created_at desc);

create index marketplace_account_actions_reconciliation on public.marketplace_account_actions (reconciliation_action_id);

create index marketplace_account_actions_session on public.marketplace_account_actions (browser_session_id);

create trigger marketplace_account_action_guard
  before update on public.marketplace_account_actions
  for each row
  execute function public.marketplace_account_action_guard();

create trigger marketplace_notify_account_actions
  after insert or update on public.marketplace_account_actions
  for each row
  execute function public.marketplace_notify_account_actions();

create policy "Worker legt direkte Cloudaufträge an" on public.marketplace_account_actions
  for insert
  to service_role
  with check (true);

create policy "Worker liest direkte Cloudaufträge" on public.marketplace_account_actions
  for select
  to service_role
  using (true);

create policy "Worker löscht direkte Cloudaufträge" on public.marketplace_account_actions
  for delete
  to service_role
  using (true);

create policy "Worker ändert direkte Cloudaufträge" on public.marketplace_account_actions
  for update
  to service_role
  using (true)
  with check (true);

create table public.marketplace_browser_pool_settings (
  id           bigint                   generated always as identity not null,
  max_browsers integer                  default 1 not null,
  updated_at   timestamp with time zone default now() not null,
  updated_by   uuid
);

comment on table public.marketplace_browser_pool_settings is 'Betreibergrenze des gemeinsamen Cloud-Browserpools; die kleinere bestätigte Hostgrenze gilt.';

alter table public.marketplace_browser_pool_settings
  enable row level security;

alter table public.marketplace_browser_pool_settings
  add constraint marketplace_browser_pool_settings_id_check check (id = 1);

alter table public.marketplace_browser_pool_settings
  add constraint marketplace_browser_pool_settings_max_browsers_check check (max_browsers >= 1 and max_browsers <= 8);

alter table public.marketplace_browser_pool_settings
  add constraint marketplace_browser_pool_settings_pkey primary key (id);

alter table public.marketplace_browser_pool_settings
  add constraint marketplace_browser_pool_settings_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

grant select on public.marketplace_browser_pool_settings to authenticated;

grant all on public.marketplace_browser_pool_settings to service_role;

create index marketplace_browser_pool_settings_user on public.marketplace_browser_pool_settings (updated_by);

create trigger marketplace_notify_waiting_account_capacity
  after update on public.marketplace_browser_pool_settings
  for each row
  execute function public.marketplace_notify_waiting_account_actions();

create policy "Betreiber lesen Browserkapazität" on public.marketplace_browser_pool_settings
  for select
  to authenticated
  using (( select public.is_platform_operator() as is_platform_operator));

create policy "Worker legt Browserkapazität an" on public.marketplace_browser_pool_settings
  for insert
  to service_role
  with check (true);

create policy "Worker liest Browserkapazität" on public.marketplace_browser_pool_settings
  for select
  to service_role
  using (true);

create policy "Worker löscht Browserkapazität" on public.marketplace_browser_pool_settings
  for delete
  to service_role
  using (true);

create policy "Worker ändert Browserkapazität" on public.marketplace_browser_pool_settings
  for update
  to service_role
  using (true)
  with check (true);

create trigger marketplace_revoke_account_action_profile
  after delete or update of provider_profile_id on public.marketplace_browser_profiles
  for each row
  execute function public.marketplace_revoke_account_actions();

alter table public.marketplace_browser_sessions
  add column account_action_id uuid;

alter table public.marketplace_browser_sessions
  add constraint marketplace_browser_sessions_account_action_id_fkey foreign key (account_action_id) references public.marketplace_account_actions(public_id);

create index marketplace_browser_sessions_action on public.marketplace_browser_sessions (account_action_id);

create trigger marketplace_notify_waiting_account_sessions
  after insert or delete or update on public.marketplace_browser_sessions
  for each row
  execute function public.marketplace_notify_waiting_account_actions();

alter table public.marketplace_cloud_setups
  add column browser_dialog_id uuid;

alter table public.marketplace_cloud_setups
  add column browser_presence_expires_at timestamp with time zone;

alter table public.marketplace_connections
  add column browser_dialog_id uuid;

alter table public.marketplace_connections
  add column browser_dialog_user_id uuid;

alter table public.marketplace_connections
  add constraint marketplace_connections_browser_dialog_user_id_fkey foreign key (browser_dialog_user_id) references auth.users(id) on delete set null;

alter table public.marketplace_connections
  add column browser_presence_expires_at timestamp with time zone;

create index marketplace_connections_browser_dialog_user on public.marketplace_connections (browser_dialog_user_id);

create trigger marketplace_revoke_account_action_identity
  after update of execution_mode, external_account_id, status on public.marketplace_connections
  for each row
  execute function public.marketplace_revoke_account_actions();

alter table public.marketplace_favorite_message_events
  add column queue_order bigint default nextval('public.marketplace_browser_queue_order'::regclass) not null;

alter table public.marketplace_listing_jobs
  add column queue_order bigint default nextval('public.marketplace_browser_queue_order'::regclass) not null;

alter table public.marketplace_local_message_outbox
  add column queue_order bigint default nextval('public.marketplace_browser_queue_order'::regclass) not null;

alter table public.marketplace_negotiation_jobs
  add column queue_order bigint default nextval('public.marketplace_browser_queue_order'::regclass) not null;

alter table public.marketplace_operations
  add column queue_order bigint default nextval('public.marketplace_browser_queue_order'::regclass) not null;

alter table public.marketplace_worker_runtime
  add column broker_capacity integer default 0 not null;

alter table public.marketplace_worker_runtime
  add constraint marketplace_worker_runtime_broker_capacity_check check (broker_capacity >= 0 and broker_capacity <= 8);

alter table public.marketplace_worker_runtime
  add column broker_capacity_verified_at timestamp with time zone;

create trigger marketplace_notify_waiting_account_host_capacity
  after update on public.marketplace_worker_runtime
  for each row
  execute function public.marketplace_notify_waiting_account_actions();
-- Private Live-Hinweise benötigen zusätzlich zur public-DDL ihre eigene Realtime-Lesepolicy.
create policy "Kontoverwalter empfangen direkte Cloudaufträge" on realtime.messages for select to authenticated using (
  extension='broadcast' and private and topic=(select realtime.topic()) and exists(select 1 from public.marketplace_connections connection
    where realtime.messages.topic='workspace:'||connection.workspace_id::text||':marketplace_account:'||connection.id::text and public.marketplace_can_manage_cloud(connection.workspace_id))
);

-- Expliziter Rechteabgleich: Ein Schema-Diff entfernt vererbte Standardrechte neuer Objekte nicht vollständig.
revoke all on sequence public.marketplace_browser_queue_order from authenticated;

revoke all on public.marketplace_account_actions from authenticated;

revoke delete, insert, maintain, references, trigger, truncate, update on public.marketplace_browser_pool_settings from authenticated;

revoke all on public.marketplace_browser_pool_settings from public,anon,authenticated;

grant select on public.marketplace_browser_pool_settings to authenticated;

grant all on public.marketplace_browser_pool_settings to service_role;

revoke all on sequence public.marketplace_browser_pool_settings_id_seq from public,anon,authenticated;

grant usage,select on sequence public.marketplace_browser_pool_settings_id_seq to service_role;

revoke all on sequence public.marketplace_browser_queue_order from public,anon,authenticated;

grant usage,select on sequence public.marketplace_browser_queue_order to service_role;

revoke all on public.marketplace_account_actions from public,anon,authenticated;

grant all on public.marketplace_account_actions to service_role;

revoke all on sequence public.marketplace_account_actions_id_seq from public,anon,authenticated;

grant usage,select on sequence public.marketplace_account_actions_id_seq to service_role;

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

revoke all on function public.marketplace_cloud_message_claim(uuid,bigint,uuid,uuid) from public,anon,authenticated;

grant execute on function public.marketplace_cloud_message_claim(uuid,bigint,uuid,uuid) to service_role;

revoke all on function public.marketplace_cloud_favorite_claim(uuid,bigint,uuid,uuid) from public,anon,authenticated;

grant execute on function public.marketplace_cloud_favorite_claim(uuid,bigint,uuid,uuid) to service_role;

revoke all on function public.marketplace_local_negotiation_claim(uuid,uuid,text),public.marketplace_local_negotiation_check(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_begin(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_finish(uuid,uuid,text,uuid,uuid,text,text,text),public.marketplace_cloud_negotiation_claim(uuid,bigint,uuid,uuid),public.marketplace_cloud_negotiation_check(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_begin(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;

grant execute on function public.marketplace_local_negotiation_claim(uuid,uuid,text),public.marketplace_local_negotiation_check(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_begin(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_finish(uuid,uuid,text,uuid,uuid,text,text,text),public.marketplace_cloud_negotiation_claim(uuid,bigint,uuid,uuid),public.marketplace_cloud_negotiation_check(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_begin(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) to service_role;

revoke all on function public.marketplace_expire_cloud_listing_attempts(uuid),public.marketplace_cloud_listing_claim(uuid,bigint,uuid,text),public.marketplace_cloud_listing_check(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_begin(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_finish(uuid,uuid,text,uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;

grant execute on function public.marketplace_expire_cloud_listing_attempts(uuid),public.marketplace_cloud_listing_claim(uuid,bigint,uuid,text),public.marketplace_cloud_listing_check(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_begin(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_finish(uuid,uuid,text,uuid,uuid,bigint,jsonb,text) to service_role;

-- Jede neue Serverfunktion ist explizit von Browserclients und anonymen Rollen getrennt.
do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
    'marketplace_sync_authorization_valid','marketplace_worker_claim','marketplace_worker_heartbeat','marketplace_worker_release',
    'marketplace_browser_session_bind_worker','marketplace_sync_dispatch_claim','marketplace_sync_validate','marketplace_sync_check','marketplace_sync_heartbeat',
    'marketplace_sync_progress','marketplace_sync_finish','marketplace_apply_vinted_sync_import','marketplace_sync_recover','marketplace_read_sync_schedule','marketplace_set_sync_schedule') loop
    execute format('revoke all on function %s from public, anon, authenticated',v_function);
    execute format('grant execute on function %s to service_role',v_function);
  end loop;
end;
$$;

grant execute on function public.marketplace_read_sync_schedule(uuid,uuid) to authenticated;

grant execute on function public.marketplace_set_sync_schedule(uuid,uuid,boolean,integer,bigint) to authenticated;

-- Aus dem deklarativen Schema übernommene Erstbelegung.
insert into public.marketplace_browser_pool_settings(id) overriding system value values(1);

-- Die exklusive Tabellensperre schließt Fachänderungen aus. Nur die Metadatenumordnung darf die Finalisierungssperre umgehen.
do $$ begin if not exists(select 1 from pg_trigger where tgrelid='public.marketplace_local_message_outbox'::regclass and tgname='marketplace_local_outbox_cloud_fence' and tgenabled='O') then raise exception 'Die vorhandene Finalisierungssperre ist unerwartet verändert' using errcode='55000'; end if; end; $$;

alter table public.marketplace_local_message_outbox disable trigger marketplace_local_outbox_cloud_fence;

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

alter table public.marketplace_local_message_outbox enable trigger marketplace_local_outbox_cloud_fence;
