-- Server-seitige Vordergrundmasken fuer Vinted-Fotoberuhigung mit Kontingent-, Cache- und Workspace-Schutz.
create table public.vinted_photo_background_masks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('fal', 'replicate')),
  model text not null check (length(btrim(model)) between 1 and 120),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'unknown')),
  storage_path text unique,
  byte_size bigint check (byte_size between 1 and 15728640),
  estimated_cost_usd numeric(14,8) check (estimated_cost_usd >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
comment on table public.vinted_photo_background_masks is 'Freistellungs-Vordergrundmasken fuer die Untergrundberuhigung im Relisting-Editor; Originale bleiben im separaten Bucket unveraendert.';
create index vinted_photo_background_masks_cache_idx on public.vinted_photo_background_masks(workspace_id, input_hash, created_at desc) where status = 'completed';
create index vinted_photo_background_masks_user_time_idx on public.vinted_photo_background_masks(user_id, created_at desc);
alter table public.vinted_photo_background_masks enable row level security;
create policy "Eigene Fotomasken lesen" on public.vinted_photo_background_masks
  for select to authenticated using (public.marketplace_can_manage(workspace_id));
create policy "Fotomasken nur ueber Serverfunktion schreiben" on public.vinted_photo_background_masks
  for insert to authenticated with check (false);
create policy "Fotomasken nicht direkt aendern" on public.vinted_photo_background_masks
  for update to authenticated using (false) with check (false);
create policy "Fotomasken nicht direkt loeschen" on public.vinted_photo_background_masks
  for delete to authenticated using (false);
revoke all on public.vinted_photo_background_masks from public, anon, authenticated;
grant select on public.vinted_photo_background_masks to authenticated;
grant all on public.vinted_photo_background_masks to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-listing-masks', 'marketplace-listing-masks', false, 15728640, array['image/png'])
on conflict (id) do nothing;

create policy "Eigene Fotomasken im Storage lesen" on storage.objects for select to authenticated using (
  bucket_id = 'marketplace-listing-masks' and exists (
    select 1 from public.vinted_photo_background_masks m
    where m.storage_path = name and m.status = 'completed' and public.marketplace_can_manage(m.workspace_id)
  )
);

-- Nur die authentifizierte Edge Function mit Dienstrolle darf Maskenerstellung und Kontingent reservieren.
create or replace function public.reserve_vinted_photo_background_mask(
  p_user_id uuid,
  p_workspace_id uuid,
  p_input_hash text,
  p_provider text,
  p_model text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_mask public.vinted_photo_background_masks;
  v_id uuid;
  v_path text;
begin
  if p_user_id is null or p_workspace_id is null
    or not public.user_can_access_workspace(p_workspace_id, p_user_id)
    or not exists (
      select 1 from public.workspace_members m
      join public.workspaces w on w.id = m.workspace_id
      where m.workspace_id = p_workspace_id and m.user_id = p_user_id
        and m.role in ('owner', 'admin') and w.archived_at is null
    ) then
    raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
  end if;
  if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$'
    or p_provider is null or p_provider not in ('fal', 'replicate')
    or p_model is null or length(btrim(p_model)) not between 1 and 120 then
    raise exception 'Ungueltige Maskendaten.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 459));
  select * into v_mask from public.vinted_photo_background_masks m
    where m.workspace_id = p_workspace_id and m.input_hash = p_input_hash and m.status = 'completed'
      and m.storage_path is not null
      and exists (select 1 from storage.objects o where o.bucket_id = 'marketplace-listing-masks' and o.name = m.storage_path)
    order by m.created_at desc limit 1;
  if found then
    return jsonb_build_object('id', v_mask.id, 'storagePath', v_mask.storage_path, 'cached', true);
  end if;
  if exists (select 1 from public.vinted_photo_background_masks where user_id = p_user_id and status = 'pending' and created_at > now() - interval '2 minutes') then
    return jsonb_build_object('error', 'mask_busy');
  end if;
  if (select count(*) from public.vinted_photo_background_masks where user_id = p_user_id and created_at > now() - interval '1 hour') >= 60
    or (select count(*) from public.vinted_photo_background_masks where user_id = p_user_id and created_at > now() - interval '1 day') >= 300 then
    return jsonb_build_object('error', 'mask_limit');
  end if;
  update public.vinted_photo_background_masks set status = 'unknown', error_code = 'interrupted', finished_at = now()
    where user_id = p_user_id and status = 'pending';
  v_id := gen_random_uuid();
  v_path := p_workspace_id::text || '/' || v_id::text || '.png';
  insert into public.vinted_photo_background_masks(id, workspace_id, user_id, input_hash, provider, model, storage_path)
    values (v_id, p_workspace_id, p_user_id, p_input_hash, p_provider, btrim(p_model), v_path) returning * into v_mask;
  return jsonb_build_object('id', v_mask.id, 'storagePath', v_mask.storage_path, 'cached', false);
end;
$$;
revoke all on function public.reserve_vinted_photo_background_mask(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_vinted_photo_background_mask(uuid, uuid, text, text, text) to service_role;

create or replace function public.vinted_photo_background_mask_usage(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case
    when not public.marketplace_can_manage(p_workspace_id) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(to_jsonb(summary)) from (
        select provider, count(*) as requests,
          count(*) filter (where status = 'completed') as completed_requests,
          count(*) filter (where estimated_cost_usd is null and status <> 'failed') as unknown_cost_requests,
          sum(estimated_cost_usd) as estimated_cost_usd
        from public.vinted_photo_background_masks
        where workspace_id = p_workspace_id and created_at > now() - interval '30 days'
        group by provider order by provider
      ) as summary
    ), '[]'::jsonb)
  end;
$$;
revoke all on function public.vinted_photo_background_mask_usage(uuid) from public, anon;
grant execute on function public.vinted_photo_background_mask_usage(uuid) to authenticated;
