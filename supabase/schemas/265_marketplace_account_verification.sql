-- Bestätigt nur die Identität einer aktiven, kontogebundenen Browsersitzung.
-- Betroffen: marketplace_connections, marketplace_account_entries und marketplace_browser_sessions.
create or replace function public.marketplace_browser_confirm_account(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_session_id uuid,
  p_user_id uuid,
  p_external_account_id text,
  p_username text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_connection public.marketplace_connections;
  v_session public.marketplace_browser_sessions;
  v_observed_at timestamptz := clock_timestamp();
begin
  -- Gleiche Sperrreihenfolge wie Zeitplanänderungen und Dispatcher.
  perform pg_advisory_xact_lock(91731, 1);
  if p_external_account_id is null or p_external_account_id !~ '^[1-9][0-9]{0,31}$'
    or p_username is null or char_length(btrim(p_username)) not between 1 and 120
    or p_username ~ '[[:cntrl:]]'
  then
    raise exception 'Ungültige Vinted-Identität' using errcode = '22023';
  end if;

  select * into v_connection
    from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted'
    for update;
  if not found or v_connection.status in ('paused', 'blocked') then
    raise exception 'Kontoverbindung nicht verfügbar' using errcode = '42501';
  end if;

  select * into v_session
    from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id
      and connection_id = p_connection_id and started_by = p_user_id
    for update;
  if not found or v_session.state <> 'active' or v_session.expires_at <= v_observed_at then
    raise exception 'Browsersitzung nicht verfügbar' using errcode = '42501';
  end if;

  if not exists (select 1 from public.platform_operators where user_id = p_user_id)
    or not exists (
      select 1 from public.workspace_members
      where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin')
    )
    or not exists (
      select 1 from public.workspaces where id = p_workspace_id and archived_at is null
    )
  then
    raise exception 'Kontozugriff verweigert' using errcode = '42501';
  end if;

  if v_connection.external_account_id is not null
    and v_connection.external_account_id <> p_external_account_id
  then
    raise exception 'Anderes Vinted-Konto angemeldet' using errcode = '23505';
  end if;

  update public.marketplace_connections
    set external_account_id = p_external_account_id,
      status = 'connected',
      capabilities = jsonb_set(capabilities, '{profile.read}', '"verified"'::jsonb, true),
      updated_at = v_observed_at
    where id = p_connection_id;

  -- Neue bestätigte Konten erhalten die Standardautomatik. Eine vorhandene
  -- Pause oder ein bewusst gewählter Abstand wird niemals überschrieben.
  insert into public.marketplace_sync_schedules
    (workspace_id, connection_id, enabled, activated_by, interval_minutes, next_due_at)
  values (p_workspace_id, p_connection_id, true, p_user_id, 15,
    v_observed_at + interval '15 minutes')
  on conflict (workspace_id, connection_id) do nothing;

  insert into public.marketplace_account_entries
    (workspace_id, connection_id, kind, external_id, body, sort_at, observed_at)
  values (
    p_workspace_id, p_connection_id, 'profile', p_external_account_id,
    jsonb_build_object('username', btrim(p_username), 'displayName', btrim(p_username)),
    v_observed_at, v_observed_at
  )
  on conflict (workspace_id, connection_id, kind, external_id)
  do update set body = public.marketplace_account_entries.body || excluded.body;

  return jsonb_build_object('workspaceId', p_workspace_id,
    'connectionId', p_connection_id, 'externalAccountId', p_external_account_id,
    'username', btrim(p_username));
end;
$$;
revoke all on function public.marketplace_browser_confirm_account(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.marketplace_browser_confirm_account(uuid, uuid, uuid, uuid, text, text) to service_role;
