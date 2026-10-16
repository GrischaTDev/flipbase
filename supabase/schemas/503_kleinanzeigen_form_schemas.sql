-- Kontogebundene aktuelle Anbieterfelder; keine vom Frontend erfundenen Veröffentlichungsschemata.
create table public.kleinanzeigen_form_schemas (
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 connection_id bigint not null,
 category_path text not null check(category_path ~ '^[1-9][0-9]*(/[a-z0-9_]+){0,5}$' and char_length(category_path)<=160),
 schema_revision text not null check(schema_revision ~ '^[a-f0-9]{64}$'),
 provider_schema jsonb not null check(jsonb_typeof(provider_schema)='object'),
 grant_generation bigint not null check(grant_generation>0),
 observed_at timestamptz not null,
 unique(workspace_id,connection_id,category_path),
 foreign key(workspace_id,connection_id) references public.kleinanzeigen_connections(workspace_id,id) on delete cascade
);
comment on table public.kleinanzeigen_form_schemas is 'Aus dem gebundenen Browserprofil gelesene Kleinanzeigen-Felder mit Inhaltsrevision und Beobachtungszeit; keine Cookies oder Installationssecrets.';
alter table public.kleinanzeigen_form_schemas enable row level security;
revoke all on public.kleinanzeigen_form_schemas from public,anon,authenticated;
grant select on public.kleinanzeigen_form_schemas to authenticated;
grant all on public.kleinanzeigen_form_schemas to service_role;
revoke all on sequence public.kleinanzeigen_form_schemas_id_seq from public,anon,authenticated;
grant usage,select on sequence public.kleinanzeigen_form_schemas_id_seq to service_role;
create policy "Eigene Kleinanzeigen-Formulare lesen" on public.kleinanzeigen_form_schemas for select to authenticated using(public.marketplace_can_manage(workspace_id));
create policy "Kleinanzeigen-Formulare serverseitig lesen" on public.kleinanzeigen_form_schemas for select to service_role using(true);
create policy "Kleinanzeigen-Formulare serverseitig anlegen" on public.kleinanzeigen_form_schemas for insert to service_role with check(true);
create policy "Kleinanzeigen-Formulare serverseitig ändern" on public.kleinanzeigen_form_schemas for update to service_role using(true) with check(true);
create policy "Kleinanzeigen-Formulare serverseitig löschen" on public.kleinanzeigen_form_schemas for delete to service_role using(true);
create trigger "00_protect_archived_workspace" before insert or update or delete on public.kleinanzeigen_form_schemas for each row execute function public.protect_archived_workspace_data();

create or replace function public.kleinanzeigen_store_form_schema(p_workspace_id uuid,p_connection_id bigint,p_token_hash text,p_generation bigint,p_external_account_id text,p_schema jsonb,p_observed_at timestamptz)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_session jsonb;v_schema public.kleinanzeigen_form_schemas;v_revision text;
begin
 v_session:=public.kleinanzeigen_extension_session(p_workspace_id,p_connection_id,p_token_hash,p_generation);
 if v_session->>'externalAccountId' is distinct from p_external_account_id or p_generation is null then raise exception 'Falsches Formularkonto.' using errcode='42501';end if;
 if p_observed_at is null or p_observed_at<clock_timestamp()-interval '60 seconds' or p_observed_at>clock_timestamp()+interval '5 seconds' or jsonb_typeof(p_schema) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_schema))<>9 or not (p_schema ?& array['categoryPath','categoryLabel','titleMax','descriptionMax','photoCountMax','photoBytesMax','priceStepCents','fields','shipping']) or p_schema->>'categoryPath' !~ '^[1-9][0-9]*(/[a-z0-9_]+){0,5}$' or char_length(p_schema->>'categoryPath')>160 or p_schema->>'titleMax' is distinct from '65' or p_schema->>'descriptionMax' is distinct from '4000' or p_schema->>'photoCountMax' is distinct from '20' or p_schema->>'photoBytesMax' is distinct from '12582912' or p_schema->>'priceStepCents' is distinct from '100' or jsonb_typeof(p_schema->'fields') is distinct from 'array' or jsonb_typeof(p_schema->'shipping') is distinct from 'object' then raise exception 'Ungültiger oder veralteter Formularbeleg.' using errcode='22023';end if;
 -- Inhaltlich prüft zusätzlich der Installationsendpoint jeden einzelnen Auswahlwert.
 v_revision:=encode(extensions.digest(p_schema::text,'sha256'),'hex');
 insert into public.kleinanzeigen_form_schemas(workspace_id,connection_id,category_path,schema_revision,provider_schema,grant_generation,observed_at) values(p_workspace_id,p_connection_id,p_schema->>'categoryPath',v_revision,p_schema,p_generation,p_observed_at)
 on conflict(workspace_id,connection_id,category_path) do update set schema_revision=excluded.schema_revision,provider_schema=excluded.provider_schema,grant_generation=excluded.grant_generation,observed_at=excluded.observed_at where public.kleinanzeigen_form_schemas.observed_at<=excluded.observed_at returning * into v_schema;
 if not found then raise exception 'Neuere Formularbeobachtung liegt bereits vor.' using errcode='40001';end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'connectionId',p_connection_id::text,'externalAccountId',p_external_account_id,'generation',p_generation,'categoryPath',v_schema.category_path,'categoryLabel',p_schema->>'categoryLabel','choices','[]'::jsonb,'schema',p_schema,'schemaRevision',v_revision,'observedAt',v_schema.observed_at);
end;
$$;
revoke all on function public.kleinanzeigen_store_form_schema(uuid,bigint,text,bigint,text,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_store_form_schema(uuid,bigint,text,bigint,text,jsonb,timestamptz) to service_role;
