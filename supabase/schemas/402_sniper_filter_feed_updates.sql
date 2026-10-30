create or replace function public.sniper_supported_brands(p_workspace_id uuid)
returns table (brand text) language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    return query
        select distinct btrim(listing.brand) as brand
        from public.sniper_listings as listing
        join public.sniper_queries as query on query.id = listing.discovered_by_query_id
            or exists (select 1 from public.sniper_query_matches matched where matched.query_id = query.id and matched.listing_id = listing.id)
        where query.marketplace = 'vinted'
            and query.is_active
            and query.deleted_at is null
            and listing.first_seen_at >= now() - interval '7 days'
            and nullif(btrim(listing.brand), '') is not null
        order by 1;
end;
$$;
comment on function public.sniper_supported_brands(uuid) is
    'Gibt die tatsaechlich gefundenen Marken aktiver Vinted-Sammelauftraege fuer den Feed zurueck.';
revoke all on function public.sniper_supported_brands(uuid) from public, anon;
grant execute on function public.sniper_supported_brands(uuid) to authenticated;

-- Ein Hinweis je Arbeitsbereich und Planungsschritt. Kein Artikelinhalt und kein Zeilentrigger.
create or replace function public.sniper_notify_feed_updates()
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare v_workspace_id uuid;
begin
    for v_workspace_id in select id from public.workspaces where archived_at is null loop
        perform realtime.send(jsonb_build_object('refresh', true), 'feed_updated',
            'workspace:' || v_workspace_id::text || ':sniper_feed', true);
    end loop;
end;
$$;
comment on function public.sniper_notify_feed_updates() is 'Gebündelter privater Feed-Hinweis nach bestätigten Dienstübernahmen; Inhalte werden ausschließlich über den berechtigten Feed gelesen.';
revoke all on function public.sniper_notify_feed_updates() from public, anon, authenticated;
grant execute on function public.sniper_notify_feed_updates() to service_role;

-- Ungültige Fremdthemen dürfen beim Berechtigungscheck keinen UUID-Fehler auslösen.
create or replace function public.sniper_can_access_feed_topic(p_topic text)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare v_workspace_id uuid;
begin
    if cardinality(string_to_array(p_topic, ':')) <> 3 or split_part(p_topic, ':', 1) <> 'workspace'
       or split_part(p_topic, ':', 3) <> 'sniper_feed' then return false; end if;
    begin
        v_workspace_id := split_part(p_topic, ':', 2)::uuid;
    exception when invalid_text_representation then return false;
    end;
    return p_topic = 'workspace:' || v_workspace_id::text || ':sniper_feed'
        and public.can_access_workspace(v_workspace_id);
end;
$$;
revoke all on function public.sniper_can_access_feed_topic(text) from public, anon, authenticated;
grant execute on function public.sniper_can_access_feed_topic(text) to authenticated, service_role;

create policy "Berechtigte empfangen Sniper Feed Hinweise" on realtime.messages
    for select to authenticated using (
        extension = 'broadcast' and private and topic = (select realtime.topic())
        and public.sniper_can_access_feed_topic(topic));
