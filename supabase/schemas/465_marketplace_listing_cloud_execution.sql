-- Cloud-Versuche reservieren den bestehenden Browser und respektieren den physischen Stoppschutz.
alter table public.marketplace_listing_jobs
  add column cloud_browser_session_id uuid references public.marketplace_browser_sessions(public_id) on delete set null,
  add column cloud_worker_id uuid,
  add column cloud_worker_epoch bigint check(cloud_worker_epoch between 1 and 9007199254740991),
  add column cloud_runner_id uuid;
create index marketplace_listing_jobs_browser_session on public.marketplace_listing_jobs(cloud_browser_session_id);

create or replace function public.marketplace_expire_cloud_listing_attempts(p_workspace_id uuid default null)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  update public.marketplace_listing_jobs job set state='outcome_unknown',error_code='timeout',lease_expires_at=null
    where (p_workspace_id is null or workspace_id=p_workspace_id) and execution_mode='cloud' and state in ('claimed','writing') and started_at is not null
      and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=job.cloud_browser_session_id and state='closed'));
  -- Eine abgelaufene Lease allein beweist keinen physischen Browserstopp.
  update public.marketplace_listing_jobs job set state='queued',claim_token=null,lease_expires_at=null,absolute_expires_at=null,
    cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null
    where (p_workspace_id is null or workspace_id=p_workspace_id) and execution_mode='cloud' and state='claimed' and started_at is null
      and exists(select 1 from public.marketplace_browser_sessions where public_id=job.cloud_browser_session_id and state='closed');
end;
$$;

create or replace function public.marketplace_cloud_listing_claim(p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_job public.marketplace_listing_jobs; v_permission public.marketplace_listing_permissions; v_session public.marketplace_browser_sessions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt.' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  perform public.marketplace_expire_cloud_listing_attempts();
  update public.marketplace_listing_jobs job set state='cancelled',error_code='authorization_revoked',lease_expires_at=null
    where execution_mode='cloud' and state in ('queued','paused','claimed') and not public.marketplace_listing_job_valid(job);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='paused';
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where execution_mode='cloud' and state='queued' and public.marketplace_listing_job_valid(job)
    and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='due'
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_listing_permissions where id=v_job.permission_id for update;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_job.workspace_id,v_job.connection_id,v_job.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,absolute_expires_at=v_session.absolute_expires_at,
    cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'userId',v_job.requested_by,
    'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_job.authorization_version,'externalAccountId',v_job.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'action',v_job.action,'snapshot',v_job.snapshot);
end;
$$;

create or replace function public.marketplace_cloud_listing_check(p_workspace_id uuid,p_connection_id uuid,p_job_id text,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_job public.marketplace_listing_jobs; v_session public.marketplace_browser_sessions; v_inactive jsonb:='{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id::bigint and execution_mode='cloud'
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and state in ('claimed','writing')
    and lease_expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp() for update;
  if not found or not public.marketplace_listing_job_valid(v_job) then return v_inactive; end if;
  if v_job.state='claimed' and public.marketplace_listing_job_timing(v_job.scheduled_at,v_job.late_policy,clock_timestamp())<>'due' then
    update public.marketplace_listing_jobs set state='paused',error_code='schedule_late',lease_expires_at=null where id=v_job.id;
    return v_inactive;
  end if;
  select * into v_session from public.marketplace_browser_sessions where public_id=v_job.cloud_browser_session_id and workspace_id=p_workspace_id and connection_id=p_connection_id
    and started_by=v_job.requested_by and worker_id=p_worker_id and worker_epoch=p_worker_epoch and state='active' and expires_at>clock_timestamp()
    and absolute_expires_at=v_job.absolute_expires_at and absolute_expires_at>clock_timestamp()
    and provider_profile_id=(select provider_profile_id from public.marketplace_listing_permissions where id=v_job.permission_id) for update;
  if not found then return v_inactive; end if;
  update public.marketplace_browser_sessions set heartbeat_at=clock_timestamp(),expires_at=least(clock_timestamp()+interval '90 seconds',absolute_expires_at) where id=v_session.id returning * into v_session;
  update public.marketplace_listing_jobs set lease_expires_at=v_session.expires_at where id=v_job.id;
  return jsonb_build_object('active',true,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
end;
$$;

create or replace function public.marketplace_cloud_listing_begin(p_workspace_id uuid,p_connection_id uuid,p_job_id text,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
  if public.marketplace_cloud_listing_check(p_workspace_id,p_connection_id,p_job_id,p_claim_token,p_worker_id,p_worker_epoch)->>'active'<>'true' then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  update public.marketplace_listing_jobs set state='writing',started_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id::bigint and claim_token=p_claim_token and state='claimed' and started_at is null;
  if not found then raise exception 'Inseratversuch wurde bereits begonnen oder beendet.' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.marketplace_cloud_listing_finish(p_workspace_id uuid,p_connection_id uuid,p_job_id text,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_result jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  -- Späte Belege benötigen die ursprüngliche Kennung; neue Schreibaktionen bleiben gesperrt.
  select * into v_job from public.marketplace_listing_jobs where workspace_id=p_workspace_id and id=p_job_id::bigint and execution_mode='cloud'
    and (connection_id=p_connection_id or (connection_id is null and snapshot->>'connectionId'=p_connection_id::text))
    and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch for update;
  if not found then raise exception 'Inseratversuch ungültig.' using errcode='42501'; end if;
  return public.marketplace_listing_finish_job(v_job,p_result);
end;
$$;

revoke all on function public.marketplace_expire_cloud_listing_attempts(uuid),public.marketplace_cloud_listing_claim(uuid,bigint,uuid),public.marketplace_cloud_listing_check(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_begin(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_finish(uuid,uuid,text,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_expire_cloud_listing_attempts(uuid),public.marketplace_cloud_listing_claim(uuid,bigint,uuid),public.marketplace_cloud_listing_check(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_begin(uuid,uuid,text,uuid,uuid,bigint),public.marketplace_cloud_listing_finish(uuid,uuid,text,uuid,uuid,bigint,jsonb) to service_role;
