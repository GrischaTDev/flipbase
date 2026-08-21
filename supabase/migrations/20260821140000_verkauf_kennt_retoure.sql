-- Zweck: Ein Verkauf haelt fest, ob er zurueckgegeben wurde und wie viel
--        erstattet wurde.
--
-- Betroffen: public.sales, neue Spalten returned_at und refund_amount.
--
-- Warum: Eine Retoure legte bisher eine Gutschrift an und holte den Artikel
-- ins Lager zurueck, liess den Verkauf aber unveraendert. Dashboard und
-- Auswertungen kennen Retouren nicht und rechneten den Gewinn des Verkaufs
-- weiter mit - waehrend derselbe Gegenstand zugleich wieder als Lagerwert
-- zaehlte. Derselbe Artikel wurde damit doppelt gezaehlt und die Erstattung
-- minderte nichts.
--
-- Bestehende Zeilen bleiben unberuehrt: Ohne Retoure sind beide Spalten leer,
-- und ein Verkauf ohne returned_at zaehlt wie bisher.

alter table public.sales
  add column if not exists returned_at timestamptz,
  add column if not exists refund_amount numeric(10, 2);

comment on column public.sales.returned_at is
  'Zeitpunkt der Retoure. Ist er gesetzt, zaehlt der Verkauf nicht mehr als realisierter Umsatz.';

comment on column public.sales.refund_amount is
  'Tatsaechlich erstatteter Betrag. Kann unter dem Verkaufspreis liegen, etwa bei einer Teilerstattung.';
