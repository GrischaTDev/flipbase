# Vinted-Browserdienst: Veröffentlichung des Admin-Piloten

## Erster geplanter Proxyabruf vom 07.10.2026: erfolgreich

Der Nutzer aktiviert Maikes Zeitplan in Flipbase: 15 Minuten,
Berechtigungsversion 22, nächster Termin zunächst 08:58:51 UTC.
Ohne zusätzliche manuelle Aktualisierung startet der Auftrag mit
`authorization_kind=scheduled_read` um 08:59:04.796 UTC und endet
um 08:59:11.912 UTC erfolgreich. Der Importzeitpunkt ist 08:59:08.540 UTC.
Profil, Inserate, Gesprächsübersicht und Bewertungen sind vollständig;
Nachrichten und Verkäufe fehlerfreie Teilstände. Keine erneute Anmeldung.

Nach Abschluss bestätigt die Prüfung die unveränderte Profilbindung
`iproyal-pilot-a`, einen gesunden Worker und keine offenen Cloudaktionen,
Browsersitzungen oder regulären Browsercontainer. Maikes Zeitplan bleibt
aktiviert, ohne Pausengrund, mit nächstem Termin 09:14:11.913 UTC.
Andere Kontoterminpläne und Schreibaktionen bleiben deaktiviert.
Der Nachweis gilt für den ersten regulären automatischen Proxyabruf;
ein Langzeitlauf und vollständige Nachrichten-/Verkaufsabdeckung stehen aus.

## Proxy-Zeitsteuerung vom 07.10.2026: Dienst freigegeben, Konto noch pausiert

Nach Veröffentlichung von PR #326 meldet der Nutzer Maike Vintage erneut an.
Die abgeschlossene Cloud-Einrichtung und das unveränderliche Profilmanifest
bestätigen nun `networkId=iproyal-pilot-a`. Ein zusätzlicher Proxy-Ausgangstest
bestätigt `DE` und den registrierten IP-Fingerabdruck, ohne Vinted aufzurufen.
Der manuelle Kontoabruf vom 08:36:52 bis 08:36:57 UTC endet erfolgreich;
Nachrichten und Verkäufe bleiben fehlerfreie Teilstände.

Die neue private Konfiguration
`/opt/flipbase-marketplace/cloud-proxy-scheduled-20261007/` unterscheidet sich
vom aktiven Stand `cloud-proxy-release-3ff25694` ausschließlich durch
`MARKETPLACE_SCHEDULED_SYNC_ENABLED=1`. Der Worker bleibt auf Digest
`sha256:9a3684d5c9ef868b1730c90e41ce5978e7b00c25a5af7f45d3663cf4f161b260`,
Schreibaktionen bleiben deaktiviert. Vor dem geordneten Worker-Neustart sind
keine offenen oder ungeklärten Cloudaktionen, Browsersitzungen oder regulären
Browsercontainer vorhanden. Hostbroker und Sitzungsimage bleiben unverändert;
Gesundheitsprüfung und aktuelle Firewallfreigabe mit Policy `v2` bestehen.

Maikes Zeitplan bleibt `enabled=false`, Abstand 15 Minuten, ohne nächsten
Termin, Pausengrund oder Fehlerserie. Der Nutzer kann in Flipbase über
Kontoeinstellungen „Automatik fortsetzen“ wählen. Erst ein anschließend
erfolgreicher geplanter Abruf belegt den automatischen Proxybetrieb.
Für einen Rückweg bleibt `cloud-proxy-release-3ff25694` mit global
deaktivierter Zeitsteuerung erhalten. Vor einem Rückwechsel den Kontoterminplan
pausieren und laufende Cloudarbeit vollständig beenden.

## Umstellung älterer Cloudkonten vom 07.10.2026: geprüft, noch nicht veröffentlicht

Der vorhandene Cloud-Einrichtungsablauf unterstützt nun bereits verbundene
Cloudkonten ohne abgeschlossene IP-Reservierung. In der Kontokarte öffnet
„Cloud-IP einrichten“ diesen Ablauf. Der Server reserviert eine freie,
verifizierte deutsche ISP-IP; bei fehlender Kapazität bleibt das Konto
unverändert. Automatisches Nachbestellen gehört weiterhin nicht dazu.

Eine erfolgreiche Reservierung pausiert den bisherigen Zeitplan und widerruft
dessen Abrufberechtigung. Laufende oder ungeklärte Aktionen verhindern den
Wechsel. Nach bestätigtem Browserstopp wird das alte Profil archiviert und
ein eigenes Profil mit der reservierten IP erstellt. Die Anmeldung muss die
bisherige Vinted-Identität bestätigen; Kontoverbindung und gespeicherte Daten
bleiben erhalten. Ein Abbruch startet den alten Zeitplan nicht wieder.
Manuelle und geplante Chromiumstarts ohne bestätigte IP-Zuordnung werden vor
dem Browserstart abgewiesen.

Die erzeugte Migration `20261006232708_legacy_cloud_proxy_setup.sql` ersetzt
ausschließlich zwei Einrichtungsfunktionen. Ihr transaktionales Replay auf einer
separaten Datenbank mit dem bisherigen Migrationsstand besteht 76 Assertions.
Funktionsrechte und API-Typen bleiben erhalten; Worker-Suite, gezielte
Angular-/Workflow-Tests, Typen, Lint, Format und Angular-Bau bestehen.

Nach dem freigegebenen grünen PR Web-App, Migration und Worker aus demselben
Merge-Stand veröffentlichen. Dabei die aktuelle Broker-/Firewall-Konfiguration
beibehalten; Maikes Zeitplan, globale Zeitsteuerung und Schreibaktionen bleiben
zunächst ausgeschaltet. Dann in Flipbase bei Maike „Cloud-IP einrichten“ wählen,
im neuen Browserprofil anmelden und die Identität bestätigen. Ein SMS-Code wird
vom Nutzer eingegeben. Erst nach Prüfung der reservierten IP, des tatsächlichen
Profilausgangs und eines erfolgreichen manuellen Abrufs werden geplante Abrufe
wieder freigegeben. Einen erfolgreichen Proxybetrieb belegen erst diese
Live-Prüfungen, nicht die isolierten Tests.

## Geplanter Abrufpilot vom 07.10.2026: Zeitsteuerung bestätigt, Proxyzuordnung offen

Der Nutzer gibt einen ausschließlich lesenden Pilot für Maike Vintage frei.
Bei der Vorprüfung ist genau ein Zeitplan gespeichert und kein anderes
Cloudkonto verbunden. Die aktuelle gehärtete Worker-/Broker-Konfiguration
wird direkt am Host bestätigt und erhalten:

- Worker:
  `ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:9310654925d865ded00a0d45b5fcc97741ef3a6af8aeedad2b35351283992de9`
- Chrome-Sitzung:
  `ghcr.io/grischatdev/flipbase-chromium-session@sha256:9846105f9766f2c640c027c6090dff3c6dccee51b9336cbc0a87dfcef0f9588c`
- Aktive und nach dem Pilot wiederhergestellte Konfiguration:
  `/opt/flipbase-marketplace/security-release-7fc98d60/`

Unter `/opt/flipbase-marketplace/scheduled-pilot-20261007/` liegt eine private
Konfigurationskopie. Ein Vergleich der vollständig aufgelösten Compose-Daten
bestätigt als einzige Änderung `MARKETPLACE_SCHEDULED_SYNC_ENABLED=1`.
Schreibaktionen bleiben mit `MARKETPLACE_CHROMIUM_WRITES_ENABLED=0` deaktiviert.
Der Worker erhält keinen Docker-Socket; der bestehende Hostbroker wird nicht
neu gestartet. Firewallfreigabe mit Policy `v2`, passender Boot-ID und aktuellem
Zeitstempel sowie öffentliche HTTP-200-Gesundheitsprüfung sind bestätigt.

Maikes Zeitplan wird in den authentifizierten Kontoeinstellungen zunächst
auf drei Minuten gestellt und aktiviert. Der eigene Flipbase-Testtab ist
während der geplanten Abrufe geschlossen; andere Nutzer-Tabs werden nicht
geschlossen. Es wird keine manuelle Aktualisierung gestartet.

| Geplanter Abruf, UTC | Abschluss, UTC | Ergebnis                              |
| -------------------- | -------------- | ------------------------------------- |
| 06.10., 22:50:22.756 | 22:50:27.432   | erfolgreich gespeichert und bereinigt |
| 06.10., 22:53:39.970 | 22:53:44.810   | erfolgreich nach Worker-Neustart      |

Der Neustart endet um 22:52:00 UTC. Vor dem Stopp sind keine Sitzungen,
Aufträge oder Browsercontainer aktiv; Exitcode 0, kein OOM. Nach dem Start
bleiben Zeitplan, Anmeldung und Image-Digests erhalten. Beide geplanten
Abrufe liefern Profil, Inserate, Gesprächsübersicht und Bewertungen
vollständig. Nachrichten und Verkäufe bleiben fehlerfreie Teilstände.
Nach Abschluss gibt es keine offenen Sitzungen, laufenden Aufträge oder
übrig gebliebenen regulären Browsercontainer.

Die zusätzliche Prüfung der tatsächlichen Profilbindung findet eine
Abweichung: Maikes unveränderliches Profilmanifest enthält `networkId=direct`.
Für die Verbindung existiert kein Datensatz in `marketplace_cloud_setups`.
Der registrierte Zugang `iproyal-pilot-a` ist aktiviert, verifiziert, deutsch,
dediziert und noch gültig, aber nicht das Netzwerk dieses Profils. Die
erfolgreichen Abrufe beweisen daher keinen Betrieb über den gekauften Proxy.
Die IP-Prüfung hätte bereits vor der Aktivierung erfolgen müssen.

Der Pilot wird nach zwei Abrufen beendet. In den normalen Kontoeinstellungen
ist `enabled=false`, `interval_minutes=15`, `next_due_at=null` gespeichert.
Die vorherige Sicherheitskonfiguration läuft wieder gesund mit global
deaktiviertem Zeitplan und deaktivierten Schreibaktionen. Browserprofil,
Kontoverbindung und IP-Bestand werden weder gelöscht noch von Hand umgebunden.
Die temporäre Pilotkonfiguration bleibt als Nachweis erhalten, ist aber inaktiv.

Vor einer Wiederaufnahme muss das ältere Cloudprofil über einen unterstützten
Kontowechsel in die reguläre IP-Reservierung überführt werden. Der aktuelle
Einrichtungsablauf akzeptiert bestehende lokale Konten, lehnt bereits
verbundene Cloudkonten ohne Einrichtungsdatensatz ab. Das Manifest manuell zu
ändern oder die vorhandene Anmeldung ungeprüft auf eine andere IP zu setzen
ist kein abgenommener Übergang.

Lokal bestehen 60 Tests aus `marketplace-sync-dispatcher`,
`marketplace-sync-runner`, `supabase-marketplace-operation-store` und
`vinted-account-import`. Geprüft sind unter anderem 401, sofortiger Abbruch
bei 403/429 ohne weitere Quellanfrage, Rate-Limit-Pause, entzogener Zugriff,
Kontogrenzen und geordneter Dienstabschluss. Keine echten Anbieterfehler
werden dafür im produktiven Konto provoziert. Die folgenden älteren
Rolloutabschnitte dokumentieren historische Stände und sind kein Rückweg
aus der aktuellen Sicherheitskonfiguration.

## Aktivierter Chrome-Browserdienst vom 06.10.2026

Nach ausdrücklicher Freigabe zur Aktualisierung läuft der Worker aus dem
Merge-Commit `d73e990b96a54f8fa4a8fbe72b0a390bbc242b3d` von PR #317. Die Web-App
liefert diesen Stand als Version 0.303.0. Beide separaten Image-Workflows haben
ihre jeweiligen Prüfungen erfolgreich abgeschlossen:

- Worker, Workflow `37506513725`:
  `ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:b91935aa907d4d2855e456ef1f42e0d3c1d55a4ff02bae3c6c26d75126433f6c`
- Chrome-Sitzung, Workflow `37506518448`:
  `ghcr.io/grischatdev/flipbase-chromium-session@sha256:b0b9c8c7e33b3166807846f608da9a3878d05a45ac452bf32609cb5ac44e7c1c`

Die aktive Compose-Konfiguration liegt unter
`/opt/flipbase-marketplace/pilot-d73e990b/`. Ihr aufgelöster Inhalt wurde mit
`pilot-b343611f` verglichen: ausschließlich Workerimage und Sitzungsimage sind
geändert. Der geheime Workerzugang bleibt unverändert; beide Umgebungsdateien
haben Modus 0600. Es läuft weiterhin genau ein Worker. Automatische Zeitpläne
und Cloud-Schreibaktionen sind weiterhin deaktiviert.

Vor und nach dem Wechsel wurden keine offenen Browsersitzungen und keine
laufenden Marketplace-Aufträge festgestellt. Der eigenständige noVNC-Pilot
und sein Wächtersystem sind gestoppt; das angemeldete Profil unter
`/opt/flipbase-marketplace/cloud-browser-pilot/profile/chrome` bleibt erhalten.
Chrome bestätigt `profile.exit_type='Normal'`. Der einzige registrierte
IPRoyal-Zugang war nach dem Rollout weiterhin frei. Die Anmeldung im Pilot
ist damit noch keine reguläre Cloud-Verknüpfung in Flipbase.

### Speicher und Firewall

Vor dem Download waren nur 1,6 GB frei. Ausschließlich ungenutzter,
regenerierbarer Docker-Build-Cache älter als eine Stunde wurde freigegeben;
Images, Volumes und Browserprofile blieben erhalten. Nach dem Laden beider
Images waren rund 5,5 GB frei. Die veröffentlichten Digests wurden jeweils
beim Download und anhand der laufenden Konfiguration bestätigt.

Die Abschlussprüfung fand keine aktuelle Firewallfreigabe: Der separate
Pilot hatte seine Sprungregeln vor die regulären Cloudregeln eingefügt.
Damit scheiterte deren bestehende strikte Reihenfolgeprüfung. Die vorhandenen
Sprünge zu `FLIPBASE_CHROMIUM` und `FLIPBASE_CHROMIUM_HOST` stehen nun wieder
zuerst. Vorher-/Nachher-Vergleich bestätigt dieselbe vollständige Regelmenge;
keine Sperre wurde entfernt. Der reguläre Systemdienst erzeugt anschließend
wieder die aktuelle Freigabe unter `/run/flipbase/`.

Ein erneuter Start des eigenständigen Piloten kann diese Reihenfolge wieder
ändern. Für die reguläre Cloud-Einrichtung bleibt er deshalb gestoppt. Bei
einer späteren Wiederaufnahme muss die Firewallprüfung erneut abgenommen
werden; seine IP darf dann keinem regulären Cloudkonto zugeordnet sein.

### Tatsächlich ausgeführte Prüfungen

Der Worker ist gesund, ohne Neustart. Der öffentliche Endpunkt
`https://app.flipbase.de/marketplace-browser/healthz` liefert HTTP 200 mit
`ok=true`, `readOnly=false` und deaktiviertem Zeitplan. Ein anonymer POST auf
`/marketplace-browser/cloud-setups/begin` wird mit HTTP 401 abgewiesen.

Ein separater synthetischer Browser im regulären Containernetz bestätigt auf
Hetzner Namespace- und Seccomp-BPF-Sandbox, `navigator.webdriver=false` und die
Verbindung vom Worker ohne Playwright-Kontextvorgaben. Native Bildschirmaufnahme
liefert ein gültiges JPEG; Maus, Texteingabe und Backspace werden im Testfeld
bestätigt. Geordneter Stopp: Exitcode 0, kein OOM. Der eigene Testcontainer
mit ausschließlich flüchtigem Profil wird danach entfernt. Kein Vinted-Login,
keine produktive IP-Reservierung und kein Versand in diesem Test.

### Nächste Live-Prüfung und Rückweg

In Flipbase beim bestehenden lokalen Konto Maike Vintage „Auf Cloud wechseln“
und anschließend „Direkt im Browser anmelden“ wählen. Die oberen Zugangsfelder
bleiben dafür leer. Anmeldung und SMS erfolgen in der Browseransicht des
Flipbase-Dialogs; danach „Anmeldung prüfen & verbinden“. Erst eine erfolgreiche
Kontobestätigung beweist die reguläre Cloud-Verknüpfung. Anschließend IP-Zuordnung,
Kontomodus, lokale Freigabe und den ersten lesenden Abgleich prüfen. Kein
automatischer Nachrichtenversand oder Favoritenauftrag als Teil dieser Abnahme.

Für einen Rückweg bleiben `pilot-b343611f`, das Workerimage `sha-b343611f…` und
das vorherige Sitzungsimage `sha-02dbcfbd…` erhalten. Vor einer Rücknahme neue
Cloud-Sitzungen und laufende Aufträge prüfen und geordnet beenden lassen;
Profil-/IP-Zuordnungen nicht löschen. Die vorige Compose-Konfiguration startet
anschließend wieder denselben Worker. Das unabhängige Maike-Vintage-Profil
wird dabei weder übertragen noch ersetzt.

## Isolierter normaler Chrome-Pilot vom 06.10.2026

Der freigegebene Vergleich liegt unter `tools/cloud-browser-pilot/`. Er startet
den regulären Google-Chrome für Linux direkt als Betriebssystemprozess, ohne
Playwright, Browser-Injektionen oder GoLogin. Xvfb, Openbox, x11vnc und noVNC
übertragen das laufende Bild und echte Desktop-Eingaben. Das eigene Profil liegt
unter `/opt/flipbase-marketplace/cloud-browser-pilot/profile/chrome`; weder lokale
Cookies noch bestehende Cloudprofile werden kopiert. Linux bleibt Linux: dieser
Versuch bildet keinen Windows-Browser nach und beweist keine Sperrfreiheit.

Der private Proxy wird aus der vorhandenen Serverdatei übernommen. Im Container
liegt ausschließlich der ausgewählte Zugang. Ein lokaler HTTP-Forwarder ergänzt
die Proxy-Authentifizierung, ohne HTTPS zu entschlüsseln. Die Container-Firewall
erlaubt nur die konkrete Proxyadresse und deren Port. Direkter Internetzugang,
Hostdienste und andere Container bleiben gesperrt. Der Browser läuft als UID
1000 mit Sandbox, privatem Profilmount und ohne Docker- oder Datenbankzugriff.

Die vorhandene IP muss beim Start im regulären Bestand `free` sein. Der Pilot
legt keine produktive Konto- oder IP-Reservierung an. Ein eigener 15-Sekunden-
Wächter beendet ausschließlich den Pilot, wenn die IP belegt oder die Firewall
nicht mehr nachweisbar ist. Das ist kein atomarer Ersatz für die spätere
Kontoreservierung: Während dieses manuellen Vergleichs keine zusätzliche
Cloud-Einrichtung in Flipbase starten. Die bestehenden Kontoverknüpfungen und
der lokale Auftragsexecutor werden durch diesen Browser nicht verändert.

### Start und Zugang

Nur die geprüften Tooldateien nach
`/opt/flipbase-marketplace/cloud-browser-pilot/` übertragen; keine Geheimnisse
in Git oder Build-Kontext aufnehmen. Die dortige `pilot.sh` erlaubt nur diesen
absoluten Betriebsordner und prüft die Eigentumsmarkierung vorhandener Container.

```sh
chmod 700 /opt/flipbase-marketplace/cloud-browser-pilot/pilot.sh
/opt/flipbase-marketplace/cloud-browser-pilot/pilot.sh build
/opt/flipbase-marketplace/cloud-browser-pilot/pilot.sh start
/opt/flipbase-marketplace/cloud-browser-pilot/pilot.sh status
```

`build` installiert Chrome aus dem signierten offiziellen APT-Repository.
Seine tatsächliche Version und Image-ID beim Vergleich festhalten; der Anbieter
kann `stable` ändern. Kein Produktivimage oder laufender Worker wird ersetzt.

Auf dem autorisierten Windows-Rechner öffnet `tools/cloud-browser-pilot/open-pilot.ps1`
den SSH-Tunnel im Hintergrund und zeigt dessen Prozess-ID. Anschließend
`http://127.0.0.1:6088/vnc.html?autoconnect=1&resize=scale` öffnen. Der Serverport
ist ausschließlich an Loopback gebunden; weder VNC noch CDP haben einen öffentlichen
Port. Der SSH-Schlüssel schützt den Zugang. noVNC benötigt im internen Container
kein separates Passwort. Über die Seitenleiste lassen sich Zwischenablage,
Vollbild und Skalierung bedienen. Browserinteraktion findet innerhalb des
übertragenen Desktops statt.

### Vergleich in getrennten Stufen

1. Neutralen HTTPS-IP-Test und die Bedienung prüfen. Einen synthetischen
   Testcookie setzen, Chrome geordnet stoppen und dasselbe Profil erneut starten.
   Der Cookie muss erhalten bleiben. Das bestätigt noch keinen Vinted-Login.
2. Im manuellen Modus öffnet der Nutzer Vinted und erledigt Datenschutzbanner,
   Login, Mensch-Prüfung und SMS selbst. Keine automatischen Wiederholungen bei
   einer Sperre. Die sichtbare angemeldete Identität und anschließend deren Erhalt
   nach geordnetem Neustart prüfen. Passwortspeicherung ist nicht erforderlich.
3. Erst nach erfolgreicher manueller Anmeldung `pilot.sh stop`, dann
   `pilot.sh debug`: gleicher Browser und gleiches Profil, zusätzlich nur ein
   lokaler Debugport. Zunächst erneut ohne angeschlossenen Controller prüfen.
   Danach Playwright ausdrücklich lesend anbinden. Damit werden Debugport und
   tatsächliche Instrumentierung getrennt verglichen. Kein Sync oder Versand.
4. Die vorhandene Erweiterung separat untersuchen. Manifest 1.7.0 ist technisch
   im normalen Chrome installierbar, aber die bestehende Freigabe setzt
   `execution_mode='local'` voraus. Ein unverändertes produktives Verknüpfen im
   Serverbrowser könnte den lokalen Executor ersetzen und anschließend Aufträge
   übernehmen. Deshalb im Vergleich zunächst nur ungebunden installieren; einen
   sicheren Cloud-Executor erst mit eigener serverseitiger Bindungsprüfung und
   ausdrücklicher Abnahme integrieren. Die Erweiterung wird hier nicht verändert.

```sh
# Geordneter Stopp; das Testprofil bleibt erhalten.
/opt/flipbase-marketplace/cloud-browser-pilot/pilot.sh stop
```

Den lokalen SSH-Prozess anschließend anhand der beim Start ausgegebenen ID
beenden. Pilotprofile nicht ungeprüft löschen: nach einem echten Login enthalten
sie vertrauliche Sitzungsdaten. Profil-/IP-Übernahme in den regulären Cloudbetrieb
und eine produktive Kontoumstellung sind weitere Schritte nach diesem Nachweis.

Grundlagen: [Google APT-Signaturen](https://www.google.com/linuxrepositories/),
[noVNC-Bedienung und Einbettung](https://novnc.com/noVNC/docs/EMBEDDING.html).

**Technischer Nachweis auf Hetzner:** Regulärer Chrome 154.0.8037.97, UID 1000,
geschlossener Debugport und privater Loopback-Port 6088. Der sichtbare HTTPS-Test
bestätigt den bekannten IPRoyal-Ausgang `196.44.122.35` und `DE`. Ein direkter
TCP-Versuch zu einem anderen öffentlichen Ziel scheitert. Acht synthetische
Prüfungen bestehen unter Windows und im Linuximage als UID 1000. Der über eine
neutrale Testseite gesetzte Cookie ist nach Neustart weiterhin im Browser
lesbar. Die Fensterverwaltung schließt Chrome vor den übrigen Desktopdiensten;
danach ist `profile.exit_type='Normal'` bestätigt. Ein unbestätigter Stopp
verhindert den automatischen Neustart des Pilotcontainers. Die IP bleibt im
produktiven Bestand frei; Kontozuordnungen wurden nicht geändert. Vor der
manuellen Kontoanmeldung die lokale Automatik des Testkontos pausieren.
Der folgende echte Anmeldevergleich ergänzt diesen technischen Nachweis.

### Echter Anmeldevergleich mit Maike Vintage

Der Nutzer wählt ausdrücklich **Maike Vintage**, um sein Hauptkonto nicht für
weitere Versuche zu verwenden. Er bestätigt erfolgreiche Anmeldung mit Passwort
und SMS-Code im Serverbrowser, ohne Slider. Die angemeldete Oberfläche ist
anschließend sichtbar. Für diesen Vergleich wurden keine Zugangsdaten oder
Sitzungscookies exportiert.

Die reguläre Fensterverwaltung schließt das authentifizierte Profil sauber
(`profile.exit_type='Normal'`). Nach dem Neustart desselben Profils zeigt die
Vinted-Startseite weiterhin die Kontofunktionen statt des Loginbuttons; eine
erneute SMS oder Mensch-Prüfung ist nicht erforderlich. Dasselbe gilt nach
einem weiteren Neustart mit aktiviertem, ausschließlich lokal erreichbarem
Debugport, zunächst ohne angeschlossenen Controller.

Playwright 1.63.0 und die kompilierten Leser `vinted-browser-reader.js` sowie
`vinted-browser-challenge.js` werden aus dem bereits laufenden Worker ausschließlich
nach `/tmp/pw-client` im Pilotcontainer kopiert. Der normale Browserstart bleibt
unabhängig von Playwright; nach einem Containerneustart fehlt dieser temporäre
Testclient wieder. Der Anschluss an `http://127.0.0.1:9222` bestätigt einen Kontext
und genau einen Vinted-Tab. Ein zweiter kurzer Anschluss liest Browsermetadaten
und führt die bestehende produktive `readVintedAccountIdentity` einmal aus.
Der native Browser-GET bestätigt **`maikevintage`**. Kein neuer Loginversuch,
kein automatischer Seitenwechsel, kein Versand oder Favoritenauftrag.
Die Testprozesse enden anschließend, ohne `Browser.close` auszuführen.

Gemessen: Linux-Chrome 154.0.8037.97, `navigator.webdriver=false`,
`navigator.language='en-US'`, Sprachen `en-US,en`, Zeitzone `Europe/Berlin`.
Der Parameter `--lang=de-DE` allein bestätigt daher keine deutsche Browsersprache.
Diese Einstellungen werden während des Vergleichs nicht nachträglich verändert.

Damit sind ein echter Login, dessen Erhalt nach Neustart und eine einzelne
lesende Identitätsprüfung mit Playwright nachgewiesen. **Keine Ursache der
früheren Sperre ist dadurch eindeutig bewiesen:** insbesondere Konto, neues
Profil, Browserversion, Eingabeweg und Zeitpunkt unterscheiden sich vom
früheren Versuch. Datenabgleich, Schreibaktionen, Stabilität über längere Zeit
und der reguläre Flipbase-Cloudwechsel bleiben eigene Abnahmen. Das Pilotprofil
gehört jetzt ausschließlich zu Maike Vintage; keine weiteren Konten darin anmelden
und die gekaufte IP währenddessen nicht parallel einer anderen Einrichtung geben.

### Echter lesender Kontoabruf mit Maike Vintage

Nach der erneuten Bestätigung der angemeldeten Startseite durch den Nutzer
wurde der unveränderte kompilierte `readVintedAccountImport` aus dem laufenden
Worker im selben Pilotprofil ausgeführt. Der temporäre Testclient benötigt
keine Datenbankzugangsdaten und ruft weder Dispatcher noch Importwriter auf.
Die erwartete Identität wird vor dem Abruf weiterer Kontobereiche und nach
dem Import bestätigt. Ausgabe und Dokumentation enthalten ausschließlich
Status, Mengen und den bereits bestätigten Kontonamen.

Nachweis: ein Profil, fünf Inserate, acht Gespräche, 28 Nachrichten aus bereits
gelesenen Gesprächen und zwei Bewertungen. Die vorhandenen Bereichsergebnisse
markieren Profil, Inserate, Gesprächsübersicht und Bewertungen als vollständig.
Nachrichten und Verkäufe bleiben gemäß dem bestehenden Leser Teilstände;
ungelesene Gespräche werden nicht geöffnet. Ein vollständiger Nachrichtenfeed,
Verkaufsabgleich oder Favoritenereignisabruf ist damit nicht nachgewiesen.

17 Quellanfragen und zwei Identitätsprüfungen lieferten HTTP 200, ohne sichtbare
Mensch-Prüfung. Keine beobachteten API-Schreibaufrufe und kein Datenbankimport.
Der Testclient endete nach etwa sechs Sekunden ohne `Browser.close`; das
angemeldete Profil bleibt im geöffneten Browser erhalten. Die Testgrenzen
betragen 40 API-Anfragen, 90 Sekunden für weitere Leseaufträge und 120 Sekunden
absolute Laufzeit. HTTP 403/429 oder eine sichtbare Prüfung beenden den Versuch.

Eine unmittelbar vorherige einzelne Identitätsprüfung lieferte HTTP 401 und
wurde beendet. Dieser Fehler war beim anschließenden Import nicht erneut
vorhanden: alle beobachteten Antworten waren erfolgreich, der im produktiven
Leser vorhandene einmalige Seitenneuladeweg wurde nicht ausgelöst. Der Nutzer
bestätigt anschließend, während des ersten API-Fehlers die Vinted-Seite manuell
neu geladen zu haben. Der erfolgreiche Import folgt diesem manuellen Eingriff
und beweist deshalb keine selbstständige Sitzungserneuerung durch den Worker.
Eine Erneuerung der API-Anmeldung beim Seitenaufbau ist eine plausible Erklärung;
ein eingefrorener Browser und die genaue Ursache des ersten 401 sind nicht
nachgewiesen. Keine Behebung oder dauerhaft gültige Sitzung daraus ableiten.
Anmeldeerkennung und Browserkonfiguration wurden nicht geändert. Vor einer
regulären Cloudfreigabe den bestehenden Erneuerungsweg ohne manuelles Neuladen
gezielt abnehmen.

### Automatischer HTTP-401-Wiederanlauf ohne manuelles Neuladen

Nach dem Nutzerhinweis auf sein manuelles Neuladen wurde der vorhandene
Wiederanlauf getrennt geprüft. 31 bestehende Tests für Kontoimport und
Identität bestehen, einschließlich erfolgreicher Erneuerung, erneuter
Freigabe vor dem Seitenwechsel und fehlender Wiederholung bei HTTP 403/429.
Der produktive Synchronisierungsrunner verwendet `readVintedAccountImport`
direkt; dessen 401-Wiederanlauf ist damit auch im regulären Leseabruf erreichbar.

Im selben echten Chromeprofil bestätigt ein begrenzter Baselineabruf mit
zwei HTTP-200-Antworten Maike Vintage, ohne Seitenwechsel. Für die zweite
Stufe beantwortet ausschließlich der temporäre Playwright-Test den ersten
GET auf `/api/v2/users/current` synthetisch mit HTTP 401. Der unveränderte
produktive Import startet danach selbst das Neuladen der Vinted-Startseite.
Genau ein Hauptdokumentabruf ist beobachtet; zusätzliche Navigationsereignisse
des Hauptframes werden nicht als weitere Seitenabrufe gezählt. Eine zunächst
auf diese Ereignisse bezogene Testbedingung wurde korrigiert und der
begrenzte Versuch wiederholt.

Nach dem automatischen Neuladen wird die erwartete Identität bestätigt.
Fünf weitere beobachtete API-Antworten liefern HTTP 200, keine sichtbare
Mensch-Prüfung und keine beobachteten API-Schreibaufrufe. Der Test endet vor
dem erneuten Abruf der weiteren Kontobereiche. Antwortsimulation und
Testverbindung werden anschließend entfernt, ohne den Browser zu schließen.
Keine gespeicherten Anmeldedaten verändert, keine Datenbankzugriffe und
keine Änderung am Produktcode. Die Testgrenzen betragen 15 API-Anfragen,
40 Sekunden für weitere Abrufe und 60 Sekunden absolute Laufzeit.

Dieser Nachweis bestätigt die automatische Reaktion auf HTTP 401 im echten
Chrome mit einer weiterhin gültigen gespeicherten Anmeldung. Er ersetzt
keinen Test mit tatsächlich abgelaufenen Anmeldedaten und beweist nicht die
Ursache des ursprünglichen 401. Die separate `readVintedAccountIdentity`-
Prüfung des Anmeldeabschlusses besitzt diesen Wiederanlauf bisher nicht;
der erfolgreiche Importtest bestätigt deren Erneuerungsverhalten nicht.

Der nächste Integrationsschritt verbindet diesen Browserstart und das
dauerhafte Profil mit dem bereits vorhandenen Cloud-Einrichtungsablauf:
atomare IP-Reservierung, eindeutige Kontozuordnung, geschützte Live-Bedienung
sowie bestätigter Abschluss oder Abbruch. Die lokale Ausführung wird erst
nach erfolgreicher Cloudverknüpfung abgelöst. Der separate Pilot darf die
gekaufte IP währenddessen nicht parallel weiterverwenden.

## Privater IP-Betrieb vom 05.10.2026

Der zusätzliche lesende IPRoyal-Abgleich ist im Arbeitszweig vorbereitet und geprüft,
noch nicht im laufenden Abbild enthalten. Der private Schlüssel liegt unter
`/opt/flipbase-marketplace/pilot-02dbcfbd/iproyal.env` mit Modus 0600. Nach geprüftem
PR/Release wird `IPROYAL_API_TOKEN` in die private Worker-Umgebung übernommen;
keinen Schlüssel in Compose, Frontend oder Git aufnehmen. Der vorhandene persistente
Mount der Netzwerkdatei ist dafür beschreibbar. Beim Hinzufügen und Cloudwechsel
folgen Berechtigungsprüfung, Anbieterabgleich und atomare Reservierung. Es werden
keine Bestellungen ausgelöst. Der Abgleich nutzt ausschließlich das für Flipbase
vorgesehene IPRoyal-Konto; externe Nutzungen sind in der Anbieter-API nicht erkennbar.

Der neue Dienst ist gegen die echte Bestellung lesend geprüft: zwei Anbieter-GETs,
ein Datenbank-GET, bestätigter deutscher Ausgang und keine produktiven Schreibaufrufe.
Die erwartete Ablaufaktualisierung wurde nur simuliert. Die Anbieter-API liefert
`expire_date` ohne dokumentierte Zeitzone; der neue Abgleich setzt vorsichtig
00:00 UTC am Tag vor dem Ablauftag als eigene Nutzungsgrenze. Die unten genannte
manuelle Registrierung bleibt bis zur Aktivierung des neuen Abgleichs unverändert.
33 Linuxprüfungen einschließlich privater Dateirechte bestanden ohne Auslassung.

Nach ausdrücklicher Betriebsfreigabe sind beide geprüften Abbilder von
`02dbcfbddaba4dfae0736bbd879d265fe2296b5a` veröffentlicht und auf Hetzner geladen.
Die Imageworkflows `37348139184` und `37348143804` sind erfolgreich.
Der vorherige Worker von `dc1deb88` war seit 04.10.2026 mit Exitcode 1 beendet;
alle 201 alten Browsersitzungen waren geschlossen. Keine laufenden Browser
oder Kontoprofile wurden umgestellt.

Aktives Compose und private Environment-Dateien liegen jetzt unter
`/opt/flipbase-marketplace/pilot-02dbcfbd/`. Der Unterordner `rollback` enthält
die vorherige Konfiguration. Die persistente Proxydatei liegt außerhalb der
Kontoprofile unter `/opt/flipbase-marketplace/chromium/cloud-networks.json`
(UID/GID 1000, Modus 0600), im Controller unter
`/var/lib/flipbase-marketplace/cloud-networks.json`. Die private Worker-Umgebung
setzt `MARKETPLACE_CHROMIUM_NETWORK_FILE` auf diesen Pfad. Es gibt keinen neuen
öffentlichen Port und keine Zugangsdaten im Repository.

Der explizite HTTPS-Test aus `flipbase-browser` bestätigt die gekaufte IP und
Deutschland. IPRoyal-Bestellung 84454713 zeigt `ISP Dedicated`, `Germany`,
30 Tage und den Ablauf 04.11.2026. Eine Uhrzeit ist dort nicht sichtbar;
die Registrierung verwendet als vorsichtige eigene Nutzungsgrenze den
04.11.2026 um 00:00 Uhr Berlin (`2026-11-03T23:00:00Z`), keine behauptete
Anbieteruhrzeit. Die Kennung `iproyal-pilot-a` ist geprüft und frei.

Worker- und öffentlicher Healthcheck sind gesund. API Version 2,
`MARKETPLACE_SCHEDULED_SYNC_ENABLED=0` und
`MARKETPLACE_CHROMIUM_WRITES_ENABLED=0` sind bestätigt. Nach Worker-Neustart
bleibt genau dieselbe IP frei; anonyme Cloud-Einrichtung antwortet mit 401.
Dies belegt Infrastruktur und IP-Bestand, noch keinen echten Vinted-Zugang.

Offen: ausdrückliche Auswahl des Pilotkontos, Anmeldung/SMS, Identitätsprüfung,
Abschluss des Cloudwechsels, lesender Abruf und Neustart mit dieser Kontozuordnung.
Historische Kontonamen sind keine neue Kontoauswahl. Bestehende lokale
Nachrichten mit unklarem Versandresultat werden nicht erneut gesendet oder
manuell bereinigt; ein Wechsel muss die vorhandene Sperre berücksichtigen.

## Vorbereiteter IP-Bestand vom 05.10.2026

Die Umsetzung enthält die Einrichtung mit vorhandenem IP-Bestand und den
Wechsel eines lokalen Kontos zur Cloud. Automatische IP-Bestellung, Kündigung
und Abrechnung sind nicht enthalten. Dieser Stand ist noch nicht produktiv
aktiviert. Die gekaufte IP wurde weder registriert noch einem Konto zugeordnet.
Der echte Pilot braucht die Freigabe der aktuellen Serverkonfiguration und
die ausdrückliche Benennung des Kontos; historische Kontonamen gelten dafür
nicht als neue Auswahl.

Nach PR und gesonderter Betriebsfreigabe zunächst den tatsächlich laufenden
Pilot-Compose, dessen Image-SHA und die private Environment-Datei prüfen.
Der vorhandene nur lesende Mount `/run/flipbase` reicht für die Netzwerkdatei;
kein neuer öffentlicher Zugang ist erforderlich. Die Datei
`/run/flipbase/chromium-networks.json` gehört UID/GID 1000 und hat Modus 0600.
`MARKETPLACE_CHROMIUM_NETWORK_FILE` verweist in der privaten Worker-Umgebung
auf diesen absoluten Pfad. Proxyadresse, Benutzername und Passwort ausschließlich
privat übermitteln. Das Dateiformat steht im
[IP-Pilotplan](vinted-cloud-ip-pilot-plan.md). Bestehende Netzwerkkennungen und
ihre Zugangsdaten während belegter Konten nicht umschreiben.

Die Wartungsbefehle im geprüften Worker-Abbild lauten:

```sh
docker exec -u 1000:1000 flipbase-marketplace-worker \
  node dist/register-marketplace-cloud-ip.js --list

docker exec -u 1000:1000 flipbase-marketplace-worker \
  node dist/register-marketplace-cloud-ip.js \
  --file /run/flipbase/chromium-networks.json \
  --network iproyal-pilot-a --order ACTUAL_ORDER_REFERENCE \
  --country DE --dedicated-isp --expires ACTUAL_UTC_EXPIRY
```

Bestellregion, Dedicated-ISP-Eigenschaft und genaue Ablaufzeit aus der
IPRoyal-Bestellung übernehmen. Die CLI testet den explizit ausgewählten Proxy
über HTTPS gegen die [dokumentierte Geo-IP-Auskunft](https://ipwhois.io/documentation).
Nur ein bestätigter deutscher IPv4-Ausgang und eine noch gültige deutsche
Bestellung erlauben die Registrierung. Ein fehlgeschlagener Test führt zu
keiner Freigabe und keinem direkten Ausweichzugang. Das ist ein Konnektivitäts-
und Standorttest, kein Nachweis erfolgreicher Vinted-Anmeldung.

Die Datenbank erhält nur Netzwerkkennung, Bestellreferenz, Land, ISP-Eigenschaft,
Ablaufzeit, Prüfzeit und eine SHA-256-Prüfsumme des gemessenen IP-Ausgangs.
Eine eindeutige Datenbankregel verhindert, dass derselbe Ausgang unter mehreren
Kennungen als freie IP erscheint. Erneutes Registrieren mit verändertem Ausgang
wird abgewiesen. Die CLI überschreibt keine bestehende Zuordnung und
prüft nach verlorener Schreibantwort die tatsächlich gespeicherte Zeile.
`--list` zeigt Kennung, Bestellreferenz, Ablaufzeit und Belegungszustand; keine
Proxyadresse oder Zugangsdaten. Eine abgelaufene oder deaktivierte IP sperrt
neue Sitzungen und weitere Cloudaufträge des zugeordneten Kontos.

Der anschließende echte Pilot umfasst Anmeldung und Identitätsprüfung am
ausgewählten Konto, lesenden Profil-/Inserateabruf, einen Worker-Neustart mit
derselben Zuordnung und den Kapazitätshinweis beim zweiten künstlichen Versuch.
Automatische Abrufe und Schreibaktionen bleiben ausgeschaltet. Bei unbestätigtem
Browserstopp bleibt die IP belegt; keine Reservierung manuell freigeben.

Lokale Prüfung: Datenbank- und Workertests, Angular-Bau sowie Browserfixtures
mit künstlichen Konten. Der tatsächliche Hetzner-/Vinted-Nachweis ist offen.

## Manueller Anmeldevergleich vom 03.10.2026

Der Nutzer bestätigt im vorbereiteten normalen Windows-Chrome den Ausgang
`168.119.246.33` und erfolgreiche Anmeldung einschließlich SMS-Code. Die
Server-IP ist für diesen konkreten Versuch nutzbar. Dauerhafter Cloudbetrieb,
Mehrkontenbetrieb und die Flipbase-Kontoverbindung sind damit nicht bestätigt;
ein obligatorischer Proxykauf folgt daraus nicht.

Der nächste Vergleich nutzt den vorhandenen Linux-Cloudbrowser und dessen
bisheriges Kontoprofil. „Direkt im Browser anmelden“ öffnet einen expliziten
manuellen Modus: keine automatische Anmeldung oder Codeübermittlung und keine
Kontoprüfung im Hintergrund. Das gilt auch bei einem Bildladefehler. Eine
offene Anmeldung oder SMS bleibt beim vorzeitigen Prüfen manuell fortsetzbar.
Anmeldedaten und SMS werden im Browser eingegeben; das Textfeld zum Übertragen
ist standardmäßig verdeckt. Erst „Anmeldung prüfen & verbinden“ nutzt die
bestehende autorisierte Kontoidentitätsprüfung. Bei einer Sperrseite den Versuch
beenden; keine weiteren Loginversuche oder Eingaben senden.

So wird der Anmeldeablauf innerhalb derselben Cloudumgebung verglichen. Die
Bildvorschau und die Weitergabe einzelner Eingaben bleiben bestehen. Das ist
noch kein kontinuierlicher Desktopstream und kein Beweis, dass manuelles
Anmelden die Vinted-Sperre behebt. Windows-Chrome und Linux-Chromium sowie
ihre Profile unterscheiden sich weiterhin. Kein Export lokaler Cookies,
keine produktive Netzumstellung und keine Freigabe automatischer Abrufe.

## Chromium-Pilot vom 02.10.2026 – eigener Cloudbetrieb

### Ausgeführter Serverpilot vom 02.10.2026

PR #283 ist mit `60676337e4b906294928e249067f891fc1fe7d9d` integriert.
Release v0.284.0 und öffentlich ausgelieferter Web-Commit sind bestätigt.
Alle 242 Workerfälle bestanden unter Linux ohne Auslassung. Beide Imageworkflows
haben die Images dieses Merge-Commits veröffentlicht; der Hetzner-Host hat sie
geladen. Der Sandbox-/Persistenz-/Profiltrennungs-Smoke besteht auch dort.

Der Nutzer hat **Maike Vintage** für die erste Umstellung ausgewählt. Die
Wartungs-CLI hat diese Verbindung nach kontrollierter Pause auf ein privates
Chromiumprofil migriert; die bestehende Vintedidentität und vorherige GoLogin-
Referenz bleiben erhalten. Der Status lautet `needs_login`. Tablet bleibt dem
bisherigen GoLoginprofil zugeordnet. Der neue Controller ist gesund und die
öffentliche API bestätigt Version 2 mit ausgeschalteter Automatik.

Aktives Pilot-Compose und dessen Variablen stehen privat unter
`/opt/flipbase-marketplace/pilot-60676337/`. Zur Bedienung ausdrücklich
`--env-file .../pilot.env -f .../docker-compose.marketplace-chromium-pilot.yml`
verwenden. Das bisherige `/opt/flipbase-marketplace/docker-compose.yml` und seine
Variablen wurden nicht zum Pilot-Compose umgeschrieben. Ein ungezieltes Starten
dieses alten Compose würde den Controller wieder ersetzen.
Der private Unterordner `rollback` enthält ursprüngliche Compose-Datei,
Environment-Dateien, Imagebezug und ausgewählte Kontometadaten. Browserprofile
und Registry liegen unter `/opt/flipbase-marketplace/chromium` und gehören UID/GID
1000 mit privaten Verzeichnisrechten. Kein Backup enthält neue Vintedpasswörter.

Auf dem Host kennt `install -o 1000` den nicht vorhandenen Benutzer nicht.
Daher wurden ausschließlich die drei vorgesehenen Chromiumverzeichnisse mit
`install -d -m 0700` und anschließend numerischem `chown 1000:1000` vorbereitet;
danach bestand das unveränderte Bootstrap mit eigener Firewall und Timer.

Der erste Vinted-Start scheiterte anschließend vor der Browseranlage mit 409:
Das seccomp-Profil war nur auf dem Host vorhanden. Docker liest diese Datei
jedoch im Client, also im Controller. Der Pilot bindet sie deshalb einzeln auf
denselben Pfad mit `:ro` ein. Die root-owned Datei ist Modus `0644`; weder
Controller noch Browser dürfen sie ändern. Browser erhalten weiterhin nur ihr
Kontoprofil. Die vor dem Fix verwendete Compose-Datei liegt im privaten
`rollback/compose-before-seccomp-fix.yml`. Die korrigierte Live-Konfiguration
bestand einen tatsächlichen Docker-CLI-Containerstart aus dem Controller mit
UID 1000, entferntem Capabilitysatz und geladenem seccomp-Profil. Der öffentliche
Worker-Healthcheck ist danach gesund. Der Imageworkflow prüft denselben Zugriff.
Das Bootstrap verwendet künftig `install -d` mit numerischem `chown` und setzt
bestätigte Dateirechte auch für bereits vorhandene identische Dateien.

Noch offen: echte Anmeldung und Identitätsbestätigung, authentifizierter Abruf,
Sitzungserhalt nach dieser Anmeldung, mobile Bedienung und spätere Messung der
Automatik. Vinted-Schreibaktionen und automatische Abrufe bleiben bis zur
jeweiligen Abnahme deaktiviert. Ein leerer Sandbox-Test ist kein Vinted-Zugangstest.

### Geprüfter Umstellungsplan

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
