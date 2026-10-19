-- Verhindert konkurrierende manuelle Zuordnungen desselben Eintrags.
-- Bestehende automatische Sammel-/Gebührentreffer bleiben möglich.
create unique index if not exists bank_transactions_manual_target_unique
on public.bank_transactions (
  workspace_id,
  (match_json ->> 'targetType'),
  (match_json ->> 'targetId')
)
where status in ('matched', 'booked')
  and match_json ->> 'confidenceLabel' = 'manual'
  and match_json ->> 'targetType' in ('sale', 'store_order', 'purchase', 'operating_expense')
  and match_json ->> 'targetId' is not null;

create or replace function public.enforce_manual_bank_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

comment on function public.enforce_manual_bank_assignment() is
  'Schützt manuelle Bankzuordnungen auch zwischen Sitzungen; verändert keine Zielbeträge und erzeugt keine Buchung.';

revoke all on function public.enforce_manual_bank_assignment() from public, anon, authenticated, service_role;

create trigger bank_transactions_manual_assignment_guard
before insert or update of workspace_id, status, match_json on public.bank_transactions
for each row execute function public.enforce_manual_bank_assignment();
