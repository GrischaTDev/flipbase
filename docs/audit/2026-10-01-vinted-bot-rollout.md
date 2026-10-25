# Artikelbot-Korrektur: produktiver Rollout vom 1. Oktober 2026

Alle Uhrzeiten in Europe/Berlin. Der Nutzer hat PR-Erstellung, Merge nach
erfolgreichen Tests und das Aufräumen des eigenen Zweigs mit „ja“ freigegeben.

## Veröffentlichung

- [PR #275](https://github.com/GrischaTDev/flipbase/pull/275): Pflichtprüfungen
  erfolgreich; Merge-Commit `6a35cd805e704609e683606a51f5508e5c129f75`.
- [PR-Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/36916917020):
  Qualität, Bot-Dienst und `Required checks` erfolgreich. Für diesen Umfang
  nicht ausgewählte Anwendungs-, Browser- und Datenbanktests übersprungen.
- [Release-Lauf](https://github.com/GrischaTDev/flipbase/actions/runs/36917368271):
  identischer geprüfter Dateibaum wiederverwendet. Produktionsbau, Web-/Bot-Image-
  Starttests, Veröffentlichungen, Deployment und öffentliche Prüfungen erfolgreich.
- Version `v0.276.4` veröffentlicht. Keine neuen Datenbankmigrationen.

## Prüfung auf dem Server

- Laufender Bot: `ghcr.io/grischatdev/flipbase-sniper:sha-6a35cd8`.
- Lokale Image-ID:
  `sha256:ae55efd99577d5e8128e6b673052d92279fead0c64887efc3909d2f54039d37e`.
- Start um 21:55:48 Uhr, Container `running` und `healthy`, keine Neustarts.
- Startlog bestätigt `requestMinIntervalMs=10000`, `requestTimeoutMs=20000`,
  Minutenbudget 30 und Diensttakt fünf Sekunden.
- Die Betriebsmeldung wird erneuert. Um 21:56:20 Uhr nennt sie ausdrücklich
  die Zugriffspause und nächste Wiederprüfung **22:12:15 Uhr**.
- Drei aktive Marken und die administrativ pausierte vierte Marke unverändert.
  Die gespeicherten Fehlerzähler und Wartezeiten haben den Wechsel überstanden.
- In der Pause keine Vinted-Anfragen. Der letzte Erstfund bleibt 21:06:38 Uhr.

Logs und feste Datenbankmetadaten ausschließlich lesend geprüft; SQL in einer
`read only`-Transaktion. Keine Tokens, Cookies oder Artikelinhalte ausgegeben.
Keine zusätzlichen Vinted-Anfragen ausgelöst und keine Zugriffspause verkürzt.

## Grenze

Der alte Bot erhielt um 21:52:15 Uhr erneut HTTP 403 und setzte die Pause bis
22:12:15 Uhr. Der neue Bot respektiert diesen Zustand. Der erfolgreiche Rollout
bestätigt deshalb weder wiederhergestellten Anbieterzugriff noch dauerhaft
zuverlässigen Artikelzulauf. Eine neue echte Probe des veröffentlichten Stands
ist bis zum Ende dieser Rolloutprüfung noch nicht fällig gewesen. Die genaue
Ursache der Vinted-Ablehnung bleibt offen.

Die freigegebene Korrektur ist veröffentlicht. Der Remote-Zweig ist gelöscht;
der eigene Worktree ist nach bestätigtem Merge archiviert und der lokale Zweig
entfernt. Vorhandene Änderungen der Hauptarbeitskopie und fremde Zweige bleiben
erhalten. Dieser nachträgliche Betriebsnachweis bleibt zunächst lokal.
