-- Ein gewachsener Messverlauf muss unter normalen Benutzerrechten lesbar bleiben.
begin;
set local search_path = public, extensions;
select plan(1);
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('34010000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'statistics-performance@example.test', '{}', '{}');
insert into public.platform_operators(user_id) values ('34010000-0000-4000-8000-000000000001');
insert into public.workspaces(id, name) values ('34010000-0000-4000-8000-000000000011', 'Statistik mit Messhistorie');
insert into public.workspace_members(workspace_id, user_id, role)
values ('34010000-0000-4000-8000-000000000011', '34010000-0000-4000-8000-000000000001', 'owner');
insert into public.marketplace_connections(id, workspace_id, display_name, status)
values ('34010000-0000-4000-8000-000000000021', '34010000-0000-4000-8000-000000000011', 'Statistikkonto', 'connected');
insert into public.marketplace_account_entries(id, workspace_id, connection_id, kind, external_id, body, sort_at, observed_at)
select md5('statistics-performance-' || article)::uuid,
  '34010000-0000-4000-8000-000000000011', '34010000-0000-4000-8000-000000000021',
  'publication', 'statistics-performance-' || article,
  '{"title":"Artikel","metrics":{"views":5000,"favorites":0}}', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z'
from generate_series(1, 12) article;
insert into public.marketplace_listing_metric_observations(workspace_id, connection_id, entry_id, statistic_item_id, observed_at, views, favorites)
select item.workspace_id, item.connection_id, entry.id, item.id,
  entry.observed_at - (5000 - observation) * interval '5 minutes', observation, 0
from public.marketplace_listing_statistic_items item
join public.marketplace_account_entries entry on entry.workspace_id = item.workspace_id
  and entry.connection_id = item.connection_id and entry.external_id = item.external_id
cross join generate_series(1, 4999) observation
where item.connection_id = '34010000-0000-4000-8000-000000000021';
-- Nach Relistings gehören mehrere Anbieter-Serien zur selben dauerhaften Artikel-ID.
insert into public.marketplace_listing_statistic_items(workspace_id, connection_id, external_id, title, first_seen_at, last_seen_at, removed_at)
select workspace_id, connection_id, external_id || '-previous', 'Vorheriges Inserat',
  observed_at - interval '60 days', observed_at - interval '30 days', observed_at - interval '30 days'
from public.marketplace_account_entries
where connection_id = '34010000-0000-4000-8000-000000000021';
insert into public.marketplace_listing_metric_observations(workspace_id, connection_id, entry_id, statistic_item_id, observed_at, views, favorites)
select item.workspace_id, item.connection_id, entry.id, item.id,
  entry.observed_at - interval '30 days' - (5000 - observation) * interval '5 minutes', observation * 10, 0
from public.marketplace_listing_statistic_items item
join public.marketplace_account_entries entry on entry.workspace_id = item.workspace_id
  and entry.connection_id = item.connection_id and item.external_id = entry.external_id || '-previous'
cross join generate_series(1, 5000) observation
where item.connection_id = '34010000-0000-4000-8000-000000000021';
analyze public.marketplace_listing_metric_observations;
analyze public.marketplace_listing_statistic_items;
analyze public.marketplace_account_entries;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"34010000-0000-4000-8000-000000000001","role":"authenticated"}', true);
-- Deutlich unter dem produktiven Acht-Sekunden-Limit, mit ausreichend Spielraum für CI.
set local statement_timeout = '2s';
select is((select sum((item->>'views')::integer)::integer
  from jsonb_array_elements(public.marketplace_read_listing_metric_changes(
    '34010000-0000-4000-8000-000000000011', '34010000-0000-4000-8000-000000000021', 5)->'items') item),
  12, '120.000 Messpunkte liefern zwölf Vergleiche innerhalb derselben Inseratserie und des Zeitlimits');
reset role;
select * from finish();
rollback;
