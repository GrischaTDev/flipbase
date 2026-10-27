-- Lesende Aktionsübersicht: private Aufträge werden nur nach Konto- und Nutzerprüfung projiziert.
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
      job.created_at,job.updated_at,job.error_code
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
      left(outbox.message_text,160),outbox.created_at,outbox.updated_at,outbox.error_code
    from public.marketplace_local_message_outbox outbox
    left join public.marketplace_account_entries conversation on conversation.workspace_id=outbox.workspace_id and conversation.connection_id=outbox.connection_id and conversation.id=outbox.conversation_id and conversation.kind='conversation'
    left join public.marketplace_account_entries message on message.workspace_id=outbox.workspace_id and message.connection_id=outbox.connection_id and message.parent_id=outbox.conversation_id and message.kind='message' and message.external_id=outbox.external_message_id
    where outbox.workspace_id=p_workspace_id and outbox.connection_id=p_connection_id
    union all
    select 'sync:'||operation.id,'sync',operation.id,'sync',false,operation.state,null::uuid,null::uuid,null::text,null::text,null::text,null::integer,null::text,null::text,
      operation.created_at,coalesce(operation.finished_at,operation.heartbeat_at,operation.started_at,operation.created_at),operation.error_code
    from public.marketplace_operations operation where operation.workspace_id=p_workspace_id and operation.connection_id=p_connection_id
  ), selected as (
    select * from actions where state in ('queued','running','outcome_unknown')
    union all
    (select * from actions where state not in ('queued','running','outcome_unknown') order by updated_at desc,id desc limit 10)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'source',source,'sourceId',source_id,'kind',kind,'isAutomated',is_automated,'state',state,
    'conversationId',conversation_id,'messageId',message_id,'offerId',offer_id,'partnerName',partner_name,'itemTitle',item_title,
    'priceCents',price_cents,'currency',currency,'textPreview',text_preview,'createdAt',created_at,'updatedAt',updated_at,'errorCode',error_code)
    order by created_at,id),'[]'::jsonb) into v_actions from selected;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'actions',v_actions);
end;
$$;
revoke all on function public.marketplace_read_action_overview(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.marketplace_read_action_overview(uuid,uuid) to authenticated;
