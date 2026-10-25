# Historische Vinted-Chatpositionen korrigiert

Datum: 17. Oktober 2026. Assistent: Juna.

Der Nutzer hat die nachträgliche Korrektur bereits hochgeschobener Chats ausdrücklich beauftragt. Die bereits veröffentlichte Fehlerbehebung aus PR #433 verhindert neue Verfälschungen. Für alte Fälle wurde ausschließlich die lokale Lesekopie in der Produktionsdatenbank korrigiert. Es gab weder einen Anbieterabruf noch eine Nachricht, eine Lesebestätigung auf Vinted oder einen neuen Synchronisationsauftrag.

## Ergebnis

Alle 68 ursprünglich betroffenen Chats in drei eigenen Vinted-Konten sind bereinigt. Davon reparierte der laufende Cloud-Abgleich drei während der Prüfung. 62 Chats wurden aus vorhandenen Nachrichten und Angeboten korrigiert; bei drei weiteren lieferten historische Sicherungen den früheren Stand. Kein unklarer Fall blieb übrig.

Die 76 gespeicherten Verfügbarkeitsmeldungen bleiben mit unverändertem Inhalt im Verlauf. Die Chatposition richtet sich wieder nach der belegten früheren Aktivität. Angebote ohne Nachrichtentext und die drei historischen Fälle erhalten eine leere Vorschau; es wurde kein Vorschautext erfunden. Gelesen-Status, Listenrevision, Detailbestätigung und Abrufzeit wurden beim Reparaturlauf nicht geändert.

## Eingrenzung und Sicherung

Ein eindeutig zur konfigurierten Nutzeradresse passender Benutzer mit Eigentümer-/Adminmitgliedschaften begrenzt den Zugriff auf dessen zwei Workspaces. Nur Vinted-Verbindungen dieser Workspaces kamen infrage. Die Ausgangsprüfung erfasste 726 Kontoeinträge, darunter 134 Gespräche und 557 Nachrichten.

Vollständige Ausgangszeilen, Pläne und Vorher-/Nachherbelege bleiben ausschließlich im geschützten Serververzeichnis `/opt/flipbase-marketplace/chat-history-repair-20261017` (0700; Datendateien 0600). Historische Originalzeilen bleiben ausschließlich auf dem Sicherungsserver unter `/var/lib/flipbase-backup/chat-history-repair-20261017`. Keine Zugangsdaten oder privaten Nachrichtentexte wurden in das Projektprotokoll übernommen.

Die acht vorhandenen Borg-Sicherungen wurden lesend ausgewertet, ohne Datenbankwiederherstellung. Für die drei fehlenden früheren Stände waren `nightly-20261016T033005Z-0dbb069f` und `nightly-20261007T095757Z-a83c4e41` maßgeblich. Die tatsächlichen Aktivitätszeiten vom 3. Oktober stimmen zwischen früherer Vorschauzeit, Listenrevision und Sortierzeit überein. Konto, Workspace und Gesprächskennung stimmen mit der heutigen Zeile überein.

## Schutz und tatsächliche Prüfungen

15 synthetische Planerfälle bestanden: Systemstatus, echte gleichlautende Nachrichten, Angebote ohne Text, fehlende Vorgeschichte, fremde Gesprächszuordnung, mehrdeutige gleiche Zeitpunkte, unbelegte Abrufzeiten, Sortierfehler und erneute Anwendung. Der erste lokale Teststart deckte eine Namenskollision des einmaligen Inspektionsskripts mit dem Python-Standardmodul auf; Datei umbenannt, unveränderte Testgruppe erfolgreich. Docker wurde dafür nicht gestartet.

Ein erster Produktionsprobelauf brach vor der Korrektur vollständig ab: Der reguläre Cloud-Abgleich hatte zwischen Sicherung und Prüfung 46 Abrufzeiten und mehrere Chatwerte aktualisiert. Nach erneuter Bestandsprüfung passte der Plan für 62 noch betroffene Chats. Keine Schutzbedingung wurde abgeschwächt.

Beide Reparaturläufe wurden jeweils zuerst in einer Transaktion mit Rollback geprobt. Kurze Tabellensperre, bestehende Importsperre, Sperr-/Anweisungszeitlimit und exakter Vorhervergleich verhinderten Überschreiben neuerer Daten. Anschließend erfolgten dieselben Änderungen mit Commit und unmittelbarer unabhängiger Nachprüfung. Geändert wurden ausschließlich `sort_at`, `body.occurredAt` und `body.text` der konkreten Zielgespräche.

Innerhalb beider Transaktionen wurden alle übrigen Kontoeinträge vollständig auf Unverändertheit geprüft. Fingerabdrücke der Nachrichtennotifikationen, Verhandlungsaufträge und Verhandlungsthreads blieben gleich. Nachrichtenzeilen wurden nicht verändert.

Die abschließende Prüfung bestätigt 68 bereinigte Ausgangsfälle, drei betroffene Konten, alle 76 Verfügbarkeitsmeldungen mit unverändertem Inhalt, keine verbleibenden Reparaturfälle und einen gesunden Cloud-Worker. Die Anwendung und das Datenbankschema wurden nicht geändert; ein neuer Anwendungsbau oder erneuter Rollout war deshalb nicht erforderlich.
