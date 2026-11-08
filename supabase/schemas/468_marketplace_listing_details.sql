-- Bestätigte vollständige Inseratangaben getrennt von unveränderlichen Originalfotos speichern.
-- Betroffen: marketplace_account_entries.body für Vinted-Inserate.
create or replace function public.marketplace_cache_listing_content(
  p_workspace_id uuid, p_connection_id uuid, p_entry_id uuid,
  p_external_id text, p_content jsonb
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_content jsonb := p_content;
  v_previous jsonb;
  v_keep_size boolean := false;
begin
  if p_content is null or not public.marketplace_listing_content_valid(p_content) then
    return false;
  end if;
  -- Liefert Vinteds Formular kein Größenfeld (etwa bei älteren kombinierten Größen), kommt der
  -- Stand ohne Größe zurück. Bei gleicher Kategorie bleibt dann die bisher gespeicherte Größe.
  select e.body->'listingContent' into v_previous
  from public.marketplace_account_entries e
  where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id
    and e.id = p_entry_id and e.kind = 'publication' and e.external_id = p_external_id;
  if jsonb_typeof(p_content->'sizeId') is distinct from 'number'
    and coalesce(p_content->>'sizeLabel', '') = ''
    and jsonb_typeof(v_previous) = 'object'
    and v_previous->>'categoryId' = p_content->>'categoryId' then
    v_keep_size := true;
    v_content := p_content || jsonb_build_object(
      'sizeId', coalesce(v_previous->'sizeId', 'null'::jsonb),
      'sizeLabel', coalesce(v_previous->>'sizeLabel', ''));
    if not public.marketplace_listing_content_valid(v_content) then
      v_content := p_content;
    end if;
  end if;
  if coalesce(length(btrim(p_content->>'title')), 0) = 0
    or coalesce(length(btrim(p_content->>'description')), 0) = 0
    or coalesce((p_content->>'priceCents')::numeric, 0) <= 0
    or p_content->>'categoryId' is null then
    return false;
  end if;
  update public.marketplace_account_entries e
  set body = e.body || jsonb_build_object(
    'listingContent', v_content,
    'listingDetailsReadAt', clock_timestamp(),
    'listingDetailsSourceUpdatedAt', null,
    'title', p_content->>'title',
    'text', p_content->>'description', 'textState', 'loaded',
    'price', (p_content->>'priceCents')::numeric / 100,
    'brand', nullif(p_content->>'brandLabel', ''),
    'size', coalesce(nullif(v_content->>'sizeLabel', ''),
      case when v_keep_size then e.body->>'size' end),
    'status', nullif(p_content->>'conditionLabel', '')
  ), observed_at = clock_timestamp()
  where e.workspace_id = p_workspace_id and e.connection_id = p_connection_id
    and e.id = p_entry_id and e.kind = 'publication' and e.external_id = p_external_id
    and exists(select 1 from public.marketplace_connections c
      where c.workspace_id = e.workspace_id and c.id = e.connection_id and c.marketplace = 'vinted');
  return found;
end;
$$;
revoke all on function public.marketplace_cache_listing_content(uuid, uuid, uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.marketplace_cache_listing_content(uuid, uuid, uuid, text, jsonb)
to service_role;
