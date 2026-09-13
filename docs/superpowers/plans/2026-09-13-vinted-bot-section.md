# Vinted Bot – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** „Deal-Monitor“ heißt „Vinted Bot“; die Bot-Seiten der Administration liegen gebündelt unter „Vinted Bot“ mit Seitenmenü wie in den Einstellungen.

**Architecture:** Neue Hülle `VintedBotShellComponent` in `features/platform-admin/vinted-bot-shell/` nach dem Muster von `settings-shell` (Linkliste ab `lg`, `app-custom-select` darunter). Admin-Routen hängen die drei Seiten unter `vinted-bot`; alte Adressen leiten weiter. Die Seitenleiste bekommt nur neue Daten.

**Tech Stack:** Angular 22, Tailwind, Vitest (`--project=angular`), Playwright (`playwright.pr.config.ts`).

Spezifikation: `docs/superpowers/specs/2026-09-13-vinted-bot-section-design.md`

## Global Constraints

- Arbeitsordner `K:\GitHub\Repos\flipbase\.worktrees\vinted-bot-section`, Zweig `feat/vinted-bot-section`.
- Sichtbarer Name exakt „Vinted Bot“. Ordner/Klassen/RPC-Namen bleiben.
- Aktiver Zustand im Markengelb (`fb-primary`), kein Indigo.
- Genau ein `aria-current="page"` je Navigation; keine ARIA-Menürollen.
- Commits englisch, Conventional Commits, ohne KI-Signatur; Nachrichten ohne die Zeichenfolge „/admin,“ (Schutzfilter).

---

### Task 1: Umbenennung Deal-Monitor → Vinted Bot

**Files:** `src/app/app.routes.ts`, `src/app/layout/sidebar/sidebar.component.ts`, `src/app/core/i18n/translations.ts`, `src/app/features/deal-monitor/deal-monitor.component.html`, `e2e/deal-monitor.spec.ts`, `scripts/playwright-pr-smoke.test.mjs`

- [ ] Route `vinted-bot` (mit `unsavedEntryGuard`, lädt `DealMonitorComponent`), davor `{ path: 'deal-monitor', redirectTo: 'vinted-bot', pathMatch: 'full' }`.
- [ ] Seitenleiste: `{ path: '/vinted-bot', labelKey: 'NAV.DEAL_MONITOR', label: 'Vinted Bot', icon: Bot }`, Import `LucideBot as Bot`.
- [ ] `NAV.DEAL_MONITOR`: de und en „Vinted Bot“.
- [ ] Seitenkopf-Titel „Vinted Bot“; Demo-Hinweis „Der Vinted Bot benötigt …“.
- [ ] Browsertest: Titel „Vinted Bot pausieren und Merkzettel verwalten“, `goto('/vinted-bot')`, Überschrift „Vinted Bot“, URL `/\/vinted-bot$/`; Liste der PR-Browsertests angleichen.

### Task 2: Admin-Bereich „Vinted Bot“ mit Seitenmenü

**Files:**

- Create: `src/app/features/platform-admin/vinted-bot-shell/vinted-bot-shell.component.{ts,html,angular.spec.ts}`
- Modify: `src/app/core/config/platform-admin-navigation.ts`, `src/app/features/platform-admin/platform-admin.routes.ts`, die drei Seiten (Kopf), `sniper-operation` Link, `vinted-categories` Test, `src/app/layout/sidebar/sidebar.component.angular.spec.ts`, `e2e/sniper-administration.spec.ts`

**Interfaces:**

- `VINTED_BOT_NAVIGATION: readonly { path: 'queries' | 'operation' | 'categories'; label; description; icon }[]`
- `VintedBotShellComponent.currentPath: Signal<string>`, `onMobileSectionChange(path: string | null): Promise<void>`
- Navigation `nav[aria-label="Bereiche des Vinted Bots"]`, Auswahl `ariaLabel="Bereich des Vinted Bots auswählen"`.

- [ ] Test der Hülle schreiben: drei Links mit `href` `/admin/vinted-bot/{queries,operation,categories}`, genau ein `aria-current`, Auswahlfeld vorhanden, `onMobileSectionChange('operation')` navigiert, AXE ohne `serious`/`critical`.
- [ ] Seitenleisten-Test: Unterpunkte `Bewerbungen`, `Vinted Bot`; auf `/admin/vinted-bot/operation` trägt nur „Vinted Bot“ `aria-current`.
- [ ] Hülle, Navigation, Routen (Kinder unter `vinted-bot`, Weiterleitungen `queries|operation|categories` → `vinted-bot/…`) umsetzen.
- [ ] Unterseiten: `app-page-header` durch `h2`-Kopf ersetzen; Kartenüberschriften in Botbetrieb auf `h3`; Kategorieliste ohne `max-w-3xl` und ohne Seitenkopf-Kniff im Test.
- [ ] Browsertest: Adressen `/admin/vinted-bot/queries`; Wechsel über `nav` der Hülle, auf 390 px über das Auswahlfeld.
- [ ] Angular-Tests `platform-admin`, `layout/sidebar` grün.

### Task 3: Prüfen und abschließen

- [ ] Prettier/ESLint geänderte Dateien, `tsc -p tsconfig.spec.json`, `npm run build` (Exitcode ohne Pipe).
- [ ] Playwright: `deal-monitor.spec.ts` und `sniper-administration.spec.ts` mit `playwright.pr.config.ts`; `node --test scripts/playwright-pr-smoke.test.mjs`.
- [ ] Sammelaufträge-Tabelle bei 1440 px begutachten (Bildschirmfoto aus dem Browsertest).
- [ ] AI-Changelog ergänzen; Nutzer fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“
