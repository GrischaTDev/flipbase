-- Übernimmt bestätigte Vinted-Veröffentlichungen automatisch in die Kontolesekopie und grenzt Entwurfsseiten auf das gewählte Konto ein.

CREATE OR REPLACE FUNCTION public.marketplace_import_new_publication_after_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_job public.marketplace_listing_jobs;
begin
  if new.state='failed' and (
    coalesce(new.error_code,'') not in ('publications','conversations','messages','sales','persist','transaction','parse','interrupted')
    or exists(select 1 from jsonb_each(coalesce(new.source_results,'{}')) source
      where source.value->>'failure' in ('unauthorized','forbidden','rate_limited','challenge'))
  ) then return new; end if;
  for v_job in select job.* from public.marketplace_listing_jobs job
    where job.workspace_id=new.workspace_id and job.connection_id=new.connection_id
      and job.state='confirmed' and job.action='publish' and job.execution_mode='cloud'
      and job.external_id is not null and job.finished_at>coalesce(new.started_at,new.created_at)
      and not (job.snapshot ? 'relistExternalId')
    order by job.finished_at desc
  loop
    perform public.marketplace_request_relisting_import(v_job);
    if exists(select 1 from public.marketplace_operations operation
      where operation.workspace_id=v_job.workspace_id and operation.connection_id=v_job.connection_id
        and operation.state in ('queued','running')) then exit; end if;
  end loop;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_import_new_publication_after_sync() FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_import_new_publication_after_sync() TO service_role;

CREATE FUNCTION public.marketplace_list_listing_drafts_scoped (
  p_workspace_id  uuid,
  p_query         text,
  p_cursor        jsonb,
  p_limit         integer,
  p_connection_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_rows jsonb; v_last jsonb; v_cursor_id bigint; v_cursor_at timestamptz; v_more boolean;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501'; end if;
  if p_connection_id is not null and not exists(select 1 from public.marketplace_connections
    where workspace_id=p_workspace_id and id=p_connection_id) then
    raise exception 'Kein Zugriff auf dieses Marktplatzkonto.' using errcode='42501';
  end if;
  if p_query is null or length(p_query)>160 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Ungültige Entwurfssuche.' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object' or jsonb_typeof(p_cursor->'id') is distinct from 'string'
      or coalesce(p_cursor->>'id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    v_cursor_id:=(p_cursor->>'id')::bigint;
    if p_cursor ? 'createdAt' then
      if jsonb_typeof(p_cursor->'createdAt') is distinct from 'string'
        or coalesce(p_cursor->>'createdAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      v_cursor_at:=(p_cursor->>'createdAt')::timestamptz;
    else
      -- Bereits geöffnete ältere Clients senden nur updatedAt. Ihr Datum bestimmt niemals die Sortierung.
      -- Auch gelöschte Arbeitskopien bleiben als eindeutig zugeordnete Cursor-Anker erhalten.
      if jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or coalesce(p_cursor->>'updatedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
      perform (p_cursor->>'updatedAt')::timestamptz;
      select created_at into v_cursor_at from public.marketplace_listing_drafts where workspace_id=p_workspace_id and id=v_cursor_id;
      if not found then raise exception 'Ungültiger Seitenzeiger.' using errcode='22023'; end if;
    end if;
  end if;
  -- Der jüngste Veröffentlichungsauftrag zeigt in der Übersicht, ob ein Entwurf gerade veröffentlicht wird.
  select coalesce(jsonb_agg(public.marketplace_listing_draft_document(d)||jsonb_build_object('publication',(
    select public.marketplace_listing_job_document(j) from public.marketplace_listing_jobs j
    where j.draft_id=d.id and j.action='publish' order by j.id desc limit 1)) order by d.created_at desc,d.id desc),'[]'::jsonb) into v_rows from (
    select * from public.marketplace_listing_drafts where workspace_id=p_workspace_id and deleted_at is null and relist_external_id is null
      and (p_connection_id is null or connection_id is null or connection_id=p_connection_id)
      -- Ein bei Vinted bestätigter Entwurf ist verbraucht; er bleibt für Aufträge und Verlauf gespeichert.
      and not exists (select 1 from public.marketplace_listing_jobs j where j.draft_id=marketplace_listing_drafts.id and j.state='confirmed')
      and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(content->>'title'))>0)
      and (v_cursor_id is null or (created_at,id)<(v_cursor_at,v_cursor_id))
    order by created_at desc,id desc limit p_limit+1
  ) d;
  v_more:=jsonb_array_length(v_rows)>p_limit;
  if v_more then
    v_last:=v_rows->(p_limit-1);
    select jsonb_agg(value order by position) into v_rows from jsonb_array_elements(v_rows) with ordinality page(value,position) where position<=p_limit;
  end if;
  return jsonb_build_object('items',v_rows,'nextCursor',case when v_more then jsonb_build_object('id',v_last->>'id','createdAt',v_last->>'createdAt','updatedAt',v_last->>'updatedAt') else null end);
end;
$function$;

REVOKE ALL ON FUNCTION public.marketplace_list_listing_drafts_scoped(uuid, text, jsonb, integer, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.marketplace_list_listing_drafts_scoped(uuid, text, jsonb, integer, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.marketplace_list_listing_drafts_scoped(uuid, text, jsonb, integer, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_list_listing_drafts (
  p_workspace_id uuid,
  p_query        text    DEFAULT ''::text,
  p_cursor       jsonb   DEFAULT NULL::jsonb,
  p_limit        integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.marketplace_list_listing_drafts_scoped(p_workspace_id,p_query,p_cursor,p_limit,null);
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_request_relisting_import(p_job public.marketplace_listing_jobs)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_job.state not in ('confirmed','outcome_unknown') or p_job.external_id is null
    or (p_job.state='outcome_unknown' and (p_job.provider_result->>'externalId' is distinct from p_job.external_id
      or p_job.provider_result->>'externalAccountId' is distinct from p_job.external_account_id))
    or p_job.action<>'publish' or p_job.execution_mode<>'cloud'
    or (not (p_job.snapshot ? 'relistExternalId') and p_job.state='outcome_unknown' and coalesce(p_job.error_code,'') not in (
      'provider_unconfirmed_save_navigation','provider_unconfirmed_saved_navigation','provider_unconfirmed_saved_form',
      'provider_unconfirmed_active_navigation','provider_unconfirmed_active_filter','provider_unconfirmed_active_loading','provider_unconfirmed_active_evidence'))
    or ((p_job.snapshot ? 'relistExternalId') and (not public.marketplace_relisting_job_is_latest(p_job) or p_job.relist_imported_at is not null))
    or not public.marketplace_workspace_authorization_valid(p_job.workspace_id,p_job.requested_by)
    or not exists(select 1 from public.marketplace_connections where id=p_job.connection_id and workspace_id=p_job.workspace_id
      and external_account_id=p_job.external_account_id and execution_mode='cloud' and status='connected') then return; end if;
  if p_job.state='confirmed' and not (p_job.snapshot ? 'relistExternalId')
    and exists(select 1 from public.marketplace_account_entries entry
      where entry.workspace_id=p_job.workspace_id and entry.connection_id=p_job.connection_id
        and entry.kind='publication' and entry.external_id=p_job.external_id
        and entry.observed_at>=p_job.started_at
        and entry.body->>'publicationState' in ('active','reserved','hidden','ended')) then return; end if;
  if exists(select 1 from public.marketplace_operations where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and created_at>=p_job.finished_at and (state in ('queued','running') or finished_at>clock_timestamp()-interval '1 minute')) then return; end if;
  insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,created_at)
    values(p_job.workspace_id,p_job.connection_id,p_job.requested_by,'manual_read',1,clock_timestamp())
    on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
end;
$function$;

CREATE TRIGGER marketplace_import_new_publication_after_sync AFTER UPDATE OF state ON public.marketplace_operations FOR EACH ROW WHEN (((old.state = 'running'::text) AND (new.state = ANY (ARRAY['succeeded'::text, 'failed'::text])))) EXECUTE FUNCTION public.marketplace_import_new_publication_after_sync();
