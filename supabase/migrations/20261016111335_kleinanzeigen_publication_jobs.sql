-- Zweck: Dauerhafte Kleinanzeigen-Aufträge, private Fotoaufnahme, Kontingentreservierung, exklusiver Schreibbeginn und atomarer Ergebnisabschluss.
alter table "public"."kleinanzeigen_publications" drop constraint "kleinanzeigen_publications_state_check";


  create table "public"."kleinanzeigen_publication_jobs" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" bigint not null,
    "draft_id" uuid not null,
    "requested_by" uuid not null,
    "request_id" uuid not null,
    "request_hash" text not null,
    "draft_revision" bigint not null,
    "grant_generation" bigint not null,
    "external_account_id" text not null,
    "immutable_snapshot" jsonb not null,
    "state" text not null default 'queued'::text,
    "version" bigint not null default 1,
    "claim_token_hash" text,
    "claim_installation_hash" text,
    "lease_until" timestamp with time zone,
    "absolute_expires_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "external_id" text,
    "provider_state" text,
    "verified_at" timestamp with time zone,
    "error_code" text,
    "provider_result" jsonb,
    "quota_position" integer not null,
    "created_at" timestamp with time zone not null default clock_timestamp(),
    "updated_at" timestamp with time zone not null default clock_timestamp()
      );


alter table "public"."kleinanzeigen_publication_jobs" enable row level security;

create UNIQUE INDEX kleinanzeigen_jobs_one_account_writer on public.kleinanzeigen_publication_jobs USING btree (workspace_id, connection_id) WHERE (state = ANY (ARRAY['claimed'::text, 'writing'::text, 'outcome_unknown'::text]));

create UNIQUE INDEX kleinanzeigen_jobs_one_unresolved_draft on public.kleinanzeigen_publication_jobs USING btree (draft_id) WHERE (state = ANY (ARRAY['queued'::text, 'claimed'::text, 'writing'::text, 'outcome_unknown'::text]));

create INDEX kleinanzeigen_jobs_requester on public.kleinanzeigen_publication_jobs USING btree (requested_by);

create INDEX kleinanzeigen_jobs_scope on public.kleinanzeigen_publication_jobs USING btree (workspace_id, connection_id, created_at DESC);

create UNIQUE INDEX kleinanzeigen_publication_job_workspace_id_requested_by_req_key on public.kleinanzeigen_publication_jobs USING btree (workspace_id, requested_by, request_id);

create UNIQUE INDEX kleinanzeigen_publication_jobs_pkey on public.kleinanzeigen_publication_jobs USING btree (id);

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_pkey" PRIMARY KEY using index "kleinanzeigen_publication_jobs_pkey";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_job_workspace_id_requested_by_req_key" UNIQUE using index "kleinanzeigen_publication_job_workspace_id_requested_by_req_key";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_check" CHECK (((state <> 'confirmed'::text) or ((external_id IS NOT NULL) AND (provider_state = 'active'::text) AND (verified_at IS NOT NULL) AND (started_at IS NOT NULL)))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_check1" CHECK (((provider_state IS NULL) = (external_id IS NULL))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_check1";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_claim_installation_hash_check" CHECK ((claim_installation_hash ~ '^[a-f0-9]{64}$'::text)) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_claim_installation_hash_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_claim_token_hash_check" CHECK ((claim_token_hash ~ '^[a-f0-9]{64}$'::text)) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_claim_token_hash_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_draft_revision_check" CHECK (((draft_revision >= 1) AND (draft_revision <= '9007199254740991'::bigint))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_draft_revision_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_error_code_check" CHECK ((error_code ~ '^[a-z_]{1,80}$'::text)) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_error_code_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_external_account_id_check" CHECK ((external_account_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_external_account_id_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_external_id_check" CHECK ((external_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_external_id_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_grant_generation_check" CHECK (((grant_generation >= 1) AND (grant_generation <= '9007199254740991'::bigint))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_grant_generation_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_immutable_snapshot_check" CHECK (((jsonb_typeof(immutable_snapshot) = 'object'::text) AND (octet_length((immutable_snapshot)::text) <= 300000))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_immutable_snapshot_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_provider_result_check" CHECK (((provider_result IS NULL) or ((jsonb_typeof(provider_result) = 'object'::text) AND (octet_length((provider_result)::text) <= 4096)))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_provider_result_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_provider_state_check" CHECK ((provider_state = ANY (ARRAY['active'::text, 'processing'::text]))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_provider_state_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_quota_position_check" CHECK ((quota_position > 0)) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_quota_position_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_request_hash_check" CHECK ((request_hash ~ '^[a-f0-9]{64}$'::text)) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_request_hash_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_requested_by_fkey";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_state_check" CHECK ((state = ANY (ARRAY['queued'::text, 'claimed'::text, 'writing'::text, 'confirmed'::text, 'failed'::text, 'outcome_unknown'::text, 'cancelled'::text, 'needs_user_action'::text]))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_state_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_version_check" CHECK (((version >= 1) AND (version <= '9007199254740991'::bigint))) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_version_check";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_workspace_id_connection_id_fkey" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.kleinanzeigen_connections(workspace_id, id) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_workspace_id_connection_id_fkey";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_workspace_id_draft_id_fkey" FOREIGN KEY (workspace_id, draft_id) REFERENCES public.listings(workspace_id, id) not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_workspace_id_draft_id_fkey";

alter table "public"."kleinanzeigen_publication_jobs" add constraint "kleinanzeigen_publication_jobs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) on delete CASCADE not valid;

alter table "public"."kleinanzeigen_publication_jobs" validate constraint "kleinanzeigen_publication_jobs_workspace_id_fkey";

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_state_check" CHECK ((state = ANY (ARRAY['active'::text, 'unknown'::text, 'processing'::text]))) not valid;

alter table "public"."kleinanzeigen_publications" validate constraint "kleinanzeigen_publications_state_check";

set check_function_bodies = off;

create or replace function public.kleinanzeigen_begin_listing(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_job_id bigint, p_claim_token text, p_expected_version bigint, p_fee jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.kleinanzeigen_check_listing(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_job_id bigint, p_claim_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.kleinanzeigen_claim_listing(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_job_id bigint, p_claim_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.kleinanzeigen_enqueue_listing(p_workspace_id uuid, p_connection_id bigint, p_draft_id uuid, p_expected_revision bigint, p_request_id uuid, p_user_id uuid, p_photos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_job public.kleinanzeigen_publication_jobs;v_snapshot jsonb;v_request_hash text;v_photo jsonb;v_image jsonb;v_index integer:=0;v_capacity jsonb;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Veröffentlichung nicht freigegeben.' using errcode='42501';end if;
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'Ungültiger Auftrag.' using errcode='22023';end if;
 -- Konto sperrt Reservierungen und Wiederholungen auch bei mehreren gleichzeitigen Endpunktaufrufen.
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;if not found then raise exception 'Zielkonto nicht verfügbar.' using errcode='42501';end if;
 v_request_hash:=encode(extensions.digest(jsonb_build_object('connectionId',p_connection_id::text,'draftId',p_draft_id,'draftRevision',p_expected_revision,'images',(select jsonb_agg(value-'storagePath' order by ordinal) from jsonb_array_elements(p_photos) with ordinality entry(value,ordinal)))::text,'sha256'),'hex');
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and requested_by=p_user_id and request_id=p_request_id;
 if found then if v_job.request_hash<>v_request_hash then raise exception 'Request-ID gehört zu anderer Fassung.' using errcode='40001';end if;return public.kleinanzeigen_job_document(v_job);end if;
 if exists(select 1 from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and draft_id=p_draft_id and state in ('queued','claimed','writing','outcome_unknown')) then raise exception 'Für diesen Entwurf besteht bereits ein offener Auftrag.' using errcode='40001';end if;
 v_snapshot:=public.kleinanzeigen_prepare_listing_job(p_workspace_id,p_connection_id,p_draft_id,p_expected_revision,p_user_id);
 if jsonb_array_length(p_photos)<>jsonb_array_length(v_snapshot->'images') then raise exception 'Auftragsbilder nicht vollständig.' using errcode='22023';end if;
 for v_photo in select * from jsonb_array_elements(p_photos) loop
  v_image:=v_snapshot->'images'->v_index;
  if jsonb_typeof(v_photo)<>'object' or (select count(*) from jsonb_object_keys(v_photo))<>6 or v_photo->>'imageId' is distinct from v_image->>'imageId' or v_photo->>'storagePath' !~ ('^kleinanzeigen-jobs/'||p_workspace_id::text||'/'||p_request_id::text||'/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/'||(v_image->>'imageId')||'\.(jpg|png|webp)$') or v_photo->>'mimeType' is distinct from v_image->>'mimeType' or v_photo->>'byteSize' is distinct from v_image->>'byteSize' or coalesce(v_photo->>'sha256','') !~ '^[a-f0-9]{64}$' or char_length(coalesce(v_photo->>'fileName','')) not between 1 and 255 or not exists(select 1 from storage.objects where bucket_id='item-media' and name=v_photo->>'storagePath' and metadata->>'mimetype'=v_photo->>'mimeType' and metadata->>'size'=v_photo->>'byteSize') then raise exception 'Private Auftragsbilder nicht bestätigt.' using errcode='22023';end if;
  v_index:=v_index+1;
 end loop;
 v_capacity:=public.kleinanzeigen_quota_capacity(p_workspace_id,p_connection_id);
 if v_capacity->>'allowed' is distinct from 'true' then raise exception 'Kontingent nicht sicher frei: %',v_capacity->>'reason' using errcode='55000';end if;
 v_snapshot:=v_snapshot||jsonb_build_object('images',p_photos);
 insert into public.kleinanzeigen_publication_jobs(workspace_id,connection_id,draft_id,requested_by,request_id,request_hash,draft_revision,grant_generation,external_account_id,immutable_snapshot,quota_position) values(p_workspace_id,p_connection_id,p_draft_id,p_user_id,p_request_id,v_request_hash,p_expected_revision,(v_snapshot->>'grantGeneration')::bigint,v_snapshot->>'externalAccountId',v_snapshot,(v_capacity->>'used')::integer+(v_capacity->>'reserved')::integer+1) returning * into v_job;
 return public.kleinanzeigen_job_document(v_job);
end;
$function$
;

create or replace function public.kleinanzeigen_expire_listing_jobs(p_workspace_id uuid, p_connection_id bigint)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
 update public.kleinanzeigen_publication_jobs set state='outcome_unknown',error_code='publication_unconfirmed',lease_until=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state='writing' and lease_until<=clock_timestamp();
 update public.kleinanzeigen_publication_jobs set state='queued',claim_token_hash=null,claim_installation_hash=null,lease_until=null,absolute_expires_at=null where workspace_id=p_workspace_id and connection_id=p_connection_id and state='claimed' and started_at is null and lease_until<=clock_timestamp();
end;
$function$
;

create or replace function public.kleinanzeigen_find_listing_job(p_workspace_id uuid, p_connection_id bigint, p_request_id uuid, p_user_id uuid, p_draft_id uuid, p_expected_revision bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_job public.kleinanzeigen_publication_jobs;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Kein Zugriff auf diesen Auftrag.' using errcode='42501';end if;
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and requested_by=p_user_id and request_id=p_request_id;
 if not found then return null;end if;
 if v_job.connection_id is distinct from p_connection_id or v_job.draft_id is distinct from p_draft_id or v_job.draft_revision is distinct from p_expected_revision then raise exception 'Request-ID gehört zu anderer Fassung.' using errcode='40001';end if;
 return public.kleinanzeigen_read_listing_job(p_workspace_id,p_connection_id,v_job.id,p_user_id);
end;
$function$
;

create or replace function public.kleinanzeigen_finish_listing(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_job_id bigint, p_claim_token text, p_result jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.kleinanzeigen_job_document(p_job public.kleinanzeigen_publication_jobs)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
 select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id::text,'draftId',p_job.draft_id,'draftRevision',p_job.draft_revision,'grantGeneration',p_job.grant_generation,'requestedBy',p_job.requested_by,'immutableSnapshot',p_job.immutable_snapshot,'state',p_job.state,'version',p_job.version,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'errorCode',p_job.error_code,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at);
$function$
;

create or replace function public.kleinanzeigen_listing_job_photo(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_job_id bigint, p_claim_token text, p_image_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_job public.kleinanzeigen_publication_jobs;v_image jsonb;
begin
 v_job:=public.kleinanzeigen_locked_listing(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_job_id,p_claim_token);
 if v_job.state<>'claimed' or v_job.lease_until<=clock_timestamp() or v_job.absolute_expires_at<=clock_timestamp() then raise exception 'Bildabruf nicht freigegeben.' using errcode='42501';end if;
 select value into v_image from jsonb_array_elements(v_job.immutable_snapshot->'images') where value->>'imageId'=p_image_id::text;
 if v_image is null then raise exception 'Bild gehört nicht zu diesem Auftrag.' using errcode='42501';end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'jobId',p_job_id::text,'image',v_image);
end;
$function$
;

create or replace function public.kleinanzeigen_locked_listing(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_job_id bigint, p_claim_token text)
 returns public.kleinanzeigen_publication_jobs
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_session jsonb;v_job public.kleinanzeigen_publication_jobs;
begin
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id for update;
 if not found or p_claim_token is null or p_claim_token !~ '^[a-f0-9]{64}$' or v_job.claim_token_hash is distinct from encode(extensions.digest(p_claim_token,'sha256'),'hex') or v_job.claim_installation_hash is distinct from p_token_hash or v_job.grant_generation is distinct from p_generation or v_session->>'externalAccountId' is distinct from v_job.external_account_id or v_session->>'canPublish' is distinct from 'true' or not exists(select 1 from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash and approved_by=v_job.requested_by) then raise exception 'Versuch nicht freigegeben.' using errcode='42501';end if;
 return v_job;
end;
$function$
;

create or replace function public.kleinanzeigen_prepare_listing_job(p_workspace_id uuid, p_connection_id bigint, p_draft_id uuid, p_expected_revision bigint, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_connection public.kleinanzeigen_connections;v_grant public.kleinanzeigen_local_grants;v_listing public.listings;v_schema public.kleinanzeigen_form_schemas;v_images jsonb;v_content jsonb;v_field jsonb;v_key text;v_value text;v_methods jsonb;v_shipping jsonb;v_method jsonb;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Veröffentlichung nicht freigegeben.' using errcode='42501';end if;
 perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for share;if not found then raise exception 'Arbeitsbereich nicht verfügbar.' using errcode='42501';end if;
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id and status='connected' and account_type='private' for update;
 if not found then raise exception 'Privates Zielkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_grant from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=p_user_id and can_publish and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Ausdrückliche lokale Veröffentlichungsfreigabe fehlt.' using errcode='42501';end if;
 select * into v_listing from public.listings where workspace_id=p_workspace_id and id=p_draft_id and target_connection_id=p_connection_id and source_reference is not null for update;
 if not found then raise exception 'Entwurf nicht verfügbar.' using errcode='42501';end if;
 if v_listing.revision is distinct from p_expected_revision then raise exception 'Entwurf inzwischen geändert.' using errcode='40001';end if;
 if v_listing.status<>'prepared' or not v_listing.transfer_images_complete or not v_listing.image_selection_saved or v_listing.postal_code is null or v_listing.price<>trunc(v_listing.price) or v_listing.price>99999999 or char_length(btrim(v_listing.description))=0 or v_listing.shipping_type not in ('pickup','both') or v_listing.shipping_price is not null then raise exception 'Zielfassung noch nicht vollständig geprüft.' using errcode='22023';end if;
 if not exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id::text=v_listing.source_reference->>'connectionId' and id::text=v_listing.source_reference->>'entryId' and external_id=v_listing.source_reference->>'externalId' and kind='publication') then raise exception 'Quellbezug nicht mehr bestätigt.' using errcode='42501';end if;
 select * into v_schema from public.kleinanzeigen_form_schemas where workspace_id=p_workspace_id and connection_id=p_connection_id and category_path=v_listing.category_id and schema_revision=v_listing.schema_revision and grant_generation=v_grant.grant_generation and observed_at between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '5 seconds';
 if not found or split_part(v_schema.category_path,'/',1)<>'153' then raise exception 'Aktuelle Bekleidungskategorie fehlt.' using errcode='22023';end if;
 for v_field in select * from jsonb_array_elements(v_schema.provider_schema->'fields') loop
  v_key:=v_field->>'key';v_value:=v_listing.category_fields->>v_key;
  if ((v_field->>'required')::boolean or v_key like '%.condition') and coalesce(btrim(v_value),'')='' then raise exception 'Kategorieangabe fehlt.' using errcode='22023';end if;
  if coalesce(v_value,'')<>'' and (char_length(v_value)>200 or v_field->>'kind'='select' and not exists(select 1 from jsonb_array_elements(v_field->'choices') choice where choice->>'value'=v_value)) then raise exception 'Kategorieangabe nicht angeboten.' using errcode='22023';end if;
 end loop;
 for v_key in select jsonb_object_keys(v_listing.category_fields) loop
  if v_key not in ('ad-shipping-package-size','ad-shipping-options') and not exists(select 1 from jsonb_array_elements(v_schema.provider_schema->'fields') field where field->>'key'=v_key) then raise exception 'Veraltete Kategorieangabe.' using errcode='22023';end if;
 end loop;
 if v_listing.shipping_type='both' then
  select value into v_shipping from jsonb_array_elements(v_schema.provider_schema->'shipping'->'groups') where value->>'value'=v_listing.category_fields->>'ad-shipping-package-size';
  begin v_methods:=(v_listing.category_fields->>'ad-shipping-options')::jsonb;exception when invalid_text_representation then raise exception 'Versandmethoden nicht bestätigt.' using errcode='22023';end;
  if v_shipping is null or jsonb_typeof(v_methods) is distinct from 'array' or jsonb_array_length(v_methods) not between 1 and 20 or (select count(distinct value) from jsonb_array_elements(v_methods))<>jsonb_array_length(v_methods) then raise exception 'Versandmethoden nicht bestätigt.' using errcode='22023';end if;
  for v_method in select * from jsonb_array_elements(v_methods) loop
   if jsonb_typeof(v_method)<>'string' or not exists(select 1 from jsonb_array_elements(v_shipping->'choices') choice where choice->'value'=v_method) then raise exception 'Versandmethode nicht angeboten.' using errcode='22023';end if;
  end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('imageId',image.id,'storagePath',image.storage_path,'fileName',coalesce(image.file_name,'Bild'),'mimeType',object.metadata->>'mimetype','byteSize',(object.metadata->>'size')::bigint,'sortOrder',image.sort_order) order by image.sort_order,image.id),'[]'::jsonb) into v_images from public.listing_images image left join storage.objects object on object.bucket_id='item-media' and object.name=image.storage_path where image.workspace_id=p_workspace_id and image.listing_id=p_draft_id;
 if jsonb_array_length(v_images) not between 1 and 20 or exists(select 1 from jsonb_array_elements(v_images) image where image->>'storagePath' !~ ('^listings/'||p_workspace_id::text||'/'||p_draft_id::text||'/[a-f0-9-]+\.(jpg|jpeg|png|webp)$') or coalesce(image->>'mimeType','') not in ('image/jpeg','image/png','image/webp') or image->>'byteSize' is null or (image->>'byteSize')::bigint not between 1 and 12582912) then raise exception 'Gesicherte Bilder nicht vollständig verfügbar.' using errcode='22023';end if;
 v_content:=jsonb_build_object('title',v_listing.title,'description',v_listing.description,'priceCents',v_listing.price*100,'currency','EUR','priceType',v_listing.price_type,'shippingType',v_listing.shipping_type,'shippingPriceCents',null,'postalCode',v_listing.postal_code,'categoryId',v_listing.category_id,'categoryFields',v_listing.category_fields,'schemaRevision',v_listing.schema_revision);
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'draftId',p_draft_id,'draftRevision',v_listing.revision,'grantGeneration',v_grant.grant_generation,'externalAccountId',v_connection.external_account_id,'content',v_content,'images',v_images);
end;
$function$
;

create or replace function public.kleinanzeigen_protect_publication_job()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
 if row(new.id,new.workspace_id,new.connection_id,new.draft_id,new.requested_by,new.request_id,new.request_hash,new.draft_revision,new.grant_generation,new.external_account_id,new.immutable_snapshot,new.created_at) is distinct from row(old.id,old.workspace_id,old.connection_id,old.draft_id,old.requested_by,old.request_id,old.request_hash,old.draft_revision,old.grant_generation,old.external_account_id,old.immutable_snapshot,old.created_at) then raise exception 'Angenommener Veröffentlichungsinhalt ist unveränderlich.' using errcode='22023';end if;
 new.version:=old.version+1;new.updated_at:=clock_timestamp();return new;
end;
$function$
;

create or replace function public.kleinanzeigen_protect_writing_draft()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
 if old.source_reference is not null and exists(select 1 from public.kleinanzeigen_publication_jobs where workspace_id=old.workspace_id and draft_id=old.id and state in ('writing','outcome_unknown')) then raise exception 'Zuerst den Ausgang der Veröffentlichung prüfen.' using errcode='55000';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;
$function$
;

create or replace function public.kleinanzeigen_quota_capacity(p_workspace_id uuid, p_connection_id bigint, p_excluded_job_id bigint default NULL::bigint)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_connection public.kleinanzeigen_connections;v_reserved integer;v_now timestamptz:=clock_timestamp();
begin
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id;
 -- Bestätigte Aufträge bleiben vorgemerkt, bis der frische offizielle Zähler ihre erwartete Position erreicht.
 -- Aktive Anzeigen oder eine Kontolöschung reduzieren den 30-Tage-Zähler niemals eigenständig.
 select count(*)::integer into v_reserved from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and (p_excluded_job_id is null or id<>p_excluded_job_id) and (state in ('queued','claimed','writing','outcome_unknown') or state='confirmed' and started_at>v_now-interval '30 days' and quota_position>coalesce(v_connection.quota_used,-1));
 return jsonb_build_object('used',v_connection.quota_used,'observedAt',v_connection.quota_observed_at,'reserved',v_reserved,'allowed',v_connection.id is not null and v_connection.account_type='private' and v_connection.status='connected' and v_connection.quota_used is not null and v_connection.quota_observed_at between v_now-interval '60 seconds' and v_now+interval '5 seconds' and v_connection.quota_used+v_reserved<100,'reason',case when v_connection.account_type is distinct from 'private' or v_connection.quota_used is null or v_connection.quota_observed_at is null or v_connection.quota_observed_at<v_now-interval '60 seconds' or v_connection.quota_observed_at>v_now+interval '5 seconds' then 'quota_unknown' when v_connection.quota_used+v_reserved>=100 then 'quota_exhausted' else null end);
end;
$function$
;

create or replace function public.kleinanzeigen_read_draft_job(p_workspace_id uuid, p_connection_id bigint, p_draft_id uuid, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_job public.kleinanzeigen_publication_jobs;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Kein Zugriff auf diesen Auftrag.' using errcode='42501';end if;
 if not exists(select 1 from public.listings where workspace_id=p_workspace_id and id=p_draft_id and target_connection_id=p_connection_id and source_reference is not null) then raise exception 'Entwurf nicht verfügbar.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 perform public.kleinanzeigen_expire_listing_jobs(p_workspace_id,p_connection_id);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and draft_id=p_draft_id order by id desc limit 1;
 if not found then return null;end if;return public.kleinanzeigen_job_document(v_job);
end;
$function$
;

create or replace function public.kleinanzeigen_read_listing_job(p_workspace_id uuid, p_connection_id bigint, p_job_id bigint, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_job public.kleinanzeigen_publication_jobs;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Kein Zugriff auf diesen Auftrag.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;
 perform public.kleinanzeigen_expire_listing_jobs(p_workspace_id,p_connection_id);
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id;
 if not found then raise exception 'Auftrag nicht verfügbar.' using errcode='42501';end if;
 return public.kleinanzeigen_job_document(v_job);
end;
$function$
;

create or replace function public.kleinanzeigen_store_quota_observation(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_quota jsonb, p_excluded_job_id bigint default NULL::bigint)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
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
$function$
;

create or replace function public.kleinanzeigen_finish_sync(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_run_id bigint, p_claim_token text, p_external_account_id text, p_quota jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_run public.kleinanzeigen_sync_runs; v_now timestamptz; v_used integer; v_observed timestamptz; v_count integer;
begin
 v_run:=public.kleinanzeigen_locked_sync(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_run_id,p_claim_token,p_external_account_id);
 select count(*)::integer into v_count from public.kleinanzeigen_sync_entries where run_id=v_run.id;
 if v_run.state='confirmed' then return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'state','confirmed','observedAt',v_run.completed_at,'itemCount',v_count); end if;
 v_now:=clock_timestamp();
 if v_run.next_cursor is not null or v_run.accepted_pages='{}'::jsonb then raise exception 'Anzeigenfolge unvollständig.' using errcode='55000'; end if;
 if exists(select 1 from public.kleinanzeigen_sync_runs where workspace_id=p_workspace_id and connection_id=p_connection_id and id>v_run.id and state='confirmed') then raise exception 'Neuerer Abgleich vorhanden.' using errcode='55000'; end if;
 if p_quota is not null then
  if jsonb_typeof(p_quota)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(p_quota) key) is distinct from array['accountType','externalAccountId','observedAt','source','used']::text[]
   or p_quota->>'externalAccountId' is distinct from p_external_account_id or p_quota->>'source' is distinct from 'account_settings'
   or p_quota->>'accountType' is distinct from (select account_type from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id)
   or jsonb_typeof(p_quota->'used') is distinct from 'number' or p_quota->>'used' !~ '^[0-9]{1,9}$' or jsonb_typeof(p_quota->'observedAt') is distinct from 'string' then raise exception 'Kontingent nicht belegt.' using errcode='22023'; end if;
  v_used:=(p_quota->>'used')::integer;v_observed:=(p_quota->>'observedAt')::timestamptz;
  if v_observed>v_now+interval '1 second' or v_observed<v_now-interval '60 seconds' then raise exception 'Kontingent nicht aktuell.' using errcode='22023'; end if;
 end if;
 insert into public.kleinanzeigen_publications(workspace_id,connection_id,external_id,title,url,state,published_at,observed_at,sync_run_id)
  select workspace_id,connection_id,external_id,title,url,state,published_at,v_now,v_run.id from public.kleinanzeigen_sync_entries where run_id=v_run.id
  on conflict(workspace_id,connection_id,external_id) do update set title=excluded.title,url=excluded.url,state=excluded.state,available=true,published_at=coalesce(excluded.published_at,public.kleinanzeigen_publications.published_at),observed_at=excluded.observed_at,sync_run_id=excluded.sync_run_id where public.kleinanzeigen_publications.observed_at<=v_run.requested_at;
 update public.kleinanzeigen_publications p set available=false,observed_at=v_now,sync_run_id=v_run.id
  where p.workspace_id=p_workspace_id and p.connection_id=p_connection_id and p.observed_at<=v_run.requested_at and not exists(select 1 from public.kleinanzeigen_sync_entries e where e.run_id=v_run.id and e.external_id=p.external_id);
 update public.kleinanzeigen_connections set status='connected',last_synced_at=v_now,quota_used=case when v_observed is not null and (quota_observed_at is null or quota_observed_at<=v_observed) then v_used else quota_used end,quota_observed_at=case when v_observed is not null and (quota_observed_at is null or quota_observed_at<=v_observed) then v_observed else quota_observed_at end where workspace_id=p_workspace_id and id=p_connection_id;
 update public.kleinanzeigen_sync_runs set state='confirmed',completed_at=v_now where id=v_run.id;
 select count(*)::integer into v_count from public.kleinanzeigen_sync_entries where run_id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'state','confirmed','observedAt',v_now,'itemCount',v_count);
end;
$function$
;

grant delete on table "public"."kleinanzeigen_publication_jobs" to "service_role";

grant insert on table "public"."kleinanzeigen_publication_jobs" to "service_role";

grant references on table "public"."kleinanzeigen_publication_jobs" to "service_role";

grant select on table "public"."kleinanzeigen_publication_jobs" to "service_role";

grant trigger on table "public"."kleinanzeigen_publication_jobs" to "service_role";

grant truncate on table "public"."kleinanzeigen_publication_jobs" to "service_role";

grant update on table "public"."kleinanzeigen_publication_jobs" to "service_role";


  create policy "Kleinanzeigen-Aufträge serverseitig anlegen"
  on "public"."kleinanzeigen_publication_jobs"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Kleinanzeigen-Aufträge serverseitig lesen"
  on "public"."kleinanzeigen_publication_jobs"
  as permissive
  for select
  to service_role
using (true);



  create policy "Kleinanzeigen-Aufträge serverseitig löschen"
  on "public"."kleinanzeigen_publication_jobs"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Kleinanzeigen-Aufträge serverseitig ändern"
  on "public"."kleinanzeigen_publication_jobs"
  as permissive
  for update
  to service_role
using (true)
with check (true);


create trigger "00_protect_archived_workspace" before insert or delete or update on public.kleinanzeigen_publication_jobs for each row execute function public.protect_archived_workspace_data();

create trigger kleinanzeigen_jobs_protect_snapshot before update on public.kleinanzeigen_publication_jobs for each row execute function public.kleinanzeigen_protect_publication_job();

create trigger listings_protect_writing_draft before delete or update on public.listings for each row execute function public.kleinanzeigen_protect_writing_draft();

-- Explicit Kleinanzeigen job permissions from declarative schema
revoke all on public.kleinanzeigen_publication_jobs from public,anon,authenticated;
grant all on public.kleinanzeigen_publication_jobs to service_role;
revoke all on sequence public.kleinanzeigen_publication_jobs_id_seq from public,anon,authenticated;
grant usage,select on sequence public.kleinanzeigen_publication_jobs_id_seq to service_role;
revoke all on function public.kleinanzeigen_protect_publication_job() from public,anon,authenticated,service_role;
revoke all on function public.kleinanzeigen_job_document(public.kleinanzeigen_publication_jobs) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_job_document(public.kleinanzeigen_publication_jobs) to service_role;
revoke all on function public.kleinanzeigen_quota_capacity(uuid,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_quota_capacity(uuid,bigint,bigint) to service_role;
revoke all on function public.kleinanzeigen_prepare_listing_job(uuid,bigint,uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_prepare_listing_job(uuid,bigint,uuid,bigint,uuid) to service_role;
revoke all on function public.kleinanzeigen_enqueue_listing(uuid,bigint,uuid,bigint,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_enqueue_listing(uuid,bigint,uuid,bigint,uuid,uuid,jsonb) to service_role;
revoke all on function public.kleinanzeigen_protect_writing_draft() from public,anon,authenticated,service_role;
revoke all on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_expire_listing_jobs(uuid,bigint) to service_role;
revoke all on function public.kleinanzeigen_read_listing_job(uuid,bigint,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_listing_job(uuid,bigint,bigint,uuid) to service_role;
revoke all on function public.kleinanzeigen_store_quota_observation(uuid,bigint,text,bigint,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_store_quota_observation(uuid,bigint,text,bigint,jsonb,bigint) to service_role;
revoke all on function public.kleinanzeigen_claim_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_claim_listing(uuid,bigint,text,bigint,bigint,text) to service_role;
revoke all on function public.kleinanzeigen_locked_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_locked_listing(uuid,bigint,text,bigint,bigint,text) to service_role;
revoke all on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_check_listing(uuid,bigint,text,bigint,bigint,text) to service_role;
revoke all on function public.kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_begin_listing(uuid,bigint,text,bigint,bigint,text,bigint,jsonb) to service_role;
revoke all on function public.kleinanzeigen_finish_listing(uuid,bigint,text,bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_finish_listing(uuid,bigint,text,bigint,bigint,text,jsonb) to service_role;
revoke all on function public.kleinanzeigen_find_listing_job(uuid,bigint,uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_find_listing_job(uuid,bigint,uuid,uuid,uuid,bigint) to service_role;
revoke all on function public.kleinanzeigen_listing_job_photo(uuid,bigint,text,bigint,bigint,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_listing_job_photo(uuid,bigint,text,bigint,bigint,text,uuid) to service_role;
revoke all on function public.kleinanzeigen_read_draft_job(uuid,bigint,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_draft_job(uuid,bigint,uuid,uuid) to service_role;
comment on table public.kleinanzeigen_publication_jobs is 'Unveränderliche Entwurfs- und private Fotoaufnahme mit Kontofreigabe, Kontingentreservierung und einmaligem Schreibbeginn; kein Erfolg aus einem Klick.';
