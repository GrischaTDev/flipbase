-- zweck: alte fuenfteilige sniper_queries.query_key-werte auf das neue
-- sechsteilige format mit price_from nachziehen.
-- betroffen: public.sniper_queries.query_key.
--
-- von hand geschrieben, nicht per `supabase db diff` erzeugt: es handelt sich
-- um eine datenmigration, kein schemaunterschied.
--
-- der schluessel bildete frueher fuenf segmente (ohne price_from). seit
-- 20260904175250_create_sniper_subscription.sql und der zugehoerigen
-- schemaaenderung bildet create_sniper_subscription sechs segmente mit
-- 'price_from=...' vor 'price_to=...'. eine zeile mit dem alten schluessel
-- wuerde von der neuen funktion nie wiedergefunden - derselbe filter wuerde
-- doppelt angelegt und doppelt gepollt, genau das, was query_key verhindern
-- soll.
--
-- die migration ist auf leeren datenbanken folgenlos: `where query_key not
-- like '%|price_from=%'` trifft auf keine zeile, wenn sniper_queries leer ist
-- oder bereits ausschliesslich sechsteilige schluessel enthaelt. in der
-- produktionsdatenbank stehen aktuell null zeilen in sniper_queries - diese
-- migration ist vorsorglich, nicht rettend.
update public.sniper_queries
set query_key = replace(query_key, '|price_to=', '|price_from=-|price_to=')
where query_key not like '%|price_from=%';
