-- Zweck: Persönliche KI-Freigaben ändern und alte Vinted-Ergebnisse nach Kontenwechsel sperren.
-- Betroffen: ai_connections, ai_connection_accounts, ai_connection_requests.created_at und begrenzte Freigabe-/Fach-RPCs.
alter table "public"."ai_connection_requests" alter column "created_at" set default statement_timestamp();

alter table "public"."ai_connections" add column "accounts_changed_at" timestamp with time zone;

create or replace function public.ai_connection_update(p_id uuid, p_workspace_id uuid, p_access_mode text, p_connection_ids uuid[], p_expected_access_mode text, p_expected_connection_ids uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare g public.ai_connections; current_accounts uuid[]; expected_accounts uuid[];
begin
  if auth.role()<>'authenticated' or auth.jwt() ? 'client_id' or auth.uid() is null
    or not public.can_access_workspace(p_workspace_id) then raise insufficient_privilege; end if;
  if p_access_mode is null or p_access_mode not in ('read','edit') or p_connection_ids is null
    or cardinality(p_connection_ids)>50 or p_expected_access_mode is null or p_expected_connection_ids is null then
    raise exception 'Die KI-Freigabe ist unvollständig.' using errcode='22023';
  end if;
  select * into g from public.ai_connections
    where id=p_id and user_id=auth.uid() and workspace_id=p_workspace_id and revoked_at is null for update;
  if not found then raise insufficient_privilege; end if;
  select coalesce(array_agg(connection_id order by connection_id),'{}'::uuid[]) into current_accounts
    from public.ai_connection_accounts where ai_connection_id=g.id;
  select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into expected_accounts from unnest(p_expected_connection_ids) selected(id);
  if g.access_mode<>p_expected_access_mode or current_accounts is distinct from expected_accounts then
    raise exception 'Die Freigabe wurde inzwischen geändert. Lade die Verbindungen neu.' using errcode='40001';
  end if;
  if p_access_mode='edit' and not exists(select 1 from public.workspace_members
    where workspace_id=g.workspace_id and user_id=g.user_id and role in ('owner','admin','member','accountant')) then
    raise exception 'Deine Workspace-Rolle erlaubt keine Bearbeitung.' using errcode='42501';
  end if;
  if exists(select 1 from unnest(p_connection_ids) selected(id) where not exists(
    select 1 from public.marketplace_connections c where c.id=selected.id and c.workspace_id=g.workspace_id
      and c.marketplace='vinted' and public.marketplace_can_manage(g.workspace_id))) then
    raise exception 'Ein Vinted-Konto ist nicht zugänglich.' using errcode='42501';
  end if;
  update public.ai_connections set access_mode=p_access_mode,
    accounts_changed_at=case when current_accounts is distinct from
      (select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) from unnest(p_connection_ids) selected(id))
      then clock_timestamp() else accounts_changed_at end where id=g.id;
  delete from public.ai_connection_accounts where ai_connection_id=g.id and not (connection_id=any(p_connection_ids));
  insert into public.ai_connection_accounts(ai_connection_id,connection_id)
    select g.id,id from unnest(p_connection_ids) selected(id) group by id on conflict(ai_connection_id,connection_id) do nothing;
end $function$;

create or replace function public.ai_connection_call(p_action text, p_input jsonb default '{}'::jsonb, p_request_id uuid default NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  ctx jsonb:=public.ai_connection_context(); original_claims text:=current_setting('request.jwt.claims',true);
  ws uuid:=(ctx->>'workspace_id')::uuid; actor uuid:=(ctx->>'user_id')::uuid;
  result jsonb; prior public.ai_connection_requests; entity text; row_data jsonb; source_id uuid;
  account_id uuid; queued_action_id uuid; draft public.marketplace_listing_drafts; saved public.sale_drafts;
  write_action boolean:=p_action not in ('read_records','read_vinted_draft','list_vinted_drafts','read_vinted_job','read_vinted_entries','export_audit_snapshot','read_action_result','read_file');
  invoice_data jsonb; invoice_items jsonb; subtotal numeric; shipping numeric; item public.inventory_items;
  bank public.bank_transactions; target_amount numeric; target_title text; target_type text; order_id uuid; tax_mode text;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>262144 then
    raise exception 'Ungültige Werkzeugdaten.' using errcode='22023';
  end if;
  if write_action and (ctx->>'access_mode'<>'edit' or ctx->>'role' not in ('owner','admin','member','accountant')) then
    raise exception 'Diese Verbindung darf nur lesen.' using errcode='42501';
  end if;
  if p_action like '%vinted%' and ctx->>'role' not in ('owner','admin') then raise insufficient_privilege; end if;
  if write_action then
    if p_request_id is null then raise exception 'Eine Vorgangskennung ist erforderlich.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
    select * into prior from public.ai_connection_requests where id=p_request_id;
    if found then
      if prior.ai_connection_id<>(ctx->>'id')::uuid or prior.action<>p_action or prior.input<>p_input then
        raise exception 'Die Vorgangskennung gehört zu anderen Daten.' using errcode='22023';
      end if;
      return public.ai_connection_call('read_action_result',jsonb_build_object('action_id',p_request_id),null);
    end if;
  end if;
  -- Nur innerhalb dieser geprüften Transaktion erhält die bestehende Fachlogik den echten Akteur.
  perform set_config('request.jwt.claims',(auth.jwt()||jsonb_build_object('sub',actor,'role','authenticated'))::text,true);
  if not public.can_access_workspace(ws) then raise insufficient_privilege; end if;
  if p_action='read_action_result' then
    select * into prior from public.ai_connection_requests r where r.id=(p_input->>'action_id')::uuid and r.ai_connection_id=(ctx->>'id')::uuid;
    if not found then raise no_data_found; end if;
    if prior.action like '%vinted%' and not public.marketplace_can_manage(ws) then raise insufficient_privilege; end if;
    if prior.action like '%vinted%' and exists(select 1 from public.ai_connections
      where id=(ctx->>'id')::uuid and accounts_changed_at>prior.created_at) then
      raise exception 'Die Kontofreigabe wurde geändert. Lies den aktuellen Entwurf oder Auftragsstand erneut; führe die Aktion nicht mit einer neuen Vorgangskennung aus.' using errcode='42501';
    end if;
    if prior.action='set_vinted_price' then
      select jsonb_build_object('action',public.marketplace_account_action_public(a)) into result from public.marketplace_account_actions a
        join public.ai_connection_accounts c on c.connection_id=a.connection_id and c.ai_connection_id=a.ai_connection_id
        where a.ai_connection_id=(ctx->>'id')::uuid and a.workspace_id=ws and a.public_id=(prior.result#>>'{action,id}')::uuid;
      if result is null then raise no_data_found; end if;
    else result:=prior.result; end if;
  elsif p_action='read_records' then
    entity:=p_input->>'entity';
    if entity not in ('inventory_items','catalog_products','purchases','purchase_lines','sale_drafts','sales','sale_lines','invoices','store_orders','expenses','expense_categories','sources','suppliers','bank_transactions','purchase_documents','expense_documents') then
      raise exception 'Dieser Datenbereich wird nicht angeboten.' using errcode='22023';
    end if;
    if entity in ('purchase_documents','expense_documents') then
      execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select d.* from public.%I d join public.%I p on p.id=d.%I where p.workspace_id=$1 and ($2 is null or d.id::text=$2) order by d.id limit 50 offset $3) r',
        entity,case when entity='purchase_documents' then 'purchases' else 'expenses' end,case when entity='purchase_documents' then 'purchase_id' else 'expense_id' end)
        into result using ws,nullif(p_input->>'id',''),greatest(0,least(coalesce((p_input->>'offset')::integer,0),10000));
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select * from public.%I where workspace_id=$1 and ($2 is null or id::text=$2) and ($3 is null or to_jsonb(%I)::text ilike ''%%''||$3||''%%'') order by id limit 50 offset $4) r',entity,entity)
        into result using ws,nullif(p_input->>'id',''),nullif(left(p_input->>'query',200),''),greatest(0,least(coalesce((p_input->>'offset')::integer,0),10000));
    end if;
    result:=jsonb_build_object('records',result,'limit',50,'offset',coalesce((p_input->>'offset')::integer,0));
  elsif p_action='read_file' then
    if p_input->>'kind'='purchase_document' then
      select jsonb_build_object('bucket','purchase-documents','path',storage_path,'fileName',original_file_name,'mimeType',mime_type) into result
        from public.purchase_documents where workspace_id=ws and id=(p_input->>'id')::uuid;
    elsif p_input->>'kind'='expense_document' then
      select jsonb_build_object('bucket','expense-documents','path',storage_path,'fileName',original_file_name,'mimeType',mime_type) into result
        from public.expense_documents where workspace_id=ws and id=(p_input->>'id')::uuid;
    elsif p_input->>'kind'='vinted_image' and public.marketplace_can_manage(ws) then
      select jsonb_build_object('bucket','marketplace-listing-media','path',i.storage_path,'fileName',i.file_name,'mimeType',i.mime_type) into result
        from public.marketplace_listing_images i join public.marketplace_listing_drafts d on d.id=i.draft_id
        where i.workspace_id=ws and i.id=(p_input->>'id')::bigint and i.state='ready'
        and (d.connection_id is null or exists(select 1 from public.ai_connection_accounts where ai_connection_id=(ctx->>'id')::uuid and connection_id=d.connection_id));
    end if;
    if result is null or not exists(select 1 from storage.objects where bucket_id=result->>'bucket' and name=result->>'path') then raise no_data_found; end if;
  elsif p_action in ('finalize_purchase','receive_purchase_lines') then
    if ctx->>'role'='accountant' then raise insufficient_privilege; end if;
    perform public.lock_workspace_shop(ws);
    perform 1 from public.purchases where id=(p_input->>'purchase_id')::uuid and workspace_id=ws and updated_at=(p_input->>'expected_updated_at')::timestamptz for update;
    if not found then raise exception 'Der Einkauf wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
    if p_action='finalize_purchase' then result:=public.finalize_purchase_costing(ws,(p_input->>'purchase_id')::uuid);
    else result:=public.receive_purchase_lines(ws,(p_input->>'purchase_id')::uuid,p_input->'lines'); end if;
  elsif p_action in ('create_purchase','update_purchase_draft') then
    if ctx->>'role'='accountant' then raise insufficient_privilege; end if;
    if p_action='create_purchase' then
      result:=public.create_purchase(ws,(p_input->'purchase')||jsonb_build_object('request_id',p_request_id),coalesce(p_input->'expenses','[]'),coalesce(p_input->'lines','[]'));
    else
      perform public.lock_workspace_shop(ws);
      perform 1 from public.purchases where id=(p_input->>'purchase_id')::uuid and workspace_id=ws and updated_at=(p_input->>'expected_updated_at')::timestamptz for update;
      if not found then raise exception 'Der Einkaufsentwurf wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
      result:=public.update_purchase_draft(ws,(p_input->>'purchase_id')::uuid,(p_input->'purchase'),coalesce(p_input->'expenses','[]'),coalesce(p_input->'lines','[]'));
    end if;
  elsif p_action='record_sale' then
    if ctx->>'role'='accountant' then raise insufficient_privilege; end if;
    result:=public.record_sale(ws,(p_input->'sale')||jsonb_build_object('booking_key',p_request_id),p_input->'lines');
  elsif p_action='save_sale_draft' then
    if ctx->>'role'='accountant' or not public.ai_sale_draft_valid(p_input->'draft') then
      raise exception 'Der Verkaufsentwurf ist ungültig.' using errcode='22023';
    end if;
    source_id:=coalesce(nullif(p_input->>'id','')::uuid,p_request_id);
    if exists(select 1 from jsonb_array_elements(p_input->'draft'->'lines') l where
      (l->>'target' like 'inventory:%' and not exists(select 1 from public.inventory_items where workspace_id=ws and id=substring(l->>'target' from 11)::uuid))
      or (l->>'target' like 'catalog:%' and not exists(select 1 from public.catalog_products where workspace_id=ws and id=substring(l->>'target' from 9)::uuid))
      or (l->'purchaseId'<>'null'::jsonb and not exists(select 1 from public.purchases where workspace_id=ws and id=(l->>'purchaseId')::uuid))) then raise insufficient_privilege; end if;
    select * into saved from public.sale_drafts where id=source_id and workspace_id=ws for update;
    if not found and p_input ? 'id' then raise no_data_found; end if;
    if found and saved.updated_at is distinct from (p_input->>'expected_updated_at')::timestamptz then
      raise exception 'Der Verkaufsentwurf wurde zwischenzeitlich geändert.' using errcode='40001';
    end if;
    select coalesce(sum((value->>'quantity')::integer*(value->>'unitSalePrice')::numeric),0) into subtotal from jsonb_array_elements(p_input->'draft'->'lines');
    insert into public.sale_drafts(id,workspace_id,created_by,title,sale_amount,draft)
      values(source_id,ws,actor,coalesce(p_input->>'title',''),subtotal,p_input->'draft')
      on conflict(id) do update set title=excluded.title,sale_amount=excluded.sale_amount,draft=excluded.draft
        where sale_drafts.workspace_id=ws returning to_jsonb(sale_drafts) into result;
    if result is null then raise insufficient_privilege; end if;
  elsif p_action='update_inventory_item' then
    if ctx->>'role'='accountant' or jsonb_typeof(p_input->'changes') is distinct from 'object'
      or (p_input->'changes')-array['title','description','model','condition','sku','ean','expected_value','category_id','brand_id']<>'{}'::jsonb then raise insufficient_privilege; end if;
    select * into item from public.inventory_items where workspace_id=ws and id=(p_input->>'id')::uuid and archived_at is null for update;
    if not found then raise no_data_found; end if;
    if item.updated_at is distinct from (p_input->>'expected_updated_at')::timestamptz then raise exception 'Der Artikel wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
    if p_input->'changes' ? 'expected_value' and p_input->'changes'->'expected_value'<>'null'::jsonb
      and (p_input->'changes'->>'expected_value' !~ '^[0-9]+(\.[0-9]{1,2})?$' or (p_input->'changes'->>'expected_value')::numeric>9999999999.99) then raise exception 'Ungültiger Betrag.' using errcode='22023'; end if;
    item:=jsonb_populate_record(item,p_input->'changes');
    if nullif(btrim(item.title),'') is null then raise exception 'Der Artikeltitel fehlt.' using errcode='22023'; end if;
    update public.inventory_items set title=item.title,description=item.description,model=item.model,condition=item.condition,
      sku=item.sku,ean=item.ean,expected_value=item.expected_value,category_id=item.category_id,brand_id=item.brand_id,updated_at=clock_timestamp()
      where id=item.id and workspace_id=ws returning to_jsonb(inventory_items) into result;
  elsif p_action='create_expense' then
    row_data:=p_input->'expense';
    if jsonb_typeof(row_data) is distinct from 'object' then raise exception 'Ungültige Ausgabe.' using errcode='22023'; end if;
    insert into public.expenses(workspace_id,created_by,category_id,title,vendor_name,quantity,gross_amount,vat_rate,expense_date,due_date,status,payment_date,notes)
      values(ws,actor,(row_data->>'category_id')::uuid,row_data->>'title',row_data->>'vendor_name',coalesce((row_data->>'quantity')::integer,1),
        (row_data->>'gross_amount')::numeric,(row_data->>'vat_rate')::numeric,(row_data->>'expense_date')::date,(row_data->>'due_date')::date,
        coalesce(row_data->>'status','open'),(row_data->>'payment_date')::date,row_data->>'notes') returning to_jsonb(expenses) into result;
  elsif p_action='export_audit_snapshot' then
    result:=public.export_audit_snapshot(ws,coalesce(p_input->'filter','{}'));
  elsif p_action in ('assign_bank_transaction','book_bank_transaction') then
    if ctx->>'role' not in ('owner','admin','accountant') then raise insufficient_privilege; end if;
    select * into bank from public.bank_transactions where workspace_id=ws and id=(p_input->>'transaction_id')::uuid for update;
    if not found then raise no_data_found; end if;
    if bank.currency<>'EUR' or bank.currency is distinct from p_input->>'expected_currency'
      or bank.amount is distinct from (p_input->>'expected_amount')::numeric or bank.status is distinct from p_input->>'expected_status'
      or bank.match_json is distinct from nullif(p_input->'expected_match','null'::jsonb) then
      raise exception 'Die Bankbewegung wurde geändert. Bitte neu lesen.' using errcode='40001'; end if;
    if p_action='assign_bank_transaction' then
      if bank.status not in ('pending','matched') then raise invalid_parameter_value; end if;
      target_type:=p_input->>'target_type'; source_id:=(p_input->>'target_id')::uuid;
      if target_type='sale' and bank.amount>0 then
        select sale_price,coalesce(record_number,'Verkauf') into target_amount,target_title from public.sales where workspace_id=ws and id=source_id and voided_at is null and returned_at is null for update;
      elsif target_type='store_order' and bank.amount>0 then
        select total,order_number into target_amount,target_title from public.store_orders where workspace_id=ws and id=source_id and payment_status='pending' for update;
      elsif target_type='purchase' and bank.amount<0 then
        select purchase_price,title into target_amount,target_title from public.purchases where workspace_id=ws and id=source_id and entry_status<>'draft' for update;
      elsif target_type='operating_expense' and bank.amount<0 then
        select gross_amount,title into target_amount,target_title from public.expenses where workspace_id=ws and id=source_id and deleted_at is null for update;
      end if;
      if target_amount is null or target_amount<=0 or target_amount is distinct from (p_input->>'expected_target_amount')::numeric then raise exception 'Das Zuordnungsziel wurde geändert oder ist nicht verfügbar.' using errcode='40001'; end if;
      update public.bank_transactions set status='matched',match_json=jsonb_build_object('targetType',target_type,'targetId',source_id,'targetReference',target_title,
        'targetName',target_title,'targetAmount',target_amount,'confidence',100,'confidenceLabel','manual') where id=bank.id returning to_jsonb(bank_transactions) into result;
    else
      if bank.status<>'matched' or coalesce(bank.match_json->>'targetType','unknown') not in ('sale','store_order','purchase','operating_expense') then raise invalid_parameter_value; end if;
      order_id:=case when bank.match_json->>'targetType'='store_order' then (bank.match_json->>'targetId')::uuid else null end;
      result:=to_jsonb(public.book_bank_transaction(ws,bank.id,clock_timestamp(),order_id));
    end if;
  elsif p_action='create_invoice' then
    source_id:=nullif(p_input->>'sale_id','')::uuid; order_id:=nullif(p_input->>'store_order_id','')::uuid;
    if (source_id is null)=(order_id is null) then raise invalid_parameter_value; end if;
    if source_id is not null then select to_jsonb(s) into row_data from public.sales s where id=source_id and workspace_id=ws;
    else select to_jsonb(o) into row_data from public.store_orders o where id=order_id and workspace_id=ws; end if;
    if row_data is null then raise no_data_found; end if;
    select jsonb_build_object('invoice',to_jsonb(i),'created',false) into result from public.invoices i where workspace_id=ws and (sale_id=source_id or store_order_id=order_id);
    if result is null then
      invoice_data:=p_input->'invoice';
      if jsonb_typeof(invoice_data->'buyer') is distinct from 'object'
        or nullif(btrim(invoice_data->'buyer'->>'name'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'street'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'postalCode'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'country'),'') is null
        or nullif(btrim(invoice_data->'buyer'->>'city'),'') is null then
        raise exception 'Name und vollständige Rechnungsadresse fehlen.' using errcode='22023';
      end if;
      if source_id is not null then
        select jsonb_agg(jsonb_build_object('title',title_snapshot,'quantity',quantity,'unit_price',unit_sale_price,'total_price',line_total) order by created_at,id),
          sum(line_total) into invoice_items,subtotal from public.sale_lines where sale_id=source_id and workspace_id=ws;
        select l.tax_mode into tax_mode from public.sale_lines l where l.sale_id=source_id and l.workspace_id=ws order by l.created_at,l.id limit 1;
        shipping:=coalesce((row_data->>'shipping_revenue')::numeric,0);
        if subtotal+shipping is distinct from coalesce((row_data->>'sale_price_total')::numeric,(row_data->>'sale_price')::numeric) then raise exception 'Die Rechnungspositionen passen nicht zum gebuchten Verkauf.' using errcode='22023'; end if;
      else
        select jsonb_agg(jsonb_build_object('title',item_title,'quantity',quantity,'unit_price',price,'total_price',round(quantity*price,2)) order by id),sum(round(quantity*price,2))
          into invoice_items,subtotal from public.store_order_items where store_order_id=order_id;
        shipping:=coalesce((row_data->>'shipping_cost')::numeric,0);
        if subtotal is distinct from (row_data->>'subtotal')::numeric or subtotal+shipping is distinct from (row_data->>'total')::numeric then raise invalid_parameter_value; end if;
        select w.tax_mode into tax_mode from public.workspaces w where id=ws;
      end if;
      if invoice_items is null or tax_mode is null then raise exception 'Die gebuchten Rechnungspositionen fehlen.' using errcode='22023'; end if;
      invoice_data:=invoice_data||jsonb_build_object('subtotal',subtotal,'shipping_cost',shipping,'total',subtotal+shipping,'tax_mode',tax_mode,'tax_clause',
        case tax_mode when 'regular_19' then 'Der Gesamtbetrag enthält die gesetzliche Umsatzsteuer in Höhe von 19%.'
          when 'kleinunternehmer_19' then 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerstatus).'
          else 'Sonderregelung für Gebrauchtgegenstände nach § 25a UStG (Differenzbesteuerung). Ein gesonderter Ausweis der Umsatzsteuer erfolgt nicht.' end);
      result:=public.create_or_get_invoice(ws,source_id,order_id,invoice_data,invoice_items);
    end if;
  elsif p_action like '%vinted%' then
    if not public.marketplace_can_manage(ws) then raise insufficient_privilege; end if;
    account_id:=nullif(p_input->>'connection_id','')::uuid;
    if p_action in ('read_vinted_draft','save_vinted_draft','enqueue_vinted_listing','prepare_vinted_image_upload','import_vinted_original_photos') then
      select * into draft from public.marketplace_listing_drafts where id=(p_input->>'draft_id')::bigint and workspace_id=ws;
      if not found then raise no_data_found; end if;
      account_id:=draft.connection_id;
    end if;
    if account_id is not null and not exists(select 1 from public.ai_connection_accounts a join public.marketplace_connections c on c.id=a.connection_id
      where a.ai_connection_id=(ctx->>'id')::uuid and a.connection_id=account_id and c.workspace_id=ws and c.marketplace='vinted') then raise insufficient_privilege; end if;
    if p_action='set_vinted_price' then
      if account_id is null or not public.marketplace_can_manage_cloud(ws)
        or not exists(select 1 from public.marketplace_connections where id=account_id and workspace_id=ws and marketplace='vinted' and execution_mode='cloud' and status='connected')
        or not exists(select 1 from public.marketplace_account_entries where workspace_id=ws and connection_id=account_id and id=(p_input->>'entry_id')::uuid and kind='publication')
        or jsonb_typeof(p_input->'expected_price_cents') is distinct from 'number' or jsonb_typeof(p_input->'price_cents') is distinct from 'number'
        or p_input->>'expected_price_cents' !~ '^[1-9][0-9]{0,7}$' or p_input->>'price_cents' !~ '^[1-9][0-9]{0,7}$' then raise insufficient_privilege; end if;
      perform pg_advisory_xact_lock(91731,1);
      if exists(select 1 from public.marketplace_account_actions a where a.workspace_id=ws and a.connection_id=account_id and a.request_id=p_request_id
        and a.ai_connection_id is distinct from (ctx->>'id')::uuid) then raise unique_violation; end if;
      result:=public.marketplace_account_action_enqueue(ws,account_id,p_request_id,'price_save',
        jsonb_build_object('entryId',p_input->'entry_id','expectedPriceCents',p_input->'expected_price_cents','priceCents',p_input->'price_cents'));
      queued_action_id:=(result#>>'{action,id}')::uuid;
      update public.marketplace_account_actions set ai_connection_id=(ctx->>'id')::uuid where public_id=queued_action_id and requested_by=actor;
    elsif p_action='read_vinted_entries' then
      if account_id is null or coalesce(p_input->>'kind','') not in ('profile','publication','conversation','message','sale','activity') then raise insufficient_privilege; end if;
      select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into result from (select e.* from public.marketplace_account_entries e
        where e.workspace_id=ws and e.connection_id=account_id and e.kind=p_input->>'kind'
          and (nullif(p_input->>'id','') is null or e.id::text=p_input->>'id') order by e.sort_at desc,e.id limit 50 offset greatest(0,least(coalesce((p_input->>'offset')::integer,0),10000))) e;
    elsif p_action='import_vinted_original_photos' then
      if draft.relist_external_id is null or draft.connection_id is null then raise invalid_parameter_value; end if;
      if draft.revision is distinct from (p_input->>'expected_revision')::bigint then raise serialization_failure; end if;
      result:=jsonb_build_object('status','accepted','requestId',p_request_id);
    elsif p_action='prepare_vinted_image_upload' then
      result:=public.marketplace_reserve_listing_image(draft.id::text,p_input->>'file_name',p_input->>'mime_type',(p_input->>'byte_size')::bigint);
    elsif p_action='list_vinted_drafts' then
      select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into result from (select d.* from public.marketplace_listing_drafts d where d.workspace_id=ws
        and (d.connection_id is null or exists(select 1 from public.ai_connection_accounts where ai_connection_id=(ctx->>'id')::uuid and connection_id=d.connection_id)) order by d.updated_at desc,d.id limit 50) d;
    elsif p_action='read_vinted_draft' then result:=public.marketplace_read_listing_draft(draft.id::text);
    elsif p_action='create_vinted_draft' then result:=public.marketplace_create_listing_draft(ws,account_id,p_input->'content',nullif(p_input->>'inventory_item_id','')::uuid,p_request_id);
    elsif p_action='create_vinted_relist' then
      if account_id is null then raise insufficient_privilege; end if;
      result:=public.marketplace_create_relisting_draft(ws,account_id,p_input->'content',p_request_id,p_input->>'external_id');
    elsif p_action='save_vinted_draft' then result:=public.marketplace_save_listing_draft(draft.id::text,(p_input->>'expected_revision')::bigint,p_input->'content',account_id);
    elsif p_action='enqueue_vinted_listing' then
      if account_id is null then raise insufficient_privilege; end if;
      perform pg_advisory_xact_lock(91731,1);
      if exists(select 1 from public.marketplace_listing_jobs j where j.workspace_id=ws and j.requested_by=actor and j.request_id=p_request_id
        and j.ai_connection_id is distinct from (ctx->>'id')::uuid) then raise unique_violation; end if;
      result:=public.marketplace_enqueue_listing(draft.id::text,(p_input->>'expected_revision')::bigint,p_input->>'action',p_request_id,false,
        nullif(p_input->>'scheduled_at','')::timestamptz,p_input->>'time_zone','pause_after_30_minutes');
      update public.marketplace_listing_jobs set ai_connection_id=(ctx->>'id')::uuid where id=(result->>'id')::bigint and requested_by=actor;
    elsif p_action='read_vinted_job' then
      select to_jsonb(j)-array['snapshot','claim_token','claim_local_token_hash','provider_result'] into result from public.marketplace_listing_jobs j
        join public.ai_connection_accounts a on a.connection_id=j.connection_id where j.workspace_id=ws and j.id=(p_input->>'job_id')::bigint and a.ai_connection_id=(ctx->>'id')::uuid;
      if result is null then raise no_data_found; end if;
    else raise exception 'Unbekanntes Werkzeug.' using errcode='22023'; end if;
  else raise exception 'Unbekanntes Werkzeug.' using errcode='22023'; end if;
  perform set_config('request.jwt.claims',original_claims,true);
  if write_action then insert into public.ai_connection_requests(id,ai_connection_id,action,input,result) values(p_request_id,(ctx->>'id')::uuid,p_action,p_input,result); end if;
  return result;
exception when others then
  perform set_config('request.jwt.claims',original_claims,true);
  raise;
end $function$;

revoke all on function public.ai_connection_update(uuid,uuid,text,uuid[],text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.ai_connection_update(uuid,uuid,text,uuid[],text,uuid[]) to authenticated;
