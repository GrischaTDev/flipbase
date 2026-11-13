-- Vinted-Versandscheine je Verkauf. Der Worker fordert sie im Cloud-Browser an oder liest einen
-- bereits vorhandenen Schein, lädt die Datei herunter und legt sie privat ab. Vinteds eigener
-- Dateilink gilt nur sieben Tage; die Kopie bleibt für Druck und Reklamation erhalten.
create table public.marketplace_shipping_labels (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  external_transaction_id text not null check (external_transaction_id ~ '^[1-9][0-9]{0,31}$'),
  external_shipment_id text not null check (external_shipment_id ~ '^[1-9][0-9]{0,31}$'),
  external_conversation_id text check (external_conversation_id is null or external_conversation_id ~ '^[1-9][0-9]{0,31}$'),
  title text not null check (length(title) between 1 and 500),
  carrier_name text check (carrier_name is null or length(carrier_name) between 1 and 120),
  label_type text check (label_type is null or label_type in ('printable','digital')),
  storage_path text not null unique check (length(storage_path) between 1 and 300),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  requested_by_flipbase boolean not null default false,
  fetched_at timestamptz not null default now() check (isfinite(fetched_at)),
  created_at timestamptz not null default now(),
  unique (workspace_id,connection_id,external_transaction_id),
  foreign key (workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade
);
comment on table public.marketplace_shipping_labels is 'Private Kopien der Vinted-Versandscheine je Verkauf (Transaktion); Datei im Bucket marketplace-shipping-labels.';
create index marketplace_shipping_labels_list on public.marketplace_shipping_labels(workspace_id,fetched_at desc);
create index marketplace_shipping_labels_connection on public.marketplace_shipping_labels(workspace_id,connection_id);
alter table public.marketplace_shipping_labels enable row level security;
revoke all on public.marketplace_shipping_labels from public,anon,authenticated;
grant select on public.marketplace_shipping_labels to authenticated;
grant all on public.marketplace_shipping_labels to service_role;
revoke all on sequence public.marketplace_shipping_labels_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_shipping_labels_id_seq to service_role;
create policy "Administratoren lesen Versandscheine" on public.marketplace_shipping_labels for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Versandscheine nur durch den Worker anlegen" on public.marketplace_shipping_labels for insert to authenticated with check (false);
create policy "Versandscheine nur durch den Worker ändern" on public.marketplace_shipping_labels for update to authenticated using (false) with check (false);
create policy "Versandscheine nur durch den Worker löschen" on public.marketplace_shipping_labels for delete to authenticated using (false);
create policy "Worker liest Versandscheine" on public.marketplace_shipping_labels for select to service_role using (true);
create policy "Worker legt Versandscheine an" on public.marketplace_shipping_labels for insert to service_role with check (true);
create policy "Worker aktualisiert Versandscheine" on public.marketplace_shipping_labels for update to service_role using (true) with check (true);
create policy "Worker löscht Versandscheine" on public.marketplace_shipping_labels for delete to service_role using (true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marketplace-shipping-labels','marketplace-shipping-labels',false,10485760,array['application/pdf','image/png','image/jpeg']) on conflict(id) do nothing;

create policy "Administratoren lesen Versandschein-Dateien" on storage.objects for select to authenticated using (
  bucket_id='marketplace-shipping-labels' and exists(select 1 from public.marketplace_shipping_labels l
  where l.storage_path=name and public.marketplace_can_manage(l.workspace_id))
);
