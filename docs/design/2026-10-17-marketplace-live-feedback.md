# Marktplatzübersicht: Analyse der Live-Rückmeldung

17. Oktober 2026, Juna. Quellstand e3ef7363. Keine Anwendungs- oder Produktionsänderung; kein echter Inserat-Submit zur Reproduktion.

## Bestätigte Befunde und offene Ursachen

- Der Updatehinweis ist genau einmal in app.html eingebunden. Das Workerprotokoll liefert Baukennungen, keine lesbare Zielversion. Der Aktivierungsabschluss gibt Anzeigezustände vor dem Neuladen frei und prüft erneut; das ist ein möglicher Ansatz für das Wiedererscheinen. Eine doppelte Instanz oder zweite echte Aktualisierung ist nicht belegt und muss live reproduziert werden.
- Hell/Dunkel liegt im Profilmenü. „Alle Marktplätze“ wird zusätzlich zu „Zurück zu Flipbase“ eingeblendet.
- Das Kontozahnrad öffnet nur für Kleinanzeigen ein Modal; Vinted und eBay navigieren. Leere Plattformbereiche verlinken ebenfalls auf andere Seiten. Warum „Inserate anzeigen“ beim Nutzer nicht funktioniert, ist durch Quelllesen allein nicht geklärt.
- Interne Vinted-Übernahme liest gespeicherte Angaben ohne neuen Anbieterabruf. Der Kategoriecache enthält gespeicherte Endkategorien, keinen vollständigen Baum. Ohne Formularschema lädt der erste Klick „Inserieren“ aktuelle Kategorien und kehrt zurück. Nach Kategorie-/Feldprüfung ist eine weitere Bestätigung erforderlich.
- Formularlese-Tabs öffnen ausdrücklich mit active=false und werden danach geschlossen. Deshalb erfolgt kein sichtbarer Tabwechsel. Beim echten Auftrag wird ein eigener Arbeitstab verwendet. Die konkrete Ursache des gemeldeten Dauerladens ist noch nicht reproduziert.
- Kategorieerkennung hängt an konkreten Anbieter-DOM-Elementen, Kategoriepfaden und deren Unterkategorien. Tatsächlicher Aufbau, Erweiterungsversion und Antwort-/Timeoutverhalten sind gezielt live zu prüfen.

## Paket 1: Blockierte Kleinanzeigen-Veröffentlichung

Höchste Priorität. Kategoriehierarchie und Pflichtfelder am tatsächlichen Anbieteraufbau prüfen; Cachelesen und aktuellen Abruf verständlich trennen. Kategorie vor der endgültigen Veröffentlichung festlegen. Endloses Laden durch saubere Abschlüsse, Abbrechen und konkrete Fehlermeldungen verhindern.

Falls der vollständige Kategoriebaum nicht zuverlässig automatisch lesbar ist, ausdrücklich einen sichtbaren Kleinanzeigen-Tab zum manuellen Wählen anbieten und danach bestätigte Kategorie sowie Pflichtfelder zurücklesen. Das ist ein Vorschlag, noch keine vorhandene Funktion. Nutzer wählen Kategorienamen; eine frei eingetippte ID ersetzt keine Prüfung.

Abnahme: Unterkategorien und erforderliche Felder erreichbar; genau ein Submit; kein Submit bei Gebühren, unklaren Kosten, ausgeschöpftem Kontingent, fehlender Kontofreigabe oder unvollständigem Formular. Unsichere Ergebnisse ausschließlich lesend abgleichen. Echter Submit nur mit konkret ausgewähltem und ausdrücklich freigegebenem Artikel.

## Paket 2: Inserieren als klarer Ablauf

Plattformkarten → Konto bewusst auswählen → vorbefülltes Zielformular. Auch bei einem Konto ausdrücklich wählen. Auswahlfelder im Formular ausblenden; kompakte Zielzusammenfassung und Zurück-Schritt anbieten. Bilder zuerst, danach Titel, Beschreibung, Preis, Kategorie und weitere Felder. Automatisch gespeicherte Angaben übernehmen, fehlende Werte markieren. Quelle unverändert lassen. Nicht verfügbare Übertragungsrichtungen klar kennzeichnen. Vinted → Kleinanzeigen bleibt der erste vollständige Kopierweg.

Abnahme: Konto-/Plattformwechsel ohne fremde oder veraltete Daten, Formularprüfung, Abbrechen und Rückkehr; Desktop/Mobil, Hell/Dunkel, Tastatur, Touch und AXE für die betroffenen Dialoge.

## Paket 3: Übersicht und Plattformkarten

„Inserat erstellen“ als erste Hauptaktion. Drei zentrierte Karten: Vinted, eBay, Kleinanzeigen. Dezenter plattformspezifischer Hover; Auswahl über gefärbte Fläche plus Häkchen, zugänglich per Tastatur. Dieselbe Darstellung mit zweckgerechtem Auswahlverhalten für Sichtbarkeit und Inseratwahl nutzen.

Leere Plattformbereiche zeigen einen zentrierten Hinweis in Du-Ansprache und „Konto hinzufügen“. „Inserate anzeigen“ gezielt nachstellen. Eigener Einstieg über den Kontonamen kann den vollständigen Kontobereich öffnen; Zahnrad bleibt für Einstellungen. Ausblenden einer Plattform entzieht keine Freigaben und löscht keine Konten.

Abnahme: null/ein/mehrere Konten, Kontoauswahl, Plattform aus-/einblenden und zuverlässig erreichbare Inserate.

## Paket 4: Konten direkt in der Übersicht einrichten und verwalten

Konto hinzufügen und Inserat erstellen teilen die Auswahlkarten, haben aber getrennte Zwecke. Vorhandene funktionsfähige Konten brauchen bei einem neuen Inserat keine erneute Anmeldung. Fehlt ein Konto, führt die Aktion in den passenden Verbindungsablauf.

Vinted: lokal oder Cloud wählen. Lokal bei Vinted im passenden Browserprofil anmelden und dieses freigeben; Cloud nutzt die bestehende Cloud-Browseranmeldung. Kleinanzeigen: aktuell lokale Anmeldung im Browserprofil erkennen, Identität bestätigen, Freigaben wählen; kein zusätzliches Flipbase-Passwortformular. eBay: bestehende offizielle Anmeldung/Freigabe verwenden und danach zur Übersicht zurückkehren. Die externe eBay-Anmeldung bleibt erforderlich, Kontoeinstellungen selbst öffnen im Modal.

Gesunden Status zurückhaltend darstellen, Handlungsbedarf deutlich zeigen. Tatsächlich existieren abgelaufene Anmeldung, getrennt, pausiert, gesperrt und fehlende Freigaben. „Status aktualisieren“ liest neu, „erneut verbinden“ erneuert die Freigabe. Trennen und Entfernen aus Flipbase verständlich unterscheiden; Löschen nur mit tatsächlich vorhandener Umsetzung und klaren Datenfolgen anbieten. Keine Löschung des Marktplatzkontos suggerieren.

Abnahme: richtiges Konto im Modal, kein unnötiger Seitenwechsel, Wiederanmeldung und Rückkehr, Abbruch, abgelaufene Freigaben und keine versehentliche Datenlöschung.

## Paket 5: Updatehinweis mit Versionsnummer

Lesbare aktuelle und verfügbare Version anzeigen. Zielversion muss vom tatsächlich neuen Bau kommen, nicht aus der noch laufenden alten Oberfläche. Technische Baukennung getrennt halten. Nach erfolgreicher Aktivierung keinen erneut anklickbaren alten Hinweis zeigen; Fortschritt, Blockade und Fehler nachvollziehbar darstellen.

Abnahme: ein/mehrere Tabs und App-Fenster, Aktivierung durch anderen Tab, langsame Aktivierung, offene Eingaben, Abbruch und weiterer neuer Bau. Bestehende PWA-/Offline-Schutzregeln erhalten. Betroffene Linux-CI-Bedingungen und Produktions-PWA-Fälle nachstellen.

## Paket 6: Header und Rücknavigation

Hell/Dunkel direkt zwischen Glocke und Profil zurücksetzen; Einstellung, Fokus und zugängliche Beschriftung erhalten. Zusätzlichen Link „Alle Marktplätze“ entfernen; „Zurück zu Flipbase“ behalten.

Abnahme: nur betroffene Header-/Sidebarfälle auf Desktop/Mobil, Hell/Dunkel und mit Tastatur. Keine fachfremden Verkaufsabläufe wiederholen.

## Reihenfolge und Grenzen

Zuerst Paket 1, danach Formular- und Übersichts-/Kontoabläufe aus Paketen 2–4. Update und Header als getrennte kleine Änderungen mit eigenem Prüfumfang behandeln. Bestehende Daten, Kontobindung, dauerhafte Aufträge und Gebührenstopps weiterverwenden. Kein weiterer grundlegender Architekturumbau erforderlich.

Die Analyse prüft Quellcode und vorhandene Verträge; der gemeldete Dauerladefehler und der Update-Anzeigefehler sind noch nicht live reproduziert. Keine Implementierung und keine funktionalen Tests in dieser Analysesitzung.

Quellstellen: pwa-update.service.ts, app.html, pwa-update-notice, header/sidebar, marketplaces-settings, marketplace-overview, marketplace-listing-section, listing-transfer-dialog, kleinanzeigen-form-schema.service.ts, kleinanzeigen-local-background.js, kleinanzeigen-form-runtime.js, kleinanzeigen-form-reader.js sowie vorhandene Vinted-/eBay-/Kleinanzeigen-Verbindungsoberflächen.
