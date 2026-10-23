-- Verkauf, Stornierung und Wiederaufnahme bleiben an Konto, Transaktion und Anbieterartikel gebunden.
create index marketplace_vinted_sale_items on public.marketplace_account_entries
using gin ((body->'itemIds')) where kind='sale';

create or replace function public.marketplace_preserve_vinted_sale()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
declare v_previous jsonb; v_account text; v_ids jsonb; v_state_at timestamptz; v_previous_at timestamptz;
begin
  if new.kind<>'sale' or not (new.body ? 'saleState') then return new; end if;
  select external_account_id into v_account from public.marketplace_connections
    where workspace_id=new.workspace_id and id=new.connection_id and marketplace='vinted';
  if not found then return new; end if;
  if jsonb_typeof(new.body->'saleState') is distinct from 'string'
    or new.body->>'saleState' not in ('sold','shipped','completed','cancelled','relisted')
    or new.body->>'sellerId' is distinct from v_account
    or jsonb_typeof(new.body->'itemIds') is distinct from 'array'
    or jsonb_array_length(new.body->'itemIds')>100
    or exists(select 1 from jsonb_array_elements(new.body->'itemIds') item where jsonb_typeof(item)<>'string' or item#>>'{}' !~ '^[1-9][0-9]{0,31}$')
    or not (new.body ? 'itemCount')
    or (case when new.body->'itemCount'='null'::jsonb then false
      when jsonb_typeof(new.body->'itemCount')='number' and pg_input_is_valid(new.body->>'itemCount','integer')
      then (new.body->>'itemCount')::integer not between 1 and 100 or (new.body->>'itemCount')::integer<jsonb_array_length(new.body->'itemIds')
      else true end)
    or jsonb_typeof(new.body->'externalConversationId') is distinct from 'string'
    or new.body->>'externalConversationId' !~ '^[1-9][0-9]{0,31}$'
  then raise exception 'Ungültiger Vinted-Verkaufsbeleg' using errcode='22023'; end if;
  if tg_op='UPDATE' then v_previous:=old.body;
  else select e.body into v_previous from public.marketplace_account_entries e
    where e.workspace_id=new.workspace_id and e.connection_id=new.connection_id and e.kind='sale' and e.external_id=new.external_id;
  end if;
  if v_previous->>'sellerId' is distinct from v_account then v_previous:=null; end if;
  if public.marketplace_publication_time_valid(new.body->>'saleStateAt',new.observed_at) then v_state_at:=(new.body->>'saleStateAt')::timestamptz; end if;
  if public.marketplace_publication_time_valid(v_previous->>'saleStateAt',new.observed_at) then v_previous_at:=(v_previous->>'saleStateAt')::timestamptz; end if;
  -- Ältere oder verkürzte Gesprächsausschnitte dürfen eine spätere Stornierung nicht zurücknehmen.
  if (v_previous->>'saleState'='relisted' and new.body->>'saleState'<>'relisted')
    or (v_previous->>'saleState'='cancelled' and new.body->>'saleState' not in ('cancelled','relisted'))
    or (v_previous_at is not null and (v_state_at is null or v_previous_at>v_state_at
    or (v_previous_at=v_state_at and v_previous->>'saleState' in ('cancelled','relisted') and new.body->>'saleState' not in ('cancelled','relisted'))))
  then new.body:=new.body||jsonb_build_object('saleState',v_previous->'saleState','saleStateAt',v_previous->'saleStateAt','status',v_previous->'status');
    new.sort_at:=v_previous_at;
  end if;
  if jsonb_typeof(v_previous->'itemIds')='array' then
    select coalesce(jsonb_agg(distinct item),'[]'::jsonb) into v_ids
      from jsonb_array_elements((new.body->'itemIds')||(v_previous->'itemIds')) item;
    new.body:=new.body||jsonb_build_object('itemIds',v_ids,'itemCount',nullif(greatest((new.body->>'itemCount')::integer,(v_previous->>'itemCount')::integer,jsonb_array_length(v_ids)),0));
  end if;
  if public.marketplace_publication_time_valid(v_previous->>'occurredAt',new.observed_at)
    and (not public.marketplace_publication_time_valid(new.body->>'occurredAt',new.observed_at) or (v_previous->>'occurredAt')::timestamptz<(new.body->>'occurredAt')::timestamptz)
  then new.body:=new.body||jsonb_build_object('occurredAt',v_previous->'occurredAt'); end if;
  if new.body->>'price' is null and jsonb_typeof(v_previous->'price')='number' then
    new.body:=new.body||jsonb_build_object('price',v_previous->'price','currency',v_previous->'currency');
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_preserve_vinted_sale() from public,anon,authenticated;
grant execute on function public.marketplace_preserve_vinted_sale() to service_role;
create trigger marketplace_preserve_vinted_sale before insert or update on public.marketplace_account_entries
for each row execute function public.marketplace_preserve_vinted_sale();

-- Die Lesekopie bleibt für den Verlauf erhalten. RLS der Ursprungstabelle gilt auch über diese Sicht.
-- Ausgeschlossene Artikel beeinflussen weder Seitenzahl noch Cursor oder die Marktplatzübersicht.
create view public.marketplace_visible_account_entries with (security_invoker=true) as
select e.* from public.marketplace_account_entries e
where e.kind<>'publication' or coalesce((
  select sale.body->>'saleState'='relisted'
    and sale.body->>'saleStateAt' is not null and sale.sort_at>'1970-01-01T00:00:00Z'::timestamptz
    and e.observed_at>=sale.sort_at
    and coalesce(e.body->>'publicationState','unknown') in ('active','reserved')
  from public.marketplace_account_entries sale
  join public.marketplace_connections c on c.workspace_id=sale.workspace_id and c.id=sale.connection_id and c.marketplace='vinted'
  where sale.workspace_id=e.workspace_id and sale.connection_id=e.connection_id and sale.kind='sale'
    and sale.body->>'sellerId'=c.external_account_id
    and sale.body->>'saleState' in ('sold','shipped','completed','cancelled','relisted')
    and (sale.body->'itemIds') ? e.external_id
  -- Ohne Quellzeit ist eine andere Transaktion zeitlich nicht als älter belegt.
  order by (sale.body->>'saleState'<>'relisted'
    and sale.sort_at<='1970-01-01T00:00:00Z'::timestamptz) desc,
    sale.sort_at desc,sale.id desc limit 1
),true);
comment on view public.marketplace_visible_account_entries is 'RLS-geschützte Kontolesekopie ohne verkaufte oder noch nicht wieder eingestellte stornierte Artikel im Kleiderschrank; Verkaufshistorie bleibt erhalten.';
revoke all on public.marketplace_visible_account_entries from public,anon,authenticated;
grant select on public.marketplace_visible_account_entries to authenticated,service_role;

-- Bestandsabgleich: vorhandene Altersanker durch den normalisierenden Zeittrigger neu einordnen.
-- Es werden keine Inserate oder Verkaufsvorgänge gelöscht oder beim Anbieter verändert.
update public.marketplace_account_entries e set body=e.body
where e.kind='publication' and e.body->>'publicationState' in ('active','reserved','ended','unknown') and jsonb_typeof(e.body->'publicationAge')='object'
  and exists(select 1 from public.marketplace_connections c where c.workspace_id=e.workspace_id and c.id=e.connection_id and c.marketplace='vinted');
