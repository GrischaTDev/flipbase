# Kontrollierte Release-Pipeline

Aktueller CI-Ablauf: [Einmal prüfen, anschließend veröffentlichen](../docs/development/ci-validation.md).
Die folgenden Versions-/Bootstrap-Nachweise dokumentieren den damaligen Stand,
nicht die jeweils neueste produktive Commit-ID.

Stand 05.09.2026: Die Deployment-Dateien sind auf dem Server installiert und die
alten Dateien unter `/opt/flipbase/release-bootstrap-20260905/original` gesichert.
Der alte Migrationshelfer wurde wiederherstellbar außer Betrieb genommen.
**Produktionsmigration und Deployment sind abgeschlossen.**
PR #19 ist gemergt; Produktionslauf `33931627849`, Versuch 3, ist vollständig
erfolgreich. Produktiv sind 76 Migrationen registriert. Die 23 Updates wurden
nach frischer lokaler und externer Sicherung gemeinsam in einer Transaktion
eingespielt; die geprüften Geschäftszahlen blieben unverändert.
`RELEASE_MIGRATIONS_V1=true` ist aktiviert und der neue Weg tatsächlich in der
Action geprüft. Öffentlich wird Commit `6bfaefb33ffb6fd4d3ba32f2edb6e95cf10fb744`
aus dem gesunden Image-Digest
`sha256:fb29dd9782a27a83f8e7272ad2a9198ca4b859ad2847f2febcd0b0fb5e14d95c` ausgeliefert.
Die vier isolierten Wiederherstellungscontainer wurden entfernt; verschlüsselte
Sicherungen, geschützte Betriebsprotokolle und gesicherte Serverdateien bleiben erhalten.

Die nachstehenden Bootstrap-Schritte dokumentieren die Voraussetzungen und wurden
auf diesem Server erfüllt. Ein unvorbereiteter Server darf den Check nicht umgehen.

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

## Automatische Paketierung und Freigabe im PR

Das Release enthält SQL unter `/opt/flipbase/migrations`, außerhalb des Nginx-Webroots.
`scripts/package-migrations.mjs` kopiert beim Docker-Bau sämtliche SQL-Dateien
unverändert in ein neues Paket und erzeugt SHA-256-Prüfsummen daraus. SQL und Liste
werden gemeinsam aus derselben Build-Stufe ins Image kopiert. Die handgepflegte
Datei `deploy/approved-migrations.sha256` entfällt. Der Paketname `approved.sha256`
bleibt für den vorhandenen Server-Runner erhalten; es ist jetzt eine technische
Integritätsliste, keine gesonderte manuelle SQL-Freigabe.

Die frühe CI-Prüfung erkennt Änderungen an Schema-Dateien ohne neue Migration,
Änderungen/Löschungen bestehender Migrationen, ungültige Namen, leere Dateien und
doppelte Versionen. Sie beweist nicht, dass jede Schemaänderung vollständig in SQL
übertragen wurde. Das bleibt Aufgabe von Review und Datenbanktests. Auch reine
Kommentaränderungen an Schema-SQL werden von dieser konservativen Dateiprüfung erfasst.

**Der Review/Merge der SQL-Dateien ist die inhaltliche Freigabe.** Vor Merge prüfen:
vollständig transaktionales SQL, keine eigenen
`begin`/`commit`/`rollback`, keine psql-Metabefehle, keine Änderungen an
`supabase_migrations`, keine externen Seiteneffekte und keine nichttransaktionalen
Operationen wie `create index concurrently`. Keine Löschung, verlustbehaftete
Typumwandlung oder Datenumschreibung ohne gesonderte Planung. Der Runner ersetzt
diese inhaltliche Prüfung nicht durch einen selbstgebauten SQL-Parser.

Solche riskanten oder nichttransaktionalen Änderungen dürfen nicht als ausstehende
normale Release-Migration gemergt werden: eigener geprüfter Ablauf mit Wartungsfenster, Backup/Restoreplan,
Kompatibilitätsprüfung und nachgewiesener Historienregistrierung. Bei Fehlern nicht
blind die Historie nachtragen oder denselben nichttransaktionalen Schritt wiederholen.
Bestehende Migrationsdateien niemals nachträglich verändern.

Der Server prüft weiterhin die Prüfsummen, sichert vor ausstehenden Migrationen,
schreibt jeweils SQL und Historie in einer Transaktion und startet das neue
Frontend erst nach erfolgreicher Anwendung. Bereits registrierte Migrationen
werden nicht wiederholt. Ein neuer/unvorbereiteter Server braucht weiterhin den
geprüften Bootstrap; die automatische Liste ist keine Erlaubnis, einen unbekannten
alten Migrationsrückstand ungeprüft einzuspielen.

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
Am 05.09.2026 wurde eine frische verschlüsselte Produktionssicherung einschließlich
Rollen auf demselben Host in PostgreSQL 17.6 mit `--network none`, ohne veröffentlichte
Ports und ohne Produktionsvolumes wiederhergestellt. PostgreSQL verlangt dabei
den ursprünglichen Bootstrap-Rollennamen `supabase_admin`; dessen bereits durch
`initdb` erfolgte Rollenerstellung wird genau einmal im Dump ausgelassen. Alle
Rollenattribute und Mitgliedschaften werden wiederhergestellt. Der Eigentümer
der vorhandenen Datenbank `postgres` wird nachweislich wie auf der Quelle auf
`postgres` gesetzt. Die Wiederherstellung bricht bei jedem weiteren SQL-Fehler ab.

Die Probe spielte anschließend alle 22 Altupdates und die zusätzliche Rechtekorrektur
ein. Alle 24 SQL-Testdateien bestanden (986 Assertions); geprüfte Geschäftszahlen
und Mengen blieben unverändert. Nur für Test-Fixtures erhielt `postgres` auf der
Kopie das Recht zum Setzen von `session_replication_role`; produktive Rollenrechte
werden dafür nicht erweitert. Ein Vorher-/Nachhervergleich im Altdaten-Test wurde
auf denselben Workspace eingegrenzt, damit fremde bestehende Verkäufe nicht allein
durch den Rollenwechsel einen Fehlalarm auslösen.

Wichtig: Bestehendes Self-Hosting hat anonyme Standardfreigaben, die frische CLI-
Datenbanken nicht mehr besitzen. Deshalb wurde die Korrektur mit dem historischen
Freigabeverhalten generiert und am echten Wiederherstellungsstand geprüft. Sie
entzieht nur direkte `anon`-Rechte im Anwendungsschema `public` und entsprechende
Defaults des Migrationsbenutzers `postgres`; fachliche Daten bleiben unverändert.
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
