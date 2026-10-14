-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.web_push_events
  DROP CONSTRAINT web_push_events_category_check;

ALTER TABLE public.web_push_preferences
  DROP CONSTRAINT web_push_preferences_categories_check;

CREATE OR REPLACE FUNCTION public.marketplace_finalize_favorite_import (
  p_workspace_id         uuid,
  p_connection_id        uuid,
  p_observed_at          timestamp with time zone,
  p_publications_success boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_context jsonb; v_notification_id bigint;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if p_publications_success then
    update public.marketplace_favorite_notification_settings set baseline_pending = false
      where workspace_id = p_workspace_id and connection_id = p_connection_id and enabled
        and version = (v_context->>'version')::bigint;
  end if;
  if exists(select 1 from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and connection_id = p_connection_id and observed_at = p_observed_at) then
    -- Ausschließlich Invalidierung: keine Inserat-, Konto- oder Kennzahlendetails.
    if v_context->>'workspaceId'=p_workspace_id::text and v_context->>'connectionId'=p_connection_id::text and (v_context->>'observedAt')::timestamptz=p_observed_at then
        select id into v_notification_id from public.marketplace_favorite_notifications where workspace_id=p_workspace_id and connection_id=p_connection_id and observed_at=p_observed_at;
      if v_context->>'notificationId'=v_notification_id::text then
        perform public.web_push_enqueue_event('vinted-favorites:'||v_notification_id::text,p_workspace_id,'favorite',p_connection_id,jsonb_build_object('kind','vinted_favorites','connectionId',p_connection_id));
      end if;
    end if;
    perform realtime.send('{}'::jsonb,'favorite_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_notifications',true);
  end if;
  perform set_config('flipbase.favorite_notification_import','',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_record_favorite_notification_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_context jsonb; v_setting public.marketplace_favorite_notification_settings;
  v_previous bigint; v_favorites bigint; v_notification_id bigint;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if old.kind <> 'publication' or new.kind <> 'publication' or new.observed_at <= old.observed_at
    or new.workspace_id is distinct from old.workspace_id or new.connection_id is distinct from old.connection_id
    or v_context is null or v_context->>'workspaceId' <> new.workspace_id::text
    or v_context->>'connectionId' <> new.connection_id::text
    or (v_context->>'observedAt')::timestamptz <> new.observed_at then return new; end if;
  select * into v_setting from public.marketplace_favorite_notification_settings
    where workspace_id = new.workspace_id and connection_id = new.connection_id;
  if not found or not v_setting.enabled or v_setting.baseline_pending
    or v_setting.version is distinct from (v_context->>'version')::bigint
    or old.favorite_notification_version is distinct from v_setting.version then return new; end if;
  v_previous := public.marketplace_known_favorite_count(old.body);
  v_favorites := public.marketplace_known_favorite_count(new.body);
  if v_previous is null or v_favorites is null or v_favorites <= v_previous then return new; end if;
  insert into public.marketplace_favorite_notifications(workspace_id,connection_id,observed_at)
    values(new.workspace_id,new.connection_id,new.observed_at)
    on conflict (workspace_id,connection_id,observed_at) do nothing returning id into v_notification_id;
  if v_notification_id is not null then
    perform set_config('flipbase.favorite_notification_import',(v_context||jsonb_build_object('notificationId',v_notification_id))::text,true);
  else
    select id into v_notification_id from public.marketplace_favorite_notifications
      where workspace_id = new.workspace_id and connection_id = new.connection_id and observed_at = new.observed_at;
  end if;
  insert into public.marketplace_favorite_notification_events(workspace_id,connection_id,notification_id,entry_id,external_listing_id,title,previous_favorites,favorites,observed_at,setting_version)
    values(new.workspace_id,new.connection_id,v_notification_id,new.id,new.external_id,coalesce(new.body->>'title','Inserat'),v_previous,v_favorites,new.observed_at,v_setting.version)
    on conflict (workspace_id,connection_id,external_listing_id,observed_at) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.web_push_allowed_categories (
  p_user_id      uuid,
  p_workspace_id uuid
)
  RETURNS text[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select case when public.user_can_access_workspace(p_workspace_id,p_user_id)
 and exists(select 1 from public.workspaces where id=p_workspace_id and archived_at is null)
 then case when exists(select 1 from public.platform_operators where user_id=p_user_id)
 and exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin'))
 then array['message','order','favorite','connection']::text[] else array['order','connection']::text[] end else '{}'::text[] end;
$function$;

CREATE OR REPLACE FUNCTION public.web_push_can_deliver (
  p_user_id       uuid,
  p_workspace_id  uuid,
  p_category      text,
  p_connection_id uuid,
  p_session_id    uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now()))
 and public.user_can_access_workspace(p_workspace_id,p_user_id)
 and exists(select 1 from public.workspaces where id=p_workspace_id and archived_at is null)
 and case
 when p_category='test' then p_connection_id is null
 when p_category='order' and p_connection_id is null then true
 when p_category in ('message','favorite','connection') and exists(select 1 from public.marketplace_connections where id=p_connection_id and workspace_id=p_workspace_id and marketplace='vinted') then
   exists(select 1 from public.platform_operators where user_id=p_user_id)
   and exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin'))
 when p_category in ('order','connection') then
   exists(select 1 from public.ebay_connections where id=p_connection_id and workspace_id=p_workspace_id and user_id=p_user_id and external_account_id is not null and status<>'disconnected')
 else false end;
$function$;

CREATE OR REPLACE FUNCTION public.web_push_enqueue_event (
  p_source_key    text,
  p_workspace_id  uuid,
  p_category      text,
  p_connection_id uuid,
  p_target        jsonb,
  p_device_id     uuid  DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_id uuid:=extensions.gen_random_uuid(); v_inserted uuid; v_title text; v_body text;
begin
 if p_category='test' and (p_device_id is null or p_target<>'{"kind":"settings"}'::jsonb or p_connection_id is not null) then raise exception 'Push test target denied' using errcode='22023'; end if;
 v_title:='Flipbase';
 v_body:=case p_category when 'test' then 'Deine Testbenachrichtigung ist angekommen.' when 'message' then 'Du hast eine neue Nachricht.' when 'order' then 'Eine neue Bestellung ist eingegangen.' when 'favorite' then 'Deine Inserate haben neue Favoriten.' when 'connection' then 'Eine Kontoverbindung braucht deine Anmeldung.' end;
 insert into public.web_push_events(id,source_key,workspace_id,category,connection_id,payload)
 values(v_id,p_source_key,p_workspace_id,p_category,p_connection_id,jsonb_build_object('version',1,'eventId',v_id,'workspaceId',p_workspace_id,'category',p_category,'title',v_title,'body',v_body,'target',p_target))
 on conflict(source_key) do nothing returning id into v_inserted;
 if v_inserted is null then
  select id into v_id from public.web_push_events where source_key=p_source_key;
  return v_id;
 end if;
 insert into public.web_push_deliveries(event_id,device_id,binding_generation)
 select v_id,d.id,d.id from public.web_push_devices d join public.web_push_generations g on g.id=d.id
 where d.active and g.revoked_at is null and (p_device_id is null or d.id=p_device_id)
 and public.web_push_can_deliver(d.user_id,p_workspace_id,p_category,p_connection_id,d.session_id)
 and (p_category='test' or exists(select 1 from public.web_push_preferences p where p.device_id=d.id and p.workspace_id=p_workspace_id and p_category=any(p.categories)))
 on conflict(event_id,device_id) do nothing;
 return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.web_push_settings (
  p_user_id    uuid,
  p_session_id uuid,
  p_input      jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
 v_api_version integer := coalesce((p_input->>'apiVersion')::integer,1);
 v_action text := p_input->>'action'; v_id uuid; v_workspace uuid;
 v_generation public.web_push_generations%rowtype; v_device public.web_push_devices%rowtype;
 v_categories text[]; v_allowed text[]; v_result jsonb; v_event uuid;
begin
 if v_api_version not in (1,2) then raise exception 'Push API version denied' using errcode='22023'; end if;
 if not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now())) then raise exception 'Push session denied' using errcode='42501'; end if;
 if v_action in ('register','revoke','preferences','test') then perform pg_catalog.pg_advisory_xact_lock(470,0); end if;
 if v_action='register' then
  v_id:=(p_input->>'generationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,470));
  select * into v_generation from public.web_push_generations where id=v_id for update;
  if found then
   if not public.web_push_hash_equal(v_generation.token_hash,p_input->>'tokenHash') or (v_generation.user_id is not null and v_generation.user_id<>p_user_id) then raise exception 'Push binding denied' using errcode='42501'; end if;
   if v_generation.revoked_at is not null then return jsonb_build_object('deviceId',v_id,'active',false); end if;
   select * into v_device from public.web_push_devices where id=v_id;
   if v_device.user_id is distinct from p_user_id or v_device.session_id is distinct from p_session_id or v_device.installation_id is distinct from (p_input->>'installationId')::uuid or v_device.endpoint is distinct from p_input#>>'{subscription,endpoint}' or v_device.p256dh is distinct from p_input#>>'{subscription,p256dh}' or v_device.auth is distinct from p_input#>>'{subscription,auth}' or v_device.vapid_key_id is distinct from p_input->>'keyId' then raise exception 'Push binding denied' using errcode='42501'; end if;
   return jsonb_build_object('deviceId',v_id,'active',v_device.active);
  end if;
  insert into public.web_push_generations(id,token_hash,user_id) values(v_id,p_input->>'tokenHash',p_user_id);
  -- Nutzerwechsel oder neues Subscription ersetzt vorherige Generationen derselben Installation/Endpunktbindung.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_input->>'installationId',471));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_input#>>'{subscription,endpoint}',472));
  update public.web_push_generations set revoked_at=coalesce(revoked_at,now()) where id in (select id from public.web_push_devices where installation_id=(p_input->>'installationId')::uuid or endpoint=p_input#>>'{subscription,endpoint}');
  update public.web_push_devices set active=false where installation_id=(p_input->>'installationId')::uuid or endpoint=p_input#>>'{subscription,endpoint}';
  insert into public.web_push_devices(id,user_id,session_id,installation_id,endpoint_fingerprint,endpoint,p256dh,auth,vapid_key_id)
  values(v_id,p_user_id,p_session_id,(p_input->>'installationId')::uuid,encode(extensions.digest(p_input#>>'{subscription,endpoint}','sha256'),'hex'),p_input#>>'{subscription,endpoint}',p_input#>>'{subscription,p256dh}',p_input#>>'{subscription,auth}',p_input->>'keyId');
  return jsonb_build_object('deviceId',v_id,'active',true);
 elsif v_action='settings' then
  if p_input ? 'workspaceId' then v_workspace:=(p_input->>'workspaceId')::uuid; end if;
  select * into v_device from public.web_push_devices where user_id=p_user_id and installation_id=(p_input->>'installationId')::uuid order by last_confirmed_at desc,id desc limit 1;
  return jsonb_build_object('binding',case when v_device.id is null then null else jsonb_build_object('deviceId',v_device.id,'active',v_device.active and v_device.session_id=p_session_id,'keyId',v_device.vapid_key_id) end,'allowedCategories',case when v_workspace is null then '{}'::text[] else array(select category from unnest(public.web_push_allowed_categories(p_user_id,v_workspace)) category where v_api_version=2 or category<>'favorite') end,'preferences',coalesce((select jsonb_agg(jsonb_build_object('workspaceId',workspace_id,'categories',array(select category from unnest(categories) category where v_api_version=2 or category<>'favorite'))) from public.web_push_preferences where device_id=v_device.id and public.user_can_access_workspace(workspace_id,p_user_id)),'[]'::jsonb));
 elsif v_action in ('preferences','revoke','test') then
  v_id:=(p_input->>'deviceId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,470));
  select * into v_device from public.web_push_devices where id=v_id and user_id=p_user_id for update;
  if not found then raise exception 'Push device denied' using errcode='42501'; end if;
  if v_action='revoke' then
   -- Authentifizierter Widerruf darf auch eigene Bindungen einer vorherigen Sitzung deaktivieren.
   perform public.web_push_revoke_binding(v_id,(select token_hash from public.web_push_generations where id=v_id));
   return jsonb_build_object('deviceId',v_id,'active',false);
  end if;
  if not v_device.active or v_device.session_id<>p_session_id then raise exception 'Push device denied' using errcode='42501'; end if;
  v_workspace:=(p_input->>'workspaceId')::uuid;
  v_allowed:=public.web_push_allowed_categories(p_user_id,v_workspace);
  if cardinality(v_allowed)=0 then raise exception 'Push workspace denied' using errcode='42501'; end if;
  if v_action='preferences' then
   select coalesce(array_agg(category),'{}'::text[]) into v_categories from jsonb_array_elements_text(p_input->'categories') as category;
   if v_api_version=1 and 'favorite'=any(v_categories) then raise exception 'Push category denied' using errcode='42501'; end if;
   if not v_categories <@ v_allowed then raise exception 'Push category denied' using errcode='42501'; end if;
   insert into public.web_push_preferences(device_id,workspace_id,categories) values(v_id,v_workspace,v_categories) on conflict(device_id,workspace_id) do update set categories=case when v_api_version=1 and 'favorite'=any(public.web_push_preferences.categories) then excluded.categories||array['favorite']::text[] else excluded.categories end;
   return jsonb_build_object('deviceId',v_id,'workspaceId',v_workspace,'categories',v_categories);
  end if;
  if v_device.test_window_at is null or v_device.test_window_at<=now()-interval '1 minute' then v_device.test_count:=0; v_device.test_window_at:=now(); end if;
  if v_device.test_count>=3 then raise exception 'Push test rate limit' using errcode='P0001'; end if;
  -- Task7 implementiert den realen transaktionalen Outboxauftrag; fehlende Function bleibt ein Fehler.
  execute 'select public.web_push_enqueue_test($1,$2)' into v_event using v_id,v_workspace;
  update public.web_push_devices set test_count=v_device.test_count+1,test_window_at=v_device.test_window_at where id=v_id;
  return jsonb_build_object('eventId',v_event,'status','queued');
 end if;
 raise exception 'Push action denied' using errcode='22023';
end;
$function$;

ALTER TABLE public.web_push_events
  ADD CONSTRAINT web_push_events_category_check CHECK (category = ANY (ARRAY['test'::text, 'message'::text, 'order'::text, 'favorite'::text, 'connection'::text]));

ALTER TABLE public.web_push_preferences
  ADD CONSTRAINT web_push_preferences_categories_check CHECK (categories <@ ARRAY['message'::text, 'order'::text, 'favorite'::text, 'connection'::text]);