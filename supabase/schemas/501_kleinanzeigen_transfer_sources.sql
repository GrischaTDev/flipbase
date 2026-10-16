-- Vollständige kontogebundene Vinted-Quellen im vorhandenen Inseratcache; keine zweite Quellenablage.
create or replace function public.kleinanzeigen_validate_transfer_source(p_source jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_photo jsonb;v_key text;v_value jsonb;
begin
 if jsonb_typeof(p_source) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_source))<>8 or not(p_source ?& array['externalAccountId','externalId','title','description','priceCents','currency','photoReferences','attributeHints']) or jsonb_typeof(p_source->'externalAccountId') is distinct from 'string' or jsonb_typeof(p_source->'externalId') is distinct from 'string' or p_source->>'externalAccountId' !~ '^[1-9][0-9]{0,31}$' or p_source->>'externalId' !~ '^[1-9][0-9]{0,31}$' or jsonb_typeof(p_source->'title') is distinct from 'string' or char_length(btrim(p_source->>'title')) not between 1 and 1000 or jsonb_typeof(p_source->'description') is distinct from 'string' or char_length(p_source->>'description')>100000 or jsonb_typeof(p_source->'currency') is distinct from 'string' or char_length(p_source->>'currency') not between 1 and 12 or not (p_source ? 'priceCents') or (p_source->>'priceCents' is not null and (jsonb_typeof(p_source->'priceCents')<>'number' or p_source->>'priceCents' !~ '^[0-9]+$' or (p_source->>'priceCents')::numeric>9999999900)) or jsonb_typeof(p_source->'photoReferences') is distinct from 'array' or jsonb_typeof(p_source->'attributeHints') is distinct from 'object' then raise exception 'Ungültige vollständige Quelle.' using errcode='22023';end if;
 if jsonb_array_length(p_source->'photoReferences') not between 1 and 40 or (select count(*) from jsonb_object_keys(p_source->'attributeHints'))>50 then raise exception 'Unvollständige Quelle.' using errcode='22023';end if;
 for v_photo in select * from jsonb_array_elements(p_source->'photoReferences') loop
  if jsonb_typeof(v_photo)<>'string' or char_length(v_photo#>>'{}')>2000 or (v_photo#>>'{}') !~ '^https://images[12]\.vinted\.net/[^#[:space:]]+$' then raise exception 'Ungültige Bildquelle.' using errcode='22023';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(p_source->'photoReferences'))<>jsonb_array_length(p_source->'photoReferences') then raise exception 'Doppelte Bildquelle.' using errcode='22023';end if;
 for v_key,v_value in select * from jsonb_each(p_source->'attributeHints') loop
  if char_length(v_key) not between 1 and 160 or jsonb_typeof(v_value)<>'string' or char_length(v_value#>>'{}')>500 then raise exception 'Ungültiger Quellhinweis.' using errcode='22023';end if;
 end loop;
 return p_source;
end;
$$;
revoke all on function public.kleinanzeigen_validate_transfer_source(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_validate_transfer_source(jsonb) to service_role;

create or replace function public.kleinanzeigen_store_transfer_source(p_workspace_id uuid,p_connection_id uuid,p_entry_id uuid,p_user_id uuid,p_source jsonb,p_mode text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_source jsonb;v_connection public.marketplace_connections;v_entry public.marketplace_account_entries;
begin
 v_source:=public.kleinanzeigen_validate_transfer_source(p_source);
 if not public.marketplace_sync_authorization_valid(p_workspace_id,p_user_id) or not public.marketplace_local_extension_user_valid(p_user_id) then raise exception 'Quellzugriff widerrufen.' using errcode='42501';end if;
 select * into v_connection from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' and status='connected' and execution_mode=p_mode for update;
 if not found or v_connection.external_account_id is distinct from v_source->>'externalAccountId' then raise exception 'Quellkonto nicht bestätigt.' using errcode='42501';end if;
 select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_entry_id and external_id=v_source->>'externalId' and kind='publication' for update;
 if not found then raise exception 'Eigenes Quellinserat nicht bestätigt.' using errcode='42501';end if;
 update public.marketplace_account_entries set body=body||jsonb_build_object('transferSource',v_source||jsonb_build_object('observedAt',clock_timestamp())) where id=p_entry_id;
 return jsonb_build_object('entryId',p_entry_id,'fingerprint',encode(extensions.digest(v_source::text,'sha256'),'hex'));
end;
$$;
revoke all on function public.kleinanzeigen_store_transfer_source(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_store_transfer_source(uuid,uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public.kleinanzeigen_cache_transfer_source(p_workspace_id uuid,p_connection_id uuid,p_entry_id uuid,p_user_id uuid,p_source jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select public.kleinanzeigen_store_transfer_source(p_workspace_id,p_connection_id,p_entry_id,p_user_id,p_source,'cloud');
$$;
revoke all on function public.kleinanzeigen_cache_transfer_source(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_cache_transfer_source(uuid,uuid,uuid,uuid,jsonb) to service_role;

-- Definer ermöglicht ausschließlich die gesperrte Nutzer-/Mitgliedschaftsprüfung; Quell- und Zielkonto werden ausdrücklich eingeschränkt.
create or replace function public.kleinanzeigen_read_transfer_source(p_workspace_id uuid,p_target_connection_id bigint,p_source_connection_id uuid,p_external_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_account public.marketplace_connections;v_entry public.marketplace_account_entries;v_source jsonb;
begin
 if not public.marketplace_can_manage(p_workspace_id) or not public.marketplace_sync_authorization_valid(p_workspace_id,(select auth.uid())) or not public.marketplace_local_extension_user_valid((select auth.uid())) then raise exception 'Kein Zugriff auf diesen Transfer.' using errcode='42501';end if;
 perform 1 from public.kleinanzeigen_connections where workspace_id=p_workspace_id and id=p_target_connection_id and status<>'disconnected';if not found then raise exception 'Zielkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_source_connection_id and marketplace='vinted' and status='connected' and external_account_id is not null;
 if not found then raise exception 'Quellkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_entry from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_source_connection_id and external_id=p_external_id and kind='publication';
 if not found then raise exception 'Quellinserat nicht verfügbar.' using errcode='42501';end if;
 v_source:=v_entry.body->'transferSource';
 if v_source is null or v_source->>'externalAccountId' is distinct from v_account.external_account_id or v_source->>'externalId' is distinct from p_external_id or (v_source->>'observedAt')::timestamptz<clock_timestamp()-interval '24 hours' then return jsonb_build_object('state','needs_source','workspaceId',p_workspace_id,'connectionId',p_source_connection_id,'entryId',v_entry.id,'externalId',p_external_id,'externalAccountId',v_account.external_account_id,'executionMode',v_account.execution_mode);end if;
 return jsonb_build_object('state','ready','workspaceId',p_workspace_id,'connectionId',p_source_connection_id,'entryId',v_entry.id,'externalId',p_external_id,'externalAccountId',v_account.external_account_id,'executionMode',v_account.execution_mode,'source',v_source-'observedAt','observedAt',v_source->'observedAt','fingerprint',encode(extensions.digest((v_source-'observedAt')::text,'sha256'),'hex'));
end;
$$;
revoke all on function public.kleinanzeigen_read_transfer_source(uuid,bigint,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_read_transfer_source(uuid,bigint,uuid,text) to authenticated;

create or replace function public.kleinanzeigen_local_transfer_source(p_workspace_id uuid,p_connection_id uuid,p_token_hash text,p_entry_id uuid,p_external_id text,p_generation bigint default null,p_source jsonb default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_account public.marketplace_connections;v_grant public.marketplace_local_extension_grants;v_result jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(91731,1);
 select * into v_account from public.marketplace_connections where workspace_id=p_workspace_id and id=p_connection_id and marketplace='vinted' and execution_mode='local' and status='connected' for update;
 if not found then raise exception 'Lokales Quellkonto nicht verfügbar.' using errcode='42501';end if;
 select * into v_grant from public.marketplace_local_extension_grants where workspace_id=p_workspace_id and connection_id=p_connection_id and token_hash=p_token_hash for update;
 if not found or v_grant.revoked_at is not null or v_grant.expires_at<=clock_timestamp() or v_grant.external_account_id is distinct from v_account.external_account_id or not public.marketplace_sync_authorization_valid(p_workspace_id,v_grant.approved_by) or not public.marketplace_local_extension_user_valid(v_grant.approved_by) then raise exception 'Lokale Quellfreigabe ungültig.' using errcode='42501';end if;
 perform 1 from public.marketplace_account_entries where workspace_id=p_workspace_id and connection_id=p_connection_id and id=p_entry_id and external_id=p_external_id and kind='publication' for share;
 if not found then raise exception 'Eigenes Quellinserat nicht bestätigt.' using errcode='42501';end if;
 v_result:=jsonb_build_object('ok',true,'workspaceId',p_workspace_id,'connectionId',p_connection_id,'entryId',p_entry_id,'externalId',p_external_id,'externalAccountId',v_account.external_account_id,'generation',v_grant.grant_generation,'expiresAt',v_grant.expires_at);
 if p_source is not null then
  if p_generation is distinct from v_grant.grant_generation or p_source->>'externalId' is distinct from p_external_id or p_source->>'externalAccountId' is distinct from v_account.external_account_id then raise exception 'Lokale Quelle passt nicht zur Freigabe.' using errcode='42501';end if;
  v_result:=v_result||public.kleinanzeigen_store_transfer_source(p_workspace_id,p_connection_id,p_entry_id,v_grant.approved_by,p_source,'local');
 end if;
 return v_result;
end;
$$;
revoke all on function public.kleinanzeigen_local_transfer_source(uuid,uuid,text,uuid,text,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kleinanzeigen_local_transfer_source(uuid,uuid,text,uuid,text,bigint,jsonb) to service_role;
