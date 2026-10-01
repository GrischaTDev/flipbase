-- Dauerhafte Favoritenmeldungen aus tatsächlich übernommenen Inseratbeobachtungen.
-- Betroffen: neue Meldungs-/Einstellungs-/Ereignistabellen sowie interne Inseratfassung.
create table public.marketplace_favorite_notification_settings (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  enabled boolean not null default true,
  version bigint not null default 1 check (version > 0),
  baseline_pending boolean not null default true,
  unique (workspace_id, connection_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_favorite_notification_settings is 'Kontoweise In-App-Favoritenmeldungen ohne Ton; erste Beobachtung nach Aktivierung setzt nur die Basis.';

create table public.marketplace_favorite_notifications (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  observed_at timestamptz not null check (isfinite(observed_at)),
  read boolean not null default false,
  unique (workspace_id, connection_id, observed_at),
  unique (workspace_id, connection_id, id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_favorite_notifications is 'Eine dauerhafte Glockenmeldung pro Konto und übernommenem Beobachtungsbatch; Lesestatus gilt workspaceweit.';
create index marketplace_favorite_notifications_feed on public.marketplace_favorite_notifications(workspace_id, observed_at desc, id desc);
create index marketplace_favorite_notifications_unread on public.marketplace_favorite_notifications(workspace_id) where not read;

create table public.marketplace_favorite_notification_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  notification_id bigint not null,
  entry_id uuid not null,
  external_listing_id text not null,
  title text not null,
  previous_favorites bigint not null check (previous_favorites >= 0 and previous_favorites <= 9007199254740991),
  favorites bigint not null check (favorites > previous_favorites and favorites <= 9007199254740991),
  observed_at timestamptz not null check (isfinite(observed_at)),
  setting_version bigint not null check (setting_version > 0),
  unique (workspace_id, connection_id, external_listing_id, observed_at),
  foreign key (workspace_id, connection_id, notification_id) references public.marketplace_favorite_notifications(workspace_id, connection_id, id) on delete cascade
);
comment on table public.marketplace_favorite_notification_events is 'Bekannte Nettoanstiege akzeptierter Inseratzeilen; Eintragskennung bleibt auch bei später entferntem Inserat für Direktlinks erhalten.';
create index marketplace_favorite_notification_events_summary on public.marketplace_favorite_notification_events(workspace_id, connection_id, notification_id, id);

-- Die Fassung gehört zur internen Meldungsbasis, nicht zu Vinted-Merkmalen im JSON.
-- Teilabrufe dürfen nach Aktivierung später erstmals wieder auftauchende alte
-- Inserate nicht mit historischen Anstiegen melden.
alter table public.marketplace_account_entries add column favorite_notification_version bigint;
comment on column public.marketplace_account_entries.favorite_notification_version is 'Einstellungsfassung der letzten akzeptierten Inseratbeobachtung; verhindert nachträgliche Meldungen nach Teilabrufen.';

alter table public.marketplace_favorite_notification_settings enable row level security;
alter table public.marketplace_favorite_notifications enable row level security;
alter table public.marketplace_favorite_notification_events enable row level security;
revoke all on public.marketplace_favorite_notification_settings, public.marketplace_favorite_notifications, public.marketplace_favorite_notification_events from public, anon, authenticated;
grant select on public.marketplace_favorite_notification_settings, public.marketplace_favorite_notifications, public.marketplace_favorite_notification_events to authenticated;
grant all on public.marketplace_favorite_notification_settings, public.marketplace_favorite_notifications, public.marketplace_favorite_notification_events to service_role;
revoke all on sequence public.marketplace_favorite_notification_settings_id_seq, public.marketplace_favorite_notifications_id_seq, public.marketplace_favorite_notification_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_favorite_notification_settings_id_seq, public.marketplace_favorite_notifications_id_seq, public.marketplace_favorite_notification_events_id_seq to service_role;

create policy "Administrators read favorite settings" on public.marketplace_favorite_notification_settings for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads favorite settings" on public.marketplace_favorite_notification_settings for select to service_role using (true);
create policy "Worker inserts favorite settings" on public.marketplace_favorite_notification_settings for insert to service_role with check (true);
create policy "Worker updates favorite settings" on public.marketplace_favorite_notification_settings for update to service_role using (true) with check (true);
create policy "Worker deletes favorite settings" on public.marketplace_favorite_notification_settings for delete to service_role using (true);
create policy "Administrators read favorite notifications" on public.marketplace_favorite_notifications for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads favorite notifications" on public.marketplace_favorite_notifications for select to service_role using (true);
create policy "Worker inserts favorite notifications" on public.marketplace_favorite_notifications for insert to service_role with check (true);
create policy "Worker updates favorite notifications" on public.marketplace_favorite_notifications for update to service_role using (true) with check (true);
create policy "Worker deletes favorite notifications" on public.marketplace_favorite_notifications for delete to service_role using (true);
create policy "Administrators read favorite events" on public.marketplace_favorite_notification_events for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads favorite events" on public.marketplace_favorite_notification_events for select to service_role using (true);
create policy "Worker inserts favorite events" on public.marketplace_favorite_notification_events for insert to service_role with check (true);
create policy "Worker updates favorite events" on public.marketplace_favorite_notification_events for update to service_role using (true) with check (true);
create policy "Worker deletes favorite events" on public.marketplace_favorite_notification_events for delete to service_role using (true);

create or replace function public.marketplace_preserve_favorite_notification_scope()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.connection_id is distinct from old.connection_id then
    raise exception 'Meldungszuordnung darf nicht geändert werden' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger marketplace_preserve_favorite_settings_scope before update on public.marketplace_favorite_notification_settings for each row execute function public.marketplace_preserve_favorite_notification_scope();
create trigger marketplace_preserve_favorite_notifications_scope before update on public.marketplace_favorite_notifications for each row execute function public.marketplace_preserve_favorite_notification_scope();
create trigger marketplace_preserve_favorite_events_scope before update on public.marketplace_favorite_notification_events for each row execute function public.marketplace_preserve_favorite_notification_scope();

create or replace function public.marketplace_known_favorite_count(p_body jsonb)
returns bigint language plpgsql immutable security invoker set search_path = '' as $$
declare v_count numeric;
begin
  if jsonb_typeof(p_body->'metrics'->'favorites') is distinct from 'number' then return null; end if;
  v_count := (p_body->'metrics'->>'favorites')::numeric;
  if v_count < 0 or v_count > 9007199254740991 or trunc(v_count) <> v_count then return null; end if;
  return v_count::bigint;
end;
$$;

-- Nur die Import-RPC darf diesen transaktionslokalen Kontext vorbereiten.
-- Sie hält bereits dieselbe Kontosperre wie der Einstellungswechsel.
create or replace function public.marketplace_prepare_favorite_import(p_workspace_id uuid, p_connection_id uuid, p_observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare v_version bigint;
begin
  insert into public.marketplace_favorite_notification_settings(workspace_id, connection_id)
    values(p_workspace_id, p_connection_id) on conflict (workspace_id, connection_id) do nothing;
  select version into v_version from public.marketplace_favorite_notification_settings
    where workspace_id = p_workspace_id and connection_id = p_connection_id for update;
  perform set_config('flipbase.favorite_notification_import', jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'observedAt',p_observed_at,'version',v_version)::text, true);
end;
$$;

create or replace function public.marketplace_stamp_favorite_notification_version()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
declare v_context jsonb;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if new.kind = 'publication' and v_context->>'workspaceId' = new.workspace_id::text
    and v_context->>'connectionId' = new.connection_id::text
    and (v_context->>'observedAt')::timestamptz = new.observed_at then
    new.favorite_notification_version := (v_context->>'version')::bigint;
  end if;
  return new;
end;
$$;
create trigger marketplace_stamp_favorite_notification_version before insert or update on public.marketplace_account_entries for each row execute function public.marketplace_stamp_favorite_notification_version();

-- AFTER UPDATE läuft ausschließlich für Zeilen, die der bedingte Upsert wirklich
-- übernommen hat; der BEFORE-Trigger allein würde auch verworfene INSERT-Versuche sehen.
create or replace function public.marketplace_record_favorite_notification_event()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
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
  if v_notification_id is null then
    select id into v_notification_id from public.marketplace_favorite_notifications
      where workspace_id = new.workspace_id and connection_id = new.connection_id and observed_at = new.observed_at;
  end if;
  insert into public.marketplace_favorite_notification_events(workspace_id,connection_id,notification_id,entry_id,external_listing_id,title,previous_favorites,favorites,observed_at,setting_version)
    values(new.workspace_id,new.connection_id,v_notification_id,new.id,new.external_id,coalesce(new.body->>'title','Inserat'),v_previous,v_favorites,new.observed_at,v_setting.version)
    on conflict (workspace_id,connection_id,external_listing_id,observed_at) do nothing;
  return new;
end;
$$;
create trigger marketplace_record_favorite_notification_event after update on public.marketplace_account_entries for each row execute function public.marketplace_record_favorite_notification_event();

create or replace function public.marketplace_finalize_favorite_import(p_workspace_id uuid, p_connection_id uuid, p_observed_at timestamptz, p_publications_success boolean)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare v_context jsonb;
begin
  v_context := nullif(current_setting('flipbase.favorite_notification_import',true),'')::jsonb;
  if p_publications_success then
    update public.marketplace_favorite_notification_settings set baseline_pending = false
      where workspace_id = p_workspace_id and connection_id = p_connection_id and enabled
        and version = (v_context->>'version')::bigint;
  end if;
  if exists(select 1 from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and connection_id = p_connection_id and observed_at = p_observed_at) then
    -- Ausschließlich Invalidierung: keine Inserat-, Konto- oder Kennzahlendetails.
    perform realtime.send('{}'::jsonb,'favorite_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_notifications',true);
  end if;
  perform set_config('flipbase.favorite_notification_import','',true);
end;
$$;

create or replace function public.marketplace_read_favorite_notification_settings(p_workspace_id uuid, p_connection_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_setting public.marketplace_favorite_notification_settings;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted') then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;
  select * into v_setting from public.marketplace_favorite_notification_settings where workspace_id = p_workspace_id and connection_id = p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'enabled',coalesce(v_setting.enabled,true),'version',coalesce(v_setting.version,0));
end;
$$;

-- SECURITY DEFINER ist nur für kontrollierte Einstellungen nötig; direkte
-- Client-Schreibrechte würden Importfassungen und Ausgangsbasis manipulierbar machen.
create or replace function public.marketplace_set_favorite_notification_settings(p_workspace_id uuid, p_connection_id uuid, p_enabled boolean, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_setting public.marketplace_favorite_notification_settings;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.marketplace_connections where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_enabled is null or p_expected_version is null or p_expected_version < 0 then raise exception 'Ungültige Meldungseinstellung' using errcode = '22023'; end if;
  select * into v_setting from public.marketplace_favorite_notification_settings where workspace_id = p_workspace_id and connection_id = p_connection_id for update;
  if coalesce(v_setting.version,0) <> p_expected_version then raise exception 'Meldungseinstellung wurde zwischenzeitlich geändert' using errcode = '40001'; end if;
  if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if v_setting.id is null then
    insert into public.marketplace_favorite_notification_settings(workspace_id,connection_id,enabled) values(p_workspace_id,p_connection_id,p_enabled);
  elsif v_setting.enabled <> p_enabled then
    update public.marketplace_favorite_notification_settings set enabled = p_enabled, version = version + 1, baseline_pending = true where id = v_setting.id;
  end if;
  return public.marketplace_read_favorite_notification_settings(p_workspace_id,p_connection_id);
end;
$$;

create or replace function public.marketplace_read_favorite_notifications(p_workspace_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_items jsonb; v_unread bigint;
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select count(*) into v_unread from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and not read;
  with latest as (
    select n.*, c.display_name from public.marketplace_favorite_notifications n
      join public.marketplace_connections c on c.workspace_id = n.workspace_id and c.id = n.connection_id and c.marketplace = 'vinted'
    where n.workspace_id = p_workspace_id order by n.observed_at desc,n.id desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id::text,'connectionId',n.connection_id,'accountName',n.display_name,'observedAt',n.observed_at,'read',n.read,
    'listings',coalesce((select jsonb_agg(jsonb_build_object('entryId',e.entry_id,'title',e.title,'previousFavorites',e.previous_favorites,'favorites',e.favorites) order by e.id)
      from public.marketplace_favorite_notification_events e where e.workspace_id = n.workspace_id and e.connection_id = n.connection_id and e.notification_id = n.id),'[]'::jsonb))
    order by n.observed_at desc,n.id desc),'[]'::jsonb) into v_items from latest n;
  return jsonb_build_object('workspaceId',p_workspace_id,'items',v_items,'unreadCount',v_unread);
end;
$$;

-- Der kontrollierte Schreibweg erlaubt ausschließlich gelesen markieren/löschen.
-- Ereignisdetails und Zuordnung bleiben für Browserclients unveränderbar.
create or replace function public.marketplace_mark_favorite_notifications(p_workspace_id uuid, p_notification_id text default null, p_clear boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_clear is null then raise exception 'Ungültige Meldungsaktion' using errcode = '22023'; end if;
  if p_clear then
    delete from public.marketplace_favorite_notifications where workspace_id = p_workspace_id and (p_notification_id is null or id::text = p_notification_id);
  else
    update public.marketplace_favorite_notifications set read = true where workspace_id = p_workspace_id and not read and (p_notification_id is null or id::text = p_notification_id);
  end if;
  if found then perform realtime.send('{}'::jsonb,'favorite_notifications_changed','workspace:' || p_workspace_id::text || ':marketplace_notifications',true); end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.marketplace_preserve_favorite_notification_scope(), public.marketplace_known_favorite_count(jsonb), public.marketplace_stamp_favorite_notification_version(), public.marketplace_record_favorite_notification_event(), public.marketplace_prepare_favorite_import(uuid,uuid,timestamptz), public.marketplace_finalize_favorite_import(uuid,uuid,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.marketplace_known_favorite_count(jsonb), public.marketplace_prepare_favorite_import(uuid,uuid,timestamptz), public.marketplace_finalize_favorite_import(uuid,uuid,timestamptz,boolean) to service_role;
revoke all on function public.marketplace_read_favorite_notification_settings(uuid,uuid), public.marketplace_set_favorite_notification_settings(uuid,uuid,boolean,bigint), public.marketplace_read_favorite_notifications(uuid), public.marketplace_mark_favorite_notifications(uuid,text,boolean) from public, anon;
grant execute on function public.marketplace_read_favorite_notification_settings(uuid,uuid), public.marketplace_set_favorite_notification_settings(uuid,uuid,boolean,bigint), public.marketplace_read_favorite_notifications(uuid), public.marketplace_mark_favorite_notifications(uuid,text,boolean) to authenticated;

-- Kein Senderecht für Clients: nur der Server invalidiert den privaten Kanal.
create policy "Administrators receive favorite notifications" on realtime.messages for select to authenticated
using (extension = 'broadcast' and topic = (select realtime.topic()) and exists(
  select 1 from public.workspaces w where realtime.messages.topic = 'workspace:' || w.id::text || ':marketplace_notifications' and public.marketplace_can_manage(w.id)
));
