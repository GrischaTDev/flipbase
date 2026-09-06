# Konfigurierbare Nummernkreise – Vorgehensplan

**Auftrag:** Gemeinsames Nummerierungssystem mit eigenem Tab unter Einstellungen. Nutzer definieren je Vorgangsart ihr Format, etwa `B 2026 01` für einen Einkauf. Ergänzt den Einkaufsfolgeplan; noch keine implementierte Funktion oder fertige Datenbankmigration.

## Zielbild

Einstellungen → Nummernkreise. Konfiguration je Workspace und Vorgangsart, nicht je einzelnem Benutzer. Einkäufe und Verkäufe erhalten getrennte Zähler. Vorhandene weitere Nummern, insbesondere Rechnungen, Gutschriften oder Retouren, zunächst inventarisieren und nur nach Prüfung ihrer Vergabe- und Abschlussregeln anbinden. Eine Verkaufsnummer ist nicht automatisch eine Rechnungsnummer. Externe Bestellnummern bleiben externe Referenzen.

Je Nummernkreis: Bezeichnung, Präfix, Trennzeichen, optionale Jahresangabe, Mindestanzahl Ziffern, Anfangswert und Neustart „Nie“ oder „Jährlich“. Sofortige Vorschau mit mehreren Beispielnummern; Vorschau reserviert keine Nummer. Beispiel: Präfix B, Leerzeichen, vierstelliges Jahr, Leerzeichen, zwei Ziffern → `B 2026 01`, `B 2026 02`. Ziffernanzahl ist eine Mindestbreite: Nach 99 folgt 100 ohne Abschneiden.

Bedienung über verständliche Felder. Optional angezeigtes Muster wie `B {YYYY} {SEQ:2}` dient der Erklärung; für die erste Fassung kein freier Ausdruckseditor und keine ausführbaren Vorlagen. Ein vorangestelltes Rautezeichen ist keine Pflicht. Jahr anzeigen und jährlich neu beginnen sind zwei unterschiedliche Optionen.

## Vergabe und Änderungsregeln

- Fertige Nummer, Nummernkreis und Vergabezeit am Vorgang speichern. Interne IDs/URLs bleiben unabhängig davon.
- Einkaufsnummer beim ersten erfolgreichen Speichern des Entwurfs. Vergabezeitpunkt anderer Vorgangsarten separat prüfen; insbesondere Rechnungen nicht automatisch nach Einkaufsregeln behandeln.
- Nummernvergabe serverseitig atomar und bei Wiederholungsversuchen idempotent. Nummern nicht aus sichtbaren Datensätzen oder Browserzählständen erzeugen. Keine Doppelvergabe bei parallelen Benutzern.
- Eindeutigkeit mindestens je Workspace und Vorgangsart über alle Formatversionen sichern. Bereichsübergreifende Suchergebnisse zusätzlich mit Vorgangsart kennzeichnen.
- Jahresangabe und Jahreszähler richten sich nach dem Vergabezeitpunkt in der festgelegten Workspace-Zeitzone. Rückdatierte Kaufdaten ändern keine Nummer. Zeitzonenänderung darf bestehende Nummern nicht beeinflussen.
- Jährlicher Neustart erfordert ein Jahr im Format, damit Nummern nicht jedes Jahr identisch werden. Anfangswert und Zählstand dürfen keine vorhandenen Nummern erneut vergeben; Formatänderung mit Kollision wird abgewiesen.
- Formatänderungen gelten für zukünftige Vergaben. Historische Nummern bleiben unverändert. Eine reine Präfixänderung startet den Zähler nicht automatisch neu. Neustartregel und Anfangswert als ausdrückliche separate Änderungen behandeln.
- Vergebene Nummern bei Archivierung oder Stornierung nicht wiederverwenden. Technische Nummernkreise sind keine pauschale Zusage lückenloser oder rechtlich geeigneter Belegnummerierung.
- Änderungsberechtigung über bestehende Workspace-Rollen definieren, serverseitig erzwingen und Änderungen mit Person/Zeit protokollieren. Normale Mitglieder sehen benötigte Vorgangsnummern, können aber nicht automatisch die Regeln ändern.

## Arbeitspakete

1. **Bestandsaufnahme:** Vergabestellen, Modelle, RPCs und Exporte für Einkauf, Verkauf und vorhandene Belege erfassen. Bestehende Nummern und Nummernregeln erhalten. Tatsächliche Routen/Navigation aus `features/settings/settings.routes.ts` und `settings-shell/` prüfen.
2. **Vertrag und Migration planen:** Nummernkreise, Zählerperioden, Formatversionen, Berechtigungen, Eindeutigkeit und Vergabezeitpunkte anhand der Bestandsaufnahme definieren. Deklarative Schemaänderung, erzeugte Migration und generierte Typen erst danach festlegen. Keine voneinander unabhängigen provisorischen Zähler für jeden neuen Bildschirm bauen.
3. **Gemeinsame Vergabe absichern:** Parallelzugriff, Wiederholung, Rückabwicklung, Jahreswechsel, Rückdatierung, Formatwechsel, Kollision, unberechtigte Änderung und Workspace-Trennung testen. Reine Vorschau verbraucht keine Nummer.
4. **Einstellungsseite:** Neue Feature-Seite `features/settings/pages/numbering-settings/` mit getrenntem HTML und OnPush-Komponente. Bestehende Tabellen-/Formbausteine und Shopify-nahe Gestaltung verwenden. Laden, Speichern, Fehler, Vorschau und Verlassensschutz vorsehen. Datenzugriff über Service, nicht direkt aus der UI.
5. **Einkäufe und Verkäufe anbinden:** Jeweils freigegebenen Vergabezeitpunkt verwenden; Nummer in Übersicht, Detailansicht, Suche und Verknüpfungen anbieten. Optionale Beschreibung und externe Referenz getrennt halten. Altvorgänge mit bereits vorhandener Nummer unverändert übernehmen; nur fehlende Nummern kontrolliert und deterministisch vergeben.
6. **Weitere Vorgänge:** Belegnummern und andere vorhandene Vorgangsarten nach Prüfung ihrer Fachregeln als eigenständig abnehmbare Anbindungen ergänzen. Keine erfundenen Entitäten allein für leere Einstellungszeilen schaffen.

## Abnahme

- Format `B 2026 01` wird wie angezeigt vergeben und bleibt nach einer Formatänderung erhalten.
- Einkauf und Verkauf haben getrennte Zähler; fremde Workspaces beeinflussen sie nicht.
- Zwei gleichzeitige Erstellungen erhalten verschiedene Nummern; erneutes Senden derselben Erstellung erzeugt keinen zweiten Vorgang.
- Jährlicher Neustart mit Jahresbestandteil funktioniert an der Zeitzonengrenze; Rückdatierung führt zu keiner Umnummerierung.
- Alte Nummern kollidieren auch nach Präfix-/Startwertänderung nicht mit neuen.
- Bestehende Referenzen, Exporte und berechtigte Suche bleiben nutzbar; Vorschau, Abbruch und bloßes Öffnen verändern den Zählstand nicht.

**Einordnung:** Gemeinsame Nummernkreise werden vor oder zusammen mit der Einkaufsnummer eingeführt. Die feste Formatempfehlung `#PO1` aus dem vorherigen Gespräch ist damit ersetzt. Der konkrete technische Implementierungsplan folgt der Bestandsaufnahme.
