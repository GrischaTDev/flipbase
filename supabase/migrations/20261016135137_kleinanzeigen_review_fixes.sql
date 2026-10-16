-- Zweck: Bestätigte Kontometadaten in kleinanzeigen_connections aktualisieren und begonnene kleinanzeigen_publication_jobs ohne neue Schreibfreigabe prüfen.
set check_function_bodies = off;

create or replace function public.kleinanzeigen_check_listing(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_job_id bigint, p_claim_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_job public.kleinanzeigen_publication_jobs;v_snapshot jsonb;v_session jsonb;
begin
 v_job:=public.kleinanzeigen_locked_listing(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_job_id,p_claim_token);
 -- Nach begin prüft derselbe ursprüngliche Versuch nur seine unveränderte Freigabe.
 -- Keine Verlängerung, neue Reservierung oder erneute Schreibberechtigung.
 if v_job.state='writing' and v_job.started_at is not null then
  return jsonb_build_object('active',v_job.lease_until is not null and v_job.absolute_expires_at is not null and v_job.started_at<=clock_timestamp() and v_job.lease_until>clock_timestamp() and v_job.absolute_expires_at>clock_timestamp(),'generation',v_job.grant_generation,'version',v_job.version,'leaseUntil',v_job.lease_until);
 end if;
 if v_job.state<>'claimed' or v_job.lease_until<=clock_timestamp() or v_job.absolute_expires_at<=clock_timestamp() then return jsonb_build_object('active',false,'generation',v_job.grant_generation,'version',v_job.version,'leaseUntil',v_job.lease_until);end if;
 v_snapshot:=public.kleinanzeigen_prepare_listing_job(p_workspace_id,p_connection_id,v_job.draft_id,v_job.draft_revision,v_job.requested_by);
 if (v_snapshot-'images') is distinct from (v_job.immutable_snapshot-'images') then raise exception 'Zielfassung inzwischen geändert.' using errcode='40001';end if;
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 update public.kleinanzeigen_publication_jobs set lease_until=least((v_session->>'expiresAt')::timestamptz,v_job.absolute_expires_at,clock_timestamp()+interval '120 seconds') where id=p_job_id returning * into v_job;
 return jsonb_build_object('active',true,'generation',v_job.grant_generation,'version',v_job.version,'leaseUntil',v_job.lease_until);
end;
$function$
;

create or replace function public.kleinanzeigen_connect_account(p_workspace_id uuid, p_external_account_id text, p_display_name text, p_account_type text, p_installation_id uuid, p_token_hash text, p_can_publish boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_connection public.kleinanzeigen_connections; v_grant public.kleinanzeigen_local_grants;
begin
 if not public.marketplace_can_manage(p_workspace_id)
   or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid()))
   or not public.marketplace_local_extension_user_valid((select auth.uid())) then
   raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501';
 end if;
 if p_external_account_id is null or p_external_account_id !~ '^[1-9][0-9]{0,31}$'
   or p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120
   or p_account_type is null or p_account_type not in ('private','commercial','unknown')
   or p_installation_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
   or p_can_publish is null then raise exception 'Ungültige Kontobindung.' using errcode='22023'; end if;
 -- Dieselbe externe Identität im Workspace wird auch bei paralleler Erstbindung serialisiert.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':kleinanzeigen:' || p_external_account_id,0));
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and external_account_id=p_external_account_id for update;
 if not found then
   insert into public.kleinanzeigen_connections(workspace_id,external_account_id,display_name,account_type,created_by)
   values(p_workspace_id,p_external_account_id,btrim(p_display_name),p_account_type,(select auth.uid())) returning * into v_connection;
 end if;
 select * into v_grant from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=v_connection.id for update;
 if found and v_grant.revoked_at is null and v_grant.expires_at>clock_timestamp() then
   if v_grant.approved_by is distinct from (select auth.uid()) or v_grant.installation_id<>p_installation_id or v_grant.token_hash<>p_token_hash or v_grant.can_publish<>p_can_publish then
     raise exception 'Dieses Konto ist bereits an eine aktive Installation gebunden.' using errcode='55P03';
   end if;
 else
   insert into public.kleinanzeigen_local_grants(workspace_id,connection_id,approved_by,installation_id,token_hash,expires_at,can_publish)
   values(p_workspace_id,v_connection.id,(select auth.uid()),p_installation_id,p_token_hash,clock_timestamp()+interval '24 hours',p_can_publish)
   on conflict(workspace_id,connection_id) do update set approved_by=excluded.approved_by,installation_id=excluded.installation_id,
    token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null,can_publish=excluded.can_publish,last_seen_at=null,
    grant_generation=public.kleinanzeigen_local_grants.grant_generation+1 returning * into v_grant;
   update public.kleinanzeigen_connections set status='needs_login',quota_used=null,quota_observed_at=null where id=v_connection.id returning * into v_connection;
 end if;
 -- Erst nach Prüfung einer bestehenden aktiven Installation bestätigte Metadaten übernehmen.
 if v_connection.display_name is distinct from btrim(p_display_name) or v_connection.account_type is distinct from p_account_type then
  update public.kleinanzeigen_connections set display_name=btrim(p_display_name),account_type=p_account_type where workspace_id=p_workspace_id and id=v_connection.id returning * into v_connection;
 end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',v_connection.id::text,'externalAccountId',v_connection.external_account_id,
  'displayName',v_connection.display_name,'accountType',v_connection.account_type,'status',v_connection.status,
  'generation',v_grant.grant_generation,'expiresAt',v_grant.expires_at,'canPublish',v_grant.can_publish);
end;
$function$
;

-- Explicit Kleinanzeigen review fix permissions from declarative schema
revoke all on function public.kleinanzeigen_connect_account(uuid,text,text,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_connect_account(uuid,text,text,text,uuid,text,boolean) to authenticated;
revoke all on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) to service_role;
