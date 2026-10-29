# Marketplace-Worker ausrollen

`marketplace-rollout.py` führt den bereits freigegebenen Betreiberablauf für den
Paketnamenfix aus PR #512 aus. Das Skript benötigt Python 3, Docker Compose und
Root-Rechte auf dem bestehenden Marketplace-Host. Es richtet keinen zusätzlichen
Zugang ein und veröffentlicht kein Inserat. Derselbe geprüfte Ablauf wird vom
separaten [dauerhaften Deployment-Einstieg](MARKETPLACE-ACCESS.md) mit einem
streng validierten Release-Manifest verwendet; die direkten CLI-Befehle behalten
den folgenden festgelegten Standardrelease.

## Festgelegter Release

Der Zielstand ist `8f9a81ac02556daf0f7db13b4169c76f703c0d15`. Worker, Broker und
Browserimage stammen aus dem erfolgreichen
[Publisher-Lauf 40928196030](https://github.com/GrischaTDev/flipbase/actions/runs/40928196030).
Das Skript verwendet die unveränderlichen Image-Digests und prüft den enthaltenen
Runtime-Hash. Ein beweglicher Branch- oder Image-Tag ist keine Rolloutfreigabe.

Vor der Verwendung das Skript aus einem geprüften, festgelegten Git-Commit laden
und seinen Inhalt prüfen. Ein heruntergeladenes Skript wird nicht über eine Pipe
direkt an eine Shell weitergegeben.

## Ablauf

```sh
python3 marketplace-rollout.py status
python3 marketplace-rollout.py jobs
python3 marketplace-rollout.py draft
python3 marketplace-rollout.py prepare
python3 marketplace-rollout.py deploy
python3 marketplace-rollout.py verify
```

`status`, `jobs` und `draft` lesen den aktuellen Zustand. `draft` prüft den
Veröffentlichungsblocker über sämtliche Aufträge des Entwurfs 11 und zeigt die
letzten Aufträge mit Beginn, Anbieterstatus und zugehöriger Browsersitzung.
Die Ausgabe enthält keine
vollständige Containerumgebung, Compose-Datei, Zugangsdaten oder Inserattexte.

`prepare` erkennt die tatsächlich aktive Compose-Datei über beide laufenden
Container. Es übernimmt deren aufgelöste Konfiguration und sichert den Ausgangsstand
geschützt auf dem Host. Ausschließlich das Workerimage, das Brokerimage und
`MARKETPLACE_CHROMIUM_IMAGE` in beiden Diensten dürfen sich ändern. Profile,
Netzwerke, Mounts, Sicherheitsoptionen, Freigaben und Zeitpläne bleiben erhalten.

`deploy` prüft den Zustand erneut. Der Worker erhält bis zu 780 Sekunden für seinen
geordneten Abschluss, der Broker anschließend bis zu 180 Sekunden. Zwischen diesen
Schritten müssen die Datenbankberechtigung des Workers abgelaufen und seine
Browsersitzungen tatsächlich beendet sein. Ein Broker-Exitcode 143 kann nach
bestätigter Browserbereinigung eine reguläre SIGTERM-Beendigung darstellen; für
den Worker gilt diese Ausnahme nicht.

`verify` kontrolliert die tatsächlich laufenden Images, die unveränderte übrige
Konfiguration, den enthaltenen Runtime-Hash, eine neu erworbene Runtime-Lease und
den Workerzustand ohne automatische Containerneustarts. Der Broker hat
keinen Docker-Healthcheck; ein fehlender Health-Status ist dort erwartbar.

## Unterbrechungen und Blocker

Eine Host-Sperre verhindert zwei gleichzeitig ausgeführte Rolloutbefehle. Ein
geschütztes Phasenprotokoll wird vor verändernden Schritten gespeichert. Eine
unterbrochene oder unbekannte Phase wird nicht durch einen erneuten `deploy`-Aufruf
blind wiederholt. Zuerst den tatsächlichen Zustand lesen und den passenden Rückweg
anhand der gesicherten Konfiguration bestimmen.

Offene, schreibende oder unklare Aufträge werden nicht zurückgesetzt. Das gilt auch
für historische Nachrichten mit unbekanntem Ausgang: Ein alter Befund ist keine
pauschale Ausnahme für einen aktuell gefundenen Auftrag. Datenbankzustände,
Anbieterbelege und Sitzungsberechtigungen bleiben unverändert.

Bei einer Cloudnachricht kann der Versandausgang unbekannt bleiben, obwohl ihre
Ausführung nachweislich beendet ist. Nur vollständig passende Konto-, Workspace-,
Auftraggeber- und Workerbindungen, eine geschlossen und beim Anbieter beendet
bestätigte Sitzung sowie eine inaktive Nachrichten-Lease erlauben diese Trennung.
Zusätzlich dürfen global keine aktiven oder stoppenden Sitzungen und keine
physischen Browsercontainer vorhanden sein. Der Nachweis dieser historischen
Versuche muss während Vorbereitung, Stopp und Abschluss identisch bleiben.
Unvollständige Belege und unbekannte andere Auftragstypen sperren weiterhin.
Die Nachricht wird dadurch weder erneut verschickt noch als zugestellt bewertet.

Die gesicherte Compose-Datei kann aufgelöste Zugangsdaten enthalten. Sie bleibt auf
dem Host mit eingeschränkten Rechten und gehört weder in Chat noch Git oder einen
öffentlichen Prüfbericht.

## Veröffentlichung prüfen

Nach einem erfolgreichen Rollout den aktuellen Zustand des Entwurfs erneut lesen.
Nur wenn kein offener, unklarer oder bestätigter Veröffentlichungsauftrag und kein
Anbieterbeleg vorliegen, den separat freigegebenen Versuch regulär in Flipbase
starten. Die tatsächlich angenommene Auftrags-ID bis zum bestätigten Anbieterbeleg
verfolgen. Ein gesundes Worker-Image allein belegt keine erfolgreiche
Veröffentlichung.

## Automatisierter Zugang

Der Installer, der eigene SSH-Schlüssel und der GitHub-Workflow sind in
[MARKETPLACE-ACCESS.md](MARKETPLACE-ACCESS.md) beschrieben. Sie benötigen eine
einmalige konkrete Hosteinrichtung und einen echten Verbindungsnachweis.
Der vorhandene Web-Deployment-Schlüssel erhält dadurch keine zusätzlichen Rechte.
