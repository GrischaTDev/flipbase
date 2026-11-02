-- Die Quelle bleibt auch nach erneutem Öffnen eines Relist-Entwurfs fest an dessen Konto gebunden.
-- SECURITY DEFINER ist wie bei der bestehenden Entwurfsanlage für kontrollierte Schreibrechte nötig.
create or replace function public.marketplace_create_relisting_draft(
  p_workspace_id uuid, p_connection_id uuid, p_content jsonb, p_request_id uuid, p_external_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_draft public.marketplace_listing_drafts; v_result jsonb;
begin
  perform public.marketplace_lock_listing_workspace(p_workspace_id);
  if p_external_id is null or p_external_id !~ '^[1-9][0-9]{0,31}$' then
    raise exception 'Ungültige Relist-Quelle.' using errcode='22023';
  end if;
  if not exists(select 1 from public.marketplace_connections c where c.id=p_connection_id and c.workspace_id=p_workspace_id
    and c.marketplace='vinted' and c.execution_mode='cloud' and c.status='connected')
    or not exists(select 1 from public.marketplace_account_entries e where e.workspace_id=p_workspace_id and e.connection_id=p_connection_id
      and e.kind='publication' and e.external_id=p_external_id and e.body->>'publicationState'='active') then
    raise exception 'Wähle ein aktives eigenes Vinted-Inserat.' using errcode='42501';
  end if;
  select * into v_draft from public.marketplace_listing_drafts where workspace_id=p_workspace_id and created_by=(select auth.uid()) and request_id=p_request_id;
  if found then
    if v_draft.relist_external_id is distinct from p_external_id or v_draft.connection_id is distinct from p_connection_id then
      raise exception 'Diese Auftragskennung wurde bereits verwendet.' using errcode='23505';
    end if;
    return public.marketplace_listing_draft_document(v_draft);
  end if;
  v_result := public.marketplace_create_listing_draft(p_workspace_id,p_connection_id,p_content,null,p_request_id);
  update public.marketplace_listing_drafts set relist_external_id=p_external_id where id=(v_result->>'id')::bigint returning * into v_draft;
  return public.marketplace_listing_draft_document(v_draft);
end;
$$;
revoke all on function public.marketplace_create_relisting_draft(uuid,uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.marketplace_create_relisting_draft(uuid,uuid,jsonb,uuid,text) to authenticated;
