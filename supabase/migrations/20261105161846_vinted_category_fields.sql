-- Echte Vinted-Merkmale je Konto und Kategorie speichern (Tabelle vinted_category_field_snapshots,
-- Funktion marketplace_save_vinted_category_fields). Keine bestehenden Daten betroffen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

create table public.vinted_category_field_snapshots (
  connection_id uuid not null,
  category_id integer not null check (category_id between 1 and 2147483647),
  workspace_id uuid not null,
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  fields jsonb not null check (
    jsonb_typeof(fields) = 'object'
    and jsonb_typeof(fields->'fields') = 'array'
    and pg_column_size(fields) < 1048576
  ),
  observed_at timestamptz not null,
  primary key (connection_id, category_id),
  foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade
);
comment on table public.vinted_category_field_snapshots is 'Zuletzt bei Vinted gelesene Auswahlwerte je Konto und Verkaufskategorie mit originalen Kennungen; keine Inseratdaten und keine Zugangsdaten.';
create index vinted_category_field_snapshots_workspace on public.vinted_category_field_snapshots(workspace_id);
alter table public.vinted_category_field_snapshots enable row level security;
revoke all on public.vinted_category_field_snapshots from public, anon, authenticated;
grant select on public.vinted_category_field_snapshots to authenticated;
grant all on public.vinted_category_field_snapshots to service_role;
create policy "Administrators read their Vinted category fields" on public.vinted_category_field_snapshots
for select to authenticated using (
 public.marketplace_can_manage(workspace_id) and exists (
  select 1 from public.marketplace_connections c where c.id = connection_id
   and c.workspace_id = vinted_category_field_snapshots.workspace_id and c.marketplace = 'vinted'
   and c.external_account_id = vinted_category_field_snapshots.external_account_id and c.status = 'connected'
 )
);

create or replace function public.marketplace_save_vinted_category_fields(
 p_workspace_id uuid, p_connection_id uuid, p_external_account_id text,
 p_observed_at timestamptz, p_fields jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_category_id bigint;
begin
 perform 1 from public.marketplace_connections c where c.workspace_id = p_workspace_id
  and c.id = p_connection_id and c.external_account_id = p_external_account_id
  and c.marketplace = 'vinted' and c.status = 'connected' for share;
 if not found then raise exception 'Vinted account binding changed'; end if;
 if p_fields is null or jsonb_typeof(p_fields) <> 'object' or p_observed_at is null
  or p_observed_at > clock_timestamp() + interval '5 minutes'
  or jsonb_typeof(p_fields->'categoryId') <> 'number' or (p_fields->>'categoryId') !~ '^[1-9][0-9]{0,9}$'
  or jsonb_typeof(p_fields->'fields') <> 'array' or jsonb_array_length(p_fields->'fields') > 50
 then raise exception 'Invalid category fields'; end if;
 v_category_id := (p_fields->>'categoryId')::bigint;
 if v_category_id > 2147483647 then raise exception 'Invalid category fields'; end if;
 -- Ein Kontowechsel derselben Verbindung verwirft die Auswahlwerte des vorherigen Kontos.
 delete from public.vinted_category_field_snapshots s
 where s.connection_id = p_connection_id and s.external_account_id <> p_external_account_id;
 insert into public.vinted_category_field_snapshots(connection_id, category_id, workspace_id, external_account_id, fields, observed_at)
 values(p_connection_id, v_category_id::integer, p_workspace_id, p_external_account_id, p_fields, p_observed_at)
 on conflict(connection_id, category_id) do update set workspace_id = excluded.workspace_id,
  external_account_id = excluded.external_account_id, fields = excluded.fields, observed_at = excluded.observed_at
 where vinted_category_field_snapshots.observed_at <= excluded.observed_at;
 return found;
end;
$$;
revoke all on function public.marketplace_save_vinted_category_fields(uuid,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.marketplace_save_vinted_category_fields(uuid,uuid,text,timestamptz,jsonb) to service_role;
