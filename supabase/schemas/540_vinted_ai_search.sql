-- Admin-Produktsuche: reservierte Anfragen, Verbrauch und geschätzte USD-Kosten.
create table public.vinted_ai_searches (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    listing_id uuid not null,
    input_hash text not null,
    model text not null check (model in ('gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra')),
    status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'unknown')),
    response_id text,
    input_tokens integer check (input_tokens >= 0),
    cached_input_tokens integer check (cached_input_tokens >= 0),
    output_tokens integer check (output_tokens >= 0),
    web_search_calls integer check (web_search_calls >= 0),
    estimated_cost_usd numeric(14,8) check (estimated_cost_usd >= 0),
    pricing jsonb,
    result jsonb,
    error_code text,
    created_at timestamptz not null default now(),
    finished_at timestamptz
);
comment on table public.vinted_ai_searches is 'Admin-Analysen mit dauerhaftem Verbrauch; NULL-Kosten bedeuten unbekannten Verbrauch, niemals kostenlos. Keine Bilder oder Inseratbeschreibungen im Protokoll.';
create index vinted_ai_searches_user_time_idx on public.vinted_ai_searches(user_id, created_at desc);
create index vinted_ai_searches_workspace_idx on public.vinted_ai_searches(workspace_id);
create index vinted_ai_searches_cache_idx on public.vinted_ai_searches(user_id, workspace_id, listing_id, input_hash, model, created_at desc) where status = 'completed';
alter table public.vinted_ai_searches enable row level security;
create policy "Admins lesen eigene Suchkosten" on public.vinted_ai_searches
    for select to authenticated
    using (user_id = (select auth.uid()) and (select public.is_platform_operator()) and public.can_access_workspace(workspace_id));
revoke all on public.vinted_ai_searches from public, anon, authenticated;
grant select on public.vinted_ai_searches to authenticated;
grant all on public.vinted_ai_searches to service_role;
revoke all on sequence public.vinted_ai_searches_id_seq from public, anon, authenticated;
grant usage, select on sequence public.vinted_ai_searches_id_seq to service_role;

-- Nur die authentifizierte Edge Function mit Dienstrolle darf Kosten reservieren.
-- Der Nutzer-Lock verhindert parallele kostenpflichtige Aufrufe auch über mehrere Tabs.
create or replace function public.reserve_vinted_ai_search(p_user_id uuid, p_workspace_id uuid, p_listing_id uuid, p_input_hash text, p_model text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    v_search public.vinted_ai_searches;
begin
    if not exists (select 1 from public.platform_operators where user_id = p_user_id)
        or not public.user_can_access_workspace(p_workspace_id, p_user_id) then
        raise exception 'Kein Admin-Zugriff.' using errcode = '42501';
    end if;
    if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' or p_model is null or p_model not in ('gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra')
        or not exists (select 1 from public.sniper_listings where id = p_listing_id and marketplace = 'vinted') then
        raise exception 'Ungueltige Suchdaten.' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 540));
    select * into v_search from public.vinted_ai_searches
        where user_id = p_user_id and workspace_id = p_workspace_id and listing_id = p_listing_id
        and input_hash = p_input_hash and model = p_model and status = 'completed'
        and created_at > now() - interval '24 hours' order by created_at desc limit 1;
    if found then return jsonb_build_object('id', v_search.id, 'cached', true, 'result', v_search.result); end if;
    if exists (select 1 from public.vinted_ai_searches where user_id = p_user_id and status = 'pending' and created_at > now() - interval '3 minutes') then
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
$$;
revoke all on function public.reserve_vinted_ai_search(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_vinted_ai_search(uuid, uuid, uuid, text, text) to service_role;

create or replace function public.vinted_ai_search_usage(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
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
$$;
revoke all on function public.vinted_ai_search_usage(uuid) from public, anon;
grant execute on function public.vinted_ai_search_usage(uuid) to authenticated;
