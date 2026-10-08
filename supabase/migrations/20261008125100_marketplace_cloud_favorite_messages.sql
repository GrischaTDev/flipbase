-- Gemeinsame Cloud-/lokale Favoritenfreigaben und disjunkte Cloud-Versandphasen.
-- Betrifft marketplace_favorite_message_settings und marketplace_favorite_message_events.
alter table "public"."marketplace_favorite_message_events" add column "cloud_authorization_version" bigint;

alter table "public"."marketplace_favorite_message_events" add column "cloud_browser_session_id" uuid;

alter table "public"."marketplace_favorite_message_events" add column "cloud_phase" text;

alter table "public"."marketplace_favorite_message_events" add column "cloud_runner_id" uuid;

alter table "public"."marketplace_favorite_message_events" add column "cloud_worker_epoch" bigint;

alter table "public"."marketplace_favorite_message_events" add column "cloud_worker_id" uuid;

alter table "public"."marketplace_favorite_message_events" add column "execution_mode" text not null default 'local'::text;

alter table "public"."marketplace_favorite_message_events" add column "external_account_id" text;

alter table "public"."marketplace_favorite_message_settings" add column "approved_by" uuid;

alter table "public"."marketplace_favorite_message_settings" add column "cloud_authorization_version" bigint;

alter table "public"."marketplace_favorite_message_settings" add column "execution_mode" text not null default 'local'::text;

alter table "public"."marketplace_favorite_message_events" add constraint "marketplace_favorite_message_events_cloud_phase_check" CHECK ((cloud_phase = ANY (ARRAY['message'::text, 'offer'::text]))) not valid;

alter table "public"."marketplace_favorite_message_events" validate constraint "marketplace_favorite_message_events_cloud_phase_check";

alter table "public"."marketplace_favorite_message_events" add constraint "marketplace_favorite_message_events_execution_mode_check" CHECK ((execution_mode = ANY (ARRAY['local'::text, 'cloud'::text]))) not valid;

alter table "public"."marketplace_favorite_message_events" validate constraint "marketplace_favorite_message_events_execution_mode_check";

alter table "public"."marketplace_favorite_message_settings" add constraint "marketplace_favorite_message_settings_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_favorite_message_settings" validate constraint "marketplace_favorite_message_settings_approved_by_fkey";

alter table "public"."marketplace_favorite_message_settings" add constraint "marketplace_favorite_message_settings_execution_mode_check" CHECK ((execution_mode = ANY (ARRAY['local'::text, 'cloud'::text]))) not valid;

alter table "public"."marketplace_favorite_message_settings" validate constraint "marketplace_favorite_message_settings_execution_mode_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.marketplace_cancel_invalid_cloud_favorites()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_cloud_favorite_settings_valid(old.workspace_id,old.connection_id) then
    update public.marketplace_favorite_message_settings set enabled=false,version=version+1 where workspace_id=old.workspace_id and connection_id=old.connection_id and execution_mode='cloud' and enabled;
    update public.marketplace_favorite_message_events set state=case when state in ('queued','claimed') then 'cancelled' else state end,offer_state=case when offer_state in ('pending','claimed') then 'skipped' else offer_state end,error_code=case when state in ('queued','claimed') then 'authorization_expired' else error_code end,offer_error_code=case when offer_state in ('pending','claimed') then 'configuration_changed' else offer_error_code end
      where workspace_id=old.workspace_id and connection_id=old.connection_id and execution_mode='cloud';
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_favorite_begin(p_workspace_id uuid, p_connection_id uuid, p_event_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint, p_phase text, p_original_price_cents bigint DEFAULT NULL::bigint, p_offer_price_cents bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_event public.marketplace_favorite_message_events;
begin
  if public.marketplace_cloud_favorite_check(p_workspace_id,p_connection_id,p_event_id,p_claim_token,p_worker_id,p_worker_epoch,p_phase)->>'active'<>'true' then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
  select * into v_event from public.marketplace_favorite_message_events where id=p_event_id;
  if p_phase='message' then
    if v_event.state<>'claimed' then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
    update public.marketplace_favorite_message_events set state='sending',updated_at=clock_timestamp() where id=p_event_id;
  elsif p_phase='offer' then
    if v_event.offer_state<>'claimed' or v_event.external_message_id is null or v_event.external_conversation_id is null or v_event.external_transaction_id is null or v_event.offer_config is null then raise exception 'Angebotsclaim ungültig' using errcode='42501'; end if;
    perform public.marketplace_validate_favorite_offer_price(v_event.offer_config,p_original_price_cents,p_offer_price_cents);
    update public.marketplace_favorite_message_events set offer_state='sending',offer_price_cents=p_offer_price_cents,updated_at=clock_timestamp() where id=p_event_id;
  else raise exception 'Favoritenphase ungültig' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_favorite_check(p_workspace_id uuid, p_connection_id uuid, p_event_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint, p_phase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_session public.marketplace_browser_sessions; v_inactive jsonb:='{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_event from public.marketplace_favorite_message_events where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and execution_mode='cloud'
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and cloud_phase=p_phase and lease_expires_at>clock_timestamp()
    and ((p_phase='message' and state in ('claimed','sending')) or (p_phase='offer' and state='sent' and offer_state in ('claimed','sending'))) for update;
  if not found or not public.marketplace_cloud_favorite_settings_valid(p_workspace_id,p_connection_id) then return v_inactive; end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if v_event.setting_version<>v_settings.version or v_event.external_account_id is distinct from v_settings.external_account_id or v_event.cloud_authorization_version is distinct from v_settings.cloud_authorization_version
    or not exists(select 1 from public.marketplace_sync_schedules where workspace_id=p_workspace_id and connection_id=p_connection_id and enabled and paused_reason is null and (retry_after is null or retry_after<=clock_timestamp())) then return v_inactive; end if;
  select * into v_session from public.marketplace_browser_sessions where public_id=v_event.cloud_browser_session_id and workspace_id=p_workspace_id and connection_id=p_connection_id
    and started_by=v_settings.approved_by and worker_id=p_worker_id and worker_epoch=p_worker_epoch and state='active' and expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp()
    and provider_profile_id=(select provider_profile_id from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id) for update;
  if not found then return v_inactive; end if;
  update public.marketplace_browser_sessions set heartbeat_at=clock_timestamp(),expires_at=least(clock_timestamp()+interval '90 seconds',absolute_expires_at) where id=v_session.id returning * into v_session;
  update public.marketplace_favorite_message_events set lease_expires_at=v_session.expires_at where id=v_event.id;
  return jsonb_build_object('active',true,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_favorite_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions; v_publication public.marketplace_account_entries; v_phase text; v_price numeric; v_text text;
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
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then return null; end if;
  select event.* into v_event from public.marketplace_favorite_message_events event
    join public.marketplace_favorite_message_settings settings using(workspace_id,connection_id)
    join public.marketplace_sync_schedules schedule using(workspace_id,connection_id)
    where event.execution_mode='cloud' and settings.execution_mode='cloud' and settings.enabled
      and event.setting_version=settings.version and event.external_account_id=settings.external_account_id and event.cloud_authorization_version=settings.cloud_authorization_version
      and schedule.enabled and schedule.paused_reason is null and (schedule.retry_after is null or schedule.retry_after<=clock_timestamp())
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_favorite_finish(p_workspace_id uuid, p_connection_id uuid, p_event_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint, p_phase text, p_outcome text, p_external_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_conversation_id text DEFAULT NULL::text, p_transaction_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_event public.marketplace_favorite_message_events; v_state text; v_saved_id text; v_offer_state text:='not_requested'; v_offer_error text;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_event from public.marketplace_favorite_message_events where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and execution_mode='cloud'
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and cloud_phase=p_phase for update;
  if not found then raise exception 'Favoritenclaim ungültig' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('sent','failed','outcome_unknown','skipped') or (p_outcome='sent' and (p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Favoritenergebnis ungültig' using errcode='22023'; end if;
  if p_phase='message' and p_outcome='sent' and (p_conversation_id is null or p_conversation_id !~ '^[1-9][0-9]{0,31}$' or (p_transaction_id is not null and p_transaction_id !~ '^[1-9][0-9]{0,31}$')) then raise exception 'Nachrichtenbeleg ungültig' using errcode='22023'; end if;
  v_state:=case when p_phase='message' then v_event.state else v_event.offer_state end;
  v_saved_id:=case when p_phase='message' then v_event.external_message_id else v_event.external_offer_id end;
  if v_state in ('sent','failed','skipped','outcome_unknown','cancelled') then
    if v_state=p_outcome and v_saved_id is not distinct from p_external_id and (p_phase='offer' or p_outcome<>'sent' or (v_event.external_conversation_id is not distinct from p_conversation_id and v_event.external_transaction_id is not distinct from p_transaction_id)) then return jsonb_build_object('ok',true); end if;
    if v_state in ('cancelled','skipped') and p_outcome in ('failed','skipped') then return jsonb_build_object('ok',true); end if;
    if not(v_state='outcome_unknown' and p_outcome='sent') then raise exception 'Ergebnis bereits erfasst' using errcode='23505'; end if;
  elsif v_state<>'sending' and not(v_state='claimed' and p_outcome in ('failed','skipped','outcome_unknown')) then raise exception 'Versuch nicht gestartet' using errcode='42501'; end if;
  if p_phase='message' then
    if p_outcome='sent' and v_event.offer_config is not null then
      if not public.marketplace_cloud_favorite_settings_valid(p_workspace_id,p_connection_id) or not exists(select 1 from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id and version=v_event.setting_version) then v_offer_state:='skipped'; v_offer_error:='configuration_changed';
      elsif p_transaction_id is null then v_offer_state:='skipped'; v_offer_error:='missing_transaction';
      else v_offer_state:='pending'; end if;
    end if;
    update public.marketplace_favorite_message_events set state=p_outcome,external_message_id=p_external_id,external_conversation_id=p_conversation_id,external_transaction_id=p_transaction_id,error_code=p_error_code,offer_state=v_offer_state,offer_error_code=v_offer_error,lease_expires_at=null,updated_at=clock_timestamp() where id=p_event_id;
  else
    if v_event.state<>'sent' then raise exception 'Nachricht nicht bestätigt' using errcode='42501'; end if;
    update public.marketplace_favorite_message_events set offer_state=p_outcome,external_offer_id=p_external_id,offer_error_code=p_error_code,lease_expires_at=null,updated_at=clock_timestamp() where id=p_event_id;
  end if;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_favorite_settings_valid(p_workspace_id uuid, p_connection_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.marketplace_favorite_message_settings settings
    where settings.workspace_id=p_workspace_id and settings.connection_id=p_connection_id and settings.enabled
      and settings.execution_mode='cloud' and settings.cloud_authorization_version is not null
      and public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,settings.approved_by,settings.cloud_authorization_version)
      and settings.external_account_id=(select external_account_id from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id));
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_record_favorite_events(p_workspace_id uuid, p_connection_id uuid, p_external_account_id text, p_execution_mode text, p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_validate_favorite_offer_price(p_offer jsonb, p_original_price_cents bigint, p_offer_price_cents bigint)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_apply_vinted_import(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid, p_user_id uuid, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_kind,v_entry->>'externalId',v_parent_id,v_body,(v_entry->>'sortAt')::timestamptz,v_observed_at)
      on conflict (workspace_id,connection_id,kind,external_id) do update
        set parent_id = excluded.parent_id,body = excluded.body,sort_at = excluded.sort_at,observed_at = excluded.observed_at
        where public.marketplace_account_entries.observed_at <= excluded.observed_at;
    if found then v_counts := jsonb_set(v_counts,array[v_kind],to_jsonb((v_counts->>v_kind)::int + 1)); end if;
  end loop;

  -- Nur nachweislich vollständige Listen dürfen fehlende alte Einträge entfernen.
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.observed_at < v_observed_at and a.kind in ('publication','conversation')
    and not exists (select 1 from public.marketplace_account_entries child where child.parent_id = a.id and child.observed_at >= v_observed_at)
    and p_snapshot->'areas'->(case a.kind when 'publication' then 'publications' else 'conversations' end)->>'status' = 'complete'
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = a.kind and e->>'externalId' = a.external_id);
  if exists (select 1 from jsonb_array_elements(coalesce(p_snapshot->'rejectedSaleIds','[]')) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 256)
    or (jsonb_array_length(coalesce(p_snapshot->'rejectedSaleIds','[]')) > 0 and p_snapshot->'areas'->'sales'->>'status' = 'failed') then
    raise exception 'Ungültige Verkaufsbereinigung' using errcode = '22023';
  end if;
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.kind = 'sale' and a.observed_at < v_observed_at and a.external_id in (select jsonb_array_elements_text(coalesce(p_snapshot->'rejectedSaleIds','[]')))
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_import_local_favorites(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_grant public.marketplace_local_extension_grants; v_settings public.marketplace_favorite_message_settings;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if v_settings.execution_mode is distinct from 'local' or not coalesce(v_settings.enabled,false) or v_settings.grant_generation is distinct from v_grant.grant_generation or v_settings.external_account_id is distinct from v_grant.external_account_id then return jsonb_build_object('ok',true,'skipped',true); end if;
  return public.marketplace_record_favorite_events(p_workspace_id,p_connection_id,v_grant.external_account_id,'local',p_events);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_favorite_claim(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_offer_supported boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_favorite_finish(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_event_id uuid, p_claim_token uuid, p_outcome text, p_external_message_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_favorite_message_sent(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_event_id uuid, p_claim_token uuid, p_external_message_id text, p_conversation_id text, p_transaction_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_favorite_offer_finish(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_event_id uuid, p_claim_token uuid, p_outcome text, p_external_offer_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_favorite_offer_start(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_event_id uuid, p_claim_token uuid, p_original_price_cents bigint, p_offer_price_cents bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_favorite_start(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_event_id uuid, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_favorites_state(p_workspace_id uuid, p_connection_id uuid, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_grant public.marketplace_local_extension_grants; v_settings public.marketplace_favorite_message_settings;
begin
  -- Der normale Lesepfad bestätigt auch eine deaktivierte Automatik, ohne Schreibrechte auszudehnen.
  perform public.marketplace_local_inbox_state(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,
    'enabled',coalesce(v_settings.enabled,false) and v_settings.execution_mode='local' and v_grant.messages_send and v_settings.external_account_id=v_grant.external_account_id and v_settings.grant_generation=v_grant.grant_generation);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_favorite_messages(p_workspace_id uuid, p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_save_favorite_messages(p_workspace_id uuid, p_connection_id uuid, p_enabled boolean, p_config jsonb, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE TRIGGER marketplace_cancel_invalid_cloud_favorites AFTER DELETE OR UPDATE ON public.marketplace_cloud_message_permissions FOR EACH ROW EXECUTE FUNCTION public.marketplace_cancel_invalid_cloud_favorites();



revoke all on function public.marketplace_apply_vinted_import(uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_apply_vinted_import(uuid,uuid,uuid,uuid,jsonb) to service_role;
revoke all on function public.marketplace_cloud_favorite_settings_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_settings_valid(uuid,uuid) to service_role;
revoke all on function public.marketplace_read_favorite_messages(uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_favorite_messages(uuid,uuid) to authenticated;
revoke all on function public.marketplace_save_favorite_messages(uuid,uuid,boolean,jsonb,bigint) from public,anon;
grant execute on function public.marketplace_save_favorite_messages(uuid,uuid,boolean,jsonb,bigint) to authenticated;
revoke all on function public.marketplace_local_favorites_state(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorites_state(uuid,uuid,text) to service_role;
revoke all on function public.marketplace_record_favorite_events(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_record_favorite_events(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.marketplace_import_local_favorites(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_import_local_favorites(uuid,uuid,text,jsonb) to service_role;
revoke all on function public.marketplace_local_favorite_claim(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_claim(uuid,uuid,text,boolean) to service_role;
revoke all on function public.marketplace_local_favorite_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_claim(uuid,uuid,text) to service_role;
revoke all on function public.marketplace_local_favorite_start(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_start(uuid,uuid,text,uuid,uuid) to service_role;
revoke all on function public.marketplace_local_favorite_finish(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_finish(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;
revoke all on function public.marketplace_local_favorite_message_sent(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_message_sent(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;
revoke all on function public.marketplace_validate_favorite_offer_price(jsonb,bigint,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_validate_favorite_offer_price(jsonb,bigint,bigint) to service_role;
revoke all on function public.marketplace_local_favorite_offer_start(uuid,uuid,text,uuid,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_offer_start(uuid,uuid,text,uuid,uuid,bigint,bigint) to service_role;
revoke all on function public.marketplace_local_favorite_offer_finish(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_favorite_offer_finish(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;
revoke all on function public.marketplace_cloud_favorite_claim(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_claim(uuid,bigint,uuid) to service_role;
revoke all on function public.marketplace_cloud_favorite_check(uuid,uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_check(uuid,uuid,uuid,uuid,uuid,bigint,text) to service_role;
revoke all on function public.marketplace_cloud_favorite_begin(uuid,uuid,uuid,uuid,uuid,bigint,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_begin(uuid,uuid,uuid,uuid,uuid,bigint,text,bigint,bigint) to service_role;
revoke all on function public.marketplace_cloud_favorite_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text) to service_role;
revoke all on function public.marketplace_cancel_invalid_cloud_favorites() from public,anon,authenticated;
