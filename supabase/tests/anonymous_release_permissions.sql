\set ON_ERROR_STOP on
begin;
select plan(6);

-- Fängt vererbte Self-Hosting-Rechte ab, die in frischen CLI-Datenbanken fehlen.
select ok(not has_table_privilege('anon', 'public.purchase_lines', 'select'),
  'Anonyme erhalten keinen direkten Zugriff auf Einkaufspositionen');
select ok(not has_function_privilege('anon', 'public.export_audit_snapshot(uuid,jsonb)', 'execute'),
  'Das Prüfarchiv ist nicht anonym aufrufbar');

create table public.release_permission_probe (id bigint);
create sequence public.release_permission_probe_seq;
create function public.release_permission_probe() returns integer
language sql immutable set search_path = '' as $$ select 1 $$;
revoke execute on function public.release_permission_probe() from public;

select ok(not has_table_privilege('anon', 'public.release_permission_probe', 'select'),
  'Neue Tabellen erben keine anonymen Leserechte');
select ok(not has_sequence_privilege('anon', 'public.release_permission_probe_seq', 'usage'),
  'Neue Sequenzen erben keine anonymen Nutzungsrechte');
select ok(not has_function_privilege('anon', 'public.release_permission_probe()', 'execute'),
  'PUBLIC-Entzug reicht ohne versteckte anonyme Standardfreigabe aus');
select ok(has_function_privilege('authenticated', 'public.export_audit_snapshot(uuid,jsonb)', 'execute'),
  'Angemeldete behalten den vorgesehenen RPC-Zugang');

select * from finish();
rollback;
