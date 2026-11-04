-- Kontobezogene Verkaufsbäume in public.vinted_selling_category_snapshots.
-- Supabase db diff --use-migra; Rechte und Tabellenkommentar aus der deklarativen Quelle übernommen.

  create table "public"."vinted_selling_category_snapshots" (
    "connection_id" uuid not null,
    "workspace_id" uuid not null,
    "external_account_id" text not null,
    "categories" jsonb not null,
    "observed_at" timestamp with time zone not null
      );


alter table "public"."vinted_selling_category_snapshots" enable row level security;

CREATE UNIQUE INDEX vinted_selling_category_snapshots_pkey ON public.vinted_selling_category_snapshots USING btree (connection_id);

CREATE INDEX vinted_selling_category_snapshots_workspace ON public.vinted_selling_category_snapshots USING btree (workspace_id);

alter table "public"."vinted_selling_category_snapshots" add constraint "vinted_selling_category_snapshots_pkey" PRIMARY KEY using index "vinted_selling_category_snapshots_pkey";

alter table "public"."vinted_selling_category_snapshots" add constraint "vinted_selling_category_snapsho_workspace_id_connection_id_fkey" FOREIGN KEY (workspace_id, connection_id) REFERENCES public.marketplace_connections(workspace_id, id) ON DELETE CASCADE not valid;

alter table "public"."vinted_selling_category_snapshots" validate constraint "vinted_selling_category_snapsho_workspace_id_connection_id_fkey";

alter table "public"."vinted_selling_category_snapshots" add constraint "vinted_selling_category_snapshots_categories_check" CHECK (((jsonb_typeof(categories) = 'array'::text) AND ((jsonb_array_length(categories) >= 1) AND (jsonb_array_length(categories) <= 10000)))) not valid;

alter table "public"."vinted_selling_category_snapshots" validate constraint "vinted_selling_category_snapshots_categories_check";

alter table "public"."vinted_selling_category_snapshots" add constraint "vinted_selling_category_snapshots_external_account_id_check" CHECK ((external_account_id ~ '^[1-9][0-9]{0,31}$'::text)) not valid;

alter table "public"."vinted_selling_category_snapshots" validate constraint "vinted_selling_category_snapshots_external_account_id_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.marketplace_save_vinted_selling_tree(p_workspace_id uuid, p_connection_id uuid, p_external_account_id text, p_observed_at timestamp with time zone, p_categories jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

grant select on table "public"."vinted_selling_category_snapshots" to "authenticated";

grant delete on table "public"."vinted_selling_category_snapshots" to "service_role";

grant insert on table "public"."vinted_selling_category_snapshots" to "service_role";

grant references on table "public"."vinted_selling_category_snapshots" to "service_role";

grant select on table "public"."vinted_selling_category_snapshots" to "service_role";

grant trigger on table "public"."vinted_selling_category_snapshots" to "service_role";

grant truncate on table "public"."vinted_selling_category_snapshots" to "service_role";

grant update on table "public"."vinted_selling_category_snapshots" to "service_role";


  create policy "Administrators read their Vinted selling tree"
  on "public"."vinted_selling_category_snapshots"
  as permissive
  for select
  to authenticated
using ((public.marketplace_can_manage(workspace_id) AND (EXISTS ( SELECT 1
   FROM public.marketplace_connections c
  WHERE ((c.id = vinted_selling_category_snapshots.connection_id) AND (c.workspace_id = vinted_selling_category_snapshots.workspace_id) AND (c.marketplace = 'vinted'::text) AND (c.external_account_id = vinted_selling_category_snapshots.external_account_id) AND (c.status = 'connected'::text))))));




comment on table public.vinted_selling_category_snapshots is 'Atomarer vollständiger Verkaufsbaum je Vinted-Konto mit originalen Kennungen; keine Zugangsdaten.';
revoke all on public.vinted_selling_category_snapshots from public, anon, authenticated;
grant select on public.vinted_selling_category_snapshots to authenticated;
grant all on public.vinted_selling_category_snapshots to service_role;
revoke all on function public.marketplace_save_vinted_selling_tree(uuid,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_save_vinted_selling_tree(uuid,uuid,text,timestamptz,jsonb) to service_role;
