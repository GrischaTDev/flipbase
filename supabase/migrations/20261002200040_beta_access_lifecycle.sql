-- zweck: sieben tage gültige und widerrufbare beta-links, kontobereinigung und lizenzverwaltung.
-- betrifft: beta_applications, workspace_licenses, beta-vorgänge und geschäftsgrenzen.
-- supabase-cli-diff aus migrationen zur isolierten datenbank; deklarative acls,
-- storage-/realtime-policies und auth-trigger automatisch aus den schemadateien übernommen.
-- policy-drops ersetzen dieselben policies mit zusätzlichen zugangsprüfungen.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

drop policy "Verlauf lesen" on public.activity_logs;

drop policy "Verlaufseintrag anlegen" on public.activity_logs;

drop policy "Verlaufseintrag loeschen" on public.activity_logs;

drop policy app_notifications_delete on public.app_notifications;

drop policy app_notifications_insert on public.app_notifications;

drop policy app_notifications_select on public.app_notifications;

drop policy app_notifications_update on public.app_notifications;

drop policy "Eigene Bildbereinigung lesen" on public.article_media_cleanup_jobs;

drop policy bank_transactions_delete on public.bank_transactions;

drop policy bank_transactions_insert on public.bank_transactions;

drop policy bank_transactions_select on public.bank_transactions;

drop policy bank_transactions_update on public.bank_transactions;

drop policy "Marken aendern" on public.brands;

drop policy "Marken anlegen" on public.brands;

drop policy "Marken lesen" on public.brands;

drop policy "Marken loeschen" on public.brands;

drop policy carrier_configs_delete on public.carrier_configs;

drop policy carrier_configs_insert on public.carrier_configs;

drop policy carrier_configs_select on public.carrier_configs;

drop policy carrier_configs_update on public.carrier_configs;

drop policy cash_wallet_sessions_delete on public.cash_wallet_sessions;

drop policy cash_wallet_sessions_insert on public.cash_wallet_sessions;

drop policy cash_wallet_sessions_select on public.cash_wallet_sessions;

drop policy cash_wallet_sessions_update on public.cash_wallet_sessions;

drop policy "Artikelgruppen aendern" on public.catalog_product_groups;

drop policy "Artikelgruppen anlegen" on public.catalog_product_groups;

drop policy "Artikelgruppen lesen" on public.catalog_product_groups;

drop policy "Artikelgruppen loeschen" on public.catalog_product_groups;

drop policy "Produktmedien aendern" on public.catalog_product_media;

drop policy "Produktmedien anlegen" on public.catalog_product_media;

drop policy "Produktmedien lesen" on public.catalog_product_media;

drop policy "Produktmedien loeschen" on public.catalog_product_media;

drop policy "Artikelstamm aendern" on public.catalog_products;

drop policy "Artikelstamm anlegen" on public.catalog_products;

drop policy "Artikelstamm lesen" on public.catalog_products;

drop policy "Artikelstamm loeschen" on public.catalog_products;

drop policy email_confirmations_delete on public.email_confirmations;

drop policy email_confirmations_insert on public.email_confirmations;

drop policy email_confirmations_select on public.email_confirmations;

drop policy email_confirmations_update on public.email_confirmations;

drop policy "Ausgabenkategorien aendern" on public.expense_categories;

drop policy "Ausgabenkategorien anlegen" on public.expense_categories;

drop policy "Ausgabenkategorien lesen" on public.expense_categories;

drop policy "Ausgabenbelege anlegen" on public.expense_documents;

drop policy "Ausgabenbelege entfernen" on public.expense_documents;

drop policy "Ausgabenbelege lesen" on public.expense_documents;

drop policy "Wiederholungsregeln aendern" on public.expense_recurring_rules;

drop policy "Wiederholungsregeln anlegen" on public.expense_recurring_rules;

drop policy "Wiederholungsregeln lesen" on public.expense_recurring_rules;

drop policy "Ausgaben aendern" on public.expenses;

drop policy "Ausgaben anlegen" on public.expenses;

drop policy "Ausgaben lesen" on public.expenses;

drop policy "Artikel aendern" on public.inventory_items;

drop policy "Artikel anlegen" on public.inventory_items;

drop policy "Artikel loeschen" on public.inventory_items;

drop policy "Inventar lesen" on public.inventory_items;

drop policy "Inventarklaerungen lesen" on public.inventory_reconciliation_events;

drop policy invoice_items_select on public.invoice_items;

drop policy invoices_select on public.invoices;

drop policy "Artikelkosten aendern" on public.item_costs;

drop policy "Artikelkosten anlegen" on public.item_costs;

drop policy "Artikelkosten lesen" on public.item_costs;

drop policy "Artikelkosten loeschen" on public.item_costs;

drop policy "Artikelbild aendern" on public.item_media;

drop policy "Artikelbild anlegen" on public.item_media;

drop policy "Artikelbild loeschen" on public.item_media;

drop policy "Artikelbilder lesen" on public.item_media;

drop policy "Inseratbilder ändern" on public.listing_images;

drop policy "Inseratbilder anlegen" on public.listing_images;

drop policy "Inseratbilder lesen" on public.listing_images;

drop policy "Inseratbilder löschen" on public.listing_images;

drop policy "Inserate lesen" on public.listings;

drop policy "Inseratsinhalt ändern" on public.listings;

drop policy "Recherche aendern" on public.market_research;

drop policy "Recherche anlegen" on public.market_research;

drop policy "Recherche loeschen" on public.market_research;

drop policy "Recherchen lesen" on public.market_research;

drop policy "Mitglieder lesen Nummernvergaben" on public.number_assignments;

drop policy "Admins lesen Nummernänderungen" on public.number_series_changes;

drop policy "Mitglieder lesen Nummernkreise" on public.number_series;

drop policy offline_purchase_entries_delete on public.offline_purchase_entries;

drop policy offline_purchase_entries_insert on public.offline_purchase_entries;

drop policy offline_purchase_entries_select on public.offline_purchase_entries;

drop policy offline_purchase_entries_update on public.offline_purchase_entries;

drop policy price_tracked_items_delete on public.price_tracked_items;

drop policy price_tracked_items_insert on public.price_tracked_items;

drop policy price_tracked_items_select on public.price_tracked_items;

drop policy price_tracked_items_update on public.price_tracked_items;

drop policy "Einkaufsnebenkosten aendern" on public.purchase_costs;

drop policy "Einkaufsnebenkosten anlegen" on public.purchase_costs;

drop policy "Einkaufsnebenkosten lesen" on public.purchase_costs;

drop policy "Einkaufsnebenkosten loeschen" on public.purchase_costs;

drop policy "Belege anlegen" on public.purchase_documents;

drop policy "Belege entfernen" on public.purchase_documents;

drop policy "Belege lesen" on public.purchase_documents;

drop policy "Einkaufspositionen aendern" on public.purchase_lines;

drop policy "Einkaufspositionen anlegen" on public.purchase_lines;

drop policy "Einkaufspositionen lesen" on public.purchase_lines;

drop policy "Einkaufspositionen loeschen" on public.purchase_lines;

drop policy "Mitglieder lesen Paketerfassungen" on public.purchase_package_capture_requests;

drop policy "Wareneingangsrequests lesen" on public.purchase_receipt_requests;

drop policy "Einkaeufe lesen" on public.purchases;

drop policy "Einkauf aendern" on public.purchases;

drop policy "Einkauf anlegen" on public.purchases;

drop policy "Mitglieder lesen Kommentare" on public.record_comments;

drop policy "Mitglieder schreiben eigene Kommentare" on public.record_comments;

drop policy "Vergleichsangebot aendern" on public.research_comparables;

drop policy "Vergleichsangebot anlegen" on public.research_comparables;

drop policy "Vergleichsangebot loeschen" on public.research_comparables;

drop policy "Vergleichsangebote lesen" on public.research_comparables;

drop policy research_queries_delete on public.research_queries;

drop policy research_queries_insert on public.research_queries;

drop policy research_queries_select on public.research_queries;

drop policy returns_select on public.returns;

drop policy "Verkaufskosten aendern" on public.sale_cost_entries;

drop policy "Verkaufskosten anlegen" on public.sale_cost_entries;

drop policy "Verkaufskosten lesen" on public.sale_cost_entries;

drop policy "Verkaufskosten loeschen" on public.sale_cost_entries;

drop policy "Loszuordnungen lesen" on public.sale_line_lot_allocations;

drop policy "Verkaufspositionen lesen" on public.sale_lines;

drop policy "Verkaeufe lesen" on public.sales;

drop policy shipping_orders_delete on public.shipping_orders;

drop policy shipping_orders_insert on public.shipping_orders;

drop policy shipping_orders_select on public.shipping_orders;

drop policy shipping_orders_update on public.shipping_orders;

drop policy "Mitglieder duerfen eigene Treffer lesen" on public.sniper_hits;

drop policy "Abonnenten duerfen ihre Abfragen lesen" on public.sniper_queries;

drop policy "Mitglieder duerfen eigene Abonnements lesen" on public.sniper_query_subscriptions;

drop policy "Mitglieder lesen Merkzetteltreffer" on public.sniper_watchlist_hits;

drop policy "Mitglieder lesen Merkzettel" on public.sniper_watchlists;

drop policy "Quelle aendern" on public.sources;

drop policy "Quelle anlegen" on public.sources;

drop policy "Quelle loeschen" on public.sources;

drop policy "Quellen lesen" on public.sources;

drop policy "Bestandslose lesen" on public.stock_lots;

drop policy "Bestandsbewegungen lesen" on public.stock_movements;

drop policy store_order_items_select on public.store_order_items;

drop policy store_orders_select on public.store_orders;

drop policy store_settings_delete on public.store_settings;

drop policy store_settings_insert on public.store_settings;

drop policy store_settings_select on public.store_settings;

drop policy store_settings_update on public.store_settings;

drop policy "Lieferant aendern" on public.suppliers;

drop policy "Lieferant anlegen" on public.suppliers;

drop policy "Lieferant loeschen" on public.suppliers;

drop policy "Lieferanten lesen" on public.suppliers;

drop policy tax_advisor_configs_delete on public.tax_advisor_configs;

drop policy tax_advisor_configs_insert on public.tax_advisor_configs;

drop policy tax_advisor_configs_select on public.tax_advisor_configs;

drop policy tax_advisor_configs_update on public.tax_advisor_configs;

drop policy webhook_configs_delete on public.webhook_configs;

drop policy webhook_configs_insert on public.webhook_configs;

drop policy webhook_configs_select on public.webhook_configs;

drop policy webhook_configs_update on public.webhook_configs;

drop policy "Unternehmensdaten lesen" on public.workspace_company_profiles;

create or replace function public.activate_beta_access()
  returns setof public.workspace_licenses
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_application public.beta_applications; v_license public.workspace_licenses;
begin
  if (select auth.uid()) is null then raise exception 'Nicht angemeldet' using errcode='42501'; end if;
  select * into v_application from public.beta_applications where auth_user_id=(select auth.uid()) and status='accepted' for update;
  if not found then return; end if;
  select * into v_license from public.workspace_licenses where beta_application_id=v_application.id for update;
  if v_license.status<>'pending' then return next v_license; return; end if;
  if v_application.registration_link_kind='managed' or v_application.revoked_at is not null
    or v_application.invitation_expires_at<=now() then raise exception 'Registrierungslink ist ungültig oder abgelaufen' using errcode='22023'; end if;
  -- Altlinks benötigen einen tatsächlich bestätigten Auth-Nutzer mit Passwort.
  if not exists(select 1 from auth.users where id=(select auth.uid()) and email_confirmed_at is not null
    and nullif(encrypted_password,'') is not null) then raise exception 'Die Registrierung ist noch nicht abgeschlossen' using errcode='22023'; end if;
  update public.workspace_licenses set status='active',starts_at=now(),ends_at=now()+make_interval(days=>granted_days),updated_at=now()
    where workspace_id=v_license.workspace_id returning * into v_license;
  update public.beta_applications set registered_at=now() where id=v_application.id;
  return next v_license;
end;
$function$;

create or replace function public.add_purchase_lines (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_lines        jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_line jsonb;
  v_line_id uuid;
  v_inserted_ids uuid[] := array[]::uuid[];
  v_catalog_product_id uuid;
  v_all_line_ids uuid[];
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_existing_line_count integer := 0;
  v_existing_unit_total bigint := 0;
  v_existing_unit_max integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_purchase_id is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
  end if;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können nicht erweitert werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_existing_line_count, v_existing_unit_total, v_existing_unit_max
  from public.purchase_lines as line
  where line.purchase_id = p_purchase_id
    and line.workspace_id = p_workspace_id;

  if v_existing_line_count + pg_catalog.jsonb_array_length(p_lines)
      > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_existing_unit_max > v_max_purchase_units
    or v_existing_unit_total + v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  if exists (
    select 1 from public.purchase_lines
    where purchase_id = p_purchase_id and workspace_id = p_workspace_id
      and received_quantity > 0
  ) then
    raise exception using errcode = '22023', message = 'Nach dem ersten Wareneingang können keine Positionen ergänzt werden.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
    v_catalog_product_id := case
      when coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null') = 'null'
        then null
      else (v_line ->> 'catalog_product_id')::uuid
    end;
    if (v_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    insert into public.purchase_lines (
      is_package,
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      ean_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost
    ) values (
      coalesce((v_line ->> 'is_package')::boolean, false),
      p_workspace_id,
      p_purchase_id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      nullif(btrim(v_line ->> 'ean_snapshot'), ''),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_purchase.cost_allocation_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end
    ) returning id into v_line_id;
    v_inserted_ids := array_append(v_inserted_ids, v_line_id);
  end loop;

  select array_agg(line.id order by line.created_at, line.id)
  into v_all_line_ids
  from public.purchase_lines as line
  where line.purchase_id = p_purchase_id and line.workspace_id = p_workspace_id;
  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = p_purchase_id;

  if v_purchase.cost_allocation_mode = 'manual' then
    select coalesce(round(sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_all_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using errcode = '22023', message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  else
    update public.purchase_lines
    set allocated_additional_cost = 0
    where id = any(v_all_line_ids);

    if v_total_expense_cents > 0 then
      with weights as (
        select
          line.id,
          ids.ordinality,
          case
            when v_purchase.cost_allocation_mode = 'value_weighted'
              and totals.value_total > 0 then line.line_total
            else line.ordered_quantity::numeric
          end as weight
        from unnest(v_all_line_ids) with ordinality as ids(id, ordinality)
        join public.purchase_lines as line on line.id = ids.id
        cross join (
          select sum(candidate.line_total) as value_total
          from public.purchase_lines as candidate
          where candidate.id = any(v_all_line_ids)
        ) as totals
      ), shares as (
        select weights.*,
          v_total_expense_cents::numeric * weight / nullif(sum(weight) over (), 0) as exact_cents
        from weights
      ), ranked as (
        select shares.*,
          floor(exact_cents)::bigint as floor_cents,
          row_number() over (order by exact_cents - floor(exact_cents) desc, ordinality) as remainder_rank,
          v_total_expense_cents - sum(floor(exact_cents)::bigint) over () as remainder_cents
        from shares
      )
      update public.purchase_lines as line
      set allocated_additional_cost = (
        ranked.floor_cents + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
      )::numeric / 100
      from ranked
      where line.id = ranked.id;
    end if;
  end if;

  return jsonb_build_object(
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by line.created_at, line.id)
      from public.purchase_lines as line
      where line.id = any(v_inserted_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.begin_beta_registration (
  p_token_hash text,
  p_request_id uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_registration jsonb; v_operation public.beta_lifecycle_operations;
begin
  v_registration:=public.inspect_beta_registration(p_token_hash);
  v_operation:=public.claim_beta_lifecycle_operation((v_registration->>'application_id')::uuid,p_request_id,'register');
  -- Nach der Bewerbungssperre erneut lesen: ein zeitgleicher Widerruf darf nicht gewinnen.
  v_registration:=public.inspect_beta_registration(p_token_hash);
  if v_operation.status='succeeded' then raise exception 'Registrierung bereits abgeschlossen' using errcode='22023'; end if;
  if v_registration->>'auth_user_id' is null then raise exception 'Vorbereitetes Konto fehlt' using errcode='22023'; end if;
  update public.beta_lifecycle_operations set result=v_registration || jsonb_build_object('token_hash',p_token_hash)
    where request_id=p_request_id;
  return v_registration || jsonb_build_object('lease_id',v_operation.lease_id);
end;
$function$;

revoke all on function public.begin_beta_registration(text, uuid) from public;

grant all on function public.begin_beta_registration(text, uuid) to service_role;

create or replace function public.book_bank_transaction (
  p_workspace_id   uuid,
  p_transaction_id uuid,
  p_booked_at      timestamp with time zone,
  p_store_order_id uuid                     default null::uuid
)
  returns public.bank_transactions
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_transaction public.bank_transactions;
  v_order_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select * into v_transaction
  from public.bank_transactions
  where id = p_transaction_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Die Banktransaktion wurde nicht gefunden.';
  end if;

  if p_store_order_id is not null then
    update public.store_orders
    set payment_status = 'paid', status = 'confirmed'
    where id = p_store_order_id
      and workspace_id = p_workspace_id
    returning id into v_order_id;

    if v_order_id is null then
      raise no_data_found using message = 'Die zugehörige Shop-Bestellung wurde nicht gefunden.';
    end if;
  end if;

  update public.bank_transactions
  set status = 'booked', booked_at = p_booked_at
  where id = p_transaction_id
    and workspace_id = p_workspace_id
  returning * into v_transaction;

  return v_transaction;
end;
$function$;

create function public.broadcast_workspace_access()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  perform realtime.send(jsonb_build_object('workspace_id',new.workspace_id),'workspace_access_changed','workspace:'||new.workspace_id::text||':access',true);
  return new;
end;
$function$;

revoke all on function public.broadcast_workspace_access() from public;

create or replace function public.bundle_shipping_orders (
  p_workspace_id        uuid,
  p_order_ids           uuid[],
  p_order_number        text,
  p_order_date          date,
  p_platform            text,
  p_item_title          text,
  p_item_sku            text,
  p_item_condition      text,
  p_sale_price          numeric,
  p_customer            jsonb,
  p_carrier             text,
  p_package_type        text,
  p_bundled_item_titles text[],
  p_notes               text
)
  returns public.shipping_orders
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_snapshot jsonb;
  v_bundled_order public.shipping_orders;
  v_found_count integer;
  v_non_null_sale_count integer;
  v_distinct_sale_count integer;
  v_sale_id uuid;
  v_sale_ids uuid[];
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if coalesce(cardinality(p_order_ids), 0) < 2
    or cardinality(p_order_ids) <> (select count(distinct id) from unnest(p_order_ids) as id) then
    raise exception using errcode = '22023', message = 'Ein Sammelpaket braucht mindestens zwei unterschiedliche Sendungen.';
  end if;

  with source_orders as (
    select *
    from public.shipping_orders
    where workspace_id = p_workspace_id
      and id = any(p_order_ids)
    for update
  )
  select
    count(*),
    coalesce(jsonb_agg(to_jsonb(source_orders)), '[]'::jsonb),
    count(sale_id),
    count(distinct sale_id),
    array_agg(sale_id)
  into v_found_count, v_snapshot, v_non_null_sale_count, v_distinct_sale_count, v_sale_ids
  from source_orders;

  if v_found_count <> cardinality(p_order_ids) then
    raise no_data_found using message = 'Mindestens eine Sendung wurde nicht gefunden.';
  end if;

  if v_non_null_sale_count <> v_found_count or v_distinct_sale_count <> 1 then
    v_sale_id := null;
  else
    v_sale_id := v_sale_ids[1];
  end if;

  insert into public.shipping_orders (
    workspace_id,
    sale_id,
    order_number,
    order_date,
    platform,
    item_title,
    item_sku,
    item_condition,
    sale_price,
    customer,
    carrier,
    package_type,
    status,
    notes,
    is_bundled,
    bundled_order_ids,
    bundled_item_titles,
    bundled_orders_snapshot
  )
  values (
    p_workspace_id,
    v_sale_id,
    p_order_number,
    p_order_date,
    p_platform,
    p_item_title,
    p_item_sku,
    p_item_condition,
    p_sale_price,
    p_customer,
    p_carrier,
    p_package_type,
    'ready_to_pack',
    p_notes,
    true,
    p_order_ids::text[],
    p_bundled_item_titles,
    v_snapshot
  )
  returning * into v_bundled_order;

  delete from public.shipping_orders
  where workspace_id = p_workspace_id
    and id = any(p_order_ids);

  return v_bundled_order;
end;
$function$;

create function public.can_access_workspace (
  ws_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select public.is_workspace_member(ws_id) and public.workspace_access_is_valid(ws_id);
$function$;

revoke all on function public.can_access_workspace(uuid) from public;

grant all on function public.can_access_workspace(uuid) to authenticated;

grant all on function public.can_access_workspace(uuid) to service_role;

create function public.can_administer_workspace (
  ws_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select public.is_workspace_admin(ws_id) and public.workspace_access_is_valid(ws_id);
$function$;

revoke all on function public.can_administer_workspace(uuid) from public;

grant all on function public.can_administer_workspace(uuid) to authenticated;

grant all on function public.can_administer_workspace(uuid) to service_role;

create or replace function public.can_manage_company_logo_path (
  p_path text
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select exists (
    select 1
    from public.workspace_members as member
    join public.workspaces as workspace on workspace.id = member.workspace_id
    where public.can_access_workspace(member.workspace_id) and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
      and workspace.archived_at is null
      and member.workspace_id::text = pg_catalog.split_part(p_path, '/', 1)
      and public.is_company_logo_path(p_path, member.workspace_id)
  );
$function$;

create or replace function public.capture_purchase_package_contents (
  p_workspace_id     uuid,
  p_purchase_line_id uuid,
  p_items            jsonb,
  p_request_id       uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_line public.purchase_lines;
  v_previous public.purchase_package_capture_requests;
  v_item jsonb;
  v_inventory public.inventory_items;
  v_items jsonb := '[]'::jsonb;
  v_response jsonb;
  v_purchase_id uuid;
  v_archived_at timestamptz;
begin
  if v_actor_id is null or p_workspace_id is null or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_purchase_line_id is null or p_request_id is null
    or pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Paketposition, Request-ID und Inhaltsliste sind erforderlich.';
  end if;
  if pg_catalog.jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Bitte zwischen einem und 100 Artikeln erfassen.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'package:' || p_workspace_id::text || ':' || p_request_id::text, 0));
  select * into v_previous from public.purchase_package_capture_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_previous.purchase_line_id is distinct from p_purchase_line_id or v_previous.request_items is distinct from p_items then
      raise exception using errcode = '22023', message = 'Die Request-ID wurde bereits für eine andere Paketerfassung verwendet.';
    end if;
    return v_previous.response;
  end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then
    raise exception using errcode = '55000', message = 'Der Workspace ist archiviert.';
  end if;
  select purchase_id into v_purchase_id from public.purchase_lines
    where workspace_id = p_workspace_id and id = p_purchase_line_id;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diese Paketposition.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_purchase_id::text, 0));
  select * into v_purchase from public.purchases
    where workspace_id = p_workspace_id and id = v_purchase_id for update;
  select * into v_line from public.purchase_lines
    where workspace_id = p_workspace_id and id = p_purchase_line_id for update;
  if v_line.id is null or not v_line.is_package or v_line.purchase_id is distinct from v_purchase.id then
    raise exception using errcode = '22023', message = 'Die Position ist kein Paket dieses Einkaufs.';
  end if;
  if v_purchase.shipment_status <> 'arrived' or v_purchase.arrived_at is null
    or v_purchase.receiving_status = 'archived' then
    raise exception using errcode = '22023', message = 'Vor der Paketerfassung muss die Ankunft bestätigt sein.';
  end if;
  if public.purchase_has_open_prices(p_workspace_id, v_purchase.id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor der Bestandsübernahme ergänzt werden.';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['title','condition','brand','model','description','expected_value']::text[] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item -> 'title') is distinct from 'string'
      or nullif(pg_catalog.btrim(v_item ->> 'title'), '') is null
      or pg_catalog.length(v_item ->> 'title') > 300
      or pg_catalog.jsonb_typeof(v_item -> 'condition') is distinct from 'string'
      or v_item ->> 'condition' not in ('new','like_new','very_good','used','heavily_used','defective')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'brand'),'null') not in ('null','string')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'model'),'null') not in ('null','string')
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'description'),'null') not in ('null','string')
      or pg_catalog.length(v_item ->> 'description') > 5000
      or coalesce(pg_catalog.jsonb_typeof(v_item -> 'expected_value'),'null') not in ('null','number') then
      raise exception using errcode = '22023', message = 'Die Artikeldaten des Paketinhalts sind ungültig.';
    end if;
    if v_item ->> 'expected_value' is not null and (
      (v_item ->> 'expected_value')::numeric < 0
      or (v_item ->> 'expected_value')::numeric >= 'Infinity'::numeric
      or (v_item ->> 'expected_value')::numeric <> pg_catalog.round((v_item ->> 'expected_value')::numeric,2)
    ) then
      raise exception using errcode = '22023', message = 'Der erwartete Verkaufswert muss nichtnegativ und centgenau sein.';
    end if;
    insert into public.inventory_items (
      workspace_id, purchase_id, source_package_line_id, title, condition, brand, model, description,
      status, allocated_purchase_cost, tax_purchase_cost, expected_value, is_public_store
    ) values (
      p_workspace_id, v_purchase.id, v_line.id, pg_catalog.btrim(v_item ->> 'title'), v_item ->> 'condition',
      nullif(pg_catalog.btrim(v_item ->> 'brand'), ''), nullif(pg_catalog.btrim(v_item ->> 'model'), ''),
      nullif(pg_catalog.btrim(v_item ->> 'description'), ''),
      case when v_purchase.entry_status = 'finalized' then 'ready' else 'received' end,
      null, null, (v_item ->> 'expected_value')::numeric, false
    ) returning * into v_inventory;
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(v_inventory));
  end loop;
  update public.purchase_lines set received_quantity = 1, updated_at = statement_timestamp()
    where workspace_id = p_workspace_id and id = v_line.id returning * into v_line;
  v_response := pg_catalog.jsonb_build_object('inventory_items',v_items,'purchase_line',pg_catalog.to_jsonb(v_line));
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,changes)
    values (p_workspace_id,'purchase',v_purchase.id,'purchase_package_contents_captured',v_actor_id,
      pg_catalog.jsonb_build_object('source_package_line_id',v_line.id,'request_id',p_request_id,'inventory_items',v_items));
  insert into public.purchase_package_capture_requests(workspace_id,purchase_line_id,request_id,request_items,response)
    values (p_workspace_id,v_line.id,p_request_id,p_items,v_response);
  return v_response;
end;
$function$;

create function public.change_beta_duration (
  p_application_id uuid,
  p_request_id     uuid,
  p_action         text,
  p_days           integer
)
  returns public.workspace_licenses
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_operation public.beta_lifecycle_operations; v_license public.workspace_licenses;
begin
  if not public.is_platform_operator() then raise exception 'Nur für Betreiber' using errcode='42501'; end if;
  if p_action not in ('extend','end') or (p_action='extend' and (p_days is null or p_days<1 or p_days>3650)) then
    raise exception 'Bitte eine ganze Zahl zwischen 1 und 3650 Tagen eingeben' using errcode='22023'; end if;
  v_operation:=public.claim_beta_lifecycle_operation(p_application_id,p_request_id,p_action);
  if v_operation.status='succeeded' then
    if v_operation.result->>'days' is distinct from p_days::text then raise exception 'Vorgangskennung bereits verwendet' using errcode='22023'; end if;
    return jsonb_populate_record(null::public.workspace_licenses,v_operation.result->'license');
  end if;
  select * into v_license from public.workspace_licenses where beta_application_id=p_application_id for update;
  if not found or v_license.access_source<>'beta' or v_license.status in ('pending','suspended')
    or not exists(select 1 from public.beta_applications where id=p_application_id and registered_at is not null and revoked_at is null) then
    raise exception 'Nur registrierte Beta-Konten können geändert werden' using errcode='22023'; end if;
  update public.workspace_licenses set
    ends_at=case when p_action='end' then now() else
      (case when status='active' and ended_at is null and ends_at>now() then ends_at else now() end)+make_interval(days=>p_days) end,
    ended_at=case when p_action='end' then now() else null end,
    status=case when p_action='end' then 'expired' else 'active' end,updated_at=now()
    where workspace_id=v_license.workspace_id returning * into v_license;
  update public.beta_lifecycle_operations set status='succeeded',result=jsonb_build_object('days',p_days,'license',to_jsonb(v_license)) where request_id=p_request_id;
  return v_license;
end;
$function$;

revoke all on function public.change_beta_duration(uuid, uuid, text, integer) from public;

grant all on function public.change_beta_duration(uuid, uuid, text, integer) to authenticated;

grant all on function public.change_beta_duration(uuid, uuid, text, integer) to service_role;

create function public.complete_beta_invitation (
  p_request_id uuid,
  p_lease_id   uuid,
  p_sent       boolean,
  p_error      text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_operation public.beta_lifecycle_operations;
begin
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  perform 1 from public.beta_applications where id=v_operation.application_id for update;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id for update;
  if v_operation.id is null or v_operation.lease_id<>p_lease_id or v_operation.action<>'invite' or v_operation.status<>'processing' or v_operation.lease_expires_at<=now()
    or exists(select 1 from public.beta_applications where id=v_operation.application_id and revoked_at is not null) then
    raise exception 'Einladungsversand nicht mehr gültig' using errcode='22023';
  end if;
  update public.beta_applications set invitation_status=case when p_sent then 'sent' else 'failed' end,
    invitation_last_error=case when p_sent then null else left(p_error,500) end where id=v_operation.application_id;
  update public.beta_lifecycle_operations set status=case when p_sent then 'succeeded' else 'failed' end where request_id=p_request_id;
  if not p_sent then update public.beta_registration_links set revoked_at=now() where token_hash=v_operation.result->>'token_hash'; end if;
  return jsonb_build_object('application_id',v_operation.application_id);
end;
$function$;

revoke all on function public.complete_beta_invitation(uuid, uuid, boolean, text) from public;

grant all on function public.complete_beta_invitation(uuid, uuid, boolean, text) to service_role;

create function public.complete_beta_registration (
  p_request_id uuid,
  p_lease_id   uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_operation public.beta_lifecycle_operations; v_registration jsonb; v_license public.workspace_licenses;
begin
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  perform 1 from public.beta_applications where id=v_operation.application_id for update;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id for update;
  if v_operation.id is null or v_operation.action<>'register' or v_operation.status<>'processing' or v_operation.lease_id<>p_lease_id
    or v_operation.lease_expires_at<=now() then raise exception 'Registrierung nicht mehr gültig' using errcode='22023'; end if;
  v_registration:=public.inspect_beta_registration(v_operation.result->>'token_hash');
  if not exists(select 1 from auth.users where id=(v_registration->>'auth_user_id')::uuid
    and email_confirmed_at is not null and nullif(encrypted_password,'') is not null and (banned_until is null or banned_until<=now())) then
    raise exception 'Passwortvergabe nicht abgeschlossen' using errcode='22023';
  end if;
  update public.workspace_licenses set status='active',starts_at=now(),ends_at=now()+make_interval(days=>granted_days),updated_at=now()
    where beta_application_id=v_operation.application_id and status='pending' returning * into v_license;
  if not found then raise exception 'Ausstehende Beta-Lizenz fehlt' using errcode='22023'; end if;
  update public.beta_applications set registered_at=now() where id=v_operation.application_id;
  update public.beta_registration_links set consumed_at=now() where token_hash=v_operation.result->>'token_hash';
  update public.beta_lifecycle_operations set status='succeeded' where request_id=p_request_id;
  return jsonb_build_object('workspace_id',v_license.workspace_id);
end;
$function$;

revoke all on function public.complete_beta_registration(uuid, uuid) from public;

grant all on function public.complete_beta_registration(uuid, uuid) to service_role;

create function public.complete_beta_withdrawal (
  p_request_id uuid,
  p_lease_id   uuid
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_operation public.beta_lifecycle_operations;
begin
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  perform 1 from public.beta_applications where id=v_operation.application_id for update;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id for update;
  if v_operation.status='succeeded' then return; end if;
  if v_operation.action<>'withdraw' or v_operation.lease_id<>p_lease_id or v_operation.status<>'processing' then
    raise exception 'Ungültiger Löschvorgang' using errcode='22023'; end if;
  if exists(select 1 from auth.users where id=(v_operation.result->>'user_id')::uuid) then
    raise exception 'Auth-Konto ist noch vorhanden' using errcode='22023'; end if;
  -- Ausschließlich der vorher gesperrte, leere Vorbereitungs-Workspace wird gelöscht.
  -- Der bestehende Belegschutz prüft erneut und stoppt bei Geschäftsdaten.
  delete from public.workspaces where id=(v_operation.result->>'workspace_id')::uuid;
  delete from public.beta_applications where id=v_operation.application_id and revoked_at is not null and registered_at is null;
  update public.beta_lifecycle_operations set status='succeeded' where request_id=p_request_id;
end;
$function$;

revoke all on function public.complete_beta_withdrawal(uuid, uuid) from public;

grant all on function public.complete_beta_withdrawal(uuid, uuid) to service_role;

create or replace function public.correct_purchase_costing (
  p_workspace_id   uuid,
  p_purchase_id    uuid,
  p_reason         text,
  p_purchase_price numeric,
  p_lines          jsonb,
  p_costs          jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_existing_line public.purchase_lines;
  v_line public.purchase_lines;
  v_existing_cost public.purchase_costs;
  v_lot public.stock_lots;
  v_allocation public.sale_line_lot_allocations;
  v_cohort record;
  v_input_line jsonb;
  v_input_cost jsonb;
  v_costing_plan jsonb;
  v_line_plan jsonb;
  v_existing_line_ids uuid[] := array[]::uuid[];
  v_input_line_ids uuid[] := array[]::uuid[];
  v_input_cost_ids uuid[] := array[]::uuid[];
  v_item_ids uuid[];
  v_lot_ids uuid[];
  v_sale_line_ids uuid[];
  v_unit_shares bigint[];
  v_tax_unit_costs numeric[];
  v_lot_unit_shares bigint[];
  v_line_id uuid;
  v_cost_id uuid;
  v_catalog_product_id uuid;
  v_target_line_id uuid;
  v_goods_cents bigint;
  v_total_cents bigint;
  v_allocated_cents bigint;
  v_lot_total_cents bigint;
  v_allocation_cost_cents bigint;
  v_active_allocation_cost_cents bigint;
  v_unit_offset integer;
  v_active_unit_offset integer;
  v_restocked_quantity integer;
  v_active_quantity integer;
  v_existing_count integer;
  v_stock_lot_id uuid;
  v_before_purchase jsonb;
  v_after_purchase jsonb;
  v_before_lines jsonb;
  v_after_lines jsonb;
  v_before_costs jsonb;
  v_after_costs jsonb;
  v_before_items jsonb;
  v_after_items jsonb;
  v_before_lots jsonb;
  v_after_lots jsonb;
  v_before_sale_lines jsonb;
  v_after_sale_lines jsonb;
  v_before_allocations jsonb;
  v_after_allocations jsonb;
  v_before_cogs numeric(18,2) := 0;
  v_after_cogs numeric(18,2) := 0;
  v_event_id uuid;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_persisted_line_count integer := 0;
  v_persisted_unit_total bigint := 0;
  v_persisted_unit_max integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_sale_history_state text;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not exists (
      select 1
      from public.workspace_members as member
      where member.workspace_id = p_workspace_id
        and member.user_id = v_actor_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if nullif(pg_catalog.btrim(p_reason), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Ein verständlicher Grund der Korrektur ist erforderlich.';
  end if;

  if pg_catalog.length(pg_catalog.btrim(p_reason)) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Der Grund der Korrektur ist zu lang.';
  end if;

  if p_lines is null
    or pg_catalog.jsonb_typeof(p_lines) <> 'array'
    or pg_catalog.jsonb_array_length(p_lines) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
  end if;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  if p_costs is null
    or pg_catalog.jsonb_typeof(p_costs) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Die Ersatz-Zusatzkosten sind ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status <> 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Nur ein finalisierter Einkauf kann korrigiert werden.';
  end if;

  v_sale_history_state := public.get_purchase_sale_history_state(
    p_workspace_id,
    p_purchase_id
  );
  if v_sale_history_state = 'review_required' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsstatus ist unvollständig. Bitte Verkaufsdaten prüfen und nachpflegen.';
  elsif v_sale_history_state = 'none' then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Verkauf muss wieder geöffnet werden.';
  elsif v_sale_history_state <> 'recorded' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsverlauf konnte nicht sicher geprüft werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_persisted_line_count, v_persisted_unit_total, v_persisted_unit_max
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_persisted_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_persisted_unit_max > v_max_purchase_units
    or v_persisted_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
    if p_purchase_price is null
      or p_purchase_price = 'NaN'::numeric
      or p_purchase_price < 0
      or pg_catalog.scale(p_purchase_price) > 2 then
      raise exception using
        errcode = '22023',
        message = 'Der korrigierte Mystery-Kaufpreis ist ungültig.';
    end if;
  elsif p_purchase_price is not null then
    raise exception using
      errcode = '22023',
      message = 'Normale Einkäufe leiten den Kaufpreis ausschließlich aus den Positionen ab.';
  end if;

  perform line.id
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
  order by line.created_at, line.id
  for update;

  perform cost.id
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id
  order by cost.created_at, cost.id
  for update;

  perform item.id
  from public.inventory_items as item
  left join public.purchase_lines as linked_line
    on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
  where item.workspace_id = p_workspace_id
    and (
      item.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by item.created_at, item.id
  for update of item;

  perform lot.id
  from public.stock_lots as lot
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by lot.received_at, lot.id
  for update of lot;

  perform allocation.id
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where allocation.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by allocation.created_at, allocation.id
  for update of allocation;

  select pg_catalog.array_agg(affected.sale_line_id order by affected.sale_line_id)
  into v_sale_line_ids
  from (
    select sale_line.id as sale_line_id
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as linked_line
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where sale_line.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
    union
    select allocation.sale_line_id
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where allocation.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
  ) as affected;

  if coalesce(pg_catalog.cardinality(v_sale_line_ids), 0) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Verkauf muss wieder geöffnet werden.';
  end if;

  perform sale_line.id
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids)
  order by sale_line.created_at, sale_line.id
  for update;

  perform sale.id
  from public.sales as sale
  join public.sale_lines as sale_line
    on sale_line.workspace_id = sale.workspace_id
    and sale_line.sale_id = sale.id
  where sale.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids)
  order by sale.created_at, sale.id
  for update of sale;

  if exists (
    select 1
    from public.sale_line_lot_allocations as allocation
    join public.sale_lines as sale_line
      on sale_line.workspace_id = allocation.workspace_id
      and sale_line.id = allocation.sale_line_id
    join public.sales as sale
      on sale.workspace_id = sale_line.workspace_id
      and sale.id = sale_line.sale_id
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    where allocation.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and allocation.consumption_sequence is null
    group by allocation.stock_lot_id, sale.created_at, allocation.created_at
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die historische Losentnahmereihenfolge ist nicht eindeutig. Bitte vor der Korrektur manuell prüfen.';
  end if;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.';
  end if;

  select coalesce(pg_catalog.array_agg(line.id order by line.created_at, line.id), array[]::uuid[])
  into v_existing_line_ids
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  v_before_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'title_snapshot', line.title_snapshot,
    'line_kind', line.line_kind,
    'ordered_quantity', line.ordered_quantity,
    'price_mode', line.price_mode,
    'unit_purchase_price', line.unit_purchase_price,
    'line_total', line.line_total,
    'condition_snapshot', line.condition_snapshot,
    'estimated_market_value', line.estimated_market_value,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_before_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', cost.id,
    'type', cost.type,
    'amount', cost.amount,
    'tax_treatment', cost.tax_treatment,
    'description', cost.description,
    'allocation_method', cost.allocation_method,
    'target_purchase_line_id', cost.target_purchase_line_id
  ) order by cost.created_at, cost.id), '[]'::jsonb)
  into v_before_costs
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'purchase_line_id', item.purchase_line_id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_before_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'purchase_line_id', lot.purchase_line_id,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_before_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', sale_line.id,
    'sale_id', sale_line.sale_id,
    'cost_of_goods_sold', sale_line.cost_of_goods_sold
  ) order by sale_line.created_at, sale_line.id), '[]'::jsonb),
    case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
  into v_before_sale_lines, v_before_cogs
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', allocation.id,
    'sale_line_id', allocation.sale_line_id,
    'stock_lot_id', allocation.stock_lot_id,
    'quantity', allocation.quantity,
    'unit_cost', allocation.unit_cost,
    'allocated_cost', allocation.allocated_cost,
    'tax_purchase_cost', allocation.tax_purchase_cost,
    'tax_cost_allocations', allocation.tax_cost_allocations,
    'active_tax_unit_costs', allocation.active_tax_unit_costs,
    'active_unit_costs', allocation.active_unit_costs,
    'active_allocated_cost', allocation.active_allocated_cost,
    'consumption_sequence', allocation.consumption_sequence
  ) order by allocation.created_at, allocation.id), '[]'::jsonb)
  into v_before_allocations
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  where allocation.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if v_input_line ? 'is_package' and pg_catalog.jsonb_typeof(v_input_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
    if pg_catalog.jsonb_typeof(v_input_line) <> 'object'
      or not (v_input_line ?& array[
        'id', 'catalog_product_id', 'title_snapshot', 'line_kind',
        'ordered_quantity', 'price_mode', 'unit_purchase_price', 'line_total',
        'condition_snapshot', 'estimated_market_value'
      ])
      or v_input_line - 'is_package' - array[
        'id', 'catalog_product_id', 'title_snapshot', 'line_kind',
        'ordered_quantity', 'price_mode', 'unit_purchase_price', 'line_total',
        'condition_snapshot', 'estimated_market_value'
      ]::text[] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_input_line -> 'id') <> 'string'
      or (v_input_line ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_input_line -> 'title_snapshot') <> 'string'
      or nullif(pg_catalog.btrim(v_input_line ->> 'title_snapshot'), '') is null
      or pg_catalog.jsonb_typeof(v_input_line -> 'line_kind') <> 'string'
      or v_input_line ->> 'line_kind' not in ('quantity', 'individual')
      or pg_catalog.jsonb_typeof(v_input_line -> 'ordered_quantity') <> 'number'
      or (v_input_line ->> 'ordered_quantity') !~ '^[1-9][0-9]*$'
      or pg_catalog.jsonb_typeof(v_input_line -> 'price_mode') <> 'string'
      or v_input_line ->> 'price_mode' not in ('priced', 'unpriced_mystery')
      or pg_catalog.jsonb_typeof(v_input_line -> 'catalog_product_id') not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_input_line -> 'catalog_product_id') = 'string'
        and (v_input_line ->> 'catalog_product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      or pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') = 'string'
        and v_input_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      )
      or pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') = 'number'
        and (
          (v_input_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_input_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;

    v_line_id := (v_input_line ->> 'id')::uuid;
    if v_line_id = any(v_input_line_ids) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;
    v_input_line_ids := pg_catalog.array_append(v_input_line_ids, v_line_id);

    v_catalog_product_id := case
      when pg_catalog.jsonb_typeof(v_input_line -> 'catalog_product_id') = 'null'
        then null
      else (v_input_line ->> 'catalog_product_id')::uuid
    end;

    if (v_input_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_input_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;

    if coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if v_input_line ->> 'price_mode' <> 'unpriced_mystery'
        or pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') <> 'null'
        or pg_catalog.jsonb_typeof(v_input_line -> 'line_total') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
      end if;
    elsif v_input_line ->> 'price_mode' <> 'priced'
      or pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') <> 'number'
      or pg_catalog.jsonb_typeof(v_input_line -> 'line_total') <> 'number'
      or (v_input_line ->> 'unit_purchase_price')::numeric < 0
      or (v_input_line ->> 'line_total')::numeric < 0
      or pg_catalog.scale((v_input_line ->> 'unit_purchase_price')::numeric) > 16
      or pg_catalog.scale((v_input_line ->> 'line_total')::numeric) > 2
      or (v_input_line ->> 'line_total')::numeric <>
        pg_catalog.round(
          (v_input_line ->> 'ordered_quantity')::integer
          * (v_input_line ->> 'unit_purchase_price')::numeric,
          2
        ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
    end if;

    select line.*
    into v_existing_line
    from public.purchase_lines as line
    where line.id = v_line_id
    for update;

    if found then
      if v_existing_line.workspace_id <> p_workspace_id
        or v_existing_line.purchase_id <> p_purchase_id
        or v_existing_line.line_kind <> v_input_line ->> 'line_kind'
        or v_existing_line.ordered_quantity <> (v_input_line ->> 'ordered_quantity')::integer
        or v_existing_line.catalog_product_id is distinct from v_catalog_product_id then
        raise exception using
          errcode = '22023',
          message = 'Die Ersatz-Einkaufspositionen sind ungültig.';
      end if;

      update public.purchase_lines
      set is_package = coalesce((v_input_line ->> 'is_package')::boolean, is_package),
          title_snapshot = pg_catalog.btrim(v_input_line ->> 'title_snapshot'),
          ean_snapshot = case
            when v_input_line ? 'ean_snapshot'
              then nullif(pg_catalog.btrim(v_input_line ->> 'ean_snapshot'), '')
            else ean_snapshot
          end,
          price_mode = v_input_line ->> 'price_mode',
          unit_purchase_price = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') = 'null'
              then null
            else (v_input_line ->> 'unit_purchase_price')::numeric
          end,
          line_total = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'line_total') = 'null'
              then null
            else (v_input_line ->> 'line_total')::numeric
          end,
          condition_snapshot = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') = 'null'
              then null
            else v_input_line ->> 'condition_snapshot'
          end,
          estimated_market_value = case
            when pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') = 'null'
              then null
            else (v_input_line ->> 'estimated_market_value')::numeric
          end,
          updated_at = v_changed_at
      where workspace_id = p_workspace_id
        and id = v_line_id;
    else
      insert into public.purchase_lines (
        is_package,
        id,
        workspace_id,
        purchase_id,
        catalog_product_id,
        title_snapshot,
        ean_snapshot,
        line_kind,
        ordered_quantity,
        received_quantity,
        unit_purchase_price,
        line_total,
        price_mode,
        condition_snapshot,
        estimated_market_value,
        allocated_additional_cost,
        allocated_total_cost,
        created_at,
        updated_at
      ) values (
        coalesce((v_input_line ->> 'is_package')::boolean, false),
        v_line_id,
        p_workspace_id,
        p_purchase_id,
        v_catalog_product_id,
        pg_catalog.btrim(v_input_line ->> 'title_snapshot'),
        nullif(pg_catalog.btrim(v_input_line ->> 'ean_snapshot'), ''),
        v_input_line ->> 'line_kind',
        (v_input_line ->> 'ordered_quantity')::integer,
        0,
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'unit_purchase_price') = 'null'
            then null
          else (v_input_line ->> 'unit_purchase_price')::numeric
        end,
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'line_total') = 'null'
            then null
          else (v_input_line ->> 'line_total')::numeric
        end,
        v_input_line ->> 'price_mode',
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'condition_snapshot') = 'null'
            then null
          else v_input_line ->> 'condition_snapshot'
        end,
        case
          when pg_catalog.jsonb_typeof(v_input_line -> 'estimated_market_value') = 'null'
            then null
          else (v_input_line ->> 'estimated_market_value')::numeric
        end,
        0,
        0,
        v_changed_at,
        v_changed_at
      );
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.unnest(v_existing_line_ids) as existing_line(id)
    where not (existing_line.id = any(v_input_line_ids))
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bestehende Einkaufspositionen dürfen bei einer Korrektur nicht entfernt werden.';
  end if;

  for v_input_cost in
    select element.value
    from pg_catalog.jsonb_array_elements(p_costs) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_input_cost) <> 'object'
      or not (v_input_cost ?& array[
        'id', 'type', 'amount', 'description', 'allocation_method',
        'target_purchase_line_id'
      ])
      or v_input_cost - 'tax_treatment' - array[
        'id', 'type', 'amount', 'description', 'allocation_method',
        'target_purchase_line_id'
      ]::text[] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_input_cost -> 'id') <> 'string'
      or (v_input_cost ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_input_cost -> 'type') <> 'string'
      or nullif(pg_catalog.btrim(v_input_cost ->> 'type'), '') is null
      or pg_catalog.jsonb_typeof(v_input_cost -> 'amount') <> 'number'
      or (v_input_cost ->> 'amount')::numeric < 0
      or pg_catalog.scale((v_input_cost ->> 'amount')::numeric) > 2
      or pg_catalog.jsonb_typeof(v_input_cost -> 'description') not in ('null', 'string')
      or pg_catalog.jsonb_typeof(v_input_cost -> 'allocation_method') <> 'string'
      or v_input_cost ->> 'allocation_method' not in ('value_weighted', 'quantity', 'direct')
      or pg_catalog.jsonb_typeof(v_input_cost -> 'target_purchase_line_id') not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_input_cost -> 'target_purchase_line_id') = 'string'
        and (v_input_cost ->> 'target_purchase_line_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Zusatzkosten sind ungültig.';
    end if;

    v_cost_id := (v_input_cost ->> 'id')::uuid;
    if v_cost_id = any(v_input_cost_ids) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Zusatzkosten sind ungültig.';
    end if;
    v_input_cost_ids := pg_catalog.array_append(v_input_cost_ids, v_cost_id);

    v_target_line_id := case
      when pg_catalog.jsonb_typeof(v_input_cost -> 'target_purchase_line_id') = 'null'
        then null
      else (v_input_cost ->> 'target_purchase_line_id')::uuid
    end;

    if (
        v_input_cost ->> 'allocation_method' = 'direct'
        and (
          v_target_line_id is null
          or not (v_target_line_id = any(v_input_line_ids))
        )
      ) or (
        v_input_cost ->> 'allocation_method' <> 'direct'
        and v_target_line_id is not null
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die Ersatz-Zusatzkosten sind ungültig.';
    end if;

    select cost.*
    into v_existing_cost
    from public.purchase_costs as cost
    where cost.id = v_cost_id
    for update;

    if found then
      if v_existing_cost.workspace_id <> p_workspace_id
        or v_existing_cost.purchase_id <> p_purchase_id then
        raise exception using
          errcode = '22023',
          message = 'Die Ersatz-Zusatzkosten sind ungültig.';
      end if;

      update public.purchase_costs
      set type = pg_catalog.btrim(v_input_cost ->> 'type'),
          amount = (v_input_cost ->> 'amount')::numeric,
          description = case
            when pg_catalog.jsonb_typeof(v_input_cost -> 'description') = 'null'
              then null
            else nullif(pg_catalog.btrim(v_input_cost ->> 'description'), '')
          end,
          allocation_method = v_input_cost ->> 'allocation_method',
          target_purchase_line_id = v_target_line_id,
          tax_treatment = v_input_cost ->> 'tax_treatment'
      where workspace_id = p_workspace_id
        and id = v_cost_id;
    else
      insert into public.purchase_costs (
        id,
        workspace_id,
        purchase_id,
        type,
        amount,
        description,
        allocation_method,
        target_purchase_line_id,
        tax_treatment,
        created_at
      ) values (
        v_cost_id,
        p_workspace_id,
        p_purchase_id,
        pg_catalog.btrim(v_input_cost ->> 'type'),
        (v_input_cost ->> 'amount')::numeric,
        case
          when pg_catalog.jsonb_typeof(v_input_cost -> 'description') = 'null'
            then null
          else nullif(pg_catalog.btrim(v_input_cost ->> 'description'), '')
        end,
        v_input_cost ->> 'allocation_method',
        v_target_line_id,
        v_input_cost ->> 'tax_treatment',
        v_changed_at
      );
    end if;
  end loop;

  delete from public.purchase_costs
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
    and not (id = any(v_input_cost_ids));

  update public.purchases
  set purchase_price = case
        when coalesce(v_purchase.pricing_mode, case when v_purchase.type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then p_purchase_price
        else null
      end
  where workspace_id = p_workspace_id
    and id = p_purchase_id;

  v_costing_plan := public.build_purchase_costing_plan(
    p_workspace_id,
    p_purchase_id
  );
  v_goods_cents := (v_costing_plan ->> 'goodsCents')::bigint;
  v_total_cents := (v_costing_plan ->> 'totalCents')::bigint;
  v_allocated_cents := (v_costing_plan ->> 'allocatedCents')::bigint;

  for v_line_position in 1..pg_catalog.jsonb_array_length(v_costing_plan -> 'lines') loop
    v_line_plan := v_costing_plan -> 'lines' -> (v_line_position - 1);
    v_line_id := (v_line_plan ->> 'lineId')::uuid;

    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_id;

    select pg_catalog.array_agg(unit_share.value::bigint order by unit_share.ordinality)
    into v_unit_shares
    from pg_catalog.jsonb_array_elements_text(v_line_plan -> 'unitTotalCents')
      with ordinality as unit_share(value, ordinality);
    select pg_catalog.array_agg(pg_catalog.round(unit_share.value::numeric / 100, 2) order by unit_share.ordinality)
    into v_tax_unit_costs
    from pg_catalog.jsonb_array_elements_text(nullif(v_line_plan -> 'unitTaxPurchaseCents', 'null'::jsonb))
      with ordinality as unit_share(value, ordinality);

    if v_line.is_package then
      -- Der bezahlte Paketpreis bleibt an der Position, ohne verkäuflichen Platzhalter.
      null;
    elsif v_line.line_kind = 'individual' then
      select pg_catalog.array_agg(item.id order by item.created_at, item.id)
      into v_item_ids
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = p_purchase_id
        and item.purchase_line_id = v_line.id;

      v_existing_count := coalesce(pg_catalog.cardinality(v_item_ids), 0);
      if v_line.id = any(v_existing_line_ids)
        and v_existing_count <> v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Bestehende Einzelartikel passen nicht vollständig zur korrigierten Position.';
      end if;

      if not (v_line.id = any(v_existing_line_ids)) and v_existing_count <> 0 then
        raise exception using
          errcode = '22023',
          message = 'Neue Einkaufspositionen dürfen keinen fremden Bestand übernehmen.';
      end if;

      for v_item_position in 1..v_line.ordered_quantity loop
        if v_item_position <= v_existing_count then
          update public.inventory_items
          set allocated_purchase_cost = v_unit_shares[v_item_position]::numeric / 100,
              tax_purchase_cost = v_tax_unit_costs[v_item_position],
              ean = coalesce(v_line.ean_snapshot, ean),
              updated_at = v_changed_at
          where workspace_id = p_workspace_id
            and id = v_item_ids[v_item_position];
        else
          insert into public.inventory_items (
            workspace_id,
            purchase_id,
            purchase_line_id,
            title,
            ean,
            condition,
            status,
            allocated_purchase_cost,
            tax_purchase_cost,
            expected_value,
            created_at,
            updated_at
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            v_line.ean_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
            v_tax_unit_costs[v_item_position],
            v_line.estimated_market_value,
            v_changed_at,
            v_changed_at
          );
        end if;
      end loop;
    else
      select pg_catalog.array_agg(lot.id order by lot.received_at, lot.id)
      into v_lot_ids
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_id = p_purchase_id
        and lot.purchase_line_id = v_line.id;

      v_existing_count := coalesce(pg_catalog.cardinality(v_lot_ids), 0);
      if v_line.id = any(v_existing_line_ids) then
        if (
          select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
          from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_id = p_purchase_id
            and lot.purchase_line_id = v_line.id
        ) <> v_line.ordered_quantity then
          raise exception using
            errcode = '22023',
            message = 'Bestehende Bestandslose passen nicht vollständig zur korrigierten Position.';
        end if;

        v_unit_offset := 0;
        for v_lot in
          select lot.*
          from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_id = p_purchase_id
            and lot.purchase_line_id = v_line.id
          order by lot.received_at, lot.id
          for update
        loop
          select
            pg_catalog.array_agg(v_unit_shares[unit_position] order by unit_position),
            pg_catalog.sum(v_unit_shares[unit_position])
          into v_lot_unit_shares, v_lot_total_cents
          from pg_catalog.generate_series(
            v_unit_offset + 1,
            v_unit_offset + v_lot.received_quantity
          ) as unit_position;
          v_unit_offset := v_unit_offset + v_lot.received_quantity;

          update public.stock_lots
          set unit_cost = (
            v_lot_total_cents::numeric
            / v_lot.received_quantity
            / 100
          )
          where workspace_id = p_workspace_id
            and id = v_lot.id;

          if (
            select pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.id = v_lot.id
          ) <> v_lot_total_cents::numeric / 100 then
            raise exception using
              errcode = '22023',
              message = 'Die korrigierten Loskosten lassen sich nicht centgenau speichern.';
          end if;

          -- Historische COGS bleiben als vollständiger Snapshot erhalten. Für
          -- die aktive Kostenfolge zählen dagegen nur Einheiten, die nicht
          -- tatsächlich wieder in den Bestand gelangt sind. Eine vollständige
          -- Wiedereinlagerung verbraucht deshalb keinen Rundungscent dauerhaft.
          v_active_unit_offset := 0;
          for v_allocation in
            select allocation.*
            from public.sale_line_lot_allocations as allocation
            join public.sale_lines as allocated_sale_line
              on allocated_sale_line.workspace_id = allocation.workspace_id
              and allocated_sale_line.id = allocation.sale_line_id
            join public.sales as allocated_sale
              on allocated_sale.workspace_id = allocated_sale_line.workspace_id
              and allocated_sale.id = allocated_sale_line.sale_id
            where allocation.workspace_id = p_workspace_id
              and allocation.stock_lot_id = v_lot.id
            order by
              case when allocation.consumption_sequence is null then 0 else 1 end,
              case when allocation.consumption_sequence is null then allocated_sale.created_at end,
              case when allocation.consumption_sequence is null then allocation.created_at end,
              allocation.consumption_sequence
            for update of allocation
          loop
            if v_allocation.quantity > v_lot.received_quantity then
              raise exception using
                errcode = '22023',
                message = 'Eine historische Loszuordnung überschreitet die ursprüngliche Losmenge.';
            end if;

            select coalesce(pg_catalog.sum(
              case
                when movement.direction = 'in' and movement.reason = 'return'
                  then movement.quantity
                when movement.direction = 'out' and movement.reason = 'damage'
                  then -movement.quantity
                else 0
              end
            ), 0)::integer
            into v_restocked_quantity
            from public.stock_movements as movement
            where movement.workspace_id = v_allocation.workspace_id
              and movement.stock_lot_id = v_allocation.stock_lot_id
              and movement.sale_line_id = v_allocation.sale_line_id;

            if v_restocked_quantity < 0
              or v_restocked_quantity > v_allocation.quantity then
              raise exception using
                errcode = '22023',
                message = 'Die historische Retourenmenge des Lagerloses ist nicht konsistent.';
            end if;

            v_active_quantity := v_allocation.quantity - v_restocked_quantity;

            if v_active_unit_offset + v_active_quantity > v_lot.received_quantity then
              raise exception using
                errcode = '22023',
                message = 'Die aktive Losentnahmemenge überschreitet die ursprüngliche Losmenge.';
            end if;

            select pg_catalog.sum(
              v_lot_unit_shares[
                ((v_active_unit_offset + unit_position - 1) % v_lot.received_quantity) + 1
              ]
            )
            into v_allocation_cost_cents
            from pg_catalog.generate_series(1, v_allocation.quantity) as unit_position;

            if v_active_quantity = 0 then
              v_active_allocation_cost_cents := 0;
            else
              select pg_catalog.sum(
                v_lot_unit_shares[v_active_unit_offset + unit_position]
              )
              into v_active_allocation_cost_cents
              from pg_catalog.generate_series(1, v_active_quantity) as unit_position;
            end if;

            update public.sale_line_lot_allocations
            set unit_cost = (
                  v_allocation_cost_cents::numeric
                  / quantity
                  / 100
                ),
                allocated_cost = v_allocation_cost_cents::numeric / 100,
                active_allocated_cost = v_active_allocation_cost_cents::numeric / 100,
                active_tax_unit_costs = v_tax_unit_costs[(v_unit_offset - v_lot.received_quantity + v_active_unit_offset + 1):(v_unit_offset - v_lot.received_quantity + v_active_unit_offset + v_active_quantity)],
                active_unit_costs = (select coalesce(pg_catalog.array_agg(pg_catalog.round(value::numeric / 100, 2) order by ordinality), array[]::numeric[])
                  from pg_catalog.unnest(v_lot_unit_shares[(v_active_unit_offset + 1):(v_active_unit_offset + v_active_quantity)]) with ordinality as unit(value, ordinality))
            where workspace_id = p_workspace_id
              and id = v_allocation.id;

            v_active_unit_offset := v_active_unit_offset + v_active_quantity;
          end loop;

          update public.stock_lots
          set unit_tax_purchase_cost = (select pg_catalog.avg(value) from pg_catalog.unnest(v_tax_unit_costs[(v_unit_offset - v_lot.received_quantity + 1):v_unit_offset]) as value),
              remaining_tax_unit_costs = v_tax_unit_costs[(v_unit_offset - v_lot.remaining_quantity + 1):v_unit_offset],
              remaining_unit_costs = (select coalesce(pg_catalog.array_agg(pg_catalog.round(value::numeric / 100, 2) order by ordinality), array[]::numeric[])
                from pg_catalog.unnest(v_unit_shares[(v_unit_offset - v_lot.remaining_quantity + 1):v_unit_offset]) with ordinality as unit(value, ordinality))
          where workspace_id = p_workspace_id and id = v_lot.id;

          if v_active_unit_offset + v_lot.remaining_quantity <> v_lot.received_quantity then
            raise exception using
              errcode = '22023',
              message = 'Aktive Losentnahmen und aktueller Bestand sind nicht konsistent.';
          end if;
        end loop;
      else
        if v_existing_count <> 0 then
          raise exception using
            errcode = '22023',
            message = 'Neue Einkaufspositionen dürfen keinen fremden Bestand übernehmen.';
        end if;

        for v_cohort in
          select share.value as unit_cost_cents, v_tax_unit_costs[share.ordinality] as tax_unit_cost, pg_catalog.count(*)::integer as quantity
          from pg_catalog.unnest(v_unit_shares) with ordinality as share(value, ordinality)
          group by share.value, v_tax_unit_costs[share.ordinality]
          order by share.value desc
        loop
          insert into public.stock_lots (
            workspace_id,
            purchase_id,
            purchase_line_id,
            catalog_product_id,
            received_quantity,
            remaining_quantity,
            unit_cost,
            unit_tax_purchase_cost,
            remaining_tax_unit_costs,
            remaining_unit_costs,
            received_at,
            created_at
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.catalog_product_id,
            v_cohort.quantity,
            v_cohort.quantity,
            v_cohort.unit_cost_cents::numeric / 100,
            v_cohort.tax_unit_cost,
            case when v_cohort.tax_unit_cost is null then null else pg_catalog.array_fill(v_cohort.tax_unit_cost, array[v_cohort.quantity]) end,
            pg_catalog.array_fill(pg_catalog.round(v_cohort.unit_cost_cents::numeric / 100, 2), array[v_cohort.quantity]),
            v_changed_at,
            v_changed_at
          ) returning id into v_stock_lot_id;

          insert into public.stock_movements (
            workspace_id,
            stock_lot_id,
            direction,
            quantity,
            reason,
            created_at
          ) values (
            p_workspace_id,
            v_stock_lot_id,
            'in',
            v_cohort.quantity,
            'receipt',
            v_changed_at
          );
        end loop;
      end if;
    end if;

    update public.purchase_lines
    set allocated_additional_cost = (v_line_plan ->> 'additionalCents')::bigint::numeric / 100,
        allocated_total_cost = (v_line_plan ->> 'totalCents')::bigint::numeric / 100,
        received_quantity = ordered_quantity,
        updated_at = v_changed_at
    where workspace_id = p_workspace_id
      and id = v_line.id;
  end loop;

  update public.sale_lines as sale_line
  set cost_of_goods_sold = case
        when sale_line.inventory_item_id is not null then (
          select item.allocated_purchase_cost + coalesce((
            select pg_catalog.sum(cost.amount) from public.item_costs as cost
            where cost.inventory_item_id = item.id
          ), 0)
          from public.inventory_items as item
          where item.workspace_id = sale_line.workspace_id
            and item.id = sale_line.inventory_item_id
        )
        else (
          select coalesce(pg_catalog.sum(allocation.allocated_cost), 0)
          from public.sale_line_lot_allocations as allocation
          where allocation.workspace_id = sale_line.workspace_id
            and allocation.sale_line_id = sale_line.id
        )
      end
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids);

  update public.purchases
  set purchase_price = pg_catalog.round(v_goods_cents::numeric / 100, 2),
      total_purchase_cost = v_total_cents::numeric / 100,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  v_after_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'title_snapshot', line.title_snapshot,
    'line_kind', line.line_kind,
    'ordered_quantity', line.ordered_quantity,
    'price_mode', line.price_mode,
    'unit_purchase_price', line.unit_purchase_price,
    'line_total', line.line_total,
    'condition_snapshot', line.condition_snapshot,
    'estimated_market_value', line.estimated_market_value,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_after_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', cost.id,
    'type', cost.type,
    'amount', cost.amount,
    'tax_treatment', cost.tax_treatment,
    'description', cost.description,
    'allocation_method', cost.allocation_method,
    'target_purchase_line_id', cost.target_purchase_line_id
  ) order by cost.created_at, cost.id), '[]'::jsonb)
  into v_after_costs
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'purchase_line_id', item.purchase_line_id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_after_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'purchase_line_id', lot.purchase_line_id,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_after_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', sale_line.id,
    'sale_id', sale_line.sale_id,
    'cost_of_goods_sold', sale_line.cost_of_goods_sold
  ) order by sale_line.created_at, sale_line.id), '[]'::jsonb),
    case when pg_catalog.count(*) filter (where sale_line.cost_of_goods_sold is null) > 0 then null else coalesce(pg_catalog.sum(sale_line.cost_of_goods_sold), 0) end
  into v_after_sale_lines, v_after_cogs
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.id = any(v_sale_line_ids);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', allocation.id,
    'sale_line_id', allocation.sale_line_id,
    'stock_lot_id', allocation.stock_lot_id,
    'quantity', allocation.quantity,
    'unit_cost', allocation.unit_cost,
    'allocated_cost', allocation.allocated_cost,
    'tax_purchase_cost', allocation.tax_purchase_cost,
    'tax_cost_allocations', allocation.tax_cost_allocations,
    'active_tax_unit_costs', allocation.active_tax_unit_costs,
    'active_unit_costs', allocation.active_unit_costs,
    'active_allocated_cost', allocation.active_allocated_cost,
    'consumption_sequence', allocation.consumption_sequence
  ) order by allocation.created_at, allocation.id), '[]'::jsonb)
  into v_after_allocations
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  where allocation.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    reason,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_corrected',
    v_actor_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object(
        'before', v_before_purchase,
        'after', v_after_purchase
      ),
      'lines', pg_catalog.jsonb_build_object(
        'before', v_before_lines,
        'after', v_after_lines
      ),
      'costs', pg_catalog.jsonb_build_object(
        'before', v_before_costs,
        'after', v_after_costs
      ),
      'inventory_items', pg_catalog.jsonb_build_object(
        'before', v_before_items,
        'after', v_after_items
      ),
      'stock_lots', pg_catalog.jsonb_build_object(
        'before', v_before_lots,
        'after', v_after_lots
      ),
      'sale_lines', pg_catalog.jsonb_build_object(
        'before', v_before_sale_lines,
        'after', v_after_sale_lines
      ),
      'lot_allocations', pg_catalog.jsonb_build_object(
        'before', v_before_allocations,
        'after', v_after_allocations
      ),
      'downstream_cogs', pg_catalog.jsonb_build_object(
        'before', v_before_cogs,
        'after', v_after_cogs
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'purchaseId', p_purchase_id,
    'totalPurchaseCost', v_total_cents::numeric / 100,
    'allocatedTotalCost', v_allocated_cents::numeric / 100,
    'entryStatus', 'finalized',
    'eventId', v_event_id
  );
end;
$function$;

create or replace function public.create_or_get_invoice (
  p_workspace_id   uuid,
  p_sale_id        uuid,
  p_store_order_id uuid,
  p_invoice        jsonb,
  p_items          jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_invoice public.invoices;
  v_created boolean := false;
  v_items jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if (p_sale_id is null) = (p_store_order_id is null) then
    raise exception using errcode = '22023', message = 'Genau eine Rechnungsquelle ist erforderlich.';
  end if;

  -- Wiederholungen derselben Quelle vor der Prüfung heutiger Unternehmensdaten serialisieren.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_workspace_id::text || coalesce(p_sale_id::text, p_store_order_id::text), 0));
  select * into v_invoice from public.invoices
    where workspace_id = p_workspace_id
      and ((p_sale_id is not null and sale_id = p_sale_id)
        or (p_store_order_id is not null and store_order_id = p_store_order_id));
  if found then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
      into v_items from public.invoice_items as item where item.invoice_id = v_invoice.id;
    return jsonb_build_object('invoice', to_jsonb(v_invoice), 'items', v_items, 'created', false);
  end if;
  if coalesce(jsonb_typeof(p_invoice), 'null') <> 'object'
    or nullif(btrim(p_invoice ->> 'invoice_number'), '') is null
    or nullif(btrim(p_invoice ->> 'order_number'), '') is null
    or nullif(p_invoice ->> 'invoice_date', '') is null
    or nullif(p_invoice ->> 'delivery_date', '') is null
    or coalesce((p_invoice ->> 'subtotal')::numeric, -1) < 0
    or coalesce((p_invoice ->> 'shipping_cost')::numeric, 0) < 0
    or coalesce((p_invoice ->> 'total')::numeric, -1) < 0 then
    raise exception using errcode = '22023', message = 'Die Rechnungsdaten sind ungültig.';
  end if;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) = 0
    or exists (
      select 1
      from jsonb_array_elements(p_items) as item(value)
      where nullif(btrim(item.value ->> 'title'), '') is null
        or coalesce((item.value ->> 'quantity')::integer, 0) < 1
        or coalesce((item.value ->> 'unit_price')::numeric, -1) < 0
        or coalesce((item.value ->> 'total_price')::numeric, -1) < 0
    ) then
    raise exception using errcode = '22023', message = 'Mindestens eine Rechnungsposition ist ungültig.';
  end if;

  if p_sale_id is not null and not exists (
    select 1 from public.sales
    where id = p_sale_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  if p_store_order_id is not null and not exists (
    select 1 from public.store_orders
    where id = p_store_order_id and workspace_id = p_workspace_id
  ) then
    raise no_data_found using message = 'Die Shop-Bestellung wurde nicht gefunden.';
  end if;

  insert into public.invoices (
    workspace_id, invoice_number, order_number, invoice_date, delivery_date,
    seller, buyer, subtotal, shipping_cost, total, tax_mode, tax_clause,
    payment_method, payment_status, payment_due_date, notes, sale_id, store_order_id
  ) values (
    p_workspace_id,
    p_invoice ->> 'invoice_number',
    p_invoice ->> 'order_number',
    (p_invoice ->> 'invoice_date')::date,
    (p_invoice ->> 'delivery_date')::date,
    coalesce(p_invoice -> 'seller', '{}'::jsonb),
    coalesce(p_invoice -> 'buyer', '{}'::jsonb),
    coalesce((p_invoice ->> 'subtotal')::numeric, 0),
    coalesce((p_invoice ->> 'shipping_cost')::numeric, 0),
    coalesce((p_invoice ->> 'total')::numeric, 0),
    coalesce(p_invoice ->> 'tax_mode', 'diff_25a'),
    p_invoice ->> 'tax_clause',
    p_invoice ->> 'payment_method',
    coalesce(p_invoice ->> 'payment_status', 'paid'),
    nullif(p_invoice ->> 'payment_due_date', '')::date,
    p_invoice ->> 'notes',
    p_sale_id,
    p_store_order_id
  )
  on conflict do nothing
  returning * into v_invoice;

  if found then
    v_created := true;
    insert into public.invoice_items (
      invoice_id, sku, title, condition, quantity, unit_price, total_price
    )
    select
      v_invoice.id,
      nullif(item.value ->> 'sku', ''),
      item.value ->> 'title',
      nullif(item.value ->> 'condition', ''),
      (item.value ->> 'quantity')::integer,
      (item.value ->> 'unit_price')::numeric,
      (item.value ->> 'total_price')::numeric
    from jsonb_array_elements(p_items) as item(value);
  else
    select * into v_invoice
    from public.invoices
    where workspace_id = p_workspace_id
      and ((p_sale_id is not null and sale_id = p_sale_id)
        or (p_store_order_id is not null and store_order_id = p_store_order_id));
    if not found then
      raise no_data_found using message = 'Die Rechnung konnte nicht gelesen werden.';
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
  into v_items
  from public.invoice_items as item
  where item.invoice_id = v_invoice.id;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'items', v_items,
    'created', v_created
  );
end;
$function$;

create or replace function public.create_purchase (
  p_workspace_id uuid,
  p_purchase     jsonb,
  p_expenses     jsonb default '[]'::jsonb,
  p_lines        jsonb default '[]'::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_expense jsonb;
  v_line jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_refs jsonb := '{}'::jsonb;
  v_line_ref text;
  v_target_line_id uuid;
  v_source_id uuid;
  v_supplier_id uuid;
  v_purchase_type text;
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_mode text;
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_audit_after jsonb;
  v_catalog_product_id uuid;
  v_seller_details jsonb := public.normalize_purchase_seller_details(p_purchase);
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or jsonb_typeof(p_purchase) <> 'object'
    or jsonb_typeof(p_expenses) <> 'array'
    or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if nullif(p_purchase ->> 'request_id', '') is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || (p_purchase ->> 'request_id'), 0));
    select * into v_purchase from public.purchases
    where workspace_id = p_workspace_id and request_id = (p_purchase ->> 'request_id')::uuid;
    if found then
      return jsonb_build_object(
        'purchase', to_jsonb(v_purchase),
        'purchase_lines', coalesce((select jsonb_agg(line order by line.created_at, line.id) from public.purchase_lines line where line.purchase_id = v_purchase.id), '[]'::jsonb),
        'purchase_costs', coalesce((select jsonb_agg(cost) from public.purchase_costs cost where cost.purchase_id = v_purchase.id), '[]'::jsonb)
      );
    end if;
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null')
      not in ('null', 'number')
    or (
      pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price') = 'number'
      and (
        (p_purchase ->> 'purchase_price')::numeric < 0
        or pg_catalog.scale((p_purchase ->> 'purchase_price')::numeric) > 2
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Kaufpreis muss centgenau und darf nicht negativ sein.';
  end if;

  for v_expense in
    select element.value
    from pg_catalog.jsonb_array_elements(p_expenses) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_expense) <> 'object'
      or pg_catalog.jsonb_typeof(v_expense -> 'amount') <> 'number'
      or (v_expense ->> 'amount')::numeric <= 0
      or pg_catalog.scale((v_expense ->> 'amount')::numeric) > 2 then
      raise exception using
        errcode = '22023',
        message = 'Zusatzkosten müssen positive centgenaue Zahlen sein.';
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Kostenverteilung ist ungültig.';
  end if;

  v_purchase_type := nullif(p_purchase ->> 'type', '');
  if v_purchase_type not in ('single', 'mystery_pack', 'lot', 'pallet') then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'source_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '') is not null
      and (p_purchase ->> 'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;
  v_source_id := nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '')::uuid;
  if v_source_id is not null and not exists (
    select 1
    from public.sources as source
    where source.workspace_id = p_workspace_id
      and source.id = v_source_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;
  v_supplier_id := nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '')::uuid;
  if v_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.workspace_id = p_workspace_id
      and supplier.id = v_supplier_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;

  -- Validate the purchase-type contract before the purchase header is written.
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
    v_catalog_product_id := case
      when coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null') = 'null'
        then null
      else (v_line ->> 'catalog_product_id')::uuid
    end;
    if (v_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    if v_line ? 'condition_snapshot'
      and coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') <> 'null'
      and (
        pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot') <> 'string'
        or v_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Der Zustand einer Einkaufsposition ist ungültig.';
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value') = 'number'
        and (
          (v_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Der geschätzte Marktwert muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost') = 'number'
        and (
          (v_line ->> 'allocated_additional_cost')::numeric < 0
          or pg_catalog.scale((v_line ->> 'allocated_additional_cost')::numeric) > 2
        )
      ) then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(p_purchase ->> 'pricing_mode', case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'unpriced_mystery'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') <> 'null'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
      end if;
    elsif not (
      (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'open'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
      )
      or (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'priced'
        and pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') = 'number'
        and pg_catalog.jsonb_typeof(v_line -> 'line_total') = 'number'
        and (v_line ->> 'unit_purchase_price')::numeric >= 0
        and (v_line ->> 'line_total')::numeric >= 0
        and pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) <= 16
        and pg_catalog.scale((v_line ->> 'line_total')::numeric) <= 2
        and (v_line ->> 'line_total')::numeric = pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
    end if;
  end loop;

  if coalesce(
    p_purchase ->> 'pricing_mode',
    case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end
  ) = 'individual'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_lines) as line(value)
      where coalesce(nullif(line.value ->> 'price_mode', ''), 'priced') = 'open'
    )
    and coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null') <> 'null' then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf mit offenen Positionspreisen darf keinen Warenbetrag enthalten.';
  end if;

  insert into public.purchases (
    workspace_id, source_id, supplier_id, type, title, purchase_date,
    purchase_price, cost_allocation_mode, notes, tracking_number,
    tracking_carrier, tracking_status, receiving_status,
    content_status, pricing_mode, supplier_reference, request_id, discount_amount,
    seller_type, seller_name, seller_street, seller_address_extra,
    seller_postal_code, seller_city, seller_country_code, receipt_mode
  ) values (
    p_workspace_id,
    v_source_id,
    v_supplier_id,
    v_purchase_type,
    coalesce(btrim(p_purchase ->> 'title'), ''),
    (p_purchase ->> 'purchase_date')::date,
    (p_purchase ->> 'purchase_price')::numeric,
    v_mode,
    nullif(btrim(p_purchase ->> 'notes'), ''),
    nullif(btrim(p_purchase ->> 'tracking_number'), ''),
    nullif(p_purchase ->> 'tracking_carrier', ''),
    coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
    'draft',
    coalesce(p_purchase ->> 'content_status', 'known'),
    p_purchase ->> 'pricing_mode',
    nullif(btrim(p_purchase ->> 'supplier_reference'), ''),
    nullif(p_purchase ->> 'request_id', '')::uuid,
    coalesce((p_purchase ->> 'discount_amount')::numeric, 0),
    v_seller_details ->> 'seller_type',
    v_seller_details ->> 'seller_name',
    v_seller_details ->> 'seller_street',
    v_seller_details ->> 'seller_address_extra',
    v_seller_details ->> 'seller_postal_code',
    v_seller_details ->> 'seller_city',
    v_seller_details ->> 'seller_country_code',
    coalesce(nullif(p_purchase ->> 'receipt_mode', ''), 'external')
  ) returning * into v_purchase;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_ref := nullif(pg_catalog.btrim(v_line ->> 'client_ref'), '');
    if v_line_ref is not null and v_line_refs ? v_line_ref then
      raise exception using errcode = '22023', message = 'Einkaufspositionen benötigen eindeutige Entwurfskennungen.';
    end if;

    insert into public.purchase_lines (
      is_package,
      workspace_id, purchase_id, catalog_product_id, title_snapshot,
      ean_snapshot,
      line_kind, ordered_quantity, received_quantity, unit_purchase_price,
      line_total, allocated_additional_cost, price_mode, condition_snapshot,
      estimated_market_value
    ) values (
      coalesce((v_line ->> 'is_package')::boolean, false),
      p_workspace_id,
      v_purchase.id,
      nullif(v_line ->> 'catalog_product_id', '')::uuid,
      btrim(v_line ->> 'title_snapshot'),
      nullif(btrim(v_line ->> 'ean_snapshot'), ''),
      v_line ->> 'line_kind',
      (v_line ->> 'ordered_quantity')::integer,
      0,
      (v_line ->> 'unit_purchase_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      case when v_mode = 'manual'
        then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
        else 0
      end,
      coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
      nullif(v_line ->> 'condition_snapshot', ''),
      (v_line ->> 'estimated_market_value')::numeric
    ) returning id into v_line_id;
    v_line_ids := array_append(v_line_ids, v_line_id);
    if v_line_ref is not null then
      v_line_refs := pg_catalog.jsonb_set(
        v_line_refs,
        array[v_line_ref],
        pg_catalog.to_jsonb(v_line_id::text),
        true
      );
    end if;
  end loop;

  for v_expense in select value from jsonb_array_elements(p_expenses) loop
    if coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted') = 'direct' then
      v_line_ref := nullif(pg_catalog.btrim(v_expense ->> 'target_purchase_line_ref'), '');
      if v_line_ref is null or not (v_line_refs ? v_line_ref) then
        raise exception using errcode = '22023', message = 'Die direkte Kostenzuordnung verweist auf keine Einkaufsposition.';
      end if;
      v_target_line_id := (v_line_refs ->> v_line_ref)::uuid;
    else
      v_target_line_id := null;
    end if;

    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, description,
      allocation_method, target_purchase_line_id, tax_treatment
    ) values (
      p_workspace_id,
      v_purchase.id,
      coalesce(nullif(btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id,
      v_expense ->> 'tax_treatment'
    );
  end loop;

  select coalesce(round(sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.purchase_id = v_purchase.id;

  if cardinality(v_line_ids) = 0 or v_purchase.content_status = 'unknown' then
    null;
  elsif v_mode = 'manual' then
    select coalesce(round(sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using errcode = '22023', message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  elsif v_total_expense_cents > 0 then
    with weights as (
      select
        line.id,
        ids.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
      cross join (
        select sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.id = any(v_line_ids)
      ) as totals
    ), shares as (
      select
        weights.*,
        v_total_expense_cents::numeric * weight / nullif(sum(weight) over (), 0) as exact_cents
      from weights
    ), ranked as (
      select
        shares.*,
        floor(exact_cents)::bigint as floor_cents,
        row_number() over (order by exact_cents - floor(exact_cents) desc, ordinality) as remainder_rank,
        v_total_expense_cents - sum(floor(exact_cents)::bigint) over () as remainder_cents
      from shares
    )
    update public.purchase_lines as line
    set allocated_additional_cost = (
      ranked.floor_cents + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
    )::numeric / 100
    from ranked
    where line.id = ranked.id;
  end if;

  v_audit_after := public.purchase_draft_audit_snapshot(p_workspace_id, v_purchase.id);
  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    p_workspace_id, 'purchase', v_purchase.id, 'purchase_draft_created', (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'purchase'),
      'lines', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'lines'),
      'costs', pg_catalog.jsonb_build_object('before', null, 'after', v_audit_after -> 'costs')
    )
  );

  return jsonb_build_object(
    'purchase', to_jsonb(v_purchase),
    'purchase_costs', coalesce((
      select jsonb_agg(to_jsonb(cost) order by cost.created_at, cost.id)
      from public.purchase_costs as cost where cost.purchase_id = v_purchase.id
    ), '[]'::jsonb),
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(line) order by ids.ordinality)
      from unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.create_sniper_subscription (
  p_workspace_id uuid,
  p_search_text  text,
  p_brand_id     integer,
  p_price_from   numeric,
  p_price_to     numeric,
  p_threshold    numeric default 40
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_search_text text;
  v_query_key text;
  v_query_id uuid;
  v_subscription_id uuid;
begin
  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Kein Mitglied dieses Arbeitsbereichs';
  end if;

  v_search_text := lower(btrim(regexp_replace(p_search_text, '\s+', ' ', 'g')));

  if v_search_text is null or v_search_text = '' then
    raise exception 'Der Suchbegriff darf nicht leer sein';
  end if;

  -- Auf zwei Nachkommastellen runden, bevor der Schluessel gebildet wird: die
  -- Spalten sind numeric(12,2), die Parameter aber unbeschraenkt. 50.567 und
  -- 50.566 speichern beide 50.57 - ohne diese Rundung vor der Schluesselbildung
  -- erzeugen sie zwei Abfragezeilen und damit zwei Vinted-Anfragen fuer
  -- denselben gespeicherten Filter.
  p_price_from := round(p_price_from, 2);
  p_price_to := round(p_price_to, 2);

  if p_price_from is not null and p_price_to is not null and p_price_from > p_price_to then
    raise exception 'Die Preisuntergrenze darf nicht ueber der Preisobergrenze liegen';
  end if;

  -- trim_scale streicht nachlaufende Nullen: 50.00 und 50 muessen denselben
  -- Schluessel ergeben, sonst legt derselbe Filter zwei Abfragen an und wird
  -- zweimal gepollt - genau der Sparmechanismus, um den es hier geht.
  v_query_key := concat_ws('|',
    'vinted',
    'search=' || v_search_text,
    'catalog=-',
    'brand=' || coalesce(p_brand_id::text, '-'),
    'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'),
    'price_to=' || coalesce(trim_scale(p_price_to)::text, '-')
  );

  -- Eine stillgelegte Abfrage (drei Fehlschlaege in Folge, is_active = false)
  -- kommt ohne diesen Zweig nie zurueck - do nothing liesse sie stillgelegt.
  -- Wer den Filter neu anlegt, will ihn offensichtlich wieder laufen sehen.
  insert into public.sniper_queries (query_key, search_text, brand_id, price_from, price_to)
  values (v_query_key, v_search_text, p_brand_id, p_price_from, p_price_to)
  on conflict (query_key) do update
    set is_active = true,
        consecutive_failures = 0;

  select id into v_query_id from public.sniper_queries where query_key = v_query_key;

  -- 30 Prozent ist ein Startwert, kein Naturgesetz: do update uebernimmt die
  -- neue Schwelle und setzt das Abonnement wieder aktiv. Ohne diesen Zweig
  -- gaebe es keinen Weg, eine einmal gesetzte Schwelle je zu aendern -
  -- authenticated hat kein UPDATE-Recht auf der Tabelle.
  insert into public.sniper_query_subscriptions
    (workspace_id, query_id, discount_threshold_percent)
  values (p_workspace_id, v_query_id, p_threshold)
  on conflict (workspace_id, query_id) do update
    set discount_threshold_percent = excluded.discount_threshold_percent,
        is_active = true;

  select id into v_subscription_id
  from public.sniper_query_subscriptions
  where workspace_id = p_workspace_id and query_id = v_query_id;

  return v_subscription_id;
end;
$function$;

create or replace function public.create_workspace (
  p_name text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  new_ws_id uuid;
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  if exists(select 1 from public.beta_applications where auth_user_id=caller_id and status='accepted')
    and not exists(select 1 from public.workspace_members where user_id=caller_id and public.workspace_access_is_valid(workspace_id)) then
    raise exception 'Dein Beta-Zugang ist abgelaufen oder noch nicht registriert' using errcode='42501'; end if;
  if not public.is_platform_operator()
    and exists(select 1 from public.beta_applications where auth_user_id=caller_id and status='accepted')
    and not exists(select 1 from public.workspace_members as member
      left join public.workspace_licenses as license on license.workspace_id=member.workspace_id
      where member.user_id=caller_id and public.workspace_access_is_valid(member.workspace_id)
      and (license.workspace_id is null or license.access_source<>'beta')) then
    raise exception 'Während der Beta kannst Du keinen weiteren Workspace erstellen' using errcode='42501'; end if;
  insert into public.workspaces (name, setup_completed_at)
  values (coalesce(nullif(trim(p_name), ''), 'Mein Workspace'), now())
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, caller_id, 'owner');

  insert into public.workspace_company_profiles(workspace_id)
  values (new_ws_id);

  return new_ws_id;
end;
$function$;

create or replace function public.delete_purchase_draft (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_audit_before jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_purchase_id is null then
    raise exception using errcode = '22023', message = 'Der Einkauf ist ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.* into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status <> 'draft' then
    raise exception using errcode = '22023',
      message = 'Nur ein Einkaufsentwurf kann gelöscht werden.';
  end if;

  if exists (
    select 1 from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and line.received_quantity > 0
  ) or exists (
    select 1 from public.inventory_items as item
    where item.workspace_id = p_workspace_id and item.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id and lot.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.purchase_receipt_requests as request
    where request.workspace_id = p_workspace_id and request.purchase_id = p_purchase_id
  ) or exists (
    select 1 from public.purchase_package_capture_requests as request
    join public.purchase_lines as line
      on line.workspace_id = request.workspace_id and line.id = request.purchase_line_id
    where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Ein Einkauf mit erfasstem Bestand kann nicht gelöscht werden.';
  end if;

  if exists (
    select 1 from public.purchase_documents as document
    where document.workspace_id = p_workspace_id and document.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Bitte entferne zuerst die Belege dieses Einkaufs.';
  end if;

  if exists (
    select 1 from public.record_comments as comment
    where comment.workspace_id = p_workspace_id and comment.purchase_id = p_purchase_id
  ) then
    raise exception using errcode = '22023',
      message = 'Ein Einkauf mit Kommentaren kann nicht gelöscht werden.';
  end if;

  v_audit_before := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);

  delete from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id and cost.purchase_id = p_purchase_id;

  delete from public.purchase_lines as line
  where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id;

  delete from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id and purchase.id = p_purchase_id;

  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    p_workspace_id, 'purchase', p_purchase_id, 'purchase_draft_deleted', (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object('before', v_audit_before -> 'purchase', 'after', null),
      'lines', pg_catalog.jsonb_build_object('before', v_audit_before -> 'lines', 'after', null),
      'costs', pg_catalog.jsonb_build_object('before', v_audit_before -> 'costs', 'after', null)
    )
  );
end;
$function$;

create or replace function public.delete_sniper_watchlist (
  p_workspace_id uuid,
  p_id           uuid
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    delete from public.sniper_watchlists where id = p_id and workspace_id = p_workspace_id;
    if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
end;
$function$;

create or replace function public.delete_unused_article (
  p_workspace_id uuid,
  p_article_kind text,
  p_article_id   uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor uuid := (select auth.uid());
  v_title text;
  v_queued integer := 0;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor is null or p_workspace_id is null or p_article_id is null then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_article_kind not in ('catalog', 'item') or p_article_kind is null then
    raise exception using errcode = '22023', message = 'Unbekannte Artikelart.';
  end if;
  perform 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then
    raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.';
  end if;

  if p_article_kind = 'catalog' then
    select title into v_title from public.catalog_products
      where workspace_id = p_workspace_id and id = p_article_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
    end if;
    if exists (select 1 from public.purchase_lines where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
       or exists (select 1 from public.catalog_products where workspace_id = p_workspace_id and id = p_article_id and is_public_store)
       or exists (select 1 from public.stock_lots where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
       or exists (select 1 from public.sale_lines where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
       or exists (select 1 from public.store_order_items oi join public.store_orders o on o.id = oi.store_order_id
         where o.workspace_id = p_workspace_id and oi.catalog_product_id = p_article_id)
       or exists (select 1 from public.listings where workspace_id = p_workspace_id and catalog_product_id = p_article_id)
    then
      raise exception using errcode = '23503', message = 'Der Artikel wird bereits verwendet und kann nur archiviert werden.';
    end if;
    insert into public.article_media_cleanup_jobs(workspace_id, article_kind, article_id, storage_path)
      select p_workspace_id, 'catalog', p_article_id, storage_path
      from public.catalog_product_media where workspace_id = p_workspace_id and catalog_product_id = p_article_id;
    get diagnostics v_queued = row_count;
    delete from public.catalog_product_media where workspace_id = p_workspace_id and catalog_product_id = p_article_id;
    delete from public.catalog_products where workspace_id = p_workspace_id and id = p_article_id;
  else
    select title into v_title from public.inventory_items
      where workspace_id = p_workspace_id and id = p_article_id for update;
    if not found then
      raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
    end if;
    if exists (select 1 from public.inventory_items where workspace_id = p_workspace_id and id = p_article_id
      and (purchase_id is not null or purchase_line_id is not null or source_package_line_id is not null
        or status in ('reserved', 'sold') or is_public_store))
       or exists (select 1 from public.item_costs where inventory_item_id = p_article_id)
       or exists (select 1 from public.sales where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.sale_lines where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.returns where inventory_item_id = p_article_id)
       or exists (select 1 from public.inventory_reconciliation_events where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.store_order_items oi join public.store_orders o on o.id = oi.store_order_id
         where o.workspace_id = p_workspace_id and oi.inventory_item_id = p_article_id)
       or exists (select 1 from public.listings where workspace_id = p_workspace_id and inventory_item_id = p_article_id)
       or exists (select 1 from public.activity_logs where inventory_item_id = p_article_id)
       or exists (select 1 from public.market_research where inventory_item_id = p_article_id)
       or exists (select 1 from public.price_tracked_items where inventory_item_id = p_article_id)
    then
      raise exception using errcode = '23503', message = 'Der Artikel wird bereits verwendet und kann nur archiviert werden.';
    end if;
    insert into public.article_media_cleanup_jobs(workspace_id, article_kind, article_id, storage_path)
      select p_workspace_id, 'item', p_article_id, storage_path
      from public.item_media where inventory_item_id = p_article_id;
    get diagnostics v_queued = row_count;
    delete from public.item_media where inventory_item_id = p_article_id;
    delete from public.inventory_items where workspace_id = p_workspace_id and id = p_article_id;
  end if;

  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, changes)
    values (p_workspace_id, case when p_article_kind = 'catalog' then 'catalog_product' else 'inventory_item' end,
      p_article_id, 'article_deleted', v_actor, jsonb_build_object('title', v_title, 'queued_media', v_queued));
  return jsonb_build_object('deleted', true, 'queued_media', v_queued);
end;
$function$;

create or replace function public.ebay_can_connect (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select (select auth.uid()) is not null
    and public.can_access_workspace(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$function$;

create or replace function public.ebay_lock_import_connection (
  p_user_id       uuid,
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns public.ebay_connections
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.ebay_connections;
begin
  if not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
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
$function$;

create or replace function public.end_listing (
  p_workspace_id uuid,
  p_listing_id   uuid
)
  returns public.listings
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_listing public.listings;
  v_item public.inventory_items;
  v_product public.catalog_products;
  v_archived_at timestamptz;
  v_inventory_item_id uuid;
  v_catalog_product_id uuid;
begin
  if not (select public.can_access_workspace(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select inventory_item_id, catalog_product_id into v_inventory_item_id, v_catalog_product_id
    from public.listings where id = p_listing_id and workspace_id = p_workspace_id;
  if v_inventory_item_id is null and v_catalog_product_id is null then
    raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.';
  end if;

  if v_inventory_item_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_inventory_item_id::text || ':kleinanzeigen', 0));
    select * into v_item from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status = 'ended' then raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.'; end if;
    if v_item.status = 'listed' then update public.inventory_items set status = 'ready' where id = v_item.id; end if;
    update public.listings set status = 'ended', end_reason = 'manual', ended_at = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_catalog_product_id::text || ':kleinanzeigen', 0));
    select * into v_product from public.catalog_products where id = v_catalog_product_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status = 'ended' then raise exception using errcode = '22023', message = 'Dieses Inserat kann nicht beendet werden.'; end if;
    update public.listings set status = 'ended', end_reason = 'manual', ended_at = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  end if;
end;
$function$;

create or replace function public.export_audit_snapshot (
  p_workspace_id uuid,
  p_filter       jsonb default '{}'::jsonb
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_table text;
  v_rows jsonb;
  v_count bigint;
  v_total bigint := 0;
  v_result jsonb := jsonb_build_object(
    'captured_at', statement_timestamp(),
    'snapshot', pg_current_snapshot()::text
  );
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null or not exists (
    select 1 from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = v_actor_id
      and member.role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für das Prüfarchiv.';
  end if;
  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception using errcode = '22023', message = 'Der Archivfilter muss ein JSON-Objekt sein.';
  end if;

  -- STABLE hält auch diese einzelnen SELECTs im Snapshot des RPC-Aufrufs.
  -- Die Tabellenliste ist geschlossen; keine Bezeichner aus Client-Eingaben.
  for v_table in
    select table_name
    from (values
      ('workspace_company_profiles'::text),
      ('suppliers'::text),
      ('catalog_products'::text),
      ('purchases'::text),
      ('purchase_lines'::text),
      ('purchase_costs'::text),
      ('inventory_items'::text),
      ('stock_lots'::text),
      ('stock_movements'::text),
      ('sales'::text),
      ('sale_lines'::text),
      ('sale_cost_entries'::text),
      ('sale_line_lot_allocations'::text),
      ('returns'::text),
      ('inventory_reconciliation_events'::text),
      ('invoices'::text),
      ('invoice_items'::text),
      ('item_costs'::text),
      ('purchase_documents'::text),
      ('expense_categories'::text),
      ('expense_recurring_rules'::text),
      ('expenses'::text),
      ('expense_documents'::text),
      ('business_events'::text)
    ) as audit_tables(table_name)
  loop
    if v_table = 'item_costs' then
      select count(*) into v_count from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select count(*) into v_count from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    else
      execute format('select count(*) from public.%I where workspace_id = $1', v_table)
        into v_count using p_workspace_id;
    end if;
    v_total := v_total + v_count;
    if v_total > 100000 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 100000 Datensätze. Es wurde kein Teilarchiv erstellt.';
    end if;

    if v_table = 'workspace_company_profiles' then
      select coalesce(jsonb_agg(to_jsonb(profile) order by profile.workspace_id), '[]'::jsonb)
        into v_rows from public.workspace_company_profiles as profile
        where profile.workspace_id = p_workspace_id;
    elsif v_table = 'item_costs' then
      select coalesce(jsonb_agg(to_jsonb(cost) order by cost.id), '[]'::jsonb)
        into v_rows from public.item_costs as cost
        join public.inventory_items as item on item.id = cost.inventory_item_id
        where item.workspace_id = p_workspace_id;
    elsif v_table = 'invoice_items' then
      select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
        into v_rows from public.invoice_items as item
        join public.invoices as invoice on invoice.id = item.invoice_id
        where invoice.workspace_id = p_workspace_id;
    elsif v_table = 'business_events' then
      select coalesce(jsonb_agg(to_jsonb(event) order by event.created_at, event.id), '[]'::jsonb)
        into v_rows from public.business_events as event
        where event.workspace_id = p_workspace_id
          and (p_filter ->> 'entity_type' is null or event.entity_type = p_filter ->> 'entity_type')
          and (p_filter ->> 'entity_id' is null or event.entity_id = (p_filter ->> 'entity_id')::uuid)
          and (p_filter ->> 'event_type' is null or event.event_type = p_filter ->> 'event_type')
          and (p_filter ->> 'actor_id' is null or event.actor_id = (p_filter ->> 'actor_id')::uuid)
          and (p_filter ->> 'from' is null or event.created_at >= (p_filter ->> 'from')::timestamptz)
          and (p_filter ->> 'to' is null or event.created_at <= (p_filter ->> 'to')::timestamptz);
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(entry) order by entry.id), ''[]''::jsonb) from public.%I as entry where workspace_id = $1', v_table)
        into v_rows using p_workspace_id;
    end if;
    v_result := v_result || jsonb_build_object(v_table, v_rows);
    if octet_length(v_result::text) > 52428800 then
      raise exception using errcode = '54000', message = 'Das Prüfarchiv überschreitet 50 MiB. Es wurde kein Teilarchiv erstellt.';
    end if;
  end loop;
  return v_result;
end;
$function$;

create function public.fail_beta_lifecycle_operation (
  p_request_id uuid,
  p_lease_id   uuid
)
  returns void
  language sql
  set search_path to ''
  as $function$
  update public.beta_lifecycle_operations set status='failed' where request_id=p_request_id and lease_id=p_lease_id and status='processing';
$function$;

revoke all on function public.fail_beta_lifecycle_operation(uuid, uuid) from public;

grant all on function public.fail_beta_lifecycle_operation(uuid, uuid) to service_role;

create or replace function public.finalize_purchase_costing (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_line public.purchase_lines;
  v_existing_lot public.stock_lots;
  v_cohort record;
  v_costing_plan jsonb;
  v_line_plan jsonb;
  v_line_ids uuid[];
  v_line_total_shares bigint[];
  v_line_additional_shares bigint[];
  v_unit_shares bigint[];
  v_tax_unit_costs numeric[];
  v_existing_item_ids uuid[];
  v_goods_cents bigint := 0;
  v_total_cents bigint := 0;
  v_allocated_cents bigint := 0;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_existing_count integer := 0;
  v_existing_lot_quantity integer := 0;
  v_movement_count integer := 0;
  v_inventory_cents bigint := 0;
  v_lot_total_cents bigint := 0;
  v_unit_offset integer := 0;
  v_suffix_position integer := 0;
  v_stock_lot_id uuid;
  v_event_id uuid;
  v_finalized_at timestamptz := pg_catalog.clock_timestamp();
  v_latest_received_at timestamptz;
  v_next_received_at timestamptz;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not exists (
      select 1
      from public.workspace_members as member
      where member.workspace_id = p_workspace_id
        and member.user_id = v_actor_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status = 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Der Einkauf ist bereits finalisiert.';
  end if;

  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Abschluss ergänzt werden.';
  end if;

  if v_purchase.request_id is not null and v_purchase.shipment_status <> 'arrived' then
    raise exception using
      errcode = '22023',
      message = 'Vor dem Abschluss muss die Ankunft bestätigt sein.';
  end if;

  if v_purchase.content_status = 'unknown' then
    raise exception using
      errcode = '22023',
      message = 'Der Inhalt muss vor dem Abschluss vollständig erfasst sein.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ohne Positionen kann nicht finalisiert werden.';
  end if;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  perform line.id
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
  order by line.created_at, line.id
  for update;

  perform cost.id
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id
  order by cost.created_at, cost.id
  for update;

  select pg_catalog.array_agg(line.id order by line.created_at, line.id)
  into v_line_ids
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  perform item.id
  from public.inventory_items as item
  left join public.purchase_lines as linked_line
    on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
  where item.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by item.created_at, item.id
  for update of item;

  perform lot.id
  from public.stock_lots as lot
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by lot.received_at, lot.id
  for update of lot;

  if exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where lot.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and not pg_catalog.isfinite(lot.received_at)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Historische Bestandslose mit nicht-endlichem Empfangszeitpunkt müssen vor der Finalisierung manuell geprüft werden.';
  end if;

  perform movement.id
  from public.stock_movements as movement
  join public.stock_lots as lot on lot.id = movement.stock_lot_id
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.purchase_id = p_purchase_id
    or linked_line.purchase_id = p_purchase_id
  order by movement.created_at, movement.id
  for update of movement;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der vorhandene Bestand ist nicht konsistent mit den Einkaufspositionen.';
  end if;

  if exists (
    select 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = p_purchase_id
      and (
        movement.workspace_id <> p_workspace_id
        or movement.direction <> 'in'
        or movement.reason <> 'receipt'
        or movement.sale_line_id is not null
        or movement.quantity <> lot.received_quantity
      )
  ) or exists (
    select 1
    from public.stock_movements as movement
    join public.stock_lots as lot on lot.id = movement.stock_lot_id
    where lot.purchase_id = p_purchase_id
    group by movement.stock_lot_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'Vorhandene Receipt-Bewegungen müssen exakt zum Bestandslos passen.';
  end if;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and (
        (
          line.line_kind = 'individual' and not line.is_package
          and line.received_quantity <> (
            select pg_catalog.count(*)::integer
            from public.inventory_items as item
            where item.workspace_id = p_workspace_id
              and item.purchase_id = p_purchase_id
              and item.purchase_line_id = line.id
          )
        )
        or (
          line.line_kind = 'quantity'
          and line.received_quantity <> (
            select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.purchase_id = p_purchase_id
              and lot.purchase_line_id = line.id
          )
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Empfangsmengen und vorhandener Bestand stimmen vor der Finalisierung nicht überein.';
  end if;

  if exists (
    select 1
    from public.inventory_items as item
    where item.workspace_id = p_workspace_id
      and item.purchase_id = p_purchase_id
      and item.status not in ('received', 'needs_review', 'researched', 'ready')
  ) then
    raise exception using
      errcode = '22023',
      message = 'Nur unbearbeitete Einzelstücke können finalisiert werden.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and (
        lot.remaining_quantity <> lot.received_quantity
        or exists (
          select 1
          from public.sale_line_lot_allocations as allocation
          where allocation.workspace_id = p_workspace_id
            and allocation.stock_lot_id = lot.id
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bereits verwendete Bestandslose verhindern die Finalisierung.';
  end if;

  v_costing_plan := public.build_purchase_costing_plan(
    p_workspace_id,
    p_purchase_id
  );
  v_goods_cents := (v_costing_plan ->> 'goodsCents')::bigint;
  v_total_cents := (v_costing_plan ->> 'totalCents')::bigint;
  v_allocated_cents := (v_costing_plan ->> 'allocatedCents')::bigint;

  select
    pg_catalog.array_agg((line_plan.value ->> 'additionalCents')::bigint order by line_plan.ordinality),
    pg_catalog.array_agg((line_plan.value ->> 'totalCents')::bigint order by line_plan.ordinality)
  into v_line_additional_shares, v_line_total_shares
  from pg_catalog.jsonb_array_elements(v_costing_plan -> 'lines')
    with ordinality as line_plan(value, ordinality);

  for v_line_position in 1..v_line_count loop
    v_line_plan := v_costing_plan -> 'lines' -> (v_line_position - 1);

    select line.*
    into v_line
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.id = v_line_ids[v_line_position];

    select pg_catalog.array_agg(unit_share.value::bigint order by unit_share.ordinality)
    into v_unit_shares
    from pg_catalog.jsonb_array_elements_text(v_line_plan -> 'unitTotalCents')
      with ordinality as unit_share(value, ordinality);
    select pg_catalog.array_agg(pg_catalog.round(unit_share.value::numeric / 100, 2) order by unit_share.ordinality)
    into v_tax_unit_costs
    from pg_catalog.jsonb_array_elements_text(nullif(v_line_plan -> 'unitTaxPurchaseCents', 'null'::jsonb))
      with ordinality as unit_share(value, ordinality);

    if v_line.is_package then
      -- Der bezahlte Paketpreis bleibt an der Position, ohne verkäuflichen Platzhalter.
      null;
    elsif v_line.line_kind = 'individual' then
      perform item.id
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_line_id = v_line.id
      order by item.created_at, item.id
      for update;

      if exists (
        select 1
        from public.inventory_items as item
        where item.workspace_id = p_workspace_id
          and item.purchase_line_id = v_line.id
          and (
            item.purchase_id is distinct from p_purchase_id
            or item.status not in ('received', 'needs_review', 'researched', 'ready')
          )
      ) then
        raise exception using
          errcode = '22023',
          message = 'Nur unbearbeitete Einzelstücke können finalisiert werden.';
      end if;

      select pg_catalog.array_agg(item.id order by item.created_at, item.id)
      into v_existing_item_ids
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_line_id = v_line.id;

      v_existing_count := coalesce(pg_catalog.cardinality(v_existing_item_ids), 0);
      if v_existing_count > v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Die Zahl erfasster Einzelstücke überschreitet die Positionsmenge.';
      end if;

      for v_item_position in 1..v_line.ordered_quantity loop
        if v_item_position <= v_existing_count then
          update public.inventory_items
          set allocated_purchase_cost = v_unit_shares[v_item_position]::numeric / 100,
              tax_purchase_cost = v_tax_unit_costs[v_item_position],
              ean = coalesce(v_line.ean_snapshot, ean),
              expected_value = coalesce(expected_value, v_line.estimated_market_value),
              status = 'ready',
              updated_at = v_finalized_at
          where id = v_existing_item_ids[v_item_position]
            and workspace_id = p_workspace_id;
        else
          insert into public.inventory_items (
            workspace_id,
            purchase_id,
            purchase_line_id,
            title,
            ean,
            condition,
            status,
            allocated_purchase_cost,
            tax_purchase_cost,
            expected_value
          ) values (
            p_workspace_id,
            p_purchase_id,
            v_line.id,
            v_line.title_snapshot,
            v_line.ean_snapshot,
            case
              when v_line.condition_snapshot in (
                'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
              ) then v_line.condition_snapshot
              else 'used'
            end,
            'ready',
            v_unit_shares[v_item_position]::numeric / 100,
            v_tax_unit_costs[v_item_position],
            v_line.estimated_market_value
          );
        end if;
      end loop;
    else
      perform lot.id
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_line_id = v_line.id
      order by lot.received_at, lot.id
      for update;

      if exists (
        select 1
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id
          and (
            lot.purchase_id <> p_purchase_id
            or lot.catalog_product_id <> v_line.catalog_product_id
            or lot.remaining_quantity <> lot.received_quantity
            or exists (
              select 1
              from public.stock_movements as movement
              where movement.workspace_id = p_workspace_id
                and movement.stock_lot_id = lot.id
                and (
                  movement.direction <> 'in'
                  or movement.reason <> 'receipt'
                )
            )
            or exists (
              select 1
              from public.sale_line_lot_allocations as allocation
              where allocation.workspace_id = p_workspace_id
                and allocation.stock_lot_id = lot.id
            )
          )
      ) then
        raise exception using
          errcode = '22023',
          message = 'Bereits verwendete Bestandslose verhindern die Finalisierung.';
      end if;

      select
        pg_catalog.count(*)::integer,
        coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
      into v_existing_count, v_existing_lot_quantity
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_line_id = v_line.id;

      if v_existing_lot_quantity > v_line.ordered_quantity then
        raise exception using
          errcode = '22023',
          message = 'Die vorhandene Losmenge überschreitet die Positionsmenge.';
      end if;

      v_unit_offset := 0;
      for v_existing_lot in
        select lot.*
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id
        order by lot.received_at, lot.id
        for update
      loop
        select coalesce(pg_catalog.sum(v_unit_shares[unit_position]), 0)::bigint
        into v_lot_total_cents
        from pg_catalog.generate_series(
          v_unit_offset + 1,
          v_unit_offset + v_existing_lot.received_quantity
        ) as unit_position;

        v_unit_offset := v_unit_offset + v_existing_lot.received_quantity;

        update public.stock_lots
        set unit_cost = (
          v_lot_total_cents::numeric
          / v_existing_lot.received_quantity
          / 100
        )
        , unit_tax_purchase_cost = (select pg_catalog.avg(value) from pg_catalog.unnest(v_tax_unit_costs[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset]) as value),
          remaining_tax_unit_costs = v_tax_unit_costs[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset],
          remaining_unit_costs = (select pg_catalog.array_agg(pg_catalog.round(value::numeric / 100, 2) order by ordinality)
            from pg_catalog.unnest(v_unit_shares[(v_unit_offset - v_existing_lot.received_quantity + 1):v_unit_offset]) with ordinality as unit(value, ordinality))
        where id = v_existing_lot.id
          and workspace_id = p_workspace_id;

        if (
          select pg_catalog.round(lot.unit_cost * lot.received_quantity, 2)
          from public.stock_lots as lot
          where lot.id = v_existing_lot.id
            and lot.workspace_id = p_workspace_id
        ) <> v_lot_total_cents::numeric / 100 then
          raise exception using
            errcode = '22023',
            message = 'Die Loskosten lassen sich nicht centgenau speichern.';
        end if;

        select pg_catalog.count(*)::integer
        into v_movement_count
        from public.stock_movements as movement
        where movement.workspace_id = p_workspace_id
          and movement.stock_lot_id = v_existing_lot.id;

        if v_movement_count > 1 then
          raise exception using
            errcode = '22023',
            message = 'Ein Bestandslos besitzt mehrere Eingangsbewegungen und kann nicht automatisch umgebaut werden.';
        end if;

        if v_movement_count = 0 then
          insert into public.stock_movements (
            workspace_id,
            stock_lot_id,
            direction,
            quantity,
            reason
          ) values (
            p_workspace_id,
            v_existing_lot.id,
            'in',
            v_existing_lot.received_quantity,
            'receipt'
          );
        end if;
      end loop;

      if v_unit_offset < pg_catalog.cardinality(v_unit_shares) then
        select pg_catalog.max(lot.received_at)
        into v_latest_received_at
        from public.stock_lots as lot
        where lot.workspace_id = p_workspace_id
          and lot.purchase_line_id = v_line.id;

        if v_latest_received_at is null then
          v_next_received_at := v_finalized_at;
        elsif not pg_catalog.isfinite(v_latest_received_at)
          or v_latest_received_at >= '294276-12-31 23:59:59.999999+00'::timestamptz then
          raise exception using
            errcode = '22023',
            message = 'Für neue Bestandslose ist kein späterer endlicher Empfangszeitpunkt verfügbar.';
        else
          v_next_received_at := greatest(
            v_finalized_at,
            v_latest_received_at + interval '1 microsecond'
          );
        end if;
      end if;

      v_suffix_position := 0;

      for v_cohort in
        select
          share.value as unit_cost_cents,
          v_tax_unit_costs[share.ordinality] as tax_unit_cost,
          pg_catalog.count(*)::integer as quantity,
          pg_catalog.min(share.ordinality) as first_position
        from pg_catalog.unnest(v_unit_shares)
          with ordinality as share(value, ordinality)
        where share.ordinality > v_unit_offset
        group by share.value, v_tax_unit_costs[share.ordinality]
        order by pg_catalog.min(share.ordinality)
      loop
        if v_suffix_position > 0 then
          if not pg_catalog.isfinite(v_next_received_at)
            or v_next_received_at >= '294276-12-31 23:59:59.999999+00'::timestamptz then
            raise exception using
              errcode = '22023',
              message = 'Für neue Bestandslose ist kein späterer endlicher Empfangszeitpunkt verfügbar.';
          end if;

          v_next_received_at := v_next_received_at + interval '1 microsecond';
        end if;

        v_suffix_position := v_suffix_position + 1;

        insert into public.stock_lots (
          workspace_id,
          purchase_id,
          purchase_line_id,
          catalog_product_id,
          received_quantity,
          remaining_quantity,
          unit_cost,
          unit_tax_purchase_cost,
          remaining_tax_unit_costs,
          remaining_unit_costs,
          received_at
        ) values (
          p_workspace_id,
          p_purchase_id,
          v_line.id,
          v_line.catalog_product_id,
          v_cohort.quantity,
          v_cohort.quantity,
          v_cohort.unit_cost_cents::numeric / 100,
          v_cohort.tax_unit_cost,
          case when v_cohort.tax_unit_cost is null then null else pg_catalog.array_fill(v_cohort.tax_unit_cost, array[v_cohort.quantity]) end,
          pg_catalog.array_fill(pg_catalog.round(v_cohort.unit_cost_cents::numeric / 100, 2), array[v_cohort.quantity]),
          v_next_received_at
        ) returning id into v_stock_lot_id;

        insert into public.stock_movements (
          workspace_id,
          stock_lot_id,
          direction,
          quantity,
          reason
        ) values (
          p_workspace_id,
          v_stock_lot_id,
          'in',
          v_cohort.quantity,
          'receipt'
        );
      end loop;
    end if;

    update public.purchase_lines
    set allocated_additional_cost =
          v_line_additional_shares[v_line_position]::numeric / 100,
        allocated_total_cost = v_line_total_shares[v_line_position]::numeric / 100,
        received_quantity = ordered_quantity,
        updated_at = v_finalized_at
    where workspace_id = p_workspace_id
      and id = v_line.id;
  end loop;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.id = coalesce(item.purchase_line_id, item.source_package_line_id)
    where (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        item.workspace_id <> p_workspace_id
        or item.purchase_id is distinct from p_purchase_id
        or (item.purchase_line_id is null and item.source_package_line_id is null)
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'individual'
      )
  ) or exists (
    select 1
    from public.stock_lots as lot
    left join public.purchase_lines as linked_line
      on linked_line.id = lot.purchase_line_id
    where (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and (
        lot.workspace_id <> p_workspace_id
        or lot.purchase_id <> p_purchase_id
        or linked_line.id is null
        or linked_line.workspace_id <> p_workspace_id
        or linked_line.purchase_id <> p_purchase_id
        or linked_line.line_kind <> 'quantity'
        or lot.catalog_product_id <> linked_line.catalog_product_id
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Der Bestand ist nach der Finalisierung strukturell inkonsistent.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and lot.unit_cost is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Nach der Finalisierung müssen alle Bestandslose bekannte Kosten besitzen.';
  end if;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and (
        line.received_quantity <> line.ordered_quantity
        or line.allocated_additional_cost > line.allocated_total_cost
        or (
          line.line_kind = 'individual' and not line.is_package
          and (
            line.ordered_quantity <> (
              select pg_catalog.count(*)::integer
              from public.inventory_items as item
              where item.workspace_id = p_workspace_id
                and item.purchase_id = p_purchase_id
                and item.purchase_line_id = line.id
            )
            or line.allocated_total_cost * 100 <> (
              select coalesce(
                pg_catalog.sum(item.allocated_purchase_cost * 100),
                0
              )
              from public.inventory_items as item
              where item.workspace_id = p_workspace_id
                and item.purchase_id = p_purchase_id
                and item.purchase_line_id = line.id
            )
          )
        )
        or (
          line.line_kind = 'quantity'
          and (
            line.ordered_quantity <> (
              select coalesce(pg_catalog.sum(lot.received_quantity), 0)::integer
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
            or line.ordered_quantity <> (
              select coalesce(pg_catalog.sum(lot.remaining_quantity), 0)::integer
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
            or line.allocated_total_cost * 100 <> (
              select coalesce(
                pg_catalog.sum(
                  (pg_catalog.round(lot.received_quantity * lot.unit_cost, 2) * 100)::bigint
                ),
                0
              )
              from public.stock_lots as lot
              where lot.workspace_id = p_workspace_id
                and lot.purchase_id = p_purchase_id
                and lot.purchase_line_id = line.id
            )
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Positionskosten und Bestand reconciliieren nach der Finalisierung nicht exakt.';
  end if;

  if exists (
    select 1
    from public.stock_lots as lot
    where lot.workspace_id = p_workspace_id
      and lot.purchase_id = p_purchase_id
      and (
        select pg_catalog.count(*)
        from public.stock_movements as movement
        where movement.workspace_id = p_workspace_id
          and movement.stock_lot_id = lot.id
          and movement.direction = 'in'
          and movement.reason = 'receipt'
          and movement.quantity = lot.received_quantity
      ) <> 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Bestandslose und Receipt-Bewegungen reconciliieren nach der Finalisierung nicht exakt.';
  end if;

  select (
    coalesce((
      select pg_catalog.sum(item.allocated_purchase_cost * 100)
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = p_purchase_id
    ), 0)
    + coalesce((
      select pg_catalog.sum(
        (pg_catalog.round(lot.received_quantity * lot.unit_cost, 2) * 100)::bigint
      )
      from public.stock_lots as lot
      where lot.workspace_id = p_workspace_id
        and lot.purchase_id = p_purchase_id
    ), 0)
    + coalesce((
      select pg_catalog.sum(line.allocated_total_cost * 100)
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id and line.purchase_id = p_purchase_id and line.is_package
    ), 0)
  )::bigint
  into v_inventory_cents;

  if v_inventory_cents <> v_total_cents then
    raise exception using
      errcode = 'P0001',
      message = 'Der gesamte Einkaufsbestand reconciliiert nicht mit den Einkaufsgesamtkosten.';
  end if;

  update public.inventory_items
  set status = 'ready', updated_at = v_finalized_at
  where workspace_id = p_workspace_id and purchase_id = p_purchase_id
    and source_package_line_id is not null and status in ('received', 'needs_review', 'researched');

  update public.purchases
  set purchase_price = pg_catalog.round(v_goods_cents::numeric / 100, 2),
      total_purchase_cost = v_total_cents::numeric / 100,
      entry_status = 'finalized',
      finalized_at = v_finalized_at,
      finalized_by = v_actor_id,
      updated_at = v_finalized_at
  where workspace_id = p_workspace_id
    and id = p_purchase_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_finalized',
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'purchase_price', pg_catalog.jsonb_build_object(
        'before', v_purchase.purchase_price,
        'after', v_goods_cents::numeric / 100
      ),
      'total_purchase_cost', pg_catalog.jsonb_build_object(
        'before', v_purchase.total_purchase_cost,
        'after', v_total_cents::numeric / 100
      ),
      'allocated_total_cost', pg_catalog.jsonb_build_object(
        'before', 0,
        'after', v_allocated_cents::numeric / 100
      ),
      'entry_status', pg_catalog.jsonb_build_object(
        'before', v_purchase.entry_status,
        'after', 'finalized'
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'purchaseId', p_purchase_id,
    'totalPurchaseCost', v_total_cents::numeric / 100,
    'allocatedTotalCost', v_allocated_cents::numeric / 100,
    'entryStatus', 'finalized',
    'eventId', v_event_id
  );
end;
$function$;

create or replace function public.get_number_settings (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
  if (select auth.uid()) is null or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  return jsonb_build_object('can_edit',(select public.can_administer_workspace(p_workspace_id)),
    'timezone',(select numbering_timezone from public.workspaces where id=p_workspace_id),
    'series',coalesce((select jsonb_agg(to_jsonb(s) order by s.entity_type) from public.number_series s where s.workspace_id=p_workspace_id),'[]'::jsonb));
end;
$function$;

create or replace function public.get_purchase_sale_history_state (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns text
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if not exists (
    select 1
    from public.purchases as purchase
    where purchase.workspace_id = p_workspace_id
      and purchase.id = p_purchase_id
  ) then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if exists (
    select 1
    from public.inventory_items as item
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where item.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
      and item.status = 'sold'
      and not exists (
        select 1
        from public.sale_lines as sale_line
        where sale_line.workspace_id = p_workspace_id
          and sale_line.inventory_item_id = item.id
      )
  ) then
    return 'review_required';
  end if;

  if exists (
    select 1
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = item.workspace_id
      and linked_line.id = item.purchase_line_id
    where sale_line.workspace_id = p_workspace_id
      and (
        item.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
  ) or exists (
    select 1
    from public.sale_line_lot_allocations as allocation
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    left join public.purchase_lines as linked_line
      on linked_line.workspace_id = lot.workspace_id
      and linked_line.id = lot.purchase_line_id
    where allocation.workspace_id = p_workspace_id
      and (
        lot.purchase_id = p_purchase_id
        or linked_line.purchase_id = p_purchase_id
      )
  ) then
    return 'recorded';
  end if;

  return 'none';
end;
$function$;

create or replace function public.get_workspace_company_settings (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
  v_profile public.workspace_company_profiles;
  v_tax_mode text;
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select * into v_profile
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id;

  if not found then
    raise exception using errcode = '55000', message = 'Unternehmensprofil fehlt.';
  end if;

  select tax_mode into v_tax_mode
  from public.workspaces
  where id = p_workspace_id;

  return pg_catalog.jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'tax_mode', v_tax_mode,
    'can_edit', (select public.can_administer_workspace(p_workspace_id))
  );
end;
$function$;

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  new_ws_id uuid;
  v_beta_application_id uuid;
  v_granted_days integer;
  v_application_id_text text := new.raw_user_meta_data->>'beta_application_id';
begin
  if v_application_id_text is not null then
    if v_application_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Ungültige Beta-Bewerbung' using errcode='42501'; end if;
    perform 1 from public.beta_applications as application where application.id=v_application_id_text::uuid
      and application.status='accepted' and application.revoked_at is null
      and application.auth_user_id is null and lower(application.email)=lower(new.email)
      and (application.registration_link_kind='legacy' or exists(select 1 from public.beta_lifecycle_operations
        where application_id=application.id and action='invite' and status='processing' and lease_expires_at>now())) for update;
    if not found then raise exception 'Beta-Freigabe ist nicht mehr gültig' using errcode='42501'; end if;
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'Reseller'));

  insert into public.workspaces (name, min_roi_percent, min_profit_amount)
  values ('Mein Workspace', 30.0, 15.0)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, new.id, 'owner');

  insert into public.workspace_company_profiles(workspace_id)
  values (new_ws_id);

  insert into public.sources (workspace_id, name, is_default)
  values
    (new_ws_id, 'Kleinanzeigen', true),
    (new_ws_id, 'eBay', false),
    (new_ws_id, 'Vinted', false),
    (new_ws_id, 'Flohmarkt', false),
    (new_ws_id, 'meinePacks', false),
    (new_ws_id, 'B-Stock / Retouren', false),
    (new_ws_id, 'Grosshaendler / Palette', false);

  if v_application_id_text is not null
     and v_application_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_beta_application_id := v_application_id_text::uuid;

    update public.beta_applications
    set auth_user_id = new.id
    where id = v_beta_application_id
      and status = 'accepted'
      and lower(email) = lower(new.email)
      and (auth_user_id is null or auth_user_id = new.id)
    returning id, granted_days
    into v_beta_application_id, v_granted_days;

    if found then
      insert into public.workspace_licenses (
        workspace_id,
        beta_application_id,
        access_source,
        status,
        granted_days
      ) values (
        new_ws_id,
        v_beta_application_id,
        'beta',
        'pending',
        v_granted_days
      )
      on conflict (workspace_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

create function public.inspect_beta_registration (
  p_token_hash text
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_link public.beta_registration_links; v_application public.beta_applications;
begin
  select * into v_link from public.beta_registration_links where token_hash=p_token_hash
    and revoked_at is null and consumed_at is null and expires_at>now();
  select * into v_application from public.beta_applications where id=v_link.application_id;
  if v_link.id is null or v_application.status<>'accepted' or v_application.revoked_at is not null
    or v_application.registered_at is not null or v_application.invitation_status<>'sent' then
    raise exception 'Registrierungslink ist ungültig oder abgelaufen' using errcode='22023';
  end if;
  return jsonb_build_object('application_id',v_application.id,'auth_user_id',v_application.auth_user_id,
    'email',v_application.email,'expires_at',v_link.expires_at);
end;
$function$;

revoke all on function public.inspect_beta_registration(text) from public;

grant all on function public.inspect_beta_registration(text) to service_role;

create or replace function public.list_business_events (
  p_workspace_id      uuid,
  p_filter            jsonb,
  p_cursor_created_at timestamp with time zone,
  p_cursor_id         uuid,
  p_page_size         integer
)
  returns table (
    id             uuid,
    workspace_id   uuid,
    entity_type    text,
    entity_id      uuid,
    event_type     text,
    actor_id       uuid,
    reason         text,
    changes        jsonb,
    correlation_id uuid,
    created_at     timestamp with time zone
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null or p_workspace_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für den globalen Ereignisverlauf.';
  end if;

  if not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = v_actor_id
      and member.role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für den globalen Ereignisverlauf.';
  end if;

  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Der Ereignisfilter muss ein JSON-Objekt sein.';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'Die Seitengröße muss zwischen 1 und 100 liegen.';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using
      errcode = '22023',
      message = 'Der Ereigniscursor ist unvollständig.';
  end if;

  return query
  select
    event.id,
    event.workspace_id,
    event.entity_type,
    event.entity_id,
    event.event_type,
    event.actor_id,
    event.reason,
    event.changes,
    event.correlation_id,
    event.created_at
  from public.business_events as event
  where event.workspace_id = p_workspace_id
    and (
      not (p_filter ? 'entity_type')
      or event.entity_type = p_filter ->> 'entity_type'
    )
    and (
      not (p_filter ? 'entity_id')
      or event.entity_id = (p_filter ->> 'entity_id')::uuid
    )
    and (
      not (p_filter ? 'event_type')
      or event.event_type = p_filter ->> 'event_type'
    )
    and (
      not (p_filter ? 'actor_id')
      or event.actor_id = (p_filter ->> 'actor_id')::uuid
    )
    and (
      not (p_filter ? 'from')
      or event.created_at >= (p_filter ->> 'from')::timestamptz
    )
    and (
      not (p_filter ? 'to')
      or event.created_at <= (p_filter ->> 'to')::timestamptz
    )
    and (
      p_cursor_created_at is null
      or (event.created_at, event.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by event.created_at desc, event.id desc
  limit p_page_size;
end;
$function$;

create or replace function public.list_entity_business_events (
  p_workspace_id      uuid,
  p_entity_type       text,
  p_entity_id         uuid,
  p_cursor_created_at timestamp with time zone,
  p_cursor_id         uuid,
  p_page_size         integer
)
  returns table (
    id             uuid,
    workspace_id   uuid,
    entity_type    text,
    entity_id      uuid,
    event_type     text,
    actor_id       uuid,
    reason         text,
    changes        jsonb,
    correlation_id uuid,
    created_at     timestamp with time zone
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_has_entity_access boolean := false;
  v_privileged_role boolean := false;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null or p_workspace_id is null or p_entity_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  select member.role in ('owner', 'admin', 'accountant')
  into v_privileged_role
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = v_actor_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  case p_entity_type
    when 'purchase' then
      select exists (
        select 1
        from public.purchases as purchase
        where purchase.workspace_id = p_workspace_id
          and purchase.id = p_entity_id
      ) into v_has_entity_access;
    when 'inventory_item' then
      select exists (
        select 1
        from public.inventory_items as inventory_item
        where inventory_item.workspace_id = p_workspace_id
          and inventory_item.id = p_entity_id
      ) into v_has_entity_access;
    when 'sale' then
      select exists (
        select 1
        from public.sales as sale
        where sale.workspace_id = p_workspace_id
          and sale.id = p_entity_id
      ) into v_has_entity_access;
    when 'return' then
      select exists (
        select 1
        from public.returns as returned_sale
        where returned_sale.workspace_id = p_workspace_id
          and returned_sale.id = p_entity_id
      ) into v_has_entity_access;
    when 'expense' then
      select exists (
        select 1
        from public.expenses as expense
        where expense.workspace_id = p_workspace_id
          and expense.id = p_entity_id
      ) into v_has_entity_access;
    when 'export' then
      if v_privileged_role then
        select exists (
          select 1
          from public.business_events as event
          where event.workspace_id = p_workspace_id
            and event.entity_type = 'export'
            and event.entity_id = p_entity_id
        ) into v_has_entity_access;
      end if;
    else
      raise exception using
        errcode = '22023',
        message = 'Unbekannter fachlicher Datensatztyp.';
  end case;

  if not v_has_entity_access then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für diesen Datensatzverlauf.';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'Die Seitengröße muss zwischen 1 und 100 liegen.';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using
      errcode = '22023',
      message = 'Der Ereigniscursor ist unvollständig.';
  end if;

  return query
  select
    event.id,
    event.workspace_id,
    event.entity_type,
    event.entity_id,
    event.event_type,
    event.actor_id,
    event.reason,
    event.changes,
    event.correlation_id,
    event.created_at
  from public.business_events as event
  where event.workspace_id = p_workspace_id
    and event.entity_type = p_entity_type
    and event.entity_id = p_entity_id
    and (
      p_cursor_created_at is null
      or (event.created_at, event.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by event.created_at desc, event.id desc
  limit p_page_size;
end;
$function$;

create function public.list_my_workspace_access()
  returns table (
    workspace_id  uuid,
    access_status text,
    ends_at       timestamp with time zone,
    server_time   timestamp with time zone
  )
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select member.workspace_id,
    case when application.revoked_at is not null then 'revoked'
      when license.ended_at is not null then 'ended'
      when license.status='pending' then 'pending'
      when license.status='suspended' then 'suspended'
      when license.status='expired' or license.ends_at<=now() then 'expired'
      else 'active' end,
    license.ends_at,now()
  from public.workspace_members as member
  left join public.workspace_licenses as license on license.workspace_id=member.workspace_id
  left join public.beta_applications as application on application.id=license.beta_application_id
  where member.user_id=(select auth.uid());
$function$;

revoke all on function public.list_my_workspace_access() from public;

grant all on function public.list_my_workspace_access() to authenticated;

grant all on function public.list_my_workspace_access() to service_role;

create function public.list_platform_beta_lifecycle()
  returns table (
    application_id        uuid,
    auth_user_id          uuid,
    workspace_id          uuid,
    invitation_expires_at timestamp with time zone,
    revoked_at            timestamp with time zone,
    ended_at              timestamp with time zone
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
  if not public.is_platform_operator() then raise exception 'Nur für Betreiber' using errcode='42501'; end if;
  return query select application.id,application.auth_user_id,license.workspace_id,application.invitation_expires_at,application.revoked_at,license.ended_at
    from public.beta_applications as application left join public.workspace_licenses as license on license.beta_application_id=application.id;
end;
$function$;

revoke all on function public.list_platform_beta_lifecycle() from public;

grant all on function public.list_platform_beta_lifecycle() to authenticated;

grant all on function public.list_platform_beta_lifecycle() to service_role;

create or replace function public.list_record_timeline (
  p_workspace_id      uuid,
  p_entity_type       text,
  p_entity_id         uuid,
  p_cursor_created_at timestamp with time zone default null::timestamp with time zone,
  p_cursor_kind       text                     default null::text,
  p_cursor_id         uuid                     default null::uuid,
  p_page_size         integer                  default 20
)
  returns table (
    id             uuid,
    kind           text,
    created_at     timestamp with time zone,
    actor_name     text,
    body           text,
    event_type     text,
    actor_id       uuid,
    reason         text,
    changes        jsonb,
    correlation_id uuid
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
  if (select auth.uid()) is null or p_workspace_id is null or p_entity_type is null or p_entity_id is null
    or not (select public.can_access_workspace(p_workspace_id))
    or not (
      (p_entity_type = 'purchase' and exists(select 1 from public.purchases p where p.workspace_id=p_workspace_id and p.id=p_entity_id))
      or (p_entity_type = 'sale' and exists(select 1 from public.sales s where s.workspace_id=p_workspace_id and s.id=p_entity_id))
    ) then
    raise exception using errcode='42501', message='Keine Berechtigung für diese Chronik.';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode='22023', message='Die Seitengröße muss zwischen 1 und 100 liegen.';
  end if;
  if num_nonnulls(p_cursor_created_at,p_cursor_kind,p_cursor_id) not in (0,3)
    or (p_cursor_kind is not null and p_cursor_kind not in ('comment','event')) then
    raise exception using errcode='22023', message='Der Chronik-Seitenzeiger ist ungültig.';
  end if;
  return query
  with entries as (
    select e.id, 'event'::text as kind, e.created_at,
      coalesce(nullif(btrim(p.full_name),''),case when e.actor_id is null then 'Automatisches System' else 'Mitglied' end) as actor_name,
      null::text as body, e.event_type, e.actor_id, e.reason, e.changes, e.correlation_id
    from public.business_events e left join public.profiles p on p.id=e.actor_id
    where e.workspace_id=p_workspace_id and e.entity_type=p_entity_type and e.entity_id=p_entity_id
    union all
    select c.id, 'comment'::text, c.created_at, coalesce(nullif(btrim(p.full_name),''),'Mitglied'),
      c.body, null::text, c.author_id, null::text, null::jsonb, null::uuid
    from public.record_comments c left join public.profiles p on p.id=c.author_id
    where c.workspace_id=p_workspace_id and (
      (p_entity_type='purchase' and c.purchase_id=p_entity_id)
      or (p_entity_type='sale' and c.sale_id=p_entity_id)
    )
  )
  select e.* from entries e
  where p_cursor_created_at is null or (e.created_at,e.kind collate "C",e.id) < (p_cursor_created_at,p_cursor_kind collate "C",p_cursor_id)
  order by e.created_at desc,e.kind collate "C" desc,e.id desc limit p_page_size;
end;
$function$;

create or replace function public.marketplace_apply_vinted_import (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid,
  p_user_id       uuid,
  p_snapshot      jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
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
  if not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(91731, 1);
  -- Gleiche Sperrreihenfolge wie die bestehenden Browser-RPCs: Konto, dann Sitzung.
  select * into v_connection from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found or v_connection.status <> 'connected' then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
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
  return v_counts;
end;
$function$;

create or replace function public.marketplace_can_manage (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select (select auth.uid()) is not null
    and (select public.is_platform_operator())
    and public.can_administer_workspace(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$function$;

create or replace function public.marketplace_sync_authorization_valid (
  p_workspace_id uuid,
  p_user_id      uuid
)
  returns boolean
  language plpgsql
  set search_path to ''
  as $function$
begin
  if not public.workspace_access_is_valid(p_workspace_id) then return false; end if;
  perform 1 from public.platform_operators where user_id = p_user_id for share;
  if not found then return false; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner','admin') for share;
  if not found then return false; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  return found;
end;
$function$;

create or replace function public.migrate_purchase_costing_legacy (
  p_workspace_id         uuid,
  p_confirm              boolean,
  p_purchase_id          uuid    default null::uuid,
  p_expected_fingerprint text    default null::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_privileged boolean := false;
  v_candidate record;
  v_item public.inventory_items;
  v_purchase public.purchases;
  v_line_id uuid;
  v_line_created_at timestamptz;
  v_line_position integer;
  v_lines jsonb;
  v_costs jsonb;
  v_original_item_statuses jsonb;
  v_costing_result jsonb;
  v_costing_event_id uuid;
  v_costing_event_type text;
  v_correlation_id uuid;
  v_has_sales boolean;
  v_repaired bigint := 0;
  v_items_missing bigint := 0;
  v_manual_review bigint := 0;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null or p_workspace_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenmigration.';
  end if;

  select member.role in ('owner', 'admin', 'accountant')
  into v_privileged
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = v_actor_id;

  if not found or not v_privileged then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenmigration.';
  end if;

  if p_confirm is distinct from true then
    raise exception using
      errcode = '22023',
      message = 'Die Altdatenmigration benötigt eine ausdrückliche Bestätigung.';
  end if;

  if p_purchase_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_purchase_id::text, 0));
    perform 1 from public.purchases
    where workspace_id = p_workspace_id and id = p_purchase_id for update;
    perform 1 from public.inventory_items
    where workspace_id = p_workspace_id and purchase_id = p_purchase_id order by id for update;
    perform 1 from public.purchase_costs
    where workspace_id = p_workspace_id and purchase_id = p_purchase_id order by id for update;
    perform 1 from public.sale_lines l
    join public.inventory_items i on i.id = l.inventory_item_id and i.workspace_id = l.workspace_id
    where i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id
    order by l.id for update of l;
    perform 1 from public.sales s
    where s.workspace_id = p_workspace_id and exists (
      select 1 from public.sale_lines l
      join public.inventory_items i on i.id = l.inventory_item_id and i.workspace_id = l.workspace_id
      where l.sale_id = s.id and i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id
    ) order by s.id for update;
    if p_expected_fingerprint is null or
      (public.preview_purchase_cost_repair(p_workspace_id, p_purchase_id) ->> 'fingerprint')
      is distinct from p_expected_fingerprint then
      raise exception using errcode = '40001', message = 'Der Einkauf wurde inzwischen geändert. Bitte erneut prüfen.';
    end if;
  end if;

  select
    pg_catalog.count(*) filter (where preview.classification = 'items_missing'),
    pg_catalog.count(*) filter (where preview.classification = 'manual_review')
  into v_items_missing, v_manual_review
  from public.preview_purchase_costing_legacy(p_workspace_id) as preview
  where p_purchase_id is null or preview.purchase_id = p_purchase_id;

  for v_candidate in
    select preview.*
    from public.preview_purchase_costing_legacy(p_workspace_id) as preview
    where preview.classification = 'auto_repair'
      and (p_purchase_id is null or preview.purchase_id = p_purchase_id)
    order by preview.purchase_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_candidate.purchase_id::text, 0)
    );

    select purchase.*
    into v_purchase
    from public.purchases as purchase
    where purchase.workspace_id = p_workspace_id
      and purchase.id = v_candidate.purchase_id
    for update;

    if not found or v_purchase.entry_status = 'finalized' then
      continue;
    end if;

    if not exists (
      select 1
      from public.preview_purchase_costing_legacy(p_workspace_id) as preview
      where preview.purchase_id = v_candidate.purchase_id
        and preview.classification = 'auto_repair'
    ) then
      continue;
    end if;

    v_line_created_at := pg_catalog.clock_timestamp();
    v_line_position := 0;

    for v_item in
      select item.*
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id
      order by item.created_at, item.id
      for update
    loop
      v_line_position := v_line_position + 1;
      v_line_id := pg_catalog.gen_random_uuid();

      insert into public.purchase_lines (
        id,
        workspace_id,
        purchase_id,
        catalog_product_id,
        title_snapshot,
        line_kind,
        ordered_quantity,
        received_quantity,
        unit_purchase_price,
        line_total,
        allocated_additional_cost,
        created_at,
        updated_at,
        price_mode,
        condition_snapshot,
        estimated_market_value,
        allocated_total_cost,
        ean_snapshot
      ) values (
        v_line_id,
        p_workspace_id,
        v_candidate.purchase_id,
        null,
        v_item.title,
        'individual',
        1,
        1,
        null,
        null,
        0,
        v_line_created_at + (v_line_position * interval '1 microsecond'),
        v_line_created_at + (v_line_position * interval '1 microsecond'),
        'unpriced_mystery',
        v_item.condition,
        v_item.expected_value,
        0,
        v_item.ean
      );

      update public.inventory_items
      set purchase_line_id = v_line_id
      where workspace_id = p_workspace_id
        and id = v_item.id;
    end loop;

    select exists (
      select 1
      from public.sale_lines as sale_line
      join public.inventory_items as item
        on item.workspace_id = sale_line.workspace_id
        and item.id = sale_line.inventory_item_id
      where sale_line.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id
    )
    into v_has_sales;

    if v_has_sales then
      update public.purchases
      set entry_status = 'finalized',
          finalized_at = pg_catalog.clock_timestamp(),
          finalized_by = v_actor_id,
          total_purchase_cost = v_purchase.purchase_price + coalesce((
            select pg_catalog.sum(cost.amount)
            from public.purchase_costs as cost
            where cost.workspace_id = p_workspace_id
              and cost.purchase_id = v_candidate.purchase_id
          ), 0),
          updated_at = pg_catalog.clock_timestamp()
      where workspace_id = p_workspace_id
        and id = v_candidate.purchase_id;

      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', line.id,
          'catalog_product_id', line.catalog_product_id,
          'title_snapshot', line.title_snapshot,
          'line_kind', line.line_kind,
          'ordered_quantity', line.ordered_quantity,
          'price_mode', line.price_mode,
          'unit_purchase_price', line.unit_purchase_price,
          'line_total', line.line_total,
          'condition_snapshot', line.condition_snapshot,
          'estimated_market_value', line.estimated_market_value
        ) order by line.created_at, line.id
      )
      into v_lines
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.purchase_id = v_candidate.purchase_id;

      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', cost.id,
          'type', cost.type,
          'amount', cost.amount,
          'description', cost.description,
          'allocation_method', cost.allocation_method,
          'target_purchase_line_id', cost.target_purchase_line_id
        ) order by cost.created_at, cost.id
      ), '[]'::jsonb)
      into v_costs
      from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id
        and cost.purchase_id = v_candidate.purchase_id;

      select public.correct_purchase_costing(
        p_workspace_id,
        v_candidate.purchase_id,
        'Kontrollierte Übernahme historischer Mystery-Einkaufskosten.',
        v_purchase.purchase_price,
        v_lines,
        v_costs
      ) into v_costing_result;

      v_costing_event_type := 'purchase_corrected';
    else
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', item.id,
          'status', item.status
        ) order by item.created_at, item.id
      )
      into v_original_item_statuses
      from public.inventory_items as item
      where item.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id;

      select public.finalize_purchase_costing(
        p_workspace_id,
        v_candidate.purchase_id
      ) into v_costing_result;

      update public.inventory_items as item
      set status = original_item.status
      from pg_catalog.jsonb_to_recordset(v_original_item_statuses)
        as original_item(id uuid, status text)
      where item.workspace_id = p_workspace_id
        and item.purchase_id = v_candidate.purchase_id
        and item.id = original_item.id;

      v_costing_event_type := 'purchase_finalized';
    end if;

    v_costing_event_id := (v_costing_result ->> 'eventId')::uuid;

    select event.correlation_id
    into strict v_correlation_id
    from public.business_events as event
    where event.workspace_id = p_workspace_id
      and event.id = v_costing_event_id;

    insert into public.business_events (
      workspace_id,
      entity_type,
      entity_id,
      event_type,
      actor_id,
      reason,
      changes,
      correlation_id
    ) values (
      p_workspace_id,
      'purchase',
      v_candidate.purchase_id,
      'purchase_costing_legacy_migrated',
      v_actor_id,
      'Kontrollierte Übernahme historischer Mystery-Einkaufskosten.',
      pg_catalog.jsonb_build_object(
        'migration', pg_catalog.jsonb_build_object(
          'before', null,
          'after', pg_catalog.jsonb_build_object(
            'classification', 'auto_repair',
            'costing_event_id', v_costing_event_id,
            'costing_event_type', v_costing_event_type,
            'item_count', v_candidate.item_count,
            'operational_statuses_preserved', true
          )
        )
      ),
      v_correlation_id
    );

    v_repaired := v_repaired + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'repaired', v_repaired,
    'itemsMissing', v_items_missing,
    'manualReview', v_manual_review
  );
end;
$function$;

create or replace function public.place_store_order (
  p_workspace_id   uuid,
  p_order_id       uuid,
  p_order_number   text,
  p_customer       jsonb,
  p_subtotal       numeric,
  p_shipping_cost  numeric,
  p_total          numeric,
  p_payment_method text,
  p_payment_status text,
  p_payment_id     text,
  p_status         text,
  p_sale_date      date,
  p_buyer_notes    text,
  p_items          jsonb
)
  returns public.store_orders
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_order public.store_orders;
  v_inventory_item public.inventory_items;
  v_inventory_item_id uuid;
  v_sale_state text;
  v_item_count integer;
  v_reference_count integer;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_order_id is null
    or nullif(trim(p_order_number), '') is null
    or jsonb_typeof(p_customer) <> 'object'
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or p_subtotal < 0
    or p_shipping_cost < 0
    or p_total < 0 then
    raise exception using errcode = '22023', message = 'Die Bestelldaten sind ungültig.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(trim(item.value ->> 'item_title'), '') is null
      or coalesce((item.value ->> 'quantity')::integer, 0) < 1
      or coalesce((item.value ->> 'price')::numeric, -1) < 0
      or case
        when item.value ? 'payment_fee'
          and jsonb_typeof(item.value -> 'payment_fee') <> 'null' then
          case jsonb_typeof(item.value -> 'payment_fee')
            when 'number' then
              (item.value ->> 'payment_fee')::numeric < 0
              or (item.value ->> 'payment_fee')::numeric <> trunc((item.value ->> 'payment_fee')::numeric, 2)
            else true
          end
        else false
      end
      or num_nonnulls(
        nullif(item.value ->> 'catalog_product_id', ''),
        nullif(item.value ->> 'inventory_item_id', '')
      ) <> 1
  ) then
    raise exception using errcode = '22023', message = 'Mindestens eine Bestellposition ist ungültig.';
  end if;

  select * into v_order
  from public.store_orders
  where id = p_order_id
  for update;

  if found then
    if v_order.workspace_id <> p_workspace_id
      or v_order.order_number <> p_order_number then
      raise exception using errcode = '22023', message = 'Die Bestellkennung gehört zu einer anderen Bestellung.';
    end if;
    return v_order;
  end if;

  select count(*), count(distinct coalesce(
    'catalog_product:' || item.catalog_product_id::text,
    'inventory_item:' || item.inventory_item_id::text
  ))
  into v_item_count, v_reference_count
  from jsonb_to_recordset(p_items) as item(
    catalog_product_id uuid,
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  if v_reference_count <> v_item_count then
    raise exception using errcode = '22023', message = 'Jeder Artikel darf nur einmal in einer Bestellung vorkommen.';
  end if;

  -- Lock in stable order so concurrent checkout requests cannot sell the same
  -- individual item and cannot deadlock when an order contains several items.
  for v_inventory_item_id in
    select distinct item.inventory_item_id
    from jsonb_to_recordset(p_items) as item(
      catalog_product_id uuid,
      inventory_item_id uuid,
      item_title text,
      quantity integer,
      price numeric,
      payment_fee numeric
    )
    where item.inventory_item_id is not null
    order by item.inventory_item_id
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

    select sale_state into v_sale_state
    from public.inventory_item_sale_states
    where inventory_item_id = v_inventory_item.id
      and workspace_id = p_workspace_id;

    if v_inventory_item.status not in ('ready', 'listed')
      or v_sale_state is distinct from 'no_active_sale' then
      raise exception using errcode = '22023', message = 'Der Einzelartikel ist nicht verkaufbar.';
    end if;
  end loop;

  insert into public.store_orders (
    id,
    workspace_id,
    order_number,
    customer,
    subtotal,
    shipping_cost,
    total,
    payment_method,
    payment_status,
    payment_id,
    status
  )
  values (
    p_order_id,
    p_workspace_id,
    p_order_number,
    p_customer,
    p_subtotal,
    p_shipping_cost,
    p_total,
    p_payment_method,
    p_payment_status,
    p_payment_id,
    p_status
  )
  returning * into v_order;

  insert into public.store_order_items (
    store_order_id,
    inventory_item_id,
    catalog_product_id,
    item_title,
    price,
    quantity
  )
  select
    v_order.id,
    item.inventory_item_id,
    item.catalog_product_id,
    item.item_title,
    item.price,
    item.quantity
  from jsonb_to_recordset(p_items) as item(
    catalog_product_id uuid,
    inventory_item_id uuid,
    item_title text,
    quantity integer,
    price numeric,
    payment_fee numeric
  );

  perform public.record_sale(
    p_workspace_id,
    jsonb_build_object(
      'platform', 'custom_store',
      'sale_date', p_sale_date,
      'shipping_revenue', p_shipping_cost,
      'shipping_cost', 0,
      'shipping_mode', case
        when p_customer ->> 'shippingMethod' = 'pickup' then 'pickup'
        else 'seller_arranged'
      end,
      'cost_entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'category', 'payment_fee',
          'amount', item.payment_fee
        ))
        from jsonb_to_recordset(p_items) as item(
          catalog_product_id uuid,
          inventory_item_id uuid,
          item_title text,
          quantity integer,
          price numeric,
          payment_fee numeric
        )
        where coalesce(item.payment_fee, 0) > 0
      ), '[]'::jsonb),
      'external_order_id', p_order_number,
      'buyer_notes', p_buyer_notes
    ),
    (
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'catalog_product_id', item.catalog_product_id,
        'inventory_item_id', item.inventory_item_id,
        'title_snapshot', item.item_title,
        'quantity', item.quantity,
        'unit_sale_price', item.price
      )))
      from jsonb_to_recordset(p_items) as item(
        catalog_product_id uuid,
        inventory_item_id uuid,
        item_title text,
        quantity integer,
        price numeric,
        payment_fee numeric
      )
    )
  );

  return v_order;
end;
$function$;

create function public.prepare_beta_invitation (
  p_application_id uuid,
  p_request_id     uuid,
  p_token_hash     text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_application public.beta_applications; v_operation public.beta_lifecycle_operations; v_expires_at timestamptz:=now()+interval '168 hours';
begin
  v_operation:=public.claim_beta_lifecycle_operation(p_application_id,p_request_id,'invite');
  if v_operation.status='succeeded' then return v_operation.result || '{"replayed":true}'::jsonb; end if;
  select * into v_application from public.beta_applications where id=p_application_id;
  if v_application.status<>'accepted' or v_application.registered_at is not null or v_application.revoked_at is not null then
    raise exception 'Bewerbung kann nicht eingeladen werden' using errcode='22023';
  end if;
  update public.beta_registration_links set revoked_at=now() where application_id=p_application_id and revoked_at is null;
  insert into public.beta_registration_links(application_id,token_hash,expires_at) values(p_application_id,p_token_hash,v_expires_at);
  update public.beta_applications set registration_link_kind='managed',invitation_status='sending',
    invitation_expires_at=v_expires_at,invitation_sent_at=now(),invitation_last_error=null where id=p_application_id;
  update public.beta_lifecycle_operations set result=jsonb_build_object('expires_at',v_expires_at,'token_hash',p_token_hash)
    where request_id=p_request_id;
  return jsonb_build_object('expires_at',v_expires_at,'replayed',false,'lease_id',v_operation.lease_id);
end;
$function$;

revoke all on function public.prepare_beta_invitation(uuid, uuid, text) from public;

grant all on function public.prepare_beta_invitation(uuid, uuid, text) to service_role;

create function public.prepare_beta_withdrawal (
  p_application_id uuid,
  p_request_id     uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_application public.beta_applications; v_operation public.beta_lifecycle_operations; v_workspace_id uuid; v_user_id uuid;
begin
  -- Die erfolgreiche Wiederholung bleibt auch nach gelöschter Bewerbung erkennbar.
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  if found and v_operation.action='withdraw' and v_operation.status='succeeded'
    and v_operation.result->>'application_id'=p_application_id::text then return '{"replayed":true}'::jsonb; end if;
  v_operation:=public.claim_beta_lifecycle_operation(p_application_id,p_request_id,'withdraw');
  select * into v_application from public.beta_applications where id=p_application_id;
  if v_application.status<>'accepted' or v_application.registered_at is not null then
    raise exception 'Nur ausstehende Registrierungen können zurückgezogen werden' using errcode='22023'; end if;
  v_user_id:=coalesce(v_application.withdrawal_user_id,v_application.auth_user_id);
  select workspace_id into v_workspace_id from public.workspace_licenses where beta_application_id=p_application_id and status='pending' for update;
  v_workspace_id:=coalesce(v_application.withdrawal_workspace_id,v_workspace_id);
  if exists(select 1 from public.platform_operators where user_id=v_user_id)
    or exists(select 1 from public.workspace_licenses where beta_application_id=p_application_id and status<>'pending')
    or (v_application.registration_link_kind='legacy' and exists(select 1 from auth.users where id=v_user_id and nullif(encrypted_password,'') is not null))
    or exists(select 1 from public.workspace_members where user_id=v_user_id and workspace_id is distinct from v_workspace_id)
    or exists(select 1 from public.workspace_members where workspace_id=v_workspace_id and (user_id<>v_user_id or role<>'owner'))
    or public.workspace_has_business_data(v_workspace_id) then
    raise exception 'Das Konto wird bereits verwendet und kann nicht als offene Registrierung gelöscht werden' using errcode='22023'; end if;
  update public.beta_applications set revoked_at=coalesce(revoked_at,now()),withdrawal_user_id=v_user_id,
    withdrawal_workspace_id=v_workspace_id,withdrawal_status='revoked',withdrawal_last_error=null where id=p_application_id;
  update public.beta_registration_links set revoked_at=coalesce(revoked_at,now()) where application_id=p_application_id;
  update public.beta_lifecycle_operations set result=jsonb_build_object('application_id',p_application_id,'user_id',v_user_id,'workspace_id',v_workspace_id) where request_id=p_request_id;
  return jsonb_build_object('user_id',v_user_id,'workspace_id',v_workspace_id,'lease_id',v_operation.lease_id,'replayed',false);
end;
$function$;

revoke all on function public.prepare_beta_withdrawal(uuid, uuid) from public;

grant all on function public.prepare_beta_withdrawal(uuid, uuid) to service_role;

create or replace function public.prepare_listing (
  p_workspace_id       uuid,
  p_inventory_item_id  uuid  default null::uuid,
  p_content            jsonb default '{}'::jsonb,
  p_catalog_product_id uuid  default null::uuid
)
  returns public.listings
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_workspace public.workspaces;
  v_item public.inventory_items;
  v_product public.catalog_products;
  v_listing public.listings;
  v_content jsonb;
  v_available_qty integer;
begin
  if not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.';
  end if;
  select * into v_workspace from public.workspaces where id = p_workspace_id for share;
  if v_workspace.id is null or v_workspace.archived_at is not null then
    raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
  end if;
  if (p_inventory_item_id is null and p_catalog_product_id is null)
     or (p_inventory_item_id is not null and p_catalog_product_id is not null) then
    raise exception using errcode = '22023', message = 'Genau ein Ziel (Artikel oder Katalogprodukt) muss angegeben werden.';
  end if;
  v_content := public.validate_listing_content(p_content);

  if p_inventory_item_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_inventory_item_id::text || ':kleinanzeigen', 0));
    select * into v_item from public.inventory_items where id = p_inventory_item_id and workspace_id = p_workspace_id for update;
    if v_item.id is null then raise exception using errcode = '22023', message = 'Der Artikel gehört nicht zu diesem Workspace.'; end if;
    if v_item.archived_at is not null or v_item.status in ('reserved', 'sold', 'defective', 'archived') then
      raise exception using errcode = '22023', message = 'Dieser Artikel kann nicht inseriert werden.';
    end if;

    select * into v_listing from public.listings
      where workspace_id = p_workspace_id and inventory_item_id = p_inventory_item_id and platform = 'kleinanzeigen'
      order by updated_at desc, id desc limit 1 for update;

    if v_listing.id is null then
      insert into public.listings(workspace_id, inventory_item_id, catalog_product_id, title, description, price, price_type, shipping_type, shipping_price, postal_code, listed_count, last_listed_at, item_details)
      values (p_workspace_id, p_inventory_item_id, null, v_content ->> 'title', v_content ->> 'description',
        (v_content ->> 'price')::numeric, v_content ->> 'priceType', v_content ->> 'shippingType',
        nullif(v_content ->> 'shippingPrice', '')::numeric, nullif(v_content ->> 'postalCode', ''), 1, statement_timestamp(), v_content -> 'itemDetails')
      returning * into v_listing;
    elsif v_listing.status = 'ended' and v_listing.end_reason = 'sold' then
      raise exception using errcode = '22023', message = 'Ein nach Verkauf beendetes Inserat kann nicht erneut eingestellt werden.';
    else
      update public.listings set title = v_content ->> 'title', description = v_content ->> 'description',
        price = (v_content ->> 'price')::numeric, price_type = v_content ->> 'priceType', shipping_type = v_content ->> 'shippingType',
        shipping_price = nullif(v_content ->> 'shippingPrice', '')::numeric, postal_code = nullif(v_content ->> 'postalCode', ''),
        item_details = v_content -> 'itemDetails',
        status = 'prepared', end_reason = null, ended_at = null, online_since = null,
        listed_count = listed_count + 1, last_listed_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_catalog_product_id::text || ':kleinanzeigen', 0));
    select * into v_product from public.catalog_products where id = p_catalog_product_id and workspace_id = p_workspace_id for update;
    if v_product.id is null then raise exception using errcode = '22023', message = 'Das Produkt gehört nicht zu diesem Workspace.'; end if;
    if v_product.archived_at is not null then
      raise exception using errcode = '22023', message = 'Dieses Produkt ist archiviert.';
    end if;

    select coalesce(sum(remaining_quantity), 0) into v_available_qty
      from public.stock_lots
      where workspace_id = p_workspace_id and catalog_product_id = p_catalog_product_id;
    if v_available_qty <= 0 then
      raise exception using errcode = '22023', message = 'Für dieses Produkt ist kein verfügbarer Bestand vorhanden.';
    end if;

    select * into v_listing from public.listings
      where workspace_id = p_workspace_id and catalog_product_id = p_catalog_product_id and platform = 'kleinanzeigen'
      order by updated_at desc, id desc limit 1 for update;

    if v_listing.id is null then
      insert into public.listings(workspace_id, inventory_item_id, catalog_product_id, title, description, price, price_type, shipping_type, shipping_price, postal_code, listed_count, last_listed_at, item_details)
      values (p_workspace_id, null, p_catalog_product_id, v_content ->> 'title', v_content ->> 'description',
        (v_content ->> 'price')::numeric, v_content ->> 'priceType', v_content ->> 'shippingType',
        nullif(v_content ->> 'shippingPrice', '')::numeric, nullif(v_content ->> 'postalCode', ''), 1, statement_timestamp(), v_content -> 'itemDetails')
      returning * into v_listing;
    else
      update public.listings set title = v_content ->> 'title', description = v_content ->> 'description',
        price = (v_content ->> 'price')::numeric, price_type = v_content ->> 'priceType', shipping_type = v_content ->> 'shippingType',
        shipping_price = nullif(v_content ->> 'shippingPrice', '')::numeric, postal_code = nullif(v_content ->> 'postalCode', ''),
        item_details = v_content -> 'itemDetails',
        status = 'prepared', end_reason = null, ended_at = null, online_since = null,
        listed_count = listed_count + 1, last_listed_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    end if;
  end if;

  return v_listing;
end;
$function$;

create or replace function public.preview_purchase_cost_repair (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_classification text;
  v_reason text;
  v_costs jsonb;
  v_items jsonb;
  v_sales jsonb;
  v_state jsonb;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if (select auth.uid()) is null or not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin', 'accountant')
  ) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für die Kostenprüfung.';
  end if;

  select * into v_purchase from public.purchases
  where workspace_id = p_workspace_id and id = p_purchase_id;
  if not found then
    raise exception using errcode = '42501', message = 'Der Einkauf ist nicht zugänglich.';
  end if;

  select classification, reason into v_classification, v_reason
  from public.preview_purchase_costing_legacy(p_workspace_id)
  where purchase_id = p_purchase_id;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
  into v_costs from public.purchase_costs c
  where c.workspace_id = p_workspace_id and c.purchase_id = p_purchase_id;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)
  into v_items from public.inventory_items i
  where i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id;
  select coalesce(jsonb_agg(jsonb_build_object('line', to_jsonb(l), 'sale', to_jsonb(s)) order by l.id), '[]'::jsonb)
  into v_sales from public.sale_lines l
  join public.sales s on s.id = l.sale_id and s.workspace_id = l.workspace_id
  join public.inventory_items i on i.id = l.inventory_item_id and i.workspace_id = l.workspace_id
  where i.workspace_id = p_workspace_id and i.purchase_id = p_purchase_id;

  v_state := jsonb_build_object('purchase', to_jsonb(v_purchase), 'costs', v_costs, 'items', v_items, 'sales', v_sales);
  return jsonb_build_object(
    'purchaseId', p_purchase_id,
    'purchasePrice', v_purchase.purchase_price,
    'costs', v_costs,
    'items', v_items,
    'classification', coalesce(v_classification, 'already_finalized'),
    'reason', coalesce(v_reason, 'Die Einkaufskosten wurden bereits abgeschlossen.'),
    'fingerprint', md5(v_state::text)
  );
end;
$function$;

create or replace function public.preview_purchase_costing_legacy (
  p_workspace_id uuid
)
  returns table (
    purchase_id    uuid,
    classification text,
    reason         text,
    item_count     bigint,
    line_count     bigint
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_privileged boolean := false;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null or p_workspace_id is null then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenprüfung.';
  end if;

  select member.role in ('owner', 'admin', 'accountant')
  into v_privileged
  from public.workspace_members as member
  where member.workspace_id = p_workspace_id
    and member.user_id = v_actor_id;

  if not found or not v_privileged then
    raise exception using
      errcode = '42501',
      message = 'Keine Berechtigung für die Altdatenprüfung.';
  end if;

  return query
  with candidates as (
    select
      purchase.id,
      purchase.type,
      purchase.purchase_price,
      coalesce(item_totals.item_count, 0) as item_count,
      coalesce(line_totals.line_count, 0) as line_count,
      coalesce(line_totals.unit_count, 0) as unit_count,
      coalesce(line_totals.max_line_quantity, 0) as max_line_quantity,
      coalesce(lot_totals.lot_count, 0) as lot_count,
      coalesce(lot_totals.invalid_timestamp_count, 0) as invalid_timestamp_count,
      coalesce(lot_totals.ambiguous_allocation_count, 0) as ambiguous_allocation_count,
      coalesce(item_totals.linked_line_count, 0) as linked_line_count,
      coalesce(item_totals.sale_conflict_count, 0) as sale_conflict_count,
      coalesce(item_totals.sale_line_count, 0) as sale_line_count,
      coalesce(item_totals.unsupported_finalize_status_count, 0) as unsupported_finalize_status_count,
      coalesce(cost_totals.invalid_cost_count, 0) as invalid_cost_count
    from public.purchases as purchase
    left join lateral (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.count(*) filter (where item.purchase_line_id is not null) as linked_line_count,
        pg_catalog.count(*) filter (
          where item.status not in ('received', 'needs_review', 'researched', 'ready')
        ) as unsupported_finalize_status_count,
        (
          select pg_catalog.count(*)
          from public.sale_lines as sale_line
          join public.inventory_items as sold_item
            on sold_item.workspace_id = sale_line.workspace_id
            and sold_item.id = sale_line.inventory_item_id
          where sold_item.workspace_id = purchase.workspace_id
            and sold_item.purchase_id = purchase.id
        ) as sale_line_count,
        pg_catalog.count(*) filter (
          where (
            item.status = 'sold'
            and (
              select pg_catalog.count(*)
              from public.sale_lines as sale_line
              join public.sales as sale
                on sale.workspace_id = sale_line.workspace_id
                and sale.id = sale_line.sale_id
              where sale_line.workspace_id = item.workspace_id
                and sale_line.inventory_item_id = item.id
                and sale.voided_at is null
                and sale.returned_at is null
            ) <> 1
          ) or (
            item.status <> 'sold'
            and exists (
              select 1
              from public.sale_lines as sale_line
              join public.sales as sale
                on sale.workspace_id = sale_line.workspace_id
                and sale.id = sale_line.sale_id
              where sale_line.workspace_id = item.workspace_id
                and sale_line.inventory_item_id = item.id
                and sale.voided_at is null
                and sale.returned_at is null
            )
          )
        ) as sale_conflict_count
      from public.inventory_items as item
      where item.workspace_id = purchase.workspace_id
        and item.purchase_id = purchase.id
    ) as item_totals on true
    left join lateral (
      select
        pg_catalog.count(*) as line_count,
        coalesce(pg_catalog.sum(line.ordered_quantity), 0) as unit_count,
        coalesce(pg_catalog.max(line.ordered_quantity), 0) as max_line_quantity
      from public.purchase_lines as line
      where line.workspace_id = purchase.workspace_id
        and line.purchase_id = purchase.id
    ) as line_totals on true
    left join lateral (
      select
        pg_catalog.count(*) as lot_count,
        pg_catalog.count(*) filter (
          where not pg_catalog.isfinite(lot.received_at)
        ) as invalid_timestamp_count,
        (
          select pg_catalog.count(*)
          from public.sale_line_lot_allocations as allocation
          join public.stock_lots as allocation_lot
            on allocation_lot.workspace_id = allocation.workspace_id
            and allocation_lot.id = allocation.stock_lot_id
          where allocation.workspace_id = purchase.workspace_id
            and allocation_lot.purchase_id = purchase.id
            and (
              allocation.consumption_sequence is null
              or allocation.active_allocated_cost is null
              or exists (
                select 1
                from public.sale_line_lot_allocations as tied_allocation
                where tied_allocation.workspace_id = allocation.workspace_id
                  and tied_allocation.stock_lot_id = allocation.stock_lot_id
                  and tied_allocation.id <> allocation.id
                  and tied_allocation.created_at = allocation.created_at
              )
            )
        ) as ambiguous_allocation_count
      from public.stock_lots as lot
      where lot.workspace_id = purchase.workspace_id
        and lot.purchase_id = purchase.id
    ) as lot_totals on true
    left join lateral (
      select pg_catalog.count(*) filter (
        where cost.amount::text in ('NaN', 'Infinity', '-Infinity')
          or cost.amount < 0
          or pg_catalog.scale(cost.amount) > 2
      ) as invalid_cost_count
      from public.purchase_costs as cost
      where cost.workspace_id = purchase.workspace_id
        and cost.purchase_id = purchase.id
    ) as cost_totals on true
    where purchase.workspace_id = p_workspace_id
      and purchase.entry_status <> 'finalized'
  )
  select
    candidate.id,
    case
      when candidate.type <> 'mystery_pack' then 'manual_review'
      when candidate.purchase_price is null
        or candidate.purchase_price::text in ('NaN', 'Infinity', '-Infinity')
        or candidate.purchase_price < 0
        or pg_catalog.scale(candidate.purchase_price) > 2 then 'manual_review'
      when candidate.line_count > 1000
        or candidate.unit_count > 100000
        or candidate.max_line_quantity > 100000 then 'manual_review'
      when candidate.line_count > 0 then 'manual_review'
      when candidate.item_count = 0 then 'items_missing'
      when candidate.item_count > 1000 then 'manual_review'
      when candidate.invalid_timestamp_count > 0 then 'manual_review'
      when candidate.ambiguous_allocation_count > 0 then 'manual_review'
      when candidate.lot_count > 0 then 'manual_review'
      when candidate.linked_line_count > 0 then 'manual_review'
      when candidate.sale_conflict_count > 0 then 'manual_review'
      when candidate.sale_line_count = 0
        and candidate.unsupported_finalize_status_count > 0 then 'manual_review'
      when candidate.invalid_cost_count > 0 then 'manual_review'
      else 'auto_repair'
    end,
    case
      when candidate.type <> 'mystery_pack'
        then 'Normaler Einkauf ohne verlässliche Einkaufspositionen.'
      when candidate.purchase_price is null
        or candidate.purchase_price::text in ('NaN', 'Infinity', '-Infinity')
        or candidate.purchase_price < 0
        or pg_catalog.scale(candidate.purchase_price) > 2
        then 'Der Warenbetrag fehlt oder ist ungültig.'
      when candidate.line_count > 1000
        or candidate.unit_count > 100000
        or candidate.max_line_quantity > 100000
        then 'Der Einkauf überschreitet die sichere Positions- oder Mengengrenze.'
      when candidate.line_count > 0
        then 'Vorhandene Einkaufspositionen müssen manuell abgeglichen werden.'
      when candidate.item_count = 0
        then 'Für die Mystery Box sind noch keine Artikel erfasst.'
      when candidate.item_count > 1000
        then 'Der Einkauf überschreitet die sichere Grenze von 1.000 Positionen.'
      when candidate.invalid_timestamp_count > 0
        then 'Mindestens ein Empfangszeitpunkt ist ungültig.'
      when candidate.ambiguous_allocation_count > 0
        then 'Die historische Losentnahmereihenfolge ist nicht eindeutig.'
      when candidate.lot_count > 0
        then 'Historische Mengenlose benötigen eine manuelle Reihenfolgeprüfung.'
      when candidate.linked_line_count > 0
        then 'Vorhandene Artikelverknüpfungen sind unvollständig.'
      when candidate.sale_conflict_count > 0
        then 'Verkaufsstatus und Verkaufspositionen sind nicht eindeutig.'
      when candidate.sale_line_count = 0
        and candidate.unsupported_finalize_status_count > 0
        then 'Der aktuelle Artikelstatus erlaubt keine automatische Kostenfinalisierung.'
      when candidate.invalid_cost_count > 0
        then 'Mindestens eine Zusatzkostenzeile ist ungültig.'
      else 'Bekannte Mystery-Artikel können gleichmäßig und centgenau verteilt werden.'
    end,
    candidate.item_count,
    candidate.line_count
  from candidates as candidate
  order by candidate.id;
end;
$function$;

create function public.protect_expired_workspace_business()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_row jsonb; v_workspace_id uuid;
begin
  foreach v_row in array case tg_op when 'INSERT' then array[to_jsonb(new)] when 'DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end loop
    if tg_nargs=0 then v_workspace_id:=(v_row->>'workspace_id')::uuid;
    else execute format('select workspace_id from public.%I where id=$1',tg_argv[0]) into v_workspace_id using (v_row->>tg_argv[1])::uuid; end if;
    if v_workspace_id is not null and not public.workspace_access_is_valid(v_workspace_id) then
      raise exception 'Dein Zugang zu diesem Workspace ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end;
$function$;

revoke all on function public.protect_expired_workspace_business() from public;

create function public.protect_pending_beta_auth_deletion()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_application public.beta_applications;
begin
  select * into v_application from public.beta_applications where withdrawal_user_id=old.id and revoked_at is not null for update;
  if not found then return old; end if;
  perform 1 from public.workspaces where id=v_application.withdrawal_workspace_id for update;
  if v_application.registered_at is not null
    or exists(select 1 from public.platform_operators where user_id=old.id)
    or exists(select 1 from public.workspace_members where user_id=old.id and workspace_id is distinct from v_application.withdrawal_workspace_id)
    or exists(select 1 from public.workspace_members where workspace_id=v_application.withdrawal_workspace_id and (user_id<>old.id or role<>'owner'))
    or public.workspace_has_business_data(v_application.withdrawal_workspace_id) then
    raise exception 'Das Konto wird bereits verwendet und kann nicht als offene Registrierung gelöscht werden' using errcode='22023'; end if;
  return old;
end;
$function$;

revoke all on function public.protect_pending_beta_auth_deletion() from public;

create or replace function public.receive_individual_purchase_line (
  p_workspace_id     uuid,
  p_purchase_id      uuid,
  p_purchase_line_id uuid,
  p_item             jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_inventory_item public.inventory_items;
  v_title text;
  v_condition text;
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or p_purchase_line_id is null
    or jsonb_typeof(p_item) <> 'object'
    or jsonb_typeof(p_item -> 'title') <> 'string' then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  v_title := btrim(p_item ->> 'title');
  if v_title = '' then
    raise exception using errcode = '22023', message = 'Die Einzelartikel-Wareneingangsdaten sind ungültig.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können keinen weiteren Wareneingang erhalten.';
  end if;
  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  select * into v_purchase_line
  from public.purchase_lines
  where id = p_purchase_line_id
    and workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
  for update;
  if not found
    or v_purchase_line.is_package
    or v_purchase_line.line_kind <> 'individual'
    or v_purchase_line.received_quantity >= v_purchase_line.ordered_quantity then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

  v_condition := case
    when v_purchase_line.condition_snapshot in (
      'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
    ) then v_purchase_line.condition_snapshot
    else 'used'
  end;

  insert into public.inventory_items (
    workspace_id, purchase_id, purchase_line_id, title, ean, condition, status,
    allocated_purchase_cost, expected_value
  ) values (
    p_workspace_id, p_purchase_id, p_purchase_line_id, v_title, v_purchase_line.ean_snapshot, v_condition, 'received',
    0, v_purchase_line.estimated_market_value
  ) returning * into v_inventory_item;

  update public.purchase_lines
  set received_quantity = received_quantity + 1, updated_at = now()
  where id = p_purchase_line_id
    and workspace_id = p_workspace_id
    and purchase_id = p_purchase_id
    and received_quantity < ordered_quantity
  returning * into v_purchase_line;

  if not found then
    raise exception using errcode = '22023', message = 'Die Einzelartikelposition ist nicht offen.';
  end if;

  v_purchase := public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);
  return jsonb_build_object(
    'purchase_line', to_jsonb(v_purchase_line),
    'inventory_item', to_jsonb(v_inventory_item),
    'purchase', to_jsonb(v_purchase)
  );
end;
$function$;

create or replace function public.receive_purchase_lines_idempotent (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_request_id   uuid,
  p_lines        jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_previous public.purchase_receipt_requests;
  v_response jsonb;
  v_archived_at timestamptz;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Eine Request-ID ist für den Wareneingang erforderlich.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('receipt:' || p_workspace_id::text || ':' || p_request_id::text, 0)
  );
  select * into v_previous from public.purchase_receipt_requests
    where workspace_id = p_workspace_id and request_id = p_request_id;
  if found then
    if v_previous.purchase_id is distinct from p_purchase_id
      or v_previous.request_lines is distinct from p_lines then
      raise exception using errcode = '22023', message = 'Die Request-ID wurde bereits für einen anderen Wareneingang verwendet.';
    end if;
    return v_previous.response;
  end if;

  -- Archivierung und Buchung werden bis Transaktionsende gegeneinander gesperrt.
  select archived_at into v_archived_at from public.workspaces
    where id = p_workspace_id for share;
  if v_archived_at is not null then
    raise exception using errcode = '55000', message = 'Der Workspace ist archiviert.';
  end if;

  -- Der vorhandene Kern hält Einkaufs-/Positionslocks, Mengenprüfung und Ereignisse atomar.
  v_response := public.receive_purchase_lines(p_workspace_id, p_purchase_id, p_lines);
  insert into public.purchase_receipt_requests(id,workspace_id,purchase_id,request_id,request_lines,response)
    values (gen_random_uuid(),p_workspace_id,p_purchase_id,p_request_id,p_lines,v_response);
  return v_response;
end;
$function$;

create or replace function public.receive_purchase_lines (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_lines        jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_input_line jsonb;
  v_purchase public.purchases;
  v_purchase_line public.purchase_lines;
  v_stock_lot public.stock_lots;
  v_purchase_line_id uuid;
  v_received_quantity integer;
  v_received_at timestamptz;
  v_purchase_line_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Die Wareneingangsdaten sind ungültig.';
  end if;

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  for v_input_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_input_line) <> 'object'
      or pg_catalog.jsonb_typeof(v_input_line -> 'purchase_line_id') <> 'string'
      or pg_catalog.jsonb_typeof(v_input_line -> 'received_quantity') <> 'number'
      or (v_input_line ->> 'received_quantity') !~ '^[1-9][0-9]*$'
      or pg_catalog.jsonb_typeof(v_input_line -> 'received_at') <> 'string' then
      raise exception using errcode = '22023', message = 'Eine Wareneingangsposition ist ungültig.';
    end if;

    begin
      v_received_at := (v_input_line ->> 'received_at')::timestamptz;
    exception
      when others then
        raise exception using
          errcode = '22023',
          message = 'Eine Wareneingangsposition ist ungültig.';
    end;

    if not pg_catalog.isfinite(v_received_at) then
      raise exception using
        errcode = '22023',
        message = 'Der Empfangszeitpunkt muss ein endlicher Zeitpunkt sein.';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;
  if v_purchase.entry_status = 'finalized' then
    raise exception using errcode = '22023', message = 'Finalisierte Einkäufe können keinen weiteren Wareneingang erhalten.';
  end if;
  if public.purchase_has_open_prices(p_workspace_id, p_purchase_id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor dem Wareneingang ergänzt werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  for v_input_line in
    select element.value
    from jsonb_array_elements(p_lines) as element(value)
  loop
    if jsonb_typeof(v_input_line) <> 'object'
      or jsonb_typeof(v_input_line -> 'purchase_line_id') <> 'string'
      or jsonb_typeof(v_input_line -> 'received_quantity') <> 'number'
      or (v_input_line ->> 'received_quantity') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_input_line -> 'received_at') <> 'string' then
      raise exception using errcode = '22023', message = 'Eine Wareneingangsposition ist ungültig.';
    end if;

    v_purchase_line_id := (v_input_line ->> 'purchase_line_id')::uuid;
    v_received_quantity := (v_input_line ->> 'received_quantity')::integer;
    v_received_at := (v_input_line ->> 'received_at')::timestamptz;

    select * into v_purchase_line
    from public.purchase_lines
    where id = v_purchase_line_id
      and workspace_id = p_workspace_id
      and purchase_id = p_purchase_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Die Einkaufsposition wurde nicht gefunden.';
    end if;

    if v_purchase_line.line_kind = 'individual' then
      raise exception using errcode = '22023', message = 'Einzelartikel werden über den expliziten Einzelartikelpfad eingebucht.';
    end if;

    if v_purchase_line.line_kind <> 'quantity'
      or v_purchase_line.catalog_product_id is null
      or not exists (
        select 1
        from public.catalog_products as product
        where product.workspace_id = p_workspace_id
          and product.id = v_purchase_line.catalog_product_id
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufsposition ist keinem gültigen Mengenprodukt zugeordnet.';
    end if;

    if v_purchase_line.received_quantity + v_received_quantity > v_purchase_line.ordered_quantity then
      raise exception using errcode = '22023', message = 'Die empfangene Menge überschreitet die bestellte Menge.';
    end if;

    update public.purchase_lines
    set received_quantity = received_quantity + v_received_quantity,
        updated_at = now()
    where id = v_purchase_line.id
      and workspace_id = p_workspace_id
    returning * into v_purchase_line;

    insert into public.stock_lots (
      workspace_id,
      purchase_id,
      purchase_line_id,
      catalog_product_id,
      received_quantity,
      remaining_quantity,
      unit_cost,
      received_at
    ) values (
      p_workspace_id,
      p_purchase_id,
      v_purchase_line.id,
      v_purchase_line.catalog_product_id,
      v_received_quantity,
      v_received_quantity,
      null,
      v_received_at
    )
    returning * into v_stock_lot;

    insert into public.stock_movements (
      workspace_id,
      stock_lot_id,
      direction,
      quantity,
      reason
    ) values (
      p_workspace_id,
      v_stock_lot.id,
      'in',
      v_received_quantity,
      'receipt'
    );

    v_purchase_line_ids := array_append(v_purchase_line_ids, v_purchase_line.id);
    v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);
  end loop;

  perform public.refresh_purchase_receiving_status(p_workspace_id, p_purchase_id);

  return jsonb_build_object(
    'purchase_lines', coalesce((
      select jsonb_agg(to_jsonb(purchase_line) order by purchase_line.id)
      from public.purchase_lines as purchase_line
      where purchase_line.id = any(v_purchase_line_ids)
    ), '[]'::jsonb),
    'stock_lots', coalesce((
      select jsonb_agg(to_jsonb(stock_lot) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.record_legacy_inventory_sale (
  p_workspace_id      uuid,
  p_inventory_item_id uuid,
  p_sale              jsonb,
  p_reason            text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
  v_unit_sale_price numeric(12, 2);
  v_workspace_tax_mode text;
  v_shipping_revenue numeric(12,2) := 0;
  v_shipping_mode text;
  v_cost_entries jsonb := '[]'::jsonb;
  v_cost_entry jsonb;
  v_packaging_cost numeric(12,2) := 0;
  v_other_costs numeric(12,2) := 0;
  v_money_key text;
begin
  if v_actor_id is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Ein dokumentierter Klaerungsgrund ist erforderlich.';
  end if;

  if jsonb_typeof(p_sale) <> 'object'
    or nullif(trim(p_sale ->> 'platform'), '') is null
    or (p_sale ->> 'sale_date') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_sale -> 'unit_sale_price') <> 'number'
    or (p_sale ->> 'unit_sale_price') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
    or (p_sale ->> 'unit_sale_price')::numeric <= 0 then
    raise exception using errcode = '22023', message = 'Die Verkaufsdaten sind ungueltig.';
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

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
  end if;

  if v_inventory_item.archived_at is not null then
    raise exception using errcode = '22023', message = 'Dieser Artikel ist archiviert.';
  end if;

  select sale_state
  into v_sale_state
  from public.inventory_item_sale_states
  where inventory_item_id = p_inventory_item_id
    and workspace_id = p_workspace_id;

  if v_sale_state <> 'legacy_sold_unverified' then
    raise exception using errcode = '22023', message = 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.';
  end if;

  select tax_mode into v_workspace_tax_mode
  from public.workspaces
  where id = p_workspace_id;
  v_unit_sale_price := (p_sale ->> 'unit_sale_price')::numeric(12, 2);

  insert into public.sales (
    workspace_id, inventory_item_id, platform, sale_price, sale_price_total, sale_date,
    platform_fee, shipping_cost, packaging_cost, other_costs, shipping_revenue, shipping_mode,
    external_order_id, external_listing_id, buyer_notes
  ) values (
    p_workspace_id, null, trim(p_sale ->> 'platform'),
    v_unit_sale_price + v_shipping_revenue, v_unit_sale_price + v_shipping_revenue, (p_sale ->> 'sale_date')::date,
    coalesce((p_sale ->> 'platform_fee')::numeric, 0),
    coalesce((p_sale ->> 'shipping_cost')::numeric, 0),
    v_packaging_cost,
    v_other_costs,
    v_shipping_revenue,
    v_shipping_mode,
    nullif(trim(p_sale ->> 'external_order_id'), ''),
    nullif(trim(p_sale ->> 'external_listing_id'), ''),
    nullif(trim(p_sale ->> 'buyer_notes'), '')
  ) returning * into v_sale;

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

  insert into public.sale_lines (
    workspace_id, sale_id, inventory_item_id, title_snapshot, quantity,
    unit_sale_price, line_total, cost_of_goods_sold, tax_mode
  ) values (
    p_workspace_id, v_sale.id, p_inventory_item_id,
    coalesce(nullif(trim(p_sale ->> 'title_snapshot'), ''), v_inventory_item.title),
    1, v_unit_sale_price, v_unit_sale_price,
    v_inventory_item.allocated_purchase_cost + coalesce((
      select pg_catalog.sum(cost.amount) from public.item_costs as cost
      where cost.inventory_item_id = v_inventory_item.id
    ), 0), v_workspace_tax_mode
  ) returning * into v_sale_line;

  update public.sales
  set inventory_item_id = p_inventory_item_id
  where id = v_sale.id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.inventory_reconciliation_events (
    workspace_id, inventory_item_id, actor_id, event_type,
    previous_status, new_status, reason
  ) values (
    p_workspace_id, p_inventory_item_id, v_actor_id, 'record_legacy_sale',
    'sold', 'sold', trim(p_reason)
  ) returning * into v_event;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'cost_entries', coalesce((
      select jsonb_agg(to_jsonb(cost_entry) order by cost_entry.id)
      from public.sale_cost_entries as cost_entry
      where cost_entry.sale_id = v_sale.id
    ), '[]'::jsonb),
    'sale_lines', jsonb_build_array(to_jsonb(v_sale_line)),
    'lot_allocations', '[]'::jsonb,
    'stock_movements', '[]'::jsonb,
    'event', to_jsonb(v_event)
  );
end;
$function$;

create or replace function public.record_sale_return (
  p_workspace_id   uuid,
  p_sale_id        uuid,
  p_refund_amount  numeric,
  p_restock        boolean,
  p_reason         text,
  p_notes          text,
  p_restock_action text,
  p_buyer_name     text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_sale public.sales;
  v_sale_line public.sale_lines;
  v_allocation public.sale_line_lot_allocations;
  v_stock_lot public.stock_lots;
  v_inventory_item public.inventory_items;
  v_return_movement_ids uuid[] := array[]::uuid[];
  v_stock_lot_ids uuid[] := array[]::uuid[];
  v_movement_id uuid;
  v_return public.returns;
  v_return_inventory_item_id uuid;
  v_source_purchase_id uuid;
  v_locked_purchase_ids uuid[] := array[]::uuid[];
  v_fresh_purchase_ids uuid[] := array[]::uuid[];
  v_restocked_quantity integer := 0;
  v_sale_total numeric;
  v_current_refund numeric;
  v_remaining_refundable numeric;
  v_total_refund numeric;
  v_is_full_refund boolean;
  v_previous_returned_at timestamptz;
  v_correlation_id uuid := gen_random_uuid();
  v_sale_event_id uuid;
  v_return_event_id uuid;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_sale_id is null
    or p_refund_amount is null
    or p_restock is null
    or nullif(trim(p_reason), '') is null
    or p_restock_action is null
    or p_restock_action not in ('restock_ready', 'restock_repair', 'write_off', 'keep_with_buyer') then
    raise exception using errcode = '22023', message = 'Die Retourendaten sind ungültig.';
  end if;

  if p_refund_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_refund_amount < 0
    or pg_catalog.scale(p_refund_amount) > 2 then
    raise exception using
      errcode = '22023',
      message = 'Der Erstattungsbetrag muss centgenau und nicht negativ sein.';
  end if;

  if (p_restock and p_restock_action not in ('restock_ready', 'restock_repair'))
    or (not p_restock and p_restock_action not in ('write_off', 'keep_with_buyer')) then
    raise exception using
      errcode = '22023',
      message = 'Wiedereinlagerung und Retourenaktion widersprechen sich.';
  end if;

  -- Cost correction and reopen serialize on purchase before touching lots or
  -- sales. Resolve the immutable sale sources first and take the same sorted
  -- advisory/row-lock prefix so neither path can hold sale while waiting lot.
  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_locked_purchase_ids
  from (
    select lot.purchase_id
    from public.sale_lines as sale_line
    join public.sale_line_lot_allocations as allocation
      on allocation.workspace_id = sale_line.workspace_id
      and allocation.sale_line_id = sale_line.id
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id

    union

    select coalesce(item.purchase_id, purchase_line.purchase_id) as purchase_id
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as purchase_line
      on purchase_line.workspace_id = item.workspace_id
      and purchase_line.id = item.purchase_line_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id
  ) as source
  where source.purchase_id is not null;

  foreach v_source_purchase_id in array v_locked_purchase_ids loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_source_purchase_id::text, 0)
    );

    perform purchase.id
    from public.purchases as purchase
    where purchase.workspace_id = p_workspace_id
      and purchase.id = v_source_purchase_id
    for update;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'Die Einkaufszuordnung der Retoure wurde parallel geändert.';
    end if;
  end loop;

  select * into v_sale
  from public.sales
  where id = p_sale_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Verkauf wurde nicht gefunden.';
  end if;

  select coalesce(
    pg_catalog.array_agg(source.purchase_id order by source.purchase_id),
    array[]::uuid[]
  )
  into v_fresh_purchase_ids
  from (
    select lot.purchase_id
    from public.sale_lines as sale_line
    join public.sale_line_lot_allocations as allocation
      on allocation.workspace_id = sale_line.workspace_id
      and allocation.sale_line_id = sale_line.id
    join public.stock_lots as lot
      on lot.workspace_id = allocation.workspace_id
      and lot.id = allocation.stock_lot_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id

    union

    select coalesce(item.purchase_id, purchase_line.purchase_id) as purchase_id
    from public.sale_lines as sale_line
    join public.inventory_items as item
      on item.workspace_id = sale_line.workspace_id
      and item.id = sale_line.inventory_item_id
    left join public.purchase_lines as purchase_line
      on purchase_line.workspace_id = item.workspace_id
      and purchase_line.id = item.purchase_line_id
    where sale_line.workspace_id = p_workspace_id
      and sale_line.sale_id = p_sale_id
  ) as source
  where source.purchase_id is not null;

  if v_fresh_purchase_ids is distinct from v_locked_purchase_ids then
    raise exception using
      errcode = '40001',
      message = 'Die Einkaufszuordnung der Retoure wurde parallel geändert.';
  end if;

  if v_sale.returned_at is not null then
    raise exception using errcode = '22023', message = 'Der Verkauf wurde bereits retourniert.';
  end if;

  if v_sale.voided_at is not null
    or v_sale.voided_by is not null
    or v_sale.void_reason is not null then
    raise exception using errcode = '22023', message = 'Ein aufgehobener Verkauf kann nicht retourniert werden.';
  end if;

  v_sale_total := coalesce(v_sale.sale_price_total, v_sale.sale_price, 0);
  v_current_refund := coalesce(v_sale.refund_amount, 0);
  v_previous_returned_at := v_sale.returned_at;

  if v_sale_total::text in ('NaN', 'Infinity', '-Infinity')
    or v_current_refund::text in ('NaN', 'Infinity', '-Infinity')
    or v_sale_total < 0
    or v_current_refund < 0
    or v_current_refund > v_sale_total then
    raise exception using
      errcode = '22023',
      message = 'Der bisherige Erstattungsstand muss vor der Retoure geprüft werden.';
  end if;

  v_remaining_refundable := v_sale_total - v_current_refund;
  if p_refund_amount > v_remaining_refundable then
    raise exception using
      errcode = '22023',
      message = 'Der Erstattungsbetrag überschreitet den noch offenen Verkaufsbetrag.';
  end if;

  v_total_refund := v_current_refund + p_refund_amount;
  v_is_full_refund := v_total_refund = v_sale_total;

  if v_is_full_refund then
    select sale_line.inventory_item_id into v_return_inventory_item_id
  from public.sale_lines as sale_line
  where sale_line.workspace_id = p_workspace_id
    and sale_line.sale_id = p_sale_id
    and sale_line.inventory_item_id is not null
  order by sale_line.id
  limit 1;

    for v_sale_line in
      select *
      from public.sale_lines
      where workspace_id = p_workspace_id
        and sale_id = p_sale_id
    loop
    if v_sale_line.catalog_product_id is not null then
      for v_allocation in
        select *
        from public.sale_line_lot_allocations
        where workspace_id = p_workspace_id
          and sale_line_id = v_sale_line.id
      loop
        select * into v_stock_lot
        from public.stock_lots
        where id = v_allocation.stock_lot_id
          and workspace_id = p_workspace_id
        for update;

        if not found then
          raise exception using errcode = 'P0002', message = 'Das zugeordnete Bestandslos wurde nicht gefunden.';
        end if;

        if p_restock then
          update public.stock_lots
          set remaining_unit_costs = case
                when v_allocation.active_unit_costs is null
                  or (remaining_quantity > 0 and remaining_unit_costs is null) then null
                else coalesce(remaining_unit_costs, array[]::numeric[]) || v_allocation.active_unit_costs end,
              remaining_tax_unit_costs = case
                when v_allocation.active_tax_unit_costs is null
                  or (remaining_quantity > 0 and remaining_tax_unit_costs is null) then null
                else coalesce(remaining_tax_unit_costs, array[]::numeric[]) || v_allocation.active_tax_unit_costs end,
              remaining_quantity = remaining_quantity + v_allocation.quantity
          where id = v_stock_lot.id
            and workspace_id = p_workspace_id;
          v_restocked_quantity := v_restocked_quantity + v_allocation.quantity;
        end if;

        update public.sale_line_lot_allocations
        set active_tax_unit_costs = case when p_restock then array[]::numeric[] else active_tax_unit_costs end,
            active_unit_costs = case when p_restock then array[]::numeric[] else active_unit_costs end,
            active_allocated_cost = case
          when p_restock then 0
          else allocated_cost
        end
        where workspace_id = p_workspace_id
          and id = v_allocation.id;

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
          'in',
          v_allocation.quantity,
          'return'
        )
        returning id into v_movement_id;

        v_return_movement_ids := array_append(v_return_movement_ids, v_movement_id);
        v_stock_lot_ids := array_append(v_stock_lot_ids, v_stock_lot.id);

        if not p_restock then
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
            v_allocation.quantity,
            'damage'
          )
          returning id into v_movement_id;

          v_return_movement_ids := array_append(v_return_movement_ids, v_movement_id);
        end if;
      end loop;
    else
      select * into v_inventory_item
      from public.inventory_items
      where id = v_sale_line.inventory_item_id
        and workspace_id = p_workspace_id
      for update;

      if not found then
        raise exception using errcode = 'P0002', message = 'Der retournierte Einzelartikel wurde nicht gefunden.';
      end if;

      perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

      update public.inventory_items
      set status = case when p_restock then 'ready' else 'returned' end,
          updated_at = now()
      where id = v_inventory_item.id
        and workspace_id = p_workspace_id;
      if p_restock then
        v_restocked_quantity := v_restocked_quantity + 1;
      end if;
    end if;
    end loop;
  end if;

  update public.sales
  set returned_at = case when v_is_full_refund then now() else null end,
      refund_amount = v_total_refund
  where id = p_sale_id
    and workspace_id = p_workspace_id
  returning * into v_sale;

  insert into public.returns (
    workspace_id,
    sale_id,
    inventory_item_id,
    credit_note_number,
    return_date,
    reason,
    refund_amount,
    is_full_refund,
    restock_action,
    buyer_name,
    notes
  ) values (
    p_workspace_id,
    p_sale_id,
    v_return_inventory_item_id,
    'GS-' || to_char(current_date, 'YYYY') || '-' || upper(substr(gen_random_uuid()::text, 1, 8)),
    current_date,
    p_reason,
    p_refund_amount,
    v_is_full_refund,
    p_restock_action,
    nullif(trim(p_buyer_name), ''),
    nullif(trim(p_notes), '')
  )
  returning * into v_return;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    reason,
    changes,
    correlation_id
  ) values (
    p_workspace_id,
    'sale',
    v_sale.id,
    'sale_refund_updated',
    (select auth.uid()),
    p_reason,
    pg_catalog.jsonb_build_object(
      'refund_amount', pg_catalog.jsonb_build_object(
        'before', v_current_refund,
        'after', v_total_refund
      ),
      'returned_at', pg_catalog.jsonb_build_object(
        'before', v_previous_returned_at,
        'after', v_sale.returned_at
      )
    ),
    v_correlation_id
  )
  returning id into v_sale_event_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    reason,
    changes,
    correlation_id
  ) values (
    p_workspace_id,
    'return',
    v_return.id,
    'sale_return_recorded',
    (select auth.uid()),
    p_reason,
    pg_catalog.jsonb_build_object(
      'sale_id', pg_catalog.jsonb_build_object('before', null, 'after', v_sale.id),
      'refund_amount', pg_catalog.jsonb_build_object('before', null, 'after', p_refund_amount),
      'is_full_refund', pg_catalog.jsonb_build_object('before', null, 'after', v_is_full_refund),
      'restock_action', pg_catalog.jsonb_build_object('before', null, 'after', p_restock_action),
      'restocked_quantity', pg_catalog.jsonb_build_object('before', null, 'after', v_restocked_quantity)
    ),
    v_correlation_id
  )
  returning id into v_return_event_id;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'return', to_jsonb(v_return),
    'business_event_ids', jsonb_build_array(v_sale_event_id, v_return_event_id),
    'sale_lines', coalesce((
      select jsonb_agg(to_jsonb(sale_line) order by sale_line.id)
      from public.sale_lines as sale_line
      where sale_line.workspace_id = p_workspace_id
        and sale_line.sale_id = p_sale_id
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.id)
      from public.stock_movements as movement
      where movement.id = any(v_return_movement_ids)
    ), '[]'::jsonb),
    'lot_allocations', coalesce((
      select jsonb_agg(to_jsonb(allocation) order by allocation.id)
      from public.sale_line_lot_allocations as allocation
      join public.sale_lines as sale_line on sale_line.id = allocation.sale_line_id
      where sale_line.workspace_id = p_workspace_id
        and sale_line.sale_id = p_sale_id
    ), '[]'::jsonb),
    'stock_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stock_lot_id', stock_lot.id,
        'remaining_quantity', stock_lot.remaining_quantity
      ) order by stock_lot.received_at, stock_lot.id)
      from public.stock_lots as stock_lot
      where stock_lot.id = any(v_stock_lot_ids)
    ), '[]'::jsonb),
    'reason', p_reason,
    'notes', p_notes,
    'restocked', p_restock,
    'restocked_quantity', v_restocked_quantity
  );
end;
$function$;

create or replace function public.record_sale (
  p_workspace_id uuid,
  p_sale         jsonb,
  p_lines        jsonb
)
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
    or not (select public.can_access_workspace(p_workspace_id)) then
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
$function$;

create or replace function public.reopen_purchase_costing (
  p_workspace_id uuid,
  p_purchase_id  uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_purchase public.purchases;
  v_before_purchase jsonb;
  v_after_purchase jsonb;
  v_before_lines jsonb;
  v_after_lines jsonb;
  v_before_items jsonb;
  v_after_items jsonb;
  v_before_lots jsonb;
  v_after_lots jsonb;
  v_event_id uuid;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  v_line_count integer := 0;
  v_total_units bigint := 0;
  v_max_line_units integer := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_sale_history_state text;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor_id is null
    or p_workspace_id is null
    or p_purchase_id is null
    or not exists (
      select 1
      from public.workspace_members as member
      where member.workspace_id = p_workspace_id
        and member.user_id = v_actor_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status <> 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Nur ein finalisierter Einkauf kann wieder geöffnet werden.';
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(line.ordered_quantity), 0),
    coalesce(pg_catalog.max(line.ordered_quantity), 0)
  into v_line_count, v_total_units, v_max_line_units
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  if v_line_count > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  if v_max_line_units > v_max_purchase_units
    or v_total_units > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  perform line.id
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
  order by line.created_at, line.id
  for update;

  perform cost.id
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id
  order by cost.created_at, cost.id
  for update;

  perform item.id
  from public.inventory_items as item
  left join public.purchase_lines as linked_line
    on linked_line.id = item.purchase_line_id
  where item.workspace_id = p_workspace_id
    and (
      item.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by item.created_at, item.id
  for update of item;

  perform lot.id
  from public.stock_lots as lot
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where lot.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by lot.received_at, lot.id
  for update of lot;

  perform sale_line.id
  from public.sale_lines as sale_line
  join public.inventory_items as item
    on item.workspace_id = sale_line.workspace_id
    and item.id = sale_line.inventory_item_id
  left join public.purchase_lines as linked_line
    on linked_line.id = item.purchase_line_id
  where sale_line.workspace_id = p_workspace_id
    and (
      item.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by sale_line.created_at, sale_line.id
  for update of sale_line;

  perform allocation.id
  from public.sale_line_lot_allocations as allocation
  join public.stock_lots as lot
    on lot.workspace_id = allocation.workspace_id
    and lot.id = allocation.stock_lot_id
  left join public.purchase_lines as linked_line
    on linked_line.id = lot.purchase_line_id
  where allocation.workspace_id = p_workspace_id
    and (
      lot.purchase_id = p_purchase_id
      or linked_line.purchase_id = p_purchase_id
    )
  order by allocation.created_at, allocation.id
  for update of allocation;

  v_sale_history_state := public.get_purchase_sale_history_state(
    p_workspace_id,
    p_purchase_id
  );

  if v_sale_history_state = 'review_required' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsstatus ist unvollständig. Bitte Verkaufsdaten prüfen und nachpflegen.';
  elsif v_sale_history_state = 'recorded' then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf mit Verkäufen kann nicht wieder geöffnet werden.';
  elsif v_sale_history_state <> 'none' then
    raise exception using
      errcode = '22023',
      message = 'Der Verkaufsverlauf konnte nicht sicher geprüft werden.';
  end if;

  v_before_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_before_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_before_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_before_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  update public.purchase_lines
  set allocated_additional_cost = 0,
      allocated_total_cost = 0,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id;

  update public.inventory_items
  set tax_purchase_cost = null, allocated_purchase_cost = case when source_package_line_id is null then 0 else null end,
      status = case
        when status in ('ready', 'listed') then 'received'
        else status
      end,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id;

  update public.stock_lots
  set unit_tax_purchase_cost = null, remaining_tax_unit_costs = null, remaining_unit_costs = null, unit_cost = null
  where workspace_id = p_workspace_id
    and purchase_id = p_purchase_id;

  update public.purchases
  set purchase_price = case
        when type = 'mystery_pack' then purchase_price
        else null
      end,
      total_purchase_cost = null,
      entry_status = 'capturing',
      finalized_at = null,
      finalized_by = null,
      updated_at = v_changed_at
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  v_after_purchase := pg_catalog.jsonb_build_object(
    'purchase_price', v_purchase.purchase_price,
    'total_purchase_cost', v_purchase.total_purchase_cost,
    'entry_status', v_purchase.entry_status,
    'finalized_at', v_purchase.finalized_at,
    'finalized_by', v_purchase.finalized_by
  );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', line.id,
    'allocated_additional_cost', line.allocated_additional_cost,
    'allocated_total_cost', line.allocated_total_cost
  ) order by line.created_at, line.id), '[]'::jsonb)
  into v_after_lines
  from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id,
    'status', item.status,
    'tax_purchase_cost', item.tax_purchase_cost,
    'allocated_purchase_cost', item.allocated_purchase_cost
  ) order by item.created_at, item.id), '[]'::jsonb)
  into v_after_items
  from public.inventory_items as item
  where item.workspace_id = p_workspace_id
    and item.purchase_id = p_purchase_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', lot.id,
    'unit_tax_purchase_cost', lot.unit_tax_purchase_cost,
    'remaining_tax_unit_costs', lot.remaining_tax_unit_costs,
    'remaining_unit_costs', lot.remaining_unit_costs,
    'unit_cost', lot.unit_cost,
    'received_quantity', lot.received_quantity,
    'remaining_quantity', lot.remaining_quantity
  ) order by lot.received_at, lot.id), '[]'::jsonb)
  into v_after_lots
  from public.stock_lots as lot
  where lot.workspace_id = p_workspace_id
    and lot.purchase_id = p_purchase_id;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_reopened',
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'purchase', pg_catalog.jsonb_build_object(
        'before', v_before_purchase,
        'after', v_after_purchase
      ),
      'lines', pg_catalog.jsonb_build_object(
        'before', v_before_lines,
        'after', v_after_lines
      ),
      'inventory_items', pg_catalog.jsonb_build_object(
        'before', v_before_items,
        'after', v_after_items
      ),
      'stock_lots', pg_catalog.jsonb_build_object(
        'before', v_before_lots,
        'after', v_after_lots
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'purchaseId', p_purchase_id,
    'totalPurchaseCost', null,
    'allocatedTotalCost', 0,
    'entryStatus', 'capturing',
    'eventId', v_event_id
  );
end;
$function$;

create or replace function public.replace_and_delete_brand (
  p_workspace_id         uuid,
  p_brand_id             uuid,
  p_replacement_brand_id uuid default null::uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_changed integer := 0;
  v_step_changed integer := 0;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if p_brand_id is null or p_replacement_brand_id = p_brand_id then
    raise exception using errcode = '22023', message = 'Die Markenänderung ist ungültig.';
  end if;

  perform 1
  from public.brands
  where workspace_id = p_workspace_id and id = p_brand_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Die Marke wurde nicht gefunden.';
  end if;

  if p_replacement_brand_id is not null then
    perform 1
    from public.brands
    where workspace_id = p_workspace_id and id = p_replacement_brand_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Die Ersatzmarke wurde nicht gefunden.';
    end if;
  end if;

  update public.catalog_products
  set brand_id = p_replacement_brand_id,
      updated_at = now()
  where workspace_id = p_workspace_id and brand_id = p_brand_id;
  get diagnostics v_changed = row_count;

  update public.inventory_items
  set brand_id = p_replacement_brand_id,
      updated_at = now()
  where workspace_id = p_workspace_id and brand_id = p_brand_id;
  get diagnostics v_step_changed = row_count;
  v_changed := v_changed + v_step_changed;

  delete from public.brands
  where workspace_id = p_workspace_id and id = p_brand_id;

  return pg_catalog.jsonb_build_object('deleted', true, 'reassigned', v_changed);
end;
$function$;

create or replace function public.replace_bank_transactions (
  p_workspace_id uuid,
  p_transactions jsonb
)
  returns integer
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_expected_count integer;
  v_saved_count integer;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if jsonb_typeof(p_transactions) <> 'array' then
    raise exception using errcode = '22023', message = 'Banktransaktionen müssen als Liste übergeben werden.';
  end if;

  select count(*), count(distinct transaction.id)
  into v_expected_count, v_saved_count
  from jsonb_to_recordset(p_transactions) as transaction(
    id uuid,
    booking_date date,
    value_date date,
    counterparty_name text,
    counterparty_iban text,
    purpose text,
    amount numeric,
    currency text,
    source_format text,
    status text,
    match_json jsonb,
    booked_at timestamptz
  );

  if v_expected_count <> v_saved_count then
    raise exception using errcode = '22023', message = 'Banktransaktions-IDs müssen eindeutig sein.';
  end if;

  perform 1
  from public.bank_transactions
  where workspace_id = p_workspace_id
  for update;

  insert into public.bank_transactions (
    id,
    workspace_id,
    booking_date,
    value_date,
    counterparty_name,
    counterparty_iban,
    purpose,
    amount,
    currency,
    source_format,
    status,
    match_json,
    booked_at
  )
  select
    transaction.id,
    p_workspace_id,
    transaction.booking_date,
    transaction.value_date,
    transaction.counterparty_name,
    transaction.counterparty_iban,
    transaction.purpose,
    transaction.amount,
    coalesce(transaction.currency, 'EUR'),
    transaction.source_format,
    coalesce(transaction.status, 'pending'),
    transaction.match_json,
    transaction.booked_at
  from jsonb_to_recordset(p_transactions) as transaction(
    id uuid,
    booking_date date,
    value_date date,
    counterparty_name text,
    counterparty_iban text,
    purpose text,
    amount numeric,
    currency text,
    source_format text,
    status text,
    match_json jsonb,
    booked_at timestamptz
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    booking_date = excluded.booking_date,
    value_date = excluded.value_date,
    counterparty_name = excluded.counterparty_name,
    counterparty_iban = excluded.counterparty_iban,
    purpose = excluded.purpose,
    amount = excluded.amount,
    currency = excluded.currency,
    source_format = excluded.source_format,
    status = excluded.status,
    match_json = excluded.match_json,
    booked_at = excluded.booked_at;

  delete from public.bank_transactions as existing
  where existing.workspace_id = p_workspace_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_transactions) as incoming(id uuid)
      where incoming.id = existing.id
    );

  select count(*) into v_saved_count
  from public.bank_transactions
  where workspace_id = p_workspace_id;

  if v_saved_count <> v_expected_count then
    raise exception using errcode = 'P0001', message = 'Die Banktransaktionen wurden nicht vollständig gespeichert.';
  end if;

  return v_saved_count;
end;
$function$;

create or replace function public.resolve_legacy_sold_item (
  p_workspace_id      uuid,
  p_inventory_item_id uuid,
  p_action            text,
  p_reason            text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_inventory_item public.inventory_items;
  v_event public.inventory_reconciliation_events;
  v_sale_state text;
begin
  if v_actor_id is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_action <> 'restore_stock'
    or nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Aktion und Begruendung sind erforderlich.';
  end if;

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise no_data_found using message = 'Der Inventarartikel wurde nicht gefunden.';
  end if;

  select sale_state
  into v_sale_state
  from public.inventory_item_sale_states
  where inventory_item_id = p_inventory_item_id
    and workspace_id = p_workspace_id;

  if v_sale_state = 'legacy_sale_header_without_line' then
    raise exception using errcode = '22023', message = 'Korrektur erforderlich: Der Verkaufskopf besitzt keine passende Position.';
  end if;

  if v_sale_state <> 'legacy_sold_unverified' then
    raise exception using errcode = '22023', message = 'Nur ungepruefter verkaufter Altbestand kann zurueckgesetzt werden.';
  end if;

  perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);

  update public.inventory_items
  set status = 'ready', updated_at = now()
  where id = p_inventory_item_id
    and workspace_id = p_workspace_id
  returning * into v_inventory_item;

  insert into public.inventory_reconciliation_events (
    workspace_id, inventory_item_id, actor_id, event_type,
    previous_status, new_status, reason
  ) values (
    p_workspace_id, p_inventory_item_id, v_actor_id, 'restore_stock',
    'sold', 'ready', trim(p_reason)
  )
  returning * into v_event;

  return jsonb_build_object(
    'inventory_item', to_jsonb(v_inventory_item),
    'event', to_jsonb(v_event)
  );
end;
$function$;

create or replace function public.save_number_series (
  p_workspace_id     uuid,
  p_entity_type      text,
  p_configuration    jsonb,
  p_expected_version integer default 0
)
  returns public.number_series
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_series public.number_series;
  v_timezone text := p_configuration->>'timezone';
  v_year integer;
  v_period integer;
  v_next bigint;
  v_leading text;
  v_number text;
begin
  if (select auth.uid()) is null or not (select public.can_administer_workspace(p_workspace_id)) then
    raise exception using errcode='42501',message='Nur Workspace-Administratoren dürfen Nummernkreise ändern.';
  end if;
  perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for update;
  if not found then raise exception using errcode='42501',message='Der Workspace ist archiviert.'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception using errcode='22023',message='Die Zeitzone ist ungültig.';
  end if;
  insert into public.number_series(workspace_id,entity_type,label,prefix) values(p_workspace_id,p_entity_type,case p_entity_type when 'purchase' then 'Einkäufe' else 'Verkäufe' end,case p_entity_type when 'purchase' then 'B' else 'V' end) on conflict(workspace_id,entity_type) do nothing;
  select * into strict v_series from public.number_series where workspace_id=p_workspace_id and entity_type=p_entity_type for update;
  if p_expected_version <> v_series.version and not(p_expected_version=0 and v_series.version=1) then
    raise exception using errcode='40001',message='Der Nummernkreis wurde inzwischen geändert. Bitte neu laden.';
  end if;
  update public.number_series set label=p_configuration->>'label',prefix=p_configuration->>'prefix',separator=p_configuration->>'separator',include_year=(p_configuration->>'include_year')::boolean,minimum_digits=(p_configuration->>'minimum_digits')::integer,start_value=(p_configuration->>'start_value')::bigint,reset_yearly=(p_configuration->>'reset_yearly')::boolean,version=version+1,updated_at=statement_timestamp(),updated_by=(select auth.uid()) where id=v_series.id returning * into v_series;
  v_year := extract(year from statement_timestamp() at time zone v_timezone)::integer;
  v_period := case when v_series.reset_yearly then v_year else 0 end;
  select greatest(coalesce(last_value+1,v_series.start_value),v_series.start_value) into v_next from public.number_series_counters where series_id=v_series.id and period=v_period;
  v_next := coalesce(v_next,v_series.start_value);
  v_number := public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,v_next);
  v_leading := pg_catalog.concat_ws(v_series.separator,nullif(v_series.prefix,''),case when v_series.include_year then v_year::text end);
  if v_leading <> '' then v_leading := v_leading || v_series.separator; end if;
  -- Auch spätere Kollisionen prüfen, nicht nur die unmittelbar nächste Nummer.
  if exists(
    select 1 from public.number_assignments a
    cross join lateral (select substring(a.record_number from length(v_leading)+1) as suffix) parts
    where a.workspace_id=p_workspace_id and a.entity_type=p_entity_type
      and left(a.record_number,length(v_leading))=v_leading
      and case when parts.suffix ~ '^[0-9]{1,18}$' then
        parts.suffix::bigint >= v_next and a.record_number=public.format_record_number(v_series.prefix,v_series.separator,case when v_series.include_year then v_year end,v_series.minimum_digits,parts.suffix::bigint)
      else false end
  ) then
    raise exception using errcode='22023',message='Dieses Format würde eine bereits vergebene Nummer erneut erzeugen.';
  end if;
  update public.workspaces set numbering_timezone=v_timezone where id=p_workspace_id;
  insert into public.number_series_changes(workspace_id,series_id,changed_by,configuration) values(p_workspace_id,v_series.id,(select auth.uid()),to_jsonb(v_series)||jsonb_build_object('timezone',v_timezone));
  return v_series;
end;
$function$;

create or replace function public.save_sniper_watchlist (
  p_workspace_id               uuid,
  p_id                         uuid,
  p_title                      text,
  p_catalog_id                 integer,
  p_brand                      text,
  p_search_text                text,
  p_price_from                 numeric,
  p_price_to                   numeric,
  p_condition                  text,
  p_discount_threshold_percent numeric,
  p_is_active                  boolean
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
    v_id uuid;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_catalog_id is not null and not exists (
        select 1 from public.vinted_categories where id = p_catalog_id and is_leaf
    ) then raise exception 'Bitte eine vorhandene Blattkategorie waehlen.' using errcode = '22023'; end if;
    if length(coalesce(p_brand, '')) > 100 or length(coalesce(p_search_text, '')) > 200
       or length(coalesce(p_condition, '')) > 100 then
        raise exception 'Suchkriterien sind zu lang.' using errcode = '22023';
    end if;
    if p_id is null then
        insert into public.sniper_watchlists(workspace_id, title, catalog_id, brand, search_text,
            price_from, price_to, condition, discount_threshold_percent, is_active)
        values (p_workspace_id, btrim(p_title), p_catalog_id, nullif(btrim(p_brand), ''),
            nullif(btrim(p_search_text), ''), p_price_from, p_price_to,
            nullif(btrim(p_condition), ''), p_discount_threshold_percent, p_is_active)
        returning id into v_id;
    else
        update public.sniper_watchlists set title = btrim(p_title), catalog_id = p_catalog_id,
            brand = nullif(btrim(p_brand), ''), search_text = nullif(btrim(p_search_text), ''),
            price_from = p_price_from, price_to = p_price_to, condition = nullif(btrim(p_condition), ''),
            discount_threshold_percent = p_discount_threshold_percent, is_active = p_is_active,
            starts_at = case when (catalog_id, brand, search_text, price_from, price_to, condition,
                discount_threshold_percent, is_active) is distinct from
                (p_catalog_id, nullif(btrim(p_brand), ''), nullif(btrim(p_search_text), ''),
                 p_price_from, p_price_to, nullif(btrim(p_condition), ''), p_discount_threshold_percent, p_is_active)
                then now() else starts_at end,
            legacy_brand_id = case when nullif(btrim(p_brand), '') is not null then null else legacy_brand_id end
        where id = p_id and workspace_id = p_workspace_id returning id into v_id;
        if v_id is null then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    return v_id;
end;
$function$;

create or replace function public.set_catalog_product_archived (
  p_workspace_id uuid,
  p_product_id   uuid,
  p_archived     boolean
)
  returns public.catalog_products
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor uuid := (select auth.uid());
  v_product public.catalog_products;
  v_before timestamptz;
  v_workspace_archived_at timestamptz;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor is null or p_workspace_id is null or p_product_id is null then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived is null then
    raise exception using errcode = '22023', message = 'Archivaktion fehlt.';
  end if;
  perform 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  select archived_at into v_workspace_archived_at from public.workspaces
    where id = p_workspace_id for share;
  if v_workspace_archived_at is not null then
    raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.';
  end if;
  select * into v_product from public.catalog_products
    where workspace_id = p_workspace_id and id = p_product_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived then
    if exists (select 1 from public.listings where workspace_id = p_workspace_id
      and catalog_product_id = p_product_id and status <> 'ended')
      or exists (select 1 from public.listings listing
        join public.inventory_items item on item.id = listing.inventory_item_id and item.workspace_id = listing.workspace_id
        join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
        where listing.workspace_id = p_workspace_id and line.catalog_product_id = p_product_id
          and listing.status <> 'ended') then
      raise exception using errcode = '22023', message = 'Bitte das Inserat zuerst beenden.';
    end if;
    if exists (select 1 from public.inventory_items item
      join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
      where item.workspace_id = p_workspace_id and line.catalog_product_id = p_product_id
        and item.status = 'reserved')
      or exists (select 1 from public.stock_movements movement
      join public.stock_lots lot on lot.id = movement.stock_lot_id
      where lot.workspace_id = p_workspace_id and lot.catalog_product_id = p_product_id
        and movement.reason in ('reservation', 'reservation_release')
      group by lot.id
      having sum(case when movement.reason = 'reservation' then movement.quantity else -movement.quantity end) > 0) then
      raise exception using errcode = '22023', message = 'Bitte die Reservierung zuerst klären.';
    end if;
    if exists (select 1 from public.store_order_items oi
      join public.store_orders o on o.id = oi.store_order_id
      where o.workspace_id = p_workspace_id and oi.catalog_product_id = p_product_id
        and o.status not in ('completed', 'cancelled'))
      or exists (select 1 from public.store_order_items oi
        join public.store_orders o on o.id = oi.store_order_id
        join public.inventory_items item on item.id = oi.inventory_item_id and item.workspace_id = o.workspace_id
        join public.purchase_lines line on line.id = item.purchase_line_id and line.workspace_id = item.workspace_id
        where o.workspace_id = p_workspace_id and line.catalog_product_id = p_product_id
          and o.status not in ('completed', 'cancelled')) then
      raise exception using errcode = '22023', message = 'Bitte den offenen Shopauftrag zuerst klären.';
    end if;
  end if;
  if (v_product.archived_at is not null) = p_archived then return v_product; end if;
  v_before := v_product.archived_at;
  update public.catalog_products
    set archived_at = case when p_archived then clock_timestamp() else null end,
        archived_by = case when p_archived then v_actor else null end
    where workspace_id = p_workspace_id and id = p_product_id
    returning * into v_product;
  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, changes)
    values (p_workspace_id, 'catalog_product', p_product_id,
      case when p_archived then 'catalog_product_archived' else 'catalog_product_restored' end,
      v_actor, jsonb_build_object('archived_at', jsonb_build_object('before', v_before, 'after', v_product.archived_at)));
  return v_product;
end;
$function$;

create or replace function public.set_inventory_item_archived (
  p_workspace_id uuid,
  p_item_id      uuid,
  p_archived     boolean
)
  returns public.inventory_items
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor uuid := (select auth.uid());
  v_item public.inventory_items;
  v_before timestamptz;
  v_workspace_archived_at timestamptz;
  v_sale_state text;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor is null or p_workspace_id is null or p_item_id is null then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived is null then
    raise exception using errcode = '22023', message = 'Archivaktion fehlt.';
  end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_actor for share;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  select archived_at into v_workspace_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_workspace_archived_at is not null then
    raise exception using errcode = '55000', message = 'Dieser Workspace ist archiviert.';
  end if;
  select * into v_item from public.inventory_items where workspace_id = p_workspace_id and id = p_item_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Artikel.';
  end if;
  if p_archived then
    select sale_state into v_sale_state from public.inventory_item_sale_states
      where workspace_id = p_workspace_id and inventory_item_id = p_item_id;
    if v_sale_state is null or v_sale_state not in ('sold', 'no_active_sale')
       or (v_sale_state = 'sold' and v_item.status <> 'sold')
       or (v_sale_state = 'no_active_sale' and v_item.status = 'sold') then
      raise exception using errcode = '22023', message = 'Bitte den Verkaufszustand dieses Artikels zuerst klären.';
    end if;
    if v_item.status = 'reserved' then
      raise exception using errcode = '22023', message = 'Bitte die Reservierung zuerst klären.';
    end if;
    if exists (select 1 from public.listings where workspace_id = p_workspace_id
      and inventory_item_id = p_item_id and status <> 'ended') then
      raise exception using errcode = '22023', message = 'Bitte das Inserat zuerst beenden.';
    end if;
    if exists (select 1 from public.store_order_items oi
      join public.store_orders o on o.id = oi.store_order_id
      where o.workspace_id = p_workspace_id and oi.inventory_item_id = p_item_id
        and o.status not in ('completed', 'cancelled')) then
      raise exception using errcode = '22023', message = 'Bitte den offenen Shopauftrag zuerst klären.';
    end if;
  end if;
  if (v_item.archived_at is not null) = p_archived then return v_item; end if;
  v_before := v_item.archived_at;
  update public.inventory_items set archived_at = case when p_archived then clock_timestamp() else null end,
    archived_by = case when p_archived then v_actor else null end
    where workspace_id = p_workspace_id and id = p_item_id returning * into v_item;
  insert into public.business_events(workspace_id, entity_type, entity_id, event_type, actor_id, changes)
    values(p_workspace_id, 'inventory_item', p_item_id,
      case when p_archived then 'inventory_item_archived' else 'inventory_item_restored' end, v_actor,
      jsonb_build_object('archived_at', jsonb_build_object('before', v_before, 'after', v_item.archived_at)));
  return v_item;
end;
$function$;

create or replace function public.set_listing_online (
  p_workspace_id uuid,
  p_listing_id   uuid
)
  returns public.listings
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_listing public.listings;
  v_item public.inventory_items;
  v_product public.catalog_products;
  v_archived_at timestamptz;
  v_entry_status text;
  v_inventory_item_id uuid;
  v_catalog_product_id uuid;
  v_purchase_id uuid;
  v_source_package_line_id uuid;
  v_available_qty integer;
begin
  if not (select public.can_access_workspace(p_workspace_id)) then raise exception using errcode = '42501', message = 'Du bist kein Mitglied dieses Workspace.'; end if;
  select archived_at into v_archived_at from public.workspaces where id = p_workspace_id for share;
  if v_archived_at is not null then raise exception using errcode = '42501', message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.'; end if;
  select inventory_item_id, catalog_product_id into v_inventory_item_id, v_catalog_product_id
    from public.listings where id = p_listing_id and workspace_id = p_workspace_id;
  if v_inventory_item_id is null and v_catalog_product_id is null then
    raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.';
  end if;

  if v_inventory_item_id is not null then
    select purchase_id, source_package_line_id into v_purchase_id, v_source_package_line_id
      from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id;
    if v_source_package_line_id is not null then
      select entry_status into v_entry_status from public.purchases where id = v_purchase_id and workspace_id = p_workspace_id for share;
      if v_entry_status is distinct from 'finalized' then raise exception using errcode = '42501', message = 'Bestand eines wieder geöffneten Einkaufs darf nicht verkaufsbereit gesetzt werden.'; end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_inventory_item_id::text || ':kleinanzeigen', 0));
    select * into v_item from public.inventory_items where id = v_inventory_item_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status <> 'prepared' then raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.'; end if;
    if v_item.archived_at is not null or v_item.status not in ('received','needs_review','researched','ready','listed','returned') then raise exception using errcode = '22023', message = 'Dieser Artikel kann nicht online gestellt werden.'; end if;
    if v_item.status <> 'listed' then update public.inventory_items set status = 'listed' where id = v_item.id; end if;
    update public.listings set status = 'online', online_since = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_catalog_product_id::text || ':kleinanzeigen', 0));
    select * into v_product from public.catalog_products where id = v_catalog_product_id and workspace_id = p_workspace_id for update;
    select * into v_listing from public.listings where id = p_listing_id and workspace_id = p_workspace_id for update;
    if v_listing.id is null or v_listing.status <> 'prepared' then raise exception using errcode = '22023', message = 'Nur vorbereitete Inserate können online gesetzt werden.'; end if;
    if v_product.archived_at is not null then raise exception using errcode = '22023', message = 'Dieses Produkt ist archiviert.'; end if;
    select coalesce(sum(remaining_quantity), 0) into v_available_qty from public.stock_lots where workspace_id = p_workspace_id and catalog_product_id = v_catalog_product_id;
    if v_available_qty <= 0 then raise exception using errcode = '22023', message = 'Für dieses Produkt ist kein verfügbarer Bestand vorhanden.'; end if;
    update public.listings set status = 'online', online_since = statement_timestamp() where id = v_listing.id returning * into v_listing;
    return v_listing;
  end if;
end;
$function$;

create or replace function public.set_purchase_line_eans (
  p_workspace_id uuid,
  p_lines        jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor uuid := (select auth.uid());
  v_line jsonb;
  v_line_id uuid;
  v_ean text;
begin
  if exists(select 1 from public.workspace_licenses as access_license where access_license.workspace_id=p_workspace_id) and not public.workspace_access_is_valid(p_workspace_id) then raise exception 'Beta-Zugang ist abgelaufen oder gesperrt' using errcode='42501'; end if;
  if v_actor is null or p_workspace_id is null or jsonb_typeof(p_lines) <> 'array'
    or not exists (
      select 1 from public.workspace_members as member
      where member.workspace_id = p_workspace_id and member.user_id = v_actor
    ) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    if pg_catalog.jsonb_typeof(v_line -> 'id') <> 'string'
      or (v_line ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_line -> 'ean') not in ('null', 'string') then
      raise exception using errcode = '22023', message = 'Die EAN-Zuordnung ist ungültig.';
    end if;
    v_line_id := (v_line ->> 'id')::uuid;
    v_ean := nullif(pg_catalog.btrim(v_line ->> 'ean'), '');
    if v_ean is not null and not public.is_valid_gtin(v_ean) then
      raise exception using errcode = '22023', message = 'Die EAN/GTIN ist ungültig.';
    end if;
    update public.purchase_lines as line
    set ean_snapshot = v_ean,
        updated_at = pg_catalog.clock_timestamp()
    from public.purchases as purchase
    where line.id = v_line_id
      and line.workspace_id = p_workspace_id
      and purchase.id = line.purchase_id
      and purchase.workspace_id = p_workspace_id
      and purchase.entry_status <> 'finalized';
    if not found then
      raise exception using errcode = '22023', message = 'Die Einkaufsposition ist nicht änderbar.';
    end if;
  end loop;
end;
$function$;

create or replace function public.set_workspace_company_logo (
  p_workspace_id uuid,
  p_logo_path    text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_profile public.workspace_company_profiles;
  v_tax_mode text;
  v_archived_at timestamptz;
  v_normalized_path text := nullif(pg_catalog.btrim(p_logo_path), '');
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or not (select public.can_administer_workspace(p_workspace_id)) then
    raise exception using
      errcode = '42501',
      message = 'Nur Inhaber und Administratoren dürfen das Unternehmenslogo ändern.';
  end if;

  select tax_mode, archived_at
    into v_tax_mode, v_archived_at
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if v_archived_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
  end if;

  if v_normalized_path is not null
    and not public.is_company_logo_path(v_normalized_path, p_workspace_id) then
    raise exception using errcode = '22023', message = 'Der Logo-Pfad ist ungültig.';
  end if;

  select * into v_profile
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '55000', message = 'Unternehmensprofil fehlt.';
  end if;

  if v_profile.logo_path is distinct from v_normalized_path then
    update public.workspace_company_profiles
    set logo_path = v_normalized_path,
        updated_at = statement_timestamp()
    where workspace_id = p_workspace_id
    returning * into v_profile;

    insert into public.business_events (
      workspace_id,
      entity_type,
      entity_id,
      event_type,
      actor_id,
      changes
    ) values (
      p_workspace_id,
      'company_profile',
      p_workspace_id,
      'company_profile_updated',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('fields', pg_catalog.jsonb_build_array('logo_path'))
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'tax_mode', v_tax_mode,
    'can_edit', true
  );
end;
$function$;

create or replace function public.sniper_feed_by_brand (
  p_workspace_id uuid,
  p_watchlist_id uuid,
  p_brand        text,
  p_before_time  timestamp with time zone,
  p_before_id    uuid,
  p_limit        integer
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
    v_watchlist public.sniper_watchlists;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 100 or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungueltige Seitengroesse oder Position.' using errcode = '22023';
    end if;
    if p_brand is not null and (length(btrim(p_brand)) not between 1 and 100) then
        raise exception 'Ungueltige Marke.' using errcode = '22023';
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists
        where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;

    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb)
    into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path,
            hit.reference_price, hit.reference_scope, hit.discount_percent, hit.watchlist_title
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        left join lateral (
            select found.reference_price, found.reference_scope, found.discount_percent,
                watchlist.title as watchlist_title
            from public.sniper_watchlist_hits as found
            join public.sniper_watchlists as watchlist on watchlist.id = found.watchlist_id
            where found.listing_id = listing.id and watchlist.workspace_id = p_workspace_id
                and (p_watchlist_id is null or watchlist.id = p_watchlist_id)
            order by found.created_at desc, found.id desc limit 1
        ) as hit on true
        where listing.first_seen_at >= now() - interval '30 days'
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (p_brand is null or lower(btrim(listing.brand)) = lower(btrim(p_brand)))
            and (p_watchlist_id is null or public.sniper_watchlist_matches(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;

    select exists(select 1 from public.sniper_queries as query where query.is_active
        and (v_watchlist.catalog_id is null or query.catalog_id is null or query.catalog_id = v_watchlist.catalog_id))
    into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$;

create or replace function public.sniper_feed_filtered (
  p_workspace_id uuid,
  p_watchlist_id uuid,
  p_brand        text,
  p_size         text,
  p_min_price    numeric,
  p_max_price    numeric,
  p_before_time  timestamp with time zone,
  p_before_id    uuid,
  p_limit        integer
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare
    v_watchlist public.sniper_watchlists;
    v_rows jsonb;
    v_covered boolean;
    v_reported_at timestamptz;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 100
        or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungueltige Seitengroesse oder Position.' using errcode = '22023';
    end if;
    if p_brand is not null and length(btrim(p_brand)) not between 1 and 100 then
        raise exception 'Ungueltige Marke.' using errcode = '22023';
    end if;
    if p_size is not null and p_size not in ('xs', 's', 'm', 'l', 'xl', 'xxl', '3xl') then
        raise exception 'Ungueltige Groesse.' using errcode = '22023';
    end if;
    if p_min_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_max_price::text in ('NaN', 'Infinity', '-Infinity')
        or p_min_price < 0 or p_max_price < 0 or p_min_price > p_max_price then
        raise exception 'Ungueltige Preisgrenzen.' using errcode = '22023';
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists
        where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;

    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb)
    into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path,
            hit.reference_price, hit.reference_scope, hit.discount_percent, hit.watchlist_title
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        left join lateral (
            select found.reference_price, found.reference_scope, found.discount_percent,
                watchlist.title as watchlist_title
            from public.sniper_watchlist_hits as found
            join public.sniper_watchlists as watchlist on watchlist.id = found.watchlist_id
            where found.listing_id = listing.id and watchlist.workspace_id = p_workspace_id
                and (p_watchlist_id is null or watchlist.id = p_watchlist_id)
            order by found.created_at desc, found.id desc limit 1
        ) as hit on true
        where listing.first_seen_at >= now() - interval '30 days'
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (p_brand is null or lower(btrim(listing.brand)) = lower(btrim(p_brand)))
            and (p_size is null or public.sniper_feed_matches_size(listing.size, p_size))
            and (p_min_price is null or listing.item_price >= p_min_price)
            and (p_max_price is null or listing.item_price <= p_max_price)
            and ((p_min_price is null and p_max_price is null) or listing.currency = 'EUR')
            and (p_watchlist_id is null or public.sniper_watchlist_matches(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;

    select exists(select 1 from public.sniper_queries as query where query.is_active
        and (v_watchlist.catalog_id is null or query.catalog_id is null or query.catalog_id = v_watchlist.catalog_id))
    into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$;

create or replace function public.sniper_feed (
  p_workspace_id uuid,
  p_watchlist_id uuid                     default null::uuid,
  p_deals_only   boolean                  default false,
  p_before_time  timestamp with time zone default null::timestamp with time zone,
  p_before_id    uuid                     default null::uuid,
  p_limit        integer                  default 60
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_watchlist public.sniper_watchlists; v_rows jsonb; v_covered boolean; v_reported_at timestamptz;
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 100 or (p_before_time is null) <> (p_before_id is null) then
        raise exception 'Ungueltige Seitengroesse oder Position.' using errcode = '22023';
    end if;
    if p_watchlist_id is not null then
        select * into v_watchlist from public.sniper_watchlists where id = p_watchlist_id and workspace_id = p_workspace_id;
        if not found then raise exception 'Merkzettel nicht gefunden.' using errcode = '42501'; end if;
    end if;
    select coalesce(jsonb_agg(to_jsonb(page) order by page.first_seen_at desc, page.id desc), '[]'::jsonb) into v_rows from (
        select listing.id, listing.title, listing.url, listing.image_urls, listing.item_price, listing.total_price,
            listing.currency, listing.brand, listing.size, listing.condition, listing.is_hidden, listing.first_seen_at,
            listing.catalog_id, category.path as category_path,
            hit.reference_price, hit.reference_scope, hit.discount_percent, hit.watchlist_title
        from public.sniper_listings as listing
        left join public.vinted_categories as category on category.id = listing.catalog_id
        left join lateral (
            select found.reference_price, found.reference_scope, found.discount_percent, watchlist.title as watchlist_title
            from public.sniper_watchlist_hits as found join public.sniper_watchlists as watchlist on watchlist.id = found.watchlist_id
            where found.listing_id = listing.id and watchlist.workspace_id = p_workspace_id
                and (p_watchlist_id is null or watchlist.id = p_watchlist_id)
            order by found.created_at desc, found.id desc limit 1
        ) as hit on true
        where listing.first_seen_at >= now() - interval '30 days'
            and (p_before_time is null or (listing.first_seen_at, listing.id) < (p_before_time, p_before_id))
            and (not p_deals_only or hit.reference_price is not null)
            and (p_watchlist_id is null or p_deals_only or public.sniper_watchlist_matches(v_watchlist, listing))
        order by listing.first_seen_at desc, listing.id desc limit p_limit
    ) as page;
    select exists(select 1 from public.sniper_queries where is_active
        and (v_watchlist.catalog_id is null or catalog_id = v_watchlist.catalog_id)) into v_covered;
    select reported_at into v_reported_at from public.sniper_runtime_status where id = 1;
    return jsonb_build_object('items', v_rows, 'covered', v_covered, 'reported_at', v_reported_at);
end;
$function$;

create or replace function public.sniper_supported_brands (
  p_workspace_id uuid
)
  returns table (
    brand text
  )
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    return query
        select distinct btrim(listing.brand) as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = listing.discovered_by_query_id
        where query.marketplace = 'vinted'
            and query.is_active
            and query.brand_id is not null
            and listing.first_seen_at >= now() - interval '30 days'
            and nullif(btrim(listing.brand), '') is not null
        order by 1;
end;
$function$;

create or replace function public.unbundle_shipping_order (
  p_workspace_id     uuid,
  p_bundled_order_id uuid
)
  returns setof public.shipping_orders
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_snapshot jsonb;
  v_expected_ids text[];
  v_snapshot_ids text[];
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  select bundled_orders_snapshot, bundled_order_ids
  into v_snapshot, v_expected_ids
  from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id
    and is_bundled = true
  for update;

  if not found then
    raise no_data_found using message = 'Das Sammelpaket wurde nicht gefunden.';
  end if;

  if jsonb_typeof(v_snapshot) <> 'array' or jsonb_array_length(v_snapshot) = 0 then
    raise exception using errcode = '22023', message = 'Das Sammelpaket enthält keinen wiederherstellbaren Snapshot.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_snapshot) as snapshot(order_row)
    where jsonb_typeof(snapshot.order_row) <> 'object'
      or jsonb_typeof(snapshot.order_row -> 'id') <> 'string'
      or jsonb_typeof(snapshot.order_row -> 'workspace_id') <> 'string'
      or snapshot.order_row ->> 'workspace_id' <> p_workspace_id::text
      or not (snapshot.order_row ->> 'id' = any(v_expected_ids))
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot des Sammelpakets ist ungültig.';
  end if;

  select array_agg(snapshot.order_row ->> 'id' order by snapshot.order_row ->> 'id')
  into v_snapshot_ids
  from jsonb_array_elements(v_snapshot) as snapshot(order_row);

  if v_snapshot_ids is distinct from (
    select array_agg(expected_id order by expected_id)
    from unnest(v_expected_ids) as expected_id
  ) then
    raise exception using errcode = '22023', message = 'Der Snapshot passt nicht zu den gebündelten Sendungen.';
  end if;

  delete from public.shipping_orders
  where id = p_bundled_order_id
    and workspace_id = p_workspace_id;

  return query
  insert into public.shipping_orders
  select (jsonb_populate_record(null::public.shipping_orders, snapshot.order_row)).*
  from jsonb_array_elements(v_snapshot) as snapshot(order_row)
  returning *;
end;
$function$;

create or replace function public.update_product_media_layout (
  p_product_id         uuid,
  p_ordered_media_ids  uuid[],
  p_expected_media_ids uuid[],
  p_workspace_id       uuid
)
  returns setof public.catalog_product_media
  language plpgsql
  set search_path to ''
  as $function$
declare v_current uuid[];
begin
  if (select auth.uid()) is null or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace ist nicht zugänglich.';
  end if;
  perform 1 from public.catalog_products where id = p_product_id and workspace_id = p_workspace_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Produkt ist nicht zugänglich.';
  end if;
  if p_ordered_media_ids is null or p_expected_media_ids is null
    or array_position(p_ordered_media_ids, null) is not null
    or array_position(p_expected_media_ids, null) is not null
    or cardinality(p_ordered_media_ids) <> (select count(distinct id) from unnest(p_ordered_media_ids) id)
    or cardinality(p_expected_media_ids) <> (select count(distinct id) from unnest(p_expected_media_ids) id)
    or not p_ordered_media_ids <@ p_expected_media_ids then
    raise exception using errcode = '22023', message = 'Die Bilderliste ist ungültig.';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_current
    from public.catalog_product_media where catalog_product_id = p_product_id and workspace_id = p_workspace_id;
  if not (v_current @> p_expected_media_ids and v_current <@ p_expected_media_ids) then
    raise exception using errcode = '40001', message = 'Die Bilder wurden zwischenzeitlich geändert. Bitte erneut laden.';
  end if;
  -- Entfernt nur ausdrücklich abgewählte Metadaten. Dateien räumt der Client nach Erfolg auf.
  delete from public.catalog_product_media where catalog_product_id = p_product_id and workspace_id = p_workspace_id
    and not (id = any(p_ordered_media_ids));
  -- Partiellen Unique-Index vor Vergabe des neuen Hauptbildes freigeben.
  update public.catalog_product_media set is_primary = false
    where catalog_product_id = p_product_id and workspace_id = p_workspace_id and is_primary;
  update public.catalog_product_media m set sort_order = (selected.position - 1)::integer, is_primary = selected.position = 1
    from unnest(p_ordered_media_ids) with ordinality selected(id, position)
    where m.id = selected.id and m.workspace_id = p_workspace_id and m.catalog_product_id = p_product_id;
  return query select m.* from public.catalog_product_media m
    where m.catalog_product_id = p_product_id and m.workspace_id = p_workspace_id order by m.sort_order;
end;
$function$;

create or replace function public.update_purchase_draft (
  p_workspace_id uuid,
  p_purchase_id  uuid,
  p_purchase     jsonb,
  p_expenses     jsonb default '[]'::jsonb,
  p_lines        jsonb default '[]'::jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_purchase public.purchases;
  v_existing_line public.purchase_lines;
  v_line jsonb;
  v_expense jsonb;
  v_line_id uuid;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_refs jsonb := '{}'::jsonb;
  v_line_ref text;
  v_catalog_product_id uuid;
  v_target_line_id uuid;
  v_source_id uuid;
  v_supplier_id uuid;
  v_purchase_type text;
  v_mode text;
  v_total_expense_cents bigint;
  v_manual_cents bigint;
  v_requested_unit_total numeric := 0;
  v_requested_unit_max numeric := 0;
  v_max_purchase_lines constant integer := 1000;
  v_max_purchase_units constant integer := 100000;
  v_audit_before jsonb;
  v_audit_after jsonb;
  v_seller_details jsonb := public.normalize_purchase_seller_details(p_purchase);
  v_seller_details_before jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.can_access_workspace(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_workspace_id is null
    or p_purchase_id is null
    or pg_catalog.jsonb_typeof(p_purchase) <> 'object'
    or pg_catalog.jsonb_typeof(p_expenses) <> 'array'
    or pg_catalog.jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null')
      not in ('null', 'number')
    or (
      pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price') = 'number'
      and (
        (p_purchase ->> 'purchase_price')::numeric < 0
        or pg_catalog.scale((p_purchase ->> 'purchase_price')::numeric) > 2
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Kaufpreis muss centgenau und darf nicht negativ sein.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_purchase_id::text, 0)
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_purchase.entry_status = 'finalized' then
    raise exception using
      errcode = '22023',
      message = 'Nur ein nicht finalisierter Einkaufsentwurf kann bearbeitet werden.';
  end if;

  v_seller_details_before := public.purchase_seller_details_snapshot(v_purchase);
  v_audit_before := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);

  if pg_catalog.jsonb_array_length(p_lines) > v_max_purchase_lines then
    raise exception using
      errcode = '22023',
      message = 'Ein Einkauf ist auf 1.000 Positionen begrenzt.';
  end if;

  select
    coalesce(pg_catalog.max(candidate.quantity), 0),
    coalesce(pg_catalog.sum(candidate.quantity), 0)
  into v_requested_unit_max, v_requested_unit_total
  from (
    select case
      when pg_catalog.jsonb_typeof(element.value) = 'object'
        and pg_catalog.jsonb_typeof(element.value -> 'ordered_quantity') = 'number'
        and element.value ->> 'ordered_quantity' ~ '^[1-9][0-9]*$'
      then (element.value ->> 'ordered_quantity')::numeric
      else null
    end as quantity
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  ) as candidate;

  if v_requested_unit_max > v_max_purchase_units
    or v_requested_unit_total > v_max_purchase_units then
    raise exception using
      errcode = '22023',
      message = 'Die Menge ist auf 100.000 Einheiten je Position und Einkauf begrenzt.';
  end if;

  v_purchase_type := nullif(p_purchase ->> 'type', '');
  v_mode := coalesce(nullif(p_purchase ->> 'cost_allocation_mode', ''), 'even');
  if v_purchase_type not in ('single', 'mystery_pack', 'lot', 'pallet')
    or v_mode not in ('manual', 'even', 'value_weighted') then
    raise exception using errcode = '22023', message = 'Die Einkaufsdaten sind ungültig.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'source_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '') is not null
      and (p_purchase ->> 'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;
  v_source_id := nullif(pg_catalog.btrim(p_purchase ->> 'source_id'), '')::uuid;
  if v_source_id is not null and not exists (
    select 1
    from public.sources as source
    where source.workspace_id = p_workspace_id
      and source.id = v_source_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Einkaufsquelle gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'supplier_id'), 'null') not in ('null', 'string')
    or (
      nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '') is not null
      and (p_purchase ->> 'supplier_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;
  v_supplier_id := nullif(pg_catalog.btrim(p_purchase ->> 'supplier_id'), '')::uuid;
  if v_supplier_id is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.workspace_id = p_workspace_id
      and supplier.id = v_supplier_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Der Lieferant gehört nicht zu diesem Workspace.';
  end if;

  if coalesce(
    p_purchase ->> 'pricing_mode',
    case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end
  ) = 'individual'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_lines) as line(value)
      where coalesce(nullif(line.value ->> 'price_mode', ''), 'priced') = 'open'
    ) then
    if coalesce(pg_catalog.jsonb_typeof(p_purchase -> 'purchase_price'), 'null') <> 'null' then
      raise exception using
        errcode = '22023',
        message = 'Ein Einkauf mit offenen Positionspreisen darf keinen Warenbetrag enthalten.';
    end if;

    if exists (
      select 1
      from public.purchase_lines as line
      where line.workspace_id = p_workspace_id
        and line.purchase_id = p_purchase_id
        and (
          line.received_quantity > 0
          or exists (
            select 1
            from public.inventory_items as item
            where item.workspace_id = p_workspace_id
              and item.purchase_line_id = line.id
          )
          or exists (
            select 1
            from public.stock_lots as lot
            where lot.workspace_id = p_workspace_id
              and lot.purchase_line_id = line.id
          )
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Offene Einkaufspreise können nicht bei bereits übernommenem Bestand gespeichert werden.';
    end if;
  end if;

  for v_line in
    select element.value
    from pg_catalog.jsonb_array_elements(p_lines) as element(value)
  loop
    if v_line ? 'is_package' and pg_catalog.jsonb_typeof(v_line -> 'is_package') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Das Paketkennzeichen muss ein Wahrheitswert sein.';
    end if;
    v_line_ref := nullif(pg_catalog.btrim(v_line ->> 'client_ref'), '');
    if pg_catalog.jsonb_typeof(v_line) <> 'object'
      or v_line_ref is null
      or v_line_refs ? v_line_ref
      or pg_catalog.jsonb_typeof(v_line -> 'title_snapshot') <> 'string'
      or nullif(pg_catalog.btrim(v_line ->> 'title_snapshot'), '') is null
      or pg_catalog.jsonb_typeof(v_line -> 'line_kind') <> 'string'
      or v_line ->> 'line_kind' not in ('quantity', 'individual')
      or pg_catalog.jsonb_typeof(v_line -> 'ordered_quantity') <> 'number'
      or (v_line ->> 'ordered_quantity') !~ '^[1-9][0-9]*$'
      or coalesce(nullif(v_line ->> 'price_mode', ''), 'priced')
        not in ('priced', 'open', 'unpriced_mystery')
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null')
        not in ('null', 'string')
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null')
        not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot') = 'string'
        and v_line ->> 'condition_snapshot' not in (
          'new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'
        )
      )
      or coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value') = 'number'
        and (
          (v_line ->> 'estimated_market_value')::numeric < 0
          or pg_catalog.scale((v_line ->> 'estimated_market_value')::numeric) > 2
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    if v_mode = 'manual' and (
      coalesce(pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost'), 'null')
        not in ('null', 'number')
      or (
        pg_catalog.jsonb_typeof(v_line -> 'allocated_additional_cost') = 'number'
        and (
          (v_line ->> 'allocated_additional_cost')::numeric < 0
          or pg_catalog.scale((v_line ->> 'allocated_additional_cost')::numeric) > 2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenzuordnung muss centgenau und darf nicht negativ sein.';
    end if;

    if coalesce(p_purchase ->> 'pricing_mode', case when v_purchase_type = 'mystery_pack' then 'total' else 'individual' end) = 'total' then
      if coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') <> 'unpriced_mystery'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') <> 'null'
        or coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') <> 'null' then
        raise exception using
          errcode = '22023',
          message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
      end if;
    elsif not (
      (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'open'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
        and coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
      )
      or (
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced') = 'priced'
        and pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price') = 'number'
        and pg_catalog.jsonb_typeof(v_line -> 'line_total') = 'number'
        and (v_line ->> 'unit_purchase_price')::numeric >= 0
        and (v_line ->> 'line_total')::numeric >= 0
        and pg_catalog.scale((v_line ->> 'unit_purchase_price')::numeric) <= 16
        and pg_catalog.scale((v_line ->> 'line_total')::numeric) <= 2
        and (v_line ->> 'line_total')::numeric = pg_catalog.round(
          (v_line ->> 'ordered_quantity')::integer
          * (v_line ->> 'unit_purchase_price')::numeric,
          2
        )
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'Die Einkaufspositionen passen nicht zur Einkaufsart.';
    end if;

    v_catalog_product_id := case
      when coalesce(pg_catalog.jsonb_typeof(v_line -> 'catalog_product_id'), 'null') = 'null'
        then null
      else (v_line ->> 'catalog_product_id')::uuid
    end;
    if (v_line ->> 'line_kind' = 'quantity' and v_catalog_product_id is null)
      or (v_line ->> 'line_kind' = 'individual' and v_catalog_product_id is not null)
      or (
        v_catalog_product_id is not null
        and not exists (
          select 1
          from public.catalog_products as product
          where product.workspace_id = p_workspace_id
            and product.id = v_catalog_product_id
        )
      ) then
      raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
    end if;

    v_existing_line := null;
    if v_line_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select line.*
      into v_existing_line
      from public.purchase_lines as line
      where line.id = v_line_ref::uuid
      for update;

      if found and (
        v_existing_line.workspace_id <> p_workspace_id
        or v_existing_line.purchase_id <> p_purchase_id
      ) then
        raise exception using errcode = '22023', message = 'Die Einkaufspositionen sind ungültig.';
      end if;
    end if;

    if v_existing_line.id is not null then
      if (
        v_existing_line.received_quantity > 0
        or exists (
          select 1
          from public.inventory_items as item
          where item.workspace_id = p_workspace_id
            and item.purchase_line_id = v_existing_line.id
        )
        or exists (
          select 1
          from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_line_id = v_existing_line.id
        )
      ) and (
        v_existing_line.line_kind <> v_line ->> 'line_kind'
        or v_existing_line.ordered_quantity <> (v_line ->> 'ordered_quantity')::integer
        or v_existing_line.catalog_product_id is distinct from v_catalog_product_id
      ) then
        raise exception using
          errcode = '22023',
          message = 'Bereits erfasste Einkaufspositionen dürfen strukturell nicht verändert werden.';
      end if;

      update public.purchase_lines
      set is_package = coalesce((v_line ->> 'is_package')::boolean, is_package),
          catalog_product_id = v_catalog_product_id,
          title_snapshot = pg_catalog.btrim(v_line ->> 'title_snapshot'),
          ean_snapshot = case
            when v_line ? 'ean_snapshot'
              then nullif(pg_catalog.btrim(v_line ->> 'ean_snapshot'), '')
            else v_existing_line.ean_snapshot
          end,
          line_kind = v_line ->> 'line_kind',
          ordered_quantity = (v_line ->> 'ordered_quantity')::integer,
          price_mode = coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
          unit_purchase_price = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
              then null
            else (v_line ->> 'unit_purchase_price')::numeric
          end,
          line_total = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
              then null
            else (v_line ->> 'line_total')::numeric
          end,
          allocated_additional_cost = case
            when v_mode = 'manual'
              then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
            else 0
          end,
          condition_snapshot = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') = 'null'
              then null
            else v_line ->> 'condition_snapshot'
          end,
          estimated_market_value = case
            when coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null') = 'null'
              then null
            else (v_line ->> 'estimated_market_value')::numeric
          end,
          updated_at = pg_catalog.clock_timestamp()
      where id = v_existing_line.id
      returning id into v_line_id;
    else
      insert into public.purchase_lines (
        is_package,
        workspace_id, purchase_id, catalog_product_id, title_snapshot,
        ean_snapshot,
        line_kind, ordered_quantity, received_quantity, unit_purchase_price,
        line_total, allocated_additional_cost, price_mode, condition_snapshot,
        estimated_market_value
      ) values (
        coalesce((v_line ->> 'is_package')::boolean, false),
        p_workspace_id,
        p_purchase_id,
        v_catalog_product_id,
        pg_catalog.btrim(v_line ->> 'title_snapshot'),
        nullif(pg_catalog.btrim(v_line ->> 'ean_snapshot'), ''),
        v_line ->> 'line_kind',
        (v_line ->> 'ordered_quantity')::integer,
        0,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'unit_purchase_price'), 'null') = 'null'
            then null
          else (v_line ->> 'unit_purchase_price')::numeric
        end,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'line_total'), 'null') = 'null'
            then null
          else (v_line ->> 'line_total')::numeric
        end,
        case when v_mode = 'manual'
          then coalesce((v_line ->> 'allocated_additional_cost')::numeric, 0)
          else 0
        end,
        coalesce(nullif(v_line ->> 'price_mode', ''), 'priced'),
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'condition_snapshot'), 'null') = 'null'
            then null
          else v_line ->> 'condition_snapshot'
        end,
        case
          when coalesce(pg_catalog.jsonb_typeof(v_line -> 'estimated_market_value'), 'null') = 'null'
            then null
          else (v_line ->> 'estimated_market_value')::numeric
        end
      ) returning id into v_line_id;
    end if;

    v_line_ids := pg_catalog.array_append(v_line_ids, v_line_id);
    v_line_refs := pg_catalog.jsonb_set(
      v_line_refs,
      array[v_line_ref],
      pg_catalog.to_jsonb(v_line_id::text),
      true
    );
  end loop;

  if exists (
    select 1
    from public.purchase_lines as line
    where line.workspace_id = p_workspace_id
      and line.purchase_id = p_purchase_id
      and line.id <> all(v_line_ids)
      and (
        line.received_quantity > 0
        or exists (
          select 1 from public.inventory_items as item
          where item.workspace_id = p_workspace_id
            and item.purchase_line_id = line.id
        )
        or exists (
          select 1 from public.stock_lots as lot
          where lot.workspace_id = p_workspace_id
            and lot.purchase_line_id = line.id
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Bereits erfasste Einkaufspositionen dürfen nicht entfernt werden.';
  end if;

  delete from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  delete from public.purchase_lines as line
  where line.workspace_id = p_workspace_id
    and line.purchase_id = p_purchase_id
    and line.id <> all(v_line_ids);

  for v_expense in
    select element.value
    from pg_catalog.jsonb_array_elements(p_expenses) as element(value)
  loop
    if pg_catalog.jsonb_typeof(v_expense) <> 'object'
      or pg_catalog.jsonb_typeof(v_expense -> 'amount') <> 'number'
      or (v_expense ->> 'amount')::numeric <= 0
      or pg_catalog.scale((v_expense ->> 'amount')::numeric) > 2
      or coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted')
        not in ('direct', 'quantity', 'value_weighted') then
      raise exception using errcode = '22023', message = 'Zusatzkosten sind ungültig.';
    end if;

    if coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted') = 'direct' then
      v_line_ref := nullif(pg_catalog.btrim(v_expense ->> 'target_purchase_line_ref'), '');
      if v_line_ref is null or not (v_line_refs ? v_line_ref) then
        raise exception using
          errcode = '22023',
          message = 'Die direkte Kostenzuordnung verweist auf keine Einkaufsposition.';
      end if;
      v_target_line_id := (v_line_refs ->> v_line_ref)::uuid;
    else
      v_target_line_id := null;
    end if;

    insert into public.purchase_costs (
      workspace_id, purchase_id, type, amount, description,
      allocation_method, target_purchase_line_id, tax_treatment
    ) values (
      p_workspace_id,
      p_purchase_id,
      coalesce(nullif(pg_catalog.btrim(v_expense ->> 'type'), ''), 'other'),
      (v_expense ->> 'amount')::numeric,
      nullif(pg_catalog.btrim(v_expense ->> 'description'), ''),
      coalesce(nullif(v_expense ->> 'allocation_method', ''), 'value_weighted'),
      v_target_line_id,
      v_expense ->> 'tax_treatment'
    );
  end loop;

  select coalesce(pg_catalog.round(pg_catalog.sum(cost.amount) * 100), 0)::bigint
  into v_total_expense_cents
  from public.purchase_costs as cost
  where cost.workspace_id = p_workspace_id
    and cost.purchase_id = p_purchase_id;

  if pg_catalog.cardinality(v_line_ids) = 0 then
    null;
  elsif v_mode = 'manual' then
    select coalesce(pg_catalog.round(pg_catalog.sum(line.allocated_additional_cost) * 100), 0)::bigint
    into v_manual_cents
    from public.purchase_lines as line
    where line.id = any(v_line_ids);
    if v_manual_cents <> v_total_expense_cents then
      raise exception using
        errcode = '22023',
        message = 'Die manuelle Kostenverteilung stimmt nicht mit den Zusatzkosten überein.';
    end if;
  elsif v_total_expense_cents > 0 then
    with weights as (
      select
        line.id,
        ids.ordinality,
        case
          when v_mode = 'value_weighted' and totals.value_total > 0 then line.line_total
          else line.ordered_quantity::numeric
        end as weight
      from pg_catalog.unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
      cross join (
        select pg_catalog.sum(candidate.line_total) as value_total
        from public.purchase_lines as candidate
        where candidate.id = any(v_line_ids)
      ) as totals
    ), shares as (
      select
        weights.*,
        v_total_expense_cents::numeric * weight
          / nullif(pg_catalog.sum(weight) over (), 0) as exact_cents
      from weights
    ), ranked as (
      select
        shares.*,
        pg_catalog.floor(exact_cents)::bigint as floor_cents,
        pg_catalog.row_number() over (
          order by exact_cents - pg_catalog.floor(exact_cents) desc, ordinality
        ) as remainder_rank,
        v_total_expense_cents
          - pg_catalog.sum(pg_catalog.floor(exact_cents)::bigint) over () as remainder_cents
      from shares
    )
    update public.purchase_lines as line
    set allocated_additional_cost = (
      ranked.floor_cents
        + case when ranked.remainder_rank <= ranked.remainder_cents then 1 else 0 end
    )::numeric / 100
    from ranked
    where line.id = ranked.id;
  end if;

  update public.purchases
  set source_id = v_source_id,
      supplier_id = v_supplier_id,
      content_status = coalesce(p_purchase ->> 'content_status', v_purchase.content_status),
      pricing_mode = coalesce(p_purchase ->> 'pricing_mode', v_purchase.pricing_mode),
      supplier_reference = nullif(btrim(p_purchase ->> 'supplier_reference'), ''),
      discount_amount = coalesce((p_purchase ->> 'discount_amount')::numeric, 0),
      type = v_purchase_type,
      title = coalesce(pg_catalog.btrim(p_purchase ->> 'title'), ''),
      purchase_date = (p_purchase ->> 'purchase_date')::date,
      purchase_price = (p_purchase ->> 'purchase_price')::numeric,
      cost_allocation_mode = v_mode,
      notes = nullif(pg_catalog.btrim(p_purchase ->> 'notes'), ''),
      tracking_number = nullif(pg_catalog.btrim(p_purchase ->> 'tracking_number'), ''),
      tracking_carrier = nullif(p_purchase ->> 'tracking_carrier', ''),
      tracking_status = coalesce(nullif(p_purchase ->> 'tracking_status', ''), 'pending'),
      seller_type = v_seller_details ->> 'seller_type',
      seller_name = v_seller_details ->> 'seller_name',
      seller_street = v_seller_details ->> 'seller_street',
      seller_address_extra = v_seller_details ->> 'seller_address_extra',
      seller_postal_code = v_seller_details ->> 'seller_postal_code',
      seller_city = v_seller_details ->> 'seller_city',
      seller_country_code = v_seller_details ->> 'seller_country_code',
      receipt_mode = coalesce(nullif(p_purchase ->> 'receipt_mode', ''), 'external'),
      updated_at = pg_catalog.clock_timestamp()
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_purchase;

  -- Ein offener Nachtragsdialog soll einen zwischenzeitlich gespeicherten Entwurf
  -- nicht überschreiben; deshalb zählt auch dieser Weg die Version hoch.
  if public.purchase_seller_details_snapshot(v_purchase) is distinct from v_seller_details_before then
    update public.purchases
    set seller_details_version = seller_details_version + 1
    where workspace_id = p_workspace_id
      and id = p_purchase_id
    returning * into v_purchase;
  end if;

  v_audit_after := public.purchase_draft_audit_snapshot(p_workspace_id, p_purchase_id);
  if v_audit_before is distinct from v_audit_after then
    insert into public.business_events (
      workspace_id, entity_type, entity_id, event_type, actor_id, changes
    ) values (
      p_workspace_id, 'purchase', p_purchase_id, 'purchase_draft_updated', (select auth.uid()),
      pg_catalog.jsonb_build_object(
        'purchase', pg_catalog.jsonb_build_object('before', v_audit_before -> 'purchase', 'after', v_audit_after -> 'purchase'),
        'lines', pg_catalog.jsonb_build_object('before', v_audit_before -> 'lines', 'after', v_audit_after -> 'lines'),
        'costs', pg_catalog.jsonb_build_object('before', v_audit_before -> 'costs', 'after', v_audit_after -> 'costs')
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'purchase', pg_catalog.to_jsonb(v_purchase),
    'purchase_costs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cost) order by cost.created_at, cost.id)
      from public.purchase_costs as cost
      where cost.workspace_id = p_workspace_id
        and cost.purchase_id = p_purchase_id
    ), '[]'::jsonb),
    'purchase_lines', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) order by ids.ordinality)
      from pg_catalog.unnest(v_line_ids) with ordinality as ids(id, ordinality)
      join public.purchase_lines as line on line.id = ids.id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.update_purchase_seller_details (
  p_workspace_id     uuid,
  p_purchase_id      uuid,
  p_expected_version integer,
  p_details          jsonb,
  p_reason           text    default null::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases;
  v_after public.purchases;
  v_before_details jsonb;
  v_after_details jsonb;
  v_changes jsonb;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_event_id uuid;
begin
  if v_actor_id is null or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  if p_purchase_id is null
    or p_expected_version is null
    or p_details is null
    or pg_catalog.jsonb_typeof(p_details) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Verkäuferangaben sind ungültig.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_details) as detail(key)
    where detail.key <> all (array[
      'source_id', 'supplier_id', 'seller_type', 'seller_name',
      'seller_street', 'seller_address_extra',
      'seller_postal_code', 'seller_city', 'seller_country_code',
      'supplier_reference'
    ])
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Verkäuferangaben enthalten Felder, die nachträglich nicht geändert werden dürfen.';
  end if;

  if pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Der Grund darf höchstens 500 Zeichen lang sein.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.workspace_id = p_workspace_id
    and purchase.id = p_purchase_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Der Einkauf wurde nicht gefunden.';
  end if;

  if v_before.seller_details_version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'Der Einkauf wurde zwischenzeitlich geändert. Bitte neu laden.';
  end if;

  v_after_details := public.normalize_purchase_seller_details(p_details);
  v_before_details := public.purchase_seller_details_snapshot(v_before);

  if (v_after_details ->> 'source_id') is not null and not exists (
    select 1
    from public.sources as source
    where source.workspace_id = p_workspace_id
      and source.id = (v_after_details ->> 'source_id')::uuid
  ) then
    raise exception using errcode = '22023', message = 'Die Quelle gehört nicht zu diesem Workspace.';
  end if;

  if (v_after_details ->> 'supplier_id') is not null and not exists (
    select 1
    from public.suppliers as supplier
    where supplier.workspace_id = p_workspace_id
      and supplier.id = (v_after_details ->> 'supplier_id')::uuid
  ) then
    raise exception using errcode = '22023', message = 'Der Verkäufer gehört nicht zu diesem Workspace.';
  end if;

  if v_after_details = v_before_details then
    return pg_catalog.jsonb_build_object('purchase', pg_catalog.to_jsonb(v_before), 'eventId', null);
  end if;

  update public.purchases
  set source_id = (v_after_details ->> 'source_id')::uuid,
      supplier_id = (v_after_details ->> 'supplier_id')::uuid,
      seller_type = v_after_details ->> 'seller_type',
      seller_name = v_after_details ->> 'seller_name',
      seller_street = v_after_details ->> 'seller_street',
      seller_address_extra = v_after_details ->> 'seller_address_extra',
      seller_postal_code = v_after_details ->> 'seller_postal_code',
      seller_city = v_after_details ->> 'seller_city',
      seller_country_code = v_after_details ->> 'seller_country_code',
      supplier_reference = v_after_details ->> 'supplier_reference',
      seller_details_version = v_before.seller_details_version + 1,
      updated_at = pg_catalog.clock_timestamp()
  where workspace_id = p_workspace_id
    and id = p_purchase_id
  returning * into v_after;

  select pg_catalog.jsonb_object_agg(
    detail.key,
    pg_catalog.jsonb_build_object(
      'before', v_before_details -> detail.key,
      'after', v_after_details -> detail.key
    )
  )
  into v_changes
  from pg_catalog.jsonb_object_keys(v_after_details) as detail(key)
  where (v_before_details -> detail.key) is distinct from (v_after_details -> detail.key);

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    reason,
    changes
  ) values (
    p_workspace_id,
    'purchase',
    p_purchase_id,
    'purchase_seller_details_updated',
    v_actor_id,
    v_reason,
    v_changes
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object('purchase', pg_catalog.to_jsonb(v_after), 'eventId', v_event_id);
end;
$function$;

create or replace function public.update_purchase_tracking (
  p_purchase_id      uuid,
  p_tracking_number  text,
  p_tracking_carrier text,
  p_tracking_status  text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_after public.purchases%rowtype;
  v_number text := nullif(pg_catalog.btrim(p_tracking_number), '');
  v_carrier text := nullif(pg_catalog.btrim(p_tracking_carrier), '');
  v_status text := coalesce(nullif(pg_catalog.btrim(p_tracking_status), ''), 'pending');
  v_event_id uuid;
  v_event_type text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;
  if v_status not in ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception') then
    raise exception using errcode = '22023', message = 'Unbekannter Trackingstatus.';
  end if;
  if v_number is not null and v_carrier is null then
    raise exception using errcode = '22023', message = 'Zum Tracking wird ein Dienstleister benötigt.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not public.can_access_workspace(v_before.workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  if v_number is null then
    v_carrier := null;
    v_status := 'pending';
  end if;

  if v_before.tracking_number is not distinct from v_number
    and v_before.tracking_carrier is not distinct from v_carrier
    and v_before.tracking_status is not distinct from v_status then
    return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
  end if;

  v_event_type := case
    when v_before.tracking_number is null and v_number is not null then 'purchase_tracking_added'
    when v_before.tracking_number is not null and v_number is null then 'purchase_tracking_removed'
    else 'purchase_tracking_updated'
  end;

  update public.purchases
  set tracking_number = v_number,
      tracking_carrier = v_carrier,
      tracking_status = v_status,
      updated_at = statement_timestamp()
  where id = p_purchase_id
  returning * into v_after;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    v_before.workspace_id,
    'purchase',
    p_purchase_id,
    v_event_type,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'tracking_number', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_number,
        'after', v_after.tracking_number
      ),
      'tracking_carrier', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_carrier,
        'after', v_after.tracking_carrier
      ),
      'tracking_status', pg_catalog.jsonb_build_object(
        'before', v_before.tracking_status,
        'after', v_after.tracking_status
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_after), 'eventId', v_event_id);
end;
$function$;

create or replace function public.update_purchase_workflow (
  p_purchase_id uuid,
  p_status      text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_before public.purchases%rowtype;
  v_after public.purchases%rowtype;
  v_event_id uuid;
  v_event_type text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich.';
  end if;
  if p_status not in ('ordered', 'arrived') then
    raise exception using errcode = '22023', message = 'Unbekannter Einkaufsstatus.';
  end if;

  select purchase.*
  into v_before
  from public.purchases as purchase
  where purchase.id = p_purchase_id
  for update;

  if not found or not public.can_access_workspace(v_before.workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
  end if;

  if p_status = 'arrived'
    and public.purchase_has_open_prices(v_before.workspace_id, v_before.id) then
    raise exception using
      errcode = '22023',
      message = 'Offene Einkaufspreise müssen vor der Ankunft ergänzt werden.';
  end if;

  if p_status = 'ordered' then
    if v_before.receiving_status = 'ordered' and v_before.shipment_status = 'not_shipped' then
      return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
    end if;
    if v_before.receiving_status <> 'draft' then
      raise exception using errcode = '22023', message = 'Nur ein Entwurf kann bestellt werden.';
    end if;
    update public.purchases
    set receiving_status = 'ordered',
        shipment_status = 'not_shipped',
        arrived_at = null,
        updated_at = statement_timestamp()
    where id = p_purchase_id
    returning * into v_after;
    v_event_type := 'purchase_ordered';
  else
    if v_before.receiving_status = 'received' and v_before.arrived_at is not null then
      return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_before), 'eventId', null);
    end if;
    if v_before.receiving_status not in ('ordered', 'partially_received', 'received') then
      raise exception using errcode = '22023', message = 'Nur ein bestellter oder empfangener Einkauf kann ankommen.';
    end if;
    update public.purchases
    set receiving_status = 'received',
        shipment_status = 'arrived',
        arrived_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = p_purchase_id
    returning * into v_after;
    v_event_type := 'purchase_arrived';
  end if;

  insert into public.business_events (
    workspace_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    changes
  ) values (
    v_before.workspace_id,
    'purchase',
    p_purchase_id,
    v_event_type,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'receiving_status', pg_catalog.jsonb_build_object(
        'before', v_before.receiving_status,
        'after', v_after.receiving_status
      ),
      'arrived_at', pg_catalog.jsonb_build_object(
        'before', v_before.arrived_at,
        'after', v_after.arrived_at
      )
    )
  ) returning id into v_event_id;

  return pg_catalog.jsonb_build_object('purchase', to_jsonb(v_after), 'eventId', v_event_id);
end;
$function$;

create or replace function public.update_workspace_company_settings (
  p_workspace_id uuid,
  p_profile      jsonb,
  p_tax_mode     text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_before public.workspace_company_profiles;
  v_after public.workspace_company_profiles;
  v_next public.workspace_company_profiles;
  v_tax_before text;
  v_archived_at timestamptz;
  v_normalized jsonb;
  v_before_json jsonb;
  v_after_json jsonb;
  v_changed_fields jsonb;
begin
  if (select auth.uid()) is null
    or p_workspace_id is null
    or not (select public.can_administer_workspace(p_workspace_id)) then
    raise exception using
      errcode = '42501',
      message = 'Nur Inhaber und Administratoren dürfen Unternehmensdaten ändern.';
  end if;

  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object' then
    raise exception using errcode = '22023', message = 'Die Unternehmensdaten sind ungültig.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_profile) as entry(key)
    where key <> all (array[
      'company_name',
      'legal_name',
      'legal_form',
      'email',
      'phone',
      'website',
      'street',
      'house_number',
      'postal_code',
      'city',
      'country_code',
      'mailing_address_enabled',
      'mailing_street',
      'mailing_house_number',
      'mailing_postal_code',
      'mailing_city',
      'mailing_country_code',
      'tax_number',
      'vat_id',
      'tax_office',
      'federal_state',
      'bank_account_holder',
      'bank_name',
      'iban',
      'bic'
    ])
  ) then
    raise exception using
      errcode = '22023',
      message = 'Die Unternehmensdaten enthalten unbekannte Felder.';
  end if;

  if p_tax_mode not in ('diff_25a', 'kleinunternehmer_19', 'regular_19') then
    raise exception using errcode = '22023', message = 'Der Steuermodus ist ungültig.';
  end if;

  if p_profile ? 'mailing_address_enabled'
    and pg_catalog.jsonb_typeof(p_profile -> 'mailing_address_enabled') <> 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'Die Angabe zur Postanschrift ist ungültig.';
  end if;

  select tax_mode, archived_at
    into v_tax_before, v_archived_at
  from public.workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;
  if v_archived_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
  end if;

  select * into v_before
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '55000', message = 'Unternehmensprofil fehlt.';
  end if;

  v_normalized := pg_catalog.jsonb_build_object(
    'company_name', nullif(pg_catalog.btrim(p_profile ->> 'company_name'), ''),
    'legal_name', nullif(pg_catalog.btrim(p_profile ->> 'legal_name'), ''),
    'legal_form', nullif(pg_catalog.btrim(p_profile ->> 'legal_form'), ''),
    'email', nullif(pg_catalog.btrim(p_profile ->> 'email'), ''),
    'phone', nullif(pg_catalog.btrim(p_profile ->> 'phone'), ''),
    'website', nullif(pg_catalog.btrim(p_profile ->> 'website'), ''),
    'street', nullif(pg_catalog.btrim(p_profile ->> 'street'), ''),
    'house_number', nullif(pg_catalog.btrim(p_profile ->> 'house_number'), ''),
    'postal_code', nullif(pg_catalog.btrim(p_profile ->> 'postal_code'), ''),
    'city', nullif(pg_catalog.btrim(p_profile ->> 'city'), ''),
    'country_code', nullif(pg_catalog.upper(pg_catalog.btrim(p_profile ->> 'country_code')), ''),
    'mailing_address_enabled',
      coalesce((p_profile ->> 'mailing_address_enabled')::boolean, false),
    'mailing_street', nullif(pg_catalog.btrim(p_profile ->> 'mailing_street'), ''),
    'mailing_house_number',
      nullif(pg_catalog.btrim(p_profile ->> 'mailing_house_number'), ''),
    'mailing_postal_code',
      nullif(pg_catalog.btrim(p_profile ->> 'mailing_postal_code'), ''),
    'mailing_city', nullif(pg_catalog.btrim(p_profile ->> 'mailing_city'), ''),
    'mailing_country_code',
      nullif(pg_catalog.upper(pg_catalog.btrim(p_profile ->> 'mailing_country_code')), ''),
    'tax_number', nullif(pg_catalog.btrim(p_profile ->> 'tax_number'), ''),
    'vat_id', nullif(pg_catalog.btrim(p_profile ->> 'vat_id'), ''),
    'tax_office', nullif(pg_catalog.btrim(p_profile ->> 'tax_office'), ''),
    'federal_state', nullif(pg_catalog.btrim(p_profile ->> 'federal_state'), ''),
    'bank_account_holder',
      nullif(pg_catalog.btrim(p_profile ->> 'bank_account_holder'), ''),
    'bank_name', nullif(pg_catalog.btrim(p_profile ->> 'bank_name'), ''),
    'iban',
      nullif(
        pg_catalog.upper(
          pg_catalog.regexp_replace(coalesce(p_profile ->> 'iban', ''), '[[:space:]]', '', 'g')
        ),
        ''
      ),
    'bic',
      nullif(
        pg_catalog.upper(
          pg_catalog.regexp_replace(coalesce(p_profile ->> 'bic', ''), '[[:space:]]', '', 'g')
        ),
        ''
      )
  );

  v_next := pg_catalog.jsonb_populate_record(v_before, v_normalized);

  if v_next.legal_form is not null
    and v_next.legal_form not in ('sole_proprietorship', 'gbr', 'ug', 'gmbh', 'other') then
    raise exception using errcode = '22023', message = 'Die Rechtsform ist ungültig.';
  end if;
  if v_next.country_code is not null and v_next.country_code !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Der Ländercode ist ungültig.';
  end if;
  if v_next.mailing_country_code is not null
    and v_next.mailing_country_code !~ '^[A-Z]{2}$' then
    raise exception using
      errcode = '22023',
      message = 'Der Ländercode der Postanschrift ist ungültig.';
  end if;

  v_before_json :=
    (to_jsonb(v_before) - array['workspace_id', 'created_at', 'updated_at', 'logo_path'])
    || pg_catalog.jsonb_build_object('tax_mode', v_tax_before);

  if (to_jsonb(v_before) - array['workspace_id', 'created_at', 'updated_at', 'logo_path'])
    is distinct from
    (to_jsonb(v_next) - array['workspace_id', 'created_at', 'updated_at', 'logo_path']) then
    update public.workspace_company_profiles
    set company_name = v_next.company_name,
        legal_name = v_next.legal_name,
        legal_form = v_next.legal_form,
        email = v_next.email,
        phone = v_next.phone,
        website = v_next.website,
        street = v_next.street,
        house_number = v_next.house_number,
        postal_code = v_next.postal_code,
        city = v_next.city,
        country_code = v_next.country_code,
        mailing_address_enabled = v_next.mailing_address_enabled,
        mailing_street = v_next.mailing_street,
        mailing_house_number = v_next.mailing_house_number,
        mailing_postal_code = v_next.mailing_postal_code,
        mailing_city = v_next.mailing_city,
        mailing_country_code = v_next.mailing_country_code,
        tax_number = v_next.tax_number,
        vat_id = v_next.vat_id,
        tax_office = v_next.tax_office,
        federal_state = v_next.federal_state,
        bank_account_holder = v_next.bank_account_holder,
        bank_name = v_next.bank_name,
        iban = v_next.iban,
        bic = v_next.bic,
        updated_at = statement_timestamp()
    where workspace_id = p_workspace_id;
  end if;

  if v_tax_before is distinct from p_tax_mode then
    update public.workspaces
    set tax_mode = p_tax_mode,
        updated_at = statement_timestamp()
    where id = p_workspace_id;
  end if;

  select * into strict v_after
  from public.workspace_company_profiles
  where workspace_id = p_workspace_id;

  v_after_json :=
    (to_jsonb(v_after) - array['workspace_id', 'created_at', 'updated_at', 'logo_path'])
    || pg_catalog.jsonb_build_object('tax_mode', p_tax_mode);

  select coalesce(pg_catalog.jsonb_agg(changed.key order by changed.key), '[]'::jsonb)
    into v_changed_fields
  from (
    select entry.key
    from pg_catalog.jsonb_object_keys(v_after_json) as entry(key)
    where v_before_json -> entry.key is distinct from v_after_json -> entry.key
  ) as changed;

  if pg_catalog.jsonb_array_length(v_changed_fields) > 0 then
    insert into public.business_events (
      workspace_id,
      entity_type,
      entity_id,
      event_type,
      actor_id,
      changes
    ) values (
      p_workspace_id,
      'company_profile',
      p_workspace_id,
      'company_profile_updated',
      (select auth.uid()),
      pg_catalog.jsonb_build_object('fields', v_changed_fields)
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'profile', to_jsonb(v_after),
    'tax_mode', p_tax_mode,
    'can_edit', true
  );
end;
$function$;

create function public.user_can_access_workspace (
  p_workspace_id uuid,
  p_user_id      uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
    and public.workspace_access_is_valid(p_workspace_id);
$function$;

revoke all on function public.user_can_access_workspace(uuid, uuid) from public;

grant all on function public.user_can_access_workspace(uuid, uuid) to service_role;

create function public.user_has_workspace_access (
  p_user_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select exists(select 1 from public.workspace_members where user_id=p_user_id and public.workspace_access_is_valid(workspace_id));
$function$;

revoke all on function public.user_has_workspace_access(uuid) from public;

grant all on function public.user_has_workspace_access(uuid) to service_role;

create function public.workspace_access_is_valid (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$
  select exists(select 1 from public.workspaces where id=p_workspace_id)
    and not exists(select 1 from public.workspace_licenses as license
      left join public.beta_applications as application on application.id=license.beta_application_id
      where license.workspace_id=p_workspace_id and
        (license.status<>'active' or license.ended_at is not null
        or (license.ends_at is not null and license.ends_at<=now()) or application.revoked_at is not null));
$function$;

revoke all on function public.workspace_access_is_valid(uuid) from public;

grant all on function public.workspace_access_is_valid(uuid) to service_role;

create function public.workspace_has_business_data (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
  as $function$ select exists (select 1 from public.workspaces where id=p_workspace_id and setup_completed_at is not null)
    or exists (select 1 from public.catalog_products where workspace_id = p_workspace_id)
    or exists (select 1 from public.marketplace_connections where workspace_id = p_workspace_id)
    or exists (select 1 from public.ebay_connections where workspace_id = p_workspace_id)
    or exists (select 1 from public.purchases where workspace_id = p_workspace_id)
    or exists (select 1 from public.inventory_items where workspace_id = p_workspace_id)
    or exists (select 1 from public.stock_lots where workspace_id = p_workspace_id)
    or exists (select 1 from public.stock_movements where workspace_id = p_workspace_id)
    or exists (select 1 from public.sales where workspace_id = p_workspace_id)
    or exists (select 1 from public.inventory_reconciliation_events where workspace_id = p_workspace_id)
    or exists (select 1 from public.business_events where workspace_id = p_workspace_id)
    or exists (select 1 from public.activity_logs where workspace_id = p_workspace_id)
    or exists (select 1 from public.returns where workspace_id = p_workspace_id)
    or exists (select 1 from public.invoices where workspace_id = p_workspace_id)
    or exists (select 1 from public.email_confirmations where workspace_id = p_workspace_id)
    or exists (select 1 from public.shipping_orders where workspace_id = p_workspace_id)
    or exists (select 1 from public.store_orders where workspace_id = p_workspace_id)
    or exists (select 1 from public.bank_transactions where workspace_id = p_workspace_id)
    or exists (select 1 from public.offline_purchase_entries where workspace_id = p_workspace_id)
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = p_workspace_id)
    or exists (select 1 from public.catalog_product_media where workspace_id = p_workspace_id)
    or exists (select 1 from public.purchase_receipt_requests where workspace_id = p_workspace_id)
    or exists (select 1 from public.purchase_documents where workspace_id = p_workspace_id)
    or exists (select 1 from public.expense_recurring_rules where workspace_id = p_workspace_id)
    or exists (select 1 from public.expenses where workspace_id = p_workspace_id)
    or exists (select 1 from public.expense_documents where workspace_id = p_workspace_id)
    or exists (select 1 from public.ebay_order_bookings where workspace_id = p_workspace_id); $function$;

revoke all on function public.workspace_has_business_data(uuid) from public;

grant all on function public.workspace_has_business_data(uuid) to service_role;

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.activity_logs
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Verlauf lesen" on public.activity_logs
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Verlaufseintrag anlegen" on public.activity_logs
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Verlaufseintrag loeschen" on public.activity_logs
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy app_notifications_delete on public.app_notifications
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy app_notifications_insert on public.app_notifications
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy app_notifications_select on public.app_notifications
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy app_notifications_update on public.app_notifications
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Eigene Bildbereinigung lesen" on public.article_media_cleanup_jobs
  for select
  to authenticated
  using (( select public.can_access_workspace(article_media_cleanup_jobs.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.bank_transactions
  for each row
  execute function public.protect_expired_workspace_business();

create policy bank_transactions_delete on public.bank_transactions
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy bank_transactions_insert on public.bank_transactions
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy bank_transactions_select on public.bank_transactions
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy bank_transactions_update on public.bank_transactions
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

alter table public.beta_applications
  add column invitation_expires_at timestamp with time zone;

alter table public.beta_applications
  add column registration_link_kind text default 'legacy'::text not null;

alter table public.beta_applications
  add constraint beta_applications_registration_link_kind_check check (registration_link_kind = any (array['legacy'::text, 'managed'::text]));

alter table public.beta_applications
  add column revoked_at timestamp with time zone;

alter table public.beta_applications
  add column withdrawal_user_id uuid;

alter table public.beta_applications
  add column withdrawal_workspace_id uuid;

alter table public.beta_applications
  add column withdrawal_status text default 'not_requested'::text not null;

alter table public.beta_applications
  add constraint beta_applications_withdrawal_status_check check (withdrawal_status = any (array['not_requested'::text, 'revoked'::text, 'auth_deleted'::text, 'failed'::text]));

alter table public.beta_applications
  add column withdrawal_last_error text;

create table public.beta_lifecycle_operations (
  id               bigint                   generated always as identity not null,
  request_id       uuid                     not null,
  application_id   uuid,
  action           text                     not null,
  status           text                     default 'processing'::text not null,
  lease_id         uuid                     default gen_random_uuid() not null,
  lease_expires_at timestamp with time zone default (now() + '00:10:00'::interval) not null,
  result           jsonb                    default '{}'::jsonb not null,
  created_at       timestamp with time zone default now() not null
);

create function public.claim_beta_lifecycle_operation (
  p_application_id uuid,
  p_request_id     uuid,
  p_action         text
)
  returns public.beta_lifecycle_operations
  language plpgsql
  set search_path to ''
  as $function$
declare v_operation public.beta_lifecycle_operations;
begin
  perform 1 from public.beta_applications where id=p_application_id for update;
  if not found then raise exception 'Beta-Bewerbung nicht gefunden' using errcode='P0002'; end if;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  if found then
    if v_operation.action<>p_action or v_operation.application_id is distinct from p_application_id then
      raise exception 'Vorgangskennung bereits verwendet' using errcode='22023';
    end if;
    if v_operation.status='succeeded' then return v_operation; end if;
    if v_operation.status='processing' and v_operation.lease_expires_at>now() then
      raise exception 'Beta-Vorgang wird bereits verarbeitet' using errcode='55P03';
    end if;
  end if;
  if exists (select 1 from public.beta_lifecycle_operations where application_id=p_application_id
    and status='processing' and lease_expires_at>now()) then
    raise exception 'Beta-Vorgang wird bereits verarbeitet' using errcode='55P03';
  end if;
  update public.beta_lifecycle_operations set status='failed' where application_id=p_application_id and status='processing';
  insert into public.beta_lifecycle_operations(request_id,application_id,action)
  values(p_request_id,p_application_id,p_action)
  on conflict (request_id) do update set status='processing',lease_id=gen_random_uuid(),
    lease_expires_at=now()+interval '10 minutes',result='{}'::jsonb
  returning * into v_operation;
  return v_operation;
end;
$function$;

revoke all on function public.claim_beta_lifecycle_operation(uuid, uuid, text) from public;

grant all on function public.claim_beta_lifecycle_operation(uuid, uuid, text) to service_role;

comment on table public.beta_lifecycle_operations is 'Wiederholbare Beta-Vorgänge mit exklusiver Bearbeitung; keine Passwörter oder Sitzungstokens.';

alter table public.beta_lifecycle_operations
  enable row level security;

alter table public.beta_lifecycle_operations
  add constraint beta_lifecycle_operations_action_check check (action = any (array['invite'::text, 'register'::text, 'withdraw'::text, 'extend'::text, 'end'::text]));

alter table public.beta_lifecycle_operations
  add constraint beta_lifecycle_operations_application_id_fkey foreign key (application_id) references public.beta_applications(id) on delete set null;

alter table public.beta_lifecycle_operations
  add constraint beta_lifecycle_operations_pkey primary key (id);

alter table public.beta_lifecycle_operations
  add constraint beta_lifecycle_operations_request_id_key unique (request_id);

alter table public.beta_lifecycle_operations
  add constraint beta_lifecycle_operations_status_check check (status = any (array['processing'::text, 'succeeded'::text, 'failed'::text]));

grant all on public.beta_lifecycle_operations to service_role;

create unique index beta_lifecycle_operations_processing on public.beta_lifecycle_operations (application_id)
  where status = 'processing'::text;

create index beta_lifecycle_operations_application on public.beta_lifecycle_operations (application_id);

create policy "Dienst erstellt Beta-Vorgänge" on public.beta_lifecycle_operations
  for insert
  to service_role
  with check (true);

create policy "Dienst liest Beta-Vorgänge" on public.beta_lifecycle_operations
  for select
  to service_role
  using (true);

create policy "Dienst löscht Beta-Vorgänge" on public.beta_lifecycle_operations
  for delete
  to service_role
  using (true);

create policy "Dienst ändert Beta-Vorgänge" on public.beta_lifecycle_operations
  for update
  to service_role
  using (true)
  with check (true);

create table public.beta_registration_links (
  id             bigint                   generated always as identity not null,
  application_id uuid                     not null,
  token_hash     text                     not null,
  issued_at      timestamp with time zone default now() not null,
  expires_at     timestamp with time zone not null,
  revoked_at     timestamp with time zone,
  consumed_at    timestamp with time zone
);

comment on table public.beta_registration_links is 'Geschützte Hashes der widerrufbaren Beta-Registrierungslinks; niemals Rohlinks speichern.';

alter table public.beta_registration_links
  enable row level security;

alter table public.beta_registration_links
  add constraint beta_registration_links_application_id_fkey foreign key (application_id) references public.beta_applications(id) on delete cascade;

alter table public.beta_registration_links
  add constraint beta_registration_links_pkey primary key (id);

alter table public.beta_registration_links
  add constraint beta_registration_links_token_hash_check check (token_hash ~ '^[a-f0-9]{64}$'::text);

alter table public.beta_registration_links
  add constraint beta_registration_links_token_hash_key unique (token_hash);

grant all on public.beta_registration_links to service_role;

create index beta_registration_links_application on public.beta_registration_links (application_id);

create policy "Dienst erstellt Beta-Links" on public.beta_registration_links
  for insert
  to service_role
  with check (true);

create policy "Dienst liest Beta-Links" on public.beta_registration_links
  for select
  to service_role
  using (true);

create policy "Dienst löscht Beta-Links" on public.beta_registration_links
  for delete
  to service_role
  using (true);

create policy "Dienst ändert Beta-Links" on public.beta_registration_links
  for update
  to service_role
  using (true)
  with check (true);

create policy "Marken aendern" on public.brands
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Marken anlegen" on public.brands
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Marken lesen" on public.brands
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Marken loeschen" on public.brands
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy carrier_configs_delete on public.carrier_configs
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy carrier_configs_insert on public.carrier_configs
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy carrier_configs_select on public.carrier_configs
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy carrier_configs_update on public.carrier_configs
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.cash_wallet_sessions
  for each row
  execute function public.protect_expired_workspace_business();

create policy cash_wallet_sessions_delete on public.cash_wallet_sessions
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy cash_wallet_sessions_insert on public.cash_wallet_sessions
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy cash_wallet_sessions_select on public.cash_wallet_sessions
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy cash_wallet_sessions_update on public.cash_wallet_sessions
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Artikelgruppen aendern" on public.catalog_product_groups
  for update
  to authenticated
  using (( select public.can_access_workspace(catalog_product_groups.workspace_id) as is_workspace_member))
  with check (( select public.can_access_workspace(catalog_product_groups.workspace_id) as is_workspace_member));

create policy "Artikelgruppen anlegen" on public.catalog_product_groups
  for insert
  to authenticated
  with check (( select public.can_access_workspace(catalog_product_groups.workspace_id) as is_workspace_member));

create policy "Artikelgruppen lesen" on public.catalog_product_groups
  for select
  to authenticated
  using (( select public.can_access_workspace(catalog_product_groups.workspace_id) as is_workspace_member));

create policy "Artikelgruppen loeschen" on public.catalog_product_groups
  for delete
  to authenticated
  using (( select public.can_access_workspace(catalog_product_groups.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.catalog_product_media
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Produktmedien aendern" on public.catalog_product_media
  for update
  to authenticated
  using (( select public.can_access_workspace(catalog_product_media.workspace_id) as is_workspace_member))
  with check (( select public.can_access_workspace(catalog_product_media.workspace_id) as is_workspace_member));

create policy "Produktmedien anlegen" on public.catalog_product_media
  for insert
  to authenticated
  with check (( select public.can_access_workspace(catalog_product_media.workspace_id) as is_workspace_member));

create policy "Produktmedien lesen" on public.catalog_product_media
  for select
  to authenticated
  using (( select public.can_access_workspace(catalog_product_media.workspace_id) as is_workspace_member));

create policy "Produktmedien loeschen" on public.catalog_product_media
  for delete
  to authenticated
  using (( select public.can_access_workspace(catalog_product_media.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.catalog_products
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Artikelstamm aendern" on public.catalog_products
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Artikelstamm anlegen" on public.catalog_products
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Artikelstamm lesen" on public.catalog_products
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Artikelstamm loeschen" on public.catalog_products
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.ebay_order_bookings
  for each row
  execute function public.protect_expired_workspace_business();

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.ebay_order_snapshots
  for each row
  execute function public.protect_expired_workspace_business();

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.email_confirmations
  for each row
  execute function public.protect_expired_workspace_business();

create policy email_confirmations_delete on public.email_confirmations
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy email_confirmations_insert on public.email_confirmations
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy email_confirmations_select on public.email_confirmations
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy email_confirmations_update on public.email_confirmations
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Ausgabenkategorien aendern" on public.expense_categories
  for update
  to authenticated
  using (( select public.can_access_workspace(expense_categories.workspace_id) as is_workspace_member))
  with check (( select public.can_access_workspace(expense_categories.workspace_id) as is_workspace_member));

create policy "Ausgabenkategorien anlegen" on public.expense_categories
  for insert
  to authenticated
  with check ((( select public.can_access_workspace(expense_categories.workspace_id) as is_workspace_member) and (created_by = ( select auth.uid() as uid))));

create policy "Ausgabenkategorien lesen" on public.expense_categories
  for select
  to authenticated
  using (( select public.can_access_workspace(expense_categories.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.expense_documents
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Ausgabenbelege anlegen" on public.expense_documents
  for insert
  to authenticated
  with check ((( select public.can_access_workspace(expense_documents.workspace_id) as is_workspace_member) and (created_by = ( select auth.uid() as uid)) and (exists ( select 1
   from public.expenses expense
  where ((expense.workspace_id = expense_documents.workspace_id) and (expense.id = expense_documents.expense_id))))));

create policy "Ausgabenbelege entfernen" on public.expense_documents
  for delete
  to authenticated
  using ((( select public.can_access_workspace(expense_documents.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.expenses expense
  where ((expense.workspace_id = expense_documents.workspace_id) and (expense.id = expense_documents.expense_id))))));

create policy "Ausgabenbelege lesen" on public.expense_documents
  for select
  to authenticated
  using (( select public.can_access_workspace(expense_documents.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.expense_recurring_rules
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Wiederholungsregeln aendern" on public.expense_recurring_rules
  for update
  to authenticated
  using (( select public.can_access_workspace(expense_recurring_rules.workspace_id) as is_workspace_member))
  with check ((( select public.can_access_workspace(expense_recurring_rules.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.expense_categories category
  where ((category.workspace_id = expense_recurring_rules.workspace_id) and (category.id = expense_recurring_rules.category_id))))));

create policy "Wiederholungsregeln anlegen" on public.expense_recurring_rules
  for insert
  to authenticated
  with
    check ((( select public.can_access_workspace(expense_recurring_rules.workspace_id) as is_workspace_member) and (created_by = ( select auth.uid() as uid)) and (exists ( select 1
   from public.expense_categories category
  where ((category.workspace_id = expense_recurring_rules.workspace_id) and (category.id = expense_recurring_rules.category_id))))));

create policy "Wiederholungsregeln lesen" on public.expense_recurring_rules
  for select
  to authenticated
  using (( select public.can_access_workspace(expense_recurring_rules.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.expenses
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Ausgaben aendern" on public.expenses
  for update
  to authenticated
  using (( select public.can_access_workspace(expenses.workspace_id) as is_workspace_member))
  with check ((( select public.can_access_workspace(expenses.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.expense_categories category
  where ((category.workspace_id = expenses.workspace_id) and (category.id = expenses.category_id)))) and ((recurring_rule_id is null) or (exists ( select 1
   from public.expense_recurring_rules rule
  where ((rule.workspace_id = expenses.workspace_id) and (rule.id = expenses.recurring_rule_id)))))));

create policy "Ausgaben anlegen" on public.expenses
  for insert
  to authenticated
  with check ((( select public.can_access_workspace(expenses.workspace_id) as is_workspace_member) and (created_by = ( select auth.uid() as uid)) and (exists ( select 1
   from public.expense_categories category
  where ((category.workspace_id = expenses.workspace_id) and (category.id = expenses.category_id)))) and ((recurring_rule_id is null) or (exists ( select 1
   from public.expense_recurring_rules rule
  where ((rule.workspace_id = expenses.workspace_id) and (rule.id = expenses.recurring_rule_id)))))));

create policy "Ausgaben lesen" on public.expenses
  for select
  to authenticated
  using (( select public.can_access_workspace(expenses.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.inventory_items
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Artikel aendern" on public.inventory_items
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Artikel anlegen" on public.inventory_items
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Artikel loeschen" on public.inventory_items
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Inventar lesen" on public.inventory_items
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.inventory_reconciliation_events
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Inventarklaerungen lesen" on public.inventory_reconciliation_events
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.invoice_items
  for each row
  execute function public.protect_expired_workspace_business('invoices', 'invoice_id');

create policy invoice_items_select on public.invoice_items
  for select
  to authenticated
  using ((exists ( select 1
   from public.invoices i
  where ((i.id = invoice_items.invoice_id) and public.can_access_workspace(i.workspace_id)))));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.invoices
  for each row
  execute function public.protect_expired_workspace_business();

create policy invoices_select on public.invoices
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.item_costs
  for each row
  execute function public.protect_expired_workspace_business('inventory_items', 'inventory_item_id');

create policy "Artikelkosten aendern" on public.item_costs
  for update
  to authenticated
  using ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_costs.inventory_item_id) and public.can_access_workspace(i.workspace_id)))))
  with check ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_costs.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create policy "Artikelkosten anlegen" on public.item_costs
  for insert
  to authenticated
  with check ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_costs.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create policy "Artikelkosten lesen" on public.item_costs
  for select
  to authenticated
  using ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_costs.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create policy "Artikelkosten loeschen" on public.item_costs
  for delete
  to authenticated
  using ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_costs.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.item_media
  for each row
  execute function public.protect_expired_workspace_business('inventory_items', 'inventory_item_id');

create policy "Artikelbild aendern" on public.item_media
  for update
  to authenticated
  using ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_media.inventory_item_id) and public.can_access_workspace(i.workspace_id)))))
  with check ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_media.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create policy "Artikelbild anlegen" on public.item_media
  for insert
  to authenticated
  with check ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_media.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create policy "Artikelbild loeschen" on public.item_media
  for delete
  to authenticated
  using ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_media.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create policy "Artikelbilder lesen" on public.item_media
  for select
  to authenticated
  using ((exists ( select 1
   from public.inventory_items i
  where ((i.id = item_media.inventory_item_id) and public.can_access_workspace(i.workspace_id)))));

create policy "Inseratbilder anlegen" on public.listing_images
  for insert
  to authenticated
  with check (( select public.can_access_workspace(listing_images.workspace_id) as is_workspace_member));

create policy "Inseratbilder lesen" on public.listing_images
  for select
  to authenticated
  using (( select public.can_access_workspace(listing_images.workspace_id) as is_workspace_member));

create policy "Inseratbilder löschen" on public.listing_images
  for delete
  to authenticated
  using (( select public.can_access_workspace(listing_images.workspace_id) as is_workspace_member));

create policy "Inseratbilder ändern" on public.listing_images
  for update
  to authenticated
  using (( select public.can_access_workspace(listing_images.workspace_id) as is_workspace_member))
  with check (( select public.can_access_workspace(listing_images.workspace_id) as is_workspace_member));

create policy "Inserate lesen" on public.listings
  for select
  to authenticated
  using (( select public.can_access_workspace(listings.workspace_id) as is_workspace_member));

create policy "Inseratsinhalt ändern" on public.listings
  for update
  to authenticated
  using (( select public.can_access_workspace(listings.workspace_id) as is_workspace_member))
  with check (( select public.can_access_workspace(listings.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.market_research
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Recherche aendern" on public.market_research
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Recherche anlegen" on public.market_research
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Recherche loeschen" on public.market_research
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Recherchen lesen" on public.market_research
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.marketplace_account_entries
  for each row
  execute function public.protect_expired_workspace_business();

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.marketplace_account_sync_sources
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Mitglieder lesen Nummernvergaben" on public.number_assignments
  for select
  to authenticated
  using (( select public.can_access_workspace(number_assignments.workspace_id) as is_workspace_member));

create policy "Mitglieder lesen Nummernkreise" on public.number_series
  for select
  to authenticated
  using (( select public.can_access_workspace(number_series.workspace_id) as is_workspace_member));

create policy "Admins lesen Nummernänderungen" on public.number_series_changes
  for select
  to authenticated
  using (( select public.can_administer_workspace(number_series_changes.workspace_id) as is_workspace_admin));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.offline_purchase_entries
  for each row
  execute function public.protect_expired_workspace_business();

create policy offline_purchase_entries_delete on public.offline_purchase_entries
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy offline_purchase_entries_insert on public.offline_purchase_entries
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy offline_purchase_entries_select on public.offline_purchase_entries
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy offline_purchase_entries_update on public.offline_purchase_entries
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy price_tracked_items_delete on public.price_tracked_items
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy price_tracked_items_insert on public.price_tracked_items
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy price_tracked_items_select on public.price_tracked_items
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy price_tracked_items_update on public.price_tracked_items
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.purchase_costs
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Einkaufsnebenkosten aendern" on public.purchase_costs
  for update
  to authenticated
  using ((exists ( select 1
   from public.purchases p
  where ((p.id = purchase_costs.purchase_id) and public.can_access_workspace(p.workspace_id)))))
  with check ((exists ( select 1
   from public.purchases p
  where ((p.id = purchase_costs.purchase_id) and public.can_access_workspace(p.workspace_id)))));

create policy "Einkaufsnebenkosten anlegen" on public.purchase_costs
  for insert
  to authenticated
  with check ((exists ( select 1
   from public.purchases p
  where ((p.id = purchase_costs.purchase_id) and public.can_access_workspace(p.workspace_id)))));

create policy "Einkaufsnebenkosten lesen" on public.purchase_costs
  for select
  to authenticated
  using ((exists ( select 1
   from public.purchases p
  where ((p.id = purchase_costs.purchase_id) and public.can_access_workspace(p.workspace_id)))));

create policy "Einkaufsnebenkosten loeschen" on public.purchase_costs
  for delete
  to authenticated
  using ((exists ( select 1
   from public.purchases p
  where ((p.id = purchase_costs.purchase_id) and public.can_access_workspace(p.workspace_id)))));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.purchase_documents
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Belege anlegen" on public.purchase_documents
  for insert
  to authenticated
  with check ((( select public.can_access_workspace(purchase_documents.workspace_id) as is_workspace_member) and (created_by = ( select auth.uid() as uid)) and (exists ( select 1
   from public.purchases purchase
  where
    ((purchase.workspace_id = purchase_documents.workspace_id) and (purchase.id = purchase_documents.purchase_id) and ((purchase_documents.document_type <> 'self_receipt'::text) or
    ((purchase.receipt_mode = 'self'::text) and (purchase.entry_status = 'finalized'::text) and (purchase.finalized_at = purchase_documents.source_finalized_at))))))));

create policy "Belege entfernen" on public.purchase_documents
  for delete
  to authenticated
  using (((document_type <> 'self_receipt'::text) and ( select public.can_access_workspace(purchase_documents.workspace_id) as is_workspace_member) and (exists ( select 1
   from public.purchases purchase
  where ((purchase.workspace_id = purchase_documents.workspace_id) and (purchase.id = purchase_documents.purchase_id))))));

create policy "Belege lesen" on public.purchase_documents
  for select
  to authenticated
  using (( select public.can_access_workspace(purchase_documents.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.purchase_lines
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Einkaufspositionen aendern" on public.purchase_lines
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Einkaufspositionen anlegen" on public.purchase_lines
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Einkaufspositionen lesen" on public.purchase_lines
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Einkaufspositionen loeschen" on public.purchase_lines
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Mitglieder lesen Paketerfassungen" on public.purchase_package_capture_requests
  for select
  to authenticated
  using (( select public.can_access_workspace(purchase_package_capture_requests.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.purchase_receipt_requests
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Wareneingangsrequests lesen" on public.purchase_receipt_requests
  for select
  to authenticated
  using (( select public.can_access_workspace(purchase_receipt_requests.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.purchases
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Einkaeufe lesen" on public.purchases
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Einkauf aendern" on public.purchases
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Einkauf anlegen" on public.purchases
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Mitglieder lesen Kommentare" on public.record_comments
  for select
  to authenticated
  using ((( select public.can_access_workspace(record_comments.workspace_id) as is_workspace_member) and ((exists ( select 1
   from public.purchases p
  where ((p.workspace_id = record_comments.workspace_id) and (p.id = record_comments.purchase_id)))) or (exists ( select 1
   from public.sales s
  where ((s.workspace_id = record_comments.workspace_id) and (s.id = record_comments.sale_id)))))));

create policy "Mitglieder schreiben eigene Kommentare" on public.record_comments
  for insert
  to authenticated
  with check (((author_id = ( select auth.uid() as uid)) and ( select public.can_access_workspace(record_comments.workspace_id) as is_workspace_member) and ((exists ( select 1
   from public.purchases p
  where ((p.workspace_id = record_comments.workspace_id) and (p.id = record_comments.purchase_id)))) or (exists ( select 1
   from public.sales s
  where ((s.workspace_id = record_comments.workspace_id) and (s.id = record_comments.sale_id)))))));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.research_comparables
  for each row
  execute function public.protect_expired_workspace_business('market_research', 'research_id');

create policy "Vergleichsangebot aendern" on public.research_comparables
  for update
  to authenticated
  using ((exists ( select 1
   from public.market_research r
  where ((r.id = research_comparables.research_id) and public.can_access_workspace(r.workspace_id)))))
  with check ((exists ( select 1
   from public.market_research r
  where ((r.id = research_comparables.research_id) and public.can_access_workspace(r.workspace_id)))));

create policy "Vergleichsangebot anlegen" on public.research_comparables
  for insert
  to authenticated
  with check ((exists ( select 1
   from public.market_research r
  where ((r.id = research_comparables.research_id) and public.can_access_workspace(r.workspace_id)))));

create policy "Vergleichsangebot loeschen" on public.research_comparables
  for delete
  to authenticated
  using ((exists ( select 1
   from public.market_research r
  where ((r.id = research_comparables.research_id) and public.can_access_workspace(r.workspace_id)))));

create policy "Vergleichsangebote lesen" on public.research_comparables
  for select
  to authenticated
  using ((exists ( select 1
   from public.market_research r
  where ((r.id = research_comparables.research_id) and public.can_access_workspace(r.workspace_id)))));

create policy research_queries_delete on public.research_queries
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy research_queries_insert on public.research_queries
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy research_queries_select on public.research_queries
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.returns
  for each row
  execute function public.protect_expired_workspace_business();

create policy returns_select on public.returns
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.sale_cost_entries
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Verkaufskosten aendern" on public.sale_cost_entries
  for update
  to authenticated
  using (( select public.can_access_workspace(sale_cost_entries.workspace_id) as is_workspace_member))
  with check (( select public.can_access_workspace(sale_cost_entries.workspace_id) as is_workspace_member));

create policy "Verkaufskosten anlegen" on public.sale_cost_entries
  for insert
  to authenticated
  with check (( select public.can_access_workspace(sale_cost_entries.workspace_id) as is_workspace_member));

create policy "Verkaufskosten lesen" on public.sale_cost_entries
  for select
  to authenticated
  using (( select public.can_access_workspace(sale_cost_entries.workspace_id) as is_workspace_member));

create policy "Verkaufskosten loeschen" on public.sale_cost_entries
  for delete
  to authenticated
  using (( select public.can_access_workspace(sale_cost_entries.workspace_id) as is_workspace_member));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.sale_line_lot_allocations
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Loszuordnungen lesen" on public.sale_line_lot_allocations
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.sale_lines
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Verkaufspositionen lesen" on public.sale_lines
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.sales
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Verkaeufe lesen" on public.sales
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.shipping_orders
  for each row
  execute function public.protect_expired_workspace_business();

create policy shipping_orders_delete on public.shipping_orders
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy shipping_orders_insert on public.shipping_orders
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy shipping_orders_select on public.shipping_orders
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy shipping_orders_update on public.shipping_orders
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Mitglieder duerfen eigene Treffer lesen" on public.sniper_hits
  for select
  to authenticated
  using ((exists ( select 1
   from public.sniper_query_subscriptions subscription
  where ((subscription.id = sniper_hits.subscription_id) and public.can_access_workspace(subscription.workspace_id)))));

create policy "Abonnenten duerfen ihre Abfragen lesen" on public.sniper_queries
  for select
  to authenticated
  using ((exists ( select 1
   from public.sniper_query_subscriptions subscription
  where ((subscription.query_id = sniper_queries.id) and public.can_access_workspace(subscription.workspace_id)))));

create policy "Mitglieder duerfen eigene Abonnements lesen" on public.sniper_query_subscriptions
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Mitglieder lesen Merkzetteltreffer" on public.sniper_watchlist_hits
  for select
  to authenticated
  using ((exists ( select 1
   from public.sniper_watchlists watchlist
  where ((watchlist.id = sniper_watchlist_hits.watchlist_id) and public.can_access_workspace(watchlist.workspace_id)))));

create policy "Mitglieder lesen Merkzettel" on public.sniper_watchlists
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Quelle aendern" on public.sources
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Quelle anlegen" on public.sources
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Quelle loeschen" on public.sources
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Quellen lesen" on public.sources
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.stock_lots
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Bestandslose lesen" on public.stock_lots
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.stock_movements
  for each row
  execute function public.protect_expired_workspace_business();

create policy "Bestandsbewegungen lesen" on public.stock_movements
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.store_order_items
  for each row
  execute function public.protect_expired_workspace_business('store_orders', 'store_order_id');

create policy store_order_items_select on public.store_order_items
  for select
  to authenticated
  using ((exists ( select 1
   from public.store_orders o
  where ((o.id = store_order_items.store_order_id) and public.can_access_workspace(o.workspace_id)))));

create trigger "01_protect_workspace_access"
  before insert or delete or update on public.store_orders
  for each row
  execute function public.protect_expired_workspace_business();

create policy store_orders_select on public.store_orders
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy store_settings_delete on public.store_settings
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy store_settings_insert on public.store_settings
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy store_settings_select on public.store_settings
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy store_settings_update on public.store_settings
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Lieferant aendern" on public.suppliers
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Lieferant anlegen" on public.suppliers
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy "Lieferant loeschen" on public.suppliers
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy "Lieferanten lesen" on public.suppliers
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy tax_advisor_configs_delete on public.tax_advisor_configs
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy tax_advisor_configs_insert on public.tax_advisor_configs
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy tax_advisor_configs_select on public.tax_advisor_configs
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy tax_advisor_configs_update on public.tax_advisor_configs
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy webhook_configs_delete on public.webhook_configs
  for delete
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy webhook_configs_insert on public.webhook_configs
  for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

create policy webhook_configs_select on public.webhook_configs
  for select
  to authenticated
  using (public.can_access_workspace(workspace_id));

create policy webhook_configs_update on public.webhook_configs
  for update
  to authenticated
  using (public.can_access_workspace(workspace_id))
  with check (public.can_access_workspace(workspace_id));

create policy "Unternehmensdaten lesen" on public.workspace_company_profiles
  for select
  to authenticated
  using (( select public.can_access_workspace(workspace_company_profiles.workspace_id) as is_workspace_member));

alter table public.workspace_licenses
  add column ended_at timestamp with time zone;

create trigger broadcast_workspace_access
  after insert or update on public.workspace_licenses
  for each row
  execute function public.broadcast_workspace_access();
-- die cli erfasst verwaltete supabase-schemas und direkte standardrechte nicht vollständig.

revoke all on public.beta_registration_links, public.beta_lifecycle_operations from public, anon, authenticated;
grant select, insert, update, delete on public.beta_registration_links, public.beta_lifecycle_operations to service_role;
revoke all on sequence public.beta_registration_links_id_seq, public.beta_lifecycle_operations_id_seq from public, anon, authenticated;
grant usage, select on sequence public.beta_registration_links_id_seq, public.beta_lifecycle_operations_id_seq to service_role;
revoke all on function public.claim_beta_lifecycle_operation(uuid,uuid,text),
  public.prepare_beta_invitation(uuid,uuid,text),public.complete_beta_invitation(uuid,uuid,boolean,text),
  public.inspect_beta_registration(text),public.begin_beta_registration(text,uuid),
  public.complete_beta_registration(uuid,uuid),public.fail_beta_lifecycle_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_beta_lifecycle_operation(uuid,uuid,text),
  public.prepare_beta_invitation(uuid,uuid,text),public.complete_beta_invitation(uuid,uuid,boolean,text),
  public.inspect_beta_registration(text),public.begin_beta_registration(text,uuid),
  public.complete_beta_registration(uuid,uuid),public.fail_beta_lifecycle_operation(uuid,uuid) to service_role;
revoke all on function public.workspace_has_business_data(uuid) from public,anon,authenticated;
grant execute on function public.workspace_has_business_data(uuid) to service_role;
revoke all on function public.prepare_beta_withdrawal(uuid,uuid),public.complete_beta_withdrawal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_beta_withdrawal(uuid,uuid),public.complete_beta_withdrawal(uuid,uuid) to service_role;
revoke all on function public.protect_pending_beta_auth_deletion() from public,anon,authenticated,service_role;
revoke all on function public.workspace_access_is_valid(uuid),public.can_access_workspace(uuid),public.can_administer_workspace(uuid),public.user_can_access_workspace(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_access_workspace(uuid),public.can_administer_workspace(uuid) to authenticated,service_role;
grant execute on function public.workspace_access_is_valid(uuid),public.user_can_access_workspace(uuid,uuid) to service_role;
revoke all on function public.list_my_workspace_access() from public,anon;
grant execute on function public.list_my_workspace_access() to authenticated;
revoke all on function public.list_platform_beta_lifecycle() from public,anon;
grant execute on function public.list_platform_beta_lifecycle() to authenticated;
revoke all on function public.change_beta_duration(uuid,uuid,text,integer) from public,anon;
grant execute on function public.change_beta_duration(uuid,uuid,text,integer) to authenticated;
revoke all on function public.broadcast_workspace_access() from public,anon,authenticated,service_role;
revoke all on function public.user_has_workspace_access(uuid) from public,anon,authenticated;
grant execute on function public.user_has_workspace_access(uuid) to service_role;
revoke all on function public.protect_expired_workspace_business() from public,anon,authenticated,service_role;
alter policy "Produktmedien aendern" on storage.objects using (((bucket_id = 'item-media'::text) and (exists ( select 1
   from catalog_products p
  where (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((p.id)::text = (storage.foldername(objects.name))[3]) and is_catalog_product_media_path(objects.name, p.workspace_id, p.id) and ( select public.can_access_workspace(p.workspace_id) as is_workspace_member)))))) with check (((bucket_id = 'item-media'::text) and (exists ( select 1
   from catalog_products p
  where (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((p.id)::text = (storage.foldername(objects.name))[3]) and is_catalog_product_media_path(objects.name, p.workspace_id, p.id) and ( select public.can_access_workspace(p.workspace_id) as is_workspace_member))))));
alter policy "Artikelmedien lesen" on storage.objects using (((bucket_id = 'item-media'::text) and (split_part(name, '/'::text, 1) <> 'catalog-products'::text) and (cardinality(storage.foldername(name)) = 1) and (storage.filename(name) <> ''::text) and (exists ( select 1
   from (item_media m
     join inventory_items i on ((i.id = m.inventory_item_id)))
  where ((m.storage_path = objects.name) and ((i.id)::text = (storage.foldername(objects.name))[1]) and ( select public.can_access_workspace(i.workspace_id) as is_workspace_member))))));
alter policy "Artikelmedien hochladen" on storage.objects with check (((bucket_id = 'item-media'::text) and (split_part(name, '/'::text, 1) <> 'catalog-products'::text) and (cardinality(storage.foldername(name)) = 1) and (storage.filename(name) <> ''::text) and (exists ( select 1
   from inventory_items i
  where (((i.id)::text = (storage.foldername(objects.name))[1]) and ( select public.can_access_workspace(i.workspace_id) as is_workspace_member))))));
alter policy "Produktmedien hochladen" on storage.objects with check (((bucket_id = 'item-media'::text) and (exists ( select 1
   from catalog_products p
  where (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((p.id)::text = (storage.foldername(objects.name))[3]) and is_catalog_product_media_path(objects.name, p.workspace_id, p.id) and ( select public.can_access_workspace(p.workspace_id) as is_workspace_member))))));
alter policy "Artikelmedien aendern" on storage.objects using (((bucket_id = 'item-media'::text) and (split_part(name, '/'::text, 1) <> 'catalog-products'::text) and (cardinality(storage.foldername(name)) = 1) and (storage.filename(name) <> ''::text) and (exists ( select 1
   from (item_media m
     join inventory_items i on ((i.id = m.inventory_item_id)))
  where ((m.storage_path = objects.name) and ((i.id)::text = (storage.foldername(objects.name))[1]) and ( select public.can_access_workspace(i.workspace_id) as is_workspace_member)))))) with check (((bucket_id = 'item-media'::text) and (split_part(name, '/'::text, 1) <> 'catalog-products'::text) and (cardinality(storage.foldername(name)) = 1) and (storage.filename(name) <> ''::text) and (exists ( select 1
   from (item_media m
     join inventory_items i on ((i.id = m.inventory_item_id)))
  where ((m.storage_path = objects.name) and ((i.id)::text = (storage.foldername(objects.name))[1]) and ( select public.can_access_workspace(i.workspace_id) as is_workspace_member))))));
alter policy "Artikelmedien loeschen" on storage.objects using (((bucket_id = 'item-media'::text) and (split_part(name, '/'::text, 1) <> 'catalog-products'::text) and (cardinality(storage.foldername(name)) = 1) and (storage.filename(name) <> ''::text) and (exists ( select 1
   from (item_media m
     join inventory_items i on ((i.id = m.inventory_item_id)))
  where ((m.storage_path = objects.name) and ((i.id)::text = (storage.foldername(objects.name))[1]) and ( select public.can_access_workspace(i.workspace_id) as is_workspace_member))))));
alter policy "Produktmedien lesen" on storage.objects using (((bucket_id = 'item-media'::text) and (exists ( select 1
   from catalog_products p
  where (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((p.id)::text = (storage.foldername(objects.name))[3]) and is_catalog_product_media_path(objects.name, p.workspace_id, p.id) and ( select public.can_access_workspace(p.workspace_id) as is_workspace_member)))) and ((exists ( select 1
   from catalog_product_media m
  where (m.storage_path = objects.name))) or storage.allow_only_operation('object.delete'::text) or storage.allow_only_operation('object.delete_many'::text))));
alter policy "Produktmedien loeschen" on storage.objects using (((bucket_id = 'item-media'::text) and (exists ( select 1
   from catalog_products p
  where (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((p.id)::text = (storage.foldername(objects.name))[3]) and is_catalog_product_media_path(objects.name, p.workspace_id, p.id) and ( select public.can_access_workspace(p.workspace_id) as is_workspace_member))))));
alter policy "Belege hochladen" on storage.objects with check (((bucket_id = 'purchase-documents'::text) and (exists ( select 1
   from purchases purchase
  where (((purchase.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((purchase.id)::text = (storage.foldername(objects.name))[3]) and is_purchase_document_path(objects.name, purchase.workspace_id, purchase.id) and ( select public.can_access_workspace(purchase.workspace_id) as is_workspace_member))))));
alter policy "Belege lesen" on storage.objects using (((bucket_id = 'purchase-documents'::text) and (exists ( select 1
   from purchases purchase
  where (((purchase.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((purchase.id)::text = (storage.foldername(objects.name))[3]) and is_purchase_document_path(objects.name, purchase.workspace_id, purchase.id) and ( select public.can_access_workspace(purchase.workspace_id) as is_workspace_member))))));
alter policy "Ausgabenbelege hochladen" on storage.objects with check (((bucket_id = 'expense-documents'::text) and (exists ( select 1
   from expenses expense
  where (((expense.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((expense.id)::text = (storage.foldername(objects.name))[3]) and is_expense_document_path(objects.name, expense.workspace_id, expense.id) and ( select public.can_access_workspace(expense.workspace_id) as is_workspace_member))))));
alter policy "Ausgabenbelege lesen" on storage.objects using (((bucket_id = 'expense-documents'::text) and (exists ( select 1
   from expenses expense
  where (((expense.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((expense.id)::text = (storage.foldername(objects.name))[3]) and is_expense_document_path(objects.name, expense.workspace_id, expense.id) and ( select public.can_access_workspace(expense.workspace_id) as is_workspace_member))))));
alter policy "Ausgabenbelege entfernen" on storage.objects using (((bucket_id = 'expense-documents'::text) and (exists ( select 1
   from expenses expense
  where (((expense.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((expense.id)::text = (storage.foldername(objects.name))[3]) and is_expense_document_path(objects.name, expense.workspace_id, expense.id) and ( select public.can_access_workspace(expense.workspace_id) as is_workspace_member))))));
alter policy "Belegdateien entfernen" on storage.objects using (((bucket_id = 'purchase-documents'::text) and (exists ( select 1
   from purchases purchase
  where (((purchase.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((purchase.id)::text = (storage.foldername(objects.name))[3]) and is_purchase_document_path(objects.name, purchase.workspace_id, purchase.id) and ( select public.can_access_workspace(purchase.workspace_id) as is_workspace_member) and (not (exists ( select 1
           from purchase_documents document
          where ((document.storage_path = objects.name) and (document.document_type = 'self_receipt'::text))))))))));
alter policy "Eigene Inseratbilder hochladen" on storage.objects with check (((bucket_id = 'item-media'::text) and (exists ( select 1
   from listings listing
  where (((listing.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((listing.id)::text = (storage.foldername(objects.name))[3]) and (objects.name ~ (((('^listings/'::text || (listing.workspace_id)::text) || '/'::text) || (listing.id)::text) || '/[0-9a-f-]+\.(jpg|jpeg|png|webp|gif|avif)$'::text)) and ( select public.can_access_workspace(listing.workspace_id) as is_workspace_member))))));
alter policy "Eigene Inseratbilder lesen" on storage.objects using (((bucket_id = 'item-media'::text) and (exists ( select 1
   from listings listing
  where (((listing.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((listing.id)::text = (storage.foldername(objects.name))[3]) and (objects.name ~ (((('^listings/'::text || (listing.workspace_id)::text) || '/'::text) || (listing.id)::text) || '/[0-9a-f-]+\.(jpg|jpeg|png|webp|gif|avif)$'::text)) and ( select public.can_access_workspace(listing.workspace_id) as is_workspace_member))))));
alter policy "Eigene Inseratbilder löschen" on storage.objects using (((bucket_id = 'item-media'::text) and (exists ( select 1
   from listings listing
  where (((listing.workspace_id)::text = (storage.foldername(objects.name))[2]) and ((listing.id)::text = (storage.foldername(objects.name))[3]) and (objects.name ~ (((('^listings/'::text || (listing.workspace_id)::text) || '/'::text) || (listing.id)::text) || '/[0-9a-f-]+\.(jpg|jpeg|png|webp|gif|avif)$'::text)) and ( select public.can_access_workspace(listing.workspace_id) as is_workspace_member))))));
alter policy "Unternehmenslogos lesen" on storage.objects using (((bucket_id = 'company-assets'::text) and (exists ( select 1
   from workspace_members member
  where ((public.can_access_workspace(member.workspace_id) and member.user_id = ( select auth.uid() as uid)) and ((member.workspace_id)::text = (storage.foldername(objects.name))[1]) and is_company_logo_path(objects.name, member.workspace_id))))));
create policy "Mitglieder empfangen Zugangsänderungen" on realtime.messages for select to authenticated
using (extension='broadcast' and topic like 'workspace:%:access' and exists(
  select 1 from public.workspace_members where user_id=(select auth.uid()) and topic='workspace:'||workspace_id::text||':access'));
create trigger protect_pending_beta_auth_deletion before delete on auth.users for each row execute function public.protect_pending_beta_auth_deletion();
-- bestandseinladungen behalten die bisherige produktionsfrist von 24 stunden.
update public.beta_applications as application
set invitation_expires_at = coalesce(auth_user.confirmation_sent_at, application.invitation_sent_at) + interval '24 hours'
from auth.users as auth_user
where auth_user.id = application.auth_user_id and application.registered_at is null;
