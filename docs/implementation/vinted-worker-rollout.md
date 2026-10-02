# Vinted-Browserdienst: Veröffentlichung des Admin-Piloten

## Chromium-Pilot vom 02.10.2026 – eigener Cloudbetrieb

Der Nutzer hat den recherchierten Plan und Backend-Änderungen ausdrücklich
freigegeben. Der unveröffentlichte GoLogin-Server-/ISP-Entwurf wird durch eigene
Playwright-Chromium-Sitzungen ersetzt. Alte GoLogin-Profile bleiben erreichbar;
eine Umstellung erfolgt je Konto. Weder Proxykauf noch Produktionswechsel sind
Teil der lokalen Umsetzung. Konten-, Import- und Warteschlangenverträge bleiben
bestehen. Eine neue Datenbankmigration ist nicht nötig: unveränderliche
`chromium_<uuid>`-Referenzen werden bereits in die Sitzungsreservierung kopiert.

### Umsetzung und Zuständigkeiten

1. Der Profil-Agent erstellt `chromium-account-profile-registry.ts`,
   `chromium-profile-provisioner.ts`, `marketplace-profile-browser.ts` und den
   Wartungsbefehl `migrate-chromium-profiles.ts`. Private Manifeste binden Profil,
   Workspace, Verbindung, Host und Netz; fehlende Manifeste sperren den Zugriff.
   Alte GoLogin-Referenzen bleiben für den Rückweg erhalten.
2. Der Browser-Agent erstellt `chromium-profile-store.ts` und
   `chromium-persistent-browser.ts`: persistente Profile, exklusive Sperren,
   Wiederanlaufprüfung, bestätigter Stopp und bestehende Vinted-Aktionen.
3. Der Container-Agent erstellt `chromium-container-launcher.ts`, den
   Sitzungsrunner, ein eigenes Browserimage, Pilot-Compose, Host-Firewallprüfung
   und den Imageworkflow. Jeder Browser erhält ausschließlich sein eigenes
   Profil, weder Docker-Socket noch Datenbankzugänge. CDP hat keinen öffentlichen
   Port. Sandbox und Benutzer ohne Root-Rechte bleiben erforderlich.
4. Die Hauptsitzung verbindet diese Bausteine in `main.ts`, ergänzt Konfiguration
   und private Netzwerkprofile und erhält den bisherigen GoLogin-/Testmodus.
   Die Queue verarbeitet mehrere vorhandene Aufträge ohne Timer-Leerlauf;
   die globale Grenze bleibt ein aktiver Browser. Automatik und Vinted-
   Schreibfunktionen sind im Chromium-Pilot standardmäßig ausgeschaltet.
5. Zuerst gezielte negative Tests, dann Implementierung und gemeinsame Prüfung:
   Worker-Suite, Typprüfung, Bau, echte lokale Chromium-Fixtures für Sitzungserhalt
   und Kontotrennung, Format/Lint sowie Workflow-/Compose-Prüfung. Linuximage,
   Sandbox und Containerstopp werden im PR gebaut und geprüft. Kein lokaler
   Docker-Bau; künstliche Browserdaten sind kein erfolgreicher Vinted-Pilot.

### Betrieb und Abnahme

Lokale Prüfung vom 02.10.2026: 237 Workerfälle und alle 14 echten Chromium-
Browsertests bestanden; drei Linuxfälle unter Windows ausgelassen. Typprüfung
einschließlich Sitzungsrunner, Workerbau, Importprüfung, Format/Lint sowie
Workflow-/Composeprüfung bestanden. Drei im Agentreview gefundene Lücken bei
Kontobindung, verwaisten Prozessen und Stoppretry sind behoben und getestet.
Die folgenden Linux-/Vinted-Abnahmen sind dadurch noch nicht erledigt.

Die Dateien `deploy/docker-compose.marketplace-chromium-pilot.yml` und
`deploy/bootstrap-marketplace-chromium-pilot.sh` bilden einen einzelnen
vertrauenswürdigen Controller und ein isoliertes Browsernetz ab. Der Hostpfad
`/opt/flipbase-marketplace/chromium` enthält `registry`, `profiles` und `archive`;
im Controller lautet der gemeinsame Root `/var/lib/flipbase-marketplace`.
Host- und Container-Profilpfade müssen auf dieselben Dateien zeigen. Der
Controller braucht den Docker-Gruppenzugriff, Browsercontainer erhalten ihn nie.
Die Hostprüfung muss regelmäßig laufen; ein Neustart oder veralteter Nachweis
verhindert neue Browserstarts. Vorher andere Docker-Netze und das RAM-Budget
prüfen. Die Regeln dürfen fremde Dienste nicht verändern.

Die Hostvorbereitung enthält einen konkreten 30-Sekunden-Timer:
`flipbase-chromium-firewall.service` und `flipbase-chromium-firewall.timer`.
`sudo bash deploy/bootstrap-marketplace-chromium-pilot.sh setup` installiert
Script, seccomp-Profil und beide Units unter festen Flipbase-Pfaden und aktiviert
den Timer. Bereits vorhandene abweichende Dateien verursachen einen Abbruch.
Die Vorbereitung lädt zusätzlich `br_netfilter` und hinterlegt eigene
modules-load-/sysctl-Dateien für die benötigte IPv4-/IPv6-Bridge-Filterung.
Das seccomp-Profil stammt aus dem offiziellen Playwright-Repository,
Commit `ae935a43d9e376e4759548f6b3c6905c7b282333`; die Apache-Lizenz liegt daneben.
Die einzige lokale seccomp-Ergänzung erlaubt `chroot` für Chromiums eigenen
Usernamespace; Container-Capabilities werden weiterhin vollständig entfernt.
Browser bekommen dynamische IPs aus `172.30.88.128/25`; die feste Controller-IP
`172.30.88.2` bleibt außerhalb dieses Bereichs. Ein abweichendes bestehendes
Netz wird verweigert und nicht automatisch verändert.

1. Geprüften PR integrieren und beide Images vom bestätigten Merge-Commit
   veröffentlichen. Nur unveränderliche SHA-Tags oder Image-Digests verwenden.
2. Bestehenden Worker, Konfiguration und Kontozuordnungen sichern. Automatik
   pausieren, Aufträge abschließen, Worker stoppen und Runtime-Freigabe abwarten.
   Keine Sitzungs- oder Profilsperre von Hand entfernen.
   Anschließend den gestoppten alten Container mit dem bisherigen Compose
   entfernen. Der Pilot übernimmt dessen Namen `flipbase-marketplace-worker`,
   damit Caddys bestehende interne Route unverändert erreichbar bleibt.
   Image, Konfiguration und externe Netze für den Rückweg aufbewahren.
3. Host-Firewall/Timer und private Profile vorbereiten. Wartungsbefehl nur bei
   ausgeschalteter Automatik und ohne aktive Browser oder offene Aufträge nutzen.
   `migrate` erhält die bestehende Vinted-Kontoidentität, setzt die Verbindung
   für die neue Anmeldung zurück und liest die atomare Profiländerung nach.

   ```sh
   docker compose -f docker-compose.marketplace-chromium-pilot.yml run --rm \
     marketplace-worker node dist/migrate-chromium-profiles.js \
     migrate WORKSPACE_ID CONNECTION_ID EXPECTED_GOLOGIN_PROFILE_ID
   ```

   Für eine bisher unzugeordnete Verbindung gilt `pilot WORKSPACE_ID CONNECTION_ID`;
   der Rückweg heißt `rollback WORKSPACE_ID CONNECTION_ID EXPECTED_CHROMIUM_PROFILE_ID`.
   Die IDs sind vorab aus der konkreten Verbindung und Profilzuordnung zu lesen.

4. Einen Controller starten. Erst Anmeldung, Kontoidentität und manuellen Abruf
   mit direktem Netz prüfen; dann Neustart und zweites Konto. iOS Safari und
   Android Chrome müssen Anmeldung und Sicherheitsabfragen tatsächlich bedienen
   können. Bei einem Zugangshindernis wird angehalten, kein IP-Wechsel ausgelöst.
5. Erst nach erfolgreichem Pilot Automatik aktivieren und Laufzeit, Fehler,
   Speicher und Datenfrische messen. Drei-/Fünf-Minuten-Takte für 30 Konten
   sowie vollständige Nachrichten-/Angebots-/Verkaufsereignisse sind unbewiesen.
   Vinted-Schreibfunktionen brauchen separat `MARKETPLACE_CHROMIUM_WRITES_ENABLED=1`.
   Das Pilot-Compose setzt Automatik und Schreibfunktionen ausdrücklich auf `0`;
   zur Aktivierung ist eine geprüfte Compose-Override mit den jeweiligen Flags
   erforderlich. Ein Eintrag allein in der privaten Environment-Datei genügt nicht.

`MARKETPLACE_CHROMIUM_NETWORK_ID=direct` verwendet den Serverausgang. Ein optionales
privates `MARKETPLACE_CHROMIUM_NETWORK_FILE` kann feste Proxyzugänge enthalten;
diese werden weder gekauft noch automatisch verteilt oder bei Fehlern gewechselt.
Direktbetrieb spart das bisherige GoLogin-Proxykontingent, beweist aber keine
Vinted-Zuverlässigkeit auf Hetzner. Hetzners eigene Trafficbedingungen gelten weiter.

Für den Rückweg Automatik pausieren, Worker stoppen und alle Sitzungen bestätigt
beenden. `rollback` stellt ausschließlich die gespeicherte vorherige GoLogin-
Referenz wieder her; danach altes Image/Environment/Compose einsetzen. Die lokalen
Chromium-Dateien bleiben privat erhalten. GoLogin-Zugänge nicht vor erfolgreicher
Abnahme kündigen; sein Cloudbetrieb unterliegt weiterhin dem gebuchten Tarif.

## Vorbereitete Korrektur vom 01.10.2026 – Anmeldung und Standardautomatik

Die Nutzerentscheidung ergänzt den bisherigen Piloten: bestätigte Konten
werden standardmäßig alle 15 Minuten aktualisiert; die Abstände lassen sich
auf 3, 5, 10, 15, 30 oder 60 Minuten ändern. Eine bewusst gespeicherte Pause
wird nicht aufgehoben. Die Profilprüfung bekommt eine begrenzte Wiederaufnahme
der bestehenden Anmeldung bei einer initialen 401. Der bisher produktive
Worker aus `e753200e` enthält diese Änderungen noch nicht.

Zuerst die Migration `20261001173446_vinted_session_automation.sql` und die
Web-App über den geprüften PR veröffentlichen. Danach den separat
freizugebenden Workerwechsel anhand desselben Merge-Commits vorbereiten:
genau eine Instanz, keine aktiven/ungeklärten Browser und keine wartenden oder
laufenden Aufträge; Image und Konfiguration vorher sichern. Das vorhandene
Produktionsflag muss geprüft werden: ein explizites `0` überschreibt den neuen
GoLogin-Standard `1`. Für die gewünschte Automatik ist `1` erforderlich.

Nach dem Wechsel müssen Runtime und Healthcheck übereinstimmen und
`scheduledSync: { enabled: true, authorizationVersion: 2, allowedIntervals: [3, 5, 10, 15, 30, 60] }`
melden. Ein bestehendes verbundenes Konto ohne Zeitplan wird beim nächsten
Öffnen durch einen berechtigten Nutzer aktiviert; neue Bestätigungen erzeugen
den Standardzeitplan direkt auf dem Server. Keine Bestandsverbindungen werden
durch die Migration allein aktiviert. Gespeicherte Pausen bleiben bestehen.

Am ausdrücklich freigegebenen eigenen Konto prüfen: initiale Anmeldung ohne
manuelles Browseröffnen, tatsächliche erfolgreiche Aktualisierung, Folgelauf
nach 15 Minuten bei geschlossener App und Speicherung/Pause des gewählten
Abstands. Kurze Intervalle behalten Browserexklusivität und Anbieterwartezeiten;
sie garantieren deshalb keinen exakten Drei-Minuten-Takt bei mehreren Konten.
Die lokalen Tests belegen Ablauf und Schutzregeln, keine echte Anbieterlast.

Getrennte schnelle Meldungen für Nachrichten, Angebote und Verkäufe verlangen
die im [Umsetzungsstand](../superpowers/plans/2026-10-01-vinted-session-automation.md)
beschriebenen zusätzlichen Quellen- und Ereignisnachweise. Der vorhandene
Kontoabruf markiert keine ungelesenen Gespräche als gelesen und liefert
Verkäufe bisher nur teilweise. Ein kürzerer Gesamtintervall ersetzt diese
fehlenden Ereignisquellen nicht.

Für einen Rückweg zunächst alle Zeitpläne pausieren und offene Aufträge sowie
Browser sicher abschließen. Bei einem alten Worker mit Version 1 vor erneuter
Aktivierung den Abstand auf 15 Minuten zurückstellen. Die Oberfläche aktiviert
kurze gespeicherte Abstände nicht gegen einen älteren Dienst. Die Migration
bleibt erhalten; keine Zeitpläne oder Aufträge durch Löschen bereinigen.

## Historisch vorbereiteter Ausbau vom 01.10.2026 – automatische Aktualisierung

Paket 2 ergänzt dauerhaft freigegebene Leseabrufe pro Konto. Es wird lokal
geprüft; der oben dokumentierte produktive Worker bleibt zunächst unverändert.
Die neue Migration und Web-App dürfen vor dem getrennten Workerwechsel
veröffentlicht werden: alte manuelle RPCs bleiben verfügbar, fehlende neue
Healthfähigkeiten sperren die Aktivierung in der Oberfläche. Jede bestehende
Verbindung beginnt ohne automatische Freigabe.

Für den Workerwechsel gilt weiter: genau eine Instanz, keine aktiven oder
ungeklärten Browsersitzungen und keine wartenden oder laufenden Aufträge;
Image und Konfiguration vorher sichern. Erst die Migration veröffentlichen,
dann den geprüften Worker aus demselben Merge-Commit umstellen. Ohne
`MARKETPLACE_SCHEDULED_SYNC_ENABLED=1` übernimmt der neue Dispatcher nur
bewusst gestartete manuelle Abrufe. Die Vorlage setzt das Flag auf `0`.

Nach dem Wechsel müssen Runtime und Healthcheck übereinstimmen. Nur ein
bereiter Dispatcher mit aktiviertem Flag meldet
`scheduledSync: { enabled: true, authorizationVersion: 1, allowedIntervals: [15] }`.
`apiVersion: 2` allein bestätigt keine Automatik. Erst nach dieser Prüfung
wird ein bewusst gewähltes verbundenes Konto in Flipbase aktiviert. Ein
weiteres Konto und kürzere Intervalle benötigen die vorgesehenen echten
Kapazitätsnachweise; lokale Tests ersetzen diese nicht.

Der Pilot reserviert weltweit höchstens einen Browser einschließlich
interaktiver Anmeldung und ungeklärtem Stopp. Laufzeitmessungen erfassen
Phasen und die Zahl der tatsächlichen JSON-Anfragen ohne private Inhalte.
Die erneuerbare Lease gilt 90 Sekunden innerhalb einer absoluten Grenze
von zehn Minuten. Anbieterablehnung oder notwendige Anmeldung pausieren
das Konto; Rate-Limits beachten die bestätigte Wartezeit. Netzwerk- und
Serverfehler werden begrenzt wiederholt. Neustarts bewahren diese Regeln
auch bei bereits übernommener Teilantwort.

Beim Rückweg zuerst neue automatische Freigaben verhindern und laufende
Browser sicher beenden. Das neue Workerflag allein widerruft keine
gespeicherten Kontofreigaben. Vor einem Rückweg auf einen alten Worker alle
Freigaben bewusst pausieren, offene Aufträge prüfen und erst danach das
gesicherte Image starten. Die additive Migration bleibt erhalten; Zeitpläne,
Aufträge und ungeklärte Sitzungen werden nicht gelöscht oder durch bloßen
Zeitablauf freigegeben.

## Aktueller Betriebsstand vom 30.09.2026 – verlässliche Teilabrufe

Nach dem erfolgreichen PR #267 und der bereits veröffentlichten Web-App samt
Migration wurde der separat freigegebene Worker-Rollout durchgeführt. Der
Workflow [36781655658](https://github.com/GrischaTDev/flipbase/actions/runs/36781655658)
baute erfolgreich genau den Merge-Commit
`e753200e8a5aac72945e0af150fd8e4b80dff544`. Die bestehende einzelne Instanz läuft
mit `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-e753200e8a5aac72945e0af150fd8e4b80dff544`.
Der geladene Image-Digest ist
`sha256:053d819f00a1e710704bb1c0cbad4c7aa0aae8db1b44cae55046098642526673`.

Die Compose-Datei stimmt per SHA-256 mit dem geprüften Repository überein.
Vor dem Wechsel wurden `.env.before-e753200e` und
`docker-compose.before-e753200e.yml` unter `/opt/flipbase-marketplace/` mit
Modus 0600 gesichert. Das zuvor tatsächlich laufende Image
`sha-cdc9747f131b85e46f08f3e781788660d20c3c7d` bleibt für den Rückweg erhalten.
Ein Rückweg erfolgt durch Wiederherstellen der gesicherten `.env` und erneutes
Starten ausschließlich des Worker-Dienstes mit der bestehenden Compose-Datei.

Vor dem Wechsel waren 39 Browsersitzungen geschlossen; es gab keine aktive
oder ungeklärte Sitzung und keinen wartenden oder laufenden Auftrag. Diese
beiden Sperrkriterien wurden direkt vor dem Wechsel und danach erneut
bestätigt. Die Migration `20260930210350` ist installiert. Die atomare
Importfunktion ist verfügbar und ausführbar für `service_role`, aber weder
für `anon` noch für `authenticated`.

Der neue Container meldet `running` und `healthy`. Der öffentliche Healthcheck
liefert HTTP 200 mit `ok: true`, `readOnly: false` und `apiVersion: 2`;
ein anonymer POST auf `/marketplace-browser/connections/sync/start` wird mit
HTTP 401 abgewiesen. Die öffentliche Web-App liefert weiterhin denselben
Merge-Commit aus. Ein echter Kontodatenabruf wurde durch den Rollout nicht
ausgeführt; dieser Live-Nachweis bleibt separat offen. Automatische Abrufe,
neue Benachrichtigungen und lokale Inseratentwürfe folgen in den weiteren
geplanten Paketen.

## Aktueller Betriebsstand vom 28.09.2026 – Auftragsabruf

Nach gesonderter Nutzerfreigabe wurde das aus dem bereits veröffentlichten
Merge-Commit `cdbe3f5f195cdbd4267869de73cad35b13439896` erfolgreich gebaute
Worker-Image `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-cdbe3f5f195cdbd4267869de73cad35b13439896`
auf die bestehende einzelne Instanz umgestellt. Die Compose-Datei stimmte
per SHA-256 mit dem Repository überein und wurde vor dem Wechsel mit Modus
0600 gesichert. Das vorige Image `sha-1c7b65752c95653d17fe30ddb51a6bcc05d7ca1f`
bleibt für einen Rückweg erhalten.

Vor und nach dem Wechsel waren 19 Browsersitzungen geschlossen, keine aktiv
oder ungeklärt; die Auftragstabelle war leer. Der Container ist gesund. Der
öffentliche Healthcheck meldete HTTP 200 mit `ok: true`, `readOnly: false`
und `apiVersion: 2`. Ein nicht angemeldeter POST auf den neuen
Auftragsendpunkt wurde mit HTTP 401 abgewiesen. Ein echter Abruf des eigenen
Kontos ist weiterhin vom Nutzer in Flipbase zu prüfen. Der Healthcheck allein
bestätigt keine erfolgreichen Vinted-Daten.

## Aktueller Betriebsstand vom 28.09.2026 – manueller Datenimport

Nach dem grünen PR #237 wurde der Merge-Commit
`47a1529102bf16829cf448a84915d95fa0913543` automatisch als Web-App
veröffentlicht und öffentlich geprüft. Nach gesonderter Nutzerfreigabe baute
der Workflow „Publish Marketplace Worker Image“ aus genau diesem Commit das
Image `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-47a1529102bf16829cf448a84915d95fa0913543`.
Nur die bestehende Worker-Instanz wurde auf dieses Image umgestellt. Die
Compose-Datei stimmte mit dem geprüften Repository-Stand überein; eine Kopie
mit Modus 0600 und das vorige Image `sha-db63bf194c99798f8de59d761ff59782f29ba438`
bleiben für den Rückweg auf dem Server.

Vor und nach der Umstellung gab es fünf geschlossene und keine aktiven oder
ungeklärten Browsersitzungen. Der Container ist gesund. Der öffentliche
Healthcheck meldet `ok: true`, `apiVersion: 2`, `readOnly: false`; ein
anonymer Sitzungsstart liefert HTTP 401. Es wurde kein Vinted-Datenabruf und
kein Nachrichtenversand durch den Rollout ausgelöst. Ein vom Nutzer gestarteter
erster Import und der mögliche erneute HTTP-403-Fehler sind noch zu prüfen.

## Vorheriger Betriebsstand vom 28.09.2026

Nach PR #235 und gesonderter Freigabe läuft der Worker mit dem Image
`ghcr.io/grischatdev/flipbase-marketplace-worker:sha-db63bf194c99798f8de59d761ff59782f29ba438`.
Die Web-App liefert denselben Merge-Commit aus. Der Container ist gesund,
der öffentliche Gesundheitscheck meldet `ok: true`, `apiVersion: 2` und
`readOnly: false`, und ein Sitzungsstart ohne Anmeldung wird mit HTTP 401
abgewiesen. Vor und nach dem Wechsel gab es null aktive und null ungeklärte
Browsersitzungen. Das vorige Image
`sha-ece0676d1cf2e06ae01ff9dbe188857e7dfbb608` und die vorige
Compose-Zuordnung bleiben auf dem Server für einen Rückweg erhalten. Nach dem
Rollout startete der Nutzer das eigene ausstehende Konto erneut; Flipbase
meldete „Das Konto ist verbunden“. Eine lesende Datenbankprüfung bestätigte
genau eine `connected`-Verbindung und fünf geschlossene statt zuvor vier
Browsersitzungen, ohne offene Sitzung. Ein echter Codeversand und die Löschung
eines ausgewählten Kontos bleiben als Live-Nachweise offen.

Die folgende Anleitung dokumentiert die ursprüngliche Einrichtung und den
Rückweg. Ihre Bestandsaufnahme vom 27.09.2026 ist historisch.

Historischer Stand vom 27.09.2026: Die Veröffentlichung war zu diesem
Zeitpunkt noch nicht ausgeführt und brauchte die Freigabe des geprüften PRs
sowie die Freigabe zur produktiven Aktivierung.

## Lesend bestätigter Serverstand

- SSH auf dem Flipbase-Server funktioniert.
- Caddy leitet `/marketplace-browser/*` bereits an `flipbase-marketplace-worker:4179` weiter.
- Dieser Container existiert noch nicht; daher antwortet der öffentliche Endpunkt mit 502.
- Das Docker-Netz `supabase_default` enthält den Gateway-Alias `api-gw`.
- Der GoLogin-Token liegt lokal benutzergebunden verschlüsselt vor. Er gehört
  weder in Git noch in eine Chatnachricht oder einen Browserlink.
- Ein früheres Worker-Abbild enthält noch nicht diesen Anmeldeablauf. Es darf
  nicht als Veröffentlichung dieses Arbeitspakets verwendet werden.

## Schritte nach Freigabe

1. Branch über den PR mit erfolgreichen Pflichtprüfungen integrieren und den
   tatsächlichen Merge-SHA festhalten. Web-Deployment auf diesen Stand abwarten.
2. `Publish Marketplace Worker Image` auf diesem geprüften master-Stand ausführen.
   Image `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-<MERGE_SHA>` verwenden;
   Workflow und Image-SHA müssen übereinstimmen.
3. Serverordner `/opt/flipbase-marketplace` mit Modus 0700 anlegen. Die vorhandene
   Compose-Datei aus demselben Commit dorthin übertragen. `marketplace-worker.env`
   mit Modus 0600 erstellen. Nur die Variablennamen aus
   `deploy/marketplace-worker.env.example` verwenden; Supabase-Schlüssel auf dem
   Server aus der vorhandenen Konfiguration übernehmen. GoLogin-Token ausschließlich
   über den verschlüsselten SSH-Eingabekanal übertragen, nicht als Kommandoargument.
   Keine Ausgabe des Datei- oder Container-Umgebungsinhalts.
4. `FLIPBASE_MARKETPLACE_IMAGE` auf genau das SHA-Abbild setzen. Compose mit
   `config --quiet` prüfen, ausschließlich den neuen Worker starten. Bestehende
   Supabase- und Webcontainer bleiben in Betrieb. Nur eine Worker-Instanz starten.
5. Container-Health und öffentlichen `/marketplace-browser/healthz` prüfen
   (`ok: true`, `readOnly: false`). Nicht angemeldete Sitzungsstarts müssen 401
   zurückgeben. Ein normaler Workspace-Admin ohne Betreiberrolle darf keinen
   Browser starten.
6. Der Betreiber meldet sein eigenes Vinted-Konto in Flipbase an. Zusätzliche
   Sicherheitsprüfungen werden von ihm durchgeführt. Erst nach tatsächlichem
   Identitätsnachweis und erneutem Öffnen desselben Profils ist der Kontopilot
   nachgewiesen. Passwort und Browserbilder nicht in Testartefakte aufnehmen.
7. Danach Ablauf, Abbruch und erneute Anmeldung am freigegebenen Konto prüfen.
   Vor einem zweiten Konto außerdem Anbieterparallelität, Proxy-IP-Verhalten,
   Kosten und benötigte Plattformrechte prüfen. 500 MiB vorhandenes Kontingent
   ist kein Kapazitätsnachweis für 100 Nutzer.

## Abbruch und Rücknahme

Bei fehlgeschlagenem Stopp bleibt die Datenbanksperre bestehen. Keine Sperre
manuell löschen, solange ein Anbieterbrowser möglicherweise noch läuft.
Worker geordnet stoppen und dessen Wiederanlauf-Abgleich verwenden. Bei einer
Rücknahme den letzten geprüften Image-SHA verwenden; bei dieser Erstinstallation
den neuen Worker stoppen. Profilzuordnungen und Sitzungstabellen nicht entfernen.

Ein grüner Gesundheitscheck bestätigt den Dienstbetrieb. Er beweist weder einen
Vinted-Login noch Profilimport, Nachrichtenversand oder Sperrfreiheit.
