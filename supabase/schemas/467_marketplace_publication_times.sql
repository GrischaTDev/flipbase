-- Bestätigte eigene Veröffentlichungen haben Vorrang vor Vinteds gerundeter Altersangabe.
-- Betroffen: marketplace_listing_jobs und der publication-Cache in marketplace_account_entries.
create index marketplace_listing_jobs_publication_time
on public.marketplace_listing_jobs(workspace_id,connection_id,external_account_id,external_id,verified_at)
where state='confirmed' and action='publish' and provider_state='active' and external_id is not null;

create or replace function public.marketplace_confirmed_publication_time(p_workspace_id uuid,p_connection_id uuid,p_external_id text)
returns timestamptz language sql stable security invoker set search_path='' as $$
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
$$;
comment on function public.marketplace_confirmed_publication_time(uuid,uuid,text) is 'Früheste belegte aktive Veröffentlichung für Workspace, Verbindung, Inserat und aktuelle Vinted-Kontoidentität; niemals Entwurfs- oder Queuezeit.';
revoke all on function public.marketplace_confirmed_publication_time(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_confirmed_publication_time(uuid,uuid,text) to service_role;

create or replace function public.marketplace_publication_versions(p_workspace_id uuid,p_connection_id uuid,p_session_id uuid)
returns table(external_id text,body jsonb,flipbase_published_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
declare v_session public.marketplace_browser_sessions; v_account_id text;
begin
  select c.external_account_id into v_account_id from public.marketplace_connections c
    where c.workspace_id=p_workspace_id and c.id=p_connection_id and c.marketplace='vinted'
      and c.execution_mode='cloud' and c.status='connected' and c.external_account_id is not null;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select s.* into v_session from public.marketplace_browser_sessions s
    where s.public_id=p_session_id and s.workspace_id=p_workspace_id and s.connection_id=p_connection_id
      and s.state='active' and s.expires_at>statement_timestamp()
      and (s.absolute_expires_at is null or s.absolute_expires_at>statement_timestamp());
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode='42501'; end if;
  if not exists(select 1 from public.platform_operators o where o.user_id=v_session.started_by)
    or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=v_session.started_by and m.role in ('owner','admin'))
    or not exists(select 1 from public.workspaces w where w.id=p_workspace_id and w.archived_at is null)
  then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_session.worker_epoch is not null and not exists (
    select 1 from public.marketplace_worker_runtime r where r.worker_id=v_session.worker_id
      and r.worker_epoch=v_session.worker_epoch and r.expires_at>statement_timestamp()
  ) then raise exception 'Worker nicht mehr aktiv' using errcode='42501'; end if;
  if v_session.operation_id is not null and not exists (
    select 1 from public.marketplace_operations o
    left join public.marketplace_sync_schedules s on s.id=o.schedule_id and s.workspace_id=o.workspace_id and s.connection_id=o.connection_id
    where o.id=v_session.operation_id and o.browser_session_id=v_session.public_id and o.state='running'
      and o.workspace_id=p_workspace_id and o.connection_id=p_connection_id and o.requested_by=v_session.started_by
      and o.worker_epoch=v_session.worker_epoch and o.authorization_version=1 and o.lease_expires_at>statement_timestamp()
      and (o.authorization_kind='manual_read' or (o.authorization_kind='scheduled_read' and s.enabled
        and s.authorization_version=o.schedule_authorization_version and s.activated_by=o.requested_by))
  ) then raise exception 'Auftragsfreigabe widerrufen' using errcode='42501'; end if;
  -- Kontowechsel werden im regulären Import verhindert. Ein widersprechendes Profil wird nie ausgegeben.
  if exists(select 1 from public.marketplace_account_entries e where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id
    and e.kind='profile' and e.external_id<>v_account_id)
  then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  return query
  with publication_ids as (
    select e.external_id from public.marketplace_account_entries e
      where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.kind='publication'
    union
    select j.external_id from public.marketplace_listing_jobs j
      where j.workspace_id=p_workspace_id and j.connection_id=p_connection_id and j.external_account_id=v_account_id
        and j.state='confirmed' and j.action='publish' and j.provider_state='active' and j.external_id is not null and isfinite(j.verified_at)
  )
  select ids.external_id,coalesce(e.body,'{}'::jsonb),publication.confirmed_at
  from publication_ids ids
  left join public.marketplace_account_entries e on e.workspace_id=p_workspace_id and e.connection_id=p_connection_id
    and e.kind='publication' and e.external_id=ids.external_id
  cross join lateral (select public.marketplace_confirmed_publication_time(p_workspace_id,p_connection_id,ids.external_id) as confirmed_at) publication
  order by coalesce(e.sort_at,publication.confirmed_at) desc,ids.external_id
  limit 1000;
end;
$$;
comment on function public.marketplace_publication_versions(uuid,uuid,uuid) is 'Kontogebundene Veröffentlichungsversionen für eine aktive autorisierte Cloud-Sitzung; ergänzt bestätigte eigene Inserate ohne Cache und gibt keine Auftragsinhalte aus.';
revoke all on function public.marketplace_publication_versions(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_publication_versions(uuid,uuid,uuid) to service_role;

create or replace function public.marketplace_publication_time_valid(p_time text,p_observed_at timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
  select case when p_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    and pg_input_is_valid(p_time,'timestamp with time zone')
  then isfinite(p_time::timestamptz) and p_time::timestamptz>'1970-01-01T00:00:00Z'::timestamptz
    and p_time::timestamptz<=least(p_observed_at,statement_timestamp())
  else false end;
$$;
comment on function public.marketplace_publication_time_valid(text,timestamptz) is 'Prüft vollständige ISO-Zeiten mit echter Kalendergrenze und ohne Datum vor Unix-Epoche oder nach Abrufzeit; ungültig bleibt unbekannt.';
revoke all on function public.marketplace_publication_time_valid(text,timestamptz) from public,anon,authenticated;
grant execute on function public.marketplace_publication_time_valid(text,timestamptz) to service_role;


-- Nur gerundete Quellen mit eigenem Abrufanker können die ungefähre Reihenfolge belegen.
create or replace function public.marketplace_publication_age_sort_at(p_age jsonb,p_observed_at timestamptz)
returns timestamptz language plpgsql stable security invoker set search_path='' as $$
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
$$;
comment on function public.marketplace_publication_age_sort_at(jsonb,timestamptz) is 'Ungefähre Sortierzeit eines validierten Vinted-Alters mit festem Quellenanker; Monate sind 30 und Jahre 365 Tage, fehlender Beleg bleibt null.';
revoke all on function public.marketplace_publication_age_sort_at(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.marketplace_publication_age_sort_at(jsonb,timestamptz) to service_role;

create or replace function public.marketplace_preserve_publication_time()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
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
$$;
revoke all on function public.marketplace_preserve_publication_time() from public,anon,authenticated;
grant execute on function public.marketplace_preserve_publication_time() to service_role;
create trigger marketplace_preserve_publication_time before insert or update on public.marketplace_account_entries
for each row execute function public.marketplace_preserve_publication_time();

create or replace function public.marketplace_refresh_confirmed_publication_time()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  if new.state='confirmed' and new.action='publish' and new.provider_state='active' and new.external_id is not null and isfinite(new.verified_at)
    and (tg_op='INSERT' or row(new.state,new.provider_state,new.external_id,new.verified_at,new.connection_id)
      is distinct from row(old.state,old.provider_state,old.external_id,old.verified_at,old.connection_id)) then
    -- Nur vorhandene echte Importzeilen ergänzen, niemals aus einem Entwurf Cachezeilen erraten.
    update public.marketplace_account_entries e set body=e.body
    where e.workspace_id=new.workspace_id and e.connection_id=new.connection_id and e.kind='publication' and e.external_id=new.external_id
      and exists(select 1 from public.marketplace_connections c where c.workspace_id=new.workspace_id and c.id=new.connection_id
        and c.marketplace='vinted' and c.external_account_id=new.external_account_id);
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_refresh_confirmed_publication_time() from public,anon,authenticated;
grant execute on function public.marketplace_refresh_confirmed_publication_time() to service_role;
create trigger marketplace_refresh_confirmed_publication_time after insert or update on public.marketplace_listing_jobs
for each row execute function public.marketplace_refresh_confirmed_publication_time();

-- Bestehende Vinted-Lesekopien durch denselben normalisierenden Trigger korrigieren.
-- Die Quellzeit in altem occurredAt ist ohne eigenen identischen Jobbeleg Erstellung;
-- fehlender Status bleibt unknown bis zum nächsten belegten Vinted-Abruf.
-- Andere Marktplätze, Eintragsarten und bereits gespeicherte Quellenfelder bleiben unberührt.
update public.marketplace_account_entries e set body=e.body
where e.kind='publication' and exists(select 1 from public.marketplace_connections c
  where c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted');
