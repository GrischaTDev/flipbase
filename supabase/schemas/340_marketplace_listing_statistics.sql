-- Messhistorie akzeptierter Inseratabrufe und private Aktualisierung des Kontos.
create table public.marketplace_listing_metric_observations (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  entry_id uuid not null references public.marketplace_account_entries(id) on delete cascade,
  observed_at timestamptz not null check (isfinite(observed_at)),
  views bigint check (views >= 0 and views <= 9007199254740991),
  favorites bigint check (favorites >= 0 and favorites <= 9007199254740991),
  unique (entry_id, observed_at),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_listing_metric_observations is 'Bekannte Inseratkennzahlen je akzeptiertem Abruf; fehlende Kennzahlen bleiben unbekannt und werden nicht als null Aufrufe interpretiert.';
create index marketplace_listing_metric_observations_account on public.marketplace_listing_metric_observations(workspace_id, connection_id, entry_id, observed_at desc);
alter table public.marketplace_listing_metric_observations enable row level security;
revoke all on public.marketplace_listing_metric_observations from public, anon, authenticated;
grant select on public.marketplace_listing_metric_observations to authenticated;
grant all on public.marketplace_listing_metric_observations to service_role;
revoke all on sequence public.marketplace_listing_metric_observations_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_listing_metric_observations_id_seq to service_role;
create policy "Administrators read listing statistics" on public.marketplace_listing_metric_observations for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads listing statistics" on public.marketplace_listing_metric_observations for select to service_role using (true);
create policy "Worker inserts listing statistics" on public.marketplace_listing_metric_observations for insert to service_role with check (true);
create policy "Worker updates listing statistics" on public.marketplace_listing_metric_observations for update to service_role using (true) with check (true);
create policy "Worker deletes listing statistics" on public.marketplace_listing_metric_observations for delete to service_role using (true);

create or replace function public.marketplace_known_metric_count(p_body jsonb, p_metric text)
returns bigint language plpgsql immutable security invoker set search_path = '' as $$
declare v_count numeric;
begin
  if jsonb_typeof(p_body->'metrics'->p_metric) is distinct from 'number' then return null; end if;
  v_count := (p_body->'metrics'->>p_metric)::numeric;
  if v_count < 0 or v_count > 9007199254740991 or trunc(v_count) <> v_count then return null; end if;
  return v_count::bigint;
end;
$$;

create or replace function public.marketplace_record_listing_metrics()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.kind <> 'publication' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.observed_at <= old.observed_at then return new; end if;
    -- Beim ersten neuen Abruf bleibt auch die bereits gespeicherte Ausgangsbasis erhalten.
    insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites)
      values(old.workspace_id,old.connection_id,old.id,old.observed_at,public.marketplace_known_metric_count(old.body,'views'),public.marketplace_known_metric_count(old.body,'favorites'))
      on conflict (entry_id,observed_at) do nothing;
  end if;
  -- Unveränderte Werte ebenfalls erfassen: der nächste Abruf muss null Zuwachs zeigen.
  insert into public.marketplace_listing_metric_observations(workspace_id,connection_id,entry_id,observed_at,views,favorites)
    values(new.workspace_id,new.connection_id,new.id,new.observed_at,public.marketplace_known_metric_count(new.body,'views'),public.marketplace_known_metric_count(new.body,'favorites'))
    on conflict (entry_id,observed_at) do nothing;
  return new;
end;
$$;
create trigger marketplace_record_listing_metrics after insert or update on public.marketplace_account_entries for each row execute function public.marketplace_record_listing_metrics();

create or replace function public.marketplace_broadcast_account_import()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.last_synced_at is not null and (old.last_synced_at is null or new.last_synced_at > old.last_synced_at) then
    perform realtime.send(jsonb_build_object('workspaceId',new.workspace_id,'connectionId',new.id,'lastSyncedAt',new.last_synced_at),
      'account_imported','workspace:' || new.workspace_id::text || ':marketplace_account:' || new.id::text,true);
  end if;
  return new;
end;
$$;
create trigger marketplace_broadcast_account_import after update of last_synced_at on public.marketplace_connections for each row execute function public.marketplace_broadcast_account_import();

create policy "Administrators receive account imports" on realtime.messages for select to authenticated
using (extension = 'broadcast' and topic = (select realtime.topic()) and exists(
  select 1 from public.marketplace_connections c where realtime.messages.topic = 'workspace:' || c.workspace_id::text || ':marketplace_account:' || c.id::text and public.marketplace_can_manage(c.workspace_id)
));

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
    left join public.marketplace_listing_metric_observations latest on latest.entry_id=e.id and latest.observed_at=e.observed_at
      and latest.workspace_id=p_workspace_id and latest.connection_id=p_connection_id
    left join lateral (
      select o.* from public.marketplace_listing_metric_observations o
      where o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.entry_id=e.id
        and o.observed_at < e.observed_at
        -- Standard vergleicht zwei aufeinanderfolgende Abrufe, auch bei verzögertem Zeitplan.
        and (p_period_minutes=5 or o.observed_at <= e.observed_at - make_interval(mins=>p_period_minutes))
      order by o.observed_at desc limit 1
    ) baseline on true
    where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.kind='publication'
  )
  select coalesce(jsonb_agg(jsonb_build_object('entryId',id,'observedAt',observed_at,'baselineAt',baseline_at,
    'views',case when views is not null and previous_views is not null then greatest(0,views-previous_views) end,
    'favorites',case when favorites is not null and previous_favorites is not null then greatest(0,favorites-previous_favorites) end) order by id),'[]'::jsonb)
    into v_items from comparisons;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'periodMinutes',p_period_minutes,'items',v_items);
end;
$$;
revoke all on function public.marketplace_known_metric_count(jsonb,text), public.marketplace_record_listing_metrics(), public.marketplace_broadcast_account_import() from public, anon, authenticated;
grant execute on function public.marketplace_known_metric_count(jsonb,text) to service_role;
revoke all on function public.marketplace_read_listing_metric_changes(uuid,uuid,integer) from public, anon;
grant execute on function public.marketplace_read_listing_metric_changes(uuid,uuid,integer) to authenticated;
