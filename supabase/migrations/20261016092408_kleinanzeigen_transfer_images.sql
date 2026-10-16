-- Zweck: Vollständige Transferbilder in listings/listing_images und Revision bei jeder Bildänderung.
alter table "public"."listings" add column "transfer_images_complete" boolean not null default false;

set check_function_bodies = off;

create or replace function public.kleinanzeigen_complete_transfer_images(p_workspace_id uuid, p_listing_id uuid, p_expected_revision bigint, p_user_id uuid, p_photos jsonb)
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
 select body->'transferSource' into v_source from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id::text=v_listing.source_reference->>'connectionId' and id::text=v_listing.source_reference->>'entryId' and external_id=v_listing.source_reference->>'externalId' and kind='publication';
 if v_source is null or encode(extensions.digest((v_source-'observedAt')::text,'sha256'),'hex') is distinct from v_listing.source_reference->>'fingerprint' then raise exception 'Quelle inzwischen geändert.' using errcode='40001';end if;
 if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 20 or jsonb_array_length(p_photos)<>jsonb_array_length(v_source->'photoReferences') then raise exception 'Fotos nicht vollständig übernommen.' using errcode='22023';end if;
 for v_photo in select * from jsonb_array_elements(p_photos) loop
  if jsonb_typeof(v_photo)<>'object' or (select count(*) from jsonb_object_keys(v_photo))<>3 or v_photo->>'sortOrder' is distinct from v_position::text or jsonb_typeof(v_photo->'fileName') is distinct from 'string' or char_length(v_photo->>'fileName') not between 1 and 255 or v_photo->>'storagePath' !~ ('^listings/'||p_workspace_id::text||'/'||p_listing_id::text||'/[0-9a-f-]+\.(jpg|png|webp)$') then raise exception 'Ungültige Bildablage.' using errcode='22023';end if;
  if not exists(select 1 from storage.objects where bucket_id='item-media' and name=v_photo->>'storagePath' and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 12582912) then raise exception 'Gesichertes Bild nicht verfügbar.' using errcode='22023';end if;
  insert into public.listing_images(workspace_id,listing_id,storage_path,file_name,sort_order) values(p_workspace_id,p_listing_id,v_photo->>'storagePath',v_photo->>'fileName',v_position);
  v_position:=v_position+1;
 end loop;
 update public.listings set transfer_images_complete=true,image_selection_saved=true where id=p_listing_id returning * into v_listing;
 return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);
end;
$function$
;

create or replace function public.kleinanzeigen_track_listing_image_revision()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_listing_id uuid;v_workspace_id uuid;
begin
 if tg_op='UPDATE' and (new.listing_id is distinct from old.listing_id or new.workspace_id is distinct from old.workspace_id) then raise exception 'Bildzuordnung darf nicht geändert werden.' using errcode='22023';end if;
 if tg_op='DELETE' then v_listing_id:=old.listing_id;v_workspace_id:=old.workspace_id;else v_listing_id:=new.listing_id;v_workspace_id:=new.workspace_id;end if;
 if current_setting('role')<>'service_role' and current_setting('role')<>'none' and not public.is_workspace_member(v_workspace_id) then raise exception 'Kein Zugriff auf diese Bilder.' using errcode='42501';end if;
 update public.listings set updated_at=clock_timestamp() where id=v_listing_id and workspace_id=v_workspace_id;
 if tg_op='DELETE' then return old;end if;return new;
end;
$function$
;

create trigger listing_images_track_revision before insert or delete or update on public.listing_images for each row execute function public.kleinanzeigen_track_listing_image_revision();

-- Explicit Kleinanzeigen image permissions from declarative schema
revoke all on function public.kleinanzeigen_track_listing_image_revision() from public,anon,authenticated,service_role;
revoke all on function public.kleinanzeigen_complete_transfer_images(uuid,uuid,bigint,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_complete_transfer_images(uuid,uuid,bigint,uuid,jsonb) to service_role;
