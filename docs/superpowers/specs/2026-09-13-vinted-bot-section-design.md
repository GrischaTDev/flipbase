# Vinted Bot: Umbenennung und eigener Bereich in der Administration

Stand: 13.09.2026 · Zweig `feat/vinted-bot-section` (von `origin/master` 6f40612)

## Problem

- Der Menüpunkt „Deal-Monitor“ zeigt die Funde des Vinted-Bots. Der Name sagt
  das nicht.
- Unter „Administration“ stehen seit PR #70 vier Unterpunkte. Drei davon
  (Sammelaufträge, Botbetrieb, Kategorieliste) gehören zum Bot und blähen die
  Seitenleiste auf.
- Die Bot-Seiten nutzen die volle Inhaltsbreite, obwohl sie das meist nicht
  brauchen.

## Entscheidungen (mit dem Nutzer abgestimmt)

- Neuer Name: **Vinted Bot**.
- Hauptmenü: „Deal-Monitor“ heißt „Vinted Bot“ und bleibt für alle Nutzer.
- Administration hat zwei Unterpunkte: **Bewerbungen** und **Vinted Bot**.
- Die Admin-Seite „Vinted Bot“ bekommt wie die Einstellungen links eine Liste
  (Sammelaufträge, Botbetrieb, Kategorieliste) und rechts den Inhalt in
  begrenzter Breite. Auf dem Handy wird die Liste zum Auswahlfeld.
- Weg A: eigene Hülle in `platform-admin`. Die Einstellungen bleiben unberührt.
- Adressen ändern sich, alte Adressen leiten weiter.
- Ordner- und Klassennamen im Code (`deal-monitor`, `DealMonitorComponent`,
  `sniper-*`) bleiben.
- Die drei Unterseiten verlieren ihren großen Seitenkopf zugunsten einer
  kleineren Zwischenüberschrift.

## Teil 1: Umbenennung im Hauptmenü

- Sichtbare Texte: Seitenleiste (`label`), `translations.ts`
  (`NAV.DEAL_MONITOR`: de „Vinted Bot“, en „Vinted Bot“), Seitenkopf-Titel und
  der Demo-Hinweis in `deal-monitor.component.html`.
- Symbol in der Seitenleiste: `LucideBot` statt `LucideSearch`. Die Lupe bleibt
  „Research“ vorbehalten.
- Route `vinted-bot` lädt `DealMonitorComponent` mit `unsavedEntryGuard`.
  `deal-monitor` leitet mit `pathMatch: 'full'` auf `vinted-bot` weiter.
- Übersetzungsschlüssel `NAV.DEAL_MONITOR` bleibt; nur die Werte ändern sich.

## Teil 2: Administration

### Seitenleiste

`PLATFORM_ADMIN_NAVIGATION` enthält nur noch:

1. `{ label: 'Bewerbungen', path: '/admin/applications' }`
2. `{ label: 'Vinted Bot', path: '/admin/vinted-bot' }`

Die bestehende Pfadregel markiert „Vinted Bot“ auf allen Adressen unter
`/admin/vinted-bot/…` als aktiv.

### Routen (`platform-admin.routes.ts`)

- `applications` unverändert.
- `vinted-bot` mit Hülle `VintedBotShellComponent` und Kindern:
  `''` → `queries` (Weiterleitung), `queries` (mit `unsavedEntryGuard`),
  `operation`, `categories`.
- Weiterleitungen der alten Adressen: `queries` → `vinted-bot/queries`,
  `operation` → `vinted-bot/operation`, `categories` → `vinted-bot/categories`.
- Der Link „Sammelaufträge verwalten“ auf der Botbetrieb-Seite zeigt auf
  `/admin/vinted-bot/queries`.

### Hülle `VintedBotShellComponent`

Ort: `src/app/features/platform-admin/vinted-bot-shell/`. Vorbild:
`settings-shell`.

- Liste `VINTED_BOT_NAVIGATION` in der Komponenten-Datei: Sammelaufträge
  (`queries`), Botbetrieb (`operation`), Kategorieliste (`categories`), je mit
  kurzer Beschreibung und Lucide-Symbol.
- Rahmen: `mx-auto max-w-6xl flex flex-col gap-4`. Oben `app-page-header` mit
  Titel „Vinted Bot“ und Untertitel „Sammelaufträge, Betrieb und Kategorien des
  Vinted-Bots verwalten.“
- Ab `lg`: Raster `lg:grid-cols-[15rem_minmax(0,1fr)]`. Links
  `nav aria-label="Bereiche des Vinted Bots"` als `ul > li > a` mit
  `routerLinkActive` und `aria-current="page"` am aktiven Link.
- Auszeichnung des aktiven Links im Markengelb:
  `bg-fb-primary/15 border-fb-primary/40 text-fb-text-primary`. Kein Indigo.
  Fokusring `focus-visible:ring-2 focus-visible:ring-fb-primary`.
- Unter `lg`: `app-custom-select` mit `ariaLabel="Bereich des Vinted Bots
auswählen"`, der aktuellen Unterseite als Wert und Navigation bei Auswahl.
- Aktuelle Unterseite: Signal aus `NavigationEnd`, drittes Pfadsegment
  (`/admin/vinted-bot/<segment>`), Standard `queries`.

### Unterseiten

- Sammelaufträge, Botbetrieb, Kategorieliste: `app-page-header` entfällt.
  Stattdessen ein Kopf aus `h2` (`text-base font-semibold`) und Beschreibung
  (`text-[13px] text-fb-text-muted`). Die Aktion „Neuer Auftrag“ steht rechts
  daneben. Texte bleiben inhaltlich gleich.
- Kategorieliste: Die innere Begrenzung `max-w-3xl` entfällt, weil die Hülle
  begrenzt.
- Breite der Sammelaufträge-Tabelle: im Browser bei 1440 px prüfen. Ist sie
  abgeschnitten oder scrollt waagerecht, wird das im Changelog festgehalten und
  mit dem Nutzer entschieden. Kein stilles Verbreitern.

## Tests und Prüfung

- `sidebar.component.angular.spec.ts`: Unterpunkte Bewerbungen und Vinted Bot;
  auf `/admin/vinted-bot/operation` ist „Vinted Bot“ die einzige aktuelle Seite.
- Neu `vinted-bot-shell.component.angular.spec.ts`: drei Links mit Zielen, genau
  ein `aria-current`, Auswahlfeld vorhanden, Navigation über Auswahl, AXE ohne
  `serious`/`critical`.
- `vinted-categories.component.angular.spec.ts`: Seitenkopf-Kniff entfällt.
- Weiterleitungen der alten Adressen prüfen die Browsertests: Der Vinted-Bot-Test
  startet über `/deal-monitor`, der Sammelaufträge-Test über `/admin/queries`
  und erwartet danach die neue Adresse.
- `e2e/deal-monitor.spec.ts`: Adresse `/vinted-bot`, Überschrift „Vinted Bot“,
  Testtitel „Vinted Bot pausieren und Merkzettel verwalten“; die feste Liste in
  `scripts/playwright-pr-smoke.test.mjs` wird angepasst.
- `e2e/sniper-administration.spec.ts`: Adressen `/admin/vinted-bot/queries`;
  Wechsel zu „Botbetrieb“ über die Liste der Hülle, auf 390 px über das
  Auswahlfeld.
- Vor dem PR: betroffene Unit- und Browsertests, Liste der PR-Browsertests,
  Prettier/ESLint, `npm run build`.

## Nicht Teil dieses Zweigs

- Umbenennung von Ordnern, Klassen, Tabellen oder RPCs.
- Umbau der Einstellungen oder eine gemeinsame Hüllenkomponente.
- Inhaltliche Änderungen an Funden, Merklisten oder Bot-Seiten.
