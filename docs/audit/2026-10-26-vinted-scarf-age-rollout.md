# Beiger Burberry-Schal: Alterskorrektur live bestätigt

Die Korrektur aus [PR 481](https://github.com/GrischaTDev/flipbase/pull/481) ist nach allen ausgewählten erfolgreichen Pflichtprüfungen mit Merge-Commit `6545245efe9f170058e62fa9c98e42f3142fc215` integriert. Nach einem erfolglosen ersten Altersabruf wurde bisher 24 Stunden gewartet. Fehlende Angaben werden jetzt nach einer Stunde erneut geprüft. Bekannte Alterswerte und Anbieter-Schutzprüfungen bleiben erhalten. Warum der allererste Abruf leer blieb, ist rückwirkend nicht nachgewiesen.

## Veröffentlichung

Die [CI des gemergten Stands](https://github.com/GrischaTDev/flipbase/actions/runs/40411503001), die [Worker-/Broker-Veröffentlichung](https://github.com/GrischaTDev/flipbase/actions/runs/40411515498) und die [Browserabbild-Veröffentlichung](https://github.com/GrischaTDev/flipbase/actions/runs/40411520162) sind erfolgreich. Alle stammen aus dem genannten Merge-Commit. Die bestehende App v0.378.0 unterstützt das Badge bereits; keine zusätzliche App-Veröffentlichung oder Datenbankmigration erforderlich.

| Dienst        | Verwendeter Digest                                                        |
| ------------- | ------------------------------------------------------------------------- |
| Worker        | `sha256:9701f64cf4323d1579e8809e99d26abeaad87f5876b741514090a819b1d19567` |
| Broker        | `sha256:c4390e5f7a47e8e8b21c2845ed9e207723d043fc3a30c032b3cb3fb72dad5875` |
| Browserabbild | `sha256:836aa6d0fe850838368c07eed692222067a963c69bba1e5ffabcc678070f6120` |

Das kompilierte Importmodul in Worker und Broker hat dieselbe SHA256-Prüfsumme wie der lokale Bau: `78ab701485772fa7f4eabeeea509b79cab53973923cc6b498a82c735cf0eb441`. Die Quelle im Browserabbild stimmt mit Git überein: `3b955659a54b80de826654c980d638e9e9cdf1ac57abd2840f45f7c5d356396a`.

## Wechsel und Rückweg

Private Sicherungen und vollständige Konfiguration liegen ausschließlich auf dem Server unter `/opt/flipbase-marketplace/scarf-age-6545245efe9f/`, Verzeichnis `0700`, Dateien `0600`. Der vollständige Vergleich erlaubt genau vier geänderte Stellen: Workerimage, Brokerimage und Browserabbild in beiden Diensten. Kontofreigaben, Zeitpläne, Profile und bestehende Pausen bleiben unverändert.

Vor und nach dem Workerstopp waren keine offenen Sitzungen, Abrufe, aktiven oder ungeklärten Schreibaktionen, Cloud-Einrichtungen oder Browsercontainer vorhanden. Worker regulär mit Exitcode 0 beendet; inaktiver Broker erwartungsgemäß mit 143, ohne Speicherabschaltung oder Dockerfehler. Die neuen Dienste laufen seit 23:24:24 Uhr Europe/Berlin. Worker gesund, Broker laufend, beide ohne Neustart. Öffentlicher Healthcheck HTTP 200 mit `ok=true`, `readOnly=false`, `apiVersion=2`; anonymer Abrufstart weiterhin HTTP 401.

Bei reproduzierbaren neuen Importfehlern oder ungesundem Dienst den neuen Worker regulär stoppen, offene Vorgänge und Sitzungen erneut prüfen und mit derselben Compose-Projektzuordnung `flipbase-chromium-pilot` die gesicherte `before.compose.json` starten. Alte Images bleiben erhalten; keine Profile, Sperren oder Datenbankeinträge löschen.

## Echter Artikel und sichtbares Badge

Der erste planmäßige Wiehen-Store-Abruf mit dem neuen Worker läuft am 26.10.2026 von **23:24:40 bis 23:24:54 Uhr Europe/Berlin** erfolgreich, `authorization_kind=scheduled_read`, kein Fehlercode. Profil, alle neun Inserate, Gespräche und Bewertungen vollständig; Nachrichten und Verkäufe weiterhin Teilstände.

Beim Artikel „Burberry Schal in Beige Lammwolle Vintage“ ist jetzt `publicationAge={value:16,unit:"hour",observedAt:"2026-10-26T22:24:45.484Z"}` gespeichert. Der Artikel bleibt aktiv; `occurredAt` und `createdAt` bleiben leer. Der Wert stammt aus dem regulären Anbieterabruf, nicht aus einer manuellen Datenbankänderung.

Der schon geöffnete, angemeldete Kleiderschrank zeigt danach **Neu**. Der sichtbare Badge-Text ist grün (`rgb(134, 223, 187)` im dunklen Design). Screenshot außerhalb des Repositories unter `C:/Users/Grisc/AppData/Local/Temp/flipbase-scarf-neu-live.png`. Kein Preis, Anbieterinhalt oder Kontorecht geändert. Nach Ende keine offene Sitzung, kein wartender/laufender Abruf und kein Browsercontainer.
