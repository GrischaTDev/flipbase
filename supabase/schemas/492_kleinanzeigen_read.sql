-- Öffentliche Kontovorschau und paginierte bestätigte Inserate, ohne Installations- oder Claim-Secrets.
create index kleinanzeigen_publications_page on public.kleinanzeigen_publications(workspace_id,connection_id,id desc);
-- Definer nur für die ausdrückliche öffentliche Auswahl aus versteckten Freigaben und Laufmetadaten.
create or replace function public.kleinanzeigen_read_accounts(p_workspace_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_accounts jsonb; v_now timestamptz;
begin
 if not public.marketplace_can_manage(p_workspace_id) then return jsonb_build_object('workspaceId',p_workspace_id,'canManage',false,'accounts','[]'::jsonb); end if;
 if not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diese Konten.' using errcode='42501'; end if;
 v_now:=clock_timestamp();
 select coalesce(jsonb_agg(jsonb_build_object(
  'workspaceId',c.workspace_id,'connectionId',c.id::text,'externalAccountId',c.external_account_id,'displayName',c.display_name,'accountType',c.account_type,'status',c.status,'lastSyncedAt',c.last_synced_at,
  'listingCount',case when c.last_synced_at is null then null else s.listing_count end,
  'activeCount',case when c.last_synced_at is null or s.unknown_count>0 then null else s.active_count end,
  'quota',case when c.quota_used is null then null else jsonb_build_object('used',c.quota_used,'observedAt',c.quota_observed_at,'source','account_settings') end,
  'localGrant',case when g.id is null then null else jsonb_build_object('active',g.revoked_at is null and g.expires_at>v_now and c.status<>'disconnected' and public.marketplace_sync_authorization_valid(c.workspace_id,g.approved_by) and public.marketplace_local_extension_user_valid(g.approved_by),'canPublish',g.can_publish,'generation',g.grant_generation,'expiresAt',g.expires_at) end,
  'sync',case when r.id is null then null else jsonb_build_object('runId',r.id::text,'state',case when r.state in ('queued','reading') and r.lease_until<=v_now then 'failed' else r.state end,'errorCode',case when r.state in ('queued','reading') and r.lease_until<=v_now then 'interrupted' else r.error_code end,'pageCount',(select count(*) from jsonb_object_keys(r.accepted_pages)),'requestedAt',r.requested_at,'completedAt',r.completed_at) end
 ) order by c.created_at,c.id),'[]'::jsonb) into v_accounts
 from public.kleinanzeigen_connections c
 left join public.kleinanzeigen_local_grants g on g.workspace_id=c.workspace_id and g.connection_id=c.id
 left join lateral (select count(*) filter(where p.available)::integer as listing_count,count(*) filter(where p.available and p.state='active')::integer as active_count,count(*) filter(where p.available and p.state='unknown')::integer as unknown_count from public.kleinanzeigen_publications p where p.workspace_id=c.workspace_id and p.connection_id=c.id) s on true
 left join lateral (select * from public.kleinanzeigen_sync_runs sr where sr.workspace_id=c.workspace_id and sr.connection_id=c.id order by sr.id desc limit 1) r on true
 where c.workspace_id=p_workspace_id;
 return jsonb_build_object('workspaceId',p_workspace_id,'canManage',true,'accounts',v_accounts);
end;
$$;
revoke all on function public.kleinanzeigen_read_accounts(uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_accounts(uuid) to authenticated;

create or replace function public.kleinanzeigen_read_publications(p_workspace_id uuid,p_connection_id bigint,p_limit integer default 25,p_state text default 'all',p_search text default '',p_after_id bigint default null,p_snapshot_at timestamptz default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_connection public.kleinanzeigen_connections; v_snapshot timestamptz; v_rows jsonb; v_next text; v_count integer;
begin
 if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diese Inserate.' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 or p_state is null or p_state not in ('all','active','ended') or p_search is null or char_length(p_search)>200 or (p_after_id is not null and (p_after_id<=0 or p_snapshot_at is null)) then raise exception 'Ungültige Inseratauswahl.' using errcode='22023'; end if;
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id;
 if not found then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
 select greatest(v_connection.last_synced_at,max(observed_at)) into v_snapshot from public.kleinanzeigen_publications where workspace_id=p_workspace_id and connection_id=p_connection_id;
 if p_snapshot_at is not null and p_snapshot_at is distinct from v_snapshot then raise exception 'Inseratbestand inzwischen geändert. Lade die erste Seite erneut.' using errcode='40001'; end if;
 if p_after_id is not null and not exists(select 1 from public.kleinanzeigen_publications where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_after_id) then raise exception 'Cursor gehört nicht zu diesem Konto.' using errcode='22023'; end if;
 select count(*)::integer into v_count from public.kleinanzeigen_publications p where p.workspace_id=p_workspace_id and p.connection_id=p_connection_id
  and ((p_state='ended' and not p.available) or (p_state<>'ended' and p.available and (p_state='all' or p.state='active')))
  and position(lower(btrim(p_search)) in lower(p.title))>0;
 select coalesce(jsonb_agg(jsonb_build_object('publicationId',p.id::text,'externalId',p.external_id,'title',p.title,'url',p.url,'state',p.state,'available',p.available,'publishedAt',p.published_at,'observedAt',p.observed_at) order by p.id desc),'[]'::jsonb) into v_rows
 from (select * from public.kleinanzeigen_publications p where p.workspace_id=p_workspace_id and p.connection_id=p_connection_id
  and ((p_state='ended' and not p.available) or (p_state<>'ended' and p.available and (p_state='all' or p.state='active')))
  and position(lower(btrim(p_search)) in lower(p.title))>0 and (p_after_id is null or p.id<p_after_id) order by p.id desc limit p_limit+1) p;
 if jsonb_array_length(v_rows)>p_limit then v_next:=(v_rows->(p_limit-1))->>'publicationId';v_rows:=v_rows-p_limit; end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'snapshotAt',v_snapshot,'items',v_rows,'total',case when v_connection.last_synced_at is null then null else v_count end,'nextId',v_next,'completeness',case when v_connection.last_synced_at is not null then 'complete' when jsonb_array_length(v_rows)>0 then 'partial' else 'unknown' end);
end;
$$;
revoke all on function public.kleinanzeigen_read_publications(uuid,bigint,integer,text,text,bigint,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_publications(uuid,bigint,integer,text,text,bigint,timestamptz) to authenticated;
