-- Genau eine dauerhafte Verkaufsmeldung je Quelle, persönliche Lesestatus getrennt.
create table public.ebay_sale_notifications (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check(environment in ('production','sandbox')),
  external_account_id text not null,
  source_key text not null,
  order_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,environment,source_key)
);
comment on table public.ebay_sale_notifications is 'Private dauerhafte eBay-Glockenereignisse unabhängig von Push-Opt-in und endgültiger Buchung.';
create index ebay_sale_notifications_account on public.ebay_sale_notifications(workspace_id,environment,external_account_id,created_at desc);
alter table public.ebay_sale_notifications enable row level security;
revoke all on public.ebay_sale_notifications from public,anon,authenticated;
grant all on public.ebay_sale_notifications to service_role;
revoke all on sequence public.ebay_sale_notifications_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ebay_sale_notifications_id_seq to service_role;
create policy "Dienst liest Glockenereignisse" on public.ebay_sale_notifications for select to service_role using(true);
create policy "Dienst erstellt Glockenereignisse" on public.ebay_sale_notifications for insert to service_role with check(true);
create policy "Dienst ändert Glockenereignisse" on public.ebay_sale_notifications for update to service_role using(true) with check(true);
create policy "Dienst löscht Glockenereignisse" on public.ebay_sale_notifications for delete to service_role using(true);

create table public.ebay_sale_notification_receipts (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.ebay_sale_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  unique(event_id,user_id)
);
comment on table public.ebay_sale_notification_receipts is 'Persönlicher Lesestatus und ausgeblendeter Verlauf ohne Änderung des Verkaufsbelegs.';
create index ebay_sale_notification_receipts_user on public.ebay_sale_notification_receipts(user_id);
alter table public.ebay_sale_notification_receipts enable row level security;
revoke all on public.ebay_sale_notification_receipts from public,anon,authenticated;
grant all on public.ebay_sale_notification_receipts to service_role;
revoke all on sequence public.ebay_sale_notification_receipts_id_seq from public,anon,authenticated;
grant usage,select on sequence public.ebay_sale_notification_receipts_id_seq to service_role;
create policy "Dienst liest Glockenstatus" on public.ebay_sale_notification_receipts for select to service_role using(true);
create policy "Dienst erstellt Glockenstatus" on public.ebay_sale_notification_receipts for insert to service_role with check(true);
create policy "Dienst ändert Glockenstatus" on public.ebay_sale_notification_receipts for update to service_role using(true) with check(true);
create policy "Dienst löscht Glockenstatus" on public.ebay_sale_notification_receipts for delete to service_role using(true);

create function public.ebay_cache_record_sale_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.auto_prepare then
    insert into public.ebay_sale_notifications(workspace_id,environment,external_account_id,source_key,order_id)
      values(new.workspace_id,new.environment,new.external_account_id,new.source_key,new.order_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.ebay_cache_record_sale_notification() from public,anon,authenticated;
create trigger ebay_cache_record_sale_notification after insert or update on public.ebay_cached_orders for each row execute function public.ebay_cache_record_sale_notification();

create function public.ebay_sale_notifications_read(p_workspace_id uuid,p_connection_id uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_connection public.ebay_connections;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  if p_page is null or p_page<1 or p_page>100000 then raise exception 'Ungültige Seite' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('eventId',n.id,'eventKey','ebay-sale:'||n.id::text,'workspaceId',n.workspace_id,
    'connectionId',p_connection_id,'orderId',n.order_id,'draftId',d.id,'state',coalesce(d.state,'needs_mapping'),'createdAt',n.created_at,'readAt',r.read_at)
    order by n.created_at desc,n.id desc),'[]'::jsonb) from (select * from public.ebay_sale_notifications n
      where workspace_id=p_workspace_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id
        and not exists(select 1 from public.ebay_sale_notification_receipts r where r.event_id=n.id and r.user_id=(select auth.uid()) and r.dismissed_at is not null)
      order by created_at desc,id desc limit 100 offset (p_page-1)*100) n
    left join public.ebay_sale_drafts d on d.workspace_id=n.workspace_id and d.environment=n.environment and d.source_key=n.source_key
    left join public.ebay_sale_notification_receipts r on r.event_id=n.id and r.user_id=(select auth.uid()));
end;
$$;
revoke all on function public.ebay_sale_notifications_read(uuid,uuid,integer) from public,anon;
grant execute on function public.ebay_sale_notifications_read(uuid,uuid,integer) to authenticated;

create function public.ebay_sale_notification_update(p_workspace_id uuid,p_connection_id uuid,p_event_id bigint,p_action text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_connection public.ebay_connections;
begin
  v_connection:=public.ebay_lock_import_connection((select auth.uid()),p_workspace_id,p_connection_id);
  if not public.can_access_workspace(p_workspace_id) then raise exception 'Zugriff verweigert' using errcode='42501'; end if;
  if p_action is null or p_action not in ('read','unread','dismiss') then raise exception 'Ungültige Aktion' using errcode='22023'; end if;
  if not exists(select 1 from public.ebay_sale_notifications where id=p_event_id and workspace_id=p_workspace_id and environment=v_connection.environment and external_account_id=v_connection.external_account_id)
    then raise exception 'Privater Kontozugriff verweigert' using errcode='42501'; end if;
  insert into public.ebay_sale_notification_receipts(event_id,user_id,read_at,dismissed_at)
    values(p_event_id,(select auth.uid()),case when p_action in ('read','dismiss') then clock_timestamp() end,case when p_action='dismiss' then clock_timestamp() end)
    on conflict(event_id,user_id) do update set read_at=excluded.read_at,dismissed_at=coalesce(excluded.dismissed_at,public.ebay_sale_notification_receipts.dismissed_at);
  return true;
end;
$$;
revoke all on function public.ebay_sale_notification_update(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.ebay_sale_notification_update(uuid,uuid,bigint,text) to authenticated;

-- Bestätigte Anbieter-Löschung entfernt private Inhalte. Die interne Menge bleibt
-- mit ihrem Besitzer bestehen und darf nur bewusst über den Bestandsweg geklärt werden.
create or replace function public.ebay_delete_account(p_environment text,p_external_account_id text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.ebay_connections where environment=p_environment and external_account_id=p_external_account_id order by id for update;
  delete from public.ebay_sale_notifications where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_cached_orders where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_cached_listings where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_cache_scans where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_order_observations where environment=p_environment and external_account_id=p_external_account_id;
  update public.ebay_sale_drafts set external_account_id='deleted:'||id::text,order_id='',source='{}'::jsonb,
    costs='{"platformFeeCents":null,"shippingCostCents":null,"shippingMode":null,"additionalCosts":[]}'::jsonb,
    state=case when state in ('booked','linked_existing','dismissed') then state else 'blocked' end,
    resolution_reason='Anbieterkonto gelöscht; interne Reservierung bewusst klären',updated_at=clock_timestamp()
    where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_article_mappings where environment=p_environment and external_account_id=p_external_account_id;
  delete from public.ebay_connections where environment=p_environment and external_account_id=p_external_account_id;
end;
$$;
