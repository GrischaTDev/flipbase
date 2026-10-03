# Flipbase Listing-Assistent

Die Erweiterung unterstützt Kleinanzeigen-Inserate und einen lokalen,
manuell gestarteten Vinted-Lesepiloten. Der Vinted-Pilot überträgt nur Profil
und eigene Anzeigen an Flipbase; er verschickt keine Nachrichten oder Angebote
und veröffentlicht, bearbeitet oder löscht keine Vinted-Anzeigen.

## Interne Pilotinstallation (Chrome)

1. Öffne `chrome://extensions/`.
2. Aktiviere den Entwicklermodus.
3. Klicke auf „Entpackte Erweiterung laden“ und wähle `tools/flipbase-extension`
   im geprüften Arbeitsverzeichnis des Pilotzweigs.
4. Nach Änderungen lade die Erweiterung über ihre Aktualisierungsschaltfläche
   neu und lade auch die betroffenen Flipbase-/Vinted-Tabs neu.

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

1. Installiere die Erweiterung im Browserprofil Deines Vinted-Kontos. Verwende
   für weitere Vinted-Konten jeweils ein separates Browserprofil.
2. Wähle in Flipbase beim Vinted-Konto die lokale Verbindung. Der reservierte
   Vinted-Tab wird geöffnet. Melde Dich dort selbst an; CAPTCHA und SMS-Prüfungen
   bearbeitest Du ebenfalls selbst. Starte danach die Verbindung erneut.
3. Flipbase zeigt die erkannte Vinted-Identität. Bestätige die Zuordnung zu
   Deinem Arbeitsplatz und zur ausgewählten Kontoverbindung ausdrücklich.
4. Starte den Profil-/Anzeigenabgleich in Flipbase manuell. Während des Lesens
   schützt ein Hinweis den Arbeitstab vor konkurrierenden Eingaben. Über
   „Vinted in einem neuen Tab öffnen“ kannst Du Vinted normal bedienen.
5. Prüfe Importzeitpunkt und Anzeigenzahl. Ein Teilstand bei mehr als 500 Anzeigen
   wird als Teilstand ausgewiesen. Unbekannte Datenformate oder ein Kontowechsel
   stoppen den Import. Beim Trennen wird das lokale Installationsgeheimnis gelöscht;
   Flipbase widerruft zusätzlich die serverseitige Freigabe.

Noch nicht enthalten: automatische Intervalle, Nachrichten, Relisting und Cloudbetrieb.
Rechner und Browser müssen für einen lokalen Abgleich laufen. Browserprofile trennen
Cookies und Anmeldungen, bieten aber keine Garantie gegen Prüfungen oder Sperren.

Vinted-Passwort und Sitzungscookies verbleiben im Browser. Ein widerrufbares
Installationsgeheimnis wird nur im vertrauenswürdigen Erweiterungshintergrund
gespeichert; die Weboberfläche erhält dessen Hash und die bestätigte Kontoidentität.
Nur Profil- und Anzeigendaten werden an den erlaubten Flipbase-Server übertragen.
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
