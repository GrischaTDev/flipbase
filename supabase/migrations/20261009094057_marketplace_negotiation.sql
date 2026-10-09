-- Kontobezogene Vinted-Verhandlungen mit privaten Regeln und Aufträgen.
-- Betrifft marketplace_negotiation_* und bestätigte Bot-Belege im Chatabruf.
-- Per supabase db diff erzeugt; nicht betroffene Fixture-ACLs ausgelassen.

set check_function_bodies = off;

-- Die erzeugten Validatoren stehen vor ihren Tabellen-Defaults und Constraints.
CREATE OR REPLACE FUNCTION public.marketplace_negotiation_discount_valid(p_discount jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_typeof(p_discount->'discountValue')='number'
    and (p_discount->>'discountValue')::numeric>0
    and case p_discount->>'discountType'
      when 'percentage' then (p_discount->>'discountValue')::numeric<=50 and trunc((p_discount->>'discountValue')::numeric*100)=(p_discount->>'discountValue')::numeric*100
      when 'amount' then (p_discount->>'discountValue')::numeric<=500000 and trunc((p_discount->>'discountValue')::numeric*100)=(p_discount->>'discountValue')::numeric*100
      else false end,false);
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_config_valid(p_config jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_band jsonb; v_stage jsonb; v_event text; v_step jsonb; v_template jsonb; v_previous numeric:=0; v_limit numeric; v_index integer:=0;
begin
  if p_config is null or jsonb_typeof(p_config)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_config))<>8
    or exists(select 1 from jsonb_object_keys(p_config) field where field<>all(array['discountType','discountValue','priceBands','stages','delaySeconds','sendOrder','purchaseEnabled','messages']))
    or not public.marketplace_negotiation_discount_valid(p_config)
    or jsonb_typeof(p_config->'delaySeconds') is distinct from 'number' or (p_config->>'delaySeconds')::numeric not between 0 and 604800
    or trunc((p_config->>'delaySeconds')::numeric)<>(p_config->>'delaySeconds')::numeric
    or coalesce(p_config->>'sendOrder','') not in ('offer_first','message_first') or jsonb_typeof(p_config->'purchaseEnabled') is distinct from 'boolean'
    or jsonb_typeof(p_config->'priceBands') is distinct from 'array' or jsonb_array_length(p_config->'priceBands')>20
    or jsonb_typeof(p_config->'stages') is distinct from 'array' or jsonb_array_length(p_config->'stages') not between 1 and 10
    or jsonb_typeof(p_config->'messages') is distinct from 'object' then return false; end if;
  for v_band in select * from jsonb_array_elements(p_config->'priceBands') loop
    v_index:=v_index+1;
    if jsonb_typeof(v_band)<>'object' or (select count(*) from jsonb_object_keys(v_band))<>3
      or exists(select 1 from jsonb_object_keys(v_band) field where field<>all(array['upToCents','discountType','discountValue']))
      or not public.marketplace_negotiation_discount_valid(v_band) then return false; end if;
    if v_band->'upToCents'='null'::jsonb then
      if v_index<>jsonb_array_length(p_config->'priceBands') then return false; end if;
    else
      if jsonb_typeof(v_band->'upToCents') is distinct from 'number' then return false; end if;
      v_limit:=(v_band->>'upToCents')::numeric;
      if v_limit<=v_previous or v_limit>100000000 or trunc(v_limit)<>v_limit then return false; end if;
      v_previous:=v_limit;
    end if;
  end loop;
  v_previous:=0;
  for v_stage in select * from jsonb_array_elements(p_config->'stages') loop
    if jsonb_typeof(v_stage)<>'number' or v_stage::numeric<=v_previous or v_stage::numeric>100 or trunc(v_stage::numeric)<>v_stage::numeric then return false; end if;
    v_previous:=v_stage::numeric;
  end loop;
  if v_previous<>100 or (select count(*) from jsonb_object_keys(p_config->'messages'))<>7 then return false; end if;
  foreach v_event in array array['accepted','counter','final','after_final','after_acceptance','buyer_accepted','purchased'] loop
    if jsonb_typeof(p_config->'messages'->v_event) is distinct from 'array' or jsonb_array_length(p_config->'messages'->v_event)>5 then return false; end if;
    for v_step in select * from jsonb_array_elements(p_config->'messages'->v_event) loop
      if jsonb_typeof(v_step)<>'object' or (select count(*) from jsonb_object_keys(v_step))<>2
        or exists(select 1 from jsonb_object_keys(v_step) field where field<>all(array['templates','delaySeconds']))
        or jsonb_typeof(v_step->'delaySeconds') is distinct from 'number' or (v_step->>'delaySeconds')::numeric not between 0 and 604800
        or trunc((v_step->>'delaySeconds')::numeric)<>(v_step->>'delaySeconds')::numeric
        or jsonb_typeof(v_step->'templates') is distinct from 'array' or jsonb_array_length(v_step->'templates') not between 1 and 10 then return false; end if;
      for v_template in select * from jsonb_array_elements(v_step->'templates') loop
        if jsonb_typeof(v_template)<>'string' or char_length(btrim(v_template#>>'{}')) not between 1 and 2000
          or (v_template#>>'{}') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_default_config()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select '{"discountType":"percentage","discountValue":10,"priceBands":[],"stages":[50,80,100],"delaySeconds":0,"sendOrder":"offer_first","purchaseEnabled":false,"messages":{"accepted":[],"counter":[],"final":[],"after_final":[],"after_acceptance":[],"buyer_accepted":[],"purchased":[]}}'::jsonb;
$function$
;

create table "public"."marketplace_negotiation_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "thread_id" uuid not null,
    "conversation_id" uuid not null,
    "source_key" text not null,
    "step_index" integer not null,
    "message_id" uuid,
    "request_id" uuid,
    "automated" boolean not null,
    "event_name" text not null,
    "setting_version" bigint,
    "requested_by" uuid not null,
    "execution_mode" text not null,
    "external_account_id" text not null,
    "grant_generation" bigint,
    "cloud_authorization_version" bigint,
    "action" text not null,
    "command" jsonb not null,
    "predecessor_id" uuid,
    "delay_seconds" integer not null default 0,
    "due_at" timestamp with time zone,
    "state" text not null default 'queued'::text,
    "claim_token" uuid,
    "lease_expires_at" timestamp with time zone,
    "cloud_browser_session_id" uuid,
    "cloud_worker_id" uuid,
    "cloud_worker_epoch" bigint,
    "cloud_runner_id" uuid,
    "external_id" text,
    "error_code" text,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "source_offer" jsonb
      );

alter table "public"."marketplace_negotiation_jobs" enable row level security;

create table "public"."marketplace_negotiation_settings" (
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "enabled" boolean not null default false,
    "config" jsonb not null default public.marketplace_negotiation_default_config(),
    "version" bigint not null default 1,
    "activated_at" timestamp with time zone not null default clock_timestamp(),
    "approved_by" uuid not null,
    "execution_mode" text not null,
    "external_account_id" text,
    "grant_generation" bigint,
    "cloud_authorization_version" bigint,
    "updated_at" timestamp with time zone not null default now()
      );

alter table "public"."marketplace_negotiation_settings" enable row level security;

create table "public"."marketplace_negotiation_threads" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "conversation_id" uuid not null,
    "item_id" text not null,
    "transaction_id" text not null,
    "completed_stages" integer not null default 0,
    "accepted" boolean not null default false,
    "purchased" boolean not null default false,
    "last_offer_at" timestamp with time zone,
    "last_offer_id" text,
    "created_at" timestamp with time zone not null default now()
      );

alter table "public"."marketplace_negotiation_threads" enable row level security;

CREATE INDEX marketplace_negotiation_jobs_account ON public.marketplace_negotiation_jobs USING btree (workspace_id, connection_id, conversation_id, created_at DESC);

CREATE INDEX marketplace_negotiation_jobs_due ON public.marketplace_negotiation_jobs USING btree (execution_mode, state, due_at, created_at, id);

CREATE INDEX marketplace_negotiation_jobs_message_origin ON public.marketplace_negotiation_jobs USING btree (workspace_id, connection_id, conversation_id, external_id) WHERE (automated AND (state = 'sent'::text) AND (action = 'message'::text) AND ((command ->> 'kind'::text) = 'message'::text));

CREATE UNIQUE INDEX marketplace_negotiation_jobs_pkey ON public.marketplace_negotiation_jobs USING btree (id);

CREATE INDEX marketplace_negotiation_jobs_predecessor ON public.marketplace_negotiation_jobs USING btree (predecessor_id);

CREATE INDEX marketplace_negotiation_jobs_requester ON public.marketplace_negotiation_jobs USING btree (requested_by);

CREATE UNIQUE INDEX marketplace_negotiation_jobs_workspace_id_connection_id_req_key ON public.marketplace_negotiation_jobs USING btree (workspace_id, connection_id, request_id);

CREATE UNIQUE INDEX marketplace_negotiation_jobs_workspace_id_connection_id_sou_key ON public.marketplace_negotiation_jobs USING btree (workspace_id, connection_id, source_key, step_index);

CREATE INDEX marketplace_negotiation_settings_authorizer ON public.marketplace_negotiation_settings USING btree (approved_by);

CREATE UNIQUE INDEX marketplace_negotiation_settings_pkey ON public.marketplace_negotiation_settings USING btree (workspace_id, connection_id);

CREATE UNIQUE INDEX marketplace_negotiation_threa_workspace_id_connection_id_co_key ON public.marketplace_negotiation_threads USING btree (workspace_id, connection_id, conversation_id, item_id);

CREATE UNIQUE INDEX marketplace_negotiation_threa_workspace_id_connection_id_id_key ON public.marketplace_negotiation_threads USING btree (workspace_id, connection_id, id);

CREATE UNIQUE INDEX marketplace_negotiation_threads_pkey ON public.marketplace_negotiation_threads USING btree (id);

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_pkey" PRIMARY KEY using index "marketplace_negotiation_jobs_pkey";

alter table "public"."marketplace_negotiation_settings" add constraint "marketplace_negotiation_settings_pkey" PRIMARY KEY using index "marketplace_negotiation_settings_pkey";

alter table "public"."marketplace_negotiation_threads" add constraint "marketplace_negotiation_threads_pkey" PRIMARY KEY using index "marketplace_negotiation_threads_pkey";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_action_check" CHECK ((action = ANY (ARRAY['accept'::text, 'decline'::text, 'counter'::text, 'message'::text]))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_action_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_check" CHECK ((((execution_mode = 'local'::text) AND (grant_generation IS NOT NULL) AND (cloud_authorization_version IS NULL)) OR ((execution_mode = 'cloud'::text) AND (grant_generation IS NULL) AND (cloud_authorization_version > 0)))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_check1" CHECK ((((cloud_browser_session_id IS NULL) AND (cloud_worker_id IS NULL) AND (cloud_worker_epoch IS NULL) AND (cloud_runner_id IS NULL)) OR ((execution_mode = 'cloud'::text) AND (cloud_browser_session_id IS NOT NULL) AND (cloud_worker_id IS NOT NULL) AND (cloud_worker_epoch > 0) AND (cloud_runner_id IS NOT NULL) AND (claim_token IS NOT NULL)))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_check1";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_command_check" CHECK ((jsonb_typeof(command) = 'object'::text)) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_command_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_delay_seconds_check" CHECK (((delay_seconds >= 0) AND (delay_seconds <= 604800))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_delay_seconds_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_error_code_check" CHECK ((error_code ~ '^[a-z_]{1,80}$'::text)) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_error_code_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_event_name_check" CHECK ((event_name = ANY (ARRAY['manual'::text, 'accepted'::text, 'counter'::text, 'final'::text, 'after_final'::text, 'after_acceptance'::text, 'buyer_accepted'::text, 'purchased'::text]))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_event_name_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_execution_mode_check" CHECK ((execution_mode = ANY (ARRAY['local'::text, 'cloud'::text]))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_execution_mode_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_external_id_check" CHECK ((external_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_external_id_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_predecessor_id_fkey" FOREIGN KEY (predecessor_id) REFERENCES public.marketplace_negotiation_jobs(id) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_predecessor_id_fkey";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_requested_by_fkey";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_source_offer_check" CHECK (((source_offer IS NULL) OR (jsonb_typeof(source_offer) = 'object'::text))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_source_offer_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_state_check" CHECK ((state = ANY (ARRAY['queued'::text, 'claimed'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'outcome_unknown'::text, 'skipped'::text, 'cancelled'::text]))) not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_state_check";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_workspace_id_connection_id_co_fkey" FOREIGN KEY (workspace_id, connection_id, conversation_id) REFERENCES public.marketplace_account_entries(workspace_id, connection_id, id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_workspace_id_connection_id_co_fkey";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_workspace_id_connection_id_req_key" UNIQUE using index "marketplace_negotiation_jobs_workspace_id_connection_id_req_key";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_workspace_id_connection_id_sou_key" UNIQUE using index "marketplace_negotiation_jobs_workspace_id_connection_id_sou_key";

alter table "public"."marketplace_negotiation_jobs" add constraint "marketplace_negotiation_jobs_workspace_id_connection_id_th_fkey" FOREIGN KEY (workspace_id, connection_id, thread_id) REFERENCES public.marketplace_negotiation_threads(workspace_id, connection_id, id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_negotiation_jobs" validate constraint "marketplace_negotiation_jobs_workspace_id_connection_id_th_fkey";

alter table "public"."marketplace_negotiation_settings" add constraint "marketplace_negotiation_setting_workspace_id_connection_id_fkey" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_negotiation_settings" validate constraint "marketplace_negotiation_setting_workspace_id_connection_id_fkey";

alter table "public"."marketplace_negotiation_settings" add constraint "marketplace_negotiation_settings_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) not valid;

alter table "public"."marketplace_negotiation_settings" validate constraint "marketplace_negotiation_settings_approved_by_fkey";

alter table "public"."marketplace_negotiation_settings" add constraint "marketplace_negotiation_settings_config_check" CHECK (public.marketplace_negotiation_config_valid(config)) not valid;

alter table "public"."marketplace_negotiation_settings" validate constraint "marketplace_negotiation_settings_config_check";

alter table "public"."marketplace_negotiation_settings" add constraint "marketplace_negotiation_settings_execution_mode_check" CHECK ((execution_mode = ANY (ARRAY['local'::text, 'cloud'::text]))) not valid;

alter table "public"."marketplace_negotiation_settings" validate constraint "marketplace_negotiation_settings_execution_mode_check";

alter table "public"."marketplace_negotiation_settings" add constraint "marketplace_negotiation_settings_version_check" CHECK ((version > 0)) not valid;

alter table "public"."marketplace_negotiation_settings" validate constraint "marketplace_negotiation_settings_version_check";

alter table "public"."marketplace_negotiation_threads" add constraint "marketplace_negotiation_threa_workspace_id_connection_id_c_fkey" FOREIGN KEY (workspace_id, connection_id, conversation_id) REFERENCES public.marketplace_account_entries(workspace_id, connection_id, id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_negotiation_threads" validate constraint "marketplace_negotiation_threa_workspace_id_connection_id_c_fkey";

alter table "public"."marketplace_negotiation_threads" add constraint "marketplace_negotiation_threa_workspace_id_connection_id_co_key" UNIQUE using index "marketplace_negotiation_threa_workspace_id_connection_id_co_key";

alter table "public"."marketplace_negotiation_threads" add constraint "marketplace_negotiation_threa_workspace_id_connection_id_id_key" UNIQUE using index "marketplace_negotiation_threa_workspace_id_connection_id_id_key";

alter table "public"."marketplace_negotiation_threads" add constraint "marketplace_negotiation_threads_completed_stages_check" CHECK (((completed_stages >= 0) AND (completed_stages <= 10))) not valid;

alter table "public"."marketplace_negotiation_threads" validate constraint "marketplace_negotiation_threads_completed_stages_check";

CREATE OR REPLACE FUNCTION public.marketplace_cancel_invalid_negotiation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_connection uuid;
begin
  perform pg_advisory_xact_lock(91731,1);
  if tg_table_name='marketplace_connections' then v_connection:=old.id; else v_connection:=old.connection_id; end if;
  update public.marketplace_negotiation_jobs job set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp()
    where workspace_id=old.workspace_id and connection_id=v_connection and state in ('queued','claimed')
      and not public.marketplace_negotiation_authorized(job.workspace_id,job.connection_id,job.requested_by,job.execution_mode,job.external_account_id,job.grant_generation,job.cloud_authorization_version);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cancel_unknown_negotiation_followups()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.state='outcome_unknown' and old.state is distinct from new.state then
    -- Auch ein Timeout ohne Runner-Ergebnis verwirft Folgen dauerhaft vor einem späteren Erfolgsbeleg.
    with recursive following as (
      select id from public.marketplace_negotiation_jobs where predecessor_id=new.id
      union all select job.id from public.marketplace_negotiation_jobs job join following on job.predecessor_id=following.id
    ) update public.marketplace_negotiation_jobs set state='cancelled',error_code='predecessor_not_sent',updated_at=clock_timestamp()
      where id in(select id from following) and state in ('queued','claimed');
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_negotiation_begin(p_workspace_id uuid, p_connection_id uuid, p_job_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if public.marketplace_cloud_negotiation_check(p_workspace_id,p_connection_id,p_job_id,p_claim_token,p_worker_id,p_worker_epoch)->>'active'<>'true' then raise exception 'Verhandlungsclaim ungültig' using errcode='42501'; end if;
  update public.marketplace_negotiation_jobs set state='sending',started_at=clock_timestamp(),updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id and claim_token=p_claim_token and state='claimed';
  if not found then raise exception 'Verhandlungsclaim ungültig' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_negotiation_check(p_workspace_id uuid, p_connection_id uuid, p_job_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_job public.marketplace_negotiation_jobs; v_session public.marketplace_browser_sessions; v_inactive jsonb:='{"active":false,"sessionId":null,"expiresAt":null,"absoluteExpiresAt":null}';
begin
  perform pg_advisory_xact_lock(91731,1);
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return v_inactive; end if;
  select * into v_job from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id and execution_mode='cloud' and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch and state in ('claimed','sending') and lease_expires_at>clock_timestamp() for update;
  if not found or not public.marketplace_negotiation_job_valid(v_job) then return v_inactive; end if;
  select * into v_session from public.marketplace_browser_sessions where public_id=v_job.cloud_browser_session_id and workspace_id=p_workspace_id and connection_id=p_connection_id and started_by=v_job.requested_by and worker_id=p_worker_id and worker_epoch=p_worker_epoch and state='active' and expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp()
    and provider_profile_id=(select provider_profile_id from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id) for update;
  if not found then return v_inactive; end if;
  update public.marketplace_browser_sessions set heartbeat_at=clock_timestamp(),expires_at=least(clock_timestamp()+interval '90 seconds',absolute_expires_at) where id=v_session.id returning * into v_session;
  update public.marketplace_negotiation_jobs set lease_expires_at=v_session.expires_at,updated_at=clock_timestamp() where id=p_job_id;
  return jsonb_build_object('active',true,'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_negotiation_claim(p_worker_id uuid, p_worker_epoch bigint, p_runner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_job public.marketplace_negotiation_jobs; v_permission public.marketplace_cloud_message_permissions; v_session public.marketplace_browser_sessions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if p_runner_id is null then raise exception 'Auftragskennung fehlt' using errcode='22023'; end if;
  perform 1 from public.marketplace_worker_runtime where id=1 and worker_id=p_worker_id and worker_epoch=p_worker_epoch and expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  update public.marketplace_negotiation_jobs set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp() where execution_mode='cloud' and state='sending' and (lease_expires_at<=clock_timestamp() or exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed'));
  -- Eine abgelaufene Browserlease gibt das Profil erst nach bestätigtem physischem Stopp frei.
  update public.marketplace_negotiation_jobs set state='queued',claim_token=null,lease_expires_at=null,cloud_browser_session_id=null,cloud_worker_id=null,cloud_worker_epoch=null,cloud_runner_id=null,updated_at=clock_timestamp()
    where execution_mode='cloud' and state='claimed' and exists(select 1 from public.marketplace_browser_sessions where public_id=cloud_browser_session_id and state='closed');
  update public.marketplace_negotiation_jobs job set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp() where execution_mode='cloud' and state in ('queued','claimed') and due_at is not null and not public.marketplace_negotiation_job_valid(job);
  if exists(select 1 from public.marketplace_browser_sessions where state in ('active','stopping')) then return null; end if;
  select * into v_job from public.marketplace_negotiation_jobs job where execution_mode='cloud' and state='queued' and due_at<=clock_timestamp() and public.marketplace_negotiation_job_valid(job) order by due_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=v_job.workspace_id and connection_id=v_job.connection_id for update;
  insert into public.marketplace_browser_sessions(workspace_id,connection_id,started_by,provider_profile_id,expires_at,worker_id,worker_epoch,heartbeat_at,absolute_expires_at)
    values(v_job.workspace_id,v_job.connection_id,v_job.requested_by,v_permission.provider_profile_id,clock_timestamp()+interval '90 seconds',p_worker_id,p_worker_epoch,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning * into v_session;
  update public.marketplace_negotiation_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=v_session.expires_at,cloud_browser_session_id=v_session.public_id,cloud_worker_id=p_worker_id,cloud_worker_epoch=p_worker_epoch,cloud_runner_id=p_runner_id,updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id,'claimToken',v_job.claim_token,'workspaceId',v_job.workspace_id,'connectionId',v_job.connection_id,'userId',v_job.requested_by,'workerId',p_worker_id,'workerEpoch',p_worker_epoch,'runnerId',p_runner_id,'authorizationVersion',v_job.cloud_authorization_version,'externalAccountId',v_job.external_account_id,
    'sessionId',v_session.public_id,'expiresAt',v_session.expires_at,'absoluteExpiresAt',v_session.absolute_expires_at,'command',v_job.command,
    'sourceOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' and not exists(select 1 from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent') then v_job.source_offer end,
    'confirmedOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' then (select jsonb_build_object('command',confirmed.command,'externalId',confirmed.external_id) from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent' and confirmed.external_id ~ '^[1-9][0-9]{0,31}$' order by confirmed.finished_at desc limit 1) end);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_cloud_negotiation_finish(p_workspace_id uuid, p_connection_id uuid, p_job_id uuid, p_claim_token uuid, p_worker_id uuid, p_worker_epoch bigint, p_outcome text, p_external_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_job public.marketplace_negotiation_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id and execution_mode='cloud' and claim_token=p_claim_token and cloud_worker_id=p_worker_id and cloud_worker_epoch=p_worker_epoch for update;
  if not found then raise exception 'Verhandlungsclaim ungültig' using errcode='42501'; end if;
  return public.marketplace_negotiation_finish_job(v_job,p_outcome,p_external_id,p_error_code);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_enqueue_negotiation(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid, p_message_id uuid, p_request_id uuid, p_action text, p_price_cents bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.marketplace_connections; v_grant public.marketplace_local_extension_grants; v_permission public.marketplace_cloud_message_permissions; v_message public.marketplace_account_entries; v_thread public.marketplace_negotiation_threads; v_job public.marketplace_negotiation_jobs; v_command jsonb; v_account text;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_request_id is null or p_action is null or p_action not in ('accept','decline','counter') or (p_action='counter' and (p_price_cents is null or p_price_cents<1)) or (p_action<>'counter' and p_price_cents is not null) then raise exception 'Ungültige Angebotsaktion' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id;
  if not public.marketplace_negotiation_authorized(p_workspace_id,p_connection_id,(select auth.uid()),v_connection.execution_mode,v_connection.external_account_id,v_grant.grant_generation,v_permission.authorization_version) then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  -- Wiederholte HTTP-Anfragen liefern den gespeicherten Auftrag; geänderte Nutzlast wird abgewiesen.
  select * into v_job from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and request_id=p_request_id;
  if found then
    if v_job.requested_by is distinct from (select auth.uid()) or v_job.conversation_id is distinct from p_conversation_id or v_job.message_id is distinct from p_message_id or v_job.action is distinct from p_action or (v_job.command->>'priceCents')::bigint is distinct from p_price_cents then raise exception 'Auftragskennung bereits verwendet' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'id',v_job.id,'state',v_job.state);
  end if;
  select * into v_message from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_message_id and parent_id=p_conversation_id and kind='message' and body->>'direction'='inbound';
  if not found or not public.marketplace_negotiation_offer_valid(p_workspace_id,p_connection_id,p_conversation_id,v_message.body->'negotiationOffer') then raise exception 'Angebot nicht verfügbar' using errcode='22023'; end if;
  if exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and kind='message' and parent_id=p_conversation_id and body->'negotiationOffer' is not null and sort_at>v_message.sort_at) then raise exception 'Angebot inzwischen geändert' using errcode='40001'; end if;
  if p_action='counter' and (p_price_cents>(v_message.body->'negotiationOffer'->>'originalPriceCents')::bigint or p_price_cents<= (v_message.body->'negotiationOffer'->>'offeredPriceCents')::bigint or p_price_cents<ceil((v_message.body->'negotiationOffer'->>'originalPriceCents')::numeric/2)) then raise exception 'Gegenangebot liegt außerhalb der Preisgrenze' using errcode='22023'; end if;
  insert into public.marketplace_negotiation_threads(workspace_id,connection_id,conversation_id,item_id,transaction_id)
    values(p_workspace_id,p_connection_id,p_conversation_id,v_message.body->'negotiationOffer'->>'itemId',v_message.body->'negotiationOffer'->>'transactionId') on conflict(workspace_id,connection_id,conversation_id,item_id) do nothing;
  select * into v_thread from public.marketplace_negotiation_threads where workspace_id=p_workspace_id and connection_id=p_connection_id and conversation_id=p_conversation_id and item_id=v_message.body->'negotiationOffer'->>'itemId' for update;
  if v_thread.purchased or v_thread.accepted or v_thread.transaction_id<>v_message.body->'negotiationOffer'->>'transactionId' then raise exception 'Verhandlung abgeschlossen' using errcode='22023'; end if;
  if exists(select 1 from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and conversation_id=p_conversation_id and state in ('sending','outcome_unknown'))
    or exists(select 1 from public.marketplace_negotiation_jobs where thread_id=v_thread.id and command->>'offerId'=v_message.body->'negotiationOffer'->>'offerId' and action<>'message' and state='sent') then raise exception 'Angebotsausgang zuerst prüfen' using errcode='40001'; end if;
  update public.marketplace_negotiation_jobs set state='cancelled',error_code='manual_takeover',updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and conversation_id=p_conversation_id and state in ('queued','claimed');
  v_command:=jsonb_build_object('kind','offer','action',p_action,'externalConversationId',(select external_id from public.marketplace_account_entries where id=p_conversation_id and workspace_id=p_workspace_id and connection_id=p_connection_id),'transactionId',v_message.body->'negotiationOffer'->>'transactionId','itemId',v_thread.item_id,'buyerId',v_message.body->'negotiationOffer'->>'buyerId','offerId',v_message.body->'negotiationOffer'->>'offerId','originalPriceCents',v_message.body->'negotiationOffer'->'originalPriceCents','offeredPriceCents',v_message.body->'negotiationOffer'->'offeredPriceCents','priceCents',p_price_cents,'currency','EUR');
  insert into public.marketplace_negotiation_jobs(workspace_id,connection_id,thread_id,conversation_id,source_key,step_index,message_id,request_id,automated,event_name,requested_by,execution_mode,external_account_id,grant_generation,cloud_authorization_version,action,command,source_offer,due_at)
    values(p_workspace_id,p_connection_id,v_thread.id,p_conversation_id,'manual:'||p_request_id,0,p_message_id,p_request_id,false,'manual',(select auth.uid()),v_connection.execution_mode,v_connection.external_account_id,case when v_connection.execution_mode='local' then v_grant.grant_generation end,case when v_connection.execution_mode='cloud' then v_permission.authorization_version end,p_action,v_command,v_message.body->'negotiationOffer',clock_timestamp()) returning * into v_job;
  return jsonb_build_object('ok',true,'id',v_job.id,'state',v_job.state);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_negotiation_begin(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_job_id uuid, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if public.marketplace_local_negotiation_check(p_workspace_id,p_connection_id,p_token_hash,p_job_id,p_claim_token)->>'active'<>'true' then raise exception 'Verhandlungsclaim ungültig' using errcode='42501'; end if;
  update public.marketplace_negotiation_jobs set state='sending',started_at=clock_timestamp(),updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id and claim_token=p_claim_token and state='claimed';
  if not found then raise exception 'Verhandlungsclaim ungültig' using errcode='42501'; end if;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_negotiation_check(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_job_id uuid, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_grant public.marketplace_local_extension_grants; v_job public.marketplace_negotiation_jobs;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  select * into v_job from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id and execution_mode='local' and claim_token=p_claim_token and state in ('claimed','sending') and lease_expires_at>clock_timestamp() for update;
  if not found or v_job.grant_generation<>v_grant.grant_generation or v_job.requested_by<>v_grant.approved_by or not public.marketplace_negotiation_job_valid(v_job) then return jsonb_build_object('active',false); end if;
  update public.marketplace_negotiation_jobs set lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=p_job_id returning * into v_job;
  return jsonb_build_object('active',true,'expiresAt',v_job.lease_expires_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_negotiation_claim(p_workspace_id uuid, p_connection_id uuid, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_grant public.marketplace_local_extension_grants; v_job public.marketplace_negotiation_jobs;
begin
  v_grant:=public.marketplace_local_message_authorized(p_workspace_id,p_connection_id,p_token_hash);
  update public.marketplace_negotiation_jobs set state='outcome_unknown',error_code='timeout',updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='sending' and lease_expires_at<=clock_timestamp();
  update public.marketplace_negotiation_jobs set state='queued',claim_token=null,lease_expires_at=null,updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='claimed' and lease_expires_at<=clock_timestamp();
  update public.marketplace_negotiation_jobs job set state='cancelled',error_code='authorization_expired',updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state in ('queued','claimed')
    and due_at is not null and not public.marketplace_negotiation_job_valid(job);
  if exists(select 1 from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and state in ('claimed','sending') and lease_expires_at>clock_timestamp()) then return null; end if;
  select * into v_job from public.marketplace_negotiation_jobs job where workspace_id=p_workspace_id and connection_id=p_connection_id and execution_mode='local' and state='queued' and due_at<=clock_timestamp()
    and requested_by=v_grant.approved_by and grant_generation=v_grant.grant_generation and public.marketplace_negotiation_job_valid(job) order by due_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.marketplace_negotiation_jobs set state='claimed',claim_token=gen_random_uuid(),lease_expires_at=least(v_grant.expires_at,clock_timestamp()+interval '90 seconds'),updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id,'claimToken',v_job.claim_token,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'externalAccountId',v_job.external_account_id,'expiresAt',v_job.lease_expires_at,'command',v_job.command,
    'sourceOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' and not exists(select 1 from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent') then v_job.source_offer end,
    'confirmedOffer',case when v_job.action='message' and v_job.source_key like 'offer:%' then (select jsonb_build_object('command',confirmed.command,'externalId',confirmed.external_id) from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=v_job.thread_id and confirmed.source_key=v_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent' and confirmed.external_id ~ '^[1-9][0-9]{0,31}$' order by confirmed.finished_at desc limit 1) end);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_local_negotiation_finish(p_workspace_id uuid, p_connection_id uuid, p_token_hash text, p_job_id uuid, p_claim_token uuid, p_outcome text, p_external_id text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_job public.marketplace_negotiation_jobs;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_job from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_job_id and execution_mode='local' and claim_token=p_claim_token for update;
  if not found or not exists(select 1 from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash and grant_generation=v_job.grant_generation and approved_by=v_job.requested_by) then raise exception 'Verhandlungsclaim ungültig' using errcode='42501'; end if;
  return public.marketplace_negotiation_finish_job(v_job,p_outcome,p_external_id,p_error_code);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_authorized(p_workspace_id uuid, p_connection_id uuid, p_user_id uuid, p_mode text, p_account_id text, p_grant_generation bigint, p_authorization_version bigint)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id)
    and public.marketplace_local_extension_user_valid(p_user_id)
    and exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' and status='connected' and execution_mode=p_mode and external_account_id=p_account_id)
    and case p_mode when 'cloud' then public.marketplace_cloud_message_permission_valid(p_workspace_id,p_connection_id,p_user_id,p_authorization_version)
      and public.marketplace_cloud_write_available(p_workspace_id,p_connection_id)
    when 'local' then exists(select 1 from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=p_user_id and external_account_id=p_account_id
      and grant_generation=p_grant_generation and messages_read and messages_send and revoked_at is null and expires_at>clock_timestamp()) else false end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_finish_job(p_job public.marketplace_negotiation_jobs, p_outcome text, p_external_id text, p_error_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_outcome is null or p_outcome not in ('sent','failed','outcome_unknown','skipped')
    or (p_outcome='sent' and (p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$'))
    or (p_outcome<>'sent' and p_external_id is not null) or (p_error_code is not null and p_error_code !~ '^[a-z_]{1,80}$') then raise exception 'Ungültiges Verhandlungsergebnis' using errcode='22023'; end if;
  if p_job.state in ('sent','failed','skipped','outcome_unknown','cancelled') then
    if p_job.state=p_outcome and p_job.external_id is not distinct from p_external_id and p_job.error_code is not distinct from p_error_code then return jsonb_build_object('ok',true); end if;
    if p_job.state='cancelled' and p_outcome in ('failed','skipped') then return jsonb_build_object('ok',true); end if;
    if not (p_job.state='outcome_unknown' and p_outcome='sent') then raise exception 'Ergebnis bereits erfasst' using errcode='23505'; end if;
  elsif p_job.state<>'sending' and not(p_job.state='claimed' and p_outcome in ('failed','skipped','outcome_unknown')) then raise exception 'Versuch nicht gestartet' using errcode='42501'; end if;
  update public.marketplace_negotiation_jobs set state=p_outcome,external_id=p_external_id,error_code=p_error_code,finished_at=clock_timestamp(),lease_expires_at=null,updated_at=clock_timestamp() where id=p_job.id;
  if p_outcome='sent' then
    if p_job.action='accept' then update public.marketplace_negotiation_threads set accepted=true where id=p_job.thread_id;
    elsif p_job.action='counter' and p_job.automated then update public.marketplace_negotiation_threads set completed_stages=least(completed_stages+1,10) where id=p_job.thread_id; end if;
    -- Eine Folge beginnt ihre eigene Wartezeit erst mit dem bestätigten Vorgänger.
    update public.marketplace_negotiation_jobs set due_at=clock_timestamp()+make_interval(secs=>delay_seconds),updated_at=clock_timestamp() where predecessor_id=p_job.id and state='queued';
  else
    with recursive following as (
      select id from public.marketplace_negotiation_jobs where predecessor_id=p_job.id
      union all select job.id from public.marketplace_negotiation_jobs job join following on job.predecessor_id=following.id
    ) update public.marketplace_negotiation_jobs set state='cancelled',error_code='predecessor_not_sent',updated_at=clock_timestamp() where id in(select id from following) and state in ('queued','claimed');
    if p_job.execution_mode='cloud' then perform public.marketplace_record_cloud_write_failure(p_job.workspace_id,p_job.connection_id,p_job.requested_by,p_job.cloud_authorization_version,p_job.external_account_id,p_job.cloud_browser_session_id,p_error_code); end if;
  end if;
  return jsonb_build_object('ok',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_job_valid(p_job public.marketplace_negotiation_jobs)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_settings public.marketplace_negotiation_settings; v_message public.marketplace_account_entries;
begin
  if not public.marketplace_negotiation_authorized(p_job.workspace_id,p_job.connection_id,p_job.requested_by,p_job.execution_mode,p_job.external_account_id,p_job.grant_generation,p_job.cloud_authorization_version) then return false; end if;
  if exists(select 1 from public.marketplace_negotiation_threads where id=p_job.thread_id and purchased) and p_job.event_name<>'purchased' then return false; end if;
  if exists(select 1 from public.marketplace_negotiation_threads where id=p_job.thread_id and accepted)
    and (p_job.action<>'message' or (p_job.automated and p_job.source_key like 'offer:%' and p_job.event_name in ('counter','final'))) then return false; end if;
  if p_job.automated then
    select * into v_settings from public.marketplace_negotiation_settings where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id;
    if not found or v_settings.version<>p_job.setting_version or v_settings.approved_by<>p_job.requested_by
      or v_settings.external_account_id<>p_job.external_account_id or v_settings.execution_mode<>p_job.execution_mode
      or v_settings.grant_generation is distinct from p_job.grant_generation or v_settings.cloud_authorization_version is distinct from p_job.cloud_authorization_version
      or (p_job.event_name='purchased' and not (v_settings.config->>'purchaseEnabled')::boolean)
      or (p_job.event_name<>'purchased' and not v_settings.enabled) then return false; end if;
  end if;
  if p_job.predecessor_id is not null and not exists(select 1 from public.marketplace_negotiation_jobs where id=p_job.predecessor_id and workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and state='sent') then return false; end if;
  if p_job.action<>'message' or (p_job.automated and p_job.source_key like 'offer:%'
    and not exists(select 1 from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=p_job.thread_id and confirmed.source_key=p_job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent')) then
    select * into v_message from public.marketplace_account_entries where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and id=p_job.message_id and kind='message' and parent_id=p_job.conversation_id and body->>'direction'='inbound';
    if not found or not public.marketplace_negotiation_offer_valid(p_job.workspace_id,p_job.connection_id,p_job.conversation_id,v_message.body->'negotiationOffer')
      or v_message.body->'negotiationOffer' is distinct from p_job.source_offer
      or exists(select 1 from public.marketplace_account_entries where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and kind='message' and parent_id=p_job.conversation_id and body->'negotiationOffer' is not null and sort_at>v_message.sort_at) then return false; end if;
  end if;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_minimum_price(p_original bigint, p_config jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_discount jsonb:=p_config; v_band jsonb; v_cents bigint;
begin
  if not public.marketplace_negotiation_config_valid(p_config) or p_original is null or p_original not between 1 and 100000000 then raise exception 'Ungültiger Artikelpreis' using errcode='22023'; end if;
  for v_band in select * from jsonb_array_elements(p_config->'priceBands') loop
    if v_band->'upToCents'='null'::jsonb or p_original<=(v_band->>'upToCents')::bigint then v_discount:=v_band; exit; end if;
  end loop;
  v_cents:=round(case v_discount->>'discountType' when 'amount' then (v_discount->>'discountValue')::numeric*100 else p_original*(v_discount->>'discountValue')::numeric/100 end);
  if v_cents<1 or p_original-v_cents<ceil(p_original::numeric/2) or p_original-v_cents<1 then raise exception 'Nachlass liegt außerhalb der Preisgrenze' using errcode='22023'; end if;
  return p_original-v_cents;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_offer_valid(p_workspace_id uuid, p_connection_id uuid, p_conversation_id uuid, p_offer jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_field text; v_original numeric; v_offered numeric;
begin
  if p_offer is null or jsonb_typeof(p_offer)<>'object' then return false; end if;
  foreach v_field in array array['offerId','transactionId','itemId','buyerId','sellerId'] loop
    if jsonb_typeof(p_offer->v_field) is distinct from 'string' or p_offer->>v_field !~ '^[1-9][0-9]{0,31}$' then return false; end if;
  end loop;
  if p_offer->>'currency' is distinct from 'EUR' or p_offer->>'status' is distinct from 'pending'
    or jsonb_typeof(p_offer->'originalPriceCents') is distinct from 'number' or jsonb_typeof(p_offer->'offeredPriceCents') is distinct from 'number' then return false; end if;
  v_original:=(p_offer->>'originalPriceCents')::numeric; v_offered:=(p_offer->>'offeredPriceCents')::numeric;
  if v_original not between 1 and 100000000 or trunc(v_original)<>v_original or v_offered not between 1 and v_original or trunc(v_offered)<>v_offered then return false; end if;
  return exists(select 1 from public.marketplace_connections connection
    join public.marketplace_account_entries conversation on conversation.workspace_id=connection.workspace_id and conversation.connection_id=connection.id and conversation.id=p_conversation_id and conversation.kind='conversation'
    join public.marketplace_account_entries publication on publication.workspace_id=connection.workspace_id and publication.connection_id=connection.id and publication.kind='publication' and publication.external_id=p_offer->>'itemId'
    where connection.workspace_id=p_workspace_id and connection.id=p_connection_id and connection.external_account_id=p_offer->>'sellerId' and p_offer->>'buyerId'<>connection.external_account_id
      and conversation.external_id ~ '^[1-9][0-9]{0,31}$' and conversation.body->>'partnerId'=p_offer->>'buyerId'
      and publication.body->'isClosed'='false'::jsonb and publication.body->'isReserved' is distinct from 'true'::jsonb
      and (conversation.body->>'itemId' is null or conversation.body->>'itemId'=p_offer->>'itemId')
      and conversation.body->'isBundle' is distinct from 'true'::jsonb
      and jsonb_typeof(publication.body->'price')='number' and (publication.body->>'price')::numeric*100=v_original);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_negotiation_plan(p_settings public.marketplace_negotiation_settings, p_thread public.marketplace_negotiation_threads, p_source_key text, p_offer jsonb, p_action text, p_event text, p_price bigint, p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_commands jsonb:='[]'; v_steps jsonb; v_step jsonb; v_command jsonb; v_previous uuid; v_id uuid; v_index integer:=0; v_text text; v_conversation text; v_title text; v_price text; v_original text; v_missing_price boolean;
begin
  select external_id into v_conversation from public.marketplace_account_entries where workspace_id=p_settings.workspace_id and connection_id=p_settings.connection_id and id=p_thread.conversation_id;
  select coalesce(body->>'title','Artikel') into v_title from public.marketplace_account_entries where workspace_id=p_settings.workspace_id and connection_id=p_settings.connection_id and kind='publication' and external_id=p_thread.item_id;
  v_price:=replace(to_char(coalesce(p_price,(p_offer->>'offeredPriceCents')::bigint)::numeric/100,'FM999999990.00'),'.',',') || ' €';
  v_original:=replace(to_char((p_offer->>'originalPriceCents')::numeric/100,'FM999999990.00'),'.',',') || ' €';
  v_steps:=p_settings.config->'messages'->p_event;
  for v_step in select * from jsonb_array_elements(v_steps) loop
    -- Die gewählte Alternative wird jetzt gespeichert, nie beim Claim neu gewürfelt.
    v_text:=v_step->'templates'->>floor(random()*jsonb_array_length(v_step->'templates'))::integer;
    -- Ein Kaufbeleg ohne Preis darf keinen erfundenen Kaufpreis in einen Text einsetzen.
    v_missing_price:=(v_text like '%{price}%' and v_price is null) or (v_text like '%{original_price}%' and v_original is null);
    if not v_missing_price then v_text:=replace(replace(replace(v_text,'{price}',coalesce(v_price,'')),'{original_price}',coalesce(v_original,'')),'{article}',coalesce(v_title,'Artikel')); end if;
    if char_length(v_text)>2000 then return; end if;
    v_commands:=v_commands || jsonb_build_array(jsonb_build_object('command',jsonb_build_object('kind','message','externalConversationId',v_conversation,'text',v_text),'delaySeconds',v_step->'delaySeconds','missingPrice',v_missing_price));
  end loop;
  if p_action is not null then
    v_command:=jsonb_build_object('command',jsonb_build_object('kind','offer','action',p_action,'externalConversationId',v_conversation,'transactionId',p_offer->>'transactionId','itemId',p_offer->>'itemId','buyerId',p_offer->>'buyerId','offerId',p_offer->>'offerId','originalPriceCents',(p_offer->>'originalPriceCents')::bigint,'offeredPriceCents',(p_offer->>'offeredPriceCents')::bigint,'priceCents',p_price,'currency','EUR'),'delaySeconds',0);
    -- Annahmetexte benötigen stets den bestätigten Annahmeschritt.
    if p_action='accept' or p_settings.config->>'sendOrder'='offer_first' then v_commands:=jsonb_build_array(v_command)||v_commands;
    else v_commands:=v_commands||jsonb_build_array(v_command); end if;
  end if;
  for v_step in select * from jsonb_array_elements(v_commands) loop
    insert into public.marketplace_negotiation_jobs(workspace_id,connection_id,thread_id,conversation_id,source_key,step_index,message_id,automated,event_name,setting_version,requested_by,execution_mode,external_account_id,grant_generation,cloud_authorization_version,action,command,source_offer,predecessor_id,delay_seconds,due_at,state,error_code)
      values(p_settings.workspace_id,p_settings.connection_id,p_thread.id,p_thread.conversation_id,p_source_key,v_index,p_message_id,true,p_event,p_settings.version,p_settings.approved_by,p_settings.execution_mode,p_settings.external_account_id,p_settings.grant_generation,p_settings.cloud_authorization_version,
        case when v_step->'command'->>'kind'='message' then 'message' else v_step->'command'->>'action' end,v_step->'command',case when p_source_key like 'offer:%' then p_offer end,v_previous,(v_step->>'delaySeconds')::integer,
        case when v_previous is null then clock_timestamp()+make_interval(secs=>(p_settings.config->>'delaySeconds')::integer+(v_step->>'delaySeconds')::integer) end,
        case when v_step->'missingPrice'='true'::jsonb then 'skipped' else 'queued' end,case when v_step->'missingPrice'='true'::jsonb then 'missing_event_price' end)
      on conflict(workspace_id,connection_id,source_key,step_index) do nothing returning id into v_id;
    if v_id is null then return; end if;
    if v_step->'missingPrice' is distinct from 'true'::jsonb then v_previous:=v_id; end if;
    v_index:=v_index+1;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_negotiation(p_workspace_id uuid, p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_settings public.marketplace_negotiation_settings; v_events jsonb;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_local_extension_user_valid((select auth.uid()))
    or not exists(select 1 from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted') then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_settings from public.marketplace_negotiation_settings where workspace_id=p_workspace_id and connection_id=p_connection_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',job.id,'action',job.action,'state',case when job.state='sending' and job.lease_expires_at<=clock_timestamp() then 'outcome_unknown' else job.state end,'errorCode',job.error_code,'createdAt',job.created_at) order by job.created_at desc,job.id desc),'[]'::jsonb) into v_events
    from (select * from public.marketplace_negotiation_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id order by created_at desc,id desc limit 50) job;
  return jsonb_build_object('ok',true,'enabled',coalesce(v_settings.enabled,false),'version',coalesce(v_settings.version,0),'config',coalesce(v_settings.config,public.marketplace_negotiation_default_config()),'events',v_events,
    'active',coalesce((v_settings.enabled or (v_settings.config->>'purchaseEnabled')::boolean) and public.marketplace_negotiation_authorized(p_workspace_id,p_connection_id,v_settings.approved_by,v_settings.execution_mode,v_settings.external_account_id,v_settings.grant_generation,v_settings.cloud_authorization_version),false));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_record_negotiation_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_settings public.marketplace_negotiation_settings; v_thread public.marketplace_negotiation_threads; v_offer jsonb:=new.body->'negotiationOffer'; v_event jsonb:=new.body->'negotiationEvent'; v_conversation uuid:=new.parent_id; v_item text; v_event_name text; v_action text; v_price bigint; v_original bigint; v_minimum bigint; v_event_offer jsonb;
begin
  perform pg_advisory_xact_lock(91731,1);
  if tg_op='UPDATE' and old.body->'negotiationOffer' is not null and new.body->'negotiationOffer' is distinct from old.body->'negotiationOffer' then
    update public.marketplace_negotiation_jobs job set state='cancelled',error_code='source_offer_changed',updated_at=clock_timestamp()
      where workspace_id=new.workspace_id and connection_id=new.connection_id and message_id=new.id and state in ('queued','claimed')
        and not (job.action='message' and exists(select 1 from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=job.thread_id and confirmed.source_key=job.source_key and confirmed.action in ('accept','counter') and confirmed.state='sent'));
  end if;
  if v_offer is null and v_event is null then return null; end if;
  if v_conversation is null then select id into v_conversation from public.marketplace_account_entries where workspace_id=new.workspace_id and connection_id=new.connection_id and kind='conversation' and external_id=new.body->>'externalConversationId'; end if;
  if v_conversation is null then return null; end if;
  -- Ein bestätigter Kauf beendet auch eine pausierte oder ausgeschaltete Verhandlung.
  if v_event->>'type' in ('buyer_accepted','purchased') and v_event->'confirmed'='true'::jsonb and jsonb_typeof(v_event->'id')='string' and jsonb_typeof(v_event->'transactionId')='string' and v_event->>'id' ~ '^[1-9][0-9]{0,31}$' and v_event->>'transactionId' ~ '^[1-9][0-9]{0,31}$' then
    select * into v_thread from public.marketplace_negotiation_threads where workspace_id=new.workspace_id and connection_id=new.connection_id and conversation_id=v_conversation and transaction_id=v_event->>'transactionId' for update;
    if not found then
      select body->>'itemId' into v_item from public.marketplace_account_entries where id=v_conversation and workspace_id=new.workspace_id and connection_id=new.connection_id and body->'isBundle' is distinct from 'true'::jsonb;
      if v_item is null or v_item !~ '^[1-9][0-9]{0,31}$' then return null; end if;
      if not exists(select 1 from public.marketplace_account_entries where workspace_id=new.workspace_id and connection_id=new.connection_id and kind='publication' and external_id=v_item) then return null; end if;
      insert into public.marketplace_negotiation_threads(workspace_id,connection_id,conversation_id,item_id,transaction_id) values(new.workspace_id,new.connection_id,v_conversation,v_item,v_event->>'transactionId') on conflict do nothing;
      select * into v_thread from public.marketplace_negotiation_threads where workspace_id=new.workspace_id and connection_id=new.connection_id and conversation_id=v_conversation and transaction_id=v_event->>'transactionId' for update;
      if not found then return null; end if;
    end if;
    if v_event->>'type'='purchased' then
      update public.marketplace_negotiation_threads set purchased=true where id=v_thread.id;
      update public.marketplace_negotiation_jobs set state='cancelled',error_code='purchased',updated_at=clock_timestamp() where thread_id=v_thread.id and event_name<>'purchased' and state in ('queued','claimed');
    else
      update public.marketplace_negotiation_threads set accepted=true where id=v_thread.id;
      update public.marketplace_negotiation_jobs job set state='cancelled',error_code='buyer_accepted',updated_at=clock_timestamp()
        where thread_id=v_thread.id and state in ('queued','claimed')
          and (action<>'message' or (automated and source_key like 'offer:%' and (event_name in ('counter','final')
            or (event_name='accepted' and not exists(select 1 from public.marketplace_negotiation_jobs confirmed where confirmed.thread_id=job.thread_id and confirmed.source_key=job.source_key and confirmed.action='accept' and confirmed.state='sent')))));
    end if;
  end if;
  select * into v_settings from public.marketplace_negotiation_settings where workspace_id=new.workspace_id and connection_id=new.connection_id for update;
  if not found or new.sort_at<v_settings.activated_at or not public.marketplace_negotiation_authorized(new.workspace_id,new.connection_id,v_settings.approved_by,v_settings.execution_mode,v_settings.external_account_id,v_settings.grant_generation,v_settings.cloud_authorization_version) then return null; end if;
  if v_event is not null then
    if v_thread.id is null or v_event->'confirmed' is distinct from 'true'::jsonb or v_event->>'type' not in ('buyer_accepted','purchased') then return null; end if;
    if (v_event->>'type'='purchased' and (v_settings.config->>'purchaseEnabled')::boolean) or (v_event->>'type'='buyer_accepted' and v_settings.enabled and not v_thread.purchased) then
      if jsonb_typeof(v_event->'originalPriceCents')='number' and jsonb_typeof(v_event->'priceCents')='number' and v_event->>'currency'='EUR'
        and (v_event->>'originalPriceCents')::numeric between 1 and 100000000 and trunc((v_event->>'originalPriceCents')::numeric)=(v_event->>'originalPriceCents')::numeric
        and (v_event->>'priceCents')::numeric between 1 and (v_event->>'originalPriceCents')::numeric and trunc((v_event->>'priceCents')::numeric)=(v_event->>'priceCents')::numeric then
        v_event_offer:=jsonb_build_object('originalPriceCents',v_event->'originalPriceCents','offeredPriceCents',v_event->'priceCents');
      elsif not (v_event ?| array['originalPriceCents','priceCents','currency']) then
        select jsonb_build_object('originalPriceCents',command->'originalPriceCents','offeredPriceCents',case when action='accept' then command->'offeredPriceCents' else command->'priceCents' end) into v_event_offer
          from public.marketplace_negotiation_jobs where thread_id=v_thread.id and state='sent' and action in ('accept','counter') order by finished_at desc,id desc limit 1;
      end if;
      perform public.marketplace_negotiation_plan(v_settings,v_thread,'event:'||(v_event->>'type')||':'||(v_event->>'transactionId'),v_event_offer,null,v_event->>'type',null,new.id);
    end if;
    return null;
  end if;
  if not v_settings.enabled or new.kind<>'message' or new.body->>'direction' is distinct from 'inbound' or not public.marketplace_negotiation_offer_valid(new.workspace_id,new.connection_id,v_conversation,v_offer) then return null; end if;
  insert into public.marketplace_negotiation_threads(workspace_id,connection_id,conversation_id,item_id,transaction_id) values(new.workspace_id,new.connection_id,v_conversation,v_offer->>'itemId',v_offer->>'transactionId') on conflict do nothing;
  select * into v_thread from public.marketplace_negotiation_threads where workspace_id=new.workspace_id and connection_id=new.connection_id and conversation_id=v_conversation and item_id=v_offer->>'itemId' for update;
  if v_thread.purchased or v_thread.transaction_id<>v_offer->>'transactionId' or v_thread.last_offer_id=v_offer->>'offerId' or new.sort_at<=v_thread.last_offer_at
    or exists(select 1 from public.marketplace_negotiation_jobs where thread_id=v_thread.id and source_key='offer:'||(v_offer->>'offerId')) then return null; end if;
  -- Neue Eingänge überspringen keine noch unbestätigte Stufe und lösen keine unbekannten Versuche erneut aus.
  if exists(select 1 from public.marketplace_negotiation_jobs where thread_id=v_thread.id and state in ('sending','outcome_unknown')) then return null; end if;
  update public.marketplace_negotiation_jobs set state='cancelled',error_code='new_offer',updated_at=clock_timestamp() where thread_id=v_thread.id and state in ('queued','claimed');
  update public.marketplace_negotiation_threads set last_offer_at=new.sort_at,last_offer_id=v_offer->>'offerId' where id=v_thread.id;
  v_original:=(v_offer->>'originalPriceCents')::bigint;
  begin v_minimum:=public.marketplace_negotiation_minimum_price(v_original,v_settings.config); exception when sqlstate '22023' then return null; end;
  if v_thread.accepted then v_event_name:='after_acceptance';
  elsif (v_offer->>'offeredPriceCents')::bigint>=v_minimum then v_action:='accept'; v_event_name:='accepted';
  elsif v_thread.completed_stages>=jsonb_array_length(v_settings.config->'stages') then v_event_name:='after_final';
  else
    v_action:='counter'; v_price:=v_original-round((v_original-v_minimum)*(v_settings.config->'stages'->>v_thread.completed_stages)::numeric/100);
    v_event_name:=case when v_thread.completed_stages+1=jsonb_array_length(v_settings.config->'stages') then 'final' else 'counter' end;
  end if;
  perform public.marketplace_negotiation_plan(v_settings,v_thread,'offer:'||(v_offer->>'offerId'),v_offer,v_action,v_event_name,v_price,new.id);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_save_negotiation(p_workspace_id uuid, p_connection_id uuid, p_expected_version bigint, p_enabled boolean, p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.marketplace_connections; v_settings public.marketplace_negotiation_settings; v_grant public.marketplace_local_extension_grants; v_permission public.marketplace_cloud_message_permissions;
begin
  perform pg_advisory_xact_lock(91731,1);
  if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<0 or p_enabled is null or not public.marketplace_negotiation_config_valid(p_config) then raise exception 'Ungültige Verhandlungseinstellung' using errcode='22023'; end if;
  select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' for update;
  if not found then raise exception 'Kontozugriff verweigert' using errcode='42501'; end if;
  select * into v_settings from public.marketplace_negotiation_settings where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if coalesce(v_settings.version,0)<>p_expected_version then raise exception 'Einstellung inzwischen geändert' using errcode='40001'; end if;
  select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  select * into v_permission from public.marketplace_cloud_message_permissions where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
  if (p_enabled or (p_config->>'purchaseEnabled')::boolean) and not public.marketplace_negotiation_authorized(p_workspace_id,p_connection_id,(select auth.uid()),v_connection.execution_mode,v_connection.external_account_id,v_grant.grant_generation,v_permission.authorization_version) then raise exception 'Nachrichtenfreigabe ungültig' using errcode='42501'; end if;
  insert into public.marketplace_negotiation_settings(workspace_id,connection_id,enabled,config,approved_by,execution_mode,external_account_id,grant_generation,cloud_authorization_version)
    values(p_workspace_id,p_connection_id,p_enabled,p_config,(select auth.uid()),v_connection.execution_mode,v_connection.external_account_id,case when v_connection.execution_mode='local' then v_grant.grant_generation end,case when v_connection.execution_mode='cloud' then v_permission.authorization_version end)
    on conflict(workspace_id,connection_id) do update set enabled=excluded.enabled,config=excluded.config,version=public.marketplace_negotiation_settings.version+1,activated_at=clock_timestamp(),approved_by=excluded.approved_by,execution_mode=excluded.execution_mode,external_account_id=excluded.external_account_id,grant_generation=excluded.grant_generation,cloud_authorization_version=excluded.cloud_authorization_version,updated_at=clock_timestamp();
  update public.marketplace_negotiation_jobs set state='cancelled',error_code='settings_changed',updated_at=clock_timestamp() where workspace_id=p_workspace_id and connection_id=p_connection_id and automated and state in ('queued','claimed');
  return public.marketplace_read_negotiation(p_workspace_id,p_connection_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_read_page(p_workspace_id uuid, p_connection_id uuid, p_kind text, p_cursor text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cursor public.marketplace_account_entries; v_items jsonb; v_total bigint; v_next text;
begin
  if not public.marketplace_can_manage(p_workspace_id) or not exists (select 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id and c.id = p_connection_id and c.marketplace = 'vinted') then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('publication', 'conversation', 'message', 'sale', 'activity') or ((p_kind = 'message') <> (p_parent_id is not null)) then raise exception 'Ungültige Seitenart' using errcode = '22023'; end if;
  if p_kind = 'message' and not exists (select 1 from public.marketplace_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.id = p_parent_id and e.kind = 'conversation') then raise exception 'Gespräch nicht verfügbar' using errcode = '42501'; end if;
  if p_cursor is not null then
    select * into v_cursor from public.marketplace_account_entries e where e.id::text = p_cursor and e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
    if not found then raise exception 'Ungültiger Seitencursor' using errcode = '22023'; end if;
  end if;
  select count(*) into v_total from public.marketplace_account_entries e where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id;
  with candidates as (
    select e.*, row_number() over (order by e.sort_at desc, e.id desc) as position,
      case when p_kind='conversation' then public.marketplace_conversation_read_version(e.workspace_id,e.connection_id,e.id) end as current_read_version
    from public.marketplace_account_entries e
    where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id and e.kind = p_kind and e.parent_id is not distinct from p_parent_id
      and (p_cursor is null or (e.sort_at, e.id) < (v_cursor.sort_at, v_cursor.id))
    order by e.sort_at desc, e.id desc limit 51
  )
  select coalesce(jsonb_agg((e.body || jsonb_build_object('id', e.id, 'workspaceId', e.workspace_id, 'connectionId', e.connection_id)
    || case when p_kind='conversation' then jsonb_build_object('readVersion',e.current_read_version,
      'unread',case when e.body->>'unread'='true' and e.conversation_read_version=e.current_read_version then 'false'::jsonb else e.body->'unread' end) else '{}'::jsonb end
    || case when p_kind = 'message' then jsonb_build_object('conversationId', e.parent_id, 'externalId', e.external_id,
      -- Nur bestätigte Versandbelege zu diesem Konto und Gespräch kennzeichnen; Anbietertexte sind keine Herkunftsbelege.
      'isAutomated', coalesce(e.body->>'direction' = 'outbound', false) and (exists (
        select 1 from public.marketplace_favorite_message_events f
        join public.marketplace_account_entries conversation on conversation.id = e.parent_id
          and conversation.workspace_id = e.workspace_id and conversation.connection_id = e.connection_id and conversation.kind = 'conversation'
        where f.workspace_id = e.workspace_id and f.connection_id = e.connection_id and f.state = 'sent'
          and f.external_message_id = e.external_id
          and (f.external_conversation_id is null or f.external_conversation_id = conversation.external_id)
      ) or exists (
        select 1 from public.marketplace_negotiation_jobs job
        join public.marketplace_connections connection on connection.workspace_id=job.workspace_id and connection.id=job.connection_id
          and connection.external_account_id=job.external_account_id
        join public.marketplace_account_entries conversation on conversation.id=e.parent_id
          and conversation.workspace_id=e.workspace_id and conversation.connection_id=e.connection_id and conversation.kind='conversation'
        where job.workspace_id=e.workspace_id and job.connection_id=e.connection_id and job.conversation_id=e.parent_id
          and job.automated and job.state='sent' and job.action='message' and job.command->>'kind'='message'
          and job.external_id=e.external_id and job.command->>'externalConversationId'=conversation.external_id
      ))) else '{}'::jsonb end) order by e.position) filter (where e.position <= 50), '[]'::jsonb),
    case when count(*) > 50 then max(e.id::text) filter (where e.position = 50) else null end
    into v_items, v_next from candidates e;
  return jsonb_build_object('items', v_items, 'total', v_total, 'nextCursor', v_next);
end;
$function$
;

grant delete on table "public"."marketplace_negotiation_jobs" to "postgres";

grant insert on table "public"."marketplace_negotiation_jobs" to "postgres";

grant references on table "public"."marketplace_negotiation_jobs" to "postgres";

grant select on table "public"."marketplace_negotiation_jobs" to "postgres";

grant trigger on table "public"."marketplace_negotiation_jobs" to "postgres";

grant truncate on table "public"."marketplace_negotiation_jobs" to "postgres";

grant update on table "public"."marketplace_negotiation_jobs" to "postgres";

grant delete on table "public"."marketplace_negotiation_jobs" to "service_role";

grant insert on table "public"."marketplace_negotiation_jobs" to "service_role";

grant references on table "public"."marketplace_negotiation_jobs" to "service_role";

grant select on table "public"."marketplace_negotiation_jobs" to "service_role";

grant trigger on table "public"."marketplace_negotiation_jobs" to "service_role";

grant truncate on table "public"."marketplace_negotiation_jobs" to "service_role";

grant update on table "public"."marketplace_negotiation_jobs" to "service_role";

grant delete on table "public"."marketplace_negotiation_settings" to "postgres";

grant insert on table "public"."marketplace_negotiation_settings" to "postgres";

grant references on table "public"."marketplace_negotiation_settings" to "postgres";

grant select on table "public"."marketplace_negotiation_settings" to "postgres";

grant trigger on table "public"."marketplace_negotiation_settings" to "postgres";

grant truncate on table "public"."marketplace_negotiation_settings" to "postgres";

grant update on table "public"."marketplace_negotiation_settings" to "postgres";

grant delete on table "public"."marketplace_negotiation_settings" to "service_role";

grant insert on table "public"."marketplace_negotiation_settings" to "service_role";

grant references on table "public"."marketplace_negotiation_settings" to "service_role";

grant select on table "public"."marketplace_negotiation_settings" to "service_role";

grant trigger on table "public"."marketplace_negotiation_settings" to "service_role";

grant truncate on table "public"."marketplace_negotiation_settings" to "service_role";

grant update on table "public"."marketplace_negotiation_settings" to "service_role";

grant delete on table "public"."marketplace_negotiation_threads" to "postgres";

grant insert on table "public"."marketplace_negotiation_threads" to "postgres";

grant references on table "public"."marketplace_negotiation_threads" to "postgres";

grant select on table "public"."marketplace_negotiation_threads" to "postgres";

grant trigger on table "public"."marketplace_negotiation_threads" to "postgres";

grant truncate on table "public"."marketplace_negotiation_threads" to "postgres";

grant update on table "public"."marketplace_negotiation_threads" to "postgres";

grant delete on table "public"."marketplace_negotiation_threads" to "service_role";

grant insert on table "public"."marketplace_negotiation_threads" to "service_role";

grant references on table "public"."marketplace_negotiation_threads" to "service_role";

grant select on table "public"."marketplace_negotiation_threads" to "service_role";

grant trigger on table "public"."marketplace_negotiation_threads" to "service_role";

grant truncate on table "public"."marketplace_negotiation_threads" to "service_role";

grant update on table "public"."marketplace_negotiation_threads" to "service_role";

create policy "Worker deletes negotiation jobs"
  on "public"."marketplace_negotiation_jobs"
  as permissive
  for delete
  to service_role
using (true);

create policy "Worker inserts negotiation jobs"
  on "public"."marketplace_negotiation_jobs"
  as permissive
  for insert
  to service_role
with check (true);

create policy "Worker reads negotiation jobs"
  on "public"."marketplace_negotiation_jobs"
  as permissive
  for select
  to service_role
using (true);

create policy "Worker updates negotiation jobs"
  on "public"."marketplace_negotiation_jobs"
  as permissive
  for update
  to service_role
using (true)
with check (true);

create policy "Worker deletes negotiation settings"
  on "public"."marketplace_negotiation_settings"
  as permissive
  for delete
  to service_role
using (true);

create policy "Worker inserts negotiation settings"
  on "public"."marketplace_negotiation_settings"
  as permissive
  for insert
  to service_role
with check (true);

create policy "Worker reads negotiation settings"
  on "public"."marketplace_negotiation_settings"
  as permissive
  for select
  to service_role
using (true);

create policy "Worker updates negotiation settings"
  on "public"."marketplace_negotiation_settings"
  as permissive
  for update
  to service_role
using (true)
with check (true);

create policy "Worker deletes negotiation threads"
  on "public"."marketplace_negotiation_threads"
  as permissive
  for delete
  to service_role
using (true);

create policy "Worker inserts negotiation threads"
  on "public"."marketplace_negotiation_threads"
  as permissive
  for insert
  to service_role
with check (true);

create policy "Worker reads negotiation threads"
  on "public"."marketplace_negotiation_threads"
  as permissive
  for select
  to service_role
using (true);

create policy "Worker updates negotiation threads"
  on "public"."marketplace_negotiation_threads"
  as permissive
  for update
  to service_role
using (true)
with check (true);

CREATE TRIGGER marketplace_record_negotiation_entry AFTER INSERT OR UPDATE OF body ON public.marketplace_account_entries FOR EACH ROW EXECUTE FUNCTION public.marketplace_record_negotiation_entry();

CREATE TRIGGER marketplace_cancel_invalid_negotiation_cloud AFTER DELETE OR UPDATE ON public.marketplace_cloud_message_permissions FOR EACH ROW EXECUTE FUNCTION public.marketplace_cancel_invalid_negotiation();

CREATE TRIGGER marketplace_cancel_invalid_negotiation_identity AFTER UPDATE OF execution_mode, external_account_id, status ON public.marketplace_connections FOR EACH ROW EXECUTE FUNCTION public.marketplace_cancel_invalid_negotiation();

CREATE TRIGGER marketplace_cancel_invalid_negotiation_local AFTER DELETE OR UPDATE ON public.marketplace_local_extension_grants FOR EACH ROW EXECUTE FUNCTION public.marketplace_cancel_invalid_negotiation();

CREATE TRIGGER marketplace_cancel_unknown_negotiation_followups AFTER UPDATE OF state ON public.marketplace_negotiation_jobs FOR EACH ROW EXECUTE FUNCTION public.marketplace_cancel_unknown_negotiation_followups();

-- Explizite deklarative Rechte und Kommentare; der Diff erfasst Default-ACLs nicht vollständig.
comment on table public.marketplace_negotiation_settings is 'Private Verhandlungsregeln; Aktivierung erteilt keine Nachrichtenfreigabe.';

comment on table public.marketplace_negotiation_threads is 'Dauerhafter Fortschritt; Annahme einer Preisvereinbarung ist kein Kauf.';

comment on table public.marketplace_negotiation_jobs is 'Eigene Angebots- und Folgetextaufträge; Vorlagenauswahl und Ergebnis bleiben dauerhaft erhalten.';

revoke all on public.marketplace_negotiation_settings,public.marketplace_negotiation_threads,public.marketplace_negotiation_jobs from public,anon,authenticated;

grant all on public.marketplace_negotiation_settings,public.marketplace_negotiation_threads,public.marketplace_negotiation_jobs to service_role;

revoke all on function public.marketplace_cancel_unknown_negotiation_followups() from public,anon,authenticated;

grant execute on function public.marketplace_cancel_unknown_negotiation_followups() to service_role;

-- Keine neuen Funktionen sind implizit öffentlich; ausschließlich die drei UI-RPCs sind authentifiziert erreichbar.
revoke all on function public.marketplace_negotiation_discount_valid(jsonb),public.marketplace_negotiation_config_valid(jsonb),public.marketplace_negotiation_default_config(),public.marketplace_negotiation_authorized(uuid,uuid,uuid,text,text,bigint,bigint),public.marketplace_negotiation_offer_valid(uuid,uuid,uuid,jsonb),public.marketplace_negotiation_minimum_price(bigint,jsonb),public.marketplace_negotiation_plan(public.marketplace_negotiation_settings,public.marketplace_negotiation_threads,text,jsonb,text,text,bigint,uuid),public.marketplace_record_negotiation_entry(),public.marketplace_negotiation_job_valid(public.marketplace_negotiation_jobs),public.marketplace_negotiation_finish_job(public.marketplace_negotiation_jobs,text,text,text) from public,anon,authenticated;

grant execute on function public.marketplace_negotiation_discount_valid(jsonb),public.marketplace_negotiation_config_valid(jsonb),public.marketplace_negotiation_default_config(),public.marketplace_negotiation_authorized(uuid,uuid,uuid,text,text,bigint,bigint),public.marketplace_negotiation_offer_valid(uuid,uuid,uuid,jsonb),public.marketplace_negotiation_minimum_price(bigint,jsonb),public.marketplace_negotiation_plan(public.marketplace_negotiation_settings,public.marketplace_negotiation_threads,text,jsonb,text,text,bigint,uuid),public.marketplace_record_negotiation_entry(),public.marketplace_negotiation_job_valid(public.marketplace_negotiation_jobs),public.marketplace_negotiation_finish_job(public.marketplace_negotiation_jobs,text,text,text) to service_role;

revoke all on function public.marketplace_read_negotiation(uuid,uuid),public.marketplace_save_negotiation(uuid,uuid,bigint,boolean,jsonb),public.marketplace_enqueue_negotiation(uuid,uuid,uuid,uuid,uuid,text,bigint) from public,anon,authenticated;

grant execute on function public.marketplace_read_negotiation(uuid,uuid),public.marketplace_save_negotiation(uuid,uuid,bigint,boolean,jsonb),public.marketplace_enqueue_negotiation(uuid,uuid,uuid,uuid,uuid,text,bigint) to authenticated;

revoke all on function public.marketplace_local_negotiation_claim(uuid,uuid,text),public.marketplace_local_negotiation_check(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_begin(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_finish(uuid,uuid,text,uuid,uuid,text,text,text),public.marketplace_cloud_negotiation_claim(uuid,bigint,uuid),public.marketplace_cloud_negotiation_check(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_begin(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) from public,anon,authenticated;

grant execute on function public.marketplace_local_negotiation_claim(uuid,uuid,text),public.marketplace_local_negotiation_check(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_begin(uuid,uuid,text,uuid,uuid),public.marketplace_local_negotiation_finish(uuid,uuid,text,uuid,uuid,text,text,text),public.marketplace_cloud_negotiation_claim(uuid,bigint,uuid),public.marketplace_cloud_negotiation_check(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_begin(uuid,uuid,uuid,uuid,uuid,bigint),public.marketplace_cloud_negotiation_finish(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) to service_role;

revoke all on function public.marketplace_cancel_invalid_negotiation() from public,anon,authenticated;

grant execute on function public.marketplace_cancel_invalid_negotiation() to service_role;
