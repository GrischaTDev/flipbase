-- Artikelrechte: neue Archiv- und Loeschfunktionen sowie die private Bildwarteschlange.
-- Betroffen: catalog_products, article_media_cleanup_jobs und zugehoerige Funktionen.
-- Transaction mode: transactional

revoke all on function public.protect_catalog_product_archive_metadata() from public, anon, authenticated, service_role;
revoke all on function public.reject_archived_product_purchase_line() from public, anon, authenticated, service_role;
revoke all on function public.reject_archived_parent_for_item_operation() from public, anon, authenticated, service_role;
revoke all on function public.reject_archived_parent_item_change() from public, anon, authenticated, service_role;
revoke all on function public.reject_archived_product_lot_reservation() from public, anon, authenticated, service_role;
revoke all on function public.set_catalog_product_archived(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_catalog_product_archived(uuid, uuid, boolean) to authenticated;
revoke all on function public.delete_unused_article(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_unused_article(uuid, text, uuid) to authenticated;

comment on function public.set_catalog_product_archived(uuid,uuid,boolean) is 'Reversible Archivmetadaten ohne Aenderung von Lagerbestand und Buchungen.';
comment on function public.delete_unused_article(uuid,text,uuid) is 'Loescht ausschliesslich unbenutzte Artikel und merkt private Bilder transaktional vor.';
comment on column public.catalog_products.archived_at is 'Reversibler Archivzeitpunkt; kein Bestandsabgang.';
comment on column public.catalog_products.archived_by is 'Angemeldeter Akteur der letzten Archivierung.';
comment on table public.article_media_cleanup_jobs is 'Nach einem erlaubten Artikelloeschen ausstehende private Bilddateien.';

revoke all on public.article_media_cleanup_jobs from public, anon, authenticated, service_role;
grant select on public.article_media_cleanup_jobs to authenticated;
grant select, update on public.article_media_cleanup_jobs to service_role;
