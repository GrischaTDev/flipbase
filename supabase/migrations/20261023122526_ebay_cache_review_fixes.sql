-- Zweck: sichere Wiederaufnahme bei schrumpfenden Treffern, persoenlicher Push-Fanout und belegte spaete Zahlung.
-- Funktion: public.ebay_cache_page; betroffene Lesekopien und Push-Outbox ohne Tabellenumbau.
-- Erzeugt aus deklarativem Schema gegen den bereits geprueften Task-1-Migrationsstand.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create or replace function public.ebay_cache_page (
  p_connection_id uuid,
  p_operation_id  uuid,
  p_version       bigint,
  p_scan_id       bigint,
  p_offset        integer,
  p_rows          jsonb,
  p_complete      boolean,
  p_total         integer
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  as $function$
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
$function$;
