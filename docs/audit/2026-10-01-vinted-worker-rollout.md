# Vinted-Browserdienst: produktiver Wechsel vom 01.10.2026

Der Nutzer hat nach Veröffentlichung von PR #274 den separaten Workerwechsel
mit „los“ freigegeben. Die Web-App und Migration `20261001173446` waren zuvor
bereits produktiv veröffentlicht.

## Veröffentlichter Stand

- Merge-Commit: `f1c9e623a6b40ca4550431a81e1cf77350d8a539`.
- [Image-Bau erfolgreich](https://github.com/GrischaTDev/flipbase/actions/runs/36907802664),
  mit genau diesem Commit.
- Laufendes Image:
  `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-f1c9e623a6b40ca4550431a81e1cf77350d8a539`.
- Geladener Digest:
  `sha256:c0e0a20a07818ad57c7a1a0cae87689a09ecc0af02192afef7510fb1f535735d`.
- Compose-SHA-256:
  `cd7e3980c3d1da6620fc7436df7308ddaa39bee53bbb7189ffd1ceb7a13abc12`;
  identisch mit der Datei aus dem Merge-Commit.
- `MARKETPLACE_SCHEDULED_SYNC_ENABLED=1` ausdrücklich in der bestehenden
  Workerumgebung gespeichert.

## Sicherung und Betriebsprüfung

Unter `/opt/flipbase-marketplace/` wurden `.env.before-f1c9e623`,
`marketplace-worker.env.before-f1c9e623` und
`docker-compose.before-f1c9e623.yml` mit Modus 0600 gesichert. Die bisherigen
Images bleiben erhalten. Keine Zugangsdaten, Cookies oder Nachrichteninhalte
wurden ausgegeben oder in Artefakte aufgenommen.

Vor und unmittelbar vor dem Wechsel waren alle 43 Browsersitzungen geschlossen;
kein Auftrag war wartend oder laufend. Nur `marketplace-worker` wurde über
Compose neu erstellt. Die einzelne Instanz ist gesund, hat Runtime-Epoche 1
und erneuert ihr Lebenszeichen. Die öffentliche Web-App liefert denselben
Merge-Commit aus.

Der öffentliche Healthcheck meldet `ok: true`, `readOnly: false`,
`apiVersion: 2` und
`scheduledSync: { enabled: true, authorizationVersion: 2, allowedIntervals: [3, 5, 10, 15, 30, 60] }`.
Ein anonymer POST auf den Abrufstart wurde mit HTTP 401 abgewiesen.

Ein Rückweg benötigt zuerst bewusst pausierte Zeitpläne, abgeschlossene
Aufträge und bestätigte Browserstopps. Erst dann die geschützten Sicherungen
der Umgebung wiederherstellen und ausschließlich den Worker neu starten.
Das alte Image unterstützt keine neue Automatik. Die additive Migration
bleibt erhalten; keine Sperren oder Aufträge löschen.

## Echte Kontoprüfung

Alle Zeiten sind UTC. Das vorhandene eigene Konto wurde über die angemeldete
Flipbase-Oberfläche geprüft. Es wurden weder Zugangsdaten eingegeben noch ein
manuelles Vinted-Browserfenster geöffnet.

- Beim Neuladen wurde der fehlende Zeitplan automatisch mit 15 Minuten angelegt.
- Der erste manuelle Abruf um 18:37:18 scheiterte beim Profil mit
  `requestFailure: browser_context`, nach rund 12 Sekunden in dieser Phase.
  Dies bestätigt keine Abmeldung und keine konkrete Ursache des Kontextfehlers.
  Die Browsersitzung wurde geschlossen und der Zeitplan blieb aktiv.
- Die einmalige Wiederholung um 18:38:40 lief nach rund 27 Sekunden erfolgreich
  durch Speicherung und Browserstopp. Bestätigt wurden ein Profil, fünf Inserate
  und sieben Gespräche; die offene Übersicht zeigte die neue Datenübernahme.
- Drei Minuten wurden vorübergehend im Einstellungsdialog gespeichert. Pausieren
  setzte die nächste Fälligkeit auf null. Nach Neuladen blieb die Pause erhalten;
  anschließendes Fortsetzen speicherte erneut die Freigabe. Die Vinted-Ansicht
  wurde für den geplanten Folgelauf verlassen.

- Der Server startete den geplanten Auftrag selbst um 18:43:56 als
  `scheduled_read`. Um 18:44:22 war er erfolgreich einschließlich Speicherung
  und Browserstopp abgeschlossen. Die Vinted-Ansicht war dabei geschlossen;
  ein anderes Flipbase-Tab war weiterhin geöffnet. Ein Test mit vollständig
  geschlossener App oder ein vollständig abgewarteter 15-Minuten-Zyklus ist
  damit nicht nachgewiesen.
- Der Zeitplan blieb ohne Fehlergrund oder Anbieterwartezeit aktiv. Beim
  Zurückkehren zeigte die Oberfläche die Datenübernahme um 20:44 Uhr deutscher
  Zeit und den bestätigten letzten automatischen Erfolg.
- Abschließend wurden im Dialog wieder 15 Minuten gespeichert. Der Zeitplan
  bleibt aktiv, die nächste Fälligkeit liegt bei rund 21:00 Uhr deutscher Zeit.
  Der Container bleibt gesund, ohne Neustart; alle 46 Browsersitzungen sind
  geschlossen und kein Auftrag bleibt wartend oder laufend.

Profil, Inserate, Gespräche und Bewertungen sind vollständig gelesen.
Nachrichten und Verkäufe bleiben nach dem bestehenden Abrufvertrag teilweise,
weil ungelesene Gesprächsinhalte nicht geöffnet werden. Der erfolgreiche
Auftrag beweist deshalb keine vollständige neue Nachrichten- oder Verkaufsquelle.

Getrennte neue Benachrichtigungen für
Nachrichten, Angebote und Verkäufe sind weiterhin nicht implementiert. Kurze
Intervalle betreffen den vorhandenen Gesamtabruf und ersetzen diese Quellen
nicht. Ein gesunder Dienst beweist keinen dauerhaft fehlerfreien Anbieterzugriff.
