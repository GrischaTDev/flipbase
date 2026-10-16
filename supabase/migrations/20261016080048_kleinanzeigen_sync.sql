-- Zweck: Atomarer Kleinanzeigen-Abgleich mit kleinanzeigen_sync_runs, kleinanzeigen_sync_entries und kleinanzeigen_publications.

  create table "public"."kleinanzeigen_publications" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" bigint not null,
    "external_id" text not null,
    "title" text not null,
    "url" text not null,
    "state" text not null,
    "available" boolean not null default true,
    "published_at" timestamp with time zone,
    "observed_at" timestamp with time zone not null,
    "sync_run_id" bigint
      );


alter table "public"."kleinanzeigen_publications" enable row level security;


  create table "public"."kleinanzeigen_sync_entries" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" bigint not null,
    "run_id" bigint not null,
    "external_id" text not null,
    "title" text not null,
    "url" text not null,
    "state" text not null,
    "published_at" timestamp with time zone
      );


alter table "public"."kleinanzeigen_sync_entries" enable row level security;


  create table "public"."kleinanzeigen_sync_runs" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" bigint not null,
    "grant_generation" bigint not null,
    "requested_by" uuid not null,
    "requested_at" timestamp with time zone not null default clock_timestamp(),
    "state" text not null default 'queued'::text,
    "lease_until" timestamp with time zone not null,
    "claim_token_hash" text,
    "next_cursor" text default 'page:1'::text,
    "accepted_pages" jsonb not null default '{}'::jsonb,
    "completed_at" timestamp with time zone,
    "error_code" text
      );


alter table "public"."kleinanzeigen_sync_runs" enable row level security;

create UNIQUE INDEX kleinanzeigen_publications_pkey on public.kleinanzeigen_publications USING btree (id);

create UNIQUE INDEX kleinanzeigen_publications_workspace_id_connection_id_exter_key on public.kleinanzeigen_publications USING btree (workspace_id, connection_id, external_id);

create UNIQUE INDEX kleinanzeigen_sync_entries_pkey on public.kleinanzeigen_sync_entries USING btree (id);

create UNIQUE INDEX kleinanzeigen_sync_entries_run_id_external_id_key on public.kleinanzeigen_sync_entries USING btree (run_id, external_id);

create INDEX kleinanzeigen_sync_entries_scope on public.kleinanzeigen_sync_entries USING btree (workspace_id, connection_id, run_id);

create UNIQUE INDEX kleinanzeigen_sync_one_active on public.kleinanzeigen_sync_runs USING btree (workspace_id, connection_id) WHERE (state = ANY (ARRAY['queued'::text, 'reading'::text]));

create INDEX kleinanzeigen_sync_requester on public.kleinanzeigen_sync_runs USING btree (requested_by);

create UNIQUE INDEX kleinanzeigen_sync_runs_pkey on public.kleinanzeigen_sync_runs USING btree (id);

create UNIQUE INDEX kleinanzeigen_sync_runs_workspace_id_connection_id_id_key on public.kleinanzeigen_sync_runs USING btree (workspace_id, connection_id, id);

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_pkey" PRIMARY KEY using index "kleinanzeigen_publications_pkey";

alter table "public"."kleinanzeigen_sync_entries" add constraint "kleinanzeigen_sync_entries_pkey" PRIMARY KEY using index "kleinanzeigen_sync_entries_pkey";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_pkey" PRIMARY KEY using index "kleinanzeigen_sync_runs_pkey";

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_external_id_check" CHECK ((external_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."kleinanzeigen_publications" validate constraint "kleinanzeigen_publications_external_id_check";

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_state_check" CHECK ((state = ANY (ARRAY['active'::text, 'unknown'::text]))) not valid;

alter table "public"."kleinanzeigen_publications" validate constraint "kleinanzeigen_publications_state_check";

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 512))) not valid;

alter table "public"."kleinanzeigen_publications" validate constraint "kleinanzeigen_publications_title_check";

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_workspace_id_connection_id_exter_key" UNIQUE using index "kleinanzeigen_publications_workspace_id_connection_id_exter_key";

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_workspace_id_connection_id_fkey" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.kleinanzeigen_connections(workspace_id, id) on delete CASCADE not valid;

alter table "public"."kleinanzeigen_publications" validate constraint "kleinanzeigen_publications_workspace_id_connection_id_fkey";

alter table "public"."kleinanzeigen_publications" add constraint "kleinanzeigen_publications_workspace_id_connection_id_sync_fkey" FOREIGN KEY (workspace_id, connection_id, sync_run_id) REFERENCES public.kleinanzeigen_sync_runs(workspace_id, connection_id, id) not valid;

alter table "public"."kleinanzeigen_publications" validate constraint "kleinanzeigen_publications_workspace_id_connection_id_sync_fkey";

alter table "public"."kleinanzeigen_sync_entries" add constraint "kleinanzeigen_sync_entries_external_id_check" CHECK ((external_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."kleinanzeigen_sync_entries" validate constraint "kleinanzeigen_sync_entries_external_id_check";

alter table "public"."kleinanzeigen_sync_entries" add constraint "kleinanzeigen_sync_entries_run_id_external_id_key" UNIQUE using index "kleinanzeigen_sync_entries_run_id_external_id_key";

alter table "public"."kleinanzeigen_sync_entries" add constraint "kleinanzeigen_sync_entries_state_check" CHECK ((state = ANY (ARRAY['active'::text, 'unknown'::text]))) not valid;

alter table "public"."kleinanzeigen_sync_entries" validate constraint "kleinanzeigen_sync_entries_state_check";

alter table "public"."kleinanzeigen_sync_entries" add constraint "kleinanzeigen_sync_entries_title_check" CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 512))) not valid;

alter table "public"."kleinanzeigen_sync_entries" validate constraint "kleinanzeigen_sync_entries_title_check";

alter table "public"."kleinanzeigen_sync_entries" add constraint "kleinanzeigen_sync_entries_workspace_id_connection_id_run__fkey" FOREIGN KEY (workspace_id, connection_id, run_id) REFERENCES public.kleinanzeigen_sync_runs(workspace_id, connection_id, id) on delete CASCADE not valid;

alter table "public"."kleinanzeigen_sync_entries" validate constraint "kleinanzeigen_sync_entries_workspace_id_connection_id_run__fkey";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_accepted_pages_check" CHECK ((jsonb_typeof(accepted_pages) = 'object'::text)) not valid;

alter table "public"."kleinanzeigen_sync_runs" validate constraint "kleinanzeigen_sync_runs_accepted_pages_check";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_claim_token_hash_check" CHECK ((claim_token_hash ~ '^[0-9a-f]{64}$'::text)) not valid;

alter table "public"."kleinanzeigen_sync_runs" validate constraint "kleinanzeigen_sync_runs_claim_token_hash_check";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_error_code_check" CHECK ((error_code = ANY (ARRAY['schema_changed'::text, 'needs_login'::text, 'interrupted'::text, 'account_changed'::text, 'unsupported'::text, 'access_revoked'::text]))) not valid;

alter table "public"."kleinanzeigen_sync_runs" validate constraint "kleinanzeigen_sync_runs_error_code_check";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_grant_generation_check" CHECK ((grant_generation > 0)) not valid;

alter table "public"."kleinanzeigen_sync_runs" validate constraint "kleinanzeigen_sync_runs_grant_generation_check";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) not valid;

alter table "public"."kleinanzeigen_sync_runs" validate constraint "kleinanzeigen_sync_runs_requested_by_fkey";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_state_check" CHECK ((state = ANY (ARRAY['queued'::text, 'reading'::text, 'confirmed'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."kleinanzeigen_sync_runs" validate constraint "kleinanzeigen_sync_runs_state_check";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_workspace_id_connection_id_fkey" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.kleinanzeigen_connections(workspace_id, id) on delete CASCADE not valid;

alter table "public"."kleinanzeigen_sync_runs" validate constraint "kleinanzeigen_sync_runs_workspace_id_connection_id_fkey";

alter table "public"."kleinanzeigen_sync_runs" add constraint "kleinanzeigen_sync_runs_workspace_id_connection_id_id_key" UNIQUE using index "kleinanzeigen_sync_runs_workspace_id_connection_id_id_key";

set check_function_bodies = off;

create or replace function public.kleinanzeigen_claim_sync(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_run_id bigint)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_session jsonb; v_run public.kleinanzeigen_sync_runs; v_token text;
begin
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 select * into v_run from public.kleinanzeigen_sync_runs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_run_id for update;
 if not found or v_run.state<>'queued' or v_run.lease_until<=clock_timestamp() or v_run.grant_generation<>p_generation
  or not public.marketplace_sync_authorization_valid(p_workspace_id,v_run.requested_by)
  or not public.marketplace_local_extension_user_valid(v_run.requested_by) then raise exception 'Abgleich nicht übernehmbar.' using errcode='55000'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 update public.kleinanzeigen_sync_runs set state='reading',claim_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),lease_until=least((v_session->>'expiresAt')::timestamptz,clock_timestamp()+interval '2 minutes') where id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'claimToken',v_token,'generation',p_generation,'externalAccountId',v_session->>'externalAccountId','nextCursor','page:1');
end;
$function$
;

create or replace function public.kleinanzeigen_fail_sync(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_run_id bigint, p_claim_token text, p_external_account_id text, p_error_code text)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_run public.kleinanzeigen_sync_runs;
begin
 v_run:=public.kleinanzeigen_locked_sync(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_run_id,p_claim_token,p_external_account_id);
 if v_run.state<>'reading' then raise exception 'Bestätigten Abgleich nicht nachträglich ändern.' using errcode='55000'; end if;
 if p_error_code is null or p_error_code not in ('schema_changed','needs_login','interrupted','account_changed','unsupported','access_revoked') then raise exception 'Ungültiger Abbruchgrund.' using errcode='22023'; end if;
 update public.kleinanzeigen_sync_runs set state='failed',error_code=p_error_code,completed_at=clock_timestamp() where id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'state','failed','errorCode',p_error_code);
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
  on conflict(workspace_id,connection_id,external_id) do update set title=excluded.title,url=excluded.url,state=excluded.state,available=true,published_at=coalesce(excluded.published_at,public.kleinanzeigen_publications.published_at),observed_at=excluded.observed_at,sync_run_id=excluded.sync_run_id;
 update public.kleinanzeigen_publications p set available=false,observed_at=v_now,sync_run_id=v_run.id
  where p.workspace_id=p_workspace_id and p.connection_id=p_connection_id and not exists(select 1 from public.kleinanzeigen_sync_entries e where e.run_id=v_run.id and e.external_id=p.external_id);
 update public.kleinanzeigen_connections set status='connected',last_synced_at=v_now,quota_used=v_used,quota_observed_at=v_observed where workspace_id=p_workspace_id and id=p_connection_id;
 update public.kleinanzeigen_sync_runs set state='confirmed',completed_at=v_now where id=v_run.id;
 select count(*)::integer into v_count from public.kleinanzeigen_sync_entries where run_id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'state','confirmed','observedAt',v_now,'itemCount',v_count);
end;
$function$
;

create or replace function public.kleinanzeigen_locked_sync(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_run_id bigint, p_claim_token text, p_external_account_id text)
 returns public.kleinanzeigen_sync_runs
 language plpgsql
 set search_path to ''
as $function$
declare v_session jsonb; v_run public.kleinanzeigen_sync_runs;
begin
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 if p_external_account_id is null or p_external_account_id is distinct from v_session->>'externalAccountId' then raise exception 'Kleinanzeigen-Konto gewechselt.' using errcode='42501'; end if;
 select * into v_run from public.kleinanzeigen_sync_runs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_run_id for update;
 if not found or p_claim_token is null or p_claim_token !~ '^[0-9a-f]{64}$' or v_run.claim_token_hash is distinct from encode(extensions.digest(p_claim_token,'sha256'),'hex')
  or v_run.grant_generation<>p_generation or v_run.state not in ('reading','confirmed') or (v_run.state='reading' and v_run.lease_until<=clock_timestamp())
  or not public.marketplace_sync_authorization_valid(p_workspace_id,v_run.requested_by) or not public.marketplace_local_extension_user_valid(v_run.requested_by) then raise exception 'Abgleich nicht mehr gültig.' using errcode='55000'; end if;
 return v_run;
end;
$function$
;

create or replace function public.kleinanzeigen_request_sync(p_workspace_id uuid, p_connection_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_grant public.kleinanzeigen_local_grants; v_run public.kleinanzeigen_sync_runs;
begin
 if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid()))
  or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diesen Abgleich.' using errcode='42501'; end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id and status<>'disconnected' for update;
 if not found then raise exception 'Konto nicht verfügbar.' using errcode='42501'; end if;
 select * into v_grant from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
 if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp()
  or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by)
  or not public.marketplace_local_extension_user_valid(v_grant.approved_by) then raise exception 'Keine aktive lokale Freigabe.' using errcode='42501'; end if;
 update public.kleinanzeigen_sync_runs set state='cancelled',error_code='interrupted',completed_at=clock_timestamp()
  where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','reading') and (lease_until<=clock_timestamp() or grant_generation<>v_grant.grant_generation);
 select * into v_run from public.kleinanzeigen_sync_runs where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('queued','reading');
 if not found then
  insert into public.kleinanzeigen_sync_runs(workspace_id,connection_id,grant_generation,requested_by,lease_until)
   values(p_workspace_id,p_connection_id,v_grant.grant_generation,(select auth.uid()),least(v_grant.expires_at,clock_timestamp()+interval '3 minutes')) returning * into v_run;
 end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'state',v_run.state,'generation',v_run.grant_generation);
end;
$function$
;

create or replace function public.kleinanzeigen_store_sync_page(p_workspace_id uuid, p_connection_id bigint, p_token_hash text, p_generation bigint, p_run_id bigint, p_claim_token text, p_external_account_id text, p_cursor text, p_next_cursor text, p_items jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare v_run public.kleinanzeigen_sync_runs; v_item jsonb; v_digest text; v_seen jsonb; v_page integer;
begin
 v_run:=public.kleinanzeigen_locked_sync(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_run_id,p_claim_token,p_external_account_id);
 if v_run.state<>'reading' then raise exception 'Abgleich bereits beendet.' using errcode='55000'; end if;
 if p_cursor is null or p_cursor !~ '^page:[1-9][0-9]{0,3}$' or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Ungültige Anzeigenliste.' using errcode='22023'; end if;
 v_page:=split_part(p_cursor,':',2)::integer;
 if (p_next_cursor is not null and p_next_cursor<>('page:'||(v_page+1)::text)) or jsonb_array_length(p_items)>200 or (p_next_cursor is not null and jsonb_array_length(p_items)=0) then raise exception 'Ungültiger Seitenabschluss.' using errcode='22023'; end if;
 v_digest:=encode(extensions.digest(jsonb_build_object('next',p_next_cursor,'items',p_items)::text,'sha256'),'hex');
 v_seen:=v_run.accepted_pages->p_cursor;
 if v_seen is not null then
  if v_seen->>'hash' is distinct from v_digest then raise exception 'Anzeigenseite hat sich geändert.' using errcode='40001'; end if;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'acceptedCursor',p_cursor,'nextCursor',p_next_cursor,'complete',p_next_cursor is null);
 end if;
 if p_cursor is distinct from v_run.next_cursor or (select count(*) from jsonb_object_keys(v_run.accepted_pages))>=500
  or (select count(*) from public.kleinanzeigen_sync_entries where run_id=v_run.id)+jsonb_array_length(p_items)>20000 then raise exception 'Anzeigenfolge unvollständig.' using errcode='55000'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(v_item) key) is distinct from array['externalId','publishedAt','state','title','url']::text[]
   or jsonb_typeof(v_item->'externalId') is distinct from 'string' or (v_item->>'externalId') !~ '^[1-9][0-9]{0,31}$'
   or jsonb_typeof(v_item->'title') is distinct from 'string' or char_length(btrim(v_item->>'title')) not between 1 and 512
   or jsonb_typeof(v_item->'url') is distinct from 'string' or (v_item->>'url') !~ ('^https://(www\.)?kleinanzeigen\.de/s-anzeige/[^/?#]+/'||(v_item->>'externalId')||'-[0-9]+-[0-9]+$')
   or v_item->'publishedAt' is distinct from 'null'::jsonb or v_item->>'state' not in ('active','unknown') or jsonb_typeof(v_item->'state') is distinct from 'string' then raise exception 'Anzeigenformat unbekannt.' using errcode='22023'; end if;
  if exists(select 1 from public.kleinanzeigen_sync_entries where run_id=v_run.id and external_id=v_item->>'externalId') then raise exception 'Doppelte Anzeige im Abgleich.' using errcode='40001'; end if;
  insert into public.kleinanzeigen_sync_entries(workspace_id,connection_id,run_id,external_id,title,url,state)
   values(p_workspace_id,p_connection_id,v_run.id,v_item->>'externalId',v_item->>'title',v_item->>'url',v_item->>'state');
 end loop;
 update public.kleinanzeigen_sync_runs set next_cursor=p_next_cursor,accepted_pages=accepted_pages||jsonb_build_object(p_cursor,jsonb_build_object('hash',v_digest)),lease_until=least((select expires_at from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id),clock_timestamp()+interval '2 minutes') where id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'acceptedCursor',p_cursor,'nextCursor',p_next_cursor,'complete',p_next_cursor is null);
end;
$function$
;

grant select on table "public"."kleinanzeigen_publications" to "authenticated";

grant delete on table "public"."kleinanzeigen_publications" to "service_role";

grant insert on table "public"."kleinanzeigen_publications" to "service_role";

grant references on table "public"."kleinanzeigen_publications" to "service_role";

grant select on table "public"."kleinanzeigen_publications" to "service_role";

grant trigger on table "public"."kleinanzeigen_publications" to "service_role";

grant truncate on table "public"."kleinanzeigen_publications" to "service_role";

grant update on table "public"."kleinanzeigen_publications" to "service_role";

grant delete on table "public"."kleinanzeigen_sync_entries" to "service_role";

grant insert on table "public"."kleinanzeigen_sync_entries" to "service_role";

grant references on table "public"."kleinanzeigen_sync_entries" to "service_role";

grant select on table "public"."kleinanzeigen_sync_entries" to "service_role";

grant trigger on table "public"."kleinanzeigen_sync_entries" to "service_role";

grant truncate on table "public"."kleinanzeigen_sync_entries" to "service_role";

grant update on table "public"."kleinanzeigen_sync_entries" to "service_role";

grant delete on table "public"."kleinanzeigen_sync_runs" to "service_role";

grant insert on table "public"."kleinanzeigen_sync_runs" to "service_role";

grant references on table "public"."kleinanzeigen_sync_runs" to "service_role";

grant select on table "public"."kleinanzeigen_sync_runs" to "service_role";

grant trigger on table "public"."kleinanzeigen_sync_runs" to "service_role";

grant truncate on table "public"."kleinanzeigen_sync_runs" to "service_role";

grant update on table "public"."kleinanzeigen_sync_runs" to "service_role";


  create policy "Eigene Kleinanzeigen-Inserate lesen"
  on "public"."kleinanzeigen_publications"
  as permissive
  for select
  to authenticated
using (public.marketplace_can_manage(workspace_id));



  create policy "Inserate serverseitig anlegen"
  on "public"."kleinanzeigen_publications"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Inserate serverseitig lesen"
  on "public"."kleinanzeigen_publications"
  as permissive
  for select
  to service_role
using (true);



  create policy "Inserate serverseitig löschen"
  on "public"."kleinanzeigen_publications"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Inserate serverseitig ändern"
  on "public"."kleinanzeigen_publications"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "Vormerkungen serverseitig anlegen"
  on "public"."kleinanzeigen_sync_entries"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Vormerkungen serverseitig lesen"
  on "public"."kleinanzeigen_sync_entries"
  as permissive
  for select
  to service_role
using (true);



  create policy "Vormerkungen serverseitig löschen"
  on "public"."kleinanzeigen_sync_entries"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Vormerkungen serverseitig ändern"
  on "public"."kleinanzeigen_sync_entries"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "Abgleichsläufe serverseitig anlegen"
  on "public"."kleinanzeigen_sync_runs"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Abgleichsläufe serverseitig lesen"
  on "public"."kleinanzeigen_sync_runs"
  as permissive
  for select
  to service_role
using (true);



  create policy "Abgleichsläufe serverseitig löschen"
  on "public"."kleinanzeigen_sync_runs"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Abgleichsläufe serverseitig ändern"
  on "public"."kleinanzeigen_sync_runs"
  as permissive
  for update
  to service_role
using (true)
with check (true);


create trigger "00_protect_archived_workspace" before insert or delete or update on public.kleinanzeigen_publications for each row execute function public.protect_archived_workspace_data();

create trigger "00_protect_archived_workspace" before insert or delete or update on public.kleinanzeigen_sync_entries for each row execute function public.protect_archived_workspace_data();

create trigger "00_protect_archived_workspace" before insert or delete or update on public.kleinanzeigen_sync_runs for each row execute function public.protect_archived_workspace_data();

-- Explicit Kleinanzeigen sync permissions from declarative schema
revoke all on public.kleinanzeigen_sync_runs from public,anon,authenticated;
revoke all on public.kleinanzeigen_sync_entries from public,anon,authenticated;
revoke all on public.kleinanzeigen_publications from public,anon,authenticated;
grant all on public.kleinanzeigen_sync_runs to service_role;
grant all on public.kleinanzeigen_sync_entries to service_role;
grant all on public.kleinanzeigen_publications to service_role;
grant select on public.kleinanzeigen_publications to authenticated;
revoke all on sequence public.kleinanzeigen_sync_runs_id_seq from public,anon,authenticated;
revoke all on sequence public.kleinanzeigen_sync_entries_id_seq from public,anon,authenticated;
revoke all on sequence public.kleinanzeigen_publications_id_seq from public,anon,authenticated;
grant usage,select on sequence public.kleinanzeigen_sync_runs_id_seq to service_role;
grant usage,select on sequence public.kleinanzeigen_sync_entries_id_seq to service_role;
grant usage,select on sequence public.kleinanzeigen_publications_id_seq to service_role;
revoke all on function public.kleinanzeigen_request_sync(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_request_sync(uuid,bigint) to authenticated;
revoke all on function public.kleinanzeigen_claim_sync(uuid,bigint,text,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_claim_sync(uuid,bigint,text,bigint,bigint) to service_role;
revoke all on function public.kleinanzeigen_locked_sync(uuid,bigint,text,bigint,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_locked_sync(uuid,bigint,text,bigint,bigint,text,text) to service_role;
revoke all on function public.kleinanzeigen_store_sync_page(uuid,bigint,text,bigint,bigint,text,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_store_sync_page(uuid,bigint,text,bigint,bigint,text,text,text,text,jsonb) to service_role;
revoke all on function public.kleinanzeigen_finish_sync(uuid,bigint,text,bigint,bigint,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_finish_sync(uuid,bigint,text,bigint,bigint,text,text,jsonb) to service_role;
revoke all on function public.kleinanzeigen_fail_sync(uuid,bigint,text,bigint,bigint,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_fail_sync(uuid,bigint,text,bigint,bigint,text,text,text) to service_role;
