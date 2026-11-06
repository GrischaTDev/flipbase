-- Betreiberrolle in der Nutzungsuebersicht (Funktion list_platform_user_usage).
-- Neue Rueckgabespalte is_platform_operator aus public.platform_operators.
-- Keine Tabellen oder Daten betroffen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

-- Der Rueckgabetyp aendert sich; Postgres erlaubt das nur ueber Entfernen und
-- Neuanlegen. Die Funktion haelt keine Daten, nur der Frontend-Aufruf haengt daran.
drop function if exists public.list_platform_user_usage();

create or replace function public.list_platform_user_usage()
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
  beta_ends_at timestamptz,
  last_sign_in_at timestamptz,
  last_action_at timestamptz,
  purchases_created_30_days bigint,
  sales_recorded_30_days bigint,
  is_platform_operator boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen die Nutzungsuebersicht lesen'
      using errcode = '42501';
  end if;

  return query
  select
    platform_user.user_id,
    platform_user.full_name,
    platform_user.email,
    platform_user.workspace_id,
    platform_user.workspace_name,
    platform_user.application_status,
    platform_user.invitation_status,
    platform_user.registered_at,
    platform_user.license_status,
    platform_user.beta_starts_at,
    platform_user.beta_ends_at,
    auth_user.last_sign_in_at,
    last_action.created_at,
    coalesce(recent_actions.purchases_created, 0::bigint),
    coalesce(recent_actions.sales_recorded, 0::bigint),
    exists (
      select 1
      from public.platform_operators as operator
      where operator.user_id = platform_user.user_id
    )
  from public.list_platform_users() as platform_user
  join auth.users as auth_user on auth_user.id = platform_user.user_id
  left join lateral (
    select event.created_at
    from public.business_events as event
    where event.actor_id = platform_user.user_id
    order by event.created_at desc, event.id desc
    limit 1
  ) as last_action on true
  left join lateral (
    select
      count(*) filter (where event.event_type = 'purchase_draft_created') as purchases_created,
      count(*) filter (where event.event_type = 'sale_recorded') as sales_recorded
    from public.business_events as event
    where event.actor_id = platform_user.user_id
      and event.created_at >= now() - interval '30 days'
  ) as recent_actions on true;
end;
$$;

comment on function public.list_platform_user_usage() is
  'Zeigt Betreibern Loginzeit, nachweisbare Kernaktionen und Betreiberrolle je Nutzer, ohne Seitenaufrufe zu erfassen.';

alter function public.list_platform_user_usage() owner to postgres;
revoke all on function public.list_platform_user_usage() from public, anon;
grant execute on function public.list_platform_user_usage() to authenticated;
