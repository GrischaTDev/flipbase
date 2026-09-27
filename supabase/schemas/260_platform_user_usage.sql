-- Betreiberuebersicht: letzter Login und bereits protokollierte Kernaktionen.
-- Betroffene Daten: auth.users.last_sign_in_at und public.business_events.
-- Es werden keine neuen Nutzungsereignisse oder Seitenaufrufe gespeichert.

create index if not exists business_events_actor_created_idx
  on public.business_events (actor_id, created_at desc)
  where actor_id is not null;

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
  sales_recorded_30_days bigint
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
    coalesce(recent_actions.sales_recorded, 0::bigint)
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
  'Zeigt Betreibern Loginzeit und nachweisbare Kernaktionen je Nutzer, ohne Seitenaufrufe zu erfassen.';

alter function public.list_platform_user_usage() owner to postgres;
revoke all on function public.list_platform_user_usage() from public, anon;
grant execute on function public.list_platform_user_usage() to authenticated;

create or replace function public.list_platform_user_recent_actions(p_user_id uuid)
returns table (
  event_id uuid,
  event_type text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'Nur Betreiber duerfen Nutzeraktionen lesen'
      using errcode = '42501';
  end if;

  return query
  select event.id, event.event_type, event.created_at
  from public.business_events as event
  where event.actor_id = p_user_id
    and event.event_type in (
      'purchase_draft_created',
      'purchase_finalized',
      'sale_recorded'
    )
  order by event.created_at desc, event.id desc
  limit 10;
end;
$$;

comment on function public.list_platform_user_recent_actions(uuid) is
  'Zeigt Betreibern nur Art und Zeitpunkt der letzten zehn Einkaufs- und Verkaufsaktionen.';

alter function public.list_platform_user_recent_actions(uuid) owner to postgres;
revoke all on function public.list_platform_user_recent_actions(uuid) from public, anon;
grant execute on function public.list_platform_user_recent_actions(uuid) to authenticated;
