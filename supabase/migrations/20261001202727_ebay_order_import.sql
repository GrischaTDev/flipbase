-- Bewusste eBay-Verkaufsübernahme: Zuordnungen, private Prüfstände und dauerhafte Quellenbelege.
-- Betroffen: ebay_article_mappings, ebay_order_snapshots, ebay_order_bookings, record_sale und Workspace-Aufbewahrung.
-- CLI-Abgleich; Rechte und Tabellenkommentare zusätzlich mechanisch aus dem deklarativen Schema erzeugt.


  create table "public"."ebay_article_mappings" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "environment" text not null,
    "external_account_id" text not null,
    "listing_id" text not null,
    "variation_id" text,
    "inventory_item_id" uuid,
    "catalog_product_id" uuid,
    "updated_by" uuid,
    "updated_at" timestamp with time zone not null default clock_timestamp()
      );


alter table "public"."ebay_article_mappings" enable row level security;


  create table "public"."ebay_order_bookings" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "environment" text not null,
    "source_key" text not null,
    "status" text not null,
    "sale_id" uuid,
    "source_lines" jsonb not null default '[]'::jsonb,
    "reason" text,
    "recorded_by" uuid,
    "recorded_at" timestamp with time zone not null default clock_timestamp()
      );


alter table "public"."ebay_order_bookings" enable row level security;


  create table "public"."ebay_order_snapshots" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "user_id" uuid not null,
    "authorization_version" bigint not null,
    "environment" text not null,
    "external_account_id" text not null,
    "source_key" text not null,
    "review_hash" text not null,
    "source" jsonb not null,
    "booking_ready" boolean not null default false,
    "created_at" timestamp with time zone not null default clock_timestamp(),
    "expires_at" timestamp with time zone not null
      );


alter table "public"."ebay_order_snapshots" enable row level security;

create index ebay_article_mappings_catalog on public.ebay_article_mappings using btree (workspace_id, catalog_product_id);

create index ebay_article_mappings_inventory on public.ebay_article_mappings using btree (workspace_id, inventory_item_id);

create unique index ebay_article_mappings_pkey on public.ebay_article_mappings using btree (id);

create unique index ebay_article_mappings_workspace_id_environment_external_acc_key on public.ebay_article_mappings using btree (workspace_id, environment, external_account_id, listing_id, variation_id) nulls not distinct;

create index ebay_order_bookings_actor on public.ebay_order_bookings using btree (recorded_by);

create unique index ebay_order_bookings_pkey on public.ebay_order_bookings using btree (id);

create index ebay_order_bookings_sale on public.ebay_order_bookings using btree (workspace_id, sale_id);

create unique index ebay_order_bookings_workspace_id_environment_source_key_key on public.ebay_order_bookings using btree (workspace_id, environment, source_key);

create index ebay_order_snapshots_connection on public.ebay_order_snapshots using btree (connection_id, expires_at);

create unique index ebay_order_snapshots_pkey on public.ebay_order_snapshots using btree (id);

create index ebay_order_snapshots_user on public.ebay_order_snapshots using btree (user_id, workspace_id);

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_pkey" primary key using index "ebay_article_mappings_pkey";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_pkey" primary key using index "ebay_order_bookings_pkey";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_pkey" primary key using index "ebay_order_snapshots_pkey";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_check" check ((num_nonnulls(inventory_item_id, catalog_product_id) = 1)) not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_check";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_environment_check" check ((environment = any (array['production'::text, 'sandbox'::text]))) not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_environment_check";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_listing_id_check" check (((char_length(listing_id) >= 1) and (char_length(listing_id) <= 256))) not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_listing_id_check";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_updated_by_fkey" foreign key (updated_by) references auth.users(id) on delete set null not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_updated_by_fkey";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_variation_id_check" check (((char_length(variation_id) >= 1) and (char_length(variation_id) <= 256))) not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_variation_id_check";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_workspace_id_catalog_product_id_fkey" foreign key (workspace_id, catalog_product_id) references public.catalog_products(workspace_id, id) on delete cascade not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_workspace_id_catalog_product_id_fkey";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_workspace_id_environment_external_acc_key" unique using index "ebay_article_mappings_workspace_id_environment_external_acc_key";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_workspace_id_fkey" foreign key (workspace_id) references public.workspaces(id) on delete cascade not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_workspace_id_fkey";

alter table "public"."ebay_article_mappings" add constraint "ebay_article_mappings_workspace_id_inventory_item_id_fkey" foreign key (workspace_id, inventory_item_id) references public.inventory_items(workspace_id, id) on delete cascade not valid;

alter table "public"."ebay_article_mappings" validate constraint "ebay_article_mappings_workspace_id_inventory_item_id_fkey";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_check" check ((((status = 'imported'::text) and (sale_id is not null) and (reason is null)) or ((status = 'recorded_elsewhere'::text) and ((char_length(trim(both from reason)) >= 1) and (char_length(trim(both from reason)) <= 500))))) not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_check";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_environment_check" check ((environment = any (array['production'::text, 'sandbox'::text]))) not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_environment_check";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_recorded_by_fkey" foreign key (recorded_by) references auth.users(id) on delete restrict not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_recorded_by_fkey";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_source_key_check" check ((source_key ~ '^[0-9a-f]{64}$'::text)) not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_source_key_check";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_source_lines_check" check ((jsonb_typeof(source_lines) = 'array'::text)) not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_source_lines_check";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_status_check" check ((status = any (array['imported'::text, 'recorded_elsewhere'::text]))) not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_status_check";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_workspace_id_environment_source_key_key" unique using index "ebay_order_bookings_workspace_id_environment_source_key_key";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_workspace_id_fkey" foreign key (workspace_id) references public.workspaces(id) on delete restrict not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_workspace_id_fkey";

alter table "public"."ebay_order_bookings" add constraint "ebay_order_bookings_workspace_id_sale_id_fkey" foreign key (workspace_id, sale_id) references public.sales(workspace_id, id) on delete restrict not valid;

alter table "public"."ebay_order_bookings" validate constraint "ebay_order_bookings_workspace_id_sale_id_fkey";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_check" check (((expires_at > created_at) and (expires_at <= (created_at +
case
    when booking_ready then '00:00:30'::interval
    else '00:05:00'::interval
end)))) not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_check";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_connection_id_fkey" foreign key (connection_id) references public.ebay_connections(id) on delete cascade not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_connection_id_fkey";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_environment_check" check ((environment = any (array['production'::text, 'sandbox'::text]))) not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_environment_check";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_review_hash_check" check ((review_hash ~ '^[0-9a-f]{64}$'::text)) not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_review_hash_check";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_source_check" check ((jsonb_typeof(source) = 'object'::text)) not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_source_check";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_source_key_check" check ((source_key ~ '^[0-9a-f]{64}$'::text)) not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_source_key_check";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_user_id_fkey";

alter table "public"."ebay_order_snapshots" add constraint "ebay_order_snapshots_workspace_id_fkey" foreign key (workspace_id) references public.workspaces(id) on delete cascade not valid;

alter table "public"."ebay_order_snapshots" validate constraint "ebay_order_snapshots_workspace_id_fkey";

set check_function_bodies = off;

create or replace function public.ebay_clear_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_source_key text)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_get_order_booking(p_user_id uuid, p_connection_id uuid, p_source_key text)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_import_target(p_workspace_id uuid, p_target jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_lock_import_connection(p_user_id uuid, p_workspace_id uuid, p_connection_id uuid)
 returns public.ebay_connections
 language plpgsql
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_mark_order_recorded_elsewhere(p_user_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_reason text, p_sale_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_record_order_sale(p_workspace_id uuid, p_connection_id uuid, p_snapshot_id uuid, p_assignments jsonb, p_costs jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_remove_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_mapping_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_connection public.ebay_connections;
begin
  v_connection := public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  delete from public.ebay_article_mappings where id = p_mapping_id and workspace_id = p_workspace_id
    and environment = v_connection.environment and external_account_id = v_connection.external_account_id;
  return found;
end;
$function$
;

create or replace function public.ebay_set_article_mapping(p_workspace_id uuid, p_connection_id uuid, p_listing_id text, p_variation_id text, p_target jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_store_order_snapshot(p_user_id uuid, p_connection_id uuid, p_version bigint, p_operation_id uuid, p_source_key text, p_review_hash text, p_source jsonb, p_booking_ready boolean)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.ebay_valid_cents(p_value jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select case when jsonb_typeof(p_value) = 'number' and p_value::text ~ '^(0|[1-9][0-9]{0,11})$'
    then (p_value::text)::numeric <= 999999999999 else false end;
$function$
;

create or replace function public.ebay_delete_account(p_environment text, p_external_account_id text)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
  delete from public.ebay_article_mappings where environment = p_environment and external_account_id = p_external_account_id;
  delete from public.ebay_connections where environment = p_environment and external_account_id = p_external_account_id;
end;
$function$
;

create or replace function public.prevent_workspace_with_business_data_deletion()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if exists (select 1 from public.purchases where workspace_id = old.id)
    or exists (select 1 from public.inventory_items where workspace_id = old.id)
    or exists (select 1 from public.stock_lots where workspace_id = old.id)
    or exists (select 1 from public.stock_movements where workspace_id = old.id)
    or exists (select 1 from public.sales where workspace_id = old.id)
    or exists (select 1 from public.inventory_reconciliation_events where workspace_id = old.id)
    or exists (select 1 from public.business_events where workspace_id = old.id)
    or exists (select 1 from public.activity_logs where workspace_id = old.id)
    or exists (select 1 from public.returns where workspace_id = old.id)
    or exists (select 1 from public.invoices where workspace_id = old.id)
    or exists (select 1 from public.email_confirmations where workspace_id = old.id)
    or exists (select 1 from public.shipping_orders where workspace_id = old.id)
    or exists (select 1 from public.store_orders where workspace_id = old.id)
    or exists (select 1 from public.bank_transactions where workspace_id = old.id)
    or exists (select 1 from public.offline_purchase_entries where workspace_id = old.id)
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = old.id)
    or exists (select 1 from public.catalog_product_media where workspace_id = old.id)
    or exists (select 1 from public.purchase_receipt_requests where workspace_id = old.id)
    or exists (select 1 from public.purchase_documents where workspace_id = old.id)
    or exists (select 1 from public.expense_recurring_rules where workspace_id = old.id)
    or exists (select 1 from public.expenses where workspace_id = old.id)
    or exists (select 1 from public.expense_documents where workspace_id = old.id)
    or exists (select 1 from public.ebay_order_bookings where workspace_id = old.id) then
    raise exception using errcode = 'P0001',
      message = 'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.';
  end if;
  return old;
end;
$function$
;

create or replace function public.record_sale(p_workspace_id uuid, p_sale jsonb, p_lines jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_input_line jsonb;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_stock_lot public.stock_lots;
  v_catalog_product public.catalog_products;
  v_inventory_item public.inventory_items;
  v_workspace public.workspaces;
  v_catalog_product_id uuid;
  v_inventory_item_id uuid;
  v_header_inventory_item_id uuid;
  v_source_purchase_id uuid;
  v_source_purchase_status text;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_quantity integer;
  v_unit_sale_price numeric(12, 2);
  v_line_total numeric(12, 2);
  v_tax_costs numeric[];
  v_business_unit_costs numeric[];
  v_line_tax_costs numeric[];
  v_tax_unknown boolean;
  v_line_cogs numeric(12, 2);
  v_remaining_quantity integer;
  v_allocated_quantity integer;
  v_allocation_cost numeric(12,2);
  v_previously_allocated_cost numeric(12,2);
  v_lot_total_cost numeric(12,2);
  v_remaining_lot_cost numeric(12,2);
  v_remaining_cost_cents bigint;
  v_previously_active_quantity integer;
  v_consumption_sequence bigint;
  v_ambiguous_active_cost_count integer;
  v_invalid_restocked_quantity_count integer;
  v_sale_total numeric(12, 2) := 0;
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
  v_sale_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_sale_state text;
  v_business_event_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_sale) <> 'object'
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungültig.';
  end if;

  foreach v_money_key in array array['platform_fee', 'shipping_cost', 'shipping_revenue', 'packaging_cost', 'other_costs'] loop
    if p_sale ? v_money_key
      and (
        jsonb_typeof(p_sale -> v_money_key) <> 'number'
        or (p_sale ->> v_money_key) !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
        or (p_sale ->> v_money_key)::numeric < 0
      ) then
      raise exception using errcode = '22023', message = 'Die Verkaufsbeträge sind ungültig.';
    end if;
  end loop;

  if p_sale ? 'shipping_mode'
    and jsonb_typeof(p_sale -> 'shipping_mode') <> 'null'
    and (
      jsonb_typeof(p_sale -> 'shipping_mode') <> 'string'
      or p_sale ->> 'shipping_mode' not in ('seller_arranged', 'platform_prepaid', 'pickup')
    ) then
    raise exception using errcode = '22023', message = 'Die Versandabwicklung ist ungültig.';
  end if;

  if p_sale ? 'cost_entries' then
    if jsonb_typeof(p_sale -> 'cost_entries') <> 'array' then
      raise exception using errcode = '22023', message = 'Die zusätzlichen Verkaufskosten sind ungültig.';
    end if;
    v_cost_entries := p_sale -> 'cost_entries';
  else
    v_cost_entries := jsonb_strip_nulls(jsonb_build_array(
      case when coalesce((p_sale ->> 'packaging_cost')::numeric, 0) > 0
        then jsonb_build_object('category', 'packaging', 'amount', (p_sale ->> 'packaging_cost')::numeric)
      end,
      case when coalesce((p_sale ->> 'other_costs')::numeric, 0) > 0
        then jsonb_build_object('category', 'other', 'amount', (p_sale ->> 'other_costs')::numeric)
      end
    ));
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    into v_cost_entries
    from jsonb_array_elements(v_cost_entries) as entry(value)
    where value <> 'null'::jsonb;
  end if;

  if jsonb_array_length(v_cost_entries) > 50 then
    raise exception using errcode = '22023', message = 'Es sind höchstens 50 zusätzliche Verkaufskosten erlaubt.';
  end if;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    if jsonb_typeof(v_cost_entry) <> 'object'
      or jsonb_typeof(v_cost_entry -> 'category') <> 'string'
      or v_cost_entry ->> 'category' not in ('packaging', 'payment_fee', 'promotion', 'other')
      or (v_cost_entry ? 'description' and jsonb_typeof(v_cost_entry -> 'description') not in ('string', 'null'))
      or jsonb_typeof(v_cost_entry -> 'amount') <> 'number'
      or (v_cost_entry ->> 'amount') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_cost_entry ->> 'amount')::numeric < 0 then
      raise exception using errcode = '22023', message = 'Eine zusätzliche Verkaufskostenzeile ist ungültig.';
    end if;

    if v_cost_entry ->> 'category' = 'packaging' then
      v_packaging_cost := v_packaging_cost + (v_cost_entry ->> 'amount')::numeric;
    else
      v_other_costs := v_other_costs + (v_cost_entry ->> 'amount')::numeric;
    end if;
  end loop;

  v_shipping_revenue := coalesce((p_sale ->> 'shipping_revenue')::numeric, 0);
  v_shipping_mode := nullif(p_sale ->> 'shipping_mode', '');

  select * into v_workspace
  from public.workspaces
  where id = p_workspace_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Workspace wurde nicht gefunden.';
  end if;

  -- Validate every line before taking locks or writing the sale header.
  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(trim(v_input_line ->> 'catalog_product_id'), ''),
        nullif(trim(v_input_line ->> 'inventory_item_id'), '')
      ) <> 1
      or (
        nullif(trim(v_input_line ->> 'catalog_product_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'catalog_product_id') <> 'string'
      )
      or (
        nullif(trim(v_input_line ->> 'inventory_item_id'), '') is not null
        and jsonb_typeof(v_input_line -> 'inventory_item_id') <> 'string'
      ) then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;
  end loop;

  -- Lock every currently relevant source purchase before any item or lot.
  -- Reopen/correction use the same purchase-first order, and UUID sorting
  -- prevents client-controlled deadlocks across mixed multi-line sales.
  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_locked_purchase_ids
  from (
    select coalesce(item.purchase_id, linked_line.purchase_id) as purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.inventory_items as item
      on item.workspace_id = p_workspace_id
      and item.id = (element.value ->> 'inventory_item_id')::uuid
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where nullif(pg_catalog.btrim(element.value ->> 'inventory_item_id'), '') is not null

    union

    select lot.purchase_id
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    join public.stock_lots as lot
      on lot.workspace_id = p_workspace_id
      and lot.catalog_product_id = (element.value ->> 'catalog_product_id')::uuid
      and lot.remaining_quantity > 0
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  ) as source
  where source.purchase_id is not null;

  if pg_catalog.cardinality(v_locked_purchase_ids) > 0 then
    for v_purchase_position in 1..pg_catalog.cardinality(v_locked_purchase_ids) loop
      perform purchase.id
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_locked_purchase_ids[v_purchase_position]
      for update;
    end loop;
  end if;

  -- Nach den Einkäufen und vor den Losen sperren und Archivstatus prüfen.
  for v_catalog_product_id in
    select candidate.catalog_product_id
    from (
      select distinct (element.value ->> 'catalog_product_id')::uuid as catalog_product_id
      from pg_catalog.jsonb_array_elements(p_lines) as element(value)
      where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
    ) as candidate
    order by candidate.catalog_product_id
  loop
    select * into v_catalog_product from public.catalog_products
      where workspace_id = p_workspace_id and id = v_catalog_product_id for update;
    if not found then
      raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
    end if;
    if v_catalog_product.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;
  end loop;

  -- A draft lot can exist while goods are being received, but it must never
  -- close an availability gap for a sale. Keep finalized inventory sellable
  -- even when another draft of the same product exists.
  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
    where nullif(pg_catalog.btrim(element.value ->> 'catalog_product_id'), '') is not null
  loop
    v_catalog_product_id := (v_input_line ->> 'catalog_product_id')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;

    if coalesce((
      select pg_catalog.sum(lot.remaining_quantity)
      from public.stock_lots as lot
      join public.purchases as purchase
        on purchase.workspace_id = lot.workspace_id
        and purchase.id = lot.purchase_id
      where lot.workspace_id = p_workspace_id
        and lot.catalog_product_id = v_catalog_product_id
        and lot.remaining_quantity > 0
        and purchase.entry_status = 'finalized'
    ), 0) < v_quantity
      and exists (
        select 1
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product_id
          and lot.remaining_quantity > 0
          and purchase.entry_status is distinct from 'finalized'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
    end if;
  end loop;

  -- Resolve unique UUIDs first and lock the items in one stable order.
  for v_inventory_item_id in
    select candidate.inventory_item_id
    from (
      select distinct (element.value ->> 'inventory_item_id')::uuid as inventory_item_id
      from jsonb_array_elements(p_lines) as element(value)
      where nullif(trim(element.value ->> 'inventory_item_id'), '') is not null
    ) as candidate
    order by candidate.inventory_item_id
  loop
    select * into v_inventory_item
    from public.inventory_items
    where id = v_inventory_item_id
      and workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
    end if;

    if v_inventory_item.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
    end if;

    v_source_purchase_id := v_inventory_item.purchase_id;
    if v_source_purchase_id is null and v_inventory_item.purchase_line_id is not null then
      select line.purchase_id
      into v_source_purchase_id
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.id = v_inventory_item.purchase_line_id;
    end if;

    if v_source_purchase_id is not null then
      if not (v_source_purchase_id = any(v_locked_purchase_ids)) then
        raise exception using
          errcode = '40001',
          message = 'Die Einkaufszuordnung des Einzelartikels wurde parallel geändert.';
      end if;

      select purchase.entry_status
      into v_source_purchase_status
      from public.purchases as purchase
      where purchase.workspace_id = p_workspace_id
        and purchase.id = v_source_purchase_id;

      if v_source_purchase_status is distinct from 'finalized' then
        raise exception using
          errcode = '22023',
          message = 'Bestand aus nicht finalisierten Einkäufen ist nicht verkaufbar.';
      end if;
    end if;

    select sale_state into v_sale_state
    from public.inventory_item_sale_states
    where inventory_item_id = v_inventory_item.id
      and workspace_id = p_workspace_id;

    if v_inventory_item.status not in ('ready', 'listed')
      or v_sale_state is distinct from 'no_active_sale' then
      raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
    end if;
  end loop;

  if jsonb_array_length(p_lines) = 1
    and jsonb_typeof(p_lines -> 0 -> 'inventory_item_id') = 'string' then
    v_header_inventory_item_id := (p_lines -> 0 ->> 'inventory_item_id')::uuid;
  end if;

  insert into public.sales (
    workspace_id,
    inventory_item_id,
    platform,
    sale_price,
    sale_price_total,
    sale_date,
    platform_fee,
    shipping_cost,
    packaging_cost,
    other_costs,
    shipping_revenue,
    shipping_mode,
    external_order_id,
    external_listing_id,
    buyer_notes,
    created_at
  ) values (
    p_workspace_id,
    v_header_inventory_item_id,
    trim(p_sale ->> 'platform'),
    0,
    0,
    (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), ''),
    pg_catalog.clock_timestamp()
  )
  returning * into v_sale;

  for v_cost_entry in select value from jsonb_array_elements(v_cost_entries) as entry(value) loop
    insert into public.sale_cost_entries (
      workspace_id, sale_id, category, description, amount
    ) values (
      p_workspace_id,
      v_sale.id,
      v_cost_entry ->> 'category',
      nullif(trim(v_cost_entry ->> 'description'), ''),
      (v_cost_entry ->> 'amount')::numeric
    );
  end loop;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'quantity') <> 'number'
      or (v_input_line ->> 'quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'unit_sale_price') <> 'number'
      or (v_input_line ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      or (v_input_line ->> 'unit_sale_price')::numeric <= 0
      or num_nonnulls(
        nullif(v_input_line ->> 'catalog_product_id', ''),
        nullif(v_input_line ->> 'inventory_item_id', '')
      ) <> 1 then
      raise exception using errcode = '22023', message = 'Eine Verkaufsposition ist ungültig.';
    end if;

    v_catalog_product_id := nullif(v_input_line ->> 'catalog_product_id', '')::uuid;
    v_inventory_item_id := nullif(v_input_line ->> 'inventory_item_id', '')::uuid;
    v_quantity := (v_input_line ->> 'quantity')::integer;
    v_unit_sale_price := (v_input_line ->> 'unit_sale_price')::numeric(12, 2);
    v_line_total := v_quantity * v_unit_sale_price;
    v_line_cogs := 0;
    v_line_tax_costs := array[]::numeric[];
    v_tax_unknown := false;

    if v_catalog_product_id is not null then
      select * into v_catalog_product
      from public.catalog_products
      where id = v_catalog_product_id
        and workspace_id = p_workspace_id;

      if not found then
        raise exception using errcode = '22023', message = 'Der Mengenartikel ist ungültig.';
      end if;

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        catalog_product_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_catalog_product.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_catalog_product.title),
        v_quantity,
        v_unit_sale_price,
        v_line_total,
        0,
        v_workspace.tax_mode
      )
      returning * into v_sale_line;

      v_remaining_quantity := v_quantity;
      for v_stock_lot in
        select lot.*
        from public.stock_lots as lot
        join public.purchases as purchase
          on purchase.workspace_id = lot.workspace_id
          and purchase.id = lot.purchase_id
        where lot.workspace_id = p_workspace_id
          and lot.catalog_product_id = v_catalog_product.id
          and lot.remaining_quantity > 0
          and purchase.id = any(v_locked_purchase_ids)
          and purchase.entry_status = 'finalized'
        order by lot.received_at, lot.id
        for update of lot
      loop
        exit when v_remaining_quantity = 0;

        v_allocated_quantity := least(v_remaining_quantity, v_stock_lot.remaining_quantity);

        select
          coalesce(pg_catalog.sum(coalesce(
            allocation.active_allocated_cost,
            case
              when movement_state.restocked_quantity = allocation.quantity then 0
              when movement_state.restocked_quantity = 0 then allocation.allocated_cost
              else null
            end
          )), 0),
          pg_catalog.count(*) filter (
            where allocation.active_allocated_cost is null
              and movement_state.restocked_quantity not in (0, allocation.quantity)
          )::integer,
          coalesce(pg_catalog.sum(
            allocation.quantity - movement_state.restocked_quantity
          ), 0)::integer,
          pg_catalog.count(*) filter (
            where movement_state.restocked_quantity < 0
              or movement_state.restocked_quantity > allocation.quantity
          )::integer
        into
          v_previously_allocated_cost,
          v_ambiguous_active_cost_count,
          v_previously_active_quantity,
          v_invalid_restocked_quantity_count
        from public.sale_line_lot_allocations as allocation
        left join lateral (
          select coalesce(pg_catalog.sum(
            case
              when movement.direction = 'in' and movement.reason = 'return'
                then movement.quantity
              when movement.direction = 'out' and movement.reason = 'damage'
                then -movement.quantity
              else 0
            end
          ), 0)::integer as restocked_quantity
          from public.stock_movements as movement
          where movement.workspace_id = allocation.workspace_id
            and movement.stock_lot_id = allocation.stock_lot_id
            and movement.sale_line_id = allocation.sale_line_id
        ) as movement_state on true
        where allocation.stock_lot_id = v_stock_lot.id;

        if v_ambiguous_active_cost_count <> 0 then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten einer historischen Teilretoure müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_invalid_restocked_quantity_count <> 0
          or v_stock_lot.remaining_quantity + v_previously_active_quantity
            <> v_stock_lot.received_quantity then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Mengen eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        if v_stock_lot.unit_cost is null
          or v_stock_lot.unit_cost::text in ('NaN', 'Infinity', '-Infinity') then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        -- A purchase-backed lot owns one exact cent pool. Repeated partial
        -- sales consume the leading deterministic cents from the currently
        -- remaining pool instead of rounding the average unit cost anew.
        v_lot_total_cost := pg_catalog.round(
          v_stock_lot.unit_cost * v_stock_lot.received_quantity,
          2
        );
        v_remaining_lot_cost := v_lot_total_cost - v_previously_allocated_cost;

        if v_remaining_lot_cost < 0
          or v_remaining_lot_cost <> pg_catalog.round(v_remaining_lot_cost, 2) then
          raise exception using
            errcode = '22023',
            message = 'Die aktiven Kosten eines historischen Loses müssen vor dem Verkauf geprüft werden.';
        end if;

        v_remaining_cost_cents := pg_catalog.round(v_remaining_lot_cost * 100)::bigint;
        v_allocation_cost := (
          v_allocated_quantity::bigint
            * (v_remaining_cost_cents / v_stock_lot.remaining_quantity::bigint)
          + least(
              v_allocated_quantity::bigint,
              pg_catalog.mod(
                v_remaining_cost_cents,
                v_stock_lot.remaining_quantity::bigint
              )
            )
        )::numeric / 100;

        v_business_unit_costs := v_stock_lot.remaining_unit_costs[1:v_allocated_quantity];
        if v_stock_lot.remaining_unit_costs is not null then
          if pg_catalog.cardinality(v_business_unit_costs) <> v_allocated_quantity then
            raise exception using errcode = '22023', message = 'Die Stückkostenfolge des Loses ist unvollständig.';
          end if;
          select pg_catalog.sum(value) into v_allocation_cost from pg_catalog.unnest(v_business_unit_costs) as value;
        end if;
        v_tax_costs := v_stock_lot.remaining_tax_unit_costs[1:v_allocated_quantity];
        if v_tax_costs is null or pg_catalog.cardinality(v_tax_costs) <> v_allocated_quantity then
          v_tax_unknown := true;
        else
          v_line_tax_costs := v_line_tax_costs || v_tax_costs;
        end if;
        update public.stock_lots
        set remaining_tax_unit_costs = v_stock_lot.remaining_tax_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_unit_costs = v_stock_lot.remaining_unit_costs[(v_allocated_quantity + 1):v_stock_lot.remaining_quantity],
            remaining_quantity = remaining_quantity - v_allocated_quantity
        where id = v_stock_lot.id
          and workspace_id = p_workspace_id;

        select greatest(
          coalesce(pg_catalog.max(allocation.consumption_sequence), 0),
          pg_catalog.count(*)
        ) + 1
        into v_consumption_sequence
        from public.sale_line_lot_allocations as allocation
        where allocation.workspace_id = p_workspace_id
          and allocation.stock_lot_id = v_stock_lot.id;

        insert into public.sale_line_lot_allocations (
          workspace_id,
          sale_line_id,
          stock_lot_id,
          quantity,
          unit_cost,
          allocated_cost,
          consumption_sequence,
          active_allocated_cost, tax_purchase_cost, tax_cost_allocations, active_tax_unit_costs, active_unit_costs
        ) values (
          p_workspace_id,
          v_sale_line.id,
          v_stock_lot.id,
          v_allocated_quantity,
          v_stock_lot.unit_cost,
          v_allocation_cost,
          v_consumption_sequence,
          v_allocation_cost,
          (select pg_catalog.sum(value) from pg_catalog.unnest(v_tax_costs) as value),
          public.tax_cost_allocations(v_tax_costs),
          v_tax_costs,
          v_business_unit_costs
        );

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          sale_line_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot.id,
          v_sale_line.id,
          'out',
          v_allocated_quantity,
          'sale'
        );

        v_line_cogs := v_line_cogs + v_allocation_cost;
        v_remaining_quantity := v_remaining_quantity - v_allocated_quantity;
        v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
      end loop;

      if v_remaining_quantity <> 0 then
        raise exception using errcode = 'P0001', message = 'Nicht genügend verfügbarer Bestand';
      end if;

      update public.sale_lines
      set tax_purchase_cost = case when v_tax_unknown then null else (select pg_catalog.sum(value) from pg_catalog.unnest(v_line_tax_costs) as value) end,
          tax_cost_allocations = case when v_tax_unknown then null else public.tax_cost_allocations(v_line_tax_costs) end,
          cost_of_goods_sold = v_line_cogs
      where id = v_sale_line.id
        and workspace_id = p_workspace_id
      returning * into v_sale_line;
    else
      if v_quantity <> 1 then
        raise exception using errcode = '22023', message = 'Einzelartikel können nur einmal verkauft werden.';
      end if;

      select * into v_inventory_item
      from public.inventory_items
      where id = v_inventory_item_id
        and workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'Der Einzelartikel wurde nicht gefunden.';
      end if;

      if v_inventory_item.status not in ('ready', 'listed')
        or exists (
          select 1
          from public.sales as existing_sale
          left join public.sale_lines as existing_line
            on existing_line.workspace_id = existing_sale.workspace_id
           and existing_line.sale_id = existing_sale.id
          where existing_sale.workspace_id = p_workspace_id
            and existing_sale.id <> v_sale.id
            and existing_sale.returned_at is null
            and existing_sale.voided_at is null
            and (
              existing_sale.inventory_item_id = v_inventory_item.id
              or existing_line.inventory_item_id = v_inventory_item.id
            )
        ) then
        raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
      end if;

      perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

      update public.inventory_items
      set status = 'sold',
          updated_at = now()
      where id = v_inventory_item.id
        and workspace_id = p_workspace_id;

      v_line_cogs := v_inventory_item.allocated_purchase_cost + coalesce((
        select pg_catalog.sum(cost.amount) from public.item_costs as cost
        where cost.inventory_item_id = v_inventory_item.id
      ), 0);

      insert into public.sale_lines (
        workspace_id,
        sale_id,
        inventory_item_id,
        title_snapshot,
        quantity,
        unit_sale_price,
        line_total,
        cost_of_goods_sold,
        tax_purchase_cost, tax_cost_allocations,
        tax_mode
      ) values (
        p_workspace_id,
        v_sale.id,
        v_inventory_item.id,
        coalesce(nullif(trim(v_input_line ->> 'title_snapshot'), ''), v_inventory_item.title),
        1,
        v_unit_sale_price,
        v_line_total,
        v_line_cogs,
        v_inventory_item.tax_purchase_cost,
        public.tax_cost_allocations(case when v_inventory_item.tax_purchase_cost is null then null else array[v_inventory_item.tax_purchase_cost] end),
        v_workspace.tax_mode
      )
      returning * into v_sale_line;
    end if;

    v_sale_total := v_sale_total + v_line_total;
    v_sale_line_ids := array_append(v_sale_line_ids, v_sale_line.id);
  end loop;

  update public.sales
  set sale_price = v_sale_total + v_shipping_revenue,
      sale_price_total = v_sale_total + v_shipping_revenue
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'sale',
    v_sale.id,
    'sale_recorded',
    (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'financials', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'item_revenue', v_sale_total,
          'buyer_shipping_revenue', v_shipping_revenue,
          'total_revenue', v_sale.sale_price_total,
          'cost_of_goods_sold', (
            select case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
            from public.sale_lines as sale_line
            where sale_line.workspace_id = p_workspace_id
              and sale_line.sale_id = v_sale.id
          ),
          'platform_fee', v_sale.platform_fee,
          'seller_shipping_cost', v_sale.shipping_cost,
          'additional_costs', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'category', cost_entry.category,
                'description', cost_entry.description,
                'amount', cost_entry.amount
              ) order by cost_entry.id
            )
            from public.sale_cost_entries as cost_entry
            where cost_entry.workspace_id = p_workspace_id
              and cost_entry.sale_id = v_sale.id
          ), '[]'::jsonb)
        )
      ),
      'sale', pg_catalog.jsonb_build_object(
        'before', null,
        'after', pg_catalog.jsonb_build_object(
          'platform', v_sale.platform,
          'sale_date', v_sale.sale_date,
          'shipping_mode', v_sale.shipping_mode
        )
      )
    )
  )
  returning id into v_business_event_id;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'business_event_id', v_business_event_id,
    -- Eingabereihenfolge für unveränderliche externe Positionsnachweise.
    'sale_line_ids', to_jsonb(v_sale_line_ids),
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
    'sale_lines', coalesce((
      select jsonb_agg(to_jsonb(sale_line) order by sale_line.id)
      from public.sale_lines as sale_line
      where sale_line.id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'lot_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.id)
      from public.sale_line_lot_allocations as allocation
      where allocation.sale_line_id = any(v_sale_line_ids)
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.id)
      from public.stock_movements as movement
      where movement.sale_line_id = any(v_sale_line_ids)
        and movement.reason = 'sale'
    ), '[]'::jsonb),
    'stock_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stock_lot_id', stock_lot.id,
        'remaining_quantity', stock_lot.remaining_quantity
      ) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$function$
;

grant delete on table "public"."ebay_article_mappings" to "service_role";

grant insert on table "public"."ebay_article_mappings" to "service_role";

grant references on table "public"."ebay_article_mappings" to "service_role";

grant select on table "public"."ebay_article_mappings" to "service_role";

grant trigger on table "public"."ebay_article_mappings" to "service_role";

grant truncate on table "public"."ebay_article_mappings" to "service_role";

grant update on table "public"."ebay_article_mappings" to "service_role";

grant delete on table "public"."ebay_order_bookings" to "service_role";

grant insert on table "public"."ebay_order_bookings" to "service_role";

grant references on table "public"."ebay_order_bookings" to "service_role";

grant select on table "public"."ebay_order_bookings" to "service_role";

grant trigger on table "public"."ebay_order_bookings" to "service_role";

grant truncate on table "public"."ebay_order_bookings" to "service_role";

grant update on table "public"."ebay_order_bookings" to "service_role";

grant delete on table "public"."ebay_order_snapshots" to "service_role";

grant insert on table "public"."ebay_order_snapshots" to "service_role";

grant references on table "public"."ebay_order_snapshots" to "service_role";

grant select on table "public"."ebay_order_snapshots" to "service_role";

grant trigger on table "public"."ebay_order_snapshots" to "service_role";

grant truncate on table "public"."ebay_order_snapshots" to "service_role";

grant update on table "public"."ebay_order_snapshots" to "service_role";


  create policy "Users read mappings for their eBay account"
  on "public"."ebay_article_mappings"
  as permissive
  for select
  to authenticated
using ((public.ebay_can_connect(workspace_id) and (exists ( select 1
   from public.ebay_connections c
  where ((c.workspace_id = ebay_article_mappings.workspace_id) and (c.user_id = ( select auth.uid() as uid)) and (c.status = 'connected'::text) and (c.environment = ebay_article_mappings.environment) and (c.external_account_id = ebay_article_mappings.external_account_id))))));


create trigger "00_protect_archived_workspace" before insert or delete or update on public.ebay_order_bookings for each row execute function public.protect_archived_workspace_data();



-- Vollständige explizite Rechte; der CLI-Abgleich erfasst Spaltenrechte und Default-Revoke nicht vollständig.
comment on table public.ebay_article_mappings is 'Ausdrücklich bestätigte Inserat-/Variantenziele für ein persönlich verbundenes eBay-Konto.';

revoke all on public.ebay_article_mappings from public, anon, authenticated;

grant select (id, workspace_id, environment, listing_id, variation_id, inventory_item_id, catalog_product_id, updated_by, updated_at) on public.ebay_article_mappings to authenticated;

grant all on public.ebay_article_mappings to service_role;

comment on table public.ebay_order_snapshots is 'Private, kurzlebige normalisierte Bestellprüfung; keine Käuferanschriften oder OAuth-Tokens.';

revoke all on public.ebay_order_snapshots from public, anon, authenticated;

grant all on public.ebay_order_snapshots to service_role;

comment on table public.ebay_order_bookings is 'Minimaler dauerhafter Geschäftsbeleg gegen Doppelübernahmen, unabhängig vom OAuth-Lebenszyklus.';

revoke all on public.ebay_order_bookings from public, anon, authenticated;

grant all on public.ebay_order_bookings to service_role;

revoke all on function public.ebay_lock_import_connection(uuid,uuid,uuid) from public, anon, authenticated;

grant execute on function public.ebay_lock_import_connection(uuid,uuid,uuid) to service_role;

revoke all on function public.ebay_valid_cents(jsonb) from public, anon, authenticated;

grant execute on function public.ebay_valid_cents(jsonb) to service_role;

revoke all on function public.ebay_import_target(uuid,jsonb) from public, anon, authenticated;

revoke all on function public.ebay_set_article_mapping(uuid,uuid,text,text,jsonb) from public, anon, service_role;

grant execute on function public.ebay_set_article_mapping(uuid,uuid,text,text,jsonb) to authenticated;

revoke all on function public.ebay_remove_article_mapping(uuid,uuid,uuid) from public, anon, service_role;

grant execute on function public.ebay_remove_article_mapping(uuid,uuid,uuid) to authenticated;

revoke all on function public.ebay_get_order_booking(uuid,uuid,text) from public, anon, authenticated;

grant execute on function public.ebay_get_order_booking(uuid,uuid,text) to service_role;

revoke all on function public.ebay_store_order_snapshot(uuid,uuid,bigint,uuid,text,text,jsonb,boolean) from public, anon, authenticated;

grant execute on function public.ebay_store_order_snapshot(uuid,uuid,bigint,uuid,text,text,jsonb,boolean) to service_role;

revoke all on function public.ebay_record_order_sale(uuid,uuid,uuid,jsonb,jsonb) from public, anon, service_role;

grant execute on function public.ebay_record_order_sale(uuid,uuid,uuid,jsonb,jsonb) to authenticated;

revoke all on function public.ebay_mark_order_recorded_elsewhere(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;

grant execute on function public.ebay_mark_order_recorded_elsewhere(uuid,uuid,uuid,text,uuid) to service_role;

revoke all on function public.ebay_clear_order_recorded_elsewhere(uuid,uuid,text) from public, anon, authenticated;

grant execute on function public.ebay_clear_order_recorded_elsewhere(uuid,uuid,text) to service_role;

revoke all on function public.ebay_delete_account(text,text) from public, anon, authenticated;

grant execute on function public.ebay_delete_account(text,text) to service_role;
