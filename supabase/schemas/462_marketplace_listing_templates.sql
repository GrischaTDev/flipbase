-- Wiederverwendbare Inseratangaben ohne Kontobezug oder Bilddateien.
create table public.marketplace_listing_templates (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  fields jsonb not null check (public.marketplace_listing_content_valid(fields)),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.marketplace_listing_templates is 'Ausgewählte Vinted-Inseratfelder und Platzhalter als Workspace-Vorlagen.';
create unique index marketplace_listing_templates_name on public.marketplace_listing_templates(workspace_id, lower(btrim(name)));
create index marketplace_listing_templates_creator on public.marketplace_listing_templates(created_by);
alter table public.marketplace_listing_templates enable row level security;
create policy "Eigene Inseratvorlagen lesen" on public.marketplace_listing_templates
for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Vorlagen nur per RPC anlegen" on public.marketplace_listing_templates for insert to authenticated with check (false);
create policy "Vorlagen nur per RPC ändern" on public.marketplace_listing_templates for update to authenticated using (false) with check (false);
create policy "Vorlagen nur per RPC löschen" on public.marketplace_listing_templates for delete to authenticated using (false);
revoke all on public.marketplace_listing_templates from public, anon, authenticated;
grant select on public.marketplace_listing_templates to authenticated;
grant all on public.marketplace_listing_templates to service_role;
grant usage, select on sequence public.marketplace_listing_templates_id_seq to service_role;

create or replace function public.marketplace_listing_template_document(p_template public.marketplace_listing_templates)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p_template.id::text,'workspaceId',p_template.workspace_id,'name',p_template.name,
    'fields',p_template.fields,'revision',p_template.revision,'updatedAt',p_template.updated_at);
$$;
revoke all on function public.marketplace_listing_template_document(public.marketplace_listing_templates) from public, anon, authenticated;

-- SECURITY DEFINER kapselt die Schreibrechte mit Workspace- und Revisionsprüfung.
create or replace function public.marketplace_save_listing_template(p_workspace_id uuid, p_id text, p_expected_revision bigint, p_name text, p_fields jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_template public.marketplace_listing_templates;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_name is null or length(btrim(p_name)) not between 1 and 100 or not public.marketplace_listing_content_valid(p_fields) then raise exception 'Ungültige Inseratvorlage.' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_revision is not null then raise exception 'Eine neue Vorlage hat keine Revision.' using errcode='22023'; end if;
    insert into public.marketplace_listing_templates(workspace_id,name,fields,created_by)
    values(p_workspace_id,btrim(p_name),p_fields,(select auth.uid())) returning * into v_template;
  else
    select * into v_template from public.marketplace_listing_templates where id=p_id::bigint and workspace_id=p_workspace_id for update;
    if not found then raise exception 'Kein Zugriff auf diese Vorlage.' using errcode='42501'; end if;
    if p_expected_revision is null or v_template.revision <> p_expected_revision then raise exception 'Die Vorlage wurde inzwischen geändert.' using errcode='40001'; end if;
    update public.marketplace_listing_templates set name=btrim(p_name),fields=p_fields,revision=revision+1,updated_at=now() where id=p_id::bigint returning * into v_template;
  end if;
  return public.marketplace_listing_template_document(v_template);
end;
$$;
create or replace function public.marketplace_list_listing_templates(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.marketplace_can_manage(p_workspace_id) then raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.marketplace_listing_template_document(t) order by lower(t.name),t.id)
    from public.marketplace_listing_templates t where t.workspace_id=p_workspace_id),'[]'::jsonb);
end;
$$;
create or replace function public.marketplace_delete_listing_template(p_workspace_id uuid, p_id text, p_expected_revision bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_template public.marketplace_listing_templates;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  select * into v_template from public.marketplace_listing_templates where id=p_id::bigint and workspace_id=p_workspace_id for update;
  if not found then raise exception 'Kein Zugriff auf diese Vorlage.' using errcode='42501'; end if;
  if p_expected_revision is null or v_template.revision <> p_expected_revision then raise exception 'Die Vorlage wurde inzwischen geändert.' using errcode='40001'; end if;
  delete from public.marketplace_listing_templates where id=p_id::bigint;
end;
$$;
revoke all on function public.marketplace_save_listing_template(uuid,text,bigint,text,jsonb), public.marketplace_list_listing_templates(uuid), public.marketplace_delete_listing_template(uuid,text,bigint) from public,anon;
grant execute on function public.marketplace_save_listing_template(uuid,text,bigint,text,jsonb), public.marketplace_list_listing_templates(uuid), public.marketplace_delete_listing_template(uuid,text,bigint) to authenticated;
