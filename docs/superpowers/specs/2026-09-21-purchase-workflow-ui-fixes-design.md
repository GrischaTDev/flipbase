# Einkauf, Beta-Einstieg und Admin-Oberfläche – Designspezifikation

**Datum:** 2026-09-21  
**Status:** Fachlich freigegeben  
**Ziel:** Die gemeldeten Bedienungsfehler und Inkonsistenzen in Einkaufserfassung,
Einkaufsübersicht, Einkaufsdetail, Artikelstamm, Verkäuferverwaltung,
Beta-Einstieg und globalem Header in einem zusammenhängenden Update beheben.

## Ausgangslage

Die Einkaufserfassung wurde bereits auf Verkäufer, Quelle, Artikel und eine
Shopify-orientierte Kostenübersicht reduziert. Im praktischen Einsatz zeigen
sich jedoch mehrere Brüche:

- Preise und Statusänderungen erscheinen teilweise erst nach einem Neuladen.
- Leere Preiszustände, Tabellen und Auswahlflächen sind missverständlich.
- Nach dem Abschluss wechselt die Artikeltabelle zu Bestands- und
  Verkaufsauswertungen, obwohl sie weiterhin den Einkauf zeigen soll.
- Belege, Chronik und technisches Prüfprotokoll vermischen operative Arbeit mit
  interner Nachvollziehbarkeit.
- Artikel-, Verkäufer- und Headeransichten folgen nicht überall denselben
  Interaktionsregeln.
- Beta-Formular, Einladungsmail und Passwortseite haben uneinheitliche Texte,
  Ladezustände und Übersetzungen.

Die Änderung wird in einem neuen Branch und einem Pull Request umgesetzt, aber
in fachlich getrennten Arbeitspaketen entwickelt und geprüft.

## Leitentscheidungen

### Einheitlicher Einkauf statt Mystery-Sonderweg

Ein Mystery-Paket wird nicht über eine eigene Paketpreisverteilung erfasst.
Auch hier werden die bekannten oder geschätzten Artikel als normale
Einkaufspositionen angelegt und bepreist. Nutzer dürfen dafür selbst einen
Platzhalterartikel anlegen; Flipbase schreibt weder einen bestimmten
Platzhalternamen noch eine Sonderbehandlung dieses Artikels vor.

Die bestehende technische Unterstützung alter Mystery-Datensätze darf beim
Lesen erhalten bleiben. Neue Eingaben und die sichtbare Tabelle verwenden aber
denselben Ablauf wie jeder andere Einkauf.

### Eine Beschreibung, keine künstliche Bezeichnung

Die sichtbare Beschreibung lebt ausschließlich im Feld `notes`. Das technische
Legacy-Feld `title` bleibt nur erhalten, soweit bestehende Daten oder
Datenbankverträge es noch verlangen. Neue leere Beschreibungen werden nicht mit
„Einkauf“ befüllt. In Listen, Seitentiteln und Benachrichtigungen ist die
Einkaufsnummer die stabile Vorgangsbezeichnung.

### Operative Chronik statt Rohdaten

Die Chronik zeigt nur tatsächlich veränderte, fachlich verständliche Felder.
UUIDs, komplette DTOs, unveränderte Schnappschusswerte und technische
Containerbezeichnungen erscheinen dort nicht.

Das vollständige technische Prüfprotokoll bleibt für Nachvollziehbarkeit und
Export unter „Einstellungen → Daten & Protokolle“ erhalten. Der direkte
„Prüfbeleg“-Knopf wird aus Einkäufen entfernt, weil diese Rohansicht weder ein
Einkaufsbeleg noch eine verständliche Arbeitsansicht ist.

### Belege dürfen korrigiert werden

Belege lassen sich in jeder Einkaufsphase hinzufügen. Ein falsch zugeordneter
Beleg darf nach ausdrücklicher Bestätigung auch nach Abschluss entfernt werden.
Datei und aktiver Belegeintrag werden dabei gelöscht; die Chronik bewahrt
Zeitpunkt, Belegart und Dateiname der Entfernung.

Bei einem noch nicht gespeicherten Einkauf wird eine ausgewählte Datei lokal im
Formular vorgemerkt. Erst nach erfolgreicher Erstellung und vorhandener
Einkaufs-ID wird sie hochgeladen. Scheitert das Speichern, bleibt die Auswahl
für einen erneuten Versuch erhalten.

### Datenschutz beim erneuten Beta-Versuch

Das öffentliche Formular darf nicht verraten, ob eine fremde E-Mail-Adresse
abgelehnt, angenommen oder noch offen ist. Bei jeder bereits vorhandenen
Adresse erscheint deshalb neutral: „Für diese E-Mail liegt bereits eine
Bewerbung vor.“

Der konkrete Ablehnungsstatus wird ausschließlich in der bereits vorgesehenen
Ablehnungs-E-Mail mitgeteilt. Der auf `origin/master` inzwischen vorhandene
Ablehnungsablauf bleibt bestehen; lediglich die öffentliche 409-Antwort und
Darstellung werden wieder auf eine neutrale Aussage begrenzt.

## 1. Einkauf erstellen

### Kopfdaten

Die Reihenfolge und Verantwortung der Felder lautet:

1. Verkäufer als Pflichtfeld mit vorhandenen Verkäufern und Aktion
   „Verkäufer erstellen“.
2. Quelle als freiwillige Auswahl mit Aktion „Quelle erstellen“.
3. Artikelpositionen.
4. Rechts in „Einkaufsdetails“: Kaufdatum, Referenznummer und Beschreibung.

Kaufdatum ist mit dem heutigen Datum vorbelegt und steht rechts oberhalb der
Referenznummer. Verkäuferart, Verkäuferadresse, Plattform-Benutzername,
Angebotslink und Plattform-Bestellnummer werden nicht im Einkauf erfasst. Die
Verkäuferstammdaten werden bei Auswahl im Hintergrund als historischer Snapshot
übernommen.

Die Oberfläche verwendet keine Zusätze wie „optional“ oder „(optional)“.
Pflichtfelder tragen das gelbe Flipbase-Sternchen.

### Positionseditor

- Artikelbezeichnungen sind linksbündig.
- Ein leerer Stückpreis zeigt ein leeres Eingabefeld.
- Solange kein Preis vorhanden ist, zeigt die Positionssumme `0,00 €`.
- Jede Preis- oder Mengenänderung berechnet Positionssumme, Warenwert und
  Gesamtbetrag unmittelbar neu.
- Die Berechnung bleibt centgenau und verwendet keine gerundeten
  Zwischenwerte als neue Datenquelle.
- „Mängelnotiz“ wird in der Produkterstellung und zugehörigen Anzeige zu
  „Notiz“.

Der Artikelwähler behandelt die komplette Ergebniszeile als Auswahlfläche. Ein
Klick auf Vorschaubild, Name oder freien Zeilenraum schaltet dieselbe Auswahl
wie die Checkbox. Ein direkter Checkbox-Klick darf nicht doppelt schalten.
Ausgewählte Checkboxen verwenden standardmäßig das Markengelb `#fcc601`.

Die Aktion „Artikel suchen oder hinzufügen“ belegt die gesamte verbleibende
Breite bis zu den Import- und Scan-Aktionen. Hover-, Fokus- und Klickfläche sind
identisch groß.

### Kostenübersicht

Die Kostenübersicht ist immer vollständig sichtbar:

- Bestellte Artikel mit Artikelanzahl
- Warenwert
- vorhandene Zusatzkosten als einzelne Zeilen
- vorhandener Rabatt beziehungsweise sonstige Korrektur
- Gesamt

Ohne Artikel stehen dort `0 Artikel`, `0,00 €` Warenwert und `0,00 €` Gesamt.
Eine leere Null-Zeile für Anpassungen wird nicht gerendert. Der allgemeine
Begriff lautet „Sonstiges“, sofern für eine Kostenposition keine genauere Art
oder Beschreibung vorhanden ist. Versandkosten bleiben ausdrücklich als
„Versandkosten“ sichtbar.

## 2. Einkaufsübersicht

### Leerzustände

Die Seite unterscheidet den Datenbestand vom gefilterten Ergebnis:

- Keine Einkäufe im Workspace: „Noch keine Einkäufe“ und
  „Erstelle deinen ersten Einkauf.“
- Einkäufe vorhanden, aber Suche oder Filter ohne Treffer:
  „Keine passenden Einkäufe“ und „Ändere die Suche oder die Filter.“

Der primäre Anlegen-Knopf erscheint beim echten Leerzustand. Beim gefilterten
Leerzustand wird stattdessen das Zurücksetzen von Suche und Filtern angeboten.

### Spalten und Bezeichnungen

Die Standardreihenfolge ist:

1. Einkauf
2. Kaufdatum
3. Verkäufer
4. Status
5. Erhalten
6. Beschreibung
7. Gesamt

„Bezeichnung“ wird in der Oberfläche zu „Beschreibung“. Eine leere Beschreibung
bleibt leer. Die Spalte „Einkauf“ zeigt die generierte Einkaufsnummer.

Benachrichtigungen verwenden ebenfalls die Einkaufsnummer, beispielsweise
„Neuer Einkauf #2026-123“, und verlinken direkt auf den Datensatz.

### Status und Live-Aktualisierung

Die Badge-Töne werden sichtbar getrennt:

- Entwurf: neutral/grau
- Bestellt: Information/blau
- Teillieferung: Warnung/orange
- Angekommen: Erfolg/grün
- Storniert: kritisch/rot

Nach Speichern von Preisen, Ändern von Zusatzkosten, Buchen des Wareneingangs,
Statuswechsel und Abschluss werden Listen- und Detailzustand aus derselben
bestätigten Serverantwort oder einem gemeinsamen Refresh aktualisiert. Eine
Navigation zurück zur Übersicht darf keinen veralteten Kostenstatus zeigen.

## 3. Einkaufsdetail und Lebenszyklus

### Kopfaktionen und Hinweise

Ein Entwurf zeigt weder „Einkauf drucken“ noch „Prüfbeleg“. „Einkauf drucken“
wird erst ab dem Status „Bestellt“ angeboten. „Prüfbeleg“ wird in der
Einkaufsansicht in allen Phasen entfernt.

Sind Einkaufspreise offen, erscheint ein kompakter Warnhinweis unter den
Kopfaktionen und oberhalb des zweispaltigen Inhalts. Er erklärt, warum Ankunft,
Bestandserzeugung und Abschluss noch nicht möglich sind. Ohne offene Preise
wird kein Platzhalterhinweis gerendert.

### Stabile Artikeltabelle

Die Tabelle ändert ihre fachliche Bedeutung nach dem Abschluss nicht. Sie zeigt
in jeder Phase:

- Artikel
- Bestellt
- Erhalten
- Stückpreis
- Gesamt

Kostenanteil pro Stück, zusätzlicher Kostenanteil, verfügbare Menge, verkaufte
Menge und Verkaufsergebnisse werden aus dieser Einkaufstabelle entfernt. Diese
Werte gehören in Kostenübersicht, Bestand oder Verkauf.

### Chronik

Änderungen werden feldweise verglichen und lokalisiert. Beispiele:

- „Menge: von 2 auf 3“
- „Stückpreis: von 12,00 € auf 14,00 €“
- „Versandstatus: von Bestellt auf Angekommen“
- „Artikel hinzugefügt: Nike Air Max“
- „Beleg entfernt: rechnung.pdf“

IDs und technische Felder werden ausgeblendet. Geldbeträge, Daten, Statuswerte,
Verkäufer, Quellen und Artikelreferenzen erhalten verständliche Darstellungen.
Unveränderte Werte und reine Erstellungsschnappschüsse erzeugen keine lange
Detailansicht.

### Belege

Die Belegkachel steht rechts unter der Sendungsverfolgung – sowohl in der
normalen Detailansicht als auch beim Bearbeiten. Sie bietet:

- Klick zur Dateiauswahl
- Drag-and-drop
- sichtbaren Uploadzustand
- Vorschau
- Entfernen mit Bestätigung
- Hinzufügen und Entfernen auch nach Abschluss

Für neue Einkäufe zeigt die Kachel lokal vorgemerkte Dateien mit der Aktion zum
Entfernen. Nach erfolgreichem Anlegen werden diese nacheinander hochgeladen.
Ein teilweise fehlgeschlagener Upload lässt den Einkauf bestehen und zeigt je
Datei einen verständlichen Wiederholungsfehler.

## 4. Artikelübersicht

Die Desktoptabelle verwendet standardmäßig:

- Artikel mit Bild und linksbündigem Namen
- Kategorie als eigene Spalte
- Marke als eigene Spalte
- EAN
- Verfügbar

Die Spalte „Webshop / Intern“ entfällt. Modell bleibt im Detail und in der
Suche, aber nicht in der Standardtabelle. Eine fehlende Marke wird als
„Unbekannt“ dargestellt.

Gespeicherte Spaltenpräferenzen werden anhand der neuen gültigen
Spaltendefinition normalisiert: `store` wird entfernt, neue Spalten werden mit
ihren Vorgabewerten ergänzt, und die übrige Nutzerreihenfolge bleibt erhalten.
Die mobile Darstellung zeigt Kategorie und Marke kompakt ohne die entfernte
Webshop-Angabe.

## 5. Verkäuferübersicht

Die gesamte Tabellenzeile öffnet den Bearbeitungsdialog. Ausgenommen sind
Textauswahl sowie direkte Interaktionen mit Links, Eingaben und
Aktionsschaltflächen. Die Zeile ist per Tastatur erreichbar und reagiert auf
Enter beziehungsweise Leertaste.

Aktionsfarben:

- Bearbeiten: grün
- Archivieren: orange
- Wiederherstellen: grün
- mögliche echte Löschaktion: rot

Die Farben gelten für Hover und Fokus, nicht nur für das Symbol. Jede Aktion
behält eine eindeutige zugängliche Beschriftung.

## 6. Beta-Formular, E-Mail und Passwortseite

### Absenden der Bewerbung

Während der Anfrage ersetzt ein schmaler unbestimmter Ladebalken den normalen
Buttoninhalt. Er trägt den Text „Bewerbung wird gesendet …“, verhindert
Mehrfachübermittlung und wird über `role="status"` beziehungsweise
`aria-live` angekündigt. Ein Prozentwert wird nicht simuliert, da `fetch` keinen
verwertbaren Serverfortschritt liefert.

Bei einer bereits vorhandenen Adresse zeigt die Landingpage einen neutralen
Hinweis mit orangem Warndreieck. Der Endpunkt darf im Response weder Status
noch Entscheidung offenlegen.

### Annahme-E-Mail

Betreff: „Deine Bewerbung zur Flipbase Beta wurde angenommen“  
Überschrift: „Deine Bewerbung wurde angenommen“

Betreff, HTML- und Textfassung verwenden durchgängig die Du-Ansprache. Die von
Supabase Auth verwendete Einladungsvorlage und die öffentliche Kopie werden
gemeinsam angepasst. Absendername und Kopfzeilen werden ohne sichtbar werdende
Escape-Zeichen erzeugt und mit Umlauten, Anführungszeichen und Sonderzeichen
getestet.

### Passwort festlegen

Das Template verwendet dieselben vorhandenen Übersetzungsschlüssel wie die
deutschen und englischen Übersetzungsobjekte. Insbesondere werden Passwort,
Passwortbestätigung, Mindestlänge, Stärke sowie Übereinstimmung korrekt
zugeordnet. Die AGB-Checkbox nutzt den globalen gelben Checkboxstil.

## 7. Globaler Header und gemeinsame UI-Regeln

Sidebar-Kopf und Inhaltsheader erhalten dieselbe feste Höhe und dieselbe
vertikale Lage der Trennlinie.

Glocke und Designumschalter werden gleich große quadratische Icon-Buttons.
Sprachumschalter und Benutzerknopf erhalten dieselbe Höhe, Rundung, Randstärke,
Hover- und Fokusdarstellung. Der Workspace-Schalter bleibt breiter, folgt aber
denselben Höhen- und Oberflächenwerten.

Die mobile Anordnung bleibt umbrechbar und darf weder Menütaste noch wichtige
Aktionen verdecken.

Das vollständige Flipbase-Logo in der Sidebar bleibt ein Link auf
`/dashboard`. Ein Regressionstest sichert das Verhalten.

## Zustands- und Datenfluss

### Preise

Der Positionseditor emittiert bei jeder gültigen Eingabe einen normalisierten
Positionsentwurf. Das Elternformular leitet daraus Warenwert und Gesamtbetrag
als Signals ab. Die Kostenübersicht liest diese abgeleiteten Werte direkt und
nicht aus einem erst später gespeicherten Einkaufsobjekt.

Nach einer Servermutation wird die bestätigte Einkaufsantwort inklusive
Positionen und Kosten in Listen- und Detailzustand übernommen. Liefert eine
Mutation nicht alle benötigten Beziehungen, läuft genau ein gemeinsamer
gezielter Refresh für Einkauf, Positionen und betroffene Bestandsdaten.

### Belege

Gespeicherter Einkauf:

1. Datei lokal validieren.
2. Datei in den privaten Bucket laden.
3. Metadatensatz anlegen.
4. Lokale Liste aktualisieren.

Neuer Einkauf:

1. Datei lokal validieren und vormerken.
2. Einkauf anlegen.
3. Mit der neuen Einkaufs-ID hochladen.
4. Erfolg oder Fehler pro Datei anzeigen.

Entfernung:

1. Nutzerbestätigung einholen.
2. Metadatensatz löschen; der Datenbanktrigger protokolliert die Entfernung.
3. Storage-Datei löschen.
4. Lokale Liste sofort aktualisieren.

## Fehlerbehandlung

- Preis- und Mengenfehler bleiben an der betroffenen Position sichtbar.
- Ein gescheiterter Belegupload verwirft weder den Einkauf noch andere
  erfolgreiche Uploads.
- Ein fehlgeschlagener Listenrefresh lässt den bestätigten lokalen Stand stehen
  und bietet einen erneuten Abruf an.
- Beta-Anfragen erhalten weiterhin Timeout und Drosselung; der Ladebalken wird
  in jedem Erfolgs- und Fehlerpfad beendet.
- Öffentliche Beta-Fehlertexte geben keine internen Entscheidungen preis.

## Prüfstrategie

### Komponenten- und Logiktests

- leere und live berechnete Positionspreise
- vollständige Auswahlfläche im Artikelwähler
- gelbe Checkboxen und korrekte Kontrollzustände
- Kostenübersicht mit null, Zusatzkosten und ohne leere Sonstiges-Zeile
- dynamische Einkaufs-Leerzustände und neue Spaltenreihenfolge
- eindeutige Statusfarben
- Listenaktualisierung nach Preis-, Ankunfts- und Abschlussmutation
- unveränderte Artikeltabelle vor und nach Abschluss
- verständliche Chronikvergleiche ohne IDs und unveränderte Felder
- Belegvormerkung, Drag-and-drop, Uploadfehler und Entfernung nach Abschluss
- Artikelspalten einschließlich Migration gespeicherter Präferenzen
- vollständig klickbare Verkäuferzeilen ohne doppelte Aktionsauslösung
- Beta-Ladezustand und neutrale Duplikatantwort
- Einladungsbetreff, E-Mail-Inhalt und sichere Kopfzeilen
- deutsche Passworttexte und gelbe AGB-Checkbox
- identische Headerhöhen und Logo-Ziel

### Integrations- und Bauprüfungen

- betroffene Angular- und DOM-Tests
- Landingpage- und Edge-Function-Tests
- Datenbanktests, falls die Beleg-Löschregel oder Beta-Antwort eine
  Schema-/Policy-Anpassung benötigt
- Formatierung und Lint der geänderten Dateien
- Angular-Produktionsbau zur Vorlagenprüfung
- abschließender vollständiger `npm run verify`
- Browserprüfung der Kernwege: Einkauf anlegen, Preise live ändern,
  Artikel auswählen, Beleg vormerken/hochladen/entfernen, Status bis Abschluss,
  Rückkehr zur Übersicht sowie Beta-Bewerbung und Passwortseite

## Zuordnung der gemeldeten Punkte

| Punkt | Umsetzung                                                                       |
| ----- | ------------------------------------------------------------------------------- |
| 1     | Leerer Stückpreis, Positionsgesamt `0,00 €`                                     |
| 2     | Artikelnamen linksbündig                                                        |
| 3     | Live-Aktualisierung der Kostenübersicht                                         |
| 4     | Ganze Auswahlzeile anklickbar, gelbe Checkboxen                                 |
| 5     | „Mängelnotiz“ wird „Notiz“                                                      |
| 6     | Eigene Spalten Kategorie und Marke, Webshop-Spalte entfällt                     |
| 7     | Neutraler sicherer Duplikathinweis mit orangem Warndreieck                      |
| 8     | Unbestimmter Ladebalken „Bewerbung wird gesendet …“                             |
| 9     | Neuer Annahme-Betreff und keine sichtbaren Escape-Zeichen                       |
| 10    | Korrekte Passwortübersetzungen und gelbe AGB-Checkbox                           |
| 11    | Getrennter echter und gefilterter Leerzustand                                   |
| 12    | Volle Breite der Artikel-hinzufügen-Aktion                                      |
| 13    | Kaufdatum in den rechten Einkaufsdetails                                        |
| 14    | Keine automatische Beschreibung, Einkaufsnummer in Meldungen, neue Spaltenfolge |
| 15    | Keine Null-Zeile; „Sonstiges“ nur bei vorhandener Position                      |
| 16    | Druckaktionen im Entwurf ausblenden; Preiswarnung in den Inhalt verschieben     |
| 17    | Eindeutig getrennte Statusfarben                                                |
| 18    | Feldgenaue, verständliche Chronik                                               |
| 19    | Prüfbeleg aus Einkauf entfernen, internes Prüfprotokoll behalten                |
| 20    | Einkaufsübersicht nach Mutationen ohne Neuladen aktuell                         |
| 21    | Stabile Artikeltabelle sowie Belege rechts, früh hochladbar und löschbar        |
| 22    | Verkäuferzeile anklickbar und farbige Aktionen                                  |
| 23    | Header-Trennlinien auf gleicher Höhe                                            |
| 24    | Einheitliche Form und Größe der Kopfaktionen                                    |

## Nicht Bestandteil

- Ein neues Dokumentenmanagement- oder revisionssicheres Archivsystem
- Eine neue Bestands- oder Verkaufsauswertung innerhalb des Einkaufs
- Modell als zusätzliche Standardspalte der Artikelübersicht
- Eine neue globale Navigationsstruktur
- Eine echte prozentuale Fortschrittsmessung der Beta-Anfrage
