\set ON_ERROR_STOP on

begin;

select plan(33);

select has_function(
  'public',
  'preview_purchase_costing_legacy',
  array['uuid'],
  'Legacy-Kostenprüfung ist workspacebezogen vorhanden'
);
select has_function(
  'public',
  'migrate_purchase_costing_legacy',
  array['uuid', 'boolean'],
  'bestätigte Legacy-Kostenmigration ist vorhanden'
);

\set purchase_costing_legacy_fixture 1
\ir .generated/purchase_costing_legacy.sql.inc
\unset purchase_costing_legacy_fixture

create temporary table legacy_counts_before as
select
  (select pg_catalog.count(*) from public.purchase_lines where workspace_id = :'legacy_workspace_id') as purchase_lines,
  (select pg_catalog.count(*) from public.business_events where workspace_id = :'legacy_workspace_id') as business_events,
  (select pg_catalog.md5(pg_catalog.string_agg(pg_catalog.to_jsonb(sale)::text, '' order by sale.id)) from public.sales as sale where workspace_id = :'legacy_workspace_id') as sales_hash;
grant select on legacy_counts_before to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = :'legacy_owner_id';

select results_eq(
  format(
    $$select purchase_id, classification from public.preview_purchase_costing_legacy(%L) order by purchase_id$$,
    :'legacy_workspace_id'
  ),
  format(
    $$values (%L::uuid, 'auto_repair'::text), (%L::uuid, 'items_missing'::text), (%L::uuid, 'manual_review'::text), (%L::uuid, 'auto_repair'::text), (%L::uuid, 'manual_review'::text)$$,
    :'safe_purchase_id', :'empty_purchase_id', :'normal_purchase_id', :'unsold_purchase_id', :'unsupported_status_purchase_id'
  ),
  'Prüfung klassifiziert sichere, leere und manuelle Altdaten verständlich'
);

select is(
  (select pg_catalog.count(*) from public.purchase_lines where workspace_id = :'legacy_workspace_id'),
  (select purchase_lines from legacy_counts_before),
  'Vorschau schreibt keine Einkaufspositionen'
);
select is(
  (
    select pg_catalog.count(*)
    from public.list_business_events(:'legacy_workspace_id', '{}'::jsonb, null, null, 100)
  ),
  (select business_events from legacy_counts_before),
  'Vorschau schreibt keine Ereignisse'
);
select is(
  (select pg_catalog.md5(pg_catalog.string_agg(pg_catalog.to_jsonb(sale)::text, '' order by sale.id)) from public.sales as sale where workspace_id = :'legacy_workspace_id'),
  (select sales_hash from legacy_counts_before),
  'Vorschau verändert keine Verkaufsdaten'
);
select is(
  (
    select pg_catalog.count(*)
    from public.preview_purchase_costing_legacy(:'legacy_workspace_id')
    where purchase_id = :'foreign_purchase_id'
  ),
  0::bigint,
  'Vorschau gibt keine Daten eines anderen Workspace zurück'
);

select throws_ok(
  format(
    'select public.migrate_purchase_costing_legacy(%L, false)',
    :'legacy_workspace_id'
  ),
  '22023',
  'Die Altdatenmigration benötigt eine ausdrückliche Bestätigung.',
  'Migration lehnt fehlende Bestätigung ab'
);

select set_config('request.jwt.claim.sub', :'foreign_owner_id', true);
select throws_ok(
  format('select * from public.preview_purchase_costing_legacy(%L)', :'legacy_workspace_id'),
  '42501',
  'Keine Berechtigung für die Altdatenprüfung.',
  'fremder Workspace kann nicht geprüft werden'
);
select throws_ok(
  format('select public.migrate_purchase_costing_legacy(%L, true)', :'legacy_workspace_id'),
  '42501',
  'Keine Berechtigung für die Altdatenmigration.',
  'fremder Workspace kann nicht migriert werden'
);

select set_config('request.jwt.claim.sub', :'legacy_accountant_id', true);
select is(
  (select pg_catalog.count(*) from public.preview_purchase_costing_legacy(:'legacy_workspace_id')),
  5::bigint,
  'Buchhaltung darf die Altdatenprüfung ausführen'
);

select set_config('request.jwt.claim.sub', :'legacy_viewer_id', true);
select throws_ok(
  format('select * from public.preview_purchase_costing_legacy(%L)', :'legacy_workspace_id'),
  '42501',
  'Keine Berechtigung für die Altdatenprüfung.',
  'normale Mitglieder erhalten keinen Zugriff auf die Altdatenprüfung'
);

select set_config('request.jwt.claim.sub', :'legacy_owner_id', true);

create temporary table legacy_sale_facts_before as
select
  sale.id,
  sale.platform,
  sale.sale_price,
  sale.sale_price_total,
  sale.sale_date,
  sale.platform_fee,
  sale.shipping_cost,
  sale.packaging_cost,
  sale.other_costs,
  sale.created_at
from public.sales as sale
where sale.workspace_id = :'legacy_workspace_id';
grant select on legacy_sale_facts_before to authenticated;

create temporary table legacy_migration_result as
select public.migrate_purchase_costing_legacy(:'legacy_workspace_id', true) as value;
grant select on legacy_migration_result to authenticated;

select is(
  (select (value ->> 'repaired')::integer from legacy_migration_result),
  2,
  'beide sicheren Mystery-Einkäufe werden repariert'
);
select is(
  (select pg_catalog.count(*) from public.purchase_lines where purchase_id = :'safe_purchase_id'),
  4::bigint,
  'jedes bekannte Mystery-Einzelstück erhält eine Einkaufsposition'
);
select is(
  (select pg_catalog.count(*) from public.inventory_items where purchase_id = :'safe_purchase_id' and purchase_line_id is not null),
  4::bigint,
  'alle bekannten Einzelstücke werden stabil mit ihren Positionen verknüpft'
);
select is(
  (select total_purchase_cost from public.purchases where id = :'safe_purchase_id'),
  110.01::numeric,
  'Warenbetrag und Zusatzkosten ergeben die finalen Einkaufsgesamtkosten'
);
select is(
  (select pg_catalog.sum(allocated_purchase_cost) from public.inventory_items where purchase_id = :'safe_purchase_id'),
  110.01::numeric,
  'Mystery-Kosten werden vollständig auf die bekannten Einheiten verteilt'
);
select results_eq(
  format(
    $$select allocated_purchase_cost from public.inventory_items where purchase_id = %L order by id$$,
    :'safe_purchase_id'
  ),
  $$values (27.51::numeric), (27.50::numeric), (27.50::numeric), (27.50::numeric)$$,
  'Restcent folgt bei identischen Zeitstempeln stabil der Artikelreihenfolge'
);
select results_eq(
  $$select cost_of_goods_sold from public.sale_lines where sale_id in ('94000000-0000-4000-8000-000000000201', '94000000-0000-4000-8000-000000000202') order by sale_id$$,
  $$values (27.51::numeric), (27.50::numeric)$$,
  'Wareneinsatz bereits verkaufter Einzelstücke wird konsistent korrigiert'
);
select set_eq(
  $$select id, platform, sale_price, sale_price_total, sale_date, platform_fee, shipping_cost, packaging_cost, other_costs, created_at from public.sales where workspace_id = '94000000-0000-4000-8000-000000000001'$$,
  $$select id, platform, sale_price, sale_price_total, sale_date, platform_fee, shipping_cost, packaging_cost, other_costs, created_at from legacy_sale_facts_before$$,
  'Verkaufspreise, Gebühren und Zeitpunkte bleiben unverändert'
);
select ok(
  exists (
    with events as (
      select *
      from public.list_entity_business_events(
        :'legacy_workspace_id',
        'purchase',
        :'safe_purchase_id',
        null,
        null,
        100
      )
    )
    select 1
    from events as migration_event
    join events as correction_event
      on correction_event.workspace_id = migration_event.workspace_id
      and correction_event.correlation_id = migration_event.correlation_id
      and correction_event.entity_type = 'purchase'
      and correction_event.entity_id = migration_event.entity_id
      and correction_event.event_type = 'purchase_corrected'
      and correction_event.id = (migration_event.changes #>> '{migration,after,costing_event_id}')::uuid
    where migration_event.workspace_id = :'legacy_workspace_id'
      and migration_event.entity_type = 'purchase'
      and migration_event.entity_id = :'safe_purchase_id'
      and migration_event.event_type = 'purchase_costing_legacy_migrated'
      and migration_event.changes #>> '{migration,after,costing_event_type}' = 'purchase_corrected'
      and (migration_event.changes #>> '{migration,after,operational_statuses_preserved}')::boolean
  ),
  'kontrollierte Altdatenmigration wird eindeutig mit der Kostenkorrektur protokolliert'
);
select is(
  (select entry_status from public.purchases where id = :'safe_purchase_id'),
  'finalized',
  'reparierter Einkauf ist finalisiert'
);
select is(
  (select entry_status from public.purchases where id = :'unsold_purchase_id'),
  'finalized',
  'sicherer Mystery-Einkauf ohne Verkäufe wird regulär finalisiert'
);
select is(
  (select pg_catalog.sum(allocated_purchase_cost) from public.inventory_items where purchase_id = :'unsold_purchase_id'),
  40::numeric,
  'Kosten des unverkauften Mystery-Einkaufs werden vollständig verteilt'
);
select results_eq(
  format(
    $$select status from public.inventory_items where purchase_id = %L order by id$$,
    :'unsold_purchase_id'
  ),
  $$values ('needs_review'::text), ('ready'::text)$$,
  'reine Kostenübernahme bewahrt den bisherigen Bearbeitungsstatus'
);
select ok(
  exists (
    with events as (
      select *
      from public.list_entity_business_events(
        :'legacy_workspace_id',
        'purchase',
        :'unsold_purchase_id',
        null,
        null,
        100
      )
    )
    select 1
    from events as migration_event
    join events as finalized_event
      on finalized_event.correlation_id = migration_event.correlation_id
      and finalized_event.event_type = 'purchase_finalized'
      and finalized_event.id = (migration_event.changes #>> '{migration,after,costing_event_id}')::uuid
    where migration_event.event_type = 'purchase_costing_legacy_migrated'
      and migration_event.changes #>> '{migration,after,costing_event_type}' = 'purchase_finalized'
      and (migration_event.changes #>> '{migration,after,operational_statuses_preserved}')::boolean
  ),
  'Altdatenmigration ohne Verkäufe verweist auf den vollständigen Abschlussvorgang'
);
select is(
  (select entry_status from public.purchases where id = :'unsupported_status_purchase_id'),
  'draft',
  'nicht sicher finalisierbare Artikelstatus bleiben in manueller Prüfung'
);
select is(
  (select entry_status from public.purchases where id = :'empty_purchase_id'),
  'draft',
  'Mystery-Einkauf ohne bekannte Artikel bleibt unverändert'
);
select is(
  (select entry_status from public.purchases where id = :'normal_purchase_id'),
  'draft',
  'normaler Einkauf ohne Positionen bleibt in manueller Prüfung'
);
select is(
  (public.migrate_purchase_costing_legacy(:'legacy_workspace_id', true) ->> 'repaired')::integer,
  0,
  'wiederholte Migration ist idempotent'
);
select is(
  (
    select pg_catalog.count(*)
    from public.preview_purchase_costing_legacy(:'legacy_workspace_id')
    where purchase_id = :'safe_purchase_id'
  ),
  0::bigint,
  'reparierter Einkauf verschwindet aus der Altdatenprüfung'
);
select ok(
  has_function_privilege('authenticated', 'public.preview_purchase_costing_legacy(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.migrate_purchase_costing_legacy(uuid,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.preview_purchase_costing_legacy(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.migrate_purchase_costing_legacy(uuid,boolean)', 'execute')
  and not has_function_privilege('service_role', 'public.preview_purchase_costing_legacy(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.migrate_purchase_costing_legacy(uuid,boolean)', 'execute'),
  'nur authenticated darf die gehärteten Legacy-RPCs aufrufen'
);
select ok(
  (
    select pg_catalog.bool_and(
      routine.prosecdef
      and 'search_path=""' = any(coalesce(routine.proconfig, array[]::text[]))
      and owner_role.rolname = 'postgres'
    )
    from pg_catalog.pg_proc as routine
    join pg_catalog.pg_namespace as namespace on namespace.oid = routine.pronamespace
    join pg_catalog.pg_roles as owner_role on owner_role.oid = routine.proowner
    where namespace.nspname = 'public'
      and routine.proname in ('preview_purchase_costing_legacy', 'migrate_purchase_costing_legacy')
  ),
  'Legacy-RPCs sind Security Definer mit leerem Suchpfad und festem Owner'
);

select * from finish();

rollback;
