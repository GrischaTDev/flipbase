\set ON_ERROR_STOP on

begin;

select plan(63);

\set move_source_item_id '82000000-0000-4000-8000-000000000030'
\set move_target_item_id '82000000-0000-4000-8000-000000000031'
\set sellable_item_id '82000000-0000-4000-8000-000000000032'
\set direct_item_id '82000000-0000-4000-8000-000000000033'
\set move_source_sale_id '82000000-0000-4000-8000-000000000034'
\set move_source_line_id '82000000-0000-4000-8000-000000000035'

alter table public.inventory_items disable trigger protect_inventory_item_sold_status;
alter table public.inventory_items disable trigger inventory_item_sale_integrity_on_insert;
alter table public.inventory_items disable trigger inventory_item_sale_integrity_on_status;
alter table public.sale_lines disable trigger inventory_item_sale_integrity_on_sale_line;
alter table public.sales disable trigger inventory_item_sale_integrity_on_sale;

\ir fixtures/inventory_integrity_legacy.sql

alter table public.inventory_items enable trigger protect_inventory_item_sold_status;
alter table public.inventory_items enable trigger inventory_item_sale_integrity_on_insert;
alter table public.inventory_items enable trigger inventory_item_sale_integrity_on_status;
alter table public.sale_lines enable trigger inventory_item_sale_integrity_on_sale_line;
alter table public.sales enable trigger inventory_item_sale_integrity_on_sale;

select set_config('flipbase.allow_inventory_sold_transition', 'on', true);

insert into public.inventory_items (id, workspace_id, title, status)
values
  (:'move_source_item_id'::uuid, :'main_workspace_id'::uuid, 'Move source', 'sold'),
  (:'move_target_item_id'::uuid, :'main_workspace_id'::uuid, 'Move target', 'ready'),
  (:'sellable_item_id'::uuid, :'main_workspace_id'::uuid, 'Sellable item', 'ready'),
  (:'direct_item_id'::uuid, :'main_workspace_id'::uuid, 'Direct mutation item', 'ready');

insert into public.sales (
  id, workspace_id, inventory_item_id, platform, sale_price,
  sale_price_total, sale_date, returned_at, voided_at, voided_by, void_reason
) values
  ('82000000-0000-4000-8000-000000000016', :'main_workspace_id'::uuid, :'available_item_id'::uuid, 'direct', 15, 15, current_date, null, now(), :'main_user_id'::uuid, 'Teststorno'),
  (:'move_source_sale_id'::uuid, :'main_workspace_id'::uuid, null, 'direct', 19, 19, current_date, null, null, null, null);

insert into public.sale_lines (
  id, workspace_id, sale_id, inventory_item_id, title_snapshot,
  quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode
) values
  ('82000000-0000-4000-8000-000000000026', :'main_workspace_id'::uuid, '82000000-0000-4000-8000-000000000016', :'available_item_id'::uuid, 'Voided sale', 1, 15, 15, 6, 'diff_25a'),
  (:'move_source_line_id'::uuid, :'main_workspace_id'::uuid, :'move_source_sale_id'::uuid, :'move_source_item_id'::uuid, 'Move source', 1, 19, 19, 7, 'diff_25a');

select set_config('flipbase.allow_inventory_sold_transition', '', true);

select has_column('public', 'sales', 'voided_at', 'sales has a void timestamp');
select has_column('public', 'sales', 'voided_by', 'sales records who voided it');
select has_column('public', 'sales', 'void_reason', 'sales records why it was voided');

select throws_ok(
  format('update public.sales set voided_at = now(), voided_by = null, void_reason = %L where id = %L', 'Unvollständig', :'valid_sale_id'),
  '23514', null, 'Stornierung ohne handelnde Person wird abgelehnt'
);
select throws_ok(
  format('update public.sales set voided_at = null, voided_by = %L, void_reason = %L where id = %L', :'main_user_id', 'Unvollständig', :'valid_sale_id'),
  '23514', null, 'Stornodaten ohne Zeitpunkt werden abgelehnt'
);
select throws_ok(
  format('update public.sales set voided_at = now(), voided_by = %L, void_reason = %L where id = %L', :'main_user_id', '   ', :'valid_sale_id'),
  '23514', null, 'Stornierung ohne nichtleeren Grund wird abgelehnt'
);

select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'orphan_item_id'), 'legacy_sold_unverified', 'sold ohne Verkauf bleibt ungeklärter Altbestand');
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'legacy_header_item_id'), 'legacy_sale_header_without_line', 'Legacy-Verkaufskopf ohne Position bleibt sichtbar');
select is((select active_sale_count from public.inventory_item_sale_states where inventory_item_id = :'valid_item_id'), 1::bigint, 'Kopf und Position desselben Verkaufs zählen einmal');
select is((select active_sale_id from public.inventory_item_sale_states where inventory_item_id = :'valid_item_id'), :'valid_sale_id'::uuid, 'bestandswirksamer Verkauf wird referenziert');
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'valid_item_id'), 'sold', 'verkauftes Einzelstück ist konsistent');
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'available_item_id'), 'no_active_sale', 'Retouren und Stornos sind nicht bestandswirksam');
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'conflict_item_id'), 'sale_status_conflict', 'Verkauf ohne sold-Status ist Konflikt');
select is((select active_sale_count from public.inventory_item_sale_states where inventory_item_id = :'multiple_item_id'), 2::bigint, 'mehrere aktive Verkäufe werden gezählt');
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'multiple_item_id'), 'multiple_active_sales', 'mehrere aktive Verkäufe sind Konflikt');

create function pg_temp.commit_legacy_metadata_update() returns void language plpgsql as $$
begin
  update public.sales
  set buyer_notes = 'Metadatenkorrektur'
  where id = '82000000-0000-4000-8000-000000000019';
  set constraints all immediate;
  set constraints all deferred;
end;
$$;

create function pg_temp.commit_legacy_relevant_state_update() returns void language plpgsql as $$
begin
  update public.sales
  set returned_at = now()
  where id = '82000000-0000-4000-8000-000000000019';
  set constraints all immediate;
end;
$$;

select lives_ok(
  'select pg_temp.commit_legacy_metadata_update()',
  'irrelevante Verkaufsmetadaten dürfen trotz vorhandener Legacy-Inkonsistenz committet werden'
);
select throws_ok(
  'select pg_temp.commit_legacy_relevant_state_update()',
  '23514', 'Inventarstatus und bestandswirksame Verkaufsposition stimmen nicht ueberein.',
  'bestandswirksame Zustandsänderung prüft den Legacy-Datensatz'
);

select has_table('public', 'inventory_reconciliation_events', 'Klärungsjournal existiert');
select is((select relrowsecurity from pg_class where oid = 'public.inventory_reconciliation_events'::regclass), true, 'Klärungsjournal hat RLS');
select ok(has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'select'), 'authenticated darf Journal lesen');
select ok(
  not has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'insert')
  and not has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'update')
  and not has_table_privilege('authenticated', 'public.inventory_reconciliation_events', 'delete'),
  'Client kann das Journal nicht schreiben'
);
select ok(not has_function_privilege('anon', 'public.resolve_legacy_sold_item(uuid,uuid,text,text)', 'execute'), 'anon darf Klärungs-RPC nicht ausführen');
select ok(has_function_privilege('authenticated', 'public.resolve_legacy_sold_item(uuid,uuid,text,text)', 'execute'), 'authenticated darf Klärungs-RPC ausführen');
select ok(not has_function_privilege('anon', 'public.record_legacy_inventory_sale(uuid,uuid,jsonb,text)', 'execute'), 'anon darf Legacy-Verkauf nicht nachtragen');
select ok(has_function_privilege('authenticated', 'public.record_legacy_inventory_sale(uuid,uuid,jsonb,text)', 'execute'), 'authenticated darf engen Legacy-Nachtrag ausführen');
select is(
  (select count(*) from pg_trigger where tgname in ('inventory_item_sale_integrity_on_insert', 'inventory_item_sale_integrity_on_status', 'inventory_item_sale_integrity_on_sale_line', 'inventory_item_sale_integrity_on_sale') and tgdeferrable and tginitdeferred),
  4::bigint,
  'alle Integritäts-Constraint-Trigger sind initial verzögert'
);

create function pg_temp.commit_new_sold_without_line() returns void language plpgsql as $$
begin
  perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);
  update public.inventory_items set status = 'sold' where id = '82000000-0000-4000-8000-000000000033';
  set constraints all immediate;
end;
$$;

create function pg_temp.commit_line_without_sold() returns void language plpgsql as $$
declare v_sale_id uuid := gen_random_uuid();
begin
  insert into public.sales (id, workspace_id, platform, sale_price, sale_price_total, sale_date)
  values (v_sale_id, '82000000-0000-4000-8000-000000000001', 'direct', 12, 12, current_date);
  insert into public.sale_lines (workspace_id, sale_id, inventory_item_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
  values ('82000000-0000-4000-8000-000000000001', v_sale_id, '82000000-0000-4000-8000-000000000031', 'Move target', 1, 12, 12, 4, 'diff_25a');
  set constraints all immediate;
end;
$$;

create function pg_temp.commit_second_sale() returns void language plpgsql as $$
declare v_sale_id uuid := gen_random_uuid();
begin
  insert into public.sales (id, workspace_id, platform, sale_price, sale_price_total, sale_date)
  values (v_sale_id, '82000000-0000-4000-8000-000000000001', 'direct', 12, 12, current_date);
  insert into public.sale_lines (workspace_id, sale_id, inventory_item_id, title_snapshot, quantity, unit_sale_price, line_total, cost_of_goods_sold, tax_mode)
  values ('82000000-0000-4000-8000-000000000001', v_sale_id, '82000000-0000-4000-8000-000000000006', 'Valid sold item', 1, 12, 12, 4, 'diff_25a');
  set constraints all immediate;
end;
$$;

create function pg_temp.commit_sale_line_move_checks_old() returns void language plpgsql as $$
begin
  update public.sale_lines set inventory_item_id = '82000000-0000-4000-8000-000000000031' where id = '82000000-0000-4000-8000-000000000035';
  perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);
  update public.inventory_items set status = 'sold' where id = '82000000-0000-4000-8000-000000000031';
  set constraints all immediate;
end;
$$;

create function pg_temp.commit_sale_line_move_checks_new() returns void language plpgsql as $$
begin
  update public.sale_lines set inventory_item_id = '82000000-0000-4000-8000-000000000031' where id = '82000000-0000-4000-8000-000000000035';
  perform set_config('flipbase.allow_inventory_sold_transition', 'on', true);
  update public.inventory_items set status = 'ready' where id = '82000000-0000-4000-8000-000000000030';
  set constraints all immediate;
end;
$$;

select throws_ok('select pg_temp.commit_new_sold_without_line()', '23514', null, 'neues sold ohne Position scheitert beim Commit');
select throws_ok('select pg_temp.commit_line_without_sold()', '23514', null, 'Position zu nicht verkauftem Artikel scheitert beim Commit');
select throws_ok('select pg_temp.commit_second_sale()', '23514', null, 'zweiter bestandswirksamer Verkauf scheitert beim Commit');
select throws_ok('select pg_temp.commit_sale_line_move_checks_old()', '23514', null, 'Positionsverschiebung prüft OLD');
select throws_ok('select pg_temp.commit_sale_line_move_checks_new()', '23514', null, 'Positionsverschiebung prüft NEW');

set local role authenticated;
set local request.jwt.claim.sub = :'main_user_id';

select throws_ok(
  format(
    'select public.record_sale(%L, %L::jsonb, %L::jsonb)',
    :'main_workspace_id',
    '{"platform":"direct","sale_date":"2026-08-29"}',
    '[{"inventory_item_id":123,"quantity":1,"unit_sale_price":20}]'
  ),
  '22023', 'Eine Verkaufsposition ist ungültig.',
  'record_sale validiert Einzelstück-IDs vor Sperren und Kopfanlage als nichtleere Zeichenketten'
);

select throws_ok(
  format(
    'select public.record_sale_return(%L, %L, 15, false, %L, %L, %L, %L)',
    :'main_workspace_id',
    '82000000-0000-4000-8000-000000000016',
    'other',
    'Bereits aufgehobener Verkauf',
    'keep_with_buyer',
    ''
  ),
  '22023', 'Ein aufgehobener Verkauf kann nicht retourniert werden.',
  'record_sale_return lehnt vorbereitete Stornofelder ab'
);

select throws_ok(
  format(
    'select public.record_sale(%L, %L::jsonb, %L::jsonb)',
    :'main_workspace_id',
    '{"platform":"direct","sale_date":"2026-08-29"}',
    '[{"inventory_item_id":"82000000-0000-4000-8000-000000000008","quantity":1,"unit_sale_price":20}]'
  ),
  '22023', 'Der Einzelartikel ist nicht verkaufbar.',
  'record_sale lehnt einen aktiven Verkauf trotz verkaufbarem Status ab'
);

select throws_ok(
  format(
    'select public.place_store_order(%L, %L, %L, %L::jsonb, 20, 0, 20, %L, %L, %L, %L, %L::date, %L, %L::jsonb)',
    :'main_workspace_id',
    '82000000-0000-4000-8000-000000000036',
    'STORE-CONFLICT-1',
    '{"name":"Test","email":"test@example.test"}',
    'bank_transfer',
    'paid',
    'payment-conflict-1',
    'confirmed',
    '2026-08-29',
    '',
    '[{"inventory_item_id":"82000000-0000-4000-8000-000000000008","item_title":"Sale status conflict","quantity":1,"price":20,"payment_fee":0}]'
  ),
  '22023', 'Der Einzelartikel ist nicht verkaufbar.',
  'place_store_order lehnt einen aktiven Verkauf serverseitig ab'
);
select is(
  (select count(*) from public.store_orders where id = '82000000-0000-4000-8000-000000000036'),
  0::bigint,
  'abgelehnte Store-Bestellung hinterlässt keinen Bestellungskopf'
);

select throws_ok(
  format('update public.inventory_items set status = %L where id = %L', 'ready', :'orphan_item_id'),
  '42501', null, 'direkter Wechsel aus sold wird geschützt'
);

create function pg_temp.commit_record_sale() returns void language plpgsql as $$
begin
  perform public.record_sale(
    '82000000-0000-4000-8000-000000000001',
    jsonb_build_object('platform', 'direct', 'sale_date', current_date::text),
    jsonb_build_array(jsonb_build_object('inventory_item_id', '82000000-0000-4000-8000-000000000032', 'quantity', 1, 'unit_sale_price', 42))
  );
  set constraints all immediate;
end;
$$;

select lives_ok('select pg_temp.commit_record_sale()', 'record_sale bleibt atomar funktionsfähig');
select is((select status from public.inventory_items where id = :'sellable_item_id'), 'sold', 'record_sale setzt den Status');
select is((select count(*) from public.sale_lines where inventory_item_id = :'sellable_item_id'), 1::bigint, 'record_sale schreibt genau eine Position');
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'sellable_item_id'), 'sold', 'record_sale erzeugt konsistenten Zustand');

select throws_ok(
  format('select public.record_legacy_inventory_sale(%L, %L, %L::jsonb, %L)', :'main_workspace_id', :'valid_item_id', '{"platform":"direct","sale_date":"2026-08-29","unit_sale_price":25}', 'Regulär verkauft'),
  '22023', 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.', 'regulär verkauft wird abgelehnt'
);
select throws_ok(
  format('select public.record_legacy_inventory_sale(%L, %L, %L::jsonb, %L)', :'main_workspace_id', :'legacy_header_item_id', '{"platform":"direct","sale_date":"2026-08-29","unit_sale_price":18}', 'Kopf ohne Position'),
  '22023', 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.', 'Kopf ohne Position wird abgelehnt'
);
select throws_ok(
  format('select public.record_legacy_inventory_sale(%L, %L, %L::jsonb, %L)', :'main_workspace_id', :'multiple_item_id', '{"platform":"direct","sale_date":"2026-08-29","unit_sale_price":30}', 'Mehrere Verkäufe'),
  '22023', 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.', 'mehrere aktive Verkäufe werden abgelehnt'
);
select throws_ok(
  format('select public.record_legacy_inventory_sale(%L, %L, %L::jsonb, %L)', :'main_workspace_id', :'available_item_id', '{"platform":"direct","sale_date":"2026-08-29","unit_sale_price":15}', 'Nicht sold'),
  '22023', 'Legacy-Verkaufsnachtrag ist nur fuer ungepruefte sold-Altdaten zulaessig.', 'nicht verkauftes Einzelstück wird abgelehnt'
);
select throws_ok(
  format('select public.record_legacy_inventory_sale(%L, %L, %L::jsonb, %L)', :'main_workspace_id', :'legacy_record_item_id', '{"platform":"direct","sale_date":"2026-08-29","unit_sale_price":22}', '   '),
  '22023', 'Ein dokumentierter Klaerungsgrund ist erforderlich.', 'Legacy-Nachtrag verlangt einen Grund'
);
select throws_ok(
  format(
    'select public.record_sale(%L, %L::jsonb, %L::jsonb)',
    :'main_workspace_id',
    '{"platform":"direct","sale_date":"2026-08-29"}',
    '[{"inventory_item_id":"82000000-0000-4000-8000-000000000017","quantity":1,"unit_sale_price":22}]'
  ),
  '22023', 'Der Einzelartikel ist nicht verkaufbar.', 'regulärer Verkaufs-RPC erhält keinen sold-Bypass'
);
select lives_ok(
  format('select public.record_legacy_inventory_sale(%L, %L, %L::jsonb, %L)', :'main_workspace_id', :'legacy_record_item_id', '{"platform":"direct","sale_date":"2026-08-29","unit_sale_price":22}', 'Originalbeleg geprüft'),
  'ungeprüfter sold-Altbestand kann atomar nachgetragen werden'
);
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'legacy_record_item_id'), 'sold', 'Legacy-Nachtrag endet konsistent sold');
select is((select count(*) from public.sale_lines where inventory_item_id = :'legacy_record_item_id'), 1::bigint, 'Legacy-Nachtrag schreibt genau eine Position');
select is((select count(*) from public.inventory_reconciliation_events where inventory_item_id = :'legacy_record_item_id' and event_type = 'record_legacy_sale' and reason = 'Originalbeleg geprüft' and actor_id = :'main_user_id'), 1::bigint, 'Legacy-Nachtrag wird protokolliert');
select is((select count(*) from public.sales where inventory_item_id = :'legacy_record_item_id'), 1::bigint, 'Legacy-Nachtrag schreibt genau einen Verkaufskopf');

select throws_ok(
  format('select public.resolve_legacy_sold_item(%L, %L, %L, %L)', :'main_workspace_id', :'orphan_item_id', 'restore_stock', '   '),
  '22023', null, 'Klärung verlangt einen Grund'
);
select lives_ok(
  format('select public.resolve_legacy_sold_item(%L, %L, %L, %L)', :'main_workspace_id', :'orphan_item_id', 'restore_stock', 'Historischer Verkauf nicht belegbar'),
  'ungeklärter Altbestand kann zurückgesetzt werden'
);
select is((select status from public.inventory_items where id = :'orphan_item_id'), 'ready', 'Klärung setzt Artikel auf ready');
select is(
  (select event_type || ':' || reason || ':' || actor_id::text from public.inventory_reconciliation_events where inventory_item_id = :'orphan_item_id'),
  'restore_stock:Historischer Verkauf nicht belegbar:' || :'main_user_id',
  'Klärung protokolliert Typ, Grund und Actor'
);
select is((select sale_state from public.inventory_item_sale_states where inventory_item_id = :'orphan_item_id'), 'no_active_sale', 'Klärung hinterlässt konsistent verfügbaren Zustand');
select throws_ok(
  format('select public.resolve_legacy_sold_item(%L, %L, %L, %L)', :'main_workspace_id', :'legacy_header_item_id', 'restore_stock', 'Nicht zurücksetzen'),
  '22023', 'Korrektur erforderlich: Der Verkaufskopf besitzt keine passende Position.', 'Legacy-Kopf ohne Position verlangt Korrektur'
);
select throws_ok(
  format('select public.resolve_legacy_sold_item(%L, %L, %L, %L)', :'foreign_workspace_id', :'foreign_item_id', 'restore_stock', 'Fremd'),
  '42501', null, 'fremder Workspace kann nicht geklärt werden'
);

set local request.jwt.claim.sub = :'foreign_user_id';
select is((select count(*) from public.inventory_reconciliation_events where workspace_id = :'main_workspace_id'), 0::bigint, 'fremdes Mitglied sieht keine Journalzeilen');
select is((select count(*) from public.inventory_item_sale_states where workspace_id = :'main_workspace_id'), 0::bigint, 'fremdes Mitglied sieht keine Verkaufszustände');

set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok(
  format('select public.resolve_legacy_sold_item(%L, %L, %L, %L)', :'main_workspace_id', :'orphan_item_id', 'restore_stock', 'Anon'),
  '42501', null, 'anon kann Klärung nicht ausführen'
);

reset role;
select throws_ok(
  format('update public.inventory_reconciliation_events set reason = %L where inventory_item_id = %L', 'Nachträglich geändert', :'orphan_item_id'),
  '42501', 'Inventarklaerungsereignisse sind unveraenderlich.', 'Klärungsjournal ist auch für privilegierte Änderungen unveränderlich'
);
select * from finish();
rollback;
