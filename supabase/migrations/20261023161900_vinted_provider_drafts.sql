-- Vinted-Entwuerfe aus dem Kleiderschrank ausnehmen und Verkaufsmerkmale erhalten.
-- Betroffen: marketplace_visible_account_entries und marketplace_preserve_vinted_sale.
-- Automatisch durch Supabase pg-delta erzeugt, nur aeussere SQL-Schluesselwoerter normalisiert.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_preserve_vinted_sale()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare v_previous jsonb; v_account text; v_ids jsonb; v_state_at timestamptz; v_previous_at timestamptz; v_item jsonb;
begin
  if new.kind<>'sale' or not (new.body ? 'saleState') then return new; end if;
  select external_account_id into v_account from public.marketplace_connections
    where workspace_id=new.workspace_id and id=new.connection_id and marketplace='vinted';
  if not found then return new; end if;
  if jsonb_typeof(new.body->'saleState') is distinct from 'string'
    or new.body->>'saleState' not in ('sold','shipped','completed','cancelled','relisted')
    or new.body->>'sellerId' is distinct from v_account
    or jsonb_typeof(new.body->'itemIds') is distinct from 'array'
    or jsonb_array_length(new.body->'itemIds')>100
    or exists(select 1 from jsonb_array_elements(new.body->'itemIds') item where jsonb_typeof(item)<>'string' or item#>>'{}' !~ '^[1-9][0-9]{0,31}$')
    or not (new.body ? 'itemCount')
    or (case when new.body->'itemCount'='null'::jsonb then false
      when jsonb_typeof(new.body->'itemCount')='number' and pg_input_is_valid(new.body->>'itemCount','integer')
      then (new.body->>'itemCount')::integer not between 1 and 100 or (new.body->>'itemCount')::integer<jsonb_array_length(new.body->'itemIds')
      else true end)
    or jsonb_typeof(new.body->'externalConversationId') is distinct from 'string'
    or new.body->>'externalConversationId' !~ '^[1-9][0-9]{0,31}$'
  then raise exception 'Ungültiger Vinted-Verkaufsbeleg' using errcode='22023'; end if;
  if tg_op='UPDATE' then v_previous:=old.body;
  else select e.body into v_previous from public.marketplace_account_entries e
    where e.workspace_id=new.workspace_id and e.connection_id=new.connection_id and e.kind='sale' and e.external_id=new.external_id;
  end if;
  if v_previous->>'sellerId' is distinct from v_account then v_previous:=null; end if;
  if public.marketplace_publication_time_valid(new.body->>'saleStateAt',new.observed_at) then v_state_at:=(new.body->>'saleStateAt')::timestamptz; end if;
  if public.marketplace_publication_time_valid(v_previous->>'saleStateAt',new.observed_at) then v_previous_at:=(v_previous->>'saleStateAt')::timestamptz; end if;
  -- Ältere oder verkürzte Gesprächsausschnitte dürfen eine spätere Stornierung nicht zurücknehmen.
  if (v_previous->>'saleState'='relisted' and new.body->>'saleState'<>'relisted')
    or (v_previous->>'saleState'='cancelled' and new.body->>'saleState' not in ('cancelled','relisted'))
    or (v_previous_at is not null and (v_state_at is null or v_previous_at>v_state_at
    or (v_previous_at=v_state_at and v_previous->>'saleState' in ('cancelled','relisted') and new.body->>'saleState' not in ('cancelled','relisted'))))
  then new.body:=new.body||jsonb_build_object('saleState',v_previous->'saleState','saleStateAt',v_previous->'saleStateAt','status',v_previous->'status');
    new.sort_at:=v_previous_at;
  end if;
  if jsonb_typeof(v_previous->'itemIds')='array' then
    select coalesce(jsonb_agg(distinct item),'[]'::jsonb) into v_ids
      from jsonb_array_elements((new.body->'itemIds')||(v_previous->'itemIds')) item;
    new.body:=new.body||jsonb_build_object('itemIds',v_ids,'itemCount',nullif(greatest((new.body->>'itemCount')::integer,(v_previous->>'itemCount')::integer,jsonb_array_length(v_ids)),0));
  end if;
  if public.marketplace_publication_time_valid(v_previous->>'occurredAt',new.observed_at)
    and (not public.marketplace_publication_time_valid(new.body->>'occurredAt',new.observed_at) or (v_previous->>'occurredAt')::timestamptz<(new.body->>'occurredAt')::timestamptz)
  then new.body:=new.body||jsonb_build_object('occurredAt',v_previous->'occurredAt'); end if;
  if new.body->>'price' is null and jsonb_typeof(v_previous->'price')='number' then
    new.body:=new.body||jsonb_build_object('price',v_previous->'price','currency',v_previous->'currency');
  end if;
  -- Verkaufte Artikel fehlen später in der Anbieterliste. Ihre gesicherten Merkmale bleiben erhalten.
  if jsonb_array_length(new.body->'itemIds')=1 and (new.body->>'itemCount')::integer=1 then
    select e.body into v_item from public.marketplace_account_entries e
    where e.workspace_id=new.workspace_id and e.connection_id=new.connection_id and e.kind='publication'
      and e.external_id=new.body->'itemIds'->>0;
    new.body:=new.body||jsonb_build_object(
      'brand',coalesce(nullif(new.body->>'brand',''),nullif(v_previous->>'brand',''),nullif(v_item->>'brand','')),
      'size',coalesce(nullif(new.body->>'size',''),nullif(v_previous->>'size',''),nullif(v_item->>'size',''))
    );
  end if;
  return new;
end;
$function$;

create or replace view public.marketplace_visible_account_entries with (security_invoker=true) as select id,
    workspace_id,
    connection_id,
    kind,
    external_id,
    parent_id,
    body,
    sort_at,
    observed_at,
    favorite_notification_version,
    conversation_read_version
   from public.marketplace_account_entries e
  where ((kind <> 'publication'::text) or ((not ((coalesce((body ->> 'publicationState'::text), 'unknown'::text) = 'draft'::text) and (exists ( select 1
           from public.marketplace_connections draft_account
          where ((draft_account.workspace_id = e.workspace_id) and (draft_account.id = e.connection_id) and (draft_account.marketplace = 'vinted'::text)))))) and coalesce(( select (((sale.body ->> 'saleState'::text) = 'relisted'::text) and ((sale.body ->> 'saleStateAt'::text) is not null) and (sale.sort_at > '1970-01-01 00:00:00+00'::timestamp with time zone) and (e.observed_at >= sale.sort_at) and (coalesce((e.body ->> 'publicationState'::text), 'unknown'::text) = any (array['active'::text, 'reserved'::text])))
           from (public.marketplace_account_entries sale
             join public.marketplace_connections c on (((c.workspace_id = sale.workspace_id) and (c.id = sale.connection_id) and (c.marketplace = 'vinted'::text))))
          where ((sale.workspace_id = e.workspace_id) and (sale.connection_id = e.connection_id) and (sale.kind = 'sale'::text) and ((sale.body ->> 'sellerId'::text) = c.external_account_id) and ((sale.body ->> 'saleState'::text) = any (array['sold'::text, 'shipped'::text, 'completed'::text, 'cancelled'::text, 'relisted'::text])) and ((sale.body -> 'itemIds'::text) ? e.external_id))
          order by (((sale.body ->> 'saleState'::text) <> 'relisted'::text) and (sale.sort_at <= '1970-01-01 00:00:00+00'::timestamp with time zone)) desc, sale.sort_at desc, sale.id desc
         limit 1), true)));