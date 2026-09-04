# AGENTS.md

Verbindliche Regeln für **alle** KI-Assistenten, die an diesem Projekt arbeiten.
Diese Datei ist die einzige Quelle; werkzeugspezifische Dateien verweisen nur
hierher.

## Sprache

- Antworten im Chat **immer auf Deutsch**, einfach und ohne unnötige Fachbegriffe.
- **Bezeichner im Code immer englisch** — Variablen, Funktionen, Dateien, Tabellen.
- Deutsch bleibt in Chat, Code-Kommentaren und Oberflächentexten.

## Techstack

- **Framework:** Angular 22
- **Styling:** Tailwind CSS; SCSS nur als Fallback
- **Backend:** Supabase
- **Versionierung:** Git/GitHub

## Parallelbetrieb mehrerer Assistenten

An diesem Projekt arbeiten mehrere KI-Assistenten, teils gleichzeitig.

- **Fremde Zweige nicht anfassen.** Wer einen Zweig begonnen hat, führt ihn zu
  Ende. Kein Rebase, kein Aufräumen, kein „schnell mitgenommen" auf einem Zweig,
  den ein anderer bearbeitet.
- **Jede Sitzung wird in `docs/AI-CHANGELOG.md` eingetragen** — auch reine
  Analysen ohne Codeänderung. Format und Regel stehen dort oben.
- **Vor größeren Änderungen an geteilten Dateien** dort nachsehen, wer zuletzt
  daran war.

## Git & Commits (Conventional Commits v1.0.0)

- **Niemals im Namen der KI committen.** Keine `Co-Authored-By`-Zeile, keine
  andere Form von Assistenten-Signatur im Commit. Autor ist immer und
  ausschließlich der Nutzer. Das gilt auch, wenn Standardvorgaben des Werkzeugs
  etwas anderes verlangen.
- **Commit-Nachrichten auf Englisch**, Titel im Imperativ (z. B. `add`, `fix`, `update` – nicht `added` oder `fixes`). Kein Punkt am Ende der ersten Zeile.
- **Format: Conventional Commits v1.0.0** — `type(scope): Kurzbeschreibung`.
  - **Erlaubte Types**:
    - `feat:` Neues Feature (erhöht Minor-Version)
    - `fix:` Fehlerbehebung (erhöht Patch-Version)
    - `perf:` Performance-Verbesserung (erhöht Patch-Version)
    - `refactor:` Code-Umbau ohne Verhaltensänderung
    - `style:` Formatierung, Semikolons etc. (keine funktionale Code-Änderung)
    - `test:` Neue oder angepasste Tests
    - `build:` Build-System, npm-Abhängigkeiten
    - `ci:` GitHub Actions, Deployment-Skripte, Docker
    - `docs:` Dokumentation, AI-Changelog
    - `chore:` Sonstige Aufgaben/Wartung
  - **Gültige Scopes**:
    - `landing`, `inventory`, `sales`, `purchases`, `auth`, `accounting`, `sniper`, `image-opt`, `ui`, `core`, `ci`, `deps`
  - **Breaking Changes**:
    - Mit `!` nach Type/Scope: `feat(api)!: remove legacy endpoint`
    - Oder im Footer: `BREAKING CHANGE: <beschreibung>`
    - _Hinweis:_ Während der Beta (0.x) steuert GitVersion Breaking Changes automatisch als Minor-Bump (0.x), um einen vorzeitigen 1.0.0-Sprung zu verhindern.
- Die Beschreibung im Body erklärt das **Warum**, nicht die Dateiliste: welches Problem,
  welche Ursache, welche Abwägung — und was tatsächlich geprüft wurde.

## Vor dem Pushen

- **`npm run verify`** ausführen. Es fährt die CI-Kette: Format, Lint, Typen,
  Workflow-Tests, Suite-Audit, alle Tests, Bau.
- **Den Exitcode nicht durch eine Pipe messen.** `npm run verify | tail -20`
  meldet den Code von `tail` und sieht auch dann grün aus, wenn ESLint Fehler
  wirft. Richtig: `npm run verify > log 2>&1; echo $?`.
- `npm run typecheck` allein genügt nicht — `tsc` prüft **keine
  Angular-Vorlagen**. Eine Bindung an einen nicht existierenden Eingang kommt
  durch Typprüfung und Tests und fällt erst beim Bau auf.
- **Ein Push auf `master` löst sofort ein Produktions-Deployment aus.** Der
  lokale Lauf ist die letzte Gelegenheit, einen Fehler zu bemerken.

## Ordnerstruktur (feature-basiert)

Keine Dateien unsortiert auf oberster Ebene.

- **`core/`** — globale Services, Guards, Interceptors. Keine visuellen Komponenten.
- **`shared/`** — kleine wiederverwendbare Bausteine (Buttons, Pipes, Directives).
  Laden keine eigenen Daten vom Server.
- **`layout/`** — statisches Grundgerüst (Header, Footer, Sidebar).
- **`features/`** — nach Themen gruppiert, je mit `components/`, `models/`,
  `services/`, `[feature].component.ts`, `[feature].routes.ts`. Was nur ein
  Feature braucht, gehört strikt dorthin.

Statische Dateien: `public/images/` (bevorzugt `.svg`/`.webp`), `public/i18n/`,
`public/fonts/`, `public/mock-data/`. Direkt in `public/`: `favicon.ico`,
`robots.txt`, `manifest.webmanifest`.

## Angular

- Standalone Components; `standalone: true` **nicht** setzen (Standard seit v19).
- Signals: `input()`, `output()`, `model()`, `computed()`, `effect()`.
- Neue Control Flow Syntax: `@if`, `@for`, `@switch`, `@let` — nicht `*ngIf` etc.
- `changeDetection: ChangeDetectionStrategy.OnPush` immer setzen.
- **Niemals Inline-Templates.** HTML immer in eigene `.html`-Datei.
- **Kein** `@HostBinding`/`@HostListener` — stattdessen `host`-Objekt im Decorator.
- **Kein** `ngClass`/`ngStyle` — stattdessen `class`- und `style`-Bindings.
- `NgOptimizedImage` für statische Bilder (nicht für inline Base64).
- Reactive Forms statt Template-driven Forms.
- Lazy Loading für Feature-Routes.
- Keine Globals wie `new Date()` und keine Arrow-Funktionen im Template.
- Komponenten klein halten, eine Verantwortung je Komponente.

## TypeScript

- Strikte Typprüfung. Typinferenz bevorzugen, wenn der Typ offensichtlich ist.
- `any` vermeiden; bei Unsicherheit `unknown`.

## State & Services

- Signals für lokalen State, `computed()` für abgeleiteten State.
- **Kein** `mutate` auf Signals — `update` oder `set`.
- State-Transformationen rein und vorhersagbar halten.
- Services auf eine Verantwortung ausrichten, `providedIn: 'root'` für Singletons.
- `inject()` statt Constructor Injection.

## Styling

- Tailwind-Klassen direkt im HTML. Eigene CSS-/SCSS-Dateien vermeiden.
- SCSS nur, wenn es nicht anders geht (komplexe Animationen) oder das HTML durch
  zu viele Klassen unlesbar würde.

## Accessibility

- Muss alle AXE-Checks bestehen.
- Muss WCAG AA erfüllen: Fokus-Management, Farbkontrast, ARIA-Attribute.

---

# Supabase

## Architektur

- Backend in `supabase/`: `schemas/`, `migrations/`, `seed.sql`, `config.toml`.
  Änderungen an Tabellen und Rechten **immer über Migrations**, niemals händisch
  in der Weboberfläche.
- `createClient` **nur** im `src/app/core/services/supabase.service.ts`.
  Tabellenabfragen in dedizierten Feature-Services, nie direkt in UI-Komponenten.
- Auth-Zustand (`onAuthStateChange`) nur im `SupabaseService`. Sitzung als
  `signal<Session | null>(null)`. Login-UI in `src/app/features/auth/`.
- Zugangsdaten in `src/environments/environment.ts` (Projekt-URL und
  Publishable/Anon Key). Diese Schlüssel sind im Frontend sicher — **solange RLS
  aktiviert ist**. Der Service-Role-Key darf nie in einen Frontend-Bau geraten.
- Nach jedem `db pull` oder jeder Migration Typen neu erzeugen:
  `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`

## Schemadateien aufteilen

- Schema deklarativ in **mehreren** Dateien unter `supabase/schemas/` pflegen,
  nicht in einer großen. Sie werden in **lexikographischer Reihenfolge**
  ausgeführt.
- **Zahlenpräfixe** benutzen, damit die Reihenfolge ausdrücklich ist, nicht
  zufällig: `10_core.sql`, `20_purchases.sql`, `30_inventory.sql`,
  `40_sales.sql`, `50_sniper.sql`. Was auf anderes verweist, bekommt die höhere
  Zahl; Zehnerschritte lassen Platz zum Einschieben.
- **Ein Themenbereich, eine Datei.** Das hält Unterschiede lesbar und verhindert,
  dass zwei Assistenten dieselbe Datei umbauen.
- **Alle Tabellen bleiben im Postgres-Schema `public`.** Getrennte
  Postgres-Schemas (Namensräume) nicht anlegen — PostgREST, die generierten Typen
  und der Client gehen von `public` aus.
- Migrations werden erzeugt, nicht von Hand in `supabase/migrations/` geändert:
  `supabase stop`, dann `supabase db diff -f <name>`. **Die erzeugte Datei danach
  ansehen** — der Abgleich erfasst nicht jede Änderung.

## Migrationsdateien

- Dateiname `YYYYMMDDHHmmss_short_description.sql` (UTC).
- Kopfkommentar mit Zweck und betroffenen Tabellen/Spalten.
- SQL in Kleinbuchstaben. Destruktive Befehle ausführlich kommentieren.
- Bei neuen Tabellen **immer RLS aktivieren**.

## Row Level Security

- Jede neue Tabelle **muss** RLS aktiviert haben, mit expliziten Policies.
- **Separate Policy je Operation** (`select`, `insert`, `update`, `delete`) und je
  Rolle (`anon`, `authenticated`). Nicht kombinieren, kein `FOR ALL`.
- Immer `(select auth.uid())` statt `auth.uid()` (Performance).
- Immer Rolle mit `TO` angeben.
- `SELECT`: nur `USING`. `INSERT`: nur `WITH CHECK`. `UPDATE`: beides.
  `DELETE`: nur `USING`.
- Policy-Namen als kurze beschreibende Texte in Anführungszeichen.
- `PERMISSIVE` bevorzugen, `RESTRICTIVE` vermeiden.
- Indexes auf alle Spalten setzen, die in Policies vorkommen.

## SQL Style

- Schlüsselwörter klein, `snake_case` für Tabellen und Spalten.
- Tabellennamen plural, Spaltennamen singular.
- Jede Tabelle braucht `id` (`identity generated always`), sofern nicht anders
  festgelegt, und einen `comment on table`.
- Foreign Keys: Singular des Tabellennamens + `_id` (z. B. `user_id`).
- Datumsformat ISO 8601. Bei komplexen Abfragen CTEs bevorzugen.

## SQL-Funktionen

- Standard `SECURITY INVOKER`; `SECURITY DEFINER` nur wenn nötig.
- Immer `set search_path = ''` und vollqualifizierte Namen (`public.tabelle`).
- Explizite Ein- und Ausgabetypen. `IMMUTABLE`/`STABLE` bevorzugen.
- Bei Trigger-Funktionen das `CREATE TRIGGER`-Statement mitliefern.

## Realtime

- Immer `broadcast` für Datenänderungen. **Niemals `postgres_changes`.**
- `presence` nur extrem sparsam (Online-Status).
- Kanäle spezifisch benennen: `scope:entity:id`, immer `private: true`,
  Ereignisnamen in `snake_case`.
- `DestroyRef` für Cleanup nutzen. Live-Daten in Signals halten.

## Edge Functions

- Web- und Deno-Core-APIs vor externen Abhängigkeiten.
- Geteiltes in `supabase/functions/_shared/`, per relativem Pfad importieren.
- Keine Bare Specifiers — immer `npm:` oder `jsr:` mit Version. Node-APIs mit
  `node:`-Präfix. `Deno.serve` statt `serve` aus `deno.land/std`.
- Dateien nur nach `/tmp` schreiben. Lange Hintergrundarbeit mit
  `EdgeRuntime.waitUntil(promise)`.
- Vordefiniert: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_DB_URL`.
