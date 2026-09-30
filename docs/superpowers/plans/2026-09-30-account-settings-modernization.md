# Account Settings Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/settings/account` into a real personal account page with profile, password security, and session management while preserving the existing profile and global-sign-out behavior.

**Architecture:** Keep all account mutations in `AuthService`; the settings component owns form state and presentation only. Reuse the existing settings shell and shared Card/Button/TextField/Modal components, add no database schema, and keep 2FA as a truthful non-interactive status row in this PR.

**Tech Stack:** Angular 22 standalone components/signals/reactive forms, Supabase Auth, Lucide, Vitest Angular/Node projects, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-09-30-account-company-settings-design.md`

## Global Constraints

- PR 1 changes only the personal account surface; no company table, migration, company route, invoice, shop, shipping, or workspace-data changes.
- The login email remains read-only.
- Password changes require the current password, a new password of at least 10 characters, and an identical confirmation.
- A failed re-authentication or password update must not close the dialog or report success.
- 2FA is not implemented in this PR and must not expose a fake primary action.
- Sessions show only “Dieser Browser” as current; do not infer browser or OS from User-Agent data.
- “Von allen Geräten abmelden” remains destructive and confirmation-gated.
- Reuse `CardComponent`, `ButtonComponent`, `TextFieldComponent`, `ModalShellComponent`, central toasts, and existing theme tokens.
- No decorative `uppercase`, `tracking-wider`, Indigo/Violet parallel palette, raw styled buttons, or nested card-in-card layout.
- Primary actions use the existing Flipbase yellow through `ButtonComponent variant="primary"`.
- Keep the existing `/settings/account` route; no redirect or route churn.

## Review Focus

1. **Wrong current password:** keep the password dialog open, keep entered values, show a clear error, and never call `updateUser`.
2. **No authenticated user / missing email:** reject the password change before Supabase credential calls and leave auth state untouched.
3. **Password validation:** fewer than 10 characters or mismatched confirmation never reaches `AuthService.changePassword`.
4. **Profile data arrives after render:** the displayed name and initials update from AuthService without replacing a user-edited dirty name field.
5. **Global sign-out cancellation:** closing/rejecting the confirmation performs no sign-out call and leaves the account page in place.

---

### Task 1: Add a verified password-change API to AuthService

**Files:**

- Modify: `src/app/core/services/auth.service.ts`
- Modify: `src/app/core/services/auth.service.spec.ts`

**Interfaces:**

- Consumes: `AuthService.currentUser()`, Supabase `auth.signInWithPassword`, Supabase `auth.updateUser`, existing auth error conventions.
- Produces:
  - `export interface PasswordChangeResult { readonly error: Error | null; readonly reportedBySyncStatus: boolean }`
  - `AuthService.changePassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResult>`

- [ ] **Step 1: Extend the AuthService test fake before production code**

In `baueUmgebung`, record:

- `signInWithPassword` credentials,
- `updateUser` payloads,
- configurable errors for re-authentication and password update.

Expose these call logs on `Umgebung`.

- [ ] **Step 2: Write failing tests for the service contract**

Add tests under `describe('AuthService: Passwort ändern', ...)` with these assertions:

```ts
it('bestätigt zuerst das aktuelle Passwort und ändert danach das Passwort', async () => {
  // signed-in user with test@test.de
  const result = await dienst.changePassword('alt-passwort', 'neues-passwort-123');
  expect(signInCalls).toEqual([{ email: 'test@test.de', password: 'alt-passwort' }]);
  expect(updateUserCalls).toEqual([{ password: 'neues-passwort-123' }]);
  expect(result.error).toBeNull();
});

it('ändert bei falschem aktuellen Passwort nichts', async () => {
  // signInWithPassword returns Invalid login credentials
  const result = await dienst.changePassword('falsch', 'neues-passwort-123');
  expect(updateUserCalls).toEqual([]);
  expect(result.error?.message).toBe('Das aktuelle Passwort ist nicht korrekt.');
});

it('weist zu kurze neue Passwörter vor einem Supabase-Aufruf zurück', async () => {
  const result = await dienst.changePassword('alt-passwort', 'zu-kurz');
  expect(signInCalls).toEqual([]);
  expect(updateUserCalls).toEqual([]);
  expect(result.error?.message).toContain('mindestens 10 Zeichen');
});

it('weist Passwortänderungen ohne angemeldeten Nutzer zurück', async () => {
  const result = await dienst.changePassword('alt-passwort', 'neues-passwort-123');
  expect(signInCalls).toEqual([]);
  expect(result.error?.message).toBe('Nicht angemeldet');
});
```

Also add one update failure test that verifies the Supabase error becomes a returned `Error` and no success is implied.

- [ ] **Step 3: Run the focused AuthService tests and verify RED**

Run:

```bash
npx vitest run --project=node src/app/core/services/auth.service.spec.ts
```

Expected: FAIL because `changePassword` and the new fake hooks do not exist yet.

- [ ] **Step 4: Implement `AuthService.changePassword`**

In `src/app/core/services/auth.service.ts`:

- reject when `currentUser()?.email` is missing,
- trim neither password value silently,
- reject `newPassword.length < 10`,
- call `signInWithPassword({ email, password: currentPassword })`,
- map invalid credentials to exactly `Das aktuelle Passwort ist nicht korrekt.`,
- on successful re-authentication call `updateUser({ password: newPassword })`,
- route unexpected errors through the existing auth error translation / sync-status conventions without signing the user out,
- return `PasswordChangeResult`,
- never clear local session/profile state on a password mutation failure.

- [ ] **Step 5: Re-run the focused AuthService tests and verify GREEN**

Run:

```bash
npx vitest run --project=node src/app/core/services/auth.service.spec.ts
```

Expected: all AuthService tests PASS.

- [ ] **Step 6: Commit the AuthService slice**

```bash
git add src/app/core/services/auth.service.ts src/app/core/services/auth.service.spec.ts
git commit -m "feat(account): add verified password change"
```

---

### Task 2: Rebuild the account page with profile, security, and sessions

**Files:**

- Modify: `src/app/features/settings/pages/account-settings/account-settings.component.ts`
- Modify: `src/app/features/settings/pages/account-settings/account-settings.component.html`
- Create: `src/app/features/settings/pages/account-settings/account-settings.component.angular.spec.ts`
- Modify: `src/app/features/settings/settings-shell/settings-shell.component.ts`
- Modify: `src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts`

**Interfaces:**

- Consumes:
  - `AuthService.aktualisiereProfil(fullName: string)`
  - `AuthService.changePassword(currentPassword: string, newPassword: string)`
  - `AuthService.abmeldenUeberall()`
  - `AuthService.currentUser()`, `profile()`, `userName()`
  - `ConfirmDialogService.frage(...)`
- Produces component behavior:
  - `initials(): string`
  - `isPasswordModalOpen: WritableSignal<boolean>`
  - `passwordError: WritableSignal<string | null>`
  - `passwordForm` with `currentPassword`, `newPassword`, `confirmPassword`
  - `openPasswordModal(): void`
  - `closePasswordModal(): void`
  - `onChangePassword(): Promise<void>`
  - existing `onSaveProfile()` and `onSignOutEverywhere()` remain public UI actions.

- [ ] **Step 1: Create a failing account component test harness**

Create `account-settings.component.angular.spec.ts` with TestBed fakes for:

- AuthService signals and mutation spies,
- ConfirmDialogService,
- ToastService.

Resolve external component resources the same way as the existing settings-shell Angular spec.

Register required signal inputs for Shared components only if the Vitest Angular environment needs metadata bridging.

- [ ] **Step 2: Add failing structural and visual-contract tests**

Assert the rendered page has exactly three top-level account sections:

```ts
expect(sectionTitles()).toEqual(['Profil', 'Sicherheit', 'Sitzungen']);
expect(host.textContent).toContain('Dieser Browser');
expect(host.textContent).toContain('Zwei-Faktor-Authentifizierung');
expect(host.textContent).toContain('Noch nicht eingerichtet');
expect(host.querySelectorAll('app-card')).toHaveLength(3);
expect(host.querySelector('[data-account-avatar]')?.textContent?.trim()).toBe('GT');
expect(host.textContent).toContain('test@test.de');
```

Also assert:

- no section heading class contains `uppercase` or `tracking-wider`,
- the profile save action is an `app-button` primary action,
- global sign-out uses `app-button variant="destructive"`,
- there is no fake 2FA button/link.

- [ ] **Step 3: Add failing profile synchronization tests**

Cover Review Focus #4:

- initial profile name populates the form and initials,
- a later AuthService profile change updates an untouched form,
- once `fullName` is dirty, a reactive profile refresh must not overwrite the user's in-progress value,
- successful save still uses `aktualisiereProfil` and shows the existing success toast.

- [ ] **Step 4: Add failing password dialog tests**

Assert:

1. “Passwort ändern” opens a centered `app-modal-shell`.
2. It contains three revealable password fields with autocomplete values:
   - `current-password`,
   - `new-password`,
   - `new-password`.
3. New password under 10 characters disables submit.
4. Mismatched confirmation disables submit and exposes a readable validation message.
5. Valid submit calls exactly:
   `auth.changePassword('alt-passwort', 'neues-passwort-123')`.
6. Auth error keeps the modal open, preserves form values, and renders the error with `role="alert"`.
7. Success closes the modal, clears the password form, clears the error, and shows `Passwort wurde geändert.`.

- [ ] **Step 5: Add failing global sign-out cancellation test**

Configure `ConfirmDialogService.frage` to return `false`.

Call `onSignOutEverywhere()`.

Assert `auth.abmeldenUeberall` was not called.

Then add the confirmed case and assert it is called once.

- [ ] **Step 6: Add accessibility coverage**

Run axe against the account component with the password modal closed and open.

Expected:

- no serious/critical violations,
- all password inputs have accessible names,
- the modal has a title,
- destructive sign-out retains a textual accessible name.

- [ ] **Step 7: Update the shell copy test first**

In `settings-shell.component.angular.spec.ts`, change/add expectations so Account navigation reads:

- label `Konto`,
- description `Persönliche Daten & Sicherheit`.

Run the focused Angular tests before implementation and verify they fail on the old account markup/copy.

Run:

```bash
npx vitest run --project=angular   src/app/features/settings/pages/account-settings/account-settings.component.angular.spec.ts   src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts
```

Expected: FAIL on missing three-section layout/password dialog/new copy.

- [ ] **Step 8: Implement component state and form rules**

In `account-settings.component.ts`:

- add only the Lucide icons needed for profile/security/session affordances,
- import `CardComponent`, `ButtonComponent`, `ModalShellComponent`, and existing Shared fields,
- derive initials from the displayed name:
  - take at most first two non-empty words,
  - uppercase their first Unicode-visible character,
  - fallback to `?` only when no name/email identity exists,
- patch `profileForm.fullName` from auth profile only while that control is pristine,
- create `passwordForm` with required + minLength(10) and group-level equality validation,
- reset password state when opening,
- keep state intact on failed submit,
- close/reset only after a successful `changePassword`,
- leave 2FA read-only.

- [ ] **Step 9: Replace the old account template**

Use three sibling `app-card` elements:

**Profil**

- Initials avatar,
- current display name,
- current read-only login email,
- Shared text field for display name,
- primary Shared button “Änderungen speichern”.

**Sicherheit**

- row “Passwort” with secondary Shared button “Passwort ändern”,
- row “Zwei-Faktor-Authentifizierung” with neutral text “Noch nicht eingerichtet” and no action.

**Sitzungen**

- row “Dieser Browser” + neutral/success text or badge “Aktiv”,
- explanatory copy for global sign-out,
- destructive Shared button “Von allen Geräten abmelden”.

Password modal:

- `presentation="center"`,
- title “Passwort ändern”,
- three password TextFields,
- secondary “Abbrechen”,
- primary “Passwort ändern” submit button.

Do not introduce local button classes, colored icon wells, nested surfaces, uppercase headings, or Indigo accents.

- [ ] **Step 10: Update account navigation description**

In `settings-shell.component.ts` change only:

```ts
{ path: 'account', label: 'Konto', description: 'Persönliche Daten & Sicherheit', ... }
```

No other navigation ordering changes in PR 1.

- [ ] **Step 11: Re-run focused Angular tests and verify GREEN**

Run:

```bash
npx vitest run --project=angular   src/app/features/settings/pages/account-settings/account-settings.component.angular.spec.ts   src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts
```

Expected: PASS.

- [ ] **Step 12: Run the Shared-UI architecture check**

Run:

```bash
node scripts/check-admin-shared-ui.mjs
```

Expected: exit 0; no new raw button/input/card violation on the account page.

- [ ] **Step 13: Commit the account UI slice**

```bash
git add   src/app/features/settings/pages/account-settings/account-settings.component.ts   src/app/features/settings/pages/account-settings/account-settings.component.html   src/app/features/settings/pages/account-settings/account-settings.component.angular.spec.ts   src/app/features/settings/settings-shell/settings-shell.component.ts   src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts
git commit -m "feat(account): modernize profile and security settings"
```

---

### Task 3: Add browser regression coverage and finish PR 1 verification

**Files:**

- Create: `e2e/account-settings.spec.ts`
- Modify: `docs/AI-CHANGELOG.md`

**Interfaces:**

- Consumes the finished `/settings/account` page.
- Produces an automated browser contract for responsive layout, modal interaction, theme compatibility, and accessibility.

- [ ] **Step 1: Write the browser test before final polish**

Create `e2e/account-settings.spec.ts` using `openDashboard` and the existing fixture conventions.

Cover:

```ts
test('account settings stay usable on desktop and mobile @pr-smoke', async ({ page }) => {
  // open authenticated app, go to /settings/account
  // assert Profil, Sicherheit, Sitzungen
  // assert horizontal overflow === 0 at 1280 and 390 px
  // open password modal and assert it remains within viewport
});

test('account settings have no automated WCAG AA violations @pr-smoke', async ({ page }) => {
  // axe on main page
  // open password dialog
  // axe on page with modal
});
```

Also switch the app through the existing theme control (or the established theme helper if present) and verify the three cards and modal remain visible in both themes; do not assert raw RGB values.

- [ ] **Step 2: Run the focused Playwright test and verify RED/GREEN as appropriate**

Run:

```bash
npx playwright test e2e/account-settings.spec.ts --project=chromium
```

Before any required layout polish, record the exact failure. After fixes, expected: PASS.

If Playwright requires local Supabase in this repo configuration, start/stop it with the established e2e workflow rather than adding mocks unique to this test.

- [ ] **Step 3: Perform the final visual QA loop**

At minimum inspect:

- 1280 × 900 light,
- 1280 × 900 dark,
- 390 × 844 light,
- 390 × 844 dark,
- password modal at desktop and mobile widths.

Check:

- no horizontal page overflow,
- no clipped modal footer,
- no Card-in-Card appearance,
- account cards align to the settings content column,
- Flipbase yellow only appears on primary actions,
- destructive sign-out uses the central critical treatment,
- no stale Indigo/purple decorative accents,
- typography follows normal German capitalization.

- [ ] **Step 4: Update the AI changelog with implemented facts only**

Add a 2026-09-30 entry describing:

- account page split into Profil/Sicherheit/Sitzungen,
- verified password change,
- read-only 2FA status,
- current-browser session presentation,
- unchanged confirmed global sign-out,
- exact verification actually run.

Do not mention company settings as implemented; that remains PR 2.

- [ ] **Step 5: Run the full PR-1 verification set**

Run:

```bash
npm run format:check
npm run lint
npm run typecheck
node scripts/check-admin-shared-ui.mjs
npx vitest run --project=node src/app/core/services/auth.service.spec.ts
npx vitest run --project=angular   src/app/features/settings/pages/account-settings/account-settings.component.angular.spec.ts   src/app/features/settings/settings-shell/settings-shell.component.angular.spec.ts
npx playwright test e2e/account-settings.spec.ts --project=chromium
npm run build
```

Expected:

- every command exits 0,
- no failing Vitest/Playwright test,
- no Shared-UI violation,
- production build succeeds.

The normal GitHub PR CI still remains the merge gate after the branch is pushed.

- [ ] **Step 6: Commit browser coverage and changelog**

```bash
git add e2e/account-settings.spec.ts docs/AI-CHANGELOG.md
git commit -m "test(account): cover responsive account settings"
```

---

## Plan Self-Review Result

- **Spec coverage:** PR-1 requirements are covered: profile, read-only email, initials, password re-authentication, truthful 2FA status, current-browser session row, confirmed global sign-out, current settings route, responsive/accessible Shared UI.
- **Intentionally deferred:** company data, company navigation entry, schema/migrations, invoice snapshots, shop/payment cleanup, shipping inheritance, and workspace tax-UI relocation belong to PRs 2–4.
- **Type consistency:** `AuthService.changePassword(currentPassword, newPassword)` is the single password-mutation interface used by component tests and UI.
- **Review Focus:** all five high-risk conditions have an owning test step.
- **Proportion:** the plan describes interfaces, assertions, commands, and UI composition without pre-writing the component implementation.
