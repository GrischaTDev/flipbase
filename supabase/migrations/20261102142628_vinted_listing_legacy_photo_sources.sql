-- Ältere marketplace_listing_jobs ohne Bildaufnahme bestätigen und beim Originalabruf überspringen.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_read_listing_photo_sources (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_external_ids  text[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_account text; v_items jsonb;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_external_ids is null or cardinality(p_external_ids)>50 or exists(select 1 from unnest(p_external_ids) id where id is null or id !~ '^[1-9][0-9]{0,31}$') then raise exception 'Ungültige Artikelzuordnung.' using errcode='22023'; end if;
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  if not found then raise exception 'Kein Zugriff auf dieses Marktplatzkonto.' using errcode='42501'; end if;
  -- Frühere bestätigte Aufträge sind die früheste noch verfügbare Sicherung. Nur einmal zuordnen.
  insert into public.marketplace_listing_photo_sources(workspace_id,connection_id,external_account_id,external_id,draft_id,images)
    select distinct on (external_id) workspace_id,connection_id,external_account_id,external_id,draft_id,snapshot->'images'
    from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and external_id=any(p_external_ids) and action='publish' and state='confirmed'
      and case when jsonb_typeof(snapshot->'images')='array' then jsonb_array_length(snapshot->'images') between 1 and 20 else false end
    order by external_id,created_at,id on conflict(connection_id,external_account_id,external_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('externalId',source.external_id,'draft',public.marketplace_listing_draft_document(draft)||jsonb_build_object('images',source.images,'photoOptions',null,'connectionId',source.connection_id))),'[]'::jsonb) into v_items
    from public.marketplace_listing_photo_sources source join public.marketplace_listing_drafts draft on draft.id=source.draft_id and draft.workspace_id=source.workspace_id
    where source.workspace_id=p_workspace_id and source.connection_id=p_connection_id and source.external_account_id=v_account and source.external_id=any(p_external_ids);
  return jsonb_build_object('items',v_items);
end;
$function$;

create or replace function public.marketplace_remember_listing_photo_source (
  p_job         public.marketplace_listing_jobs,
  p_external_id text
)
  returns void
  language plpgsql
  set search_path to ''
  as $function$
begin
  if p_job.connection_id is null or p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$' then return; end if;
  -- Ältere bestätigte Aufträge können keine Bildaufnahme enthalten. Die bestätigte Veröffentlichung bleibt gültig; keine Originale erfinden.
  if jsonb_typeof(p_job.snapshot->'images') is distinct from 'array' then return; end if;
  if jsonb_array_length(p_job.snapshot->'images') not between 1 and 20 then return; end if;
  insert into public.marketplace_listing_photo_sources(workspace_id,connection_id,external_account_id,external_id,draft_id,images)
    values(p_job.workspace_id,p_job.connection_id,p_job.external_account_id,p_external_id,p_job.draft_id,p_job.snapshot->'images')
    on conflict(connection_id,external_account_id,external_id) do nothing;
end;
$function$;