-- Bewusstes Wiederholen lokaler Vinted-Nachrichten mit stabiler Auftragskennung und verspätetem Erfolgsnachweis.
-- Betroffen: marketplace_local_message_outbox und marketplace_account_entries; ausschließlich Funktionsänderungen.
CREATE OR REPLACE FUNCTION public.marketplace_local_message_finish(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_message_id uuid, p_claim_token uuid, p_outcome text, p_external_message_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_message public.marketplace_local_message_outbox;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_message_id and claim_token=p_claim_token for update;
  if not found or p_token_hash is distinct from (select token_hash from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id) then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  if p_outcome not in ('sent','failed','outcome_unknown') or (p_outcome='sent' and (p_external_message_id is null or p_external_message_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_message_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiges Versandergebnis' using errcode='22023'; end if;
  if v_message.state='cancelled' and v_message.error_code='original_sent' then return jsonb_build_object('ok',true); end if;
  if v_message.state='cancelled' and v_message.error_code='retried' then
    if p_outcome<>'sent' then return jsonb_build_object('ok',true); end if;
    -- Ein verspäteter Erfolgsnachweis verhindert eine noch nicht begonnene Wiederholung.
    update public.marketplace_local_message_outbox set state='cancelled',error_code='original_sent',lease_expires_at=null,updated_at=clock_timestamp()
      where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=v_message.id and state in ('queued','claimed');
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
$function$
;
revoke all on function marketplace_local_message_finish(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function marketplace_local_message_finish(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;
CREATE OR REPLACE FUNCTION public.marketplace_retry_local_message(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid, p_message_id uuid, p_confirmed_unknown boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_message public.marketplace_local_message_outbox; v_attachment jsonb; v_result jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_message from public.marketplace_local_message_outbox
    where workspace_id=p_workspace_id and connection_id=p_connection_id and conversation_id=p_conversation_id and id=p_message_id for update;
  if not found or v_message.requested_by<>(select auth.uid()) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if not exists(select 1 from public.marketplace_local_extension_grants g join public.marketplace_connections c on c.workspace_id=g.workspace_id and c.id=g.connection_id
    where g.workspace_id=p_workspace_id and g.connection_id=p_connection_id and g.approved_by=(select auth.uid()) and g.messages_send
      and g.revoked_at is null and g.expires_at>clock_timestamp() and g.external_account_id=v_message.external_account_id
      and c.external_account_id=v_message.external_account_id and c.execution_mode='local' and c.status='connected')
    then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  if v_message.state='outcome_unknown' and p_confirmed_unknown is distinct from true then raise exception 'Unklaren Versand zuerst prüfen' using errcode='22023'; end if;
  if v_message.state not in ('failed','outcome_unknown') and not (v_message.state='cancelled' and v_message.error_code='retried')
    then raise exception 'Nachricht kann nicht wiederholt werden' using errcode='22023'; end if;
  if v_message.state='outcome_unknown' and v_message.attachment_name is null and exists(select 1 from public.marketplace_account_entries
    where workspace_id=p_workspace_id and connection_id=p_connection_id and parent_id=p_conversation_id and kind='message'
      and body->>'direction'='outbound' and body->>'text'=v_message.message_text and sort_at>=v_message.created_at)
    then raise exception 'Nachricht bereits im Verlauf vorhanden' using errcode='22023'; end if;
  if v_message.attachment_name is not null then
    v_attachment:=jsonb_build_object('name',v_message.attachment_name,'mimeType',v_message.attachment_mime_type,'base64',v_message.attachment_base64);
  end if;
  -- Die ursprüngliche Nachrichten-ID ist die dauerhafte Kennung genau dieser Wiederholung.
  v_result:=public.marketplace_enqueue_local_message(p_workspace_id,p_connection_id,p_conversation_id,v_message.id,v_message.message_text,v_attachment);
  update public.marketplace_local_message_outbox set state='cancelled',error_code='retried',lease_expires_at=null,updated_at=clock_timestamp() where id=v_message.id;
  return v_result;
end;
$function$
;
revoke all on function marketplace_retry_local_message(uuid,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function marketplace_retry_local_message(uuid,uuid,uuid,uuid,boolean) to authenticated;
