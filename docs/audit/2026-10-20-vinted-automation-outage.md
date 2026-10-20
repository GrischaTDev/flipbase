# Vinted-Automatik: ausgefallener Browserdienst

## Befund am 20.10.2026

Der Nutzer meldet auf der Vinted-Seite die nicht erreichbare Automatik.
Der öffentliche Statusendpunkt `/marketplace-browser/healthz` antwortet um
19:20 UTC mit HTTP 502. Die Meldung entsteht in Flipbase, wenn der Dienst
keine gültige Automatikverfügbarkeit bestätigt; daraus folgt kein belegter
Ausfall von Vinted selbst.

Die lesende Kontrolle auf dem dokumentierten Produktionsserver bestätigt:

- `flipbase-marketplace-worker` befindet sich in einer Neustartschleife.
- `flipbase-chromium-pilot-chromium-host-broker-1` endete am 20.10.2026
  um 14:20:34 UTC, also 16:20 Uhr deutscher Zeit, mit Exitcode 1.
- Im Broker steht ein unbehandeltes Socket-Ereignis `write EPIPE` beim
  Schreiben in die Standardeingabe eines Docker-Unterprozesses:
  `/app/dist/chromium-container-launcher.js:20:22`.
- Der Broker besitzt die Neustartregel `no`; der Worker verwendet
  `unless-stopped`. Um denselben Zeitpunkt meldet der Worker
  `marketplace_browser_start_failed` und `marketplace_runtime_lost/run_failed`.
- Eine Browser-Sitzung ist noch als laufend vorhanden. Sie wurde nicht
  manuell beendet oder entfernt. Ein wieder gestarteter Broker muss der
  bestehenden Worker-Recovery die kontrollierte Bereinigung ermöglichen.
- Kein vom Container gemeldeter Speichermangel: `OOMKilled=false`.
  Auf dem Host sind rund 25 GiB Plattenplatz und 4 GiB RAM verfügbar.
  Web-App und übrige geprüfte Produktionsdienste laufen.

Der laufende Worker verwendet weiterhin das zuletzt dokumentierte Abbild
`2a33fcc1d04c`; das Broker-Abbild beginnt mit `b3ec4a238f0c`, das
Sitzungsabbild mit `84ddef6d0852`. Die aktive Compose-Datei ist
`/opt/flipbase-marketplace/chat-prices-session-5880c744/compose.release.json`.

## Vorbereitete Wiederherstellung und Freigabegrenze

Konkreter nächster Schritt ist ausschließlich `docker start` für den
vorhandenen, beendeten Broker. Images, Einstellungen, Kontoprofile und
Freigaben bleiben dabei gleich. Die bestehenden freigegebenen
Automatikaufgaben können dadurch wieder anlaufen.

Die automatische Freigabeprüfung hat den ersten Startversuch vor Ausführung abgelehnt:
Eine Problemmeldung sei keine ausdrückliche Freigabe für den Neustart eines
Produktionsdienstes mit möglichen Automatikaktionen. Die ausdrückliche
Freigabe wurde deshalb beim Nutzer angefragt. Bis zu deren Eingang wurde
keine Produktionsänderung vorgenommen. Anschließend hat der Nutzer Diagnose
und Neustart ausdrücklich freigegeben. Der bestehende Broker wurde um
19:22 UTC gestartet und lief bei der anschließenden Kontrolle.

Die erste Kontrolle unmittelbar danach liefert weiterhin HTTP 502. Eine
schreibgeschützte Datenbankabfrage um 19:23:13 UTC zeigt die beim vorigen
Fehlstart beanspruchte Workerberechtigung noch bis 19:23:50 UTC gültig.
Ein neuer Prozess darf vorher keine parallele Runtime übernehmen.
Eine Browser-Sitzung steht auf `stopping`. Von drei gespeicherten Plänen
sind zwei bereits pausiert (`access_revoked`, `cleanup`); ein Plan ist aktiv
und seit dem Ausfall überfällig. Diese Pausen wurden nicht manuell aufgehoben.

## Erfolgreiche Wiederherstellung

Die Abschlusskontrolle um 19:29 UTC bestätigt:

- Broker läuft; Worker seit fünf Minuten gesund.
- Öffentlicher Status HTTP 200, `ok=true`, `readOnly=false`,
  `scheduledSync.enabled=true`, Freigabeversion 2 und erlaubte Abstände
  3, 5, 10, 15, 30 und 60 Minuten.
- Worker-Epoch 228 mit aktuellem Heartbeat und gültiger Berechtigung.
- Keine Sitzung mehr im Zustand `active` oder `stopping`; die vorhandene
  Recovery hat die verwaiste Browser-Sitzung bereinigt.
- Ein regulärer Abruf erfolgreich: neuer Erfolgszeitpunkt 19:24:52 UTC,
  also 21:24:52 Uhr deutscher Zeit, null aufeinanderfolgende Fehler.
  Profil, Inserate, Gespräche, Verkäufe, Speichern und Bereinigung wurden
  vollständig abgeschlossen. Nächster Abruf laut Plan 19:34:59 UTC.
- Die beiden zuvor pausierten Pläne sind unverändert pausiert.

Im bestehenden angemeldeten Tab wurde die bereits angebotene verpflichtende
Aktualisierung auf 0.365.2 ausgeführt. Danach zeigt der Kleiderschrank für
„Wiehen Store“ elf Inserate, grünen Aktualisierungsstand 21:24 Uhr und keine
Meldung über eine nicht erreichbare Automatik. Sichtbeleg
`vinted-restored.png` in der Visualisierungsablage dieser Sitzung gespeichert.

## Dauerhafte Fehlerkorrektur

Der Quellpfad `services/marketplace-worker/src/chromium-container-launcher.ts`
schreibt über `child.stdin?.end(...)` in Docker-Unterprozesse, ohne dort einen
eigenen Fehlerhandler zu registrieren. Ein geschlossener Eingabekanal kann so
den ganzen Broker beenden. Eine dauerhafte Korrektur braucht einen gezielten
Fehlerfalltest und einen geprüften separaten Broker-Rollout. Ein bloßer Start
behebt diese Fehlerbehandlung nicht. Die absichtlich fehlende Neustartregel
ist getrennt unter Beachtung der Browser-Recovery zu bewerten.

Keine Quellcode-, Schema-, Rechte- oder Imageänderung im Rahmen dieser
Diagnose. Keine Nachricht, kein Angebot und keine Veröffentlichung manuell
ausgelöst. Die Prüfung bestand aus Quellvergleich, HTTP-Status,
Containerzuständen, begrenzten Logs und Hostressourcen; keine neue
Anwendungstestsuite erforderlich.

## Vorbereitete dauerhafte Korrektur

Nach ausdrücklichem Auftrag zur dauerhaften Fehlerbehebung wurden beide
Docker-Befehlswege mit einem Fehlerhandler am Eingabekanal abgesichert.
Der Fehler bleibt bis zum Prozessabschluss gespeichert. Die Operation wird
auch dann abgewiesen, wenn Docker anschließend Exitcode 0 meldet. Private
Eingaben und Anbieterfehlermeldungen erscheinen nicht in der öffentlichen
Fehlermeldung. Ein weiterer Aufruf im selben Launcher bleibt möglich.

Die Compose-Vorlage startet den Broker bei einem unerwarteten Prozessabbruch
mit `unless-stopped` wieder. Eine ausdrücklich gestoppte Instanz bleibt
gestoppt. Die vorhandene Autorisierung und bestätigte Bereinigung von
Browser-Sitzungen werden dadurch nicht ersetzt oder gelockert.

Die zwei neuen Regressionen waren vor der Korrektur mit unbehandeltem
`EPIPE` rot. Danach alle 28 Launcher-Fälle erfolgreich, außerdem vollständige
Worker-Prüfungen unter Windows (692 bestanden, acht übersprungen) und Linux
mit Node 22.23.2 (699 bestanden, eine übersprungen). Typen, Worker-Bau,
gezieltes Lint, Format und die tatsächlich aufgelöste Compose-Konfiguration
wurden geprüft. Die 35 Prüfungen der Testauswahl bestehen. Die breite
Pflicht-CI wegen der Deploymentdatei bleibt erforderlich.
Ein unabhängiger Review von Prozessabschluss, Zeitlimits, Bereinigung,
Broker-Neustart, Tests und Datenschutz ergab keinen relevanten Befund.

Der Fix liegt auf `juna/vinted-broker-pipe-recovery` mit Basis `a538c505`.
Er ist noch nicht produktiv. Die lokale Docker-Engine ist beendet;
Imagebau und echter Broker-/Browser-Smoke müssen vor Veröffentlichung
erfolgreich abgeschlossen werden.

Für den Rollout ausschließlich das geprüfte Broker-Abbild sowie dessen
Neustartregel in einer gesicherten Kopie der aktiven Compose-Konfiguration
ändern. Vorher laufende Aufträge geordnet beenden; bestehende Browserprofile,
IP-Zuordnungen, Schreibfreigaben und die tatsächlich verwendeten Worker- und
Sitzungsabbilder erhalten. Nachher Abbild, Neustartregel, aktuellen
Worker-Heartbeat, öffentlichen Status und einen erfolgreichen regulären
Abruf prüfen. Keine manuell ausgelöste Nachricht oder Veröffentlichung als
Test verwenden. Der Neustart aus dem ersten Abschnitt war die bereits
ausdrücklich freigegebene Wiederherstellung, kein Rollout dieser Korrektur.
