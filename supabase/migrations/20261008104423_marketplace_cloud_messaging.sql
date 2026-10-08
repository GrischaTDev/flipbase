-- Gemeinsame Vinted-Outbox, eigene Cloud-Schreibfreigaben und exklusiv gebundene Versandversuche.
-- Offizieller Supabase-Migra-Abgleich; ACLs und Kommentare automatisch aus den Schemadateien ergänzt.

  create table "public"."marketplace_cloud_message_permissions" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "approved_by" uuid not null,
    "external_account_id" text not null,
    "browser_profile_id" bigint not null,
    "provider_profile_id" text not null,
    "authorization_version" bigint not null default 1,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."marketplace_cloud_message_permissions" enable row level security;

alter table "public"."marketplace_local_message_outbox" add column "cloud_authorization_version" bigint;

alter table "public"."marketplace_local_message_outbox" add column "cloud_browser_session_id" uuid;

alter table "public"."marketplace_local_message_outbox" add column "cloud_runner_id" uuid;

alter table "public"."marketplace_local_message_outbox" add column "cloud_worker_epoch" bigint;

alter table "public"."marketplace_local_message_outbox" add column "cloud_worker_id" uuid;

alter table "public"."marketplace_local_message_outbox" add column "execution_mode" text not null default 'local'::text;

alter table "public"."marketplace_local_message_outbox" alter column "grant_generation" drop not null;

CREATE INDEX marketplace_cloud_message_outbox_pending ON public.marketplace_local_message_outbox USING btree (state, created_at, id) WHERE ((execution_mode = 'cloud'::text) AND (state = ANY (ARRAY['queued'::text, 'claimed'::text, 'sending'::text])));

CREATE UNIQUE INDEX marketplace_cloud_message_permis_workspace_id_connection_id_key ON public.marketplace_cloud_message_permissions USING btree (workspace_id, connection_id);

CREATE UNIQUE INDEX marketplace_cloud_message_permissions_pkey ON public.marketplace_cloud_message_permissions USING btree (id);

CREATE INDEX marketplace_cloud_message_permissions_profile ON public.marketplace_cloud_message_permissions USING btree (browser_profile_id);

CREATE INDEX marketplace_cloud_message_permissions_user ON public.marketplace_cloud_message_permissions USING btree (approved_by);

alter table "public"."marketplace_cloud_message_permissions" add constraint "marketplace_cloud_message_permissions_pkey" PRIMARY KEY using index "marketplace_cloud_message_permissions_pkey";

alter table "public"."marketplace_cloud_message_permissions" add constraint "marketplace_cloud_message_permi_workspace_id_connection_id_fkey" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_cloud_message_permissions" validate constraint "marketplace_cloud_message_permi_workspace_id_connection_id_fkey";

alter table "public"."marketplace_cloud_message_permissions" add constraint "marketplace_cloud_message_permis_workspace_id_connection_id_key" UNIQUE using index "marketplace_cloud_message_permis_workspace_id_connection_id_key";

alter table "public"."marketplace_cloud_message_permissions" add constraint "marketplace_cloud_message_permissio_authorization_version_check" CHECK ((authorization_version > 0)) not valid;

alter table "public"."marketplace_cloud_message_permissions" validate constraint "marketplace_cloud_message_permissio_authorization_version_check";

alter table "public"."marketplace_cloud_message_permissions" add constraint "marketplace_cloud_message_permissions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_cloud_message_permissions" validate constraint "marketplace_cloud_message_permissions_approved_by_fkey";

alter table "public"."marketplace_cloud_message_permissions" add constraint "marketplace_cloud_message_permissions_browser_profile_id_fkey" FOREIGN KEY (browser_profile_id) REFERENCES public.marketplace_browser_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_cloud_message_permissions" validate constraint "marketplace_cloud_message_permissions_browser_profile_id_fkey";

alter table "public"."marketplace_cloud_message_permissions" add constraint "marketplace_cloud_message_permissions_external_account_id_check" CHECK ((external_account_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."marketplace_cloud_message_permissions" validate constraint "marketplace_cloud_message_permissions_external_account_id_check";

alter table "public"."marketplace_local_message_outbox" add constraint "marketplace_cloud_message_attempt_scope" CHECK ((((cloud_browser_session_id IS NULL) AND (cloud_worker_id IS NULL) AND (cloud_worker_epoch IS NULL) AND (cloud_runner_id IS NULL)) OR ((cloud_browser_session_id IS NOT NULL) AND (cloud_worker_id IS NOT NULL) AND (cloud_worker_epoch IS NOT NULL) AND (cloud_worker_epoch > 0) AND (cloud_runner_id IS NOT NULL) AND (claim_token IS NOT NULL)))) not valid;

alter table "public"."marketplace_local_message_outbox" validate constraint "marketplace_cloud_message_attempt_scope";

alter table "public"."marketplace_local_message_outbox" add constraint "marketplace_local_message_outbox_cloud_browser_session_id_fkey" FOREIGN KEY (cloud_browser_session_id) REFERENCES public.marketplace_browser_sessions(public_id) not valid;

alter table "public"."marketplace_local_message_outbox" validate constraint "marketplace_local_message_outbox_cloud_browser_session_id_fkey";

alter table "public"."marketplace_local_message_outbox" add constraint "marketplace_local_message_outbox_execution_mode_check" CHECK ((execution_mode = ANY (ARRAY['local'::text, 'cloud'::text]))) not valid;

alter table "public"."marketplace_local_message_outbox" validate constraint "marketplace_local_message_outbox_execution_mode_check";

alter table "public"."marketplace_local_message_outbox" add constraint "marketplace_message_authorization_scope" CHECK ((((execution_mode = 'local'::text) AND (grant_generation IS NOT NULL) AND (cloud_authorization_version IS NULL) AND (cloud_browser_session_id IS NULL) AND (cloud_worker_id IS NULL) AND (cloud_worker_epoch IS NULL) AND (cloud_runner_id IS NULL)) OR ((execution_mode = 'cloud'::text) AND (grant_generation IS NULL) AND (cloud_authorization_version IS NOT NULL) AND (cloud_authorization_version > 0)))) not valid;

alter table "public"."marketplace_local_message_outbox" validate constraint "marketplace_message_authorization_scope";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.marketplace_approve_cloud_messages(p_workspace_id uuid, p_connection_id uuid, p_expected_external_account_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.marketplace_connections; v_profile public.marketplace_browser_profiles;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'cloud' or v_connection.status<>'connected' or p_expected_external_account_id is null
    or v_connection.external_account_id is distinct from p_expected_external_account_id or not public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id)
    then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id for share;
  if not found then raise exception 'Browserprofil fehlt' using errcode='42501'; end if;
  if public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid())) then
    return public.marketplace_read_message_permission(p_workspace_id,p_connection_id);
  end if;
  insert into public.marketplace_cloud_message_permissions(workspace_id,connection_id,approved_by,external_account_id,browser_profile_id,provider_profile_id)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_expected_external_account_id,v_profile.id,v_profile.provider_profile_id)
    on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,external_account_id=excluded.external_account_id,
      browser_profile_id=excluded.browser_profile_id,provider_profile_id=excluded.provider_profile_id,
      authorization_version=public.marketplace_cloud_message_permissions.authorization_version+1,revoked_at=null,updated_at=clock_timestamp();
  return public.marketplace_read_message_permission(p_workspace_id,p_connection_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cancel_invalid_cloud_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_local_message_outbox message set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where message.workspace_id=old.workspace_id and message.connection_id=old.connection_id and message.execution_mode='cloud' and message.state in ('queued','claimed')
      and not public.marketplace_cloud_message_permission_valid(message.workspace_id,message.connection_id,message.requested_by,message.cloud_authorization_version);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_message_begin(p_workspace_id uuid, p_connection_id uuid, p_message_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if public.marketplace_cloud_message_check(p_workspace_id,p_connection_id,p_message_id,p_claim_token,p_worker_id,p_worker_epoch)->>'active'<>'true'
    then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  update public.marketplace_local_message_outbox set state='sending',started_at=clock_timestamp(),updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_message_id and execution_mode='cloud' and claim_token=p_claim_token and state='claimed';
  if not found then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_message_check(p_workspace_id uuid, p_connection_id uuid, p_message_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_message_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_message public.marketplace_local_message_outbox; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions;
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_message_finish(p_workspace_id uuid, p_connection_id uuid, p_message_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint, p_outcome text, p_external_message_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_message_permission_valid(p_workspace_id uuid, p_connection_id uuid, p_user_id uuid, p_version bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return exists(select 1 from public.marketplace_cloud_message_permissions permission
    join public.marketplace_connections connection on connection.workspace_id=permission.workspace_id and connection.id=permission.connection_id
    join public.marketplace_browser_profiles profile on profile.id=permission.browser_profile_id and profile.workspace_id=permission.workspace_id and profile.connection_id=permission.connection_id
    where permission.workspace_id=p_workspace_id and permission.connection_id=p_connection_id and permission.approved_by=p_user_id
      and permission.revoked_at is null and (p_version is null or permission.authorization_version=p_version)
      and connection.marketplace='vinted' and connection.execution_mode='cloud' and connection.status='connected'
      and connection.external_account_id=permission.external_account_id and profile.provider_profile_id=permission.provider_profile_id)
    and public.marketplace_local_extension_user_valid(p_user_id)
    and public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id)
    and public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_enqueue_message(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid, p_request_id uuid, p_text text, p_attachment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_message_permission(p_workspace_id uuid, p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.marketplace_connections; v_allowed boolean; v_version bigint;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted';
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_connection.execution_mode='cloud' then
    v_allowed:=public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid()));
    select authorization_version into v_version from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=(select auth.uid());
  else
    select grant_generation into v_version from public.marketplace_local_extension_grants
      where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=(select auth.uid()) and messages_send
        and revoked_at is null and expires_at>clock_timestamp() and external_account_id=v_connection.external_account_id;
    v_allowed:=v_version is not null and v_connection.status='connected' and public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid()));
  end if;
  return jsonb_build_object('executionMode',v_connection.execution_mode,'allowed',coalesce(v_allowed,false),'authorizationVersion',coalesce(v_version,0));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_messages(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_retry_message(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid, p_message_id uuid, p_confirmed_unknown boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_revoke_cloud_messages(p_workspace_id uuid, p_connection_id uuid, p_authorization_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_cloud_message_permissions set revoked_at=clock_timestamp(),authorization_version=authorization_version+1,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and authorization_version=p_authorization_version;
  if not found then raise exception 'Freigabe wurde zwischenzeitlich geändert' using errcode='40001'; end if;
  return public.marketplace_read_message_permission(p_workspace_id,p_connection_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_revoke_cloud_messages_on_identity_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_enqueue_local_message(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid, p_request_id uuid, p_text text, p_attachment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_message_claim(p_workspace_id uuid, p_connection_id uuid, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_message_finish(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_message_id uuid, p_claim_token uuid, p_outcome text, p_external_message_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_message_start(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_message_id uuid, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_grant public.marketplace_local_extension_grants; v_message public.marketplace_local_message_outbox;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and id=p_message_id and claim_token=p_claim_token for update;
  if not found or v_message.grant_generation<>v_grant.grant_generation or v_message.requested_by<>v_grant.approved_by or v_message.state<>'claimed' or v_message.lease_expires_at<=clock_timestamp() then raise exception 'Versandclaim ungültig' using errcode='42501'; end if;
  update public.marketplace_local_message_outbox set state='sending',started_at=clock_timestamp(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_message.id;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_local_messages(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

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
$function$
;

grant delete on table "public"."marketplace_cloud_message_permissions" to "postgres";

grant insert on table "public"."marketplace_cloud_message_permissions" to "postgres";

grant references on table "public"."marketplace_cloud_message_permissions" to "postgres";

grant select on table "public"."marketplace_cloud_message_permissions" to "postgres";

grant trigger on table "public"."marketplace_cloud_message_permissions" to "postgres";

grant truncate on table "public"."marketplace_cloud_message_permissions" to "postgres";

grant update on table "public"."marketplace_cloud_message_permissions" to "postgres";

grant delete on table "public"."marketplace_cloud_message_permissions" to "service_role";

grant insert on table "public"."marketplace_cloud_message_permissions" to "service_role";

grant references on table "public"."marketplace_cloud_message_permissions" to "service_role";

grant select on table "public"."marketplace_cloud_message_permissions" to "service_role";

grant trigger on table "public"."marketplace_cloud_message_permissions" to "service_role";

grant truncate on table "public"."marketplace_cloud_message_permissions" to "service_role";

grant update on table "public"."marketplace_cloud_message_permissions" to "service_role";


  create policy "Worker deletes cloud message permissions"
  on "public"."marketplace_cloud_message_permissions"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Worker inserts cloud message permissions"
  on "public"."marketplace_cloud_message_permissions"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Worker reads cloud message permissions"
  on "public"."marketplace_cloud_message_permissions"
  as permissive
  for select
  to service_role
using (true);



  create policy "Worker updates cloud message permissions"
  on "public"."marketplace_cloud_message_permissions"
  as permissive
  for update
  to service_role
using (true)
with check (true);


CREATE TRIGGER marketplace_revoke_cloud_message_profile AFTER UPDATE OF provider_profile_id ON public.marketplace_browser_profiles FOR EACH ROW EXECUTE FUNCTION public.marketplace_revoke_cloud_messages_on_identity_change();

CREATE TRIGGER marketplace_cancel_invalid_cloud_messages AFTER DELETE OR UPDATE ON public.marketplace_cloud_message_permissions FOR EACH ROW EXECUTE FUNCTION public.marketplace_cancel_invalid_cloud_messages();

CREATE TRIGGER marketplace_revoke_cloud_message_identity AFTER UPDATE OF execution_mode, external_account_id, status ON public.marketplace_connections FOR EACH ROW EXECUTE FUNCTION public.marketplace_revoke_cloud_messages_on_identity_change();



comment on table public.marketplace_cloud_message_permissions is 'Ausdrückliche Cloud-Schreibfreigabe für genau einen Nutzer, eine externe Kontoidentität und ein Browserprofil.';
revoke all on public.marketplace_cloud_message_permissions from public,anon,authenticated;
grant all on public.marketplace_cloud_message_permissions to service_role;
revoke all on sequence public.marketplace_cloud_message_permissions_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_message_permissions_id_seq to service_role;
revoke all on function public.marketplace_cloud_message_permission_valid(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_permission_valid(uuid,uuid,uuid,bigint) to service_role;
revoke all on function public.marketplace_read_message_permission(uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_message_permission(uuid,uuid) to authenticated;
revoke all on function public.marketplace_approve_cloud_messages(uuid,uuid,text) from public,anon;
grant execute on function public.marketplace_approve_cloud_messages(uuid,uuid,text) to authenticated;
revoke all on function public.marketplace_revoke_cloud_messages(uuid,uuid,bigint) from public,anon;
grant execute on function public.marketplace_revoke_cloud_messages(uuid,uuid,bigint) to authenticated;
revoke all on function public.marketplace_enqueue_message(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.marketplace_enqueue_message(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
revoke all on function public.marketplace_read_messages(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_messages(uuid,uuid,uuid) to authenticated;
revoke all on function public.marketplace_retry_message(uuid,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.marketplace_retry_message(uuid,uuid,uuid,uuid,boolean) to authenticated;
revoke all on function public.marketplace_cloud_message_claim(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_claim(uuid,bigint,uuid) to service_role;
revoke all on function public.marketplace_cloud_message_check(uuid,uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_check(uuid,uuid,uuid,uuid,uuid,bigint) to service_role;
revoke all on function public.marketplace_cloud_message_begin(uuid,uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_begin(uuid,uuid,uuid,uuid,uuid,bigint) to service_role;
revoke all on function public.marketplace_cancel_invalid_cloud_messages() from public,anon,authenticated;
revoke all on function public.marketplace_revoke_cloud_messages_on_identity_change() from public,anon,authenticated;
revoke all on function public.marketplace_cloud_message_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) to service_role;
comment on table public.marketplace_local_message_outbox is 'Kontogebundene lokale und Cloud-Versandaufträge mit einem dauerhaften Versuch; Anhangsdaten sind ausschließlich für den Worker lesbar.';
revoke all on function public.marketplace_local_message_public(public.marketplace_local_message_outbox) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_public(public.marketplace_local_message_outbox) to service_role;
revoke all on function public.marketplace_approve_local_messaging(uuid,uuid,text,text) from public,anon;
grant execute on function public.marketplace_approve_local_messaging(uuid,uuid,text,text) to authenticated;
revoke all on function public.marketplace_enqueue_local_message(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.marketplace_enqueue_local_message(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
revoke all on function public.marketplace_retry_local_message(uuid,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.marketplace_retry_local_message(uuid,uuid,uuid,uuid,boolean) to authenticated;
revoke all on function public.marketplace_read_local_messages(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_local_messages(uuid,uuid,uuid) to authenticated;
revoke all on function public.marketplace_local_message_authorized(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_authorized(uuid,uuid,text) to service_role;
revoke all on function public.marketplace_local_message_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_claim(uuid,uuid,text) to service_role;
revoke all on function public.marketplace_local_message_start(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_start(uuid,uuid,text,uuid,uuid) to service_role;
revoke all on function public.marketplace_local_message_finish(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_local_message_finish(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;
revoke all on function public.marketplace_local_inbox_detail_state(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_local_inbox_detail_state(uuid,uuid,text,uuid) to service_role;
revoke all on function public.marketplace_local_inbox_detail_import(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_local_inbox_detail_import(uuid,uuid,text,uuid,jsonb) to service_role;
