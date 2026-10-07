# Betrieb und Wiederherstellung der Flipbase-Sicherungen

Stand 07.10.2026: Umsetzung und manuelle Pilotprüfung abgeschlossen. Die bisherigen
produktiven Cronaufträge bleiben bis zum freigegebenen PR und der Umschaltung aktiv.

## Aufbau

- Der Hauptserver erzeugt um 03:30 Uhr einen aktuellen Stand unter
  `/var/backups/flipbase-snapshot/current`: vollständiger PostgreSQL-Abzug einschließlich
  Rollen, rohe Storage-Dateien, Konfiguration und Prüfsummen. Keine sieben lokalen
  Bildarchive. Beim Erstellen ist vorübergehend Platz für den alten und neuen Stand nötig.
- Der Backupserver holt neue Stände stündlich um Minute 40 mit einem Leseschlüssel ab.
  Bereits geprüfte Stände werden anhand ihres kleinen Manifests erkannt; Bilder und
  Datenbank werden dann nicht erneut übertragen. Stände älter als 26 Stunden gelten
  als Fehler, auch wenn die SSH-Verbindung funktioniert.
- Nur der Backupserver besitzt Zugriff auf das verschlüsselte Borg-Repository.
  Unveränderte Inhalte werden gemeinsam gespeichert. Sieben Tages- und vier zusätzliche
  Wochenstände bleiben erhalten; Borg kann anfangs zusätzlich den ältesten Stand schützen.
- Vor Releases bleibt die bestehende strikte age-Sicherung der Datenbank aktiv.
  Lokal und extern bleiben drei Punkte. Die vorhandene `rrsync -wo -no-del`-Beschränkung
  wird nicht gelockert. Bestehende nächtliche age-Stände werden übergangsweise extern
  auf sieben Tages- und vier zusätzliche Wochenstände begrenzt.
- Lokal bleibt während des Übergangs ein geprüfter alter age-Tagesstand zusätzlich
  zum aktuellen Rohstand erhalten. Erst nach geprüftem Borg-Betrieb den Altbestand
  gesondert ausmustern; der Umbau löscht ihn nicht pauschal.

Der Dateikopie und dem Datenbankabzug müssen unveränderte Storage-Metadaten und
Dateiinhalte gegenüberstehen. Bei zwischenzeitlichen Änderungen wird kein neuer
Stand veröffentlicht. Das unterbricht keine Benutzeranfragen. Ein fehlgeschlagener
Lauf erhält den alten Stand und liefert einen Fehlercode. Der alte lokale Rohstand
wird erst ersetzt, wenn der Backupserver dessen vollständiges Zurücklesen bestätigt hat.
Die Nachtfrequenz bedeutet bei erfolgreichen Läufen ungefähr bis zu 24 Stunden
möglichen Datenverlust; vor echten Nutzern erneut bewerten.

## Zugang und Geheimnisse

Auf dem Hauptserver existiert ausschließlich der Systembenutzer `flipborg-source`
mit `/bin/sh`, Home `/srv/flipbase-backup-source`, SSH-Verzeichnis `0700` und
`authorized_keys` mit `0600`. Seine einzige Schlüsselzeile lautet mit dem **öffentlichen**
Schlüssel des Backupservers:

```text
from="168.119.165.201",restrict,command="/usr/local/sbin/flipbase-backup-source" ssh-ed25519 <PUBLIC_KEY> flipbase-backup-server
```

`backup-source.sh` liegt root-eigen mit `0755` am angegebenen Pfad. Es hält eine
gemeinsame Lesesperre und führt ausschließlich `rrsync -ro` auf dem veröffentlichten
Stand aus. Der Snapshot gehört `root:flipborg-source`, Ordner erhalten `0750`,
Dateien `0640`. Weder Shellbefehle noch Schreibzugriffe werden gestattet.

Der Backupserver besitzt den privaten Leseschlüssel mit `0600` unter
`/root/.ssh/flipbase-borg-source`. Die bereits unabhängig bestätigte ED25519-Identität
des Hauptservers wird in `/root/.ssh/flipbase-borg-known-hosts` festgelegt.
`StrictHostKeyChecking=yes` bleibt obligatorisch. Kein neuer öffentlicher Dienst oder Port.

Borg ist nur auf dem Backupserver installiert. `/srv/flipbase-borg/repository`,
`/var/lib/flipbase-backup` und `/root/.config/flipbase-borg` gehören root mit `0700`.
Initialisierung einmalig, ohne bestehende Repositorys zu überschreiben:

```sh
export BORG_PASSCOMMAND='cat /root/.config/flipbase-borg/passphrase'
borg init --encryption repokey-blake2 --storage-quota 8G /srv/flipbase-borg/repository
borg key export /srv/flipbase-borg/repository /root/.config/flipbase-borg/repository-key
```

Die zufällige Passphrase und der exportierte Schlüssel erhalten `0600` und gelangen
weder in Logs noch in Git. Für die kleine Installation schützt das
8-GB-Limit den gemeinsam genutzten Server. Kapazität vor größerem Bildbestand erweitern;
bei Platzmangel schlägt die Sicherung fehl, statt alte geschützte Daten ungeprüft zu löschen.

Ein mit dem bisherigen age-Empfängerschlüssel verschlüsseltes Paket aus Passphrase
und Borg-Schlüssel liegt auf beiden Servern:
`/srv/flipbase-backup/daten/borg-recovery.tar.gz.age` und
`/var/backups/flipbase-borg-recovery.tar.gz.age`. Zusätzlich außerhalb beider Server
aufbewahren, zusammen mit dem unabhängigen Zugriff auf den age-Entschlüsselungsschlüssel.
Diese dritte Kopie ist bislang nicht verifiziert.

## Geprüfte Umschaltung

Vor Änderungen Originalskripte und Crondateien in einem rootgeschützten, datierten
Rückfallordner sichern. Haupt- und Backupserverzugänge bleiben getrennt. Nach grünem PR:

1. Auf dem Hauptserver `create-backup-snapshot.py`, `backup-server.py` (für den
   Restore-Test), `test-backup-restore.py` und `cleanup-server-storage.py` root-eigen
   mit `0700` nach `/opt/flipbase/` installieren. Den Systembenutzer, Leseschlüssel,
   festen Hostschlüssel und die beschriebenen Rechte vorab prüfen.
2. Auf dem Backupserver `backup-server.py`, `create-backup-snapshot.py` und
   `cleanup-server-storage.py` root-eigen mit `0700` nach `/opt/flipbase-backup/`
   installieren. Das vorbereitete Repository nicht neu initialisieren.
3. Hauptserver: `python3 -B /opt/flipbase/create-backup-snapshot.py`.
   Backupserver: `python3 -B /opt/flipbase-backup/backup-server.py`.
   Erster Lauf muss Dateiübertragung, Borg-Erstellung, vollständige Extraktion und
   Prüfsummenvergleich erfolgreich abschließen.
4. Einen **aus Borg extrahierten** Stand auf dem Hauptserver in ein privates
   Testverzeichnis übertragen und `test-backup-restore.py` ausführen. Der Test kopiert
   den Stand, verändert die aktive Quelle nicht und nutzt einen Container ohne
   Netzwerk, veröffentlichte Ports oder Produktionsmounts. Alle Referenzen in
   `storage.objects` müssen auch in den wiederhergestellten Dateien vorhanden sein.
5. Erst danach `backup.sh` installieren. Der vorhandene 03:30-Cron bleibt unverändert.
   `cron-aufraeumen-n8n-server` ersetzt auf dem zweiten Server die pauschale
   30-Tage-Löschung. `cron-server-storage` begrenzt den alten lokalen age-Bestand auf
   einen extern bestätigten Tagesstand. Vorschauen vor dem ersten Löschlauf prüfen.
6. `cron-backup-restore-test` mit `0644` als `/etc/cron.d/flipbase-backup-restore-test`
   installieren. Er prüft sonntags um 04:30 eine private Kopie des aktuellen lokalen
   Stands. Der separate Borg-Restore wird zusätzlich nach wesentlichen Änderungen
   und vor Ausmustern der alten Sicherungen wiederholt.

Keine laufenden Anwendungen werden für die Umschaltung neu gestartet.
Bei Problemen die beiden alten Backup-Crondateien und `backup.sh` zurücksetzen.
Neue Repositorys und Altstände erhalten; keinen zweiten Aufbau über sie initialisieren.

## Prüfung und Wiederherstellung

```sh
# Backupserver: erfolgreiche Übertragung und Alter kontrollieren
cat /var/lib/flipbase-backup/last-success.json
python3 -B /opt/flipbase-backup/backup-server.py --legacy-preview
export BORG_PASSCOMMAND='cat /root/.config/flipbase-borg/passphrase'
borg list /srv/flipbase-borg/repository

# Private Extraktion; den gewünschten Namen aus borg list übernehmen
install -d -m 700 /var/lib/flipbase-restore
cd /var/lib/flipbase-restore
borg extract /srv/flipbase-borg/repository::nightly-YYYYMMDDTHHMMSSZ-XXXXXXXX

# Hauptserver: aus Borg übertragene private Kopie testen
python3 -B /opt/flipbase/test-backup-restore.py /var/lib/flipbase-restore
```

Der Restore-Test verwendet genau das im Manifest festgehaltene PostgreSQL-Abbild.
Auf einem neuen Server dieses passende Abbild zuerst verfügbar machen: den festen
Registry-Digest aus `database_image_reference` des Manifests laden und anschließend
die lokale Image-ID mit `database_image` abgleichen. Die frühen manuellen Pilotstände
enthalten noch keinen Registry-Digest; deren identisches Abbild war bereits vorhanden.
Für den
aktuellen Supabase-PG17-Aufbau muss `supabase_admin` auch im Ziel der Bootstrap-Superuser
sein: PostgreSQL 17 braucht dessen Grantor-Rechte. Der Test überspringt ausschließlich
die bereits von `initdb` angelegte `CREATE ROLE supabase_admin`-Zeile und behandelt
alle weiteren SQL-Fehler strikt. Den Abzug nicht durch pauschales Ignorieren von
Fehlern oder Entfernen aller Rechte passend machen.

Bei einer echten Wiederherstellung anschließend Konfiguration, ursprüngliche Rechte,
Storage-Dateien und den separaten `configuration/postgres-custom/pgsodium_root.key`
an ihre vorgesehenen Pfade zurückbringen. Der aktuelle lokale Storage-Pfad ist
`stub/stub/<bucket>/<object name>/<version>`. Abschließend Anmeldung, Bilder,
Geschäftsdaten und gegebenenfalls entschlüsselte Vault-Einträge in der isolierten
Installation prüfen, bevor produktive DNS-/Proxyumschaltung erfolgt.

Rootgeschützte Logs: `flipbase-backup.log` (Quelle), `flipbase-backup-pull.log`,
`flipbase-backup-retention.log` und `flipbase-backup-restore.log`. Der jüngste Restore
legt Diagnoseprotokolle unter `/var/lib/flipbase-backup-tests/` ab. Der Hauptserver
kennt keine Borg-Passphrase; diese Logs und Zustandsdateien werden nicht öffentlich ausgeliefert.

Quellen: [Borg-Aufbewahrung](https://borgbackup.readthedocs.io/en/stable/usage/prune.html),
[Borg-Schutzgrenzen bei Append-only](https://borgbackup.readthedocs.io/en/stable/usage/notes.html),
[PostgreSQL-Clusterabzug](https://www.postgresql.org/docs/17/app-pg-dumpall.html),
[Supabase-PG17](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17).
