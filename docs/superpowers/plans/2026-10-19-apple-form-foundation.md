# Gemeinsame Formulargrundlagen für Flipbase

Freigegeben durch den Nutzer am 19.10.2026. Spezifikation: [Formularaudit](../../design/2026-10-19-apple-form-audit.md), [Apple-Vertrag](../../design/apple-ui-reference.md).

## Umfang

1. Gemeinsamen FormField-Rahmen für Beschriftung, Pflichtangabe, Hinweis und Fehler einführen. Bestehende Text-, Marken-, Kategorie- und Attributfelder darauf umstellen; vorhandene Zahlen-/Selectfelder im Artikelbereich damit verbinden. Formularwerte, IDs, Tastaturbedienung und Serverzugriffe erhalten.
2. Widersprüchliche globale Formularregeln entfernen; gemeinsame Controlrollen vereinheitlichen. Desktop 28px/13px, Touch mindestens 44px/16px Eingabetext, Labels 13/20 Gewicht 500, Labelabstand 6px, Feldabstand 16px, Gruppen 20px. Diese Zahlen sind F: Flipbase-Webentscheidungen. Gedrückte Buttons sichtbar machen.
3. Doppelte Titelbeschriftung korrigieren. Bestehende Spalten und Abschnittsanordnung erhalten; Eigenschaften auf Desktop rechts, Varianten und Suchmaschineneintrag in der Hauptspalte. Shared-UI-Prüfung gegen lokale Controlüberschreibungen erweitern.
4. Aktuelle Richtlinie verbindlich neu fassen; historische Shopify-Regeln ausdrücklich archivieren. AGENTS, Referenz und Sitzungsprotokoll ergänzen.
5. Bestehende Verbraucher- und Komponentenfälle, echte berechnete Browserstile in Hell/Dunkel mit Maus/Touch, Format/Lint/Typen/Bau prüfen. Frischen abschließenden Lesereview einholen.

## Nutzerkorrektur zur Anordnung

Die erste Umsetzung hatte Eigenschaften zusätzlich in die Hauptspalte verschoben. Das ging über den Gestaltungsauftrag hinaus und wird zurückgenommen. Die frühere Forderung „Eigenschaften vor SEO“ ist damit als Layoutauftrag aufgehoben. Varianten und Suchmaschineneintrag waren weiter vorhanden, im kompakten Screenshot aber abgeschnitten. Der aktualisierte Vergleich zeigt das vollständige Formular.

## Grenzen

Keine neue Fachlogik, Datenmigration oder Veröffentlichung. Dashboard-Sonderrollen, Papieransichten und Steuer/DATEV außerhalb der Tabellen bleiben erhalten. Keine neue Figma-Messung behaupten.

## Review-Fokus

Label-/Hinweis-/Fehlerzuordnung einschließlich leerer und versteckter Labels, unveränderte CVA-Werte, Tastaturfokus, Menü-/Dialogsemantik, Touch-Mindestflächen, interne gegenüber externen Shared-Control-Stilen und sinnvolle DOM-Reihenfolge prüfen.

## Umsetzungs- und Prüfnachweis

Gemeinsame Grundlagen umgesetzt. Nach frischem unabhängigen Review drei konkrete Fehler (Iconprojektion, Touch-Löschflächen, Labelüberschreibung) und ein zusätzlich mit AXE belegter bestehender Select-ARIA-Fehler in einem Durchlauf korrigiert, jeweils zuerst rot und danach grün geprüft. Gesamte Anwendungssuite536 Dateien/5.624 Fälle,29 Artikelfälle, zehn gezielte Verbraucherfälle nach dem Review sowie55 Skript-/Auswahltests erfolgreich. Zuvor131 Verbraucherfälle vollständig erfolgreich.241 Shared-UI-/Stildateien ohne Befund. Finale Messungen in Hell/Dunkel mit Maus/Touch, Lint, Typen, Format und Produktionsbau erfolgreich (PWA428be5e0a936). Keine Veröffentlichung.

Webmaße bleiben ausdrückliche Flipbase-Entscheidungen und zentral anpassbar; keine native Pixelgleichheit. Entwurf bleibt uncommitted zur lokalen Nutzerprüfung. Vorherbilder stammen aus dem unmittelbar vorherigen Artikelstand, damit feste Header korrekt oben aufgenommen sind; identische Beispieldaten und gleicher Maßstab. Unberührte Backendfunktionen sowie native Safari-/iPad-/vollständige CI-/Produktionsmatrix sind keine neu erbrachten Nachweise dieses Schritts.
