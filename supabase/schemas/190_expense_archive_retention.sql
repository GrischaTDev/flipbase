-- Ergänzt die Archivierung erst nach Anlage der Einkaufs- und Ausgabentabellen.
-- Betroffen: Belegmetadaten sowie Ausgaben-Kategorien, -Regeln und -Buchungen.

create trigger "00_protect_archived_workspace"
before insert or update or delete on public.purchase_documents
for each row execute function public.protect_archived_workspace_data();

create trigger "00_protect_archived_workspace"
before insert or update or delete on public.expense_categories
for each row execute function public.protect_archived_workspace_data();

create trigger "00_protect_archived_workspace"
before insert or update or delete on public.expense_recurring_rules
for each row execute function public.protect_archived_workspace_data();

create trigger "00_protect_archived_workspace"
before insert or update or delete on public.expenses
for each row execute function public.protect_archived_workspace_data();

create trigger "00_protect_archived_workspace"
before insert or update or delete on public.expense_documents
for each row execute function public.protect_archived_workspace_data();
