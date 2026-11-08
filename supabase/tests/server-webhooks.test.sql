\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

select ok(not has_table_privilege('anon', 'public.webhook_configs', 'select'), 'Anonyme REST-Clients erhalten keine Zugangsdaten');
select ok(not has_table_privilege('authenticated', 'public.webhook_configs', 'select'), 'Auch angemeldete REST-Clients erhalten keine Zugangsdaten');
select ok(not has_any_column_privilege('authenticated', 'public.webhook_configs', 'select'), 'Keine Spaltenfreigabe umgeht die Tabellensperre');
select ok(not has_table_privilege('authenticated', 'public.webhook_configs', 'update'), 'Alte Browser können Zugangsdaten nicht direkt ändern');
select ok(not has_table_privilege('authenticated', 'public.webhook_dispatch_claims', 'insert'), 'Nutzer können Versandfreigaben nicht erfinden');
select ok((select relrowsecurity from pg_class where oid = 'public.webhook_dispatch_claims'::regclass), 'Versandfreigaben haben RLS');
select ok(not has_function_privilege('anon', 'public.save_server_webhook_config(uuid,jsonb)', 'execute'), 'Keine anonyme Konfigurations-RPC');
select ok(not has_function_privilege('authenticated', 'public.save_server_webhook_config(uuid,jsonb)', 'execute'), 'Kein direkter RPC-Rückgabepfad für Zugangsdaten');
select ok(not has_function_privilege('authenticated', 'public.claim_server_webhook_dispatch(uuid,text,text)', 'execute'), 'Versand-RPC nur für den Dienst');

insert into public.workspaces(id, name) values ('41000000-0000-4000-8000-000000000001', 'Webhook test');
set local role authenticated;
select throws_ok('select * from public.webhook_configs', '42501', 'permission denied for table webhook_configs', 'Direkter Tabellenzugriff tatsächlich abgewiesen');
select throws_ok($$select public.save_server_webhook_config('41000000-0000-4000-8000-000000000001', '{}'::jsonb)$$, '42501', 'permission denied for function save_server_webhook_config', 'Direkter Funktionsaufruf tatsächlich abgewiesen');
reset role;
set local role service_role;
select is(public.save_server_webhook_config('41000000-0000-4000-8000-000000000001', '{"telegram_bot_token":"existing-secret","telegram_chat_id":"1234"}') ->> 'telegram_bot_token', 'existing-secret', 'Server kann vorhandene Zugangsdaten speichern');
select is((select sale_sound_enabled from public.webhook_configs where workspace_id = '41000000-0000-4000-8000-000000000001'), null::boolean, 'Neue Konfiguration erbt den bisherigen Tonstatus');
select is((select coalesce(sale_sound_enabled, sound_enabled) from public.webhook_configs where workspace_id = '41000000-0000-4000-8000-000000000001'), true, 'Neue Konfiguration aktiviert beide Töne');
select is(public.save_server_webhook_config('41000000-0000-4000-8000-000000000001', '{"sound_enabled":false}') ->> 'telegram_bot_token', 'existing-secret', 'Teiländerung erhält Zugangsdaten');
select is((select coalesce(sale_sound_enabled, sound_enabled) from public.webhook_configs where workspace_id = '41000000-0000-4000-8000-000000000001'), false, 'Bestehende stumme Konfiguration bleibt ohne eigenen Verkaufston stumm');
select ok(
  public.save_server_webhook_config(
    '41000000-0000-4000-8000-000000000001',
    jsonb_build_object('sound_enabled', general_sound, 'sale_sound_enabled', sale_sound)
  ) @> jsonb_build_object('sound_enabled', general_sound, 'sale_sound_enabled', sale_sound),
  format('Beide Töne unabhängig gespeichert: allgemein=%s, Verkauf=%s', general_sound, sale_sound)
)
from (values (false, false), (false, true), (true, false), (true, true)) as sounds(general_sound, sale_sound);
select is(public.save_server_webhook_config('41000000-0000-4000-8000-000000000001', '{"sale_sound_enabled":false}') ->> 'sound_enabled', 'true', 'Verkaufston-Teiländerung erhält den allgemeinen Ton');
select is(public.save_server_webhook_config('41000000-0000-4000-8000-000000000001', '{"sound_enabled":false}') ->> 'sale_sound_enabled', 'false', 'Allgemeine Ton-Teiländerung erhält den Verkaufston');
select is((select telegram_bot_token from public.webhook_configs where workspace_id = '41000000-0000-4000-8000-000000000001'), 'existing-secret', 'Tonänderungen erhalten gespeicherte Zugangsdaten');
select is(public.save_server_webhook_config('41000000-0000-4000-8000-000000000001', '{"telegram_bot_token":null,"telegram_chat_id":null}') ->> 'telegram_bot_token', null::text, 'Explizites Löschen entfernt Zugangsdaten');
select ok(public.claim_server_webhook_dispatch('41000000-0000-4000-8000-000000000001', 'test', 'discord'), 'Erster Test erlaubt');
select ok(not public.claim_server_webhook_dispatch('41000000-0000-4000-8000-000000000001', 'test', 'discord'), 'Wiederholter Test begrenzt');
select ok(public.claim_server_webhook_dispatch('41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'discord'), 'Erster Ereignisversand erlaubt');
select ok(not public.claim_server_webhook_dispatch('41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'discord'), 'Gleiches Ereignis wird nicht nochmals versendet');
update public.webhook_dispatch_claims set claimed_at = now() - interval '31 seconds' where event <> 'test';
select ok(public.claim_server_webhook_dispatch('41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'discord'), 'Fehlgeschlagener Versand kann nach Wartezeit wiederholt werden');
update public.webhook_dispatch_claims set delivered_at = now(), claimed_at = now() - interval '31 seconds' where event <> 'test';
select ok(not public.claim_server_webhook_dispatch('41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'discord'), 'Erfolgreicher Versand bleibt auch nach Wartezeit dedupliziert');
reset role;
select * from finish();
rollback;
