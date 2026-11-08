-- Zweck: Den Schritt, an dem ein Cloud-Inseratversuch vor dem Schreiben scheitert (etwa „values“),
-- am Auftrag speichern. Das Fehlerprotokoll der Administration (platform_error_events) übernimmt die
-- Spalte stage automatisch in die Details. Bisher stand der Schritt nur im Worker-Protokoll.
-- Betroffen: public.marketplace_listing_jobs (neue Spalte stage) und
-- public.marketplace_cloud_listing_finish (neuer optionaler Parameter p_stage).
-- Die alte Signatur ohne p_stage wird ersetzt, damit Aufrufe mit sieben Parametern eindeutig bleiben.
-- Nicht destruktiv für Daten.

alter table public.marketplace_listing_jobs
  add column stage text check (stage ~ '^[a-z_]{1,40}$');
comment on column public.marketplace_listing_jobs.stage is 'Schritt, an dem ein Cloud-Versuch vor dem Schreiben gescheitert ist (etwa values oder category_path); erscheint im Fehlerprotokoll der Administration.';

drop function public.marketplace_cloud_listing_finish(uuid,uuid,text,uuid,uuid,bigint,jsonb);

create or replace function public.marketplace_cloud_listing_finish(p_workspace_id uuid,p_connection_id uuid,p_job_id text,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_result jsonb,p_stage text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_job public.marketplace_listing_jobs;
begin
  if p_stage is not null and p_stage !~ '^[a-z_]{1,40}$' then raise exception 'Ungültiger Schritt.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  -- Späte Belege benötigen die ursprüngliche Kennung; neue Schreibaktionen bleiben gesperrt.
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and id=p_job_id::bigint and execution_mode='cloud'
    and (connection_id=p_connection_id or (connection_id is null and snapshot->>'connectionId'=p_connection_id::text))
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch for update;
  if not found then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  if p_result->>'outcome'='relisting_deleted' then
    if v_job.provider_result=p_result then return public.marketplace_listing_job_document(v_job); end if;
    if (select count(*) from jsonb_object_keys(p_result))<>4 or p_result->>'externalId' is distinct from v_job.snapshot->>'relistExternalId'
      or p_result->>'externalAccountId' is distinct from v_job.external_account_id or p_result->>'verifiedAt' is null
      or (p_result->>'verifiedAt')::timestamptz > clock_timestamp()+interval '1 minute' or (p_result->>'verifiedAt')::timestamptz < v_job.started_at-interval '1 minute'
      or v_job.started_at is null or v_job.state not in ('writing','outcome_unknown') or v_job.relist_publish_at is not null then
      raise exception 'Ungültiger Löschbeleg.' using errcode='22023';
    end if;
    -- Inhalt und Position der ursprünglichen Karte bleiben bis zur bestätigten Neuverknüpfung erhalten.
    perform public.marketplace_bind_relisting_entry(v_job);
    update public.marketplace_listing_drafts set relist_deleted_at=(p_result->>'verifiedAt')::timestamptz,relist_deleted_account_id=v_job.external_account_id where id=v_job.draft_id;
    update public.marketplace_listing_jobs set state='queued',error_code=null,started_at=null,lease_expires_at=null,
      relist_publish_at=coalesce(scheduled_at,clock_timestamp()+make_interval(secs=>relist_delay_seconds)),provider_result=p_result
      where id=v_job.id returning * into v_job;
    return public.marketplace_listing_job_document(v_job);
  end if;
  -- Der Schritt eines gescheiterten Versuchs steht vor dem Statuswechsel fest, damit ihn das
  -- Fehlerprotokoll der Administration mit übernimmt.
  if p_stage is not null and p_result->>'outcome' in ('failed','outcome_unknown') then
    update public.marketplace_listing_jobs set stage=p_stage where id=v_job.id returning * into v_job;
  end if;
  return public.marketplace_listing_finish_job(v_job,p_result);
end;
$$;

revoke all on function public.marketplace_cloud_listing_finish(uuid,uuid,text,uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_listing_finish(uuid,uuid,text,uuid,uuid,bigint,jsonb,text) to service_role;
