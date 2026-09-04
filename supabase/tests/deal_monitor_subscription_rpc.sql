\set ON_ERROR_STOP on

begin;

select plan(5);

\set user_id '85000000-0000-4000-8000-000000000001'
\set workspace_a '85000000-0000-4000-8000-000000000002'
\set workspace_b '85000000-0000-4000-8000-000000000003'
\set workspace_c '85000000-0000-4000-8000-000000000004'
\set foreign_query_id '85000000-0000-4000-8000-000000000005'
\set foreign_subscription_id '85000000-0000-4000-8000-000000000006'

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  :'user_id'::uuid, 'authenticated', 'authenticated',
  'sniper-rpc@example.test', 'not-used-by-this-test', '{}'::jsonb,
  '{}'::jsonb, now(), now()
);

insert into public.workspaces (id, name) values
  (:'workspace_a'::uuid, 'Sniper Testbereich A'),
  (:'workspace_b'::uuid, 'Sniper Testbereich B'),
  (:'workspace_c'::uuid, 'Sniper Testbereich C (fremd)');

insert into public.workspace_members (workspace_id, user_id, role) values
  (:'workspace_a'::uuid, :'user_id'::uuid, 'owner'),
  (:'workspace_b'::uuid, :'user_id'::uuid, 'owner');
-- Bewusst kein Eintrag fuer workspace_c: der Nutzer ist dort kein Mitglied.

-- Fremde Abfrage samt Abonnement direkt anlegen, solange noch als postgres
-- gearbeitet wird (RLS umgangen) - genau wie die Testfixtures oben. Danach
-- gibt es einen Arbeitsbereich mit eigenem Abonnement, den der Testnutzer
-- nicht sehen darf.
insert into public.sniper_queries (id, query_key, search_text, brand_id, price_from, price_to) values (
  :'foreign_query_id'::uuid,
  'vinted|search=fremder filter|catalog=-|brand=-|price_from=-|price_to=-',
  'fremder filter', null, null, null
);

insert into public.sniper_query_subscriptions (id, workspace_id, query_id, discount_threshold_percent) values (
  :'foreign_subscription_id'::uuid,
  :'workspace_c'::uuid,
  :'foreign_query_id'::uuid,
  30
);

-- Ab hier als angemeldeter Nutzer. Vorher nicht, sonst scheitern die Inserts.
set local role authenticated;
set local request.jwt.claim.sub = :'user_id';

-- Zwei Arbeitsbereiche mit demselben Filter teilen sich eine Abfrage.
do $$
declare
  subscription_a uuid;
  subscription_b uuid;
  queries integer;
begin
  subscription_a := public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000002'::uuid, '  Nike   Air Max ', 53, null, 50, 30
  );
  subscription_b := public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000003'::uuid, 'nike air max', 53, null, 50, 25
  );

  select count(*) into queries
  from public.sniper_queries
  where query_key = 'vinted|search=nike air max|catalog=-|brand=53|price_from=-|price_to=50';

  if queries <> 1 then
    raise exception 'Erwartet wurde genau eine geteilte Abfrage, gefunden: %', queries;
  end if;

  if subscription_a = subscription_b then
    raise exception 'Beide Arbeitsbereiche haben dasselbe Abonnement bekommen';
  end if;
end;
$$;

select pass('Gleicher Filter, eine Abfrage, zwei Abonnements');

-- Die Schwelle gehoert an das Abonnement.
do $$
declare
  schwellen numeric[];
begin
  select array_agg(discount_threshold_percent order by discount_threshold_percent)
  into schwellen
  from public.sniper_query_subscriptions
  where workspace_id in (
    '85000000-0000-4000-8000-000000000002'::uuid,
    '85000000-0000-4000-8000-000000000003'::uuid
  );

  if schwellen <> array[25, 30]::numeric[] then
    raise exception 'Erwartet wurden die Schwellen 25 und 30, gefunden: %', schwellen;
  end if;
end;
$$;

select pass('Jedes Abonnement traegt seine eigene Schwelle');

-- Zweimal derselbe Filter im selben Arbeitsbereich legt nichts doppelt an.
do $$
declare
  erstes uuid;
  zweites uuid;
  anzahl integer;
begin
  erstes := public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000002'::uuid, 'nike air max', 53, null, 50, 30
  );
  zweites := public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000002'::uuid, 'nike air max', 53, null, 50, 40
  );

  select count(*) into anzahl
  from public.sniper_query_subscriptions
  where workspace_id = '85000000-0000-4000-8000-000000000002'::uuid;

  if erstes <> zweites or anzahl <> 1 then
    raise exception 'Erwartet wurde ein einziges Abonnement, gefunden: % (% und %)', anzahl, erstes, zweites;
  end if;
end;
$$;

select pass('Derselbe Filter zweimal angelegt bleibt ein Abonnement');

-- Nachlaufende Nullen duerfen den Schluessel nicht spalten.
do $$
declare
  ignored uuid;
  queries integer;
begin
  ignored := public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000003'::uuid, 'adidas samba', null, null, 50.00, 30
  );
  ignored := public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000003'::uuid, 'adidas samba', null, null, 50, 30
  );

  select count(*) into queries
  from public.sniper_queries
  where search_text = 'adidas samba';

  if queries <> 1 then
    raise exception '50.00 und 50 haben % Abfragen erzeugt statt einer', queries;
  end if;
end;
$$;

select pass('50.00 und 50 ergeben denselben Abfrageschluessel');

-- Sichtbarkeit ist keine Metadatenpruefung: eine unkorrelierte Leserichtlinie
-- (z. B. "using (true)") wuerde einen reinen Vorhanden-Abgleich der Policy
-- ebenfalls bestehen. Hier wird das tatsaechliche Verhalten geprueft: der
-- Nutzer ist in workspace_c kein Mitglied und darf dessen Abfrage nicht sehen
-- - seine eigene, abonnierte Abfrage aber schon.
do $$
declare
  fremde_sichtbar boolean;
  eigene_sichtbar boolean;
begin
  select exists(
    select 1 from public.sniper_queries
    where id = '85000000-0000-4000-8000-000000000005'::uuid
  ) into fremde_sichtbar;

  select exists(
    select 1 from public.sniper_queries
    where query_key = 'vinted|search=nike air max|catalog=-|brand=53|price_from=-|price_to=50'
  ) into eigene_sichtbar;

  if fremde_sichtbar then
    raise exception 'Fremde Abfrage aus nicht abonniertem Arbeitsbereich ist sichtbar';
  end if;

  if not eigene_sichtbar then
    raise exception 'Eigene abonnierte Abfrage ist nicht sichtbar';
  end if;
end;
$$;

select pass('Sichtbarkeit von sniper_queries folgt der Mitgliedschaft, nicht nur dem Vorhandensein');

select * from finish();

rollback;
