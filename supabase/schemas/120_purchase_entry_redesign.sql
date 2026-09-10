-- Vereinfacht Verkäuferkontakte, Paketpreise sowie Status und Tracking von Einkäufen.
-- Betroffen: suppliers.country_code, purchases.arrived_at,
-- purchase_lines.unit_purchase_price und die zugehörigen Statusfunktionen.

alter table public.suppliers
  add column if not exists country_code text;

alter table public.suppliers
  add constraint suppliers_country_code_check
  check (country_code is null or country_code ~ '^[A-Z]{2}$') not valid;

alter table public.suppliers
  add constraint suppliers_phone_e164_check
  check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$') not valid;

comment on column public.suppliers.country_code is
  'ISO-3166-1-Alpha-2-Ländercode der Verkäuferadresse.';

alter table public.purchases
  add column if not exists arrived_at timestamptz;

comment on column public.purchases.arrived_at is
  'Fachlicher Zeitpunkt, zu dem der Einkauf als angekommen bestätigt wurde.';

create or replace function public.update_purchase_workflow(
  p_purchase_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  if not found or not public.is_workspace_member(v_before.workspace_id) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Einkauf.';
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
$$;

alter function public.update_purchase_workflow(uuid, text) owner to postgres;
revoke all on function public.update_purchase_workflow(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_workflow(uuid, text) to authenticated;

comment on function public.update_purchase_workflow(uuid, text) is
  'Ändert Bestellt oder Angekommen samt unveränderlichem Fachereignis atomar.';

create or replace function public.update_purchase_tracking(
  p_purchase_id uuid,
  p_tracking_number text,
  p_tracking_carrier text,
  p_tracking_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  if not found or not public.is_workspace_member(v_before.workspace_id) then
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
$$;

alter function public.update_purchase_tracking(uuid, text, text, text) owner to postgres;
revoke all on function public.update_purchase_tracking(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_purchase_tracking(uuid, text, text, text) to authenticated;

comment on function public.update_purchase_tracking(uuid, text, text, text) is
  'Ändert freiwilliges Tracking samt unveränderlichem Fachereignis atomar.';
