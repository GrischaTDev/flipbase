-- Belegte Pushquellen, Reauthfolgen und dauerhafter eBay-Bestellbeobachter; begrenzte parallele Sendclaims.

  create table "public"."ebay_order_observations" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "environment" text not null,
    "external_account_id" text not null,
    "order_id" text not null,
    "created_at" timestamp with time zone not null,
    "observed_at" timestamp with time zone not null default clock_timestamp()
      );


alter table "public"."ebay_order_observations" enable row level security;


  create table "public"."ebay_order_observer_scans" (
    "id" bigint generated always as identity not null,
    "connection_id" uuid not null,
    "environment" text not null,
    "external_account_id" text not null,
    "baseline_to" timestamp with time zone,
    "watermark" timestamp with time zone,
    "window_from" timestamp with time zone,
    "window_to" timestamp with time zone,
    "next_offset" integer not null default 0,
    "authorization_version" bigint not null,
    "next_due_at" timestamp with time zone not null default now()
      );


alter table "public"."ebay_order_observer_scans" enable row level security;


  create table "public"."web_push_connection_incidents" (
    "id" bigint generated always as identity not null,
    "connection_id" uuid not null,
    "provider" text not null,
    "episode_id" uuid not null default extensions.gen_random_uuid(),
    "is_open" boolean not null default false
      );


alter table "public"."web_push_connection_incidents" enable row level security;

CREATE UNIQUE INDEX ebay_order_observations_pkey ON public.ebay_order_observations USING btree (id);

CREATE INDEX ebay_order_observations_workspace ON public.ebay_order_observations USING btree (workspace_id);

CREATE UNIQUE INDEX ebay_order_observations_workspace_id_environment_external_a_key ON public.ebay_order_observations USING btree (workspace_id, environment, external_account_id, order_id);

CREATE UNIQUE INDEX ebay_order_observer_scans_connection_id_environment_externa_key ON public.ebay_order_observer_scans USING btree (connection_id, environment, external_account_id);

CREATE INDEX ebay_order_observer_scans_due ON public.ebay_order_observer_scans USING btree (next_due_at);

CREATE UNIQUE INDEX ebay_order_observer_scans_pkey ON public.ebay_order_observer_scans USING btree (id);

CREATE INDEX web_push_connection_incidents_connection ON public.web_push_connection_incidents USING btree (connection_id);

CREATE UNIQUE INDEX web_push_connection_incidents_pkey ON public.web_push_connection_incidents USING btree (id);

CREATE UNIQUE INDEX web_push_connection_incidents_provider_connection_id_key ON public.web_push_connection_incidents USING btree (provider, connection_id);

alter table "public"."ebay_order_observations" add constraint "ebay_order_observations_pkey" PRIMARY KEY using index "ebay_order_observations_pkey";

alter table "public"."ebay_order_observer_scans" add constraint "ebay_order_observer_scans_pkey" PRIMARY KEY using index "ebay_order_observer_scans_pkey";

alter table "public"."web_push_connection_incidents" add constraint "web_push_connection_incidents_pkey" PRIMARY KEY using index "web_push_connection_incidents_pkey";

alter table "public"."ebay_order_observations" add constraint "ebay_order_observations_environment_check" CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text]))) not valid;

alter table "public"."ebay_order_observations" validate constraint "ebay_order_observations_environment_check";

alter table "public"."ebay_order_observations" add constraint "ebay_order_observations_order_id_check" CHECK (((length(order_id) >= 1) AND (length(order_id) <= 256))) not valid;

alter table "public"."ebay_order_observations" validate constraint "ebay_order_observations_order_id_check";

alter table "public"."ebay_order_observations" add constraint "ebay_order_observations_workspace_id_environment_external_a_key" UNIQUE using index "ebay_order_observations_workspace_id_environment_external_a_key";

alter table "public"."ebay_order_observations" add constraint "ebay_order_observations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE not valid;

alter table "public"."ebay_order_observations" validate constraint "ebay_order_observations_workspace_id_fkey";

alter table "public"."ebay_order_observer_scans" add constraint "ebay_order_observer_scans_check" CHECK ((((window_from IS NULL) AND (window_to IS NULL)) OR ((window_from IS NOT NULL) AND (window_to >= window_from)))) not valid;

alter table "public"."ebay_order_observer_scans" validate constraint "ebay_order_observer_scans_check";

alter table "public"."ebay_order_observer_scans" add constraint "ebay_order_observer_scans_connection_id_environment_externa_key" UNIQUE using index "ebay_order_observer_scans_connection_id_environment_externa_key";

alter table "public"."ebay_order_observer_scans" add constraint "ebay_order_observer_scans_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES public.ebay_connections(id) ON DELETE CASCADE not valid;

alter table "public"."ebay_order_observer_scans" validate constraint "ebay_order_observer_scans_connection_id_fkey";

alter table "public"."ebay_order_observer_scans" add constraint "ebay_order_observer_scans_environment_check" CHECK ((environment = ANY (ARRAY['production'::text, 'sandbox'::text]))) not valid;

alter table "public"."ebay_order_observer_scans" validate constraint "ebay_order_observer_scans_environment_check";

alter table "public"."ebay_order_observer_scans" add constraint "ebay_order_observer_scans_next_offset_check" CHECK (((next_offset >= 0) AND (next_offset <= 100000))) not valid;

alter table "public"."ebay_order_observer_scans" validate constraint "ebay_order_observer_scans_next_offset_check";

alter table "public"."web_push_connection_incidents" add constraint "web_push_connection_incidents_provider_check" CHECK ((provider = ANY (ARRAY['vinted'::text, 'ebay'::text]))) not valid;

alter table "public"."web_push_connection_incidents" validate constraint "web_push_connection_incidents_provider_check";

alter table "public"."web_push_connection_incidents" add constraint "web_push_connection_incidents_provider_connection_id_key" UNIQUE using index "web_push_connection_incidents_provider_connection_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.ebay_order_observer_claim(p_allow_all boolean DEFAULT false, p_pilot_users uuid[] DEFAULT '{}'::uuid[], p_pilot_devices uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.ebay_connections; v_scan public.ebay_order_observer_scans; v_operation uuid:=extensions.gen_random_uuid(); v_claim jsonb;
begin
 select c.* into v_connection from public.ebay_connections c
 where c.status='connected' and c.external_account_id is not null and exists(select 1 from public.ebay_credentials where id=c.id)
 and (c.operation_id is null or c.operation_expires_at<=now())
 and not exists(select 1 from public.ebay_order_observer_scans s where s.connection_id=c.id and s.environment=c.environment and s.external_account_id=c.external_account_id and s.next_due_at>now())
 and exists(select 1 from public.web_push_devices d join public.web_push_preferences p on p.device_id=d.id join public.web_push_generations g on g.id=d.id
  where d.active and g.revoked_at is null and p.workspace_id=c.workspace_id and 'order'=any(p.categories)
  and (p_allow_all or d.user_id=any(p_pilot_users) or d.id=any(p_pilot_devices))
  and public.web_push_can_deliver(d.user_id,c.workspace_id,'order',c.id,d.session_id))
 order by coalesce((select s.next_due_at from public.ebay_order_observer_scans s where s.connection_id=c.id and s.environment=c.environment and s.external_account_id=c.external_account_id),'-infinity'::timestamptz),c.id
 limit 1 for update skip locked;
 if not found then return null; end if;
 v_claim:=public.ebay_claim_connection(v_connection.workspace_id,v_connection.user_id,v_connection.id,v_operation);
 if v_claim is null then return null; end if;
 insert into public.ebay_order_observer_scans(connection_id,environment,external_account_id,authorization_version)
 values(v_connection.id,v_connection.environment,v_connection.external_account_id,v_connection.authorization_version) on conflict do nothing;
 select * into v_scan from public.ebay_order_observer_scans where connection_id=v_connection.id and environment=v_connection.environment and external_account_id=v_connection.external_account_id for update;
 if v_scan.window_to is null or v_scan.authorization_version<>v_connection.authorization_version then
  update public.ebay_order_observer_scans set window_from=coalesce(watermark-interval '10 minutes',clock_timestamp()-interval '90 days'),window_to=clock_timestamp(),next_offset=0,authorization_version=v_connection.authorization_version where id=v_scan.id returning * into v_scan;
 end if;
 return jsonb_build_object('connection',v_claim,'scan',jsonb_build_object('from',v_scan.window_from,'to',v_scan.window_to,'offset',v_scan.next_offset));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ebay_order_observer_delay(p_connection_id uuid, p_operation_id uuid, p_version bigint, p_delay_seconds integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.ebay_order_observer_scans s set next_due_at=clock_timestamp()+make_interval(secs=>least(greatest(coalesce(p_delay_seconds,300),300),86400))
 from public.ebay_connections c where c.id=p_connection_id and c.operation_id=p_operation_id and c.authorization_version=p_version and c.operation_expires_at>clock_timestamp()
 and s.connection_id=c.id and s.environment=c.environment and s.external_account_id=c.external_account_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ebay_order_observer_page(p_connection_id uuid, p_operation_id uuid, p_version bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_offset integer, p_orders jsonb, p_complete boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.ebay_connections; v_scan public.ebay_order_observer_scans; v_order jsonb; v_inserted bigint; v_created timestamptz;
begin
 select * into v_connection from public.ebay_connections where id=p_connection_id and operation_id=p_operation_id and operation_expires_at>clock_timestamp() and authorization_version=p_version and status='connected' for update;
 if not found or not public.user_can_access_workspace(v_connection.workspace_id,v_connection.user_id)
  or not exists(select 1 from public.web_push_devices d join public.web_push_preferences p on p.device_id=d.id join public.web_push_generations g on g.id=d.id where d.active and g.revoked_at is null
    and p.workspace_id=v_connection.workspace_id and 'order'=any(p.categories) and public.web_push_can_deliver(d.user_id,v_connection.workspace_id,'order',v_connection.id,d.session_id)) then return false; end if;
 select * into v_scan from public.ebay_order_observer_scans where connection_id=p_connection_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id for update;
 if not found or v_scan.window_to is null or p_from is null or p_to is null or p_offset is null or v_scan.authorization_version<>p_version or v_scan.window_from<>p_from or v_scan.window_to<>p_to or v_scan.next_offset<>p_offset then return false; end if;
 if jsonb_typeof(p_orders) is distinct from 'array' or jsonb_array_length(p_orders)>50 or octet_length(p_orders::text)>65536 or p_complete is null or p_offset>99950 then raise exception 'Invalid observation page' using errcode='22023'; end if;
 for v_order in select value from jsonb_array_elements(p_orders) loop
  if jsonb_typeof(v_order) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_order))<>2
   or jsonb_typeof(v_order->'id') is distinct from 'string' or length(v_order->>'id') not between 1 and 256 or jsonb_typeof(v_order->'createdAt') is distinct from 'string' then raise exception 'Invalid observation' using errcode='22023'; end if;
  v_created:=(v_order->>'createdAt')::timestamptz;
  if not isfinite(v_created) or v_created<p_from or v_created>p_to then raise exception 'Observation outside scan' using errcode='22023'; end if;
  insert into public.ebay_order_observations(workspace_id,environment,external_account_id,order_id,created_at) values(v_connection.workspace_id,v_connection.environment,v_connection.external_account_id,v_order->>'id',v_created)
   on conflict do nothing returning id into v_inserted;
  if v_inserted is not null and v_scan.baseline_to is not null and v_created>v_scan.baseline_to then
   perform public.web_push_enqueue_event('ebay-order:'||v_inserted::text,v_connection.workspace_id,'order',v_connection.id,jsonb_build_object('kind','ebay_orders','connectionId',v_connection.id));
  end if;
 end loop;
 update public.ebay_order_observer_scans set
  baseline_to=case when p_complete then coalesce(baseline_to,window_to) else baseline_to end,
  watermark=case when p_complete then window_to else watermark end,
  window_from=case when p_complete then null else window_from end,
  window_to=case when p_complete then null else window_to end,
  next_offset=case when p_complete then 0 else next_offset+50 end,
  next_due_at=clock_timestamp()+case when p_complete then interval '5 minutes' else interval '5 seconds' end where id=v_scan.id;
 return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_record_connection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_provider text; v_connection uuid; v_workspace uuid; v_failed boolean; v_recovered boolean; v_incident public.web_push_connection_incidents;
begin
 if tg_table_name='marketplace_sync_schedules' then
  v_provider:='vinted'; v_connection:=new.connection_id; v_workspace:=new.workspace_id;
  -- Weiche Leseablehnung bleibt still; bestaetigte Schreib-Reauth setzt enabled=false schon beim ersten Fehler.
  v_failed:=new.paused_reason in ('needs_login','forbidden','challenge') and not new.enabled
    and exists(select 1 from public.marketplace_connections where id=new.connection_id and status='connected' and external_account_id is not null);
  v_recovered:=new.paused_reason is null and tg_op='UPDATE'
    and (new.last_success_at is distinct from old.last_success_at and new.last_success_at is not null
      or exists(select 1 from public.marketplace_connections c where c.id=new.connection_id and c.updated_at=new.updated_at and c.updated_at>old.updated_at and c.capabilities->>'profile.read'='verified')
      or exists(select 1 from public.marketplace_operations o where o.connection_id=new.connection_id and o.state='succeeded' and o.error_code is null and o.finished_at>clock_timestamp()-interval '5 seconds'
       and o.observed_at>old.updated_at and o.source_results->'profile'->>'status'='complete' and not exists(select 1 from jsonb_each(o.source_results) area where area.value->>'failure' is not null)));
 else
  v_provider:='ebay'; v_connection:=new.id; v_workspace:=new.workspace_id;
  -- OAuth-Neuanmeldung durch den Nutzer entfernt die Account-ID und ist keine Stoerung.
  v_failed:=tg_op='UPDATE' and old.status='connected' and new.status='needs_login' and new.external_account_id is not null and new.external_account_id=old.external_account_id;
  v_recovered:=tg_op='UPDATE' and new.status='connected' and old.status<>'connected';
 end if;
 if v_failed or v_recovered then
  insert into public.web_push_connection_incidents(connection_id,provider) values(v_connection,v_provider) on conflict(provider,connection_id) do nothing;
  select * into v_incident from public.web_push_connection_incidents where connection_id=v_connection and provider=v_provider for update;
  if v_failed and not v_incident.is_open then
   update public.web_push_connection_incidents set is_open=true,episode_id=extensions.gen_random_uuid() where id=v_incident.id returning * into v_incident;
   perform public.web_push_enqueue_event('connection:'||v_provider||':'||v_incident.episode_id::text,v_workspace,'connection',v_connection,jsonb_build_object('kind','connection','connectionId',v_connection));
  elsif v_recovered then update public.web_push_connection_incidents set is_open=false where id=v_incident.id; end if;
 end if;
 return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_record_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.notified_at is not null and new.conversation_id is not null and new.cleared_at is null
 and (tg_op='INSERT' or old.notified_at is null or old.conversation_id is null)
 and exists(select 1 from public.marketplace_connections where id=new.connection_id and workspace_id=new.workspace_id and external_account_id=new.external_account_id) then
  perform public.web_push_enqueue_event('vinted-message:'||new.id::text,new.workspace_id,'message',new.connection_id,
   jsonb_build_object('kind','vinted_message','connectionId',new.connection_id,'conversationId',new.conversation_id));
 end if;
 return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_record_store_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform public.web_push_enqueue_event('store-order:'||new.id::text,new.workspace_id,'order',null,'{"kind":"store_orders"}'::jsonb);
 return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.web_push_can_deliver(p_user_id uuid, p_workspace_id uuid, p_category text, p_connection_id uuid, p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now()))
 and public.user_can_access_workspace(p_workspace_id,p_user_id)
 and exists(select 1 from public.workspaces where id=p_workspace_id and archived_at is null)
 and case
 when p_category='test' then p_connection_id is null
 when p_category='order' and p_connection_id is null then true
 when p_category in ('message','connection') and exists(select 1 from public.marketplace_connections where id=p_connection_id and workspace_id=p_workspace_id and marketplace='vinted') then
   exists(select 1 from public.platform_operators where user_id=p_user_id)
   and exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin'))
 when p_category in ('order','connection') then
   exists(select 1 from public.ebay_connections where id=p_connection_id and workspace_id=p_workspace_id and user_id=p_user_id and external_account_id is not null and status<>'disconnected')
 else false end;
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
  order by d.next_attempt_at,d.id for update of d skip locked limit 4
 )
 update public.web_push_deliveries d set status='claimed',attempts=d.attempts+1,claim_token=extensions.gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
 from candidates c where d.id=c.id returning d.id,d.binding_generation,d.claim_token;
 -- Der Schluessel wird vor Send geprueft; falsche Versionen enden ohne Geraeteloeschung.
end;
$function$
;

grant delete on table "public"."ebay_order_observations" to "service_role";

grant insert on table "public"."ebay_order_observations" to "service_role";

grant references on table "public"."ebay_order_observations" to "service_role";

grant select on table "public"."ebay_order_observations" to "service_role";

grant trigger on table "public"."ebay_order_observations" to "service_role";

grant truncate on table "public"."ebay_order_observations" to "service_role";

grant update on table "public"."ebay_order_observations" to "service_role";

grant delete on table "public"."ebay_order_observer_scans" to "service_role";

grant insert on table "public"."ebay_order_observer_scans" to "service_role";

grant references on table "public"."ebay_order_observer_scans" to "service_role";

grant select on table "public"."ebay_order_observer_scans" to "service_role";

grant trigger on table "public"."ebay_order_observer_scans" to "service_role";

grant truncate on table "public"."ebay_order_observer_scans" to "service_role";

grant update on table "public"."ebay_order_observer_scans" to "service_role";

grant delete on table "public"."web_push_connection_incidents" to "service_role";

grant insert on table "public"."web_push_connection_incidents" to "service_role";

grant references on table "public"."web_push_connection_incidents" to "service_role";

grant select on table "public"."web_push_connection_incidents" to "service_role";

grant trigger on table "public"."web_push_connection_incidents" to "service_role";

grant truncate on table "public"."web_push_connection_incidents" to "service_role";

grant update on table "public"."web_push_connection_incidents" to "service_role";

CREATE TRIGGER web_push_record_ebay_connection AFTER UPDATE ON public.ebay_connections FOR EACH ROW EXECUTE FUNCTION public.web_push_record_connection();

CREATE TRIGGER web_push_record_message AFTER INSERT OR UPDATE ON public.marketplace_message_notifications FOR EACH ROW EXECUTE FUNCTION public.web_push_record_message();

CREATE TRIGGER web_push_record_vinted_connection AFTER INSERT OR UPDATE ON public.marketplace_sync_schedules FOR EACH ROW EXECUTE FUNCTION public.web_push_record_connection();

CREATE TRIGGER web_push_record_store_order AFTER INSERT ON public.store_orders FOR EACH ROW EXECUTE FUNCTION public.web_push_record_store_order();



-- Exakt aus Schema472 extrahierte Kommentare und ACLs; migra erfasst Function-/Sequence-Rechte nicht vollstaendig.
comment on table public.web_push_connection_incidents is 'Eine Meldung pro belegter Anmeldestoerung; Erholung oeffnet spaetere neue Folgen.';
revoke all on public.web_push_connection_incidents from public,anon,authenticated;
grant all on public.web_push_connection_incidents to service_role;
revoke all on sequence public.web_push_connection_incidents_id_seq from public,anon,authenticated;
grant usage,select on sequence public.web_push_connection_incidents_id_seq to service_role;
comment on table public.ebay_order_observer_scans is 'Accountgebundene gefrorene Scanfenster; Watermark steigt nur nach vollstaendigem Abruf. Erstbaseline bleibt still.';
comment on table public.ebay_order_observations is 'Dauerhafte Bestellkennungen ohne Kaeufer-/Buchhaltungsdaten; unabhaengig von kurzlebigen manuellen Review-Snapshots.';
revoke all on public.ebay_order_observer_scans,public.ebay_order_observations from public,anon,authenticated;
grant all on public.ebay_order_observer_scans,public.ebay_order_observations to service_role;
revoke all on sequence public.ebay_order_observer_scans_id_seq,public.ebay_order_observations_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ebay_order_observer_scans_id_seq,public.ebay_order_observations_id_seq to service_role;
revoke all on function public.web_push_record_message(),public.web_push_record_store_order(),public.web_push_record_connection(),public.ebay_order_observer_claim(boolean,uuid[],uuid[]),public.ebay_order_observer_page(uuid,uuid,bigint,timestamptz,timestamptz,integer,jsonb,boolean),public.ebay_order_observer_delay(uuid,uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.ebay_order_observer_claim(boolean,uuid[],uuid[]),public.ebay_order_observer_page(uuid,uuid,bigint,timestamptz,timestamptz,integer,jsonb,boolean),public.ebay_order_observer_delay(uuid,uuid,bigint,integer) to service_role;
