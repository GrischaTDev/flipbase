-- Zweck: Der Vinted-Feed bietet nur noch Kategorien zur Auswahl an, die ein aktiver reiner
-- Kategorie-Bot vollständig sammelt. Vinteds Katalogliste nennt keine Artikelkategorie; ohne
-- eigenen Bot blieb eine gewählte Unterkategorie leer und zeigte „sammelt noch nicht“.
-- Betroffen: neue Funktion public.sniper_feed_categories(uuid), liest public.sniper_queries.
-- migration unit 1: schema_changes
-- transaction mode: transactional
-- boundary reason: default

create or replace function public.sniper_feed_categories(p_workspace_id uuid)
returns table (catalog_id integer) language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.can_access_workspace(p_workspace_id) then
        raise exception 'Kein Zugriff auf diesen Arbeitsbereich.' using errcode = '42501';
    end if;

    -- Vinteds Katalogliste nennt keine Artikelkategorie. Vollständig belegt ist eine Kategorie
    -- nur durch einen reinen Kategorie-Bot; Marken-, Text- oder Preisfilter liefern nur einen
    -- Ausschnitt und schalten die Auswahl deshalb nicht frei.
    return query
        select distinct query.catalog_id
        from public.sniper_queries as query
        where query.marketplace = 'vinted'
            and query.is_active
            and query.deleted_at is null
            and query.run_state <> 'invalid'
            and query.catalog_id is not null
            and nullif(btrim(query.search_text), '') is null
            and query.brand_id is null
            and cardinality(query.brand_ids) = 0
            and cardinality(query.title_keywords) = 0
            and cardinality(query.excluded_title_keywords) = 0
            and query.price_from is null
            and query.price_to is null
        order by 1;
end;
$$;
comment on function public.sniper_feed_categories(uuid) is
    'Gibt die Vinted-Kategorien aktiver reiner Kategorie-Bots fuer die Feed-Auswahl zurueck.';
revoke all on function public.sniper_feed_categories(uuid) from public, anon;
grant execute on function public.sniper_feed_categories(uuid) to authenticated;
