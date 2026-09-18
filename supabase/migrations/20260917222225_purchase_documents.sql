-- migration: 20260917222225_purchase_documents.sql
-- purpose: store original purchase documents in a private bucket with metadata,
--   membership based access and history events; deletion only while the purchase is open
-- affected tables: storage.buckets, storage.objects (purchase-documents), public.purchase_documents
-- affected functions: is_purchase_document_path, log_purchase_document_event
-- note: written from supabase/schemas/170_purchase_documents.sql because `supabase db diff`
--   currently fails on the existing schema order (50_sniper.sql uses is_platform_operator
--   before 99_platform_admin.sql defines it)

drop policy if exists "Belege lesen" on storage.objects;
drop policy if exists "Belege hochladen" on storage.objects;
drop policy if exists "Belege offener Einkaeufe entfernen" on storage.objects;

-- Der Bucket bleibt privat und begrenzt Typ und Größe. Die Zuweisung ist
-- idempotent, damit eine abweichende Konfiguration nicht bestehen bleibt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-documents',
  'purchase-documents',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml']
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml'];

-- Belege speichern ausschließlich kanonische Pfade: Workspace, Einkauf, Beleg-ID.
create or replace function public.is_purchase_document_path(
  p_path text,
  p_workspace_id uuid,
  p_purchase_id uuid
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_path ~ ('^purchase-documents/' || p_workspace_id::text || '/' || p_purchase_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|xml)$');
$$;

alter function public.is_purchase_document_path(text, uuid, uuid) owner to postgres;
revoke all on function public.is_purchase_document_path(text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_purchase_document_path(text, uuid, uuid)
  to authenticated, service_role;

create table if not exists public.purchase_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  purchase_id uuid not null,
  document_type text not null
    check (document_type in ('invoice', 'purchase_proof', 'payment_proof', 'other')),
  original_file_name text not null
    check (pg_catalog.char_length(original_file_name) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml')),
  file_size integer not null check (file_size > 0 and file_size <= 20971520),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  foreign key (workspace_id, purchase_id)
    references public.purchases(workspace_id, id) on delete restrict,
  unique (workspace_id, id),
  constraint purchase_documents_storage_path_check
    check (public.is_purchase_document_path(storage_path, workspace_id, purchase_id))
);

comment on table public.purchase_documents is
  'Private Originalbelege eines Einkaufs: Metadaten und dauerhafter Storage-Pfad, niemals öffentliche Adressen.';
comment on column public.purchase_documents.document_type is
  'Belegart: invoice, purchase_proof, payment_proof oder other.';
comment on column public.purchase_documents.storage_path is
  'Kanonischer Pfad im privaten Bucket purchase-documents.';

create index if not exists purchase_documents_purchase_idx
  on public.purchase_documents (workspace_id, purchase_id, created_at, id);

alter table public.purchase_documents enable row level security;
revoke all on table public.purchase_documents from public, anon, authenticated, service_role;
grant select, insert, delete on table public.purchase_documents to authenticated;

create policy "Belege lesen" on public.purchase_documents
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

create policy "Belege anlegen" on public.purchase_documents
  for insert to authenticated
  with check (
    (select public.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.purchases as purchase
      where purchase.workspace_id = purchase_documents.workspace_id
        and purchase.id = purchase_documents.purchase_id
    )
  );

-- Nach dem Abschluss bleibt der Beleg erhalten; ergänzen ist weiterhin erlaubt.
create policy "Belege offener Einkaeufe loeschen" on public.purchase_documents
  for delete to authenticated
  using (
    (select public.is_workspace_member(workspace_id))
    and exists (
      select 1
      from public.purchases as purchase
      where purchase.workspace_id = purchase_documents.workspace_id
        and purchase.id = purchase_documents.purchase_id
        and purchase.entry_status <> 'finalized'
    )
  );

-- Dieselben Bedingungen für die Datei selbst. Das Lesen deckt auch den
-- Storage-eigenen Vorabtest beim Löschen ab.
create policy "Belege lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'purchase-documents'
    and exists (
      select 1
      from public.purchases as purchase
      where purchase.workspace_id::text = (storage.foldername(name))[2]
        and purchase.id::text = (storage.foldername(name))[3]
        and public.is_purchase_document_path(name, purchase.workspace_id, purchase.id)
        and (select public.is_workspace_member(purchase.workspace_id))
    )
  );

create policy "Belege hochladen" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'purchase-documents'
    and exists (
      select 1
      from public.purchases as purchase
      where purchase.workspace_id::text = (storage.foldername(name))[2]
        and purchase.id::text = (storage.foldername(name))[3]
        and public.is_purchase_document_path(name, purchase.workspace_id, purchase.id)
        and (select public.is_workspace_member(purchase.workspace_id))
    )
  );

create policy "Belege offener Einkaeufe entfernen" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'purchase-documents'
    and exists (
      select 1
      from public.purchases as purchase
      where purchase.workspace_id::text = (storage.foldername(name))[2]
        and purchase.id::text = (storage.foldername(name))[3]
        and public.is_purchase_document_path(name, purchase.workspace_id, purchase.id)
        and purchase.entry_status <> 'finalized'
        and (select public.is_workspace_member(purchase.workspace_id))
    )
  );

-- security definer ist nötig, weil business_events für Nutzer gesperrt ist.
create or replace function public.log_purchase_document_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.purchase_documents := case when tg_op = 'DELETE' then old else new end;
begin
  insert into public.business_events (
    workspace_id, entity_type, entity_id, event_type, actor_id, changes
  ) values (
    v_document.workspace_id,
    'purchase',
    v_document.purchase_id,
    case when tg_op = 'DELETE' then 'purchase_document_removed' else 'purchase_document_added' end,
    (select auth.uid()),
    pg_catalog.jsonb_build_object(
      'document_type', v_document.document_type,
      'original_file_name', v_document.original_file_name
    )
  );
  return v_document;
end;
$$;

alter function public.log_purchase_document_event() owner to postgres;
revoke all on function public.log_purchase_document_event()
  from public, anon, authenticated, service_role;

create trigger log_purchase_document_added
  after insert on public.purchase_documents
  for each row execute function public.log_purchase_document_event();

create trigger log_purchase_document_removed
  after delete on public.purchase_documents
  for each row execute function public.log_purchase_document_event();
