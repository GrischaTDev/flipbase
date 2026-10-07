-- Preserve the largest validated category count across refreshes and restarts.
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.vinted_category_syncs
  ADD COLUMN category_count_high_water integer DEFAULT 0 NOT NULL;
