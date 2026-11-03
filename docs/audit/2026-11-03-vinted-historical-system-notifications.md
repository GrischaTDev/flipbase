# Nachträgliche Benachrichtigungen zu alten Vinted-Systemereignissen

## Ergebnis

Die am 3. November gemeldete Benachrichtigungsflut ist eine nachträgliche
Erfassung bisher nicht unterstützter Systemereignisse. PR #554 erweitert den
Benachrichtigungsparser um `status_message`, `action_message` und
`payment_message` (Commit `92446db7`). Der bestehende Altersfilter vergleicht
Ereignisse weiterhin mit der ersten Konto-Beobachtung. Für die neuen
Ereignistypen fehlt eine eigene Startgrenze. Bereits ältere Ereignisse nach
dieser ersten Beobachtung können deshalb heute erstmals benachrichtigen.

## Rein lesender Produktionsnachweis

Am 3. November gegen 16:48 Uhr Europe/Berlin wurden innerhalb des betrachteten
Vierstundenfensters zwölf Benachrichtigungen zu zwölf unterschiedlichen
Quellereignissen gefunden. Alle Ereignisse waren bei Benachrichtigung älter
als 24 Stunden:

| Benachrichtigung am 03.11. | Konto        | Ereignisse im selben Chat | Tatsächliches Ereignisdatum |
| -------------------------- | ------------ | ------------------------- | --------------------------- |
| 16:15:38                   | Wiehen Store | 2                         | 01.11.                      |
| 16:30:30                   | Flipbase     | 4                         | 17.10.                      |
| 16:36:14                   | Wiehen Store | 6                         | 19.–29.10.                  |

Die ersten Konto-Beobachtungen liegen am 11. beziehungsweise 14. Oktober.
Damit erfüllen diese alten Ereignisse den vorhandenen Filter. Die tatsächliche
produktive SQL-Funktion enthält sowohl die neuen Ereignistypen als auch den
Vergleich mit `first_observed_at`.

Zu jedem der zwölf Ereignisse existiert genau ein Pushereignis und je ein
Versandauftrag an zwei Geräte: insgesamt 24 angenommene Lieferungen, jeweils
genau ein Versuch, kein ausstehender Auftrag und keine Versandwiederholung.
Alle drei Kontoautomatiken waren aktiv, ohne aufgelaufenen Fehler, und hatten
zuletzt gegen 16:46 Uhr erfolgreich aktualisiert.

Die Abfragen liefen in schreibgeschützten Transaktionen mit Zeitbegrenzung.
Keine Nachrichteninhalte, Zugangsdaten oder Geräteendpunkte wurden ausgegeben.
Private Metadatennachweise liegen außerhalb des Repositorys unter
`C:/Users/Grisc/.codex/tmp/vinted-inbox-notification-production.json` und
`C:/Users/Grisc/.codex/tmp/vinted-inbox-notification-delivery-check.json`.
Eine erste Diagnoseabfrage scheiterte an einem mehrdeutigen Spaltenbezug;
der korrigierte Bezug wurde erfolgreich ausgeführt. Beide endgültigen
Produktionsabfragen lieferten Exitcode 0.

## Warum die Meldungen gleich aussehen

Jeder Statusschritt wird als eigenständiges Ereignis gespeichert. Die Glocke
zeigt für Systemereignisse dieselbe allgemeine Beschriftung
„Neue Postfachmeldung“. Push verwendet für alle Nachrichtenereignisse
„Neue Marktplatznachricht“ und „Du hast eine neue Nachricht.“.
Mehrere verschiedene Schritte desselben Chats erscheinen dadurch identisch.

Identische Quellkennungen werden über den eindeutigen Datenbankschlüssel und
`on conflict do nothing` abgefangen. Der Pushpfad dedupliziert zusätzlich je
Quellereignis und Gerät. Die Live-Daten belegen keine Wiederholung identischer
Ereignisse und keinen fehlgeschlagenen aktuellen Postfachabruf.

## Reproduktion und Prüfgrenze

Ein synthetischer Vorher-/Nachhervergleich mit vier Systemereignissen vom 17. Oktober erzeugt vor PR #554 null und danach vier unterschiedliche
Benachrichtigungsereignisse. Dieselbe Antwort liefert bei Wiederholung dieselben
Kennungen. Zwölf bestehende Parser- und Erweiterungstests bestehen unter
Node 22.23.4, ohne Auslassungen und mit Exitcode 0. Private Nachweise:
`vinted-inbox-before-after-repro.log` und `vinted-inbox-events-node22.log`
im oben genannten temporären Verzeichnis.

Bestehende SQL-Tests decken Wiederimport und Historie vor der ersten
Konto-Beobachtung ab. Die jetzt belegte Lücke betrifft neu unterstützte
Ereignistypen mit älterem Datum nach dieser ersten Konto-Beobachtung.
Eine spätere Korrektur muss historische Übernahme ohne Benachrichtigung von
tatsächlich neuen Systemereignissen unterscheiden und diese Grenze absichern.

Diese Sitzung untersucht den Fehler. Keine Funktionsänderung, keine Migration,
keine Änderung echter Kontodaten und kein Deployment. Anwendungstests und Bau
wurden für die ausschließlich ergänzte Dokumentation nicht gestartet.
