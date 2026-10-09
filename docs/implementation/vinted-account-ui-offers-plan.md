# Vinted: kompakte Konten und Favoritennachrichten mit Angebot

**Stand:** Umsetzung vom 06.10.2026 im eigenen Zweig vorbereitet. PR und Veröffentlichung stehen noch aus.

**Ziel:** Konten und Seitenkopf kompakter und verständlicher gestalten; Favoritennachrichten auf Wunsch um ein echtes Vinted-Angebot ergänzen.

**Architektur:** Bestehende Konten-, Bereitschafts- und Navigationselemente weiterverwenden. Darstellung und Reparaturaktionen bleiben von der tatsächlichen Profilbindung getrennt. Der Angebotsversand erweitert den vorhandenen Favoritenauftrag um einen getrennt bestätigten Ausführungsschritt.

**Technik:** Angular 22, bestehende Shared Components und Tailwind, Chrome Manifest V3, Supabase. Keine neue Bibliothek oder neue Cloud-Provisionierung.

**Grundlage:** Nutzerauftrag in dieser Sitzung; [Designvorgaben](../design/admin-ui-guidelines.md), [Bleam-Recherche](../research/bleam-vinted-analysis.md), [Favoriten- und Postfachstand](vinted-local-inbox.md), [lokale Wiederaufnahme](vinted-local-session-recovery-design.md).

## Geprüfter Ausgangspunkt

- Die Kontenkarten zeigen Inserat-/Verkaufszahlen; zusätzliche Verbindungsaktionen stehen außerhalb der Shared Card. Das Raster verwendet bis zu vier Spalten.
- Der lokale Bereitschaftsbadge steht außerhalb der Kontenauswahl-Komponente. Die Cloud-Einstellungen hängen Pausen- und Fehlertexte unmittelbar unter den Einstellungsbutton. Dadurch haben die Elemente unterschiedliche Höhen.
- Die Vinted-Navigation ist derzeit flach. Die allgemeine Sidebar besitzt bereits ein geeignetes Muster für nicht anklickbare Abschnittslabels.
- Favoritennachrichten senden derzeit Text. Konfiguration, SQL-Validierung und Erweiterung enthalten noch keinen eigenen Angebotsversand. Dieses Folgepaket ist im bisherigen Umsetzungsprotokoll ausdrücklich offen.
- Bleam dokumentiert Euro-/Prozentrabatte und getrennte Angebotsabsichten. Seine unterschiedlichen UI-/Schnittstellengrenzen sind keine bestätigten Vinted-Grenzen.
- Das Erweiterungsmanifest enthält das Logo für die Vinted-Blase, aber keine allgemeinen Erweiterungsicons und keine Toolbar-Icon-Konfiguration.

## Zielbild und Grenzen

- „Konten“ bleibt der erste Menüpunkt. Darunter folgen ausschließlich die Labels „Konto“ und „Automatisierungen“; keine zusätzlichen anklickbaren Elternseiten.
- „Konto“ enthält Übersicht, Postfach, Inserate, Verkäufe, Verlauf und Profil. „Automatisierungen“ enthält zunächst Favoritennachrichten. Der Rückweg zu Flipbase bleibt erhalten.
- Kontenkarten zeigen Identität, Betriebsart, aktuellen Zustand und kompakte Aktionen innerhalb der Karte. Inserat-/Verkaufszahlen entfallen hier; auf den jeweiligen Unterseiten bleiben sie verfügbar.
- Als neuer Bereitschaftstext wird **„Erweiterung verbunden“** vorgeschlagen. Grün bedeutet weiterhin: aktuelle Freigabe und passendes Vinted-Konto wurden geprüft. Eine lediglich installierte Erweiterung genügt nicht.
- Pause, anderes Browserprofil, abgelaufene Freigabe und Anbieterprüfung bleiben unterscheidbar. „Automatik pausiert“ bekommt einen orangefarbenen Badge; eine bestätigte Sperre einen Fehlerzustand. Details werden außerhalb der Steuerungszeile erklärt.
- Die vorhandene Wiederaufnahme, Kontosortierung, manuellen Reparaturwege und der Schutz vor doppeltem Versand bleiben erhalten.
- Markenfarbe `#fcc601`, vorhandene Buttons, Badges, Card und NoticeBanner verwenden. Keine Produktänderungen außerhalb dieses Auftrags.

## Reihenfolge

Zuerst das UI-Paket aus Schritten 1–4 umsetzen und prüfen. Danach den echten Angebotsversand aus Schritten 5–6 ergänzen. Die beiden Pakete lassen sich unabhängig prüfen und veröffentlichen; ein freigeschalteter Angebots-Schalter darf erst erscheinen, wenn seine Ausführung vollständig vorhanden ist.

### 1. Kontenkarten vereinfachen

**Dateien:** `src/app/features/marketplaces/components/vinted-account-grid/vinted-account-grid.component.ts/.html` und zugehörige Angular-Tests; vorhandener Kontoeinstellungsdialog.

- [x] Inserat-/Verkaufs-Kennzahlen und die außerhalb der Karte liegende Buttonzeile entfernen.
- [x] Profilbild, Kontoname und kompakte Statusinformationen zusammen anordnen. „Lokal“/„Cloud“ kennzeichnet den Ausführungsweg; der Bereitschaftsbadge erhält keine eigene hohe Zeile.
- [x] Bekannte Bewertungen gegebenenfalls als kleine Nebeninformation erhalten; kein hoher Platzhalterblock für unbekannte Bewertungen.
- [x] Breitere Karten mit höchstens drei Spalten auf großen Flächen prüfen; bei engem verfügbaren Platz zwei beziehungsweise eine Spalte verwenden. Entscheidend ist die Inhaltsbreite einschließlich geöffneter Sidebar.
- [x] Pro Zustand genau eine hervorgehobene Aktion anbieten: bei bereitem Konto kompakt synchronisieren, sonst die passende Reparatur. Zusätzliche Aktionen wie Cloudwechsel und erneute Prüfung im vorhandenen Zahnrad-Dialog bündeln.
- [x] Konto weiterhin durch Klick öffnen. Eingebettete Buttons dürfen weder den Kartenlink noch Drag-and-drop auslösen; keine verschachtelten Links.
- [x] Drag-Griff, Tastatur-Reihenfolgeänderung und Löschen über Einstellungen erhalten.

**Abnahme:** Keine Aktionen außerhalb der Card, keine Kennzahlenblöcke, keine überlaufenden Texte; gleiche Grundstruktur für lokale, Cloud- und pausierte Konten.

### 2. Navigation nach Aufgabe gruppieren

**Dateien:** `src/app/core/config/vinted-workspace-navigation.ts`, `src/app/layout/sidebar/sidebar.component.ts/.html` und vorhandene Navigation-/Sidebar-Tests.

- [x] „Konten“ als eigenständigen ersten Link beibehalten.
- [x] Das vorhandene Sidebar-Gruppenmuster für „Konto“ und „Automatisierungen“ wiederverwenden; die Vinted-Konfiguration erhält explizite Gruppen statt Gruppierung nach Arrayposition.
- [x] Favoritennachrichten unter „Automatisierungen“ verschieben. Alle bestehenden Routen und die aktive Kontowahl bleiben unverändert.
- [x] Aktive Seite, mobile Menüschließung, Tastaturbedienung und Rückweg prüfen. Abschnittslabels dürfen keine Links und keine eigenen Routen sein.

### 3. Kopfzeile auf allen Kontoseiten ordnen

**Dateien:** `vinted-workspace.component.ts/.html`, `components/vinted-account-controls/*`, `components/vinted-sync-schedule/*`, `models/vinted-local-readiness.ts` und betroffene Tests innerhalb `src/app/features/marketplaces/`.

- [x] Eine gemeinsame Kontrollzeile bilden: **Statusbadge → Kontenauswahl → Aktualisieren → Einstellungen**. Alle Elemente vertikal mittig ausrichten.
- [x] Den lokalen Status innerhalb dieser Zeile anzeigen, statt ihn neben einer mehrzeiligen Kindkomponente zu platzieren. Den Cloud-Status ebenfalls aus dem Button-/Fehlerblock lösen und in derselben Zeile darstellen.
- [x] „Browserprofil bereit“ durch „Erweiterung verbunden“ ersetzen; Bedeutung und tatsächliche Bereitschaftsprüfung erhalten. Genauere Profilinformationen in verständlichen Details anzeigen.
- [x] „Automatik pausiert“ als kompakten orangefarbenen Badge anzeigen. Anbieterablehnung und Reparaturhinweise in einer separaten NoticeBanner-Zeile unter dem Kopfbereich darstellen; identische Fehler nicht mehrfach ausgeben.
- [x] Sync-Zeitpunkt als ruhige Nebeninformation erhalten. Unterschiedliche Statuslängen dürfen Einstellungsbutton und Auswahl nicht gegeneinander verschieben.
- [x] Auf schmalen Displays kontrolliert umbrechen; bei 320/390 Pixeln keine horizontale Überlagerung erzwingen. Desktop-Kontrollen bleiben in einer Zeile, soweit die verfügbare Breite reicht.

**Abnahme:** Übersicht, Postfach, Inserate, Verkäufe, Verlauf, Profil und Favoritennachrichten mit lokal bereit, anderes Profil, Pause, Cloudpause und Abrufablehnung prüfen.

### 4. Speichern und Erweiterungslogo vereinheitlichen

**Dateien:** `components/vinted-favorite-messages/vinted-favorite-messages.component.ts/.html` und Tests; `tools/flipbase-extension/manifest.json`, `tools/flipbase-extension/images/`; vorhandene Erweiterungs-Paketprüfungen.

- [x] Den bestehenden Shared-Speichern-Button oben rechts in die Favoritennachrichten-Seitenüberschrift setzen. Formularprüfung, Ladezustand, Speichern per Tastatur und Fehlermeldungen erhalten; den doppelten unteren Button entfernen.
- [x] Vorhandenes Flipbase-Logo als PNG in passenden Icongrößen verwenden; allgemeine Manifesticons und Toolbar-Icon deklarieren. Kein neues Popup oder zusätzliche Berechtigungen für diese reine Darstellung.
- [ ] Chrome-Erweiterungsübersicht und angeheftetes Toolbar-Icon nach Veröffentlichung visuell prüfen. Die Vinted-Blase verwendet weiterhin dieselbe Marke.
- [ ] Erweiterung 1.7.0 ist vorbereitet. Erst nach dem freigegebenen Release den bereits registrierten Installationsordner aktualisieren und Chrome neu laden.

**Chrome-Grundlage:** [Manifesticons](https://developer.chrome.com/docs/extensions/reference/manifest/icons) und [Toolbar-Icon](https://developer.chrome.com/docs/extensions/reference/api/action).

### 5. Optionales Angebot konfigurieren und dauerhaft speichern

**Dateien:** `models/vinted-favorite-messages.ts`, `services/vinted-favorite-message-api.service.ts`, `components/vinted-favorite-messages/*`; `supabase/schemas/380_marketplace_favorite_messages.sql`, neue erzeugte Migration, passende Datenbanktests und gegebenenfalls neu erzeugte Supabase-Typen.

- [x] Pro Konto „Angebot mitschicken“ ergänzen, standardmäßig ausgeschaltet. Zunächst eine gemeinsame Angebotsvorgabe für die vorhandenen Text-/Zeitregeln; individuelle Angebote je Regel und Bundles sind nicht Teil dieses Pakets.
- [x] Zwischen **festem Nachlass in Euro** und **Nachlass in Prozent** wählen. Eine optionale Angebotskonfiguration ist die vorgeschlagene Erweiterung des bestehenden Vertrags; Feldnamen und Validierung vor Implementierung gemeinsam festlegen.
- [x] Eine Vorschau mit Ausgangs- und Angebotspreis zeigen: bei 40 € beispielsweise 5 € Nachlass → 35 € oder 10 % → 36 €. Als Beispiel kenntlich machen; tatsächlich versendet wird auf Basis des erneut geprüften aktuellen Artikelpreises.
- [x] Mit ganzen Centbeträgen rechnen, Prozentergebnis auf Cent runden; ungültige, nicht endliche, nicht positive oder nicht günstigere Preise ablehnen. Keine stillschweigende Änderung eines eingegebenen Rabatts.
- [x] Eigene konservative Preisgrenze dokumentieren: mindestens die Hälfte des aktuellen Preises, Prozentnachlass 1–50. Dies ist keine bestätigte offizielle Vinted-Grenze; kein stilles Begrenzen.
- [x] Konfiguration serverseitig genauso streng validieren. Bestehende Einstellungen bleiben ohne Angebot gültig; Migration aktiviert keine Angebote und verändert keine Texte.
- [x] Einstellungen nur mit erwarteter Version speichern; Widerruf, Kontowechsel und fehlende Versandfreigabe bleiben verbindliche Stopps.

### 6. Echtes Angebot senden und Teilergebnisse korrekt behandeln

**Dateien:** `tools/flipbase-extension/vinted-local-favorites.js`, betroffener Nachrichten-/Scheduler-Code; `supabase/functions/_shared/marketplace-local-extension-contracts.ts`, `supabase/functions/marketplace-local-extension/`; Favoriten-Schema, Modelle und Verlauf.

- [x] Zuerst den Angebotsaufruf aus den dokumentierten Bleam-Codebefunden gegen den verfügbaren Vinted-Vertrag abgleichen: Gesprächs-/Transaktionsbezug, Nutzlast, Antwort und Statusnachweis. Kein erfundener Endpunkt und kein echter Versand während der Analyse.
- [x] Nachricht und Angebot als getrennte Schritte des bestehenden Auftrags planen. Für dieses Paket: zuerst Nachricht bestätigen, danach das Angebot senden. Bei unklarem Nachrichtenversand kein weiterer Schreibschritt.
- [x] Identität, Freigabe, aktiven Artikel, aktuelle Währung und Preis unmittelbar vor dem Angebot erneut prüfen. Fehlender Transaktionsbezug, verkaufter Artikel oder unzulässiger Preis ergeben einen sichtbaren Grund statt eines scheinbaren Erfolgs.
- [x] Nachrichtenergebnis, Angebotsabsicht, tatsächlich gewählten Preis und Angebotsergebnis dauerhaft getrennt speichern. Ein Neustart darf eine bereits gesendete Nachricht nicht nochmals versenden.
- [x] Zwischen „Nachricht gesendet, Angebot noch ausstehend“, „beides gesendet“, bestätigtem Angebotsfehler und unklarem Angebotsversand unterscheiden. Unklare Schreibresultate nicht blind erneut senden.
- [x] Alte Erweiterungen dürfen keine neuen Angebotsaufträge übernehmen und dabei als vollständig erledigt melden. Fähigkeit/Version im bestehenden Auftragspfad berücksichtigen; bei fehlender Unterstützung eine Aktualisierung verlangen.
- [x] Bestätigung im Favoritenverlauf und importierten Postfach prüfen. Der eigene POST-Pfad wird im synthetischen Test geprüft; sein echtes Ergebnis auf Vinted bleibt dem ausdrücklich ausgewählten Live-Piloten vorbehalten. Ein rabattierter Betrag im Nachrichtentext genügt nicht.

## Prüfungen und Abschluss

- [x] Gezielte Angular-Tests für Raster, Kopfzeile, Cloudstatus, Sidebar und Favoritenformular sowie die betroffenen Modelltests ausführen.
- [x] UI visuell bei 1440, 1024, 390 und 320 Pixeln prüfen: lange Kontonamen, zehn Konten, Statuswechsel, geöffnete Sidebar, Tastatur und AXE.
- [x] Angebotsberechnung mit 40 € / 5 € / 10 %, Rundung, kleinem Ausgangspreis, ungültigen Eingaben und geändertem Livepreis prüfen.
- [x] Erweiterungs-/Edge-/Datenbanktests für Text ohne Angebot, Teilfehler, Neustart, unklare Antwort, falsches Konto, Widerruf und alte Erweiterung ergänzen.
- [x] Betroffene Dateien formatieren/linten; `npm run typecheck` und `npm run build` ausführen. Für die Angebotsphase die erzeugte Migration anwenden, passende pgTAP-Tests und Schemaabgleich prüfen.
- [x] Vorhandene Prüfwege verwenden: `npm run test:angular -- <betroffene Specs>`, `npm run test:node -- <betroffene Specs>`, `node --test scripts/local-extension-favorites.test.mjs scripts/local-extension-runtime.test.mjs`; Edge-/Datenbankprüfungen nur im isolierten Testsystem.
- [x] Kein echter Favoritenversand und keine Aktivierung vorhandener Kundenregeln in automatisierten Prüfungen. Ein späterer Live-Angebotstest wird mit einem ausdrücklich ausgewählten Testfall durchgeführt.
- [ ] Nach Abschlussfreigabe den vorgesehenen PR-Abschluss durchführen. Veröffentlichung, Migration und Edge-Rollout gehören erst zum freigegebenen Abschluss; Pflichtchecks nicht umgehen.

**Review-Schwerpunkte:** korrekte Statusbedeutung trotz kompakter Darstellung, erreichbare Reparaturaktionen, kein doppelter Text-/Angebotsversand, kompatible Altversionen und nachvollziehbarer Teilerfolg. Das UI-Paket benötigt für sich keine Schemaänderung.

## Umsetzungsbefunde

Abschlussprüfung: 108 Angular-, 30 Modell-, 121 Erweiterungs-, 186 Edge- und
180 Datenbankprüfungen sind bestanden. Dazu kommen 40 Browserfälle einschließlich
AXE, Formatierung, Lint, Typprüfung und Produktionsbau. Die neue Migration wurde
transaktional auf den vorherigen Stand angewandt; Schema, Funktionsrechte und
erzeugte Typen sind abgeglichen. Das unabhängige Review hat keine offenen
wesentlichen Befunde. Erweiterung 1.7.0 ist separat als Testpaket vorbereitet;
die vorhandene Chrome-Installation bleibt bis zum freigegebenen Release unverändert.
Die zusätzlichen 18 bestehenden Kontenabläufe prüfen auch Sortierung,
lokale Einrichtung, Postfachfreigabe und Cloudwechsel. Die feste CI-Testliste
enthält die acht neuen Bildschirm-/Kontenfälle; alte Kartenassertionen prüfen
die neue Betriebsart-Anzeige.

Der Angebotsweg nutzt den dokumentierten POST auf `/api/v2/transactions/{id}/offers`
mit `offer.currency = EUR` und einem Centpreis als Dezimaltext. Gespräch,
Gegenüber und `transaction.item_id` werden wie im Bleam-Statusleser und dem
vorhandenen Flipbase-Postfachleser zugeordnet. Der Text wird zuerst bestätigt;
das Angebot folgt als eigener Claim im nächsten Versanddurchlauf. Ein gespeicherter
Textbeleg wird nach Neustart nur erneut gemeldet, niemals erneut gesendet.

Eine konkrete `offer.id` wird als Angebotsbeleg verlangt. Das vollständige reale
Antwortformat ist ohne Schreibtest nicht bestätigt: Eine anders geformte
erfolgreiche Antwort bleibt ausdrücklich unklar und wird nicht wiederholt.
Bestätigte HTTP-Ablehnungen und die belegte Vinted-Validierungsantwort gelten
als Fehler. Das ist die Grenze des synthetischen Tests, kein belegter Live-Erfolg.

Die Migration `20261006112956_vinted_favorite_message_offers.sql` lässt alte
Ereignisse bei `not_requested`; sie aktiviert keine Angebote. Ein Save während
der Leseprüfung verwirft den ausstehenden Angebotsauftrag. Verspätete Ergebnisse
ohne Schreibversuch bestätigen diesen Abbruch, ohne andere Nachrichten zu blockieren.
Wiederaufnahme nach begonnenem Versand wiederholt ausschließlich den Beleg.

Ältere Erweiterungen übernehmen Angebotsaufträge nicht. Das Formular nennt die
erforderliche Version 1.7.0. Kein echtes Angebot, keine echte Nachricht und kein
Update der Nutzerinstallation wurden in dieser Umsetzung ausgeführt.

## Ergänzungsauftrag vom 09.10.2026: erhaltene Angebote bearbeiten

**Stand:** Nutzerauftrag aufgenommen und bestehenden Code geprüft; noch nicht
implementiert. Favoritennachrichten einschließlich Verzögerung und optionalem
Angebot haben bereits lokale und Cloud-Ausführungswege. Ein bestätigter echter
Cloud-Favoriten-/Angebotstest bleibt separat offen. Diese bestehenden Funktionen
ersetzen keine Reaktion auf ein erhaltenes Käuferangebot.

**Gewünschte Bedienung:** Unter einem aktuellen erhaltenen Angebot „Angebot
annehmen“ über die volle Breite anzeigen; darunter links „Ablehnen“, rechts
„Gegenangebot“. „Gegenangebot“ öffnet eine Preiseingabe mit Vorschau und bewusstem
Absenden. Erledigte oder nicht sicher zugeordnete Angebote erlauben keine Aktion.
Cloud und Extension verwenden dieselbe Darstellung und dieselben Fachregeln.

**Gewünschte Automatik:** Pro Konto getrennt aktivierbar, zunächst ausgeschaltet.
Der Nutzer legt den maximalen Nachlass gegenüber dem aktuellen Artikelpreis fest.
Beispiel: 100 € Artikelpreis, 10 % Nachlass → ab 90 € automatisch annehmen.
Der anschließende Browserrundgang erweitert den Auftrag um konfigurierbare
Gegenangebotsstufen und Ereignisnachrichten; siehe den folgenden Ergänzungsabschnitt.
Favoritennachrichten behalten ihre unabhängigen Regeln und Aktivierung.

**Vor Umsetzung zu belegen:** Die aktuelle Nachrichtendarstellung liefert
Angebotstext/-preislabel, aber keinen vollständigen bestätigten Aktionsvertrag.
Für Annahme und Ablehnung fehlen eigene Ausführungswege. Zuerst echte strukturierte
Angebotskennung, Transaktion, Verkäufer-/Käuferrolle, Status, Artikelpreis,
Angebotspreis und Währung sowie die jeweiligen Anbieteraktionen und Erfolgsbelege
abgleichen. Keine Endpunkte aus Namensähnlichkeit ableiten und keinen Preis aus
übersetztem Anzeigetext als Grundlage einer automatischen Entscheidung verwenden.
Der vorhandene Angebotsversand und seine Kontobindung/Ergebniszustände werden
gezielt erweitert; die Favoritenaktivierung autorisiert keine neuen Verhandlungen.

**Prüfpunkte:** Manuelle und automatische Entscheidungen teilen denselben
kontogebundenen Auftrag. Identische Angebotskennungen nicht mehrfach bearbeiten;
verspätete oder unklare Ergebnisse nicht blind wiederholen. Aktuellen Preis und
Angebotsstatus vor Ausführung erneut bestätigen. Manuelle Bearbeitung während
eines wartenden Automatikauftrags muss den veralteten Auftrag verhindern. Neue
Regeln dürfen keine alten Angebote ungefragt bearbeiten. Für den ersten Umfang
nur eindeutig zugeordnete einzelne eigene Artikel; Bundles oder fehlende Preise
manuell melden. Cloud/Extension, deaktivierte Regeln, genaue Prozentgrenzen,
Centrundung, Preisänderung, Doppelausführung und unbekannter Ausgang testen.

**Konkurrenz:** [Bleam: automatische Verhandlung](https://bleam.app/en/help/assistant-negociation)
dokumentiert Annahme oberhalb einer selbst gesetzten Preisgrenze sowie
Gegenangebote darunter, auch in mehreren Schritten. Das belegt das angebotene
Produktverhalten, nicht Bleams interne technische Implementierung.

## Erweiterter Auftrag nach Browserrundgang: automatische Verhandlung

**Stand:** Am 09.10.2026 im geöffneten Bleam-Dashboard beobachtet und für Flipbase
abgeleitet; keine Produktumsetzung. Die frühere Einmal-Gegenangebotsauswahl ist
mit dem neuen Auftrag überholt. [Beobachtungsprotokoll](../research/bleam-vinted-analysis.md).

**Seite:** Unter „Automatisierungen“ neben „Favoritennachrichten“ den Menüpunkt
„Automatische Verhandlung“ vorsehen. Kontobezogene Regeln, aktivierbare
Verhandlung, Vorschau und bestehender Speichern-Button. Keine aktive UI ohne
vollständige Ausführung. Cloud und Extension verwenden die gleichen Regeln.
Die manuelle Angebotsbedienung bleibt unabhängig von der Automatik verfügbar.

**Verhandlungsregeln:** Maximalen Nachlass in Euro oder Prozent festlegen,
optional nach Artikelpreisbereichen. Der bestätigte aktuelle Artikelpreis ist
die Grundlage; mit ganzen Centbeträgen rechnen. Unter dieser Annahmegrenze
konfigurierbare Gegenangebotsstufen anbieten. Beispiel: 50 € Artikelpreis,
10 € maximaler Nachlass, Stufen 50/80/100 % des Nachlasses → 45/42/40 €.
Die letzte Stufe erreicht die Preisgrenze. Fortschritt pro Konto, Gespräch und
Artikel speichern; die nächste Stufe reagiert auf einen neuen belegten Eingang,
nicht auf einen weiteren Poll oder allein auf den Ablauf eines Zeitintervalls.
Keine stillschweigende Unterschreitung, Zurücksetzung oder zusätzlichen Rabatte.

**Ereignisse und Nachrichten:**

- Eigenes automatisches Annehmen eines Käuferangebots.
- Zwischengegenangebot und endgültiges Angebot.
- Erneuter Verhandlungsversuch nach letztem Angebot oder nach Annahme.
- Käufer nimmt ein von uns gesendetes Angebot an: eigenes Ereignis, dessen
  verlässlicher Nachweis vor Aktivierung zu prüfen ist.
- Bestätigter Kauf/Bestellung, auch ohne vorherige Verhandlung: eigener
  unabhängig aktivierbarer Bereich „Nachrichten nach einem Kauf“. Keine
  Kaufbestätigung allein aus angenommener Preisvereinbarung oder Vorschau.

Pro Ereignis optionale eigene Texte, beginnend mit einem Textfeld. Zwei klar
getrennte Ergänzungen planen: „Alternative Vorlage“ fügt einen auswählbaren Text
hinzu; „Weitere Nachricht“ fügt tatsächlich einen Folgeschritt hinzu. Eine
Vorlagenauswahl einmal speichern, damit Wiederaufnahme dieselbe Nachricht nicht
neu auswählt oder erneut sendet. Eigene Folgevorlagen und Preisplatzhalter
verwenden; keine fremden Beispieltexte übernehmen. Nach gekauftem Artikel keine
weiteren Preisverhandlungen ausführen. Fehlende oder nicht belegte Auslöser
zeigen einen offenen Nachweis und aktivieren keine Senderegel.

**Zeitpunkt und Reihenfolge:** Einstellbare Verzögerung mit Sofort/30 Sekunden/
1/2/5 Minuten und Minuten-/Sekundeneingabe; Folgeschritte mit eigener Wartezeit
nach bestätigtem Vorgänger. Fälligkeit dauerhaft im vorhandenen Auftragsprinzip
speichern, keinen Worker durch Wartepausen blockieren. Für Gegenangebote
„Angebot zuerst“ als vorgeschlagener Standard, Nachricht erst nach bestätigtem
Angebotserfolg. Gewünschte „Nachricht zuerst“-Option ausdrücklich als getrennte
Schritte mit möglichem Teilerfolg behandeln. Annahme- und Kauftexte erst nach
bestätigtem zugehörigem Ereignis. Ausschalten, neue Regeln, Profilwechsel und
manuelle Bearbeitung stornieren unbegonnene veraltete Schritte; ein unbekannter
Schreibausgang wird geprüft und nicht blind wiederholt.

**Umsetzung in überprüfbaren Teilen:**

1. Die strukturierten Angebotsdaten und Annahme-/Ablehnungsaktionen belegen;
   manuelle Chatbuttons samt Gegenangeboteingabe für beide Ausführungswege.
2. Die kontobezogene Einstellungsseite und gemeinsame Preis-/Stufenregeln mit
   Vorschau, Verlauf, pausierter Automatik und gespeichertem Fortschritt.
3. Optionale Ereignisnachrichten mit Alternativen, echten Folgen und Verzögerung;
   bestätigte Kaufnachricht als unabhängiger Auslöser. Vor Aktivierung die
   Eingangs-/Ergebnisbelege je Auslöser prüfen.

**Abnahme:** Gemeinsame Regeltests mit Euro/Prozent, Preisbereichsgrenzen,
Centrundung, Stufenfortschritt und Preisänderung; SQL-Kontobindung und
Doppelausführung; Extension-/Cloud-Adapter mit bestätigtem/abgelehntem/unklarem
Ergebnis; keine Folgemeldung bei ungeklärtem Vorgänger; Neustart und manuelle
Übernahme; mobile/helle/dunkle Oberfläche mit AXE und Produktionsbau. Anschließend
kontrollierte Echtkonto-Abnahme mit ausdrücklich festgelegten Testaktionen.
Die davor geprüften Bot-Icon-/Lesestatusänderungen bleiben ein gesonderter
fertiger Stand; ihre Veröffentlichung ist noch nicht freigegeben.
