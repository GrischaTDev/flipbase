-- Zweck: Normale Vinted-Neuveröffentlichungen mit Erstellungsbeleg (state='outcome_unknown' und
-- provider_unconfirmed_*-Code) fordern ebenfalls den lesenden Kontoabgleich an und werden beim
-- anschließenden Aktiv-Import auf demselben Konto wie Relistings als confirmed abgeschlossen.
-- Bestehende Alt-Aufträge mit bereits importiertem Aktivbeleg werden transaktional nachgezogen,
-- damit sie nachfolgende Preis- und Inseratänderungen nicht dauerhaft blockieren.
-- Betroffen: marketplace_request_relisting_import, marketplace_accept_relisting_import,
-- bestehende Zeilen in marketplace_listing_jobs mit state='outcome_unknown' und belegtem Aktivimport.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

create or replace function public.marketplace_request_relisting_import(p_job public.marketplace_listing_jobs)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  if p_job.state not in ('confirmed','outcome_unknown') or p_job.external_id is null
    or (p_job.state='outcome_unknown' and (p_job.provider_result->>'externalId' is distinct from p_job.external_id
      or p_job.provider_result->>'externalAccountId' is distinct from p_job.external_account_id))
    or p_job.action<>'publish' or p_job.execution_mode<>'cloud'
    or (not (p_job.snapshot ? 'relistExternalId') and (p_job.state<>'outcome_unknown' or coalesce(p_job.error_code,'') not in (
      'provider_unconfirmed_save_navigation','provider_unconfirmed_saved_navigation','provider_unconfirmed_saved_form',
      'provider_unconfirmed_active_navigation','provider_unconfirmed_active_filter','provider_unconfirmed_active_loading','provider_unconfirmed_active_evidence')))
    or ((p_job.snapshot ? 'relistExternalId') and (not public.marketplace_relisting_job_is_latest(p_job) or p_job.relist_imported_at is not null))
    or not public.marketplace_workspace_authorization_valid(p_job.workspace_id,p_job.requested_by)
    or not exists(select 1 from public.marketplace_connections where id=p_job.connection_id and workspace_id=p_job.workspace_id
      and external_account_id=p_job.external_account_id and execution_mode='cloud' and status='connected') then return; end if;
  if exists(select 1 from public.marketplace_operations where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and created_at>=p_job.finished_at and (state in ('queued','running') or finished_at>clock_timestamp()-interval '1 minute')) then return; end if;
  insert into public.marketplace_operations(workspace_id,connection_id,requested_by,authorization_kind,authorization_version,created_at)
    values(p_job.workspace_id,p_job.connection_id,p_job.requested_by,'manual_read',1,clock_timestamp())
    on conflict(workspace_id,connection_id) where state in ('queued','running') do nothing;
end;
$$;
revoke all on function public.marketplace_request_relisting_import(public.marketplace_listing_jobs) from public,anon,authenticated;
grant execute on function public.marketplace_request_relisting_import(public.marketplace_listing_jobs) to service_role;

create or replace function public.marketplace_accept_relisting_import(p_workspace_id uuid,p_connection_id uuid,p_external_id text,p_observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v_job public.marketplace_listing_jobs; v_entry public.marketplace_account_entries; v_entry_id uuid;
begin
  select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id
    and kind='publication' and external_id=p_external_id and observed_at=p_observed_at;
  if not found or p_observed_at>clock_timestamp()+interval '5 minutes' then return; end if;
  for v_job in select job.* from public.marketplace_listing_jobs job
    join public.marketplace_connections account on account.workspace_id=job.workspace_id and account.id=job.connection_id and account.external_account_id=job.external_account_id
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.external_id=p_external_id
      and p_observed_at>job.finished_at
      and (
        (job.state in ('confirmed','outcome_unknown') and job.snapshot ? 'relistExternalId' and job.relist_imported_at is null and public.marketplace_relisting_job_is_latest(job))
        or (job.state='outcome_unknown' and job.action='publish' and not (job.snapshot ? 'relistExternalId'))
      ) for update of job loop
    if v_job.state='outcome_unknown' then
      if v_job.provider_result->>'externalId' is distinct from p_external_id
        or v_job.provider_result->>'externalAccountId' is distinct from v_job.external_account_id
        or ((v_job.snapshot ? 'relistExternalId') and not exists(select 1 from public.marketplace_listing_drafts draft where draft.id=v_job.draft_id and draft.workspace_id=v_job.workspace_id
          and draft.relist_deleted_at is not null and draft.relist_deleted_account_id=v_job.external_account_id)) then continue; end if;
      -- Die neue Kennung stammt aus der echten Erstellungsantwort, der Aktivbeleg aus dem eigenen Konto.
      -- Inhalts- oder Fotowidersprüche bleiben ungeklärt; sie erzeugen trotzdem keine zweite Karte.
      if v_entry.body->>'publicationState'='active' and v_job.error_code in (
        'provider_unconfirmed_save_navigation','provider_unconfirmed_saved_navigation','provider_unconfirmed_saved_form',
        'provider_unconfirmed_active_navigation','provider_unconfirmed_active_filter','provider_unconfirmed_active_loading','provider_unconfirmed_active_evidence') then
        perform public.marketplace_listing_finish_job(v_job,jsonb_build_object('outcome','confirmed','action','publish','externalId',p_external_id,
          'externalAccountId',v_job.external_account_id,'providerState','active','verifiedAt',to_char(p_observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
        select * into v_job from public.marketplace_listing_jobs where id=v_job.id;
      end if;
    end if;
    if v_job.snapshot ? 'relistExternalId' then
      v_entry_id:=public.marketplace_relink_relisting_entry(v_job);
      if v_entry_id is not null and (v_job.state='confirmed' or v_entry.body->>'publicationState'='active') then
        update public.marketplace_listing_jobs set relist_imported_at=p_observed_at where id=v_job.id;
      end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.marketplace_accept_relisting_import(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.marketplace_accept_relisting_import(uuid,uuid,text,timestamptz) to service_role;

do $$
declare v_match record;
begin
  for v_match in
    select entry.workspace_id,entry.connection_id,entry.external_id,entry.observed_at
    from public.marketplace_listing_jobs job
    join public.marketplace_account_entries entry
      on entry.workspace_id=job.workspace_id and entry.connection_id=job.connection_id
      and entry.kind='publication' and entry.external_id=job.external_id
      and entry.body->>'publicationState'='active' and entry.observed_at>job.finished_at
    where job.state='outcome_unknown' and job.action='publish' and not (job.snapshot ? 'relistExternalId')
      and job.external_id is not null
  loop
    perform public.marketplace_accept_relisting_import(v_match.workspace_id,v_match.connection_id,v_match.external_id,v_match.observed_at);
  end loop;
end;
$$;
