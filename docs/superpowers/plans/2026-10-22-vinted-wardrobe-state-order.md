# Vinted-Kleiderschrank: Status und Reihenfolge

> Umsetzung mit getrennten Zuständigkeiten für Import, Datenbank und Oberfläche; abschließend gemeinsamer unabhängiger Review.

**Ziel:** Neue und bestehende Vinted-Einträge nach belegten Zeiten ordnen und Entwürfe zuverlässig von veröffentlichten Anzeigen unterscheiden.

**Architektur:** Die vorhandene kontogebundene Lesekopie bleibt erhalten. Ein ausdrücklich gespeicherter `publicationState` trägt den Anbieterstatus durch beide Importwege bis zur Anzeige. `createdAt` bezeichnet die belegte Erstellung des Anbieterartikels, `occurredAt` die bestätigte Veröffentlichung und `publicationAge` weiterhin eine gerundete Anbieterangabe. Die Datenbank berechnet den dauerhaften Sortierwert für sämtliche Seiten und berichtigt bestehende Einträge.

**Technik:** Angular 22, bestehende Shared Components, TypeScript, Supabase/PostgreSQL, Cloud-Worker und lokale Browsererweiterung. Keine neue Produktabhängigkeit.

**Grundlage:** Ausdrücklicher Nutzerauftrag vom 22.10.2026, die zuvor belegten Datums-, Sortier- und Entwurfsprobleme vollständig zu beheben; bestehende Dokumentation `docs/implementation/vinted-publication-time.md`.

## Gemeinsame Grenzen

- Fremden PR `juna/vinted-drafts-views` nicht verändern. Eigener Zweig auf aktuellem `master`.
- Reale Vinted-Anzeigen weder veröffentlichen noch verändern oder löschen.
- Providerstatus unabhängig vom Artikelzustand `status` speichern.
- Fehlende Statusmerkmale belegen keine aktive Veröffentlichung.
- Erstell-, Veröffentlichungs-, Änderungs- und Abrufzeit nicht austauschen.
- Neue Migration erzeugen und prüfen; bestehende Migrationen unverändert lassen.
- Bestehende Konto-, Workspace-, Autorisierungs- und Importgrenzen beibehalten.
- Fehlende Livebelege und nicht ausführbare Prüfungen ausdrücklich kennzeichnen.

## Gemeinsamer Datenvertrag

- `publicationState`: `active | reserved | draft | hidden | ended | unknown`.
- `createdAt`: gültiger Anbieter-Erstellzeitpunkt oder `null`.
- `occurredAt`: belegte Veröffentlichung oder `null`; kein Entwurfsdatum als Ersatz.
- `publicationAge`: bestehender Wert mit Einheit und unveränderter Beobachtungszeit.
- Entwurfshinweis hat Vorrang vor historischen Veröffentlichungsbelegen.
- `is_visible: false` allein belegt keinen Entwurf. Unbekannte oder widersprüchliche Daten bleiben entsprechend unbestätigt.
- Sortierfolge: belastbare Veröffentlichungs-/Erstellzeit, sonst abgeleitetes gerundetes Alter, sonst fester unbekannter Wert am Ende; bestehende eindeutige ID entscheidet Gleichstände.

## Prüfungsfokus

- Ein bekannter Entwurf darf durch einen älteren Import ohne Statusfelder nicht wieder aktiv werden.
- Eine Bestätigung einer historischen Veröffentlichung darf den aktuellen Entwurf nicht überschreiben.
- Folgeabrufe dürfen gleiche Altersdaten nicht durch neue Abrufzeiten nach oben verschieben.
- Seitenwechsel dürfen bei identischen Zeitwerten keine Einträge überspringen oder doppeln.
- Eine lokale Arbeitskopie darf den echten veröffentlichten Quellartikel nicht umklassifizieren.

## 1. Import und Datumsquellen

**Dateien:** `services/marketplace-worker/src/vinted-account-import.ts`, zugehörige Alters-/Cachetypen und Tests; `tools/flipbase-extension/vinted-local-core.js`; lokale Vertragsvalidierung in `supabase/functions/_shared/marketplace-local-extension-contracts.ts` und zugehörige Tests.

- [x] Regressionen für Entwurf, verborgenen Artikel, unbekannten Status, echte Erstellung und unveränderte Folgeabrufe zunächst scheitern lassen.
- [x] Beide Importwege auf den gemeinsamen Vertrag umstellen; Statusmerkmale streng prüfen und keine Artikelzustandswerte als Veröffentlichungsstatus nutzen.
- [x] Gültige Zeitangaben ausschließlich dem passenden Anbieterartikel zuordnen. Bestehende sichere Detailseitenleser und Altersfallback prüfen, fehlende genaue Angaben nicht erfinden.
- [x] Entwürfe vom Veröffentlichungsalter und dessen Zusatzabrufen ausschließen; sichere Cacheübernahme bei Statuswechsel prüfen.
- [x] Bestehende betroffene Worker-/Erweiterungs-/Vertragsfälle ausführen.

## 2. Speicherung, Bestand und Seitensortierung

**Dateien:** `supabase/schemas/467_marketplace_publication_times.sql`, erforderliche lokale Importvalidatoren, passende SQL-Prüfungen und eine neu erzeugte Migration.

- [x] SQL-Regressionen für Bestand, Statuswechsel, Zeitpriorität und stabile serverseitige Seitenauswahl zunächst scheitern lassen.
- [x] Zeittrigger und Sortierwert nur für Vinted-Inserate anpassen; andere Eintragsarten erhalten ihre bestehenden Regeln.
- [x] Vorhandene bekannte Zeitangaben bewahren, unbestätigte Aktivannahmen entfernen und aktuelle Entwürfe vor historischen Veröffentlichungsbelegen schützen.
- [x] Neue Felder in beiden Vertragsprüfungen zulassen und Werte validieren.
- [x] Migration aus dem geprüften Zielzustand erzeugen, transaktional prüfen und Datenbanktypen auf Vertragsänderungen kontrollieren.
- [x] Betroffene SQL-Fälle einschließlich echter Seitenauswahl und Folgeimport ausführen.

## 3. Oberfläche und Filter

**Dateien:** Marktplatz-Lesemodelle und Normalisierung; `marketplace-api.service.ts`; Kleiderschrank, Inseratdetail und Marktplatzübersicht samt vorhandenen Tests.

- [x] Modell-/Komponentenregressionen für Entwurfskennzeichnung und fehlenden Aktivnachweis ergänzen und zunächst scheitern lassen.
- [x] Anbieterstatus durch die Lesemodelle führen; Entwürfe in Raster, Liste und Detail ausdrücklich kennzeichnen und ohne Onlinealter darstellen.
- [x] Erstellzeit und Veröffentlichungszeit in der Altersanzeige korrekt benennen.
- [x] Filter und Zähler auf die belegten Zustände abstimmen; keine rein clientseitige Sortierung nur einer geladenen Seite.
- [x] Betroffene vorhandene Oberflächenfälle für Desktop/Mobil und Hell/Dunkel ausführen; Angular-Vorlagen bauen.

## 4. Gemeinsamer Abschluss

- [x] Tatsächliche Testauswahl ermitteln; Registrierung, Formatierung, gezieltes Lint, Typprüfung und erforderlichen Bau ausführen.
- [x] Unabhängigen Review auf Status-/Zeitübergänge und Bestandsmigration durchführen und Befunde beheben.
- [x] Dokumentation und Änderungsprotokoll aktualisieren; ausgeführte Prüfungen und verbleibende Livegrenzen nennen.
- [x] Abschlussfreigabe gemäß `AGENTS.md` für Push, PR und Merge erhalten. Der Nutzer hat ausdrücklich zugestimmt; Integration und Veröffentlichung erfolgen nach erfolgreichen Pflichtprüfungen.

## Abschließender Nachweis

- Fachlicher UI-Plan vollständig geprüft: 23 Node-Dateien mit 208 Fällen und 69 Angular-Dateien mit 907 Fällen. Ein bestehender zeitzonenabhängiger Nachrichtenfall wurde durch die vollständige unveränderte Datei mit `TZ=UTC` bestätigt: 58/58 erfolgreich.
- Worker 104/104, lokale Erweiterung 123/123 und Edge-Handler 24 erfolgreiche Fälle; ein vorhandener Deno-spezifischer Fall bleibt im Node-Lauf ausgelassen.
- Alle 42 relevanten Browserfälle erfolgreich, einschließlich Mobil/Desktop, Hell/Dunkel, Touch, Tastatur und Barrierefreiheit; Darstellung zusätzlich visuell geprüft.
- Produktionsbau einschließlich Angular-Vorlagen, finale Typprüfung, gezieltes Lint, Formatierung, Shared-UI-Prüfung, Suite-Audit und Migrations-/Schema-/Rechteprüfungen erfolgreich.
- Vollständige SQL-Suite: 127 Dateien und 4.647 Assertions. Frischer Replay der generierten Migration: 274 betroffene Assertions sowie 22 Bestands-/Scope-/Rechteprüfungen erfolgreich. Offizieller Katalog-Diff ohne Reständerung; alle 550 öffentlichen Funktionen einschließlich Rechte identisch mit dem Ziel.
- Unabhängiger Review abgeschlossen; der dabei gefundene historische Veröffentlichungsbeleg nach `draft → active` ist durch den persistenten Entwurfsanker behoben und getestet.
- Aktuelle umfassende CI-Auswahl: `ad46dd30c3f7e63ddacc6f98dc235e70b1be8d31478109b98b3422731594261d`. Die zusätzlichen fachfremden vollständigen UI-/PWA-Läufe sind vor dem Merge in CI erforderlich. Der lokal ausgeführte fachliche UI-Plan hat den Hash `7a11edb9a756652b7493b2c175d90ee2e1435351e4b646fdd3303d077b6965e4`.
- Hauptzweig zum Abschluss erneut abgerufen und unverändert bei `726b98351e7f3657367a2613773be5032113fa84`. Keine realen Anzeigen geändert. Statuskorrekturen für bisher unbekannte Anbietermerkmale werden nach Veröffentlichung beim nächsten Kontodatenabgleich ergänzt.

## Integration nach Abschlussfreigabe

Der Nutzer hat PR und Merge ausdrücklich freigegeben. Aktuellen Hauptzweig `5e67d3eb8f7b966712de60c5c96a352d5e2bac17` einschließlich des inzwischen gemergten PR #460 integriert. Beide Änderungsprotokolle und generierten Typenergänzungen erhalten; unabhängiger Review ohne Befund. Danach 47 gezielte Angular-Fälle, Typprüfung und Produktionsbau erfolgreich. Der vollständige Replay von 245 Master-Migrationen plus unserer Migration besteht mit 4.698 SQL-Assertions, 22 Bestands-/Rechtefällen und 16 zusätzlichen lokalen Entwurf-/Veröffentlichungsübergängen; vollständiger Katalogvergleich ohne Reständerung.

Web und Migration werden nach dem Merge automatisch veröffentlicht. Der geänderte Marketplace-Import benötigt zusätzlich die Veröffentlichung und Aktivierung der passenden Worker-/Broker-/Sitzungsimages. Die lokale Erweiterung und ihr geänderter Shared-Functionvertrag werden von der Webpipeline nicht automatisch verteilt und benötigen einen gesonderten Abgleich. Kein Live-Abschluss allein aus einem grünen Webrelease ableiten.
