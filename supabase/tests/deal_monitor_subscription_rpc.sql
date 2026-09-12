\set ON_ERROR_STOP on

begin;

select plan(8);

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

-- Legacy-Funktion bleibt fuer Dienstmigrationen erhalten, nicht fuer Browser.
set local role service_role;
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

-- Zweimal derselbe Filter im selben Arbeitsbereich legt nichts doppelt an,
-- und die zweite Schwelle 40 muss die erste Schwelle 30 tatsaechlich
-- ueberschreiben - sonst besteht dieser Block bei jedem Verhalten von
-- on conflict, auch bei do nothing.
do $$
declare
  erstes uuid;
  zweites uuid;
  anzahl integer;
  schwelle numeric;
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

  select discount_threshold_percent into schwelle
  from public.sniper_query_subscriptions
  where id = zweites;

  if schwelle <> 40 then
    raise exception 'Erwartet wurde die neue Schwelle 40, gefunden: %', schwelle;
  end if;
end;
$$;

select pass('Derselbe Filter zweimal angelegt bleibt ein Abonnement, die neue Schwelle 40 gilt');

-- Preise werden vor der Schluesselbildung gerundet: 50.567 und 50.566 speichern
-- beide 50.57 und muessen sich eine einzige Abfrage teilen - sonst pollt der
-- Dienst zweimal fuer denselben tatsaechlich gespeicherten Filter.
do $$
declare
  queries integer;
begin
  perform public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000002'::uuid, 'gerundete grenze', null, 50.567, null, 30
  );
  perform public.create_sniper_subscription(
    '85000000-0000-4000-8000-000000000003'::uuid, 'gerundete grenze', null, 50.566, null, 30
  );

  select count(*) into queries
  from public.sniper_queries
  where search_text = 'gerundete grenze';

  if queries <> 1 then
    raise exception '50.567 und 50.566 haben % Abfragen erzeugt statt einer', queries;
  end if;
end;
$$;

select pass('50.567 und 50.566 runden auf denselben Abfrageschluessel');

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
set local role authenticated;
-- Sichtbarkeit unter der echten Nutzerrolle, ohne Service-RLS-Umgehung.
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

-- Unsinnige Preisspannen werden abgelehnt.
set local role service_role;
--
-- Ohne diese Pruefung liesse sich ein Filter "von 50 bis 10" anlegen, der bei
-- Vinted nie etwas finden kann - und ein negativer Preis ebenso. Beides fiel
-- erst bei einer Handprobe in der Schlusspruefung auf; hier steht es fest.
do $$
declare
  verdreht_abgelehnt boolean := false;
  negativ_abgelehnt boolean := false;
begin
  begin
    perform public.create_sniper_subscription(
      '85000000-0000-4000-8000-000000000002'::uuid, 'preisprobe verdreht', null, 50, 10, 30
    );
  exception when others then
    verdreht_abgelehnt := true;
  end;

  begin
    perform public.create_sniper_subscription(
      '85000000-0000-4000-8000-000000000002'::uuid, 'preisprobe negativ', null, -5, 50, 30
    );
  exception when others then
    negativ_abgelehnt := true;
  end;

  if not verdreht_abgelehnt then
    raise exception 'Eine verdrehte Preisspanne (von 50 bis 10) wurde angenommen';
  end if;

  if not negativ_abgelehnt then
    raise exception 'Ein negativer Preis wurde angenommen';
  end if;
end;
$$;

select pass('Verdrehte und negative Preisspannen werden abgelehnt');

-- Die Rechte muessen in jeder Umgebung gleich aussehen.
--
-- `supabase db diff` erzeugt fuer Funktionen nur `revoke ... from public` und
-- laesst rollenbezogene Rechte stehen, die die Vorgaberechte automatisch
-- vergeben. Ohne diese Pruefung faellt eine Abweichung erst auf, wenn jemand
-- die Produktionsdatenbank von Hand ausliest.
do $$
begin
  if has_function_privilege('anon', 'public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric)', 'execute') then
    raise exception 'anon darf create_sniper_subscription nicht ausfuehren';
  end if;

  if has_function_privilege('authenticated', 'public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric)', 'execute') then
    raise exception 'authenticated darf keine zentralen Auftraege ueber die Legacy-Funktion erzeugen';
  end if;
end;
$$;

select pass('Legacy-Schreibweg ist fuer Browser gesperrt');

select * from finish();

rollback;
