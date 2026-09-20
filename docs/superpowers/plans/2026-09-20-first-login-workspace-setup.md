# First-Login Workspace Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neu eingeladene Nutzer benennen beim ersten App-Aufruf verpflichtend ihren bereits angelegten Workspace, bevor sie Dashboard oder Shop öffnen.

**Architecture:** Ein ausdrücklicher Zeitpunkt am Workspace ersetzt jede Ableitung aus dem Namen. Ein idempotent ladender Workspace-Dienst versorgt zwei kleine Guards und eine eigenständige Auth-ähnliche Einrichtungsseite; bestehende Workspaces werden bei der Migration als abgeschlossen markiert.

**Tech Stack:** Angular 22, Signals, Reactive Forms, Tailwind CSS, Supabase/PostgreSQL, Vitest, pgTAP

**Spec:** `docs/superpowers/specs/2026-09-20-first-login-workspace-setup-design.md`

## Global Constraints

- Die Seite fragt ausschließlich einen Workspace-Namen ab; keine Steuer-, Gewinn-, Firmen-, Rechnungs- oder Zahlungsdaten.
- Die Einrichtung ist verpflichtend, nicht überspringbar und erzeugt keinen zweiten Workspace.
- Der Name ist nach dem Trimmen 2 bis 100 Zeichen lang und bleibt später änderbar.
- Die Beta-Laufzeit startet weiterhin bei erfolgreicher Passwortvergabe und wird durch die Einrichtung nicht verändert.
- Bestehende Workspaces gelten nach der Migration als vollständig eingerichtet.
- Angular-Komponenten bleiben standalone, verwenden Signals, Reactive Forms, `OnPush`, externe Templates und Tailwind-Klassen.
- Datenbankänderungen erfolgen deklarativ und mit einer neu generierten, geprüften Migration.

---

### Task 1: Einrichtungsstatus am Workspace speichern

**Files:**

- Modify: `supabase/schemas/database.sql`
- Modify: `supabase/tests/platform_admin.sql`
- Create: `supabase/migrations/20260920172838_workspace_initial_setup.sql`
- Modify: `src/app/core/models/supabase.types.ts`
- Modify: `src/app/core/models/flipbase.models.ts`

**Interfaces:**

- Produces: `Workspace.setup_completed_at?: string | null`
- Produces: `public.workspaces.setup_completed_at timestamptz`
- Existing manually created workspaces receive a non-null completion time; registration-trigger workspaces remain null.

- [x] **Step 1: Extend the database test with the setup lifecycle**

Add assertions to the existing beta registration case in `platform_admin.sql`:

```sql
select workspace.setup_completed_at
into setup_completed
from public.workspaces as workspace
join public.workspace_members as member on member.workspace_id = workspace.id
where member.user_id = :'beta_user_id'::uuid;

if setup_completed is not null then
  raise exception 'Der automatisch angelegte Beta-Workspace darf noch nicht eingerichtet sein';
end if;
```

Increase the pgTAP plan only when adding a separate `pass()` assertion.

- [x] **Step 2: Run the database test and verify the new assertion fails**

Run: `npx supabase test db supabase/tests/platform_admin.sql`

Expected: FAIL because `setup_completed_at` does not exist.

- [x] **Step 3: Add the declarative column and creation semantics**

Append the column to `public.workspaces` in `database.sql`:

```sql
setup_completed_at timestamptz
```

Keep the registration trigger's workspace incomplete. Update `public.create_workspace(p_name text)` so a manually named workspace is complete immediately:

```sql
insert into public.workspaces (name, setup_completed_at)
values (coalesce(nullif(trim(p_name), ''), 'Mein Workspace'), now())
```

Do not alter the beta duration or license functions.

- [x] **Step 4: Generate and inspect the migration**

Run with the isolated Supabase project:

```powershell
npx supabase stop --no-backup
npx supabase db diff -f workspace_initial_setup
```

Keep only the intended workspace column, existing-row backfill and function/trigger changes. The migration must effectively perform:

```sql
alter table public.workspaces add column setup_completed_at timestamptz;
update public.workspaces set setup_completed_at = now() where setup_completed_at is null;
```

The trigger definition applied after that backfill must leave newly registered workspaces null; `create_workspace` must set `now()`.

- [x] **Step 5: Reset the isolated database and rerun the focused test**

Run:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db supabase/tests/platform_admin.sql
```

Expected: clean reset and all platform-admin tests PASS.

- [x] **Step 6: Regenerate types and extend the application model**

Run:

```powershell
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
```

Add to `Workspace`:

```ts
setup_completed_at?: string | null;
```

- [x] **Step 7: Commit the database lifecycle**

```bash
git add supabase/schemas/database.sql supabase/tests/platform_admin.sql supabase/migrations src/app/core/models/supabase.types.ts src/app/core/models/flipbase.models.ts
git commit -m "feat(auth): track workspace initial setup"
```

---

### Task 2: Workspace-Laden und Abschluss serverbestätigt bereitstellen

**Files:**

- Modify: `src/app/core/services/workspace.service.ts`
- Modify: `src/app/core/services/workspace.service.spec.ts`

**Interfaces:**

- Consumes: `Workspace.setup_completed_at`
- Produces: `ensureLoaded(): Promise<void>`
- Produces: `completeInitialSetup(workspaceId: string, name: string): Promise<{ error: Error | null }>`
- Produces: readonly signal `loadError`

- [x] **Step 1: Write failing service tests**

Add tests proving:

```ts
const first = service.ensureLoaded();
const second = service.ensureLoaded();
await Promise.all([first, second]);
expect(selectWorkspaces).toHaveBeenCalledOnce();
```

and:

```ts
const result = await service.completeInitialSetup('workspace-1', '  Kamera Handel  ');
expect(update).toHaveBeenCalledWith(
  expect.objectContaining({
    name: 'Kamera Handel',
    setup_completed_at: expect.any(String),
  }),
);
expect(result.error).toBeNull();
expect(service.currentWorkspace()?.name).toBe('Kamera Handel');
expect(service.currentWorkspace()?.setup_completed_at).toEqual(expect.any(String));
```

For a returned database error, assert that name and completion timestamp remain unchanged locally.

- [x] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run --project=node src/app/core/services/workspace.service.spec.ts`

Expected: FAIL because both methods and `loadError` are missing.

- [x] **Step 3: Make workspace loading idempotent**

Add one stored pending promise and a loaded flag. `ensureLoaded()` returns the
same promise while a request is active, returns immediately after a successful
load for the current authenticated context, and delegates actual work to the
existing loading implementation. Authentication loss clears workspaces,
current workspace, loaded state and load error.

Expose the last loading error as:

```ts
private readonly workspaceLoadError = signal<Error | null>(null);
readonly loadError = this.workspaceLoadError.asReadonly();
```

- [x] **Step 4: Add server-confirmed setup completion**

Implement a non-optimistic update:

```ts
async completeInitialSetup(
  workspaceId: string,
  name: string,
): Promise<{ error: Error | null }> {
  const normalizedName = name.trim();
  const completedAt = new Date().toISOString();
  const { data, error } = await this.supabase!.client
    .from('workspaces')
    .update({
      name: normalizedName,
      setup_completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('id', workspaceId)
    .select('*')
    .single();

  if (error || !data) {
    const visibleError = this.syncStatus.melde(
      'Abschließen der Workspace-Einrichtung',
      error ?? new Error('Die Datenbank hat den Workspace nicht zurückgegeben.'),
    );
    return { error: visibleError };
  }
  // Replace only the confirmed workspace in both signals.
  return { error: null };
}
```

Reject names outside 2–100 trimmed characters before making a request.

- [x] **Step 5: Run focused service tests**

Run: `npx vitest run --project=node src/app/core/services/workspace.service.spec.ts`

Expected: PASS.

- [x] **Step 6: Commit the service boundary**

```bash
git add src/app/core/services/workspace.service.ts src/app/core/services/workspace.service.spec.ts
git commit -m "feat(auth): complete initial workspace setup"
```

---

### Task 3: Unvollständige Workspaces vor App und Shop abfangen

**Files:**

- Create: `src/app/core/guards/workspace-setup.guard.ts`
- Create: `src/app/core/guards/workspace-setup.guard.angular.spec.ts`
- Modify: `src/app/app.routes.ts`

**Interfaces:**

- Consumes: `AuthService.sessionReady`, `AuthService.canAccessApp()`
- Consumes: `WorkspaceService.ensureLoaded()`, `workspaces()`, `loadError()`
- Produces: `workspaceSetupGuard: CanActivateFn`
- Produces: `workspaceSetupPageGuard: CanActivateFn`

- [ ] **Step 1: Write guard tests**

Cover these exact outcomes:

```ts
// Normal protected route.
expect(await runGuard(workspaceSetupGuard, incompleteWorkspace)).toEqual(
  router.createUrlTree(['/onboarding/workspace']),
);
expect(await runGuard(workspaceSetupGuard, completedWorkspace)).toBe(true);

// Setup route itself.
expect(await runGuard(workspaceSetupPageGuard, incompleteWorkspace)).toBe(true);
expect(await runGuard(workspaceSetupPageGuard, completedWorkspace)).toEqual(
  router.createUrlTree(['/dashboard']),
);
```

Also verify `ensureLoaded()` is awaited and an unauthenticated session returns a login URL instead of loading workspaces.

- [ ] **Step 2: Run guard tests and verify failure**

Run: `npx vitest run --project=angular src/app/core/guards/workspace-setup.guard.angular.spec.ts`

Expected: FAIL because the guard file does not exist.

- [ ] **Step 3: Implement both narrow guards**

Use a shared private resolver in the guard file. An incomplete workspace is any
accessible workspace with `setup_completed_at === null`. Loading failures and a
missing workspace lead to `/onboarding/workspace`, where the user can retry or
sign out. Avoid redirect loops by using the separate page guard.

- [ ] **Step 4: Register the route boundaries**

Add the setup route outside the shell:

```ts
{
  path: 'onboarding/workspace',
  canActivate: [authGuard, workspaceSetupPageGuard],
  loadComponent: () =>
    import('./features/onboarding/workspace-setup/workspace-setup.component').then(
      (m) => m.WorkspaceSetupComponent,
    ),
},
```

Add `workspaceSetupGuard` after `authGuard` to both the protected `shop` route
and the root shell route.

- [ ] **Step 5: Run guard and route tests**

Run:

```powershell
npx vitest run --project=angular src/app/core/guards/workspace-setup.guard.angular.spec.ts
npm run typecheck
```

The guard tests cover both route decisions; the type check verifies the route registry and lazy component import.

- [ ] **Step 6: Commit routing enforcement**

```bash
git add src/app/core/guards/workspace-setup.guard.ts src/app/core/guards/workspace-setup.guard.angular.spec.ts src/app/app.routes.ts
git commit -m "feat(auth): require workspace setup before app access"
```

---

### Task 4: Ein-Feld-Ersteinrichtungsseite bauen

**Files:**

- Create: `src/app/features/onboarding/workspace-setup/workspace-setup.component.ts`
- Create: `src/app/features/onboarding/workspace-setup/workspace-setup.component.html`
- Create: `src/app/features/onboarding/workspace-setup/workspace-setup.component.angular.spec.ts`
- Modify: `src/app/core/i18n/translations.ts`

**Interfaces:**

- Consumes: `WorkspaceService.ensureLoaded()`, `workspaces()`, `loadError()`, `completeInitialSetup()`
- Consumes: `AuthService.currentUser()`, `AuthService.signOut()`
- On success: `Router.navigate(['/dashboard'])`

- [ ] **Step 1: Write component behavior and accessibility tests**

Create tests that assert:

```ts
expect(component.form.invalid).toBe(true);
component.form.controls.workspaceName.setValue('A');
expect(component.form.invalid).toBe(true);
component.form.controls.workspaceName.setValue('Kamera Handel');
expect(component.form.valid).toBe(true);
```

On submit, verify the incomplete workspace ID and trimmed name are passed to
`completeInitialSetup`; navigation happens only on `{ error: null }`. On a
service error, verify `role="alert"`, retained input and no navigation. Verify
the submit action is disabled while saving, a load retry invokes
`ensureLoaded()`, and „Abmelden“ invokes `AuthService.signOut()`.

Run AXE with color contrast disabled only where jsdom cannot calculate the
project tokens, and require zero critical or serious violations.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npx vitest run --project=angular src/app/features/onboarding/workspace-setup/workspace-setup.component.angular.spec.ts`

Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Implement the standalone component**

Use `FormGroup` with a non-null `workspaceName` control and validators:

```ts
validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)];
```

The component uses Signals for loading, saving and visible error state. It
selects the first workspace with `setup_completed_at === null`; it never creates
a workspace. After a confirmed update it navigates to `/dashboard`.

- [ ] **Step 4: Build the external template from existing auth patterns**

The page contains one `<main>`, one visible `<h1>`, one explicitly labelled
text input with `autocomplete="organization"`, an inline validation message,
the shared `app-button` for saving, and a secondary sign-out action. Use only
Tailwind classes in the template; create no SCSS file.

Required copy:

```text
Willkommen bei Flipbase
Wie soll dein Workspace heißen?
Du kannst den Namen später jederzeit in den Einstellungen ändern.
Workspace einrichten
Abmelden
```

Add equivalent English translation keys; do not add tax or profitability copy.

- [ ] **Step 5: Run focused UI tests and the shared UI check**

Run:

```powershell
npx vitest run --project=angular src/app/features/onboarding/workspace-setup/workspace-setup.component.angular.spec.ts
node scripts/check-admin-shared-ui.mjs
```

Expected: all tests PASS and zero shared UI findings.

- [ ] **Step 6: Commit the onboarding page**

```bash
git add src/app/features/onboarding src/app/core/i18n/translations.ts
git commit -m "feat(auth): add first-login workspace setup"
```

---

### Task 5: Gesamtintegration und Dokumentation abschließen

**Files:**

- Modify: `docs/AI-CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-09-20-first-login-workspace-setup.md`

**Interfaces:**

- Verifies all interfaces produced by Tasks 1–4.

- [ ] **Step 1: Run all focused tests together**

```powershell
npx vitest run --project=node src/app/core/services/workspace.service.spec.ts
npx vitest run --project=angular src/app/core/guards/workspace-setup.guard.angular.spec.ts src/app/features/onboarding/workspace-setup/workspace-setup.component.angular.spec.ts
npx supabase test db supabase/tests/platform_admin.sql
node scripts/check-admin-shared-ui.mjs
```

Expected: all focused checks PASS.

- [ ] **Step 2: Run the complete project verification**

```powershell
npm run verify > workspace-setup-verify.log 2>&1
$verifyExitCode = $LASTEXITCODE
Get-Content workspace-setup-verify.log -Tail 160
exit $verifyExitCode
```

Expected: format, lint, type checks, workflow checks, all test suites, landing tests and production build PASS. Only already documented unrelated warnings may remain.

- [ ] **Step 3: Update the AI changelog with actual evidence**

Record the one-field scope, explicit setup timestamp, existing-user backfill,
guard behavior, error handling and the exact test counts from the fresh runs.
Do not claim browser or production verification that was not executed.

- [ ] **Step 4: Mark completed plan checkboxes and commit**

```bash
git add docs/AI-CHANGELOG.md docs/superpowers/plans/2026-09-20-first-login-workspace-setup.md
git commit -m "docs(auth): record workspace setup verification"
```

- [ ] **Step 5: Confirm branch readiness without pushing**

```powershell
git status --short
git diff --check master...HEAD
git log --oneline master..HEAD
```

Expected: clean status, no whitespace errors and all work on `codex/beta-application-lifecycle`. Ask the repository-mandated PR question; do not push before confirmation.
