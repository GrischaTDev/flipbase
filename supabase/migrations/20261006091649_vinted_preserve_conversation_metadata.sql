-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.marketplace_import_local_inbox (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_token_hash    text,
  p_batch         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_observed timestamptz; v_entry jsonb; v_parent uuid; v_existing public.marketplace_account_entries; v_conversations integer:=0; v_messages integer:=0; v_page integer; v_next_page integer; v_complete boolean; v_mode text; v_detail_external text;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'local' or v_connection.status in ('paused','blocked','disconnected') then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
  if not found or not v_grant.messages_read or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
    or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
    or not public.marketplace_local_extension_user_valid(v_grant.approved_by)
    or v_connection.external_account_id is distinct from v_grant.external_account_id then raise exception 'Lokale Freigabe ungültig' using errcode='42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_batch)) not between 6 and 8
    or exists(select 1 from jsonb_object_keys(p_batch) field where field<>all(array['identity','observedAt','page','nextPage','conversationsComplete','entries','mode','detailConversationId']))
    or octet_length(p_batch::text)>524288 or jsonb_typeof(p_batch->'identity') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_batch->'identity'))<>1 or p_batch->'identity'->>'id' is distinct from v_grant.external_account_id
    or jsonb_typeof(p_batch->'entries') is distinct from 'array' or jsonb_array_length(p_batch->'entries')>220
    or jsonb_typeof(p_batch->'conversationsComplete') is distinct from 'boolean'
    or jsonb_typeof(p_batch->'page') is distinct from 'number' or jsonb_typeof(p_batch->'nextPage') is distinct from 'number'
    or jsonb_typeof(p_batch->'observedAt') is distinct from 'string' then raise exception 'Ungültiger Inboximport' using errcode='22023'; end if;
  v_mode:=coalesce(p_batch->>'mode','backfill');
  if v_mode not in ('backfill','latest','detail') or (v_mode='detail') is distinct from (p_batch ? 'detailConversationId') then raise exception 'Ungültiger Inboxmodus' using errcode='22023'; end if;
  if v_mode='detail' then
    if jsonb_typeof(p_batch->'detailConversationId') is distinct from 'string' or p_batch->>'detailConversationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Ungültiges Gespräch' using errcode='22023'; end if;
    select external_id into v_detail_external from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and id=(p_batch->>'detailConversationId')::uuid;
    if not found then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  end if;
  begin v_observed:=(p_batch->>'observedAt')::timestamptz; v_page:=(p_batch->>'page')::integer; v_next_page:=(p_batch->>'nextPage')::integer;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then raise exception 'Ungültiger Inboximport' using errcode='22023'; end;
  if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '5 minutes' or v_observed<clock_timestamp()-interval '24 hours'
    or v_observed<=coalesce((select max(observed_at) from public.marketplace_account_sync_sources where workspace_id=p_workspace_id and connection_id=p_connection_id and area in ('conversations','messages')),'-infinity')
    or (v_mode='backfill' and v_page<>v_grant.inbox_next_page)
    or (v_mode in ('latest','detail') and v_page<>1)
    or (v_mode='detail' and v_next_page<>v_grant.inbox_next_page)
    or v_page not between 1 and 20 or v_next_page not between 1 and 20
    or (v_mode='backfill' and v_next_page<>1 and v_next_page<>v_page+1)
    or (v_mode='latest' and v_next_page<>1 and v_next_page<>2 and v_next_page<>v_grant.inbox_next_page) then raise exception 'Veralteter Inboximport' using errcode='22023'; end if;
  v_complete:=(p_batch->>'conversationsComplete')::boolean;
  if v_mode='detail' and (v_complete or (select count(*) from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation')<>1
    or not exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation' and e->>'externalId'=v_detail_external)
    or exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='message' and e->>'parentExternalId'<>v_detail_external)) then raise exception 'Ungültiger Detailimport' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_batch->'entries') e group by e->>'kind',e->>'externalId' having count(*)>1) then raise exception 'Doppelte Einträge' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_batch->'entries') order by (value->>'kind'='message') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or jsonb_typeof(v_entry->'body') is distinct from 'object'
      or v_entry->>'kind' not in ('conversation','message') or v_entry->>'kind' is null
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or v_entry->>'externalId' !~ '^(?:[1-9][0-9]{0,31}|event:[0-9a-f]{64})$'
      or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(v_entry) field where field<>all(array['kind','externalId','parentExternalId','sortAt','body']))
      or exists(select 1 from jsonb_object_keys(v_entry->'body') field where field<>all(case when v_entry->>'kind'='conversation' then array['title','text','occurredAt','sourceUpdatedAt','detailCheckedAt','unread','imageUrl','itemId','itemTitle','itemImageUrl','itemPrice','itemCurrency','partnerId','lastActiveAt','transactionStatus'] else array['title','text','occurredAt','direction','messageType','priceLabel','imageUrls','eventType','eventGroup','offerStatus'] end))
      or jsonb_typeof(v_entry->'body'->'title') is distinct from 'string' or char_length(v_entry->'body'->>'title') not between 1 and 500
      or jsonb_typeof(v_entry->'body'->'text') is distinct from 'string' and jsonb_typeof(v_entry->'body'->'text') is distinct from 'null'
      or char_length(v_entry->'body'->>'text')>10000
      or jsonb_typeof(v_entry->'body'->'occurredAt') is distinct from 'string' then raise exception 'Ungültiger Kontoeintrag' using errcode='22023'; end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) or not isfinite((v_entry->'body'->>'occurredAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eintragszeit' using errcode='22023'; end;
    if v_entry->>'kind'='conversation' then
      v_conversations:=v_conversations+1;
      if v_conversations>20 or v_entry ? 'parentExternalId' or v_entry->>'externalId' !~ '^[1-9][0-9]{0,31}$'
        or (select count(*) from jsonb_object_keys(v_entry->'body')) not between 7 and 15
        or jsonb_typeof(v_entry->'body'->'sourceUpdatedAt') is distinct from 'string'
        or jsonb_typeof(v_entry->'body'->'detailCheckedAt') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'unread') not in ('boolean','null')
        or jsonb_typeof(v_entry->'body'->'imageUrl') not in ('string','null')
        or exists(select 1 from jsonb_each(v_entry->'body') field where
          (field.key in ('itemId','partnerId') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^[1-9][0-9]{0,31}$'))
          or (field.key in ('itemTitle','transactionStatus') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or char_length(field.value#>>'{}')>500))
          or (field.key in ('itemImageUrl','imageUrl') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^https://'))
          or (field.key='itemCurrency' and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or field.value#>>'{}' !~ '^[A-Z]{3}$'))
          or (field.key='itemPrice' and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'number' or (field.value#>>'{}')::numeric<0 or (field.value#>>'{}')::numeric>1000000000000))
          or (field.key='lastActiveAt' and field.value <> 'null'::jsonb and jsonb_typeof(field.value)<>'string')
        ) then raise exception 'Ungültiges Gespräch' using errcode='22023'; end if;
      begin
        if not isfinite((v_entry->'body'->>'sourceUpdatedAt')::timestamptz)
          or (v_entry->'body'->>'lastActiveAt' is not null and not isfinite((v_entry->'body'->>'lastActiveAt')::timestamptz))
          or (v_entry->'body'->>'detailCheckedAt' is not null and not isfinite((v_entry->'body'->>'detailCheckedAt')::timestamptz)) then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end if;
      exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Gesprächszeit' using errcode='22023'; end;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'externalId' for update;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'conversation',v_entry->>'externalId',
          v_entry->'body' || coalesce((
              select jsonb_object_agg(field.key,field.value) from jsonb_each(v_existing.body) field
              where field.key=any(array['itemId','itemTitle','itemImageUrl','itemPrice','itemCurrency','partnerId','lastActiveAt','transactionStatus'])
                and (v_entry->'body'->field.key is null or v_entry->'body'->field.key='null'::jsonb)
            ),'{}'::jsonb) || case when v_existing.id is not null and v_existing.body->>'sourceUpdatedAt'=v_entry->'body'->>'sourceUpdatedAt' and v_entry->'body'->>'detailCheckedAt' is null
            then jsonb_build_object('text',v_existing.body->'text','occurredAt',v_existing.body->'occurredAt','detailCheckedAt',v_existing.body->'detailCheckedAt') else '{}'::jsonb end,
          (v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at;
    else
      v_messages:=v_messages+1;
      if v_messages>200 or jsonb_typeof(v_entry->'parentExternalId') is distinct from 'string' or v_entry->>'parentExternalId' !~ '^[1-9][0-9]{0,31}$'
        or (select count(*) from jsonb_object_keys(v_entry->'body')) not between 6 and 10
        or not exists(select 1 from jsonb_array_elements(p_batch->'entries') e where e->>'kind'='conversation' and e->>'externalId'=v_entry->>'parentExternalId')
        or v_entry->'body'->>'direction' not in ('inbound','outbound','unknown')
        or jsonb_typeof(v_entry->'body'->'messageType') not in ('string','null')
        or jsonb_typeof(v_entry->'body'->'priceLabel') not in ('string','null')
        or exists(select 1 from jsonb_each(v_entry->'body') field where field.key in ('eventType','eventGroup','offerStatus') and field.value <> 'null'::jsonb and (jsonb_typeof(field.value)<>'string' or char_length(field.value#>>'{}')>500))
        or (v_entry->'body' ? 'imageUrls' and (jsonb_typeof(v_entry->'body'->'imageUrls')<>'array' or jsonb_array_length(v_entry->'body'->'imageUrls')>10))
        or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(v_entry->'body'->'imageUrls')='array' then v_entry->'body'->'imageUrls' else '[]'::jsonb end) image where jsonb_typeof(image)<>'string' or image#>>'{}' !~ '^https://') then raise exception 'Ungültige Nachricht' using errcode='22023'; end if;
      select id into v_parent from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and external_id=v_entry->>'parentExternalId';
      if v_parent is null then raise exception 'Nachricht ohne Gespräch' using errcode='22023'; end if;
      select * into v_existing from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='message' and external_id=v_entry->>'externalId' for update;
      if v_existing.id is not null and v_existing.parent_id<>v_parent then raise exception 'Nachricht mit anderem Gespräch' using errcode='22023'; end if;
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
        values(p_workspace_id,p_connection_id,'message',v_entry->>'externalId',v_parent,v_entry->'body',(v_entry->>'sortAt')::timestamptz,v_observed)
        on conflict(workspace_id,connection_id,kind,external_id) do update set body=excluded.body,sort_at=excluded.sort_at,observed_at=excluded.observed_at where public.marketplace_account_entries.parent_id=excluded.parent_id;
    end if;
  end loop;
  if v_mode<>'detail' then
    insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at,last_complete_at)
      values(p_workspace_id,p_connection_id,'conversations',case when v_complete then 'complete' else 'partial' end,v_observed,v_observed,case when v_complete then v_observed end)
      on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at,last_complete_at=coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  end if;
  insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,observed_at,last_success_at)
    values(p_workspace_id,p_connection_id,'messages','partial',v_observed,v_observed)
    on conflict(workspace_id,connection_id,area) do update set status=excluded.status,failure=null,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at;
  update public.marketplace_connections set capabilities=capabilities || '{"conversations.read":"verified"}'::jsonb,last_synced_at=greatest(last_synced_at,v_observed),updated_at=clock_timestamp() where id=p_connection_id;
  update public.marketplace_local_extension_grants set inbox_next_page=case when v_mode='backfill' or (v_mode='latest' and inbox_next_page=1) then v_next_page else inbox_next_page end,last_seen_at=clock_timestamp() where id=v_grant.id;
  if v_grant.expires_at<=clock_timestamp() then raise exception 'Lokale Freigabe abgelaufen' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_grant.external_account_id,'expiresAt',v_grant.expires_at,'observedAt',v_observed,'counts',jsonb_build_object('conversation',v_conversations,'message',v_messages),'conversationsComplete',v_complete,'nextPage',case when v_mode='detail' then v_grant.inbox_next_page else v_next_page end);
end;
$function$;