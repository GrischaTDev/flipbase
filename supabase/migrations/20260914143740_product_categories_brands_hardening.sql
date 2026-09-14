-- zweck: markenrechte auf die von den policies abgedeckten operationen begrenzen
-- und exakte kategorietexte beim normalen schreiben in category_id auflösen.
-- betroffen: public.brands, public.sync_category_brand_text().
-- die einmalige entscheidung, alte freie kategorietexte in der übernahmemigration
-- zu verwerfen, bleibt unverändert.

revoke all on table public.brands from anon, authenticated;
grant select, insert, update, delete on table public.brands to authenticated;

create or replace function public.sync_category_brand_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brand_name text;
begin
  if (tg_op = 'INSERT' and new.brand_id is null)
    or (tg_op = 'UPDATE'
      and new.brand_id is not distinct from old.brand_id
      and new.brand is distinct from old.brand)
  then
    v_brand_name := pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(coalesce(new.brand, '')), 120));
    if v_brand_name = '' then
      new.brand_id := null;
    else
      insert into public.brands (workspace_id, name)
      values (new.workspace_id, v_brand_name)
      on conflict (workspace_id, name_key) do nothing;

      select brand.id into new.brand_id
      from public.brands as brand
      where brand.workspace_id = new.workspace_id
        and brand.name_key = pg_catalog.lower(v_brand_name);
    end if;
  end if;

  if new.brand_id is null then
    new.brand := null;
  else
    select brand.name into new.brand
    from public.brands as brand
    where brand.workspace_id = new.workspace_id
      and brand.id = new.brand_id;
  end if;

  if new.category_id is null and new.category is not null then
    select category.id into new.category_id
    from public.product_categories as category
    where category.full_name = new.category
    order by category.id
    limit 1;
  end if;

  if new.category_id is null then
    new.category := null;
  else
    select category.full_name into new.category
    from public.product_categories as category
    where category.id = new.category_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.sync_category_brand_text() from public, anon, authenticated, service_role;
