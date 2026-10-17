-- Zweck: Quellenfunktion serverseitig begrenzen und Bildquellen eindeutig binden.
-- Betroffen: public.kleinanzeigen_saved_listing_source und
-- public.kleinanzeigen_complete_transfer_images.

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
 select public.kleinanzeigen_saved_listing_source(e.body, (select c.external_account_id from public.marketplace_connections c where c.id=e.connection_id), e.external_id) into v_source from public.marketplace_account_entries e where e.workspace_id=p_workspace_id and e.connection_id::text=v_listing.source_reference->>'connectionId' and e.id::text=v_listing.source_reference->>'entryId' and e.external_id=v_listing.source_reference->>'externalId' and e.kind='publication';
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

revoke all on function public.kleinanzeigen_saved_listing_source(jsonb, text, text) from authenticated;