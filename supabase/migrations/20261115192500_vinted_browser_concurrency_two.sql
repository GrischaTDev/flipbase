-- Erhöht die Standardkapazität des Vinted-Cloud-Browserpools auf zwei gleichzeitige Browser
-- und begrenzt die gleichzeitige Nutzung je Arbeitsbereich auf maximal zwei Browser.
alter table public.marketplace_browser_pool_settings
  alter column max_browsers set default 2;

update public.marketplace_browser_pool_settings
set max_browsers = 2,
    updated_at = clock_timestamp()
where id = 1;

create or replace function public.marketplace_browser_slot_status(p_workspace_id uuid,p_connection_id uuid)
returns text language sql stable security invoker set search_path='' as $$
  select case when exists(select 1 from public.marketplace_browser_sessions where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('active','stopping')) then 'account_busy'
    when (select count(*) from public.marketplace_browser_sessions where workspace_id=p_workspace_id and state in ('active','stopping'))>=2 then 'pool_busy'
    when (select count(*) from public.marketplace_browser_sessions where state in ('active','stopping'))>=public.marketplace_browser_effective_capacity() then 'pool_busy'
    else null end;
$$;

revoke all on function public.marketplace_browser_slot_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marketplace_browser_slot_status(uuid, uuid) to service_role;
