-- Zweck: Termine atomar ändern und vorhandene Aktion sowie Fotoeinstellung erhalten.
-- Betroffen: public.marketplace_listing_permissions und marketplace_listing_jobs sowie deren kontrollierte RPCs.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_reschedule_listing (
  p_job_id            text,
  p_expected_version  bigint,
  p_expected_revision bigint,
  p_request_id        uuid,
  p_scheduled_at      timestamp with time zone,
  p_time_zone         text,
  p_late_policy       text                     default 'pause_after_30_minutes'::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  return public.marketplace_enqueue_listing_internal(v_job.draft_id::text,p_expected_revision,v_job.action,p_request_id,
    (v_job.snapshot->>'aiPhoto')::boolean,p_scheduled_at,p_time_zone,p_late_policy,v_job.id,p_expected_version);
end;
$function$;

revoke all on function public.marketplace_reschedule_listing(text, bigint, bigint, uuid, timestamp with time zone, text, text) from public;

grant all on function public.marketplace_reschedule_listing(text, bigint, bigint, uuid, timestamp with time zone, text, text) to authenticated;

grant all on function public.marketplace_reschedule_listing(text, bigint, bigint, uuid, timestamp with time zone, text, text) to service_role;

-- Explizite Inseratauftragsrechte aus dem deklarativen Schema.
revoke all on public.marketplace_listing_permissions from public,anon,authenticated;
grant select on public.marketplace_listing_permissions to authenticated;
grant all on public.marketplace_listing_permissions to service_role;
grant usage,select on sequence public.marketplace_listing_permissions_id_seq to service_role;
revoke all on public.marketplace_listing_jobs from public,anon,authenticated;
grant select on public.marketplace_listing_jobs to authenticated;
grant all on public.marketplace_listing_jobs to service_role;
grant usage,select on sequence public.marketplace_listing_jobs_id_seq to service_role;
revoke all on function public.marketplace_protect_listing_job() from public,anon,authenticated;
revoke all on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_listing_permission_valid(bigint,uuid,bigint) to service_role;
revoke all on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) from public,anon;
grant execute on function public.marketplace_read_listing_permission(uuid,uuid),public.marketplace_approve_listings(uuid,uuid,text),public.marketplace_revoke_listings(uuid,uuid,bigint) to authenticated;
revoke all on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) from public,anon;
grant execute on function public.marketplace_listing_job_timing(timestamptz,text,timestamptz) to authenticated,service_role;
revoke all on function public.marketplace_listing_job_document(public.marketplace_listing_jobs) from public,anon,authenticated;
revoke all on function public.marketplace_enqueue_listing_internal(text,bigint,text,uuid,boolean,timestamptz,text,text,bigint,bigint) from public,anon,authenticated;
revoke all on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) from public,anon;
grant execute on function public.marketplace_replace_planned_listing(text,bigint,bigint,text,uuid,boolean,timestamptz,text,text) to authenticated;
revoke all on function public.marketplace_reschedule_listing(text,bigint,bigint,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.marketplace_reschedule_listing(text,bigint,bigint,uuid,timestamptz,text,text) to authenticated;
revoke all on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) from public,anon;
grant execute on function public.marketplace_enqueue_listing(text,bigint,text,uuid,boolean,timestamptz,text,text),public.marketplace_cancel_listing_job(text,bigint) to authenticated;
revoke all on function public.marketplace_read_listing_jobs(uuid,text) from public,anon;
grant execute on function public.marketplace_read_listing_jobs(uuid,text) to authenticated;
