-- Exklusive Versuche, einmaliger Schreibbeginn und ausschließlich lesende Wiederaufnahme danach.
-- Die bestehende Statusprüfung wird ausschließlich um processing erweitert; keine Inseratdaten werden gelöscht.
alter table public.kleinanzeigen_publications drop constraint kleinanzeigen_publications_state_check;
alter table public.kleinanzeigen_publications add constraint kleinanzeigen_publications_state_check check(state in ('active','unknown','processing'));

-- Definer braucht Zugriff auf die verborgenen Aufträge; er erlaubt keine Änderung während unklarer Ausführung.
create or replace function public.kleinanzeigen_protect_writing_draft()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 if old.source_reference is not null and exists(select 1 from public.kleinanzeigen_publication_jobs where workspace_id=old.workspace_id and draft_id=old.id and state in ('writing','outcome_unknown')) then raise exception 'Zuerst den Ausgang der Veröffentlichung prüfen.' using errcode='55000';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;
$$;
revoke all on function public.kleinanzeigen_protect_writing_draft() from public,anon,authenticated,service_role;
create trigger listings_protect_writing_draft before update or delete on public.listings for each row execute function public.kleinanzeigen_protect_writing_draft();

-- Definer ist ausschließlich für den Revisionsvergleich mit den privaten Elternentwürfen erforderlich.
create or replace function public.kleinanzeigen_expire_listing_jobs(p_workspace_id uuid,p_connection_id bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 -- Nach begin bleibt der Ausgang ungeklärt und gesperrt; Widerruf oder Timeout erlaubt keinen neuen Submit.
 update public.kleinanzeigen_publication_jobs set state='outcome_unknown',error_code='publication_unconfirmed',lease_until=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state='writing' and lease_until<=clock_timestamp();
 update public.kleinanzeigen_publication_jobs job set state='cancelled',error_code='grant_changed',completed_at=clock_timestamp(),lease_until=null
 where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.state in ('queued','claimed') and job.started_at is null and not exists(
  select 1 from public.kleinanzeigen_local_grants grant_row join public.kleinanzeigen_connections connection on connection.workspace_id=grant_row.workspace_id and connection.id=grant_row.connection_id
  where grant_row.workspace_id=job.workspace_id and grant_row.connection_id=job.connection_id and grant_row.grant_generation=job.grant_generation and grant_row.approved_by=job.requested_by and grant_row.can_publish and grant_row.revoked_at is null and grant_row.expires_at>clock_timestamp()
   and connection.status='connected' and connection.account_type='private' and connection.external_account_id=job.external_account_id and public.marketplace_sync_authorization_valid(job.workspace_id,job.requested_by) and public.marketplace_local_extension_user_valid(job.requested_by));
 update public.kleinanzeigen_publication_jobs job set state='cancelled',error_code='draft_changed',completed_at=clock_timestamp(),lease_until=null
 where job.workspace_id=p_workspace_id and job.connection_id=p_connection_id and job.state in ('queued','claimed') and job.started_at is null and not exists(select 1 from public.listings listing where listing.workspace_id=job.workspace_id and listing.id=job.draft_id and listing.target_connection_id=job.connection_id and listing.revision=job.draft_revision and listing.status='prepared');
 update public.kleinanzeigen_publication_jobs set state='needs_user_action',error_code='preparation_expired',completed_at=clock_timestamp(),lease_until=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','claimed') and started_at is null and created_at<=clock_timestamp()-interval '15 minutes';
 update public.kleinanzeigen_publication_jobs set state='queued',claim_token_hash=null,claim_installation_hash=null,lease_until=null,absolute_expires_at=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state='claimed' and started_at is null and lease_until<=clock_timestamp();
end;
$$;
revoke all on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) to service_role;

create or replace function public.kleinanzeigen_read_listing_job(p_workspace_id uuid,p_connection_id bigint,p_job_id bigint,p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Kein Zugriff auf diesen Auftrag.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 perform public.kleinanzeigen_expire_listing_jobs(p_workspace_id,p_connection_id);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id;
 if not found then raise exception 'Auftrag nicht verfügbar.' using errcode='42501';end if;
 return public.kleinanzeigen_job_document(v_job);
end;
$$;
revoke all on function public.kleinanzeigen_read_listing_job(uuid,bigint,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_listing_job(uuid,bigint,bigint,uuid) to service_role;

create or replace function public.kleinanzeigen_store_quota_observation(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_quota jsonb,p_excluded_job_id bigint default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_session jsonb;v_observed timestamptz;v_connection public.kleinanzeigen_connections;
begin
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id;
 if jsonb_typeof(p_quota) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(p_quota) key) is distinct from array['accountType','externalAccountId','observedAt','source','used']::text[] or p_quota->>'externalAccountId' is distinct from v_session->>'externalAccountId' or p_quota->>'accountType' is distinct from v_connection.account_type or p_quota->>'source' is distinct from 'account_settings' or jsonb_typeof(p_quota->'used') is distinct from 'number' or p_quota->>'used' !~ '^[0-9]{1,9}$' or jsonb_typeof(p_quota->'observedAt') is distinct from 'string' then raise exception 'Offizielles Kontingent nicht bestätigt.' using errcode='22023';end if;
 begin v_observed:=(p_quota->>'observedAt')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Kontingentzeit nicht bestätigt.' using errcode='22023';end;
 if v_observed not between clock_timestamp()-interval '60 seconds' and clock_timestamp()+interval '5 seconds' then raise exception 'Kontingent nicht aktuell.' using errcode='22023';end if;
 update public.kleinanzeigen_connections set quota_used=(p_quota->>'used')::integer,quota_observed_at=v_observed where workspace_id=p_workspace_id and id=p_connection_id and (quota_observed_at is null or quota_observed_at<=v_observed);
 if p_excluded_job_id is not null and not exists(select 1 from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_excluded_job_id and state in ('claimed','writing','outcome_unknown')) then raise exception 'Kontingentversuch nicht bestätigt.' using errcode='22023';end if;
 return v_session||jsonb_build_object('quota',public.kleinanzeigen_quota_capacity(p_workspace_id,p_connection_id,p_excluded_job_id));
end;
$$;
revoke all on function public.kleinanzeigen_store_quota_observation(uuid,bigint,text,bigint,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_store_quota_observation(uuid,bigint,text,bigint,jsonb,bigint) to service_role;

create or replace function public.kleinanzeigen_claim_listing(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_job_id bigint,p_claim_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;v_session jsonb;v_snapshot jsonb;v_capacity jsonb;v_claim_hash text;
begin
 if p_claim_token is null or p_claim_token !~ '^[a-f0-9]{64}$' then raise exception 'Ungültige Versuchkennung.' using errcode='22023';end if;
 v_claim_hash:=encode(extensions.digest(p_claim_token,'sha256'),'hex');
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 perform public.kleinanzeigen_expire_listing_jobs(p_workspace_id,p_connection_id);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id for update;
 if not found then raise exception 'Auftrag nicht verfügbar.' using errcode='42501';end if;
 -- Nach begin gibt es ausschließlich denselben alten Versuch zurück. Keine neue Schreibberechtigung.
 if v_job.started_at is not null and v_job.state in ('writing','outcome_unknown') then
  if v_job.claim_token_hash is distinct from v_claim_hash or v_job.claim_installation_hash is distinct from p_token_hash or v_job.grant_generation is distinct from p_generation then raise exception 'Veröffentlichung muss zuerst abgeglichen werden.' using errcode='40001';end if;
  return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',p_claim_token,'leaseUntil',v_job.lease_until,'absoluteExpiresAt',v_job.absolute_expires_at);
 end if;
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 if v_session->>'canPublish' is distinct from 'true' or v_session->>'externalAccountId' is distinct from v_job.external_account_id or v_job.grant_generation is distinct from p_generation or not exists(select 1 from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash and approved_by=v_job.requested_by) then raise exception 'Schreibfreigabe nicht bestätigt.' using errcode='42501';end if;
 if v_job.state='claimed' and v_job.claim_token_hash=v_claim_hash and v_job.claim_installation_hash=p_token_hash then return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',p_claim_token,'leaseUntil',v_job.lease_until,'absoluteExpiresAt',v_job.absolute_expires_at);end if;
 if v_job.state<>'queued' or exists(select 1 from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id<>p_job_id and state in ('claimed','writing','outcome_unknown')) then raise exception 'Ein anderer Versuch ist noch offen.' using errcode='40001';end if;
 v_snapshot:=public.kleinanzeigen_prepare_listing_job(p_workspace_id,p_connection_id,v_job.draft_id,v_job.draft_revision,v_job.requested_by);
 if (v_snapshot-'images') is distinct from (v_job.immutable_snapshot-'images') then raise exception 'Zielfassung inzwischen geändert.' using errcode='40001';end if;
 v_capacity:=public.kleinanzeigen_quota_capacity(p_workspace_id,p_connection_id,p_job_id);
 if v_capacity->>'allowed' is distinct from 'true' then
  update public.kleinanzeigen_publication_jobs set state='needs_user_action',error_code=v_capacity->>'reason',completed_at=clock_timestamp() where id=p_job_id returning * into v_job;return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',null,'leaseUntil',null,'absoluteExpiresAt',null);
 end if;
 update public.kleinanzeigen_publication_jobs set state='claimed',claim_token_hash=v_claim_hash,claim_installation_hash=p_token_hash,lease_until=least((v_session->>'expiresAt')::timestamptz,clock_timestamp()+interval '120 seconds'),absolute_expires_at=least((v_session->>'expiresAt')::timestamptz,clock_timestamp()+interval '15 minutes') where id=p_job_id returning * into v_job;
 return public.kleinanzeigen_job_document(v_job)||jsonb_build_object('claimToken',p_claim_token,'leaseUntil',v_job.lease_until,'absoluteExpiresAt',v_job.absolute_expires_at);
end;
$$;
revoke all on function public.kleinanzeigen_claim_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_claim_listing(uuid,bigint,text,bigint,bigint,text) to service_role;

create or replace function public.kleinanzeigen_locked_listing(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_job_id bigint,p_claim_token text)
returns public.kleinanzeigen_publication_jobs language plpgsql volatile security definer set search_path='' as $$
declare v_session jsonb;v_job public.kleinanzeigen_publication_jobs;
begin
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id for update;
 if not found or p_claim_token is null or p_claim_token !~ '^[a-f0-9]{64}$' or v_job.claim_token_hash is distinct from encode(extensions.digest(p_claim_token,'sha256'),'hex') or v_job.claim_installation_hash is distinct from p_token_hash or v_job.grant_generation is distinct from p_generation or v_session->>'externalAccountId' is distinct from v_job.external_account_id or v_session->>'canPublish' is distinct from 'true' or not exists(select 1 from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash and approved_by=v_job.requested_by) then raise exception 'Versuch nicht freigegeben.' using errcode='42501';end if;
 return v_job;
end;
$$;
revoke all on function public.kleinanzeigen_locked_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_locked_listing(uuid,bigint,text,bigint,bigint,text) to service_role;

create or replace function public.kleinanzeigen_check_listing(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_job_id bigint,p_claim_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;v_snapshot jsonb;v_session jsonb;
begin
 v_job:=public.kleinanzeigen_locked_listing(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_job_id,p_claim_token);
 if v_job.state<>'claimed' or v_job.lease_until<=clock_timestamp() or v_job.absolute_expires_at<=clock_timestamp() then return jsonb_build_object('active',false,'generation',v_job.grant_generation,'version',v_job.version,'leaseUntil',v_job.lease_until);end if;
 v_snapshot:=public.kleinanzeigen_prepare_listing_job(p_workspace_id,p_connection_id,v_job.draft_id,v_job.draft_revision,v_job.requested_by);
 if (v_snapshot-'images') is distinct from (v_job.immutable_snapshot-'images') then raise exception 'Zielfassung inzwischen geändert.' using errcode='40001';end if;
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 update public.kleinanzeigen_publication_jobs set lease_until=least((v_session->>'expiresAt')::timestamptz,v_job.absolute_expires_at,clock_timestamp()+interval '120 seconds') where id=p_job_id returning * into v_job;
 return jsonb_build_object('active',true,'generation',v_job.grant_generation,'version',v_job.version,'leaseUntil',v_job.lease_until);
end;
$$;
revoke all on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) to service_role;

create or replace function public.kleinanzeigen_begin_listing(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_job_id bigint,p_claim_token text,p_expected_version bigint,p_fee jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;v_snapshot jsonb;v_capacity jsonb;v_fee_at timestamptz;v_reason text;v_image jsonb;
begin
 v_job:=public.kleinanzeigen_locked_listing(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_job_id,p_claim_token);
 if v_job.started_at is not null or v_job.state in ('writing','outcome_unknown','confirmed') then return jsonb_build_object('authorized',false,'reason','already_started','job',public.kleinanzeigen_job_document(v_job));end if;
 if p_expected_version is distinct from v_job.version then raise exception 'Versuchversion inzwischen geändert.' using errcode='40001';end if;
 if v_job.state<>'claimed' or v_job.lease_until<=clock_timestamp() or v_job.absolute_expires_at<=clock_timestamp() then raise exception 'Versuch abgelaufen.' using errcode='42501';end if;
 v_snapshot:=public.kleinanzeigen_prepare_listing_job(p_workspace_id,p_connection_id,v_job.draft_id,v_job.draft_revision,v_job.requested_by);
 if (v_snapshot-'images') is distinct from (v_job.immutable_snapshot-'images') then raise exception 'Zielfassung inzwischen geändert.' using errcode='40001';end if;
 for v_image in select * from jsonb_array_elements(v_job.immutable_snapshot->'images') loop
  if not exists(select 1 from storage.objects where bucket_id='item-media' and name=v_image->>'storagePath' and metadata->>'mimetype'=v_image->>'mimeType' and metadata->>'size'=v_image->>'byteSize') then raise exception 'Unveränderliche Auftragsbilder fehlen.' using errcode='22023';end if;
 end loop;
 v_capacity:=public.kleinanzeigen_quota_capacity(p_workspace_id,p_connection_id,p_job_id);
 if jsonb_typeof(p_fee) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_fee))<>2 or not(p_fee ?& array['state','observedAt']) or p_fee->>'state' not in ('free','paid','unknown') then raise exception 'Gebührenstand nicht bestätigt.' using errcode='22023';end if;
 begin v_fee_at:=(p_fee->>'observedAt')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Gebührenzeit ungültig.' using errcode='22023';end;
 v_reason:=case when p_fee->>'state'='paid' then 'fees_due' when p_fee->>'state' is distinct from 'free' or v_fee_at is null or v_fee_at not between clock_timestamp()-interval '10 seconds' and clock_timestamp()+interval '1 second' then 'fee_unknown' when v_capacity->>'allowed' is distinct from 'true' then coalesce(v_capacity->>'reason','quota_unknown') else null end;
 if v_reason is not null then update public.kleinanzeigen_publication_jobs set state='needs_user_action',error_code=v_reason,completed_at=clock_timestamp(),lease_until=null where id=p_job_id returning * into v_job;return jsonb_build_object('authorized',false,'reason',v_reason,'job',public.kleinanzeigen_job_document(v_job));end if;
 update public.kleinanzeigen_publication_jobs set state='writing',started_at=clock_timestamp(),quota_position=(v_capacity->>'used')::integer+(v_capacity->>'reserved')::integer+1 where id=p_job_id and started_at is null returning * into v_job;
 return jsonb_build_object('authorized',true,'reason',null,'job',public.kleinanzeigen_job_document(v_job));
end;
$$;
revoke all on function public.kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb) to service_role;

create or replace function public.kleinanzeigen_finish_listing(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_job_id bigint,p_claim_token text,p_result jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;v_outcome text;v_verified timestamptz;v_external_id text;v_state text;v_url text;v_error text;
begin
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id for update;
 -- Die ursprünglichen beiden Secrets können nur den vorhandenen Versuch abschließen, auch nach Widerruf.
 if not found or p_claim_token is null or p_claim_token !~ '^[a-f0-9]{64}$' or v_job.claim_token_hash is distinct from encode(extensions.digest(p_claim_token,'sha256'),'hex') or v_job.claim_installation_hash is distinct from p_token_hash or v_job.grant_generation is distinct from p_generation then raise exception 'Versuch nicht bestätigt.' using errcode='42501';end if;
 if jsonb_typeof(p_result) is distinct from 'object' then raise exception 'Ungültiges Ergebnis.' using errcode='22023';end if;
 if v_job.provider_result=p_result then return public.kleinanzeigen_job_document(v_job);end if;
 if v_job.state in ('confirmed','failed','cancelled','needs_user_action') then raise exception 'Ergebnis bereits abgeschlossen.' using errcode='40001';end if;
 v_outcome:=p_result->>'outcome';
 if v_outcome in ('confirmed','processing') then
  v_external_id:=p_result->>'externalId';v_state:=p_result->>'providerState';v_url:=p_result->>'url';
  if (select count(*) from jsonb_object_keys(p_result))<>6 or v_job.started_at is null or v_job.state not in ('writing','outcome_unknown') or p_result->>'externalAccountId' is distinct from v_job.external_account_id or jsonb_typeof(p_result->'externalId') is distinct from 'string' or coalesce(v_external_id,'') !~ '^[1-9][0-9]{0,31}$' or v_state is distinct from (case when v_outcome='confirmed' then 'active' else 'processing' end) or coalesce(v_url,'') !~ ('^https://(www\.)?kleinanzeigen\.de/s-anzeige/[^/?#]+/'||v_external_id||'-[0-9]+-[0-9]+$') or jsonb_typeof(p_result->'verifiedAt') is distinct from 'string' then raise exception 'Anbieterergebnis nicht eindeutig bestätigt.' using errcode='22023';end if;
  begin v_verified:=(p_result->>'verifiedAt')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Ungültige Ergebniszeit.' using errcode='22023';end;
  if v_verified not between v_job.started_at-interval '5 seconds' and clock_timestamp()+interval '5 seconds' or v_job.external_id is not null and v_job.external_id<>v_external_id or exists(select 1 from public.kleinanzeigen_publications where workspace_id=p_workspace_id and connection_id=p_connection_id and external_id=v_external_id and observed_at<v_job.started_at) and v_job.external_id is distinct from v_external_id then raise exception 'Ergebnis gehört nicht eindeutig zu diesem Auftrag.' using errcode='22023';end if;
  update public.kleinanzeigen_publication_jobs set state=case when v_outcome='confirmed' then 'confirmed' else 'writing' end,external_id=v_external_id,provider_state=v_state,verified_at=v_verified,error_code=null,provider_result=p_result,completed_at=case when v_outcome='confirmed' then clock_timestamp() else null end,lease_until=case when v_outcome='confirmed' then null else clock_timestamp()+interval '120 seconds' end where id=p_job_id returning * into v_job;
  insert into public.kleinanzeigen_publications(workspace_id,connection_id,external_id,title,url,state,available,published_at,observed_at) values(p_workspace_id,p_connection_id,v_external_id,v_job.immutable_snapshot->'content'->>'title',v_url,v_state,true,null,v_verified) on conflict(workspace_id,connection_id,external_id) do update set title=excluded.title,url=excluded.url,state=excluded.state,available=true,observed_at=excluded.observed_at;
  if v_outcome='confirmed' then update public.listings set status='online',online_since=null,listed_count=listed_count+1,last_listed_at=v_verified where workspace_id=p_workspace_id and id=v_job.draft_id;end if;
 else
  v_error:=p_result->>'errorCode';if (select count(*) from jsonb_object_keys(p_result))<>2 or v_outcome not in ('failed','needs_user_action','outcome_unknown') or jsonb_typeof(p_result->'errorCode') is distinct from 'string' or coalesce(v_error,'') !~ '^[a-z_]{1,80}$' or v_job.state not in ('claimed','writing','outcome_unknown') then raise exception 'Ungültiges Stoppergebnis.' using errcode='22023';end if;
  update public.kleinanzeigen_publication_jobs set state=case when started_at is not null then 'outcome_unknown' when v_outcome='failed' then 'failed' else 'needs_user_action' end,error_code=v_error,provider_result=p_result,lease_until=null,completed_at=case when started_at is null then clock_timestamp() else null end where id=p_job_id returning * into v_job;
 end if;
 return public.kleinanzeigen_job_document(v_job);
end;
$$;
revoke all on function public.kleinanzeigen_finish_listing(uuid,bigint,text,bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_finish_listing(uuid,bigint,text,bigint,bigint,text,jsonb) to service_role;
-- Wiederholung einer verlorenen Annahme findet den bereits gespeicherten Auftrag vor erneuter Fotoarbeit.
create or replace function public.kleinanzeigen_find_listing_job(p_workspace_id uuid,p_connection_id bigint,p_request_id uuid,p_user_id uuid,p_draft_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Kein Zugriff auf diesen Auftrag.' using errcode='42501';end if;
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and requested_by=p_user_id and request_id=p_request_id;
 if not found then return null;end if;
 if v_job.connection_id is distinct from p_connection_id or v_job.draft_id is distinct from p_draft_id or v_job.draft_revision is distinct from p_expected_revision then raise exception 'Request-ID gehört zu anderer Fassung.' using errcode='40001';end if;
 return public.kleinanzeigen_read_listing_job(p_workspace_id,p_connection_id,v_job.id,p_user_id);
end;
$$;
revoke all on function public.kleinanzeigen_find_listing_job(uuid,bigint,uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_find_listing_job(uuid,bigint,uuid,uuid,uuid,bigint) to service_role;

create or replace function public.kleinanzeigen_listing_job_photo(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_job_id bigint,p_claim_token text,p_image_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;v_image jsonb;
begin
 v_job:=public.kleinanzeigen_locked_listing(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_job_id,p_claim_token);
 if v_job.state<>'claimed' or v_job.lease_until<=clock_timestamp() or v_job.absolute_expires_at<=clock_timestamp() then raise exception 'Bildabruf nicht freigegeben.' using errcode='42501';end if;
 select value into v_image from jsonb_array_elements(v_job.immutable_snapshot->'images') where value->>'imageId'=p_image_id::text;
 if v_image is null then raise exception 'Bild gehört nicht zu diesem Auftrag.' using errcode='42501';end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'jobId',p_job_id::text,'image',v_image);
end;
$$;
revoke all on function public.kleinanzeigen_listing_job_photo(uuid,bigint,text,bigint,bigint,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_listing_job_photo(uuid,bigint,text,bigint,bigint,text,uuid) to service_role;

-- Nur der letzte eigene Auftrag wird gelesen; ein neuer Browserstart darf keinen zweiten anlegen.
create or replace function public.kleinanzeigen_read_draft_job(p_workspace_id uuid,p_connection_id bigint,p_draft_id uuid,p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Kein Zugriff auf diesen Auftrag.' using errcode='42501';end if;
 if not exists(select 1 from public.listings where workspace_id=p_workspace_id and id=p_draft_id and target_connection_id=p_connection_id and source_reference is not null) then raise exception 'Entwurf nicht verfügbar.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 perform public.kleinanzeigen_expire_listing_jobs(p_workspace_id,p_connection_id);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and draft_id=p_draft_id order by id desc limit 1;
 if not found then return null;end if;return public.kleinanzeigen_job_document(v_job);
end;
$$;
revoke all on function public.kleinanzeigen_read_draft_job(uuid,bigint,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_draft_job(uuid,bigint,uuid,uuid) to service_role;
