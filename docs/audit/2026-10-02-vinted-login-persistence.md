# Vinted: sichtbare Abmeldung trotz gespeicherter Anmeldedaten

Stand: 2. Oktober 2026. Alle Uhrzeiten in Europe/Berlin.
Auftrag: Nach der gemeldeten morgendlichen Abmeldung heutige Abrufe sowie
Speichern und erneutes Öffnen des zugeordneten GoLogin-Profils prüfen.

## Ergänzung: bestätigte Neuanmeldung und weiterhin sichtbare Pausenmeldung

Der Nutzer hat sich anschließend erneut angemeldet. Die interaktive Sitzung
lief von 09:03:31 bis 09:04:07; die Kontobestätigung wurde um 09:03:59 gespeichert.
Ein anschließender manueller Datenabruf startete eine neue Browsersitzung um
09:04:21, bestätigte den Datenstand um 09:04:33 und war um 09:04:47 einschließlich
Browserstopp erfolgreich abgeschlossen. Damit ist eine erfolgreiche
Wiederverwendung der frisch gespeicherten Anmeldung über einen Browserstopp
hinweg nachgewiesen. Die Stabilität über längere Pausen bleibt offen.

GoLogin zeigt danach einen gespeicherten Profilstand von 09:04:42 und
`canBeRunning = true`. Die neu gespeicherten Anmeldetokens enthalten als
Ausgabezeit 09:03:54. Keine Token-Werte oder privaten Payloadfelder ausgegeben.
Alle 119 Sitzungen sind geschlossen. Kein zusätzlicher Abruf durch die
Diagnose gestartet; der bereits erfolgreiche Nutzerabruf genügt als Nachweis.

Die weiterhin sichtbare Meldung „Vinted hat den Abruf abgelehnt“ kommt vom
pausierten Zeitplan: `enabled = false`, `paused_reason = forbidden`, letzter
automatischer Versuch 02:07 Uhr. Der erfolgreiche manuelle Abruf hat keinen
zugeordneten Zeitplan und verändert diesen bei Abschluss daher nicht.
Anmeldung und Kontobestätigung setzen die Automatik ebenfalls nicht fort.
Die Anzeige beschreibt somit den früheren Pausengrund, obwohl der aktuelle
manuelle Zugriff wieder funktioniert. Die Oberfläche ist in diesem Zustand
missverständlich, ein erneuter aktueller Abruffehler ist nicht belegt.

Im normalen Einstellungsdialog steht „Automatik fortsetzen“ bereit. Der
vorhandene Weg vergibt eine neue Freigabe und löscht Pausengrund und Fehlerzähler.
Dialog für den Nutzer geöffnet; die gespeicherte Pause und der Abstand von
drei Minuten durch die Diagnose nicht verändert. Produktionsdatenbank erneut
ausschließlich lesend geprüft, UI und Abschlusslogik abgeglichen.

## Ergebnis

Die sichtbare Abmeldung ist im richtigen Konto reproduziert. GoLogin hat
weiterhin Anmelde-Cookies gespeichert und speichert nach beiden kontrollierten
Browserstopps einen aktualisierten Profilstand. Ein vollständig geleertes oder
bei jedem Start neu angelegtes Profil ist damit nicht nachgewiesen.

Der erste nächtliche Fehler ist eine Vinted-Zugriffsablehnung (`forbidden`,
HTTP 403), keine protokollierte 401. Er pausiert die Automatik. Die vorhandenen
Cookies und deren Ablaufzeiten beweisen keine serverseitig gültige Anmeldung.
Ebenso beweist die Cookie-API nicht, dass der laufende Browser alle gespeicherten
Anmeldetokens korrekt geladen und an Vinted gesendet hat.

**Ursache bleibt offen:** Ablehnung beziehungsweise Widerruf durch Vinted,
Zugriffsschutz oder fehlerhafte Wiederherstellung im laufenden Cloudbrowser
lassen sich mit den vorhandenen Messungen noch nicht trennen. Der frühere
Vorschlag einer Wiederprüfung bei initialer 401 erklärt diese 403 nicht.

## Produktiver Verlauf

| Zeitpunkt                 | Befund                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| 01.10., ab 20:38          | Erfolgreicher manueller Abruf und danach 63 erfolgreiche automatische Abrufe bis zum letzten Erfolg. |
| 02.10., 02:03:48          | Letzter erfolgreicher Datenstand; Auftrag einschließlich Browserstopp um 02:03:58 abgeschlossen.     |
| 02.10., 02:07:10–02:07:30 | Automatischer Auftrag scheitert beim Profil mit `forbidden`; Automatik pausiert.                     |
| 02.10., 08:21:06–08:21:26 | Manueller Abruf scheitert ebenfalls mit `forbidden`.                                                 |
| 02.10., 08:21:36–08:22:29 | Separate interaktive Browsersitzung, ohne zugeordneten Import, ordentlich geschlossen.               |

Der Zeitplan steht auf drei Minuten. Zum Diagnosebeginn ist er deaktiviert,
mit `paused_reason = forbidden` und einem Fehler. Die Kontoverbindung selbst
steht weiterhin auf `connected`. Dieser gespeicherte Status beweist keine
aktuell nutzbare Vinted-Anmeldung.

Es besteht genau eine Datenbankzuordnung zu einem GoLogin-Profil, angelegt am 28. September. Keine der gespeicherten Sitzungen hat eine abweichende
Profilreferenz. Im vollständigen Sitzungsbestand gibt es keine zeitlichen
Überschneidungen derselben Verbindung. Starts außerhalb Flipbases sind damit
nicht ausgeschlossen. Die GoLogin-Oberfläche enthält ein weiteres Profil;
Flipbase verwendet das erste gelistete Profil für die Verbindung „Maike Vintage“.

## Gespeicherte Cookies

Die offizielle Cookie-API liefert HTTP 200 und 23 gespeicherte Cookies.
`access_token_web`, `refresh_token_web` und `_vinted_fr_session` sind vorhanden.
Die Cookie-Ablaufzeiten sind nicht erreicht.

Die ausschließlich im Arbeitsspeicher gelesenen Token-Payloads enthalten folgende
Zeitangaben; ihre Signaturen und serverseitige Gültigkeit wurden nicht geprüft:

- Zugangstoken: Ausgabe 02.10., 02:07:21; Ablauf 03.10., 02:07:21.
- Erneuerungstoken: Ausgabe 02.10., 02:07:21; Ablauf 31.12., 01:07:21.

Die Ausgabezeit liegt im fehlgeschlagenen nächtlichen Browserlauf. Das passt zu
einer Aktualisierung während dieses Laufs, beweist aber keinen erfolgreichen
Identitätsabruf oder die genaue Ursache der folgenden Ablehnung.

Keine Cookie-Werte, Token, privaten Token-Payloads oder Zugangsdaten wurden
ausgegeben oder in Dateien gespeichert. Vergleiche verwenden nur kurzlebige
Hashwerte im Werkzeug-Arbeitsspeicher; das Dokument enthält keine Hashwerte.

## Zwei kontrollierte Browserstarts über Flipbase

Beide Starts liefen über die normale angemeldete Flipbase-Oberfläche und den
vorhandenen Broker mit Kontoberechtigung und Sitzungssperre. Keine zweite
Anbieterverbindung und kein paralleler Start direkt bei GoLogin.

1. 08:33:39–08:36:02: Browser-Ansicht ohne Eingabe von Zugangsdaten geöffnet.
   Die Vinted-Startseite zeigt „Registrieren / Einloggen“. Vor dem Stopp liegt
   der gespeicherte Profilzeitpunkt noch bei 08:22:25. Nach dem ausdrücklichen
   Stopp liegt er bei 08:35:58; `canBeRunning` ist wieder wahr.
   Zugangstoken und Erneuerungstoken bleiben unverändert vorhanden.
   Wert und Ablaufzeit von `_vinted_fr_session` ändern sich.
2. 08:36:17–08:38:45: Dasselbe Profil erneut geöffnet. Wieder dieselbe sichtbare
   abgemeldete Startseite. Nach dem Stopp liegt der Profilzeitpunkt bei
   08:38:41; `canBeRunning` ist wieder wahr. Beide Anmeldetokens bleiben
   unverändert, das Sitzungscookie wird erneut aktualisiert.

Damit sind aktualisierte Speicherung und wiederholbarer Browserzustand belegt;
die Übernahme der Token in den laufenden Browser wurde nicht direkt gemessen.
Es wurde keine neue Anmeldung vorgenommen, keine Identität bestätigt und keine
Automatik fortgesetzt. Abschließend sind alle 117 Browsersitzungen geschlossen.

## Worker-Neustarts

Der tatsächlich laufende Worker verwendet weiterhin das Image aus `f1c9e623`.
Er ist gesund, hat aber insgesamt 20 Docker-Neustarts seit seiner Erstellung.
Der letzte Start liegt am 01.10. um 23:43:08, also vor zahlreichen weiteren
erfolgreichen Abrufen bis 02:03 Uhr. Die Datenbank-Runtime hat Epoche 3.
Der Neustartzähler ist daher kein Nachweis für den unmittelbaren Auslöser
des nächtlichen Fehlers. Historische Docker-Ereignisse lieferten keine weiteren
Einträge; die einzelnen Neustartursachen bleiben ungeklärt.

## Nächster erforderlicher Nachweis

Eine frisch und eindeutig bestätigte Anmeldung desselben Kontos bildet die
fehlende Ausgangsbasis für einen erfolgreichen Login-Persistenztest. Danach
im bestehenden Worker die Token-Präsenz und Ablaufmetadaten im aktiven
Browser vor Navigation, nach Seiteninitialisierung und vor Stopp vergleichen;
nach bestätigtem Stopp erneut öffnen. Nur feste Statuskategorien und
Gleichheitsvergleiche protokollieren, keine Cookie-Werte oder Antwortinhalte.
Eine 403 getrennt von 401 behandeln und die Anbieterpause nicht automatisch
umgehen. Ohne diesen Nachweis weder einen vermuteten Speicherfehler als
behoben ausgeben noch auf Verdacht Cookies importieren oder Proxy ändern.

## Quellen und Prüfgrenzen

- [GoLogin: Profilsynchronisierung](https://support.gologin.com/en/articles/14404855-profile-synchronization)
  beschreibt Speicherung nach ordentlichem Stopp und das Abwarten von `Ready`.
- [GoLogin: Cookie-Dokumentation](https://support.gologin.com/en/articles/14361590-what-are-browser-cookies)
  erklärt, dass vorhandene Cookies allein keinen Kontozugriff garantieren.
- [Offizielle GoLogin-API](https://api.gologin.com/docs): Der aktuelle Swagger-Vertrag
  beschreibt `get /browser/{id}/cookies` ausdrücklich als gespeicherte Cookies
  aus der Datenbank und `delete /browser/{id}/web` als Cloudbrowser-Stopp.
- Produktionsdatenbank ausschließlich in `read only`-Transaktionen gelesen;
  Logs nur mit festen Metadatenfeldern ausgegeben. Keine produktiven Dienste,
  Profileinstellungen, Zeitpläne oder Anwendungsdateien verändert.
- Kein erfolgreicher Neulogin, keine Token-Signaturprüfung, keine Messung der
  ausgehenden Proxy-IP oder der Cookies im aktiven Browser. Der ursprüngliche
  Zustand unmittelbar vor dem Fehler um 02:07 Uhr ist nicht mehr rekonstruierbar.
