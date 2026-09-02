# Einkaufs-, Bestandskosten- und Prüfprotokoll-Design

**Datum:** 2026-08-31
**Status:** fachlich und technisch im Dialog freigegeben; Umsetzungspläne erstellt, Implementierung ausstehend
**Ersetzt bzw. präzisiert:** die Kostenverteilung, Mystery-Box-Erfassung, Inventarbezeichnungen, Verkaufskennzahlen, Einstellungsstruktur und Altdatenbehandlung aus den Designs vom 26.08.2026 und 29.08.2026

## Ziel

Flipbase erhält ein einheitliches, verständliches Kostenmodell für normale Einkäufe und Mystery Boxen. Tatsächliche Einkaufskosten, optionale Marktwerte, Bestandswert, Wareneinsatz und Verkaufsergebnis werden strikt getrennt. Fehlende Kosten erscheinen nicht länger irreführend als `0,00 €`.

Die Oberfläche verwendet einfache deutsche Begriffe, führt Mengenartikel und einzeln nachverfolgte Artikel in einer Inventaransicht zusammen und macht steuerlich relevante Korrekturen nachvollziehbar. Selten benötigte Prüf- und Exportfunktionen werden zentral unter den Einstellungen angeboten; der Verlauf eines einzelnen Vorgangs bleibt direkt am Einkauf oder Verkauf erreichbar.

Der Kernfluss lautet:

```text
Einkauf als Entwurf
  → Artikel und Einkaufskosten erfassen
  → Kosten automatisch verteilen
  → Erfassung abschließen
  → Bestand verfügbar machen
  → Verkauf mit festgehaltenem Wareneinsatz
  → Ergebnis, Marge und Prüfprotokoll
```

## Fachliche Grundlagen

### Tatsächliche Kosten statt Schätzwert

Der Bestandswert entsteht ausschließlich aus tatsächlichen Anschaffungskosten. Dazu gehören der Warenpreis und direkt zugehörige Einkaufskosten wie Versand, Zoll, Transportversicherung oder andere Beschaffungsgebühren. Rabatte oder Erstattungen mindern die Kosten.

Ein geschätzter Marktwert ist nur eine Planungshilfe. Er verändert weder den Bestandswert noch den Kostenanteil, Wareneinsatz oder das Verkaufsergebnis.

Diese Trennung orientiert sich insbesondere an:

- [§ 255 HGB – Anschaffungskosten](https://www.gesetze-im-internet.de/hgb/__255.html),
- [§ 253 HGB – Bewertung](https://www.gesetze-im-internet.de/hgb/__253.html),
- [§ 6 EStG – Bewertung von Wirtschaftsgütern](https://www.gesetze-im-internet.de/estg/__6.html).

Das Produkt ersetzt keine individuelle steuerliche Beratung. Vor einer ausdrücklichen steuerlichen Produktfreigabe müssen Verfahren und Exporte anhand echter Geschäftsfälle mit einer Steuerkanzlei geprüft werden.

### Verbindliche Begriffe in der Oberfläche

| Bisheriger oder technischer Begriff | Nutzertext                           |
| ----------------------------------- | ------------------------------------ |
| allokierter EK                      | Kostenanteil                         |
| EK je Stück                         | Einkaufspreis pro Stück              |
| Positionssumme                      | Gesamt                               |
| expected value / geschätzter Wert   | Geschätzter Marktwert (optional)     |
| purchase costs / landed costs       | Zusätzliche Einkaufskosten           |
| COGS                                | Wareneinsatz                         |
| profit                              | Ergebnis nach direkten Kosten        |
| allocation pending                  | Kostenaufteilung offen               |
| legacy                              | wird in Nutzertexten nicht verwendet |

Der Hilfetext für **Geschätzter Marktwert (optional)** lautet:

> Optionaler Orientierungswert aus eigener Recherche. Wird nicht für Bestandswert, Kostenverteilung oder Gewinnberechnung verwendet.

## Zwei Einkaufsabläufe

### Normaler Einkauf

Ein normaler Einkauf kann beliebig viele unterschiedliche Artikelpositionen enthalten. Je Position werden erfasst:

- Artikel;
- Menge, standardmäßig `1`;
- Einkaufspreis pro Stück;
- daraus automatisch berechneter Gesamtbetrag.

Beispiel:

```text
20 Tassen × 2,00 €
3 Teller × 10,00 €
2 Bestecksets × 15,00 €
```

Der eingegebene Einkaufspreis bleibt unverändert sichtbar. Zusätzliche Einkaufskosten erhöhen erst die vollständigen Kosten pro Stück.

### Mystery Box

Bei einer Mystery Box sind die Preise der enthaltenen Artikel nicht bekannt. Deshalb verlangt Flipbase für den Inhalt keinen Einkaufspreis pro Stück.

Der Ablauf ist:

1. Mystery Box mit Kaufpreis, Quelle bzw. Lieferant und Kaufdatum anlegen.
2. Optionale zusätzliche Einkaufskosten über **Kosten hinzufügen** erfassen.
3. Gefundene Artikel mit Menge, Zustand und optionalem geschätztem Marktwert hinzufügen.
4. Die tatsächlichen Gesamtkosten laufend gleichmäßig auf alle erfassten Stücke verteilen.
5. Erfassung abschließen und Bestand freigeben.

Die Gesamtkosten des Einkaufs verändern sich nicht durch das Hinzufügen von Artikeln. Neu berechnet wird der Kostenanteil pro Stück.

Beispiel:

```text
Kaufpreis                                      100,00 €
Einkaufsversand                                 10,00 €
Gesamtkosten                                   110,00 €

1 erfasstes Stück                         110,00 € je Stück
2 erfasste Stücke                         55,00 € je Stück
5 erfasste Stücke                         22,00 € je Stück
```

Gleiche Artikel mit identischem Zustand und gleicher wirtschaftlicher Behandlung dürfen als eine Position mit höherer Menge erfasst werden. Die Menge zählt vollständig in die Kostenverteilung. Ein gemeinsam verkauftes Schuhpaar gilt als ein Stück, nicht als zwei einzelne Schuhe.

### Rundungen

Alle Kostenverteilungen werden auf Cent genau gespeichert. Rundungsreste werden deterministisch verteilt. Die Summe aller Kostenanteile muss immer exakt den Gesamtkosten des Einkaufs entsprechen.

Beispiel für 100,00 € auf sechs Stück nach dem Largest-Remainder-Verfahren:

```text
4 × 16,67 €
2 × 16,66 €
= 100,00 €
```

## Zusätzliche Einkaufskosten

Kaufpreis und zusätzliche Einkaufskosten bleiben getrennte Daten. Die vorhandene Funktion **Kosten hinzufügen** wird weiterverwendet. Mögliche Kostenarten sind unter anderem Versand, Fahrtkosten, Zoll, Transportversicherung und sonstige direkt zugehörige Kosten.

### Verteilung beim normalen Einkauf

Standardmäßig werden zusätzliche Kosten proportional zum Warenwert auf die Positionen verteilt. Der Nutzer muss dafür keine Auswahl treffen.

Optional ist über **Verteilung ändern** möglich:

- nach Warenwert;
- nach Stückzahl;
- einem bestimmten Artikel zuordnen.

Gewicht und Volumen werden zunächst nicht angeboten, weil dafür verlässliche Stammdaten für alle Artikel nötig wären.

### Verteilung bei Mystery Boxen

Mystery-Box-Kosten werden ausnahmslos gleichmäßig pro Stück verteilt. Für diesen Einkaufstyp gibt es kein Auswahlfeld für die Verteilungsmethode.

Die Entscheidung folgt dem Grundmuster etablierter ERP-Systeme, die zusätzliche Beschaffungskosten getrennt erfassen und nach Wert, Menge, Gewicht, Volumen oder direkter Zuordnung verteilen. Flipbase bietet bewusst nur die für den aktuellen Anwendungsfall erforderlichen Optionen:

- [SAP Business One – Landed Costs](https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/4507dde4cc1a2462e10000000a1553f7.html),
- [Microsoft Dynamics 365 – Charge Allocation](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/automatic-charges-allocation),
- [Oracle NetSuite – Landed Costs](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/subsect_157919106901.html),
- [Odoo – Landed Costs](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/inventory_valuation/landed_costs.html).

## Entwurf, Abschluss und Korrektur

### Entwurf

Solange die Erfassung nicht abgeschlossen ist, dürfen Artikel und Kosten ohne fachlichen Korrekturvorgang bearbeitet werden. Diese Eingaben sind ein Arbeitsentwurf.

### Erfassung abschließen

Beim Abschluss prüft Flipbase mindestens:

- alle Mengen sind positiv;
- normale Positionen besitzen gültige Einkaufspreise;
- Mystery-Box-Inhalte benötigen keinen Stückpreis;
- die Kostenverteilung ergibt exakt die Gesamtkosten;
- die Bestandserzeugung ist vollständig möglich.

Erst danach werden die Artikel verkaufsbereit. Abschluss, Kostenverteilung und Bestandserzeugung erfolgen atomar in einer Datenbanktransaktion.

### Wieder öffnen und korrigieren

- Vor dem ersten Verkauf darf ein abgeschlossener Einkauf wieder geöffnet werden. Kostenanteile werden automatisch neu berechnet.
- Nach dem ersten Verkauf erfolgt eine Änderung ausschließlich über **Einkauf korrigieren**.
- Dafür existiert nur ein verständliches Pflichtfeld: **Grund der Korrektur**.
- Begriffe wie `Legacy-Nachtrag`, `Prüfgrund für Bestandsrücknahme` und doppelte Begründungsfelder entfallen aus diesem Ablauf.
- Die Korrektur aktualisiert Kostenanteile, Bestandswert, Wareneinsatz und betroffene Verkaufsergebnisse gemeinsam und protokolliert die vorherigen und neuen Werte.

## Einkaufsübersicht

Die bisherige Kachelmatrix wird durch breite, responsive Einträge untereinander ersetzt. Desktop und Mobilgerät verwenden dieselbe Informationsstruktur; auf kleinen Bildschirmen werden die Blöcke untereinander angeordnet.

Jeder Eintrag zeigt:

- Bezeichnung oder Lieferant;
- Einkaufsart: normaler Einkauf oder Mystery Box;
- Kaufdatum;
- Einkaufsstatus;
- Gesamtkosten;
- Anzahl der Stücke;
- verfügbar und verkauft;
- gegebenenfalls **Kostenaufteilung offen**.

Einkaufsstatus und Artikelbestand bleiben getrennt. Ein Einkauf selbst erhält nicht den Status `verkauft`. Vorgesehene Einkaufsstatus sind:

- Entwurf;
- Bestellt;
- Eingetroffen;
- Inhalt erfassen, nur bei Mystery Boxen;
- Erfassung abgeschlossen;
- Storniert bzw. archiviert.

### Einkaufsdetails – normaler Einkauf

Die Positionen zeigen:

- Artikel;
- Menge;
- Einkaufspreis pro Stück;
- zusätzlicher Kostenanteil;
- Gesamtkosten pro Stück;
- verfügbar und verkauft.

### Einkaufsdetails – Mystery Box

Die Positionen zeigen:

- Artikel;
- Menge;
- Zustand;
- geschätzter Marktwert, optional;
- Kostenanteil pro Stück;
- verfügbar und verkauft.

Bei verkauften Artikeln erscheinen zusätzlich:

- Verkaufspreis;
- Verkaufskosten;
- Ergebnis nach direkten Kosten;
- Link zum zugehörigen Verkauf.

## Gemeinsame Inventaransicht

Die Tabs **Bestand** und **Einzelstücke** entfallen. Eine gemeinsame Ansicht zeigt Mengenartikel und einzeln nachverfolgte Artikel.

Ein Inventareintrag enthält:

- Artikel;
- Herkunft bzw. zugehöriger Einkauf;
- Zustand;
- Bestand;
- Kosten pro Stück;
- Bestandswert;
- Status und Aktionen.

Die bisherige Spalte **Art** entfällt. Menge `1` beschreibt ein Einzelstück bereits ausreichend. Die interne Unterscheidung zwischen Mengenführung und Einzelverfolgung bleibt im Datenmodell erhalten, wird aber nur angezeigt, wenn sie für eine Aktion relevant ist.

Bestände werden konsistent dargestellt:

```text
10 Stück insgesamt
6 verfügbar · 1 reserviert · 3 verkauft
```

Fehlende Kosten erscheinen als **Kosten noch offen**, niemals als scheinbar echter Wert von `0,00 €`.

Der Bestandswert ist die Summe der tatsächlichen Kosten der noch vorhandenen Stücke. Ein geschätzter Marktwert fließt nicht ein.

### Zustände und Statusdarstellung

Datenbankwerte werden übersetzt:

| Datenwert    | Anzeige                                                     |
| ------------ | ----------------------------------------------------------- |
| new          | Neu                                                         |
| like_new     | Wie neu                                                     |
| very_good    | Sehr gut                                                    |
| used         | Gut bzw. Gebraucht, nach finaler Zustandsliste              |
| heavily_used | Akzeptabel bzw. Stark gebraucht, nach finaler Zustandsliste |
| defective    | Defekt                                                      |

Statusauswahl und Badges verwenden ausschließlich die gemeinsamen UI-Komponenten. Ein verkaufter Artikel zeigt einen festen, gleich großen **Verkauft**-Badge statt eines leeren Auswahlfeldes.

Verkaufte Artikel bleiben sichtbar. Zulässige Aktionen sind:

- Verkauf öffnen;
- Retoure erfassen;
- nachvollziehbare Korrektur starten;
- Änderungsverlauf ansehen.

## Verkaufserfassung und Kennzahlen

ROI ist keine Hauptkennzahl eines einzelnen Verkaufs. Die normale Verkaufsliste zeigt:

- Verkaufserlös;
- Wareneinsatz;
- Verkaufskosten;
- Ergebnis nach direkten Kosten;
- Marge.

Die verbindlichen Berechnungen lauten:

```text
Verkaufserlös
= Artikelpreis + vom Käufer bezahlter Versand

Verkaufskosten
= Plattformgebühr + tatsächlich bezahlter Versand + weitere Verkaufskosten

Ergebnis nach direkten Kosten
= Verkaufserlös − Wareneinsatz − Verkaufskosten

Marge
= Ergebnis nach direkten Kosten ÷ Verkaufserlös × 100
```

`Nettogewinn` und `Bruttogewinn` werden vermieden, weil das Ergebnis weder alle betrieblichen Gemeinkosten noch sämtliche Steuern umfasst und `brutto` leicht mit Umsatzsteuer verwechselt wird.

ROI darf später als optionale Analysekennzahl erscheinen:

```text
ROI = Ergebnis nach direkten Kosten ÷ Wareneinsatz × 100
```

Fehlt ein gültiger Wareneinsatz, lautet die Anzeige **Nicht berechenbar**. Es wird weder `0 %` noch ein einzelnes Prozentzeichen angezeigt.

## Dashboard

Dashboard, Verkäufe, Einkäufe und Inventar verwenden dieselben gespeicherten Werte und Berechnungen.

Hauptkennzahlen:

- Verkaufserlöse;
- Ergebnis nach direkten Kosten;
- aktueller Bestandswert;
- verkaufte Artikel;
- durchschnittliche Marge.

Im Verkaufsjournal wird `COGS` durch **Wareneinsatz** und `Profit` durch **Ergebnis** ersetzt. Fehlende Kosten werden als **Kosten fehlen** gekennzeichnet.

Der Zeitraum-Chart bleibt bei Chart.js und zeigt:

- Verkaufserlöse;
- Wareneinsatz;
- Verkaufskosten;
- Ergebnis.

Er erhält Tooltips, ein- und ausblendbare Reihen, Zeitraum- und Plattformfilter, eine korrekte negative Achse sowie eine zugängliche Datentabelle.

## Einstellungen und Informationsarchitektur

Die bestehende lange Einstellungsseite wird in eine Einstellungs-Grundseite mit eigener Seitennavigation und getrennten Unterseiten zerlegt.

```text
/settings/account
/settings/workspace
/settings/team
/settings/notifications
/settings/store
/settings/shipping
/settings/app
/settings/data
```

Die linke Navigation enthält:

- Konto;
- Workspace;
- Team & Rollen;
- Benachrichtigungen;
- Shop & Zahlungen;
- Versand;
- App & Geräte;
- Daten & Protokolle.

Auf kleinen Bildschirmen wird die zweite Sidebar durch eine zugängliche Auswahl oberhalb des Inhalts ersetzt. Die einzelnen Bereiche bleiben direkt verlinkbar und unterstützen Browsernavigation sowie Lazy Loading.

### Daten & Protokolle

Dieser Bereich enthält:

1. Änderungsprotokoll;
2. Datenexport und Prüfungsarchiv;
3. Aufbewahrung, Sicherung und Kontolöschung.

Das globale Protokoll kann nach Zeitraum, Benutzer, Vorgangstyp und Änderungsart gefiltert werden. Eigentümer und Administratoren dürfen es ansehen und exportieren. Die Steuerberater-Rolle erhält Lese- und Exportzugriff. Andere Teammitglieder sehen nur den Verlauf von Datensätzen, auf die sie ohnehin zugreifen dürfen.

Zusätzlich zeigt jeder Einkauf und Verkauf unaufdringlich:

> Zuletzt geändert am … · Änderungsverlauf ansehen

## Prüfprotokoll, Export und Aufbewahrung

### Umfang des Protokolls

Nach dem fachlichen Abschluss werden steuerlich oder wirtschaftlich relevante Änderungen protokolliert. Dazu gehören insbesondere:

- Menge und Einkaufspreis;
- zusätzliche Einkaufskosten;
- Kostenverteilung;
- Verkaufspreis und Verkaufsdatum;
- Plattformgebühren und Versandkosten;
- Storno, Retoure und Korrektur;
- daraus folgende Änderungen von Bestand und Wareneinsatz.

Nicht protokolliert werden rein visuelle Aktionen wie Tabwechsel, Filter oder das Öffnen eines Dialogs.

Jeder Eintrag speichert:

- Workspace;
- betroffene Art und ID des Datensatzes;
- Ereignisart;
- vorherige und neue Werte;
- Benutzer oder Systemprozess;
- Zeitpunkt;
- optionalen Korrekturgrund;
- gemeinsame Vorgangskennung für automatisch zusammengehörige Änderungen.

Das Protokoll ist nur ergänzbar. Update und Delete sind für Anwendungsrollen technisch gesperrt.

### Export

Flipbase bietet:

- eine lesbare PDF-Darstellung für einen einzelnen Einkauf oder Verkauf;
- einen globalen Export nach Zeitraum;
- ein vollständiges Prüfungsarchiv als ZIP mit maschinell auswertbaren CSV-Dateien, eindeutigen IDs, Verknüpfungen und einer Strukturbeschreibung.

Ein PDF allein ist kein ausreichender maschineller Datenexport. Die Anforderungen an Verfügbarkeit, Lesbarkeit und maschinelle Auswertbarkeit ergeben sich insbesondere aus [§ 147 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html) und den [GoBD](https://amtliche-handbuecher.bundesfinanzministerium.de/ao/2025/Anhaenge/BMF-Schreiben-und-gleichlautende-Laendererlasse/Anhang-33/anhang-33.html).

### Aufbewahrung

Flipbase plant vereinfachend eine Aufbewahrung steuerlich relevanter Transaktions- und Änderungsdaten von mindestens zehn Jahren. Dabei bleiben abweichende gesetzliche Fristen und längere Fristen bei offenen Steuerverfahren zu beachten. Unnötige personenbezogene Daten werden nicht in das Ereignisjournal übernommen.

Vor einer Kontolöschung muss ein vollständiger Export angeboten und deutlich auf gesetzliche Eigenverantwortung hingewiesen werden. Ein Workspace mit aufbewahrungsrelevanten Geschäftsdaten wird nicht unbemerkt hart gelöscht.

Backups schützen gegen Datenverlust, ersetzen aber weder das fachliche Änderungsprotokoll noch den Nutzerexport.

## Technisches Datenmodell

Die bestehende Architektur wird erweitert, nicht ersetzt.

### Bestehende Bausteine

- `purchases` als Einkaufskopf;
- `purchase_costs` für zusätzliche Einkaufskosten;
- `purchase_lines` für Positionen;
- `inventory_items` für einzeln nachverfolgte Stücke;
- `stock_lots` und `stock_movements` für Mengenbestand;
- `sale_lines` und Loszuordnungen für Verkauf und Wareneinsatz.

### Erforderliche Präzisierungen

1. Einkaufspositionen unterscheiden intern zwischen einer normal bepreisten Position und einem unbepreisten Mystery-Box-Inhalt. Mystery-Inhalte verwenden keinen fingierten Einkaufspreis von null.
2. Zusätzliche Einkaufskosten speichern ihre Verteilungsmethode und optional die direkt zugeordnete Position.
3. Einkäufe speichern Abschlusszeitpunkt und abschließenden Benutzer; Wareneingangsstatus und Erfassungsabschluss bleiben getrennte Sachverhalte.
4. Aggregierte Kostenanteile werden an Position bzw. Bestand gespeichert, ihre Herleitung bleibt durch Kostenzeilen und Protokoll reproduzierbar.
5. Ein neues unveränderbares fachliches Ereignisjournal speichert Korrekturen und automatisch ausgelöste Änderungen.

### Datenbankfunktionen

Kritische Abläufe laufen über atomare Postgres-Funktionen:

- Einkauf abschließen;
- Einkauf vor Verkauf wieder öffnen;
- Einkauf nach Verkauf korrigieren;
- Verkauf erfassen;
- Retoure erfassen;
- Prüfexport vorbereiten, soweit serverseitig erforderlich.

Alle Funktionen prüfen Workspace-Zugehörigkeit, Berechtigung, Status, Mengen und Kostensummen innerhalb derselben Transaktion. `security invoker` ist der Standard. Ein begründeter `security definer`-Einsatz setzt `search_path = ''` und vollqualifizierte Objektnamen voraus.

### RLS und Data API

Jede neue Tabelle erhält aktivierte RLS, getrennte Policies pro Operation und Rolle sowie Indizes auf Policy-Spalten. Direkte Update- und Delete-Rechte auf das Ereignisjournal werden nicht vergeben.

Neue Tabellen und Funktionen werden ausdrücklich für die benötigten Rollen freigegeben. Das ist auch wegen der angekündigten Änderung der automatischen Data-API-Freigabe erforderlich: [Supabase-Changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

Nach Schemaänderungen werden die Supabase-Typen neu generiert. Änderungen erfolgen zuerst in `supabase/schemas/`; Migrationen werden daraus erzeugt.

## Übernahme vorhandener Daten

Vor der Migration werden eine Sicherung und ein reiner Prüflauf erstellt.

Der aktuell geprüfte Produktivstand enthält:

- 9 Einkäufe;
- 13 Inventarartikel;
- 4 Verkäufe;
- 0 Einkaufspositionen;
- bei allen Inventarartikeln `allocated_purchase_cost = 0`;
- dadurch bei allen Verkaufspositionen `cost_of_goods_sold = 0`.

### Automatisch reparierbare Fälle

Bestehende Mystery Boxen mit verknüpften Artikeln erhalten eine gleichmäßige Verteilung ihrer tatsächlichen Gesamtkosten auf alle verknüpften Stücke, einschließlich bereits verkaufter Stücke.

Bei bereits verkauften Artikeln werden anschließend Wareneinsatz, Ergebnis und Marge neu berechnet. Verkaufspreise, Gebühren, Plattform und Verkaufsdatum bleiben unverändert.

Der Protokolltext lautet beispielsweise:

> Kostenverteilung bei Datenübernahme ergänzt

### Nicht automatisch ableitbare Fälle

Einkäufe ohne verknüpfte Artikel bleiben erhalten und werden mit **Artikel noch erfassen** gekennzeichnet. Unklare normale Einkäufe erhalten **Prüfung erforderlich**. Flipbase erfindet weder Mengen noch Einkaufspreise.

Für jeden migrierten Einkauf wird geprüft:

```text
Summe aller Kostenanteile = Gesamtkosten des Einkaufs
```

Die Produktionsmigration erfolgt erst nach einem Bericht über alle betroffenen IDs, Summen, Rundungsreste und nicht automatisch lösbaren Fälle.

## Fehlerbehandlung

- Ein fehlgeschlagener Abschluss oder eine Korrektur hinterlässt keinen teilweise geänderten Bestand.
- Die Oberfläche meldet Erfolg erst nach bestätigter Datenbanktransaktion.
- Fehlende Verknüpfungen, ungültige Mengen und nicht auflösbare Rundungsdifferenzen werden verständlich angezeigt.
- Dynamisch geladene Seiten behalten den bereits geplanten Wiederherstellungsmechanismus für veraltete Browser-Chunks; dieser technische Fehler ist unabhängig vom Kostenmodell zu testen.
- Verkaufte oder aufbewahrungsrelevante Datensätze werden archiviert, storniert oder korrigiert, nicht frei gelöscht.

## Tests und Abnahmekriterien

### Kostenmodell

1. Ein normaler Einkauf mit mehreren Positionen behält alle eingegebenen Stückpreise unverändert.
2. Zusätzliche Kosten werden standardmäßig proportional zum Warenwert verteilt.
3. Die alternativen Verteilungen nach Stückzahl und direkter Zuordnung funktionieren reproduzierbar.
4. Eine Mystery Box verlangt für ihren Inhalt keinen Einkaufspreis.
5. Mystery-Box-Gesamtkosten werden gleichmäßig pro Stück verteilt.
6. Mengen größer eins zählen vollständig in die Verteilung.
7. Rundungsreste führen nie zu einer Differenz zwischen Gesamtkosten und Kostenanteilen.
8. Geschätzte Marktwerte verändern keine Kosten- oder Ergebnisberechnung.

### Abschluss und Korrektur

9. Ein Entwurf erzeugt keinen verkaufsbereiten Bestand.
10. Ein erfolgreicher Abschluss erzeugt Kosten und Bestand atomar.
11. Vor dem ersten Verkauf kann der Einkauf wieder geöffnet werden.
12. Nach einem Verkauf ist ein Korrekturgrund erforderlich.
13. Eine Korrektur aktualisiert Wareneinsatz und Ergebnis nachvollziehbar.
14. Vorherige Werte bleiben im unveränderbaren Ereignisjournal sichtbar.

### Oberfläche

15. Einkäufe erscheinen als breite responsive Einträge untereinander.
16. Normaler Einkauf und Mystery Box zeigen die jeweils passenden Spalten.
17. Inventar besitzt keine getrennten Tabs für Bestand und Einzelstücke.
18. Menge eins wird nicht zusätzlich als `Einzelstück` beschriftet.
19. Fehlende Kosten erscheinen als **Kosten noch offen**, nicht als `0,00 €`.
20. Zustände und Statuswerte werden übersetzt und mit gemeinsamen Komponenten dargestellt.
21. Ein verkaufter Artikel zeigt einen festen **Verkauft**-Badge und den zugehörigen Verkauf.

### Verkauf und Dashboard

22. Verkaufserlös umfasst Artikelpreis und vom Käufer bezahlten Versand.
23. Verkaufskosten umfassen Plattformgebühr, tatsächlich bezahlten Versand und weitere Verkaufskosten.
24. Ergebnis und Marge verwenden auf allen Seiten dieselbe Formel.
25. ROI fehlt in der normalen Verkaufsliste und ist ohne Wareneinsatz nicht berechenbar.
26. Dashboard und Verkaufsjournal verwenden **Wareneinsatz** statt `COGS`.
27. Der Chart besitzt Tooltips, Filter und eine zugängliche Datentabelle.

### Einstellungen, Rechte und Export

28. Jeder Einstellungsbereich besitzt eine eigene Route.
29. Desktop und Mobilgerät erhalten eine zugängliche Einstellungsnavigation.
30. Das globale Protokoll ist rollen- und workspacegetrennt.
31. Ereigniseinträge können durch Anwendungsrollen weder verändert noch gelöscht werden.
32. Einzelverlauf, PDF und maschineller Export enthalten dieselben fachlichen Änderungen.
33. Der vollständige Export enthält IDs und Beziehungen zwischen Einkäufen, Positionen, Kosten, Bestand, Verkäufen und Ereignissen.
34. RLS-Tests verhindern Zugriff auf Daten eines anderen Workspace.

### Migration

35. Vorhandene Einkäufe, Artikel, Verkäufe, Kosten, Medien und IDs bleiben erhalten.
36. Automatisch reparierte Mystery Boxen verteilen exakt ihre vorhandenen Gesamtkosten.
37. Verkäufe behalten Erlös, Gebühren, Plattform und Datum.
38. Nicht ableitbare Daten werden markiert und nicht geschätzt.
39. Der Prüflauf kann vor der produktiven Migration ohne Schreibzugriff ausgeführt werden.

## Nicht Bestandteil des ersten Umsetzungspakets

- automatische Marktpreisrecherche;
- automatische Steuerberatung oder verbindliche steuerliche Freigabe;
- Gewichts- und Volumenverteilung von Einkaufskosten;
- mehrere Lagerorte und Umlagerungen;
- Lieferantenbestellungen oder Eingangsrechnungen als vollständiges ERP-Modul;
- beliebige frei konfigurierbare Kostenformeln;
- ein vollständiges Finanzbuchhaltungs- oder Jahresabschlussmodul.

## Empfohlene Umsetzungsreihenfolge

1. Schema und Transaktionsfunktionen für Kostenverteilung, Abschluss, Korrektur und Ereignisjournal;
2. reiner Altdaten-Prüflauf und Migrationswerkzeuge;
3. Einkaufsabläufe und verständliche Begriffe;
4. gemeinsame Inventaransicht;
5. Verkaufskennzahlen und Dashboard;
6. Einstellungs-Grundseite, Protokollansichten und Exporte;
7. End-to-End-Prüfung mit echten Standard- und Mystery-Box-Fällen;
8. kontrollierte Produktivmigration und anschließender Datenabgleich.
