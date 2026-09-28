-- Einmal gelesene Inseratbeschreibungen und bestätigte Änderungen bleiben beim Listenimport erhalten.
-- Betroffen: marketplace_account_entries.body bei kind publication.
create or replace function public.marketplace_preserve_listing_text()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.kind = 'publication' and old.kind = 'publication'
    and old.body->>'textState' = 'loaded'
    and jsonb_typeof(old.body->'text') = 'string'
    and coalesce(new.body->>'textState', 'not_loaded') = 'not_loaded' then
    new.body := jsonb_set(new.body, '{text}', old.body->'text', true);
    new.body := jsonb_set(new.body, '{textState}', to_jsonb('loaded'::text), true);
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_preserve_listing_text() from public, anon, authenticated;
create trigger marketplace_preserve_listing_text
before update of body on public.marketplace_account_entries for each row
execute function public.marketplace_preserve_listing_text();

create or replace function public.marketplace_cache_listing_text(
  p_workspace_id uuid, p_connection_id uuid, p_entry_id uuid,
  p_external_id text, p_text text, p_confirmed boolean default false,
  p_title text default null, p_price numeric default null
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_text is null or char_length(p_text) > 2000 or
    (p_confirmed and (p_title is null or char_length(p_title) > 120 or p_price is null or p_price <= 0)) then
    return false;
  end if;
  update public.marketplace_account_entries
  set body = jsonb_set(
    jsonb_set(
      case when p_confirmed then
        jsonb_set(jsonb_set(body, '{title}', to_jsonb(p_title), true),
          '{price}', to_jsonb(p_price), true)
      else body end,
      '{text}', to_jsonb(p_text), true),
    '{textState}', to_jsonb('loaded'::text), true)
  where workspace_id = p_workspace_id and connection_id = p_connection_id
    and id = p_entry_id and kind = 'publication' and external_id = p_external_id
    and (p_confirmed or coalesce(body->>'textState', 'not_loaded') <> 'loaded');
  return found;
end;
$$;
revoke all on function public.marketplace_cache_listing_text(uuid, uuid, uuid, text, text, boolean, text, numeric)
from public, anon, authenticated;
grant execute on function public.marketplace_cache_listing_text(uuid, uuid, uuid, text, text, boolean, text, numeric)
to service_role;
