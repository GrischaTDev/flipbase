-- Belegte Nachrichteneingänge dauerhaft merken; die Glocke ändert keinen Provider-Lesestatus.
create table public.marketplace_message_notification_baselines (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  first_observed_at timestamptz not null check (isfinite(first_observed_at)),
  last_observed_at timestamptz not null check (isfinite(last_observed_at) and last_observed_at >= first_observed_at),
  unique (workspace_id,connection_id,external_account_id),
  foreign key (workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade
);
comment on table public.marketplace_message_notification_baselines is 'Erste belegte Beobachtung je Kontoidentität; später geladene ältere Historie bleibt still.';
alter table public.marketplace_message_notification_baselines enable row level security;
revoke all on public.marketplace_message_notification_baselines from public,anon,authenticated;
grant all on public.marketplace_message_notification_baselines to service_role;
revoke all on sequence public.marketplace_message_notification_baselines_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_message_notification_baselines_id_seq to service_role;
create policy "Worker reads message references" on public.marketplace_message_notification_baselines for select to service_role using (true);
create policy "Worker inserts message references" on public.marketplace_message_notification_baselines for insert to service_role with check (true);
create policy "Worker updates message references" on public.marketplace_message_notification_baselines for update to service_role using (true) with check (true);
create policy "Worker deletes message references" on public.marketplace_message_notification_baselines for delete to service_role using (true);

create table public.marketplace_message_notifications (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  external_conversation_id text not null check (external_conversation_id ~ '^[1-9][0-9]{0,31}$'),
  external_event_id text not null check (external_event_id ~ '^(message|offer_request_message):[1-9][0-9]{0,31}$'),
  conversation_id uuid,
  occurred_at timestamptz not null check (isfinite(occurred_at)),
  observed_at timestamptz not null check (isfinite(observed_at) and occurred_at <= observed_at),
  notified_at timestamptz check (isfinite(notified_at)),
  read boolean not null default false,
  cleared_at timestamptz check (isfinite(cleared_at)),
  unique (workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id),
  foreign key (workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade,
  foreign key (workspace_id,connection_id,conversation_id) references public.marketplace_account_entries(workspace_id,connection_id,id) on delete set null (conversation_id)
);
comment on table public.marketplace_message_notifications is 'Belegte Eingangskennungen ohne private Texte; ungelöste Gespräche bleiben bis zum Import verborgen. Lesestatus gilt workspaceweit.';
create index marketplace_message_notifications_feed on public.marketplace_message_notifications(workspace_id,notified_at desc,id desc) where notified_at is not null and cleared_at is null;
create index marketplace_message_notifications_pending on public.marketplace_message_notifications(workspace_id,connection_id,external_conversation_id) where conversation_id is null;
alter table public.marketplace_message_notifications enable row level security;
revoke all on public.marketplace_message_notifications from public,anon,authenticated;
grant select on public.marketplace_message_notifications to authenticated;
grant all on public.marketplace_message_notifications to service_role;
revoke all on sequence public.marketplace_message_notifications_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_message_notifications_id_seq to service_role;
create policy "Administrators read message notifications" on public.marketplace_message_notifications for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads message notifications" on public.marketplace_message_notifications for select to service_role using (true);
create policy "Worker inserts message notifications" on public.marketplace_message_notifications for insert to service_role with check (true);
create policy "Worker updates message notifications" on public.marketplace_message_notifications for update to service_role using (true) with check (true);
create policy "Worker deletes message notifications" on public.marketplace_message_notifications for delete to service_role using (true);

create or replace function public.marketplace_record_message_event_batch(p_workspace_id uuid,p_connection_id uuid,p_external_account_id text,p_batch jsonb)
returns integer language plpgsql volatile security invoker set search_path = '' as $$
declare v_observed timestamptz; v_reference public.marketplace_message_notification_baselines; v_had_reference boolean; v_event jsonb; v_count integer; v_visible integer;
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
        or jsonb_typeof(v_event->'externalId') is distinct from 'string' or v_event->>'externalId' !~ '^(message|offer_request_message):[1-9][0-9]{0,31}$'
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
    insert into public.marketplace_message_notification_baselines(workspace_id,connection_id,external_account_id,first_observed_at,last_observed_at) values(p_workspace_id,p_connection_id,p_external_account_id,v_observed,v_observed) returning * into v_reference;
  elsif v_had_reference then
    update public.marketplace_message_notification_baselines set last_observed_at=v_observed where id=v_reference.id;
  end if;
  with added as (
    insert into public.marketplace_message_notifications(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id,conversation_id,occurred_at,observed_at,notified_at)
    select p_workspace_id,p_connection_id,p_external_account_id,entry->>'externalConversationId',entry->>'externalId',c.id,(entry->>'occurredAt')::timestamptz,v_observed,
      case when v_had_reference and (entry->>'occurredAt')::timestamptz>v_reference.first_observed_at then v_observed end
    from jsonb_array_elements(p_batch->'events') entry left join public.marketplace_account_entries c on c.workspace_id=p_workspace_id and c.connection_id=p_connection_id and c.kind='conversation' and c.external_id=entry->>'externalConversationId'
    on conflict(workspace_id,connection_id,external_account_id,external_conversation_id,external_event_id) do nothing returning notified_at,conversation_id
  ) select count(*) filter(where notified_at is not null),count(*) filter(where notified_at is not null and conversation_id is not null) into v_count,v_visible from added;
  if v_visible>0 then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return v_count;
end;
$$;
revoke all on function public.marketplace_record_message_event_batch(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_record_message_event_batch(uuid,uuid,text,jsonb) to service_role;

create or replace function public.marketplace_resolve_message_notification_conversation()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.kind<>'conversation' then return new; end if;
  update public.marketplace_message_notifications n set conversation_id=new.id where n.workspace_id=new.workspace_id and n.connection_id=new.connection_id and n.external_conversation_id=new.external_id and n.conversation_id is null
    and exists(select 1 from public.marketplace_connections c where c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id);
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || new.workspace_id::text || ':marketplace_message_notifications',true); end if;
  return new;
end;
$$;
revoke all on function public.marketplace_resolve_message_notification_conversation() from public,anon,authenticated;
create trigger marketplace_resolve_message_notification_conversation after insert or update on public.marketplace_account_entries for each row execute function public.marketplace_resolve_message_notification_conversation();

create or replace function public.marketplace_read_message_notifications(p_workspace_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
    'eventKind',split_part(n.external_event_id,':',1),'observedAt',n.notified_at,'read',n.read) order by n.notified_at desc,n.id desc),'[]'::jsonb) into v_items from latest n;
  return jsonb_build_object('workspaceId',p_workspace_id,'items',v_items,'unreadCount',v_unread);
end;
$$;
create or replace function public.marketplace_mark_message_notifications(p_workspace_id uuid,p_notification_id text default null,p_clear boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_clear is null or (p_notification_id is not null and p_notification_id !~ '^[1-9][0-9]{0,18}$') then raise exception 'Ungültige Meldungsaktion' using errcode='22023'; end if;
  update public.marketplace_message_notifications n set read=true,cleared_at=case when p_clear then clock_timestamp() else cleared_at end where n.workspace_id=p_workspace_id and n.notified_at is not null and n.cleared_at is null and (p_clear or not n.read) and (p_notification_id is null or n.id::text=p_notification_id)
    and exists(select 1 from public.marketplace_connections c where c.workspace_id=n.workspace_id and c.id=n.connection_id and c.external_account_id=n.external_account_id);
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_read_message_notifications(uuid),public.marketplace_mark_message_notifications(uuid,text,boolean) from public,anon;
grant execute on function public.marketplace_read_message_notifications(uuid),public.marketplace_mark_message_notifications(uuid,text,boolean) to authenticated;
create policy "Administrators receive message notifications" on realtime.messages for select to authenticated using (extension='broadcast' and topic=(select realtime.topic()) and exists(select 1 from public.workspaces w where realtime.messages.topic='workspace:' || w.id::text || ':marketplace_message_notifications' and public.marketplace_can_manage(w.id)));

create or replace function public.marketplace_mark_conversation_read(p_workspace_id uuid,p_connection_id uuid,p_conversation_id uuid,p_read_version text,p_observed_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_entry public.marketplace_account_entries; v_version text; v_account text;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_read_version is null or p_read_version !~ '^[a-f0-9]{32}$' or p_observed_at is null or not isfinite(p_observed_at) or p_observed_at>clock_timestamp() then raise exception 'Ungültiger Lesebeleg' using errcode='22023'; end if;
  select e.* into v_entry from public.marketplace_account_entries e join public.marketplace_connections c on c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted' and c.status='connected'
    where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id and e.id=p_conversation_id and e.kind='conversation' for update of e;
  if not found then raise exception 'Gespräch nicht verfügbar' using errcode='42501'; end if;
  v_version:=public.marketplace_conversation_read_version(p_workspace_id,p_connection_id,p_conversation_id);
  -- Ein neuer Eingang während des Ladens wird nicht durch einen verspäteten Abschluss als gelesen markiert.
  if p_read_version is distinct from v_version or v_entry.body->>'detailCheckedAt' is null or (v_entry.body->>'detailCheckedAt')::timestamptz<p_observed_at then
    return jsonb_build_object('ok',true,'marked',false);
  end if;
  update public.marketplace_account_entries set conversation_read_version=v_version where id=v_entry.id;
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  update public.marketplace_message_notifications n set read=true where n.workspace_id=p_workspace_id and n.connection_id=p_connection_id and n.conversation_id=p_conversation_id
    and n.external_account_id=v_account and not n.read and n.observed_at<=p_observed_at and n.notified_at is not null and n.cleared_at is null;
  if found then perform realtime.send('{}'::jsonb,'message_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_message_notifications',true); end if;
  return jsonb_build_object('ok',true,'marked',true);
end;
$$;
revoke all on function public.marketplace_mark_conversation_read(uuid,uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.marketplace_mark_conversation_read(uuid,uuid,uuid,text,timestamptz) to authenticated;
