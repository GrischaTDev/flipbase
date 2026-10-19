# Finanzseiten im gemeinsamen Flipbase-Design

Stand: 19.10.2026. Lokaler Entwurf gemäß [Gestaltungsrichtlinie](admin-ui-guidelines.md). Der erste rein optische Angleich wurde vom Nutzer abgelehnt. Der anschließende ausdrückliche Auftrag erlaubt auch die grundlegende Neuordnung dieser drei Finanzbereiche; die Layoutgrenze für Artikel und andere Fachseiten bleibt bestehen.

## Neue Anordnung

- **Ausgaben:** Ansichtswechsel unter dem Seitentitel; zusammengefasste Summen in einer Fläche. Monatsauswahl als normales gemeinsames Auswahlfeld in der Tabellenleiste, einschließlich „Alle Zeiträume“ als Option. Monatswechsel direkt daneben, danach Suche, Status und Kategorie. Gleiche Controlhöhe entsprechend Maus oder Touch.
- **Steuer/DATEV:** Hauptaktion für das Berichtspaket im Seitenkopf. Ansichtswechsel darunter; Steuerjahr, Zeitraum und einzelne Exporte in einer flachen Werkzeugleiste. Ein zusammenhängender Kennzahlenbereich, anschließend das Journal. Prüfhinweise und gesperrte Exporte bei ungeklärten Kosten bleiben erhalten.
- **Bankabgleich:** Bei vorhandenem Kontoauszug stehen Summen und Transaktionen im Vordergrund. Import und Zurücksetzen im Kopf; große Ablagefläche nur ohne Transaktionen. Suche, Status und Buchungsaktionen bleiben erhalten. Dateiablage ist auch bei vorhandenen Umsätzen am Bankbereich möglich.
- **Auswertung:** Zusammengefasste Kennzahlen; die sieben tatsächlich auswählbaren Bereiche über eine kompakte lokale Navigation auf Desktop, ein gemeinsames Auswahlmenü auf schmaleren Ansichten. Zeitraumschalter bleiben im Kopf. Die frühere Angabe „neun Bereiche“ war falsch: zwei zusätzliche Typbezeichner besitzen keinen auswählbaren Bereich.

## Farben und gemeinsame Bausteine

Alte braune/orange Warnrollen durch Markengelb und gut lesbare neutrale Texte ersetzt, auch die Dashboard-Warntextrolle. Normale Zahlen wie offene Ausgaben, ROI und Haltedauer sind neutral; Erfolg und negative Geldwerte behalten ihre Bedeutung. Eine alte globale Kennzahlklasse überlagerte die Finance-Farbwerte: ihre Verwendung im Steuerbereich entfernt, statt eine weitere CSS-Ausnahme darüberzulegen.

Shared Button, CustomSelect, Card, DataTable, Badge und FormField werden verwendet. Die vorhandene gemeinsame Listenbuttonrolle erhält einen einheitlichen Iconabstand; die Auswertungsnavigation verwendet deren kompakte Dichte. Keine neue Feature-CSS-/SCSS-Datei. Der durch die zentrale Warnfarbe betroffene aktive Versandfilter nutzt ebenfalls die gemeinsame Segmentrolle; Kontrast in Hell/Dunkel gezielt abgesichert. Große Geldwerte erhalten unter sm eine volle Kennzahlzeile.

## Referenz und Grenzen

Offizielle Apple-Hinweise zu [Werkzeugleisten](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Auswahlmenüs](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons) und [Segmentsteuerungen](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) erneut geprüft. Die konkrete Anordnung und die Maße sind Flipbase-Webentscheidungen: keine behauptete Pixelgleichheit mit macOS. Der erneute Figma-Komponentenabruf scheiterte an der Starter-MCP-Grenze; bestehende Kit-Belege im [Referenzvertrag](apple-ui-reference.md) bleiben die geprüfte Grundlage.

Berechnungen, Datenspeicherung, bestehende Kategoriezuordnungen und Exportformate bleiben unverändert. Automatische Browserprüfungen verwenden vollständig simulierte Daten und Schreibantworten. Die lokale Vorschau verwendet weiterhin die vom Nutzer freigegebene bestehende Backendverbindung.

**Ergänzter Fachablauf:** Die anschließend beauftragte [manuelle Bankzuordnung](manual-bank-assignment.md) besitzt jetzt ein eigenes Auswahlfenster mit Suche, Differenzbestätigung und gezieltem Speichern. Zuordnen und Buchen bleiben getrennt. Die zusätzliche Serversicherung ist als Migration vorbereitet und noch nicht auf dem bestehenden Backend ausgerollt.

## Prüfstand

Aktuelle Nachweise und Ergebnisse stehen im neuesten Eintrag des [AI-Changelogs](../AI-CHANGELOG.md). Der neue Vergleich liegt unter apple-finance-redesign; die abgelehnten bisherigen Aufnahmen unter apple-finance bleiben erhalten. Unveränderte Vorherbilder und neue Bilder mit gleichen Beispieldaten und gleichem Filter werden für1440px Maus und834px Touch in Hell/Dunkel gegenübergestellt. Zusätzlich390px und der bestehende320px-Fall für Reflow und Bedienung.

Native Safari-/iPad-Prüfung, vollständige CI und Produktions-PWA-Freigabe sind kein Bestandteil dieses lokalen Designnachweises. Eine automatische AXE-Prüfung allein ist keine vollständige manuelle WCAG-Abnahme.
