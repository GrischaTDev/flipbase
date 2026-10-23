-- Dauerhafte persönliche eBay-Lesekopien und wiederaufnehmbare Abgleiche ohne Push-Abhängigkeit.
create table public.ebay_cache_scans (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check (environment in ('production','sandbox')),
  external_account_id text not null,
  kind text not null check (kind in ('orders','listings')),
  baseline_to timestamptz,
  watermark timestamptz,
  completed_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  next_offset integer not null default 0 check (next_offset >= 0),
  expected_total integer,
  seen_count integer not null default 0,
  generation uuid not null default gen_random_uuid(),
  lease_connection_id uuid references public.ebay_connections(id) on delete set null,
  lease_operation_id uuid,
  lease_version bigint,
  lease_expires_at timestamptz,
  next_due_at timestamptz not null default now(),
  last_error text check (last_error in ('unavailable')),
  unique (workspace_id,environment,external_account_id,kind)
);
comment on table public.ebay_cache_scans is 'Konto- und quellgebundene Fenster mit dauerhaftem Cursor; nur vollständige Durchläufe bestätigen eine neue Basis.';
create index ebay_cache_scans_due on public.ebay_cache_scans(next_due_at,lease_expires_at);
create index ebay_cache_scans_connection on public.ebay_cache_scans(lease_connection_id);
create table public.ebay_cached_listings (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check (environment in ('production','sandbox')),
  external_account_id text not null,
  listing_id text not null,
  listing jsonb not null check (jsonb_typeof(listing)='object'),
  active boolean not null default true,
  seen_generation uuid not null,
  observed_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,environment,external_account_id,listing_id)
);
comment on table public.ebay_cached_listings is 'Normalisierte Inserate ohne Käuferdaten; unvollständige Durchläufe entfernen keine alten Inserate. Beendete Bilder bleiben für Bestellungen erhalten.';
create index ebay_cached_listings_active on public.ebay_cached_listings(workspace_id,environment,external_account_id,active);
create table public.ebay_cached_orders (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check (environment in ('production','sandbox')),
  external_account_id text not null,
  order_id text not null,
  source_key text not null check (source_key ~ '^[0-9a-f]{64}$'),
  source jsonb not null check (jsonb_typeof(source)='object'),
  created_at timestamptz not null,
  modified_at timestamptz,
  first_seen_at timestamptz not null default clock_timestamp(),
  observed_at timestamptz not null default clock_timestamp(),
  auto_prepare boolean not null default false,
  seen_generation uuid,
  unique(workspace_id,environment,external_account_id,order_id),
  unique(workspace_id,environment,source_key)
);
comment on table public.ebay_cached_orders is 'Normalisierte beständige Quellenbelege. auto_prepare markiert nur neue bezahlte Vorgänge nach vollständiger Erstbasis; keine Reservierung oder Buchung.';
create index ebay_cached_orders_created on public.ebay_cached_orders(workspace_id,environment,external_account_id,created_at desc);

create function public.ebay_cache_can_read(p_workspace_id uuid,p_environment text,p_account_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ebay_connections c join public.workspaces w on w.id=c.workspace_id
    where c.workspace_id=p_workspace_id and c.environment=p_environment and c.external_account_id=p_account_id
      and c.user_id=(select auth.uid()) and c.status='connected' and w.archived_at is null
      and public.user_can_access_workspace(c.workspace_id,(select auth.uid())));
$$;
revoke all on function public.ebay_cache_can_read(uuid,text,text) from public,anon;
grant execute on function public.ebay_cache_can_read(uuid,text,text) to authenticated,service_role;

create function public.ebay_cache_read(p_workspace_id uuid,p_connection_id uuid,p_environment text,p_kind text,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_connection public.ebay_connections; v_scan public.ebay_cache_scans; v_items jsonb; v_total integer;
begin
  select * into v_connection from public.ebay_connections where id=p_connection_id and workspace_id=p_workspace_id
    and environment=p_environment and user_id=(select auth.uid()) and status='connected';
  if not found or not public.ebay_cache_can_read(p_workspace_id,p_environment,v_connection.external_account_id)
    then raise exception 'Privater Kontozugriff verweigert' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('orders','listings') or p_page is null or p_page<1 or p_page>100000
    then raise exception 'Ungültige Cacheseite' using errcode='22023'; end if;
  select * into v_scan from public.ebay_cache_scans where workspace_id=p_workspace_id and environment=p_environment and external_account_id=v_connection.external_account_id and kind=p_kind;
  if p_kind='listings' then
    select count(*) into v_total from public.ebay_cached_listings where workspace_id=p_workspace_id and environment=p_environment and external_account_id=v_connection.external_account_id and active;
    select coalesce(jsonb_agg(t.listing order by t.listing_id),'[]'::jsonb) into v_items from (
      select listing,listing_id from public.ebay_cached_listings where workspace_id=p_workspace_id and environment=p_environment and external_account_id=v_connection.external_account_id and active order by listing_id limit 200 offset (p_page-1)*200
    ) t;
  else
    select count(*) into v_total from public.ebay_cached_orders where workspace_id=p_workspace_id and environment=p_environment and external_account_id=v_connection.external_account_id;
    select coalesce(jsonb_agg(jsonb_build_object('id',t.order_id,'createdAt',t.source->'createdAt',
      'paymentStatus',t.source->'paymentStatus','fulfillmentStatus',t.source->'fulfillmentStatus',
      'cancelStatus',t.source->'cancelStatus','total',(t.source->>'totalCents')::numeric/100,'currency',t.source->'currency',
      'items',(select coalesce(jsonb_agg(jsonb_build_object('title',l->'title','quantity',l->'quantity','imageUrl',l->'imageUrl')),'[]'::jsonb) from jsonb_array_elements(t.enriched->'lines') l),
      'importSource',t.enriched) order by t.created_at desc,t.order_id),'[]'::jsonb) into v_items from (
      select o.*,jsonb_set(o.source,'{lines}',coalesce((select jsonb_agg(case when nullif(l->>'imageUrl','') is not null then l else l||jsonb_build_object('imageUrl',i.listing->'imageUrl') end order by n)
        from jsonb_array_elements(o.source->'lines') with ordinality line(l,n)
        left join public.ebay_cached_listings i on i.workspace_id=o.workspace_id and i.environment=o.environment and i.external_account_id=o.external_account_id and i.listing_id=l->>'listingId'), '[]'::jsonb)) enriched
      from public.ebay_cached_orders o where workspace_id=p_workspace_id and environment=p_environment and external_account_id=v_connection.external_account_id order by created_at desc,order_id limit 50 offset (p_page-1)*50
    ) t;
  end if;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id,'items',v_items,'total',v_total,
    'nextPage',case when p_page*(case when p_kind='orders' then 50 else 200 end)<v_total then p_page+1 else null end,
    'sync',jsonb_build_object('status',case when v_scan.last_error is not null then 'error' when v_scan.window_to is not null then 'syncing' when v_scan.completed_at is null then 'pending' else 'ready' end,
      'lastCompletedAt',v_scan.completed_at,'lastError',v_scan.last_error));
end;
$$;
revoke all on function public.ebay_cache_read(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.ebay_cache_read(uuid,uuid,text,text,integer) to authenticated;

create function public.ebay_cache_refresh(p_workspace_id uuid,p_connection_id uuid,p_environment text,p_kind text)
returns void language plpgsql security definer set search_path='' as $$
declare v_account text;
begin
  select c.external_account_id into v_account from public.ebay_connections c
    where c.id=p_connection_id and c.workspace_id=p_workspace_id and c.environment=p_environment and c.user_id=(select auth.uid()) and c.status='connected';
  if not found or not public.ebay_cache_can_read(p_workspace_id,p_environment,v_account)
    then raise exception 'Privater Kontozugriff verweigert' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('orders','listings') then raise exception 'Ungültige Cachequelle' using errcode='22023'; end if;
  -- Nur den Zeitplan vorziehen; Daten, Cursor und vorhandene Wartezeiten eines Fehlers bleiben erhalten.
  update public.ebay_cache_scans set next_due_at=least(next_due_at,clock_timestamp())
    where workspace_id=p_workspace_id and environment=p_environment and external_account_id=v_account and kind=p_kind and last_error is null;
end;
$$;
revoke all on function public.ebay_cache_refresh(uuid,uuid,text,text) from public,anon;
grant execute on function public.ebay_cache_refresh(uuid,uuid,text,text) to authenticated;

create function public.ebay_cache_claim(p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_connection public.ebay_connections; v_scan public.ebay_cache_scans; v_claim jsonb; v_operation uuid:=extensions.gen_random_uuid();
begin
  if p_environment is null or p_environment not in ('production','sandbox') then return null; end if;
  -- Eine aktuelle persönliche Freigabe genügt; Pushgeräte und Pilotlisten sind reine Versandregeln.
  insert into public.ebay_cache_scans(workspace_id,environment,external_account_id,kind)
    select distinct c.workspace_id,c.environment,c.external_account_id,k.kind from public.ebay_connections c
    cross join (values ('orders'),('listings'))k(kind) join public.workspaces w on w.id=c.workspace_id
    where c.environment=p_environment and c.status='connected' and c.external_account_id is not null
      and w.archived_at is null and public.user_can_access_workspace(c.workspace_id,c.user_id)
      and exists(select 1 from public.ebay_credentials where id=c.id) on conflict do nothing;
  select s.* into v_scan from public.ebay_cache_scans s
    where s.environment=p_environment and s.next_due_at<=clock_timestamp() and (s.lease_expires_at is null or s.lease_expires_at<=clock_timestamp())
      and not exists(select 1 from public.ebay_cache_scans other where other.workspace_id=s.workspace_id and other.environment=s.environment and other.external_account_id=s.external_account_id and other.lease_expires_at>clock_timestamp())
      and exists(select 1 from public.ebay_connections c join public.workspaces w on w.id=c.workspace_id
        where c.workspace_id=s.workspace_id and c.environment=s.environment and c.external_account_id=s.external_account_id and c.status='connected'
          and w.archived_at is null and public.user_can_access_workspace(c.workspace_id,c.user_id)
          and (c.operation_id is null or c.operation_expires_at<=clock_timestamp()) and exists(select 1 from public.ebay_credentials where id=c.id))
    order by s.next_due_at,case when s.kind='orders' then 0 else 1 end,s.id limit 1 for update skip locked;
  if not found then return null; end if;
  -- Auch zwei persönliche Verbindungen desselben Kontos dürfen keine parallelen Scans starten.
  if not pg_try_advisory_xact_lock(hashtextextended(v_scan.workspace_id::text||':'||v_scan.environment||':'||v_scan.external_account_id,474)) then return null; end if;
  if exists(select 1 from public.ebay_cache_scans s where s.workspace_id=v_scan.workspace_id and s.environment=v_scan.environment and s.external_account_id=v_scan.external_account_id and s.lease_expires_at>clock_timestamp()) then return null; end if;
  select c.* into v_connection from public.ebay_connections c join public.workspaces w on w.id=c.workspace_id
    where c.workspace_id=v_scan.workspace_id and c.environment=v_scan.environment and c.external_account_id=v_scan.external_account_id and c.status='connected'
      and w.archived_at is null and public.user_can_access_workspace(c.workspace_id,c.user_id)
      and (c.operation_id is null or c.operation_expires_at<=clock_timestamp()) and exists(select 1 from public.ebay_credentials where id=c.id)
    order by c.id limit 1 for update of c skip locked;
  if not found then return null; end if;
  v_claim:=public.ebay_claim_connection(v_connection.workspace_id,v_connection.user_id,v_connection.id,v_operation);
  if v_claim is null then return null; end if;
  -- Sehr alte Teilfenster werden neu gelesen, niemals als vollständig bestätigt.
  if v_scan.window_to is null or v_scan.window_to<clock_timestamp()-interval '1 day' then
    update public.ebay_cache_scans set window_from=coalesce(watermark-interval '10 minutes',clock_timestamp()-interval '90 days'),window_to=clock_timestamp(),next_offset=0,expected_total=null,seen_count=0,generation=extensions.gen_random_uuid() where id=v_scan.id returning * into v_scan;
  end if;
  update public.ebay_cache_scans set lease_connection_id=v_connection.id,lease_operation_id=v_operation,lease_version=v_connection.authorization_version,lease_expires_at=clock_timestamp()+interval '90 seconds' where id=v_scan.id;
  return jsonb_build_object('connection',v_claim,'scan',jsonb_build_object('id',v_scan.id,'kind',v_scan.kind,'from',v_scan.window_from,'to',v_scan.window_to,'offset',v_scan.next_offset,'initial',v_scan.baseline_to is null));
end;
$$;

create function public.ebay_cache_page(p_connection_id uuid,p_operation_id uuid,p_version bigint,p_scan_id bigint,p_offset integer,p_rows jsonb,p_complete boolean,p_total integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_connection public.ebay_connections; v_scan public.ebay_cache_scans; v_row jsonb; v_source jsonb; v_old public.ebay_cached_orders; v_id bigint; v_new_sale boolean; v_size integer; v_count integer; v_created timestamptz; v_paid timestamptz; v_recipient public.ebay_connections;
begin
  select * into v_scan from public.ebay_cache_scans where id=p_scan_id and lease_connection_id=p_connection_id and lease_operation_id=p_operation_id and lease_version=p_version and lease_expires_at>clock_timestamp() for update;
  if not found or v_scan.window_to is null or p_offset is null or v_scan.next_offset<>p_offset then return false; end if;
  select * into v_connection from public.ebay_connections where id=p_connection_id and operation_id=p_operation_id and operation_expires_at>clock_timestamp() and authorization_version=p_version and status='connected' for update;
  if not found or v_connection.workspace_id<>v_scan.workspace_id or v_connection.environment<>v_scan.environment or v_connection.external_account_id<>v_scan.external_account_id
    or not public.user_can_access_workspace(v_connection.workspace_id,v_connection.user_id)
    or not exists(select 1 from public.workspaces w where w.id=v_connection.workspace_id and w.archived_at is null) then return false; end if;
  v_size:=case when v_scan.kind='orders' then 50 else 200 end;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>v_size or octet_length(p_rows::text)>4194304
    or p_complete is null or p_total is null or p_total<0 or p_total>1000000
    then raise exception 'Ungültige Cacheseite' using errcode='22023'; end if;
  v_count:=jsonb_array_length(p_rows);
  if v_scan.expected_total is not null and v_scan.expected_total<>p_total then
    -- Veränderliche Anbieterseiten erneut ab Beginn lesen; Abschlussmarke bleibt unverändert.
    update public.ebay_cache_scans set next_offset=0,expected_total=null,seen_count=0,generation=extensions.gen_random_uuid(),last_error='unavailable',lease_expires_at=null,next_due_at=clock_timestamp()+interval '5 minutes' where id=p_scan_id;
    return false;
  end if;
  if p_offset+v_count>p_total or p_complete<>(p_offset+v_count=p_total) or (not p_complete and v_count<>v_size)
    or (v_scan.kind='listings' and p_total>=25000) then raise exception 'Unvollständige Cacheseite' using errcode='22023'; end if;
  if (select count(distinct case when v_scan.kind='orders' then r#>>'{source,orderId}' else r->>'id' end) from jsonb_array_elements(p_rows) r)<>v_count
    then raise exception 'Doppelte Quellenkennung' using errcode='22023'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if v_scan.kind='listings' then
      if jsonb_typeof(v_row) is distinct from 'object' or length(v_row->>'id') not between 1 and 256 or v_row->>'id' is null then raise exception 'Ungültiges Inserat' using errcode='22023'; end if;
      insert into public.ebay_cached_listings(workspace_id,environment,external_account_id,listing_id,listing,seen_generation)
        values(v_scan.workspace_id,v_scan.environment,v_scan.external_account_id,v_row->>'id',v_row,v_scan.generation)
        on conflict(workspace_id,environment,external_account_id,listing_id) do update set listing=excluded.listing,active=true,seen_generation=excluded.seen_generation,observed_at=clock_timestamp();
    else
      v_source:=v_row->'source';
      if jsonb_typeof(v_source) is distinct from 'object' or length(v_source->>'orderId') not between 1 and 256 or v_source->>'orderId' is null
        or v_row->>'sourceKey' is null or v_row->>'sourceKey' !~ '^[0-9a-f]{64}$' or jsonb_typeof(v_source->'lines') is distinct from 'array'
        or jsonb_array_length(v_source->'lines')>200 then raise exception 'Ungültige Bestellquelle' using errcode='22023'; end if;
      v_created:=(v_source->>'createdAt')::timestamptz;
      if v_created is null or not isfinite(v_created) or v_created>v_scan.window_to
        then raise exception 'Ungültiges Bestelldatum' using errcode='22023'; end if;
      perform pg_advisory_xact_lock(hashtextextended(v_scan.workspace_id::text||':'||v_scan.environment||':'||(v_row->>'sourceKey'),0));
      select * into v_old from public.ebay_cached_orders where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and order_id=v_source->>'orderId' for update;
      v_paid:=(v_source->>'paidAt')::timestamptz;
      v_new_sale:=v_scan.baseline_to is not null and v_source->>'paymentStatus'='PAID'
        and ((v_old.id is null and (v_created>v_scan.baseline_to or coalesce(isfinite(v_paid) and v_paid>=v_created and v_paid>v_scan.baseline_to and v_paid<=v_scan.window_to,false)))
          or (v_old.id is not null and v_old.source->>'paymentStatus'<>'PAID')) and not coalesce(v_old.auto_prepare,false);
      insert into public.ebay_cached_orders(workspace_id,environment,external_account_id,order_id,source_key,source,created_at,modified_at,auto_prepare,seen_generation)
        values(v_scan.workspace_id,v_scan.environment,v_scan.external_account_id,v_source->>'orderId',v_row->>'sourceKey',v_source,v_created,(v_source->>'lastModifiedAt')::timestamptz,coalesce(v_new_sale,false),v_scan.generation)
        on conflict(workspace_id,environment,external_account_id,order_id) do update set source=excluded.source,modified_at=excluded.modified_at,observed_at=clock_timestamp(),auto_prepare=public.ebay_cached_orders.auto_prepare or excluded.auto_prepare,seen_generation=excluded.seen_generation returning id into v_id;
      if v_new_sale then
        -- Ein Kontoabruf kann mehrere persönliche Freigaben bedienen; keine Abrufverbindung als Empfänger voraussetzen.
        for v_recipient in select c.* from public.ebay_connections c where c.workspace_id=v_scan.workspace_id and c.environment=v_scan.environment
          and c.external_account_id=v_scan.external_account_id and c.status='connected' and public.user_can_access_workspace(c.workspace_id,c.user_id) loop
          -- Opt-in und Pilotgrenzen bleiben im bestehenden Outbox-/Versandweg; Ereignis ist je Nutzer und Verkauf eindeutig.
          perform public.web_push_enqueue_event('ebay-cache-order:'||v_id::text||':'||v_recipient.user_id::text,v_scan.workspace_id,'order',v_recipient.id,jsonb_build_object('kind','ebay_orders','connectionId',v_recipient.id));
        end loop;
      end if;
    end if;
  end loop;
  if p_complete and v_scan.kind='orders' and (select count(*) from public.ebay_cached_orders where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and seen_generation=v_scan.generation)<>p_total
    then raise exception 'Bestellseiten überschneiden sich' using errcode='22023'; end if;
  if p_complete and v_scan.kind='listings' then
    if (select count(*) from public.ebay_cached_listings where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and seen_generation=v_scan.generation)<>p_total
      then raise exception 'Inseratseiten überschneiden sich' using errcode='22023'; end if;
    update public.ebay_cached_listings set active=false where workspace_id=v_scan.workspace_id and environment=v_scan.environment and external_account_id=v_scan.external_account_id and seen_generation<>v_scan.generation;
  end if;
  update public.ebay_cache_scans set expected_total=case when p_complete then null else p_total end,seen_count=case when p_complete then 0 else seen_count+v_count end,
    baseline_to=case when p_complete then coalesce(baseline_to,window_to) else baseline_to end,
    watermark=case when p_complete then window_to else watermark end,completed_at=case when p_complete then clock_timestamp() else completed_at end,
    window_from=case when p_complete then null else window_from end,window_to=case when p_complete then null else window_to end,
    next_offset=case when p_complete then 0 else next_offset+v_size end,last_error=null,
    lease_expires_at=case when p_complete then null else lease_expires_at end,
    next_due_at=clock_timestamp()+case when not p_complete then interval '5 seconds' when kind='orders' then interval '5 minutes' else interval '1 hour' end where id=p_scan_id;
  return true;
end;
$$;

create function public.ebay_cache_delay(p_connection_id uuid,p_operation_id uuid,p_version bigint,p_scan_id bigint,p_delay_seconds integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.ebay_cache_scans s set last_error='unavailable',lease_expires_at=null,next_due_at=clock_timestamp()+make_interval(secs=>least(greatest(coalesce(p_delay_seconds,300),300),86400))
    from public.ebay_connections c where c.id=p_connection_id and c.operation_id=p_operation_id and c.authorization_version=p_version and c.operation_expires_at>clock_timestamp()
      and s.id=p_scan_id and s.lease_connection_id=c.id and s.lease_operation_id=p_operation_id and s.lease_version=p_version;
end;
$$;
revoke all on function public.ebay_cache_claim(text),public.ebay_cache_page(uuid,uuid,bigint,bigint,integer,jsonb,boolean,integer),public.ebay_cache_delay(uuid,uuid,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.ebay_cache_claim(text),public.ebay_cache_page(uuid,uuid,bigint,bigint,integer,jsonb,boolean,integer),public.ebay_cache_delay(uuid,uuid,bigint,bigint,integer) to service_role;

alter table public.ebay_cached_orders enable row level security;
revoke all on public.ebay_cached_orders from public,anon,authenticated;
grant select on public.ebay_cached_orders to authenticated;
grant all on public.ebay_cached_orders to service_role;
revoke all on sequence public.ebay_cached_orders_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ebay_cached_orders_id_seq to service_role;
create policy "Eigene eBay-Quellen lesen" on public.ebay_cached_orders for select to authenticated using(public.ebay_cache_can_read(workspace_id,environment,external_account_id));
create policy "Dienst liest eBay-Cache" on public.ebay_cached_orders for select to service_role using(true);
create policy "Dienst erstellt eBay-Cache" on public.ebay_cached_orders for insert to service_role with check(true);
create policy "Dienst aktualisiert eBay-Cache" on public.ebay_cached_orders for update to service_role using(true) with check(true);
create policy "Dienst löscht eBay-Cache" on public.ebay_cached_orders for delete to service_role using(true);
alter table public.ebay_cached_listings enable row level security;
revoke all on public.ebay_cached_listings from public,anon,authenticated;
grant select on public.ebay_cached_listings to authenticated;
grant all on public.ebay_cached_listings to service_role;
revoke all on sequence public.ebay_cached_listings_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ebay_cached_listings_id_seq to service_role;
create policy "Eigene eBay-Quellen lesen" on public.ebay_cached_listings for select to authenticated using(public.ebay_cache_can_read(workspace_id,environment,external_account_id));
create policy "Dienst liest eBay-Cache" on public.ebay_cached_listings for select to service_role using(true);
create policy "Dienst erstellt eBay-Cache" on public.ebay_cached_listings for insert to service_role with check(true);
create policy "Dienst aktualisiert eBay-Cache" on public.ebay_cached_listings for update to service_role using(true) with check(true);
create policy "Dienst löscht eBay-Cache" on public.ebay_cached_listings for delete to service_role using(true);
alter table public.ebay_cache_scans enable row level security;
revoke all on public.ebay_cache_scans from public,anon,authenticated;
grant select on public.ebay_cache_scans to authenticated;
grant all on public.ebay_cache_scans to service_role;
revoke all on sequence public.ebay_cache_scans_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ebay_cache_scans_id_seq to service_role;
create policy "Eigene eBay-Quellen lesen" on public.ebay_cache_scans for select to authenticated using(public.ebay_cache_can_read(workspace_id,environment,external_account_id));
create policy "Dienst liest eBay-Cache" on public.ebay_cache_scans for select to service_role using(true);
create policy "Dienst erstellt eBay-Cache" on public.ebay_cache_scans for insert to service_role with check(true);
create policy "Dienst aktualisiert eBay-Cache" on public.ebay_cache_scans for update to service_role using(true) with check(true);
create policy "Dienst löscht eBay-Cache" on public.ebay_cache_scans for delete to service_role using(true);

create function public.ebay_cache_finish(p_connection_id uuid,p_operation_id uuid,p_version bigint,p_scan_id bigint,p_encrypted_tokens text default null,p_needs_login boolean default false,p_observed boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_finished boolean;
begin
  -- Dieselbe Sperrreihenfolge wie beim Speichern vermeidet gegenseitige Blockaden.
  perform 1 from public.ebay_cache_scans where id=p_scan_id and lease_connection_id=p_connection_id and lease_operation_id=p_operation_id and lease_version=p_version for update;
  if not found then return false; end if;
  v_finished:=public.ebay_finish_read(p_connection_id,p_operation_id,p_version,p_encrypted_tokens,p_needs_login,p_observed);
  update public.ebay_cache_scans set lease_expires_at=null where id=p_scan_id and lease_operation_id=p_operation_id;
  return v_finished;
end;
$$;
revoke all on function public.ebay_cache_finish(uuid,uuid,bigint,bigint,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.ebay_cache_finish(uuid,uuid,bigint,bigint,text,boolean,boolean) to service_role;
