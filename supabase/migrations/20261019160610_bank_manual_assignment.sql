-- Zweck: Manuelle Bankzuordnungen in public.bank_transactions gegen doppelte Ziele absichern.
-- Erzeugt mit Supabase db diff: migrations -> isolierte lokale Datenbank.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.enforce_manual_bank_assignment()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare
  target_type text := new.match_json ->> 'targetType';
  target_id text := new.match_json ->> 'targetId';
  is_manual boolean := coalesce(new.match_json ->> 'confidenceLabel' = 'manual', false);
begin
  if new.status not in ('matched', 'booked') or new.match_json is null then
    return new;
  end if;

  -- Ein unveränderter vorhandener Treffer darf weiterhin gebucht werden.
  if tg_op = 'UPDATE' then
    if old.workspace_id = new.workspace_id
      and old.status in ('matched', 'booked')
      and old.match_json = new.match_json then
      return new;
    end if;
  end if;

  if target_type not in ('sale', 'store_order', 'purchase', 'operating_expense')
    or target_type is null or target_id is null or target_id = '' then
    if is_manual then
      raise exception using errcode = '23514', message = 'Bitte wähle einen gültigen Eintrag für die Bankzuordnung.';
    end if;
    return new;
  end if;

  -- Alle neuen Treffer desselben Ziels verwenden dieselbe Transaktionssperre.
  -- So konkurrieren manuelle Auswahl und automatische Vorschläge nicht blind.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.workspace_id::text || ':' || target_type || ':' || target_id, 0)
  );
  if exists (
    select 1 from public.bank_transactions as other
    where other.workspace_id = new.workspace_id
      and other.id <> new.id
      and other.status in ('matched', 'booked')
      and other.match_json ->> 'targetType' = target_type
      and other.match_json ->> 'targetId' = target_id
      and (is_manual or other.match_json ->> 'confidenceLabel' = 'manual')
  ) then
    raise exception using errcode = '23514', message = 'Dieser Eintrag ist bereits einer anderen Bankbewegung zugeordnet.';
  end if;
  return new;
end;
$function$;

comment on function public.enforce_manual_bank_assignment() is 'Schützt manuelle Bankzuordnungen auch zwischen Sitzungen; verändert keine Zielbeträge und erzeugt keine Buchung.';

revoke all on function public.enforce_manual_bank_assignment() from public;

create unique index bank_transactions_manual_target_unique on public.bank_transactions (workspace_id, (match_json ->> 'targetType'::text), (match_json ->> 'targetId'::text))
  where (status = any (array['matched'::text, 'booked'::text])) and (match_json ->> 'confidenceLabel'::text) = 'manual'::text and
    ((match_json ->> 'targetType'::text) = any (array['sale'::text, 'store_order'::text, 'purchase'::text, 'operating_expense'::text])) and (match_json ->> 'targetId'::text) is
    not null;

create trigger bank_transactions_manual_assignment_guard
  before insert or update of workspace_id, status, match_json on public.bank_transactions
  for each row
  execute function public.enforce_manual_bank_assignment();

-- Automatisch erzeugter Rechteabgleich nach Erstellung der Funktion.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

revoke all on function public.enforce_manual_bank_assignment() from authenticated;

revoke all on function public.enforce_manual_bank_assignment() from service_role;
