-- Gespeicherte Beschreibungen und vollständige Vinted-Quellen erhalten.
-- Betrifft sechs Quellen-/Transfer-/Cachefunktionen; keine Tabellen oder Datenlöschung.
-- Automatisch per pg-delta erzeugt; explizite Funktionsrechte aus dem deklarativen Schema ergänzt.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

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
  as $function$
declare v_listing public.listings;v_photo jsonb;v_position integer:=0;v_source jsonb;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Bildübernahme nicht freigegeben.' using errcode='42501';end if;
 select * into v_listing from public.listings where id=p_listing_id and workspace_id=p_workspace_id and source_reference is not null for update;
 if not found then raise exception 'Entwurf nicht verfügbar.' using errcode='42501';end if;
 if p_expected_revision is distinct from v_listing.revision or v_listing.status<>'prepared' or v_listing.transfer_images_complete or exists(select 1 from public.listing_images where listing_id=p_listing_id) then raise exception 'Fassung oder Bilder inzwischen geändert.' using errcode='40001';end if;
 select public.kleinanzeigen_saved_publication_source(p_workspace_id, e.connection_id, e.external_id) into v_source from public.marketplace_account_entries e where e.workspace_id=p_workspace_id and e.connection_id::text=v_listing.source_reference->>'connectionId' and e.id::text=v_listing.source_reference->>'entryId' and e.external_id=v_listing.source_reference->>'externalId' and e.kind='publication';
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
  as $function$
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
 v_fingerprint:=encode(extensions.digest(public.kleinanzeigen_saved_publication_source(p_workspace_id,v_account.id,v_source.external_id)::text,'sha256'),'hex');
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
  as $function$
declare v_account public.marketplace_connections;v_entry public.marketplace_account_entries;v_source jsonb;
begin
 if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diesen Transfer.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_target_connection_id and status<>'disconnected';if not found then raise exception 'Zielkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_source_connection_id and marketplace='vinted' and external_account_id is not null;
 if not found then raise exception 'Quellkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_source_connection_id and external_id=p_external_id and kind='publication';
 if not found then raise exception 'Quellinserat nicht verfügbar.' using errcode='42501';end if;
 v_source := public.kleinanzeigen_saved_publication_source(p_workspace_id, p_source_connection_id, p_external_id);
 return jsonb_build_object('state','ready','workspaceId',p_workspace_id,'connectionId',p_source_connection_id,'entryId',v_entry.id,'externalId',p_external_id,'externalAccountId',v_account.external_account_id,'executionMode',v_account.execution_mode,'source',v_source,'observedAt',v_entry.observed_at,'fingerprint',encode(extensions.digest(v_source::text,'sha256'),'hex'));
end;
$function$;

create or replace function public.kleinanzeigen_saved_listing_source (
  p_body                jsonb,
  p_external_account_id text,
  p_external_id         text
)
  returns jsonb
  language plpgsql
  immutable
  set search_path to ''
  as $function$
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
  -- Gespeicherte Originalfotos sind vollstaendig; der normale Cache kann nur ein Cover enthalten.
  if jsonb_typeof(v_previous->'photoReferences') = 'array' and jsonb_array_length(v_previous->'photoReferences') > 0 then
    v_photos := v_previous->'photoReferences';
  elsif jsonb_typeof(p_body->'imageUrls') = 'array' then
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
    -- Ein bestaetigt geladener Leertext ist eine bewusste leere Beschreibung.
    -- Nicht geladene Platzhalter duerfen einen gespeicherten Volltext nicht verdecken.
    'description', case
      when p_body->>'textState' = 'loaded' and jsonb_typeof(p_body->'text') = 'string'
        then p_body->>'text'
      else coalesce(nullif(p_body->>'text', ''), v_previous->>'description', '')
    end,
    'priceCents', v_price,
    'currency', coalesce(nullif(p_body->>'currency', ''), v_previous->>'currency', 'unknown'),
    'photoReferences', v_photos,
    'attributeHints', v_hints
  );
  return public.kleinanzeigen_validate_transfer_source(v_source);
end;
$function$;

create function public.kleinanzeigen_saved_publication_source (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_external_id   text
)
  returns jsonb
  language plpgsql
  stable
  set search_path to ''
  as $function$
declare
  v_body jsonb;
  v_account_id text;
  v_source jsonb;
  v_description text;
begin
  select e.body, c.external_account_id into v_body, v_account_id
  from public.marketplace_account_entries e
  join public.marketplace_connections c on c.workspace_id = e.workspace_id and c.id = e.connection_id
  where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id
    and e.external_id = p_external_id and e.kind = 'publication'
    and c.marketplace = 'vinted' and c.external_account_id is not null;
  if not found then return null; end if;
  v_source := public.kleinanzeigen_saved_listing_source(v_body, v_account_id, p_external_id);
  if v_source->>'description' <> ''
    or (v_body->>'textState' = 'loaded' and jsonb_typeof(v_body->'text') = 'string')
    or jsonb_typeof(v_body->'transferSource'->'description') = 'string' then
    return v_source;
  end if;
  select j.snapshot->'content'->>'description' into v_description
  from public.marketplace_listing_jobs j
  where j.workspace_id = p_workspace_id and j.connection_id = p_connection_id
    and j.external_account_id = v_account_id and j.external_id = p_external_id
    and j.state = 'confirmed' and j.action = 'publish' and j.provider_state = 'active'
    and j.started_at is not null and isfinite(j.verified_at)
    and j.snapshot->>'connectionId' = p_connection_id::text
    and public.marketplace_listing_content_valid(j.snapshot->'content')
    and jsonb_typeof(j.snapshot->'content'->'description') = 'string'
    and length(btrim(j.snapshot->'content'->>'description')) between 1 and 20000
  order by j.verified_at desc, j.id desc limit 1;
  if v_description is not null then
    v_source := jsonb_set(v_source, '{description}', to_jsonb(v_description), true);
  end if;
  return v_source;
end;
$function$;

revoke all on function public.kleinanzeigen_saved_publication_source(uuid, uuid, text) from public;

grant all on function public.kleinanzeigen_saved_publication_source(uuid, uuid, text) to service_role;

create or replace function public.marketplace_preserve_listing_text()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if new.kind = 'publication' and old.kind = 'publication'
    and old.body->>'textState' = 'loaded'
    and jsonb_typeof(old.body->'text') = 'string'
    and coalesce(new.body->>'textState', 'not_loaded') = 'not_loaded' then
    new.body := jsonb_set(new.body, '{text}', old.body->'text', true);
    new.body := jsonb_set(new.body, '{textState}', to_jsonb('loaded'::text), true);
  end if;
  -- Listenimporte liefern keine vollständige Quelle. Nur bei unveränderter
  -- Konto-/Inseratbindung übernehmen; ein bewusst gesetztes neues Feld gilt weiter.
  if new.kind = 'publication' and old.kind = 'publication'
    and row(new.workspace_id, new.connection_id, new.external_id)
      is not distinct from row(old.workspace_id, old.connection_id, old.external_id)
    and not (new.body ? 'transferSource')
    and jsonb_typeof(old.body->'transferSource') = 'object'
    and (old.body->'transferSource') ?& array['externalAccountId', 'externalId', 'title', 'description', 'priceCents', 'currency', 'photoReferences', 'attributeHints']
    and old.body->'transferSource'->>'externalId' = new.external_id
    and jsonb_typeof(old.body->'transferSource'->'description') = 'string'
    and jsonb_typeof(old.body->'transferSource'->'photoReferences') = 'array'
    and jsonb_typeof(old.body->'transferSource'->'attributeHints') = 'object'
    and exists(select 1 from public.marketplace_connections c
      where c.workspace_id = new.workspace_id and c.id = new.connection_id
        and c.marketplace = 'vinted'
        and c.external_account_id = old.body->'transferSource'->>'externalAccountId') then
    new.body := jsonb_set(new.body, '{transferSource}', old.body->'transferSource', true);
  end if;
  return new;
end;
$function$;

revoke all on function public.kleinanzeigen_saved_publication_source(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.kleinanzeigen_saved_publication_source(uuid,uuid,text) to service_role;
