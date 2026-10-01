-- Persönliche eBay-OAuth-Verbindungen, sichere Tokens und einmalige Login-Zustände.
-- Betroffen: ebay_connections, ebay_credentials, ebay_authorization_states und eBay-RPCs.
set local check_function_bodies = off;

create table "public"."ebay_authorization_states" (
  "id"                    uuid                     not null default gen_random_uuid(),
  "connection_id"         uuid                     not null,
  "state_hash"            text                     not null,
  "authorization_version" bigint                   not null,
  "expires_at"            timestamp with time zone not null default (now() + '00:10:00'::interval),
  constraint "ebay_authorization_states_pkey" primary key (id),
  constraint "ebay_authorization_states_state_hash_check"
    check ((state_hash ~ '^[0-9a-f]{64}$'::text)),
  constraint "ebay_authorization_states_state_hash_key" unique (state_hash)
);

alter table "public"."ebay_authorization_states"
  enable row level security;

revoke all on table "public"."ebay_authorization_states" from "anon", "authenticated";

create table "public"."ebay_connections" (
  "id"                    uuid                     not null default gen_random_uuid(),
  "workspace_id"          uuid                     not null,
  "user_id"               uuid                     not null,
  "environment"           text                     not null,
  "status"                text                     not null default 'needs_login'::text,
  "external_account_id"   text,
  "username"              text,
  "authorization_version" bigint                   not null default 0,
  "operation_id"          uuid,
  "operation_expires_at"  timestamp with time zone,
  "last_read_at"          timestamp with time zone,
  "created_at"            timestamp with time zone not null default now(),
  "updated_at"            timestamp with time zone not null default now(),
  constraint "ebay_connections_environment_check"
    check ((environment = ANY (ARRAY['production'::text, 'sandbox'::text]))),
  constraint "ebay_connections_pkey" primary key (id),
  constraint "ebay_connections_status_check"
    check ((status = ANY (ARRAY['connected'::text, 'needs_login'::text, 'disconnected'::text]))),
  constraint "ebay_connections_workspace_id_user_id_environment_key" unique
    (workspace_id, user_id, environment)
);

alter table "public"."ebay_connections"
  enable row level security;

revoke all on table "public"."ebay_connections" from "anon";

create table "public"."ebay_credentials" (
  "id"               uuid                     not null,
  "encrypted_tokens" text                     not null,
  "updated_at"       timestamp with time zone not null default now(),
  constraint "ebay_credentials_pkey" primary key (id)
);

alter table "public"."ebay_credentials"
  enable row level security;

revoke all on table "public"."ebay_credentials" from "anon", "authenticated";

create or replace function public.ebay_begin_authorization (
  p_workspace_id uuid,
  p_user_id      uuid,
  p_environment  text,
  p_state_hash   text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_connection public.ebay_connections;
begin
  if not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.archived_at is null)
  then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  if p_environment not in ('production','sandbox') or p_state_hash !~ '^[0-9a-f]{64}$' or p_state_hash is null
  then raise exception 'Ungültige Anmeldung' using errcode = '22023'; end if;
  insert into public.ebay_connections (workspace_id,user_id,environment)
    values (p_workspace_id,p_user_id,p_environment)
    on conflict (workspace_id,user_id,environment) do nothing;
  update public.ebay_connections set authorization_version = authorization_version + 1,
    status = 'needs_login', external_account_id = null, username = null, last_read_at = null,
    operation_id = null, operation_expires_at = null, updated_at = now()
    where workspace_id = p_workspace_id and user_id = p_user_id and environment = p_environment
    returning * into v_connection;
  delete from public.ebay_credentials where id = v_connection.id;
  delete from public.ebay_authorization_states where connection_id = v_connection.id or expires_at <= now();
  insert into public.ebay_authorization_states (connection_id,state_hash,authorization_version)
    values (v_connection.id,p_state_hash,v_connection.authorization_version);
  return to_jsonb(v_connection);
end;
$function$;

revoke all
  on function "public"."ebay_begin_authorization"(uuid, uuid, text, text)
  from public, "anon", "authenticated";

create or replace function public.ebay_can_connect (
  p_workspace_id uuid
)
  returns boolean
  language sql
  stable
  set search_path to ''
  AS $function$
  select (select auth.uid()) is not null
    and public.is_workspace_member(p_workspace_id)
    and exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.archived_at is null);
$function$;

revoke all on function "public"."ebay_can_connect"(uuid) from public, "anon";

create or replace function public.ebay_claim_connection (
  p_workspace_id  uuid,
  p_user_id       uuid,
  p_connection_id uuid,
  p_operation_id  uuid
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_connection public.ebay_connections; v_tokens text;
begin
  if not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.archived_at is null)
  then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  update public.ebay_connections set operation_id = p_operation_id, operation_expires_at = now() + interval '90 seconds'
    where id = p_connection_id and workspace_id = p_workspace_id and user_id = p_user_id and status = 'connected'
      and (operation_id is null or operation_expires_at <= now()) returning * into v_connection;
  if not found then return null; end if;
  select encrypted_tokens into v_tokens from public.ebay_credentials where id = v_connection.id;
  return jsonb_build_object('connection',to_jsonb(v_connection),'encryptedTokens',v_tokens);
end;
$function$;

revoke all
  on function "public"."ebay_claim_connection"(uuid, uuid, uuid, uuid)
  from public, "anon", "authenticated";

create or replace function public.ebay_complete_authorization (
  p_connection_id       uuid,
  p_version             bigint,
  p_external_account_id text,
  p_username            text,
  p_encrypted_tokens    text
)
  returns boolean
  language plpgsql
  set search_path to ''
  AS $function$
declare v_connection public.ebay_connections;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id
    and authorization_version = p_version and status = 'needs_login' for update;
  if not found or not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = v_connection.workspace_id and m.user_id = v_connection.user_id and w.archived_at is null)
  then return false; end if;
  if p_external_account_id is null or char_length(p_external_account_id) not between 1 and 256
    or p_encrypted_tokens is null or p_encrypted_tokens = '' then raise exception 'Ungültige Kontoverbindung' using errcode = '22023'; end if;
  insert into public.ebay_credentials (id,encrypted_tokens) values (p_connection_id,p_encrypted_tokens)
    on conflict (id) do update set encrypted_tokens = excluded.encrypted_tokens, updated_at = now();
  update public.ebay_connections set status = 'connected', external_account_id = p_external_account_id,
    username = left(p_username,120), updated_at = now() where id = p_connection_id;
  return true;
end;
$function$;

revoke all
  on function "public"."ebay_complete_authorization"(uuid, bigint, text, text, text)
  from public, "anon", "authenticated";

create or replace function public.ebay_consume_authorization (
  p_state_hash text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  AS $function$
declare v_state public.ebay_authorization_states; v_connection public.ebay_connections;
begin
  select * into v_state from public.ebay_authorization_states where state_hash = p_state_hash;
  if not found or v_state.expires_at <= now() then return null; end if;
  select * into v_connection from public.ebay_connections where id = v_state.connection_id
    and authorization_version = v_state.authorization_version for update;
  if not found or not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = v_connection.workspace_id and m.user_id = v_connection.user_id and w.archived_at is null)
  then return null; end if;
  delete from public.ebay_authorization_states where id = v_state.id returning * into v_state;
  if not found then return null; end if;
  return to_jsonb(v_connection);
end;
$function$;

revoke all
  on function "public"."ebay_consume_authorization"(text)
  from public, "anon", "authenticated";

create or replace function public.ebay_delete_account (
  p_environment         text,
  p_external_account_id text
)
  returns void
  language sql
  set search_path to ''
  AS $function$
  delete from public.ebay_connections where environment = p_environment and external_account_id = p_external_account_id;
$function$;

revoke all
  on function "public"."ebay_delete_account"(text, text)
  from public, "anon", "authenticated";

create or replace function public.ebay_disconnect (
  p_workspace_id  uuid,
  p_connection_id uuid
)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
  AS $function$
begin
  if not public.ebay_can_connect(p_workspace_id) then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  update public.ebay_connections set status = 'disconnected', external_account_id = null, username = null,
    authorization_version = authorization_version + 1, operation_id = null, operation_expires_at = null,
    last_read_at = null, updated_at = now()
    where id = p_connection_id and workspace_id = p_workspace_id and user_id = (select auth.uid());
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  delete from public.ebay_credentials where id = p_connection_id;
  delete from public.ebay_authorization_states where connection_id = p_connection_id;
  return true;
end;
$function$;

revoke all on function "public"."ebay_disconnect"(uuid, uuid) from public, "anon";

create or replace function public.ebay_finish_read (
  p_connection_id    uuid,
  p_operation_id     uuid,
  p_version          bigint,
  p_encrypted_tokens text    default null::text,
  p_needs_login      boolean default false,
  p_observed         boolean default false
)
  returns boolean
  language plpgsql
  set search_path to ''
  AS $function$
declare v_connection public.ebay_connections;
begin
  select * into v_connection from public.ebay_connections where id = p_connection_id
    and operation_id = p_operation_id and authorization_version = p_version and status = 'connected'
    and operation_expires_at > now() for update;
  if not found then return false; end if;
  if not exists (select 1 from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = v_connection.workspace_id and m.user_id = v_connection.user_id and w.archived_at is null)
  then return false; end if;
  if p_needs_login then
    delete from public.ebay_credentials where id = p_connection_id;
  elsif p_encrypted_tokens is not null then
    update public.ebay_credentials set encrypted_tokens = p_encrypted_tokens, updated_at = now() where id = p_connection_id;
  end if;
  update public.ebay_connections set operation_id = null, operation_expires_at = null,
    status = case when p_needs_login then 'needs_login' else status end,
    last_read_at = case when p_observed then now() else last_read_at end, updated_at = now() where id = p_connection_id;
  return true;
end;
$function$;

revoke all
  on function "public"."ebay_finish_read"(uuid, uuid, bigint, text, boolean, boolean)
  from public, "anon", "authenticated";

alter table "public"."ebay_authorization_states"
  add constraint "ebay_authorization_states_connection_id_fkey" foreign key (connection_id)
    references public.ebay_connections(id) on delete cascade;

alter table "public"."ebay_connections"
  add constraint "ebay_connections_user_id_fkey" foreign key (user_id) references auth.users(id)
    on delete cascade;

alter table "public"."ebay_connections"
  add constraint "ebay_connections_workspace_id_fkey" foreign key (workspace_id)
    references public.workspaces(id) on delete cascade;

alter table "public"."ebay_credentials"
  add constraint "ebay_credentials_id_fkey" foreign key (id) references public.ebay_connections(id)
    on delete cascade;

create index ebay_authorization_states_connection on public.ebay_authorization_states
  using btree (connection_id);

create index ebay_authorization_states_expiry on public.ebay_authorization_states
  using btree (expires_at);

create index ebay_connections_external_account on public.ebay_connections
  using btree (environment, external_account_id);

create index ebay_connections_user on public.ebay_connections using btree (user_id, workspace_id);

create policy "Users read their own eBay connections" on "public"."ebay_connections"
  for select
  to "authenticated"
  using (((user_id = ( select auth.uid() as uid)) AND public.ebay_can_connect(workspace_id)));

comment on table "public"."ebay_authorization_states" is 'Einmalige, gehashte OAuth-Zustände; Identität und Workspace stammen aus der persönlichen Verbindung.';

comment on table "public"."ebay_connections" is 'Eine persönliche eBay-Verbindung je Nutzer, Workspace und Umgebung. Keine Zugangstokens.';

comment on table "public"."ebay_credentials" is 'AES-GCM-verschlüsselte OAuth-Tokens. Schlüssel ausschließlich im Funktionsdienst; kein Clientzugriff.';

revoke all on function "public"."ebay_begin_authorization"(uuid, uuid, text, text) from "postgres";

grant execute on function "public"."ebay_begin_authorization"(uuid, uuid, text, text) to "postgres";

grant execute
  on function "public"."ebay_begin_authorization"(uuid, uuid, text, text)
  to "service_role";

grant execute on function "public"."ebay_can_connect"(uuid) to "authenticated";

revoke all on function "public"."ebay_can_connect"(uuid) from "postgres";

grant execute on function "public"."ebay_can_connect"(uuid) to "postgres";

grant execute on function "public"."ebay_can_connect"(uuid) to "service_role";

revoke all on function "public"."ebay_claim_connection"(uuid, uuid, uuid, uuid) from "postgres";

grant execute on function "public"."ebay_claim_connection"(uuid, uuid, uuid, uuid) to "postgres";

grant execute on function "public"."ebay_claim_connection"(uuid, uuid, uuid, uuid) to "service_role";

revoke all
  on function "public"."ebay_complete_authorization"(uuid, bigint, text, text, text)
  from "postgres";

grant execute
  on function "public"."ebay_complete_authorization"(uuid, bigint, text, text, text)
  to "postgres";

grant execute
  on function "public"."ebay_complete_authorization"(uuid, bigint, text, text, text)
  to "service_role";

revoke all on function "public"."ebay_consume_authorization"(text) from "postgres";

grant execute on function "public"."ebay_consume_authorization"(text) to "postgres";

grant execute on function "public"."ebay_consume_authorization"(text) to "service_role";

revoke all on function "public"."ebay_delete_account"(text, text) from "postgres";

grant execute on function "public"."ebay_delete_account"(text, text) to "postgres";

grant execute on function "public"."ebay_delete_account"(text, text) to "service_role";

grant execute on function "public"."ebay_disconnect"(uuid, uuid) to "authenticated";

revoke all on function "public"."ebay_disconnect"(uuid, uuid) from "postgres";

grant execute on function "public"."ebay_disconnect"(uuid, uuid) to "postgres";

grant execute on function "public"."ebay_disconnect"(uuid, uuid) to "service_role";

revoke all
  on function "public"."ebay_finish_read"(uuid, uuid, bigint, text, boolean, boolean)
  from "postgres";

grant execute
  on function "public"."ebay_finish_read"(uuid, uuid, bigint, text, boolean, boolean)
  to "postgres";

grant execute
  on function "public"."ebay_finish_read"(uuid, uuid, bigint, text, boolean, boolean)
  to "service_role";

revoke all on table "public"."ebay_authorization_states" from "postgres";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."ebay_authorization_states"
  to "postgres";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."ebay_authorization_states"
  to "service_role";

revoke all on table "public"."ebay_connections" from "authenticated";

grant select on table "public"."ebay_connections" to "authenticated";

revoke all on table "public"."ebay_connections" from "postgres";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."ebay_connections"
  to "postgres";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."ebay_connections"
  to "service_role";

revoke all on table "public"."ebay_credentials" from "postgres";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."ebay_credentials"
  to "postgres";

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."ebay_credentials"
  to "service_role";
