# Artikelbot: begrenzter Browservergleich auf dem Produktionsserver

1. Oktober 2026, alle Uhrzeiten Europe/Berlin. Durchgeführt von Juna nach
   ausdrücklichem „dann los“ zum vorgeschlagenen Vergleich.

## Ergebnis

Der Browser und anschließend der unveränderte veröffentlichte Sammler konnten
den Nike-Katalog auf dem Produktionsserver erfolgreich lesen. Ein permanenter
Ausfall des Serverzugangs oder eine zwingende Notwendigkeit eines Browserumbaus
ist damit nicht nachgewiesen. Die Cloudflare-Ablehnung um 22:12:16 Uhr war bei
den späteren Einzelproben nicht mehr vorhanden.

| Prüfung                                                            | Zeitpunkt         | Ergebnis                                                         | Verbindung                         |
| ------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------- | ---------------------------------- |
| Automatische produktive Probe                                      | 22:12:16          | HTTP 403, Cloudflare-Prüfseite                                   | IP-Verbindung damals nicht erfasst |
| Chromium mit frischem Browserkontext                               | 22:28:10–22:28:21 | HTTP 200, 96 Artikellinks, keine Prüfseite, Anmeldelink sichtbar | IPv6, HTTP/2                       |
| Node-Anfrage mit aktuellen Bot-Headern und ohne Cookies            | 22:29:14          | HTTP 200, keine Prüfseite; Antwortkörper nicht ausgewertet       | IPv6, HTTP/1.1                     |
| Unveränderter produktiver `VintedCollector` als separate Leseprobe | 22:30:05–22:30:07 | HTTP 200, Parser erfolgreich, 96 normalisierte Artikel           | IPv6                               |

Alle drei erfolgreichen Proben benutzten denselben öffentlichen Zielkatalog:

<https://www.vinted.de/catalog?order=newest_first&page=1&per_page=96&brand_ids=53>

Eine lesende Datenbankprüfung bestätigt, dass die produktive Nike-Abfrage keine
zusätzlichen Such-, Kategorie- oder Preisfilter enthält. Beide Browser-/Nodewege
erreichten dieselbe Cloudflare-Zieladresse `2a06:98c1:58::2cf`. Der Browser verwendete
das Hostnetzwerk wie der Artikelbot. Browsertyp, Protokoll, Sitzungsabläufe und
Zeitpunkte unterscheiden sich weiterhin; der Vergleich ist kein isolierter
Nachweis einer einzigen auslösenden Eigenschaft.

## Was sich daraus ableiten lässt

- Auch die vorhandene Sammlerimplementierung kann aktuell auf diesem Server
  akzeptierte Antworten verarbeiten. Sie wurde für die Probe nicht verändert.
- Die gespeicherte 40-Minuten-Pause nach dem Fehler um 22:12 Uhr hält den
  produktiven Sammler bis 22:52:16 Uhr zurück, obwohl ein separater Abruf um
  22:30 Uhr bereits wieder funktionierte. Die Pause verlängert in diesem Fall
  nachweislich die Zeit ohne produktiven Artikelzulauf.
- Das erklärt einen Teil der beobachteten Unterbrechung, aber nicht den
  ursprünglichen Auslöser der Cloudflare-Prüfung. Eine dauerhafte IP-Sperre,
  eine permanente Unverträglichkeit mit Node oder ein dauerhafter Cookiefehler
  können aus diesem Ergebnis nicht behauptet werden.
- Die Proben waren aufeinanderfolgende Einzelabrufe. Der Browser kam zuerst;
  zeitliche Änderungen des Zugriffsschutzes sind nicht ausgeschlossen.
  Dauerstabilität, Verhalten unter dem normalen Abfragetakt und ein kausaler
  Einfluss des Browseraufrufs sind nicht untersucht.

## Testumgebung und Grenzen

Kein Browser war auf dem Host oder im persönlichen Marktplatzdienst installiert.
Deshalb wurde vorübergehend das offizielle, zur bestehenden Projektabhängigkeit
passende Testabbild `mcr.microsoft.com/playwright:v1.63.0-noble` verwendet.
Die Herstellerdokumentation bestätigt Version und Kompatibilitätsanforderung:

<https://playwright.dev/docs/docker>

Image-Digest:
`sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`.

Chromium `153.0.8010.12` lief mit sichtbarem Browsermodus unter Xvfb, neuem
Browserkontext, deutscher Sprache und eingeschalteter Chromium-Sandbox. Keine
Browseridentität zur Tarnung verändert. Playwright ist eine automatisierte
Testumgebung und wurde nicht als gleichwertig mit manuell bedientem Chrome oder
als unterstützter Löser produktiver Cloudflare-Prüfungen dargestellt.

Testcontainer: Hostnetzwerk, 1 CPU, 768 MiB Arbeitsspeicher, 256 Prozesse,
schreibgeschütztes Dateisystem, flüchtiges `/tmp`, nicht privilegierter Nutzer,
Hersteller-Seccomp-Profil und ausschließlich zusätzliche `SYS_CHROOT`-Fähigkeit
für den aktivierten Browser-Sandboxstart. Keine Produktionsvolumes, Kontodaten,
Service-Schlüssel oder gespeicherten Browsersitzungen eingebunden.

Die ersten Startversuche scheiterten vor dem Seitenaufruf an nicht beschreibbaren
Browser-Konfigurationspfaden beziehungsweise fehlender Sandbox-Berechtigung.
Sie sind keine Vinted-Ablehnungen. Ein Shell-Aufruf scheiterte zusätzlich an einem
Windows-Zeilenende im Dateinamen. Der erfolgreiche Test begann erst nach diesen
Einrichtungsfehlern.

Dokumentantworten wurden vor Verarbeitung auf `cf-mitigated: challenge` geprüft.
Bei diesem Merkmal hätte der Test die Navigation vor Darstellung der Prüfseite
abgebrochen. Keine CAPTCHA-Lösung, Anmeldung, Cookieexport oder Artikelaktion.
Der Sammlertest war auf eine Anfrage begrenzt, verwendete 20 Sekunden Zeitlimit
und hatte keinen Datenbankspeicher oder produktiven Zustandsdienst.

## Produktiver Zustand und nächster Ansatz

Die produktive Pause wurde nicht verkürzt oder zurückgesetzt. Die Diagnoseartikel
wurden nicht gespeichert. Der letzte produktive Erstfund bleibt daher 21:06:38 Uhr.
Der laufende Artikelbot blieb gesund und hatte keine Neustarts.

Der automatisch entfernte Testcontainer ist nicht mehr vorhanden. Die beiden
eigenen temporären Dateien samt Testverzeichnis und das ausschließlich für den
Vergleich heruntergeladene Browserabbild wurden nach Nutzungsprüfung entfernt.
Anschließend ist der Artikelbot weiterhin gesund, laufend und ohne Neustarts.

Der nächste gezielte Ansatz ist die Wiederaufnahme nach vorübergehenden
Cloudflare-Ablehnungen: einzelne begrenzte Wiederprüfungen getrennt von einer
langen vollständigen Pause bewerten, Anbieter-Wartevorgaben respektieren und
keine wiederholten Anfragen bei einer aktiven Ablehnung starten. Ein solcher
Umbau braucht passende Zustands-/Schedulerprüfungen und einen längeren
Betriebsnachweis. Ein sofortiger vollständiger Browserumbau ist durch dieses
Ergebnis nicht begründet.

## Anschließende Umsetzung

Nach gesondertem „los“ wurde die Fehlerpolitik für ausdrücklich erkannte
Prüfseiten angepasst: fünf Minuten Pause bis zur nächsten einzelnen zentralen
Probe, statt anhand wiederholter Fehler bis auf 60 Minuten zu steigern. Eine
längere Anbieterwartezeit bleibt maßgeblich. Andere Ablehnungen und 429 werden
nicht verkürzt, vorhandene gespeicherte Pausen nicht nachträglich verändert.
Der normale Abruf aller Marken bleibt bis zur erfolgreichen Probe pausiert.

Lokal geprüft mit 204 Bot-Tests einschließlich Wiederaufnahme über mehrere Marken
und Neustarts, Typprüfung, Dienstbau, Format/Lint, Docker-Bau und isoliertem
Image-Starttest. Diese Änderung ist noch nicht veröffentlicht; sie behebt die
zusätzliche Verzögerung nach einer zeitweisen Ablehnung, nicht deren bisher
unbekannten ursprünglichen Auslöser.
