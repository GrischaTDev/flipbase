# Vinted: bestehende Anmeldung und automatische Aktualisierung

Stand: 1. Oktober 2026. Umsetzung auf `juna/vinted-session-automation`.
Ausgangspunkt ist `origin/master` (`a987e304`), einschließlich des noch nicht
produktiven automatischen Dispatchers. Die Untersuchung steht im
[Review](../../audit/2026-10-01-vinted-session-recovery.md).

## Nutzerentscheidung

Das manuell geöffnete Profil ist bereits angemeldet. Vor einer Aufforderung
zur Neuanmeldung soll Flipbase die vorhandene Sitzung zuverlässig wieder
prüfen. Die Automatik soll standardmäßig mit 15 Minuten laufen und in den
Einstellungen kürzere Abstände erlauben. Für einen späteren getrennten
schnellen Abruf sind ausdrücklich **Nachrichten, Angebote und Verkäufe**
gewünscht, als Beispiel alle drei Minuten.

## Umgesetzt

- Nur eine initiale Profil-401 löst ein einmaliges Laden der festen
  Vinted-Startseite und höchstens drei weitere Identitätsprüfungen aus.
  Berechtigung und Herkunft werden erneut geprüft; Login/2FA, 403/429,
  Netzwerk- und Browserfehler stoppen weitere Prüfungen. Die ursprüngliche
  Anmeldung bleibt erhalten; keine Passwortautomatik oder Cookieänderung.
- Nach bestätigter Verbindung wird ein Standardzeitplan serverseitig erstellt.
  Bei Bestandskonten ohne Zeitplan erfolgt die Aktivierung nach bestätigter
  Dienstbereitschaft beim Öffnen. Ausdrücklich gespeicherte Pausen bleiben
  bestehen. Eine erneute Kontobestätigung überschreibt diese nicht.
- Der GoLogin-Dispatcher ist standardmäßig aktiviert; ein explizites
  Serverflag `0` bleibt als Betriebspause wirksam. Healthversion 2 bestätigt
  3, 5, 10, 15, 30 und 60 Minuten; Version 1 erlaubt weiterhin nur 15 Minuten.
- Ein Einstellungsdialog speichert den gewählten Abstand für den gesamten
  vorhandenen Kontoabruf. Die Datenbank verwendet ihn bei Aktivierung,
  Auftragsstart und erfolgreichem Abschluss. Fehlerwartezeiten,
  Rechtekontrollen und höchstens ein globaler Browser bleiben wirksam.
- Die Oberfläche fragt den gespeicherten Zustand alle 30 Sekunden ab.
  Nach einem neuen erfolgreichen Import übernimmt die offene Ansicht auch
  die gespeicherten Kontodaten und Nachrichten. Konto und geöffnetes Gespräch
  bleiben ausgewählt; verspätete Antworten nach einem Kontowechsel werden
  verworfen. Ein noch belegter oder fehlgeschlagener Ansichtsabruf kann beim
  nächsten Statuslauf erneut versucht werden, ohne einen Vinted-Abruf zu starten.
  Der irreführende allgemeine Knopf „Stand neu laden“ entfällt; bei einem
  Fehler gibt es einen gezielten Wiederholungsversuch. Ein nicht bereitstehender
  Serverdienst wird ausdrücklich angezeigt.

## Noch erforderlich für getrennte schnelle Benachrichtigungen

Der vorhandene Import ist kein vollständiger Ereignisfeed. Er liest die
Gesprächsübersicht, öffnet ungelesene Gespräche aber nicht, weil deren
Detailroute den Lesestatus verändern kann. Angebote stammen bisher aus
sicher lesbaren Gesprächsdetails. Verkäufe stammen aus versendeten
Verkäufertransaktionen; neue noch nicht versendete Verkäufe fehlen teilweise.
Ein Drei-Minuten-Gesamtabruf kann deshalb keine vollständigen Meldungen liefern.

Für den nächsten Umsetzungsschritt sind folgende Nachweise erforderlich:

1. Am eigenen freigegebenen Konto eine Quelle für neue Nachrichten und Angebote
   prüfen, die keine Nachricht als gelesen markiert. Nur die benötigten
   Ereignisdaten lesen; keine fremden Konten oder Nachrichtentexte protokollieren.
2. Eine Verkäuferquelle für neue bestätigte Verkäufe vor dem Versand prüfen.
   Transaktionskennung und Zustand müssen zuverlässig zwischen neuem Verkauf,
   Stornierung und vorhandener Historie unterscheiden.
3. Danach einen getrennten kurzen Zeitplan für diese drei Quellen ergänzen;
   Inserate/Profil/Bewertungen bleiben beim längeren Kontoabstand. Gemeinsame
   Browserexklusivität, Freigabeversionen und Anbieterwartezeiten gelten auch
   dort. Ausfall einer Quelle muss als unvollständiger Abruf sichtbar sein.
4. Neue Ereignisse dauerhaft und je Konto eindeutig speichern. Der erste
   Abruf setzt einen Ausgangsstand und erzeugt keine Meldungen für die gesamte
   Vergangenheit. Wiederholungen und Neustarts dürfen keine doppelten Meldungen
   erzeugen. Rechte und Empfänger müssen zum Konto passen; private Broadcasts
   verwenden. Ohne bestätigten Abruf keine Meldung „keine neuen Ereignisse“.
5. End-to-End mit künstlichen Ereignissen und anschließend am eigenen Konto
   prüfen: Nachricht/Angebot/Verkauf, Duplikat, Historie, Stornierung,
   Rechteentzug, Rate-Limit, Neustart und unveränderter Lesestatus. Meldungen
   außerhalb einer geöffneten App verlangen zusätzlich eine ausdrücklich
   gewählte Zustellart; sie werden hier nicht automatisch eingerichtet.

## Abnahme und Veröffentlichung

Die neue Migration ist automatisch aus zwei lokalen Vergleichsdatenbanken
erzeugt, auf den bisherigen Migrationsstand angewendet und erneut gegen das
deklarative Schema verglichen. Generierte Supabase-Typen wurden erneuert;
der öffentliche Typvertrag ändert sich nicht.

Lokale Tests prüfen verzögerte und bleibende 401, Login/2FA, 403/429,
Rechteentzug, Standardaktivierung, bewusste Pause, Konto-/Workspacewechsel,
alte Worker und tatsächliche Drei-Minuten-Planung. Der Browserdialog wird bei
1440 und 390 Pixeln per Tastatur und mit AXE geprüft. Diese Nachweise verwenden
ausschließlich künstliche Vinted-Antworten und bestätigen nicht den internen
Auslöser des produktiven 401-Fehlers.

Veröffentlichung über einen grünen PR mit Merge-Commit. Der getrennte
Workerwechsel und die anschließenden echten Kontonachweise stehen in der
[Rollout-Anleitung](../../implementation/vinted-worker-rollout.md). Bis dahin
bleiben produktiver Worker und Konten unverändert.
