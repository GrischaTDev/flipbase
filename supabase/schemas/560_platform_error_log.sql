-- Zentrales Fehlerprotokoll für den Systemzustand der Administration.
--
-- Jeder Abbruch landet hier, sobald eine Quelltabelle einen Fehlerzustand speichert.
-- Die Einträge entstehen in derselben Transaktion wie der Fehler und bleiben damit
-- auch nach einem Worker-Neustart erhalten. Kein Freitext von Kundinnen oder Kunden,
-- keine Nachrichteninhalte, keine Zugangsdaten. Aufbewahrung: 30 Tage.

create table public.platform_error_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  area text not null check (area in ('vinted_sync','vinted_actions','kleinanzeigen','push','feed_bot','app')),
  severity text not null default 'error' check (severity in ('error','warning')),
  source text not null check (source ~ '^[a-z_]{1,80}$'),
  code text not null check (char_length(code) between 1 and 120),
  message text check (char_length(message) <= 500),
  workspace_id uuid,
  account_label text check (char_length(account_label) <= 120),
  user_id uuid,
  reference_id text check (char_length(reference_id) <= 80),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 2048)
);
comment on table public.platform_error_events is
  'Fehler und Abbrüche aller Bereiche für die Detailanalyse im Systemzustand; 30 Tage, ohne Inhalte oder Zugangsdaten.';
create index platform_error_events_area_time on public.platform_error_events(area, occurred_at desc, id desc);
create index platform_error_events_time on public.platform_error_events(occurred_at);
create index platform_error_events_user_time on public.platform_error_events(user_id, occurred_at) where user_id is not null;

alter table public.platform_error_events enable row level security;
revoke all on public.platform_error_events from public, anon, authenticated, service_role;
grant select on public.platform_error_events to authenticated;
revoke all on sequence public.platform_error_events_id_seq from public, anon, authenticated;

-- Geschrieben wird nur über die Triggerfunktion und platform_report_app_error.
create policy "Betreiber lesen das Fehlerprotokoll" on public.platform_error_events
  for select to authenticated
  using ((select public.is_platform_operator()));

-- Schreibt einen Eintrag und hält die Tabelle schlank. Läuft als Eigentümer, weil
-- Fehlerzustände von Workern, Erweiterungen und Nutzern gespeichert werden.
create or replace function public.platform_record_error(
  p_area text, p_severity text, p_source text, p_code text, p_message text,
  p_workspace_id uuid, p_account_label text, p_user_id uuid, p_reference_id text, p_detail jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.platform_error_events(area,severity,source,code,message,workspace_id,account_label,user_id,reference_id,detail)
  values (p_area, p_severity, p_source, left(coalesce(nullif(btrim(p_code),''),'unknown'),120), left(p_message,500),
    p_workspace_id, left(p_account_label,120), p_user_id, left(p_reference_id,80),
    case when pg_column_size(coalesce(p_detail,'{}'::jsonb)) <= 2048 then coalesce(p_detail,'{}'::jsonb) else '{}'::jsonb end);
  -- Aufräumen in kleinen Schritten, damit kein Fehlerpfad lange blockiert.
  delete from public.platform_error_events where id in (
    select id from public.platform_error_events where occurred_at < clock_timestamp() - interval '30 days' order by occurred_at limit 200);
end;
$$;
revoke all on function public.platform_record_error(text,text,text,text,text,uuid,text,uuid,text,jsonb) from public, anon, authenticated, service_role;

-- Gemeinsamer Trigger für Tabellen mit Zustandsspalte.
-- Argumente: Bereich, Zustandsspalte, Fehlerzustände (Komma), Warnzustände (Komma), Codespalte.
create or replace function public.platform_error_log_state_change()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare
  v_new jsonb := to_jsonb(new);
  v_state text := v_new->>tg_argv[1];
  v_severity text;
  v_connection text := v_new->>'connection_id';
  v_workspace uuid;
  v_label text;
  v_detail jsonb := '{}'::jsonb;
  v_key text;
begin
  if v_state is null then return null; end if;
  if tg_op = 'UPDATE' and (to_jsonb(old)->>tg_argv[1]) is not distinct from v_state then return null; end if;
  if v_state = any(string_to_array(tg_argv[2], ',')) then v_severity := 'error';
  elsif v_state = any(string_to_array(tg_argv[3], ',')) then v_severity := 'warning';
  else return null; end if;
  if v_new ? 'workspace_id' then v_workspace := (v_new->>'workspace_id')::uuid; end if;
  if v_connection is not null and v_workspace is not null then
    if tg_argv[0] = 'kleinanzeigen' then
      select display_name into v_label from public.kleinanzeigen_connections where workspace_id = v_workspace and id::text = v_connection;
    else
      select display_name into v_label from public.marketplace_connections where workspace_id = v_workspace and id::text = v_connection;
    end if;
  end if;
  -- Nur technische Merkmale übernehmen, niemals Nachrichtentexte oder Titel.
  foreach v_key in array array['kind','stage','action','authorization_kind','execution_mode','event_name','cloud_phase','attempts','consecutive_failures','retry_after','error_code','offer_error_code','stop_reason'] loop
    if v_new ? v_key and v_new->v_key <> 'null'::jsonb and v_key <> tg_argv[4] then v_detail := v_detail || jsonb_build_object(v_key, v_new->v_key); end if;
  end loop;
  if tg_argv[1] <> tg_argv[4] then v_detail := v_detail || jsonb_build_object('state', v_state); end if;
  perform public.platform_record_error(tg_argv[0], v_severity, tg_table_name,
    coalesce(v_new->>tg_argv[4], v_state), null, v_workspace, v_label,
    coalesce((v_new->>'requested_by')::uuid, (v_new->>'started_by')::uuid, (v_new->>'activated_by')::uuid),
    coalesce(v_new->>'public_id', v_new->>'id'), v_detail);
  return null;
end;
$$;
revoke all on function public.platform_error_log_state_change() from public, anon, authenticated, service_role;

-- Vinted: Abrufe, abgebrochene Browsersitzungen und Pausen der Automatik.
create trigger platform_error_log after insert or update of state on public.marketplace_operations
  for each row execute function public.platform_error_log_state_change('vinted_sync','state','failed','','error_code');
create trigger platform_error_log after update of stop_reason on public.marketplace_browser_sessions
  for each row execute function public.platform_error_log_state_change('vinted_sync','stop_reason','interrupted','expired','stop_reason');
create trigger platform_error_log after update of paused_reason on public.marketplace_sync_schedules
  for each row execute function public.platform_error_log_state_change('vinted_sync','paused_reason',
    'retry_limit,needs_login,forbidden,challenge,access_revoked','network,server,interrupted,rate_limited,cleanup','paused_reason');

-- Vinted: Aktionen in der Cloud oder über die Erweiterung.
create trigger platform_error_log after update of state on public.marketplace_local_message_outbox
  for each row execute function public.platform_error_log_state_change('vinted_actions','state','failed','outcome_unknown','error_code');
create trigger platform_error_log after update of state on public.marketplace_favorite_message_events
  for each row execute function public.platform_error_log_state_change('vinted_actions','state','failed','outcome_unknown','error_code');
create trigger platform_error_log_offer after update of offer_state on public.marketplace_favorite_message_events
  for each row execute function public.platform_error_log_state_change('vinted_actions','offer_state','failed','outcome_unknown','offer_error_code');
create trigger platform_error_log after update of state on public.marketplace_negotiation_jobs
  for each row execute function public.platform_error_log_state_change('vinted_actions','state','failed','outcome_unknown','error_code');
create trigger platform_error_log after update of state on public.marketplace_listing_jobs
  for each row execute function public.platform_error_log_state_change('vinted_actions','state','failed','outcome_unknown','error_code');

-- Kleinanzeigen: Abgleich und Veröffentlichung.
create trigger platform_error_log after update of state on public.kleinanzeigen_sync_runs
  for each row execute function public.platform_error_log_state_change('kleinanzeigen','state','failed','','error_code');
create trigger platform_error_log after update of state on public.kleinanzeigen_publication_jobs
  for each row execute function public.platform_error_log_state_change('kleinanzeigen','state','failed','outcome_unknown,needs_user_action','error_code');

-- Push: endgültig gescheiterte und wiederholte Zustellungen.
create trigger platform_error_log after update of status on public.web_push_deliveries
  for each row execute function public.platform_error_log_state_change('push','status','expired,configuration_error','retry','last_error_class');

-- Feed-Bot: jeder neue Zyklusfehler.
create or replace function public.platform_error_log_feed_bot()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  if new.last_cycle_error is not null and (tg_op = 'INSERT' or old.last_cycle_error is distinct from new.last_cycle_error) then
    perform public.platform_record_error('feed_bot','error',tg_table_name,'cycle_error',new.last_cycle_error,null,null,null,null,'{}'::jsonb);
  end if;
  return null;
end;
$$;
revoke all on function public.platform_error_log_feed_bot() from public, anon, authenticated, service_role;
create trigger platform_error_log after insert or update of last_cycle_error on public.sniper_runtime_status
  for each row execute function public.platform_error_log_feed_bot();

-- App: sichtbare Fehlermeldungen aus Browser und PWA. Gedrosselt je Nutzer.
create or replace function public.platform_report_app_error(p_code text, p_message text, p_page text, p_device text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_code text := left(btrim(coalesce(p_code,'')),120); v_message text := left(btrim(coalesce(p_message,'')),500);
begin
  if v_user is null or v_code = '' or v_code ~ '[[:cntrl:]]' then return false; end if;
  -- Gleiche Meldung höchstens alle fünf Minuten, insgesamt höchstens 60 pro Stunde.
  if exists(select 1 from public.platform_error_events where user_id = v_user and area = 'app' and code = v_code
      and message is not distinct from nullif(v_message,'') and occurred_at > clock_timestamp() - interval '5 minutes') then return false; end if;
  if (select count(*) from public.platform_error_events where user_id = v_user and area = 'app' and occurred_at > clock_timestamp() - interval '1 hour') >= 60 then return false; end if;
  perform public.platform_record_error('app','error','app',v_code,nullif(v_message,''),null,null,v_user,null,
    jsonb_strip_nulls(jsonb_build_object('page', left(nullif(btrim(p_page),''),200), 'device', left(nullif(btrim(p_device),''),40))));
  return true;
end;
$$;
revoke all on function public.platform_report_app_error(text,text,text,text) from public, anon, service_role;
grant execute on function public.platform_report_app_error(text,text,text,text) to authenticated;

-- Liste für die Detailseite. Betreiber sehen zusätzlich, wem der Eintrag gehört.
create or replace function public.platform_error_events_list(p_area text, p_before_id bigint default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_operator() then raise exception 'Kein Betreiberzugriff' using errcode = '42501'; end if;
  if p_area not in ('vinted_sync','vinted_actions','kleinanzeigen','push','feed_bot','app') then raise exception 'Ungültiger Bereich' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',e.id,'occurredAt',e.occurred_at,'severity',e.severity,'source',e.source,'code',e.code,
      'message',e.message,'accountLabel',e.account_label,'workspaceName',w.name,'userEmail',u.email,'referenceId',e.reference_id,'detail',e.detail)
      order by e.occurred_at desc, e.id desc)
    from (select * from public.platform_error_events
      where area = p_area and (p_before_id is null or id < p_before_id)
      order by occurred_at desc, id desc limit least(greatest(coalesce(p_limit,100),1),200)) e
    left join public.workspaces w on w.id = e.workspace_id
    left join auth.users u on u.id = e.user_id), '[]'::jsonb);
end;
$$;
revoke all on function public.platform_error_events_list(text,bigint,integer) from public, anon, service_role;
grant execute on function public.platform_error_events_list(text,bigint,integer) to authenticated;

-- Zähler je Bereich für die Übersicht und das Seitenmenü.
create or replace function public.platform_error_events_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_operator() then raise exception 'Kein Betreiberzugriff' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(s.area, jsonb_build_object('lastDay', s.last_day, 'errorsLastDay', s.errors_last_day, 'lastAt', s.last_at))
    from (select area,
        count(*) filter (where occurred_at > clock_timestamp() - interval '24 hours') as last_day,
        count(*) filter (where severity = 'error' and occurred_at > clock_timestamp() - interval '24 hours') as errors_last_day,
        max(occurred_at) as last_at
      from public.platform_error_events group by area) s), '{}'::jsonb);
end;
$$;
revoke all on function public.platform_error_events_summary() from public, anon, service_role;
grant execute on function public.platform_error_events_summary() to authenticated;
