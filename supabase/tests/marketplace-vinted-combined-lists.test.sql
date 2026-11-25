begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('57300000-0000-4000-8000-000000000001','authenticated','authenticated','vinted-combined@example.test','{}','{}');
insert into public.platform_operators(user_id) values ('57300000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values
('57300000-0000-4000-8000-000000000011','Gemeinsames Postfach'),
('57300000-0000-4000-8000-000000000012','Fremder Workspace');
insert into public.workspace_members(workspace_id,user_id,role) values
('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,external_account_id) values
('57300000-0000-4000-8000-000000000021','57300000-0000-4000-8000-000000000011','Konto A','connected','123'),
('57300000-0000-4000-8000-000000000022','57300000-0000-4000-8000-000000000011','Konto B','paused','456'),
('57300000-0000-4000-8000-000000000023','57300000-0000-4000-8000-000000000012','Fremdes Konto','connected','789');

insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,sort_at,body)
select '57300000-0000-4000-8000-000000000011',
  '57300000-0000-4000-8000-000000000021','conversation',n::text,'2026-11-15T10:00:00Z',
  jsonb_build_object('title','Gespräch '||n,'occurredAt','2026-11-15T10:00:00Z','unread',false)
from generate_series(1,51) n;
insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,sort_at,body) values
('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000022','conversation','1','2026-11-01T10:00:00Z','{"title":"Ältere Anfrage","text":"Ist die Jacke noch da?","unread":true,"itemId":"80"}'),
('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000022','publication','80','2026-11-01T10:00:00Z','{"title":"Jacke","publicationState":"active","price":25,"currency":"EUR"}'),
('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000021','publication','80','2026-11-15T10:00:00Z','{"title":"Jacke","publicationState":"active","price":70,"currency":"EUR"}'),
('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000022','publication','81','2026-11-01T10:00:00Z','{"title":"Importierter Entwurf","publicationState":"draft"}'),
('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000022','sale','60','2026-11-20T10:00:00Z','{"title":"Heute versendet","saleState":"shipped","sellerId":"456","itemIds":["90"],"itemCount":1,"externalConversationId":"1","occurredAt":"2026-11-10T10:00:00Z"}'),
('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000021','sale','60','2026-11-15T10:00:00Z','{"title":"Später verkauft","saleState":"sold","sellerId":"123","itemIds":["90"],"itemCount":1,"externalConversationId":"1","occurredAt":"2026-11-15T10:00:00Z"}'),
('57300000-0000-4000-8000-000000000012','57300000-0000-4000-8000-000000000023','conversation','1','2026-11-20T10:00:00Z','{"title":"Fremde Anfrage","unread":true}');

select set_config('request.jwt.claim.sub','57300000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
create function pg_temp.vinted_list(p_kind text,p_cursor text default null,p_query text default '',
  p_filter text default 'all',p_oldest_first boolean default false,p_connection_id uuid default null,p_entry_id uuid default null)
returns jsonb language sql stable as $$
  select public.marketplace_read_vinted_list('57300000-0000-4000-8000-000000000011',
    p_kind,p_cursor,p_query,p_filter,p_oldest_first,p_connection_id,p_entry_id);
$$;

select is((pg_temp.vinted_list('conversation')->>'total')::integer,52,
  'Gemeinsame Liste zählt beide berechtigten Konten, einschließlich gespeicherter Daten bei Pause');
select is(jsonb_array_length(pg_temp.vinted_list('conversation')->'items'),50,
  'Auch bei mehr als 50 Treffern bleibt die erste Seite begrenzt');
select is(jsonb_array_length(pg_temp.vinted_list('conversation',pg_temp.vinted_list('conversation')->>'nextCursor')->'items'),2,
  'Gleiche Sortierzeiten lassen sich ohne Lücken und Dopplungen nachladen');
select is((pg_temp.vinted_list('conversation',p_query=>'ältere')->>'total')::integer,1,
  'Serverseitige Suche findet einen Treffer hinter der ersten Seite');
select is(pg_temp.vinted_list('conversation',p_oldest_first=>true)->'items'->0->>'title','Ältere Anfrage',
  'Älteste zuerst beginnt beim global ältesten Eintrag');
select is((pg_temp.vinted_list('conversation',p_filter=>'questions')->>'total')::integer,1,
  'Fragenfilter und Zähler gelten für die gemeinsame Liste');
select is((pg_temp.vinted_list('conversation',p_filter=>'unread')->'filterCounts'->>'unread')::integer,1,
  'Ungelesen-Zähler enthält auch frühere Seiten');
select is(pg_temp.vinted_list('conversation',p_query=>'ältere')->'items'->0->>'itemPrice','25',
  'Artikelpreis stammt aus dem zugehörigen Konto trotz identischer Anbieterkennung');
select is(pg_temp.vinted_list('sale')->'items'->0->>'title','Heute versendet',
  'Verkaufsliste verwendet den echten Status-Sortierschlüssel');
select is(pg_temp.vinted_list('sale')->'items'->0->>'conversationId',
  pg_temp.vinted_list('conversation',p_query=>'ältere')->'items'->0->>'id',
  'Verkauf verweist auf das zugehörige Konto und Gespräch');
select is((pg_temp.vinted_list('publication')->>'total')::integer,2,
  'Gleichnamige Artikel mit identischer Anbieterkennung bleiben beide sichtbar');
select is((pg_temp.vinted_list('provider_draft')->>'total')::integer,1,
  'Anbieterentwürfe sind von der sichtbaren Publikationsliste getrennt');
select throws_ok(
  $$ select pg_temp.vinted_list('conversation',pg_temp.vinted_list('conversation')->>'nextCursor',p_query=>'ältere') $$,
  '22023','Ungültiger Vinted-Listenzeiger','Cursor gehört zur aktiven Suche');
select throws_ok(
  $$ select pg_temp.vinted_list('conversation',p_connection_id=>'57300000-0000-4000-8000-000000000023') $$,
  '42501','Kontozugriff verweigert','Fremdes Konto ist als Einzelziel gesperrt');
select throws_ok(
  $$ select public.marketplace_read_vinted_list('57300000-0000-4000-8000-000000000012','conversation') $$,
  '42501','Kontozugriff verweigert','Fremder Workspace ist auch ohne Kontoauswahl gesperrt');
reset role;
select * from finish();
rollback;
