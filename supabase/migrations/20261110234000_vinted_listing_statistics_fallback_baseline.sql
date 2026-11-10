-- Zweck: Für Inserate mit kürzerer Historie als das gewählte Zeitfenster (z. B. Tag / 24 Stunden
-- oder Woche / 7 Tage) den ältesten verfügbaren Messwert im Fenster als Vergleichsbasis nutzen,
-- statt null zurückzugeben. So werden auch bei neueren Inseraten oder frischen Synchronisierungen
-- die aufgelaufenen Aufrufe und Favoriten verlässlich angezeigt.
-- Betroffen: public.marketplace_read_listing_metric_changes.
-- Nicht destruktiv für Daten.

create or replace function public.marketplace_read_listing_metric_changes(p_workspace_id uuid, p_connection_id uuid, p_period_minutes integer default 5)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_items jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted') then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  if p_period_minutes is null or p_period_minutes not in (5,60,1440,10080) then
    raise exception 'Ungültiger Statistikzeitraum' using errcode = '22023';
  end if;
  with comparisons as (
    select e.id, e.observed_at, latest.views, latest.favorites,
      baseline.observed_at as baseline_at, baseline.views as previous_views, baseline.favorites as previous_favorites
    from public.marketplace_account_entries e
    left join public.marketplace_listing_statistic_items item on item.workspace_id=e.workspace_id and item.connection_id=e.connection_id and item.external_id=e.external_id
    left join public.marketplace_listing_metric_observations latest on latest.entry_id=e.id and latest.observed_at=e.observed_at
      and latest.statistic_item_id=item.id
      and latest.workspace_id=p_workspace_id and latest.connection_id=p_connection_id
    left join lateral (
      select b.* from (
        select o.* from public.marketplace_listing_metric_observations o
        where o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.entry_id=e.id
          and o.statistic_item_id=item.id
          and o.observed_at < e.observed_at
          -- Standard vergleicht den jüngsten Messpunkt vor dem gewünschten Zeitraum.
          and (p_period_minutes=5 or o.observed_at <= e.observed_at - make_interval(mins=>p_period_minutes))
        order by o.observed_at desc limit 1
      ) b
      union all
      select f.* from (
        -- Liegt noch kein Messpunkt vor dem Zeitraum (z. B. 24h / 7d), ältesten verfügbaren Messwert nutzen.
        select o.* from public.marketplace_listing_metric_observations o
        where o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.entry_id=e.id
          and o.statistic_item_id=item.id
          and o.observed_at < e.observed_at
          and p_period_minutes > 5
        order by o.observed_at asc limit 1
      ) f
      limit 1
    ) baseline on true
    where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.kind='publication'
      and e.body->>'publicationState' is distinct from 'draft'
  )
  select coalesce(jsonb_agg(jsonb_build_object('entryId',id,'observedAt',observed_at,'baselineAt',baseline_at,
    'views',case when views is not null and previous_views is not null then greatest(0,views-previous_views) end,
    'favorites',case when favorites is not null and previous_favorites is not null then greatest(0,favorites-previous_favorites) end) order by id),'[]'::jsonb)
    into v_items from comparisons;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'periodMinutes',p_period_minutes,'items',v_items);
end;
$$;
