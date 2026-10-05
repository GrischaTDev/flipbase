-- Gekaufte ISP-IPs, kontogebundene Einrichtung und kontrollierter Lokal-/Cloudwechsel.
-- Geheimnisse bleiben im privaten Netzwerkbestand des Chromiumworkers.
create table public.marketplace_cloud_ips (
  id bigint generated always as identity primary key,
  network_id text not null unique check (network_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$' and network_id<>'direct'),
  provider text not null default 'iproyal' check (provider='iproyal'),
  order_reference text not null check (char_length(order_reference) between 1 and 128),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  is_dedicated_isp boolean not null default true,
  expires_at timestamptz not null check (isfinite(expires_at)),
  enabled boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.marketplace_cloud_ips is 'Administrativ geprüfte gekaufte ISP-IPs; nur Netzwerkreferenzen, keine Proxyzugangsdaten.';
alter table public.marketplace_cloud_ips enable row level security;
revoke all on public.marketplace_cloud_ips from public,anon,authenticated;
grant all on public.marketplace_cloud_ips to service_role;
revoke all on sequence public.marketplace_cloud_ips_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_ips_id_seq to service_role;
create policy "Worker reads cloud IPs" on public.marketplace_cloud_ips for select to service_role using(true);
create policy "Worker inserts cloud IPs" on public.marketplace_cloud_ips for insert to service_role with check(true);
create policy "Worker updates cloud IPs" on public.marketplace_cloud_ips for update to service_role using(true) with check(true);
create policy "Worker deletes cloud IPs" on public.marketplace_cloud_ips for delete to service_role using(true);

create table public.marketplace_cloud_setups (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  workspace_id uuid not null,
  connection_id uuid not null,
  requested_by uuid not null references auth.users(id),
  request_id uuid not null,
  requested_name text,
  is_new_connection boolean not null,
  cloud_ip_id bigint not null references public.marketplace_cloud_ips(id),
  state text not null default 'reserved' check (state in ('reserved','login','verified','finalizing','completed','cleanup_pending','cancelled')),
  expected_external_account_id text,
  expected_grant_generation bigint,
  expected_grant_revoked_at timestamptz,
  verified_external_account_id text,
  verified_username text,
  provider_profile_id text check (provider_profile_id ~ '^chromium_[0-9a-f-]{36}$'),
  previous_provider_profile_id text check (previous_provider_profile_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  worker_id uuid,
  worker_epoch bigint,
  expires_at timestamptz not null default now()+interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,requested_by,request_id),
  foreign key(workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade
);
comment on table public.marketplace_cloud_setups is 'Dauerhafte IP-Reservierung und Zustandswechsel; Freigabe erst nach bestätigter Browserbereinigung.';
create unique index marketplace_cloud_ip_reserved on public.marketplace_cloud_setups(cloud_ip_id) where state<>'cancelled';
create unique index marketplace_cloud_connection_reserved on public.marketplace_cloud_setups(workspace_id,connection_id) where state<>'cancelled';
create index marketplace_cloud_setup_requester on public.marketplace_cloud_setups(requested_by,workspace_id);
alter table public.marketplace_cloud_setups enable row level security;
revoke all on public.marketplace_cloud_setups from public,anon,authenticated;
grant all on public.marketplace_cloud_setups to service_role;
revoke all on sequence public.marketplace_cloud_setups_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_setups_id_seq to service_role;
create policy "Worker reads cloud setups" on public.marketplace_cloud_setups for select to service_role using(true);
create policy "Worker inserts cloud setups" on public.marketplace_cloud_setups for insert to service_role with check(true);
create policy "Worker updates cloud setups" on public.marketplace_cloud_setups for update to service_role using(true) with check(true);
create policy "Worker deletes cloud setups" on public.marketplace_cloud_setups for delete to service_role using(true);

alter table public.marketplace_browser_sessions add column cloud_setup_id uuid references public.marketplace_cloud_setups(public_id);
create index marketplace_browser_cloud_setup on public.marketplace_browser_sessions(cloud_setup_id);

create or replace function public.marketplace_cloud_setup_public(p_setup public.marketplace_cloud_setups)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('workspaceId',p_setup.workspace_id,'connectionId',p_setup.connection_id,
    'setupId',p_setup.public_id,'state',p_setup.state,'sessionId',(
      select public_id from public.marketplace_browser_sessions where cloud_setup_id=p_setup.public_id
        and state in ('active','stopping') order by created_at desc limit 1));
$$;
revoke all on function public.marketplace_cloud_setup_public(public.marketplace_cloud_setups) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_setup_public(public.marketplace_cloud_setups) to service_role;

create or replace function public.marketplace_cloud_network_valid(p_workspace_id uuid,p_connection_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.marketplace_cloud_setups where workspace_id=p_workspace_id and connection_id=p_connection_id)
    or exists(select 1 from public.marketplace_cloud_setups setup join public.marketplace_cloud_ips ip on ip.id=setup.cloud_ip_id
      where setup.workspace_id=p_workspace_id and setup.connection_id=p_connection_id and setup.state='completed'
        and ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>now());
$$;
revoke all on function public.marketplace_cloud_network_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_network_valid(uuid,uuid) to service_role;

create or replace function public.marketplace_cloud_setup_begin(p_workspace_id uuid,p_connection_id uuid,p_request_id uuid,p_display_name text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
    if v_connection.execution_mode<>'local' and v_connection.external_account_id is not null then raise exception 'Cloudkonto ist bereits verbunden' using errcode='22023'; end if;
    if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping')) then
      raise exception 'Browsersitzung muss zuerst beendet werden' using errcode='55P03'; end if;
    select grant_generation,revoked_at into v_generation,v_revoked_at from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  end if;
  select ip.id into v_ip_id from public.marketplace_cloud_ips ip
    where ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp()
      and not exists(select 1 from public.marketplace_cloud_setups setup where setup.cloud_ip_id=ip.id and setup.state<>'cancelled')
    order by ip.created_at,ip.id limit 1 for update of ip skip locked;
  if not found then return jsonb_build_object('status','no_capacity'); end if;
  if p_connection_id is null then
    insert into public.marketplace_connections(workspace_id,display_name) values(p_workspace_id,btrim(p_display_name)) returning * into v_connection;
  end if;
  insert into public.marketplace_cloud_setups(workspace_id,connection_id,requested_by,request_id,requested_name,is_new_connection,cloud_ip_id,expected_external_account_id,expected_grant_generation,expected_grant_revoked_at)
    values(p_workspace_id,v_connection.id,(select auth.uid()),p_request_id,case when p_connection_id is null then btrim(p_display_name) end,p_connection_id is null,v_ip_id,v_connection.external_account_id,v_generation,v_revoked_at)
    returning * into v_setup;
  return jsonb_build_object('status','ready','setup',public.marketplace_cloud_setup_public(v_setup));
end;
$$;
revoke all on function public.marketplace_cloud_setup_begin(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.marketplace_cloud_setup_begin(uuid,uuid,uuid,text) to authenticated;

create or replace function public.marketplace_cloud_setup_read(p_workspace_id uuid,p_setup_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_setup public.marketplace_cloud_setups;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and public_id=p_setup_id and requested_by=(select auth.uid());
  if not found then raise exception 'Einrichtungszugriff verweigert' using errcode='42501'; end if;
  return public.marketplace_cloud_setup_public(v_setup);
end;
$$;
revoke all on function public.marketplace_cloud_setup_read(uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_read(uuid,uuid) to authenticated;

create or replace function public.marketplace_cloud_setup_cancel(p_workspace_id uuid,p_setup_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_setup public.marketplace_cloud_setups;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id for update;
  if v_setup.state not in ('completed','cancelled') then
    update public.marketplace_cloud_setups set state='cleanup_pending',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
  end if;
  return public.marketplace_cloud_setup_public(v_setup);
end;
$$;
revoke all on function public.marketplace_cloud_setup_cancel(uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_cancel(uuid,uuid) to authenticated;

-- Alle privaten Übergänge teilen dieselbe Sperrreihenfolge und Workerprüfung.
create or replace function public.marketplace_cloud_setup_update(
  p_workspace_id uuid,p_setup_id uuid,p_user_id uuid,p_worker_id uuid,p_worker_epoch bigint,p_action text,
  p_profile_id text default null,p_external_account_id text default null,p_username text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_setup public.marketplace_cloud_setups; v_connection public.marketplace_connections; v_ip public.marketplace_cloud_ips; v_generation bigint; v_revoked_at timestamptz;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_action is null or p_action not in ('claim','bind','verify','finalize','complete','release','cleanup','recover','detach','unmap') then raise exception 'Ungültiger Einrichtungsschritt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Workerfreigabe abgelaufen' using errcode='42501'; end if;
  select * into v_setup from public.marketplace_cloud_setups where workspace_id=p_workspace_id and public_id=p_setup_id and requested_by=p_user_id;
  if not found then raise exception 'Einrichtungszugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=v_setup.connection_id for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_setup from public.marketplace_cloud_setups where id=v_setup.id for update;
  select * into v_ip from public.marketplace_cloud_ips where id=v_setup.cloud_ip_id for update;
  -- Bereinigung darf auch nach Rechteentzug stattfinden; sie erteilt keine neuen Kontorechte.
  if p_action not in ('cleanup','release','recover','detach') and
    (not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id)) then
    raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_action not in ('cleanup','release','recover','detach') and
    (not v_ip.enabled or v_ip.country_code<>'DE' or not v_ip.is_dedicated_isp or v_ip.verified_at is null or v_ip.expires_at<=clock_timestamp()) then
    raise exception 'Cloud-IP nicht verfügbar' using errcode='55000'; end if;
  if p_action in ('claim','recover') then
    if v_setup.state='cancelled' and p_action='claim' then raise exception 'Einrichtung beendet' using errcode='55000'; end if;
    if v_setup.worker_epoch is distinct from p_worker_epoch or v_setup.worker_id is distinct from p_worker_id then
      if exists(select 1 from public.marketplace_browser_sessions where cloud_setup_id=p_setup_id and state in ('active','stopping')) then
        raise exception 'Browserbereinigung ausstehend' using errcode='55P03'; end if;
      update public.marketplace_cloud_setups set worker_id=p_worker_id,worker_epoch=p_worker_epoch,updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    end if;
    if p_action='recover' and v_setup.state not in ('completed','cancelled') then
      update public.marketplace_cloud_setups set state='cleanup_pending',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    end if;
  else
    if v_setup.worker_id is distinct from p_worker_id or v_setup.worker_epoch is distinct from p_worker_epoch then raise exception 'Veraltete Workerfreigabe' using errcode='42501'; end if;
    if p_action in ('bind','verify','finalize','complete') and v_setup.state<>'completed' then
      if v_setup.expires_at<=clock_timestamp() or v_connection.status in ('paused','blocked') then raise exception 'Einrichtung nicht verfügbar' using errcode='55000'; end if;
      select grant_generation,revoked_at into v_generation,v_revoked_at from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=v_connection.id;
      if v_generation is distinct from v_setup.expected_grant_generation or v_revoked_at is distinct from v_setup.expected_grant_revoked_at
        or v_connection.external_account_id is distinct from v_setup.expected_external_account_id then
        raise exception 'Kontofreigabe wurde geändert' using errcode='42501'; end if;
    end if;
    if p_action in ('unmap','detach') then
      if (p_action='unmap' and v_setup.state<>'reserved') or (p_action='detach' and v_setup.state<>'cleanup_pending') then
        raise exception 'Profilbereinigung nicht angefordert' using errcode='55000'; end if;
      if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping')) then
        raise exception 'Browserstopp nicht bestätigt' using errcode='55P03'; end if;
      if p_action='detach' and p_profile_id is distinct from v_setup.provider_profile_id then
        raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
      if p_action='unmap' and p_profile_id is not null then
        if v_setup.previous_provider_profile_id is not null and v_setup.previous_provider_profile_id<>p_profile_id then
          raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
        update public.marketplace_cloud_setups set previous_provider_profile_id=p_profile_id where id=v_setup.id returning * into v_setup;
      end if;
      delete from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id and provider_profile_id=p_profile_id;
      if exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id) then
        raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
    elsif p_action='bind' then
      if v_setup.state not in ('reserved','login') or p_profile_id is null or p_profile_id !~ '^chromium_[0-9a-f-]{36}$'
        or (v_setup.provider_profile_id is not null and v_setup.provider_profile_id<>p_profile_id) then raise exception 'Profilzuordnung ungültig' using errcode='42501'; end if;
      insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id)
        values(p_workspace_id,v_connection.id,p_profile_id) on conflict(workspace_id,connection_id) do nothing;
      if not exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id and provider_profile_id=p_profile_id) then
        raise exception 'Profilzuordnung wurde geändert' using errcode='42501'; end if;
      update public.marketplace_cloud_setups set provider_profile_id=p_profile_id,state='login',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    elsif p_action='verify' then
      if v_setup.state not in ('login','verified') or p_external_account_id is null or p_external_account_id !~ '^[1-9][0-9]{0,31}$'
        or p_username is null or char_length(btrim(p_username)) not between 1 and 120 or p_username ~ '[[:cntrl:]]' then raise exception 'Ungültige Vinted-Identität' using errcode='22023'; end if;
      if v_setup.expected_external_account_id is not null and v_setup.expected_external_account_id<>p_external_account_id then raise exception 'Anderes Vinted-Konto angemeldet' using errcode='23505'; end if;
      if not exists(select 1 from public.marketplace_browser_sessions where cloud_setup_id=p_setup_id and state='active' and started_by=p_user_id
        and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() and provider_profile_id=v_setup.provider_profile_id) then
        raise exception 'Bestätigte Browsersitzung fehlt' using errcode='42501'; end if;
      update public.marketplace_cloud_setups set verified_external_account_id=p_external_account_id,verified_username=btrim(p_username),state='verified',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
    elsif p_action='finalize' then
      if v_setup.state not in ('verified','finalizing','completed') then raise exception 'Identitätsprüfung fehlt' using errcode='55000'; end if;
      if v_setup.state<>'completed' then
        if exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('claimed','sending','outcome_unknown'))
          or exists(select 1 from public.marketplace_operations where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('queued','running','outcome_unknown')) then
          raise exception 'Laufende oder ungeklärte Aktion verhindert den Wechsel' using errcode='55P03'; end if;
        update public.marketplace_cloud_setups set state='finalizing',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
      end if;
    elsif p_action='complete' then
      if v_setup.state<>'completed' then
        if v_setup.state<>'finalizing' or v_setup.verified_external_account_id is null then raise exception 'Abschluss nicht vorbereitet' using errcode='55000'; end if;
        if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping')) then
          raise exception 'Browserstopp nicht bestätigt' using errcode='55P03'; end if;
        if exists(select 1 from public.marketplace_local_message_outbox where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('claimed','sending','outcome_unknown')) then
          raise exception 'Lokale Aktion nicht abgeschlossen' using errcode='55P03'; end if;
        update public.marketplace_local_message_outbox set state='cancelled',error_code='execution_changed',updated_at=clock_timestamp()
          where workspace_id=p_workspace_id and connection_id=v_connection.id and state='queued';
        update public.marketplace_local_extension_grants set revoked_at=clock_timestamp(),grant_generation=grant_generation+1
          where workspace_id=p_workspace_id and connection_id=v_connection.id;
        update public.marketplace_cloud_setups set state='completed',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
        update public.marketplace_connections set execution_mode='cloud',external_account_id=v_setup.verified_external_account_id,
          status='connected',resume_status=null,capabilities='{"profile.read":"verified"}'::jsonb,updated_at=clock_timestamp() where id=v_connection.id;
      end if;
    elsif p_action='release' then
      if v_setup.state='completed' then
        if v_connection.execution_mode<>'local' and v_connection.status<>'paused' then raise exception 'Cloudbetrieb muss zuerst beendet werden' using errcode='55P03'; end if;
        if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping')) then
          raise exception 'Browserstopp nicht bestätigt' using errcode='55P03'; end if;
        update public.marketplace_cloud_setups set state='cleanup_pending',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
      end if;
    elsif p_action='cleanup' then
      if v_setup.state<>'cancelled' then
        if v_setup.state<>'cleanup_pending' then raise exception 'Bereinigung nicht angefordert' using errcode='55000'; end if;
        if exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=v_connection.id and state in ('active','stopping'))
          or exists(select 1 from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=v_connection.id and provider_profile_id=v_setup.provider_profile_id) then
          raise exception 'Profilbereinigung nicht bestätigt' using errcode='55P03'; end if;
        update public.marketplace_cloud_setups set state='cancelled',updated_at=clock_timestamp() where id=v_setup.id returning * into v_setup;
      end if;
    end if;
  end if;
  return jsonb_build_object('setup',public.marketplace_cloud_setup_public(v_setup),'networkId',v_ip.network_id,
    'profileId',v_setup.provider_profile_id,'previousProfileId',v_setup.previous_provider_profile_id,'expiresAt',v_setup.expires_at,'ipExpiresAt',v_ip.expires_at);
end;
$$;
revoke all on function public.marketplace_cloud_setup_update(uuid,uuid,uuid,uuid,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_setup_update(uuid,uuid,uuid,uuid,bigint,text,text,text,text) to service_role;

create or replace function public.marketplace_cloud_setup_session_reserve(p_workspace_id uuid,p_setup_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_setup public.marketplace_cloud_setups; v_session public.marketplace_browser_sessions;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id for update;
  if v_setup.state not in ('login','verified') or v_setup.provider_profile_id is null or v_setup.expires_at<=clock_timestamp() then raise exception 'Einrichtung nicht verfügbar' using errcode='55000'; end if;
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then raise exception 'Browser wird bereits bedient oder bereinigt' using errcode='55P03'; end if;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,cloud_setup_id)
    values(p_workspace_id,v_setup.connection_id,(select auth.uid()),v_setup.provider_profile_id,least(v_setup.expires_at,clock_timestamp()+interval '10 minutes'),p_setup_id) returning * into v_session;
  return jsonb_build_object('id',v_session.public_id,'workspaceId',v_session.workspace_id,'connectionId',v_session.connection_id,'state',v_session.state,'expiresAt',v_session.expires_at);
end;
$$;
revoke all on function public.marketplace_cloud_setup_session_reserve(uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_session_reserve(uuid,uuid) to authenticated;

create or replace function public.marketplace_cloud_setup_session_check(p_workspace_id uuid,p_setup_id uuid,p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_setup public.marketplace_cloud_setups; v_session public.marketplace_browser_sessions; v_active boolean;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform public.marketplace_cloud_setup_read(p_workspace_id,p_setup_id);
  select * into v_setup from public.marketplace_cloud_setups where public_id=p_setup_id;
  select * into v_session from public.marketplace_browser_sessions where cloud_setup_id=p_setup_id and public_id=p_session_id and started_by=(select auth.uid()) for update;
  if not found then raise exception 'Sitzungszugriff verweigert' using errcode='42501'; end if;
  v_active:=v_session.state='active' and v_session.expires_at>clock_timestamp() and v_setup.expires_at>clock_timestamp()
    and v_setup.state in ('login','verified') and exists(select 1 from public.marketplace_cloud_ips where id=v_setup.cloud_ip_id and enabled and country_code='DE' and is_dedicated_isp and verified_at is not null and expires_at>clock_timestamp())
    and exists(select 1 from public.marketplace_worker_runtime where id=1 and worker_id=v_session.worker_id and worker_epoch=v_session.worker_epoch and expires_at>clock_timestamp());
  return jsonb_build_object('id',v_session.public_id,'workspaceId',v_session.workspace_id,'connectionId',v_session.connection_id,'active',v_active);
end;
$$;
revoke all on function public.marketplace_cloud_setup_session_check(uuid,uuid,uuid) from public,anon;
grant execute on function public.marketplace_cloud_setup_session_check(uuid,uuid,uuid) to authenticated;

create or replace function public.marketplace_require_cloud_execution()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
declare v_setup_id uuid;
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_connections where workspace_id=new.workspace_id and id=new.connection_id for update;
  if tg_table_name='marketplace_browser_sessions' then v_setup_id:=new.cloud_setup_id; end if;
  if v_setup_id is not null then
    if not exists(select 1 from public.marketplace_cloud_setups setup join public.marketplace_cloud_ips ip on ip.id=setup.cloud_ip_id
      where setup.public_id=v_setup_id and setup.workspace_id=new.workspace_id and setup.connection_id=new.connection_id
        and setup.requested_by=new.started_by and setup.provider_profile_id=new.provider_profile_id and setup.state in ('login','verified')
        and setup.expires_at>clock_timestamp() and ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp and ip.verified_at is not null and ip.expires_at>clock_timestamp()) then
      raise exception 'Ungültige Cloud-Einrichtungssitzung' using errcode='42501'; end if;
  elsif not exists(select 1 from public.marketplace_connections where workspace_id=new.workspace_id and id=new.connection_id and execution_mode='cloud')
    or not public.marketplace_cloud_network_valid(new.workspace_id,new.connection_id) then
    raise exception 'Keine aktive Cloudfreigabe' using errcode='42501';
  end if;
  return new;
end;
$$;

-- Eine Verbindung darf den Bestand nicht durch Kaskadenlöschung vorzeitig freigeben.
create or replace function public.marketplace_prevent_cloud_setup_delete()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  if exists(select 1 from public.marketplace_cloud_setups where workspace_id=old.workspace_id and connection_id=old.id and state<>'cancelled') then
    raise exception 'Cloud-IP muss zuerst bereinigt werden' using errcode='23503'; end if;
  return old;
end;
$$;
revoke all on function public.marketplace_prevent_cloud_setup_delete() from public,anon,authenticated;
create trigger marketplace_prevent_cloud_setup_delete before delete on public.marketplace_connections for each row execute function public.marketplace_prevent_cloud_setup_delete();

-- Finale Übergabe sperrt neue lokale Versandclaims und erneute Freigaben.
create or replace function public.marketplace_guard_cloud_finalizing()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if exists(select 1 from public.marketplace_cloud_setups where workspace_id=new.workspace_id and connection_id=new.connection_id and state='finalizing') then
    if tg_table_name='marketplace_local_message_outbox' then
      if new.state in ('queued','claimed','sending') then raise exception 'Cloudwechsel wird abgeschlossen' using errcode='55P03'; end if;
    elsif new.revoked_at is null then
      raise exception 'Cloudwechsel wird abgeschlossen' using errcode='55P03';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_guard_cloud_finalizing() from public,anon,authenticated;
create trigger marketplace_local_outbox_cloud_fence before insert or update on public.marketplace_local_message_outbox for each row execute function public.marketplace_guard_cloud_finalizing();
create trigger marketplace_local_grant_cloud_fence before insert or update on public.marketplace_local_extension_grants for each row execute function public.marketplace_guard_cloud_finalizing();
