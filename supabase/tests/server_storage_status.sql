\set ON_ERROR_STOP on
begin;
select plan(18);

-- Isolierter Meldezugang: dieselbe einzige Berechtigung wie bei der Einrichtung.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'flipbase_storage_reporter') then
        create role flipbase_storage_reporter nologin noinherit;
    end if;
end;
$$;
grant usage on schema public to flipbase_storage_reporter;
grant execute on function public.report_server_storage(bigint,bigint,bigint) to flipbase_storage_reporter;

select ok(not has_table_privilege('anon', 'public.server_storage_status', 'select'), 'Anonyme erhalten keine Messwerte');
select ok(not has_table_privilege('authenticated', 'public.server_storage_status', 'insert'), 'Angemeldete dürfen keine Messwerte einfügen');
select ok(not has_table_privilege('authenticated', 'public.server_storage_status', 'update'), 'Angemeldete dürfen keine Messwerte überschreiben');
select ok(not has_table_privilege('authenticated', 'public.server_storage_status', 'delete'), 'Angemeldete dürfen keine Messwerte löschen');
select ok(not has_function_privilege('anon', 'public.report_server_storage(bigint,bigint,bigint)', 'execute'), 'Anonyme dürfen nicht melden');
select ok(not has_function_privilege('authenticated', 'public.report_server_storage(bigint,bigint,bigint)', 'execute'), 'Normale Anmeldung darf nicht melden');
select ok(not has_function_privilege('service_role', 'public.report_server_storage(bigint,bigint,bigint)', 'execute'), 'Allgemeiner Dienstzugang ist kein Meldezugang');
select ok(not has_table_privilege('flipbase_storage_reporter', 'public.server_storage_status', 'select'), 'Melder hat keine Tabellenleserechte');
select ok(not has_table_privilege('flipbase_storage_reporter', 'public.workspaces', 'select'), 'Melder hat keine Kundendatenrechte');

set local role flipbase_storage_reporter;
select public.report_server_storage(100000000000, 40000000000, 55000000000);
select public.report_server_storage(100000000000, 42000000000, 53000000000);
reset role;

select is((select count(*)::int from public.server_storage_status), 1, 'Wiederholte Meldungen erzeugen keine Historie');
select is((select used_bytes from public.server_storage_status), 42000000000::bigint, 'Zweite Meldung ersetzt die erste');
select ok((select reported_at >= transaction_timestamp() from public.server_storage_status), 'Messzeit wird serverseitig gesetzt');
select throws_ok('select public.report_server_storage(100, -1, 20)', '23514', null, 'Negative Werte werden abgewiesen');
select throws_ok('select public.report_server_storage(100, 80, 30)', '23514', null, 'Belegung über Kapazität wird abgewiesen');

set local role authenticated;
set local request.jwt.claim.sub = 'b4100000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.server_storage_status), 0, 'Nichtbetreiber sehen keine Messwerte');
reset role;

-- Der Betreiber wird in einem reinen DB-Test angelegt, keine echte Anmeldung.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('b4100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'storage-operator@example.test', '{}', '{}');
insert into public.platform_operators (user_id) values ('b4100000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = 'b4100000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.server_storage_status), 1, 'Betreiber können den Messwert lesen');
select throws_ok('select public.report_server_storage(100, 40, 55)', '42501', null, 'Auch Betreiber dürfen die Anzeige nicht fälschen');
reset role;

delete from public.platform_operators where user_id = 'b4100000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::int from public.server_storage_status), 0, 'Entzogene Betreiberrechte wirken sofort');
reset role;
select * from finish();
rollback;
