\set ON_ERROR_STOP on

begin;

select plan(6);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, last_sign_in_at
) values
  (
    'b2600000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'usage-operator@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now(), null
  ),
  (
    'b2600000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'usage-one@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now(), '2026-09-25T12:00:00Z'
  ),
  (
    'b2600000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'usage-two@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now(), null
  );

insert into public.platform_operators (user_id, note) values
  ('b2600000-0000-4000-8000-000000000001', 'Nutzungspruefung');

insert into public.workspaces (id, name) values
  ('b2600000-0000-4000-8000-000000000011', 'Erster Testbereich'),
  ('b2600000-0000-4000-8000-000000000012', 'Zweiter Testbereich');

insert into public.business_events (
  id, workspace_id, entity_type, entity_id, event_type, actor_id, created_at
) values
  (
    'b2600000-0000-4000-8000-000000000021',
    'b2600000-0000-4000-8000-000000000011', 'purchase',
    'b2600000-0000-4000-8000-000000000031', 'purchase_draft_created',
    'b2600000-0000-4000-8000-000000000002', now() - interval '40 days'
  ),
  (
    'b2600000-0000-4000-8000-000000000022',
    'b2600000-0000-4000-8000-000000000011', 'purchase',
    'b2600000-0000-4000-8000-000000000032', 'purchase_draft_created',
    'b2600000-0000-4000-8000-000000000002', now() - interval '2 days'
  ),
  (
    'b2600000-0000-4000-8000-000000000023',
    'b2600000-0000-4000-8000-000000000012', 'sale',
    'b2600000-0000-4000-8000-000000000033', 'sale_recorded',
    'b2600000-0000-4000-8000-000000000002', now() - interval '1 day'
  ),
  (
    'b2600000-0000-4000-8000-000000000024',
    'b2600000-0000-4000-8000-000000000012', 'sale',
    'b2600000-0000-4000-8000-000000000034', 'sale_recorded',
    'b2600000-0000-4000-8000-000000000003', now()
  );

select ok(
  not has_function_privilege('anon', 'public.list_platform_user_usage()', 'execute'),
  'Anonyme koennen die Nutzungsuebersicht nicht aufrufen'
);
select ok(
  not has_function_privilege('anon', 'public.list_platform_user_recent_actions(uuid)', 'execute'),
  'Anonyme koennen die Nutzeraktionen nicht aufrufen'
);

set local role authenticated;
set local request.jwt.claim.sub = 'b2600000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform public.list_platform_user_usage();
    raise exception 'Nichtbetreiber durfte die Nutzungsuebersicht lesen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_platform_user_recent_actions(
      'b2600000-0000-4000-8000-000000000003'::uuid
    );
    raise exception 'Nichtbetreiber durfte fremde Aktionen lesen';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select pass('Nichtbetreiber erhalten weder Uebersicht noch fremde Aktionen');

set local role authenticated;
set local request.jwt.claim.sub = 'b2600000-0000-4000-8000-000000000001';

select ok(
  (
    select usage.last_sign_in_at = '2026-09-25T12:00:00Z'::timestamptz
      and usage.purchases_created_30_days = 1
      and usage.sales_recorded_30_days = 1
      and usage.last_action_at > now() - interval '2 days'
    from public.list_platform_user_usage() as usage
    where usage.user_id = 'b2600000-0000-4000-8000-000000000002'::uuid
  ),
  'Login, Zeitfenster und Aktionen aus zwei Workspaces werden korrekt zugeordnet'
);

select ok(
  (
    select usage.purchases_created_30_days = 0
      and usage.sales_recorded_30_days = 1
    from public.list_platform_user_usage() as usage
    where usage.user_id = 'b2600000-0000-4000-8000-000000000003'::uuid
  ),
  'Aktionen anderer Personen erhoehen die Zaehler nicht'
);

select ok(
  (
    select count(*) = 3
      and (array_agg(action.event_type order by action.created_at desc))[1] = 'sale_recorded'
    from public.list_platform_user_recent_actions(
      'b2600000-0000-4000-8000-000000000002'::uuid
    ) as action
  ),
  'Die Chronik bleibt auf die angefragte Person begrenzt und ist zeitlich sortiert'
);

select * from finish();

rollback;
