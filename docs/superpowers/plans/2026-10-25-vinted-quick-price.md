# Vinted-Preisänderung und Ladeablauf

**Ziel:** Neben „Bearbeiten“ öffnet „Preis ändern“ unmittelbar einen kleinen Dialog. Ein Betrag, eine Speicheraktion, bestätigter Preis in Detail und Kleiderschrank. Allgemeine Bearbeitung wird durch das Nachladen der Beschreibung nicht blockiert.

**Aufbau:** Vorhandene Shared Components und Kontoprüfungen verwenden. Eine eigene Preisaktion liest den aktuellen Anbieterstand innerhalb desselben Vorgangs, prüft den bisherigen Preis und ändert ausschließlich das Preisfeld. Keine Auswahlfelder oder Fotos lesen. Erst bestätigte Anbieterwerte in den vorhandenen Cache übernehmen. Bei Fehler bleiben Eingabe und Dialog erhalten; keine automatische Wiederholung eines Speicherklicks.

**Befund:** Produktive Protokolle zeigen zweimal `gegenlesen inhalt` vor dem Speicherklick sowie einen belegten Lesezugriff. Das genaue abweichende Feld ist bisher nicht protokolliert. Separaten Browserstand und bereits vorhandene Korrekturen am Preisformat vor weiterer Fehlerkorrektur vergleichen.

**Technik:** Bestehendes Angular 22, Tailwind, Worker mit Playwright. Keine neuen Abhängigkeiten oder Datenbankänderungen.

- [x] Produktiven Speicherstand mit vorhandener Preisformat-Korrektur vergleichen. Worker und tatsächlich eingestelltes Browserabbild enthalten bereits `blur` und den bisherigen kürzeren Speicherweg. Keine fehlende Veröffentlichung als Ursache behaupten. Die genaue Inhaltsabweichung des alten Vollformulars ist aus den vorhandenen Protokollen nicht bestimmbar.
- [x] Worker-Preisaktion mit frischen Titeln/Beschreibungen, Konfliktprüfung, einmaligem Klick und Anbieterbestätigung durch Browser- und HTTP-Tests absichern; isolierten Transport ergänzen. Bereits beim Anbieter gespeicherter Zielpreis wird ohne erneuten Klick bestätigt.
- [x] API und Store um `saveListingPrice` erweitern; Kontowechsel und Cacheaktualisierung prüfen. Laufenden Inhaltsabruf beim Wiederöffnen teilen und vor der Preisaktion abwarten.
- [x] Preisdialog mit gemeinsamen Modal-, Zahlenfeld- und Buttonkomponenten ergänzen. Eingabe sofort erlauben, laufendes Speichern schützen und Fehler am Dialog anzeigen. Bestehende Bearbeitung auch bei laufendem Beschreibungsabruf öffnen. Getrennte Beschreibungsversion verhindert hängen gebliebenes Laden nach Abbruch; abgebrochene Bearbeitung startet keinen Fallbackabruf.
- [x] Betroffene Anwendungs- und Browserfälle (Hell/Dunkel, Maus/Touch, Fokus, AXE), Typen, Format, Lint, Bau und Testregistrierung prüfen. Cloud-Veröffentlichung separat benennen; ohne Veröffentlichung keine produktive Fehlerbehebung behaupten.

**Prüfrisiken:** Preis zwischenzeitlich geändert; Konto-/Routenwechsel während Anfrage; doppelte Speicheraktion; unbestätigter Klick; Nachladen überschreibt Eingaben. Jeder Fall erhält einen Test auf der zuständigen Ebene. Neue Browserfälle in bestehender ausgewählter Datei ergänzen.

## Nachweise und Grenzen

Die [öffentliche Vintz-Demo](https://vintz.ai/demo/listings) zeigt einen eigenen Dialog „Preis senken“ mit bisherigem Preis, einem Preisfeld und einer Aktion. Die Darstellung wurde nur gelesen, kein Auftrag eingeplant.

715 ausgewählte Angular-Fälle in 42 Dateien, 716 erfolgreiche Workerfälle (acht vorhandene optionale Fälle ausgelassen), 23 gezielte Worker-Browserfälle und 66 UI-Browserfälle erfolgreich. Die vier neuen Dialogvarianten prüfen 390 Pixel mit Touch und 1440 Pixel mit Maus jeweils Hell/Dunkel, Enter, erhaltene Eingabe nach Fehler, einmaliges Speichern, AXE und Rückfokus. Die Auswahlregistrierung umfasst 49 erfolgreiche Prüfungen. Neue Fälle sind in der verbindlichen Soll-Liste eingetragen. Shared-UI-Prüfung, Suite-Audit, Typen, Lint und Produktionsbau erfolgreich. Weitere Node-/Abschlussprüfungen stehen im Sitzungseintrag.

Der zusätzlich gestartete breite Worker-Browserlauf hatte zwei Fehler in bestehenden Login-Fällen. Beide wurden einzeln auch aus einem unveränderten HEAD-Archiv reproduziert: Die Tests erwarten eine Ablehnung ohne Kontoprüfung; der aktuelle Leser prüft zuerst das Konto. Die betroffenen Dateien sind unverändert. Keine Abschwächung dieser Tests in dieser Aufgabe.

Die CI-Auswahl des gemeinsam verwendeten Stores umfasst weitere Marktplatzoberflächen; die zusätzlich notwendige Aktualisierung der verbindlichen Pflichtfall-Soll-Liste löst für diesen PR den breiten CI-Lauf aus. Deshalb zusätzlich alle Anwendungssuiten geprüft: 2.708 Node-, 2.854 Angular- und 354 DOM-Fälle erfolgreich. Der erste parallele Sammellauf hatte einen PDF-Testtimeout bei unverändert fünf Sekunden; die gesamte DOM-Suite bestand anschließend allein mit unveränderten Bedingungen. Der Sammelbefehl wird deshalb nicht als erfolgreich angegeben. Lokal wurden die unmittelbar berührten drei Vinted-UI-Dateien vollständig geprüft; keine fachfremden Verkaufs-/Einkaufsabläufe erneut durchgespielt. Die gesamte Datenbank-, PWA- und Browsermatrix folgt in CI. Kein Datenbankumbau, kein PWA-Umbau, kein produktiver Schreibversuch. Die erste lokale Vorschau scheiterte an der für Produktions-CSP falschen Test-API; anschließend eigener Produktionsbau mit vorhandener `pwa-testing`-Konfiguration und abgefangener HTTPS-API. Ein fehlendes reaktives Formular und der Rückfokus wurden durch die Browserfälle entdeckt und korrigiert.

Zum produktiven Einsatz müssen Web-App, Marketplace-Worker und isoliertes Chromium-Sitzungsabbild gemeinsam auf den geprüften Stand gebracht werden. Der bisherige allgemeine Speicherweg bleibt erhalten; seine protokollierte genaue Inhaltsabweichung und die echte Preisbestätigung müssen nach Veröffentlichung am betroffenen Inserat kontrolliert werden. Ein erfolgreicher lokaler Test beweist keine erfolgte produktive Speicherung. Keine automatische Wiederholung oder echte Preisänderung ohne konkreten Zielbetrag.
