-- Gemeinsame Nachrichtenaufträge mit getrennten lokalen und Cloud-Ausführungsrechten.
create or replace function public.marketplace_enqueue_message(p_workspace_id uuid,p_connection_id uuid,p_conversation_id uuid,p_request_id uuid,p_text text,p_attachment jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.marketplace_connections; v_permission public.marketplace_cloud_message_permissions; v_conversation public.marketplace_account_entries; v_message public.marketplace_local_message_outbox; v_bytes bytea; v_hash text; v_name text; v_mime text; v_base64 text;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_connection.execution_mode='local' then
    return public.marketplace_enqueue_local_message(p_workspace_id,p_connection_id,p_conversation_id,p_request_id,p_text,p_attachment);
  end if;
  if not public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid()))
    then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  select * into v_conversation from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_conversation_id and kind='conversation' for share;
  if not found or v_conversation.external_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  if p_request_id is null or p_text is null or char_length(p_text)>5000 or p_text ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' then raise exception 'Ungültige Nachricht' using errcode='22023'; end if;
  if p_attachment is not null then
    if jsonb_typeof(p_attachment)<>'object' or (select count(*) from jsonb_object_keys(p_attachment))<>3
      or exists(select 1 from jsonb_object_keys(p_attachment) field where field<>all(array['name','mimeType','base64']))
      or jsonb_typeof(p_attachment->'name')<>'string' or jsonb_typeof(p_attachment->'mimeType')<>'string' or jsonb_typeof(p_attachment->'base64')<>'string' then raise exception 'Ungültiger Anhang' using errcode='22023'; end if;
    v_name:=p_attachment->>'name'; v_mime:=p_attachment->>'mimeType'; v_base64:=p_attachment->>'base64';
    if char_length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]/\\]' or v_mime not in ('image/png','image/jpeg')
      or char_length(v_base64)>349528 or v_base64 !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then raise exception 'Ungültiger Anhang' using errcode='22023'; end if;
    begin v_bytes:=decode(v_base64,'base64'); exception when others then raise exception 'Ungültiger Anhang' using errcode='22023'; end;
    if octet_length(v_bytes)>262144 or octet_length(v_bytes)<4
      or (v_mime='image/png' and encode(substring(v_bytes from 1 for 8),'hex')<>'89504e470d0a1a0a')
      or (v_mime='image/jpeg' and (encode(substring(v_bytes from 1 for 3),'hex')<>'ffd8ff' or encode(substring(v_bytes from octet_length(v_bytes)-1 for 2),'hex')<>'ffd9'))
      then raise exception 'Ungültiger Anhang' using errcode='22023'; end if;
  end if;
  if char_length(btrim(p_text))=0 and v_bytes is null then raise exception 'Leere Nachricht' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_conversation_id,p_text,v_name,v_mime,case when v_bytes is null then null else encode(extensions.digest(v_bytes,'sha256'),'hex') end)::text,'utf8'),'sha256'),'hex');
  insert into public.marketplace_local_message_outbox(workspace_id,connection_id,conversation_id,external_conversation_id,external_account_id,execution_mode,grant_generation,cloud_authorization_version,requested_by,request_id,payload_hash,message_text,attachment_name,attachment_mime_type,attachment_base64)
    values(p_workspace_id,p_connection_id,p_conversation_id,v_conversation.external_id,v_permission.external_account_id,'cloud',null,v_permission.authorization_version,(select auth.uid()),p_request_id,v_hash,p_text,v_name,v_mime,v_base64)
    on conflict(workspace_id,connection_id,request_id) do nothing returning * into v_message;
  if not found then
    select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id;
    if v_message.execution_mode<>'cloud' or v_message.payload_hash<>v_hash or v_message.requested_by<>(select auth.uid()) or v_message.cloud_authorization_version is distinct from v_permission.authorization_version then raise exception 'Nachrichtenkennung bereits verwendet' using errcode='23505'; end if;
  end if;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'message',public.marketplace_local_message_public(v_message));
end;
$$;
revoke all on function public.marketplace_enqueue_message(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.marketplace_enqueue_message(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;

create or replace function public.marketplace_read_messages(p_workspace_id uuid,p_connection_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_messages jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted')
    or not exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_conversation_id and kind='conversation')
    then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  -- Die alte Schnittstelle bereinigt ausschließlich lokale Aufträge.
  perform public.marketplace_read_local_messages(p_workspace_id,p_connection_id,p_conversation_id);
  update public.marketplace_local_message_outbox message set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where message.workspace_id=p_workspace_id and message.connection_id=p_connection_id and message.execution_mode='cloud' and message.state in ('queued','claimed')
      and not public.marketplace_cloud_message_permission_valid(message.workspace_id,message.connection_id,message.requested_by,message.cloud_authorization_version);
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='cloud' and state='sending' and lease_expires_at<=clock_timestamp();
  select coalesce(jsonb_agg(public.marketplace_local_message_public(message) order by message.created_at desc,message.id desc),'[]'::jsonb) into v_messages
    from (select * from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and conversation_id=p_conversation_id order by created_at desc,id desc limit 50) message;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'messages',v_messages);
end;
$$;
revoke all on function public.marketplace_read_messages(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_messages(uuid,uuid,uuid) to authenticated;

create or replace function public.marketplace_retry_message(p_workspace_id uuid,p_connection_id uuid,p_conversation_id uuid,p_message_id uuid,p_confirmed_unknown boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_message public.marketplace_local_message_outbox; v_attachment jsonb; v_result jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and conversation_id=p_conversation_id and id=p_message_id for update;
  if not found or v_message.requested_by<>(select auth.uid()) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_message.execution_mode='local' then
    return public.marketplace_retry_local_message(p_workspace_id,p_connection_id,p_conversation_id,p_message_id,p_confirmed_unknown);
  end if;
  if not public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid()))
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and external_account_id=v_message.external_account_id)
    then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  if v_message.state='outcome_unknown' and p_confirmed_unknown is distinct from true then raise exception 'Unklaren Versand zuerst prüfen' using errcode='22023'; end if;
  if v_message.state not in ('failed','outcome_unknown') and not (v_message.state='cancelled' and v_message.error_code='retried')
    then raise exception 'Nachricht kann nicht wiederholt werden' using errcode='22023'; end if;
  if v_message.state='outcome_unknown' and v_message.attachment_name is null and exists(select 1 from public.marketplace_account_entries
    where workspace_id=p_workspace_id and connection_id=p_connection_id and parent_id=p_conversation_id and kind='message'
      and body->>'direction'='outbound' and body->>'text'=v_message.message_text and sort_at>=v_message.created_at)
    then raise exception 'Nachricht bereits im Verlauf vorhanden' using errcode='22023'; end if;
  if v_message.attachment_name is not null then v_attachment:=jsonb_build_object('name',v_message.attachment_name,'mimeType',v_message.attachment_mime_type,'base64',v_message.attachment_base64); end if;
  v_result:=public.marketplace_enqueue_message(p_workspace_id,p_connection_id,p_conversation_id,v_message.id,v_message.message_text,v_attachment);
  update public.marketplace_local_message_outbox set state='cancelled',error_code='retried',lease_expires_at=null,updated_at=clock_timestamp() where id=v_message.id;
  return v_result;
end;
$$;
revoke all on function public.marketplace_retry_message(uuid,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.marketplace_retry_message(uuid,uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.marketplace_cloud_message_claim(p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_message public.marketplace_local_message_outbox; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='cloud' and state='sending' and lease_expires_at<=clock_timestamp();
  -- Ein Ablauf ist keine Freigabe des physischen Profils; erst nach bestätigtem Stopp neu claimen.
  update public.marketplace_local_message_outbox message set state='queued',claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,updated_at=clock_timestamp()
    where message.execution_mode='cloud' and message.state='claimed' and message.lease_expires_at<=clock_timestamp()
      and exists(select 1 from public.marketplace_browser_sessions session where session.public_id=message.cloud_browser_session_id and session.state='closed');
  update public.marketplace_local_message_outbox message set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where message.execution_mode='cloud' and message.state in ('queued','claimed')
      and not public.marketplace_cloud_message_permission_valid(message.workspace_id,message.connection_id,message.requested_by,message.cloud_authorization_version);
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then return null; end if;
  select * into v_message from public.marketplace_local_message_outbox where execution_mode='cloud' and state='queued'
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
$$;
revoke all on function public.marketplace_cloud_message_claim(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_claim(uuid,bigint,uuid) to service_role;

create or replace function public.marketplace_cloud_message_check(p_workspace_id uuid,p_connection_id uuid,p_message_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_message public.marketplace_local_message_outbox; v_session public.marketplace_browser_sessions;
  v_inactive jsonb:='{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_message_id
    and execution_mode='cloud' and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and state in ('claimed','sending') and lease_expires_at>clock_timestamp() for update;
  if not found or not public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,v_message.requested_by,v_message.cloud_authorization_version) then return v_inactive; end if;
  select * into v_session from public.marketplace_browser_sessions where public_id=v_message.cloud_browser_session_id and workspace_id=p_workspace_id and connection_id=p_connection_id
    and started_by=v_message.requested_by and worker_id=p_worker_id and worker_epoch=p_worker_epoch and state='active' and expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp()
    and provider_profile_id=(select provider_profile_id from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id) for update;
  if not found then return v_inactive; end if;
  update public.marketplace_browser_sessions set heartbeat_at=clock_timestamp(),expires_at=least(clock_timestamp()+interval '90 seconds',absolute_expires_at) where id=v_session.id returning * into v_session;
  update public.marketplace_local_message_outbox set lease_expires_at=v_session.expires_at where id=v_message.id;
  return jsonb_build_object('active',true,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
end;
$$;
revoke all on function public.marketplace_cloud_message_check(uuid,uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_check(uuid,uuid,uuid,uuid,uuid,bigint) to service_role;

create or replace function public.marketplace_cloud_message_begin(p_workspace_id uuid,p_connection_id uuid,p_message_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
  if public.marketplace_cloud_message_check(p_workspace_id,p_connection_id,p_message_id,p_claim_token,p_worker_id,p_worker_epoch)->>'active'<>'true'
    then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  update public.marketplace_local_message_outbox set state='sending',started_at=clock_timestamp(),updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_message_id and execution_mode='cloud' and claim_token=p_claim_token and state='claimed';
  if not found then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_cloud_message_begin(uuid,uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_begin(uuid,uuid,uuid,uuid,uuid,bigint) to service_role;

create or replace function public.marketplace_cancel_invalid_cloud_messages()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_local_message_outbox message set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where message.workspace_id=old.workspace_id and message.connection_id=old.connection_id and message.execution_mode='cloud' and message.state in ('queued','claimed')
      and not public.marketplace_cloud_message_permission_valid(message.workspace_id,message.connection_id,message.requested_by,message.cloud_authorization_version);
  return null;
end;
$$;
revoke all on function public.marketplace_cancel_invalid_cloud_messages() from public,anon,authenticated;
create trigger marketplace_cancel_invalid_cloud_messages after update or delete on public.marketplace_cloud_message_permissions for each row execute function public.marketplace_cancel_invalid_cloud_messages();

create or replace function public.marketplace_revoke_cloud_messages_on_identity_change()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if tg_table_name='marketplace_connections' then
    if old.execution_mode is not distinct from new.execution_mode and old.external_account_id is not distinct from new.external_account_id and new.status='connected' then return null; end if;
    update public.marketplace_cloud_message_permissions set revoked_at=clock_timestamp(),authorization_version=authorization_version+1,updated_at=clock_timestamp()
      where workspace_id=new.workspace_id and connection_id=new.id and revoked_at is null;
  elsif old.provider_profile_id is distinct from new.provider_profile_id then
    update public.marketplace_cloud_message_permissions set revoked_at=clock_timestamp(),authorization_version=authorization_version+1,updated_at=clock_timestamp()
      where workspace_id=new.workspace_id and connection_id=new.connection_id and revoked_at is null;
  end if;
  return null;
end;
$$;
revoke all on function public.marketplace_revoke_cloud_messages_on_identity_change() from public,anon,authenticated;
create trigger marketplace_revoke_cloud_message_identity after update of execution_mode,external_account_id,status on public.marketplace_connections for each row execute function public.marketplace_revoke_cloud_messages_on_identity_change();
create trigger marketplace_revoke_cloud_message_profile after update of provider_profile_id on public.marketplace_browser_profiles for each row execute function public.marketplace_revoke_cloud_messages_on_identity_change();
create or replace function public.marketplace_cloud_message_finish(p_workspace_id uuid,p_connection_id uuid,p_message_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_outcome text,p_external_message_id text default null,p_error_code text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_message public.marketplace_local_message_outbox;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='cloud' and id=p_message_id and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch for update;
  if not found then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in ('sent','failed','outcome_unknown') or (p_outcome='sent' and (p_external_message_id is null or p_external_message_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_message_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiges Versandergebnis' using errcode='22023'; end if;
  if v_message.state='cancelled' and v_message.error_code='original_sent' then return jsonb_build_object('ok',true); end if;
  if v_message.state='cancelled' and v_message.error_code='retried' then
    if p_outcome<>'sent' then return jsonb_build_object('ok',true); end if;
    -- Ein verspäteter Erfolgsnachweis verhindert eine noch nicht begonnene Wiederholung.
    update public.marketplace_local_message_outbox set state='cancelled',error_code='original_sent',lease_expires_at=null,updated_at=clock_timestamp()
      where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='cloud' and request_id=v_message.id and state in ('queued','claimed');
  elsif v_message.state in ('sent','failed','outcome_unknown') then
    if v_message.state='outcome_unknown' and p_outcome='outcome_unknown' and p_external_message_id is null then return jsonb_build_object('ok',true); end if;
    if v_message.state=p_outcome and v_message.external_message_id is not distinct from p_external_message_id and v_message.error_code is not distinct from p_error_code then return jsonb_build_object('ok',true); end if;
    if not (v_message.state='outcome_unknown' and p_outcome='sent' and p_external_message_id is not null) then raise exception 'Versandergebnis bereits erfasst' using errcode='23505'; end if;
  elsif v_message.state<>'sending' and not (v_message.state='claimed' and p_outcome in ('failed','outcome_unknown')) then
    raise exception 'Versand nicht gestartet' using errcode='42501';
  end if;
  update public.marketplace_local_message_outbox set state=p_outcome,external_message_id=p_external_message_id,error_code=p_error_code,lease_expires_at=null,updated_at=clock_timestamp() where id=v_message.id;
  if p_outcome='sent' and exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and external_account_id=v_message.external_account_id) then
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,'message',p_external_message_id,v_message.conversation_id,
        jsonb_build_object('title','Nachricht','text',nullif(v_message.message_text,''),'occurredAt',clock_timestamp(),'direction','outbound','messageType',case when v_message.attachment_name is null then 'text_message' else 'photo_message' end,'priceLabel',null),
        clock_timestamp(),clock_timestamp())
      on conflict(workspace_id,connection_id,kind,external_id) do nothing;
    update public.marketplace_connections set capabilities=capabilities || '{"messages.sendText":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,clock_timestamp()),updated_at=clock_timestamp()
      where workspace_id=p_workspace_id and id=p_connection_id;
  end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_cloud_message_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) to service_role;
