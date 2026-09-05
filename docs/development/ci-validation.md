# Einmal prüfen, anschließend veröffentlichen

## Normaler Ablauf

1. Lokal die betroffene Funktion testen. Format/Lint für geänderte Dateien,
   bei Angular-Änderungen auch den Bau, bei SQL die passenden Datenbanktests.
2. Branch pushen und PR öffnen. Dort laufen Qualität und die anhand der
   Änderungen ausgewählten Anwendungs-, Browser-, Datenbank- und Diensttests.
3. Nach grünem `Required checks` den PR mit **Merge-Commit** zusammenführen.
4. Auf `master` den geprüften Dateistand wiederverwenden: kein zweiter Lauf
   derselben Qualitäts-, Unit-, Browser- oder Datenbanktests.
5. Produktionsimage bauen und kurz prüfen, veröffentlichen, ausstehende
   im PR geprüfte Migrationen mit Backup anwenden, ausrollen und öffentlich prüfen.

Der PR-Bau prüft Angular mit Entwicklungsumgebung; der Produktionsbau enthält
Produktionskonfiguration und Versionsangaben. Diese beiden Bauten erfüllen
unterschiedliche Aufgaben und bleiben. Ebenso ist der HTTP-Test des fertigen
Images kein erneuter vollständiger Browser-Test.

## Automatische Wiederverwendung

Der bestehende `Required checks`-Job hinterlegt nach Erfolg ein kleines GitHub-
Artefakt. Sein Name enthält den Git-Dateibaum und den geprüften Umfang. Ein
erfolgreicher Lauf desselben Workflows aus dem tatsächlich gemergten PR muss
vorliegen; Nachweise anderer Zweige oder Forks werden nicht übernommen.
Der Vergleich verwendet Dateiinhalte statt Commit-IDs, weil GitHub für den PR
einen vorläufigen Merge-Commit erzeugt, dessen ID vom endgültigen Merge abweicht.

Die Änderungserkennung auf `master` verlangt denselben Dateibaum und mindestens
alle jetzt benötigten Prüfbereiche. Den verwendeten PR-Lauf verlinkt sie in der
GitHub-Zusammenfassung. Keine neue manuelle Bestätigung und keine heruntergeladenen
Skripte oder ausführbaren Artefakte.

Falls der Nachweis fehlt oder nach 14 Tagen abgelaufen ist, GitHub nicht antwortet,
der Inhalt sich beim Merge ändert oder ein Squash-, Rebase-, direkter bzw.
Sammelpush stattfindet, laufen automatisch die regulären Tests. Dieser Rückfall
verhindert ungeprüfte Releases und blockiert nicht auf einer Freigabeabfrage.

`npm run verify` bleibt als freiwilliger Gesamtlauf für größere Integrationen
erhalten. Die Datenbankrechte, Sicherung und atomare Ausführung bleiben erhalten.

## Migrationen ohne zusätzliche Handarbeit

SQL-Dateien werden im selben PR wie die Schemaänderung geprüft. Schon vor den
langen CI-Jobs fallen Schema-Dateiänderungen ohne neue Migration und Änderungen
alter Migrationen auf. Diese Dateiprüfung ersetzt keinen vollständigen Schemaabgleich.
Der Docker-Bau kopiert danach alle Migrationen unverändert in ein neues Paket und
erzeugt die passende Prüfsummenliste automatisch. Eine zusätzliche Freigabeliste
von Hand zu bearbeiten ist nicht mehr erforderlich.

Merge ist auch die SQL-Freigabe. Nichttransaktionales oder riskantes SQL braucht
weiterhin vor dem Merge einen eigenen geprüften Ablauf; die automatische
Integritätsliste kann SQL nicht fachlich als ungefährlich bewerten.

## Nach dem ersten Live-Lauf prüfen

- Im PR sind die gewählten Tests erfolgreich und das Nachweis-Artefakt vorhanden.
- Nach Merge verlinkt `Detect relevant changes` genau diesen Lauf.
- Qualität und Tests werden übersprungen; Image, Pflichtcheck und Deployment sind grün.
- Die ausgelieferte Commit-ID stimmt. Laufzeit vorher/nachher vergleichen;
  noch keine gemessene Zeitersparnis behaupten.

GitHub beschreibt [Workflow-Artefakte](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)
und deren [REST-Metadaten](https://docs.github.com/en/rest/actions/artifacts).
