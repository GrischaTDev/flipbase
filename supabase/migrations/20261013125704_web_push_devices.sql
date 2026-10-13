-- Authentifizierte Push-Geraete, Praeferenzen und terminale Generationen.
-- Tabellen: web_push_devices, web_push_preferences, web_push_generations.

  create table "public"."web_push_devices" (
    "id" uuid not null,
    "user_id" uuid not null,
    "session_id" uuid not null,
    "installation_id" uuid not null,
    "endpoint_fingerprint" text not null,
    "endpoint" text not null,
    "p256dh" text not null,
    "auth" text not null,
    "vapid_key_id" text not null,
    "active" boolean not null default true,
    "last_confirmed_at" timestamp with time zone not null default clock_timestamp(),
    "test_window_at" timestamp with time zone,
    "test_count" integer not null default 0
      );


alter table "public"."web_push_devices" enable row level security;


  create table "public"."web_push_generations" (
    "id" uuid not null,
    "token_hash" text not null,
    "user_id" uuid,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."web_push_generations" enable row level security;


  create table "public"."web_push_preferences" (
    "id" bigint generated always as identity not null,
    "device_id" uuid not null,
    "workspace_id" uuid not null,
    "categories" text[] not null default '{}'::text[]
      );


alter table "public"."web_push_preferences" enable row level security;

CREATE INDEX web_push_devices_endpoint_fingerprint_idx ON public.web_push_devices USING btree (endpoint_fingerprint);

CREATE INDEX web_push_devices_installation_id_idx ON public.web_push_devices USING btree (installation_id);

CREATE UNIQUE INDEX web_push_devices_pkey ON public.web_push_devices USING btree (id);

CREATE INDEX web_push_devices_session_id_idx ON public.web_push_devices USING btree (session_id);

CREATE INDEX web_push_devices_user_id_idx ON public.web_push_devices USING btree (user_id);

CREATE UNIQUE INDEX web_push_generations_pkey ON public.web_push_generations USING btree (id);

CREATE INDEX web_push_generations_user_id_idx ON public.web_push_generations USING btree (user_id);

CREATE UNIQUE INDEX web_push_preferences_device_id_workspace_id_key ON public.web_push_preferences USING btree (device_id, workspace_id);

CREATE UNIQUE INDEX web_push_preferences_pkey ON public.web_push_preferences USING btree (id);

CREATE INDEX web_push_preferences_workspace_id_idx ON public.web_push_preferences USING btree (workspace_id);

alter table "public"."web_push_devices" add constraint "web_push_devices_pkey" PRIMARY KEY using index "web_push_devices_pkey";

alter table "public"."web_push_generations" add constraint "web_push_generations_pkey" PRIMARY KEY using index "web_push_generations_pkey";

alter table "public"."web_push_preferences" add constraint "web_push_preferences_pkey" PRIMARY KEY using index "web_push_preferences_pkey";

alter table "public"."web_push_devices" add constraint "web_push_devices_id_fkey" FOREIGN KEY (id) REFERENCES public.web_push_generations(id) not valid;

alter table "public"."web_push_devices" validate constraint "web_push_devices_id_fkey";

alter table "public"."web_push_devices" add constraint "web_push_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."web_push_devices" validate constraint "web_push_devices_user_id_fkey";

alter table "public"."web_push_generations" add constraint "web_push_generations_token_hash_check" CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text)) not valid;

alter table "public"."web_push_generations" validate constraint "web_push_generations_token_hash_check";

alter table "public"."web_push_generations" add constraint "web_push_generations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."web_push_generations" validate constraint "web_push_generations_user_id_fkey";

alter table "public"."web_push_preferences" add constraint "web_push_preferences_categories_check" CHECK ((categories <@ ARRAY['message'::text, 'order'::text, 'connection'::text])) not valid;

alter table "public"."web_push_preferences" validate constraint "web_push_preferences_categories_check";

alter table "public"."web_push_preferences" add constraint "web_push_preferences_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.web_push_devices(id) ON DELETE CASCADE not valid;

alter table "public"."web_push_preferences" validate constraint "web_push_preferences_device_id_fkey";

alter table "public"."web_push_preferences" add constraint "web_push_preferences_device_id_workspace_id_key" UNIQUE using index "web_push_preferences_device_id_workspace_id_key";

alter table "public"."web_push_preferences" add constraint "web_push_preferences_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."web_push_preferences" validate constraint "web_push_preferences_workspace_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.web_push_allowed_categories(p_user_id uuid, p_workspace_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when public.user_can_access_workspace(p_workspace_id,p_user_id)
 and exists(select 1 from public.workspaces where id=p_workspace_id and archived_at is null)
 then case when exists(select 1 from public.platform_operators where user_id=p_user_id)
 and exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin'))
 then array['message','order','connection']::text[] else array['order','connection']::text[] end else '{}'::text[] end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_hash_equal(p_left text, p_right text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_difference integer := 0; v_index integer;
begin
 for v_index in 1..64 loop
  v_difference := v_difference | (ascii(substr(rpad(coalesce(p_left,''),64,'0'),v_index,1)) # ascii(substr(rpad(coalesce(p_right,''),64,'0'),v_index,1)));
 end loop;
 return v_difference=0 and coalesce(length(p_left),0)=64 and coalesce(length(p_right),0)=64;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_revoke_binding(p_generation_id uuid, p_token_hash text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_generation public.web_push_generations%rowtype;
begin
 if p_generation_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(470,0);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_generation_id::text,470));
 select * into v_generation from public.web_push_generations where id=p_generation_id for update;
 if not found then
  insert into public.web_push_generations(id,token_hash,revoked_at) values(p_generation_id,p_token_hash,now());
 elsif public.web_push_hash_equal(v_generation.token_hash,p_token_hash) then
  update public.web_push_generations set revoked_at=coalesce(revoked_at,now()) where id=p_generation_id;
  update public.web_push_devices set active=false where id=p_generation_id;
 end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_settings(p_user_id uuid, p_session_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_action text := p_input->>'action'; v_id uuid; v_workspace uuid;
 v_generation public.web_push_generations%rowtype; v_device public.web_push_devices%rowtype;
 v_categories text[]; v_allowed text[]; v_result jsonb; v_event uuid;
begin
 if not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now())) then raise exception 'Push session denied' using errcode='42501'; end if;
 if v_action in ('register','revoke','preferences','test') then perform pg_catalog.pg_advisory_xact_lock(470,0); end if;
 if v_action='register' then
  v_id:=(p_input->>'generationId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,470));
  select * into v_generation from public.web_push_generations where id=v_id for update;
  if found then
   if not public.web_push_hash_equal(v_generation.token_hash,p_input->>'tokenHash') or (v_generation.user_id is not null and v_generation.user_id<>p_user_id) then raise exception 'Push binding denied' using errcode='42501'; end if;
   if v_generation.revoked_at is not null then return jsonb_build_object('deviceId',v_id,'active',false); end if;
   select * into v_device from public.web_push_devices where id=v_id;
   if v_device.user_id is distinct from p_user_id or v_device.session_id is distinct from p_session_id or v_device.installation_id is distinct from (p_input->>'installationId')::uuid or v_device.endpoint is distinct from p_input#>>'{subscription,endpoint}' or v_device.p256dh is distinct from p_input#>>'{subscription,p256dh}' or v_device.auth is distinct from p_input#>>'{subscription,auth}' or v_device.vapid_key_id is distinct from p_input->>'keyId' then raise exception 'Push binding denied' using errcode='42501'; end if;
   return jsonb_build_object('deviceId',v_id,'active',v_device.active);
  end if;
  insert into public.web_push_generations(id,token_hash,user_id) values(v_id,p_input->>'tokenHash',p_user_id);
  -- Nutzerwechsel oder neues Subscription ersetzt vorherige Generationen derselben Installation/Endpunktbindung.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_input->>'installationId',471));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_input#>>'{subscription,endpoint}',472));
  update public.web_push_generations set revoked_at=coalesce(revoked_at,now()) where id in (select id from public.web_push_devices where installation_id=(p_input->>'installationId')::uuid or endpoint=p_input#>>'{subscription,endpoint}');
  update public.web_push_devices set active=false where installation_id=(p_input->>'installationId')::uuid or endpoint=p_input#>>'{subscription,endpoint}';
  insert into public.web_push_devices(id,user_id,session_id,installation_id,endpoint_fingerprint,endpoint,p256dh,auth,vapid_key_id)
  values(v_id,p_user_id,p_session_id,(p_input->>'installationId')::uuid,encode(extensions.digest(p_input#>>'{subscription,endpoint}','sha256'),'hex'),p_input#>>'{subscription,endpoint}',p_input#>>'{subscription,p256dh}',p_input#>>'{subscription,auth}',p_input->>'keyId');
  return jsonb_build_object('deviceId',v_id,'active',true);
 elsif v_action='settings' then
  if p_input ? 'workspaceId' then v_workspace:=(p_input->>'workspaceId')::uuid; end if;
  select * into v_device from public.web_push_devices where user_id=p_user_id and installation_id=(p_input->>'installationId')::uuid order by last_confirmed_at desc,id desc limit 1;
  return jsonb_build_object('binding',case when v_device.id is null then null else jsonb_build_object('deviceId',v_device.id,'active',v_device.active and v_device.session_id=p_session_id,'keyId',v_device.vapid_key_id) end,'allowedCategories',case when v_workspace is null then '{}'::text[] else public.web_push_allowed_categories(p_user_id,v_workspace) end,'preferences',coalesce((select jsonb_agg(jsonb_build_object('workspaceId',workspace_id,'categories',categories)) from public.web_push_preferences where device_id=v_device.id and public.user_can_access_workspace(workspace_id,p_user_id)),'[]'::jsonb));
 elsif v_action in ('preferences','revoke','test') then
  v_id:=(p_input->>'deviceId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,470));
  select * into v_device from public.web_push_devices where id=v_id and user_id=p_user_id for update;
  if not found then raise exception 'Push device denied' using errcode='42501'; end if;
  if v_action='revoke' then
   -- Authentifizierter Widerruf darf auch eigene Bindungen einer vorherigen Sitzung deaktivieren.
   perform public.web_push_revoke_binding(v_id,(select token_hash from public.web_push_generations where id=v_id));
   return jsonb_build_object('deviceId',v_id,'active',false);
  end if;
  if not v_device.active or v_device.session_id<>p_session_id then raise exception 'Push device denied' using errcode='42501'; end if;
  v_workspace:=(p_input->>'workspaceId')::uuid;
  v_allowed:=public.web_push_allowed_categories(p_user_id,v_workspace);
  if cardinality(v_allowed)=0 then raise exception 'Push workspace denied' using errcode='42501'; end if;
  if v_action='preferences' then
   select coalesce(array_agg(category),'{}'::text[]) into v_categories from jsonb_array_elements_text(p_input->'categories') as category;
   if not v_categories <@ v_allowed then raise exception 'Push category denied' using errcode='42501'; end if;
   insert into public.web_push_preferences(device_id,workspace_id,categories) values(v_id,v_workspace,v_categories) on conflict(device_id,workspace_id) do update set categories=excluded.categories;
   return jsonb_build_object('deviceId',v_id,'workspaceId',v_workspace,'categories',v_categories);
  end if;
  if v_device.test_window_at is null or v_device.test_window_at<=now()-interval '1 minute' then v_device.test_count:=0; v_device.test_window_at:=now(); end if;
  if v_device.test_count>=3 then raise exception 'Push test rate limit' using errcode='P0001'; end if;
  -- Task7 implementiert den realen transaktionalen Outboxauftrag; fehlende Function bleibt ein Fehler.
  execute 'select public.web_push_enqueue_test($1,$2)' into v_event using v_id,v_workspace;
  update public.web_push_devices set test_count=v_device.test_count+1,test_window_at=v_device.test_window_at where id=v_id;
  return jsonb_build_object('eventId',v_event,'status','queued');
 end if;
 raise exception 'Push action denied' using errcode='22023';
end;
$function$
;

grant delete on table "public"."web_push_devices" to "service_role";

grant insert on table "public"."web_push_devices" to "service_role";

grant references on table "public"."web_push_devices" to "service_role";

grant select on table "public"."web_push_devices" to "service_role";

grant trigger on table "public"."web_push_devices" to "service_role";

grant truncate on table "public"."web_push_devices" to "service_role";

grant update on table "public"."web_push_devices" to "service_role";

grant delete on table "public"."web_push_generations" to "service_role";

grant insert on table "public"."web_push_generations" to "service_role";

grant references on table "public"."web_push_generations" to "service_role";

grant select on table "public"."web_push_generations" to "service_role";

grant trigger on table "public"."web_push_generations" to "service_role";

grant truncate on table "public"."web_push_generations" to "service_role";

grant update on table "public"."web_push_generations" to "service_role";

grant delete on table "public"."web_push_preferences" to "service_role";

grant insert on table "public"."web_push_preferences" to "service_role";

grant references on table "public"."web_push_preferences" to "service_role";

grant select on table "public"."web_push_preferences" to "service_role";

grant trigger on table "public"."web_push_preferences" to "service_role";

grant truncate on table "public"."web_push_preferences" to "service_role";

grant update on table "public"."web_push_preferences" to "service_role";





-- Aus Schema470 erzeugte Kommentare und vollstaendige ACLs; migra erfasst diese nicht vollstaendig.
comment on table public.web_push_generations is 'Kompakte unveraenderliche Generationen; keine zeitbasierte Bereinigung, damit alte Registrierungen nie wieder aktiv werden.';
comment on table public.web_push_devices is 'Servergeschuetzte Endpunkte und Schluessel; Clients lesen nur bereinigte RPC-Antworten.';
comment on table public.web_push_preferences is 'Ausdrueckliche Kategorienfreigabe pro Geraet und Workspace; neue Kategorien sind ausgeschaltet.';
revoke all on public.web_push_generations,public.web_push_devices,public.web_push_preferences from public,anon,authenticated;
grant all on public.web_push_generations,public.web_push_devices,public.web_push_preferences to service_role;
grant usage,select on sequence public.web_push_preferences_id_seq to service_role;
revoke all on function public.web_push_hash_equal(text,text),public.web_push_revoke_binding(uuid,text),public.web_push_allowed_categories(uuid,uuid),public.web_push_settings(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.web_push_hash_equal(text,text),public.web_push_revoke_binding(uuid,text),public.web_push_allowed_categories(uuid,uuid),public.web_push_settings(uuid,uuid,jsonb) to service_role;
