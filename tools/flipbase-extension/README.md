# Flipbase Listing-Assistent

## Version 1.10.2: Chataktivität bei nicht mehr verfügbaren Artikeln

Vinteds reine Systemmeldung „Artikel nicht mehr verfügbar“ bleibt im Gespräch sichtbar,
ändert aber weder die Chatvorschau noch deren Aktivitätszeit und Sortierung. Cloud-
und Erweiterungsimport behandeln den Fall gleich. Bereits betroffene Vorschauen
werden beim nächsten begrenzten Detailabgleich aus dem vorhandenen Verlauf korrigiert;
pro Abruf bleiben maximal drei Hintergrund-Detailabrufe erlaubt. Echte Nachrichten,
Angebote und andere Statusmeldungen werden weiterhin berücksichtigt.

Eine frühere Chatposition ist nur rekonstruierbar, wenn eine bekannte Aktivitätszeit
oder andere datierte Nachrichten vorhanden sind. Ein Erstimport ohne solche Belege
und ausschließlich mit Verfügbarkeitsstatus kann keine historische Position liefern;
es wird dafür kein früherer Zeitpunkt erfunden.

Nach der Bereitstellung die Erweiterung und den Flipbase-Tab neu laden. Die
Erweiterung benötigt Version 1.10.2; der Cloudweg benötigt den passenden Workerstand.

Die Erweiterung unterstützt Kleinanzeigen-Inserate und einen lokalen Vinted-Postfachpiloten.
Der Vinted-Pilot überträgt Profil und eigene Anzeigen sowie nach separater Freigabe
Gespräche an Flipbase. Eine zusätzliche Versandfreigabe erlaubt selbst verfasste
Textnachrichten und einen JPEG-/PNG-Anhang bis 256 KiB. Er veröffentlicht,
bearbeitet oder löscht keine Vinted-Anzeigen.

## Interne Pilotinstallation (Chrome)

1. Öffne `chrome://extensions/`.
2. Aktiviere den Entwicklermodus.
3. Klicke auf „Entpackte Erweiterung laden“ und wähle `tools/flipbase-extension`
   im geprüften Arbeitsverzeichnis des Pilotzweigs.
4. Nach Änderungen lade die Erweiterung über ihre Aktualisierungsschaltfläche
   und Flipbase neu. Beim nächsten Abgleich stellt die Erweiterung einen
   nicht mehr erreichbaren eigenen Vinted-Arbeitstab automatisch wieder her.

Chrome lädt dabei ausschließlich die Dateien aus dem bereits ausgewählten
Ordner erneut. Ein neues ZIP oder ein weiterer entpackter Ordner aktualisiert
die bestehende Installation nicht; verwende beim Pilotupdate weiterhin den
bisherigen Installationsordner oder wähle den neuen Ordner ausdrücklich.

Die entpackte Installation dient dem internen Test. Ein Chrome-Web-Store-Eintrag
ist noch nicht veröffentlicht; die spätere Nutzerinstallation soll über den Store
laufen.

## Vinted nach Kleinanzeigen (ab Erweiterung 1.10.0)

1. Verbinde unter Marktplätze → Kleinanzeigen Deinen privaten Kleinanzeigen-Account
   im selben Chrome-Profil. Erteile die Lesefreigabe und die gesonderte Freigabe
   zum Veröffentlichen. Synchronisiere Deine Anzeigen.
2. Klicke bei einem eigenen Vinted-Inserat auf „Inserieren“. Wähle die Plattform
   und anschließend das Konto. Gespeicherte Texte, Bilder, Preis und passende
   Eigenschaften werden automatisch übernommen. Dafür wird Vinted nicht erneut geöffnet.
3. Prüfe die Angaben im Kleinanzeigen-Formular und ergänze fehlende Werte.
   Bereits gespeicherte Kategorien und Felder können ohne Anbieterzugriff angezeigt
   werden. Zu lange Texte und Centbeträge bleiben zur Korrektur sichtbar.
4. Klicke auf „Inserieren“. Erst jetzt werden die aktuellen Kleinanzeigen-Felder
   über das gebundene Browserprofil geprüft. Bei neuen oder geänderten Feldern hält
   der Ablauf zur Prüfung an. Anschließend erneut „Inserieren“ wählen.
   Die Zielfassung und Bilder werden intern gespeichert; „Für später speichern“ ist optional.
5. Vor dem verbindlichen Klick prüft die Erweiterung den offiziellen 30-Tage-Zähler,
   die Kontofreigabe und das aktuelle Formular erneut. Beim letzten kostenlosen Platz
   darf nur ein Auftrag fortfahren. Bei Gebühren, ausgeschöpftem Kontingent oder
   unklaren Kosten stoppt sie vor „Anzeige aufgeben“. Kostenpflichtige Extras werden
   nicht gebucht.
6. „Veröffentlicht“ erscheint erst mit geprüfter Ziel-ID und aktivem Zielinserat.
   „In Verarbeitung“ bleibt ein offener Auftrag. Bei unbekanntem Ergebnis kannst
   Du nur den Status prüfen; es erfolgt kein zweiter Veröffentlichungsversuch.

Ein Browserneustart oder eine verlorene Antwort löst keinen blinden erneuten
Submit aus. Der Vinted-Artikel bleibt bestehen; die Kleinanzeigen-Fassung liegt
im bisherigen Listing Studio und kann dort weiterbearbeitet werden, solange
kein unklarer oder laufender Veröffentlichungsversuch besteht.

**Prüfstand:** Der komplette Erweiterungsablauf einschließlich Bildübertragung,
Gebührenstopp und Neustart ist gegen lokale Anbieter-Fixtures unter Windows
und Linux geprüft. Eine echte Anzeige wurde mit diesem neuen Weg noch nicht
veröffentlicht. Insbesondere die echte Bildvorschau und der Erfolgsbeleg des
Anbieters sind noch nicht live abgenommen. Unbekannte Ansichten stoppen den Ablauf.

## Bisheriger Kleinanzeigen-Formularassistent

1. Öffne in Flipbase das Listing Studio (`/listings`).
2. Wähle einen Artikel und prüfe Titel, Beschreibung, Preis, Preistyp und PLZ.
3. Klicke auf „1-Klick auf Kleinanzeigen inserieren“.
4. Die Erweiterung öffnet das Kleinanzeigen-Formular
   (`p-anzeige-aufgeben-schritt2.html`) und füllt die unterstützten Felder.
   Produktbilder aus dem Flipbase-Speicher werden übernommen.
5. Wähle die Kategorie. Der Assistent zeigt den Erfolg der einzelnen Schritte
   und welche Angaben Du noch selbst ergänzen musst.
6. Prüfe alle Angaben und klicke selbst auf „Anzeige aufgeben“.

Wenn Du noch nicht angemeldet bist, bleiben die vorbereiteten Angaben 15 Minuten
verfügbar. Melde Dich an und lade die Formularseite neu. Ändert Kleinanzeigen sein
Formular, können einzelne Felder manuelle Eingaben verlangen.

## Lokaler Vinted-Pilot

### Konto direkt auf Vinted prüfen

Ab Erweiterung 1.6.0 öffnet die weiße Logo-Blase ein zentriertes Modal.
Gespeicherte Kontozuordnung und aktuell geprüfte Browserbereitschaft werden
getrennt angezeigt. „Einstellungen öffnen“ führt zu den Einstellungen dieses
Kontos; „Lokale Freigabe trennen“ führt zu einer ausdrücklichen Bestätigung in
Flipbase. Dein Vinted-Login und bereits importierte Daten bleiben erhalten.

Beim Browserstart und nach dem Schließen eines eigenen Arbeitstabs prüft die
Erweiterung eine bestehende Freigabe und stellt den Tab bei erlaubtem Zugriff
im Hintergrund wieder her. Ein gewöhnlicher behobener Loginfehler kann nach
bestätigter Identität fortgesetzt werden. Abgelaufene Freigaben, manuelle Pausen
und Vinted-Prüfungen erfordern die entsprechende Nutzeraktion. Eine Statusprüfung
führt selbst keinen Versand aus und verlängert keine Freigabe.

Auf der Kontenseite siehst Du „Lokal verknüpft“ und zusätzlich den aktuellen
Profilstatus. Dort kannst Du die Verbindung prüfen und Daten synchronisieren;
der Einrichtungsablauf ist für Hinzufügen und Freigabeerneuerung vorgesehen.

Auf normalen Vinted-Seiten erscheint unten rechts das Flipbase-Logo. Ein Klick
liest Deine aktuelle Vinted-Identität und prüft die lokale Betriebsbereitschaft.
Das Modal kannst Du mit Escape oder dem Schließen-Button schließen; danach ist
die Seite wieder normal bedienbar.

Mit „Vinted-Konto verknüpfen“ öffnest Du Flipbase im selben Browserprofil und
fügst dort ein lokales Konto hinzu. Die Anmeldung und die ausdrückliche
Kontofreigabe laufen weiterhin in Flipbase. Bei einem bereits gebundenen Profil
führt der Button zur bestehenden Verbindung. Ein anderes aktives Vinted-Konto
erhält einen Hinweis auf ein separates Browserprofil; es ersetzt die Zuordnung
nicht. Die gespeicherte Zuordnung stammt aus dem lokalen Speicher; die
Bereitschaft wird zusätzlich über die bestehende Serverfreigabe und die
aktuelle Vinted-Sitzung geprüft. Bei uneindeutigen Serverfehlern wird kein
Widerruf oder Erfolg behauptet.

Im reservierten Arbeitstab erscheint dieses Kontofenster nicht. Dort bleibt
die vorhandene Sperrfläche für automatische Vorgänge beziehungsweise die
manuelle Vinted-Anmeldung erhalten.

### Favoritennachrichten

Erfordert Erweiterung 1.4.0 und die zugehörige veröffentlichte Anwendung/Serverfunktion.

Unter **Vinted → Favoritennachrichten** hinterlegst Du mehrere Texte und
optionale Regeln für Uhrzeit, Wochentag und Artikelpreis. Die erste passende
Regel gilt; sonst wird eine Standardvariante ausgewählt. `{article}` setzt den
Artikeltitel ein. Die Uhrzeit gilt beim Versand in Europe/Berlin, Preisregeln
nutzen den letzten importierten Preis. Die Wartezeit beträgt 0 bis 10.080 Minuten.

Aktiviere die Automatik ausdrücklich und speichere die Einstellungen. Eine
gültige lokale Nachrichtenfreigabe ist erforderlich. Favorisierungen vor der
Aktivierung bleiben ausgeschlossen. Die Erweiterung prüft ungefähr alle fünf
Minuten und übernimmt einen fälligen Versandauftrag ungefähr alle 90 Sekunden.
Browser und Profil müssen laufen; verpasste Durchläufe werden nicht in einer
Schleife nachgeholt. Der sichtbare Verlauf zeigt die letzten 30 Ereignisse.

Vor dem Senden werden Konto, Artikelzustand und vorhandene Gespräche geprüft.
Für denselben Interessenten und Artikel entsteht höchstens ein automatischer
Versandversuch. Ein unklarer Versand wird nicht automatisch wiederholt.
Das Ausschalten oder Ändern der Regeln verwirft noch wartende Nachrichten.
Angebote und Mehrartikelvorlagen gehören zu einer späteren Erweiterung.

### Verbindung und Postfach

Fehlgeschlagene Nachrichten lassen sich am kleinen Wiederholen-Button direkt
an der Chatkachel erneut einreihen. Text und Bildanhang bleiben erhalten.
Bei unklarem Versand aktualisiert Flipbase zuerst den Verlauf. Eine bereits
vorhandene eigene Textnachricht wird nicht erneut eingereiht; andernfalls
bestätigst Du nach Prüfung auf Vinted, dass die Nachricht nicht gesendet wurde.
Prüfe dabei auch einen Bildanhang. Die Aktion bestätigt die Einreihung, erst
das Ergebnis der Erweiterung bestätigt den tatsächlichen Versand.

1. Installiere die Erweiterung im Browserprofil Deines Vinted-Kontos. Verwende
   für weitere Vinted-Konten jeweils ein separates Browserprofil.
2. Wähle in Flipbase beim Vinted-Konto die lokale Verbindung. Der reservierte
   Vinted-Tab wird im Hintergrund geöffnet und oben angeheftet. Das gelbe
   Flipbase-Symbol und der Titel „Flipbase · Vinted-Arbeitstab“ kennzeichnen ihn.
   Öffne ihn selbst, falls eine Anmeldung oder Prüfung nötig ist. CAPTCHA und SMS-Prüfungen
   bearbeitest Du ebenfalls selbst. Starte danach die Verbindung erneut.
3. Flipbase zeigt die erkannte Vinted-Identität. Bestätige die Zuordnung zu
   Deinem Arbeitsplatz und zur ausgewählten Kontoverbindung ausdrücklich.
4. Starte den Profil-/Anzeigenabgleich mit „Jetzt synchronisieren“ oder direkt
   über „Kontodaten aktualisieren“ in der Übersicht. Die Erweiterung öffnet oder
   verwendet ihren Arbeitstab selbst. Ein zentrierter Hinweis
   mit heller, durchscheinender Sperrfläche hält den Arbeitstab dauerhaft reserviert.
   Sichtbare Anmeldung, SMS oder Mensch-Prüfung geben die Seite manuell frei;
   anschließend startest Du den Abgleich in Flipbase erneut. Über
   „Vinted in einem neuen Tab öffnen“ kannst Du Vinted normal bedienen.
5. Prüfe Importzeitpunkt und Anzeigenzahl. Ein Teilstand bei mehr als 500 Anzeigen
   wird als Teilstand ausgewiesen. Unbekannte Datenformate oder ein Kontowechsel
   stoppen den Import. Beim Trennen wird das lokale Installationsgeheimnis gelöscht;
   Flipbase widerruft zusätzlich die serverseitige Freigabe.

6. Öffne in Flipbase das Postfach und bestätige den Nachrichtenzugriff. Neue
   Gespräche werden ungefähr alle fünf Minuten abgeglichen; ältere Seiten folgen
   während des ersten Imports ungefähr minütlich. Ein Lauf liest bis zu 20
   Gespräche und drei geänderte, bereits gelesene Verläufe. Ungelesene Verläufe
   werden erst beim ausdrücklichen Öffnen des Gesprächs gelesen. Dabei wird keine
   gesonderte Markierung als gelesen gesendet. Nachrichtenhistorien bleiben Teilstände.
7. Erteile für eigene Antworten die gesonderte Versandfreigabe. Die aktuelle
   Vinted-Identität wird vor der Auftragsübernahme geprüft. Einen geschlossenen
   Arbeitstab öffnet die Erweiterung dafür im Hintergrund neu und verwendet ihn weiter.
   Der Schutzwert für den Versand wird aus der aktuellen Vinted-Seite gelesen.
   Fehler vor dem Nachrichtenversand gelten als nicht gesendet; ein fehlgeschlagener
   Nachweis nach angenommenem Versand bleibt ausdrücklich unklar. Ein Auftrag wird
   serverseitig übernommen, vor dem Versand begonnen und danach mit seinem
   Ergebnis gemeldet. Bei unklarem Ausgang wird nicht automatisch erneut gesendet.
   Ein bestätigter neuer Text wird anhand des Gesprächsverlaufs erkannt. Für Bilder
   ist die zuverlässige Erfolgsbestätigung noch nicht belegt: Der einmalige Versuch
   wird gegebenenfalls als unbestätigt angezeigt und benötigt einen echten Pilottest.

Chrome-Alarme prüfen Versandaufträge ungefähr alle 90 Sekunden. Nach einem Neustart
werden ausstehende Ergebnisse erneut gemeldet, ohne die Nachricht erneut zu senden.
Anmeldung, SMS, Mensch-Prüfung, Kontowechsel und Sperren pausieren die Automatik;
nach manueller Klärung startest Du den Abgleich ausdrücklich erneut. Bei einer
Abrufbegrenzung wird die angekündigte Wartezeit auch bei manuellem Refresh eingehalten.

Ab Erweiterung 1.7.0 können Favoritennachrichten auf ausdrücklichen Wunsch ein
echtes Vinted-Angebot mit festem Euro- oder prozentualem Nachlass ergänzen. Die
Option bleibt standardmäßig aus. Erst nach bestätigtem Textversand wird ein
separater Angebotsauftrag übernommen. Aktiver eigener Artikel, Kontobindung,
EUR-Preis und Transaktionsbezug werden erneut geprüft. Unsere konservative
Preisgrenze erlaubt höchstens 50 Prozent Nachlass; ein unzulässiger Nachlass
wird ausgelassen, niemals still angepasst. Nachricht und Angebot erscheinen
mit getrennten Ergebnissen. Eine unbestätigte Angebotsantwort wird nicht
automatisch wiederholt. Das tatsächliche Antwortformat und der Erfolg auf
Vinted benötigen noch einen ausdrücklich ausgewählten Live-Pilottest.

Noch nicht enthalten: automatische Antworten, Verkäufe, Relisting und Cloudbetrieb.
Rechner und Browser müssen für einen lokalen Abgleich laufen. Browserprofile trennen
Cookies und Anmeldungen, bieten aber keine Garantie gegen Prüfungen oder Sperren.

Vinted-Passwort und Sitzungscookies verbleiben im Browser. Ein widerrufbares
Installationsgeheimnis wird nur im vertrauenswürdigen Erweiterungshintergrund
gespeichert; die Weboberfläche erhält dessen Hash und die bestätigte Kontoidentität.
Profil- und Anzeigendaten sowie ausdrücklich freigegebene Postfachdaten werden an den erlaubten Flipbase-Server übertragen.
Die Erweiterung kann keine beliebige Serveradresse mit diesem Geheimnis aufrufen.

Beim erneuten Prüfen einer bereits verbundenen Installation wird ihre Serverfreigabe
kontrolliert. Nach einer eindeutigen Ablehnung wegen gelöschter, widerrufener oder
abgelaufener Freigabe wird die alte lokale Zuordnung entfernt und neu vorbereitet.
Ein Verbindungsfehler oder eine unklare Serverantwort entfernt sie nicht. Eine
vorhandene Serverfreigabe eines anderen Profils muss weiterhin ausdrücklich
widerrufen werden; sie wird nicht überschrieben.

## Prüfungen

`node --test scripts/local-extension-runtime.test.mjs` prüft Verträge, Tokenisolation,
Kontowechsel, Widerruf, Wiederaufnahme, Pagination und Bridge-/DOM-Verhalten.
Diese Tests ersetzen keinen echten Chrome-/Vinted-Kontotest und keine Storeprüfung.

## Auslieferung vor dem Kontopiloten

Die App-Pipeline spielt Migrationen und die Anwendung aus. Wie beim bestehenden Vinted-Piloten veröffentlicht sie diese Erweiterungs-Endpunkte nicht automatisch. Vor einem echten Test müssen über das bestehende Serververfahren gemeinsam übertragen werden:

- supabase/functions/kleinanzeigen-account/ und supabase/functions/kleinanzeigen-local-extension/ jeweils ohne Testdateien;
- der geänderte Endpoint supabase/functions/marketplace-local-extension/ sowie seine benötigten reinen Verträge unter _shared/;
- die zu diesem Release gehörende Erweiterung 1.10.1 im tatsächlich geladenen Installationsordner.

Alle drei Routen prüfen ihre Anmeldung im Handler selbst. Die Nutzerroute validiert ein echtes Nutzer-JWT; die Installationsroute akzeptiert nur das begrenzte, gehashte Installationsgeheimnis. Die vorgelagerte JWT-Prüfung folgt den Einträgen in supabase/config.toml. Ein fehlendes oder falsches Token muss beim echten Routencheck vor dem Pilotversuch abgewiesen werden. Ohne diese Auslieferung ist die neue Oberfläche kein funktionsfähiger Produktionsnachweis.
