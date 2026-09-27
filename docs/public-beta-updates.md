# Richtlinie für öffentliche Beta-Updates

Diese Richtlinie gilt für Texte im Discord-Kanal für Beta-Updates. Juna erstellt
eine Nachricht **auf ausdrückliche Anfrage im Chat**, zum Beispiel „Ich brauche
eine neue Discord-Update-Nachricht“. Ein Merge, ein Deployment oder eine neue
Versionsnummer löst keine Nachricht aus. Die
[Discord-Vorlage](discord-beta-update-template.md) zeigt den Aufbau.

## Wer macht was?

1. Der Nutzer fordert ein Update an. Er muss die Änderungen nicht selbst
   zusammenfassen.
2. Juna prüft die seit der letzten **tatsächlich veröffentlichten** Nachricht
   ausgelieferten Änderungen und schreibt hier im Chat einen kopierfertigen
   Entwurf.
3. Der Nutzer prüft den Wortlaut, kann Änderungen verlangen und entscheidet,
   ob und wann die Nachricht in Discord erscheint.
4. Erst nach Bestätigung des tatsächlichen Versands trägt Juna den Stand im
   [Protokoll versendeter Updates](discord-beta-update-history.md) ein. Ein
   Entwurf zählt nicht als versendete Nachricht.

Der auf GitHub hinterlegte Discord-Webhook versendet durch diese Richtlinie
nichts automatisch. Soll Juna eine freigegebene Nachricht später selbst senden,
ist dafür eine gesonderte technische Anbindung und ein ausdrücklicher
Sendeauftrag nötig.

## Welche Änderungen zählen seit der letzten Nachricht?

- Ausgangspunkt ist der letzte bestätigte Eintrag im Protokoll. Endpunkt ist die
  aktuell erfolgreich veröffentlichte Version, nicht nur der neueste Merge.
- Juna vergleicht die dazwischen gemergten PRs und Änderungen mit dem
  tatsächlich ausgelieferten Verhalten. Technische PR-Titel oder automatisch
  erzeugte Release Notes werden nicht ungeprüft zu Nutzertexten.
- Bereits angekündigte Punkte werden nicht wiederholt. Auch Änderungen aus
  mehreren Zwischenversionen können in einer Nachricht zusammengefasst werden.
- Fehlt ein bestätigter Ausgangspunkt, fragt Juna nach der letzten Discord-
  Nachricht oder einer Version beziehungsweise einem Datum. Ohne verlässlichen
  Ausgangspunkt wird kein Zeitraum behauptet.
- Gibt es seitdem keine relevante Nutzeränderung, sagt Juna das im Chat. Es
  erscheint keine Platzhalter-Nachricht über „interne Verbesserungen“.

## Was ist für Beta-Nutzer relevant?

Ein Punkt kommt nur in den Entwurf, wenn die Änderung für Beta-Nutzer sichtbar
oder im Ablauf spürbar ist, bereits ausgeliefert wurde und ihr konkreter Inhalt
öffentlich beschrieben werden darf. Beschreibe, **was Nutzer jetzt tun können,
was sich für sie geändert hat oder welches Problem behoben ist**.

Reine Admin-Arbeiten, Backend, Datenbanken, Migrationen, Verschlüsselung,
Sicherheitsmaßnahmen, Konten und Berechtigungen, interne Speicherabläufe,
Analytics, Infrastruktur und Wartung bleiben unerwähnt. Das gilt auch für
technische Kennungen, Zugangsdaten, Schwachstellen und unveröffentlichte Pläne.
Bei einem gemischten PR kann nur der sichtbare, unbedenkliche Teil in die
Nachricht aufgenommen werden.

Eine neue Schaltfläche „Speichern“ kann relevant sein, wenn sie Nutzern eine
neue Möglichkeit bietet. Wie die Daten gespeichert oder verschlüsselt werden,
ist kein Inhalt für das Update. Bei Unsicherheit fragt Juna nach, bevor der
betroffene Punkt in den Entwurf kommt.

Das GitHub-Repository ist öffentlich. Auch PR-Beschreibungen, Commits und das
[KI-Änderungsprotokoll](AI-CHANGELOG.md) sind lesbar. Vertrauliche Details
gehören deshalb in keinen dieser Texte. Die bestehende GitHub-Release-Pipeline
erzeugt weiterhin automatisch Release Notes; diese Richtlinie steuert nur die
Discord-Update-Texte.

## Wie wird die Nachricht geschrieben?

- Eine Überschrift nennt die aktuelle veröffentlichte Versionsnummer.
- Verwende durchgehend **Du**. Schreibe kurz und konkret, ohne Fachbegriffe,
  PR-Nummern oder interne Umsetzungsdetails.
- Beginne jeden Punkt mit **Hinzugefügt**, **Geändert**, **Entfernt** oder
  **Behoben**. Nutze nur die Kategorien, die tatsächlich passen.
- Nenne die Seite oder Funktion, die konkrete Änderung und ihren Nutzen oder
  ihre Auswirkung. Wo es hilft, erkläre den Unterschied zu vorher.
- Ein Punkt umfasst ein bis zwei kurze Sätze. Im Normalfall reichen ein bis
  fünf Punkte für die ganze Nachricht.
- Bei **Entfernt** erkläre den Ersatzweg. Gibt es keinen, benenne die
  Auswirkung klar.
- Versprich keine künftigen Funktionen. Alles im Text muss in der genannten
  Version verfügbar und geprüft sein.

Beispiel für den Ton, **keine Ankündigung einer tatsächlichen Funktion**:

> **Geändert:** Auf der Einkaufsseite führt Dich „Artikel hinzufügen“ jetzt
> direkt zur Erfassung. Der zusätzliche Zwischenschritt entfällt.
