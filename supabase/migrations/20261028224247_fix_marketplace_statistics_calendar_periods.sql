-- Korrigiert den Vorzeitraum der Marketplace-Statistik über Zeitumstellungen.
-- Betroffen: marketplace_read_listing_statistics_overview und die neue interne
-- Kalenderfunktion; keine Änderungen an Tabellen, Spalten oder Daten.
-- Aus dem Katalogdiff mit @supabase/pg-delta 1.0.0-alpha.33 erzeugt.
-- Der Release-Runner übernimmt die Transaktion.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

create function public.marketplace_listing_statistics_previous_end (
  p_at     timestamp with time zone,
  p_zone   text,
  p_length interval
)
  returns timestamp with time zone
  language sql
  immutable
  strict
  set search_path to ''
  as
  $function$
  select ((p_at at time zone p_zone) - p_length) at time zone p_zone;
$function$;

revoke all on function public.marketplace_listing_statistics_previous_end(timestamp
  with time zone, text, interval) from authenticated;

revoke all on function public.marketplace_listing_statistics_previous_end(timestamp
  with time zone, text, interval) from public;

create or replace function public.marketplace_read_listing_statistics_overview (
  p_workspace_id  uuid,
  p_period        text,
  p_connection_id uuid default null::uuid
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as
  $function$
declare
  v_unit text; v_zone text; v_step interval; v_length interval; v_bucket_count integer;
  v_last_bucket timestamp; v_first_bucket timestamp;
  v_start timestamptz; v_previous_start timestamptz; v_previous_end timestamptz;
  v_result jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or (p_connection_id is not null and not exists(
    select 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted')) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if p_period is null or p_period not in ('24h','7d','30d') then
    raise exception 'Ungültiger Statistikzeitraum' using errcode = '22023';
  end if;
  -- Stundenabschnitte in UTC, Tagesabschnitte nach deutschem Kalendertag.
  if p_period = '24h' then v_unit := 'hour'; v_zone := 'UTC'; v_step := interval '1 hour'; v_length := interval '24 hours'; v_bucket_count := 24;
  elsif p_period = '7d' then v_unit := 'day'; v_zone := 'Europe/Berlin'; v_step := interval '1 day'; v_length := interval '7 days'; v_bucket_count := 7;
  else v_unit := 'day'; v_zone := 'Europe/Berlin'; v_step := interval '1 day'; v_length := interval '30 days'; v_bucket_count := 30;
  end if;
  v_last_bucket := date_trunc(v_unit, now() at time zone v_zone);
  v_first_bucket := v_last_bucket - (v_bucket_count - 1) * v_step;
  v_start := v_first_bucket at time zone v_zone;
  v_previous_start := (v_first_bucket - v_length) at time zone v_zone;
  -- Der Vorzeitraum zählt nur bis zur entsprechenden Kalenderuhrzeit. Die absolute
  -- Laufzeit wäre bei der Zeitumstellung unterschiedlich lang und könnte Zeiträume überlappen.
  v_previous_end := public.marketplace_listing_statistics_previous_end(now(), v_zone, v_length);

  with items as (
    select i.*, c.display_name as account_name
    from public.marketplace_listing_statistic_items i
    join public.marketplace_connections c on c.workspace_id = i.workspace_id and c.id = i.connection_id
    where i.workspace_id = p_workspace_id and c.marketplace = 'vinted' and (p_connection_id is null or i.connection_id = p_connection_id)
  ),
  series as (
    -- Nur das Zeitfenster wird eingelesen; unbekannte Werte fallen heraus.
    select o.statistic_item_id, o.observed_at, m.metric, m.value
    from public.marketplace_listing_metric_observations o
    join items i on i.id = o.statistic_item_id
    cross join lateral (values ('views', o.views), ('favorites', o.favorites)) m(metric, value)
    where o.observed_at >= v_previous_start and m.value is not null
    union all
    -- Ausgangswert: letzter bekannter Stand vor dem Vorzeitraum, je Artikel und Kennzahl,
    -- direkt über den Index (statistic_item_id, observed_at).
    select i.id, b.observed_at, m.metric, b.value
    from items i cross join (values ('views'), ('favorites')) m(metric)
    cross join lateral (
      select o.observed_at, case m.metric when 'views' then o.views else o.favorites end as value
      from public.marketplace_listing_metric_observations o
      where o.statistic_item_id = i.id and o.observed_at < v_previous_start
        and case m.metric when 'views' then o.views else o.favorites end is not null
      order by o.observed_at desc limit 1
    ) b
  ),
  gains as (
    select s.statistic_item_id, s.observed_at, s.metric,
      greatest(0, s.value - lag(s.value) over (partition by s.statistic_item_id, s.metric order by s.observed_at)) as gain
    from series s
  ),
  counted as (
    select g.* from gains g where g.gain is not null and g.observed_at >= v_previous_start
  ),
  bucket_list as (
    select g as bucket from generate_series(v_first_bucket, v_last_bucket, v_step) g
  ),
  bucket_totals as (
    select b.bucket,
      coalesce(sum(c.gain) filter (where c.metric = 'views'), 0) as views,
      coalesce(sum(c.gain) filter (where c.metric = 'favorites'), 0) as favorites
    from bucket_list b
    left join counted c on c.observed_at >= v_start and date_trunc(v_unit, c.observed_at at time zone v_zone) = b.bucket
    group by b.bucket
  ),
  item_totals as (
    select i.id, i.connection_id, i.account_name, i.external_id, i.title, i.image_url, i.price, i.currency, i.removed_at,
      coalesce(sum(c.gain) filter (where c.metric = 'views'), 0) as views,
      coalesce(sum(c.gain) filter (where c.metric = 'favorites'), 0) as favorites
    from items i join counted c on c.statistic_item_id = i.id and c.observed_at >= v_start
    group by i.id, i.connection_id, i.account_name, i.external_id, i.title, i.image_url, i.price, i.currency, i.removed_at
  ),
  ranked as (
    select t.*,
      row_number() over (order by t.views desc, t.favorites desc, t.id) as views_rank,
      row_number() over (order by t.favorites desc, t.views desc, t.id) as favorites_rank
    from item_totals t where t.views > 0 or t.favorites > 0
  )
  select jsonb_build_object(
    'workspaceId', p_workspace_id,
    'connectionId', p_connection_id,
    'period', p_period,
    'historyStartsAt', (select min(first_seen_at) from items),
    'activeCount', (select count(*) from public.marketplace_account_entries e
      join public.marketplace_connections c on c.workspace_id=e.workspace_id and c.id=e.connection_id
      where e.workspace_id=p_workspace_id and c.marketplace='vinted' and e.kind='publication'
        and (p_connection_id is null or e.connection_id=p_connection_id)
        and e.body->>'publicationState' in ('active','reserved')),
    'totals', jsonb_build_object(
      'views', coalesce((select sum(gain) from counted where metric = 'views' and observed_at >= v_start), 0),
      'favorites', coalesce((select sum(gain) from counted where metric = 'favorites' and observed_at >= v_start), 0)),
    'previousTotals', case when (select min(first_seen_at) from items) <= v_previous_start then jsonb_build_object(
      'views', coalesce((select sum(gain) from counted where metric = 'views' and observed_at < v_previous_end), 0),
      'favorites', coalesce((select sum(gain) from counted where metric = 'favorites' and observed_at < v_previous_end), 0)) end,
    'buckets', (select jsonb_agg(jsonb_build_object('start', b.bucket at time zone v_zone, 'views', b.views, 'favorites', b.favorites) order by b.bucket) from bucket_totals b),
    'topItems', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id::text, 'connectionId', r.connection_id, 'accountName', r.account_name,
        'entryId', case when r.removed_at is null then (select e.id from public.marketplace_account_entries e
          where e.workspace_id = p_workspace_id and e.connection_id = r.connection_id and e.kind = 'publication' and e.external_id = r.external_id) end,
        'title', r.title, 'imageUrl', r.image_url, 'price', r.price, 'currency', r.currency, 'removedAt', r.removed_at,
        'views', r.views, 'favorites', r.favorites,
        'totalViews', (select o.views from public.marketplace_listing_metric_observations o where o.statistic_item_id = r.id and o.views is not null order by o.observed_at desc limit 1),
        'totalFavorites', (select o.favorites from public.marketplace_listing_metric_observations o where o.statistic_item_id = r.id and o.favorites is not null order by o.observed_at desc limit 1)
      ) order by r.views desc, r.favorites desc, r.id) from ranked r where r.views_rank <= 25 or r.favorites_rank <= 25), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
