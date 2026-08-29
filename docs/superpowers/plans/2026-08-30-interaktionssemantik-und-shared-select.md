# Interaktionssemantik und Shared Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle echten Bedienelemente kommunizieren ihre Klickbarkeit konsistent, deaktivierte Elemente zeigen den richtigen Zustand und das gemeinsame Auswahlfeld ersetzt den Dashboard-Plattformfilter ohne Accessibility-Regression.

**Architecture:** Eine eng begrenzte globale Cursorregel setzt nur semantische Controls auf `pointer` und überschreibt deaktivierte Controls mit `not-allowed`. `CustomSelectComponent` bleibt ein nativer Button mit Select-only-Combobox-Semantik; der Trigger behält den Fokus und steuert aktive Listbox-Optionen über `aria-activedescendant`.

**Tech Stack:** Angular 22, TypeScript strict, Signals, ControlValueAccessor, Tailwind CSS 4, Vitest/jsdom, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-30-bedienkonsistenz-und-dashboard-interaktion-design.md`

## Global Constraints

- Framework: Angular 22, Standalone Components, Signals, `ChangeDetectionStrategy.OnPush`, strikte Typen.
- Tailwind-Klassen bleiben im Template; nur die appweite semantische Cursorregel wird in `src/styles.css` definiert.
- Kein pauschaler Pointer für `[tabindex]`, alle ARIA-Rollen, alle Labels, Textfelder, Datumsfelder oder Textareas.
- Kein `pointer-events: none` und kein `!important` für deaktivierte Controls.
- `aria-disabled` wird zusätzlich im Handler geschützt; ARIA allein blockiert keine Interaktion.
- Das Shared Select bleibt generisch und ControlValueAccessor-kompatibel.
- Jede Custom-Select-Instanz erhält einen konkreten zugänglichen Namen.
- Kein Typeahead, keine Suche und keine Mehrfachauswahl in diesem Paket.
- Jeder Task folgt RED → GREEN → Refactor und endet mit einem eigenen Commit.

---

## File Map

- Create `src/styles.cursor.spec.ts`: statischer Vertrag für erlaubte und verbotene globale Cursorselektoren.
- Create `src/app/accessibility-semantics.spec.ts`: verhindert unechte `href="#"`-Bedienelemente.
- Modify `src/styles.css`: aktive und deaktivierte Cursorsemantik.
- Create `src/app/shared/components/custom-checkbox/custom-checkbox.component.spec.ts`: Native-disabled/CVA/Axe-Vertrag.
- Modify `src/app/shared/components/custom-checkbox/custom-checkbox.component.ts` and `.html`: Cursor-Konflikt entfernen und Button wirklich deaktivieren.
- Modify `src/app/features/auth/register/register.component.html`: unechte Rechtslinks als ehrlichen nichtinteraktiven Text rendern.
- Create `src/app/shared/components/custom-select/custom-select.component.spec.ts`: ARIA-, Tastatur-, Fokus- und CVA-Vertrag.
- Modify `src/app/shared/components/custom-select/custom-select.component.ts` and `.html`: vollständige Select-only-Combobox.
- Modify every Custom-Select call-site listed in Task 4: required accessible name.
- Create `src/app/features/dashboard/dashboard.component.spec.ts`: Plattformoptionen, Reset, Tastatursemantik und Header-Axe.
- Modify `src/app/features/dashboard/dashboard.component.ts` and `.html`: Shared Select einsetzen.

---

### Task 1: Global semantic cursors and honest legal text

**Files:**

- Create: `src/styles.cursor.spec.ts`
- Create: `src/app/accessibility-semantics.spec.ts`
- Modify: `src/styles.css:456`
- Modify: `src/app/features/auth/register/register.component.html:220`

**Interfaces:**

- Produces CSS behavior for active native controls and disabled native/ARIA controls.
- Does not produce a TypeScript API.

- [ ] **Step 1: Write the failing stylesheet contract**

  In `src/styles.cursor.spec.ts`, read `src/styles.css` and assert the exact selector groups and declarations. Normalize whitespace before matching. Required cases:

  ```ts
  expect(css).toContain('button:not(:disabled):not([aria-disabled="true"])');
  expect(css).toContain('a[href]:not([aria-disabled="true"])');
  expect(css).toContain('select:not(:disabled):not([aria-disabled="true"])');
  expect(css).toMatch(/input[^}]+\[type=['"]checkbox['"]\][^}]+cursor:\s*pointer/s);
  expect(css).toMatch(/:disabled[^}]+cursor:\s*not-allowed/s);
  expect(css).toMatch(/\[aria-disabled=['"]true['"]\][^}]+cursor:\s*not-allowed/s);
  expect(css).not.toMatch(/\[tabindex\][^{]*\{[^}]*cursor:\s*pointer/s);
  expect(css).not.toMatch(/textarea[^{]*\{[^}]*cursor:\s*pointer/s);
  const cursorContract = css.slice(
    css.indexOf('/* interaction-cursors:start */'),
    css.indexOf('/* interaction-cursors:end */'),
  );
  expect(cursorContract).not.toContain('pointer-events: none');
  expect(cursorContract).not.toContain('!important');
  ```

  Assert action input types `button`, `submit`, `reset`, `checkbox`, `radio`, `file`, `range`, `color` and `image`; explicitly assert text/date/email/number are not in the pointer group.

- [ ] **Step 2: Write the failing semantic-template test**

  In `src/app/accessibility-semantics.spec.ts` read the registration template:

  ```ts
  const register = readFileSync('src/app/features/auth/register/register.component.html', 'utf8');
  expect(register).not.toContain('href="#"');
  expect(register).not.toContain('(click)="$event.preventDefault()"');
  ```

- [ ] **Step 3: Run RED**

  ```powershell
  npx vitest run src/styles.cursor.spec.ts src/app/accessibility-semantics.spec.ts
  ```

  Expected: FAIL because the cursor contract is absent and the two fake links still use `href="#"`.

- [ ] **Step 4: Add the narrow CSS contract**

  Add after the global focus rule and wrap the two layers in the literal comments `/* interaction-cursors:start */` and `/* interaction-cursors:end */` so the contract test inspects only these rules:

  ```css
  @layer base {
    :where(
      button:not(:disabled):not([aria-disabled='true']),
      a[href]:not([aria-disabled='true']),
      summary,
      select:not(:disabled):not([aria-disabled='true']),
      input:not(:disabled):not([aria-disabled='true']):is(
          [type='button'],
          [type='submit'],
          [type='reset'],
          [type='checkbox'],
          [type='radio'],
          [type='file'],
          [type='range'],
          [type='color'],
          [type='image']
        )
    ) {
      cursor: pointer;
    }
  }

  @layer utilities {
    :where(button, input, select, textarea):disabled,
    :where(
      [role='button'],
      [role='link'],
      [role='checkbox'],
      [role='option'],
      [role='combobox']
    )[aria-disabled='true'],
    a[aria-disabled='true'] {
      cursor: not-allowed;
    }
  }
  ```

  Replace the two registration `<a href="#">` elements with noninteractive `<span>` elements using the same readable text color and underline, but no link hover class. Remove `cursor-pointer` from the surrounding terms sentence because clicking that sentence does not toggle the checkbox.

- [ ] **Step 5: Run GREEN and commit**

  ```powershell
  npx vitest run src/styles.cursor.spec.ts src/app/accessibility-semantics.spec.ts
  npx prettier --check src/styles.css src/styles.cursor.spec.ts src/app/accessibility-semantics.spec.ts src/app/features/auth/register/register.component.html
  git add src/styles.css src/styles.cursor.spec.ts src/app/accessibility-semantics.spec.ts src/app/features/auth/register/register.component.html
  git commit -m "fix: define semantic cursor behavior"
  ```

---

### Task 2: Fix the disabled Custom Checkbox contract

**Files:**

- Create: `src/app/shared/components/custom-checkbox/custom-checkbox.component.spec.ts`
- Modify: `src/app/shared/components/custom-checkbox/custom-checkbox.component.ts`
- Modify: `src/app/shared/components/custom-checkbox/custom-checkbox.component.html`

**Interfaces:**

- Consumes existing `ControlValueAccessor`, `checked` model, `disabled` input and `setDisabledState`.
- Produces a genuinely disabled inner `<button>`; the public component API is unchanged.

- [ ] **Step 1: Write the failing native-disabled and interaction tests**

  Render the component with TestBed and cover input-disabled plus CVA-disabled:

  ```ts
  fixture.componentRef.setInput('disabled', true);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  button.click();
  expect(fixture.componentInstance.checked()).toBe(false);
  ```

  Register an `onChange` spy, enable the component and click once. The interaction must toggle exactly once. Assert that the template adds no custom Space/Enter handler, because the native button owns keyboard activation; the real-browser gate in Task 6 verifies that behavior. Assert `aria-checked` for `false`, `true` and `mixed`. Run axe for enabled, disabled and mixed states with jsdom color contrast disabled.

  Assert neither host nor inner button simultaneously exposes `cursor-pointer` and `cursor-not-allowed` classes.

- [ ] **Step 2: Run RED**

  ```powershell
  npx vitest run src/app/shared/components/custom-checkbox/custom-checkbox.component.spec.ts
  ```

  Expected: FAIL because the inner button has no native `disabled` binding and retains a static pointer class.

- [ ] **Step 3: Implement native disabled semantics**

  Add to the inner button:

  ```html
  [disabled]="effectiveDisabled()"
  ```

  Remove the static `cursor-pointer` class and the host cursor class bindings. Keep host layout and disabled opacity. Keep the early return in `toggle()` as defense in depth. Native button keyboard behavior supplies Enter/Space; do not add duplicate key handlers.

- [ ] **Step 4: Run GREEN and commit**

  ```powershell
  npx vitest run src/app/shared/components/custom-checkbox/custom-checkbox.component.spec.ts
  npm run typecheck
  git add -- src/app/shared/components/custom-checkbox/custom-checkbox.component.ts src/app/shared/components/custom-checkbox/custom-checkbox.component.html src/app/shared/components/custom-checkbox/custom-checkbox.component.spec.ts
  git commit -m "fix: disable custom checkbox natively"
  ```

---

### Task 3: Implement the accessible Select-only Combobox

**Files:**

- Create: `src/app/shared/components/custom-select/custom-select.component.spec.ts`
- Modify: `src/app/shared/components/custom-select/custom-select.component.ts`
- Modify: `src/app/shared/components/custom-select/custom-select.component.html`

**Interfaces:**

- Preserves: `value`, `placeholder`, `variant`, `size`, `disabled`, `widthClass`, `openDirection`, and ControlValueAccessor behavior.
- Produces:

  ```ts
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly ariaLabel = input.required<string>();
  readonly triggerId = input<string>('');
  readonly activeIndex = signal(-1);
  readonly resolvedTriggerId: Signal<string>;
  readonly listboxId: Signal<string>;
  readonly activeDescendantId: Signal<string | null>;

  openDropdown(initial: 'selected' | 'first' | 'last'): void;
  closeDropdown(restoreFocus?: boolean): void;
  onTriggerKeydown(event: KeyboardEvent): void;
  setActiveIndex(index: number): void;
  selectActiveOption(): void;
  optionId(index: number): string;
  ```

- [ ] **Step 1: Write failing ARIA relationship tests**

  Render two instances and assert unique IDs. For each trigger require:

  ```ts
  expect(trigger.getAttribute('role')).toBe('combobox');
  expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(trigger.getAttribute('aria-label')).toBe('Plattform filtern');
  ```

  After opening, `aria-controls` must equal the rendered listbox ID and `aria-activedescendant` must equal an existing `role="option"` ID. Every option has `aria-selected`; two component instances must have no duplicate IDs.

- [ ] **Step 2: Write failing keyboard and CVA tests through DOM events**

  Test this exact matrix:

  - Enter or Space while closed opens and activates the selected option or the first option.
  - ArrowDown while closed opens at selected/first; while open moves to the next option and clamps at the end.
  - ArrowUp while closed opens at selected/last; while open moves to the previous option and clamps at the start.
  - Home and End while open activate first and last.
  - Enter or Space while open selects the active option, calls `onChange` once, closes and restores trigger focus.
  - Escape closes without value change and restores trigger focus.
  - Tab closes without calling `preventDefault()` and allows native focus movement.
  - Pointer selection calls `onChange` once and restores trigger focus.
  - Outside click closes without changing the value.
  - Input-disabled and CVA-disabled prevent opening and selection.

  Navigation alone must never update `value`. Add axe checks for closed, open and disabled states, disabling only jsdom's color-contrast rule.

- [ ] **Step 3: Run RED**

  ```powershell
  npx vitest run src/app/shared/components/custom-select/custom-select.component.spec.ts
  ```

- [ ] **Step 4: Implement IDs, focus and keyboard behavior**

  Use this module-local ID strategy and add `viewChild.required<ElementRef<HTMLButtonElement>>('trigger')`; place `#trigger` on all three mutually exclusive trigger buttons:

  ```ts
  let nextCustomSelectId = 0;

  private readonly instanceId = ++nextCustomSelectId;
  readonly resolvedTriggerId = computed(
    () => this.triggerId() || `custom-select-trigger-${this.instanceId}`,
  );
  readonly listboxId = computed(() => `${this.resolvedTriggerId()}-listbox`);
  readonly activeDescendantId = computed(() =>
    this.isOpen() && this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null,
  );

  optionId(index: number): string {
    return `${this.listboxId()}-option-${index}`;
  }
  ```

  Keep focus on the trigger while the popup is open. `setActiveIndex` clamps to `0..options.length - 1`; empty options use `-1`. `selectActiveOption` calls the existing selection path. Mouse selection and Escape queue trigger focus after the conditional popup is removed.

  Remove the document-level Escape host binding. Handle keys only in `(keydown)="onTriggerKeydown($event)"` on the focused trigger. For Tab call `closeDropdown(false)` and do not prevent default.

  Add the same ARIA bindings to every trigger variant:

  ```html
  role="combobox" aria-haspopup="listbox" [id]="resolvedTriggerId()" [attr.aria-label]="ariaLabel()"
  [attr.aria-expanded]="isOpen()" [attr.aria-controls]="isOpen() ? listboxId() : null"
  [attr.aria-activedescendant]="activeDescendantId()"
  ```

  Give the popup `role="listbox"` and `[id]="listboxId()"`. Give option buttons `role="option"`, `tabindex="-1"`, deterministic IDs and `[attr.aria-selected]`. Apply an active visual class separate from the selected-value class.

- [ ] **Step 5: Run GREEN and commit**

  ```powershell
  npx vitest run src/app/shared/components/custom-select/custom-select.component.spec.ts
  npm run typecheck
  git add -- src/app/shared/components/custom-select/custom-select.component.ts src/app/shared/components/custom-select/custom-select.component.html src/app/shared/components/custom-select/custom-select.component.spec.ts
  git commit -m "feat: harden shared select accessibility"
  ```

---

### Task 4: Name every existing Shared Select instance

**Files:**

- Modify the 13 templates listed below.

**Interfaces:**

- Consumes required `CustomSelectComponent.ariaLabel` from Task 3.
- Produces no new API; every existing instance becomes template-type-safe and named.

- [ ] **Step 1: Add exact accessible names to all current call sites**

  Add the following `[ariaLabel]`/`ariaLabel` values:

  | Template                                                                                   | Selects in source order                                                            |
  | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
  | `features/accounting/accounting.component.html`                                            | `Steuerjahr`, `Besteuerungszeitraum`, `Kontenrahmen`                               |
  | `features/deal-calculator/deal-calculator.component.html`                                  | `Zustand`                                                                          |
  | `features/fulfillment/fulfillment.component.html`                                          | `Versanddienstleister`                                                             |
  | `features/listings/listings.component.html`                                                | `Inventarartikel`                                                                  |
  | `features/research/research.component.html`                                                | `Zustand`                                                                          |
  | `features/inventory/pages/item-detail/item-detail.component.html`                          | `Artikelstatus`, `Kostenart`                                                       |
  | `features/sales/sales.component.html`                                                      | `Grund der Rückabwicklung`                                                         |
  | `features/inventory/inventory.component.html`                                              | `Zustand filtern`, `Status filtern`                                                |
  | `features/sales/components/sale-create-modal/sale-create-modal.component.html`             | `[ariaLabel]="'Artikel für Verkaufsposition ' + (index + 1)"`, `Verkaufsplattform` |
  | `features/purchases/pages/purchase-detail/purchase-detail.component.html`                  | `Kostenart`, `Versanddienstleister`                                                |
  | `features/purchases/components/purchase-create-modal/purchase-create-modal.component.html` | `Bezugsquelle`, `Lieferant`, `Zustand`, `Kostenart`, `Versanddienstleister`        |
  | `features/settings/settings.component.html`                                                | `Steuer-Modus`, `[ariaLabel]="'Rolle von ' + (member.email                         |     | 'Workspace-Mitglied')"`, `Einladungsrolle` |
  | `features/inventory/components/item-create-modal/item-create-modal.component.html`         | `Zustand`, `Status`, `Zugehöriger Einkauf`                                         |

  Replace the existing host-only `aria-label="Versanddienstleister"` on the purchase-detail component with the component input `ariaLabel="Versanddienstleister"`.

- [ ] **Step 2: Prove no unnamed instances remain**

  ```powershell
  npm run typecheck
  rg -n "<app-custom-select" src/app --glob "*.html"
  ```

  Expected: typecheck PASS. Manually inspect the 27 reported opening tags and confirm each tag contains `ariaLabel` before its closing `>` or `/>`.

- [ ] **Step 3: Commit the call-site migration**

  ```powershell
  git add -- src/app/features/accounting/accounting.component.html src/app/features/deal-calculator/deal-calculator.component.html src/app/features/fulfillment/fulfillment.component.html src/app/features/listings/listings.component.html src/app/features/research/research.component.html src/app/features/inventory/pages/item-detail/item-detail.component.html src/app/features/sales/sales.component.html src/app/features/inventory/inventory.component.html src/app/features/sales/components/sale-create-modal/sale-create-modal.component.html src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html src/app/features/purchases/components/purchase-create-modal/purchase-create-modal.component.html src/app/features/settings/settings.component.html src/app/features/inventory/components/item-create-modal/item-create-modal.component.html
  git commit -m "fix: name shared select controls"
  ```

---

### Task 5: Replace the Dashboard platform select

**Files:**

- Create: `src/app/features/dashboard/dashboard.component.spec.ts`
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.html`

**Interfaces:**

- Consumes: `CustomSelectComponent`, `SelectOption<DashboardPlatform>`, `SalesService.sales()`.
- Produces:

  ```ts
  readonly platformSelectOptions: Signal<readonly SelectOption<DashboardPlatform>[]>;
  setPlatform(platform: DashboardPlatform | null): void;
  ```

- [ ] **Step 1: Write failing Dashboard option and template tests**

  Mock `SalesService.sales` as a writable signal containing duplicated, unsorted platforms and spy on `DashboardReportService.createReport`. Render the real Dashboard header and assert:

  ```ts
  expect(component.platformSelectOptions()).toEqual([
    { value: 'all', label: 'Alle Plattformen' },
    { value: 'ebay', label: 'ebay' },
    { value: 'vinted', label: 'vinted' },
  ]);
  expect(host.querySelector('select#dashboard-platform')).toBeNull();
  expect(host.querySelectorAll('app-custom-select')).toHaveLength(1);
  ```

  Select `vinted` through the child component output and assert `platform()` and the report argument update. Then remove `vinted` from the sales signal and assert the active platform returns to `all`.

  Assert each period button exposes `[attr.aria-pressed]`, the period container has `role="group"`, and axe reports no semantic violation in the dashboard header.

- [ ] **Step 2: Run RED**

  ```powershell
  npx vitest run src/app/features/dashboard/dashboard.component.spec.ts
  ```

- [ ] **Step 3: Implement typed options and invalid-selection reset**

  Import `effect`, `CustomSelectComponent` and `SelectOption`. Include the component in `imports`. Replace `platformOptions` with:

  ```ts
  readonly platformSelectOptions = computed<readonly SelectOption<DashboardPlatform>[]>(() => [
    { value: 'all', label: 'Alle Plattformen' },
    ...[...new Set(this.salesService.sales().map((sale) => sale.platform))]
      .sort((a, b) => a.localeCompare(b, 'de'))
      .map((value) => ({ value, label: value })),
  ]);

  constructor() {
    effect(() => {
      const current = this.platform();
      if (!this.platformSelectOptions().some((option) => option.value === current)) {
        this.platform.set('all');
      }
    });
  }

  setPlatform(platform: DashboardPlatform | null): void {
    this.platform.set(platform ?? 'all');
  }
  ```

  Replace the native select with:

  ```html
  <app-custom-select
    triggerId="dashboard-platform"
    ariaLabel="Plattform filtern"
    variant="filter"
    widthClass="w-52"
    [options]="platformSelectOptions()"
    [value]="platform()"
    (valueChange)="setPlatform($event)"
  />
  ```

  Add `role="group"` to the period container and `[attr.aria-pressed]="range() === option.value"` to each period button.

- [ ] **Step 4: Run GREEN and commit**

  ```powershell
  npx vitest run src/app/features/dashboard/dashboard.component.spec.ts src/app/shared/components/custom-select/custom-select.component.spec.ts
  npm run typecheck
  git add -- src/app/features/dashboard/dashboard.component.ts src/app/features/dashboard/dashboard.component.html src/app/features/dashboard/dashboard.component.spec.ts
  git commit -m "feat: use shared platform filter on dashboard"
  ```

---

### Task 6: Full interaction-system verification

**Files:**

- Verify only; no new production file.

**Interfaces:**

- Consumes Tasks 1–5.
- Produces a complete cross-app interaction/accessibility gate.

- [ ] **Step 1: Run focused tests**

  ```powershell
  npx vitest run src/styles.cursor.spec.ts src/app/accessibility-semantics.spec.ts src/app/shared/components/custom-checkbox/custom-checkbox.component.spec.ts src/app/shared/components/custom-select/custom-select.component.spec.ts src/app/features/dashboard/dashboard.component.spec.ts
  ```

- [ ] **Step 2: Run repository gates**

  ```powershell
  npm run format:check
  npm run lint
  npm run typecheck
  npm test
  npm run build
  git diff --check
  ```

- [ ] **Step 3: Run real-browser acceptance**

  - Verify computed cursors for active/disabled buttons, a real link, native select, Custom Checkbox, Custom Select, text input, file input and a busy/drag control.
  - Operate Custom Select with ArrowUp/ArrowDown, Home, End, Enter, Space, Escape and Tab without using a mouse.
  - Verify NVDA announces the Dashboard filter name, combobox role, expanded state, active option and selected value.
  - Verify disabled controls do not react to click, Enter or Space.

- [ ] **Step 4: Commit only scoped corrections discovered by verification**

  ```powershell
  git status --short
  git diff --check
  ```

  Do not create an empty commit when verification needs no correction.

