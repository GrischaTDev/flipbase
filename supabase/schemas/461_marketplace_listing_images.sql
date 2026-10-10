-- Private, unveränderliche Fotos. Upload und Auswahl werden getrennt bestätigt.
create table public.marketplace_listing_images (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  draft_id bigint not null,
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size bigint not null check (byte_size between 1 and 52428800),
  state text not null default 'pending' check (state in ('pending','ready','abandoned')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id,draft_id) references public.marketplace_listing_drafts(workspace_id,id) on delete cascade
);
comment on table public.marketplace_listing_images is 'Privat reservierte Originalfotos; fertige Dateien werden nicht überschrieben oder bei Auswahländerungen gelöscht.';
create index marketplace_listing_images_workspace on public.marketplace_listing_images(workspace_id);
create index marketplace_listing_images_draft on public.marketplace_listing_images(draft_id);
create index marketplace_listing_images_creator on public.marketplace_listing_images(created_by);
alter table public.marketplace_listing_images enable row level security;
create policy "Eigene Inseratbilder lesen" on public.marketplace_listing_images for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Bilder nur per RPC anlegen" on public.marketplace_listing_images for insert to authenticated with check (false);
create policy "Bilder nur per RPC ändern" on public.marketplace_listing_images for update to authenticated using (false) with check (false);
create policy "Bilder nur per RPC löschen" on public.marketplace_listing_images for delete to authenticated using (false);
revoke all on public.marketplace_listing_images from public,anon,authenticated;
grant select on public.marketplace_listing_images to authenticated;
grant all on public.marketplace_listing_images to service_role;
grant usage,select on sequence public.marketplace_listing_images_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marketplace-listing-media','marketplace-listing-media',false,52428800,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

create policy "Eigene Inseratfotos hochladen" on storage.objects for insert to authenticated with check (
  bucket_id='marketplace-listing-media' and exists(select 1 from public.marketplace_listing_images i
  where i.storage_path=name and i.state='pending' and i.created_by=(select auth.uid()) and public.marketplace_can_manage(i.workspace_id))
);
create policy "Eigene Inseratfotos lesen" on storage.objects for select to authenticated using (
  bucket_id='marketplace-listing-media' and exists(select 1 from public.marketplace_listing_images i
  where i.storage_path=name and i.state in ('pending','ready','abandoned') and public.marketplace_can_manage(i.workspace_id))
);
create policy "Abgebrochene Inseratfotos bereinigen" on storage.objects for delete to authenticated using (
  bucket_id='marketplace-listing-media' and exists(select 1 from public.marketplace_listing_images i
  where i.storage_path=name and i.state='abandoned' and i.created_by=(select auth.uid()) and public.marketplace_can_manage(i.workspace_id))
);

create or replace function public.marketplace_listing_draft_document(p_draft public.marketplace_listing_drafts)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p_draft.id::text,'workspaceId',p_draft.workspace_id,'connectionId',p_draft.connection_id,
    'content',p_draft.content,'revision',p_draft.revision,'inventoryItemId',p_draft.inventory_item_id,
    'createdAt',p_draft.created_at,'updatedAt',p_draft.updated_at,'images',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id::text,'storagePath',i.storage_path,'fileName',i.file_name,
        'mimeType',i.mime_type,'byteSize',i.byte_size) order by selected.position)
      from unnest(p_draft.image_ids) with ordinality selected(id,position)
      join public.marketplace_listing_images i on i.id=selected.id::bigint and i.draft_id=p_draft.id and i.state='ready'
    ),'[]'::jsonb));
$$;

-- SECURITY DEFINER ist für die kontrollierte Reservierung ohne direkte Tabellenschreibrechte nötig.
create or replace function public.marketplace_reserve_listing_image(p_draft_id text,p_file_name text,p_mime_type text,p_byte_size bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_draft public.marketplace_listing_drafts; v_image public.marketplace_listing_images; v_path text;
begin
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  if p_file_name is null or length(p_file_name) not between 1 and 255 or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp') or p_byte_size is null or p_byte_size not between 1 and 52428800 then raise exception 'Bitte ein JPG-, PNG- oder WebP-Foto bis 50 MB auswählen.' using errcode='22023'; end if;
  -- Eigene Uploadgrenze; keine Behauptung über die zulässige Dateigröße bei Vinted.
  v_path:=v_draft.workspace_id::text||'/'||v_draft.id::text||'/'||gen_random_uuid()::text||case p_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;
  insert into public.marketplace_listing_images(workspace_id,draft_id,storage_path,file_name,mime_type,byte_size,created_by)
  values(v_draft.workspace_id,v_draft.id,v_path,p_file_name,p_mime_type,p_byte_size,(select auth.uid())) returning * into v_image;
  return jsonb_build_object('id',v_image.id::text,'storagePath',v_path);
end;
$$;
create or replace function public.marketplace_commit_listing_image(p_draft_id text,p_expected_revision bigint,p_image_id text,p_replace_image_id text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_draft public.marketplace_listing_drafts; v_image public.marketplace_listing_images;
begin
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint for update;
  select * into v_image from public.marketplace_listing_images where id=p_image_id::bigint and draft_id=p_draft_id::bigint for update;
  if not found or v_image.created_by<>(select auth.uid()) then raise exception 'Kein Zugriff auf diesen Upload.' using errcode='42501'; end if;
  -- Bereits bestätigte Antwort darf erneut gelesen werden, ohne ein Bild doppelt anzuhängen.
  if v_image.state='ready' and p_image_id::bigint=any(v_draft.image_ids) then return public.marketplace_listing_draft_document(v_draft); end if;
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if v_image.state<>'pending' or not exists(select 1 from storage.objects o where o.bucket_id='marketplace-listing-media' and o.name=v_image.storage_path and o.metadata->>'mimetype'=v_image.mime_type and o.metadata->>'size'=v_image.byte_size::text) then raise exception 'Der Upload ist noch nicht vollständig.' using errcode='22023'; end if;
  if p_replace_image_id is not null then
    if not (p_replace_image_id::bigint=any(v_draft.image_ids)) then raise exception 'Das zu ersetzende Foto gehört nicht zur aktuellen Auswahl.' using errcode='42501'; end if;
  elsif cardinality(v_draft.image_ids)>=100 then raise exception 'Dieser Entwurf enthält bereits 100 Fotos.' using errcode='22023'; end if;
  update public.marketplace_listing_images set state='ready' where id=p_image_id::bigint;
  -- Erst das vollständig hochgeladene Original bestätigen, dann seine Auswahlposition atomar ersetzen.
  update public.marketplace_listing_drafts set image_ids=case when p_replace_image_id is null then array_append(image_ids,p_image_id::bigint) else array_replace(image_ids,p_replace_image_id::bigint,p_image_id::bigint) end,revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$$;
create or replace function public.marketplace_set_listing_image_order(p_draft_id text,p_expected_revision bigint,p_image_ids text[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_draft public.marketplace_listing_drafts;
begin
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint;
  if not found then raise exception 'Kein Zugriff auf diesen Entwurf.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_draft.workspace_id);
  select * into v_draft from public.marketplace_listing_drafts where id=p_draft_id::bigint for update;
  if p_expected_revision is null or v_draft.revision<>p_expected_revision then raise exception 'Der Entwurf wurde inzwischen geändert.' using errcode='40001'; end if;
  if p_image_ids is null or cardinality(p_image_ids)>100 or exists(select 1 from unnest(p_image_ids) id where id is null or id !~ '^[1-9][0-9]{0,18}$') or (select count(distinct id) from unnest(p_image_ids) id)<>cardinality(p_image_ids) then raise exception 'Ungültige Bildauswahl.' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_image_ids) selected(id) where not exists(select 1 from public.marketplace_listing_images i where i.id=selected.id::bigint and i.draft_id=p_draft_id::bigint and i.state='ready')) then raise exception 'Diese Fotos gehören nicht zum Entwurf.' using errcode='42501'; end if;
  update public.marketplace_listing_drafts set image_ids=p_image_ids::bigint[],revision=revision+1,updated_at=now() where id=p_draft_id::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$$;
create or replace function public.marketplace_discard_listing_image(p_image_id text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_image public.marketplace_listing_images;
begin
  select * into v_image from public.marketplace_listing_images where id=p_image_id::bigint;
  if not found or v_image.created_by<>(select auth.uid()) then raise exception 'Kein Zugriff auf diesen Upload.' using errcode='42501'; end if;
  perform public.marketplace_lock_listing_workspace(v_image.workspace_id);
  -- Gleiche Sperrreihenfolge wie Commit: erst Entwurf, dann Bild.
  perform 1 from public.marketplace_listing_drafts where id=v_image.draft_id for update;
  select * into v_image from public.marketplace_listing_images where id=p_image_id::bigint for update;
  if v_image.state='ready' then raise exception 'Bestätigte Originalfotos dürfen nicht gelöscht werden.' using errcode='22023'; end if;
  update public.marketplace_listing_images set state='abandoned' where id=p_image_id::bigint;
  return v_image.storage_path;
end;
$$;
revoke all on function public.marketplace_reserve_listing_image(text,text,text,bigint),public.marketplace_commit_listing_image(text,bigint,text,text),public.marketplace_set_listing_image_order(text,bigint,text[]),public.marketplace_discard_listing_image(text) from public,anon;
grant execute on function public.marketplace_reserve_listing_image(text,text,text,bigint),public.marketplace_commit_listing_image(text,bigint,text,text),public.marketplace_set_listing_image_order(text,bigint,text[]),public.marketplace_discard_listing_image(text) to authenticated;
