-- Workspace-Lebenszyklus: lesbare Archive, gesperrte Geschäftsdaten.
-- Die explizite Triggerliste unten ist das verbindliche Tabelleninventar.

create or replace function public.protect_workspace_archive_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Kein Sitzungsflag: nur die privilegierte, autorisierte RPC darf ändern.
  if current_user <> 'postgres' and (
    (tg_op = 'INSERT' and new.archived_at is not null)
    or (tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at)
  ) then
    raise exception using errcode = '42501',
      message = 'Archivstatus darf nur über die Workspace-Aktionen geändert werden.';
  end if;
  return new;
end;
$$;

create trigger protect_workspace_archive_state
before insert or update on public.workspaces
for each row execute function public.protect_workspace_archive_state();

create or replace function public.set_workspace_archive_state(p_workspace_id uuid, p_archived boolean)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
  v_before timestamptz;
begin
  -- Mitgliedschaft sperren: parallel entzogene Inhaberrechte dürfen nicht
  -- zwischen Berechtigungsprüfung und Änderung wirksam werden.
  perform 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = (select auth.uid()) and role = 'owner'
    for share;
  if not found then
    raise exception using errcode = '42501',
      message = 'Nur der Inhaber darf den Workspace archivieren oder wiederherstellen.';
  end if;
  -- FOR SHARE der operativen Trigger kollidiert hiermit bis Transaktionsende.
  select * into strict v_workspace from public.workspaces
    where id = p_workspace_id for update;
  if (v_workspace.archived_at is not null) = p_archived then
    return v_workspace;
  end if;
  v_before := v_workspace.archived_at;
  update public.workspaces
    set archived_at = case when p_archived then clock_timestamp() else null end,
        updated_at = clock_timestamp()
    where id = p_workspace_id returning * into v_workspace;
  insert into public.business_events(workspace_id,entity_type,entity_id,event_type,actor_id,changes)
    values(p_workspace_id,'workspace',p_workspace_id,
      case when p_archived then 'workspace_archived' else 'workspace_restored' end,
      (select auth.uid()),
      jsonb_build_object('archived_at',jsonb_build_object('before',v_before,'after',v_workspace.archived_at)));
  return v_workspace;
end;
$$;

create or replace function public.archive_workspace(p_workspace_id uuid)
returns public.workspaces
language sql
security definer
set search_path = ''
as $$ select public.set_workspace_archive_state(p_workspace_id, true); $$;

create or replace function public.restore_workspace(p_workspace_id uuid)
returns public.workspaces
language sql
security definer
set search_path = ''
as $$ select public.set_workspace_archive_state(p_workspace_id, false); $$;

revoke execute on function public.set_workspace_archive_state(uuid,boolean) from public,anon,authenticated,service_role;
revoke execute on function public.protect_workspace_archive_state() from public,anon,authenticated,service_role;
revoke execute on function public.archive_workspace(uuid) from public,anon,service_role;
revoke execute on function public.restore_workspace(uuid) from public,anon,service_role;
grant execute on function public.archive_workspace(uuid) to authenticated;
grant execute on function public.restore_workspace(uuid) to authenticated;

create or replace function public.protect_archived_workspace_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_workspace_id uuid;
  v_archived_at timestamptz;
  v_rows jsonb[];
begin
  v_rows := case tg_op when 'INSERT' then array[to_jsonb(new)]
    when 'DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end;
  foreach v_row in array v_rows loop
    v_workspace_id := null;
    if tg_nargs = 0 then
      v_workspace_id := (v_row ->> 'workspace_id')::uuid;
    else
      -- TG_ARGV stammt ausschließlich aus der festen Triggerregistrierung.
      -- Eltern sperren verhindert paralleles Umhängen während der Prüfung.
      execute format('select workspace_id from public.%I where id = $1 for share',tg_argv[0])
        into v_workspace_id using (v_row ->> tg_argv[1])::uuid;
    end if;
    if v_workspace_id is not null then
      select archived_at into v_archived_at from public.workspaces
        where id = v_workspace_id for share;
      if v_archived_at is not null then
        raise exception using errcode = '55000',
          message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
      end if;
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.protect_archived_workspace_data() from public,anon,authenticated,service_role;

-- Vor allen Fachtriggern ausführen; auch SECURITY DEFINER und service_role
-- durchlaufen diese Sperre. Geschäftsjournal bleibt intern beschreibbar.
-- Einstellungen, Mitglieder und globale Sniper-Sammler sind bewusst ausgenommen.
create trigger "00_protect_archived_workspace" before insert or update or delete on public.purchases
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.purchase_lines
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.purchase_costs
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.inventory_items
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.inventory_reconciliation_events
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.sales
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.sale_lines
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.sale_cost_entries
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.sale_line_lot_allocations
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.stock_lots
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.stock_movements
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.returns
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.invoices
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.shipping_orders
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.store_orders
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.bank_transactions
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.offline_purchase_entries
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.cash_wallet_sessions
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.catalog_products
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.catalog_product_media
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.purchase_receipt_requests
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.email_confirmations
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.market_research
for each row execute function public.protect_archived_workspace_data();
create trigger "00_protect_archived_workspace" before insert or update or delete on public.activity_logs
for each row execute function public.protect_archived_workspace_data();

-- Kinder ohne workspace_id: alte und neue Eltern prüfen.
create trigger "00_protect_archived_workspace" before insert or update or delete on public.invoice_items
for each row execute function public.protect_archived_workspace_data('invoices','invoice_id');
create trigger "00_protect_archived_workspace" before insert or update or delete on public.item_costs
for each row execute function public.protect_archived_workspace_data('inventory_items','inventory_item_id');
create trigger "00_protect_archived_workspace" before insert or update or delete on public.item_media
for each row execute function public.protect_archived_workspace_data('inventory_items','inventory_item_id');
create trigger "00_protect_archived_workspace" before insert or update or delete on public.listing_drafts
for each row execute function public.protect_archived_workspace_data('inventory_items','inventory_item_id');
create trigger "00_protect_archived_workspace" before insert or update or delete on public.store_order_items
for each row execute function public.protect_archived_workspace_data('store_orders','store_order_id');
create trigger "00_protect_archived_workspace" before insert or update or delete on public.research_comparables
for each row execute function public.protect_archived_workspace_data('market_research','research_id');

-- Storage-Dateien müssen dieselbe Archivierungssperre wie ihre Metadaten halten.
-- SECURITY DEFINER ist nur für die vollständige Elternauflösung und Zeilensperren
-- nötig; die eigentliche Zugriffsberechtigung bleibt bei den Storage-RLS-Policies.
create function public.protect_workspace_media_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_rows jsonb[];
  v_path text;
  v_workspace record;
begin
  if tg_op = 'UPDATE' and (
    (old.bucket_id = 'item-media' and split_part(old.name,'/',1) = 'catalog-products')
    or (new.bucket_id = 'item-media' and split_part(new.name,'/',1) = 'catalog-products')
  ) and (old.bucket_id,old.name) is distinct from (new.bucket_id,new.name) then
    raise exception using errcode = '42501',
      message = 'Der Speicherpfad eines Produktmediums darf nicht geändert werden.';
  end if;

  v_rows := case tg_op when 'INSERT' then array[to_jsonb(new)]
    when 'DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end;
  foreach v_row in array v_rows loop
    if v_row ->> 'bucket_id' <> 'item-media' then continue; end if;
    v_path := v_row ->> 'name';
    -- UUIDs werden als Text verglichen: ungültige Fremdpfade lösen keinen Castfehler aus.
    for v_workspace in
      select w.id,w.archived_at from public.workspaces w
      where w.id in (
        select p.workspace_id from public.catalog_products p
        where p.workspace_id::text = split_part(v_path,'/',2)
          and p.id::text = split_part(v_path,'/',3)
          and public.is_catalog_product_media_path(v_path,p.workspace_id,p.id)
        union
        select i.workspace_id from public.inventory_items i
        where split_part(v_path,'/',1) <> 'catalog-products'
          and cardinality(storage.foldername(v_path)) = 1
          and i.id::text = (storage.foldername(v_path))[1]
      )
      order by w.id for share of w
    loop
      if v_workspace.archived_at is not null then
        raise exception using errcode = '55000',
          message = 'Dieser Workspace ist archiviert. Vor Änderungen bitte wiederherstellen.';
      end if;
    end loop;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.protect_workspace_media_object() from public,anon,authenticated,service_role;
create trigger "00_protect_workspace_media_object"
  before insert or update or delete on storage.objects
  for each row execute function public.protect_workspace_media_object();

-- Ergänzung des festen Retention-Inventars nach Anlage der Produktmedientabelle.
create or replace function public.prevent_workspace_with_business_data_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.purchases where workspace_id = old.id)
    or exists (select 1 from public.inventory_items where workspace_id = old.id)
    or exists (select 1 from public.stock_lots where workspace_id = old.id)
    or exists (select 1 from public.stock_movements where workspace_id = old.id)
    or exists (select 1 from public.sales where workspace_id = old.id)
    or exists (select 1 from public.inventory_reconciliation_events where workspace_id = old.id)
    or exists (select 1 from public.business_events where workspace_id = old.id)
    or exists (select 1 from public.activity_logs where workspace_id = old.id)
    or exists (select 1 from public.returns where workspace_id = old.id)
    or exists (select 1 from public.invoices where workspace_id = old.id)
    or exists (select 1 from public.email_confirmations where workspace_id = old.id)
    or exists (select 1 from public.shipping_orders where workspace_id = old.id)
    or exists (select 1 from public.store_orders where workspace_id = old.id)
    or exists (select 1 from public.bank_transactions where workspace_id = old.id)
    or exists (select 1 from public.offline_purchase_entries where workspace_id = old.id)
    or exists (select 1 from public.cash_wallet_sessions where workspace_id = old.id)
    or exists (select 1 from public.catalog_product_media where workspace_id = old.id)
    or exists (select 1 from public.purchase_receipt_requests where workspace_id = old.id) then
    raise exception using errcode = 'P0001',
      message = 'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.';
  end if;
  return old;
end;
$$;
