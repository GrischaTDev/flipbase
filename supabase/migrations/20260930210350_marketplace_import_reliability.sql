-- Zweck: Atomare Vinted-Importe und getrennte Quellenstände mit ehrlichen Teilfehlern.
-- Betroffen: marketplace_account_sync_sources, marketplace_operations.source_results und drei Cache-/Importfunktionen.
-- CLI-Migra-Ausgabe automatisch auf diese Objekte begrenzt; Rechte und Kommentar aus deklarativen Schemas.

create table "public"."marketplace_account_sync_sources" (
    "id" bigint generated always as identity not null,
    "workspace_id" uuid not null,
    "connection_id" uuid not null,
    "area" text not null,
    "status" text not null,
    "failure" text,
    "observed_at" timestamp with time zone not null,
    "last_success_at" timestamp with time zone,
    "last_complete_at" timestamp with time zone
      );


alter table "public"."marketplace_account_sync_sources" enable row level security;

alter table "public"."marketplace_operations" add column "source_results" jsonb;

create unique index marketplace_account_sync_sour_workspace_id_connection_id_ar_key on public.marketplace_account_sync_sources using btree (workspace_id, connection_id, area);

create unique index marketplace_account_sync_sources_pkey on public.marketplace_account_sync_sources using btree (id);

alter table "public"."marketplace_account_sync_sources" add constraint "marketplace_account_sync_sources_pkey" primary key using index "marketplace_account_sync_sources_pkey";

alter table "public"."marketplace_account_sync_sources" add constraint "marketplace_account_sync_sour_workspace_id_connection_id_ar_key" unique using index "marketplace_account_sync_sour_workspace_id_connection_id_ar_key";

alter table "public"."marketplace_account_sync_sources" add constraint "marketplace_account_sync_source_workspace_id_connection_id_fkey" foreign key (workspace_id, connection_id) references public.marketplace_connections(workspace_id, id) on delete cascade not valid;

alter table "public"."marketplace_account_sync_sources" validate constraint "marketplace_account_sync_source_workspace_id_connection_id_fkey";

alter table "public"."marketplace_account_sync_sources" add constraint "marketplace_account_sync_sources_area_check" check ((area = any (array['profile'::text, 'publications'::text, 'conversations'::text, 'messages'::text, 'sales'::text, 'feedback'::text]))) not valid;

alter table "public"."marketplace_account_sync_sources" validate constraint "marketplace_account_sync_sources_area_check";

alter table "public"."marketplace_account_sync_sources" add constraint "marketplace_account_sync_sources_check" check (((status <> 'failed'::text) or (failure is not null))) not valid;

alter table "public"."marketplace_account_sync_sources" validate constraint "marketplace_account_sync_sources_check";

alter table "public"."marketplace_account_sync_sources" add constraint "marketplace_account_sync_sources_failure_check" check ((failure = any (array['unauthorized'::text, 'forbidden'::text, 'rate_limited'::text, 'provider_unavailable'::text, 'invalid_response'::text, 'timeout'::text, 'network'::text, 'browser_context'::text]))) not valid;

alter table "public"."marketplace_account_sync_sources" validate constraint "marketplace_account_sync_sources_failure_check";

alter table "public"."marketplace_account_sync_sources" add constraint "marketplace_account_sync_sources_status_check" check ((status = any (array['complete'::text, 'partial'::text, 'failed'::text]))) not valid;

alter table "public"."marketplace_account_sync_sources" validate constraint "marketplace_account_sync_sources_status_check";

alter table "public"."marketplace_operations" add constraint "marketplace_operations_source_results_check" check (((source_results is null) or (jsonb_typeof(source_results) = 'object'::text))) not valid;

alter table "public"."marketplace_operations" validate constraint "marketplace_operations_source_results_check";

create or replace function public.marketplace_apply_vinted_import(p_workspace_id uuid, p_connection_id uuid, p_session_id uuid, p_user_id uuid, p_snapshot jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_connection public.marketplace_connections;
  v_session public.marketplace_browser_sessions;
  v_observed_at timestamptz;
  v_entry jsonb;
  v_area text;
  v_status text;
  v_failure text;
  v_kind text;
  v_parent_id uuid;
  v_body jsonb;
  v_old_feedback jsonb;
  v_counts jsonb := '{"profile":0,"publication":0,"conversation":0,"message":0,"sale":0}';
begin
  -- Gleiche Sperrreihenfolge wie die bestehenden Browser-RPCs: Konto, dann Sitzung.
  select * into v_connection from public.marketplace_connections
    where workspace_id = p_workspace_id and id = p_connection_id and marketplace = 'vinted' for update;
  if not found or v_connection.status <> 'connected' then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  select * into v_session from public.marketplace_browser_sessions
    where public_id = p_session_id and workspace_id = p_workspace_id and connection_id = p_connection_id
      and started_by = p_user_id for update;
  if not found or v_session.state <> 'active' or v_session.expires_at <= clock_timestamp() then
    raise exception 'Sitzungszugriff verweigert' using errcode = '42501';
  end if;
  -- Lesesperren verhindern Rechteentzug zwischen Prüfung und abschließendem Schreiben.
  perform 1 from public.platform_operators where user_id = p_user_id for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and archived_at is null for share;
  if not found then raise exception 'Kontozugriff verweigert' using errcode = '42501'; end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_snapshot->'identity') is distinct from 'object'
    or p_snapshot->'identity'->>'id' is distinct from v_connection.external_account_id then
    raise exception 'Kontoidentität stimmt nicht überein' using errcode = '42501';
  end if;
  if jsonb_typeof(p_snapshot->'entries') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'areas') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'observedAt') is distinct from 'string'
    or (p_snapshot ? 'rejectedSaleIds' and jsonb_typeof(p_snapshot->'rejectedSaleIds') is distinct from 'array') then
    raise exception 'Ungültiger Import' using errcode = '22023';
  end if;
  begin
    v_observed_at := (p_snapshot->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Ungültige Abrufzeit' using errcode = '22023';
  end;
  if not isfinite(v_observed_at) or v_observed_at <= (
    select max(observed_at) from public.marketplace_account_sync_sources where workspace_id = p_workspace_id and connection_id = p_connection_id
  ) then raise exception 'Veralteter Import' using errcode = '22023'; end if;

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    v_failure := p_snapshot->'areas'->v_area->>'failure';
    if jsonb_typeof(p_snapshot->'areas'->v_area) is distinct from 'object'
      or v_status is null or v_status not in ('complete','partial','failed')
      or (v_failure is not null and v_failure not in ('unauthorized','forbidden','rate_limited','provider_unavailable','invalid_response','timeout','network','browser_context'))
      or (v_status = 'failed' and v_failure is null) or (v_area = 'profile' and v_status <> 'complete') then
      raise exception 'Ungültiger Quellenstatus' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'profile') <> 1
    or exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e group by e->>'kind',e->>'externalId' having count(*) > 1) then
    raise exception 'Profil oder eindeutige Einträge fehlen' using errcode = '22023';
  end if;
  select body->'feedbacks' into v_old_feedback from public.marketplace_account_entries
    where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'profile';

  for v_entry in select value from jsonb_array_elements(p_snapshot->'entries') order by (value->>'kind' = 'message') loop
    v_kind := v_entry->>'kind';
    v_area := case v_kind when 'profile' then 'profile' when 'publication' then 'publications' when 'conversation' then 'conversations' when 'message' then 'messages' when 'sale' then 'sales' end;
    if v_area is null or jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry->'externalId') is distinct from 'string' or char_length(v_entry->>'externalId') not between 1 and 256
      or jsonb_typeof(v_entry->'body') is distinct from 'object' or jsonb_typeof(v_entry->'sortAt') is distinct from 'string'
      or p_snapshot->'areas'->v_area->>'status' = 'failed'
      or (v_kind = 'profile' and v_entry->>'externalId' is distinct from v_connection.external_account_id)
      or (v_kind <> 'message' and v_entry ? 'parentExternalId') then
      raise exception 'Ungültiger Kontoeintrag' using errcode = '22023';
    end if;
    begin
      if not isfinite((v_entry->>'sortAt')::timestamptz) then raise exception 'Ungültige Eintragszeit' using errcode = '22023'; end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Ungültige Eintragszeit' using errcode = '22023';
    end;
    v_parent_id := null;
    if v_kind = 'message' then
      select id into v_parent_id from public.marketplace_account_entries
        where workspace_id = p_workspace_id and connection_id = p_connection_id and kind = 'conversation' and external_id = v_entry->>'parentExternalId';
      if v_parent_id is null or (p_snapshot->'areas'->'conversations'->>'status' = 'complete' and not exists (
        select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'conversation' and e->>'externalId' = v_entry->>'parentExternalId'
      )) then raise exception 'Nachricht ohne Kontogespräch' using errcode = '22023'; end if;
    end if;
    v_body := v_entry->'body';
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' <> 'failed' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Bewertungen' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_array_elements(v_body->'feedbacks') feedback where jsonb_typeof(feedback) <> 'object'
        or jsonb_typeof(feedback->'id') is distinct from 'string' or char_length(feedback->>'id') not between 1 and 256) then
        raise exception 'Ungültige Bewertungskennung' using errcode = '22023';
      end if;
    end if;
    if v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'failed' then
      v_body := (v_body - 'feedbacks') || case when v_old_feedback is null then '{}'::jsonb else jsonb_build_object('feedbacks',v_old_feedback) end;
    elsif v_kind = 'profile' and p_snapshot->'areas'->'feedback'->>'status' = 'partial' then
      if jsonb_typeof(v_body->'feedbacks') is distinct from 'array' then raise exception 'Ungültige Teilbewertungen' using errcode = '22023'; end if;
      v_body := jsonb_set(v_body,'{feedbacks}',coalesce((
        select jsonb_agg(merged.value order by merged.position) from (
          select distinct on (source.value->>'id') source.value, source.position from (
            select value, ordinality as position from jsonb_array_elements(v_body->'feedbacks') with ordinality
            union all
            select value, ordinality + jsonb_array_length(v_body->'feedbacks') from jsonb_array_elements(coalesce(v_old_feedback,'[]')) with ordinality
          ) source order by source.value->>'id',source.position
        ) merged
      ),'[]'::jsonb));
    end if;
    insert into public.marketplace_account_entries(workspace_id,connection_id,kind,external_id,parent_id,body,sort_at,observed_at)
      values(p_workspace_id,p_connection_id,v_kind,v_entry->>'externalId',v_parent_id,v_body,(v_entry->>'sortAt')::timestamptz,v_observed_at)
      on conflict (workspace_id,connection_id,kind,external_id) do update
        set parent_id = excluded.parent_id,body = excluded.body,sort_at = excluded.sort_at,observed_at = excluded.observed_at
        where public.marketplace_account_entries.observed_at <= excluded.observed_at;
    if found then v_counts := jsonb_set(v_counts,array[v_kind],to_jsonb((v_counts->>v_kind)::int + 1)); end if;
  end loop;

  -- Nur nachweislich vollständige Listen dürfen fehlende alte Einträge entfernen.
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.observed_at < v_observed_at and a.kind in ('publication','conversation')
    and not exists (select 1 from public.marketplace_account_entries child where child.parent_id = a.id and child.observed_at >= v_observed_at)
    and p_snapshot->'areas'->(case a.kind when 'publication' then 'publications' else 'conversations' end)->>'status' = 'complete'
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = a.kind and e->>'externalId' = a.external_id);
  if exists (select 1 from jsonb_array_elements(coalesce(p_snapshot->'rejectedSaleIds','[]')) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 256)
    or (jsonb_array_length(coalesce(p_snapshot->'rejectedSaleIds','[]')) > 0 and p_snapshot->'areas'->'sales'->>'status' = 'failed') then
    raise exception 'Ungültige Verkaufsbereinigung' using errcode = '22023';
  end if;
  delete from public.marketplace_account_entries a where a.workspace_id = p_workspace_id and a.connection_id = p_connection_id
    and a.kind = 'sale' and a.observed_at < v_observed_at and a.external_id in (select jsonb_array_elements_text(coalesce(p_snapshot->'rejectedSaleIds','[]')))
    and not exists (select 1 from jsonb_array_elements(p_snapshot->'entries') e where e->>'kind' = 'sale' and e->>'externalId' = a.external_id);

  foreach v_area in array array['profile','publications','conversations','messages','sales','feedback'] loop
    v_status := p_snapshot->'areas'->v_area->>'status';
    insert into public.marketplace_account_sync_sources(workspace_id,connection_id,area,status,failure,observed_at,last_success_at,last_complete_at)
      values(p_workspace_id,p_connection_id,v_area,v_status,p_snapshot->'areas'->v_area->>'failure',v_observed_at,
        case when v_status <> 'failed' then v_observed_at end,case when v_status = 'complete' then v_observed_at end)
      on conflict (workspace_id,connection_id,area) do update set status = excluded.status,failure = excluded.failure,observed_at = excluded.observed_at,
        last_success_at = coalesce(excluded.last_success_at,public.marketplace_account_sync_sources.last_success_at),
        last_complete_at = coalesce(excluded.last_complete_at,public.marketplace_account_sync_sources.last_complete_at);
  end loop;
  if not exists (select 1 from jsonb_each(p_snapshot->'areas') a where a.value->>'status' = 'failed') then
    update public.marketplace_connections set last_synced_at = v_observed_at where id = p_connection_id and (last_synced_at is null or last_synced_at < v_observed_at);
  end if;
  if v_session.expires_at <= clock_timestamp() then raise exception 'Sitzung während des Imports abgelaufen' using errcode = '42501'; end if;
  return v_counts;
end;
$function$
;

create or replace function public.marketplace_cache_listing_text(p_workspace_id uuid, p_connection_id uuid, p_entry_id uuid, p_external_id text, p_text text, p_confirmed boolean default false, p_title text default null::text, p_price numeric default null::numeric)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if p_text is null or char_length(p_text) > 2000 or
    (p_confirmed and (p_title is null or char_length(p_title) > 120 or p_price is null or p_price <= 0)) then
    return false;
  end if;
  update public.marketplace_account_entries
  set body = jsonb_set(
    jsonb_set(
      case when p_confirmed then
        jsonb_set(jsonb_set(body, '{title}', to_jsonb(p_title), true),
          '{price}', to_jsonb(p_price), true)
      else body end,
      '{text}', to_jsonb(p_text), true),
    '{textState}', to_jsonb('loaded'::text), true),
    observed_at = clock_timestamp()
  where workspace_id = p_workspace_id and connection_id = p_connection_id
    and id = p_entry_id and kind = 'publication' and external_id = p_external_id
    and (p_confirmed or coalesce(body->>'textState', 'not_loaded') <> 'loaded');
  return found;
end;
$function$
;

create or replace function public.marketplace_cache_profile_about(p_workspace_id uuid, p_connection_id uuid, p_account_id text, p_about text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if p_about is null or char_length(p_about) > 2000 then return false; end if;
  update public.marketplace_account_entries
  set body = jsonb_set(jsonb_set(body, '{bio}', to_jsonb(p_about), true),
    '{bioState}', to_jsonb('loaded'::text), true),
    observed_at = clock_timestamp()
  where workspace_id = p_workspace_id and connection_id = p_connection_id
    and kind = 'profile' and external_id = p_account_id;
  return found;
end;
$function$
;

create policy "Administrators read source progress"
  on "public"."marketplace_account_sync_sources"
  as permissive
  for select
  to authenticated
using (public.marketplace_can_manage(workspace_id));

create policy "Worker deletes source progress"
  on "public"."marketplace_account_sync_sources"
  as permissive
  for delete
  to service_role
using (true);

create policy "Worker inserts source progress"
  on "public"."marketplace_account_sync_sources"
  as permissive
  for insert
  to service_role
with check (true);

create policy "Worker reads source progress"
  on "public"."marketplace_account_sync_sources"
  as permissive
  for select
  to service_role
using (true);

create policy "Worker updates source progress"
  on "public"."marketplace_account_sync_sources"
  as permissive
  for update
  to service_role
using (true)
with check (true);

revoke all on public.marketplace_account_sync_sources from public, anon, authenticated;
grant select on public.marketplace_account_sync_sources to authenticated;
grant all on public.marketplace_account_sync_sources to service_role;
revoke all on sequence public.marketplace_account_sync_sources_id_seq from public, anon, authenticated;
grant usage, select on sequence public.marketplace_account_sync_sources_id_seq to service_role;
revoke all on function public.marketplace_apply_vinted_import(uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_apply_vinted_import(uuid,uuid,uuid,uuid,jsonb) to service_role;
comment on table public.marketplace_account_sync_sources is 'Getrennte Abruf- und Erfolgsstände; ein Fehler ersetzt niemals einen erfolgreichen Quellenstand.';
revoke all on function public.marketplace_cache_listing_text(uuid, uuid, uuid, text, text, boolean, text, numeric)
from public, anon, authenticated;
grant execute on function public.marketplace_cache_listing_text(uuid, uuid, uuid, text, text, boolean, text, numeric)
to service_role;
revoke all on function public.marketplace_cache_profile_about(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.marketplace_cache_profile_about(uuid, uuid, text, text)
to service_role;
