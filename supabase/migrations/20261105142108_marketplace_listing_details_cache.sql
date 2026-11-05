-- Vollständige Vinted-Artikeldetails in marketplace_account_entries.body speichern und bei Teilimporten erhalten.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_cache_listing_content (
  p_workspace_id  uuid,
  p_connection_id uuid,
  p_entry_id      uuid,
  p_external_id   text,
  p_content       jsonb
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  as $function$
begin
  if p_content is null or not public.marketplace_listing_content_valid(p_content) then
    return false;
  end if;
  if coalesce(length(btrim(p_content->>'title')), 0) = 0
    or coalesce(length(btrim(p_content->>'description')), 0) = 0
    or coalesce((p_content->>'priceCents')::numeric, 0) <= 0
    or p_content->>'categoryId' is null then
    return false;
  end if;
  update public.marketplace_account_entries e
  set body = e.body || jsonb_build_object(
    'listingContent', p_content,
    'listingDetailsReadAt', clock_timestamp(),
    'listingDetailsSourceUpdatedAt', null,
    'title', p_content->>'title',
    'text', p_content->>'description', 'textState', 'loaded',
    'price', (p_content->>'priceCents')::numeric / 100,
    'brand', nullif(p_content->>'brandLabel', ''),
    'size', nullif(p_content->>'sizeLabel', ''),
    'status', nullif(p_content->>'conditionLabel', '')
  ), observed_at = clock_timestamp()
  where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id
    and e.id = p_entry_id and e.kind = 'publication' and e.external_id = p_external_id
    and exists(select 1 from public.marketplace_connections c
      where c.workspace_id = e.workspace_id and c.id = e.connection_id and c.marketplace = 'vinted');
  return found;
end;
$function$;

revoke all on function public.marketplace_cache_listing_content(uuid, uuid, uuid, text, jsonb) from public;

grant all on function public.marketplace_cache_listing_content(uuid, uuid, uuid, text, jsonb) to service_role;

create or replace function public.marketplace_preserve_listing_text()
  returns TRIGGER
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
  -- Unvollständige Listen- oder Gesprächsimporte dürfen bestätigte Artikeldetails
  -- derselben Kontobindung nicht entfernen. Neue vollständige Werte haben Vorrang.
  if new.kind = 'publication' and old.kind = 'publication'
    and row(new.workspace_id, new.connection_id, new.external_id)
      is not distinct from row(old.workspace_id, old.connection_id, old.external_id)
    and (
      not (new.body ? 'listingContent')
      or case when pg_input_is_valid(old.body->>'listingDetailsReadAt', 'timestamp with time zone') then
        case when pg_input_is_valid(new.body->>'listingDetailsReadAt', 'timestamp with time zone') then
          (new.body->>'listingDetailsReadAt')::timestamptz < (old.body->>'listingDetailsReadAt')::timestamptz
        else true end
      else false end
    )
    and jsonb_typeof(old.body->'listingContent') = 'object' then
    new.body := new.body || (select jsonb_object_agg(key, value) from jsonb_each(old.body)
      where key in ('listingContent','listingDetailsReadAt','listingDetailsSourceUpdatedAt','listingDetailsAttemptedAt'));
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
revoke all on function public.marketplace_cache_listing_content(uuid, uuid, uuid, text, jsonb) from authenticated;
