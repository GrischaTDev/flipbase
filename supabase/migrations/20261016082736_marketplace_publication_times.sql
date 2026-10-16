-- Bestätigte eigene Veröffentlichungszeiten: marketplace_listing_jobs und marketplace_account_entries.
-- Schema automatisch per Supabase db diff; Client-ACLs automatisch aus pg_catalog/has_function_privilege.
-- Explizite Ziel-REVOKEs schließen zusätzliche bestehende DEFAULT-PRIVILEGES beim Replay aus.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_confirmed_publication_time (
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
    and j.state='confirmed' and j.action='publish' and j.provider_state='active' and isfinite(j.verified_at);
$function$;

comment on function public.marketplace_confirmed_publication_time(uuid,uuid,text) is 'Früheste belegte aktive Veröffentlichung für Workspace, Verbindung, Inserat und aktuelle Vinted-Kontoidentität; niemals Entwurfs- oder Queuezeit.';

revoke all on function public.marketplace_confirmed_publication_time(uuid, uuid, text) from public;

grant all on function public.marketplace_confirmed_publication_time(uuid, uuid, text) to service_role;

create function public.marketplace_preserve_publication_time()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare v_published_at timestamptz;
begin
  if new.kind<>'publication' or not exists(select 1 from public.marketplace_connections c
    where c.workspace_id=new.workspace_id and c.id=new.connection_id and c.marketplace='vinted') then return new; end if;
  v_published_at:=public.marketplace_confirmed_publication_time(new.workspace_id,new.connection_id,new.external_id);
  if v_published_at is not null then
    new.body:=new.body || jsonb_build_object('occurredAt',to_char(v_published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'publicationAge',null);
  else
    if coalesce(new.body->'occurredAt','null'::jsonb)<>'null'::jsonb
      and not public.marketplace_publication_time_valid(new.body->>'occurredAt',new.observed_at) then
      new.body:=jsonb_set(new.body,'{occurredAt}','null'::jsonb,true);
    end if;
    if tg_op='UPDATE' and row(new.workspace_id,new.connection_id,new.kind,new.external_id)
      is not distinct from row(old.workspace_id,old.connection_id,old.kind,old.external_id) then
      if nullif(new.body->>'occurredAt','') is null
        and public.marketplace_publication_time_valid(old.body->>'occurredAt',new.observed_at) then
        new.body:=jsonb_set(new.body,'{occurredAt}',old.body->'occurredAt',true);
      end if;
      if nullif(new.body->>'occurredAt','') is null
        and coalesce(new.body->'publicationAge','null'::jsonb)='null'::jsonb and jsonb_typeof(old.body->'publicationAge')='object' then
        new.body:=jsonb_set(new.body,'{publicationAge}',old.body->'publicationAge',true);
      end if;
    end if;
    if nullif(new.body->>'occurredAt','') is not null then
      new.body:=jsonb_set(new.body,'{publicationAge}','null'::jsonb,true);
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.marketplace_preserve_publication_time() from public;

grant all on function public.marketplace_preserve_publication_time() to service_role;

create function public.marketplace_publication_time_valid (
  p_time        text,
  p_observed_at timestamp with time zone
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select case when p_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
    and pg_input_is_valid(p_time,'timestamp with time zone')
  then isfinite(p_time::timestamptz) and p_time::timestamptz>'1970-01-01T00:00:00Z'::timestamptz
    and p_time::timestamptz<=least(p_observed_at,statement_timestamp())
  else false end;
$function$;

comment on function public.marketplace_publication_time_valid(text,timestamp with time zone) is 'Prüft vollständige ISO-Zeiten mit echter Kalendergrenze und ohne Datum vor Unix-Epoche oder nach Abrufzeit; ungültig bleibt unbekannt.';

revoke all on function public.marketplace_publication_time_valid(text, timestamp with time zone) from public;

grant all on function public.marketplace_publication_time_valid(text, timestamp with time zone) to service_role;

create function public.marketplace_publication_versions (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_session_id    uuid
)
  returns table (
    external_id           text,
    body                  jsonb,
    flipbase_published_at timestamp with time zone
  )
  language plpgsql
  stable
  set search_path to ''
  as $function$
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
$function$;

comment on function public.marketplace_publication_versions(uuid,uuid,uuid) is 'Kontogebundene Veröffentlichungsversionen für eine aktive autorisierte Cloud-Sitzung; ergänzt bestätigte eigene Inserate ohne Cache und gibt keine Auftragsinhalte aus.';

revoke all on function public.marketplace_publication_versions(uuid, uuid, uuid) from public;

grant all on function public.marketplace_publication_versions(uuid, uuid, uuid) to service_role;

create function public.marketplace_refresh_confirmed_publication_time()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
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
$function$;

revoke all on function public.marketplace_refresh_confirmed_publication_time() from public;

grant all on function public.marketplace_refresh_confirmed_publication_time() to service_role;

create trigger marketplace_preserve_publication_time
  before insert or update on public.marketplace_account_entries
  for each row
  execute function public.marketplace_preserve_publication_time();

create index marketplace_listing_jobs_publication_time on public.marketplace_listing_jobs (workspace_id, connection_id, external_account_id, external_id, verified_at)
  where state = 'confirmed'::text and action = 'publish'::text and provider_state = 'active'::text and external_id is not null;

create trigger marketplace_refresh_confirmed_publication_time
  after insert or update on public.marketplace_listing_jobs
  for each row
  execute function public.marketplace_refresh_confirmed_publication_time();

-- Aus den verweigerten Clientrechten der fünf neuen Funktionen im getesteten Zielkatalog erzeugt.
revoke all on function public.marketplace_confirmed_publication_time(p_workspace_id uuid, p_connection_id uuid, p_external_id text) from anon;
revoke all on function public.marketplace_confirmed_publication_time(p_workspace_id uuid, p_connection_id uuid, p_external_id text) from authenticated;
revoke all on function public.marketplace_preserve_publication_time() from anon;
revoke all on function public.marketplace_preserve_publication_time() from authenticated;
revoke all on function public.marketplace_publication_time_valid(p_time text, p_observed_at timestamp with time zone) from anon;
revoke all on function public.marketplace_publication_time_valid(p_time text, p_observed_at timestamp with time zone) from authenticated;
revoke all on function public.marketplace_publication_versions(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid) from anon;
revoke all on function public.marketplace_publication_versions(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid) from authenticated;
revoke all on function public.marketplace_refresh_confirmed_publication_time() from anon;
revoke all on function public.marketplace_refresh_confirmed_publication_time() from authenticated;
