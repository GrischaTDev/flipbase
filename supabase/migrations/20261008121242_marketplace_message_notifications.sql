-- Belegte Vinted-Nachrichteneingänge und Glockenfeed; atomare Cloud-/Extensionimporte.

  create table "public"."marketplace_message_notification_baselines" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "external_account_id" text not null,
    "first_observed_at" timestamp with time zone not null,
    "last_observed_at" timestamp with time zone not null
      );


alter table "public"."marketplace_message_notification_baselines" enable row level security;


  create table "public"."marketplace_message_notifications" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "external_account_id" text not null,
    "external_conversation_id" text not null,
    "external_event_id" text not null,
    "conversation_id" uuid,
    "occurred_at" timestamp with time zone not null,
    "observed_at" timestamp with time zone not null,
    "notified_at" timestamp with time zone,
    "read" boolean not null default false,
    "cleared_at" timestamp with time zone
      );


alter table "public"."marketplace_message_notifications" enable row level security;

CREATE UNIQUE INDEX marketplace_message_notificat_workspace_id_connection_id_e_key1 ON public.marketplace_message_notifications USING btree (workspace_id, connection_id, external_account_id, external_conversation_id, external_event_id);

CREATE UNIQUE INDEX marketplace_message_notificat_workspace_id_connection_id_ex_key ON public.marketplace_message_notification_baselines USING btree (workspace_id, connection_id, external_account_id);

CREATE UNIQUE INDEX marketplace_message_notification_baselines_pkey ON public.marketplace_message_notification_baselines USING btree (id);

CREATE INDEX marketplace_message_notifications_feed ON public.marketplace_message_notifications USING btree (workspace_id, notified_at DESC, id DESC) WHERE ((notified_at IS NOT NULL) AND (cleared_at IS NULL));

CREATE INDEX marketplace_message_notifications_pending ON public.marketplace_message_notifications USING btree (workspace_id, connection_id, external_conversation_id) WHERE (conversation_id IS NULL);

CREATE UNIQUE INDEX marketplace_message_notifications_pkey ON public.marketplace_message_notifications USING btree (id);

alter table "public"."marketplace_message_notification_baselines" add constraint "marketplace_message_notification_baselines_pkey" PRIMARY KEY using index "marketplace_message_notification_baselines_pkey";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notifications_pkey" PRIMARY KEY using index "marketplace_message_notifications_pkey";

alter table "public"."marketplace_message_notification_baselines" add constraint "marketplace_message_notificat_workspace_id_connection_id_ex_key" UNIQUE using index "marketplace_message_notificat_workspace_id_connection_id_ex_key";

alter table "public"."marketplace_message_notification_baselines" add constraint "marketplace_message_notificatio_workspace_id_connection_id_fkey" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_message_notification_baselines" validate constraint "marketplace_message_notificatio_workspace_id_connection_id_fkey";

alter table "public"."marketplace_message_notification_baselines" add constraint "marketplace_message_notification_base_external_account_id_check" CHECK ((external_account_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."marketplace_message_notification_baselines" validate constraint "marketplace_message_notification_base_external_account_id_check";

alter table "public"."marketplace_message_notification_baselines" add constraint "marketplace_message_notification_baseli_first_observed_at_check" CHECK (isfinite(first_observed_at)) not valid;

alter table "public"."marketplace_message_notification_baselines" validate constraint "marketplace_message_notification_baseli_first_observed_at_check";

alter table "public"."marketplace_message_notification_baselines" add constraint "marketplace_message_notification_baselines_check" CHECK ((isfinite(last_observed_at) AND (last_observed_at >= first_observed_at))) not valid;

alter table "public"."marketplace_message_notification_baselines" validate constraint "marketplace_message_notification_baselines_check";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notificat_workspace_id_connection_id_c_fkey" FOREIGN KEY (workspace_id, connection_id, conversation_id) REFERENCES public.marketplace_account_entries(workspace_id, connection_id, id) ON DELETE SET NULL (conversation_id) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notificat_workspace_id_connection_id_c_fkey";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notificat_workspace_id_connection_id_e_key1" UNIQUE using index "marketplace_message_notificat_workspace_id_connection_id_e_key1";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notificati_workspace_id_connection_id_fkey1" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notificati_workspace_id_connection_id_fkey1";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notification_external_conversation_id_check" CHECK ((external_conversation_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notification_external_conversation_id_check";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notifications_check" CHECK ((isfinite(observed_at) AND (occurred_at <= observed_at))) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notifications_check";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notifications_cleared_at_check" CHECK (isfinite(cleared_at)) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notifications_cleared_at_check";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notifications_external_account_id_check" CHECK ((external_account_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notifications_external_account_id_check";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notifications_external_event_id_check" CHECK ((external_event_id ~ '^(message|offer_request_message):[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notifications_external_event_id_check";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notifications_notified_at_check" CHECK (isfinite(notified_at)) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notifications_notified_at_check";

alter table "public"."marketplace_message_notifications" add constraint "marketplace_message_notifications_occurred_at_check" CHECK (isfinite(occurred_at)) not valid;

alter table "public"."marketplace_message_notifications" validate constraint "marketplace_message_notifications_occurred_at_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.marketplace_mark_message_notifications(p_workspace_id uuid, p_notification_id text DEFAULT NULL::text, p_clear boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_clear is null or (p_notification_id is not null and p_notification_id !~ '^[1-9][0-9]{0,18}$') then raise exception 'Ungültige Meldungsaktion' using errcode='22023'; end if;
  update public.marketplace_message_notifications n set read=true,cleared_at=case when p_clear then clock_timestamp() else cleared_at end where n.workspace_id=p_workspace_id and n.notified_at is not null and n.cleared_at is null and (p_clear or not n.read) and (p_notification_id is null or n.id::text=p_notification_id)
    and exists(select 1 from public.marketplace_connections c where c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id);
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_message_notifications(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_items jsonb; v_unread bigint;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select count(*) into v_unread from public.marketplace_message_notifications n join public.marketplace_connections c on c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id where n.workspace_id=p_workspace_id and n.notified_at is not null and n.cleared_at is null and n.conversation_id is not null and not n.read;
  with latest as (
    select n.*,c.display_name,e.body->>'title' as sender_name from public.marketplace_message_notifications n
    join public.marketplace_connections c on c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id
    join public.marketplace_account_entries e on e.workspace_id=n.workspace_id and e.connection_id=n.connection_id and e.id=n.conversation_id and e.kind='conversation'
    where n.workspace_id=p_workspace_id and n.notified_at is not null and n.cleared_at is null order by n.notified_at desc,n.id desc limit 50
  ) select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'connectionId',n.connection_id,'conversationId',n.conversation_id,'accountName',n.display_name,'senderName',n.sender_name,
    'eventKind',split_part(n.external_event_id,':',1),'observedAt',n.notified_at,'read',n.read) order by n.notified_at desc,n.id desc),'[]'::jsonb) into v_items from latest n;
  return jsonb_build_object('workspaceId',p_workspace_id,'items',v_items,'unreadCount',v_unread);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_record_message_event_batch(p_workspace_id uuid, p_connection_id uuid, p_external_account_id text, p_batch jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_observed timestamptz; v_reference public.marketplace_message_notification_baselines; v_had_reference boolean; v_event jsonb; v_count integer; v_visible integer;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not exists(select 1 from public.marketplace_connections c where c.workspace_id=p_workspace_id and c.id=p_connection_id and c.marketplace='vinted' and c.status='connected' and c.external_account_id=p_external_account_id) then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or octet_length(p_batch::text)>204800
    or (select count(*) from jsonb_object_keys(p_batch))<>5
    or exists(select 1 from jsonb_object_keys(p_batch) field where field<>all(array['version','observedAt','events','complete','coveredConversationIds']))
    or p_batch->'version' is distinct from '1'::jsonb or jsonb_typeof(p_batch->'complete') is distinct from 'boolean'
    or jsonb_typeof(p_batch->'observedAt') is distinct from 'string' or p_batch->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or jsonb_typeof(p_batch->'events') is distinct from 'array' or jsonb_array_length(p_batch->'events')>600
    or jsonb_typeof(p_batch->'coveredConversationIds') is distinct from 'array' or jsonb_array_length(p_batch->'coveredConversationIds')>3 then raise exception 'Ungültige Nachrichteneingänge' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_batch->'coveredConversationIds') entry where jsonb_typeof(entry)<>'string' or entry#>>'{}' !~ '^[1-9][0-9]{0,31}$')
    or (select count(*) from jsonb_array_elements(p_batch->'coveredConversationIds'))<>(select count(distinct entry) from jsonb_array_elements(p_batch->'coveredConversationIds') entry)
    or (select count(*) from jsonb_array_elements(p_batch->'events'))<>(select count(distinct (entry->>'externalConversationId',entry->>'externalId')) from jsonb_array_elements(p_batch->'events') entry) then raise exception 'Mehrdeutige Nachrichteneingänge' using errcode='22023'; end if;
  begin
    v_observed:=(p_batch->>'observedAt')::timestamptz;
    if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '30 seconds' then raise exception 'Ungültige Eingangszeit' using errcode='22023'; end if;
    for v_event in select value from jsonb_array_elements(p_batch->'events') loop
      if jsonb_typeof(v_event)<>'object' or (select count(*) from jsonb_object_keys(v_event))<>5
        or exists(select 1 from jsonb_object_keys(v_event) field where field<>all(array['externalId','externalConversationId','occurredAt','direction','source']))
        or jsonb_typeof(v_event->'externalId') is distinct from 'string' or v_event->>'externalId' !~ '^(message|offer_request_message):[1-9][0-9]{0,31}$'
        or jsonb_typeof(v_event->'externalConversationId') is distinct from 'string' or v_event->>'externalConversationId' !~ '^[1-9][0-9]{0,31}$'
        or v_event->>'direction' is distinct from 'inbound' or v_event->>'source' is distinct from 'conversation_snapshot'
        or jsonb_typeof(v_event->'occurredAt') is distinct from 'string' or v_event->>'occurredAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        or not isfinite((v_event->>'occurredAt')::timestamptz) or (v_event->>'occurredAt')::timestamptz>v_observed then raise exception 'Ungültiger Nachrichteneingang' using errcode='22023'; end if;
    end loop;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eingangszeit' using errcode='22023'; end;
  select * into v_reference from public.marketplace_message_notification_baselines where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=p_external_account_id for update;
  v_had_reference:=found;
  if v_had_reference and v_observed<v_reference.last_observed_at then raise exception 'Veralteter Eingangsstand' using errcode='22023'; end if;
  -- Ein begrenzter, aber vollständig belegter Verlauf setzt den Zeitbezug. Ältere Folgeseiten bleiben still.
  if not v_had_reference and ((p_batch->>'complete')::boolean or jsonb_array_length(p_batch->'coveredConversationIds')>0) then
    insert into public.marketplace_message_notification_baselines(workspace_id,connection_id,external_account_id,first_observed_at,last_observed_at) values(p_workspace_id,p_connection_id,p_external_account_id,v_observed,v_observed) returning * into v_reference;
  elsif v_had_reference then
    update public.marketplace_message_notification_baselines set last_observed_at=v_observed where id=v_reference.id;
  end if;
  with added as (
    insert into public.marketplace_message_notifications(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id,conversation_id,occurred_at,observed_at,notified_at)
    select p_workspace_id,p_connection_id,p_external_account_id,entry->>'externalConversationId',entry->>'externalId',c.id,(entry->>'occurredAt')::timestamptz,v_observed,
      case when v_had_reference and (entry->>'occurredAt')::timestamptz>v_reference.first_observed_at then v_observed end
    from jsonb_array_elements(p_batch->'events') entry left join public.marketplace_account_entries c on c.workspace_id=p_workspace_id and c.connection_id=p_connection_id and c.kind='conversation' and c.external_id=entry->>'externalConversationId'
    on conflict(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id) do nothing returning notified_at,conversation_id
  ) select count(*) filter(where notified_at is not null),count(*) filter(where notified_at is not null and conversation_id is not null) into v_count,v_visible from added;
  if v_visible>0 then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_resolve_message_notification_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.kind<>'conversation' then return new; end if;
  update public.marketplace_message_notifications n set conversation_id=new.id where n.workspace_id=new.workspace_id and n.connection_id=new.connection_id and n.external_conversation_id=new.external_id and n.conversation_id is null
    and exists(select 1 from public.marketplace_connections c where c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id);
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || new.workspace_id::text || ':marketplace_message_notifications',true); end if;
  return new;
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
  if p_snapshot ? 'inboxEvents' then
    if (p_snapshot->'inboxEvents'->>'observedAt')::timestamptz is distinct from v_observed_at then raise exception 'Ungültiger Eingangsstand' using errcode='22023'; end if;
    perform public.marketplace_record_message_event_batch(p_workspace_id,p_connection_id,v_connection.external_account_id,p_snapshot->'inboxEvents');
  end if;
  return v_counts;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_import_local_inbox(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_batch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_parent uuid; v_existing public.marketplace_account_entries; v_conversations integer:=0; v_messages integer:=0; v_page integer; v_next_page integer; v_complete boolean; v_mode text; v_detail_external text;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_batch)) not between 6 and 9
    or exists(select 1 from jsonb_object_keys(p_batch) field where field<>all(array['identity','observedAt','page','nextPage','conversationsComplete','entries','mode','detailConversationId','inboxEvents']))
    or octet_length(p_batch::text)>524288 or jsonb_typeof(p_batch->'identity') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_batch->'identity'))<>1 or p_batch->'identity'->>'id' is distinct from v_grant.external_account_id
    or jsonb_typeof(p_batch->'entries') is distinct from 'array' or jsonb_array_length(p_batch->'entries')>220
    or jsonb_typeof(p_batch->'conversationsComplete') is distinct from 'boolean'
    or jsonb_typeof(p_batch->'page') is distinct from 'number' or jsonb_typeof(p_batch->'nextPage') is distinct from 'number'
    or jsonb_typeof(p_batch->'observedAt') is distinct from 'string' then raise exception 'Ungültiger Inboximport' using errcode='22023'; end if;
  v_mode:=coalesce(p_batch->>'mode','backfill');
  if v_mode not in ('backfill','latest','detail') or (v_mode='detail') is distinct from (p_batch ? 'detailConversationId') then raise exception 'Ungültiger Inboxmodus' using errcode='22023'; end if;
  if v_mode='detail' then
    if jsonb_typeof(p_batch->'detailConversationId') is distinct from 'string' or p_batch->>'detailConversationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Ungültiges Gespräch' using errcode='22023'; end if;
    select external_id into v_detail_external from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and id=(p_batch->>'detailConversationId')::uuid;
    if not found then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  end if;
  begin v_observed:=(p_batch->>'observedAt')::timestamptz; v_page:=(p_batch->>'page')::integer; v_next_page:=(p_batch->>'nextPage')::integer;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'Ungültiger Inboximport' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('conversations','messages')),'-infinity')
    or (v_mode='backfill' and v_page<>v_grant.inbox_next_page)
    or (v_mode in ('latest','detail') and v_page<>1)
    or (v_mode='detail' and v_next_page<>v_grant.inbox_next_page)
    or v_page not between 1 and 20 or v_next_page not between 1 and 20
    or (v_mode='backfill' and v_next_page<>1 and v_next_page<>v_page+1)
    or (v_mode='latest' and v_next_page<>1 and v_next_page<>2 and v_next_page<>v_grant.inbox_next_page) then raise exception 'Veralteter Inboximport' using errcode='22023'; end if;
  v_complete:=(p_batch->>'conversationsComplete')::boolean;
  if v_mode='detail' and (v_complete or (select count(*) from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation')<>1
    or not exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation' and e->>'externalId'=v_detail_external)
    or exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='message' and e->>'parentExternalId'<>v_detail_external)) then raise exception 'Ungültiger Detailimport' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_batch->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Doppelte Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_batch->'entries') order by (value->>'kind'='message') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or jsonb_typeof(v_entry->'body') is distinct from 'object'
      or v_entry->>'kind' not in ('conversation','message') or v_entry->>'kind' is null
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^(?:[1-9][0-9]{0,31}|event:[0-9a-f]{64})$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry) field where field<>all(array['kind','externalId','parentExternalId','sortAt','body']))
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='conversation' then array['title','text','occurredAt','sourceUpdatedAt','detailCheckedAt','unread','imageUrl','itemId','itemTitle','itemImageUrl','itemPrice','itemCurrency','partnerId','lastActiveAt','transactionStatus'] else array['title','text','occurredAt','direction','messageType','priceLabel','imageUrls','eventType','eventGroup','offerStatus'] end))
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
        or (select count(*) from jsonb_object_keys(v_entry->'body')) not between 7 and 15
        or jsonb_typeof(v_entry->'body'->'sourceUpdatedAt') is distinct from 'string'
        or jsonb_typeof(v_entry->'body'->'detailCheckedAt') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'unread') not in ('boolean','null')
        or jsonb_typeof(v_entry->'body'->'imageUrl') not in ('string','null')
        or exists(select 1 from jsonb_each(v_entry->'body') field where
          (field.key in ('itemId','partnerId') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^[1-9][0-9]{0,31}$'))
          or (field.key in ('itemTitle','transactionStatus') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or char_length(field.value#>>'{}')>500))
          or (field.key in ('itemImageUrl','imageUrl') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^https://'))
          or (field.key='itemCurrency' and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^[A-Z]{3}$'))
          or (field.key='itemPrice' and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'number' or (field.value#>>'{}')::numeric<0 or (field.value#>>'{}')::numeric>1000000000000))
          or (field.key='lastActiveAt' and field.value <> 'null'::jsonb and jsonb_typeof(field.value)<>'string')
        ) then raise exception 'Ungültiges Gespräch' using errcode='22023'; end if;
      begin
        if not isfinite((v_entry->'body'->>'sourceUpdatedAt')::timestamptz)
          or (v_entry->'body'->>'lastActiveAt' is not null and not isfinite((v_entry->'body'->>'lastActiveAt')::timestamptz))
          or (v_entry->'body'->>'detailCheckedAt' is not null and not isfinite((v_entry->'body'->>'detailCheckedAt')::timestamptz)) then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end if;
      exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'externalId' for update;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'conversation',v_entry->>'externalId',
          v_entry->'body' || coalesce((
              select jsonb_object_agg(field.key,field.value) from jsonb_each(v_existing.body) field
              where field.key=any(array['itemId','itemTitle','itemImageUrl','itemPrice','itemCurrency','partnerId','lastActiveAt','transactionStatus'])
                and (v_entry->'body'->field.key is null or v_entry->'body'->field.key='null'::jsonb)
            ),'{}'::jsonb) || case when v_existing.id is not null and v_existing.body->>'sourceUpdatedAt'=v_entry->'body'->>'sourceUpdatedAt' and v_entry->'body'->>'detailCheckedAt' is null
            then jsonb_build_object('text',v_existing.body->'text','occurredAt',v_existing.body->'occurredAt','detailCheckedAt',v_existing.body->'detailCheckedAt') else '{}'::jsonb end,
          (v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    else
      v_messages:=v_messages+1;
      if v_messages>200 or jsonb_typeof(v_entry->'parentExternalId') is distinct from 'string' or v_entry->>'parentExternalId' !~ '^[1-9][0-9]{0,31}$'
        or (select count(*) from jsonb_object_keys(v_entry->'body')) not between 6 and 10
        or not exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation' and e->>'externalId'=v_entry->>'parentExternalId')
        or v_entry->'body'->>'direction' not in ('inbound','outbound','unknown')
        or jsonb_typeof(v_entry->'body'->'messageType') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'priceLabel') not in ('string','null')
        or exists(select 1 from jsonb_each(v_entry->'body') field where field.key in ('eventType','eventGroup','offerStatus') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or char_length(field.value#>>'{}')>500))
        or (v_entry->'body' ? 'imageUrls' and (jsonb_typeof(v_entry->'body'->'imageUrls')<>'array' or jsonb_array_length(v_entry->'body'->'imageUrls')>10))
        or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(v_entry->'body'->'imageUrls')='array' then v_entry->'body'->'imageUrls' else '[]'::jsonb end) image where jsonb_typeof(image)<>'string' or image#>>'{}' !~ '^https://') then raise exception 'Ungültige Nachricht' using errcode='22023'; end if;
      select id into v_parent from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'parentExternalId';
      if v_parent is null then raise exception 'Nachricht ohne Gespräch' using errcode='22023'; end if;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='message' and external_id=v_entry->>'externalId' for update;
      if v_existing.id is not null and v_existing.parent_id<>v_parent then raise exception 'Nachricht mit anderem Gespräch' using errcode='22023'; end if;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'message',v_entry->>'externalId',v_parent,v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at where public.marketplace_account_entries.parent_id=excluded.parent_id;
    end if;
  end loop;
  if v_mode<>'detail' then
    insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
      values(p_workspace_id,p_connection_id,'conversations',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
      on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  end if;
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at)
    values(p_workspace_id,p_connection_id,'messages','partial',v_observed,v_observed)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at;
  update public.marketplace_connections set capabilities=capabilities || '{"conversations.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set inbox_next_page=case when v_mode='backfill' or (v_mode='latest' and inbox_next_page=1) then v_next_page else inbox_next_page end,last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  if p_batch ? 'inboxEvents' then
    if p_batch->'inboxEvents'->>'observedAt' is distinct from p_batch->>'observedAt' then raise exception 'Ungültiger Eingangsstand' using errcode='22023'; end if;
    perform public.marketplace_record_message_event_batch(p_workspace_id,p_connection_id,v_grant.external_account_id,p_batch->'inboxEvents');
  end if;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'observedAt',v_observed,'counts',jsonb_build_object('conversation',v_conversations,'message',v_messages),'conversationsComplete',v_complete,'nextPage',case when v_mode='detail' then v_grant.inbox_next_page else v_next_page end);
end;
$function$
;

grant delete on table "public"."marketplace_message_notification_baselines" to "service_role";

grant insert on table "public"."marketplace_message_notification_baselines" to "service_role";

grant references on table "public"."marketplace_message_notification_baselines" to "service_role";

grant select on table "public"."marketplace_message_notification_baselines" to "service_role";

grant trigger on table "public"."marketplace_message_notification_baselines" to "service_role";

grant truncate on table "public"."marketplace_message_notification_baselines" to "service_role";

grant update on table "public"."marketplace_message_notification_baselines" to "service_role";

grant select on table "public"."marketplace_message_notifications" to "authenticated";

grant delete on table "public"."marketplace_message_notifications" to "service_role";

grant insert on table "public"."marketplace_message_notifications" to "service_role";

grant references on table "public"."marketplace_message_notifications" to "service_role";

grant select on table "public"."marketplace_message_notifications" to "service_role";

grant trigger on table "public"."marketplace_message_notifications" to "service_role";

grant truncate on table "public"."marketplace_message_notifications" to "service_role";

grant update on table "public"."marketplace_message_notifications" to "service_role";


  create policy "Worker deletes message references"
  on "public"."marketplace_message_notification_baselines"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Worker inserts message references"
  on "public"."marketplace_message_notification_baselines"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Worker reads message references"
  on "public"."marketplace_message_notification_baselines"
  as permissive
  for select
  to service_role
using (true);



  create policy "Worker updates message references"
  on "public"."marketplace_message_notification_baselines"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "Administrators read message notifications"
  on "public"."marketplace_message_notifications"
  as permissive
  for select
  to authenticated
using (public.marketplace_can_manage(workspace_id));



  create policy "Worker deletes message notifications"
  on "public"."marketplace_message_notifications"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Worker inserts message notifications"
  on "public"."marketplace_message_notifications"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Worker reads message notifications"
  on "public"."marketplace_message_notifications"
  as permissive
  for select
  to service_role
using (true);



  create policy "Worker updates message notifications"
  on "public"."marketplace_message_notifications"
  as permissive
  for update
  to service_role
using (true)
with check (true);


CREATE TRIGGER marketplace_resolve_message_notification_conversation AFTER INSERT OR UPDATE ON public.marketplace_account_entries FOR EACH ROW EXECUTE FUNCTION public.marketplace_resolve_message_notification_conversation();



comment on table public.marketplace_message_notification_baselines is 'Erste belegte Beobachtung je Kontoidentität; später geladene ältere Historie bleibt still.';
revoke all on public.marketplace_message_notification_baselines from public,anon,authenticated;
grant all on public.marketplace_message_notification_baselines to service_role;
revoke all on sequence public.marketplace_message_notification_baselines_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_message_notification_baselines_id_seq to service_role;
comment on table public.marketplace_message_notifications is 'Belegte Eingangskennungen ohne private Texte; ungelöste Gespräche bleiben bis zum Import verborgen. Lesestatus gilt workspaceweit.';
revoke all on public.marketplace_message_notifications from public,anon,authenticated;
grant select on public.marketplace_message_notifications to authenticated;
grant all on public.marketplace_message_notifications to service_role;
revoke all on sequence public.marketplace_message_notifications_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_message_notifications_id_seq to service_role;
revoke all on function public.marketplace_record_message_event_batch(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_record_message_event_batch(uuid,uuid,text,jsonb) to service_role;
revoke all on function public.marketplace_resolve_message_notification_conversation() from public,anon,authenticated;
revoke all on function public.marketplace_read_message_notifications(uuid),public.marketplace_mark_message_notifications(uuid,text,boolean) from public,anon;
grant execute on function public.marketplace_read_message_notifications(uuid),public.marketplace_mark_message_notifications(uuid,text,boolean) to authenticated;
create policy "Administrators receive message notifications" on realtime.messages for select to authenticated using (extension='broadcast' and topic=(select realtime.topic()) and exists(select 1 from public.workspaces w where realtime.messages.topic='workspace:' || w.id::text || ':marketplace_message_notifications' and public.marketplace_can_manage(w.id)));
