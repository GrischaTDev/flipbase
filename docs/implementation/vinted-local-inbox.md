# Lokales Vinted-Postfach

Stand: 04.10.2026. Folgepaket zum erfolgreichen Profil-/Inseratepilot, auf
Nutzerauftrag anhand der Bleam-Codebefunde (Rechercheprotokoll, Punkt 37).

## Ziel und Grenzen

Eine bestehende lokale Installation erhält nach ausdrücklicher Bestätigung
den separaten Nachrichtenlesezugriff (`messagesRead`). Gespräche und bereits
gelesene Verläufe werden gezielt in den
bestehenden Kontospiegel übernommen. Ungelesene Verläufe bleiben geschlossen.
Keine Nachrichten senden, Verkäufe ableiten oder Cloudarbeit starten.

Der Vinted-Abgleich ist vom Lesen gespeicherter Daten getrennt. Die Erweiterung
liest mit der bestehenden Sitzung im reservierten Tab. Anmeldung, SMS, Captcha,
Sperren und HTTP429 unterbrechen den Abruf; keine Wiederholung von Provider-Reads.
Alte Grants bleiben ohne Nachrichtenrecht. Die Erweiterung erhält niemals
Supabase-Nutzertoken, Cookies oder Servergeheimnisse.

## Gemeinsamer Vertrag

- Grant: `messages_read boolean default false`, `inbox_next_page integer default 1`.
- Binding und Heartbeat: `messagesRead` (bei alten Antworten optional, dann false).
- Authentifizierte RPC `marketplace_approve_local_inbox(workspace, connection,
token_hash, expected_external_account_id)` ergänzt genau diese Installation;
  kein Austausch des Hashes, keine Verlängerung der bestehenden Ablaufzeit.
- Edge-Aktion `inbox_state` liefert nach voller Grantprüfung `ok`, `externalAccountId`,
  `expiresAt`, `messagesRead`, `nextPage` und `versions` (höchstens 400 gespeicherte
  Gesprächsversionen, gleiche Form wie der vorhandene Cloud-Leser).
- Edge-Aktion `inbox_import` hat `batch`: `identity`, `observedAt`, `page`,
  `nextPage`, `conversationsComplete`, `entries`.
- Ein Abruf liest eine Inbox-Seite à 20 Gespräche, höchstens drei neue/geänderte
  bereits gelesene Details, höchstens 200 Nachrichten insgesamt. Der nächste
  Lauf setzt bei der nächsten Inboxseite fort; nach dem letzten Blatt wieder
  Seite 1. Höchstens 20 Seiten; größere Postfächer bleiben ausdrücklich Teilstand.
- Ein Batch enthält höchstens 20 Gespräche und 200 Nachrichten, maximal 512 KiB.
  Stabile IDs/Elternzuordnung entsprechen den vorhandenen Cloud-Importobjekten.
  Systemereignisse ohne ID verwenden denselben deterministischen SHA256-Schlüssel.
- Unveränderte Verläufe mit `detailCheckedAt` jünger als 24 Stunden werden
  übersprungen; vorhandene Detailvorschau bleibt erhalten. Bei abgeschnittenen
  Details wird kein neuer Detailprüfzeitpunkt gespeichert.
- Gespräche zuerst schreiben, Nachrichten über deren kontogebundene Eltern.
  Wiederholungen dürfen weder Duplikate noch eine neue Elternzuordnung erzeugen.
  Teilimporte löschen nichts. Quellenaktualität getrennt für Profil/Inserate und
  Postfach; Nachrichten bleiben ausdrücklich Teilstand.
- Neue Bridge-Aktion `FLIPBASE_VINTED_LOCAL_INBOX_SYNC`, interne Aktion `INBOX_SYNC`.
  Ergebnis: Kontoscope, Identität, Ablaufzeit, `observedAt`,
  `counts: { conversation, message }`, `conversationsComplete`, `nextPage`.

## Umsetzung und Prüfung

1. Schema, Freigabe, strikte Edge-Verträge und atomare Inbox-RPC mit Tests.
   Migration erzeugen, SQL prüfen, DB-Typen aus der isolierten Datenbank erzeugen.
2. Eigener lokaler Inbox-Leser und Runtime, mit synthetischen Providerantworten:
   Versionsvergleich, ungelesene Gespräche, Kontowechsel, IDs, Größen-/Zeitgrenzen,
   Fehler, Widerruf sowie Wiederaufnahme nach Neustart.
3. Postfach: Freigabe bestätigen, gezielt synchronisieren, gespeicherte Gespräche
   anzeigen, Erfolg/Teilstand/Quelle sichtbar. Bestehende Kontokontext- und
   Lesepositionsregeln erhalten. Angular-, Build-, Browser-/AXE-Prüfungen.
4. Gemeinsames Review und Abnahme mit echtem Konto nach Veröffentlichung.

Regelmäßige Abgleiche werden nach dem echten lesenden Kontotest aktiviert.
Bleams nomineller Fünf-Minuten-Takt ist die Ausgangshypothese für dieses spätere
Betriebspaket; tatsächliche Abrufe, Laufzeit und Verbrauch werden dann gemessen.
