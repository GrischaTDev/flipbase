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

**Technischer Abgleich vom 27.09.2026:** Der bisherige lokale Chromium-Test
belegt eine getrennte Flipbase-Sitzung und einen lesenden Seitenaufruf, aber
keine eigenständige, von Vinted so wahrgenommene Geräteidentität. Playwright
kann Cookies und lokale Browserdaten pro dauerhaftem Profil trennen. Daraus
folgen weder eigene Netzadressen noch unterschiedliche, konsistente
Browsermerkmale. GoLogin beschreibt seine Profile dagegen mit getrennten
Sitzungsdaten, Browsermerkmalen und einer Netzadresse über einen Proxy. Das
öffentlich verfügbare GoLogin-Repository enthält ein SDK zum Steuern solcher
Profile; der Orbita-Browser selbst liegt dort nicht als Quellcode vor.
AdsPower und Kameleo beschreiben denselben Grundaufbau. Camoufox zeigt als
offenes Firefox-Projekt, dass Eingriffe in die Browser-Engine technisch möglich
sind, kennzeichnet sich aber selbst als noch nicht stabil für den
Produktivbetrieb.

Für eine Web-App liegt der Browser hinter der Flipbase-Server-API: pro
berechtigtem Konto ein dauerhaftes, sicher zugeordnetes Browserprofil; die
Oberfläche erhält nur die begrenzte Ansicht und Bedienung. Mögliche
Umsetzungen sind ein gewöhnliches Playwright-Profil (Sitzungstrennung), ein
externer Profilanbieter oder eine selbst betriebene Browserumgebung. Die
letzten beiden Wege brauchen eine eigene Anbieter- und Betriebsprüfung. Eine
Prozentzahl für „von Vinted als unabhängig erkannt“ lässt sich aus
Anbieterdokumentation oder öffentlichen Browserprüfseiten nicht ableiten.
Ein echter G1-Test braucht ein ausdrücklich freigegebenes eigenes Konto und
eine vorher geklärte zulässige Nutzung. Der bisherige öffentliche Profilaufruf
leistet das nicht.

Quellen: [Playwright: Browserkontexte](https://playwright.dev/docs/browser-contexts),
[Playwright: persistentes Profil](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context),
[GoLogin: Produktbeschreibung](https://gologin.com/docs/getting-started/introduction/what-is-gologin-and-who-its-for),
[GoLogin: öffentliches SDK](https://github.com/gologinapp/gologin),
[AdsPower: Profile](https://help.adspower.com/docs/creating_browser_profiles),
[Kameleo: Playwright-Anbindung](https://developer.kameleo.io/integrations/playwright/),
[Camoufox: Quellcode und Reifehinweis](https://github.com/daijro/camoufox).

**Vorläufige Architekturentscheidung für 100 Nutzer:** Flipbase behält
Autorisierung, Kontozuordnung, Sitzungssteuerung und Datenhaltung selbst. Für
einen späteren G1-Piloten wird ein verwalteter Profilanbieter bevorzugt;
GoLogin ist wegen des vorhandenen Adapters der erste zu prüfende Kandidat.
Der eigene flüchtige Playwright-Browser bleibt auf öffentliche Lesetests
begrenzt. Eine eigene Browser-Engine mit Merkmalmaskierung ist kein
verantwortbarer erster Produktpfad. Der bestehende GoLogin-Adapter ist noch
kein Nachweis für Anmeldung oder zuverlässigen Betrieb mit vielen Konten.

100 Nutzer mit je zwei bis drei Verbindungen bedeuten 200–300 gespeicherte
Profile, aber die nötige Zahl gleichzeitig laufender Browser hängt von
Bedienung und Abrufintervallen ab. GoLogin nennt für Business 300 Profile und
zwei gleichzeitige Cloud-Sitzungen; Enterprise nennt 1000 Profile und drei.
Ein Produkt mit interaktiver Bedienung und Hintergrundabrufen benötigt daher
eine ausdrücklich bestätigte Kapazitäts- und Kostenvereinbarung. Vor dem
Pilot sind außerdem getrennte Kundenrechte beim Anbieter, Sperrverhalten,
Wiederanlauf, Datenverarbeitung und die zulässige Plattformnutzung zu klären.
Es gibt keine belastbare Prozentzahl für das Ausbleiben einer
Kontoverknüpfung oder Sperre.

Quellen: [GoLogin-Tarife](https://gologin.com/pricing/),
[GoLogin: gleichzeitige Cloud-Sitzungen](https://gologin.com/docs/general/account-and-billing/active-sessions).

**Lokaler Kapazitätsversuch vom 27.09.2026:** Auf einem Windows-Rechner mit
64 GB RAM und 32 logischen Prozessoren wurden 1, 2, 4, 8 und 16 getrennte
Playwright-Chromium-Browser mit einer künstlichen Produktliste und
Bildplatzhaltern geöffnet und je einmal als JPEG aufgenommen. Bei 16 Browsern meldete Windows
für die 64 zugehörigen Prozesse zusammen rund 4,6 GB Working Set und 1,36 GB
private Speicherseiten. Das summierte Working Set kann gemeinsam genutzte
Speicherseiten mehrfach enthalten. Nach dem Schließen waren keine
Testbrowserprozesse mehr übrig. Die Seite nutzte kein Vinted, keine Anmeldung
und keine dauerhaften Profile. Die Messung liefert einen lokalen Größenordnungswert;
sie belegt weder Kapazität für 200–300 gleichzeitig aktive Konten noch Kosten
oder Verknüpfungsrisiken beim Anbieter. Zu diesem Zeitpunkt fehlten
API-Zugang und ein freigegebenes Testprofil; der spätere Anbieter-Test steht
im folgenden Abschnitt.

- [ ] GoLogin-Liveansicht auf einer eigenen Testseite sicher einbetten. Die
      veröffentlichte `remoteOrbitaUrl` ist bereits eine Zugangsberechtigung und
      darf nicht als direkter Link oder `iframe`-Quelle an den Client gehen.
- [ ] Zugriff auf fremde Profile, abgelaufene Tickets und Widerruf mit einem
      echten Anbieterprofil prüfen; dafür sind G0-Freigaben und ein isoliertes
      Testprofil nötig.
- [ ] Kein echter Kontopilot ohne G0/G1-Freigaben.

**GoLogin-Anbieterprobe vom 27.09.2026:** Ein neuer API-Zugang funktionierte.
Zwei eigene Cloudprofile wurden für `example.com` gleichzeitig geöffnet.
Playwright erhielt HTTP 200 und Browserbilder. Der vorhandene
`GoLoginCloudBrowser`-Adapter öffnete und stoppte ein Profil erfolgreich.
Künstliche lokale Browserdaten blieben zwischen den Profilen getrennt und
über einen Stopp mit anschließendem Neustart je Profil erhalten. Alle
Cloud-Sitzungen wurden ausdrücklich mit HTTP 204 gestoppt; beide angelegten
Testprofile wurden mit HTTP 204 gelöscht. Der Anbieter-Test belegt die
technische Nutzbarkeit des Adapters und zwei parallele Cloudprofile, aber
weder die Flipbase-Ende-zu-Ende-Anbindung noch eine Vinted-Anmeldung oder
eine von Vinted bestätigte Trennung als Geräte. Für die nächste Stufe sind
ein freigegebenes eigenes Testkonto, die Zuordnung eines Anbieterprofils zu
genau einem Flipbase-Konto und eine Prüfung von Abbruch, Ablauf und Widerruf
im vollständigen UI-Worker-Ablauf nötig. Für 100 Nutzer bleiben Anbieterlimit,
Kosten und notwendige Parallelität gesondert zu klären.

### AP04d: Admin-Pilot in Flipbase vorbereiten

**Entscheidung vom 27.09.2026:** Der vorhandene Vinted-Bereich bleibt zunächst
ein Pilot nur für Plattformbetreiber, die im ausgewählten Workspace selbst
Adminrechte haben. Ein normaler Workspace-Admin genügt nicht. Dieselbe Regel
gilt für Kontoliste, Kontoverwaltung, gespeicherte Marktplatzdaten und die
Browser-Sitzungsfunktionen; die sichtbare Navigation ist nur eine zusätzliche
Hilfe. Der bestehende Kontodialog bleibt erhalten. Beim ersten Start einer
Cloud-Sitzung legt der Worker ein dauerhaftes Linux-Profil für genau diese
Flipbase-Verbindung an. Der Nutzer meldet sein eigenes Konto im Browserbild
selbst an. Die Anmeldung wird noch nicht automatisch erkannt oder importiert.

- [x] Plattformbetreiberrolle und Workspace-Adminrecht in der bestehenden
      Datenbankberechtigung kombinieren; normalen Administratoren auch direkte
      RPC-/RLS-Zugriffe verwehren.
- [x] Marktplatznavigation und Einstellungen nur für Plattformbetreiber zeigen;
      beide Routen bei direktem Aufruf schützen.
- [x] GoLogin-Profil beim ersten Browserstart serverseitig erzeugen, nur
      serverseitig zuordnen und beim nächsten Start wiederverwenden. Fehler
      und unklare Anbieter-Stopps ohne Geheimnisse behandeln.
- [x] Feste Vinted-Startseite, zeitlich begrenzte Browserbedienung und eine
      Eingabeoberfläche mit geleertem Passwortfeld vorbereiten.
- [x] Worker-Abbild, Compose- und Caddy-Vorlagen sowie manuellen Workflow zur
      Abbildveröffentlichung anlegen.
- [x] Gezielte Worker-, Angular- und Datenbankprüfungen sowie Angular- und
      Worker-Bau ausführen. Die tatsächlich geprüften Zahlen stehen im
      Prüfprotokoll.
- [ ] Nach PR-Freigabe Worker-Geheimnisse und Proxy auf dem Produktionsserver
      einrichten, Abbild veröffentlichen und die Admin-Route prüfen.
- [ ] Erst danach mit einem eigenen, ausdrücklich freigegebenen Vinted-Konto
      Anmeldung, Kontowechsel, Ablauf, Widerruf und Abbruch auf Desktop und
      iPad live prüfen. GoLogin-Profil und Proxy vor weiterer Kontonutzung
      getrennt beurteilen.

**Betriebsgrenze:** Das Web-Deployment aktiviert den Worker nicht automatisch.
Ohne Servereinrichtung meldet die Seite, dass der Browserdienst nicht
verbunden ist. Weder ein Vinted-Login noch eine Datenübernahme oder ein
produktiver Rollout wurde in diesem Arbeitspaket ausgeführt.

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

**Lokaler Testpfad vom 27.09.2026:** Für einen ersten technischen Nachweis
ersetzt ein flüchtiger Playwright-Chromium-Browser den kostenpflichtigen
GoLogin-Zugang. `playwright` 1.63.0 ist als stabile Version geprüft; die
[Playwright-Browser-API](https://playwright.dev/docs/api/class-browsertype)
dokumentiert den lokalen Chromium-Start. Der Worker öffnet nur eine serverseitig
festgelegte öffentliche Vinted-Profiladresse und liefert ein begrenztes Bild.
Fremde Netzwerkziele, Schreibanfragen und WebSockets werden gesperrt. Eingaben
sind in HTTP-API und Angular-Bereich gesperrt. Es gibt keine Anmeldung,
keinen Cookie-Speicher und keinen Liveimport. Die bestehende Datenbanksperre
bleibt auch bei einem unklaren lokalen Prozessabbruch erhalten; eine manuelle
Bereinigung ist dann nötig. Dies ist ein begrenzter AP04b-Nachweis, kein G1.

- [x] Lokalen, lesenden Provider an den vorhandenen Sitzungsbroker anschließen.
- [x] Öffentliche URL begrenzen; Eingaben server- und clientseitig sperren.
- [x] Einen freigegebenen öffentlichen Profilaufruf mit Bild und bestätigtem
      Browser-Stopp ausführen, ohne Anmeldung oder Profilaktion.
- [x] Komplette Testseite mit isolierter lokaler Supabase-Instanz und
      künstlicher eigener Flipbase-Testverbindung auf Desktop und iPad prüfen:
      Start, Browserbild, Kontowechsel, Ablauf, Eingabesperre und Stopp.
      Bestätigte Ablauf-/Abbruchstopps geben die Ansicht für einen neuen Start
      frei; ein unklarer Stopp bleibt gesperrt. Dies prüft den lesenden Modus,
      keine Vinted-Anmeldung oder G1.

**Abgleich vom 27.09.2026:** Die [GoLogin-CDP-Anleitung](https://gologin.com/blog/playwright-automation-tool-in-the-cloud/)
verbindet Playwright direkt mit `wss://cloudbrowser.gologin.com/connect` und
stoppt das Profil anschließend mit `DELETE /browser/{id}/web`. `POST` auf
diesem Pfad erzeugt eine gesonderte Liveansicht-URL; der Worker braucht diese
für CDP nicht. Die URL wird deshalb nicht angefordert. Die [Playwright-Dokumentation](https://playwright.dev/docs/api/class-browsertype)
weist auf eingeschränkte CDP-Unterstützung hin. `playwright` 1.63.0 ist
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

### AP04e: Verständlicher Admin-Einstieg und echte Kontobindung

Der Admin-Bereich zeigt die Betreiberkennzeichnung direkt in der Sidebar.
„Verbindung vorbereiten“ legt ausdrücklich nur einen internen Flipbase-Eintrag
an. Jede Tabellenzeile führt sichtbar zur Anmeldung für genau ihre eigene
Verbindungs-ID. Eine unbekannte oder fremde ID öffnet keinen Browser. Der
Browserdienst zeigt seinen Ausfall auf der Anmeldeseite und lässt dann keinen
Start zu. Diese Oberflächenkorrektur ist lokal umgesetzt und mit künstlichen
Konten geprüft.

Für eine **tatsächliche** Verbindung bleiben folgende, getrennt abzunehmende
Schritte nötig:

1. Den bereits gebauten Worker mit Anbieter-Token und Proxy bewusst auf dem
   Testserver aktivieren und `healthz` prüfen. Ohne diesen Schritt bleibt die
   Browseranmeldung gesperrt; der öffentliche Endpunkt antwortete am 27.09.
   mit HTTP 502.
2. Nur mit einem ausdrücklich freigegebenen eigenen Testkonto anmelden. Nach
   der Browseranmeldung die tatsächliche Vinted-Konto-ID serverseitig ermitteln,
   mit der vorbereiteten Verbindung abgleichen und erst danach den Status
   `connected` setzen. Abbruch, fremder Workspace und abgelaufener Zugriff
   dürfen keinen verbundenen Status erzeugen.
3. Für AP05 den lesenden Datenumfang und die Datenquelle auf dem Testkonto
   nachweisen, bevor ein kontogebundener Import geschrieben wird. Erfolg,
   Pagination, Löschungen und Teilfehler gesondert prüfen. Der jetzige
   Kontodialog und Browserstart importieren noch keine Daten.

**Stand 27.09., Ergänzung zur Kontobestätigung:** Schritt 2 ist mit
künstlichen Identitätsantworten und lokaler Datenbank technisch umgesetzt:
Eine feste Vinted-Seite liefert höchstens ID und Nutzernamen an den Worker;
der Worker schreibt erst nach erneuter Sitzung-, Workspace-, Konto- und
Betreiberprüfung den Status `connected` und eine Profilkopie. Die verwendete
private Vinted-Route `/api/v2/users/current` ist nicht als stabile
Anbieterschnittstelle zugesichert und muss am freigegebenen eigenen Konto
überprüft werden. Schritt 1 und die echte Abnahme von Schritt 2 bleiben offen;
Schritt 3 bleibt vollständig offen. Für normale Vinted-Konten steht die
offizielle Pro-API ohne Pro-Freigabe nicht zur Verfügung. Falls die private
Identitätsroute nicht funktioniert, darf der Status nicht gesetzt werden;
zunächst ist der beobachtete Loginablauf zu prüfen und das Arbeitspaket
anzupassen. Kein stiller Rückfall auf Profil-URL oder manuell eingegebene ID.

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
