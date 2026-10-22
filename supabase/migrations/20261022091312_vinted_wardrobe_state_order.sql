-- Zweck: Vinted-Quellstatus, Erstellung und bestätigte Veröffentlichung trennen und den Kleiderschrank global stabil sortieren.
-- Betroffen: public.marketplace_account_entries, Publikationszeit-/Importfunktionen und Inseratstatistik; übrige Eintragsarten bleiben erhalten.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_confirmed_publication_time (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_external_id   text
)
  returns timestamp with time zone
  language sql
  stable
  set search_path to ''
  as $function$
  select min(j.verified_at)
  from public.marketplace_listing_jobs j
  join public.marketplace_connections c on c.workspace_id=j.workspace_id and c.id=j.connection_id
    and c.marketplace='vinted' and c.external_account_id=j.external_account_id
  where j.workspace_id=p_workspace_id and j.connection_id=p_connection_id and j.external_id=p_external_id
    and j.state='confirmed' and j.action='publish' and j.provider_state='active' and isfinite(j.verified_at)
    and j.verified_at>'1970-01-01T00:00:00Z'::timestamptz and j.verified_at<=statement_timestamp()
    and j.verified_at>coalesce((select greatest(
      case when pg_input_is_valid(e.body->>'publicationDraftObservedAt','timestamp with time zone')
        then (e.body->>'publicationDraftObservedAt')::timestamptz end,
      case when e.body->>'publicationState'='draft' then least(e.observed_at,statement_timestamp()) end)
      from public.marketplace_account_entries e where e.workspace_id=j.workspace_id and e.connection_id=j.connection_id
        and e.kind='publication' and e.external_id=j.external_id),'-infinity'::timestamptz);
$function$;

create or replace function public.marketplace_ingest_local_extension (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_snapshot      jsonb default null::jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_count integer:=0; v_complete boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or (v_connection.external_account_id is not null and v_connection.external_account_id<>v_grant.external_account_id) then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if p_snapshot is null then
    update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
    return jsonb_build_object('ok',true,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'messagesRead',v_grant.messages_read,'messagesSend',v_grant.messages_send,'inboxSyncedAt',(
      select max(last_success_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('conversations','messages')));
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text)>524288
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object' or p_snapshot->'identity'->>'id' is distinct from v_grant.external_account_id then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array' or jsonb_array_length(p_snapshot->'entries')>501
    or jsonb_typeof(p_snapshot->'publicationsComplete') is distinct from 'boolean' or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or jsonb_typeof(p_snapshot->'identity'->'username') is distinct from 'string' or char_length(p_snapshot->'identity'->>'username') not between 1 and 120 then raise exception 'Ungültiger lokaler Import' using errcode='22023'; end if;
  begin v_observed:=(p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Abrufzeit' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('profile','publications')),'-infinity') then raise exception 'Veralteter Import' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind'='profile')<>1
    or exists(select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Ungültige Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or v_entry->>'kind' is null or v_entry->>'kind' not in ('profile','publication')
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='profile' then array['username','displayName','location','bio','bioState','imageUrl','feedbackCount','feedbackReputation','positiveFeedbackCount','neutralFeedbackCount','negativeFeedbackCount','itemCount','observedAt'] else array['title','text','textState','occurredAt','createdAt','publicationState','publicationAge','price','currency','status','imageUrl','imageUrls','metrics','promoted','brand','size','priceLabel','isClosed','isReserved'] end))
      or (v_entry->>'kind'='profile' and (v_entry->>'externalId'<>v_grant.external_account_id or v_entry->'body'->>'username' is distinct from p_snapshot->'identity'->>'username')) then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    if v_entry->>'kind'='publication' then
      if (v_entry->'body' ? 'publicationState' and (
          jsonb_typeof(v_entry->'body'->'publicationState') is distinct from 'string'
          or v_entry->'body'->>'publicationState' not in ('active','reserved','draft','hidden','ended','unknown')))
        or (coalesce(v_entry->'body'->'createdAt','null'::jsonb)<>'null'::jsonb and (
          jsonb_typeof(v_entry->'body'->'createdAt') is distinct from 'string'
          or not public.marketplace_publication_time_valid(v_entry->'body'->>'createdAt',v_observed)))
        or (coalesce(v_entry->'body'->'occurredAt','null'::jsonb)<>'null'::jsonb and (
          jsonb_typeof(v_entry->'body'->'occurredAt') is distinct from 'string'
          or not public.marketplace_publication_time_valid(v_entry->'body'->>'occurredAt',v_observed)))
        or (coalesce(v_entry->'body'->'publicationAge','null'::jsonb)<>'null'::jsonb
          and public.marketplace_publication_age_sort_at(v_entry->'body'->'publicationAge',v_observed) is null)
      then raise exception 'Ungültige Inseratquelle' using errcode='22023'; end if;
    end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_entry->>'kind',v_entry->>'externalId',v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
      on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    if v_entry->>'kind'='publication' then v_count:=v_count+1; end if;
  end loop;
  v_complete:=(p_snapshot->>'publicationsComplete')::boolean;
  -- Auch vollständige lokale Lesekopien löschen niemals Anzeigen oder interpretieren fehlende Datensätze als Verkauf.
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
    values(p_workspace_id,p_connection_id,'profile','complete',v_observed,v_observed,v_observed),
      (p_workspace_id,p_connection_id,'publications',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,
      last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  update public.marketplace_connections set external_account_id=v_grant.external_account_id,status='connected',capabilities=capabilities || '{"profile.read":"verified","listings.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  -- Der bestehende Connection-Trigger sendet account_imported mit last_synced_at.
  return jsonb_build_object('ok',true,'counts',jsonb_build_object('profile',1,'publication',v_count),'observedAt',v_observed);
end;
$function$;

create or replace function public.marketplace_preserve_publication_time()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_published_at timestamptz;
  v_previous jsonb:='{}'::jsonb;
  v_previous_observed_at timestamptz;
  v_draft_observed_at timestamptz;
  v_source jsonb;
  v_state text;
  v_created_at jsonb;
  v_age jsonb;
begin
  if new.kind<>'publication' or not exists(select 1 from public.marketplace_connections c
    where c.workspace_id=new.workspace_id and c.id=new.connection_id and c.marketplace='vinted') then return new; end if;
  if tg_op='UPDATE' and row(new.workspace_id,new.connection_id,new.kind,new.external_id)
    is not distinct from row(old.workspace_id,old.connection_id,old.kind,old.external_id) then
    -- Ein verspäteter Abruf darf weder Status noch Chronologie einer neueren Lesekopie ersetzen.
    if new.observed_at<old.observed_at then return old; end if;
    v_previous:=old.body;
    v_previous_observed_at:=old.observed_at;
  elsif tg_op='INSERT' then
    -- BEFORE INSERT läuft auch vor ON CONFLICT. Bekannte Entwürfe müssen schon hier erhalten bleiben,
    -- damit excluded.body aus einem alten Client nicht künstlich den expliziten Zustand unknown erhält.
    select e.body,e.observed_at into v_previous,v_previous_observed_at from public.marketplace_account_entries e
      where e.workspace_id=new.workspace_id and e.connection_id=new.connection_id
        and e.kind='publication' and e.external_id=new.external_id;
    v_previous:=coalesce(v_previous,'{}'::jsonb);
  end if;
  v_state:=case when new.body->>'publicationState' in ('active','reserved','draft','hidden','ended','unknown')
    then new.body->>'publicationState'
    when v_previous->>'publicationState' in ('active','reserved','draft','hidden','ended','unknown')
    then v_previous->>'publicationState' else 'unknown' end;
  -- Nur die Datenbank schreibt diesen Quellenanker. Er bleibt auch nach draft → active erhalten,
  -- damit ein späterer Folgeimport keine Veröffentlichung vor dem letzten Entwurf wiederbelebt.
  if public.marketplace_publication_time_valid(v_previous->>'publicationDraftObservedAt',new.observed_at) then
    v_draft_observed_at:=(v_previous->>'publicationDraftObservedAt')::timestamptz;
  end if;
  if v_previous->>'publicationState'='draft' then
    v_draft_observed_at:=greatest(v_draft_observed_at,least(v_previous_observed_at,statement_timestamp()));
  end if;
  if v_state='draft' then
    v_draft_observed_at:=greatest(v_draft_observed_at,least(new.observed_at,statement_timestamp()));
  end if;
  v_published_at:=public.marketplace_confirmed_publication_time(new.workspace_id,new.connection_id,new.external_id);
  if v_published_at<=v_draft_observed_at then v_published_at:=null; end if;

  if public.marketplace_publication_time_valid(new.body->>'createdAt',new.observed_at) then
    v_created_at:=new.body->'createdAt';
  elsif public.marketplace_publication_time_valid(v_previous->>'createdAt',new.observed_at) then
    v_created_at:=v_previous->'createdAt';
  end if;
  -- Vor dieser Trennung enthielt occurredAt das Vinted-Feld created_at. Ohne identischen eigenen
  -- Veröffentlichungsbeleg wird diese alte Quellzeit konservativ als Erstellung erhalten.
  -- Ein moderner Import mit explizitem createdAt wird niemals auf diese Weise umgedeutet.
  for v_source in select value from jsonb_array_elements(jsonb_build_array(new.body,v_previous)) loop
    if v_created_at is null and not v_source ? 'createdAt'
      and public.marketplace_publication_time_valid(v_source->>'occurredAt',new.observed_at) then
      if not exists(select 1 from public.marketplace_listing_jobs j
        join public.marketplace_connections c on c.workspace_id=j.workspace_id and c.id=j.connection_id
          and c.marketplace='vinted' and c.external_account_id=j.external_account_id
        where j.workspace_id=new.workspace_id and j.connection_id=new.connection_id and j.external_id=new.external_id
          and j.state='confirmed' and j.action='publish' and j.provider_state='active'
          and date_trunc('milliseconds',j.verified_at)=date_trunc('milliseconds',(v_source->>'occurredAt')::timestamptz)) then
        v_created_at:=v_source->'occurredAt';
      end if;
    end if;
  end loop;

  v_age:=case when jsonb_typeof(new.body->'publicationAge')='object' then new.body->'publicationAge' end;
  if v_age is null and coalesce(v_previous->>'publicationState','unknown') not in ('draft','hidden')
    and jsonb_typeof(v_previous->'publicationAge')='object' then v_age:=v_previous->'publicationAge'; end if;
  -- Aktuelle Quellenzustände gewinnen immer vor einem historischen Veröffentlichungsauftrag.
  if v_state not in ('active','reserved') then v_published_at:=null; end if;
  if v_state in ('draft','hidden') or v_published_at is not null then v_age:=null; end if;
  new.body:=(new.body-'publicationDraftObservedAt')||jsonb_build_object(
    'publicationState',v_state,'createdAt',v_created_at,
    'occurredAt',case when v_published_at is not null then to_char(v_published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'publicationAge',v_age);
  if v_draft_observed_at is not null then
    new.body:=new.body||jsonb_build_object('publicationDraftObservedAt',to_char(v_draft_observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  end if;
  -- Die vorhandene globale Cursorabfrage verwendet sort_at und id. Abruf- oder Updatezeiten
  -- sind keine Artikelchronologie; die feste Epoche legt unbekannte Artikel stabil ans Ende.
  new.sort_at:=coalesce(v_published_at,(v_created_at#>>'{}')::timestamptz,
    case when v_state in ('active','reserved','ended') then public.marketplace_publication_age_sort_at(v_age,new.observed_at) end,
    '1970-01-01T00:00:00Z'::timestamptz);
  return new;
end;
$function$;

create function public.marketplace_publication_age_sort_at (
  p_age         jsonb,
  p_observed_at timestamp with time zone
)
  returns timestamp with time zone
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_value numeric; v_seconds integer; v_sort_at timestamptz;
begin
  if jsonb_typeof(p_age) is distinct from 'object' then return null; end if;
  if exists(select 1 from jsonb_object_keys(p_age) field where field not in ('value','unit','observedAt'))
    or jsonb_typeof(p_age->'value') is distinct from 'number'
    or jsonb_typeof(p_age->'unit') is distinct from 'string'
    or jsonb_typeof(p_age->'observedAt') is distinct from 'string'
    or not public.marketplace_publication_time_valid(p_age->>'observedAt',p_observed_at) then return null; end if;
  v_value:=(p_age->>'value')::numeric;
  if v_value<0 or v_value>10000 or trunc(v_value)<>v_value then return null; end if;
  v_seconds:=case p_age->>'unit' when 'minute' then 60 when 'hour' then 3600 when 'day' then 86400
    when 'week' then 604800 when 'month' then 2592000 when 'year' then 31536000 end;
  if v_seconds is null then return null; end if;
  v_sort_at:=(p_age->>'observedAt')::timestamptz-make_interval(secs=>(v_value*v_seconds)::double precision);
  if v_sort_at<='1970-01-01T00:00:00Z'::timestamptz then return null; end if;
  return v_sort_at;
end;
$function$;

comment on function public.marketplace_publication_age_sort_at(jsonb,timestamp with time zone) is 'Ungefähre Sortierzeit eines validierten Vinted-Alters mit festem Quellenanker; Monate sind 30 und Jahre 365 Tage, fehlender Beleg bleibt null.';

revoke all on function public.marketplace_publication_age_sort_at(jsonb, timestamp with time zone) from public;

grant all on function public.marketplace_publication_age_sort_at(jsonb, timestamp with time zone) to service_role;

create or replace function public.marketplace_read_listing_metric_changes (
  p_workspace_id   uuid,
  p_connection_id  uuid,
  p_period_minutes integer default 5
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
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
      and e.body->>'publicationState' is distinct from 'draft'
  )
  select coalesce(jsonb_agg(jsonb_build_object('entryId',id,'observedAt',observed_at,'baselineAt',baseline_at,
    'views',case when views is not null and previous_views is not null then greatest(0,views-previous_views) end,
    'favorites',case when favorites is not null and previous_favorites is not null then greatest(0,favorites-previous_favorites) end) order by id),'[]'::jsonb)
    into v_items from comparisons;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'periodMinutes',p_period_minutes,'items',v_items);
end;
$function$;

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
  as $function$
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

create or replace function public.marketplace_record_listing_metrics()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  v_item_id bigint;
  v_title text := nullif(btrim(new.body->>'title'),'');
  v_image_url text := nullif(new.body->>'imageUrl','');
  v_price numeric := case when jsonb_typeof(new.body->'price') = 'number' then (new.body->>'price')::numeric end;
  v_currency text := nullif(new.body->>'currency','');
  v_first_seen_at timestamptz := new.observed_at;
begin
  if new.kind <> 'publication' or new.body->>'publicationState'='draft' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.observed_at <= old.observed_at then return new; end if;
    if old.body->>'publicationState' is distinct from 'draft' then v_first_seen_at := old.observed_at; end if;
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
  if tg_op = 'UPDATE' and old.body->>'publicationState' is distinct from 'draft' then
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
$function$;

-- Explizite deklarative Rechte schließen auch bestehende Default-Grants.
revoke all on function public.marketplace_publication_age_sort_at(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.marketplace_publication_age_sort_at(jsonb,timestamptz) to service_role;

-- Bestehende Vinted-Lesekopien durch denselben normalisierenden Trigger korrigieren.
-- Die Quellzeit in altem occurredAt ist ohne eigenen identischen Jobbeleg Erstellung;
-- fehlender Status bleibt unknown bis zum nächsten belegten Vinted-Abruf.
-- Andere Marktplätze, Eintragsarten und bereits gespeicherte Quellenfelder bleiben unberührt.
update public.marketplace_account_entries e set body=e.body
where e.kind='publication' and exists(select 1 from public.marketplace_connections c
  where c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted');
