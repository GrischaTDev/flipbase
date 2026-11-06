\set ON_ERROR_STOP on

begin;

select plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    'b5400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'switch-operator@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    'b5400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'switch-user@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now()
  );

insert into public.platform_operators (user_id, note) values
  ('b5400000-0000-4000-8000-000000000001', 'Schalterpruefung');

select is(
  (select array_agg(feature_key order by feature_key) from public.platform_feature_switches),
  array['ebay', 'kleinanzeigen', 'vinted', 'vinted_feed']::text[],
  'Alle vier Kernbereiche haben einen Schalter'
);

select ok(
  not has_table_privilege('anon', 'public.platform_feature_switches', 'select')
    and not has_function_privilege('anon', 'public.set_platform_feature_switch(text, boolean, text)', 'execute')
    and not has_function_privilege('anon', 'public.platform_system_health()', 'execute'),
  'Anonyme sehen weder Schalter noch Systemzustand'
);

select ok(
  not has_table_privilege('authenticated', 'public.platform_feature_switches', 'update')
    and not has_table_privilege('authenticated', 'public.platform_feature_switches', 'insert')
    and not has_table_privilege('authenticated', 'public.platform_feature_switches', 'delete'),
  'Angemeldete aendern Schalter nie direkt in der Tabelle'
);

set local role authenticated;
set local request.jwt.claim.sub = 'b5400000-0000-4000-8000-000000000002';

select is(
  (select count(*)::integer from public.platform_feature_switches),
  4,
  'Normale Nutzer lesen die Schalter fuer die Wartungsseite'
);

do $$
begin
  begin
    perform public.set_platform_feature_switch('vinted', false, null);
    raise exception 'Nichtbetreiber durfte einen Bereich schalten';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.platform_system_health();
    raise exception 'Nichtbetreiber durfte den Systemzustand lesen';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select pass('Nichtbetreiber duerfen weder schalten noch den Systemzustand lesen');

set local role authenticated;
set local request.jwt.claim.sub = 'b5400000-0000-4000-8000-000000000001';

select ok(
  (
    select not switch.enabled
      and switch.maintenance_message = 'Kurze Wartung'
      and switch.updated_by = 'b5400000-0000-4000-8000-000000000001'::uuid
    from public.set_platform_feature_switch('vinted', false, '  Kurze Wartung  ') as switch
  ),
  'Betreiber schalten einen Bereich ab, der Wartungstext wird bereinigt'
);

select ok(
  (
    select switch.enabled and switch.maintenance_message is null
    from public.set_platform_feature_switch('vinted', true, '   ') as switch
  ),
  'Wiedereinschalten mit leerem Text entfernt den Wartungstext'
);

select throws_ok(
  $$ select public.set_platform_feature_switch('shopify', false, null) $$,
  '22023',
  'Unbekannter Bereich',
  'Unbekannte Bereiche werden abgewiesen'
);

select ok(
  (
    select health ? 'marketplaceWorker'
      and health ? 'feedBot'
      and health ? 'storage'
      and (health -> 'operationsLastHour') ? 'failed'
      and (health -> 'cloudIps') ? 'expiringSoon'
    from public.platform_system_health() as health
  ),
  'Betreiber erhalten alle Bereiche des Systemzustands'
);

reset role;
select * from finish();
rollback;
