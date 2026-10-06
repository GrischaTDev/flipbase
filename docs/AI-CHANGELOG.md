# 🤖 KI-Änderungsprotokoll

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
