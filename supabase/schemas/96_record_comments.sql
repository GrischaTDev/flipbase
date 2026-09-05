-- Gemeinsame Chronik: Kommentare zu genau einem Einkauf oder Verkauf.
-- UUIDs folgen den bestehenden fachlichen Datensatz-IDs. Referenzen erhalten
-- die Geschichte auch bei späteren Löschversuchen an Eltern oder Autoren.
create table public.record_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  purchase_id uuid,
  sale_id uuid,
  author_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  body text not null,
  constraint record_comments_one_entity check (num_nonnulls(purchase_id, sale_id) = 1),
  constraint record_comments_body_length check (
    body = btrim(body, chr(32)||chr(9)||chr(10)||chr(13)||chr(12)||chr(11)) and char_length(body) >= 1 and char_length(body) <= 5000
  ),
  constraint record_comments_purchase_fkey foreign key (workspace_id, purchase_id)
    references public.purchases(workspace_id, id) on delete restrict,
  constraint record_comments_sale_fkey foreign key (workspace_id, sale_id)
    references public.sales(workspace_id, id) on delete restrict
);
comment on table public.record_comments is
  'Unveränderliche interne Klartext-Kommentare zur gemeinsamen Einkaufs- und Verkaufschronik.';
create index record_comments_purchase_created_idx on public.record_comments(workspace_id, purchase_id, created_at desc, id desc);
create index record_comments_sale_created_idx on public.record_comments(workspace_id, sale_id, created_at desc, id desc);
create index record_comments_author_idx on public.record_comments(author_id);
alter table public.record_comments enable row level security;

-- Nur die Eingabespalten sind schreibbar: Identität und Zeit vergibt der Server.
-- Keine Änderungs-/Löschrechte; auch keine pauschalen service_role-Rechte.
revoke all on public.record_comments from public, anon, authenticated, service_role;
grant select on public.record_comments to authenticated;
grant insert(workspace_id, purchase_id, sale_id, author_id, body) on public.record_comments to authenticated;

create policy "Mitglieder lesen Kommentare" on public.record_comments
for select to authenticated using (
  (select public.is_workspace_member(workspace_id)) and (
    exists (select 1 from public.purchases p where p.workspace_id = record_comments.workspace_id and p.id = record_comments.purchase_id)
    or exists (select 1 from public.sales s where s.workspace_id = record_comments.workspace_id and s.id = record_comments.sale_id)
  )
);
create policy "Mitglieder schreiben eigene Kommentare" on public.record_comments
for insert to authenticated with check (
  author_id = (select auth.uid()) and (select public.is_workspace_member(workspace_id)) and (
    exists (select 1 from public.purchases p where p.workspace_id = record_comments.workspace_id and p.id = record_comments.purchase_id)
    or exists (select 1 from public.sales s where s.workspace_id = record_comments.workspace_id and s.id = record_comments.sale_id)
  )
);
create trigger "00_protect_archived_workspace" before insert or update or delete on public.record_comments
for each row execute function public.protect_archived_workspace_data();

-- SECURITY DEFINER ist nötig, da business_events absichtlich keine direkten
-- Leserechte besitzt und Profile anderer Mitglieder nicht allgemein lesbar sind.
-- Der Endpunkt prüft zuerst Mitgliedschaft UND exakten Datensatz. Der Join gibt
-- ausschließlich Anzeigenamen beteiligter Autoren aus, niemals E-Mail/Metadaten.
create or replace function public.list_record_timeline(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_kind text default null,
  p_cursor_id uuid default null,
  p_page_size integer default 20
)
returns table (
  id uuid, kind text, created_at timestamptz, actor_name text, body text,
  event_type text, actor_id uuid, reason text, changes jsonb, correlation_id uuid
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_workspace_id is null or p_entity_type is null or p_entity_id is null
    or not (select public.is_workspace_member(p_workspace_id))
    or not (
      (p_entity_type = 'purchase' and exists(select 1 from public.purchases p where p.workspace_id=p_workspace_id and p.id=p_entity_id))
      or (p_entity_type = 'sale' and exists(select 1 from public.sales s where s.workspace_id=p_workspace_id and s.id=p_entity_id))
    ) then
    raise exception using errcode='42501', message='Keine Berechtigung für diese Chronik.';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode='22023', message='Die Seitengröße muss zwischen 1 und 100 liegen.';
  end if;
  if num_nonnulls(p_cursor_created_at,p_cursor_kind,p_cursor_id) not in (0,3)
    or (p_cursor_kind is not null and p_cursor_kind not in ('comment','event')) then
    raise exception using errcode='22023', message='Der Chronik-Seitenzeiger ist ungültig.';
  end if;
  return query
  with entries as (
    select e.id, 'event'::text as kind, e.created_at,
      coalesce(nullif(btrim(p.full_name),''),case when e.actor_id is null then 'Automatisches System' else 'Mitglied' end) as actor_name,
      null::text as body, e.event_type, e.actor_id, e.reason, e.changes, e.correlation_id
    from public.business_events e left join public.profiles p on p.id=e.actor_id
    where e.workspace_id=p_workspace_id and e.entity_type=p_entity_type and e.entity_id=p_entity_id
    union all
    select c.id, 'comment'::text, c.created_at, coalesce(nullif(btrim(p.full_name),''),'Mitglied'),
      c.body, null::text, c.author_id, null::text, null::jsonb, null::uuid
    from public.record_comments c left join public.profiles p on p.id=c.author_id
    where c.workspace_id=p_workspace_id and (
      (p_entity_type='purchase' and c.purchase_id=p_entity_id)
      or (p_entity_type='sale' and c.sale_id=p_entity_id)
    )
  )
  select e.* from entries e
  where p_cursor_created_at is null or (e.created_at,e.kind collate "C",e.id) < (p_cursor_created_at,p_cursor_kind collate "C",p_cursor_id)
  order by e.created_at desc,e.kind collate "C" desc,e.id desc limit p_page_size;
end;
$$;
comment on function public.list_record_timeline(uuid,text,uuid,timestamptz,text,uuid,integer) is
  'Datensatzbezogene Chronik nach Mitgliedschafts- und Existenzprüfung mit stabiler gemeinsamer Paginierung.';
revoke execute on function public.list_record_timeline(uuid,text,uuid,timestamptz,text,uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.list_record_timeline(uuid,text,uuid,timestamptz,text,uuid,integer) to authenticated;
