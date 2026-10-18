-- Zweck: Automatische Favoriten- und Gegenangebote im Chat anhand bestätigter Versandbelege kennzeichnen.
-- Betroffen: marketplace_read_page, marketplace_favorite_message_events und marketplace_negotiation_jobs (nur Indizes).
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_read_page (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_kind          text,
  p_cursor        text default null::text,
  p_parent_id     uuid default null::uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
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
      'isAutomated', coalesce(e.body->>'direction' = 'outbound', false) and (exists (
        select 1 from public.marketplace_favorite_message_events f
        join public.marketplace_account_entries conversation on conversation.id = e.parent_id
          and conversation.workspace_id = e.workspace_id and conversation.connection_id = e.connection_id and conversation.kind = 'conversation'
        join public.marketplace_connections connection on connection.workspace_id=f.workspace_id and connection.id=f.connection_id
        where f.workspace_id = e.workspace_id and f.connection_id = e.connection_id and f.state = 'sent'
          and (f.external_account_id is null or f.external_account_id=connection.external_account_id)
          and (
            (f.external_message_id=e.external_id and coalesce(e.body->>'messageType','') not in ('offer_message','offer_request_message'))
            or (f.offer_state='sent' and f.external_offer_id=e.external_id
              and e.body->>'messageType' in ('offer_message','offer_request_message')
              and f.external_conversation_id=conversation.external_id)
          )
          and (f.external_conversation_id is null or f.external_conversation_id = conversation.external_id)
      ) or exists (
        select 1 from public.marketplace_negotiation_jobs job
        join public.marketplace_connections connection on connection.workspace_id=job.workspace_id and connection.id=job.connection_id
          and connection.external_account_id=job.external_account_id
        join public.marketplace_account_entries conversation on conversation.id=e.parent_id
          and conversation.workspace_id=e.workspace_id and conversation.connection_id=e.connection_id and conversation.kind='conversation'
        where job.workspace_id=e.workspace_id and job.connection_id=e.connection_id and job.conversation_id=e.parent_id
          and job.automated and job.state='sent' and (
            (job.action='message' and job.command->>'kind'='message'
              and coalesce(e.body->>'messageType','') not in ('offer_message','offer_request_message'))
            or (job.action='counter' and job.command->>'kind'='offer'
              and e.body->>'messageType' in ('offer_message','offer_request_message'))
          )
          and job.external_id=e.external_id and job.command->>'externalConversationId'=conversation.external_id
      ))) else '{}'::jsonb end) order by e.position) filter (where e.position <= 50), '[]'::jsonb),
    case when count(*) > 50 then max(e.id::text) filter (where e.position = 50) else null end
    into v_items, v_next from candidates e;
  return jsonb_build_object('items', v_items, 'total', v_total, 'nextCursor', v_next);
end;
$function$;

create index marketplace_favorite_message_events_sent_offer on public.marketplace_favorite_message_events (workspace_id, connection_id, external_offer_id)
  where state = 'sent'::text and offer_state = 'sent'::text and external_offer_id is not null;

create index marketplace_negotiation_jobs_offer_origin on public.marketplace_negotiation_jobs (workspace_id, connection_id, conversation_id, external_id)
  where automated and state = 'sent'::text and action = 'counter'::text and (command ->> 'kind'::text) = 'offer'::text;