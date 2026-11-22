-- Zweck: Ungeklärte Vinted-Kontoaktionen klären sich selbst und sperren nur noch Folgeaufträge,
-- die sich nicht selbst gegen den aktuellen Anbieterstand absichern.
-- - Lesend nachprüfbare Aktionen erhalten nach outcome_unknown automatisch bis zu drei
--   Nachprüfungen im Abstand von 1, 5 und 15 Minuten (neue Spalte not_before).
-- - Preis-, Inhalts-, Lösch- und Profilaktionen prüfen vor dem Schreiben den aktuellen Stand und
--   warten daher nicht mehr auf ein früheres ungeklärtes Ergebnis einer solchen Aktion.
--   Relists, Nachrichten, Angebote und Versandscheine warten weiterhin.
-- - Der Kontoabruf bestätigt eine ungeklärte Preisänderung, wenn er den Zielpreis mit einem
--   Vinted-Änderungszeitpunkt nach dem Schreibbeginn beobachtet.
-- - Wartende Veröffentlichungen nennen die blockierende Kontoaktion.
-- Betroffen: marketplace_account_actions (Spalte not_before, automatische outcome_reconcile-Zeilen),
-- Funktionen marketplace_account_action_public, _enqueue, _finish, marketplace_account_actions_recover,
-- marketplace_browser_job_ready, _next_work, _job_eligible, marketplace_accept_relisting_import,
-- marketplace_listing_job_document; neu marketplace_account_action_self_guarded,
-- marketplace_browser_write_waits_for, marketplace_account_action_auto_reconcile,
-- marketplace_accept_imported_listing_price, marketplace_listing_job_blocker.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

alter table public.marketplace_account_actions add column not_before timestamptz;

-- Ungeklärte frühere Kontoaktion auf demselben Vinted-Inserat, die eine wartende Veröffentlichung zurückhält.
-- PL/pgSQL, weil Kontoaktionen und Warteschlangenreihenfolge erst in 570_marketplace_account_actions.sql entstehen.
create or replace function public.marketplace_listing_job_blocker(p_job public.marketplace_listing_jobs)
returns uuid language plpgsql stable security invoker set search_path='' as $$
declare v_blocker uuid; v_external_id text:=coalesce(p_job.snapshot->>'relistExternalId',p_job.external_id);
begin
  if p_job.state<>'queued' or p_job.execution_mode<>'cloud' or v_external_id is null then return null; end if;
  select action.public_id into v_blocker from public.marketplace_account_actions action
    where action.workspace_id=p_job.workspace_id and action.connection_id=p_job.connection_id and action.is_write
      and action.resource_key='listing:'||v_external_id and action.state='outcome_unknown' and action.queue_order<p_job.queue_order
    order by action.queue_order limit 1;
  return v_blocker;
end;
$$;
revoke all on function public.marketplace_listing_job_blocker(public.marketplace_listing_jobs) from public,anon,authenticated;

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
    'coverStoragePath',p_job.snapshot->'images'->0->>'storagePath')
    || (select jsonb_build_object('waitReason',case when blocker.id is not null then 'dependency_unresolved' end,'blockedByActionId',blocker.id)
      from (select public.marketplace_listing_job_blocker(p_job) as id) blocker);
$$;
revoke all on function public.marketplace_listing_job_document(public.marketplace_listing_jobs) from public,anon,authenticated;

-- Eine ungeklärte Preisänderung gilt als bestätigt, sobald der eigene Kontoabruf nach dem Speicherklick
-- genau den Zielpreis auf demselben Konto beobachtet. Ein alter Preis beweist dagegen nichts, weil
-- Vinteds Inseratliste verzögert sein kann; diesen Fall klärt nur die Nachprüfung im Bearbeitungsformular.
-- Bestätigt eine ungeklärte Preisänderung, wenn der Kontoabruf genau den Zielpreis zeigt und
-- Vinted das Inserat nach dem Schreibbeginn geändert hat. Ohne diesen Zeitstempel könnte ein
-- verzögerter Listenstand mit einem früheren, zufällig gleichen Preis die Änderung vortäuschen.
-- Ein alter Preis entscheidet hier nichts; das bleibt der lesenden Nachprüfung überlassen.
create or replace function public.marketplace_accept_imported_listing_price(p_workspace_id uuid,p_connection_id uuid,p_external_id text,p_observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v_entry public.marketplace_account_entries; v_price_cents numeric; v_source_updated_at timestamptz;
begin
  select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id
    and kind='publication' and external_id=p_external_id and observed_at=p_observed_at;
  if not found or p_observed_at>clock_timestamp()+interval '5 minutes'
    or jsonb_typeof(v_entry.body->'price') not in ('number','string') or v_entry.body->>'price' !~ '^[0-9]{1,7}([.][0-9]{1,2})?$'
    or jsonb_typeof(v_entry.body->'listingSourceUpdatedAt') is distinct from 'string'
    or v_entry.body->>'listingSourceUpdatedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then return; end if;
  v_price_cents:=round((v_entry.body->>'price')::numeric*100);
  v_source_updated_at:=(v_entry.body->>'listingSourceUpdatedAt')::timestamptz;
  with resolved as (
    update public.marketplace_account_actions action set state='succeeded',error_code=null,
        result=jsonb_build_object('status','confirmed','resolvedBy','account_import'),finished_at=clock_timestamp()
      from public.marketplace_connections account
      where account.workspace_id=action.workspace_id and account.id=action.connection_id and account.external_account_id=action.external_account_id
        and action.workspace_id=p_workspace_id and action.connection_id=p_connection_id and action.is_write and action.kind='price_save' and action.state='outcome_unknown'
        and action.history_purged_at is null and action.resource_key='listing:'||p_external_id and action.write_started_at<p_observed_at
        -- Kleine Uhrabweichung zwischen Vinted und Datenbank zulassen; ältere Stände zählen nicht.
        and v_source_updated_at>=action.write_started_at-interval '30 seconds'
        and jsonb_typeof(action.payload->'priceCents')='number' and (action.payload->>'priceCents')::numeric=v_price_cents
      returning action.public_id
  )
  -- Geplante Nachprüfungen sind nach der Bestätigung überflüssig.
  update public.marketplace_account_actions pending set state='cancelled',error_code='superseded',finished_at=clock_timestamp(),updated_at=clock_timestamp()
    from resolved where pending.reconciliation_action_id=resolved.public_id and pending.state='queued';
end;
$$;
revoke all on function public.marketplace_accept_imported_listing_price(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.marketplace_accept_imported_listing_price(uuid,uuid,text,timestamptz) to service_role;

-- Erst eine akzeptierte echte Anbieterlesekopie beendet den Schutz der neuen Kennung.
-- Bestätigt sowohl Relistings als auch normale Neuveröffentlichungen mit Erstellungsbeleg,
-- sobald der Kontoabgleich das Inserat aktiv auf demselben Konto beobachtet.
create or replace function public.marketplace_accept_relisting_import(p_workspace_id uuid,p_connection_id uuid,p_external_id text,p_observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v_job public.marketplace_listing_jobs; v_entry public.marketplace_account_entries; v_entry_id uuid;
begin
  perform public.marketplace_accept_imported_listing_price(p_workspace_id,p_connection_id,p_external_id,p_observed_at);
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

-- Ungeklärte, rein lesend nachprüfbare Änderungen erhalten sofort eine automatische Nachprüfung.
-- Sonst sperrt das unklare Ergebnis alle späteren Schreibaufträge auf dasselbe Inserat, bis jemand
-- von Hand nachprüft. Höchstens zwei Prüfungen je Ergebnis; danach bleibt der manuelle Weg.
-- Lesend nachprüfbare Schreibaktionen: Sie vergleichen vor dem Schreiben den aktuellen Anbieterstand
-- oder setzen nur Zielwerte und lassen sich daher gefahrlos nachprüfen und wiederholen.
create or replace function public.marketplace_account_action_self_guarded(p_kind text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_kind in ('price_save','listing_edit_save','listing_content_save','listing_delete','profile_edit_save','profile_details_save');
$$;

-- Ein Schreibauftrag wartet auf frühere Aufträge derselben Ressource. Ein früheres ungeklärtes
-- Ergebnis hält ihn nur zurück, wenn nicht beide Seiten selbst abgesicherte Kontoaktionen sind:
-- Diese prüfen vor dem Klick den aktuellen Anbieterstand und schreiben bei Abweichung nichts.
create or replace function public.marketplace_browser_write_waits_for(p_kind text,p_job_id text,p_previous_kind text,p_previous_job_id text,p_previous_state text)
returns boolean language sql stable security invoker set search_path='' as $$
  select p_previous_state in ('queued','paused','running')
    or (p_previous_state='outcome_unknown' and not (p_kind='account_action' and p_previous_kind='account_action'
      and exists(select 1 from public.marketplace_account_actions follow where follow.public_id=p_job_id::uuid and public.marketplace_account_action_self_guarded(follow.kind))
      and exists(select 1 from public.marketplace_account_actions previous where previous.public_id=p_previous_job_id::uuid and public.marketplace_account_action_self_guarded(previous.kind))));
$$;

revoke all on function public.marketplace_account_action_self_guarded(text) from public,anon,authenticated;
grant execute on function public.marketplace_account_action_self_guarded(text) to service_role;
revoke all on function public.marketplace_browser_write_waits_for(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_browser_write_waits_for(text,text,text,text,text) to service_role;

create or replace function public.marketplace_account_action_public(p_action public.marketplace_account_actions)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_wait text; v_blocker uuid;
begin
  if p_action.state='queued' then
    if p_action.is_write and p_action.resource_key is not null then
      select public_id into v_blocker from public.marketplace_account_actions where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id
        and is_write and resource_key=p_action.resource_key and state='outcome_unknown' and queue_order<p_action.queue_order
        and not (public.marketplace_account_action_self_guarded(kind) and public.marketplace_account_action_self_guarded(p_action.kind)) order by queue_order limit 1;
    end if;
    v_wait:=case when v_blocker is not null or (p_action.is_write and p_action.resource_key is not null and exists(
        select 1 from public.marketplace_browser_queue_entries() previous where previous.workspace_id=p_action.workspace_id and previous.connection_id=p_action.connection_id
          and previous.is_write and previous.resource_key=p_action.resource_key and previous.queue_order<p_action.queue_order and previous.state='outcome_unknown'
          and public.marketplace_browser_write_waits_for('account_action',p_action.public_id::text,previous.kind,previous.job_id,previous.state))) then 'dependency_unresolved'
      when p_action.kind not in ('cloud_setup_open','cloud_session_open') and (not public.marketplace_cloud_write_available(p_action.workspace_id,p_action.connection_id)
        or exists(select 1 from public.marketplace_connections where workspace_id=p_action.workspace_id and id=p_action.connection_id and status in ('needs_login','paused'))) then 'account_paused'
      else public.marketplace_browser_slot_status(p_action.workspace_id,p_action.connection_id) end;
  end if;
  return jsonb_build_object('id',p_action.public_id,'workspaceId',p_action.workspace_id,'connectionId',p_action.connection_id,'requestId',p_action.request_id,
    'kind',p_action.kind,'state',p_action.state,'version',p_action.version,'waitReason',v_wait,'errorCode',p_action.error_code,'result',p_action.result,'entryId',p_action.entry_id,'title',p_action.title,
    'imageUrl',(select coalesce(entry.body->>'imageUrl',entry.body->>'itemImageUrl') from public.marketplace_account_entries entry
      where entry.id=p_action.entry_id and entry.workspace_id=p_action.workspace_id and entry.connection_id=p_action.connection_id),
    'createdAt',p_action.created_at,'startedAt',p_action.started_at,'finishedAt',p_action.finished_at,'updatedAt',p_action.updated_at,
    'historyPurged',p_action.history_purged_at is not null,'resultExpired',p_action.history_purged_at is not null,'blockedByActionId',v_blocker,
    'reconciling',p_action.state='outcome_unknown' and exists(select 1 from public.marketplace_account_actions check_action
      where check_action.reconciliation_action_id=p_action.public_id and check_action.state in ('queued','running')));
end;
$$;

-- Plant die nächste lesende Nachprüfung mit wachsendem Abstand (1, 5, 15 Minuten), damit ein
-- träge speicherndes Vinted nicht sofort als "nicht gespeichert" gilt. Nach drei Versuchen
-- bleibt die manuelle Nachprüfung.
create or replace function public.marketplace_account_action_auto_reconcile(p_action public.marketplace_account_actions)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare v_payload jsonb:=jsonb_build_object('actionId',p_action.public_id); v_attempts integer;
begin
  if p_action.state<>'outcome_unknown' or p_action.history_purged_at is not null
    or not (public.marketplace_account_action_self_guarded(p_action.kind) or p_action.kind='listing_edit_intent')
    or exists(select 1 from public.marketplace_account_actions where reconciliation_action_id=p_action.public_id and state in ('queued','running')) then return; end if;
  select count(*) into v_attempts from public.marketplace_account_actions where reconciliation_action_id=p_action.public_id;
  if v_attempts>=3 then return; end if;
  insert into public.marketplace_account_actions(workspace_id,connection_id,requested_by,request_id,request_hash,kind,payload,external_account_id,provider_profile_id,title,is_write,reconciliation_action_id,not_before)
    values(p_action.workspace_id,p_action.connection_id,p_action.requested_by,gen_random_uuid(),
      encode(pg_catalog.sha256(convert_to(jsonb_build_array('outcome_reconcile',v_payload)::text,'utf8')),'hex'),
      'outcome_reconcile',v_payload,p_action.external_account_id,p_action.provider_profile_id,p_action.title,false,p_action.public_id,
      clock_timestamp()+case v_attempts when 0 then interval '1 minute' when 1 then interval '5 minutes' else interval '15 minutes' end);
end;
$$;
revoke all on function public.marketplace_account_action_auto_reconcile(public.marketplace_account_actions) from public,anon,authenticated;

grant execute on function public.marketplace_account_action_auto_reconcile(public.marketplace_account_actions) to service_role;

create or replace function public.marketplace_account_action_enqueue(p_workspace_id uuid,p_connection_id uuid,p_request_id uuid,p_kind text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_action public.marketplace_account_actions; v_connection public.marketplace_connections; v_entry public.marketplace_account_entries;
  v_setup public.marketplace_cloud_setups; v_parent public.marketplace_account_actions; v_profile text; v_hash text; v_entry_kind text; v_entry_id uuid; v_write boolean; v_resource text; v_allowed text[];
begin
  if not public.marketplace_can_manage_cloud(p_workspace_id) or not public.workspace_access_is_valid(p_workspace_id)
    or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_request_id is null or p_kind is null or p_kind not in ('profile_details_read','profile_details_save','profile_cities_read','profile_edit_read','profile_edit_save','listing_category_read','listing_content_read','listing_content_save','listing_edit_read','listing_edit_save','listing_edit_intent','listing_delete','price_save','conversations_read','shipping_label_request','outcome_reconcile','cloud_setup_open','cloud_session_open')
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1048576
    or p_payload ?| array['workspaceId','connectionId','requestId','userId','userAccessToken','accessToken','authorization','cookie','cookies'] then raise exception 'Ungültiger Cloudauftrag' using errcode='22023'; end if;
  v_allowed:=case p_kind
    when 'price_save' then array['entryId','expectedPriceCents','priceCents']
    when 'listing_delete' then array['entryId']
    when 'listing_edit_read' then array['entryId']
    when 'listing_content_read' then array['entryId','saleItemId']
    when 'listing_edit_save' then array['entryId','fields']
    when 'listing_edit_intent' then array['entryId','intent']
    when 'listing_content_save' then array['entryId','base','content','photos']
    when 'listing_category_read' then array['categoryId','categoryLabel']
    when 'conversations_read' then array['conversationId']
    when 'shipping_label_request' then array['saleId']
    when 'profile_details_save' then array['changes','expected']
    when 'profile_edit_save' then array['about','expectedAbout']
    when 'profile_cities_read' then array['query']
    when 'outcome_reconcile' then array['actionId']
    when 'cloud_setup_open' then array['setupId','dialogId']
    when 'cloud_session_open' then array['dialogId']
    else array[]::text[] end;
  if exists(select 1 from jsonb_object_keys(p_payload) field where not field=any(v_allowed)) then raise exception 'Ungültige Auftragsfelder' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_array(p_kind,p_payload)::text,'utf8'),'sha256'),'hex');
  select * into v_action from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id;
  if found then
    if v_action.requested_by<>(select auth.uid()) or v_action.kind<>p_kind or v_action.request_hash<>v_hash then raise exception 'Anfragekennung bereits mit anderem Inhalt verwendet' using errcode='23505'; end if;
    return jsonb_build_object('action',public.marketplace_account_action_public(v_action));
  end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if (select count(*) from public.marketplace_account_actions where workspace_id=p_workspace_id and connection_id=p_connection_id and state='queued')>=50 then
    raise exception 'Für dieses Konto warten bereits 50 Aktionen. Warte, bis eine ausgeführt oder abgebrochen wurde.' using errcode='P0001',detail='account_action_queue_full';
  end if;
  v_write:=p_kind in ('profile_details_save','profile_edit_save','listing_content_save','listing_edit_save','listing_edit_intent','listing_delete','price_save','shipping_label_request');
  if p_kind='cloud_setup_open' then
    if (select count(*) from jsonb_object_keys(p_payload))<>2 or not (p_payload ?& array['setupId','dialogId']) then raise exception 'Ungültiger Einrichtungsauftrag' using errcode='22023'; end if;
    select * into v_setup from public.marketplace_cloud_setups where public_id=(p_payload->>'setupId')::uuid and workspace_id=p_workspace_id and connection_id=p_connection_id and requested_by=(select auth.uid());
    if not found or v_setup.state not in ('login','verified') or v_setup.browser_dialog_id is distinct from (p_payload->>'dialogId')::uuid or v_setup.browser_presence_expires_at is null or v_setup.browser_presence_expires_at<=clock_timestamp() then raise exception 'Einrichtungsdialog ist nicht verbunden' using errcode='22023'; end if;
    v_profile:=v_setup.provider_profile_id;
  elsif p_kind='cloud_session_open' then
    if v_connection.execution_mode<>'cloud' or v_connection.status in ('paused','blocked') or v_connection.browser_dialog_id is distinct from (p_payload->>'dialogId')::uuid
      or v_connection.browser_dialog_user_id is distinct from (select auth.uid()) or v_connection.browser_presence_expires_at is null or v_connection.browser_presence_expires_at<=clock_timestamp() then
      raise exception 'Anmeldedialog ist nicht verbunden' using errcode='22023'; end if;
    select provider_profile_id into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id;
  else
    if v_connection.execution_mode<>'cloud' or v_connection.status<>'connected' or v_connection.external_account_id is null then raise exception 'Konto ist nicht verbunden' using errcode='22023'; end if;
    select provider_profile_id into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id;
    if p_kind like 'listing_%' and p_kind<>'listing_category_read' or p_kind='price_save' then
      v_entry_kind:=case when p_kind='listing_content_read' and p_payload ? 'saleItemId' then 'sale' else 'publication' end; v_entry_id:=(p_payload->>'entryId')::uuid;
    elsif p_kind='conversations_read' then v_entry_kind:='conversation'; v_entry_id:=(p_payload->>'conversationId')::uuid;
    elsif p_kind='shipping_label_request' then v_entry_kind:='sale'; v_entry_id:=(p_payload->>'saleId')::uuid;
    elsif p_kind like 'profile_%' or p_kind='listing_category_read' then v_entry_kind:='profile';
    elsif p_kind='outcome_reconcile' then
      select * into v_parent from public.marketplace_account_actions where public_id=(p_payload->>'actionId')::uuid and workspace_id=p_workspace_id and connection_id=p_connection_id;
      if not found or v_parent.state<>'outcome_unknown' or v_parent.external_account_id is distinct from v_connection.external_account_id then raise exception 'Kein passendes ungeklärtes Ergebnis' using errcode='22023'; end if;
      -- Eine manuell angeforderte Prüfung läuft sofort; die noch geplante automatische entfällt.
      update public.marketplace_account_actions set state='cancelled',error_code='superseded',finished_at=clock_timestamp(),updated_at=clock_timestamp()
        where reconciliation_action_id=v_parent.public_id and state='queued' and not_before>clock_timestamp();
    end if;
    if v_entry_kind is not null then
      select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind=v_entry_kind
        and ((v_entry_id is not null and id=v_entry_id) or (v_entry_id is null and v_entry_kind='profile' and external_id=v_connection.external_account_id));
      if not found or v_entry.external_id !~ '^[1-9][0-9]{0,31}$' then raise exception 'Kontoeintrag ist nicht verfügbar' using errcode='22023'; end if;
    end if;
    if p_kind='listing_content_read' and p_payload ? 'saleItemId' and (
      jsonb_typeof(p_payload->'saleItemId') is distinct from 'string' or p_payload->>'saleItemId' !~ '^[1-9][0-9]{0,31}$'
      or not coalesce(v_entry.body->'itemIds' ? (p_payload->>'saleItemId'),false)
      or v_entry.body->>'saleState'='relisted'
      or (v_entry.body ? 'sellerId' and v_entry.body->>'sellerId' is distinct from v_connection.external_account_id)
    ) then raise exception 'Artikel gehört nicht zum Verkauf' using errcode='22023'; end if;
    if p_kind='price_save' and (jsonb_typeof(p_payload->'priceCents') is distinct from 'number' or (p_payload->>'priceCents')::numeric not between 1 and 100000000 or (p_payload->>'priceCents')::numeric<>trunc((p_payload->>'priceCents')::numeric)
      or jsonb_typeof(p_payload->'expectedPriceCents') is distinct from 'number') then raise exception 'Ungültiger Preisauftrag' using errcode='22023'; end if;
    if p_kind='listing_category_read' and (jsonb_typeof(p_payload->'categoryId') is distinct from 'number' or (p_payload->>'categoryId')::numeric not between 1 and 2147483647) then raise exception 'Ungültige Kategorie' using errcode='22023'; end if;
    if p_kind='profile_cities_read' and (jsonb_typeof(p_payload->'query') is distinct from 'string' or char_length(btrim(p_payload->>'query')) not between 2 and 80) then raise exception 'Ungültige Stadtsuche' using errcode='22023'; end if;
    if p_kind='profile_edit_save' and (jsonb_typeof(p_payload->'about') is distinct from 'string' or char_length(p_payload->>'about')>2000) then raise exception 'Ungültiger Profiltext' using errcode='22023'; end if;
    if p_kind='profile_details_save' and (jsonb_typeof(p_payload->'changes') is distinct from 'object' or jsonb_typeof(p_payload->'expected') is distinct from 'object') then raise exception 'Ungültige Profiländerung' using errcode='22023'; end if;
    if p_kind='listing_edit_save' and jsonb_typeof(p_payload->'fields') is distinct from 'object' then raise exception 'Ungültige Inseratänderung' using errcode='22023'; end if;
    if p_kind='listing_edit_intent' and jsonb_typeof(p_payload->'intent') is distinct from 'object' then raise exception 'Ungültige Inseratänderung' using errcode='22023'; end if;
    if p_kind='listing_content_save' and (not public.marketplace_listing_content_valid(p_payload->'base') or not public.marketplace_listing_content_valid(p_payload->'content')) then raise exception 'Ungültige Inseratangaben' using errcode='22023'; end if;
    if v_write then v_resource:=case v_entry_kind when 'publication' then 'listing:'||v_entry.external_id when 'sale' then 'shipping_label:'||v_entry.external_id else 'profile:'||v_connection.external_account_id end; end if;
  end if;
  if v_profile is null then raise exception 'Browserprofil fehlt' using errcode='22023'; end if;
  insert into public.marketplace_account_actions(workspace_id,connection_id,requested_by,request_id,request_hash,kind,payload,external_account_id,provider_profile_id,entry_id,entry_kind,external_id,resource_key,title,is_write,reconciliation_action_id)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_request_id,v_hash,p_kind,p_payload,v_connection.external_account_id,v_profile,v_entry.id,v_entry_kind,v_entry.external_id,v_resource,left(v_entry.body->>'title',500),v_write,v_parent.public_id) returning * into v_action;
  return jsonb_build_object('action',public.marketplace_account_action_public(v_action));
end;
$$;

create or replace function public.marketplace_account_action_finish(p_action_id uuid,p_claim_token uuid,p_worker_id uuid,p_worker_epoch bigint,p_runner_id uuid,p_state text,p_result jsonb default null,p_error_code text default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_action public.marketplace_account_actions; v_parent public.marketplace_account_actions; v_verified timestamptz; v_reason text;
begin
  if p_state is null or p_state not in ('succeeded','failed','outcome_unknown') or (p_result is not null and octet_length(p_result::text)>4194304)
    or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiger Auftragsabschluss' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(91731,1);
  select * into v_action from public.marketplace_account_actions where public_id=p_action_id and claim_token=p_claim_token and worker_id=p_worker_id and worker_epoch=p_worker_epoch and runner_id=p_runner_id for update;
  if not found then return false; end if;
  if v_action.state in ('succeeded','failed','cancelled') then return v_action.state=p_state and v_action.result is not distinct from p_result and v_action.error_code is not distinct from p_error_code; end if;
  if v_action.state not in ('running','outcome_unknown') then return false; end if;
  -- Ein später belegter Abschluss desselben Versuchs ist zulässig, ein fremder neuer Besitzer nicht.
  if not exists(select 1 from public.marketplace_browser_sessions where public_id=v_action.browser_session_id and workspace_id=v_action.workspace_id
    and connection_id=v_action.connection_id and worker_id=p_worker_id and worker_epoch=p_worker_epoch and started_by=v_action.requested_by) then return false; end if;
  if v_action.is_write and p_state='succeeded' and v_action.write_started_at is null and not coalesce((
    coalesce(p_result->'noWriteNeeded'='true'::jsonb,false) and (
      p_result->>'status'='confirmed' or (v_action.kind='shipping_label_request' and p_result->>'outcome'='ready' and p_result->'requested'='false'::jsonb))
  ),false) then raise exception 'Schreibbeginn fehlt' using errcode='42501'; end if;
  if p_state='outcome_unknown' and (not v_action.is_write or v_action.write_started_at is null) then raise exception 'Keine ungeklärte Anbieterwirkung' using errcode='22023'; end if;
  if p_state='succeeded' and v_action.kind='outcome_reconcile' and p_result->>'resolution' in ('succeeded','failed') then
    -- Der Kontoabruf kann das Ergebnis inzwischen selbst geklärt haben; dann bleibt es unverändert.
    select * into v_parent from public.marketplace_account_actions where public_id=v_action.reconciliation_action_id and workspace_id=v_action.workspace_id
      and connection_id=v_action.connection_id and external_account_id=v_action.external_account_id and state in ('outcome_unknown','succeeded','failed') for update;
    begin v_verified:=(p_result->>'verifiedAt')::timestamptz; exception when others then raise exception 'Ungültiger Prüfnachweis' using errcode='22023'; end;
    if not found or p_result->>'reconciledActionId' is distinct from v_parent.public_id::text or v_verified is null or not isfinite(v_verified)
      or v_verified<v_action.started_at or v_verified>clock_timestamp()+interval '1 minute' then raise exception 'Ungültiger Prüfnachweis' using errcode='22023'; end if;
    if jsonb_typeof(p_result->'providerResult') is distinct from 'object' or p_result->'providerResult'='{}'::jsonb
      or (p_result->>'resolution'='succeeded' and not coalesce(case when v_parent.kind='shipping_label_request'
        then p_result->'providerResult'->>'outcome'='ready' and p_result->'providerResult'->'requested'='false'::jsonb
        else p_result->'providerResult'->>'status'='confirmed' end,false)) then
      raise exception 'Fachlicher Prüfnachweis fehlt' using errcode='22023';
    end if;
    -- Der ursprüngliche Aufruf erhält sein typgerechtes Ergebnis; Prüfmetadaten bleiben im verknüpften Prüfauftrag.
    if v_parent.state='outcome_unknown' then
      update public.marketplace_account_actions set state=p_result->>'resolution',error_code=null,result=p_result->'providerResult',finished_at=clock_timestamp() where id=v_parent.id;
    end if;
  end if;
  update public.marketplace_account_actions set state=p_state,result=p_result,error_code=p_error_code,finished_at=clock_timestamp(),lease_expires_at=null where id=v_action.id
    returning * into v_action;
  if p_state='outcome_unknown' then perform public.marketplace_account_action_auto_reconcile(v_action); end if;
  if v_action.kind='outcome_reconcile' then
    select * into v_parent from public.marketplace_account_actions where public_id=v_action.reconciliation_action_id and workspace_id=v_action.workspace_id and connection_id=v_action.connection_id;
    if found then perform public.marketplace_account_action_auto_reconcile(v_parent); end if;
  end if;
  v_reason:=case p_error_code when 'login_required' then 'needs_login' when 'identity_changed' then 'needs_login' when 'challenge_required' then 'challenge' when 'rate_limited' then 'rate_limited' end;
  if v_reason is not null and v_action.kind<>'cloud_setup_open' and exists(select 1 from public.marketplace_connections connection
    join public.marketplace_browser_profiles profile on profile.workspace_id=connection.workspace_id and profile.connection_id=connection.id
    where connection.workspace_id=v_action.workspace_id and connection.id=v_action.connection_id and connection.external_account_id=v_action.external_account_id and profile.provider_profile_id=v_action.provider_profile_id) then
    insert into public.marketplace_sync_schedules(workspace_id,connection_id,enabled,activated_by,paused_reason,retry_after,consecutive_failures)
      values(v_action.workspace_id,v_action.connection_id,false,v_action.requested_by,v_reason,case when v_reason='rate_limited' then clock_timestamp()+interval '15 minutes' end,1)
      on conflict(workspace_id,connection_id) do update set enabled=case when v_reason='rate_limited' then public.marketplace_sync_schedules.enabled else false end,
        authorization_version=public.marketplace_sync_schedules.authorization_version+1,paused_reason=v_reason,
        retry_after=case when v_reason='rate_limited' then clock_timestamp()+interval '15 minutes' end,next_due_at=null,
        consecutive_failures=public.marketplace_sync_schedules.consecutive_failures+1,updated_at=clock_timestamp()
      where public.marketplace_sync_schedules.updated_at<=v_action.started_at;
  end if;
  if v_action.kind in ('cloud_setup_open','cloud_session_open') and p_state='succeeded' then
    update public.marketplace_browser_sessions set account_action_id=null,expires_at=absolute_expires_at where public_id=v_action.browser_session_id
      and (v_action.kind='cloud_session_open' or cloud_setup_id=(v_action.payload->>'setupId')::uuid);
  end if;
  return true;
end;
$$;

create or replace function public.marketplace_account_actions_recover(p_worker_id uuid,p_worker_epoch bigint)
returns integer language plpgsql volatile security invoker set search_path='' as $$
declare v_count integer:=0; v_action public.marketplace_account_actions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return 0; end if;
  for v_action in select action.* from public.marketplace_account_actions action where state='running' and
    (worker_id<>p_worker_id or worker_epoch<>p_worker_epoch or lease_expires_at<=clock_timestamp()
      or exists(select 1 from public.marketplace_browser_sessions where public_id=action.browser_session_id and state='closed')) for update loop
    if v_action.write_started_at is not null then
      update public.marketplace_account_actions set state='outcome_unknown',error_code='interrupted',lease_expires_at=null,finished_at=clock_timestamp() where id=v_action.id
        returning * into v_action;
      perform public.marketplace_account_action_auto_reconcile(v_action);
    elsif exists(select 1 from public.marketplace_browser_sessions where public_id=v_action.browser_session_id and state='closed') then
      update public.marketplace_account_actions set state=case when v_action.attempts<3 and public.marketplace_account_action_authorized(v_action) then 'queued' else 'failed' end,
        error_code=case when v_action.attempts<3 and public.marketplace_account_action_authorized(v_action) then null else 'interrupted' end,
        claim_token=null,worker_id=null,worker_epoch=null,runner_id=null,browser_session_id=null,lease_expires_at=null,absolute_expires_at=null,started_at=null,
        finished_at=case when v_action.attempts<3 and public.marketplace_account_action_authorized(v_action) then null else clock_timestamp() end where id=v_action.id;
    end if;
    v_count:=v_count+1;
  end loop;
  update public.marketplace_account_actions action set state='cancelled',error_code=case when kind in ('cloud_setup_open','cloud_session_open') then 'dialog_closed' else 'authorization_revoked' end,finished_at=clock_timestamp()
    where state='queued' and not public.marketplace_account_action_authorized(action);
  return v_count;
end;
$$;

create or replace function public.marketplace_browser_job_ready(p_kind text,p_job_id text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
begin
  case p_kind
  when 'account_action' then return exists(select 1 from public.marketplace_account_actions a where public_id=p_job_id::uuid and state='queued'
    and (a.not_before is null or a.not_before<=clock_timestamp()) and public.marketplace_account_action_authorized(a) and (kind in ('cloud_setup_open','cloud_session_open') or exists(select 1 from public.marketplace_connections c where c.workspace_id=a.workspace_id and c.id=a.connection_id and c.status='connected'))
    and (kind in ('outcome_reconcile','cloud_setup_open','cloud_session_open') or public.marketplace_cloud_write_available(workspace_id,connection_id)));
  when 'sync' then return exists(select 1 from public.marketplace_operations o join public.marketplace_connections c on c.workspace_id=o.workspace_id and c.id=o.connection_id
    left join public.marketplace_sync_schedules s on s.id=o.schedule_id
    where o.id=p_job_id::uuid and o.state='queued' and o.authorization_version=1 and c.execution_mode='cloud' and c.status='connected'
      and public.marketplace_sync_authorization_valid(o.workspace_id,o.requested_by) and public.marketplace_cloud_network_valid(o.workspace_id,o.connection_id)
      and (o.authorization_kind='manual_read' or (o.authorization_kind='scheduled_read' and s.enabled and s.authorization_version=o.schedule_authorization_version and s.activated_by=o.requested_by)));
  when 'message' then return exists(select 1 from public.marketplace_local_message_outbox m where id=p_job_id::uuid and execution_mode='cloud' and state='queued'
    and public.marketplace_cloud_write_available(workspace_id,connection_id) and public.marketplace_cloud_message_permission_valid(workspace_id,connection_id,requested_by,cloud_authorization_version));
  when 'negotiation' then return exists(select 1 from public.marketplace_negotiation_jobs j where id=p_job_id::uuid and execution_mode='cloud' and state='queued' and due_at<=clock_timestamp()
    and public.marketplace_cloud_write_available(workspace_id,connection_id) and public.marketplace_negotiation_job_valid(j));
  when 'listing' then return exists(select 1 from public.marketplace_listing_jobs j where id=p_job_id::bigint and execution_mode='cloud' and state='queued' and public.marketplace_listing_job_valid(j)
    and public.marketplace_cloud_write_available(workspace_id,connection_id) and ((j.snapshot ? 'relistExternalId' and j.relist_publish_at is null)
      or public.marketplace_listing_job_timing(coalesce(j.relist_publish_at,j.scheduled_at),j.late_policy,clock_timestamp())='due'));
  when 'favorite_message','favorite_offer' then return exists(select 1 from public.marketplace_favorite_message_events e join public.marketplace_favorite_message_settings settings using(workspace_id,connection_id)
    join public.marketplace_sync_schedules schedule using(workspace_id,connection_id)
    where e.id=p_job_id::uuid and e.execution_mode='cloud' and settings.execution_mode='cloud' and settings.enabled and schedule.enabled and schedule.paused_reason is null
      and (schedule.retry_after is null or schedule.retry_after<=clock_timestamp()) and e.setting_version=settings.version and e.external_account_id=settings.external_account_id and e.cloud_authorization_version=settings.cloud_authorization_version
      and public.marketplace_cloud_write_available(e.workspace_id,e.connection_id) and public.marketplace_cloud_favorite_settings_valid(e.workspace_id,e.connection_id)
      and ((p_kind='favorite_offer' and e.state='sent' and e.offer_state='pending') or (p_kind='favorite_message' and e.state='queued' and e.event_at+make_interval(mins=>(settings.config->>'delayMinutes')::integer)<=clock_timestamp())));
  else return false;
  end case;
end;
$$;

create or replace function public.marketplace_browser_next_work(p_include_scheduled boolean default true,p_enabled_kinds text[] default array['account_action','sync','message','negotiation','listing','favorite_message','favorite_offer'])
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_job record;
begin
  perform pg_advisory_xact_lock(91731,1);
  for v_job in select q.* from public.marketplace_browser_queue_entries() q where q.state='queued' and q.kind=any(p_enabled_kinds)
    and (q.kind<>'sync' or q.is_user or p_include_scheduled)
    and public.marketplace_browser_slot_status(q.workspace_id,q.connection_id) is null
    and (not q.is_write or q.resource_key is null or not exists(select 1 from public.marketplace_browser_queue_entries() previous
      where previous.workspace_id=q.workspace_id and previous.connection_id=q.connection_id and previous.is_write and previous.resource_key=q.resource_key
        and previous.queue_order<q.queue_order and public.marketplace_browser_write_waits_for(q.kind,q.job_id,previous.kind,previous.job_id,previous.state)))
    order by case when q.kind='sync' and q.is_user=false and q.created_at>clock_timestamp()-interval '5 minutes' then 1 else 0 end,q.queue_order,q.kind,q.job_id loop
    if public.marketplace_browser_job_ready(v_job.kind,v_job.job_id) then return jsonb_build_object('kind',v_job.kind,'jobId',v_job.job_id,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id); end if;
  end loop;
  return null;
end;
$$;

create or replace function public.marketplace_browser_job_eligible(p_kind text,p_job_id text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
declare v_job record;
begin
  select * into v_job from public.marketplace_browser_queue_entries() where kind=p_kind and job_id=p_job_id and state='queued';
  if not found or public.marketplace_browser_slot_status(v_job.workspace_id,v_job.connection_id) is not null then return false; end if;
  if v_job.is_write and v_job.resource_key is not null and exists(select 1 from public.marketplace_browser_queue_entries() previous
    where previous.workspace_id=v_job.workspace_id and previous.connection_id=v_job.connection_id and previous.is_write and previous.resource_key=v_job.resource_key
      and previous.queue_order<v_job.queue_order and public.marketplace_browser_write_waits_for(p_kind,p_job_id,previous.kind,previous.job_id,previous.state)) then return false; end if;
  return public.marketplace_browser_job_ready(p_kind,p_job_id);
end;
$$;

-- Bereits hängende, lesend nachprüfbare Ergebnisse der letzten sieben Tage auf verbundenen
-- Cloudkonten erhalten einmalig dieselbe automatische Nachprüfung. Ob sie laufen darf, prüft
-- wie bei jeder Kontoaktion die aktuelle Berechtigung des Auftraggebers.
do $$
declare v_action public.marketplace_account_actions;
begin
  for v_action in select action.* from public.marketplace_account_actions action
    join public.marketplace_connections account on account.workspace_id=action.workspace_id and account.id=action.connection_id
    where action.state='outcome_unknown' and action.history_purged_at is null and action.write_started_at>clock_timestamp()-interval '7 days'
      and account.execution_mode='cloud' and account.status='connected' and account.external_account_id=action.external_account_id
    order by action.queue_order limit 200 loop
    perform public.marketplace_account_action_auto_reconcile(v_action);
  end loop;
end;
$$;
