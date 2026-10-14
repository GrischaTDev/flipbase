-- Stabile Vinted-Systemmeldungen: erneut belegte Hash-Dubletten in marketplace_account_entries abgleichen.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_remove_duplicate_system_messages()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
begin
  if new.kind <> 'message' or new.external_id !~ '^event:[a-f0-9]{64}$'
    or coalesce(new.body->>'messageType','') not in ('status_message','action_message','payment_message')
    or coalesce(new.body->>'text',new.body->>'title','') = ''
    or not exists(select 1 from public.marketplace_connections c where c.workspace_id=new.workspace_id
      and c.id=new.connection_id and c.marketplace='vinted') then return new; end if;

  -- Die IDs betreffen ausschließlich rekonstruierte Systemmeldungen, keine echten
  -- Chat-/Angebotskennungen oder Kaufbelege. Der neuere bestätigte Stand bleibt erhalten.
  delete from public.marketplace_account_entries previous
    where previous.workspace_id=new.workspace_id and previous.connection_id=new.connection_id
      and previous.kind='message' and previous.parent_id=new.parent_id and previous.id<>new.id
      and previous.external_id ~ '^event:[a-f0-9]{64}$'
      and previous.sort_at=new.sort_at and previous.observed_at<=new.observed_at
      and previous.body->>'direction' is not distinct from new.body->>'direction'
      and previous.body->>'priceLabel' is not distinct from new.body->>'priceLabel'
      and coalesce(previous.body->'imageUrls','[]'::jsonb)=coalesce(new.body->'imageUrls','[]'::jsonb)
      and (
        (previous.body->>'messageType'=new.body->>'messageType'
          and previous.body->>'title' is not distinct from new.body->>'title'
          and previous.body->>'text' is not distinct from new.body->>'text'
          -- Alte Cloud-Kopien enthielten diese Metadaten noch nicht.
          and (not (previous.body ? 'eventType') or previous.body->>'eventType' is not distinct from new.body->>'eventType')
          and (not (previous.body ? 'eventGroup') or previous.body->>'eventGroup' is not distinct from new.body->>'eventGroup'))
        or (new.body->>'messageType' in ('status_message','action_message')
          and previous.body->>'messageType' in ('status_message','action_message')
          and new.body->>'title' in ('Geliefert','Sendung zugestellt')
          and previous.body->>'title' in ('Geliefert','Sendung zugestellt')
          and new.body->>'text'=new.body->>'title'
          and previous.body->>'text'=previous.body->>'title')
      );
  return new;
end;
$function$;

revoke all on function public.marketplace_remove_duplicate_system_messages() from public;

grant all on function public.marketplace_remove_duplicate_system_messages() to service_role;

create trigger marketplace_remove_duplicate_system_messages
  after insert or update on public.marketplace_account_entries
  for each row
  when (new.kind = 'message'::text)
  execute function public.marketplace_remove_duplicate_system_messages();

-- Explizite Funktionsrechte aus dem deklarativen Schema; der Diff ließ Standardrechte stehen.
revoke all on function public.marketplace_remove_duplicate_system_messages() from public,anon,authenticated;
grant execute on function public.marketplace_remove_duplicate_system_messages() to service_role;
