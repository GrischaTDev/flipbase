-- Zweck: Allgemeine Beschreibung in public.catalog_products ergänzen.
-- Bestehende Artikel und historische Belegangaben bleiben erhalten.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

alter table public.catalog_products
  add column description text;
