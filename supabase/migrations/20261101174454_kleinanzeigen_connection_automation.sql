-- Automatische Erneuerung aktiver Kleinanzeigen-Freigaben und fälliger Inseratabgleich.
-- Betroffen: kleinanzeigen_local_grants und kleinanzeigen_sync_runs.
-- Erzeugter lokaler SQL-Abgleich mit den vollständigen deklarativen Funktionsrechten.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create function public.kleinanzeigen_maintain_connection (
  p_workspace_id        uuid,
  p_connection_id       bigint,
  p_token_hash          text,
  p_generation          bigint,
  p_external_account_id text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare
 v_session jsonb;
 v_grant public.kleinanzeigen_local_grants;
 v_connection public.kleinanzeigen_connections;
 v_run public.kleinanzeigen_sync_runs;
 v_expires_at timestamptz;
 v_result jsonb:=null;
begin
 -- Dieselbe Sperrfolge wie beim manuellen Abgleich: Konto, Freigabe, Lauf.
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 if p_external_account_id is null or p_external_account_id is distinct from v_session->>'externalAccountId' then
  raise exception 'Kleinanzeigen-Konto gewechselt.' using errcode='42501';
 end if;
 select * into strict v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id;
 select * into strict v_grant from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
 -- Ablauf und Widerruf werden vorher geprüft; eine erloschene Freigabe wird niemals wiederbelebt.
 v_expires_at:=greatest(v_grant.expires_at,clock_timestamp()+interval '30 days');
 update public.kleinanzeigen_local_grants set expires_at=v_expires_at where id=v_grant.id;
 v_session:=jsonb_set(v_session,'{expiresAt}',to_jsonb(v_expires_at));
 if v_connection.last_synced_at is null or v_connection.last_synced_at<=clock_timestamp()-interval '15 minutes' then
  update public.kleinanzeigen_sync_runs set state='cancelled',error_code='interrupted',completed_at=clock_timestamp()
   where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','reading')
   and (lease_until<=clock_timestamp() or grant_generation<>p_generation);
  select * into v_run from public.kleinanzeigen_sync_runs
   where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','reading');
  if not found then
   insert into public.kleinanzeigen_sync_runs(workspace_id,connection_id,grant_generation,requested_by,lease_until)
    values(p_workspace_id,p_connection_id,p_generation,v_grant.approved_by,clock_timestamp()+interval '3 minutes') returning * into v_run;
  end if;
  v_result:=jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,
   'runId',v_run.id::text,'state',v_run.state,'generation',v_run.grant_generation);
 end if;
 return jsonb_build_object('session',v_session,'run',v_result);
end;
$function$;

revoke all on function public.kleinanzeigen_maintain_connection(uuid, bigint, text, bigint, text) from public;

grant all on function public.kleinanzeigen_maintain_connection(uuid, bigint, text, bigint, text) to service_role;
revoke all on function public.kleinanzeigen_maintain_connection(uuid,bigint,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_maintain_connection(uuid,bigint,text,bigint,text) to service_role;
