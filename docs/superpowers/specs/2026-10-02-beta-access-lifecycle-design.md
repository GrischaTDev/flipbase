# Beta-Einladungen und Laufzeiten verwalten

Stand: 02.10.2026. Entwurf zur Nutzerprüfung; noch nicht umgesetzt.
Grundlage: `origin/master` bei `60676337`.

## Ziel und Umfang

Der Betreiber kann noch nicht abgeschlossene Registrierungen erneut einladen
oder vollständig zurückziehen und löschen. Neue Registrierungslinks gelten
sieben Tage. Nach Fristablauf bleibt die Bewerbung sichtbar und kann erneut
eingeladen oder gelöscht werden. Nach erfolgreichem Löschen ist dieselbe
E-Mail-Adresse wieder für eine neue Beta-Bewerbung frei.

Bei registrierten Beta-Nutzern kann der Betreiber die Laufzeit verlängern oder
die Beta sofort beenden. Die Anmeldung bleibt möglich, Geschäftsdaten bleiben
erhalten. Ohne gültigen Beta-Zugang erscheint eine Dankesseite. Paketbuchung,
Preise und Stripe-Anbindung gehören nicht zu dieser Änderung.

## Bestehender Stand

- `beta-invite` enthält Annahme, Ablehnung, erneuten Versand und Löschen einer
  unverknüpften abgelehnten Bewerbung.
- Der erneute Einladungsversand ist derzeit nur bei fehlgeschlagenem Versand
  in der Bewerbungsübersicht verfügbar.
- Supabase legt bereits beim Einladen ein Auth-Konto, einen Arbeitsbereich,
  dessen Mitgliedschaft und eine noch ausstehende Beta-Lizenz an. Deshalb
  genügt das Löschen der Bewerbungszeile nicht, um die E-Mail freizugeben.
- `activate_beta_access` startet die Beta nach Passwortvergabe.
- `workspace_licenses` speichert Status, Beginn und Ende. Die Ablaufanzeige
  ist vorhanden; der App-Guard und die allgemeinen Mitgliedschaftsfunktionen
  erzwingen diesen Ablauf jedoch bisher nicht.

## Bedienung

| Zustand                                  | Anzeige                        | Aktionen                                                   |
| ---------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| Einladung versendet, Frist offen         | Wartet auf Registrierung       | Einladung erneut senden; Freigabe zurückziehen und löschen |
| Einladung versendet, Frist erreicht      | Registrierungsfrist abgelaufen | Einladung erneut senden; Freigabe zurückziehen und löschen |
| Einladung fehlgeschlagen                 | Einladung fehlgeschlagen       | Erneut senden; Freigabe zurückziehen und löschen           |
| Registrierung abgeschlossen, Beta gültig | Beta aktiv                     | Laufzeit ändern                                            |
| Beta natürlich abgelaufen                | Beta abgelaufen                | Laufzeit ändern                                            |
| Beta vom Betreiber beendet               | Beta beendet                   | Laufzeit ändern                                            |

Die neuen Aktionen stehen in der Bewerbungsübersicht und, soweit dort dieselben
Nutzer gezeigt werden, konsistent in der Nutzerübersicht. Einträge in einem
laufenden Versand- oder Löschvorgang sperren konkurrierende Aktionen.

„Freigabe zurückziehen und löschen“ öffnet einen Bestätigungsdialog mit Name
und E-Mail-Adresse. Der Text erklärt, dass die bisherigen Links ungültig werden
und anschließend eine neue Bewerbung mit dieser E-Mail möglich ist. Abbrechen
verändert nichts. Ein vollständiger Erfolg entfernt den Eintrag aus der Liste.

„Laufzeit ändern“ öffnet einen gemeinsamen Dialog mit bisherigem Enddatum,
einem Feld „Verlängern um … Tage“ und einer Vorschau des neuen Enddatums.
Bei aktiver Beta wird das bisherige Ende verlängert, bei abgelaufener oder
beendeter Beta wird ab dem aktuellen Serverzeitpunkt gerechnet. Zulässig sind
positive ganze Tage; die vorhandene Obergrenze von 3650 Tagen bleibt bestehen.
„Beta jetzt beenden“ benötigt eine zusätzliche Bestätigung. Registrierung und
Beta-Ende werden getrennt behandelt; registrierte Konten werden dabei nicht gelöscht.

Dankesseite: „Deine Beta ist beendet. Vielen Dank, dass du Flipbase getestet hast!“
Bei natürlichem Ablauf lautet der Titel „Deine Beta ist abgelaufen“.
Ein Abmelden-Knopf bleibt verfügbar. Keine Paketkarten mit erfundenen Preisen.
Die Seite ist für eingeloggte Nutzer ohne aktiven Zugang erreichbar, ohne
Weiterleitungsschleife zwischen Login und Dashboard. Texte in Du-Ansprache,
Übersetzungen entsprechend dem bestehenden deutschen und englischen Angebot.

## Registrierungsfrist und Links

Die Frist wird auf dem Server gespeichert und beträgt genau sieben mal
24 Stunden ab Ausstellung. Das Frontend stellt sie dar; der Server erzwingt
sie beim Abschluss der Registrierung. Ein Neuladen der Übersicht und eine
Zeitaktualisierung in geöffneten Übersichten müssen den Statuswechsel zeigen.

Empfohlen sind eigene, widerrufbare Beta-Registrierungslinks mit einem zufälligen
Geheimnis, dessen Hash separat geschützt gespeichert wird. Supabase übernimmt
weiterhin die Anmeldung und Passwortvergabe. Beim Einlösen eines gültigen
Beta-Links wird die dafür nötige Supabase-Bestätigung erst frisch erzeugt.
So bleibt die Wochenfrist unabhängig vom Ablauf anderer Auth-E-Mails.

Alternative: `GOTRUE_MAILER_OTP_EXP` allgemein auf 604800 setzen. Das wäre einfacher,
verlängert aber auch andere E-Mail-Bestätigungen und Recovery-Links. Daher ist
eine ausschließlich für Beta-Einladungen verwaltete Frist die bevorzugte Lösung.

Ein erneuter Versand ersetzt den bisherigen Beta-Link. Nur der erfolgreich
ausgestellte neue Link gilt für die neue Frist. Wiederholte und gleichzeitige
Versandversuche dürfen keinen widersprüchlichen gültigen Link hinterlassen.
Mail-Vorschau oder automatischer Linkaufruf darf die Registrierung nicht
abschließen. Eine kurz vor Fristende geöffnete Passwortseite gewährt nach
Fristende keinen nachträglichen Zugang.

Die Mail nennt die sieben Tage und das konkrete Ablaufdatum. Bereits versendete
Supabase-Links werden nicht rückwirkend für eine Woche gültig: ihre bisherigen
Fristen bleiben bestehen; erneuter Versand stellt einen neuen Beta-Link aus.
Bestandseinladungen brauchen eine erkennbare Unterscheidung zu neuen Links,
damit die Tabelle ihnen nicht fälschlich sieben Tage zuschreibt.

Die endgültige Aktivierung prüft eine serverseitig bestätigte Registrierung,
Frist und aktuelle Freigabe. Ein vom Nutzer selbst veränderbares Merkmal in
`user_metadata` genügt nicht als Berechtigungsnachweis. Ein zunächst bestätigtes
Auth-Konto nach einem technischen Teilfehler erhält erst nach erfolgreicher
fachlicher Aktivierung Zugang; Wiederaufnahme darf die Frist nicht umgehen.

## Zurückziehen und Löschen

Der Server prüft Betreiberrecht, zugeordnete Auth-Kennung, noch nicht abgeschlossene
Registrierung und ausschließlich automatisch angelegte, unbenutzte Kontostruktur.
Ein zwischenzeitlich registrierter Nutzer oder ein Konto mit weiteren
Mitgliedschaften, Geschäftsdaten oder Sonderrolle darf nicht über diese Aktion
gelöscht werden. Dafür bleibt „Beta jetzt beenden“ verfügbar.

Zuerst wird die Freigabe dauerhaft widerrufen und jede weitere Aktivierung
gesperrt. Anschließend werden das vorbereitete Auth-Konto und seine unbenutzte
Kontostruktur bereinigt sowie die Bewerbung entfernt. Bereits eingelöste Links
oder vorhandene Sitzungen dürfen nach Widerruf keinen Zugang gewähren.

Supabase-Auth-Verwaltung und fachliche Datenbankänderungen bilden keine gemeinsame
Transaktion. Der Ablauf muss daher wiederholbar sein, den Fortschritt speichern
und nach einem Teilfehler einen sichtbaren, weiterhin gesperrten Eintrag mit
erneut ausführbarer Löschaktion hinterlassen. Die UI meldet Erfolg erst,
wenn alle erforderlichen Schritte abgeschlossen sind und die E-Mail frei ist.
Gleichzeitige Registrierung, erneuter Versand und Löschung sind serverseitig
gegeneinander abzusichern. Der Server hält für die endgültige Aktivierung die
Bewerbung gesperrt und prüft den Widerruf erneut.

## Beta-Ende und tatsächlicher Zugriff

Betreiberfunktionen verändern die betreffende Beta-Lizenz atomar und prüfen
Rolle, Lizenzquelle und Zustand. Verlängern reaktiviert abgelaufene oder bewusst
beendete Betas; fremde Lizenzquellen und unabhängig gesperrte Konten werden
nicht versehentlich freigeschaltet. Die ursprüngliche Laufzeit und Betreiberaktion
müssen nachvollziehbar bleiben. Doppelklicks verlängern nicht versehentlich zweimal.

Die serverseitige Zugangsprüfung berücksichtigt den aktuellen Lizenzstatus
und `ends_at`, unabhängig von einem noch gültigen Anmeldetoken. Geschäftliche
Tabellen, ausführbare Datenbankfunktionen, Storage, Realtime und Edge Functions
mit erhöhten Rechten werden auf diese Grenze geprüft. Hintergrundaufträge für
beendete Arbeitsbereiche dürfen keinen weiteren Geschäftszugriff ausführen.

Eine Mitgliedschaft bleibt eine Mitgliedschaft: deren reine Prüfung wird nicht
pauschal umgeschrieben, weil Lesen der eigenen Lizenz und Kontoverwaltung sonst
zirkulär oder unerreichbar werden könnten. Für Geschäftszugriff wird eine klare
zusätzliche Prüfung eingeführt. Der aktuelle Zustand der eigenen Zugänge bleibt
auch nach Beta-Ende lesbar, damit die Dankesseite zuverlässig angezeigt wird.

Die Lizenz gehört zum Arbeitsbereich. Hat ein Nutzer weitere gültige
Arbeitsbereiche, bleiben diese nutzbar; er wird nur dann zur Dankesseite geführt,
wenn kein nutzbarer Arbeitsbereich verbleibt. Bestehende Betreiber- und
nicht auf einer Beta beruhende Zugänge werden nicht pauschal ausgeschlossen.
Ein fehlender Datensatz wird anhand der bestehenden Zugangsklasse behandelt,
nicht als universeller Ersatz für einen gültigen Beta-Zugang.

Geöffnete Anwendungen aktualisieren den Status bei Ablauf und Betreiberänderung
und wechseln auf die Dankesseite. Dafür können private Broadcast-Kanäle nach
den Projektregeln genutzt werden; keine `postgres_changes`. Die Datenbank
sperrt den nächsten Geschäftszugriff bereits unabhängig von der UI-Aktualisierung.

## Umsetzung und Prüfung nach Freigabe

Änderungen bleiben in den vorhandenen Features `platform-admin` und `auth`,
zentralen Zugangsdiensten und geschützten Beta-Edge-Functions. Dialoge verwenden
die bestehenden Shared-Komponenten und die Admin-Designregeln. Neue SQL-Regeln
kommen deklarativ in passende numerisch geordnete Schemadateien. Migrationen
werden erzeugt, vollständig geprüft und mit den neu erzeugten Supabase-Typen
im selben PR geliefert.

Verbindliche Prüfungen: exakte Fristgrenze, erneuter Versand und Widerruf alter
Links, Teilfehler beim Löschen und wiederholter Aufruf, erneute Bewerbung mit
derselben E-Mail, konkurrierende Registrierung/Löschung, Betreiberrechte,
Verlängerung vor und nach Ablauf, sofortiges Ende mit bestehender Sitzung,
Ablehnung direkter Datenzugriffe, weitere gültige Arbeitsbereiche, Bestand ohne
Beta-Lizenz, Weiterleitung ohne Schleife sowie Tastaturbedienung und AXE.
Gezielte Angular-, Edge- und Datenbanktests, Format/Lint, Typprüfung und
Angular-Bau vor dem Abschluss; die verbindlichen Gesamtprüfungen laufen im PR.

Kein produktives Nutzerkonto wird im Rahmen der Implementierung automatisch
gelöscht. Nach Veröffentlichung kann der Betreiber die neue bestätigte Aktion
für den betroffenen Bewerber selbst verwenden. Vor Branch-Push und PR gilt die
Abschlussfrage aus `AGENTS.md`.
