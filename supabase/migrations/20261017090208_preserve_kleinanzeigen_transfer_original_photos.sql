-- Zweck: Vollstaendige gespeicherte Originalfotos vor unvollstaendigen Vorschaubildern erhalten.
-- Betroffen: public.kleinanzeigen_saved_listing_source; keine Tabellen- oder Rechteaenderung.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

create or replace function public.kleinanzeigen_saved_listing_source (
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
    'description', coalesce(p_body->>'text', v_previous->>'description', ''),
    'priceCents', v_price,
    'currency', coalesce(nullif(p_body->>'currency', ''), v_previous->>'currency', 'unknown'),
    'photoReferences', v_photos,
    'attributeHints', v_hints
  );
  return public.kleinanzeigen_validate_transfer_source(v_source);
end;
$function$;