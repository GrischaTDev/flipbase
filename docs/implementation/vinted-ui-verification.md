# Vinted-Oberfläche: geprüfter Stand vom 26. September 2026

## Nachtrag 28.09.2026: GoLogin-Tarifgrenze

Die bisher allgemeine Fehlermeldung beim Start einer Browsersitzung verdeckte die konkrete Anbieterantwort. Bei der betroffenen neuen Verbindung war noch kein GoLogin-Profil und keine Browsersitzung gespeichert. Zwei lesende Anbieter-API-Aufrufe mit dem produktiven, nur serverseitig gespeicherten Token erhielten HTTP 403 mit dem Hinweis auf das ausgeschöpfte kostenlose API-Anfragelimit. Dadurch blieb die eigentliche Vinted-Anmeldung vor der Übertragung der Zugangsdaten stehen.

Die Änderung zeigt für genau diese Anbieterantwort einen verständlichen Hinweis zum GoLogin-Tarif. Der HTTP-Endpunkt veröffentlicht nur einen festen Fehlercode; unbekannte Anbietertexte und Geheimnisse werden nicht an die Oberfläche durchgereicht. Künstliche Tests prüfen die Anbieterklassifikation, die sichere HTTP-Antwort und die Anzeige vor dem Loginauftrag. 70 Worker-Tests und 33 gezielte Angular-Tests bestanden, ebenso Worker-Typprüfung/-Bau, Angular-Produktionsbau und gezieltes ESLint. Ein erfolgreicher Login kann mit dem derzeitigen Anbieterstatus nicht geprüft werden.

## Aktueller Nachtrag 27.09.2026: zusammenhängende Anmeldung

Branch `juna/vinted-account-connection`, Basis `c46d225` (PR #220 bereits gemergt).
Die Sidebar und Einstellungen heißen „Account-Verwaltung“. Der Vinted-Link bleibt
mit Admin-Badge geschützt. „Account hinzufügen“ bietet Vinted als Plattform und
führt nach dem internen Kontonamen direkt zur zugeordneten Anmeldeseite.

Die Seite hat Felder für Mitgliedsname/E-Mail und Passwort. Nach dem Absenden
werden diese geleert. Die Verbindung wird erst nach dem Identitätsnachweis
bestätigt. Zusätzliche Prüfungen oder ein unbekannter Vinted-Seitenzustand bleiben
im Browserbild bedienbar. Der Login wird niemals automatisch wiederholt.

Geprüft: Kontodialog, direkte Weiterleitung, Passwortübermittlung nur an den
gebundenen Endpunkt, ausstehende Zusatzprüfung, automatische Bestätigung und
leere Eingabefelder danach. Desktop 1440 px und Mobilansicht 390 px; AXE-Prüfung
der Anmeldung ohne Verstöße, kein horizontaler Überlauf. Die Tests verwenden
ausschließlich künstliche Daten und abgefangene Antworten. Keine echte
Vinted-Anmeldung; die private Identitätsroute bleibt live unbestätigt.

Reproduktion: `npm run test:angular -- src/app/features/marketplaces
src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts`
(84 Tests). Bei laufender Vorschau `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4217`
und `npx playwright test --config e2e/support/marketplace-preview.config.ts`.

Abschlussprüfung: alle fünf Playwright-Abläufe bestanden, dazu 65 Worker-Tests,
die eigene Browser-Testseite, 84 Angular-Tests und 14 Navigationstests.
Angular-/Worker-Typprüfung und beide Builds, ESLint/Prettier der geänderten
Dateien sowie Shared-UI-Prüfung bestanden. Keine neue Schemaänderung; die
historischen Datenbanktestzahlen unten wurden in diesem Schritt nicht erneut
als neue Prüfung gezählt. Die unabhängige Codeprüfung fand einen Abbruchfehler;
Korrektur und gezielte Nachprüfung sind im Arbeitsprotokoll dokumentiert.

Die folgenden Abschnitte sind historische Prüfschritte.

## Ergänzung vom 27. September 2026: Konto nach Anmeldung bestätigen

Die bestehende Anmeldeseite bietet jetzt „Anmeldung prüfen und Konto verbinden“.
Sie zeigt den verbundenen Status erst, nachdem der Worker eine Vinted-Kennung
im kontogebundenen Browser gelesen und die Datenbank sie für die aktive
Sitzung bestätigt hat. Bei fehlender Kennung, fremdem Konto oder abgelaufener
Sitzung entsteht kein neuer Profilstand. Nach Erfolg wird der Browser beendet
und die Kontoliste neu geladen.

**Lokal geprüft:** 16 gezielte Angular-Tests, 54 Worker-Tests, 113
Marktplatz-Datenbankprüfungen und Angular-Bau. Die Prüfung verwendete nur
künstliche Konten und Antworten. Der öffentliche Worker war zuvor mit
HTTP 502 nicht erreichbar; ein neuer Produktionscheck und eine echte
Vinted-Anmeldung stehen aus. Die private Vinted-Identitätsroute kann sich
ändern; ihre Antwort wurde bisher nicht live verifiziert. Inserate,
Nachrichten und Verkäufe werden noch nicht importiert.

---

## Ergänzung vom 27. September 2026: Admin-Badge und Kontoeinstieg

Die Sidebar zeigt für den Betreiber am Vinted-Link ein Admin-Badge. Die
Kontoverwaltung unterscheidet jetzt zwischen einem internen Namen und einer
echten Anmeldung. Ein sichtbarer Link je Tabellenzeile führt zur Anmeldung
für genau dieses Konto; eine fremde oder unbekannte Verbindungs-ID erhält
keinen Browserbereich. Bei nicht erreichbarem Worker zeigt die Seite eine
Sperre mit verständlicher Erklärung.

**Lokal geprüft:** Angular-Produktionsbau, gezielte Angular-Komponententests
für Sidebar, Anmeldeweg und Testseite sowie der Playwright-Ablauf mit
künstlichen Konten bei 1440 und 390 Pixeln. Der Playwright-Test bestätigt
Badge, Anmeldelink, Dienstausfall und Kontoverwaltung. Keine echte Vinted-
Anmeldung, kein Datenimport und kein Produktions-Worker wurden geprüft.

**Live-Befund:** `https://app.flipbase.de/marketplace-browser/healthz`
antwortete mit HTTP 502. Die Oberfläche kann deshalb aktuell nur
Verbindungen vorbereiten und gespeicherte Marktplatzdaten anzeigen.

---

## Ergänzung vom 27. September 2026: Admin-Pilot vorbereitet

Die Navigation versteckt „Marktplätze“ und „Marktplatzkonten“ für normale
Nutzer. Beim Abmelden oder Wechsel zu einem anderen Nutzer verschwindet die
Betreibernavigation unmittelbar. Der Route-Guard weist Nichtbetreiber ab;
die Datenbank verweigert auch einem Workspace-Admin ohne
Plattformbetreiberrolle Kontodaten und
Kontoverwaltung. Ein Profil entsteht nur nach erfolgreicher Kontoprüfung
auf dem Worker. Die vorhandene Testseite zeigt im Cloudmodus den festen
Vinted-Start und verbirgt das Eingabefeld als Passwortfeld.

**Lokal ausgeführt:** 48 Worker-Tests und 41 gezielte Angular-Tests bestanden;
drei Marktplatz-Datenbankdateien mit 99 Prüfungen bestätigten auch den
Rollenwiderruf während einer Sitzung. Angular-Typprüfung und Bau sowie
Worker-Typprüfung, Tests und Containerbau waren erfolgreich. Die geänderten
TypeScript-Dateien wurden ohne Lintfehler geprüft. Zusätzlich bestand
`npm run verify` vollständig. Acht gezielte Betreiber-Dienst-Tests bestätigten
nach der letzten UI-Korrektur den sofortigen Entzug der Navigation.

Im ersten PR-Lauf bestanden alle 2163 SQL-Prüfungen. Der zusätzliche
Konkurrenztest brauchte für seinen künstlichen Nutzer noch die neue
Plattformbetreiberrolle. Nach der Korrektur bestand der Test gegen die
isolierte lokale Datenbank: Eine Reservierung blieb aktiv, die parallele
zweite Anfrage erhielt die vorgesehene Sperre.

**Noch offen:** Die produktive Worker- und Proxy-Einrichtung sowie ein
Ende-zu-Ende-Test des Cloudmodus über die Flipbase-Oberfläche. Kein echtes
Vinted-Konto wurde angemeldet. Das Anlegen einer Flipbase-Kontoverbindung
belegt noch keine Vinted-Anmeldung und startet keinen Liveimport.

---

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

## 27.09.2026 – Verständliche Ablehnung und direkter Korrekturversuch

Liveansicht ausschließlich lesend geprüft: Vinted zeigte im laufenden Profil
„Ungültiger Mitgliedsname oder Passwort“. Flipbase zeigte weiter „Anmeldung wird
geprüft“. Keine echten Zugangsdaten ausgelesen, verändert oder erneut gesendet.
Der vorher berichtete Startfehler lässt sich daraus nicht erklären.

Korrektur auf `juna/vinted-login-fix`: Die bekannte sichtbare Vinted-Meldung wird
als fester, kontogebundener Fehlercode ausgegeben. Polling endet, das leere
Flipbase-Formular erscheint wieder. Erst ein neuer Klick sendet neue Eingaben;
das bestehende Profil und die Sitzung bleiben erhalten. Der manuelle Start
steht unter „Andere Anmeldemöglichkeit“; bei aktiver Sitzung entfällt er.
Browserbild und Spezialtasten stehen in einem aufklappbaren Hilfebereich.

Prüfungen:

- 67 Worker-Tests bestanden, einschließlich echtem Sitzungsbroker: Ablehnung
  beendet die Sitzung nicht; fremde Workspace-Anfragen erhalten keinen Fehlercode.
- Zwei Playwright-Tests auf vollständig abgefangenen eigenen HTML-Seiten bestanden.
  Die Fehlerprüfung fragt bei sichtbarer Ablehnung die Identitäts-API nicht ab.
- 83 Angular-Tests bestanden, einschließlich leerer Passwortfelder, ausdrücklichem
  Neuversuch, Konto-/Workspacewechsel, Ablauf und unklarem Browserstopp.
- Fünf vorhandene UI-Abläufe bestanden. Die zwei neuen Desktop-/Mobilabläufe
  scheiterten zunächst am zu strikten Label-Selektor des Tests; nach Verwendung
  des tatsächlichen zugänglichen Feldnamens bestanden beide.
- Fehlerkorrektur bei 1440 und 390 px: kein horizontaler Überlauf, AXE ohne
  Verstöße, nach erneutem ausdrücklichem Login simulierte Verbindung bestätigt.
- Angular-Produktionsbau, Worker-Bau/Typprüfung, ESLint, Prettier und gemeinsame
  UI-Prüfung bestanden. Bestehende CommonJS-Warnung zu pdf-lib/pako im Angular-Bau.

Grenze: Erkannt wird die konkret beobachtete deutsche Vinted-Fehlermeldung auf
dem festen Loginpfad. Andere Anbietertexte oder Herausforderungen bleiben
unbestätigt und in der Browseransicht prüfbar. Erfolgreiche Anmeldung an einem
echten Vinted-Konto, Liveimport und Nachrichtenversand werden nicht behauptet.

## 28.09.2026 – Hintergrundanmeldung ohne Browserbedienung

Basis: `537ce883`, lokaler Zweig `juna/vinted-background-login`.
Das öffentliche Vinted-Formular wurde ohne Anmeldung geprüft. Cookiebutton:
`#onetrust-reject-all-handler`, sichtbarer Text „Notwendige auswählen“.
Der laufende Nutzerlogin wurde nicht verändert; keine Zugangsdaten ausgelesen.

Reproduzierte Fehler: verzögertes Formular ergab sofort `interaction_required`;
fehlende Bildschirmbilder verhinderten die Prüfung; fehlendes Formular führte
zu Polling ohne eindeutigen Abschluss. Die zuerst fehlschlagenden Tests bestehen
nach der Korrektur. Der zusätzliche Test für sofort sichtbare Cookies fand einen
Doppelaufruf des Handlers; nach Umordnung besteht auch dieser Fall.

Ausgeführt:

- `npm run test --prefix services/marketplace-worker`: 67 bestanden.
- `npm run test:browser --prefix services/marketplace-worker`: 5 bestanden.
  Echtes Chromium, vollständig abgefangene eigene HTML-Seiten: sofortige/späte
  Cookiebanner, verzögertes Formular, getrennte Kontokontexte, Rechteablauf vor
  Passwortübermittlung und bekannte Ablehnung. Keine echten Vinted-Anfragen.
- `npm run test:angular -- src/app/features/marketplaces`: 88 bestanden.
  Einschließlich unbekanntem Absendeausgang, endlicher Ergebnisprüfung,
  fehlenden Browserbildern, Konto-/Workspacewechsel, Ablauf, Abbruch und
  Sperre nach unbestätigtem Stopp.
- `npx playwright test --config e2e/support/marketplace-preview.config.ts`:
  7 bestanden, Vorschau auf Port 4217. Desktop 1440 px und Mobil 390 px.
  Das Mock verweigert Bildschirmbilder absichtlich mit HTTP 500; der direkte
  Anmeldeablauf bestätigt die Testidentität ohne einen einzigen Bildabruf.
  Kein manueller Browserbereich. Passwort nicht in localStorage gespeichert.
  AXE der Formular-/Fehleransichten ohne Verstöße, kein horizontaler Überlauf.
- Angular-Produktionsbau und Worker-Bau/Typprüfung bestanden. Bestehende
  CommonJS-Warnung zu pdf-lib/pako. ESLint der geänderten Frontend-/Testdateien,
  Prettier und Shared-UI-Prüfung (112 Dateien, 0 Befunde) bestanden.

Screenshots liegen lokal unter
`C:/Users/Grisc/.codex/visualizations/2026/09/27/01a0e1e5-0ddc-7683-8451-53b001e1e690/vinted-background-login/`.
Der erste neue Browsertest blockierte sich durch eine DOM-Abfrage während
einer abgefangenen Navigation selbst. Die Testbestätigung wird nun aus dem
künstlichen Formularwert gelesen; sie enthält keine echten Kontodaten.

**Abnahmegrenze:** Die Tests belegen Formularbedienung und Flipbase-Ablauf.
Die vorhandene private Identitätsroute und ein erfolgreicher echter Datenabruf
sind nicht verifiziert. Zusätzliche Vinted-Verifizierung wird nicht umgangen;
ein unbekannter Ablauf endet mit einer Fehlermeldung statt einer falschen
Erfolgsmeldung. Vollständiger Liveimport und Nachrichtenversand bleiben offen.
Kein Merge oder Deployment; die neue Ansicht ist noch nicht öffentlich aktiv.
