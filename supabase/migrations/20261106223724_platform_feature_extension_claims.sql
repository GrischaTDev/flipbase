-- Not-Aus auch fuer Auftraege der Browser-Erweiterung: neue Funktion platform_feature_enabled;
-- die Abholfunktionen marketplace_local_message_claim, marketplace_local_favorite_claim,
-- marketplace_local_negotiation_claim, marketplace_local_listing_claim, kleinanzeigen_claim_sync
-- und kleinanzeigen_claim_listing geben bei abgeschaltetem Bereich keinen neuen Auftrag heraus.
-- Laufende Versuche enden regulaer. Keine Tabellen oder Daten betroffen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

create or replace function public.platform_feature_enabled(p_feature_key text)
returns boolean
language sql
security invoker
stable
set search_path = ''
as $$
    select coalesce(
        (
            select switch.enabled
            from public.platform_feature_switches as switch
            where switch.feature_key = p_feature_key
        ),
        true
    );
$$;

comment on function public.platform_feature_enabled(text) is
    'Liefert false nur fuer einen vom Betreiber abgeschalteten Bereich.';

revoke all on function public.platform_feature_enabled(text) from public, anon;
grant execute on function public.platform_feature_enabled(text) to authenticated, service_role;

create or replace function public.marketplace_local_message_claim(p_workspace_id uuid,p_connection_id uuid,p_token_hash text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_message public.marketplace_local_message_outbox;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  -- Betreiber-Not-Aus: keine neuen Aufträge, solange Vinted abgeschaltet ist.
  if not public.platform_feature_enabled('vinted') then return jsonb_build_object('ok',true,'command',null); end if;
  update public.marketplace_local_message_outbox set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_local_message_outbox set state='queued',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='claimed' and lease_expires_at<=clock_timestamp();
  select * into v_message from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued'
    and grant_generation=v_grant.grant_generation and requested_by=v_grant.approved_by and external_account_id=v_grant.external_account_id order by created_at,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'command',null); end if;
  update public.marketplace_local_message_outbox set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_message.id returning * into v_message;
  return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_message.id,'claimToken',v_message.claim_token,'externalConversationId',v_message.external_conversation_id,
    'text',v_message.message_text,'attachment',case when v_message.attachment_name is null then null else jsonb_build_object('name',v_message.attachment_name,'mimeType',v_message.attachment_mime_type,'base64',v_message.attachment_base64) end));
end;
$$;

create or replace function public.marketplace_local_favorite_claim(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_offer_supported boolean)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_settings public.marketplace_favorite_message_settings; v_event public.marketplace_favorite_message_events; v_publication public.marketplace_account_entries; v_text text; v_price numeric;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  -- Betreiber-Not-Aus: keine neuen Aufträge, solange Vinted abgeschaltet ist.
  if not public.platform_feature_enabled('vinted') then return jsonb_build_object('ok',true,'command',null); end if;
  select * into v_settings from public.marketplace_favorite_message_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if v_settings.execution_mode is distinct from 'local' or not coalesce(v_settings.enabled,false) or v_settings.grant_generation<>v_grant.grant_generation or v_settings.external_account_id<>v_grant.external_account_id then return jsonb_build_object('ok',true,'command',null); end if;
  update public.marketplace_favorite_message_events set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp() where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set state='queued',claim_token=null,lease_expires_at=null where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='claimed' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set offer_state='outcome_unknown',offer_error_code='timeout',updated_at=clock_timestamp()
    where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sent' and offer_state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_favorite_message_events set offer_state='pending',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='sent' and offer_state='claimed' and lease_expires_at<=clock_timestamp();
  if coalesce(p_offer_supported,false) then
    select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id
      and state='sent' and offer_state='pending' and setting_version=v_settings.version order by event_at,id limit 1 for update skip locked;
    if found then
      -- Der bestätigte Text wird bei Wiederaufnahme nie erneut verschickt; sein eigenes Gespräch ist kein Ausschlussgrund.
      update public.marketplace_favorite_message_events set offer_state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
      return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_event.id,'claimToken',v_event.claim_token,'actorId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,
        'offer',v_event.offer_config,'stage','offer','conversationId',v_event.external_conversation_id,'transactionId',v_event.external_transaction_id,'externalMessageId',v_event.external_message_id));
    end if;
  end if;
  select * into v_event from public.marketplace_favorite_message_events where execution_mode='local' and workspace_id=p_workspace_id and connection_id=p_connection_id and state='queued' and setting_version=v_settings.version
    and (coalesce(p_offer_supported,false) or v_settings.config->'offer' is null or v_settings.config->'offer'='null'::jsonb)
    and event_at+make_interval(mins=>(v_settings.config->>'delayMinutes')::integer)<=clock_timestamp() order by event_at,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok',true,'command',null); end if;
  select * into v_publication from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='publication' and external_id=v_event.item_id;
  if not found or v_publication.body->'isClosed' is distinct from 'false'::jsonb or v_publication.body->'isReserved'='true'::jsonb
    or exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='conversation' and body->>'partnerId'=v_event.actor_id) then
    update public.marketplace_favorite_message_events set state='skipped',error_code='existing_conversation_or_inactive_item',updated_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'command',null);
  end if;
  if jsonb_typeof(v_publication.body->'price')='number' then v_price:=(v_publication.body->>'price')::numeric; end if;
  v_text:=replace(public.marketplace_favorite_message_text(v_settings.config,v_price,clock_timestamp(),v_event.id),'{article}',v_event.title);
  if char_length(v_text)>2000 then
    update public.marketplace_favorite_message_events set state='failed',error_code='invalid_template',updated_at=clock_timestamp() where id=v_event.id;
    return jsonb_build_object('ok',true,'command',null);
  end if;
  update public.marketplace_favorite_message_events set state='claimed',message_text=v_text,offer_config=nullif(v_settings.config->'offer','null'::jsonb),claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_event.id returning * into v_event;
  return jsonb_build_object('ok',true,'command',jsonb_build_object('id',v_event.id,'claimToken',v_event.claim_token,'actorId',v_event.actor_id,'itemId',v_event.item_id,'text',v_event.message_text,'offer',v_event.offer_config,'stage','message'));
end;
$$;

create or replace function public.marketplace_local_negotiation_claim(p_workspace_id uuid,p_connection_id uuid,p_token_hash text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_job public.marketplace_negotiation_jobs;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  -- Betreiber-Not-Aus: keine neuen Aufträge, solange Vinted abgeschaltet ist.
  if not public.platform_feature_enabled('vinted') then return null; end if;
  update public.marketplace_negotiation_jobs set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_negotiation_jobs set state='queued',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='claimed' and lease_expires_at<=clock_timestamp();
  update public.marketplace_negotiation_jobs job set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state in ('queued','claimed')
    and due_at is not null and not public.marketplace_negotiation_job_valid(job);
  if exists(select 1 from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('claimed','sending') and lease_expires_at>clock_timestamp()) then return null; end if;
  select * into v_job from public.marketplace_negotiation_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued' and due_at<=clock_timestamp()
    and requested_by=v_grant.approved_by and grant_generation=v_grant.grant_generation and public.marketplace_negotiation_job_valid(job) order by due_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.marketplace_negotiation_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id,'claimToken',v_job.claim_token,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_job.external_account_id,'expiresAt',v_job.lease_expires_at,'command',v_job.command,
    'sourceOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' and not exists(select 1 from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent') then v_job.source_offer end,
    'confirmedOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' then (select jsonb_build_object('command',confirmed.command,'externalId',confirmed.external_id) from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent' and confirmed.external_id ~ '^[1-9][0-9]{0,31}$' order by confirmed.finished_at desc limit 1) end);
end;
$$;

create or replace function public.marketplace_local_listing_claim(p_workspace_id uuid,p_connection_id uuid,p_token_hash text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_grant public.marketplace_local_extension_grants; v_job public.marketplace_listing_jobs;
begin
  v_grant:=public.marketplace_local_listing_authorized(p_workspace_id,p_connection_id,p_token_hash);
  -- Betreiber-Not-Aus: keine neuen Aufträge, solange Vinted abgeschaltet ist.
  if not public.platform_feature_enabled('vinted') then return null; end if;
  perform public.marketplace_expire_local_listing_attempts(p_workspace_id,p_connection_id);
  update public.marketplace_listing_jobs job set state='cancelled',error_code='authorization_revoked'
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state in ('queued','paused','claimed') and not public.marketplace_listing_job_valid(job);
  update public.marketplace_listing_jobs job set state='paused',error_code='schedule_late'
    where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued' and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='paused';
  if exists(select 1 from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('claimed','writing') and lease_expires_at>clock_timestamp()) then return null; end if;
  select * into v_job from public.marketplace_listing_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued'
    and requested_by=v_grant.approved_by and public.marketplace_listing_job_valid(job) and public.marketplace_listing_job_timing(job.scheduled_at,job.late_policy,clock_timestamp())='due'
    order by scheduled_at nulls first,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.marketplace_listing_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),
    absolute_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '10 minutes'),claim_local_token_hash=p_token_hash,claim_local_grant_generation=v_grant.grant_generation where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id::text,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'externalAccountId',v_job.external_account_id,
    'action',v_job.action,'snapshot',v_job.snapshot,'expiresAt',v_job.lease_expires_at,'absoluteExpiresAt',v_job.absolute_expires_at);
end;
$$;

create or replace function public.kleinanzeigen_claim_sync(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_run_id bigint)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_session jsonb; v_run public.kleinanzeigen_sync_runs; v_token text;
begin
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 -- Betreiber-Not-Aus: kein neuer Abgleich, solange Kleinanzeigen abgeschaltet ist.
 if not public.platform_feature_enabled('kleinanzeigen') then raise exception 'Kleinanzeigen ist vorübergehend geschlossen.' using errcode='55000'; end if;
 select * into v_run from public.kleinanzeigen_sync_runs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_run_id for update;
 if not found or v_run.state<>'queued' or v_run.lease_until<=clock_timestamp() or v_run.grant_generation<>p_generation
  or not public.marketplace_sync_authorization_valid(p_workspace_id,v_run.requested_by)
  or not public.marketplace_local_extension_user_valid(v_run.requested_by) then raise exception 'Abgleich nicht übernehmbar.' using errcode='55000'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 update public.kleinanzeigen_sync_runs set state='reading',claim_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),lease_until=least((v_session->>'expiresAt')::timestamptz,clock_timestamp()+interval '2 minutes') where id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'claimToken',v_token,'generation',p_generation,'externalAccountId',v_session->>'externalAccountId','nextCursor','page:1');
end;
$$;

create or replace function public.kleinanzeigen_claim_listing(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_job_id bigint,p_claim_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;v_session jsonb;v_snapshot jsonb;v_capacity jsonb;v_claim_hash text;
begin
 if p_claim_token is null or p_claim_token !~ '^[a-f0-9]{64}$' then raise exception 'Ungültige Versuchkennung.' using errcode='22023';end if;
 v_claim_hash:=encode(extensions.digest(p_claim_token,'sha256'),'hex');
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 perform public.kleinanzeigen_expire_listing_jobs(p_workspace_id,p_connection_id);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id for update;
 if not found then raise exception 'Auftrag nicht verfügbar.' using errcode='42501';end if;
 -- Nach begin gibt es ausschließlich denselben alten Versuch zurück. Keine neue Schreibberechtigung.
 if v_job.started_at is not null and v_job.state in ('writing','outcome_unknown') then
  if v_job.claim_token_hash is distinct from v_claim_hash or v_job.claim_installation_hash is distinct from p_token_hash or v_job.grant_generation is distinct from p_generation then raise exception 'Veröffentlichung muss zuerst abgeglichen werden.' using errcode='40001';end if;
  return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',p_claim_token,'leaseUntil',v_job.lease_until,'absoluteExpiresAt',v_job.absolute_expires_at);
 end if;
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 if v_session->>'canPublish' is distinct from 'true' or v_session->>'externalAccountId' is distinct from v_job.external_account_id or v_job.grant_generation is distinct from p_generation or not exists(select 1 from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash and approved_by=v_job.requested_by) then raise exception 'Schreibfreigabe nicht bestätigt.' using errcode='42501';end if;
 if v_job.state='claimed' and v_job.claim_token_hash=v_claim_hash and v_job.claim_installation_hash=p_token_hash then return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',p_claim_token,'leaseUntil',v_job.lease_until,'absoluteExpiresAt',v_job.absolute_expires_at);end if;
 -- Betreiber-Not-Aus: laufende Versuche oben dürfen enden, neue Aufträge nicht.
 if not public.platform_feature_enabled('kleinanzeigen') then raise exception 'Kleinanzeigen ist vorübergehend geschlossen.' using errcode='55000';end if;
 if v_job.state<>'queued' or exists(select 1 from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id<>p_job_id and state in ('claimed','writing','outcome_unknown')) then raise exception 'Ein anderer Versuch ist noch offen.' using errcode='40001';end if;
 v_snapshot:=public.kleinanzeigen_prepare_listing_job(p_workspace_id,p_connection_id,v_job.draft_id,v_job.draft_revision,v_job.requested_by);
 if (v_snapshot-'images') is distinct from (v_job.immutable_snapshot-'images') then raise exception 'Zielfassung inzwischen geändert.' using errcode='40001';end if;
 v_capacity:=public.kleinanzeigen_quota_capacity(p_workspace_id,p_connection_id,p_job_id);
 if v_capacity->>'allowed' is distinct from 'true' then
  update public.kleinanzeigen_publication_jobs set state='needs_user_action',error_code=v_capacity->>'reason',completed_at=clock_timestamp() where id=p_job_id returning * into v_job;return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',null,'leaseUntil',null,'absoluteExpiresAt',null);
 end if;
 update public.kleinanzeigen_publication_jobs set state='claimed',claim_token_hash=v_claim_hash,claim_installation_hash=p_token_hash,lease_until=least((v_session->>'expiresAt')::timestamptz,clock_timestamp()+interval '120 seconds'),absolute_expires_at=least((v_session->>'expiresAt')::timestamptz,clock_timestamp()+interval '15 minutes') where id=p_job_id returning * into v_job;
 return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',p_claim_token,'leaseUntil',v_job.lease_until,'absoluteExpiresAt',v_job.absolute_expires_at);
end;
$$;
