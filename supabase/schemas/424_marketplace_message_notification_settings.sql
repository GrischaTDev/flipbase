-- Kontoweise Nachrichtenmeldungen; bekannte Eingänge bleiben auch während einer Pause erhalten.
create table public.marketplace_message_notification_settings (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  enabled boolean not null default true,
  version bigint not null default 1 check (version > 0),
  enabled_since timestamptz check (enabled_since is null or isfinite(enabled_since)),
  categories jsonb not null default '{}'::jsonb check (
    jsonb_typeof(categories) = 'object'
    and categories - array['messages','offers','orders','shipping','payments','feedback','other'] = '{}'::jsonb
    and not jsonb_path_exists(categories, '$.* ? (@.type() != "boolean")')
  ),
  category_enabled_since jsonb not null default '{}'::jsonb check (
    jsonb_typeof(category_enabled_since) = 'object'
    and category_enabled_since - array['messages','offers','orders','shipping','payments','feedback','other'] = '{}'::jsonb
    and not jsonb_path_exists(category_enabled_since, '$.* ? (@.type() != "number" || @ < 0 || @ > 253402300799)')
  ),
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

-- Feste Facharten statt Anbietertexten; unbekannte Systemarten bleiben abschaltbar.
create or replace function public.marketplace_notification_category(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'message' then 'messages'
    when p_kind = 'offer_received' then 'offers'
    when p_kind in ('sale_sold','purchase_created','order_cancelled','transaction_cancelled','item_relisted','order_completed','order_suspended','issue_reported') then 'orders'
    when p_kind in ('shipping_label_ready','shipment_sent','ready_for_pickup','delivered','return_shipped') then 'shipping'
    when p_kind in ('refund_started','refund_completed','refund_accepted') then 'payments'
    when p_kind in ('feedback_received','feedback_sent') then 'feedback'
    else 'other' end;
$$;

create or replace function public.marketplace_notification_categories(p_enabled boolean,p_categories jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('messages',coalesce(p_enabled,true),'offers',coalesce(p_enabled,true),
    'orders',coalesce(p_enabled,true),'shipping',coalesce(p_enabled,true),'payments',coalesce(p_enabled,true),
    'feedback',true,'other',coalesce(p_enabled,true)) || coalesce(p_categories,'{}'::jsonb);
$$;

-- Auch ein bereits eingereihter Push prüft vor dem Versand die aktuelle Kategorie.
create or replace function public.marketplace_notification_enabled(p_workspace_id uuid,p_connection_id uuid,p_category text,p_occurred_at timestamptz default null)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_category = any(array['messages','offers','orders','shipping','payments','feedback','other'])
    and coalesce((public.marketplace_notification_categories(s.enabled,s.categories)->>p_category)::boolean,true)
    and (p_occurred_at is null or extract(epoch from p_occurred_at) >= coalesce(
      (s.category_enabled_since->>p_category)::numeric,
      case when p_category<>'feedback' then extract(epoch from s.enabled_since) end,0))
  from (select 1) anchor left join public.marketplace_message_notification_settings s
    on s.workspace_id=p_workspace_id and s.connection_id=p_connection_id;
$$;

create or replace function public.marketplace_read_message_notification_settings(p_workspace_id uuid, p_connection_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
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
$$;

-- Kontrollierter Schreibweg statt direkter Clientrechte auf Version und Zeitgrenze.
create or replace function public.marketplace_set_message_notification_settings(p_workspace_id uuid, p_connection_id uuid, p_enabled boolean, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_setting public.marketplace_message_notification_settings;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then
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
$$;
revoke all on function public.marketplace_read_message_notification_settings(uuid,uuid), public.marketplace_set_message_notification_settings(uuid,uuid,boolean,bigint) from public, anon;
grant execute on function public.marketplace_read_message_notification_settings(uuid,uuid), public.marketplace_set_message_notification_settings(uuid,uuid,boolean,bigint) to authenticated;

create or replace function public.marketplace_set_notification_category_settings(p_workspace_id uuid,p_connection_id uuid,p_category text,p_enabled boolean,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_setting public.marketplace_message_notification_settings; v_categories jsonb; v_since jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_workspace_authorization_valid(p_workspace_id,(select auth.uid())) then
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
$$;
revoke all on function public.marketplace_notification_category(text),public.marketplace_notification_categories(boolean,jsonb),
  public.marketplace_notification_enabled(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.marketplace_notification_category(text),public.marketplace_notification_categories(boolean,jsonb),
  public.marketplace_notification_enabled(uuid,uuid,text,timestamptz) to authenticated,service_role;
revoke all on function public.marketplace_set_notification_category_settings(uuid,uuid,text,boolean,bigint) from public,anon;
grant execute on function public.marketplace_set_notification_category_settings(uuid,uuid,text,boolean,bigint) to authenticated;
