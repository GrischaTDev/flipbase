-- Laengere Admin-Artikelrecherche: Reservierungen in public.vinted_ai_searches
-- drei Minuten gueltig halten, damit laufende Anfragen nicht parallel neu starten.
-- Aus zwei isolierten Datenbanken mit der Supabase-CLI erzeugter Funktionsdiff.

set check_function_bodies = false;

create or replace function public.reserve_vinted_ai_search (
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
$function$;