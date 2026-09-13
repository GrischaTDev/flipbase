> **Präzisierung nach Nutzerfreigabe:** Das Paket ist ausschließlich eine bezahlte Einkaufsposition. Es entsteht kein verkäuflicher Paketartikel. Der bestätigte Umsetzungsvertrag steht in [Paketinhalt erfassen](../superpowers/plans/2026-09-13-purchase-package-contents.md). Frühere Vorschläge zur Bestandsumwandlung unten sind Recherchekontext und insoweit überholt.

# Paket einkaufen und Inhalt später erfassen

Status: Umsetzung auf `codex/mystery-pack-model` lokal abgeschlossen und geprüft.
Stand: 13. September 2026; Ausgangsbefund war `origin/master` bei `0dad469`.

## Ausgangspunkt

Der Nutzer kauft inzwischen überwiegend Kleidung mit bekannten Einzelpreisen.
Das bleibt der normale Einkauf: Artikel auswählen, Menge und tatsächlichen
Stückpreis erfassen. Gelegentliche unbekannte Paketinhalte sollen die normale
Erfassung nicht komplizierter machen.

Ein Einkauf von „1 × Mystery Pack, 100 Euro“ ist ein vollständiger kaufmännischer
Sachverhalt, auch ohne Kenntnis seiner Bestandteile. Beschreibung und Bilder
können den bekannten Inhalt erläutern. Der Nutzer hat ausdrücklich bestätigt:
Er öffnet das Paket und verkauft die enthaltenen Artikel einzeln. Dieser Weg
ist der maßgebliche Umfang. Ein vollständiger Weiterverkauf des Pakets dient
nur der begrifflichen Abgrenzung und erweitert die nächste Umsetzung nicht.

## Vergleich mit Herstellerdokumentation

| System  | Belegter Ablauf                                                                                                                                                                | Passung und Grenze                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ERPNext | „Repack Entry“ verbraucht eingekaufte Ausgangsartikel und erzeugt andere Bestandsartikel; mit oder ohne Stückliste möglich. Die entstehenden Artikel benötigen eine Bewertung. | Engster gefundener Vergleich für einen unbekannten Paketinhalt. Kein belegter fertiger Mystery-Pack-Assistent und keine Aussage zur deutschen Differenzbesteuerung. |
| Odoo 19 | „Unbuild Orders“ vermindern den Ausgangsbestand und erhöhen den Bestand seiner Komponenten. Eine Stückliste wird ausgewählt.                                                   | Passendes Prinzip der Bestandsumwandlung, aber auf bekannte Zusammensetzung ausgerichtet.                                                                           |
| inFlow  | „Disassemble“ erzeugt eine Bestandskorrektur: Ausgangsprodukt weniger, Komponenten mehr. Die Zuordnung folgt der Stückliste.                                                   | Gleiches Grundprinzip; unbekannte Inhalte müssten erst beschrieben werden.                                                                                          |
| Shopify | Feste Bundles und Multipacks bestehen aus zugeordneten Produkten; Verfügbarkeit wird aus Komponentenbeständen ermittelt.                                                       | Gut für den gemeinsamen Verkauf bekannter Artikel. Kein Beleg für die Verarbeitung eines unbekannten Einkaufspakets.                                                |

Quellen:

- [ERPNext: Repack Entry](https://docs.frappe.io/erpnext/repack-entry)
- [Odoo 19: Unbuild Orders](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/workflows/unbuild_orders.html)
- [inFlow: Disassemble products](https://www.inflowinventory.com/support/cloud/how-to-disassemble-products-in-inflow/)
- [Shopify: Bundle types and inventory](https://help.shopify.com/en/manual/products/bundles/eligibility-and-considerations)

Die folgenden Entscheidungen sind eine Ableitung für Flipbase, keine Behauptung,
dass ein Hersteller den gesamten Anwendungsfall bereits genauso umgesetzt hat.

## Vorgeschlagener Nutzerablauf

1. Ein Paket wie ein Produkt zum Einkauf hinzufügen, z. B. „Mystery Pack Kleidung“,
   Menge 1, Preis 100 Euro. Ein beliebiger Titel allein löst keine Speziallogik aus.
   Bilder und Beschreibung bleiben optional. Es werden keine unbekannten
   Einzelartikel und keine vermeintlichen Rechnungspreise erfunden.
2. Beim Wareneingang entsteht ein Paket im Bestand mit Bezug zu seiner konkreten
   Einkaufsposition. Derselbe Produktstamm darf erneut verwendet werden; jedes
   tatsächlich eingekaufte Paket behält jedoch seine Herkunft und Kosten.
3. Wird das Paket vollständig weiterverkauft, wird es als eine Bestandseinheit
   verkauft. Eine technische Auflösung in Bestandskomponenten ist dafür nicht
   erforderlich. Daraus folgt keine pauschale Aussage zur Besteuerung beliebiger
   Zusammenstellungen unterschiedlicher Waren.
4. Soll der Inhalt einzeln verkauft werden, gibt es am Paket die Aktion
   „Inhalt erfassen“. Hier entstehen die später einzeln verkaufbaren Artikel mit
   Bezeichnung, Menge, Zustand und bei Bedarf Bildern. Ein Rechnungs-Einzelpreis
   wird für diese Inhalte nicht verlangt.
5. Die Erfassung kann als Entwurf gespeichert werden. Solange sie offen ist,
   werden Paket und daraus vorgemerkte Inhalte nicht gleichzeitig verkaufbar.
   Die vollständige Bestandsumwandlung wird einmal bestätigt: Paketbestand sinkt,
   Inhalte gelangen in den Bestand. Ein Abbruch verändert den Bestand nicht.
6. Die Herkunft bleibt an den Einzelartikeln sichtbar: „Aus Paket … / Einkauf …“.
   Die ursprüngliche Einkaufsposition und ihr Preis bleiben unverändert.

Der normale Einkauf braucht dadurch keinen Schalter zwischen Mengenartikel und
Einzelstück und keinen vorgeschalteten Dialog über eine Verteilungsmethode.
Die Bestandsumwandlung ist eine spätere Aktion, keine neue Hauptnavigation.

## Paketpreis und interne Bewertung

Tatsächlich bezahlter Paketpreis und intern zugeordneter Kostenanteil sind zwei
verschiedene Angaben. Der Einkauf bleibt bei 100 Euro. Ein Inhalt kann dabei
„Einzelpreis nicht separat vereinbart“ tragen und dennoch einen dokumentierten
Kostenanteil für Bestandswert, Ergebnis und Steuerberechnung erhalten.
Die Paketseite zeigt den Originalpreis; am Inhalt heißt der Wert ausdrücklich
„Zugeordneter Kostenanteil“. Er ist keine nachträgliche Einkaufsposition.

Die Quelle für die notwendige Unterscheidung ist insbesondere
[BFH V R 37/15, Entscheidungsgründe II.2.c](https://www.bundesfinanzhof.de/de/entscheidung/entscheidungen-online/detail/STRE201710156/):
Für einzeln weiterverkaufte Gegenstände aus einem Gesamteinkauf ist grundsätzlich
eine sachgerechte Schätzung des Einkaufsanteils nötig. Eine bloße Verrechnung
aller Einnahmen gegen einen Paketpreis über mehrere Steuerzeiträume ersetzt
die vorgesehene Steuerermittlung nicht. Das Urteil stammt aus 2017; seine damalige
Betragsgrenze darf nicht als heutiger Wert übernommen werden.

Die Gesamtdifferenz nach [§ 25a Abs. 4 UStG](https://www.gesetze-im-internet.de/ustg_1980/__25a.html)
betrifft einen Besteuerungszeitraum und hat Voraussetzungen; die aktuelle Grenze
beträgt 750 Euro je Gegenstand. Sie ist kein frei wählbarer Gewinnmodus pro Paket.
Eine steuerliche Eignung ergibt sich zudem nicht aus der Produktbezeichnung
„Mystery Pack“ oder aus dem Umstand, dass es sich um Kleidung handelt.

Für die bestehende Einzeldifferenzberechnung bedeutet das: Kostenzuordnung erst
beim Auflösen sichtbar machen, als interne Bewertung klar benennen und ihre
Grundlage speichern. Keine stillen Nullwerte und keine generelle Gleichverteilung
für beliebige gemischte Ware. Bereits erfasste realistische erwartete Verkaufspreise
können eine Vorschlagsgrundlage liefern; fehlen belastbare Werte, darf die Software
sie nicht erfinden. Eine Schätzung muss zur konkreten Ware passen und vor der
Verwendung dokumentiert bestätigt werden. Nachträgliche Änderungen von Angebotspreisen
dürfen bestätigte Kostenanteile nicht automatisch verändern. Die konkrete
Bewertungsregel bleibt ein ausdrücklich offener Teil der Ausgestaltung.

Eine Paketübersicht kann zusätzlich Einkaufsauszahlung, bisherige Verkaufserlöse
und verbleibende Stücke zeigen. „Einnahmen minus Paketpreis“ ist dabei als solche
Übersicht zu bezeichnen, nicht als abschließender Gewinn bei noch vorhandenem
Restbestand und nicht als steuerliche Bemessungsgrundlage.

## Ausgangsbefund vor der Umsetzung

- `PurchaseType` kennt `single`, `mystery_pack`, `lot`, `pallet`. Das beschreibt
  bisher den Einkauf, nicht die nachvollziehbare Umwandlung einer Paketposition.
- `PurchaseEntryFormComponent.confirmPackagePrice` ruft die Verteilung auf,
  setzt danach `pricing_mode` auf `individual` und erzeugt Positionspreise.
  `allocatePackagePrice` verteilt dabei nach Positionen.
- `build_purchase_costing_plan` behandelt `pricing_mode = total` anders:
  Positionen bleiben unbepreist; der Abschluss verteilt intern nach Einheiten.
- „Inhalt erfassen“ und `content_status` sind schon vorhanden, öffnen aber den
  Einkaufseditor. Der geprüfte Weg bietet keine eigene dokumentierte Umwandlung
  eines vorhandenen Paketbestands in seine später erfassten Inhalte.

Damit liegen zwei unterschiedliche Paketpreiswege vor. Die sichtbare Verteilung
in vermeintliche Einzelpreise sollte den vorgeschlagenen Paketablauf nicht
bilden. Vorhandene historische Zuordnungen werden bei einer Umsetzung nicht
still rückgängig gemacht.

## Leitplanken für eine spätere Implementierung

- Paketpreis liegt an der konkreten Einkaufsposition. Ein Einkauf darf bekannte
  Einzelartikel und Paketpositionen gemeinsam enthalten.
- Inhaltserfassung besitzt einen ausdrücklichen Herkunftsbezug zur Paketinstanz,
  nicht nur einen Freitextverweis oder den Namen eines wiederverwendeten Produkts.
- Bestandsabgang des Pakets und Bestandszugang seiner Inhalte erfolgen atomar,
  mit Schutz gegen doppelte Bestätigung und parallelen Verkauf des Pakets.
- Bekannte Einzelpreise, interner Warenkostenanteil und Zusatzkosten bleiben
  getrennt; die Trennung des steuerlichen Einkaufspreises aus PR #68 bleibt erhalten.
- Paket und Inhalt dürfen weder Stückzahl noch Wert doppelt zum Bestand beitragen.
- Ausschuss, fehlender Inhalt, Rücknahmen und spätere Korrekturen benötigen
  nachvollziehbare Ereignisse; Werte dürfen nicht still auf Reststücke wandern.
- Die neue Stückkostenbasis muss bis zum Verkaufssnapshot und Export durchlaufen.
- Gezielte Abnahmetests: Paket unverändert verkaufen; Paket auflösen; zwei Pakete
  desselben Produkts mit verschiedenen Einkaufspreisen; gemischter Einkauf;
  Entwurfsabbruch; doppelte Bestätigung; Verkauf während Auflösung; Centrest;
  ungeklärte Bewertung; Retoure mit ursprünglichem Herkunftsbezug.

In dieser Sitzung wurden ausschließlich Recherche und Dokumentation erstellt.
Es wurden keine Produktivdaten, Anwendungscode oder Datenbankschemata geändert.
