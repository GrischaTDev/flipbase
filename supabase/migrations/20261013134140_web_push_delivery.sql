-- Dauerhafte Pushereignisse und begrenzte Lieferungen; Tabellen web_push_events/web_push_deliveries.

  create table "public"."web_push_deliveries" (
    "id" uuid not null default extensions.gen_random_uuid(),
    "event_id" uuid not null,
    "device_id" uuid not null,
    "binding_generation" uuid not null,
    "status" text not null default 'waiting'::text,
    "attempts" integer not null default 0,
    "claim_token" uuid,
    "lease_until" timestamp with time zone,
    "next_attempt_at" timestamp with time zone not null default clock_timestamp(),
    "accepted_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "last_error_class" text,
    "created_at" timestamp with time zone not null default clock_timestamp()
      );


alter table "public"."web_push_deliveries" enable row level security;


  create table "public"."web_push_events" (
    "id" uuid not null default extensions.gen_random_uuid(),
    "source_key" text not null,
    "workspace_id" uuid not null,
    "category" text not null,
    "connection_id" uuid,
    "payload" jsonb not null,
    "created_at" timestamp with time zone not null default clock_timestamp(),
    "expires_at" timestamp with time zone not null default (clock_timestamp() + '24:00:00'::interval)
      );


alter table "public"."web_push_events" enable row level security;

CREATE INDEX web_push_deliveries_binding_generation_idx ON public.web_push_deliveries USING btree (binding_generation);

CREATE INDEX web_push_deliveries_device_id_idx ON public.web_push_deliveries USING btree (device_id);

CREATE UNIQUE INDEX web_push_deliveries_event_id_device_id_key ON public.web_push_deliveries USING btree (event_id, device_id);

CREATE INDEX web_push_deliveries_finished_at_idx ON public.web_push_deliveries USING btree (finished_at);

CREATE INDEX web_push_deliveries_pending_idx ON public.web_push_deliveries USING btree (next_attempt_at, lease_until) WHERE (status = ANY (ARRAY['waiting'::text, 'retry'::text, 'claimed'::text]));

CREATE UNIQUE INDEX web_push_deliveries_pkey ON public.web_push_deliveries USING btree (id);

CREATE INDEX web_push_events_created_at_idx ON public.web_push_events USING btree (created_at);

CREATE UNIQUE INDEX web_push_events_pkey ON public.web_push_events USING btree (id);

CREATE UNIQUE INDEX web_push_events_source_key_key ON public.web_push_events USING btree (source_key);

CREATE INDEX web_push_events_workspace_id_idx ON public.web_push_events USING btree (workspace_id);

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_pkey" PRIMARY KEY using index "web_push_deliveries_pkey";

alter table "public"."web_push_events" add constraint "web_push_events_pkey" PRIMARY KEY using index "web_push_events_pkey";

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_attempts_check" CHECK (((attempts >= 0) AND (attempts <= 5))) not valid;

alter table "public"."web_push_deliveries" validate constraint "web_push_deliveries_attempts_check";

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_binding_generation_fkey" FOREIGN KEY (binding_generation) REFERENCES public.web_push_generations(id) not valid;

alter table "public"."web_push_deliveries" validate constraint "web_push_deliveries_binding_generation_fkey";

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_check" CHECK ((binding_generation = device_id)) not valid;

alter table "public"."web_push_deliveries" validate constraint "web_push_deliveries_check";

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.web_push_devices(id) ON DELETE CASCADE not valid;

alter table "public"."web_push_deliveries" validate constraint "web_push_deliveries_device_id_fkey";

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_event_id_device_id_key" UNIQUE using index "web_push_deliveries_event_id_device_id_key";

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.web_push_events(id) ON DELETE CASCADE not valid;

alter table "public"."web_push_deliveries" validate constraint "web_push_deliveries_event_id_fkey";

alter table "public"."web_push_deliveries" add constraint "web_push_deliveries_status_check" CHECK ((status = ANY (ARRAY['waiting'::text, 'claimed'::text, 'accepted'::text, 'retry'::text, 'expired'::text, 'configuration_error'::text]))) not valid;

alter table "public"."web_push_deliveries" validate constraint "web_push_deliveries_status_check";

alter table "public"."web_push_events" add constraint "web_push_events_category_check" CHECK ((category = ANY (ARRAY['test'::text, 'message'::text, 'order'::text, 'connection'::text]))) not valid;

alter table "public"."web_push_events" validate constraint "web_push_events_category_check";

alter table "public"."web_push_events" add constraint "web_push_events_payload_check" CHECK (((pg_column_size(payload) <= 4096) AND ((payload ->> 'version'::text) = '1'::text) AND (jsonb_typeof((payload -> 'target'::text)) = 'object'::text))) not valid;

alter table "public"."web_push_events" validate constraint "web_push_events_payload_check";

alter table "public"."web_push_events" add constraint "web_push_events_source_key_check" CHECK (((length(source_key) >= 1) AND (length(source_key) <= 512))) not valid;

alter table "public"."web_push_events" validate constraint "web_push_events_source_key_check";

alter table "public"."web_push_events" add constraint "web_push_events_source_key_key" UNIQUE using index "web_push_events_source_key_key";

alter table "public"."web_push_events" add constraint "web_push_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."web_push_events" validate constraint "web_push_events_workspace_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.web_push_authorize(p_delivery_id uuid, p_generation uuid, p_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_delivery public.web_push_deliveries%rowtype; v_device public.web_push_devices%rowtype; v_event public.web_push_events%rowtype;
begin
 select * into v_delivery from public.web_push_deliveries where id=p_delivery_id and binding_generation=p_generation and claim_token=p_claim_token and status='claimed' and lease_until>clock_timestamp() for update;
 if not found then return null; end if;
 select * into v_device from public.web_push_devices where id=p_generation;
 select * into v_event from public.web_push_events where id=v_delivery.event_id;
 if not v_device.active or v_event.expires_at<=clock_timestamp()
 or exists(select 1 from public.web_push_generations where id=p_generation and revoked_at is not null)
 or not public.web_push_can_deliver(v_device.user_id,v_event.workspace_id,v_event.category,v_event.connection_id,v_device.session_id)
 or (v_event.category<>'test' and not exists(select 1 from public.web_push_preferences where device_id=p_generation and workspace_id=v_event.workspace_id and v_event.category=any(categories)))
 then
  update public.web_push_deliveries set status='expired',finished_at=clock_timestamp(),last_error_class='permission',lease_until=null,claim_token=null where id=p_delivery_id;
  return null;
 end if;
 return jsonb_build_object('endpoint',v_device.endpoint,'p256dh',v_device.p256dh,'auth',v_device.auth,'keyId',v_device.vapid_key_id,'payload',v_event.payload,'expiresAt',v_event.expires_at);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_can_deliver(p_user_id uuid, p_workspace_id uuid, p_category text, p_connection_id uuid, p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p_category='test' and p_connection_id is null
 and exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now()))
 and public.user_can_access_workspace(p_workspace_id,p_user_id)
 and exists(select 1 from public.workspaces where id=p_workspace_id and archived_at is null);
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_claim(p_key_id text, p_allow_all boolean DEFAULT false, p_pilot_users uuid[] DEFAULT '{}'::uuid[], p_pilot_devices uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(id uuid, binding_generation uuid, claim_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 -- Ein abgelaufener letzter Claim wird terminal, auch wenn sein Prozess nie quittiert.
 update public.web_push_deliveries d set status='expired',finished_at=clock_timestamp(),last_error_class='attempt_limit',lease_until=null,claim_token=null
 from public.web_push_events e where e.id=d.event_id and d.status in ('waiting','retry','claimed')
 and (e.expires_at<=clock_timestamp() or (d.attempts>=5 and (d.lease_until is null or d.lease_until<=clock_timestamp())));
 return query
 with candidates as (
  select d.id from public.web_push_deliveries d join public.web_push_devices device on device.id=d.device_id
  join public.web_push_events e on e.id=d.event_id join public.web_push_generations g on g.id=d.binding_generation
  where d.status in ('waiting','retry','claimed') and d.next_attempt_at<=clock_timestamp()
  and (d.lease_until is null or d.lease_until<=clock_timestamp()) and d.attempts<5 and e.expires_at>clock_timestamp()
  and device.active and g.revoked_at is null
  and (p_allow_all or device.user_id=any(p_pilot_users) or device.id=any(p_pilot_devices))
  order by d.next_attempt_at,d.id for update of d skip locked limit 20
 )
 update public.web_push_deliveries d set status='claimed',attempts=d.attempts+1,claim_token=extensions.gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
 from candidates c where d.id=c.id returning d.id,d.binding_generation,d.claim_token;
 -- Der Schluessel wird vor Send geprueft; falsche Versionen enden ohne Geraeteloeschung.
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_cleanup()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 with expired as (
  select d.id from public.web_push_deliveries d join public.web_push_events e on e.id=d.event_id
  where d.status in ('waiting','retry','claimed') and e.expires_at<=clock_timestamp()
  order by e.expires_at for update of d skip locked limit 1000
 ) update public.web_push_deliveries d set status='expired',finished_at=clock_timestamp(),last_error_class='event_expiry',lease_until=null,claim_token=null from expired where d.id=expired.id;
 -- Kontrollierte Batches; kompakte Generationstombstones werden niemals geloescht.
 delete from public.web_push_deliveries where id in(select id from public.web_push_deliveries where finished_at<now()-interval '7 days' order by finished_at limit 1000);
 delete from public.web_push_events where id in(select e.id from public.web_push_events e where created_at<now()-interval '30 days' and not exists(select 1 from public.web_push_deliveries where event_id=e.id) order by created_at limit 1000);
 delete from public.web_push_devices where id in(select d.id from public.web_push_devices d join public.web_push_generations g on g.id=d.id where not d.active and g.revoked_at<now()-interval '30 days' and not exists(select 1 from public.web_push_deliveries where device_id=d.id) order by g.revoked_at limit 1000);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_enqueue_event(p_source_key text, p_workspace_id uuid, p_category text, p_connection_id uuid, p_target jsonb, p_device_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid:=extensions.gen_random_uuid(); v_inserted uuid; v_title text; v_body text;
begin
 if p_category='test' and (p_device_id is null or p_target<>'{"kind":"settings"}'::jsonb or p_connection_id is not null) then raise exception 'Push test target denied' using errcode='22023'; end if;
 v_title:='Flipbase';
 v_body:=case p_category when 'test' then 'Deine Testbenachrichtigung ist angekommen.' when 'message' then 'Du hast eine neue Nachricht.' when 'order' then 'Eine neue Bestellung ist eingegangen.' when 'connection' then 'Eine Kontoverbindung braucht deine Anmeldung.' end;
 insert into public.web_push_events(id,source_key,workspace_id,category,connection_id,payload)
 values(v_id,p_source_key,p_workspace_id,p_category,p_connection_id,jsonb_build_object('version',1,'eventId',v_id,'workspaceId',p_workspace_id,'category',p_category,'title',v_title,'body',v_body,'target',p_target))
 on conflict(source_key) do nothing returning id into v_inserted;
 if v_inserted is null then
  select id into v_id from public.web_push_events where source_key=p_source_key;
  return v_id;
 end if;
 insert into public.web_push_deliveries(event_id,device_id,binding_generation)
 select v_id,d.id,d.id from public.web_push_devices d join public.web_push_generations g on g.id=d.id
 where d.active and g.revoked_at is null and (p_device_id is null or d.id=p_device_id)
 and public.web_push_can_deliver(d.user_id,p_workspace_id,p_category,p_connection_id,d.session_id)
 and (p_category='test' or exists(select 1 from public.web_push_preferences p where p.device_id=d.id and p.workspace_id=p_workspace_id and p_category=any(p.categories)))
 on conflict(event_id,device_id) do nothing;
 return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_enqueue_test(p_device_id uuid, p_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_device public.web_push_devices%rowtype;
begin
 select * into v_device from public.web_push_devices where id=p_device_id for update;
 if not found or not v_device.active or not public.web_push_can_deliver(v_device.user_id,p_workspace_id,'test',null,v_device.session_id)
 or exists(select 1 from public.web_push_generations where id=p_device_id and revoked_at is not null)
 then raise exception 'Push test denied' using errcode='42501'; end if;
 return public.web_push_enqueue_event('test:'||extensions.gen_random_uuid()::text,p_workspace_id,'test',null,'{"kind":"settings"}',p_device_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_finish(p_delivery_id uuid, p_generation uuid, p_claim_token uuid, p_result text, p_retry_after_ms bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_delivery public.web_push_deliveries%rowtype; v_expiry timestamptz; v_delay interval; v_status text:=p_result;
begin
 if p_result not in ('accepted','retry','expired','configuration_error') then raise exception 'Push result denied' using errcode='22023'; end if;
 select * into v_delivery from public.web_push_deliveries where id=p_delivery_id and binding_generation=p_generation and claim_token=p_claim_token and status='claimed' and lease_until>clock_timestamp() for update;
 if not found then return false; end if;
 select expires_at into v_expiry from public.web_push_events where id=v_delivery.event_id;
 if p_result='retry' then
  v_delay:=case when p_retry_after_ms is not null and p_retry_after_ms>=0 then least(p_retry_after_ms,86400000)*interval '1 millisecond' else (array[30,120,600,1800])[least(v_delivery.attempts,4)]*interval '1 second' end;
  if v_delivery.attempts>=5 or clock_timestamp()+v_delay>=v_expiry then v_status:='expired'; end if;
 end if;
 update public.web_push_deliveries set status=v_status,claim_token=null,lease_until=null,
 next_attempt_at=case when v_status='retry' then least(clock_timestamp()+v_delay,v_expiry) else next_attempt_at end,
 accepted_at=case when v_status='accepted' then clock_timestamp() else accepted_at end,
 finished_at=case when v_status='retry' then null else clock_timestamp() end,
 last_error_class=case when v_status='accepted' then null when v_status='expired' and p_result='retry' then 'attempt_limit' else p_result end
 where id=p_delivery_id;
 if p_result='expired' then
  -- Nur der konkrete Providerendpunkt ist abgelaufen; die Generation bleibt terminal.
  update public.web_push_devices set active=false where id=p_generation;
  update public.web_push_generations set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_generation;
 end if;
 return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('waiting',count(*) filter(where status in ('waiting','claimed')),'accepted',count(*) filter(where status='accepted'),'retry',count(*) filter(where status='retry'),'expired',count(*) filter(where status='expired'),'configuration_error',count(*) filter(where status='configuration_error')) from public.web_push_deliveries;
$function$
;

grant delete on table "public"."web_push_deliveries" to "service_role";

grant insert on table "public"."web_push_deliveries" to "service_role";

grant references on table "public"."web_push_deliveries" to "service_role";

grant select on table "public"."web_push_deliveries" to "service_role";

grant trigger on table "public"."web_push_deliveries" to "service_role";

grant truncate on table "public"."web_push_deliveries" to "service_role";

grant update on table "public"."web_push_deliveries" to "service_role";

grant delete on table "public"."web_push_events" to "service_role";

grant insert on table "public"."web_push_events" to "service_role";

grant references on table "public"."web_push_events" to "service_role";

grant select on table "public"."web_push_events" to "service_role";

grant trigger on table "public"."web_push_events" to "service_role";

grant truncate on table "public"."web_push_events" to "service_role";

grant update on table "public"."web_push_events" to "service_role";



-- Exakt aus Schema471 extrahierte Kommentare und ACLs; migra erfasst Functionrechte nicht vollstaendig.
comment on table public.web_push_events is 'Belegte serverseitige Ereignisse; Quelle eindeutig, Inhalt ohne Kundendaten, Aufbewahrung 30 Tage.';
comment on table public.web_push_deliveries is 'Ein logischer Auftrag je Ereignis und unveraenderlicher Geraetegeneration; Anbieterannahme ist keine Anzeigequittung.';
revoke all on public.web_push_events,public.web_push_deliveries from public,anon,authenticated;
grant all on public.web_push_events,public.web_push_deliveries to service_role;
revoke all on function public.web_push_can_deliver(uuid,uuid,text,uuid,uuid),public.web_push_enqueue_event(text,uuid,text,uuid,jsonb,uuid),public.web_push_enqueue_test(uuid,uuid),public.web_push_claim(text,boolean,uuid[],uuid[]),public.web_push_authorize(uuid,uuid,uuid),public.web_push_finish(uuid,uuid,uuid,text,bigint),public.web_push_health(),public.web_push_cleanup() from public,anon,authenticated;
grant execute on function public.web_push_can_deliver(uuid,uuid,text,uuid,uuid),public.web_push_enqueue_event(text,uuid,text,uuid,jsonb,uuid),public.web_push_enqueue_test(uuid,uuid),public.web_push_claim(text,boolean,uuid[],uuid[]),public.web_push_authorize(uuid,uuid,uuid),public.web_push_finish(uuid,uuid,uuid,text,bigint),public.web_push_health(),public.web_push_cleanup() to service_role;
