-- Bestätigte Artikelzuordnung und bewusste, atomare eBay-Verkaufsübernahme.
create table public.ebay_article_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check (environment in ('production', 'sandbox')),
  external_account_id text not null,
  listing_id text not null check (char_length(listing_id) between 1 and 256),
  variation_id text check (char_length(variation_id) between 1 and 256),
  inventory_item_id uuid,
  catalog_product_id uuid,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(inventory_item_id, catalog_product_id) = 1),
  foreign key (workspace_id, inventory_item_id) references public.inventory_items(workspace_id, id) on delete cascade,
  foreign key (workspace_id, catalog_product_id) references public.catalog_products(workspace_id, id) on delete cascade,
  unique nulls not distinct (workspace_id, environment, external_account_id, listing_id, variation_id)
);
comment on table public.ebay_article_mappings is 'Ausdrücklich bestätigte Inserat-/Variantenziele für ein persönlich verbundenes eBay-Konto.';
create index ebay_article_mappings_inventory on public.ebay_article_mappings(workspace_id, inventory_item_id);
create index ebay_article_mappings_catalog on public.ebay_article_mappings(workspace_id, catalog_product_id);
alter table public.ebay_article_mappings enable row level security;
revoke all on public.ebay_article_mappings from public, anon, authenticated;
grant select (id, workspace_id, environment, listing_id, variation_id, inventory_item_id, catalog_product_id, updated_by, updated_at) on public.ebay_article_mappings to authenticated;
grant all on public.ebay_article_mappings to service_role;
create policy "Users read mappings for their eBay account" on public.ebay_article_mappings
for select to authenticated using (
  public.ebay_can_connect(workspace_id) and exists (
    select 1 from public.ebay_connections c where c.workspace_id = ebay_article_mappings.workspace_id
      and c.user_id = (select auth.uid()) and c.status = 'connected'
      and c.environment = ebay_article_mappings.environment and c.external_account_id = ebay_article_mappings.external_account_id
  )
);

create table public.ebay_order_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null references public.ebay_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  authorization_version bigint not null,
  environment text not null check (environment in ('production', 'sandbox')),
  external_account_id text not null,
  source_key text not null check (source_key ~ '^[0-9a-f]{64}$'),
  review_hash text not null check (review_hash ~ '^[0-9a-f]{64}$'),
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  booking_ready boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + case when booking_ready then interval '30 seconds' else interval '5 minutes' end)
);
comment on table public.ebay_order_snapshots is 'Private, kurzlebige normalisierte Bestellprüfung; keine Käuferanschriften oder OAuth-Tokens.';
create index ebay_order_snapshots_connection on public.ebay_order_snapshots(connection_id, expires_at);
create index ebay_order_snapshots_user on public.ebay_order_snapshots(user_id, workspace_id);
alter table public.ebay_order_snapshots enable row level security;
revoke all on public.ebay_order_snapshots from public, anon, authenticated;
grant all on public.ebay_order_snapshots to service_role;

create table public.ebay_order_bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  environment text not null check (environment in ('production', 'sandbox')),
  source_key text not null check (source_key ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('imported', 'recorded_elsewhere')),
  sale_id uuid,
  source_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(source_lines) = 'array'),
  reason text,
  recorded_by uuid references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, sale_id) references public.sales(workspace_id, id) on delete restrict,
  unique (workspace_id, environment, source_key),
  check ((status = 'imported' and sale_id is not null and reason is null)
    or (status = 'recorded_elsewhere' and char_length(trim(reason)) between 1 and 500))
);
comment on table public.ebay_order_bookings is 'Minimaler dauerhafter Geschäftsbeleg gegen Doppelübernahmen, unabhängig vom OAuth-Lebenszyklus.';
create index ebay_order_bookings_sale on public.ebay_order_bookings(workspace_id, sale_id);
create index ebay_order_bookings_actor on public.ebay_order_bookings(recorded_by);
alter table public.ebay_order_bookings enable row level security;
revoke all on public.ebay_order_bookings from public, anon, authenticated;
grant all on public.ebay_order_bookings to service_role;
create trigger "00_protect_archived_workspace" before insert or update or delete on public.ebay_order_bookings
for each row execute function public.protect_archived_workspace_data();

-- Privater Sperrbaustein: Mitgliedschaft → Workspace → persönliche Verbindung.
-- Dienstfunktionen laufen mit bestätigtem p_user_id; Nutzerfunktionen über auth.uid().
create or replace function public.ebay_lock_import_connection(p_user_id uuid, p_workspace_id uuid, p_connection_id uuid)
returns public.ebay_connections language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections;
begin
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_connection from public.ebay_connections where id = p_connection_id
    and workspace_id = p_workspace_id and user_id = p_user_id and status = 'connected'
    and external_account_id is not null for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  return v_connection;
end;
$$;
revoke all on function public.ebay_lock_import_connection(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.ebay_lock_import_connection(uuid,uuid,uuid) to service_role;

create or replace function public.ebay_valid_cents(p_value jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number' and p_value::text ~ '^(0|[1-9][0-9]{0,11})$'
    then (p_value::text)::numeric <= 999999999999 else false end;
$$;
revoke all on function public.ebay_valid_cents(jsonb) from public, anon, authenticated;
grant execute on function public.ebay_valid_cents(jsonb) to service_role;

create or replace function public.ebay_import_target(p_workspace_id uuid, p_target jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if jsonb_typeof(p_target) is distinct from 'object' then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(p_target)) <> 1 then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
  if p_target ? 'catalogProductId' then
    v_id := (p_target->>'catalogProductId')::uuid;
    if not exists (select 1 from public.catalog_products where id = v_id and workspace_id = p_workspace_id
      and archived_at is null and tracking_mode = 'quantity') then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
    return jsonb_build_object('catalog_product_id', v_id);
  elsif p_target ? 'inventoryItemId' then
    v_id := (p_target->>'inventoryItemId')::uuid;
    if not exists (select 1 from public.inventory_items where id = v_id and workspace_id = p_workspace_id
      and archived_at is null) then raise exception 'Ungültiger Artikel' using errcode = '22023'; end if;
    return jsonb_build_object('inventory_item_id', v_id);
  end if;
  raise exception 'Ungültiger Artikel' using errcode = '22023';
end;
$$;
revoke all on function public.ebay_import_target(uuid,jsonb) from public, anon, authenticated;

create or replace function public.ebay_set_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_listing_id text, p_variation_id text, p_target jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_connection public.ebay_connections; v_target jsonb; v_mapping public.ebay_article_mappings;
begin
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if p_listing_id is null or char_length(trim(p_listing_id)) not between 1 and 256
    or (p_variation_id is not null and char_length(trim(p_variation_id)) not between 1 and 256)
  then raise exception 'Ungültiges Inserat' using errcode = '22023'; end if;
  v_target := public.ebay_import_target(p_workspace_id,p_target);
  insert into public.ebay_article_mappings(workspace_id,environment,external_account_id,listing_id,variation_id,inventory_item_id,catalog_product_id,updated_by)
    values (p_workspace_id,v_connection.environment,v_connection.external_account_id,p_listing_id,p_variation_id,
      (v_target->>'inventory_item_id')::uuid,(v_target->>'catalog_product_id')::uuid,(select auth.uid()))
    on conflict (workspace_id,environment,external_account_id,listing_id,variation_id) do update
      set inventory_item_id = excluded.inventory_item_id, catalog_product_id = excluded.catalog_product_id,
        updated_by = excluded.updated_by, updated_at = clock_timestamp() returning * into v_mapping;
  return jsonb_build_object('id',v_mapping.id,'listingId',v_mapping.listing_id,'variationId',v_mapping.variation_id,'target',p_target);
end;
$$;
revoke all on function public.ebay_set_article_mapping(uuid,uuid,text,text,jsonb) from public, anon, service_role;
grant execute on function public.ebay_set_article_mapping(uuid,uuid,text,text,jsonb) to authenticated;

create or replace function public.ebay_remove_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_mapping_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_connection public.ebay_connections;
begin
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  delete from public.ebay_article_mappings where id = p_mapping_id and workspace_id = p_workspace_id
    and environment = v_connection.environment and external_account_id = v_connection.external_account_id;
  return found;
end;
$$;
revoke all on function public.ebay_remove_article_mapping(uuid,uuid,uuid) from public, anon, service_role;
grant execute on function public.ebay_remove_article_mapping(uuid,uuid,uuid) to authenticated;

create or replace function public.ebay_get_order_booking(p_user_id uuid, p_connection_id uuid, p_source_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections; v_booking public.ebay_order_bookings;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id;
  v_connection := public.ebay_lock_import_connection(p_user_id,v_connection.workspace_id,p_connection_id);
  if p_source_key is null or p_source_key !~ '^[0-9a-f]{64}$' then raise exception 'Ungültige Quelle' using errcode = '22023'; end if;
  select * into v_booking from public.ebay_order_bookings where workspace_id = v_connection.workspace_id
    and environment = v_connection.environment and source_key = p_source_key;
  if not found then return jsonb_build_object('status','unrecorded','saleId',null); end if;
  return jsonb_build_object('status',v_booking.status,'saleId',v_booking.sale_id)
    || case when v_booking.status = 'imported' then jsonb_build_object('alreadyRecorded',true) else '{}'::jsonb end;
end;
$$;
revoke all on function public.ebay_get_order_booking(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.ebay_get_order_booking(uuid,uuid,text) to service_role;

create or replace function public.ebay_store_order_snapshot(p_user_id uuid, p_connection_id uuid, p_version bigint, p_operation_id uuid, p_source_key text, p_review_hash text, p_source jsonb, p_booking_ready boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_now timestamptz := clock_timestamp(); v_assignments jsonb;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id;
  v_connection := public.ebay_lock_import_connection(p_user_id,v_connection.workspace_id,p_connection_id);
  if v_connection.authorization_version is distinct from p_version or v_connection.operation_id is distinct from p_operation_id
    or p_operation_id is null or v_connection.operation_expires_at <= clock_timestamp()
  then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_source_key is null or p_source_key !~ '^[0-9a-f]{64}$' or p_review_hash is null or p_review_hash !~ '^[0-9a-f]{64}$'
    or p_booking_ready is null or jsonb_typeof(p_source) is distinct from 'object'
    or jsonb_typeof(p_source->'lines') is distinct from 'array' or jsonb_array_length(p_source->'lines') > 200
    or jsonb_typeof(p_source->'blockers') is distinct from 'array'
    or char_length(p_source->>'orderId') not between 1 and 256 or p_source->>'orderId' is null
    or octet_length(p_source::text) > 262144
  then raise exception 'Ungültige Quelle' using errcode = '22023'; end if;
  -- Begrenzte Bereinigung nur für das gerade bestätigte persönliche Konto.
  delete from public.ebay_order_snapshots where id in (
    select id from public.ebay_order_snapshots where connection_id = p_connection_id and expires_at <= v_now
      order by expires_at limit 100
  );
  insert into public.ebay_order_snapshots(workspace_id,connection_id,user_id,authorization_version,environment,external_account_id,source_key,review_hash,source,booking_ready,created_at,expires_at)
    values (v_connection.workspace_id,p_connection_id,p_user_id,p_version,v_connection.environment,v_connection.external_account_id,
      p_source_key,p_review_hash,p_source,p_booking_ready,v_now,v_now + case when p_booking_ready then interval '30 seconds' else interval '5 minutes' end)
    returning * into v_snapshot;
  select coalesce(jsonb_agg(jsonb_build_object('lineItemId',line->>'lineItemId','target',
    case when m.inventory_item_id is not null then jsonb_build_object('inventoryItemId',m.inventory_item_id)
      else jsonb_build_object('catalogProductId',m.catalog_product_id) end)), '[]'::jsonb) into v_assignments
    from jsonb_array_elements(p_source->'lines') line join public.ebay_article_mappings m
      on m.workspace_id = v_connection.workspace_id and m.environment = v_connection.environment
      and m.external_account_id = v_connection.external_account_id and m.listing_id = line->>'listingId'
      and m.variation_id is not distinct from line->>'variationId'
      and (m.variation_id is not null or line->'variationAspects' = '[]'::jsonb);
  return jsonb_build_object('workspaceId',v_connection.workspace_id,'connectionId',p_connection_id,'snapshotId',v_snapshot.id,'reviewHash',p_review_hash,
    'expiresAt',v_snapshot.expires_at,'source',p_source,'assignments',v_assignments,
    'booking',public.ebay_get_order_booking(p_user_id,p_connection_id,p_source_key));
end;
$$;
revoke all on function public.ebay_store_order_snapshot(uuid,uuid,bigint,uuid,text,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.ebay_store_order_snapshot(uuid,uuid,bigint,uuid,text,text,jsonb,boolean) to service_role;

-- Die private Quelle und der Beleg benötigen Definer-Rechte. auth.uid() bleibt
-- ausschließlich das verifizierte Nutzer-JWT, auch beim vorhandenen record_sale.
create or replace function public.ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_booking public.ebay_order_bookings;
  v_source jsonb; v_line jsonb; v_assignment jsonb; v_target jsonb; v_cost jsonb;
  v_lines jsonb := '[]'; v_links jsonb := '[]'; v_costs jsonb := '[]'; v_result jsonb;
  v_quantity integer; v_cents bigint; v_base bigint; v_remainder integer; v_count integer;
  v_total bigint := 0; v_id uuid; v_index integer := 0; v_sale_date date;
begin
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id and workspace_id = p_workspace_id
    and connection_id = p_connection_id and user_id = (select auth.uid())
    and authorization_version = v_connection.authorization_version and external_account_id = v_connection.external_account_id;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  -- Auch eine noch nicht angelegte Quelle wird bis Commit gesperrt.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_connection.environment || ':' || v_snapshot.source_key,0));
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id for update;
  select * into v_booking from public.ebay_order_bookings where workspace_id = p_workspace_id
    and environment = v_connection.environment and source_key = v_snapshot.source_key;
  if found then
    return jsonb_build_object('status',v_booking.status,'saleId',v_booking.sale_id)
      || case when v_booking.status = 'imported' then jsonb_build_object('alreadyRecorded',true) else '{}'::jsonb end;
  end if;
  if not v_snapshot.booking_ready or v_snapshot.expires_at <= clock_timestamp()
  then raise exception 'Bestellung bitte erneut prüfen' using errcode = '22023'; end if;
  v_source := v_snapshot.source;
  if v_source->>'currency' is distinct from 'EUR' or v_source->>'paymentStatus' is distinct from 'PAID'
    or v_source->>'cancelStatus' is distinct from 'NONE_REQUESTED' or v_source->'blockers' is distinct from '[]'::jsonb
    or not public.ebay_valid_cents(v_source->'totalCents') or not public.ebay_valid_cents(v_source->'shippingRevenueCents')
    or jsonb_typeof(v_source->'lines') is distinct from 'array' or jsonb_array_length(v_source->'lines') not between 1 and 200
  then raise exception 'Bestellung ist nicht buchbar' using errcode = '22023'; end if;
  if exists (select 1 from public.sales where workspace_id = p_workspace_id and lower(platform) = 'ebay'
    and external_order_id = v_source->>'orderId')
  then raise exception 'Vorhandenen eBay-Verkauf bitte zuerst prüfen und manuell zuordnen' using errcode = '22023'; end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments) <> jsonb_array_length(v_source->'lines')
    or (select count(distinct value->>'lineItemId') from jsonb_array_elements(p_assignments)) <> jsonb_array_length(p_assignments)
    or (select count(distinct value->>'lineItemId') from jsonb_array_elements(v_source->'lines')) <> jsonb_array_length(v_source->'lines')
  then raise exception 'Ungültige Artikelzuordnung' using errcode = '22023'; end if;
  if jsonb_typeof(p_costs) is distinct from 'object' or not public.ebay_valid_cents(p_costs->'platformFeeCents')
    or not public.ebay_valid_cents(p_costs->'shippingCostCents') or jsonb_typeof(p_costs->'additionalCosts') is distinct from 'array'
    or jsonb_array_length(p_costs->'additionalCosts') > 50
    or not (p_costs ? 'shippingMode') or (p_costs->'shippingMode' <> 'null'::jsonb and p_costs->>'shippingMode' not in ('seller_arranged','platform_prepaid','pickup'))
    or exists (select 1 from jsonb_object_keys(p_costs) k where k not in ('platformFeeCents','shippingCostCents','shippingMode','additionalCosts'))
  then raise exception 'Kosten bitte ausdrücklich bestätigen' using errcode = '22023'; end if;
  for v_cost in select value from jsonb_array_elements(p_costs->'additionalCosts') loop
    if jsonb_typeof(v_cost) is distinct from 'object' or not public.ebay_valid_cents(v_cost->'amountCents')
      or coalesce(v_cost->>'category','') not in ('packaging','payment_fee','promotion','other')
      or jsonb_typeof(v_cost->'description') is distinct from 'null' and jsonb_typeof(v_cost->'description') is distinct from 'string'
      or char_length(coalesce(v_cost->>'description','')) > 500
      or exists (select 1 from jsonb_object_keys(v_cost) k where k not in ('category','description','amountCents'))
    then raise exception 'Ungültige Kosten' using errcode = '22023'; end if;
    v_costs := v_costs || jsonb_build_array(jsonb_build_object('category',v_cost->>'category','description',v_cost->>'description','amount',round((v_cost->>'amountCents')::numeric/100,2)));
  end loop;
  for v_line in select value from jsonb_array_elements(v_source->'lines') loop
    if not public.ebay_valid_cents(v_line->'goodsCents') or v_line->'hasRefund' is distinct from 'false'::jsonb
      or jsonb_typeof(v_line->'quantity') is distinct from 'number' or coalesce(v_line->>'quantity','') !~ '^[1-9][0-9]{0,9}$'
      or (v_line->>'quantity')::numeric > 2147483647
    then raise exception 'Ungültige Quellposition' using errcode = '22023'; end if;
    v_quantity := (v_line->>'quantity')::integer; v_cents := (v_line->>'goodsCents')::bigint;
    if v_cents < v_quantity then raise exception 'Stückpreise müssen positiv sein' using errcode = '22023'; end if;
    select value into v_assignment from jsonb_array_elements(p_assignments) where value->>'lineItemId' = v_line->>'lineItemId';
    if not found or jsonb_typeof(v_assignment) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_assignment)) <> 2
    then raise exception 'Ungültige Artikelzuordnung' using errcode = '22023'; end if;
    v_target := public.ebay_import_target(p_workspace_id,v_assignment->'target');
    if v_target ? 'inventory_item_id' and v_quantity <> 1 then raise exception 'Einzelstückmenge muss eins sein' using errcode = '22023'; end if;
    v_base := v_cents / v_quantity; v_remainder := (v_cents % v_quantity)::integer;
    for v_count in 0..1 loop
      v_index := case when v_count = 0 then v_quantity-v_remainder else v_remainder end;
      if v_index > 0 then
        v_lines := v_lines || jsonb_build_array(v_target || jsonb_build_object('quantity',v_index,'unit_sale_price',round((v_base+v_count)::numeric/100,2),'title_snapshot',v_line->>'title'));
        v_links := v_links || jsonb_build_array(jsonb_build_object('lineItemId',v_line->>'lineItemId','quantity',v_index,'unitPriceCents',v_base+v_count));
      end if;
    end loop;
    v_total := v_total + v_cents;
  end loop;
  if v_total + (v_source->>'shippingRevenueCents')::bigint <> (v_source->>'totalCents')::bigint
    or v_total > 999999999999 then raise exception 'Quellbeträge passen nicht zusammen' using errcode = '22023'; end if;
  v_sale_date := ((v_source->>'createdAt')::timestamptz at time zone 'Europe/Berlin')::date;
  if v_sale_date is null then raise exception 'Verkaufsdatum fehlt' using errcode = '22023'; end if;
  v_result := public.record_sale(p_workspace_id,jsonb_build_object('platform','ebay','sale_date',v_sale_date,
    'external_order_id',v_source->>'orderId','shipping_revenue',round((v_source->>'shippingRevenueCents')::numeric/100,2),
    'platform_fee',round((p_costs->>'platformFeeCents')::numeric/100,2),'shipping_cost',round((p_costs->>'shippingCostCents')::numeric/100,2),
    'shipping_mode',p_costs->>'shippingMode','cost_entries',v_costs),v_lines);
  v_id := (v_result->'sale'->>'id')::uuid;
  if jsonb_array_length(v_result->'sale_line_ids') is distinct from jsonb_array_length(v_links)
  then raise exception 'Verkaufspositionen konnten nicht bestätigt werden' using errcode = '22023'; end if;
  select jsonb_agg(link.value || jsonb_build_object('saleLineId',v_result->'sale_line_ids'->(link.ordinality::int-1)) order by link.ordinality)
    into v_links from jsonb_array_elements(v_links) with ordinality as link(value,ordinality);
  insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,sale_id,source_lines,recorded_by)
    values (p_workspace_id,v_connection.environment,v_snapshot.source_key,'imported',v_id,v_links,(select auth.uid()));
  return jsonb_build_object('status','imported','saleId',v_id,'alreadyRecorded',false);
end;
$$;
revoke all on function public.ebay_record_order_sale(uuid,uuid,uuid,jsonb,jsonb) from public, anon, service_role;
grant execute on function public.ebay_record_order_sale(uuid,uuid,uuid,jsonb,jsonb) to authenticated;

create or replace function public.ebay_mark_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_reason text, p_sale_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections; v_snapshot public.ebay_order_snapshots; v_booking public.ebay_order_bookings;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id;
  v_connection := public.ebay_lock_import_connection(p_user_id,v_connection.workspace_id,p_connection_id);
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id and connection_id = p_connection_id
    and user_id = p_user_id and authorization_version = v_connection.authorization_version and external_account_id = v_connection.external_account_id;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_connection.workspace_id::text || ':' || v_connection.environment || ':' || v_snapshot.source_key,0));
  select * into v_snapshot from public.ebay_order_snapshots where id = p_snapshot_id for update;
  select * into v_booking from public.ebay_order_bookings where workspace_id = v_connection.workspace_id and environment = v_connection.environment and source_key = v_snapshot.source_key;
  if found then return public.ebay_get_order_booking(p_user_id,p_connection_id,v_snapshot.source_key); end if;
  if v_snapshot.expires_at <= clock_timestamp() or p_reason is null or char_length(trim(p_reason)) not between 1 and 500
  then raise exception 'Grund und aktuelle Bestellprüfung erforderlich' using errcode = '22023'; end if;
  if p_sale_id is not null and (not exists (select 1 from public.sales where id = p_sale_id and workspace_id = v_connection.workspace_id)
    or exists (select 1 from public.ebay_order_bookings where sale_id = p_sale_id and status = 'imported'))
  then raise exception 'Ungültiger manueller Verkauf' using errcode = '22023'; end if;
  insert into public.ebay_order_bookings(workspace_id,environment,source_key,status,sale_id,reason,recorded_by)
    values (v_connection.workspace_id,v_connection.environment,v_snapshot.source_key,'recorded_elsewhere',p_sale_id,trim(p_reason),p_user_id);
  return jsonb_build_object('status','recorded_elsewhere','saleId',p_sale_id);
end;
$$;
revoke all on function public.ebay_mark_order_recorded_elsewhere(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.ebay_mark_order_recorded_elsewhere(uuid,uuid,uuid,text,uuid) to service_role;

create or replace function public.ebay_clear_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_source_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_connection public.ebay_connections;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id;
  v_connection := public.ebay_lock_import_connection(p_user_id,v_connection.workspace_id,p_connection_id);
  if p_source_key is null or p_source_key !~ '^[0-9a-f]{64}$' then raise exception 'Ungültige Quelle' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_connection.workspace_id::text || ':' || v_connection.environment || ':' || p_source_key,0));
  delete from public.ebay_order_bookings where workspace_id = v_connection.workspace_id and environment = v_connection.environment
    and source_key = p_source_key and status = 'recorded_elsewhere';
  return found;
end;
$$;
revoke all on function public.ebay_clear_order_recorded_elsewhere(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.ebay_clear_order_recorded_elsewhere(uuid,uuid,text) to service_role;

-- eBay-Kontolöschung darf auch nach Workspace-Archivierung private Zuordnungen
-- und Prüfstände entfernen; dauerhafte Quellenbelege haben keinen OAuth-FK.
create or replace function public.ebay_delete_account(p_environment text, p_external_account_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.ebay_article_mappings where environment = p_environment and external_account_id = p_external_account_id;
  delete from public.ebay_connections where environment = p_environment and external_account_id = p_external_account_id;
end;
$$;
revoke all on function public.ebay_delete_account(text,text) from public, anon, authenticated;
grant execute on function public.ebay_delete_account(text,text) to service_role;
