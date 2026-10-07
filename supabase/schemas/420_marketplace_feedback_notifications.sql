-- Neue übernommene Vinted-Bewertungen melden; historische Kennungen bleiben als Basis erhalten.
create table public.marketplace_feedback_notifications (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  external_feedback_id text not null check (char_length(external_feedback_id) between 1 and 256),
  author_name text,
  rating integer check (rating between 0 and 5),
  is_automatic boolean,
  observed_at timestamptz not null check (isfinite(observed_at)),
  notified_at timestamptz check (isfinite(notified_at)),
  read boolean not null default false,
  cleared_at timestamptz check (isfinite(cleared_at)),
  unique (workspace_id, connection_id, external_feedback_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_feedback_notifications is 'Glockenmeldungen und bereits bekannte Bewertungsschlüssel; Erstbestand und gelöschter Verlauf werden nicht erneut gemeldet. Lesestatus gilt workspaceweit.';
create index marketplace_feedback_notifications_feed on public.marketplace_feedback_notifications(workspace_id, notified_at desc, id desc) where notified_at is not null and cleared_at is null;
create index marketplace_feedback_notifications_unread on public.marketplace_feedback_notifications(workspace_id) where notified_at is not null and cleared_at is null and not read;
alter table public.marketplace_feedback_notifications enable row level security;
revoke all on public.marketplace_feedback_notifications from public, anon, authenticated;
grant select on public.marketplace_feedback_notifications to authenticated;
grant all on public.marketplace_feedback_notifications to service_role;
revoke all on sequence public.marketplace_feedback_notifications_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_feedback_notifications_id_seq to service_role;
create policy "Administrators read feedback notifications" on public.marketplace_feedback_notifications for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads feedback notifications" on public.marketplace_feedback_notifications for select to service_role using (true);
create policy "Worker inserts feedback notifications" on public.marketplace_feedback_notifications for insert to service_role with check (true);
create policy "Worker updates feedback notifications" on public.marketplace_feedback_notifications for update to service_role using (true) with check (true);
create policy "Worker deletes feedback notifications" on public.marketplace_feedback_notifications for delete to service_role using (true);

create or replace function public.marketplace_record_feedback_notifications()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
declare v_has_baseline boolean := false; v_inserted integer;
begin
  if new.kind <> 'profile' or jsonb_typeof(new.body->'feedbacks') is distinct from 'array'
    or not exists (select 1 from public.marketplace_connections c where c.workspace_id = new.workspace_id and c.id = new.connection_id and c.marketplace = 'vinted') then return new; end if;
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
    new.observed_at,case when v_has_baseline then new.observed_at end
  from jsonb_array_elements(new.body->'feedbacks') feedback
  where jsonb_typeof(feedback->'id') = 'string' and char_length(btrim(feedback->>'id')) between 1 and 256
  on conflict (workspace_id,connection_id,external_feedback_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_has_baseline and v_inserted > 0 then
    perform realtime.send('{}'::jsonb,'feedback_notifications_changed','workspace:' || new.workspace_id::text || ':marketplace_feedback_notifications',true);
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_record_feedback_notifications() from public, anon, authenticated;
create trigger marketplace_record_feedback_notifications after insert or update on public.marketplace_account_entries for each row execute function public.marketplace_record_feedback_notifications();

create or replace function public.marketplace_read_feedback_notifications(p_workspace_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_items jsonb; v_unread bigint;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select count(*) into v_unread from public.marketplace_feedback_notifications where workspace_id = p_workspace_id and notified_at is not null and cleared_at is null and not read;
  with latest as (
    select n.*,c.display_name from public.marketplace_feedback_notifications n
    join public.marketplace_connections c on c.workspace_id = n.workspace_id and c.id = n.connection_id and c.marketplace = 'vinted'
    where n.workspace_id = p_workspace_id and n.notified_at is not null and n.cleared_at is null order by n.notified_at desc,n.id desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'connectionId',n.connection_id,'accountName',n.display_name,
    'observedAt',n.notified_at,'read',n.read,'authorName',n.author_name,'rating',n.rating,'isAutomatic',n.is_automatic)
    order by n.notified_at desc,n.id desc),'[]'::jsonb) into v_items from latest n;
  return jsonb_build_object('workspaceId',p_workspace_id,'items',v_items,'unreadCount',v_unread);
end;
$$;

create or replace function public.marketplace_mark_feedback_notifications(p_workspace_id uuid,p_notification_id text default null,p_clear boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_clear is null then raise exception 'Ungültige Meldungsaktion' using errcode = '22023'; end if;
  -- Kennungen aufbewahren, damit geleerte Meldungen beim nächsten Abruf nicht zurückkehren.
  update public.marketplace_feedback_notifications set read = true,cleared_at = case when p_clear then clock_timestamp() else cleared_at end
  where workspace_id = p_workspace_id and notified_at is not null and cleared_at is null
    and (p_clear or not read) and (p_notification_id is null or id::text = p_notification_id);
  if found then perform realtime.send('{}'::jsonb,'feedback_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_feedback_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.marketplace_read_feedback_notifications(uuid),public.marketplace_mark_feedback_notifications(uuid,text,boolean) from public, anon;
grant execute on function public.marketplace_read_feedback_notifications(uuid),public.marketplace_mark_feedback_notifications(uuid,text,boolean) to authenticated;
create policy "Administrators receive feedback notifications" on realtime.messages for select to authenticated
using (extension = 'broadcast' and topic = (select realtime.topic()) and exists(
  select 1 from public.workspaces w where realtime.messages.topic = 'workspace:' || w.id::text || ':marketplace_feedback_notifications' and public.marketplace_can_manage(w.id)
));
