-- Zweck: Beta-Laufzeiten erst nach der abgeschlossenen Passwortregistrierung starten.
-- Betroffen: public.activate_beta_access().

create or replace function public.activate_beta_access()
returns setof public.workspace_licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications;
  v_license public.workspace_licenses;
  v_started_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = (select auth.uid())
      and auth_user.raw_user_meta_data->>'beta_registration_completed' = 'true'
  ) then
    raise exception 'Die Registrierung ist noch nicht abgeschlossen'
      using errcode = '22023';
  end if;

  select application.*
  into v_application
  from public.beta_applications as application
  where application.auth_user_id = (select auth.uid())
    and application.status = 'accepted'
  for update;

  if not found then
    return;
  end if;

  select license.*
  into v_license
  from public.workspace_licenses as license
  where license.beta_application_id = v_application.id
  for update;

  if not found then
    raise exception 'Ausstehende Beta-Lizenz nicht gefunden' using errcode = 'P0002';
  end if;

  if v_license.status = 'pending' then
    update public.workspace_licenses
    set status = 'active',
        starts_at = v_started_at,
        ends_at = v_started_at + make_interval(days => granted_days),
        updated_at = v_started_at
    where workspace_id = v_license.workspace_id
    returning * into v_license;
  end if;

  update public.beta_applications
  set registered_at = coalesce(registered_at, v_license.starts_at)
  where id = v_application.id;

  return next v_license;
end;
$$;
