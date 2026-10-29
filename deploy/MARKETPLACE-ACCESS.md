# Dauerhafter Marketplace-Deployment-Zugang

GitHub Actions erhält einen eigenen SSH-Schlüssel für den Marketplace-Worker.
Er kann ausschließlich den fest installierten Marketplace-Befehl ausführen.
Der vorhandene Web-Deploy-Schlüssel und dessen Befehl bleiben erhalten.

## Einmalige Einrichtung auf dem Host

Die Einrichtung benötigt die vorhandene administrative Serversitzung. Sie wird
aus einem geprüften, vollständig angegebenen Git-Commit ausgeführt. Der Installer
selbst wird zuerst von dessen festem Quellpfad heruntergeladen und seine
SHA256-Prüfsumme mit dem zuvor lokal geprüften Stand verglichen. Kein Download
wird direkt in einen Interpreter geleitet.

```bash
python3 install-marketplace-access.py prepare <vollständiger-geprüfter-commit>
```

`prepare` lädt genau drei Dateien desselben Commits aus dem festen
FlipBase-Repository: Entrypoint, Rollout-Engine und öffentlichen Deploy-Schlüssel.
TLS-Prüfung bleibt aktiv; Umleitungen, leere Dateien und übergroße Antworten
werden abgewiesen. Die Dateien und ihr Manifest liegen ausschließlich für root
lesbar unter `/opt/flipbase-marketplace/access-bootstrap/<commit>/`.

Die Ausgabe nennt Commit, Bundle-Prüfsumme, Fingerprint des öffentlichen
Deploy-Schlüssels und den vollständigen späteren SSH-Befehl. Diese Angaben vor
der Zugriffsfreigabe mit dem geprüften Commit und dem erzeugten Schlüsselpaar
vergleichen. Bis hier wird keine SSH-Berechtigung geändert.

```bash
python3 install-marketplace-access.py install <derselbe-vollständige-commit>
```

`install` verwendet ausschließlich die bereits vorbereiteten Dateien und prüft
sie erneut gegen ihr Manifest. Es lädt nichts nach. Das vollständige Bundle wird
unter `/opt/flipbase-marketplace/command-v1/<bundle-prüfsumme>/` installiert.
Bereits vorhandene Bundles werden nur akzeptiert, wenn alle Dateien identisch
sind. Andere Inhalte werden nicht überschrieben.

Der neue Eintrag in `/root/.ssh/authorized_keys` verwendet `restrict` und den
festen Befehl `/usr/bin/python3 -I -B <bundle>/marketplace-deploy.py`. Vorhandene
Schlüsselzeilen bleiben erhalten. Derselbe Schlüssel mit einem anderen Befehl,
anderen Optionen oder mehreren Einträgen verhindert die Installation. Eine
identische Wiederholung verändert weder das Bundle noch die Schlüsseldatei.

Beide Schritte verwenden denselben Host-Lock wie das Web-Deployment. Sie ändern
weder SSH-Daemon-Konfiguration noch Firewall, Worker-Dienste, Datenbankaufträge,
Kontofreigaben oder Zeitpläne.

## GitHub anbinden und nachweisen

Der private Teil des **eigenen Marketplace-Schlüsselpaars** wird als
`MARKETPLACE_DEPLOY_SSH_KEY` im eigenen GitHub-Environment `marketplace-production`
hinterlegt. Er gehört weder in dieses Repository noch in Protokolle. Der im
Repository hinterlegte öffentliche Schlüssel gewährt allein noch keinen
Serverzugriff; die Freigabe entsteht erst durch den installierten SSH-Eintrag.

Für die Hostidentität den öffentlichen Ed25519-Hostschlüssel über die bestehende
Hetzner-Konsole bestätigen und als eigenes Environment-Secret
`MARKETPLACE_DEPLOY_KNOWN_HOSTS` hinterlegen.
Der Installer zeigt dessen Fingerprint zusätzlich, sofern die feste öffentliche
Hostschlüsseldatei vorhanden und prüfbar ist. Eine ungeprüfte automatische
Hostschlüsselannahme ersetzt diesen Vergleich nicht.

Die Deployment-Branchregel dieses Environments lässt ausschließlich `master`
zu. Nach erfolgreicher Hostinstallation und Einrichtung beider Secrets die
Environment-Variable `MARKETPLACE_DEPLOY_ENABLED` auf `true` setzen. Das bestehende
Web-Environment und dessen Secrets werden dafür nicht geändert.

Der Workflow verwendet die exakt erlaubten Befehle `marketplace-status-v1` und
`marketplace-deploy-v1`. Der Deployment-Aufruf erhält ein streng geprüftes
Release-Manifest; Pfade, Compose-Konfigurationen und Shellbefehle sind kein Teil
dieser Schnittstelle. Die Workflow-Datei beschreibt Auslöser, Prüfungen und
Release-Auswahl. Vor dem Abschluss müssen ein echter Statusaufruf sowie der
freigegebene Rollout über GitHub Actions nachgewiesen sein. Eine offene
Hetzner-Konsole ist für diese Aufrufe anschließend nicht nötig.

Für die erste Abnahme den Workflow `Publish Marketplace Images` auf `master`
zunächst mit `operation=status` ausführen. Anschließend kann
`operation=deploy-existing` mit der vollständigen Kennung des bereits geprüften
Releases dessen drei belegte Images ausrollen. Normale neue Worker-Releases
werden nach den erfolgreichen Pflichtprüfungen über den Hauptzweig-Ablauf
veröffentlicht und ausgerollt.

## Grenzen und spätere Änderungen

Der Zugang darf geprüfte Worker-, Broker- und Sitzungsimages aus den drei festen
FlipBase-Repositories ausrollen. Er besitzt damit produktive Deployment-Rechte;
die feste SSH-Befehlsgrenze ersetzt nicht die Prüfung des ausgerollten Codes.

Ungeklärte Aufträge, laufende Sitzungen oder ein unterbrochener Rollout können
weiterhin einen Abbruch erzwingen. Die Einrichtung repariert solche Zustände
nicht automatisch und löst keine Veröffentlichung oder Nachricht aus.

Neue Worker-Releases laufen über dieselbe installierte Schnittstelle. Änderungen
am Entrypoint oder an der Rollout-Engine selbst benötigen ein neues geprüftes
Bundle und eine gezielte administrative Umstellung der eigenen Schlüsselzeile.
Der Installer bietet dafür keinen automatischen Schlüsselaustausch und der
SSH-Befehl keinen Selbstupdate-Endpunkt. Zum Entziehen des Zugangs ausschließlich
den zugehörigen Marketplace-Schlüsseleintrag entfernen.

## Gezielte Prüfung

`scripts/marketplace-access.test.py` führt den echten Installer in einem privaten
Testverzeichnis mit ersetzten Systempfaden aus. Die reguläre Deployment-Testdatei
bindet diesen Lauf ein. Die Fälle prüfen Vorbereitung ohne Zugriffsfreigabe,
Erhalt bestehender Schlüssel, idempotente Wiederholung, Schlüsselkonflikte,
veränderte Dateien, Symlinks, ungeschützte Pfade, gleichzeitige Änderungen der
Schlüsseldatei und die Trennung zwischen Download und Installation.
