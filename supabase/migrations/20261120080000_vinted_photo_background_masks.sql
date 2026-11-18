-- Server-seitige Vordergrundmasken fuer die Vinted-Untergrundberuhigung (Stufe 3A), privater Masken-Bucket sowie photo_options-Validierung und Bereinigung fuer backgroundCalm.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create table public.vinted_photo_background_masks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('fal', 'replicate')),
  model text not null check (length(btrim(model)) between 1 and 120),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'unknown')),
  storage_path text unique,
  byte_size bigint check (byte_size between 1 and 15728640),
  estimated_cost_usd numeric(14,8) check (estimated_cost_usd >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.vinted_photo_background_masks is 'Freistellungs-Vordergrundmasken fuer die Untergrundberuhigung im Relisting-Editor; Originale bleiben im separaten Bucket unveraendert.';

create index vinted_photo_background_masks_cache_idx on public.vinted_photo_background_masks(workspace_id, input_hash, created_at desc) where status = 'completed';
create index vinted_photo_background_masks_user_time_idx on public.vinted_photo_background_masks(user_id, created_at desc);

alter table public.vinted_photo_background_masks enable row level security;

create policy "Eigene Fotomasken lesen" on public.vinted_photo_background_masks
  for select to authenticated using (public.marketplace_can_manage(workspace_id));

create policy "Fotomasken nur ueber Serverfunktion schreiben" on public.vinted_photo_background_masks
  for insert to authenticated with check (false);

create policy "Fotomasken nicht direkt aendern" on public.vinted_photo_background_masks
  for update to authenticated using (false) with check (false);

create policy "Fotomasken nicht direkt loeschen" on public.vinted_photo_background_masks
  for delete to authenticated using (false);

revoke all on public.vinted_photo_background_masks from public, anon, authenticated;
grant select on public.vinted_photo_background_masks to authenticated;
grant all on public.vinted_photo_background_masks to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-listing-masks', 'marketplace-listing-masks', false, 15728640, array['image/png'])
on conflict (id) do nothing;

create policy "Eigene Fotomasken im Storage lesen" on storage.objects for select to authenticated using (
  bucket_id = 'marketplace-listing-masks' and exists (
    select 1 from public.vinted_photo_background_masks m
    where m.storage_path = name and m.status = 'completed' and public.marketplace_can_manage(m.workspace_id)
  )
);

create or replace function public.reserve_vinted_photo_background_mask(
  p_user_id uuid,
  p_workspace_id uuid,
  p_input_hash text,
  p_provider text,
  p_model text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_mask public.vinted_photo_background_masks;
  v_id uuid;
  v_path text;
begin
  if p_user_id is null or p_workspace_id is null
    or not public.user_can_access_workspace(p_workspace_id, p_user_id)
    or not exists (
      select 1 from public.workspace_members m
      join public.workspaces w on w.id = m.workspace_id
      where m.workspace_id = p_workspace_id and m.user_id = p_user_id
        and m.role in ('owner', 'admin') and w.archived_at is null
    ) then
    raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
  end if;
  if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$'
    or p_provider is null or p_provider not in ('fal', 'replicate')
    or p_model is null or length(btrim(p_model)) not between 1 and 120 then
    raise exception 'Ungueltige Maskendaten.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 459));
  select * into v_mask from public.vinted_photo_background_masks m
    where m.workspace_id = p_workspace_id and m.input_hash = p_input_hash and m.status = 'completed'
      and m.storage_path is not null
      and exists (select 1 from storage.objects o where o.bucket_id = 'marketplace-listing-masks' and o.name = m.storage_path)
    order by m.created_at desc limit 1;
  if found then
    return jsonb_build_object('id', v_mask.id, 'storagePath', v_mask.storage_path, 'cached', true);
  end if;
  if exists (select 1 from public.vinted_photo_background_masks where user_id = p_user_id and status = 'pending' and created_at > now() - interval '2 minutes') then
    return jsonb_build_object('error', 'mask_busy');
  end if;
  if (select count(*) from public.vinted_photo_background_masks where user_id = p_user_id and created_at > now() - interval '1 hour') >= 60
    or (select count(*) from public.vinted_photo_background_masks where user_id = p_user_id and created_at > now() - interval '1 day') >= 300 then
    return jsonb_build_object('error', 'mask_limit');
  end if;
  update public.vinted_photo_background_masks set status = 'unknown', error_code = 'interrupted', finished_at = now()
    where user_id = p_user_id and status = 'pending';
  v_id := gen_random_uuid();
  v_path := p_workspace_id::text || '/' || v_id::text || '.png';
  insert into public.vinted_photo_background_masks(id, workspace_id, user_id, input_hash, provider, model, storage_path)
    values (v_id, p_workspace_id, p_user_id, p_input_hash, p_provider, btrim(p_model), v_path) returning * into v_mask;
  return jsonb_build_object('id', v_mask.id, 'storagePath', v_mask.storage_path, 'cached', false);
end;
$$;

revoke all on function public.reserve_vinted_photo_background_mask(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_vinted_photo_background_mask(uuid, uuid, text, text, text) to service_role;

create or replace function public.vinted_photo_background_mask_usage(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case
    when not public.marketplace_can_manage(p_workspace_id) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(to_jsonb(summary)) from (
        select provider, count(*) as requests,
          count(*) filter (where status = 'completed') as completed_requests,
          count(*) filter (where estimated_cost_usd is null and status <> 'failed') as unknown_cost_requests,
          sum(estimated_cost_usd) as estimated_cost_usd
        from public.vinted_photo_background_masks
        where workspace_id = p_workspace_id and created_at > now() - interval '30 days'
        group by provider order by provider
      ) as summary
    ), '[]'::jsonb)
  end;
$$;

revoke all on function public.vinted_photo_background_mask_usage(uuid) from public, anon;
grant execute on function public.vinted_photo_background_mask_usage(uuid) to authenticated;

create or replace function public.marketplace_listing_photo_options_valid(p_options jsonb,p_image_ids bigint[])
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_key text; v_crop jsonb; v_adj jsonb; v_calm jsonb;
begin
  if p_image_ids is null or p_options is null or octet_length(p_options::text)>20000 or jsonb_typeof(p_options)<>'object' or p_options-array['resize','crops','filter','border','adjustments','photoAdjustments','backgroundCalm']<>'{}'::jsonb
    or not (p_options ?& array['resize','crops']) or (p_options->'resize'<>'null'::jsonb and p_options->'resize' not in ('1200'::jsonb,'1600'::jsonb,'2400'::jsonb))
    or (p_options ? 'filter' and p_options->'filter' not in ('"none"'::jsonb,'"lighter"'::jsonb,'"darker"'::jsonb,'"soft"'::jsonb,'"natural"'::jsonb,'"contrast"'::jsonb))
    or (p_options ? 'border' and p_options->'border' not in ('"none"'::jsonb,'"small"'::jsonb,'"medium"'::jsonb,'"large"'::jsonb))
    or jsonb_typeof(p_options->'crops')<>'object' then return false; end if;
  for v_key,v_crop in select key,value from jsonb_each(p_options->'crops') loop
    if v_key !~ '^[1-9][0-9]{0,18}$' or not (v_key::bigint=any(p_image_ids)) or jsonb_typeof(v_crop)<>'object'
      or (select count(*) from jsonb_object_keys(v_crop))<>5 or not (v_crop ?& array['x','y','width','height','rotation'])
      or exists(select 1 from jsonb_each(v_crop) where jsonb_typeof(value)<>'number') then return false; end if;
    if v_crop->'rotation' not in ('0'::jsonb,'90'::jsonb,'180'::jsonb,'270'::jsonb) or (v_crop->>'x')::numeric<0 or (v_crop->>'y')::numeric<0
      or (v_crop->>'width')::numeric<=0 or (v_crop->>'height')::numeric<=0 or (v_crop->>'x')::numeric+(v_crop->>'width')::numeric>1.000000001
      or (v_crop->>'y')::numeric+(v_crop->>'height')::numeric>1.000000001 then return false; end if;
  end loop;
  if p_options ? 'adjustments' then
    v_adj:=p_options->'adjustments';
    if jsonb_typeof(v_adj)<>'object' or (select count(*) from jsonb_object_keys(v_adj))<>8
      or not (v_adj ?& array['exposure','contrast','warmth','saturation','sharpness','denoise','straighten','flipX'])
      or jsonb_typeof(v_adj->'flipX')<>'boolean'
      or exists(select 1 from unnest(array['exposure','contrast','warmth','saturation','sharpness','denoise','straighten']) k where jsonb_typeof(v_adj->k)<>'number')
      or exists(select 1 from unnest(array['exposure','contrast','warmth','saturation']) k where (v_adj->>k)::numeric<>trunc((v_adj->>k)::numeric) or (v_adj->>k)::numeric not between -50 and 50)
      or exists(select 1 from unnest(array['sharpness','denoise']) k where (v_adj->>k)::numeric<>trunc((v_adj->>k)::numeric) or (v_adj->>k)::numeric not between 0 and 100)
      or ((v_adj->>'straighten')::numeric*2)<>trunc((v_adj->>'straighten')::numeric*2)
      or (v_adj->>'straighten')::numeric not between -15 and 15 then return false; end if;
  end if;
  if p_options ? 'photoAdjustments' then
    if jsonb_typeof(p_options->'photoAdjustments')<>'object' then return false; end if;
    for v_key,v_adj in select key,value from jsonb_each(p_options->'photoAdjustments') loop
      if v_key !~ '^[1-9][0-9]{0,18}$' or not (v_key::bigint=any(p_image_ids))
        or jsonb_typeof(v_adj)<>'object' or (select count(*) from jsonb_object_keys(v_adj))<>8
        or not (v_adj ?& array['exposure','contrast','warmth','saturation','sharpness','denoise','straighten','flipX'])
        or jsonb_typeof(v_adj->'flipX')<>'boolean'
        or exists(select 1 from unnest(array['exposure','contrast','warmth','saturation','sharpness','denoise','straighten']) k where jsonb_typeof(v_adj->k)<>'number')
        or exists(select 1 from unnest(array['exposure','contrast','warmth','saturation']) k where (v_adj->>k)::numeric<>trunc((v_adj->>k)::numeric) or (v_adj->>k)::numeric not between -50 and 50)
        or exists(select 1 from unnest(array['sharpness','denoise']) k where (v_adj->>k)::numeric<>trunc((v_adj->>k)::numeric) or (v_adj->>k)::numeric not between 0 and 100)
        or ((v_adj->>'straighten')::numeric*2)<>trunc((v_adj->>'straighten')::numeric*2)
        or (v_adj->>'straighten')::numeric not between -15 and 15 then return false; end if;
    end loop;
  end if;
  if p_options ? 'backgroundCalm' then
    if jsonb_typeof(p_options->'backgroundCalm')<>'object' then return false; end if;
    for v_key,v_calm in select key,value from jsonb_each(p_options->'backgroundCalm') loop
      if v_key !~ '^[1-9][0-9]{0,18}$' or not (v_key::bigint=any(p_image_ids))
        or jsonb_typeof(v_calm)<>'object' or (select count(*) from jsonb_object_keys(v_calm))<>2
        or not (v_calm ?& array['maskId','strength'])
        or jsonb_typeof(v_calm->'maskId')<>'string'
        or (v_calm->>'maskId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(v_calm->'strength')<>'number'
        or (v_calm->>'strength')::numeric<>trunc((v_calm->>'strength')::numeric)
        or (v_calm->>'strength')::numeric not between 1 and 100 then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

create or replace function public.marketplace_listing_photo_masks_accessible(p_workspace_id uuid,p_options jsonb)
returns boolean language sql stable security definer set search_path='' as $$
  select not (p_options ? 'backgroundCalm') or not exists (
    select 1 from jsonb_each(p_options->'backgroundCalm') entry
    where not exists (
      select 1 from public.vinted_photo_background_masks mask
      where mask.id=(entry.value->>'maskId')::uuid
        and mask.workspace_id=p_workspace_id
        and mask.status='completed'
    )
  );
$$;

revoke all on function public.marketplace_listing_photo_masks_accessible(uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.marketplace_drop_photo_option_image(p_options jsonb,p_image_id text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_res jsonb:=jsonb_set(p_options,'{crops}',(p_options->'crops')-coalesce(p_image_id,''));
begin
  if v_res ? 'photoAdjustments' then
    v_res:=jsonb_set(v_res,'{photoAdjustments}',(v_res->'photoAdjustments')-coalesce(p_image_id,''));
  end if;
  if v_res ? 'backgroundCalm' then
    v_res:=jsonb_set(v_res,'{backgroundCalm}',(v_res->'backgroundCalm')-coalesce(p_image_id,''));
  end if;
  return v_res;
end;
$$;

revoke all on function public.marketplace_drop_photo_option_image(jsonb,text) from public,anon,authenticated;
grant execute on function public.marketplace_drop_photo_option_image(jsonb,text) to service_role;

create or replace function public.marketplace_keep_photo_option_images(p_options jsonb,p_image_ids text[])
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_res jsonb:=jsonb_set(p_options,'{crops}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_options->'crops') where key=any(p_image_ids)),'{}'::jsonb));
begin
  if v_res ? 'photoAdjustments' then
    v_res:=jsonb_set(v_res,'{photoAdjustments}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(v_res->'photoAdjustments') where key=any(p_image_ids)),'{}'::jsonb));
  end if;
  if v_res ? 'backgroundCalm' then
    v_res:=jsonb_set(v_res,'{backgroundCalm}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(v_res->'backgroundCalm') where key=any(p_image_ids)),'{}'::jsonb));
  end if;
  return v_res;
end;
$$;

revoke all on function public.marketplace_keep_photo_option_images(jsonb,text[]) from public,anon,authenticated;
grant execute on function public.marketplace_keep_photo_option_images(jsonb,text[]) to service_role;

create or replace function public.marketplace_commit_listing_image (
  p_draft_id          text,
  p_expected_revision bigint,
  p_image_id          text,
  p_replace_image_id  text   default null::text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts; v_image public.marketplace_listing_images;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  select * into v_image from public.marketplace_listing_images where id=p_image_id::bigint and draft_id=p_draft_id::bigint for update;
  if not found or v_image.created_by<>(select auth.uid()) then raise exception 'Kein Zugriff auf diesen Upload.' using errcode='42501'; end if;
  -- Bereits bestätigte Antwort darf erneut gelesen werden, ohne ein Bild doppelt anzuhängen.
  if v_image.state='ready' and p_image_id::bigint=any(v_draft.image_ids) then return public.marketplace_listing_draft_document(v_draft); end if;
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_image.state<>'pending' or not exists(select 1 from storage.objects o where o.bucket_id='marketplace-listing-media' and o.name=v_image.storage_path and o.metadata->>'mimetype'=v_image.mime_type and o.metadata->>'size'=v_image.byte_size::text) then raise exception 'Der Upload ist noch nicht vollständig.' using errcode='22023'; end if;
  if p_replace_image_id is not null then
    if not (p_replace_image_id::bigint=any(v_draft.image_ids)) then raise exception 'Das zu ersetzende Foto gehört nicht zur aktuellen Auswahl.' using errcode='42501'; end if;
  elsif cardinality(v_draft.image_ids)>=100 then raise exception 'Dieser Entwurf enthält bereits 100 Fotos.' using errcode='22023'; end if;
  update public.marketplace_listing_images set state='ready' where id=p_image_id::bigint;
  -- Erst das vollständig hochgeladene Original bestätigen, dann seine Auswahlposition atomar ersetzen.
  update public.marketplace_listing_drafts set image_ids=case when p_replace_image_id is null then array_append(image_ids,p_image_id::bigint) else array_replace(image_ids,p_replace_image_id::bigint,p_image_id::bigint) end,
    photo_options=public.marketplace_drop_photo_option_image(photo_options,p_replace_image_id),
    revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

create or replace function public.marketplace_set_listing_image_order (
  p_draft_id          text,
  p_expected_revision bigint,
  p_image_ids         text[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare v_draft public.marketplace_listing_drafts;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_image_ids is null or cardinality(p_image_ids)>100 or exists(select 1 from unnest(p_image_ids) id where id is null or id !~ '^[1-9][0-9]{0,18}$') or (select count(distinct id) from unnest(p_image_ids) id)<>cardinality(p_image_ids) then raise exception 'Ungültige Bildauswahl.' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_image_ids) selected(id) where not exists(select 1 from public.marketplace_listing_images i where i.id=selected.id::bigint and i.draft_id=p_draft_id::bigint and i.state='ready')) then raise exception 'Diese Fotos gehören nicht zum Entwurf.' using errcode='42501'; end if;
  update public.marketplace_listing_drafts set image_ids=p_image_ids::bigint[],
    photo_options=public.marketplace_keep_photo_option_images(photo_options,p_image_ids),
    revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

create or replace function public.marketplace_set_listing_photo_options(p_draft_id text,p_expected_revision bigint,p_options jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_draft public.marketplace_listing_drafts;
begin
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if p_expected_revision is distinct from v_draft.revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if not public.marketplace_listing_photo_options_valid(p_options,v_draft.image_ids)
    or not public.marketplace_listing_photo_masks_accessible(v_draft.workspace_id,p_options) then
    raise exception 'Ungültige Bildbearbeitung.' using errcode='22023';
  end if;
  if v_draft.photo_options is distinct from p_options then
    update public.marketplace_listing_drafts set photo_options=p_options,revision=revision+1,updated_at=clock_timestamp() where id=v_draft.id returning * into v_draft;
  end if;
  return public.marketplace_listing_draft_document(v_draft);
end;
$$;

create or replace function public.marketplace_enqueue_listing_internal(p_draft_id text,p_expected_revision bigint,p_action text,p_request_id uuid,p_ai_photo boolean,
  p_scheduled_at timestamptz default null,p_time_zone text default null,p_late_policy text default 'pause_after_30_minutes',p_replaces_job_id bigint default null,p_replaces_version bigint default null,p_relist_delay_seconds integer default 0)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_draft public.marketplace_listing_drafts; v_permission public.marketplace_listing_permissions; v_job public.marketplace_listing_jobs; v_previous public.marketplace_listing_jobs; v_images jsonb; v_hash text; v_request jsonb; v_relist_entry_id uuid;
begin
  perform pg_advisory_xact_lock(91731,1);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint and deleted_at is null;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 or p_request_id is null or p_action is null or p_action not in ('publish','vinted_draft') or p_ai_photo is null
    or p_late_policy is null or p_late_policy not in ('pause_after_30_minutes','publish_when_available')
    or (p_scheduled_at is null and p_time_zone is not null) or (p_scheduled_at is not null and (not isfinite(p_scheduled_at) or p_time_zone is null
      or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone))) then raise exception 'Ungültiger Inseratauftrag.' using errcode='22023'; end if;
  if p_relist_delay_seconds is null or p_relist_delay_seconds not in (0,60,120,180,300,600) or (p_relist_delay_seconds>0 and (v_draft.relist_external_id is null or p_scheduled_at is not null)) then raise exception 'Ungültige Relist-Verzögerung.' using errcode='22023'; end if;
  if (p_replaces_job_id is null)<>(p_replaces_version is null) or (p_replaces_job_id is not null and (p_replaces_job_id<=0 or p_replaces_version not between 1 and 9007199254740991 )) then
    raise exception 'Ungültiger Planungsersatz.' using errcode='22023';
  end if;
  -- Normale Auftragskennungen behalten ihren bisherigen Hash auch nach dieser Erweiterung.
  v_request:=jsonb_build_array(p_draft_id,p_expected_revision,p_action,p_ai_photo,
    to_char(p_scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p_time_zone,p_late_policy);
  if p_replaces_job_id is not null then v_request:=v_request||jsonb_build_array(p_replaces_job_id::text,p_replaces_version); end if;
  if p_relist_delay_seconds>0 then v_request:=v_request||jsonb_build_array(p_relist_delay_seconds); end if;
  v_hash:=encode(extensions.digest(convert_to(v_request::text,'utf8'),'sha256'),'hex');
  select * into v_job from public.marketplace_listing_jobs where workspace_id=v_draft.workspace_id and requested_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_job.request_hash<>v_hash then raise exception 'Diese Auftragskennung wurde bereits verwendet.' using errcode='23505'; end if;
    return public.marketplace_listing_job_document(v_job);
  end if;
  select * into v_permission from public.marketplace_listing_permissions where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id for share;
  if not public.marketplace_listing_permission_valid(v_permission.id,(select auth.uid())) then raise exception 'Inserataktionen sind für dieses Konto nicht freigegeben.' using errcode='42501'; end if;
  if p_scheduled_at is not null and p_scheduled_at<=clock_timestamp() then raise exception 'Der Veröffentlichungstermin muss in der Zukunft liegen.' using errcode='22023'; end if;
  v_draft:=public.marketplace_lock_listing_draft(p_draft_id);
  if v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.connection_id is distinct from v_permission.connection_id then raise exception 'Das Zielkonto wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_draft.relist_external_id is not null and (p_action<>'publish' or v_permission.execution_mode<>'cloud'
    or (v_draft.relist_deleted_at is not null and v_draft.relist_deleted_account_id<>v_permission.external_account_id)
    or (v_draft.relist_deleted_at is null and not exists(select 1 from public.marketplace_account_entries e where e.workspace_id=v_draft.workspace_id and e.connection_id=v_draft.connection_id
      and e.kind='publication' and e.external_id=v_draft.relist_external_id and e.body->>'publicationState'='active'))) then
    raise exception 'Die Relist-Quelle ist nicht mehr verfügbar.' using errcode='22023';
  end if;
  if v_draft.relist_external_id is not null then
    select id into v_relist_entry_id from public.marketplace_account_entries where workspace_id=v_draft.workspace_id and connection_id=v_draft.connection_id
      and kind='publication' and external_id=v_draft.relist_external_id for update;
    -- Alte gelöschte Quellen ohne erhaltene Cachezeile bleiben wiederaufnehmbar; ihre frühere UUID wird nicht erfunden.
    if v_relist_entry_id is null and v_draft.relist_deleted_at is null then raise exception 'Die Relist-Quelle ist nicht mehr verfügbar.' using errcode='22023'; end if;
  end if;
  if p_replaces_job_id is not null then
    select * into v_previous from public.marketplace_listing_jobs where id=p_replaces_job_id and workspace_id=v_draft.workspace_id and draft_id=v_draft.id for update;
    if not found then raise exception 'Kein Zugriff auf diesen Inseratauftrag.' using errcode='42501'; end if;
    if v_previous.version<>p_replaces_version then raise exception 'Der Auftrag wurde inzwischen geändert.' using errcode='40001'; end if;
    if v_previous.state not in ('queued','paused') or (v_previous.scheduled_at is null and v_previous.relist_publish_at is null
      and not (v_previous.state='paused' and v_previous.error_code='editing' and v_previous.editing_previous_state in ('failed','cancelled'))) then raise exception 'Dieser Auftrag kann nicht mehr ersetzt werden.' using errcode='22023'; end if;
    if not public.marketplace_listing_permission_valid(v_previous.permission_id,v_previous.requested_by,v_previous.authorization_version)
      or v_previous.connection_id is distinct from v_draft.connection_id or v_previous.execution_mode<>v_permission.execution_mode or v_previous.external_account_id<>v_permission.external_account_id then
      raise exception 'Die bisherige Planung gehört nicht zur aktuellen Kontofreigabe.' using errcode='42501';
    end if;
    -- Bei jedem späteren Fehler wird auch dieser Abbruch vollständig zurückgerollt.
    update public.marketplace_listing_jobs set state='cancelled',error_code='planning_replaced' where id=v_previous.id;
  end if;
  if exists(select 1 from public.marketplace_listing_jobs where draft_id=v_draft.id and state in ('queued','paused','claimed','writing','outcome_unknown','confirmed')) then raise exception 'Für diesen Entwurf gibt es bereits einen offenen oder bestätigten Auftrag.' using errcode='23505'; end if;
  if v_draft.inventory_item_id is not null then
    perform 1 from public.inventory_items where id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and archived_at is null and status in ('ready','listed') for share;
    if not found or not exists(select 1 from public.inventory_item_sale_states where inventory_item_id=v_draft.inventory_item_id and workspace_id=v_draft.workspace_id and sale_state='no_active_sale') then raise exception 'Dieser Artikel kann momentan nicht angeboten werden.' using errcode='22023'; end if;
  end if;
  if not public.marketplace_listing_photo_options_valid(v_draft.photo_options,v_draft.image_ids)
    or not public.marketplace_listing_photo_masks_accessible(v_draft.workspace_id,v_draft.photo_options) then
    raise exception 'Die Bildbearbeitung passt nicht mehr zur Fotoauswahl.' using errcode='22023';
  end if;
  if not public.marketplace_listing_content_valid(v_draft.content) or coalesce(length(btrim(v_draft.content->>'title')),0)=0 or coalesce(length(btrim(v_draft.content->>'description')),0)=0
    or coalesce(v_draft.content->>'currency','')<>'EUR' or coalesce((v_draft.content->>'priceCents')::bigint,0)<=0 or coalesce((v_draft.content->>'categoryId')::bigint,0)<=0
    or coalesce((v_draft.content->>'conditionId')::bigint,0)<=0 or coalesce((v_draft.content->>'packageSizeId')::bigint,0)<=0 or cardinality(v_draft.image_ids) not between 1 and 20 then raise exception 'Bitte Angaben und Fotos vor der Anbieteraktion vervollständigen.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',image.id::text,'storagePath',image.storage_path,'fileName',image.file_name,'mimeType',image.mime_type,'byteSize',image.byte_size) order by chosen.position) into v_images
    from unnest(v_draft.image_ids) with ordinality chosen(id,position) join public.marketplace_listing_images image on image.id=chosen.id and image.workspace_id=v_draft.workspace_id and image.draft_id=v_draft.id and image.state='ready'
    where exists(select 1 from storage.objects object where object.bucket_id='marketplace-listing-media' and object.name=image.storage_path and object.metadata->>'size'=image.byte_size::text and object.metadata->>'mimetype'=image.mime_type);
  if coalesce(jsonb_array_length(v_images),0)<>cardinality(v_draft.image_ids) then raise exception 'Die Originalfotos sind noch nicht vollständig gespeichert.' using errcode='22023'; end if;
  insert into public.marketplace_listing_jobs(workspace_id,connection_id,draft_id,permission_id,requested_by,request_id,request_hash,draft_revision,authorization_version,
    external_account_id,execution_mode,action,snapshot,scheduled_at,time_zone,late_policy,replaces_job_id,relist_delay_seconds,relist_publish_at,relist_entry_id)
    values(v_draft.workspace_id,v_draft.connection_id,v_draft.id,v_permission.id,(select auth.uid()),p_request_id,v_hash,v_draft.revision,v_permission.authorization_version,
      v_permission.external_account_id,v_permission.execution_mode,p_action,jsonb_build_object('content',v_draft.content-'aiPhoto','images',v_images,'aiPhoto',p_ai_photo,'bump',false,
      'connectionId',v_draft.connection_id,'inventoryItemId',v_draft.inventory_item_id,'photoOptions',v_draft.photo_options)
      || case when v_draft.relist_external_id is null then '{}'::jsonb else jsonb_build_object('relistExternalId',v_draft.relist_external_id) end,
      p_scheduled_at,p_time_zone,p_late_policy,p_replaces_job_id,p_relist_delay_seconds,case when v_draft.relist_deleted_at is not null then coalesce(p_scheduled_at,clock_timestamp()+make_interval(secs=>p_relist_delay_seconds)) else null end,v_relist_entry_id) returning * into v_job;
  if v_draft.relist_external_id is not null then perform public.marketplace_remember_listing_photo_source(v_job,v_draft.relist_external_id); end if;
  return public.marketplace_listing_job_document(v_job);
end;
$$;
