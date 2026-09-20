-- Verkäuferangaben je Einkauf als eigener Snapshot und ein eng begrenzter
-- Nachtrag, der auch abgeschlossene Einkäufe nur in ihren Herkunftsangaben ändert.
-- Betroffen: purchases.seller_type, seller_name,
-- seller_street, seller_address_extra, seller_postal_code, seller_city,
-- seller_country_code, seller_details_version sowie die
-- Funktionen normalize_purchase_seller_details, purchase_seller_details_snapshot
-- und update_purchase_seller_details.

alter table public.purchases
  add column if not exists seller_type text
    constraint purchases_seller_type_check
    check (seller_type in ('private', 'business')),
  add column if not exists seller_name text
    constraint purchases_seller_name_length_check
    check (pg_catalog.char_length(seller_name) between 1 and 200),
  add column if not exists seller_street text
    constraint purchases_seller_street_length_check
    check (pg_catalog.char_length(seller_street) between 1 and 200),
  add column if not exists seller_address_extra text
    constraint purchases_seller_address_extra_length_check
    check (pg_catalog.char_length(seller_address_extra) between 1 and 200),
  add column if not exists seller_postal_code text
    constraint purchases_seller_postal_code_length_check
    check (pg_catalog.char_length(seller_postal_code) between 1 and 20),
  add column if not exists seller_city text
    constraint purchases_seller_city_length_check
    check (pg_catalog.char_length(seller_city) between 1 and 100),
  add column if not exists seller_country_code text
    constraint purchases_seller_country_code_check
    check (seller_country_code ~ '^[A-Z]{2}$'),
  add column if not exists seller_details_version integer not null default 0
    constraint purchases_seller_details_version_check
    check (seller_details_version >= 0);

comment on column public.purchases.seller_type is
  'Verkäuferart dieses Einkaufs: private oder business. Leer heißt unbekannt, nicht privat.';
comment on column public.purchases.seller_name is
  'Name des Verkäufers, wie er für diesen Einkauf erfasst wurde (Snapshot).';
comment on column public.purchases.seller_street is
  'Straße und Hausnummer des Verkäufers für diesen Einkauf (Snapshot).';
comment on column public.purchases.seller_address_extra is
  'Adresszusatz des Verkäufers für diesen Einkauf (Snapshot).';
comment on column public.purchases.seller_postal_code is
  'Postleitzahl des Verkäufers für diesen Einkauf (Snapshot).';
comment on column public.purchases.seller_city is
  'Ort des Verkäufers für diesen Einkauf (Snapshot).';
comment on column public.purchases.seller_country_code is
  'ISO-3166-1-Alpha-2-Ländercode des Verkäufers für diesen Einkauf (Snapshot).';
comment on column public.purchases.seller_details_version is
  'Steigt bei jeder Änderung der Herkunftsangaben und schützt Nachträge vor veralteten Ständen.';

-- Beide Hilfsfunktionen liefern dieselbe JSON-Form. Nur so vergleichen Anlegen,
-- Entwurfsspeichern und Nachtrag Herkunftsangaben auf dieselbe Weise.
create or replace function public.normalize_purchase_seller_details(p_details jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'source_id', pg_catalog.lower(nullif(pg_catalog.btrim(p_details ->> 'source_id'), '')),
    'supplier_id', pg_catalog.lower(nullif(pg_catalog.btrim(p_details ->> 'supplier_id'), '')),
    'seller_type', nullif(pg_catalog.btrim(p_details ->> 'seller_type'), ''),
    'seller_name', nullif(pg_catalog.btrim(p_details ->> 'seller_name'), ''),
    'seller_street', nullif(pg_catalog.btrim(p_details ->> 'seller_street'), ''),
    'seller_address_extra', nullif(pg_catalog.btrim(p_details ->> 'seller_address_extra'), ''),
    'seller_postal_code', nullif(pg_catalog.btrim(p_details ->> 'seller_postal_code'), ''),
    'seller_city', nullif(pg_catalog.btrim(p_details ->> 'seller_city'), ''),
    'seller_country_code',
      pg_catalog.upper(nullif(pg_catalog.btrim(p_details ->> 'seller_country_code'), '')),
    'supplier_reference', nullif(pg_catalog.btrim(p_details ->> 'supplier_reference'), '')
  );
$$;

alter function public.normalize_purchase_seller_details(jsonb) owner to postgres;
revoke all on function public.normalize_purchase_seller_details(jsonb)
  from public, anon, authenticated, service_role;

comment on function public.normalize_purchase_seller_details(jsonb) is
  'Normalisiert Herkunftsangaben eines Einkaufs: Text getrimmt, leer wird null, Ländercode groß.';

create or replace function public.purchase_seller_details_snapshot(p_purchase public.purchases)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'source_id', p_purchase.source_id::text,
    'supplier_id', p_purchase.supplier_id::text,
    'seller_type', p_purchase.seller_type,
    'seller_name', p_purchase.seller_name,
    'seller_street', p_purchase.seller_street,
    'seller_address_extra', p_purchase.seller_address_extra,
    'seller_postal_code', p_purchase.seller_postal_code,
    'seller_city', p_purchase.seller_city,
    'seller_country_code', p_purchase.seller_country_code,
    'supplier_reference', p_purchase.supplier_reference
  );
$$;

alter function public.purchase_seller_details_snapshot(public.purchases) owner to postgres;
revoke all on function public.purchase_seller_details_snapshot(public.purchases)
  from public, anon, authenticated, service_role;

comment on function public.purchase_seller_details_snapshot(public.purchases) is
  'Liest die Herkunftsangaben eines gespeicherten Einkaufs in derselben Form wie normalize_purchase_seller_details.';

-- security definer ist nötig: guard_purchase_costing_fields sperrt abgeschlossene
-- Einkäufe für direkte Änderungen. Diese Funktion schreibt deshalb ausschließlich
-- Herkunftsangaben und prüft Mitgliedschaft, Workspace-Zugehörigkeit und Version selbst.
create or replace function public.update_purchase_seller_details(
  p_workspace_id uuid,
  p_purchase_id uuid,
  p_expected_version integer,
  p_details jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_actor_id is null or not public.is_workspace_member(p_workspace_id) then
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
$$;

alter function public.update_purchase_seller_details(uuid, uuid, integer, jsonb, text) owner to postgres;
revoke all on function public.update_purchase_seller_details(uuid, uuid, integer, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_seller_details(uuid, uuid, integer, jsonb, text)
  to authenticated;

comment on function public.update_purchase_seller_details(uuid, uuid, integer, jsonb, text) is
  'Trägt Quelle, Verkäufer-Snapshot und Referenz nach, auch bei abgeschlossenen Einkäufen. Ändert keine Kosten, Positionen, Bestände oder Status.';
