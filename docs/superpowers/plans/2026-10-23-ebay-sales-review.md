# eBay-Verkaufsprüfung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** eBay-Daten dauerhaft anzeigen und verknüpfte Verkäufe mit sofortiger Reservierung zur persönlichen Buchungsprüfung vorbereiten.

**Architecture:** Persönliche eBay-Verbindungen und stabile Quellenkennungen bleiben die Zugriffsgrenze. Neue deklarative Cache- und Entwurfstabellen ergänzen den vorhandenen Hintergrundbeobachter und die bestehende geprüfte Buchung. Die Oberfläche nutzt gemeinsame Tabellen, Artikelauswahl und Verkaufsformulare.

**Tech Stack:** Bestehendes Angular 22, Tailwind, Supabase/PostgreSQL, Deno und Node; keine neuen Anwendungsabhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-10-23-ebay-sales-review-design.md`, vom Nutzer ausdrücklich zur Umsetzung freigegeben.

## Global Constraints

- Sofortige eigene Reservierung; endgültige Buchung, Umsatz und Gewinn erst nach Bestätigung.
- Historischer Erstimport bleibt ohne automatische Reservierung und Verkaufsmeldung.
- Vorhandenen Verkauf zuordnen erzeugt weder zweiten Verkauf noch weiteren Bestandsabgang.
- Unbekannte Kosten bleiben unbekannt. Käuferporto ist kein eigener Versandaufwand.
- Kontozugriff, Workspace, Umgebung und Autorisierungsfassung serverseitig prüfen; RLS und explizite Rechte.
- Schema deklarativ, erzeugte neue Migrationen, generierte Typen; historische Migrationen unverändert.
- Eigener Zweig `juna/ebay-sales-review`, fremde Zweige erhalten, keine Produktivänderungen oder Pushes vor separatem PR-Abschluss.
- Chat, Kommentare, Oberfläche und Dokumentation Deutsch; Code-Bezeichner Englisch; Name ausschließlich Juna.

## Review Focus

1. Ein bereits ohne Bestellnummer manuell erfasster Altverkauf darf beim Erstimport nicht noch einmal reserviert werden: Task 1/2 testen stillen historischen Import.
2. Paket mit mehrfach gleichem Zielartikel und Fehlbestand darf keine Teilreservierung hinterlassen: Task 2 prüft atomare Mengenaggregation.
3. Kontotrennung bei offener Reservierung darf keinen belegten Vorgang verlieren: Task 2 erhält interne Klärbarkeit und prüft fremden Quellzugriff.
4. Später bezahlte oder stornierte ältere Bestellung darf trotz altem Kaufdatum nicht aus dem Änderungsfenster fallen: Task 1 testet Änderungszeit und Wiederaufnahme.
5. Antwortverlust und konkurrierende manuelle Buchung dürfen Bestand und Meldungen nicht verdoppeln: Task 2 und Task 4 prüfen idempotente Quellenbelege.

## Task 1: Dauerhafte eBay-Lesekopien und unabhängiger Abgleich

**Files:**

- Create: `supabase/schemas/474_ebay_cache.sql`, `supabase/tests/ebay-cache.test.sql`.
- Create: `supabase/functions/_shared/ebay-cache-contracts.ts` für getypte Cache-/Abgleichverträge.
- Modify: `supabase/config.toml`, `supabase/functions/ebay-account/{index,handler}.ts`, `supabase/functions/ebay-order-observer/{index,handler}.ts`, zugehörige Tests.
- Modify: `supabase/functions/_shared/ebay-{api,contracts,order-import-contracts,order-source}.ts` und Tests für normalisierte Kosten-/Bildangaben.
- Modify: `services/push-worker/src/ebay-order-observer.ts`, seine Tests sowie notwendige Konfiguration.
- Generate: neue Migration und `src/app/core/models/supabase.types.ts`.

**Interfaces:**

- Produces: `EbayOrderSource.platformFeeCents?: number | null` und pro Quellposition `imageUrl?: string | null`; fehlende optionale Werte ändern bestehende Verträge nicht.
- Produces: bestehende `listings`-/`orders`-Aktionen liefern `EbayPage<T>` mit optionalem `sync`-Metadatum aus der Datenbank. Vollständiger Cache bleibt beim Hintergrundabgleich verfügbar.
- Produces: serverseitige, nur für berechtigte persönliche Konten lesbare Cache-RPCs und schreibende Worker-RPCs; ihre genauen getypten Parameter stehen in `ebay-cache-contracts.ts` und werden von Task 2/3 übernommen.
- Consumes: bestehende Kontolease, `parseEbayOrderSource`, `ebayOrderSourceKey`, `EbayOrderObserver` und dessen Hintergrundschleife.

- [ ] Zuerst Regressionen für persönliche Cache-Rechte, stillen Erstimport, Teilseiten/Abbruch, Änderung einer älteren Bestellung und Abgleich ohne Push schreiben und rot ausführen.
- [ ] Kontogebundene normalisierte Daten und Abgleichfortschritt speichern. Cache-Lesen verwendet keine eBay-Anfrage. Kaltstart kann einen klar benannten Erstabgleich anstoßen, ohne vorhandene Zeilen zu leeren.
- [ ] Orders nach Änderungszeit, Inserate in begrenzten vollständigen Durchläufen synchronisieren. Erst nach vollständigem Durchlauf fortschreiben; keine Vollständigkeit aus einer Teilantwort ableiten.
- [ ] Gebühren aus `totalMarketplaceFee` normalisieren; `totalFeeBasisAmount` niemals als Gebühr verwenden. Bildquellen nach Quellkennung zusammenführen, ohne Renderanfragen je Zeile.
- [ ] Persistente und neue Anbieterbestellungen unterscheidbar halten, damit Task 2 nur neue vollständig zugeordnete Bestellungen automatisch vorbereitet. Vorhandene Push-Präferenzen beim Versand beibehalten.
- [ ] Schema auf isolierter lokaler Testbasis anwenden, Migration erzeugen/prüfen und Typen generieren. Fremde Container nicht stoppen.
- [ ] Deno-Tests für eBay-Parser, Konto und Observer, Node-Observertests und passende SQL-Tests ausführen. Ergebnis und konkrete RPC-Verträge im Taskbericht festhalten, dann lokal committen.

## Task 2: Verkaufsentwürfe, eigene Reservierungen und Quellenabgleich

**Files:**

- Create: `supabase/schemas/475_ebay_sale_drafts.sql`, `supabase/tests/ebay-sale-drafts.test.sql`.
- Create: `supabase/functions/_shared/ebay-sale-draft-contracts.ts`.
- Modify: `supabase/schemas/330_ebay_order_import.sql` und/oder spätere deklarative Funktionsdefinitionen für Reservierungsabschluss und Altverkaufszuordnung.
- Modify: `supabase/functions/ebay-account/order-import.ts`, `index.ts`, zugehörige Tests; Task-1-Cache-Speicher nur über klaren Übergabehaken ergänzen.
- Modify: nötige Bestandsauswahl/-sicht und Registrierungen; neue Migration und Typen erzeugen.

**Interfaces:**

- Consumes: Task-1-Cache-Verträge, stabile `sourceKey`-Identität, bestehende `EbayOrderAssignment` und `EbayOrderCosts`.
- Produces: `EbaySaleDraft` mit stabiler ID, Workspace/Kontobezug, `orderId`, `source`, `assignments`, speicherbaren Kosten und Zustand `needs_mapping | needs_stock | needs_costs | ready_for_review | blocked | booked | linked_existing | dismissed`.
- Produces: berechtigte Lese-/Speicheraktionen für offene Entwürfe; `order_review` berücksichtigt gespeicherte Zuordnung und bestätigte Kosteneingaben, `order_book` bleibt die einzige endgültige Quellenbuchung.
- Produces: separater kontogebundener Glockenstrom mit stabiler Ereigniskennung und persönlichen Zugriffsgrenzen; konkrete TS-/RPC-Verträge in der neuen Vertragsdatei.

- [ ] SQL- und Edge-Regressionen zuerst schreiben: eigener gegenüber fremdem Bestand, Pakete atomar, Doppelabruf, verkaufter Altartikel, Kosten unbekannt/Null, Buchung nach Reservierung, Antwortverlust, Storno und Refund.
- [ ] Dauerhaften Entwurf aus neuem bezahltem vollständig zugeordnetem Cache-Vorgang erzeugen. Historische/unverknüpfte Vorgänge erst bei ausdrücklicher Bearbeitung vorbereiten.
- [ ] Eigene Reservierungsbesitzer speichern. Konkrete Einzelstücke reservieren; Katalogmengen auf vorhandene Lose beziehen und verfügbare Mengen in allen bestehenden Buchungswegen schützen. Paketmengen aggregieren und gemeinsam sperren.
- [ ] Nach erneutem Anbieterabgleich eigene Reservierung in derselben Transaktion wie `record_sale` und Quellenbeleg umwandeln. Fremde Reservierungen bleiben unberührt. Fehler rollt Freigabe und Buchung gemeinsam zurück.
- [ ] Vorhandenen vollständigen eBay-Verkauf anhand seiner Positionen auswählen und zuordnen; fremde, zurückgenommene oder schon zugeordnete Verkäufe ablehnen. Eigene Entwurfsreservierung genau einmal freigeben.
- [ ] Eindeutiges Storno vor Buchung löst die eigene Reservierung; Erstattung/Unklarheit verlangt Klärung. Gebuchte Belege werden nicht automatisch zurückgebucht. Kontotrennung erhält die interne Reservierungsklärung.
- [ ] Eine dauerhafte Glockenmeldung pro neuem Verkauf erzeugen, persönlichen Zugriff prüfen, Erstbasis still halten und doppelten Push bei späterer Bestätigung verhindern.
- [ ] Migration und Typen erzeugen, SQL-/Edge-Tests einschließlich alter eBay-Importfälle ausführen und lokal committen.

## Task 3: Gespeicherte Tabellen, Zuordnung und Verkaufsprüfung bedienen

**Files:**

- Modify: `src/app/features/marketplaces/services/ebay-account{,-api}.service.ts` soweit vorhanden und `ebay-account.store.ts`, zugehörige Tests.
- Modify: `src/app/features/marketplaces/components/ebay-account/ebay-account.component.{ts,html}` und Zuordnungskomponente.
- Modify: `src/app/features/sales/{sales.component,services/ebay-sale-review.store,pages/ebay-sale-review/ebay-sale-review.component,utils/ebay-sale-entry}` und passende Modelle/Tests.
- Create: kleine Feature-Services/Modelle/Komponenten für Entwurfsbereich und eBay-Glockenstrom; `src/app/layout/header/` gezielt einbinden.
- Modify: bestehende eBay-/Verkaufsbrowserfälle und erforderliche Testregistrierung.

**Interfaces:**

- Consumes: Task-1-Cache und Task-2-Entwurf-/Meldungsverträge. UI-Komponenten führen keine direkten Tabellenabfragen aus.
- Produces: gespeicherte Listen mit Aktualisierungshinweis, Bestellbilder, sichtbare Zuordnung und Auswahl „Noch nicht erfasst“ gegenüber „Bereits als Verkauf erfasst“.
- Produces: dauerhafte prüfbare eBay-Entwürfe unter Verkäufe, vorgefüllte belegte Gebühren, erforderliche Kostenlücken und klare Reservierungsanzeige.

- [ ] Angular-Regressionen für Rücknavigation, Workspacewechsel, Bilder, bestehende verkaufte Ziele, unbekannte Gebühren/Porto und fehlgeschlagene Speicherung zuerst rot ausführen.
- [ ] Erst Cache zeigen, beim Aktualisieren vorhandene Zeilen erhalten. Fehler und letzter Abgleich bleiben sichtbar; unabhängige Konto-/Workspacewerte nicht vermischen.
- [ ] Bestehende Bilder-/Tabellenbausteine nutzen. Zuordnungsaktion verständlich beschriften und ausgewählten Bestandsartikel darstellen.
- [ ] Entwurfsbereich unter Verkäufe ergänzen; derselbe Prüfweg führt zur endgültigen Buchung. Kosten/Zuordnung speichern und bei Rückkehr wiederherstellen, ohne bestätigte Änderungen im Hintergrund zu überschreiben.
- [ ] Bestehende Verkaufspositionen separat auswählen, inklusive ausverkaufter Artikel. Nach Verknüpfung Erfolg und Zielverkauf zeigen.
- [ ] eBay-Meldungen in Glocke einbinden, Logo/Link und Lesen/Löschen prüfen; aktueller Nutzerkontext muss vor jeder Mutation passen.
- [ ] Gezielte Anwendungstests, Angular-Bau und Browserfälle gegen ruhende Vorschau ausführen; Touch, relevante Breiten, Hell/Dunkel und AXE einbeziehen. Lokal committen.

## Task 4: Integration, Testauswahl und Abschlussreview

**Files:**

- Modify: `scripts/affected-tests.mjs`, verbindliche Test-Solllisten und zugehörige Tests nur soweit die neuen Dateien es erfordern.
- Modify: Betriebsdokumentation, dieses Fortschrittsprotokoll, `docs/AI-CHANGELOG.md`.

- [ ] Den echten Auswahlplan aus dem Gesamtunterschied erzeugen und Registrierung/Suite-Audit prüfen. Schemaänderungen behalten den breiten Pflichtlauf; keine leere Auswahl als bestanden ausgeben.
- [ ] Gemeinsam betroffene Edge-, SQL-, Worker-, Modell-/Angular- und Browserfälle einschließlich bestehender eBay-Übernahme ausführen. CI-relevante Linux-Unterschiede gezielt nachstellen.
- [ ] Migrationen vollständig transaktional prüfen, Typen und deklaratives Schema abgleichen. Produktionsbetrieb und fremde lokale Umgebungen bleiben unberührt.
- [ ] Frischen Gesamtbranchreview mit Spezifikation, Plan und Prüfnachweisen durchführen; relevante Fehler korrigieren und gezielt erneut prüfen.
- [ ] Nur bei tatsächlich abgeschlossener Umsetzung die vorgeschriebene Frage stellen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“ Vorher kein Push, PR, Merge oder Deployment.
