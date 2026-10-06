# Flipbase Listing-Assistent

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

## Kleinanzeigen

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

Ab Erweiterung 1.5.0 erscheint unten rechts auf normalen Vinted-Seiten das
Flipbase-Logo. Ein Klick liest Deine aktuelle Vinted-Identität und zeigt die
gespeicherte lokale Zuordnung. Die Seite bleibt normal bedienbar. Du kannst das
kleine Fenster mit Escape oder dem Schließen-Button schließen.

Mit „Vinted-Konto verknüpfen“ öffnest Du Flipbase im selben Browserprofil und
fügst dort ein lokales Konto hinzu. Die Anmeldung und die ausdrückliche
Kontofreigabe laufen weiterhin in Flipbase. Bei einem bereits gebundenen Profil
führt der Button zur bestehenden Verbindung. Ein anderes aktives Vinted-Konto
erhält einen Hinweis auf ein separates Browserprofil; es ersetzt die Zuordnung
nicht. Angezeigte Freigaben stammen aus dem lokalen Speicher, der aktuelle
Serverstatus wird beim Prüfen der Verbindung in Flipbase bestätigt.

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

Noch nicht enthalten: automatische Antworten, Angebote, Verkäufe, Relisting und Cloudbetrieb.
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
