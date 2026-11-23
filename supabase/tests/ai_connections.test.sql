\set ON_ERROR_STOP on
begin;
-- Diese Ablauf-Fixtures verwenden synthetische Artikeldaten. Die Katalogprüfung hat einen eigenen Test.
delete from public.vinted_listing_categories;
set local search_path=public,extensions;
select plan(5);
do $$
declare
  actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); ws uuid:=gen_random_uuid(); other_ws uuid:=gen_random_uuid();
  client uuid:=gen_random_uuid(); grant_id uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); request uuid:=gen_random_uuid();
  foreign_purchase uuid:=gen_random_uuid(); a jsonb; b jsonb; claims jsonb; action text; snapshot jsonb;
  booked_sale_id uuid; bank_id uuid:=gen_random_uuid(); category_id uuid:=gen_random_uuid(); bank_match jsonb; invoice_input jsonb;
begin
  insert into auth.users(id,email) values(actor,actor::text||'@example.test'),(other_actor,other_actor::text||'@example.test');
  insert into public.workspaces(id,name,shop_enabled) values(ws,'KI Test',true),(other_ws,'Anderer Workspace',true);
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,actor,'owner'),(other_ws,other_actor,'owner'),(other_ws,actor,'member');
  insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_type,token_endpoint_auth_method)
    values(client,'manual','http://127.0.0.1:57777/callback','authorization_code,refresh_token','public','none');
  insert into public.ai_connections(id,user_id,client_id,workspace_id,access_mode,session_id,authorization_id) values(grant_id,actor,client,ws,'read',session,'test-authorization');
  insert into auth.sessions(id,user_id,oauth_client_id,created_at) values(session,actor,client,clock_timestamp()+interval '1 second');
  insert into public.purchases(id,workspace_id,type,title) values(foreign_purchase,other_ws,'lot','Fremder Einkauf');
  insert into public.workspace_company_profiles(workspace_id,legal_name,street,house_number,postal_code,city,country_code,tax_number)
    values(ws,'Testunternehmen','Testweg','1','12345','Bonn','DE','Test-Steuernummer')
    on conflict(workspace_id) do update set legal_name=excluded.legal_name,street=excluded.street,house_number=excluded.house_number,
      postal_code=excluded.postal_code,city=excluded.city,country_code=excluded.country_code,tax_number=excluded.tax_number;
  insert into public.bank_transactions(id,workspace_id,booking_date,counterparty_name,purpose,amount) values(bank_id,ws,'2026-11-14','Testkunde','Testverkauf',25);
  insert into public.expense_categories(id,workspace_id,name) values(category_id,ws,'KI-Testkategorie');
  claims:=jsonb_build_object('sub',grant_id,'role','anon','client_id',client,'session_id',session);
  perform set_config('request.jwt.claims',claims::text,true);
  if public.ai_connection_context()->>'workspace_id'<>ws::text then raise exception 'Falscher Workspace'; end if;
  a:=public.ai_connection_call('read_records',jsonb_build_object('entity','purchases','id',foreign_purchase));
  if a->'records'<>'[]'::jsonb then raise exception 'Fremde Daten gelesen'; end if;
  if public.is_workspace_member(ws) then raise exception 'KI-Identität erbt Mitgliedschaft'; end if;
  if exists(select 1 from auth.users where id=grant_id) then raise exception 'KI-Identität ist ein App-Benutzer'; end if;
  if has_table_privilege('anon','public.purchases','select') or has_function_privilege('anon','public.record_sale(uuid,jsonb,jsonb)','execute')
    or has_function_privilege('anon','public.ai_connection_grant(text,uuid,text,uuid[])','execute')
    or has_function_privilege('anon','public.ai_connection_access_token_hook(jsonb)','execute')
    or has_function_privilege('anon','public.ai_connection_image_upload(uuid,uuid,text,text,bigint,uuid)','execute')
    or has_function_privilege('authenticated','public.ai_connection_execution_valid(uuid,uuid,uuid,uuid)','execute') then raise exception 'Direkter Schreib-/Benutzerzugriff möglich'; end if;
  foreach action in array array['create_purchase','update_purchase_draft','finalize_purchase','receive_purchase_lines','record_sale','save_sale_draft','create_invoice','create_expense','update_inventory_item','assign_bank_transaction','book_bank_transaction','create_vinted_draft','create_vinted_relist','save_vinted_draft','enqueue_vinted_listing','set_vinted_price','prepare_vinted_image_upload','import_vinted_original_photos'] loop
    begin
      perform public.ai_connection_call(action,'{}',gen_random_uuid());
      raise exception 'Nur lesen umgangen: %',action;
    exception when insufficient_privilege then null; end;
  end loop;
  update public.ai_connections set access_mode='edit' where id=grant_id;
  snapshot:='{"version":1,"lines":[{"target":"free:Pullover","quantity":1,"unitSalePrice":25,"purchaseId":null}],"platform":"direct","saleDate":"2026-11-14","platformFee":null,"shippingCost":null,"shippingRevenue":0,"shippingMode":"unknown","additionalCosts":[],"externalOrderId":"","buyerNotes":""}';
  if not public.ai_sale_draft_valid(snapshot) then raise exception 'Gültiger Entwurf abgewiesen'; end if;
  if public.ai_sale_draft_valid(jsonb_set(snapshot,'{lines,0,unitSalePrice}','-1')) or public.ai_sale_draft_valid(jsonb_set(snapshot,'{lines,0,quantity}','1.5')) then raise exception 'Ungültiger Betrag/Menge akzeptiert'; end if;
  a:=public.ai_connection_call('save_sale_draft',jsonb_build_object('title','Pullover','draft',snapshot),request);
  b:=public.ai_connection_call('save_sale_draft',jsonb_build_object('title','Pullover','draft',snapshot),request);
  if a<>b or (select count(*) from public.sale_drafts where workspace_id=ws)<>1 then raise exception 'Entwurf doppelt'; end if;
  if exists(select 1 from public.sales where workspace_id=ws) or exists(select 1 from public.stock_movements where workspace_id=ws) then raise exception 'Entwurf verändert Bestand'; end if;
  begin
    perform public.ai_connection_call('save_sale_draft',jsonb_build_object('title','Anderer Inhalt','draft',snapshot),request);
    raise exception 'Kennung mit anderem Inhalt wiederverwendet';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.ai_connection_call('save_sale_draft',jsonb_build_object('id',a->>'id','expected_updated_at','2000-01-01T00:00:00Z','title','Veraltet','draft',snapshot),gen_random_uuid());
    raise exception 'Veralteter Entwurf überschrieben';
  exception when serialization_failure then null; end;
  if auth.uid()<>grant_id or auth.role()<>'anon' then raise exception 'Benutzerkontext nicht zurückgesetzt'; end if;
  request:=gen_random_uuid();
  a:=public.ai_connection_call('record_sale','{"sale":{"platform":"direct","sale_date":"2026-11-14","shipping_mode":"pickup","shipping_revenue":0},"lines":[{"position_kind":"free","title_snapshot":"Pullover","quantity":1,"unit_sale_price":25}]}',request);
  b:=public.ai_connection_call('record_sale','{"sale":{"platform":"direct","sale_date":"2026-11-14","shipping_mode":"pickup","shipping_revenue":0},"lines":[{"position_kind":"free","title_snapshot":"Pullover","quantity":1,"unit_sale_price":25}]}',request);
  if a<>b or (select count(*) from public.sales where workspace_id=ws)<>1 then raise exception 'Verkauf doppelt gebucht'; end if;
  booked_sale_id:=(a->'sale'->>'id')::uuid;
  begin
    perform public.ai_connection_call('create_invoice',jsonb_build_object('sale_id',a->'sale'->>'id','invoice','{}'::jsonb),gen_random_uuid());
    raise exception 'Rechnung ohne echte Käuferdaten erstellt';
  exception when invalid_parameter_value then null; end;
  invoice_input:='{"invoice_number":"RE-AI-TEST-1","order_number":"AI-TEST-1","invoice_date":"2026-11-14","delivery_date":"2026-11-14","buyer":{"name":"Testkunde","street":"Kundenweg 2","postalCode":"12345","city":"Bonn","country":"DE"},"total":99999,"subtotal":99999,"seller":{"name":"Unzulässiger Absender"}}';
  a:=public.ai_connection_call('create_invoice',jsonb_build_object('sale_id',booked_sale_id,'invoice',invoice_input),gen_random_uuid());
  b:=public.ai_connection_call('create_invoice',jsonb_build_object('sale_id',booked_sale_id,'invoice','{}'::jsonb),gen_random_uuid());
  if a->'invoice'->>'id'<>b->'invoice'->>'id' or (select count(*) from public.invoices where workspace_id=ws)<>1 then raise exception 'Rechnung pro Quelle doppelt'; end if;
  if (a->'invoice'->>'total')::numeric<>25 or a->'invoice'->'seller'->>'name'<>'Testunternehmen' then raise exception 'Rechnungsdaten aus Modell statt aus Buchung/Profil'; end if;
  a:=public.ai_connection_call('assign_bank_transaction',jsonb_build_object('transaction_id',bank_id,'target_type','sale','target_id',booked_sale_id,
    'expected_amount',25,'expected_target_amount',25,'expected_currency','EUR','expected_status','pending','expected_match',null),gen_random_uuid());
  bank_match:=a->'match_json';
  if a->>'status'<>'matched' or bank_match->>'targetId'<>booked_sale_id::text then raise exception 'Bankzuordnung fehlt'; end if;
  b:=public.ai_connection_call('book_bank_transaction',jsonb_build_object('transaction_id',bank_id,'expected_amount',25,'expected_currency','EUR','expected_status','matched','expected_match',bank_match),gen_random_uuid());
  if b->>'status'<>'booked' then raise exception 'Bankzuordnung nicht gebucht'; end if;
  update public.workspace_members set role='accountant' where workspace_id=ws and user_id=actor;
  begin
    perform public.ai_connection_call('record_sale','{}',gen_random_uuid()); raise exception 'Buchhaltung verändert Warenbestand';
  exception when insufficient_privilege then null; end;
  request:=gen_random_uuid();
  a:=public.ai_connection_call('create_expense',jsonb_build_object('expense',jsonb_build_object('category_id',category_id,'title','Testausgabe','gross_amount',19,'vat_rate',19,'expense_date','2026-11-14')),request);
  b:=public.ai_connection_call('create_expense',jsonb_build_object('expense',jsonb_build_object('category_id',category_id,'title','Testausgabe','gross_amount',19,'vat_rate',19,'expense_date','2026-11-14')),request);
  if a<>b or (select count(*) from public.expenses where workspace_id=ws)<>1 then raise exception 'Ausgabe doppelt'; end if;
  update public.workspace_members set role='fulfillment' where workspace_id=ws and user_id=actor;
  begin
    perform public.ai_connection_call('create_expense','{}',gen_random_uuid()); raise exception 'Versandrolle verändert Ausgaben';
  exception when insufficient_privilege then null; end;
  update public.workspace_members set role='readonly' where workspace_id=ws and user_id=actor;
  begin
    perform public.ai_connection_call('record_sale','{}',gen_random_uuid());
    raise exception 'Rollenentzug umgangen';
  exception when insufficient_privilege then null; end;
  update public.ai_connections set revoked_at=clock_timestamp() where id=grant_id;
  begin
    perform public.ai_connection_context(); raise exception 'Widerruf umgangen';
  exception when insufficient_privilege then null; end;
  update public.ai_connections set revoked_at=null where id=grant_id;
  perform set_config('request.jwt.claims',(claims||jsonb_build_object('client_id',gen_random_uuid()))::text,true);
  begin
    perform public.ai_connection_context(); raise exception 'Fremder Client akzeptiert';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',claims::text,true);
  delete from auth.sessions where id=session;
  begin
    perform public.ai_connection_context(); raise exception 'Beendete Sitzung akzeptiert';
  exception when insufficient_privilege then null; end;
end $$;
select pass('KI-Verbindung isoliert Benutzer, Workspace, Rechte, Entwürfe und wiederholte Buchungen');
do $$
declare
  actor uuid:=gen_random_uuid(); client uuid:=gen_random_uuid(); ws uuid:=gen_random_uuid(); other_ws uuid:=gen_random_uuid();
  first_auth text:=gen_random_uuid()::text; second_auth text:=gen_random_uuid()::text;
  first_grant uuid; second_grant uuid; session uuid:=gen_random_uuid(); event jsonb;
begin
  insert into auth.users(id,email) values(actor,actor::text||'@example.test');
  insert into public.workspaces(id,name) values(ws,'Erste Zustimmung'),(other_ws,'Neue Zustimmung');
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,actor,'owner'),(other_ws,actor,'owner');
  insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_type,token_endpoint_auth_method)
    values(client,'manual','http://127.0.0.1:57777/callback','authorization_code,refresh_token','public','none');
  insert into auth.oauth_authorizations(id,authorization_id,client_id,user_id,redirect_uri,scope)
    values(gen_random_uuid(),first_auth,client,actor,'http://127.0.0.1:57777/callback','email');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  first_grant:=public.ai_connection_grant(first_auth,ws,'read');
  if first_grant<>public.ai_connection_grant(first_auth,ws,'read') then raise exception 'Zustimmung nicht wiederholbar'; end if;
  begin
    perform public.ai_connection_grant(first_auth,other_ws,'edit'); raise exception 'Zustimmung nachträglich umgebunden';
  exception when invalid_parameter_value then null; end;
  update auth.oauth_authorizations set status='approved',authorization_code='first-test-code' where authorization_id=first_auth;
  if public.ai_connection_token_grant(client,'first-test-code')<>first_grant then raise exception 'Code falsch gebunden'; end if;
  insert into auth.sessions(id,user_id,oauth_client_id,created_at) values(session,actor,client,clock_timestamp());
  event:=jsonb_build_object('user_id',actor,'claims',jsonb_build_object('sub',actor,'role','authenticated','client_id',client,'session_id',session));
  if public.ai_connection_access_token_hook(event)->'claims'->>'sub'<>first_grant::text then raise exception 'Hook falsch gebunden'; end if;
  insert into auth.oauth_authorizations(id,authorization_id,client_id,user_id,redirect_uri,scope)
    values(gen_random_uuid(),second_auth,client,actor,'http://127.0.0.1:57777/callback','email');
  second_grant:=public.ai_connection_grant(second_auth,other_ws,'edit');
  if first_grant=second_grant then raise exception 'Freigabe nicht rotiert'; end if;
  begin
    perform public.ai_connection_token_grant(client,'first-test-code'); raise exception 'Alter Code übernimmt neue Zustimmung';
  exception when insufficient_privilege then null; end;
  if not public.ai_connection_access_token_hook(event) ? 'error' then raise exception 'Alte Sitzung übernimmt neue Zustimmung'; end if;
  update auth.oauth_authorizations set status='approved',authorization_code='second-test-code' where authorization_id=second_auth;
  if public.ai_connection_token_grant(client,'second-test-code')<>second_grant then raise exception 'Neue Zustimmung fehlt'; end if;
  event:=jsonb_build_object('user_id',actor,'claims',jsonb_build_object('sub',actor,'role','authenticated'));
  if public.ai_connection_access_token_hook(event)<>event then raise exception 'Normale App-Anmeldung verändert'; end if;
end $$;
select pass('Zustimmungen bleiben unveränderlich; alte Codes und Sitzungen übernehmen keine spätere Freigabe');
do $$
declare
  actor uuid:=gen_random_uuid(); client uuid:=gen_random_uuid(); ws uuid:=gen_random_uuid(); grant_id uuid:=gen_random_uuid(); session uuid:=gen_random_uuid();
  account uuid:=gen_random_uuid(); local_account uuid:=gen_random_uuid(); unselected_account uuid:=gen_random_uuid(); entry uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); collision uuid:=gen_random_uuid(); action_id uuid; draft_id bigint; listing_request uuid:=gen_random_uuid(); result jsonb; claims jsonb; input jsonb; queued public.marketplace_account_actions;
begin
  insert into auth.users(id,email) values(actor,actor::text||'@example.test');
  insert into public.workspaces(id,name) values(ws,'Preisversuche');
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,actor,'owner');
  insert into public.platform_operators(user_id) values(actor);
  insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_type,token_endpoint_auth_method)
    values(client,'manual','http://127.0.0.1:57777/callback','authorization_code,refresh_token','public','none');
  insert into public.ai_connections(id,user_id,client_id,workspace_id,access_mode,authorization_id)
    values(grant_id,actor,client,ws,'edit',gen_random_uuid()::text);
  insert into auth.sessions(id,user_id,oauth_client_id,created_at) values(session,actor,client,clock_timestamp());
  insert into public.marketplace_connections(id,workspace_id,marketplace,display_name,execution_mode,status)
    values(account,ws,'vinted','Cloud','cloud','connected'),(local_account,ws,'vinted','Lokal','local','connected'),(unselected_account,ws,'vinted','Nicht freigegeben','cloud','connected');
  update public.marketplace_connections set external_account_id='123' where id=account;
  insert into public.marketplace_browser_profiles(workspace_id,connection_id,provider_profile_id) values(ws,account,'mcp_test_profile');
  insert into public.ai_connection_accounts(ai_connection_id,connection_id) values(grant_id,account),(grant_id,local_account);
  insert into public.marketplace_account_entries(id,workspace_id,connection_id,kind,external_id,body) values(entry,ws,account,'publication','123','{}');
  claims:=jsonb_build_object('sub',grant_id,'role','anon','client_id',client,'session_id',session);
  perform set_config('request.jwt.claims',claims::text,true);
  begin
    perform public.ai_connection_call('read_vinted_entries',jsonb_build_object('connection_id',unselected_account,'kind','publication')); raise exception 'Nicht freigegebenes Konto gelesen';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ai_connection_call('set_vinted_price',jsonb_build_object('connection_id',local_account,'entry_id',entry,'expected_price_cents',2500,'price_cents',2000),gen_random_uuid()); raise exception 'Lokales Konto als Cloud-Auftrag angenommen';
  exception when insufficient_privilege then null; end;
  input:=jsonb_build_object('connection_id',account,'entry_id',entry,'expected_price_cents',2500,'price_cents',2000);
  result:=public.ai_connection_call('set_vinted_price',input,request);
  action_id:=(result#>>'{action,id}')::uuid;
  if action_id is null or result#>>'{action,state}' is distinct from 'queued' then raise exception 'Kein dauerhafter Preisauftrag'; end if;
  if public.ai_connection_call('set_vinted_price',input,request) is distinct from result
    or (select count(*) from public.marketplace_account_actions where request_id=request)<>1 then raise exception 'Doppelter Preisauftrag'; end if;
  select * into queued from public.marketplace_account_actions where public_id=action_id;
  if queued.ai_connection_id is distinct from grant_id or not public.marketplace_account_action_authorized(queued) then raise exception 'KI-Auftrag nicht gebunden/freigegeben'; end if;
  update public.workspace_members set role='member' where workspace_id=ws and user_id=actor;
  if public.marketplace_account_action_authorized(queued) then raise exception 'Entzogene Rolle ignoriert'; end if;
  update public.workspace_members set role='owner' where workspace_id=ws and user_id=actor;
  delete from public.ai_connection_accounts where ai_connection_id=grant_id and connection_id=account;
  if public.marketplace_account_action_authorized(queued) then raise exception 'Entzogenes Konto ignoriert'; end if;
  insert into public.ai_connection_accounts(ai_connection_id,connection_id) values(grant_id,account);
  update public.marketplace_account_actions set state='outcome_unknown',error_code='interrupted' where public_id=action_id;
  result:=public.ai_connection_call('read_action_result',jsonb_build_object('action_id',request));
  if result#>>'{action,state}' is distinct from 'outcome_unknown' then raise exception 'Falscher Ergebnisstand'; end if;
  if public.ai_connection_call('set_vinted_price',input,request) is distinct from result then raise exception 'Wiederholung verliert aktuellen Zustand'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform public.marketplace_account_action_enqueue(ws,account,collision,'price_save',jsonb_build_object('entryId',entry,'expectedPriceCents',2500,'priceCents',2000));
  perform set_config('request.jwt.claims',claims::text,true);
  begin
    perform public.ai_connection_call('set_vinted_price',input,collision); raise exception 'Manueller Auftrag einer KI-Freigabe zugeordnet';
  exception when unique_violation then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  draft_id:=(public.marketplace_create_listing_draft(ws,account,'{}')->>'id')::bigint;
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,requested_by,request_id,request_hash,draft_revision,authorization_version,external_account_id,execution_mode,action,snapshot,state)
    values(ws,account,draft_id,actor,listing_request,repeat('0',64),1,1,'123','cloud','publish','{}','failed');
  perform set_config('request.jwt.claims',claims::text,true);
  begin
    perform public.ai_connection_call('enqueue_vinted_listing',jsonb_build_object('draft_id',draft_id,'expected_revision',1,'action','publish'),listing_request);
    raise exception 'Manueller Inseratauftrag einer KI-Freigabe zugeordnet';
  exception when unique_violation then null; end;
  update public.ai_connections set revoked_at=clock_timestamp() where id=grant_id;
  if public.marketplace_account_action_authorized(queued) then raise exception 'Widerruf vor Ausführung ignoriert'; end if;
  select * into queued from public.marketplace_account_actions where request_id=collision;
  if not public.marketplace_account_action_authorized(queued) then raise exception 'Manueller Auftrag durch KI-Widerruf gesperrt'; end if;
end $$;
select pass('Vinted-Preisaufträge nutzen die gemeinsame Warteschlange, aktuelle Ergebnisse und widerrufbare KI-Grenzen');
do $$
declare
  actor uuid:=gen_random_uuid(); client uuid:=gen_random_uuid(); ws uuid:=gen_random_uuid(); grant_id uuid:=gen_random_uuid(); session uuid:=gen_random_uuid();
  product uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); purchase uuid; line uuid; input jsonb; result jsonb; repeated jsonb;
begin
  insert into auth.users(id,email) values(actor,actor::text||'@example.test');
  insert into public.workspaces(id,name,shop_enabled) values(ws,'KI-Einkauf',true);
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,actor,'owner');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  insert into public.catalog_products(id,workspace_id,title,tracking_mode) values(product,ws,'Testbestand','quantity');
  insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_type,token_endpoint_auth_method)
    values(client,'manual','http://127.0.0.1:57777/callback','authorization_code,refresh_token','public','none');
  insert into public.ai_connections(id,user_id,client_id,workspace_id,access_mode,authorization_id)
    values(grant_id,actor,client,ws,'edit',gen_random_uuid()::text);
  insert into auth.sessions(id,user_id,oauth_client_id,created_at) values(session,actor,client,clock_timestamp());
  perform set_config('request.jwt.claims',jsonb_build_object('sub',grant_id,'role','anon','client_id',client,'session_id',session)::text,true);
  input:=jsonb_build_object('purchase',jsonb_build_object('type','lot','title','KI-Einkauf','purchase_date','2026-11-15','purchase_price',20,'pricing_mode','individual','content_status','known','cost_allocation_mode','even','discount_amount',0,'shipment_status','arrived'),
    'lines',jsonb_build_array(jsonb_build_object('position_kind','stock','client_ref','stock-one','title_snapshot','Testbestand','catalog_product_id',product,'line_kind','quantity','ordered_quantity',2,'price_mode','priced','unit_purchase_price',10,'line_total',20,'allocated_additional_cost',0)));
  result:=public.ai_connection_call('create_purchase',input,request);
  repeated:=public.ai_connection_call('create_purchase',input,request);
  purchase:=(result#>>'{purchase,id}')::uuid;
  if result<>repeated or (select count(*) from public.purchases where workspace_id=ws)<>1 then raise exception 'Einkauf doppelt angelegt'; end if;
  if exists(select 1 from public.stock_lots where workspace_id=ws) then raise exception 'Einkaufsentwurf bucht Bestand'; end if;
  input:=jsonb_set(input,'{purchase,title}','"KI-Einkauf ergänzt"')||jsonb_build_object('purchase_id',purchase,'expected_updated_at',(select updated_at from public.purchases where id=purchase));
  result:=public.ai_connection_call('update_purchase_draft',input,gen_random_uuid());
  if not exists(select 1 from public.purchases where id=purchase and title='KI-Einkauf ergänzt') then raise exception 'Einkaufsentwurf nicht geändert'; end if;
  select id into line from public.purchase_lines where purchase_id=purchase and position_kind='stock';
  input:=jsonb_build_object('purchase_id',purchase,'expected_updated_at',(select updated_at from public.purchases where id=purchase),'lines',jsonb_build_array(jsonb_build_object('purchase_line_id',line,'received_quantity',2,'received_at','2026-11-15T12:00:00Z')));
  request:=gen_random_uuid(); result:=public.ai_connection_call('receive_purchase_lines',input,request);
  repeated:=public.ai_connection_call('receive_purchase_lines',input,request);
  if result<>repeated or (select received_quantity from public.purchase_lines where id=line)<>2 then raise exception 'Wareneingang doppelt erfasst'; end if;
  result:=public.ai_connection_call('finalize_purchase',jsonb_build_object('purchase_id',purchase,'expected_updated_at',(select updated_at from public.purchases where id=purchase)),gen_random_uuid());
  if not exists(select 1 from public.purchases where id=purchase and entry_status='finalized' and total_purchase_cost=20)
    or (select sum(remaining_quantity) from public.stock_lots where purchase_id=purchase)<>2 then raise exception 'Einkaufsabschluss verliert Kosten oder Bestand'; end if;
end $$;
select pass('Einkaufsanlage, Ergänzung, Wareneingang und Kostenabschluss nutzen dieselbe Fachlogik ohne Doppelbuchung');
do $$
declare
  actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); ws uuid:=gen_random_uuid(); other_ws uuid:=gen_random_uuid();
  client uuid:=gen_random_uuid(); grant_id uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); account uuid:=gen_random_uuid(); foreign_account uuid:=gen_random_uuid();
  app_claims jsonb; mcp_claims jsonb; ctx jsonb; old_request uuid:=gen_random_uuid(); inflight_request uuid:=gen_random_uuid(); old_input jsonb;
begin
  insert into auth.users(id,email) values(actor,actor::text||'@example.test'),(other_actor,other_actor::text||'@example.test');
  insert into public.workspaces(id,name) values(ws,'Freigabe bearbeiten'),(other_ws,'Fremdes Konto');
  insert into public.workspace_members(workspace_id,user_id,role) values(ws,actor,'owner'),(ws,other_actor,'owner'),(other_ws,actor,'owner');
  insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_type,token_endpoint_auth_method)
    values(client,'manual','http://127.0.0.1:57777/callback','authorization_code,refresh_token','public','none');
  insert into public.ai_connections(id,user_id,client_id,workspace_id,access_mode,session_id,authorization_id)
    values(grant_id,actor,client,ws,'read',session,gen_random_uuid()::text);
  insert into auth.sessions(id,user_id,oauth_client_id,created_at) values(session,actor,client,clock_timestamp()+interval '1 second');
  insert into public.marketplace_connections(id,workspace_id,marketplace,display_name,execution_mode,status)
    values(account,ws,'vinted','Freigegeben','local','connected'),(foreign_account,other_ws,'vinted','Fremd','local','connected');
  app_claims:=jsonb_build_object('sub',actor,'role','authenticated');
  mcp_claims:=jsonb_build_object('sub',grant_id,'role','anon','client_id',client,'session_id',session);
  perform set_config('request.jwt.claims',mcp_claims::text,true);
  begin
    perform public.ai_connection_update(grant_id,ws,'edit','{}','read','{}'); raise exception 'MCP erweitert eigene Freigabe';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_actor,'role','authenticated')::text,true);
  begin
    perform public.ai_connection_update(grant_id,ws,'edit','{}','read','{}'); raise exception 'Anderer Inhaber ändert persönliche Verbindung';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',app_claims::text,true);
  begin
    perform public.ai_connection_update(grant_id,other_ws,'edit','{}','read','{}'); raise exception 'Workspace umgebunden';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ai_connection_update(grant_id,ws,'edit',array[foreign_account],'read','{}'); raise exception 'Fremdes Konto freigegeben';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ai_connection_update(grant_id,ws,null,'{}','read','{}'); raise exception 'Fehlender Modus akzeptiert';
  exception when invalid_parameter_value then null; end;
  perform public.ai_connection_update(grant_id,ws,'edit',array[account],'read','{}');
  perform set_config('request.jwt.claims',mcp_claims::text,true);
  ctx:=public.ai_connection_context();
  if ctx->>'access_mode'<>'edit' or ctx->>'id'<>grant_id::text or ctx->>'session_id'<>session::text
    or ctx->'connection_ids'<>jsonb_build_array(account) then raise exception 'Bestehendes Token sieht neue Freigabe nicht'; end if;
  old_input:=jsonb_build_object('connection_id',account,'content','{}'::jsonb);
  insert into public.ai_connection_requests(id,ai_connection_id,action,input,result,created_at)
    values(old_request,grant_id,'create_vinted_draft',old_input,'{"previous_account_data":true}',clock_timestamp());
  if public.ai_connection_call('create_vinted_draft',old_input,old_request)<>'{"previous_account_data":true}'::jsonb then
    raise exception 'Unveränderte Kontofreigabe verliert Wiederholergebnis';
  end if;
  perform set_config('request.jwt.claims',app_claims::text,true);
  begin
    perform public.ai_connection_update(grant_id,ws,'read','{}','read','{}'); raise exception 'Veralteter Modus überschrieben';
  exception when serialization_failure then null; end;
  begin
    perform public.ai_connection_update(grant_id,ws,'read','{}','edit','{}'); raise exception 'Veraltete Kontenauswahl überschrieben';
  exception when serialization_failure then null; end;
  perform public.ai_connection_update(grant_id,ws,'edit','{}','edit',array[account]);
  perform set_config('request.jwt.claims',mcp_claims::text,true);
  begin
    perform public.ai_connection_call('read_action_result',jsonb_build_object('action_id',old_request)); raise exception 'Ergebnis eines entfernten Kontos gelesen';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ai_connection_call('create_vinted_draft',old_input,old_request); raise exception 'Konteneinschränkung über Wiederholung umgangen';
  exception when insufficient_privilege then null; end;
  if not exists(select 1 from public.ai_connection_requests where id=old_request) then raise exception 'Wiederholschutz gelöscht'; end if;
  -- Ein bereits laufender Aufruf kann sein Ergebnis erst nach der Kontenänderung speichern.
  insert into public.ai_connection_requests(id,ai_connection_id,action,input,result)
    values(inflight_request,grant_id,'create_vinted_draft',old_input,'{"previous_account_data":true}');
  begin
    perform public.ai_connection_call('read_action_result',jsonb_build_object('action_id',inflight_request)); raise exception 'Verspätet gespeichertes Ergebnis umgeht Konteneinschränkung';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',app_claims::text,true);
  perform public.ai_connection_update(grant_id,ws,'read','{}','edit','{}');
  perform set_config('request.jwt.claims',mcp_claims::text,true);
  ctx:=public.ai_connection_context();
  if ctx->>'access_mode'<>'read' or ctx->'connection_ids'<>'[]'::jsonb then raise exception 'Einschränkung wirkt nicht sofort'; end if;
  begin
    perform public.ai_connection_call('save_sale_draft','{}',gen_random_uuid()); raise exception 'Altes Token schreibt nach Einschränkung';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',app_claims::text,true);
  update public.workspace_members set role='readonly' where workspace_id=ws and user_id=actor;
  begin
    perform public.ai_connection_update(grant_id,ws,'edit','{}','read','{}'); raise exception 'Leserolle erweitert Freigabe';
  exception when insufficient_privilege then null; end;
  update public.workspace_members set role='owner' where workspace_id=ws and user_id=actor;
  perform public.ai_connection_revoke(grant_id);
  begin
    perform public.ai_connection_update(grant_id,ws,'edit','{}','read','{}'); raise exception 'Widerrufene Verbindung wiederbelebt';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.ai_connection_update(uuid,uuid,text,uuid[],text,uuid[])','execute')
    or has_function_privilege('service_role','public.ai_connection_update(uuid,uuid,text,uuid[],text,uuid[])','execute') then
    raise exception 'Änderung außerhalb der persönlichen App-Anmeldung erlaubt';
  end if;
end $$;
select pass('Freigabeänderung schützt Eigentümer, Workspace, Rolle und Konflikte und gilt sofort für dieselbe MCP-Sitzung');
select * from finish();
rollback;
