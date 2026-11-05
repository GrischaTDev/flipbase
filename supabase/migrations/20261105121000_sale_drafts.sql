-- Verkaufsentwürfe speichern den Stand der Verkaufserfassung, bevor der Verkauf gebucht wird.
-- Betroffen: neue Tabelle sale_drafts mit RLS, Zeitstempel- und Zugangsschutz-Trigger.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

create table public.sale_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  title text not null default '' check (length(title) <= 500),
  sale_amount numeric(12,2) not null default 0 check (sale_amount >= 0),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 262144),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
comment on table public.sale_drafts is 'Gespeicherte Verkaufserfassungen ohne Buchung, Bestandsabgang oder Reservierung.';
create index sale_drafts_workspace_idx on public.sale_drafts(workspace_id, updated_at desc);

create function public.touch_sale_draft_updated_at()
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
revoke all on function public.touch_sale_draft_updated_at() from public, anon, authenticated, service_role;
create trigger sale_drafts_touch_updated_at
before update on public.sale_drafts
for each row execute function public.touch_sale_draft_updated_at();
create trigger "01_protect_workspace_access"
before insert or update or delete on public.sale_drafts
for each row execute function public.protect_expired_workspace_business();

alter table public.sale_drafts enable row level security;
revoke all on public.sale_drafts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.sale_drafts to authenticated;
create policy "sale_drafts anon select" on public.sale_drafts for select to anon using (false);
create policy "sale_drafts anon insert" on public.sale_drafts for insert to anon with check (false);
create policy "sale_drafts anon update" on public.sale_drafts for update to anon using (false) with check (false);
create policy "sale_drafts anon delete" on public.sale_drafts for delete to anon using (false);
create policy "sale_drafts authenticated select" on public.sale_drafts for select to authenticated
  using ((select public.can_access_workspace(workspace_id)));
create policy "sale_drafts authenticated insert" on public.sale_drafts for insert to authenticated
  with check ((select public.can_access_workspace(workspace_id)));
create policy "sale_drafts authenticated update" on public.sale_drafts for update to authenticated
  using ((select public.can_access_workspace(workspace_id)))
  with check ((select public.can_access_workspace(workspace_id)));
create policy "sale_drafts authenticated delete" on public.sale_drafts for delete to authenticated
  using ((select public.can_access_workspace(workspace_id)));
