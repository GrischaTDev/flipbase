-- Shopfreigabe und freiwillige Nutzung sind getrennt; vorhandene Nutzung bleibt aktiv.
alter table public.workspaces add column shop_enabled boolean not null default false;
alter table public.workspaces add column shop_entitled boolean not null default true;
alter table public.workspaces add column shop_version bigint not null default 0;
update public.workspaces set shop_enabled = true;

-- Nur eng begrenzte Serverfunktionen dürfen frühere Lagerbuchungen abwickeln.
-- Die Zeilen bestehen ausschließlich während des jeweiligen Funktionsaufrufs.
create table public.shop_history_operations (
  transaction_id bigint not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation text not null check (operation in ('refund','purchase_correction','purchase_reopen','purchase_draft_delete','reservation_release')),
  entity_id uuid not null,
  primary key(transaction_id,workspace_id,operation,entity_id)
);
comment on table public.shop_history_operations is 'Interne Transaktionsfreigabe für die Abwicklung bereits bestehender Lagerbuchungen bei pausiertem Shop.';
alter table public.shop_history_operations enable row level security;
revoke all on public.shop_history_operations from public,anon,authenticated,service_role;
create policy "shop history anon select" on public.shop_history_operations for select to anon using(false);
create policy "shop history anon insert" on public.shop_history_operations for insert to anon with check(false);
create policy "shop history anon update" on public.shop_history_operations for update to anon using(false) with check(false);
create policy "shop history anon delete" on public.shop_history_operations for delete to anon using(false);
create policy "shop history member select" on public.shop_history_operations for select to authenticated using(false);
create policy "shop history member insert" on public.shop_history_operations for insert to authenticated with check(false);
create policy "shop history member update" on public.shop_history_operations for update to authenticated using(false) with check(false);
create policy "shop history member delete" on public.shop_history_operations for delete to authenticated using(false);

create function public.workspace_shop_active(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (((select auth.uid()) is not null and public.can_access_workspace(p_workspace_id))
      or ((select auth.uid()) is null and ((select auth.jwt())->>'role'='service_role' or session_user in('postgres','supabase_admin'))))
    and exists(select 1 from public.workspaces where id=p_workspace_id and shop_enabled and shop_entitled)
    and (not exists(select 1 from public.workspace_licenses where workspace_id=p_workspace_id)
      or public.workspace_access_is_valid(p_workspace_id));
$$;
revoke all on function public.workspace_shop_active(uuid) from public,anon;
grant execute on function public.workspace_shop_active(uuid) to authenticated,service_role;

create function public.lock_workspace_shop(p_workspace_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('workspace_shop:'||p_workspace_id::text,0));
$$;
revoke all on function public.lock_workspace_shop(uuid) from public,anon;
grant execute on function public.lock_workspace_shop(uuid) to authenticated,service_role;

create function public.assert_workspace_shop(p_workspace_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.lock_workspace_shop(p_workspace_id);
  if not public.workspace_shop_active(p_workspace_id) then
    raise exception using errcode='42501',message='Die Bestandsführung ist ausgeschaltet oder nicht freigeschaltet. Deine Eingaben bleiben erhalten.';
  end if;
end;
$$;
revoke all on function public.assert_workspace_shop(uuid) from public,anon;
grant execute on function public.assert_workspace_shop(uuid) to authenticated,service_role;

create function public.get_workspace_shop_state(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Arbeitsbereich.';
  end if;
  select pg_catalog.jsonb_build_object('workspace_id',id,'shop_enabled',shop_enabled,
    'shop_entitled',shop_entitled,'shop_version',shop_version) into result
    from public.workspaces where id=p_workspace_id;
  return result;
end;
$$;
revoke all on function public.get_workspace_shop_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_workspace_shop_state(uuid) to authenticated;

create function public.set_workspace_shop_enabled(p_workspace_id uuid,p_enabled boolean,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare state public.workspaces;
begin
  if (select auth.uid()) is null or not public.can_access_workspace(p_workspace_id) or not exists(
    select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=(select auth.uid()) and role in('owner','admin')
  ) then raise exception using errcode='42501',message='Nur Owner und Admin können die Bestandsführung ändern.'; end if;
  perform public.lock_workspace_shop(p_workspace_id);
  select * into strict state from public.workspaces where id=p_workspace_id for update;
  if p_expected_version is null or state.shop_version<>p_expected_version then
    raise exception using errcode='40001',message='Die Shop-Einstellung hat sich geändert. Bitte prüfe den aktuellen Stand.';
  end if;
  if p_enabled is null or (p_enabled and not state.shop_entitled) then
    raise exception using errcode='42501',message='Die Shop-Funktion ist für diesen Arbeitsbereich nicht freigeschaltet.';
  end if;
  update public.workspaces set shop_enabled=p_enabled where id=p_workspace_id;
  return public.get_workspace_shop_state(p_workspace_id);
end;
$$;
revoke all on function public.set_workspace_shop_enabled(uuid,boolean,bigint) from public,anon,authenticated,service_role;
grant execute on function public.set_workspace_shop_enabled(uuid,boolean,bigint) to authenticated;

create function public.set_workspace_shop_entitlement(p_workspace_id uuid,p_entitled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_operator() or p_entitled is null then
    raise exception using errcode='42501',message='Die Shop-Freigabe kann nur die Plattformverwaltung ändern.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  update public.workspaces set shop_entitled=p_entitled where id=p_workspace_id;
  return pg_catalog.jsonb_build_object('workspace_id',p_workspace_id,'shop_entitled',p_entitled);
end;
$$;
revoke all on function public.set_workspace_shop_entitlement(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_workspace_shop_entitlement(uuid,boolean) to authenticated;

create function public.guard_workspace_shop_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if current_user not in('postgres','supabase_admin') and (new.shop_enabled or not new.shop_entitled or new.shop_version<>0) then
      raise exception using errcode='42501',message='Shop-Einstellungen können nur über die Einstellungen geändert werden.';
    end if;
    return new;
  end if;
  if (new.shop_enabled,new.shop_entitled,new.shop_version) is distinct from (old.shop_enabled,old.shop_entitled,old.shop_version) then
    if current_user not in('postgres','supabase_admin') then
      raise exception using errcode='42501',message='Shop-Einstellungen können nur über die Einstellungen geändert werden.';
    end if;
    perform public.lock_workspace_shop(old.id);
    if not new.shop_entitled then new.shop_enabled:=false; end if;
    new.shop_version:=old.shop_version+1;
  end if;
  return new;
end;
$$;
create trigger protect_workspace_shop_fields before insert or update on public.workspaces
for each row execute function public.guard_workspace_shop_fields();

create function public.workspace_shop_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare draft record;
begin
  if (new.shop_enabled,new.shop_entitled) is not distinct from (old.shop_enabled,old.shop_entitled) then return new; end if;
  if old.shop_enabled and not new.shop_enabled then
    insert into public.shop_history_operations values(pg_catalog.txid_current(),new.id,'reservation_release',new.id);
    for draft in select id from public.ebay_sale_drafts where workspace_id=new.id and state not in('booked','linked_existing','dismissed') order by id loop
      perform public.ebay_release_sale_reservations(draft.id);
      update public.ebay_sale_drafts set requires_explicit_preparation=true,updated_at=pg_catalog.clock_timestamp() where id=draft.id;
    end loop;
    delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=new.id and operation='reservation_release';
  end if;
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,changes)
  values(new.id,'workspace',new.id,'workspace_shop_changed',(select auth.uid()),pg_catalog.jsonb_build_object(
    'shop_enabled',pg_catalog.jsonb_build_object('before',old.shop_enabled,'after',new.shop_enabled),
    'shop_entitled',pg_catalog.jsonb_build_object('before',old.shop_entitled,'after',new.shop_entitled),'version',new.shop_version));
  perform realtime.send(pg_catalog.jsonb_build_object('version',new.shop_version),'workspace_shop_changed','workspace:'||new.id::text||':shop',true);
  return new;
end;
$$;
create trigger broadcast_workspace_shop_changed after update on public.workspaces
for each row execute function public.workspace_shop_changed();

create function public.guard_workspace_stock_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare row_value jsonb; workspace uuid; history_allowed boolean:=false;
begin
  row_value:=case when tg_op='DELETE' then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  workspace:=(row_value->>'workspace_id')::uuid;
  if workspace is null and tg_table_name='item_media' then
    select workspace_id into workspace from public.inventory_items where id=(row_value->>'inventory_item_id')::uuid;
  end if;
  if workspace is null and tg_table_name='store_order_items' then
    select workspace_id into workspace from public.store_orders where id=coalesce((row_value->>'order_id')::uuid,(row_value->>'store_order_id')::uuid);
  end if;
  -- FK-Kaskaden räumen ausschließlich Kinder einer bereits autorisiert gelöschten Zeile auf.
  if tg_op='DELETE' and pg_catalog.pg_trigger_depth()>1 and (
    (workspace is null and tg_table_name in('item_media','store_order_items'))
    or (workspace is not null and not exists(select 1 from public.workspaces where id=workspace))
  ) then return old; end if;
  if tg_op='INSERT' and tg_table_name in('inventory_items','stock_lots') and exists(
    select 1 from public.purchase_lines where id=coalesce((row_value->>'purchase_line_id')::uuid,(row_value->>'source_package_line_id')::uuid) and position_kind='free'
  ) then raise exception using errcode='22023',message='Freie Einkaufspositionen erzeugen keinen Bestand.'; end if;
  if tg_table_name in('purchase_lines','sale_lines') and row_value->>'position_kind'='free' then
    if tg_table_name='purchase_lines' and tg_op='UPDATE' and old.position_kind='stock' then perform public.assert_workspace_shop(workspace); end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  perform public.lock_workspace_shop(workspace);
  if public.workspace_shop_active(workspace) then return case when tg_op='DELETE' then old else new end; end if;
  if tg_table_name='store_orders' and tg_op='UPDATE' and
    pg_catalog.to_jsonb(new)-array['payment_status','payment_id','updated_at']=pg_catalog.to_jsonb(old)-array['payment_status','payment_id','updated_at'] then return new; end if;
  if current_user in('postgres','supabase_admin') then
    select exists(select 1 from public.shop_history_operations context
      where context.transaction_id=pg_catalog.txid_current() and context.workspace_id=workspace and (
        (context.operation='reservation_release' and tg_table_name in('inventory_items','stock_movements'))
        or (context.operation='purchase_draft_delete' and tg_table_name='purchase_lines' and tg_op='DELETE' and row_value->>'purchase_id'=context.entity_id::text)
        or (context.operation in('purchase_correction','purchase_reopen') and
          (row_value->>'purchase_id'=context.entity_id::text or exists(select 1 from public.stock_lots where id=(row_value->>'stock_lot_id')::uuid and purchase_id=context.entity_id)))
        or (context.operation='purchase_correction' and tg_table_name='sale_lines' and tg_op='UPDATE' and (
          exists(select 1 from public.inventory_items item
            left join public.purchase_lines line on line.id=coalesce(item.purchase_line_id,item.source_package_line_id)
            where item.id=(row_value->>'inventory_item_id')::uuid and item.workspace_id=workspace
              and (item.purchase_id=context.entity_id or line.purchase_id=context.entity_id))
          or exists(select 1 from public.sale_line_lot_allocations allocation
            join public.stock_lots lot on lot.id=allocation.stock_lot_id
            where allocation.sale_line_id=(row_value->>'id')::uuid and allocation.workspace_id=workspace
              and lot.workspace_id=workspace and lot.purchase_id=context.entity_id)
        ))
        or (context.operation='refund' and (
          exists(select 1 from public.sale_lines where sale_id=context.entity_id and inventory_item_id=(row_value->>'id')::uuid)
          or exists(select 1 from public.sale_line_lot_allocations allocation join public.sale_lines line on line.id=allocation.sale_line_id where line.sale_id=context.entity_id and allocation.stock_lot_id=coalesce((row_value->>'stock_lot_id')::uuid,(row_value->>'id')::uuid))
        ))
      )) into history_allowed;
  end if;
  if history_allowed and not(tg_op='INSERT' and tg_table_name in('inventory_items','stock_lots','purchase_lines','sale_lines')) then
    return case when tg_op='DELETE' then old else new end;
  end if;
  perform public.assert_workspace_shop(workspace);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger protect_shop_catalog before insert or update or delete on public.catalog_products for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_catalog_media before insert or update or delete on public.catalog_product_media for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_item_media before insert or update or delete on public.item_media for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_inventory before insert or update or delete on public.inventory_items for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_lots before insert or update or delete on public.stock_lots for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_movements before insert or update or delete on public.stock_movements for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_purchase_lines before insert or update or delete on public.purchase_lines for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_sale_lines before insert or update or delete on public.sale_lines for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_orders before insert or update or delete on public.store_orders for each row execute function public.guard_workspace_stock_write();
create trigger protect_shop_order_items before insert or update or delete on public.store_order_items for each row execute function public.guard_workspace_stock_write();

-- Die bisherigen Implementierungen bleiben unverändert erhalten. Nur diese
-- autorisierten Aufrufe setzen die interne, transaktionsgebundene Freigabe.
alter function public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text) rename to record_sale_return_with_inventory;
revoke all on function public.record_sale_return_with_inventory(uuid,uuid,numeric,boolean,text,text,text,text) from public,anon,authenticated,service_role;
create function public.record_sale_return(p_workspace_id uuid,p_sale_id uuid,p_refund_amount numeric,p_restock boolean,p_reason text,p_notes text,p_restock_action text,p_buyer_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  insert into public.shop_history_operations values(pg_catalog.txid_current(),p_workspace_id,'refund',p_sale_id);
  result:=public.record_sale_return_with_inventory(p_workspace_id,p_sale_id,p_refund_amount,p_restock,p_reason,p_notes,p_restock_action,p_buyer_name);
  delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=p_workspace_id and operation='refund' and entity_id=p_sale_id;
  return result;
end;
$$;
revoke all on function public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_sale_return(uuid,uuid,numeric,boolean,text,text,text,text) to authenticated;

alter function public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb) rename to correct_purchase_costing_with_inventory;
revoke all on function public.correct_purchase_costing_with_inventory(uuid,uuid,text,numeric,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.correct_purchase_costing(p_workspace_id uuid,p_purchase_id uuid,p_reason text,p_purchase_price numeric,p_lines jsonb,p_costs jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  insert into public.shop_history_operations values(pg_catalog.txid_current(),p_workspace_id,'purchase_correction',p_purchase_id);
  result:=public.correct_purchase_costing_with_inventory(p_workspace_id,p_purchase_id,p_reason,p_purchase_price,p_lines,p_costs);
  delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=p_workspace_id and operation='purchase_correction' and entity_id=p_purchase_id;
  return result;
end;
$$;
revoke all on function public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.correct_purchase_costing(uuid,uuid,text,numeric,jsonb,jsonb) to authenticated;

alter function public.reopen_purchase_costing(uuid,uuid) rename to reopen_purchase_costing_with_inventory;
revoke all on function public.reopen_purchase_costing_with_inventory(uuid,uuid) from public,anon,authenticated,service_role;
create function public.reopen_purchase_costing(p_workspace_id uuid,p_purchase_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_access_workspace(p_workspace_id) then
    raise exception using errcode='42501',message='Kein Zugriff auf diesen Workspace.';
  end if;
  perform public.lock_workspace_shop(p_workspace_id);
  insert into public.shop_history_operations values(pg_catalog.txid_current(),p_workspace_id,'purchase_reopen',p_purchase_id);
  result:=public.reopen_purchase_costing_with_inventory(p_workspace_id,p_purchase_id);
  delete from public.shop_history_operations where transaction_id=pg_catalog.txid_current() and workspace_id=p_workspace_id and operation='purchase_reopen' and entity_id=p_purchase_id;
  return result;
end;
$$;
revoke all on function public.reopen_purchase_costing(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reopen_purchase_costing(uuid,uuid) to authenticated;

create policy "Mitglieder empfangen Shopänderungen" on realtime.messages for select to authenticated
using(extension='broadcast' and topic like 'workspace:%:shop' and exists(
  select 1 from public.workspace_members where user_id=(select auth.uid()) and topic='workspace:'||workspace_id::text||':shop'));

-- Historische Medien bleiben lesbar; neue Lager-/Katalogmedien benötigen einen aktiven Shop.
alter policy "Produktmedien aendern" on storage.objects using (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member)))))) with check (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member))))));

alter policy "Artikelmedien hochladen" on storage.objects with check (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM inventory_items i
  WHERE (((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member))))));

alter policy "Produktmedien hochladen" on storage.objects with check (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member))))));

alter policy "Artikelmedien aendern" on storage.objects using (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM (item_media m
     JOIN inventory_items i ON ((i.id = m.inventory_item_id)))
  WHERE ((m.storage_path = objects.name) AND ((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member)))))) with check (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM (item_media m
     JOIN inventory_items i ON ((i.id = m.inventory_item_id)))
  WHERE ((m.storage_path = objects.name) AND ((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member))))));

alter policy "Artikelmedien loeschen" on storage.objects using (((bucket_id = 'item-media'::text) AND (split_part(name, '/'::text, 1) <> 'catalog-products'::text) AND (cardinality(storage.foldername(name)) = 1) AND (storage.filename(name) <> ''::text) AND (EXISTS ( SELECT 1
   FROM (item_media m
     JOIN inventory_items i ON ((i.id = m.inventory_item_id)))
  WHERE ((m.storage_path = objects.name) AND ((i.id)::text = (storage.foldername(objects.name))[1]) AND ( SELECT public.can_access_workspace(i.workspace_id) and public.workspace_shop_active(i.workspace_id) AS is_workspace_member))))));

alter policy "Produktmedien loeschen" on storage.objects using (((bucket_id = 'item-media'::text) AND (EXISTS ( SELECT 1
   FROM catalog_products p
  WHERE (((p.workspace_id)::text = (storage.foldername(objects.name))[2]) AND ((p.id)::text = (storage.foldername(objects.name))[3]) AND is_catalog_product_media_path(objects.name, p.workspace_id, p.id) AND ( SELECT public.can_access_workspace(p.workspace_id) and public.workspace_shop_active(p.workspace_id) AS is_workspace_member))))));

revoke all on function public.guard_workspace_shop_fields() from public,anon,authenticated,service_role;
revoke all on function public.guard_workspace_stock_write() from public,anon,authenticated,service_role;
revoke all on function public.workspace_shop_changed() from public,anon,authenticated,service_role;
