# Vinted nach Kleinanzeigen: Bereitstellung am 16.10.2026

Der freigegebene Stand aus [PR #431](https://github.com/GrischaTDev/flipbase/pull/431),
Commit `de8a6f2e144167bbb4124e72826ed38a3f666a78`, ist bereitgestellt.
Die Bereitstellung ist geprüft; eine echte Übertragung ist noch nicht abgenommen.

## Bereitgestellter Umfang

- Edge Functions `kleinanzeigen-account`, `kleinanzeigen-local-extension` und
  `marketplace-local-extension`: 26 benötigte Dateien einschließlich gemeinsamer
  Module aus genau diesem Commit. Alle SHA-256-Werte nach dem Neustart nochmals
  mit dem vorbereiteten Paket verglichen. Alle drei Einstiegspunkte zuvor mit
  dem tatsächlich eingesetzten Edge Runtime 1.74.0 erfolgreich gebündelt.
- Erweiterung 1.10.0 im bisherigen Installationsordner
  `K:\GitHub\Repos\flipbase\tools\flipbase-extension`. Dazu wurde der vorher
  saubere Hauptzweig ausschließlich auf den freigegebenen Merge-Commit
  vorgezogen. Fremde unversionierte Dateien blieben erhalten. Der Nutzer hat
  das Neuladen bestätigt; die neue Kleinanzeigen-Funktion wird in Flipbase
  tatsächlich erkannt.
- Cloud-Vinted-Quellenabruf im bestehenden Marketplace-Worker. Die vorhandenen
  Vinted-Konten verwenden Cloud-Browser; auch beim einfachen Kopieren muss der
  bestehende Abruf vollständige Quelldaten für das Zielformular speichern.
  [Image-Veröffentlichung](https://github.com/GrischaTDev/flipbase/actions/runs/38952343768)
  erfolgreich. Laufendes unveränderlich gebundenes Image:
  `ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:482bb1f4b9ffb788bda8db92f886338ddd50e07d4f8d99dcc48acab09fcce2cf`.

Kein neuer Anwendungscode und keine weitere Migration bei dieser Bereitstellung.
Broker, Browser-Image, Kontoeinstellungen, bestehende Schreibfreigaben,
Arbeitsspeichergrenze und Dateisystemschutz wurden unverändert übernommen.

## Aufgetretener Startfehler und Korrektur

Der erste Worker-Neustart scheiterte, weil Docker Compose zwei bisher gesetzte
Laufzeitvariablen nicht übernahm: `IPROYAL_API_TOKEN` und
`MARKETPLACE_CHROMIUM_NETWORK_FILE`. Der vorherige Vergleich prüfte nur Werte,
die in der gerenderten Compose-Konfiguration vorhanden waren; die beiden dort
fehlenden Werte wurden dadurch nicht erkannt. Auch das bisherige Image allein
konnte ohne diese Werte nicht starten.

Die gesicherte vollständige Laufzeitkonfiguration stellte zuerst den alten,
wieder gesunden Dienst her. Danach wurden die zwei bestehenden Werte in einer
geschützten zusätzlichen Compose-Datei ausdrücklich erhalten. Vor dem erneuten
Image-Wechsel wurde die daraus vorhergesagte gesamte Laufzeitumgebung mit der
bisherigen Umgebung verglichen: vollständig identisch. Der neue Dienst läuft
anschließend gesund, ohne Neustartschleife und mit ebenfalls vollständig
identischer Umgebung. Vor beiden Image-Wechseln gab es keine aktiven Sitzungen
und keine wartenden oder laufenden Aufträge. Es wurden keine bestehenden
Aufträge beendet und keine neuen Anbieteraktionen angestoßen.

## Tatsächlich ausgeführte Abschlussprüfungen

- Beide betroffenen Dienste gesund; Worker-Neustartzähler null.
- Die neuen Quellmodule direkt aus dem laufenden Worker erfolgreich importiert,
  ohne einen Anbieterabruf auszuführen.
- Alle 26 bereitgestellten Function-Dateien stimmen weiterhin mit dem Paket
  überein; Edge-Runtime-Neustartzähler null.
- 14 öffentliche Prüfungen der drei Edge-Endpunkte bestanden: erlaubte
  Vorabfragen, fehlende und ungültige Anmeldung, synthetische unberechtigte
  Installationskennung, fremde Herkunft und Erkennung der neuen
  `source_details_state`-Anfrage. Kein echtes Zugangstoken verwendet.
- Dokumentierte öffentliche Worker-Adresse
  `https://app.flipbase.de/marketplace-browser/healthz`: HTTP 200 und `ok: true`.
  Quellenabruf ohne Anmeldung: HTTP 401. Eine zunächst versehentlich gegen die
  API-Domain gerichtete Gesundheitsprüfung traf deren HTML-Fallback; korrigiert
  auf die dokumentierte App-Adresse, keine Serverroute geändert.
- Produktive Flipbase-App aktualisiert. Kleinanzeigen-Seite lädt ohne Fehler;
  Erweiterungsprüfung erfolgreich, Kontoverbindung verfügbar. Keine
  Veröffentlichungsfreigabe gesetzt und kein Konto verbunden.

Die bereits erfolgreichen Pflichtprüfungen des unveränderten PR-Stands wurden
nicht vollständig wiederholt. Diese Prüfungen belegen Bereitstellung und
Zugriffsgrenzen, noch keinen echten Anzeigen-Upload, keine echte
Gebührenanzeige und kein erfolgreich veröffentlichtes Zielinserat.
Letzte Serverprüfung: `2026-10-16T19:16:24Z`.

## Sicherung und Wiederherstellung

Auf dem Server liegen geschützte Sicherungen unter
`/opt/supabase/.flipbase-transfer-rollout-de8a6f2e` und
`/opt/flipbase-marketplace/transfer-source-de8a6f2e`. Verzeichnisse haben Modus
0700, Dateien mit Laufzeitwerten 0600. Geheimnisse wurden weder ins Repository
noch in dieses Protokoll übernommen.

Die Function-Sicherung enthält die vorherigen Dateien und ein vorbereitetes
Wiederherstellungsskript. Der Worker-Ordner enthält das vorherige Image, die
vollständigen bisherigen Laufzeitwerte und
`docker-compose.restore-runtime.json` für die geprüfte Wiederherstellung mit
allen bisherigen Werten. Eine Wiederherstellung muss diese zusätzliche Datei
verwenden; das alte Image allein genügt wegen des beschriebenen Compose-Fehlers
nicht. Alte Images und Sicherungen bleiben erhalten.

## Nutzerentscheidung zum weiteren Umfang

Der Nutzer hat den unnötig großen Ausbau für einen einfachen Kopierweg
angesprochen. Für die nächsten Schritte gilt der konkrete Ablauf:
vorhandenes Inserat auswählen, Zielplattform wählen, passende Felder übernehmen,
fehlende Angaben im Zielformular ergänzen, prüfen und ein neues Inserat erstellen.
Gebührenstopp und Schutz vor einer doppelten Veröffentlichung bleiben nötig.
Es wird aus diesem Einwand kein weiterer Umbau und keine Rücknahme bereits
integrierter Änderungen abgeleitet. Für den ersten echten Test fehlen weiterhin
ein verbundenes Kleinanzeigen-Konto und ein konkret ausgewähltes, freigegebenes
Vinted-Inserat. eBay und weitere Richtungen sind damit noch nicht umgesetzt.
