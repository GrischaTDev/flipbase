# Gemeinsames Vinted-Postfach für lokale und Cloud-Konten

Stand: 08.10.2026. Der Nutzer hat den Funktionsumfang im Chat bestätigt.
Dieser Entwurf beschreibt den Ausbau; die zusätzliche Cloud-Ausführung ist
noch nicht implementiert oder am Echtkonto abgenommen.

## Ziel

Nutzer können ihre Vinted-Gespräche in Flipbase unabhängig von der Betriebsart
lesen, aktualisieren und beantworten. Neue eingehende Nachrichten erscheinen
in der Glocke und führen beim Anklicken zum richtigen Konto und Gespräch.
Cloud-Konten arbeiten auch bei ausgeschaltetem Nutzer-PC. Die bestehenden
Favoriten-Antworten einschließlich konfigurierter Angebote erhalten einen
Cloud-Ausführer mit denselben Regeln und Ergebniszuständen.

Die Extension bleibt der Ausführer lokaler Konten. Cloud-Konten verwenden
unseren vorhandenen Worker, das bestätigte Chromium-Kontoprofil und dessen
zugeordnete Proxy-IP. Ein neues GoLogin-Abonnement ist nicht Teil des Ausbaus.

## Belegter Ausgangspunkt

- Die gemeinsame Gesprächsoberfläche zeigt gespeicherte Verläufe, Angebote,
  Lesestatus und Aktualität. Text- und Einzelbildversand sowie Wiederholung
  existieren, sind jedoch auf `executionMode === 'local'` begrenzt.
- `VintedMessagingStore` und `VintedMessagingApiService` verwenden die lokalen
  Nachrichten-RPCs. Die Datenbank prüft zusätzlich die Extension-Freigabe;
  ein Entfernen der UI-Bedingung würde Cloud-Versand nicht ermöglichen.
- `marketplace_local_message_outbox` speichert Anfragekennung, Auftrag,
  Beginn und Ergebnis. Claims, Freigabegeneration und unklare Ergebnisse
  schützen den lokalen Versand bereits vor blindem Wiederholen.
- Der Cloudworker besitzt automatische Kontoabgleiche und einen ausdrücklich
  angeforderten Gesprächsabruf, aber noch keinen Nachrichtenexecutor.
- Die Glocke verarbeitet Favoriten und Bewertungen. Ein Pfad für neue
  Chatnachrichten fehlt bislang für lokale und Cloud-Konten.
- Favoritenregeln, Ereignisse, Nachrichten- und Angebotsversuche sind unter
  `380_marketplace_favorite_messages.sql` und in der Extension vorhanden;
  ihre Freigaben sind bisher ebenfalls an lokale Installationen gebunden.
- Der vorhandene Postfachplan weist Bildversand ausdrücklich als noch nicht
  zuverlässig am Echtkonto bestätigten Vertrag aus.
- Auf diesem Zweig sind die Bereinigung erledigter Anmeldewarnungen und die
  Übernahme von Gesprächsartikeln vorbereitet. Beide bleiben Teil des Ausbaus.

Grundlagen sind die aktuellen Dateien im Repository, insbesondere
[der gemeinsame Kontenentwurf](../../implementation/vinted-local-and-cloud-design.md)
und [der lokale Postfachplan](../../implementation/vinted-local-inbox.md).
Diese Dokumentation belegt keine aktuelle Verfügbarkeit des Produktionsservers.

## Entscheidung und Alternativen

Wir erweitern die bestehenden Daten- und Auftragsverträge um Cloud-Ausführung.
Die Oberfläche, Versandzustände und Fachregeln bleiben gemeinsam. Die
Extension und der Server erhalten jeweils einen passenden Ausführungsadapter.

Eine eigene Cloud-Warteschlange wäre zunächst unabhängig einführbar, würde
jedoch Status, Wiederholungslogik und Betriebswechsel doppelt lösen. Ein
sofortiger Cloud-HTTP-Versand ohne dauerhaften Auftrag wäre kleiner, könnte
aber nach Verbindungsabbruch oder Worker-Neustart den Ausgang nicht zuverlässig
zuordnen. Deshalb verwenden wir die vorhandene dauerhafte Auftragsabwicklung.

## Gemeinsame Aufträge und Kontoausführung

Die bestehende Nachrichten-Outbox bleibt erhalten. Jeder Auftrag enthält
zusätzlich die Betriebsart und eine passende Berechtigungsbindung. Bestehende
lokale Aufträge behalten ihre Extension-Freigabegeneration; Cloud-Aufträge
werden an die bestätigte Kontoidentität, Profilzuordnung und versionierte
Cloud-Versandfreigabe gebunden. Eine lokale Freigabe wird niemals als
Cloud-Freigabe ausgegeben.

Gemeinsame öffentliche RPCs für Einreihen, Lesen und bewusstes Wiederholen
verwenden die aktuelle Nutzeridentität und Arbeitsplatzrechte. Die bestehenden
Extension-RPCs bleiben kompatibel und dürfen weiterhin nur lokale Aufträge
übernehmen. Cloud-Claims sind ausschließlich dem Server zugänglich und prüfen
zusätzlich dessen aktiven Worker samt Sperrversion.

Pro Konto läuft höchstens eine Browseraktion. Nachrichtenversand,
Favoritenversand, manueller Gesprächsabruf, Anmeldung und automatische Abgleiche
verwenden die vorhandene Kontosperre des Brokers. Ein laufender Versand wird
nicht durch einen konkurrierenden Leseauftrag unterbrochen. Wartende manuelle
Antworten erhalten vor dem nächsten Hintergrundabgleich Vorrang; bereits
laufende Aktionen werden regulär beendet.

Vor Übernahme und unmittelbar vor einer externen Schreibaktion werden
Arbeitsplatz, Nutzerrecht, Kontoidentität, Betriebsart, Freigabeversion und
Profilzuordnung erneut bestätigt. Der Browser prüft die tatsächliche
Vinted-Identität. Geheimnisse und Bildbytes bleiben serverseitig geschützt.

Bei Betriebswechsel oder Widerruf werden noch nicht begonnene alte Aufträge
abgebrochen. Begonnene oder ungeklärte Versuche wechseln nicht zum neuen
Ausführer. Ein abgelaufener Claim allein erlaubt keinen zweiten Versand.

## Neue Nachrichten und Glocke

Automatische Abgleiche lesen die Gesprächsliste und begrenzte, geänderte
Gesprächskopien per GET. Sie öffnen keine Gesprächsseite im Browser und rufen
keine Gelesen-Markierung auf. Beide Betriebsarten liefern denselben bereinigten
Ereignisvertrag mit Konto, Gespräch, Quelle und stabiler Ereigniskennung.

Eine Änderung von `updated_at` allein beweist keine eingehende Nachricht.
Benachrichtigt wird nur bei einem belegten eingehenden Nachrichtenereignis.
Die ausdrücklich freigegebene Prüfung am 08.10.2026 bestätigt für Maike Vintage:
GET `/api/v2/conversations/{id}` erhält das Ungelesen-Flag vor und nach dem Abruf.
Der tatsächliche Webclient verwendet einen getrennten PUT für `mark_as_read`.
Die Kopie enthält `message.entity.id` bzw. bei `offer_request_message` die äußere
`id`, `entity.user_id` und einen ISO-Zeitpunkt mit Zeitzone in `created_at_ts`.
Listenrevisionen, Vinteds Benachrichtigungsliste und `legacy_last_message` mit
`sender_id=0` belegen dagegen keinen Nachrichteneingang.

Damit ist `conversation_snapshot` die belegte Eingangsquelle. Pro Lauf werden
höchstens drei geänderte Gespräche mit je höchstens 200 Nachrichten verarbeitet.
Nur Nachrichten vom bestätigten Gesprächspartner zählen als Eingang. Fehlende
Kennungen, unbekannte Absender oder abgeschnittene Kopien bestätigen keinen
Referenzstand. Die Prüfung belegt das aktuelle Testprofil, keine unveränderliche
Garantie des Anbieters; eine beobachtete Lesestatusänderung stoppt diesen Pfad.

Die erste vollständig belegte Gesprächskopie oder bestätigte leere Liste setzt einen dauerhaften Zeitbezug je Kontoidentität. Später geladene ältere Gespräche bleiben still; neue belegte Eingänge nach diesem Zeitbezug werden auch in neu angelegten Gesprächen gemeldet.
Alte Historie wird nicht nachträglich als neue Nachricht gemeldet. Wiederholte
Imports erzeugen über die eindeutige Konto- und Ereigniskennung keine weiteren
Glockeneinträge. Eigene gesendete Nachrichten und unbekannte Ereignistypen
erzeugen keine Meldung über eingehende Chatnachrichten. Mehrere belegte neue
Ereignisse bleiben auch bei unverändertem Ungelesen-Flag erkennbar.

Nach erfolgreicher Speicherung informiert ein privater Broadcast über die
Änderung. Die Glocke liest ihre Daten erneut durch die bestehenden
Arbeitsplatzrechte. Nach Wiederverbindung oder verpasstem Broadcast lädt sie
den dauerhaften Stand nach. Der Direktlink wählt Konto und Gespräch aus.
Eine Meldung in Flipbase als gelesen zu markieren ändert nicht eigenständig
den Lesestatus bei Vinted.

## Abgleich und Aktualität

Cloud-Abgleiche nutzen den vorhandenen Dispatcher, dessen Automatikfreigabe,
gewähltes Intervall, Drosselung und Pausengründe. Ein manuelles Öffnen oder
Senden benötigt keine aktivierte Hintergrundautomatik. Bestehende Intervalle
werden nicht ungefragt verändert; fünf Minuten ist der angestrebte Postfachwert,
den der Nutzer im vorhandenen Zeitplan wählen kann.

Postfachabrufe arbeiten begrenzt und laden nur die erforderlichen Datenbereiche.
Ältere Seiten werden schrittweise übernommen. Das ausgewählte Gespräch erhält
einen gezielten Detailabruf. Ein unvollständiger Abgleich löscht keine bekannte
Historie und behauptet keine vollständige Synchronisierung.

Die Oberfläche übernimmt bestätigte neue Daten ohne vollständiges Neuladen.
Sie unterscheidet gespeicherten Stand, laufenden Abruf, erfolgreichen Abruf und
Fehler. Der zuletzt gespeicherte Verlauf bleibt bei Fehlern lesbar. Eine grüne
Synchronisierung gilt nur für den tatsächlich bestätigten Bereich und Zeitpunkt.
Provider-Echtzeit wird nicht versprochen: neue Nachrichten erscheinen nach
dem nächsten erfolgreichen Abgleich, danach in Flipbase per Broadcast.

## Manueller Text- und Bildversand

Die gemeinsame Eingabe unterstützt weiterhin maximal 5.000 Zeichen und ein
JPEG- oder PNG-Bild nach Komprimierung mit maximal 256 KiB. Entwürfe sind je
Konto und Gespräch getrennt; Wechsel und verspätete Antworten überschreiben
keinen fremden Entwurf. Der Text wird erst nach bestätigtem Einreihen geleert.

Die erste Versandfreigabe wird kontoabhängig bestätigt. Cloud erhält dafür
eine eigene versionierte Freigabe, die bestehende lokale Installation ihre
Extension-Freigabe. Das globale Freischalten anderer Chromium-Schreibfunktionen
ist nicht erforderlich. Eine Kontoverknüpfung aktiviert keine Favoritenregel.

Die Zustände bleiben `queued`, `claimed`, `sending`, `sent`, `failed`,
`outcome_unknown` und `cancelled`. Stabile Anfragekennungen verhindern doppelte
Aufträge bei Doppelklick oder verlorener Einreihungsantwort. Unmittelbar vor
dem Provider-Versuch wird dessen Beginn dauerhaft gespeichert.

`sent` setzt einen eindeutigen Nachweis der zugehörigen externen Nachricht
voraus. Ein erfolgreicher Upload oder HTTP-Status allein reicht nicht.
Timeout, verlorene Antwort oder Neustart nach begonnenem Versuch führen bei
fehlendem Nachweis zu `outcome_unknown`, niemals zum automatischen Neuversand.

Vor einer bewussten Wiederholung wird der Verlauf erneut geprüft. Ein belegter
bereits erfolgter Versand verhindert den zweiten Versuch. Ein späterer
Erfolgsnachweis darf ein unklares Ergebnis auflösen und eine noch nicht
begonnene Wiederholung abbrechen. Bei Bildnachrichten wird kein Erfolg anhand
gleicher Texte geraten; ohne eindeutigen Bild-/Nachrichtenbezug bleibt der
Status unklar und die bestehende Erklärung sichtbar.

## Favoriten-Antworten und Angebote

Die bestehenden Regeln, Vorlagen, Verzögerungen, Zeitfenster und Preisgrenzen
bleiben maßgeblich. Cloud ergänzt den Ereignisleser und Ausführer, nutzt aber
dieselben Einstellungen und dauerhaften Versuchs-/Ergebnisdaten wie lokal.
Aktivierung erfordert die bestätigte Kontoidentität und eigene Versandfreigabe;
eine neue Profilzuordnung übernimmt keine alte Automatikfreigabe stillschweigend.

Bekannte Ereignisse, bereits bestehende Gespräche und nicht mehr passende
Konfigurationen werden nach den vorhandenen Regeln behandelt. Ein Angebot
folgt nur auf eine belegte gesendete Favoritennachricht und eine gültige
Angebotskonfiguration. Nachricht und Angebot haben getrennte Versuchszustände.
Regeländerungen stoppen wartende Aufträge; begonnene Ergebnisse werden weiter
korrekt zugeordnet. Auch Angebote werden nach unklarem Ausgang nicht blind
erneut erstellt.

## Fehler und Bedienung

Neue Anmeldung, SMS, CAPTCHA, gesperrte Sitzung, falsche Kontoidentität und
Drosselung stoppen abhängige Folgeaktionen. Die Oberfläche zeigt den konkreten
Handlungsbedarf beim betroffenen Konto. Erfolgreiche erneute Anmeldung entfernt
erledigte Anmeldewarnungen, bestätigt aber keine ausstehenden Nachrichten.

Die bestehenden Cards, Eingaben, Buttons und Glockenmeldungen werden erweitert.
Responsive Darstellung, Tastaturbedienung, Fokus, verständliche Statusmeldungen
und AXE/WCAG-AA-Prüfungen gelten auch für Cloud. Die Nachrichtenansicht bleibt
für leseberechtigte Nutzer verfügbar; Schreiben prüft zusätzlich Verwaltungs-
und Versandberechtigung. Es entsteht keine zweite Cloud-Gesprächsseite.

## Umsetzung und Abnahme

Der Umsetzungsplan gliedert den gemeinsamen Ausbau in abhängige Schritte:
Auftragsverträge und Sperren, Cloud-Versand, eingehende Ereignisse und Glocke,
gemeinsame UI, Favoriten-/Angebotsausführung und abschließende Abnahme.
Jeder Schritt verwendet die vorhandenen Muster und passende Regressionstests.
Schemaänderungen erhalten erzeugte und geprüfte Migrationen; API-Typen werden
anschließend aus der laufenden lokalen Datenbank neu erzeugt.

Verbindliche Prüffälle:

1. Erstimport ohne Historienmeldungen; neues eingehendes Ereignis einmal in der
   Glocke; erneuter Import ohne Duplikat; richtige Verknüpfung trotz Kontowechsel.
2. Mehrere neue Nachrichten bei bereits ungelesenem Gespräch; eigene Nachricht
   ohne Eingangsmeldung; keine automatischen Reads ungelesener Details.
3. Text und Bildauftrag, korrekter Status, Doppelklick, verlorene Antwort,
   Worker-Neustart vor und nach Versandbeginn sowie bewusste Wiederholung.
4. Fremder Arbeitsplatz, fehlendes Recht, falsche Identität, veraltete
   Freigabeversion, konkurrierender Worker und Wechsel der Betriebsart verweigert.
5. Pausierte Hintergrundautomatik bleibt pausiert; manuell angeforderte Aktionen
   sind getrennt; Login-/Challenge-/Drosselungsfehler erzeugen keine Folgeversuche.
6. Favoritenregeln und Angebote unverändert fachlich korrekt; keine automatische
   Aktivierung; Konfigurationswechsel und unklares Ergebnis ohne Doppelversand.
7. Lokale Extension und bestehende Nachrichtenverträge bleiben funktionsfähig;
   Frontend-Bau, gezielte Worker-/Datenbanktests und Postfach-/Glocken-AXE bestehen.

Die Echtkonto-Abnahme verwendet Maike Vintage, nach Möglichkeit mit einem
bewusst ausgewählten Testgespräch. Vor einem tatsächlichen Versand legt der
Nutzer Empfänger und Text beziehungsweise Bild fest. Für Favoriten-/Angebots-
aktionen gilt dieselbe gezielte Freigabe. Erst lesend prüfen, danach einen
freigegebenen Versuch durchführen, Ergebnis und Historie vergleichen und den
Verlauf nach Worker-Neustart erneut prüfen. Der Hauptaccount wird nicht als
Testkonto verwendet.

Als abgeschlossen gilt der Ausbau erst bei bestandenen lokalen Prüfungen,
grünem PR und belegter Echtkonto-Abnahme der beanspruchten Funktionen.
Nicht belegte Bildbestätigung bleibt ausdrücklich als Einschränkung sichtbar.

## Grenzen

Kein automatischer Einkauf weiterer IPs, kein Wechsel des Browseranbieters,
keine neuen Bibliotheken ohne belegten Bedarf und keine allgemeine Umgestaltung
anderer Vinted-Seiten. Der Ausbau umgeht keine SMS-/CAPTCHA-Prüfung. Bisher
nicht vorhandene Chataktionen werden nicht als lokale Funktionsgleichheit
ausgegeben oder nebenbei ergänzt.
