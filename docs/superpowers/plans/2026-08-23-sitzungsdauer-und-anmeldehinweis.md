# Sitzungsdauer und Anmeldehinweis – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sitzungen laufen serverseitig ab, die Landingpage zeigt an, dass man angemeldet ist, und „Abmelden" beendet nur noch den eigenen Browser statt aller Geräte.

**Architecture:** Die App setzt ein Merk-Cookie (`flipbase_angemeldet=1`, Wert ohne jede Aussagekraft) auf `.flipbase.de`. Caddy wertet es beim Ausliefern der statischen Landingpage per `templates`-Direktive aus, sodass die Seite ohne eigenes JavaScript auskommt. Der Ablauf der Sitzung wird in Supabase Auth auf dem Server erzwungen, nicht im Frontend.

**Tech Stack:** Angular 22 (Standalone, Signals, OnPush), Tailwind, Supabase Auth (selbst gehostet, GoTrue), Caddy, vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-sitzungsdauer-und-anmeldehinweis-design.md`

## Global Constraints

- **Commits:** Conventional Commits, Titel und Text auf **Englisch**, Titel im Imperativ. Der Text erklärt das Warum.
- **Keine Claude-Signatur im Commit.** Kein `Co-Authored-By`, keine andere Form von Hinweis auf ein Werkzeug. Autor ist ausschließlich der Nutzer.
- **Oberflächentexte und Code-Kommentare auf Deutsch.**
- Angular: Standalone-Komponenten ohne `standalone: true`, `changeDetection: ChangeDetectionStrategy.OnPush`, `inject()` statt Konstruktor-Injektion, Signals für Zustand.
- **Niemals Inline-Templates.** HTML immer in eine eigene `.html`-Datei.
- Styling ausschließlich über Tailwind-Klassen im Template. Keine neuen `.scss`-Dateien.
- `DOCUMENT` wird in dieser Angular-Fassung aus **`@angular/core`** importiert, nicht aus `@angular/common`.
- Tests laufen mit `npm run test` (vitest, jsdom). Das Projekt benutzt **kein** `TestBed`; Dienste werden über `Injector.create` und `runInInjectionContext` gebaut (Vorbild: `src/app/core/services/pwa.service.spec.ts`).
- Wichtig für Tests: vitest löst `../../../environments/environment` immer auf die **Produktionsdatei** auf. Der Austausch gegen `environment.development.ts` passiert nur in `ng build`/`ng serve`.
- Nach jeder Aufgabe zusätzlich `npm run lint` und `npm run typecheck` grün.

---

### Task 1: Umgebungsfeld `landingHintCookieDomain` samt CI

Die CI schreibt `src/environments/environment.ts` beim Bauen per Heredoc komplett neu. Ein Feld, das nur im Repo steht, fehlt im Produktions-Abbild, ohne dass es auffällt. Deshalb steht diese Aufgabe vorn und sichert sich selbst mit einem Test ab.

**Files:**

- Modify: `src/environments/environment.ts`
- Modify: `src/environments/environment.development.ts`
- Modify: `.github/workflows/ci.yml:102-113`
- Test: `src/app/core/services/landing-hint-umgebung.spec.ts` (neu)

**Interfaces:**

- Consumes: nichts.
- Produces: `environment.landingHintCookieDomain: string` – leer in der Entwicklung, `'.flipbase.de'` im Produktions-Abbild.

- [ ] **Step 1: Write the failing test**

Datei `src/app/core/services/landing-hint-umgebung.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Die CI schreibt src/environments/environment.ts beim Bauen komplett neu
 * (.github/workflows/ci.yml). Ein Feld, das nur im Repo gepflegt wird, fehlt
 * deshalb im Produktions-Abbild - lokal funktioniert alles, live nichts, und
 * niemand sieht warum. Dieser Test haelt beide Stellen zusammen.
 */
const wurzel = process.cwd();

function lies(pfad: string): string {
  return readFileSync(join(wurzel, pfad), 'utf-8');
}

describe('Umgebungsfeld landingHintCookieDomain', () => {
  it('steht in beiden Umgebungsdateien', () => {
    expect(lies('src/environments/environment.ts')).toContain('landingHintCookieDomain');
    expect(lies('src/environments/environment.development.ts')).toContain(
      'landingHintCookieDomain',
    );
  });

  it('setzt in der Entwicklung keine Domain', () => {
    expect(lies('src/environments/environment.development.ts')).toMatch(
      /landingHintCookieDomain:\s*''/,
    );
  });

  it('die CI schreibt das Feld mit der echten Domain in das Abbild', () => {
    expect(lies('.github/workflows/ci.yml')).toMatch(/landingHintCookieDomain:\s*'\.flipbase\.de'/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- landing-hint-umgebung`
Expected: FAIL – alle drei Prüfungen, weil das Feld nirgends existiert.

- [ ] **Step 3: Add the field to both environment files**

In `src/environments/environment.ts` **nach** `allowDemoMode: false,` einfügen:

```ts
  /**
   * Domain des Merk-Cookies, an dem die Landingpage erkennt, dass jemand
   * angemeldet ist. Der fuehrende Punkt gilt fuer flipbase.de und alle
   * Unterdomains. Leer bedeutet: kein Cookie, kein Hinweis.
   */
  landingHintCookieDomain: '.flipbase.de',
```

In `src/environments/environment.development.ts` ebenfalls nach `allowDemoMode: true,`:

```ts
  /**
   * Lokal gibt es keine gemeinsame Domain zwischen App und Landingpage,
   * deshalb bleibt das Feld leer und der Dienst tut nichts.
   */
  landingHintCookieDomain: '',
```

- [ ] **Step 4: Add the field to the CI heredoc**

In `.github/workflows/ci.yml` innerhalb des `cat > src/environments/environment.ts <<EOF`-Blocks, direkt nach `allowDemoMode: false,`:

```yaml
            /**
             * Domain of the cookie that tells the landing page someone is
             * signed in. Holds no token - just a flag.
             */
            landingHintCookieDomain: '.flipbase.de',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- landing-hint-umgebung`
Expected: PASS, 3 Tests.

- [ ] **Step 6: Commit**

```bash
git add src/environments .github/workflows/ci.yml src/app/core/services/landing-hint-umgebung.spec.ts
git commit -m "chore(env): carry the landing page cookie domain into the image"
```

Commit-Text (Warum): Das Feld muss an drei Stellen gepflegt werden, weil die CI die Umgebungsdatei beim Bauen ersetzt; der Test hält sie zusammen.

---

### Task 2: Der Cookie-Dienst

**Files:**

- Create: `src/app/core/services/landing-hint.service.ts`
- Test: `src/app/core/services/landing-hint.service.spec.ts`

**Interfaces:**

- Consumes: `environment.landingHintCookieDomain` aus Task 1.
- Produces:
  - `HINWEIS_COOKIE: string` (`'flipbase_angemeldet'`)
  - `HINWEIS_LAUFZEIT_SEKUNDEN: number` (2592000)
  - `anmeldeZeile(domain: string): string | null`
  - `abmeldeZeile(domain: string): string | null`
  - `class LandingHintService { anmelden(): void; abmelden(): void }`

- [ ] **Step 1: Write the failing test**

Datei `src/app/core/services/landing-hint.service.spec.ts`:

```ts
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { DOCUMENT, Injector, runInInjectionContext } from '@angular/core';
import {
  HINWEIS_COOKIE,
  HINWEIS_LAUFZEIT_SEKUNDEN,
  LandingHintService,
  abmeldeZeile,
  anmeldeZeile,
} from './landing-hint.service';
import { environment } from '../../../environments/environment';

/**
 * Legt einen Dienst mit einem gefaelschten Dokument an und sammelt jede
 * geschriebene Cookie-Zeile ein. Das echte document.cookie in jsdom lehnt
 * fremde Domains ab - hier geht es aber genau darum, was geschrieben wird.
 */
function dienstMitProtokoll(): { dienst: LandingHintService; geschrieben: string[] } {
  const geschrieben: string[] = [];
  const dokument = {
    set cookie(wert: string) {
      geschrieben.push(wert);
    },
    get cookie(): string {
      return geschrieben.join('; ');
    },
  } as unknown as Document;

  const injector = Injector.create({ providers: [{ provide: DOCUMENT, useValue: dokument }] });
  const dienst = runInInjectionContext(injector, () => new LandingHintService());
  return { dienst, geschrieben };
}

describe('Merk-Cookie fuer die Landingpage', () => {
  it('enthaelt keinen Token, sondern nur eine 1', () => {
    expect(anmeldeZeile('.flipbase.de')).toContain(`${HINWEIS_COOKIE}=1;`);
  });

  it('gilt fuer die ganze Domain und wird nur verschluesselt uebertragen', () => {
    const zeile = anmeldeZeile('.flipbase.de') ?? '';
    expect(zeile).toContain('Domain=.flipbase.de');
    expect(zeile).toContain('Path=/');
    expect(zeile).toContain('Secure');
    expect(zeile).toContain('SameSite=Lax');
  });

  it('laeuft nach 30 Tagen ab - genauso lange wie die Sitzung selbst', () => {
    expect(HINWEIS_LAUFZEIT_SEKUNDEN).toBe(30 * 24 * 60 * 60);
    expect(anmeldeZeile('.flipbase.de')).toContain(`Max-Age=${HINWEIS_LAUFZEIT_SEKUNDEN}`);
  });

  it('loescht mit derselben Domain, sonst trifft der Browser das Cookie nicht', () => {
    const zeile = abmeldeZeile('.flipbase.de') ?? '';
    expect(zeile).toContain('Domain=.flipbase.de');
    expect(zeile).toContain('Max-Age=0');
  });

  it('tut ohne eingestellte Domain gar nichts', () => {
    expect(anmeldeZeile('')).toBeNull();
    expect(abmeldeZeile('')).toBeNull();
  });

  it('der Dienst schreibt genau eine Zeile beim Anmelden', () => {
    // vitest laedt immer die Produktionsumgebung, dort ist die Domain gesetzt.
    expect(environment.landingHintCookieDomain).not.toBe('');

    const { dienst, geschrieben } = dienstMitProtokoll();
    dienst.anmelden();

    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toBe(anmeldeZeile(environment.landingHintCookieDomain));
  });

  it('der Dienst raeumt das Cookie beim Abmelden wieder weg', () => {
    const { dienst, geschrieben } = dienstMitProtokoll();
    dienst.abmelden();

    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toBe(abmeldeZeile(environment.landingHintCookieDomain));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- landing-hint.service`
Expected: FAIL mit „Failed to resolve import ./landing-hint.service".

- [ ] **Step 3: Write the implementation**

Datei `src/app/core/services/landing-hint.service.ts`:

```ts
import { DOCUMENT, Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Merk-Cookie fuer die Landingpage.
 *
 * Landingpage (flipbase.de) und App (app.flipbase.de) sind fuer den Browser
 * getrennte Herkuenfte - die Landingpage kann die Supabase-Sitzung also nicht
 * sehen. Sie traegt ausserdem bewusst kein JavaScript. Deshalb dieser Umweg:
 * Die App hinterlegt ein Cookie auf der gemeinsamen Domain, und Caddy wertet
 * es beim Ausliefern der Seite aus.
 *
 * Im Cookie steht ausschliesslich eine 1. Kein Token, keine Kennung - wer es
 * ausliest, erfaehrt nur, dass hier jemand angemeldet war.
 */
export const HINWEIS_COOKIE = 'flipbase_angemeldet';

/** Laufzeit in Sekunden. Entspricht der serverseitigen Timebox von 30 Tagen. */
export const HINWEIS_LAUFZEIT_SEKUNDEN = 30 * 24 * 60 * 60;

/** Baut die Cookie-Zeile fuer eine bestehende Anmeldung. */
export function anmeldeZeile(domain: string): string | null {
  if (!domain) return null;
  return (
    `${HINWEIS_COOKIE}=1; Domain=${domain}; Path=/; Secure; SameSite=Lax; ` +
    `Max-Age=${HINWEIS_LAUFZEIT_SEKUNDEN}`
  );
}

/**
 * Baut die Zeile, die das Cookie entfernt. Domain und Pfad muessen dabei
 * uebereinstimmen, sonst trifft der Browser das vorhandene Cookie nicht.
 */
export function abmeldeZeile(domain: string): string | null {
  if (!domain) return null;
  return `${HINWEIS_COOKIE}=; Domain=${domain}; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

@Injectable({
  providedIn: 'root',
})
export class LandingHintService {
  private readonly dokument = inject(DOCUMENT);
  private readonly domain = environment.landingHintCookieDomain;

  /** Hinterlegt den Hinweis. Ohne eingestellte Domain passiert nichts. */
  anmelden(): void {
    const zeile = anmeldeZeile(this.domain);
    if (zeile) this.dokument.cookie = zeile;
  }

  /** Entfernt den Hinweis. */
  abmelden(): void {
    const zeile = abmeldeZeile(this.domain);
    if (zeile) this.dokument.cookie = zeile;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- landing-hint.service`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/landing-hint.service.ts src/app/core/services/landing-hint.service.spec.ts
git commit -m "feat(auth): remember the signed-in state for the landing page"
```

---

### Task 3: Abmelde-Reichweite richtigstellen und Cookie anbinden

`supabase.auth.signOut()` benutzt standardmäßig den Bereich `global`. Der Aufruf in `auth.service.ts:296` übergibt nichts – der Knopf „Abmelden" beendet also heute jede Sitzung auf jedem Gerät, ohne das zu sagen. Diese Aufgabe teilt das auf und hängt das Cookie an die drei Stellen, an denen sich der Anmeldezustand ändert.

**Files:**

- Modify: `src/app/core/services/auth.service.ts` (Import, Feld, `applySession`, `watchAuthState`, `signOut`, neu `abmeldenUeberall`)
- Test: `src/app/core/services/abmelde-reichweite.spec.ts` (neu)

**Interfaces:**

- Consumes: `LandingHintService` aus Task 2.
- Produces:
  - `AuthService.signOut(): Promise<void>` – wie bisher aufgerufen, aber nur noch dieser Browser.
  - `AuthService.abmeldenUeberall(): Promise<void>` – beendet alle Sitzungen.

- [ ] **Step 1: Write the failing test**

Datei `src/app/core/services/abmelde-reichweite.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * supabase.auth.signOut() verwendet als Vorgabe den Bereich "global" - ein
 * Aufruf ohne Angabe beendet also jede Sitzung auf jedem Geraet. Genau das
 * tat der Knopf "Abmelden" im Kopfbereich, ohne es anzukuendigen.
 *
 * Ein Verhaltenstest dafuer wuerde den halben AuthService nachbauen
 * (Supabase-Client, Router, Mock-Store). Diese Pruefung liest stattdessen die
 * Quelle: Sie faellt zuverlaessig aus, wenn jemand den Bereich wieder
 * entfernt - und darum geht es hier.
 */
const quelle = readFileSync(
  join(process.cwd(), 'src', 'app', 'core', 'services', 'auth.service.ts'),
  'utf-8',
);

describe('Reichweite des Abmeldens', () => {
  it('kein Aufruf von signOut ohne ausdruecklichen Bereich', () => {
    expect(quelle).not.toMatch(/auth\.signOut\(\s*\)/);
  });

  it('der Bereich wird ueberhaupt uebergeben', () => {
    expect(quelle).toContain('scope: bereich');
  });

  it('das normale Abmelden betrifft nur diesen Browser', () => {
    expect(quelle).toContain('async signOut()');
    expect(quelle).toContain("beendeSitzung('local')");
  });

  it('fuer alle Geraete gibt es einen eigenen, benannten Weg', () => {
    expect(quelle).toContain('async abmeldenUeberall()');
    expect(quelle).toContain("beendeSitzung('global')");
  });

  it('der Anmeldezustand wird an allen drei Stellen ans Cookie gemeldet', () => {
    expect(quelle).toContain('landingHint.anmelden()');
    // Einmal beim Beenden der Sitzung, einmal wenn Supabase null meldet.
    expect(quelle.match(/landingHint\.abmelden\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- abmelde-reichweite`
Expected: FAIL – „kein Aufruf von signOut ohne ausdruecklichen Bereich" und die drei folgenden.

- [ ] **Step 3: Wire up the service**

In `src/app/core/services/auth.service.ts` den Import ergänzen:

```ts
import { LandingHintService } from './landing-hint.service';
```

Bei den übrigen `inject()`-Feldern ergänzen:

```ts
  private readonly landingHint = inject(LandingHintService);
```

In `applySession()` nach `this.setDemoMode(false);` ergänzen:

```ts
// Der Landingpage mitteilen, dass hier jemand angemeldet ist.
this.landingHint.anmelden();
```

In `watchAuthState()` im `else`-Zweig (wenn Supabase `null` meldet) nach
`this.profile.set(null);` ergänzen:

```ts
// Deckt auch den serverseitigen Ablauf und das Abmelden in einem
// anderen Tab ab.
this.landingHint.abmelden();
```

- [ ] **Step 4: Split the sign-out into local and global**

`signOut()` in `src/app/core/services/auth.service.ts:292-306` vollständig durch
diese drei Bausteine ersetzen:

```ts
  /**
   * Meldet in **diesem** Browser ab.
   *
   * Der Bereich muss ausdruecklich angegeben werden: Supabase meldet ohne
   * Angabe auf allen Geraeten ab. Wer sich am Handy abmeldet, flog damit auch
   * am Rechner raus - das erwartet niemand.
   */
  async signOut(): Promise<void> {
    await this.beendeSitzung('local');
  }

  /**
   * Beendet die Sitzung auf **allen** Geraeten.
   *
   * Die schnelle Antwort auf ein verlorenes Geraet: wirkt sofort, statt auf
   * den Ablauf der Sitzung zu warten.
   */
  async abmeldenUeberall(): Promise<void> {
    await this.beendeSitzung('global');
  }

  private async beendeSitzung(bereich: 'local' | 'global'): Promise<void> {
    this.isLoading.set(true);
    try {
      try {
        await this.supabase.client.auth.signOut({ scope: bereich });
      } catch {
        // Auch ohne erreichbares Backend lokal abmelden.
      }
      this.session.set(null);
      this.currentUser.set(null);
      this.profile.set(null);
      this.setDemoMode(false);
      this.landingHint.abmelden();
      this.router.navigate(['/auth/login']);
    } finally {
      this.isLoading.set(false);
    }
  }
```

- [ ] **Step 5: Run tests and checks**

Run: `npm run test -- abmelde-reichweite`
Expected: PASS, 5 Tests.

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit 0.

- [ ] **Step 6: Verify the scope by hand**

Der eigentliche Fehler lässt sich nur mit zwei Browsern zeigen:

```bash
npm start
```

1. In Chrome **und** in einem privaten Fenster mit demselben Konto anmelden.
2. In einem der beiden auf „Abmelden" klicken.
3. Im anderen die Seite neu laden → **muss angemeldet bleiben.** Vor dieser
   Änderung landete er auf der Anmeldeseite.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/auth.service.ts src/app/core/services/abmelde-reichweite.spec.ts
git commit -m "fix(auth): stop signing out every device on a normal sign-out"
```

Commit-Text (Warum): `signOut()` verwendet ohne Angabe den Bereich `global`; der Knopf beendete damit unangekündigt alle Sitzungen. Getrennt in lokales Abmelden und einen benannten Weg für alle Geräte.

---

### Task 4: Knopf „Von allen Geräten abmelden" in den Einstellungen

**Files:**

- Modify: `src/app/features/settings/settings.component.ts` (neue Signale und Methode)
- Modify: `src/app/features/settings/settings.component.html:81` (im Abschnitt „Mein Konto", direkt nach dem `</form>` des Profils)

**Interfaces:**

- Consumes: `AuthService.abmeldenUeberall()` aus Task 3, `ConfirmDialogService.frage()` (bereits in der Komponente injiziert).
- Produces: nichts für spätere Aufgaben.

- [ ] **Step 1: Add the method to the component**

In `src/app/features/settings/settings.component.ts` bei den übrigen Signalen ergänzen:

```ts
  readonly istUeberallAbmelden = signal(false);
```

Und nach `onSaveProfil()` (endet bei Zeile 353) einfügen:

```ts
  /**
   * Beendet die Sitzung auf allen Geraeten.
   *
   * Mit Rueckfrage, weil der Schritt jedes andere Geraet mitnimmt und sich
   * nicht zuruecknehmen laesst.
   */
  async onAbmeldenUeberall(): Promise<void> {
    const bestaetigt = await this.dialog.frage({
      titel: 'Von allen Geräten abmelden?',
      text:
        'Alle offenen Sitzungen werden beendet – auch auf deinem Handy und auf ' +
        'fremden Rechnern. Du musst dich überall neu anmelden.',
      bestaetigenText: 'Überall abmelden',
      gefahr: true,
    });

    if (!bestaetigt) return;

    this.istUeberallAbmelden.set(true);
    await this.auth.abmeldenUeberall();
  }
```

`this.dialog` ist der vorhandene `ConfirmDialogService` der Komponente
(`settings.component.ts:106`). `gefahr: true` färbt die Schaltfläche rot und legt
den Fokus auf „Abbrechen" – richtig hier, weil der Schritt jedes andere Gerät
mitnimmt. Von `DialogAnfrage` sind nur `titel` und `text` Pflicht.

- [ ] **Step 2: Add the button to the template**

In `src/app/features/settings/settings.component.html` direkt nach dem schließenden
`</form>` des Profil-Formulars (Zeile 81) und **vor** dem schließenden `</div>` der
Karte „Mein Konto" einfügen:

```html
<div class="pt-3 border-t border-fb-border space-y-2">
  <p class="text-[10px] text-fb-text-muted leading-relaxed">
    Gerät verloren oder auf einem fremden Rechner angemeldet geblieben? Damit werden sofort alle
    Sitzungen beendet – ohne auf den Ablauf zu warten.
  </p>
  <button
    type="button"
    (click)="onAbmeldenUeberall()"
    [disabled]="istUeberallAbmelden()"
    class="px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
  >
    {{ istUeberallAbmelden() ? 'Melde ab...' : 'Von allen Geräten abmelden' }}
  </button>
</div>
```

- [ ] **Step 3: Verify by hand**

Es gibt in diesem Projekt keine Komponententests; diese Aufgabe wird von Hand geprüft.

```bash
npm start
```

1. In zwei Browsern mit demselben Konto anmelden.
2. In einem `/settings` öffnen, Abschnitt „Mein Konto" – der Knopf ist da.
3. Klicken: die Rückfrage erscheint, rot und mit Fokus auf „Abbrechen".
   „Abbrechen" → nichts passiert, man bleibt angemeldet.
4. Erneut klicken, bestätigen → Weiterleitung auf die Anmeldeseite.
5. Im zweiten Browser neu laden → **muss jetzt bei der Anmeldung landen.** Genau
   hier liegt der Unterschied zum normalen Abmelden aus Task 3.

- [ ] **Step 4: Run checks**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: alles grün.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/settings/settings.component.ts src/app/features/settings/settings.component.html
git commit -m "feat(settings): add a sign out everywhere button"
```

---

### Task 5: Hinweis in der App beim Wiederherstellen einer Sitzung

**Files:**

- Modify: `src/app/core/services/auth.service.ts` (`sitzungWiederhergestellt`, gesetzt in `initAuth`)
- Create: `src/app/shared/components/session-hint-banner/session-hint-banner.component.ts`
- Create: `src/app/shared/components/session-hint-banner/session-hint-banner.component.html`
- Modify: `src/app/layout/shell/shell.component.ts` (Import und `imports`-Liste)
- Modify: `src/app/layout/shell/shell.component.html` (neben `<app-sync-error-banner>`)

**Interfaces:**

- Consumes: `AuthService.userEmail()`, `AuthService.signOut()`.
- Produces: `AuthService.sitzungWiederhergestellt: WritableSignal<boolean>` – wird ausschließlich in `initAuth()` auf `true` gesetzt, nie nach frischem Anmelden.

- [ ] **Step 1: Add the signal to the AuthService**

In `src/app/core/services/auth.service.ts` bei den übrigen Signalen ergänzen:

```ts
  /**
   * Wahr, wenn die Sitzung beim Start aus dem Browser-Speicher kam - nicht
   * nach einer frischen Anmeldung. Die Oberflaeche macht daraus einen
   * Hinweis, damit niemand unbemerkt in einem fremden Konto landet.
   */
  readonly sitzungWiederhergestellt = signal<boolean>(false);
```

In `initAuth()` innerhalb von `if (data?.session) { ... }` als **erste** Zeile ergänzen:

```ts
this.sitzungWiederhergestellt.set(true);
```

- [ ] **Step 2: Write the banner component**

Datei `src/app/shared/components/session-hint-banner/session-hint-banner.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideDynamicIcon, LucideUserCheck as UserCheck, LucideX as X } from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Sagt, wer angemeldet ist, wenn die Sitzung beim Start aus dem Speicher kam.
 *
 * Ohne diesen Hinweis fuehrte ein Klick auf "Anmelden" wortlos ins Dashboard -
 * richtig, aber verwirrend, und auf einem geteilten Rechner arbeitet man dann
 * unbemerkt im Konto eines anderen.
 *
 * Bewusst kein Dialog: Der Streifen laeuft im Seitenfluss mit und
 * unterbricht die Arbeit nicht.
 */
@Component({
  selector: 'app-session-hint-banner',
  imports: [LucideDynamicIcon],
  templateUrl: './session-hint-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionHintBannerComponent {
  private readonly auth = inject(AuthService);

  private readonly weggeklickt = signal(false);

  readonly sichtbar = computed(() => this.auth.sitzungWiederhergestellt() && !this.weggeklickt());
  readonly email = computed(() => this.auth.userEmail());

  readonly userIcon = UserCheck;
  readonly closeIcon = X;

  schliessen(): void {
    this.weggeklickt.set(true);
  }

  async abmelden(): Promise<void> {
    await this.auth.signOut();
  }
}
```

Datei `src/app/shared/components/session-hint-banner/session-hint-banner.component.html`:

```html
@if (sichtbar()) {
<div
  class="bg-fb-surface border-b border-fb-border px-4 md:px-6 py-2"
  role="status"
  aria-live="polite"
>
  <div class="max-w-7xl mx-auto flex items-center gap-3">
    <svg [lucideIcon]="userIcon" class="w-4 h-4 text-fb-text-muted shrink-0"></svg>

    <p class="text-[11px] text-fb-text-secondary leading-relaxed min-w-0 flex-1">
      Angemeldet als <span class="font-semibold">{{ email() }}</span> &ndash; nicht du?
      <button
        type="button"
        (click)="abmelden()"
        class="underline font-semibold hover:text-fb-text-primary cursor-pointer ml-1"
      >
        Abmelden
      </button>
    </p>

    <button
      type="button"
      (click)="schliessen()"
      class="p-0.5 rounded text-fb-text-muted hover:text-fb-text-primary hover:bg-fb-surface-hover cursor-pointer shrink-0"
      aria-label="Diesen Hinweis schliessen"
    >
      <svg [lucideIcon]="closeIcon" class="w-3 h-3"></svg>
    </button>
  </div>
</div>
}
```

- [ ] **Step 3: Hook it into the shell**

In `src/app/layout/shell/shell.component.ts` den Import ergänzen und die Komponente
in die `imports`-Liste des Decorators aufnehmen:

```ts
import { SessionHintBannerComponent } from '../../shared/components/session-hint-banner/session-hint-banner.component';
```

In `src/app/layout/shell/shell.component.html` direkt **über**
`<app-sync-error-banner></app-sync-error-banner>` einfügen:

```html
<!-- Wer ist angemeldet, wenn die Sitzung aus dem Speicher kam -->
<app-session-hint-banner></app-session-hint-banner>
```

- [ ] **Step 4: Verify by hand**

```bash
npm start
```

1. Anmelden → **kein** Band (frische Anmeldung).
2. Seite neu laden → Band erscheint mit der eigenen Adresse.
3. Auf „Abmelden" im Band klicken → Anmeldeseite.
4. Band wegklicken, im Menü navigieren → bleibt weg.

- [ ] **Step 5: Run checks**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: alles grün.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/auth.service.ts src/app/shared/components/session-hint-banner src/app/layout/shell
git commit -m "feat(layout): say who is signed in when a session is restored"
```

---

### Task 6: Caddy und Landingpage

**Files:**

- Modify: `deploy/Caddyfile` (Block `flipbase.de`)
- Modify: `landing/index.html:554`
- Test: `src/app/core/services/landing-template.spec.ts` (neu)

**Interfaces:**

- Consumes: den Cookie-Namen aus Task 2 (`flipbase_angemeldet`).
- Produces: nichts für spätere Aufgaben.

- [ ] **Step 1: Write the failing test**

Die Gefahr ist eng umrissen: Steht die Template-Zeile in der Landingpage, ohne dass
Caddy `templates` ausführt, erscheint sie als roher Text auf der Seite. Der Test hält
beide Dateien zusammen.

Datei `src/app/core/services/landing-template.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HINWEIS_COOKIE } from './landing-hint.service';

/**
 * Die Landingpage wird von Caddy als Vorlage ausgeliefert. Fehlt dort die
 * templates-Direktive, steht die Bedingung als roher Text auf der Seite -
 * sichtbar fuer jeden Besucher. Beide Dateien gehoeren deshalb zusammen.
 */
const wurzel = process.cwd();
const seite = readFileSync(join(wurzel, 'landing', 'index.html'), 'utf-8');
const caddyfile = readFileSync(join(wurzel, 'deploy', 'Caddyfile'), 'utf-8');

describe('Anmeldehinweis auf der Landingpage', () => {
  it('fragt das Merk-Cookie unter genau dem Namen ab, den die App setzt', () => {
    expect(seite).toContain(`.Cookie "${HINWEIS_COOKIE}"`);
  });

  it('Caddy wertet die Vorlage aus', () => {
    expect(caddyfile).toMatch(/^\s*templates\s*$/m);
  });

  it('die Antwort haengt vom Cookie ab und darf nicht blind zwischengespeichert werden', () => {
    expect(caddyfile).toMatch(/Vary Cookie/);
  });

  it('die Seite bringt weiterhin kein eigenes JavaScript mit', () => {
    expect(seite).not.toContain('<script');
    expect(caddyfile).toContain("script-src 'none'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- landing-template`
Expected: FAIL bei den ersten drei Prüfungen; die vierte ist bereits grün und soll das auch bleiben.

- [ ] **Step 3: Change the landing page**

In `landing/index.html` Zeile 554 ersetzen:

```html
<a class="kopf-link" href="https://app.flipbase.de">Anmelden →</a>
```

durch:

```html
{{if .Cookie "flipbase_angemeldet"}}
<a class="kopf-link" href="https://app.flipbase.de">Zur App →</a>
{{else}}
<a class="kopf-link" href="https://app.flipbase.de">Anmelden →</a>
{{end}}
```

- [ ] **Step 4: Change the Caddyfile**

Im Block `flipbase.de` von `deploy/Caddyfile`:

`templates` **vor** `file_server` ergänzen (Caddys Standardreihenfolge sortiert es
ohnehin dorthin, es steht der Lesbarkeit halber trotzdem an der richtigen Stelle):

```
	root * /srv/landing
	templates
	file_server
	encode zstd gzip
```

Im `header`-Block der Landingpage ergänzen, direkt nach `-server`:

```
		# Die Antwort haengt vom Merk-Cookie ab. Ohne diesen Hinweis koennte ein
		# Zwischenspeicher den falschen Knopftext ausliefern.
		Vary Cookie
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- landing-template`
Expected: PASS, 4 Tests.

- [ ] **Step 6: Commit**

```bash
git add landing/index.html deploy/Caddyfile src/app/core/services/landing-template.spec.ts
git commit -m "feat(landing): show a link to the app when already signed in"
```

- [ ] **Step 7: Verify after deploying**

Erst nach dem Ausrollen prüfbar – die Vorlage wertet Caddy aus, nicht der Browser:

```bash
curl -s https://flipbase.de | grep -A1 kopf-link
```

Erwartet: `Anmelden →`, und **keine** geschweiften Klammern in der Ausgabe.

```bash
curl -s -H "Cookie: flipbase_angemeldet=1" https://flipbase.de | grep -A1 kopf-link
```

Erwartet: `Zur App →`.

Erscheint `{{if …}}` als Text, fehlt `templates` im Caddyfile oder Caddy wurde nicht neu geladen.

---

### Task 7: Sitzungsdauer auf dem Server begrenzen

Kein Anwendungscode. Die Supabase-Konfiguration liegt **nicht** in diesem Repo –
`deploy/docker-compose.app.yml` hängt sich nur in das fremde Netz `supabase_default`.
Diese Aufgabe schreibt die Werte im Betriebshandbuch fest und beschreibt den Eingriff
auf dem Server.

**Files:**

- Modify: `deploy/README.md` (neuer Abschnitt)

**Interfaces:**

- Consumes: nichts.
- Produces: nichts.

- [ ] **Step 1: Check the variable names against the running version**

Die Namen stammen aus der Supabase-Dokumentation, nicht aus einer Prüfung an dieser
Instanz. Vor dem Setzen auf dem Server:

```bash
docker inspect supabase-auth --format '{{.Config.Image}}'
```

Fassung notieren und in der GoTrue-Dokumentation dieser Fassung gegenprüfen, dass
`GOTRUE_SESSIONS_TIMEBOX` und `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` existieren.
Fehlen sie, hier abbrechen und Rücksprache halten – ein falscher Name wird
stillschweigend ignoriert, und die Grenze wäre nur scheinbar gesetzt.

- [ ] **Step 2: Document the values**

In `deploy/README.md` einen Abschnitt ergänzen:

```markdown
## Sitzungsdauer

Supabase Auth erzwingt zwei unabhaengige Grenzen. Beide gehoeren in die
Umgebung des Auth-Containers (`docker-compose.yml` der Supabase-Installation):

| Variable                             | Wert   | Bedeutung                                              |
| ------------------------------------ | ------ | ------------------------------------------------------ |
| `GOTRUE_SESSIONS_TIMEBOX`            | `720h` | 30 Tage ab der Anmeldung, unabhaengig von der Nutzung. |
| `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` | `168h` | 7 Tage ohne Nutzung.                                   |

Go-Zeitformat. Die Variable **weglassen** bedeutet "nie"; `0` wird abgelehnt.

Warum diese Werte: Ohne Timebox wird das Refresh-Token endlos erneuert, eine
Anmeldung lief also nie ab. NIST 800-63B nennt fuer die Anmeldung nur mit
Passwort 30 Tage als Obergrenze. Kurze Inaktivitaetsgrenzen scheiden aus, weil
ein Rauswurf mitten im Formular Eingaben kostet.

Die Pruefung greift bei der naechsten Token-Erneuerung, nicht sekundengenau -
die tatsaechliche Dauer kann eine Token-Laufzeit laenger sein.

Sofort wirksam abmelden geht ueber "Von allen Geraeten abmelden" in den
Einstellungen der App.
```

- [ ] **Step 3: Commit**

```bash
git add deploy/README.md
git commit -m "docs(deploy): write down the session lifetime limits"
```

- [ ] **Step 4: Apply on the server**

Auf dem Server in der Supabase-Installation die beiden Variablen beim
Auth-Dienst ergänzen, dann:

```bash
docker compose up -d auth
```

- [ ] **Step 5: Verify**

```bash
docker exec supabase-auth env | grep SESSIONS
```

Erwartet: beide Variablen mit `720h` und `168h`.

Danach im Browser prüfen, dass eine bestehende Anmeldung weiterhin funktioniert und
ein Neuladen nicht zur Anmeldeseite führt. Die Grenzen selbst lassen sich nicht in
Minuten nachstellen; wer es sehen will, setzt vorübergehend `1m` und beobachtet, dass
die Sitzung nach der nächsten Erneuerung endet – danach die echten Werte zurücksetzen.

---

## Reihenfolge und Abhängigkeiten

```
Task 1 (Umgebung + CI)
   └─> Task 2 (Cookie-Dienst)
          └─> Task 3 (AuthService: Reichweite + Cookie)
                 ├─> Task 4 (Knopf in den Einstellungen)
                 └─> Task 5 (Band in der App)
Task 6 (Caddy + Landingpage)   – braucht nur den Cookie-Namen aus Task 2
Task 7 (Server)                – unabhaengig, kann jederzeit laufen
```

Nach Task 3 ist die Sicherheitskorrektur am Abmelden vollständig und könnte für
sich ausgerollt werden. Der Hinweis auf der Landingpage wirkt erst, wenn Task 2,
3 und 6 zusammen live sind.
