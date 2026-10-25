# IPRoyal-Nachbuchung für den zweiten Kontotest aktiviert

## Aktueller Stand: PayPal und Preisangebot bis 8 USD

Juna hat nach ausdrücklicher Freigabe des Nutzers
[PR #359](https://github.com/GrischaTDev/flipbase/pull/359) mit erfolgreichen
Pflichtprüfungen gemergt. Anwendung und Worker sind aus dem Merge-Stand
`a240027eea036b7e61c98bb8282f8bab8e1564a1` veröffentlicht. Das
[Produktionsrelease](https://github.com/GrischaTDev/flipbase/actions/runs/37955819928)
und die
[Worker-Veröffentlichung](https://github.com/GrischaTDev/flipbase/actions/runs/37955826038)
sind erfolgreich. Der neue laufende Worker-Digest ist
`sha256:6a0a8c84a627d8e44d5f61c5eb5dd77b6c18c43e878439a119d547d8ef9bbe56`.

Während der Umstellung wurde die unbegrenzte Guthaben-Nachbuchung ausgeschaltet.
Die neue private Konfiguration unter
`/opt/flipbase-marketplace/iproyal-paypal-a240027eea03/` aktiviert Nachbuchungen
über die bereits gespeicherte PayPal-Zahlungsart des Anbieter-Kontos.
Die Zahlungsarten-ID wurde ausschließlich auf dem Server gelesen und dort
hinterlegt. Kein Rückfall auf Guthaben. Vor einer Bestellung muss das
Gesamtpreisangebot einschließlich Steuern höchstens 8 USD betragen; Laufzeit
30 Tage und automatische Verlängerung ausgeschaltet. Die dokumentierte API
bindet das Preisangebot nicht verbindlich an den Bestellaufruf.

Der vollständig aufgelöste Compose-Vergleich erlaubt genau den Workerwechsel,
die Zahlungsarten-ID, die Preisgrenze und die Aktivierung der Nachbuchung.
Andere Container wurden nicht verändert. Automatische Abrufe bleiben aktiviert,
Cloud-Schreibaktionen deaktiviert. Vor und nach dem Wechsel waren keine offenen
Cloudsitzungen, Aufträge, Kaufabsichten oder Einrichtungen vorhanden.
Worker gesund, öffentliche Anwendungs-SHA bestätigt, Worker-Healthcheck HTTP 200,
anonyme Einrichtung HTTP 401. Keine echte Bestellung oder Zahlung ausgelöst.
Ob die vorhandene PayPal-Freigabe eine neue IP ohne weitere Bestätigung bezahlt,
bleibt der erste echte Kauftest des Nutzers. Der Featurezweig wurde gelöscht,
der eigene Worktree mit dem PR-Verweis archiviert.

Für den aktuellen Rückweg ist die während der Umstellung gespeicherte
Konfiguration unter `/opt/flipbase-marketplace/iproyal-payment-setup-20261009/`
mit `IPROYAL_AUTO_PURCHASE_ENABLED=0` erhalten. Laufende Cloudarbeit vor einem
Rückwechsel prüfen; ungeklärte Kaufabsichten niemals löschen oder erneut bezahlen.

## Erste Aktivierung vor der Zahlungsumstellung

Am 09.10.2026 hat der Nutzer die produktive Worker-Aktualisierung und Aktivierung
ausdrücklich freigegeben. Die Web-App und Migration aus PR #358 waren bereits
veröffentlicht.

Der erfolgreiche Workflow
[37941185200](https://github.com/GrischaTDev/flipbase/actions/runs/37941185200)
hat genau den Merge-Stand `9ec253cd10c2aa6a7c01c6250599f17fd8fbf959` gebaut und
die Trennung von Worker und Browser einschließlich tatsächlichem Browser geprüft.
Die bestehende einzelne Worker-Instanz verwendet jetzt
`ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:b8cab22efd7cfc17f3fb22e5d963c5bb6468d544fe971ca75339559aab9ba74f`.

Die private Konfiguration liegt unter
`/opt/flipbase-marketplace/iproyal-purchase-9ec253cd10c2/`.
Der vollständig aufgelöste Compose-Vergleich bestätigt genau zwei Änderungen:
das Worker-Abbild und `IPROYAL_AUTO_PURCHASE_ENABLED=1`. Die bestehenden
Container außerhalb des Workers haben ihre Kennungen behalten. Automatische
Abrufe bleiben aktiviert; Cloud-Schreibaktionen bleiben deaktiviert. Die
Netzwerkdatei hat weiterhin Modus 0600; Anbieter- und Datenbankschlüssel wurden
weder ausgegeben noch in Git übernommen.

Vor und nach dem Wechsel waren keine offenen Browsersitzungen, Aufträge,
Kaufabsichten oder Einrichtungen vorhanden. Die Migration `20261009132051`
ist installiert. Genau eine gültige geprüfte deutsche ISP-IP ist registriert
und bereits reserviert. Der Worker ist gesund; der öffentliche Healthcheck
antwortet mit HTTP 200 und `ok:true`. Ein nicht angemeldeter Einrichtungsaufruf
auf `/marketplace-browser/cloud-setups/begin` wird mit HTTP 401 abgewiesen.

Ein ausschließlich lesender Anbieteraufruf bestätigt verfügbare deutsche
30-Tage-IPs, aktuell 4 USD je Einzelbestellung und 0 USD Guthaben.
Der Nutzer muss deshalb vor dem echten zweiten Kontotest Guthaben aufladen.
Es wurde keine Bestellung, Vinted-Anmeldung oder Synchronisierung durch den
Rollout ausgelöst. Der tatsächliche Kauf und die Anmeldung des zweiten Kontos
sind noch vom Nutzer zu testen.

## Früherer Rückweg vor der Zahlungsumstellung

Der aktuelle Rückweg steht oben; dieser Absatz dokumentiert den ersten Rollout.

Die vorherige private Konfiguration unter
`/opt/flipbase-marketplace/negotiation-release-4ce0c0d773b6/` ist erhalten,
mit Worker-Digest
`sha256:d52e7e8ac3f86526733e04198fad3fd55419381fcf2e44c3751dd7a65112d0fb`.
Vor einem Rückwechsel laufende oder ungeklärte Cloudarbeit prüfen und geordnet
beenden. Ausschließlich den Worker mit der bisherigen Compose-Datei und ihrer
`.env` neu erstellen. Bekannte und ungeklärte Kaufabsichten dürfen dabei nicht
gelöscht werden; die additive Datenbankmigration bleibt erhalten.
