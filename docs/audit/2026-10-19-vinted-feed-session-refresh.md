# Vinted-Feed: abgebrochene Sitzungserneuerung

Stand: 19.10.2026, Uhrzeiten Europe/Berlin, sofern nicht als UTC bezeichnet.

## Ursache und vorhandene Diagnose

Der zentrale Feed-Container läuft, hat keine Neustarts und meldet `healthy`.
Alle drei aktiven Markenaufträge hatten vor der Wiederherstellung ihren letzten
erfolgreichen Abruf am 09.10.2026 zwischen 22:38:24 und 22:38:48 Uhr. Am
19.10. standen sie mit jeweils 952 aufeinanderfolgenden Fehlern im Cooldown;
Fehlertext: `Vinted request failed with status 307`. Der Artikelbestand war
wegen seiner regulären Aufbewahrungszeit von sieben Tagen inzwischen leer.
Die letzte erfolgreiche Kategorieaktualisierung war ebenfalls am 09.10.

Die vorhandenen Daten reichen zur Eingrenzung: Fehlerart, Fehlertext,
Erfolgszeit und Zähler je Markenauftrag, aktuelle Betriebsmeldung und
rotierende Docker-Logs. Die aktuelle Betriebsmeldung wurde weiterhin alle
paar Sekunden erneuert, obwohl kein Katalog mehr erfolgreich ankam. Der
Dockerzustand prüft den laufenden Sammeltakt, nicht frische Artikel. Ein aktiver
externer Ausfallalarm ist mit dieser Untersuchung nicht nachgewiesen. Im
Feed-Betriebsverzeichnis liegt kein separates Beobachtungsskript; die geprüften
Systemd-Timer betreffen Firewall und Serverspeicher, nicht den Artikelzulauf.

Ein einzelner Abruf durch den unveränderten Feedleser bestätigt HTTP 307 und
das Ziel `/session-refresh?ref_url=…` auf `https://www.vinted.de`, wobei das
Rückziel exakt zum angeforderten Katalog gehört. Der bisherige Leser stoppt
sämtliche Weiterleitungen absichtlich. Deshalb darf Vinted seine normale
Sitzungserneuerung nicht abschließen. Ein unabhängiger einfacher HTTP-Abruf
liefert HTTP 200; er verwendet jedoch nicht den gespeicherten Browserzustand.
Das beweist keine allgemeine Vinted-Sperre und widerlegt den Browserfehler nicht.

## Reguläre Wiederherstellung im bestehenden Browser

Der vorhandene Feed-Browser wurde einmal normal zum Katalog navigiert.
Nachweisbare Folge: Katalog HTTP 307, Sitzungserneuerung HTTP 200, anschließend
Rückkehr zum Katalog. Ein begrenzter Folgeabruf durch den weiterhin unveränderten
Leser lieferte HTTP 200. Keine Cookies ausgelesen oder gelöscht; kein Login,
Passwortwechsel, Proxywechsel, Containerneustart oder Produktionscodeaustausch.

Ab 20:25:45 Uhr speichert Nike wieder Artikel. Ralph Lauren ist ab 20:26:08 Uhr
ebenfalls erfolgreich. Adidas erhielt beim ersten Wiederanlauf einen einzelnen
Browserfehler `Failed` und wartet nach der bestehenden Regel bis 20:40:50 Uhr.
Die vorhandene Wartezeit wird beibehalten. Beide anderen Marken sammeln weiter;
um 20:27:06 Uhr waren bereits 337 Artikel gespeichert.

**Abschluss um 20:41:24 Uhr:** Adidas hat seinen regulären Folgeversuch um
20:41:06 Uhr erfolgreich abgeschlossen und dabei 96 Artikel geliefert.
Alle drei Marken haben jetzt aktuelle Erfolgszeiten, Fehlerzähler null und keine
weitere Wartezeit. Insgesamt liegen 1.184 seit der Wiederherstellung neu
entdeckte Artikel vor; letzter Fund um 20:41:18 Uhr. Die Kategorien wurden um
20:31:18 Uhr mit 2.920 Einträgen erfolgreich erneuert. Der gespeicherte
Verbindungsabschnitt ist seit 20:26:08 Uhr ohne weiteren Fehler bestätigt.

Dieser Wiederanlauf geschieht vor der Veröffentlichung der Codekorrektur und
ist der normalen Sitzungserneuerung zuzuschreiben. Er belegt noch keine
langfristige Zuverlässigkeit. Der Beginn des ursprünglichen Ausfalls kann aus
den inzwischen rotierten Logs nicht sekundengenau rekonstruiert werden.

## Dauerhafte Korrektur

Der Dokumentleser lässt genau eine normale HTTP-307-Erneuerung innerhalb des
bestehenden Abrufzeitlimits zu. Herkunft, Zugangsdatenfreiheit, Pfad,
Parameterzahl und exaktes Rückziel werden geprüft. Fremde Ziele, Loginziele,
zusätzliche Parameter, doppelte Rückziele und markierte Prüfseiten bleiben
abgewiesen. Die Erneuerungsseite darf ihre vorhandenen Skripte und Cookies
normal ausführen; erst das tatsächlich neu geladene Ursprungsdokument wird
an den Katalogleser zurückgegeben. Fehler und wiederholte Weiterleitungen
bleiben sichtbar; ein Abbruch entfernt die Überwachung des Ladevorgangs.

Keine Änderung an Suchfiltern, Abruftakt, Schutzpausen, Schema oder
Abhängigkeiten. Der zusätzliche Browserablauf bleibt Teil desselben begrenzten
Katalogabrufs; Browser-Nebenanfragen werden wie bisher nicht einzeln als
Sammleraufruf gezählt.

## Prüfung und Veröffentlichung

Der neue Regressionstest reproduzierte zuerst HTTP 307 statt HTTP 200. Ein
weiterer roter Test sichert markierte Prüfseiten ab. Nach Korrektur bestehen
338 Diensttests unter Windows und Linux mit Node 22.23.2, Typprüfung und Bau.
Der unabhängige Review fand eine fehlende Weitergabe von HTML-markierten
HTTP-200-Prüfseiten während der Erneuerung. Beide bereits unterstützten
Inhaltsmerkmale werden jetzt vor der Skriptausführung unverändert an den
vorhandenen Sammler weitergereicht; zwei rote/grüne Fälle und der echte
Chrome-Test sichern dies ab. Nachreview ohne offene wichtige Befunde. Der vorhandene Browser-Containertest
prüft die echte Folge Katalog → HTTP 307 → Sitzungserneuerung mit Cookie und
verzögerter Rücknavigation → neuer Katalog. Zusätzlich bleibt eine zweite
Erneuerung ein HTTP-307-Fehler. Der Container hat kein externes Netzwerk;
Chrome-Sandbox, private Steuerung, Bedienung, ursprüngliche Fehlercodes,
Abbruch und Profilpersistenz werden weiterhin geprüft.

CI-Auswahl: eigener Job `Sniper service` mit den vollständigen Diensttests,
Typprüfung, Dienstbau, Abbildbau, Starttest und Browser-Containertest.
Die bestehenden Testdateien wurden erweitert; keine neue Registrierung nötig.
Keine Angular-Vorlage oder Datenbank geändert, deshalb keine fachfremde
Frontend-Browserregression oder Datenbankmigration erforderlich.

Veröffentlichung der dauerhaften Korrektur erst über einen freigegebenen PR
mit erfolgreichen Pflichtprüfungen. Der Produktionscontainer verwendet bis
dahin weiterhin sein bisheriges Abbild.

Technische Referenz:
[Chrome DevTools Fetch](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/)
und [Page](https://chromedevtools.github.io/devtools-protocol/tot/Page/).
