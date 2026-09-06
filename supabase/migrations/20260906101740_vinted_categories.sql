-- Zweck: Kategoriebaum von Vinted speicherbar machen.
-- Betroffen: neue Tabellen public.vinted_categories und
-- public.vinted_category_sync samt RLS, Policies und Spaltenrechten.
-- Nicht destruktiv: legt nur an.
--
-- Der Abgleich (`npx supabase db diff -f vinted_categories`) hat zusaetzlich
-- Neudeklarationen von zehn bereits bestehenden, mit dieser Aufgabe nicht
-- verwandten Funktionen erzeugt (add_purchase_lines, correct_purchase_costing,
-- create_purchase, finalize_purchase_costing, is_valid_gtin,
-- migrate_purchase_costing_legacy, receive_individual_purchase_line,
-- set_purchase_line_eans, sync_inventory_item_ean, update_purchase_draft).
-- Ein Abgleich der jeweiligen Definition in den Schemadateien gegen den
-- erzeugten Text (Stichprobe: is_valid_gtin) zeigt keinen inhaltlichen
-- Unterschied - nur Gross-/Kleinschreibung, Einrueckung und
-- $$ statt $function$ als Trennzeichen. Diese Datei bleibt bewusst auf die
-- zwei neuen Tabellen begrenzt; die zehn Neudeklarationen wurden entfernt,
-- damit diese Migration wirklich nur anlegt. Die vorbestehende Abweichung
-- zwischen Schemadateien und angewandten Migrationen bei diesen zehn
-- Funktionen ist unabhaengig von dieser Aufgabe und wird nicht hier behoben.
--
-- Der Abgleich hat ausserdem zwei Anweisungen nicht erfasst und sie wurden
-- von Hand nachgetragen: `revoke all` auf beiden neuen Tabellen (bei einer
-- neu angelegten Tabelle ohne vorherige Rechte ein No-Op, der Diff-Vergleich
-- erzeugt daher keine Anweisung dafuer) und das `insert` der Einzelzeile in
-- vinted_category_sync (Daten-, keine Schemaaenderung, wird von einem reinen
-- Schema-Diff nicht erkannt).
--
-- Abweichung von der urspruenglichen Schemavorlage: `grant select ... to anon`
-- auf beiden Tabellen kam nachtraeglich dazu. Ohne dieses Recht bricht eine
-- Abfrage als anon schon an der Zugriffsrechte-Pruefung mit "permission
-- denied" ab, bevor RLS ueberhaupt greift - der pgTAP-Test in
-- supabase/tests/vinted_categories.sql erwartet aber ein glattes
-- Ergebnis von null Zeilen. Der eigentliche Schutz kommt weiterhin aus der
-- fehlenden anon-Policy: Ohne sie liefert RLS an anon in jedem Fall null
-- Zeilen, das blosse select-Recht aendert daran nichts.

CREATE TABLE public.vinted_categories (
  id         integer                  NOT NULL,
  parent_id  integer,
  title      text                     NOT NULL,
  slug       text                     NOT NULL,
  path       text                     NOT NULL,
  is_leaf    boolean                  DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.vinted_categories IS 'Der Kategoriebaum von Vinted, flach gespeichert. Die id ist die Nummer von Vinted, keine eigene - sie geht so in catalog_ids einer Abfrage.';

COMMENT ON COLUMN public.vinted_categories.path IS 'Lesbarer Pfad wie "Damen > Schuhe > Stiefel". Steht hier statt im Frontend, damit Suche und Anzeige dieselbe Zeichenkette benutzen.';

COMMENT ON COLUMN public.vinted_categories.is_leaf IS 'Ob die Kategorie keine Unterkategorien hat. Nur Blaetter sind als Sammelauftrag sinnvoll eng.';

ALTER TABLE public.vinted_categories
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vinted_categories
  ADD CONSTRAINT vinted_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.vinted_categories
  ADD CONSTRAINT vinted_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.vinted_categories(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.vinted_categories FROM anon, authenticated;

GRANT SELECT ON public.vinted_categories TO authenticated;

GRANT SELECT ON public.vinted_categories TO anon;

GRANT ALL ON public.vinted_categories TO service_role;

CREATE INDEX idx_vinted_categories_parent ON public.vinted_categories (parent_id);

CREATE INDEX idx_vinted_categories_leaf ON public.vinted_categories (is_leaf);

CREATE POLICY "Angemeldete lesen Kategorien" ON public.vinted_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.vinted_category_sync (
  id              integer                  DEFAULT 1 NOT NULL,
  refreshed_at    timestamp with time zone,
  requested_at    timestamp with time zone,
  last_attempt_at timestamp with time zone,
  category_count  integer                  DEFAULT 0 NOT NULL,
  last_error      text
);

COMMENT ON TABLE public.vinted_category_sync IS 'Wann der Kategoriebaum zuletzt eingelesen wurde, ob eine Auffrischung angefordert ist und was zuletzt schiefging. Genau eine Zeile.';

COMMENT ON COLUMN public.vinted_category_sync.requested_at IS 'Von der Administration gesetzt. Liegt der Wert nach refreshed_at, liest der Dienst beim naechsten Takt neu ein. Bewusst ueber die Datenbank statt ueber einen Endpunkt: Der Dienst hat keinen offenen Eingang, und ein Feld genuegt.';

ALTER TABLE public.vinted_category_sync
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vinted_category_sync
  ADD CONSTRAINT vinted_category_sync_id_check CHECK (id = 1);

ALTER TABLE public.vinted_category_sync
  ADD CONSTRAINT vinted_category_sync_pkey PRIMARY KEY (id);

-- Muss nach der Primaerschluessel-Anlage stehen, sonst fehlt ON CONFLICT (id)
-- das Ziel dafuer (SQLSTATE 42P10).
INSERT INTO public.vinted_category_sync (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE public.vinted_category_sync FROM anon, authenticated;

GRANT SELECT ON public.vinted_category_sync TO authenticated;

GRANT SELECT ON public.vinted_category_sync TO anon;

GRANT UPDATE (requested_at) ON public.vinted_category_sync TO authenticated;

GRANT ALL ON public.vinted_category_sync TO service_role;

CREATE POLICY "Administration fordert Auffrischung an" ON public.vinted_category_sync
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

CREATE POLICY "Angemeldete lesen den Auffrischungsstand" ON public.vinted_category_sync
  FOR SELECT
  TO authenticated
  USING (true);
