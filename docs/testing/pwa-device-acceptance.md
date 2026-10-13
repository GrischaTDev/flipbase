# PWA-Geräteabnahme

Stand: 13.10.2026. Die Umsetzung bleibt bis zur Abnahme auf echten Geräten ein Pilot. `WEB_PUSH_ENABLED=false` bleibt der Auslieferungsstandard.

## Automatisch geprüft

Chromium prüft den echten Produktionsbau mit Service Worker, vollständigem Dateicache, Offline-Lazy-Routen, beschädigten Dateien und zwei echten Bauversionen. Offene Eingaben in einem zweiten Fenster verhindern die Aktivierung einer neuen Version. WebKit prüft die Oberfläche und echte IndexedDB, ohne einen Safari-Service-Worker-Nachweis zu behaupten.

Die Produktionstests prüfen lokale Speicherung, Neustart, konkurrierende Revisionen, Schreibfehler, unbekannte Datenformate, abgelaufenen Kontext, Kontotrennung und unveränderte Wiederholung einer Einkaufsübertragung. Backendantworten werden kontrolliert ersetzt; diese Tests weisen keine Zustellung eines Push-Anbieters nach.

## Noch auf echten Geräten prüfen

| Gerät                             | Abnahme                                                                                                           | Status |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Android-Smartphone mit Chrome     | Installation, eigenständiger Start, Tastatur, Safe Areas, Hintergrund-Push                                        | Offen  |
| Android-Tablet mit Chrome         | Hoch-/Querformat, Installation, Wiederaufnahme, Offline-Entwurf                                                   | Offen  |
| iPhone mit aktueller iOS-Version  | Zum Home-Bildschirm hinzufügen, eigenständiger Start, Permission per bewusster Aktion, Push bei geschlossener App | Offen  |
| iPad mit aktueller iPadOS-Version | Home-App, geteilte Ansicht, Tastatur, Querformat, Push bei geschlossener App                                      | Offen  |
| Windows mit Edge/Chrome           | Installation, zwei Fenster, Updateschutz, Gerätemeldungen                                                         | Offen  |

Für jeden Lauf Gerät, Betriebssystem, Browser-Version, veröffentlichte Commit-SHA, PWA-Baukennung und Ergebnis festhalten. Nicht verfügbare Funktionen müssen verständlich erklärt werden. Ein Browserfenster oder ein WebKit-Test ersetzt keine Home-App-Abnahme.

## Kontrollierter Push-Pilot

1. Version mit Push ausgeschaltet veröffentlichen; öffentliche Commit-SHA, Manifest, Worker und Dateiliste müssen zusammenpassen.
2. VAPID-Schlüsselpaar und Schlüsselkennung ausschließlich serverseitig einrichten. Widerrufs- und Beobachtergeheimnisse gehören in die geschützte Betriebsumgebung. `deploy/push.env.example` beschreibt die Variablen.
3. Eigenes Pilotgerät anmelden, Einwilligung bewusst auslösen, Kategorien wählen und eine echte Testmeldung versenden. Zustellung und Klickziel auch bei geschlossener App nachweisen.
4. Neue Nachricht, Bestellung und Kontostörung jeweils einmal auslösen. Erste eBay-Beobachtung darf alte Bestellungen nicht als neue Meldungen versenden. Die konfigurierte eBay-Umgebung muss mit der Zielseite übereinstimmen.
5. Abmelden, Gerätemeldungen deaktivieren, Workspace-Zugang entziehen und VAPID wechseln. Danach dürfen gesperrte Geräte oder Empfänger keine neuen Meldungen erhalten. Offline-Widerruf bei erneuter Verbindung nachweisen.
6. Erst nach erfolgreicher Geräteabnahme Push für weitere Nutzer aktivieren. Bei Zustellungs-, Rechte- oder Datenschutzfehlern den Versand sofort mit `WEB_PUSH_ENABLED=false` stoppen; Entwürfe und App-Start bleiben verfügbar.

## Offline-Abnahme

Online einen berechtigten Workspace vorbereiten. Dann ohne Internet starten, einen Einkaufsentwurf anlegen und die App vollständig schließen. Nach Neustart müssen Name, Verkäufernotiz, allgemeine Notiz, Datum und Positionen erhalten sein. Kein Verkauf, Bestand oder Marktplatzauftrag darf offline als erledigt erscheinen.

Online den Entwurf bewusst prüfen, Artikel und Verkäufer zuordnen und übernehmen. Eine verlorene Antwort muss denselben Auftrag wiederholen. Nach neueren Änderungen und Klärung des ursprünglichen Versuchs bleiben die Ergänzungen lokal sichtbar und dem vorhandenen Einkauf zugeordnet. Abmelden sperrt lokale Daten; Löschen oder Verwerfen erfolgt ausdrücklich. Lokaler Speicher ist gerätegebunden und kein Backup: Export vor Gerätewechsel oder Browserbereinigung nutzen.
