\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
('98000000-0000-4000-8000-000000000001', 'security-a@example.test'),
('98000000-0000-4000-8000-000000000002', 'security-b@example.test');
insert into public.workspaces(id, name) values
('98000000-0000-4000-8000-000000000003', 'Security A'),
('98000000-0000-4000-8000-000000000004', 'Security B');
insert into public.workspace_members(workspace_id, user_id, role) values
('98000000-0000-4000-8000-000000000003', '98000000-0000-4000-8000-000000000001', 'owner'),
('98000000-0000-4000-8000-000000000004', '98000000-0000-4000-8000-000000000002', 'owner');
insert into public.purchases(id, workspace_id, type, title) values
('98000000-0000-4000-8000-000000000010', '98000000-0000-4000-8000-000000000003', 'lot', 'Own'),
('98000000-0000-4000-8000-000000000011', '98000000-0000-4000-8000-000000000004', 'lot', 'Foreign');

select throws_ok($$insert into public.inventory_items(workspace_id,purchase_id,title) values
('98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000011','Wrong')$$,'23503',null,'Fremder Einkauf beim Einfügen abgewiesen');
insert into public.inventory_items(id,workspace_id,purchase_id,title) values
('98000000-0000-4000-8000-000000000020','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000010','Own'),
('98000000-0000-4000-8000-000000000021','98000000-0000-4000-8000-000000000004',null,'Foreign');
select throws_ok($$update public.inventory_items set purchase_id='98000000-0000-4000-8000-000000000011' where id='98000000-0000-4000-8000-000000000020'$$,'23503',null,'Fremder Einkauf beim Ändern abgewiesen');
select throws_ok($$delete from public.purchases where id='98000000-0000-4000-8000-000000000010'$$,'23503',null,'Eigener referenzierter Einkauf bleibt geschützt');

select throws_ok($$insert into public.market_research(workspace_id,inventory_item_id,query) values ('98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000021','wrong')$$,'23503',null,'Fremder Rechercheartikel abgewiesen');
select throws_ok($$insert into public.activity_logs(workspace_id,inventory_item_id,action) values ('98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000021','wrong')$$,'23503',null,'Fremder Protokollartikel abgewiesen');
select throws_ok($$insert into public.price_tracked_items(workspace_id,inventory_item_id,title) values ('98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000021','wrong')$$,'23503',null,'Fremder Preisvergleichsartikel abgewiesen');
insert into public.market_research(id,workspace_id,inventory_item_id,query) values ('98000000-0000-4000-8000-000000000030','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000020','own');
insert into public.activity_logs(id,workspace_id,inventory_item_id,action) values ('98000000-0000-4000-8000-000000000031','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000020','own');
insert into public.price_tracked_items(id,workspace_id,inventory_item_id,title) values ('98000000-0000-4000-8000-000000000032','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000020','own');
select throws_ok($$update public.market_research set inventory_item_id='98000000-0000-4000-8000-000000000021' where id='98000000-0000-4000-8000-000000000030'$$,'23503',null,'Fremder Rechercheartikel beim Ändern abgewiesen');
select throws_ok($$update public.activity_logs set inventory_item_id='98000000-0000-4000-8000-000000000021' where id='98000000-0000-4000-8000-000000000031'$$,'23503',null,'Fremder Protokollartikel beim Ändern abgewiesen');
select throws_ok($$update public.price_tracked_items set inventory_item_id='98000000-0000-4000-8000-000000000021' where id='98000000-0000-4000-8000-000000000032'$$,'23503',null,'Fremder Preisvergleichsartikel beim Ändern abgewiesen');
delete from public.inventory_items where id='98000000-0000-4000-8000-000000000020';
select is((select inventory_item_id from public.market_research where id='98000000-0000-4000-8000-000000000030'),null::uuid,'Recherche bleibt ohne gelöschten Artikel erhalten');
select is((select inventory_item_id from public.price_tracked_items where id='98000000-0000-4000-8000-000000000032'),null::uuid,'Preisvergleich bleibt ohne gelöschten Artikel erhalten');
select is((select count(*) from public.activity_logs where id='98000000-0000-4000-8000-000000000031'),0::bigint,'Artikelprotokoll wird weiterhin mitgelöscht');

insert into public.sales(id,workspace_id,platform) values
('98000000-0000-4000-8000-000000000040','98000000-0000-4000-8000-000000000003','vinted'),
('98000000-0000-4000-8000-000000000041','98000000-0000-4000-8000-000000000004','vinted');
select throws_ok($$insert into public.shipping_orders(workspace_id,sale_id,order_number,platform,item_title,package_type) values ('98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000041','wrong','vinted','Wrong','paket')$$,'23503',null,'Fremder Versandverkauf abgewiesen');
insert into public.shipping_orders(id,workspace_id,sale_id,order_number,platform,item_title,package_type) values ('98000000-0000-4000-8000-000000000042','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000040','own','vinted','Own','paket');
select throws_ok($$update public.shipping_orders set sale_id='98000000-0000-4000-8000-000000000041' where id='98000000-0000-4000-8000-000000000042'$$,'23503',null,'Fremder Versandverkauf beim Ändern abgewiesen');
select throws_ok($$delete from public.sales where id='98000000-0000-4000-8000-000000000040'$$,'23503',null,'Eigener referenzierter Verkauf bleibt geschützt');

insert into public.sniper_watchlists(workspace_id,title) select '98000000-0000-4000-8000-000000000003'::uuid,'Active '||number from generate_series(1,25) as number;
select throws_ok($$insert into public.sniper_watchlists(workspace_id,title) values ('98000000-0000-4000-8000-000000000003','Too many active')$$,'54000',null,'26. aktiver Merkzettel abgewiesen');
insert into public.sniper_watchlists(workspace_id,title,is_active) select '98000000-0000-4000-8000-000000000003'::uuid,'Inactive '||number,false from generate_series(1,75) as number;
select throws_ok($$insert into public.sniper_watchlists(workspace_id,title,is_active) values ('98000000-0000-4000-8000-000000000003','Too many total',false)$$,'54000',null,'101. Merkzettel abgewiesen');
select throws_ok($$update public.sniper_watchlists set is_active=true where title='Inactive 1'$$,'54000',null,'Reaktivierung hält das aktive Kontingent ein');
select lives_ok($$update public.sniper_watchlists set title='Edited' where title='Active 1'$$,'Bearbeiten am Kontingent bleibt möglich');
select lives_ok($$update public.sniper_watchlists set is_active=false where title='Edited'$$,'Deaktivieren am Kontingent bleibt möglich');
select lives_ok($$update public.sniper_watchlists set is_active=true where title='Inactive 1'$$,'Freier aktiver Platz kann neu belegt werden');
select lives_ok($$insert into public.sniper_watchlists(workspace_id,title) values ('98000000-0000-4000-8000-000000000004','Other workspace')$$,'Kontingente sind pro Arbeitsbereich');
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.save_sniper_watchlist('98000000-0000-4000-8000-000000000003',null,'RPC bypass',null,null,null,null,null,null,40,false)$$,'54000',null,'Authentifizierte RPC kann das Gesamtkontingent nicht umgehen');
reset role;

insert into public.beta_discord_links(auth_user_id,discord_user_id,role_assigned_at) values ('98000000-0000-4000-8000-000000000001','discord-a',null);
select is((select role_assigned_at from public.beta_discord_links where discord_user_id='discord-a'),null::timestamptz,'Reservierung behauptet keine erfolgreiche Rollenvergabe');
select throws_ok($$insert into public.beta_discord_links(auth_user_id,discord_user_id) values ('98000000-0000-4000-8000-000000000001','discord-b')$$,'23505',null,'Ein Nutzer kann kein zweites Discord-Konto reservieren');
select throws_ok($$insert into public.beta_discord_links(auth_user_id,discord_user_id) values ('98000000-0000-4000-8000-000000000002','discord-a')$$,'23505',null,'Zwei Nutzer können dasselbe Discord-Konto nicht reservieren');
select * from finish();
rollback;
