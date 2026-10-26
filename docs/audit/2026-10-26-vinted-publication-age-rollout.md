# Vinted-Alterskorrektur: Veröffentlichung vom 26.10.2026

Der Nutzer hat die Worker-Aktualisierung und die Kontrolle der App-Veröffentlichung ausdrücklich beauftragt. Ausgerollt wurde der gemergte und vollständig geprüfte Stand aus [PR 478](https://github.com/GrischaTDev/flipbase/pull/478), Commit `61aa3b725f72bf5e977afde2bf05982584648a91`.

## App

[App-Veröffentlichung 40395255252](https://github.com/GrischaTDev/flipbase/actions/runs/40395255252) einschließlich Image-Smoke, Deployment, öffentlicher Prüfung und Release erfolgreich. Öffentlich ausgeliefert: **v0.378.0** mit dem erwarteten Commit. Der bestehende Prüfer `scripts/verify-public-deployment.mjs` bestätigt zusätzlich die ausgelieferten Metadaten und die zusammengehörigen App-/PWA-Dateien.

## Worker, Broker und Browserabbild

Beide manuellen Veröffentlichungen stammen aus demselben Commit und sind erfolgreich: [Worker/Broker 40395593372](https://github.com/GrischaTDev/flipbase/actions/runs/40395593372), [Chromium 40395598416](https://github.com/GrischaTDev/flipbase/actions/runs/40395598416).

| Dienst        | Verwendeter Digest                                                        |
| ------------- | ------------------------------------------------------------------------- |
| Worker        | `sha256:9f4b60df07f46af53103620fd8ffdd358933f87be6e61c84d7a95dfb49ae9eb2` |
| Broker        | `sha256:997b1168aaa8038c72d515e474273f875530c598e4d10e823b3437fe2b6fe801` |
| Browserabbild | `sha256:129377c9444e00e85fd7fe3af2879a9b649f08a9be86519d7d309fd3538c0668` |

Die Prüfsumme des kompilierten Importmoduls in Worker und Broker stimmt mit dem lokalen Bau überein: `56c6b065c6c100a1ceb0b99e7a08465e2cce36d5891d0d56483af08806cd1adb`. Die TypeScript-Quelle im Browserabbild entspricht exakt dem Git-Inhalt des freigegebenen Commits: `67d6a78ce67f2dcced3f552b21e2df4105387fa6332190dda2b14639d8a66e29`.

## Wechsel und Erhalt des Betriebsstands

Private Serverdateien liegen unter `/opt/flipbase-marketplace/listing-age-61aa3b725f72/`: Verzeichnis `0700`, vollständige aufgelöste Konfiguration und Sicherungen `0600`. Keine Zugangsdaten wurden in dieses Repository übernommen. Der vollständige Vergleich erlaubt genau vier geänderte Stellen: Workerimage, Brokerimage sowie das Browserabbild in beiden Diensten. Alle anderen Werte und Bindungen bleiben identisch.

Vor und nach dem Workerstopp: keine offene Browsersitzung, kein wartender/laufender Abruf, keine aktive oder ungeklärte Inserat-/Nachrichtenaktion, keine offene Cloud-Einrichtung und kein regulärer Browsercontainer. Worker regulär mit Exitcode 0 beendet. Der inaktive HTTP-Broker endet wegen seines bisherigen fehlenden Signalhandlers auf SIGTERM mit 143; keine Speicherabschaltung und kein Dockerfehler. Dies wurde vor dem Start geprüft, keine laufende Browsersitzung betroffen. Die neuen Dienste starteten am 26.10.2026 um **21:31:53 Uhr Europe/Berlin**.

Der öffentliche Worker-Healthcheck liefert HTTP 200 und `ok=true`, `readOnly=false`, `apiVersion=2`. Zeitsteuerung und bisherige Fähigkeiten bleiben erhalten. Ein anonymer Abrufstart wird weiterhin mit HTTP 401 abgewiesen. Neuer Worker gesund; Worker und Broker zunächst ohne Neustart.

Die bestehenden Zeitpläne wurden nicht verändert: Flipbase aktiv mit fünf Minuten und Freigabeversion 8; Wiehen Store aktiv mit zehn Minuten und Version 15; Maike Vintage bereits zuvor pausiert mit Version 40. Der schon vor dem Wechsel bestehende Netzwerkhinweis von Wiehen Store bleibt erhalten. Weder Freigaben erweitert noch pausierte Konten aktiviert; keine manuelle Vinted-Aktion oder Preisänderung ausgelöst.

## Rückweg

Alte Images und `before.compose.json` bleiben auf dem Server erhalten. Vor einem Rückweg den neuen Worker regulär stoppen, alle offenen/ungeklärten Vorgänge und Browser erneut prüfen und erst danach mit demselben Compose-Projektnamen `flipbase-chromium-pilot` die gesicherte Konfiguration starten. Sitzungssperren, Kontoprofile, Archive und Datenbankzustand bleiben erhalten. Rückweg bei reproduzierbaren neuen Importfehlern oder ungesundem Dienst; erfolgreiche Healthchecks allein beweisen noch keinen Anbieterabruf.

## Regulärer Folgeabruf

Der erste automatische Flipbase-Abruf mit dem neuen Worker läuft am 26.10.2026 von **21:35:24 bis 21:35:38 Uhr Europe/Berlin** erfolgreich mit `authorization_kind=scheduled_read`, ohne Fehlercode. Importzeit `2026-10-26T20:35:35.368Z`: Profil, alle 15 Inserate, 84 Gespräche und Bewertungen vollständig; Nachrichten und Verkäufe bleiben wie vorgesehen Teilstände. Die 15 bestehenden gerundeten Altersangaben bleiben erhalten. Dieser Abruf benötigt keine zusätzliche manuelle Vinted-Aktion.

Nach Abschluss: Worker gesund, Worker und Broker ohne Neustart, keine offene Browsersitzung, kein wartender/laufender Abruf und kein verbliebener Browsercontainer. Das belegt den tatsächlichen Anbieterabruf und Import mit dem neuen Stand. Es ist keine Zusage über jeden zukünftigen Abruf oder die Ergänzung einer beim Anbieter weiterhin fehlenden Altersangabe; das pausierte Konto bleibt pausiert und der spätere planmäßige Wiehen-Abruf ist zum Zeitpunkt dieser Kontrolle noch nicht fällig.
