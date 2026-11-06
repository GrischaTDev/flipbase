-- Admin-Produktsuche: Tabelle vinted_ai_searches, Reservierung und Verbrauchsauswertung.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

set check_function_bodies = false;

create function public.reserve_vinted_ai_search (
  p_user_id      uuid,
  p_workspace_id uuid,
  p_listing_id   uuid,
  p_input_hash   text,
  p_model        text
)
  returns jsonb
  language plpgsql
  set search_path to ''
  as $function$
declare
    v_search public.vinted_ai_searches;
begin
    if not exists (select 1 from public.platform_operators where user_id = p_user_id)
        or not public.user_can_access_workspace(p_workspace_id, p_user_id) then
        raise exception 'Kein Admin-Zugriff.' using errcode = '42501';
    end if;
    if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or p_model is null or p_model not in ('gpt-6-luna', 'gpt-6.1-sol')
        or not exists (select 1 from public.sniper_listings where id = p_listing_id and marketplace = 'vinted') then
        raise exception 'Ungueltige Suchdaten.' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 540));
    select * into v_search from public.vinted_ai_searches
        where user_id = p_user_id and workspace_id = p_workspace_id and listing_id = p_listing_id
        and input_hash = p_input_hash and model = p_model and status = 'completed'
        and created_at > now() - interval '24 hours' order by created_at desc limit 1;
    if found then return jsonb_build_object('id', v_search.id, 'cached', true, 'result', v_search.result); end if;
    if exists (select 1 from public.vinted_ai_searches where user_id = p_user_id and status = 'pending' and created_at > now() - interval '2 minutes') then
        return jsonb_build_object('error', 'search_busy');
    end if;
    if (select count(*) from public.vinted_ai_searches where user_id = p_user_id and created_at > now() - interval '1 hour') >= 20
        or (select count(*) from public.vinted_ai_searches where user_id = p_user_id and created_at > now() - interval '1 day') >= 100 then
        return jsonb_build_object('error', 'search_limit');
    end if;
    -- Ein abgerissener Request bleibt ausdrücklich kostenmäßig ungeklärt.
    update public.vinted_ai_searches set status = 'unknown', error_code = 'interrupted', finished_at = now()
        where user_id = p_user_id and status = 'pending';
    insert into public.vinted_ai_searches(user_id, workspace_id, listing_id, input_hash, model)
        values (p_user_id, p_workspace_id, p_listing_id, p_input_hash, p_model) returning * into v_search;
    return jsonb_build_object('id', v_search.id, 'cached', false);
end;
$function$;

REVOKE ALL on function public.reserve_vinted_ai_search(uuid, uuid, uuid, text, text) FROM PUBLIC;

GRANT ALL on function public.reserve_vinted_ai_search(uuid, uuid, uuid, text, text) to service_role;

create function public.vinted_ai_search_usage (
  p_workspace_id uuid
)
  returns jsonb
  language sql
  stable
  set search_path to ''
  as $function$
    select coalesce(jsonb_agg(to_jsonb(summary)), '[]'::jsonb) from (
        select model, count(*) as requests,
            count(*) filter (where estimated_cost_usd is null) as unknown_cost_requests,
            sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)) as total_tokens,
            sum(web_search_calls) as web_search_calls,
            sum(estimated_cost_usd) as estimated_cost_usd,
            avg(estimated_cost_usd) as average_cost_usd
        from public.vinted_ai_searches
        where workspace_id = p_workspace_id and created_at > now() - interval '30 days'
        group by model order by model
    ) as summary;
$function$;

REVOKE ALL on function public.vinted_ai_search_usage(uuid) FROM PUBLIC;

GRANT ALL on function public.vinted_ai_search_usage(uuid) to authenticated;

GRANT ALL on function public.vinted_ai_search_usage(uuid) to service_role;

create table public.vinted_ai_searches (
  id                  bigint                   GENERATED ALWAYS as IDENTITY NOT NULL,
  user_id             uuid                     NOT NULL,
  workspace_id        uuid                     NOT NULL,
  listing_id          uuid                     NOT NULL,
  input_hash          text                     NOT NULL,
  model               text                     NOT NULL,
  status              text                     default 'pending'::text NOT NULL,
  response_id         text,
  input_tokens        integer,
  cached_input_tokens integer,
  output_tokens       integer,
  web_search_calls    integer,
  estimated_cost_usd  numeric(14,8),
  pricing             jsonb,
  result              jsonb,
  error_code          text,
  created_at          timestamp with time zone default now() NOT NULL,
  finished_at         timestamp with time zone
);

COMMENT on table public.vinted_ai_searches IS 'Admin-Analysen mit dauerhaftem Verbrauch; NULL-Kosten bedeuten unbekannten Verbrauch, niemals kostenlos. Keine Bilder oder Inseratbeschreibungen im Protokoll.';

ALTER table public.vinted_ai_searches
  ENABLE row LEVEL security;

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_cached_input_tokens_check CHECK (cached_input_tokens >= 0);

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_estimated_cost_usd_check CHECK (estimated_cost_usd >= 0::numeric);

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_input_tokens_check CHECK (input_tokens >= 0);

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_model_check CHECK (model = ANY (ARRAY['gpt-6-luna'::text, 'gpt-6.1-sol'::text]));

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_output_tokens_check CHECK (output_tokens >= 0);

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_pkey PRIMARY KEY (id);

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'unknown'::text]));

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) on delete CASCADE;

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_web_search_calls_check CHECK (web_search_calls >= 0);

ALTER table public.vinted_ai_searches
  ADD constraint vinted_ai_searches_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) on delete CASCADE;

GRANT SELECT on public.vinted_ai_searches to authenticated;

GRANT ALL on public.vinted_ai_searches to service_role;

create INDEX vinted_ai_searches_cache_idx on public.vinted_ai_searches (user_id, workspace_id, listing_id, input_hash, model, created_at DESC)
  WHERE status = 'completed'::text;

create INDEX vinted_ai_searches_user_time_idx on public.vinted_ai_searches (user_id, created_at DESC);

create INDEX vinted_ai_searches_workspace_idx on public.vinted_ai_searches (workspace_id);

create POLICY "Admins lesen eigene Suchkosten" on public.vinted_ai_searches
  for SELECT
  to authenticated
  USING (((user_id = ( SELECT auth.uid() as uid)) AND ( SELECT public.is_platform_operator() as is_platform_operator) AND public.can_access_workspace(workspace_id)));

-- Explizite Rechte aus 540_vinted_ai_search.sql
revoke all on public.vinted_ai_searches from public, anon, authenticated;
grant select on public.vinted_ai_searches to authenticated;
grant all on public.vinted_ai_searches to service_role;
revoke all on sequence public.vinted_ai_searches_id_seq from public, anon, authenticated;
grant usage, select on sequence public.vinted_ai_searches_id_seq to service_role;
revoke all on function public.reserve_vinted_ai_search(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_vinted_ai_search(uuid, uuid, uuid, text, text) to service_role;
revoke all on function public.vinted_ai_search_usage(uuid) from public, anon;
grant execute on function public.vinted_ai_search_usage(uuid) to authenticated;
