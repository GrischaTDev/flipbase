# Artikel, Bestand und Einkauf: unabhängige Bewertung

Stand: 13. September 2026. Status: **Vorschlag zur gemeinsamen Festlegung**, keine
Freigabe einer steuerlichen Gesamtlösung und noch keine Umsetzung.

Geprüft wurden der importierte Gesprächsverlauf, amtliche Quellen und der aktuelle
Stand von `origin/master`, Commit `5383e71b7893bfb5aa252ed0e3be14ea71bf21a2`.
Die unten untersuchten Steuer-, Inventarservice- und Basisschema-Dateien sind
gegenüber dem früheren UI-Zweig bei `3586717` unverändert. Die weiteren in
`supabase/config.toml` eingetragenen Schemadateien wurden auf einschlägige
Überschreibungen und Schutzmechanismen durchsucht. Keine Produktionsdaten geprüft.

## Empfehlung

**Der Nutzer arbeitet mit Artikeln und Mengen. Das System ordnet die tatsächlich
vorhandenen Stücke ihren Einkäufen und späteren Verkäufen zu.**

Für Flipbases derzeitiges Geschäft empfehlen wir die interne Erfassung je Stück
als einheitlichen Standard. Das ist eine Produktentscheidung für gebrauchte Ware
mit unterschiedlichem Zustand, Preis und Herkunft, keine gesetzlich vorgeschriebene
Datenbankstruktur. Ein sichtbarer Schalter „Mengenartikel/Einzelstück“ ist dafür
nicht erforderlich. Auch regelbesteuerte Ware kann intern je Stück geführt werden.

| Begriff in der Oberfläche | Aufgabe                                                    | Beispiel                                           |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Artikel                   | Wiederverwendbare Beschreibung; anklickbar und bearbeitbar | Nintendo Switch OLED, weiß                         |
| Bestand                   | Tatsächlich vorhandene, reservierte und verfügbare Stücke  | Drei Geräte; eines davon mit Kratzern              |
| Einkauf                   | Verkäufer, Beleg, Mengen, Preise und Wareneingang          | Drei Geräte bei einem Verkäufer gekauft            |
| Verkauf                   | Tatsächlich abgegebene Stücke und festgehaltene Abrechnung | Das Gerät mit der internen Nummer FB-0042 verkauft |

Ein Stammartikel darf mehrere unterschiedliche Stücke zusammenfassen. Ein Unikat
braucht keinen vorgelagerten Besuch im Artikelstamm: Im Einkauf kann es direkt
beschrieben werden; ein passender Stammartikel entsteht beziehungsweise wird dort
verknüpft. Gemeinsame Daten lassen sich übernehmen, frühere Belegangaben bleiben
als historische Angaben erhalten.

## Wie sich das bedienen soll

1. Einkauf anlegen: Verkäufer auswählen, optionale Bezeichnung, Beleg ergänzen.
2. Artikel auswählen oder neu beschreiben; **Menge 3** und Preis eingeben.
   Keine drei gleichartigen Formulare und keine Auswahl eines Bestandsverfahrens.
3. Wareneingang bestätigen, auch teilweise. Drei eingegangene Geräte erzeugen
   genau drei interne Stückdatensätze mit eigenen Nummern. Ein wiederholter Klick
   erzeugt keine weiteren Stücke. Noch fehlende Kosten bleiben ausdrücklich offen.
4. Im Bestand zunächst „Nintendo Switch OLED – verfügbar: 3“ anzeigen.
   Aufklappen zeigt die Stücke. Zustand, eigene Fotos, Lagerort und vorhandene
   Herstellerseriennummer lassen sich dort ergänzen. Die interne Nummer wird
   automatisch vergeben; sie ist weder EAN noch Herstellerseriennummer.
5. Beim Verkauf Menge angeben. Wenn Stücke unterscheidbar sind, das tatsächlich
   abgegebene Stück kurz auswählen oder scannen. Einen historischen Einkauf nur
   rechnerisch nach FIFO zu wählen, obwohl ein anderes Gerät versendet wird,
   darf die individuelle Herkunft nicht ersetzen.

Der Artikelstamm erzeugt zunächst nur eine Beschreibung. Ein eigener
„Produkt erstellen“-Dialog im Bestand mit derselben Wirkung ist irreführend.
Ein Bestandszugang läuft über einen nachvollziehbaren Eingang; für vorhandenen
Altbestand braucht es einen ausdrücklich bezeichneten Eröffnungsbestand.

Besteuerung wird aus dem konkreten Erwerb und dem Unternehmensstatus vorbereitet,
nicht aus „gebraucht/neu“ oder der Menge abgeleitet. Eine unklare Beleglage muss
sichtbar bleiben. Dieselbe Produktbeschreibung darf Stücke mit unterschiedlichen
steuerlichen Voraussetzungen enthalten. Beim Verkauf wird die tatsächlich
angewendete Behandlung festgehalten.

## Was an der bisherigen Recherche belastbar ist

- Gemeinsame Produktbeschreibung, tatsächlicher Bestand und Geschäftsvorgänge
  brauchen getrennte Verantwortlichkeiten.
- Ein Einkauf mit Menge ist mit individueller Stückverwaltung vereinbar.
- Die Herkunft von Kosten und deren spätere Zuordnung müssen nachvollziehbar sein.
- Konvolute brauchen eine brauchbare Verteilungshilfe und eine erkennbare Grundlage.
- Automatische eindeutige Stücknummern, geschützte abgeschlossene Vorgänge und
  nachvollziehbare Exporte sind sinnvolle technische Ziele.

Die Herstellerbelege tragen diese Unterscheidung, aber keine pauschale Behauptung,
alle Programme hätten denselben Ablauf: Business Central ordnet die Verfolgung
einem Artikel zu; Shopify beschreibt sein Bestandsobjekt als Verbindung zwischen
Produktvariante und Mengen an Lagerorten. Daraus folgt weder eine Shopify-Garantie
für deutsche Steueraufzeichnungen noch die Pflicht, je physischem Stück ein neues
Shop-Produkt anzulegen. [Microsoft](https://learn.microsoft.com/de-de/dynamics365/business-central/inventory-how-setup-item-tracking),
[Shopify](https://shopify.dev/docs/api/admin-graphql/latest/objects/inventoryitem).

## Korrekturen an den bisherigen Schlussfolgerungen

### 1. Bestandsverfahren und Steuerart sind unabhängig

§ 25a knüpft unter anderem an Wiederverkäufer, Gegenstand und vorgelagerte Lieferung
an. „Gebraucht = differenzbesteuert“ und „Neuware = Mengenartikel“ sind keine
zulässigen Automatismen. Absatz 6 verlangt bestimmte Aufzeichnungen, aber keinen
Schalter, keine Herstellerseriennummer und kein bestimmtes Tabellenmodell.
[§ 25a UStG](https://www.gesetze-im-internet.de/ustg_1980/__25a.html).

Ein Mengenmodell ist deshalb nicht allein aufgrund seiner Bezeichnung unzulässig.
Entscheidend ist, ob es die notwendigen Werte und Zuordnungen trägt. Für Flipbases
unterschiedliche Gebrauchtstücke ist die interne Stückverwaltung die einfachere
verlässliche Grundlage. Ein späteres Mengenmodell wäre eine getrennte Erweiterung,
keine Voraussetzung für den jetzigen Ablauf.

### 2. Einkaufspreis und weitere Kosten richtig unterscheiden

Artikel 312 der Mehrwertsteuerrichtlinie erfasst beim Einkauf die Gegenleistung
an den Lieferer einschließlich der entsprechend berechneten Nebenkosten.
Vom Warenverkäufer als Teil seiner Lieferung berechneter Versand kann daher zum
steuerlichen Einkaufspreis gehören. Eine eigene Rechnung eines separat beauftragten
Transporteurs ist davon zu unterscheiden.
[Richtlinie 2006/112/EG, Artikel 312](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=celex%3A32006L0112).

Nachträgliche, nicht im Einkaufspreis enthaltene Reparaturkosten mindern die
§-25a-Bemessungsgrundlage nicht. Die bisher zitierte Stelle steht in **Absatz 8**,
nicht Absatz 10. [UStAE 25a.1 Absatz 8, amtliche Handbuchfassung 2024](https://ao.bundesfinanzministerium.de/usth/2024/A-Umsatzsteuergesetz/VI-Sonderregelungen/Paragraf-25a/ae-25a-1.html).

Für die Software folgt: Warenbetrag, Nebenkosten an den Warenverkäufer und weitere
Kosten mit Empfänger und Beleg getrennt erfassen. Daraus den steuerlichen
Einkaufspreis und eine getrennte betriebliche Kostenbetrachtung ableiten. Weder
„alles addieren“ noch „Versand immer ausschließen“ ist ausreichend.

### 3. Konvolute: sachgerechte Verteilung, keine gesetzliche Pflichtformel

Der BFH verlangt bei gemeinsamem Einkauf und Einzelverkauf grundsätzlich eine
sachgerechte Schätzung der Einkaufspreisanteile. Er schreibt keine bestimmte
Rechenformel vor. [BFH V R 37/15, Entscheidungsgründe II.2.c.aa](https://www.bundesfinanzhof.de/de/entscheidung/entscheidungen-online/detail/STRE201710156/).

Vorschlag: Bei gleichwertigen Stücken gleichmäßig verteilen, bei unterschiedlichen
Werten eine Gewichtung anhand dokumentierter geschätzter Marktwerte anbieten.
Manuelle begründete Anteile bleiben möglich. Beispiel: Gesamtkaufpreis 100 €,
geschätzte Werte 160/40 € ergeben Anteile 80/20 €. Die App speichert Methode,
Ausgangswerte, Restcent-Verteilung und Ergebnis. Die passende Methode hängt vom
konkreten Inhalt ab. Eine Gleichverteilung braucht ebenso eine nachvollziehbare
Grundlage; sie ist kein automatisch privilegierter Standard.

### 4. Die 750-Euro-Frage ist geklärt

Die gesetzliche Grenze betrifft die optionale **Gesamtdifferenz**, nicht die
Stückverwaltung. Das BMF-Schreiben vom 8. Juli 2025, Randnummer 12 Nummer 24 d–f,
ersetzt auch in UStAE 25a.1 Absätzen 12, 13 und 17 die 500 € durch 750 €.
Randnummer 13 regelt hier die Anwendung ab 1. Januar 2025.
[BMF-Schreiben, Seiten 10–11](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2025-07-08-aenderungen-UStAE.pdf?__blob=publicationFile&v=3).

Solange Flipbase ausschließlich die Einzeldifferenz abbildet, braucht der normale
Einkaufsdialog wegen dieser Grenze keine Warnung und keinen zusätzlichen Schalter.
Die Gesamtdifferenz wäre ein eigener zusammenhängender Abrechnungsablauf. Ihre
Erleichterungen dürfen nicht punktuell in die Einzeldifferenz eingebaut werden.

### 5. Technische Empfehlungen sind keine wörtlichen Gesetzespflichten

Eine eigene gespeicherte Spalte für die Bemessungsgrundlage ist ein guter
Buchungssnapshot, aber nicht als konkrete SQL-Struktur gesetzlich vorgeschrieben.
Maßgeblich sind vollständige, reproduzierbare Aufzeichnungen; Änderungen dürfen
den ursprünglichen Inhalt nicht unkenntlich machen.
[§ 146 Absatz 4 AO](https://www.gesetze-im-internet.de/ao_1977/__146.html).

Ebenso ist eine transaktional eindeutige, lesbare Stücknummer sinnvoll. Eine
angeblich gesetzlich geforderte lückenlose Inventarnummernfolge wurde im Verlauf
nicht belegt. Interne Stücknummer, Produkt-SKU und Rechnungsnummer sollten nicht
gleichgesetzt werden.

## Konkrete Codebefunde

### A. Reproduzierter Fehler: Verlustverrechnung trotz Einzeldifferenz

`src/app/core/services/tax-engine.service.ts:166` berechnet zuerst einzelne
Positionen. Bei gleicher Steuerart ruft Zeile 177 anschließend
`reconcileLineTotals` auf. Diese Funktion überschreibt unter anderem Steuer und
Bemessungsgrundlage der letzten Position mit der Differenz zu einem Ergebnis für
den gesamten Verkauf (`:219`, Felder ab `:242`).

| Position | Verkauf | Einkauf | Marge | Berechnete Umsatzsteuer | Erwartet bei Einzeldifferenz |
| -------- | ------: | ------: | ----: | ----------------------: | ---------------------------: |
| Stück A  |   120 € |   100 € |  20 € |                  3,19 € |                       3,19 € |
| Stück B  |    80 € |   100 € | −20 € |                 −3,19 € |                          0 € |
| Summe    |   200 € |   200 € |   0 € |                 **0 €** |                   **3,19 €** |

Der Bericht hatte das Verrechnungsverbot allein wegen `Math.max(0, grossMargin)`
für korrekt umgesetzt erklärt. Das nachgelagerte Überschreiben widerlegt dies.
Das Verbot der Verrechnung verschiedener Einzeldifferenzen steht in
[UStAE 25a.1 Absatz 11](https://ao.bundesfinanzministerium.de/usth/2024/A-Umsatzsteuergesetz/VI-Sonderregelungen/Paragraf-25a/ae-25a-1.html).

**Nachweis:** Die tatsächliche TypeScript-Serviceklasse wurde mit dem vorhandenen
TypeScript-Compiler transpiliert. Nur Imports und Klassen-Dekorator wurden für
den isolierten Lauf entfernt. Auf ihrem Prototyp wurden die unveränderten
Berechnungsmethoden mit zwei persistierten Positionen, Menge jeweils 1,
`tax_mode = diff_25a` und ohne Nebenkosten aufgerufen. Keine nachgebaute Steuerformel
anstelle der Implementierung getestet; keine Angular-Oberfläche oder Datenbank
ausgeführt. Der Befund betrifft den geprüften Berechnungspfad, nicht nachgewiesene
bereits abgegebene Steuererklärungen.

### B. Bruttomarge wird als Bemessungsgrundlage bezeichnet

`tax-engine.service.ts:100` setzt bei § 25a `tax_base` auf die positive Bruttomarge.
Bei 119 € Marge liefert der Code `tax_base = 119`, `vat_amount = 19`. Die
steuerliche Bemessungsgrundlage ist dagegen 100 €. Der Steuerbetrag für diesen
Einzelfall stimmt; die Bedeutung des Feldes ist falsch und bei Regelbesteuerung
anders. Das wurde ebenfalls über die tatsächliche Methode reproduziert.
Die Umsatzsteuer gehört nach [§ 25a Absatz 3 UStG](https://www.gesetze-im-internet.de/ustg_1980/__25a.html)
nicht zur Bemessungsgrundlage.

### C. Die Kostenkritik trifft den Kern

- `supabase/schemas/database.sql:3273`: Gesamtkaufpreis wird über identische
  Gewichte auf alle Stücke verteilt. Marktwertgewichtung des Warenbetrags fehlt.
- `database.sql:3436`: Waren- und Zusatzkosten werden zu Stückgesamtkosten addiert.
- `database.sql:3857`: Dieser Gesamtwert landet in `allocated_purchase_cost`.
- `tax-engine.service.ts:80`: Bei vorhandenen Verkaufspositionen wird deren
  `cost_of_goods_sold` übernommen; im alten Weg werden zum Artikelwert zusätzlich
  direkte Artikelkosten addiert. Eine eigenständige Größe für den steuerlichen
  §-25a-Einkaufspreis fehlt in dieser Berechnung.

Diese Trennung muss vor einer belastbaren Steuerabrechnung geklärt und umgesetzt
werden. Ein zusätzliches Prüfziel ist die pauschale Vorsteuerberechnung aus
Betriebskosten (`tax-engine.service.ts:103`): Ein Kostentyp allein ersetzt keine
Angabe zu Steuerbetrag, Beleg und Abzugsberechtigung.

### D. Die Löschkritik war zu pauschal

`database.sql:2704` enthält einen Triggerpfad, der **auch vor DELETE** ausgeführt
wird (`:2848`). Bei Bezug zu einem finalisierten Einkauf verweigert er direkten
Zugriff für normale Datenbankrollen. Die bloße DELETE-Policy beweist daher nicht,
dass solche Stücke frei gelöscht werden können.

Der gesonderte privilegierte Funktionsweg, Artikel ohne Einkaufsbezug und
`item_costs` verdienen gezielte Prüfungen. Das Fehlen einer eigenen
`workspace_id` auf einer Kindtabelle beweist für sich genommen ebenfalls keine
Mandantentrennungslücke; die Policies beziehen sich hier auf den Elternartikel.
Es wurde kein vollständiger Berechtigungs- oder GoBD-Audit durchgeführt.

### E. Stücknummern sind uneinheitlich, der alte Bericht verkürzt den Datenfluss

`inventory.service.ts:629` erzeugt eine lokale Vorschlagsnummer. Der echte Insert
sendet jedoch bei fehlender Benutzereingabe `sku = null` (`:677`). Auch die
Stückanlage beim Einkaufsabschluss (`database.sql:3866`) enthält keine SKU.
Die Aussage „die Nummer wird immer im Browser vergeben und gespeichert“ stimmt
deshalb nicht für alle Wege. Eine konsistente serverseitige Vergabe fehlt trotzdem;
die vorhandenen Nummernkreise unterstützen bisher Einkauf und Verkauf.

## Umsetzungsreihenfolge

1. **Rechenregeln absichern:** Den oben reproduzierten Mehrpositionsfehler beheben;
   Bruttomarge, Nettobemessungsgrundlage und Steuer trennen. Steuerlichen
   Einkaufspreis getrennt von weiteren Kosten führen. Vorsteuer belegspezifisch.
   Fälle mit verschiedenen Kosten und Steuerbehandlungen ausdrücklich prüfen.
2. **Einheitlichen Stückzugang bauen:** Mengen im Einkauf, Stückanlage einmalig
   beim tatsächlichen Eingang, Abschluss nur für Kostenzuordnung. Gemeinsamen
   Artikelbezug, eindeutige Nummern, Teilwareneingänge und Wiederholungen absichern.
   Unbekannte Kosten dürfen nicht als endgültige Nullkosten gebucht werden.
3. **Oberfläche ordnen:** Artikel bearbeitbar machen; Bestand gruppieren und bei
   Bedarf aufklappen. Neu erfassen direkt im Einkauf ermöglichen. Keine technische
   Tracking-Auswahl im Tagesgeschäft. Beim Verkauf das reale Stück zuordnen.
4. **Konvolute ergänzen:** Einen Dialog „Gesamtpreis verteilen“ mit Vorschau,
   sachgerechter Grundlage und Centkontrolle anbieten. Kosten beim Buchen fixieren;
   spätere Änderungen als nachvollziehbare Korrektur behandeln.
5. **Bestehende Daten übernehmen und Abschluss prüfen:** Alte Mengenbestände,
   Verkäufe und Herkunft erhalten. Fehlende Identität nicht nachträglich erfinden.
   Migration mit Mengen- und Kostensummen abgleichen; kein pauschales Löschen
   des bisherigen Mengenwegs. Export, Retouren und Korrekturen mit denselben
   festgehaltenen Buchungswerten prüfen.

Akzeptanzfälle: drei gleiche Geräte; Teilzugang 2+1; zwei gleich beschriebene Geräte
aus unterschiedlichen Einkäufen; unterschiedliche Erwerbsbesteuerung; Konvolut
mit ungleichen Werten; Warenverkäufer-Versand versus separate Fracht und Reparatur;
Verlust und Gewinn im selben Verkauf; Teilretoure; nachträgliche Kostenkorrektur;
parallele Eingaben ohne doppelte Nummern oder Bestände.

Die Prüfung rechtfertigt weder „nur zwei Zeilen ändern“ noch einen kompletten
Neubau. Bestehende Belege, Kostenverteilung in Cent, Herkunftsverknüpfungen und
Schutzfunktionen sind nutzbare Grundlagen. Zuerst wird der fachliche Ablauf
vereinheitlicht; daraus folgen gezielte Datenbank-, Service- und UI-Änderungen.

## Präzisierung: Navigation und Tabellen

Nachfrage vom 13. September 2026: Der Nutzer findet Artikelstamm und Inventar
schwer auseinanderzuhalten; Artikel lassen sich nicht bearbeiten, die Bestandsliste
enthält zu viele Herkunfts-, Kosten- und Verkaufsinformationen.

### Aktueller Befund

- `catalog.component.html` rendert den Artikeltitel als Text, ohne Detail-Link.
  `catalog.component.ts` bietet Erstellung und CSV-Import, aber keinen
  Bearbeitungsablauf. Der gemeinsame `product-dialog` ruft `createProduct` auf.
- `inventory.component.html:5` beschreibt ausdrücklich eine gemeinsame Ansicht
  für Artikel, Bestände, Kosten und Verkäufe. Der Button „Produkt erstellen“
  öffnet denselben Katalogdialog; er erzeugt allein noch keinen Bestand.
- `table-defaults.config.ts:66` aktiviert neben Auswahl und Aktionen acht
  Fachspalten: Artikel, Zustand, Bestand, Status, Herkunft, Kosten pro Stück,
  Bestandswert und Verkauf. Die Bestandsspalte enthält zusätzlich insgesamt,
  verfügbar, reserviert und verkauft. Herkunft und Verkäufe können jeweils
  mehrere Verweise enthalten.
- `stock-position-list.component.html:157` öffnet für Stückzeilen eine Detailseite.
  Für mengenbezogene Zeilen ist der Titel Text; dort lässt sich stattdessen
  „Herkunft und Kosten aufschlüsseln“ öffnen. Gleiche sichtbare Rollen verhalten
  sich somit unterschiedlich.

Das sind anhand von Templates und Datenfluss belegte Bedienprobleme. Es wurde
hier keine neue visuelle Browserabnahme durchgeführt.

### Herstellervergleich und Empfehlung

Shopify dokumentiert getrennt die bearbeitbaren Produktdaten und die Verwaltung
von Inventarmengen. Die Produktbearbeitung beginnt mit einem Klick auf den
Produktnamen. Diese Aufgabenaufteilung ist somit konkret belegt; unsere genaue
Navigation und Standardspalten sind eine Empfehlung für Flipbase.
[Shopify: Produktbearbeitung](https://help.shopify.com/de/manual/products/add-update-products),
[Shopify: Inventar](https://help.shopify.com/de/manual/products/inventory).

Vorschlag: **Ein gemeinsamer Hauptbereich „Artikel“ mit den Ansichten
„Alle Artikel“ und „Bestand“.** Einkäufe und Verkäufe bleiben eigene Vorgänge.

| Absicht                                                         | Einstieg                                   |
| --------------------------------------------------------------- | ------------------------------------------ |
| Name, Marke, Beschreibung oder gemeinsames Bild ändern          | Alle Artikel → Artikel öffnen → bearbeiten |
| Vorhandene und verfügbare Ware prüfen                           | Artikel → Bestand                          |
| Zustand, eigene Fotos oder Nummer eines konkreten Stücks prüfen | Bestand → Stücke aufklappen → Stück öffnen |
| Verkäufer und ursprünglichen Einkauf prüfen                     | Stück öffnen → verknüpften Einkauf öffnen  |
| Neu gekaufte Ware aufnehmen                                     | Einkäufe → Wareneingang                    |
| Verkauf, Erlös und Abrechnung prüfen                            | Verkäufe; auch vom Stück aus verlinkt      |

Ein Artikel öffnet aus beiden Listen dieselbe Artikeldetailseite; aus der
Bestandsansicht kann der Abschnitt „Bestand“ bereits aktiv sein. Ein konkretes
Stück bleibt als solches bezeichnet. Allgemeine Produktdaten und individuelle
Stückangaben dürfen beim Bearbeiten nicht unbemerkt gegenseitig überschrieben
werden. Historische Einkaufs- und Verkaufsbelege behalten ihre damaligen Angaben.

Die Bestandsliste zeigt standardmäßig nur **Artikel mit Bild, auf Lager,
verfügbar und reserviert**. Beispiel: auf Lager 3, verfügbar 2, reserviert 1.
„Auf Lager“ umfasst auch anwesende, noch zu prüfende oder gesperrte Stücke;
ausgelieferte Verkäufe gehören nicht dazu. Nicht jede Bestandsdifferenz ist eine
Reservierung. Zusätzliche Zustände werden beim Öffnen verständlich aufgeschlüsselt.
Auch Shopify unterscheidet physisch vorhandenen, verfügbaren, zugewiesenen und
nicht verfügbaren Bestand. [Inventarzustände](https://help.shopify.com/de/manual/products/inventory/fundamentals/inventory-states).

Bei einer Artikelgruppe mit unterschiedlichen Stückzuständen wird kein einzelner
Zustand für alle behauptet. Zustand, Stücknummer, Lagerort, individueller Preis
und eigene Fotos stehen bei den aufgeklappten Stücken. Herkunftsbelege,
Kostenaufteilung, Verkaufserlöse und vollständige Chronik gehören in die Details
oder eine gezielt gewählte Auswertung. Kostenwerte können als zusätzliche Spalten
eingeblendet werden, bleiben aber in der einfachen Standardansicht ausgeblendet.
Unterschiedliche Einkaufskosten nicht als vermeintlich einheitlichen Stückpreis
darstellen.

Ein verkaufsverhindernder Konflikt oder unklarer Bestand bleibt in der Liste als
kurzer verständlicher Hinweis sichtbar. Vollständige Fehlertexte und Historien
gehören in die Details. „Verkauft“ ist eine gesonderte historische Ansicht;
verkaufte Stücke bleiben auffindbar, werden aber nicht in aktuelle Bestände
eingerechnet. Suche, Filter und Rückweg bleiben beim Öffnen eines Artikels erhalten.

Die Umsetzung umfasst somit drei zusammenhängende Aufgaben: fehlende
Artikelbearbeitung ergänzen, Navigation nach Nutzeraufgaben ordnen und die
Bestandsliste fachlich reduzieren. Ein bloßes Umbenennen der beiden Seiten oder
kleinere Schrift löst die vorhandenen Überschneidungen nicht.
