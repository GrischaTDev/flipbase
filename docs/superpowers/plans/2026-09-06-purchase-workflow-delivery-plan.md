# Einkaufsablauf: Vorgehensplan und Oberflächenentwurf

**Stand:** Planungsentwurf auf Master `371f054`. Beauftragt ist die Planung; fachliche Empfehlungen sind noch keine beschlossenen Buchungsregeln. Dieser Plan konkretisiert `2026-09-06-purchase-workflow-redesign.md` anhand des neuen Shopify-Screenshots. Für die spätere Umsetzung `superpowers:executing-plans` verwenden.

**Ziel:** Einen Gesamteinkauf mit Lieferant, Datum und Kaufbetrag speichern und bekannte oder neue Artikel sofort, teilweise oder später ergänzen. Gestaltung nach `docs/design/admin-ui-guidelines.md`, Angular 22, Tailwind und bestehendem Supabase-Modell.

## 1. Belegte Ausgangslage

- Screenshot: zentrierte Seite, breite Arbeitskarte links, schmalere Kosten- und Detailkarten rechts. Die Arbeitskarte enthält Lieferant/Versandziel und Produktsuche mit Import-/Scanneraktionen. Bei leeren Positionen bleibt die Seite ruhig und die Kostenübersicht sichtbar.
- Shopify dokumentiert Auswahl vorhandener Produkte/Varianten, CSV-Zuordnung über SKU/Barcode und Scannen. Der dokumentierte Bestellablauf beschreibt keine Neuanlage eines Produkts in dieser Auswahl. Das belegt keine universelle Einschränkung aller Shopify-Oberflächen. Quelle: https://help.shopify.com/en/manual/products/inventory/purchase-orders/creating-purchase-orders
- Flipbase besitzt bereits `Purchase`, `PurchaseLine`, Katalogbezüge, Einzel- und Mengenführung, getrennte Erfassungs-/Wareneingangszustände sowie Korrekturkomponenten.
- `purchase-line-editor.component.ts` bietet Katalogauswahl, direkte Einzelpositionen und CSV-Import. Mengenpositionen benötigen laut `PurchaseService.normalizePurchaseLines` einen Artikelstamm; Einzelpositionen haben Menge eins.
- Dieselbe Validierung erlaubt unbekannte Einzelkosten derzeit speziell für `mystery_pack`; andere Typen verlangen centgenaue Einzelpreise und Positionssummen. Der Typ beeinflusst außerdem Kostenverteilung. Bloßes Entfernen der Typauswahl wäre fachlich unvollständig.
- CSV verlangt derzeit `title`, versucht Katalogzuordnung über EAN oder Titel und kann sonst Einzelpositionen erzeugen. Leerer Preis wird außerhalb von Mystery über `Number('')` zu null Euro: diesen Pfad im Umbau ausdrücklich absichern.
- Vollständige Datenbank-/RPC- und Verkaufsprüfung steht als erstes Arbeitspaket noch aus. Aus diesem Frontendbefund wird keine fertige Migrationsstrategie abgeleitet.

## 2. Empfohlener Aufbau

Links: Lieferant/privater Verkäufer und Kaufdatum; darunter Suchzeile „Artikel suchen oder hinzufügen“, mit „Liste importieren“ und „Barcode scannen“. Anschließend die Positionstabelle. Eine sichtbare Aktion „Neuen Artikel erfassen“ und ein Hinweis „Artikel können später ergänzt werden“ ermöglichen Gebraucht- und Paketkäufe.

Rechts: Kaufbetrag, Nebenkosten und Gesamtkosten; daneben innerhalb dieser Karte klar ausgewiesen: zugeordnet und noch offen. Darunter Referenz, Beleg und interne Notiz. Versandziel und separate Transferseite entfallen gemäß Nutzerfestlegung. Tags, Zahlungsbedingungen und Fremdwährungen sind keine Voraussetzung dieses Umbaus.

Bestehenden zentrierten Seitenrahmen und Zweispaltenbaustein nutzen; Arbeits-/Nebenbereich ungefähr 2:1, auf schmalen Geräten untereinander. Kartenradien, Abstände, Schrift, Fokus und Bewegung gemäß vorhandener Designrichtlinie; Logo-Gelb `#fcc601`. Screenshotbreite ist keine universelle CSS-Vorgabe.

Die Suche öffnet einen fokussierten Auswahldialog mit Suche nach Name, SKU und Barcode, Mehrfachauswahl und explizitem „Hinzufügen“. Angezeigter Bestand dient nur der Information. Auswahl eines Produkts erzeugt eine neue Einkaufsposition: vorhandene physische Exemplare werden nicht erneut eingekauft oder umgebucht.

„Neuen Artikel erfassen“ öffnet einen kompakten Bereich innerhalb der Einkaufsseite. Mindestangaben: Bezeichnung, Einzel-/Mengenführung und passender Zustand; Barcode optional. Bei Mengenführung wird ein Artikelstamm benötigt. Umfangreiche Artikelpflege bleibt in der vorhandenen Artikelseite mit gesichertem Rücksprung und erhaltenem Einkaufsentwurf. Abbrechen darf keine verwaisten Artikel oder Bestände erzeugen.

## 3. Ansätze und Entscheidung

1. **Empfohlen: Katalogauswahl plus direkte Neuanlage.** Passt zu wiederkehrender Handelsware und unbekannten Einzelstücken. Verwendet vorhandene Wege, braucht aber eine gemeinsame Entwurfs- und Speicherlogik.
2. **Nur vorhandene Katalogprodukte wählen.** Einfachere Auswahl, zwingt beim Auspacken unbekannter Ware jedoch zu wiederholten Seitenwechseln und Voranlage.
3. **Alle Positionen frei erfassen.** Schneller Einstieg, aber schlechte Wiederverwendung sowie mehr Dubletten und uneindeutige Scannertreffer.

## 4. Arbeitspakete in Reihenfolge

### A — Fachregeln vollständig prüfen und festlegen

- [ ] Die nachfolgenden Nutzerfestlegungen aus Abschnitt 7 als verbindlichen Umfang berücksichtigen. Unbekannter Inhalt und unbekannte Einzelpreise unabhängig voneinander behandeln.

- [ ] `core/models/flipbase.models.ts`, `purchase-costing.models.ts`, `core/services/purchase.service.ts`, Katalog-/Lieferantenservices und Aufrufer für Verkauf, Wareneingang und Korrekturen verfolgen. Tatsächliche RPCs, deklarative Schema-Dateien und Datenbanktests zuordnen.
- [ ] Für `single`, `mystery_pack`, `lot`, `pallet` dokumentieren: Pflichtfelder, Speicherung, Preisregeln, Bestand, Abschluss, Kostenverteilung und Korrekturen. Demo und Server getrennt vergleichen.
- [ ] Szenarien prüfen: 300 Euro ohne Artikel; zwei Artikel später; Erfassung weiterhin offen; bekannte Einzelpreise; gemischte Preiskenntnis; Verkauf vor Abschluss; spätere Preisänderung und Retoure.
- [ ] Empfehlungen zur Entscheidung vorlegen: Lieferant im Entwurf optional; Abschluss der Erfassung ausdrücklich durch Nutzer; keine automatische Gleichverteilung während unvollständiger Erfassung; unbekannte Kosten/Marge sichtbar offen. Ob Verkauf mit offenen Kosten zulässig ist, muss anhand vorhandener Regeln entschieden werden.

**Ergebnis:** Abgenommene Zustands- und Kostenregeln mit konkreten Beispielen. Erfassung, Wareneingang und Kostenzuordnung bleiben getrennte Vorgänge.

### B — Modell und Verträge gezielt anpassen

- [ ] Automatische Einkaufsnummer gemäß Abschnitt 8 ergänzen: Vergabe beim ersten Speichern, eindeutige Nummer je Workspace, unveränderliche Zuordnung, kontrollierte Altdatenbelegung und sichere parallele Erstellung.

- [ ] Nach A festlegen, welche bestehenden Felder/RPCs weitergenutzt werden und wo eine Ergänzung nötig ist. Gesamtbetrag, bekannte Einzelpreise und zugeordnete Paketkosten ausdrücklich unterscheiden.
- [ ] Preisregeln vom sichtbaren Einkaufstyp lösen; Altdaten einschließlich gebuchter Kosten und Korrekturhistorie erhalten. Keine pauschale Umwandlung aller Alttypen in einen Typ.
- [ ] Für Neuanlage, Ergänzung und Speichern festlegen: atomare Übernahme, Schutz gegen Doppelklick/Wiederholung, parallele Änderungen, Workspace-Wechsel und Abbruch. Kataloganlage allein darf keinen Wareneingang buchen.
- [ ] Erst bei belegtem Bedarf deklarative Schemaänderung, erzeugte Migration, generierte Typen und passende Datenbanktests erstellen.

**Ergebnis:** Nachvollziehbarer Gesamteinkauf, der bei späterer Ergänzung keine bereits gebuchten Kosten still verändert. Beispiel: 300 Euro ohne Nebenkosten, davon ausdrücklich 100 Euro zugeordnet, ergibt 200 Euro offen.

### C — Erfassungsseite und Artikelauswahl

- [ ] Versalschrift und dekorative Farbmischung in Erfassung, Kosteneditor, Einkaufsdetails und Korrekturdialog beseitigen; Badge-Aufrufer prüfen. Normale Schreibweise und neutrale Farben nach der präzisierten globalen Gestaltungsrichtlinie. Gemeinsame Komponenten sowie weitere Adminbereiche auf dieselben Abweichungen erfassen und gezielt korrigieren; Kürzel und Nutzereingaben erhalten.
- [ ] Anordnung, Proportionen und Zustände bei gleicher Fenstergröße gegen Shopify vergleichen. Verkäuferdialog, Produktauswahl, Kostenkarte/-dialog, Positionstabelle und Chronik zusammen abnehmen. Zusätzliche Fachfunktionen folgen denselben Formen und Farben.

- [ ] Verkäuferauswahl mit Privatperson/Unternehmen, Kostenkarte mit Bearbeitungsdialog und Scannerzugang aus Abschnitt 7 direkt im Kernumfang umsetzen.

- [ ] `features/purchases/components/purchase-entry-form/` auf Lieferant/Datum, Positionen und rechte Zusammenfassung umstellen; vorhandene `pages/purchase-create/` weiterverwenden.
- [ ] Auswahl als eigene Feature-Komponente `components/purchase-product-picker/` planen: Katalog laden, Lade-/Fehler-/Nulltrefferzustände, Mehrfachauswahl, Suchabbruch und eindeutige Trefferzuordnung.
- [ ] `purchase-line-editor/` um direkte Neuanlage im Seitenkontext ergänzen; vorhandene Artikelpflege mit Rücksprung anbinden. Bekannte und unbekannte Preise entsprechend A/B darstellen.
- [ ] Leeren Einkauf und Teilstände speichern/wiederöffnen; Verlassensschutz auch bei geöffneten Auswahl-/Importbereichen gewährleisten.

**Ergebnis:** Der komplette Einkauf wird auf einer zentrierten Seite bearbeitet; der Auswahldialog dient ausschließlich der Artikelauswahl.

### D — Einkaufsübersicht und Details

- [ ] Einkaufsnummer als primären Linktext und Detailtitel verwenden, Beschreibung optional darunter; Suche nach Nummer unterstützen und Referenzen in Chronik/Artikelbezug sowie bestehenden Exporten abgleichen.

- [ ] Statusaktionen und Wareneingang innerhalb des Einkaufs sowie Chronik mit internen Kommentaren aus Abschnitt 7 ergänzen. Keine Transferseite und keine Versandzielspalte.

- [ ] `purchases.component.*`, `models/purchase-presentation.models.ts`, `utils/purchase-presentation.ts` und `pages/purchase-detail/` an denselben Ablauf anschließen.
- [ ] Standardspalten: Einkauf/Referenz, Lieferant, Datum, Gesamtbetrag, erfasste Artikel, Erfassungsstatus und Kostenstatus. Wareneingang bei Bedarf als eigene Spalte anbieten.
- [ ] „Typ“ erst nach B ersetzen; gespeicherte Spaltenpräferenzen kontrolliert migrieren. Bestehende Detailverknüpfungen erhalten.

### E — Import und Scanner auf derselben Positionslogik

- [ ] CSV-Import als getrennt prüfbares Paket ausbauen: Vorlage, Vorschau, Trefferzuordnung, Zeilenfehler, Mengen und Preisformat. Fehlender Preis bleibt unbekannt; echter Wert 0 bleibt ausdrücklich 0.
- [ ] Unbekannte/mehrdeutige Treffer zur Entscheidung anzeigen. Mengen nur nach bestätigter Regel zusammenfassen; gleiche GTIN darf unterschiedliche gebrauchte Exemplare nicht verschmelzen. Keine automatische Neuanlage allein aufgrund eines Scans.
- [ ] Hardware-Scanner im Tastaturmodus zuerst: bewusster Scanfokus, Abschlusszeichen, eindeutiger Treffer, Rückmeldung und Schutz gegen versehentliche Doppelverarbeitung. Wiederholtes Scannen und Mengensteigerung ausdrücklich festlegen.
- [ ] Kamerascanner anschließend anhand vorhandener Scannerbausteine ergänzen: Berechtigungsfehler, fehlende Kamera, Abbruch und manuelle Eingabe. Vorhandene Wiederverwendung prüfen, bevor eine Bibliothek hinzukommt.

**Reihenfolge:** Scanner gehört auf ausdrücklichen Nutzerwunsch bereits zur ersten nutzbaren Einkaufsfassung C/D; die dafür beschriebenen E-Schritte werden gemeinsam damit geliefert. Der CSV-Ausbau bleibt getrennt prüfbar. Alle Zugänge verwenden denselben geprüften Weg zum Hinzufügen von Positionen.

## 5. Abnahme und Veröffentlichung

- [ ] Die vollständige [visuelle Referenz- und Abnahmematrix](../../design/purchase-reference-acceptance.md) abarbeiten. Gleiche Viewports und belegte Messwerte verwenden; Umsetzung nicht allein anhand von Build/Funktion als referenzgetreu abnehmen.

- [ ] Fachtests für Teilaufnahme, offene Kosten, centgenaue Verteilung mit Rundungsrest, Überverteilung, nachträgliche Artikel, bereits verkaufte Exemplare, Retouren und Korrekturen.
- [ ] Bestehende Angular-Tests der Erfassung/Positionen/Details erweitern; E2E `purchase-entry.spec.ts`, `purchase-item-navigation.spec.ts` sowie Inventar-/Verkaufsabläufe prüfen.
- [ ] Auswahldialog mit Tastatur, Escape und Fokusrückgabe bedienen; mobile Breiten und WCAG-AA-Checks durchführen.
- [ ] Demo und Server für dieselben Beispieldaten vergleichen. Migration und Bestandswirkung nur mit passenden Datenbankprüfungen abnehmen.
- [ ] Richtlinien und AI-Changelog aktualisieren; getrennte prüfbare PRs für Kern und Import/Scanner. Veröffentlichung jeweils nach grünen Prüfungen über Merge-Commit.

## 6. Nächster konkreter Schritt

Die Einkaufsnummer aus Abschnitt 8 ist Bestandteil des Kernumfangs.

Arbeitspaket A durchführen und eine kurze Entscheidungstabelle mit belegtem Ist-Verhalten und empfohlenem Soll erstellen. Parallel fachlich unabhängigen Rückbau des Flohmarktmodus vorbereiten. Danach den ausführbaren technischen Plan mit den tatsächlich betroffenen RPCs, Schema-Dateien, Schnittstellen und Tests schreiben. Dieser Vorgehensplan erfindet keine Datenbankverträge vor deren Prüfung.

## 7. Konkretisierung aus sieben weiteren Screenshots und Nutzerfestlegungen

Diese Festlegungen ersetzen frühere optionale Vorschläge zu Versandziel, Transferseite und späterem Scanner. Die Screenshots belegen Verkäuferformular, Kostenbearbeitung, Produktauswahl, Positionskosten, Chronik und Übersicht. Ein Scanner-Dialog ist darin nicht abgebildet; seine genaue Gestaltung muss anhand der Live-Referenz geprüft werden.

### Flohmarktmodus vollständig zurückbauen

Der Nutzer benötigt diesen Modus nicht mehr. Eigenes erstes Umsetzungspaket: Einstieg, Dialog, Bargeldverwaltung, Schnellformular, zugehörige Sync-Hinweise, ausschließlich dafür verwendete Services, Modelle, Tests, Texte und Dokumentation entfernen. Gefundene Ausgangspunkte: `purchases.component.ts/.html`, `core/services/offline-sync.service.ts`, dessen Tests, `purchases-toast-actions.spec.ts` und `e2e/layout-overlays.spec.ts`. Alle Aufrufer und Speicherzugriffe vor Löschung prüfen. Allgemeine Offline-/PWA-Funktionen und historische Einkaufsquellen sind davon zu unterscheiden. Bereits gespeicherte Einkäufe erhalten; eventuell nur lokal wartende Erfassungen vor Abschalten über einen einmaligen Übernahme-/Exportweg sichern. Keine neue Schnellaufnahme als Ersatz einführen.

### Verkäufer statt ausschließlich Lieferanten

Oberflächenbegriff: „Verkäufer“, Auswahl „Verkäufer auswählen“ mit Suche, vorhandenen Einträgen und „Verkäufer erstellen“. Privatperson/Unternehmen unterscheiden; Plattform beziehungsweise Bezugsquelle separat halten (etwa TikTok). Verkäufer und tatsächlicher Paketabsender können verschieden sein; Tracking erfordert keine zweite vollständige Kontaktverwaltung.

Empfohlene Formularregeln: Bei Neuanlage Art und Anzeigename erforderlich. Privatperson: Name oder bekannter Profilname; Unternehmen: Firmenname und optional Kontaktperson. Gemeinsame optionale Felder: Land, strukturierte Anschrift, E-Mail, Telefon und Notiz. Plattform/Profilverweis optional; Website bei Unternehmen optional und bei Privatpersonen standardmäßig ausgeblendet. Entwurf kann ohne ausgewählten Verkäufer gespeichert werden. Pflichtangaben vor verbindlichem Abschluss werden in A festgelegt; diese UX-Empfehlungen treffen keine steuerliche Aussage.

Eigenständiger, scrollbar begrenzter Dialog wie in der Referenz, auf Mobilgeräten angepasst; keine verschachtelten Dialoge. Einkaufsentwurf beim Erstellen/Abbrechen erhalten. Bestehendes `Supplier`-Modell und `SuppliersService` haben bislang Name, allgemeine Kontaktangabe und Notizen; strukturierte Kontakte benötigen eine geprüfte Erweiterung. Altkontakte ohne bekannte Art nicht automatisch als Unternehmen klassifizieren.

### Kostenkarte und Positionen

Eigene rechte Karte mit Bearbeiten-Aktion. Kleiner Dialog für einzelne Kostenzeilen: Versand, Zoll, Gebühren, Versicherung, Sonstiges sowie separat gekennzeichneter Rabatt. Vorzeichen, zulässige Gesamtbeträge und Rundung prüfen. Kaufbetrag ohne Nebenkosten und Gesamtkosten inklusive Anpassungen eindeutig beschriften, damit Versand nicht doppelt eingerechnet wird.

Lieferanten-SKU bedeutet Artikelnummer des Verkäufers, zusätzlich zur eigenen SKU und zum Barcode. Zunächst nur optional in Positionsdetails; keine notwendige Standardspalte.

Steuersatz-Eingabe nicht ungeprüft aus Shopify übernehmen. Die Screenshots zeigen bei 2 × 12 Euro und 19 Prozent einen Gesamtbetrag von 28,56 Euro; obwohl die Karte „Steuern (inbegriffen)“ nennt, wird gegenüber 24 Euro sichtbar addiert. Unser Soll muss ausdrücklich festlegen, ob eingegebene Beträge brutto oder netto sind, und mit bestehenden Steuer-/Buchungsregeln übereinstimmen. Verkäuferart allein legt die steuerliche Behandlung nicht fest. Steuer-/DATEV-Seite bleibt außerhalb des UI-Umbaus; korrekte Weitergabe der Einkaufswerte gehört zur Abnahme.

### Status direkt im Einkauf

Neuanlage speichert zunächst einen Entwurf. Hauptaktion in der Detailansicht führt zu „Als bestellt markieren“. Danach „Als unterwegs markieren“ mit erforderlicher Trackingnummer; Versanddienstleister wird mit erfasst. API-Aktualisierung ist ein späterer Anschluss, keine zugesagte Live-Funktion. Direktabholung oder bereits gelieferter Einkauf braucht den direkten Übergang von bestellt zu angekommen ohne erfundene Trackingnummer. Bereits gekaufte Ware lässt sich nach dem initialen Entwurf zügig so nacherfassen.

Vorgesehene Anzeige: Entwurf → Bestellt → Unterwegs → Angekommen; Teillieferung und Stornierung als nachvollziehbare zusätzliche Fälle. Bei bekannten Positionen werden tatsächlich empfangene Mengen bestätigt. Mehrere Lieferungen und Abweichungen müssen ohne Doppelbuchung abbildbar sein. Unbekannte Gesamtmenge niemals als „0 von 0 vollständig erhalten“ darstellen.

Bei Paketen mit unbekanntem Inhalt bedeutet „Angekommen“ zunächst nur bestätigte Paketankunft. Danach prominente Aktion „Inhalt erfassen“. Erst die bestätigte Aufnahme tatsächlicher Artikel erzeugt deren Bestand. Erfassung bleibt bis zum ausdrücklichen Abschluss offen. Ein zugestelltes Trackingereignis darf weder unbekannte Artikel erzeugen noch automatisch den Wareneingang aller Positionen buchen.

### Bekannter und unbekannter Inhalt unter einem Ablauf

Zwei unabhängige Angaben ersetzen den technischen Typ als Einstieg: Ist der Inhalt bereits bekannt? Sind Einzelpreise bekannt oder nur der Gesamtkaufpreis? Auch vollständig bekannte Kleidungsstücke können gemeinsam für einen Paketpreis gekauft worden sein.

Bei bekannten Einzelpreisen summieren sich Positionen; ein abweichender Beleggesamtbetrag muss sichtbar abgeglichen werden. Bei einem Paketpreis bleibt der Gesamtbetrag am Einkauf erhalten, unabhängig von der später erfassten Artikelanzahl. Eine Paketbeschreibung ist keine verkaufbare Platzhalterposition. Anzahl und Zusammensetzung können bis zur Aufnahme unbekannt bleiben.

Pro Artikel drei unterschiedliche Werte führen: geschätzter Verkaufspreis, zugeordneter Anteil an Einkaufskosten und später tatsächlicher Verkaufserlös. Ein Schätzwert ist weder ein nachgewiesener Einzelkaufpreis noch ein Erlös. Bei zwei später erfassten Artikeln aus einem 300-Euro-Paket wird daher nicht automatisch je 150 Euro Einkaufspreis angenommen. Verteilungsmethode, Zeitpunkt und Umgang mit Verkauf vor Kostenabschluss werden in A anhand bestehender Regeln festgelegt. Auf Paketebene tatsächliche Erlöse und gesamte Paketkosten gegenüberstellen; bei verbleibenden Artikeln keinen abgeschlossenen Paketgewinn suggerieren.

### Chronik und Übersicht

Chronik unter der Arbeitskarte nach dem ersten Speichern: Erstellen, Statuswechsel, Trackingänderung, Wareneingang, Artikelergänzung und Kostenkorrektur mit Person und Zeit; internes Kommentarfeld darüber. Kommentartext ist kein Systemereignis. Nur berechtigte Mitglieder desselben Workspace können lesen/schreiben. Bestehende Record-History-Funktion auf Wiederverwendung prüfen; Kommentare nicht als gemeinsame Freitextnotiz speichern. Regeln für Kommentaränderung/-löschung getrennt von unveränderlichen Buchungsereignissen festlegen. Erwähnungen, Anhänge und Emoji-Werkzeuge sind keine Voraussetzung der ersten Fassung.

Übersicht mit Einkauf/Referenz, Verkäufer, Status, Datum, Gesamtbetrag und bei Bedarf erwarteter Ankunft, Empfangs-/Erfassungsstand und Kostenstatus. Öffnen per Zeilenklick plus zugänglichem Link für Tastatur; Auswahlcheckboxen und andere Aktionen dürfen nicht versehentlich navigieren. Versandziel und verknüpfter Transfer entfallen. Detailseite bietet jeweils passende Statusaktionen oben rechts.

### Zusätzliche Abnahmefälle

- [ ] Flohmarkt-Einstieg und ausschließlich zugehörige Funktion vollständig entfernt; bestehende Einkäufe und unübertragene Altaufnahmen berücksichtigt.
- [ ] Privatperson mit Profilname und Firma mit Kontaktperson ohne unnötige Pflichtfelder erstellbar; Entwurf bleibt bei Abbruch erhalten.
- [ ] Neuer Entwurf verändert keinen Bestand; bestellt/unterwegs erzeugt keinen Wareneingang.
- [ ] Unterwegs ohne Tracking abgewiesen; direkte Ankunft ohne Versand möglich; mehrfache Empfangsbestätigung erzeugt keinen Doppelbestand.
- [ ] Paket angekommen und Inhalt noch unbekannt; spätere Teilaufnahme, Scan und manuelle Neuanlage funktionieren im selben Einkauf.
- [ ] Kosten, Schätzwerte, Verteilung und tatsächlicher Erlös bleiben unterscheidbar; keine erfundene Null und keine stille Neubewertung verkaufter Artikel.
- [ ] Chronik, Kommentare, Workspace-Rechte, Tastaturbedienung und schmale Ansichten geprüft.

## 8. Automatische Einkaufsnummer

Nutzerfestlegung: Jeder gespeicherte Einkauf erhält eine kurze fortlaufende Nummer zur Zuordnung. Das gelesene `Purchase`-Frontendmodell besitzt bislang eine interne ID und einen Titel, aber keine eigene Einkaufsnummer. Gleichnamige Nummern anderer Funktionsbereiche sind kein Ersatz.

Aktualisierte Nutzerfestlegung: Kein festes PO-/P-Format. Die Einkaufsnummer verwendet einen konfigurierbaren Nummernkreis je Workspace. Unter Einstellungen erhält das gemeinsame Nummerierungssystem einen eigenen Tab „Nummernkreise“, mit getrennten Regeln für Einkäufe, Verkäufe und weitere tatsächlich nummerierte Vorgänge. Format, Anfangswert, Mindeststellen und Neustartregel sind konfigurierbar; Details im [Nummernkreisplan](2026-09-06-numbering-settings-plan.md). Ein Jahreswechsel setzt den Zähler nur bei ausdrücklich gewählter jährlicher Nummerierung zurück.

- Vergabe beim ersten erfolgreichen Speichern als Entwurf. Vorher heißt die Seite „Einkauf erstellen“. Neu öffnen, Statuswechsel, Umbenennen und Ergänzen behalten dieselbe Nummer.
- Nummer ist die primäre sichtbare Referenz in Tabelle, Detailüberschrift und Artikelbezug. Eine zusätzliche Beschreibung bleibt optional. Lange Pflichtnamen sind nicht mehr nötig; Validierung in Frontend und Backend entsprechend prüfen.
- Verkäuferseitige Bestell-/Rechnungsreferenz bleibt ein separates optionales Feld und wird nicht mit der internen Einkaufsnummer vermischt.
- Interne ID und bestehende URLs bleiben stabil. Serverseitige atomare Nummernvergabe und Eindeutigkeit je Workspace; niemals aus Listenlänge oder clientseitigem Maximum ableiten. Wiederholte Speicheranfrage darf denselben Einkauf nicht doppelt anlegen.
- Die fertig vergebene Nummer samt zugrunde liegendem Nummernkreis bleibt gespeichert. Formatänderungen betreffen ausschließlich neue Vorgänge; historische Nummern werden nicht beim Anzeigen aus aktuellen Einstellungen neu berechnet.
- Archivierung/Stornierung ändern die Nummer nicht; gelöschte Nummern werden nicht wiederverwendet. Aufsteigend bedeutet nicht zwingend lückenlos; keine Zusage einer buchhalterischen Belegnummernserie.
- Bestehende Einkäufe einmalig deterministisch nach Erstellungszeit und interner ID nummerieren; Nummern danach nicht anhand rückdatierter Kaufdaten neu sortieren. Nummernvergabe während Migration gegen parallele Neuanlagen absichern. Demo erhält denselben sichtbaren Ablauf in ihrem getrennten Datenbestand.
- Abnahme: parallele Erstellung ohne Dubletten, erneutes Speichern ohne Nummernwechsel, Workspace-Trennung, Altdaten ohne verlorene Links, Suche nach Nummer, Nummern über 99 hinaus sowie unveränderte externe Verkäuferreferenz.

## 9. Tabellenkopf, Statusauswahl und strukturierte Suche

Verbindliche Ergänzung zu Paket D: Die Reiter „Alle Einkäufe“, „Normale Einkäufe“ und „Mystery Box“ entfallen. Links im Tabellenkopf steht ein kompakter Dropdown mit „Alle“ und den tatsächlich unterstützten Statusansichten, etwa Entwurf, Bestellt, Unterwegs, Angekommen und Archiv. Archivierung bleibt fachlich von Lieferstatus getrennt; vor Umsetzung festlegen, ob „Alle“ archivierte Einkäufe einschließt. Gespeicherte Typfilter dürfen keine unsichtbare Einschränkung hinterlassen.

Direkt daneben füllt „Suchen und filtern“ den verfügbaren Platz. Freitext findet Einkaufsnummer, Beschreibung, Verkäufer und externe Referenz. Strukturierte Filter werden über Vorschläge aufgebaut, etwa „Verkäufer“ → „ist“ → vorhandenen Verkäufer auswählen. Die Auswahl verwendet die Verkäufer-ID, damit gleichnamige Kontakte unterscheidbar bleiben. Unterstützte Operatoren sichtbar anbieten; keine versteckte Interpretation beliebiger Suchtexte. Aktive Bedingungen erscheinen einzeln entfernbar. Status, Text und unterschiedliche Filterbedingungen wirken gemeinsam; mehrere Werte desselben Filters brauchen eine ausdrücklich definierte Verknüpfung.

Anzeigeoptionen stehen rechts. „Ansicht zurücksetzen“ wird als sichtbarer Text einheitlich an derselben Stelle angeboten und bei unveränderter Ansicht deaktiviert. Zurücksetzen stellt die festgelegte Ausgangsansicht für Status, Suche, Filter, Spaltenreihenfolge/-sichtbarkeit und Sortierung wieder her. Das Entfernen eines einzelnen Filters verändert das Spaltenlayout nicht. Gespeicherte persönliche Tabellenpräferenzen und ihre Rücksetzung müssen diesem Vertrag folgen. Frei benannte gespeicherte Ansichten sind dafür keine Voraussetzung.

Ist-Befund: `purchases.component.ts` filtert noch über `activeTab: 'all' | PurchaseType`. Der gemeinsame `table-column-menu` enthält bereits den Text „Ansicht zurücksetzen“, zeigt ihn aber abhängig von `viewModified`. Aufrufer, Platzierung und Zustände aller betroffenen Tabellen einschließlich Dashboard vergleichen. Ein Kreis-Pfeil kann auch Daten aktualisieren; Aktionen anhand ihres Handlers von einer Ansichts-Rücksetzung unterscheiden. Der konkrete vom Nutzer beobachtete Dashboard-Iconfall ist noch nicht zugeordnet.

Gemeinsame Tabellenbausteine sollen in Einkäufen, Verkäufen, Inventar und vorhandenen Dashboard-Tabellen dieselbe Geometrie, Typografie und Rücksetzbeschriftung verwenden; Filterfelder bleiben fachlich passend. Steuer-/DATEV-Seiten bleiben nachrangig.

Abnahme: keine Typ-Reiter; breites Suchfeld neben Statusauswahl; Verkäuferfilter mit gleichnamigen Kontakten; Suche nach Einkaufsnummer; kombinierte und einzeln entfernbare Filter; klarer Leerzustand; vollständige Ansichts-Rücksetzung auch nach Neuladen; Bereinigung alter Typpräferenzen; Tastaturbedienung und schmale Ansichten. Geöffnete Shopify-Status-/Filtermenüs vor Implementierung direkt prüfen: Die bisherige Live-Struktur bestätigt „Alle“, „Suchen und filtern“, „Anzeigeoptionen“ und „Ansicht zurücksetzen“, aber noch nicht den vollständigen Inhalt der geöffneten Menüs.
