# Administration: Unterpunkte in der Seitenleiste statt Reiter

Stand: 13.09.2026 · Zweig `feat/admin-sidebar-navigation` (von `origin/master` 0dad469)

## Problem

Die Administration hat vier Unterseiten (Bewerbungen, Sammelaufträge,
Botbetrieb, Kategorieliste). Sie sind heute über eine Reiterleiste oben im
Inhalt erreichbar (`platform-admin-shell`). Das wirkt unruhig, und die vier
Seiten sind unterschiedlich gebaut:

| Seite          | Außenrahmen                    | Überschrift        |
| -------------- | ------------------------------ | ------------------ |
| Bewerbungen    | `space-y-4`, kein eigener Rand | `app-page-header`  |
| Sammelaufträge | `max-w-7xl p-6`                | `app-page-header`  |
| Botbetrieb     | `max-w-7xl p-6`                | `app-page-header`  |
| Kategorieliste | `max-w-3xl p-6`                | eigenes `h1` + `p` |

Das Grundgerüst (`shell.component.html`) setzt bereits `p-4 md:p-5` um jede
Seite. Das zusätzliche `p-6` ergibt doppelten Rand.

## Ziel

Wie im Shopify-Admin: Unterpunkte eines Bereichs klappen in der Seitenleiste
unter dem Bereich auf. Administration ist der erste Bereich. Die Lösung muss so
allgemein sein, dass Einstellungen oder Artikel später ohne Umbau folgen können.
Die eigentliche Umstellung dieser Bereiche gehört **nicht** zu diesem Zweig.

## Entscheidungen (mit dem Nutzer abgestimmt)

- Shopify-Verhalten: kein Pfeil-Knopf, kein gemerkter Offen-Zustand.
- Seitenleiste und Aufräumen der vier Seiten kommen in denselben Zweig.
- Weg A: Die Seitenleiste lernt Unterpunkte allgemein. Ein Sonderfall nur für
  Administration wird nicht gebaut.

## Teil 1: Seitenleiste

### Daten

- Neue Datei `src/app/core/config/platform-admin-navigation.ts` mit
  `PLATFORM_ADMIN_NAVIGATION`: Liste aus `{ label, path }` mit vollständigen
  Pfaden (`/admin/applications`, `/admin/queries`, `/admin/operation`,
  `/admin/categories`), in dieser Reihenfolge. Vorbild ist
  `core/config/article-navigation.ts`.
- `NavItem` in `sidebar.component.ts` bekommt ein optionales Feld
  `children: readonly { label: string; path: string }[]`.
- `operatorItem` erhält `children: PLATFORM_ADMIN_NAVIGATION`.

### Verhalten

- Der Link „Administration“ zeigt weiter auf `/admin`. Die Route leitet wie
  bisher auf `/admin/applications` weiter.
- Ein Bereich gilt als offen, wenn der Pfad der aktuellen Adresse (ohne `?` und
  `#`) gleich dem Bereichspfad ist oder mit `Bereichspfad + '/'` beginnt. Das ist
  dieselbe Regel wie in `isItemActive`.
- Nur bei offenem Bereich werden die Unterpunkte gerendert (`@if`, nicht per
  CSS versteckt). Außerhalb von `/admin` stehen sie nicht im DOM.
- Aktiver Unterpunkt: dieselbe Pfadregel auf den Unterpunkt angewandt.
- Auszeichnung:
  - Bereichslink „Administration“ bei offenem Bereich: `font-semibold`, **kein**
    `aria-current`. So gibt es genau eine „aktuelle Seite“.
  - Aktiver Unterpunkt: `font-semibold text-fb-text-primary` und
    `aria-current="page"`. Das entspricht der heutigen Auszeichnung der
    Hauptpunkte. Keine neuen, geschätzten Shopify-Werte.
  - Nicht aktive Unterpunkte: `text-fb-text-secondary`, Hover wie die
    Hauptpunkte.
- Einrückung: Der Unterpunkt-Text fluchtet mit dem Text des Bereichslinks
  (Icon 16 px + Abstand 8 px, also `pl-8`). Unterpunkte haben kein Icon und
  dieselbe Zeilenhöhe und Schriftgröße (13 px) wie die Hauptpunkte.
- Aufbau: `<ul>` mit `<li><a>` direkt unter dem Bereichslink, innerhalb der
  vorhandenen `nav aria-label="Bereiche"`. Keine ARIA-Menürollen, keine
  Pfeiltasten-Steuerung (Richtlinie: „Navigation ist kein ARIA-Menü“).
- Ein Klick auf einen Unterpunkt schließt die Leiste auf dem Handy
  (`closed.emit()`), wie bei den Hauptpunkten.
- Sichtbarkeit nur für Betreiber bleibt unverändert (`isOperator()`).

## Teil 2: Admin-Seiten

- `platform-admin-shell` (Komponente, Vorlage, Test) entfällt.
- `platform-admin.routes.ts`: Die vier Seiten und die Weiterleitung von `''`
  auf `applications` hängen direkt in der Liste, ohne Hüllkomponente. Pfade,
  `canDeactivate` an `queries` und der Wächter auf `/admin` in `app.routes.ts`
  bleiben unverändert.
- Alle vier Seiten bekommen denselben Außenrahmen wie Einkäufe und Verkäufe:
  16 px Abstand zwischen den Blöcken (`flex flex-col gap-4`, wie bei den
  Bot-Seiten schon heute), ohne eigenen Rand und ohne `max-w-*` am Außenrahmen.
  Bewerbungen behält ihr gleichwertiges `space-y-4`.
- Alle vier Seiten nutzen `app-page-header` mit Titel und Untertitel. Die
  Kategorieliste ersetzt ihr eigenes `header`/`h1` dadurch. Titel und
  Untertitel bleiben inhaltlich wie heute.
- Die Kategorieliste hat wenig Inhalt (Kennzahlen und Einlesen). Ihr Inhalt
  unter dem Seitenkopf bleibt in einem Block mit `max-w-3xl`, damit er nicht
  über die ganze Breite gezogen wird. Der Seitenkopf läuft über die volle
  Breite, damit er mit den anderen drei Seiten fluchtet.
- Inhalt, Logik, Farben und Fehlermeldungen der Seiten werden nicht verändert.
  Ausnahme: Ein Wert, der nur durch den Rahmenwechsel falsch aussieht, wird
  angepasst und im Changelog begründet.

## Tests und Prüfung

- Neuer Test `src/app/layout/sidebar/sidebar.component.angular.spec.ts`,
  Betreiber-Dienst und PWA-Dienst als Attrappen:
  1. Auf `/admin/applications`: vier Unterpunkte mit Texten und `href` in der
     richtigen Reihenfolge.
  2. Nur der aktive Unterpunkt hat `aria-current="page"`, geprüft auf zwei
     verschiedenen Unterseiten. Der Bereichslink hat keins.
  3. Auf `/dashboard`: keine Unterpunkte im DOM.
  4. Kein Betreiber: weder Administration noch Unterpunkte.
  5. AXE ohne `serious`/`critical`-Befunde auf einer Admin-Unterseite.
- Bestehende Tests der vier Seiten laufen weiter. Prüfen sie die alte
  Überschrift der Kategorieliste, werden sie auf den Seitenkopf umgestellt.
- Kein Skript und kein Browsertest verweist auf `platform-admin-shell`
  (am 13.09.2026 geprüft). Der Hüllen-Test entfällt ohne weitere Anpassung.
- Vor dem PR: betroffene Tests, Format/Lint der geänderten Dateien und
  `npm run build` (Vorlagen). Dazu eine Sichtprüfung im Browser auf Desktop und
  Handybreite mit Bildschirmfoto.

## Nicht Teil dieses Zweigs

- Einstellungen und Artikel auf Unterpunkte umstellen.
- Die Handy-Leiste unten (`bottom-nav`) ändern.
- Inhaltliche Überarbeitung der vier Admin-Seiten.
