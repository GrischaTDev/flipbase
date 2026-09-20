# Ersteinrichtung des Workspace nach dem ersten Login

**Stand:** 20.09.2026

## Ziel

Ein neu eingeladener Nutzer soll nach Passwortvergabe und erstem Login nicht
direkt im Dashboard landen. Vor der eigentlichen Nutzung benennt er den bereits
automatisch angelegten Workspace. Weitere Angaben werden bewusst nicht
abgefragt.

Die Ersteinrichtung enthält ausschließlich:

- eine kurze Begrüßung,
- das Pflichtfeld „Wie soll dein Workspace heißen?“,
- die Aktion „Workspace einrichten“ und
- eine Möglichkeit zum Abmelden.

Steuerart, Mindestgewinn, Mindest-ROI, Firmenanschrift, Rechnungsdaten und
Zahlungsinformationen gehören nicht in diesen Ablauf. Bestehende Standardwerte
bleiben unverändert und können später in den jeweiligen Einstellungen erklärt
und geändert werden.

## Festgelegtes Verhalten

- Die Ersteinrichtung ist verpflichtend und kann nicht übersprungen werden.
- Das Namensfeld startet leer, damit „Mein Workspace“ nicht versehentlich als
  dauerhafter Name bestätigt wird.
- Der Name wird getrimmt und muss zwischen 2 und 100 Zeichen lang sein.
- Es wird kein zweiter Workspace erzeugt. Die Seite benennt den Workspace um,
  den der Registrierungstrigger bereits angelegt hat.
- Nach erfolgreichem Speichern führt der Ablauf zum Dashboard.
- Der Name bleibt später in den Workspace-Einstellungen änderbar.
- Die Beta-Laufzeit startet weiterhin nach erfolgreicher Passwortvergabe. Die
  Ersteinrichtung verschiebt oder verlängert diese Laufzeit nicht.

## Betrachtete Ansätze

### 1. Eigener Einrichtungsstatus am Workspace – gewählt

`workspaces.setup_completed_at` speichert ausdrücklich, ob und wann die
Ersteinrichtung abgeschlossen wurde. Routing und Oberfläche müssen dadurch
nicht aus dem Namen ableiten, ob ein Workspace eingerichtet ist. Der Zustand
passt fachlich zum Workspace und bleibt auch bei einer späteren Umbenennung
korrekt.

### 2. Den Namen „Mein Workspace“ als unvollständig behandeln – verworfen

Dieser Ansatz käme ohne Datenbankfeld aus, würde aber einen erlaubten Namen zu
einem technischen Sonderwert machen. Eine spätere Umbenennung oder Übersetzung
könnte den Ablauf erneut auslösen oder fälschlich umgehen.

### 3. Den Abschluss am Nutzerprofil speichern – verworfen

Das wäre für den ersten Workspace einfach, bildet aber den fachlichen Zustand
am falschen Objekt ab. Ein Nutzer kann mehreren Workspaces angehören; die
Einrichtung betrifft den automatisch erzeugten Workspace, nicht seine Person.

## Datenmodell und Bestandsschutz

Die Tabelle `public.workspaces` erhält die nullable Spalte
`setup_completed_at timestamptz`.

- Die Migration setzt den Zeitpunkt für alle bereits vorhandenen Workspaces,
  damit bestehende Nutzer nach dem Deployment nicht in die Ersteinrichtung
  geraten.
- Der Registrierungstrigger legt den ersten Workspace mit leerem
  `setup_completed_at` an.
- Später manuell angelegte Workspaces gelten sofort als eingerichtet, weil ihr
  Name bereits beim Anlegen angegeben wird.
- Die Änderung wird deklarativ in der Workspace-Schemadatei gepflegt und als
  neue Migration ausgeliefert.

## Navigation und Zugriff

Die neue Route `/onboarding/workspace` liegt außerhalb der normalen App-Shell,
ist aber durch die bestehende Anmeldung geschützt. Dadurch erscheinen während
der Ersteinrichtung weder Sidebar noch normale Arbeitsbereiche.

Ein eigener Guard wartet auf die wiederhergestellte Sitzung und auf das Laden
der Workspaces:

- Ein nicht angemeldeter Nutzer wird wie bisher zum Login geschickt.
- Ein angemeldeter Nutzer mit unvollständigem Workspace wird aus geschützten
  App- und Shop-Routen zur Ersteinrichtung geleitet.
- Ein vollständig eingerichteter Nutzer darf die Anwendung normal öffnen.
- Wer die Ersteinrichtungsadresse später erneut aufruft, wird zum Dashboard
  weitergeleitet.

Der Workspace-Dienst erhält dafür einen wiederverwendbaren, idempotenten
Ladevorgang. Mehrere gleichzeitig startende Guards oder Komponenten lösen keine
parallelen Workspace-Abfragen aus.

## Oberfläche

Die Seite verwendet die vorhandene Gestaltung der Auth-Seiten und gemeinsame
Formular- und Button-Bausteine. Sie zeigt Logo, Begrüßung, eine kurze Erklärung
und ein einzelnes beschriftetes Textfeld. Es gibt keinen mehrstufigen Assistenten
und keine Fortschrittsanzeige für nur einen Schritt.

Beim Absenden wird der vorhandene Workspace serverseitig aktualisiert. Erst die
bestätigte Datenbankzeile aktualisiert die lokalen Workspace-Signale. Während
des Speicherns ist die Aktion gesperrt. Ein Fehler bleibt sichtbar und der
Nutzer auf derselben Seite; ein erneuter Versuch ist möglich.

Die Abmeldeaktion verhindert, dass ein Nutzer bei einem vorübergehenden Problem
in einer Seite ohne Ausgang feststeckt.

## Sicherheit und Fehlerfälle

- Die vorhandene RLS erlaubt die Änderung nur Workspace-Administratoren.
- Die Aktualisierung begrenzt sich auf Workspace-ID, Namen,
  `setup_completed_at` und `updated_at`.
- Ein fremder Workspace kann nicht über die Route eingerichtet werden.
- Fehlt der automatisch erzeugte Workspace wider Erwarten, zeigt die Seite
  einen verständlichen Ladefehler mit Wiederholungsmöglichkeit und Abmeldung.
- Ein fehlgeschlagener Speichervorgang markiert die Einrichtung nicht lokal als
  abgeschlossen.

## Tests und Abnahme

- Datenbanktest für Bestandsschutz und einen neuen, unvollständigen Workspace.
- Service-Tests für einmaliges Laden, bestätigtes Speichern und unveränderten
  lokalen Zustand bei Datenbankfehlern.
- Guard-Tests für nicht angemeldet, Einrichtung erforderlich, Einrichtung
  abgeschlossen und direkten Aufruf der Einrichtungsroute.
- Komponententests für leeres Pflichtfeld, Namensvalidierung, Ladefehler,
  Speichersperre, Fehlermeldung und erfolgreiche Weiterleitung.
- Accessibility-Prüfung für Beschriftung, Fokus, Fehlerausgabe und
  Tastaturbedienung.
- Abschließend Format, Lint, Typprüfung, relevante Datenbanktests und
  Angular-Produktionsbau.

## Nicht Bestandteil

- Steuer- oder Gewinnkonfiguration
- Firmen- und Rechnungsanschrift
- Zahlungsdaten, Abonnements oder Stripe
- ein allgemeiner mehrstufiger Onboarding-Assistent
- Beispieldaten oder automatische Demo-Buchungen
