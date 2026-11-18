create table public.vinted_sale_draft_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  seller_account_id text not null,
  transaction_id text not null,
  sale_state text not null check (sale_state in ('sold','shipped','completed','cancelled','relisted')),
  title text not null,
  amount numeric(12,2),
  currency text check (currency ~ '^[A-Z]{3}$'),
  is_bundle boolean not null,
  item_count integer check (item_count between 1 and 100),
  booking_key uuid not null default gen_random_uuid(),
  booked_at timestamptz,
  unique (workspace_id,seller_account_id,transaction_id),
  unique (workspace_id,id)
);
comment on table public.vinted_sale_draft_sources is 'Dauerhafte Zuordnung von Vinted-Transaktionen und Verkaufsentwürfen, auch nach Löschung oder Buchung.';
alter table public.vinted_sale_draft_sources enable row level security;
revoke all on public.vinted_sale_draft_sources from public,anon,authenticated,service_role;
grant select(id,workspace_id,sale_state,title,amount,currency,is_bundle,item_count)
  on public.vinted_sale_draft_sources to authenticated;
create policy "Vinted Entwurfsquelle lesen" on public.vinted_sale_draft_sources for select to authenticated
  using ((select public.can_access_workspace(workspace_id)));
create policy "Vinted Entwurfsquelle nicht anlegen" on public.vinted_sale_draft_sources for insert to authenticated with check(false);
create policy "Vinted Entwurfsquelle nicht ändern" on public.vinted_sale_draft_sources for update to authenticated using(false) with check(false);
create policy "Vinted Entwurfsquelle nicht löschen" on public.vinted_sale_draft_sources for delete to authenticated using(false);
create policy "Vinted Entwurfsquelle anonym nicht lesen" on public.vinted_sale_draft_sources for select to anon using(false);
create policy "Vinted Entwurfsquelle anonym nicht anlegen" on public.vinted_sale_draft_sources for insert to anon with check(false);
create policy "Vinted Entwurfsquelle anonym nicht ändern" on public.vinted_sale_draft_sources for update to anon using(false) with check(false);
create policy "Vinted Entwurfsquelle anonym nicht löschen" on public.vinted_sale_draft_sources for delete to anon using(false);

alter table public.sale_drafts
  add column vinted_source_id uuid unique,
  add constraint sale_drafts_vinted_source_fk foreign key (workspace_id,vinted_source_id)
    references public.vinted_sale_draft_sources(workspace_id,id),
  add constraint sale_drafts_vinted_source_id_check check (vinted_source_id is null or vinted_source_id=id);
create function public.protect_vinted_sale_draft_source()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('anon','authenticated','service_role')
    and ((tg_op='INSERT' and new.vinted_source_id is not null)
      or (tg_op='UPDATE' and new.vinted_source_id is distinct from old.vinted_source_id)) then
    raise exception 'Die Vinted-Quelle eines Entwurfs wird nur beim Import gesetzt.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_vinted_sale_draft_source() from public,anon,authenticated,service_role;
create trigger protect_vinted_sale_draft_source
before insert or update of vinted_source_id on public.sale_drafts
for each row execute function public.protect_vinted_sale_draft_source();

create function public.prepare_vinted_sale_draft()
returns trigger
language plpgsql security definer set search_path = ''
as $$
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
$$;
revoke all on function public.prepare_vinted_sale_draft() from public,anon,authenticated,service_role;
create trigger prepare_vinted_sale_draft
after insert or update of body on public.marketplace_account_entries
for each row when (new.kind='sale') execute function public.prepare_vinted_sale_draft();

create function public.record_vinted_sale_draft(p_workspace_id uuid,p_draft_id uuid,p_sale jsonb,p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
$$;
revoke all on function public.record_vinted_sale_draft(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_vinted_sale_draft(uuid,uuid,jsonb,jsonb) to authenticated;
