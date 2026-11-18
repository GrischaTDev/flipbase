-- Erweiterte nichtdestruktive Bildbearbeitungsparameter (Presets, globale und fotoindividuelle Anpassungen) für marketplace_listing_drafts.photo_options validieren und bei Bildänderungen bereinigen.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

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
    photo_options=case
      when photo_options ? 'photoAdjustments' then jsonb_set(jsonb_set(photo_options,'{crops}',(photo_options->'crops')-coalesce(p_replace_image_id,'')),'{photoAdjustments}',(photo_options->'photoAdjustments')-coalesce(p_replace_image_id,''))
      else jsonb_set(photo_options,'{crops}',(photo_options->'crops')-coalesce(p_replace_image_id,''))
    end,
    revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;

create or replace function public.marketplace_listing_photo_options_valid (
  p_options   jsonb,
  p_image_ids bigint[]
)
  returns boolean
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare v_key text; v_crop jsonb; v_adj jsonb;
begin
  if p_image_ids is null or p_options is null or octet_length(p_options::text)>20000 or jsonb_typeof(p_options)<>'object' or p_options-array['resize','crops','filter','border','adjustments','photoAdjustments']<>'{}'::jsonb
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
  return true;
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
    photo_options=case
      when photo_options ? 'photoAdjustments' then jsonb_set(jsonb_set(photo_options,'{crops}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(photo_options->'crops') where key=any(p_image_ids)),'{}'::jsonb)),'{photoAdjustments}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(photo_options->'photoAdjustments') where key=any(p_image_ids)),'{}'::jsonb))
      else jsonb_set(photo_options,'{crops}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(photo_options->'crops') where key=any(p_image_ids)),'{}'::jsonb))
    end,
    revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$function$;
