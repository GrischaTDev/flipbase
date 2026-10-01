# Vinted-Bot: wiederkehrende Zugriffspausen am 1. Oktober 2026

## Nachgewiesener Ausfall

Alle Uhrzeiten in Europe/Berlin. Untersucht wurde der zentrale Artikelbot
`services/sniper`, nicht der getrennte GoLogin-Dienst für persönliche Konten.
Produktive Datenbankabfragen wurden ausschließlich in einer lesenden Transaktion
ausgeführt. Keine Cookies, Zugangsdaten oder Artikelinhalte wurden ausgegeben.

- Produktives Botimage: `ghcr.io/grischatdev/flipbase-sniper:sha-ce391ce`.
  Keine Containerneustarts, Host-Netzwerk aktiv, Prozess gesund.
- Drei aktive Marken (53, 14, 88) mit jeweils 20 Sekunden Fälligkeit,
  Minutenbudget 30, Diensttakt fünf Sekunden. Eine vierte Marke bleibt
  administrativ pausiert.
- Bereits von 19:41 bis 20:41 Uhr wiederholte Vinted-403 mit gemeinsamen Pausen.
- Um 21:01:53 Uhr erfolgreiche automatische Probe. Anschließend bis 21:06 Uhr
  rund sieben bis neun Kataloganfragen pro Minute; teilweise zwei im selben
  Durchlauf. Im letzten Stundenfenster 1.024 neue Artikel gespeichert.
- Letzter gespeicherter Erstfund: **21:06:38,662 Uhr**.
- Erste erneute Ablehnung: **21:06:47 Uhr**, HTTP 403.
- Weitere abgewiesene Proben um 21:11:51, 21:16:57, 21:22:00 und 21:32:06 Uhr.
  Eine weitere 403 um 21:42:11 Uhr legt die nächste gemeinsame Probe auf
  21:52:11 Uhr. Der produktive Ausfall besteht am Ende der Untersuchung weiter.

Der Botprozess stürzt dabei nicht ab. Vinted weist Anfragen ab, worauf der
vorhandene Schutz alle Marken pausiert. Die aktuellen Logs unterscheiden nicht,
welche Schutzschicht die 403 erzeugt. Ein zu hoher Anfragetakt ist als Auslöser
nicht bewiesen; ebenso wenig ein konkreter Cookie-, IP- oder Netzwerkfehler.
Keine zusätzlichen Vinted-Proben und keine produktiven Veränderungen ausgeführt.

## Nachgestellte Fehler in Flipbase

1. Die Probe nimmt bisher die am längsten nicht gelesene Marke. Die gemeinsame
   Ablehnungsserie verteilt sich so auf drei getrennte Fehlerzähler. Ein Test mit
   gespeicherten Auftragsständen und jeweils neuer Schedulerinstanz ergibt
   **5, 5, 5, 10, 10** Minuten statt **5, 10, 20, 40, 60**.
2. Kategorieabrufe prüfen das Minutenbudget, aber nicht die gemeinsame
   Zugriffspause. Auch nach ihrem Ablauf könnten sie vor der vorgesehenen
   einzelnen Probe eine weitere Anfrage senden.
3. Die erlaubte Minutenzahl verteilt Anfragen nicht gleichmäßig. Es fehlt ein
   gemeinsamer Mindestabstand für Katalog, Kategorien und Wiederholungen.
4. Bei 403 werden Anbieterwartezeit und der feste Challenge-Header bisher nicht
   übernommen. Der nächste fehlerfreie Wartetakt leert außerdem die
   Betriebsmeldung, obwohl der Anbieterzugang weiterhin pausiert ist.

## Lokale Korrektur

- Nach Ablauf bevorzugt der einzelne Probeabruf die zuletzt gescheiterte,
  weiterhin aktive und fällige Abfrage. Bereits gespeicherte Auftragszähler
  erhalten die Verlängerung über Neustarts hinweg; keine Schemaänderung nötig.
  Bei deaktivierter oder gelöschter Abfrage bleibt eine Ersatzprobe möglich.
- Kategorieabrufe respektieren die gemeinsame Pause einschließlich abgelaufener
  Pause bis zum erfolgreichen Katalog-Probeabruf. Eigene 403/429 aktivieren die
  gemeinsame Pause ebenfalls.
- Gemeinsame Warteschlange mit standardmäßig zehn Sekunden zwischen Starts und
  20 Sekunden Anfragezeitlimit. Minutenbudget und Abfrageberechtigungen bleiben
  aktiv. Das reduziert die mögliche Sammelgeschwindigkeit; diese Werte sind
  bewusst gewählte Betriebswerte, keine zugesicherten Vinted-Grenzen.
- Bei 403 gilt ein längeres `Retry-After`. Die Diagnose enthält nur feste
  Metadaten: Status, Phase, Challenge erkannt, Anbieterwartezeit.
- Zugriffspausen bleiben in der Betriebsmeldung sichtbar. Die früheste nächste
  Prüfung wird in deutscher Zeit angegeben; eine fällige Probe kann wegen Budget,
  Diensttakt oder fehlender aktiver Aufträge später stattfinden.

Für `cf-mitigated: challenge` gilt der
[offizielle Cloudflare-Vertrag](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/).
Der neue Code erkennt diesen Hinweis; seine Anwesenheit in den heutigen
Produktionsantworten ist mit den alten Logs nicht nachgewiesen.

## Prüfungen und verbleibende Grenze

Vor Änderungen 187 Bot-Tests erfolgreich. Neue Fehlerfälle zuerst gegen den
bestehenden Code rot geprüft: Markenwechsel bei Proben, ignorierte Pause,
fehlende Anbieterwartezeit, fehlende Diagnose und fehlende Verteilung der Abrufe.
Nach Korrektur 200 Bot-Tests, Typprüfung und Bot-Build erfolgreich.
Geänderte Dateien formatiert und gezielt gelintet, Git-Diff ohne Leerraumfehler.
Docker-Build sowie isolierter Image-Starttest ohne Netzwerk und Schreibrechte
erfolgreich. Der Docker-Build meldet zwei bestehende moderate Befunde in
Entwicklungsabhängigkeiten und keine in den Laufzeitabhängigkeiten; Abhängigkeiten
wurden nicht verändert.

Die Korrektur ist lokal vorbereitet und noch nicht veröffentlicht. Es gibt
keinen Nachweis dauerhaft erfolgreicher Vinted-Abrufe. Nach Veröffentlichung
müssen das ausgerollte Botimage, echte Anfragedistanzen, erfolgreiche Proben und
Artikelzulauf über längere Zeit geprüft werden. Ein gesunder Container allein
beweist weiterhin keinen verfügbaren Anbieterzugang.
