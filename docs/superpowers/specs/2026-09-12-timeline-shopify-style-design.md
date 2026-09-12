# Chronik im Shopify-Stil

**Datum:** 2026-09-12
**Zweig:** `feat/timeline-shopify-style` (von `master`, ab3f8d1)

## Problem

Die gemeinsame Chronik von Einkäufen und Verkäufen zeigt trockene Etiketten
(`Grischa Tänzer · Einkaufsentwurf geändert`), einen eigenen Knopf
`Details ansehen` und dahinter eine Liste, die auch dann lang wird, wenn sich
fachlich nichts Nennenswertes geändert hat. Beim Anlegen eines Entwurfs
schickt die Datenbank `before: null` und danach den vollständigen
Schnappschuss aus Einkauf, Positionen und Kosten — der Vergleich hält deshalb
jedes einzelne Feld für eine Änderung. Zusätzlich bricht die Zeitleisten-Linie
zwischen den Tagesabschnitten ab.

## Ziel

Aufbau wie in der Shopify-Bestellchronik: ein Satz je Ereignis, die ganze
Zeile klappt sich auf, und aufgeklappt stehen nur echte Änderungen.

## Entwurf

### Satz statt Etikett

Gespeichert wird nur das Prädikat (`diesen Einkauf erstellt`). Das Subjekt
entsteht zur Laufzeit:

- eigener Verursacher → `Du hast <Prädikat>.`
- fremder Verursacher → `<Name> hat <Prädikat>.`
- kein Verursacher → `Das System hat <Prädikat>.`

Zuordnung über `actorId` des Ereignisses gegen die angemeldete Kennung.
Unbekannte Ereignistypen behalten die heutige Form `Name · Etikett`; es wird
kein Satz erfunden.

| Ereignistyp                                               | Prädikat                                  |
| --------------------------------------------------------- | ----------------------------------------- |
| `purchase_draft_created`                                  | diesen Einkauf erstellt                   |
| `purchase_draft_updated`                                  | diesen Einkaufsentwurf geändert           |
| `purchase_ordered`                                        | diesen Einkauf als bestellt markiert      |
| `purchase_arrived`                                        | diesen Einkauf als angekommen markiert    |
| `purchase_finalized`, `purchase_costing_finalized`        | diesen Einkauf abgeschlossen              |
| `purchase_corrected`                                      | diesen abgeschlossenen Einkauf korrigiert |
| `purchase_reopened`                                       | diesen Einkauf wieder geöffnet            |
| `purchase_tracking_added`                                 | eine Sendungsnummer hinterlegt            |
| `purchase_tracking_updated`                               | die Sendungsverfolgung aktualisiert       |
| `purchase_tracking_removed`                               | die Sendungsnummer entfernt               |
| `purchase_costing_legacy_migrated`                        | Altdaten dieses Einkaufs übernommen       |
| `sale_recorded`                                           | diesen Verkauf erfasst                    |
| `sale_finalized`                                          | diesen Verkauf abgeschlossen              |
| `sale_voided`                                             | diesen Verkauf storniert                  |
| `sale_refund_updated`                                     | die Erstattung aktualisiert               |
| `sale_return_recorded`, `sale_returned`, `return_created` | eine Retoure erfasst                      |

### Aufklappen

Eine Zeile ist aufklappbar, wenn nach dem Filtern mindestens eine Änderung
übrig bleibt. Dann ist die ganze Zeile ein Knopf mit `aria-expanded` und
einem Pfeil rechts. Bleibt nichts übrig, ist die Zeile schlichter Text ohne
Fokus und ohne Klickfläche.

Nie aufklappbar, weil das Ereignis nichts über den Satz hinaus sagt:

- `purchase_draft_created` (reiner Anlege-Schnappschuss),
- `purchase_ordered` und `purchase_arrived` (nur Status und Ankunftszeit).

### Aufgeklappter Inhalt

Je echter Änderung eine Zeile `Bezeichnung   alt → neu`. Gefiltert wird:

- Werte, die auf beiden Seiten wie eine UUID aussehen,
- `created_at` und `updated_at`,
- je Ereignistyp die Felder, die der Satz bereits ausspricht,
- unveränderte Positionen (macht der Vergleich bereits).

Positionsbeschriftungen werden lesbar: statt `Positionen · Vorher · 1 · Menge`
künftig `Position 1 · Menge`, `Position 3 hinzugefügt`, `Position 2 entfernt`.

Ab 13 Änderungen zeigt der Bereich die ersten 12 und darunter
`Alle N Änderungen zeigen`. Es wird nichts dauerhaft verborgen — die Chronik
ist ein Prüfprotokoll.

### Zeitleiste

Eine durchgehende Linie über die gesamte Chronik statt einer Linie je
Tagesabschnitt. Sie beginnt am ersten und endet am letzten Punkt.
Tagesüberschriften stehen bündig mit der Inhaltsspalte, Punkte mittig auf der
Linie, Uhrzeit rechtsbündig.

## Umfang

Die Chronik ist ein gemeinsamer Baustein für Einkäufe und Verkäufe; der Umbau
wirkt bewusst auf beide.

- `src/app/features/audit/components/record-timeline/record-timeline.component.{ts,html}`
- neu: `src/app/features/audit/models/timeline-sentence.ts`
- `src/app/shared/components/record-history/record-history.component.ts`
  (bessere Positionsbeschriftungen, kommt auch dem Artikelverlauf zugute)

Die Attribute `data-timeline-kind` und `data-timeline-id` bleiben erhalten,
damit `e2e/record-timeline.spec.ts` gültig bleibt.

## Abgrenzung

Keine Backend- oder Schemaänderung. Es werden keine Ereignisse erfunden, die
die Datenbank nicht schreibt.

## Prüfung

Einheitentests für Satzbildung und Filter, Komponententests für
Aufklapp-Verhalten und Nicht-Aufklappbarkeit, bestehender Playwright-Ablauf,
`npm run verify`.
