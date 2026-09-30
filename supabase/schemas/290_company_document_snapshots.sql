-- Unveränderliche Unternehmensdaten neuer Rechnungen, Gutschriften und Eigenbelege.
-- Bestehende Rechnungen, Retouren und PDFs werden ausdrücklich nicht umgeschrieben.

alter table public.returns add column credit_note_snapshot jsonb;
alter table public.purchase_documents add column company_snapshot jsonb;
comment on column public.returns.credit_note_snapshot is
  'Absender, Käufer und Steuerhinweis bei der Retourenbuchung; Originalrechnung hat Vorrang.';
comment on column public.purchase_documents.company_snapshot is
  'Im erzeugten Eigenbeleg verwendete Unternehmensdaten; historische Belege bleiben null.';

create or replace function public.company_document_party(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_profile public.workspace_company_profiles;
  v_tax_mode text;
  v_missing jsonb := '[]'::jsonb;
begin
  select * into v_profile from public.workspace_company_profiles
    where workspace_id = p_workspace_id;
  select tax_mode into v_tax_mode from public.workspaces where id = p_workspace_id;
  if nullif(btrim(v_profile.legal_name), '') is null then v_missing := v_missing || '["legalName"]'::jsonb; end if;
  if nullif(btrim(v_profile.street), '') is null then v_missing := v_missing || '["street"]'::jsonb; end if;
  if nullif(btrim(v_profile.house_number), '') is null then v_missing := v_missing || '["houseNumber"]'::jsonb; end if;
  if nullif(btrim(v_profile.postal_code), '') is null then v_missing := v_missing || '["postalCode"]'::jsonb; end if;
  if nullif(btrim(v_profile.city), '') is null then v_missing := v_missing || '["city"]'::jsonb; end if;
  if nullif(btrim(v_profile.country_code), '') is null then v_missing := v_missing || '["countryCode"]'::jsonb; end if;
  if v_tax_mode is null or v_tax_mode not in ('diff_25a', 'kleinunternehmer_19', 'regular_19') then v_missing := v_missing || '["taxMode"]'::jsonb; end if;
  if nullif(btrim(v_profile.tax_number), '') is null and nullif(btrim(v_profile.vat_id), '') is null then v_missing := v_missing || '["taxIdentifier"]'::jsonb; end if;
  if jsonb_array_length(v_missing) > 0 then
    raise exception using message = 'company_profile_incomplete', detail = v_missing::text;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'name', v_profile.legal_name, 'company', v_profile.company_name,
    'street', v_profile.street || ' ' || v_profile.house_number,
    'postalCode', v_profile.postal_code, 'city', v_profile.city, 'country', v_profile.country_code,
    'email', v_profile.email, 'phone', v_profile.phone, 'taxId', v_profile.tax_number,
    'vatId', v_profile.vat_id, 'iban', v_profile.iban, 'bic', v_profile.bic,
    'bankName', v_profile.bank_name, 'logoPath', v_profile.logo_path
  ));
end;
$$;
revoke all on function public.company_document_party(uuid) from public, anon, authenticated, service_role;

create or replace function public.capture_invoice_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.seller is distinct from old.seller or new.workspace_id is distinct from old.workspace_id then
      raise exception 'Der gespeicherte Rechnungsabsender darf nicht geändert werden.';
    end if;
  else
    new.seller := public.company_document_party(new.workspace_id);
    if new.store_order_id is not null then
      select tax_mode into new.tax_mode from public.workspaces where id = new.workspace_id;
      new.tax_clause := case new.tax_mode
        when 'regular_19' then 'Der Gesamtbetrag enthält die gesetzliche Umsatzsteuer in Höhe von 19%.'
        when 'kleinunternehmer_19' then 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).'
        else 'Sonderregelung für Gebrauchtgegenstände nach § 25a UStG (Differenzbesteuerung). Ein gesonderter Ausweis der Umsatzsteuer erfolgt nicht.' end;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_invoice_company() from public, anon, authenticated, service_role;
create trigger capture_invoice_company before insert or update on public.invoices
  for each row execute function public.capture_invoice_company();

create or replace function public.capture_return_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.invoices;
  v_seller jsonb;
  v_tax_mode text;
  v_tax_mode_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.credit_note_snapshot is distinct from old.credit_note_snapshot
      or new.workspace_id is distinct from old.workspace_id or new.sale_id is distinct from old.sale_id then
      raise exception 'Die gespeicherten Gutschriftdaten dürfen nicht geändert werden.';
    end if;
    return new;
  end if;
  select * into v_original from public.invoices
    where workspace_id = new.workspace_id and sale_id = new.sale_id;
  if found then
    if nullif(v_original.seller ->> 'name', '') is null then
      new.credit_note_snapshot := null;
    else
      new.credit_note_snapshot := jsonb_build_object(
        'seller', v_original.seller, 'buyer', v_original.buyer,
        'taxMode', v_original.tax_mode, 'taxClause', coalesce(v_original.tax_clause, ''),
        'originalInvoiceNumber', v_original.invoice_number
      );
    end if;
  else
    begin
      v_seller := public.company_document_party(new.workspace_id);
    exception when raise_exception then
      if sqlerrm <> 'company_profile_incomplete' then raise; end if;
      -- Die Erstattung bleibt möglich; ohne vollständige Stammdaten kein Gutschriftbeleg.
      new.credit_note_snapshot := null;
      return new;
    end;
    select count(distinct tax_mode), min(tax_mode) into v_tax_mode_count, v_tax_mode
      from public.sale_lines where workspace_id = new.workspace_id and sale_id = new.sale_id;
    if v_tax_mode_count <> 1 then
      -- Fehlende oder gemischte historische Steuerarten dürfen nicht durch heutige Vorgaben ersetzt werden.
      new.credit_note_snapshot := null;
      return new;
    end if;
    new.credit_note_snapshot := jsonb_build_object(
      'seller', v_seller,
      'buyer', jsonb_build_object('name', coalesce(new.buyer_name, 'Kunde'), 'street', '', 'postalCode', '', 'city', '', 'country', ''),
      'taxMode', v_tax_mode,
      'taxClause', case v_tax_mode
        when 'regular_19' then 'Der Gesamtbetrag enthält die gesetzliche Umsatzsteuer in Höhe von 19%.'
        when 'kleinunternehmer_19' then 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).'
        else 'Sonderregelung für Gebrauchtgegenstände nach § 25a UStG (Differenzbesteuerung). Ein gesonderter Ausweis der Umsatzsteuer erfolgt nicht.' end,
      'originalInvoiceNumber', null
    );
  end if;
  return new;
end;
$$;
revoke all on function public.capture_return_company() from public, anon, authenticated, service_role;
create trigger capture_return_company before insert or update on public.returns
  for each row execute function public.capture_return_company();

create or replace function public.check_self_receipt_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.company_snapshot is distinct from old.company_snapshot
      or new.workspace_id is distinct from old.workspace_id
      or new.document_type is distinct from old.document_type
      or new.purchase_id is distinct from old.purchase_id
      or new.storage_path is distinct from old.storage_path then
      raise exception 'Die gespeicherten Eigenbelegdaten dürfen nicht geändert werden.';
    end if;
  elsif new.document_type = 'self_receipt' then
    if new.company_snapshot is distinct from public.company_document_party(new.workspace_id) then
      raise exception 'Die Unternehmensdaten wurden geändert. Bitte erstelle den Eigenbeleg erneut.';
    end if;
  elsif new.company_snapshot is not null then
    raise exception 'Ein Unternehmenssnapshot ist nur für Eigenbelege zulässig.';
  end if;
  return new;
end;
$$;
revoke all on function public.check_self_receipt_company() from public, anon, authenticated, service_role;
create trigger check_self_receipt_company before insert or update on public.purchase_documents
  for each row execute function public.check_self_receipt_company();

-- Vorhandene Rechnungen bleiben auch bei inzwischen unvollständigem Profil lesbar.
create or replace function public.create_or_get_invoice(
  p_workspace_id uuid,
  p_sale_id uuid,
  p_store_order_id uuid,
  p_invoice jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_created boolean := false;
  v_items jsonb;
begin
  if (select auth.uid()) is null
    or not (select public.is_workspace_member(p_workspace_id)) then
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
$$;
