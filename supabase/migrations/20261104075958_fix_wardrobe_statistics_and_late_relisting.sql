-- Serienvergleich der Änderungszahlen beschleunigen und aktive Anbieterwerte bei später Relist-Bestätigung erhalten.
-- Aus isolierter Schemaänderung mit migra erzeugt; betroffen: marketplace_listing_metric_observations und marketplace_relink_relisting_entry.
create index marketplace_listing_metric_observations_series on public.marketplace_listing_metric_observations using btree (workspace_id, connection_id, entry_id, statistic_item_id, observed_at desc);

set check_function_bodies = off;

create or replace function public.marketplace_relink_relisting_entry(p_job marketplace_listing_jobs)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare v_source public.marketplace_account_entries; v_target public.marketplace_account_entries; v_body jsonb; v_entry_id uuid;
begin
  if p_job.state<>'confirmed' or p_job.action<>'publish' or not (p_job.snapshot ? 'relistExternalId') or p_job.connection_id is null
    or not public.marketplace_relisting_job_is_latest(p_job)
    or not exists(select 1 from public.marketplace_connections account where account.workspace_id=p_job.workspace_id and account.id=p_job.connection_id
      and account.marketplace='vinted' and account.external_account_id=p_job.external_account_id) then return p_job.relist_entry_id; end if;
  if p_job.external_id=p_job.snapshot->>'relistExternalId' then raise exception 'Das neue Inserat verwendet die alte Anbieterkennung.' using errcode='22023'; end if;
  v_entry_id:=public.marketplace_bind_relisting_entry(p_job);
  select * into v_source from public.marketplace_account_entries where id=v_entry_id for update;
  select * into v_target from public.marketplace_account_entries where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id
    and kind='publication' and external_id=p_job.external_id for update;
  if v_target.id is not null and (v_source.id is distinct from v_target.id or p_job.relist_entry_id is null) and (
    exists(select 1 from public.marketplace_listing_jobs other where other.id<>p_job.id and other.relist_entry_id=v_target.id)
    or exists(select 1 from public.marketplace_account_entries child where child.parent_id=v_target.id)
  ) then raise exception 'Die neue Anbieterkennung gehört bereits zu einer anderen Artikelzuordnung.' using errcode='23505'; end if;
  if v_source.id=v_target.id then return v_source.id; end if;
  v_body:=coalesce(v_target.body,jsonb_build_object(
    'title',p_job.snapshot->'content'->>'title','text',p_job.snapshot->'content'->>'description','textState','loaded',
    'price',(p_job.snapshot->'content'->>'priceCents')::numeric/100,'currency',p_job.snapshot->'content'->>'currency',
    'brand',p_job.snapshot->'content'->>'brandLabel','size',p_job.snapshot->'content'->>'sizeLabel',
    'publicationState',case when p_job.provider_state='active' then 'active' else 'unknown' end,'status',p_job.provider_state,
    'createdAt',null,'occurredAt',null,'publicationAge',null,
    'imageUrl',v_source.body->'imageUrl','imageUrls',coalesce(v_source.body->'imageUrls','[]'::jsonb),
    'metrics',jsonb_build_object('views',null,'favorites',null,'observedAt',p_job.finished_at)));
  -- Ein späterer Publishbeleg überstimmt den vorher gelesenen Anbieterentwurf.
  -- Eine schon aktive Anzeige kann inzwischen manuell geändert worden sein.
  -- Nur ein älterer Anbieterentwurf erhält die bestätigten Kernwerte des Auftrags.
  if v_target.observed_at<=p_job.verified_at and v_target.body->>'publicationState'='draft' then
    v_body:=v_body||jsonb_build_object('title',p_job.snapshot->'content'->>'title','text',p_job.snapshot->'content'->>'description','textState','loaded',
      'price',(p_job.snapshot->'content'->>'priceCents')::numeric/100,'currency',p_job.snapshot->'content'->>'currency',
      'brand',p_job.snapshot->'content'->>'brandLabel','size',p_job.snapshot->'content'->>'sizeLabel',
      'publicationState',case when p_job.provider_state='active' then 'active' else 'unknown' end,
      'status',p_job.provider_state,'publicationAge',null,'occurredAt',null);
  end if;
  if v_body->>'textState' is distinct from 'loaded' then
    v_body:=v_body||jsonb_build_object('text',p_job.snapshot->'content'->>'description','textState','loaded');
  end if;
  if v_source.id is null then
    -- Ein früher bereits entfernter Altcache hat keine rekonstruierbare UUID.
    -- Die belegte neue Anzeige wird nur in diesem Altfall zur dauerhaften Bindung.
    if v_target.id is null then
      insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,body,sort_at,observed_at)
        values(p_job.workspace_id,p_job.connection_id,'publication',p_job.external_id,v_body,p_job.verified_at,p_job.finished_at) returning id into v_entry_id;
    else v_entry_id:=v_target.id; end if;
  else
    if v_target.id is not null then
      update public.marketplace_listing_metric_observations set entry_id=v_source.id
        where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and entry_id=v_target.id;
      update public.marketplace_favorite_notification_events set entry_id=v_source.id
        where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and entry_id=v_target.id and external_listing_id=p_job.external_id;
      delete from public.marketplace_account_entries where id=v_target.id;
    end if;
    update public.marketplace_listing_statistic_items set removed_at=coalesce(removed_at,p_job.finished_at)
      where workspace_id=p_job.workspace_id and connection_id=p_job.connection_id and external_id=p_job.snapshot->>'relistExternalId';
    update public.marketplace_account_entries set external_id=p_job.external_id,body=v_body,observed_at=greatest(p_job.finished_at,v_target.observed_at),
      favorite_notification_version=v_target.favorite_notification_version where id=v_source.id returning id into v_entry_id;
  end if;
  update public.marketplace_listing_jobs set relist_entry_id=v_entry_id where id=p_job.id;
  return v_entry_id;
end;
$function$
;
