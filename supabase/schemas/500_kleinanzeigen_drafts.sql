-- Bestehende Kleinanzeigen-Entwürfe um geprüfte Vinted-Quelle, Zielkonto und Revision erweitern.
alter table public.listings
 add column target_connection_id bigint,
 add column source_reference jsonb,
 add column revision bigint not null default 1 check(revision>0),
 add column category_id text check(category_id is null or char_length(category_id) between 1 and 160),
 add column category_fields jsonb not null default '{}'::jsonb check(jsonb_typeof(category_fields)='object'),
 add column schema_revision text check(schema_revision is null or char_length(schema_revision) between 1 and 128),
 add column transfer_request_id uuid;
alter table public.listings add constraint listings_target_connection_fkey foreign key(workspace_id,target_connection_id) references public.kleinanzeigen_connections(workspace_id,id);
-- Nur die bisherige Zuordnungsprüfung wird ersetzt; bestehende Artikel- und Produktentwürfe bleiben gültig.
alter table public.listings drop constraint listings_target_check;
alter table public.listings add constraint listings_target_check check(
 (inventory_item_id is not null and catalog_product_id is null and source_reference is null and target_connection_id is null)
 or (inventory_item_id is null and catalog_product_id is not null and source_reference is null and target_connection_id is null)
 or (inventory_item_id is null and catalog_product_id is null and target_connection_id is not null and transfer_request_id is not null
 and jsonb_typeof(source_reference)='object' and source_reference->>'platform'='vinted' and source_reference->>'workspaceId'=workspace_id::text
 and source_reference->>'fingerprint' ~ '^[a-f0-9]{64}$'));
create index listings_target_connection on public.listings(workspace_id,target_connection_id);
create unique index listings_transfer_request on public.listings(workspace_id,transfer_request_id) where transfer_request_id is not null;
create unique index listings_transfer_open_source on public.listings(workspace_id,target_connection_id,(source_reference->>'connectionId'),(source_reference->>'externalId'),(source_reference->>'fingerprint')) where source_reference is not null and status<>'ended';
alter policy "Inseratsinhalt ändern" on public.listings using ((select public.is_workspace_member(workspace_id)) and source_reference is null) with check ((select public.is_workspace_member(workspace_id)) and source_reference is null);

create or replace function public.kleinanzeigen_increment_draft_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=old.revision+1;return new;end;
$$;
revoke all on function public.kleinanzeigen_increment_draft_revision() from public,anon,authenticated,service_role;
create trigger listings_increment_revision before update on public.listings for each row execute function public.kleinanzeigen_increment_draft_revision();

create or replace function public.kleinanzeigen_validate_draft_content(p_content jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_base jsonb; v_key text;v_value jsonb;
begin
 if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_content->'priceCents') is distinct from 'number' or p_content->>'priceCents' !~ '^[0-9]+$' or (p_content->>'priceCents')::numeric>9999999900 or p_content->>'currency' is distinct from 'EUR' or jsonb_typeof(p_content->'categoryFields') is distinct from 'object' then raise exception 'Ungültige Kleinanzeigen-Fassung.' using errcode='22023';end if;
 if (p_content->>'categoryId' is not null and char_length(p_content->>'categoryId') not between 1 and 160) or (p_content->>'schemaRevision' is not null and char_length(p_content->>'schemaRevision') not between 1 and 128) or (select count(*) from jsonb_object_keys(p_content->'categoryFields'))>50 then raise exception 'Ungültige Kategorie.' using errcode='22023';end if;
 for v_key,v_value in select * from jsonb_each(p_content->'categoryFields') loop
  if char_length(v_key) not between 1 and 160 or jsonb_typeof(v_value)<>'string' or char_length(v_value#>>'{}')>500 then raise exception 'Ungültige Kategorieeigenschaft.' using errcode='22023';end if;
 end loop;
 v_base:=public.validate_listing_content(p_content||jsonb_build_object('price',round((p_content->>'priceCents')::numeric/100,2),'shippingPrice',case when p_content->>'shippingPriceCents' is null then null else round((p_content->>'shippingPriceCents')::numeric/100,2) end));
 return v_base||jsonb_build_object('categoryId',p_content->'categoryId','categoryFields',p_content->'categoryFields','schemaRevision',p_content->'schemaRevision');
end;
$$;
revoke all on function public.kleinanzeigen_validate_draft_content(jsonb) from public,anon,authenticated,service_role;

-- Definer wird nur für die kontrollierten neuen Spalten und die geschützte Quellprüfung benötigt.
create or replace function public.kleinanzeigen_create_transfer_draft(p_workspace_id uuid,p_target_connection_id bigint,p_source_reference jsonb,p_content jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_content jsonb;v_source public.marketplace_account_entries;v_account public.marketplace_connections;v_listing public.listings;v_fingerprint text;
begin
 if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diesen Transfer.' using errcode='42501';end if;
 perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for share;
 if not found then raise exception 'Arbeitsbereich nicht verfügbar.' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_source_reference) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_source_reference))<>6 or p_source_reference->>'platform' is distinct from 'vinted' or p_source_reference->>'workspaceId' is distinct from p_workspace_id::text then raise exception 'Ungültiger Quellbezug.' using errcode='22023';end if;
 select * into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id::text=p_source_reference->>'connectionId' and marketplace='vinted' and status='connected' and external_account_id is not null for share;
 select * into v_source from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=v_account.id and id::text=p_source_reference->>'entryId' and external_id=p_source_reference->>'externalId' and kind='publication' for share;
 v_fingerprint:=encode(extensions.digest(((v_source.body->'transferSource')-'observedAt')::text,'sha256'),'hex');
 if v_source.id is null or jsonb_typeof(v_source.body->'transferSource') is distinct from 'object' or v_source.body->'transferSource'->>'externalAccountId' is distinct from v_account.external_account_id or v_fingerprint is distinct from p_source_reference->>'fingerprint' then raise exception 'Vollständige Quelle nicht bestätigt.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_target_connection_id and status<>'disconnected' for share;
 if not found then raise exception 'Zielkonto nicht verfügbar.' using errcode='42501';end if;
 v_content:=public.kleinanzeigen_validate_draft_content(p_content);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':ka-draft:'||p_target_connection_id::text||':'||v_account.id::text||':'||v_source.external_id,0));
 select * into v_listing from public.listings where workspace_id=p_workspace_id and transfer_request_id=p_request_id;
 if found then
  if v_listing.target_connection_id<>p_target_connection_id or v_listing.source_reference is distinct from p_source_reference then raise exception 'Request-ID gehört zu anderem Transfer.' using errcode='40001';end if;
  return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);
 end if;
 select * into v_listing from public.listings where workspace_id=p_workspace_id and target_connection_id=p_target_connection_id and source_reference=p_source_reference and status<>'ended';
 if found then return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);end if;
 insert into public.listings(workspace_id,target_connection_id,source_reference,transfer_request_id,title,description,price,price_type,shipping_type,shipping_price,postal_code,item_details,category_id,category_fields,schema_revision)
 values(p_workspace_id,p_target_connection_id,p_source_reference,p_request_id,v_content->>'title',v_content->>'description',(v_content->>'price')::numeric,v_content->>'priceType',v_content->>'shippingType',(v_content->>'shippingPrice')::numeric,v_content->>'postalCode',v_content->'itemDetails',v_content->>'categoryId',v_content->'categoryFields',v_content->>'schemaRevision') returning * into v_listing;
 return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);
end;
$$;
revoke all on function public.kleinanzeigen_create_transfer_draft(uuid,bigint,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_create_transfer_draft(uuid,bigint,jsonb,jsonb,uuid) to authenticated;

create or replace function public.kleinanzeigen_update_draft(p_id uuid,p_expected_revision bigint,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_listing public.listings;v_content jsonb;
begin
 select * into v_listing from public.listings where id=p_id;
 if not found or v_listing.source_reference is null or not public.marketplace_can_manage(v_listing.workspace_id) or not public.marketplace_sync_authorization_valid(v_listing.workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diese Fassung.' using errcode='42501';end if;
 perform 1 from public.workspaces where id=v_listing.workspace_id and archived_at is null for share;
 if not found then raise exception 'Arbeitsbereich nicht verfügbar.' using errcode='42501';end if;
 select * into v_listing from public.listings where id=p_id for update;
 if p_expected_revision is distinct from v_listing.revision then raise exception 'Die Fassung wurde inzwischen geändert. Lade sie erneut.' using errcode='40001';end if;
 if v_listing.status<>'prepared' then raise exception 'Nur Entwürfe können geändert werden.' using errcode='22023';end if;
 v_content:=public.kleinanzeigen_validate_draft_content(p_content);
 update public.listings set title=v_content->>'title',description=v_content->>'description',price=(v_content->>'price')::numeric,price_type=v_content->>'priceType',shipping_type=v_content->>'shippingType',shipping_price=(v_content->>'shippingPrice')::numeric,postal_code=v_content->>'postalCode',item_details=v_content->'itemDetails',category_id=v_content->>'categoryId',category_fields=v_content->'categoryFields',schema_revision=v_content->>'schemaRevision' where id=p_id returning * into v_listing;
 return to_jsonb(v_listing)||jsonb_build_object('target_connection_id',v_listing.target_connection_id::text);
end;
$$;
revoke all on function public.kleinanzeigen_update_draft(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_update_draft(uuid,bigint,jsonb) to authenticated;
