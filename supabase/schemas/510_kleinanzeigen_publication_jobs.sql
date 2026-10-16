-- Dauerhafte konto- und revisionsgebundene Veröffentlichungsaufträge; keine Anbieteraktion aus SQL.
create table public.kleinanzeigen_publication_jobs (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 connection_id bigint not null,
 draft_id uuid not null,
 requested_by uuid not null references auth.users(id),
 request_id uuid not null,
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 draft_revision bigint not null check(draft_revision between 1 and 9007199254740991),
 grant_generation bigint not null check(grant_generation between 1 and 9007199254740991),
 external_account_id text not null check(external_account_id ~ '^[1-9][0-9]{0,31}$'),
 immutable_snapshot jsonb not null check(jsonb_typeof(immutable_snapshot)='object' and octet_length(immutable_snapshot::text)<=300000),
 state text not null default 'queued' check(state in ('queued','claimed','writing','confirmed','failed','outcome_unknown','cancelled','needs_user_action')),
 version bigint not null default 1 check(version between 1 and 9007199254740991),
 claim_token_hash text check(claim_token_hash ~ '^[a-f0-9]{64}$'),
 claim_installation_hash text check(claim_installation_hash ~ '^[a-f0-9]{64}$'),
 lease_until timestamptz,
 absolute_expires_at timestamptz,
 started_at timestamptz,
 completed_at timestamptz,
 external_id text check(external_id ~ '^[1-9][0-9]{0,31}$'),
 provider_state text check(provider_state in ('active','processing')),
 verified_at timestamptz,
 error_code text check(error_code ~ '^[a-z_]{1,80}$'),
 provider_result jsonb check(provider_result is null or jsonb_typeof(provider_result)='object' and octet_length(provider_result::text)<=4096),
 quota_position integer not null check(quota_position>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,requested_by,request_id),
 foreign key(workspace_id,connection_id) references public.kleinanzeigen_connections(workspace_id,id),
 foreign key(workspace_id,draft_id) references public.listings(workspace_id,id),
 check(state<>'confirmed' or external_id is not null and provider_state='active' and verified_at is not null and started_at is not null),
 check((provider_state is null)=(external_id is null))
);
comment on table public.kleinanzeigen_publication_jobs is 'Unveränderliche Entwurfs- und private Fotoaufnahme mit Kontofreigabe, Kontingentreservierung und einmaligem Schreibbeginn; kein Erfolg aus einem Klick.';
create index kleinanzeigen_jobs_requester on public.kleinanzeigen_publication_jobs(requested_by);
create index kleinanzeigen_jobs_scope on public.kleinanzeigen_publication_jobs(workspace_id,connection_id,created_at desc);
create unique index kleinanzeigen_jobs_one_unresolved_draft on public.kleinanzeigen_publication_jobs(draft_id) where state in ('queued','claimed','writing','outcome_unknown');
create unique index kleinanzeigen_jobs_one_account_writer on public.kleinanzeigen_publication_jobs(workspace_id,connection_id) where state in ('claimed','writing','outcome_unknown');
alter table public.kleinanzeigen_publication_jobs enable row level security;
revoke all on public.kleinanzeigen_publication_jobs from public,anon,authenticated;
grant all on public.kleinanzeigen_publication_jobs to service_role;
revoke all on sequence public.kleinanzeigen_publication_jobs_id_seq from public,anon,authenticated;
grant usage,select on sequence public.kleinanzeigen_publication_jobs_id_seq to service_role;
create policy "Kleinanzeigen-Aufträge serverseitig lesen" on public.kleinanzeigen_publication_jobs for select to service_role using(true);
create policy "Kleinanzeigen-Aufträge serverseitig anlegen" on public.kleinanzeigen_publication_jobs for insert to service_role with check(true);
create policy "Kleinanzeigen-Aufträge serverseitig ändern" on public.kleinanzeigen_publication_jobs for update to service_role using(true) with check(true);
create policy "Kleinanzeigen-Aufträge serverseitig löschen" on public.kleinanzeigen_publication_jobs for delete to service_role using(true);
create trigger "00_protect_archived_workspace" before insert or update or delete on public.kleinanzeigen_publication_jobs for each row execute function public.protect_archived_workspace_data();

create or replace function public.kleinanzeigen_protect_publication_job()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
 if row(new.id,new.workspace_id,new.connection_id,new.draft_id,new.requested_by,new.request_id,new.request_hash,new.draft_revision,new.grant_generation,new.external_account_id,new.immutable_snapshot,new.created_at) is distinct from row(old.id,old.workspace_id,old.connection_id,old.draft_id,old.requested_by,old.request_id,old.request_hash,old.draft_revision,old.grant_generation,old.external_account_id,old.immutable_snapshot,old.created_at) then raise exception 'Angenommener Veröffentlichungsinhalt ist unveränderlich.' using errcode='22023';end if;
 new.version:=old.version+1;new.updated_at:=clock_timestamp();return new;
end;
$$;
revoke all on function public.kleinanzeigen_protect_publication_job() from public,anon,authenticated,service_role;
create trigger kleinanzeigen_jobs_protect_snapshot before update on public.kleinanzeigen_publication_jobs for each row execute function public.kleinanzeigen_protect_publication_job();

create or replace function public.kleinanzeigen_job_document(p_job public.kleinanzeigen_publication_jobs)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',p_job.id::text,'workspaceId',p_job.workspace_id,'connectionId',p_job.connection_id::text,'draftId',p_job.draft_id,'draftRevision',p_job.draft_revision,'grantGeneration',p_job.grant_generation,'requestedBy',p_job.requested_by,'immutableSnapshot',p_job.immutable_snapshot,'state',p_job.state,'version',p_job.version,'externalId',p_job.external_id,'providerState',p_job.provider_state,'verifiedAt',p_job.verified_at,'errorCode',p_job.error_code,'createdAt',p_job.created_at,'updatedAt',p_job.updated_at);
$$;
revoke all on function public.kleinanzeigen_job_document(public.kleinanzeigen_publication_jobs) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_job_document(public.kleinanzeigen_publication_jobs) to service_role;

create or replace function public.kleinanzeigen_quota_capacity(p_workspace_id uuid,p_connection_id bigint,p_excluded_job_id bigint default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_connection public.kleinanzeigen_connections;v_reserved integer;v_now timestamptz:=clock_timestamp();
begin
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id;
 -- Bestätigte Aufträge bleiben vorgemerkt, bis der frische offizielle Zähler ihre erwartete Position erreicht.
 -- Aktive Anzeigen oder eine Kontolöschung reduzieren den 30-Tage-Zähler niemals eigenständig.
 select count(*)::integer into v_reserved from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and connection_id=p_connection_id and (p_excluded_job_id is null or id<>p_excluded_job_id) and (state in ('queued','claimed','writing','outcome_unknown') or state='confirmed' and started_at>v_now-interval '30 days' and quota_position>coalesce(v_connection.quota_used,-1));
 return jsonb_build_object('used',v_connection.quota_used,'observedAt',v_connection.quota_observed_at,'reserved',v_reserved,'allowed',v_connection.id is not null and v_connection.account_type='private' and v_connection.status='connected' and v_connection.quota_used is not null and v_connection.quota_observed_at between v_now-interval '60 seconds' and v_now+interval '5 seconds' and v_connection.quota_used+v_reserved<100,'reason',case when v_connection.account_type is distinct from 'private' or v_connection.quota_used is null or v_connection.quota_observed_at is null or v_connection.quota_observed_at<v_now-interval '60 seconds' or v_connection.quota_observed_at>v_now+interval '5 seconds' then 'quota_unknown' when v_connection.quota_used+v_reserved>=100 then 'quota_exhausted' else null end);
end;
$$;
revoke all on function public.kleinanzeigen_quota_capacity(uuid,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_quota_capacity(uuid,bigint,bigint) to service_role;

-- Definer wird ausschließlich zum Lesen der vorhandenen privaten Entwurfs-/Bildtabellen benötigt.
-- p_user_id kommt aus der echten JWT-Prüfung des serverseitigen Nutzerendpoints, nie ungeprüft aus dessen Body.
create or replace function public.kleinanzeigen_prepare_listing_job(p_workspace_id uuid,p_connection_id bigint,p_draft_id uuid,p_expected_revision bigint,p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_connection public.kleinanzeigen_connections;v_grant public.kleinanzeigen_local_grants;v_listing public.listings;v_schema public.kleinanzeigen_form_schemas;v_images jsonb;v_content jsonb;v_field jsonb;v_key text;v_value text;v_methods jsonb;v_shipping jsonb;v_method jsonb;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Veröffentlichung nicht freigegeben.' using errcode='42501';end if;
 perform 1 from public.workspaces where id=p_workspace_id and archived_at is null for share;if not found then raise exception 'Arbeitsbereich nicht verfügbar.' using errcode='42501';end if;
 select * into v_connection from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id and status='connected' and account_type='private' for update;
 if not found then raise exception 'Privates Zielkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_grant from public.kleinanzeigen_local_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and approved_by=p_user_id and can_publish and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Ausdrückliche lokale Veröffentlichungsfreigabe fehlt.' using errcode='42501';end if;
 select * into v_listing from public.listings where workspace_id=p_workspace_id and id=p_draft_id and target_connection_id=p_connection_id and source_reference is not null for update;
 if not found then raise exception 'Entwurf nicht verfügbar.' using errcode='42501';end if;
 if v_listing.revision is distinct from p_expected_revision then raise exception 'Entwurf inzwischen geändert.' using errcode='40001';end if;
 if v_listing.status<>'prepared' or not v_listing.transfer_images_complete or not v_listing.image_selection_saved or v_listing.postal_code is null or v_listing.price<>trunc(v_listing.price) or v_listing.price>99999999 or char_length(btrim(v_listing.description))=0 or v_listing.shipping_type not in ('pickup','both') or v_listing.shipping_price is not null then raise exception 'Zielfassung noch nicht vollständig geprüft.' using errcode='22023';end if;
 if not exists(select 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id::text=v_listing.source_reference->>'connectionId' and id::text=v_listing.source_reference->>'entryId' and external_id=v_listing.source_reference->>'externalId' and kind='publication') then raise exception 'Quellbezug nicht mehr bestätigt.' using errcode='42501';end if;
 select * into v_schema from public.kleinanzeigen_form_schemas where workspace_id=p_workspace_id and connection_id=p_connection_id and category_path=v_listing.category_id and schema_revision=v_listing.schema_revision and grant_generation=v_grant.grant_generation and observed_at between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '5 seconds';
 if not found or split_part(v_schema.category_path,'/',1)<>'153' then raise exception 'Aktuelle Bekleidungskategorie fehlt.' using errcode='22023';end if;
 for v_field in select * from jsonb_array_elements(v_schema.provider_schema->'fields') loop
  v_key:=v_field->>'key';v_value:=v_listing.category_fields->>v_key;
  if ((v_field->>'required')::boolean or v_key like '%.condition') and coalesce(btrim(v_value),'')='' then raise exception 'Kategorieangabe fehlt.' using errcode='22023';end if;
  if coalesce(v_value,'')<>'' and (char_length(v_value)>200 or v_field->>'kind'='select' and not exists(select 1 from jsonb_array_elements(v_field->'choices') choice where choice->>'value'=v_value)) then raise exception 'Kategorieangabe nicht angeboten.' using errcode='22023';end if;
 end loop;
 for v_key in select jsonb_object_keys(v_listing.category_fields) loop
  if v_key not in ('ad-shipping-package-size','ad-shipping-options') and not exists(select 1 from jsonb_array_elements(v_schema.provider_schema->'fields') field where field->>'key'=v_key) then raise exception 'Veraltete Kategorieangabe.' using errcode='22023';end if;
 end loop;
 if v_listing.shipping_type='both' then
  select value into v_shipping from jsonb_array_elements(v_schema.provider_schema->'shipping'->'groups') where value->>'value'=v_listing.category_fields->>'ad-shipping-package-size';
  begin v_methods:=(v_listing.category_fields->>'ad-shipping-options')::jsonb;exception when invalid_text_representation then raise exception 'Versandmethoden nicht bestätigt.' using errcode='22023';end;
  if v_shipping is null or jsonb_typeof(v_methods) is distinct from 'array' or jsonb_array_length(v_methods) not between 1 and 20 or (select count(distinct value) from jsonb_array_elements(v_methods))<>jsonb_array_length(v_methods) then raise exception 'Versandmethoden nicht bestätigt.' using errcode='22023';end if;
  for v_method in select * from jsonb_array_elements(v_methods) loop
   if jsonb_typeof(v_method)<>'string' or not exists(select 1 from jsonb_array_elements(v_shipping->'choices') choice where choice->'value'=v_method) then raise exception 'Versandmethode nicht angeboten.' using errcode='22023';end if;
  end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('imageId',image.id,'storagePath',image.storage_path,'fileName',coalesce(image.file_name,'Bild'),'mimeType',object.metadata->>'mimetype','byteSize',(object.metadata->>'size')::bigint,'sortOrder',image.sort_order) order by image.sort_order,image.id),'[]'::jsonb) into v_images from public.listing_images image left join storage.objects object on object.bucket_id='item-media' and object.name=image.storage_path where image.workspace_id=p_workspace_id and image.listing_id=p_draft_id;
 if jsonb_array_length(v_images) not between 1 and 20 or exists(select 1 from jsonb_array_elements(v_images) image where image->>'storagePath' !~ ('^listings/'||p_workspace_id::text||'/'||p_draft_id::text||'/[a-f0-9-]+\.(jpg|jpeg|png|webp)$') or coalesce(image->>'mimeType','') not in ('image/jpeg','image/png','image/webp') or image->>'byteSize' is null or (image->>'byteSize')::bigint not between 1 and 12582912) then raise exception 'Gesicherte Bilder nicht vollständig verfügbar.' using errcode='22023';end if;
 v_content:=jsonb_build_object('title',v_listing.title,'description',v_listing.description,'priceCents',v_listing.price*100,'currency','EUR','priceType',v_listing.price_type,'shippingType',v_listing.shipping_type,'shippingPriceCents',null,'postalCode',v_listing.postal_code,'categoryId',v_listing.category_id,'categoryFields',v_listing.category_fields,'schemaRevision',v_listing.schema_revision);
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'draftId',p_draft_id,'draftRevision',v_listing.revision,'grantGeneration',v_grant.grant_generation,'externalAccountId',v_connection.external_account_id,'content',v_content,'images',v_images);
end;
$$;
revoke all on function public.kleinanzeigen_prepare_listing_job(uuid,bigint,uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_prepare_listing_job(uuid,bigint,uuid,bigint,uuid) to service_role;

create or replace function public.kleinanzeigen_enqueue_listing(p_workspace_id uuid,p_connection_id bigint,p_draft_id uuid,p_expected_revision bigint,p_request_id uuid,p_user_id uuid,p_photos jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_job public.kleinanzeigen_publication_jobs;v_snapshot jsonb;v_request_hash text;v_photo jsonb;v_image jsonb;v_index integer:=0;v_capacity jsonb;
begin
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Veröffentlichung nicht freigegeben.' using errcode='42501';end if;
 if p_request_id is null or p_expected_revision is null or jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'Ungültiger Auftrag.' using errcode='22023';end if;
 -- Konto sperrt Reservierungen und Wiederholungen auch bei mehreren gleichzeitigen Endpunktaufrufen.
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_connection_id for update;if not found then raise exception 'Zielkonto nicht verfügbar.' using errcode='42501';end if;
 v_request_hash:=encode(extensions.digest(jsonb_build_object('connectionId',p_connection_id::text,'draftId',p_draft_id,'draftRevision',p_expected_revision,'images',(select jsonb_agg(value-'storagePath' order by ordinal) from jsonb_array_elements(p_photos) with ordinality entry(value,ordinal)))::text,'sha256'),'hex');
 select * into v_job from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and requested_by=p_user_id and request_id=p_request_id;
 if found then if v_job.request_hash<>v_request_hash then raise exception 'Request-ID gehört zu anderer Fassung.' using errcode='40001';end if;return public.kleinanzeigen_job_document(v_job);end if;
 if exists(select 1 from public.kleinanzeigen_publication_jobs where workspace_id=p_workspace_id and draft_id=p_draft_id and state in ('queued','claimed','writing','outcome_unknown')) then raise exception 'Für diesen Entwurf besteht bereits ein offener Auftrag.' using errcode='40001';end if;
 v_snapshot:=public.kleinanzeigen_prepare_listing_job(p_workspace_id,p_connection_id,p_draft_id,p_expected_revision,p_user_id);
 if jsonb_array_length(p_photos)<>jsonb_array_length(v_snapshot->'images') then raise exception 'Auftragsbilder nicht vollständig.' using errcode='22023';end if;
 for v_photo in select * from jsonb_array_elements(p_photos) loop
  v_image:=v_snapshot->'images'->v_index;
  if jsonb_typeof(v_photo)<>'object' or (select count(*) from jsonb_object_keys(v_photo))<>6 or v_photo->>'imageId' is distinct from v_image->>'imageId' or v_photo->>'storagePath' !~ ('^kleinanzeigen-jobs/'||p_workspace_id::text||'/'||p_request_id::text||'/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/'||(v_image->>'imageId')||'\.(jpg|png|webp)$') or v_photo->>'mimeType' is distinct from v_image->>'mimeType' or v_photo->>'byteSize' is distinct from v_image->>'byteSize' or coalesce(v_photo->>'sha256','') !~ '^[a-f0-9]{64}$' or char_length(coalesce(v_photo->>'fileName','')) not between 1 and 255 or not exists(select 1 from storage.objects where bucket_id='item-media' and name=v_photo->>'storagePath' and metadata->>'mimetype'=v_photo->>'mimeType' and metadata->>'size'=v_photo->>'byteSize') then raise exception 'Private Auftragsbilder nicht bestätigt.' using errcode='22023';end if;
  v_index:=v_index+1;
 end loop;
 v_capacity:=public.kleinanzeigen_quota_capacity(p_workspace_id,p_connection_id);
 if v_capacity->>'allowed' is distinct from 'true' then raise exception 'Kontingent nicht sicher frei: %',v_capacity->>'reason' using errcode='55000';end if;
 v_snapshot:=v_snapshot||jsonb_build_object('images',p_photos);
 insert into public.kleinanzeigen_publication_jobs(workspace_id,connection_id,draft_id,requested_by,request_id,request_hash,draft_revision,grant_generation,external_account_id,immutable_snapshot,quota_position) values(p_workspace_id,p_connection_id,p_draft_id,p_user_id,p_request_id,v_request_hash,p_expected_revision,(v_snapshot->>'grantGeneration')::bigint,v_snapshot->>'externalAccountId',v_snapshot,(v_capacity->>'used')::integer+(v_capacity->>'reserved')::integer+1) returning * into v_job;
 return public.kleinanzeigen_job_document(v_job);
end;
$$;
revoke all on function public.kleinanzeigen_enqueue_listing(uuid,bigint,uuid,bigint,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_enqueue_listing(uuid,bigint,uuid,bigint,uuid,uuid,jsonb) to service_role;

