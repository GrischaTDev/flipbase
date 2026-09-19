-- Zweck: PostgREST-Upserts für Wiederholungsausgaben gegen den vorhandenen
--        Eindeutigkeitsindex ausrichten.
-- Betroffen: public.expenses, expenses_recurring_occurrence_uidx.

drop index public.expenses_recurring_occurrence_uidx;

create unique index expenses_recurring_occurrence_uidx
  on public.expenses (workspace_id, recurring_rule_id, occurrence_date);
