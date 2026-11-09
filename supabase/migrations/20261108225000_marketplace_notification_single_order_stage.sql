-- Zweck: Einmalige Vinted-Bestellstationen (z. B. „Artikel verkauft“) je Gespräch nur einmal melden.
-- Vinted ersetzt beim Anfordern des Versandscheins die Aktionsmeldung „Verkauft (vor dem … verschicken)“
-- durch eine Statusmeldung „Verkauft“ ohne feste Kennung. Beide wurden bisher als eigene Verkäufe gemeldet.
-- Betroffen: Funktion public.marketplace_record_message_event_batch; die Zeilen werden weiter gespeichert,
-- spätere Wiederholungen einer bereits gemeldeten Station erhalten nur kein notified_at.

create or replace function public.marketplace_record_message_event_batch(p_workspace_id uuid,p_connection_id uuid,p_external_account_id text,p_batch jsonb)
returns integer language plpgsql volatile security invoker set search_path = '' as $$
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
  with kinds as (
    select entry,coalesce(entry->>'notificationKind',case split_part(entry->>'externalId',':',1)
      when 'message' then 'message' when 'offer_request_message' then 'offer_received' else 'other_status' end) as kind
    from jsonb_array_elements(p_batch->'events') entry
  ), canonical as (
    -- Vinted ersetzt Bestellmeldungen beim nächsten Schritt durch neue Meldungen ohne feste Kennung.
    -- Eine bereits gemeldete Bestellstation wird deshalb je Gespräch nicht erneut gemeldet;
    -- still gespeicherte Vorläufer (vor dem Bezugszeitpunkt oder bei abgeschalteter Kategorie) sperren nicht.
    select entry,kind,kind in ('sale_sold','purchase_created','shipping_label_ready','shipment_sent','ready_for_pickup','delivered','order_completed','order_cancelled','transaction_cancelled','item_relisted','refund_started','refund_completed','return_shipped','feedback_received','feedback_sent')
      and (row_number() over (partition by entry->>'externalConversationId',kind order by entry->>'occurredAt',entry->>'externalId')>1
        or exists(select 1 from public.marketplace_message_notifications earlier
          where earlier.workspace_id=p_workspace_id and earlier.connection_id=p_connection_id and earlier.external_account_id=p_external_account_id
            and earlier.external_conversation_id=entry->>'externalConversationId' and earlier.notification_kind=kind
            and earlier.external_event_id<>entry->>'externalId' and earlier.notified_at is not null)) as repeated_stage
    from kinds
  ), added as (
    insert into public.marketplace_message_notifications(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id,notification_kind,conversation_id,occurred_at,observed_at,notified_at)
    select p_workspace_id,p_connection_id,p_external_account_id,entry->>'externalConversationId',entry->>'externalId',canonical.kind,c.id,(entry->>'occurredAt')::timestamptz,v_observed,
      case when v_had_reference
        and (entry->>'occurredAt')::timestamptz>v_reference.first_observed_at
        and (canonical.kind in ('message','offer_received') or (entry->>'occurredAt')::timestamptz>=v_reference.system_events_since)
        -- Cloudbewertungen besitzt bereits die Profilquelle; lokale Konten erhalten sie im Chat.
        and (canonical.kind<>'feedback_received' or exists(select 1 from public.marketplace_connections feedback_connection
          where feedback_connection.workspace_id=p_workspace_id and feedback_connection.id=p_connection_id and feedback_connection.execution_mode='local'))
        -- „Artikel nicht verfügbar“ folgt nur auf ein erledigtes Angebot und bleibt still im Verlauf.
        and canonical.kind<>'item_unavailable'
        and not canonical.repeated_stage
        and public.marketplace_notification_enabled(p_workspace_id,p_connection_id,public.marketplace_notification_category(canonical.kind),(entry->>'occurredAt')::timestamptz)
        then v_observed end
    from canonical left join public.marketplace_account_entries c on c.workspace_id=p_workspace_id and c.connection_id=p_connection_id and c.kind='conversation' and c.external_id=entry->>'externalConversationId'
    on conflict(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id) do nothing returning notified_at,conversation_id
  ) select count(*) filter(where notified_at is not null),count(*) filter(where notified_at is not null and conversation_id is not null) into v_count,v_visible from added;
  if v_visible>0 then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return v_count;
end;
$$;
revoke all on function public.marketplace_record_message_event_batch(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_record_message_event_batch(uuid,uuid,text,jsonb) to service_role;
