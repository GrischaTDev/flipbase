-- Zweck: Den Standardnamen eines neuen Shops von "ReFlip Store" auf
--        "Flipbase Store" umstellen. Die Anwendung heisst seit der
--        Umbenennung Flipbase; der alte Name stand sonst weiterhin in jedem
--        neu angelegten Shop.
--
-- Betroffen: public.store_settings, Spalte store_name (nur der Standardwert).
--
-- Bestehende Zeilen bleiben unberuehrt: Wer seinen Shop bereits benannt hat -
-- auch wenn er den alten Standardwert uebernommen hat - behaelt ihn. Ein
-- stiller Namenswechsel im laufenden Betrieb waere ein Eingriff in Daten des
-- Nutzers, nicht eine Umbenennung der Anwendung.

alter table public.store_settings
  alter column store_name set default 'Flipbase Store';
