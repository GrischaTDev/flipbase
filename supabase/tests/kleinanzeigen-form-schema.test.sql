\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
select has_table('public','kleinanzeigen_connections','Kleinanzeigen-Konten existieren getrennt von Vinted');
select has_table('public','kleinanzeigen_local_grants','Installationsfreigaben sind getrennt gespeichert');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
('50300000-0000-4000-8000-000000000001','authenticated','authenticated','ka-a@example.test','{}','{}'),
('50300000-0000-4000-8000-000000000002','authenticated','authenticated','ka-b@example.test','{}','{}');
insert into public.platform_operators(user_id) values('50300000-0000-4000-8000-000000000001'),('50300000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values('50300000-0000-4000-8000-000000000011','Kleinanzeigen A'),('50300000-0000-4000-8000-000000000012','Kleinanzeigen B');
insert into public.workspace_members(workspace_id,user_id,role) values('50300000-0000-4000-8000-000000000011','50300000-0000-4000-8000-000000000001','owner');

insert into public.kleinanzeigen_connections(workspace_id,external_account_id,display_name,account_type,status,created_by) values('50300000-0000-4000-8000-000000000011','123','Formularkonto','private','connected','50300000-0000-4000-8000-000000000001');
insert into public.kleinanzeigen_local_grants(workspace_id,connection_id,approved_by,installation_id,token_hash,grant_generation,expires_at) select workspace_id,id,created_by,'50300000-0000-4000-8000-000000000031',repeat('a',64),2,clock_timestamp()+interval '1 hour' from public.kleinanzeigen_connections where external_account_id='123';
create function pg_temp.store_schema(p_hash text default repeat('a',64),p_generation bigint default 2,p_account text default '123',p_observed timestamptz default clock_timestamp()) returns jsonb language sql as $$ select public.kleinanzeigen_store_form_schema('50300000-0000-4000-8000-000000000011',(select id from public.kleinanzeigen_connections where external_account_id='123'),p_hash,p_generation,p_account,'{"categoryPath":"153/160/shirts","categoryLabel":"Shirts","titleMax":65,"descriptionMax":4000,"photoCountMax":20,"photoBytesMax":12582912,"priceStepCents":100,"fields":[],"shipping":{"defaultGroup":null,"defaultMethods":[],"groups":[]}}',p_observed); $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select pg_temp.store_schema()$$,'42501',null,'Frontend darf keinen Anbieterbeleg erfinden');
reset role;set local role service_role;
select lives_ok($$select pg_temp.store_schema()$$,'Geprüfte Installation bestätigt ein frisches Formular');
select is(pg_temp.store_schema()->>'schemaRevision',pg_temp.store_schema()->>'schemaRevision','Gleicher Formularinhalt hat stabile Revision');
select throws_ok($$select pg_temp.store_schema(repeat('b',64))$$,'42501',null,'Fremdes Secret wird abgelehnt');
select throws_ok($$select pg_temp.store_schema(p_generation=>1)$$,'42501',null,'Alte Freigabegeneration wird abgelehnt');
select throws_ok($$select pg_temp.store_schema(p_account=>'124')$$,'42501',null,'Falsches Anbieterkonto wird abgelehnt');
select throws_ok($$select pg_temp.store_schema(p_observed=>clock_timestamp()-interval '2 minutes')$$,'22023',null,'Veraltete Beobachtung darf nicht als frisch gelten');
select throws_ok($$select pg_temp.store_schema(p_observed=>clock_timestamp()+interval '1 minute')$$,'22023',null,'Zukünftige Beobachtung wird abgelehnt');
reset role;set local role authenticated;
select is((select count(*)::integer from public.kleinanzeigen_form_schemas),1,'Eigenes aktuelles Formular ist lesbar');
select throws_ok($$update public.kleinanzeigen_form_schemas set observed_at=clock_timestamp()$$,'42501',null,'Nutzer darf Formularbeleg nicht verlängern');
select set_config('request.jwt.claims','{"sub":"50300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.kleinanzeigen_form_schemas),0,'Fremder Nutzer sieht keine Formulare');
reset role;
update public.kleinanzeigen_local_grants set revoked_at=clock_timestamp() where workspace_id='50300000-0000-4000-8000-000000000011';set local role service_role;
select throws_ok($$select pg_temp.store_schema()$$,'42501',null,'Widerruf verhindert weitere Bestätigung');
reset role;select ok(not has_table_privilege('anon','public.kleinanzeigen_form_schemas','select'),'Kein anonymer Lesezugriff');select * from finish();rollback;
