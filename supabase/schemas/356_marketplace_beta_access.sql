-- Lokale Vinted-Funktionen für aktive Workspaces; Cloud bleibt beim Betreiberpilot.
create or replace function public.marketplace_workspace_authorization_valid(p_workspace_id uuid, p_user_id uuid)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
begin
  if not public.workspace_access_is_valid(p_workspace_id)
    or not public.marketplace_local_extension_user_valid(p_user_id) then return false; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found then return false; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  return found;
end;
$$;
revoke all on function public.marketplace_workspace_authorization_valid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marketplace_workspace_authorization_valid(uuid, uuid) to service_role;

