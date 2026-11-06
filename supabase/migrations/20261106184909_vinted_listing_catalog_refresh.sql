-- Zweck: Plattform-Admins können den Vinted-Katalog sofort neu einlesen lassen und seinen Stand sehen.
-- Neue Tabelle vinted_listing_catalog_refreshes (genau eine Zeile) mit Lese-Policy für Admins,
-- neue Funktionen request_vinted_listing_catalog_refresh und vinted_listing_catalog_status. Nicht destruktiv.

-- Auftrag aus dem Plattform-Admin, den Katalog sofort vollständig neu einzulesen. Der Worker liest
-- dann beim nächsten Kontoabgleich alles, was vor dem Auftrag gelesen wurde, in größeren Blöcken.
create table public.vinted_listing_catalog_refreshes (
  id integer primary key default 1 check (id = 1),
  requested_at timestamptz not null,
  requested_by uuid references auth.users(id) on delete set null
);
comment on table public.vinted_listing_catalog_refreshes is 'Letzter Auftrag, den Vinted-Katalog neu einzulesen; genau eine Zeile.';
create index vinted_listing_catalog_refreshes_requested_by on public.vinted_listing_catalog_refreshes(requested_by);
alter table public.vinted_listing_catalog_refreshes enable row level security;
revoke all on public.vinted_listing_catalog_refreshes from public, anon, authenticated;
grant select on public.vinted_listing_catalog_refreshes to authenticated;
grant all on public.vinted_listing_catalog_refreshes to service_role;
create policy "Platform operators read catalog refreshes" on public.vinted_listing_catalog_refreshes
  for select to authenticated using ((select public.is_platform_operator()));

-- Setzt den Auftrag; nur für Plattform-Admins. Läuft als Eigentümer, weil Clients die Tabelle
-- nicht direkt beschreiben dürfen.
create or replace function public.request_vinted_listing_catalog_refresh()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz := clock_timestamp();
begin
  if not public.is_platform_operator() then raise exception 'Nur für die Plattform-Administration.'; end if;
  insert into public.vinted_listing_catalog_refreshes(id, requested_at, requested_by)
  values (1, v_at, (select auth.uid()))
  on conflict (id) do update set requested_at = excluded.requested_at, requested_by = excluded.requested_by;
  return v_at;
end;
$$;
revoke all on function public.request_vinted_listing_catalog_refresh() from public, anon;
grant execute on function public.request_vinted_listing_catalog_refresh() to authenticated;

-- Stand des Katalogs für die Administration: Umfang, Aktualität und offener Auftrag.
create or replace function public.vinted_listing_catalog_status()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_requested timestamptz; v_due timestamptz;
begin
  if not public.is_platform_operator() then raise exception 'Nur für die Plattform-Administration.'; end if;
  select r.requested_at into v_requested from public.vinted_listing_catalog_refreshes r where r.id = 1;
  v_due := greatest(clock_timestamp() - interval '7 days', coalesce(v_requested, '-infinity'::timestamptz));
  return (
    select jsonb_build_object(
      'categories', count(*),
      'leaves', count(*) filter (where c.is_leaf),
      'leavesWithFields', count(*) filter (where c.is_leaf and c.fields_observed_at is not null),
      'leavesDue', count(*) filter (where c.is_leaf and (c.fields_observed_at is null or c.fields_observed_at < v_due)),
      'treeObservedAt', max(c.tree_observed_at),
      'oldestFieldsObservedAt', min(c.fields_observed_at) filter (where c.is_leaf),
      'refreshRequestedAt', v_requested
    )
    from public.vinted_listing_categories c
  );
end;
$$;
revoke all on function public.vinted_listing_catalog_status() from public, anon;
grant execute on function public.vinted_listing_catalog_status() to authenticated;
