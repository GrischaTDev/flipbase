-- Preserve existing webhook credentials; restrict access and dispatch to the server.
-- Tables: webhook_configs and webhook_dispatch_claims. Generated with Supabase db diff;
-- routine ACLs and comments are taken from the declarative schema because migra omits them.
revoke delete on table "public"."webhook_configs" from "anon";

revoke insert on table "public"."webhook_configs" from "anon";

revoke references on table "public"."webhook_configs" from "anon";

revoke select on table "public"."webhook_configs" from "anon";

revoke trigger on table "public"."webhook_configs" from "anon";

revoke truncate on table "public"."webhook_configs" from "anon";

revoke update on table "public"."webhook_configs" from "anon";

revoke delete on table "public"."webhook_configs" from "authenticated";

revoke insert on table "public"."webhook_configs" from "authenticated";

revoke references on table "public"."webhook_configs" from "authenticated";

revoke select on table "public"."webhook_configs" from "authenticated";

revoke trigger on table "public"."webhook_configs" from "authenticated";

revoke truncate on table "public"."webhook_configs" from "authenticated";

revoke update on table "public"."webhook_configs" from "authenticated";


  create table "public"."webhook_dispatch_claims" (
    "id" uuid not null default gen_random_uuid(),
    "workspace_id" uuid not null,
    "event" text not null,
    "channel" text not null,
    "claimed_at" timestamp with time zone not null default now(),
    "delivered_at" timestamp with time zone
      );


alter table "public"."webhook_dispatch_claims" enable row level security;

create unique index webhook_dispatch_claims_pkey on public.webhook_dispatch_claims using btree (id);

create unique index webhook_dispatch_claims_workspace_id_event_channel_key on public.webhook_dispatch_claims using btree (workspace_id, event, channel);

alter table "public"."webhook_dispatch_claims" add constraint "webhook_dispatch_claims_pkey" primary key using index "webhook_dispatch_claims_pkey";

alter table "public"."webhook_dispatch_claims" add constraint "webhook_dispatch_claims_channel_check" check ((channel = any (array['discord'::text, 'telegram'::text, 'custom'::text]))) not valid;

alter table "public"."webhook_dispatch_claims" validate constraint "webhook_dispatch_claims_channel_check";

alter table "public"."webhook_dispatch_claims" add constraint "webhook_dispatch_claims_workspace_id_event_channel_key" unique using index "webhook_dispatch_claims_workspace_id_event_channel_key";

alter table "public"."webhook_dispatch_claims" add constraint "webhook_dispatch_claims_workspace_id_fkey" foreign key (workspace_id) references public.workspaces(id) on delete cascade not valid;

alter table "public"."webhook_dispatch_claims" validate constraint "webhook_dispatch_claims_workspace_id_fkey";

set check_function_bodies = off;

create or replace function public.claim_server_webhook_dispatch(p_workspace_id uuid, p_event text, p_channel text)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$
begin
  if p_event <> 'test' and p_event !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    raise exception 'Invalid webhook event';
  end if;
  insert into public.webhook_dispatch_claims(workspace_id, event, channel)
    values (p_workspace_id, p_event, p_channel)
  on conflict (workspace_id, event, channel) do update set claimed_at = now()
    where (p_event = 'test' or public.webhook_dispatch_claims.delivered_at is null)
      and public.webhook_dispatch_claims.claimed_at < now() - interval '30 seconds';
  return found;
end;
$function$
;

create or replace function public.save_server_webhook_config(p_workspace_id uuid, p_patch jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  settings public.webhook_configs;
begin
  insert into public.webhook_configs(workspace_id) values (p_workspace_id)
    on conflict (workspace_id) do nothing;
  select * into strict settings from public.webhook_configs
    where workspace_id = p_workspace_id for update;
  settings := jsonb_populate_record(settings, p_patch);
  update public.webhook_configs set
    discord_enabled = settings.discord_enabled,
    discord_webhook_url = settings.discord_webhook_url,
    telegram_enabled = settings.telegram_enabled,
    telegram_bot_token = settings.telegram_bot_token,
    telegram_chat_id = settings.telegram_chat_id,
    custom_webhook_enabled = settings.custom_webhook_enabled,
    custom_webhook_url = settings.custom_webhook_url,
    notify_on_sale = settings.notify_on_sale,
    notify_on_purchase = settings.notify_on_purchase,
    notify_on_low_margin = settings.notify_on_low_margin,
    sound_enabled = settings.sound_enabled,
    updated_at = now()
  where workspace_id = p_workspace_id returning * into settings;
  return to_jsonb(settings);
end;
$function$
;

grant delete on table "public"."webhook_dispatch_claims" to "service_role";

grant insert on table "public"."webhook_dispatch_claims" to "service_role";

grant references on table "public"."webhook_dispatch_claims" to "service_role";

grant select on table "public"."webhook_dispatch_claims" to "service_role";

grant trigger on table "public"."webhook_dispatch_claims" to "service_role";

grant truncate on table "public"."webhook_dispatch_claims" to "service_role";

grant update on table "public"."webhook_dispatch_claims" to "service_role";


  create policy "Server creates dispatch claims"
  on "public"."webhook_dispatch_claims"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Server deletes dispatch claims"
  on "public"."webhook_dispatch_claims"
  as permissive
  for delete
  to service_role
using (true);



  create policy "Server reads dispatch claims"
  on "public"."webhook_dispatch_claims"
  as permissive
  for select
  to service_role
using (true);



  create policy "Server updates dispatch claims"
  on "public"."webhook_dispatch_claims"
  as permissive
  for update
  to service_role
using (true)
with check (true);





revoke all on table public.webhook_configs from public, anon, authenticated;
grant all on table public.webhook_configs to service_role;
comment on table public.webhook_dispatch_claims is 'Serverseitige Deduplizierung und Test-Versandbegrenzung je Workspace und Kanal';
revoke all on table public.webhook_dispatch_claims from public, anon, authenticated;
grant all on table public.webhook_dispatch_claims to service_role;
revoke all on function public.save_server_webhook_config(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_server_webhook_config(uuid, jsonb) to service_role;
revoke all on function public.claim_server_webhook_dispatch(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_server_webhook_dispatch(uuid, text, text) to service_role;
