-- Zweck: Unbegonnene Kleinanzeigen-Aufträge bei Widerruf, geänderter Fassung oder abgelaufener Vorbereitung beenden; begonnene Versuche bleiben gesperrt.
set check_function_bodies = off;

create or replace function public.kleinanzeigen_expire_listing_jobs(p_workspace_id uuid, p_connection_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
 -- Nach begin bleibt der Ausgang ungeklärt und gesperrt; Widerruf oder Timeout erlaubt keinen neuen Submit.
 update public.kleinanzeigen_publication_jobs set state='outcome_unknown',error_code='publication_unconfirmed',lease_until=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state='writing' and lease_until<=clock_timestamp();
 update public.kleinanzeigen_publication_jobs job set state='cancelled',error_code='grant_changed',completed_at=clock_timestamp(),lease_until=null
 where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.state in ('queued','claimed') and job.started_at is null and not exists(
  select 1 from public.kleinanzeigen_local_grants grant_row join public.kleinanzeigen_connections connection on connection.workspace_id=grant_row.workspace_id and connection.id=grant_row.connection_id
  where grant_row.workspace_id=job.workspace_id and grant_row.connection_id=job.connection_id and grant_row.grant_generation=job.grant_generation and grant_row.approved_by=job.requested_by and grant_row.can_publish and grant_row.revoked_at is null and grant_row.expires_at>clock_timestamp()
   and connection.status='connected' and connection.account_type='private' and connection.external_account_id=job.external_account_id and public.marketplace_sync_authorization_valid(job.workspace_id,job.requested_by) and public.marketplace_local_extension_user_valid(job.requested_by));
 update public.kleinanzeigen_publication_jobs job set state='cancelled',error_code='draft_changed',completed_at=clock_timestamp(),lease_until=null
 where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.state in ('queued','claimed') and job.started_at is null and not exists(select 1 from public.listings listing where listing.workspace_id=job.workspace_id and listing.id=job.draft_id and listing.target_connection_id=job.connection_id and listing.revision=job.draft_revision and listing.status='prepared');
 update public.kleinanzeigen_publication_jobs set state='needs_user_action',error_code='preparation_expired',completed_at=clock_timestamp(),lease_until=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','claimed') and started_at is null and created_at<=clock_timestamp()-interval '15 minutes';
 update public.kleinanzeigen_publication_jobs set state='queued',claim_token_hash=null,claim_installation_hash=null,lease_until=null,absolute_expires_at=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state='claimed' and started_at is null and lease_until<=clock_timestamp();
end;
$function$
;

-- Explicit Kleinanzeigen lifecycle permissions from declarative schema
revoke all on function public.kleinanzeigen_protect_writing_draft() from public,anon,authenticated,service_role;
revoke all on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) to service_role;
revoke all on function public.kleinanzeigen_read_listing_job(uuid,bigint,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_listing_job(uuid,bigint,bigint,uuid) to service_role;
revoke all on function public.kleinanzeigen_store_quota_observation(uuid,bigint,text,bigint,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_store_quota_observation(uuid,bigint,text,bigint,jsonb,bigint) to service_role;
revoke all on function public.kleinanzeigen_claim_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_claim_listing(uuid,bigint,text,bigint,bigint,text) to service_role;
revoke all on function public.kleinanzeigen_locked_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_locked_listing(uuid,bigint,text,bigint,bigint,text) to service_role;
revoke all on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) to service_role;
revoke all on function public.kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb) to service_role;
revoke all on function public.kleinanzeigen_finish_listing(uuid,bigint,text,bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_finish_listing(uuid,bigint,text,bigint,bigint,text,jsonb) to service_role;
revoke all on function public.kleinanzeigen_find_listing_job(uuid,bigint,uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_find_listing_job(uuid,bigint,uuid,uuid,uuid,bigint) to service_role;
revoke all on function public.kleinanzeigen_listing_job_photo(uuid,bigint,text,bigint,bigint,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_listing_job_photo(uuid,bigint,text,bigint,bigint,text,uuid) to service_role;
revoke all on function public.kleinanzeigen_read_draft_job(uuid,bigint,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_draft_job(uuid,bigint,uuid,uuid) to service_role;
