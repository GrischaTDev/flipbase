# Vinted-Cloudpilot mit IPRoyal-IP-Bestand

Stand: 05.10.2026. Freigegebener Pilot; lesenden Anbieterabgleich ergänzen.
Ergänzt den [gemeinsamen Entwurf für Erweiterung und Cloud](vinted-local-and-cloud-design.md).

## Ergänzung vom 07.10.2026: Gesprächsabruf

Beim ausdrücklichen Öffnen eines Cloud-Gesprächs liest der Browserdienst dessen
Details über das bestehende Kontoprofil und die zugewiesene IP. Die Leseroute
`/marketplace-browser/conversations/read` erhält die Flipbase-Gesprächs-ID;
die Anbieter-ID wird ausschließlich aus dem kontogebundenen Eintrag ermittelt.
Der bestehende Kontoimport liest Profil, Inserate, Gesprächsliste und Bewertungen
und zusätzlich genau diesen Gesprächsverlauf. Die Übernahme verwendet die
vorhandene transaktionale Importfunktion und benötigt keine Schemaänderung.

Nur ein bestätigter Detailabruf mit übernommenem Prüfzeitpunkt erlaubt die Anzeige
„Synchronisiert“. Ein Fehler behält den gespeicherten Verlauf; eine andere
Konto- oder Gesprächsauswahl verwirft verspätete Rückmeldungen. Der automatische
Hintergrundabruf öffnet weiterhin keine ungelesenen Gespräche. Vollständiger
Nachrichtenabgleich im Hintergrund und Cloud-Schreibaktionen sind getrennte,
noch offene Schritte. Der echte Detailabruf wird erst nach Veröffentlichung
dieser Änderung am Pilotkonto geprüft.

## Ziel und Umfang

Nutzer können ein Vinted-Konto lokal mit der Erweiterung oder in der Cloud
verknüpfen. Ein bereits lokal verknüpftes Konto kann zur Cloud wechseln. Seine
Kontozuordnung und gespeicherten Anzeigen, Nachrichten und Verlaufsdaten bleiben
erhalten. Cloudprofile erhalten jeweils eine eigene feste deutsche Dedicated-ISP-IP.

Der erste Pilot verwendet die bereits gekaufte IPRoyal-IP für ein vom Nutzer
benanntes Testkonto. Beim Einrichten und beim Cloudwechsel liest der Server
automatisch bereits gekaufte IPs aus dem IPRoyal-Konto ein. Die dort für Flipbase
gekauften, geprüften und hier noch nicht belegten IPs bilden den freien Bestand.
Automatische Käufe, Verlängerungen, Kündigungen und Änderungen
an Kundenabonnements sind spätere Aufgaben. Ein fehlender Bestand löst keinen
Kauf aus. Die Cloudoption wird zunächst nur für freigeschaltete Pilotnutzer angeboten.

## Ausgangspunkt und Entscheidung

Der vorhandene Chromiumworker unterstützt private Proxykonfigurationen mit
separaten Zugangsdaten. Browserprofile speichern bereits eine `networkId`.
Die Profilerstellung verwendet bisher eine gemeinsame Standard-Netzwerkkennung;
sie muss für den Piloten ausdrücklich die reservierte IP des Kontos erhalten.
Ein zusätzlicher GoLogin-Dienst ist dafür nicht erforderlich.

Die Kontoverträge kennen `executionMode` mit `local` und `cloud`. Der Übergang
zur lokalen Erweiterung ist vorhanden; der sichere umgekehrte Übergang benötigt
einen eigenen Ablauf. Die normale Cloud-Profilvorbereitung erlaubt bisher nur
Cloudkonten. Eine begrenzte Cloud-Einrichtung darf ein lokales Konto vorbereiten,
ohne ihm bereits normale Cloudaufträge zu erlauben.

Empfohlen ist ein zentraler Bestand mit kontoweiser Reservierung. Eine globale
Proxyvorgabe würde dieselbe IP mehreren Konten geben. Ein automatischer IP-Kauf
beim Einrichten würde bereits Zahlungs- und Wiederholungslogik benötigen und
bleibt außerhalb dieses Piloten.

## Gekaufte IPs und verfügbare IPs

Eine IP ist nur verfügbar, wenn sie als aktive deutsche Dedicated-ISP-IP für
Flipbase registriert, nicht abgelaufen, nicht gesperrt und weder reserviert noch
zugeordnet ist. Bestelllaufzeit und Standort werden vor der Freigabe geprüft.
Die erstmalige Registrierung enthält außerdem einen Verbindungstest. Der
Screenshot allein bestätigt den deutschen Standort nicht.

Flipbase speichert Bestellreferenz, Ablaufzeit, interne Netzwerkkennung und
Zuordnung. Proxyzugangsdaten bleiben in der bestehenden privaten Serverkonfiguration;
die Kundenoberfläche erhält keine Passwörter oder API-Schlüssel. Nur autorisierte
Serveroperationen dürfen den gemeinsamen Bestand verwalten. Kunden sehen allein
die Verfügbarkeit und den Zustand ihrer eigenen Kontoeinrichtung.

IPRoyal dokumentiert `GET /products` und `GET /orders` mit `product_id` und
`X-Access-Token`. Der lesende API-Abgleich übernimmt aktive gekaufte deutsche
`ISP Dedicated`-IPs und deren Laufzeiten; die Flipbase-Zuordnung bleibt unsere
eigene Wahrheit. Vor dem Abgleich wird die vorhandene Pilot-/Workspace-Berechtigung
geprüft. Alle Bestellseiten müssen vollständig und konsistent gelesen sein,
bevor der Bestand verändert wird. Ein Anbieterfehler erlaubt keine Reservierung
aus einem möglicherweise veralteten Bestand.
Der Anbieterbestand zum Verkauf ist kein Bestand bereits gekaufter IPs.
Das verwendete IPRoyal-Konto ist für Flipbase vorgesehen; externe IP-Nutzungen
kann die API nicht erkennen. Bestehende Sperren und Reservierungen bleiben erhalten.
Der API-Schlüssel bleibt ausschließlich in der privaten Worker-Umgebung.
Netzwerkdateien werden nur um neue Zugänge ergänzt; geänderte vorhandene Zugangsdaten
stoppen den Abgleich statt laufende Konten umzuschreiben. Nicht mehr gelieferte IPs
laufen im Bestand aus, ihre Zuordnung wird dabei nicht freigegeben.
Die API liefert eine Ablaufuhrzeit ohne dokumentierte Zeitzone. Bis zur Klärung
gilt als vorsichtige eigene Nutzungsgrenze 00:00 UTC am Tag vor dem Ablauftag.

## Reservierung und fehlende Kapazität

1. Nach Auswahl von „Cloud“ prüft der Server Zugriffsrechte, Kontozustand und
   vorhandene Einrichtung. Wiederholte Anfragen verwenden dieselbe Reservierung.
2. Der Server gleicht die bereits gekauften IPRoyal-IPs ab. Anschließend
   reserviert eine Datenbanktransaktion die nächste verfügbare IP. Die älteste
   Registrierung wird zuerst gewählt; bei gleichem Zeitpunkt entscheidet die
   interne Kennung. Eine eindeutige Zuordnung verhindert, dass zwei gleichzeitig
   eingerichtete Konten dieselbe IP erhalten.
3. Die IP bleibt während Anmeldung und Kontoprüfung reserviert. Erst beim
   erfolgreichen Abschluss wird sie fest diesem Konto zugeordnet.
4. Ohne freie IP erscheint: „Aktuell sind keine freien Cloud-IPs vorhanden.“
   Bei einem bestehenden Konto bleibt der lokale Betrieb erhalten. Für ein neues
   Konto kann der Nutzer die lokale Verknüpfung wählen.

Ein technischer Fehler beim Prüfen oder Reservieren ist keine leere Kapazität:
„Die Cloud-IP-Verfügbarkeit konnte nicht geprüft werden. Bitte versuche es erneut.“
Ein erneuter Aufruf darf weder eine zweite IP reservieren noch ein zweites Profil anlegen.

## Lokales Konto zur Cloud wechseln

1. „Auf Cloud wechseln“ startet eine separate Einrichtung für die vorhandene
   Verbindung. Ohne freie IP wird sie vor dem Browserstart beendet.
2. Ein isoliertes Serverprofil erhält die reservierte IP. Der Nutzer meldet sich
   darin bei Vinted an. Lokale Cookies und Erweiterungsschlüssel werden nicht kopiert.
3. Der Server prüft, ob die angemeldete Vinted-Konto-ID zur bisherigen Verbindung
   gehört. Ein anderes Konto verhindert den Abschluss; die vorhandene Zuordnung
   wird nicht überschrieben.
4. Vor dem Abschluss werden lokale Aufträge angehalten und noch laufende Aktionen
   abgeklärt. Bei ungeklärtem Ergebnis wird der Wechsel blockiert. Bis zu diesem
   Punkt ist die Erweiterung der einzige normale Auftragsexecutor; der Cloudbrowser
   erlaubt ausschließlich Anmeldung und lesende Identitätsprüfung.
5. Ein atomarer Abschluss prüft Einrichtung, Berechtigung und Kontozustand erneut,
   ordnet die IP zu, setzt `executionMode` auf `cloud` und widerruft den lokalen
   Erweiterungszugriff. Bestehende Datensätze behalten ihre Verbindungs-ID.

Danach darf allein die Cloud normale Aufträge übernehmen. Verspätete Meldungen
der Erweiterung werden anhand der serverseitigen Betriebsart und widerrufenen
Freigabe abgewiesen. Ein Verbindungsabbruch nach erfolgreichem Abschluss wird durch
Nachladen des tatsächlichen Serverzustands aufgelöst, nicht durch einen zweiten Wechsel.

Für ein neues Cloudkonto gilt dieselbe IP-Reservierung und Anmeldeprüfung.
Seine Verbindung bleibt bis zur erfolgreichen Identitätsprüfung im Einrichtungszustand;
normale Aufträge werden erst anschließend freigegeben.

## Abbruch, Ablauf und Betrieb

Ein abgebrochener Wechsel erhält die lokale Betriebsart und Freigabe. Vor
Wiederfreigabe der IP müssen der Cloudbrowser beendet und das vorbereitete Profil
bereinigt oder sicher archiviert sein. Ein bloßer Zeitablauf einer Reservierung
reicht nicht. Unklarer Zustand hält die IP gesperrt, bis die Bereinigung bestätigt ist.
Eine IP darf erst danach für ein anderes Konto verwendet werden.

Cloudaufträge verwenden ausschließlich die zugeordnete IP. Bei fehlender
Proxykonfiguration, Verbindungsfehler oder abgelaufener IP pausiert das Konto mit
sichtbarem Fehler. Es gibt keinen automatischen Wechsel auf die direkte Server-IP
oder eine andere Proxy-IP. Neustarts des Workers erhalten die Zuordnung.
Das Ablaufdatum muss administrativ sichtbar sein, damit der Pilot rechtzeitig
verlängert oder beendet werden kann. Der Wechsel zurück zur Erweiterung verwendet
den vorhandenen lokalen Verknüpfungsablauf nach beendetem Cloudbetrieb.

## Abnahme

### Normales Chrome für die vorhandene Cloud-Einrichtung

Der Sitzungscontainer startet Google Chrome direkt mit dem vorhandenen
Kontoprofil unter `/profile`. Playwright verbindet sich innerhalb desselben
Containers ausschließlich über Loopback; es startet diesen Browser nicht. Die manuelle
Browseransicht überträgt Eingaben über die Betriebssystemtastatur und -maus.
Die vorhandenen authentifizierten Sitzungsendpunkte bleiben erhalten. Ein
öffentlicher VNC-Port wird dafür nicht benötigt. Proxy-Zugangsdaten werden
über den vorhandenen Pilot-Weiterleiter verwendet; nur HTTP-Proxyanschlüsse
sind in dieser Runtime zulässig.

Controller, Broker und Sitzungsimage müssen gemeinsam auf geprüfte Versionen aktualisiert
werden. Das Sitzungsimage trägt `de.flipbase.chromium.runtime=isolated-actions-v1`;
der neue Worker verweigert den Start mit einem alten Image. Vor der Aktivierung
müssen die laufenden Kontobrowser bestätigt beendet sein. Neue Versionen erst
nach erfolgreichen PR-Prüfungen und Image-Smokes verwenden. Die bestehende
Profilablage und IP-Zuordnung werden dabei nicht kopiert oder umgeschrieben.

### Ergänzung vom 08.10.2026: begrenzte Wiederverwendung und Prozessrechte

Der bestehende eine Cloudplatz bleibt erhalten: Controller und Broker jeweils
512 MiB, höchstens eine aktive oder zu bereinigende Sitzung mit 2 GiB. Aufeinanderfolgende
Aktionen desselben Kontos können den Container innerhalb von 20 Sekunden Leerlauf
und bis zwei Minuten nach seiner Erstellung erneut verwenden. Die Freigabe wird
bei jeder Aktion erneut geprüft. Ein Kontowechsel startet einen frischen Container;
gespeicherte Profile und Anmeldungen bleiben erhalten. Vor einem Queue-Claim wird
eine freie wiederverwendbare Sitzung vollständig beendet. Die Datenbankreservierung
bleibt bis zum bestätigten physischen Stopp aktiv. Einrichtung und manuelle
Anmeldesitzungen behalten ihre bestehenden Zeitgrenzen.

Browser- und Playwright-Auswertung laufen im unprivilegierten Sitzungscontainer
mit genau einem Profil und ohne Docker-Socket oder globale Schlüssel. Der
Controller erhält feste Aktionen statt CDP-Zugang. GoLogin nutzt denselben
isolierten Auswerter über einen kurzlebigen, profilspezifischen Broker-Tunnel;
der globale Anbieterschlüssel bleibt im vertrauenswürdigen Controller und Broker.
Ein vollständig übernommener Controller oder Docker-Broker bleibt daher eine
offene Vertrauensgrenze der ursprünglichen Security-Meldungen.

Die Umstellung erfordert keine neue Maschine oder Datenbankmigration. Vor Aktivierung
Aufträge anhalten und laufende Sitzungen bestätigt bereinigen, dann geprüfte
Controller-, Broker- und Sitzungsimages gemeinsam wechseln. Die Host-Firewall
muss auf Richtlinie `v3` aktualisiert und bestätigt werden. Das Setup überschreibt
abweichende bereits installierte Host-Dateien bewusst nicht: die vorhandene,
root-eigene Bootstrap-Datei vorher mit der geprüften neuen Version ersetzen,
dann `setup` ausführen und `verify` bestätigen. Der alte Timer muss währenddessen
angehalten sein; erst die neue Richtlinie darf neue Starts freigeben.
Die GoLogin-Compose-Datei bindet nun ebenfalls Broker, isoliertes Sitzungsimage,
Profilmetadaten, Broker-Schlüssel und geprüfte Host-Firewall ein. Bestehende
GoLogin-Installationen benötigen diese bisher nur im Chromium-Pilot vorhandenen
Voraussetzungen vor der Umstellung. Anschließend echte Anmeldung, Abruf und
Profilpersistenz mit dem zugeordneten Konto prüfen. Die lokale Erweiterung bleibt unverändert.
Ein unbestätigter Chrome-Stopp liefert Exitcode 75 und bleibt gesperrt.

Das separat angemeldete Maike-Vintage-Pilotprofil ist weiterhin nicht mit einer
Flipbase-Verbindung verknüpft. Vor dem späteren Kontotest den unabhängigen Pilot
bestätigt stoppen, sein Profil erhalten und eine freie IP über die vorhandene
Cloud-Einrichtung reservieren lassen. Kein paralleler Betrieb über dieselbe IP.
Die produktive Verbindung muss anschließend dieselbe Vinted-Konto-ID bestätigen.
Die Pilotanmeldung und lesenden Abrufe sind dokumentiert; die vollständige
Verknüpfung, Umstellung von der Erweiterung, Schreibaktionen und Dauerbetrieb
bleiben eigene Abnahmen. Automatischer IP-Kauf ist weiterhin nicht Bestandteil.

- Gleichzeitige Einrichtungen mit nur einer freien IP: genau eine Reservierung;
  der zweite Nutzer erhält die Kapazitätsmeldung.
- Wiederholte Anfragen, verlorene Antworten und Worker-Neustart: unveränderte
  IP- und Profilzuordnung, keine doppelte Einrichtung.
- Fehlende, abgelaufene oder gesperrte IP: kein Browserstart und kein direkter
  Netzwerkzugriff als Ersatz.
- Abbruch, falsches Vinted-Konto oder ungeklärte laufende Aktion: bestehendes
  lokales Konto und seine gespeicherten Daten bleiben erhalten.
- Erfolgreicher Wechsel: dieselbe Verbindung und dieselben gespeicherten Daten;
  allein die Cloud führt weitere Aufträge aus. Alte Erweiterungsmeldungen scheitern.
- Zugriffsprüfung: fremde Arbeitsplätze können weder Reservierungen verändern
  noch Zugangsdaten oder fremde Einrichtungszustände lesen.
- Echter Pilot auf Hetzner: Proxy erreichbar, Ausgangs-IP und deutscher Standort
  geprüft, Anmeldung und lesender Datenabgleich im separaten Pilot nachgewiesen.
  Die Abnahme nach produktiver Flipbase-Cloud-Verknüpfung steht noch aus.

## Grundlagen

- Repositoryprüfung gegen `origin/master` bei `52ac4270` (PR 301). Vor Umsetzung
  den aktuellen Integrationsstand erneut prüfen; fremde Arbeitszweige bleiben unberührt.
- [IPRoyal: vorhandene ISP-Bestellungen per API lesen](https://docs.iproyal.com/proxies/isp/api/orders).
- [IPRoyal: Proxyanbindung an Playwright](https://iproyal.com/integrations/proxy-integration-with-playwright/).
