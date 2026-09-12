# Bezeichnung im Einkauf und Spaltenreihenfolge

**Datum:** 2026-09-12
**Zweig:** `feat/purchase-name-and-column-order` (von `master`, b413c44)

## Auslöser

Ein Playwright-Test scheiterte. Die Spurensuche legte eine Kette frei, die
mehr betrifft als den Test.

## Befund

**Das Formular hat ein Feld für die Bezeichnung, das niemand sehen kann.**
`purchase-entry-form.component.ts` legt ein Steuerfeld `title` ohne
Pflichtprüfung an; in der Vorlage gibt es dazu kein Eingabefeld. Es bleibt
darum immer leer. Die Datenbank verlangt eine Bezeichnung ausdrücklich
(`purchases.title TEXT NOT NULL`), ein leerer Text erfüllt das formal.

Daraus folgt alles Weitere: Die Liste liest `purchase.title` und fällt über
`supplier?.name` auf das nichtssagende `'Einkauf'` zurück. Drei Browsertests
erwarten an dieser Stelle den Text aus „Beschreibung (optional)" — der schreibt
aber nach `notes` und taucht dort nie auf. Die Tests stammen aus einer Zeit,
als es das Eingabefeld noch gab.

**Der vierte Test** ist unabhängig veraltet: Commit `ba9dae1` vom 11.09.2026
hat den Knopf im Verkäuferdialog bewusst von `dialogTitle()` („Verkäufer
erstellen") auf das feste „Speichern" umgestellt, ohne den Test nachzuziehen.

**Warum es niemand gemerkt hat:** Von 63 Browsertests laufen nur 8 in der CI.
`playwright.pr.config.ts` und `playwright.nightly.config.ts` filtern beide auf
`@pr-smoke`. In zwei der betroffenen Dateien trägt jeweils ein Test die
Markierung, und ausgerechnet die unmarkierten Geschwister daneben sind rot —
die Dateien sehen abgedeckt aus, sind es aber nicht.

## Entwurf

### Feld „Bezeichnung"

Ein einzeiliges, **optionales** Feld an erster Stelle der Karte „Verkäufer und
Einkauf", gebunden an das vorhandene Steuerfeld `title`. Es benennt den
Einkauf, deshalb steht es über Verkäufer und Kaufdatum.

„Beschreibung (optional)" bleibt unverändert das dreizeilige Notizfeld in den
Einkaufsdetails. Zwei Felder mit je einer klaren Aufgabe statt eines Feldes,
das beides sein soll.

Bleibt die Bezeichnung leer, greift der bestehende Rückfall auf den Verkäufer
und zuletzt auf `'Einkauf'`. Das ist ausdrücklich in Ordnung, weil der
Verkäufer in der Liste weiter nach vorn rückt.

### Spaltenreihenfolge der Einkaufsliste

Neu: Einkauf, **Verkäufer**, Bezeichnung, Kaufdatum, Status, Erhalten, Gesamt.
Bisher stand der Verkäufer hinter der Bezeichnung. So ist ein Einkauf auch ohne
Bezeichnung erkennbar.

Gespeicherte Voreinstellungen behalten ihre eigene Reihenfolge; eine geänderte
Vorgabe erreicht vorhandene Nutzer sonst nie. Deshalb eine eng gefasste
einmalige Übernahme im `TablePreferencesService`, nach dem Vorbild der dort
bereits vorhandenen Bereinigung entfernter Einkaufsspalten: Sie greift **nur**,
wenn die gespeicherte Reihenfolge exakt der alten Vorgabe entspricht. Wer seine
Spalten selbst sortiert hat, behält seine Sortierung unangetastet.

### Die vier Tests

| Test                                | Änderung                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `purchase-entry.spec.ts:205`        | Knopf heißt „Speichern" statt „Verkäufer erstellen"                                                                                                                                                                                                                                                                                     |
| `purchase-dropdown-layer.spec.ts:4` | füllt „Bezeichnung" statt „Beschreibung"                                                                                                                                                                                                                                                                                                |
| `purchase-header-polish.spec.ts:4`  | füllt „Bezeichnung" statt „Beschreibung"                                                                                                                                                                                                                                                                                                |
| `purchase-workspace.spec.ts:16`     | `input#purchase-base-price` gibt es nicht mehr; der Warenbetrag entsteht heute aus den Positionen. Ersetzt durch den Weg, den der bestehende grüne Test `distributes a package price per position` benutzt: Position anlegen, „Paketpreis verteilen", Gesamtpreis 100. Die Notizprüfung über „Beschreibung (optional)" bleibt erhalten. |

## Abgrenzung

Die CI-Abdeckung bleibt auf ausdrücklichen Wunsch unverändert. Dass 55 von 63
Browsertests nirgends automatisch laufen, ist hier festgehalten, aber nicht
geändert.

Artikelstamm gegen Inventar bleibt weiterhin offen und unberührt.

Keine Backend- oder Schemaänderung. `purchases.title` ist bereits vorhanden.

## Prüfung

Komponententests für das neue Feld und die Spaltenübernahme, die vier
reparierten Browsertests, der vollständige lokale Browserlauf zum Abgleich
gegen die vier bekannten Fehler, `npm run verify`, Sichtprüfung in der Demo.
