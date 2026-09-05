\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select has_column('public','inventory_items','archived_at','Archivzeit ist eigene Metadaten');
select has_function('public','set_inventory_item_archived',array['uuid','uuid','boolean'],'Geschützte Archivaktion existiert');
select ok(not has_function_privilege('anon','public.set_inventory_item_archived(uuid,uuid,boolean)','execute'),'Anonym keine Archiv-RPC');
insert into auth.users(id,aud,role,email) values
('97000000-0000-4000-8000-000000000001','authenticated','authenticated','archive-owner@example.test'),
('97000000-0000-4000-8000-000000000002','authenticated','authenticated','archive-member@example.test'),
('97000000-0000-4000-8000-000000000003','authenticated','authenticated','archive-other@example.test');
insert into public.workspaces(id,name) values ('97000000-0000-4000-8000-000000000010','Archiv');
insert into public.workspace_members(workspace_id,user_id,role) values
('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000001','owner'),
('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000002','member');
select set_config('flipbase.allow_inventory_sold_transition','on',true);
insert into public.purchases(id,workspace_id,type,title,entry_status,finalized_at,finalized_by) values
('97000000-0000-4000-8000-000000000025','97000000-0000-4000-8000-000000000010','single','Abgeschlossener Einkauf','finalized',now(),'97000000-0000-4000-8000-000000000001');
insert into public.inventory_items(id,workspace_id,title,status,allocated_purchase_cost) values
('97000000-0000-4000-8000-000000000020','97000000-0000-4000-8000-000000000010','Verkauft','sold',12),
('97000000-0000-4000-8000-000000000021','97000000-0000-4000-8000-000000000010','Bestand','ready',5),
('97000000-0000-4000-8000-000000000022','97000000-0000-4000-8000-000000000010','Ungeklärt','sold',5);
update public.inventory_items set purchase_id='97000000-0000-4000-8000-000000000025' where id='97000000-0000-4000-8000-000000000020';
insert into public.sales(id,workspace_id,inventory_item_id,platform,sale_price) values
('97000000-0000-4000-8000-000000000030','97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000020','ebay',25);
insert into public.sale_lines(workspace_id,sale_id,inventory_item_id,title_snapshot,quantity,unit_sale_price,line_total,cost_of_goods_sold,tax_mode) values
('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000030','97000000-0000-4000-8000-000000000020','Verkauft',1,25,25,12,'diff_25a');
create temporary table before_item as select to_jsonb(i)-'archived_at'-'archived_by' as data from public.inventory_items i where id='97000000-0000-4000-8000-000000000020';
create temporary table before_sale as select to_jsonb(s) as data from public.sales s where id='97000000-0000-4000-8000-000000000030';
create temporary table before_line as select to_jsonb(s) as data from public.sale_lines s where sale_id='97000000-0000-4000-8000-000000000030';
create function pg_temp.archive(p_item uuid default '97000000-0000-4000-8000-000000000020',p_value boolean default true) returns void language sql as $$
select public.set_inventory_item_archived('97000000-0000-4000-8000-000000000010',p_item,p_value);
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000002',true);
select throws_ok($$update public.inventory_items set title='Umbenannt' where id='97000000-0000-4000-8000-000000000020'$$,'42501',null,'Finalisierungswächter bleibt wirksam');
select throws_ok($$select pg_temp.archive('97000000-0000-4000-8000-000000000099')$$,'42501',null,'Unbekannter Artikel ist kein erlaubtes Archivziel');
select throws_ok($$select pg_temp.archive(p_value=>null)$$,'22023',null,'Fehlende Aktion gesperrt');
select throws_ok($$update public.inventory_items set archived_at=now(),archived_by='97000000-0000-4000-8000-000000000001' where id='97000000-0000-4000-8000-000000000021'$$,'42501',null,'Direkte Archivfälschung gesperrt');
select throws_ok($$insert into public.inventory_items(workspace_id,title,archived_at) values('97000000-0000-4000-8000-000000000010','Fälschung',now())$$,'42501',null,'Auch Insert-Fälschung gesperrt');
select throws_ok($$select pg_temp.archive('97000000-0000-4000-8000-000000000021')$$,'22023',null,'Aktiver Bestand wird nicht archiviert');
select throws_ok($$select pg_temp.archive('97000000-0000-4000-8000-000000000022')$$,'22023',null,'Ungeklärter Verkauf wird nicht archiviert');
select lives_ok($$select pg_temp.archive()$$,'Mitglied archiviert bestätigten Einzelverkauf');
select is((select status from public.inventory_items where id='97000000-0000-4000-8000-000000000020'),'sold','Verkaufsstatus bleibt sold');
select is((select archived_by from public.inventory_items where id='97000000-0000-4000-8000-000000000020'),'97000000-0000-4000-8000-000000000002'::uuid,'Server verwendet angemeldeten Autor');
select lives_ok($$select pg_temp.archive()$$,'Doppeltes Archivieren ist idempotent');
reset role;
select is((select count(*)::int from public.business_events where entity_id='97000000-0000-4000-8000-000000000020' and event_type='inventory_item_archived'),1,'Genau ein Archivereignis');
select is((select to_jsonb(i)-'archived_at'-'archived_by' from public.inventory_items i where id='97000000-0000-4000-8000-000000000020'),(select data from before_item),'Alle übrigen Artikelfelder unverändert');
set local role authenticated;
select lives_ok($$select pg_temp.archive(p_value=>false)$$,'Mitglied holt Artikel aus Archiv');
select ok((select archived_at is null and archived_by is null from public.inventory_items where id='97000000-0000-4000-8000-000000000020'),'Wiederherstellung löscht nur Archivmetadaten');
select lives_ok($$select pg_temp.archive(p_value=>false)$$,'Doppelte Wiederherstellung idempotent');
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000003',true);
select throws_ok($$select pg_temp.archive()$$,'42501',null,'Fremder Benutzer gesperrt');
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
select public.archive_workspace('97000000-0000-4000-8000-000000000010');
select throws_ok($$select pg_temp.archive()$$,'55000',null,'Archivierter Workspace sperrt Aktion');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select pg_temp.archive()$$,'42501',null,'Anonym gesperrt');
reset role;
select is((select to_jsonb(i)-'archived_at'-'archived_by' from public.inventory_items i where id='97000000-0000-4000-8000-000000000020'),(select data from before_item),'Wiederherstellung bewahrt alle Artikelfelder');
select is((select to_jsonb(s) from public.sales s where id='97000000-0000-4000-8000-000000000030'),(select data from before_sale),'Verkaufsbuchung bleibt unverändert');
select is((select to_jsonb(s) from public.sale_lines s where sale_id='97000000-0000-4000-8000-000000000030'),(select data from before_line),'Verkaufsposition und Kosten bleiben unverändert');
select is((select count(*)::int from public.business_events where entity_id='97000000-0000-4000-8000-000000000020' and event_type='inventory_item_restored'),1,'Genau ein Wiederherstellungsereignis');
select * from finish();
rollback;
