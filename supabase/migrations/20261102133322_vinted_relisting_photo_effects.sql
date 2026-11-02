-- Optionale Filter und Rahmen für marketplace_listing_drafts.photo_options und eingefrorene Aufträge validieren.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

set check_function_bodies = false;

create or replace function public.marketplace_listing_photo_options_valid (
  p_options   jsonb,
  p_image_ids bigint[]
)
  returns boolean
  language plpgsql
  immutable
  set search_path to ''
  as $function$
declare v_key text; v_crop jsonb;
begin
  if p_image_ids is null or p_options is null or octet_length(p_options::text)>20000 or jsonb_typeof(p_options)<>'object' or p_options-array['resize','crops','filter','border']<>'{}'::jsonb
    or not (p_options ?& array['resize','crops']) or (p_options->'resize'<>'null'::jsonb and p_options->'resize' not in ('1200'::jsonb,'1600'::jsonb,'2400'::jsonb))
    or (p_options ? 'filter' and p_options->'filter' not in ('"none"'::jsonb,'"lighter"'::jsonb,'"darker"'::jsonb,'"soft"'::jsonb))
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
  return true;
end;
$function$;