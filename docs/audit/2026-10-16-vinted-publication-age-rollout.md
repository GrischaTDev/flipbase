# Vinted-Inseratsalter: Cloud-Veröffentlichung vom 16.10.2026

Der Nutzer hat die Aktualisierung der Marketplace-Cloud-Dienste ausdrücklich
freigegeben. Grundlage ist PR [428](https://github.com/GrischaTDev/flipbase/pull/428),
Merge-Commit `a5123d15aef00b659dd2571e209f19f095ff1561`. Die Web-App ist als
`v0.355.3` veröffentlicht; alle Pflichtprüfungen einschließlich 185 ausgewählter
Browserfälle sind erfolgreich.

Die beiden separaten Veröffentlichungsworkflows sind erfolgreich:
[Worker/Broker 38868961255](https://github.com/GrischaTDev/flipbase/actions/runs/38868961255)
und [Chromium 38868964538](https://github.com/GrischaTDev/flipbase/actions/runs/38868964538).
Alle drei neuen Images stammen aus demselben Merge-Commit.

| Dienst  | Fest verwendeter Digest                                                   |
| ------- | ------------------------------------------------------------------------- |
| Worker  | `sha256:b951b86673d8026393b79b75763451b709eade91b6f499f3a08e6c78b7cdc1ea` |
| Broker  | `sha256:911cde951a4864810d8abbab058b45a32ca671169703a3d41d522e7679738b41` |
| Sitzung | `sha256:bbb109bd798067f188f67dca79914f04a52fd89390c5470607cccb0f8b4c77fe` |

## Umstellung und Rückweg

Die neue zusätzliche Compose-Datei liegt unter
`/opt/flipbase-marketplace/listing-age-a5123d15aef0/docker-compose.listing-age.json`.
Der vollständige aufgelöste Vorher-/Nachher-Vergleich bestätigt ausschließlich
neue Worker-/Brokerimages und das dazu passende Sitzungsimage. Die bestehende
Dateikette einschließlich der bisherigen Overrides bleibt erhalten. Kontozugänge,
Zeitpläne, Freigaben, Netzwerke, Sandbox- und Ressourcengrenzen sind unverändert.

Vor dem Wechsel und nach dem geordneten Workerstopp sind keine offenen
Browsersitzungen, wartenden/laufenden Leseaufträge, aktiven/ungeklärten
Inserat-Schreibaktionen oder regulären Browsercontainer vorhanden. Danach
Broker und Worker mit dem neuen Sitzungsimage gestartet. Abschluss um
07:47:35 UTC; beide Dienste laufen ohne Neustart, Worker gesund.

Die vollständige vorherige Compose-Konfiguration samt privaten Einstellungen,
bisherigen Dateikopien und Imagezuordnung ist ausschließlich auf dem Server im
Rolloutordner gesichert: Ordner 0700, Dateien 0600. Alte Images bleiben vorhanden.
Ein Rückweg erfordert zunächst einen geordneten Workerstopp und bestätigte
Browserbereinigung; dann den alten Broker und Worker mit `before.compose.json`
und demselben Projektnamen `flipbase-chromium-pilot` starten. Keine Sitzungssperre,
Kontofreigabe oder Browserprofildatei löschen. Rückweg bei reproduzierbaren
Importfehlern oder ungesundem Dienst; laufende Aufträge vorher geordnet beenden.

## Prüfungen im Betrieb

Öffentlicher Healthcheck HTTP 200, `ok=true`, `readOnly=false`, bestehende
Zeitsteuerung aktiv. Nicht angemeldeter POST auf den Synchronisierungsstart
weiterhin HTTP 401. Alle drei Konten bleiben verbunden und die bisherigen
Zeitpläne aktiviert: Flipbase 5 Minuten, Wiehen Store 10 Minuten, Maike Vintage
15 Minuten. Berechtigungsversionen bleiben 6/13/39. Vorher kein gerundetes
Inseratsalter gespeichert (15/10/5 Inserate).

Der neue Abruf ergänzt höchstens drei Inserate je regulärem Kontoabruf. Weitere
fehlende Angaben folgen über spätere Durchläufe; gespeicherte Werte werden
höchstens täglich nachgelesen. Keine zusätzlichen Abrufe oder Schreibaktionen
für den Rollout ausgelöst. Der Live-Nachweis aus den regulären geplanten Abrufen ist erfolgreich:

| Konto         | Importzeit, Europe/Berlin | Gespeicherte Altersangaben |
| ------------- | ------------------------- | -------------------------- |
| Flipbase      | 09:50:05                  | 3 von 15                   |
| Wiehen Store  | 09:52:20                  | 3 von 10                   |
| Maike Vintage | 09:52:32                  | 3 von 5                    |

Alle drei Aufträge sind `succeeded` mit `authorization_kind=scheduled_read`
und ohne Fehlercode. Die gerundeten Werte enthalten Einheit, Wert und
Beobachtungszeit; die genaue Veröffentlichungszeit bleibt dabei weiterhin leer.
Nach Abschluss keine offene Browsersitzung, kein wartender/laufender Leseauftrag,
keine verbliebenen Browsercontainer, keine Pausen oder Fehlerserien. Alle drei
Konten sind weiter verbunden und ihre bisherigen Freigabeversionen unverändert.

Dies bestätigt den tatsächlichen Abruf und die Speicherung der ersten neun
Altersangaben. Weitere Inserate werden über die bestehenden Zeitpläne ergänzt;
eine sofortige vollständige Altersabdeckung wird dadurch nicht zugesagt.

## Folgeabruf: gespeicherte Werte bleiben erhalten

Flipbase synchronisiert um 09:55:20 Uhr (Europe/Berlin) erneut erfolgreich.
Die ursprünglichen drei Alterswerte behalten ihre Beobachtungszeit
`2026-10-16T07:50:05.962Z`; genau drei weitere Werte kommen hinzu. Damit
sind zwölf Angaben gespeichert: Flipbase sechs, Wiehen Store drei,
Maike Vintage drei. Dies bestätigt die fortlaufende Ergänzung über den
kontogebundenen Cache. Alle Aufträge erfolgreich, keine offene Sitzung,
kein wartender/laufender Leseauftrag und kein verbliebener Browsercontainer.
Worker und Broker laufen ohne Neustart; der öffentliche Healthcheck bleibt gesund.
