-- Lokaler Nachrichtenversand: geschützter Auftrag, ein Provider-Versuch und dauerhafte Ergebniszuordnung.
create table public.marketplace_local_message_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  connection_id uuid not null,
  conversation_id uuid not null,
  external_conversation_id text not null check (external_conversation_id ~ '^[1-9][0-9]{0,31}$'),
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  execution_mode text not null default 'local' check (execution_mode in ('local','cloud')),
  grant_generation bigint,
  cloud_authorization_version bigint,
  cloud_browser_session_id uuid references public.marketplace_browser_sessions(public_id),
  cloud_worker_id uuid,
  cloud_worker_epoch bigint,
  cloud_runner_id uuid,
  requested_by uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  message_text text not null check (char_length(message_text) <= 5000),
  attachment_name text,
  attachment_mime_type text,
  attachment_base64 text,
  state text not null default 'queued' check (state in ('queued','claimed','sending','sent','failed','outcome_unknown','cancelled')),
  claim_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  external_message_id text check (external_message_id ~ '^[1-9][0-9]{0,31}$'),
  error_code text check (error_code ~ '^[a-z_]{1,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, connection_id, request_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade,
  foreign key (workspace_id, connection_id, conversation_id) references public.marketplace_account_entries(workspace_id,connection_id,id) on delete cascade,
  check ((attachment_name is null) = (attachment_mime_type is null) and (attachment_name is null) = (attachment_base64 is null)),
  check (char_length(btrim(message_text)) > 0 or attachment_base64 is not null),
  check (state='cancelled' or ((state in ('claimed','sending','sent','failed','outcome_unknown')) = (claim_token is not null))),
  constraint marketplace_message_authorization_scope check ((execution_mode='local' and grant_generation is not null and cloud_authorization_version is null and cloud_browser_session_id is null and cloud_worker_id is null and cloud_worker_epoch is null and cloud_runner_id is null)
    or (execution_mode='cloud' and grant_generation is null and cloud_authorization_version is not null and cloud_authorization_version>0)),
  constraint marketplace_cloud_message_attempt_scope check ((cloud_browser_session_id is null and cloud_worker_id is null and cloud_worker_epoch is null and cloud_runner_id is null)
    or (cloud_browser_session_id is not null and cloud_worker_id is not null and cloud_worker_epoch is not null and cloud_worker_epoch>0 and cloud_runner_id is not null and claim_token is not null))
);
comment on table public.marketplace_local_message_outbox is 'Kontogebundene lokale und Cloud-Versandaufträge mit einem dauerhaften Versuch; Anhangsdaten sind ausschließlich für den Worker lesbar.';
create index marketplace_local_message_outbox_claim on public.marketplace_local_message_outbox(workspace_id,connection_id,state,created_at,id);
create index marketplace_local_message_outbox_conversation on public.marketplace_local_message_outbox(workspace_id,connection_id,conversation_id,created_at desc,id desc);
create index marketplace_cloud_message_outbox_pending on public.marketplace_local_message_outbox(state,created_at,id) where execution_mode='cloud' and state in ('queued','claimed','sending');
alter table public.marketplace_local_message_outbox enable row level security;
revoke all on public.marketplace_local_message_outbox from public,anon,authenticated;
grant all on public.marketplace_local_message_outbox to service_role;
create policy "Worker reads local messages" on public.marketplace_local_message_outbox for select to service_role using(true);
create policy "Worker inserts local messages" on public.marketplace_local_message_outbox for insert to service_role with check(true);
create policy "Worker updates local messages" on public.marketplace_local_message_outbox for update to service_role using(true) with check(true);
create policy "Worker deletes local messages" on public.marketplace_local_message_outbox for delete to service_role using(true);

create or replace function public.marketplace_local_message_public(p_message public.marketplace_local_message_outbox)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_message.id,'requestId',p_message.request_id,'conversationId',p_message.conversation_id,
    'text',p_message.message_text,'state',p_message.state,'createdAt',p_message.created_at,'updatedAt',p_message.updated_at,
    'externalMessageId',p_message.external_message_id,'errorCode',p_message.error_code,
    'attachment',case when p_message.attachment_name is null then null else jsonb_build_object('name',p_message.attachment_name,'mimeType',p_message.attachment_mime_type) end);
$$;
revoke all on function public.marketplace_local_message_public(public.marketplace_local_message_outbox) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_public(public.marketplace_local_message_outbox) to service_role;

create or replace function public.marketplace_approve_local_messaging(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_expected_external_account_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expected_external_account_id is null or p_expected_external_account_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Ungültige Freigabe' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status<>'connected' or v_connection.external_account_id is distinct from p_expected_external_account_id then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if not found or v_grant.token_hash<>p_token_hash or v_grant.approved_by<>(select auth.uid()) or v_grant.external_account_id<>p_expected_external_account_id or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp() then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_local_extension_grants set messages_send=true where id=v_grant.id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',true,'messagesSend',true);
end;
$$;
revoke all on function public.marketplace_approve_local_messaging(uuid,uuid,text,text) from public,anon;
grant execute on function public.marketplace_approve_local_messaging(uuid,uuid,text,text) to authenticated;

create or replace function public.marketplace_enqueue_local_message(p_workspace_id uuid,p_connection_id uuid,p_conversation_id uuid,p_request_id uuid,p_text text,p_attachment jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_conversation public.marketplace_account_entries; v_message public.marketplace_local_message_outbox; v_bytes bytea; v_hash text; v_name text; v_mime text; v_base64 text;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status<>'connected' then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if not found or v_grant.approved_by<>(select auth.uid()) or not v_grant.messages_send or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
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
  insert into public.marketplace_local_message_outbox(workspace_id,connection_id,conversation_id,external_conversation_id,external_account_id,grant_generation,requested_by,request_id,payload_hash,message_text,attachment_name,attachment_mime_type,attachment_base64)
    values(p_workspace_id,p_connection_id,p_conversation_id,v_conversation.external_id,v_grant.external_account_id,v_grant.grant_generation,(select auth.uid()),p_request_id,v_hash,p_text,v_name,v_mime,v_base64)
    on conflict(workspace_id,connection_id,request_id) do nothing returning * into v_message;
  if not found then
    select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id;
    if v_message.execution_mode<>'local' or v_message.payload_hash<>v_hash or v_message.requested_by<>(select auth.uid()) or v_message.grant_generation is distinct from v_grant.grant_generation then raise exception 'Nachrichtenkennung bereits verwendet' using errcode='23505'; end if;
  end if;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'message',public.marketplace_local_message_public(v_message));
end;
$$;
revoke all on function public.marketplace_enqueue_local_message(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.marketplace_enqueue_local_message(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;

create or replace function public.marketplace_retry_local_message(p_workspace_id uuid,p_connection_id uuid,p_conversation_id uuid,p_message_id uuid,p_confirmed_unknown boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_message public.marketplace_local_message_outbox; v_attachment jsonb; v_result jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_message from public.marketplace_local_message_outbox
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and conversation_id=p_conversation_id and id=p_message_id for update;
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
$$;
revoke all on function public.marketplace_retry_local_message(uuid,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.marketplace_retry_local_message(uuid,uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.marketplace_read_local_messages(p_workspace_id uuid,p_connection_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_messages jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted')
    or not exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and id=p_conversation_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  -- Nicht begonnene Aufträge überleben keine abgelaufene oder erneuerte Kontofreigabe.
  update public.marketplace_local_message_outbox m set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where m.workspace_id=p_workspace_id and m.connection_id=p_connection_id and m.execution_mode='local' and m.state in ('queued','claimed')
      and not exists(select 1 from public.marketplace_local_extension_grants g join public.marketplace_connections c on c.workspace_id=g.workspace_id and c.id=g.connection_id
        where g.workspace_id=m.workspace_id and g.connection_id=m.connection_id and g.revoked_at is null and g.expires_at>clock_timestamp()
          and g.messages_send and g.grant_generation=m.grant_generation and g.external_account_id=m.external_account_id and c.external_account_id=m.external_account_id);
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='sending' and lease_expires_at<=clock_timestamp();
  select coalesce(jsonb_agg(public.marketplace_local_message_public(m) order by m.created_at desc,m.id desc),'[]'::jsonb) into v_messages
    from (select * from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and conversation_id=p_conversation_id order by created_at desc,id desc limit 50) m;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'messages',v_messages);
end;
$$;
revoke all on function public.marketplace_read_local_messages(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_local_messages(uuid,uuid,uuid) to authenticated;

-- Ein abgelaufener Versandversuch klärt sich nicht mehr selbst und darf einen Cloudwechsel nicht dauerhaft sperren.
create or replace function public.marketplace_local_message_expire_leases(p_workspace_id uuid,p_connection_id uuid)
returns void language sql volatile security invoker set search_path='' as $$
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_local_message_outbox set state='queued',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='claimed' and lease_expires_at<=clock_timestamp();
$$;
revoke all on function public.marketplace_local_message_expire_leases(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_expire_leases(uuid,uuid) to service_role;

create or replace function public.marketplace_local_message_authorized(p_workspace_id uuid,p_connection_id uuid,p_token_hash text)
returns public.marketplace_local_extension_grants language plpgsql volatile security invoker set search_path='' as $$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status<>'connected' then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_send or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  return v_grant;
end;
$$;
revoke all on function public.marketplace_local_message_authorized(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_authorized(uuid,uuid,text) to service_role;

create or replace function public.marketplace_local_message_claim(p_workspace_id uuid,p_connection_id uuid,p_token_hash text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_message public.marketplace_local_message_outbox;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_local_message_outbox set state='queued',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='claimed' and lease_expires_at<=clock_timestamp();
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued'
    and grant_generation=v_grant.grant_generation and requested_by=v_grant.approved_by and external_account_id=v_grant.external_account_id order by created_at,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'command',null); end if;
  update public.marketplace_local_message_outbox set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_message.id returning * into v_message;
  return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_message.id,'claimToken',v_message.claim_token,'externalConversationId',v_message.external_conversation_id,
    'text',v_message.message_text,'attachment',case when v_message.attachment_name is null then null else jsonb_build_object('name',v_message.attachment_name,'mimeType',v_message.attachment_mime_type,'base64',v_message.attachment_base64) end));
end;
$$;
revoke all on function public.marketplace_local_message_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_claim(uuid,uuid,text) to service_role;

create or replace function public.marketplace_local_message_start(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_message_id uuid,p_claim_token uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_message public.marketplace_local_message_outbox;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and id=p_message_id and claim_token=p_claim_token for update;
  if not found or v_message.grant_generation<>v_grant.grant_generation or v_message.requested_by<>v_grant.approved_by or v_message.state<>'claimed' or v_message.lease_expires_at<=clock_timestamp() then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  update public.marketplace_local_message_outbox set state='sending',started_at=clock_timestamp(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_message.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_local_message_start(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_start(uuid,uuid,text,uuid,uuid) to service_role;

create or replace function public.marketplace_local_message_finish(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_message_id uuid,p_claim_token uuid,p_outcome text,p_external_message_id text default null,p_error_code text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_message public.marketplace_local_message_outbox;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and id=p_message_id and claim_token=p_claim_token for update;
  if not found or p_token_hash is distinct from (select token_hash from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id) then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  if p_outcome not in ('sent','failed','outcome_unknown') or (p_outcome='sent' and (p_external_message_id is null or p_external_message_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_message_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiges Versandergebnis' using errcode='22023'; end if;
  if v_message.state='cancelled' and v_message.error_code='original_sent' then return jsonb_build_object('ok',true); end if;
  if v_message.state='cancelled' and v_message.error_code='retried' then
    if p_outcome<>'sent' then return jsonb_build_object('ok',true); end if;
    -- Ein verspäteter Erfolgsnachweis verhindert eine noch nicht begonnene Wiederholung.
    update public.marketplace_local_message_outbox set state='cancelled',error_code='original_sent',lease_expires_at=null,updated_at=clock_timestamp()
      where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and request_id=v_message.id and state in ('queued','claimed');
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
revoke all on function public.marketplace_local_message_finish(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_finish(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;

create or replace function public.marketplace_local_inbox_detail_state(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_conversation_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_state jsonb; v_external_id text;
begin
  v_state:=public.marketplace_local_inbox_state(p_workspace_id,p_connection_id,p_token_hash);
  select external_id into v_external_id from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and id=p_conversation_id;
  if not found then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  return v_state || jsonb_build_object('externalConversationId',v_external_id);
end;
$$;
revoke all on function public.marketplace_local_inbox_detail_state(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_inbox_detail_state(uuid,uuid,text,uuid) to service_role;

create or replace function public.marketplace_local_inbox_detail_import(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_conversation_id uuid,p_batch jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
  return public.marketplace_import_local_inbox(p_workspace_id,p_connection_id,p_token_hash,
    p_batch || jsonb_build_object('mode','detail','detailConversationId',p_conversation_id));
end;
$$;
revoke all on function public.marketplace_local_inbox_detail_import(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_local_inbox_detail_import(uuid,uuid,text,uuid,jsonb) to service_role;
