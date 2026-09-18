-- migration: 20260918131500_operating_expenses.sql
-- purpose: workspace-scoped operating expenses, recurring due items and private receipts
-- Allgemeine Betriebsausgaben, bewusst getrennt von Wareneinkäufen.
-- Betroffen: operating_expense_categories, operating_expenses,
-- recurring_operating_expenses, operating_expense_documents und privater Storage.

create table if not exists public.operating_expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80),
  default_key text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, id),
  unique (workspace_id, default_key)
);

create unique index if not exists operating_expense_categories_name_idx
  on public.operating_expense_categories (workspace_id, lower(name));

create table if not exists public.recurring_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  category_id uuid not null,
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 160),
  gross_amount numeric(12, 2) not null check (gross_amount > 0),
  vat_rate smallint check (vat_rate is null or vat_rate in (0, 7, 19)),
  interval text not null check (interval in ('monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date,
  next_due_date date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, id),
  foreign key (workspace_id, category_id)
    references public.operating_expense_categories(workspace_id, id) on delete restrict,
  check (end_date is null or end_date >= start_date),
  check (next_due_date >= start_date)
);

create table if not exists public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  category_id uuid not null,
  recurring_rule_id uuid,
  recurrence_date date,
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 160),
  gross_amount numeric(12, 2) not null check (gross_amount > 0),
  vat_rate smallint check (vat_rate is null or vat_rate in (0, 7, 19)),
  expense_date date not null,
  status text not null check (status in ('open', 'paid')),
  due_date date,
  paid_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, id),
  unique (recurring_rule_id, recurrence_date),
  foreign key (workspace_id, category_id)
    references public.operating_expense_categories(workspace_id, id) on delete restrict,
  foreign key (workspace_id, recurring_rule_id)
    references public.recurring_operating_expenses(workspace_id, id) on delete restrict,
  check (
    (recurring_rule_id is null and recurrence_date is null)
    or (recurring_rule_id is not null and recurrence_date is not null)
  ),
  check (
    (status = 'paid' and paid_at is not null)
    or (status = 'open' and paid_at is null)
  )
);

create table if not exists public.operating_expense_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  expense_id uuid not null,
  document_type text not null check (document_type in ('invoice', 'payment_proof', 'other')),
  original_file_name text not null
    check (pg_catalog.char_length(original_file_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml')),
  file_size integer not null check (file_size > 0 and file_size <= 20971520),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, id),
  foreign key (workspace_id, expense_id)
    references public.operating_expenses(workspace_id, id) on delete restrict
);

create index if not exists operating_expenses_workspace_date_idx
  on public.operating_expenses (workspace_id, expense_date desc, id);

create index if not exists operating_expenses_paid_idx
  on public.operating_expenses (workspace_id, paid_at desc, id)
  where status = 'paid';

create index if not exists recurring_operating_expenses_due_idx
  on public.recurring_operating_expenses (workspace_id, next_due_date, id)
  where archived_at is null;

create index if not exists operating_expense_documents_expense_idx
  on public.operating_expense_documents (workspace_id, expense_id, created_at, id);

-- Standardkategorien sind echte Workspace-Zeilen: sie dürfen später umbenannt
-- oder archiviert werden; default_key dient nur als stabile Herkunft.
create or replace function public.seed_operating_expense_categories_for_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.operating_expense_categories (workspace_id, name, default_key)
  values
    (new.id, 'Versandmaterial', 'shipping_material'),
    (new.id, 'Technik & Geräte', 'equipment'),
    (new.id, 'Software & Abos', 'software_subscriptions'),
    (new.id, 'Hosting & Server', 'hosting_server'),
    (new.id, 'Miete & Räume', 'rent_premises'),
    (new.id, 'Werbung', 'advertising'),
    (new.id, 'Dienstleistungen', 'services'),
    (new.id, 'Gebühren', 'fees'),
    (new.id, 'Bürobedarf', 'office_supplies'),
    (new.id, 'Fahrzeug & Fahrtkosten', 'vehicle_travel'),
    (new.id, 'Versicherungen', 'insurance'),
    (new.id, 'Steuer & Beratung', 'tax_advice'),
    (new.id, 'Sonstiges', 'other')
  on conflict (workspace_id, default_key) do nothing;
  return new;
end;
$$;

alter function public.seed_operating_expense_categories_for_workspace() owner to postgres;
revoke all on function public.seed_operating_expense_categories_for_workspace()
  from public, anon, authenticated, service_role;

drop trigger if exists seed_operating_expense_categories on public.workspaces;
create trigger seed_operating_expense_categories
  after insert on public.workspaces
  for each row execute function public.seed_operating_expense_categories_for_workspace();

insert into public.operating_expense_categories (workspace_id, name, default_key)
select workspace.id, category.name, category.default_key
from public.workspaces as workspace
cross join (
  values
    ('Versandmaterial', 'shipping_material'),
    ('Technik & Geräte', 'equipment'),
    ('Software & Abos', 'software_subscriptions'),
    ('Hosting & Server', 'hosting_server'),
    ('Miete & Räume', 'rent_premises'),
    ('Werbung', 'advertising'),
    ('Dienstleistungen', 'services'),
    ('Gebühren', 'fees'),
    ('Bürobedarf', 'office_supplies'),
    ('Fahrzeug & Fahrtkosten', 'vehicle_travel'),
    ('Versicherungen', 'insurance'),
    ('Steuer & Beratung', 'tax_advice'),
    ('Sonstiges', 'other')
) as category(name, default_key)
on conflict (workspace_id, default_key) do nothing;

-- Hält den ursprünglichen Kalendertag stabil. Beginnt eine Regel am Monatsende,
-- bleibt sie auch nach Februar am Monatsende.
create or replace function public.next_operating_expense_due_date(
  p_current date,
  p_start date,
  p_interval text
)
returns date
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_months integer;
  v_target_first date;
  v_target_last date;
  v_start_last date;
  v_day integer;
begin
  v_months := case p_interval
    when 'monthly' then 1
    when 'quarterly' then 3
    when 'yearly' then 12
    else null
  end;
  if v_months is null then
    raise exception using errcode = '22023', message = 'Ungültiges Wiederholungsintervall.';
  end if;

  v_target_first := pg_catalog.date_trunc(
    'month',
    p_current::timestamp + pg_catalog.make_interval(months => v_months)
  )::date;
  v_target_last := (v_target_first + interval '1 month - 1 day')::date;
  v_start_last := (
    pg_catalog.date_trunc('month', p_start::timestamp)::date
    + interval '1 month - 1 day'
  )::date;

  if p_start = v_start_last then
    return v_target_last;
  end if;

  v_day := least(
    pg_catalog.extract(day from p_start)::integer,
    pg_catalog.extract(day from v_target_last)::integer
  );
  return pg_catalog.make_date(
    pg_catalog.extract(year from v_target_first)::integer,
    pg_catalog.extract(month from v_target_first)::integer,
    v_day
  );
end;
$$;

alter function public.next_operating_expense_due_date(date, date, text) owner to postgres;
revoke all on function public.next_operating_expense_due_date(date, date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.next_operating_expense_due_date(date, date, text)
  to authenticated, service_role;

create or replace function public.materialize_due_operating_expenses(
  p_workspace_id uuid,
  p_through_date date
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rule public.recurring_operating_expenses%rowtype;
  v_due date;
  v_next date;
  v_created integer := 0;
begin
  if p_through_date is null then
    raise exception using errcode = '22023', message = 'Ein Stichtag ist erforderlich.';
  end if;
  if not (select public.is_workspace_member(p_workspace_id)) then
    raise exception using errcode = '42501', message = 'Kein Zugriff auf diesen Workspace.';
  end if;

  for v_rule in
    select *
    from public.recurring_operating_expenses
    where workspace_id = p_workspace_id
      and archived_at is null
      and next_due_date <= p_through_date
      and (end_date is null or next_due_date <= end_date)
    order by next_due_date, id
    for update
  loop
    v_due := v_rule.next_due_date;

    while v_due <= p_through_date
      and (v_rule.end_date is null or v_due <= v_rule.end_date)
    loop
      insert into public.operating_expenses (
        workspace_id,
        category_id,
        recurring_rule_id,
        recurrence_date,
        title,
        gross_amount,
        vat_rate,
        expense_date,
        status,
        due_date,
        paid_at,
        created_by
      ) values (
        v_rule.workspace_id,
        v_rule.category_id,
        v_rule.id,
        v_due,
        v_rule.title,
        v_rule.gross_amount,
        v_rule.vat_rate,
        v_due,
        'open',
        v_due,
        null,
        (select auth.uid())
      )
      on conflict (recurring_rule_id, recurrence_date) do nothing;

      if found then
        v_created := v_created + 1;
      end if;

      v_next := public.next_operating_expense_due_date(v_due, v_rule.start_date, v_rule.interval);
      v_due := v_next;
    end loop;

    update public.recurring_operating_expenses
    set
      next_due_date = v_due,
      archived_at = case
        when end_date is not null and v_due > end_date then coalesce(archived_at, now())
        else archived_at
      end,
      updated_at = now()
    where id = v_rule.id and workspace_id = p_workspace_id;
  end loop;

  return v_created;
end;
$$;

alter function public.materialize_due_operating_expenses(uuid, date) owner to postgres;
revoke all on function public.materialize_due_operating_expenses(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.materialize_due_operating_expenses(uuid, date)
  to authenticated, service_role;

-- Private Originalbelege je konkreter Ausgabe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operating-expense-documents',
  'operating-expense-documents',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml']
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml'];

create or replace function public.is_operating_expense_document_path(
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
    '^operating-expense-documents/' || p_workspace_id::text || '/' || p_expense_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|xml)$'
  );
$$;

alter function public.is_operating_expense_document_path(text, uuid, uuid) owner to postgres;
revoke all on function public.is_operating_expense_document_path(text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_operating_expense_document_path(text, uuid, uuid)
  to authenticated, service_role;

alter table public.operating_expense_categories enable row level security;
alter table public.recurring_operating_expenses enable row level security;
alter table public.operating_expenses enable row level security;
alter table public.operating_expense_documents enable row level security;

revoke all on table public.operating_expense_categories from public, anon, authenticated, service_role;
revoke all on table public.recurring_operating_expenses from public, anon, authenticated, service_role;
revoke all on table public.operating_expenses from public, anon, authenticated, service_role;
revoke all on table public.operating_expense_documents from public, anon, authenticated, service_role;

grant select, insert, update on table public.operating_expense_categories to authenticated;
grant select, insert, update on table public.recurring_operating_expenses to authenticated;
grant select, insert, update, delete on table public.operating_expenses to authenticated;
grant select, insert, delete on table public.operating_expense_documents to authenticated;

create policy "Betriebsausgabenkategorien lesen"
  on public.operating_expense_categories for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy "Betriebsausgabenkategorien anlegen"
  on public.operating_expense_categories for insert to authenticated
  with check (
    (select public.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

create policy "Betriebsausgabenkategorien ändern"
  on public.operating_expense_categories for update to authenticated
  using ((select public.is_workspace_member(workspace_id)))
  with check ((select public.is_workspace_member(workspace_id)));

create policy "Fixkosten lesen"
  on public.recurring_operating_expenses for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy "Fixkosten anlegen"
  on public.recurring_operating_expenses for insert to authenticated
  with check (
    (select public.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

create policy "Fixkosten ändern"
  on public.recurring_operating_expenses for update to authenticated
  using ((select public.is_workspace_member(workspace_id)))
  with check ((select public.is_workspace_member(workspace_id)));

create policy "Betriebsausgaben lesen"
  on public.operating_expenses for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy "Betriebsausgaben anlegen"
  on public.operating_expenses for insert to authenticated
  with check (
    (select public.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

create policy "Betriebsausgaben ändern"
  on public.operating_expenses for update to authenticated
  using ((select public.is_workspace_member(workspace_id)))
  with check ((select public.is_workspace_member(workspace_id)));

create policy "Betriebsausgaben löschen"
  on public.operating_expenses for delete to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy "Betriebsausgabenbelege lesen"
  on public.operating_expense_documents for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy "Betriebsausgabenbelege anlegen"
  on public.operating_expense_documents for insert to authenticated
  with check (
    (select public.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );

create policy "Betriebsausgabenbelege löschen"
  on public.operating_expense_documents for delete to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists "Betriebsausgabenbelege Storage lesen" on storage.objects;
drop policy if exists "Betriebsausgabenbelege Storage hochladen" on storage.objects;
drop policy if exists "Betriebsausgabenbelege Storage löschen" on storage.objects;

create policy "Betriebsausgabenbelege Storage lesen"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'operating-expense-documents'
    and exists (
      select 1
      from public.operating_expenses as expense
      where expense.workspace_id::text = (storage.foldername(name))[2]
        and expense.id::text = (storage.foldername(name))[3]
        and public.is_operating_expense_document_path(name, expense.workspace_id, expense.id)
        and (select public.is_workspace_member(expense.workspace_id))
    )
  );

create policy "Betriebsausgabenbelege Storage hochladen"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'operating-expense-documents'
    and exists (
      select 1
      from public.operating_expenses as expense
      where expense.workspace_id::text = (storage.foldername(name))[2]
        and expense.id::text = (storage.foldername(name))[3]
        and public.is_operating_expense_document_path(name, expense.workspace_id, expense.id)
        and (select public.is_workspace_member(expense.workspace_id))
    )
  );

create policy "Betriebsausgabenbelege Storage löschen"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'operating-expense-documents'
    and exists (
      select 1
      from public.operating_expenses as expense
      where expense.workspace_id::text = (storage.foldername(name))[2]
        and expense.id::text = (storage.foldername(name))[3]
        and public.is_operating_expense_document_path(name, expense.workspace_id, expense.id)
        and (select public.is_workspace_member(expense.workspace_id))
    )
  );
