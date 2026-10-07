# 🤖 KI-Änderungsprotokoll

## 2026-10-07 - Juna - Cloud-Gespräche beim Öffnen aktuell abrufen

**Auftrag:** Den bislang nur lokal vorhandenen Gesprächsabruf an den eigenen
Cloud-Browser anschließen und den Prüfzeitpunkt nachvollziehbar anzeigen.

**Befund:** Die Gesprächsansicht lädt bei Cloud-Konten nur gespeicherte Nachrichten.
Der direkte Anbieterabruf ist auf `executionMode = local` begrenzt; deshalb fehlt
die aktuelle Gesprächsbestätigung. Der automatische Cloud-Kontoabruf ist auf dem
Server um 20:56 und 21:11 UTC erfolgreich, die Nachrichtenquelle bleibt teilweise
gelesen. Eine Kontosynchronisation bestätigt nicht sämtliche Gesprächsdetails.

**Umsetzung:** Beim Öffnen eines Cloud-Gesprächs liest der vorhandene Browserdienst
das ausdrücklich ausgewählte Gespräch. Die RLS-geschützte Eintragszuordnung,
angemeldete Kontoidentität und aktive Browserreservierung werden geprüft.
Der bestehende Kontoimport übernimmt Nachrichten und Detailprüfzeitpunkt gemeinsam;
andere ungelesene Gespräche werden nicht geöffnet. Vorhandene Versionen erhalten
die unveränderten Detailprüfzeitpunkte anderer Gespräche. Die Ansicht übernimmt
die aktualisierten Daten ohne Konto- oder Gesprächswechsel. Veraltete Auswahlen
übernehmen keine verspätete Bestätigung; Fehler lassen gespeicherte Nachrichten
sichtbar. „Synchronisiert“ bleibt an den tatsächlich übernommenen Prüfzeitpunkt
gebunden. Cloud-Schreibaktionen werden nicht freigeschaltet.

**Prüfstand:** Regressionstests zeigen vor der Umsetzung die fehlende Detailprüfung
und anschließend neue Nachrichten und bestätigten Prüfzeitpunkt. 187 betroffene
Angular-Tests bestehen. Die Worker-Suite besteht mit 347 erfolgreichen Tests und
sieben unveränderten Auslassungen. Typprüfung und Produktionsbau für Anwendung
und Worker, gezieltes ESLint und Formatierung bestehen. Der Anwendungsbau meldet
weiterhin die bekannte CommonJS-Warnung für `pako`. Noch kein Deployment und kein
echter Vinted-Detailabruf mit dieser Änderung.

**CI-Nachprüfung am 08.10.:** Der Browser-Oberflächentest verwendet bislang eine
ungültige Gesprächs-ID und bildet den neuen Cloud-Abruf nicht ab. Dadurch erscheint
korrekt der Fehler mit Wiederholknopf. Die künstliche Testantwort erhält eine UUID,
den bestätigten Abruf und den gemeinsam übernommenen Detailprüfzeitpunkt. Der Test
prüft jetzt zusätzlich die Kontozuordnung des Abrufs und "Synchronisiert". Die
bestehende Prüfung gegen Bedienelemente in Nachrichten bleibt unverändert.
Alle sechs lokalen Browserprüfungen mit künstlichen Antworten bestehen bei
1440, 390 und 320 Pixeln im hellen und dunklen Design einschließlich AXE-Prüfungen.
Die vollständige CI-Nachprüfung auf diesem korrigierten Stand steht noch aus.

## 2026-10-07 - Juna - Cloud-Browserdienst wiederherstellen und Wiederanlauf absichern

**Auftrag:** Die Meldungen zum nicht erreichbaren Browserdienst und wartenden
Cloud-Abruf für Maike Vintage untersuchen und beheben.

**Befund:** Der Worker endet am 07.10.2026 um 19:11:21 UTC mit Exitcode 1,
ohne OOM-Abbruch. Seine Neustartregel ist `no`; der öffentliche Endpunkt liefert
HTTP 502. Davor sind automatische Abrufe um 18:40 und 18:56 UTC erfolgreich.
Der fehlgeschlagene Abruf um 19:11 UTC endet in der Browserphase. Die Protokolle
benennen den genauen Auslöser des Prozessendes nicht. Maike bleibt verbunden,
der 15-Minuten-Zeitplan bleibt aktiviert und wartet wegen `network` bis
19:41:21 UTC. Speicher, Festplatte und Firewallprüfung sind unauffällig.

**Betrieb:** Nach Bestätigung, dass keine offenen Aufträge, Browsersitzungen oder
Kontobrowsercontainer bestehen, wird ausschließlich der vorhandene Worker
erneut gestartet. Öffentliche Gesundheitsprüfung und Workerstatus sind danach
erfolgreich. Profil, Proxy und Zeitplan bleiben erhalten; Schreibaktionen sind
weiterhin deaktiviert. Dieser Neustart belegt noch keinen anschließenden Abruf.

**Umsetzung:** Die Compose-Vorlage erhält ausschließlich für den Worker
`restart: unless-stopped`. Die bestehende Berechtigungsprüfung und Recovery
bleiben Voraussetzung jedes Neustarts. Runtime-Abbrüche melden eine feste,
typisierte Fehlerkategorie, damit fehlgeschlagene Reservierung, Auftrag und
Lebenszeichen unterschieden werden können. Private Fehlertexte werden nicht
weitergegeben. Die Serverkonfiguration wird erst nach PR-Freigabe angepasst.

**Prüfung:** 51 gezielte Worker-Tests für Runtime, Browser-Recovery und
Sitzungsreservierung sowie Worker-Typprüfung und Bau bestehen. Ergänzte
Regressionstests prüfen alle sieben Abbruchkategorien und die einmalige
Sperrung weiterer Aufträge. Formatierung, gezieltes ESLint und Compose-Prüfung
bestehen. Die Compose-Prüfung bestätigt den Worker-Wiederanlauf, die erhaltene
Broker-Startregel und deaktivierte Schreibaktionen. Der öffentliche Dienst ist
bei der abschließenden Prüfung gesund; ein Abruf nach der Wiederherstellung
ist noch nicht nachgewiesen.

## 2026-10-07 - Juna - Alten Abruffehler aus der Vinted-Anmeldung entfernen

**Auftrag:** Prüfen, warum trotz angemeldetem Cloud-Konto nach dem Verbinden ein
Profilabruf-Fehler angezeigt wird.

**Befund:** Der Server hat Maikes Kontobestätigung am 07.10.2026 um 17:09:24 UTC
angenommen. Die beiden manuellen Profilabrufe davor (17:07:56 und 17:08:19 UTC)
scheiterten mit `forbidden`, entsprechend HTTP 403 beim Lesen von
`/api/v2/users/current`. Der Anmeldedialog zeigte deren gespeicherten
`mutationError` weiter an. Eine fehlgeschlagene Anmeldung folgt daraus nicht.
Die genaue Ursache der HTTP-403-Ablehnung bleibt offen. Der bestehende Zeitplan
ist weiterhin mit `needs_login` deaktiviert; diese Analyse aktiviert ihn nicht.

**Umsetzung:** Beim tatsächlichen Start eines neuen Browser-Anmeldeversuchs
wird der alte Kontofehler über die vorhandene Methode `clearMutationError`
zurückgesetzt. Neue Fehler dieses Anmeldeversuchs bleiben sichtbar. Keine
Änderung an Worker, Browserprofil, Proxy, Datenbank oder Sitzungsdaten.

**Prüfung:** Die beiden Regressionstests scheitern vorher am gespeicherten
Abruffehler. Nach der Korrektur bestehen 120 Angular-Tests für Browser-Store,
Anmeldedialog, Vinted-Arbeitsbereich und Marktplatz-Testseite. Die Service-Ersatzobjekte
auf der Testseite berücksichtigen ebenfalls das Zurücksetzen alter Meldungen.
Formatierung, gezieltes ESLint und der
Angular-Produktionsbau sind erfolgreich. Die Live-Kontobestätigung und vorherigen
403-Abrufe wurden nur über vorhandene Servermetadaten und Protokolle geprüft.
Ein erfolgreicher neuer Cloud-Abruf ist damit noch nicht nachgewiesen.

## 2026-10-07 - Juna - Meldungen des Sicherheits-Scans prüfen und korrigieren

**Auftrag:** Alle 19 Meldungen des vorhandenen Scans gegen den aktuellen
Repositorystand prüfen, bestätigte Fehler beheben und relevante Abläufe testen.

**Umsetzung:** 17 Meldungen erhalten gezielte Korrekturen: getrennte Registry-
Berechtigungen für PRs und Veröffentlichungen, Sniper-Deployment über den
gebauten Digest, ausdrückliche Verbindungserlaubnis im Erweiterungsfenster,
begrenzte Beta-Anfragen und Vinted-Antworten, Merkzettel-Limits, abgesicherte
Passwortänderungen, Adminrechte für Webhook-Ziele, Fremdschlüssel innerhalb
desselben Arbeitsbereichs, Bereinigung globaler Finanz-Caches, begrenzte
Kontoauszugs- und Bildimporte, stabile Kategorieprüfung, frühzeitige Entfernung
des Beta-Tokens, neutrale Beta-Antworten, begrenztes Retry-After und reservierte
Discord-Bindung vor der externen Rollenvergabe.

Die unabhängige Prüfung findet zusätzliche Wege in diesen Grenzen. Die
Korrekturen verhindern dauerhaft privilegierte Recovery-Sitzungen bei neuen
Beta-Abschlüssen, beenden verwendete Einladungs-/Recovery-Sitzungen nach dem
Passwortsetzen, entkoppeln SMTP vom öffentlichen Antwortpfad, speichern den
größten Kategorieumfang über Neustarts und prüfen Fotoarray-Längen vor Zod-
Kopien. Bildzuschnitte behalten die tatsächliche Browserorientierung. Zwei
generierte Migrationen begleiten die Schemaänderungen; API-Typen stammen aus
der isolierten Datenbank. Der bestehende Test für beschädigte Einkaufsdaten
legt seine absichtlich ungültige Zeile nur im vorhandenen Replikations-Fixture
an; die produktive Fremdschlüsselprüfung bleibt aktiv.

**Offen:** Zwei Meldungen zur vollständigen Übernahme des zentralen Chromium-
Workers benötigen eine gemeinsame Trennung von Browserarbeit und Verwaltung.
Für den vorhandenen kleinen Server ist eine Variante im bereits gestarteten
Browsercontainer vorbereitet: unveränderte Speichergrenzen, ein gleichzeitiger
Cloud-Abruf und die bestehende Warteschlange. Keine Worker pro Nutzer. Dieser
Umbau einschließlich GoLogin und Hostregeln ist noch nicht umgesetzt.

**Prüfung:** Beide Migrationen lassen sich mit der vollständigen Historie und
synthetischen Daten anwenden. 3.343 SQL-Prüfungen und 25 Sniper-Integrationsprüfungen
bestehen. Parallele Datenbankverbindungen können weder Merkzettel-Limits noch
die eindeutige Discord-Bindung umgehen. Direkte GoTrue-API-Prüfungen bestätigen
den Passwortschutz einschließlich erneuerter Sitzungen; Einladung und Reset
bleiben möglich. Der zuvor speicherintensive Katalogtrigger mit 1,5 Millionen
Vorschaubildern wird bei 110 MiB gemessenem Prozessmaximum abgewiesen. Caddy-
Konfiguration und Actionlint bestehen. Format, Lint, Typen, Workflow-Prüfungen,
Suite-Audit, 1.760 Node-, 306 DOM-, 210 Edge- und 39 Landing-Prüfungen sowie
der Produktionsbau bestehen. Der Gesamtbefehl scheitert zunächst an einem
unveränderten Deal-Monitor-Test mit fünf Sekunden Zeitlimit. Der Einzeltest
und anschließend alle 1.944 Angular-Prüfungen bestehen mit vier gleichzeitigen
Testprozessen; das Zeitlimit bleibt unverändert. Sieben Deployskript-Prüfungen
bestehen zusätzlich unter Linux ohne die Windows-bedingten Auslassungen.

**Einführung:** Noch kein Push, Merge oder produktiver Eingriff. Das aktualisierte
rootgeschützte Deployskript, die GoTrue-Einstellung und die neue Erweiterung
müssen gemeinsam mit der Anwendung eingeführt werden. Früher ausgegebene
Beta-Recovery-Sitzungen müssen vor der Freigabe widerrufen werden.

**Fortsetzung nach Freigabe:** Der Nutzer gibt PR, Pflichtprüfungen und Merge frei.
Der aktuelle master mit den unabhängig veröffentlichten Browseränderungen wird
übernommen. Botprofil-Vorbereitung, manuelle Prüfpause und optionale Wiederholungen
bleiben erhalten; Antwortgrößen und Retry-After bleiben auch in diesen Wegen
begrenzt. Die neuen Fremdschlüssel treffen produktiv auf keine ungültigen
arbeitsbereichsübergreifenden Beziehungen. Servervorbereitung und Veröffentlichung
werden vor dem Merge geprüft.

Das rootgeschützte Deployskript und das Auth-Overlay sind nach Sicherung auf dem
Server vorbereitet. Direkte API-Kontrollen mit einem anschließend entfernten
Testkonto liefern 400 ohne bisheriges Passwort, 400 bei falschem Passwort und
200 bei korrektem Passwort. Zwei alte Beta-OTP-Sitzungen werden über den nativen
Logout widerrufen; normale Passwortsitzungen bleiben erhalten. Der produktive
Auth-Dienst kennzeichnet bestätigte Reset-Links als `otp`; die Passwortseite
berücksichtigt diese verifizierte Sitzungsart, mit eigener Angular-Regression.

Der PR-Browserlauf zeigt eine kurzzeitig noch nicht angepasste Breite im
Auswahlmenü. Die Layoutprüfung wartet nun auf die geforderte Breite statt nur
auf Sichtbarkeit; ihre Grenze bleibt unverändert. Der Beta-Lebenszyklustest
zeigt bei fehlgeschlagenem Funktionsaufruf zusätzlich dessen öffentliche
Fehlerantwort, damit vor einem Merge die tatsächliche Ursache sichtbar ist.

## 2026-10-07 - Juna - Fehler beim erneuten Cloud-Seitenaufruf sichtbar machen

**Auftrag:** Den freigegebenen Cloud-Abruf-Fix veröffentlichen und mehrere
reguläre automatische Abrufe mit Maike Vintage prüfen.

**Produktiver Stand:** PR #332 ist mit grünen Pflichtprüfungen als v0.308.1
veröffentlicht. Ausschließlich das Worker-Image wurde ausgetauscht; Browserdienst,
Profil, Proxybindung und Berechtigungsversion 22 bleiben erhalten. Drei
kontrollierte Leseproben und ein vollständiger manueller Flipbase-Abruf laufen
durch. Automatische Abrufe um 13:02 und 13:17 UTC sind erfolgreich und beenden
den alten Wartestatus. Um 13:32 UTC scheitert der Profilschritt erneut mit
`browser_context`; der aktivierte Zeitplan wartet regulär bis 14:02 UTC.

**Eingrenzung:** Das neue Fehlerereignis enthält keine Browserkategorie.
Der entsprechende Fehlerpfad verwirft die Ausnahme beim erneuten Seitenaufruf
nach einer initialen 401-Antwort. Welche konkrete Navigationsausnahme im
Produktivbetrieb auftrat, ist deshalb weiterhin nicht bewiesen. Sechs weitere
kontrollierte Starts liefern jeweils 200 und reproduzieren diesen Ausfall nicht.
Die bisherigen erfolgreichen Abrufe belegen daher keine abgeschlossene Korrektur.

**Änderung:** Auch dieser Seitenaufruf erhält jetzt eine feste Fehlerkategorie.
Unterschieden werden unterbrochene oder abgebrochene Navigation, Zeitüberschreitung,
Netzwerk, geschlossener Browser, Skriptfehler und unbekannte Fehler. Die bestehende
Ausgabe bleibt auf acht Kategorien begrenzt und verwirft beliebige Fremdwerte.
Rohfehler, URLs, Anbieterantworten und Zugangsdaten werden nicht gespeichert.
Es kommen keine Wiederholungen oder sonstigen Änderungen am Abrufverhalten hinzu.

**Prüfung:** Neue Unit- und echte Chromium-Regressionen scheitern vor der
Ergänzung und bestehen danach. 41 gezielte Tests sind erfolgreich, einschließlich
sechs Chromium-Tests. Zusätzlich bestehen 339 Worker-Tests bei sieben bestehenden
übersprungenen Prüfungen, Typprüfung, Worker-Bau, Formatierung und gezieltes Lint.
Veröffentlichung dieser Diagnose-Ergänzung und Bestätigung der konkreten
produktiven Navigationsausnahme stehen noch aus.

**Fortsetzung nach Freigabe:** Der Nutzer gibt den zusätzlichen PR und dessen
Veröffentlichung frei. Weitere automatische Abrufe um 14:02 und 14:18 UTC sind
erfolgreich. Um 14:33 UTC scheitert die Identitätsbestätigung mit `unauthorized`;
der Zeitplan ist jetzt wegen `needs_login` angehalten und hat Berechtigungsversion 23. Die Veröffentlichung aktiviert diesen Zeitplan nicht eigenmächtig.
Der aktuelle `origin/master` mit den unabhängig veröffentlichten Botänderungen
wird übernommen; ausschließlich dieses Protokoll kollidiert. Alle Einträge beider
Sitzungen bleiben erhalten, persönliches Cloudprofil und Botprofil bleiben getrennt.

## 2026-10-07 - Juna - Botprofil ohne passenden Host-Benutzer anlegen

**Auftrag und Befund:** Den freigegebenen Vinted-Browserrelease nach dem
erfolgreichen Merge von PR #333 fertigstellen. Der erste Produktionslauf stoppt
vor dem Austausch der Anwendung: `install (uutils coreutils) 0.8.0` lehnt
`-o 1000 -g 1000` ab, weil kein entsprechender Host-Benutzer vorhanden ist.
Die bestehende Anwendung und der bisherige Bot laufen weiter.

**Korrektur:** Das Deployskript legt das private Verzeichnis mit Modus `0700`
an und setzt anschließend den numerischen Eigentümer per `chown 1000:1000`.
Die Prüfung bestehender Profile und das Anhalten bei Fehlern bleiben erhalten.
Es wird kein Host-Benutzer angelegt. Der neue Zweig basiert ausschließlich auf
dem aktuellen `origin/master`; der bereits gemergte Featurezweig ist gelöscht.

**Prüfung:** Die Linux-Deploymentfixture simuliert fehlende Host-Benutzer und
scheitert zunächst mit derselben Meldung. Nach der Korrektur bestehen alle acht
Deploytests ohne Netzwerk, Formatierung, Lint und Git-Diff. Eine isolierte leere
Teststruktur auf dem echten Server bestätigt `700 1000:1000` mit dessen
Installationswerkzeug; sie wird danach entfernt. Das leere eigene Botprofil wird
als freigegebene Servervorbereitung mit denselben Rechten angelegt. Der bereits
vollständig geprüfte Release kann damit wiederholt werden; die dauerhafte
Skriptkorrektur wird über einen eigenen PR geprüft und veröffentlicht.

## 2026-10-07 - Juna - Manuellen Browserzugriff für den Artikelbot umsetzen

**Freigabe:** Der Nutzer bestätigt Entwurf, Umsetzungsplan und die Umsetzung in
dieser Sitzung mit einer unabhängigen Gesamtprüfung. Die ausdrückliche Ausnahme
für den Node-Bot gilt weiterhin. Nach den erfolgreichen lokalen Prüfungen
bestätigt der Nutzer die PR-Erstellung, den Merge nach erfolgreichen
Pflichtprüfungen sowie die anschließende Servervorbereitung und Veröffentlichung.

**Änderung:** Eigener nativer Chrome mit persistentem Botprofil. Automatische
Dokumentabrufe führen keine Seitenskripte aus. Bestätigte Prüfseiten sperren alle
gemeinsamen Botabrufe dauerhaft; reguläre Zeitlimits bleiben erhalten. Betreiber
öffnen im Botbetrieb eine exklusive, zeitlich begrenzte Sitzung mit Browserbild,
nativer Eingabe und manueller Wiederprüfung. Anmeldung und Betreiberrolle werden
bei jeder API-Aktion geprüft. Erst der revisionsgesichert angenommene Katalog
eines weiterhin aktiven Filters gibt den Bot frei. Persönliche Kontoprofile und
Datenbankschema bleiben unverändert.

**Prüfung:** 299 Botprüfungen, elf gezielte Angular-Prüfungen, Typprüfung und
Produktionsbau erfolgreich. Der echte Admin-Browsertest bestätigt Tastatur,
Fokus, Fehlerpause und AXE. Die isolierte lokale Chrome-Prüfung bestätigt aktive
Namespace-/Seccomp-Sandbox, private CDP-Adresse, native Eingabe, Bildabruf,
unterdrückte automatische Seitenskripte und Cookies nach regulärem Neustart.
Sie findet zunächst eine zurückbleibende Profilsperre; reguläres Browserende vor
Prozessbeendigung behebt sie. Alle acht Deploytests laufen in Linux erfolgreich,
einschließlich Laufzeitdateien vor Botstart und Abbruch bei fehlendem Auth-Key.
Shared-UI-Prüfung und Suitezuordnung bestehen.

**Unabhängige Gesamtprüfung:** Vier funktionale Fehler werden lesend reproduziert
und anschließend jeweils mit fehlschlagendem Regressionstest behoben. Die
gemeinsame Zugriffssperre gilt jetzt auch bei Origin-, Query- oder Probe-
Speicherfehlern; fehlgeschlagene dauerhafte Speicherung wird ohne weitere Abrufe
wiederholt. Eine hängende Navigation wird sofort abgebrochen. Manueller Zugriff
teilt den tatsächlichen letzten Abrufzeitpunkt mit Kategorien und anderen
Filtern. Schließen während der Verifikation entwertet die Lease sofort und
verwirft verspätete Ergebnisse im Dialog. Die letzte Prüfung besteht erneut:
299 Botprüfungen, elf Angular-Prüfungen, drei Admin-Browsertests, 227 Workflow-
Prüfungen (fünf Plattformausnahmen; die acht Deploytests laufen separat vollständig
unter Linux), Typen, Lint, Bau und Sandbox-Image. Caddyvalidierung und
Formatter bestehen. Die Auswahlprüfung enthält den neuen PR-Browsertest.
Der Container erhält 90 Sekunden zum regulären Beenden, damit laufende Abrufe
das saubere Schließen des Chrome-Profils nicht verhindern.

**Integration:** Der aktuelle `origin/master` (`41f3174e`) wird übernommen.
Der einzige Konflikt betrifft dieses Protokoll; beide Sitzungseinträge bleiben
erhalten. Anschließend bestehen erneut alle 299 Botprüfungen sowie 337
Workerprüfungen bei sieben bestehenden Ausnahmen, Worker-Typprüfung und -Bau.

**PR und Servervorbereitung:** PR #333 ist erstellt. Vor der Veröffentlichung
werden Deployskript und Botkonfiguration auf dem Server unter einem privaten
Betreiberbackup gesichert. Der Dateivergleich enthält ausschließlich die
geprüfte Browservorbereitung. Das geprüfte Deployskript und der bestehende
öffentliche Auth-Key sind installiert; der produktive Bot bleibt bis zum
erfolgreichen Merge auf der bisherigen Fassung.

**Linux-CI-Korrektur:** Der erste Botlauf wird durch ein Signal beendet. Ein
isolierter Linux-Test reproduziert den Abbruch im Prozess-Test: künstliche
`ChildProcess`-Objekte rufen die echte Betriebssystem-Signalmethode auf. Die
Tests ersetzen diese Methode jetzt durch eine Attrappe und prüfen weiterhin
`SIGTERM`, anschließend `SIGKILL` und die gesperrte Wiederverwendung bei nicht
bestätigtem Ende. Alle 299 Botprüfungen bestehen danach auch im Linux-Container
ohne Netz; der gezielte Windows-Test, Typprüfung, Lint und Formatierung bestehen.
Die übrigen Prüfungen des ersten PR-Laufs einschließlich Browserprüfung sind
erfolgreich. Die Pflichtprüfungen werden für den korrigierten Stand erneut ausgeführt.

**Releasevertrag:** Webimage enthält die passende Bot-Compose-/Seccomp-Konfiguration.
Der Betreiber muss das geprüfte Deployskript und den öffentlichen Auth-Key vor
der ersten Veröffentlichung bereitstellen. Keine produktive Browserfreigabe und
keine wiederhergestellte Liveverbindung behauptet. Die unabhängige Gesamtprüfung
ist mit den geprüften Korrekturen abgeschlossen; die PR-Freigabe liegt vor.

## 2026-10-07 - Juna - Eigene Browsersitzung für den Artikelbot entwerfen

**Freigabe:** Der Nutzer erlaubt ausdrücklich Änderungen am serverseitigen
Node-Bot als Ausnahme zur allgemeinen Frontend-Grenze. Die vorgeschlagene
eigene Botsitzung mit manueller Prüfung wird als konkreter Entwurf ausgearbeitet.

**Entwurf:** Persistentes eigenes Chrome-Profil, dauerhafte gemeinsame Pause
bei bestätigter Prüfseite und exklusiver manueller Zugriff im Adminbereich.
Wiederaufnahme erst nach erfolgreich geparstem und revisionsgesichert
angenommenem Katalog. Die heutige Behandlung alter `blocked`-Zustände würde
sonst neue Proben starten; der neue Grund `interaction_required` muss deshalb
gezielt dauerhaft respektiert werden. Kategorieabrufe und manuelle Bedienung
teilen die Abrufsperre. Betreiberrechte werden bei jedem Browser-API-Aufruf
serverseitig geprüft. Persönliche Kontositzungen bleiben getrennt.

**Stand:** Der Nutzer hat den schriftlichen Entwurf ausdrücklich freigegeben.
Der konkrete Umsetzungsplan liegt unter
`docs/superpowers/plans/2026-10-07-vinted-bot-browser.md`: sechs Aufgaben mit
Schnittstellen, Regressionstests, Authentifizierung, UI und Releasevertrag.
Die Prüfung konkretisiert im Entwurf, dass ein `Retry-After` den frühesten
manuellen Abruf bestimmt, die dauerhafte Sperre aber nicht automatisch aufhebt.
Plan und Schnittstellen sind intern gegen den Entwurf geprüft; Planfreigabe
und Ausführungswahl stehen aus. Keine Produktcode-, Schema-, Paket- oder
Releaseänderungen und keine weiteren produktiven Vinted-Anfragen. Formatierung
und Git-Diff bestehen; Anwendungstests sind noch nicht sinnvoll.

## 2026-10-07 - Juna - Erneute Ablehnungen und regulären Chrome-Vergleich prüfen

**Auftrag:** Nach dem fehlgeschlagenen ersten langsameren Abrufversuch die
Reparatur weiter untersuchen. Der Nutzer bestätigt den zentralen Artikelbot
im Adminbereich, nicht die persönlichen Kontoverbindungen.

**Befund:** Auch die automatischen Proben um 12:59:50 und 13:04:51 Uhr scheitern
mit HTTP 403 und erkannter Cloudflare-Prüfseite. Die aktuellen Suchbedingungen
erzeugen weiterhin denselben Kategorie-/Markenabruf; die Ablehnung geschieht
vor Parser und Titelprüfung. Die passive Socketbeobachtung erfasst die kurze
Vinted-Verbindung nicht und beweist deshalb deren tatsächliche IP-Familie nicht.

**Browservergleich:** „Nike Neu“ wird kurz pausiert, damit keine reguläre Probe
parallel läuft. Nach Ende der bereits gespeicherten Zugriffspause erhält genau
ein Abruf derselben Katalogadresse in Google Chrome 155.0.8059.39 um 13:09:56 Uhr
ebenfalls HTTP 403 mit `cf-mitigated: challenge`. Die Prüfseite wird vor
Darstellung und Ausführung beendet; keine Challenge-Lösung wird versucht.
Ein frischer Browser erhält damit ebenfalls eine Prüfseite. Das ist kein Test
einer legitimen manuellen Freigabe und beweist keine dauerhafte IP-Sperre.

**Betrieb:** Vorhandenes geprüftes Chrome-Abbild, aktivierte Sandbox, isolierter
Container ohne Produktionsvolumes oder Kontodaten, dieselbe Serveranbindung,
keine Proxies oder veränderte Browseridentität. Testcontainer anschließend
automatisch entfernt und seine Abwesenheit geprüft. Nach mindestens 60 Sekunden
Abstand wird ausschließlich der eigene pausierte Auftrag per Revisionsprüfung
wieder aktiviert; 60 Sekunden Takt und Suchbedingungen bleiben erhalten. Um
13:12:31 Uhr ist Nike aktiv, Adidas/Ralph Lauren bleiben deaktiviert. Die
reguläre Probe um 13:11:24 Uhr ist erneut abgewiesen; der Zugang ist nicht repariert.

**Nächster Schritt und Grenze:** Die offiziellen Cloudflare-Verträge bestätigen
die Grenze reiner HTTP-Clients und nicht unterstützte automatische Challenge-
Löser. Die dokumentierte Vinted-Pro-API ist kein geprüfter Ersatz für die
allgemeine Markensuche. Ein Browserwechsel allein ist ebenfalls keine belegte
Reparatur. Ein geregelter Zugriffspfad mit expliziter Freigabe muss festgelegt
werden. Wegen der aktuellen globalen Backend-Grenze ist eine ausdrückliche
Ausnahme für Änderungen an `services/sniper` angefragt und noch offen. Der
nummerierte Auftrag mit Befunden, Grenzen und Abnahme liegt unter
`C:\Users\gt\Desktop\Backend Issues\vinted-access-analysis\01-vinted-article-bot-challenge-recovery.md`.
Keine Anwendungscode-, Schema-, Paket- oder Releaseänderung ausgeführt.

## 2026-10-07 - Juna - Langsameren Abruf des zentralen Artikelbots produktiv testen

**Freigabe:** Der Nutzer bestätigt mit „los“ den vorgeschlagenen Versuch mit
längeren Abrufabständen für den zentralen Marken-/Artikelbot im Adminbereich.

**Vorprüfung:** Vor der Änderung ist die automatische Probe um 12:41:21 Uhr
bereits erfolgreich. Seitdem liefern die regulären Abrufe wieder Artikel.
Diese Erholung geschieht beim bisherigen Zehn-Sekunden-Solltakt und darf nicht
der späteren Änderung zugeschrieben werden.

**Änderung:** Am 7. Oktober um 12:53:52 Uhr wird ausschließlich der aktive
Suchauftrag „Nike Neu“ von zehn auf 60 Sekunden gestellt. Eine kurze Transaktion
prüft und sperrt den erwarteten Auftrag und bricht bei einer abweichenden
Einstellung oder weiteren aktiven Aufträgen ab. Ein Vergleich der vollständigen
Zeile erlaubt nur das Intervall, den Änderungsstempel und die vom vorhandenen
Trigger erhöhte Formularrevision. Suchbedingungen, Aktivierung, Cursor und
Fehlerzustand bleiben erhalten. Der Container wird nicht neu gestartet;
Zugriffspausen werden nicht zurückgesetzt. Kein Schema- oder Produktcodeumbau.

**Prüfung:** Die Transaktion ist bestätigt; der gespeicherte Solltakt beträgt
60.000 Millisekunden. Der erste nachfolgende automatische Abruf um 12:54:48 Uhr
scheitert erneut mit HTTP 403 und `challengeDetected=true`, etwa 65 Sekunden
nach dem letzten erfolgreichen Abruf. Die gemeinsame Pause und die einzelne
nächste Wiederprüfung ab 12:59:47 Uhr sind korrekt gespeichert. Um 12:55:21 Uhr
stehen weiterhin 60 Sekunden, ein Folgefehler und keine seit der Änderung neu
entdeckten Artikel in der Datenbank. Die Intervalländerung verhindert diese
nächste Ablehnung nicht. Damit ist weder eine Lösung noch ein Ausschluss des
Abrufrhythmus als Mitursache bewiesen; eine schon bestehende Anbieterbewertung
kann fortwirken. Für weitere Beobachtung bleibt die freigegebene Einstellung
bei 60 Sekunden. Keine zusätzlichen Vinted-Anfragen oder produktiven Änderungen.
Nur Betriebswerte und Logs gelesen; Formatierung und Git-Diff des Protokolls
geprüft. Keine Anwendungstests oder Builds für diese reine Betriebseinstellung.

## 2026-10-07 - Juna - Wiederkehrende Zugriffssperren des zentralen Vinted-Artikelbots untersuchen

**Auftrag:** Die häufige Meldung „Zugriff abgewiesen“ seit dem letzten Update
im administrativen Bereich des zentralen Marken-/Artikelbots untersuchen.

**Befund:** Lesende Server- und Datenbankprüfung um 12:31 Uhr deutscher Zeit.
Der Container `flipbase-sniper` läuft mit `sha-da3069f`, Hostnetzwerk und ohne
Neustarts seit 11:56 Uhr. Bereits sein erster Durchlauf übernimmt eine
gespeicherte Zugriffspause. Alle sieben protokollierten Abrufe von 12:00 bis
12:31 Uhr scheitern mit HTTP 403 und `challengeDetected=true` in der
Anfragephase. Die Cloudflare-Prüfseite ist damit anhand des vom Sammler
ausgewerteten Antwortheaders erkannt; ihr Auslöser bleibt unbewiesen.

Nur „Nike Neu“ ist aktiv: Kategorie 2050, Marke 53, Sollintervall zehn Sekunden.
Adidas und Ralph Lauren sind deaktiviert. Der letzte erfolgreiche Abruf und
Artikel-Erstfund stammen vom 7. Oktober um 11:30:24 Uhr; im letzten
Stundenfenster wurden keine neuen Artikel gespeichert. Der Dienst hält die
gemeinsame Pause ein und führt etwa alle fünf Minuten eine einzelne Probe aus.
Das konfigurierte Minutenbudget von 30 ist eine Obergrenze, keine gemessene
Anfragerate. Ein hoher Anfragetakt oder eine konkrete IP-Sperre ist als Ursache
nicht nachgewiesen.

**Updateabgleich:** Zwischen dem lokal vorgefundenen Stand `b0cdf268` und dem
produktiven `da3069f1` sowie seit dem Suchfeed-Stand `c40f9f42` gibt es keine
Änderungen an Botquellcode, Bot-Lockfile oder Bot-Compose. Die vorherige Änderung
vom 6. Oktober ergänzt die Suchfilterverarbeitung; Anfrageabstand, Fehlerpolitik
und Netzwerkpräferenz bleiben im geprüften Vergleich unverändert. Der heutige
Neustart kann deshalb nicht als Beginn dieser Zugriffspause gelten. Eine
Regression durch die früheren Suchfilteränderungen ist dadurch nicht vollständig
ausgeschlossen. Der Audit vom 1. Oktober dokumentiert bereits denselben
Fehlertyp, beweist aber keine identische Ursache für den aktuellen Vorfall.

**Prüfung und Grenze:** Dockerstatus und gefilterte Botlogs gelesen, produktive
SQL-Abfragen ausschließlich in `begin read only` mit anschließendem Rollback,
Git-Unterschiede geprüft und den offiziellen Cloudflare-Vertrag zu
`cf-mitigated: challenge` abgeglichen. Keine zusätzlichen Vinted-Anfragen,
keine Kontoaktionen, keine produktiven Änderungen und kein Anbieterzugriff
umgangen. Kein bestätigter Codefehler und keine Korrektur behauptet. Nur dieser
Sitzungseintrag wird im eigenen Analysezweig ergänzt; keine Anwendungstests
oder Builds für die reine Diagnose ausgeführt.

## 2026-10-07 - Juna - Unterbrochene Cloud-Leseanfragen begrenzt wiederholen

**Auftrag:** Sporadische Browserfehler beim automatischen Abruf von Maike
Vintage untersuchen, die Ursache eingrenzen und die regelmäßige Aktualisierung
gezielt absichern.

**Produktive Diagnose:** Nach dem Bewertungsupdate folgen erfolgreiche
automatische Abrufe um 11:00 und 11:15 UTC; um 11:31 scheitert der Profilschritt
mit `browser_context`. Der reguläre Folgeversuch um 12:01 UTC läuft erfolgreich
und beendet den Wartestatus. Beim kontrollierten Starttest sind zusätzliche
Navigationen innerhalb derselben Vinted-Seite sichtbar. Die produktive
Fehlerkategorie verliert bisher die konkrete Ausnahme; eine abschließende
Zuordnung dieses sporadischen Fehlers bleibt deshalb offen.

**Reproduktion und Korrektur:** Zwei echte Chromium-Tests zeigen den Ausfall
beim Dokumentwechsel während Profil- und Postfachanfragen. Ein zerstörter
Ausführungskontext wartet jetzt auf ein auswertbares, geladenes Dokument und
wiederholt ausschließlich die betroffene GET-Anfrage genau einmal. Profil,
IP und Sitzung bleiben gleich; Zugriff wird vor dem Warten und vor der
Wiederholung neu geprüft. Anmelde-/Zweitfaktorseiten, geschlossene Browser,
Skriptfehler und HTTP-Ablehnungen starten keine zusätzliche Wiederholung.
Auch ein zweiter Dokumentverlust bleibt ein sichtbarer Quellenfehler.

**Diagnoseausgabe:** Feste Kategorien für Navigation, geschlossene Browser,
Skriptfehler und unbekannte Fehler bleiben sowohl bei fehlgeschlagenen als
auch bei übernommenen Teilabrufen erkennbar. Die Ausgabe enthält höchstens
acht Kategorien, keine Rohfehler, Anbieterantworten oder Zugangsdaten.

**Prüfung:** Die neuen Unit- und Chromium-Regressionen scheitern vor der
Korrektur. Nach der Änderung bestehen 337 Worker-Tests bei sieben bestehenden
übersprungenen Prüfungen und die fünf echten
Browsertests zur Sitzungswiederherstellung, Typprüfung, Worker-Bau, Format
und gezieltes Lint. Drei kontrollierte Leseproben mit dem geänderten Import
im bestehenden Cloudprofil laufen durch, ohne Produktionsdaten zu schreiben.
Der produktive Worker bleibt unverändert; temporäre Prüfmodule wurden
entfernt. Mehrere automatische Durchläufe mit der neuen Version und die
Bestätigung der genauen produktiven Fehlerursache stehen noch aus.

## 2026-10-07 - Juna - Neue Vinted-Bewertungen in der Glocke melden

**Auftrag:** Neue Bewertungen nach einem Kontoabruf dauerhaft in der
Benachrichtigungsglocke anzeigen, zusätzlich zur Korrektur ihrer Herkunft.

**Umsetzung:** Der übernommene Profilstand erzeugt serverseitig eine Meldung je
neuer Bewertungskennung. Der erste erfolgreiche Abruf übernimmt nur den
Ausgangsbestand; bestehende Profile verwenden ihren vorherigen Bestand.
Mitgliederbewertungen, automatische und noch unbekannte Herkunft werden
gemeldet. Wiederholungen, Herkunfts-/Textkorrekturen, fehlgeschlagene oder
veraltete Importe erzeugen keine zusätzlichen Meldungen. Beim Leeren bleiben
die bekannten Kennungen gespeichert, damit Meldungen nicht wiederkehren.

Die Glocke vereint allgemeine Meldungen, Favoriten und Bewertungen. Ein Klick
führt zur Bewertungsübersicht des zugehörigen Kontos. Lesestatus und Leeren
gelten workspaceweit wie beim vorhandenen Favoritenstrom. Ein eigener privater
Broadcastkanal invalidiert den Feed ohne Kontodetails; regelmäßiges Nachladen
sichert Wiederverbindungen ab. Betreiber- und Workspace-Adminrechte bleiben
erforderlich; Browser können keine Meldungen erzeugen oder Details ändern.

**Datenbank:** Deklaratives Schema, registrierte Migration und neu erzeugte
API-Typen. Die Migration stammt aus dem Supabase-PgDelta-Katalogabgleich;
objektbezogene ACLs werden aus dem Zielkatalog explizit ergänzt, einschließlich
der Identitätssequenz. Der Transaktionsrahmen bleibt beim Releasepaket.
Isolierte Datenbanken enthalten ausschließlich Schema und synthetische
Testkonten. Keine Produktionsdaten oder Kontozugänge werden kopiert.

**Prüfung:** 44 Datenbankprüfungen bestehen sowohl auf dem deklarativen Ziel
als auch nach Migration mit der Produktionsrolle. Objektberechtigungen sind
abgeglichen. 20 Modell-/Headeraktionstests und 24 Angular-Tests bestehen;
Typprüfung, Format, Lint und Anwendungsbau bestehen. Testzuordnung,
Schemaregistrierung und die betroffenen Workflowprüfungen bestehen ebenfalls.
Die produktive Veröffentlichung und eine tatsächlich neu eingegangene
Bewertung sind noch nicht bestätigt.

## 2026-10-07 - Juna - Herkunft und Datum von Cloud-Bewertungen korrigieren

**Auftrag:** Bewertungen von Mitgliedern und automatische Vinted-Bewertungen
korrekt unterscheiden. Im Cloudkonto erscheinen beide importierten Einträge
als „Herkunft unbekannt“ und dadurch in keiner der beiden Kategorien.

**Ursache:** Zwei kontrollierte manuelle Kontoabrufe bestätigen die echte
Antwortform von `/api/v2/feedbacks`: `system_feedback=false` bei beiden
Mitgliederbewertungen. Der Import berücksichtigt bislang nur `is_automatic`
und `feedback_type`. Außerdem überdeckt das lokalisierte `created_at` den
gültigen ISO-Zeitstempel in `created_at_ts`, wodurch das Abrufdatum erscheint.
Die Diagnose liest nur Feldnamen, Herkunftskennzeichen und Zeitstempel;
Zugangsdaten oder vollständige Anbieterantworten werden nicht protokolliert.

**Korrektur:** Der Worker wertet das ausdrückliche boolesche Kennzeichen
`system_feedback` aus und bevorzugt `created_at_ts`. Bestehende Kennzeichen
bleiben unterstützt, fehlende oder unpassende Werte bleiben unbekannt.
Keine Herkunftserkennung anhand des Freitexts, kein Frontend-Workaround und
keine Datenbankmigration. Nach Veröffentlichung ersetzt ein regulärer Abruf
die bisher unbekannten Herkunftswerte und falschen Daten.

**Prüfung:** Der neue Regressionstest scheitert vor der Änderung an der
unbekannten Herkunft. Nach der Korrektur bestehen 27 Importtests und die
Worker-Suite mit 330 bestandenen und sieben bestehenden übersprungenen Tests.
Worker-Typprüfung einschließlich Produktionsbau-Typen, acht Angular-Tests der
Bewertungsanzeige sowie Format und gezieltes Lint bestehen. Veröffentlichung
und Bestätigung der korrigierten produktiven Anzeige stehen noch aus.

## 2026-10-07 - Juna - Ersten geplanten Proxyabruf beobachten

**Auftrag:** Der Nutzer aktiviert Maikes Automatik in Flipbase. Den ersten
geplanten Abruf ohne zusätzliche manuelle Aktualisierung beobachten.

**Vorprüfung:** Der gespeicherte Zeitplan ist aktiviert, mit Abstand 15 Minuten
und Berechtigungsversion 22. Nächster Termin ist der 07.10., 08:58:51 UTC.
Kein anderes Konto ist aktiviert, keine Cloudaktion oder Browsersitzung offen.
Der Worker bestätigt aktive Zeitsteuerung, aktuelle Firewallfreigabe und
deaktivierte Schreibaktionen.

**Ergebnis:** Der erste Auftrag mit `authorization_kind=scheduled_read`
startet um 08:59:04 UTC und endet um 08:59:11 UTC erfolgreich. Der gespeicherte
Datenstand stammt aus 08:59:08 UTC. Profil, Inserate, Gesprächsübersicht und
Bewertungen sind vollständig; Nachrichten und Verkäufe fehlerfreie Teilstände.
Keine neue Anmeldung erforderlich. Der Kontoterminplan bleibt aktiviert mit
Berechtigungsversion 22, ohne Pausengrund; nächster Termin 09:14:11 UTC.
Nach dem Abruf sind keine Cloudaktionen, Browsersitzungen oder regulären
Browsercontainer offen. Die Profilbindung bleibt `iproyal-pilot-a` und die
Gesundheitsprüfung des Workers besteht. Dies bestätigt den ersten geplanten
Proxyabruf, noch keinen Langzeitbetrieb oder automatische Schreibaktionen.

## 2026-10-07 - Juna - Proxyverbindung prüfen und Cloud-Zeitsteuerung freigeben

**Auftrag:** Nach erfolgreicher Cloud-Verbindung erklären und prüfen, warum
Maike Vintage weiterhin eine pausierte Automatik anzeigt; den bereits
freigegebenen lesenden Pilot über die reservierte IP vorbereiten.

**Live-Prüfung:** Maikes neues Profil ist an `iproyal-pilot-a` gebunden,
die Cloud-Einrichtung abgeschlossen. Ein erneuter Ausgangstest bestätigt
Deutschland und denselben IP-Fingerabdruck wie der registrierte Zugang.
Der manuelle Abruf vom 07.10., 08:36:52 bis 08:36:57 UTC endet erfolgreich:
Profil, Inserate, Gesprächsübersicht und Bewertungen vollständig;
Nachrichten und Verkäufe als fehlerfreie Teilstände. Der Kontoterminplan
ist deaktiviert, ohne Pausengrund und ohne aufeinanderfolgende Fehler.

**Betrieb:** Eine private Kopie der aktuellen Produktionskonfiguration
aktiviert ausschließlich die globale Zeitsteuerung. Worker- und Browserimage,
Hostbroker, Firewall, Profil und deaktivierte Schreibaktionen bleiben erhalten.
Der Worker wurde bei leerer Warteschlange geordnet neu gestartet und ist gesund.
Maikes Kontoschalter bleibt deaktiviert; in Flipbase kann der Nutzer jetzt
unter Kontoeinstellungen die Automatik fortsetzen. Ein erfolgreicher geplanter
Abruf über den Proxy ist noch nicht bestätigt. Kein automatischer Nachrichten-
oder Angebotsversand und kein anderer Kontoterminplan wurden aktiviert.

## 2026-10-07 - Juna - Borg-Umbau umgesetzt und vollständigen Restore geprüft

**Auftrag:** Den recherchierten schlanken Backup-Aufbau auf dem vorhandenen zweiten Server umsetzen.

**Umsetzung:** Ein aktueller Rohstand auf dem Hauptserver statt täglich neuer Bild-Vollarchive. Der Backupserver holt neue Stände über einen eigenen, auf seine IP und `rrsync -ro` beschränkten Leseschlüssel. Borg, Repository-Zugang und Bereinigung bleiben vollständig auf dem Backupserver; der Hauptserver erhält keine Borg-Passphrase und keinen Repo-Löschzugriff. Nach vollständigem Zurücklesen und Prüfsummenvergleich bestätigt eine kleine Datei den Stand; erst dann darf die Quelle ihren Vorgänger ersetzen. Bereits bestätigte Stände übertragen bei weiteren Abfragen nur das Manifest. Fehler, beschädigte Inhalte, veränderte Storage-Daten und Stände älter als 26 Stunden werden abgewiesen. Sieben Tages- und vier zusätzliche Wochenstände, drei vorhandene Release-Abzüge und begrenzter Altbestand; die strikte Migrationssicherung bleibt erhalten. PostgreSQL-Konfiguration mit dem separaten pgsodium-Schlüssel wird ebenfalls erfasst. Eine rootgeschützte Bestätigungsdatei wird atomar publiziert, ohne Verknüpfungen im Uploadordner zu folgen.

**Pilot und Prüfung:** Borg 1.2.8 aus den Ubuntu-Paketen auf dem zweiten Server eingerichtet, ohne bestehende Pakete zu aktualisieren oder Anwendungscontainer neu zu starten. Neuer vollständiger Stand mit 261 Dateien und rund 403 MB Rohinhalt erfolgreich übertragen und aus Borg zurückgelesen. Zwei Pilotstände haben zusammen 309.855.298 komprimierte Bytes, tatsächlich 156.986.506 eindeutige komprimierte Bytes; Repo-Verzeichnis 157.097.984 Bytes. Repository-Limit 8.000.000.000 Bytes. Isolierter Restore mit dem identischen Supabase-PG17-Abbild erfolgreich: 105 öffentliche Tabellen, vier Auth-Konten, 117 Storage-Objekte, passende Storage-Metadaten und sämtliche 117 referenzierten Bilddateien vorhanden. PostgreSQL-17-Grantor erfordert denselben Bootstrap-Superuser `supabase_admin`; nur dessen vorhandene CREATE-ROLE-Zeile wird übersprungen, alle übrigen SQL-Fehler bleiben strikt. Recovery-Paket verschlüsselt auf beiden Servern abgelegt und nach Entschlüsselung ausschließlich per Hash mit den Originalen verglichen; keine Schlüssel oder Datensätze ausgegeben. 11 neue Schutztests und 18 bestehende Retention-Tests unter Linux erfolgreich; neue Workflow-Datei gelintet und formatiert. Fremde Shellbefehle über den Leseschlüssel abgewiesen.

**Stand:** Neue Zeitpläne und Umschaltung sind vorbereitet, aber noch nicht aktiviert; bestehende Nachtläufe und Altstände bleiben bis zum freigegebenen PR bestehen. Betriebsanleitung enthält Installation, Rückfallweg, einen wöchentlichen lokalen Restore-Test und den separaten Test eines tatsächlich aus Borg extrahierten Stands. Eine dritte unabhängige Schlüsselkopie außerhalb beider Server bleibt nicht verifiziert.

## 2026-10-07 - Juna - Vinted-Anmeldemodal 1:1 an freigegebenen Entwurf angleichen

**Auftrag:** Das Vinted-Anmeldemodal exakt an den freigegebenen Polaris-Entwurf
(Mockup) anpassen. Die Segmented-Control-Methode-Tabs wiederherstellen, den
Konto-Identitätsstreifen bündig unter der Kopfzeile platzieren, das Kopfzeilen-
Icon ergänzen und die 2 Ansichten (Formular vs. interaktive Browseransicht) mit
voller Aktionsbreite umsetzen.

**Umsetzung:**

1. **Bündiger Identitätsstreifen:** Der Konto-Identitätsstreifen sitzt mit
   `-mx-5 -mt-5` randbündig direkt unter der Kopfzeilentrennlinie mit
   Konto-Badge (Teal-Statuspunkt) und Bereit-Status.
2. **Kopfzeilen-Icon:** Einbindung von `LucideLink2` mit `brand`-Farbton auf
   `app-modal-shell` in `MarketplaceAccountsComponent` und `MarketplaceConnectComponent`.
3. **Segmented Method Tabs:** Pill-Container mit den beiden Methoden
   („Zugangsdaten eingeben“ mit Schloss-Icon und „Direkt im Browser“ mit Bildschirm-Icon)
   zum Umschalten zwischen Formular und Direktansicht.
4. **Ansicht 1 (Zugangsdaten):** 2-spaltige Eingabefelder, Trust-Box mit grünem Schild,
   breiter primärer Aktionsbutton („Anmelden und Konto verbinden“) in Flipbase-Gelb
   mit Pfeilsymbol sowie dezenter Direktbrowser-Link darunter.
5. **Ansicht 2 (Direkt im Browser):** Zentrierte Informationskarte mit
   Bildschirm-Icon, Erklärungstext und „Browser-Sitzung starten“-Aktion.

**Prüfung:** 99 Angular-Unit-Tests in `marketplace-browser-test`, `marketplace-accounts`
und `vinted-workspace` (inkl. AXE-Barrierefreiheit) bestehen. TypeScript-Typprüfung,
ESLint, Prettier und Admin-UI-Check fehlerfrei (0 Findings).

## 2026-10-07 - Juna - Vinted-Anmeldefenster nach Shopify-Polaris überarbeiten

**Auftrag:** Das Vinted-Anmeldefenster stimmig, aufgeräumt und passend zur
Polaris-Designlinie gestalten. Die dreifache Kasten-in-Kasten-Verschachtelung
beseitigen, die breite Leere im Anmeldeschritt beheben und die beiden
Anmeldewege verständlich strukturieren.

**Umsetzung:**

1. **Entschachtelung:** Das Modal (`app-modal-shell`) bildet den direkten Rahmen.
   Im Kompaktmodus entfallen die verschachtelten `app-card`-Container um das
   Formular.
2. **Kompakte Anfangsgröße & dynamische Erweiterung:** Der Dialog startet fokussiert
   in `size="lg"` (ca. 620 px) und erweitert sich über ein `previewActive`-Signal
   erst bei aktiver interaktiver Browser-Vorschau (Captcha/Stream) auf `size="xl"`
   (896 px).
3. **Konto-Identitätszeile:** Ein kompakter Streifen fasst den Namen des
   ausgewählten Kontos mit Statusindikator und Bereit-Status zusammen.
4. **Klare 2-Wege-Aktionen:** Primärer Anmeldebutton („Anmelden und Konto verbinden“)
   in Markenfarbe Flipbase-Gelb (`#fcc601`) neben direktem sekundären Button
   („Direkt im Browser anmelden“) für Google-/Apple-Login und manuelle Eingabe
   ohne Umwege über Zwischen-Tabs.
5. **Datenschutz & Sicherheit:** Ein dezenter Trust-Hinweis mit Schild-Symbol
   erklärt die sichere Ausführung im isolierten Cloud-Profil und die flüchtige
   Handhabung von Passwörtern. Redundante Fußzeilen und Abbrechen-Links entfallen.

**Prüfung:** 103 Tests in `marketplace-browser-test`, 30 Tests in `marketplace-accounts`
(inkl. AXE-Barrierefreiheit) und 50 Tests in `vinted-workspace` bestehen. TypeScript-
Typprüfung, ESLint, Prettier-Formatierung und `scripts/check-admin-shared-ui.mjs`
bestehen fehlerfrei (0 Findings).

## 2026-10-07 - Juna - Zweiten Server gezielt bereinigt

**Auftrag:** Im Zuge der Speicher- und Sicherungsanalyse auch auf dem zweiten Server Platz freigeben.

**Umsetzung:** Nach konkreter Vorschau 73 ältere verschlüsselte Release-Abzüge mit 10.389.338.139 Bytes entfernt. Die neuesten drei Release-Abzüge und alle täglichen Sicherungen bleiben erhalten. Sämtliche 24 auf dem Hauptserver aufbewahrten Sicherungsdateien vor und nach der Bereinigung per SHA-256 mit dem zweiten Server abgeglichen. Neun eindeutig dem Agency-Care-Worker zugeordnete, ungetaggte und von keinem Container verwendete Images ohne Erzwingen entfernt; aktives Image, Compose-Referenzen und zwei zusätzliche Vorgängerversionen geschützt. Archivierte Systemjournale nach Rotation auf etwa 476 MiB reduziert. Keine Volumes, Container, Anwendungsdaten oder VS-Code-Installationen gelöscht.

**Prüfung:** Root-Belegung von 90 auf 59 Prozent, verfügbare Bytes von 3.951.255.552 auf 15.715.565.568; insgesamt 11.764.310.016 Bytes beziehungsweise etwa 10,96 GiB freigegeben. Alle sechs Container haben nachher dieselben IDs, Images, Laufzustände und Startzeiten. Vorschau und Ergebnis als rootgeschützte JSON-Protokolle auf dem zweiten Server abgelegt. Die vorhandene altersbasierte Backup-Cronregel und die Sicherungsarchitektur wurden bei diesem einmaligen Lauf nicht umgestellt; die dauerhafte neue Aufbewahrung bleibt Teil des Vorschlags.

## 2026-10-07 - Juna - Borg mit Restic, Kopia und gehosteten Sicherungszielen verglichen

**Auftrag:** Prüfen, ob Borg die passende Wahl ist oder eine andere Sicherungslösung für Flipbase besser passt.

**Ergebnis:** Herstellerdokumentation zu Borg, Restic, Kopia und BorgBase verglichen und das Recherchepapier ergänzt. Borg bleibt der bevorzugte Kandidat für den vorhandenen SSH-Backupserver; Restic ist die passendere Option bei einem direkt S3-basierten Sicherungsziel. Ein späterer S3-Bildspeicher allein erzwingt keinen Werkzeugwechsel. Gehostete Repositorys reduzieren Zielserver-Wartung, ersetzen aber weder den konsistenten PostgreSQL-Abzug noch die Einrichtung und Restore-Prüfung des eigenen Laufs. Keine produktiven Installationen, Löschungen oder Änderungen; keine pauschale Leistungsüberlegenheit ohne Benchmark behauptet.

## 2026-10-07 - Juna - Sicherungsvorschlag auf kleine Web-App und Objektspeicher zugeschnitten

**Auftrag:** Übrigen Platzverbrauch auf dem Backupserver erklären und eine schlanke Lösung für ein Ein-Personen-Projekt ohne aktuelle Nutzer, später 50–100 Nutzer, einschließlich Blob-/Objektspeicher recherchieren.

**Analyse:** Ausschließlich lesende Verzeichnisgrößen und Docker-Summen auf dem zweiten Server geprüft: 38-GiB-Partition, 33 GiB belegt, 91 Prozent. Etwa 14 GiB Flipbase-Sicherungen, 8 GiB Docker-Verzeichnis, 4,6 GiB VS-Code-Server/Insiders, 2,1 GiB Logs und 2,3 GiB Systemdateien. Die Maschine betreibt auch n8n und weitere Dienste. Docker meldet 3,971 GB theoretisch freigebbare Images; keine pauschale Löschung vorgenommen. Herstellerquellen zu Supabase-S3, R2-Tarifen/EU-Speicherort, Hetzner Storage Box/Object Storage und Blob-Datenhaltung geprüft.

**Vorschlag:** Den pauschalen Stunden-Aufbau im Recherchepapier durch einen täglichen Startlauf mit sieben Tages- und vier Wochenständen, drei geschützten Release-Punkten und Wiederverwendung unveränderter Dateien ersetzt. Vor echten Nutzern Verlustziel erneut festlegen. Bestehenden Backupserver zunächst nach begrenzter Bereinigung weiterverwenden, keine zusätzliche Bestellung voraussetzen. R2 als Kandidat für private Bilddateien über das bestehende Supabase-Backend erläutert; ein explizites 25-GB-Nutzungsbeispiel ergibt ungefähr 0,23 USD reine monatliche Speicherkosten nach Freikontingent, ohne zusätzliche Anfragen/Dienste/Backups/Steuern. Keine Umwandlung in Programmcode und keine automatische Fotokomprimierung durch Objektspeicher. Keine Infrastruktur, Zugangsdaten, produktiven Sicherungen oder Kundendaten verändert.

## 2026-10-07 - Juna - Sicherungskonzept recherchiert und beide Server geprüft

**Auftrag:** Ermitteln, welche Sicherungen Flipbase tatsächlich benötigt und wie Wiederherstellungspunkte platzsparend und sicher aufbewahrt werden.

**Analyse:** BSI-, Behörden-, Supabase-, PostgreSQL-, Restic- und pgBackRest-Dokumentation recherchiert. Beide Server ausschließlich lesend geprüft: Nächtliche Sicherung um 03:30 Uhr, sieben lokale Sätze, drei lokale Release-Abzüge, etwa 2,4 GiB lokale Sicherungen. PostgreSQL-Archivierung ist ausgeschaltet. Der Backupserver meldet 90 Prozent Belegung; rund 14 GiB Flipbase-Sicherungen, darunter 76 Release-Abzüge mit 9,98 GiB. Die dortige 30-Tage-Regel begrenzt das Alter, nicht die Zahl der Release-Abzüge. Erzwungenes `rrsync -wo -no-del` bestätigt. Der lokale abweichende Hosteintrag wurde nicht überschrieben: Die ED25519-Identität wurde über den bereits vertrauten Produktionsserver abgeglichen und für die lesende Prüfung temporär festgelegt. Keine privaten Schlüssel oder Kundendaten gelesen.

**Ergebnis:** `deploy/BACKUP-STRATEGY.md` enthält den konkreten Vorschlag einschließlich Verlustziel, deduplizierter Dateisicherung, begrenzter Release-Aufbewahrung, unabhängiger Kopie, vollständigen Restore-Tests, Datenbank-/Storage-Konsistenz und unverändertem Schutz gegen Löschen durch den Anwendungsserver. Die Rückfrage zum tolerierbaren Datenverlust ist noch offen. Vor einer Restic-Umstellung müssen Backend, Initialplatz und vollständige Wiederherstellung nachgewiesen werden. Keine produktiven Änderungen oder Löschungen; eigener Recherchezweig, fremde Zweige unverändert.

## 2026-10-07 - Juna - Cloud-PR freigeben und Browserprüfung eindeutig machen

**Freigabe:** Der Nutzer bestätigt PR, erfolgreiche Pflichtprüfungen, Merge
und anschließende Bereinigung des eigenen Zweigs. Die Cloud-Automatik bleibt
bis zum bestätigten Proxy-Anmeldeversuch pausiert.

**CI-Korrektur:** Der Browser-Smoke scheitert im bestehenden Sniper-Test an
einem mehrdeutigen Status-Locator: Markenauswahl und Suchfilter-Zusammenfassung
haben beide `role="status"`. Die Prüfung wird auf die Zusammenfassung mit der
ausgewählten Kategorie eingegrenzt; die verlangten Titel-Stichwörter bleiben
unverändert. Kein Sniper-Produktcode wird geändert. Format, Lint und das Laden
beider Testvarianten bestehen; der vollständige Browsernachweis folgt in CI.

## 2026-10-07 - Juna - Bestehende Cloudkonten auf reservierte Proxyprofile umstellen

**Auftrag:** Nach dem lesenden Pilot beauftragt der Nutzer den fehlenden
geregelten Wechsel älterer Cloudkonten auf ein reserviertes ISP-Profil.
Maikes produktiver Zeitplan bleibt pausiert. Andere Sitzungen und Zweige
werden nicht verändert.

**Umsetzung:** Der vorhandene Einrichtungsablauf wird für ältere Cloudkonten
ohne abgeschlossene IP-Zuordnung geöffnet. Die Kontoaktion prüft den Bestand
und verwendet denselben Anmelde-/Identitätsablauf wie der Lokal-zu-Cloud-Wechsel.
Laufende und ungeklärte Aufträge verhindern die Umstellung; ein vorhandener
Zeitplan wird erst nach erfolgreicher Reservierung widerrufen. Alte Profile
werden nach bestätigtem Stopp archiviert. Reguläre manuelle und geplante
Chromiumstarts benötigen anschließend eine bestätigte Proxyreservierung;
Abbruch oder fehlende Kapazität erzeugen keinen stillen direkten Zugang.
Fertige Zuordnungen öffnen keinen neuen Anmeldedialog und werden beim Verlassen
der Seite nicht als laufende Reservierung abgebrochen.

**Prüfung:** 329 Worker-Tests bestehen, sieben bestehende Tests sind übersprungen.
61 Angular-Tests einschließlich Cloud-Kontoaktion und fertig eingerichteter
Zuordnung, 14 Workflow-Tests, Typprüfung, Lint, Format und Angular-Bau bestehen.
Die Migration wird mit Supabases PgDelta aus dem tatsächlichen Vergleich zweier
isolierter Testdatenbanken erzeugt: genau zwei Funktionen, transaktional, ohne
Tabellen- oder Rechteänderung. Ihr Replay gegen die bisherigen Migrationen
besteht 76 pgTAP-Assertions; Funktionsdefinitionen und Rechte stimmen mit dem
deklarativen Ziel überein. Die nach der Migration neu erzeugten API-Typen sind
gegenüber dem ebenfalls neu erzeugten Ausgangsstand unverändert. Es werden
keine echten Kontodaten in die Testdatenbank kopiert.

**Betriebsgrenze:** Noch nicht veröffentlicht. Maikes Zeitplan und die globale
Zeitplan-/Schreibfreigabe bleiben deaktiviert. Keine produktive Anmeldung,
Profiländerung oder Datenbankmigration wird vor dem geprüften PR ausgeführt.

## 2026-10-07 - Juna - Lesende Cloud-Automatik mit Maike Vintage testen

**Freigabe:** Nach dem vorgeschlagenen Pilotablauf beauftragt der Nutzer die
Aktivierung ausschließlich für Maike Vintage. Mehrere geplante Abrufe,
Browserabschluss, Wiederanlauf und Fehlerpausen werden geprüft. Versand und
sonstige Vinted-Schreibaktionen bleiben deaktiviert.

**Vorprüfung:** Die Cloud-Verbindung ist bestätigt. Es existiert genau ein
gespeicherter Zeitplan, bislang mit altem `forbidden` pausiert. Kein anderer
Zeitplan ist aktiviert. Ein anfänglich laufender manueller Abruf ist vor der
Umstellung beendet. Die aktuelle gehärtete Worker-/Broker-Konfiguration
wird direkt vom Server geprüft und erhalten; keine Rückkehr zur früheren
Docker-Socket-Konfiguration im Worker. Zugangsdaten und Kontoinhalte werden
nicht protokolliert.

**Live-Ergebnis:** Zwei echte geplante Abrufe am 07.10. um 00:50 und 00:53 Uhr
(Berlin) speichern erfolgreich ihre Ergebnisse und beenden den Browser. Der
zweite läuft nach einem geordneten Worker-Neustart ohne erneute Anmeldung.
Profil, Inserate, Gespräche und Bewertungen sind vollständig; Nachrichten und
Verkäufe bleiben fehlerfreie Teilstände. Insgesamt 60 gezielte Worker-Tests
bestehen, darunter Anmeldeverlust, Abbruch bei 403/429, Rate-Limit-Pause,
Zugriffsentzug, geordneter Dienstabschluss und Auftragsabgrenzung. Ein echter
Anbieterfehler wird im produktiven Konto nicht künstlich ausgelöst.

**Abweichung und Endzustand:** Die anschließende direkte Prüfung des privaten
Profilmanifests zeigt für Maike `networkId=direct`; für diese Verbindung
existiert kein Cloud-Einrichtungsdatensatz. Der verifizierte, gültige deutsche
ISP-Zugang `iproyal-pilot-a` ist im Bestand vorhanden, aber diesem Profil nicht
zugeordnet. Der Pilot bestätigt deshalb die Zeitsteuerung, nicht den
gewünschten Proxybetrieb. Diese Bindungsprüfung hätte vor der Aktivierung
erfolgen müssen. Maikes Zeitplan wird über die regulären Kontoeinstellungen
pausiert und auf 15 Minuten gespeichert. Die globale Dienstfreigabe wird
geordnet auf die vorherige Sicherheitskonfiguration zurückgenommen. Es gibt
keine offenen Sitzungen, laufenden Aufträge oder Browsercontainer; der Worker
ist gesund. Profil, Verbindung und Proxybestand bleiben erhalten. Vor einer
erneuten Freigabe braucht dieses ältere Cloudkonto einen unterstützten Wechsel
in die kontogebundene IP-Einrichtung; keine manuelle Manifest-/Datenbankänderung.

## 2026-10-07 - Juna - Klarere Meldung zur pausierten Cloud-Automatik veröffentlichen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen
Pflichtprüfungen und Bereinigung des eigenen Zweigs. Der aktuelle master
mit den Speicheränderungen wird übernommen; beide Protokollabschnitte bleiben
erhalten. Die Änderung erklärt den früheren automatischen Abruffehler und
die davon unabhängige manuelle Aktualisierung. Automatikfreigabe und
Browserdienst werden durch diese Textkorrektur nicht verändert. Nach dem
Merge wird die tatsächlich veröffentlichte Web-Version geprüft.

## 2026-10-06 - Juna - Alten automatischen Abruffehler nach erfolgreicher Cloud-Verknüpfung einordnen

**Auftrag:** Die Cloud-Verknüpfung gelingt und manuelle Kontenaktualisierungen
sind grün, während der Seitenkopf eine pausierte Automatik und eine
Vinted-Ablehnung meldet.

**Live-Diagnose:** Die gebundene Maike-Vintage-Verbindung ist `connected` im
Cloudmodus. Drei heutige manuelle Abrufe sind erfolgreich abgeschlossen und
gespeichert, ohne Quellenfehler. Profil, Inserate, Gesprächsübersicht und
Bewertungen sind vollständig; Nachrichten und Verkäufe bleiben fehlerfreie
Teilstände. Der getrennte Zeitplan ist seit dem 2. Oktober nach einem
automatischen Abruf mit `forbidden` pausiert. Der Worker meldet weiterhin
deaktivierte Zeitsteuerung. Nur Statusmetadaten werden gelesen; keine
Kontoinhalte, Zugangsdaten, Datenbankkorrektur oder neue Anbieteranfrage.

**Korrektur:** Der Ablehnungshinweis benennt den letzten automatischen Abruf
und erklärt, dass manuelle Aktualisierungen unabhängig davon möglich sind.
Eine manuelle Aktualisierung erteilt keine neue Automatikfreigabe. Der
Pausengrund bleibt erhalten; weder Zeitsteuerung noch Schreibaktionen werden
aktiviert. Ein gezielter Dialogtest prüft diese Trennung auch bei einem
neueren manuellen Aktualisierungszeitpunkt. Veröffentlichung erst nach
erfolgreichen Prüfungen und PR-Freigabe.

**Prüfung:** 87 gezielte Angular-Tests für Zeitplan, Kontrollzeile und Workspace
bestanden. Typprüfung, ESLint, Prettier und Angular-Produktionsbau erfolgreich;
nur die bestehende CommonJS-Warnung zu `pako`. Die Änderung ist lokal geprüft,
noch nicht veröffentlicht.

## 2026-10-06 - Juna - offene Sicherheitsgrenzen serverseitig schließen

**Freigabe:** Der Nutzer bestätigt Branch-Push, PR-Erstellung, Merge-Commit nach erfolgreichen Pflichtprüfungen und anschließendes Aufräumen des eigenen Zweigs samt Worktree. Der vorbereitete Installationsweg hält den Webhook-Dienst vor der Rechte-Migration verfügbar und trennt die Chromium-Serverumstellung vom Web-Release.

**Auftrag:** Die beiden offenen Befunde nach PR #320 einschließlich der dafür
notwendigen Serveränderungen im eigenen Zweig `juna/security-backend-boundaries` beheben.

**Umsetzung:** Webhook-Konfigurationen nur noch über einen angemeldeten Funktionsdienst
lesen und ändern; gespeicherte Zugangsdaten bleiben serverseitig. Versandziele und
Workspace-Zugriff werden am Server geprüft. Ein privater Broker übernimmt die
Docker-Operationen und die echten Chromium-Profile; der Worker erhält nur getrennte
Metadaten und einen begrenzten Auftragskanal.

**Prüfung:** Produktionsbau, Formatierung, ESLint und Typprüfung bestanden. Die vollständigen Node-, DOM- und Edge-Suites bestehen; die Angular-Suite besteht mit vier Prozessen (189 Dateien, 1.901 Tests). Der unbegrenzte Gesamtaufruf wurde nach lokalen Zeitüberschreitungen beendet. Worker: 326 Tests bestanden, sieben bestehende Fälle übersprungen. Alle 190 Migrationen in einer isolierten Datenbank angewendet; abschließend 3.229 Datenbanktests bestanden. Der Transport mit geprüfter IP und TLS-Host wurde in einer isolierten User-Worker-Instanz derselben installierten Edge-Runtime-Version bestätigt. Ein unabhängiger Review fand drei Versandregressionen; Kanalisolation, Wiederholung fehlgeschlagener Nachrichten und der bisherige Kennzahlenvertrag sind korrigiert und geprüft. Der aktuelle origin/master ist enthalten. Testcontainer entfernt; keine Produktionseinstellungen geändert und kein Deployment. Tatsächliche Image-Bauten, Broker-Browser-Smoke und produktive Serverumstellung stehen aus.

## 2026-10-06 - Juna - Speichermelder mit eingeschränktem Verwaltungszugang einrichten

**Befund und Korrektur:** PR #323 ist nach vollständig grünen Prüfungen gemergt und produktiv. Die Einrichtung scheiterte zunächst daran, dass der produktive PostgreSQL-Verwaltungszugang kein Superuser ist und daher auch `NOSUPERUSER` nicht setzen darf. Das Installationsskript prüft nun die sicheren Standardattribute der neu angelegten Rolle beziehungsweise lehnt unerwartete Verwaltungsrechte einer vorhandenen Rolle ab. Es ändert ausschließlich Login, Vererbung, Verbindungslimit und SCRAM-Passwort; keine Erweiterung des Verwaltungszugangs. Die Provisionierung ist vollständig transaktional.

**Prüfung und Aktivierung:** Einrichtung und Rotation mit einem isolierten Nicht-Superuser bestätigt; Rollen mit BYPASSRLS oder Rollenmitgliedschaften werden abgewiesen. Fünf Python-Prüfungen und Generator-Vertrag bestehen. Der produktive DynamicUser-Dienst meldet erfolgreich, der Minutentimer ist aktiv. Zwölf echte Rechte-/Aktualitätsprüfungen sind erfolgreich, native Leseversuche auf Messwerte und Arbeitsbereiche werden abgewiesen, die Credential-Datei gehört ausschließlich Root mit Modus 0600. Der eigene Testcontainer wurde entfernt. Die Folgekorrektur wird im eigenen Zweig `juna/server-storage-installer` über den bereits freigegebenen PR-Ablauf abgeschlossen.

## 2026-10-06 - Juna - Supabase-Imagevorrat begrenzen und Speicheranzeige freigeben

**Auftrag und Freigabe:** Nach der Erklärung der mehreren Supabase-Versionen beauftragt der Nutzer die Umsetzung. Die vorbereitete Betreiberanzeige wird über den bereits besprochenen grünen PR veröffentlicht; zusätzlich wird die stündliche Bereinigung auf benannte Supabase-Repositories erweitert.

**Regel:** Alle laufenden und gestoppten Container sowie die vorgesehenen Images der aktiven Supabase-Compose-Dateien bleiben geschützt. Je Supabase-Dienst bleiben zwei weitere unbenutzte Versionen, ohne Referenz drei. Docker-Hub und ECR teilen dieselben Plätze anhand eindeutiger Image-IDs. Fremde Tags, Testcontainer, Volumes und Kundendaten werden nicht entfernt. Vor jeder Löschung werden Container und Compose erneut geprüft; keine erzwungene Entfernung. Eine zusätzliche Anmeldung oder öffentliche Schnittstelle wird nicht eingerichtet.

**Prüfung:** 18 Aufbewahrungstests unter Linux bestanden, einschließlich Registry-Aliasse, fremder Tags, Compose-Schutz und erneuter Prüfung vor dem Entfernen. Die Vorschau wählt drei ungenutzte Supabase-Images aus. Der erste CI-Datenbanklauf zeigte, dass der eingeschränkte Testnutzer nicht in die neu erzeugte Melderrolle wechseln durfte. Die ausschließlich transaktionale Testvorbereitung gewährt nun ausdrücklich diesen Rollenwechsel. Alle 18 Datenbankprüfungen bestehen auch mit einem isolierten Nicht-Superuser und pauschalen Default-Grants; Produktionsrechte wurden dafür nicht erweitert. Die abschließende Speicher- und Dienstprüfung folgt nach der freigegebenen produktiven Ausführung. Frühere Größenangaben dokumentieren ihren jeweiligen Messzeitpunkt.

## 2026-10-06 - Juna - sichere Server-Speicheranzeige und Restbelegung prüfen

**Auftrag:** Die vorbereitete Speicheranzeige in den Betreiberbereich einbauen und die weiterhin hohe Hetzner-Belegung anhand echter Messungen erklären.

**Umsetzung:** Eigener Zweig `juna/server-storage-dashboard` vom aktuellen `origin/master`. Neue Seite unter Administration → Server-Speicher mit Gesamtgröße, belegten und verfügbaren GiB, Prozentberechnung wie `df`, Messzeit, Warnstufen und ausdrücklich unbestätigtem Zustand bei fehlender Aktualität. Vorhandene Shared-Komponenten und Anmeldung werden verwendet. Der Minutentimer läuft ohne Rootrechte oder Docker-Socket; ein eigener Loopback-DB-Login besitzt ausschließlich die Meldefunktion für einen Datensatz. RLS-Lesen nur für Plattformbetreiber, keine Messrechte für Browser oder allgemeine Dienstrolle, keine neue öffentlich erreichbare Schnittstelle. Installation und Credential-Rotation erfolgen erst nach dem freigegebenen Release; der PostgreSQL-Client ist eine notwendige Servervoraussetzung.

**Datenbankvertrag:** Die Migration wurde mit Supabase CLI 2.114.0 in isolierten Vorher-/Nachher-Datenbanken erzeugt. Der CLI-Abgleich lässt explizite Revokes gegenüber vorhandenen pauschalen Default-Grants aus; ein eng begrenzter Generator ergänzt die Rechte aus dem deklarativen Schema. TypeScript-Verträge wurden vollständig aus einer reinen Strukturkopie mit der neuen Tabelle generiert; der Unterschied besteht ausschließlich aus 32 Zeilen für Tabelle und Funktion. Keine Kundendaten kopiert, keine Proxydateien von Hand angepasst.

**Bestandsanalyse:** Live etwa 44 GiB belegt und 29 GiB verfügbar, 61 Prozent. Größte Posten: containerd etwa 30 GiB, Swap 4 GiB, Backups 2,7 GiB und PostgreSQL 2,2 GiB. Docker-Verwaltung/Logs/Volumes etwa 1,7 GiB und Systemlogs etwa 0,6 GiB. Die Feed-Tabelle belegt 1.945 MiB einschließlich Indizes und ausgelagerter Werte; Statistiken schätzen etwa 836.000 lebende Zeilen. Der Feed erklärt damit etwa 1,9 GiB, nicht den Docker-Hauptposten. Mehrere Supabase-Versionen und drei große Chromium-Versionen sind vorhanden. Es laufen parallel isolierte Datenbanktests anderer Sitzungen. Keine weiteren Produktionsimages, Container, Volumes, Profile oder Nutzerdaten gelöscht. Aufbewahrung und gemessene Größen sind in der bestehenden Deployment-Dokumentation ergänzt.

**Prüfung:** 18 echte Datenbankprüfungen auf einer isolierten Strukturkopie mit pauschalen Default-Grants bestanden. Ein echter SCRAM-Login über libpq meldet gemessene Hostwerte und erhält keinen Lesezugriff auf Messwerte, Auth-Nutzer oder Arbeitsbereiche. Systemd-Dienst und Timer syntaktisch geprüft. Die produktive Installation, der echte Timerlauf unter DynamicUser und die Anzeige in einer angemeldeten Produktionssitzung stehen noch aus. 25 gezielte Angular-Tests einschließlich gerenderter Shared-Komponenten und AXE-Strukturprüfung bestanden; Farbkontrast ist im DOM-Test ausgenommen. Fünf neue Python-Tests unter Windows und Linux, der Generator-Vertrag, Schema-/Migrationsprüfungen und die bestehende Aufbewahrung bestehen. ESLint, beide TypeScript-Prüfungen, Shared-UI-Grenze und Angular-Produktionsbau bestanden. Die Passwortrotation wurde mit einem clientseitig erzeugten SCRAM-Verifier und echter Anmeldung verifiziert; kein Klartextpasswort gelangt ins SQL. Suite-Audit und geänderte Dateien sind geprüft und formatiert. Eigene temporäre Testdatenbank, Zugangsdaten und Hilfsdateien wurden anschließend vollständig entfernt; der Produktions-Meldetimer wurde noch nicht installiert.

## 2026-10-06 - Juna - Serverbereinigung und automatische Aufbewahrung freigegeben

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen, einmalige produktive Bereinigung und Aktivierung der vorbereiteten stündlichen Aufbewahrung. Die bestätigte Regel schützt alle Container-Versionen, zwei zusätzliche eigene Images je Dienst, drei lokale Release-Sicherungen und sieben vollständige nächtliche Sätze nach bestätigtem externem Inhaltsvergleich. Die längere externe Aufbewahrung bleibt unverändert. Der Vorschlag einer Adminanzeige gehört nicht zur freigegebenen Umsetzung.

**Integration:** Vor dem Push wird der aktuelle `origin/master` übernommen. Anwendung, Backend und fremde Zweige bleiben außerhalb der Speicheränderung. Die produktive Installation erfolgt erst nach erfolgreichem PR-Merge. Exakte Ersparnis und Dienststatus werden nach der Ausführung geprüft und im Chat berichtet.

## 2026-10-06 - Juna - Begrenzte Server-Aufbewahrung vorbereitet

**Auftrag:** Übliche Aufbewahrung recherchieren, konkrete Speicherersparnis prüfen, Wiederholung verhindern und eine sichere Speicheranzeige im Flipbase-Betreiberbereich beurteilen.

**Entscheidung:** Alle von Containern verwendeten Images schützen und zwei zusätzliche Versionen je eigenem Dienst behalten; ohne Container drei Versionen. Lokal drei verschlüsselte Release-Sicherungen und sieben vollständige nächtliche Sätze behalten. Die getrennte externe Aufbewahrung von etwa 30 Tagen bleibt erhalten. Die Zahlen sind ein Flipbase-Vorschlag, keine allgemeine Sicherheitsnorm. Recherche bei Docker, restic und CISA sowie Architektur und Installationsweg sind in `deploy/README.md` dokumentiert.

**Vorbereitung:** `cleanup-server-storage.py` zeigt standardmäßig nur die Auswahl. Container einschließlich gestoppter Container, fremde Repositories, unbekannte Dateien, unvollständige Sätze und symbolische Links sind geschützt. Die automatische Image-Löschung verwendet keine Erzwingung und keine Container-/Volume-Bereinigung. Die verbliebenen verschlüsselten Sicherungen müssen über den vorhandenen streng geprüften SSH-/rsync-Weg inhaltlich übereinstimmen, bevor lokale Backups entfernt werden. Image-Bereinigung ist von der Backup-Erreichbarkeit unabhängig. Gemeinsame Deploy-/Backup-Sperren verhindern Überschneidungen; `backup.sh` und `migration-backup.sh` erhalten die Backup-Sperre. Die alte ungeprüfte Alterslöschung entfällt. Ein stündlicher Cronauftrag ist vorbereitet, noch nicht installiert.

**Live-Vorschau:** 391 eigene alte Images ausgewählt; 108 Backupdateien mit exakt 12.932.477.886 Bytes zur Löschung vorgesehen. Die drei verbleibenden Release-Sicherungen und sieben vollständigen nächtlichen Sätze vom 30. September bis 6. Oktober wurden ohne Schreiboperationen erfolgreich mit den externen Kopien verglichen. Docker meldet aktuell etwa 29,3 GB insgesamt freigebbar; die tatsächliche Ersparnis der begrenzten Image-Auswahl kann erst nach ihrer Ausführung festgestellt werden. Ein direkter Zugriff vom Arbeitsplatz auf den Backupserver wurde wegen abweichender gespeicherter SSH-Hostschlüssel abgewiesen; dieser Schutz wurde nicht umgangen. Der vorhandene Backupweg vom Produktionsserver besteht mit strenger Hostprüfung und Inhaltsvergleich.

**Adminanzeige:** Lokaler Timer meldet ausschließlich Partitionsgröße, Belegung, verfügbaren Speicher und Messzeit. Ein eigener eng begrenzter Schreibzugang aktualisiert nur diesen Datensatz; Lesen ausschließlich über die vorhandene Betreiberprüfung `public.is_platform_operator()`. Kein öffentlicher Zusatzport, Browser-SSH oder Docker-Socket im Webcontainer. Datenbankvertrag, Meldeprozess und UI sind ein dokumentierter Vorschlag, noch nicht implementiert.

**Prüfung:** 14 isolierte Python-Tests unter Linux erfolgreich, einschließlich echter Dateisperren und einer Shell-Fixture mit simulierten Docker-/age-/rsync-Befehlen. Lokal unter Windows bestehen dieselben zwölf plattformunabhängigen Tests, zwei Linux-Tests sind dort übersprungen. Die gezielten Node-Verträge bestehen mit drei ausgeführten und vier plattformbedingt übersprungenen Fällen. Shell-Syntax, ESLint für geänderte JavaScript-Tests, Prettier und `git diff --check` bestanden. Der neue Test wird in die reguläre Workflow-Suite aufgenommen. Kein Docker-Bau, kein echtes Backup oder Restore im Test.

**Freigabegrenze:** Nur temporäre Vorschau-/Testdateien und eine Sperrdatei auf dem Produktionsserver für die Untersuchung verwendet. Keine Anwendung ausgerollt, keine Backups/Images entfernt und keinen Cronauftrag installiert. Änderungen liegen ausschließlich im eigenen Zweig `juna/server-storage-retention`; PR, Merge und produktive Aktivierung sind noch nicht freigegeben.

## 2026-10-06 - Juna - Speicherverbrauch des Hetzner-Servers untersucht

**Auftrag:** Ursachen der hohen Festplattenbelegung und den Einfluss von Docker-Logs sowie der Sieben-Tage-Aufbewahrung im Vinted Feed feststellen.

**Analyse:** Ausschließlich lesende SSH-Prüfung auf dem Produktionsserver. Die Root-Partition meldet 67 G belegt und 5,5 G verfügbar bei 93 Prozent. Die Overlay-Mounts zeigen dieselbe zugrunde liegende Partition mehrfach und dürfen nicht addiert werden. Docker meldet 440 Images mit 42,96 GB, davon 30,68 GB freigebbar; 344 Image-Einträge gehören zum Webabbild, 30 zum Feed und 21 zum Marketplace-Worker. Das produktive Deployskript verwendet lediglich `docker image prune -f`, wodurch benannte ungenutzte Versionen bestehen bleiben.

**Weitere Verbraucher:** Lokale Backups belegen rund 15 G: 42 Release-DB-Sicherungen mit 8,53 GiB, 30 nächtliche DB-Dateien mit 5,71 GiB sowie 30 Storage-Sicherungen mit 0,47 GiB. Nächtliche Sicherungen behalten komprimierte und verschlüsselte Kopien. PostgreSQL-Dateien belegen 2,6 G, die Feedtabelle einschließlich Indizes 1.945 MB. Docker-Containerlogs belegen insgesamt 944 M; der Feedcontainer hat nachweislich drei Logdateien mit jeweils höchstens 10 MB. Hochgeladene Dateien belegen 36 M.

**Feed-Aufbewahrung:** Die aktuelle SQL-Abfrage zählt 1.921.037 Funde, davon 1.067.190 älter als sieben Tage; der älteste stammt vom 18. September. Die produktive Löschfunktion und aktuelle Dienstlogs bestätigen die aktive Bereinigung: Pakete von 1.000 Funden etwa alle sechs Sekunden. Die Ursache des historischen Rückstands wurde nicht abschließend untersucht. Der Collector speichert Bildlinks statt Kopien der Vinted-Bilder. Autovacuum war zuletzt am 6. Oktober um 18:08 UTC aktiv; SQL-Löschungen bedeuten keine sofortige vollständige Rückgabe der Dateigröße an das Betriebssystem.

**Prüfung und Grenzen:** `df`, begrenzte Verzeichnisgrößenmessungen, `docker system df`, ausschließlich ausgewählte Container-Metadaten, aggregierte Backup-Dateigrößen, SQL-Größen/Statistiken, die produktive Löschfunktion sowie gefilterte Bereinigungslogs gelesen. Keine Serverdateien, Datenbankdaten oder Container verändert, keine Images oder Backups gelöscht. Die Untersuchung dokumentiert einen Zeitpunkt; die laufende Feedbereinigung verändert die Zahlen. Das Protokoll liegt in einem eigenen Analysezweig; fremde Zweige bleiben unverändert.

## 2026-10-06 - Juna - Sicherheitskorrekturen über PR abschließen

**Freigabe:** Der Nutzer bestätigt Push, PR-Erstellung, Merge-Commit nach
erfolgreichen Pflichtprüfungen und anschließendes Aufräumen des eigenen Zweigs
`juna/security-report-triage` samt Worktree. Der aktuelle master einschließlich
PR #318 und #319 ist enthalten. Serverseitiger Webhook-Versand und die Trennung
des Docker-Controllers bleiben als nummerierte Backend-Issues offen.

## 2026-10-06 - Juna - bestätigte Sicherheitsbefunde korrigieren

**Auftrag:** Nach Freigabe die bestätigten Befunde im eigenen Zweig
`juna/security-report-triage` korrigieren und prüfen.

**Umsetzung:** Caddy sperrt `/mcp` und `/api/mcp` einschließlich Unterpfaden vor
der öffentlichen API-Freigabe. Alle fünf TLS-Domains erhalten HSTS mit zunächst
300 Sekunden ohne Subdomainbindung oder Preload. Webhook-Konfigurationen werden
nicht mehr im Browser gespeichert; beide früheren Speicherschlüssel werden bereits
vor Angular und der Präfix-Migration entfernt. Speichern setzt die vollständig
geladene Konfiguration des aktiven Workspace voraus. Eigene Webhook-Tests melden
den fehlenden Versand korrekt. Nodemailer gehört im Hauptprojekt nur noch zu den
Testabhängigkeiten. Die zusammengehörigen Angular-Pakete sind auf 22.2.1 aktualisiert;
die abhängigen Buildpakete einschließlich Piscina 5.3.2 sind neu aufgelöst.

**Prüfung:** Paket-Audit ohne bekannte Schwachstellen, vollständige Anwendungssuiten
(Node, DOM, Angular), 222 Workflow-Tests sowie Build, Lint und Typprüfung bestanden.
Die unabhängige Prüfung zeigte zwei zusätzliche Browser-/Workspace-Pfade; die neuen
Regressionstests reproduzierten sie vor der Korrektur und bestehen danach zusammen
mit den zugehörigen Service-, Speicher- und gerenderten Einstellungsprüfungen.
Caddy-Konfiguration validiert und mit dem installierten Image in einem kurzlebigen
Container ohne Netzanschluss gegen lokale Testgegenstellen geprüft: sechs MCP-Pfade
abgewiesen, öffentliche APIs und angemeldetes Studio erreichbar, anonymes Studio
abgewiesen, Browserroute und HSTS aller fünf Hosts erhalten. Testcontainer entfernt.
Die währenddessen gemergten PRs #318 und #319 sind aus `origin/master` übernommen;
alle Protokolleinträge bleiben erhalten. Auf den verbundenen Ständen bestehen
zusätzlich 127 Einstellungs-/Produkt-/Einkaufstests und vier Browserdialogtests
sowie die Typprüfung und der Produktionsbau.

**Offen:** Produktionskonfiguration nur gelesen, keine Auslieferung. Das installierte
Envoy verweigert MCP bereits; Caddy ergänzt die äußere Sperre. Serverseitiger
Webhook-Geheimnisspeicher und die Trennung des Docker-Controllers erfordern Backend-
beziehungsweise Betriebsarbeit. Gemäß der Frontend-Grenze liegen dafür die nummerierten
Dateien `01-webhook-secrets-and-server-dispatch.md` und
`02-docker-controller-privilege-boundary.md` auf dem Desktop unter
`Backend Issues/security-report-triage`. Keine Backend-, Schema- oder Edge-Änderung.

## 2026-10-06 - Juna - externen Sicherheitsbericht prüfen

**Auftrag:** Die Befunde des bereitgestellten Sicherheitsberichts am aktuellen Projektstand prüfen und Sicherheitsrisiken von Funktionsfehlern und Wartungsaufgaben unterscheiden.

**Analyse:** Der untersuchte Arbeitsstand `c7d5c2cc` und `origin/master` `d73e990b` enthalten dieselben für den Bericht relevanten Konfigurationen. `/mcp` umgeht im Caddyfile Authelia; eine anonyme administrative Zugriffsmöglichkeit bleibt ohne die installierte Gateway-Konfiguration unbewiesen. HSTS fehlt in den versionierten Headerkonfigurationen. Der Chromium-Pilotcontroller erhält den Docker-Socket, die Browsercontainer erhalten ihn nicht; eine reine Freigabe von Container-Erstellung und Start würde gefährliche Hostmounts nicht verhindern. Telegram-Token und Discord-Webhook-URL werden im Browser verarbeitet und lokal gespeichert; die Tabelle ist durch Workspace-RLS geschützt. Custom-Webhooks besitzen dagegen keinen tatsächlichen Versand, und ihr Test meldet ohne Anfrage Erfolg. Nodemailer wird außerhalb der Edge Function nur im Testfixture importiert und gehört dort in die Entwicklungsabhängigkeiten; das Produktionsimage enthält keinen Node-Laufzeitserver. Die beiden Marketplace-Preview-Workflows haben keinen passenden Remotezweig mehr; der Product-Preview-PR #46 ist bereits gemergt, sein lokaler Worktree besteht noch. Die beiden genannten Hilfsskripte haben keine gefundenen produktiven Aufrufer; daraus folgt bei manuellen Wartungswerkzeugen noch keine sichere Löschfreigabe. 20 ignorierte `.superpowers`-Dateien sind weiterhin versioniert. Die genannten großen Dateien existieren mit den angegebenen Größen; ihre Aufteilung ist eine Wartungsaufgabe.

**Prüfung:** Statische Quellcode-, Konfigurations-, Schema-, Lockfile- und CI-Prüfung sowie lesende GitHub-Abfragen. Die aktuellen Herstellerhinweise zu Supabase-MCP, Docker, HSTS und den betroffenen Angular-/Piscina-Paketen wurden geprüft. `npm audit --json --ignore-scripts` meldet 13 betroffene Pakete (3 kritisch, 7 hoch, 3 moderat). Ohne Entwicklungsabhängigkeiten bleibt ein hoher Angular-Router-Befund; dessen SSR-Voraussetzung fehlt bei der dokumentierten statischen Browserauslieferung. Keine Tests, Builds, Exploitversuche oder Produktionszugriffe. Kein Produktcode geändert; nur dieser vorgeschriebene Sitzungseintrag im eigenen Worktree.

## 2026-10-06 - Juna - Korrektur der Cloud-Anmeldebestätigung veröffentlichen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen
Pflichtprüfungen und anschließende Bereinigung des eigenen Zweigs. Die lokal
geprüfte Korrektur der Identitätsprüfung, der kompakte Anmeldedialog und das
bestehende Rolloutprotokoll werden gemeinsam integriert. Anschließend wird
der Browserdienst auf das geprüfte Workerimage aktualisiert; das bereits
abgenommene unveränderte Chrome-Sitzungsimage bleibt erhalten. Eine erfolgreiche
produktive Kontoverknüpfung bleibt bis zum echten Nutzerabschluss offen.

## 2026-10-06 - Juna - Cloud-Anmeldung trotz verbliebenem Loginformular bestätigen

**Auftrag:** Die manuelle Anmeldung mit SMS gelingt, aber „Anmeldung prüfen &
verbinden“ meldet weiterhin ein Anmeldeformular. Zugangsdaten kompakter darstellen
und die zugehörige Meldung direkt bei der großen Browseransicht platzieren.

**Live-Diagnose:** Im laufenden Cloudprofil sind ein alter, inaktiver Login-Tab
mit Passwortfeld und ein sichtbarer Vinted-Tab vorhanden. Die unveränderte
Identitätsprüfung bricht im Login-Tab vor dem Kontoprüfungsabruf ab. Ein eigener
begrenzter GET auf denselben Tab liefert dagegen HTTP 200 und bestätigt die
erwartete Maike-Vintage-ID. Auch der sichtbare Tab bestätigt diese Identität.
Es werden nur Status und Übereinstimmung ausgegeben, keine Zugangsdaten oder
Kontoinhalte. Die Ursache der veralteten Seite selbst ist damit nicht bewiesen.

**Korrektur:** Die feste Vinted-Kontoprüfung erhält Vorrang vor einem verbliebenen
E-Mail-Anmeldeformular. Nur HTTP 401 wertet dessen Ablehnungshinweis aus.
Mensch-Prüfung, SMS-Stufe, Domainprüfung und Validierung der Kontoidentität
bleiben erhalten. Kein Konto wird anhand eines sichtbaren Seitenelements
oder einer ungültigen API-Antwort verbunden; keine automatischen Loginversuche.

**Dialog:** Die Zugangsdaten stehen in einer eigenen kompakten Karte, auf breiten
Ansichten nebeneinander und ohne die bisherige schmale Formularbegrenzung.
Browserfehler, Fortschritt und Prüfhinweise erscheinen einmal innerhalb der
großen Vorschaukarte. Ohne Browserbild und nach bestätigter Anmeldung bleiben
Fehler weiterhin sichtbar, insbesondere beim gesonderten „Cloud aktivieren“.

**Prüfung:** 49 gezielte Worker-Tests und neun echte Browsertests mit synthetischen
Antworten bestehen. Darunter: gültige Identität trotz altem Formular, HTTP 401,
Ablehnung, HTTP 403, ungültige Identität und unveränderte Mensch-Prüfung.
47 Angular-Tests bestehen einschließlich vier gerenderter Dialogtests und
DOM-AXE-Prüfung ohne in JSDOM nicht messbaren Farbkontrast. Worker-Typprüfung
und Worker-Bau sowie Angular-Produktionsbau bestanden. Geänderte Dateien werden
formatiert und gelintet. Der erste Angular-Bau mit einem Verzeichnisverweis
auf fremde Abhängigkeiten scheiterte an Windows-Assetpfaden; mit eigenen,
unverändert aus dem Lockfile installierten Abhängigkeiten besteht er.

**Grenzen:** Noch keine Veröffentlichung dieser Korrektur. Die ursprüngliche
Cloud-Sitzung war vor dem separaten Live-Test des korrigierten Lesers bereits
geschlossen; dieser Test wurde ohne Neustart oder Kontobestätigung beendet.
Der neue Leser ist deshalb durch synthetische Browsertests, noch nicht durch
eine erneute produktive Kontoverknüpfung bestätigt. Keine Datenbankänderung,
kein Versand und keine Änderung an der lokalen Erweiterung. Der bereits
geprüfte Rolloutnachweis bleibt im selben eigenen Zweig erhalten.

## 2026-10-06 - Juna - Cloud-Browserdienst auf Hetzner aktivieren

**Freigabe:** Der Nutzer bestätigt die Aktualisierung des Browserdienstes nach
Platzprüfung. PR #317 ist integriert; Web-Version 0.303.0 sowie die separat
geprüften Worker- und Chromeimages stammen aus `d73e990b`.

**Betrieb:** Nur die beiden Imagereferenzen der bisherigen Compose-Konfiguration
werden auf feste Digests umgestellt. Vor und nach dem Wechsel: keine offenen
Browsersitzungen und keine laufenden Marketplace-Aufträge. Der unabhängige
noVNC-Pilot wird sauber gestoppt; das angemeldete Maike-Vintage-Profil bleibt
gespeichert, mit `profile.exit_type='Normal'`. Regenerierbarer, ungenutzter
Build-Cache wird freigegeben; keine Images, Volumes oder Nutzerprofile gelöscht.
Nach dem Laden der Images sind rund 5,5 GB frei. Die vorige Konfiguration und
beide bisherigen Images bleiben für eine Rücknahme erhalten.

**Firewall:** Die Regeln des separaten Piloten standen vor den regulären
Cloudregeln und verhinderten dadurch deren strikte Reihenfolgeprüfung. Nur
die vorhandenen regulären Sprungregeln werden nach vorne verschoben; sämtliche
Regeln und Sperren bleiben erhalten. Der bestehende Prüfdienst bestätigt
anschließend wieder die aktuelle Firewallfreigabe.

**Prüfung:** Der Worker ist gesund, ohne Neustarts. Öffentlicher Healthcheck
HTTP 200; Cloud-Einrichtung ohne Anmeldung HTTP 401. Ein eigener synthetischer
Browser ohne Vinted-Zugang bestätigt auf Hetzner Namespace- und Seccomp-Sandbox,
`navigator.webdriver=false`, CDP-Verbindung ohne Kontextvorgaben, native
Bildschirmaufnahme und echte Texteingabe. Geordneter Stopp mit Exitcode 0;
Testcontainer einschließlich seines flüchtigen Profils entfernt. Kein
Nachrichteninhalt, Passwort oder Browserbild gespeichert.

**Offen:** Maike Vintage ist durch diesen Rollout noch nicht in Flipbase mit
Cloud verbunden. Die reguläre Anmeldung, automatische IP-Reservierung,
Kontobestätigung und der erste lesende Abgleich sind die nächsten Live-Prüfungen.
Automatischer Zeitplan und Cloud-Schreibaktionen bleiben deaktiviert. Details
und Image-Digests stehen im bestehenden Worker-Rolloutprotokoll.

## 2026-10-06 – Juna – Einkaufskosten bei unbepreisten Artikeln korrigiert und Mehrfach-Farbauswahl ermöglicht

**Auftrag:** Bei der Einkaufserfassung soll die Kostenübersicht den aktuellen Gesamtpreis weiterhin anhand aller ausgefüllten Stückpreise berechnen, selbst wenn neu hinzugefügte Positionen noch keinen Preis tragen (statt 0 anzuzeigen). Bei der Produkterstellung soll die Farbauswahl mehrere Farben unterstützen.

**Änderung:**

- Im Einkaufsformular (`PurchaseEntryFormComponent`) berechnet `updatePurchaseBasePriceFromLines` den Warenwert nun als Summe aller vorhandenen, ausgefüllten Positionspreise (`lineTotal`). Frisch hinzugefügte, noch unbepreiste Zeilen setzen den Kopfpreis und die Kostenübersicht nicht mehr auf `null`/`0` zurück.
- Im `AttributePickerComponent` werden ausgewählte Werte bei `multiple: true` mit Farbpunkten (Swatches) dargestellt, sofern für die Farbe ein Farbwert hinterlegt ist. Klicks auf bereits gewählte Optionen schalten diese wieder ab (Toggle).
- In der Produkterstellung (`ProductDialogComponent`), der Variantenanlage (`ProductVariantCreateFormComponent`) und den Artikeldetails (`ProductDetailComponent`) ist die Farbauswahl nun für Mehrfachauswahl (`[multiple]="true"`) aktiviert.

**Prüfung:**

- Angular-Komponententests für `PurchaseEntryFormComponent`, `AttributePickerComponent`, `ProductDialogComponent`, `ProductVariantCreateFormComponent` und `ProductDetailComponent` erfolgreich ausgeführt (302 Tests in 29 Testdateien).
- Prettier-Formatierung und ESLint ohne Fehler/Warnungen abgeschlossen.
- TypeScript-Typprüfung (`npm run typecheck`) ohne Fehler.
- Angular-Produktionsbau (`ng build`) erfolgreich durchgelaufen.

## 2026-10-06 - Juna - Cloud-Chrome über PR #317 abschließen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und anschließende Bereinigung des eigenen Zweigs. Der aktuelle master f53eb483 wird übernommen; sein Feed und beide Protokollarchive bleiben erhalten. Der einzige Merge-Konflikt betrifft die vorangestellten Einträge im Änderungsprotokoll. Image-Prüfungen und produktive Cloud-Verknüpfung bleiben bis zu ihrem tatsächlichen Nachweis offen.

## 2026-10-06 - Juna - normalen Chrome in die bestehende Cloud-Einrichtung integrieren

**Auftrag:** Den erfolgreich angemeldeten eigenständigen Chrome-Pilot als
Browsermodell für Flipbase übernehmen. Vorhandene Cloud-IP-Reservierung,
Kontoprüfung, Wiederaufnahme und Abbruch verwenden; kein GoLogin-Abonnement.

**Umsetzung:** Das Sitzungsimage startet Google Chrome als eigenen Betriebssystemprozess
mit isoliertem Profil, Sandbox und Anzeige. Erst danach verbindet sich der Worker
über seinen privaten CDP-Zugang ohne Playwright-Kontextvorgaben. Der bereits geprüfte
Proxy-Weiterleiter und der reguläre Fensterschließweg werden aus dem Pilot verwendet.
Zugangsdaten gelangen über eine private Startdatei und den Eingabekanal in den Container,
nicht über Browserargumente. Die manuelle Browseransicht nutzt native Bildschirmaufnahme,
Maus und Tastatur im verifizierten Kontocontainer. Unbestätigter regulärer Browserstopp
führt zu Exitcode 75; Profil und IP bleiben dadurch reserviert. Ein altes Sitzungsimage
wird vor einem neuen Containerstart abgewiesen. Die Anmeldedialoge erhalten die
vorhandene große Dialogvariante und erklären das Einfügen von Text.

**Prüfung:** 38 gezielte Worker-Tests, Worker-Typprüfung und Worker-Bau sowie
43 Angular-Tests einschließlich vorhandener gerenderter Kontodialogprüfungen bestanden.
Geänderte TypeScript- und HTML-Dateien sind gelintet. Der Angular-Produktionsbau
besteht mit dem gebündelten Node 24.19.0; die systemweite Version 22.16.0 ist für
die aktuelle Angular-CLI zu alt. Die vollständige Worker-Suite besteht in einem
temporären Linux-Testordner mit 327 erfolgreichen und einem übersprungenen Test.
Unter Windows besteht sie mit Node 24.19.0 mit 321 erfolgreichen und sieben
übersprungenen Tests. Fünf unveränderte IPRoyal-Abgleichstests schlagen nur mit
dem alten systemweiten Node 22.16.0 fehl. Acht Tests der wiederverwendeten
Pilot-Helfer sowie YAML- und Shell-Syntaxprüfung bestehen. Das neue Browserimage erhält in CI eine Prüfung
für echte native Eingaben, Bildschirmaufnahme, Profiltrennung und regulären Stopp.

**Grenzen:** Das neue Image wurde noch nicht gebaut oder aktiviert; sein Linux-Smoke
läuft im PR. Keine produktive Cloud-Verknüpfung oder Datenbankänderung. Das angemeldete
Maike-Vintage-Pilotprofil bleibt erhalten. Anbieterprüfungen oder Sperren können
weiterhin auftreten; aus dem Pilot folgt keine Garantie für jedes Konto.

## 2026-10-06 - Juna - automatischen Seitenneuladeweg im echten Cloudbrowser prüfen

**Auftrag:** Nach dem Nutzerhinweis auf sein manuelles Neuladen den vorhandenen
HTTP-401-Wiederanlauf ohne weitere Nutzerbedienung prüfen. Das Profil und die
gespeicherten Anmeldedaten bleiben erhalten; keine produktive Kontoumstellung.

**Prüfung:** 31 bestehende Tests für Kontoimport und Identität bestanden,
einschließlich erfolgreicher 401-Erneuerung, entzogener Freigabe und Abbruch
bei 403/429. Im echten Chrome bestätigt ein kurzer Baselineabruf das Konto
mit zwei HTTP-200-Antworten ohne Neuladen. Anschließend beantwortet ein
temporärer Playwright-Test ausschließlich den ersten Profil-GET synthetisch
mit HTTP 401. Der unveränderte produktive Import lädt selbst einmal das
Hauptdokument neu; danach wird die erwartete Identität bestätigt. Fünf weitere
beobachtete API-Antworten liefern HTTP 200, keine sichtbare Mensch-Prüfung und
keine beobachteten API-Schreibaufrufe. Der Test endet vor dem erneuten Abruf
von Inseraten/Gesprächen. Die temporäre Antwortsimulation wird entfernt und
der Testclient beendet; der Browser bleibt geöffnet. Keine Datenbankzugriffe.

**Messgrenze:** Zwei Hauptframe-Navigationsereignisse bedeuten hier einen echten
Dokumentabruf plus ein weiteres Browserereignis. Die zunächst zu strenge
Testbedingung wurde auf die tatsächliche Hauptdokumentanfrage korrigiert;
der wiederholte begrenzte Test bestätigt genau einen solchen Abruf. Kein
Produktcode geändert. Dieser Test beweist den automatischen 401-Ablauf bei
gültiger gespeicherter Anmeldung, nicht die Erneuerung wirklich abgelaufener
Anmeldedaten. Die Ursache des vorherigen echten 401 bleibt offen. Der
vorhandene Synchronisierungsrunner ruft diesen Import direkt auf; die
gesonderte Identitätsprüfung des Loginablaufs ist damit nicht mitgeprüft.

## 2026-10-06 - Juna - echten lesenden Cloudabruf bei Maike Vintage prüfen

**Auftrag:** Nach der erneuten Nutzerbestätigung der angemeldeten Vinted-Startseite
den vorhandenen produktiven Kontoabruf im unabhängigen Chrome-Pilot testen.
Das Browserprofil bleibt erhalten und ist weiterhin keiner Flipbase-Verbindung
zugeordnet. Kein produktiver Workerwechsel oder Datenbankimport.

**Nachweis:** Der unveränderte kompilierte Kontoimport aus dem laufenden Worker
liefert ein Profil, fünf Inserate, acht Gespräche, 28 Nachrichten aus bereits
gelesenen Gesprächen und zwei Bewertungen. Profil, Inserate, Gesprächsübersicht
und Bewertungen sind vollständig gemäß dem bestehenden Leser. Nachrichten und
Verkäufe bleiben ausdrücklich Teilstände; ungelesene Gespräche werden nicht
geöffnet. Zwei Identitätsprüfungen bestätigen Maike Vintage vor den weiteren
Kontobereichen und nach dem Import. 17 Quellanfragen plus diese beiden Prüfungen
liefern ausschließlich HTTP 200. Keine sichtbare Mensch-Prüfung, kein beobachteter
API-Schreibaufruf und kein Datenbankzugang. Der Testclient endet ohne Browserstopp.

**Einordnung:** Eine vorherige einzelne Identitätsprüfung lieferte HTTP 401 und
wurde beendet. Im anschließenden produktiven Import trat dieser Fehler nicht
erneut auf; dessen vorhandener Seitenneuladeweg wurde deshalb nicht ausgelöst.
Der Nutzer bestätigt nachträglich, während des ersten API-Fehlers die Vinted-Seite
manuell neu geladen zu haben. Der erfolgreiche Folgeabruf ist deshalb nach
diesem manuellen Eingriff einzuordnen, nicht als Nachweis selbstständiger
Sitzungserneuerung. Eine Erneuerung der API-Anmeldung durch den Seitenaufbau
ist eine plausible Erklärung; ein eingefrorener Browser ist nicht nachgewiesen.
Die genaue Ursache des ersten 401 bleibt offen. Es wurden keine Cookies,
Passwörter, Nachrichteninhalte oder vollständigen Antworten gespeichert oder
ausgegeben. Der Test ist auf 40 API-Anfragen und 120 Sekunden begrenzt.
Cloud-Verknüpfung, Favoritenereignisse, Schreibaktionen und Dauerbetrieb bleiben
eigene Abnahmen. Keine Funktion oder Anmeldeerkennung geändert.

## 2026-10-06 - Juna - Account-Favoriten über PR #316 abschließen

**Freigabe:** Der Nutzer hat PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und das anschließende Aufräumen des eigenen Featurezweigs ausdrücklich bestätigt. PR #316 führt `juna/vinted-feed-account-favorites` nach `master`.

**Integration:** Der geprüfte Feedstand `c40f9f42` wird mit dem aktuellen master `845fc8af` verbunden. Dessen Änderungen am Cloudbrowser-Piloten und seiner Dokumentation bleiben unverändert. Die Überschneidung liegt im gemeinsam vorangestellten Änderungsprotokoll, nicht im Anwendungscode.

**Historie erhalten:** Die vollständigen Protokolle beider Stände bleiben über dieselben Git-Blobs erhalten, ohne Kürzung oder Rekonstruktion. Die Archive liegen weiterhin direkt unter `docs/`, damit ihre relativen Verweise gültig bleiben:

- [Vollständiger master-Verlauf bis zu diesem Abgleich](AI-CHANGELOG-2026-10-06-master.md), unveränderter Blob `d808f266052fb7f3d669ad341592e6d47a2f53f4`. Enthält insbesondere die zwischenzeitlichen Cloudbrowser-Arbeiten und sämtliche älteren Einträge.
- [Vollständiger geprüfter Feed-Verlauf](AI-CHANGELOG-2026-10-06-feed.md), unveränderter Blob `4543609f7f1a6895ab07f42a41212d1790818c31`. Enthält die Implementierungs- und Fehleranalyse der Account-Favoriten sowie den Abschlussnachweis.

**Prüfstand:** Der erneut gelesene Integrationslauf `37497892235` ist erfolgreich: 222 betroffene Anwendungstests, 246 Collector-Tests, 3.209 Datenbankprüfungen und neun Browserabläufe ohne Retry; Produktionsbau, Formatierung, Lint, Typprüfung und Workflow-Verträge bestanden. Die regulären vollständigen PR-Prüfungen auf dem verbundenen Stand sind noch ausstehend. Kein Merge nach master und kein Deployment wurden zu diesem Zeitpunkt durchgeführt.

**Umfang:** Persönliche Account-Favoriten je Benutzer und Workspace, ausdrücklich bestätigter Altimport ohne Wiederherstellung manuell entfernter Einträge, keine zeitliche Löschung und keine 500er-Verdrängung. Normale Funde und Referenzpreise verwenden sieben Tage. Feed mit Titelsuche vor der Seitengrenze, fünf Desktopspalten, kleineren Bildaktionen, Heute/Gestern und gemeinsamem Kategorie-Wähler mit Vinted-Datenquelle.

**Grenzen:** Die Browserprüfungen verwenden getrennte Desktop-/Tablet-Kontexte mit Testantworten. Kein echter Vinted-Abruf, kein unabhängiger zweiter Reviewer und keine Spiegelung externer Produktbilder. Ältere Hinweise auf damals offene Prüfungen bleiben in den historischen Archiven unverändert.
