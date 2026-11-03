-- Kontoweise Nachrichtenmeldungen; bekannte Eingänge bleiben auch während einer Pause erhalten.
create table public.marketplace_message_notification_settings (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  enabled boolean not null default true,
  version bigint not null default 1 check (version > 0),
  enabled_since timestamptz check (enabled_since is null or isfinite(enabled_since)),
  unique (workspace_id, connection_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.marketplace_message_notification_settings is 'Kontoweise Nachrichten- und Kaufmeldungen; eine erneute Aktivierung meldet keine während der Pause eingegangene Historie.';
alter table public.marketplace_message_notification_settings enable row level security;
revoke all on public.marketplace_message_notification_settings from public, anon, authenticated;
grant select on public.marketplace_message_notification_settings to authenticated;
grant all on public.marketplace_message_notification_settings to service_role;
revoke all on sequence public.marketplace_message_notification_settings_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_message_notification_settings_id_seq to service_role;
create policy "Administrators read message settings" on public.marketplace_message_notification_settings for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Worker reads message settings" on public.marketplace_message_notification_settings for select to service_role using (true);
create policy "Worker inserts message settings" on public.marketplace_message_notification_settings for insert to service_role with check (true);
create policy "Worker updates message settings" on public.marketplace_message_notification_settings for update to service_role using (true) with check (true);
create policy "Worker deletes message settings" on public.marketplace_message_notification_settings for delete to service_role using (true);
create trigger marketplace_preserve_message_settings_scope before update on public.marketplace_message_notification_settings for each row execute function public.marketplace_preserve_favorite_notification_scope();

create or replace function public.marketplace_read_message_notification_settings(p_workspace_id uuid, p_connection_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_setting public.marketplace_message_notification_settings;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then
    raise exception 'Kontozugriff verweigert' using errcode='42501';
  end if;
  select * into v_setting from public.marketplace_message_notification_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'enabled',coalesce(v_setting.enabled,true),'version',coalesce(v_setting.version,0));
end;
$$;

-- Kontrollierter Schreibweg statt direkter Clientrechte auf Version und Zeitgrenze.
create or replace function public.marketplace_set_message_notification_settings(p_workspace_id uuid, p_connection_id uuid, p_enabled boolean, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
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
$$;
revoke all on function public.marketplace_read_message_notification_settings(uuid,uuid), public.marketplace_set_message_notification_settings(uuid,uuid,boolean,bigint) from public, anon;
grant execute on function public.marketplace_read_message_notification_settings(uuid,uuid), public.marketplace_set_message_notification_settings(uuid,uuid,boolean,bigint) to authenticated;
