# PWA-Geräteabnahme

Stand: 13.10.2026. Die Umsetzung bleibt bis zur Abnahme auf echten Geräten ein Pilot. `WEB_PUSH_ENABLED=false` bleibt der Auslieferungsstandard.

## Automatisch geprüft

Chromium prüft den echten Produktionsbau mit Service Worker, vollständigem Dateicache, Offline-Lazy-Routen, beschädigten Dateien und zwei echten Bauversionen. Offene Eingaben in einem zweiten Fenster verhindern die Aktivierung einer neuen Version. WebKit prüft die Oberfläche und echte IndexedDB, ohne einen Safari-Service-Worker-Nachweis zu behaupten.

Die Produktionstests prüfen lokale Speicherung, Neustart, konkurrierende Revisionen, Schreibfehler, unbekannte Datenformate, abgelaufenen Kontext, Kontotrennung und unveränderte Wiederholung einer Einkaufsübertragung. Backendantworten werden kontrolliert ersetzt; diese Tests weisen keine Zustellung eines Push-Anbieters nach.

## Noch auf echten Geräten prüfen

| Gerät                             | Abnahme                                                                                                           | Status |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Android-Smartphone mit Chrome     | Installation, eigenständiger Start, Tastatur, Safe Areas, Hintergrund-Push                                        | Offen  |
| Android-Tablet mit Chrome         | Hoch-/Querformat, Installation, Wiederaufnahme, gepufferte Einkaufsmaske                                          | Offen  |
| iPhone mit aktueller iOS-Version  | Zum Home-Bildschirm hinzufügen, eigenständiger Start, Permission per bewusster Aktion, Push bei geschlossener App | Offen  |
| iPad mit aktueller iPadOS-Version | Home-App, geteilte Ansicht, Tastatur, Querformat, Push bei geschlossener App                                      | Offen  |
| Windows mit Edge/Chrome           | Kein Installationsangebot in Flipbase, zwei Fenster, Updateschutz, Gerätemeldungen                                | Offen  |

Für jeden Lauf Gerät, Betriebssystem, Browser-Version, veröffentlichte Commit-SHA, PWA-Baukennung und Ergebnis festhalten. Nicht verfügbare Funktionen müssen verständlich erklärt werden. Ein Browserfenster oder ein WebKit-Test ersetzt keine Home-App-Abnahme.

### Zeitnahe Systemmeldungen bei geschlossener App

Push fordert für die sichtbaren Meldungen hohe Zustellpriorität (`Urgency: high`) an.
Normale Priorität darf der Anbieter auf ruhenden Geräten verzögern; die Vorgabe
folgt dem [Web-Push-Protokoll](https://web.dev/articles/push-notifications-web-push-protocol).
Die Annahme durch den Anbieter bestätigt noch keine Anzeige auf dem Gerät.

Nutzerentscheidung vom 14.10.2026: Favoriten-Push nennt wie die Glocke den
Kontonamen und darunter den Artikeltitel. Bei mehreren Inseraten werden Anzahl
und begrenzte Artikeltitel angezeigt. Die Details stammen aus der belegten
Glockenmeldung; direkt vor Versand wird die Kontoberechtigung erneut geprüft.
Fehlende oder gelöschte Details fallen auf die allgemeine Meldung zurück.
Nachrichten und Bestellungen bleiben ohne Kontaktdaten.

Online-Tabs prüfen im sichtbaren Zustand regelmäßig im Minutenabstand auf neue
Versionen. Start, Rückkehr in den Vordergrund, wiederhergestellte Seiten und eine
erneute Netzwerkverbindung lösen zusätzlich eine Prüfung aus, auch innerhalb
dieser Minute. Gleichzeitige Ereignisse teilen sich eine laufende Prüfung.
Nach mindestens einer Minute im Hintergrund erscheint ohne offene Eingaben kurz
die Logo-Prüfungsansicht. Nach spätestens acht Sekunden wird sie bei Problemen
durch einen Hinweis mit „Erneut prüfen“ ersetzt; eine später fertig installierte
Version wird weiterhin erkannt. Eine fehlgeschlagene Startregistrierung wird bei
Rückkehr, erneuter Verbindung oder ausdrücklicher Wiederholung erneut versucht.
Die abgeschlossene Netzwerkprüfung wartet nicht auf das Herunterladen aller
App-Dateien. Auch bei einem Download über acht Sekunden bleibt die vorhandene
App bedienbar, ohne einen fehlgeschlagenen Prüfvorgang vorzutäuschen. Erst der
vollständig installierte neue Stand löst die verpflichtende Updateansicht aus.

Eine bestätigte neue Version zeigt eine bildschirmfüllende Logo-Ansicht mit
„Jetzt aktualisieren“, ohne „Später“ oder Schließen per Escape. Auch nach
Aktivierung in einem anderen Tab bleibt auf älteren Ansichten diese Ansicht
sichtbar. Offene Eingaben, laufende Aktionen und andere Eingabedialoge haben
Vorrang: Die Maske bleibt bedienbar und erhält einen dauerhaften Speicherhinweis.
Vorhandene Routensperren, Angular-Formulare und eigenständige Angular-Felder mit
offenen Änderungen oder ausstehender Prüfung sowie als beschäftigt markierte
Aktionen werden berücksichtigt. Ältere Masken setzen ihren Änderungsstatus nach
dem Speichern teilweise nicht zurück; dort erst speichern und anschließend die
Eingabeansicht verlassen. Kein Update speichert oder verwirft selbst Eingaben.

Für iPad-Push Flipbase vom Home-Bildschirm starten, nicht als
normalen Chrome-Tab. Browser und Home-App separat auf ihre Version prüfen.

### Update-Rückkehr auf echten Apple-Geräten

Nutzerentscheidung vom 19.10.2026: verpflichtende volle Aktualisierungsansicht,
erneute Prüfung beim Zurückkehren und Schutz offener Eingaben. Nachgewiesene
Quellenlücken waren die Minutenbegrenzung auch für Rückkehrereignisse, fehlendes
`pageshow`, ein möglicher Abbruch vor der Netzwerkprüfung bei nicht mehr
erreichbarem Worker und fehlende Wiederholung nach Registrierungsfehlern. Das
beweist keine konkrete Ursache auf dem gemeldeten iPad.

Home-App mit älterer Baukennung vor Veröffentlichung öffnen und anschließend
in den Hintergrund legen. Nach Veröffentlichung einmal nach kurzer und einmal
nach mindestens einer Minute zurückkehren. Neue Version muss angeboten werden,
ohne erst einen weiteren Minutentakt abzuwarten. Dasselbe mit offenem Einkauf,
bearbeitetem Kontoprofil, einem einzelnen Einstellungsfeld und laufender
Speicherung wiederholen: Eingaben bleiben erreichbar und unverändert; nach
Abschluss beziehungsweise Schließen erscheint die volle Aktualisierungsansicht.
Bei Offline-Rückkehr darf keine dauerhafte Logo-Sperre entstehen. Geräteversion,
Baukennungen und tatsächlich aufgetretene Netzwerk-/Workerfehler protokollieren.

Vor dem Test das Gerät und die gewünschten Kategorien aktivieren, dann Flipbase
schließen und das Gerät sperren. Erst danach eine neue echte Marktplatznachricht
beziehungsweise Favoritenmeldung erzeugen. Systemmeldung und Klickziel auf Android
und in der iPad-Home-App prüfen; anschließend mit länger ruhendem Gerät wiederholen.
Eine Testmeldung bei geöffneter App oder ältere Einträge unter der Glocke ersetzen
diese Prüfung nicht. Meldungen vor der Geräteaktivierung werden nicht nachträglich
verschickt.

Bei einem blockierten iPad-Update zuerst Eingaben speichern und andere Flipbase-Tabs
oder App-Fenster schließen. Die Aktualisierung erneut auslösen. Danach muss die
aktuelle Baukennung erscheinen und der Update-Hinweis verschwinden, auch nach
erneutem Start. Browserdaten wegen lokaler Einkaufsentwürfe nicht pauschal löschen.

## Kontrollierter Push-Pilot

1. Version mit Push ausgeschaltet veröffentlichen; öffentliche Commit-SHA, Manifest, Worker und Dateiliste müssen zusammenpassen.
2. VAPID-Schlüsselpaar und Schlüsselkennung ausschließlich serverseitig einrichten. Widerrufs- und Beobachtergeheimnisse gehören in die geschützte Betriebsumgebung. `deploy/push.env.example` beschreibt die Variablen.
3. Eigenes Pilotgerät anmelden, Einwilligung bewusst auslösen, Kategorien wählen und eine echte Testmeldung versenden. Zustellung und Klickziel auch bei geschlossener App nachweisen.
4. Neue Nachricht, Bestellung und Kontostörung jeweils einmal auslösen. Erste eBay-Beobachtung darf alte Bestellungen nicht als neue Meldungen versenden. Die konfigurierte eBay-Umgebung muss mit der Zielseite übereinstimmen.
5. Abmelden, Gerätemeldungen deaktivieren, Workspace-Zugang entziehen und VAPID wechseln. Danach dürfen gesperrte Geräte oder Empfänger keine neuen Meldungen erhalten. Offline-Widerruf bei erneuter Verbindung nachweisen.
6. Erst nach erfolgreicher Geräteabnahme Push für weitere Nutzer aktivieren. Bei Zustellungs-, Rechte- oder Datenschutzfehlern den Versand sofort mit `WEB_PUSH_ENABLED=false` stoppen; Entwürfe und App-Start bleiben verfügbar.

## Zwischenspeicherung ohne zusätzlichen Ablauf

Nutzerentscheidung vom 13.10.2026: Keine gesonderten lokalen Entwürfe, Menüpunkte, Listen oder Übernahmeaktionen. Einkaufsmaske und normale Speicherung bleiben bestehen. Der geräteinterne Puffer schützt Eingaben und setzt nur bereits ausdrücklich beauftragte Speicherungen fort; ungeprüfte oder nicht abgesendete Änderungen werden nicht automatisch gebucht.

Im berechtigten Workspace einen normalen Einkauf mit Verkäufer, Datum, Notizen, Positionen, Zusatzkosten und Beleg erfassen. Verbindung während „Entwurf speichern“ unterbrechen. Die App darf keine Serverbestätigung vortäuschen. Bei erreichbarer Verbindung wird derselbe Speicherauftrag nach aktueller Anmeldung und Rechteprüfung fortgesetzt, einschließlich Belegen. Eine verlorene Antwort darf keinen zweiten Einkauf erzeugen. Neuere Eingaben bleiben erhalten und werden nicht durch die ältere Serverantwort überschrieben.

Ohne Speichern eingegebene Angaben nach Neuladen mit erneuter Onlineprüfung wiederherstellen, ohne sie automatisch abzuschicken. Explizit verworfene, noch nicht beauftragte Eingaben dürfen nicht wiederkehren. Kontowechsel, Abmelden und Rechteentzug verhindern fremde Anzeige oder Versand. Fachliche Fehler lösen den normalen Fehlerhinweis aus und werden nicht endlos automatisch wiederholt. Verkauf, Bestandsänderung und Marktplatzaktionen benötigen weiterhin eine Verbindung. Geräteinterner Speicher ist kein Backup und überlebt keine Browserbereinigung.
