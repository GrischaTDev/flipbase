# Administration in der Seitenleiste – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Unterseiten der Administration klappen in der Seitenleiste unter „Administration“ auf. Die Reiterleiste entfällt, und die vier Seiten bekommen einen einheitlichen Rahmen.

**Architecture:** Eine Liste `PLATFORM_ADMIN_NAVIGATION` in `core/config/` beschreibt die Unterpunkte. `NavItem` in der Seitenleiste erhält optionale `children`. Die Leiste rendert sie nur, solange die Adresse im Bereich liegt, mit derselben Pfadregel wie `isItemActive`. Die Hüllkomponente `platform-admin-shell` entfällt; die Seiten hängen direkt an den Routen.

**Tech Stack:** Angular 22 (Signals, Control Flow), Tailwind, Vitest-Projekt `angular` mit TestBed und axe-core.

Spezifikation: `docs/superpowers/specs/2026-09-13-admin-sidebar-navigation-design.md`

## Global Constraints

- Arbeitsordner `K:\GitHub\Repos\flipbase\.worktrees\admin-sidebar-navigation`, Zweig `feat/admin-sidebar-navigation`.
- Bezeichner englisch, Kommentare und Oberflächentexte deutsch.
- Keine ARIA-Menürollen; genau ein `aria-current="page"` in der Leiste.
- Keine neuen, geschätzten Shopify-Maße; Auszeichnung wie bestehende Hauptpunkte (`font-semibold`, 13 px).
- Commits englisch, Conventional Commits, ohne KI-Signatur.
- Angular-Tests: `npx vitest run --project=angular <pfad>`.

---

### Task 1: Unterpunkte in der Seitenleiste

**Files:**

- Create: `src/app/core/config/platform-admin-navigation.ts`
- Create: `src/app/layout/sidebar/sidebar.component.angular.spec.ts`
- Modify: `src/app/layout/sidebar/sidebar.component.ts`
- Modify: `src/app/layout/sidebar/sidebar.component.html` (Block `@if (isOperator())`)

**Interfaces:**

- Produces: `SubNavigationItem { readonly label: string; readonly path: string }`,
  `PLATFORM_ADMIN_NAVIGATION: readonly SubNavigationItem[]`,
  `SidebarComponent.isChildActive(child: SubNavigationItem): boolean`,
  Markierung `data-sub-navigation` am `<ul>` der Unterpunkte.

- [ ] **Step 1: Test schreiben** – `sidebar.component.angular.spec.ts`:

```ts
import '@angular/compiler';
import { Component, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { PwaService } from '../../core/services/pwa.service';
import { SidebarComponent } from './sidebar.component';

class TestPageComponent {}
Component({ selector: 'app-test-page', template: '' })(TestPageComponent);

// Dieselben Pfade wie platform-admin.routes.ts; die Seiten sind Platzhalter,
// weil hier nur die Navigation geprueft wird.
const routes: Routes = [
  { path: 'dashboard', component: TestPageComponent },
  {
    path: 'admin',
    children: [
      { path: '', redirectTo: 'applications', pathMatch: 'full' },
      { path: 'applications', component: TestPageComponent },
      { path: 'queries', component: TestPageComponent },
      { path: 'operation', component: TestPageComponent },
      { path: 'categories', component: TestPageComponent },
    ],
  },
];

describe('SidebarComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
  });

  afterEach(() => TestBed.resetTestingModule());

  async function renderAt(url: string, operator = true) {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter(routes),
        provideTranslateService({ lang: 'de' }),
        {
          provide: PlatformOperatorService,
          useValue: { operator: signal(operator), isOperator: vi.fn(async () => operator) },
        },
        { provide: PwaService, useValue: { isInstallable: signal(false), promptInstall: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    return {
      element,
      adminLink: element.querySelector<HTMLAnchorElement>('a[href="/admin"]'),
      subLinks: Array.from(element.querySelectorAll<HTMLAnchorElement>('[data-sub-navigation] a')),
    };
  }

  it('zeigt die Unterpunkte der Administration in fester Reihenfolge', async () => {
    const { subLinks } = await renderAt('/admin/applications');

    expect(subLinks.map((link) => link.textContent?.trim())).toEqual([
      'Bewerbungen',
      'Sammelaufträge',
      'Botbetrieb',
      'Kategorieliste',
    ]);
    expect(subLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/applications',
      '/admin/queries',
      '/admin/operation',
      '/admin/categories',
    ]);
  });

  // Beide Richtungen, damit der Test nicht gruen bliebe, wenn aria-current
  // fest auf einem Punkt stuende.
  it('zeichnet nur den aktiven Unterpunkt als aktuelle Seite aus', async () => {
    const applications = await renderAt('/admin/applications');
    expect(applications.subLinks.map((link) => link.getAttribute('aria-current'))).toEqual([
      'page',
      null,
      null,
      null,
    ]);
    expect(applications.adminLink?.getAttribute('aria-current')).toBeNull();
    expect(applications.adminLink?.classList.contains('font-semibold')).toBe(true);
    expect(applications.element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    TestBed.resetTestingModule();
    const categories = await renderAt('/admin/categories');
    expect(categories.subLinks.map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'page',
    ]);
  });

  it('klappt die Unterpunkte ausserhalb der Administration zu', async () => {
    const { adminLink, subLinks } = await renderAt('/dashboard');

    expect(adminLink).not.toBeNull();
    expect(adminLink?.classList.contains('font-semibold')).toBe(false);
    expect(subLinks).toEqual([]);
  });

  it('zeigt Nicht-Betreibern weder Administration noch Unterpunkte', async () => {
    const { adminLink, subLinks } = await renderAt('/admin/applications', false);

    expect(adminLink).toBeNull();
    expect(subLinks).toEqual([]);
  });

  it('hat keine automatisch erkennbaren schwerwiegenden Barrieren', async () => {
    const { element } = await renderAt('/admin/queries');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });

    expect(
      result.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run --project=angular src/app/layout/sidebar/sidebar.component.angular.spec.ts`
Expected: FAIL – `subLinks` leer, `aria-current` am Administration-Link.

- [ ] **Step 3: Liste anlegen** – `src/app/core/config/platform-admin-navigation.ts`:

```ts
export interface SubNavigationItem {
  readonly label: string;
  readonly path: string;
}

/**
 * Die Unterseiten der Administration, wie sie in der Seitenleiste
 * aufklappen. Die Reihenfolge hier ist die Reihenfolge im Menue.
 */
export const PLATFORM_ADMIN_NAVIGATION: readonly SubNavigationItem[] = [
  { label: 'Bewerbungen', path: '/admin/applications' },
  { label: 'Sammelaufträge', path: '/admin/queries' },
  { label: 'Botbetrieb', path: '/admin/operation' },
  { label: 'Kategorieliste', path: '/admin/categories' },
];
```

- [ ] **Step 4: Seitenleiste – Logik** in `sidebar.component.ts`:
  - Import `PLATFORM_ADMIN_NAVIGATION, SubNavigationItem` aus `../../core/config/platform-admin-navigation`.
  - `NavItem` um `children?: readonly SubNavigationItem[];` mit Kommentar ergänzen.
  - `isItemActive` auf gemeinsame Pfadregel umstellen:

```ts
  isItemActive(item: NavItem): boolean {
    if (item.path === '/catalog') return isArticleRoute(this.currentUrl());
    return this.isWithin(item.path);
  }

  isChildActive(child: SubNavigationItem): boolean {
    return this.isWithin(child.path);
  }

  private isWithin(path: string): boolean {
    const current = this.currentUrl().split(/[?#]/, 1)[0];
    return current === path || current.startsWith(path + '/');
  }
```

- `operatorItem` erhält `children: PLATFORM_ADMIN_NAVIGATION`.
- `RouterLinkActive` aus den Imports entfernen, falls danach unbenutzt.

- [ ] **Step 5: Seitenleiste – Vorlage**: Den Administration-Link im Block `@if (isOperator())` ersetzen durch:

```html
<a
  [routerLink]="operatorItem.path"
  [class.font-semibold]="isItemActive(operatorItem)"
  (click)="closed.emit()"
  class="flex items-center gap-2 px-2 py-1 leading-5 rounded-md text-[13px] text-fb-text-secondary hover:text-fb-text-primary hover:bg-fb-surface-hover transition group border border-transparent"
>
  <svg
    [lucideIcon]="operatorItem.icon"
    class="w-4 h-4 text-fb-text-muted group-hover:text-fb-text-primary shrink-0"
  ></svg>
  <span class="min-w-0 break-words"
    >{{ (operatorItem.labelKey | translate) || operatorItem.label }}</span
  >
</a>

<!--
        Wie im Shopify-Admin: Die Unterpunkte stehen nur im DOM, solange man im
        Bereich ist. Der Bereichslink traegt dann kein aria-current, damit es
        genau eine aktuelle Seite gibt - die des Unterpunkts.
      -->
@if (operatorItem.children && isItemActive(operatorItem)) {
<ul data-sub-navigation class="space-y-0.5">
  @for (child of operatorItem.children; track child.path) { @let active = isChildActive(child);
  <li>
    <a
      [routerLink]="child.path"
      [attr.aria-current]="active ? 'page' : null"
      [class.font-semibold]="active"
      [class.font-medium]="!active"
      [class.text-fb-text-primary]="active"
      [class.text-fb-text-secondary]="!active"
      (click)="closed.emit()"
      class="flex items-center py-1 pl-8 pr-2 leading-5 rounded-md text-[13px] hover:text-fb-text-primary hover:bg-fb-surface-hover transition border border-transparent"
    >
      <span class="min-w-0 break-words">{{ child.label }}</span>
    </a>
  </li>
  }
</ul>
}
```

- [ ] **Step 6: Test laufen lassen, er muss bestehen** (Befehl wie Step 2). Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/config/platform-admin-navigation.ts src/app/layout/sidebar
git commit -m "feat(ui): nest platform admin pages under the sidebar entry"
```

### Task 2: Reiterleiste entfernen, Seiten einheitlich rahmen

**Files:**

- Delete: `src/app/features/platform-admin/platform-admin-shell/` (ts, html, angular.spec.ts)
- Modify: `src/app/features/platform-admin/platform-admin.routes.ts`
- Modify: `src/app/features/platform-admin/pages/sniper-queries/sniper-queries.component.html:1`
- Modify: `src/app/features/platform-admin/pages/sniper-operation/sniper-operation.component.html:1`
- Modify: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.{html,ts}`
- Modify: `src/app/features/platform-admin/pages/vinted-categories/vinted-categories.component.angular.spec.ts` (Vorlagen-Auflösung)

**Interfaces:**

- Consumes: `PLATFORM_ADMIN_NAVIGATION` aus Task 1 (Pfade müssen zu den Routen passen).

- [ ] **Step 1: Routen ohne Hülle**:

```ts
import { Routes } from '@angular/router';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';

// Die Unterseiten stehen in der Seitenleiste (core/config/platform-admin-navigation.ts);
// eine eigene Huelle mit Reiterleiste gibt es nicht mehr.
export const platformAdminRoutes: Routes = [
  { path: '', redirectTo: 'applications', pathMatch: 'full' },
  {
    path: 'applications',
    loadComponent: () =>
      import('./pages/beta-applications/beta-applications.component').then(
        (m) => m.BetaApplicationsComponent,
      ),
  },
  {
    path: 'categories',
    loadComponent: () =>
      import('./pages/vinted-categories/vinted-categories.component').then(
        (m) => m.VintedCategoriesComponent,
      ),
  },
  {
    path: 'queries',
    canDeactivate: [unsavedEntryGuard],
    loadComponent: () =>
      import('./pages/sniper-queries/sniper-queries.component').then(
        (m) => m.SniperQueriesComponent,
      ),
  },
  {
    path: 'operation',
    loadComponent: () =>
      import('./pages/sniper-operation/sniper-operation.component').then(
        (m) => m.SniperOperationComponent,
      ),
  },
];
```

- [ ] **Step 2: Hülle löschen**: `git rm -r src/app/features/platform-admin/platform-admin-shell`

- [ ] **Step 3: Rahmen der Bot-Seiten**: In `sniper-queries.component.html` und `sniper-operation.component.html` Zeile 1 von
      `<section class="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6">` auf
      `<section class="flex flex-col gap-4">` ändern. `flex-col gap-4` bleibt, damit
      sich der Abstand zwischen den Blöcken nicht verschiebt.

- [ ] **Step 4: Kategorieliste**: Zeilen 1–7 der Vorlage ersetzen durch

```html
<section class="flex flex-col gap-4">
  <app-page-header
    title="Kategorieliste"
    subtitle="Das gespeicherte Kategorienverzeichnis von Vinted. Der Status wird automatisch aktualisiert."
  />

  <!-- Wenig Inhalt: bleibt schmal, der Seitenkopf fluchtet mit den anderen Seiten. -->
  <div class="flex max-w-3xl flex-col gap-6"></div>
</section>
```

Vor dem schließenden `</section>` ein `</div>` ergänzen und den Inhalt um eine
Ebene einrücken (Prettier). In `vinted-categories.component.ts`
`PageHeaderComponent` aus `../../../../shared/components/page-header/page-header.component`
importieren und in `imports` aufnehmen.

- [ ] **Step 5: Test der Kategorieliste**: `beforeAll` löst externe Vorlagen relativ zur Testdatei auf und findet `./page-header.component.html` dort nicht. Ersetzen durch:

```ts
beforeAll(async () => {
  const resources: Record<string, string> = {
    './page-header.component.html':
      '../../../../shared/components/page-header/page-header.component.html',
    './page-header.component.scss':
      '../../../../shared/components/page-header/page-header.component.scss',
  };
  await ɵresolveComponentResources((url) =>
    readFile(new URL(resources[url] ?? url, import.meta.url), 'utf8'),
  );
});
```

- [ ] **Step 6: Tests**

Run: `npx vitest run --project=angular src/app/features/platform-admin src/app/layout/sidebar`
Expected: alle bestanden.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/features/platform-admin
git commit -m "refactor(ui): drop the admin tab bar and align admin page frames"
```

### Task 3: Prüfen und abschließen

- [ ] Format und Lint der geänderten Dateien: `npx prettier --write <dateien>` und `npx eslint <dateien>`.
- [ ] `npm run build > build.log 2>&1; echo $?` – Exitcode 0 (Vorlagen).
- [ ] Sichtprüfung im Browser auf `/admin/applications` und `/admin/categories`, Desktop und Handybreite, mit Bildschirmfoto.
- [ ] AI-Changelog-Eintrag um Ergebnis und Prüfungen ergänzen, Commit `docs(ui): …`.
- [ ] Nutzer fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“
