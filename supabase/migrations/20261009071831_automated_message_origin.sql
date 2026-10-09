-- Bestätigte automatische Vinted-Nachrichten in der privaten Chatansicht kennzeichnen.
-- Betrifft marketplace_read_page und den Versandbeleg-Index; keine Anbieter-Schreibaktion.

CREATE INDEX marketplace_favorite_message_events_sent_message ON public.marketplace_favorite_message_events USING btree (workspace_id, connection_id, external_message_id) WHERE ((state = 'sent'::text) AND (external_message_id IS NOT NULL));

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
    select e.*, row_number() over (order by e.sort_at desc, e.id desc) as position
    from public.marketplace_account_entries e
    where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id
      and (p_cursor is null or (e.sort_at, e.id) < (v_cursor.sort_at, v_cursor.id))
    order by e.sort_at desc, e.id desc limit 51
  )
  select coalesce(jsonb_agg((e.body || jsonb_build_object('id', e.id, 'workspaceId', e.workspace_id, 'connectionId', e.connection_id)
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
