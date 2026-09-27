# Vinted-Marktplatzverwaltung: Implementierungsplan

> For agentic workers: Use superpowers:executing-plans for task-by-task execution.
> Haken bezeichnen tatsächlich erledigte Schritte, keine angekündigten Arbeiten.

**Goal:** Kontoverwaltung, Inserate, Nachrichten und Benachrichtigungen in Flipbase integrieren.

**Architecture:** Gemeinsame Datenverträge, native Angular-Oberfläche, autorisierte
Server-API und kontogebundener Worker. GoLogin bleibt ein austauschbarer Kandidat.

**Tech Stack:** Bestehendes Angular-/TypeScript-/Supabase-Projekt. Kein Paketupgrade
und kein neues Monorepo-Framework für diesen ersten Schritt.

**Spec:** [Produkt- und Architekturentscheidungen](../specs/2026-09-26-vinted-marketplace-design.md)

## Global Constraints

Ein Produkt, ein Bestand; Vinted zuerst. Bestehende Routen und Funktionen erhalten.
Keine produktiven Kontozugriffe, Geheimnisse oder Datenbankmigrationen in diesem Start.
Validierung ist keine Autorisierung. Livezugriff bleibt an die Freigaben der Spec gebunden.

## Review Focus

Kontowechsel A → B → A mit verspäteter Antwort; fehlende oder fremde Konto-ID;
mehr als 50 Meldungen; abgelaufene Worker-Sperre bei weiterlaufendem Browser;
Abbruch unmittelbar nach Senden oder Veröffentlichen.

## AP01: Gemeinsame Datenverträge – begonnen

- [x] Branch vom aktuellen `master` erstellen und Projektanweisungen lesen.
- [x] Reine gemeinsame DTOs in `supabase/functions/_shared/marketplace-contracts.ts` anlegen.
- [x] `validateMarketplaceCommand(input: unknown): CommandValidationResult` implementieren.
- [x] `hasVerifiedCapability(states: CapabilityMap, capability: Capability): boolean` ergänzen.
- [x] Typen im neuen Frontend-Feature ausschließlich als Typen wiederverwenden.
- [x] Künstliche Konten A/B mit unterschiedlichen Rechten und Kennzahlen bereitstellen.
- [x] 54 Vertragstests und 5 Fixture-Tests ausführen; isolierte strikte Typprüfung ausführen.
- [ ] Vorhandene Tabellen, RLS, Mitgliedschafts- und Rollenregeln vollständig abgleichen.
- [ ] Projekt-Formatierung, reguläre Edge-Testgruppe und vollständige CI im Vollcheckout prüfen.

Transportgrenzen dieser Arbeitsfassung: interne IDs aus ASCII-Buchstaben/Ziffern
sowie `._:-`, 1–128 Zeichen; Text bis 5000 UTF-16-Codeeinheiten; Seitengröße 1–100;
opaker Cursor bis 2048 Zeichen. Das sind eigene Validierungsgrenzen, keine
behaupteten Vinted-Limits. Nachrichtentext wird unverändert erhalten.

`listings.publish` referenziert ein gespeichertes Listing, `listings.update`
zusätzlich eine Veröffentlichung. Die spätere API muss Eigentümerschaft und
Version prüfen und einen unveränderlichen Inhaltsstand für den Auftrag speichern.
Der hier angelegte Validator führt selbst keine Aktion aus.

## Früher G1-Nachweis

- [ ] GoLogin-Liveansicht auf einer eigenen Testseite sicher einbetten. Die
      veröffentlichte `remoteOrbitaUrl` ist bereits eine Zugangsberechtigung und
      darf nicht als direkter Link oder `iframe`-Quelle an den Client gehen.
- [ ] Zugriff auf fremde Profile, abgelaufene Tickets und Widerruf mit einem
      echten Anbieterprofil prüfen; dafür sind G0-Freigaben und ein isoliertes
      Testprofil nötig.
- [ ] Kein echter Kontopilot ohne G0/G1-Freigaben.

### AP04a: Kontogebundene Testsitzung vor Anbieteranschluss

**Anbieterbefund vom 27.09.2026:** GoLogin dokumentiert Start und Stopp eines
Cloud-Profils (`POST`/`DELETE /browser/{id}/web`). Der Start liefert eine
`remoteOrbitaUrl`, die ohne zusätzliche Anmeldung zugänglich ist. Playwright
verbindet sich per `chromium.connectOverCDP()` mit einem Chromium-Profil; diese
Verbindung hat gegenüber dem Playwright-Protokoll eingeschränkte Unterstützung.
Das Schließen der CDP-Verbindung stoppt das Cloud-Profil nicht zuverlässig.
In den geprüften öffentlichen GoLogin-Unterlagen ist eine auf einen
Flipbase-Nutzer begrenzte Einbettung nicht nachgewiesen. Anbieter-Token, CDP-URL und
`remoteOrbitaUrl` bleiben deshalb ausschließlich auf dem Server.

Quellen: [GoLogin API](https://api.gologin.com/docs),
[GoLogin Playwright-/Cloud-Test](https://gologin.com/blog/playwright-automation-tool-in-the-cloud/),
[Playwright CDP](https://playwright.dev/docs/api/class-browsertype),
[Playwright Authentifizierungszustand](https://playwright.dev/docs/auth).

**Umfang dieses Pakets:** Ein ausschließlich künstlicher Sitzungsversuch auf
`/marketplaces/vinted/session-test`. Eine Datenbanksperre bindet die Sitzung
unveränderlich an Workspace, Verbindung und angemeldeten Benutzer. Jede
Status-/Interaktionsanfrage prüft diese Bindung erneut. Pro Verbindung gibt es
höchstens eine aktive Bedienung. Fristablauf, Pausieren, Widerruf und simulierter
Browserabbruch sperren weitere Aktionen. Keine Browser- oder Vinted-Geheimnisse
werden gespeichert oder an Angular ausgegeben.

- [x] Anbieter-APIs anhand offizieller Unterlagen geprüft und die Trennlinie
      zwischen Test und echtem Browser festgelegt.
- [x] Servergespeicherte Kontosperre, Ablauf, Widerruf und simulierten Abbruch
      mit autorisierten RPCs umgesetzt.
- [x] Eigene Testseite mit vorhandenen Shared Components angebunden.
- [x] Konto-/Workspace-Trennung, abgelaufene Zugriffe, Pause und Abbruch in
      Datenbank-, Angular- und Browserprüfungen nachgewiesen.
- [ ] Anbieterprofil und echte interaktive Einbettung nach G0-Freigaben prüfen.

**Abnahme:** Datenbanktests für zwei Workspaces und zwei Konten, zweiten Benutzer,
abgelaufene Sitzung, parallelen Start, Pause, Widerruf und Browserabbruch;
Angular-Test für verspätete Antworten nach Konto-/Workspacewechsel; Bau und
gezielte Format-/Lintprüfung. Die Testseite bezeichnet das Ergebnis sichtbar als
Simulation. Sie beweist noch keine GoLogin-Einbettung und keinen Vinted-Zugriff.

**Danach:** In einem separaten Worker ein ausdrücklich freigegebenes,
serverseitig zugeordnetes Testprofil öffnen, vor jeder Provideraktion die
Sitzungssperre prüfen, bei Ablauf/Widerruf den Provider ausdrücklich stoppen und
eine authentisierte Bild-/Eingabeweiterleitung ohne Anbieter-URL an den Client
prüfen. Erst dann kann G1 auf Desktop und iPad bewertet werden.

### AP04b: Serverkern für den Anbieteranschluss

**Abgleich vom 27.09.2026:** Die [GoLogin-CDP-Anleitung](https://gologin.com/blog/playwright-automation-tool-in-the-cloud/)
verbindet Playwright direkt mit `wss://cloudbrowser.gologin.com/connect` und
stoppt das Profil anschließend mit `DELETE /browser/{id}/web`. `POST` auf
diesem Pfad erzeugt eine gesonderte Liveansicht-URL; der Worker braucht diese
für CDP nicht. Die URL wird deshalb nicht angefordert. Die [Playwright-Dokumentation](https://playwright.dev/docs/api/class-browsertype)
weist auf eingeschränkte CDP-Unterstützung hin. `playwright-core` 1.63.0 ist
die am 27.09.2026 geprüfte stabile Version und unterstützt Node ab Version 20.

- [x] Separates Node-Paket mit GoLogin-CDP-Verbindung und ausdrücklichem
      Anbieter-Stopp als austauschbaren Adapter anlegen.
- [x] Kontobindung an Workspace, Verbindung und Bediener im Dienstkern prüfen;
      Sperre vor jeder internen Aktion erneut prüfen.
- [x] Ablauf, Widerruf, Unterbrechung und Stoppfehler mit künstlichen
      Anbieter-/Sperrimplementierungen testen.
- [x] Dauerhafte, transaktional reservierte Sperre und serverseitige Zuordnung
      der Profil-ID implementieren; ungewissen Anbieter-Stopp auch nach einem
      Worker-Neustart abgleichen, bevor eine neue Bedienung möglich ist.
- [x] Authentisierte Flipbase-API sowie begrenzte Bild- und Eingabeweiterleitung
      an die vorhandene Testseite anbinden. Anbieter-Token, CDP-URL und
      Liveansicht-URL dürfen in keiner Antwort erscheinen.
- [ ] Mit isoliertem GoLogin-Testprofil und eigener, freigegebener Testseite
      tatsächlich verbinden; fremde Konten, Ablauf, Widerruf und Abbruch auf
      Desktop und iPad prüfen. Vorher G0 klären.

Der Worker besitzt jetzt eine authentisierte HTTP-API und die vorhandene
Testseite einen getrennten Browserbereich. In der lokalen Angular-Entwicklung
wird der API-Pfad nur an einen bewusst gestarteten Worker weitergeleitet; ohne
ihn bleibt die Bedienung gesperrt. Produktive Weiterleitung und Anbieter-Test
stehen aus. Die künstlichen Tests sind kein G1-Nachweis.

### AP04c: Dauerhafte Browsersperre und Profilzuordnung

Der nächste Schritt ergänzt zwei serverseitige Tabellen: eine eindeutige
Zuordnung von Flipbase-Verbindung zu Anbieterprofil und eine zeitlich begrenzte
Sitzung mit unveränderlichem Workspace, Konto und Bediener. Nur der Worker darf
die Profil-ID lesen. Ein Benutzer-RPC reserviert die Sitzung nach erneuter
Admin-/Workspaceprüfung; vor jeder Aktion prüft ein zweiter RPC dieselbe
Bindung. Beide geben ausschließlich öffentliche Sitzungsdaten zurück.

Aktive und zur Beendigung vorgemerkte Sitzungen blockieren einen neuen Start.
Fristablauf, Pause und Widerruf merken den Anbieter-Stopp vor. Erst eine vom
Worker bestätigte Beendigung gibt das Konto frei. Nach einem Neustart liest der
Worker alle ungeklärten Sitzungen und stoppt deren gespeichertes Profil, bevor
er neue Bedienungen zulässt. Ein fehlgeschlagener Anbieter-Stopp bleibt als
ungeklärter Eintrag erhalten. Der Betrieb ist zunächst auf eine Worker-Instanz
beschränkt; Mehrinstanzbetrieb braucht gesonderte Besitz-/Heartbeat-Regeln.

Stand 27.09.: Schema, erzeugte Migration, Typen, Benutzer-RPCs, serverseitige
Profilauflösung aus der reservierten Sitzung und Wiederanlauf-Bereinigung sind
implementiert. Die Datenbankmigration musste um vom Diff-Generator ausgelassene
Rechteentzüge ergänzt werden. Die Bereinigung sperrt neue Starts bei einem
fehlgeschlagenen Anbieter-Stopp. Die Komponenten sind jetzt über eine
authentisierte HTTP-API mit der Testseite verbunden; ein echter Anbieter-Test
bleibt bis zur G0-Freigabe aus.

Abnahme: Datenbanktests für zwei Workspaces, zwei Konten, zweiten Admin,
direkten Tabellenzugriff, Ablauf, Pause und Stoppfehler; zusätzlich einen Test
mit wirklich konkurrierenden Reservierungen. Schema, generierte Migration und
Typen werden zusammen geprüft. Keine Anbieterprofile oder Nutzertoken in
Migration, Seed, Fixture oder Testausgabe.

### AP04d: Begrenzte Browserweiterleitung auf der Testseite

Der Worker erhält eine einzige Serverinstanz mit vier Aktionen: Sitzung öffnen,
ein begrenztes JPEG-Bild lesen, eine einzelne Eingabe senden und Sitzung
beenden. Jede Anfrage trägt ein Supabase-Benutzertoken. Der Server ermittelt
den Bediener beim Auth-Dienst, übernimmt keine Benutzer-ID aus dem Request und
prüft vor jeder Browseraktion die dauerhafte Datenbanksperre. Das Bild bleibt
auf 512 KiB begrenzt. Eingaben sind nur normierte Klickkoordinaten, kurze
Texte und eine feste Liste einzelner Tasten. Es gibt keine freie Navigation,
CDP-Adresse, Anbieter-URL, Profil-ID oder Cookies in Antworten. Unklare
Eingabeergebnisse werden nicht automatisch wiederholt.

Zunächst werden HTTP-Vertrag und Bild-/Eingabeweg mit künstlichem Browser
geprüft: fremder Workspace, fremdes Konto, falscher Bediener, Ablauf, Pause,
Browserabbruch, zu große Bilder und ungültige Eingaben. Danach kann die
vorhandene Angular-Testseite den Weg hinter einer bewusst aktivierten
Serveranbindung anzeigen. Der externe Anbieter bleibt bis G0 unangetastet;
erst ein ausdrücklich freigegebenes isoliertes Profil ermöglicht G1.

**Stand 27.09.:** Die HTTP-Aktionen, der ausdrücklich aktivierte Workerstart,
periodische Fristprüfung, lokale Angular-Weiterleitung und der separate
Browser-Testbereich auf der vorhandenen Testseite sind implementiert. Tests
prüfen unter anderem fremde Konten und Workspaces, zu große Daten, parallele
Aktionen, Token-Erneuerung, Fehler bei Eingaben und Browserunterbrechung.
Produktive Weiterleitung, echter Anbieter-Lauf und Desktop-/iPad-Abnahme
bleiben bis zur G0-Freigabe offen.

## Danach

- [x] AP02: Geschützte Feature-Routen, Shell, Tabs und Kontowechsler an gespeicherte Konten angeschlossen. Künstliche Daten ausschließlich in Tests.
- [x] AP03: Persistente Konten, Veröffentlichungsscope, Rechte und lokale Datenbanktests.
- [ ] AP04: Dauerhafte Aufträge, Worker, Besitzrechte und Session-Broker.
- [ ] AP05: Nachgewiesener Leseumfang, Pagination und vorhandene Bestandszuordnung.
- [ ] AP06: Bewusst gesendete Textantworten, Ergebnisabgleich und Wiederholschutz.
- [ ] AP07: Gemeinsame Ereignisse, persönliche Lesestände, Filter und Push.
- [ ] AP08: Gesicherte Inseratänderungen und Veröffentlichung aus dem vorhandenen Editor.
- [ ] AP09: Kontrollierter Pilot mit einem ausgewählten berechtigt nutzbaren Konto.
- [ ] AP10: Zweites Konto, Ausfalltests, Last, Kosten und Betriebsfreigabe.

Jeder weitere Schritt erhält zunächst fehlschlagende Tests, dann die minimale
Umsetzung und die passenden Regressionstests. Schema und Migration werden gemeinsam
reviewt. Nicht automatisch mergen oder deployen.

[Prüfprotokoll und offene Punkte](../../implementation/vinted-marketplace-progress.md)
