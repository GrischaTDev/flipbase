# Vinted: veraltete Cloud-IP-Laufzeit blockiert Kontoabruf und Browserstart

## Belegte Ursache am 3. November 2026

Der öffentliche Browserstatus antwortet mit HTTP 200 und aktiver Automatik.
Worker und Broker sind gesund. Beim betroffenen Konto war der letzte Abruf
am 3. November um 00:56:08 Uhr Europe/Berlin erfolgreich; auch die sieben
vorherigen Abrufe waren erfolgreich. Der Plan wurde um 01:11:18 Uhr mit
`access_revoked` angehalten, ohne aufeinanderfolgende Abruffehler.

Das Konto bleibt `connected` und nutzt die Cloud. Betreiberberechtigung,
Workspace-Mitgliedschaft und Workspace selbst sind gültig. Die Prüfung
`marketplace_cloud_network_valid` ist allein wegen der gespeicherten
IP-Laufzeit negativ: hinterlegt ist der 3. November, 00:00 UTC.
Die letzten Browsersitzungen sind bestätigt geschlossen.

Der bereits angemeldete Anbieterbereich zeigt eine aktive Verlängerung.
Eine anschließende reine GET-Abfrage der zugeordneten Bestellung bestätigt
denselben Anbieterauftrag und dieselbe IP anhand ihres Fingerabdrucks,
Status `confirmed`, automatische Verlängerung und Ablauf
`2026-12-04 11:42:59`. Der Anbieter nennt dabei keine Zeitzone. Nach der
bereits bestehenden konservativen Flipbase-Regel ergibt sich
`2026-12-03T00:00:00Z`. Die Zuordnung wurde nur geprüft; keine IP ersetzt.

Ungefilterte Produktionslogs wurden wegen möglicherweise enthaltener
privater Daten von der automatischen Freigabeprüfung vor Ausführung
abgewiesen. Die Diagnose gelang mit begrenzten Statuscodes, Zeitpunkten,
Ja/Nein-Berechtigungsmerkmalen und dem Anbieterabgleich. Keine Rohlogs,
Cookies, Passwörter oder Proxyzugänge wurden in Ausgaben übernommen.

## Dauerhafte Korrektur

`IpRoyalCloudIpSync.refresh()` übernimmt bereits verlängerte Laufzeiten,
wurde bisher aber nur bei der Cloud-Kontoeinrichtung aufgerufen. Der
Hintergrundlauf bearbeitete ausschließlich die gesondert freigegebene
automatische Bezahlung. Eine Anbieter-Verlängerung konnte dadurch die
lokale Laufzeit veralten lassen.

Der vorhandene Bestandsabgleich läuft nun auch alle zehn Minuten,
unabhängig von der Freigabe automatischer Bezahlung. Anbieterzugriffe
dieses Abgleichs bleiben lesend. Er kontrolliert vollständigen Bestand,
unveränderte Zugangsdaten und den deutschen Ausgang. Bestehende
Kontozuordnungen, deaktivierte IPs und Kontopausen bleiben erhalten.
Fehler werden mit festen Ereigniscodes gemeldet; parallele Abgleiche
werden zusammengefasst.

Der erste Abgleich wird nach einem Worker-Neustart vor dem Dispatcherstart
abgewartet. Der unabhängige Review fand andernfalls ein Zeitfenster:
erster Auftragsabruf nach 15 Sekunden, Bestandsabgleich erst nach 30 Sekunden.
Ein echter Dispatcher-Test reproduzierte die zu frühe Freigabe zunächst rot.
Runtime-Initialisierung und laufende Heartbeats bleiben erhalten.

Ein ungültiges Cloudnetz erhält einen eigenen Fehler und den festen Fehlercode
`cloud_network_unavailable`. Die Oberfläche erklärt diesen sowie einen
belegten Browserplatz mit festen Meldungen. Unbekannte Fehler bleiben
neutral. Eine Sperre startet keine Browsersitzung und sendet keine
Vinted-Zugangsdaten. Eine erneute Anmeldung ersetzt keinen IP-Abgleich.

## Prüfung und Betriebsgrenze

Die neuen Fehlerfälle wurden vor der jeweiligen Korrektur rot reproduziert.
Mit Node 22.23.4 bestehen 747 Workerfälle, acht regulär ausgelassen;
Worker-Typprüfung und Worker-Bau ebenfalls erfolgreich. Der lokale
Vorabcheck bestätigt Format, Lint, Anwendungstypen, Suite-Audit,
121 Scriptfälle, acht Orchestrierungsfälle (drei regulär ausgelassen),
vier Modellfälle, 751 Angularfälle in 42 Dateien und den Angular-Bau.
Die zunächst aufgefallenen drei Test-Lintfehler wurden behoben; die
reguläre ignorierte Versionsdatei vor der Anwendungstypprüfung erzeugt.
Die Bauwarnungen zu bestehenden Budgets und `pako` bleiben erhalten.

Vier bestehende Browserfälle für Anmeldestartfehler bestehen zusätzlich:
volle GoLogin-Profilliste und veralteter Browserdienst, jeweils
1440 Pixel/hell und 390 Pixel/Touch/dunkel. Separater ruhender
`pwa-testing`-Bau mit unveränderter Produktions-CSP, synthetischen Antworten
und ohne Anbieterzugriffe. Der erste lokale Versuch gegen einen Bau mit
lokaler API-Adresse war bereits vor der Kontoansicht an der Produktions-CSP
gescheitert; danach die vorhandene passende Testkonfiguration verwendet,
ohne Schutzbedingungen oder Erwartungen zu ändern.

Der unabhängige Review prüfte insbesondere Startreihenfolge,
Shutdown während des ersten Abgleichs, unveränderte Zahlungsfreigaben,
Netzsperren und die sichere Fehlerweitergabe; kein offener Befund.
Die ausgewählten zusätzlichen Browser-, Integrations-, Worker-/Edge-
und Imageprüfungen bleiben CI-Nachweise vor der Veröffentlichung.
Marketplace-Images und Isolation benötigen den wegwerfbaren
GitHub-gehosteten Linux-Runner; lokale Tests ersetzen ihn nicht.

## Freigegebene Wiederherstellung

Der Nutzer hat die Berichtigung und Wiederaufnahme ausdrücklich freigegeben.
Vor der Änderung wurden dieselbe Bestellung und derselbe IP-Fingerabdruck
erneut beim Anbieter bestätigt. Anschließend ausschließlich das alte
Ablaufdatum der zugeordneten IP auf `2026-12-03T00:00:00Z` berichtigt,
mit Bedingung auf unveränderte Zuordnung und bisherigen Wert.
Cloudnetz danach gültig. In der regulären Oberfläche den bisherigen
15-Minuten-Abruf wieder aktiviert; Nachrichtenversand bleibt nicht freigegeben.

Der gemeldete Browserfehler war vor der Änderung in der echten Oberfläche
reproduzierbar. Danach dieselbe Cloud-Browseransicht erfolgreich geöffnet
und geordnet geschlossen. Keine Zugangsdaten eingegeben oder gesendet.
Ein regulärer lesender Kontoabruf wurde am 3. November um 08:11:22 Uhr
Europe/Berlin erfolgreich übernommen und um 08:11:28 Uhr bestätigt beendet.
Profil, Inserate, Gespräche und Bewertungen vollständig; Nachrichten und
Verkäufe melden bestehende Teilstände. Kein Abruffehlercode und keine
offene Sitzung. Screenshot privat in der Visualisierungsablage dieser
Sitzung, keine Kundenansichten im Repository.

Auch der erste reguläre geplante Abruf wurde um 08:25:57 Uhr erfolgreich
übernommen und um 08:26:03 Uhr geschlossen. Plan weiterhin aktiv,
Pausengrund leer, Fehlerzähler null; nächster Abruf eingeplant.
Die neu geladene Kontenkarte zeigt `Cloud Verbunden` und einen aktuellen
Synchronisierungszeitpunkt.

Die dauerhafte Codekorrektur wird erst über den freigegebenen PR und den
getrennten Worker-Rollout wirksam. Bis dahin übernimmt ein weiterer
Anbieter-Verlängerungsvorgang nicht automatisch die neue Laufzeit.
