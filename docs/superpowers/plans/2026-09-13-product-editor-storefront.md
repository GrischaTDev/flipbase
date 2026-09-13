# Artikelerstellung, Medien und Shop

## Freigegebener Umfang

Eigene Erstellungsseite, gemeinsame Bearbeitung, mehrere Bilder mit einfachem
Zuschnitt, vollständige Anzeige im integrierten Shop und optionaler
Suchmaschineneintrag. Grundlage: `docs/audit/2026-09-13-product-editor-follow-up.md`.
Die bestehende Anmeldung und Zahlungsdemo bleiben erhalten. Metadaten werden
tatsächlich ausgegeben, der Shop bleibt bis zur gesonderten öffentlichen Freigabe
mit `noindex` versehen. Eine Google-Indexierung wird nicht zugesagt.

## Verträge und Arbeitspakete

1. **Editor (Hauptaufgabe):** `/catalog/new` vor `/catalog/:id`, dieselbe Seite
   für Erstellung/Bearbeitung. Neue Artikel zunächst intern. Titel erforderlich;
   EAN und Shoppreis wie bisher validieren. Nach Teilerfolg keine doppelte
   Artikelerstellung und keine doppelten Uploads. Workspacewechsel bewahrt den
   ursprünglichen Entwurf und verhindert Schreiben in den falschen Workspace.
2. **Medienbedienung (Agent):** Datenfreie Komponente `product-media-editor` mit
   `images: readonly ProductImageDraft[]`, `disabled`, `imagesChange`.
   Arrayreihenfolge bestimmt Hauptbild. Dateiauswahl/Drop, Vorschau, Zuschnitt,
   Entfernen und zugängliche Sortierknöpfe. Bestehende Cropperbibliothek nutzen;
   bestehende Verbraucher des gemeinsamen Modals erhalten.
3. **Speicherung (Agent):** nullable `seo_title`, `seo_description`, `url_handle`
   am Katalogartikel; Serviceeingaben `seoTitle`, `seoDescription`, `urlHandle`.
   Galerie über `MediaService.updateProductMediaLayout(productId, orderedMediaIds,
expectedMediaIds, workspaceId)` atomar speichern; Rückgabe `{data,error}` mit
   Medienliste. Erwartete ID-Menge erkennt konkurrierende Änderungen. Zugriff
   bleibt auf Workspace begrenzt, erstes Bild wird Hauptbild, entfernte Dateien
   erst nach erfolgreicher Metadatenänderung aufräumen. Deklaratives Schema,
   erzeugte Migration, frisch erzeugte Typen und Datenbanktests.
4. **Shop (Agent):** Gemeinsame Verkaufsprojektion auch für Katalogartikel,
   Beschreibung/Bilder/korrekter Preis und verfügbarer Bestand. Nur wirklich
   freigegebene Artikel zeigen. Titel, Beschreibung, Canonical und `noindex`
   über Angular ausgeben und beim Verlassen bereinigen. Stabile ID in URL;
   optionaler lesbarer Pfadteil, alte URLs bleiben gültig. Gemeinsame Helfer in
   `core/utils/product-seo.ts`: `productStorePath`, `productSeoTitle`,
   `productSeoDescription`, `normalizeProductHandle`.

## Speicherung eines Medienentwurfs

Der Editor hält gespeicherte Medien und neue Dateien in einer geordneten Liste.
Er bestätigt jeden erfolgreichen Upload sofort im Entwurf. Erst danach speichert
er die vollständige Reihenfolge mit der erwarteten ID-Menge. Fehlgeschlagene
Dateien bleiben erneut speicherbar. Zuschnitt ersetzt das Bild erst beim Speichern.
Ein bereits angelegter Artikel bleibt bei einem Medienfehler derselbe Artikel.

## Prüfungen und Abschluss

- Gezielte Service-, Komponenten- und SQL-Tests: Erstellung, Teilfehler,
  Reihenfolge/Hauptbild/Löschen, konkurrierende Änderung, fremder Workspace,
  Shopfreigabe/Bestand, Metadaten und Aufräumen.
- Browser: Erstellung/Bearbeitung, mehrere Bilder, Cropper, Reihenfolge,
  Shopdetail, Mobilansicht, Tastatur und AXE. Bestehende Einkaufsverbraucher prüfen.
- Betroffene Dateien formatieren/linten, App- und Testtypen, Produktionsbau,
  Shared-UI- und Testzuordnungsprüfung. Unabhängiger Review vor Abschluss.
- Noch kein Push: nach fertiger lokaler Prüfung die projektweit festgelegte
  Frage zur PR-Erstellung und anschließendem Merge stellen.
