-- Bestätigter Profiltext bleibt nach einem Listenimport gespeichert.
-- Betroffen: marketplace_account_entries.body bei kind profile.
create or replace function public.marketplace_preserve_profile_bio()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if new.kind = 'profile' and old.kind = 'profile'
    and old.body->>'bioState' = 'loaded'
    and jsonb_typeof(old.body->'bio') = 'string'
    and coalesce(new.body->>'bioState', 'not_loaded') = 'not_loaded' then
    new.body := jsonb_set(new.body, '{bio}', old.body->'bio', true);
    new.body := jsonb_set(new.body, '{bioState}', to_jsonb('loaded'::text), true);
  end if;
  return new;
end;
$$;
revoke all on function public.marketplace_preserve_profile_bio() from public, anon, authenticated;
create trigger marketplace_preserve_profile_bio
before update of body on public.marketplace_account_entries for each row
execute function public.marketplace_preserve_profile_bio();

create or replace function public.marketplace_cache_profile_about(
  p_workspace_id uuid, p_connection_id uuid, p_account_id text, p_about text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_about is null or char_length(p_about) > 2000 then return false; end if;
  update public.marketplace_account_entries
  set body = jsonb_set(jsonb_set(body, '{bio}', to_jsonb(p_about), true),
    '{bioState}', to_jsonb('loaded'::text), true)
  where workspace_id = p_workspace_id and connection_id = p_connection_id
    and kind = 'profile' and external_id = p_account_id;
  return found;
end;
$$;
revoke all on function public.marketplace_cache_profile_about(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.marketplace_cache_profile_about(uuid, uuid, text, text)
to service_role;
