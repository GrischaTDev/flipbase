# Artikelbot: Zugriffsschutz nach automatischer Wiederprüfung

Stand: 1. Oktober 2026, Uhrzeiten in Europe/Berlin. Analyse von Juna.

## Bestätigte Beobachtungen

- Der produktive Artikelbot verwendet weiterhin das veröffentlichte Abbild
  `sha-6a35cd8`; Container gesund, keine beobachteten Prozessabbrüche.
- Die vorgesehene Wiederprüfung lief um **22:12:16 Uhr**. Sie lieferte HTTP 403,
  `phase=request`, `challengeDetected=true` und keinen `Retry-After`-Wert.
- Im veröffentlichten Sammler wird dieses Merkmal bei HTTP 403 ausschließlich
  durch `cf-mitigated: challenge` gesetzt. Damit ist eine Cloudflare-Prüfseite
  als Antwort nachgewiesen; der Auslöser dieser Prüfung bleibt offen.
- Die gemeinsame Zugriffspause läuft jetzt bis **22:52:16 Uhr**. Der letzte
  gespeicherte Erstfund bleibt **21:06:38 Uhr**. Abfragen und Datenbankprüfung
  bestätigen den fehlenden erneuten Artikelzulauf.
- Im produktiven Container liefert die DNS-Auflösung für `www.vinted.de` IPv6
  und IPv4. Eine globale IPv6-Adresse ist auf einem Netzwerkinterface vorhanden.
  Das beweist nicht die tatsächlich verwendete Verbindung der letzten Probe.
- Der Sammler besitzt eine eigene Cookie-Map, löscht sie bei 401/403 und führt
  keine Browser-JavaScript-Abläufe aus. Die getrennte Klasse `VintedSession` wird
  im zentralen Sammler nicht verwendet; ihr Vorhandensein belegt keine dortige
  Sitzungsaufwärmung oder Browser-Sitzungsaktualisierung.

## Öffentlicher Browservergleich

Ein einzelner Seitenaufruf im verfügbaren App-Browser:

<https://www.vinted.de/catalog?order=newest_first&page=1&per_page=96&brand_ids=53>

zeigte zunächst `session-refresh?ref_url=...`, danach den Nike-Katalog mit
Artikelkarten und „500+ Ergebnisse“. Die Oberfläche zeigte „Registrieren |
Einloggen“, also keine sichtbare Anmeldung. Keine Kontoanmeldung, Cookieauslese,
CAPTCHA-Lösung, Artikelaktion oder automatischer wiederholter Abruf erfolgte.

Das ist ein erfolgreicher Einzelaufruf in einer anderen Umgebung. Er belegt keine
Dauerstabilität und trennt Netzwerkzugang und Browserverhalten nicht. Nur der
Markenkatalog ist vergleichbar; weitere produktive Suchparameter und tatsächliche
IP-Verbindungen wurden damit nicht als identisch nachgewiesen.

## Quellen und Einordnung

Cloudflare beschreibt `cf-mitigated: challenge` als zuverlässiges Merkmal einer
Prüfseite:

<https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/>

Umgebungen ohne die erforderliche JavaScript-Ausführung werden für diese Prüfungen
nicht unterstützt. Auch automatisierte Browser sind laut Hersteller nicht zum
Lösen produktiver Prüfungen unterstützt:

<https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/>

Deshalb ist die Aussage „ein Browser löst das sicher“ nicht zulässig. Ein
Browservergleich dient zunächst der Eingrenzung. Ebenso kann aus dem HTTP-403
kein sicherer Rückschluss auf eine Mengenbegrenzung oder eine bestimmte gesperrte
IP-Adresse gezogen werden.

## Nächster kontrollierter Vergleich

Eine kleine technische Probe soll den Markenkatalog im gleichen Netzwerkzugang
wie den Bot mit einem regulären aktuellen Browser vergleichen. Suchparameter,
Zeitpunkt, tatsächliche IP-Familie, sichtbare Sitzungsaktualisierung und Ergebnis
festhalten; keine Tokens oder Cookies protokollieren. Bei einer interaktiven
Sicherheitsprüfung stoppen. Die produktive Zugriffspause nicht zurücksetzen.

- Funktioniert der reguläre Browser am gleichen Zugang, ist die unterschiedliche
  Abruf-/Sitzungsbehandlung weiter zu untersuchen; noch kein Langzeitnachweis.
- Wird auch dieser geprüft oder abgewiesen, ist der Zugang unter diesen
  Bedingungen weiter einzugrenzen. Kein automatischer Kauf eines Proxy-Dienstes
  oder Wechsel von Adressen ohne belegten Nutzen.
- Erst nach akzeptierten Abrufen einen möglichen Umbau des zentralen Sammlers
  entwerfen und mit gemessenem Artikelzulauf über längere Zeit abnehmen.

## Eingriffe und Prüfung

Produktive Logs, gezielte DNS-/Interfacemetadaten und Datenbankmetadaten lesend
geprüft; SQL in einer `read only`-Transaktion. Die DNS-Prüfung machte keine
HTTP-Anfragen. Keine zusätzliche Anfrage vom Produktionsserver, keine verkürzte
Pause, kein neuer Dienst und keine Produktänderung. Vorhandene fremde Arbeitsstände
erhalten. Dokumentation mit Prettier geprüft.
