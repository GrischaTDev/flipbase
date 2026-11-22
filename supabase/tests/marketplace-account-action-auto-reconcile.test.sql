\set ON_ERROR_STOP on
begin;
set local search_path=public,extensions;
select no_plan();
-- Ungeklärte Schreibaktionen sollen sich selbst klären, statt spätere Aufträge desselben Inserats dauerhaft zu sperren.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('58000000-0000-4000-8000-000000000001','authenticated','authenticated','auto-reconcile@example.test','{}','{}');
insert into public.platform_operators(user_id) values('58000000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values('58000000-0000-4000-8000-000000000011','Automatische Klärung');
insert into public.workspace_members(workspace_id,user_id,role) values('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000001','owner');
insert into public.marketplace_connections(id,workspace_id,display_name,status,execution_mode,external_account_id) values
 ('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000011','Klärung','connected','cloud','5801');
insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values
 ('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','auto-reconcile-profile');
insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body,observed_at) values
 ('58000000-0000-4000-8000-000000000031','58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','publication','58011',
  '{"title":"Trainingsjacke","price":10}',clock_timestamp()-interval '1 hour');
create temporary table reconcile_context(name text primary key,body jsonb);
grant all on reconcile_context to authenticated,service_role;
create function pg_temp.enqueue_price(p_expected integer,p_target integer) returns jsonb language sql as $$
  select public.marketplace_account_action_enqueue('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021',gen_random_uuid(),'price_save',
    jsonb_build_object('entryId','58000000-0000-4000-8000-000000000031','expectedPriceCents',p_expected,'priceCents',p_target))->'action';
$$;
create function pg_temp.claim() returns jsonb language sql as $$
  select public.marketplace_browser_work_claim('58000000-0000-4000-8000-000000000041',1,gen_random_uuid(),true)->'claim';
$$;
create function pg_temp.finish(p_name text,p_state text,p_result jsonb) returns boolean language sql as $$
  select public.marketplace_account_action_finish((body->>'actionId')::uuid,(body->>'claimToken')::uuid,(body->>'workerId')::uuid,(body->>'workerEpoch')::bigint,(body->>'runnerId')::uuid,p_state,p_result)
  from reconcile_context where name=p_name;
$$;
create function pg_temp.begin_write(p_name text) returns boolean language sql as $$
  select public.marketplace_account_action_begin_write((body->>'actionId')::uuid,(body->>'claimToken')::uuid,(body->>'workerId')::uuid,(body->>'workerEpoch')::bigint,(body->>'runnerId')::uuid)
  from reconcile_context where name=p_name;
$$;
create function pg_temp.action(p_name text) returns public.marketplace_account_actions language sql as $$
  select action from public.marketplace_account_actions action where public_id=(select (body->>'id')::uuid from reconcile_context where name=p_name);
$$;
create function pg_temp.reconciles(p_name text) returns integer language sql as $$
  select count(*)::integer from public.marketplace_account_actions where kind='outcome_reconcile'
    and reconciliation_action_id=(select (body->>'id')::uuid from reconcile_context where name=p_name);
$$;
-- Gedachter wartender Relist auf demselben Vinted-Inserat, angenommen nach den bisherigen Aufträgen.
create function pg_temp.waiting_relist() returns public.marketplace_listing_jobs language sql as $$
  select jsonb_populate_record(null::public.marketplace_listing_jobs,jsonb_build_object('id',1,'workspace_id','58000000-0000-4000-8000-000000000011',
    'connection_id','58000000-0000-4000-8000-000000000021','state','queued','execution_mode','cloud','action','publish','snapshot',jsonb_build_object('relistExternalId','58011'),
    'queue_order',nextval('public.marketplace_browser_queue_order'),'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
$$;
create function pg_temp.make_due() returns void language sql as $$
  update public.marketplace_account_actions set not_before=clock_timestamp()-interval '1 second' where kind='outcome_reconcile' and state='queued';
$$;
create function pg_temp.planned_delay(p_name text) returns interval language sql as $$
  select date_trunc('minute',not_before-created_at+interval '30 seconds') from public.marketplace_account_actions where kind='outcome_reconcile' and state='queued'
    and reconciliation_action_id=(select (body->>'id')::uuid from reconcile_context where name=p_name);
$$;
create function pg_temp.import_price(p_price numeric,p_source_updated_at timestamptz) returns void language sql as $$
  update public.marketplace_account_entries set body=jsonb_build_object('title','Trainingsjacke','price',p_price,'listingSourceUpdatedAt',p_source_updated_at),observed_at=clock_timestamp()
    where id='58000000-0000-4000-8000-000000000031';
$$;
create function pg_temp.close_sessions() returns void language sql as $$
  update public.marketplace_browser_sessions set state='closed',provider_stopped_at=clock_timestamp() where state='active';
$$;

set local role service_role;
select public.marketplace_worker_claim('58000000-0000-4000-8000-000000000041');
select public.marketplace_browser_capacity_report('58000000-0000-4000-8000-000000000041',1,2);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- 1. Unbestätigter Preisspeicherklick plant nach einer Minute eine automatische Nachprüfung.
insert into reconcile_context values('price',pg_temp.enqueue_price(1000,1200));
set local role service_role;
insert into reconcile_context values('price_claim',pg_temp.claim());
select ok(pg_temp.begin_write('price_claim'),'Preisänderung speichert den Schreibbeginn');
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('price_claim','outcome_unknown','{"status":"unconfirmed","reason":"price_pending"}'),'Unbestätigter Klick endet als ungeklärt');
reset role;
select is(pg_temp.reconciles('price'),1,'Ungeklärte Preisänderung erhält automatisch genau eine Nachprüfung');
select is((select state from public.marketplace_account_actions where reconciliation_action_id=(pg_temp.action('price')).public_id),'queued','Automatische Nachprüfung wartet auf den nächsten freien Browser');
select is((select is_write from public.marketplace_account_actions where reconciliation_action_id=(pg_temp.action('price')).public_id),false,'Nachprüfung ist rein lesend');
select is(pg_temp.planned_delay('price'),interval '1 minute','Erste Nachprüfung startet nach einer Minute, nicht sofort');
set local role service_role;
select is(pg_temp.claim(),null::jsonb,'Vor Ablauf des Abstands wird die Nachprüfung nicht gestartet');
reset role;
select is((public.marketplace_account_action_public(pg_temp.action('price'))->>'reconciling')::boolean,true,'Status zeigt die laufende Nachprüfung');
select is(public.marketplace_listing_job_blocker(pg_temp.waiting_relist()),(pg_temp.action('price')).public_id,'Wartender Relist nennt die blockierende Preisänderung');
select is(public.marketplace_listing_job_document(pg_temp.waiting_relist())->>'waitReason','dependency_unresolved','Relist-Status nennt den Wartegrund');

-- 2. Unklare Nachprüfungen folgen nach 5 und 15 Minuten, danach nicht mehr automatisch.
select pg_temp.make_due();
set local role service_role;
insert into reconcile_context values('first_check',pg_temp.claim());
select is((select body->>'actionKind' from reconcile_context where name='first_check'),'outcome_reconcile','Nachprüfung wird trotz Schreibsperre ausgeführt');
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('first_check','succeeded',jsonb_build_object('reconciledActionId',(pg_temp.action('price')).public_id,'verifiedAt',clock_timestamp(),'resolution',null)),'Nachprüfung ohne eindeutiges Ergebnis schließt ab');
reset role;
select is(pg_temp.reconciles('price'),2,'Ohne eindeutiges Ergebnis folgt eine zweite Nachprüfung');
select is(pg_temp.planned_delay('price'),interval '5 minutes','Zweite Nachprüfung folgt nach fünf Minuten');
select pg_temp.make_due();
set local role service_role;
insert into reconcile_context values('second_check',pg_temp.claim());
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('second_check','succeeded',jsonb_build_object('reconciledActionId',(pg_temp.action('price')).public_id,'verifiedAt',clock_timestamp(),'resolution',null)),'Zweite unklare Nachprüfung schließt ab');
reset role;
select is(pg_temp.planned_delay('price'),interval '15 minutes','Dritte Nachprüfung folgt nach fünfzehn Minuten');
select pg_temp.make_due();
set local role service_role;
insert into reconcile_context values('third_check',pg_temp.claim());
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('third_check','succeeded',jsonb_build_object('reconciledActionId',(pg_temp.action('price')).public_id,'verifiedAt',clock_timestamp(),'resolution',null)),'Dritte unklare Nachprüfung schließt ab');
reset role;
select is(pg_temp.reconciles('price'),3,'Nach drei automatischen Nachprüfungen bleibt der manuelle Weg');
select is((pg_temp.action('price')).state,'outcome_unknown','Ohne Beleg bleibt die Preisänderung ungeklärt');
select is((public.marketplace_account_action_public(pg_temp.action('price'))->>'reconciling')::boolean,false,'Status zeigt keine laufende Nachprüfung mehr');

-- 3. Der Kontoabruf bestätigt den Zielpreis, ein älterer Abruf dagegen nicht.
set local role service_role;
select public.marketplace_accept_imported_listing_price('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','58011',
  (select observed_at from public.marketplace_account_entries where id='58000000-0000-4000-8000-000000000031'));
reset role;
select is((pg_temp.action('price')).state,'outcome_unknown','Abruf vor dem Speicherklick ist kein Beleg');
select pg_temp.import_price(10,clock_timestamp());
set local role service_role;
select public.marketplace_accept_relisting_import('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','58011',
  (select observed_at from public.marketplace_account_entries where id='58000000-0000-4000-8000-000000000031'));
reset role;
select is((pg_temp.action('price')).state,'outcome_unknown','Ein noch alter Preis im Abruf entscheidet nichts');
select pg_temp.import_price(12,(pg_temp.action('price')).write_started_at-interval '10 minutes');
set local role service_role;
select public.marketplace_accept_relisting_import('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','58011',
  (select observed_at from public.marketplace_account_entries where id='58000000-0000-4000-8000-000000000031'));
reset role;
select is((pg_temp.action('price')).state,'outcome_unknown','Zielpreis aus einem Vinted-Stand vor dem Speicherklick ist kein Beleg');
update public.marketplace_account_entries set body=body-'listingSourceUpdatedAt',observed_at=clock_timestamp() where id='58000000-0000-4000-8000-000000000031';
set local role service_role;
select public.marketplace_accept_relisting_import('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','58011',
  (select observed_at from public.marketplace_account_entries where id='58000000-0000-4000-8000-000000000031'));
reset role;
select is((pg_temp.action('price')).state,'outcome_unknown','Ohne Vinted-Änderungszeitpunkt bestätigt der Abruf nichts');
select pg_temp.import_price(12,clock_timestamp());
set local role service_role;
select public.marketplace_accept_relisting_import('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','58011',
  (select observed_at from public.marketplace_account_entries where id='58000000-0000-4000-8000-000000000031'));
reset role;
select is((pg_temp.action('price')).state,'succeeded','Abruf mit Zielpreis bestätigt die ungeklärte Preisänderung');
select is((pg_temp.action('price')).result,'{"status":"confirmed","resolvedBy":"account_import"}'::jsonb,'Bestätigung nennt den Kontoabruf als Beleg');
select is(public.marketplace_listing_job_blocker(pg_temp.waiting_relist()),null::uuid,'Danach wartet ein Relist nicht mehr auf die Preisänderung');

-- 4. Eine Nachprüfung nach bereits erfolgter Klärung durch den Abruf schlägt nicht fehl.
set local role authenticated;
insert into reconcile_context values('raced',pg_temp.enqueue_price(1200,1500));
set local role service_role;
insert into reconcile_context values('raced_claim',pg_temp.claim());
select ok(pg_temp.begin_write('raced_claim'),'Zweite Preisänderung speichert den Schreibbeginn');
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('raced_claim','outcome_unknown','{"status":"unconfirmed"}'),'Zweite Preisänderung bleibt zunächst ungeklärt');
reset role;
select pg_temp.make_due();
set local role service_role;
insert into reconcile_context values('raced_check',pg_temp.claim());
reset role;
select pg_temp.import_price(15,clock_timestamp());
set local role service_role;
select public.marketplace_accept_relisting_import('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','58011',
  (select observed_at from public.marketplace_account_entries where id='58000000-0000-4000-8000-000000000031'));
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('raced_check','succeeded',jsonb_build_object('reconciledActionId',(pg_temp.action('raced')).public_id,'verifiedAt',clock_timestamp(),'resolution','succeeded',
  'providerResult',jsonb_build_object('status','confirmed'))),'Späte Nachprüfung schließt nach Klärung durch den Abruf ab');
reset role;
select is((pg_temp.action('raced')).result->>'resolvedBy','account_import','Früherer Abrufbeleg bleibt unverändert');

-- 5. Nachprüfung mit Ausgangspreis gibt das Inserat für einen neuen Versuch frei.
set local role authenticated;
insert into reconcile_context values('lost',pg_temp.enqueue_price(1500,1700));
set local role service_role;
insert into reconcile_context values('lost_claim',pg_temp.claim());
select ok(pg_temp.begin_write('lost_claim'),'Dritte Preisänderung speichert den Schreibbeginn');
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('lost_claim','outcome_unknown','{"status":"unconfirmed","reason":"save_click"}'),'Verlorener Klick bleibt zunächst ungeklärt');
reset role;
select pg_temp.make_due();
set local role service_role;
insert into reconcile_context values('lost_check',pg_temp.claim());
reset role;
select pg_temp.close_sessions();
set local role service_role;
select ok(pg_temp.finish('lost_check','succeeded',jsonb_build_object('reconciledActionId',(pg_temp.action('lost')).public_id,'verifiedAt',clock_timestamp(),'resolution','failed',
  'providerResult',jsonb_build_object('status','failed'))),'Nachprüfung belegt den unveränderten Ausgangspreis');
reset role;
select is((pg_temp.action('lost')).state,'failed','Nicht gespeicherte Preisänderung gilt als fehlgeschlagen');
select is(public.marketplace_listing_job_blocker(pg_temp.waiting_relist()),null::uuid,'Fehlgeschlagene Preisänderung sperrt keinen Relist');

-- 6. Auch ein Abbruch nach dem Schreibbeginn erhält die automatische Nachprüfung.
set local role authenticated;
insert into reconcile_context values('interrupted',pg_temp.enqueue_price(1500,1600));
set local role service_role;
insert into reconcile_context values('interrupted_claim',pg_temp.claim());
select ok(pg_temp.begin_write('interrupted_claim'),'Abgebrochene Preisänderung speichert den Schreibbeginn');
reset role;
select pg_temp.close_sessions();
set local role service_role;
select public.marketplace_account_actions_recover('58000000-0000-4000-8000-000000000041',1);
reset role;
select is((pg_temp.action('interrupted')).state,'outcome_unknown','Abbruch nach Schreibbeginn bleibt ungeklärt');
select is(pg_temp.reconciles('interrupted'),1,'Abbruch nach Schreibbeginn erhält automatisch eine Nachprüfung');

-- 7. Eine abgesicherte Folgeaktion wartet nicht auf das ungeklärte Ergebnis, ein Relist schon.
select is(public.marketplace_listing_job_blocker(pg_temp.waiting_relist()),(pg_temp.action('interrupted')).public_id,'Relist wartet weiter auf die ungeklärte Preisänderung');
set local role authenticated;
insert into reconcile_context values('follow_up',pg_temp.enqueue_price(1600,1800));
reset role;
select is(public.marketplace_account_action_public(pg_temp.action('follow_up'))->>'waitReason',
  null,'Folgende Preisänderung nennt keinen Wartegrund');
set local role service_role;
insert into reconcile_context values('follow_up_claim',pg_temp.claim());
select is((select body->>'actionId' from reconcile_context where name='follow_up_claim'),(pg_temp.action('follow_up')).public_id::text,
  'Folgende Preisänderung läuft trotz ungeklärter Vorgängerin, weil sie den aktuellen Preis selbst prüft');
reset role;
select pg_temp.close_sessions();

-- 8. Eine manuell angeforderte Nachprüfung ersetzt die noch geplante automatische.
set local role authenticated;
select is(public.marketplace_account_action_enqueue('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021',gen_random_uuid(),'outcome_reconcile',
  jsonb_build_object('actionId',(select (body->>'id')::uuid from reconcile_context where name='interrupted')))->'action'->>'kind','outcome_reconcile','Manuelle Nachprüfung wird angenommen');
reset role;
select is((select count(*)::integer from public.marketplace_account_actions where reconciliation_action_id=(pg_temp.action('interrupted')).public_id and state='queued'),1,
  'Nur die manuelle Nachprüfung bleibt geplant');
select is((select count(*)::integer from public.marketplace_account_actions where reconciliation_action_id=(pg_temp.action('interrupted')).public_id and state='cancelled' and error_code='superseded'),1,
  'Die geplante automatische Nachprüfung entfällt');

select * from finish();
rollback;
