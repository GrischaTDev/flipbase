# Kontrollierte Release-Pipeline

Stand 05.09.2026: Die Dateien sind vorbereitet, **nicht auf dem Server installiert**.
`RELEASE_MIGRATIONS_V1` ist noch nicht gesetzt. Solange die Repository-Variable
nicht genau `true` ist, bleibt der bisherige Migrationsabgleich vor dem Deployment
aktiv. Ein alter Server lehnt `release-v1` ab; das ist kein Grund, den Check zu umgehen.

## Ablauf und Bauzeit

| Bereich                      | Bisher                                    | Jetzt                                                                                            |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PR                           | Angular-Bau in Quality, Demo-E2E          | Unverändert                                                                                      |
| master                       | Angular-Bau in Quality und im Docker-Bau  | Ein Produktionsbau im Docker-Job                                                                 |
| Image                        | Direkt nach dem Bau veröffentlichen       | Lokal laden, HTTP/Build-SHA/JS/CSS prüfen, dasselbe Image veröffentlichen                        |
| Freigabe                     | Einzelne Jobs                             | Gemeinsamer Pflichtcheck aus Task 1                                                              |
| Datenbank                    | Historie prüfen, fehlende Dateien stoppen | Bis Bootstrap unverändert; danach geprüfte ausstehende Migrationen aus dem Image-Digest anwenden |
| Frontend ohne neue Migration | Historie prüfen                           | Historie prüfen, kein zusätzliches Backup                                                        |

Die Browserprüfungen verwenden weiterhin `ng serve` und die Demo-Konfiguration.
Das veröffentlichte Image wird weiterhin mit ausgeschaltetem Demo-Modus gebaut.
Der Image-Smoke liest ausschließlich HTTP und statische Dateien; er meldet sich
nicht an und schreibt keine Produktionsdaten. Die kurze isolierte DB-Prüfung läuft
nur bei der vorhandenen Supabase-Auswahl; diese umfasst jetzt auch Änderungen am
Release-/Backupweg. Keine zusätzliche Filterausgabe oder Artefaktplattform.

Gemessen: Die lokalen Shell-/Migrationsprüfungen auf isoliertem PostgreSQL 17.6
brauchten rund 0,6 Sekunden reine Testlaufzeit; Containerstart und Werkzeuginstallation
kamen hinzu. Die vollständige lokale Projektprüfung bestand. Die entfallene zweite
Angular-Kompilierung spart voraussichtlich deren bisherige Laufzeit. Netto-CI-Zeit
und Minutenersparnis sind **noch nicht gemessen**: Image-Laden und Smoke kommen hinzu,
parallel laufende Jobs bestimmen die Gesamtdauer. Nach dem ersten echten Lauf vergleichen.

## Freigabe einer neuen Migration

Das Release enthält SQL unter `/opt/flipbase/migrations`, außerhalb des Nginx-Webroots.
Die Liste `deploy/approved-migrations.sha256` ist absichtlich zunächst **leer**.
Sie ist kein Antrag auf pauschale Freigabe der 22 ausstehenden Altupdates.

Neue ungefährliche Änderungen werden im normalen Code-Review freigegeben. Nach
Prüfung genau dieser unveränderten Datei ihren SHA256 samt **Basename** eintragen:

```bash
cd supabase/migrations
sha256sum 20260905000000_example.sql
```

Die Ausgabezeile kommt in `deploy/approved-migrations.sha256`. Pro Datei genau ein
Eintrag; keine Pfade, Kommentare oder Wildcards. Datei und Freigabe werden zusammen
reviewt. Nach erfolgreichem Review und Merge ist keine weitere manuelle
Produktionsarbeit pro solcher Migration nötig.

Die Freigabe bestätigt ausdrücklich: vollständig transaktionales SQL, keine eigenen
`begin`/`commit`/`rollback`, keine psql-Metabefehle, keine Änderungen an
`supabase_migrations`, keine externen Seiteneffekte und keine nichttransaktionalen
Operationen wie `create index concurrently`. Keine Löschung, verlustbehaftete
Typumwandlung oder Datenumschreibung ohne gesonderte Planung. Der Runner ersetzt
diese inhaltliche Prüfung nicht durch einen selbstgebauten SQL-Parser.

Solche riskanten oder nichttransaktionalen Änderungen bleiben außerhalb dieser
Liste: eigener geprüfter Ablauf mit Wartungsfenster, Backup/Restoreplan,
Kompatibilitätsprüfung und nachgewiesener Historienregistrierung. Bei Fehlern nicht
blind die Historie nachtragen oder denselben nichttransaktionalen Schritt wiederholen.
Bestehende Migrationsdateien niemals nachträglich verändern.

## Einmaliger Serverbootstrap durch den Betreiber

Diese Schritte sind Voraussetzungen, **kein Bestandteil dieser Umsetzung auf dem Server**:

1. Betreiberzugang getrennt vom eingeschränkten CI-Schlüssel verwenden. Aktuelle
   Serverdateien sichern und Unterschiede prüfen. `/opt/flipbase/deploy.sh`,
   `/opt/flipbase/apply-release-migrations.sh` und `/opt/flipbase/migration-backup.sh`
   aus genau dem geprüften Commit mit Eigentümer `root:root` und Modus `0700`
   installieren. Verzeichnis `/opt/flipbase` darf nicht für andere Benutzer schreibbar sein.
2. Die bestehende `/opt/flipbase/docker-compose.yml` mit
   `deploy/docker-compose.app.yml` abgleichen und die neue `FLIPBASE_IMAGE`-Auswahl
   übernehmen; sonstige Serveranpassungen erhalten. Mit einem bekannten Digest
   `FLIPBASE_IMAGE=ghcr.io/grischatdev/flipbase@sha256:<64-hex> docker compose config --images web`
   aus `/opt/flipbase` prüfen. Die Ausgabe muss genau dieser Digest sein.
   Das Deployskript prüft dies ebenfalls vor jeder Migration.
3. Docker Compose, Bash, `flock`, `sha256sum`, `age`, `gzip`, `rsync` und SSH müssen
   verfügbar sein. Der PostgreSQL-Container heißt `supabase-db`, Datenbank `postgres`,
   Rolle `postgres`. Bestehende Historie verlangt `version` als eindeutigen Schlüssel
   und `name`; `statements` wird nicht beschrieben und darf fehlen. Der Runner erstellt
   oder repariert die Historie bewusst nicht. Lesend prüfen:
   `docker exec supabase-db psql -X -U postgres -d postgres -c 'select version, name from supabase_migrations.schema_migrations limit 0'`.
   Fehlende Spalten sind ein Bootstrapfehler; keine Tabellen auf Verdacht anlegen.
4. Der öffentliche age-Empfängerschlüssel liegt unter
   `/opt/flipbase/sicherung-schluessel.pub`. Privaten Schlüssel getrennt und geschützt
   verfügbar halten. `/var/backups/flipbase` braucht Platz und Modus `0700`;
   Sicherungen erhalten `0600`. Der SSH-Schlüssel `/root/.ssh/flipbase-backup` darf
   auf `flipbackup@168.119.165.201:` nur hinzufügen. Hostschlüssel vorher über einen
   vertrauenswürdigen Weg verifizieren und hinterlegen; unbekannte Hosts brechen ab.
5. `migration-backup.sh` einmal ausdrücklich prüfen und eine entschlüsselte
   Wiederherstellung **in einer isolierten Umgebung** einschließlich Rollen testen.
   Keine Schlüssel oder Abzüge ins CI-Log kopieren. Erst nach erfolgreichem
   Wiederherstellungstest den Betreiberentscheid für den automatischen Weg treffen.
6. Den bisherigen `/opt/flipbase/apply-migrations.sh` außer Betrieb nehmen und
   vorhandene Aufrufer entfernen. Er registriert Historie getrennt vom SQL. Alle
   anderen DB-/Deploymentarbeiten müssen dieselben Sperren beachten:
   `/opt/flipbase/deploy.lock`, danach `/opt/flipbase/migrations.lock`. Es gibt keinen
   Schutz gegen einen Betreiber, der parallel direkt SQL außerhalb dieser Sperren ausführt.
7. Die 22 bisher fehlenden Versionen separat mit der echten Historie und dem Schema
   abgleichen und einzeln nach Risiko planen. Nicht automatisch in die Freigabeliste
   aufnehmen; keinen Stand als angewendet markieren, nur um das Deployment zu entsperren.
8. Forced command in `authorized_keys` bleibt ausschließlich `/opt/flipbase/deploy.sh`
   mit den bestehenden Einschränkungen. Kein allgemeiner Shell-/scp-Zugang für den
   CI-Schlüssel. Erst nach Bootstrap, Backlogprüfung und Backup-/Restoretest die
   Repository-Variable `RELEASE_MIGRATIONS_V1=true` setzen. Nicht nur den CI-Check entfernen.

Der neue erlaubte SSH-Befehl lautet ausschließlich `release-v1 sha256:<64-hex>`.
Registry-Anmeldung erfolgt über stdin in einem privaten temporären Docker-Verzeichnis.
Dieses wird auch beim Abbruch entfernt. Image und SQL kommen aus demselben Digest;
beim Start wird ebenfalls dieser Digest verwendet. Beliebige Uploadpfade oder
zusätzliche Argumente akzeptiert der Deploy-Schlüssel nicht.

## Fehler, Sicherung und Rückfall

Eine lokale Dateisperre hält die ganze Auslieferung zusammen; der interne Runner
sperrt zusätzlich alle von ihm ausgeführten Migrationen. Er prüft alle ausstehenden
Freigaben vor dem Backup, wendet sie sortiert an und registriert jede in derselben
Transaktion. Ein Fehler stoppt vor dem Containerstart. Bereits erfolgreich
abgeschlossene Migrationen bleiben erhalten; der nächste Lauf überspringt sie.
Die vollständige erwartete Historie wird vor dem Rollout erneut geprüft.

Jeder Lauf mit ausstehenden freigegebenen Migrationen erstellt eine **neue**
DB-Sicherung. `pg_dumpall | gzip | age` schreibt keinen unverschlüsselten Abzug auf
die Platte. Abzug, Verschlüsselung, nichtleere age-Datei und erfolgreiche Auslagerung
müssen alle gelingen. Das tolerantere nächtliche `backup.sh` wird dafür nicht benutzt.
Die nächtliche Sicherung von Storage und Konfiguration bleibt zusätzlich erforderlich.
Bei Auslagerungsfehler bleibt die verschlüsselte lokale Kopie erhalten, das Release stoppt.
Die bestehende nächtliche Aufbewahrung entfernt auch alte Release-Sicherungen nach 14 Tagen.

Eine erfolgreiche Verschlüsselung oder Übertragung beweist **keine** Wiederherstellbarkeit.
In dieser Sitzung wurde keine Produktionssicherung entschlüsselt oder wiederhergestellt.
Der Abzug enthält sensible Nutzerdaten und Rollen; Schlüssel und Abzug getrennt schützen.
Wiederherstellung verliert gegebenenfalls Änderungen seit dem Sicherungszeitpunkt und
braucht einen abgestimmten Stillstand. Storage/DB müssen beim Restore zusammenpassen.

Ein fehlerhafter Frontendstart oder Landing-Abgleich macht das Deployment rot.
Die Datenbank wird danach nicht automatisch zurückgesetzt. Migrationen müssen mit
der vorherigen und der neuen Anwendung kompatibel sein; zuerst erweitern, spätere
Entfernung gesondert planen. Rückfall auf einen älteren Digest erst nach dieser
Prüfung, nicht als vermeintliche Datenbank-Rückmigration.

Der Status von Branch Protection konnte per GitHub-API nicht bestätigt werden
(HTTP 403). Ein vorhandener oder neuer Schutz wird hier nicht behauptet.
