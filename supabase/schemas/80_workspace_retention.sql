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
