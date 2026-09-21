# UI regression cleanup – Design specification

**Status:** Freigegeben

**Branch:** `juna/ui-regression-cleanup`

**Scope:** Erster von drei getrennten Pull Requests

## Ausgangslage

Nach der Überarbeitung des Einkaufsablaufs sind bei der manuellen Abnahme mehrere sichtbare Fehler und unnötig komplizierte Bedienmuster aufgefallen. Der erste Folge-Pull-Request behebt ausschließlich diese akuten Probleme. Die Zusammenführung von Artikel und Bestand samt Sidebar-Umbau folgt in einem zweiten Pull-Request. Adresssuche und frei gestaltbare Dokumentvorlagen folgen als eigene Integrationen in einem dritten Pull-Request.

Dieser Zuschnitt verhindert, dass kleine Regressionen mit zwei größeren Architekturänderungen vermischt werden. Er verändert weder das Einkaufsdatenmodell noch bestehende Aufbewahrungs- und Prüfprotokolle.

## Ziele

- Der Beta-Antrag zeigt im Ruhezustand nur die normale Aktion und während des Sendens genau einen verständlichen Ladezustand.
- Erfolgreiche und bereits vorhandene Bewerbungen werden in sauber aufgebauten, vollständig zweisprachigen Dialogen erklärt.
- Einkaufsbelege, Zusatzkosten, Verkäufer und Bezugsquellen lassen sich kompakt und ohne erklärende Redundanz bearbeiten.
- Einkaufslisten unterscheiden Laden, Leerstand und fehlende Treffer zuverlässig.
- Status, Beschreibung und Chronik bleiben auch bei langen oder erweiterten Einträgen übersichtlich.
- Der Einkaufsdruck enthält ausschließlich den fachlichen Beleginhalt; App-Navigation wird nicht mitgedruckt.

## Nicht Bestandteil dieses Pull-Requests

- Zusammenführung von Artikelstamm und Bestand
- Neue Sidebar-Struktur und eigener Menüpunkt „Artikel“
- Verschieben von Vinted Bot und Bildoptimierer nach „Werkzeuge“
- Eigene Bezugsquellen-Verwaltungsseite
- Externe Adresssuche oder automatische Befüllung von Ort und Postleitzahl
- Frei konfigurierbare Druck- und Dokumentvorlagen
- Discord-OAuth und automatische Beta-Tester-Rolle

## 1. Landingpage und Beta-Antrag

### Ladezustand

Der normale Buttoninhalt ist beim initialen Seitenaufruf sichtbar. Der Bereich „Bewerbung wird gesendet …“ bleibt durch eine explizite `[hidden]`-Regel vollständig ausgeblendet. Erst der tatsächliche Formularversand schaltet atomar auf den Ladezustand um, setzt `aria-busy="true"` und sperrt eine zweite Übermittlung. Erfolg, bekannter Antrag, Fehler und Timeout stellen den normalen Buttonzustand wieder her.

Die bestehende unbestimmte Fortschrittsanzeige bleibt erhalten, respektiert weiterhin `prefers-reduced-motion` und zeigt keine erfundene Prozentzahl.

### Ergebnisdialoge

Der Erfolgsdialog erhält eine stabile Textbreite, normale Satzabsätze und einen gesonderten, umbrechbaren E-Mail-Bereich. Überschrift, Nachricht, Hinweis und Aktion dürfen nicht optisch zu einem Fließtext zusammenlaufen.

Ein vom Backend als bereits vorhanden gemeldeter Antrag wird nicht mehr als technischer Sendefehler dargestellt. Stattdessen öffnet sich der neutrale Dialog „Bewerbung bereits vorhanden“. Er bestätigt ausschließlich, dass für die E-Mail-Adresse bereits eine Bewerbung vorliegt. Der konkrete interne Status – offen, angenommen oder abgelehnt – wird auf der öffentlichen Seite nicht offengelegt, damit fremde E-Mail-Adressen nicht abgefragt werden können.

### Zweisprachigkeit

Alle sichtbaren und für Screenreader bestimmten Texte des Beta-Formulars sowie beider Ergebnisdialoge werden paarweise in Deutsch und Englisch geführt. Der Sprachwechsel darf weder gemischte Texte noch leere Beschriftungen erzeugen. Technische Fehlermeldungen werden ebenfalls in eine verständliche Meldung der aktiven Sprache übersetzt.

## 2. Einkaufsbelege

Die Belegkarte bleibt in der rechten Einkaufsspalte, erhält aber eine klare vertikale Reihenfolge:

1. Überschrift „Belege“
2. Feld „Belegart“
3. Ablagefläche „Hier klicken, um eine Datei auszuwählen, oder Datei hier ablegen“
4. Liste vorgemerkter und gespeicherter Dateien

Der separate Button „Beleg hinzufügen“ entfällt. Klick, Tastaturaktivierung und Drag-and-drop der Ablagefläche verwenden weiterhin dasselbe verborgene Dateifeld und dieselben Dateiprüfungen.

Dateizeilen verwenden rechts ausschließlich zugänglich beschriftete Icon-Aktionen:

- Auge: „Beleg ansehen“, neutral mit grünem Hoverzustand
- Papierkorb: „Beleg entfernen“, neutral mit rotem Hoverzustand
- Erneut versuchen bleibt bei einem fehlgeschlagenen Upload als beschriftete Fehleraktion erhalten

Die Belegart steht nicht mehr eingequetscht in den Kopfaktionen der Karte. Auf kleinen Bildschirmen füllen Auswahl und Ablagefläche die Kartenbreite aus.

## 3. Einkaufsoberfläche beim Laden

Die kurze weiße Umrandung aller Einkaufskarten wird an ihrer tatsächlichen Ursache behoben. Zielzustand ist, dass Theme-Farben, Kartenhintergrund und Rahmen bereits im ersten sichtbaren Frame feststehen. Karten erhalten beim Seitenaufbau keine Rahmenfarb- oder Schattenanimation. Die bestehende reduzierte Seitenbewegung darf den Kartenrahmen nicht zwischen einem Browserstandard und dem Flipbase-Token überblenden.

Dieser Punkt braucht neben einem Regressionstest eine manuelle visuelle Prüfung im hellen und dunklen Theme, weil ein einzelner Zwischenframe in einem DOM-Test nicht belastbar erkannt wird.

## 4. Verkäuferdialog

Der Verkäuferdialog verwendet den gemeinsamen `ModalShellComponent` und die vorhandenen Shared-Felder. Er wird auf eine breitere Desktopvariante umgestellt, bleibt mobil jedoch einspaltig und vollständig scrollbar.

Verbindliche Anordnung:

- Art und Name
- bei Unternehmen die Kontaktperson
- Straße und Hausnummer über die gesamte Breite
- Adresszusatz über die gesamte Breite
- Postleitzahl und Ort nebeneinander
- Land/Region
- E-Mail und Telefon
- Website und Notiz, soweit bereits vorhanden

„Weitere Angaben können leer bleiben“ und der permanente Text „Bitte einen Namen angeben“ entfallen. Das gelbe Pflichtsternchen kennzeichnet den Namen. Die Speichern-Aktion bleibt deaktiviert, solange Pflichtfelder fehlen oder ein ausgefülltes Feld ungültig ist. Ungültige optionale Inhalte wie eine fehlerhafte E-Mail erhalten weiterhin eine konkrete Feldmeldung; nur die redundante Erklärung des leeren Pflichtfelds entfällt.

Der neue Formularvertrag gilt in diesem Pull-Request für die bearbeiteten Verkäufer- und Bezugsquellendialoge. Eine appweite Umstellung sämtlicher bestehender Formulare ist ein eigener Prüflauf und wird nicht verdeckt in diesen PR aufgenommen.

## 5. Bezugsquelle im Einkauf

Die sichtbare Bezeichnung lautet überall im Einkauf „Bezugsquelle“. „Bezugsquelle erstellen“ öffnet einen kleinen Dialog statt eines eingebetteten Formularblocks innerhalb der Einkaufskarte.

Der Dialog enthält ein Pflichtfeld „Name“, Abbrechen und „Bezugsquelle speichern“. Speichern ist bis zu einem nichtleeren, gültigen Namen deaktiviert. Nach erfolgreicher Anlage schließt der Dialog, lädt die Auswahlliste nach und wählt die neue Bezugsquelle unmittelbar aus. Fehler bleiben im Dialog sichtbar und verwerfen die Eingabe nicht.

Die spätere Verwaltungsseite „Bezugsquellen“ unter Einkauf ist Bestandteil des Sidebar- und Artikel-PRs, nicht dieses Fehlerpakets.

## 6. Artikelnamen in der Einkaufserfassung

Artikelbezeichnungen bleiben in jeder Positionszeile linksbündig – unabhängig davon, ob sie kurz oder lang sind. Flex- und Grid-Ausrichtung darf einen kurzen Namen nicht horizontal zentrieren. Menge, Stückpreis und Gesamt bleiben numerisch ausgerichtet.

## 7. Zusatzkosten

Der sichtbare Begriff „Anpassung“ wird im Einkaufsdialog durch „Zusatzausgabe“ beziehungsweise „Zusatzausgaben“ ersetzt. Der Editor zeigt pro Zeile nur:

- Art der Zusatzausgabe
- Betrag
- Papierkorb zum Entfernen

Die Fragen „Wer hat diese Kosten berechnet?“, die begleitende Steuererklärung, „Verteilung ändern“, Zielposition und sichtbare Verteilungshinweise entfallen aus diesem Dialog. Bestehende Steuerbehandlungen und Zuordnungen werden beim Bearbeiten unverändert erhalten. Neue Zusatzausgaben bleiben wie bisher steuerlich auf „Noch prüfen“ und werden bei normalen Einkäufen nach Warenwert, bei Mystery-Paketen nach Menge verteilt. Dieser PR entfernt keine Datenbankspalten und ändert keine abgeschlossenen Einkaufssnapshots.

Der Papierkorb erhält einen roten Hover- und Fokuszustand sowie einen eindeutigen zugänglichen Namen. Die Hinzufügen-Aktion heißt „Zusatzausgabe hinzufügen“. In der Kostenübersicht bleibt der zusammengefasste Abschnitt wie bereits vereinbart nur sichtbar, wenn mindestens eine solche Position existiert.

## 8. Einkaufsliste

### Lade- und Leerzustände

Beim ersten Laden und beim Workspacewechsel zeigt `DataTableComponent` ausschließlich den Ladezustand. Es erscheint nicht kurz „Keine Einkäufe vorhanden“. Daten des vorherigen Workspaces werden während des Wechsels ebenfalls nicht angezeigt.

Erst ein erfolgreich abgeschlossenes Laden darf zwischen diesen Zuständen unterscheiden:

- keine Datensätze: „Keine Einkäufe vorhanden“
- Filter oder Suche ohne Treffer: „Keine passenden Einkäufe“
- ausschließlich archivierte Datensätze: Möglichkeit „Archiv anzeigen“

### Lange Beschreibungen

Die Beschreibungsspalte besitzt eine begrenzte Breite und zeigt genau eine abgeschnittene Zeile. Der vollständige Text bleibt per Hover-Titel und für assistive Technik verfügbar. Lange Beschreibungen dürfen die übrigen Spalten weder zusammendrücken noch die Tabelle verbreitern.

## 9. Einkaufsstatus

Der kombinierte Status priorisiert den fachlich weitesten erreichten Zustand. Insbesondere muss ein finalisierter Einkauf „Abgeschlossen“ heißen, auch wenn sein Wareneingang zuvor „Angekommen“ war.

Zentrale Darstellung:

| Zustand                                   | Text          | Badge-Ton |
| ----------------------------------------- | ------------- | --------- |
| noch nicht bestellt                       | Entwurf       | caution   |
| bestellt                                  | Bestellt      | info      |
| teilweise eingetroffen                    | Teillieferung | caution   |
| vollständig eingetroffen, Erfassung offen | Angekommen    | success   |
| Erfassung finalisiert                     | Abgeschlossen | brand     |
| archiviert                                | Archiviert    | neutral   |
| storniert                                 | Storniert     | critical  |

„Angekommen“ und „Abgeschlossen“ bleiben getrennt: Der erste Status beschreibt die physische Lieferung, der zweite den Abschluss der Erfassung. Alle Einkaufsansichten verwenden dieselbe zentrale Statusabbildung.

## 10. Chronik

Kopfzeilen von normalen und aufklappbaren Chronikeinträgen verwenden dieselbe zweispaltige Struktur: Inhalt links, Uhrzeit rechts. Die Uhrzeit bleibt am rechten Kartenrand ausgerichtet und darf beim Vorhandensein des Aufklappschalters nicht nach links rutschen. Auf kleinen Bildschirmen darf der Text umbrechen, die Uhrzeit bleibt jedoch in ihrer eigenen Spalte.

Die bereits vereinfachten Änderungsdetails und die bestehende Begrenzung technischer Felder bleiben unverändert.

## 11. Einkaufsdruck

Die Druckroute erhält einen klar begrenzten Druckmodus:

- Sidebar, App-Header, mobile Navigation und sonstige App-Bedienelemente sind im Ausdruck verborgen.
- Zurück- und Drucken-Aktion bleiben nur am Bildschirm sichtbar.
- Der fachliche Einkaufsbeleg nutzt die druckbare Seitenbreite ohne Kartenradius oder App-Schatten.
- Seitensprünge vermeiden geteilte Tabellenzeilen und möglichst geteilte Abschnitte.
- `@page` und Druckfarben werden nur für diesen Druckkontext definiert und verändern keine anderen Druckansichten.

Browser können bei aktivierten Druck-Kopf- und Fußzeilen selbst URL, Datum und Seitennummer ergänzen. Webseiten dürfen diese Browseroption nicht zuverlässig abschalten. Die Bildschirmansicht weist deshalb knapp darauf hin: „Falls dein Browser URL und Datum ergänzt, deaktiviere im Druckdialog Kopf- und Fußzeilen.“ Frei gestaltbare Absender-, Empfänger-, Logo-, Steuer- und Footerbereiche folgen im Vorlagen-PR.

## Daten und Fehlerbehandlung

- Keine neue Datenbankmigration ist vorgesehen.
- Vorhandene Beleg-, Kosten-, Verkäufer- und Bezugsquellendaten bleiben unverändert kompatibel.
- Fehler in Dialogen bleiben am verantwortlichen Dialog sichtbar und schließen ihn nicht.
- Workspacewechsel zeigen niemals kurz Daten des vorherigen Workspaces.
- Lade- und Speichern-Aktionen verhindern Mehrfachübermittlungen.

## Barrierefreiheit

- Icon-only-Aktionen erhalten eindeutige `aria-label`-Texte und sichtbaren Tastaturfokus.
- Dialoge verwenden den gemeinsamen Fokusfang und geben den Fokus an den Auslöser zurück.
- Status wird immer durch Text und Farbe vermittelt.
- Tooltips beziehungsweise vollständige Beschreibungen sind nicht ausschließlich mit der Maus erreichbar.
- Der reduzierte Bewegungsmodus unterdrückt die Fortschrittsanimation und unnötige Einblendbewegungen.
- Geänderte Komponenten müssen ihre bestehenden AXE-Prüfungen weiterhin bestehen.

## Teststrategie

Jede Änderung beginnt mit einem Regressionstest, der am unveränderten Stand aus dem erwarteten Grund fehlschlägt.

- `scripts/landing-page.test.mjs`: initial verborgener Ladezustand, Zustandswechsel, Modalstruktur, DE/EN-Vollständigkeit und neutrale Duplikatantwort
- Angular-Komponententests der Belegkarte: Anordnung, Dropzone, Icon-Aktionen, zugängliche Namen und AXE
- Angular-Komponententests des Verkäuferdialogs: Modalgröße, Feldreihenfolge, Pflichtzustand und deaktiviertes Speichern
- Angular-Komponententests der Einkaufserfassung: Bezugsquellendialog und linksbündige Positionsnamen
- Angular-Komponententests des Kosteneditors: ausschließlich Art, Betrag und Entfernen; keine Steuer- oder Verteilungsfragen
- Einkaufslisten-Tests: Lade-/Leerzustände, Workspacewechsel und begrenzte Beschreibung
- Status-Unit-Tests: eindeutige Farbe und Priorität von „Abgeschlossen“
- Chronik-Angular-Test: identische Zeitspalte bei ein- und ausklappbaren Ereignissen
- Drucktests: App-Chrome im Druckkontext verborgen und fachlicher Inhalt erhalten
- Manuelle Browserabnahme: Desktop, Mobil, helles und dunkles Theme sowie Druckvorschau
- Abschluss: `npm run verify`

## Abnahmekriterien

Der Pull-Request ist fertig, wenn alle oben beschriebenen Zustände reproduzierbar funktionieren, die vollständige Projektprüfung grün ist und die manuelle Prüfung weder den dauerhaften Landing-Ladezustand noch falsche Leerzustände, weiße Kartenrahmen oder App-Navigation in der Druckvorschau zeigt.
