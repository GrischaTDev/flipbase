\set ON_ERROR_STOP on
begin;
select no_plan();
select has_table('public', 'sniper_favorites', 'Account-Favoriten haben einen eigenen Speicher');
insert into auth.users(id,email) values
 ('94000000-0000-4000-8000-000000000001','favorite-a@example.test'),
 ('94000000-0000-4000-8000-000000000002','favorite-b@example.test');
insert into public.workspaces(id,name) values
 ('94000000-0000-4000-8000-000000000011','Gemeinsamer Favoritentest'),
 ('94000000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
 ('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001','owner'),
 ('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000002','member'),
 ('94000000-0000-4000-8000-000000000012','94000000-0000-4000-8000-000000000002','owner');
create function pg_temp.favorite_item(p_id text) returns jsonb language sql as $$
 select jsonb_build_object('id','94000000-0000-4000-8000-'||lpad(p_id,12,'0'),
  'title','Vintage Nike Jacke '||p_id,'url','https://www.vinted.de/items/'||p_id||'-jacke',
  'item_price',20,'total_price',22,'currency','EUR','image_urls',jsonb_build_array('https://images1.vinted.net/one.webp'),
  'first_seen_at',now()-interval '40 days','brand','Nike','size','L','condition','Sehr gut',
  'is_hidden',false,'unwanted_field','darf nicht gespeichert werden');
$$;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select ok(public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item('101')), 'Alte Artikel lassen sich unabhängig vom Feed merken');
select is(jsonb_array_length(public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001')->'items'),1,'Favorit bleibt nach sieben und auch nach 30 Tagen sichtbar');
select ok(not ((public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001')->'items'->0) ? 'unwanted_field'),'Import speichert nur erlaubte Artikelmerkmale');
select ok(public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item('101')||'{"item_price":99}'::jsonb),'Erneutes Merken ist idempotent');
select is((public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001')->'items'->0->>'item_price')::numeric,20::numeric,'Eine alte Geräteantwort überschreibt keinen aktiven Schnappschuss');
select throws_ok($$select public.save_sniper_favorite('94000000-0000-4000-8000-000000000012','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item('101'))$$,'42501',null,'Fremder Workspace ist gesperrt');
select throws_ok($$select public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000002',pg_temp.favorite_item('101'))$$,'42501',null,'Ein Accountwechsel während der Anfrage überschreibt keinen anderen Account');
select throws_ok($$select public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item('101')||'{"url":"javascript:alert(1)"}'::jsonb)$$,'22023',null,'Manipulierte Links sind gesperrt');
select throws_ok($$select public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item('101')||'{"item_price":-1}'::jsonb)$$,'22023',null,'Negative Preise sind gesperrt');
select throws_ok($$delete from public.sniper_favorites$$,'42501',null,'Direkte schreibende Tabellenzugriffe sind gesperrt');
reset role;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.sniper_favorites),0::bigint,'Anderes Workspace-Mitglied sieht keine persönlichen Favoriten');
select is(jsonb_array_length(public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000002')->'items'),0,'Auch die RPC trennt Mitglieder desselben Workspace');
select ok(public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000002',pg_temp.favorite_item('101')),'Jeder Account kann denselben Artikel unabhängig merken');
reset role;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select ok(public.remove_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001','101'),'Manuelles Entfernen wird serverseitig bestätigt');
select is(public.import_sniper_favorites('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',jsonb_build_array(pg_temp.favorite_item('101'))),1,'Alter Browserbestand kann erneut eingelesen werden');
select is(jsonb_array_length(public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001')->'items'),0,'Ein Altimport stellt manuell entfernte Favoriten nicht wieder her');
select ok((select snapshot is null and removed_at is not null from public.sniper_favorites),'Beim Entfernen werden die gespeicherten Artikelmerkmale gelöscht');
select ok(public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item('101')),'Bewusstes erneutes Merken bleibt möglich');
select ok(public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item('102')),'Zweiter Favorit gespeichert');
select ok(public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-8000-000000000001',pg_temp.favorite_item('103')),'Dritter Favorit gespeichert');
select is(jsonb_array_length(public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',null,null,1)->'items'),1,'Seitengröße wird eingehalten');
select is((with first as (select public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',null,null,1) p)
 select jsonb_array_length(public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',(p->'next_cursor'->>'time')::timestamptz,(p->'next_cursor'->>'id')::uuid,100)->'items') from first),2,'Cursor findet bei gleichen Zeiten die übrigen Einträge');
select throws_ok($$select public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',now(),null,100)$$,'22023',null,'Unvollständiger Cursor ist gesperrt');
reset role;
insert into public.sniper_queries(id,query_key,brand_id) values ('94000000-0000-4000-8000-000000000050','account-favorite-purge',53);
insert into public.sniper_listings(external_id,title,url,item_price,total_price,discovered_by_query_id,first_seen_at) values
 ('favorite-purge-old','Alt','https://www.vinted.de/items/101-jacke',20,22,'94000000-0000-4000-8000-000000000050',now()-interval '8 days'),
 ('favorite-purge-new','Neu','https://www.vinted.de/items/104-jacke',20,22,'94000000-0000-4000-8000-000000000050',now()-interval '6 days');
select is(public.sniper_purge_expired_listings(1000),1,'Feed löscht nach sieben statt erst nach 30 Tagen');
select is((select count(*) from public.sniper_listings where external_id='favorite-purge-new'),1::bigint,'Jüngere Funde bleiben bestehen');
set local role authenticated;
select is(jsonb_array_length(public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001')->'items'),3,'Feed-Bereinigung löscht keinen Favoriten');
select ok(public.clear_sniper_favorites('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001'),'Eigene Liste kann manuell geleert werden');
reset role;
select is((select count(*) from public.sniper_favorites where user_id='94000000-0000-4000-8000-000000000002' and removed_at is null),1::bigint,'Leeren verändert keine fremden Favoriten');
set local role authenticated;
do $$ begin
 for i in 1000..1500 loop
  perform public.save_sniper_favorite('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001',pg_temp.favorite_item(i::text));
 end loop;
end $$;
select is((select count(*) from public.sniper_favorites where removed_at is null),501::bigint,'Mehr als 500 Favoriten bleiben ohne stille Verdrängung gespeichert');
reset role;
set local role anon;
select throws_ok($$select * from public.sniper_favorites$$,'42501',null,'Anonyme Leser haben keinen Zugriff');
select throws_ok($$select public.sniper_favorites_page('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001')$$,'42501',null,'Anonyme RPC-Aufrufe sind gesperrt');
reset role;
select * from finish();
rollback;
