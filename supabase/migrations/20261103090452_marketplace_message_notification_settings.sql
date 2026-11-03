-- Kontoweise Nachrichten-Benachrichtigung und belegte Kauf-/Statusmeldungen im Postfach.
-- Betroffen: marketplace_message_notification_settings und marketplace_message_notifications.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

alter table public.marketplace_message_notifications
  drop constraint marketplace_message_notifications_external_event_id_check;

create function public.marketplace_read_message_notification_settings (
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
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'enabled',coalesce(v_setting.enabled,true),'version',coalesce(v_setting.version,0));
end;
$function$;

revoke all on function public.marketplace_read_message_notification_settings(uuid, uuid) from public;

grant all on function public.marketplace_read_message_notification_settings(uuid, uuid) to authenticated;

grant all on function public.marketplace_read_message_notification_settings(uuid, uuid) to service_role;

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
  v_setting public.marketplace_message_notification_settings;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not exists(select 1 from public.marketplace_connections c where c.workspace_id=p_workspace_id and c.id=p_connection_id and c.marketplace='vinted' and c.status='connected' and c.external_account_id=p_external_account_id) then raise exception 'Kontoidentität stimmt nicht überein' using errcode='42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or octet_length(p_batch::text)>204800
    or (select count(*) from jsonb_object_keys(p_batch))<>5
    or exists(select 1 from jsonb_object_keys(p_batch) field where field<>all(array['version','observedAt','events','complete','coveredConversationIds']))
    or p_batch->'version' is distinct from '1'::jsonb or jsonb_typeof(p_batch->'complete') is distinct from 'boolean'
    or jsonb_typeof(p_batch->'observedAt') is distinct from 'string' or p_batch->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or jsonb_typeof(p_batch->'events') is distinct from 'array' or jsonb_array_length(p_batch->'events')>600
    or jsonb_typeof(p_batch->'coveredConversationIds') is distinct from 'array' or jsonb_array_length(p_batch->'coveredConversationIds')>3 then raise exception 'Ungültige Nachrichteneingänge' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_batch->'coveredConversationIds') entry where jsonb_typeof(entry)<>'string' or entry#>>'{}' !~ '^[1-9][0-9]{0,31}$')
    or (select count(*) from jsonb_array_elements(p_batch->'coveredConversationIds'))<>(select count(distinct entry) from jsonb_array_elements(p_batch->'coveredConversationIds') entry)
    or (select count(*) from jsonb_array_elements(p_batch->'events'))<>(select count(distinct (entry->>'externalConversationId',entry->>'externalId')) from jsonb_array_elements(p_batch->'events') entry) then raise exception 'Mehrdeutige Nachrichteneingänge' using errcode='22023'; end if;
  begin
    v_observed:=(p_batch->>'observedAt')::timestamptz;
    if not isfinite(v_observed) or v_observed>clock_timestamp()+interval '30 seconds' then raise exception 'Ungültige Eingangszeit' using errcode='22023'; end if;
    for v_event in select value from jsonb_array_elements(p_batch->'events') loop
      if jsonb_typeof(v_event)<>'object' or (select count(*) from jsonb_object_keys(v_event))<>5
        or exists(select 1 from jsonb_object_keys(v_event) field where field<>all(array['externalId','externalConversationId','occurredAt','direction','source']))
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
  select * into v_setting from public.marketplace_message_notification_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  -- Ein begrenzter, aber vollständig belegter Verlauf setzt den Zeitbezug. Ältere Folgeseiten bleiben still.
  if not v_had_reference and ((p_batch->>'complete')::boolean or jsonb_array_length(p_batch->'coveredConversationIds')>0) then
    insert into public.marketplace_message_notification_baselines(workspace_id,connection_id,external_account_id,first_observed_at,last_observed_at) values(p_workspace_id,p_connection_id,p_external_account_id,v_observed,v_observed) returning * into v_reference;
  elsif v_had_reference then
    update public.marketplace_message_notification_baselines set last_observed_at=v_observed where id=v_reference.id;
  end if;
  with added as (
    insert into public.marketplace_message_notifications(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id,conversation_id,occurred_at,observed_at,notified_at)
    select p_workspace_id,p_connection_id,p_external_account_id,entry->>'externalConversationId',entry->>'externalId',c.id,(entry->>'occurredAt')::timestamptz,v_observed,
      case when v_had_reference and coalesce(v_setting.enabled,true)
        and (entry->>'occurredAt')::timestamptz>v_reference.first_observed_at
        and (v_setting.enabled_since is null or (entry->>'occurredAt')::timestamptz>v_setting.enabled_since) then v_observed end
    from jsonb_array_elements(p_batch->'events') entry left join public.marketplace_account_entries c on c.workspace_id=p_workspace_id and c.connection_id=p_connection_id and c.kind='conversation' and c.external_id=entry->>'externalConversationId'
    on conflict(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id) do nothing returning notified_at,conversation_id
  ) select count(*) filter(where notified_at is not null),count(*) filter(where notified_at is not null and conversation_id is not null) into v_count,v_visible from added;
  if v_visible>0 then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return v_count;
end;
$function$;

create function public.marketplace_set_message_notification_settings (
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
  elsif v_setting.enabled<>p_enabled then
    update public.marketplace_message_notification_settings set enabled=p_enabled,version=version+1,enabled_since=clock_timestamp() where id=v_setting.id;
  end if;
  return public.marketplace_read_message_notification_settings(p_workspace_id,p_connection_id);
end;
$function$;

revoke all on function public.marketplace_set_message_notification_settings(uuid, uuid, boolean, bigint) from public;

grant all on function public.marketplace_set_message_notification_settings(uuid, uuid, boolean, bigint) to authenticated;

grant all on function public.marketplace_set_message_notification_settings(uuid, uuid, boolean, bigint) to service_role;

create table public.marketplace_message_notification_settings (
  id            bigint                   generated always as identity not null,
  workspace_id  uuid                     not null,
  connection_id uuid                     not null,
  enabled       boolean                  default true not null,
  version       bigint                   default 1 not null,
  enabled_since timestamp with time zone
);

comment on table public.marketplace_message_notification_settings is 'Kontoweise Nachrichten- und Kaufmeldungen; eine erneute Aktivierung meldet keine während der Pause eingegangene Historie.';

alter table public.marketplace_message_notification_settings
  enable row level security;

alter table public.marketplace_message_notification_settings
  add constraint marketplace_message_notificati_workspace_id_connection_id_fkey2 foreign key (workspace_id, connection_id)
    references public.marketplace_connections(workspace_id, id) on delete cascade;

alter table public.marketplace_message_notification_settings
  add constraint marketplace_message_notification_settings_enabled_since_check check (enabled_since is null or isfinite(enabled_since));

alter table public.marketplace_message_notification_settings
  add constraint marketplace_message_notification_settings_pkey primary key (id);

alter table public.marketplace_message_notification_settings
  add constraint marketplace_message_notification_settings_version_check check (version > 0);

alter table public.marketplace_message_notification_settings
  add constraint marketplace_message_notification_workspace_id_connection_id_key unique (workspace_id, connection_id);

grant select on public.marketplace_message_notification_settings to authenticated;

grant all on public.marketplace_message_notification_settings to service_role;

create trigger marketplace_preserve_message_settings_scope
  before update on public.marketplace_message_notification_settings
  for each row
  execute function public.marketplace_preserve_favorite_notification_scope();

create policy "Administrators read message settings" on public.marketplace_message_notification_settings
  for select
  to authenticated
  using (public.marketplace_can_manage(workspace_id));

create policy "Worker deletes message settings" on public.marketplace_message_notification_settings
  for delete
  to service_role
  using (true);

create policy "Worker inserts message settings" on public.marketplace_message_notification_settings
  for insert
  to service_role
  with check (true);

create policy "Worker reads message settings" on public.marketplace_message_notification_settings
  for select
  to service_role
  using (true);

create policy "Worker updates message settings" on public.marketplace_message_notification_settings
  for update
  to service_role
  using (true)
  with check (true);

alter table public.marketplace_message_notifications
  add constraint marketplace_message_notifications_external_event_id_check
    check (external_event_id ~ '^((message|offer_request_message):[1-9][0-9]{0,31}|(status_message|action_message|payment_message):([1-9][0-9]{0,31}|event:[0-9a-f]{64}))$'::text);

-- Explizite Rechte aus dem deklarativen Einstellungsschema.
revoke all on public.marketplace_message_notification_settings from public, anon, authenticated;
grant select on public.marketplace_message_notification_settings to authenticated;
grant all on public.marketplace_message_notification_settings to service_role;
revoke all on sequence public.marketplace_message_notification_settings_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_message_notification_settings_id_seq to service_role;
revoke all on function public.marketplace_read_message_notification_settings(uuid,uuid), public.marketplace_set_message_notification_settings(uuid,uuid,boolean,bigint) from public, anon;
grant execute on function public.marketplace_read_message_notification_settings(uuid,uuid), public.marketplace_set_message_notification_settings(uuid,uuid,boolean,bigint) to authenticated;
