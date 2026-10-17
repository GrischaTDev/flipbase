-- Zweck: Gespeicherte Vinted-Inserate kopieren und Kleinanzeigen-Metadaten erhalten.
-- Betroffen: public.kleinanzeigen_publications, public.kleinanzeigen_sync_entries
-- sowie die Kleinanzeigen-Transfer-, Quellen- und Lesefunktionen.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

create or replace function public.kleinanzeigen_complete_transfer_images (
  p_workspace_id      uuid,
  p_listing_id        uuid,
  p_expected_revision bigint,
  p_user_id           uuid,
  p_photos            jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_listing public.listings;v_photo jsonb;v_position integer:=0;v_source jsonb;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Bildübernahme nicht freigegeben.' using errcode='42501';end if;
 select * into v_listing from public.listings where id=p_listing_id and workspace_id=p_workspace_id and source_reference is not null for update;
 if not found then raise exception 'Entwurf nicht verfügbar.' using errcode='42501';end if;
 if p_expected_revision is distinct from v_listing.revision or v_listing.status<>'prepared' or v_listing.transfer_images_complete or exists(select 1 from public.listing_images where listing_id=p_listing_id) then raise exception 'Fassung oder Bilder inzwischen geändert.' using errcode='40001';end if;
 select public.kleinanzeigen_saved_listing_source(body, (select external_account_id from public.marketplace_connections where id=connection_id), external_id) into v_source from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id::text=v_listing.source_reference->>'connectionId' and id::text=v_listing.source_reference->>'entryId' and external_id=v_listing.source_reference->>'externalId' and kind='publication';
 if v_source is null or encode(extensions.digest(v_source::text,'sha256'),'hex') is distinct from v_listing.source_reference->>'fingerprint' then raise exception 'Quelle inzwischen geändert.' using errcode='40001';end if;
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 0 and 20 or jsonb_array_length(p_photos)<>jsonb_array_length(v_source->'photoReferences') then raise exception 'Fotos nicht vollständig übernommen.' using errcode='22023';end if;
 for v_photo in select * from jsonb_array_elements(p_photos) loop
  if jsonb_typeof(v_photo)<>'object' or (select count(*) from jsonb_object_keys(v_photo))<>3 or v_photo->>'sortOrder' is distinct from v_position::text or jsonb_typeof(v_photo->'fileName') is distinct from 'string' or char_length(v_photo->>'fileName') not between 1 and 255 or v_photo->>'storagePath' !~ ('^listings/'||p_workspace_id::text||'/'||p_listing_id::text||'/[0-9a-f-]+\.(jpg|png|webp)$') then raise exception 'Ungültige Bildablage.' using errcode='22023';end if;
  if not exists(select 1 from storage.objects where bucket_id='item-media' and name=v_photo->>'storagePath' and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 12582912) then raise exception 'Gesichertes Bild nicht verfügbar.' using errcode='22023';end if;
  insert into public.listing_images(workspace_id,listing_id,storage_path,file_name,sort_order) values(p_workspace_id,p_listing_id,v_photo->>'storagePath',v_photo->>'fileName',v_position);
  v_position:=v_position+1;
 end loop;
 update public.listings set transfer_images_complete=true,image_selection_saved=true where id=p_listing_id returning * into v_listing;
 return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);
end;
$function$;

create or replace function public.kleinanzeigen_create_transfer_draft (
  p_workspace_id         uuid,
  p_target_connection_id bigint,
  p_source_reference     jsonb,
  p_content              jsonb,
  p_request_id           uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_content jsonb;v_source public.marketplace_account_entries;v_account public.marketplace_connections;v_listing public.listings;v_fingerprint text;
begin
 if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diesen Transfer.' using errcode='42501';end if;
 perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for share;
 if not found then raise exception 'Arbeitsbereich nicht verfügbar.' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_source_reference) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_source_reference))<>6 or p_source_reference->>'platform' is distinct from 'vinted' or p_source_reference->>'workspaceId' is distinct from p_workspace_id::text then raise exception 'Ungültiger Quellbezug.' using errcode='22023';end if;
 select * into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id::text=p_source_reference->>'connectionId' and marketplace='vinted' and external_account_id is not null for share;
 if not found then raise exception 'Quellkonto nicht verfuegbar.' using errcode='42501';end if;
 select * into v_source from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=v_account.id and id::text=p_source_reference->>'entryId' and external_id=p_source_reference->>'externalId' and kind='publication' for share;
 if not found then raise exception 'Quellinserat nicht verfuegbar.' using errcode='42501';end if;
 v_fingerprint:=encode(extensions.digest(public.kleinanzeigen_saved_listing_source(v_source.body,v_account.external_account_id,v_source.external_id)::text,'sha256'),'hex');
 if v_source.id is null or v_fingerprint is distinct from p_source_reference->>'fingerprint' then raise exception 'Vollständige Quelle nicht bestätigt.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_target_connection_id and status<>'disconnected' for share;
 if not found then raise exception 'Zielkonto nicht verfügbar.' using errcode='42501';end if;
 v_content:=public.kleinanzeigen_validate_draft_content(p_content);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':ka-draft:'||p_target_connection_id::text||':'||v_account.id::text||':'||v_source.external_id,0));
 select * into v_listing from public.listings where workspace_id=p_workspace_id and transfer_request_id=p_request_id;
 if found then
  if v_listing.target_connection_id<>p_target_connection_id or v_listing.source_reference is distinct from p_source_reference then raise exception 'Request-ID gehört zu anderem Transfer.' using errcode='40001';end if;
  return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);
 end if;
 select * into v_listing from public.listings where workspace_id=p_workspace_id and target_connection_id=p_target_connection_id and source_reference=p_source_reference and status<>'ended';
 if found then return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);end if;
 insert into public.listings(workspace_id,target_connection_id,source_reference,transfer_request_id,title,description,price,price_type,shipping_type,shipping_price,postal_code,item_details,category_id,category_fields,schema_revision)
 values(p_workspace_id,p_target_connection_id,p_source_reference,p_request_id,v_content->>'title',v_content->>'description',(v_content->>'price')::numeric,v_content->>'priceType',v_content->>'shippingType',(v_content->>'shippingPrice')::numeric,v_content->>'postalCode',v_content->'itemDetails',v_content->>'categoryId',v_content->'categoryFields',v_content->>'schemaRevision') returning * into v_listing;
 return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);
end;
$function$;

create or replace function public.kleinanzeigen_finish_sync (
  p_workspace_id        uuid,
  p_connection_id       bigint,
  p_token_hash          text,
  p_generation          bigint,
  p_run_id              bigint,
  p_claim_token         text,
  p_external_account_id text,
  p_quota               jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_run public.kleinanzeigen_sync_runs; v_now timestamptz; v_used integer; v_observed timestamptz; v_count integer;
begin
 v_run:=public.kleinanzeigen_locked_sync(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_run_id,p_claim_token,p_external_account_id);
 select count(*)::integer into v_count from public.kleinanzeigen_sync_entries where run_id=v_run.id;
 if v_run.state='confirmed' then return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'state','confirmed','observedAt',v_run.completed_at,'itemCount',v_count); end if;
 v_now:=clock_timestamp();
 if v_run.next_cursor is not null or v_run.accepted_pages='{}'::jsonb then raise exception 'Anzeigenfolge unvollständig.' using errcode='55000'; end if;
 if exists(select 1 from public.kleinanzeigen_sync_runs where workspace_id=p_workspace_id and connection_id=p_connection_id and id>v_run.id and state='confirmed') then raise exception 'Neuerer Abgleich vorhanden.' using errcode='55000'; end if;
 if p_quota is not null then
  if jsonb_typeof(p_quota)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(p_quota) key) is distinct from array['accountType','externalAccountId','observedAt','source','used']::text[]
   or p_quota->>'externalAccountId' is distinct from p_external_account_id or p_quota->>'source' is distinct from 'account_settings'
   or p_quota->>'accountType' is distinct from (select account_type from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id)
   or jsonb_typeof(p_quota->'used') is distinct from 'number' or p_quota->>'used' !~ '^[0-9]{1,9}$' or jsonb_typeof(p_quota->'observedAt') is distinct from 'string' then raise exception 'Kontingent nicht belegt.' using errcode='22023'; end if;
  v_used:=(p_quota->>'used')::integer;v_observed:=(p_quota->>'observedAt')::timestamptz;
  if v_observed>v_now+interval '1 second' or v_observed<v_now-interval '60 seconds' then raise exception 'Kontingent nicht aktuell.' using errcode='22023'; end if;
 end if;
 insert into public.kleinanzeigen_publications(workspace_id,connection_id,external_id,title,url,state,published_at,observed_at,sync_run_id,price_cents,currency,image_url,published_on)
  select workspace_id,connection_id,external_id,title,url,state,published_at,v_now,v_run.id,price_cents,currency,image_url,published_on from public.kleinanzeigen_sync_entries where run_id=v_run.id
  on conflict(workspace_id,connection_id,external_id) do update set title=excluded.title,url=excluded.url,state=excluded.state,available=true,price_cents=excluded.price_cents,currency=excluded.currency,image_url=excluded.image_url,published_on=coalesce(excluded.published_on,public.kleinanzeigen_publications.published_on),published_at=coalesce(excluded.published_at,public.kleinanzeigen_publications.published_at),observed_at=excluded.observed_at,sync_run_id=excluded.sync_run_id where public.kleinanzeigen_publications.observed_at<=v_run.requested_at;
 update public.kleinanzeigen_publications p set available=false,observed_at=v_now,sync_run_id=v_run.id
  where p.workspace_id=p_workspace_id and p.connection_id=p_connection_id and p.observed_at<=v_run.requested_at and not exists(select 1 from public.kleinanzeigen_sync_entries e where e.run_id=v_run.id and e.external_id=p.external_id);
 update public.kleinanzeigen_connections set status='connected',last_synced_at=v_now,quota_used=case when v_observed is not null and (quota_observed_at is null or quota_observed_at<=v_observed) then v_used else quota_used end,quota_observed_at=case when v_observed is not null and (quota_observed_at is null or quota_observed_at<=v_observed) then v_observed else quota_observed_at end where workspace_id=p_workspace_id and id=p_connection_id;
 update public.kleinanzeigen_sync_runs set state='confirmed',completed_at=v_now where id=v_run.id;
 select count(*)::integer into v_count from public.kleinanzeigen_sync_entries where run_id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'state','confirmed','observedAt',v_now,'itemCount',v_count);
end;
$function$;

create or replace function public.kleinanzeigen_read_publications (
  p_workspace_id  uuid,
  p_connection_id bigint,
  p_limit         integer                  default 25,
  p_state         text                     default 'all'::text,
  p_search        text                     default ''::text,
  p_after_id      bigint                   default null::bigint,
  p_snapshot_at   timestamp with time zone default null::timestamp with time zone
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  AS $function$
declare v_connection public.kleinanzeigen_connections; v_snapshot timestamptz; v_rows jsonb; v_next text; v_count integer;
begin
 if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diese Inserate.' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 or p_state is null or p_state not in ('all','active','ended') or p_search is null or char_length(p_search)>200 or (p_after_id is not null and (p_after_id<=0 or p_snapshot_at is null)) then raise exception 'Ungültige Inseratauswahl.' using errcode='22023'; end if;
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id;
 if not found then raise exception 'Kein Zugriff auf dieses Konto.' using errcode='42501'; end if;
 select greatest(v_connection.last_synced_at,max(observed_at)) into v_snapshot from public.kleinanzeigen_publications where workspace_id=p_workspace_id and connection_id=p_connection_id;
 if p_snapshot_at is not null and p_snapshot_at is distinct from v_snapshot then raise exception 'Inseratbestand inzwischen geändert. Lade die erste Seite erneut.' using errcode='40001'; end if;
 if p_after_id is not null and not exists(select 1 from public.kleinanzeigen_publications where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_after_id) then raise exception 'Cursor gehört nicht zu diesem Konto.' using errcode='22023'; end if;
 select count(*)::integer into v_count from public.kleinanzeigen_publications p where p.workspace_id=p_workspace_id and p.connection_id=p_connection_id
  and ((p_state='ended' and not p.available) or (p_state<>'ended' and p.available and (p_state='all' or p.state='active')))
  and position(lower(btrim(p_search)) in lower(p.title))>0;
 select coalesce(jsonb_agg(jsonb_build_object('publicationId',p.id::text,'externalId',p.external_id,'title',p.title,'url',p.url,'state',p.state,'available',p.available,'publishedAt',p.published_at,'publishedOn',p.published_on,'priceCents',p.price_cents,'currency',p.currency,'imageUrl',p.image_url,'observedAt',p.observed_at) order by p.id desc),'[]'::jsonb) into v_rows
 from (select * from public.kleinanzeigen_publications p where p.workspace_id=p_workspace_id and p.connection_id=p_connection_id
  and ((p_state='ended' and not p.available) or (p_state<>'ended' and p.available and (p_state='all' or p.state='active')))
  and position(lower(btrim(p_search)) in lower(p.title))>0 and (p_after_id is null or p.id<p_after_id) order by p.id desc limit p_limit+1) p;
 if jsonb_array_length(v_rows)>p_limit then v_next:=(v_rows->(p_limit-1))->>'publicationId';v_rows:=v_rows-p_limit; end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'snapshotAt',v_snapshot,'items',v_rows,'total',case when v_connection.last_synced_at is null then null else v_count end,'nextId',v_next,'completeness',case when v_connection.last_synced_at is not null then 'complete' when jsonb_array_length(v_rows)>0 then 'partial' else 'unknown' end);
end;
$function$;

create or replace function public.kleinanzeigen_read_transfer_source (
  p_workspace_id         uuid,
  p_target_connection_id bigint,
  p_source_connection_id uuid,
  p_external_id          text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
declare v_account public.marketplace_connections;v_entry public.marketplace_account_entries;v_source jsonb;
begin
 if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diesen Transfer.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_target_connection_id and status<>'disconnected';if not found then raise exception 'Zielkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_source_connection_id and marketplace='vinted' and external_account_id is not null;
 if not found then raise exception 'Quellkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_source_connection_id and external_id=p_external_id and kind='publication';
 if not found then raise exception 'Quellinserat nicht verfügbar.' using errcode='42501';end if;
 v_source := public.kleinanzeigen_saved_listing_source(v_entry.body, v_account.external_account_id, p_external_id);
 return jsonb_build_object('state','ready','workspaceId',p_workspace_id,'connectionId',p_source_connection_id,'entryId',v_entry.id,'externalId',p_external_id,'externalAccountId',v_account.external_account_id,'executionMode',v_account.execution_mode,'source',v_source,'observedAt',v_entry.observed_at,'fingerprint',encode(extensions.digest(v_source::text,'sha256'),'hex'));
end;
$function$;

create function public.kleinanzeigen_saved_listing_source (
  p_body                jsonb,
  p_external_account_id text,
  p_external_id         text
)
  returns jsonb
  language plpgsql
  immutable
  set search_path to ''
  AS $function$
declare
  v_previous jsonb := p_body->'transferSource';
  v_photos jsonb;
  v_hints jsonb;
  v_price jsonb := 'null'::jsonb;
  v_source jsonb;
  v_key text;
begin
  if jsonb_typeof(v_previous) = 'object' and (
    v_previous->>'externalAccountId' is distinct from p_external_account_id or
    v_previous->>'externalId' is distinct from p_external_id
  ) then
    raise exception 'Gespeicherte Quelle gehört zu anderem Konto oder Inserat.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_body->'imageUrls') = 'array' then
    v_photos := p_body->'imageUrls';
  elsif jsonb_typeof(p_body->'imageUrl') = 'string' then
    v_photos := jsonb_build_array(p_body->>'imageUrl');
  else
    v_photos := coalesce(v_previous->'photoReferences', '[]'::jsonb);
  end if;
  v_hints := case when jsonb_typeof(v_previous->'attributeHints') = 'object'
    then v_previous->'attributeHints' else '{}'::jsonb end;
  foreach v_key in array array['brand', 'size', 'condition', 'material', 'color'] loop
    if jsonb_typeof(p_body->v_key) = 'string' and char_length(p_body->>v_key) between 1 and 500 then
      v_hints := v_hints || jsonb_build_object(v_key, p_body->v_key);
    end if;
  end loop;
  if jsonb_typeof(p_body->'price') = 'number' then
    if (p_body->>'price')::numeric between 0 and 99999999 then
      v_price := to_jsonb(round((p_body->>'price')::numeric * 100));
    end if;
  else
    v_price := coalesce(v_previous->'priceCents', 'null'::jsonb);
  end if;
  v_source := jsonb_build_object(
    'externalAccountId', p_external_account_id,
    'externalId', p_external_id,
    'title', coalesce(p_body->>'title', v_previous->>'title'),
    'description', coalesce(p_body->>'text', v_previous->>'description', ''),
    'priceCents', v_price,
    'currency', coalesce(nullif(p_body->>'currency', ''), v_previous->>'currency', 'unknown'),
    'photoReferences', v_photos,
    'attributeHints', v_hints
  );
  return public.kleinanzeigen_validate_transfer_source(v_source);
end;
$function$;

revoke all on function public.kleinanzeigen_saved_listing_source(jsonb, text, text) from public;

grant all on function public.kleinanzeigen_saved_listing_source(jsonb, text, text) to service_role;

create or replace function public.kleinanzeigen_store_sync_page (
  p_workspace_id        uuid,
  p_connection_id       bigint,
  p_token_hash          text,
  p_generation          bigint,
  p_run_id              bigint,
  p_claim_token         text,
  p_external_account_id text,
  p_cursor              text,
  p_next_cursor         text,
  p_items               jsonb
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_run public.kleinanzeigen_sync_runs; v_item jsonb; v_digest text; v_seen jsonb; v_page integer;
begin
 v_run:=public.kleinanzeigen_locked_sync(p_workspace_id,p_connection_id,p_token_hash,p_generation,p_run_id,p_claim_token,p_external_account_id);
 if v_run.state<>'reading' then raise exception 'Abgleich bereits beendet.' using errcode='55000'; end if;
 if p_cursor is null or p_cursor !~ '^page:[1-9][0-9]{0,3}$' or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Ungültige Anzeigenliste.' using errcode='22023'; end if;
 v_page:=split_part(p_cursor,':',2)::integer;
 if (p_next_cursor is not null and p_next_cursor<>('page:'||(v_page+1)::text)) or jsonb_array_length(p_items)>200 or (p_next_cursor is not null and jsonb_array_length(p_items)=0) then raise exception 'Ungültiger Seitenabschluss.' using errcode='22023'; end if;
 v_digest:=encode(extensions.digest(jsonb_build_object('next',p_next_cursor,'items',p_items)::text,'sha256'),'hex');
 v_seen:=v_run.accepted_pages->p_cursor;
 if v_seen is not null then
  if v_seen->>'hash' is distinct from v_digest then raise exception 'Anzeigenseite hat sich geändert.' using errcode='40001'; end if;
  return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'acceptedCursor',p_cursor,'nextCursor',p_next_cursor,'complete',p_next_cursor is null);
 end if;
 if p_cursor is distinct from v_run.next_cursor or (select count(*) from jsonb_object_keys(v_run.accepted_pages))>=500
  or (select count(*) from public.kleinanzeigen_sync_entries where run_id=v_run.id)+jsonb_array_length(p_items)>20000 then raise exception 'Anzeigenfolge unvollständig.' using errcode='55000'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_item:=jsonb_build_object('priceCents',null,'currency',null,'imageUrl',null,'publishedOn',null)||v_item;
  if jsonb_typeof(v_item)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(v_item) key) is distinct from array['currency','externalId','imageUrl','priceCents','publishedAt','publishedOn','state','title','url']::text[]
   or jsonb_typeof(v_item->'externalId') is distinct from 'string' or (v_item->>'externalId') !~ '^[1-9][0-9]{0,31}$'
   or jsonb_typeof(v_item->'title') is distinct from 'string' or char_length(btrim(v_item->>'title')) not between 1 and 512
   or jsonb_typeof(v_item->'url') is distinct from 'string' or (v_item->>'url') !~ ('^https://(www\.)?kleinanzeigen\.de/s-anzeige/[^/?#]+/'||(v_item->>'externalId')||'-[0-9]+-[0-9]+$')
   or v_item->'publishedAt' is distinct from 'null'::jsonb or v_item->>'state' not in ('active','unknown') or jsonb_typeof(v_item->'state') is distinct from 'string' then raise exception 'Anzeigenformat unbekannt.' using errcode='22023'; end if;
  if not ((v_item->'priceCents'='null'::jsonb and v_item->'currency'='null'::jsonb) or
   (jsonb_typeof(v_item->'priceCents')='number' and v_item->>'priceCents' ~ '^[0-9]{1,10}$' and (v_item->>'priceCents')::numeric<=2147483647 and v_item->>'currency'='EUR'))
   or not (v_item->'imageUrl'='null'::jsonb or (jsonb_typeof(v_item->'imageUrl')='string' and char_length(v_item->>'imageUrl')<=2048 and v_item->>'imageUrl' ~ '^https://img\.kleinanzeigen\.de/api/v1/prod-ads/images/[^[:space:]#]+$'))
   or not (v_item->'publishedOn'='null'::jsonb or (jsonb_typeof(v_item->'publishedOn')='string' and v_item->>'publishedOn' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(v_item->>'publishedOn','date')))
   then raise exception 'Anzeigendetails ungueltig.' using errcode='22023'; end if;
  if exists(select 1 from public.kleinanzeigen_sync_entries where run_id=v_run.id and external_id=v_item->>'externalId') then raise exception 'Doppelte Anzeige im Abgleich.' using errcode='40001'; end if;
  insert into public.kleinanzeigen_sync_entries(workspace_id,connection_id,run_id,external_id,title,url,state,price_cents,currency,image_url,published_on)
   values(p_workspace_id,p_connection_id,v_run.id,v_item->>'externalId',v_item->>'title',v_item->>'url',v_item->>'state',(v_item->>'priceCents')::integer,v_item->>'currency',v_item->>'imageUrl',(v_item->>'publishedOn')::date);
 end loop;
 update public.kleinanzeigen_sync_runs set next_cursor=p_next_cursor,accepted_pages=accepted_pages||jsonb_build_object(p_cursor,jsonb_build_object('hash',v_digest)),lease_until=least((select expires_at from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id),clock_timestamp()+interval '2 minutes') where id=v_run.id;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'runId',v_run.id::text,'generation',p_generation,'acceptedCursor',p_cursor,'nextCursor',p_next_cursor,'complete',p_next_cursor is null);
end;
$function$;

create or replace function public.kleinanzeigen_validate_transfer_source (
  p_source jsonb
)
  returns jsonb
  language plpgsql
  immutable
  set search_path to ''
  AS $function$
declare v_photo jsonb;v_key text;v_value jsonb;
begin
 if jsonb_typeof(p_source) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_source))<>8 or not(p_source ?& array['externalAccountId','externalId','title','description','priceCents','currency','photoReferences','attributeHints']) or jsonb_typeof(p_source->'externalAccountId') is distinct from 'string' or jsonb_typeof(p_source->'externalId') is distinct from 'string' or p_source->>'externalAccountId' !~ '^[1-9][0-9]{0,31}$' or p_source->>'externalId' !~ '^[1-9][0-9]{0,31}$' or jsonb_typeof(p_source->'title') is distinct from 'string' or char_length(btrim(p_source->>'title')) not between 1 and 1000 or jsonb_typeof(p_source->'description') is distinct from 'string' or char_length(p_source->>'description')>100000 or jsonb_typeof(p_source->'currency') is distinct from 'string' or char_length(p_source->>'currency') not between 1 and 12 or not (p_source ? 'priceCents') or (p_source->>'priceCents' is not null and (jsonb_typeof(p_source->'priceCents')<>'number' or p_source->>'priceCents' !~ '^[0-9]+$' or (p_source->>'priceCents')::numeric>9999999900)) or jsonb_typeof(p_source->'photoReferences') is distinct from 'array' or jsonb_typeof(p_source->'attributeHints') is distinct from 'object' then raise exception 'Ungültige vollständige Quelle.' using errcode='22023';end if;
 if jsonb_array_length(p_source->'photoReferences') not between 0 and 40 or (select count(*) from jsonb_object_keys(p_source->'attributeHints'))>50 then raise exception 'Unvollständige Quelle.' using errcode='22023';end if;
 for v_photo in select * from jsonb_array_elements(p_source->'photoReferences') loop
  if jsonb_typeof(v_photo)<>'string' or char_length(v_photo#>>'{}')>2000 or (v_photo#>>'{}') !~ '^https://images[12]\.vinted\.net/[^#[:space:]]+$' then raise exception 'Ungültige Bildquelle.' using errcode='22023';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(p_source->'photoReferences'))<>jsonb_array_length(p_source->'photoReferences') then raise exception 'Doppelte Bildquelle.' using errcode='22023';end if;
 for v_key,v_value in select * from jsonb_each(p_source->'attributeHints') loop
  if char_length(v_key) not between 1 and 160 or jsonb_typeof(v_value)<>'string' or char_length(v_value#>>'{}')>500 then raise exception 'Ungültiger Quellhinweis.' using errcode='22023';end if;
 end loop;
 return p_source;
end;
$function$;

alter table public.kleinanzeigen_publications
  add column price_cents integer;

alter table public.kleinanzeigen_publications
  add constraint kleinanzeigen_publications_price_cents_check check (price_cents >= 0);

alter table public.kleinanzeigen_publications
  add column currency text;

alter table public.kleinanzeigen_publications
  add constraint kleinanzeigen_publications_check check (price_cents IS NULL AND currency IS NULL OR price_cents IS NOT NULL AND currency IS NOT NULL);

alter table public.kleinanzeigen_publications
  add constraint kleinanzeigen_publications_currency_check check (currency = 'EUR'::text);

alter table public.kleinanzeigen_publications
  add column image_url text;

alter table public.kleinanzeigen_publications
  add constraint kleinanzeigen_publications_image_url_check
    check (char_length(image_url) <= 2048 AND image_url ~ '^https://img\.kleinanzeigen\.de/api/v1/prod-ads/images/[^[:space:]#]+$'::text);

alter table public.kleinanzeigen_publications
  add column published_on date;

alter table public.kleinanzeigen_sync_entries
  add column price_cents integer;

alter table public.kleinanzeigen_sync_entries
  add constraint kleinanzeigen_sync_entries_price_cents_check check (price_cents >= 0);

alter table public.kleinanzeigen_sync_entries
  add column currency text;

alter table public.kleinanzeigen_sync_entries
  add constraint kleinanzeigen_sync_entries_check check (price_cents IS NULL AND currency IS NULL OR price_cents IS NOT NULL AND currency IS NOT NULL);

alter table public.kleinanzeigen_sync_entries
  add constraint kleinanzeigen_sync_entries_currency_check check (currency = 'EUR'::text);

alter table public.kleinanzeigen_sync_entries
  add column image_url text;

alter table public.kleinanzeigen_sync_entries
  add constraint kleinanzeigen_sync_entries_image_url_check
    check (char_length(image_url) <= 2048 AND image_url ~ '^https://img\.kleinanzeigen\.de/api/v1/prod-ads/images/[^[:space:]#]+$'::text);

alter table public.kleinanzeigen_sync_entries
  add column published_on date;