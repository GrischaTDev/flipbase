# Vinted-Oberfläche: geprüfter Stand vom 26. September 2026

## Ergänzung vom 27. September 2026: GoLogin-Anbieterprobe

Zwei eigens angelegte GoLogin-Cloudprofile wurden parallel über Playwright
auf `example.com` geöffnet. Künstliche Browserdaten blieben getrennt und nach
einem Neustart im jeweiligen Profil erhalten. Der vorhandene
`GoLoginCloudBrowser`-Adapter lieferte ein Bild; Cloud-Sitzungen wurden mit
HTTP 204 gestoppt und die beiden Testprofile anschließend gelöscht.

Das war eine Anbieter- und Adapterprüfung. Die Flipbase-Testseite wurde dabei
nicht mit GoLogin durchlaufen; ihre frühere lokale Browserprüfung gilt weiter.
Vinted-Anmeldung, echte Kontotrennung bei Vinted und Geräteerkennung sind
weiter offen.

---

## Ergänzung vom 27. September 2026: lokaler Kapazitätsversuch

Mit einer künstlichen Produktliste wurden bis zu 16 lokale Chromium-Browser
parallel geöffnet und als Bild gelesen. Alle Browser stoppten ohne
verbleibenden Testprozess. Bei 16 Browsern wurden etwa 4,6 GB Working Set
gemessen. Dies ist kein UI-, Vinted- oder GoLogin-Nachweis; ein
Anbieterzugang war nicht hinterlegt.

---

## Ergänzung vom 27. September 2026: Grenze des Browsernachweises

Die Anbieterrecherche bestätigt: Der lokale, flüchtige Playwright-Test prüft
Kontobindung, Seitenaufruf und Browser-Stopp. Er prüft weder dauerhafte
Vinted-Anmeldung noch getrennte, für Vinted sichtbare Geräteidentitäten.
Es wurde kein echter Kontotest ergänzt. Die technischen Alternativen und
offenen Anbieterfragen stehen im Implementierungsplan.

---

## Ergänzung vom 27. September 2026: lokaler End-to-End-Test

Die vorhandene Testseite lief mit einer echten, isolierten lokalen
Supabase-Anmeldung, zwei künstlichen Flipbase-Konten und dem Playwright-Worker.
Desktop (1280 × 900) und iPad-Größe (820 × 1180) zeigten das lesende
Browserbild. Andere Konto-/Workspace-IDs erhielten 409, ein Eingabeversuch 403.

Beim Kontowechsel verschwand das Bild und die alte Sitzung wurde serverseitig
geschlossen. Nach künstlich abgelaufenem Zugriff zeigte ein
weiteres Browserbild zunächst einen Fehler: Das alte Bild blieb stehen. Nach
der Korrektur wird es freigegeben und ausgeblendet. Ein zweiter Befund betraf
den gesperrten Neustart trotz bestätigtem Stopp. Der Worker meldet diese Fälle
jetzt mit 410; die Ansicht gibt danach auch den Start wieder frei. Bei
unklarem Stopp bleibt die Sperre erhalten. Ein echter Ablauf-Durchlauf und
dreizehn gezielte Angular-Tests bestätigten das Verhalten.

Der Test nutzt nur ein öffentliches fremdes Profil als lesendes Ziel und
künstliche Flipbase-Konten. Er belegt keine interaktive Vinted-Anmeldung und
keinen Inhalt des gezeigten Bildes. G1 bleibt offen.

---

## Ergänzung vom 27. September 2026: lesender lokaler Browser

Die bestehende Testseite erkennt nun am Worker-Status den lesenden lokalen
Modus. Sie zeigt dann nur das Browserbild sowie Aktualisierung und Stopp.
Klick-, Text- und Tasteneingaben fehlen in dieser Ansicht und werden zusätzlich
von der HTTP-API mit 403 abgewiesen. Ein direkter Store-Aufruf wird ebenfalls
ignoriert. Der Zielaufruf ist serverseitig festgelegt und keine Kontofunktion.

Neun gezielte Angular-Tests, App-Typprüfung und Angular-Produktionsbau
bestanden. Der Browser-Provider wurde mit einer künstlichen Seite und einmalig
mit der freigegebenen öffentlichen Profiladresse geprüft. Die komplette
Flipbase-Testseite mit echter lokaler Supabase-Anmeldung wurde noch nicht
ausgeführt; ein Desktop-/iPad-Nachweis und G1 bleiben offen.

---

## Ergänzung vom 27. September 2026: Browser-Testbereich mit künstlichen Antworten

Auf der bestehenden Seite `/marketplaces/vinted/session-test` gibt es jetzt
zusätzlich zur unveränderten Sitzungssimulation einen Browser-Testbereich.
Er prüft, ob der lokal bewusst gestartete Worker erreichbar ist. Nur dann
werden Start, Bild, einzelne Klicks, Texte, Tasten und Stopp angeboten. Beim
Konto- oder Workspacewechsel verschwindet das vorherige Bild sofort und der
Worker erhält einen Stoppversuch. Nach unklarer Eingabe wird nichts automatisch
wiederholt. Bilder werden nur als kurzlebige Browser-Objekt-URLs gehalten.

Der lokale Angular-Proxy leitet den API-Pfad an `127.0.0.1:4179` weiter.
Es gibt keine produktive Weiterleitung und keinen gestarteten echten Worker.
Die UI-Prüfung verwendete ausschließlich künstliche Antworten: 10 gezielte
Angular-Tests einschließlich AXE-Strukturprüfung des angezeigten Bildbereichs,
TypeScript-Prüfung und Produktionsbau waren erfolgreich. Der tatsächliche
Anbieter-Lauf auf Desktop und iPad bleibt offen und benötigt zuerst G0.

---

## Ergänzung vom 27. September 2026: dauerhafte Sitzung ohne UI-Anbindung

Die kontogebundene Live-Sperre und der Wiederanlauf-Abgleich sind serverseitig
vorbereitet. Die vorhandene Sitzungstestseite wurde in diesem Schritt nicht
verändert. Sie nutzt weiterhin die künstlichen Test-RPCs und belegt keine
GoLogin- oder Vinted-Anmeldung. Ein echter UI-Nachweis folgt erst nach der
authentisierten Browserweiterleitung und der Freigabe eines isolierten
Testprofils.

---

## Ergänzung vom 27. September 2026: Serverkern ohne Oberflächenänderung

Der begonnene GoLogin-/Playwright-Dienstkern ist noch nicht mit der Testseite
verbunden. Die Seite zeigt weiterhin ausschließlich die künstliche Sitzung;
ein erfolgreicher Test dort belegt weiterhin keinen Anbieterzugriff.

---

## Ergänzung vom 27. September 2026: eigene Sitzungstestseite

Auf dem bestehenden Branch ist `/marketplaces/vinted/session-test` als
kontogebundene Simulation hinzugekommen. Die Seite verwendet die vorhandenen
Karten, Buttons, Badges und Hinweise. Start, Statusprüfung, Testaktion,
simulierter Abbruch und Widerruf laufen über neue autorisierte Datenbank-RPCs.
Ein Konto- oder Workspacewechsel verbirgt den vorherigen Sitzungszustand sofort.

Geprüft wurden 38 gezielte Angular-Tests und drei Chromium-Abläufe. Der neue
Ablauf wechselte bei 390 px von Konto A zu B, bestätigte die getrennten
Sitzungsstände und sperrte Aktionen nach einem simulierten Browserabbruch.
Der AXE-Lauf der Testseite fand keine Verstöße; horizontaler Überlauf trat
nicht auf. TypeScript und Produktionsbau bestanden ebenfalls. Der Test verwendet
ausnahmslos künstliche Serverantworten und stellt keine Vinted-Anmeldung dar.

---

Geprüfter Quellcode: `de2bfb82eda69448ab8ae9a711588f39f8f0aca6`.
Branch: `juna/vinted-marketplace-foundation`.
GitHub-Lauf: `36257352391`, Job `108446552896`, erfolgreich abgeschlossen.

## Umsetzung

`/marketplaces/vinted/overview` öffnet den nativen Bereich mit Kontowechsler,
Übersicht, Inseraten, Nachrichten, Verkäufen, Profil und eigener Aktivitätsseite.
`/settings/marketplaces` verwendet die vorhandenen RPCs zum Anlegen, Umbenennen
und Pausieren/Fortsetzen von Kontoverbindungen.

Serverantworten werden auf Kontozuordnung und Datenform geprüft. Verspätete
Antworten nach Benutzer-, Workspace-, Konto- oder Gesprächswechsel überschreiben
nicht die aktuelle Ansicht. Fehlende Kennzahlen bleiben von gemessenen Nullen
unterscheidbar. Künstliche Konten sind ausschließlich in Tests enthalten.

## Prüfungen

- 59 gemeinsame Vertragstests bestanden.
- 32 Tests für Antwortprüfung, Navigation und Übersetzungen bestanden.
- 57 Angular-Tests für Komponenten, Kontozustand, API, Guard und Navigation bestanden.
- TypeScript-Prüfung und Angular-Produktionsbau bestanden.
- Prettier, ESLint der geänderten Dateien und Shared-UI-Prüfung bestanden.
- Beide Chromium-Abläufe bei 1440 × 1000 und 390 × 1000 bestanden.

Browserablauf: Konto wechseln, Profil und Inserate öffnen, Nachricht lesen,
Kontoeinstellungen öffnen, Verbindung anlegen, umbenennen, pausieren und fortsetzen.
Geprüft wurden auch JavaScript-Fehler, Workspace-Zuordnung der Schreibanfragen,
Seitenüberlauf und ein AXE-Check der Kontoeinstellungen.

Die erste Sichtprüfung zeigte eine abgeschnittene Kontenüberschrift auf Mobilgeräten.
Ein zusätzlicher Angular-Test schlug zuerst fehl und bestand nach der Korrektur.
Die Aktionen liegen nun unter dem Beschreibungstext; der Browsertest prüft
zusätzlich die vollständige Breite der Überschrift. Screenshots der korrigierten
Ansicht liegen im Artefakt `marketplace-browser-de2bfb82eda69448ab8ae9a711588f39f8f0aca6`.

Die Browsertests verwenden den echten Produktionsbau mit künstlicher Sitzung und
abgefangenen RPC-Antworten. Sie prüfen Bedienung und API-Verdrahtung, keinen
Vinted-Livezugriff. Die SQL-Seite wurde im vorherigen Datenbanklauf geprüft;
ein kombinierter Browserlauf gegen eine echte Datenbank wird nicht behauptet.
Die vollständige PR-Prüfkette bleibt vor einem Merge erforderlich.

## Ausführung und Bereitstellung

Die lokale Browsernavigation war durch eine Umgebungsrichtlinie blockiert und
der lokale Vollbau überschritt die Speichergrenze. Deshalb erfolgten vollständiger
Bau und Browserprüfung auf dem isolierten GitHub-Runner, ohne diese Grenzen zu ändern.
Der anfängliche Transfer-Job konnte nach erfolgreichen Prüfungen keinen Git-Baum
schreiben (HTTP 403). Die geprüften Blobs wurden über die autorisierte Verbindung
übernommen. Temporäre Transferdateien und Transfer-Workflow sind entfernt.

Keine neue Datenbankmigration in diesem UI-Schritt, kein Merge, kein Deployment
und kein Zugriff auf echte Vinted-Konten. Die laufende Flipbase-Installation
zeigt die neue Oberfläche erst nach einer gesonderten Veröffentlichung.

Die Ansichten lesen gespeicherte Marktplatzdaten. Browseranmeldung, Liveimport,
Nachrichtenversand und Push-Zustellung benötigen weiterhin die Sitzungstechnik.
Eine vorbereitete Verbindung stellt keine erfolgreiche Vinted-Anmeldung dar.

Reproduzieren: Anwendung auf `http://127.0.0.1:4200` starten und
`npx playwright test --config e2e/support/marketplace-preview.config.ts` ausführen.
