-- Kontobezogene Verkaufskategorien; der öffentliche Suchkatalog bleibt unabhängig.
create table public.vinted_selling_category_snapshots (
  connection_id uuid primary key,
  workspace_id uuid not null,
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  categories jsonb not null check (jsonb_typeof(categories) = 'array' and jsonb_array_length(categories) between 1 and 10000),
  observed_at timestamptz not null,
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.vinted_selling_category_snapshots is 'Atomarer vollständiger Verkaufsbaum je Vinted-Konto mit originalen Kennungen; keine Zugangsdaten.';
create index vinted_selling_category_snapshots_workspace on public.vinted_selling_category_snapshots(workspace_id);
alter table public.vinted_selling_category_snapshots enable row level security;
revoke all on public.vinted_selling_category_snapshots from public, anon, authenticated;
grant select on public.vinted_selling_category_snapshots to authenticated;
grant all on public.vinted_selling_category_snapshots to service_role;
create policy "Administrators read their Vinted selling tree" on public.vinted_selling_category_snapshots
for select to authenticated using (
 public.marketplace_can_manage(workspace_id) and exists (
  select 1 from public.marketplace_connections c where c.id = connection_id
   and c.workspace_id = vinted_selling_category_snapshots.workspace_id and c.marketplace = 'vinted'
   and c.external_account_id = vinted_selling_category_snapshots.external_account_id and c.status = 'connected'
 )
);

create or replace function public.marketplace_save_vinted_selling_tree(
 p_workspace_id uuid, p_connection_id uuid, p_external_account_id text,
 p_observed_at timestamptz, p_categories jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
 perform 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id
  and c.id = p_connection_id and c.external_account_id = p_external_account_id
  and c.marketplace = 'vinted' and c.status = 'connected' for share;
 if not found then raise exception 'Vinted account binding changed'; end if;
 if p_categories is null or jsonb_typeof(p_categories) <> 'array' or p_observed_at is null
  or p_observed_at > clock_timestamp() + interval '5 minutes' then raise exception 'Invalid selling tree'; end if;
 v_count := jsonb_array_length(p_categories);
 if v_count not between 1 and 10000 then raise exception 'Invalid selling tree count'; end if;
 if exists (
  select 1 from jsonb_array_elements(p_categories) n where
   jsonb_typeof(n) <> 'object' or not (n ?& array['id','parentId','title','path','isLeaf'])
   or jsonb_typeof(n->'id') <> 'number' or (n->>'id') !~ '^[1-9][0-9]{0,9}$'
   or (n->>'id')::numeric > 2147483647
   or not (n->'parentId' = 'null'::jsonb or (jsonb_typeof(n->'parentId') = 'number' and (n->>'parentId') ~ '^[1-9][0-9]{0,9}$'))
   or jsonb_typeof(n->'title') <> 'string' or char_length(btrim(n->>'title')) not between 1 and 200
   or jsonb_typeof(n->'path') <> 'string' or char_length(n->>'path') not between 1 and 2000
   or jsonb_typeof(n->'isLeaf') <> 'boolean'
 ) or (select count(distinct n->>'id') from jsonb_array_elements(p_categories) n) <> v_count
 then raise exception 'Invalid selling tree nodes'; end if;
 if (with recursive nodes as (
   select (n->>'id')::bigint id, (n->>'parentId')::bigint parent_id, n->>'title' title,
    n->>'path' path, (n->>'isLeaf')::boolean is_leaf from jsonb_array_elements(p_categories) n
  ), tree as (
   select id, title::text path, array[id] visited from nodes where parent_id is null
   union all select n.id, t.path || ' > ' || n.title, t.visited || n.id from nodes n join tree t on n.parent_id = t.id
    where not n.id = any(t.visited) and cardinality(t.visited) < 30
  ) select count(*) from nodes n join tree t on t.id = n.id where t.path = n.path
    and n.is_leaf = not exists(select 1 from nodes child where child.parent_id = n.id)) <> v_count
 then raise exception 'Incomplete selling tree'; end if;
 insert into public.vinted_selling_category_snapshots(connection_id, workspace_id, external_account_id, categories, observed_at)
 values(p_connection_id, p_workspace_id, p_external_account_id, p_categories, p_observed_at)
 on conflict(connection_id) do update set workspace_id = excluded.workspace_id,
  external_account_id = excluded.external_account_id, categories = excluded.categories, observed_at = excluded.observed_at
 where vinted_selling_category_snapshots.external_account_id <> excluded.external_account_id
  or vinted_selling_category_snapshots.observed_at <= excluded.observed_at;
end;
$$;
revoke all on function public.marketplace_save_vinted_selling_tree(uuid,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_save_vinted_selling_tree(uuid,uuid,text,timestamptz,jsonb) to service_role;
