-- Betriebsausgaben: Kategorien, Wiederholungsregeln, konkrete Ausgaben und private Belege.
-- Wareneinkäufe bleiben im bestehenden Purchase-Domainmodell.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null
    check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create unique index if not exists expense_categories_active_name_uidx
  on public.expense_categories (workspace_id, lower(btrim(name)))
  where is_archived = false;

create table if not exists public.expense_recurring_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  category_id uuid not null,
  title text not null
    check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 160),
  vendor_name text
    constraint expense_recurring_rules_vendor_name_check
    check (
      vendor_name is null
      or pg_catalog.char_length(pg_catalog.btrim(vendor_name)) between 1 and 160
    ),
  quantity integer not null default 1
    constraint expense_recurring_rules_quantity_check check (quantity > 0),
  gross_amount numeric(12,2) not null
    check (
      gross_amount <> 'NaN'::numeric
      and gross_amount > 0
      and scale(gross_amount) <= 2
    ),
  vat_rate numeric(5,2)
    check (vat_rate is null or vat_rate in (0, 7, 19)),
  frequency text not null
    check (frequency in ('monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, category_id)
    references public.expense_categories(workspace_id, id) on delete restrict,
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  category_id uuid not null,
  recurring_rule_id uuid,
  occurrence_date date,
  title text not null
    check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 160),
  vendor_name text
    constraint expenses_vendor_name_check
    check (
      vendor_name is null
      or pg_catalog.char_length(pg_catalog.btrim(vendor_name)) between 1 and 160
    ),
  quantity integer not null default 1
    constraint expenses_quantity_check check (quantity > 0),
  gross_amount numeric(12,2) not null
    check (
      gross_amount <> 'NaN'::numeric
      and gross_amount > 0
      and scale(gross_amount) <= 2
    ),
  vat_rate numeric(5,2)
    check (vat_rate is null or vat_rate in (0, 7, 19)),
  expense_date date not null,
  due_date date,
  status text not null check (status in ('open', 'paid')),
  payment_date date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, category_id)
    references public.expense_categories(workspace_id, id) on delete restrict,
  foreign key (workspace_id, recurring_rule_id)
    references public.expense_recurring_rules(workspace_id, id) on delete restrict,
  check (
    (status = 'paid' and payment_date is not null)
    or (status = 'open' and payment_date is null)
  ),
  check (
    (recurring_rule_id is null and occurrence_date is null)
    or (recurring_rule_id is not null and occurrence_date is not null)
  )
);

create unique index if not exists expenses_recurring_occurrence_uidx
  on public.expenses (workspace_id, recurring_rule_id, occurrence_date)
  where recurring_rule_id is not null and occurrence_date is not null;

create index if not exists expenses_workspace_payment_idx
  on public.expenses (workspace_id, payment_date)
  where deleted_at is null and status = 'paid';

create index if not exists expenses_workspace_date_idx
  on public.expenses (workspace_id, expense_date desc, id)
  where deleted_at is null;

create index if not exists expense_recurring_rules_workspace_idx
  on public.expense_recurring_rules (workspace_id, is_active, start_date);

-- ---------------------------------------------------------------------------
-- Standardkategorien
-- ---------------------------------------------------------------------------

create or replace function public.seed_default_expense_categories(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.expense_categories (
    workspace_id, name, sort_order, is_default, is_archived, created_by
  )
  select
    p_workspace_id,
    seed.name,
    seed.sort_order,
    true,
    false,
    null
  from (
    values
      ('Versandmaterial', 10),
      ('Technik & Geräte', 20),
      ('Bürobedarf', 30),
      ('Software & Abos', 40),
      ('Hosting & Server', 50),
      ('Miete & Räume', 60),
      ('Werbung', 70),
      ('Dienstleistungen', 80),
      ('Gebühren', 90),
      ('Fahrzeug & Fahrtkosten', 100),
      ('Versicherungen', 110),
      ('Steuer & Beratung', 120),
      ('Sonstiges', 130)
  ) as seed(name, sort_order)
  where not exists (
    select 1
    from public.expense_categories as category
    where category.workspace_id = p_workspace_id
      and lower(btrim(category.name)) = lower(btrim(seed.name))
      and category.is_archived = false
  );
end;
$$;

alter function public.seed_default_expense_categories(uuid) owner to postgres;
revoke all on function public.seed_default_expense_categories(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.seed_expense_categories_for_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_expense_categories(new.id);
  return new;
end;
$$;

alter function public.seed_expense_categories_for_workspace() owner to postgres;
revoke all on function public.seed_expense_categories_for_workspace()
  from public, anon, authenticated, service_role;

drop trigger if exists seed_expense_categories_after_workspace_insert on public.workspaces;
create trigger seed_expense_categories_after_workspace_insert
after insert on public.workspaces
for each row execute function public.seed_expense_categories_for_workspace();

do $$
declare
  workspace_record record;
begin
  for workspace_record in select id from public.workspaces loop
    perform public.seed_default_expense_categories(workspace_record.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_expense_record_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

alter function public.touch_expense_record_updated_at() owner to postgres;
revoke all on function public.touch_expense_record_updated_at()
  from public, anon, authenticated, service_role;

drop trigger if exists expense_categories_touch_updated_at on public.expense_categories;
create trigger expense_categories_touch_updated_at
before update on public.expense_categories
for each row execute function public.touch_expense_record_updated_at();

drop trigger if exists expense_recurring_rules_touch_updated_at on public.expense_recurring_rules;
create trigger expense_recurring_rules_touch_updated_at
before update on public.expense_recurring_rules
for each row execute function public.touch_expense_record_updated_at();

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
before update on public.expenses
for each row execute function public.touch_expense_record_updated_at();

-- ---------------------------------------------------------------------------
-- Private Ausgabenbelege
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-documents',
  'expense-documents',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml']
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml'];

create or replace function public.is_expense_document_path(
  p_path text,
  p_workspace_id uuid,
  p_expense_id uuid
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_path ~ (
    '^expense-documents/' || p_workspace_id::text || '/' || p_expense_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|xml)$'
  );
$$;

alter function public.is_expense_document_path(text, uuid, uuid) owner to postgres;
revoke all on function public.is_expense_document_path(text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_expense_document_path(text, uuid, uuid)
  to authenticated, service_role;

create table if not exists public.expense_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  expense_id uuid not null,
  document_type text not null
    check (document_type in ('invoice', 'receipt', 'payment_proof', 'other')),
  original_file_name text not null
    check (pg_catalog.char_length(original_file_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml')),
  file_size integer not null check (file_size > 0 and file_size <= 20971520),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  foreign key (workspace_id, expense_id)
    references public.expenses(workspace_id, id) on delete restrict,
  unique (workspace_id, id),
  constraint expense_documents_storage_path_check
    check (public.is_expense_document_path(storage_path, workspace_id, expense_id))
);

create index if not exists expense_documents_expense_idx
  on public.expense_documents (workspace_id, expense_id, created_at, id);

-- ---------------------------------------------------------------------------
-- RLS und API-Grants
-- ---------------------------------------------------------------------------

alter table public.expense_categories enable row level security;
alter table public.expense_recurring_rules enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_documents enable row level security;

revoke all on table public.expense_categories
  from public, anon, authenticated, service_role;
revoke all on table public.expense_recurring_rules
  from public, anon, authenticated, service_role;
revoke all on table public.expenses
  from public, anon, authenticated, service_role;
revoke all on table public.expense_documents
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.expense_categories to authenticated;
grant select, insert, update on table public.expense_recurring_rules to authenticated;
grant select, insert, update on table public.expenses to authenticated;
grant select, insert, delete on table public.expense_documents to authenticated;

create policy "Ausgabenkategorien lesen"
on public.expense_categories for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy "Ausgabenkategorien anlegen"
on public.expense_categories for insert to authenticated
with check (
  (select public.is_workspace_member(workspace_id))
  and created_by = (select auth.uid())
);

create policy "Ausgabenkategorien aendern"
on public.expense_categories for update to authenticated
using ((select public.is_workspace_member(workspace_id)))
with check ((select public.is_workspace_member(workspace_id)));

create policy "Wiederholungsregeln lesen"
on public.expense_recurring_rules for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy "Wiederholungsregeln anlegen"
on public.expense_recurring_rules for insert to authenticated
with check (
  (select public.is_workspace_member(workspace_id))
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.expense_categories as category
    where category.workspace_id = expense_recurring_rules.workspace_id
      and category.id = expense_recurring_rules.category_id
  )
);

create policy "Wiederholungsregeln aendern"
on public.expense_recurring_rules for update to authenticated
using ((select public.is_workspace_member(workspace_id)))
with check (
  (select public.is_workspace_member(workspace_id))
  and exists (
    select 1
    from public.expense_categories as category
    where category.workspace_id = expense_recurring_rules.workspace_id
      and category.id = expense_recurring_rules.category_id
  )
);

create policy "Ausgaben lesen"
on public.expenses for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy "Ausgaben anlegen"
on public.expenses for insert to authenticated
with check (
  (select public.is_workspace_member(workspace_id))
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.expense_categories as category
    where category.workspace_id = expenses.workspace_id
      and category.id = expenses.category_id
  )
  and (
    recurring_rule_id is null
    or exists (
      select 1
      from public.expense_recurring_rules as rule
      where rule.workspace_id = expenses.workspace_id
        and rule.id = expenses.recurring_rule_id
    )
  )
);

create policy "Ausgaben aendern"
on public.expenses for update to authenticated
using ((select public.is_workspace_member(workspace_id)))
with check (
  (select public.is_workspace_member(workspace_id))
  and exists (
    select 1
    from public.expense_categories as category
    where category.workspace_id = expenses.workspace_id
      and category.id = expenses.category_id
  )
  and (
    recurring_rule_id is null
    or exists (
      select 1
      from public.expense_recurring_rules as rule
      where rule.workspace_id = expenses.workspace_id
        and rule.id = expenses.recurring_rule_id
    )
  )
);

create policy "Ausgabenbelege lesen"
on public.expense_documents for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy "Ausgabenbelege anlegen"
on public.expense_documents for insert to authenticated
with check (
  (select public.is_workspace_member(workspace_id))
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.expenses as expense
    where expense.workspace_id = expense_documents.workspace_id
      and expense.id = expense_documents.expense_id
  )
);

create policy "Ausgabenbelege entfernen"
on public.expense_documents for delete to authenticated
using (
  (select public.is_workspace_member(workspace_id))
  and exists (
    select 1
    from public.expenses as expense
    where expense.workspace_id = expense_documents.workspace_id
      and expense.id = expense_documents.expense_id
  )
);

-- Storage-Policies getrennt nach Operation; der Bucket bleibt privat.
drop policy if exists "Ausgabenbelege lesen" on storage.objects;
drop policy if exists "Ausgabenbelege hochladen" on storage.objects;
drop policy if exists "Ausgabenbelege entfernen" on storage.objects;

create policy "Ausgabenbelege lesen"
on storage.objects for select to authenticated
using (
  bucket_id = 'expense-documents'
  and exists (
    select 1
    from public.expenses as expense
    where expense.workspace_id::text = (storage.foldername(name))[2]
      and expense.id::text = (storage.foldername(name))[3]
      and public.is_expense_document_path(name, expense.workspace_id, expense.id)
      and (select public.is_workspace_member(expense.workspace_id))
  )
);

create policy "Ausgabenbelege hochladen"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'expense-documents'
  and exists (
    select 1
    from public.expenses as expense
    where expense.workspace_id::text = (storage.foldername(name))[2]
      and expense.id::text = (storage.foldername(name))[3]
      and public.is_expense_document_path(name, expense.workspace_id, expense.id)
      and (select public.is_workspace_member(expense.workspace_id))
  )
);

create policy "Ausgabenbelege entfernen"
on storage.objects for delete to authenticated
using (
  bucket_id = 'expense-documents'
  and exists (
    select 1
    from public.expenses as expense
    where expense.workspace_id::text = (storage.foldername(name))[2]
      and expense.id::text = (storage.foldername(name))[3]
      and public.is_expense_document_path(name, expense.workspace_id, expense.id)
      and (select public.is_workspace_member(expense.workspace_id))
  )
);
