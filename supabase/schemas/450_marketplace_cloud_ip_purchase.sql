-- Einmalige IPRoyal-Nachbuchung und vorbereitete Paketgrenzen, ohne Zahlungsgeheimnisse.
create table public.marketplace_cloud_ip_allowances (
  id bigint generated always as identity primary key,
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  ip_limit integer not null check (ip_limit between 0 and 1000)
);
comment on table public.marketplace_cloud_ip_allowances is 'Optionale IP-Grenze je Arbeitsplatz für spätere Abopakete; ohne Eintrag gilt weiterhin die Pilotfreigabe.';
alter table public.marketplace_cloud_ip_allowances enable row level security;
revoke all on public.marketplace_cloud_ip_allowances from public,anon,authenticated;
grant all on public.marketplace_cloud_ip_allowances to service_role;
revoke all on sequence public.marketplace_cloud_ip_allowances_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_ip_allowances_id_seq to service_role;
create policy "Worker reads IP allowances" on public.marketplace_cloud_ip_allowances for select to service_role using(true);
create policy "Worker inserts IP allowances" on public.marketplace_cloud_ip_allowances for insert to service_role with check(true);
create policy "Worker updates IP allowances" on public.marketplace_cloud_ip_allowances for update to service_role using(true) with check(true);
create policy "Worker deletes IP allowances" on public.marketplace_cloud_ip_allowances for delete to service_role using(true);

create table public.marketplace_cloud_ip_purchases (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id),
  requested_by uuid not null references auth.users(id),
  request_id uuid not null,
  connection_id uuid,
  display_name text,
  attempt_id uuid not null unique,
  price_cents bigint not null check (price_cents>=0),
  currency text not null default 'USD' check (currency='USD'),
  duration_days integer not null default 30 check (duration_days=30),
  quantity integer not null default 1 check (quantity=1),
  state text not null default 'submitting' check (state in ('submitting','ordered','failed','completed')),
  provider_order_id text unique check (provider_order_id ~ '^[1-9][0-9]{0,15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,requested_by,request_id),
  check ((connection_id is null and display_name is not null) or (connection_id is not null and display_name is null)),
  check (state not in ('ordered','completed') or provider_order_id is not null)
);
comment on table public.marketplace_cloud_ip_purchases is 'Dauerhafte Kaufabsichten vor Anbieterzahlung. Ungeklärte Antworten sperren weitere Käufe, auch nach Neustart.';
-- Eine offene Anbieterzahlung weltweit; unbekannte Zahlungsantworten laufen niemals automatisch ab.
create unique index marketplace_cloud_ip_purchase_open on public.marketplace_cloud_ip_purchases((true)) where state in ('submitting','ordered');
create index marketplace_cloud_ip_purchases_user on public.marketplace_cloud_ip_purchases(requested_by);
alter table public.marketplace_cloud_ip_purchases enable row level security;
revoke all on public.marketplace_cloud_ip_purchases from public,anon,authenticated,service_role;
grant select,insert,update on public.marketplace_cloud_ip_purchases to service_role;
revoke all on sequence public.marketplace_cloud_ip_purchases_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_ip_purchases_id_seq to service_role;
create policy "Worker reads IP purchases" on public.marketplace_cloud_ip_purchases for select to service_role using(true);
create policy "Worker inserts IP purchases" on public.marketplace_cloud_ip_purchases for insert to service_role with check(true);
create policy "Worker updates IP purchases" on public.marketplace_cloud_ip_purchases for update to service_role using(true) with check(true);

create or replace function public.marketplace_cloud_ip_limit_reached(p_workspace_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.marketplace_cloud_ip_allowances allowance where allowance.workspace_id=p_workspace_id
    and (select count(*) from public.marketplace_cloud_setups setup where setup.workspace_id=p_workspace_id and setup.state<>'cancelled')>=allowance.ip_limit);
$$;
revoke all on function public.marketplace_cloud_ip_limit_reached(uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_ip_limit_reached(uuid) to service_role;

create or replace function public.marketplace_cloud_ip_purchase(p_action text,p_workspace_id uuid,p_request_id uuid,p_connection_id uuid,p_display_name text,p_user_id uuid,p_attempt_id uuid,p_price_cents bigint,p_order_id text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
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
$$;
revoke all on function public.marketplace_cloud_ip_purchase(text,uuid,uuid,uuid,text,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_ip_purchase(text,uuid,uuid,uuid,text,uuid,uuid,bigint,text) to service_role;
