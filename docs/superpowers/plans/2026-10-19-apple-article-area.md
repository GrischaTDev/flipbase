# Artikelbereich an die bestehende Apple-orientierte Gestaltung angleichen

Stand: 19.10.2026. Nutzerfreigabe umfasst vorhandene Artikelübersicht, Katalogdetail/Erstellen/Bearbeiten, Einzelpositionsdetail und zugehörige Dialoge. Eigener bestehender Arbeitszweig; keine Veröffentlichung.

## Grundlage und Grenzen

Verbindlich: docs/design/apple-ui-reference.md und aktuelle Nutzerentscheidungen in admin-ui-guidelines.md. Figma-Kit-Rollen wurden bereits geprüft; neue Seitenabstände und Feldgruppen sind ausdrücklich Flipbase-Webanpassungen. Bestehende Formulare, Routen, Datenmodelle, Preis-/Bestandslogik und Rechte beibehalten. Gedämpfte Kleidungsplatzhalter erhalten. Kein neues Demofeature. Die Stammdatenansicht ist bereits zugleich Bearbeitung; diesen Ablauf nicht ungefragt trennen.

## Umsetzung

1. Vorher-Nachweis: bestehende Routen /catalog, /catalog/new, /catalog/:id, Bestandsreiter, /inventory/:id sowie Varianten-/Positions-Bearbeitungsdialog mit identischen simulierten Daten bei 1440px Maus und 834px Touch, Hell/Dunkel aufnehmen. Erledigt: 28 PNGs, vier bestandene Aufnahmeläufe.
2. Gemeinsame Rollen: bestehende Card um ruhige Abschnittsrolle, PageHeader um Inhaltsrolle erweitern; bestehende Button-Rolle für segmentierte Ansichten ergänzen. Explizite Rollen verändern keine fachfremden Standardkarten.
3. Artikelübersicht: klarer Seitenkopf, zurückhaltende Nebenaktionen, lesbare Artikel-/Bestandsinformationen und mobile Ansicht; vorhandene Suche, Filter, Spaltenpräferenzen und Aktionen erhalten.
4. Katalogformulare: Abschnitte ohne schwere Titelbänder; logisch gruppierte Eigenschaften und Kennungen; vorhandener Medieneditor, Shop-/SEO-Eingaben und Varianten bleiben angebunden. Details/Bestand erkennbar auswählen.
5. Einzelposition: Aktionsleisten vereinheitlichen, doppelte Angaben reduzieren, Kennzahlen ohne Karten-in-Karten, neutrale Abschnittstitel, verständliche Medien-/Shopdarstellung. Bearbeitungs-, Bilder-, Bestands- und Variantenmodale mit gleichen Feld-/Aktionsrollen.
6. Auswahlbausteine: Attribute/Mehrfachauswahl und zugehörige Menüs an bestehende Controlfarben/Fokus-/Touchregeln angleichen. Kategorie-/Markendaten und Auswahlverhalten erhalten.
7. Prüfung: direkte bestehende Komponenten und Verbraucher, tatsächliche betroffene Testauswahl, vorhandene Artikel-Browserfälle soweit isoliert ausführbar; visuelle Matrix, Tastatur, AXE, 390px/200% Zoom ergänzen. Keine echten Daten schreiben. Browser-Plugin mit browser-Skill nicht vorhanden; projektgebundene Playwright-Prüfungen mit simulierten Daten verwenden.
8. Ein frischer abschließender Lesereview des gesamten Abschnitts; materielle Befunde korrigieren. Finale Screenshots vor/nach im gleichen Maßstab, Format/Lint/Typen und Produktionsbau; keine parallelen App-Bauten während Browserprüfungen.

## Nachweise

Temporäre Fixtures/QA unter .superpowers/dev-live, Vergleichsartefakte außerhalb des Repos unter apple-articles im lokalen Visualisierungsordner. Änderungen und Prüflücken in AI-CHANGELOG dokumentieren. Verbleibende CI-/PWA-/native Apple-Geräteprüfung vor Veröffentlichung offen benennen.

## Abschluss 19.10.2026

Alle acht Umsetzungsschritte erledigt.53 bestehende Verbraucherfälle und27 Artikel-Browserfälle erfolgreich. Sechs Größen-/Farbschemaabläufe prüfen echte bestehende Routen, gespeicherte Werte, Auswahl, Dialogfokus und AXE;200%-Vergrößerung, leere/nicht gefundene Artikel und lange Einzelartikeltexte zusätzlich geprüft. Artikel-Galerie/-Zuschnitt, Anlage, Bearbeitung, Variantenarchivierung und Bestandsabgang gegen eigene lokale Datenbank geprüft. Änderungen an Beschreibung/Zustandsnotiz mit zuerst rotem, danach grünem Formularfall abgesichert.

Vollständige Anwendungssuite ausgeführt; zwei veraltete Selektoren anschließend korrigiert und alle sechs betroffenen Dateien/62 Fälle erneut erfolgreich.33 Auswahl-/Registrierungstests, Format, Lint, Typen, Shared-UI-Prüfung und finaler Produktionsbau erfolgreich. Eigenen Testserver und eigene Supabase-Instanz beendet, Nutzer-Vorschau4201 bleibt geöffnet. Frischer unabhängiger Review abgeschlossen; einziger materieller Umbruchbefund korrigiert und im Browser abgesichert.

Vorher/Nachher: je28 Original-PNGs plus vier Vergleichs-PNGs und klickbare HTML-Vergleiche; alle sieben Ansichten, Desktop1440/Tablet834, Hell/Dunkel, identische Daten und gleicher Maßstab. Finale Aufnahmen nach letzter Produktivcodeänderung wiederholt. Keine echten Nutzerdaten verändert; keine Veröffentlichung. Vollständige CI-/Produktions-PWA-/native Safari-/iPad-Freigabe bleibt für einen späteren PR offen.
