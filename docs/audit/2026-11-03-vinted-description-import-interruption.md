# Vinted-Abrufe durch abgelehnte Beschreibungscaches angehalten

## Produktionsbefund

Am 3. November 2026 sind alle drei bestehenden Cloud-Abrufpläne mit
`access_revoked` angehalten. Netzfreigaben und IP-Laufzeiten sind gültig;
der regelmäßige Anbieterabgleich aktualisiert weiterhin alle drei IPs.

Der Worker aus PR #550 führte bis 11:01:05 Uhr Europe/Berlin erfolgreiche
Intervallabrufe aus. Seit dem folgenden Workerstart um 11:02:51 Uhr aus
PR #551 scheitern manuelle und geplante Abrufe nach vier bis sieben Sekunden,
noch vor der ersten Anbieter-Lesephase. Die Sitzungsfristen und Heartbeats
waren beim Abbruch gültig; ein Zehn-Minuten-Limit erklärt diesen Fehler nicht.
Alle drei Konten besitzen bereits gespeicherte Beschreibungen.

## Ursache

PR #551 ergänzt den internen Inseratcache um `description`,
`descriptionReadAt` und `descriptionSourceUpdatedAt`. Der Datenbankleser
gibt diese Felder korrekt aus. Die strenge Prüfung beim Eintritt in den
isolierten Browser kennt sie jedoch noch nicht und verwirft den gesamten
Leseauftrag als ungültigen Inseratcache.

Der Runner setzt bereits vor dem Lesen dieses Caches den Fehlerbereich
`access`. Deshalb erscheint der technische Vertragsfehler als fehlgeschlagene
Rechteprüfung. Die automatische Fehlerbehandlung übersetzt ihn in
`access_revoked` und deaktiviert den Abrufplan. Eine erneute Anmeldung oder
Wiederaktivierung allein behebt den fehlerhaften Übergabevertrag nicht.

## Korrektur und Nachweis

Die Browsergrenze muss die drei Beschreibungsfelder vollständig und begrenzt
validieren und unverändert weitergeben. Leere bestätigte Beschreibungen und
unbekannte Zeitstempel bleiben erlaubt. Unbekannte Felder, überlange Texte
und ungültige Datumswerte bleiben gesperrt.

Cache- und Übergabefehler vor dem Beginn des Imports dürfen nicht als
bestätigter Rechteentzug gelten. Echte abgelaufene oder widerrufene
Sitzungen müssen weiterhin jeden Anbieterzugriff und jede Speicherung
verhindern.

Der Regressionstest verbindet den tatsächlichen Datenbankleser mit dem
isolierten Browserkanal und dem Importaufruf. Damit wird dieselbe Grenze
geprüft, die in den getrennten Tests aus PR #551 fehlte. Weitere Prüf- und
Betriebsnachweise werden nach ihrer tatsächlichen Ausführung ergänzt.
