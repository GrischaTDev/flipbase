-- Beschraenkt eBay-Beobachtung auf die konfigurierte Umgebung und gleicht deklarative Policies ab.
-- Die alte Claim-Signatur wird durch die explizit umgebungsgebundene Signatur ersetzt.
revoke delete on table "public"."ebay_order_observations" from "authenticated";

revoke insert on table "public"."ebay_order_observations" from "authenticated";

revoke references on table "public"."ebay_order_observations" from "authenticated";

revoke select on table "public"."ebay_order_observations" from "authenticated";

revoke trigger on table "public"."ebay_order_observations" from "authenticated";

revoke truncate on table "public"."ebay_order_observations" from "authenticated";

revoke update on table "public"."ebay_order_observations" from "authenticated";

revoke delete on table "public"."ebay_order_observer_scans" from "authenticated";

revoke insert on table "public"."ebay_order_observer_scans" from "authenticated";

revoke references on table "public"."ebay_order_observer_scans" from "authenticated";

revoke select on table "public"."ebay_order_observer_scans" from "authenticated";

revoke trigger on table "public"."ebay_order_observer_scans" from "authenticated";

revoke truncate on table "public"."ebay_order_observer_scans" from "authenticated";

revoke update on table "public"."ebay_order_observer_scans" from "authenticated";

revoke delete on table "public"."web_push_connection_incidents" from "authenticated";

revoke insert on table "public"."web_push_connection_incidents" from "authenticated";

revoke references on table "public"."web_push_connection_incidents" from "authenticated";

revoke select on table "public"."web_push_connection_incidents" from "authenticated";

revoke trigger on table "public"."web_push_connection_incidents" from "authenticated";

revoke truncate on table "public"."web_push_connection_incidents" from "authenticated";

revoke update on table "public"."web_push_connection_incidents" from "authenticated";

drop function if exists "public"."ebay_order_observer_claim"(p_allow_all boolean, p_pilot_users uuid[], p_pilot_devices uuid[]);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.ebay_order_observer_claim(p_allow_all boolean DEFAULT false, p_pilot_users uuid[] DEFAULT '{}'::uuid[], p_pilot_devices uuid[] DEFAULT '{}'::uuid[], p_environment text DEFAULT 'production'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_connection public.ebay_connections; v_scan public.ebay_order_observer_scans; v_operation uuid:=extensions.gen_random_uuid(); v_claim jsonb;
begin
 select c.* into v_connection from public.ebay_connections c
 where c.environment=p_environment and p_environment in ('production','sandbox') and c.status='connected' and c.external_account_id is not null and exists(select 1 from public.ebay_credentials where id=c.id)
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


  create policy "Worker deletes order observations"
  on "public"."ebay_order_observations"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Worker inserts order observations"
  on "public"."ebay_order_observations"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Worker reads order observations"
  on "public"."ebay_order_observations"
  as permissive
  for select
  to service_role
using (true);



  create policy "Worker updates order observations"
  on "public"."ebay_order_observations"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "Worker deletes observer scans"
  on "public"."ebay_order_observer_scans"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Worker inserts observer scans"
  on "public"."ebay_order_observer_scans"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Worker reads observer scans"
  on "public"."ebay_order_observer_scans"
  as permissive
  for select
  to service_role
using (true);



  create policy "Worker updates observer scans"
  on "public"."ebay_order_observer_scans"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "Worker deletes connection incidents"
  on "public"."web_push_connection_incidents"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Worker inserts connection incidents"
  on "public"."web_push_connection_incidents"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Worker reads connection incidents"
  on "public"."web_push_connection_incidents"
  as permissive
  for select
  to service_role
using (true);



  create policy "Worker updates connection incidents"
  on "public"."web_push_connection_incidents"
  as permissive
  for update
  to service_role
using (true)
with check (true);




-- Exakte Funktionsrechte aus Schema472; der Abgleich erfasst sie nicht vollstaendig.
revoke all on function public.web_push_record_message(),public.web_push_record_store_order(),public.web_push_record_connection(),public.ebay_order_observer_claim(boolean,uuid[],uuid[],text),public.ebay_order_observer_page(uuid,uuid,bigint,timestamptz,timestamptz,integer,jsonb,boolean),public.ebay_order_observer_delay(uuid,uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.ebay_order_observer_claim(boolean,uuid[],uuid[],text),public.ebay_order_observer_page(uuid,uuid,bigint,timestamptz,timestamptz,integer,jsonb,boolean),public.ebay_order_observer_delay(uuid,uuid,bigint,integer) to service_role;
