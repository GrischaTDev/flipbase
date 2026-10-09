-- Gelesenen Gesprächsstand in Flipbase dauerhaft speichern; keine Vinted-Lesebestätigung.
-- Betrifft marketplace_account_entries und die abgesicherten Chat-/Glocken-RPCs.

alter table "public"."marketplace_account_entries" add column "conversation_read_version" text;

alter table "public"."marketplace_account_entries" add constraint "marketplace_account_entries_conversation_read_version_check" CHECK (((conversation_read_version IS NULL) OR ((kind = 'conversation'::text) AND (conversation_read_version ~ '^[a-f0-9]{32}$'::text)))) not valid;

alter table "public"."marketplace_account_entries" validate constraint "marketplace_account_entries_conversation_read_version_check";

CREATE OR REPLACE FUNCTION public.marketplace_conversation_read_version(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- Nachrichtenkennungen statt Abrufzeit verwenden: wiederholte Importe bleiben gelesen, neue Eingänge ändern die Version.
  select md5(jsonb_build_array(c.external_account_id,e.external_id,
    coalesce(jsonb_agg(m.external_id order by m.external_id) filter (where m.id is not null),'[]'::jsonb),
    case when count(m.id)=0 then e.body->>'sourceUpdatedAt' else null end)::text)
  from public.marketplace_account_entries e
  join public.marketplace_connections c on c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted'
  left join public.marketplace_account_entries m on m.workspace_id=e.workspace_id and m.connection_id=e.connection_id and m.parent_id=e.id and m.kind='message' and m.body->>'direction'='inbound'
  where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.id=p_conversation_id and e.kind='conversation' and public.marketplace_can_manage(p_workspace_id)
  group by c.external_account_id,e.id;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_mark_conversation_read(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid, p_read_version text, p_observed_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_entry public.marketplace_account_entries; v_version text; v_account text;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_read_version is null or p_read_version !~ '^[a-f0-9]{32}$' or p_observed_at is null or not isfinite(p_observed_at) or p_observed_at>clock_timestamp() then raise exception 'Ungültiger Lesebeleg' using errcode='22023'; end if;
  select e.* into v_entry from public.marketplace_account_entries e join public.marketplace_connections c on c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted' and c.status='connected'
    where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.id=p_conversation_id and e.kind='conversation' for update of e;
  if not found then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  v_version:=public.marketplace_conversation_read_version(p_workspace_id,p_connection_id,p_conversation_id);
  -- Ein neuer Eingang während des Ladens wird nicht durch einen verspäteten Abschluss als gelesen markiert.
  if p_read_version is distinct from v_version or v_entry.body->>'detailCheckedAt' is null or (v_entry.body->>'detailCheckedAt')::timestamptz<p_observed_at then
    return jsonb_build_object('ok',true,'marked',false);
  end if;
  update public.marketplace_account_entries set conversation_read_version=v_version where id=v_entry.id;
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  update public.marketplace_message_notifications n set read=true where n.workspace_id=p_workspace_id and n.connection_id=p_connection_id and n.conversation_id=p_conversation_id
    and n.external_account_id=v_account and not n.read and n.observed_at<=p_observed_at and n.notified_at is not null and n.cleared_at is null;
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return jsonb_build_object('ok',true,'marked',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_page(p_workspace_id uuid, p_connection_id uuid, p_kind text, p_cursor text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cursor public.marketplace_account_entries; v_items jsonb; v_total bigint; v_next text;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists (select 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id and c.id = p_connection_id and c.marketplace = 'vinted') then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('publication', 'conversation', 'message', 'sale', 'activity') or ((p_kind = 'message') <> (p_parent_id is not null)) then raise exception 'Ungültige Seitenart' using errcode = '22023'; end if;
  if p_kind = 'message' and not exists (select 1 from public.marketplace_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.id = p_parent_id and e.kind = 'conversation') then raise exception 'Gespräch nicht verfügbar' using errcode = '42501'; end if;
  if p_cursor is not null then
    select * into v_cursor from public.marketplace_account_entries e where e.id::text = p_cursor and e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
    if not found then raise exception 'Ungültiger Seitencursor' using errcode = '22023'; end if;
  end if;
  select count(*) into v_total from public.marketplace_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
  with candidates as (
    select e.*, row_number() over (order by e.sort_at desc, e.id desc) as position,
      case when p_kind='conversation' then public.marketplace_conversation_read_version(e.workspace_id,e.connection_id,e.id) end as current_read_version
    from public.marketplace_account_entries e
    where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id
      and (p_cursor is null or (e.sort_at, e.id) < (v_cursor.sort_at, v_cursor.id))
    order by e.sort_at desc, e.id desc limit 51
  )
  select coalesce(jsonb_agg((e.body || jsonb_build_object('id', e.id, 'workspaceId', e.workspace_id, 'connectionId', e.connection_id)
    || case when p_kind='conversation' then jsonb_build_object('readVersion',e.current_read_version,
      'unread',case when e.body->>'unread'='true' and e.conversation_read_version=e.current_read_version then 'false'::jsonb else e.body->'unread' end) else '{}'::jsonb end
    || case when p_kind = 'message' then jsonb_build_object('conversationId', e.parent_id, 'externalId', e.external_id,
      -- Nur bestätigte Versandbelege zu diesem Konto und Gespräch kennzeichnen; Anbietertexte sind keine Herkunftsbelege.
      'isAutomated', coalesce(e.body->>'direction' = 'outbound', false) and exists (
        select 1 from public.marketplace_favorite_message_events f
        join public.marketplace_account_entries conversation on conversation.id = e.parent_id
          and conversation.workspace_id = e.workspace_id and conversation.connection_id = e.connection_id and conversation.kind = 'conversation'
        where f.workspace_id = e.workspace_id and f.connection_id = e.connection_id and f.state = 'sent'
          and f.external_message_id = e.external_id
          and (f.external_conversation_id is null or f.external_conversation_id = conversation.external_id)
      )) else '{}'::jsonb end) order by e.position) filter (where e.position <= 50), '[]'::jsonb),
    case when count(*) > 50 then max(e.id::text) filter (where e.position = 50) else null end
    into v_items, v_next from candidates e;
  return jsonb_build_object('items', v_items, 'total', v_total, 'nextCursor', v_next);
end;
$function$
;
revoke all on function public.marketplace_conversation_read_version(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketplace_conversation_read_version(uuid,uuid,uuid) to authenticated;
revoke all on function public.marketplace_mark_conversation_read(uuid,uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.marketplace_mark_conversation_read(uuid,uuid,uuid,text,timestamptz) to authenticated;
