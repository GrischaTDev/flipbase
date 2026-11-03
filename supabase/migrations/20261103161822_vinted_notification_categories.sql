-- Zweck: Vinted-Meldungen unterscheiden, Kategorien steuern und alte Systemereignisse still nachladen.
-- Betroffen: Nachrichteneinstellungen, Eingangsbaseline, Postfach-/Bewertungsmeldungen und autorisierter Pushversand.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_feedback_occurred_at (
  p_value text
)
  returns timestamp with time zone
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_at timestamptz;
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' then return null; end if;
  v_at:=p_value::timestamptz;
  return case when isfinite(v_at) then v_at end;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end;
$function$;

revoke all on function public.marketplace_feedback_occurred_at(text) from public;

grant all on function public.marketplace_feedback_occurred_at(text) to authenticated;

grant all on function public.marketplace_feedback_occurred_at(text) to service_role;

create function public.marketplace_notification_categories (
  p_enabled    boolean,
  p_categories jsonb
)
  returns jsonb
  language sql
  immutable
  set search_path to ''
  as $function$
  select jsonb_build_object('messages',coalesce(p_enabled,true),'offers',coalesce(p_enabled,true),
    'orders',coalesce(p_enabled,true),'shipping',coalesce(p_enabled,true),'payments',coalesce(p_enabled,true),
    'feedback',true,'other',coalesce(p_enabled,true)) || coalesce(p_categories,'{}'::jsonb);
$function$;

revoke all on function public.marketplace_notification_categories(boolean, jsonb) from public;

grant all on function public.marketplace_notification_categories(boolean, jsonb) to authenticated;

grant all on function public.marketplace_notification_categories(boolean, jsonb) to service_role;

create function public.marketplace_notification_category (
  p_kind text
)
  returns text
  language sql
  immutable
  set search_path to ''
  as $function$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind = 'offer_received' then 'offers'
    when p_kind in ('sale_sold','purchase_created','order_cancelled','transaction_cancelled','item_relisted','order_completed','order_suspended','issue_reported') then 'orders'
    when p_kind in ('shipping_label_ready','shipment_sent','ready_for_pickup','delivered','return_shipped') then 'shipping'
    when p_kind in ('refund_started','refund_completed','refund_accepted') then 'payments'
    when p_kind in ('feedback_received','feedback_sent') then 'feedback'
    else 'other' end;
$function$;

revoke all on function public.marketplace_notification_category(text) from public;

grant all on function public.marketplace_notification_category(text) to authenticated;

grant all on function public.marketplace_notification_category(text) to service_role;

create function public.marketplace_notification_enabled (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_category      text,
  p_occurred_at   timestamp with time zone default null::timestamp with time zone
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select p_category = any(array['messages','offers','orders','shipping','payments','feedback','other'])
    and coalesce((public.marketplace_notification_categories(s.enabled,s.categories)->>p_category)::boolean,true)
    and (p_occurred_at is null or extract(epoch from p_occurred_at) >= coalesce(
      (s.category_enabled_since->>p_category)::numeric,
      case when p_category<>'feedback' then extract(epoch from s.enabled_since) end,0))
  from (select 1) anchor left join public.marketplace_message_notification_settings s
    on s.workspace_id=p_workspace_id and s.connection_id=p_connection_id;
$function$;

revoke all on function public.marketplace_notification_enabled(uuid, uuid, text, timestamp with time zone) from public;

grant all on function public.marketplace_notification_enabled(uuid, uuid, text, timestamp with time zone) to authenticated;

grant all on function public.marketplace_notification_enabled(uuid, uuid, text, timestamp with time zone) to service_role;

create function public.marketplace_notification_kind_valid (
  p_external_id text,
  p_kind        text
)
  returns boolean
  language sql
  immutable
  set search_path to ''
  as $function$
  select p_kind is not null and case split_part(p_external_id,':',1)
    when 'message' then p_kind='message'
    when 'offer_request_message' then p_kind='offer_received'
    when 'status_message' then p_kind=any(array['sale_sold','purchase_created','order_cancelled','transaction_cancelled','item_relisted','shipping_label_ready','shipment_sent','ready_for_pickup','delivered','order_completed','order_suspended','issue_reported','refund_started','refund_completed','refund_accepted','return_shipped','feedback_received','feedback_sent','support_closed','item_unavailable','other_status'])
    when 'action_message' then p_kind=any(array['sale_sold','purchase_created','order_cancelled','transaction_cancelled','item_relisted','shipping_label_ready','shipment_sent','ready_for_pickup','delivered','order_completed','order_suspended','issue_reported','refund_started','refund_completed','refund_accepted','return_shipped','feedback_received','feedback_sent','support_closed','item_unavailable','other_status'])
    when 'payment_message' then p_kind=any(array['sale_sold','purchase_created','order_cancelled','transaction_cancelled','item_relisted','shipping_label_ready','shipment_sent','ready_for_pickup','delivered','order_completed','order_suspended','issue_reported','refund_started','refund_completed','refund_accepted','return_shipped','feedback_received','feedback_sent','support_closed','item_unavailable','other_status'])
    else false end;
$function$;

revoke all on function public.marketplace_notification_kind_valid(text, text) from public;

grant all on function public.marketplace_notification_kind_valid(text, text) to authenticated;

grant all on function public.marketplace_notification_kind_valid(text, text) to service_role;

create function public.marketplace_notification_title (
  p_kind text
)
  returns text
  language sql
  immutable
  set search_path to ''
  as $function$
  select case p_kind
    when 'message' then 'Neue Nachricht'
    when 'offer_received' then 'Neuer Preisvorschlag'
    when 'sale_sold' then 'Artikel verkauft'
    when 'purchase_created' then 'Artikel gekauft'
    when 'order_cancelled' then 'Bestellung storniert'
    when 'transaction_cancelled' then 'Transaktion abgebrochen'
    when 'item_relisted' then 'Artikel wieder eingestellt'
    when 'shipping_label_ready' then 'Versandlabel verfügbar'
    when 'shipment_sent' then 'Sendung verschickt'
    when 'ready_for_pickup' then 'Sendung abholbereit'
    when 'delivered' then 'Sendung zugestellt'
    when 'order_completed' then 'Bestellung abgeschlossen'
    when 'order_suspended' then 'Bestellung unterbrochen'
    when 'issue_reported' then 'Problem gemeldet'
    when 'refund_started' then 'Rückerstattung eingeleitet'
    when 'refund_completed' then 'Rückerstattung abgeschlossen'
    when 'refund_accepted' then 'Rückerstattung angenommen'
    when 'return_shipped' then 'Rücksendung verschickt'
    when 'feedback_received' then 'Neue Bewertung'
    when 'feedback_sent' then 'Bewertung abgegeben'
    when 'support_closed' then 'Supportchat beendet'
    when 'item_unavailable' then 'Artikel nicht verfügbar'
    else 'Status bei Vinted aktualisiert' end;
$function$;

revoke all on function public.marketplace_notification_title(text) from public;

grant all on function public.marketplace_notification_title(text) to authenticated;

grant all on function public.marketplace_notification_title(text) to service_role;

create or replace function public.marketplace_read_message_notification_settings (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_setting public.marketplace_message_notification_settings;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  select * into v_setting from public.marketplace_message_notification_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,
    'enabled',(public.marketplace_notification_categories(v_setting.enabled,v_setting.categories)->>'messages')::boolean,
    'categories',public.marketplace_notification_categories(v_setting.enabled,v_setting.categories),'version',coalesce(v_setting.version,0));
end;
$function$;

create or replace function public.marketplace_read_message_notifications (
  p_workspace_id uuid
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare v_items jsonb; v_unread bigint;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select count(*) into v_unread from public.marketplace_message_notifications n join public.marketplace_connections c on c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id where n.workspace_id=p_workspace_id and n.notified_at is not null and n.cleared_at is null and n.conversation_id is not null and not n.read;
  with latest as (
    select n.*,c.display_name,e.body->>'title' as sender_name from public.marketplace_message_notifications n
    join public.marketplace_connections c on c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id
    join public.marketplace_account_entries e on e.workspace_id=n.workspace_id and e.connection_id=n.connection_id and e.id=n.conversation_id and e.kind='conversation'
    where n.workspace_id=p_workspace_id and n.notified_at is not null and n.cleared_at is null order by n.notified_at desc,n.id desc limit 50
  ) select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'connectionId',n.connection_id,'conversationId',n.conversation_id,'accountName',n.display_name,'senderName',n.sender_name,
    'eventKind',split_part(n.external_event_id,':',1),'notificationKind',n.notification_kind,'observedAt',n.notified_at,'read',n.read) order by n.notified_at desc,n.id desc),'[]'::jsonb) into v_items from latest n;
  return jsonb_build_object('workspaceId',p_workspace_id,'items',v_items,'unreadCount',v_unread);
end;
$function$;

create or replace function public.marketplace_record_feedback_notifications()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare v_has_baseline boolean := false; v_inserted integer;
begin
  if new.kind <> 'profile' or jsonb_typeof(new.body->'feedbacks') is distinct from 'array'
    or not exists (select 1 from public.marketplace_connections c where c.workspace_id = new.workspace_id and c.id = new.connection_id and c.marketplace = 'vinted') then return new; end if;
  perform pg_advisory_xact_lock(91731,1);
  if tg_op = 'UPDATE' then
    if old.kind <> 'profile' or new.workspace_id is distinct from old.workspace_id or new.connection_id is distinct from old.connection_id
      or new.observed_at <= old.observed_at or new.body->'feedbacks' is not distinct from old.body->'feedbacks' then return new; end if;
    v_has_baseline := jsonb_typeof(old.body->'feedbacks') = 'array';
    if v_has_baseline then
      -- Bestehende Profile erhalten ihre Basis beim ersten Abruf nach dem Update.
      insert into public.marketplace_feedback_notifications(workspace_id,connection_id,external_feedback_id,observed_at)
      select new.workspace_id,new.connection_id,feedback->>'id',old.observed_at
      from jsonb_array_elements(old.body->'feedbacks') feedback
      where jsonb_typeof(feedback->'id') = 'string' and char_length(btrim(feedback->>'id')) between 1 and 256
      on conflict (workspace_id,connection_id,external_feedback_id) do nothing;
    end if;
  end if;
  insert into public.marketplace_feedback_notifications(workspace_id,connection_id,external_feedback_id,author_name,rating,is_automatic,observed_at,notified_at)
  select new.workspace_id,new.connection_id,feedback->>'id',
    case when jsonb_typeof(feedback->'authorName') = 'string' and char_length(btrim(feedback->>'authorName')) between 1 and 1000
      and feedback->>'authorName' !~ '[[:cntrl:]]' then feedback->>'authorName' end,
    case when jsonb_typeof(feedback->'rating') = 'number' and feedback->>'rating' ~ '^[0-5]$' then (feedback->>'rating')::integer end,
    case when jsonb_typeof(feedback->'isAutomatic') = 'boolean' then (feedback->>'isAutomatic')::boolean end,
    new.observed_at,case when v_has_baseline
      and ((source.occurred_at is not null and feedback->'occurredAtVerified' is distinct from 'false'::jsonb) or not exists(select 1 from public.marketplace_message_notification_settings s
        where s.workspace_id=new.workspace_id and s.connection_id=new.connection_id and coalesce((s.category_enabled_since->>'feedback')::numeric,0)>0))
      and public.marketplace_notification_enabled(new.workspace_id,new.connection_id,'feedback',coalesce(source.occurred_at,new.observed_at))
      then new.observed_at end
  from jsonb_array_elements(new.body->'feedbacks') feedback
  cross join lateral (select public.marketplace_feedback_occurred_at(feedback->>'occurredAt') as occurred_at) source
  where jsonb_typeof(feedback->'id') = 'string' and char_length(btrim(feedback->>'id')) between 1 and 256
  on conflict (workspace_id,connection_id,external_feedback_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_has_baseline and v_inserted > 0 then
    perform realtime.send('{}'::jsonb,'feedback_notifications_changed','workspace:' || new.workspace_id::text || ':marketplace_feedback_notifications',true);
  end if;
  return new;
end;
$function$;

create or replace function public.marketplace_record_message_event_batch (
  p_workspace_id        uuid,
  p_connection_id       uuid,
  p_external_account_id text,
  p_batch               jsonb
)
  returns integer
  language plpgsql
  set search_path to ''
  as $function$
declare v_observed timestamptz; v_reference public.marketplace_message_notification_baselines; v_had_reference boolean; v_event jsonb; v_count integer; v_visible integer;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not exists(select 1 from public.marketplace_connections c where c.workspace_id=p_workspace_id and c.id=p_connection_id and c.marketplace='vinted' and c.status='connected' and c.external_account_id=p_external_account_id) then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or octet_length(p_batch::text)>786432
    or (select count(*) from jsonb_object_keys(p_batch))<>5
    or exists(select 1 from jsonb_object_keys(p_batch) field where field<>all(array['version','observedAt','events','complete','coveredConversationIds']))
    or p_batch->'version' is distinct from '1'::jsonb or jsonb_typeof(p_batch->'complete') is distinct from 'boolean'
    or jsonb_typeof(p_batch->'observedAt') is distinct from 'string' or p_batch->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or jsonb_typeof(p_batch->'events') is distinct from 'array' or jsonb_array_length(p_batch->'events')>2000
    or jsonb_typeof(p_batch->'coveredConversationIds') is distinct from 'array' or jsonb_array_length(p_batch->'coveredConversationIds')>10 then raise exception 'Ungültige Nachrichteneingänge' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_batch->'coveredConversationIds') entry where jsonb_typeof(entry)<>'string' or entry#>>'{}' !~ '^[1-9][0-9]{0,31}$')
    or (select count(*) from jsonb_array_elements(p_batch->'coveredConversationIds'))<>(select count(distinct entry) from jsonb_array_elements(p_batch->'coveredConversationIds') entry)
    or (select count(*) from jsonb_array_elements(p_batch->'events'))<>(select count(distinct (entry->>'externalConversationId',entry->>'externalId')) from jsonb_array_elements(p_batch->'events') entry) then raise exception 'Mehrdeutige Nachrichteneingänge' using errcode='22023'; end if;
  begin
    v_observed:=(p_batch->>'observedAt')::timestamptz;
    if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '30 seconds' then raise exception 'Ungültige Eingangszeit' using errcode='22023'; end if;
    for v_event in select value from jsonb_array_elements(p_batch->'events') loop
      if jsonb_typeof(v_event)<>'object' or (select count(*) from jsonb_object_keys(v_event)) not in (5,6)
        or exists(select 1 from jsonb_object_keys(v_event) field where field<>all(array['externalId','externalConversationId','occurredAt','direction','source','notificationKind']))
        or (v_event ? 'notificationKind' and (jsonb_typeof(v_event->'notificationKind') is distinct from 'string'
          or not public.marketplace_notification_kind_valid(v_event->>'externalId',v_event->>'notificationKind')))
        or jsonb_typeof(v_event->'externalId') is distinct from 'string' or v_event->>'externalId' !~ '^((message|offer_request_message):[1-9][0-9]{0,31}|(status_message|action_message|payment_message):([1-9][0-9]{0,31}|event:[0-9a-f]{64}))$'
        or jsonb_typeof(v_event->'externalConversationId') is distinct from 'string' or v_event->>'externalConversationId' !~ '^[1-9][0-9]{0,31}$'
        or v_event->>'direction' is distinct from 'inbound' or v_event->>'source' is distinct from 'conversation_snapshot'
        or jsonb_typeof(v_event->'occurredAt') is distinct from 'string' or v_event->>'occurredAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        or not isfinite((v_event->>'occurredAt')::timestamptz) or (v_event->>'occurredAt')::timestamptz>v_observed then raise exception 'Ungültiger Nachrichteneingang' using errcode='22023'; end if;
    end loop;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Eingangszeit' using errcode='22023'; end;
  select * into v_reference from public.marketplace_message_notification_baselines where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=p_external_account_id for update;
  v_had_reference:=found;
  if v_had_reference and v_observed<v_reference.last_observed_at then raise exception 'Veralteter Eingangsstand' using errcode='22023'; end if;
  -- Ein begrenzter, aber vollständig belegter Verlauf setzt den Zeitbezug. Ältere Folgeseiten bleiben still.
  if not v_had_reference and ((p_batch->>'complete')::boolean or jsonb_array_length(p_batch->'coveredConversationIds')>0) then
    insert into public.marketplace_message_notification_baselines(workspace_id,connection_id,external_account_id,first_observed_at,last_observed_at,system_events_since) values(p_workspace_id,p_connection_id,p_external_account_id,v_observed,v_observed,v_observed) returning * into v_reference;
  elsif v_had_reference then
    update public.marketplace_message_notification_baselines set last_observed_at=v_observed where id=v_reference.id;
  end if;
  with canonical as (
    select entry,coalesce(entry->>'notificationKind',case split_part(entry->>'externalId',':',1)
      when 'message' then 'message' when 'offer_request_message' then 'offer_received' else 'other_status' end) as kind
    from jsonb_array_elements(p_batch->'events') entry
  ), added as (
    insert into public.marketplace_message_notifications(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id,notification_kind,conversation_id,occurred_at,observed_at,notified_at)
    select p_workspace_id,p_connection_id,p_external_account_id,entry->>'externalConversationId',entry->>'externalId',canonical.kind,c.id,(entry->>'occurredAt')::timestamptz,v_observed,
      case when v_had_reference
        and (entry->>'occurredAt')::timestamptz>v_reference.first_observed_at
        and (canonical.kind in ('message','offer_received') or (entry->>'occurredAt')::timestamptz>=v_reference.system_events_since)
        -- Cloudbewertungen besitzt bereits die Profilquelle; lokale Konten erhalten sie im Chat.
        and (canonical.kind<>'feedback_received' or exists(select 1 from public.marketplace_connections feedback_connection
          where feedback_connection.workspace_id=p_workspace_id and feedback_connection.id=p_connection_id and feedback_connection.execution_mode='local'))
        and public.marketplace_notification_enabled(p_workspace_id,p_connection_id,public.marketplace_notification_category(canonical.kind),(entry->>'occurredAt')::timestamptz)
        then v_observed end
    from canonical left join public.marketplace_account_entries c on c.workspace_id=p_workspace_id and c.connection_id=p_connection_id and c.kind='conversation' and c.external_id=entry->>'externalConversationId'
    on conflict(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id) do nothing returning notified_at,conversation_id
  ) select count(*) filter(where notified_at is not null),count(*) filter(where notified_at is not null and conversation_id is not null) into v_count,v_visible from added;
  if v_visible>0 then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return v_count;
end;
$function$;

create or replace function public.marketplace_set_message_notification_settings (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_enabled          boolean,
  p_expected_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setting public.marketplace_message_notification_settings;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  perform 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_enabled is null or p_expected_version is null or p_expected_version<0 then raise exception 'Ungültige Meldungseinstellung' using errcode='22023'; end if;
  select * into v_setting from public.marketplace_message_notification_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_setting.version,0)<>p_expected_version then raise exception 'Meldungseinstellung wurde zwischenzeitlich geändert' using errcode='40001'; end if;
  if v_setting.id is null then
    insert into public.marketplace_message_notification_settings(workspace_id,connection_id,enabled,enabled_since) values(p_workspace_id,p_connection_id,p_enabled,clock_timestamp());
  elsif exists(select 1 from jsonb_each(public.marketplace_notification_categories(v_setting.enabled,v_setting.categories)) c where c.key<>'feedback' and c.value<>to_jsonb(p_enabled)) then
    -- Alte Clients behalten ihren Gesamtschalter; die eigenständige Bewertungswahl bleibt erhalten.
    update public.marketplace_message_notification_settings set enabled=p_enabled,version=version+1,enabled_since=clock_timestamp(),
      categories=jsonb_build_object('messages',p_enabled,'offers',p_enabled,'orders',p_enabled,'shipping',p_enabled,'payments',p_enabled,
        'feedback',(public.marketplace_notification_categories(v_setting.enabled,v_setting.categories)->>'feedback')::boolean,'other',p_enabled),
      category_enabled_since=jsonb_build_object('messages',extract(epoch from date_trunc('second',clock_timestamp())),'offers',extract(epoch from date_trunc('second',clock_timestamp())),
        'orders',extract(epoch from date_trunc('second',clock_timestamp())),'shipping',extract(epoch from date_trunc('second',clock_timestamp())),'payments',extract(epoch from date_trunc('second',clock_timestamp())),
        'other',extract(epoch from date_trunc('second',clock_timestamp()))) || case when v_setting.category_enabled_since ? 'feedback'
          then jsonb_build_object('feedback',v_setting.category_enabled_since->'feedback') else '{}'::jsonb end
    where id=v_setting.id;
  end if;
  return public.marketplace_read_message_notification_settings(p_workspace_id,p_connection_id);
end;
$function$;

create function public.marketplace_set_notification_category_settings (
  p_workspace_id     uuid,
  p_connection_id    uuid,
  p_category         text,
  p_enabled          boolean,
  p_expected_version bigint
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setting public.marketplace_message_notification_settings; v_categories jsonb; v_since jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  perform 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_category is null or p_category<>all(array['messages','offers','orders','shipping','payments','feedback','other'])
    or p_enabled is null or p_expected_version is null or p_expected_version<0 then
    raise exception 'Ungültige Meldungseinstellung' using errcode='22023';
  end if;
  select * into v_setting from public.marketplace_message_notification_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_setting.version,0)<>p_expected_version then raise exception 'Meldungseinstellung wurde zwischenzeitlich geändert' using errcode='40001'; end if;
  v_categories:=public.marketplace_notification_categories(v_setting.enabled,v_setting.categories);
  -- Die bisherige Zeitgrenze materialisieren, damit eine Einzelwahl andere Kategorien nicht beeinflusst.
  select coalesce(jsonb_object_agg(c.key,coalesce(v_setting.category_enabled_since->c.key,
    to_jsonb(case when c.key<>'feedback' then coalesce(extract(epoch from v_setting.enabled_since),0) else 0 end))),'{}'::jsonb)
    into v_since from jsonb_each(v_categories) c;
  if v_setting.id is null or (v_categories->>p_category)::boolean<>p_enabled then
    v_categories:=jsonb_set(v_categories,array[p_category],to_jsonb(p_enabled));
    -- Anbieterzeiten besitzen teils nur Sekunden. Die gleiche Quellsekunde bleibt zulässig,
    -- damit unmittelbar nach Aktivierung entstandene Ereignisse nicht dauerhaft verloren gehen.
    v_since:=jsonb_set(v_since,array[p_category],to_jsonb(extract(epoch from date_trunc('second',clock_timestamp()))));
    if v_setting.id is null then
      insert into public.marketplace_message_notification_settings(workspace_id,connection_id,enabled,categories,category_enabled_since)
      values(p_workspace_id,p_connection_id,(v_categories->>'messages')::boolean,v_categories,v_since);
    else
      update public.marketplace_message_notification_settings set enabled=(v_categories->>'messages')::boolean,
        categories=v_categories,category_enabled_since=v_since,version=version+1 where id=v_setting.id;
    end if;
  end if;
  return public.marketplace_read_message_notification_settings(p_workspace_id,p_connection_id);
end;
$function$;

revoke all on function public.marketplace_set_notification_category_settings(uuid, uuid, text, boolean, bigint) from public;

grant all on function public.marketplace_set_notification_category_settings(uuid, uuid, text, boolean, bigint) to authenticated;

grant all on function public.marketplace_set_notification_category_settings(uuid, uuid, text, boolean, bigint) to service_role;

create or replace function public.web_push_authorize (
  p_delivery_id uuid,
  p_generation  uuid,
  p_claim_token uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_delivery public.web_push_deliveries%rowtype; v_device public.web_push_devices%rowtype; v_event public.web_push_events%rowtype;
begin
 select * into v_delivery from public.web_push_deliveries where id=p_delivery_id and binding_generation=p_generation and claim_token=p_claim_token and status='claimed' and lease_until>clock_timestamp() for update;
 if not found then return null; end if;
 select * into v_device from public.web_push_devices where id=p_generation;
 select * into v_event from public.web_push_events where id=v_delivery.event_id;
 if not v_device.active or v_event.expires_at<=clock_timestamp()
 or exists(select 1 from public.web_push_generations where id=p_generation and revoked_at is not null)
 or not public.web_push_can_deliver(v_device.user_id,v_event.workspace_id,v_event.category,v_event.connection_id,v_device.session_id)
 or (v_event.category='message' and v_event.source_key ~ '^vinted-message:[1-9][0-9]{0,18}$' and not exists (
   select 1 from public.marketplace_message_notifications n
   join public.marketplace_connections c on c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id
   where n.id::text=substring(v_event.source_key from 16) and n.workspace_id=v_event.workspace_id and n.connection_id=v_event.connection_id
     and n.notified_at is not null and n.cleared_at is null
     and public.marketplace_notification_enabled(n.workspace_id,n.connection_id,
       public.marketplace_notification_category(coalesce(n.notification_kind,case split_part(n.external_event_id,':',1)
         when 'message' then 'message' when 'offer_request_message' then 'offer_received' else 'other_status' end)),n.occurred_at)
 ))
 or (v_event.category<>'test' and not exists(select 1 from public.web_push_preferences where device_id=p_generation and workspace_id=v_event.workspace_id and v_event.category=any(categories)))
 then
  update public.web_push_deliveries set status='expired',finished_at=clock_timestamp(),last_error_class='permission',lease_until=null,claim_token=null where id=p_delivery_id;
  return null;
 end if;
 return jsonb_build_object('endpoint',v_device.endpoint,'p256dh',v_device.p256dh,'auth',v_device.auth,'keyId',v_device.vapid_key_id,'payload',v_event.payload,'expiresAt',v_event.expires_at);
end;
$function$;

create or replace function public.web_push_enqueue_event (
  p_source_key    text,
  p_workspace_id  uuid,
  p_category      text,
  p_connection_id uuid,
  p_target        jsonb,
  p_device_id     uuid  default null::uuid
)
  returns uuid
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_id uuid:=extensions.gen_random_uuid(); v_inserted uuid; v_title text; v_body text; v_kind text;
begin
 if p_category='test' and (p_device_id is null or p_target<>'{"kind":"settings"}'::jsonb or p_connection_id is not null) then raise exception 'Push test target denied' using errcode='22023'; end if;
 v_title:='Flipbase';
 v_body:=case p_category when 'test' then 'Deine Testbenachrichtigung ist angekommen.' when 'message' then 'Du hast eine neue Nachricht.' when 'order' then 'Eine neue Bestellung ist eingegangen.' when 'favorite' then 'Deine Inserate haben neue Favoriten.' when 'connection' then 'Eine Kontoverbindung braucht deine Anmeldung.' end;
 if p_category='message' and p_source_key ~ '^vinted-message:[1-9][0-9]{0,18}$' then
  select coalesce(n.notification_kind,case split_part(n.external_event_id,':',1)
    when 'message' then 'message' when 'offer_request_message' then 'offer_received' else 'other_status' end)
    into v_kind from public.marketplace_message_notifications n
    where n.id::text=substring(p_source_key from 16) and n.workspace_id=p_workspace_id and n.connection_id=p_connection_id
      and p_target=jsonb_build_object('kind','vinted_message','connectionId',n.connection_id,'conversationId',n.conversation_id);
  if found then
   v_title:=public.marketplace_notification_title(v_kind);
   v_body:=case v_kind when 'message' then 'Du hast eine neue Nachricht.'
     when 'offer_received' then 'Du hast einen neuen Preisvorschlag erhalten.'
     else 'Öffne dein Vinted-Postfach für Details.' end;
  end if;
 end if;
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

alter table public.marketplace_message_notification_baselines
  add column system_events_since timestamp with time zone default date_trunc('second'::text, clock_timestamp()) not null;

alter table public.marketplace_message_notification_baselines
  add constraint marketplace_message_notification_base_system_events_since_check check (isfinite(system_events_since));

alter table public.marketplace_message_notification_settings
  add column categories jsonb default '{}'::jsonb not null;

alter table public.marketplace_message_notification_settings
  add constraint marketplace_message_notification_settings_categories_check
    check
    (jsonb_typeof(categories) = 'object'::text and (categories - array['messages'::text, 'offers'::text, 'orders'::text, 'shipping'::text, 'payments'::text, 'feedback'::text,
    'other'::text]) = '{}'::jsonb and not jsonb_path_exists(categories, '$.*?(@.type() != "boolean")'::jsonpath));

alter table public.marketplace_message_notification_settings
  add column category_enabled_since jsonb default '{}'::jsonb not null;

alter table public.marketplace_message_notification_settings
  add constraint marketplace_message_notification_s_category_enabled_since_check
    check
    (jsonb_typeof(category_enabled_since) = 'object'::text and (category_enabled_since - array['messages'::text, 'offers'::text, 'orders'::text, 'shipping'::text, 'payments'::text,
    'feedback'::text, 'other'::text]) = '{}'::jsonb and not jsonb_path_exists(category_enabled_since, '$.*?((@.type() != "number" || @ < 0) || @ > 253402300799)'::jsonpath));

alter table public.marketplace_message_notifications
  add column notification_kind text;

alter table public.marketplace_message_notifications
  add constraint marketplace_message_notifications_check1 check (notification_kind is null or public.marketplace_notification_kind_valid(external_event_id, notification_kind));
