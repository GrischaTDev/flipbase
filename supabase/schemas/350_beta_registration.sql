-- Widerrufbare Beta-Links, Registrierung und wiederholbare Kontobereinigung.
alter table public.beta_applications
  add column invitation_expires_at timestamptz,
  add column registration_link_kind text not null default 'legacy'
    check (registration_link_kind in ('legacy', 'managed')),
  add column revoked_at timestamptz,
  add column withdrawal_user_id uuid,
  add column withdrawal_workspace_id uuid,
  add column withdrawal_status text not null default 'not_requested'
    check (withdrawal_status in ('not_requested', 'revoked', 'auth_deleted', 'failed')),
  add column withdrawal_last_error text;

-- Bestandseinladungen behalten die bisherige Produktionsfrist von 24 Stunden.
update public.beta_applications as application
set invitation_expires_at = coalesce(auth_user.confirmation_sent_at, application.invitation_sent_at) + interval '24 hours'
from auth.users as auth_user
where auth_user.id = application.auth_user_id and application.registered_at is null;

create table public.beta_registration_links (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.beta_applications(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz
);
comment on table public.beta_registration_links is 'Geschützte Hashes der widerrufbaren Beta-Registrierungslinks; niemals Rohlinks speichern.';
create index beta_registration_links_application on public.beta_registration_links(application_id);
alter table public.beta_registration_links enable row level security;

create table public.beta_lifecycle_operations (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  application_id uuid references public.beta_applications(id) on delete set null,
  action text not null check (action in ('invite','register','withdraw','extend','end')),
  status text not null default 'processing' check (status in ('processing','succeeded','failed')),
  lease_id uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null default now() + interval '10 minutes',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.beta_lifecycle_operations is 'Wiederholbare Beta-Vorgänge mit exklusiver Bearbeitung; keine Passwörter oder Sitzungstokens.';
create index beta_lifecycle_operations_application on public.beta_lifecycle_operations(application_id);
create unique index beta_lifecycle_operations_processing on public.beta_lifecycle_operations(application_id)
  where status = 'processing';
alter table public.beta_lifecycle_operations enable row level security;

revoke all on public.beta_registration_links, public.beta_lifecycle_operations from public, anon, authenticated;
grant select, insert, update, delete on public.beta_registration_links, public.beta_lifecycle_operations to service_role;
revoke all on sequence public.beta_registration_links_id_seq, public.beta_lifecycle_operations_id_seq from public, anon, authenticated;
grant usage, select on sequence public.beta_registration_links_id_seq, public.beta_lifecycle_operations_id_seq to service_role;
create policy "Dienst liest Beta-Links" on public.beta_registration_links for select to service_role using (true);
create policy "Dienst erstellt Beta-Links" on public.beta_registration_links for insert to service_role with check (true);
create policy "Dienst ändert Beta-Links" on public.beta_registration_links for update to service_role using (true) with check (true);
create policy "Dienst löscht Beta-Links" on public.beta_registration_links for delete to service_role using (true);
create policy "Dienst liest Beta-Vorgänge" on public.beta_lifecycle_operations for select to service_role using (true);
create policy "Dienst erstellt Beta-Vorgänge" on public.beta_lifecycle_operations for insert to service_role with check (true);
create policy "Dienst ändert Beta-Vorgänge" on public.beta_lifecycle_operations for update to service_role using (true) with check (true);
create policy "Dienst löscht Beta-Vorgänge" on public.beta_lifecycle_operations for delete to service_role using (true);

create function public.claim_beta_lifecycle_operation(p_application_id uuid, p_request_id uuid, p_action text)
returns public.beta_lifecycle_operations language plpgsql security invoker set search_path = '' as $$
declare v_operation public.beta_lifecycle_operations;
begin
  perform 1 from public.beta_applications where id=p_application_id for update;
  if not found then raise exception 'Beta-Bewerbung nicht gefunden' using errcode='P0002'; end if;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  if found then
    if v_operation.action<>p_action or v_operation.application_id is distinct from p_application_id then
      raise exception 'Vorgangskennung bereits verwendet' using errcode='22023';
    end if;
    if v_operation.status='succeeded' then return v_operation; end if;
    if v_operation.status='processing' and v_operation.lease_expires_at>now() then
      raise exception 'Beta-Vorgang wird bereits verarbeitet' using errcode='55P03';
    end if;
  end if;
  if exists (select 1 from public.beta_lifecycle_operations where application_id=p_application_id
    and status='processing' and lease_expires_at>now()) then
    raise exception 'Beta-Vorgang wird bereits verarbeitet' using errcode='55P03';
  end if;
  update public.beta_lifecycle_operations set status='failed' where application_id=p_application_id and status='processing';
  insert into public.beta_lifecycle_operations(request_id,application_id,action)
  values(p_request_id,p_application_id,p_action)
  on conflict (request_id) do update set status='processing',lease_id=gen_random_uuid(),
    lease_expires_at=now()+interval '10 minutes',result='{}'::jsonb
  returning * into v_operation;
  return v_operation;
end;
$$;

create function public.prepare_beta_invitation(p_application_id uuid,p_request_id uuid,p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_application public.beta_applications; v_operation public.beta_lifecycle_operations; v_expires_at timestamptz:=now()+interval '168 hours';
begin
  v_operation:=public.claim_beta_lifecycle_operation(p_application_id,p_request_id,'invite');
  if v_operation.status='succeeded' then return v_operation.result || '{"replayed":true}'::jsonb; end if;
  select * into v_application from public.beta_applications where id=p_application_id;
  if v_application.status<>'accepted' or v_application.registered_at is not null or v_application.revoked_at is not null then
    raise exception 'Bewerbung kann nicht eingeladen werden' using errcode='22023';
  end if;
  update public.beta_registration_links set revoked_at=now() where application_id=p_application_id and revoked_at is null;
  insert into public.beta_registration_links(application_id,token_hash,expires_at) values(p_application_id,p_token_hash,v_expires_at);
  update public.beta_applications set registration_link_kind='managed',invitation_status='sending',
    invitation_expires_at=v_expires_at,invitation_sent_at=now(),invitation_last_error=null where id=p_application_id;
  update public.beta_lifecycle_operations set result=jsonb_build_object('expires_at',v_expires_at,'token_hash',p_token_hash)
    where request_id=p_request_id;
  return jsonb_build_object('expires_at',v_expires_at,'replayed',false,'lease_id',v_operation.lease_id);
end;
$$;

create function public.complete_beta_invitation(p_request_id uuid,p_lease_id uuid,p_sent boolean,p_error text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_operation public.beta_lifecycle_operations;
begin
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  perform 1 from public.beta_applications where id=v_operation.application_id for update;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id for update;
  if v_operation.id is null or v_operation.lease_id<>p_lease_id or v_operation.action<>'invite' or v_operation.status<>'processing' or v_operation.lease_expires_at<=now()
    or exists(select 1 from public.beta_applications where id=v_operation.application_id and revoked_at is not null) then
    raise exception 'Einladungsversand nicht mehr gültig' using errcode='22023';
  end if;
  update public.beta_applications set invitation_status=case when p_sent then 'sent' else 'failed' end,
    invitation_last_error=case when p_sent then null else left(p_error,500) end where id=v_operation.application_id;
  update public.beta_lifecycle_operations set status=case when p_sent then 'succeeded' else 'failed' end where request_id=p_request_id;
  if not p_sent then update public.beta_registration_links set revoked_at=now() where token_hash=v_operation.result->>'token_hash'; end if;
  return jsonb_build_object('application_id',v_operation.application_id);
end;
$$;

create function public.inspect_beta_registration(p_token_hash text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_link public.beta_registration_links; v_application public.beta_applications;
begin
  select * into v_link from public.beta_registration_links where token_hash=p_token_hash
    and revoked_at is null and consumed_at is null and expires_at>now();
  select * into v_application from public.beta_applications where id=v_link.application_id;
  if v_link.id is null or v_application.status<>'accepted' or v_application.revoked_at is not null
    or v_application.registered_at is not null or v_application.invitation_status<>'sent' then
    raise exception 'Registrierungslink ist ungültig oder abgelaufen' using errcode='22023';
  end if;
  return jsonb_build_object('application_id',v_application.id,'auth_user_id',v_application.auth_user_id,
    'email',v_application.email,'expires_at',v_link.expires_at);
end;
$$;

create function public.begin_beta_registration(p_token_hash text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_registration jsonb; v_operation public.beta_lifecycle_operations;
begin
  v_registration:=public.inspect_beta_registration(p_token_hash);
  v_operation:=public.claim_beta_lifecycle_operation((v_registration->>'application_id')::uuid,p_request_id,'register');
  -- Nach der Bewerbungssperre erneut lesen: ein zeitgleicher Widerruf darf nicht gewinnen.
  v_registration:=public.inspect_beta_registration(p_token_hash);
  if v_operation.status='succeeded' then raise exception 'Registrierung bereits abgeschlossen' using errcode='22023'; end if;
  if v_registration->>'auth_user_id' is null then raise exception 'Vorbereitetes Konto fehlt' using errcode='22023'; end if;
  update public.beta_lifecycle_operations set result=v_registration || jsonb_build_object('token_hash',p_token_hash)
    where request_id=p_request_id;
  return v_registration || jsonb_build_object('lease_id',v_operation.lease_id);
end;
$$;

create function public.complete_beta_registration(p_request_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_operation public.beta_lifecycle_operations; v_registration jsonb; v_license public.workspace_licenses;
begin
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  perform 1 from public.beta_applications where id=v_operation.application_id for update;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id for update;
  if v_operation.id is null or v_operation.action<>'register' or v_operation.status<>'processing' or v_operation.lease_id<>p_lease_id
    or v_operation.lease_expires_at<=now() then raise exception 'Registrierung nicht mehr gültig' using errcode='22023'; end if;
  v_registration:=public.inspect_beta_registration(v_operation.result->>'token_hash');
  if not exists(select 1 from auth.users where id=(v_registration->>'auth_user_id')::uuid
    and email_confirmed_at is not null and nullif(encrypted_password,'') is not null and (banned_until is null or banned_until<=now())) then
    raise exception 'Passwortvergabe nicht abgeschlossen' using errcode='22023';
  end if;
  update public.workspace_licenses set status='active',starts_at=now(),ends_at=now()+make_interval(days=>granted_days),updated_at=now()
    where beta_application_id=v_operation.application_id and status='pending' returning * into v_license;
  if not found then raise exception 'Ausstehende Beta-Lizenz fehlt' using errcode='22023'; end if;
  update public.beta_applications set registered_at=now() where id=v_operation.application_id;
  update public.beta_registration_links set consumed_at=now() where token_hash=v_operation.result->>'token_hash';
  update public.beta_lifecycle_operations set status='succeeded' where request_id=p_request_id;
  return jsonb_build_object('workspace_id',v_license.workspace_id);
end;
$$;

create function public.fail_beta_lifecycle_operation(p_request_id uuid,p_lease_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.beta_lifecycle_operations set status='failed' where request_id=p_request_id and lease_id=p_lease_id and status='processing';
$$;

-- Nur der interne Dienst darf mit Hashes und bestätigten Vorgängen arbeiten.
revoke all on function public.claim_beta_lifecycle_operation(uuid,uuid,text),
  public.prepare_beta_invitation(uuid,uuid,text),public.complete_beta_invitation(uuid,uuid,boolean,text),
  public.inspect_beta_registration(text),public.begin_beta_registration(text,uuid),
  public.complete_beta_registration(uuid,uuid),public.fail_beta_lifecycle_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_beta_lifecycle_operation(uuid,uuid,text),
  public.prepare_beta_invitation(uuid,uuid,text),public.complete_beta_invitation(uuid,uuid,boolean,text),
  public.inspect_beta_registration(text),public.begin_beta_registration(text,uuid),
  public.complete_beta_registration(uuid,uuid),public.fail_beta_lifecycle_operation(uuid,uuid) to service_role;

create or replace function public.activate_beta_access()
returns setof public.workspace_licenses language plpgsql security definer set search_path = '' as $$
declare v_application public.beta_applications; v_license public.workspace_licenses;
begin
  if (select auth.uid()) is null then raise exception 'Nicht angemeldet' using errcode='42501'; end if;
  select * into v_application from public.beta_applications where auth_user_id=(select auth.uid()) and status='accepted' for update;
  if not found then return; end if;
  select * into v_license from public.workspace_licenses where beta_application_id=v_application.id for update;
  if v_license.status<>'pending' then return next v_license; return; end if;
  if v_application.registration_link_kind='managed' or v_application.revoked_at is not null
    or v_application.invitation_expires_at<=now() then raise exception 'Registrierungslink ist ungültig oder abgelaufen' using errcode='22023'; end if;
  -- Altlinks benötigen einen tatsächlich bestätigten Auth-Nutzer mit Passwort.
  if not exists(select 1 from auth.users where id=(select auth.uid()) and email_confirmed_at is not null
    and nullif(encrypted_password,'') is not null) then raise exception 'Die Registrierung ist noch nicht abgeschlossen' using errcode='22023'; end if;
  update public.workspace_licenses set status='active',starts_at=now(),ends_at=now()+make_interval(days=>granted_days),updated_at=now()
    where workspace_id=v_license.workspace_id returning * into v_license;
  update public.beta_applications set registered_at=now() where id=v_application.id;
  return next v_license;
end;
$$;

create function public.workspace_has_business_data(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.workspaces where id=p_workspace_id and setup_completed_at is not null)
    or exists (select 1 from public.catalog_products where workspace_id = p_workspace_id)
    or exists (select 1 from public.marketplace_connections where workspace_id = p_workspace_id)
    or exists (select 1 from public.ebay_connections where workspace_id = p_workspace_id)
    or exists (select 1 from public.purchases where workspace_id = p_workspace_id)
    or exists (select 1 from public.inventory_items where workspace_id = p_workspace_id)
    or exists (select 1 from public.stock_lots where workspace_id = p_workspace_id)
    or exists (select 1 from public.stock_movements where workspace_id = p_workspace_id)
    or exists (select 1 from public.sales where workspace_id = p_workspace_id)
    or exists (select 1 from public.inventory_reconciliation_events where workspace_id = p_workspace_id)
    or exists (select 1 from public.business_events where workspace_id = p_workspace_id)
    or exists (select 1 from public.activity_logs where workspace_id = p_workspace_id)
    or exists (select 1 from public.returns where workspace_id = p_workspace_id)
    or exists (select 1 from public.invoices where workspace_id = p_workspace_id)
    or exists (select 1 from public.email_confirmations where workspace_id = p_workspace_id)
    or exists (select 1 from public.shipping_orders where workspace_id = p_workspace_id)
    or exists (select 1 from public.store_orders where workspace_id = p_workspace_id)
    or exists (select 1 from public.bank_transactions where workspace_id = p_workspace_id)
    or exists (select 1 from public.offline_purchase_entries where workspace_id = p_workspace_id)
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = p_workspace_id)
    or exists (select 1 from public.catalog_product_media where workspace_id = p_workspace_id)
    or exists (select 1 from public.purchase_receipt_requests where workspace_id = p_workspace_id)
    or exists (select 1 from public.purchase_documents where workspace_id = p_workspace_id)
    or exists (select 1 from public.expense_recurring_rules where workspace_id = p_workspace_id)
    or exists (select 1 from public.expenses where workspace_id = p_workspace_id)
    or exists (select 1 from public.expense_documents where workspace_id = p_workspace_id)
    or exists (select 1 from public.ebay_order_bookings where workspace_id = p_workspace_id); $$;
revoke all on function public.workspace_has_business_data(uuid) from public,anon,authenticated;
grant execute on function public.workspace_has_business_data(uuid) to service_role;

create function public.prepare_beta_withdrawal(p_application_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_application public.beta_applications; v_operation public.beta_lifecycle_operations; v_workspace_id uuid; v_user_id uuid;
begin
  -- Die erfolgreiche Wiederholung bleibt auch nach gelöschter Bewerbung erkennbar.
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  if found and v_operation.action='withdraw' and v_operation.status='succeeded'
    and v_operation.result->>'application_id'=p_application_id::text then return '{"replayed":true}'::jsonb; end if;
  v_operation:=public.claim_beta_lifecycle_operation(p_application_id,p_request_id,'withdraw');
  select * into v_application from public.beta_applications where id=p_application_id;
  if v_application.status<>'accepted' or v_application.registered_at is not null then
    raise exception 'Nur ausstehende Registrierungen können zurückgezogen werden' using errcode='22023'; end if;
  v_user_id:=coalesce(v_application.withdrawal_user_id,v_application.auth_user_id);
  select workspace_id into v_workspace_id from public.workspace_licenses where beta_application_id=p_application_id and status='pending' for update;
  v_workspace_id:=coalesce(v_application.withdrawal_workspace_id,v_workspace_id);
  if exists(select 1 from public.platform_operators where user_id=v_user_id)
    or exists(select 1 from public.workspace_licenses where beta_application_id=p_application_id and status<>'pending')
    or (v_application.registration_link_kind='legacy' and exists(select 1 from auth.users where id=v_user_id and nullif(encrypted_password,'') is not null))
    or exists(select 1 from public.workspace_members where user_id=v_user_id and workspace_id is distinct from v_workspace_id)
    or exists(select 1 from public.workspace_members where workspace_id=v_workspace_id and (user_id<>v_user_id or role<>'owner'))
    or public.workspace_has_business_data(v_workspace_id) then
    raise exception 'Das Konto wird bereits verwendet und kann nicht als offene Registrierung gelöscht werden' using errcode='22023'; end if;
  update public.beta_applications set revoked_at=coalesce(revoked_at,now()),withdrawal_user_id=v_user_id,
    withdrawal_workspace_id=v_workspace_id,withdrawal_status='revoked',withdrawal_last_error=null where id=p_application_id;
  update public.beta_registration_links set revoked_at=coalesce(revoked_at,now()) where application_id=p_application_id;
  update public.beta_lifecycle_operations set result=jsonb_build_object('application_id',p_application_id,'user_id',v_user_id,'workspace_id',v_workspace_id) where request_id=p_request_id;
  return jsonb_build_object('user_id',v_user_id,'workspace_id',v_workspace_id,'lease_id',v_operation.lease_id,'replayed',false);
end;
$$;

create function public.complete_beta_withdrawal(p_request_id uuid,p_lease_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_operation public.beta_lifecycle_operations;
begin
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id;
  perform 1 from public.beta_applications where id=v_operation.application_id for update;
  select * into v_operation from public.beta_lifecycle_operations where request_id=p_request_id for update;
  if v_operation.status='succeeded' then return; end if;
  if v_operation.action<>'withdraw' or v_operation.lease_id<>p_lease_id or v_operation.status<>'processing' then
    raise exception 'Ungültiger Löschvorgang' using errcode='22023'; end if;
  if exists(select 1 from auth.users where id=(v_operation.result->>'user_id')::uuid) then
    raise exception 'Auth-Konto ist noch vorhanden' using errcode='22023'; end if;
  -- Ausschließlich der vorher gesperrte, leere Vorbereitungs-Workspace wird gelöscht.
  -- Der bestehende Belegschutz prüft erneut und stoppt bei Geschäftsdaten.
  delete from public.workspaces where id=(v_operation.result->>'workspace_id')::uuid;
  delete from public.beta_applications where id=v_operation.application_id and revoked_at is not null and registered_at is null;
  update public.beta_lifecycle_operations set status='succeeded' where request_id=p_request_id;
end;
$$;
revoke all on function public.prepare_beta_withdrawal(uuid,uuid),public.complete_beta_withdrawal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_beta_withdrawal(uuid,uuid),public.complete_beta_withdrawal(uuid,uuid) to service_role;

-- Verhindert verspätete Auth-Kontoerstellung nach Rücknahme oder Ablauf der Einladungsvorbereitung.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_ws_id uuid;
  v_beta_application_id uuid;
  v_granted_days integer;
  v_application_id_text text := new.raw_user_meta_data->>'beta_application_id';
begin
  if v_application_id_text is not null then
    if v_application_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Ungültige Beta-Bewerbung' using errcode='42501'; end if;
    perform 1 from public.beta_applications as application where application.id=v_application_id_text::uuid
      and application.status='accepted' and application.revoked_at is null
      and application.auth_user_id is null and lower(application.email)=lower(new.email)
      and (application.registration_link_kind='legacy' or exists(select 1 from public.beta_lifecycle_operations
        where application_id=application.id and action='invite' and status='processing' and lease_expires_at>now())) for update;
    if not found then raise exception 'Beta-Freigabe ist nicht mehr gültig' using errcode='42501'; end if;
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'Reseller'));

  insert into public.workspaces (name, min_roi_percent, min_profit_amount)
  values ('Mein Workspace', 30.0, 15.0)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_ws_id, new.id, 'owner');

  insert into public.workspace_company_profiles(workspace_id)
  values (new_ws_id);

  insert into public.sources (workspace_id, name, is_default)
  values
    (new_ws_id, 'Kleinanzeigen', true),
    (new_ws_id, 'eBay', false),
    (new_ws_id, 'Vinted', false),
    (new_ws_id, 'Flohmarkt', false),
    (new_ws_id, 'meinePacks', false),
    (new_ws_id, 'B-Stock / Retouren', false),
    (new_ws_id, 'Grosshaendler / Palette', false);

  if v_application_id_text is not null
     and v_application_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_beta_application_id := v_application_id_text::uuid;

    update public.beta_applications
    set auth_user_id = new.id
    where id = v_beta_application_id
      and status = 'accepted'
      and lower(email) = lower(new.email)
      and (auth_user_id is null or auth_user_id = new.id)
    returning id, granted_days
    into v_beta_application_id, v_granted_days;

    if found then
      insert into public.workspace_licenses (
        workspace_id,
        beta_application_id,
        access_source,
        status,
        granted_days
      ) values (
        new_ws_id,
        v_beta_application_id,
        'beta',
        'pending',
        v_granted_days
      )
      on conflict (workspace_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

create function public.protect_pending_beta_auth_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_application public.beta_applications;
begin
  select * into v_application from public.beta_applications where withdrawal_user_id=old.id and revoked_at is not null for update;
  if not found then return old; end if;
  perform 1 from public.workspaces where id=v_application.withdrawal_workspace_id for update;
  if v_application.registered_at is not null
    or exists(select 1 from public.platform_operators where user_id=old.id)
    or exists(select 1 from public.workspace_members where user_id=old.id and workspace_id is distinct from v_application.withdrawal_workspace_id)
    or exists(select 1 from public.workspace_members where workspace_id=v_application.withdrawal_workspace_id and (user_id<>old.id or role<>'owner'))
    or public.workspace_has_business_data(v_application.withdrawal_workspace_id) then
    raise exception 'Das Konto wird bereits verwendet und kann nicht als offene Registrierung gelöscht werden' using errcode='22023'; end if;
  return old;
end;
$$;
revoke all on function public.protect_pending_beta_auth_deletion() from public,anon,authenticated,service_role;
create trigger protect_pending_beta_auth_deletion before delete on auth.users for each row execute function public.protect_pending_beta_auth_deletion();
