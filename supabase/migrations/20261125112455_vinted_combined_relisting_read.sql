-- Lesende gemeinsame Relist-Planansicht ohne Anbieter- oder Schreibaufträge.
create function public.marketplace_read_vinted_relisting_plans (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_items jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'job',public.marketplace_listing_job_document(job),
    'draft',public.marketplace_listing_job_draft_document(job)
  ) order by job.created_at desc,job.id desc),'[]'::jsonb) into v_items
  from public.marketplace_listing_jobs job
  join public.marketplace_connections c on c.workspace_id=job.workspace_id
    and c.id=job.connection_id and c.marketplace='vinted' and c.execution_mode='cloud'
    and c.external_account_id=job.external_account_id
  where job.workspace_id=p_workspace_id and job.snapshot ? 'relistExternalId'
    and (
      job.state in ('queued','paused','claimed','writing','outcome_unknown','failed')
      or (job.state='confirmed' and job.relist_imported_at is null)
      or (job.state='cancelled' and exists (
        select 1 from public.marketplace_listing_drafts draft
        where draft.workspace_id=job.workspace_id and draft.id=job.draft_id and draft.relist_deleted_at is not null
      ))
    )
    and public.marketplace_relisting_job_is_latest(job);
  return jsonb_build_object('items',v_items);
end;
$function$;
revoke all on function public.marketplace_read_vinted_relisting_plans(uuid) from public, anon;
grant execute on function public.marketplace_read_vinted_relisting_plans(uuid) to authenticated;
