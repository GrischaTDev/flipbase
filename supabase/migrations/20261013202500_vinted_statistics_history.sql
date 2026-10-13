-- Zweck: Messhistorie bleibt erhalten, wenn ein Vinted-Inserat verschwindet; neue Lesefunktion für die Statistikseite.
-- Betroffen: neue Tabelle public.marketplace_listing_statistic_items; public.marketplace_listing_metric_observations
--   (neue Spalte statistic_item_id, entry_id wahlfrei mit on delete set null, neuer Eindeutigkeitsschlüssel);
--   Trigger auf public.marketplace_account_entries; Funktion public.marketplace_read_listing_statistics_overview.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

-- Dauerhafter Statistik-Datensatz je Vinted-Artikel. Er überlebt das Verschwinden des Inserats,
-- damit vergangene Zeiträume nachträglich nicht kleiner werden.
create table public.marketplace_listing_statistic_items (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  external_id text not null check (char_length(external_id) between 1 and 256),
  title text not null,
  image_url text,
  price numeric,
  currency text,
  first_seen_at timestamptz not null check (isfinite(first_seen_at)),
  last_seen_at timestamptz not null check (isfinite(last_seen_at)),
  removed_at timestamptz,
  unique (workspace_id, connection_id, external_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_listing_statistic_items is 'Dauerhafte Stammdaten je Vinted-Artikel für die Statistik; bleibt bestehen, wenn das Inserat aus dem Kleiderschrank verschwindet.';
alter table public.marketplace_listing_statistic_items enable row level security;
revoke all on public.marketplace_listing_statistic_items from public, anon, authenticated;
grant select on public.marketplace_listing_statistic_items to authenticated;
grant all on public.marketplace_listing_statistic_items to service_role;
revoke all on sequence public.marketplace_listing_statistic_items_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_listing_statistic_items_id_seq to service_role;
create policy "Administrators read statistic items" on public.marketplace_listing_statistic_items for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads statistic items" on public.marketplace_listing_statistic_items for select to service_role using (true);
create policy "Worker inserts statistic items" on public.marketplace_listing_statistic_items for insert to service_role with check (true);
create policy "Worker updates statistic items" on public.marketplace_listing_statistic_items for update to service_role using (true) with check (true);
create policy "Worker deletes statistic items" on public.marketplace_listing_statistic_items for delete to service_role using (true);

-- Die neue Spalte entsteht zunächst ohne Pflicht, damit vorhandene Messungen zugeordnet werden können.
alter table public.marketplace_listing_metric_observations
  add column statistic_item_id bigint;

-- Vorhandene Inserate bekommen ihren dauerhaften Statistik-Datensatz. Bereits gelöschte Inserate
-- haben keine Messungen mehr und lassen sich nicht wiederherstellen.
insert into public.marketplace_listing_statistic_items(workspace_id,connection_id,external_id,title,image_url,price,currency,first_seen_at,last_seen_at)
select e.workspace_id, e.connection_id, e.external_id,
  coalesce(nullif(btrim(e.body->>'title'),''),'Inserat'),
  nullif(e.body->>'imageUrl',''),
  case when jsonb_typeof(e.body->'price') = 'number' then (e.body->>'price')::numeric end,
  nullif(e.body->>'currency',''),
  least(e.observed_at, coalesce(min(o.observed_at), e.observed_at)),
  greatest(e.observed_at, coalesce(max(o.observed_at), e.observed_at))
from public.marketplace_account_entries e
left join public.marketplace_listing_metric_observations o on o.entry_id = e.id
where e.kind = 'publication'
group by e.id;

update public.marketplace_listing_metric_observations o set statistic_item_id = i.id
from public.marketplace_account_entries e
join public.marketplace_listing_statistic_items i on i.workspace_id = e.workspace_id and i.connection_id = e.connection_id and i.external_id = e.external_id
where e.id = o.entry_id;

alter table public.marketplace_listing_metric_observations
  alter column statistic_item_id set not null;

alter table public.marketplace_listing_metric_observations
  add constraint marketplace_listing_metric_observations_statistic_item_id_fkey foreign key (statistic_item_id)
    references public.marketplace_listing_statistic_items(id) on delete cascade;

alter table public.marketplace_listing_metric_observations
  add constraint marketplace_listing_metric_ob_statistic_item_id_observed_at_key unique (statistic_item_id, observed_at);

-- Destruktiv, aber ohne Datenverlust: die Eindeutigkeit wandert von (entry_id, observed_at) auf
-- (statistic_item_id, observed_at). Jede vorhandene Messung gehört zu genau einem Inserat und damit
-- zu genau einem Statistik-Datensatz, der neue Schlüssel deckt also dieselben Zeilen ab.
alter table public.marketplace_listing_metric_observations
  drop constraint marketplace_listing_metric_observation_entry_id_observed_at_key;

-- Destruktiv, aber ohne Datenverlust: der alte Fremdschlüssel löschte Messungen zusammen mit dem
-- Inserat. Der neue setzt nur noch den Verweis auf null; die Messung bleibt beim Statistik-Datensatz.
alter table public.marketplace_listing_metric_observations
  drop constraint marketplace_listing_metric_observations_entry_id_fkey;

alter table public.marketplace_listing_metric_observations
  alter column entry_id drop not null;

alter table public.marketplace_listing_metric_observations
  add constraint marketplace_listing_metric_observations_entry_id_fkey foreign key (entry_id)
    references public.marketplace_account_entries(id) on delete set null;

-- Ohne diesen Index wäre das Null-Setzen beim Löschen eines Inserats ein Tabellendurchlauf je Inserat.
create index marketplace_listing_metric_observations_entry on public.marketplace_listing_metric_observations(entry_id) where entry_id is not null;

create or replace function public.marketplace_record_listing_metrics()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_item_id bigint;
  v_title text := nullif(btrim(new.body->>'title'),'');
  v_image_url text := nullif(new.body->>'imageUrl','');
  v_price numeric := case when jsonb_typeof(new.body->'price') = 'number' then (new.body->>'price')::numeric end;
  v_currency text := nullif(new.body->>'currency','');
  v_first_seen_at timestamptz := new.observed_at;
begin
  if new.kind <> 'publication' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.observed_at <= old.observed_at then return new; end if;
    v_first_seen_at := old.observed_at;
  end if;
  -- Fehlende Angaben eines Abrufs überschreiben keine bekannten Stammdaten.
  insert into public.marketplace_listing_statistic_items as i(workspace_id,connection_id,external_id,title,image_url,price,currency,first_seen_at,last_seen_at)
    values(new.workspace_id,new.connection_id,new.external_id,coalesce(v_title,'Inserat'),v_image_url,v_price,v_currency,v_first_seen_at,new.observed_at)
    on conflict (workspace_id,connection_id,external_id) do update set
      title = coalesce(v_title,i.title),
      image_url = coalesce(v_image_url,i.image_url),
      price = coalesce(v_price,i.price),
      currency = coalesce(v_currency,i.currency),
      first_seen_at = least(i.first_seen_at,excluded.first_seen_at),
      last_seen_at = greatest(i.last_seen_at,excluded.last_seen_at),
      removed_at = null
    returning i.id into v_item_id;
  if tg_op = 'UPDATE' then
    -- Beim ersten neuen Abruf bleibt auch die bereits gespeicherte Ausgangsbasis erhalten.
    insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites,statistic_item_id)
      values(old.workspace_id,old.connection_id,old.id,old.observed_at,public.marketplace_known_metric_count(old.body,'views'),public.marketplace_known_metric_count(old.body,'favorites'),v_item_id)
      on conflict (statistic_item_id,observed_at) do nothing;
  end if;
  -- Unveränderte Werte ebenfalls erfassen: der nächste Abruf muss null Zuwachs zeigen.
  insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites,statistic_item_id)
    values(new.workspace_id,new.connection_id,new.id,new.observed_at,public.marketplace_known_metric_count(new.body,'views'),public.marketplace_known_metric_count(new.body,'favorites'),v_item_id)
    on conflict (statistic_item_id,observed_at) do nothing;
  return new;
end;
$$;

create or replace function public.marketplace_mark_listing_statistics_removed()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if old.kind = 'publication' then
    update public.marketplace_listing_statistic_items set removed_at = now()
      where workspace_id = old.workspace_id and connection_id = old.connection_id and external_id = old.external_id and removed_at is null;
  end if;
  return old;
end;
$$;
create trigger marketplace_mark_listing_statistics_removed after delete on public.marketplace_account_entries for each row execute function public.marketplace_mark_listing_statistics_removed();

-- Security definer ist hier nötig: mit security invoker prüft die Lesepolicy das Verwaltungsrecht für
-- jede einzelne Messzeile (gemessen: 46 s statt 0,7 s bei 1,7 Mio. Zeilen). Die Funktion prüft das Recht
-- deshalb einmal selbst und liest danach ausschließlich Zeilen des geprüften Workspace.
create or replace function public.marketplace_read_listing_statistics_overview(p_workspace_id uuid, p_period text, p_connection_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
  -- Der aktuelle Zeitraum ist erst bis jetzt gelaufen; der Vorzeitraum zählt genauso weit,
  -- sonst sähe ein gleichbleibender Verlauf wie ein Rückgang aus.
  v_previous_end := v_previous_start + (now() - v_start);

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
    'activeCount', (select count(*) from items where removed_at is null),
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
$$;

-- Explizite Rechte für die neuen Funktionen.
revoke all on function public.marketplace_mark_listing_statistics_removed() from public, anon, authenticated;
grant execute on function public.marketplace_mark_listing_statistics_removed() to service_role;
revoke all on function public.marketplace_read_listing_statistics_overview(uuid,text,uuid) from public, anon;
grant execute on function public.marketplace_read_listing_statistics_overview(uuid,text,uuid) to authenticated;
