-- Beta-Laufzeiten und serverseitig überprüfbare Workspace-Zugänge.
alter table public.workspace_licenses add column ended_at timestamptz;

create function public.workspace_access_is_valid(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspaces where id=p_workspace_id)
    and not exists(select 1 from public.workspace_licenses as license
      left join public.beta_applications as application on application.id=license.beta_application_id
      where license.workspace_id=p_workspace_id and
        (license.status<>'active' or license.ended_at is not null
        or (license.ends_at is not null and license.ends_at<=now()) or application.revoked_at is not null));
$$;
create function public.can_access_workspace(ws_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_member(ws_id) and public.workspace_access_is_valid(ws_id);
$$;
create function public.can_administer_workspace(ws_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin(ws_id) and public.workspace_access_is_valid(ws_id);
$$;
create function public.user_can_access_workspace(p_workspace_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
    and public.workspace_access_is_valid(p_workspace_id);
$$;
revoke all on function public.workspace_access_is_valid(uuid),public.can_access_workspace(uuid),public.can_administer_workspace(uuid),public.user_can_access_workspace(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_access_workspace(uuid),public.can_administer_workspace(uuid) to authenticated,service_role;
grant execute on function public.workspace_access_is_valid(uuid),public.user_can_access_workspace(uuid,uuid) to service_role;

create function public.list_my_workspace_access()
returns table(workspace_id uuid,access_status text,ends_at timestamptz,server_time timestamptz)
language sql stable security definer set search_path = '' as $$
  select member.workspace_id,
    case when application.revoked_at is not null then 'revoked'
      when license.ended_at is not null then 'ended'
      when license.status='pending' then 'pending'
      when license.status='suspended' then 'suspended'
      when license.status='expired' or license.ends_at<=now() then 'expired'
      else 'active' end,
    license.ends_at,now()
  from public.workspace_members as member
  left join public.workspace_licenses as license on license.workspace_id=member.workspace_id
  left join public.beta_applications as application on application.id=license.beta_application_id
  where member.user_id=(select auth.uid());
$$;
revoke all on function public.list_my_workspace_access() from public,anon;
grant execute on function public.list_my_workspace_access() to authenticated;

create function public.list_platform_beta_lifecycle()
returns table(application_id uuid,auth_user_id uuid,workspace_id uuid,invitation_expires_at timestamptz,revoked_at timestamptz,ended_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_operator() then raise exception 'Nur für Betreiber' using errcode='42501'; end if;
  return query select application.id,application.auth_user_id,license.workspace_id,application.invitation_expires_at,application.revoked_at,license.ended_at
    from public.beta_applications as application left join public.workspace_licenses as license on license.beta_application_id=application.id;
end;
$$;
revoke all on function public.list_platform_beta_lifecycle() from public,anon;
grant execute on function public.list_platform_beta_lifecycle() to authenticated;

create function public.change_beta_duration(p_application_id uuid,p_request_id uuid,p_action text,p_days integer)
returns public.workspace_licenses language plpgsql security definer set search_path = '' as $$
declare v_operation public.beta_lifecycle_operations; v_license public.workspace_licenses;
begin
  if not public.is_platform_operator() then raise exception 'Nur für Betreiber' using errcode='42501'; end if;
  if p_action not in ('extend','end') or (p_action='extend' and (p_days is null or p_days<1 or p_days>3650)) then
    raise exception 'Bitte eine ganze Zahl zwischen 1 und 3650 Tagen eingeben' using errcode='22023'; end if;
  v_operation:=public.claim_beta_lifecycle_operation(p_application_id,p_request_id,p_action);
  if v_operation.status='succeeded' then
    if v_operation.result->>'days' is distinct from p_days::text then raise exception 'Vorgangskennung bereits verwendet' using errcode='22023'; end if;
    return jsonb_populate_record(null::public.workspace_licenses,v_operation.result->'license');
  end if;
  select * into v_license from public.workspace_licenses where beta_application_id=p_application_id for update;
  if not found or v_license.access_source<>'beta' or v_license.status in ('pending','suspended')
    or not exists(select 1 from public.beta_applications where id=p_application_id and registered_at is not null and revoked_at is null) then
    raise exception 'Nur registrierte Beta-Konten können geändert werden' using errcode='22023'; end if;
  update public.workspace_licenses set
    ends_at=case when p_action='end' then now() else
      (case when status='active' and ended_at is null and ends_at>now() then ends_at else now() end)+make_interval(days=>p_days) end,
    ended_at=case when p_action='end' then now() else null end,
    status=case when p_action='end' then 'expired' else 'active' end,updated_at=now()
    where workspace_id=v_license.workspace_id returning * into v_license;
  update public.beta_lifecycle_operations set status='succeeded',result=jsonb_build_object('days',p_days,'license',to_jsonb(v_license)) where request_id=p_request_id;
  return v_license;
end;
$$;
revoke all on function public.change_beta_duration(uuid,uuid,text,integer) from public,anon;
grant execute on function public.change_beta_duration(uuid,uuid,text,integer) to authenticated;

create function public.broadcast_workspace_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('workspace_id',new.workspace_id),'workspace_access_changed','workspace:'||new.workspace_id::text||':access',true);
  return new;
end;
$$;
revoke all on function public.broadcast_workspace_access() from public,anon,authenticated,service_role;
create trigger broadcast_workspace_access after insert or update on public.workspace_licenses
for each row execute function public.broadcast_workspace_access();
create policy "Mitglieder empfangen Zugangsänderungen" on realtime.messages for select to authenticated
using (extension='broadcast' and topic like 'workspace:%:access' and exists(
  select 1 from public.workspace_members where user_id=(select auth.uid()) and topic='workspace:'||workspace_id::text||':access'));

create function public.user_has_workspace_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_members where user_id=p_user_id and public.workspace_access_is_valid(workspace_id));
$$;
revoke all on function public.user_has_workspace_access(uuid) from public,anon,authenticated;
grant execute on function public.user_has_workspace_access(uuid) to service_role;
