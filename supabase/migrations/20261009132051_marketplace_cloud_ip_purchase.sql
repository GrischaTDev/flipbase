-- Zweck: Einmalige IPRoyal-Nachbuchungen und optionale IP-Paketgrenzen.
-- Betrifft: marketplace_cloud_ip_purchases, marketplace_cloud_ip_allowances und Cloud-Einrichtung.
-- Aus Supabase db diff erzeugt; explizite Rechte unverändert aus dem Schema übernommen.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_cloud_ip_limit_reached (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  set search_path to ''
  as $function$
  select exists(select 1 from public.marketplace_cloud_ip_allowances allowance where allowance.workspace_id=p_workspace_id
    and (select count(*) from public.marketplace_cloud_setups setup where setup.workspace_id=p_workspace_id and setup.state<>'cancelled')>=allowance.ip_limit);
$function$;

revoke all on function public.marketplace_cloud_ip_limit_reached(uuid) from public;

grant all on function public.marketplace_cloud_ip_limit_reached(uuid) to service_role;

create function public.marketplace_cloud_ip_purchase (
  p_action        text,
  p_workspace_id  uuid,
  p_request_id    uuid,
  p_connection_id uuid,
  p_display_name  text,
  p_user_id       uuid,
  p_attempt_id    uuid,
  p_price_cents   bigint,
  p_order_id      text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare v_purchase public.marketplace_cloud_ip_purchases;
begin
  -- Derselbe globale Lock wie bei Einrichtung und Reservierung.
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then
    raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_request_id is null or (p_connection_id is null and (p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]'))
    or (p_connection_id is not null and p_display_name is not null) then raise exception 'Ungültige Kontoeinrichtung' using errcode='22023'; end if;
  if p_connection_id is not null and not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' and status not in ('paused','blocked')) then
    raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_action='reconcile' then
    -- Verlassene Einrichtungen erst nach Schonfrist und verifiziertem Bestandsimport freigeben.
    -- Ohne bekannte Bestellkennung bleibt die Zahlung ungeklärt und dauerhaft gesperrt.
    update public.marketplace_cloud_ip_purchases purchase set state='completed',updated_at=clock_timestamp()
      where purchase.state='ordered' and purchase.created_at<clock_timestamp()-interval '2 minutes'
      and exists(select 1 from public.marketplace_cloud_ips ip where ip.order_reference=purchase.provider_order_id
        and ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp());
    return jsonb_build_object('status','completed');
  end if;
  select * into v_purchase from public.marketplace_cloud_ip_purchases where workspace_id=p_workspace_id and requested_by=p_user_id and request_id=p_request_id for update;
  if found and (v_purchase.connection_id is distinct from p_connection_id or v_purchase.display_name is distinct from case when p_connection_id is null then btrim(p_display_name) end) then
    raise exception 'Einrichtungskennung bereits verwendet' using errcode='23505'; end if;
  if p_action='complete' then
    if v_purchase.id is null then return jsonb_build_object('status','completed'); end if;
    if v_purchase.state='completed' then return jsonb_build_object('status','completed'); end if;
    if v_purchase.state<>'ordered' or not exists(select 1 from public.marketplace_cloud_setups where workspace_id=p_workspace_id and requested_by=p_user_id and request_id=p_request_id and state<>'cancelled') then
      raise exception 'Bestellung noch nicht zugeordnet' using errcode='55000'; end if;
    update public.marketplace_cloud_ip_purchases set state='completed',updated_at=clock_timestamp() where id=v_purchase.id;
    return jsonb_build_object('status','completed');
  elsif p_action in ('ordered','failed') then
    if v_purchase.id is null or v_purchase.attempt_id is distinct from p_attempt_id or v_purchase.state<>'submitting' then
      raise exception 'Bestellversuch wurde geändert' using errcode='42501'; end if;
    if p_action='ordered' and (p_order_id is null or p_order_id !~ '^[1-9][0-9]{0,15}$') then raise exception 'Ungültige Anbieterbestellung' using errcode='22023'; end if;
    update public.marketplace_cloud_ip_purchases set state=case when p_action='ordered' then 'ordered' else 'failed' end,
      provider_order_id=case when p_action='ordered' then p_order_id end,updated_at=clock_timestamp() where id=v_purchase.id returning * into v_purchase;
  elsif p_action is null or p_action not in ('inspect','claim') then raise exception 'Ungültiger Bestellschritt' using errcode='22023'; end if;
  if v_purchase.id is not null then
    return case v_purchase.state when 'ordered' then jsonb_build_object('status','ordered','orderId',v_purchase.provider_order_id)
      when 'completed' then jsonb_build_object('status','available') when 'failed' then jsonb_build_object('status','purchase_failed')
      else jsonb_build_object('status','purchase_pending') end;
  end if;
  if public.marketplace_cloud_ip_limit_reached(p_workspace_id) then return jsonb_build_object('status','limit_reached'); end if;
  if exists(select 1 from public.marketplace_cloud_ip_purchases where state in ('submitting','ordered')) then return jsonb_build_object('status','purchase_pending'); end if;
  if exists(select 1 from public.marketplace_cloud_ips ip where ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp()
    and not exists(select 1 from public.marketplace_cloud_setups setup where setup.cloud_ip_id=ip.id and setup.state<>'cancelled')) then return jsonb_build_object('status','available'); end if;
  if p_action='inspect' then return jsonb_build_object('status','missing'); end if;
  if p_attempt_id is null or p_price_cents is null or p_price_cents<0 then raise exception 'Ungültige Kaufabsicht' using errcode='22023'; end if;
  insert into public.marketplace_cloud_ip_purchases(workspace_id,requested_by,request_id,connection_id,display_name,attempt_id,price_cents)
    values(p_workspace_id,p_user_id,p_request_id,p_connection_id,case when p_connection_id is null then btrim(p_display_name) end,p_attempt_id,p_price_cents);
  return jsonb_build_object('status','submit');
end;
$function$;

revoke all on function public.marketplace_cloud_ip_purchase(text, uuid, uuid, uuid, text, uuid, uuid, bigint, text) from public;

grant all on function public.marketplace_cloud_ip_purchase(text, uuid, uuid, uuid, text, uuid, uuid, bigint, text) to service_role;

create or replace function public.marketplace_cloud_setup_begin (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_request_id    uuid,
  p_display_name  text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_setup public.marketplace_cloud_setups; v_connection public.marketplace_connections; v_ip_id bigint; v_generation bigint; v_revoked_at timestamptz;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid())) then
    raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_request_id is null or (p_connection_id is null and
    (p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name ~ '[[:cntrl:]]')) then
    raise exception 'Ungültige Kontoeinrichtung' using errcode='22023'; end if;
  select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and requested_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if (v_setup.is_new_connection and (p_connection_id is not null or v_setup.requested_name is distinct from btrim(p_display_name)))
      or (not v_setup.is_new_connection and v_setup.connection_id is distinct from p_connection_id) then
      raise exception 'Einrichtungskennung bereits verwendet' using errcode='23505'; end if;
    return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
  end if;
  if p_connection_id is not null then
    select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
    if not found or v_connection.status in ('paused','blocked') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
    select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and connection_id=p_connection_id and state<>'cancelled';
    if found then
      if v_setup.requested_by<>(select auth.uid()) then raise exception 'Einrichtung wird bereits bedient' using errcode='55P03'; end if;
      return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
    end if;
    if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping')) then
      raise exception 'Browsersitzung muss zuerst beendet werden' using errcode='55P03'; end if;
    if exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','running','outcome_unknown'))
      or exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('claimed','sending','outcome_unknown')) then
      raise exception 'Laufende oder ungeklärte Aktion verhindert den Wechsel' using errcode='55P03'; end if;
    select grant_generation,revoked_at into v_generation,v_revoked_at from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  end if;
  if public.marketplace_cloud_ip_limit_reached(p_workspace_id) then return jsonb_build_object('status','limit_reached'); end if;
  select ip.id into v_ip_id from public.marketplace_cloud_ips ip
    where ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp()
      and not exists(select 1 from public.marketplace_cloud_setups setup where setup.cloud_ip_id=ip.id and setup.state<>'cancelled')
      and not exists(select 1 from public.marketplace_cloud_ip_purchases purchase where purchase.provider_order_id=ip.order_reference and purchase.state='ordered'
        and (purchase.workspace_id<>p_workspace_id or purchase.requested_by<>(select auth.uid()) or purchase.request_id<>p_request_id))
    order by ip.created_at,ip.id limit 1 for update of ip skip locked;
  if not found then return jsonb_build_object('status','no_capacity'); end if;
  if p_connection_id is null then
    insert into public.marketplace_connections(workspace_id,display_name) values(p_workspace_id,btrim(p_display_name)) returning * into v_connection;
  end if;
  -- Ein alter Cloudzeitplan darf während der Profilumstellung nicht wieder starten.
  update public.marketplace_sync_schedules set enabled=false,next_due_at=null,
    authorization_version=authorization_version+1,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=v_connection.id;
  insert into public.marketplace_cloud_setups(workspace_id,connection_id,requested_by,request_id,requested_name,is_new_connection,cloud_ip_id,expected_external_account_id,expected_grant_generation,expected_grant_revoked_at)
    values(p_workspace_id,v_connection.id,(select auth.uid()),p_request_id,case when p_connection_id is null then btrim(p_display_name) end,p_connection_id is null,v_ip_id,v_connection.external_account_id,v_generation,v_revoked_at)
    returning * into v_setup;
  return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
end;
$function$;

create table public.marketplace_cloud_ip_allowances (
  id           bigint  generated always as identity not null,
  workspace_id uuid    not null,
  ip_limit     integer not null
);

comment on table public.marketplace_cloud_ip_allowances is 'Optionale IP-Grenze je Arbeitsplatz für spätere Abopakete; ohne Eintrag gilt weiterhin die Pilotfreigabe.';

alter table public.marketplace_cloud_ip_allowances
  enable row level security;

alter table public.marketplace_cloud_ip_allowances
  add constraint marketplace_cloud_ip_allowances_ip_limit_check check (ip_limit >= 0 and ip_limit <= 1000);

alter table public.marketplace_cloud_ip_allowances
  add constraint marketplace_cloud_ip_allowances_pkey primary key (id);

alter table public.marketplace_cloud_ip_allowances
  add constraint marketplace_cloud_ip_allowances_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.marketplace_cloud_ip_allowances
  add constraint marketplace_cloud_ip_allowances_workspace_id_key unique (workspace_id);

grant all on public.marketplace_cloud_ip_allowances to service_role;

create policy "Worker deletes IP allowances" on public.marketplace_cloud_ip_allowances
  for delete
  to service_role
  using (true);

create policy "Worker inserts IP allowances" on public.marketplace_cloud_ip_allowances
  for insert
  to service_role
  with check (true);

create policy "Worker reads IP allowances" on public.marketplace_cloud_ip_allowances
  for select
  to service_role
  using (true);

create policy "Worker updates IP allowances" on public.marketplace_cloud_ip_allowances
  for update
  to service_role
  using (true)
  with check (true);

create table public.marketplace_cloud_ip_purchases (
  id                bigint                   generated always as identity not null,
  workspace_id      uuid                     not null,
  requested_by      uuid                     not null,
  request_id        uuid                     not null,
  connection_id     uuid,
  display_name      text,
  attempt_id        uuid                     not null,
  price_cents       bigint                   not null,
  currency          text                     default 'USD'::text not null,
  duration_days     integer                  default 30 not null,
  quantity          integer                  default 1 not null,
  state             text                     default 'submitting'::text not null,
  provider_order_id text,
  created_at        timestamp with time zone default now() not null,
  updated_at        timestamp with time zone default now() not null
);

comment on table public.marketplace_cloud_ip_purchases is 'Dauerhafte Kaufabsichten vor Anbieterzahlung. Ungeklärte Antworten sperren weitere Käufe, auch nach Neustart.';

alter table public.marketplace_cloud_ip_purchases
  enable row level security;

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchase_workspace_id_requested_by_req_key unique (workspace_id, requested_by, request_id);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_attempt_id_key unique (attempt_id);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_check check (connection_id is null and display_name is not null or connection_id is not null and display_name is null);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_check1 check ((state <> all (array['ordered'::text, 'completed'::text])) or provider_order_id is not null);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_currency_check check (currency = 'USD'::text);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_duration_days_check check (duration_days = 30);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_pkey primary key (id);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_price_cents_check check (price_cents >= 0);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_provider_order_id_check check (provider_order_id ~ '^[1-9][0-9]{0,15}$'::text);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_provider_order_id_key unique (provider_order_id);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_quantity_check check (quantity = 1);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_requested_by_fkey foreign key (requested_by) references auth.users(id);

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_state_check check (state = any (array['submitting'::text, 'ordered'::text, 'failed'::text, 'completed'::text]));

alter table public.marketplace_cloud_ip_purchases
  add constraint marketplace_cloud_ip_purchases_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id);

grant insert, select, update on public.marketplace_cloud_ip_purchases to service_role;

create unique index marketplace_cloud_ip_purchase_open on public.marketplace_cloud_ip_purchases ((true))
  where state = any (array['submitting'::text, 'ordered'::text]);

create index marketplace_cloud_ip_purchases_user on public.marketplace_cloud_ip_purchases (requested_by);

create policy "Worker inserts IP purchases" on public.marketplace_cloud_ip_purchases
  for insert
  to service_role
  with check (true);

create policy "Worker reads IP purchases" on public.marketplace_cloud_ip_purchases
  for select
  to service_role
  using (true);

create policy "Worker updates IP purchases" on public.marketplace_cloud_ip_purchases
  for update
  to service_role
  using (true)
  with check (true);

comment on table public.marketplace_cloud_ip_allowances is 'Optionale IP-Grenze je Arbeitsplatz für spätere Abopakete; ohne Eintrag gilt weiterhin die Pilotfreigabe.';
revoke all on public.marketplace_cloud_ip_allowances from public,anon,authenticated;
grant all on public.marketplace_cloud_ip_allowances to service_role;
revoke all on sequence public.marketplace_cloud_ip_allowances_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_ip_allowances_id_seq to service_role;
comment on table public.marketplace_cloud_ip_purchases is 'Dauerhafte Kaufabsichten vor Anbieterzahlung. Ungeklärte Antworten sperren weitere Käufe, auch nach Neustart.';
revoke all on public.marketplace_cloud_ip_purchases from public,anon,authenticated,service_role;
grant select,insert,update on public.marketplace_cloud_ip_purchases to service_role;
revoke all on sequence public.marketplace_cloud_ip_purchases_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_ip_purchases_id_seq to service_role;
revoke all on function public.marketplace_cloud_ip_limit_reached(uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_ip_limit_reached(uuid) to service_role;
revoke all on function public.marketplace_cloud_ip_purchase(text,uuid,uuid,uuid,text,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_ip_purchase(text,uuid,uuid,uuid,text,uuid,uuid,bigint,text) to service_role;
