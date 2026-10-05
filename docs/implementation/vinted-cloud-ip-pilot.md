# Vinted-Cloudpilot mit IPRoyal-IP-Bestand

Stand: 05.10.2026. Schriftlicher Entwurf zur Durchsicht; noch keine Umsetzung.
Ergänzt den [gemeinsamen Entwurf für Erweiterung und Cloud](vinted-local-and-cloud-design.md).

## Ziel und Umfang

Nutzer können ein Vinted-Konto lokal mit der Erweiterung oder in der Cloud
verknüpfen. Ein bereits lokal verknüpftes Konto kann zur Cloud wechseln. Seine
Kontozuordnung und gespeicherten Anzeigen, Nachrichten und Verlaufsdaten bleiben
erhalten. Cloudprofile erhalten jeweils eine eigene feste deutsche Dedicated-ISP-IP.

Der erste Pilot verwendet die bereits gekaufte IPRoyal-IP für ein vom Nutzer
benanntes Testkonto. Der IP-Bestand enthält zunächst diese eine manuell
registrierte IP. Automatische Käufe, Verlängerungen, Kündigungen und Änderungen
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

IPRoyal dokumentiert das Lesen bestehender Bestellungen über `GET /orders`.
Ein späterer lesender API-Abgleich übernimmt aktive gekaufte IPs und deren
Laufzeiten in den Bestand; die Flipbase-Zuordnung bleibt unsere eigene Wahrheit.
Der Anbieterbestand zum Verkauf ist kein Bestand bereits gekaufter IPs.
IPs, die außerhalb von Flipbase genutzt werden, dürfen nicht automatisch als frei
übernommen werden. Für den ersten Piloten ist kein IPRoyal-API-Schlüssel erforderlich.

## Reservierung und fehlende Kapazität

1. Nach Auswahl von „Cloud“ prüft der Server Zugriffsrechte, Kontozustand und
   vorhandene Einrichtung. Wiederholte Anfragen verwenden dieselbe Reservierung.
2. Eine Datenbanktransaktion reserviert die nächste verfügbare IP. Die älteste
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
  geprüft, Anmeldung und lesender Datenabgleich für das benannte Konto nachgewiesen.
  Dieser Nachweis steht aus.

## Grundlagen

- Repositoryprüfung gegen `origin/master` bei `52ac4270` (PR 301). Vor Umsetzung
  den aktuellen Integrationsstand erneut prüfen; fremde Arbeitszweige bleiben unberührt.
- [IPRoyal: vorhandene ISP-Bestellungen per API lesen](https://docs.iproyal.com/proxies/isp/api/orders).
- [IPRoyal: Proxyanbindung an Playwright](https://iproyal.com/integrations/proxy-integration-with-playwright/).
