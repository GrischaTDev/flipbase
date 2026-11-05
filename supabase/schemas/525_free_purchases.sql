-- Freie Einkaufspositionen bewahren Menge und Kosten ohne Bestandsanlage.
alter table public.purchase_lines add column position_kind text not null default 'stock'
  check (position_kind in ('stock', 'free'));
alter table public.purchase_lines add constraint free_purchase_line_target
  check (position_kind <> 'free' or (catalog_product_id is null and line_kind = 'individual' and not is_package));
alter table public.sale_lines add column purchase_id uuid references public.purchases(id) on delete restrict;
create index sale_lines_purchase_idx on public.sale_lines(purchase_id);

create function public.guard_free_purchase_line()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.position_kind is distinct from old.position_kind
    and (old.received_quantity > 0 or exists(select 1 from public.purchases where id = old.purchase_id and entry_status = 'finalized')) then
    raise exception using errcode = '22023', message = 'Die Erfassungsart einer gebuchten Einkaufsposition bleibt erhalten.';
  end if;
  return new;
end;
$$;
create trigger protect_free_purchase_line before update on public.purchase_lines
for each row execute function public.guard_free_purchase_line();

create function public.guard_sale_purchase_reference()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.purchase_id is distinct from old.purchase_id then
    raise exception using errcode='22023',message='Die gebuchte Einkaufszuordnung kann nicht direkt überschrieben werden.';
  end if;
  if new.purchase_id is not null and (new.position_kind <> 'free' or not exists (
    select 1 from public.purchases where id = new.purchase_id and workspace_id = new.workspace_id and entry_status = 'finalized'
  )) then
    raise exception using errcode = '22023', message = 'Bitte wähle einen abgeschlossenen Einkauf dieses Arbeitsbereichs.';
  end if;
  return new;
end;
$$;
create trigger protect_sale_purchase_reference before insert or update on public.sale_lines
for each row execute function public.guard_sale_purchase_reference();

revoke all on function public.guard_free_purchase_line() from public,anon,authenticated,service_role;
revoke all on function public.guard_sale_purchase_reference() from public,anon,authenticated,service_role;
