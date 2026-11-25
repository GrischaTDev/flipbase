-- Gemeinsamer workspacegebundener Leser für Vinted-Listen, Filter und Seitencursor.
create function public.marketplace_read_vinted_list (
  p_workspace_id  uuid,
  p_kind          text,
  p_cursor        text    DEFAULT NULL::text,
  p_query         text    DEFAULT ''::text,
  p_filter        text    DEFAULT 'all'::text,
  p_oldest_first  boolean DEFAULT false,
  p_connection_id uuid    DEFAULT NULL::uuid,
  p_entry_id      uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_cursor jsonb;
  v_sort_at timestamptz;
  v_entry_id uuid;
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_scope jsonb;
  v_result jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('publication', 'provider_draft', 'conversation', 'sale', 'activity')
    or p_filter is null or p_filter not in ('all', 'unread', 'questions', 'negotiating', 'sold', 'system')
    or (p_kind <> 'conversation' and p_filter <> 'all')
    or p_oldest_first is null
    or length(v_query) > 160
    or (p_entry_id is not null and (p_connection_id is null or p_cursor is not null)) then
    raise exception 'Ungültige Vinted-Liste' using errcode = '22023';
  end if;
  if p_connection_id is not null and not exists (
    select 1 from public.marketplace_connections c
    where c.workspace_id=p_workspace_id and c.id=p_connection_id and c.marketplace='vinted'
  ) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;

  v_scope := jsonb_build_array(p_workspace_id, p_kind, v_query, p_filter, p_oldest_first, p_connection_id,
    (select jsonb_agg(c.id order by c.id) from public.marketplace_connections c
     where c.workspace_id=p_workspace_id and c.marketplace='vinted'
       and (p_connection_id is null or c.id=p_connection_id)));
  if p_cursor is not null then
    if length(p_cursor) > 1200 then
      raise exception 'Ungültiger Vinted-Listenzeiger' using errcode = '22023';
    end if;
    v_cursor := p_cursor::jsonb;
    v_sort_at := (v_cursor->>'at')::timestamptz;
    v_entry_id := (v_cursor->>'id')::uuid;
    if v_cursor->'scope' is distinct from v_scope or v_sort_at is null or not isfinite(v_sort_at)
      or v_entry_id is null then
      raise exception 'Ungültiger Vinted-Listenzeiger' using errcode = '22023';
    end if;
  end if;

  with visible as (
    select e.* from public.marketplace_visible_account_entries e
    where p_kind <> 'provider_draft' and e.workspace_id=p_workspace_id and e.kind=p_kind
    union all
    select e.* from public.marketplace_account_entries e
    where p_kind='provider_draft' and e.workspace_id=p_workspace_id and e.kind='publication'
      and e.body->>'publicationState'='draft'
  ), entries as (
    select e.*, case when p_kind='conversation'
      then public.marketplace_conversation_read_version(e.workspace_id,e.connection_id,e.id)
      end as read_version
    from visible e
    join public.marketplace_connections c on c.workspace_id=e.workspace_id and c.id=e.connection_id
      and c.marketplace='vinted'
    where e.parent_id is null
      and (p_connection_id is null or e.connection_id=p_connection_id)
      and (p_entry_id is null or e.id=p_entry_id)
      and (p_kind <> 'sale' or e.body->>'saleState' is distinct from 'relisted')
      and (v_query = '' or strpos(lower(concat_ws(' ',e.body->>'title',
        coalesce(e.body->>'text',e.body->>'message',e.body->>'lastMessage'),e.body->>'itemTitle')),v_query)>0)
  ), categorized as (
    select e.*,
      coalesce(e.body->>'unread'='true' and e.conversation_read_version is distinct from e.read_version, false) as unread,
      coalesce(strpos(coalesce(e.body->>'text',e.body->>'message',e.body->>'lastMessage'),'?')>0, false)
        and coalesce(e.body->>'messageType','') not in
          ('status_message','action_message','payment_message','offer_request_message','offer_message') as questions,
      coalesce(e.body->>'messageType' in ('offer_request_message','offer_message')
        or e.body->>'offerStatus'='pending' or e.body->>'transactionStatus'='negotiating', false) as negotiating,
      coalesce(e.body->>'transactionStatus' in ('sold','completed','transaction_completed')
        or e.body->>'eventType'='transaction_completed', false) as sold,
      coalesce(e.body->>'messageType' in ('status_message','action_message','payment_message')
        or lower(e.body->>'title') in ('vinted','support_vinted'), false) as system
    from entries e
  ), filtered as (
    select e.* from categorized e where case p_filter
      when 'unread' then e.unread when 'questions' then e.questions
      when 'negotiating' then e.negotiating when 'sold' then e.sold
      when 'system' then e.system else true end
  ), more as (
    select e.* from filtered e
    where p_cursor is null or case when p_oldest_first
      then (e.sort_at,e.id)>(v_sort_at,v_entry_id) else (e.sort_at,e.id)<(v_sort_at,v_entry_id) end
    order by case when p_oldest_first then e.sort_at end asc,
      case when p_oldest_first then e.id end asc, e.sort_at desc, e.id desc
    limit 51
  ), page as (
    select e.*, row_number() over (
      order by case when p_oldest_first then e.sort_at end asc,
        case when p_oldest_first then e.id end asc,e.sort_at desc,e.id desc
      ) as position
    from more e
  ), rendered as (
    select e.position, e.body || jsonb_build_object('id',e.id,'workspaceId',e.workspace_id,
      'connectionId',e.connection_id,'externalId',e.external_id)
      || case when p_kind='conversation' then jsonb_build_object('readVersion',e.read_version,
        'unread',case when e.body->>'unread'='true' then to_jsonb(e.unread) else e.body->'unread' end)
        || coalesce((select jsonb_build_object('itemPrice',publication.body->'price','itemCurrency',publication.body->'currency')
          from public.marketplace_account_entries publication
          where publication.workspace_id=e.workspace_id and publication.connection_id=e.connection_id
            and publication.kind='publication' and publication.external_id=e.body->>'itemId'
            and e.body->>'isBundle' is distinct from 'true'
            and case when jsonb_typeof(publication.body->'price')='number'
              then (publication.body->>'price')::numeric>=0 else false end
            and publication.body->>'currency' ~ '^[A-Z]{3}$'),'{}'::jsonb)
        else '{}'::jsonb end
      || case when p_kind='sale' then jsonb_build_object('conversationId',(
        select conversation.id from public.marketplace_account_entries conversation
        where conversation.workspace_id=e.workspace_id and conversation.connection_id=e.connection_id
          and conversation.kind='conversation' and conversation.external_id=e.body->>'externalConversationId'
      )) else '{}'::jsonb end as body
    from page e where e.position<=50
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(e.body order by e.position) from rendered e),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'nextCursor',case when exists (select 1 from page where position=51) then (
      select jsonb_build_object('scope',v_scope,'at',e.sort_at,'id',e.id)::text from page e where position=50
    ) else null end,
    'filterCounts',case when p_kind='conversation' then (
      select jsonb_build_object('unread',count(*) filter (where unread),'questions',count(*) filter (where questions),
        'negotiating',count(*) filter (where negotiating),'sold',count(*) filter (where sold),
        'system',count(*) filter (where system)) from categorized
    ) else '{}'::jsonb end
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.marketplace_read_vinted_list(uuid,text,text,text,text,boolean,uuid,uuid) from public, anon;
grant execute on function public.marketplace_read_vinted_list(uuid,text,text,text,text,boolean,uuid,uuid) to authenticated;
