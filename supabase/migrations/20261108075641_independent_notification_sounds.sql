-- Unabhängiger Verkaufston in public.webhook_configs.sale_sound_enabled und Speicher-RPC.
-- Aus lokalem PostgreSQL-17-Schema-Diff mit migra erzeugt; NULL erhält den bisherigen Tonstatus.
alter table "public"."webhook_configs" add column "sale_sound_enabled" boolean;

set check_function_bodies = off;

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
    sale_sound_enabled = settings.sale_sound_enabled,
    updated_at = now()
  where workspace_id = p_workspace_id returning * into settings;
  return to_jsonb(settings);
end;
$function$
;