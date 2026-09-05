\set ON_ERROR_STOP on

begin;

select plan(11);

-- Spalten von beta_applications
do $$
declare
  required_columns text[] := array[
    'id', 'first_name', 'last_name', 'email', 'status', 'granted_days',
    'decision_note', 'decided_by', 'decided_at', 'created_at', 'consent_at'
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

-- RLS ist auf allen drei Tabellen aktiv.
do $$
declare
  ungeschuetzt text[];
begin
  select array_agg(relname order by relname)
  into ungeschuetzt
  from pg_class
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and relname in ('platform_operators', 'beta_applications', 'beta_application_attempts')
    and relrowsecurity = false;

  if ungeschuetzt is not null then
    raise exception 'row level security ist aus auf: %', ungeschuetzt;
  end if;
end;
$$;

select pass('RLS ist auf allen drei Tabellen aktiv');

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
    and table_name in ('platform_operators', 'beta_applications', 'beta_application_attempts')
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

  if rechte is distinct from array['SELECT', 'UPDATE'] then
    raise exception 'authenticated soll auf beta_applications genau SELECT+UPDATE haben, hat: %', rechte;
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

-- Fall 1: Angemeldeter ohne Betreibereintrag sieht keine Bewerbungen, und
-- sein update trifft keine Zeile.
set local role authenticated;
set local request.jwt.claim.sub = :'plain_user_id';

do $$
declare
  betroffen integer;
begin
  if (select count(*) from public.beta_applications) <> 0 then
    raise exception 'Angemeldeter ohne Betreibereintrag darf keine Bewerbung sehen';
  end if;

  update public.beta_applications set decision_note = 'sollte nicht ankommen';
  get diagnostics betroffen = row_count;
  if betroffen <> 0 then
    raise exception 'Angemeldeter ohne Betreibereintrag darf keine Bewerbung aendern, betroffen: %', betroffen;
  end if;
end;
$$;

reset role;

select pass('Ein Angemeldeter ohne Betreibereintrag sieht 0 Bewerbungen, und sein update trifft 0 Zeilen');

-- Fall 2: Angemeldeter mit Betreibereintrag sieht die Bewerbungen, und sein
-- update greift.
set local role authenticated;
set local request.jwt.claim.sub = :'operator_a_id';

do $$
declare
  gesehen integer;
  betroffen integer;
  notiz text;
begin
  select count(*) into gesehen from public.beta_applications;
  if gesehen = 0 then
    raise exception 'Angemeldeter Betreiber haette Bewerbungen sehen muessen';
  end if;

  update public.beta_applications
  set decision_note = 'Betreiber A hat geprueft'
  where email = 'bernd@example.test';
  get diagnostics betroffen = row_count;
  if betroffen <> 1 then
    raise exception 'Betreiber-Update haette genau eine Zeile treffen muessen, betroffen: %', betroffen;
  end if;

  select decision_note into notiz from public.beta_applications where email = 'bernd@example.test';
  if notiz is distinct from 'Betreiber A hat geprueft' then
    raise exception 'Betreiber-Update haette ankommen muessen';
  end if;
end;
$$;

reset role;

select pass('Ein Angemeldeter mit Betreibereintrag sieht die Bewerbung, und sein update greift');

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

select * from finish();

rollback;
