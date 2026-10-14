\set ON_ERROR_STOP on
begin;
set local search_path = public, extensions;
select no_plan();
select ok(not has_function_privilege('anon','public.marketplace_remove_duplicate_system_messages()','execute'),'Die Bereinigung ist nicht anonym aufrufbar');
select ok(not has_function_privilege('authenticated','public.marketplace_remove_duplicate_system_messages()','execute'),'Die Bereinigung ist kein Browser-RPC');
select ok(has_function_privilege('service_role','public.marketplace_remove_duplicate_system_messages()','execute'),'Serverimporte dürfen die Bereinigung ausführen');

insert into public.workspaces(id,name) values
 ('48000000-0000-4000-8000-000000000001','Systemmeldungen');
insert into public.marketplace_connections(id,workspace_id,display_name,marketplace) values
 ('48000000-0000-4000-8000-000000000002','48000000-0000-4000-8000-000000000001','Vinted','vinted'),
 ('48000000-0000-4000-8000-000000000003','48000000-0000-4000-8000-000000000001','Weiteres Konto','vinted'),
 ('48000000-0000-4000-8000-000000000004','48000000-0000-4000-8000-000000000001','eBay','ebay');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values
 ('48000000-0000-4000-8000-000000000011','48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002','conversation','51','{}'),
 ('48000000-0000-4000-8000-000000000012','48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000003','conversation','51','{}'),
 ('48000000-0000-4000-8000-000000000013','48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000004','conversation','51','{}'),
 ('48000000-0000-4000-8000-000000000014','48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000002','conversation','52','{}');

create function pg_temp.message(p_suffix text,p_title text,p_type text default 'action_message',p_time timestamptz default '2026-10-11T12:48:44Z',p_parent uuid default '48000000-0000-4000-8000-000000000011',p_connection uuid default '48000000-0000-4000-8000-000000000002',p_extra jsonb default '{}',p_observed timestamptz default '2026-10-14T08:00:00Z') returns void language sql as $$
 insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
 values('48000000-0000-4000-8000-000000000001',p_connection,'message',case when p_suffix ~ '^[0-9]+$' then p_suffix else 'event:'||md5(p_suffix)||md5(p_suffix) end,p_parent,
 jsonb_build_object('title',p_title,'text',p_title,'messageType',p_type,'occurredAt',p_time)||p_extra,p_time,p_observed);
$$;

select pg_temp.message('first','Die Bestellung wurde abgeschlossen!');
select pg_temp.message('second','Die Bestellung wurde abgeschlossen!');
select is((select count(*)::int from public.marketplace_account_entries where kind='message'),1,'Ein erneut belegter Status ersetzt alte Hash-Dubletten');
select is((select count(*)::int from public.marketplace_account_entries where kind='message' and external_id='event:'||md5('second')||md5('second')),1,'Der neue belegte Stand bleibt erhalten');

select pg_temp.message('later','Die Bestellung wurde abgeschlossen!','action_message','2026-10-11T12:48:45Z');
select pg_temp.message('61','Die Bestellung wurde abgeschlossen!','message');
select pg_temp.message('62','Die Bestellung wurde abgeschlossen!','message');
select pg_temp.message('different','Anderer Status');
select pg_temp.message('account','Die Bestellung wurde abgeschlossen!','action_message','2026-10-11T12:48:44Z','48000000-0000-4000-8000-000000000012','48000000-0000-4000-8000-000000000003');
select pg_temp.message('conversation','Die Bestellung wurde abgeschlossen!','action_message','2026-10-11T12:48:44Z','48000000-0000-4000-8000-000000000014');
select is((select count(*)::int from public.marketplace_account_entries where kind='message'),7,'Andere Zeiten, Inhalte, echte Nachrichten, Konten und Gespräche bleiben erhalten');

select pg_temp.message('delivery-old','Sendung zugestellt');
select pg_temp.message('delivery-current','Geliefert','status_message');
select is((select count(*)::int from public.marketplace_account_entries where kind='message' and body->>'title' in ('Geliefert','Sendung zugestellt')),1,'Der aktuelle Lieferstatus ersetzt die gleichzeitige alte Zustellmeldung');
select is((select count(*)::int from public.marketplace_account_entries where kind='message' and body->>'title'='Die Bestellung wurde abgeschlossen!'),6,'Teilimporte entfernen keine anderen fehlenden Ereignisse');

select pg_temp.message('ebay-first','eBay-Status','action_message','2026-10-11T12:48:44Z','48000000-0000-4000-8000-000000000013','48000000-0000-4000-8000-000000000004');
select pg_temp.message('ebay-second','eBay-Status','action_message','2026-10-11T12:48:44Z','48000000-0000-4000-8000-000000000013','48000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.marketplace_account_entries where connection_id='48000000-0000-4000-8000-000000000004' and kind='message'),2,'Andere Marktplätze werden nicht verändert');

select pg_temp.message('purchase-first','Kauf','purchase');
select pg_temp.message('purchase-second','Kauf','purchase');
select is((select count(*)::int from public.marketplace_account_entries where body->>'messageType'='purchase'),2,'Technische Kaufbelege bleiben von der Systembereinigung ausgenommen');

select pg_temp.message('event-one','Status','status_message',p_extra=>'{"eventType":"one"}');
select pg_temp.message('event-two','Status','status_message',p_extra=>'{"eventType":"two"}');
select is((select count(*)::int from public.marketplace_account_entries where body->>'title'='Status'),2,'Verschiedene belegte Ereignistypen bleiben getrennt');
select pg_temp.message('inbound','Bewertung abgegeben!','status_message',p_extra=>'{"direction":"inbound"}');
select pg_temp.message('outbound','Bewertung abgegeben!','status_message',p_extra=>'{"direction":"outbound"}');
select is((select count(*)::int from public.marketplace_account_entries where body->>'title'='Bewertung abgegeben!'),2,'Gleichzeitige Rückmeldungen verschiedener Seiten bleiben getrennt');
select pg_temp.message('newest','Aktueller Status',p_observed=>'2026-10-14T09:00:00Z');
select pg_temp.message('stale','Aktueller Status',p_observed=>'2026-10-14T08:00:00Z');
select is((select count(*)::int from public.marketplace_account_entries where body->>'title'='Aktueller Status'),2,'Ein alter Eingang darf keinen neueren Beleg entfernen');
update public.marketplace_account_entries set observed_at='2026-10-14T10:00:00Z' where external_id='event:'||md5('newest')||md5('newest');
select is((select count(*)::int from public.marketplace_account_entries where body->>'title'='Aktueller Status'),1,'Auch ein erneuter Upsert beseitigt gleichartige alte Dubletten');

select * from finish();
rollback;
