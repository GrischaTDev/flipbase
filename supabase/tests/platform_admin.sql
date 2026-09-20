\set ON_ERROR_STOP on

begin;

select plan(19);

-- Spalten von beta_applications
do $$
declare
  required_columns text[] := array[
    'id', 'first_name', 'last_name', 'email', 'status', 'granted_days',
    'decision_note', 'decided_by', 'decided_at', 'created_at', 'consent_at',
    'receipt_email_status', 'receipt_email_sent_at', 'receipt_email_last_error',
    'auth_user_id', 'invitation_status', 'invitation_sent_at',
    'invitation_last_error', 'registered_at'
  ];
  missing_columns text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'beta_applications'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'beta_applications fehlen Spalten: %', missing_columns;
  end if;
end;
$$;

select pass('beta_applications besitzt alle benoetigten Spalten');

-- RLS ist auf allen Tabellen des Betreiberbereichs aktiv.
do $$
declare
  ungeschuetzt text[];
begin
  select array_agg(relname order by relname)
  into ungeschuetzt
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and relname in (
      'platform_operators', 'beta_applications', 'beta_application_attempts',
      'workspace_licenses'
    )
    and relrowsecurity = false;

  if ungeschuetzt is not null then
    raise exception 'row level security ist aus auf: %', ungeschuetzt;
  end if;
end;
$$;

select pass('RLS ist auf allen Tabellen des Betreiberbereichs aktiv');

-- anon haelt auf keiner der drei Tabellen ein Recht.
--
-- Erzeugte Rechte-Anweisungen bilden immer die Maschine ab, auf der sie
-- entstanden sind. Am 04.09.2026 wich die Produktionsdatenbank bei den
-- Sniper-Tabellen genau hier von der lokalen ab.
do $$
declare
  offene text[];
begin
  select array_agg(table_name || '.' || privilege_type order by table_name, privilege_type)
  into offene
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'platform_operators', 'beta_applications', 'beta_application_attempts',
      'workspace_licenses'
    )
    and grantee = 'anon';

  if offene is not null then
    raise exception 'anon haelt noch Rechte: %', offene;
  end if;
end;
$$;

select pass('anon hat auf keiner Tabelle des Betreiberbereichs ein Recht');

-- authenticated darf genau das Noetige - nicht mehr.
do $$
declare
  rechte text[];
begin
  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'beta_applications'
    and grantee = 'authenticated';

  if rechte is distinct from array['SELECT'] then
    raise exception 'authenticated soll auf beta_applications genau SELECT haben, hat: %', rechte;
  end if;

  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'beta_application_attempts'
    and grantee = 'authenticated';

  if rechte is not null then
    raise exception 'authenticated darf die Drosselungstabelle nicht sehen, hat: %', rechte;
  end if;

  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'platform_operators'
    and grantee = 'authenticated';

  if rechte is distinct from array['SELECT'] then
    raise exception 'authenticated soll auf platform_operators genau SELECT haben, hat: %', rechte;
  end if;

  select array_agg(privilege_type order by privilege_type)
  into rechte
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'workspace_licenses'
    and grantee = 'authenticated';

  if rechte is distinct from array['SELECT'] then
    raise exception 'authenticated soll auf workspace_licenses genau SELECT haben, hat: %', rechte;
  end if;
end;
$$;

select pass('authenticated darf lesen und entscheiden, aber nicht drosseln, und auf platform_operators nur lesen');

-- Die Betreiberfunktion laeuft mit security definer.
--
-- Ohne das haengt sie in Policies anderer Tabellen an der eigenen RLS von
-- platform_operators und liefert dort immer falsch.
do $$
begin
  if not exists (
    select 1 from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'is_platform_operator'
      and pg_proc.prosecdef
  ) then
    raise exception 'is_platform_operator muss security definer sein';
  end if;

  if has_function_privilege('anon', 'public.is_platform_operator()', 'execute') then
    raise exception 'anon darf is_platform_operator nicht ausfuehren';
  end if;

  if not has_function_privilege('authenticated', 'public.is_platform_operator()', 'execute') then
    raise exception 'authenticated muss is_platform_operator ausfuehren duerfen';
  end if;

  -- Der Drosselungsriegel gehoert allein dem Dienstschluessel. Waere er
  -- aufrufbar, koennte jeder das Kontingent selbst leerlaufen lassen und damit
  -- echte Bewerbungen aussperren.
  if has_function_privilege(
    'anon', 'public.beta_application_attempt(text, integer, integer)', 'execute'
  ) then
    raise exception 'anon darf den Drosselungsriegel nicht ausfuehren';
  end if;

  if has_function_privilege(
    'authenticated', 'public.beta_application_attempt(text, integer, integer)', 'execute'
  ) then
    raise exception 'authenticated darf den Drosselungsriegel nicht ausfuehren';
  end if;
end;
$$;

select pass('Die Betreiberfunktion ist definer und nur fuer Angemeldete');

-- Dieselbe Adresse bewirbt sich nur einmal.
do $$
begin
  insert into public.beta_applications (first_name, last_name, email)
  values ('Anna', 'Beispiel', 'Anna@Example.test');

  begin
    insert into public.beta_applications (first_name, last_name, email)
    values ('Anna', 'Zweitversuch', 'anna@example.test');
    raise exception 'Die zweite Bewerbung derselben Adresse haette scheitern muessen';
  exception
    when unique_violation then null;
  end;
end;
$$;

select pass('Dieselbe Adresse bewirbt sich nur einmal');

-- Die Entscheidung wird gestempelt, nicht uebermittelt.
do $$
declare
  bewerbung_id uuid;
  gestempelt timestamptz;
begin
  insert into public.beta_applications (first_name, last_name, email)
  values ('Bernd', 'Stempel', 'bernd@example.test')
  returning id into bewerbung_id;

  update public.beta_applications
  set status = 'accepted', granted_days = 180, decided_at = null
  where id = bewerbung_id;

  select decided_at into gestempelt
  from public.beta_applications where id = bewerbung_id;

  if gestempelt is null then
    raise exception 'Der Trigger haette decided_at setzen muessen';
  end if;
end;
$$;

select pass('Entscheidungszeitpunkt wird gestempelt, auch wenn null uebergeben wird');

-- W6: RLS-Verhalten fuer eine echte Rolle, nicht nur fuer postgres.
--
-- Alle bisherigen Einfuegungen liefen als postgres und umgehen RLS damit
-- vollstaendig. Ohne die folgenden Faelle bliebe die Suite gruen, wenn die
-- Policy "Betreiber sehen Bewerbungen" wegfiele oder ihr using versehentlich
-- auf true stuende.
\set plain_user_id '85000000-0000-4000-8000-000000000001'
\set operator_a_id '85000000-0000-4000-8000-000000000002'
\set operator_b_id '85000000-0000-4000-8000-000000000003'

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    :'plain_user_id'::uuid, 'authenticated', 'authenticated',
    'platform-admin-plain@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    :'operator_a_id'::uuid, 'authenticated', 'authenticated',
    'platform-admin-operator-a@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    :'operator_b_id'::uuid, 'authenticated', 'authenticated',
    'platform-admin-operator-b@example.test', 'not-used-by-this-test', '{}'::jsonb,
    '{}'::jsonb, now(), now()
  );

insert into public.platform_operators (user_id, note) values
  (:'operator_a_id'::uuid, 'Testbetreiber A'),
  (:'operator_b_id'::uuid, 'Testbetreiber B');

-- Fall 1: Angemeldeter ohne Betreibereintrag sieht keine Bewerbungen und kann
-- die Entscheidungsfunktion nicht verwenden.
set local role authenticated;
set local request.jwt.claim.sub = :'plain_user_id';

do $$
declare
  application_id uuid;
begin
  if (select count(*) from public.beta_applications) <> 0 then
    raise exception 'Angemeldeter ohne Betreibereintrag darf keine Bewerbung sehen';
  end if;

  select id into application_id
  from public.beta_applications
  where lower(email) = 'anna@example.test';

  begin
    perform public.accept_beta_application(application_id, 60);
    raise exception 'Ein Nicht-Betreiber haette die Bewerbung nicht annehmen duerfen';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select pass('Ein Angemeldeter ohne Betreibereintrag sieht und entscheidet keine Bewerbung');

-- Fall 2: Ein Betreiber sieht und entscheidet Bewerbungen ueber die Funktion.
set local role authenticated;
set local request.jwt.claim.sub = :'operator_a_id';

do $$
declare
  gesehen integer;
  application_id uuid;
  result public.beta_applications;
begin
  select count(*) into gesehen from public.beta_applications;
  if gesehen = 0 then
    raise exception 'Angemeldeter Betreiber haette Bewerbungen sehen muessen';
  end if;

  select id into application_id
  from public.beta_applications
  where lower(email) = 'anna@example.test';

  result := public.accept_beta_application(application_id, 60);
  if result.status is distinct from 'accepted'
     or result.granted_days is distinct from 60
     or result.invitation_status is distinct from 'sending'
     or result.decided_by is distinct from (select auth.uid()) then
    raise exception 'Die Betreiberentscheidung ist unvollstaendig: %', row_to_json(result);
  end if;
end;
$$;

reset role;

select pass('Ein Betreiber sieht und entscheidet Bewerbungen ueber die Funktion');

-- Fall 3: is_platform_operator() liefert fuer beide Rollen den richtigen Wert.
set local role authenticated;
set local request.jwt.claim.sub = :'plain_user_id';

do $$
begin
  if public.is_platform_operator() is distinct from false then
    raise exception 'is_platform_operator() haette fuer einen Nicht-Betreiber falsch liefern muessen';
  end if;
end;
$$;

set local request.jwt.claim.sub = :'operator_a_id';

do $$
begin
  if public.is_platform_operator() is distinct from true then
    raise exception 'is_platform_operator() haette fuer einen Betreiber wahr liefern muessen';
  end if;
end;
$$;

reset role;

select pass('is_platform_operator() liefert fuer beide Rollen den richtigen Wert');

-- Fall 4: Auf platform_operators sieht ein Betreiber genau den eigenen
-- Eintrag, nicht den anderer Betreiber.
set local role authenticated;
set local request.jwt.claim.sub = :'operator_a_id';

do $$
declare
  gesehen integer;
  eigene uuid;
begin
  select count(*) into gesehen from public.platform_operators;
  if gesehen <> 1 then
    raise exception 'Betreiber A haette genau den eigenen Eintrag sehen sollen, gesehen: %', gesehen;
  end if;

  select user_id into eigene from public.platform_operators limit 1;
  if eigene is distinct from '85000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'Betreiber A haette den eigenen Eintrag sehen sollen, nicht: %', eigene;
  end if;
end;
$$;

reset role;

select pass('Auf platform_operators sieht ein Betreiber genau den eigenen Eintrag, nicht die anderen');

-- Der Riegel laesst die erlaubte Zahl durch und weist danach ab.
do $$
declare
  i integer;
  erlaubt boolean;
begin
  for i in 1..3 loop
    erlaubt := public.beta_application_attempt('riegel-a', 3, 100);
    if not erlaubt then
      raise exception 'Versuch % haette durchgehen muessen', i;
    end if;
  end loop;

  erlaubt := public.beta_application_attempt('riegel-a', 3, 100);
  if erlaubt then
    raise exception 'Der vierte Versuch haette abgewiesen werden muessen';
  end if;

  -- Eine andere Herkunft hat ihr eigenes Kontingent.
  erlaubt := public.beta_application_attempt('riegel-b', 3, 100);
  if not erlaubt then
    raise exception 'Eine andere Herkunft haette ihr eigenes Kontingent haben muessen';
  end if;
end;
$$;

select pass('Die Drosselung je Herkunft laesst genau die erlaubte Zahl durch');

-- Die Gesamtgrenze greift auch ueber verschiedene Herkuenfte hinweg.
--
-- Das ist der Teil, der ohne jede Angabe des Aufrufers auskommt: Ein Bot kann
-- den Herkunftskopf frei waehlen, aber nicht an dieser Grenze vorbei.
do $$
declare
  erlaubt boolean;
begin
  delete from public.beta_application_attempts;

  erlaubt := public.beta_application_attempt('gesamt-1', 100, 2);
  if not erlaubt then raise exception 'Erster Versuch haette durchgehen muessen'; end if;

  erlaubt := public.beta_application_attempt('gesamt-2', 100, 2);
  if not erlaubt then raise exception 'Zweiter Versuch haette durchgehen muessen'; end if;

  erlaubt := public.beta_application_attempt('gesamt-3', 100, 2);
  if erlaubt then
    raise exception 'Die Gesamtgrenze haette den dritten Versuch abweisen muessen';
  end if;
end;
$$;

select pass('Die Gesamtgrenze greift ueber verschiedene Herkuenfte hinweg');

-- Alte Zaehlversuche verschwinden beim Aufruf.
--
-- Der Tabellenkommentar verspricht 24 Stunden. Es gibt keinen Scheduler, der
-- das erledigt - dieser Aufruf ist die einzige Gelegenheit dazu, und ohne ihn
-- waere das Versprechen unwahr.
do $$
declare
  uebrig integer;
begin
  delete from public.beta_application_attempts;

  insert into public.beta_application_attempts (origin_hash, created_at)
  values ('uralt', now() - interval '30 hours');

  perform public.beta_application_attempt('frisch', 100, 100);

  select count(*) into uebrig
  from public.beta_application_attempts where origin_hash = 'uralt';

  if uebrig <> 0 then
    raise exception 'Der alte Zaehlversuch haette entfernt werden muessen';
  end if;

  select count(*) into uebrig
  from public.beta_application_attempts where origin_hash = 'frisch';

  if uebrig <> 1 then
    raise exception 'Der frische Zaehlversuch haette stehen bleiben muessen';
  end if;
end;
$$;

select pass('Zaehlversuche aelter als 24 Stunden werden beim Aufruf entfernt');

-- Entscheidungen und Aktivierung laufen nur ueber eng begrenzte Funktionen.
do $$
begin
  if not has_function_privilege(
    'authenticated', 'public.accept_beta_application(uuid, integer)', 'execute'
  ) then
    raise exception 'authenticated muss accept_beta_application ausfuehren duerfen';
  end if;

  if not has_function_privilege(
    'authenticated', 'public.reject_beta_application(uuid)', 'execute'
  ) then
    raise exception 'authenticated muss reject_beta_application ausfuehren duerfen';
  end if;

  if not has_function_privilege(
    'authenticated', 'public.activate_beta_access()', 'execute'
  ) then
    raise exception 'authenticated muss activate_beta_access ausfuehren duerfen';
  end if;

  if has_function_privilege('anon', 'public.activate_beta_access()', 'execute') then
    raise exception 'anon darf activate_beta_access nicht ausfuehren';
  end if;
end;
$$;

select pass('Nur Angemeldete koennen die begrenzten Beta-Funktionen aufrufen');

-- Eine Beta-Einladung verknuepft Bewerbung, Nutzer, Workspace und Lizenz.
\set beta_user_id '85000000-0000-4000-8000-000000000010'
\set beta_application_id '85000000-0000-4000-8000-000000000011'

insert into public.beta_applications (
  id, first_name, last_name, email, status, granted_days
) values (
  :'beta_application_id'::uuid, 'Berta', 'Beta', 'berta@example.test', 'accepted', 60
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  :'beta_user_id'::uuid, 'authenticated', 'authenticated',
  'berta@example.test', 'not-used-by-this-test', '{}'::jsonb,
  jsonb_build_object('beta_application_id', :'beta_application_id'), now(), now()
);

do $$
declare
  linked_user uuid;
  linked_days integer;
  linked_status text;
  setup_completed timestamptz;
begin
  select auth_user_id into linked_user
  from public.beta_applications
  where id = '85000000-0000-4000-8000-000000000011'::uuid;

  if linked_user is distinct from '85000000-0000-4000-8000-000000000010'::uuid then
    raise exception 'Die Bewerbung ist nicht mit dem eingeladenen Nutzer verknuepft';
  end if;

  select license.granted_days, license.status
  into linked_days, linked_status
  from public.workspace_licenses as license
  where license.beta_application_id = '85000000-0000-4000-8000-000000000011'::uuid;

  if linked_days is distinct from 60 or linked_status is distinct from 'pending' then
    raise exception 'Die ausstehende Beta-Lizenz fehlt oder ist falsch: %, %',
      linked_days, linked_status;
  end if;

  select workspace.setup_completed_at
  into setup_completed
  from public.workspaces as workspace
  join public.workspace_members as member on member.workspace_id = workspace.id
  where member.user_id = '85000000-0000-4000-8000-000000000010'::uuid;

  if setup_completed is not null then
    raise exception 'Der automatisch angelegte Beta-Workspace darf noch nicht eingerichtet sein';
  end if;
end;
$$;

select pass('Beta-Einladung verknuepft Bewerbung, Nutzer, Workspace und Lizenz');

-- Die Registrierung startet die Laufzeit genau einmal.
set local role authenticated;
set local request.jwt.claim.sub = :'beta_user_id';

do $$
begin
  begin
    perform public.activate_beta_access();
    raise exception 'Der Einladungslink allein haette die Beta nicht starten duerfen';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"beta_registration_completed": true}'::jsonb
where id = :'beta_user_id'::uuid;

set local role authenticated;
set local request.jwt.claim.sub = :'beta_user_id';

do $$
declare
  first_start timestamptz;
  first_end timestamptz;
  second_start timestamptz;
  second_end timestamptz;
begin
  select starts_at, ends_at
  into first_start, first_end
  from public.activate_beta_access();

  perform pg_sleep(0.01);

  select starts_at, ends_at
  into second_start, second_end
  from public.activate_beta_access();

  if first_start is null or first_end is null then
    raise exception 'Die Beta-Aktivierung hat Start oder Ende nicht gesetzt';
  end if;

  if first_start is distinct from second_start or first_end is distinct from second_end then
    raise exception 'Wiederholte Aktivierung darf die Beta-Laufzeit nicht verschieben';
  end if;

  if first_end is distinct from first_start + interval '60 days' then
    raise exception 'Die Beta-Laufzeit muss exakt 60 Tage betragen';
  end if;
end;
$$;

reset role;

do $$
declare
  registered timestamptz;
begin
  select registered_at into registered
  from public.beta_applications
  where id = '85000000-0000-4000-8000-000000000011'::uuid;

  if registered is null then
    raise exception 'Die Beta-Aktivierung hat die Registrierung nicht gesetzt';
  end if;
end;
$$;

select pass('Beta-Aktivierung setzt die Laufzeit idempotent ab Registrierung');

-- Die Nutzeruebersicht ist kein frei lesbarer Ersatz fuer auth.users.
set local role authenticated;
set local request.jwt.claim.sub = :'plain_user_id';

do $$
begin
  begin
    perform public.list_platform_users();
    raise exception 'Ein Nicht-Betreiber haette die Nutzeruebersicht nicht lesen duerfen';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select pass('Nur Betreiber koennen die Plattformnutzer auflisten');

set local role authenticated;
set local request.jwt.claim.sub = :'operator_a_id';

do $$
declare
  beta_user record;
begin
  select * into beta_user
  from public.list_platform_users()
  where user_id = '85000000-0000-4000-8000-000000000010'::uuid;

  if beta_user.user_id is null
     or beta_user.full_name is distinct from 'Berta Beta'
     or beta_user.email is distinct from 'berta@example.test'
     or beta_user.application_status is distinct from 'accepted'
     or beta_user.invitation_status is distinct from 'not_sent'
     or beta_user.license_status is distinct from 'active'
     or beta_user.beta_starts_at is null
     or beta_user.beta_ends_at is null then
    raise exception 'Die Nutzeruebersicht ist unvollstaendig: %', row_to_json(beta_user);
  end if;
end;
$$;

reset role;

select pass('Betreiber sehen verknuepfte Nutzer, Bewerbung und Beta-Laufzeit');

select * from finish();

rollback;
