# Vintz: Finanzen und Exporte im Vergleich mit Flipbase

Untersuchung von Juna am 18.10.2026. Auftrag: Finanzen und Exporte analysieren,
mit Flipbase vergleichen, danach stoppen. Die Empfehlungen zu Bestellungen und
Versand bleiben als Richtung festgehalten; keine Umsetzung oder Buchung freigegeben.

## Ergebnis und Grenzen

Vintz bietet einen verständlichen gemeinsamen Arbeitsbereich für Transaktionen,
Kosten, Berichte, Rechnungen und Firmen. Besonders nützlich sind Aufgabenhinweise
für fehlende Angaben, eine Importvorschau und die Unterscheidung zwischen
Belegarchivierung und Kostenbuchung. Flipbase hat bereits weitergehende Bausteine
für zentrale Verkäufe, Ausgaben, Bankdateien, DATEV und ein Belegarchiv. Deren
Vorhandensein bedeutet aber noch keinen vollständigen Finanz- oder Vinted-Import.

| Belegart             | Umfang                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vintz live           | Ein Cloudkonto; alle fünf Finanzbereiche, Importvorschau, leere Kosten-/Artikelformulare und Einstellungen ohne Firma gelesen. Zwei erkannte Verkäufe, null gespeicherte Finanzpositionen, keine Firma, keine ausgestellten Rechnungen. |
| Tatsächliche Dateien | Transaktions-CSV für Oktober und Rechnungsliste für September heruntergeladen: jeweils nur Überschriften, keine Geschäftsdatenzeilen.                                                                                                   |
| Vintz Frontend       | Geladene Module zu Beträgen, Statusprüfung, Import, Formularen, Firmen, Berichten, Kosten-PDF und Exportlinks untersucht. Kein Zugriff auf Serverimplementierung.                                                                       |
| Flipbase             | Quellen bei `e3ef736370640125c1abddcaf82de6079205d9fa`; keine neue produktive Browserprüfung und keine Testläufe.                                                                                                                       |
| Nicht ausgeführt     | Übernehmen/Hinzufügen einer Position, Kosten buchen, Regel speichern, Firma anlegen/zuordnen, Beleg hochladen, Rechnung ausstellen, Versand, Bankimport, Steuer-/Kanzleimeldung.                                                        |

Diese Untersuchung bewertet Produktabläufe und Datenquellen. Sie bestätigt keine
steuerrechtliche Richtigkeit, Belegzulässigkeit oder Zertifizierung eines Produkts.
Gesetzesbezüge werden nur als Funktionen/Beschriftungen der Anwendungen eingeordnet.

## Vintz: Navigation und tatsächlicher Datenstand

[Finanzen](https://vintz.ai/bookkeeping) besitzt fünf Bereiche:
**Übersicht, Transaktionen, Berichte, Rechnungen, Firmen**. Oben stehen Kosten
erfassen, Verkäufe importieren, Finanz-Einstellungen und ein Menü mit Artikel
erfassen, CSV exportieren, Berichte & Exporte sowie einer Erklärung zu Rechnungen
und Steuern.

Die Übersicht zeigte für 30 Tage 0 € Umsatz, Einkauf und Kosten, null Verkäufe,
null Lagerwert sowie die Aufgabe „Firma für Rechnungen anlegen“. Zeiträume:
1 Tag, 7 Tage, 30 Tage, 6 Monate, 1 Jahr und alle. Der gelesene Code trennt
Währungen; es ist keine automatische Umrechnung belegt.

Unter Transaktionen stehen dagegen zwei Verkäufe aus September:

| Artikel                 | Status                                | Einkauf | Verkauf / dargestellter Artikelgewinn |
| ----------------------- | ------------------------------------- | ------- | ------------------------------------- |
| Polo Ralph Lauren Jacke | Neu von Vinted, noch nicht übernommen | 0 €     | 32,50 € / 32,50 €                     |
| Nike Pullover           | Neu von Vinted, noch nicht übernommen | 0 €     | 16,00 € / 16,00 €                     |

Die Transaktionssumme beträgt 48,50 €. Filter: Verkäufe 2, Bestand 0, Zu prüfen 0,
Alle 2 und Käufe; Suche und Aktualisieren vorhanden. Die separate Firmenansicht
bestätigte **0 Einträge** für das Konto. Auch der Bericht für **September**, also
den Verkaufsmonat, zeigte keine erfassten Verkäufe oder Kosten. Das ist nicht
allein durch den voreingestellten Oktoberzeitraum erklärbar.

Im Code werden erkannte Verkäufe als vorläufige `order-…`-Zeilen mit gespeicherten
Einträgen zusammengeführt. Übersicht, Prüfliste und Berichte nutzen dagegen die
übernommenen Daten. **Erkannt, übernommen, vollständig und in Rechnung gestellt
sind verschiedene Zustände.** Diese Trennung ist sinnvoll, muss aber besser
erklärt werden: Zwei sichtbare Verkäufe und gleichzeitig null Buchungen können
sonst widersprüchlich wirken.

Die vorläufige Tabelle zeigt unbekannten Einkauf zunächst als 0 und damit den
vollen Erlös als Artikelgewinn. Das ist keine belastbare Gewinnfeststellung.
Im ausführlichen Formular verlangt Vintz zusätzlich eine Bestätigung des
Einkaufspreises, ausdrücklich auch bei 0 €. Diese spätere Prüfung ist vorhanden,
beseitigt aber nicht die missverständliche erste Summenanzeige.

Auch der Hilfetext an den gesperrten Verkaufspreisen lautete „Rechnung ausgestellt
– nicht mehr änderbar“, obwohl die Zeilen nicht übernommen und keine Rechnungen
vorhanden waren. Das belegt einen unpassenden Sperrhinweis, keine tatsächlich
ausgestellte Rechnung.

## Übernahme, Bearbeitung und automatische Wirkungen

Die Importvorschau listete dieselben zwei Verkäufe, mit Suche, Statusfilter,
Datumsgrenzen, Einzel-Hinzufügen und Alle hinzufügen (2). Kein Import ausgeführt.
Im Code werden Transaktions-/Kontobezüge für bereits übernommene Verkäufe genutzt;
serverseitiger Dublettenschutz und parallele Importe sind nicht getestet.

Wichtige Wirkung aus dem Frontend: Eine Änderung des Einkaufspreises einer
vorläufigen Verkaufszeile kann beim Verlassen des Eingabefelds bereits einen
`POST /api/seller/bookkeeping` auslösen und den Verkauf übernehmen. Daher keine
Preise probeweise eingetragen. Normale gespeicherte Preise verwenden `PATCH`.
Der bereits im Versandvergleich beschriebene Rechnungszugang kann ebenfalls
zuerst einen Verkauf übernehmen und erst danach den Rechnungsdialog öffnen.

Zusätzlich sieht die Finanzseite einen automatischen Abgleich vor: Bereits
gespeicherte Lagerpositionen können bei erkanntem Verkauf per `PATCH` auf
verkauft aktualisiert werden. Ein ausdrückliches Aktualisieren kann dasselbe
auslösen. Hier gab es keine gespeicherten Positionen; keine dieser Buchaktionen
wurde betätigt. Seitenaufrufe allgemein nicht als garantiert frei von
Hintergrundschreibvorgängen darstellen.

## Artikelkosten, Gewinn und Prüfschritte

Die manuelle Artikelmaske erfasst Titel, Lager-/Listing-/Verkauft-/Storniertstatus,
Einkaufsdatum und -preis, Angebots-/Verkaufspreis und Verkaufsdatum. Weitere
Felder: SKU, Kategorie und Notiz. Im lokal ausgewählten Verkaufszustand erschienen:

- Steuerart aus Firma oder pro Verkauf; Liefer-/Leistungsdatum.
- Privatkunde oder Unternehmen; Papier-PDF oder elektronische PDF-Zustellung.
- Plattformgebühren, eigener Versand, Verpackung und selbst berechneter Versand.
- Bestätigung des geprüften und belegten Einkaufspreises.
- Einkaufsnachweis/-referenz und Lieferantenangaben im weiteren Abschnitt.
- Käuferadresse, Zahlungsweg und Transaktionsnummer.
- Zugang zur Empfängerübernahme aus einem Versandlabel; nicht ausgeführt.

Steuerangaben und Einkaufsbestätigung werden als offene Aufgaben gezeigt.
Der Hinweis grenzt selbst berechneten Versand vom durch Vinted berechneten
Versand ab. Keine Steuerart ausgewählt, kein Häkchen gesetzt, keine Adresse
eingegeben oder übernommen; leeres Formular verworfen.

Der gelesene Betragshelfer berechnet:

`Artikelerlös + selbst berechneter Versand − Einkauf − Gebühren − eigener Versand − Verpackung`

Das ist der Artikelbeitrag. Eigene zusätzliche Kosten werden für die Übersicht
gesondert abgezogen. Der Berichtsbereich unterscheidet Erlös, Kosten, Ergebnis
vor und nach der erfassten Umsatzsteuer. Lagerwert steht getrennt und zählt
nicht als Periodenergebnis. Dies ist keine Vinted-Guthaben- oder
Auszahlungsabstimmung. Einen entsprechenden Wallet-/Bankabgleich oder eine
automatische Gebührenabrechnung im untersuchten Finanzpfad nicht gefunden.

## Eigene Kosten und Vinted-Go-Belege

Die Kostenmaske trennt **einmalig** und **pro Versand**. Einmalige Kosten besitzen
Name, Betrag, Währung, Datum, Notiz und optional ein Vinted-Konto. Die Regelansicht
erfasst Name, Betrag und Währung. Der lokale Wechsel zwischen beiden wurde ohne
Eingaben vorgenommen und verworfen. Die Oberfläche beschreibt Regeln als Kosten
bei jedem künftigen Versand; Änderungen sollen frühere Beträge nicht verändern.
Tatsächliche Ausführung, Kontoverteilung und Wiederholschutz nicht getestet.

Ein Vinted-Go-PDF kann zunächst lokal gelesen werden. Der untersuchte Parser:

- PDF bis **10 MB**, genau **eine Seite**.
- Liest vorhandenen PDF-Text; kein allgemeines Beleg-OCR für gescannte Fotos.
- Erwartet Vinted-UAB-/VGLT-Bezug, eine eindeutige Nummer, ein Datum sowie
  zusammenpassende Netto-/Steuer-/Bruttosummen.
- Bei unsicherer Erkennung Hinweis auf manuelle Kostenerfassung.
- Bietet **PDF archivieren ohne Kostenbuchung** oder **PDF importieren und Kosten
  buchen** als verschiedene Abschlussaktionen.

Beim tatsächlichen Import würden Originaldatei und ausgelesener Text an
`/api/seller/costs/invoice` gesendet. „Lokal lesen“ ist daher keine Aussage,
dass der fertige Beleg niemals bei Vintz gespeichert wird. Bereits archivierte
Dokumente können laut Code später bestätigt gebucht werden. Kein Beleg ausgewählt
oder hochgeladen; korrekte Erkennung und Schutz vor Doppelbuchungen bleiben offen.

Die Maske warnt vor doppeltem Erfassen bereits am Verkauf gespeicherter
Versandkosten. Ein Nullbetrag soll keine Kostenbuchung benötigen. Diese Hinweise
sind Produktverhalten, keine Prüfung konkreter Belege.

## Firmen, Rechnungen und Berichte

Im Konto ist keine Firma hinterlegt. Finanz-Einstellungen zeigten deshalb nur
den Hinweis, zunächst eine Firma anzulegen. Eine Rechnung konnte so nicht
unverändert produktiv geprüft werden. Es wurde keine Firma angelegt.

Die Firmenansicht ordnet Vinted-Konten einer Standard- oder ausgewählten Firma
zu. Der Code sieht mehrere Firmen, Rechnungspräfixe, Steuer-/Adressangaben,
Archivierung und Wiederherstellung vor. Firmen mit Rechnungen oder Kosten
sollen archiviert werden; offene Verkäufe können bei einer Zuordnung mitwandern.
Das ist keine harmlose Anzeigeeinstellung, deshalb nicht umgestellt. Mehrere
Firmen sind ein anderes Modell als die Flipbase-Workspaces.

Die Rechnungsübersicht zeigt ausgestellte Ausgangsrechnungen, mit Datumsfilter
für Monate, Quartale und Jahre. Sichtbarer eigener Hinweis:

- Vinted-Go-Kostenbelege gehören zu eigenen Kosten, nicht zu Ausgangsrechnungen.
- Ausgestellte Rechnungen sollen unverändert gespeichert bleiben.
- PDF für Inlandslieferungen; **keine XRechnung/ZUGFeRD**.
- **Stornorechnungen noch nicht vorhanden.**

Keine ausgeführte Ausstellung, unveränderliche Archivierung oder Zustellung
behaupten. Produkttexte zur Gültigkeit länderspezifischer Rechnungen sind keine
unabhängig geprüfte Rechtsauskunft.

Berichte unterstützen Monat, Quartal, Jahr und freie Zeiträume. Der Code begrenzt
freie Zeiträume auf zehn Jahre. Firmen-/Kontobezug wird mitgegeben; Währungen
werden separat dargestellt. Warnungen sind vorgesehen für unbestätigte Einkäufe,
fehlende Steuerdaten, fehlende Verkaufspreise, Verkäufe ohne Datum, nicht
verfügbare Kosten und mehr als 50.000 einbezogene Einträge. Allgemeine Kosten
ohne Konto können aus einer konkreten Kontoansicht ausgeschlossen bleiben.

Der Bereich „Grenzen & Meldungen“ sieht Jahreswerte, Länderregeln und DAC7-
bezogene Anzeigen je Konto vor. Hier war er mangels Firma nicht nutzbar. Keine
Grenzwerte, Berechnung oder Vollständigkeit dieser Meldungen bestätigt.

## Exporte: tatsächlich geprüft und nur vorgesehen

| Zugang                     | Umfang / Filter                                                                        | Prüfstand                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Berichte → Transaktionen   | Zeitraum, Firma, Konto; CSV                                                            | Datei für Oktober heruntergeladen: UTF-8 mit BOM, Semikolon, 38 englische Spalten, keine Datenzeile.                                                                                                                            |
| Berichte → Rechnungsliste  | Gleicher Zeitraum-/Firmen-/Kontobezug; CSV                                             | Datei für September heruntergeladen: 16 Spalten, nur Kopfzeile.                                                                                                                                                                 |
| Berichte → Zusammenfassung | Monat/Quartal/Jahr, bei mehreren Firmen zusätzliche Aufteilung vorgesehen              | Link/Parameter und Frontend geprüft. Downloadversuch ohne bestätigte Datei; anschließend begrenzte Prüfung über Downloadereignis ebenfalls ohne Ergebnis. Ursache offen, kein Serverfehler oder erfolgreicher Export behauptet. |
| Menü → CSV exportieren     | Übergibt Firma/Konto, **keinen Berichtszeitraum**                                      | Quellbefund; nicht als identisch zur gefilterten Berichtsdatei ausgeben.                                                                                                                                                        |
| Eigene Kosten → CSV        | Aufruf `/api/seller/costs/export`, **ohne sichtbare Zeitraum-/Konto-/Firmenparameter** | Nicht heruntergeladen. Tatsächlichen Serverumfang gesondert prüfen; aktuelle Bildschirmfilter nicht als gesichert exportiert betrachten.                                                                                        |

Die 38 Transaktionsspalten umfassen Firma/Herkunft, Konto, Transaktion, SKU,
Artikel, Status/Storno, Einkaufs-/Verkaufs-/Lieferdatum, Währung, Einkauf,
Verkauf, Käufer-Versand, Gesamtbetrag, Gebühren, eigener Versand, Verpackung,
Artikelbeitrag, Steuerart/-satz/-betrag, Rechnungsnummer/-datum, Käuferadresse,
Lieferant, Nachweis/-referenz, Einkaufsbestätigung und fehlende Steuerdaten.
Die Rechnungsliste enthält Rechnungs-/Firmen-/Kontobezug, Käuferland, Währung,
Brutto/Netto und Steuerangaben.

Die echten Dateien bestätigen damit Struktur und leeren Download, **nicht**
korrekte Beträge, Datumsgrenzen, Sonderzeichen, Formelschutz, Teilstorno,
Erstattungen, Belegverknüpfung oder Mehrkontoexporte mit echten Zeilen.

In den untersuchten Finanzansichten und ihrem geladenen Code keinen DATEV-EXTF-,
vollständigen Beleg-ZIP-, Bankdatei- oder elektronischen Rechnungs-Export gefunden.
CSV für Excel ist keine belegte DATEV-Schnittstelle.

## Flipbase: tatsächliche Grundlagen und Grenzen

| Bereich           | Vorhanden                                                                                                               | Wichtige Grenze                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zentrale Verkäufe | Erlös inklusive Käufer-Versand minus Erstattung; Wareneinsatz, Gebühren, Versand und Zusatzkosten; Marge/ROI            | Unbekannter Wareneinsatz ergibt unbekannten Gewinn. Betriebsausgaben sind vom Artikelgewinn getrennt.                                                                                 |
| Betriebsausgaben  | Kategorien, bezahlt/offen, Steuerfelder, wiederkehrende Regeln und Dokumente                                            | Wiederholungen werden im untersuchten Pfad beim Laden erzeugt; kein Beleg für unabhängigen Monatsbetrieb.                                                                             |
| Dashboard         | Zentrale Verkäufe, Einkäufe, Lager und bezahlte Betriebsausgaben                                                        | Betriebsausgaben nur bei Plattformfilter alle; andere Datenbasis als Steuerexporte.                                                                                                   |
| Vinted            | Kontokopien mit Preisen und Status                                                                                      | Keine automatische Verbindung zu zentralen Verkäufen, Rechnungen, Lagerbuchungen oder Finanzexporten.                                                                                 |
| Belege            | Private Ablage mit Metadaten; PDF/JPG/PNG/XML bis 20 MiB; Vorschau/Download; Eigenbeleg-PDF im Einkaufsablauf           | Kein ausführbarer allgemeiner Beleg-OCR-Pfad in den untersuchten Frontend-/Funktionsquellen gefunden.                                                                                 |
| Rechnungen        | Datenbankrechnung und Positionen, Wiederholschutz je Quelle, Unternehmensdaten als Snapshot; Browserdruck/PDF-Speichern | Verkaufsaufruf übergibt keine Käuferadresse; Service setzt dann Platzhalter wie Kundenadresse und 10115 Berlin. Nicht als fertige korrekte Rechnung bewerten.                         |
| Retouren          | Interne atomare Erstattung/Wiedereinlagerung und Gutschrift                                                             | Keine echte Vinted-Erstattung; eigenständiger Rechnungsstornoablauf im untersuchten Pfad nicht gefunden.                                                                              |
| Bankabgleich      | Dateiimport CSV/MT940/CAMT.053, Treffer/Zuordnung, Ignorieren und Sammelbestätigung                                     | Keine Live-Bankverbindung; kein spezieller Abgleich verteilter Vinted-Sammelauszahlungen. Buchen markiert eine Bankbewegung, erzeugt bei Betriebsausgabentreffern keine neue Ausgabe. |

Flipbase-Rechnungsversand und Kanzleipakete werden im untersuchten Pfad nur
vorbereitet; keine echte E-Mail-Zustellung daraus ableiten.

| Flipbase-Export              | Tatsächlicher Umfang                                                                                                 | Grenze                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verkauf/Einkauf/Inventar CSV | Browserdownload, BOM, Semikolon, Schutz gegen Tabellenformeln; Kosten und Gewinnbezug                                | Exportiert geladene zentrale Bestände. Die Ereignis-Zeitraumfilter der Einstellungsseite werden diesen Generatoren nicht übergeben; kein Vinted-Kontofilter.                        |
| DATEV EXTF                   | Generator für SKR03/SKR04 mit Berater-/Mandantenkonfiguration                                                        | Enthält Verkaufsumsatz, Käufer-Versand und Ausgangsfracht; keine vollständigen Zeilen für sämtliche Einkäufe, Gebühren, Betriebsausgaben, Gutschriften und Auszahlungen.            |
| §25a-Journal                 | Positionsbezogener CSV-Generator; unvollständige Kosten stoppen Export                                               | Kein Nachweis eines vollständig abgestimmten steuerlichen Jahresabschlusses.                                                                                                        |
| EÜR-Ausgabe                  | Gefilterte Verkaufsberechnungen als CSV                                                                              | Keine vollständige betriebliche Ein-/Auszahlungsrechnung. Vorsteuer wird im untersuchten Rechenpfad mit 0 angesetzt.                                                                |
| ZIP-Prüfarchiv               | Gemeinsamer Datenbanksnapshot, Tabellen-CSV, Ereignis-JSON, Einkaufs-/Ausgaben-Originalbelege und Prüfsummenmanifest | Zeitraum begrenzt nur Ereignisse; übrige Geschäftstabellen vollständig im Workspace. Rechnungsdatensätze sind nicht automatisch Rechnungs-PDFs. Fehlende Belege werden ausgewiesen. |

Das ZIP hat Rechteprüfung für Owner/Admin/Accountant sowie Grenzen von 100.000
Datensätzen und 50 MiB Snapshot-JSON, mit Fehler statt stiller Teilmenge. Der
Bankdateiimport begrenzt auf 10 MiB und 5.000 Bewegungen. Das sind verschiedene
Grenzen verschiedener Funktionen.

## Übernahmekandidaten für die Besprechung

1. **Verständlicher Finanzarbeitsbereich:** Kennzahlen, offene Prüfaufgaben,
   Transaktionen, Belege und Exporte besser verbinden. Die bereits vorhandenen
   Flipbase-Grundlagen erhalten.
2. **Datenherkunft und Vollständigkeit sichtbar:** erkannt/übernommen, vorläufig/
   bestätigt und unbekannte Kosten unterscheiden. Umsatz, Artikelgewinn,
   Periodenergebnis und verfügbare Auszahlung getrennt benennen.
3. **Belegablage ohne automatische Buchung:** Vintz trennt dies gut. Eine gezielte
   Auslesehilfe mit prüfbarer Vorschau wäre sinnvoll; der Vinted-Go-Textparser ist
   noch kein allgemeines OCR-Vorbild.
4. **Exportvorschau:** Vor Download Zeitraum, Workspace/Firma, Konto, Währung,
   Datensatzarten, Anzahl und ausgeschlossene Daten klar zeigen. Vorhandene
   Filter dürfen nicht nur auf einen Teil der Datei wirken, ohne das zu erklären.
5. **Rechnungen erst bei verlässlichen Daten:** Fehlende Angaben als Aufgabe
   zeigen, Platzhalteradressen verhindern; Vorschau, Übernahme, Ausstellung,
   Archivierung und Versand als verschiedene Schritte kennzeichnen.
6. **Vinted-Finanzimport vervollständigen:** Echte Gebühren, Erstattungen und
   Auszahlungen den Transaktionen zuordnen. Weder Vintz' Artikelgewinn noch
   Flipbase' DATEV-/EÜR-Knopf beweist bereits diesen vollständigen Ablauf.

Nicht übernehmen: Nullkosten als Ersatz für Unwissen, missverständliche
Sperrhinweise, Buchung durch scheinbar reine Vorschau oder still abweichende
Exportfilter. Keine Umsetzung beschlossen.

## Quellen und Belege

Vintz: [Finanzen](https://vintz.ai/bookkeeping), tatsächliche Downloaddateien
und die bereits durch den Browser geladenen Erstanbietermodule:

| Modul              | Bereich                                             | SHA-256                                                            |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| `2yx96y2djftdg.js` | Finanzseite, Kosten, Import, automatische Abgleiche | `0ee700471a70bf0d938c2b288ea6f2cb51a0569d994209c24acf88eac7a66c11` |
| `3vnquzxho0i85.js` | Berichte, Grenzen und Exportparameter               | `816d52869c3fb7e9fdee94604261a9f87e8eb1247917e5f9ade31b290d61e399` |
| `1aejqi493j9vf.js` | Betrags-/Steuer-/Berichtsmodelle                    | `e5824b7e6e6013f379530d333675acc1bd11a7e2dde60993bb3c6f60a4266344` |
| `147zbw7-nq9ri.js` | Transaktionstabelle und Zustände                    | `c7e0e6377560ddb3b6c44d68c4825e292e441d40963ec46cbfa56e6e31b1ecb1` |
| `0jt4pomx32ahe.js` | Firmen                                              | `a3f13888ec5c3b89df90ae6a3a95084753056b995a26b07cfd0c7c937d1dd209` |
| `3ajh6i1dp4lho.js` | Ausgestellte Rechnungen                             | `fce431488f6ff38cf5251ca8fe0a6699a858600d08dcc301d64ef1b3cb778f07` |
| `39amms-qr3m5v.js` | Artikelformular                                     | `8611986257b216b1b750c7bc2f285cc031e20e2d4489adb519c374ad1c779376` |

Fremden Quelltext nicht im Repository gespeichert. Gegenüber dem vorherigen
Versandblock wurden neue Modulkennungen ausgeliefert; deshalb aktuelle Quellen
und eigene Prüfsummen verwendet.

- [Berichtsansicht](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-finance-reports-2026-10-18.png).
- [Vorläufige Transaktionen](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-finance-transactions-2026-10-18.png).
- [Leere Transaktionsdatei](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-finance-transactions-empty.csv)
  und [leere Rechnungsliste](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-finance-invoices-empty.csv).

Flipbase-Quellen, Zeilen beim oben genannten Stand:

- [Verkaufsrechnung](../../src/app/core/utils/sale-metrics.ts), ab 15;
  [Verkaufsbuchung](../../src/app/core/services/sales.service.ts), ab 298;
  [Dashboard-Abgrenzung](../../src/app/core/services/dashboard-report.service.ts), ab 193.
- [Ausgaben](../../src/app/core/services/expense.service.ts), ab 80/152;
  [Wiederholungen](../../src/app/core/services/expense-recurring.service.ts), ab 145;
  [Belegablage](../../src/app/core/services/expense-document.service.ts), ab 141;
  [Eigenbeleg](../../src/app/features/purchases/services/purchase-self-receipt.service.ts), ab 15.
- [Rechnungsdaten und Platzhalter](../../src/app/core/services/invoice.service.ts), ab 323/692;
  [Verkaufsaufruf](../../src/app/features/sales/sales.component.ts), ab 411;
  [Browserdruck](../../src/app/shared/components/invoice-modal/invoice-modal.component.ts), ab 80;
  [Unternehmenssnapshot](../../supabase/schemas/290_company_document_snapshots.sql), ab 50.
- [CSV-Generatoren](../../src/app/core/services/export.service.ts), ab 11;
  [CSV-Aufrufe ohne Ereignisfilter](../../src/app/features/settings/pages/data-and-audit/data-and-audit.component.ts), ab 324.
- [DATEV/EÜR und Vorsteuergrenze](../../src/app/core/services/tax-engine.service.ts), ab 109/478/554;
  [Kostenprüfung/§25a/Kanzleipaket](../../src/app/core/services/tax-advisor.service.ts), ab 332/387/424;
  [Zeitraumfilter](../../src/app/features/accounting/accounting.component.ts), ab 208/474.
- [ZIP-Archiv](../../src/app/core/services/audit-export.service.ts), ab 730/794;
  [Snapshot-Rechte und Zeitraum](../../supabase/schemas/60_audit_snapshot.sql), ab 24/99.
- [Bankimport und Treffer](../../src/app/core/services/bank-reconciliation.service.ts), ab 275/666/878;
  [tatsächliche Bankbuchung](../../supabase/schemas/360_beta_business_access.sql), ab 4453.
- [Vinted-Lesekopie](../../services/marketplace-worker/src/vinted-account-import.ts), ab 693;
  [interne Retoure](../../src/app/core/services/return.service.ts), ab 161.

Nur Dokumentation geändert; Berichtslinks, Markdown und Unterschiedskontrolle
geprüft. Keine Anwendungstests nötig. Lesetab geschlossen, lokale Formulare
verworfen, kein Finanzdatensatz angelegt oder geändert. Stopp zur Besprechung.
