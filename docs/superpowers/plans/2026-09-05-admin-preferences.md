# Admin Accent and Dashboard Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gelber Markenakzent und dauerhaft persönliche Dashboard-Filter als eigenständig prüfbares erstes Paket.

**Architecture:** Lichtpalette unter `.fb-admin` begrenzen. Ein Dashboard-Preferences-Service hält normalisierte Einstellungen und speichert sie für echte Konten über Supabase Auth `updateUser`, für Demo ausschließlich im lokalen Speicher. Die Komponente konsumiert diesen Service statt eigener flüchtiger Filter-Signals.

**Tech Stack:** Bestehendes Angular 22, Tailwind, Supabase JS, Vitest, Playwright; keine neuen Pakete.

**Spec:** `docs/superpowers/specs/2026-09-05-admin-workflow-refresh.md`, Paket 1.

## Umsetzungsstand

- [x] Task 1 umgesetzt; separate Prüfung und Dark-Mode-Korrektur abgeschlossen.
- [x] Task 2 umgesetzt; persönliche Filter einschließlich echter lokaler Anmeldung in zwei Browsersitzungen geprüft.
- [x] Gemeinsame responsive Prüfung: 24 Ansichten, acht Axe-Prüfungen ohne Befund.
- [x] Abschlussreview-Befunde zu Aktionskontrast und Abmelden während wartender Speicherung korrigiert und durch Regressionstests abgesichert.
- [x] Letzte Nachprüfung und Abschlussdokumentation: beide Abschlussbefunde behoben, gezielte Nachprüfung freigegeben; final 1.496 Tests und acht Browserprüfungen erfolgreich, Produktionsbau erfolgreich.
- [ ] Veröffentlichung (nicht beauftragt; vor einem Push vollständiges `npm run verify`).

Die folgenden Abschnitte dokumentieren das ursprüngliche Task-Briefing. Erweiterungen gegenüber dessen knapper Dateiliste: Dashboard-HTML für den Speicherfehlerhinweis sowie vorhandene Komponententests für die neue Zustandsquelle. Keine Datenbankmigration, neuen Abhängigkeiten oder Änderungen an Shop/Landingpage.

## Global Constraints

- Dark-Mode-Hintergründe, Shop und Landingpage unverändert.
- Einstellungen sind Komfortdaten, niemals Grundlage für Berechtigungen oder Buchungen.
- Demo speichert ausschließlich lokal und getrennt von echten Konten.
- Vor Push `npm run verify`.
- Umsetzung auf eigenem neuen Zweig `feat/admin-preferences`, fremde Änderungen erhalten. Keine automatische Veröffentlichung.

## Task 1: Gelbe Akzentfamilie im hellen Admin

**Files:** Modify `src/styles.css`, `src/app/layout/sidebar/sidebar.component.html`; create `e2e/admin-accent.spec.ts`.

**Interfaces:** Vorhandene CSS-Variablen `--fb-primary`, `--fb-primary-hover`, `--fb-text-on-accent`, `--fb-border-focus` und `--fb-c-indigo-*`; keine TypeScript-Schnittstellenänderung.

- [ ] Browserprüfung ergänzen, zunächst gegen den aktuellen lila Fokus/neutralen Primärknopf ausführen:

```ts
await startDemoMode(page);
await page.goto('/purchases');
const button = page.getByRole('button', { name: 'Neuer Einkauf' });
await expect(button).toBeVisible();
await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
```

- [ ] In der vorhandenen hellen `.fb-admin`-Regel die Akzentfamilie setzen; mit dunklen Varianten vergleichbar, Textakzente auf Weiß deutlich dunkler wählen:

```css
--fb-primary: #f89d13;
--fb-primary-hover: #fbb040;
--fb-text-on-accent: #1a1a1a;
--fb-primary-subtle: rgb(248 157 19 / 12%);
--fb-primary-border: rgb(138 86 6 / 35%);
--fb-border-focus: #8a5606;
--fb-c-indigo-200: #8a5606;
--fb-c-indigo-300: #8a5606;
--fb-c-indigo-400: #8a5606;
--fb-c-indigo-500: #f89d13;
--fb-c-indigo-600: #8a5606;
--fb-c-indigo-950: #1a1207;
```

- [ ] Violette Dekoration außerhalb der Indigo-Variablen mittels `rg -n 'violet|purple|indigo' src/app/layout src/app/shared src/app/features` prüfen. Nur dekorative Akzente zu gemeinsamen Markenfarben migrieren, nicht Diagrammserien oder Warnzustände pauschal umfarben. Aktive Sidebarflächen mit `--fb-primary-subtle`, Icon/Text dunkel und lesbar gestalten.
- [ ] `npx playwright test e2e/admin-accent.spec.ts e2e/admin-layout.spec.ts`; zusätzlich Axe und Sichtprüfung in Hell/Dunkel, Dropdown geöffnet, Tastaturfokus und Hover. Shop/Anmeldung ohne `.fb-admin` vergleichen.
- [ ] Geprüfte Änderung separat committen: `feat(ui): align light admin accents with brand colors`.

## Task 2: Persönliche Dashboard-Einstellungen

**Files:** Create `src/app/features/dashboard/models/dashboard-preferences.ts`, `src/app/features/dashboard/models/dashboard-preferences.spec.ts`, `src/app/features/dashboard/services/dashboard-preferences.service.ts`, `src/app/features/dashboard/services/dashboard-preferences.service.angular.spec.ts`; modify `src/app/features/dashboard/dashboard.component.ts`, `e2e/dashboard-interactions.spec.ts`.

**Interfaces:**

```ts
export interface DashboardPreferences {
  readonly range: DashboardRange;
  readonly platform: DashboardPlatform;
}
export function parseDashboardPreferences(value: unknown): DashboardPreferences;
// Service:
// readonly preferences: Signal<DashboardPreferences>
// readonly saveError: Signal<string | null>
// setRange(range: DashboardRange): void
// setPlatform(platform: DashboardPlatform): void
```

- [ ] Parser-Tests schreiben und rot ausführen:

```ts
expect(parseDashboardPreferences(undefined)).toEqual({ range: 'year', platform: 'all' });
expect(parseDashboardPreferences({ range: 'invalid', platform: 12 })).toEqual({
  range: 'year',
  platform: 'all',
});
expect(parseDashboardPreferences({ range: 'last_7_days', platform: 'ebay' })).toEqual({
  range: 'last_7_days',
  platform: 'ebay',
});
```

- [ ] Parser implementieren: Objektprüfung, Range-Allowlist `today/last_7_days/month/year`, Plattform als nichtleere Zeichenkette bis 100 Zeichen; sonst unabhängige Standardwerte. Keine durch Typcast erzwungene Gültigkeit.
- [ ] Service mit AuthService/SupabaseService testen: fehlende Metadaten, bestehende Auswahl, Demo ohne Netzaufruf, Kontowechsel A→B, Speicherfehler, zwei schnelle Änderungen und Abmelden während einer Antwort. Test-Fakes nur an der Supabase-Grenze, echter Service-State und echte Signale.
- [ ] Persistenz über einen eigenen Metadaten-Schlüssel, ohne fremde Metadaten zu überschreiben:

```ts
const { data, error } = await supabase.client.auth.updateUser({
  data: { flipbase_dashboard: nextPreferences },
});
```

Requests pro laufender Sitzung serialisieren und Zwischenstände zusammenfassen. Vor jedem Request aktuellen Benutzer prüfen, verspätete Antwort eines anderen Benutzers ignorieren. Nicht aus einem Auth-State-Callback heraus weitere Auth-Aufrufe abwarten. Serverfehler und geworfene Fehler in `saveError` übersetzen. Demo-Schlüssel `flipbase_demo_dashboard_v1`, Storage-Fehler abfangen. Erfolgreiche Kontoeinstellungen beim erneuten Start aus `currentUser().user_metadata.flipbase_dashboard` laden; frische serverseitige Benutzerdaten über `auth.getUser()` beim initialen Laden abgleichen, ohne zwischenzeitliche lokale Bedienung zu überschreiben.

- [ ] Dashboard mit `computed` aus Service-Einstellungen verbinden; Setter delegieren. Vorhandenen Effekt entfernen, der unbekannte Plattformen ungefragt auf `all` zurücksetzt. Gespeicherte Plattform der Optionsliste hinzufügen, wenn sie bei geladenen Verkäufen nicht vorkommt; null Treffer anzeigen, nicht gespeicherte Auswahl löschen. Speicherfehler einmal als Hinweis im Dashboard anzeigen, keine Erfolgsmeldung pro Klick.
- [ ] Browsertest ergänzen: Demo startet auf diesem Jahr; auf 7 Tage und eBay wechseln, andere Route öffnen und zurückkehren, neu laden; beide Filter bleiben. Bestehende Chart-Tooltip-/Tastaturtests auf explizite Testzeiträume umstellen, nicht vom Monatsdefault abhängig lassen.
- [ ] `npx vitest run --project=node src/app/features/dashboard/models/dashboard-preferences.spec.ts`; `npx vitest run --project=angular src/app/features/dashboard/services/dashboard-preferences.service.angular.spec.ts`; `npx playwright test e2e/dashboard-interactions.spec.ts`; `npm run build`.
- [ ] Mit lokalem Testkonto in zwei getrennten Browsersitzungen Save/Reload prüfen; fehlende Testumgebung ausdrücklich melden, keine Produktionskonten verändern. Supabase-Sicherheitscheck: keine Rechteentscheidungen aus user_metadata, kein Service-Key, keine Änderung von RLS.
- [ ] Geprüfte Änderung separat committen: `feat(ui): persist personal dashboard filters`.

## Task 3: Paket abnehmen

- [ ] Beide Änderungen gemeinsam im Browser prüfen; User-Wechsel, Nulltreffer, fehlende Kamera bleiben von diesem Paket unabhängig.
- [ ] Review der tatsächlichen Änderungen; `npm run verify` vor einem autorisierten Push. `docs/AI-CHANGELOG.md` um konkrete Testresultate ergänzen.
- [ ] Lokal umgesetzt und nicht veröffentlicht melden. Danach Paket 2 (Einkaufsseite) anhand bestehender Buchungsschnittstellen separat ausarbeiten; Kommentare nicht als ungesicherte UI-only-Daten anlegen.

## Self-review

Paket-1-Anforderungen sind Tasks 1–3 zugeordnet. Nachfolgende Pakete sind bewusst nicht als bereits geplant oder implementiert bezeichnet. Service-API ist durchgehend identisch. Keine neuen Tabellen/Migrations für diese kleinen persönlichen Komfortdaten erforderlich; erst die Chronik benötigt eine eigene Entscheidung über vorhandene Ereignis- und Kommentarspeicherung.
