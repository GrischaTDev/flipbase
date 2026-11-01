\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
 values('49300000-0000-4000-8000-000000000001','authenticated','authenticated','ka-auto@example.test','{}','{}');
insert into public.platform_operators(user_id) values('49300000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('49300000-0000-4000-8000-000000000011','Kleinanzeigen Automatik');
insert into public.workspace_members(workspace_id,user_id,role)
 values('49300000-0000-4000-8000-000000000011','49300000-0000-4000-8000-000000000001','owner');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"49300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.kleinanzeigen_connect_account('49300000-0000-4000-8000-000000000011','123','Privat','private',
 '49300000-0000-4000-8000-000000000031',repeat('a',64),false);
reset role;
create function pg_temp.maintain_ka(p_identity text default '123',p_hash text default repeat('a',64),p_generation bigint default 1)
returns jsonb language sql as $$
 select public.kleinanzeigen_maintain_connection('49300000-0000-4000-8000-000000000011',
  (select id from public.kleinanzeigen_connections where workspace_id='49300000-0000-4000-8000-000000000011'),p_hash,p_generation,p_identity);
$$;
set local role service_role;
select throws_ok($$select pg_temp.maintain_ka('999')$$,'42501',null,'Kontowechsel verlängert keine Freigabe');
select throws_ok($$select pg_temp.maintain_ka('123',repeat('b',64))$$,'42501',null,'Fremdes Secret gesperrt');
select throws_ok($$select pg_temp.maintain_ka('123',repeat('a',64),2)$$,'42501',null,'Fremde Generation gesperrt');
select is(pg_temp.maintain_ka()->'session'->>'externalAccountId','123','Aktuelle Installation wird erneuert');
select ok((pg_temp.maintain_ka()->'session'->>'expiresAt')::timestamptz>now()+interval '29 days','Freigabe übersteht längere Browserpausen');
select is(pg_temp.maintain_ka()->'session'->>'generation','1','Erneuerung ändert keine Auftragsgeneration');
select is(pg_temp.maintain_ka()->'session'->>'canPublish','false','Lesefreigabe erhält kein Veröffentlichungsrecht');
select is(pg_temp.maintain_ka()->'run'->>'state','queued','Fälliger Abgleich wird eingeplant');
select is((select count(*)::integer from public.kleinanzeigen_sync_runs where workspace_id='49300000-0000-4000-8000-000000000011'),1,'Wiederholung erzeugt keinen parallelen Abgleich');
select is((select requested_by from public.kleinanzeigen_sync_runs where workspace_id='49300000-0000-4000-8000-000000000011'),
 '49300000-0000-4000-8000-000000000001'::uuid,'Abgleich behält den ursprünglichen Freigebenden');
reset role;
update public.kleinanzeigen_connections set last_synced_at=clock_timestamp() where workspace_id='49300000-0000-4000-8000-000000000011';
set local role service_role;
select is(pg_temp.maintain_ka()->'run','null'::jsonb,'Frischer Bestand wird nicht erneut abgerufen');
reset role;
update public.kleinanzeigen_local_grants set expires_at=now()-interval '1 minute' where workspace_id='49300000-0000-4000-8000-000000000011';
set local role service_role;
select throws_ok($$select pg_temp.maintain_ka()$$,'42501',null,'Abgelaufene Freigabe wird nicht wiederbelebt');
reset role;
update public.kleinanzeigen_local_grants set expires_at=now()+interval '1 day',revoked_at=now() where workspace_id='49300000-0000-4000-8000-000000000011';
set local role service_role;
select throws_ok($$select pg_temp.maintain_ka()$$,'42501',null,'Widerrufene Freigabe wird nicht erneuert');
reset role;
update public.kleinanzeigen_local_grants set revoked_at=null where workspace_id='49300000-0000-4000-8000-000000000011';
delete from public.workspace_members where workspace_id='49300000-0000-4000-8000-000000000011';
set local role service_role;
select throws_ok($$select pg_temp.maintain_ka()$$,'42501',null,'Entfernte Mitgliedschaft stoppt automatische Erneuerung');
reset role;
select ok(not has_function_privilege('authenticated','public.kleinanzeigen_maintain_connection(uuid,bigint,text,bigint,text)','execute'),'Normale Anmeldung kann keine Installation verlängern');
select ok(not has_function_privilege('anon','public.kleinanzeigen_maintain_connection(uuid,bigint,text,bigint,text)','execute'),'Anonyme können keine Installation verlängern');
select * from finish();
rollback;
