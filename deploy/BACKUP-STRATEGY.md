# Vorschlag für die Flipbase-Datensicherung

Stand: 07.10.2026. Recherche, beauftragte Bereinigung und danach Umsetzung mit
erfolgreichem manuellem Borg-Pilot und isoliertem PostgreSQL-Restore. Die produktiven
Zeitpläne wurden noch nicht umgeschaltet. Die konkrete Umsetzung verwendet Borg
ausschließlich auf dem Backupserver und einen Leseschlüssel zum Hauptserver:
[Betrieb, Umschaltung und Wiederherstellung](BACKUP-OPERATIONS.md).
Der Vorschlag berücksichtigt die Nutzerkorrektur: Ein-Personen-Projekt ohne aktuelle
Nutzer, später voraussichtlich 50–100 Nutzer. Der vorherige pauschale Stunden-Vorschlag
wird durch einen gestuften, einfacheren Aufbau ersetzt.

## Entscheidung

Die tägliche vollständige Kopie aller Bilder ist nicht erforderlich. Benötigt werden
wiederherstellbare Stände, mehrere voneinander unabhängige Kopien und ein Schutz
gegen das Löschen der Sicherungen durch einen kompromittierten Anwendungsserver.
Eine lokale Sicherung auf derselben Partition hilft bei Bedienfehlern, schützt aber
nicht vor dem Verlust dieses Servers. Die Zahl der Stände ist keine Zahl vollständiger
Dateikopien: unveränderte Dateien können von mehreren Ständen gemeinsam genutzt werden.

Für den jetzigen Entwicklungsbetrieb ist ein täglicher Lauf plus Sicherung vor
Migrationen ein pragmatischer Vorschlag. Bei erfolgreichem täglichem Lauf können
dadurch bis zu ungefähr 24 Stunden neue Änderungen fehlen. Das ist ein vorgeschlagener
Kompromiss, keine bereits erteilte Zustimmung zu Datenverlust. Vor echten Nutzern mit
Geschäftsdaten sollte das Verlustziel erneut festgelegt werden: Stündliche logische
Dumps sind eine einfache nächste Stufe. Kontinuierliche Archivierung ist erst bei
entsprechendem Verlustziel oder zu langsamen Dumps nötig; 100 Nutzer allein verlangen sie nicht.
Die Wiederanlaufzeit muss durch einen vollständigen Restore gemessen werden.

## Aktuell geprüft

| Bereich                                 | Befund                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Nächtlicher Lauf                        | 03:30 Uhr; PostgreSQL einschließlich Rollen, Storage-Dateien und `.env`                                   |
| Verfahren                               | `pg_dumpall`, vollständiges `tar.gz`, anschließend age-Verschlüsselung und rsync                          |
| Letzter nächtlicher Lauf                | 07.10.2026, laut Produktionslog erfolgreich übertragen                                                    |
| Lokale Aufbewahrung                     | Sieben vollständige nächtliche Sätze und drei Release-DB-Sicherungen                                      |
| Lokaler Sicherungsordner                | Etwa 2,4 GiB                                                                                              |
| Datenbankdateien / hochgeladene Dateien | Etwa 2,1 GiB / 53 MiB                                                                                     |
| Kontinuierliche PostgreSQL-Archivierung | `archive_mode = off`; derzeit keine WAL-basierte Zeitpunktrücksicherung                                   |
| Separater Backupserver                  | Nach Bereinigung: Root-Partition 38 GiB, etwa 22 GiB belegt, 14,6 GiB verfügbar, 59 Prozent               |
| Flipbase-Sicherungen dort               | Etwa 4 GiB nach der einmaligen Bereinigung                                                                |
| Release-DB-Sicherungen dort             | Drei geschützte Dateien, 328.681.621 Bytes; 73 ältere Abzüge entfernt                                     |
| Nächtliche DB-Sicherungen dort          | 31 Dateien, 3.569.385.366 Bytes, ungefähr 3,32 GiB                                                        |
| Bild-/Dateisicherungen dort             | 31 Dateien, 374.433.684 Bytes, ungefähr 357 MiB                                                           |
| Konfigurationssicherungen dort          | 31 Dateien, 455.909 Bytes                                                                                 |
| Externe Bereinigung                     | Täglich 04:15 Uhr, ausschließlich `.age`-Dateien mit `mtime +30`                                          |
| Externe Schreibrechte                   | Erzwungenes `rrsync -wo -no-del` im eigenen Flipbase-Verzeichnis                                          |
| Privater Entschlüsselungsschlüssel      | Datei auf Produktion vorhanden, Modus 0600; zusätzliche Kopie außerhalb dieser Maschine nicht verifiziert |

Die allgemeine Backup-Passage in `deploy/README.md` nennt noch 14 lokale Tage.
Maßgeblich ist das produktive, mit dem Repository abgeglichene Bereinigungsskript
mit sieben Sätzen. Die externe 30-Tage-Altersregel behält ungefähr 31 Tagesstände
und alle Release-Abzüge innerhalb dieses Zeitraums; sie begrenzt deren Anzahl nicht.
Die einmalige Bereinigung ersetzt diese Regel nicht: Ohne die vorgeschlagene
Umstellung können sich wieder viele Release-Abzüge ansammeln. Der Lauf vom
07.10.2026 hat insgesamt etwa 10,96 GiB freigegeben, einschließlich älterer
Systemjournale und neun ungenutzter Worker-Images. Alle sechs Container liefen
mit unveränderten IDs, Images und Startzeiten weiter; alle 24 geschützten lokalen
Sicherungsdateien wurden vor und nach der Bereinigung auf dem zweiten Server
per SHA-256 verifiziert.

Der lokale SSH-Vertrauenseintrag für den Backupserver war veraltet. Für die lesende
Prüfung wurde dessen ED25519-Schlüssel mit dem Eintrag auf dem bereits vertrauten
Produktionsserver verglichen und vorübergehend ausdrücklich festgelegt. Die
bestehende lokale `known_hosts`-Datei wurde nicht verändert, die temporäre Datei entfernt.
Es wurden weder Schlüsselmaterial ausgelesen noch Kundendaten heruntergeladen.

## Welche Daten gesichert werden müssen

- Datenbank mit Geschäftsdaten, Anmeldung, Rollen, Rechten und Storage-Metadaten.
- Die tatsächlichen hochgeladenen Bilder und Belege, getrennt vom Datenbankabzug.
- Produktionskonfiguration einschließlich Compose-Ergänzungen, Proxy-Einstellungen,
  erforderlicher Geheimnisse, installierter eigener Funktionen und Versionsangaben.
- Wiederherstellungsanleitung und unabhängig erreichbare Entschlüsselungsschlüssel.

Anwendungscode und reproduzierbare Images benötigen keine unbeschränkte lokale
Versionshistorie. Ein definiertes funktionierendes Release muss dennoch nach einem
Serververlust beschaffbar sein. Kurzlebige Feedfunde und Caches sind nicht mit
Geschäftsdaten gleichzusetzen; eine Auslassung aus dem Datenbankbackup wäre eine
gesonderte fachliche Entscheidung und wird hier nicht umgesetzt.

## Warum der zweite Server voll ist

Er ist kein reiner Backupserver: Die Root-Partition hat nur etwa 38 GiB und betreibt
auch n8n, Caddy, Notebase-Synchronisierung, einen Twitch-Miner, einen Worker und Watchtower.
Die neue Messung zeigt 33 GiB belegt, 3,5 GiB verfügbar und 91 Prozent Belegung.

| Verzeichnis / Inhalt                                       | Belegung                                          |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Flipbase-Sicherungen                                       | Etwa 14 GiB, davon knapp 10 GiB Release-DB-Abzüge |
| `/var/lib/docker`, ohne zusätzliche Dateisysteme zu zählen | Etwa 8,0 GiB                                      |
| VS-Code-Server und Insiders unter `/root`                  | Etwa 4,6 GiB                                      |
| `/var/log`                                                 | Etwa 2,1 GiB; davon 1,8 GiB Systemjournal         |
| `/usr`                                                     | Etwa 2,3 GiB                                      |

Docker meldet 24 Images mit 5,717 GB und davon 3,971 GB theoretisch freigebbar.
Die Schreibweise GB folgt hier Docker; die Verzeichniszahlen sind GiB. Aktive
Container, Volumes, absichtlich gehaltene Rückfallversionen und die VS-Code-Nutzung
müssen vor einer tatsächlichen Bereinigung geprüft werden. Die Verzeichnisgrößen
überschneiden sich nicht; Docker-Gesamtgrößen dürfen nicht zusätzlich addiert werden.
Diese Bestandsaufnahme war ausschließlich lesend. Anschließend wurden im beauftragten
Bereinigungslauf alte Release-Abzüge, ungenutzte Worker-Images und archivierte
Systemjournale entfernt; Daten der dort betriebenen Anwendungen blieben erhalten.

## Empfohlener Aufbau

| Gegenstand          | Schlanker Startvorschlag                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sicherungslauf      | Ein geplanter Lauf pro Nacht: konsistenter DB-Abzug einschließlich Rollen, Dateien und benötigte Konfiguration                                                       |
| Dateisicherung      | Ein Werkzeug, z. B. Restic, verschlüsselt und mit Wiederverwendung unveränderter Dateien; vorhandenen externen Server nach begrenzter Bereinigung weiterverwenden    |
| Historische Stände  | Sieben Tagesstände und vier Wochenstände; Überschneidungen zählen nicht doppelt                                                                                      |
| Release-Sicherungen | Lokal und extern drei jüngste geprüfte Punkte; laufende/fehlgeschlagene Migrationen zusätzlich schützen                                                              |
| Produktionsplatte   | Höchstens ein aktueller geprüfter nächtlicher Satz und begrenzter temporärer Arbeitsbereich; keine sieben dauerhaften Vollkopien der Bilder                          |
| Überwachung         | Ein Fehler-/Alterssignal für den letzten vollständig übertragenen Lauf und Platz auf beiden Servern                                                                  |
| Wiederherstellung   | Ein vollständiger isolierter Test vor der Umstellung; danach regelmäßig und nach wesentlichen Änderungen                                                             |
| Erste echte Nutzer  | Verlustziel prüfen; bei höchstens einer Stunde akzeptiertem Verlust den vorhandenen logischen Dump-Lauf häufiger starten, ohne sofort neue Infrastruktur einzuführen |
| Später bei Bedarf   | Zweites unabhängiges Sicherungsziel oder physische DB-Backups mit WAL, jeweils anhand eines konkreten Ausfall-/Verlustziels                                          |

Alle Häufigkeiten und Aufbewahrungszahlen sind ein Flipbase-Vorschlag, keine
Sicherheitsnorm. Die vereinfachte Startlösung ist noch kein vollständiger 3-2-1-Aufbau:
Die lokale Kopie auf der Produktionsplatte ist kein unabhängiger Ausfallbereich.
Ein Stundenintervall garantiert außerdem nicht exakt eine Stunde Verlust:
Laufzeit, Übertragung, Fehler und Erkennung müssen in das tatsächliche Ziel eingehen.
Unterschiedlich häufig aktualisierte Ziele haben unterschiedliche wiederherstellbare Stände.

Restic sichert rohe Dateien beziehungsweise konsistent erzeugte Datenbankabzüge.
Die heutigen täglich neu gepackten und age-verschlüsselten Archive in Restic zu
legen wäre kein sinnvoller Ersatz: Komprimierung und neue Verschlüsselung verhindern
die gewünschte Wiederverwendung weitgehend. Restic muss auf die Originaldateien
beziehungsweise vor der gesonderten Verschlüsselung zugreifen. Bei Datenbank-Dumps
ist die erzielbare Wiederverwendung gesondert zu messen; sie ist nicht so gut
vorhersagbar wie bei unveränderten Bilddateien.

Eine laufende PostgreSQL-Datendatei darf nicht einfach wie ein Foto kopiert werden.
Physische Datenbankbackups müssen PostgreSQLs Sicherungsprotokoll einhalten.
Logische Dumps lassen sich nicht nachträglich durch WAL zu PITR-Backups erweitern.
Dateisicherung und Datenbankstand brauchen ein abgestimmtes Konsistenzverfahren:
Upload/Löschung während der Sicherung berücksichtigen, fehlende referenzierte
Objekte ausschließen und die gewählte Reihenfolge im Restore testen. Die vorhandene
Backup-Sperre koordiniert Sicherungen und Deployments, hält Benutzeruploads aber nicht an.

## Blob-/Objektspeicher für Produktbilder

Ein Blob ist eine Binärdatei, kein Programmcode. Ein Objektspeicher speichert das
normale JPEG-, PNG- oder WebP-Bild samt Schlüssel/Pfad und Metadaten. In PostgreSQL
bleibt die Zuordnung zum Produkt. Eine Base64-Textdarstellung ist ein anderes Thema:
Sie vergrößert die Nutzdaten um ungefähr ein Drittel und spart keinen Speicher.
Objektspeicher komprimiert Fotos nicht automatisch; Upload-Komprimierung und kleinere
Vorschaubilder bleiben Aufgaben unserer Anwendung oder eines Bilddienstes.

Supabase Self-Hosting unterstützt einen S3-kompatiblen Speicher als Backend. Damit
können Rechte, private Buckets und die vorhandene Supabase-API erhalten bleiben,
während die tatsächlichen Dateien extern liegen. API-Zugangsdaten gehören auf den
Server. Die konkrete Konfiguration und Migration bestehender Dateien muss separat
getestet werden; nur den S3-API-Endpunkt einzuschalten lagert keine Dateien aus.

| Lösung                     | Passender Einsatz / Bewertung für Flipbase                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vorhandener zweiter Server | Günstigste erste Backup-Verbesserung ohne neue Bestellung. Release-Historie reduzieren, übrige Verbraucher begrenzen, ein verschlüsseltes Dateisicherungswerkzeug verwenden. Gemeinsame Nutzung und 38-GiB-Platte berücksichtigen.                                                                                                                                 |
| Hetzner Storage Box        | Verwaltetes Backupziel ab 1 TB, mit Borg/Restic-Zugriff. Sinnvoll, wenn wir Backups aus dem n8n-Server herausnehmen möchten; für nur wenige GiB kein aktueller Kapazitätszwang. Ein Backupziel, kein gleichwertiger öffentlicher S3-Bilddienst.                                                                                                                    |
| Cloudflare R2 Standard     | Für ein kleines Bilderarchiv besonders passend: 10 GB-Monate kostenlos, danach 0,015 USD je GB-Monat; 1 Million Class-A- und 10 Millionen Class-B-Anfragen frei. Direkter R2-Datenausgang kostenlos. EU-Jurisdiction ist wählbar.                                                                                                                                  |
| Hetzner Object Storage     | S3-Bildspeicher mit monatlichem Grundpreis und 1 TB Speicher sowie 1 TB Datenausgang inklusive. Gut für größere Mengen oder Konzentration bei Hetzner; bei aktuell etwa 53 MiB Bildern weniger bedarfsgerecht als nutzungsabhängiger R2-Speicher. Der dynamisch dargestellte aktuelle Grundpreis wurde nicht zuverlässig ausgelesen und wird hier nicht beziffert. |

Empfehlung: Zuerst die vorhandenen Sicherungen vereinfachen. Bildauslagerung ist
aktuell nicht dringlich, aber vor größerem Wachstum ein sauberer nächster Schritt.
R2 mit privatem EU-Bucket ist dafür der bevorzugte Kandidat. Aktueller Testbestand
kann innerhalb des Freikontingents liegen, einschließlich der Anfragegrenzen;
andere Nutzungen desselben Kontos und weitere Dienste zählen gesondert.

Rechenbeispiel, keine Nutzerprognose: 100 Nutzer × 200 Produkte × 5 Fotos × 250 KB
= 25 GB Bilder. Bei unverändertem Bestand über einen Monat ergeben 25 GB minus
10 GB Freikontingent etwa 0,23 USD reine R2-Speicherkosten. Anfragen außerhalb der
Freigrenzen, Vorschaubilder, Bildverarbeitung, Backupkopien, Steuern und etwaige
weitere Dienste sind darin nicht enthalten. Eine auf 50–100 Nutzer ausgelegte App
braucht deshalb nicht automatisch Terabytes oder einen neuen Datenbankcluster.

Objektspeicher ist kein Ersatz für eine historische unabhängige Sicherung. Nach
Auslagerung reicht unser bisheriges lokales Storage-Archiv nicht mehr: Die entfernten
Objekte müssen ebenfalls versionsichernd kopiert werden. Restic liest nicht direkt
beliebige S3-Quell-Buckets; dafür braucht es eine geprüfte Download-/Bereitstellung
der Quelldateien oder ein anderes geeignetes Objekt-Sicherungsverfahren. Ein reines
Synchronisieren mit Weitergabe von Löschungen ersetzt diese Sicherung nicht.

## Sicherheitsgrenzen

### Vergleich der Sicherungswerkzeuge

| Variante                      | Stärke                                                                                                     | Entscheidung für Flipbase                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Borg                          | Verschlüsselte, deduplizierte Archive über SSH auf vorhandenen Linux-Servern; eingeschränkter Serverzugang | Bevorzugt, wenn der vorhandene zweite Server das Backupziel bleibt                                                               |
| Restic                        | Verschlüsselte, deduplizierte Dateisicherung mit SFTP, REST und nativen S3-kompatiblen Zielen              | Bevorzugt, wenn die Sicherungen selbst direkt in einen S3-Dienst wandern sollen                                                  |
| Kopia                         | Dateisicherung mit GUI sowie integrierten Richtlinien für Zeitplanung, Komprimierung und Aufbewahrung      | Sinnvolle Alternative bei gewünschter Bedienoberfläche; für unseren einzelnen nächtlichen Serverlauf kein belegter Mehrwert      |
| BorgBase mit Borg oder Restic | Anbieter betreibt den Sicherungsspeicher, unterstützt Append-only-Zugänge und Überwachung                  | Option bei höherem Wunsch nach weniger Zielserver-Wartung; Einrichtung des lokalen Laufs und Restore-Test bleiben unsere Aufgabe |

Diese Varianten sind keine vier zusätzlich benötigten Bausteine. Für Flipbase
genügt eines dieser Werkzeuge mit einem passenden Ziel. Die Wahl richtet sich nach
dem Backupziel und Betriebsaufwand, nicht nach der späteren Nutzerzahl allein.
Ein Wechsel des produktiven Bildspeichers zu R2 macht Restic nicht automatisch
erforderlich: S3 als Quell-Bildspeicher und S3 als Sicherungsziel sind unterschiedliche
Entscheidungen. Beide Werkzeuge benötigen ein eigenes Verfahren, um entfernte
Bildobjekte als Sicherungsquelle bereitzustellen. Beide ersetzen ebenso wenig einen
konsistenten PostgreSQL-Dump. Unterschiedliche Datenmengen, Laufzeit und verbrauchter
Platz müssen am echten Bestand verglichen werden; es gibt hier keinen Benchmark,
der eine allgemeine Überlegenheit von Borg oder Restic belegt.

Für die vorhandenen zwei Linux-Server ist Borg über den bereits vorhandenen SSH-Zugang
der bevorzugte einfache Kandidat: Deduplizierung und Verschlüsselung in einem Werkzeug,
kein zusätzlicher dauerhaft offener Dienst. Ein eingeschränkter `borg serve`-Zugang
mit Append-only-Rechten ist getrennt vom administrativen Bereinigungszugang zu betreiben.
Auch hier müssen Wiederherstellung und Schutz alter Archives konkret getestet werden;
es wird kein pauschaler Zugriff mit dem vorhandenen Root-Schlüssel als Backupzugang empfohlen.
Restic bleibt eine gleichwertige Option, besonders bei einem späteren S3-Backupziel.

Das heutige `rrsync -wo -no-del` kann nicht unverändert als Restic-Transport dienen.
Restic benötigt ein geeignetes Backend und Lesezugriff auf Repository-Metadaten.
Für Restic ist ein getrenntes Append-only-Backend eine Option; Zugangsdaten zum
Löschen und Bereinigen gehören auf einen getrennten vertrauenswürdigen Rechner,
nicht auf den Produktionsserver. Die Löschrichtlinie muss die Hinweise zu
manipulierten Snapshot-Zeitstempeln und `--keep-within` aus der Restic-Dokumentation
berücksichtigen. Ein einfacher Wechsel auf uneingeschränkten SFTP-Zugriff wäre eine
Verschlechterung des bestehenden Schutzes.

Ein zweiter Server bei demselben Anbieter ist nicht automatisch ein unabhängiger
Standort oder eine Absicherung gegen den Verlust des gemeinsamen Anbieterzugangs.
Diese Eigenschaften sind für unsere beiden Server noch nicht verifiziert.
Sicherungen ersetzen keine dauerhafte Ablage der Originalbelege in der Anwendung.

## Sichere Umstellung

1. Den täglichen Startkompromiss und die Aufbewahrung bestätigen, Schlüssel außerhalb
   des Produktionsservers bestätigen und Wiederanlaufziel festlegen.
2. Platz auf dem zweiten Server schaffen: konkrete Release-Auswahl mit Schutzregeln
   vorlegen. Bis dahin keine Dateien löschen; auch beim neuen Verfahren braucht
   die erste vollständige Übertragung Platz.
3. Neues Dateisicherungsziel mit unverändertem Löschschutz getrennt einrichten.
   Konfigurationsinventar und Datenbank-/Storage-Konsistenz ergänzen.
4. Initiale Sicherung erstellen, weitere Änderung und Löschung kontrolliert auf
   Testdaten sichern; beide Zeitstände auf eine isolierte Umgebung zurückspielen.
5. Erst nach erfolgreichem Komplett-Restore und Überwachungsprobe den alten täglichen
   Storage-Vollkopierlauf ablösen und die neue Aufbewahrung anwenden.

Die bestehende Sicherung läuft während dieser Recherche unverändert weiter.
Es wurden keine neuen Dienste installiert, Sicherungen entfernt oder Berechtigungen geändert.

## Quellen

- [Canadian Centre for Cyber Security: 3-2-1, getrennte Kopien und Wiederherstellungstests](https://www.cyber.gc.ca/en/guidance/tips-backing-your-information-itsap40002)
- [BSI: Datensicherungskonzept, einschließlich Wiederherstellbarkeit und Verlustziel](https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Grundschutz/IT-GS-Kompendium_Einzel_PDFs_2023/03_CON_Konzepte_und_Vorgehensweisen/CON_3_Datensicherungskonzept_Edition_2023.pdf?__blob=publicationFile&v=3)
- [Supabase: Konfigurationssicherung ersetzt keine PostgreSQL-/Storage-Sicherung](https://supabase.com/docs/guides/self-hosting/updating)
- [Restic: Dateisicherung und Wiederverwendung unveränderter Inhalte](https://restic.readthedocs.io/en/stable/040_backup.html)
- [Restic: Aufbewahrung und Schutzgrenzen bei Append-only](https://restic.readthedocs.io/en/stable/060_forget.html#security-considerations-in-append-only-mode)
- [PostgreSQL 17: Kontinuierliche Archivierung und PITR](https://www.postgresql.org/docs/17/continuous-archiving.html)
- [pgBackRest: Voll-, differenzielle und inkrementelle Datenbanksicherungen](https://pgbackrest.org/user-guide.html)
- [Microsoft: Was Blob-/Objektspeicher speichert](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-overview)
- [Supabase: S3-Backend und S3-Endpunkt sind unterschiedliche Funktionen](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
- [Cloudflare R2: Preise und Freikontingente](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2: EU-Jurisdiction statt unverbindlichem Standort-Hinweis](https://developers.cloudflare.com/r2/reference/data-location/)
- [Hetzner: Storage Box ab 1 TB](https://www.hetzner.com/de/storage/storage-box/)
- [Hetzner: Backupwerkzeuge und Append-only](https://docs.hetzner.com/storage/storage-box/access/access-ssh-rsync-borg/)
- [Hetzner: Object Storage mit Grundpreis und 1-TB-Kontingent](https://www.hetzner.com/de/storage/object-storage/)
- [Borg: Deduplizierung, Verschlüsselung und bestehender SSH-Transport](https://borgbackup.readthedocs.io/en/stable/index.html)
- [Borg: Eingeschränkter Serverzugang](https://borgbackup.readthedocs.io/en/stable/usage/serve.html)
- [Restic: SFTP-, REST- und S3-Sicherungsziele](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
- [Kopia: Richtlinien und Dateisicherung](https://kopia.io/docs/faqs/)
- [BorgBase: Gehostete Borg-/Restic-Sicherungsziele](https://www.borgbase.com/)
