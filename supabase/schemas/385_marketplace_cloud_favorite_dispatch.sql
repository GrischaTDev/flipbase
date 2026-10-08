-- Dieselben Favoritenregeln mit einer eigenen, widerrufbaren Cloud-Ausführung.
create or replace function public.marketplace_cloud_favorite_claim(p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
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
$$;
revoke all on function public.marketplace_cloud_favorite_claim(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_claim(uuid,bigint,uuid) to service_role;

create or replace function public.marketplace_cloud_favorite_check(p_workspace_id uuid,p_connection_id uuid,p_event_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_phase text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_event public.marketplace_favorite_message_events; v_settings public.marketplace_favorite_message_settings; v_session public.marketplace_browser_sessions; v_inactive jsonb:='{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_event from public.marketplace_favorite_message_events where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_event_id and execution_mode='cloud'
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and cloud_phase=p_phase and lease_expires_at>clock_timestamp()
    and ((p_phase='message' and state in ('claimed','sending')) or (p_phase='offer' and state='sent' and offer_state in ('claimed','sending'))) for update;
  if not found or not public.marketplace_cloud_favorite_settings_valid(p_workspace_id,p_connection_id)
    or not public.marketplace_cloud_write_available(p_workspace_id,p_connection_id) then return v_inactive; end if;
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
$$;
revoke all on function public.marketplace_cloud_favorite_check(uuid,uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_check(uuid,uuid,uuid,uuid,uuid,bigint,text) to service_role;

create or replace function public.marketplace_cloud_favorite_begin(p_workspace_id uuid,p_connection_id uuid,p_event_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_phase text,p_original_price_cents bigint default null,p_offer_price_cents bigint default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
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
$$;
revoke all on function public.marketplace_cloud_favorite_begin(uuid,uuid,uuid,uuid,uuid,bigint,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_begin(uuid,uuid,uuid,uuid,uuid,bigint,text,bigint,bigint) to service_role;

create or replace function public.marketplace_cloud_favorite_finish(p_workspace_id uuid,p_connection_id uuid,p_event_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_phase text,p_outcome text,p_external_id text default null,p_error_code text default null,p_conversation_id text default null,p_transaction_id text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
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
  if p_outcome<>'sent' then
    perform public.marketplace_record_cloud_write_failure(p_workspace_id,p_connection_id,
      (select started_by from public.marketplace_browser_sessions where public_id=v_event.cloud_browser_session_id),
      v_event.cloud_authorization_version,v_event.external_account_id,v_event.cloud_browser_session_id,p_error_code);
  end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_cloud_favorite_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_favorite_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text) to service_role;

create or replace function public.marketplace_cancel_invalid_cloud_favorites()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_cloud_favorite_settings_valid(old.workspace_id,old.connection_id) then
    update public.marketplace_favorite_message_settings set enabled=false,version=version+1 where workspace_id=old.workspace_id and connection_id=old.connection_id and execution_mode='cloud' and enabled;
    update public.marketplace_favorite_message_events set state=case when state in ('queued','claimed') then 'cancelled' else state end,offer_state=case when offer_state in ('pending','claimed') then 'skipped' else offer_state end,error_code=case when state in ('queued','claimed') then 'authorization_expired' else error_code end,offer_error_code=case when offer_state in ('pending','claimed') then 'configuration_changed' else offer_error_code end
      where workspace_id=old.workspace_id and connection_id=old.connection_id and execution_mode='cloud';
  end if;
  return null;
end;
$$;
revoke all on function public.marketplace_cancel_invalid_cloud_favorites() from public,anon,authenticated;
create trigger marketplace_cancel_invalid_cloud_favorites after update or delete on public.marketplace_cloud_message_permissions for each row execute function public.marketplace_cancel_invalid_cloud_favorites();
