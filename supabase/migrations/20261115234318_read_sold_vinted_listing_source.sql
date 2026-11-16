-- Liest vollständige verkaufte Vinted-Artikel über bestehende Kontoaktionen; prüft Artikel- und Verkäuferzuordnung.
set check_function_bodies = off;

create or replace function public.marketplace_account_action_authorized(p_action public.marketplace_account_actions)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$
declare v_connection public.marketplace_connections;
begin
  if p_action.ai_connection_id is not null and (p_action.kind<>'price_save' or not public.ai_connection_execution_valid(
    p_action.ai_connection_id,p_action.requested_by,p_action.workspace_id,p_action.connection_id)) then return false; end if;
  if not public.marketplace_account_action_user_authorized(p_action.workspace_id,p_action.requested_by) then return false; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_action.workspace_id and id=p_action.connection_id and marketplace='vinted' for share;
  if not found then return false; end if;
  if p_action.kind='cloud_session_open' then
    return v_connection.execution_mode='cloud' and v_connection.status not in ('paused','blocked')
      and v_connection.browser_dialog_id=(p_action.payload->>'dialogId')::uuid and v_connection.browser_dialog_user_id=p_action.requested_by
      and v_connection.browser_presence_expires_at>clock_timestamp() and exists(select 1 from public.marketplace_browser_profiles
        where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id and provider_profile_id=p_action.provider_profile_id);
  end if;
  if p_action.kind='cloud_setup_open' then
    return exists(select 1 from public.marketplace_cloud_setups setup where setup.public_id=(p_action.payload->>'setupId')::uuid
      and setup.workspace_id=p_action.workspace_id and setup.connection_id=p_action.connection_id and setup.requested_by=p_action.requested_by
      and setup.state in ('login','verified') and setup.expires_at>clock_timestamp() and setup.provider_profile_id=p_action.provider_profile_id
      and setup.browser_dialog_id=(p_action.payload->>'dialogId')::uuid and setup.browser_presence_expires_at>clock_timestamp());
  end if;
  if v_connection.execution_mode<>'cloud' or v_connection.status not in ('connected','needs_login','paused') or v_connection.external_account_id is distinct from p_action.external_account_id
    or not public.marketplace_cloud_network_valid(p_action.workspace_id,p_action.connection_id)
    or not exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id and provider_profile_id=p_action.provider_profile_id) then return false; end if;
  if p_action.entry_id is not null and not exists(select 1 from public.marketplace_account_entries where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id
      and id=p_action.entry_id and kind=p_action.entry_kind and external_id=p_action.external_id) then return false; end if;
  if p_action.kind='listing_content_read' and p_action.payload ? 'saleItemId' and not exists(
    select 1 from public.marketplace_account_entries where workspace_id=p_action.workspace_id and connection_id=p_action.connection_id
      and id=p_action.entry_id and kind='sale' and external_id=p_action.external_id
      and body->'itemIds' ? (p_action.payload->>'saleItemId') and coalesce(body->>'saleState','')<>'relisted'
      and (not body ? 'sellerId' or body->>'sellerId'=p_action.external_account_id)
  ) then return false; end if;
  -- Ein eigener wartender direkter Auftrag bleibt gültig; die gemeinsame Ressourcenauswahl ordnet Relist und Änderungen.
  return true;
end;
$function$
;

create or replace function public.marketplace_account_action_enqueue(p_workspace_id uuid, p_connection_id uuid, p_request_id uuid, p_kind text, p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$
;


