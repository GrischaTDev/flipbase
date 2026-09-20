-- Zweck: Ablehnungs-E-Mails nachverfolgen und unverknuepfte abgelehnte
-- Beta-Bewerbungen kontrolliert loeschen koennen.
-- Betroffen: public.beta_applications sowie die Funktionen
-- public.reject_beta_application und public.delete_rejected_beta_application.

alter table public.beta_applications
  add column rejection_email_status text not null default 'not_sent'
    check (rejection_email_status in ('not_sent', 'sending', 'sent', 'failed')),
  add column rejection_email_sent_at timestamptz,
  add column rejection_email_last_error text;

create or replace function public.reject_beta_application(
  p_application_id uuid
)
returns public.beta_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications;
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen Beta-Bewerbungen ablehnen'
      using errcode = '42501';
  end if;

  select application.*
  into v_application
  from public.beta_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'Beta-Bewerbung nicht gefunden' using errcode = 'P0002';
  end if;

  if v_application.status <> 'open' then
    raise exception 'Nur offene Beta-Bewerbungen koennen abgelehnt werden'
      using errcode = '22023';
  end if;

  update public.beta_applications
  set status = 'rejected',
      granted_days = null,
      decided_by = (select auth.uid()),
      decided_at = now(),
      invitation_status = 'not_sent',
      invitation_last_error = null,
      rejection_email_status = 'sending',
      rejection_email_sent_at = null,
      rejection_email_last_error = null
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

create function public.delete_rejected_beta_application(
  p_application_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications;
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen abgelehnte Beta-Bewerbungen loeschen'
      using errcode = '42501';
  end if;

  select application.*
  into v_application
  from public.beta_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'Beta-Bewerbung nicht gefunden' using errcode = 'P0002';
  end if;

  if v_application.status <> 'rejected' then
    raise exception 'Nur abgelehnte Beta-Bewerbungen koennen geloescht werden'
      using errcode = '22023';
  end if;

  if v_application.auth_user_id is not null or exists (
    select 1
    from public.workspace_licenses as license
    where license.beta_application_id = p_application_id
  ) then
    raise exception 'Eine bereits verknuepfte Beta-Bewerbung kann nicht geloescht werden'
      using errcode = '22023';
  end if;

  delete from public.beta_applications
  where id = p_application_id;

  return p_application_id;
end;
$$;

comment on function public.delete_rejected_beta_application(uuid) is
  'Loescht ausschliesslich unverknuepfte, abgelehnte Bewerbungen, damit die E-Mail-Adresse wieder fuer eine neue Bewerbung frei wird.';

revoke all on function public.delete_rejected_beta_application(uuid) from public;
revoke all on function public.delete_rejected_beta_application(uuid) from anon;
grant execute on function public.delete_rejected_beta_application(uuid) to authenticated;
grant execute on function public.delete_rejected_beta_application(uuid) to service_role;
