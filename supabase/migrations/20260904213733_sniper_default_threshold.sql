-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.create_sniper_subscription(p_workspace_id uuid, p_search_text text, p_brand_id integer, p_price_from numeric, p_price_to numeric, p_threshold numeric);

CREATE FUNCTION public.create_sniper_subscription (
  p_workspace_id uuid,
  p_search_text  text,
  p_brand_id     integer,
  p_price_from   numeric,
  p_price_to     numeric,
  p_threshold    numeric DEFAULT 40
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_search_text text;
  v_query_key text;
  v_query_id uuid;
  v_subscription_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Kein Mitglied dieses Arbeitsbereichs';
  end if;

  v_search_text := lower(btrim(regexp_replace(p_search_text, '\s+', ' ', 'g')));

  if v_search_text is null or v_search_text = '' then
    raise exception 'Der Suchbegriff darf nicht leer sein';
  end if;

  -- Auf zwei Nachkommastellen runden, bevor der Schluessel gebildet wird: die
  -- Spalten sind numeric(12,2), die Parameter aber unbeschraenkt. 50.567 und
  -- 50.566 speichern beide 50.57 - ohne diese Rundung vor der Schluesselbildung
  -- erzeugen sie zwei Abfragezeilen und damit zwei Vinted-Anfragen fuer
  -- denselben gespeicherten Filter.
  p_price_from := round(p_price_from, 2);
  p_price_to := round(p_price_to, 2);

  if p_price_from is not null and p_price_to is not null and p_price_from > p_price_to then
    raise exception 'Die Preisuntergrenze darf nicht ueber der Preisobergrenze liegen';
  end if;

  -- trim_scale streicht nachlaufende Nullen: 50.00 und 50 muessen denselben
  -- Schluessel ergeben, sonst legt derselbe Filter zwei Abfragen an und wird
  -- zweimal gepollt - genau der Sparmechanismus, um den es hier geht.
  v_query_key := concat_ws('|',
    'vinted',
    'search=' || v_search_text,
    'catalog=-',
    'brand=' || coalesce(p_brand_id::text, '-'),
    'price_from=' || coalesce(trim_scale(p_price_from)::text, '-'),
    'price_to=' || coalesce(trim_scale(p_price_to)::text, '-')
  );

  -- Eine stillgelegte Abfrage (drei Fehlschlaege in Folge, is_active = false)
  -- kommt ohne diesen Zweig nie zurueck - do nothing liesse sie stillgelegt.
  -- Wer den Filter neu anlegt, will ihn offensichtlich wieder laufen sehen.
  insert into public.sniper_queries (query_key, search_text, brand_id, price_from, price_to)
  values (v_query_key, v_search_text, p_brand_id, p_price_from, p_price_to)
  on conflict (query_key) do update
    set is_active = true,
        consecutive_failures = 0;

  select id into v_query_id from public.sniper_queries where query_key = v_query_key;

  -- 30 Prozent ist ein Startwert, kein Naturgesetz: do update uebernimmt die
  -- neue Schwelle und setzt das Abonnement wieder aktiv. Ohne diesen Zweig
  -- gaebe es keinen Weg, eine einmal gesetzte Schwelle je zu aendern -
  -- authenticated hat kein UPDATE-Recht auf der Tabelle.
  insert into public.sniper_query_subscriptions
    (workspace_id, query_id, discount_threshold_percent)
  values (p_workspace_id, v_query_id, p_threshold)
  on conflict (workspace_id, query_id) do update
    set discount_threshold_percent = excluded.discount_threshold_percent,
        is_active = true;

  select id into v_subscription_id
  from public.sniper_query_subscriptions
  where workspace_id = p_workspace_id and query_id = v_query_id;

  return v_subscription_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) TO authenticated;

GRANT ALL ON FUNCTION public.create_sniper_subscription(uuid, text, integer, numeric, numeric, numeric) TO service_role;

ALTER TABLE public.sniper_query_subscriptions
  ALTER COLUMN discount_threshold_percent SET DEFAULT 40;