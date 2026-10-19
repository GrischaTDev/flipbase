# Apple-orientierte Oberfläche: geprüfte Rollen und aktueller Stand

## Erneuter Formularabgleich vor weiteren Seitenumbauten

Der [Formularaudit vom 19.10.2026](2026-10-19-apple-form-audit.md) ergänzt und präzisiert diesen Vertrag. Funktional geprüfte Komponenten bedeuten keine vollständige gestalterische Formularabnahme. Vier aktuelle Browsermessungen belegen unter anderem28/30px-Feldhöhen, uneinheitliche Labelgewichte und fehlende sichtbare Press-Rückmeldung. Neue native Kit-Messungen waren wegen des Figma-Zugriffslimits nicht möglich. Vor weiteren Seitenmigrationen gemeinsame Formular-, Schrift-, Abstands- und Aktionsrollen abschließen. Bestehende K-Belege und ausdrückliche F-Webwerte bleiben nach Herkunft getrennt; keine pauschale UIKit-/macOS-Übertragung.

Stand: 19.10.2026. Nach der Nutzerkorrektur ersetzt dieser Vertrag die pauschale Kapsel-/Rahmenübertragung des ersten Entwurfs.

## Anordnung bleibt erhalten

Nutzerklarstellung vom 19.10.2026: Gestaltungsarbeit ist keine Freigabe, Abschnitte oder Spalten zu verschieben. Im Produkteditor gehören die kurzen Eigenschaften auf Desktop weiterhin rechts; Varianten und Suchmaschineneintrag bleiben in der Hauptspalte. Die zwischenzeitliche Verschiebung der Eigenschaften nach links wird zurückgenommen. Apple-Formularhinweise verlangen diese konkrete Verschiebung nicht.

## Lokal ansehen

Die echte App läuft unter [localhost:4201](http://localhost:4201/purchases). Besonders prüfen: Einkäufe, neuer Einkauf mit Verkäufer-Auswahl, Artikel erstellen und Übersicht. Anmeldung und bestehende Daten bleiben erhalten. Automatisierte Prüfungen verwenden ausschließlich simulierte Backend-Antworten.

Start im eigenen Worktree:

    node scripts/start-design-preview.mjs

Nur 127.0.0.1; keine LAN-Freigabe. Der Starter verwendet den normalen App-Einstieg und die bereits autorisierte ignorierte lokale Backend-Konfiguration, falls vorhanden. Andernfalls bleibt die normale Entwicklungskonfiguration bestehen. Kein versioniertes Geheimnis und keine produktive Konfigurationsänderung.

## Verifizierte Referenzen

- [Apple Design Resources](https://developer.apple.com/design/resources/) und das vom Nutzer bereitgestellte [macOS-27-Kit](https://www.figma.com/design/mBbHXoMOjwhqC1y6eYLk1b/macOS-27--Community-?node-id=131-8996).
- [Safari-Webhinweise](https://developer.apple.com/documentation/webkit/optimizing-your-website-for-safari). Kein separates allgemeines offizielles Apple-Web-UI-Kit gefunden. [Web views](https://developer.apple.com/design/human-interface-guidelines/web-views) behandelt native Einbettung.
- Lissie Harness: veröffentlichter Stand [4a67c68f](https://github.com/GrischaTDev/lissie/tree/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85). GitHub lieferte nur main und keine offenen PRs; gezielt kein lokaler Checkout gefunden. Ein parallel bearbeiteter unveröffentlichter Entwurf ist damit nicht erfasst.

Das Kit ist nicht als veraltete Vorlage belegt. Der Fehler war die Auswahl und pauschale Übertragung unterschiedlicher Rollen: Pfeil-/Toolbar-Kapseln sind kein allgemeiner Inhaltsbutton-Standard. Ebenso sind eigene stark kontrastierende Rahmen keine gelesenen Apple-Werte.

Quellenklassen: A = dokumentierte Apple-Aussage; K = aus dem Kit gelesen; M = am nativen Gerät gemessen; F = bewusste Flipbase-Webanpassung. Es liegen keine nativen Gerätemessungen M vor.

| Rolle                    | Geprüfte Quelle                                                      | Ergebnis / Übertragung                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inhaltsbuttons           | K, Buttons-Set 121:11923; Content Area 4341:4872, Beispiel 4341:4876 | Kleine Radien: 6px. Nicht mit runden Pfeilbuttons verwechseln. Flipbase regulär 28px hoch, größere Rollen explizit erhalten (F).                                              |
| Pfeil-/Toolbar-Beispiele | K, Buttons-Seite 207:14487; früheres Menübeispiel 4354:7698          | Kapseln gehören zu bestimmten Rollen. Nicht mehr als globalen Standard verwenden.                                                                                             |
| Eingabefeld              | K, Beispiel 480:680 und Fokuskomponente 479:5652                     | Text 13/16px, Gewicht 510, 8px seitlicher Referenzabstand; Radien 6/7px je Größe. Feine 4-/8-Prozent-Konturen statt deckender dunkler Umrandung.                              |
| Fokus                    | K, 479:5652; Lissie globale Fokusregel                               | Blaue Fokusfamilie, kein schwarz-gelber Doppelrahmen. Web: genau ein 2px-Fokus, bei Feldern als zusammenhängender blauer Schatten (F); Logo-Gelb bleibt Marken-/Aktionsfarbe. |
| Popup-Menü               | K, 4354:7698 und 4354:7867                                           | 12px Radius, Auswahlhaken links, 24px Desktopzeilen. Web: feine separate Menügrenze, neutraler Hintergrund, Touchzeilen mindestens 44px (F).                                  |
| Lissie Hauptaktionen     | styles.scss ab Zeile 82                                              | Eigene .btn-Klasse mit 38px Mindesthöhe und Kapselradius. Kein allgemeiner Apple-Originalwert.                                                                                |
| Lissie Kontextaktionen   | shell.scss und task-toolbar.scss                                     | Textaktionen ohne Rahmen; Iconbuttons rund; Menüpunkte 8px; Zuordnungstrigger 10px. Unterschiedliche Rollen, keine pauschale Kapselregel.                                     |
| Lissie Shell             | shell.scss, Header/Sidebar                                           | Stabile Shell außerhalb der Inhaltsverzweigung; Header #fafafc, Sidebar #f5f5f7. Flipbase behält 224px Seitenleiste und 64px Header plus Safe-Area (F).                       |

[Lissie globale Stile](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/angular/apps/desktop-ui/src/styles.scss), [Shell](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/angular/libs/shell/src/lib/shell/shell.scss), [Toolbar](https://github.com/GrischaTDev/lissie/blob/4a67c68f02f034e5701e42bc6d4a6cc9d2477d85/angular/libs/shell/src/lib/task-toolbar/task-toolbar.scss).

## Gemeinsamer Webvertrag

- Normale Inhaltsbuttons: 6px Radius, ruhige graue Sekundärfläche, gelbe Primäraktion ohne sichtbare zusätzliche Rahmenkante. Bildaktionen, Tabellenaktionen, Listenzeilen und ausdrücklich runde Iconrollen behalten ihre eigene Funktion.
- Formularfelder: weiß beziehungsweise dunkel, Radius 7px und feine 8-Prozent-Schwarz-/12-Prozent-Weiß-Kontur. Standardhöhe 28px auf Desktop, größere ausdrücklich gewählte Varianten bleiben erhalten. Fokus ersetzt die inaktive Kontur durch einen einzelnen sichtbaren blauen Fokus; Fehler bleiben gesondert gekennzeichnet.
- Einfache Selects: graue hervorgehobene Fläche und 6px Radius auch innerhalb von Formularen. Durchsuchbare Auswahl bleibt ein Eingabefeld. Menüs verwenden eine eigene dezente Rahmenfarbe, nicht mehr die Feldgrenze.
- Erstellen-Aktion im Auswahlmenü: eigene abgesetzte Zeile, Plus-Symbol, normale verständliche Beschriftung. Bestehende Aktion und Dialoganbindung bleiben erhalten.
- Filter in Tabellen wachsen nicht mehr beliebig über die freie Zeilenbreite; der Verkäuferfilter in Einkäufe ist auf maximal 192px begrenzt. Suche und Filter behalten eigene Größenrollen.
- Touch: mindestens 44px für reguläre Controls und relevante Leeren-/Passwortaktionen, unabhängig von Fensterbreite. Mouse-Desktop wird nicht versehentlich mit Touchmaßen dargestellt.
- Header, Sidebar, Hover und Farben sind auf sämtlichen Verwaltungsrouten gleich. Navigation 8px Radius, keine Kapsel-Hoverflächen. Inhaltliche Charts, Kennzahlen und Tabellenabläufe werden nicht umgebaut.
- Apple-Systemschrift mit lokalem Inter-/Segoe-Fallback. Keine SF-Pro-Webdateien oder neue UI-Bibliothek.

Die gemeinsame Shell steht in src/styles/flipbase-shell.css, Controlfarben in flipbase-theme.css, Grundklassen in styles.css. Vorhandene Komponenten und Tailwind-Templates bleiben die Grundlage. Keine zweite Bibliothek. Der Folgeauftrag vom 19.10.2026 umfasst nun auch die vollständige gestalterische Angleichung von Ausgaben, Steuer/DATEV samt Bankabgleich und Auswertung; die frühere Tabellenbegrenzung ist aufgehoben. Anordnung, Berechnungen und Export-/Speicherabläufe bleiben erhalten.

## Erhaltene Funktionen und Platzhalter

CVA-/Reactive-Forms-Anbindung, Pflicht-/Fehlerzustände, Suche, Tastatursteuerung, Escape, Fokusübergabe, Workspace-Sperren, Benachrichtigungen und Navigation bleiben erhalten. Die vom Nutzer freigegebenen gedeckten Kleidungsplatzhalter bleiben im vorhandenen ProductThumbnail erhalten; echte Fotos und neutrale Profile werden nicht ersetzt.

## Prüfung und Grenzen

Vier dauerhafte Fälle in e2e/settings-layout.spec.ts prüfen die konkreten Regressionen über Übersicht → Einkäufe → neuer Einkauf → Artikel erstellen: konstante Shell, kompakter Filter, kleine Radien, dezente Konturen, einzelne blaue Fokusdarstellung und auffindbare Verkäufer-Erstellen-Aktion mit funktionierendem Dialog. Jeweils Hell/Dunkel und Maus/Touch. Der ursprüngliche Seitenwechsel-Fehler wurde vor der Korrektur nachgewiesen. AXE fand danach einen zu schwachen Kategorie-Platzhaltertext; dessen Farbe wurde angepasst, nicht die Prüfung abgeschwächt.

Nach der Korrektur erfolgreich: 536 Anwendungs-Testdateien/5.621 Fälle, 96 bestehende und ergänzte Browserfälle sowie sechs zusätzliche Sichtfälle bei 1440/834/390px in beiden Themen. Suite-Audit,33 Testauswahl-/Registrierungsfälle, Lint, Typen, SharedUI und Formatprüfung erfolgreich. Unabhängiger Lesereview ohne verbliebenen Befund. Bilder verwenden Testdaten und liegen unter apple-controls/ beziehungsweise apple-refinement/ im lokalen Visualisierungsordner. Produktionsbau abschließend separat geprüft; aktueller AI-Changelog und lokales Prüfprotokoll enthalten den Stand.

Offen bleiben echte Mac-/Safari-/iPad-Messungen, reale Textvergrößerung und die vollständige Produktions-PWA-/CI-Browsermatrix vor einer Veröffentlichung. Kein Push, PR, Merge oder Deployment.

## Tabellen und Modale: Fortsetzung vom 19.10.2026

Auf Nutzerauftrag direkt in den bestehenden Seiten umgesetzt, ohne zusätzliche Demoansicht. Quellen erneut am tatsächlichen Kit geprüft:

| Rolle                   | Kit-Beleg                                        | Übertragung                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabelle / Outline View  | K, 4356:13263; Table Rows Blank 4356:12179/12181 | Kopf 28px, native Leerzeile20px, Alternierung5% Schwarz, inset10px, Zeilenradius8px. Web (F): Kopf mindestens32px, Textzeilen mindestens40px, Touch 44px; echte Bilder/Aktionen dürfen wachsen. Dezente alternierende3%/4%-Flächen, feine Kopftrenner statt eines schweren Kopfbandes. |
| Formularfenster / Sheet | K, 4358:15435, Licht121:11423/Dunkel4358:15436   | Radius16px, helle weiße bzw. dunkle #1e1e1e-Fläche; dunkle Kontur20% Weiß; Schattenfamilie mit18/27px. Web (F):17/22px-Titel, 20/24px Seitenabstand, interner Inhaltsscroll, vorhandene Größen und Drawer erhalten.                                                                    |
| Kleiner Dialog          | K, 171:9049                                      | Dialogbeispiel mit16px-Radius, 13/16px-Überschrift und unten angeordneten Aktionen. ConfirmDialog ist eine eigene Webanpassung dieser Familie, kein nachgemessener nativer Alert. Body13/18 statt nativer11/14 für Lesbarkeit.                                                         |

Die gemeinsame ModalShell zeigt Kopf, Inhalt und Aktionen auf einer zusammenhängenden Fläche. Fensterkante/-schatten sind unabhängig von Inhaltskarten. Auch bestehende eigene Workspace-, Scanner-, Foto-, Rechnungs- und Etikettenrahmen nutzen diese Fensterrolle. Spezielle Inhalte bleiben bestehen. Bildschirmregeln sind von Druckregeln getrennt; weiße Papieransichten von Rechnung und Kaufbeleg werden auch in der Bildschirmvorschau ausdrücklich ausgenommen. Hintergrund-/Fensterfarben funktionieren ebenfalls außerhalb der angemeldeten Shell.

Tabellen behalten ihre vorhandenen Spalten, gespeicherten Präferenzen, Auswahl und mobilen Ersatzansichten. Die abgestimmte Dashboard-Verkaufstabelle bleibt ihre eigene Rolle. Sortierköpfe verwenden denselben blauen Tastaturfokus wie die übrigen Controls. Fachliche Zeilenhervorhebungen werden nicht durch alternierende Flächen ersetzt.

Im Verkäufer-Erstellen-Ablauf wurde ein belegter Fokusfehler korrigiert: Vor Öffnen des Dialogs erhält der bleibende Select-Auslöser den Fokus, statt des beim Menüschließen entfernten Aktionsbuttons. Dadurch kann der Dialog den Fokus beim Schließen korrekt zurückgeben. Neuer Regressionstest zuerst fehlgeschlagen, anschließend alle 40 Select-Fälle erfolgreich.

Vorher-/Nachherbilder verwenden dieselben sechs simulierten Einkäufe und dasselbe Verkäuferformular auf bestehenden Routen. Rohaufnahmen und Vergleiche liegen unter apple-tables-modals im lokalen Visualisierungsordner; jeweils 1440px Desktop und 834px Touch, Hell/Dunkel. Ausschnitte werden im gleichen Maßstab gegenübergestellt, keine synthetisch erzeugten Bildschirmbilder.

Der globale Stylesheet-Eingriff löst laut bestehender Testauswahl einen umfassenden CI-/PWA-Lauf aus. Der lokale Designnachweis ersetzt diese Freigabe nicht; vollständige CI-Browser-/Produktions-PWA-Matrix und echte Safari-/iPad-Prüfung bleiben vor Veröffentlichung offen. Keine Konten, Artikel oder Anzeigen wurden durch die automatisierten Sichtprüfungen verändert.

## Artikelbereich: freigegebene Webanpassung vom 19.10.2026

Der Auftrag umfasst die vorhandene Artikelübersicht (/catalog), Katalogdetail mit Erstellen/Bearbeiten und Bestandsreiter sowie das Detail einzeln nachverfolgter Artikel (/inventory/:id) einschließlich ihrer vorhandenen Dialoge. Keine zusätzliche Demo und keine Trennung der bereits gemeinsam verwendeten Stammdaten-/Bearbeitungsroute.

Die bestehenden gemeinsamen Control-, Tabellen- und Fensterrollen bleiben Grundlage. Neue Inhaltsrollen sind **F – Flipbase-Webanpassungen**, keine behaupteten nativen Apple-Maße: Inhaltsüberschrift 26/32px, Abschnittskarte Radius12px mit20px Innenabstand, 15px Abschnittstitel und dezenter Kontur ohne schwere Titelbänder. Formular auf breiten Ansichten mit Hauptspalte und300–340px Eigenschaftsspalte; darunter einspaltig. Details/Bestand verwendet die ausdrückliche Button-Rolle segment. Standardkarten und andere Fachseiten behalten ihre vorhandenen Rollen.

Eigenschaften werden zusammengehörig gruppiert, Varianten durch Trennlinien gegliedert und Einzelartikel-Kennzahlen flach dargestellt. Gedämpfte Kleidungsplatzhalter bleiben erhalten. Beschreibung und Zustandsnotiz des älteren Einzelartikelformulars waren im Datenmodell vorhanden, aber nicht sichtbar; sie werden jetzt angezeigt, bearbeitet und mit vorhandenen Methoden gespeichert. Lange ungetrennte Texte umbrechen innerhalb der Karte. Der Änderungsverlauf erhält ausschließlich am Einzelartikel dieselbe Abschnittsrolle.

Marken-, Kategorie- und Attributmenüs nutzen die vorhandenen Menüfarben, linke Auswahlmarkierung und 24px-Maus-/mindestens44px-Touchzeilen. Host-IDs von Marke/Kategorie werden entfernt, damit Labels und ARIA-Ziele eindeutig das tatsächliche Feld adressieren. Kategoriebaum, bestehende Zuordnungen, Freitext-/Mehrfachauswahl, CVA, Suche und Tastatur bleiben erhalten. Die Suchmaschinenvorschau verwendet eine zum ausdrücklich gewählten Farbschema passende Textvariable.

Vorher-/Nachher-Artefakte: sieben bestehende Ansichten bei1440px Maus und834px Touch, jeweils Hell/Dunkel; identische simulierte Daten. Originalbilder sind unverändert, Vergleichsausschnitte gleich skaliert und mit Links auf vollständige Originale versehen. Zusätzliche Bedien-/AXE-Prüfungen bei390px und CSS-Browservergrößerung200%; keine native Apple-Gerätemessung. Rohaufnahmen und index.html im lokalen Visualisierungsordner apple-articles.

## Verbindliche Formulargrundlagen nach Umsetzung

Die [aktuelle Flipbase-Richtlinie](admin-ui-guidelines.md) ersetzt abweichende ältere Größen-/Formularregeln. Gemeinsamer FormField-Rahmen, einheitliche Labels 13/20 Gewicht500, 6px Labelabstand, 28px Maus-/44px Touchfelder, 13/16px Maus- und16/20px Touch-Eingabetext sind ausdrückliche F-Webentscheidungen. Buttons haben einen sichtbaren gedrückten Zustand. Kategorien, editierbare Vorschläge und Mehrfachauswahl behalten ihre unterschiedlichen Funktionen. Keine neue Kit-Messung oder native Geräteprüfung behauptet.
