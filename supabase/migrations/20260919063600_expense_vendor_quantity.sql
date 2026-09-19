alter table public.expense_recurring_rules
  add column vendor_name text,
  add column quantity integer not null default 1;

alter table public.expense_recurring_rules
  add constraint expense_recurring_rules_vendor_name_check
    check (
      vendor_name is null
      or pg_catalog.char_length(pg_catalog.btrim(vendor_name)) between 1 and 160
    ),
  add constraint expense_recurring_rules_quantity_check
    check (quantity > 0);

alter table public.expenses
  add column vendor_name text,
  add column quantity integer not null default 1;

alter table public.expenses
  add constraint expenses_vendor_name_check
    check (
      vendor_name is null
      or pg_catalog.char_length(pg_catalog.btrim(vendor_name)) between 1 and 160
    ),
  add constraint expenses_quantity_check
    check (quantity > 0);
