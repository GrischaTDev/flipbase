-- Zweck: Verknuepfte Nutzer-, Bewerbungs- und Beta-Lizenzuebersicht fuer Betreiber.
-- Betroffen: public.list_platform_users().

create function public.list_platform_users()
returns table (
  user_id uuid,
  full_name text,
  email text,
  workspace_id uuid,
  workspace_name text,
  application_status text,
  invitation_status text,
  registered_at timestamptz,
  license_status text,
  beta_starts_at timestamptz,
  beta_ends_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen Plattformnutzer auflisten'
      using errcode = '42501';
  end if;

  return query
  select
    auth_user.id as user_id,
    coalesce(
      nullif(btrim(concat_ws(' ', application.first_name, application.last_name)), ''),
      nullif(btrim(profile.full_name), ''),
      split_part(auth_user.email, '@', 1)
    ) as full_name,
    coalesce(auth_user.email, profile.email, application.email)::text as email,
    membership.workspace_id,
    workspace.name as workspace_name,
    application.status as application_status,
    application.invitation_status,
    application.registered_at,
    license.status as license_status,
    license.starts_at as beta_starts_at,
    license.ends_at as beta_ends_at
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  left join public.beta_applications as application on application.auth_user_id = auth_user.id
  left join lateral (
    select member.workspace_id
    from public.workspace_members as member
    where member.user_id = auth_user.id
    order by member.created_at, member.id
    limit 1
  ) as membership on true
  left join public.workspaces as workspace on workspace.id = membership.workspace_id
  left join public.workspace_licenses as license on license.workspace_id = membership.workspace_id
  order by coalesce(application.registered_at, auth_user.created_at) desc, auth_user.id;
end;
$$;

comment on function public.list_platform_users() is
  'Liefert Betreibern eine verknuepfte Nutzer-, Bewerbungs- und Zugangsuebersicht ohne Zahlungsdaten.';

revoke all on function public.list_platform_users() from public, anon;
grant execute on function public.list_platform_users() to authenticated;
