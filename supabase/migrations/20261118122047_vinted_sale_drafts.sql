-- Erstellt Vinted-Verkaufsentwürfe aus bestätigten Verkäufen; betroffen sind sale_drafts und vinted_sale_draft_sources.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.marketplace_preserve_vinted_sale()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
    new.body:=new.body||jsonb_build_object('price',v_previous->'price','currency',v_previous->'currency',
      'currencyConfirmed',v_previous->'currencyConfirmed');
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

CREATE FUNCTION public.prepare_vinted_sale_draft()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_seller text := new.body->>'sellerId';
  v_state text := new.body->>'saleState';
  v_title text := left(nullif(btrim(new.body->>'title'),''),500);
  v_source_id uuid;
  v_shop_active boolean;
  v_bundle boolean;
  v_item_ids jsonb := new.body->'itemIds';
  v_item_count integer;
  v_amount numeric(12,2);
  v_currency text;
  v_sale_date text := '';
  v_lines jsonb;
begin
  if v_seller is null or v_state is null or v_state not in ('sold','shipped','completed','cancelled','relisted')
    or not exists (
      select 1 from public.marketplace_connections account
      where account.workspace_id=new.workspace_id and account.id=new.connection_id
        and account.marketplace='vinted' and account.external_account_id=v_seller
    ) then return new; end if;

  if v_state in ('cancelled','relisted') then
    -- Die terminale Transaktion bleibt auch beim Löschen und erneuten Verbinden des Kontos bekannt.
    insert into public.vinted_sale_draft_sources as source (workspace_id,seller_account_id,transaction_id,sale_state,title,is_bundle)
    values(new.workspace_id,v_seller,new.external_id,v_state,coalesce(v_title,'Vinted-Verkauf'),false)
    on conflict (workspace_id,seller_account_id,transaction_id) do update set sale_state=excluded.sale_state
      where source.sale_state not in ('relisted',excluded.sale_state);
    return new;
  end if;
  if not public.workspace_access_is_valid(new.workspace_id) then return new; end if;
  select shop_enabled and shop_entitled into v_shop_active
  from public.workspaces where id=new.workspace_id and archived_at is null;
  if not found then return new; end if;

  -- Der vorhandene Importtrigger hat Artikelkennungen und Anzahl bereits geprüft.
  v_item_count := (new.body->>'itemCount')::integer;
  v_bundle := coalesce(new.body->'isBundle'='true'::jsonb,false)
    or coalesce(v_item_count>1,false) or jsonb_array_length(v_item_ids)>1;
  if jsonb_typeof(new.body->'price')='number' and pg_input_is_valid(new.body->>'price','numeric(12,2)')
    and (new.body->>'price')::numeric>=0 then
    v_amount := (new.body->>'price')::numeric;
  end if;
  if new.body->'currencyConfirmed'='true'::jsonb and new.body->>'currency' ~ '^[A-Z]{3}$' then
    v_currency := new.body->>'currency';
  end if;
  if new.body->'titleConfirmed'='false'::jsonb or (not (new.body ? 'titleConfirmed') and v_title='Verkauf') then
    v_title := null;
  end if;
  if public.marketplace_publication_time_valid(new.body->>'occurredAt',new.observed_at) then
    v_sale_date := ((new.body->>'occurredAt')::timestamptz at time zone 'Europe/Berlin')::date::text;
  end if;

  -- Aktualisierte Anbieterbelege gelten bei der Buchung, ohne den editierbaren Entwurf zu überschreiben.
  update public.vinted_sale_draft_sources source
  set sale_state=v_state, is_bundle=source.is_bundle or v_bundle, item_count=greatest(source.item_count,v_item_count),
    amount=case when v_currency is not null or source.currency is null then coalesce(v_amount,source.amount) else source.amount end,
    currency=case when v_amount is not null then coalesce(v_currency,source.currency) else source.currency end
  where source.workspace_id=new.workspace_id and source.seller_account_id=v_seller and source.transaction_id=new.external_id
    and source.sale_state not in ('cancelled','relisted') and source.booked_at is null
    and (source.sale_state<>v_state or (v_bundle and not source.is_bundle)
      or greatest(source.item_count,v_item_count) is distinct from source.item_count
      or (v_amount is not null and (v_currency is not null or source.currency is null)
        and (v_amount is distinct from source.amount or v_currency is distinct from source.currency)));
  -- Historische Lesekopien werden bei Folgeimporten nicht zu neuen Entwürfen.
  if tg_op<>'INSERT' then return new; end if;

  insert into public.vinted_sale_draft_sources(workspace_id,seller_account_id,transaction_id,sale_state,title,amount,currency,is_bundle,item_count)
  values(new.workspace_id,v_seller,new.external_id,v_state,coalesce(v_title,'Vinted-Verkauf'),v_amount,v_currency,v_bundle,v_item_count)
  on conflict (workspace_id,seller_account_id,transaction_id) do nothing
  returning id into v_source_id;
  if v_source_id is null then return new; end if;

  select jsonb_agg(
    jsonb_build_object(
      'target',case
        when v_shop_active then coalesce('inventory:'||stock.id::text,'')
        when line.title is not null then 'free:'||line.title
        else 'free:' end,
      'quantity',1,
      'unitSalePrice',case when not v_bundle and v_currency='EUR' and v_amount>0 then v_amount end,
      'purchaseId',null,
      'sourceTitle',line.title
    ) order by position.index
  ) into v_lines
  from generate_series(1,greatest(v_item_count,jsonb_array_length(v_item_ids),1)) position(index)
  left join public.marketplace_account_entries listing
    on listing.workspace_id=new.workspace_id and listing.connection_id=new.connection_id
    and listing.kind='publication' and listing.external_id=v_item_ids->>(position.index-1)
  left join lateral (
    select min(candidate.inventory_id) as inventory_id
    from (
      select distinct job.snapshot->>'inventoryItemId' as inventory_id
      from public.marketplace_listing_jobs job
      where v_shop_active and job.workspace_id=new.workspace_id and job.external_account_id=v_seller
        and job.external_id=v_item_ids->>(position.index-1) and job.action='publish' and job.state='confirmed'
        and job.provider_state='active' and job.snapshot->>'inventoryItemId' is not null
      limit 2
    ) candidate
    having count(*)=1
  ) mapping on true
  left join public.inventory_items stock
    on stock.workspace_id=new.workspace_id
    and stock.id=case when pg_input_is_valid(mapping.inventory_id,'uuid') then mapping.inventory_id::uuid end
    and stock.status in ('ready','listed') and stock.archived_at is null and stock.stock_removed_at is null
    and exists (
      select 1 from public.inventory_item_sale_states state
      where state.workspace_id=stock.workspace_id and state.inventory_item_id=stock.id and state.sale_state='no_active_sale'
    )
  cross join lateral (select coalesce(case when not v_bundle then v_title end,
    left(nullif(btrim(listing.body->>'title'),''),500),stock.title) as title) line;

  insert into public.sale_drafts(id,workspace_id,created_by,title,sale_amount,draft,vinted_source_id)
  values(v_source_id,new.workspace_id,null,coalesce(v_title,'Vinted-Verkauf'),
    case when v_currency='EUR' then coalesce(v_amount,0) else 0 end,
    jsonb_build_object('version',1,'lines',v_lines,'platform','vinted','saleDate',v_sale_date,
      'platformFee',null,'shippingCost',null,'shippingRevenue',0,'shippingMode',
      case when new.body->>'shippingLabelAction' in ('order','available') or new.body->'shippingLabelAvailable'='true'::jsonb
        then 'platform_prepaid' else 'unknown' end,
      'additionalCosts','[]'::jsonb,'externalOrderId',new.external_id,'buyerNotes',''),
    v_source_id);
  return new;
end;
$function$;

CREATE FUNCTION public.protect_vinted_sale_draft_source()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if current_user in ('anon','authenticated','service_role')
    and ((tg_op='INSERT' and new.vinted_source_id is not null)
      or (tg_op='UPDATE' and new.vinted_source_id is distinct from old.vinted_source_id)) then
    raise exception 'Die Vinted-Quelle eines Entwurfs wird nur beim Import gesetzt.' using errcode='42501';
  end if;
  return new;
end;
$function$;

CREATE FUNCTION public.record_vinted_sale_draft (
  p_workspace_id uuid,
  p_draft_id     uuid,
  p_sale         jsonb,
  p_lines        jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_source public.vinted_sale_draft_sources;
  v_result jsonb;
  v_sale jsonb;
  v_total numeric;
  v_quantity bigint;
begin
  if (select auth.uid()) is null or not public.can_access_workspace(p_workspace_id) then
    raise exception 'Kein Zugriff auf diesen Workspace.' using errcode='42501';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for share;
  if not found then
    raise exception 'Kein Zugriff auf diesen Workspace.' using errcode='42501';
  end if;
  select * into v_source from public.vinted_sale_draft_sources
  where workspace_id=p_workspace_id and id=p_draft_id for update;
  if not found then
    raise exception 'Dieser Vinted-Entwurf ist nicht verfügbar.' using errcode='42501';
  end if;
  if v_source.booked_at is not null then
    select result into v_result from public.sale_booking_requests where workspace_id=p_workspace_id and booking_key=v_source.booking_key;
    return v_result;
  end if;
  perform 1 from public.sale_drafts where workspace_id=p_workspace_id and vinted_source_id=p_draft_id for update;
  if not found then
    raise exception 'Dieser Vinted-Entwurf ist nicht verfügbar.' using errcode='42501';
  end if;
  if v_source.sale_state in ('cancelled','relisted') then
    raise exception 'Dieser Vinted-Verkauf wurde storniert.' using errcode='22023';
  end if;
  if jsonb_typeof(p_sale) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array'
    or nullif(p_sale->>'sale_date','') is null then
    raise exception 'Die Verkaufsdaten sind unvollständig.' using errcode='22023';
  end if;
  if public.workspace_shop_active(p_workspace_id)
    and exists (select 1 from jsonb_array_elements(p_lines) line where line->>'position_kind'='free') then
    raise exception 'Wähle für jede Vinted-Position einen Bestandsartikel.' using errcode='22023';
  end if;
  if v_source.is_bundle then
    select sum((line->>'quantity')::integer),sum((line->>'quantity')::integer * (line->>'unit_sale_price')::numeric(12,2))
    into v_quantity,v_total
    from jsonb_array_elements(p_lines) line;
    if v_quantity is null or v_quantity<2 or (v_source.item_count is not null and v_quantity<>v_source.item_count)
      or (v_source.currency='EUR' and v_source.amount is not null and v_total is distinct from v_source.amount) then
      raise exception 'Prüfe die Artikelanzahl und die Preisaufteilung des Vinted-Pakets.' using errcode='22023';
    end if;
  end if;

  v_sale := (p_sale - 'correction_sale_id' - 'correction_reason') || jsonb_build_object(
    'booking_key',v_source.booking_key,'platform','vinted','external_order_id',v_source.transaction_id);
  v_result := public.record_sale(p_workspace_id,v_sale,p_lines);
  update public.vinted_sale_draft_sources set booked_at=clock_timestamp() where id=p_draft_id;
  delete from public.sale_drafts where workspace_id=p_workspace_id and vinted_source_id=p_draft_id;
  return v_result;
end;
$function$;

CREATE TRIGGER prepare_vinted_sale_draft
  AFTER INSERT OR UPDATE OF body ON public.marketplace_account_entries
  FOR EACH ROW
  WHEN (new.kind = 'sale'::text)
  EXECUTE FUNCTION public.prepare_vinted_sale_draft();

ALTER TABLE public.sale_drafts
  ADD COLUMN vinted_source_id uuid;

ALTER TABLE public.sale_drafts
  ADD CONSTRAINT sale_drafts_vinted_source_id_check CHECK (vinted_source_id IS NULL OR vinted_source_id = id);

ALTER TABLE public.sale_drafts
  ADD CONSTRAINT sale_drafts_vinted_source_id_key UNIQUE (vinted_source_id);

CREATE TRIGGER protect_vinted_sale_draft_source
  BEFORE INSERT OR UPDATE OF vinted_source_id ON public.sale_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_vinted_sale_draft_source();

CREATE TABLE public.vinted_sale_draft_sources (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id      uuid                     NOT NULL,
  seller_account_id text                     NOT NULL,
  transaction_id    text                     NOT NULL,
  sale_state        text                     NOT NULL,
  title             text                     NOT NULL,
  amount            numeric(12,2),
  currency          text,
  is_bundle         boolean                  NOT NULL,
  item_count        integer,
  booking_key       uuid                     DEFAULT gen_random_uuid() NOT NULL,
  booked_at         timestamp with time zone
);

COMMENT ON TABLE public.vinted_sale_draft_sources IS 'Dauerhafte Zuordnung von Vinted-Transaktionen und Verkaufsentwürfen, auch nach Löschung oder Buchung.';

ALTER TABLE public.vinted_sale_draft_sources
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vinted_sale_draft_sources
  ADD CONSTRAINT vinted_sale_draft_sources_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE public.vinted_sale_draft_sources
  ADD CONSTRAINT vinted_sale_draft_sources_item_count_check CHECK (item_count >= 1 AND item_count <= 100);

ALTER TABLE public.vinted_sale_draft_sources
  ADD CONSTRAINT vinted_sale_draft_sources_pkey PRIMARY KEY (id);

ALTER TABLE public.vinted_sale_draft_sources
  ADD CONSTRAINT vinted_sale_draft_sources_sale_state_check CHECK (sale_state = ANY (ARRAY['sold'::text, 'shipped'::text, 'completed'::text, 'cancelled'::text, 'relisted'::text]));

ALTER TABLE public.vinted_sale_draft_sources
  ADD CONSTRAINT vinted_sale_draft_sources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.vinted_sale_draft_sources
  ADD CONSTRAINT vinted_sale_draft_sources_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE public.sale_drafts
  ADD CONSTRAINT sale_drafts_vinted_source_fk FOREIGN KEY (workspace_id, vinted_source_id) REFERENCES public.vinted_sale_draft_sources(workspace_id, id);

ALTER TABLE public.vinted_sale_draft_sources
  ADD CONSTRAINT vinted_sale_draft_sources_workspace_id_seller_account_id_tr_key UNIQUE (workspace_id, seller_account_id, transaction_id);

CREATE POLICY "Vinted Entwurfsquelle anonym nicht anlegen" ON public.vinted_sale_draft_sources
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "Vinted Entwurfsquelle anonym nicht lesen" ON public.vinted_sale_draft_sources
  FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "Vinted Entwurfsquelle anonym nicht löschen" ON public.vinted_sale_draft_sources
  FOR DELETE
  TO anon
  USING (false);

CREATE POLICY "Vinted Entwurfsquelle anonym nicht ändern" ON public.vinted_sale_draft_sources
  FOR UPDATE
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Vinted Entwurfsquelle lesen" ON public.vinted_sale_draft_sources
  FOR SELECT
  TO authenticated
  USING (( SELECT public.can_access_workspace(vinted_sale_draft_sources.workspace_id) AS can_access_workspace));

CREATE POLICY "Vinted Entwurfsquelle nicht anlegen" ON public.vinted_sale_draft_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Vinted Entwurfsquelle nicht löschen" ON public.vinted_sale_draft_sources
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "Vinted Entwurfsquelle nicht ändern" ON public.vinted_sale_draft_sources
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

revoke all on public.vinted_sale_draft_sources from public,anon,authenticated,service_role;

grant select(id,workspace_id,sale_state,title,amount,currency,is_bundle,item_count)
  on public.vinted_sale_draft_sources to authenticated;

revoke all on function public.protect_vinted_sale_draft_source() from public,anon,authenticated,service_role;

revoke all on function public.prepare_vinted_sale_draft() from public,anon,authenticated,service_role;

revoke all on function public.record_vinted_sale_draft(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

grant execute on function public.record_vinted_sale_draft(uuid,uuid,jsonb,jsonb) to authenticated;
