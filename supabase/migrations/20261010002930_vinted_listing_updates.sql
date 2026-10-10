-- Zweck: private Änderungsmeldungen für den Inseratauftragsverlauf.
-- Betroffen: Trigger auf public.marketplace_listing_jobs und Lesepolicy auf realtime.messages.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.marketplace_notify_listing_job_change()
  returns trigger
  language plpgsql
  set search_path to ''
  as $function$
declare v_workspace_id uuid; v_draft_id bigint;
begin
  -- Die Versionsnummer steigt auch bei Lease-Prüfungen. Diese erzeugen keine sichtbare Änderung.
  if tg_op='UPDATE' and row(new.state,new.error_code,new.external_id,new.provider_state,new.verified_at,new.connection_id,new.permission_id)
    is not distinct from row(old.state,old.error_code,old.external_id,old.provider_state,old.verified_at,old.connection_id,old.permission_id) then
    return new;
  end if;
  if tg_op='DELETE' then v_workspace_id:=old.workspace_id; v_draft_id:=old.draft_id;
  else v_workspace_id:=new.workspace_id; v_draft_id:=new.draft_id; end if;
  perform realtime.send(jsonb_build_object('workspaceId',v_workspace_id,'draftId',v_draft_id::text),
    'listing_jobs_changed','workspace:'||v_workspace_id::text||':marketplace_listing:'||v_draft_id::text,true);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

comment on function public.marketplace_notify_listing_job_change() is 'Privater Hinweis auf sichtbare Inseratauftragsänderungen; aktuelle Inhalte werden separat mit bestehenden Rechten gelesen.';

revoke all on function public.marketplace_notify_listing_job_change() from public;

grant all on function public.marketplace_notify_listing_job_change() to service_role;

create trigger marketplace_notify_listing_job_change
  after insert or delete or update on public.marketplace_listing_jobs
  for each row
  execute function public.marketplace_notify_listing_job_change();

-- Explizite Rechte für private Inseratauftragsmeldungen.
revoke all on function public.marketplace_notify_listing_job_change() from public,anon,authenticated;
grant execute on function public.marketplace_notify_listing_job_change() to service_role;
create policy "Kontoverwalter empfangen Inserataufträge" on realtime.messages for select to authenticated
using (extension='broadcast' and private and topic=(select realtime.topic()) and exists (
  select 1 from public.marketplace_listing_drafts d
  where realtime.messages.topic='workspace:'||d.workspace_id::text||':marketplace_listing:'||d.id::text
    and public.marketplace_can_manage(d.workspace_id)
));
