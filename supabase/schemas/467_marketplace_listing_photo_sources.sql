-- Originalfotos bleiben über wechselnde Vinted-Artikelkennungen lesbar. Keine Ausgabedateien.
create table public.marketplace_listing_photo_sources (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null,
  external_account_id text not null check (external_account_id ~ '^[1-9][0-9]{0,31}$'),
  external_id text not null check (external_id ~ '^[1-9][0-9]{0,31}$'),
  draft_id bigint not null,
  images jsonb not null check (jsonb_typeof(images)='array' and jsonb_array_length(images) between 1 and 20),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,connection_id) references public.marketplace_connections(workspace_id,id) on delete cascade,
  foreign key(workspace_id,draft_id) references public.marketplace_listing_drafts(workspace_id,id) on delete cascade,
  unique(connection_id,external_account_id,external_id)
);
comment on table public.marketplace_listing_photo_sources is 'Unveränderliche Zuordnung gesicherter Originalfotos zu einem Vinted-Inserat; Anbieterbilder überschreiben diese Sicherung nicht.';
create index marketplace_listing_photo_sources_workspace on public.marketplace_listing_photo_sources(workspace_id);
create index marketplace_listing_photo_sources_draft on public.marketplace_listing_photo_sources(draft_id);
alter table public.marketplace_listing_photo_sources enable row level security;
create policy "Inseratoriginale lesen" on public.marketplace_listing_photo_sources for select to authenticated using(public.marketplace_can_manage(workspace_id));
create policy "Inseratoriginale nur per Auftrag anlegen" on public.marketplace_listing_photo_sources for insert to authenticated with check(false);
create policy "Inseratoriginale unverändert erhalten" on public.marketplace_listing_photo_sources for update to authenticated using(false) with check(false);
create policy "Inseratoriginale nicht direkt löschen" on public.marketplace_listing_photo_sources for delete to authenticated using(false);
revoke all on public.marketplace_listing_photo_sources from public,anon,authenticated;
grant select on public.marketplace_listing_photo_sources to authenticated;
grant all on public.marketplace_listing_photo_sources to service_role;
grant usage,select on sequence public.marketplace_listing_photo_sources_id_seq to service_role;

create or replace function public.marketplace_remember_listing_photo_source(p_job public.marketplace_listing_jobs,p_external_id text)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  if p_job.connection_id is null or p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$' then return; end if;
  insert into public.marketplace_listing_photo_sources(workspace_id,connection_id,external_account_id,external_id,draft_id,images)
    values(p_job.workspace_id,p_job.connection_id,p_job.external_account_id,p_external_id,p_job.draft_id,p_job.snapshot->'images')
    on conflict(connection_id,external_account_id,external_id) do nothing;
end;
$$;
revoke all on function public.marketplace_remember_listing_photo_source(public.marketplace_listing_jobs,text) from public,anon,authenticated;
grant execute on function public.marketplace_remember_listing_photo_source(public.marketplace_listing_jobs,text) to service_role;

-- Kontrollierter Lesezugriff auf privat gesicherte Originale, auch wenn der Arbeitsentwurf archiviert wurde.
create or replace function public.marketplace_read_listing_photo_sources(p_workspace_id uuid,p_connection_id uuid,p_external_ids text[])
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_account text; v_items jsonb;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_external_ids is null or cardinality(p_external_ids)>50 or exists(select 1 from unnest(p_external_ids) id where id is null or id !~ '^[1-9][0-9]{0,31}$') then raise exception 'Ungültige Artikelzuordnung.' using errcode='22023'; end if;
  select external_account_id into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id;
  if not found then raise exception 'Kein Zugriff auf dieses Marktplatzkonto.' using errcode='42501'; end if;
  -- Frühere bestätigte Aufträge sind die früheste noch verfügbare Sicherung. Nur einmal zuordnen.
  insert into public.marketplace_listing_photo_sources(workspace_id,connection_id,external_account_id,external_id,draft_id,images)
    select distinct on (external_id) workspace_id,connection_id,external_account_id,external_id,draft_id,snapshot->'images'
    from public.marketplace_listing_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and external_account_id=v_account
      and external_id=any(p_external_ids) and action='publish' and state='confirmed'
    order by external_id,created_at,id on conflict(connection_id,external_account_id,external_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('externalId',source.external_id,'draft',public.marketplace_listing_draft_document(draft)||jsonb_build_object('images',source.images,'photoOptions',null,'connectionId',source.connection_id))),'[]'::jsonb) into v_items
    from public.marketplace_listing_photo_sources source join public.marketplace_listing_drafts draft on draft.id=source.draft_id and draft.workspace_id=source.workspace_id
    where source.workspace_id=p_workspace_id and source.connection_id=p_connection_id and source.external_account_id=v_account and source.external_id=any(p_external_ids);
  return jsonb_build_object('items',v_items);
end;
$$;
revoke all on function public.marketplace_read_listing_photo_sources(uuid,uuid,text[]) from public,anon;
grant execute on function public.marketplace_read_listing_photo_sources(uuid,uuid,text[]) to authenticated;
