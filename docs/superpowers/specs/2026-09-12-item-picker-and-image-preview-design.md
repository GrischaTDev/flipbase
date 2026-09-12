# Artikelauswahl und Bildvorschau

**Datum:** 2026-09-12
**Zweig:** `feat/item-picker-and-image-preview` (von `master`)

## Problem

Drei Beobachtungen aus der Arbeit mit der Artikelauswahl im Einkauf:

1. Die Checkboxen erscheinen in Grün. Die Komponente kennt nur `emerald` und
   `indigo`; beide verbietet `docs/design/admin-ui-guidelines.md`, und keine
   einzige Stelle im Projekt setzt den Eingang. Es ist eine Altlast.
2. Auswählen geht nur über die kleine Checkbox. Mehrere Artikel nacheinander
   anzuhaken ist dadurch unnötig langsam.
3. Auf den kleinen Vorschaubildern lässt sich ein Artikel oft nicht erkennen.

Beim Lesen fiel zusätzlich auf: die Checkbox hat keinen sichtbaren Fokusring
(`outline-none` auf der Box, nichts auf dem Knopf). Per Tastatur ist nicht
erkennbar, wo man steht — ein Verstoß gegen WCAG 2.4.7.

## Entwurf

### Checkbox in Logo-Gelb

Der Eingang `color` entfällt ersatzlos. Angehakt und unbestimmt verwenden
`bg-fb-primary` und `border-fb-primary`, der Haken `fb-on-accent`; beim Hover
auf eine leere Box färbt sich der Rand in `fb-primary`. Das ist dasselbe
Farbpaar wie beim gelben Primärknopf, dessen Lesbarkeit die bestehenden
Playwright-Prüfungen bereits messen.

Der Knopf bekommt einen sichtbaren Fokusring (`focus-visible:outline-2`,
`outline-offset-2`, `outline-fb-accent`-Äquivalent aus den Marken-Token).

Die Umstellung wirkt projektweit: Artikelauswahl, Inventar, Listing Studio,
Einstellungen, Registrierung, Spaltenauswahl.

### Zeile klickbar in der Artikelauswahl

Jede Zeile bekommt einen Hover-Hintergrund und reagiert auf einen Klick
irgendwo in der Zeile.

**Die Zeile wird ausdrücklich kein Knopf.** Ein Bedienelement in einem
Bedienelement ist ungültiges HTML, und die Bildvorschau braucht innerhalb der
Zeile ein eigenes. Die echte Checkbox bleibt deshalb das Bedienelement für
Tastatur und Screenreader; der Klick auf die Zeile ist eine reine
Maus-Abkürzung darüber. Der Klick auf das Bild öffnet nur die Vorschau und
wählt nicht mit aus.

Das Doppel-Umschalten beim Klick direkt auf die Checkbox verhindert deren
`toggle` bereits selbst über `stopPropagation`.

### Bildvorschau

Die Vorschau kommt in `app-product-thumbnail` und wirkt damit an allen vier
Stellen mit Artikelbildern: Artikelauswahl im Einkauf, Positionsbearbeitung,
Artikelstamm-Tabelle, Inventarliste.

- **Öffnen:** Zeigergerät mit rund 200 ms Verzögerung, damit beim Überfliegen
  einer Liste nichts aufblitzt. Antippen öffnet sofort, Tastaturfokus ebenso.
- **Schließen:** Escape, Zeiger verlässt Auslöser und Vorschau, Fokusverlust,
  Scrollen, erneutes Antippen.
- **Darstellung:** höchstens 20 rem breit und 70 % der Fensterhöhe hoch,
  `object-contain`, neben dem Auslöser; kein Platz rechts, klappt sie nach
  links, unten entsprechend nach oben.
- **Ebene:** die native Popover-Ebene. Ohne sie schneiden Tabellen und Dialoge
  mit `overflow-hidden` die Vorschau ab.
- Ohne Bild passiert nichts: kein Auslöser, kein Fokusstopp, kein leeres
  Popup.

WCAG 1.4.13 ist damit erfüllt: mit Escape schließbar, der Zeiger darf auf die
Vorschau wandern, ohne dass sie verschwindet, und sie bleibt stehen, solange
Zeiger oder Fokus auf dem Auslöser sind.

## Abgrenzung

Artikelstamm und Inventar bleiben unangetastet. Der Knopf „Produkt erstellen"
im Inventar öffnet denselben Dialog wie der Artikelstamm und legt einen
`catalog_products`-Eintrag ohne Bestand an; Stammartikel lassen sich nirgends
bearbeiten. Beides sind echte Fehler, hängen aber an der offenen Frage nach
dem Bestandsmodell (`stock_lots` mengenbasiert gegen `inventory_items`
stückbasiert) und bekommen eine eigene Runde.

Bilder außerhalb von `app-product-thumbnail` (Artikeldetail, Shop,
Bildoptimierer) bleiben ebenfalls unberührt; dort ist das Bild ohnehin groß.

Keine Backend- oder Schemaänderung.

## Prüfung

Einheitentests für die Auf- und Zu-Logik der Vorschau, Komponententests für
Zeilenklick, Checkbox-Farbe und Fokusring. Sichtprüfung in der Demo an allen
vier Bildstellen in hell, dunkel und mobil. `npm run verify` und die
betroffenen Playwright-Abläufe.
