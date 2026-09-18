-- Lokales Testkonto mit Beispieldaten.
-- Läuft nur bei `supabase db reset`/`supabase start` auf dem eigenen Rechner und in CI,
-- nie auf dem Live-Server (abgesichert durch scripts/seed-isolation.test.mjs).
-- Anmeldung lokal: test@flipbase.local / flipbase-test

do $$
declare
  v_user_id constant uuid := '5eed0000-0000-4000-8000-000000000001';
  v_workspace_id uuid;
  v_purchase_id uuid;
  v_line record;
  v_sold_item_id uuid;
begin
  -- Leere Token-Felder statt NULL: GoTrue lehnt die Anmeldung sonst ab.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'test@flipbase.local', extensions.crypt('flipbase-test', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Testkonto"}', now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', 'test@flipbase.local', 'email_verified', true),
    'email', now(), now(), now()
  );

  select member.workspace_id into v_workspace_id
  from public.workspace_members as member
  where member.user_id = v_user_id
  limit 1;

  -- Die Geschäftsfunktionen prüfen die Anmeldung über auth.uid().
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );

  v_purchase_id := (
    public.create_purchase(
      v_workspace_id,
      jsonb_build_object(
        'type', 'lot',
        'title', 'Retro-Konsolen Paket',
        'purchase_date', '2026-09-01',
        'purchase_price', 150,
        'discount_amount', 0,
        'content_status', 'known',
        'pricing_mode', 'individual',
        'shipment_status', 'arrived',
        'cost_allocation_mode', 'even'
      ),
      '[]'::jsonb,
      '[
        {"client_ref":"seed-1","catalog_product_id":null,"title_snapshot":"Nintendo Game Boy Color","line_kind":"individual","is_package":false,"ordered_quantity":1,"price_mode":"priced","unit_purchase_price":60,"line_total":60,"allocated_additional_cost":0},
        {"client_ref":"seed-2","catalog_product_id":null,"title_snapshot":"SNES Controller Original","line_kind":"individual","is_package":false,"ordered_quantity":1,"price_mode":"priced","unit_purchase_price":50,"line_total":50,"allocated_additional_cost":0},
        {"client_ref":"seed-3","catalog_product_id":null,"title_snapshot":"Pokémon Smaragd (GBA)","line_kind":"individual","is_package":false,"ordered_quantity":1,"price_mode":"priced","unit_purchase_price":40,"line_total":40,"allocated_additional_cost":0}
      ]'::jsonb
    ) #>> '{purchase,id}'
  )::uuid;

  for v_line in
    select line.id, line.title_snapshot
    from public.purchase_lines as line
    where line.workspace_id = v_workspace_id and line.purchase_id = v_purchase_id
  loop
    perform public.receive_individual_purchase_line(
      v_workspace_id, v_purchase_id, v_line.id, jsonb_build_object('title', v_line.title_snapshot)
    );
  end loop;
  perform public.finalize_purchase_costing(v_workspace_id, v_purchase_id);

  -- Direkter Insert wie in der Anwendung: Artikel ohne Einkauf legt auch die App
  -- so an (kein DB-Funktionsaufruf nötig); die schützenden Trigger greifen trotzdem.
  insert into public.inventory_items (workspace_id, title, condition, status, expected_value) values
    (v_workspace_id, 'Levi''s 501 Vintage Jeans (W32 L34)', 'used', 'ready', 55),
    (v_workspace_id, 'Canon EOS M50 Mark II', 'like_new', 'ready', 480);

  select item.id into v_sold_item_id
  from public.inventory_items as item
  where item.workspace_id = v_workspace_id
    and item.purchase_id = v_purchase_id
    and item.title = 'Pokémon Smaragd (GBA)';

  perform public.record_sale(
    v_workspace_id,
    '{"platform":"kleinanzeigen","sale_date":"2026-09-10"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'inventory_item_id', v_sold_item_id,
      'title_snapshot', 'Pokémon Smaragd (GBA)',
      'quantity', 1,
      'unit_sale_price', 110
    ))
  );
end;
$$;
