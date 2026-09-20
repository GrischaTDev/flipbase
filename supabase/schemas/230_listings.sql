-- Gespeicherte und statusgeführte Kleinanzeigen-Inserate je Workspace.

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid not null,
  platform text not null default 'kleinanzeigen' check (platform = 'kleinanzeigen'),
  status text not null default 'prepared' check (status in ('prepared', 'online', 'ended')),
  end_reason text check (end_reason in ('sold', 'manual')),
  title text not null check (char_length(btrim(title)) between 1 and 65),
  description text not null check (char_length(description) <= 4000),
  price numeric(12,2) not null check (price between 0 and 99999999),
  price_type text not null check (price_type in ('FIXED', 'NEGOTIABLE')),
  shipping_type text not null check (shipping_type in ('pickup', 'shipping', 'both')),
  shipping_price numeric(12,2) constraint listings_shipping_price_nonnegative_check check (shipping_price >= 0),
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  listed_count integer not null default 0 check (listed_count >= 0),
  last_listed_at timestamptz,
  online_since timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_workspace_id_id_key unique (workspace_id, id),
  constraint listings_item_workspace_fkey foreign key (workspace_id, inventory_item_id)
    references public.inventory_items(workspace_id, id) on delete cascade,
  constraint listings_shipping_price_check check (
    (shipping_type = 'pickup' and shipping_price is null)
    or shipping_type in ('shipping', 'both')
  ),
  constraint listings_end_state_check check (
    (status = 'ended' and end_reason is not null and ended_at is not null)
    or (status <> 'ended' and end_reason is null and ended_at is null)
  )
);

comment on table public.listings is 'Gespeicherte und statusgeführte Verkaufsinserate eines Workspace.';

create unique index listings_one_open_per_item
  on public.listings (inventory_item_id, platform)
  where status <> 'ended';

create index listings_workspace_status_updated_idx
  on public.listings (workspace_id, status, updated_at desc, id desc);

create index listings_inventory_item_id_idx on public.listings (inventory_item_id);

alter table public.listings enable row level security;

create or replace function public.touch_listing_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

alter function public.touch_listing_updated_at() owner to postgres;
revoke all on function public.touch_listing_updated_at() from public, anon, authenticated, service_role;

create trigger listings_touch_updated_at
before update on public.listings
for each row execute function public.touch_listing_updated_at();

create trigger "00_protect_archived_workspace"
before insert or update or delete on public.listings
for each row execute function public.protect_archived_workspace_data();

revoke all on table public.listings from public, anon, authenticated, service_role;
grant select on table public.listings to authenticated;
grant update (title, description, price, price_type, shipping_type, shipping_price, postal_code)
  on table public.listings to authenticated;

create policy "Inserate lesen"
on public.listings
for select
to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy "Inseratsinhalt ändern"
on public.listings
for update
to authenticated
using ((select public.is_workspace_member(workspace_id)))
with check ((select public.is_workspace_member(workspace_id)));
