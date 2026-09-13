# 🤖 KI-Änderungsprotokoll

## 2026-09-14 – Claude Opus 5 (Anthropic) – Kleinanzeigen-Erweiterung repariert

**Auftrag:** Die Erweiterung aus PR #73/#74 meldet auf Kleinanzeigen „Titel-, Preis-
und Beschreibungs-Feld nicht gefunden“. Umsetzung prüfen und reparieren. Zweig
`fix/kleinanzeigen-autofill`, abgezweigt von `origin/master` (a12bd43).

**Befund:**

- Das Ausfüllskript läuft nur auf `p-anzeige-aufgeben.html`. Dort steht erst die
  Kategorie-Auswahl; das eigentliche Formular liegt auf
  `p-anzeige-aufgeben-schritt2.html` und wird vom Manifest nicht erfasst.
- Das Skript sucht einmalig ohne Warten und löscht die zwischengespeicherten Daten
  danach sofort – auch wenn nichts gefunden wurde.
- Feldkennungen geraten (`#post-ad-title` usw.). Laut Quellcode des Open-Source-
  Projekts `kleinanzeigen-bot` heißen sie `ad-description`, `ad-price-amount`,
  `ad-price-type` (Auswahlmenü, keine Radio-Buttons), `ad-zip-code`,
  `ad-shipping-enabled-yes/no`.
- „Versand & Standort eingerichtet“ wird immer als Erfolg angezeigt.
- Bilder: `getMediaUrl` liefert beim ersten Aufruf leer, die Komponente fällt dann
  auf den rohen Speicherpfad zurück; dieser ist auf kleinanzeigen.de nicht abrufbar.
  Ohne `resp.ok`-Prüfung würden Fehlerseiten als Bild hochgeladen.

- Beim Nachmessen im angemeldeten Browser zusätzlich gefunden: Für das Textarea
  wurde der Input-Setter benutzt, das wirft „Illegal invocation“.

**Ergebnis:**

- Neue Datei `tools/flipbase-extension/autofill-core.js` mit der Ausfüll-Logik und
  den live gemessenen Feldkennungen (`ad-title`, `ad-description`,
  `ad-price-amount`, `ad-price-type` mit `ad-price-type-menu-option-0/1`,
  `ad-zip-code`). Wartet auf das Formular und meldet ehrlich: erledigt, selbst
  erledigen oder fehlgeschlagen.
- Hintergrund öffnet direkt Schritt 2; das Manifest erfasst Schritt 2. Daten
  werden erst nach gefundenem Formular gelöscht. Versand wird nach der
  Kategorie-Wahl automatisch gesetzt.
- Bilder lädt der Service Worker (keine CORS-Sperre), prüft Status und Bildtyp und
  nimmt nur Anfragen von kleinanzeigen.de bzw. Flipbase an. Kein zusätzliches
  `drop`-Ereignis mehr, das Bilder doppelt hochladen konnte.
- `MediaService.resolveMediaUrls` wartet auf signierte Adressen; das Listing-Studio
  übergibt nur noch abrufbare Bilder und warnt bei fehlenden. Version 1.0.2.

**Prüfung:**

- Live auf `p-anzeige-aufgeben-schritt2.html` (angemeldet, ohne Absenden): Titel,
  mehrzeilige Beschreibung (Zähler „24/4000“, React nimmt den Wert an), Preis 220
  und Preistyp „VB“ gesetzt; danach neu geladen und verworfen.
- `npx vitest run` für `kleinanzeigen-autofill-core.dom.spec.ts`,
  `listings-toast-actions.angular.spec.ts`, `media-persistence.dom.spec.ts`:
  35/35 bestanden; neue Tests vorher rot gesehen.
- `npm run typecheck`, ESLint auf den geänderten Dateien, `npm run test:audit`
  (243 Dateien, 2091 Tests) und `npm run build`: jeweils Exitcode 0.
- Nicht geprüft: Bilder-Upload und Service Worker in der installierten
  Erweiterung – dafür muss die Erweiterung in `chrome://extensions` neu geladen
  werden.

## 2026-09-13 – Gemini 3.8 Flash (Google DeepMind) – Fix Browser-Erweiterung Erkennung auf localhost:4200

**Auftrag:** Browser-Erweiterung für das Listing-Studio wurde im lokalen Dev-Server (`http://localhost:4200`) nicht erkannt. Erkennungsmechanismus, Port-Matching im Manifest und Status-Synchronisation korrigieren.

**Ursache:**

- Chrome Extension Manifest V3 unterstützt in Match-Patterns (z. B. `http://localhost/*`) keine Ports; Zugriffe auf `localhost:4200` werden dadurch nicht gematcht.
- Content-Script Timing: Bei `document_idle` startete das Bridge-Skript teilweise nach der SPA-Initialisierung, wodurch die initiale Nachricht verloren ging.

**Ergebnis:**

- `tools/flipbase-extension/manifest.json`: Matches auf `<all_urls>` aktualisiert und `run_at` auf `document_start` gesetzt.
- `tools/flipbase-extension/flipbase-bridge.js`: Host-Filterung auf localhost, 127.0.0.1 und flipbase-Domains beschränkt. Dataset-Attribut `dataset.flipbaseExtensionInstalled = 'true'` wird sofort gesetzt, Events (`flipbase:extension-ready` und postMessage) werden sofort und periodisch gesendet.
- `ListingsComponent`: Polling-Intervall ergänzt, manuelle Schaltfläche „Verbindung prüfen“ (`checkExtensionNow()`) im Hilfemodal eingefügt.
- `listings-toast-actions.angular.spec.ts`: Testfälle für manuelle Erkennung und Fallback hinzugefügt.
- README und Hilfemodal um Update-Schritt (Reload-Symbol in `chrome://extensions`) ergänzt.

**Prüfung:**

- Angular Tests: `npm run test:angular -- src/app/features/listings/listings-toast-actions.angular.spec.ts` (9/9 Tests bestanden).
- Suite Audit: `npm run test:audit` (242 Dateien, 2073 Tests, 5402 Assertions).
- Typprüfung: `npm run typecheck` (0 Fehler).
- ESLint: fehlerfrei.
- Produktionsbau: `npm run build` fehlerfrei generiert.

## 2026-09-13 – Gemini 3.8 Flash (Google DeepMind) – Listing-Studio & Kleinanzeigen 1-Klick Browser-Erweiterung

**Auftrag:** Neuen Branch `feat/listing-studio` anlegen, Kleinanzeigen-Automatisierung recherchieren und das Listing-Studio um eine ban-sichere 1-Klick-Übertragung mittels Browser-Erweiterung erweitern.

**Ergebnis:**

- Neuer Zweig `feat/listing-studio` sauber von `origin/master` (6f40612) abgezweigt und ausgecheckt.
- Browser-Erweiterung `tools/flipbase-extension` implementiert (Manifest V3, Background Service Worker, Bridge Content-Script für Flipbase, Autofill Content-Script für `kleinanzeigen.de`, HUD Status-Overlay und README-Dokumentation).
- `ListingStudioService`: Typen `ListingPriceType`, `ListingImageItem`, `KleinanzeigenListingPayload` und Methode `publishViaExtension` hinzugefügt.
- `ListingsComponent`: Erweiterungs-Erkennung per Signal und Message-Passing, Formularfelder für Preistyp (Festpreis vs. VB), PLZ und Versandkosten ergänzt.
- Primärer Aktionsbutton „⚡ 1-Klick auf Kleinanzeigen inserieren“ sowie Installations-Hilfemodal in `listings.component.html` integriert. Bildvorschau auf `getMediaUrl` umgestellt.

**Prüfung:**

- Node Tests: `npm run test:node -- src/app/core/services/listing-studio.spec.ts` bestanden (9/9 Tests).
- Angular Tests: `npm run test:angular -- src/app/features/listings/listings-toast-actions.angular.spec.ts` bestanden (7/7 Tests).
- Typprüfung: `npm run typecheck` fehlerfrei (Exitcode 0).
- ESLint: fehlerfrei (Exitcode 0).
- Produktionsbau: `npm run build` erfolgreich in 13.0s ohne Warnungen.
- Code-Formatierung: Prettier auf allen betroffenen Dateien ausgeführt.

## 2026-09-13 – Claude Opus 5 (Anthropic) – Vinted Bot

**Auftrag:** „Deal-Monitor“ heißt künftig „Vinted Bot“. Die Bot-Seiten der
Administration (Sammelaufträge, Botbetrieb, Kategorieliste) liegen gebündelt
unter einem Punkt „Vinted Bot“ mit Seitenmenü wie in den Einstellungen und
begrenzter Breite. Zweig `feat/vinted-bot-section`, abgezweigt von `master`
(6f40612). Entwurf unter
`docs/superpowers/specs/2026-09-13-vinted-bot-section-design.md`, Plan unter
`docs/superpowers/plans/2026-09-13-vinted-bot-section.md`.

**Entscheidungen:** Eigene Hülle in `platform-admin` statt einer gemeinsamen
Komponente mit den Einstellungen, die dafür mit umgebaut werden müssten. Alte
Adressen leiten weiter. Ordner-, Klassen- und RPC-Namen bleiben.

**Ergebnis:**

- Hauptmenü „Vinted Bot“ mit Roboter-Symbol unter `/vinted-bot`;
  `/deal-monitor` leitet weiter. Übersetzung de/en, Seitenkopf und Demo-Hinweis
  angepasst.
- Administration: Unterpunkte „Bewerbungen“ und „Vinted Bot“.
- `VintedBotShellComponent`: Linkliste ab `lg`, Auswahlfeld darunter,
  `max-w-6xl`, aktiver Punkt im Markengelb. Die drei Seiten hängen unter
  `/admin/vinted-bot/…`; die alten Adressen leiten weiter.
- Die drei Seiten haben statt `app-page-header` eine `h2`-Zwischenüberschrift;
  die Karten im Botbetrieb sind `h3`, damit die Gliederung stimmt.

**Funde:**

- Das gemeinsame Auswahlfeld setzt seinen Wert selbst, bevor die Navigation
  feststeht. Lehnt der Wächter für ungespeicherte Änderungen den Wechsel ab,
  zeigte es den neuen Bereich, und ein zweites Auswählen löste nichts aus. Der
  erste Ansatz (eigenes Signal in der Hülle, per Bindung zurückgesetzt) griff
  im Browser nicht: Hin- und Rücksetzen fielen in denselben Abgleich, für die
  Bindung änderte sich nichts. Der Unit-Test prüfte nur das Signal der Hülle
  und blieb deshalb grün – der Browsertest auf 390 px hat es aufgedeckt
  (Bildschirmfoto: Feld „Botbetrieb“, Seite „Sammelaufträge“). Jetzt setzt die
  Hülle den Wert direkt im Auswahlfeld zurück, das ihr über eine
  Vorlagen-Referenz übergeben wird; der Unit-Test prüft diesen Wert.
- Erster Bau rot: `PageHeaderComponent` stand nach dem Entfernen des Imports
  noch in zwei `imports`-Listen. Behoben.
- Browsertest Sammelaufträge zuerst rot, beide Male an der neuen
  Test-Hilfsfunktion: Der Link heißt samt Beschreibung „Botbetrieb Anfragen und
  Fehler“ (genaue Namenssuche fand ihn nicht), und auf 390 px schloss das
  Scrollen vor dem Klick das Auswahlfeld wieder. Belegt über Fehlerbericht und
  Bildschirmfoto. Die Hilfe sucht jetzt am Namensanfang und öffnet das Feld wie
  der Test beim Feld „Kategorie“ nach dem Layout-Takt per Tastatur.

**Geprüft:** Angular-Tests `layout/sidebar` und `platform-admin` 42/42 (davon
6 für die Hülle; `page-header` zuvor mitgelaufen), `tsc -p tsconfig.spec.json`,
ESLint, Prettier, `npm run build` ohne Warnungen, Liste der PR-Browsertests
8/8. Mit `playwright.pr.config.ts`: Vinted Bot hell und dunkel grün
(einschließlich Weiterleitung von `/deal-monitor`), Sammelaufträge hell und
dunkel grün (einschließlich Weiterleitung von `/admin/queries` und abgelehntem
Wechsel auf 390 px). Nicht geprüft: Sichtprüfung mit echter Betreiber-Sitzung.

**Freigabe:** Der Nutzer hat Push, PR, Merge nach erfolgreichen Prüfungen und
anschließendes Aufräumen von Zweig und Arbeitsordner bestätigt.

## 2026-09-13 – Claude Opus 5 (Anthropic) – Administration in der Seitenleiste

**Auftrag:** Die Reiterleiste oben in der Administration entfällt. Die vier
Unterseiten klappen wie im Shopify-Admin unter „Administration“ in der
Seitenleiste auf. Gleichzeitig bekommen die vier Seiten einen einheitlichen
Rahmen. Zweig `feat/admin-sidebar-navigation`, abgezweigt von `master`
(0dad469).

Entwurf unter
`docs/superpowers/specs/2026-09-13-admin-sidebar-navigation-design.md`, Plan
unter `docs/superpowers/plans/2026-09-13-admin-sidebar-navigation.md`.

**Ergebnis:**

- `NavItem` in der Seitenleiste hat optionale `children`. Die Liste der
  Admin-Unterseiten liegt in `core/config/platform-admin-navigation.ts`. Die
  Unterpunkte stehen nur im DOM, solange die Adresse in `/admin` liegt. Der
  Bereichslink bleibt fett, trägt aber kein `aria-current`; das trägt allein
  der aktive Unterpunkt.
- `platform-admin-shell` mit Reiterleiste und Test ist entfernt. Die Seiten
  hängen direkt an den Routen; Pfade, Weiterleitung und `unsavedEntryGuard`
  sind unverändert.
- Alle vier Seiten ohne eigenen Rand und ohne äußere Maximalbreite, jeweils mit
  `app-page-header`. Die Kategorieliste behält darunter `max-w-3xl` für ihren
  kleinen Inhalt.

**Befund:** Die vier Seiten waren unterschiedlich gerahmt. Die Bot-Seiten
setzten `p-6` zusätzlich zum Rand des Grundgerüsts, die Kategorieliste baute
ihre Überschrift selbst.

**Fund in der Prüfung:** Nach dem Umstieg auf `app-page-header` meldete AXE in
der Kategorieliste `empty-heading`. Ursache ist die Laufzeitübersetzung der
Tests, die Signal-Eingänge nicht kennt, nicht die Seite selbst. Der Test meldet
`title` und `subtitle` jetzt an und setzt sie danach zurück, wie es der Test des
Seitenkopfs schon tut.

**Geprüft:** Neuer Seitenleisten-Test (5 Fälle: Reihenfolge und Ziele, genau
ein `aria-current` auf zwei Unterseiten, zugeklappt außerhalb, unsichtbar für
Nicht-Betreiber, AXE). Angular-Tests `platform-admin`, `layout/sidebar`,
`page-header`: 37 von 37 grün. `tsc -p tsconfig.spec.json` ohne Befund,
`npm run build` Exitcode 0 ohne Warnungen, Prettier und ESLint auf allen
geänderten Dateien.

**Nicht geprüft:** Sichtprüfung im Browser. Sie braucht eine angemeldete
Betreiber-Sitzung; der Nutzer hat den PR ohne sie freigegeben.

**Freigabe:** PR #70. Der Nutzer hat Push, PR, Merge nach erfolgreichen
Pflichtprüfungen und anschließendes Aufräumen von Zweig und Arbeitsordner
bestätigt.

**CI-Nacharbeit:** Browser-Smoke schlug fehl in
`e2e/sniper-administration.spec.ts`, nur in der dunklen Variante. Sie läuft mit
390 px Breite. Der Test klickte den Link „Botbetrieb“, der früher als Reiter
im Inhalt stand und jetzt nur in der Seitenleiste liegt. Auf Handybreite ist
die eingeklappt, der Klick wartete bis zum Abbruch. Die helle Variante mit
1440 px blieb grün. Kein Fehler der App: Auf dem Handy führt der Weg wie
entworfen über „Menü“. Der Test öffnet jetzt über eine Hilfsfunktion zuerst
das Menü, wenn es sichtbar ist. Lokal mit `playwright.pr.config.ts` beide
Varianten grün; andere Browsertests sprachen die Reiterleiste nicht an.

**Nebenbei:** Ein `npm ci` lief versehentlich im Haupt-Repo statt im
Arbeitsordner, weil der Befehl kein Arbeitsverzeichnis hatte. Es hat dort nur
`node_modules` neu aufgebaut (Exitcode 0), am Code und am Zweig
`feat/item-picker-and-image-preview` nichts geändert.

## 2026-09-13 – Codex – Paketinhalt aus dem Einkauf erfassen

**Auftrag:** Bestätigten Ablauf umsetzen: bezahlte Paketposition bleibt bestehen,
Inhalt wird später als einzeln verkäufliche Artikel mit Herkunft erfasst.
Unbekannte Einzelkosten bleiben offen. Eigener Zweig `codex/mystery-pack-model`.
**Arbeitsplan:** `docs/superpowers/plans/2026-09-13-purchase-package-contents.md`.
Implementierung und lokale Prüfungen laufen; noch keine Veröffentlichung.

## 2026-09-13 – Codex – Mystery-Pack-Modell erneut abgleichen

**Auftrag:** Bekannte Einzelpreise bei Kleidung als Normalfall berücksichtigen;
gelegentliche Pakete als eine Einkaufsposition mit eigenem Preis und optionaler
Inhaltsbeschreibung verstehen. Spätere Verarbeitung des Inhalts anhand realer
Herstellerdokumentation erneut prüfen.

**Ergebnis:** ERPNext Repack erlaubt Bestandsumwandlung ohne feste Stückliste;
Odoo und inFlow nutzen Stücklisten, Shopify-Bundles bekannte Komponenten.
Vorschlag: Paket einkaufen, bei Einzelverkauf später Inhalt erfassen und Bestand
nachvollziehbar umwandeln. Rechnungspreis bleibt am Paket; notwendige interne
Kostenbewertung wird nicht als tatsächlich vereinbarter Einzelpreis ausgegeben.
BFH-Originalentscheidung und aktueller § 25a UStG direkt geprüft.
Der Nutzer bestätigte anschließend, dass er Pakete öffnet und die enthaltenen
Artikel einzeln verkauft. Darauf ist der Vorschlag ausgerichtet; der Gesamtverkauf
eines Pakets ist keine zusätzliche Anforderung für die nächste Umsetzung.

**Codebefund:** Sichtbarer Paketpreisdialog verteilt nach Positionen und setzt
Einzelpreise; der bestehende Gesamtpreismodus verteilt intern nach Einheiten.
Diese Wege bilden noch keine eigene Paketauflösung ab. Dokumentation auf
`codex/mystery-pack-model` ab `origin/master` (`0dad469`), keine Funktionsänderung.
Bericht: `docs/audit/2026-09-13-mystery-pack-model.md`.

## 2026-09-13 – Codex – PR-Abschluss für Einkaufsfelder und Kalender

**Freigabe:** Der Nutzer hat Push, PR, Merge nach erfolgreichen Pflichtprüfungen
und anschließendes Aufräumen bestätigt. PR #69 bündelt Feldanordnung und
Kalenderkorrektur.

**CI-Nacharbeit:** Die erste Qualitätsprüfung erkannte 17 statt der erwarteten
16 PR-Browsertests. Der neue Kalender-Regressionstest war korrekt mit
`@pr-smoke` markiert, fehlte aber in der festen Liste in
`scripts/playwright-pr-smoke.test.mjs`. Den konkreten Test dort ergänzt, damit
die bestehende Prüfung weiterhin sowohl fehlende als auch unerwartete Tests
erkennt. Keine Prüfung entfernt oder abgeschwächt. Die acht gezielten Tests
dieses Prüfvertrags bestehen lokal.

## 2026-09-13 – Codex – Kalender über Einkaufskarten anzeigen

**Auftrag/Ergebnis:** Der Kaufdatum-Kalender öffnet sich über der Einkaufskarte.
Die Korrektur liegt im gemeinsamen `DatePickerComponent` und gilt damit auch
für das Verkaufsformular. Fortsetzung auf `codex/purchase-layout-dashboard-review`;
die zuvor geprüfte Anordnung von Verkäufer und Kaufdatum bleibt erhalten.

**Nachgewiesene Ursache:** Die Karte hat `overflow-hidden`, der Kalender war
ein absolut positioniertes Kind. Beim Fokussieren eines Tages scrollte der
Browser sogar den versteckten Karteninhalt; im gemessenen Beispiel stand
`scrollTop` auf 209 px. Dadurch verschwanden auch Verkäufer und Kaufdatum.
Ein Test auf bloße Sichtbarkeit oder einen einzelnen Tag übersah das; der
Browsertest prüft deshalb die tatsächliche Treffbarkeit aller Kalenderknöpfe.
Dieser Test schlug mit dem ursprünglichen Kalender fehl und besteht mit der
Korrektur.

**Umsetzung:** Native Popover-Ebene analog zur bestehenden Auswahlkomponente,
Position am Datumsfeld, bei Platzmangel nach oben, innerhalb der Fensterränder.
Bei Scrollen außerhalb des Kalenders oder Fenstergrößenänderung schließt er.
Fokus kehrt bei Auswahl/Escape zum Knopf zurück, ohne Vorfahren zu scrollen;
ein Außenklick behält seinen neuen Fokus. Escape wird vor übergeordneten
Dialogen abgefangen. Nach erneutem Öffnen ist der ausgewählte Tag wieder im
angezeigten Monat. Event-Listener werden über `DestroyRef` entfernt.

Die AXE-Prüfung des geöffneten Kalenders deckte zusätzlich fehlende ARIA-Zeilen
auf. Wochentage und Datumszellen liegen jetzt in korrekt zugeordneten Zeilen
innerhalb des Kalenderrasters. Keine neue CSS-Datei oder Abhängigkeit.

**Prüfung:** Produktionsbau, gezieltes ESLint und Formatierung erfolgreich;
45 bestehende Komponenten-/Formulartests bestanden. Sieben neue Browsertests
bestanden: anklickbarer Kalender außerhalb der Karte, gespeicherte Entwürfe bei
390/768/1440 px, Tastatur/Fokus, Monatswechsel, Außenklick, Größenänderung,
Scrollen, Verkaufsformular und AXE in beiden Themes. Zwei vorhandene Tests
zur obersten Ebene der Kostenauswahl ebenfalls bestanden.

**Unabhängiger Altfehler:** Der zusätzlich ausgeführte erste Test in
`e2e/purchase-dropdown-layer.spec.ts` findet nach dem Speichern das Element
`[data-purchase-description]` nicht. Derselbe Fehler wurde mit den unveränderten
Kalenderdateien aus `db11f06` reproduziert; die Korrekturdateien wurden danach
bytegleich wiederhergestellt. Kein vollständiger grüner Browserlauf behauptet,
keine Änderung dieses fachfremden Tests.

## 2026-09-13 – Codex – Einkaufsfelder nebeneinander und Dashboard-Einordnung

**Auftrag/Ergebnis:** Verkäufer und Kaufdatum stehen in der gemeinsamen
Einkaufsmaske ab 768 px nebeneinander, darunter weiterhin untereinander. Das
gilt für neue Einkäufe, offene Entwürfe und die Bearbeitungsseite. Bestehende
Shared-Felder, Abstände und Formularlogik bleiben erhalten. Eigener Zweig
`codex/purchase-layout-dashboard-review` auf Basis von `origin/master` (27b976c).

**Dashboard-Analyse:** Die gemeldete dauerhafte Anzeige „Unbekannt“ ließ sich
in der lokalen Demo nicht reproduzieren: Verkaufserlöse, Ergebnis und
Bestandswert enthielten konkrete Beträge. Der Bericht setzt den gesamten
Bestandswert auf unbekannt, sobald einem enthaltenen Artikel/Los eine belastbare
Kostenbasis fehlt. Voraussetzung sind unter anderem bestätigte Einkaufskosten;
bei angebrochenen Losen müssen auch die Kosten der Entnahmen nachweisbar sein.
Ein Verkauf mit unbekanntem Wareneinsatz macht entsprechend das Gesamtergebnis
unbekannt. Der konkrete Auslöser in den Nutzerdaten ist nicht nachgewiesen.
Keine Produktivdaten oder Berechnungsregeln geändert.

Die bisherige Kennzahl `expenses` summiert Einkaufsbeträge, nicht sämtliche
Betriebsausgaben; direkte Verkaufskosten werden separat berechnet. Sie darf
daher nicht einfach als „Gesamtausgaben“ beschriftet werden. Ebenso bezeichnet
das bisherige Ergebnis nur Erlöse abzüglich Wareneinsatz und direkter
Verkaufskosten, keinen vollständigen Unternehmensgewinn.

**Empfehlung, noch nicht umgesetzt:** Gewinn, erfasste Gesamtausgaben und Umsatz
oben; Bestandswert, verkaufte Stückzahl und Marge ergänzend. Einheitlicher
Zeitraum und Vorperiodenvergleich. Offene Kosten mit Ursache und Weg zum
betroffenen Einkauf erklären. Grundlage sind die offiziellen Übersichten von
[Shopify](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard),
[eBay](https://www.ebay.com/help/selling/selling-tools/seller-hub?id=4095) und
[Lexware Office](https://www.lexware.de/funktionen/dashboard/), geprüft am
13.09.2026. Die Priorisierung ist eine Empfehlung für Flipbase.

**Prüfung:** Produktionsbau erfolgreich. Bestehende 40 Formular- und 12
Dashboard-Berichtstests bestanden. Browsermessungen der Erfassungsmaske bei
390/768/1024/1440 px ohne horizontalen Überlauf. Einen neuen Entwurf in der
isolierten Browser-Demo gespeichert und erneut geöffnet: korrekte Feldanordnung
bei 390/768/1440 px, hell und dunkel, mit reduzierter Bewegung; AXE meldet in
der Einkaufsmaske in diesen sechs Zuständen keine WCAG-A/AA-Verstöße.
Keine neuen Abhängigkeiten, Backend- oder Schemaänderungen.

## 2026-09-13 – Codex – Kosten und Steuerberechnung

**Auftrag:** Freigegebenen nächsten Schritt auf `codex/purchase-tax-costs`
(Basis `origin/master`, `15b07ca`) umsetzen. Positionsbezogene Differenzsteuer,
getrennter steuerlicher Einkaufspreis und Gesamtkosten, keine erfundene Vorsteuer.
Wareneingang und Konvolut-Verteilung folgen getrennt.

**Umsetzung:** Umsatzsteuer je Stück ohne Verrechnung mit Verlusten anderer
Stücke; Nettobemessungsgrundlage, getrennte Steuer- und Betriebskosten sowie
unveränderliche steuerliche Verkaufssnapshots. Zusatzkosten erhalten eine kleine
Herkunftsauswahl. Ungeklärte historische Werte bleiben offen und sperren betroffene
Steuerexporte. Vorsteuer wird nicht mehr pauschal aus Kosten erfunden.
Teilverkäufe, Korrekturen und Retouren behalten centgenaue Stückkostenfolgen.

**Prüfung:** 318 gezielte Anwendungstests, 988 SQL-Assertions in 24 Dateien und
13 betroffene Browserfälle erfolgreich. Zwei neue PR-Pflichtfälle, AXE,
App-/Testtypen, Produktionsbau, gezieltes Format/Lint und neun Workflowprüfungen
grün. Beide erzeugten Migrationen isoliert angewandt; zwölf Funktionsdefinitionen
gegen das Schema geprüft. Unabhängige Reviews ohne verbleibende P1/P2.
Details und fachliche Grenzen:
`docs/audit/2026-09-13-purchase-tax-costs-validation.md`.

**Abschluss:** Nutzer hat PR-Push, Merge nach erfolgreichen Pflichtprüfungen und
anschließendes Aufräumen freigegeben. Aktuelles `origin/master` unverändert bei
`15b07ca`; die lokalen Prüfungen gelten weiterhin für den unveränderten Code.
Veröffentlichung erfolgt über den PR. Belegbezogene Vorsteuer, historische
Steuerfreigaben und vollständige periodengerechte Berichtigungen bleiben
ausdrücklich Folgearbeiten. Anschließend folgt eine verständliche Erklärung
der Änderungen im Chat.

**PR-Nachprüfung:** Der erste vollständige CI-Lauf von PR #68 fand eine veraltete
Testannahme in `product_core_contract.test.sql`: Der Empfangshistorievergleich
klammerte nur das bisherige Kostenfeld aus. Beim Wiederöffnen werden auch die
neuen Kostenfelder korrekt zurückgesetzt. Der Test prüft dieses Zurücksetzen
nun ausdrücklich und vergleicht die übrige Empfangshistorie unverändert.
Die vollständige SQL-Suite besteht danach mit 1.618 Prüfungen in 46 Dateien.
Der neue Browserfall wartet jetzt auf das geschlossene Kostenmodal, verwendet
den tatsächlichen Hauptbutton „Änderungen speichern“ und prüft die zweite
Kostenherkunft nach erneutem Laden. Alle drei betroffenen Browserfälle grün.
Keine Änderung am Anwendungscode für diese beiden CI-Befunde.

## 2026-09-13 – Codex – Produkterstellung, Bildergalerie und Shop

**Auftrag:** Freigegebenen Folgeumfang auf `codex/product-editor-storefront`
(Basis `origin/master`, `5291bff`) umsetzen. Eigene Erstellungsseite, einfacher
Zuschnitt, mehrere Bilder und Suchmaschineneintrag. Fremde Zweige bleiben unberührt.

**Abgrenzung:** Der integrierte Shop ist absichtlich durch Anmeldung geschützt
und nutzt eine Zahlungsdemo. Artikelansicht und Metadaten werden vervollständigt;
öffentliche Freigabe und Zahlungsintegration sind ein gesonderter Schritt.
Umsetzungsplan: `docs/superpowers/plans/2026-09-13-product-editor-storefront.md`.

**Umsetzung:** Gemeinsame Erstellungs-/Bearbeitungsseite, mehrere Bilder mit
Zuschnitt/Sortierung/Hauptbild, atomare Galerie-RPC samt erzeugter Migration und
Typen, vollständige Katalog-Shopdetailseite und gespeicherte SEO-Angaben.
Teiluploads, Workspacewechsel und schnelle Eingaben beim Seitenwechsel abgesichert.
Private Bildadressen und Hauptbildprojektion nach unabhängigem Review korrigiert.

**Prüfung:** 152 gezielte Anwendungstests, 173 SQL-Prüfungen plus echter
Paralleltest sowie 24 betroffene Browserfälle erfolgreich. App-/Testtypen,
Produktionsbau, gezieltes Format/Lint, AXE und Shared-UI-Prüfung grün. Zwei neue
PR-Pflichtfälle, acht Prüfungen der PR-/Nightly-Auswahl erfolgreich. Nachreview ohne
verbleibende P1/P2. Isolierte Datenbank danach gestoppt, keine Produktionsänderung.
Abschlussbericht: `docs/audit/2026-09-13-product-editor-validation.md`.

**Abschluss:** Der Nutzer hat PR-Push, Merge nach erfolgreichen Pflichtprüfungen
und anschließendes Aufräumen ausdrücklich freigegeben. Lokale Prüfungen gelten
für den unveränderten Anwendungscode; Abschluss erfolgt über den PR gegen `master`.

## 2026-09-13 – Codex – PR abschließen und Produkterstellung abgrenzen

**Auftrag:** Bestehenden Artikel-/Bestandsumbau zuerst per PR abschließen;
anschließend eigene Erstellungsseite, mehrere Bilder, einfacher Zuschnitt und
Suchmaschinenvorschau vorsehen. Shopify-Vorgehen und aktuelle Shopanbindung prüfen.

**Ergebnis:** Herstellerdokumentation bestätigt Produktdetailseite mit Medien,
Veröffentlichung und Suchmaschineneintrag. Shopfreigabe existiert bereits,
Katalogartikel benötigen Preis und Bestand. Öffentliche Katalogdetailseite,
Beschreibung und Medien sind noch unvollständig angebunden. Zuschneide-Modal und
`ngx-image-cropper` sind bereits vorhanden. Folgeumfang mit Quellen in
`docs/audit/2026-09-13-product-editor-follow-up.md` festgehalten; kein neuer
Produkteditor in den abgeschlossenen Bedienumbau aufgenommen.

**Veröffentlichung:** Nutzerentscheidung zum vorher angebotenen PR-Abschluss
übernommen. Aktuelles `origin/master` unverändert bei `5383e71`; dokumentierte
lokale Prüfungen gelten weiterhin für den unveränderten Anwendungscode.
Dokumentation zusätzlich formatiert und Diff geprüft. PR-/CI-Ergebnis folgt
im Chat; Merge nur nach erfolgreichen Pflichtprüfungen.

## 2026-09-13 – Codex – Artikelbearbeitung und kompakte Bestandsansicht

**Auftrag:** Den freigegebenen Bedienumbau umsetzen: ein Hauptbereich „Artikel“
mit „Alle Artikel“ und „Bestand“, bearbeitbare Artikeldaten und eine reduzierte
Bestandstabelle. Eigener Worktree `codex/inventory-model-review`, Basis
`origin/master` (`5383e71`). Die steuerlichen Modellkorrekturen aus dem Audit
bleiben ein gesonderter Arbeitsschritt.

**Umsetzung:** Neue Katalogdetailseite mit direktem Artikelabruf, Beschreibung,
Stammdaten, Shopdaten, Bildupload und echten Bestands-/Einkaufsverweisen.
Ungespeicherte Eingaben, fehlende Artikel, Lade- und Speicherfehler sowie
Workspacewechsel werden behandelt. Die Beschreibung erhält eine nullable
Textspalte; Migration per CLI erzeugt und Typen neu generiert. Bearbeiten
aktualisiert den bestehenden Artikel und verändert keine historischen Belege.

Gemeinsame Navigation in Sidebar und Mobilmenü, echte Artikellinks aus beiden
Ansichten und Rückwege mit erhaltener Suche. Eigenständige Stücke bleiben in
„Alle Artikel“ erreichbar; Zuordnungen beruhen ausschließlich auf gespeicherten
Beziehungen. Standardbestand: Artikel/Bild, Auf Lager, Verfügbar, Reserviert.
Weitere Angaben und Filter sind optional. Verkaufte Ware bleibt in einer eigenen
Ansicht; unklare Mengen werden nicht als Null dargestellt. Unveränderte alte
Spaltenvorgaben werden migriert, persönliche Anpassungen erhalten. Primäraktion
im Bestand ist „Einkauf erfassen“.

**Review:** Unabhängiger Review der Navigation ohne wesentliche Befunde. Der
Gesamtreview fand drei konkrete Fehler: Verlust eines verborgenen Shoppreises,
unberücksichtigte Reservierungsbewegungen in zwei Ansichten sowie doppelte
Bilduploads nach einem Workspacewechsel. Alle drei Fehler behoben und mit
Regressionstests abgesichert. Reservierungen verwenden jetzt einen gemeinsamen
Helper unter `core/utils/`; der Browsertest schlug vor dem Fix mit 5/5/0 statt
5/4/1 fehl und besteht danach. Unabhängige Nachprüfung ohne verbleibende P1/P2.

**Abschlussprüfung:** Produktionsbau, Anwendungs-/Test-Typprüfung, gezieltes
ESLint/Prettier, Shared-UI-Prüfung, Suite-Zuordnung und Diff-Prüfung erfolgreich.
132 Node- und 119 Angular-Tests sowie alle 34 betroffenen Browserfälle grün.
Browserprüfung über vorhandenes Playwright, weil
„Browser plugin not available“; keine zusätzlichen Abhängigkeiten. Desktop und
Mobil, hell/dunkel, Tastatur, AXE, Bearbeiten, Bilder, Verkauf, Archiv,
Spaltenpräferenzen und Einkaufsrückwege geprüft. Screenshots und Fehlertraces
liegen außerhalb des Repositories im temporären QA-Verzeichnis. Lokale,
isolierte Datenbank mit allen Migrationen aufgebaut: 159 Prüfungen zu
Beschreibung, Medien, Workspacegrenzen und historischen Einkaufsdaten erfolgreich.
Kein Zugriff auf Produktionsdaten, kein Push oder PR.

## 2026-09-13 – Codex – Artikelstamm und Bestandsübersicht konkret einordnen

**Auftrag:** Nachfrage zu professionellen Vorbildern, fehlender Artikelbearbeitung
und überladener Inventartabelle. Fortsetzung der Analyse im eigenen Worktree
`codex/inventory-model-review`.

**Ergebnis:** Aktuelle Templates und Datenflüsse bestätigen fehlenden Detail-/
Bearbeitungsweg im Katalog, denselben Erstellungsdialog auf beiden Seiten sowie
acht standardmäßig sichtbare Fachspalten in der Bestandsliste. Stück- und
Mengenzeilen besitzen zudem unterschiedliche Wege zu Details. Shopify-Hilfe zur
Produktbearbeitung und Inventarverwaltung erneut geprüft. Empfehlung im Bericht
ergänzt: Hauptbereich „Artikel“ mit „Alle Artikel“ und „Bestand“, einheitliche
Artikeldetails und kompakte Bestandsliste mit auf Lager/verfügbar/reserviert.
Herkunft, Kosten und Verkäufe bleiben in Details beziehungsweise optionalen
Ansichten erreichbar. Echte Bestandskonflikte bleiben sichtbar.

**Prüfung:** Code- und Quellenprüfung, keine Browserabnahme. Dokumentation
formatiert und Diff geprüft; Anwendung, Datenbank und fremde Zweige unverändert.

## 2026-09-13 – Codex – Artikelmodell und Steuerrecherche unabhängig gegenprüfen

**Auftrag:** Importierten Claude-Code-Verlauf bewerten; ein fachlich tragfähiges,
einfach bedienbares Modell für Artikel, Bestand und Einkäufe empfehlen. Nur
Analyse und Dokumentation im eigenen Zweig `codex/inventory-model-review`,
Worktree `.worktrees/inventory-model-review`, Basis `origin/master` (`5383e71`).
Fremde Zweige bleiben unverändert.

**Ergebnis:** Entscheidungsgrundlage unter
`docs/audit/2026-09-13-inventory-model-review.md`. Empfehlung: Artikel und Mengen
in der Oberfläche, tatsächliche Stücke und Herkunft im Hintergrund. Steuerart
nicht aus Bestandsverfahren oder Zustand ableiten. Herstellerdokumentation,
§ 25a UStG, EU-Richtlinie Artikel 312, amtlicher UStAE, BFH V R 37/15 und
BMF-Schreiben vom 8. Juli 2025 geprüft. Versand des Warenverkäufers von weiteren
Kosten unterscheiden; Konvolutverteilung braucht eine sachgerechte Grundlage.
Die Anpassung auf 750 Euro ist auch für den UStAE direkt amtlich bestätigt.

**Codeprüfung:** Konkrete Gegenprobe mit den tatsächlichen Steuer-Service-Methoden:
Zwei Verkaufspositionen mit +20/−20 Euro Marge ergeben nach dem nachgelagerten
Summenabgleich 3,19/−3,19 Euro Steuer statt 3,19/0 Euro. Außerdem wird eine
Bruttomarge von 119 Euro als `tax_base` bezeichnet, obwohl die Nettobasis 100 Euro
beträgt. Die frühere pauschale Aussage zur freien Löschbarkeit finalisierten
Bestands wird durch den vorhandenen DELETE-Trigger widerlegt. Nummernvergabe ist
zwischen lokaler Vorschau, echtem Insert und Einkaufsabschluss uneinheitlich.

**Prüfumfang:** Quellen und Code, isolierte Ausführung der vorhandenen
Berechnungsmethoden nach Transpilation; kein Produktionszugriff und kein
vollständiger Steuer-, Berechtigungs- oder GoBD-Audit. Bericht und Protokoll
formatiert sowie Diff geprüft. Keine Änderung an Anwendung, Tests oder Schema;
keine Migration, kein Commit, Push oder PR. Die fachlichen Änderungen sind noch
umzusetzen und nicht durch diese Analyse freigegeben.

## 2026-09-13 – Codex – Artikelkarten mit drei Fotos und Vinted-Link

**Auftrag:** Nutzer zeigt Discord-Beispiel: Hauptfoto links, zwei Fotos rechts;
Metadaten mit echten Icons hervorheben, Beschreibung und Artikellink prüfen.
Fortsetzung im eigenen `codex/vinted-individual-arrivals`-Worktree. Vor Änderungen
an der gemeinsamen Button-Komponente Protokoll und Verwaltungs-UI-Regeln gelesen.

**Umsetzung:** Bis zu drei unterschiedliche, erlaubte Vinted-Bilder, Hauptbild
links über beide Zeilen. Ein/zwei Bilder nutzen die verfügbare Fläche; fehlende,
unerlaubte und defekte Bilder werden ausgefiltert, bei null Bildern verständliche
Ersatzanzeige. Lucide-Icons für Marke, Zustand, Größe, Käuferschutz und Fundzeit;
semantische Beschriftungen für Screenreader bleiben vorhanden. Unter jeder Karte
mit gültiger Artikeladresse steht „Auf Vinted ansehen“ als nativer Link in einem
neuen Tab. Gemeinsamer Button um `href` und `target` ergänzt; bestehende interne
Navigation unverändert. Deaktivierte Links verlieren die Zieladresse und blockieren
Klicks. Die Prüfung fand zunächst eine leere statt entfernter Zieladresse beim
deaktivierten Link; über Attributbindung behoben und erneut geprüft.

**Datenlage:** Nur lesende Produktionsprüfung: 5.186 Artikel, davon 4.400 mit
mindestens drei Fotos, aber kein gespeicherter Beschreibungstext. Eine normale
Katalog-Stichprobe mit dem vorhandenen Sitzungsweg lieferte HTTP 200, neun Artikel
mit zwei bis sechs Fotos, ohne Beschreibungsfeld. Der Normalisierer setzt die
Beschreibung bislang ausdrücklich auf null. Ein zusätzlicher Detailabruf ist
nicht Teil dieses Kartenumbaus; kein erfundener Text, kein zusätzlicher dauerhafter
Abruf pro Fund. Discord-Nachrichtenadressen sind nicht vorhanden, daher führt
der Button zur tatsächlichen Vinted-Anzeige. Keine Änderung an Bot, Datenbank,
produktiven Suchaufträgen oder Abhängigkeiten.

**Prüfung:** Elf Shared-Button-Tests, neun Feed-Tests, Typprüfung, Angular-Bau,
gezieltes ESLint/Prettier und Shared-UI-Architekturprüfung grün. Zwei vorhandene
Playwright-Abläufe erweitert: drei Fotos mit gemessener Links-/Rechtsgeometrie,
ein/zwei/keine/defekte/unerlaubte Bilder, echter Tabwechsel zum abgefangenen
Vinted-Testziel und anschließendes Fortsetzen, Pause, Merkzettel und Workspacewechsel.
Desktop/hell und Handy/dunkel mit AXE grün, keine JavaScript-Laufzeitfehler.
Browser plugin not available; bestehender Playwright-Ablauf verwendet. Screenshots
mit ausdrücklich synthetischen Testbildern visuell geprüft. Keine angemeldete
Produktions-UI-Abnahme. Der vorherige Zwei-Sekunden-Feedabruf bleibt im selben Zweig.

**Offen:** PR-Freigabe und Veröffentlichung. Einzelzulauf im Sekundentakt sowie
Beschreibungstexte innerhalb der Karten sind nicht umgesetzt.

## 2026-09-13 – Codex – Gebündelten Artikelzulauf untersuchen

**Auftrag:** Nutzer bemängelt schubweise neue Artikel und vergleicht mit einzeln
erscheinenden Discord-Funden. Eigener Zweig/Worktree
`codex/vinted-individual-arrivals` von `origin/master` (`e05b79c`). Fremde Zweige
unverändert. Die vorherigen Bot-Erweiterungen sind inzwischen über PR #63/#64
veröffentlicht; Nike, adidas und Ralph Lauren sammeln produktiv ohne Preisgrenzen.

**Nachweis:** Drei aktive Markenaufträge mit jeweils 20 Sekunden Abrufintervall,
nahezu gleichzeitig fällig. Stichprobe: neun Anfragen in der letzten Minute bei
Budget 30, keine Ablehnungen oder Laufzeitfehler. Zwischen 22:34 und 22:38 UTC
am 12.09. wurden 26/48/54/40/29 Artikel gespeichert (Randminuten unvollständig).
Die Oberfläche fragt zusätzlich nur alle zehn Sekunden nach und ersetzt die
aktuelle Seite insgesamt. Eine gleichmäßige Discord-Ausgabe belegt deshalb
noch keine schnellere Entdeckung auf dem Marktplatz.

**Vorbereitet:** Sichtbare Artikel-/Dealansicht lädt alle zwei Sekunden nach.
Ausgeblendete Tabs und die Merkzettelverwaltung überspringen den periodischen
Feedabruf; Fehler setzen die Wiederholung auf zehn Sekunden zurück. Bestehende
Sperre gegen überlappende Abrufe und Cleanup bleiben erhalten. Mehrere bereits
bekannte Funde werden weiterhin sofort zusammen angezeigt. Keine künstliche
Ausgabewarteschlange, keine produktive Konfigurations- oder Datenbankänderung.

**Prüfung:** Neun Feed-Tests, Angular-Produktionsbau, gezieltes ESLint und
Formatierung sowie zwei Playwright-Abläufe grün (Desktop/hell 1440 × 1000,
Handy/dunkel 390 × 844, AXE, keine Laufzeitfehler). Browser plugin not available;
vorhandener Playwright-Ablauf verwendet. Ergänzt: drei neue Artikel innerhalb
von fünf Sekunden sichtbar, anschließend Pause und Fortsetzen ohne Verlust.
Screenshots und mobile Darstellung geprüft; externe Produktbilder sind in den
Testdaten nicht enthalten. Produktionsoberfläche nicht angemeldet geprüft.

**Offen:** Nutzerpräferenz zwischen sofortiger Anzeige und bewusst verzögertem
Einzelzulauf ist angefragt. Letzterer ist noch nicht umgesetzt. Änderungen nur
lokal vorbereitet, kein Push, PR oder Deployment dieses Zweigs.

## 2026-09-12 – Codex – Reine Markenaufträge für den gewünschten Botstart

**Auftrag:** Nutzer wählt Nike, adidas und Ralph Lauren, alle Preise. Zentrale
Sammlung und persönliche Merkzettel bleiben getrennte Filterebenen. Eigener
Branch/Worktree `codex/vinted-brand-only-searches` von `origin/master` (`1c2e452`).
Fremde Zweige unverändert.

**Ursache und Änderung:** Der Sammler unterstützt Markenabfragen bereits, aber
Tabellenbedingung, Verwaltungsfunktion und Formular verlangten zusätzlich
Kategorie oder Suchtext. Reine Markenkennungen werden nun als ausreichender
Zuschnitt akzeptiert. Komplett leere Aufträge und ungültige Marken bleiben
gesperrt. Suchtext und Preisgrenzen werden nicht stillschweigend ergänzt.
Rechte, pausiertes Anlegen und unveränderliche Filter bestehender Aufträge
bleiben erhalten. Formular erklärt fehlende Preisbewertung bei unbekannter
Kategorie; Suchlinkimport und Leermeldungen entsprechend angepasst.

**Live-Prüfung:** Auf dem bestehenden Server nur lesende Vinted-Abfragen mit
dem vorhandenen Sitzungsweg, ohne Speicherung der Artikel. Nike (53), adidas
(14), Ralph Lauren (88): jeweils HTTP 200, 95/96 Artikel und ausschließlich
die gesuchte Marke. Zweite Stichprobe nach rund zwölf Sekunden: 13/5/2 neue
Artikel. Geplanter Starttakt: 20 Sekunden je Auftrag, etwa neun Anfragen pro
Minute von 30. Stichprobe ist kein Vollständigkeitsnachweis. Antworten enthalten
keine Kategoriekennung; daher keine erfundene Zuordnung oder Preisbewertung.
„Polo Ralph Lauren“ (4273) ist eine separate Marke und nicht zusätzlich gewählt.

**Datenbank:** Migration `20260912205352_sniper_brand_only_queries.sql` aus den
deklarativen Schemadateien mit Supabase 2.114.0 generiert, vollständig geprüft
und Schreibweise normalisiert. Ersetzt nur Tabellenbedingung und bestehende
Verwaltungsfunktion; keine produktiven Daten, Aufträge oder Rechteänderungen.
Typen aus migrierter isolierter Testdatenbank neu erzeugt, ohne Typendifferenz.
Abschließender Schemaabgleich ohne Differenz; Testdatenbank samt temporären
Volumes anschließend über deren CLI gestoppt. Projekt
`flipbase-sniper-brand-only-test` getrennt auf dem Server, da lokales Docker
nicht verfügbar ist. Kein Eingriff in die Produktionsdatenbank.

**Prüfung:** 90 SQL-Tests für Administration, Merkzettelfeed und Bot-Schema
grün. 118 Bot-Tests und elf Tests für Verwaltungsfilter/Linkimport grün.
Browserabläufe für Desktop/hell und Handy/dunkel mit AXE und zusätzlichem
Markenauftrag ohne Suchtext/Preise. Dabei fehlte der scrollbaren Auftragstabelle
bei geöffnetem Formular der Tastaturzugang, weil ihre Knöpfe dann deaktiviert
sind; Tabelle erhält einen fokussierbaren, benannten Scrollbereich.
Beide Browserabläufe anschließend grün und Screenshots visuell geprüft.
Anwendungs-/Bot-Typprüfung, Angular-Produktionsbau, gezieltes ESLint und
Formatierung sowie Shared-UI-Prüfung grün.

**Noch offen:** PR-Freigabe und Veröffentlichung.
Danach die drei vorbereiteten Aufträge in der Administration anlegen und
aktivieren und tatsächlichen Einlauf im Deal-Monitor prüfen. Aktuell weiterhin
keine produktiven Sammelaufträge oder Merkzettel angelegt.

## 2026-09-12 – Codex – Nutzerfilter und Artikelansicht für den Deal-Monitor

**Auftrag:** Freigegebene Fortsetzung nach PR #62, eigener Zweig
`codex/vinted-user-feed` und Worktree von `origin/master` (`853ecc2`). Fremder
Hauptcheckout und andere Zweige unverändert. Keine produktiven Suchaufträge angelegt.

**Umsetzung:** `/deal-monitor` unter Werkzeuge mit drei neuesten Funden,
chronologischem Raster, Artikel-/Dealansicht und Merkzetteln pro Arbeitsbereich.
Auf dem Handy seitlich durchblätterbare Highlights und zweispaltiges Raster.
Zulauf alle zehn Sekunden, Pause mit Zähler, stabile Seitennavigation bis
300 Artikel; Fortsetzen lädt die neueste Seite. Merkzettel filtern Kategorie,
Markenname, Suchtext, Zustand und Preise; sie verändern keine Sammelaufträge.
Neue/geänderte Kriterien gelten für künftig entdeckte Deals. Historische
Treffer behalten ihren damaligen Vergleich. Löschen entfernt nur Merkzettel
und zugehörige Treffer. Fehlende Sammlung, alte Betriebsmeldung, Fehler und
leere Ansichten werden erklärt. Shared-Komponenten und bestehende UI-Richtlinie
verwendet; nur Tailwind, keine neue Abhängigkeit.

**Backend:** Getrennte Merkzettel-/Treffertabellen, arbeitsbereichsbezogene
Leserechte und geprüfte Schreib-/Feedfunktionen. Alte Abonnements und Treffer
werden mit Kennungen und Zeitstempeln übernommen; der alte Browser-Schreibweg
für zentrale Aufträge ist gesperrt. Der Bot bewertet ausschließlich neue
Merkzetteltabellen und ordnet Funde allen passenden Filtern zu. Eine später
bekannte Kategorie kann bei Duplikaten ergänzt werden, ohne den Erstfund zu
verändern. Einlesebestand bleibt stumm; fehlende Vergleichspreise bleiben zur
erneuten Prüfung offen. 14-Tage-Vergleich und 30-Tage-Aufbewahrung bleiben erhalten;
die Bereinigung löscht auch neue Treffer über deren Fremdschlüssel mit.

**Datenbank:** Zwei Migrationen mit Supabase 2.114.0 aus dem deklarativen Schema
generiert und vollständig geprüft. Fehlende geerbte Rechteentzüge sowie die
explizite Bestandsübernahme im generierten SQL ergänzt; SQL-Schreibweise
normalisiert. Typen aus der migrierten Datenbank erzeugt. Abschließender
Schemaabgleich ohne Differenz. Isoliertes Projekt `flipbase-sniper-feed-test`
auf dem Server genutzt, weil lokales Docker nicht verfügbar ist; anschließend
Testdatenbank und temporäre Volumes über dessen CLI gestoppt/entfernt.
Keine produktive Migration, Löschung oder Botaktualisierung durchgeführt.

**Prüfung:** Gesamte Datenbanksuite mit 1.511 Tests in 43 Dateien grün; nach
zusätzlichen Filter-/Aufbewahrungsgrenzfällen nochmals alle 42 betroffenen
SQL-Tests grün. Tatsächliche Datenübernahme aus dem Migrations-SQL separat mit
alten Abonnements, Markenkennung, Treffern und Zeitstempeln im zurückgerollten
Testlauf geprüft. Bot: 115 Tests in 16 Dateien und Typprüfung grün.
Frontendzustand/URL-Prüfung: neun Tests grün. Zwei Browserabläufe mit lokalen
Fixtures für Desktop/hell und Handy/dunkel einschließlich AXE, Speichern mit
Fehler/Wiederholung, Bearbeiten/Verwerfen, Pause, Löschen und verzögertem
Nachladen beim Arbeitsbereichswechsel. Screenshots visuell geprüft; Bildflächen
zeigen bewusst Platzhalter der Testdaten. Produktionszugang nicht simuliert.
Typprüfung, Angular-Produktionsbau, gezieltes ESLint/Formatierung, Shared-UI-Prüfung
und acht Browser-Suite-Vertragstests grün. Bot-Abbild gebaut und ohne Netz,
echte Zugangsdaten oder Schreibrechte erfolgreich im Starttest geprüft.
Vorhandenes Playwright verwendet, da die im Frontend-Testskill vorausgesetzte
Browser-Laufzeit in dieser Sitzung nicht verfügbar ist.

**Grenzen und Release:** Noch keine produktiven Artikel zur Sichtprüfung.
Keine Live-Markensuche; neue Filter vergleichen normalisierte Artikelnamen.
Übernommene Markenkennungen bleiben bis zum Setzen eines Markennamens bestehen;
ein neuer Merkzettel kann die alte Einschränkung ersetzen. Preis-/Verfügbarkeits-
änderungen bekannter Artikel werden weiterhin nicht nachgeführt. Beim Release
alten Bot vor der Bestandsübernahme anhalten, Migrationen/Anwendung veröffentlichen
und danach den Bot mit dem geprüften Release-Abbild starten. Der normale
Webrelease aktualisiert den separaten Bot nicht. PR und Veröffentlichung
benötigen die abschließende Freigabe gemäß AGENTS.md.

## 2026-09-12 – Codex – Gruppenpreise und 30 Tage Artikelaufbewahrung

**Auftrag:** Nach der veröffentlichten Suchverwaltung weiterarbeiten. Eigener
Zweig `codex/vinted-reference-prices`, eigener Worktree von `origin/master`
(`900de77`). Der Nutzer hat 30 Tage Aufbewahrung für Artikel samt Treffern
ausdrücklich gewählt. Fremde Zweige unverändert.

**Umsetzung:** Neue Referenzgruppe Kategorie/Marke/Zustand über mehrere
Sammelaufträge hinweg, 14-Tage-Fenster und mindestens acht Vergleichsangebote.
Markennamen werden normalisiert; bei zu kleiner Markengruppe Rückfall auf
Kategorie/Zustand. Ein übermäßig am Preislimit abgeschnittener Markenvergleich
wird nicht durch den Rückfall kaschiert. Maßgeblich ist jeweils das Limit des
Entdeckungsauftrags. Nur endliche, positive EUR-Preise; Textsuche ohne bekannte
Kategorie bleibt ohne Schätzung. Jeder neue Treffer speichert seine tatsächliche
Vergleichsgruppe; historische Treffer und bisherige RPC-Signatur bleiben erhalten.

**Aufbewahrung:** Dienst bereinigt beim Start und einmal pro Minute maximal
1.000 Artikel älter als 30 Tage seit Erstfund. Volle Pakete werden im nächsten
Sammeltakt fortgesetzt, damit Rückstände abgebaut werden. Treffer werden per
Fremdschlüssel mitgelöscht, Aufträge/Abonnements bleiben bestehen. Index auf
Treffer-Artikelbeziehung ergänzt. Fehler bleiben bis zum erfolgreichen Versuch
in der Betriebsmeldung sichtbar, ohne das Sammeln durch eine Ausnahme abzubrechen.

**Datenbank:** Migration `20260912181233_sniper_group_reference_retention.sql`
aus dem deklarativen Schema mit Supabase 2.114.0 generiert und geprüft.
Der Generator erfasst geerbte Funktionsrechte von `authenticated` nicht
vollständig; explizite Entzüge ergänzt. Außerdem gleicht der erzeugte Entzug
auf `sniper_runtime_status` dessen bereits deklarierte Leserechte ab (auch
`truncate` entzogen). Beides mit Rechteprüfungen abgesichert. Typen aus der
migrierten Testdatenbank neu erzeugt, abschließender Schemaabgleich ohne Differenz.
Isoliertes CLI-Projekt `flipbase-sniper-reference-test` auf dem Server genutzt,
weil lokales Docker nicht verfügbar ist; ausschließlich Testdaten. Testdatenbank
anschließend gestoppt und ihre temporären Volumes entfernt.

**Prüfung:** Gesamte Datenbanksuite: 1.475 Tests in 42 Dateien grün. Nach
zusätzlichen Rechte-/Null-Grenzfällen und genauer getrennten Testkategorien
nochmals 23 betroffene SQL-Tests grün. Bot: 111 Tests in 15 Dateien grün,
einschließlich Rückstand, Wiederholung, ausbleibender Parallelität und Fehlerstatus.
Bot- und Anwendungstypprüfung, Angular-Produktionsbau, gezieltes ESLint und
Formatierung grün. Bot-Abbild gebaut und ohne Netz, produktive Zugangsdaten
oder Schreibrechte gestartet; Prozessgesundheit und fehlende Sammelbereitschaft
im isolierten Starttest geprüft.

**Grenzen:** Noch keine unabhängigen Nutzerfilter oder Artikelansicht. Die
Trefferzuordnung hängt weiter am ersten Entdeckungsauftrag; diese Überlappung
wird im Nutzerfilter-Paket aufgelöst. Eine Wiederaufnahme zuvor gelöschter
Marktplatzartikel ist möglich. Bereinigung benötigt einen laufenden Bot.
Kein Produktionsupdate, keine produktive Löschung und keine Aufträge angelegt.
Migration und Botabbild müssen gemeinsam über den nächsten freigegebenen PR
veröffentlicht werden; nach einer Löschung erfordert Wiederherstellung ein Backup.

## 2026-09-12 – Codex – Sammelaufträge und Botbetrieb in der Administration

**Auftrag:** Nach PR #60 mit der Suchverwaltung fortfahren. Eigener Zweig
`codex/vinted-search-management`, eigener Worktree von `origin/master`
(`3815e5a`). Fremde Zweige unverändert.

**Umsetzung:** Neue Seiten `/admin/queries` und `/admin/operation` mit den
bestehenden Shared-Komponenten. Kategoriesuche über vollständige Pfade,
Übernahme einer Kategorie, Markenkennung und Preise aus einem Vinted-Suchlink,
Suchtext, Preisgrenzen, Takt und Notiz. Neue Aufträge starten pausiert.
Aktivieren/Pausieren über RPC mit Betreiberprüfung, nur aktuelle Botversion mit
frischer Betriebsmeldung darf aktiviert werden. Bestehende Filter bleiben
unveränderlich, Takt/Notiz sind bearbeitbar: Nachträgliches Ändern der Filter
würde vorhandene Funde und Medianvergleiche umdeuten. Fundzahlen zählen nur
Erstentdeckungen pro Auftrag. Keine Löschfunktion oder produktiven Suchaufträge.

**Betrieb:** Der Dienst sammelt jetzt auch mit Kategorie ohne Suchtext. Neue
Betriebstabelle mit RLS und ausschließlich administrativem Lesen; geschrieben
wird vom Dienst. Er meldet echte HTTP-Versuche und 403/429 der letzten Minute,
Budget, Zeitstempel und Zyklusfehler. Fehler beim Laden fälliger Aufträge zählen
jetzt als Fehler im Zyklusbericht statt als erfolgreicher leerer Durchlauf.
Seitenaktualisierung ohne überlappende Abrufe, mit Fehlererholung und Abbau.

**Datenbank:** Deklarative Schemata gepflegt, Migration mit Supabase 2.114.0
generiert, geprüft und SQL-Schreibweise vereinheitlicht. Typen aus der
migrierten Testdatenbank neu erzeugt. Lokales Docker war nicht einsatzbereit;
Abgleich und Tests liefen im getrennten CLI-Projekt
`flipbase-sniper-admin-test` mit ausschließlich Testdaten auf dem Server.
Kein Zugriff auf produktive Tabellen für diesen Umbau. Die erste Variante mit
Windows-Pfaden am entfernten Docker-Daemon scheiterte; der Linux-CLI-Abgleich
im eigenen temporären Verzeichnis war erfolgreich.

**Prüfung:** Datenbanksuite 1.437 Tests grün, nach Aktivierungsschutz zusätzlich
25 gezielte SQL-Tests grün. Bot 107 Tests, acht Modelltests und acht Angular-
Service-/Navigationstests grün. Browserablauf mit lokalen HTTP-Fixtures prüft
Anlegen, Fehler beim Speichern, Wiederholen, unveränderliche Filter, Bearbeiten,
Aktivieren/Pausieren und Betriebssicht. AXE ohne Ausnahmen über Formular, Liste
und Betriebssicht grün: Desktop hell (1440 px), Mobil dunkel (390 px), reduzierte
Bewegung. Screenshots geprüft; keine behauptete Shopify-Pixelabnahme.
Auch Kategoriesuche, Auswahl per Tastatur, Schutz ungespeicherter Änderungen,
Fokus beim Öffnen/Speichern und veraltete Betriebsmeldung sind im Browser
geprüft. Typprüfung, Angular-Produktionsbau, gezieltes ESLint und Shared-UI-
Prüfung (69 Vorlagen, keine Funde) grün. Die Workflowtests bestehen mit 57
erfolgreichen Prüfungen und vier bestehenden Windows-Ausnahmen. Die feste
Erwartung der Browser-Suite wurde von acht auf zehn Fälle erweitert (Nightly:
30 statt 24 Browserfälle). Der Mobiltest wartet vor dem Öffnen der Auswahl auf
das abgeschlossene Scrollen, da Scrollen den Shared-Popover absichtlich schließt.
Das Botabbild besteht den isolierten Starttest ohne Netz und Schreibrechte.
Die separate Testdatenbank wurde nach den Prüfungen wieder gestoppt.

**Grenzen/Nächste Schritte:** Markenkennung wird aus dem Suchlink übernommen;
eine Live-Markensuche nach Namen folgt separat. Die ältere Abonnementfunktion
und `is_standard` bleiben bis zur Merkzettel-Migration kompatibel. Neue
Trefferregel, Aufbewahrungsfrist und Nutzer-Artikelraster sind weiter offen.
Das neue Botabbild muss nach der Schema-Migration gesondert aktualisiert werden.

## 2026-09-12 – Codex – Fehlenden Vinted-Dienstbetrieb nachgewiesen und vorbereitet

**Auftrag:** Nach der Bestandsaufnahme mit dem Botbetrieb beginnen; auf
ausdrücklichen Nutzerwunsch eigener Branch `codex/vinted-bot-operation`, eigener
Worktree von `origin/master` (`b413c44`). Fremde Zweige unverändert.

**Ursache auf dem Server bestätigt:** Kein Sniper-/Vinted-Container, kein
passender Systemdienst und kein Bot unter `/opt`. Der vorhandene Node-Prozess
gehört zu einem anderen Container. Die produktive Datenbank enthält null
Kategorien, Suchaufträge, Artikel und Treffer. `requested_at` ist gesetzt,
`last_attempt_at`, `refreshed_at` und `last_error` sind leer. Die Anforderung
kam somit an, wurde aber nie abgearbeitet. Ein einzelner Homepageabruf vom
Server liefert HTTP 200; der unveränderte Parser liest daraus 2.920 Kategorien
mit neun Wurzeln und 2.500 Blättern. Kein Parserfix erforderlich.

**Umsetzung:** Eigenes minimales Betriebsabbild unter `services/sniper`,
Positivliste für den Build-Kontext ohne Schlüssel/Testdaten und separate
Compose-Konfiguration mit einem Dienst, Neustartregel, unprivilegiertem Benutzer,
schreibgeschütztem Dateisystem, begrenzten Logs und ohne veröffentlichten Port.
Die vorhandene Node-Hauptversion 22 bleibt, stabiler Patch 22.23.2 aus dem
offiziellen Image-Katalog geprüft. Keine npm-Abhängigkeiten aktualisiert.
Der Sniper-CI-Job baut das Abbild und startet einen Smoke-Test ohne Netzwerk,
gültige Zugangsdaten oder Schreibrechte. Keine automatische Produktionsinstallation
durch diese neue CI-Prüfung; Ablauf und Abnahme stehen in `services/sniper/README.md`.

**Statusendpunkte:** `/live` belegt ausschließlich einen antwortenden Prozess.
Das bestehende `/health` bleibt bis zur ersten erfolgreichen Suchrunde auf 503.
Damit funktioniert die Docker-Prozessprüfung bereits für das Einlesen der
Kategorien bei null Suchaufträgen, ohne eine erfolgreiche Suche zu behaupten.
Auch danach belegt der vorhandene Health-Zeitstempel keine aktuelle Verbindung;
diese Grenze ist in der Anleitung ausdrücklich festgehalten.

**Administrationsseite:** Status wird alle fünf Sekunden nach der vorherigen
Antwort neu gelesen, ohne überlappende Abfragen. Cleanup über `DestroyRef`,
vorübergehende Lesefehler erholen sich automatisch. Ab einer Minute weist die
Seite auf eine unbeantwortete Einleseanforderung hin. Der Live-Bereich meldet
den Abschluss oder Fehlschlag; der vorher dauerhaft stehenbleibende lokale
„angefordert“-Merker entfällt. Die Statusabfrage selbst löst keine Vinted-Anfrage aus.

**Prüfung:** Ausgangsstand des Dienstes 104 Tests, Typprüfung und Bau grün.
Neue Fehlerfälle für automatische Anzeige, Erholung, Wartehinweis und den
Prozessendpunkt zuerst rot, anschließend grün. Zusätzliche Kontrolle langsamer
Antworten, Aufräumen beim Verlassen und AXE-Prüfung in jsdom; Farbkontrast dort
wie im bestehenden Testaufbau mangels Layout ausgenommen. Angular-Produktionsbau
grün. Workflowprüfungen: 57 bestanden, vier bestehende Windows-Skips; Shared-UI-
Prüfung 66 Vorlagen ohne Befund. Das neue Linux-Abbild auf dem Server in einem
eigenen temporären Verzeichnis gebaut und den echten Prozesseinstieg über den
isolierten Smoke-Test geprüft. Ein erstes Versionsprobe-Kommando scheiterte an
einem durch PowerShell übertragenen CR-Zeichen, nicht am Abbild; der anschließende
Docker-Starttest über den SSH-Docker-Host bestand. Formatierung/Lint und
Diffprüfung gezielt auf die Änderungen angewendet.

**Produktionsgrenze:** Kein laufender Produktions-Bot gestartet, keine Schlüssel
ausgegeben, keine Geschäftsdaten geändert und keine Suchaufträge angelegt.
Nur lesende Datenbankdiagnose, ein öffentlicher Vinted-Abruf und isolierte
Build-/Testartefakte auf dem Server. Die tatsächliche Installation und der
Nachweis des gespeicherten Kategoriebaums folgen nach dem grünen PR.
Sammelauftragsverwaltung und Nutzeroberfläche bleiben nachfolgende Pakete.

## 2026-09-12 – Claude Opus 5 (Anthropic) – Chronik im Shopify-Stil

**Auftrag/Ergebnis:** Die gemeinsame Chronik von Einkäufen und Verkäufen liest
sich jetzt als Satz je Vorgang, die ganze Zeile klappt sich auf, und aufgeklappt
stehen nur echte Änderungen. Zweig `feat/timeline-shopify-style`, abgezweigt von
`master` (ab3f8d1). Entwurf unter
`docs/superpowers/specs/2026-09-12-timeline-shopify-style-design.md`.

**Ursachen:**

- Die Zeile zeigte das nüchterne Etikett (`Grischa Tänzer · Einkaufsentwurf
geändert`) und daneben einen eigenen Knopf `Details ansehen`.
- `create_purchase` schreibt `purchase_draft_created` mit `before: null` und dem
  vollständigen Schnappschuss aus Einkauf, Positionen und Kosten. Der Vergleich
  hielt deshalb jedes einzelne Feld für eine Änderung.
- Der Listenvergleich ordnete geänderte Positionen nicht zu, sondern meldete sie
  als Abgang plus Zugang: eine geänderte Menge erzeugte sechs Zeilen mit
  Beschriftungen wie `Positionen · Vorher · 1 · Menge`.
- Die Zeitleisten-Linie lag je Tagesabschnitt in einer eigenen Liste und brach
  zwischen den Abschnitten ab.

**Umsetzung:** Der Ereignistext entsteht aus einem Prädikat
(`diesen Einkauf erstellt`); das Subjekt kommt erst beim Anzeigen dazu — `Du
hast …` beim eigenen Verursacher, sonst der Name, ohne Verursacher `Das System`.
Für unbekannte Ereignistypen bleibt bewusst das alte `Name · Etikett` stehen,
damit kein Satz erfunden wird. Aufklappbar ist eine Zeile nur, wenn nach dem
Filtern etwas übrig bleibt; reine Aussagen (erstellt, bestellt, angekommen) sind
schlichter Text ohne Fokus. Der Vergleich liegt jetzt einmal in
`src/app/shared/utils/record-changes.ts` und wird vom Artikelverlauf nur noch
übersetzt. Eine durchgehende Leiste entsteht aus Segmenten je Eintrag; der letzte
endet an seinem Punkt.

**Nachtrag auf Wunsch:** Tagesüberschriften heißen jetzt `6. September` statt
`Sonntag, 6. September 2026`. Das Jahr kommt nur dazu, wenn es ein anderes als
das laufende ist; der genaue Zeitpunkt steht ohnehin im Titel jeder Uhrzeit.

**Entscheidungen:** Listeneinträge werden nur mit Beleg verknüpft — gleiche
Kennung oder gleiche Bezeichnung. Ohne Beleg bleiben Abgang und Zugang getrennt,
weil ein Prüfprotokoll keine Verbindung behaupten darf. Damit bleibt die frühere
Absicht erhalten, dass ein Einschub die folgenden Positionen nicht als geändert
erscheinen lässt. Ab 13 Änderungen wird gekürzt mit `Alle N Änderungen zeigen`;
dauerhaft verborgen wird nichts, und Prüfdruck und Datenarchiv enthalten
ohnehin weiterhin die vollständige Nutzlast.

**Prüfung:** `npm run verify` grün (1981 Tests, Typprüfung, ESLint, Formatierung,
Shared-UI-Prüfung 66 Vorlagen ohne Befund, Produktionsbau). Playwright-Abläufe
`record-timeline`, `compact-controls` und `admin-accent` bestanden (12 Tests).
Sichtprüfung in der lokalen Demo auf Einkaufsdetail in dunklem und hellem Design
sowie mobil; Leiste und Punktmitte liegen gemessen bei x=264, Tagesüberschrift
und Inhaltstext bündig bei x=296. Keine Backend- oder Schemaänderung, keine
erfundenen Ereignisse.

## 2026-09-11 – Claude Opus 5 (Anthropic) – Bildoptimierer: Nachbesserungen nach der ersten Nutzung

**Auftrag/Ergebnis:** Sieben Rückmeldungen aus der ersten echten Arbeit mit der
neuen Arbeitsfläche umgesetzt: Trenner mittig, kein GPS-Abzeichen an den
Kacheln, Umsortieren per Ziehen, kein doppeltes Hinzufügen beim Ziehen in der
Seite, Steuerleiste unter dem Bild, Export ohne Ordner-Dialog, deutliche
Ablagefläche. Zweig `feat/image-optimizer-polish`, abgezweigt von
`origin/master` (5a11621).

**Ursachen:**

- Trenner: Griff-Spalte nur 0,75 rem, die rechte Box zusätzlich mit
  `lg:ml-4` – der Strich lag etwa 6 px von links, 22 px von rechts.
- Doppeltes Bild: Chrome bietet ein gezogenes `<img>` aus der Seite als Datei
  an; die seitenweite Ablage-Erkennung hielt das für einen Upload.
- Ablagefläche: `.linear-surface` setzt seinen Hintergrund in normalem CSS
  und schlug damit jede Tailwind-Hintergrundklasse; der Farbton erschien nie.
- Export-Dialog: Ein Browser kann keinen Ordner herunterladen. Ohne
  `showDirectoryPicker` bleiben nur Einzeldatei oder ZIP.

**Entscheidungen des Nutzers:** Eine einzelne Datei landet direkt als JPEG
im Download-Ordner, mehrere als ZIP mit Plattform-Ordnern; der Ordner-Export
aus Paket 2 ist vollständig zurückgebaut. Umsortieren per Ziehen über das
Angular CDK (neue Abhängigkeit), die Pfeile bleiben im Werkzeug-Menü als Weg
ohne Ziehen (WCAG 2.2 AA, 2.5.7). Farben nach
`docs/design/admin-ui-guidelines.md`: kräftiger gestrichelter Rand in der
Textfarbe mit leichtem Logo-Gelb-Ton – Indigo verbietet die Richtlinie, Gelb
als Rand hätte nur etwa 1,6:1.

**Funde, die erst die Prüfungen aufgedeckt haben:**

- Die erste Sperre gegen das doppelte Bild war ein Merker an der Direktive.
  Er konnte hängenbleiben, wenn das gezogene Element während des Ziehens aus
  der Seite verschwindet – danach hätte der Browser jede echte Datei selbst
  geöffnet und die Sitzung verloren. Ersetzt durch eine Kennung am
  Ziehvorgang selbst (`dataTransfer.setData`); ein Test deckt genau den
  Hänge-Fall ab.
- Die ganze Kachel war Ziehquelle: Knöpfe konnten versehentlich ziehen, auf
  dem Handy löste Wischen ein Ziehen aus. Jetzt nur am Bild, auf Touch nach
  250 ms Halten.
- Das CDK sperrt am Ziehgriff das Scrollen (`touch-action: none`); über
  einem Bild ließ sich auf dem Handy nicht wischen. Mit `pan-y`
  zurückgegeben.
- Die Zieh-Vorschau zog dem Zeiger nach, weil die Kachel `transform`
  animierte.
- Die unsichtbaren Werkzeugknöpfe nicht aktiver Kacheln ließen sich auf
  Touch antippen – ein Tipp konnte ein Bild entfernen. Jetzt nur klickbar,
  wenn sichtbar.
- `--color-fb-primary-subtle` fehlte im Tailwind-Theme; `bg-fb-primary-subtle`
  wurde nirgends erzeugt. Eine Zeile in `src/styles.css` ergänzt. Das lässt
  auch im Kopfbereich-Menü und in der gemeinsamen Auswahlliste erstmals den
  vorgesehenen Hover-/Auswahlton erscheinen.

**Betroffen:** `features/image-optimizer/` – `image-list` (neu mit
`.scss` nur für CDK-Klassen), `crop-editor`, `drop-zone`, `platform-preview`,
`directives/file-drop`, `services/image-collection`,
`image-optimizer.component.*`; entfernt: `directory-export.service`,
`free-folder-name`. Dazu `shared/components/split-pane`, `src/styles.css`
(eine Zeile), `package.json` (`@angular/cdk`). Keine Datenbankänderung.

**Geprüft:** `npm run verify` erfolgreich (Exitcode 0, ohne Pipe gemessen):
1123 Node-, 178 DOM- und 657 Angular-Tests, Format, Lint, Typen,
Workflow-Tests, Suite-Audit und Bau. Chunk `image-optimizer-component` von
98,17 kB auf 162,39 kB roh (25,14 → 40,22 kB übertragen) – der Einstiegspunkt
von `@angular/cdk/drag-drop` bringt Scrollen, Bidi und Plattformhilfen fest
mit; importiert werden nur drei Direktiven. Jede Aufgabe mit eigener Prüfung,
danach eine Abschlussprüfung über den ganzen Zweig; deren Funde sind behoben.

**Noch offen:** Probe im Browser und auf dem Handy (hinter der Anmeldung):
Trenner mittig; Leiste unter dem Bild, untere Rahmenkante greifbar; Ziehen
mit Maus ohne Nachziehen; auf dem Handy Wischen scrollt, Tippen wählt aus,
langes Drücken zieht, kein „Bild sichern“-Menü; Bild in der Seite ziehen
fügt nichts hinzu, danach eine echte Datei schon; Einzeldatei als JPEG, zwei
Plattformen als ZIP; Ablagefläche deutlich. Außerdem als eigene Aufgabe
vorgeschlagen: gelbe Schrift auf hellem Grund im Kopfbereich-Menü und in der
Auswahlliste (etwa 1,5:1).

---

## 2026-09-11 – Claude Opus 5 (Anthropic) – Bildoptimierer: Arbeitsfläche mit Trenner, Raster und Vorschaukacheln

**Auftrag/Ergebnis:** Paket 3 der Bildoptimierer-Überarbeitung umgesetzt, die
sichtbare Arbeitsfläche. Vorschau und Bilder stehen nebeneinander, getrennt
durch einen verschiebbaren Trenner; die Bilder rechts bilden ein Raster; die
Bildsteuerung liegt als Leiste auf dem Bild, die Farbregler in einem
aufklappbaren Panel; die Metadaten stecken in einem Fenster; Plattformreiter
und Exportvorschau sind zu einer Reihe von Kacheln unter dem Bild verschmolzen.
Zweig `feat/image-optimizer-layout`, abgezweigt von `origin/master` (a9566d8).

**Warum:** Die Bilderliste klebte als feste 16-rem-Spalte am rechten Rand, egal
wie breit das Fenster war. Die Farbregler standen unter dem Editor und machten
die Seite so lang, dass man zum Beurteilen einer Farbänderung das Bild aus dem
Blick scrollen musste. Die Metadaten schoben bei jedem Handyfoto die
Exportleiste aus dem Bild. Und Plattformauswahl und Exportvorschau zeigten
dasselbe an zwei Enden der Seite.

**Neuer geteilter Baustein:** `shared/components/split-pane/` – die Rechnung
(Grenzen, Zeiger, Tasten, gemerkter Wert) liegt ohne DOM in
`split-pane-ratio.ts` und ist rein getestet. Der Griff ist ein
`role="separator"`, per Pfeiltasten, Umschalt, Pos1/Ende und Doppelklick
bedienbar; unterhalb von 1024 px verschwindet er aus dem Baum. Die Breite wird
im Browser gemerkt.

**Funde, die erst die Prüfungen aufgedeckt haben:**

- Der Trenner merkte sich seine Breite nie: Der Speicher wurde im Konstruktor
  gelesen, bevor Angular den Schlüssel gesetzt hatte. Kein Test prüfte das
  Zurücklesen; jetzt schon, mit nachgewiesenem Rot vor dem Fix.
- Das Farb-Panel rutschte bei schmaler Spalte unter die umbrechende Leiste, und
  der Tastaturfokus landete auf verdeckten Knöpfen (WCAG 2.4.11). Leiste und
  Panel stehen jetzt in einer gemeinsamen Hülle, das Panel immer darüber.
- Der Griff des Trenners hatte nur etwa 1,1:1 Kontrast; jetzt über 5:1.
- Der Planentwurf hätte das GPS-Abzeichen von `app-badge` auf einen rohen
  `span` mit dekorativem Marker zurückgedreht und den schützenden Test gelöscht.
  Der Implementierer hat sich geweigert und eskaliert; der Plan wurde berichtigt.
- Ein Test „Panel schließt beim Bildwechsel" ersetzte das beobachtete Signal,
  statt es zu setzen, und prüfte so nichts. Berichtigt.
- „Auf alle Bilder übernehmen" war nach dem Umzug auch bei nur einem Bild
  klickbar. Wieder an „mehr als ein Bild" gebunden.
- Der Kontrast des Warntexts auf den Kacheln wurde nachgerechnet: 4,76:1 hell,
  5,43:1 dunkel.

**Vorab am Plan berichtigt:** Für die große Vorschau entsteht kein zweites
Bauteil; die Kachel bekommt eine Darstellungsart `full`, weil sie die ganze
Render-Mechanik (Entprellen, Object-URLs, Fehlerzustand) schon trägt. Zwei
Tests, die Klassennamen prüfen, sind als Rückfallsicherungen benannt – jsdom
rechnet kein Layout.

**Betroffen:** `shared/components/split-pane/` (neu),
`features/image-optimizer/` – `image-list`, `crop-editor`,
`adjustment-controls`, `metadata-modal` (ehemals `metadata-panel`),
`platform-preview`, `image-optimizer.component.*`. Entfernt: `platform-tabs`,
`preview-grid`. Keine Datenbank-, Abhängigkeits- oder Schemaänderung.

**Geprüft:** `npm run verify` vor dem Zusammenführen mit `master` erfolgreich
(Exitcode 0, ohne Pipe gemessen): 1126 Node-, 180 DOM- und 639 Angular-Tests,
dazu Format, Lint, Typen, Workflow-Tests, Suite-Audit und Bau. Chunk
`image-optimizer-component` 98,17 kB roh / 25,13 kB übertragen (vorher
90,11 kB). Jede der sieben Aufgaben lief durch eine eigene Prüfung, danach eine
Abschlussprüfung über den ganzen Zweig; deren Funde sind behoben.

**Noch offen:** Die Probe im Browser. Der Bildoptimierer liegt hinter der
Anmeldung, deshalb konnte sie nicht automatisch erfolgen. Zu prüfen: Trenner
ziehen und neu laden, Position bleibt; Farb-Panel bei 1280 px und Trenner auf
25 % – untere Knöpfe sichtbar und per Tab erreichbar; Hochkantfoto mit Vinted –
untere Rahmenkante greifbar; über 1024 px hin und her; Fokusrahmen an den
Kacheln in beiden Designs; „Metadaten" öffnet das Fenster, Fokus kehrt zurück;
AXE mit offenem Panel, offenem Fenster und einer Kachel mit Warnung.

---

## 2026-09-11 – Antigravity – Verkäufer-Dialog: Button-Beschriftung "Speichern" und PLZ/Ort nebeneinander

**Auftrag/Ergebnis:** Der Aktionsbutton im Verkäufer-Dialog (`PurchaseSellerDialogComponent`) hieß bisher dynamisch wie der Dialogtitel ("Verkäufer bearbeiten" bzw. "Verkäufer erstellen") statt schlicht "Speichern". Zudem standen Postleitzahl und Ort getrennt über zwei Zeilen verteilt, weil das Land-Auswahlfeld vor dem Adressblock stand und die zweispaltige Anordnung verschob. Auf Zweig `fix/seller-dialog-button-and-zip-city-layout`.

**Ursache und Lösung:**

- Im Dialogfooter stand `{{ saving() ? 'Speichere…' : dialogTitle() }}`. Dies wurde auf `{{ saving() ? 'Speichere…' : 'Speichern' }}` geändert, sodass der Button einheitlich und klar als "Speichern" beschriftet ist.
- Im Adressraster (`sm:grid-cols-2`) wurde das Land-Auswahlfeld hinter `contactFields` verschoben. Dadurch belegen Straße & Adresszusatz Zeile 1, Postleitzahl & Ort Zeile 2 (nebeneinander in Spalte 1 und Spalte 2), sowie Land & E-Mail Zeile 3.

**Betroffen:**

- `src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.html`
- `src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts`

**Geprüft:**

- `npx vitest run src/app/features/sellers/components/purchase-seller-dialog/purchase-seller-dialog.component.angular.spec.ts` (10 Tests grün, inkl. Axe-A11y)
- `npx vitest run src/app/features/sellers/` (16 Tests grün)
- `npm run typecheck` (tsc fehlerfrei)
- `npx eslint src/app/features/sellers/components/purchase-seller-dialog/` (fehlerfrei)
- `npx ng build --configuration=development` (erfolgreich)
- `npx prettier --check` (fehlerfrei)

## 2026-09-10 – Antigravity – Einkauf löschen: Fallback auf Belegnummer oder neutralen Dialogtext

**Auftrag/Ergebnis:** Behebt einen Darstellungsfehler beim Löschen von Einkaufsentwürfen. Im Bestätigungsdialog erschien bisher der Text „„“ wird gelöscht...“ mit leeren Anführungszeichen, da neue Einkäufe im überarbeiteten Workflow typischerweise keinen Freitext-Titel besitzen, sondern primär über ihre Belegnummer identifiziert werden. Auf Zweig `fix/purchase-delete-dialog-title`, abgezweigt von `origin/master`.

**Ursache und Lösung:**

- In `purchase-detail.component.ts` interpolierte die Löschmethode `onDeletePurchase()` direkt `purchase.title` ohne Fallback auf `record_number` oder Lieferanten.
- Neue Hilfsfunktion `getPurchaseDisplayTitle` in `purchase-presentation.ts` priorisiert `record_number`, fällt dann auf `title` bzw. `supplier.name` zurück und liefert `null`, wenn keine Kennzeichnung existiert.
- `onDeletePurchase()` nutzt `getPurchaseDisplayTitle`: Wenn ein Bezeichner ermittelt wird, heißt es `„<Titel>“ wird gelöscht...`; fehlt er völlig, wird sauber auf die neutrale Formulierung `Dieser Einkauf wird gelöscht, zusammen mit allen zugeordneten Artikeln und Nebenkosten. Das lässt sich nicht rückgängig machen.` zurückgefallen.
- Im Template `purchase-detail.component.html` und der Seitenüberschrift wird `purchaseDisplayTitle()` als einheitlicher Titel genutzt.

**Betroffen:**

- `src/app/features/purchases/utils/purchase-presentation.ts`
- `src/app/features/purchases/utils/purchase-presentation.spec.ts`
- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts`

**Geprüft:**

- `npx vitest run src/app/features/purchases/utils/purchase-presentation.spec.ts` (36 Tests grün)
- `npx vitest run src/app/features/purchases/pages/purchase-detail/purchase-detail.component.angular.spec.ts` (20 Tests grün)
- `npm run typecheck` (tsc fehlerfrei)
- `npx eslint` auf geänderten Dateien (fehlerfrei)
- `npx ng build --configuration=development` (erfolgreich)
- `npx prettier --check` auf geänderten Dateien (fehlerfrei)

## 2026-09-10 – Claude Opus 5 (Anthropic) – Bildoptimierer: Ordner-Export und erhaltenes Aufnahmedatum

**Auftrag/Ergebnis:** Paket 2 der Bildoptimierer-Überarbeitung umgesetzt. Der
Export schreibt die Bilder jetzt direkt in einen gewählten Ordner statt in ein
ZIP, überschreibt dabei nie etwas, und die fertigen JPEG-Dateien tragen wieder
das Aufnahmedatum. Elf Commits auf `feat/image-optimizer-export`, abgezweigt
von `origin/master` (5ebd9bb).

**Warum kein ZIP mehr:** Der Nutzer musste nach jedem Export erst entpacken.
Ein Browser kann keinen Ordner herunterladen – genau deshalb gab es das Archiv.
`showDirectoryPicker` kann es, in Chrome und Edge; in Firefox, Safari und auf
Android entsteht weiterhin still das ZIP, der Unterschied fällt nur am Ergebnis
auf.

**Die Gefahr dabei, und wie sie geschlossen ist:** Die Verzeichnis-Schnittstelle
hat kein eigenes Netz. `getFileHandle(name, { create: true })` öffnet
stillschweigend eine vorhandene Datei, und `createWritable()` kürzt sie beim
Öffnen auf null Byte. Das automatische „(1)" beim Herunterladen kommt vom
Browser, der hier gar nicht beteiligt ist. Der Zählsuffix wird deshalb selbst
gebaut: `name`, `name (2)`, `name (3)`. Geprüft wird nur der obere Ordner – ist
dessen Name neu, sind alle Unterordner und Dateien darin zwangsläufig auch neu.
Ein Fehlschlag, der **nicht** eindeutig „nicht gefunden" heißt, wird
weitergereicht statt als „frei" geraten; sonst hätte eine verweigerte
Berechtigung den Export in einen vorhandenen Ordner schreiben lassen.

**Aufnahmedatum:** Der Export rendert über eine Zeichenfläche und verliert
dabei zwangsläufig jedes Metadatum. Aufnahme- und Erstelldatum werden hinterher
als minimales EXIF-Segment wieder hineingeschrieben – eigener Schreiber ohne
neue Abhängigkeit, wie schon bei `webp-metadata.ts` und `c2pa-detection.ts`.
Geschrieben werden genau drei Tags (`DateTime`, `DateTimeOriginal`,
`DateTimeDigitized`), nie Hersteller, Modell, Software, Urheber, Ort oder XMP.
Das Segment wird als **letzter** Schritt gesetzt, nach der
Größenkomprimierung – davor gesetzt würde `browser-image-compression` es
wegwerfen, und zwar ausgerechnet bei den großen Dateien, die niemand
nachkontrolliert.

**Eingeschränkte Aufhebung einer früheren Entscheidung:** Paket 2 vom
28.08.2026 hielt fest, Metadaten nur zu lesen und nie zu schreiben. Die
Begründung – Plattformen rechnen hochgeladene Bilder ohnehin neu durch – gilt
weiter für die hochgeladene Fassung, nicht für die Datei auf der eigenen
Festplatte. Genau darum geht es hier: das eigene Archiv nach Aufnahmezeit
sortierbar halten.

**Text im Metadatenfenster berichtigt:** Der bisherige Satz behauptete, die
Exportdateien enthielten weder EXIF noch XMP. Das stimmt nicht mehr. Der neue
Text nennt, dass das Datum bleibt, was entfernt wird – und weiterhin, dass ein
Farbprofil und ein technischer Dateikopf des Browsers erhalten bleiben. Ein
Datenschutzversprechen, das still zu viel verspricht, ist schlechter als keines.

**Betroffen:** `src/app/features/image-optimizer/services/` (neu:
`capture-date.ts`, `exif-writer.ts`, `free-folder-name.ts`,
`directory-export.service.ts`), dazu `image-export.service.ts`,
`metadata-reader.service.ts`, `models/image-metadata.ts`,
`image-optimizer.component.ts`, `export-bar` und `metadata-panel`.
`zip-export.service.ts` bleibt unverändert als Rückfall. Keine Datenbank-,
Abhängigkeits- oder Schemaänderung.

**Geprüft:** `npm run verify` erfolgreich (Exitcode 0, ohne Pipe gemessen):
1107 Node-, 180 DOM- und 601 Angular-Tests, dazu Format, Lint, Typen,
Workflow-Tests, Suite-Audit und Bau. Chunk `image-optimizer-component` von
85,45 kB auf 90,11 kB roh gewachsen (23,18 kB übertragen) – eigener Quelltext,
keine neue Abhängigkeit. Für die drei verhaltensbestimmenden Zusicherungen
wurde eigens nachgewiesen, dass die Tests greifen: Ohne den Fehlergrund-Filter
fallen drei Tests der Ordnersuche um, ohne den weitergereichten `capturedAt`
fällt der Exporttest um, und mit einem Abbruch, der in den ZIP-Zweig
durchfällt, fällt der Abbruchtest um. Jeder der sieben Tasks lief durch eine
eigene Prüfung, danach eine Abschlussprüfung über den ganzen Zweig; deren Funde
sind in `050ba28` behoben.

**Noch offen:** Die Probe im Browser mit echten Fotos steht aus und sollte vor
dem Merge von Hand erfolgen – insbesondere ein zweiter Export desselben
Artikels, bei dem der Zählsuffix greifen muss, und ein Blick in die
Windows-Eigenschaften einer Exportdatei: Aufnahmedatum vorhanden, Kameramodell
und Ort nicht.

---

## 2026-09-10 – Claude Opus 5 (Anthropic) – Bildoptimierer: Zuschnitt und Benennung umgesetzt

**Auftrag/Ergebnis:** Paket 1 der Bildoptimierer-Überarbeitung umgesetzt. Jede
Plattform startet jetzt mit dem größtmöglichen Ausschnitt ihres Formats aus dem
Vollbild, und die Exportdateien tragen eine durchgehende Nummer hinter einem
Namen, der nie leer ist. Fünf Commits auf `feat/image-optimizer-workspace`,
abgezweigt von `origin/master` (b202795).

**Ursache des zu kleinen Vinted-Rahmens:** `setCrop` in `services/crops.ts`
füllte jede noch leere Plattform per `deriveRect` aus dem Zuschnitt der
_aktiven_ Plattform. Bei einem 3:4-Handyfoto (3000 × 4000) ist eBay (1:1)
zuerst dran und belegt das volle Quadrat; Vinted (2:3) daraus abgeleitet bekam
2000 px Breite – 66,7 % – während direkt aus dem Vollbild 2666,67 px möglich
sind, also 88,9 %. Die fehlenden gut 22 Prozentpunkte verteilten sich
gleichmäßig auf beide Ränder, daher das beidseitige Nachziehen von Hand bei
jedem Foto.

**Lösung ohne neues Datenfeld:** Ob der Nutzer den Rahmen selbst gezogen hat,
wird aus den vorhandenen Daten abgelesen – ein Rahmen, der noch seinem eigenen
Maximum entspricht, wurde nicht angefasst (`isMaximum`, mit einem Pixel
Toleranz, weil der Cropper über die Anzeigegröße rechnet und rundet). Solange
das gilt, bekommen leere Plattformen ihr eigenes Maximum aus dem Vollbild;
sobald gezogen wurde, erben sie wie bisher aus dem aktiven Rahmen. Damit bleibt
der tragende Grundsatz erhalten: In keinem Export landet Bildinhalt, den der
Nutzer nicht gesehen hat. `OptimizerImage` ändert sich nicht.

**Benennung:** Das `-main` beim ersten Bild entfällt. Es unterbrach die
Zahlenkette am Ende des Namens, sodass das Durchblättern eines geöffneten
Ordners mit den Pfeiltasten ausgerechnet beim ersten Bild aus der Reihe fiel;
dass es das Hauptbild ist, sagt weiterhin das Abzeichen in der Oberfläche. Ohne
eingetippten Namen tritt ein Zeitstempel `JJJJ-MM-TT-hhmm` an dessen Stelle,
für Archiv und Dateien gleichermaßen – vorher hießen namenlose Exporte
`flipbase-bilder.zip` mit `01.jpg`, und eine aus dem Ordner gezogene Datei war
nicht mehr zuordenbar. Kein Doppelpunkt, den verbietet Windows in Dateinamen.
Die Zeit wird einmal je Export genommen und durchgereicht, damit ein Lauf über
einen Minutenwechsel hinweg nicht in zwei Namen zerfällt.

**Gelöschte Tests:** `describe('Dateinamen bilden')` in `file-name.spec.ts`
(drei Tests auf `01-main.jpg` und `flipbase-bilder.zip`) – sie hielten genau
das abgeschaffte Verhalten fest.

**Betroffen:** `src/app/features/image-optimizer/services/crops.ts`,
`file-name.ts`, `image-collection.ts`, `image-optimizer.component.ts` sowie die
zugehörigen Testdateien. Keine Datenbank-, Abhängigkeits- oder
Oberflächenänderung.

**Geprüft:** `npm run verify` erfolgreich (Exitcode 0, ohne Pipe gemessen):
1054 Node-, 167 DOM- und 570 Angular-Tests, Format, Lint, Typen,
Workflow-Tests, Suite-Audit und Bau. Chunk `image-optimizer-component`
unverändert bei 85,3 kB roh / 21,6 kB übertragen. Für den neuen Drehungstest
wurde eigens nachgewiesen, dass er greift: Setzt man `rotate()` auf das alte
`crops: {}` zurück, schlägt er fehl. Jeder der vier Tasks lief durch eine
eigene Prüfung, danach eine Abschlussprüfung über den ganzen Zweig; deren sechs
Funde – allesamt Kommentare, Testlücken und ein überflüssiger Null-Check – sind
in `b41ea33` behoben.

**Noch offen:** Die Probe im Browser mit einem echten Handyfoto steht aus und
sollte vor dem Merge von Hand erfolgen. Außerdem zur Entscheidung: Der Knopf
„Auf andere Plattformen übernehmen" (`applyCropToAll`) setzt einen unberührten
Vinted-Rahmen wieder auf die 2000 px zurück – die einzige Stelle, an der die
neue Regel nicht greift. Verhalten unverändert gegenüber vorher, aber
inzwischen inkonsequent.

---

## 2026-09-10 – Claude Opus 5 (Anthropic) – Bildoptimierer: Arbeitsfläche, Zuschnitt, Metadaten, Export geplant

**Auftrag/Ergebnis:** Sieben Änderungswünsche von Grischa am Bildoptimierer
aufgenommen und als Spezifikation abgelegt unter
`docs/superpowers/specs/2026-09-10-bildoptimierer-arbeitsflaeche-design.md`:
verschiebbarer Trenner mit Bildraster rechts, Bildsteuerelemente als Leiste auf
der Vorschau, maximaler Erstzuschnitt je Plattform, Metadaten im Modal mit
Erhalt der Datumsangaben, Export als echte Ordner statt ZIP, durchgehende
Nummerierung ohne `-main`, Exportvorschau und Plattformreiter zusammengelegt.
Kein Quelltext geändert.

**Technische Vorprüfung:** `ngx-image-cropper` bringt außer den Ziehgriffen
keine eigene Bedienoberfläche mit – eine Leiste auf dem Bild ist ohne Eingriff
in die Bibliothek baubar. Für verschiebbare Trenner existiert im Projekt noch
nichts; `two-column-layout` kennt nur drei feste Verhältnisse.

**Fehleranalyse (zu kleiner Vinted-Zuschnitt):** `setCrop()` in
`services/crops.ts` leitet jede noch leere Plattform per `deriveRect()` aus dem
Zuschnitt der _aktiven_ Plattform ab. Bei einem 3:4-Handyfoto ist eBay (1:1)
zuerst dran und belegt das volle Quadrat; Vinted (2:3) daraus abgeleitet
bekommt nur 66,7 % der Fotobreite, während direkt aus dem Vollbild 88,9 %
möglich wären. Die fehlenden gut 22 Prozentpunkte verteilen sich gleichmäßig
auf beide Ränder – daher das beidseitige Nachziehen von Hand.

**Entscheidung mit Tragweite:** Paket 2 (`2026-08-28`) hatte festgehalten,
Metadaten nur zu lesen und **nie** zu schreiben. Das wird eingeschränkt
aufgehoben: Aufnahme- und Erstelldatum werden nach dem Rendern wieder als
minimales EXIF-Segment in die Exportdatei geschrieben, damit das eigene Archiv
nach Datum sortierbar bleibt. Urheber, Gerät, Ort, Software und
Herkunftsnachweis bleiben ausgeschlossen. Der Block muss nach der
Größenkomprimierung gesetzt werden, sonst verwirft `browser-image-compression`
ihn wieder.

**Zweig:** Dieses Paket beginnt auf `feat/image-optimizer-workspace`, abgezweigt
von `origin/master` (b202795), in einem eigenen Arbeitsbaum unter
`.worktrees/image-optimizer-workspace`. Der Hauptarbeitsbaum stand auf dem
bereits vollständig gemergten `feat/deal-monitor-collection-and-ui` und trug
einen noch nicht eingecheckten Changelog-Eintrag einer parallel laufenden
Codex-Sitzung; beides blieb unberührt.

## 2026-09-10 – Codex – Konfigurationsproben der PR-Suite vollständig isolieren

**Fix:** Die Gegenproben des Playwright-Vertragstests überschrieben bisher vorübergehend die verfolgte PR-Konfiguration. Jede Probe erhält nun per `mkdtemp` einen eigenen, aufgelösten und geprüften Ordner mit Kopien beider Konfigurationen und des Testverzeichnisses. Der Temp-Bereich liegt unter `tmp/` außerhalb der echten Testauswahl; Cleanup entfernt ausschließlich die jeweilige eigene Probe. Auch der zusätzliche verschachtelte Smoke-Test arbeitet nur in seiner Kopie.

**Prüfung:** Neue Regression zuerst rot, danach sieben Vertragstests grün. Die Regression lädt gleichzeitig eine gültige Originalkonfiguration und eine ungültige Kopie und prüft unveränderten Originalinhalt und Änderungszeitpunkt. Workflowprüfung: 56 erfolgreich, vier bestehende Windows-Skips. Playwright listet unverändert exakt acht Verträge. Formatierung, ESLint und Diffprüfung erfolgreich. Keine Änderung an Anwendungscode, echten Playwright-Konfigurationen oder Smoke-Markierungen; kein Push oder PR.

## 2026-09-10 – Codex – Playwright-PR-Gate auf kritischen Browserkern reduziert

**Entscheidung:** Der nach Gemini-PR #49 geprüfte Vorschlag zur vollständigen
Entfernung von Playwright wurde nicht übernommen. Offizielle Playwright-Hinweise
zu Browserprüfungen, Sharding und Browserinstallation sowie die Repository-
Messungen zeigen, dass echte Prüfungen für Fokus, Popover-Layer, Diagramm-
Rendering, Bildpersistenz und berechnete Barrierefreiheit weiterhin einen eigenen
Wert haben. PR #49 war zuvor in den Einkaufs-Branch integriert worden.

**Umsetzung:** Der PR-Gate führt jetzt exakt acht `@pr-smoke`-Verträge in
Chromium aus, ohne Wiederholung und mit Abbruch nach dem ersten Fehler. Die
Chromium-Headless-Shell wird über `--with-deps --only-shell chromium`
installiert. WebKit läuft täglich und Firefox wöchentlich mit demselben Kern;
die vollständige Suite bleibt lokal verfügbar. Required Checks bleiben
fail-closed. Browser-Caches und ein demo-fähiger Produktionsbau wurden bewusst
nicht eingeführt.

**Prüfung:** Der Kern lief lokal 8/8 in 58 Sekunden. Der Workflow-
Vertrag lief mit normaler und CI-Umgebung grün (57 grüne Tests, vier erwartete
Windows-Skips); Actionlint, Prettier, ESLint und `git diff --check` waren grün.
Die Messung bezieht sich auf den Browserkern, nicht auf die gesamte CI, deren
Angular- und Datenbankprüfungen weiterhin mehrere Minuten benötigen. Der
Umsetzungsnachweis steht unter
`docs/superpowers/plans/2026-09-10-playwright-hybrid-umsetzung.md`.

## 2026-09-10 – Antigravity – CI-Workflow-Analyse und Playwright-Evaluierungsplan erstellt

**Analyse:** Umfassende Evaluierung der GitHub Actions Workflows (`ci.yml`, `quality-nightly.yml`, `test-benchmark.yml`) und CI-Skripte im Repository durchgeführt. Die Pipeline weist durch deterministische Change Detection, Content-Addressable PR Check Reuse (Tree-Hash-Verifikation) und Least-Privilege-Rechte einen sehr hohen Reifegrad auf. Größter Flaschenhals im PR-Gate ist der Job `browser-smoke`: Ungecachter Chromium-Download, Start des ressourcenintensiven Angular Dev-Servers (`ng serve`) auf 2-vCPU-Runnern und Test-Bloat (22 Playwright-Dateien für CSS-, Schrift-, Farb- und Badge-Prüfungen).

**Plan & Formular:** Detaillierten Evaluierungs- und Umsetzungsplan unter `docs/superpowers/plans/2026-09-10-playwright-evaluation-und-ci-optimierung.md` erstellt. Er stellt drei Optionen gegenüber (Option 1: Vollständiger Ausstieg aus Playwright mit Verlagerung relevanter Interaktionen in Vitest-jsdom-Tests; Option 2: Minimaler 1-Pfad-Smoke-Test auf Static Preview; Option 3: Technische Sanierung des Status Quo) und enthält ein Entscheidungsformular mit Aufgabenpaketen für die beauftragte Folge-KI.

---

## 2026-09-10 – Codex – Produkt-E2E an neuen Einkaufsvertrag angepasst

**Korrektur:** Der integrierte Produkt-Browsertest erwartete noch die entfernte
Auswahl zwischen Gesamt- und Einzelpreisen. Er prüft die Artikelpreise nun direkt
im aktuellen Standardablauf. Zwei Entwurfsabläufe erzeugen ihren Warenbetrag
ebenfalls über gespeicherte Artikelpreise statt über das entfernte
Warenbetragsfeld. Die Theme-Vorgabe wird vor dem ersten Anwendungsstart gesetzt,
damit Hell- und Dunkelvarianten unabhängig vom bereits initialisierten
Theme-Service bleiben.

**Prüfung:** Der Fehler wurde aus dem Browser-Smoke-Lauf von PR 48 reproduziert.
Die zehn betroffenen Produkt- und Entwurfsabläufe bestehen mit den
CI-Einstellungen und einem Worker. Formatierung und Lint sind grün. Der danach
gestartete vollständige Browserlauf wurde für die angeforderte Bewertung von PR
49 gestoppt und hatte zuvor weitere veraltete Selektoren in älteren
Playwright-Dateien sichtbar gemacht.

---

## 2026-09-10 – Codex – Einkaufserfassungs-E2E an Artikelpreise angepasst

**Korrektur:** Zwei E2E-Abläufe der Einkaufserfassung erzeugen ihren Warenbetrag
nun über einen hinzugefügten Artikel mit Stückpreis. Damit prüfen Kostenverwaltung,
Speichern, Zentrierung und Inline-Bearbeitung wieder den aktuellen artikelbasierten
Vertrag, ohne das Anwendungsverhalten zu verändern.

**Prüfung:** Die beiden betroffenen Playwright-Tests sowie anschließend die
vollständige `purchase-entry.spec.ts` mit neun erfolgreichen Abläufen wurden
ausgeführt. Prettier und ESLint wurden gezielt für die geänderte Testdatei und
diesen Eintrag geprüft. Kein Commit.

---

## 2026-09-10 – Codex – Verkäuferauswahlen vereinheitlicht

**Korrektur:** Die sichtbaren Auswahlen für Verkäuferart und Land im
Verkäuferdialog sowie der Typfilter der Verkäuferliste verwenden nun den
gemeinsamen Auswahlbaustein. Die Dialogfelder bleiben an ihre reaktiven
Formularfelder gebunden, die deutschen Ländernamen bleiben alphabetisch und der
Listenfilter nutzt die kompakte Filterdarstellung. Das Fachverhalten wurde nicht
geändert.

**Prüfung:** Die zwei fokussierten Angular-Testdateien prüfen mit insgesamt
zwölf Tests die Auswahlwerte, Formularübernahme, alphabetische Länderfolge,
genau einen Typfilter und Barrierefreiheit. Die gemeinsame Admin-UI-Prüfung
meldet für 68 Vorlagen keine Verstöße. Prettier und ESLint wurden gezielt für
die betroffenen Sellers-Dateien und diesen Eintrag ausgeführt. Kein Commit.

---

## 2026-09-10 – Codex – Integrationsregressionen im Einkauf behoben

**Ursache und Fix:** Die atomaren Status- und Tracking-RPCs liefern absichtlich
nur die Datenbankzeile zurück. Der lokale Einkaufsservice ersetzte damit zuvor
vollständig geladene Beziehungen und berechnete Angaben. Die lokale Übernahme
führt nun einen flachen Merge aus: Felder der bestätigten Tabellenzeile
überschreiben den alten Stand, fehlende beziehungsweise `undefined` Felder wie
Verkäufer, Zusatzkosten und Einkaufspositionen bleiben erhalten. Der Status-RPC
akzeptiert außerdem nach einem Wareneingang die Zustände `partially_received`
und `received`, wenn der unabhängige Ankunftsstatus noch fehlt; der direkte Weg
von Bestellt zu Angekommen bleibt unverändert.

**Prüfung:** Zwei neue Service-Regressionen prüfen die Teilantworten für
Workflow und Tracking. Der zugehörige pgTAP-Test prüft Teillieferung und
vollständigen Wareneingang ohne vorheriges `shipment_status = arrived`.
`purchase.service.spec.ts` besteht mit 39 Tests, der fokussierte pgTAP-Lauf mit
23 Prüfungen. ESLint und Prettier für die geänderten TypeScript-Dateien sind
grün. Die Migration wurde anschließend aus dem finalen deklarativen Schema neu
erzeugt und über einen vollständigen lokalen Datenbank-Reset geprüft.

---

## 2026-09-10 – Codex – Paketpreis-Präzision in Einkaufszeilen korrigiert

**Korrektur:** Stückpreise aus der stückzahlunabhängigen Paketpreisverteilung
akzeptieren nun bis zu 16 Nachkommastellen, während Positionssummen weiterhin
centgenau geprüft werden. Divisionsergebnisse wie 1 € / 7 Stück werden vor dem
Entwurf stabil auf 16 Stellen begrenzt; die centgenaue Positionssumme bleibt
dabei erhalten.

**Prüfung:** Regressionstest für die speicherbare 1-€-Verteilung auf sieben
Stück ergänzt und gezielt ausgeführt. ESLint und TypeScript-Typprüfung sind
ebenfalls erfolgreich; keine SQL-Dateien geändert.

---

## 2026-09-10 – Codex – Einkaufs- und Verkäuferumbau umgesetzt

**Verkäufer:** Die frühere Quellen-/Lieferantenverwaltung ist nutzerseitig eine
einheitliche Verkäuferverwaltung mit gemeinsamer Tabellenansicht und Filter für
Unternehmen beziehungsweise Privatpersonen. Verkäufer lassen sich direkt im
Auswahlfeld der Einkaufserfassung anlegen. Das Formular verwendet klare Namen,
eine alphabetische Länderauswahl sowie eine Telefonnummerneingabe mit Flagge,
Ländervorwahl und E.164-Speicherung. Profilverweise werden nicht mehr erfasst.

**Einkaufserfassung:** Plattform, Bezugsquelle, Inhaltsstatus, Angebotslink und
doppelte Notizfelder sind aus dem sichtbaren Ablauf entfernt. Artikel kommen aus
dem Artikelstamm oder werden über den wiederverwendbaren Produktdialog inklusive
optionalem Bild angelegt. Der Warenbetrag wird aus den Positionen berechnet. Ein
Paketpreis kann in einem Dialog gleichmäßig je Position und unabhängig von deren
Stückzahl verteilt werden; centgenaue Positionssummen bleiben auch dann erhalten,
wenn der rechnerische Stückdurchschnitt mehr Nachkommastellen benötigt.

**Status, Tracking und Chronik:** Der fachliche Status führt direkt von Entwurf
über Bestellt zu Angekommen. Tracking bleibt davon unabhängig und freiwillig.
Die Status-Badges unterscheiden sich farblich. Entwurfsänderungen, Bestellt,
Angekommen sowie hinzugefügtes, geändertes oder entferntes Tracking werden
atomar als Chronikereignisse gespeichert und nach einer Aktion sofort neu
geladen. Einkaufsdetails sprechen ebenfalls nur noch von Verkäufern und zeigen
keine alte Quelle oder Angebots-URL.

**Datenbank und Übergang:** Das deklarative Schema und die daraus erzeugte
Migration ergänzen Ländercode und Ankunftszeitpunkt sowie die neuen atomaren
Status- und Tracking-RPCs. Produktbilder verwenden das inzwischen auf `master`
vorhandene relationale Medienmodell. Das Prüfarchiv enthält keine Quellen mehr.
Technische Altspalten und die alte Quellentabelle bleiben vorerst ausschließlich als
interne Kompatibilität für die umfangreichen vorhandenen Kostenfunktionen; ihre
vollständige Entfernung benötigt eine getrennte Ablösung dieser Funktionen und
ist nicht mehr Teil der Oberfläche.

**Verbindlicher PR-Abschluss:** Nach einer fertigen, lokal geprüften Änderung
fragt der Assistent genau einmal, ob der PR jetzt erstellt und nach erfolgreichen
Pflichtprüfungen gemergt werden soll. Ein „Ja“ umfasst Push, PR, grünen
Merge-Commit und anschließendes Löschen von Feature-Zweig und Worktree. Für die
Integration gilt ausschließlich `origin/master`; alte bereits integrierte
Zweige sind nur noch kontrolliert aufzuräumen.

**Prüfung:** Lokalen Supabase-Stack vollständig zurückgesetzt und die erzeugte
Migration angewendet. Alle 39 SQL-Testdateien mit 1.417 Prüfungen sind grün.
`npm run verify` ist vollständig erfolgreich: Format, ESLint, Typen, 49
erfolgreiche Workflow-Tests bei vier plattformbedingt übersprungenen Fällen,
Suite-Audit, 1.041 Node-, 167 DOM-, 590 Angular- und 13 Landing-Prüfungen sowie
Produktionsbau. Zusätzlich bestehen neun Chromium-Abläufe der
Einkaufserfassung einschließlich Verkäuferanlage, Paketpreisverteilung,
Kostenverwaltung und Inline-Bearbeitung.

---

## 2026-09-10 – Codex – Einkaufs- und Verkäuferumbau vorbereitet

**Auftrag/Ergebnis:** Den abgestimmten Umbau der Einkaufserfassung um die
vollständige Entfernung des nutzerseitigen Konzepts „Quellen“ erweitert. Die
bisherige Seite „Quellen & Lieferanten“ soll zu „Verkäufer“ werden, ausschließlich
Unternehmen und Privatpersonen verwalten, die gemeinsame Shopify-nahe
Tabellenansicht verwenden und nach Verkäufertyp filterbar sein. Die vorhandene
Tabelle `suppliers` bleibt als passender interner Fachbegriff bestehen; das
eigenständige Quellenmodell und die Verknüpfung von Einkäufen zu Quellen sollen
entfallen.

**Vorbereitung und Prüfung:** Eigenen Worktree
`codex/purchase-entry-redesign` auf Merge-Stand von PR 39 angelegt und
Abhängigkeiten installiert. Der unveränderte Ausgangsstand ist mit 993 Node-,
138 DOM- und 511 Angular-Tests grün. `npm ci` meldet drei bereits vorhandene
Abhängigkeitswarnungen (zwei moderat, eine hoch); keine automatische
Paketaktualisierung vorgenommen. Fachlichen Entwurf und testgetriebenen
Umsetzungsplan dokumentiert; das optionale Produktbild ist dabei ausdrücklich
der gemeinsamen Produkterstellung zugeordnet. Noch keine Anwendungs-,
Datenbank- oder Geschäftsdaten geändert.

---

## 2026-09-09 – Codex – CI-Browserfehler an Einstieg und Dashboardbreiten beheben

**Ursache und Fix:** Fünf Fehler aus PR #47 lokal reproduziert. Drei Einstiegsprüfungen erwarteten noch den alten Inventarbutton und eine eigenständige Artikelform mit h1; sie prüfen jetzt den gemeinsamen Produktdialog einschließlich direkter Route, Escape und Fokusrückgabe. Der tatsächliche Seitenüberlauf kam von nicht umbrechenden Dashboard-Zeitraumbuttons beziehungsweise dem daneben erzwungenen Plattformfilter: rechts 349,6 px bei 320 px und 798,6 px bei 768 px. Zwei gezielte Flex-Wrap-Ergänzungen lassen die Bedienelemente bei Platzmangel umbrechen, ohne Inhalt zu verstecken. Apex-/Chartcode blieb unberührt.

**Prüfung:** Vorher fünf rot/acht grün; nach Fix alle 13 betroffenen Playwright-Fälle grün, einschließlich unveränderter AXE- und Seitenoverflow-Prüfungen. Zusätzliche Controlgeometrie sichert Zeitraum-/Plattformbedienung. Zehn Dashboard-Komponententests und Produktionsbau grün (742,34 kB), Format/Lint grün. Vollständiger Browserlauf und PR-Fortsetzung folgen beim Controller; keine Commits/Pushes/SQL durch den UI-Worker.

**Diagramm-Regression:** Der Importfehlertest erwartete den lokalen Prebundle-Dateinamen, während CI generierte Chunknamen lädt. Ohne Prebundle lokal rot reproduziert; die Sperre erkennt jetzt ausschließlich die Apex-Core-Klassendefinition einschließlich esbuild-Suffix und verlangt genau einen tatsächlich gesperrten Import. Fehleranzeige, zugängliche Daten und erfolgreicher Retry sind in beiden Cachemodi grün. Unabhängiges Review bestätigt anhand der SourceMap die Beschränkung auf die Apex-Core-Abhängigkeit; keine Produktionsänderung oder abgeschwächte Prüfung.

**Gesamt-Browsernachweis:** Alle 78 Playwright-Fälle ohne Paket-Prebundle in zwei Minuten erfolgreich; zusätzlich der Importfehler mit aktivem Prebundle grün. Geänderte Dateien format- und lintsauber, TypeScript-Prüfung grün. Unabhängiges UI-Review bestätigt unveränderte AXE-/Overflow-Grenzen. Korrekturen gehen in den regulären PR #47; dessen neue Pflichtprüfungen bleiben vor Abschluss abzuwarten.

**PR-Abnahme:** Implementierungsstand `ceca851` in regulärem PR #47 vollständig grün, GitHub-Lauf 34292837037: Quality, beide Angular-Blöcke, Node, DOM, Database, Browser smoke und Required checks erfolgreich. Der Browserjob besteht innerhalb des unveränderten Zeitlimits. Hauptplan abgenommen; kein Merge, Deployment, produktiver Reset oder Backfill. Abschließender Commit enthält nur diesen Nachweis und die Plan-Checkbox.

## 2026-09-09 – Codex – Produktbestand und sichere Migration integrieren

**Buchungsvertrag:** Offene Loskosten bleiben NULL und sind nicht verkaufbar. Teilzugänge verwenden persistente Request-IDs; ein Retry bucht nicht doppelt. Demo und Server verwenden finalisierte Lose, stabile Centpools und aktive Kosten nach Retouren. Neue Regressionen prüfen Teilzugang, Speicherrollback, 35-Euro-FIFO-Beispiel, Centreste, Retoure/Neuververkauf, Kopfpreis und Empfangsstatus. Vorhandene Produkt-IDs dürfen unabhängig vom historischen Typmarker im neuen Mengenweg weiterverwendet werden; echte alte Artikel- und Verkaufsreferenzen bleiben erhalten.

**Isolierte Prüfung:** GitHub-Lauf 34288392439: 38 Dateien, 1395 Datenbanktests grün. Der Generator ließ Storage-Policies und explizite Rollen-Revoke-Anweisungen aus; eine eng begrenzte, getestete Source-Generierung ergänzt diese vor Anwendung derselben Migration. Unabhängige Reviews korrigierten Policy-Namensbegrenzung und SQL-Statementgrenzen. Keine Testgates abgeschwächt, keine veröffentlichten Migrationen verändert. Kompatibilitäts- und echter Storage-API-Lauf folgen; keine produktiven Daten oder lokales Docker verwendet.

**Finale lokale Integration:** 197 Testdateien mit 1763 Anwendungstests grün; Produktionsbau 742,31 kB ohne Budgetänderung, ESLint und Suiteaudit grün. Workflowprüfungen 49 erfolgreich, vier bestehende POSIX-Fälle unter Windows ausgelassen. Finale DB-Migration aus Lauf 34289489760 unverändert übernommen: 1393 DB-Tests sowie tatsächlicher Storage-Upload/Verweigerung/Metadatenfehler/Einzelpfad-Rollback grün. Unabhängiger SQL-Abgleich bestätigt 14 Funktionsbodies und unveränderte Sicherheitsdefinitionen. UI-Re-Review schließt alle fünf Befunde; 17 Browserfälle plus visuelle Nachprüfung der vier echten Hell-/Dunkelansichten. Alte Testfixtures wurden um tatsächlich existierende Produkte/Einkäufe und Kostenabschluss ergänzt, statt die strengere Produktprüfung abzuschwächen.

**Entscheidungen:** Keine künstlichen Schattenlose für Altartikel. Nichtkanonische Altbildpfade ohne belegbare Artikelzuordnung bleiben bis zur Manifestprüfung gesperrt; Dateien und Metadaten bleiben erhalten. Produktive Überführung/Reset bleiben gesondert freizugeben. Regulärer Gesamt-PR folgt ohne Merge oder Deployment.

## 2026-09-09 – Codex – Produktdialog, Medien und kompakte Einkaufszeilen integrieren

**Umsetzung:** Gemeinsame Produktanlage für Katalog, Einkaufspicker, Inventarbutton und direkte Inventarroute; Produktstamm bleibt bei Bildfehlern erhalten und erzeugt keinen Bestand. Sichere Produktmedienpfade, enges Upload-Rollback, getrennter Demo-Medienspeicher, relationale Bildprojektion und zeitlich begrenzte Batch-Signaturen ergänzt. Kompakte Einkaufstabelle mit stabilen Zeilen-IDs, Details über Produktnamen, Iconaktionen und bestätigter CSV-Zuordnung; historische Produkt-IDs und kanonische GTINs werden akzeptiert, abweichende Zustände verlangen Zuordnung. Historische Artikelbearbeitung bleibt erhalten.

**Prüfung und Reviewfixes:** 263 betroffene Anwendungstests und 17 Browserfälle grün; App-/Spec-Typprüfung, ESLint, Prettier, Suiteaudit, Shared-Architekturprüfung und Produktionsbau grün (742,11 kB, keine Budgetänderung). AXE ohne deaktivierte Regeln, 1440×1000 und 390×844 jeweils hell/dunkel, Dialog/Select/Escape/Fokus, Bildpersistenz, CSV-Abbruch, Inventarroute ohne Bestand und Kamera-Verweigerung geprüft. Vier finale Zeilenscreens selbst angesehen. Rote Regressionen sichern Workspacewechsel, einstellige Namen, historische Zuordnung, Betragsüberlauf, render-sicheren Mediencache und begrenzten automatischen Bildretry ab. Erste Screens zeigten abgeschnittene Spalten und falsche Dunkelmodus-Vorbereitung; Layout und Testvorbereitung korrigiert, neue Geometrie-/Farbprüfungen grün. Unabhängiges finales Review und Gesamt-PR-Prüfung folgen unter Controllerverantwortung. Keine SQL-Ausführung, keine Commits/Pushes durch den UI-Worker.

## 2026-09-08 – Codex – Restlichen Produktumbau vollständig umsetzen

**Auftrag:** Nutzer verlangt ausdrücklich alle noch offenen Planpunkte und anschließend einen regulären PR. Bestehende eigene Änderungen fortführen; keine erneute bloße Zwischenstand-Übergabe. Die Testgrundlage in PR #46 dient weiter zur isolierten SQL-/Typprüfung. Veröffentlichung im Sinne von Commit/Push/PR ist jetzt beauftragt, Merge, Deployment und produktive Datenüberführung nicht. Kein Docker auf dem Arbeitslaptop. Fremde Diagnoseartefakte bleiben unverändert.

**Fortsetzung:** Zuerst verbleibende DOM-Testklassifikation des Apex-Renderers korrigieren, dann Produkt-/Kostenvertrag, Produktmedien, gemeinsame Erfassung und Buchungswege einschließlich Demo integrieren. Umsetzung mit abgegrenzten Agents und unabhängigen Reviews; Daten-/Referenzerhalt und volle Pflichtprüfungen vor PR-Abschluss.

## 2026-09-08 – Codex – Produkt- und UI-Plan umsetzen

**Auftrag:** Den freigegebenen Plan auf `codex/purchase-entry-design-review` beginnen: Lieferanten-Speicherfehler, einheitlicher Produktweg, kompakte Erfassung, Textbadges und Dashboard/ApexCharts. Getrennte Verantwortlichkeiten für SQL-Korrektur und lesende Verbraucheranalyse; Implementierungsaufgaben nacheinander mit unabhängigen Reviews. Keine Geschäftsdaten löschen, kein Docker auf dem Arbeitslaptop, keine Veröffentlichung ohne Auftrag.

**Ausgangsprüfung:** 1.693 Anwendungstests erfolgreich (1.002 Node, 136 DOM, 555 Angular). Bestehende Node-Warnung zur experimentellen Glob-API und drei Windows-bedingt übersprungene Orchestrator-Signaltests. Nutzer bestätigt interne Betriebsnutzung und Jahresumsatz einschließlich verbundener Unternehmen unter 2 Mio. USD; ApexCharts-Community-Voraussetzung damit geklärt. Umsetzung und Abschlussprüfungen laufen.

**Lieferantenfix und Badges:** `create_purchase` prüfte UUIDs versehentlich mit einer fehlenden Vierergruppe. Formatvalidierung gezielt korrigiert und neue Migration mechanisch aus der Funktion abgeleitet; veröffentlichte Migrationen unverändert. Positive/negative UUID-Regressionsprüfung und unabhängiges SQL-Review erfolgreich, neue Workspace-/Idempotenz-pgTAP-Prüfungen vorbereitet. Shared-Badge auf Text reduziert, dekorative Marker-/Uppercase-Eingänge samt Aufrufern entfernt; auch der projizierte GPS-Marker wurde nach Review entfernt, sein zugänglicher Standorttext bleibt erhalten. Chronik- und Diagrammlegendenpunkte unverändert.

**Dashboard:** ApexCharts 7.1.0 ersetzt Chart.js im bestehenden Shared-Diagramm; Kennzahlen, vier Reihen, Null-/Negativwerte und Zeitbereiche unverändert. Der zunächst geprüfte Angular-Wrapper wurde wegen unvollständiger Import-/Renderfehlerbehandlung durch einen kleinen typisierten Adapter ersetzt und entfernt. Shared-Legendenbuttons mit `aria-pressed`, Tastatur-/Touchdetails, sichtbare Datentabelle bei Diagrammfehlern und Wiederholen-Aktion. Normale Überschriften und kompakte Journalansicht, mobil einschließlich Wareneinsatz/Marge. Keine Budgeterhöhung und keine weiteren Paket-Upgrades. Apex-Lizenzvolltext ist im Produktionsartefakt enthalten. Gezielte 15 Node-, 34 Angular- und sieben Browserprüfungen grün; AXE hell/dunkel Desktop/Mobil ohne abgeschaltete Regeln. Integrierte Anwendungssuite mit 1.697 Tests grün; abschließendes Gesamt-ESLint und Produktionsbau erfolgreich. Visuelle Stichproben 1440 × 1100 und 390 × 844 geprüft, kein unbelegter Pixelgleichheitsanspruch.

**Artikelkern und Test-PR:** Verbraucherkarte und Datenübergangscheckliste erstellt. Noch keine Umschaltung auf den neuen Produktvertrag, kein Backfill und kein Datenreset. Der ausdrücklich genehmigte Draft-PR #46 arbeitet auf dem getrennten Zweig `codex/product-core-validation` ausschließlich mit wegwerfbarer GitHub-Datenbank, ohne Produktionszugang, Merge oder Deployment. Der erste Abgleich erzeugte Typen und deckte über den vorhandenen Sicherheitstest eine fehlende Ausnahme vom pauschalen Funktionsgrant im deklarativen Schema auf (1159/1160 DB-Tests erfolgreich). Die Korrektur wird dort erneut geprüft; fehlgeschlagene Artefakte sind keine Freigabe. Lieferantenfix und UI bleiben vom Test-PR getrennt und unveröffentlicht.

## 2026-09-08 – Codex – Verbindlichen Produkt- und UI-Umsetzungsplan vorbereiten

**Auftrag:** Aus den bestätigten Anforderungen einen ausführbaren Gesamtplan erstellen, bevor der Umbau beginnt. Interne Betriebsnutzung von Flipbase/ApexCharts ausdrücklich bestätigt. Hauptplan `docs/superpowers/plans/2026-09-08-unified-products-admin.md` mit drei Teilplänen für Lieferantenfix, Produktmodell/Erfassung und Dashboard/ApexCharts; gemeinsame Designspezifikation unter `docs/superpowers/specs/2026-09-08-unified-products-admin-design.md`.

**Referenz und Entscheidungen:** Shopify-Entwurf erneut bei 1440 × 1000 geprüft. Desktop zeigt Produkt/Bild, Lieferanten-SKU, Anzahl, Kosten mit Steuer und Gesamt; für Flipbase bewusst reduzierte Grundzeile mit Bild/Name, Menge, Stückpreis, Gesamt, Entfernen. Zusätzliche Produktdaten in Details, Suche und reine Import-/Scanner-Icons darunter. Suchauslöser gemessen (36 px Höhe, 13 px Schrift, 20 px Zeilenhöhe, 8 px Padding/Radius, ohne Rahmen). Native innere Mengenfeldhöhe nicht mit äußerer Feldgeometrie verwechseln. Keine Shopify-Daten geändert.

**Architektur und Grenzen:** Einheitlicher neuer Produkt-/Losbestand statt nur versteckter Altbuttons; getrennte Kostenherkunft und historische Referenzen erhalten. Aktuelle Sicherung, Zuordnungsbericht, Upgrade-/Frischschema-Tests und explizite Freigabe vor produktiver Datenüberführung. Kein Docker auf dem Laptop. ApexCharts 7.1.0/ng-apexcharts 3.1.0 lesend in npm verifiziert, Installation erst nach Klärung der zusätzlichen Community-Umsatzvoraussetzung. Keine Installation, Anwendungscodeänderung, Datenbankausführung oder Veröffentlichung in diesem Planungsschritt.

## 2026-09-08 – Codex – Einheitliches Produktmodell und ApexCharts recherchieren

**Analyse:** Offizielle Shopify-Dokumentation bestätigt Produkt/Variante → Inventarinformation → Bestandsmengen je Standort; Menge eins ist kein eigener Produkttyp. WooCommerce führt ebenfalls Mengen an Produkten beziehungsweise Varianten. Empfehlung für Flipbase: ein gemeinsames Produktmodell und ein Erfassungsweg mit beliebiger positiver Menge, nicht lediglich zwei umbenannte Altwege. Einkauf, Wareneingang, Kostenherkunft und Verkauf bleiben verknüpft; unterschiedliche Einkaufspreise desselben Produkts gehören in getrennte Zugänge, nicht in neue Produktarten. Individuelle Mängel/Zustände dürfen nicht versehentlich zusammengefasst werden. Bestehende `tracking_mode`-/`line_kind`-Verzweigungen sowie alternative Verkaufsreferenzen machen dies zu einem fachlichen Umbau, nicht nur zu einer Templateänderung. Unbekannter Mystery-Inhalt bleibt bis zur Identifikation ein eigener Erfassungszustand, keine erfundene Produktidentität.

**ApexCharts:** Chart.js ist derzeit installiert. ApexCharts bietet offizielle Angular-Integration und Zeitreihen-/Flächendiagramme; ein Wechsel ist eine mögliche Zielentscheidung, nicht automatisch eine Verbesserung ohne Designabgleich. Community-Lizenz laut Hersteller für Organisationen inklusive verbundener Unternehmen unter 2 Mio. USD Jahresumsatz; OEM-/Redistributionsbedingungen bei Drittanbieterplattformen separat prüfen. Gratisnutzung für Flipbase ohne Kenntnis von Nutzungsmodell und Organisation nicht bestätigt. Keine Abhängigkeiten installiert, keine Datenbank-/Anwendungscodeänderungen oder Veröffentlichung.

**Quellen:** [Shopify-Inventarmodell](https://shopify.dev/docs/apps/build/orders-fulfillment/inventory-management-apps/manage-quantities-states), [Shopify-Varianten](https://help.shopify.com/en/manual/products/variants), [WooCommerce-Varianten](https://woocommerce.com/document/variable-product/), [ApexCharts Angular](https://apexcharts.com/docs/angular-charts/), [Community-Lizenz](https://apexcharts.com/license/community/), [Lizenzübersicht](https://apexcharts.com/license/).

## 2026-09-08 – Codex – Artikelmaske, Lieferantenfehler und Dashboard analysieren

**Auftrag und Referenz:** Aktuellen Shopify-Admin angemeldet lesend geprüft: leeren und befüllten Einkaufsentwurf, Produktsuche, CSV-Importdialog und Scanner-Dialog. Keine Shopify-Daten verändert. Befüllte mobile Referenz zeigt Bild/Platzhalter, Bezeichnung, editierbare Kosten und Menge, Gesamt sowie die Suchzeile darunter mit reinen Import-/Scanner-Icons. Desktop-Abnahme und vollständige Zustandsmessung für den nächsten Umbau bleiben offen. Gewünschte Statusbadges künftig nur mit Text, ohne vorangestellte Marker; Markengelb und Shared-Komponenten bleiben verbindlich.

**Befunde:** `purchase-line-editor` enthält weiterhin separate Einzelstück-/Mengenartikel-Aktionen, Formular-Karten und eine obere Textbutton-Leiste. Die technische Bestandsführung unterscheidet weiterhin Einzelverfolgung und Mengenlose; eine gemeinsame Erfassung darf diese Fachentscheidung nicht stillschweigend aus der eingegebenen Menge ableiten. Dashboard und gemeinsamer Umsatzchart enthalten dekorative Versalschrift/gesperrte Überschriften und eine eigene Journal-Tabellenkomposition. Installiert und verwendet wird Chart.js 4.5.1, nicht ApexCharts. Kein Bibliothekswechsel vorgenommen.

**Speicherfehler:** In `create_purchase` erwartet die Lieferanten-ID-Prüfung fälschlich das Muster 8-4-4-12 statt 8-4-4-4-12. Eine gültige UUID aus dem Testbestand wird nachweislich abgelehnt. Das unverändert übernommene Muster stammt aus Commit `e5cef4a7` und steht auch in der jüngsten veröffentlichten Funktionsmigration. `update_purchase_draft` besitzt das korrekte Muster; der neue Chroniktest legt ohne Lieferant an und setzt ihn erst beim Update, wodurch dieser Fall nicht abgedeckt war. Korrektur benötigt eine neue Migration und einen expliziten Neuanlage-Test mit gültigem Lieferanten desselben Workspaces sowie Gegenproben für fremde/ungültige IDs. Kein Produktionszugriff und keine SQL-Ausführung; kein Docker. In diesem Analyseschritt nur Dokumentation, keine Anwendungscodeänderung oder Veröffentlichung.

## 2026-09-08 – Codex – Isolierten Artikelkern-Test-PR vorbereiten

**Freigabe:** Nutzer erlaubt ausdrücklich einen separaten GitHub-Test-PR ohne Merge/Deployment. Eigener Zweig `codex/product-core-validation`, Basis `3b545c2`; die laufenden UI-/Lieferantenänderungen bleiben getrennt. Kein Docker und keine Datenbank auf dem Arbeitslaptop.

**Umsetzung:** Zusätzlicher ausschließlich für diesen gleichnamigen Same-Repository-PR aktiver CI-Workflow erzeugt aus den deklarativen Schema-Dateien eine Migrationsvorschau und in einem wegwerfbaren GitHub-Runner Datenbanktypen. SQL-Vorschau, Typen, tatsächlicher Quellcommit und CLI-Version werden sieben Tage als Review-Artefakt aufbewahrt. Kein Produktionszugang, keine Geheimnisse, kein automatischer Commit, Merge oder Deployment. Die normalen PR-Pflichtprüfungen bleiben unverändert. Dies ist zunächst die technische Prüfgrundlage, noch keine Umstellung des Artikelmodells.

**Prüfung:** Zwei lokale Workflow-Vertragsprüfungen zunächst rot (Workflow fehlt), danach grün. Die tatsächliche Schema-/Typgenerierung und pgTAP-Laufprüfung finden erst nach Push in CI statt. Erzeugte SQL-Dateien werden nicht ungeprüft als Produktionsmigration übernommen; Rechte, Datenüberführung und unbekannte Kosten benötigen weiter fachliches Review.

**Erster CI-Befund:** Lauf `34279272450` erzeugte erfolgreich SQL und Typen; 1159 von 1160 Datenbanktests bestanden. Der bestehende Snapshot-ACL-Test verhinderte die Übernahme zweier ungewollter Funktionsfreigaben. Ursache: Der spätere pauschale Funktionsgrant im deklarativen Schema überschrieb den früheren Snapshot-Revoke. Die zentrale Ausnahmeliste erhält denselben Rechteentzug wie die bereits veröffentlichte Auditmigration. Keine Generatoränderung und keine Abschwächung des Sicherheitstests. Der Entwurf bleibt bis zur vollständigen erzeugten Kernmigration, Typen und grünen Pflichtprüfung unveröffentlichbar; insbesondere wird die Schema-/Migrationsprüfung nicht umgangen.

## 2026-09-08 – Codex – Entwurfsbearbeitung und Chronik veröffentlichen

**Auftrag:** Den freigegebenen Stand auf `codex/purchase-draft-chronology` einschließlich SQL-Migration committen, pushen und nach erfolgreichen Pflichtprüfungen über einen PR mit Merge-Commit nach `master` übernehmen. Anwendungstests und Bau vor Veröffentlichung erneut prüfen. Datenbanktests ausschließlich in CI, kein Docker und keine lokale Datenbankeinrichtung auf dem Arbeitslaptop. Lokale Diagnoseartefakte bleiben außerhalb des Commits; keine Geschäftsdaten löschen.

## 2026-09-08 – Codex – Serverseitige Entwurfschronik freigegeben

**Freigabe:** Der Nutzer erlaubt für diese Aufgabe ausdrücklich Supabase-Funktionen und Migrationen als Ausnahme von der Frontend-Grenze. Erstellung und fachliche Änderungen sollen transaktional protokolliert werden; keine rückwirkend erfundenen Ereignisse und kein Datenreset.

**Arbeitslaptop:** Nach ausdrücklicher Korrektur des Nutzers keine weitere Docker-Nutzung, keine lokale Datenbankeinrichtung. Docker Desktop war zuvor gestartet worden; keine Flipbase-Testdatenbank angelegt und keine Arbeitscontainer absichtlich verändert oder gestoppt. Die installierte Supabase-CLI 2.114.0 stürzt bereits beim Versionsaufruf unter Windows ab. Migration daher nach Nutzerfreigabe ohne lokalen Datenbankabgleich aus den betroffenen deklarativen SQL-Definitionen ableiten; statische Prüfung und ausführbare Anwendungstests durchführen. pgTAP-/Transaktions-/Berechtigungstests bleiben vorbereitet, aber hier nicht ausgeführt. Keine Produktionsänderung und keine Veröffentlichung in diesem Schritt.

**Umsetzung:** `create_purchase` schreibt nach erfolgreicher Anlage `purchase_draft_created`; idempotente Wiederholungen bleiben ohne zweiten Eintrag. `update_purchase_draft` vergleicht fachliche Vorher-/Nachher-Snapshots und schreibt nur bei Abweichung `purchase_draft_updated`. Interner Invoker-Helfer ohne Clientrechte normalisiert Positionen, Kosten und Direktzuordnungen ohne zufällige Zeilen-IDs/Zeitstempel. Bestehende RPC-Signaturen, Autorisierung, Locks und Journalrechte bleiben unverändert. Migration `20260908192408_purchase_draft_audit.sql` enthält die drei vollständigen Definitionen und deren explizite Rechte, mechanisch aus dem deklarativen Schema übernommen und gegen dieses geprüft. Keine Tabellen-/Datenlöschung, kein Backfill. Generierte Clienttypen bleiben unverändert; keine manuelle Typ-Erweiterung und keine DB-basierte Neugenerierung auf diesem Rechner.

**Anzeige und Prüfung:** Deutsche Ereignislabels und gemeinsame Detaildarstellung für tatsächliche Fachwerte ergänzt. Das Review erkannte falsche Identitätszuordnung bei umsortierten Snapshot-Arrays; unveränderte Einträge werden nun mengengetreu abgeglichen, übrige Vorher-/Nachherwerte getrennt dargestellt. Korrektur mit Regressionstests und erneutem Read-only-Review bestätigt. 155 Angular-Tests, Build, Typprüfung, ESLint und Formatierung erfolgreich. Sieben Migrations-/Paketierungsprüfungen bestanden, zwei plattformspezifische Deploymentprüfungen übersprungen. SQL statisch geprüft, neue pgTAP-Datei vorbereitet, aber kein SQL gegen eine Datenbank ausgeführt. Kein Commit/Push/Merge/Deployment.

## 2026-09-08 – Codex – Entwürfe unmittelbar bearbeiten

**Auftrag:** Auf `codex/purchase-draft-chronology` gespeicherte Entwürfe direkt in der gemeinsamen Erfassungsmaske öffnen; explizites Speichern/Verwerfen, Shared-Komponenten und Abschlusssperren erhalten. Zwei Agents bearbeiten Detailablauf und Formular-/Positionsreset, ein weiterer prüft unabhängig. Keine Geschäftsdaten löschen und keine Veröffentlichung ohne Folgeauftrag.

**Chronik und Grenze:** `create_purchase` und `update_purchase_draft` im deklarativen Schema schreiben keine Erstellung-/Entwurfsänderungsereignisse; `list_record_timeline` liest nur vorhandene Ereignisse und Kommentare. Das konkrete Produktionsschema wurde nicht abgefragt. Gemäß verbindlicher Frontend-Grenze keine Backend-Änderung und kein künstlicher Frontend-Ersatz. Detailliertes Issue und Ticket liegen unter `C:\Users\gt\Desktop\Backend Issues\purchase-draft-chronology\01-einkaufsentwurf-chronik*.md`. Echte Ereignisse erhalten eine sichtbare Uhrzeit; Speichern erneuert die Chronik ohne Verlust eines ungesendeten Kommentars. Der vollständige Erstellung-/Änderungsnachweis bleibt bis zur Backend-Erweiterung offen.

**Zusätzlicher Preisfehler:** Die visuelle Positionsprüfung deckte auf, dass `NumberInput` sein Änderungsereignis vor der Aktualisierung des Reactive-Forms-Werts auslöste. Die Positionsberechnung las dadurch den alten Preis. Minimal im Shared-Baustein korrigiert (Formularwert vor Ereignis), ohne den Komponentenvertrag zu ersetzen. Regression zunächst rot und anschließend grün: Menge 3 × Stückpreis 12 ergibt sofort 36, auch ohne Blur; Neuanlage und gespeicherter Entwurf behalten diese Werte nach Speichern und erneutem Öffnen. Abschließend 137 Angular-Tests, Typprüfung, Formatierung, ESLint, Produktionsbau und die betroffenen Browserabläufe erneut erfolgreich. Desktop 1440 × 900 und Mobil 390 × 844 mit befüllten Positionen geprüft, keine Laufzeitfehler oder horizontalen Überläufe.

**Prüfung:** Gezielte Regressionstests zunächst rot für fehlende direkte Bearbeitung, Reset, Uhrzeit und Chronikaktualisierung. 130 Angular-Tests im Integrationslauf erfolgreich, anschließend die um den Nachladefehler ergänzte Detail-Suite mit 14 Tests erneut erfolgreich. Außerdem 38 Logik-/DOM-Tests, vier Architekturtests, 24 unterschiedliche Browserabläufe (zuletzt 15 betroffene Abläufe wiederholt), Typprüfung, ESLint, Formatierung und erneuter Produktionsbau erfolgreich. Das unabhängige Review fand zwei Nachladefehler: Eingaben während des Nachladens und Rücksetzen auf alte Werte bei Ladefehler. Beide korrigiert und nachgeprüft; bei fehlgeschlagenem Nachladen bleibt die Form gesperrt mit Wiederholen-Aktion, aber Navigation wird nach bereits erfolgreichem Speichern nicht blockiert. Browser-Plugin mit eigenem Browser-Skill nicht verfügbar; vorhandenen Playwright-Ablauf verwendet. Desktop/Mobil in lokaler Demo geprüft, keine Laufzeitfehler; Screenshots außerhalb des Repositorys. Keine Aussage über rechtliche Konformität der Chronik. Kein Commit, Push, Merge oder Datenreset.

## 2026-09-08 – Codex – Direkt bearbeitbare Entwürfe und Chronik klären

**Analyse:** Nutzer möchte gespeicherte Einkaufsentwürfe unmittelbar in derselben editierbaren Positionsmaske wie die Neuanlage öffnen, ohne separate Detailtabelle, Spaltenanpassung oder „Artikel bearbeiten“. Code bestätigt die bisherige Trennung über `isEditing()`. Die Chronik liest im Echtbetrieb persistierte Ereignisse über `list_record_timeline`; im Demo-Modus derzeit ausschließlich Kommentare. Warum beim konkreten echten Einkauf der Erstellungseintrag fehlt, ist ohne Prüfung des betroffenen Datensatzes noch nicht belegt. Vorschlag: Entwürfe direkt editierbar, Abschlusssperren erhalten, explizites Speichern/Verwerfen; Erstellung und gespeicherte Änderungen zuverlässig serverseitig protokollieren. Keine erfundenen rückwirkenden Auditereignisse. Eine sichtbare Chronik allein belegt keine GoBD-Konformität. Nur Analyse, keine Anwendungscode- oder Datenänderung.

## 2026-09-08 – Codex – UI-Korrekturen zur Veröffentlichung vorbereiten

**Auftrag:** Die freigegebenen Dialog-, Button-, Chronik- und Kopfzeilenkorrekturen auf `codex/purchase-ui-polish` committen, pushen und über einen grünen PR mit Merge-Commit nach `master` übernehmen. Betroffene Prüfungen vor dem Push erneut ausführen. `debug.log` und lokale Diagnose-Testartefakte bleiben außerhalb des Commits. Keine Daten- oder Schemaänderung.

## 2026-09-08 – Codex – Einkaufsdialog und Aktionsdichte korrigieren

**Auftrag:** Abgeschnittenes Kosten-Dropdown, uneinheitliche Kopfaktionen, nicht zentrierte Nummer/Status/Zurück-Zeile und zu große Chronik korrigieren. Den ausdrücklich nicht mehr gewünschten Altbestands-Reparaturablauf aus der Einkaufsoberfläche entfernen, ohne Geschäftsdaten oder Schema zu löschen. Arbeit auf `codex/purchase-ui-polish`; lokale `debug.log` bleibt unangetastet.

**Ursache und Umsetzung:** Das absolut positionierte Select-Menü wurde vom scrollenden Modal-Inhalt abgeschnitten; `z-index` konnte diese Grenze nicht überwinden. Die Shared-Auswahl verwendet auf unterstützten Browsern die native Popover-Ebene, bleibt dabei im Dialog-DOM und behält Fokus- und Tastaturverhalten. Neue Browserprüfungen kontrollieren echte Treffbarkeit über dem Footer, Auswahl, Escape, erneutes Öffnen und kleine Fenster statt nur DOM-Sichtbarkeit. Zwei Agents korrigierten gemeinsame Button-/Chronikdichte und Kopfaktionen/Altbestandsbereinigung. Desktop-Standardbuttons messen 28 px, Touchziele mindestens 44 px, der Chronik-Composer 102 statt 138 px. Prüfbeleg verwendet die Shared-Komponente als semantischen Link. Titel, Badge und Zurück-Aktion sind innerhalb eines Pixels zentriert; die Primäraktion steht rechts. Der Badge nutzt bei fehlendem technischem Status denselben Entwurfsstandard wie die Lifecycle-Aktionen. Vier verwaiste Reparatur-UI-/Testdateien entfernt (über Git wiederherstellbar), Datenbankfunktionen und Geschäftsdaten bleiben unverändert.

**Prüfung:** 156 Angular-Tests, 29 Browserabläufe und vier Architekturtests erfolgreich. Formatierung, ESLint und Typprüfung erfolgreich; abschließender Build geprüft. Visuelle Stichproben auf localhost:4200 in Chromium bei 1440 × 900 und 390 × 844, zusätzliche Geometrieprüfung bei 390 × 600 und Touchprüfung. Keine Konsolen-/Laufzeitfehler in der visuellen Abnahme. Browser-Plugin mit eigenem Browser-Skill nicht verfügbar; vorhandener Playwright-Ablauf verwendet. Screenshots liegen außerhalb des Repositorys im Aufgaben-Artefaktordner. AXE wartet auf abgeschlossene endliche Einblendanimationen; der Modal-Abbruchtest wartet auf Dialogentfernung und Fokus-Rückgabe, bevor er in den zuvor gesperrten Hintergrund schreibt. Keine künstlichen Wartezeiten und keine unterdrückten AXE-Regeln. Safari/Firefox und alte Browser ohne Popover-Unterstützung nicht visuell geprüft. Noch nicht veröffentlicht.

## 2026-09-07 – Codex – Einkaufsumbau zur Veröffentlichung vorbereiten

**Auftrag:** Den freigegebenen Einkaufsumbau committen, auf GitHub pushen und nach erfolgreichen PR-Prüfungen mit Merge-Commit nach `master` übernehmen. Vor dem Push werden betroffene Tests, Formatierung, Lint und Build erneut geprüft; die vollständige Integrationsprüfung erfolgt im PR. Die lokale `debug.log` gehört nicht zur Veröffentlichung. Keine Datenlöschung oder Schemaänderung.

## 2026-09-07 – Codex – Gemeinsamen Einkaufsarbeitsbereich umsetzen

**Auftrag und Abgrenzung:** Nach ausdrücklicher Freigabe beginnt der Umbau auf `codex/purchase-unified-workspace`. Drei Agents übernehmen Kostenkomposition, Erfassungsformular sowie gemeinsame Aktionen und Regressionstests; die Hauptsitzung integriert die Detailseite. Kein Datenreset, keine Schemaänderung und keine Löschung von Geschäftsdaten. Die bereits gesicherten Angaben bleiben erhalten.

**Umsetzung:** Erstellen, Ansicht und Inline-Bearbeitung verwenden denselben zentrierten Seitenrahmen und dieselbe Zweispalten-Komposition. Die Chronik bleibt links unter den Positionen. Primäraktionen verwenden ausschließlich den gelben Shared-Button. Die Kostenverwaltung erhält einen gemeinsamen Dialog mit vorläufigen Anpassungszeilen und ausdrücklichem Speichern/Verwerfen; Rabatt bleibt fachlich getrennt von Zusatzkosten. Inhaltskenntnis und Preisführung bleiben unabhängig, keine sichtbare Einkaufsart. Bestehende technische Typwerte und Abschlusssperren bleiben erhalten. Die Kostenprüfung für vorhandene Altdaten bleibt bei Bedarf über einen kompakten Aufklappbereich erreichbar statt als allgemeines Banner für jeden Entwurf.

**Prüfung:** 127 Angular-Tests, 40 Logik-/Service-Tests, vier Architekturtests und 25 Browserabläufe bestanden. Build, Typprüfung, ESLint, Formatierung und Diff-Prüfung erfolgreich. Browserprüfungen umfassen gemeinsame Seitengeometrie, Speichern/Verwerfen, Rabatt nach erneutem Öffnen, direkte Einkaufslinks, Chronik, feste Sidebar, mobile Erfassungsseiten und automatisierte WCAG-AA-Prüfung. Die Shared-UI-Prüfung meldet für 67 Admin-Vorlagen keine Verstöße und verhindert zusätzlich sichtbare native Standardfelder im gemeinsamen Einkaufsarbeitsbereich. Visuelle Referenzprüfung auf die tatsächlich untersuchten Zustände begrenzt, keine vollständige Pixelgleichheit behauptet. Noch keine Veröffentlichung und keine Geschäftsdaten gelöscht.

## 2026-09-07 – Codex – Einkaufs-Neuaufbau geprüft und Angaben zur Neueingabe gesichert

**Entscheidungen:** Gemeinsame Einkaufsseite für Erstellen, Ansicht und Bearbeiten vorbereiten; Primäraktionen gelb und wiederkehrende Elemente über Shared-Komponenten. Die bewusste Abschaffung der sichtbaren Einkaufsart anhand von Commit `120a469` und dem Workflow-Plan bestätigt: Inhaltskenntnis und Preisführung bleiben unabhängig. Die vorherige Einordnung der fehlenden Typauswahl als Defekt war falsch. Der Nutzer bewertet die sporadisch gepflegten Daten als disponiblen Testbestand und stimmt einem späteren Neustart nach Sicherung zu.

**Analyse und Sicherung:** Drei Agents prüften Komponenten, Fachabläufe, Datenabhängigkeiten und Exportlücken. Der identifizierte Server-Workspace wurde lesend in einem konsistenten Datenbanksnapshot exportiert: 10 Einkäufe, 14 Bestandsartikel, 4 Verkäufe, 3 Rechnungen, zugehörige Positionen, Kosten, Stammdaten, Kommentare und Ereignisse. JSON, lesbare Vorlage zur Neueingabe und das eine zugeordnete Artikelfoto liegen außerhalb des Repositorys im Aufgaben-Artefaktordner. Diese Referenzsicherung ersetzt keinen vollständigen Betriebsrestore. Keine Daten gelöscht, keine Backend- oder Anwendungscodeänderungen. Vor einer späteren Löschung sind aktueller Datenstand, technische Sicherung und konkrete Zielmenge erneut zu prüfen; Konten, Einstellungen und fremde Daten sind nicht pauschal Teil des Neustarts.

## 2026-09-07 – Codex – Einkaufsseite, feste Sidebar und Chronik vereinheitlicht

**Auftrag/Ergebnis:** Die Einkaufserfassung besitzt keine untere Aktionsleiste mehr. „Entwurf speichern“ steht als gemeinsamer Button oben rechts neben der Seitenüberschrift; der vorhandene Zurück-Pfeil übernimmt das Verlassen der Seite. Die mobile Kopfzeile verteilt Überschrift, Aktion und Untertitel ohne den zuvor abgeschnittenen Text. Die Bearbeitung eines vorhandenen Einkaufs öffnet nicht länger einen anders proportionierten Dialog, sondern dieselbe breite Arbeitsseite wie die Neuanlage. Nach dem Speichern wird der Datensatz neu geladen.

**Layout und gemeinsame Bausteine:** Die Desktop-Sidebar ist fest an den Viewport gebunden; nur ihre Navigation scrollt intern, während der Seiteninhalt unabhängig läuft. Die gemeinsame Chronik für Einkäufe und Verkäufe liegt nun unterhalb des vollständigen zweispaltigen Arbeitsbereichs. Ihr Shopify-naher Aufbau trennt Überschrift, Kommentar-Composer, Sichtbarkeitshinweis, Kommentar-Karten und Systemereignisse. Aktionen verwenden den vorhandenen Shared-Button; nicht unterstützte Anhangs- oder Erwähnungsfunktionen wurden nicht vorgetäuscht.

**Prüfung:** Die neuen Browser-Verträge wurden zunächst gegen den alten Stand rot ausgeführt: untere Speicheraktion, mitscrollende Sidebar, Chronik innerhalb der linken Spalte und Bearbeitungsdialog. Nach der Umsetzung bestanden 52 gezielte Angular-Tests und alle 11 betroffenen Einkaufs-/Sidebar-Browserabläufe. TypeScript-Prüfung, gezieltes ESLint, gemeinsame UI-Architekturprüfung und Produktionsbau waren erfolgreich. Die mobile Neu- und Bearbeitungserfassung sowie die Chronik wurden in der lokalen Demo visuell geprüft. Keine Backend- oder Datenbankänderung.

**Abschlussprüfung:** Die parallele Gesamtsuite deckte eine verbleibende Zeitabhängigkeit im Windows-Prozessbaumtest auf: Nach dem erfolgreichen Beenden konnte ein bereits gestarteter asynchroner Heartbeat-Schreibvorgang noch abschließen. Der Test wartet nun zunächst auf eine kurze stabile Dateiphase und prüft erst danach erneut auf weitere Änderungen; ein tatsächlich weiterlaufender 25-ms-Heartbeat besteht diese Prüfung weiterhin nicht. Die produktive Runner-Logik blieb unverändert. Danach bestand die parallele Gesamtsuite mit 995 Node-, 138 DOM- und 516 Angular-Tests.

## 2026-09-07 – Codex – Einkaufsübersicht und Erfassung nachgeschärft

**Auftrag/Ergebnis:** Die Bezeichnung steht in einer eigenen Tabellenspalte und wird nicht mehr unter der Einkaufsnummer wiederholt. Einkaufsnummern erhalten in der Darstellung ein führendes `#`; fehlt eine Nummer, erscheint ein neutraler Strich statt eines Titel-Duplikats. Die Spalten „Erfassung“ sowie die alte Bestandsdarstellung wurden entfernt und durch „Erhalten“ mit Mengenstand und aufklappbarer Positionsvorschau ersetzt. „Gesamtkosten“ heißt in der Tabelle jetzt „Gesamt“ und ist einschließlich Beträgen rechtsbündig. Der Verkäuferfilter ist breiter.

**Gemeinsame Bausteine:** Der vorhandene Shared-Button unterstützt jetzt zugängliche reine Icon-Buttons sowie die ARIA-Zustände für aufklappbare Inhalte. Die Kostenkarte verwendet diesen Baustein für das Stift-Icon. Die Positionsvorschau kombiniert ausschließlich gemeinsame Button- und Badge-Bausteine; der gemeinsame Toolbar-Select respektiert nun die vom Aufrufer vorgegebene Breite.

**Erfassungsseite und Prüfung:** Kopfzeile, Zurück-Pfeil und zweispaltiger Inhalt verwenden dieselbe Inhaltsbreite. Gezielte Angular-, Darstellungs- und Node-Tests sowie Produktionsbau erfolgreich; die lokale Demo bei Desktopbreite visuell gegen die geöffnete Shopify-Referenz kontrolliert. Keine Backend- oder Datenbankänderung.

**PR-Nachprüfung:** Der Browser-Smoke von PR #41 fand zwei veraltete Selektoren, die noch den entfernten Text „Bearbeiten“ beziehungsweise die früher unter der Einkaufsnummer stehende Bezeichnung erwarteten. Die Tests verwenden jetzt den zugänglichen Namen des Icon-Buttons und die eigene Bezeichnungszelle. Dabei wurde außerdem die Dialogbreite separat auf den vorhandenen 5xl-Container begrenzt, ohne die breite Erfassungsseite erneut einzuengen. Alle sieben Einkaufs-E2E-Abläufe und der Produktionsbau waren anschließend lokal erfolgreich.

## 2026-09-07 – Codex – Gemeinsame Shopify-nahe Tabellenbausteine umgesetzt

**Auftrag/Ergebnis:** Neun Nutzer-Screenshots und konkrete Nacharbeiten gegen Einkaufstabelle, Spaltenpräferenzen, Badge-Baustein und Nummernvorschau geprüft. Neuer Plan `docs/superpowers/plans/2026-09-07-admin-table-consistency.md`: rahmenlose Ansichts-/Suchbedienung, bedingtes Rücksetzicon, Entfernung von Kostenstatus/Aktionen, gemeinsame Badges und anschließende Übertragung auf weitere Tabellen. Fachbezeichnung „Einkauf“ anschließend bestätigt. Wiederkehrende sichtbare Grundelemente müssen verbindlich über bestehende oder erweiterte Shared-Komponenten laufen; ein neues Paket 0 inventarisiert Abweichungen, legt den Komponenten-Katalog fest und plant eine automatische Prüfung gegen neue lokale Select-/Statusnachbauten. Empfehlungen für Erhalten-Vorschau und konfigurierbares `#` ausdrücklich von festen Vorgaben getrennt. Ältere Textlink-Vorgabe in der Einkaufsabnahme als überholt markiert.

**Referenz:** Nach Nutzeranmeldung aktuelle Shopify-Einkaufsliste einschließlich Ansichtsmenü, Anzeigeoptionen, Suchmodus und Lieferungsvorschau geöffnet. DOM und offene Badge-Shadow-Root gemessen: Toolbar 44 px, Ansichtsbutton 24 px, aktive Suchfläche 28 px mit 2-px-Fokusrahmen, Statusbadge 20 px/8 px Radius. Grenzen für Hover, weitere Töne und vollständige Interaktionsabnahme dokumentiert. Keine gespeicherten Shopify-Daten oder Ansichten verändert.

**Einordnung der vorigen Recherche:** Git-Stand und zugängliche Aufgabenliste wurden geprüft; der gesuchte Gesprächsverlauf um 01:00 war nicht auffindbar. Daraus lässt sich weder das Ende der Diskussion noch das Fehlen weiterer Nacharbeiten ableiten. Die vorherige definitive Behauptung war nicht belegt. Die drei per Commit-Abstammung ungemergten Fix-Branches wurden nicht auf inhaltsgleiche Übernahme geprüft und sind damit kein verlässlicher offener Arbeitsbestand.

**Umsetzung:** Gemeinsame `table-toolbar`-Komposition ergänzt und die bestehenden Such- und Select-Komponenten um eine rahmenlose Toolbar-Variante erweitert. Die Einkaufsübersicht verwendet diese Bausteine jetzt für Ansicht, Suche und Verkäuferfilter. Kostenstatus und Aktionsspalte wurden aus Konfiguration und Template entfernt; alte gespeicherte Spalten werden automatisch bereinigt. Der Tabellenklick öffnet weiterhin den Einkauf. Die gemeinsame Badge-Komponente unterstützt nun den quadratischen Shopify-Statusmarker; die zentrale Einkaufsdarstellung liefert dazu den semantischen Farbton. Das Rücksetzicon im gemeinsamen Spaltenmenü erscheint nur bei geänderter Sortierung, Reihenfolge oder Sichtbarkeit und setzt keine Suchfilter mehr zurück. Alle zuvor erfassten nativen Admin-Selects in Katalog, Einkaufserfassung, Verkäuferdialog und Nummernkreisen verwenden jetzt `app-custom-select`. Verbliebene kompakte Statuskennzeichnungen in Buchhaltung, Einkaufsdetails und Bildoptimierung verwenden `app-badge`. Warnflächen, Symbolkacheln und Storefront-Elemente bleiben gemäß Komponentenvertrag eigenständig. Die Workflow-Prüfung verlangt für die erfassten Admin-Abweichungen jetzt einen Altbestand von null.

**Prüfung:** Typprüfung und Produktionsbau erfolgreich. 86 gezielte Angular-Tests, 20 Katalog-/Buchhaltungs-Tests und 3 Architekturtests erfolgreich; Architekturprüfung über 64 Admin-Templates mit null Treffern erfolgreich; gezieltes ESLint und `git diff --check` erfolgreich. Die bereits festgeschriebenen Pakete wurden lokal installiert, damit auch der Barcode-Scanner kompiliert; Lockfile-Inhalt blieb unverändert. Die lokale Node-Version 22.16 liegt unter Angular 22s gefordertem 22.22.3 und erzeugt Engine-Warnungen. Keine Datenbankänderung.

**Abschlussprüfung:** Ein bestehender Windows-Prozessbaumtest scheiterte reproduzierbar, weil sein Fixture den angeblichen Kindprozess mit `detached: true` ausdrücklich aus dem zu prüfenden Prozessbaum löste. Das Fixture bildet jetzt einen echten Kindprozess ab; die produktive Runner-Logik blieb unverändert. Der betroffene Testlauf bestand anschließend dreimal hintereinander. Danach wurde die vollständige Projektprüfung erneut ausgeführt.

**PR-Nachprüfung:** Der erste GitHub-Browser-Smoke-Lauf deckte zwei überholte E2E-Verträge auf: Das neue gemeinsame Suchfeld war noch als normales Textfeld statt als semantisches Suchfeld ausgezeichnet, und der Reset-Test erwartete weiterhin einen deaktivierten statt des vereinbarten ausgeblendeten Buttons. Der gemeinsame Suchbaustein verwendet jetzt `type="search"`; der Reset-Test prüft das bedingte Ausblenden. Die neun betroffenen Chromium-Abläufe wurden lokal verifiziert.

---

## 2026-09-07 – Codex – Shopify-nahen Einkaufsablauf und Nummernkreise umgesetzt

**Auftrag/Ergebnis:** Den abgestimmten Umbau für Einkäufe vollständig umsetzen. Die Übersicht filtert jetzt nach Status und Verkäufer, durchsucht auch Vorgangsnummern und externe Referenzen und verwendet die gemeinsame Tabellenbedienung. Flohmarktmodus und Schnellerfassung wurden entfernt; vorhandene lokale Altdaten können unverändert als Sicherung exportiert werden.

**Erfassung und Status:** Neue Einkäufe entstehen als leere Entwürfe auf einer zentrierten, zweispaltigen Arbeitsseite. Verkäufer können als Privatperson oder Unternehmen mit strukturierten Kontaktdaten angelegt werden. Bekannter beziehungsweise unbekannter Inhalt und Einzel- beziehungsweise Gesamtpreis sind getrennte Entscheidungen. Katalogauswahl, CSV-Import, Kamera- und Hardware-Barcodescanner, Rabatte und getrennte Nebenkosten sind eingebunden. Der Status läuft ohne zusätzliche Transferseite über Entwurf, bestellt, unterwegs und angekommen; „unterwegs“ verlangt Dienstleister und Sendungsnummer. Bestand entsteht erst beim ausdrücklich ausgelösten Wareneingang.

**Nummern und Gestaltung:** Konfigurierbare Nummernkreise für Einkäufe und Verkäufe wurden als eigener Einstellungstab ergänzt. Die Datenbank vergibt Nummern je Workspace atomar, bewahrt bereits vergebene Nummern und belegt Altdaten deterministisch. Einkaufs- und Verkaufsansichten zeigen und durchsuchen diese Nummern. Einkaufserfassung und Detailseite verwenden normale Schreibweise, neutrale Karten und Beträge, das bestehende Logo-Gelb `#fcc601` für primäre Aktionen sowie die Shopify-nahe Aufteilung mit Arbeitsbereich links, Kosten und Details rechts und Chronik unter dem Arbeitsbereich.

**Prüfung:** `npm run verify` vollständig erfolgreich: 993 Node-, 138 DOM-, 511 Angular- und 13 Landing-Prüfungen, dazu Workflow- und Suite-Audit sowie Produktionsbau. Isolierter Supabase-Reset und alle 33 SQL-Dateien mit 1.132 Prüfungen erfolgreich. Sechs gezielte Playwright-Abläufe der Einkaufserfassung bestanden; Desktop-Referenz bei 1.440 × 1.000 Pixeln visuell geprüft. Einen dabei gefundenen beschädigten Umlaut im Untertitel korrigiert.

---

## 2026-09-06 – Codex – Tabellenfilter und Ansichts-Rücksetzung konkretisiert

**Auftrag/Ergebnis:** Einkaufsart-Reiter durch Statusdropdown, breite Suche und strukturierte Verkäuferfilter ersetzen. Gemeinsame Tabellenanordnung und sichtbare Textaktion „Ansicht zurücksetzen“ im Einkaufsfolgeplan und in der visuellen Abnahme festgehalten. Codeprüfung bestätigt bestehende Typfilter und bereits vorhandenen, bedingt sichtbaren Rücksetztext im gemeinsamen Spaltenmenü. Der konkret beobachtete Dashboard-Iconfall bleibt zu prüfen; Aktualisieren und Rücksetzen nicht gleichsetzen. Nur Dokumentation geändert, Dokumentationsdiff geprüft.

---

## 2026-09-06 – Codex – Shopify-Zugriff bestätigt und visuelle Abnahme konkretisiert

**Auftrag/Ergebnis:** Inventar, Einkaufsübersicht, Erfassungsseite und gespeicherten Entwurf im angemeldeten In-App-Browser erneut geöffnet. Seitenstruktur/Beschriftungen geprüft und aktuelle Layout-/Visual-Design-Docs gelesen. `docs/design/purchase-reference-acceptance.md` dokumentiert Quelle und Grenzen sowie verbindliche Abnahme für Layout, Typografie, Karten, Felder, Buttons, Dropdowns, Dialoge, Chronik und Bewegung. Frühere CSS-Messungen ausdrücklich von heutiger Strukturprüfung getrennt. Keine Shopdaten oder Anwendung geändert; Dokumentationsdiff geprüft.

---

## 2026-09-06 – Codex – Konfigurierbare Nummernkreise als gemeinsame Einstellung geplant

**Nutzerkorrektur:** Feste Einkaufsnummern durch konfigurierbare Formate je Vorgangsart ersetzen. Neuer Plan `docs/superpowers/plans/2026-09-06-numbering-settings-plan.md`, Einkaufsfolgeplan angepasst. Eigener Einstellungstab, getrennte Workspace-Zähler, Vorschau, Jahresoption, Mindeststellen, historische Stabilität und sichere Vergabe beschrieben. Einstellungsstruktur und vorhandene Nummerierungsbezeichner gesucht; umfassende Prüfung aller Vergabestellen bleibt erster Arbeitsschritt. Nur Dokumentation geändert und Diff geprüft.

---

## 2026-09-06 – Codex – Automatische Einkaufsnummer in den Folgeplan aufgenommen

**Auftrag/Ergebnis:** Fortlaufende kurze Einkaufsreferenz ergänzt. Vorgeschlagen: `#PO1` aufwärts je Workspace, Vergabe beim ersten Speichern als Entwurf, stabil bei Änderungen, Beschreibung optional, externe Verkäuferreferenz separat. Atomare Vergabe, Altdatenbelegung und Parallelitätsprüfungen im Kernumfang dokumentiert. Im gelesenen `Purchase`-Modell fehlt bislang eine solche Nummer.

**Prüfung:** Nur Plan und Changelog geändert; Dokumentationsdiff geprüft. Keine Datenbank- oder Anwendungsänderung.

---

## 2026-09-06 – Codex – Typografie und Farbdisziplin im Einkaufsplan präzisiert

**Auftrag/Ergebnis:** Normale Schreibweise statt dekorativer Versalien, neutrale einheitliche Flächen und referenzgetreue Shopify-Aufteilung in `docs/design/admin-ui-guidelines.md` und Einkaufsfolgeplan verbindlich ergänzt. Bestehendes Logo-Gelb bleibt. Konkrete Abweichungen in Einkaufsdetails, Kosteneditor, Korrekturdialog und Badge-Aufrufern durch Quellcodesuche bestätigt; Anwendung noch nicht geändert.

**Browser/Prüfung:** Verfügbarer In-App-Browser hatte keine Tabs; Shopify-Referenz neu geöffnet. Anmeldung und aktuelle CSS-Werte in dieser Sitzung noch nicht bestätigt. Dokumentationsdiff auf Formatfehler geprüft.

---

## 2026-09-06 – Codex – Einkaufsfolgeplan anhand Shopify-Bestellerfassung konkretisiert

**Auftrag:** Vorgehen für lieferantenorientierte Einkäufe mit späterer Artikelaufnahme, Katalogauswahl, direkter Neuanlage, CSV und Scanner planen.

**Ergebnis:** Neuer Vorgehensplan unter `docs/superpowers/plans/2026-09-06-purchase-workflow-delivery-plan.md`. Screenshot und offizielle Shopify-Hilfe mit vorhandenen Modellen, Positionseditor und Servicevalidierung abgeglichen. Katalogauswahl, Einzelanlage und CSV existieren bereits; unbekannte Preise sind bislang an Mystery gebunden. Fachregeln, tatsächliche RPC-/Schema-Prüfung, Kernoberfläche und Import/Scanner als getrennte Arbeitspakete festgehalten. Empfehlungen sind als noch zu entscheidende Regeln gekennzeichnet.

**Prüfung:** Plan gegen Nutzeranforderungen und gelesenen Code geprüft; keine Anwendungs- oder Datenbankänderung. Eigener Worktree `codex/purchase-workflow-plan` auf Master `371f054`.

**Ergänzung:** Sieben weitere Screenshots und neue Nutzerfestlegungen eingearbeitet: vollständiger Flohmarkt-Rückbau, Privat-/Firmenverkäufer, Scanner im Kernumfang, separate Kostenkarte, Chronik mit Kommentaren und Statusführung ohne Transferseite/Versandziel. Paketankunft, Artikelaufnahme und Kostenzuordnung getrennt beschrieben. Bestehende Flohmarkt-Aufrufer und Lieferantenservice geprüft. Keine Änderung an Funktionen oder gespeicherten Daten in diesem Planungsschritt.

---

## 2026-09-06 – Codex – Shopify-nahe Tabellen und Erfassungsseiten umgesetzt

**Auftrag:** Den abgestimmten Korrekturplan auf dem aktuellen Master umsetzen, ohne den parallel bearbeiteten Claude-Zweig zu verändern.

**Gestaltung:** Gemessene Shopify-Werte für Arbeitskarten, Tabellenköpfe, Felder, Buttons, Badges, Dialoge, Popover-Schatten und Bewegung in die gemeinsamen Flipbase-Bausteine übernommen. Das belegte Logo-Gelb `#fcc601` bleibt die primäre Adminfarbe. Doppelte Inventarüberschrift und dauerhaften Verkaufshinweis entfernt; Steuerjournal-Spalte in „Besteuerungsart“ umbenannt. Berichtstabellen in Accounting, Analytics und Daten/Audit verwenden ebenfalls die gemeinsame Tabellendarstellung.

**Arbeitsabläufe:** Verkauf und neue Inventarartikel laufen über eigene Routen `sales/new` und `inventory/new`. Zusammen mit `purchases/new` verwenden sie einen zentrierten Seitenrahmen; Verkauf und Einkauf ordnen Arbeitsdaten und Zusammenfassung auf breiten Ansichten nebeneinander an. Scanner, Bildzuschnitt, Teilanlage, Verkaufs-Vorbelegung und fachliche Serviceaufrufe bleiben erhalten. Ein gemeinsamer Verlassensschutz verhindert Datenverlust und Doppelaktionen während des Speicherns. Verkaufsvorbelegungen kehren in den aufrufenden Inventarkontext zurück.

**Tabellenbedienung:** Die Einkaufstoolbar bleibt bei null Treffern sichtbar und bietet „Suche und Filter löschen“. Sortierrichtungen unterscheiden Text, Datum und Zahlen; das Sortiermenü fokussiert die aktive Auswahl, unterstützt Pfeiltasten, Escape und Fokusrückgabe. Ungenutzte Shopify-Icon-/Tokenpakete samt indirekter Abhängigkeit entfernt; Flipbase nutzt weiter Lucide und eigenen Angular-/Tailwind-Code.

**Prüfung:** Lokale Browserabnahme in Hell auf Verkauf, Artikel, Einkauf, Inventar, Nulltreffer und Sortiermenü. 101 gezielte Angular-Tests grün. 9 Kern-E2E-Abläufe sowie 32 Layout-, Tabellen-, Theme-, Persistenz- und Typografieprüfungen ausgeführt; zwei veraltete Modal-/A–Z-Erwartungen auf das neue Soll angepasst und anschließend die betroffenen 7 Prüfungen grün wiederholt. Drei Erfassungsseiten bei 390 px ohne horizontalen Überlauf und ohne automatisierte AXE-WCAG-AA-Verstöße. Nach dem Abgleich mit dem aktuellen Master `npm run verify` vollständig grün: Format, ESLint, Typen, 43 Workflow-Tests, Suite-Audit, 998 Node-, 135 DOM-, 500 Angular- und 13 Landing-Tests sowie Produktionsbau. 42 gezielte Chromium-E2E-Tests bestanden. Der erste GitHub-Browser-Smoke-Test zeigte unter Linux wegen breiterer Schriftmetriken 2 px Überlauf in der Einkaufs-Kopfzeile; die Aktionen umbrechen nun bei Platzmangel und die sechs Layout-Prüfungen sind lokal grün. Keine Datenbankänderung; Arbeit ausschließlich im Worktree `codex/polaris-design-audit`.

**Bewusst zurückgestellt:** Der fachliche Einkaufsumbau mit Lieferant als Ausgangspunkt, Gesamtbetrag, späterer Artikelerfassung und Kostenverteilung bleibt im separaten Folgeplan. Der technische Einkaufstyp und die sichtbare Typauswahl wurden deshalb noch nicht entfernt.

---

## 2026-09-06 – Codex – Gesamtplan für Erfassungsseiten und späteren Einkaufsumbau

**Auftrag:** Die vereinbarte Reihenfolge als konkreten Plan dokumentieren: Grundgestaltung und zentrierte Erfassungsseiten zuerst, fachlicher Einkaufsumbau danach.

**Dokumentation:** Bestehenden Designplan um Phase A/B, Verkaufsübersicht plus Verkaufsanlage als ersten Referenzablauf, Entfernung des dauerhaften Verkaufshinweises und Paket 5a für Erfassungsseiten ergänzt. Tatsächliche Modal-Komponenten, vorhandene Einkaufsseite, Routen, Serviceverträge und Tests gelesen. Neue Einkaufs-Folgeplanung mit Lieferant, Gesamtbetrag, späterer Artikelerfassung, Kostenverteilung, Altbeständen und Entscheidungspunkten. Spezifikation entsprechend aktualisiert.

**Prüfung/Umfang:** Dokumentation im eigenen Worktree, Format- und Diffprüfung. Keine Anwendungscode- oder Datenbankänderung, kein Commit/Push. Fachliche Verteilungsregeln nicht erfunden; vollständiger technischer Migrationsplan folgt erst nach deren Klärung.

---

## 2026-09-06 – Codex – Angemeldeten Shopify Admin live untersucht

**Auftrag:** Nach Anmeldung unterschiedliche Seiten und Elemente durchgehen und die tatsächliche Gestaltung als Grundlage des Korrekturplans dokumentieren.

**Ergebnis:** Neues `docs/design/shopify-admin-live-reference.md` mit 22 protokollierten Seiten/Seitentypen, DOM-/Shadow-DOM-Messungen, Screenshots im Browser und Bedienproben. Inventar, Produkte, Kollektionen, Einkaufsbestellungen, Transfers, Details, Formulare, leere Zustände, Auswahl, Filter, Sortier-/Spaltenmenüs, Export-/Auswahldialog, Kalender, Dashboard und Einstellungen geprüft. Arbeitskarte/Popover 12 px, Feld/Button/Badge 8 px, Checkbox 4 px, Dialog 16 px, Startseiten-Empfehlungskarte 24 px. Unterschiedliche Dialoggenerationen und Konflikt zwischen öffentlicher Schriftgrößenrichtlinie und internem Admin ausdrücklich dokumentiert.

**Grenzen:** Keine vollständige Mobile-/Zoom-/Reduced-Motion- oder Interaktionsmatrix; keine gefüllte Verkaufsbestellliste verfügbar. CSS-Übergangsdauer nicht als vollständig geprüften Animationsablauf ausgegeben. Suchzustand und Auswahl zurückgesetzt, leeren Entwurf ohne Speichern verlassen. Keine Shopdaten, Einstellungen oder gespeicherten Ansichten geändert.

**Dateien/Prüfung:** Live-Referenz neu, Designrichtlinien, Spezifikation und Plan verknüpft/aktualisiert. Nur Dokumentation im eigenen Worktree `codex/polaris-design-audit`; Format- und Diffprüfung. Kein Anwendungscode geändert, kein Commit/Push; Claudes Branch unverändert.

---

## 2026-09-06 – Codex – Logo-Gelb belegt und Designrichtlinien vertieft

**Auftrag:** Helles Logo-Gelb gegen Originaldateien und Historie prüfen,
Shopify-Designrichtlinien dokumentieren, Referenztreue einschließlich Radien
präzisieren und Steuer/DATEV auf Tabellenumfang begrenzen.

**Befund:** Das seit `1e659bc` unveränderte Logo-Symbol enthält `#fcc601`
tatsächlich; Verlauf und Skalierung erzeugen benachbarte Farbtöne. Der aktuelle
Master verwendet diesen Wert für primäre Adminaktionen, aber `#e5b201` beim
Hover. Frühere Styles nutzten Orange `#f89d13`; ein durchgehend historischer
gelber Buttonstandard ist nicht belegt. Globale Admin-Regeln überschreiben
mehrere Card-Radiusvarianten mit 8 px.

**Dokumentation:** Neue `docs/design/admin-ui-guidelines.md` mit Quellen für
Struktur, Navigation, Layout, visuelles Design, Tabellen, Formulare, Feedback,
Inhalte, Dashboard, Onboarding, Marketing, Accessibility und Komponenten.
Messvertrag für Radien/Styles/Zustände ergänzt. Nutzerziel möglichst 1:1 bei
eigener Marke festgehalten; Originalpaketlizenzen bleiben separat. Plan und
Spezifikation angepasst, kurzer verbindlicher Verweis in `AGENTS.md` ergänzt.

**Browser:** Codex sieht nur seinen Browser mit noch offener Anmeldung.
Zusätzlich vorhandenes Browser-Use-CLI geprüft: Python-3.14-Startproblem durch
einen prozesslokalen Event-Loop umgangen, keine Installation verändert.
`--connect state` findet keinen Chrome mit aktiviertem Entwicklerzugang.
Keine Browserprofile, Cookies oder Anmeldedaten kopiert, keine Einstellung
geändert. Native Computersteuerung ist in dieser Sitzung nicht freigeschaltet.

**Prüfung:** PNG-Pixelzählung, Git-Historie, Codelektüre und offizielle
Dokumentationsquellen. Nur Dokumentation geändert; Format- und Diffprüfung.
Keine Anwendungscodeänderung, kein Push; Claudes Branch unverändert.

---

## 2026-09-06 – Codex – Shopify-/Polaris-Bestandsaufnahme und Korrekturplan

**Auftrag:** Die letzten UI-Änderungen prüfen, offizielle Shopify-Dokumentation
recherchieren und ein Zielbild samt Umsetzungsreihenfolge vorlegen. Ausschließlich
Analyse und Planung, keine Anwendungscodeänderung.

**Basis:** Aktueller `origin/master` nach Fetch, Commit `04def2e`, in eigenem
Worktree `.worktrees/polaris-design-audit`, Branch `codex/polaris-design-audit`.
Claudes laufender Branch `feat/deal-monitor-collection-and-ui` wurde nur gelesen.

**Befunde:** Polaris-Tokens und -Icons installiert, aber nicht im Anwendungscode
eingebunden; eingeschränkte Lizenz beider installierter Pakete bestätigt. Die
neuere Shopify-Dokumentation beschreibt Web Components und Index-Table-Muster;
Polaris React ist archiviert. Gemeinsame Spaltenlogik vorhanden, Toolbar- und
Ergebnisdarstellung weiterhin mehrfach implementiert. In der lokalen Demo
reproduziert: Einkaufssuche ohne Treffer entfernt die Such-/Filterleiste;
Sortier-Untermenü fokussiert keine Auswahl und reagiert am Trigger nicht auf
Pfeil nach unten; Datumssortierung wird als A–Z/Z–A bezeichnet. Das Steuerjournal
zeigt Besteuerungsarten unter der Überschrift „Plattform“. Inventarfilter stehen
weiterhin in einer separaten Karte. Designwerte und Motion benötigen eine
gemeinsame, überprüfbare Definition.

**Ergebnis:** Spezifikation in
`docs/superpowers/specs/2026-09-06-polaris-design-audit.md`; gestufter Plan in
`docs/superpowers/plans/2026-09-06-polaris-design-consolidation.md`. Erst Fehler
und Grundbausteine, dann vollständige Inventar-Referenz, übrige Tabellen,
Steuer/DATEV und restliche Oberfläche. Lucide und eigene Angular-/Tailwind-
Bausteine empfohlen, keine ungeprüfte Übernahme von Shopify-Code oder Assets.

**Prüfung und Grenzen:** Entwicklungsbau und lokale Browserprüfung des genannten
Master-Stands, offizielle Quellen, lokale Paketlizenzen, gezielte Codelektüre.
Dokumente mit Prettier und `git diff --check` geprüft. Keine vollständige
Testsuite oder AXE-/WCAG-Abnahme. Shopify-Admin ist im verfügbaren Browser noch
nicht angemeldet; keine internen Admin-CSS-Messungen behauptet. Für die Vorschau
wurden vorhandene Abhängigkeiten per ignorierter Junction verwendet und die
reguläre ignorierte Versionsdatei erzeugt. Keine Datenbankänderung, kein Push.

---

## 2026-09-06 – Codex – Übernahme und Abschlussprüfung von Paket 1

**Auftrag:** Den von Claude übergebenen Zweig `feat/deal-monitor-collection-and-ui`
prüfen und den Abschluss einschließlich Pull Request übernehmen.

**Umsetzung:** Die 26 vorhandenen Commits mit Plan und Übergabe abgeglichen,
Auffrischungsregel, Anfragebudget, Parser, Speicherung, Datenbankrechte und
Administrationsseite geprüft. Den inzwischen zwölf Commits neueren `master`
zusammengeführt; einziger Konflikt war dieses Protokoll. Beide Seiten bleiben
vollständig erhalten. Keine fachlichen Änderungen bei dieser Übernahme.

**Verifiziert durch:** 23 Angular-Tests der Administration, 104 Sniper-Tests,
Sniper-Typprüfung und Angular-Bau vor der Zusammenführung erfolgreich.
Die Prüfung des zusammengeführten Stands und die PR-Ergebnisse werden im PR
festgehalten. Die im Übergabebericht genannten 1108 Datenbankprüfungen und
23 Dienst-Integrationstests stammen aus Claudes Lauf, nicht aus dieser Sitzung.

**Offen:** Keine Browserkontrolle mit Betreiberkonto; kein lokaler
Supabase-Stack dieses Projekts aktiv. Paket 2 bis 4 sind separate Folgearbeiten.
Der Pull Request dient der vollständigen CI-Prüfung vor Merge und Deployment.

---

## 2026-09-06 – Claude – Nachbesserung der Gesamtprüfung am Kategoriezweig

**Auftrag:** Letzter Durchgang vor dem Merge des Zweigs
`feat/deal-monitor-collection-and-ui`. Eine Gesamtprüfung der sechs fertigen Aufgaben hatte
sieben Befunde ergeben, einen davon als kritisch eingestuft.

**Umsetzung:** Fünf Änderungen, je ein Commit.

1. _Kritisch — Dauerfeuer nach einem Fehlschlag._ `markFailed` schreibt nur `last_attempt_at`,
   nie `refreshed_at`; `isRefreshDue` kannte diesen Wert nicht. Nach jedem gescheiterten Einlesen
   war die Auffrischung bei jedem Takt wieder fällig — bei 5 Sekunden Takt zwölf Anfragen je
   Minute gegen die Vinted-Startseite, dauerhaft. `readSyncState` liest den Wert jetzt mit, und
   `isRefreshDue` wartet nach einem Fehlschlag `FAILED_REFRESH_RETRY_MS` (15 Minuten, fester
   Abstand). Eine Anforderung aus der Administration greift weiterhin sofort, aber nur, bis der
   Dienst sie versucht hat — sonst bliebe sie nach einem Fehlschlag für immer offen und triebe
   dasselbe Dauerfeuer. Zusätzlich fragt die Auffrischung jetzt das Anfragebudget
   (`hasCapacity()`), bevor sie die Startseite holt. Die Frage sitzt in `refreshCategoriesIfDue`
   hinter einer eingehängten Funktion statt in `index.ts` — genau so, wie der Taktgeber sein
   Budget als Abhängigkeit bekommt. `index.ts` bleibt reine Verdrahtung, und der Riegel ist
   dadurch von einem Test erreichbar.
2. _`requested_at` kam aus dem Browser._ Neuer Trigger `stamp_vinted_category_request` auf
   `public.vinted_category_syncs` stempelt den Wert mit `now()` — dasselbe Muster wie
   `stamp_beta_application_decision`. Er stempelt nur, wenn `requested_at` wirklich einen neuen,
   nicht leeren Wert bekommt: Der Dienst schreibt in dieselbe Zeile, und ein Mitstempeln setzte
   nach jedem Lauf eine neue Anforderung ab. Das Spaltenrecht blieb unangetastet.
3. _`listLeaves()` schnitt still ab._ PostgREST kürzt auf `max_rows` (1000) bei rund 2500
   Blättern — ohne Fehler. Es wird jetzt geblättert, bis eine leere Seite kommt, der Versatz
   wächst um die tatsächlich gelieferte Zeilenzahl, und `id` kam als zweiter Sortierschlüssel
   dazu, weil `path` nicht eindeutig ist. `isLeaf` ist aus dem Angular-Modell entfernt: Es war
   immer `true` und las sich im aufrufenden Code wie eine Prüfung, die keine ist.
4. _Die Seite war nicht erreichbar._ Neuer Rahmen
   `src/app/features/platform-admin/platform-admin-shell/` mit einer Unternavigation
   („Bewerbungen", „Kategorieliste"), gebaut wie die Unternavigation der Einstellungen:
   `routerLinkActive` für die Auszeichnung, dieselbe Direktive für `aria-current="page"`.
   Die Punkte stehen in einer Liste, damit Paket 2 seine zwei Seiten mit je einer Zeile ergänzt.
5. _Zwei Felder fehlten in der Anzeige._ Die Kategorieseite zeigt jetzt den letzten Versuch als
   eigene Kennzahl und im Fehlerkasten, und eine offene Anforderung als eigenen Hinweis aus dem
   geladenen Stand — der überlebt damit einen Seitenwechsel, anders als das lokale Signal.

Dazu: Die vier fehlenden Protokolleinträge (Aufgaben 2 bis 5) sind unten nachgetragen, und die
Pfadangabe `/platform-admin/categories` in Plan und Entwurf ist auf die tatsächliche Route
`/admin/categories` berichtigt — nur der Ordner heißt `platform-admin`.

**Verifiziert durch:** Zu jeder Änderung eine Gegenprobe, also Code absichtlich falsch gemacht
und den Test rot gesehen: Rückzug entfernt → 6 Tests rot; Budgetriegel entfernt → 1 Test rot;
Trigger gelöscht, unbedingt stempelnd, ohne Null-Riegel → je ein anderer pgTAP-Fall rot;
Blätterschleife auf eine Anfrage zurückgebaut → 2 Tests rot; `aria-current` fest verdrahtet →
1 Test rot; offener Hinweis entfernt, jeder Zeitstempel als offen gewertet, Kachel entfernt →
je ein anderer Test rot. Anschließend jeweils zurückgenommen und grün gemessen. Die erwarteten
Zeitangaben in den Komponententests werden mit `formatDate` berechnet statt hingeschrieben; ein
festes „15:00" wäre in Berlin grün und auf einem UTC-Läufer rot. Gegengeprüft mit `TZ=UTC`.

**Befunde:**

- `npx supabase start` scheitert auf diesem Rechner weiterhin an von Windows gesperrten
  Standardports. Gearbeitet wurde mit vorübergehend verschobenen Ports (54xxx → 64xxx) in
  `supabase/config.toml` und `services/sniper/.env`; beide Dateien sind danach zurückgesetzt
  worden, die Verschiebung ist in keinem Commit.
- `supabase db diff` erzeugte wie schon bei Aufgabe 1 zusätzlich Neudeklarationen von zehn
  unbeteiligten Funktionen (nur Groß-/Kleinschreibung, Einrückung, `$$` statt `$function$`).
  Sie wurden wie dort aus der Migration entfernt; das steht im Kopfkommentar der Migration.
- Eine Browserkontrolle der Oberfläche fand nicht statt. Belegt sind die Änderungen durch
  Komponententests samt axe-Lauf und den Bau.

---

## 2026-09-06 – Claude – Task 6: Kategorieliste in der Administration, „Betreiber" wird „Administration"

**Auftrag:** Letzte Aufgabe des Pakets (Zweig `feat/deal-monitor-collection-and-ui`): eine
Seite, auf der man sieht, wie frisch der in Task 1 gespeicherte Kategoriebaum ist, und ein
erneutes Einlesen anfordern kann — dazu die Umbenennung des Menüpunkts „Betreiber" zu
„Administration".

**Umsetzung:** Neue Seite `src/app/features/platform-admin/pages/vinted-categories/` (Standalone
Component, `ChangeDetectionStrategy.OnPush`, `inject()`, Signals) zeigt Kategorienzahl,
Zeitpunkt des letzten Einlesens und einen etwaigen letzten Fehler; ein Knopf „Neu einlesen" ruft
`VintedCategoryService.requestRefresh()`. Der Hinweistext sagt bewusst „angefordert", nicht
„aufgefrischt" — der Knopf setzt nur `requested_at` in der Datenbank, der Sniper liest es erst
beim nächsten Takt. Route `categories` unter `platform-admin.routes.ts` ergänzt. Die im
Planentwurf genannten Tailwind-Klassen `text-fb-text` und `bg-fb-accent` gibt es in
`src/styles.css` nicht; verwendet wurden die tatsächlich vorhandenen Entsprechungen
`text-fb-text-primary` und `bg-fb-primary`/`text-fb-on-accent` (dasselbe Muster wie der
Primärknopf in `sidebar.component.html`). `PLATFORM_ADMIN: 'Betreiber'` in `translations.ts`
und `label: 'Betreiber'` in `sidebar.component.ts` wurden zu „Administration"; der Kommentar
darüber wurde zu „Der Punkt Administration erscheint nur fuer Betreiber der Plattform.". Die
Route `/admin` (Ladepfad von `platform-admin.routes.ts`) blieb unverändert. „Betreiber" als
Fachbegriff für die Rolle blieb stehen, wo er das ist: `platform-operator.service.ts` samt Test,
Kommentare in `webhook.models.ts`, `header.component.ts/.html` und `app.routes.ts`.

**Verifiziert durch:** TDD — Test zuerst rot (`Failed to resolve import
"./vinted-categories.component"`), nach Komponente und Vorlage grün (4/4). Danach
`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:angular` (477/477,
5 übersprungen) und `npm run build` — alle grün, jeweils vor und erneut nach dem Commit
gemessen. Schritt 9 (Browser-Kontrolle unter `/platform-admin/categories`) blieb offen: die
lokale Datenbank lässt sich auf diesem Rechner wegen von Windows gesperrter Supabase-Standardports
nicht ohne Weiteres starten. Voller Bericht: `.superpowers/sdd/task-6-report.md`.

---

## 2026-09-06 – Claude – Task 5: Kategoriebaum und Auffrischungsstand im Angular-Dienst

**Auftrag:** Vorletzte Aufgabe des Pakets (Zweig `feat/deal-monitor-collection-and-ui`): einen
Angular-Dienst, über den die Oberfläche den in Task 1 gespeicherten Kategoriebaum und seinen
Auffrischungsstand lesen und ein erneutes Einlesen anfordern kann.

**Umsetzung:** Neu angelegt
`src/app/features/platform-admin/models/vinted-category.model.ts` (`VintedCategory`,
`CategorySyncStatus`) und `src/app/features/platform-admin/services/vinted-category.service.ts`.
`listLeaves()` liefert nur Blattkategorien nach Pfad sortiert — eine Zwischenkategorie wäre als
Sammelauftrag zu breit. `readStatus()` liest die einzige Zeile aus `vinted_category_syncs`.
`requestRefresh()` schreibt genau ein Feld, `requested_at`; alles andere setzt der Dienst mit
Dienstschlüssel, und die Spaltenrechte aus Task 1 lassen es auch gar nicht anders zu. Kein
`createClient` im Feature-Dienst — der Zugang kommt wie überall aus `SupabaseService`.

**Nachlauf im selben Zweig** (`86437ab`): Die Tests prüften nur, dass die Zeilen der Attrappe ins
Modell umgewandelt werden. Sie wären auch mit der falschen Tabelle, fehlenden Spalten oder ohne
Filter auf die einzige Zeile grün geblieben — die Attrappe antwortet ja unabhängig davon. Beide
Fälle prüfen jetzt Tabelle, Spalten und Filter, und ein abgelehnter Auffrischungswunsch kam dazu.

**Verifiziert durch:** TDD, Test zuerst rot. Danach `npx vitest run --project=angular` für den
Dienst grün. Der Nachlauf wurde durch Gegenprobe belegt: Dienst auf eine falsche Tabelle gezeigt,
die beiden Tests fallen dort um und sind nach dem Zurücknehmen wieder grün.

---

## 2026-09-06 – Claude – Task 4: Auffrischung in die Taktschleife des Dienstes hängen

**Auftrag:** Aufgabe 4 des Pakets: Die Bausteine aus Task 3 (`isRefreshDue`, `CategoryStore`)
existierten, aber niemand rief sie auf. Ohne diesen Schritt wird der Kategoriebaum nie
eingelesen, und dem geplanten kategoriebasierten Sammeln fehlt die Grundlage.

**Umsetzung:** Neu `services/sniper/src/runtime/refresh-categories.ts` mit
`refreshCategoriesIfDue()`. Die Funktion wirft nie: Ein gescheitertes Abholen oder Auswerten wird
über `markFailed` festgehalten, und der Takt läuft weiter — ein alter Kategoriebaum darf das
Sammeln der Angebote nicht anhalten. Aufgerufen wird sie in `services/sniper/src/index.ts` vor
`scheduler.runOnce()`, mit derselben gezählten fetch-Funktion wie der Rest des Dienstes, damit die
Anfrage an die Startseite gegen das Anfragebudget zählt. Neue Einstellung
`SNIPER_CATEGORY_MAX_AGE_MS` in `config.ts` und `.env.example`.

**Nachlauf im selben Zweig** (`ab3eb2c`): Der Kommentar zum Kreis-Riegel in `category.store.ts`
behauptete, die Fremdschlüsselprüfung der Datenbank melde den eigentlichen Fehler. Das stimmt für
einen Kreis nicht — liegen beide Zeilen im selben Schreibblock, sind am Ende der Anweisung beide
da und die Prüfung ist zufrieden. Der Kommentar sagt jetzt, was tatsächlich passiert: Ein Kreis
würde still gespeichert, Vinted liefert aber einen Baum.

**Verifiziert durch:** `refresh-categories.spec.ts` deckt die vier Wege ab (jung genug, fällig,
Auswertung gescheitert, Abholen gescheitert), jeweils gegen die aufgezeichnete Startseite als
Vorlage; `config.spec.ts` deckt die neue Schranke ab. Volle Suite (94 Tests), Typprüfung, Lint,
Prettier und Bau grün.

---

## 2026-09-06 – Claude – Task 3, Review-Nachlauf: Markieren-und-Nachräumen statt Erst-Leeren

**Auftrag:** Drei zusammenhängende Review-Befunde an `CategoryStore.replaceAll` beheben
(Zweig `feat/deal-monitor-collection-and-ui`): (1) die Methode leerte die Tabelle vor dem
Schreiben, obwohl der Kopfkommentar „ein Fehlschlag löscht nichts" verspricht; (2) der
Integrationstest dazu prüfte nur `markFailed`, nie das eigentliche Löschverhalten; (3) die
Sortierung „Eltern vor Kindern" zählte die Tiefe aus `path.split(' > ').length` statt aus der
Elternkette — fragil und durch einen Titel mit „>" verfälschbar.

**Umsetzung:** `services/sniper/src/store/category.store.ts` schreibt jetzt
markieren-und-nachräumen: ein Zeitstempel pro Lauf, `upsert` in 500er-Blöcken mit diesem
Zeitstempel auf `updated_at`, und erst danach ein `delete` aller Zeilen mit älterem
`updated_at` (das sind die von Vinted entfernten Kategorien; `parent_id` kaskadiert bewusst).
Bricht das Schreiben ab, läuft das Löschen nie. Die Sortierung läuft jetzt über eine aus
`parentId` aufgebaute Tiefe (Wurzeln zuerst), nicht mehr über den Anzeigetext `path`.
`services/sniper/test/store/category.store.integration.spec.ts` bekam die tatsächlich fehlenden
Fälle: ein echter Fremdschlüsselfehler mitten im Schreiben lässt den alten Baum unverändert
stehen; umgekehrte Eingabereihenfolge (Kind vor Elternteil) gelingt trotzdem; ein Titel mit „>"
verfälscht die Reihenfolge nicht. Der bestehende `markFailed`-Test blieb inhaltlich unverändert,
nur umbenannt, damit der Name nicht mehr suggeriert, er prüfe `replaceAll`.

**Befunde:**

- `npx supabase start` scheiterte wie vom Auftrag als bekanntes Risiko benannt: Windows hat
  auf diesem Rechner den Portbereich 54257–54356 (und weitere direkt anschließende Bereiche)
  dynamisch als Ausschluss reserviert, darin liegt der komplette Sniper-Portblock
  54350–54359. `netsh interface ipv4 show excludedportrange protocol=tcp` bestätigt das.
  Der Auftrag verlangt ausdrücklich, `supabase/config.toml` dafür nicht zu verändern und den
  Zustand stattdessen als BLOCKED zu melden — anders als beim vorherigen, ähnlichen Fall in
  Task 1 wurde hier also _kein_ temporärer Portwechsel versucht. Die beiden Integrationstest-Läufe
  (vor und nach dem Commit) aus dem Prüfauftrag konnten deshalb nicht ausgeführt werden.

**Verifiziert durch:** `npx vitest run test/runtime/category-refresh.spec.ts` (5/5 grün),
`npx tsc --noEmit` in `services/sniper` (keine Ausgabe) und `npm run typecheck` im
Projektstamm (keine Ausgabe), jeweils vor und erneut nach dem Commit gemessen. Die
Integrationstests selbst sind BLOCKED (siehe oben). Voller Bericht mit allen Kommandos und
tatsächlicher Ausgabe: `.superpowers/sdd/task-3-report.md`.

---

## 2026-09-06 – Claude – Task 3: Kategoriebaum speichern und Fälligkeit entscheiden

**Auftrag:** Aufgabe 3 des Pakets: den in Task 2 geparsten Baum in die Tabellen aus Task 1
schreiben und festlegen, wann neu eingelesen wird.

**Umsetzung:** Neu `services/sniper/src/store/category.store.ts` mit `CategoryStore`
(`readSyncState`, `replaceAll`, `markRefreshed`, `markFailed`) und
`services/sniper/src/runtime/category-refresh.ts` mit `isRefreshDue`. `replaceAll` ersetzt
vollständig statt zusammenzuführen: Eine Kategorie, die Vinted entfernt hat, soll auch bei uns
verschwinden — sonst tauchte sie später im Kategoriewähler auf, ohne je Funde zu liefern.
Geschrieben wird in Blöcken zu 500 Zeilen, weil rund 2900 Zeilen in einem Rutsch die Anfragegröße
von PostgREST sprengen; die Eltern stehen dabei vor den Kindern, damit der Fremdschlüssel auf
dieselbe Tabelle nicht anschlägt. Die Fälligkeit steht bewusst in TypeScript und nicht in SQL —
dieselbe Entscheidung wie bei der Fälligkeit einer Abfrage in `query.store.ts`, so bleibt die
Regel ohne Datenbank prüfbar.

**Verifiziert durch:** TDD. `category-refresh.spec.ts` deckt die Regel ohne Datenbank ab;
`category.store.integration.spec.ts` schreibt gegen eine lokale Supabase-Instanz. Die
Portverschiebung, die zum Start der lokalen Datenbank auf diesem Rechner nötig ist, ist in keinem
Commit gelandet. Die unmittelbar folgende Prüfung fand drei Schwächen in genau diesem Stand; sie
sind im Eintrag „Task 3, Review-Nachlauf" oben beschrieben.

---

## 2026-09-06 – Claude – Task 2: Kategoriebaum aus dem HTML der Vinted-Startseite lesen

**Auftrag:** Aufgabe 2 des Pakets: den Vinted-Kategoriebaum überhaupt erst beschaffen.

**Umsetzung:** Vinted bietet keinen Endpunkt für die Kategorieliste — `/api/v2/catalogs` und
`/api/v2/catalog/initializers` antworten beide mit 404. Der vollständige Baum steht dagegen im
HTML der Startseite, in einem Next.js-Flight-Block unter `catalogTree`. Neu
`services/sniper/src/vinted/categories.ts`: Der Parser packt dieses Zeichenketten-Literal aus und
flacht den Baum ab (Nummer, Elternteil, Titel, Slug, lesbarer Pfad, Blatt ja/nein). Gegen die
Live-Seite gemessen: 2920 Kategorien, 9 Wurzeln, 2500 Blätter.

**Nachlauf im selben Zweig:** Zwei Korrekturen an derselben Aufgabe.

- `b21ec80`: Die Testvorlage bildet einen Flight-Block nach, in dem der Baum als JS-Zeichenkette
  mit maskierten Anführungszeichen steht. Prettier schrieb diese Maskierung in einfache
  Anführungszeichen um — und nahm der Vorlage damit genau die Hürde, für die es sie gibt: Danach
  sieht sie weiter wie Vinted-HTML aus, aber jeder naive Leser kommt durch. Genau das war
  passiert: Die Tests waren vor dem Commit grün und im Commit rot. Das Vorlagenverzeichnis steht
  jetzt in `.prettierignore`, die Maskierung ist wiederhergestellt, und der Plan richtet die
  Ausnahme ein, bevor die Vorlage geschrieben wird.
- `cab919c`: Ein Test behauptete, Referenzblöcke abzudecken, konnte das aber nicht — die Vorlage
  stellte den Referenzblock hinter den Baum, und die Suche bricht beim ersten Treffer ab. Er
  wiederholte damit nur den ersten Test mit schwächerer Zusicherung. Geblieben ist der Fall, der
  die Übergehung wirklich durchläuft: Referenz **vor** dem Baum. Auch die Begründung im Kommentar
  wurde berichtigt.

**Verifiziert durch:** `services/sniper/test/vinted/categories.spec.ts` gegen die aufgezeichnete
Startseite; die Zahlen zusätzlich gegen die Live-Seite abgeglichen. Die Lehre aus `b21ec80` —
**nach** dem Commit messen, nicht davor — steht seither in den Anweisungen dieses Zweigs.

---

## 2026-09-06 – Claude – Task 1: Tabellen für Vinted-Kategorien und Auffrischungsstand

**Auftrag:** Erste Grundlage für den künftigen Vinted-Deal-Monitor: den
Kategoriebaum von Vinted speicherbar machen, weil Vinted dafür keinen
eigenen Endpunkt anbietet (`/api/v2/catalogs` und
`/api/v2/catalog/initializers` antworten mit 404 - der Baum steht nur im
HTML der Startseite). Nur die zwei Tabellen samt Rechten, Migration und
Datenbanktests; Einlesen (Parser, Dienst) und Oberfläche sind spätere
Aufgaben.

**Umsetzung:** `public.vinted_categories` (flacher Baum, Vinted-eigene ids,
Elternverweis auf sich selbst) und `public.vinted_category_syncs` (genau
eine Zeile, per Check auf `id = 1` erzwungen) mit RLS: Lesen für jeden
Angemeldeten, Schreiben ausschließlich mit Dienstschlüssel durch den
Sniper, Auffrischung anfordern nur für die Administration
(`public.is_platform_operator()`, mit Spaltenrecht nur auf
`requested_at`). Neue Datei `supabase/schemas/100_vinted_categories.sql`
steht bewusst nach `99_platform_admin.sql` in der Ladereihenfolge, weil
ihre Policies dessen Funktion aufrufen.

**Befunde:**

- Der automatische Migrationsabgleich (`npx supabase db diff`) hat
  zusätzlich Neudeklarationen von zehn bereits bestehenden, unabhängigen
  Funktionen erzeugt (Purchase-Costing und Barcode-Validierung). Eine
  Stichprobe zeigt keinen inhaltlichen Unterschied zur Schemadatei - nur
  Formatierung. Aus der Migration entfernt, damit sie wirklich nur die
  zwei neuen Tabellen anlegt; die zugrunde liegende Abweichung zwischen
  Schemadateien und angewandten Migrationen bei diesen zehn Funktionen ist
  unabhängig von dieser Aufgabe und bleibt unangetastet.
- Der wörtlich vorgegebene Test fragt als Rolle `anon` `select count(*)`
  ab und erwartet `0`. Mit der ebenfalls wörtlich vorgegebenen Schemadatei
  (kein Tabellenrecht für `anon`) bricht diese Abfrage mit `permission
denied` ab, bevor RLS überhaupt greift, statt eine leere Ergebnismenge
  zu liefern. Ergänzt: `grant select ... to anon` auf beiden Tabellen -
  die weiterhin fehlende `anon`-Policy sorgt dafür, dass RLS trotzdem in
  jedem Fall null Zeilen liefert.
- Lokale Portkollision beim Aufsetzen: Windows hatte den benötigten
  Portbereich als dynamischen Ausschluss reserviert (vermutlich
  Hyper-V/WSL2, mehrere parallel laufende Supabase-Projekte auf diesem
  Rechner). Nur temporär für die lokalen Testläufe auf einen freien
  Portbereich ausgewichen; `supabase/config.toml` ist am Ende unverändert
  bis auf die gewünschte `schema_paths`-Ergänzung.

**Prüfung:** `npm run test:db` vor der Umsetzung rot (Tabelle fehlt, wie im
Auftrag erwartet), danach grün - `All tests successful.`, 32 Testdateien,
1105 Einzelprüfungen, davon 9 neu in `vinted_categories.sql`. Typen neu
erzeugt (`npx supabase gen types typescript --local`); `vinted_categories`
und `vinted_category_syncs` darin geprüft. Voller Bericht mit TDD-Nachweis:
`.superpowers/sdd/task-1-report.md`.

## 2026-09-06 – Codex – Primäre Admin-Akzente auf Logo-Gelb korrigiert

**Ergebnis:** Die primären Verwaltungsaktionen wie „Neuer Einkauf“ und
„Verkauf erfassen“ verwenden wieder das Logo-Gelb `#fcc601` mit dunkler,
kontraststarker Schrift. Das gilt in hellen und dunklen Admin-Ansichten. Die
aktiven Sidebar-Zustände und alle Demo-Badges verwenden nun dieselben
semantischen Marken-Token. Warnungen und Finanzstatus bleiben orange bzw.
ihren jeweiligen Statusfarben zugeordnet.

**Prüfung:** Die Änderung erfolgt ausschließlich im isolierten Worktree
`codex/polaris-primary-brand-yellow`. Playwright-Prüfungen für beide Themes,
Sidebar und Demo-Badge sowie Typecheck, Lint, Format, Angular-Suite und Build
wurden vor dem Push ausgeführt. Der unabhängige Gegencheck hat zusätzlich die
Dark-Theme-Absicherung des Druckbuttons, die explizite Prüfung von
„Verkauf erfassen“ und robuste Badge-Assertions eingefordert; diese Punkte sind
ergänzt und erneut per Playwright geprüft.

## 2026-09-06 – Codex – Sidebar nach Polaris-Dichte und Marken-Gelb ausgerichtet

**Ergebnis:** Die Verwaltungssidebar ist jetzt schmaler (224 statt 240 Pixel),
kompakter auf dem 4-Pixel-Raster aufgebaut und nutzt kleinere, ruhigere
Navigationsabstände. Der aktive Menüpunkt wird über einen eigenen
Navigationstoken mit dem Logo-Gelb hervorgehoben; die globale orange
Aktionsfarbe bleibt für Aktionen und Status erhalten. Das bisherige
Indigo-Hover-Schema und die fehleranfällige `group-[.font-semibold]`-Iconlogik
wurden entfernt.

**Grundlage:** Shopify empfiehlt für Admin-Navigation kurze, gut scannbare
Labels, konsistente Dichte und eine klare Unterscheidung zwischen inaktiven
und aktiven Icons. Die helle Navigation nutzt für WCAG-Kontrast eine dunklere
Goldausprägung, während die dunkle Navigation das Logo-Gelb direkt verwendet.

**Prüfung:** Die Änderung läuft ausschließlich im isolierten Worktree
`codex/polaris-sidebar-yellow`; eine gezielte Sidebar-E2E-Prüfung und die
betroffenen Angular-, Typ-, Lint-, Format- und Build-Prüfungen folgen vor dem
Push.

**Review-Nacharbeit:** Der unabhängige Gegencheck hat zusätzlich die
viewportgebundene Desktop-Sidebar, den gelben aktiven Zustand der mobilen
Navigation, die 44-Pixel-Touchflächen im mobilen Drawer und den
Kontrast des hellen OS-Badges eingefordert. Diese Punkte sind im selben
Branch ergänzt und werden erneut automatisiert geprüft.

## 2026-09-06 – Codex – Sortierauswahl und Tabellenzustände nachgeschärft

**Ergebnis:** Der unabhängige Gegencheck fand mehrere Nacharbeiten, die vor dem
Abschluss behoben wurden: Das Sortier-Untermenü ist jetzt ebenfalls
viewport-begrenzt und scrollbar, der Fokus landet beim Öffnen im Menü, und
Sortierfeld sowie Sortierrichtung werden als getrennte Listboxen ausgezeichnet.
Die Einkaufs-Header melden nun `aria-sort`; eine aktive Inventar-Auswahl gilt
als geänderte Ansicht; Sortierfeldbezeichnungen enthalten keine fest eingebaute
Richtung mehr.

**Prüfung:** Der responsive Playwright-Test prüft die horizontalen und
vertikalen Grenzen beider Overlays. Typecheck, Lint, gezielte Angular-Tests und
die drei Tabellen-E2E-Tests liefen erfolgreich. Die Arbeit erfolgte
ausschließlich im isolierten Worktree `codex/polaris-sort-controls`.

## 2026-09-06 – Codex – E2E-Selektor nach Tabellenaktion eindeutig gemacht

**Befund:** Der GitHub-Browser-Smoke meldete nach der Tabellenüberarbeitung
einen Strict-Mode-Fehler, weil Titel-Link und Icon-Aktion desselben Einkaufs
denselben zugänglichen Namen enthielten.

**Korrektur:** Der Navigationstest verwendet jetzt das eindeutige
`data-purchase-row`-Merkmal für den Demo-Einkauf. Die zwei bewusst vorhandenen
Bedienelemente bleiben unverändert.

**Prüfung:** Der Fehler wurde im CI-Job `Browser smoke` reproduziert und die
gezielte Korrektur lokal geprüft. Die Änderung erfolgt ausschließlich im
isolierten Worktree `codex/polaris-table-system`.

## 2026-09-06 – Codex – Inter als einzige Anwendungsschrift festgelegt

**Ergebnis:** Die globale Tailwind-Schriftvariable `font-mono` verweist jetzt
ebenfalls auf Inter. Dadurch nutzen auch bestehende Kennzahlen, Zahlen,
technische Werte, Tabellenzellen und Formulare dieselbe Schrift wie die übrige
Oberfläche. Die lokalen Font-Dateien enthalten nur noch Inter; ungenutzte
JetBrains-Mono- und Plus-Jakarta-Sans-Dateien wurden entfernt.

**Prüfung:** Der Typografie-E2E-Test prüft die sichtbare `font-mono`-Klasse,
die semantischen Elemente `code`, `pre`, `kbd` und `samp` sowie sichtbare
Text-Elemente auf den zentralen Verwaltungsrouten explizit auf Inter.
Typecheck, Lint, Prettier, Angular-Suite (470 bestanden, 5 übersprungen),
Produktionsbau sowie die 9 relevanten Playwright-Tests liefen erfolgreich. Die
Änderung wurde ausschließlich im isolierten Worktree
`codex/polaris-table-system` vorgenommen; fremde Branches und Worktrees wurden
nicht verändert.

## 2026-09-06 – Codex – Tabellen- und Spaltenmenü-Überarbeitung umgesetzt

**Ergebnis:** Das Spalten-/Sortiermenü ist jetzt ein viewport-begrenztes,
collision-aware Overlay mit eigener Sortierauswahl, Fokus-Rückgabe,
Tastatur-Reorder und passendem Animationsursprung für die Position ober- oder
unterhalb des Auslösers. Die Flipbase-orange Akzentfarbe bleibt erhalten.

**Betroffene Bereiche:** Verkäufe, Einkäufe, Inventar, Artikelstamm,
Buchhaltung und Betreiber-Beta-Bewerbungen verwenden die gemeinsame
Tabellenpräferenz- und Menülogik. Header und Zellen werden aus derselben
geordneten Spaltenliste gerendert; die Inventarfilter und Archivtabs sitzen in
der gemeinsamen Tabellen-Toolbar. Die Beta-Seite erhielt außerdem eine
semantische, responsive Tabelle mit Suche, Statusfiltern und Zuständen.

**Prüfung:** Typecheck, Lint, Prettier, Angular-Suite (470 bestanden, 5
übersprungen), Produktionsbau und die relevante Playwright-Suite (8/8)
erfolgreich. Der zusätzliche unabhängige Review fand keine
blockerrelevanten Befunde. Geprüft wurde ausschließlich im isolierten
Worktree `codex/polaris-table-system`; kein fremder Branch wurde verändert.

## 2026-09-06 – Codex – Tabellen- und Spaltenmenü-Audit gestartet

**Anlass:** Die Tabellen in Verkäufen, Einkäufen, Inventar, Artikelstamm und
Betreiber/Beta-Bewerbungen sollen ein einheitliches, Shopify-Polaris-nahes
Muster erhalten. Das bestehende Spaltenmenü wird in der Verkaufstabelle
abgeschnitten; weitere Bereiche verwenden abweichende Picker und Toolbars.

**Vorgehen:** Die Überarbeitung läuft ausschließlich im isolierten Worktree
`codex/polaris-table-system`. Die angehängten Screenshots dienen als visuelle
Referenz. Shopify-Dokumentation und drei getrennte Code-Audits werden gegen die
aktuelle Codebasis geprüft; nach der Umsetzung folgt eine zusätzliche
unabhängige Gegenprüfung des gesamten Diffs.

## 2026-09-06 – Claude – Zeitlimit der vollständigen Deckungsmessung angehoben

**Richtigstellung:** Im ersten Eintrag von heute steht, der Auftrag „Full
coverage" sei „nur mitabgebrochen" worden und habe keinen eigenen Fehler gehabt.
Das war falsch. Er lief in sein **eigenes** Zeitlimit von 15 Minuten.

**Beleg:** Drei gemessene Läufe der vollständigen Messung: `34020596308` 11:45
grün, `34015325180` 15:17 abgebrochen, `34021482927` 15:16 abgebrochen. Kein
einziger roter Test darin — die Messung liegt schlicht auf der Grenze und
kippt je nach Runner darüber.

**Korrektur:** Das Limit dieses einen Auftrags steht jetzt auf 25 Minuten. Es
bleibt bewusst endlich, damit ein echter Hänger nicht ewig läuft. Der überholte
Kommentar „rund neun Minuten" am täglichen Auftrag wurde mitgezogen.

**Prüfung:** `npm run test:workflow` (43 Tests) und der Prettier-Check der
Workflow-Datei grün. Ob 25 Minuten reichen, zeigt der nächste vollständige Lauf.

## 2026-09-06 – Claude – Nachlauf zum Nachtlauf: WebKit und das Aufräumen der Datenbankprobe

**Anlass:** Der von Hand ausgelöste Vollauf auf dem Zweig
(`34020596308`) brachte Firefox, Node-Stress und beide Deckungsmessungen grün
und legte dabei zwei Dinge frei, die vorher unter den früheren Fehlern lagen.

**Befunde:**

- **WebKit war schon vor dieser Arbeit rot**, nur unbemerkt: Der tägliche
  WebKit-Auftrag lief zuletzt am 05.09. um 04:34 grün, der Polaris-Umbau kam
  erst um 23:55 dazu. Acht Tests fielen aus, darunter zwei, die hier gar nicht
  angefasst wurden. Zwei Ursachen: `JetBrains Mono` liefert WebKit ohne
  Anführungszeichen, Chromium mit — die eben korrigierte Prüfung deckte nur
  `Inter` ab. Und WebKit blendet auf diesen Seiten eine klassische
  Bildlaufleiste ein; die Layoutprüfungen verglichen `scrollWidth` mit der
  eingestellten Fensterbreite und lagen dadurch um sechs Pixel daneben.
- **Die Nebenläufigkeitsprobe selbst ist grün** — im Protokoll steht
  „RPC-Concurrency-Harness grün". Der Lauf scheiterte erst danach beim
  Aufräumen: Der Verkauf schreibt Ereignisse ins Prüfprotokoll,
  `business_events.workspace_id` hängt mit `on delete restrict` am
  Arbeitsbereich, und der Auslöser
  `prevent_workspace_with_business_data_deletion` verbietet zusätzlich das
  Löschen von Arbeitsbereichen mit Geschäftsdaten. Das Skript stammt aus der
  Zeit davor.

**Korrektur:** Die Schriftprüfung stellt das Anführungszeichen für beide
Schriften frei. Die drei Layoutprüfungen messen jetzt den seitlichen Überlauf
(`scrollWidth - clientWidth`, erwartet null) statt der Gleichheit mit der
Fensterbreite — das ist genau die Absicht der Tests und unabhängig davon, ob
eine Engine eine Bildlaufleiste einblendet. Die Datenbankprobe räumt nur noch
die Geschäftsdaten ab und lässt Arbeitsbereich, Mitgliedschaft und Testnutzer
stehen; das Anlegen ist dafür wiederholbar (`on conflict do nothing`). Der
Schutz vor dem Löschen von Belegen bleibt unangetastet.

**Prüfung:** Lokal alle drei betroffenen Dateien in WebKit (11 Tests), Firefox
und Chromium (22 Tests) grün — dieselben acht Tests, die in der CI und lokal
unter WebKit fielen. Dazu `format:check`, `lint`, `typecheck` und der
Parser-Check des PowerShell-Skripts. Das Aufräumen der Datenbank ist lokal
weiterhin nicht nachstellbar; den Nachweis führt der nächste Lauf auf dem Zweig.

## 2026-09-06 – Claude – Nächtliche Vollprüfung wieder aussagekräftig gemacht

**Anlass:** Der wöchentliche Nachtlauf auf `master` war am 06.09.2026 zweimal rot
(Läufe `34012225615` und `34015325180`). Betroffen waren die Firefox-Rauchprobe
und die vollständige Datenbankprüfung. Die Wochenaufträge laufen nur sonntags,
deshalb fiel beides erst jetzt auf.

**Befunde:**

- `e2e/typography.spec.ts` prüfte die Schriftliste mit `/^Inter,/`. Chromium und
  WebKit liefern `Inter, …` ohne Anführungszeichen, Firefox `"Inter", …` mit.
  Dieselbe Schrift, nur eine andere Schreibweise der Engine — kein Fehler der
  Seite.
- `e2e/admin-layout.spec.ts` lud fünf Fensterbreiten mal vier Seiten in **einem**
  Test. Zwanzig Seitenaufrufe hintereinander sprengen in Firefox das
  30-Sekunden-Limit eines Tests; beim Abbruch war zudem nicht erkennbar, welche
  Breite klemmt.
- Die Nebenläufigkeitsprobe `inventory_double_sale.ps1` scheiterte auf dem
  Linux-Runner sofort mit „The parameter '-WindowStyle' is not supported for the
  cmdlet 'Start-Process' on this edition of PowerShell". Der Schalter existiert
  nur in der Windows-Ausgabe. Der Auftrag „Full coverage" wurde daraufhin nur
  mitabgebrochen, er hatte keinen eigenen Fehler. Die vielen
  `toomanyrequests`-Meldungen beim Hochfahren von Supabase waren ein
  Nebengeräusch — der Start ist trotzdem durchgelaufen.

**Korrektur:** Die Schriftprüfung lässt das Anführungszeichen ausdrücklich offen.
Die Layoutprüfung läuft als eine Prüfung je Breite, damit jede ihr eigenes
Zeitfenster hat und sich im Fehlerfall selbst benennt. Im Harness wird
`-WindowStyle Hidden` nur noch unter Windows gesetzt — dort verhindert es weiter
aufblitzende Konsolenfenster, unter Linux fällt es weg.

**Prüfung:** Vor der Korrektur schlug `typography.spec.ts` lokal in Firefox mit
genau der Meldung aus der CI fehl. Danach beide Dateien in Firefox (7 Tests) und
Chromium (7 Tests) grün; die lokale WebKit-Ausgabe unter Windows meldet an
denselben Stellen auch auf unverändertem Stand einen 6-Pixel-Unterschied durch
die Bildlaufleiste und taugt hier nicht als Signal. Dazu `npm run format:check`,
`npm run lint`, `npm run typecheck`, `npm run test:audit` und
`npm run test:workflow` grün, das PowerShell-Skript ohne Parserfehler und die
Aufrufform mit Auslassungstabelle ohne `-WindowStyle` in einer eigenen Probe
bestätigt. Der Linux-Lauf selbst ist lokal nicht nachstellbar (kein Docker,
keine Linux-PowerShell) — den Nachweis führt erst der Nachtlauf.

**Offen:** Fünf weitere Skripte unter `supabase/test-support/manual/` tragen
denselben Windows-Schalter. Sie laufen nicht in der CI und wurden bewusst nicht
mitgeändert.

## 2026-09-06 – Codex – E2E-Kompatibilität des Spaltenknopfs korrigiert

**Befund:** Der Browser-Smoke-Test blieb beim Spaltenmenü hängen, weil die
zugängliche Beschriftung des sichtbaren Knopfs nicht mehr dem bestehenden
E2E-Vertrag (`Spalten`) entsprach.

**Korrektur:** Die sichtbare Kurzbezeichnung bleibt als zugänglicher Name
erhalten; die ausführlichere Erklärung bleibt im Tooltip. Dadurch bleibt das
Bedienelement verständlich und bestehende Tastatur-/Screenreader-Abfragen
finden denselben Knopf wieder. Die E2E-Verträge wurden außerdem an die bewusst
semantische Radio-Gruppe des Einkaufstyps und die nun korrekt lokal eingebundene
JetBrains-Mono-Schrift angepasst.

## 2026-09-06 – Codex – Polaris-Nachlauf für Tabellen-, Formular- und Navigationszugänglichkeit

**Branch:** `codex/polaris-admin-ui`.

**Umsetzung:**

- Tabellenköpfe in Verkäufen, Buchhaltung, Artikelstamm und Einkaufsdetails mit `scope="col"`, beschreibenden Captions und Sortierzustand (`aria-sort`) ergänzt.
- Mobile Artikelkarten berücksichtigen jetzt die gewählten sichtbaren Spalten; icon-only Aktionen in der Buchhaltung haben eigene zugängliche Beschriftungen.
- Gemeinsame Selects erhalten wieder einen sichtbaren Polaris-nahen Fokus-Ring und sind über feste Trigger-IDs sauber mit den Formularlabels verbunden.
- Date-Picker mit eindeutigem Input-/Dialog-Ziel, `aria-expanded`/`aria-controls`, Roving-Tabindex, Pfeiltasten, Home/End, PageUp/PageDown, Enter, Escape und Fokus-Rückgabe erweitert; ungültige Kalendertage werden verworfen.
- Einkaufstypen und Erstattungsarten als zugängliche Radio-Gruppen ausgezeichnet; mobile Bottom-Navigation, Sidebar, Header- und Workspace-Dropdowns semantisch verknüpft.
- Admin-Inhaltsbereich fluid belassen, damit breite Datenansichten weiterhin den verfügbaren Bildschirm ausnutzen; die Polaris-nahe Tabellenkopfdichte bleibt erhalten.

**Prüfung:** `npm run typecheck`, `npm run lint`, `npm run test:angular` (466 Tests erfolgreich, 5 übersprungen), gezielte Date-Picker-/Shared-Component-Tests (5 erfolgreich), `npm run build`, gezielter Prettier-Check und `git diff --check`. Zusätzlich Browser-Check auf `/sales` und `/purchases/new` inklusive Spaltenmenü, Date-Picker und Pfeiltasten-Navigation erfolgreich.

## 2026-09-06 – Codex – Polaris-nahe Tabellen- und Navigationsoberfläche umgesetzt

**Anlass:** Die wichtigsten Verwaltungsflächen sollen näher an Shopify-Admin/Polaris liegen, ohne Flipbase-Orange, eigene Marke oder eigene Icons aufzugeben.

**Branch:** `codex/polaris-admin-ui`.

**Umsetzung:**

- Sales-Tabelle auf ein einheitliches Spaltenmenü mit Sortierung, Sichtbarkeit, Reihenfolge, gesperrten Spalten und Tastaturbedienung konsolidiert; den doppelten alten Picker aus der Verkaufsseite entfernt.
- Popover mit eindeutiger ARIA-Verknüpfung, Fokus auf das Sortierfeld, Fokus-Rückgabe beim Schließen und eigener dezenter Einblendung (`opacity`, leichte Verschiebung und Skalierung, 160 ms) ergänzt.
- Tabellenköpfe, Zeilen-Hover, Formulare, Buttons, Karten und Sidebar auf ruhigere Polaris-nahe Größen, Abstände, Ränder und Zustände normalisiert. Verläufe und undefinierte UI-Tokens in den betroffenen Flächen entfernt.
- Flipbase-Orange als gezielten Primärakzent beibehalten; JetBrains Mono lokal für Code-/Monospace-Inhalte eingebunden.

**Prüfung:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:angular` (466 Tests erfolgreich, 5 übersprungen), gezielte Shared-Component-Tests (16 Tests erfolgreich), `npm run build` und visueller Check der Sales-Seite inklusive Popover-Animation erfolgreich.

## 2026-09-06 – Codex – Polaris-Lizenz und Flipbase-Markenakzent geprüft

**Anlass:** Prüfung, ob Flipbase Polaris kostenlos und ohne weitere Einschränkungen verwenden kann, sowie Einordnung des gewünschten Flipbase-Oranges.

**Befund:** Das aktuelle `LICENSE.md` der installierten Pakete `@shopify/polaris-tokens` und `@shopify/polaris-icons` gewährt die Nutzung zwar kostenfrei, enthält aber eine zusätzliche Einschränkung: Die Rechte gelten für Anwendungen, die Shopify-Software oder -Dienste integrieren bzw. mit ihnen zusammenarbeiten. Für eigenständige Anwendungen ohne direkte Einbettung in Shopify wird eine visuell deutlich unterschiedliche Gestaltung verlangt. Eine pauschale Aussage „kostenlos und uneingeschränkt“ ist daher nicht belastbar.

**Gestaltung:** Das Flipbase-Orange kann als eigener Markenakzent erhalten bleiben. Polaris sollte weiterhin die Struktur, Abstände, Typografie, Komponentenlogik und Zustände vorgeben; Orange wird gezielt für Marke, primäre Aktionen und passende Statusrollen verwendet und nicht als Ersatz für die gesamte neutrale Farbpalette.

**Abgrenzung:** Keine Anwendungscodeänderung. Für die konkrete Veröffentlichung und Lizenzbewertung ist bei einer eigenständigen Flipbase-Anwendung eine rechtliche Prüfung erforderlich.

## 2026-09-05 – Codex – Shopify-Docs-/Polaris-Abgleich und UI-Prüfung

**Auftrag:** Die aktuelle Oberfläche von `shopify.dev/docs` sowie die zugrunde liegenden Shopify-Polaris-Grundsätze mit dem Projektstand vergleichen und die zuletzt eingetragene UI-Standardisierung fachlich bewerten.

**Recherche:** Die öffentlich ausgelieferte Shopify-Dokumentationsseite wurde direkt im Browser und über die offiziellen Shopify-Dokumente geprüft. Erfasst wurden Schriftfamilien, Größenhierarchie, Abstände, Responsive-Layout, CSS-Aufteilung, Farben, Komponentenrollen und Tabellen-/Popover-Verhalten. Im Projekt wurden `package.json`, `src/styles.css`, die lokalen Fonts, der Shell-Aufbau, die neuen Shared Components und die betroffenen Tabellen-Templates geprüft.

**Wesentliche Befunde:**

- `shopify.dev/docs` nutzt Inter für die Oberfläche und JetBrains Mono für Code, eine 4-Pixel-basierte Abstandsskala, CSS-Module/Chunks pro Oberfläche sowie eine klare Hierarchie ab 13 Pixeln für normale Inhalte und Interaktionen.
- Das Projekt hat Polaris-Tokens und -Icons installiert, verwendet sie im Anwendungscode aber nicht. Die sichtbare Oberfläche basiert weiterhin auf eigenen `fb-*`-Tokens, `linear-*`-Klassen und Lucide-Icons.
- Die lokale Monospace-Konfiguration zeigt auf Inter (`--font-mono: var(--font-sans)`); JetBrains Mono ist nicht lokal eingebunden.
- Mehrere aktuelle Texte und interaktive Elemente sind 9–12 Pixel groß. Das unterschreitet die von Shopify dokumentierte Mindestgröße für normale Inhalte und Interaktionen.
- Der aktuelle Primärakzent ist Orange, während die moderne Polaris-Admin-Grundfarbe neutral dunkel ist. Abgerundete XL/2XL-Flächen, Farbverläufe und starke Schatten weichen ebenfalls vom Polaris-/Docs-Eindruck ab.
- Im neuen Spaltenmenü werden nicht definierte Variablen/Klassen (`--fb-bg-card`, `text-fb-text`) verwendet. Im Verkaufs-Template sind zugleich `app-table-column-picker` und `app-table-column-menu` enthalten; im laufenden UI war nur der Picker sichtbar.
- Das Spaltenmenü stellt Fokus-Rückgabe bei Escape bereit, aber nicht beim Click-Outside; außerdem fehlen am Dialog eine belastbare Fokusinitialisierung und eine vollständige Beziehung zwischen Trigger und Dialog. Die Button-Abstraktion erzwingt für Icon-only-Nutzung kein zugängliches Label.

**Abgrenzung:** Keine Anwendungscodeänderung. Nur dieser Protokolleintrag wurde ergänzt.

## 2026-09-05 – Antigravity – Shopify Polaris IndexTable & Dynamische Spaltenverwaltung (Spaltenmenü-Popover)

**Stand:** Zweig `feature/ui-polaris-standardization`. Tabellenmodernisierung nach dem Shopify Polaris IndexTable-Standard mit integrierten Filtern und dem 3-Balken `[ ||| ]` Spalten- und Sortier-Popover.
**Was:**

- Kerninfrastruktur für Tabelleneinstellungen (`TablePreferencesService` & `src/app/core/config/table-defaults.config.ts`):
  - Reaktive Signale für Spaltensichtbarkeit, Reihenfolge und Sortierung mit automatischer `localStorage`-Persistenz je Arbeitsbereich.
  - Standardkonfigurationen für die Kern-Tabellen (`sales`, `inventory`, `purchases`, `accounting`) mit Schema-Drift-Schutz.
  - Umfassende Unit-Tests in `table-preferences.service.angular.spec.ts` (8/8 bestanden).
- Shared Polaris Spaltenmenü-Komponente (`TableColumnMenuComponent`, `app-table-column-menu`):
  - Popover-Menü mit dem charakteristischen 3-Balken-Icon `[ ||| ]` nach Shopify-Vorbild.
  - Sortierbereich mit Richtungsumkehr (`asc`/`desc`) und Dropdown zur Auswahl des aktiven Sortierfelds.
  - Spaltenliste mit Sperrsymbolen für feste Spalten, Tastatur- und Drag-and-Drop-Reihenfolge sowie Umschalten der Sichtbarkeit per Augen-Icon (`Eye`/`EyeOff`).
  - Barrierefreiheit (WCAG AA): Tastatursteuerung (ESC schließt, Click-Outside-Erkennung, ARIA-Expanded/Controls).
  - Unit-Tests in `table-column-menu.component.angular.spec.ts` (7/7 bestanden).
- Modernisierung der Kern-Tabellen:
  - `SalesComponent` (Verkäufe): IndexTable-Toolbar mit Filter-Pills, Schnellsuche und Spalten-Popover. Dynamische Ausblendung von 8 optionalen Spalten (`quantity`, `platform`, `sale_date`, `cost_of_goods_sold`, `selling_costs`, `profit`, `margin`, `holding_days`) und dynamische Sortierung.
  - `StockPositionListComponent` (Inventar): Spalten-Popover im Kopfbereich, dynamische Spalteneinblendung für Zustand, Bestand, Status, Herkunft, EK, Bestandswert und Verkaufswert sowie dynamischer `colspan` für aufgeklappte Chargen/Lots.
  - `AccountingComponent` (Buchhaltung): Spalten-Popover in der Transaktions-Toolbar, dynamische Spalten für Verwendungszweck, Betrag, Zuordnung und Status sowie dynamische Sortierung der Bankumsätze.
    **Prüfung:**
- `npm run typecheck`: Erfolgreich (0 Fehler).
- `npm run lint`: Erfolgreich (0 Fehler, 0 Warnungen).
- `npm run test:angular`: 44 Testdateien, 418 Tests erfolgreich (0 Fehler).
- `npm run build`: Produktionsbau erfolgreich (0 Fehler, 0 Warnungen).

## 2026-09-05 – Antigravity – UI-Standardisierung & Shared Components nach Shopify Polaris

**Stand:** Zweig `feature/ui-polaris-standardization`. Token-basierte Standardisierung und Ausbau der Shared-Komponenten-Bibliothek für eine einheitliche UI nach Vorbild von Shopify Polaris.
**Was:**

- `@shopify/polaris-tokens` und `@shopify/polaris-icons` als Entwicklungspakete installiert.
- Neue barrierefreie Shared-Komponenten gemäß Angular 22 & Tailwind CSS erstellt:
  - `ButtonComponent` (`app-button`): Varianten (primary, primary-dark, secondary, destructive, ghost, plain), Größen, Ladezustand, Icon-Slotting, Tastaturbedienbarkeit.
  - `BadgeComponent` (`app-badge`): Polaris-Töne (neutral, info, success, caution, critical), Punkt-Indikator, Monospace-/Großbuchstaben-Modi.
  - `CardComponent` (`app-card`): Container mit Header, Action-Slots, konfigurierbaren Polstern und Footer. Landmark-Kollisionen behoben (`data-card-header` statt redundanten `header`-Tags).
  - `PageHeaderComponent` (`app-page-header`): Titel, Untertitel, Breadcrumb-/Zurück-Navigation, Badges und Aktionsleiste.
  - `TextFieldComponent` (`app-text-field`): ControlValueAccessor für reaktive Formulare, Präfix-/Suffix-Slots, Hilfetexte, Validierungsanzeige und Mehrzeilenmodus.
  - `TwoColumnLayoutComponent` (`app-two-column-layout`): 2/3 operative Hauptspalte und 1/3 Sidebar-Metadatenbereich (sowie 7-5 Ratio) mit responsivem Umbruch.
  - `ModalShellComponent` (`app-modal-shell`): Barrierefreier modaler Container mit Fokus-Falle, Header, Schließen-Schaltfläche und Footer.
- Subagenten-Audit & Qualitätssicherung:
  - Projektions-Selektor in `TwoColumnLayoutComponent` erweitert (`[main], [main-content]` und `[sidebar], [sidebar-content]`).
  - Barrierefreiheit (WCAG AA): Dekorative Icons mit `aria-hidden="true"` versehen, `aria-label` auf TextFields und DatePicker ergänzt, Label-Verknüpfung in Verkaufs-Modal korrigiert.
  - `DatePickerComponent`: Template auf kanonische englische Bezeichner umgestellt, ARIA-Attribute für Tage und Monate hinzugefügt.
- Feature-Seiten modernisiert:
  - `PurchasesComponent` & `PurchaseDetailComponent`: Vollständige Umstellung auf Polaris Page-Header, Two-Column-Layout (2/3 Positionen & Nebenkosten, 1/3 Einkaufsdetails & Sendungsverfolgung), Cards, Badges und Buttons.
  - `InventoryComponent` & `ItemDetailComponent`: Umstellung auf `PageHeaderComponent`, `TwoColumnLayoutComponent` (7-5 Ratio), `BadgeComponent` und `CardComponent`.
  - `SalesComponent`: Integration von `PageHeaderComponent`, `BadgeComponent` und `ButtonComponent`.
    **Prüfung:**
- `npm run typecheck`: Erfolgreich ohne Fehler (0 Errors).
- `npm run lint`: Erfolgreich ohne Fehler oder Warnungen (0 Errors, 0 Warnings).
- `npm run test:angular`: Alle 42 Testdateien (401 Tests) einschließlich struktureller AXE-Checks erfolgreich bestanden.
- `npm run build`: Erfolgreicher Produktionsbau mit 0 Fehlern und 0 Warnungen.

## 2026-09-05 – Codex – Veröffentlichungsprüfung für Erfassungspaket abgeschlossen

**Auftrag:** Der Nutzer beauftragt Push und Merge des bereits umgesetzten Einkaufs-/Inventarpakets mit Chronik, Archivierung sowie EAN-/CSV-Erfassung.

**Korrekturen vor Veröffentlichung:** Die direkte Sales-Deep-Link-Testumgebung erhält den optionalen Sitzungsstatus-Hook und importiert die im Tabellen-Template verwendete Kostenanzeige explizit. Lokale `.superpowers`-Planartefakte werden von ESLint ausgeschlossen, damit generierte Fremdtypen den Anwendungslauf nicht blockieren.

**Prüfung:** `npm run verify` erfolgreich mit Exitcode 0: Prettier, ESLint, Typprüfung, Workflow-Verträge, Test-Audit, 994 Node-, 135 DOM- und 409 Angular-Tests, Landing-Verträge und Produktionsbau. Der Branch ist vor dem Push sauber zu committen; PR- und Produktionsprüfungen bleiben der nächste Freigabeschritt.

## 2026-09-05 – Codex – EAN-/GTIN-Erfassung und CSV-Vorschau lokal abgeschlossen

**Auftrag:** Offene Erfassungspunkte des Verwaltungsumbaus umsetzen, ohne Produktion zu veröffentlichen. EAN/GTIN soll optional und als Zeichenkette erhalten bleiben; Kamera, eigener Artikelstamm und CSV dürfen keine ungeprüften Preise oder Bestände erzeugen.

**Umsetzung:** GTIN-8/12/13/14 werden mit Prüfziffer validiert und führende Nullen bleiben erhalten. Die Kamera nutzt zuerst `BarcodeDetector` und bei fehlender Browserunterstützung einen ZXing-Fallback; Start/Stop-Rennen, verspätete Decoderantworten und Mehrfachauslösung sind abgesichert. Ein Barcode findet nur einen passenden Artikel im aktuellen Workspace-Artikelstamm; unbekannte Codes werden nicht mit erfundenen Produkt- oder Preisangaben angereichert. Einkaufspositionen speichern EAN-Snapshots über einen geschützten RPC; die Datenbank validiert neue Werte und übernimmt sie beim Wareneingang in den Bestand. Katalog- und Einkaufs-CSV werden vor dem Speichern geprüft und angezeigt. Der Katalogimport legt nur Artikelstammdaten an; der Einkaufsimport erzeugt normale Mengenpositionen bei eindeutiger Artikelstamm-Zuordnung und sonst nachvollziehbare Einzelpositionen, ohne die bestehende Kostenlogik zu umgehen. CSV unterstützt UTF-8-BOM, Komma/Semikolon, Anführungszeichen, Dezimalkomma und klare Fehlermeldungen.

**Prüfung:** `npm run typecheck`, Produktionsbau, gezielte Angular-Prüfungen (55 Tests), GTIN-/CSV-Prüfungen (5 Tests) und geänderte-Dateien-ESLint erfolgreich. Migration lokal in Docker angewendet; EAN-Validierung, führende Nullen und automatische Übernahme vom Einkaufsbeleg in den Bestand transaktional geprüft. Vollständiges Repository-Lint bleibt wegen bereits vorhandener generierter `.superpowers`-Typdateien rot; der DB-Gesamtlauf meldet weiterhin, dass die getrennten Chronik-/Archiv-Fixtures in dessen Testdatenbank nicht installiert sind. Keine unabhängige Agentenprüfung möglich, da alle verfügbaren Agenten wegen des Nutzungslimits abgewiesen wurden. Kein Push, PR, Merge oder Deployment.

## 2026-09-05 – Codex – Verbleibende Verwaltungsabläufe umsetzen

**Auftrag:** Nutzer beauftragt sämtliche restlichen freigegebenen Punkte: gemeinsame Chronik mit Kommentaren, Archivierung und persönliche Tabellenspalten, optionale EAN/Kamera und CSV-Vorschau/Import. Fortsetzung im eigenen sauberen Worktree auf `feat/purchase-entry-page`, ohne Veröffentlichung. Vorhandene Buchungs- und Exportverträge erhalten; neue Rechte/Migrationen gesondert testen. Umsetzung paketweise mit Subagent-Driven-Development, Datenzugriffe nach Supabase-Skill. Details in den jeweiligen Plänen; keine erneute Entwurfsfreigabe für bereits bestätigte Richtung nötig.

**Zwischenprüfung Chronik:** Lokale Konto-QA auf 127.0.0.1:4200 mit lokaler Supabase-Instanz: Kommentar am abgeschlossenen Einkauf gespeichert, Formular geleert, nach Reload genau einmal sichtbar neben Buchungsereignis; Einkaufszeile unverändert. Kommentar in Verkaufschronik ebenfalls nach Schließen/Reload wieder sichtbar. 390/1440/2560 px ohne seitlichen Überlauf, Chronik-Axe WCAG A/AA ohne Befund, keine Laufzeitfehler. Bestehender Kontrastfehler am Einkaufstyp-Badge außerhalb Chronik für Folgepaket aufgenommen. Browser plugin not available, daher vorhandenes Playwright. Noch kein Gesamtabschluss/keine Veröffentlichung.

**Chronik-Aufgabenabnahme:** `2ce6bf4` implementiert, `a430c3e` ergänzt nach unabhängiger Prüfung echte Integrationstests für Einkauf/Verkauf und alten Bestand-/Exportpfad. Gezielte Nachprüfung akzeptiert, keine neuen wichtigen Befunde. 232 Datenbankprüfungen einschließlich Retention/Unveränderbarkeit/Audit-Export grün; neue Migration lokal isoliert erzeugt und geprüft, keine fremden Migrationseinträge repariert. Abschließende Gesamtprüfung berücksichtigt zwei kleine offene Punkte: SQL/JS-Unicode-Leerraum und bestehende Runner-Farbwarnung. Archiv/Spalten und Barcode/CSV laufen anschließend weiter.

**Zwischenprüfung Archiv/Spalten:** Lokale Konto-QA mit zwei echten Einzelstücken à 10 €, davon eines für 20 € verkauft: Archivieren/Wiederherstellen behält Verkaufszeile und Kosten unverändert. Nach erneutem Archivieren und echter lokaler Retoure mit Bestandsrücknahme erscheint das Stück trotz historischer Archiv-Metadaten aktiv. Persönlich ausgeblendete Zustandsspalte bleibt nach Reload verborgen. Hauptbereiche von Inventar und Einkaufsdetail bestehen Axe; blasser Verkaufsbadge zuvor mit Verhältnis 1,13:1 gefunden und durch ursprünglichen Implementierer korrigiert, identischer Test danach grün. Keine Laufzeitfehler, mobile Einkaufsansicht ohne seitlichen Überlauf. Aufgabenreview noch ausstehend.

## 2026-09-05 – Codex – Eigene Einkaufs-Erfassungsseite umsetzen

**Auftrag:** Fortsetzung des freigegebenen Pakets 2 auf `feat/purchase-entry-page`, eigener vorhandener Worktree. Neue Einkäufe auf eigener Seite; vorhandenes Formular und Speicherprüfungen gemeinsam weiterverwenden. Kostenübersicht rechts, direkte Artikelerfassung, Schutz ungespeicherter Eingaben. Bestehende Detailbearbeitung und Flohmarkt-Schnellerfassung erhalten; keine Datenbank- oder Produktionsänderung.
**Vorprüfung:** 41 bestehende Angular-Tests für Einkaufsformular/Artikeleditor grün. Bestehende create_purchase/finalize_purchase_costing-Verträge geprüft; Supabase-Changelog und offizielle RPC-Dokumentation ohne erforderliche Änderung für diesen UI-Umbau. Planung und Umsetzung mit Subagent-Driven-Development; unabhängige Reviews und lokale Browser-/Kontoprüfung vorgesehen. Browser plugin not available, daher vorhandenes Playwright.

**Umsetzung:** Neue Route `/purchases/new` vor der Detailroute. Ein gemeinsames Formular besitzt weiterhin die bestehende Speicher- und Wiederholungslogik; neue Erfassung als Seite mit Kostenübersicht rechts, vorhandene Bearbeitung weiterhin als Dialog. Artikelauswahl und direkte Neuanlage bleiben im Einkauf, ohne verschachteltes Formular. Reine Typwechsel und Eingaben in der Artikelschnellerfassung werden beim Verlassen berücksichtigt; laufende Speicherung wird geschützt. Keine Datenbank-, Abhängigkeits-, Shop- oder Landingpageänderung.

**Prüfung und Korrekturen:** Unabhängige Aufgaben- und Abschlussprüfung fanden fehlendes Seitenlayout, unbenannten Schließen-Button, doppelte Navigation, unvollständigen Verlassenschutz und verrutschte Dialogzentrierung; diese wurden zur Korrektur zurückgegeben. Lokale Konto-QA bestätigt normalen Einkauf mit 2 × 10 € plus 5 € Versand, endgültig gespeichert mit 25 €; leere Mystery Box als Entwurf mit 100 € plus 10 € Versand, nach erneutem Öffnen korrekt 110 €. Der rohe Aufteilungswert eines Entwurfs ist nicht dessen angezeigte Kostensumme. Früherer QA-Abbruch durch fehlendes Warten auf den zweiten Seitenwechsel korrigiert. Zehn Browseransichten von 390 bis 2560 px in Hell/Dunkel ohne seitlichen Überlauf, zwei Axe-Prüfungen des Hauptinhalts ohne Befund, keine Laufzeitfehler. Dialog zusätzlich geöffnet, Werte und Zentrierung geprüft. Testdaten ausschließlich in lokaler Supabase-Instanz; lokale QA-Konten bleiben erhalten. Keine echte Mobilgeräte- oder Mehrbrowserprüfung.

**Abgrenzung:** Chronik mit Kommentaren, Archivierungsablauf, persönliche Tabellenspalten sowie EAN/Kamera/CSV sind weiterhin spätere Pakete. Noch keine Veröffentlichung dieses Einkaufsseiten-Pakets.

**Abschluss:** Umsetzung bis `02756a4`, erneute unabhängige Schlussprüfung ohne offene blockierende Befunde. Alle genannten Korrekturen einschließlich Dark-Kontrast umgesetzt; keine ungeprüften Abweichungen akzeptiert. Finale vollständige Tests: 989 Node-, 135 DOM- und 381 Angular-Tests erfolgreich, fünf bestehende Angular-Tests übersprungen. Fünf gezielte Chromium-Tests und Produktionsbau erfolgreich. Bestehende Runner-Warnung zu gleichzeitigem NO_COLOR/FORCE_COLOR unverändert. Lokaler Zweig bleibt erhalten; kein Push/PR/Deployment in diesem Auftrag. Aufräumen des exakt geprüften eigenen temporären Review-Ordners wurde von der Ausführungsrichtlinie blockiert; nicht umgangen, Unterlagen bleiben erhalten. Fremde Arbeitsstände unverändert.

> > > > > > > origin/master

## 2026-09-05 – Codex – Admin-Einstellungen veröffentlichen

**Auftrag:** Nutzer autorisiert Push und Merge von `feat/admin-preferences`. Aktuellen `origin/master` konfliktfrei in den eigenen Zweig übernommen; keine fremden Arbeitskopien verändert. Keine Datenbank- oder Abhängigkeitsänderung. Bereits erfolgte unabhängige Reviews samt Korrekturen bleiben dokumentiert.
**Freigabeweg:** Vollständiges `npm run verify`, englischer PR, grüne Pflichtprüfungen, Merge-Commit und Produktionslauf einschließlich öffentlicher Commit-Prüfung. Vorheriger Produktionsstand `2ac3950e294e8f7616515cfa205d9f908581c216`. Bei fehlgeschlagenem Healthcheck, falschem ausgeliefertem Commit oder fehlenden Frontend-Dateien keine erfolgreiche Veröffentlichung melden; Fehler untersuchen und gegebenenfalls kontrollierte Rücknahme auf den vorherigen Stand abstimmen. Keine Prüfungen umgehen.

**Abschluss:** `npm run verify` erfolgreich (Exitcode 0). PR #27 nach erfolgreichem PR-Lauf `33977344122` per Merge-Commit `98e117589cb6597e5fc196d86d47f3d785271cc2` integriert. Produktionslauf `33977621037` erfolgreich: PR-Prüfungen wiederverwendet, Image-Smoke und Veröffentlichung erfolgreich, Deployment einschließlich öffentlicher Prüfung erfolgreich. Zusätzliche lokale Abfrage von Startseite, Healthcheck und Deployment-Metadaten bestätigt genau diesen öffentlich ausgelieferten Commit. Abschlussnachweis nur lokal gespeichert, kein zweiter Produktionslauf dafür ausgelöst.

## 2026-09-05 – Codex – Admin-Akzente und persönliche Filter lokal abgeschlossen

**Stand:** `feat/admin-preferences`, Implementierung bis `a3b0d27`; nicht gepusht oder veröffentlicht. Paket 1 vollständig umgesetzt. Einkaufsseite, gemeinsame Chronik, Archivierungsablauf und EAN-Erfassung gehören zu späteren Paketen.
**Abschlussprüfung:** Finale vollständige `npm test`-Suite: Node 989, DOM 135, Angular 372 bestanden, fünf bestehende Angular-Tests übersprungen. Produktionsbau erfolgreich. Acht gezielte Chromium-Tests für Akzente, Dark-Navigation, responsive Breiten, Dashboard-Filter und Chartinteraktion erfolgreich. Bestehende Runner-Warnung zu gleichzeitigem NO_COLOR/FORCE_COLOR unverändert. Lokale Konto-QA mit zwei getrennten Browserkontexten bestätigte Speicherung, Neuladen, Erhalt fremder Metadaten und einer Plattform ohne Verkäufe; keine Laufzeitfehler. 24 Ansichten bei 390/1440/2560px in Hell/Dunkel ohne Seitenüberlauf; acht Axe-Prüfungen der Hauptinhalte ohne Befund. Keine echten Geräte oder anderen Browser-Engines geprüft.
**Reviews:** Einzelreviews freigegeben. Abschlussreview fand dunkle Schrift auf brauner Aktionsfläche (2,83:1) und einen rekursiven Speicherneustart bei Abmeldung vor dem Auth-Effekt. Beide mit roten Regressionstests reproduziert, korrigiert und im gezielten Abschlussreview freigegeben. Betroffene Aktionsflächen sind nun hellgelb mit dunkler Schrift; die Warteschlange startet nur im weiterhin gültigen Benutzerkontext erneut.
**Planentscheidungen:** Zusätzlich zum knappen Dateiverzeichnis Dashboard-HTML für den geforderten Speicherfehlerhinweis und vorhandene Komponententests für die neue Zustandsquelle angepasst. Falls diese Erweiterungen unnötig wären, beträfe die Rücknahme nur Template bzw. Tests; keine Datenmigration. Keine weiteren abweichenden Entscheidungen oder verworfenen Reviewbefunde.
**Lokale Prüfartefakte:** Screenshots und Testprotokolle unter `C:/Users/Grisc/AppData/Local/Temp/`; zwei klar benannte lokale QA-Konten erzeugt, keine Produktionskonten verändert. Das Aufräumen temporärer Agentenbriefings und Reviewpakete wurde von der Ausführungsrichtlinie abgewiesen; sie bleiben im ignorierten Planordner erhalten. Arbeitszweig und Code bleiben ebenfalls erhalten. Vor einem später autorisierten Push ist `npm run verify` erforderlich.

## 2026-09-05 – Codex – Persönliche Dashboard-Filter gespeichert

**Art:** UI- und Auth-Metadaten-Umsetzung im Zweig `feat/admin-preferences`, Task 2.
**Was:** Dashboard-Zeitraum und Plattform starten standardmäßig mit dem laufenden Jahr und bleiben im Demo-Modus lokal sowie bei angemeldeten Konten in einem eigenen Auth-Metadatenfeld erhalten. Schreibvorgänge laufen nacheinander und fassen schnelle Zwischenstände zusammen; Konto- und Abmeldewechsel schützen vor verspäteten Antworten. Unbekannte gespeicherte Plattformen bleiben auswählbar und zeigen null Treffer. Metadaten dienen nicht der Rechteprüfung; keine Datenbank-, RLS- oder Abhängigkeitsänderung.
**Prüfung:** Parser, Service und Dashboard-Integration testgetrieben mit gezielten roten und grünen Läufen; Demo-Browsertest für Navigation und Neuladen erfolgreich. Lokale Supabase-QA mit einem Testkonto bestätigte Speicherung, Erhalt fremder Metadaten, Neuladen und eine zweite getrennte Browsersitzung ohne Seitenfehler. Produktionskonto und Deployment unberührt.

## 2026-09-05 – Codex – Helle Admin-Akzente an Markenfarben angeglichen

**Art:** UI-Umsetzung im Zweig `feat/admin-preferences`, Task 1.
**Was:** Nur die helle `.fb-admin`-Palette verwendet nun Orange/Gelb für Primäraktionen und einen dunklen Braunton für Textakzente und Fokus. Aktive Sidebarflächen nutzen den dezenten Markenakzent mit dunklem Text und Icon. Dunkles Admin-Design, Shop, Anmeldung, Landingpage sowie Diagramm- und Statusbedeutungen wurden nicht verändert. Zwei vorhandene Kombinationen aus orange umgebogenem Indigo-Hintergrund und weißer Schrift erhalten im hellen Admin die dunkle Akzentschrift.
**Prüfung:** Neuer Playwright-Test schlug zunächst mit Weiß statt `rgb(26, 26, 26)` fehl und lief nach Umsetzung grün. Ein Review fand danach die unbeabsichtigt entfernte aktive Dark-Sidebarfläche; eigener Regressionstest zunächst rot bei transparentem Hintergrund, nach Wiederherstellung der vorherigen Klassen und des dunklen Markenrahmens grün. Zusammen mit den Admin-Layouttests 4/4 Chromium-Tests erfolgreich; Axe WCAG 2/2.1 A/AA auf `/purchases` ohne Befund; gezielte Prettier-/ESLint-Prüfung und Produktionsbau erfolgreich. Keine echte Geräte- oder Mehrbrowserprüfung in dieser Sitzung.

## 2026-09-05 – Codex – Umsetzung in eigenständige Pakete aufgeteilt

**Art:** Umsetzungsplanung nach Nutzerfreigabe, noch keine Funktionsänderung.
**Dokumente:** `docs/superpowers/specs/2026-09-05-admin-workflow-refresh.md` hält die freigegebene Gesamtrichtung fest; `docs/superpowers/plans/2026-09-05-admin-preferences.md` beschreibt das erste eigenständig prüfbare Paket (gelbe Akzente, persönliche Dashboard-Filter). Weitere Pakete: Einkaufsseite, gemeinsame Chronik, Archivierung/Tabellenspalten, EAN/Import.
**Entscheidung:** Persönliche Filter als nicht sicherheitsrelevante Auth-Metadaten, Demo lokal; keine neuen Tabellen für Paket 1. Zustandswechsel und fehlgeschlagene Speicherung ausdrücklich testen. Chronik benötigt eigene Prüfung bestehender Ereignis-/Kommentarrechte und ist noch nicht implementiert. Planungsskill verlangt Auswahl der Ausführungsform vor Planabarbeitung; vorhandene Arbeitskopie und fremde Änderungen erhalten.

## 2026-09-05 – Codex – EAN-Kameraerfassung und Produktdatenquellen geprüft

**Art:** Technische Auskunft / Recherche, keine Implementierung.
**Befund:** BarcodeScannerComponent nutzt ausschließlich nativen BarcodeDetector ohne Decoder-Fallback; Browserunterstützung eingeschränkt. BarcodeLookupService enthält fünf feste Beispieldatensätze mit Schätzpreisen und fragt danach Open Food Facts ab; keine umfassende allgemeine Produktdatenbank. Vorschlag: optionales EAN/GTIN-Feld, manuelle Eingabe und Kamera, Format-/Prüfzifferprüfung, eigene Artikelsuche vor optionaler externer Datenanreicherung, keine automatische Neuanlage oder ungeprüfte Preisübernahme. GS1 bietet Identitäts-/Basisdaten; API-Zugang über lokale GS1-Organisation abklären. Scanner-Bibliothek und Datenanbieter sind getrennte Entscheidungen, keine Abhängigkeit installiert.
**Quellen:** https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector, https://github.com/zxing-js/browser, https://www.gs1.org/services/verified-by-gs1, https://openfoodfacts.github.io/openfoodfacts-server/api/.

## 2026-09-05 – Codex – Einzelstücke archivieren und Chronik erklären

**Art:** Nutzerfrage / Entwurf, keine Funktionsänderung.
**Was:** Für verkaufte Einzelstücke Archivierung statt alltäglicher Anzeige vorgeschlagen, ohne Einkauf, Verkauf und Bestandsbewegungen zu entfernen. Nachkaufbare Artikel können bei null Bestand aktiv bleiben. Produktbeschreibung und tatsächlicher Bestand unterscheiden; Neuanlage darf keinen unbelegten Bestand erzeugen. Chronik als lesbare Ansicht belegter Änderungsereignisse, nicht als automatische Rechtskonformitätsgarantie. CSV-Import mit Vorschau/Prüfung und Barcode-Suche als spätere Erfassungshilfen aufnehmen; unbekannter Barcode liefert nicht automatisch verlässliche Produktdaten.
**Quellen:** https://help.shopify.com/de/manual/products/add-update-products sowie §§ 146/147 AO. Bestehender Code enthält bereits `archived` als Artikelstatus; keine Aussage getroffen, dass der gewünschte vollständige Archivierungsablauf bereits umgesetzt sei.

## 2026-09-05 – Codex – Akzentfarbe, persönliche Ansichten und Einkaufsablauf eingegrenzt

**Art:** Recherche und Entwurfsabstimmung, noch keine Umsetzung.
**Anlass:** Nutzer wünscht Logo-Gelb statt Lila im hellen Admin, Dashboard initial dieses Jahr und dauerhaft persönliche Filter sowie Shopify-orientierte Erfassungsseiten und kompakte Tabellen mit wählbaren Spalten. Screenshots als Gestaltungsreferenz, nicht als Anweisung oder vollständiges Datenmodell verwendet.
**Befund:** Dashboard initialisiert Zeitraum mit `month` ohne Speicherung. Offizielle Shopify-Hilfe trennt Lieferantenbestellung von Wareneingang/Inventartransfer; vorhandenes Produkt bedeutet nicht vorhandene Stückzahl. Öffentliche Shopify-Produkttaxonomie steht unter MIT-Lizenz. Für Flipbase vorgeschlagen: Einkäufe als verständlicher Oberbegriff behalten, Artikel direkt beim Einkauf anlegen/auswählen, Mystery-Box-Inhalt weiterhin später erfassen, Verkauf und Bestandsabgang gemeinsam buchen. Keine Pflichtfelder für Lieferstandorte, Zahlungsziele oder Shop-Metafelder ohne konkreten Bedarf. Filter/Spalten als persönliche Ansichten konzipieren, nicht global für alle Nutzer.
**Quellen:** https://help.shopify.com/de/manual/products/inventory/purchase-orders/creating-purchase-orders, https://help.shopify.com/de/manual/products/inventory/purchase-orders/viewing-purchase-orders, https://help.shopify.com/de/manual/products/inventory/purchase-orders/creating-inventory-transfers, https://github.com/Shopify/product-taxonomy.
**Vorgehen:** Design-System- und Brainstorming-Skill: kleine Farb-/Filteranpassung vom größeren Ablaufumbau trennen; Entwurf vor Umsetzung abstimmen. Keine Datenbank- oder Produktionsänderung.

## 2026-09-05 – Codex – Neutrales Verwaltungsdesign veröffentlichen

**Art:** Release auf ausdrücklichen Nutzerauftrag.
**Umfang:** Zweig `style/neutral-admin-design`, nur Verwaltungsdesign und Layouttests; keine Datenbankmigrationen. Vorheriger Produktionsstand `873c0b8`. Unabhängige Review-Befunde im vorherigen Umsetzungseintrag dokumentiert und korrigiert. Vor Push verbindliches `npm run verify`, danach PR-Prüfungen, Merge und Produktionslauf prüfen. Abbruch-/Rückfallkriterien: fehlgeschlagener Healthcheck, falscher ausgelieferter Commit oder fehlende Frontend-Dateien. Keine erfolgreiche Veröffentlichung behaupten, bevor Produktionslauf und öffentliche Antwort bestätigt sind.

**Abschluss:** `npm run verify` erfolgreich nach Anpassung der erwarteten kurzen Ergebnisüberschrift einschließlich Test der erhaltenen Erklärung. PR #26 nach erfolgreichem Lauf `33972570453` gemergt. Produktionslauf `33972742843` vollständig erfolgreich, erfolgreiche PR-Tests wiederverwendet. Öffentlicher Healthcheck und Commit `2ac3950e294e8f7616515cfa205d9f908581c216` bestätigt. Abschluss lokal dokumentiert, kein zusätzlicher Produktionslauf nur für diesen Nachweis.

## 2026-09-05 – Codex – Helle Verwaltungsoberfläche beruhigt und Datenansichten verbreitert

**Art:** UI-Umsetzung | Eigener Zweig `style/neutral-admin-design`, noch nicht veröffentlicht.
**Was:** Nach Nutzerfreigabe neutrale helle Flächen, dunkelgraue Schrift und zurückhaltende Primäraktionen ausschließlich unter `.fb-admin` eingeführt. Sidebar kräftiger, Cards ohne helle Verläufe, Kennzahlen kleiner, Tabellenköpfe ohne Großbuchstaben und mit stabilen Zahlen-/Kostenspalten. Einkäufe kompakter mit weniger verschachtelten Kästen. Datenansichten nutzen die verfügbare Breite; Einstellungen und Deal-Rechner bleiben begrenzt. Ursprüngliche dunkle Hintergrundpalette sowie Shop/Landingpage unverändert. Keine Geschäftslogik, Kostenbuchung oder Datenbank geändert; Ultrawide-Spezialmodus zurückgestellt.
**Prüfung:** Neuer Breitentest zunächst am bisherigen 1280px-Limit fehlgeschlagen, nach Anpassung erfolgreich. Browser-Demo auf Dashboard, Einkäufen, Inventar und Verkäufen in Hell/Dunkel bei 390, 1440 und 2560px kontrolliert; keine Laufzeitfehler. Axe WCAG-A/AA-Prüfung der vier Hauptinhalte in beiden Modi ohne Befunde nach Korrektur zweier gelber Hinweistexte. Browser plugin not available: vorhandenes Playwright für lokale Prüfung verwendet; keine Produktionsdaten benutzt. Bestehende 12 Browserprüfungen einschließlich Dialogsperre, Verkauf, Navigation, Chart und Inter erfolgreich, Produktionsbau erfolgreich. Zusätzlicher Test für 390/768/1024/1100/1280px erfolgreich.
**Review:** Unabhängiges Read-only-Review fand zu frühen Desktopumbruch der Einkaufszeilen sowie unbegrenzten Deal-Rechner; beides korrigiert. Erweiterter Browsertest fand außerdem herausragenden unsichtbaren Screenreader-Text in der horizontal scrollenden Verkaufstabelle; relativer Container hält ihn innerhalb des Scrollbereichs. Design-System-Skill führte zu lokal begrenzten Variablen statt globaler Änderungen an Shop/Dark Mode.

## 2026-09-05 – Codex – Offizielle Shopify-Designgrundlagen recherchiert

**Art:** Recherche | Designvorbereitung
**Quellen:** https://shopify.dev/docs/apps/design/visual-design, https://shopify.dev/docs/apps/design/layout, https://shopify.dev/docs/api/app-home/latest/web-components und https://github.com/Shopify/polaris-react-archive.
**Befund:** Shopify dokumentiert Polaris als Designsystem für Admin-Oberflächen. Aktuelle App-Komponenten sind Web Components; frühere React-Implementierung ist als deprecated archiviert. Dokumentierte Vorgaben: neutrale lesbare Textfarben, mindestens 13px für normalen/bedienbaren Text, 12px für kleinere Erläuterungen, 4px-Abstandsraster, volle Breite für datenreiche Listen, aufgabengerechte konsistente Dichte und zurückhaltende Tabellenaktionen. Keine Behauptung über den kompletten internen Framework-Stack des angemeldeten Shopify-Admins; Recherche erfolgte in offiziellen öffentlichen Quellen, nicht in einem Nutzerkonto.
**Ableitung:** Gestaltung in vorhandenen Angular-/Tailwind-Shared-Komponenten umsetzen statt Shopify-App-Bibliothek ungeprüft einzubauen. Tabellen verbreitern, Formulare begrenzen, neutrale Palette und kompakte konsistente Typohierarchie vorschlagen. Kein Frameworkwechsel, keine Installation oder Codeänderung.

## 2026-09-05 – Codex – Ruhigere Verwaltungsoberfläche anhand Shopify-Referenzen eingegrenzt

**Art:** Designanalyse | Noch keine Umsetzung
**Betroffen:** Zentrale Designvariablen, Shared-Oberflächen, Sidebar, Seitenbreite sowie Dashboard-, Inventar- und Verkaufstabellen.
**Was:** Neun Nutzerscreenshots als visuelle Referenz betrachtet; keine exakten Shopify-Farbwerte aus Screenshots behauptet. Nutzer wünscht weichere neutrale Hintergründe, dezenteren Text, kräftigere Menüschrift, kompaktere Cards/Tabellen/Kennzahlen, weniger überflüssige Erklärtexte und volle Breite für Datenansichten. Bestehendes Shell-Limit `max-w-7xl` und blaugraue Text-/Flächentokens als konkrete Ansatzpunkte identifiziert. Vorschlag: zentrale Gestaltung anpassen, Datenansichten flexibel verbreitern, Formulare und Lesetexte sinnvoll begrenzen; keine fachlichen Hinweise pauschal löschen. Helles Verwaltungsdesign als Referenzumfang, Dark Mode kompatibel halten, Shop und Landingpage nicht ungefragt umgestalten.
**Später:** Spezieller Ultrawide-Modus mit anderer Informationsanordnung auf sehr breiten Bildschirmen ist ausdrücklich zurückgestellt. Schwelle anhand CSS-Viewport statt physischer Monitorauflösung festlegen. Kein solcher Modus in dieser Anpassung.
**Verifiziert durch:** Design-System- und Brainstorming-Skill, Screenshots und zentrale CSS-/Layout-/Tabellenstellen gelesen. Kurzen Designvorschlag vor Umsetzung gemäß Planungs-Skill zur Bestätigung stellen. Keine Oberflächenänderung oder Veröffentlichung in dieser Sitzung.

## 2026-09-05 – Codex – Segoe-UI-Rückfall nach Schriftwechsel untersucht

**Art:** Diagnose | Browsercache
**Betroffen:** Öffentliche Schriftdefinition `/fonts/fonts.css` auf Anwendung und Landingpage.
**Befund:** Nutzer sieht Segoe UI trotz Inter an erster Stelle der Schriftliste. Live-Header der unverändert benannten fonts.css ist `public, max-age=31536000, immutable`. Ein wiederkehrender Browser kann daher die alte Definition ohne Inter behalten, während das neue Haupt-CSS bereits Inter verlangt. Frischer Chromium-Browser bestätigt über CDP `CSS.getPlatformFontsForNode` tatsächlich gerenderte `Inter Variable` an Überschriften von Login und Landingpage. Das bloße Vorhandensein der Fontdateien beim Release genügte nicht als Prüfung bestehender Browsercaches.
**Abgrenzung:** Nutzerbrowser nicht direkt untersucht; Cache als durch Konfiguration gestützte Ursache, nicht als aus dessen Browserlog bewiesener Einzelbefund. Soforthilfe vollständiges Neuladen; dauerhafte Abhilfe versionierter Name/Build-Hash der Schriftdefinition. In dieser Diagnosesitzung keine Produktionsdateien oder Konfiguration geändert und nichts veröffentlicht.

## 2026-09-05 – Codex – Typografie und Dialogkorrekturen live bestätigt

**Art:** Release-Abschluss
**Betroffen:** PR #25, PR-Lauf `33960974002`, Produktionslauf `33961125801`.
**Was:** Alle verpflichtenden PR-Prüfungen erfolgreich, anschließend gemergt. Unabhängiges Nachreview der Warenkorb-/Dialogkorrekturen ohne offene Befunde. Produktion hat erfolgreiche PR-Tests übernommen; Imagebau, Pflichtcheck, Deployment und GitHub Release erfolgreich.
**Verifiziert durch:** Öffentliche Anwendung liefert Commit `873c0b8df355a9d269b92fb2cd008546f63ba108`; `/healthz` HTTP 200. Normale und kursive Inter-Datei auf Anwendung und Landingpage jeweils HTTP 200 und SHA-256 identisch zu lokalen freigegebenen Dateien; beide öffentlichen Font-Stylesheets verweisen auf Inter. Keine Geschäftsdaten verändert. Angemeldete Nutzerabläufe lokal im Demo-Browser geprüft, nicht mit einem Produktionskonto. Abschlussnachweis lokal ergänzt, kein zusätzlicher Deployment-Push nur für diesen Eintrag.

## 2026-09-05 – Codex – Typografie und Dialogkorrekturen veröffentlichen

**Art:** Release
**Betroffen:** Eigener Zweig `style/inter-typography`, Anwendung und Landingpage.
**Was:** Auf ausdrücklichen Nutzerauftrag per PR und Merge veröffentlichen. Aktuellen Master einschließlich bereits veröffentlichter Deal-Monitor-Änderungen konfliktfrei übernommen; fremde Zweige unverändert. Keine zusätzlichen Datenbankmigrationen in diesem PR. Deployment-Checkliste und unabhängiges Code-Review vor Merge verwenden.
**Prüfung und Rückfall:** Gezielter Build, Browser-, Dialog- und Landingpage-Testlauf nach Integration; vollständige verbindliche CI im PR. Vorher öffentlich ausgelieferter Commit `88de7103cf3f0ac53bc9ee1cd5ca38f0347ba24b`. Bei fehlerhaftem Healthcheck, fehlenden Schriftdateien oder falschem öffentlichen Commit keinen Live-Erfolg melden und regulären Deployment-Rückfall prüfen. Nach Merge Produktionslauf und beide öffentlich ausgelieferten Schriftdateien kontrollieren.

**Review-Korrektur:** Unabhängige Prüfung fand Warenkorbinhalt außerhalb seines Dialog-Backdrops sowie zwei noch nicht nachgerüstete Dialoge (Flohmarkt und Retoure). Warenkorb in gemeinsamen Dialog eingeschlossen; beide übrigen Dialoge an zentrale Direktive angebunden. Neue Warenkorb-/Flohmarkt-Browsertests zunächst fehlgeschlagen, nach Korrektur alle vier Layout-/Overlay-Tests erfolgreich. Produktionsbau nach Template-Korrekturen erneut erfolgreich.

## 2026-09-05 – Codex – Mobile Kopfzeile und Modal-Hintergrund korrigiert

**Art:** Fehlerbehebung | Layout | Dialogbedienung
**Betroffen:** Eigener Zweig `style/inter-typography`, Header, zentrale Modal-Direktive, globale Animationen.
**Was:** Auf Nutzerauftrag den echten App-Überlauf durch nicht schrumpfende Workspace-/Aktionsgruppen behoben. Kopfzeile passt ihre Gruppen und den gekürzten Workspace-Namen an die verfügbare Breite an. Animierte Vorfahren offener Dialoge erzeugen keine störende Ebene mehr. Gemeinsame Modal-Direktive sperrt Geschwister entlang des Dialogpfads mit `inert`; oberster Dialog steuert Tastaturbedienung, Hintergrund und Scrollsperre werden beim Schließen wiederhergestellt, auch bei mehreren Dialogen. Kopfzeile bleibt hinter dem abgedunkelten Hintergrund sichtbar, aber unbedienbar, entsprechend WAI-ARIA-Dialogmuster (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
**Korrektur des vorherigen Befunds:** Landingpage-Überlauf in der einfachen lokalen Vorschau entstand durch unverarbeitet sichtbaren Caddy-Vorlagentext und doppelte Anmeldelinks. Nach Auflösen des Gast-Zweigs auf 390px kein Überlauf; keine zusätzliche Landingpage-Layoutänderung erforderlich.
**Verifiziert durch:** Debugging- und Frontend-Test-Skills genutzt; Browser-Plugin nicht verfügbar, vorhandenes Playwright als Ersatz. Beide neuen Browser-Regressionen zunächst fehlgeschlagen (422px statt 320px sowie fehlende Hintergrundsperre), nach Korrektur erfolgreich. Sieben Browser-Tests einschließlich Demo-Verkauf, Rechtshinweisen, Dashboardbedienung und Headerbreiten 320/390/768/1440px erfolgreich. Integrationstest mit echter Angular-Direktive für zwei Dialoge und Wiederherstellung erfolgreich. Produktionsbau, gezieltes ESLint, Formatierung und Diff-Prüfung erfolgreich. Lokale Screenshots von Dialog und mobiler Kopfzeile geprüft, keine JavaScript-Seitenfehler bei Desktop-/Mobilprüfung. Keine vollständige Prüfung jeder Feature-/Browserkombination, keine Geschäftsdatenänderung, kein Push oder Deployment.

## 2026-09-05 – Codex – Inter über alle Oberflächen lokal eingebunden

**Art:** UI | Typografie
**Betroffen:** Eigener Zweig `style/inter-typography`, Anwendung, Diagramm, Landingpage, Impressum und Datenschutz.
**Was:** Nach Bestätigung des gesamten Umfangs offizielle stabile Inter 4.1 (https://github.com/rsms/inter/releases/tag/v4.1) als variable normale und kursive WOFF2 einschließlich unveränderter SIL-OFL-Lizenz lokal eingebunden. Standardschrift und bisherige Zahlen-Schriftwerte vereinheitlicht, Chart.js-Beschriftung angepasst, App-Preload aktualisiert. Keine Schriftanfragen an externe Anbieter, keine neue npm-Abhängigkeit, keine Änderung der Größen oder Geschäftsdaten. Alte Fontdateien bleiben ungenutzt erhalten; extern exportiertes eBay-HTML behält seine portable Arial-Schrift.
**Verifiziert durch:** Schrift-Browsertest zuerst mit fehlender Inter rot, danach grün; fünf Playwright-Tests für Schrift, Anmeldung, Rechtshinweise, Dashboardfilter und Diagrammbedienung erfolgreich. Neun Diagramm-Konfigurationstests, 13 Landingpage-Vertragstests, gezieltes ESLint und Produktionsbau erfolgreich. Frontend-Test-Skill mangels Browser-Plugin mit vorhandenem Playwright umgesetzt. Desktop-/Mobilansichten von Demo-Dashboard, Landingpage und Rechtstexten lokal geprüft, keine JavaScript-Seitenfehler. QA-Bilder außerhalb des Repository unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-inter-qa/`. Bestehender horizontaler Überlauf auf Mobilgeräten separat festgestellt: App 422px, Landingpage etwa 523px bei 390px Bildschirmbreite; Gegenprobe mit ursprünglichen Schriftdefinitionen ebenfalls 422px beziehungsweise 521px. Kein allgemeines Mobil-Layout-Redesign vorgenommen. Produktionsbau bietet keinen Demo-Einstieg; interaktive Sichtprüfung daher am lokalen Entwicklungsserver. Kein Push oder Deployment.

## 2026-09-05 – Codex – Lokalen Wechsel auf Inter eingegrenzt

**Art:** Analyse | Typografie
**Betroffen:** Standardschrift der Anwendung und mögliche Angleichung der Landingpage.
**Was:** Nutzer-Screenshot zeigt Inter. Bestehende Anwendung und Landingpage verwenden lokal gehostete Plus Jakarta Sans; Anwendung bindet sie über zentralen Tailwind-Schriftwert und Preload ein. Vorschlag: lokale variable Inter als Standardschrift, bestehende Größen/Layout zunächst erhalten, Lade- und Darstellungsprüfung. Umfang Anwendung versus zusätzliche Landingpage vor Umsetzung abstimmen.
**Verifiziert durch:** `src/styles.css`, `src/index.html`, lokale Schriftdateien und Landingpage-Schriftwerte gelesen. Noch keine Schriftdateien oder Oberflächen verändert; kurze Abstimmung gemäß Planungs-Skill.

## 2026-09-05 – Codex – Vereinfachter Release-Ablauf live bestätigt

**Art:** Release-Abschluss
**Betroffen:** PR #24, PR-Lauf `33957947701`, Produktionslauf `33958142408`.
**Was:** PR nach erfolgreichen Prüfungen gemergt. Nachweis-Artefakt `verified-tree-v1-c077689e0d4cdee591ab638af65c31e3d2feba39-111` vorhanden. Produktionslauf hat Qualität, vier Unit-Teiljobs, Browser-, Datenbank- und Diensttests nicht erneut ausgeführt. Image, Pflichtcheck, Deployment und Release erfolgreich.
**Verifiziert durch:** Öffentlich ausgelieferter Commit `bb923b77d95373d9833b38733243f0928c5bb257`, HTTP-/Health-/SHA-Prüfung erfolgreich. Alle 78 Prüfsummen im laufenden Produktionscontainer mit Exitcode 0 geprüft; Datenbankhistorie unverändert 78 Migrationen. Keine Geschäftsdatenkorrektur ausgelöst. Produktions-Imagejob 3m42s, Deployment 19s; der Imagebau bleibt daher der wesentliche Zeitanteil, keine pauschale Gesamtzeitersparnis behauptet. Abschlussnachweis lokal ergänzt, kein weiterer Deployment-Push nur für dieses Protokoll.

## 2026-09-05 – Codex – Vereinfachten Release-Ablauf veröffentlichen

**Art:** Release
**Betroffen:** Zweig `ci/reuse-verified-pr-checks`, PR und Produktionsworkflow.
**Was:** Auf Nutzerauftrag über PR und Merge veröffentlichen. Gezielte lokale Workflow-Prüfungen statt erneutem vollständigem Anwendungstestlauf; danach echte PR-Nachweiserzeugung und Wiederverwendung im Master-Lauf kontrollieren. Keine neuen SQL-Migrationen und kein Serverbootstrap erforderlich.
**Verifiziert durch:** Unabhängige Reviews, Docker-Paketierung aller 78 Migrationen und echte PostgreSQL-Transaktionsprüfungen aus der Umsetzung liegen vor. Vor Push gezielt nachprüfen; nach Merge Image/Deployment sowie öffentlich ausgelieferte Version prüfen. Bei fehlerhaftem Deployment oder falscher öffentlicher Version keinen Erfolg melden; bisherigen Image-Stand für Rückfall festhalten.

## 2026-09-05 – Codex – Automatische Migrationspakete statt manueller Prüfsummen

**Art:** CI | Release-Ablauf | Tests
**Betroffen:** Eigener Zweig `ci/reuse-verified-pr-checks`, Docker-Bau, frühe CI-Prüfung, Arbeitsregeln und Release-Dokumentation.
**Was:** Nach ausdrücklicher Zustimmung die manuelle Prüfsummenliste entfernt. Ein Paketierer kopiert alle SQL-Dateien unverändert und erstellt die passende Integritätsliste im selben Build. Bestehender Server-Runner bleibt kompatibel und unverändert. Früher Git-Vergleich erkennt Schema-Dateiänderungen ohne neue Migration sowie bearbeitete/gelöschte alte Migrationen. Paketierung prüft Namen, Versionen, leere Dateien und Unterordner. SQL-Review/Merge ist jetzt die inhaltliche Freigabe; kein selbstgebauter SQL-Sicherheitsparser und keine Behauptung vollständigen Schemaabgleichs.
**Warum:** Die separate manuelle Freigabe konnte trotz grünem PR vergessen werden und erst auf Produktion abbrechen. Backup, Transaktion von SQL plus Historie, Prüfsummenvergleich und öffentlicher Deployment-Check bleiben erhalten.
**Verifiziert durch:** Neue Verhaltenstests zunächst rot, danach grün. Reviewer fand verschachtelte SQL-Dateien als konkreten Auslassungsfall; beide Regressionen zuerst reproduziert und dann behoben, Nachreview ohne offene Befunde. Workflow-Suite abschließend 43 erfolgreich, vier Windows-Ausnahmen zusätzlich in Linux/PostgreSQL 16 erfolgreich ausgeführt: automatisches Paket mit unverändertem Runner, SQL-/Historien-Rollback, Wiederholung, Backup- und Deployment-Fehler. Gezieltes ESLint, Actionlint und Formatprüfung erfolgreich. Finaler Docker-Bau erfolgreich; im Image alle 78 SQL-Dateien und Prüfsummen bestätigt, HTTP-/Health-/Commit-Check am lokalen Container grün. Temporäre Testcontainer und Testnetz entfernt; keine Produktionsdaten oder Serverdateien verändert, kein Push. Echte GitHub-Wiederverwendung und Rollout erst nach Veröffentlichung zu bestätigen.

## 2026-09-05 – Codex – Wiederkehrende Migrationsfreigabe als Fehlerquelle eingegrenzt

**Art:** Analyse | Release-Ablauf
**Betroffen:** `docker/Dockerfile`, `deploy/apply-release-migrations.sh`, bestehender CI-Umbau.
**Was:** Migrationen werden bereits im Image ausgeliefert und vor dem Frontend automatisch mit Backup angewendet. Zusätzlich manuell gepflegte Prüfsummen können dennoch erst auf Produktion als fehlend auffallen. Vorschlag zur Abstimmung: SQL-Review im PR beibehalten, technische Prüfsummen automatisch erzeugen, fehlende Migrationsdateien vor Merge erkennen. Transaktionsannahmen und Umgang mit riskanten SQL-Änderungen müssen dabei erhalten bleiben; keine pauschale Sicherheitszusage durch Prüfsummen.
**Verifiziert durch:** Docker-Packaging, produktiver Runner-Code und vorhandene Transaktionstests gelesen. Noch keine Änderung am Migrationsfreigabeweg oder Produktionsdaten; nach dem Planungs-Skill erst kurzen Entwurf bestätigen lassen. Test-Wiederverwendung aus vorheriger Sitzung weiterhin lokal fertig, noch unveröffentlicht.

## 2026-09-05 – Codex – Doppelte Prüfungen nach PR-Merge reduzieren

**Art:** CI | Teststrategie
**Betroffen:** Eigener Zweig `ci/reuse-verified-pr-checks`, CI-Workflow, Prüfskripte und lokale Arbeitsregeln.
**Was:** Erfolgreiche PR-Prüfungen werden automatisch an Git-Dateibaum und Prüfumfang gebunden. Ein normaler Merge desselben Inhalts überspringt die zweite Qualitäts-/Testkette; Produktionsbau, Image-Smoke, Backup/Migrationen und öffentliche Prüfung bleiben unverändert. Fehlende, abgelaufene oder unpassende Nachweise führen zu regulären Tests, nicht zu einer manuellen Sperre. Lokal gezielte Prüfungen statt obligatorischem Komplettlauf vor jedem Branch-Push.
**Warum:** Derselbe Stand lief zuletzt lokal, im PR und nach Merge durch vollständige Tests. Keine Anwendungstests löschen, sondern doppelte Ausführung vermeiden. Bestehende Migrationsfreigaben werden in dieser begrenzten Änderung nicht entfernt.
**Verifiziert durch:** Neue Regressionen zunächst rot, anschließend Wiederverwendung und sicherer Rückfall bei abweichendem Inhalt, Prüfumfang, Herkunft, Ereignis und API-Ausfall geprüft. Workflow-Suite: 36 erfolgreich, vier bestehende Windows/POSIX-Skips. Actionlint 1.7.12, gezieltes ESLint und Formatprüfung erfolgreich. Unabhängiges Review ohne offene Befunde; Prüfer bestätigt zusätzlich zehn gezielte Tests. CLI mit echtem letztem GitHub-PR ausschließlich lesend geprüft: ohne alten Nachweis regulärer Rückfall. Tatsächliche Artefaktübernahme beim ersten neuen PR-/Merge-Lauf noch zu bestätigen. Kein Push oder Deployment dieses Umbaus.

## 2026-09-05 – Codex – Kostenprüfung erfolgreich live verifiziert

**Art:** Release-Abschluss
**Betroffen:** PR #22 und #23, Produktionslauf `33954710786`.
**Was:** Folge-PR nach vollständigem lokalem Verify und unabhängiger Prüfsummenprüfung gemergt. Regulärer Produktionsworkflow einschließlich Deployment und GitHub Release erfolgreich. Keine Geschäftsdatenreparatur ausgelöst; Kostenübernahme bleibt eine ausdrückliche Bestätigung im Einkauf.
**Verifiziert durch:** Öffentliche `deployment.json` liefert Merge-Commit `bc9ec8bc1d424dfb580ab6736fce252542a57f3c`; Startseite und `/healthz` jeweils HTTP 200. Produktionshistorie enthält 78 Migrationen einschließlich `20260905074121` und `20260905074747`. Beide neuen RPC-Signaturen sind für `authenticated` ausführbar, für `anon` und `service_role` gesperrt. Abschlussnachweis lokal ergänzt, kein weiterer Deployment-Push nur für diesen Eintrag.

## 2026-09-05 – Codex – Fehlende Migrationsfreigabe nachgereicht

**Art:** Release-Korrektur
**Betroffen:** PR #22, Produktionslauf `33954054466`, `deploy/approved-migrations.sha256`.
**Was:** Nach erfolgreichen PR-Prüfungen gemergt; Deployment vor Änderungen durch fehlende Prüfsummenfreigabe angehalten. Beide unveränderten, unabhängig geprüften und mit 994 SQL-Assertions getesteten Migrationen in die Freigabeliste aufnehmen. Sie enthalten transaktionale Funktionsdefinitionen/Rechteänderungen, keine Transaktionssteuerung, psql-Befehle oder externen Seiteneffekte. Keine Sperre entfernt und kein SQL manuell in Produktion ausgeführt.
**Warum:** Die Freigabeliste wurde im ersten Release versehentlich nicht ergänzt. Der vorgesehene automatische Weg soll nur die exakt geprüften SQL-Dateien ausführen.
**Verifiziert durch:** Fehlerlog gelesen; LF-Dateien und SHA-256-Werte geprüft. Gesamtprüfung vor erneutem Push. Neuer kleiner PR statt Änderung des bereits gebauten Images.

## 2026-09-05 – Codex – Einzelkauf-Kostenprüfung zur Veröffentlichung freigegeben

**Art:** Release
**Betroffen:** Zweig `fix/reconcile-historical-purchase-costs`, PR und Produktionsworkflow.
**Was:** Auf ausdrücklichen Nutzerwunsch Veröffentlichung über PR/Merge vorbereiten. Hauptzweig unverändert bei `caed736`. Zwei erzeugte Migrationen stellen Vorschau, Einzelkauf-Begrenzung und eingeschränkte Ausführungsrechte bereit; keine automatische Übernahme von Geschäftsdaten.
**Verifiziert durch:** Vorheriger isolierter Neuaufbau mit 994 Datenbankprüfungen und unabhängiges Review abgeschlossen. Gesamtprüfung wird unmittelbar vor Push erneut ausgeführt. Anschließend CI, Migrationen, veröffentlichte Version und Erreichbarkeit prüfen. Bei fehlgeschlagener Migration oder ungesunder Anwendung keinen Erfolg melden; bestehende Geschäftsdaten nicht als Behelf ändern.

## 2026-09-05 – Codex – Gezielte Übernahme historischer Einkaufskosten

**Art:** Bugfix | Oberfläche | Datenbank | Test
**Betroffen:** Eigener Zweig `fix/reconcile-historical-purchase-costs`, Einkaufsdetail, Kosten-RPCs und Dashboard.
**Was:** Lesende Einzelkauf-Vorschau mit Kaufpreis, Zusatzkosten, Artikeln und Fingerabdruck ergänzt. Übernahme verlangt ausdrückliche Bestätigung der vollständigen Artikelliste; nur der gewählte geeignete Mystery-Einkauf wird verarbeitet. Geänderte Daten werden unter Sperren erneut geprüft. Bestehende Korrektur-/Protokollierungslogik bleibt erhalten, unklare Fälle werden nicht automatisch verteilt. Nach Erfolg Einkauf, Inventar und Verkäufe neu laden. Normale Alt-Einkäufe ohne belegbare Positionen bleiben ausdrücklich manuell zu klären.
**Warum:** Offene Einkaufskosten sollen ohne Löschen oder Neuanlegen bestehender Verkäufe übernommen werden können. Fehlende Dashboard-Umsätze waren nicht durch offene Kosten begründet; Standardzeitraum ist der aktuelle Monat.
**Verifiziert durch:** Isolierte lokale Datenbank `flipbase-cost-repair` statt Änderung der parallel genutzten Datenbank (82 Migrationen). Neue SQL-Prüfung zunächst rot; abschließend kompletter Neuaufbau aus 78 Migrationen und alle 25 SQL-Dateien mit 994 Assertions grün. Service- und Oberflächentests einschließlich Bestätigungssperre und verspäteter Antworten. Gerenderte Ansicht mit AXE ohne Farbkontrastprüfung unter jsdom getestet. Migration mit pg-delta erzeugt; erste migra-Ausgabe wegen ausgelassener Rechte und unbeteiligter Ansicht nur außerhalb des Repositories zur Prüfung behalten. Produktions-Standardrechte ausschließlich lesend geprüft; geerbtes service_role-Recht lokal reproduziert, Regression zunächst rot und mit zusätzlich erzeugter Rechtekorrektur grün. Typen neu erzeugt, unabhängiges Review ohne verbleibenden belegten Fehler, abschließendes `npm run verify` erfolgreich. Keine Produktionsdaten geändert, kein Push oder Deployment.

## 2026-09-05 – Codex – Dashboard-Zeitraum geklärt, Kostenkorrektur noch offen

**Art:** Diagnose | Teilkorrektur | Test
**Betroffen:** Eigener Zweig `fix/reconcile-historical-purchase-costs`, Dashboard-Leerzustand.
**Was:** Die Vermutung, dass offene Einkaufskosten Verkäufe aus dem Dashboard entfernen, trifft auf die aktuelle Berechnung nicht zu. Standard ist der aktuelle Monat. Ein neuer Oberflächentest mit echter Berichtsberechnung reproduziert Augustverkäufe außerhalb der Septemberansicht und prüft den neuen Jahreswechselknopf einschließlich Umsatz bei unbekannten Kosten. Zeitraumlabels und Leerzustand verdeutlicht.
**Warum:** Fehlende Kosten nicht mit fehlenden Verkäufen verwechseln. Die bisherige Altdatenübernahme ist eine Workspace-Sammelkorrektur, kein sicherer Einzelkauf-Korrekturdialog.
**Verifiziert durch:** Neuer Test zunächst rot, anschließend acht Dashboard- und zwölf Berichtstests grün. Typprüfung erfolgreich. Keine Geschäftsdatenänderung, kein Push oder Deployment.
**Offen:** Docker-Engine nicht erreichbar; Nutzer um Start gebeten. Kostenkorrektur noch nicht implementiert. Nächster Schritt: gezielte Einzelkauf-Vorschau mit Preis, Zusatzkosten, vollständiger Artikelliste und Änderungsprüfung; bestätigte Übernahme nur dieses Einkaufs, atomar und dokumentiert. Unklare normale Einkäufe nicht automatisch verteilen. Datenbankmigration generieren, Typen erneuern und Altdaten-/Workspace-/Paralleländerungsfälle testen; erst danach Oberfläche anbinden und vollständig verifizieren.

## 2026-09-05 – Codex – Einkaufserfassung mit Anbieterabläufen abgeglichen

**Art:** Recherche | Empfehlung
**Betroffen:** Bedienablauf für normale Einkäufe und Mystery Boxen.
**Was:** Offizielle Shopify-Dokumentation zu Einkaufsbestellungen und verknüpftem Wareneingang geprüft. Produkt, Einkauf und Bestand bleiben getrennte Datensätze; vorhandene Einkaufspositionen werden in den Wareneingang übernommen. Empfehlung für Flipbase: Artikel direkt beim Einkauf erfassen und bei bestätigtem Empfang automatisch in den Bestand übernehmen.
**Warum:** Doppelte Benutzereingaben vermeiden, ohne bestellte und tatsächlich empfangene Ware gleichzusetzen. Mystery-Inhalte werden weiterhin beim Auspacken ergänzt.
**Verifiziert durch:** Offizielle Shopify-Hilfeseiten gelesen; keine Implementierung und keine Geschäftsdatenänderung.

## 2026-09-05 – Codex – Offene Kosten bei Altverkäufen eingeordnet

**Art:** Analyse
**Betroffen:** Verkaufskennzahlen, Kostenbasisprüfung, Altdatenübernahme.
**Was:** Die Anzeige verlangt eine nachvollziehbare Kostenbasis mit abgeschlossenem Ursprungseinkauf; vorhandene Verkaufsgebühren allein reichen nicht. Verkaufsabfragen laden die Ursprungseinkäufe mit. Die Datenbankfunktionen zur Vorschau und bestätigten Übernahme alter Einkaufskosten sind im Frontend bislang nicht angebunden.
**Warum:** Die Meldung bezeichnet unbekannte Einkaufskosten, keine offene Rechnung. Bestehende Einkäufe sollen nicht gelöscht oder als kostenlos behandelt werden.
**Verifiziert durch:** Lokale Kennzahlenberechnung, Verkaufsabfragen, Einkaufsaktionen und SQL-Vorschau gelesen; keine individuellen Produktionsdatensätze geprüft und keine Geschäftsdaten verändert.

## 2026-09-05 – Codex – Eindeutige Zusatzkosten-Beziehung beim Laden

**Art:** Bugfix | Test
**Betroffen:** `purchase.service.ts`, Übersicht und Einzelansicht, eigener Zweig `fix/disambiguate-purchase-cost-queries`.
**Was:** Beide Zusatzkosten-Einbettungen wählen ausdrücklich `purchase_costs_workspace_purchase_fkey`. Zwei Regressionstests prüfen die tatsächlich an den Client übergebenen Abfragen. Betriebsnachweise des vorherigen Deployments werden mit dokumentiert.
**Warum:** Nach Einführung der zusätzlichen Workspace-Beziehung kann PostgREST die unqualifizierte Einbettung nicht mehr eindeutig auflösen.
**Verifiziert durch:** Beide neuen Tests zunächst rot, nach Korrektur alle drei fokussierten Tests grün. Echte produktive REST-API ausschließlich mit `limit=0` geprüft: alte Einbettung HTTP 300/PGRST201; korrigierte Übersicht und Detail jeweils HTTP 200 mit leerem Ergebnis. Keine Datenbank-, Rechte- oder Geschäftsdatenänderung. Vollständiger Verify-Lauf vor Push.

## 2026-09-05 – Codex – Mehrdeutige Einkaufsabfrage diagnostiziert

**Art:** Analyse
**Betroffen:** `purchase.service.ts`, Einkaufsübersicht und Einkaufsdetail.
**Was:** Gemeldeten Ladefehler auf beide unqualifizierten `costs:purchase_costs(*)`-Einbettungen zurückgeführt. Produktiv bestehen sowohl `purchase_costs_purchase_id_fkey` als auch die neue Workspace-Beziehung `purchase_costs_workspace_purchase_fkey`.
**Warum:** Nach dem Upgrade kann PostgREST ohne ausdrücklichen Beziehungshinweis nicht zwischen beiden Beziehungen wählen. Die bestehenden Prüfungen haben die echte REST-Einbettung nicht erfasst.
**Verifiziert durch:** Beide Serviceabfragen und produktive FK-Definitionen lesend geprüft; offizielles Supabase-Verfahren für mehrdeutige Beziehungen abgeglichen. Noch keine Korrektur oder erneute Veröffentlichung.

## 2026-09-05 – Codex – Produktionsmigration und Release abgeschlossen

**Art:** Betrieb | Verifikation
**Betroffen:** Produktionsdatenbank, Deploymentweg, PR #19 und Actions-Lauf `33931627849`.
**Was:** Nach frischem verschlüsseltem Backup auf beiden Servern alle 23 ausstehenden Migrationen einschließlich Rechtekorrektur gemeinsam und mit ihren Historieneinträgen atomar eingespielt. Geschäftskennzahlen innerhalb derselben Transaktion auf Gleichheit geprüft. `RELEASE_MIGRATIONS_V1=true` aktiviert. Nach dem ersten erfolgreichen Rollout den kurzen Deployjob erneut ausgeführt, weil der laufende Workflow die zuvor gelesene Variable noch nicht übernommen hatte. Versuch 3 bestätigt den neuen Digest-/Migrationsweg. Vier isolierte Restore-Container entfernt; Sicherungen und geschützte Betriebsprotokolle erhalten.
**Warum:** Nicht nur das Frontend ausliefern, sondern den automatischen Datenbankweg tatsächlich produktiv verifizieren.
**Verifiziert durch:** Actions vollständig erfolgreich; produktiv 76 Versionen und keine direkten anon-Grants in public. Webcontainer gesund, Digest `sha256:fb29dd9782a27a83f8e7272ad2a9198ca4b859ad2847f2febcd0b0fb5e14d95c`. Öffentliche Startseite, Healthcheck und vollständige Commit-SHA `6bfaefb33ffb6fd4d3ba32f2edb6e95cf10fb744` erfolgreich nachgeprüft. Abschließende Betriebsdokumentation lokal; kein weiterer Codepush dafür.

## 2026-09-05 – Codex – Missverstandene Statusmeldung und Fortsetzung

**Art:** Betrieb
**Betroffen:** PR #19, Produktionslauf `33931627849`, Serverbootstrap.
**Was:** Nach erfolgreicher vollständiger Prüfung PR #19 gemergt (`6bfaefb33ffb6fd4d3ba32f2edb6e95cf10fb744`). Serverhelfer installiert und alte Dateien gesichert. Die Meldung „deploy nicht“ wurde irrtümlich als Stop-Anweisung verstanden und der laufende Produktionsworkflow zum Abbruch angewiesen. Nutzer stellte unmittelbar klar, dass die Action gemeint war, nicht ein Stopp; die Auslieferung wird fortgesetzt. Zu diesem Zeitpunkt kein produktiver Migrationslauf und keine Aktivierung von `RELEASE_MIGRATIONS_V1`.
**Warum:** Missverständnis ausdrücklich berichtigen und den tatsächlichen Ablauf nachvollziehbar festhalten.
**Verifiziert durch:** Produktionsdatenbank weiterhin 53 Versionen, Webcontainer weiterhin `sha-08c4d73`, Zustand `healthy`. Restore-Tests, isolierte Testcontainer und verschlüsselte Sicherungen bleiben für die Fortsetzung erhalten. Diese Statusdokumentation wird nicht gepusht.

## 2026-09-05 – Codex – Produktionsbootstrap und Rechteabgleich

**Art:** Betrieb | Bugfix | Test
**Betroffen:** Eigener Zweig `fix/reconcile-release-permissions`, isolierte Wiederherstellungsdatenbank auf dem Produktionshost, deklarative DB-Rechte.
**Was:** Verschlüsseltes Vollbackup lokal und extern erstellt, einschließlich Rollen in abgeschottetem PostgreSQL 17.6 wiederhergestellt und alle 22 fehlenden Migrationen dort erfolgreich angewendet. Eine separat generierte Rechtekorrektur entfernt vererbte anonyme Rechte des bestehenden Self-Hosting-Servers. Deklarative Reihenfolge korrigiert und Datenbanktypen vollständig neu erzeugt (einschließlich bereits integrierter Sniper-Tabellen). Produktive Datenbank zum Zeitpunkt dieser Codefreigabe noch unverändert.
**Warum:** Deployment erst nach nachgewiesenem Restore und realistischem Upgrade freigeben. Bestehende Migrationen bleiben unverändert.
**Verifiziert durch:** Zweite frische Wiederherstellung mit anschließendem Upgrade von 53 auf 76 Versionen; alle 24 SQL-Dateien mit 986 Assertions erfolgreich. Neuer Regressionstest zunächst mit fünf reproduzierten Rechtefehlern, anschließend vollständig grün. Geschäftskennzahlen/Mengen unverändert; zusätzliche ACL-Katalogprüfung ohne direkte anon-Grants in public. Unabhängiges Review ohne blockierende Befunde. Vollständiges `npm run verify` erfolgreich; erneuter Abschlusslauf nach Typgenerierung erfolgt vor Push.

## 2026-09-05 – Codex – Erneuten Produktionsabbruch geprüft

**Art:** Analyse
**Betroffen:** GitHub Actions Lauf `33929320610`
**Was:** Fehlgeschlagenen Deploy-Schritt geprüft: weiterhin dieselben 22 nicht angewendeten Migrationen. Neue Automatik noch nicht aktiviert.
**Warum:** Ursache des erneuten Abbruchs erklären und fehlende Serveraktivierung von abgeschlossenem PR/Merge unterscheiden.
**Verifiziert durch:** Abgeschlossenes GitHub-Fehlerlog gelesen. Keine Server- oder Produktionsänderung.

## 2026-09-05 – Codex – Release-Pipeline zur Integration vorbereitet

**Art:** Konfiguration | Test
**Betroffen:** Zweig `chore/streamline-release-pipeline`, GitHub-PR und CI
**Was:** Auf ausdrücklichen Wunsch Push, PR und Merge vorbereitet. Aktuellen Master abgeglichen; keine zwischenzeitlichen Änderungen zu übernehmen.
**Warum:** Die geprüfte CI-Vereinfachung integrieren. Der neue Datenbankweg bleibt bis zum dokumentierten Serverbootstrap deaktiviert.
**Verifiziert durch:** Erneuter vollständiger lokaler Verify-Lauf erfolgreich. PR #18 deckte eine ungenutzte Shell-Schleifenvariable auf; auf den bewusst ungenutzten Namen `_` korrigiert. Die lokale actionlint-Prüfung hatte anders als GitHub kein ShellCheck verfügbar; Linux-Gegenprüfung folgt mit beiden Werkzeugen. Keine manuelle Produktionsmigration oder Serverinstallation.

## 2026-09-05 – Codex – Git-Rename-Erkennung abgesichert

**Art:** Bugfix | Test
**Betroffen:** `scripts/detect-supabase-changes.mjs`, zugehöriger Real-Git-Test
**Was:** Die Pfaderkennung vergleicht Git-Diffs mit deaktivierter Rename-Kompression; ein Regressionstest prüft einen technischen Template-Pfad, der nach `docs/` verschoben wird.
**Warum:** Der frühere Rename-Diff konnte nur den Dokumentationszielpfad liefern und dadurch die Anwendungsprüfungen überspringen.
**Verifiziert durch:** RED reproduziert `application=false`; GREEN mit `--no-renames` ergibt `application=true`; 13 fokussierte Node-Tests, Prettier-Check und ESLint erfolgreich.

## 2026-09-05 – Codex – Release-Pipeline vereinfacht

**Art:** Konfiguration | Test
**Betroffen:** GitHub Actions, Änderungserkennung, Freigabeprüfungen und Deployment
**Was:** Umsetzung im eigenen Zweig `chore/streamline-release-pipeline`; Dokumentationsfilter, gemeinsame Freigabe und neu verteilte Testgruppen. Digestgebundener Releaseweg mit explizit freigegebenen Migrationen, strikter verschlüsselter Sicherung und gemeinsamem SQL-/Historienabschluss vorbereitet. Produktionsimage wird vor Veröffentlichung geprüft, separater Master-Build entfällt.
**Warum:** Weniger unnötige CI-Arbeit und vollständiger, abgesicherter Veröffentlichungsweg.
**Verifiziert durch:** Abschließendes `npm run verify` auf `aeba8ed` Exit 0 (1.472 Anwendungstests erfolgreich, fünf bestehende Skips; Landingpage 13; Workflow 31 erfolgreich, vier Windows/POSIX-Skips; Build erfolgreich). Linux-Shelltests und echte PostgreSQL-16-/17.6-Transaktionen erfolgreich; actionlint und unabhängige Aufgabenreviews ohne blockierende Befunde. Gesamtprüfung fand einen Rename-Auswahlfehler, der mit Regressionstest behoben und erfolgreich nachgeprüft wurde. Docker-Build und HTTP-/SHA-/JS-/CSS-Smoke mit lokaler Umgebung erfolgreich. Keine Serverinstallation, Registry-Veröffentlichung oder Produktionsänderung; Bootstrap, Restore-Nachweis und Freigabe des Altrückstands bleiben nötig.

## 2026-09-05 – Codex – Actions-Ablauf bewertet

**Art:** Analyse
**Betroffen:** CI, nächtliche Prüfungen, Benchmark, Docker-Build und Browserkonfiguration
**Was:** Laufzeiten von Lauf 33925055214 und vorhandene Optimierungen geprüft; Zusammenführung der Freigabeprüfungen, gezielte Pfadfilter, Wiederverwendung von Build-Ergebnissen und Messung der Angular-Suite empfohlen.
**Warum:** Komplexität und Wartezeit reduzieren, ohne Datenintegritätsprüfungen zu entfernen.
**Verifiziert durch:** Konfiguration gelesen und offizielle GitHub-Dokumentation abgeglichen. Keine Workflow- oder Produktionsänderungen.

## 2026-09-05 – Codex – Automatische Datenbankupdates geprüft

**Art:** Analyse
**Betroffen:** `.github/workflows/ci.yml`, `deploy/README.md`
**Was:** Bestätigt, dass das Deployment Migrationen nur auf Vollständigkeit prüft und sie ausdrücklich nicht selbst ausführt.
**Warum:** Den Abbruch nach PR #17 und die fehlende Automatisierung erklären.
**Verifiziert durch:** Workflow und Deployment-Dokumentation gelesen; keine Produktionsänderung vorgenommen.

Dieses Projekt wird teilweise mit KI-Assistenten entwickelt. **Jede** von einer KI durchgeführte Änderung wird hier mit Namen und Modell des Assistenten dokumentiert.

## Regel für alle KI-Assistenten

> Wenn du ein KI-Assistent bist und an diesem Projekt arbeitest: Trage **jede** Arbeitssitzung hier ein – mit deinem Modellnamen, dem Datum, was du getan hast und warum. Auch reine Analysen ohne Codeänderung. Neueste Einträge kommen nach oben.

**Format je Eintrag:**

```markdown
## YYYY-MM-DD – <Modellname> – <Kurztitel>

**Art:** Analyse | Feature | Bugfix | Refactoring | Doku | Konfiguration
**Betroffen:** <Dateien oder Bereiche>
**Was:** <Was wurde gemacht>
**Warum:** <Begründung>
**Verifiziert durch:** <Build / Tests / manuell – mit Ergebnis>
```

## Namenskonvention im Code

> **Alle Bezeichner werden englisch geschrieben** – Datei-, Ordner-, Komponenten-,
> Klassen-, Methoden- und Variablennamen. Deutsch bleibt ausschliesslich fuer
> Code-Kommentare, sichtbare Oberflaechentexte und die Kommunikation mit dem Nutzer.
> Commit-Nachrichten sind ebenfalls englisch.

**Offene Aufgabe fuer alle KI-Assistenten:** Grosse Teile des Bestands sind noch
deutsch benannt (`speicher-migration.ts`, `stammdaten-filter.ts`,
`supabase-schreiben.ts`, `erstelleDienst`, `erstelleKomponente` und viele weitere,
quer durch `core/services/` und die uebrigen Features). Das Projekt soll spaeter
**vollstaendig auf englische Bezeichner umgestellt** werden.

Die Sperre ist seit dem 29.08.2026 aufgehoben: Die Warenwirtschaft ist in
`master` zusammengefuehrt, und die beiden Bildeditor-Pakete sind hinterher.
Es steht also **kein langlebiger Zweig mehr offen**, den ein projektweites
Umbenennen zerstoeren wuerde - das war der einzige Grund fuer das Zurueckstellen.

Die Umbenennung gehoert in einen **eigenen, rein mechanischen Commit** ohne
Logikaenderung. Nur dann beweisen gruene Tests und ein sauberer Build, dass
nichts kaputtgegangen ist. Bereits vollstaendig englisch benannt ist der Ordner
`src/app/features/image-optimizer/`; er taugt als Vorlage. Noch deutsch sind
unter anderem `core/services/speicher-migration.ts`, `stammdaten-filter.ts` und
`supabase-schreiben.ts` sowie viele Feld- und Methodennamen quer durch `core/`
und die uebrigen Features.

Bis dahin gilt: **Neues immer englisch benennen, Bestand nicht nebenbei anfassen.**

---

## 2026-09-05 – Claude Opus 5 (Anthropic) – Bewerbungsweg für Beta-Zugänge gebaut

**Art:** Feature
**Betroffen:** `supabase/schemas/96_platform_admin.sql`, drei Migrationen, `supabase/tests/platform_admin.sql`, `supabase/functions/beta-application/`, `supabase/config.toml`, `landing/index.html`, `deploy/Caddyfile`, `scripts/landing-page.test.mjs`, `src/app/core/services/platform-operator.service.ts`, `src/app/core/guards/operator.guard.ts`, `src/app/features/platform-admin/`, `src/app/app.routes.ts`, `src/app/layout/sidebar/`
**Was:** Ein Interessent bewirbt sich über die Landing Page, der Betreiber sieht die Bewerbung unter `/admin` und entscheidet darüber. Vier Tasks: Betreiberrolle und Bewerbungstabelle mit RLS, Edge Function als einziger Schreibweg, Bewerbungsformular, Betreiberbereich.
**Warum:** Die Oberfläche des Deal Monitors war geplant, wurde aber zurückgestellt — ohne steuerbaren Zugang gibt es keine Beta. Die Registrierung unter `/auth/register` ist offen, `enable_confirmations = false`, und die „Beta anmelden"-Formulare der Landing Page speicherten nichts, sondern leiteten nur in genau diese offene Registrierung weiter.
**Was die Prüfungen gefunden haben:** Der Pfeffer für den Streuwert der Herkunft fiel still auf leer zurück und war nirgends gesetzt — in Produktion wäre es ungesalzenes SHA-256 über die IP-Adresse gewesen, vollständig zurückrechenbar. Die Drosselung las den ersten, vom Aufrufer selbst setzbaren Eintrag aus `x-forwarded-for`; ein Bot hätte je Anfrage ein frisches Kontingent gehabt. Beides ist behoben, dazu kam eine Gesamtgrenze, die ohne Angaben des Aufrufers auskommt. Die Content-Security-Policy hätte das neue Formularskript in Produktion blockiert (`script-src 'none'`, kein `connect-src`) — das Formular wäre wirkungslos gewesen, ohne sichtbaren Fehler; jetzt über die sha256-Prüfsumme des Skripts erlaubt, kein `'unsafe-inline'`, und ein Test rechnet die Prüfsumme nach. Die Rückmeldung des Formulars wäre immer deutsch geblieben, weil `document.documentElement.lang` hier statisch ist. Und `db diff` hat zum dritten Mal in diesem Projekt die Rechte-Anweisungen nicht mitgenommen.
**Verifiziert durch:** `npm run test:db` 1023/1023, `npm run test:landing` 13/13, `npm run verify` Exitcode 0 ohne Pipe gemessen. Rechte nach frischem `db reset` zurückgelesen. An der Datenbank nachgestellt: Ein Betreiber sieht die Bewerbungen, ein anderer Angemeldeter sieht null, und der Trigger stempelt den richtigen Entscheider samt Zeitpunkt. Die Edge Function gegen den lokalen Stack gemessen: gültig 200, fremde Herkunft 403, fehlende Einwilligung 400, Drosselung 429, ohne Pfeffer 500 ohne neue Zeile.

## 2026-09-05 – Claude Opus 5 (Anthropic) – Entwurf: Betreiberbereich und Beta-Zugänge

**Art:** Doku
**Betroffen:** `docs/superpowers/specs/2026-09-05-betreiberbereich-und-beta-zugaenge-design.md`
**Was:** Entwurf für einen Betreiberbereich, über den Beta-Zugänge vergeben, befristet und entzogen werden. Umfasst Bewerbungsweg über die Landing Page, Lizenz je Arbeitsbereich, Sperre als Nur-Lesen, Betreiberrolle mit bewusst engem Einblick, und die E-Mail-Grundlage. Zerfällt in vier Pläne.
**Warum:** Die Oberfläche des Deal Monitors war geplant, wurde aber zurückgestellt: Ohne steuerbaren Zugang gibt es keine Beta, und ohne Beta niemanden, der die Oberfläche benutzt. Beim Aufnehmen des Bestands kamen mehrere offene Flanken zusammen — die Registrierung unter `/auth/register` ist offen, `enable_confirmations = false`, die „Beta anmelden"-Formulare der Landing Page speichern nichts, sondern leiten nur in die offene Registrierung weiter, und `flipbase.de` hat weder MX- noch SPF- noch DMARC-Eintrag, kann also keine Mail empfangen und niemanden zum Senden berechtigen. Der Punkt „echter SMTP-Versand" steht seit dem Sanierungsplan vom 19.08.2026 offen.
**Entscheidungen mit Begründung:** Betreiberbereich **in** Flipbase statt eigener App — die Befugnis liegt ohnehin in der Datenbank, eine zweite Auslieferungskette kostet Wochen und schützt nichts, was RLS nicht schon schützt; der Bereich wird nur so geschnitten, dass ein späterer Umzug ein Verschieben bleibt. Sperre als Nur-Lesen statt Zugangsstopp — niemand soll von seinen eigenen Geschäftszahlen ausgesperrt werden; das ist die teurere Variante, wird aber machbar, weil 144 Schreib-Policies fast alle über denselben Helfer laufen und mechanisch auf einen lizenzbewussten Helfer umgestellt werden können, abgesichert durch einen Wächtertest über `pg_policies`. Kein eigener Mailserver — nicht wegen der Kosten, sondern weil eine frische Hetzner-IP keinen Ruf hat und das Versagen unsichtbar ist. Betreiber bekommt **keinen** Lesezugriff auf Geschäftsdaten, nur Zahlen aus einer eigenen Funktion.
**Verifiziert durch:** Reiner Entwurf, kein Code. Alle Befunde am 05.09.2026 am Bestand geprüft: Policy-Zahlen aus `supabase/schemas/database.sql`, Auth-Einstellungen aus `supabase/config.toml`, Formularziele aus `landing/index.html`, DNS-Einträge per Abfrage gegen 1.1.1.1.

## 2026-09-05 – Claude Opus 5 (Anthropic) – Handgepflegte Freigabeliste wieder entfernt

**Art:** Integration
**Betroffen:** `deploy/approved-migrations.sha256` (entfällt), `docs/AI-CHANGELOG.md`
**Was:** Den umgebauten master (Wiederverwendung geprüfter PR-Läufe, automatische Migrationspakete) in den Zweig geholt. Einziger Konflikt: die Freigabeliste, die ich am selben Tag noch von Hand gepflegt hatte und die master gelöscht hat. Die Löschung übernommen.
**Warum:** Der Eintrag von Hand war zum Zeitpunkt der Erstellung richtig und ist es seit `18391e8` nicht mehr: Der Docker-Bau erzeugt die Integritätsliste jetzt selbst, und AGENTS.md sagt ausdrücklich „Keine Prüfsummen von Hand pflegen". Die inhaltliche Freigabe bleibt trotzdem gültig und ist im Commit davor begründet — sie liegt jetzt im Review der SQL-Dateien, nicht in einer Liste.
**Geprüft am neuen Weg:** Der Nachweis (`verified-tree-v1-<Baum>-<Umfang>`) wird erst **nach** bestandener Sammelprüfung hochgeladen, im selben Job und ohne `always()` — er kann also nicht ohne grüne Prüfung entstehen. Er hängt am Baum-Hash, nicht am Commit: Ein Merge, bei dem etwas aufgelöst wurde, erzeugt einen anderen Baum und fällt auf die vollen Prüfungen zurück. `required-checks.mjs` verlangt bei Wiederverwendung von jedem Job exakt `skipped` und als Ereignis `push`, sonst exakt `success` je geändertem Bereich — ein halb gelaufener Zustand kommt nicht durch. Das Produktionsabbild wird nie wiederverwendet. Fehler beim Nachweis führen zum vollen Lauf, nicht zur Veröffentlichung ohne Prüfung.
**Verifiziert durch:** Nach dem Merge frisches `supabase db reset`, `npm run test:db` grün, Dienst-Tests und Bau grün, `npm run verify` Exitcode 0 ohne Pipe gemessen.

## 2026-09-05 – Claude Opus 5 (Anthropic) – Trefferregel auf den neuen Release-Weg gehoben

**Art:** Integration
**Betroffen:** `deploy/approved-migrations.sha256`, `docs/AI-CHANGELOG.md`, `src/app/core/models/supabase.types.ts`
**Was:** master (Warenwirtschafts-Umbau, 253 Dateien) in den Zweig geholt, die beiden Konflikte aufgeloest - Changelog beide Bloecke, Typdatei nach dem Einspielen neu erzeugt statt von Hand zusammengefuehrt. Die drei Sniper-Migrationen mit SHA256 in die Freigabeliste eingetragen.
**Warum:** Ohne Freigabeeintrag bricht `apply-release-migrations.sh` mit „Nicht freigegebene Migration" ab, und die Trefferregel kaeme nie in die Produktion. Die Freigabe bestaetigt fuer alle drei Dateien: vollstaendig transaktionales SQL, keine eigenen `begin`/`commit`, keine psql-Metabefehle, kein Zugriff auf `supabase_migrations`, nichts Nichttransaktionales. Das `drop function` in `20260904221945` trifft nur die einarmige Vorgaengerfassung, die im selben Schritt ersetzt wird - keine Daten. Die Zeitstempel liegen vor der bereits eingespielten `20260904234857`; der Runner geht nach Historie, nicht nach Reihenfolge, und holt sie deshalb nach. Nebenbei: Der PR loeste keinen CI-Lauf aus, solange er konfliktbehaftet war - GitHub bildet dann keinen Merge-Stand.
**Verifiziert durch:** Nach dem Merge frisches `supabase db reset`, `npm run test:db` **1001/1001** ueber 26 Dateien (nicht `supabase test db` direkt - der ueberspringt `pretest:db` und laesst erzeugte Include-Dateien fehlen). Rechte danach ausgelesen: masters Release-Rechte-Migration laeuft zeitlich nach meinen und hat sie nicht ueberschrieben - `sniper_evaluate_hits` weiterhin weder fuer anon noch authenticated. `sha256sum -c` gegen alle vier Eintraege OK. Dienst: Typpruefung 0, 79 Unit-, 16 Integrationstests, Bau 0. `npm run verify` Exitcode 0 ohne Pipe gemessen.

## 2026-09-05 – Claude Opus 5 (Anthropic) – Schlusspruefung der Trefferregel: drei Betriebsfaelle behoben

**Art:** Bugfix
**Betroffen:** `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260904224143_evaluate_hits_respect_paused_subscriptions.sql`, `supabase/migrations/20260904222600_revoke_role_grants_on_sniper_functions.sql`, `services/sniper/src/runtime/scheduler.ts`, `services/sniper/test/runtime/scheduler.spec.ts`, `supabase/tests/deal_monitor_evaluate_hits.sql`, `supabase/tests/deal_monitor_reference_price.sql`, `supabase/tests/deal_monitor_subscription_rpc.sql`, `docs/superpowers/plans/2026-09-04-deal-monitor-trefferregel.md`
**Was:** (1) Der Taktgeber setzt `markSeeded` erst, wenn die Bewertung wirklich durchlief. (2) `sniper_evaluate_hits` hakt nichts mehr ab, solange kein Abonnement aktiv ist. (3) Der Massstab wird je Zustand gerechnet statt je Angebot. Dazu: Die Standardattrappen im Taktgeber-Test kannten `evaluateHits` nicht, der pgTAP-Test auf doppelte Treffer bestand aus dem falschen Grund, und die Rechte-Migration wurde auf `sniper_reference_price` und `create_sniper_subscription` ausgeweitet.
**Warum:** Alle drei sind Betriebsfaelle, die eine Pruefung je Commit nicht sieht. Zu (1): Ein einziger Netzfehler beim Einlese-Lauf haette genuegt - die Abfrage gaelte als eingelesen, der Bestand truege aber keinen Vermerk, und der naechste Durchgang meldete ihn vollstaendig. Genau der Schwall, den der Vorgaengercommit verhindern sollte. Zu (2): Wer seinen Filter einen Tag pausiert, haette jedes Schnaeppchen dieses Tages endgueltig verloren, denn `create_sniper_subscription` schaltet ihn beim erneuten Anlegen wieder aktiv. Zu den Tests: Zwoelf Taktgeber-Tests liefen durch den Fehlerzweig, weil `evaluateHits` in der Attrappe fehlte und der Taktgeber den `TypeError` schluckt - der Test „laesst eine gescheiterte Bewertung den Durchgang nicht abbrechen" haette auch ohne Fehler bestanden.
**Verifiziert durch:** `supabase db reset` frisch eingespielt, `supabase test db` 266/266. Rechte nach dem Wiedereinspielen ausgelesen: `sniper_evaluate_hits` weder fuer anon noch authenticated, `sniper_reference_price` und `create_sniper_subscription` nicht fuer anon. Dienst: `tsc --noEmit` 0 (fing eine Typluecke, die die Tests nicht zeigten), 79 Unit-, 16 Integrationstests, Bau 0. `npm run verify` Exitcode 0 ohne Pipe gemessen. Nachgestellt: pausiertes Abonnement meldet 0 und hakt 0 ab, nach dem Wiedereinschalten kommt der Fund an (1).

**Offen, bewusst nicht behoben:** Der Vergleichspreis zaehlt nur Angebote mit `discovered_by_query_id = <diese Abfrage>`. Weil `saveNew` nach „erster Fund gewinnt" schreibt, nehmen zwei Abfragen mit demselben Suchbegriff und verschiedenen Preisgrenzen einander Vergleichsmaterial weg. Nachgestellt: Ein voellig durchschnittliches 35-Euro-Angebot wurde als 45 Prozent unter dem Massstab gemeldet, weil die erste Abfrage die guenstige Haelfte fuer sich gebucht hatte. Die Loesung beruehrt das Datenmodell (Zuordnungstabelle `sniper_listing_queries` oder Massstab ueber den Filter statt ueber den Finder) und gehoert deshalb in eine eigene Entscheidung vor der Discord-Zustellung.

## 2026-09-05 – Claude Opus 5 (Anthropic) – Trefferbildung nur noch fuer ungepruefte Angebote

**Art:** Bugfix
**Betroffen:** `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260904221945_evaluate_hits_only_new_listings.sql`, `supabase/migrations/20260904222600_revoke_authenticated_on_evaluate_hits.sql`, `services/sniper/src/store/listing.store.ts`, `services/sniper/src/runtime/scheduler.ts`, `supabase/tests/deal_monitor_evaluate_hits.sql`, `supabase/tests/vinted_deal_monitor_schema.sql`, `services/sniper/test/`
**Was:** `sniper_listings` bekommt `evaluated_at`. `sniper_evaluate_hits` prueft nur noch Angebote ohne diesen Vermerk und nimmt `p_report_hits`; der Einlese-Lauf ruft die Funktion mit `false` und hakt den vorgefundenen Bestand stumm ab. Angebote ohne brauchbaren Massstab bleiben offen und kommen wieder dran. Dazu eine handgeschriebene Migration, die `execute` fuer anon und authenticated entzieht.
**Warum:** Die Bewertung lief ueber alle Angebote einer Abfrage und sass vor der Einlese-Weiche. Der Entwurf legt aber fest: „bei is_seeded = false: nur schreiben, nichts melden". Gemessen an einem Bestand von 96 Angeboten mit 40-Prozent-Schwelle haette die erste Runde einer neuen Abfrage **25 Treffer** ausgeworfen – wochenalte, teils verkaufte Angebote, die mit der Discord-Zustellung sofort herausgegangen waeren. Nebenbei hing der Aufwand je Runde an der Tabellengroesse statt an der Zahl neuer Funde. Der Rechteentzug war noetig, weil die Vorgaberechte des Projekts jeder neuen Funktion im Schema `public` automatisch `execute` an `authenticated` geben und `supabase db diff` nur `revoke ... from public` erzeugt – die Funktion laeuft mit `security definer` und schreibt in `sniper_hits`.
**Verifiziert durch:** `supabase db reset` frisch eingespielt, danach `supabase test db` 263/263. Der neue Rechte-Test fiel beim ersten Lauf tatsaechlich durch (`authenticated=X` in der Rechteliste) und ist nach der Migration gruen. Dienst: `tsc --noEmit` 0, 78 Unit-Tests, 16 Integrationstests, `npm run build` 0. `npm run verify` Exitcode 0 (ohne Pipe gemessen). Messung am 96er-Bestand: Einlese-Lauf 0 Treffer, Folgelauf 0 – der alte Ablauf haette 25 gemeldet.

## 2026-09-04 – Claude Opus 5 (Anthropic) – Dienst bewertet nach jedem Speichern

**Art:** Feature
**Betroffen:** `services/sniper/src/store/listing.store.ts`, `services/sniper/src/runtime/scheduler.ts`, `services/sniper/test/runtime/scheduler.spec.ts`, `services/sniper/test/store/listing.store.integration.spec.ts`, `services/sniper/test/health.spec.ts`
**Was:** `ListingStore.evaluateHits(queryId)` ruft `public.sniper_evaluate_hits` per RPC auf. Der Taktgeber (`QueryScheduler`) ruft sie nach jedem `saveNew()`-Aufruf und zaehlt die neu entstandenen Treffer in `CycleReport.newHits`. Eine gescheiterte Bewertung faengt ein eigener try/catch ab: der Fund bleibt gespeichert, die Abfrage gilt weiter als gepollt, nur geloggt wird der Fehler - sonst holte der naechste Durchgang dieselben Artikel erneut bei Vinted.
**Warum:** Die Datenbank konnte seit der letzten Sitzung aus Funden Treffer machen, aber nichts rief sie auf - der Sammeldienst speicherte und ging weiter. Letzte Aufgabe des Plans "Deal Monitor Trefferregel": Treffer entstehen jetzt bei jedem Durchgang (gesehen werden sie noch nicht - Oberflaeche und Discord-Zustellung sind eigene, offene Plaene).
**Verifiziert durch:** Test zuerst: die beiden Tests aus dem Auftrag angefuegt, `npm test` zeigte den erwarteten Fehlschlag (`evaluateHits` nicht definiert), dann implementiert. `npx tsc --noEmit` deckte zusaetzlich 4 Fehler in `test/health.spec.ts` auf, die `npm test` nicht zeigte (Attrappe ohne `newHits`) - behoben. Danach im Dienstverzeichnis: `npx tsc --noEmit` 0 Fehler, `npm test` 77/77, `npm run test:integration` 14/14 gegen die laufende lokale Datenbank, `npm run build` 0 Fehler. Im Stammverzeichnis: `npm run test:db` 260/260, `npm run verify` Exitcode 0 (ohne Pipe gemessen). Manueller Nachweis gegen die lokale Datenbank ueber die echte `ListingStore`-Klasse: acht gleichwertige Vergleichswerte, ein kuenstlich guenstiger Fund, ein neuer Treffer mit `reference_price = 50` und `discount_percent = 40` in `sniper_hits`, ein wiederholter Aufruf folgenlos.

---

## 2026-09-04 – Claude Opus 5 (Anthropic) – Trefferregel je Abonnement

**Art:** Feature
**Betroffen:** `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260904214229_sniper_evaluate_hits.sql` (neu), `supabase/tests/deal_monitor_evaluate_hits.sql` (neu)
**Was:** Neue `security definer`-Funktion `sniper_evaluate_hits(query_id)`. Sie bewertet je aktivem Abonnement einer Abfrage, ob ein gefundenes Angebot unter dem Massstab aus `sniper_reference_price` liegt und die Schwelle des jeweiligen Abonnements unterschreitet, und legt fehlende Zeilen in `sniper_hits` an. Massstab und Abstand werden am Treffer festgehalten statt spaeter neu gerechnet. `on conflict (subscription_id, listing_id) do nothing` macht wiederholte Laeufe folgenlos, deaktivierte Abonnements bleiben aussen vor.
**Warum:** Derselbe Fund kann fuer einen Arbeitsbereich ein Treffer sein und fuer den naechsten nicht, weil die Schwelle am Abonnement haengt - Bewertung muss also je Abonnement laufen, nicht je Abfrage. Ohne den festgehaltenen Massstab waere spaeter nicht mehr nachvollziehbar, warum ein Treffer gemeldet wurde, sobald sich der Median mit neuen Funden verschiebt.
**Verifiziert durch:** Test zuerst (pgTAP, `plan(4)`): Fehlschlag `function ... does not exist` bestaetigt, dann Funktion ergaenzt. Migration per `npx supabase db diff -f sniper_evaluate_hits` erzeugt; der Abgleich revoke'te `EXECUTE` nur von `PUBLIC`, nicht von `authenticated` - Supabase vergibt neuen Funktionen per Voreinstellung ein zusaetzliches explizites `EXECUTE` an `authenticated`, das ein reines `PUBLIC`-Revoke nicht zieht. Von Hand um `anon, authenticated` ergaenzt und nach erneutem `db reset` gegenverifiziert: `information_schema.role_routine_grants` zeigt nur `postgres` und `service_role`, `has_function_privilege('authenticated', ...)` und `('anon', ...)` liefern beide `false`. `npm run test:db` → 12 Dateien, 260 Tests, alle gruen, exit 0. `npm run verify` exit 0, ohne Pipe gemessen.

---

## 2026-09-05 – Codex (GPT-6) – PR und Zusammenführung vorbereitet

**Art:** Integration | Test

**Betroffen:** Warenwirtschaftsumbau und aktueller Master

**Was:** Auf ausdrücklichen Wunsch PR und Merge vorbereitet; aktuelle Deal-Monitor-Änderungen übernommen und beide Protokollstände erhalten.

**Warum:** Den vollständigen gemeinsamen Stand vor der Veröffentlichung prüfen.

**Verifiziert durch:** Abschließender lokaler Verify-Lauf und GitHub-Prüfungen folgen auf dem integrierten Stand.

## 2026-09-05 – Codex (GPT-5; Review mit GPT-5.6 Sol) – Landingpage-Finalreview korrigiert

**Art:** Bugfix | Barrierefreiheit | Test | Doku

**Betroffen:** `landing/index.html`, `scripts/landing-page.test.mjs`, Landingpage-Plan und SDD-Nachweise

**Was:** Die im finalen Review gefundenen Lücken der ersten Landingpage-Runde geschlossen. Englische Varianten tragen nun eine englische Sprachauszeichnung; bisher fest deutsche Vergleichs-, Status-, Formular- und Copyright-Texte sowie die statischen Namen wichtiger Bedienelemente wechseln mit der Seitensprache. Alle sichtbaren Deal-Sniper-Erwähnungen kennzeichnen die Funktion als geplant oder entfallen. Absolute Steuer-, DATEV- und Prüfungszusagen wurden durch technisch begrenzte Beschreibungen mit ausdrücklichem Prüfvorbehalt ersetzt. Der passive Ressourcenvertrag erfasst zusätzlich CSS-Imports und -URLs, weitere ressourcenladende Elemente, `javascript:`-URLs und Ereignisattribute, erlaubt aber weiterhin den Caddy-Zweig, normale Navigationsziele und eingebettete `data:`-Ressourcen.

**Warum:** Der erste Abschlusslauf prüfte Darstellung und Interaktion, aber nicht alle Sprachwechsel im DOM, jede Produktbehauptung und alle Wege zu aktivem oder entfernt geladenem Inhalt. Der statische Vertrag muss genau diese Rückfälle erkennen.

**Verifiziert durch:** Vier getrennte RED-Läufe gegen den vorherigen Stand (Sprache/Screenreader-Namen, vollständiger Deal-Sniper-Status, vorsichtige Compliance-Texte und 15 aktive Ressourcenvarianten) sowie ein zusätzlicher RED-Nachweis für die beim Diff-Selbstreview gefundene absolute Beispielrechnungs-Copy; unabhängiger finaler Review und Re-Review ohne offenen Critical-/Important-Befund; anschließend 13/13 statische Landingpage-Tests und `npm run verify` mit Exitcode 0. Die frisch aufgebaute Caddy-Abnahme bestand Deutsch/Englisch × Hell/Dunkel × Desktop/Mobil ohne Überlauf, AXE-, Konsolen-, Seiten- oder Assetfehler; Theme/Sprache per Leertaste, FAQ per Enter und beide im Browserkontext abgefangenen Registrierungs-GET-URLs wurden geprüft. Der exakt benannte temporäre QA-Container wurde danach automatisch entfernt.

## 2026-09-04 – Codex (GPT-5; Umsetzung und Review mit GPT-5.6 Sol) – Landingpage erste Korrekturrunde

**Art:** Bugfix | Barrierefreiheit | Test

**Betroffen:** `landing/index.html`, Landingpage-Vertrag und vollständige Prüfkette

**Was:** Die zweisprachige Landingpage zunächst auf direkte Beta-Registrierung ausgerichtet, mehrere Deal-Sniper- und Compliance-Texte begrenzt sowie Tastaturfokus, Überschriften, Kontrast und mobile Kopfzeile korrigiert. Einen ersten statischen Landingpage-Vertrag in `npm run verify` aufgenommen. Ein späterer finaler Review fand noch offene Sprachmetadaten, nicht umgeschaltete Texte, weitere Produkt- und Rechtsbehauptungen sowie Lücken im Ressourcenvertrag; diese Runde war daher kein vollständiger Abschluss.

**Warum:** Sichtbare Aussagen müssen zum aktuellen Produktverhalten passen; die Seite muss auf kleinen Displays und per Tastatur zuverlässig nutzbar sein, ohne unbelegte rechtliche oder betriebliche Zusagen.

**Verifiziert durch:** Der damalige Stand bestand 11/11 statische Landingpage-Tests, `npm run verify` und den produktionsnahen Caddy-Lauf für Deutsch/Englisch, Hell/Dunkel und 1440 × 1000/390 × 844. Diese Prüfungen fanden die später gemeldeten semantischen und inhaltlichen Lücken nicht; sie gelten deshalb nur als historischer Nachweis der ersten Runde, nicht als finale Freigabe.

## 2026-09-04 – Codex (GPT-5; Umsetzung und Review mit GPT-5.6 Terra/Sol) – Einstellungsseiten aufteilen

**Art:** Refactoring | Test

**Betroffen:** Einstellungen, Unterseiten und zugehörige Verhaltenstests

**Was:** Die sieben bisherigen Einstellungsbereiche in eigenständige Lazy-Loading-Seiten aufgeteilt und die globale Daten-/Protokollseite samt Archivierung erhalten. Die vollständigen gerenderten Verhaltenstests wiederhergestellt, veraltete asynchrone Speicherantworten zwischen Workspaces isoliert und verständliche Fallback-Meldungen ergänzt. Der abschließende Gesamt-Review hat zusätzlich die Mystery-Box-Centverteilung, die Vollständigkeit des Prüfarchivs, Einzelbeleg-PDF-Einstiege und Rollen, die Verkaufspreispräzision, lokale Datumsgrenzen sowie zwei kleinere Einkaufsformular-Inkonsistenzen korrigiert. Eine automatisch erzeugte Migration ersetzt ausschließlich die vier betroffenen Datenbankfunktionen. Kein Push oder Deployment.

**Warum:** Die Navigation soll getrennte, wartbare Seiten laden, ohne bestehende Funktionen zu verlieren. Geldwerte müssen centgenau und nachvollziehbar bleiben; das Prüfarchiv muss die Geschäftsdatensätze rekonstruierbar enthalten.

**Verifiziert durch:** Unabhängige Task- und Whole-Branch-Reviews ohne offenen Merge-Blocker; `npm run verify` Exitcode 0 mit 983 Node-, 130 DOM- und 359 Angular-Tests; Produktionsbuild erfolgreich; frische isolierte Datenbank mit 20 Dateien und 958 Prüfungen vollständig grün; sechs Chromium-E2E-Tests grün; alle acht Einstellungsbereiche auf Desktop/Mobil und Hell/Dunkel mit 32 bereichsbezogenen AXE-Prüfungen ohne Fund sowie ohne Konsolenfehler. Ein erster Datenbanklauf traf eine fremde veraltete Standardinstanz und wurde verworfen; der maßgebliche Lauf erfolgte auf einer frisch aufgebauten, danach entfernten Isolationsinstanz.

---

## 2026-09-04 – Codex (GPT-5; Umsetzung und Reviews mit GPT-5.6 Terra/Sol) – Einzelverlauf und Workspace-Archivierung fortgesetzt

**Art:** Feature | Test

**Betroffen:** Lokaler Änderungsverlauf, Workspace-Lebenszyklus und Aufbewahrungsansicht

**Was:** Änderungsverlauf direkt an Einkauf, Artikel und Verkauf ergänzt (`6f27a68`). Eine gemeinsame Darstellung bleibt datenfrei; ein Feature-Container verwendet den bestehenden Abfrageservice. Arbeitsbereiche lassen sich durch ihren Inhaber archivieren und wiederherstellen (`029ee41`); Geschäftsdaten bleiben lesbar und exportierbar, operative Änderungen werden serverseitig gesperrt. Der Löschablauf bietet zuerst einen Export an und verweist bei vorhandenen Geschäftsdaten auf Archivierung. Beide automatisch erzeugten Migrationen einschließlich der Rechtekorrektur gehören zusammen. Bestehende Routen, globale Exporte und vorherige Integrationskorrekturen bleiben erhalten. Settings-Aufteilung und Landingpage gehören weiterhin zu getrennten Folgeschritten.

**Warum:** Verlauf direkt am betroffenen Datensatz verfügbar machen und Geschäftsdaten beim Archivieren lesbar erhalten, ohne neue Buchungen zuzulassen.

**Verifiziert durch:** Abschließendes `npm run verify` auf `029ee41` mit Exitcode 0: 1.428 Anwendungstests bestanden (971 Node, 130 DOM, 327 Angular; fünf bestehende Tests übersprungen), Formatierung, Lint, Typprüfung, Workflowprüfungen und Produktionsbuild bestanden. Getrennte lokale Datenbank `flipbase-settings-retention`: 952 Prüfungen in 20 Dateien bestanden; Schema-Abgleich leer und Advisors ohne Befund. Zwei echte parallele Datenbanksitzungen bestätigen die gegenseitige Sperre zwischen Buchung und Archivierung. Alle sechs Chromium-Tests bestanden. Zusätzliche Demo-Browserprüfungen auf Desktop und Mobil: Verlauf, Einkaufs-Rücknavigation, Verkaufsdialog mit Escape/Fokusrückgabe, richtiges Workspace-Ziel und reaktive URL-Navigation; AXE für die neuen Ansichten ohne Befunde, keine Konsolenfehler. Befüllte Verläufe und Inhaberaktionen sind durch Komponenten-/Datenbanktests, nicht durch einen angemeldeten Browser-End-to-End-Test belegt. Die vorhandene mobile Überbreite der Verkaufsliste bleibt als separater Befund offen. Beide unabhängigen Aufgabenreviews freigegeben, keine kritischen oder wichtigen Befunde. Der ergänzende angemeldete Inhaber-Browsertest bleibt als kleinere Testlücke dokumentiert. Kein Push oder Deployment.

---

## 2026-09-04 – Codex (GPT-5; Reviews und Umsetzung mit GPT-5.6 Sol/Terra) – Kostenbasis und Prüfarchiv abgesichert

**Art:** Bugfix | Test | Dokumentation

**Betroffen:** Kostenberechnung, Dashboard, Prüfarchiv, Supabase-Schema, Deployment-Prüfungen

**Was:** Sechs bestätigte Review-Bereiche korrigiert: unbekannte Kosten, exakter Restwert, Diagrammlücken, gemeinsamer Archiv-Snapshot, vollständige Kostenexporte und deklarative Rechte. Aktuelle Einkaufsdaten gehen älteren eingebetteten Beziehungen vor. Vorhandene Exportrechte der Buchhaltung erhalten. Migration automatisch in einem isolierten lokalen Projekt erzeugt und geprüft. Fremde Arbeitszweige und Änderungen bleiben unberührt.

**Warum:** Keine scheinbaren Gewinne aus fehlenden Nullkosten und kein aus mehreren Zeitständen zusammengesetztes Prüfarchiv. Die zusätzlichen Kostendateien sichern die Nachvollziehbarkeit. Das Archiv bricht oberhalb von 100.000 Datensätzen oder 50 MiB JSON ausdrücklich ab.

**Verifiziert durch:** Finales `npm run verify` mit Exitcode 0, 1.404 Anwendungstests bestanden (fünf bestehende übersprungen), sechs Browsertests bestanden, 864 Datenbank-Assertions bestanden. Kritische Abdeckung aller sechs ausgewählten Dateien über unveränderten 95/90-Grenzen. Sniper-Typprüfung und 73 Tests bestanden. Kein Push und kein Deployment. Offene ursprüngliche Settings-Aufgaben und Landingpage-Befunde im Abschlussbericht `docs/superpowers/reports/2026-09-04-overhaul-integration-result.md` dokumentiert.

---

## 2026-09-04 – Codex (GPT-5) – Master in den Warenwirtschaftsumbau integriert

**Art:** Integration | Analyse | Test

**Betroffen:** `feature/purchase-inventory-overhaul`, CI, Warenwirtschaft, Prüfarchiv und Landingpage

**Was:** `origin/master` bis `a2ccddb` ausschließlich in den eigenen Arbeitszweig übernommen. Den einzigen Merge-Konflikt im Änderungsprotokoll unter Erhalt beider Seiten aufgelöst. Unabhängige Reviews für Fachlogik und CI beauftragt; bestätigte Kosten-/Archivfehler werden in einer getrennten Korrektur nachgeführt. Landingpage-Befunde stehen im zugehörigen Bericht.

**Warum:** Änderungen von Claude Code und Gemini erhalten und den gemeinsamen Stand prüfen, ohne fremde Arbeitszweige oder deren lokale Datenbank zu überschreiben.

**Verifiziert durch:** Gemeinsamer Produktionsbuild erfolgreich; erster gemeinsamer Testlauf 1.383 bestanden, fünf übersprungen. Separater lokaler Supabase-Testdienst `flipbase-overhaul-integration`: alle Migrationen angewendet, 18 Dateien/842 Datenbanktests bestanden, Datenbank-Lint ohne Fehler. Schema-Abgleich zeigt noch Rechteabweichungen und wird nachgeführt. Bestehende Browsertests hatten veraltete Bezeichnungen; deren gezielte Anpassungen bestanden anschließend vier Tests. Noch keine abschließende Gesamtfreigabe, kein Push oder Deployment.

---

## 2026-09-04 – Codex (GPT-5) – Parallele Optimierungen und Landingpage abgeglichen

**Art:** Analyse

**Betroffen:** `origin/master` bis `a2ccddb`, CI, Deployment, Auth, Landingpage und Warenwirtschafts-Branch

**Was:** Remote-Referenzen aktualisiert und Änderungen seit der gemeinsamen Basis gelesen. Die beidseitig geänderten Pfade sind fünf inhaltlich identische Plan-/Spezifikationsdateien; direkte Anwendungscode-Überschneidungen sind nicht sichtbar. Die neue tägliche Coverage-Auswahl enthält die neue `sale-metrics.ts` noch nicht. Im aktuellen Deployment wird ein fehlgeschlagener Landingpage-Kopiervorgang durch `|| true` verdeckt; der Deploy-Job wartet nicht auf `sniper-gate`. Landingpage-Texte zu Beta-Freischaltung, Datenschutz und Deal-Sniper-Funktionen müssen gegen den tatsächlich verfügbaren Funktionsumfang geprüft werden.

**Warum:** Fremde Optimierungen erhalten und den gemeinsamen Stand nach dem großen Umbau gezielt prüfen. Die Landingpage erhält anschließend eine gesonderte technische, inhaltliche und zugängliche Prüfung.

**Verifiziert durch:** Git-Historie, Dateischnittmenge und gezielte Quellcode-Diffs. Keine Zusammenführung, keine Änderungen an fremden Zweigen, keine neuen Testläufe und kein Deployment. Der frühere grüne Prüflauf gilt nicht als Nachweis für den noch nicht integrierten Gesamtstand.

---

## 2026-09-04 – Codex (GPT-5) – Unterbrochenen Arbeitsstand geprüft

**Art:** Analyse

**Betroffen:** Branch `feature/purchase-inventory-overhaul`

**Was:** Gespeicherten Branch, Arbeitsverzeichnis und letzte Commits geprüft. Der Stand endet bei `90b28be`; die zusätzliche unabhängige Abschlussprüfung wurde durch ein Nutzungslimit unterbrochen.

**Warum:** Nach der Unterbrechung den tatsächlichen Fortschritt und die noch offene Abschlussprüfung nachvollziehbar benennen.

**Verifiziert durch:** Git-Status vor diesem Protokolleintrag sauber; acht lokale Umbau-Commits vorhanden. Build und Tests in dieser Sitzung nicht erneut ausgeführt. Kein Push oder Deployment vorgenommen.

## 2026-09-04 – Claude Opus 5 (Anthropic) – Schlussprüfung des Deal-Monitor-Zweigs behoben

**Art:** Bugfix | Sicherheit | Test | Doku
**Betroffen:** `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260904182349_harden_sniper_subscription_rpc.sql` (neu), `supabase/migrations/20260904183000_backfill_legacy_sniper_query_keys.sql` (neu), `supabase/tests/vinted_deal_monitor_schema.sql`, `supabase/tests/deal_monitor_subscription_rpc.sql`, `docs/AI-CHANGELOG.md`
**Was:** Neun Befunde einer Schlussprüfung des ganzen Zweigs vor dem Zusammenführen behoben, alle in `create_sniper_subscription` und den Sniper-Tabellen: (1) `p_price_from`/`p_price_to` werden jetzt vor der Schlüsselbildung auf zwei Nachkommastellen gerundet, damit z. B. `50.567` und `50.566` dieselbe Abfrage teilen statt zwei anzulegen; (2) `check`-Bedingungen verbieten negative Preise, eine vertauschte Preisspanne wirft jetzt eine eigene Ausnahme; (3) `on conflict (workspace_id, query_id) do update` übernimmt die neue Schwelle und setzt das Abonnement aktiv – vorher gab es keinen Weg, eine einmal gesetzte Schwelle zu ändern; (4) `on conflict (query_key) do update` setzt eine stillgelegte Abfrage (`is_active`, `consecutive_failures`) beim Neuanlegen zurück; (5) `v_search_text = ''` prüft jetzt auch auf `null`; (6) neue, von Hand geschriebene Migration zieht alte fünfteilige `query_key`-Werte auf das neue sechsteilige Format nach (auf leeren Datenbanken folgenlos); (7) `vinted_deal_monitor_schema.sql` prüft jetzt wie die anderen Sniper-Testdateien, dass `anon` auf `sniper_queries`/`sniper_listings` keinerlei Rechte hat und `authenticated` genau `SELECT`; (8) der Testblock zur doppelten Anlage prüft jetzt tatsächlich, dass die zweite Schwelle (40) übernommen wird, plus ein neuer Block für die Rundung aus (1); (9) vier fehlende Sitzungen im Changelog nachgetragen (Abonnement-Tabelle/`price_from`, Sichtbarkeit auf Abonnenten umgestellt, Anlegefunktion, ESLint-Fix für fremde Arbeitsordner).
**Warum:** Die Prüfung fand reale Lücken, auch wenn die Produktionsdatenbank aktuell null Zeilen in `sniper_queries`/`sniper_listings` hält (geprüft) – die Korrekturen sind vorsorglich, nicht rettend. Ohne Rundung hätte der Abonnement-Mechanismus genau das Doppelpollen erzeugt, das er verhindern soll. Ohne einen Weg, die Schwelle zu ändern, wäre die in der Spezifikation zugesagte Nachjustierbarkeit eine Lüge in der Oberfläche gewesen. Eine stillgelegte Abfrage ohne Weg zurück hätte einen neu angelegten Filter stumm bleiben lassen.
**Verifiziert durch:** Migration per `npx supabase db diff -f harden_sniper_subscription_rpc` erzeugt, Nachfüll-Migration von Hand geschrieben; `npx supabase db reset --local` exit 0 (alle Migrationen inkl. beider neuer angewendet); `npm run test:db` – 10 Dateien, 249 Tests, alle grün, exit 0; zusätzlich per `psql` gegen die laufende Datenbank direkt geprüft: vertauschte Preisspanne wirft "Die Preisuntergrenze darf nicht ueber der Preisobergrenze liegen", negativer Preis verletzt den neuen `check`, eine stillgelegte Abfrage (`is_active=false, consecutive_failures=5`) kommt beim Neuanlegen auf `is_active=true, consecutive_failures=0` zurück; `npm run verify` im Stammverzeichnis exit 0, ohne Pipe gemessen (Format, Lint, Typecheck, 21/21 Workflow-Tests, Suite-Audit, dom 9/9 Dateien/97 Tests, angular 18/18/240, node 89/89/760, Produktionsbau).

---

## 2026-09-04 – Claude Opus 5 (Anthropic) – Anlegefunktion fuer geteilte Abfragen

**Art:** Feature
**Betroffen:** `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260904175250_create_sniper_subscription.sql`, `supabase/tests/deal_monitor_subscription_rpc.sql`
**Was:** `authenticated` darf `sniper_queries` und `sniper_query_subscriptions` nur lesen, es gab also keinen Weg, ueber die Oberflaeche einen Filter anzulegen. Neue `security definer`-Funktion `create_sniper_subscription(workspace_id, search_text, brand_id, price_from, price_to, threshold)`: bildet denselben `query_key`, den der Dienst und `services/sniper/src/domain/query.ts` bilden, legt die geteilte Abfrage per `on conflict (query_key) do nothing` an oder verwendet die vorhandene, und haengt darunter das Abonnement mit eigener Schwelle an.
**Warum:** Zwei Arbeitsbereiche mit demselben Filter sollen sich eine Abfrage teilen, aber je eigene Schwelle behalten - das muss serverseitig erzwungen werden, sonst legt ein UI-Bug zwei Abfragen fuer denselben Filter an und verdoppelt das Pollen. Test-zuerst mit pgTAP: gleicher normalisierter Filter aus zwei Arbeitsbereichen ergibt eine `sniper_queries`-Zeile mit zwei Abonnements und unabhaengigen Schwellen; zweimaliger Aufruf fuer denselben Arbeitsbereich/Filter ist ein No-op; 50.00 und 50 hashen ueber `trim_scale` auf denselben Schluessel. Zusaetzlich eine Verhaltenspruefung statt nur Metadatenpruefung fuer die Task-2-Leserichtlinie: probeweise durch ein unkorreliertes `using (true)` ersetzt, bestaetigt, dass die neue Zusicherung dann tatsaechlich scheitert, danach zurueckgesetzt.
**Verifiziert durch:** `npm run test:db` gruen, `npm run verify` exit 0.

---

## 2026-09-04 – Claude Opus 5 (Anthropic) – ESLint lintet keine fremden Arbeitsordner mehr (fix(ci))

**Art:** Bugfix | CI
**Betroffen:** ESLint-Flat-Config (Ignorierliste fuer `.worktrees/`)
**Was:** `npm run verify` schlug an `ARCHIVE_TABLES` fehl - "assigned but only used as a type" - in einer Datei, die auf diesem Zweig niemand angefasst hat. Sie lag unter `.worktrees/purchase-costing-foundation/`, der Arbeitskopie eines Zweigs, den ein anderer Assistent parallel bearbeitet. Git und Prettier ignorieren dieses Verzeichnis bereits, ESLints Flat-Config liest `.gitignore` aber nicht und lief direkt hinein.
**Warum:** Dieses Repository haelt mit Absicht mehrere Arbeitsordner gleichzeitig offen (Parallelbetrieb mehrerer Assistenten). Der Fehler wirkte zufaellig - er erschien und verschwand je nachdem, in welchem Zwischenstand die Datei eines Kollegen gerade war - und zeigte auf Code, den der jeweilige Lauf gar nicht reparieren konnte. Die Lösung gehoert deshalb in die geteilte Konfiguration statt in eine lokale Einstellung.
**Verifiziert durch:** `eslint` exit 0, `npm run verify` exit 0, ohne Pipe gemessen.

---

## 2026-09-04 – Claude Opus 5 (Anthropic) – Sichtbarkeit von Abfragen auf Abonnenten umgestellt

**Art:** Feature | Sicherheit
**Betroffen:** `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260904155929_scope_sniper_queries_to_subscribers.sql`, `supabase/tests/deal_monitor_subscriptions.sql`
**Was:** Die Leserichtlinie fuer `sniper_queries` erlaubte bislang jedem angemeldeten Nutzer alle Zeilen (`using (true)`). Ersetzt durch eine Richtlinie, die nur Zeilen zeigt, fuer die eine `sniper_query_subscriptions`-Zeile des eigenen Arbeitsbereichs existiert.
**Warum:** Welche Filter ein Arbeitsbereich beobachtet, ist seine Einkaufsstrategie und geht andere Arbeitsbereiche nichts an - eine geteilte Abfrage darf zwar gemeinsam gepollt werden, aber nicht fuer jeden sichtbar sein, der nicht abonniert hat.
**Verifiziert durch:** `npm run test:db` gruen, `npm run verify` exit 0.

---

## 2026-09-02 – Claude Opus 5 (Anthropic) – Abonnement-Tabelle und Preisuntergrenze (Etappe 2)

**Art:** Feature
**Betroffen:** `supabase/config.toml`, `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260902213813_deal_monitor_subscriptions.sql`, `supabase/migrations/20260902213821_restrict_subscription_tables.sql`, `supabase/tests/deal_monitor_subscriptions.sql`
**Was:** Neue Tabelle `public.sniper_query_subscriptions` (workspace_id, query_id, discount_threshold_percent, is_active, Eindeutigkeit ueber workspace_id+query_id) verbindet einen Arbeitsbereich mit einer geteilten Abfrage, ohne dass andere Arbeitsbereiche sie sehen. `sniper_queries` bekommt die Spalte `price_from`. Dabei kam ein latenter Sortierfehler zum Vorschein: `config.toml` las `schema_paths` alphabetisch glob-sortiert, wodurch `50_sniper.sql` (jetzt mit Fremdschluessel auf `workspaces`) vor `database.sql` geladen wurde und `supabase db diff` brach. Behoben durch eine explizite Liste in `schema_paths` statt einer Aenderung an einer der Schemadateien.
**Warum:** Etappe 2 braucht einen Filter je Arbeitsbereich, ohne dass andere Arbeitsbereiche ihn sehen. `supabase db diff` uebertraegt keine Tabellenrechte aus dem deklarativen Schema, deshalb entzieht eine von Hand geschriebene Folgemigration `authenticated` insert/update/delete auf der neuen Tabelle, nach dem Vorbild von `20260902194744_restrict_sniper_tables.sql`. Test-zuerst: der pgTAP-Test wurde geschrieben und der erwartete Fehlschlag ("missing required columns") bestaetigt, bevor die Schemaaenderung folgte.
**Verifiziert durch:** `npm run test:db` (8 Dateien, davor 7, alle gruen), Rechte zusaetzlich per psql bestaetigt (`authenticated` haelt nur REFERENCES, SELECT, TRIGGER, TRUNCATE), `npm run verify` exit 0.

---

## 2026-09-04 – Claude Opus 5 (Anthropic) – Preisuntergrenze im Sammeldienst (Task 5)

**Art:** Feature
**Betroffen:** `services/sniper/src/domain/query.ts`, `services/sniper/src/store/query.store.ts`, `services/sniper/src/vinted/collector.ts`, zugehoerige Testdateien
**Was:** `buildQueryKey` bildet jetzt sechs statt fuenf Segmente (`price_from` vor `price_to`, wie schon in `create_sniper_subscription`), `SniperQuery`/`QueryKeyInput` um `priceFrom` erweitert, `QueryStore` liest `price_from` als Zahl aus Postgres, `VintedCollector` reicht sie als `price_from`-Parameter an Vinted weiter.
**Warum:** Dienst und Datenbank muessen denselben Abfrageschluessel bilden - sonst legt derselbe Filter zweimal eine Vinted-Abfrage an, und eine gespeicherte Preisuntergrenze, die nie an Vinted geht, waere eine Luege in der Oberflaeche. Test-zuerst: Schluesseltest und Sammlertest aus dem Auftrag zuerst ergaenzt, Fehlschlag bestaetigt, dann implementiert.
**Verifiziert durch:** `services/sniper`: `npx tsc --noEmit`, `npm test` (10 Dateien, 75 Tests), `npm run build`, `npm run test:integration` (2 Dateien, 13 Tests) - alle exit 0. `npm run verify` im Stammverzeichnis exit 0 (dom 9/97, angular 18/240, node 89/760).

---

## 2026-09-04 – Claude Opus 5 (Anthropic) – Trefferliste fuer den Deal-Monitor (Task 3)

**Art:** Feature
**Betroffen:** `supabase/schemas/50_sniper.sql`, `supabase/migrations/20260904160926_deal_monitor_hits.sql`, `supabase/migrations/20260904161027_restrict_hit_tables.sql`, `supabase/tests/deal_monitor_hits.sql`
**Was:** Neue Tabelle `public.sniper_hits` angelegt (id, subscription_id, listing_id, reference_price, discount_percent, created_at, notified_at) mit Eindeutigkeit ueber (subscription_id, listing_id), RLS-Leserichtlinie fuer Abonnenten und einer von Hand geschriebenen Migration, die `authenticated` auf genau SELECT beschraenkt (`revoke all` statt nur insert/update/delete, damit truncate nicht wie bei Task 1 stehen bleibt).
**Warum:** Gefaess fuer Task 2 des Deal-Monitors – gefuellt wird die Tabelle erst spaeter vom Dienst ueber den Service-Role-Schluessel. Test-zuerst: Testdatei mit 5 Pruefungen (Spalten, Eindeutigkeit, RLS, anon-Rechte, authenticated-Rechte) geschrieben, Fehlschlag bestaetigt, dann Schema/Migrationen ergaenzt.
**Verifiziert durch:** `npm run test:db` (241/241, 9 Dateien, exit 0), Rechte zusaetzlich per Direktabfrage gegen die laufende Datenbank bestaetigt (anon: keine Zeile, authenticated: exakt {SELECT}), `npm run verify` (exit 0, inkl. Build).

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Landingpage FAQ Akkordeon, Roadmap & Tracking-Bereinigung

**Art:** UI | Feature | Doku

**Betroffen:** `landing/index.html`, `landing/datenschutz/index.html`

**Was:**

1. **Tracking-Aussagen bereinigt:** Claims wie „0 Drittanbieter-Tracker / Kein Google Analytics“ entfernt, da zukünftiges Produkt-Tracking nach DSGVO-Standards geplant ist. Durch die Sicherheitskarte „Verschlüsselt & DSGVO-konform“ (TLS, Backups, europäischer Datenschutz) ersetzt. Entsprechende Klausel in `landing/datenschutz/index.html` aktualisiert.
2. **Umfangreiches zentriertes FAQ-Akkordeon:** FAQ auf 10 praxisnahe Kernfragen erweitert (Differenzsteuer § 25a, Kleinunternehmer § 19, Vinted Sniper, Marktplätze, Bildoptimierer, DATEV, Sicherheit, Mobile/PWA, Beta-Ablauf). Header zentriert und native HTML5 `<details>`/`<summary>`-Akkordeon-Funktionalität mit rotierendem Chevron und sauberem Border-Focus integriert (0 JS, CSP-kompatibel).
3. **Roadmap statt „Ehrlicher Stand“:** Den bisherigen Entwicklungsstand-Bereich in eine professionelle Produkt-Roadmap umgewandelt (`#roadmap`), inkl. klarer Status-Tags (Live, In Entwicklung, Geplant) und passenden Navigations- sowie Footer-Links.
4. **Hero-Aktionen gestrafft:** Die redundanten Buttons „Bereits registriert? Zum Login →“ und „Funktionen entdecken ↓“ unter dem Beta-Anmeldeformular im Hero entfernt (Login ist prominent in der Navigationsleiste vorhanden).

**Warum:** Nutzerfeedback zur Professionalisierung der Landingpage, Einbindung zukünftiger Tracking-Möglichkeiten, verbesserte Übersicht durch aufklappbares FAQ und Fokus auf die Beta-Konvertierung im Hero.

**Verifiziert durch:** `npm run verify` (Prettier, Lint, Typen, 21 Workflow-Tests, 1001 Unit-Tests, Angular Build).

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Landingpage Polish: Emojis zu SVG, Beta-Anfrage & Footer-Reduktion

**Art:** UI | Refactoring

**Betroffen:** `landing/index.html`, `landing/impressum/index.html`, `landing/datenschutz/index.html`

**Was:**

1. **Emojis durch Vektor-Icons ersetzt:** Alle Emojis (in den Badges und in den Sicherheitskarten für Server, RLS, Trackerfreiheit und PWA) durch saubere, moderne SVG-Vektor-Icons im Lucide-Stil der App ausgetauscht.
2. **Beta-Anfrage statt Direktzugang:** Text „Sofortiger Beta-Zugang · Keine Kreditkarte nötig · 100% DSGVO“ vollständig entfernt. Call-to-Action und Badges auf eine schrittweise freigeschaltete Beta-Anfrage umgestellt („Beta-Phase 0.1“, Button: „Beta-Zugang anfragen →“).
3. **E-Mail-Eingabe überarbeitet:** Das bisherige umschließende Container-Design („Feld im Feld“) durch eigenständige, nebeneinander stehende Eingabefelder und Aktionsbuttons mit sauberem Radius ersetzt.
4. **Footer entschlackt:**
   - Spalte „Beta & Kontakt“ sowie der Footer-Untertitel „Gehostet in Deutschland · DSGVO-konform“ komplett entfernt.
   - Rechtliches-Spalte von Hinweistexten befreit; stattdessen zwei saubere Links auf `/impressum` und `/datenschutz`.
   - Entsprechende statische Seiten `landing/impressum/index.html` und `landing/datenschutz/index.html` im Flipbase-Design erstellt.

**Warum:** Vorgaben des Nutzers zur professionellen Bereinigung der Landingpage, Beseitigung des „Feld im Feld“-Eindrucks, Vereinheitlichung des Icon-Stils mit der App und korrekte Abbildung der geschlossenen Beta-Phase.

**Verifiziert durch:** `npm run verify`, SCP/Deploy auf Server, HTTP 200 Tests.

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Landingpage i18n, Typografie, Footer & Beta-Registrierung

**Art:** Feature | Bugfix | UI

**Betroffen:** `landing/index.html`, `deploy/Caddyfile`, `src/app/features/auth/register/register.component.ts`

**Was:**

1. **Englische Sprache (i18n):** Fehler behoben, bei dem beim Umschalten auf Englisch alle Texte verschwanden. Ursache war `.lang-en { display: none !important; }`, welches die aktiven Regeln ohne `!important` überschrieb. Durch Hinzufügen von `!important` und `revert !important` auf die selektierten Sprachregeln schaltet die Seite nun zuverlässig und vollständig um.
2. **Titel-Typografie (h1):** Schriftgröße der Hauptüberschrift von `clamp(2.4rem, 1.4rem + 4vw, 4.25rem)` auf ein harmonisches `clamp(1.85rem, 1.2rem + 2.2vw, 3.1rem)` mit angepasstem Zeilenabstand (`1.15`) reduziert.
3. **Beta-Ankündigung & E-Mail CTA:** Aufmacher-Badge auf „🚀 Version 0.1 · Aktuelle Beta läuft“ aktualisiert und sowohl im Hero als auch im unteren CTA-Banner ein E-Mail-Eingabeformular (`hero-beta-form`) integriert. Bei Klick wird `https://app.flipbase.de/auth/register?email=...` aufgerufen. In `RegisterComponent` wird der `email`-Query-Parameter automatisch ausgelesen und in das Registrierungsformular übernommen. In `deploy/Caddyfile` wurde die CSP `form-action` dafür auf `https://app.flipbase.de` erweitert.
4. **Footer-Struktur:** Das Footer-Layout von 5 unbalancierten, umbrechenden Spalten auf ein klares 4-Spalten-Grid (`2fr 1.1fr 1.2fr 1.3fr`, responsive auf 2 Spalten auf Tablets und mobilen Endgeräten) umgestellt (Flipbase Marke & Beta-Status, Produkt, Rechtliches [Impressum & Datenschutz], Beta & Kontakt).

**Warum:** Fehlerbehebung der englischen Sprachanzeige, optische Verbesserung des Titels und des Footers sowie Bereitstellung eines direkten E-Mail-Call-to-Action zur Teilnahme an der laufenden Beta.

**Verifiziert durch:** `npm run verify` (Format, Lint, Typecheck, Audit, Tests, Build)

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – Fix für mobilen Login-Loop und Landingpage-Bereitstellung

**Art:** Bugfix | Deployment / CI

**Betroffen:** `src/app/features/auth/login/login.component.html`, `src/app/features/auth/register/register.component.html`, `docker/Dockerfile`, `deploy/deploy.sh`, `deploy/README.md`

**Was:**

1. **Mobiler Login-Loop („Zurück zur Startseite“):** In `login.component.html` und `register.component.html` wurde dem Link `<a [href]="landingUrl">` die Attribute `target="_blank"` und `rel="noopener noreferrer"` hinzugefügt. Dadurch fängt der mobile Standalone-Webview (PWA / iOS Safari WebClip) den Klick nicht mehr intern ab (was mangels passendem Scope bzw. durch Cross-Origin-Sperren zurück auf `start_url` `/` und damit direkt zurück in den `authGuard` / `/auth/login` führte), sondern öffnet die Landingpage sauber im Standard-Browser des Geräts.
2. **Landingpage-Bereitstellung:** Ursache für das Fortbestehen des alten Designs auf `https://flipbase.de` analysiert: Die statische Landingpage liegt in `/opt/flipbase-landing/` auf dem Server und wird von Caddy bedient. Der GitHub Actions CI-Workflow aktualisiert über den isolierten SSH-Deploy-Schlüssel (`deploy.sh`) nur den Web-Container (`app.flipbase.de`), berührt `/opt/flipbase-landing/` jedoch nicht.
3. **Automatisierung für künftige Deployments:** `docker/Dockerfile` nimmt die statische Landingpage künftig nach `/usr/share/nginx/landing` mit, und `deploy/deploy.sh` spiegelt sie nach einem erfolgreichen Container-Start automatisch nach `/opt/flipbase-landing/`.
4. **Anleitung für sofortiges Live-Bringen:** Sofortiger SCP-Befehl für den Nutzer dokumentiert (`scp -r landing/* root@168.119.246.33:/opt/flipbase-landing/`).

**Warum:** Behebung des Login-Loops auf Mobilgeräten und Sicherstellung der Sichtbarkeit des neuen Landingpage-Designs im Produktivbetrieb.

**Verifiziert durch:** `npm run verify` (Format, Lint, Typen, Workflow-Tests, Test-Suite-Audit, Node/DOM/Angular Vitest Tests, Produktions-Build).

## 2026-09-04 – Gemini 3.8 Flash (Google) – Conventional Commits v1.0.0, GitVersion & Release-Workflow mit 0.x Beta-Schutz

**Art:** Feature | CI / Automation

**Betroffen:** `AGENTS.md`, `GitVersion.yml` (neu), `scripts/version-generieren.mjs`, `docker/Dockerfile`, `.github/workflows/ci.yml`, `docs/AI-CHANGELOG.md`

**Was:**

1. **Conventional Commits Richtlinien (`AGENTS.md`):** Strikte und verbindliche Spezifikation nach v1.0.0 für alle KIs integriert. Erlaubte Typen (`feat`, `fix`, `perf`, `refactor`, `style`, `test`, `build`, `ci`, `docs`, `chore`), Scopes (`landing`, `inventory`, `sales`, `purchases`, `auth`, `accounting`, `sniper`, `image-opt`, `ui`, `core`, `ci`, `deps`), Imperativ-Regel und Breaking-Change-Syntax (`!:` / `BREAKING CHANGE:`).
2. **GitVersion-Konfiguration (`GitVersion.yml`):** Einführung von GitVersion mit `mode: ContinuousDeployment` auf `master`. Integrierter **0.x Beta-Schutz**, der Breaking Changes und Features als Minor-Bumps handhabt und einen automatischen Sprung auf Version 1.0.0 zuverlässig verhindert, bis die Beta explizit beendet wird.
3. **Automatisierte Versionsanzeige in der Web-App:** `scripts/version-generieren.mjs` liest `GITVERSION_MAJOR_MINOR_PATCH`, `GITVERSION_SEMVER` und `FLIPBASE_VERSION` aus, wodurch die Versionsanzeige in der Sidebar unten links (`v{{ version.nummer }}`) nach jedem Release automatisch aktualisiert wird.
4. **Docker-Image & CI-Pipeline:** `docker/Dockerfile` akzeptiert das Build-Argument `FLIPBASE_VERSION`. In `.github/workflows/ci.yml` wird GitVersion nativ via .NET im Job `image` ausgeführt und reicht die berechnete Versionsnummer weiter.
5. **Automatisierte GitHub Releases:** Neuer Job `release` in `.github/workflows/ci.yml` erstellt nach erfolgreichem Produktionsdeployment automatisch ein offizielles GitHub Release inklusive Git-Tag (`v$VERSION`) und generierten Release Notes aus den Conventional Commits.

**Warum:** Einheitlicher Versions- und Release-Zyklus ohne manuelle `package.json`-Eingriffe bei strikter Einhaltung der 0.x-Betaphase.

**Verifiziert durch:** `dotnet-gitversion` Test (liefert sauber `0.121.1`), `scripts/version-generieren.mjs` Tests mit und ohne Umgebungsvariablen, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (21/21 grün) und `npm run test:audit`.

---

## 2026-09-04 – Gemini 3.8 Flash (Google) – CI-Stabilität: Timeout für Quality- und Unit-Jobs auf 10 Minuten erhöht

**Art:** CI / Stabilität

**Betroffen:** `.github/workflows/ci.yml`, `docs/AI-CHANGELOG.md`

**Was:**

- Timeout für `quality`- und `unit`-Jobs in `.github/workflows/ci.yml` von 5 Minuten auf 10 Minuten angehoben.

**Warum:**

- Beim Push/Merge auf `master` liefen `quality` und `unit angular 1/1` nach 5 Minuten in ein hartes Runner-Timeout, da `npm ci` bei Registry-Latenzen über 1 Minute brauchte und der Build bzw. die Angular-Komponententestsuite zusammen ~4:30 bis 5:15 Minuten in Anspruch nehmen.

**Verifiziert durch:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:workflow` (21/21 grün) und `npm run test:audit`.

---

## 2026-09-03 – Gemini 3.8 Flash (Google) – Landingpage-Modernisierung: Marken-Logo, CSS Dark-/Lightmode, Sprache DE/EN, Vinted Bot & erweitertes Feature-Showcase

**Art:** Feature | Barrierefreiheit

**Betroffen:** `landing/index.html`, `landing/images/logo-mark.png` (neu), `src/app/core/services/landing-template.spec.ts`, `docs/AI-CHANGELOG.md`

**Was:**

1. **Marken-Logo & Typografie:** Flipbase-Markenikone (`logo-mark.png`) im Kopfbereich integriert, im Light-Mode mit kontrastverstärkendem Container (WCAG AA). Marken-Badge `Reselling OS` und überarbeitetes Styling im Flipbase Brand-Look (Bernstein-Orange `#f89d13`, Anthrazit/Grau und klares Weiß).
2. **Dark- & Lightmode (0 kB JavaScript):** Vollständige Unterstützung beider Farbschemata über CSS-Variablen. Standardmäßig Erkennung der Systemeinstellung via `@media (prefers-color-scheme)`, ergänzt durch einen interaktiven Sonne/Mond-Umschalter via CSS `:has(#theme-toggle:checked)`. Strenges `script-src 'none'` der CSP und Caddy-Template-Architektur bleiben zu 100 % erhalten.
3. **Mehrsprachigkeit (DE / EN):** Interaktiver Umschalter `DE | EN` im Header. Sämtliche Sektionen vollständig zweisprachig formuliert und synchron über CSS `:has(#lang-toggle:checked)` umschaltbar.
4. **Vinted Bot & Deal-Sniper:** Neue prominente Feature-Sektion zur automatisierten Schnäppchenjagd und Preisfehler-Erkennung auf Vinted.
5. **Plattformübergreifendes Tracking:** Detaillierte Darstellung des Trackings von Einkäufen (Mischkäufe, Konvolute, Mystery-Boxen mit Nebenkostenverteilung) und Verkäufen (eBay, Vinted, Kleinanzeigen mit Portotrennung und Gebührenabzug).
6. **Erweiterter Feature-Showcase:** 7 Kernsäulen präsentiert (Vinted Bot, Einkaufs-Tracking, Verkaufs-Tracking, Bildoptimierer mit automatischem GPS-Schutz für Handyfotos, Multi-Channel Listing Studio, § 25a Differenzbesteuerung & DATEV-Export, Finanzcockpit).
7. **Problem & Lösung, Sicherheit & FAQ:** Reseller-Problemstellung (Spreadsheet-Chaos vs. Software), Infrastrukturvorteile (Hetzner DE, Supabase Postgres RLS, 0 Tracker) und transparente FAQ-Sektion hinzugefügt.
8. **Testabdeckung:** `landing-template.spec.ts` um Prüfungen für Marken-Logo, Theme-/Sprach-Toggles, Vinted Bot und § 25a erweitert (7/7 Vitest-Tests bestanden).

**Warum:** Einheitlicher Markenauftritt, professionelle Darstellung der gewachsenen Plattform-Fähigkeiten (insb. Vinted Bot und Tracking) und barrierefreie Zweisprachigkeit bei kompromissloser Sicherheit und Geschwindigkeit.

**Verifiziert durch:** `npm run format:check` (sauber), `npm run lint` (Exitcode 0), `npm run typecheck` (Exitcode 0), `npm run test:workflow` (21/21 grün), `npm run test:audit` (116 Dateien, 1.001 Tests, 2.481 Assertions), Vitest-Gesamtlauf `npm test` (1.097 Tests bestanden) und Produktionsbau `npm run build` erfolgreich.

---

## 2026-09-03 – Gemini 3.8 Flash (Google) – Auth-Seiten: Zurück-Button, Theme-/Sprachauswahl, Marken-Buttons & AGB-/Datenschutz-Modals

**Art:** Feature

**Betroffen:** `.github/workflows/ci.yml`, `src/environments/environment.ts`,
`src/environments/environment.development.ts`,
`src/app/core/i18n/translations.ts`, `src/app/core/services/landing-hint-umgebung.spec.ts`,
`src/app/features/auth/login/*`,
`src/app/features/auth/register/*`,
`src/app/features/auth/components/terms-modal/*` (neu),
`src/app/features/auth/components/privacy-modal/*` (neu),
`e2e/demo-login.spec.ts`

**Was:**

1. **Zurück zur Startseite:** Oben links auf der Anmelde- und Registrierungsseite wurde ein barrierefreier „← Zurück zur Startseite“-Button eingebaut (Ziel: `https://flipbase.de`). In `.github/workflows/ci.yml` wurde das Produktions-Environment-Template um `landingUrl` ergänzt und durch `landing-hint-umgebung.spec.ts` abgesichert.
2. **Theme- & Sprachauswahl:** Oben rechts auf beiden Auth-Seiten wurden Theme-Toggle (Hell-/Dunkelmodus) und Sprachauswahl (DE/EN) integriert.
3. **Marken-Styling:** Veraltete grüne Schaltflächen (`bg-emerald-700`) und Links wurden auf die Flipbase-Standardfarbe Gelb-Orange (`linear-btn-primary`, `text-amber-400`, `focus:ring-amber-500`) umgestellt.
4. **AGB & Datenschutz:** Zwei eigenständige modale Komponenten (`TermsModalComponent` und `PrivacyModalComponent`) mit `appModalDialog` erstellt und über die Links in der Registrierung klickbar angebunden (mit Platzhalter-Hinweis bis zum offiziellen Verkaufsstart).
5. **E2E-Tests:** `e2e/demo-login.spec.ts` aktualisiert, um das Öffnen und Schließen der beiden Modals via Tastatur (Escape) zu prüfen.
6. **Vollständige Lokalisierung (DE/EN):** Sämtliche verbliebenen deutschen Textfragmente (Slogan, Formular-Platzhalter, Validierungsmeldungen, Barrierefreiheits-Labels bei Theme- und Passwort-Umschaltern, Demo-Modus-Bereich sowie AGB- und Datenschutz-Texte) wurden vollständig in `TRANSLATIONS_DE` und `TRANSLATIONS_EN` extrahiert und in den Templates dynamisch angebunden.
7. **Modernisierter Slogan:** Die bisherige sperrige Tagline _„Entscheidungs- und Finanzsystem für Reseller“_ wurde durch das treffendere, moderne Markenversprechen _„Das All-in-One Betriebssystem für Reseller“_ (EN: _„The All-in-One Operating System for Resellers“_) in `APP.TAGLINE` und `AUTH.TAGLINE` ersetzt.

**Warum:** Einheitliches Markendesign auf den Auth-Seiten, barrierefreie Navigation und Vorbereitung der Pflicht-Rechtstexte.

**Verifiziert durch:** TypeScript Typecheck (`npm run typecheck`), ESLint (`npm run lint`), Prettier-Prüfung (`npm run format:check`), Workflow-Tests (`npm run test:workflow`) und alle Vitest-Testsuiten (1094 Tests bestanden).

---

## 2026-09-01 – Claude Opus 5 (Anthropic) – Zeitplan-Pruefungen verschlankt

**Art:** Konfiguration | Refactoring | Bugfix

**Betroffen:** `.github/workflows/ci.yml`, `.github/workflows/quality-nightly.yml`,
`scripts/ci-workflow.test.mjs` und `scripts/quality-nightly-workflow.test.mjs`
(geloescht), `vitest.coverage-critical.config.ts` (neu),
`e2e/dashboard-interactions.spec.ts`, `package.json`, `eslint.config.js`,
`.gitignore`

**Was:** Der naechtliche Durchgang kostete rund 28 Runner-Minuten pro Nacht und
war seit seiner Einfuehrung in jeder Nacht rot. Fuenf Aenderungen: `actionlint`
ersetzt 1192 Zeilen selbstgeschriebener YAML-Zusicherungen; der Chromium-Auftrag
entfaellt, weil er dieselben sechs Tests fuhr wie `ci.yml` bei jedem Push; der
Zeitplan ist in einen taeglichen und einen woechentlichen Takt geteilt; die
Abdeckung der drei Geld-Dateien laeuft taeglich in Sekunden, die vollstaendige
Messung woechentlich; ein Waechter ueberspringt den Durchgang, wenn sich master
nicht bewegt hat. Die beiden Migrations-Harnesse stehen nicht mehr im Zeitplan -
sie pruefen je eine laengst ausgelieferte Migration, also eine einmalige Abnahme.

**Warum:** Ein Zeitplan, der jede Nacht rot meldet, wird nach zwei Wochen
ignoriert und ist dann schlechter als keiner. Von den beiden roten Auftraegen
war einer ein veraltetes Harness, der andere ein Testfehler. Gleichzeitig ging
ein Drittel der Minuten fuer Dubletten drauf. Der Testbestand selbst wurde nicht
angetastet: 128 Testdateien und 867 Faelle auf rund 37.000 Zeilen Quellcode sind
mit einem Verhaeltnis von 0,5:1 eher unter- als ueberdurchschnittlich.

**Verifiziert durch:**

- `npm run verify` → **Exitcode 0** (ohne Pipe gemessen, mit vorhandenem
  `coverage-critical/`)
- `actionlint` ueber alle drei Workflow-Dateien → **Exitcode 0**; Gegenprobe mit
  falschem Runner-Label → **Exitcode 3**, der Schritt kann also wirklich scheitern
- `npm run test:coverage:critical` → 754 Tests, alle drei Dateien im Bericht,
  **15 s** statt neun Minuten; mit unerreichbarer 100-%-Grenze → **Exitcode 1**
  mit Datei und Ist-Wert
- Playwright **WebKit 6/6** und **Chromium 6/6**
- Waechter-Logik in allen fuenf Faellen richtig (Lauf von Hand, taeglich 2 h und
  72 h, woechentlich 72 h und 240 h)

**Nicht geaendert:** Kein Anwendungscode. Firefox ist lokal nicht installiert und
wurde nicht nachgefahren; beide Testaenderungen sind engine-neutral, aber dafuer
gibt es keinen Beleg. Der Waechter im Integritaets-Harness verlangt weiterhin,
die neueste Migration zu sein - von Hand aufgerufen scheitert das Skript also
nach wie vor.

---

## 2026-08-30 – Codex GPT-5.6 – Verkaufsversand und Rendite abgenommen

**Art:** Analyse | Doku

**Betroffen:** Verkaufsbuchung, Versandtrennung, Renditekennzahlen, DATEV-Export
und `docs/superpowers/reports/2026-08-30-verkaufsversand-und-rendite-abnahme.md`

**Was:** Die zusammengefuehrten Aenderungen an Verkaufsversand, strukturierten
Kosten, Kennzahlen, Rechnung, Retoure und Exporten vollstaendig lokal
abgenommen. Der Nachweis dokumentiert die fachlichen Formeln, Plattform-Startwerte,
DATEV-Konten und die Kompatibilitaet von Altdaten.

**Warum:** Käufer-Versand und tatsaechliches Porto muessen durchgaengig getrennt
bleiben, ohne historische Verkaufssummen nachtraeglich zu veraendern.

**Verifiziert durch:** Prettier, ESLint und TypeScript fehlerfrei; 80/80
Workflow-Tests; Suite-Audit mit 116 Dateien, 992 Testdefinitionen und 2.458
Assertions; 1.087 Tests bestanden (754 Node, 95 DOM, 238 Angular), 3 Node-Tests erwartungsgemäß übersprungen;
Produktions-Build erfolgreich; pgTAP 223/223; `git diff --check` fehlerfrei.

---

## 2026-08-30 – Codex GPT-5.6 – Docker- und RLS-Abnahme nachgeholt

**Art:** Analyse | Test | Doku

**Betroffen:** Lokaler Docker-/Supabase-Teststack und
`docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`

**Was:** Nach dem erfolgreichen Start von Docker Desktop wurden alle zuvor
blockierten Nachweise ausgeführt. Der normale pgTAP-Lauf bestand mit 6 Dateien
und 214 Tests. Eine ausschließlich lokale, temporäre RLS-Mutation öffnete die
Inventar-Lesepolicy für fremde Workspaces; zwei Sicherheitsprüfungen wurden wie
erwartet rot. Eine zweite temporäre SQL-Datei stellte die Policy im selben Lauf
wieder her, beide Dateien wurden entfernt und der unveränderte Lauf war danach
erneut mit 214/214 Tests grün. Zusätzlich wurde das Produktionsimage mit der
vollständigen Commit-SHA gebaut und in einem temporären Container über Nginx,
Startseite, `/healthz` und `/deployment.json` geprüft.

**Warum:** Die lokale Docker-Engine war während der ersten Abnahme nicht
erreichbar. Damit blieben Datenbank, RLS-Mutation und der reale Containerbuild
zunächst ohne dynamischen Nachweis.

**Verifiziert durch:** `npm run test:db` 214/214 grün; kontrollierte Mutation
2/216 rot; Wiederherstellung und erneuter Endlauf 214/214 grün; Dockerimage
`flipbase:teststrategie-ci-899c2af` erfolgreich gebaut; Nginx-Konfiguration,
Startseite, `healthz=ok` und SHA
`899c2afbac79aaf9748aded381a4484a309c5b81` bestätigt. Keine Produktionsdaten
oder externen Systeme verändert.

## 2026-08-30 – Codex GPT-5.6 – Abschlusslücken der Teststrategie geschlossen

**Art:** Bugfix | Konfiguration | Barrierefreiheit

**Betroffen:** CI-Workflow, Deployment-Metadaten, Revenue-Chart, Workflow- und
Browser-Tests sowie Abnahmebericht

**Was:** Die abschließende Branch-Prüfung hat drei wichtige Lücken geschlossen.
Workflow-Verträge und Suite-Audit laufen nun verpflichtend in `npm run verify`
und im Quality-Job. Der manuelle Benchmark besitzt nur lesenden Repository-Zugriff.
Das Deployment veröffentlicht die vollständige Build-SHA in `/deployment.json`,
prüft Startseite und öffentlichen Healthcheck und vergleicht die ausgelieferte
SHA exakt mit `github.sha`. Der Revenue-Chart besitzt einen
fokussierbaren Tastaturregler mit Pfeil-, Pos1-, Ende- und Escape-Bedienung sowie
Screenreader-Werten. Komponenten- und Browsertests decken den Tastaturweg ab.

**Warum:** Die neuen Sicherheitsverträge dürfen nicht außerhalb der Pflicht-Gates
liegen. Ein statischer Healthcheck kann einen alten Container nicht erkennen,
und eine reine Mausinteraktion erfüllt die verbindliche WCAG-AA-Anforderung
nicht.

**Verifiziert durch:** `npm run verify` vollständig grün, 80/80
Workflow-Verträge, Audit über 116 Testdateien, 1.071/1.071 Vitest-Tests,
6/6 Chromium-Smokes, Production-Build und Coverage über allen Schwellwerten.
Der Docker-Daemon bleibt lokal nicht erreichbar; deshalb kein dynamischer
Supabase-/RLS-Lauf und weiterhin **NO-GO für Produktion**.

## 2026-08-30 – Codex GPT-5.6 – Rollout-Budget und Rückfallregeln gehärtet

**Art:** Doku

**Betroffen:**
`docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`,
Task-10-Bericht und SDD-Ledger

**Was:** Drei Review-Befunde in der Rollout-Abnahme korrigiert. Die Baseline
nennt jetzt nur die in Task 1 belegte Vitest-Dauer 26,37 s. Das Runnerbudget
verlangt mindestens fünf vergleichbare historische PR-Läufe, legt daraus eine
feste Fünferkohorte fest, berechnet deren Median `B` und die Grenze
`T = 1,2 × B` und prüft jeden der fünf neuen Billable-Gesamtwerte einzeln gegen
`T`. Der Rollback bleibt offen, bis ein isoliert ausgeführter Commit mit
exklusivem Diff auf `.github/workflows/ci.yml` alle Quick-, DB- und
Browser-Gates bestanden hat. Er erhält sämtliche heutigen Fachtests/Gates und
das SHA-only-Image; `0768233` ist nur Topologiereferenz. Eine Nightly-Pause
erfolgt bei Bedarf in einem eigenen Commit ausschließlich an
`.github/workflows/quality-nightly.yml`.

**Warum:** Wandzeiten oder ein einzelner historischer Push-Lauf belegen keine
Billable-Runnergrenze. Ein pauschaler Commit-Revert könnte neue fachliche Tests,
Supportskripte oder Sicherheitsgates entfernen.

**Verifiziert durch:** Quellenabgleich mit `task-1-report.md`, Suche nach dem
unbelegten Altwert, Dokument-Formatprüfung und Git-Diff-Check. Keine Code- oder
Workflowänderung, kein externer Lauf und weiterhin **NO-GO für Produktion**.

## 2026-08-30 – Codex GPT-5.6 – Teststrategie und CI-Rollout lokal abgenommen

**Art:** Konfiguration + Tests + Doku

**Betroffen:** gesamte Teststrategie von Node/DOM/Angular über Coverage, Supabase,
Playwright und GitHub Actions bis zum Rollback; Abschlussbericht unter
`docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`

**Was:** Den Umbau der Test- und CI-Pipeline am finalen Feature-Stand
`7293435` lokal abgenommen. Drei kontrollierte Produktmutationen wurden in
einem eigenen temporären Worktree dynamisch auf der vorgesehenen Ebene rot
belegt und jeweils durch normale Revert-Commits neutralisiert: falscher
Steuerfaktor, Doppelverkauf eines Demo-Einzelstücks und falsche
Einkaufs-Rücknavigation. Der strukturierte CI-Vertrag wurde einschließlich
seiner Negativfixtures geprüft. GitHub-Bestand, fünf offene PR-Lauf-Slots,
Deploy-Checklisten, Produktionsmessplan und selektiver Rollback sind
dokumentiert.

**Warum:** Ein lokaler grüner Umbau ist noch keine Produktionsfreigabe. Die
Abnahme trennt belegte lokale Sicherheit strikt von noch fehlender externer
Scheduler-, Datenbank-, Registry- und Produktionswirkung und verhindert damit
erfundene p95-/Runner-/Live-Aussagen.

**Verifiziert durch:** Steuer-Mutant 2/14 rot, Verkaufs-Mutant 1/16 rot,
Playwright-Navigationsmutant 1/1 rot einschließlich Retry; nach Revert 14/14,
16/16 und 1/1 grün. Lokaler CI-Workflowvertrag 16/16 grün. Docker/RLS ist wegen
fehlender `dockerDesktopLinuxEngine`-Pipe `BLOCKED`; GitHub read-only zeigt
0/5 neue Feature-PR-Läufe. Kein Push, PR, Merge, `workflow_dispatch` oder
Deployment. Entscheidung: **NO-GO für Produktion**.

## 2026-08-30 – Claude Opus 5 (Anthropic) – Alle Metadaten statt sechs ausgewaehlter

**Art:** Feature + Bugfix (Barrierefreiheit)
**Betroffen:** `services/metadata-fields.ts` (neu), `metadata-reader.service.ts`,
`models/image-metadata.ts`, `components/metadata-panel/`, `components/platform-selector/`,
`components/image-list/`

Die Anzeige zeigte **sechs handverlesene Felder** und warf alles Uebrige weg, obwohl es
bereits gelesen war. Bei einer Datei, die zufaellig keines dieser sechs trug, blieb ein
einzelner Kasten uebrig – das sah aus, als koenne die Funktion nichts. Der Nutzer hat das
zu Recht beanstandet.

### Zwei Ursachen

**IPTC, ICC und JFIF waren beim Lesen abgeschaltet.** Damit blieben Titel, Urheber,
Copyright und Bildunterschrift unsichtbar – genau die Angaben, die man vor dem Hochladen
sehen will. Jetzt sind alle Segmente an.

**Und die sechs Felder waren eine fremde Auswahl.** An einer nachgebauten Kameradatei
gemessen: **39 Eintraege statt fuenf.**

`cameraMake`, `cameraModel`, `capturedAt` und `software` sind aus dem Modell verschwunden –
die Liste deckt sie ab, und zwei Quellen fuer dieselbe Angabe waeren eine zu viel. `gps`
bleibt eigenstaendig: Der Aufnahmeort ist der einzige Eintrag mit einer Folge fuer den
Nutzer, er wird hervorgehoben und traegt den Hinweis in der Bilderliste.

### Lesbar machen, ohne Bedeutung zu erfinden

Datum in deutscher Schreibweise, Dezimalkomma, Wahrheitswerte als ja/nein, kurze Bytefolgen
als Zahlen, grosse Binaerbloecke (Miniaturansichten) gar nicht. Die drei **genormten**
Aufzaehlungen `ColorSpace`, `ResolutionUnit` und `JFIFVersion` bekommen ihren Klartext –
"Farbraum: 1" sagt niemandem etwas. Ein Wert ausserhalb der Norm bleibt die rohe Zahl.

### Nebenbefund: zwei Kontrastfehler, die ich vorher uebersehen hatte

Beim Nachpruefen mit AXE kamen zwei echte Verstoesse heraus. Mein Rundgang am 29.08. lief
ueber den **leeren** Editor – beide Abzeichen erscheinen erst mit geladenem Bild und
gewaehlter Plattform:

| Stelle                                         | vorher | jetzt  |
| ---------------------------------------------- | ------ | ------ |
| Weisse Schrift auf dem AKTIV-Abzeichen         | 2,14:1 | 9,82:1 |
| Seitenverhaeltnis im gewaehlten Plattform-Chip | 4,04:1 | 6,62:1 |

**Lehre fuer kommende AXE-Laeufe:** Eine Seite im Ausgangszustand zu pruefen sagt wenig.
Zustaende mit Daten, Auswahl und geoeffneten Bereichen muessen mit.

**Verifiziert durch:** 947 Tests gruen, Typen, ESLint, Prettier und Produktionsbau sauber.
Im Browser mit einer nachgebauten Kameradatei (EXIF, IPTC, JFIF, ICC): 39 Eintraege,
darunter Titel, Bildunterschrift, Stichwoerter, Urheber, Copyright, Objektiv, Belichtung,
ISO und die rohen GPS-Tags. Farbraum steht als "sRGB" da, JFIFVersion als "1.1", und die
Aufloesungseinheit bleibt bei ihrem rohen `0`, weil 0 kein genormter Wert ist. AXE mit
geladenem Bild und gewaehlter Plattform: null Verstoesse.

---

## 2026-08-30 – Claude Opus 5 (Anthropic) – Metadaten aus mehr als nur JPEG

**Art:** Feature
**Betroffen:** `src/app/features/image-optimizer/services/` (neu: `image-format.ts`,
`webp-metadata.ts`), `metadata-reader.service.ts`, `c2pa-detection.ts`,
`models/image-metadata.ts`, `components/metadata-panel/`

Bisher wurde **nur JPEG** ausgewertet. Damit fielen ausgerechnet die haeufigsten Faelle
durch: iPhone-Fotos sind **HEIC**, KI-Bilder aus Gemini oder DALL·E kommen als **PNG**, im
Netz gespeicherte Bilder sind oft **WebP**. Bei allen dreien behauptete die Anzeige, es sei
nichts bekannt – obwohl in einem HEIC vom iPhone der Aufnahmeort steckt.

### Erst gemessen, dann gebaut

`exifr` 7.1.3 bringt Parser fuer JPEG, PNG, TIFF und HEIF mit. An selbst gebauten
Testdateien geprueft:

| Format      | Ergebnis                                          |
| ----------- | ------------------------------------------------- |
| JPEG        | alle Felder (Ausgangspunkt)                       |
| **PNG**     | **alle Felder** – EXIF aus `eXIf`, XMP aus `iTXt` |
| TIFF        | EXIF-Felder                                       |
| HEIC / HEIF | Format erkannt                                    |
| **WebP**    | **`Unknown file format`** – kann `exifr` nicht    |

### WebP wird selbst aufgemacht

Die RIFF-Chunks werden durchgegangen. Der `EXIF`-Chunk enthaelt einen **rohen TIFF-Block**
und wird als solcher an `exifr` weitergereicht – so bleibt die Auswertung der Felder an einer
einzigen Stelle statt in zwei Fassungen. `XMP ` und `C2PA` kommen aus den eigenen Chunks.
Wichtig: Laut Spezifikation stehen diese Chunks **hinter** den Bilddaten, deshalb wird bei
WebP die ganze Datei gelesen und nicht nur der Kopf.

### Format an den Bytes, nicht an der Endung

Endung und MIME-Typ luegen regelmaessig – aus WhatsApp gespeicherte Dateien heissen `.jpg`
und sind PNG. Bei HEIC/AVIF entscheiden die **kompatiblen Marken** ab Byte 16, nicht die
Hauptmarke ab Byte 8; so macht es `exifr` in seinem eigenen `canHandle`, und gemessen: eine
Datei mit Hauptmarke `avif`, die `avif` nicht in der Liste fuehrt, wird abgelehnt. Wuerde
hier die Hauptmarke genuegen, meldete die Anzeige ein lesbares Format und das Lesen schluege
danach fehl.

### Der Herkunftsnachweis hat jetzt drei Zustaende

Er liegt je Format woanders: JPEG im APP11-Segment, PNG im `caBX`-Chunk, WebP im
`C2PA`-Chunk – **alle drei werden gesucht**. Fuer HEIC/AVIF und TIFF steckt er in
ISOBMFF-Boxen bzw. einem TIFF-Tag; ohne echte Beispieldateien waere jede Umsetzung geraten,
also wird dort nicht gesucht. Genau deshalb `unchecked` als dritter Zustand: „nicht
gefunden" waere eine Behauptung ueber etwas, wonach niemand gesehen hat.

### Ein Test war gruen aus dem falschen Grund

Der bestehende Test „wertet Nicht-JPEG gar nicht erst aus" benutzte eine **zwei Byte lange**
PNG-Attrappe. Er blieb auch nach der Umstellung gruen – aber nicht, weil PNG abgelehnt wird,
sondern weil zwei Byte kein Format ergeben. Ersetzt durch Tests mit vollstaendigen
Dateikoepfen.

**Verifiziert durch:** `npm run verify` vollstaendig gruen (927 Tests). Im Browser mit
echten, dort erzeugten Dateien gegengelesen: PNG mit `eXIf` und `iTXt`-XMP liefert Standort
52,5/13,4, Kamera, Aufnahmedatum, Software und die erklaerte KI-Herkunft samt GPS-Hinweis in
der Bilderliste; WebP mit `EXIF`-, `XMP `- und `C2PA`-Chunk dieselben Felder plus den
Herkunftsnachweis, den `exifr` gar nicht finden koennte; blankes PNG, HEIC-Kopf und GIF
liefern drei **unterschiedliche**, jeweils zutreffende Saetze. AXE ueber die Seite: null
Verstoesse.

**Offen:** Nicht mit einer echten AVIF-Datei geprueft – der Browser kodiert kein AVIF. Die
Erkennungsregel ist Zeile fuer Zeile dieselbe wie in `exifr`s `canHandle` und an
synthetischen Dateien in beide Richtungen gemessen. C2PA in HEIC/AVIF und TIFF wird bewusst
nicht gesucht (siehe oben).

---

## 2026-08-29 – Claude Opus 5 (Anthropic) – Weissabgleich, Schaerfen und Barrierefreiheit

**Art:** Feature + Bugfix (Barrierefreiheit, i18n)
**Betroffen:** `src/app/features/image-optimizer/`, `src/app/core/i18n/translations.ts`,
`src/app/features/settings/`, `src/app/features/listings/`, `src/app/layout/sidebar/`,
`src/app/shared/components/revenue-chart/`, `package.json`

### Weissabgleich und Schaerfen

Die beiden Punkte, die in Paket 2 offen blieben. Beide lassen sich **nicht** als CSS-Filter
ausdruecken: Weissabgleich braucht eine Farbmatrix, Schaerfen eine Faltung.

Naheliegend waere gewesen, sie als SVG-Filter an die Zeichenflaeche zu haengen
(`ctx.filter = 'url(#...)'`). **Safari unterstuetzt das nicht** – auf dem iPhone waere
stillschweigend nichts passiert, ohne Fehler, ohne Hinweis. Deshalb wird direkt auf den
Pixeln gerechnet: ueberall gleich, und als reine Funktionen pruefbar, obwohl jsdom gar
keine Zeichenflaeche hat.

**Der Kern ist die Zwischenebene im Renderer.** Der weisse Grund existiert nur, um
Durchsichtigkeit zu ersetzen, damit JPEG sie nicht schwarz macht. Wuerde die Waerme auf der
fertigen Ausgabe rechnen, faerbte sie diesen Grund mit ein – ein freigestelltes
Produktfoto bekaeme statt des von eBay verlangten reinen Weiss einen warmen Rand. Die
Pixelschritte laufen deshalb auf einer eigenen Flaeche, die nur das Bild enthaelt; erst das
Ergebnis wird auf den Grund gelegt. Aus demselben Grund fassen beide Funktionen **nur voll
deckende Pixel** an: Hinter durchsichtigen Stellen liegen oft schwarze Farbwerte, die eine
Faltung als dunklen Saum an jede freigestellte Kante ziehen wuerde.

Ohne Waerme und Schaerfe wird **keine** Zwischenebene angelegt. Der bisherige Weg laeuft
unveraendert, und die Zusicherung „Zuruecksetzen liefert dieselbe Datei" bleibt erhalten.

Filterausdruck und Pixelwerte reisen jetzt als **ein** Objekt (`Look`) durch die Kette statt
als zwei getrennte Werte – zwei Wege waeren zwei Gelegenheiten, dass Vorschau und Export
auseinanderlaufen.

**Kosten, gemessen:** Waerme 18 ms, Schaerfen 513 ms je Bild bei 1600×1600. Ein Export
mit vielen Bildern und mehreren Plattformen dauert mit Schaerfe spuerbar laenger.

### Barrierefreiheit: der protokollierte AXE-Lauf

Der Lauf ueber alle dreizehn Hauptseiten fand **elf echte Verstoesse**:

| Seite          | Regel                         | Was fehlte                                        |
| -------------- | ----------------------------- | ------------------------------------------------- |
| Einstellungen  | `label` (kritisch, 7×)        | Schalter in einem `<label>` ohne Text – kein Name |
| Listing Studio | `label` (kritisch, 2×)        | Titel- und Beschreibungsfeld ohne Namen           |
| Seitenleiste   | `button-name` (kritisch)      | Schliessen-Knopf, Symbol `aria-hidden`            |
| Dashboard      | `aria-prohibited-attr`        | `aria-label` auf `<line>` – dort unzulaessig      |
| Dashboard      | `scrollable-region-focusable` | Diagramm mit der Maus scrollbar, mit Tab nicht    |

Bei den sieben Schaltern verweist jeder per `aria-labelledby` auf den vorhandenen sichtbaren
Titel, statt den Text zu verdoppeln – eine Quelle, die beim Uebersetzen nicht vergessen
werden kann. Im Listing Studio dagegen bewusst `aria-label`: Die Ueberschrift enthaelt die
Zeichenzahl, ein Screenreader wuerde den Feldnamen sonst bei jedem Tastendruck neu vorlesen.

Die fuenf Faelle, die AXE beim Farbkontrast unentschieden laesst, von Hand nachgerechnet:
**9,4:1 und 13,6:1** gegen geforderte 4,5:1.

### Uebersetzungen: warum es so lange unbemerkt blieb

Elf Schluessel im `AUTH`-Block fehlten auf Englisch; ngx-translate schrieb woertlich
`AUTH.ACCEPT_TERMS` neben das Haekchen. Der Grund war ein **zu schwacher Test**: Der
Sprachvergleich prueft nur die oberste Ebene, und `AUTH` war ja in beiden Sprachen da. Der
Test vergleicht jetzt alle Pfade bis in die Tiefe und lehnt leere Texte ab.

### Neu: `npm run verify`

Beim Umbau ist mir ein Fehler durch Typpruefung, ESLint **und** Tests hindurchgerutscht und
erst beim Bau aufgefallen: `tsc` prueft keine Angular-Vorlagen, und eine Bindung an einen
Eingang, den es nicht gibt, ist ein reiner Vorlagenfehler. `npm run verify` fuehrt jetzt
genau die CI-Kette lokal aus (Format, Lint, Typen, Tests, Bau).

**Verifiziert durch:** `npm run verify` vollstaendig gruen – 833 Tests, Produktionsbau
erfolgreich, Startbuendel 710,90 kB gegen 900 kB Warnschwelle. Im Browser an der
Exportvorschau nachgemessen: Waerme +1 hebt 176 auf 220 rot und senkt auf 132 blau (genau
die Faktoren 1,25 und 0,75), bei -1 gespiegelt, Gruen bleibt. Schaerfe 1 verstaerkt den
Kantensprung von 128 auf 222, die Flaeche daneben bleibt exakt bei 176. An einem
freigestellten PNG bleibt der Grund unter voller Waerme exakt 255/255/255. Nach Verstellen
und Zuruecksetzen wieder 10559 Bytes mit derselben Pruefsumme. Regler ueber 31 Proben
tatsaechlich gezogen: kein Overlay. AXE ueber alle dreizehn Seiten: vorher elf Verstoesse,
jetzt null.

**Offen:** nichts aus Paket 2 mehr.

---

## 2026-08-29 – Claude Opus 5 (Anthropic) – Bildeditor veroeffentlicht

**Art:** Konfiguration (Zusammenfuehrung) + Bugfix
**Betroffen:** `master`, `src/app/features/image-optimizer/image-optimizer.component.ts`, `docs/AI-CHANGELOG.md`

**Was:** Beide Bildeditor-Pakete sind in `master` zusammengefuehrt und
ausgeliefert. Vorher habe ich die Warenwirtschaft aus `master` in die Zweige
geholt und geprueft, was der parallele Lauf angefasst hat.

**Der einzige Konflikt lag in `addFiles`** – und er war inhaltlich wichtig, nicht
nur textlich. Die Warenwirtschaft hatte dort `crypto.randomUUID()` durch
`createLocalDemoId('image')` ersetzt, weil `randomUUID` in unsicheren Kontexten
(reines HTTP) nicht existiert und das Hinzufuegen von Bildern sonst mit einem
Fehler abbricht. Mein Zweig hatte dieselbe Zeile beim Umbau auf englische
Bezeichner neu geschrieben und haette die Korrektur wieder ueberschrieben.
Uebernommen wurde die Korrektur, behalten wurden die englischen Namen, der
Durchgesehen-Marker und die Nicht-Bild-Meldung.

**Was ich an der Warenwirtschaft geprueft habe:**

- **Zeilensicherheit:** 6 neue Tabellen, 6-mal `enable row level security`,
  Policies je Operation und Rolle getrennt, kein `for all`.
- **`security definer`-Funktionen:** alle mit `set search_path = ''`, und
  **jede** prueft am Anfang `auth.uid()` und `is_workspace_member(p_workspace_id)`
  und wirft sonst `42501`. Das ist der entscheidende Punkt, weil diese Funktionen
  die Zeilensicherheit umgehen: Ohne die Pruefung koennte ein angemeldeter Nutzer
  eine fremde Workspace-Kennung uebergeben.
- **Schreibrechte:** direkte `insert/update/delete` auf `stock_lots`,
  `stock_movements`, `sale_lines` und `sale_line_lot_allocations` sind
  `authenticated` entzogen – Buchungen laufen nur ueber die RPCs.
- **Angular-Konventionen:** keine Inline-Templates, kein `standalone: true`,
  kein `ngClass`/`ngStyle`, keine `*ngIf`/`*ngFor`, keine Konstruktor-Injektion,
  kein `any`, kein `@HostBinding`/`@HostListener`. Sauber.

**Kleine Anmerkung ohne Handlungsbedarf:** Die neuen RPCs bekommen kein
ausdrueckliches `revoke execute ... from anon`. Ein anonymer Aufruf scheitert
trotzdem an der `auth.uid()`-Pruefung in der Funktion selbst; ein Entzug waere
nur eine zweite Verteidigungslinie.

**Verifiziert durch:** Typpruefung fehlerfrei, **116 Testdateien / 806 Tests
gruen**, Prettier und ESLint sauber, Produktionsbau erfolgreich. Startbuendel
710,15 kB gegen die von der Warenwirtschaft verschaerfte Warnschwelle von 900 kB;
`image-optimizer-component` liegt bei 174,37 kB als eigenes, nachgeladenes Stueck.
Im Browser nachgesehen: Bildoptimierer laedt, zwei Bilder ueber den Dateidialog
hinzugefuegt (also genau durch die Konfliktstelle), Plattformwahl, Fortschritt
„1 von 2 durchgesehen", Farb- und Belichtungsregler sowie die Metadatenanzeige
alle da, Konsole ohne Fehler.

---

## 2026-08-28 – Claude Opus 5 (Anthropic) – Bildoptimierer Paket 2

**Art:** Feature, Bugfix

**Betroffen:** `src/app/features/image-optimizer/`, dazu `package.json`/`package-lock.json` für `exifr`

**Was:**

Die beiden Punkte, die in Paket 1 bewusst zurückgestellt wurden. Spezifikation und Plan liegen unter `docs/superpowers/`.

1. **Metadaten werden angezeigt.** Nach dem Hochladen liest Flipbase im Hintergrund aus, was in der Datei steckt: GPS-Koordinaten, Kamera, Aufnahmedatum, Software und ein etwaiger KI-Herkunftsnachweis. Bilder mit Standortdaten tragen einen Hinweis auf ihrer Kachel in der Bilderliste – der eigentliche Alltagsnutzen, weil ein zu Hause aufgenommenes Handyfoto sonst die eigene Adresse in jede Anzeige trägt.

2. **Farbe und Belichtung.** Vier Regler je Bild (Helligkeit, Kontrast, Sättigung, Graustufen), dazu Zurücksetzen und „Auf alle Bilder übernehmen". Die Werte werden **nie ins Bild gerechnet**, sondern erst beim Rendern angewandt – deshalb ist Zurücksetzen verlustfrei und mehrfaches Verstellen kostet keine Qualität.

**Warum es zwangsläufig übereinstimmt:** `renderImage()` ist die einzige Canvas-Ausgabe des Werkzeugs und wird von Vorschau **und** Export benutzt. Ein dort gesetzter Filter wirkt in beiden; sie können gar nicht auseinanderlaufen.

**Bewusst nicht gebaut:** Metadaten **schreiben** – die Plattformen rechnen hochgeladene Bilder neu durch und verwerfen alles Eingebettete, ein Urheberfeld wäre nur auf der eigenen Festplatte wirksam. Und **Entfernen von KI-Wasserzeichen**: Die Pixel-Verfahren überstehen Neukodieren, Zuschneiden und Skalieren bauartbedingt, was sie beschädigt zerstört auch das Produktfoto, und ein Werkzeug dafür wäre darauf angelegt, KI-Bilder als echte Artikelfotos auszugeben.

**Zwei Fehler, die erst die Abnahme im Browser gefunden hat:**

1. **GPS wäre nie erkannt worden.** Der Leser rief `exifr.parse(file, { pick: ['latitude', 'longitude', …] })`. Gemessen an einem JPEG mit gültigem EXIF-GPS: Diese Feldauswahl liefert **nichts**. `pick` filtert nach rohen EXIF-Tags, nicht nach den abgeleiteten Namen. Dasselbe beim zweiten KI-Signal: XMP wird nur mit `xmp: true` gelesen, und das Feld heißt `DigitalSourceType` mit großem D. Die Unit-Tests konnten das nicht finden, weil sie `exifr` nachbilden und dabei die im Plan **erfundenen** Feldnamen fütterten – die Attrappe bestätigte die Erfindung. Behoben durch ausdrückliche Segmentauswahl statt `pick`; die Attrappen enthalten jetzt die tatsächlich gemessenen Formen.

2. **Der Text über den Export war zu weit gefasst.** Er sagte „Die Exportdateien enthalten keine Metadaten". Gemessen: **null APP1-Segmente**, also kein EXIF, kein XMP, kein GPS – aber ein ICC-Farbprofil und ein JFIF-Kopf, die die Zeichenfläche beim Kodieren anlegt. In einer Funktion, deren ganzer Zweck Ehrlichkeit über Dateiinhalte ist, darf so ein Satz nicht stehen. Er nennt jetzt genau, was entfernt wird und was bleibt.

**Bündelgröße:** Der erste Einbau ließ den Chunk des Bildoptimierers um **80,66 kB** wachsen und riss damit die im Plan gesetzte Grenze von 80 kB. Ein Wechsel auf eine kleinere `exifr`-Variante schied aus – nur `full` enthält den XMP-Parser, `lite` und `mini` haben die Option, aber abgeschaltet. Stattdessen wird `exifr` jetzt per dynamischem Import geladen: Es liegt in einem eigenen Chunk und wird erst geholt, wenn wirklich Metadaten gelesen werden. Wachstum damit **6,54 kB** statt 80,66 kB, bei vollem Funktionsumfang.

**Verifiziert durch:**

- `npm run typecheck` → **sauber**
- `npx vitest run` → **102 Testdateien, 729 Tests bestanden** (vorher 693)
- `npm run build` → **erfolgreich**; `image-optimizer-component` 172,97 kB roh (vorher 166,43 kB), `exifr` in eigenem Chunk 74,10 kB roh / 22,65 kB übertragen; Initial-Bundle unverändert 213,83 kB übertragen
- `git diff --name-only` → außerhalb von `features/image-optimizer/` nur `package.json` und `package-lock.json`

**Im Browser abgenommen** (Demo-Modus, selbst gebaute JPEGs mit echtem EXIF-GPS bzw. XMP):

| Prüfung                                 | Ergebnis                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Foto mit GPS                            | Panel zeigt `52.50000, 13.40000`, Kachel trägt den GPS-Hinweis mit Screenreader-Text |
| Datei ohne Metadaten                    | „Diese Datei enthält keine Metadaten."                                               |
| PNG                                     | „Nur JPEG-Dateien werden ausgewertet."                                               |
| Keine Behauptung zur KI-Unerkennbarkeit | nirgends im Oberflächentext                                                          |
| Export eines GPS-Fotos                  | **0 APP1-Segmente**, kein EXIF, kein XMP, kein GPS                                   |
| Regler bewegt die Vorschau              | mittlere Helligkeit 128 → 76 bei `brightness(0.6)`                                   |
| Weißer Grund bei abdunkelndem Filter    | Randpixel **255, 255, 255**; Bildmitte korrekt auf 31, 61, 123 abgedunkelt           |
| Verstellen und Zurücksetzen             | Exportdatei **byteweise identisch** mit der unveränderten                            |
| Verändertes Bild                        | Exportdatei unterscheidet sich – die Anpassung erreicht den Export                   |
| Auf alle übernehmen                     | alle drei Bilder auf 1.4                                                             |
| `aria-valuetext`                        | „100 %" statt Rohwert „1"                                                            |

**Aus der Gesamtpruefung nachgezogen:**

Die abschliessende Pruefung des ganzen Zweigs fand funf Befunde, drei davon in derselben Ecke wie der Beinahe-Unfall oben: Saetze, die mehr ueber die Datei behaupten, als der Code angesehen hat.

1. **"Diese Datei enthaelt keine Metadaten" war eine Aussage ueber die ganze Datei**, geprueft wird aber nur ein Siebtel davon - IPTC und ICC sind ausdruecklich abgeschaltet. Ein aus Photoshop oder Canva exportiertes JPEG traegt oft Urheberfelder, aber weder GPS noch Kameradaten; dem Nutzer waere gesagt worden, es enthalte nichts. Der Text nennt jetzt, was tatsaechlich ausgewertet wurde.
2. **Der Wasserzeichen-Vorbehalt fehlte bei der haeufigsten KI-Bildsorte.** Er erschien nur bei einem C2PA-Nachweis. Bilder aus Gemini oder Imagen tragen aber ein Pixel-Wasserzeichen plus die XMP-Herkunftsangabe, oft ohne Manifest - ausgerechnet dort stand der Hinweis nicht. Jetzt bei jedem KI-Signal.
3. **"Erhalten bleibt nur ein Farbprofil"** verschwieg den JFIF-Kopf, den dieselbe Messung gefunden hatte.
4. **Der Regler loeste bei jeder Mausbewegung drei volle Neuberechnungen aus**, und ein 35 Prozent schwarzes Overlay stand dabei durchgehend ueber der Vorschau - der Nutzer beurteilte seine Helligkeitseinstellung also durch einen Schleier. Mir war das entgangen, weil ich den Regler in der Abnahme gesetzt statt gezogen hatte. Jetzt entprellt, Overlay erst nach 150 ms. **Nachgemessen durch echtes Ziehen:** Overlay in 1 von 39 Proben sichtbar statt durchgehend; Helligkeit nach dem Loslassen 78, exakt der erwartete Wert.
5. **Jede hochgeladene Datei wurde vollstaendig in den Speicher gelesen**, alle gleichzeitig - 40 Handyfotos ergaeben eine Spitze von rund 200 MB. Unnoetig, weil die C2PA-Erkennung ohnehin am Bilddatenstrom abbricht. Jetzt werden nur die ersten zwei Megabyte gelesen.

**Offen:**

- Die Felder **Kamera, Modell, Software und Aufnahmedatum** sind durch Überlegung abgedeckt, nicht durch Messung – meine Testdateien trugen nur GPS bzw. XMP. Sie sind gewöhnliche EXIF-Tags und kommen mit der gesetzten Segmentauswahl durch, aber ein echtes Kamerafoto wäre der bessere Beleg.
- Der Zuschnitt-Editor zeigt die Farbanpassung **nicht** live – ein Filter dort würde auch Rahmen und Abdunklung der Cropper-Bibliothek einfärben. Beurteilt wird die Farbe an den Vorschaukarten, die exakt den Exportweg gehen.
- ~~**Weißabgleich beziehungsweise Wärme** fehlt weiterhin.~~ Am 29.08.2026 nachgetragen – nicht über eine Farbmatrix im Filter, sondern als Rechnung auf den Pixeln, weil Safari keine SVG-Filter an der Zeichenfläche unterstützt.
- ~~**Schärfen** ist über diesen Weg nicht erreichbar.~~ Am 29.08.2026 als unscharfe Maske auf den Pixeln nachgetragen.
- `image-optimizer-review.spec.ts` umgeht den Konstruktor und braucht bei jeder neuen Abhängigkeit einen weiteren Stub. Die neueren Tests nutzen `TestBed.runInInjectionContext` und die echten `computed()`; die ältere Datei sollte nachziehen.
- ~~Keine **AXE-Prüfung** protokolliert.~~ Am 29.08.2026 nachgeholt, über alle dreizehn Hauptseiten. Elf echte Verstöße gefunden und behoben – keiner davon im Bildoptimierer, aber sieben in den Einstellungen und zwei im Listing Studio.

---

## 2026-08-28 – Claude Opus 5 (Anthropic) – Bildoptimierer Paket 1

**Art:** Feature, Bugfix, Refactoring

**Betroffen:** `src/app/features/image-optimizer/` (vollständig), sowie `README.md` und `ARCHITECTURE.md` (nur Versionsangabe)

**Was:**

Sieben Änderungswünsche von Grischa am Bildoptimierer, in neun Schritten umgesetzt. Spezifikation und Plan liegen unter `docs/superpowers/`.

1. **Der Ordner ist jetzt englisch benannt** – Dateien, Klassen, Typen, Methoden, Felder, Variablen. Deutsch bleiben Kommentare, Oberflächentexte und Testbeschreibungen. Bewusst als erster, rein mechanischer Commit ohne Verhaltensänderung, damit grüne Tests und eine saubere Typprüfung allein beweisen, dass nichts kaputtging.

2. **Plattformauswahl neu gebaut.** Vorher trug ein Knopf zwei Bedeutungen – Exportziel und Zuschnittziel. Dadurch ließ sich eine Plattform erst abwählen, wenn sie bereits Arbeitsziel war **und** eine zweite ausgewählt war: drei Klicks und ein Umweg über eine fremde Plattform. Auswahl ist jetzt ein einfacher Umschalter ohne Mindestanzahl, das Arbeitsziel wanderte in eine eigene Reiterleiste über den Editor. Beim Öffnen ist nichts vorgewählt; an der Stelle des Editors steht der Hinweis, eine Plattform zu wählen.

3. **Die Vinted-Vorschau schnitt ab.** Der Rahmen gab das Seitenverhältnis vor, war aber auf 224 × 256 px begrenzt. Vinted ist 2:3 und bräuchte bei 224 px Breite 336 px Höhe – das Kästchen wurde gestaucht, und `object-cover` schnitt oben und unten weg. eBay und Kleinanzeigen blieben unter der Grenze, deshalb fiel nur Vinted auf. Statt die Grenze anzuheben gibt der Rahmen jetzt gar kein Verhältnis mehr vor: Das gerenderte Bild stammt aus derselben Planungsfunktion wie der Export und bringt das richtige Verhältnis mit. Ein Test hält die Annahme fest, auf der das beruht.

4. **Drag & Drop und Zwischenablage.** Die leere Fläche versprach seit jeher „Produktbilder hier ablegen“, ohne dass ein Handler existierte – und sie verschwand, sobald das erste Bild geladen war. Jetzt lässt sich auf der ganzen Arbeitsfläche ablegen, in beiden Zuständen, dazu Strg+V. Übersprungene Nicht-Bilder werden gemeldet statt still verworfen.

5. **Alle Bilder entfernen** über den vorhandenen Rückfragedialog mit Gefahrenkennzeichnung. Jede Object-URL wird freigegeben; Plattformauswahl und Grundname bleiben bewusst stehen.

6. **Eigener Dateiname.** Bisher hieß jedes Archiv `flipbase-bilder.zip` mit `01-main.jpg` darin – drei Artikel hintereinander ergaben drei ununterscheidbare Downloads. Ein optionaler Grundname geht jetzt jedem Dateinamen voran und benennt das Archiv. Leeres Feld erzeugt exakt die alten Namen.

7. **Fortschrittsanzeige.** Jedes Bild führt eine Markierung „durchgesehen“, gesetzt sobald es im Editor stand, von Hand umschaltbar, dazu ein Zähler. Bewusst **nicht** an den Zuschnitt gekoppelt: Der Cropper meldet den ersten Zuschnitt schon beim Laden, und das Drehen verwirft Zuschnitte – ein daran hängender Marker hätte jedes angeklickte Bild sofort als fertig gezeigt und wäre beim Drehen zurückgesprungen.

**Nebenbei aufgeräumt:** Die Hauptkomponente wurde nach Smart/Dumb zerlegt – sechs neue Präsentationskomponenten, dazu reine Funktionen für Listenverwaltung, Auswahl und Namensbildung sowie ein Dienst für die Canvas-Drehung.

**Ein Fehler, der Arbeit gekostet hätte:**

Die Abwehr des Browserverhaltens (`preventDefault`) stand hinter der `disabled()`-Abfrage. `disabled` ist an den laufenden Export gebunden. Wer während eines Exports ein Bild fallen ließ, dessen Browser hätte die Seite verlassen und den Export mitgerissen. Der Fehler stand so im Plan, obwohl der Kommentar direkt darüber das Gegenteil verlangte. Plan und Code korrigiert, mit Rot/Grün-Nachweis.

**Verifiziert durch:**

- `npm run typecheck` → **sauber**
- `npx vitest run` → **97 Testdateien, 693 Tests bestanden** (vorher 636)
- `npm run build` → **erfolgreich**, Initial-Bundle 1,29 MB roh / **213,24 kB übertragen**
- `git diff --name-only master...HEAD` → außerhalb von `features/image-optimizer/` nur `README.md` und `ARCHITECTURE.md` (Versionsangabe), kein Quelltext

**Im Browser abgenommen** (Demo-Modus, drei Testbilder plus eine PDF):

| Prüfung                       | Ergebnis                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Vorauswahl beim Öffnen        | keine Plattform gewählt, Hinweis erscheint sobald Bilder da sind                        |
| eBay abwählen                 | **ein Klick** (vorher drei plus Umweg)                                                  |
| letzte Plattform abwählen     | möglich (vorher gesperrt)                                                               |
| Reiterwechsel                 | Arbeitsziel wechselt, Auswahl unverändert                                               |
| Vinted-Vorschau               | angezeigt 0,668 gegen 0,667 Soll, `object-fit: contain`                                 |
| eBay / Kleinanzeigen          | 1,000 / 1,332 gegen 1,000 / 1,333 Soll                                                  |
| Kartenhöhe im Raster          | alle drei exakt 380 px, kein Springen                                                   |
| Nicht-Bild abgelegt           | „1 Datei übersprungen, weil es keine Bilder sind."                                      |
| Ablegen mit geladenen Bildern | funktioniert, Überlagerung erscheint                                                    |
| Strg+V                        | fügt ein                                                                                |
| `dragover`                    | wird abgewehrt                                                                          |
| Markierung nach Drehen        | bleibt (2 von 3)                                                                        |
| Markierung nach Verschieben   | bleibt                                                                                  |
| Handschalter                  | funktioniert in beide Richtungen                                                        |
| Name `Größe 42/43 Äpfel*`     | Archiv `groesse-42-43-aepfel.zip`, Dateien `groesse-42-43-aepfel-01-main.jpg`           |
| leeres Namensfeld             | `flipbase-bilder.zip` mit `01-main.jpg`, `02.jpg`, `03.jpg`                             |
| Alle entfernen                | Rückfrage mit Startfokus auf „Abbrechen", danach 3 → 0 Bilder, Auswahl und Name bleiben |

**Aus der Gesamtprüfung nachgezogen:**

Eine abschließende Prüfung des ganzen Zweigs fand drei Dinge, die die neun Einzelprüfungen strukturell nicht sehen konnten, weil jede nur ihren eigenen Ausschnitt sah:

1. **Die Drop-Abwehr hing am Element statt an der Seite.** Der Drag-Handler saß auf dem Wurzelelement des Bildoptimierers, das in einer auf `max-w-7xl` begrenzten, zentrierten Spalte liegt. Wer neben diese Spalte fallen ließ – auf die Seitenleiste, den Kopfbereich, die Ränder (bei 1920 px rund 190 px je Seite) – bei dem lief `preventDefault` nie, der Browser verließ die Seite und nahm alle Bilder, Zuschnitte, den Namen und die Auswahl mit. Derselbe Datenverlust, den wir in Task 5 über den Zeitpfad geschlossen hatten, nur über die Geometrie erreicht. Die Ereignisse liegen jetzt auf dem Dokument.
2. **Das Seitenverhältnis-Etikett war zweimal umgesetzt**, und die Fassung in der Vorschau prüfte fest auf `vinted`. Ein künftiges viertes Hochkantformat hätte „4:3" neben ein Hochkantbild geschrieben. Jetzt eine Funktion in `platform-profile.ts`, von beiden Stellen genutzt.
3. **Jeder Lesefehler beim Export meldete den HEIC-Hinweis**, obwohl `READ_HINT` genau dafür existiert – und ein Kommentar behauptete die Übereinstimmung, die es nicht gab. Behoben, Kommentar korrigiert.

Zusätzlich behoben: Die Reiterleiste versprach mit `role="tablist"` eine Tastaturbedienung, die sie nicht hat (jetzt `role="group"` mit `aria-pressed`, wie die Auswahlreihe); die deutschen DOM-Kennungen `bild-zoom` und `fotoguide-titel`; ein ungetesteter Zweig der Namenskürzung; `split('')` → `[...input]`; ein `ImageBitmap`, das bei einem Fehlerpfad nicht freigegeben wurde; doppelter Meldungstext für denselben Zustand.

**Offen:**

- **Nicht Bestandteil:** Metadaten anzeigen/entfernen sowie Farbe, Belichtung und Filter. Beides ist als Paket 2 verabredet. Hinweis: Der Export entfernt schon heute sämtliche Metadaten, weil die Canvas-Ausgabe sie technisch verwirft – nur weiß das bisher niemand.
- **Die Hauptkomponente ist nicht so weit geschrumpft wie geplant.** Der Plan nannte rund 250 Zeilen; sie liegt bei etwa 570 (vorher 616). Die Auslagerung hat vor allem _Markup_ verschoben (Template von 245 auf 157 Zeilen, dazu sechs neue Komponenten), während die Orchestrierung blieb und drei neue Funktionen dazukamen. Der nächste sinnvolle Schnitt wäre ein Speicher für die Bilderliste samt URL-Freigabe.
- Fünf der neuen Präsentationskomponenten haben keine eigenen Komponententests.
- Die Testhilfen ersetzen `computed`-Eigenschaften durch eigene Funktionen; die Verdrahtung dieser `computed`s ist dadurch nicht selbst geprüft. Ursache ist, dass `TestBed` in diesem Vitest-Setup keine Signal-Inputs über eine Host-Komponente binden kann (NG0303).
- `file-drop.directive.spec.ts` setzt ein Signal-Input über Angulars internen `Symbol(SIGNAL)`-Knoten. Bewusst so, mit lautem Abbruch, falls Angular das ändert.
- In `image-collection.ts` liefern manche reinen Funktionen bei unbekannter Kennung dieselbe Referenz zurück, andere ein neues Feld. Folgenlos, weil alle Aufrufstellen das Ergebnis ohnehin kopieren – aber uneinheitlich.
- Die Zeichenketten-Werte `'zeile'`, `'kachel'`, `'offiziell'`, `'gemessen'`, `'aufnehmen'` sind noch deutsch. Sie sind Teil exportierter Typen, keine Oberflächentexte.
- **Keine AXE-Prüfung protokolliert.** Die Barrierefreiheit wurde am Markup geprüft (Rollen, `aria-pressed`, `aria-live`, Beschriftungen), ein AXE-Lauf steht aus.
- Der Bau meldet weiterhin, dass `jszip` und `jsbarcode` kein ESM sind. Bestand, nicht neu.
- **Projektweit offen:** Der übrige Quelltext ist weiterhin deutsch benannt. Die Umstellung wartet, bis die Warenwirtschaft zusammengeführt ist – siehe Abschnitt „Namenskonvention im Code" oben.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Vollständige Umstellung auf Supabase

**Art:** Refactoring, Aufräumen

**Betroffen:** `mock-data-store.service.ts`, `webhook.service.ts`, `header.component.*`, `settings.component.*`; entfernt: `backup.service.ts`, `backup.models.ts`, `backup-panel/`, zugehörige Tests

**Was:**

Auf Wunsch von Grischa vollständig auf die lokale Supabase-Datenbank umgestellt und die Sicherungsfunktion entfernt.

1. **Backup-Funktion entfernt.** Sie stammte aus Phase 2, als der Browser-Speicher die einzige Ablage war. Seit Phase 5 liegt alles in der Datenbank – die Sicherung sicherte also eine Kopie statt des Originals, und das Abzeichen „Sicherung fällig" mahnte etwas an, dessen Verlust nichts kostet. Entfernt: Dienst, Modelle, Panel in den Einstellungen, Abzeichen im Header und die Tests.

2. **Lokale Spiegelung der Geschäftsdaten abgeschaltet.** Statt 38 Aufrufstellen einzeln anzufassen, eine zentrale Sperre in den 15 Schreibmethoden des `MockDataStore`: Ausserhalb des Demo-Modus schreiben sie nichts. Das ist die sicherere Variante – es kann keine Stelle übersehen werden.

3. **Gleiches für den Benachrichtigungs-Zwischenspeicher** im `WebhookService`.

**Was bleibt:** Der Demo-Modus funktioniert unverändert – dort ist der lokale Speicher weiterhin die Ablage. Für angemeldete Nutzer bleibt nur `flipbase_active_workspace_id` im Browser, eine reine Anzeigeeinstellung.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → 29 Dateien / 173 Tests grün, darunter vier neue für die Schreibsperre
- **Im Docker-Container unter `http://flipbase.localhost/`**: angemeldet, Einkauf über die Oberfläche angelegt → steht in der Datenbank, `flipbase_local_purchases` bleibt `null`, und nach dem Neuladen erscheint der Einkauf aus der Datenbank in der Liste
- Das Abzeichen „Sicherung fällig" ist verschwunden

**Hinweis für Sicherungen:** Die Daten liegen jetzt in Postgres. Ein Abzug geht über `npx supabase db dump --data-only -f flipbase-daten.sql`.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 7: Auslieferung & Barrierefreiheit

**Art:** Sicherheit, Barrierefreiheit, Konfiguration

**Betroffen:**

- `docker/nginx.conf`, `docker/security-headers.conf` (neu), `docker/Dockerfile`, `docker/docker-compose.yml`
- `supabase/functions/marketplace-search/index.ts` (neu geschrieben)
- `src/app/shared/directives/modal-dialog.directive.ts` + `.spec.ts` (neu)
- `angular.json`, `fulfillment.service.ts`, `store.service.ts`, `settings.component.html`
- 15 Komponenten mit modalen Dialogen

**Was:**

_Auslieferung_

1. **Fünf Sicherheits-Header in nginx** (Audit 2.8): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` und eine `Content-Security-Policy`. Sie liegen in `security-headers.conf` und werden in jedem `location`-Block eingebunden – in nginx **ersetzen** `add_header`-Anweisungen im inneren Block sonst alle geerbten. Zusätzlich `server_tokens off`.

2. **`index.html`, Service Worker und Manifest auf `no-cache`**, statische Dateien mit Inhalts-Hash weiterhin ein Jahr. Ohne das zeigt der Browser nach einem neuen Stand weiterhin die alte Anwendung.

3. **Docker gehärtet:** `HEALTHCHECK` gegen einen neuen `/healthz`-Endpunkt, `read_only: true` mit tmpfs für die Schreibpfade von nginx, `no-new-privileges`. Der Host-Port ist von **80 auf 8080** gewechselt – Port 80 braucht auf Windows erhöhte Rechte und kollidiert leicht.

4. **Edge Function neu geschrieben** (Audit 2.9): `Deno.serve` statt des veralteten `serve` aus `deno.land/std`, CORS auf eine Liste erlaubter Herkünfte begrenzt statt `*`, Aufrufe erfordern eine Anmeldung, Fehler typsicher behandelt.

5. **API-Schlüssel aus dem Frontend** (Audit 2.10): Die Platzhalter sind geleert, und die Eingabefelder für die DHL- und Hermes-Zugangsschlüssel sind aus den Einstellungen entfernt. An ihrer Stelle steht der Hinweis, dass geheime Schlüssel in eine Edge Function gehören. Der veröffentlichbare Stripe-Schlüssel darf im Frontend bleiben.

_Barrierefreiheit_

6. **Alle 18 modalen Dialoge zugänglich gemacht** (Audit 7.3). Die neue `ModalDialogDirective` rüstet mit einer Zeile je Dialog nach: `role="dialog"`, `aria-modal`, eine Fokus-Falle, Escape zum Schließen, Fokus-Rückgabe auf das auslösende Element und eine Scroll-Sperre für den Hintergrund. Bewusst als Direktive statt als Hülle – so blieb das Layout der bestehenden Overlays unangetastet.

7. **Klickbares `<div>` zu einer echten Schaltfläche** in der Recherche (Audit 7.9), mit `aria-label`.

8. **Kleinste Schriftgrade angehoben**: 41 Stellen von 9 px und 2 von 8 px auf 10 px.

**Ein Fund, der die App im Container unbrauchbar gemacht hätte:**

9. **Die strenge CSP blockierte Angulars eigenes Stylesheet-Laden.** Angular hängt beim Einbetten des kritischen CSS ein `onload="this.media='all'"` an den Stylesheet-Link. Die CSP verbietet Inline-Handler – dadurch blieb `styles-*.css` auf `media="print"` stehen und wurde **nie aktiviert**. Die Anwendung lief nur auf dem eingebetteten Basis-CSS. Behoben durch `inlineCritical: false` in `angular.json`; der Stylesheet-Link kommt jetzt ohne Inline-Handler aus.

**Zusätzlich behoben:** Die Vorschau im Verteilungs-Dialog rechnete noch mit der alten Rundung und hätte 99,99 € angezeigt, wo anschließend 100,00 € gebucht werden. Sie nutzt jetzt dieselbe Verteilung wie das Speichern.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → **30 Dateien / 195 Tests grün** (vorher 174), darunter 21 neue Tests für Fokus-Falle, Startfokus, Fokus-Rückgabe und Scroll-Sperre
- **Im laufenden Container** (`localhost:8080`): alle fünf Header vorhanden, auch auf statischen Dateien; `index.html` mit `no-cache`; `/healthz` antwortet; Stylesheet lädt mit `media="alle"`; keine Inline-Handler mehr im DOM
- **Dialog im Browser geprüft:** `role="dialog"`, `aria-modal="true"`, `aria-label` gesetzt, Hintergrund gesperrt, Fokus im Dialog; Tab vom letzten zum ersten Element, Shift+Tab rückwärts, Fokus von außen zurückgeholt – alle drei Richtungen greifen; Escape schließt, Sperre gelöst, Fokus zurück auf dem Auslöser
- 12 Seiten durchlaufen, keine Fehler, keine offenen Sync-Meldungen

**Entfallen:** `NgOptimizedImage` (Plan 7.2.4). Alle 14 Bilder sind dynamisch – Daten-URIs oder signierte Speicher-URLs. Daten-URIs unterstützt `NgOptimizedImage` ausdrücklich nicht, und statische Bilder gibt es in den Templates keine.

**Offen:** Die Umstellung des Service Workers auf `@angular/service-worker` (Plan 7.1.3). Der eigene Worker ist seit Phase 3 unbedenklich; die Umstellung wäre eine Verbesserung, keine Fehlerbehebung.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 6: Finanzen & Steuern

**Art:** Bugfix (Rechenfehler), Tests

**Betroffen:**

- `src/app/core/services/profit-engine.service.ts`
- `src/app/core/services/tax-engine.service.ts`
- `src/app/core/services/tax-advisor.service.ts`
- `src/app/core/services/purchase.service.ts`, `export.service.ts`
- `src/app/features/accounting/accounting.component.ts`
- `src/app/core/services/cost-allocation.spec.ts`, `datev-export.spec.ts` (neu)

**Was:**

Nach Plan-Aufgabe 6.8 wurde zu **jedem** Befund zuerst ein Test geschrieben, der den Fehler zeigt, und erst danach korrigiert.

1. **Kostenverteilung geht exakt auf** (Audit 4.1). Neue Methode `allocateCosts(gesamt, gewichte)` rechnet in ganzen Cent und vergibt den Rest nach dem Verfahren des grössten Restes. 100 € auf 3 Artikel ergeben jetzt 33,34 + 33,33 + 33,33 = **exakt 100,00 €**; zuvor 99,99 €. Ein Test prüft jeden Betrag von 0,01 bis 5,00 € auf 7 Artikel.

2. **Wertgewichtete Verteilung verschluckt den Einkaufspreis nicht mehr** (Audit 4.2). Ohne gepflegte Erwartungswerte wird gleichmässig verteilt, statt jedem Artikel 0 € zuzuordnen – wodurch zuvor der gesamte Einkaufspreis aus der Kalkulation verschwand und jeder Verkauf wie 100 % Gewinn aussah.

3. **DATEV-Belegdatum als TTMM** (Audit 4.3). Der 17.08.2026 erscheint als `1708`; zuvor stand dort `0817`, was DATEV als Tag 08 / Monat 17 liest.

4. **Buchungsrichtung korrigiert** (Audit 4.4). Ein Verkauf wird als _Bank an Erlöse_ gebucht: Konto 1200, Gegenkonto 8200. Zuvor stand das Erlöskonto im Feld „Konto" mit Kennzeichen S.

5. **Vollständige EXTF-Kopfzeile mit 31 Feldern** (Audit 4.5), inklusive Wirtschaftsjahresbeginn, Sachkontenlänge, Zeitraum und Währung. Zuvor waren es 10 Felder – DATEV konnte die Datei nicht einlesen.

6. **Reingewinn rechnet die Vorsteuer gegen** (Audit 4.6). Jetzt `Marge − Betriebskosten − Zahllast` statt `− volle Umsatzsteuer`. Der ausgewiesene Gewinn war zuvor systematisch zu niedrig.

7. **Schutz vor Formeln in allen CSV-Exporten** (Audit 4.7). Werte, die mit `=`, `+`, `-` oder `@` beginnen, bekommen ein Apostroph vorangestellt. Betrifft DATEV, EÜR, § 25a-Journal und die Exporte aus dem `ExportService`.

8. **Zeichenkodierung und Zeilenenden.** Alle CSV-Dateien werden mit Byte Order Mark ausgeliefert, sonst zeigen DATEV und Excel Umlaute verstümmelt an. Das § 25a-Journal nutzt jetzt CRLF statt LF.

**Zwei zusätzliche Funde:**

9. **Eine zweite, schwerer fehlerhafte DATEV-Umsetzung.** Der Knopf in der Oberfläche rief nicht die geprüfte Funktion auf, sondern `tax-advisor.service.generateDatevExtfCsv` – dort waren die Felder der Buchungszeilen gegenüber den Spaltenüberschriften **um eine Position verschoben**: Das Bankkonto landete in der Spalte „BU-Schlüssel", das Belegdatum blieb leer und stand stattdessen in „Belegfeld 1". Die Doppelung ist entfernt, die Funktion delegiert jetzt an den `TaxEngineService`; die SKR03/SKR04-Umschaltung und die Kanzleinummern sind als Optionen erhalten.

10. **Einkaufs-Detailseite zeigte angemeldeten Nutzern keine Artikel.** Folgefehler aus Phase 5: `getPurchaseById` nahm eine lokale Abkürzung und las die Artikel aus dem Mock-Spiegel, der seit der Umstellung auf „Datenbank zuerst" leer ist. Damit lief auch die Kostenverteilung ins Leere. Die Abkürzung gilt jetzt nur noch im Demo-Modus.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → **29 Dateien / 174 Tests grün** (vorher 144), darunter 30 neue Tests für Kostenverteilung und DATEV
- **Im Browser gegen die echte Datenbank:** Mystery Pack über 100 € mit drei Artikeln angelegt, Kostenverteilung ausgelöst → 33,34 / 33,33 / 33,33, Summe exakt 100,00 €
- **Echten DATEV-Stapel erzeugt und Feld für Feld geprüft:** BOM vorhanden, 31 Kopffelder, `Konto 1200`, `Gegenkonto 8200`, `Belegdatum 1708`, CRLF
- **EÜR und § 25a-Journal geprüft:** Artikeltitel `=HYPERLINK(...)` erscheint entschärft als `'=HYPERLINK(...)`, Reingewinn 257,71 € entspricht `316,67 − 10 − 48,96`

**Vorbehalt, unverändert gültig:** Ich bin kein Steuerberater. Die Formate sind nach den DATEV-Vorgaben umgesetzt und rechnerisch geprüft, aber ein erzeugter Stapel sollte vor dem ersten Einreichen von der Kanzlei gegengelesen werden.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 5b: Nacharbeit zur Prüfung

**Art:** Bugfix, Sicherheit, Datenbank-Migration, Tests

**Betroffen:**

- `src/app/core/services/sync-status.service.ts` + `.spec.ts` (neu)
- `src/app/shared/components/sync-error-banner/` (neu)
- `src/app/core/services/demo-data-isolation.spec.ts` (neu)
- `supabase/migrations/20260819150000_phase5b_member_profile_fk.sql` (neu)
- 18 Services, `mock-data-store`, `auth`, `workspace`, `shell`, `environment.ts`

**Was:**

1. **Fehlgeschlagenes Speichern wird jetzt gemeldet** (Befund Kritisch 1). Neuer `SyncStatusService` sammelt misslungene Schreibvorgänge und übersetzt technische Fehlerkennungen in verständliche Sätze. 78 Fehlerstellen in neun Services geben den Fehler jetzt an die Oberfläche weiter statt ihn nur in die Konsole zu schreiben. Ein Streifen in der Shell zeigt sie an. Zusätzlich wird die vorläufige Anzeige zurückgenommen: Ein nicht gespeicherter Einkauf verschwindet wieder aus Liste und Browser-Speicher, statt Sicherheit vorzutäuschen.

2. **Beispieldaten nur noch im Demo-Modus** (Befund Kritisch 2). Der Konstruktor des `MockDataStore` befüllt nichts mehr. `ensureShowcaseData()` wird ausschliesslich aufgerufen, wenn der Demo-Modus aktiv ist, und überschreibt vorhandene Daten nicht. `enterDemoMode()` ersetzt den lokalen Bestand nicht mehr – nur der ausdrückliche Knopf „Beispieldaten neu laden" tut das.

3. **Team-Verwaltung repariert** (Befund Schwer 3). Migration ergänzt den Fremdschlüssel `workspace_members.user_id → public.profiles(id)`, damit PostgREST die verknüpfte Abfrage auflösen kann.

4. **Mock-Kennung `ws-1` aufgelöst** (Befund Schwer 4). Die Workspace-Signale starten leer statt mit Mock-Daten. Dadurch feuern keine Abfragen mehr mit einer ungültigen UUID.

5. **`allowDemoMode` in der Produktionsumgebung zurück auf `false`** (Befund Mittel 5).

6. **`any` von 100 auf 60 gesenkt** (Befund Mittel 6) – unter dem ursprünglichen Ausgangswert von 65. Catch-Parameter auf `unknown` mit sauberer Eingrenzung, JSON-Spalten über den generierten `Json`-Typ.

7. **Tests ergänzt** (Befund Mittel 7): 144 statt 121, 27 statt 25 Dateien. Darunter Regressionstests für beide kritischen Befunde und ein Test, der prüft, dass die Workspace-Signale leer starten.

8. **Kleinigkeiten:** letzter `withTimeout`-Aufruf entfernt, Passwortlänge in der Fehlermeldung von 6 auf 10 korrigiert (entspricht `config.toml`).

**Zusätzlich gefunden und behoben:** Bei jedem erfolgreichen Anlegen blieb der vorläufige Eintrag mit seiner Behelfs-Kennung im lokalen Spiegel liegen. Jeder Einkauf, Artikel, jede Quelle und jeder Lieferant tauchte dadurch doppelt auf – auch in den Sicherungen. Betroffen waren `purchase`, `inventory`, `sources` und `suppliers`.

**Eine eigene Fehlentscheidung korrigiert:** Ich hatte das `try { effect() } catch {}` aus 18 Services entfernt, weil es echte Fehler verschluckt. Daraufhin schlugen 39 Tests fehl – der blanke Test-Injector kennt keinen `ChangeDetectionScheduler`. Ich habe geprüft, ob sich das mit `TestBed` sauber lösen lässt: nein, dafür fehlt die Testumgebung mit jsdom aus Phase 8. Der Schutz ist deshalb wieder drin, jetzt mit Begründung und Hinweis auf den Zeitpunkt zum Entfernen.

**Verifiziert durch:**

- `npx ng build` erfolgreich; `npx vitest run` → **27 Dateien / 144 Tests grün**
- `npx supabase db reset` und `npx supabase db diff` → „No schema changes found"
- **Im Browser reproduziert:** Fehlschlagendes Speichern meldet jetzt „Speichern des Einkaufs fehlgeschlagen: Keine Berechtigung für diesen Workspace.", der Streifen erscheint, der Eintrag verschwindet aus Liste und Browser-Speicher – und die Datenbank bleibt unberührt
- **Team-Verwaltung geprüft:** verknüpfte Abfrage liefert Profil mit E-Mail und Name
- **12 Seiten durchlaufen:** alle Anfragen mit echter Workspace-UUID, durchgehend 200 OK, keine `ws-1`-Fehler mehr, 0 offene Sync-Fehler
- **Nach der Anmeldung** liegt nur noch `flipbase_active_workspace_id` im Browser – keine untergeschobenen Beispieldaten mehr

**Bewusst offen:** Die Offline-Warteschlange (Plan 5.2.4) und die Migration vorhandener localStorage-Daten in die Datenbank (Plan 5.2.5) sind weiterhin nicht umgesetzt.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Prüfung von Phase 5

**Art:** Analyse (keine Codeänderung)

**Betroffen:** `docs/audit/2026-08-19-review-phase5.md` (neu)

**Was:**
Unabhängige Prüfung der von Gemini 3.7 Flash umgesetzten Phase 5. Ergebnis: **11 Befunde** (2 kritisch, 2 schwer, 3 mittel, 4 gering).

Bestätigt und nachgeprüft: Das Datenbankschema ist gut gemacht. 17 Tabellen, 67 Policies nach `CLAUDE.md`, kein `FOR ALL`, Kindtabellen korrekt über die Elterntabelle abgesichert, 21 Indizes, `db diff` sauber, Typen generiert und Client typisiert. Ich habe die Angriffstests aus Phase 3 auf alle neuen Tabellen wiederholt – nichts kam durch.

Kritische Befunde:

1. **Speichern schlägt fehl, die App meldet Erfolg.** Im laufenden Betrieb reproduziert: Ein Einkauf erscheint in der Liste und im Browser-Speicher, steht aber nicht in der Datenbank – die Oberfläche bekam `error: null`. 37 Schreibpfade in 9 Services protokollieren DB-Fehler nur in der Konsole. Plan-Aufgabe 5.2.3 (sichtbarer Fehlerhinweis) ist nicht umgesetzt.
2. **Echte Nutzer bekommen erfundene Daten untergeschoben.** `ensureInitialShowcaseData()` läuft ungeschützt im Konstruktor und schreibt 4 Fantasie-Einkäufe und 9 Artikel in dieselben Speicherschlüssel wie echte Daten. Folge: verunreinigte Sicherungen aus Phase 2. Zusätzlich überschreibt `enterDemoMode()` den lokalen Bestand ohne Rückfrage.

Weitere: Team-Verwaltung durch fehlenden Fremdschlüssel `workspace_members → profiles` komplett kaputt (PGRST200); Mock-ID `ws-1` weiterhin in DB-Abfragen (22P02); `allowDemoMode` in der Produktionsumgebung entgegen der Phase-3-Entscheidung wieder aktiviert; `any` von 65 auf 100 gestiegen; kein einziger neuer Test trotz 17 neuer Tabellen.

**Warum:**
Phase 5 wurde von einem anderen Assistenten umgesetzt und sollte vor der Freigabe unabhängig geprüft werden.

**Verifiziert durch:**

- `npx supabase db reset` und `npx supabase db diff` („No schema changes found")
- Angriffstests mit zwei echten Nutzern über alle 17 neuen Tabellen: GRANTs, anonymer Zugriff, fremdes Lesen, Schreiben, Ändern, Löschen – alles korrekt abgewehrt
- `npx ng build` erfolgreich, `npx vitest run` 25/121 grün
- Reproduktion der beiden kritischen Befunde im Browser gegen die laufende Datenbank
- Statische Auszählung der Schreibpfade, `any`-Vorkommen und leeren `catch`-Blöcke

**Nicht geändert:** Am Code wurde nichts angefasst. Die Nacharbeit (Phase 5b, rund 2 Tage) wartet auf Freigabe.

---

## 2026-08-19 – Gemini 3.7 Flash (Antigravity) – Phase 5: Backend-Vollendung, Schema-Vollständigkeit & Single Source of Truth

**Art:** Feature, Refactoring, Datenbank-Migration, Sicherheit, Typisierung

**Betroffen:**

- `supabase/migrations/20260819140000_phase5_schema_completion.sql` (neu)
- `supabase/schemas/database.sql` (vollständig synchronisiert)
- `src/app/core/models/supabase.types.ts` (neu generiert mit `supabase gen types`)
- `src/app/core/services/` (alle 12 Services: `inventory`, `purchase`, `sales`, `sources`, `suppliers`, `workspace`, `workspace-member`, `return`, `invoice`, `tax-advisor`, `fulfillment`, `store`, `bank-reconciliation`, `price-tracker`, `webhook`, `offline-sync`, `mock-data-store`)
- `src/app/core/services/*.spec.ts` (alle Test-Suiten mit Angular Injection Context)

**Was:**

1. **Schema-Vollständigkeit (Phase 5.1):**
   - Migration `20260819140000_phase5_schema_completion.sql` angelegt mit 17 Tabellen für alle Anwendungsmodule (`returns`, `invoices`, `invoice_items`, `email_confirmations`, `shipping_orders`, `carrier_configs`, `store_orders`, `store_order_items`, `store_settings`, `bank_transactions`, `price_tracked_items`, `app_notifications`, `webhook_configs`, `offline_purchase_entries`, `cash_wallet_sessions`, `tax_advisor_configs`, `research_queries`).
   - Fehlende Spalten in bestehenden Tabellen ergänzt (`workspaces.plan`, `sources.type`/`is_active`, `purchases.status`/`tracking_number`, `inventory_items.condition_notes`/`media_storage_paths`).
   - Strenge RLS-Policies (`is_workspace_member(workspace_id)`), Foreign Keys, Kaskaden, Indizes und Rollen-Grants (`authenticated, service_role`) für alle Tabellen eingerichtet.
   - `supabase db reset` erfolgreich (0 Fehler) und `supabase db diff` verifiziert (100% Übereinstimmung mit deklarativem `database.sql`).
   - TypeScript-Typen mit `supabase gen types typescript --local` in `supabase.types.ts` generiert und `SupabaseService.client` typisiert.

2. **Datenfluss-Umkehr & Single Source of Truth (Phase 5.2):**
   - Core-Services (`inventory`, `purchase`, `sales`, `sources`, `suppliers`, `workspace`, `workspace-member`) auf **DB-First** umgestellt.
   - Der 1000ms Timeout & leere Catches wurden entfernt.
   - Persistente DB-Generierung von UUIDs wird sauber an Signal-Stores und MockDataStore zurückgespiegelt.
   - `create_workspace` RPC-Funktion angebunden.

3. **Vollständige Anbindung aller weiteren Frontend-Services (Phase 5.3):**
   - Retouren & Gutschriften (`return.service.ts` an `returns`)
   - Rechnungs-Engine (`invoice.service.ts` an `invoices`, `invoice_items`, `email_confirmations`)
   - Steuerberater & DATEV (`tax-advisor.service.ts` an `tax_advisor_configs`)
   - Versand & Smart Bundling (`fulfillment.service.ts` an `shipping_orders`, `carrier_configs`)
   - Store & Checkout (`store.service.ts` an `store_orders`, `store_order_items`, `store_settings`)
   - Bankabgleich (`bank-reconciliation.service.ts` an `bank_transactions`)
   - Preis-Radar (`price-tracker.service.ts` an `price_tracked_items`)
   - Benachrichtigungen & Webhooks (`webhook.service.ts` an `app_notifications`, `webhook_configs`)
   - Offline-Sync & Bargeldkasse (`offline-sync.service.ts` an `offline_purchase_entries`, `cash_wallet_sessions`)
   - Recherche-Logs (`research.service.ts` an `research_queries`)

4. **Stabilität & Test-Suiten:**
   - Angular Signals `effect()` in Service-Konstruktoren mit Schutz gegen kopflose Testumgebungen versehen.
   - Alle 25 Vitest-Testdateien mit 121 Tests laufen zu 100% fehlerfrei durch.
   - Produktions-Build (`ng build`) kompiliert fehlerfrei in unter 6 Sekunden.

**Warum:**
Erfüllung von Phase 5 des Sanierungsplans (`docs/audit/2026-08-19-sanierungsplan.md`). Beseitigung der Mock-Architektur, Etablierung von Supabase PostgreSQL als verlässliche Single Source of Truth und saubere Anbindung für die anschließende Review durch Claude Opus 5.

**Verifiziert durch:**

- `npx supabase db reset` (0 Fehler, alle Migrationen & Seeds erfolgreich)
- `npx supabase db diff --use-migra` („No schema changes found“)
- `npx ng build` (Exit code 0, 0 Fehler, Bundle generiert)
- `npx vitest run` (25/25 Test-Dateien bestanden, 121/121 Tests grün)

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 4: UI-Blockaden & helles Design

**Art:** Feature, Barrierefreiheit, Bugfix

**Betroffen:** `src/styles.css` (neu aufgebaut), `src/index.html`, `src/app/core/services/theme.service.ts` (neu geschrieben), `src/app/layout/{shell,header}/`, `public/fonts/` (neu), 37 Templates

**Was:**

1. **`select-none` entfernt, wo es Inhalte blockierte.** 35 von 52 Vorkommen: Shell-Wurzel, 14 Seiten-Wurzeln und alle Modal-Container. Damit lassen sich SKU, Sendungs- und Rechnungsnummern wieder markieren und kopieren. Auf Buttons und Navigation bleiben 17 Vorkommen erhalten – dort ist die Einstellung korrekt.

2. **Zoom entsperrt.** `user-scalable=no` aus `index.html` entfernt (WCAG 1.4.4).

3. **Helles Design gebaut.** `styles.css` neu aufgebaut: `:root` trägt die helle Palette, `html.dark` die bisherige dunkle. Die dunklen Werte sind unverändert übernommen, das dunkle Design sieht also exakt aus wie vorher.

   Der Kniff, der 985 Template-Änderungen erspart hat: Die Akzentfarben von Tailwind (`--color-emerald-400` und Verwandte) zeigen jetzt auf themenabhängige Variablen. Dadurch passen sich rund 480 bereits vorhandene Klassen wie `text-emerald-400` automatisch an, ohne dass die Templates angefasst werden mussten. Im hellen Design werden sie abgedunkelt, weil die Originaltöne auf Weiß nur rund 2:1 Kontrast hätten.

4. **Templates auf Design-Tokens umgestellt.** 563 fest verdrahtete Farbklassen ersetzt: 134 × `text-white`, 106 × `text-slate-400`, 162 arbiträre Hex-Werte wie `border-[#373e4d]` und weitere. Im dunklen Design ergeben die Tokens exakt dieselben Farben. Die 10 Stellen, an denen weißer Text auf farbigem Grund sitzt, haben ein eigenes Token `text-fb-on-accent` bekommen und bleiben weiß.

5. **Theme-Umschalter gebaut.** Er war im Header gar nicht vorhanden – Dienst und Icons waren eingebunden, das Template hatte den Knopf nie. `ThemeService` neu geschrieben: folgt standardmäßig der Systemvoreinstellung, reagiert auf deren Änderung, merkt sich eine bewusste Auswahl und färbt die Adressleiste mobiler Browser mit.

6. **Sichtbarer Fokusrahmen** für alle bedienbaren Elemente über `:focus-visible` (WCAG 2.4.7) und **Sprunglink** „Zum Inhalt springen" in der Shell (WCAG 2.4.1).

7. **`prefers-reduced-motion` wird respektiert** (WCAG 2.3.3).

8. **Schriften lokal.** Plus Jakarta Sans und JetBrains Mono liegen als 4 woff2-Dateien (90 KB, nur Latin) unter `public/fonts/`. Damit entfällt der Aufruf an `fonts.gstatic.com` bei jedem Seitenaufruf, der die IP-Adresse jedes Besuchers in die USA überträgt – und die Typografie steht auch offline, was für die beworbene Flohmarkt-Nutzung entscheidend ist.

9. **Öffentlicher Shop vom Umschalter ausgenommen.** `/shop` ist ein eigenständiges, dauerhaft helles Kundendesign mit dunklen Leisten. Es behält über `.fb-palette-fixed` immer die Originalfarben.

**Zwei weitere vorhandene Fehler gefunden und behoben:**

10. **Über 100 Verwendungen undefinierter Design-Klassen** (Audit 7.13). `accounting.component.html` nutzte durchgängig `text-muted`, `text-accent-emerald`, `bg-surface-2`, `card`, `kpi-value` und weitere – aus einem älteren Design-System, das nie migriert wurde. Sie erzeugten keinerlei Wirkung: Kennzahlen und Karten der Buchhaltungsseite waren schlicht unformatiert. `card`, `kpi-label` und `kpi-value` sind jetzt definiert, die übrigen auf Tokens abgebildet.

11. **11 Stellen mit weißem Text auf zu hellem Farbgrund** (Audit 7.14), teils nur 2,15:1 statt 4,5:1 – in **beiden** Designs, also kein Problem des neuen hellen. Angehoben auf `emerald-700` (5,55:1), `amber-700` (4,99:1) und `rose-600` (4,70:1).

**Korrektur eines eigenen Fehlers:**

12. **Audit-Befund 7.5 („12 Bilder ohne `alt`") war falsch und wurde zurückgezogen.** Mein ursprünglicher Test war ein zeilenbasiertes `grep`; die `<img>`-Tags sind mehrzeilig formatiert, das `alt` steht auf der Folgezeile. Korrekt geprüft: 14 Bilder, 0 ohne `alt`. Hier war nichts zu tun.

**Verifiziert durch:**

- `npx ng build` → erfolgreich; `npx vitest run` → 25 Dateien / 121 Tests grün
- **Rechnerische Kontrastprüfung im Browser** über 11 Seiten (Dashboard, Einkäufe, Inventar, Verkäufe, Buchhaltung, Einstellungen, Analytics, Listings, Fulfillment, Research, Quellen, Deal Calculator): **0 Verstöße** bei den Textfarben im hellen Design
- Weiß-auf-Farbe gesondert geprüft: Sprunglink 6,29:1, Primär-Buttons 6,29:1, alle Badges nach der Korrektur ≥ 4,5:1
- **Sichtprüfung** beider Designs auf Dashboard, Buchhaltung, Inventar und Shop
- Shop bei dunklem Admin-Design geprüft: bleibt hell, Akzente bleiben hell (`rgb(52, 211, 153)`)
- Textmarkierung praktisch getestet: Überschrift lässt sich auswählen, Sidebar bleibt geschützt
- Schriften: `document.fonts` meldet 6 geladene Schnitte, **0 externe Aufrufe** an Google

**Bewusst nicht geändert:** Die Druckkomponenten (Rechnung, Etikett, Lieferschein) bleiben weiß mit schwarzem Text – sie werden auf Papier ausgegeben.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 3: Sicherheit (Anmeldung & Datenbank)

**Art:** Sicherheit, Bugfix, Konfiguration

**Betroffen:**

- `src/app/core/services/auth.service.ts` (neu geschrieben)
- `src/app/core/guards/auth.guard.ts` (neu geschrieben, `guestGuard` ergänzt)
- `src/app/app.routes.ts`, `src/app/features/auth/login/`, `src/app/layout/shell/`
- `src/app/core/services/media.service.ts`, `workspace-member.service.ts`, `workspace.service.ts`
- `src/environments/*`, `angular.json`, `supabase/config.toml`, `public/sw.js`
- `supabase/migrations/20260819120000_security_hardening.sql` (neu)
- `supabase/migrations/20260819130000_grant_api_roles.sql` (neu)
- `supabase/schemas/database.sql` (vervollständigt)

**Was:**

_Anmeldung_

1. **Demo-Modus von Anmeldung getrennt.** `isAuthenticated` bedeutet jetzt ausschliesslich „echte Supabase-Sitzung". Der Demo-Modus ist ein eigener, bewusst zu wählender Zustand (Standard: aus) und wird durch ein Banner in der Shell deutlich gekennzeichnet. Der Guard prüft `canAccessApp`.
2. **Unsicheren Login-Fallback entfernt.** Zuvor wurde bei einer Zeitüberschreitung von 1200 ms **jede** Kombination aus E-Mail und Passwort akzeptiert. Jetzt gibt es keinen Ersatzweg mehr.
3. **`authGuard` an alle geschützten Routen gehängt**, dazu ein `guestGuard`, der Angemeldete von Anmeldung und Registrierung fernhält. Der Guard **wartet** auf `sessionReady` statt 50 ms zu raten – dadurch bleibt man beim Neuladen angemeldet.
4. **`onAuthStateChange` angebunden** – Token-Erneuerung und Abmeldung in anderen Tabs wirken jetzt.
5. **Umgebungsschalter `allowDemoMode`**: in der Entwicklung an, in der Produktion aus. Dazu die fehlenden `fileReplacements` in `angular.json` ergänzt – `environment.development.ts` wurde bisher **nie** verwendet.

_Datenbank_ 6. **Kritische Lücke geschlossen:** Die INSERT-Policy auf `workspace_members` erlaubte `OR user_id = auth.uid()`. Jeder angemeldete Nutzer konnte sich damit in jeden fremden Workspace eintragen. Ersetzt durch eine Prüfung auf Verwalterrolle; neue Workspaces entstehen über die neue Funktion `public.create_workspace()`. 7. **Alle Policies neu geschrieben** nach `CLAUDE.md`: kein `FOR ALL`, getrennte Policies je Operation, immer `TO authenticated`, immer `(select auth.uid())`, fehlende DELETE-Policies ergänzt. 60 Policies über 15 Tabellen. 8. **`set search_path = ''`** in allen `SECURITY DEFINER`-Funktionen. 9. **17 Indizes** auf allen Spalten, die in Policies geprüft werden. 10. **Storage-Bucket abgesichert:** `public = false`, die beiden `anon`-Policies (Hochladen **und Löschen**) entfernt. `MediaService` nutzt jetzt signierte URLs mit Signal-gestütztem Zwischenspeicher, damit Templates weiter synchron binden können. 11. **`supabase/schemas/database.sql` vervollständigt** – enthielt nur Tabellen, keine Sicherheitsregeln. `supabase db diff` hätte vorgeschlagen, alle Policies zu löschen. Jetzt meldet der Befehl „No schema changes found". 12. `config.toml`: `site_url` auf 4200 korrigiert, Passwort-Mindestlänge von 6 auf 10, Weiterleitungs-URLs ergänzt.

_Zwei gravierende Funde, die erst beim Test gegen die laufende Datenbank sichtbar wurden_ 13. **Der Datenbank fehlten sämtliche GRANTs** (Audit 2.11). Jede Abfrage endete mit `42501 permission denied` – für `authenticated`, `anon` **und `service_role`**. Die Datenbank war seit Projektbeginn vollständig unbenutzt; die leeren `catch {}`-Blöcke im Frontend haben das verdeckt. Behoben, inklusive `alter default privileges` für künftige Tabellen. 14. **Der lokale Supabase-Stack lief auf von Windows gesperrten Ports** (Audit 2.12). Hyper-V reserviert auf diesem Rechner 57322–57921; darin lagen fünf der sieben konfigurierten Ports. Zusätzlich Kollision mit zwei anderen Supabase-Projekten. Umgestellt auf 54350–54359.

_Zwei Folgefehler, die dadurch erst auftraten_ 15. **Service Worker blockierte die Datenbank.** Er fing alle GET-Anfragen ab und beantwortete sie mit „503 Offline" – auch Supabase. Vorgezogen aus Phase 7 und neu geschrieben: er fasst jetzt nur noch eigene, statische Dateien an und lässt fremde Herkünfte unberührt. Damit ist auch das Zwischenspeichern von Geschäfts- und Anmeldedaten beendet (Audit 2.7). 16. **Absturz in `workspace-member.service.ts`.** `m.email.toLowerCase()` – die Tabelle `workspace_members` hat gar keine Spalte `email`, das Feld existiert nur im TypeScript-Modell (Audit 3.3). Sobald echte Zeilen kamen, warf das eine Ausnahme mitten in der Änderungserkennung. Vorläufig abgesichert; die saubere Lösung (Verknüpfung mit `profiles`) gehört zur Angleichung von Modell und Schema in Phase 5.

**Verifiziert durch:**

- `npx ng build` → erfolgreich; `npx vitest run` → 25 Dateien / 121 Tests grün
- `npx supabase db reset` → alle vier Migrationen sauber angewendet
- `npx supabase db diff` → **„No schema changes found"**
- **Angriffstests gegen die laufende Datenbank** mit zwei echten Nutzern (Alice, Bob):
  - Bob trägt sich in Alices Workspace ein → `42501 violates row-level security policy` ✅
  - Bob liest Alices Einkäufe → leere Menge ✅
  - Bob schreibt in Alices Workspace → abgewiesen ✅
  - Bob liest Alices Mitgliedschaften → leere Menge ✅
  - Nicht angemeldet liest Einkäufe → `permission denied` ✅
  - Nicht angemeldet lädt in den Bucket hoch → `403 AccessDenied` ✅
  - Nicht angemeldet löscht eine vorhandene Datei → `403 AccessDenied` ✅
  - Öffentlicher Bucket-Abruf → HTTP 400 (nicht mehr öffentlich) ✅
  - Kontrolle: Alice sieht ihre eigenen Daten, angemeldeter Upload funktioniert ✅
- **Anmeldefluss im echten Browser:** `/dashboard` ohne Anmeldung → Umleitung mit `redirectTo`; falsches Passwort → abgewiesen; richtiges Passwort → Dashboard mit **echten Daten aus der Datenbank**; Neuladen bleibt angemeldet; `/auth/login` als Angemeldeter → Umleitung; Abmelden → gesperrt und Token entfernt; Demo-Modus → Banner sichtbar
- Datenbank anschliessend zurückgesetzt, Testnutzer entfernt

**Bewusst offen gelassen (gehört zu Phase 5):**
Die App fragt weiter parallel mit der Mock-Workspace-ID `ws-1` ab, was `400 Bad Request` erzeugt (keine gültige UUID). Die Abfragen mit echter UUID liefern korrekt Daten. Das ist die localStorage/Datenbank-Doppelung aus Audit 3.1 und wird in Phase 5 aufgelöst.

**Auswirkung für dich:** Die Anwendung ist ohne Anmeldung nicht mehr nutzbar. In der Entwicklung steht weiterhin der Demo-Modus zur Verfügung, im Produktions-Build nicht.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 2: Datensicherung

**Art:** Feature & Bugfix

**Betroffen:**

- `src/app/core/models/backup.models.ts` (neu)
- `src/app/core/services/backup.service.ts` (neu)
- `src/app/core/services/backup.service.spec.ts` (neu, 26 Tests)
- `src/app/features/settings/components/backup-panel/` (neu)
- `src/app/features/settings/settings.component.{ts,html}`
- `src/app/layout/header/header.component.{ts,html}`
- `src/app/core/services/export.service.{ts,spec.ts}`

**Was:**

1. **Vollständige Sicherung.** Der neue `BackupService` erfasst **alle** 25 Speicherbereiche mit dem Präfix `flipbase_` – auch Retouren, Rechnungen, Shop-Bestellungen, Artikelkosten, Belege, Bargeldkasse, Offline-Warteschlange und Konfigurationen. Werte werden geparst abgelegt, damit die Datei lesbar bleibt; nicht parsbare Werte (z. B. `flipbase_theme` = `dark`) landen unverändert und werden in `rawKeys` vermerkt, damit das Einspielen zeichengenau bleibt.

2. **Wiederherstellung mit Prüfung und Vorschau.** Vor dem Überschreiben wird die Datei geprüft (Format, Version, keine projektfremden Schlüssel) und der Inhalt angezeigt: Anzahl Einkäufe, Artikel, Verkäufe, Retouren, Rechnungen, Shop-Bestellungen, Datenbereiche, Dateigrösse. Erst danach ist das Einspielen möglich. Der aktuelle Stand wird dabei automatisch als Datei heruntergeladen, bevor er ersetzt wird.

3. **Erinnerung.** Ist die letzte Sicherung älter als 7 Tage oder wurde noch nie gesichert, erscheint ein Hinweis in den Einstellungen und ein Abzeichen im Header, das direkt dorthin führt.

4. **Irreführenden bisherigen Export ersetzt.** Der Knopf „Vollständiges Backup" sicherte tatsächlich nur 4 von 25 Bereichen (Workspace, Einkäufe, Inventar, Verkäufe) – und es gab keinerlei Möglichkeit, ihn wieder einzuspielen. Das erzeugte falsche Sicherheit. `generateJsonBackup` wurde aus dem `ExportService` entfernt; an seiner Stelle steht jetzt ein CSV-Export der Einkäufe, und für die echte Sicherung der neue Bereich.

5. **Kaputten Formularbezug behoben** (siehe Audit 7.11). `settings.component.html` band an `formControlName="bankName"`, das Feld fehlte aber in der `paymentForm`-Gruppe. Die Ausnahme brach bei jedem Rendern die Änderungserkennung ab – sichtbare Folge: leere Sidebar-Navigation, leerer Header und nicht gerenderte `@if`-Blöcke auf der Einstellungsseite. Gefunden beim Testen im echten Browser, nicht durch statische Analyse.

**Entwurfsentscheidungen mit Begründung:**

- **Kein modaler Dialog für die Bestätigung.** Die 22 vorhandenen Overlays im Projekt haben weder `role="dialog"` noch Fokus-Falle (Audit 7.3). Statt einen 23. unzugänglichen Dialog zu bauen, sitzt die Bestätigung als Karte direkt auf der Seite.
- **Vollständiges Ersetzen statt Zusammenführen.** Ohne verlässliche Zeitstempel pro Datensatz liesse sich beim Zusammenführen zweier Bestände nicht entscheiden, welche Fassung gilt. Das Ergebnis wäre stillschweigend falsch. Deshalb: klar angesagtes Ersetzen, mit automatischer Sicherheitskopie vorher.
- **Anmeldezustand wird nicht mitgesichert.** `flipbase_logged_out` bleibt aussen vor, damit eine alte Sicherung nicht den aktuellen Anmeldestatus überschreibt.
- **Speicherzugriff als Parameter.** `StorageLike` erlaubt es, den Dienst in Tests ohne Browser mit einer Attrappe zu betreiben – passend zur bestehenden Konvention, Dienste per `new` zu instanziieren.

**Verifiziert durch:**

- `npx vitest run` → **25 Test-Dateien, 121 Tests bestanden** (vorher 24/96: +26 neue Sicherungstests, −1 Test des entfernten Teil-Exports)
- `npx ng build` → **erfolgreich**
- **Test im echten Browser** (Chrome, `ng serve`): Rundlauf Sicherung → Daten zerstören → Einspielen stellt Einkauf, beide Artikel und den nicht-JSON-Wert `flipbase_theme` zeichengenau wieder her; nach der Sicherung entstandene Reste werden entfernt; fremde Speicherschlüssel bleiben unangetastet
- **Ablehnung geprüft:** fremde JSON-Datei und beschädigtes JSON werden mit verständlicher Meldung abgewiesen
- **Oberfläche geprüft:** Statusbox, Header-Abzeichen, Vorschau mit korrekten Zahlen (1 Einkauf, 2 Artikel), Warnhinweis und beide Schaltflächen erscheinen wie vorgesehen

**Offen aus Phase 2:** nichts.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 1: Build repariert

**Art:** Bugfix & Konfiguration

**Betroffen:**

- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- `.gitattributes` (neu)

**Was:**

1. **Build-Fehler behoben.** Im Template lief `@for (step of ['pending', ...])` über ein Inline-Array von Zeichenketten und griff mit `$any(step)` auf `InboundTrackingService.statusConfig` zu. `$any()` erzeugt genau den `any`-Typ, den der Indexzugriff auf ein `Record<InboundTrackingStatus, …>` dann ablehnt – daher 2 × `TS7053`. Die Stufen liegen jetzt als typisiertes Feld `trackingSteps: readonly InboundTrackingStatus[]` in der Komponente; `$any()` ist entfernt.
2. **Die 50 uncommitteten Änderungen gesichert** – zusammenhängende Arbeiten aus der vorherigen Sitzung mit Google Gemini (InboundTrackingService, CustomCheckbox, CustomSearchInput, `.linear-table`-Styles, überarbeitete Templates), in zwei Commits getrennt nach Code und Doku.
3. **`.gitattributes` angelegt** (`* text=auto eol=lf`) – bewusst als letzter Schritt, damit sich die Zeilenende-Normalisierung nicht mit den inhaltlichen Änderungen vermischt.

**Warum:**
`ng build` brach ab – damit war kein Docker-Image baubar, und jede weitere Arbeit hätte darauf blockiert.

**Verifiziert durch:**

- `npx ng build` → **erfolgreich**, Initial-Bundle 825,88 kB (192,85 kB übertragen)
- `npx vitest run` → **24 Test-Dateien, 96 Tests bestanden**
- `git status` → sauber

**Offen aus Phase 1:** nichts.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Vollständiger Projekt-Audit

**Art:** Analyse & Doku (keine Änderung am Anwendungscode)

**Betroffen:**

- `docs/audit/2026-08-19-projekt-audit.md` (neu)
- `docs/audit/2026-08-19-sanierungsplan.md` (neu)
- `docs/AI-CHANGELOG.md` (neu)

**Was:**
Vollständige Untersuchung des Projekts auf Wunsch von Grischa Tänzer – Codesauberkeit, Fehler, Sicherheit, Datenbank, Docker, UI und Barrierefreiheit. Ergebnis: **56 Befunde** (12 kritisch, 11 schwer, 24 mittel, 9 gering), festgehalten im Audit-Dokument, sowie ein 7-Phasen-Sanierungsplan.

Wichtigste Befunde:

1. `ng build` schlägt aktuell fehl (2 × TS7053 in `purchase-detail.component.html`)
2. Kein Login-Schutz – `authGuard` existiert, ist aber nirgends eingehängt und wäre wirkungslos, weil `isAuthenticated` den Demo-Modus mit einschließt
3. `localStorage` ist die Quelle der Wahrheit, nicht die Datenbank – 20 von 34 Services haben keine Supabase-Anbindung, ~60 % der Anwendung hat keine Tabellen
4. Rechenfehler in Kostenverteilung, DATEV-Export und Steuerberechnung
5. Datenbank: jeder angemeldete Nutzer kann sich in jeden fremden Workspace eintragen; Storage-Bucket öffentlich und anonym beschreib-/löschbar
6. 22 modale Dialoge ohne jede Tastatur- und Screenreader-Unterstützung; `select-none` blockiert das Kopieren in der gesamten App
7. Die Doku beschreibt Stripe, PayPal, DHL und Hermes als „live" – tatsächlich sind sie simuliert

Ausdrücklich positiv: Die Angular-Grundlagen sind sauber – durchgängig Signals, moderne Control-Flow-Syntax, Standalone Components, `input()`/`output()`, kein `ngClass`/`ngStyle`, Lazy Loading für alle Feature-Routes, Ordnerstruktur exakt nach `CLAUDE.md`.

**Warum:**
Das Projekt wurde zuvor mit Google Gemini aufgesetzt. Vor der weiteren Entwicklung sollte der Ist-Zustand unabhängig geprüft werden.

**Verifiziert durch:**

- `npx ng build` → **fehlgeschlagen**, 2 Fehler (TS7053)
- `npx vitest run` → **24 Test-Dateien, 96 Tests bestanden**, 1,58 s
- `npm ls` → Doppelinstallation `lucide-angular@1.0.0` + `@lucide/angular@1.31.0` bestätigt
- Alle weiteren Aussagen einzeln am Quellcode nachgeprüft; jeder Befund im Audit ist mit Datei und Zeile belegt

**Nicht geändert:**
Am Anwendungscode wurde nichts angefasst. Der Sanierungsplan wartet auf Freigabe.
