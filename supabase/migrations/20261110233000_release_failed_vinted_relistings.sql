-- Fehlgeschlagene Cloud-Relistings vor einer bestätigten Löschung können verworfen werden.
-- Quelle, Auftragshistorie und Fehlermeldung bleiben erhalten; nur die Sperre entfällt.
-- Laufende, unklare oder bereits gelöschte Relistings bleiben unverändert geschützt.
create or replace function public.marketplace_cancel_listing_job(p_job_id text,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.marketplace_listing_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_job.workspace_id);
  select * into v_job from public.marketplace_listing_jobs where id=p_job_id::bigint for update;
  if p_expected_version is null or v_job.version<>p_expected_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
  -- Vor bestätigter Löschung beendete Fehlversuche dürfen die echte Anzeige freigeben.
  if v_job.state not in ('queued','paused') and not (
    v_job.state='failed' and v_job.action='publish' and v_job.execution_mode='cloud'
    and v_job.snapshot ? 'relistExternalId' and v_job.external_id is null
    and not exists(select 1 from public.marketplace_listing_drafts draft
      where draft.id=v_job.draft_id and draft.relist_deleted_at is not null)
  ) then raise exception 'Dieser Auftrag kann nicht mehr sicher abgebrochen werden.' using errcode='22023'; end if;
  update public.marketplace_listing_jobs set state='cancelled',version=version+1,updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  return public.marketplace_listing_job_document(v_job);
end;
$$;
revoke all on function public.marketplace_cancel_listing_job(text,bigint) from public,anon;
grant execute on function public.marketplace_cancel_listing_job(text,bigint) to authenticated;
