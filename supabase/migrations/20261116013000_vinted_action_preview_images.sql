-- Zweck: Vorschaubilder für die Seitenleiste „Aktionen“.
-- Kontoaufträge, Inseratsaufträge und die übrigen Vinted-Aktionen liefern zusätzlich ein Bild des
-- betroffenen Artikels: die gespeicherte Vinted-Bildadresse des Inserats bzw. Gesprächs, bei
-- Inseratsaufträgen ohne Vinted-Inserat den Speicherpfad des ersten Entwurfsfotos.
-- Rein lesende Projektionen; Signaturen, Rechte und alle übrigen Felder bleiben unverändert.
-- Betroffen: marketplace_account_action_public, marketplace_listing_job_document, marketplace_read_action_overview.
create or replace function public.marketplace_account_action_public(p_action public.marketplace_account_actions)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_wait text; v_blocker uuid;
begin
  if p_action.state='queued' then
    if p_action.is_write and p_action.resource_key is not null then
      select public_id into v_blocker from public.marketplace_account_actions where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id
        and is_write and resource_key=p_action.resource_key and state='outcome_unknown' and queue_order<p_action.queue_order order by queue_order limit 1;
    end if;
    v_wait:=case when v_blocker is not null or (p_action.is_write and p_action.resource_key is not null and exists(
        select 1 from public.marketplace_browser_queue_entries() previous where previous.workspace_id=p_action.workspace_id and previous.connection_id=p_action.connection_id
          and previous.is_write and previous.resource_key=p_action.resource_key and previous.queue_order<p_action.queue_order and previous.state='outcome_unknown')) then 'dependency_unresolved'
      when p_action.kind not in ('cloud_setup_open','cloud_session_open') and (not public.marketplace_cloud_write_available(p_action.workspace_id,p_action.connection_id)
        or exists(select 1 from public.marketplace_connections where workspace_id=p_action.workspace_id and id=p_action.connection_id and status in ('needs_login','paused'))) then 'account_paused'
      else public.marketplace_browser_slot_status(p_action.workspace_id,p_action.connection_id) end;
  end if;
  return jsonb_build_object('id',p_action.public_id,'workspaceId',p_action.workspace_id,'connectionId',p_action.connection_id,'requestId',p_action.request_id,
    'kind',p_action.kind,'state',p_action.state,'version',p_action.version,'waitReason',v_wait,'errorCode',p_action.error_code,'result',p_action.result,'entryId',p_action.entry_id,'title',p_action.title,
    'imageUrl',(select coalesce(entry.body->>'imageUrl',entry.body->>'itemImageUrl') from public.marketplace_account_entries entry
      where entry.id=p_action.entry_id and entry.workspace_id=p_action.workspace_id and entry.connection_id=p_action.connection_id),
    'createdAt',p_action.created_at,'startedAt',p_action.started_at,'finishedAt',p_action.finished_at,'updatedAt',p_action.updated_at,
    'historyPurged',p_action.history_purged_at is not null,'resultExpired',p_action.history_purged_at is not null,'blockedByActionId',v_blocker);
end;
$$;

create or replace function public.marketplace_listing_job_document(p_job public.marketplace_listing_jobs)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id,'draftId',p_job.draft_id::text,
    'draftRevision',p_job.draft_revision,'executionMode',p_job.execution_mode,'externalAccountId',p_job.external_account_id,'action',p_job.action,
    'state',p_job.state,'version',p_job.version,'scheduledAt',coalesce(p_job.relist_publish_at,p_job.scheduled_at),'timeZone',case when coalesce(p_job.relist_publish_at,p_job.scheduled_at) is not null then coalesce(p_job.time_zone,'Europe/Berlin') else null end,'latePolicy',p_job.late_policy,
    'errorCode',p_job.error_code,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at,'replacesJobId',p_job.replaces_job_id::text,
    'relistEntryId',p_job.relist_entry_id,'relistDeletedAt',(select relist_deleted_at from public.marketplace_listing_drafts where id=p_job.draft_id),'relistDelaySeconds',p_job.relist_delay_seconds,'relistExternalId',p_job.snapshot->>'relistExternalId','itemTitle',p_job.snapshot->'content'->>'title',
    -- Vorschaubild für die Aktionsübersicht: bestätigtes oder bisheriges Vinted-Inserat, sonst erstes Entwurfsfoto.
    'imageUrl',coalesce(
      (select entry.body->>'imageUrl' from public.marketplace_account_entries entry where entry.workspace_id=p_job.workspace_id and entry.connection_id=p_job.connection_id
        and entry.kind='publication' and entry.external_id=p_job.external_id),
      (select entry.body->>'imageUrl' from public.marketplace_account_entries entry where entry.workspace_id=p_job.workspace_id and entry.connection_id=p_job.connection_id
        and entry.kind='publication' and entry.external_id=p_job.snapshot->>'relistExternalId')),
    'coverStoragePath',p_job.snapshot->'images'->0->>'storagePath');
$$;

create or replace function public.marketplace_read_action_overview(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actions jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id)
    -- Die reine Lesefunktion prüft denselben Nutzerstatus ohne die Schreibsperre des Versandhelpers.
    or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  with actions as (
    select 'negotiation:'||job.id as id,'negotiation'::text as source,job.id as source_id,job.action as kind,job.automated as is_automated,
      case when job.state='sending' and job.lease_expires_at<=statement_timestamp() then 'outcome_unknown'
        when job.state in ('claimed','sending') then 'running' when job.state='sent' then 'succeeded' else job.state end as state,
      job.conversation_id,job.message_id,job.source_offer->>'offerId' as offer_id,conversation.body->>'title' as partner_name,
      coalesce(conversation.body->>'itemTitle',publication.body->>'title') as item_title,
      case when coalesce(job.command->>'priceCents',job.command->>'offeredPriceCents') ~ '^[0-9]{1,9}$'
        then coalesce(job.command->>'priceCents',job.command->>'offeredPriceCents')::integer end as price_cents,
      job.command->>'currency' as currency,
      case when job.action='message' then left(job.command->>'text',160) end as text_preview,
      job.created_at,job.updated_at,job.error_code,
      coalesce(conversation.body->>'itemImageUrl',publication.body->>'imageUrl') as image_url
    from public.marketplace_negotiation_jobs job
    left join public.marketplace_account_entries conversation on conversation.workspace_id=job.workspace_id and conversation.connection_id=job.connection_id and conversation.id=job.conversation_id and conversation.kind='conversation'
    left join public.marketplace_negotiation_threads thread on thread.workspace_id=job.workspace_id and thread.connection_id=job.connection_id and thread.id=job.thread_id
    left join public.marketplace_account_entries publication on publication.workspace_id=job.workspace_id and publication.connection_id=job.connection_id and publication.kind='publication' and publication.external_id=thread.item_id
    where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id
    union all
    select 'message:'||outbox.id,'message',outbox.id,'message',false,
      case when outbox.state='sending' and outbox.lease_expires_at<=statement_timestamp() then 'outcome_unknown'
        when outbox.state in ('claimed','sending') then 'running' when outbox.state='sent' then 'succeeded' else outbox.state end,
      outbox.conversation_id,message.id,null::text,conversation.body->>'title',conversation.body->>'itemTitle',null::integer,null::text,
      left(outbox.message_text,160),outbox.created_at,outbox.updated_at,outbox.error_code,conversation.body->>'itemImageUrl'
    from public.marketplace_local_message_outbox outbox
    left join public.marketplace_account_entries conversation on conversation.workspace_id=outbox.workspace_id and conversation.connection_id=outbox.connection_id and conversation.id=outbox.conversation_id and conversation.kind='conversation'
    left join public.marketplace_account_entries message on message.workspace_id=outbox.workspace_id and message.connection_id=outbox.connection_id and message.parent_id=outbox.conversation_id and message.kind='message' and message.external_id=outbox.external_message_id
    where outbox.workspace_id=p_workspace_id and outbox.connection_id=p_connection_id
    union all
    select 'sync:'||operation.id,'sync',operation.id,'sync',false,operation.state,null::uuid,null::uuid,null::text,null::text,null::text,null::integer,null::text,null::text,
      operation.created_at,coalesce(operation.finished_at,operation.heartbeat_at,operation.started_at,operation.created_at),operation.error_code,null::text
    from public.marketplace_operations operation where operation.workspace_id=p_workspace_id and operation.connection_id=p_connection_id
  ), selected as (
    select * from actions where state in ('queued','running','outcome_unknown')
    union all
    (select * from actions where state not in ('queued','running','outcome_unknown') order by updated_at desc,id desc limit 10)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'source',source,'sourceId',source_id,'kind',kind,'isAutomated',is_automated,'state',state,
    'conversationId',conversation_id,'messageId',message_id,'offerId',offer_id,'partnerName',partner_name,'itemTitle',item_title,
    'priceCents',price_cents,'currency',currency,'textPreview',text_preview,'createdAt',created_at,'updatedAt',updated_at,'errorCode',error_code,'imageUrl',image_url,
    'waitReason',case when state='queued' then case when error_code='dependency_unresolved' then 'dependency_unresolved'
      when not public.marketplace_cloud_write_available(p_workspace_id,p_connection_id) then 'account_paused'
      else public.marketplace_browser_slot_status(p_workspace_id,p_connection_id) end end)
    order by created_at,id),'[]'::jsonb) into v_actions from selected;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'actions',v_actions);
end;
$$;
