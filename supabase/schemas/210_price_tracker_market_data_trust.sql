-- Kennzeichnet Marktwerte, die aus einer tatsächlich angebundenen Quelle stammen.
-- Betroffen: public.price_tracked_items.

alter table public.price_tracked_items
  add column if not exists market_data_verified boolean not null default false;

comment on column public.price_tracked_items.market_data_verified is
  'Nur wahr, wenn die Marktwerte durch eine echte Datenquelle bestätigt wurden.';
