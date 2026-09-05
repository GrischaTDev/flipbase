\set ON_ERROR_STOP on

begin;

select plan(7);

-- Spalten von beta_applications
do $$
declare
  required_columns text[] := array[
    'id', 'first_name', 'last_name', 'email', 'status', 'granted_days',
    'decision_note', 'decided_by', 'decided_at', 'created_at'
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
end;
$$;

select pass('authenticated darf lesen und entscheiden, aber nicht drosseln');

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

select * from finish();

rollback;
