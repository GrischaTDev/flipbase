-- Private Referenzbilder. Nur der Medien-Endpunkt bestätigt geprüfte PNG-Dateien.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('label-originals', 'label-originals', false, 10000000, array['image/jpeg','image/png','image/webp']),
       ('label-images', 'label-images', false, 6000000, array['image/png'])
on conflict (id) do nothing;

create function public.reserve_label_image(p_request_id uuid, p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare args jsonb := p_input; cached jsonb; asset public.label_image_assets;
begin
    cached := public.label_begin_edit('reserve-image', p_request_id, args);
    if cached is not null then return cached; end if;
    perform public.label_assert_object(p_input,array['originalHash','imageHash','attribution','allowedUse'],'upload');
    perform public.label_assert(p_input->>'originalHash' ~ '^[0-9a-f]{64}$' and
        p_input->>'imageHash' ~ '^[0-9a-f]{64}$','invalid-value','upload.hash');
    perform public.label_assert_text(p_input->'attribution',4000,'upload.attribution');
    perform public.label_assert_text(p_input->'allowedUse',4000,'upload.allowedUse');
    perform public.label_assert(public.label_has_text(p_input->>'attribution') and
        public.label_has_text(p_input->>'allowedUse'),'required-text','upload.permission');
    insert into public.label_image_assets(asset_kind, original_path, created_by)
    values ('reference-image', p_request_id::text, (select auth.uid())) returning * into asset;
    return public.label_finish_edit('reserve-image', p_request_id, args,
        jsonb_build_object('assetId', asset.id, 'originalPath', asset.original_path));
end;
$$;
revoke all on function public.reserve_label_image(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.reserve_label_image(uuid,jsonb) to authenticated;

create function public.complete_label_image(p_asset_id integer, p_actor_id uuid, p_original_bytes integer,
    p_mime_type text, p_width integer, p_height integer, p_attribution text, p_allowed_use text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare asset public.label_image_assets; image_path text := p_asset_id::text || '.png';
begin
    perform pg_advisory_xact_lock(70432001::bigint);
    perform public.label_assert(exists(select 1 from public.platform_operators where user_id = p_actor_id),
        'forbidden', 'actor');
    select * into asset from public.label_image_assets where id = p_asset_id for update;
    perform public.label_assert(asset.created_by = p_actor_id,
        'invalid-value', 'asset');
    if asset.processing_status = 'processed' then return jsonb_build_object('assetId',asset.id); end if;
    perform public.label_assert(asset.processing_status = 'pending','invalid-value','asset');
    perform public.label_assert(p_width between 1 and 1200 and p_height between 1 and 1200,
        'invalid-value', 'dimensions');
    perform public.label_assert(p_original_bytes between 1 and 10000000 and
        p_mime_type in ('image/jpeg','image/png','image/webp'), 'invalid-value', 'original');
    perform public.label_assert(public.label_has_text(p_attribution) and char_length(p_attribution) <= 4000
        and public.label_has_text(p_allowed_use) and char_length(p_allowed_use) <= 4000,
        'required-text', 'permission');
    perform public.label_assert(exists(select 1 from storage.objects where bucket_id = 'label-originals'
        and name = asset.original_path) and exists(select 1 from storage.objects where bucket_id = 'label-images'
        and name = image_path), 'image-not-processed', 'objects');
    update public.label_image_assets set processing_status = 'processed', original_bytes = p_original_bytes,
        mime_type = p_mime_type, width = p_width, height = p_height, gallery_path = image_path,
        detail_path = image_path where id = asset.id;
    insert into public.label_image_permissions(label_image_asset_id, status, attribution, allowed_use,
        reviewed_by, reviewed_at) values(asset.id, 'approved', p_attribution, p_allowed_use, p_actor_id, now());
    insert into public.label_change_events(actor_id, action, details)
    values(p_actor_id, 'complete-image', jsonb_build_object('assetId', asset.id));
    return jsonb_build_object('assetId', asset.id);
end;
$$;
revoke all on function public.complete_label_image(integer, uuid, integer, text, integer, integer, text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.complete_label_image(integer, uuid, integer, text, integer, integer, text, text) to service_role;

create function public.can_read_label_image(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
    select (select auth.uid()) is not null and exists (
        select 1 from public.label_image_assets a
        join public.label_image_permissions p on p.label_image_asset_id = a.id
        where a.detail_path = p_path and a.processing_status = 'processed'
        and (public.is_platform_operator() or (public.can_read_label_library() and p.status = 'approved'
            and exists(select 1 from public.label_revision_images i
                join public.label_references r on r.published_revision_id = i.label_revision_id
                where i.label_image_asset_id = a.id and public.label_reference_is_published(r.id))))
    );
$$;
revoke all on function public.can_read_label_image(text) from public, anon, authenticated, service_role;
grant execute on function public.can_read_label_image(text) to authenticated;
-- Keine Browser-SELECT-Policy: Nur der Medien-Endpunkt erstellt Links mit exakt 60 Sekunden Laufzeit.

create function public.list_label_admin_images()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
    if (select auth.uid()) is null or public.is_platform_operator() is not true then
        raise exception 'Nur für Plattformbetreiber' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('assetId', a.id, 'attribution', p.attribution,
        'allowedUse', p.allowed_use, 'status', p.status, 'version', p.version) order by a.id desc), '[]')
    into result from public.label_image_assets a join public.label_image_permissions p on p.label_image_asset_id = a.id
    where a.processing_status = 'processed';
    return result;
end;
$$;
revoke all on function public.list_label_admin_images() from public, anon, authenticated, service_role;
grant execute on function public.list_label_admin_images() to authenticated;

create function public.set_label_image_permission(p_asset_id integer, p_expected_version integer,
    p_status text, p_attribution text, p_allowed_use text, p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare args jsonb := jsonb_build_object('id',p_asset_id,'version',p_expected_version,'status',p_status,
    'attribution',p_attribution,'allowedUse',p_allowed_use); cached jsonb; permission public.label_image_permissions;
begin
    cached := public.label_begin_edit('image-permission',p_request_id,args);
    if cached is not null then return cached; end if;
    perform public.label_assert(p_status in ('approved','revoked') and public.label_has_text(p_attribution)
        and public.label_has_text(p_allowed_use) and char_length(p_attribution) <= 4000
        and char_length(p_allowed_use) <= 4000,'invalid-value','permission');
    select * into permission from public.label_image_permissions where label_image_asset_id = p_asset_id for update;
    if not found then raise exception 'Bild nicht verfügbar' using errcode = 'P0002'; end if;
    perform public.label_check_version(permission.version,p_expected_version);
    update public.label_image_permissions set status = p_status, attribution = p_attribution,
        allowed_use = p_allowed_use, version = version + 1, reviewed_by = (select auth.uid()), reviewed_at = now(),
        revoked_at = case when p_status = 'revoked' then now() else null end
    where id = permission.id;
    update public.label_library_settings set catalog_version = catalog_version + 1 where id = 1;
    return public.label_finish_edit('image-permission',p_request_id,args,jsonb_build_object('version',permission.version + 1));
end;
$$;
revoke all on function public.set_label_image_permission(integer,integer,text,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_label_image_permission(integer,integer,text,text,text,uuid) to authenticated;

create function public.set_label_brand_archive(p_id integer,p_expected_version integer,p_archived boolean,
    p_line boolean,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare args jsonb := jsonb_build_object('id',p_id,'version',p_expected_version,'archived',p_archived,'line',p_line);
    cached jsonb; actual_version integer;
begin
    cached := public.label_begin_edit('brand-archive',p_request_id,args);
    if cached is not null then return cached; end if;
    perform public.label_assert(p_archived is not null and p_line is not null,'invalid-value','archive');
    if p_line then select version into actual_version from public.label_brand_lines where id = p_id for update;
    else select version into actual_version from public.label_brands where id = p_id for update; end if;
    if not found then raise exception 'Eintrag nicht verfügbar' using errcode = 'P0002'; end if;
    perform public.label_check_version(actual_version,p_expected_version);
    if p_line then update public.label_brand_lines set archived = p_archived,version = version + 1 where id = p_id;
    else update public.label_brands set archived = p_archived,version = version + 1 where id = p_id; end if;
    update public.label_library_settings set catalog_version = catalog_version + 1 where id = 1;
    return public.label_finish_edit('brand-archive',p_request_id,args,jsonb_build_object('version',actual_version + 1));
end;
$$;
revoke all on function public.set_label_brand_archive(integer,integer,boolean,boolean,uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_label_brand_archive(integer,integer,boolean,boolean,uuid) to authenticated;

create function public.list_label_reader_brands()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
    if public.can_read_label_library() is not true then raise exception 'Nicht verfügbar' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('slug',slug,'name',name) order by name),'[]')
    into result from public.label_brands where not archived;
    return result;
end;
$$;
revoke all on function public.list_label_reader_brands() from public, anon, authenticated, service_role;
grant execute on function public.list_label_reader_brands() to authenticated;
