-- Eigene Schreibfreigaben; ein verbundener Browser und Lesezeitplan erlauben keinen Versand.
create table public.marketplace_cloud_message_permissions (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  connection_id uuid not null,
  approved_by uuid not null references auth.users(id) on delete cascade,
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  browser_profile_id bigint not null references public.marketplace_browser_profiles(id) on delete cascade,
  provider_profile_id text not null,
  authorization_version bigint not null default 1 check (authorization_version > 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,connection_id),
  foreign key(workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade
);
comment on table public.marketplace_cloud_message_permissions is 'Ausdrückliche Cloud-Schreibfreigabe für genau einen Nutzer, eine externe Kontoidentität und ein Browserprofil.';
create index marketplace_cloud_message_permissions_user on public.marketplace_cloud_message_permissions(approved_by);
create index marketplace_cloud_message_permissions_profile on public.marketplace_cloud_message_permissions(browser_profile_id);
alter table public.marketplace_cloud_message_permissions enable row level security;
revoke all on public.marketplace_cloud_message_permissions from public,anon,authenticated;
grant all on public.marketplace_cloud_message_permissions to service_role;
revoke all on sequence public.marketplace_cloud_message_permissions_id_seq from public,anon,authenticated;
grant usage,select on sequence public.marketplace_cloud_message_permissions_id_seq to service_role;
create policy "Worker reads cloud message permissions" on public.marketplace_cloud_message_permissions for select to service_role using(true);
create policy "Worker inserts cloud message permissions" on public.marketplace_cloud_message_permissions for insert to service_role with check(true);
create policy "Worker updates cloud message permissions" on public.marketplace_cloud_message_permissions for update to service_role using(true) with check(true);
create policy "Worker deletes cloud message permissions" on public.marketplace_cloud_message_permissions for delete to service_role using(true);

create or replace function public.marketplace_cloud_message_permission_valid(p_workspace_id uuid,p_connection_id uuid,p_user_id uuid,p_version bigint default null)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
begin
  return exists(select 1 from public.marketplace_cloud_message_permissions permission
    join public.marketplace_connections connection on connection.workspace_id=permission.workspace_id and connection.id=permission.connection_id
    join public.marketplace_browser_profiles profile on profile.id=permission.browser_profile_id and profile.workspace_id=permission.workspace_id and profile.connection_id=permission.connection_id
    where permission.workspace_id=p_workspace_id and permission.connection_id=p_connection_id and permission.approved_by=p_user_id
      and permission.revoked_at is null and (p_version is null or permission.authorization_version=p_version)
      and connection.marketplace='vinted' and connection.execution_mode='cloud' and connection.status='connected'
      and connection.external_account_id=permission.external_account_id and profile.provider_profile_id=permission.provider_profile_id)
    and public.marketplace_local_extension_user_valid(p_user_id)
    and public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id)
    and public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id);
end;
$$;
revoke all on function public.marketplace_cloud_message_permission_valid(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.marketplace_cloud_message_permission_valid(uuid,uuid,uuid,bigint) to service_role;

create or replace function public.marketplace_read_message_permission(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.marketplace_connections; v_allowed boolean; v_version bigint;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted';
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if v_connection.execution_mode='cloud' then
    v_allowed:=public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid()));
    select authorization_version into v_version from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=(select auth.uid());
  else
    select grant_generation into v_version from public.marketplace_local_extension_grants
      where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=(select auth.uid()) and messages_send
        and revoked_at is null and expires_at>clock_timestamp() and external_account_id=v_connection.external_account_id;
    v_allowed:=v_version is not null and v_connection.status='connected' and public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid()));
  end if;
  return jsonb_build_object('executionMode',v_connection.execution_mode,'allowed',coalesce(v_allowed,false),'authorizationVersion',coalesce(v_version,0));
end;
$$;
revoke all on function public.marketplace_read_message_permission(uuid,uuid) from public,anon;
grant execute on function public.marketplace_read_message_permission(uuid,uuid) to authenticated;

create or replace function public.marketplace_approve_cloud_messages(p_workspace_id uuid,p_connection_id uuid,p_expected_external_account_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.marketplace_connections; v_profile public.marketplace_browser_profiles;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not exists(select 1 from auth.users where id=(select auth.uid()) and not is_anonymous)
    or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found or v_connection.execution_mode<>'cloud' or v_connection.status<>'connected' or p_expected_external_account_id is null
    or v_connection.external_account_id is distinct from p_expected_external_account_id or not public.marketplace_cloud_network_valid(p_workspace_id,p_connection_id)
    then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_profile from public.marketplace_browser_profiles where workspace_id=p_workspace_id and connection_id=p_connection_id for share;
  if not found then raise exception 'Browserprofil fehlt' using errcode='42501'; end if;
  if public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,(select auth.uid())) then
    return public.marketplace_read_message_permission(p_workspace_id,p_connection_id);
  end if;
  insert into public.marketplace_cloud_message_permissions(workspace_id,connection_id,approved_by,external_account_id,browser_profile_id,provider_profile_id)
    values(p_workspace_id,p_connection_id,(select auth.uid()),p_expected_external_account_id,v_profile.id,v_profile.provider_profile_id)
    on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,external_account_id=excluded.external_account_id,
      browser_profile_id=excluded.browser_profile_id,provider_profile_id=excluded.provider_profile_id,
      authorization_version=public.marketplace_cloud_message_permissions.authorization_version+1,revoked_at=null,updated_at=clock_timestamp();
  return public.marketplace_read_message_permission(p_workspace_id,p_connection_id);
end;
$$;
revoke all on function public.marketplace_approve_cloud_messages(uuid,uuid,text) from public,anon;
grant execute on function public.marketplace_approve_cloud_messages(uuid,uuid,text) to authenticated;

create or replace function public.marketplace_revoke_cloud_messages(p_workspace_id uuid,p_connection_id uuid,p_authorization_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  update public.marketplace_cloud_message_permissions set revoked_at=clock_timestamp(),authorization_version=authorization_version+1,updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and connection_id=p_connection_id and authorization_version=p_authorization_version;
  if not found then raise exception 'Freigabe wurde zwischenzeitlich geändert' using errcode='40001'; end if;
  return public.marketplace_read_message_permission(p_workspace_id,p_connection_id);
end;
$$;
revoke all on function public.marketplace_revoke_cloud_messages(uuid,uuid,bigint) from public,anon;
grant execute on function public.marketplace_revoke_cloud_messages(uuid,uuid,bigint) to authenticated;
