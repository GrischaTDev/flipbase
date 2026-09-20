# Beta Application Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the beta application flow from landing-page receipt through operator approval, linked registration, and a timed workspace beta license.

**Architecture:** `public.beta_applications` remains the application and invitation aggregate, while a new one-row-per-workspace `public.workspace_licenses` table owns access dates independently from future billing. Public submission and operator invitation stay in Edge Functions; an idempotent authenticated RPC starts the beta only after password setup.

**Tech Stack:** Angular 22 standalone components and Signals, Tailwind CSS, static landing HTML/JavaScript, Supabase PostgreSQL/RLS/Auth/Edge Functions, Deno 2, Nodemailer 10.0.10, Vitest, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-20-beta-application-lifecycle-design.md`

## Global Constraints

- Chat, code comments, and UI copy stay German; identifiers and file names stay English.
- Reuse `ModalShellComponent`, `NumberInputComponent`, `ButtonComponent`, `BadgeComponent`, and `DataTableComponent`; do not create a parallel admin design system.
- Default beta duration is exactly 60 days and starts only after successful password setup.
- Keep Stripe, PayPal, plans, invoices, dunning, expiry enforcement, and automatic reminder jobs out of this plan.
- Keep all schema changes in `supabase/schemas/99_platform_admin.sql`; generate, inspect, and commit one new migration.
- Enable RLS on every new table and keep anonymous table access revoked.
- Never store invite links, tokens, service-role keys, or SMTP credentials in PostgreSQL or the repository.
- Tailwind classes stay in HTML; SCSS is only used through existing shared components.
- Every production behavior follows RED → GREEN → REFACTOR.

---

### Task 1: Persist the beta lifecycle and workspace license

**Files:**

- Modify: `supabase/tests/platform_admin.sql`
- Modify: `supabase/schemas/99_platform_admin.sql`
- Create: `supabase/migrations/20260920160822_beta_application_lifecycle.sql`
- Modify: `src/app/core/models/supabase.types.ts`

**Interfaces:**

- Produces: added `beta_applications.receipt_email_status`, `receipt_email_sent_at`, `receipt_email_last_error`, `auth_user_id`, `invitation_status`, `invitation_sent_at`, `invitation_last_error`, `registered_at`.
- Produces: `public.workspace_licenses(workspace_id, beta_application_id, access_source, status, granted_days, starts_at, ends_at, created_at, updated_at)`.
- Produces: `public.accept_beta_application(p_application_id uuid, p_granted_days integer) returns public.beta_applications`.
- Produces: `public.reject_beta_application(p_application_id uuid) returns public.beta_applications`.
- Produces: `public.activate_beta_access() returns public.workspace_licenses`.
- Consumes: existing `public.is_platform_operator()`, `public.handle_new_user()`, `auth.users`, `public.workspaces`, and `public.workspace_members`.

- [ ] **Step 1: Extend the pgTAP contract first**

Add literal checks for the lifecycle columns, the license table and constraints,
the exact grants, operator-only decision RPCs, beta invitation linkage in
`handle_new_user()`, and idempotent activation. The activation case must
capture its first result and prove the second call returns identical
`starts_at` and `ends_at`:

```sql
select public.activate_beta_access() into first_activation;
perform pg_sleep(0.01);
select public.activate_beta_access() into second_activation;

if first_activation.starts_at is distinct from second_activation.starts_at
   or first_activation.ends_at is distinct from second_activation.ends_at then
  raise exception 'Wiederholte Aktivierung darf die Beta-Laufzeit nicht verschieben';
end if;
```

- [ ] **Step 2: Run the focused database test and verify RED**

Run: `npx supabase test db supabase/tests/platform_admin.sql`  
Expected: FAIL because the new columns, table, and functions do not exist.

- [ ] **Step 3: Add the declarative schema**

Append the new columns to the existing table definition and add:

```sql
create table if not exists public.workspace_licenses (
    workspace_id uuid primary key references public.workspaces (id) on delete cascade,
    beta_application_id uuid unique references public.beta_applications (id) on delete set null,
    access_source text not null default 'beta'
      check (access_source in ('beta', 'subscription', 'manual')),
    status text not null default 'pending'
      check (status in ('pending', 'active', 'expired', 'suspended')),
    granted_days integer not null check (granted_days between 1 and 3650),
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at is null or starts_at is not null),
    check (
      access_source <> 'beta'
      or status = 'pending'
      or (starts_at is not null and ends_at is not null)
    )
);
```

Implement operator-checked decision functions with row locks. Remove direct
`UPDATE` from `authenticated` on `beta_applications`; grant only
`SELECT` and the two decision RPCs. Extend `handle_new_user()` so a trusted
invite containing `beta_application_id` links the matching accepted
application by ID and normalized email and inserts the pending license for the
new workspace.

Implement `activate_beta_access()` using `auth.uid()`, `for update`, and:

```sql
update public.workspace_licenses
set status = 'active',
    starts_at = coalesce(starts_at, now()),
    ends_at = coalesce(ends_at, now() + make_interval(days => granted_days)),
    updated_at = now()
where beta_application_id = application.id
  and status = 'pending';
```

Set `registered_at` with `coalesce(registered_at, now())`.

- [ ] **Step 4: Generate and inspect the migration**

Run:

```powershell
npx supabase stop
npx supabase db diff -f beta_application_lifecycle
$generatedMigration = Get-ChildItem 'supabase/migrations/*_beta_application_lifecycle.sql' |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
Move-Item -LiteralPath $generatedMigration.FullName -Destination 'supabase/migrations/20260920160822_beta_application_lifecycle.sql'
```

Inspect the generated file. Add the required German header comment, keep SQL
lowercase, and verify it contains the grants/revokes, functions, trigger
replacement, RLS, indexes, and table comment from the schema.

- [ ] **Step 5: Regenerate Supabase types**

Run:

```powershell
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
```

- [ ] **Step 6: Run the focused database test and verify GREEN**

Run: `npx supabase test db supabase/tests/platform_admin.sql`  
Expected: PASS with the updated pgTAP plan count and zero failures.

- [ ] **Step 7: Commit**

```powershell
git add supabase/tests/platform_admin.sql supabase/schemas/99_platform_admin.sql supabase/migrations src/app/core/models/supabase.types.ts
git commit -m "feat(auth): persist beta application lifecycle" -m "Link accepted applications to invited users and pending workspace licenses so registration can start a fixed beta period without coupling access to future billing."
```

---

### Task 2: Send and track the application receipt email

**Files:**

- Create: `supabase/functions/_shared/beta-email-template.ts`
- Create: `supabase/functions/_shared/beta-email-delivery.ts`
- Create: `supabase/functions/_shared/beta-email-template.test.ts`
- Create: `supabase/functions/_shared/beta-email-delivery.test.ts`
- Modify: `supabase/functions/beta-application/index.ts`
- Modify: `deploy/docker-compose.beta-application.yml`
- Modify: `deploy/README.md`
- Modify: `package.json`

**Interfaces:**

- Produces: `renderApplicationReceipt(input: { firstName: string }): { subject: string; html: string; text: string }`.
- Produces: `renderRegistrationInvite(input: { firstName: string; actionLink: string; grantedDays: number }): { subject: string; html: string; text: string }`.
- Produces: `sendBetaEmail(message: BetaEmailMessage, environment?: BetaEmailEnvironment, createTransport?: BetaTransportFactory): Promise<void>`.
- Consumes: `npm:nodemailer@10.0.10`; server-only `BETA_SMTP_HOST`, `BETA_SMTP_PORT`, `BETA_SMTP_USER`, `BETA_SMTP_PASS`, `BETA_SMTP_FROM_EMAIL`, and `BETA_SMTP_FROM_NAME`.

- [ ] **Step 1: Write pure rendering and delivery tests**

The rendering test must prove the receipt has no link and escapes a malicious
name. The delivery test injects a transport factory and proves TLS/port/from/to
mapping without connecting to SMTP:

```ts
Deno.test('die Eingangsbestätigung enthält keinen Aktionslink', () => {
  const message = renderApplicationReceipt({ firstName: '<Anna>' });
  assertStringIncludes(message.html, '&lt;Anna&gt;');
  assertFalse(message.html.includes('href='));
});
```

```ts
Deno.test('der SMTP-Versand nutzt ausschließlich die übergebene Empfängeradresse', async () => {
  const sent: unknown[] = [];
  await sendBetaEmail(
    { to: 'anna@example.test', subject: 'Betreff', html: '<p>Text</p>', text: 'Text' },
    testEnvironment,
    () => ({ sendMail: (message) => void sent.push(message) }),
  );
  assertEquals(sent, [
    {
      from: '"Flipbase" <account@flipbase.de>',
      to: 'anna@example.test',
      subject: 'Betreff',
      html: '<p>Text</p>',
      text: 'Text',
    },
  ]);
});
```

- [ ] **Step 2: Run Deno tests and verify RED**

Run:

```powershell
deno test --allow-env supabase/functions/_shared/beta-email-template.test.ts supabase/functions/_shared/beta-email-delivery.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the shared mail modules**

Keep HTML table-based and based on the existing confirmation/invitation
templates. Escape every inserted value. Parse the port as an integer and fail
closed when any required secret is absent. Use STARTTLS for port 587 and never
log credentials or full action links.

- [ ] **Step 4: Track receipt delivery in `beta-application`**

After the insert, load the newly inserted or duplicate application, send the
receipt only while `receipt_email_status <> 'sent'`, then update:

```ts
await serviceClient
  .from('beta_applications')
  .update({
    receipt_email_status: 'sent',
    receipt_email_sent_at: new Date().toISOString(),
    receipt_email_last_error: null,
  })
  .eq('id', application.id);
```

On failure, save `failed` plus a bounded operator-facing message and return:

```json
{ "ok": true, "receiptEmailSent": false }
```

Do not reveal whether the address was already present.

- [ ] **Step 5: Add server configuration and the repeatable test command**

Add `test:edge`:

```json
"test:edge": "deno test --allow-env supabase/functions/**/*.test.ts"
```

Pass the six `BETA_SMTP_*` values through
`deploy/docker-compose.beta-application.yml` by mapping existing production
SMTP secrets; document exact server rollout without real values.

- [ ] **Step 6: Run Deno tests and type-check the functions**

Run:

```powershell
npm run test:edge
deno check supabase/functions/beta-application/index.ts supabase/functions/beta-invite/index.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add supabase/functions deploy package.json package-lock.json
git commit -m "feat(auth): send beta application receipts" -m "Confirm every stored beta application through the existing SMTP account and retain delivery failures for an operator retry without exposing application existence."
```

---

### Task 3: Replace the landing inline message with the existing visual language in a dialog

**Files:**

- Modify: `scripts/landing-page.test.mjs`
- Modify: `landing/index.html`
- Modify: `deploy/Caddyfile`

**Interfaces:**

- Consumes: `beta-application` response `{ ok: true, receiptEmailSent: boolean }`.
- Produces: semantic `#beta-success-dialog` with close button and localized receipt-success/receipt-failure copy.

- [ ] **Step 1: Add failing landing behavior tests**

Execute the inline script in the existing DOM harness and assert:

```js
assert.equal(dialog.getAttribute('aria-modal'), 'true');
assert.equal(dialog.hidden, false);
assert.match(dialog.textContent, /Vielen Dank für Ihre Anmeldung zur Beta/u);
assert.match(dialog.textContent, /anna@example\.test/u);
assert.equal(form.querySelector('button[type="submit"]').disabled, false);
```

Add a second response fixture with `receiptEmailSent: false` and assert the
application-received/mail-failed copy. Assert Escape closes the dialog and
focus returns to the submit button.

- [ ] **Step 2: Run the landing test and verify RED**

Run: `npm run test:landing`  
Expected: FAIL because no dialog exists.

- [ ] **Step 3: Implement the dialog**

Add one shared landing dialog used by both application forms. Reuse existing
CSS variables, card radius, primary button, and language-switch classes. Keep
the current inline live region for validation, rate-limit, and network errors;
success uses the dialog. Store the submitted address before resetting the form.

- [ ] **Step 4: Update the CSP hash**

Compute the exact inline-script SHA-256 hash using the existing project helper
or the command documented beside the Caddy policy, update only the matching
`script-src` value, and do not add `unsafe-inline`.

- [ ] **Step 5: Run landing and template tests**

Run:

```powershell
npm run test:landing
npx vitest run --project=node src/app/core/services/landing-template.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add landing/index.html deploy/Caddyfile scripts/landing-page.test.mjs
git commit -m "feat(landing): confirm beta applications in a dialog" -m "Show a focused, localized receipt after a successful application while keeping network and rate-limit failures inline and accessible."
```

---

### Task 4: Make operator approval and invitation observable and retryable

**Files:**

- Create: `supabase/functions/beta-invite/index.test.ts`
- Modify: `supabase/functions/beta-invite/index.ts`
- Modify: `supabase/config.toml`
- Modify: `src/app/features/platform-admin/models/beta-application.model.ts`
- Modify: `src/app/features/platform-admin/services/beta-application.service.angular.spec.ts`
- Modify: `src/app/features/platform-admin/services/beta-application.service.ts`

**Interfaces:**

- Produces: Edge request `{ applicationId: string, grantedDays: number }`.
- Produces: Edge response `{ ok: true, application: BetaApplicationRow }` or a non-2xx structured error.
- Produces: service `accept(id: string, grantedDays: number): Promise<BetaApplication>`.
- Produces: service `reject(id: string): Promise<BetaApplication>`.
- Produces: service `resendInvitation(id: string): Promise<BetaApplication>`.
- Produces: service `resendApplicationReceipt(id: string): Promise<BetaApplication>`.
- Consumes: Task 1 decision RPCs and Task 2 mail delivery for recovery-link retries.

- [ ] **Step 1: Write failing Edge and Angular service tests**

Edge tests use an exported handler factory and fakes for Auth/DB/mail. Prove:
unauthenticated and non-operator calls fail; 60 is forwarded; first invite
stores the user ID; mail failure stores `failed`; retry uses the existing user
without creating a second one; registered users cannot be reinvited; a failed
application receipt can be sent again without changing the decision status.

Service test:

```ts
await service.accept('a1', 60);
expect(invoke).toHaveBeenCalledWith('beta-invite', {
  body: { applicationId: 'a1', grantedDays: 60, action: 'accept' },
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
deno test --allow-env supabase/functions/beta-invite/index.test.ts
npx vitest run --project=angular src/app/features/platform-admin/services/beta-application.service.angular.spec.ts
```

Expected: FAIL on the missing contracts.

- [ ] **Step 3: Implement the server state machine**

Export `createBetaInviteHandler(dependencies)` and keep `Deno.serve` as thin
wiring. For `accept`, call `accept_beta_application` with the operator JWT,
then `inviteUserByEmail` with:

```ts
data: {
  beta_application_id: application.id,
  first_name: application.first_name,
  last_name: application.last_name,
  full_name: fullName,
}
```

Persist `sent` only after Auth returns success. Persist `failed` and return
502 on failure. For `resend`, generate a recovery link for the existing
unregistered user and send the existing invitation design through
`sendBetaEmail`; never return the action link.

- [ ] **Step 4: Replace direct browser updates**

Map all lifecycle fields in `BetaApplicationService.list()`. Remove the
try/catch that suppresses invite failures. `accept`, `reject`, and
`resendInvitation` invoke the protected function and return the updated model.
`resendApplicationReceipt` invokes the same protected server boundary with
`action: 'resend_receipt'`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 commands. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/beta-invite supabase/config.toml src/app/features/platform-admin
git commit -m "fix(auth): make beta invitations retryable" -m "Move operator decisions behind the protected invitation endpoint, persist delivery failures, and reuse the linked Auth user for retries."
```

---

### Task 5: Add the approval modal and lifecycle badges

**Files:**

- Create: `src/app/features/platform-admin/components/beta-approval-dialog/beta-approval-dialog.component.ts`
- Create: `src/app/features/platform-admin/components/beta-approval-dialog/beta-approval-dialog.component.html`
- Create: `src/app/features/platform-admin/components/beta-approval-dialog/beta-approval-dialog.component.angular.spec.ts`
- Modify: `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.ts`
- Modify: `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.html`
- Modify: `src/app/features/platform-admin/pages/beta-applications/beta-applications.component.angular.spec.ts`

**Interfaces:**

- Produces: `BetaApprovalDialogComponent.application = input.required<BetaApplication>()`.
- Produces: `approved = output<number>()`, `closed = output<void>()`.
- Consumes: Task 4 service methods and lifecycle fields.

- [ ] **Step 1: Write the dialog and page behavior tests first**

Prove the modal opens from the real button, shows name/email, initializes the
Reactive Form control to 60, allows 90, rejects 0/3651, and emits only a valid
integer. Page tests must prove the header duration field and row note input are
gone, a failed invite displays „Einladung fehlgeschlagen“, and retry calls
`resendInvitation`. A failed receipt must show „Bestätigung erneut senden“
and call `resendApplicationReceipt`.

- [ ] **Step 2: Run focused Angular tests and verify RED**

Run:

```powershell
npx vitest run --project=angular src/app/features/platform-admin/components/beta-approval-dialog/beta-approval-dialog.component.angular.spec.ts src/app/features/platform-admin/pages/beta-applications/beta-applications.component.angular.spec.ts
```

Expected: FAIL because the dialog and new page behavior do not exist.

- [ ] **Step 3: Implement with shared components**

Use `ModalShellComponent size="sm"`, `NumberInputComponent unit="Tage"`,
`ButtonComponent`, and a one-control Reactive Form. Add a computed
`lifecycleStatus(application)` returning label/tone/action availability.
Keep one `processingId` signal for row locking and one
`selectedApplication` signal for the dialog.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Run shared UI guard**

Run: `node scripts/check-admin-shared-ui.mjs`  
Expected: PASS with no new raw admin field, badge, or dialog variant.

- [ ] **Step 6: Commit**

```powershell
git add src/app/features/platform-admin
git commit -m "feat(ui): approve beta applications in a dialog" -m "Use the shared dialog, number input, buttons, and badges so operators review one applicant and duration before sending an invitation."
```

---

### Task 6: Start the beta only after password setup

**Files:**

- Modify: `src/app/features/auth/set-password/set-password.component.angular.spec.ts`
- Modify: `src/app/features/auth/set-password/set-password.component.ts`
- Modify: `src/app/features/auth/set-password/set-password.component.html`
- Modify: `src/app/core/services/auth.service.spec.ts`
- Modify: `src/app/core/services/auth.service.ts`

**Interfaces:**

- Consumes: `public.activate_beta_access()` from Task 1.
- Produces: `AuthService.activatePendingBetaAccess(): Promise<void>`.

- [ ] **Step 1: Write failing activation tests**

The set-password test must prove navigation does not occur until password update
and beta activation both succeed, and an activation error remains visible.
The AuthService test must prove `activate_beta_access` is invoked at most once
per authenticated bootstrap attempt and treats “no linked beta application” as
a no-op.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx vitest run --project=angular src/app/features/auth/set-password/set-password.component.angular.spec.ts
npx vitest run --project=node src/app/core/services/auth.service.spec.ts
```

Expected: FAIL because activation is not called.

- [ ] **Step 3: Implement idempotent activation**

After `auth.updateUser({ password })` succeeds:

```ts
await this.authService.activatePendingBetaAccess();
this.successMessage.set(this.translate.instant('AUTH.SET_PASSWORD_SUCCESS'));
```

On bootstrap/login, call the same method after the session exists so a temporary
post-password failure repairs itself. Do not alter the database dates in the
client.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 commands. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/features/auth/set-password src/app/core/services/auth.service*
git commit -m "feat(auth): start beta access after registration" -m "Activate the linked workspace license only after password setup and retry the idempotent activation on a later authenticated bootstrap."
```

---

### Task 7: Add the minimal operator user overview

**Files:**

- Modify: `supabase/tests/platform_admin.sql`
- Modify: `supabase/schemas/99_platform_admin.sql`
- Modify: `supabase/migrations/20260920160822_beta_application_lifecycle.sql`
- Modify: `src/app/core/models/supabase.types.ts`
- Create: `src/app/features/platform-admin/models/platform-user.model.ts`
- Create: `src/app/features/platform-admin/services/platform-user.service.ts`
- Create: `src/app/features/platform-admin/services/platform-user.service.angular.spec.ts`
- Create: `src/app/features/platform-admin/pages/platform-users/platform-users.component.ts`
- Create: `src/app/features/platform-admin/pages/platform-users/platform-users.component.html`
- Create: `src/app/features/platform-admin/pages/platform-users/platform-users.component.angular.spec.ts`
- Modify: `src/app/features/platform-admin/platform-admin.routes.ts`
- Modify: `src/app/core/config/platform-admin-navigation.ts`

**Interfaces:**

- Produces: operator-only `public.list_platform_users() returns table(user_id uuid, full_name text, email text, workspace_id uuid, workspace_name text, application_status text, invitation_status text, registered_at timestamptz, license_status text, beta_starts_at timestamptz, beta_ends_at timestamptz)`.
- Produces: `PlatformUserService.list(): Promise<PlatformUser[]>`.

- [ ] **Step 1: Write database and Angular tests first**

Database tests prove a non-operator cannot execute or see rows and an operator
sees only the declared columns. Angular tests prove pending invitation, active,
expired, and missing dates render as literal expected German labels without
invented payment fields.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx supabase test db supabase/tests/platform_admin.sql
npx vitest run --project=angular src/app/features/platform-admin/services/platform-user.service.angular.spec.ts src/app/features/platform-admin/pages/platform-users/platform-users.component.angular.spec.ts
```

Expected: FAIL because the function and UI do not exist.

- [ ] **Step 3: Implement the limited operator function and regenerate artifacts**

Use `security definer stable set search_path = ''`, explicitly verify
`public.is_platform_operator()`, select only the interface columns, grant
execute only to `authenticated`, and update the existing generated migration
and Supabase types.

- [ ] **Step 4: Implement the service, page, route, and navigation**

Reuse `PageHeaderComponent`, `DataTableComponent`, sort headers and
`BadgeComponent`. Add `{ label: 'Nutzer', path: '/admin/users' }` after
Bewerbungen.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 commands and `node scripts/check-admin-shared-ui.mjs`.  
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase src/app/core/models/supabase.types.ts src/app/core/config/platform-admin-navigation.ts src/app/features/platform-admin
git commit -m "feat(core): list linked beta users" -m "Give platform operators a limited user and workspace overview with registration and beta dates while keeping customer business records private."
```

---

### Task 8: Close public signup and add end-to-end regression coverage

**Files:**

- Modify: `supabase/config.toml`
- Modify: `deploy/README.md`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/core/guards/auth.guard.ts`
- Create: `scripts/invite-only-auth-config.test.mjs`
- Create: `e2e/beta-application-lifecycle.spec.ts`
- Modify: `playwright.pr.config.ts`

**Interfaces:**

- Produces: invite-only Auth configuration with global signup disabled and email provider enabled.
- Produces: browser coverage from operator approval through password setup and active beta status.

- [ ] **Step 1: Write route/config and browser tests first**

Add `scripts/invite-only-auth-config.test.mjs` to parse the effective local
Auth config and prove global signup is disabled while the email provider remains
enabled. The Playwright test must seed an operator and open application,
approve with 60 days, inspect the resulting invitation via the local mail
testing service, follow the link, set a password, and assert „Beta aktiv“ with
an end date exactly 60 calendar days after the stored start timestamp.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test scripts/invite-only-auth-config.test.mjs
npx playwright test e2e/beta-application-lifecycle.spec.ts --config=playwright.pr.config.ts
```

Expected: FAIL because signup remains public and the lifecycle is incomplete.

- [ ] **Step 3: Disable only self-signup**

Set:

```toml
[auth]
enable_signup = false

[auth.email]
enable_signup = true
```

Document production `GOTRUE_DISABLE_SIGNUP=true`. Redirect the public
`/auth/register` route to login or the configured landing URL without
affecting `/auth/set-password`.

- [ ] **Step 4: Run the browser test and verify GREEN**

Run:

```powershell
npx playwright test e2e/beta-application-lifecycle.spec.ts --config=playwright.pr.config.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add supabase/config.toml deploy/README.md src/app/app.routes.ts src/app/core/guards/auth.guard.ts scripts/invite-only-auth-config.test.mjs e2e/beta-application-lifecycle.spec.ts playwright.pr.config.ts
git commit -m "test(auth): cover invite-only beta onboarding" -m "Exercise operator approval, invitation, password setup, user linkage, and the 60-day activation boundary through the real browser and local Supabase stack."
```

---

### Task 9: Complete verification and session documentation

**Files:**

- Modify: `docs/AI-CHANGELOG.md`
- Create: `docs/audit/2026-09-20-beta-application-lifecycle.md`

**Interfaces:**

- Consumes: all tasks and the approved specification.
- Produces: evidence-backed completion report; no product interface.

- [ ] **Step 1: Format changed files**

Run:

```powershell
$changedFiles = git diff --name-only origin/master -- '*.ts' '*.html' '*.md' '*.mjs' '*.json' '*.toml' '*.yml'
npx prettier --write --ignore-unknown $changedFiles
```

- [ ] **Step 2: Run focused verification**

Run:

```powershell
npm run test:edge
npm run test:landing
npx vitest run --project=angular src/app/features/platform-admin src/app/features/auth/set-password
npx supabase test db supabase/tests/platform_admin.sql
node scripts/check-admin-shared-ui.mjs
npx playwright test e2e/beta-application-lifecycle.spec.ts --config=playwright.pr.config.ts
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Run the complete repository verification**

Run without a pipe:

```powershell
npm run verify *> beta-lifecycle-verify.log
$LASTEXITCODE
```

Expected: exit code `0`. Read the final output and record exact counts and
warnings.

- [ ] **Step 4: Run the complete database suite**

Run:

```powershell
npm run test:db *> beta-lifecycle-db.log
$LASTEXITCODE
```

Expected: exit code `0`.

- [ ] **Step 5: Review the diff against the specification**

Verify every scope item has code and a passing test, every non-goal is absent,
no secrets or action links appear in the diff/logs, existing UI components are
reused, migration matches the declarative schema, and `master` was not changed.

- [ ] **Step 6: Write the audit and update the changelog**

Record the actual files, RED/GREEN evidence, full command results, remaining
deployment-only steps, and any known warnings. Do not claim a real external
mail delivery unless it was actually performed.

- [ ] **Step 7: Commit**

```powershell
git add docs/AI-CHANGELOG.md docs/audit/2026-09-20-beta-application-lifecycle.md
git commit -m "docs(auth): record beta onboarding verification" -m "Capture the verified lifecycle behavior, database and browser evidence, and the production-only SMTP and deployment checks that remain."
```

- [ ] **Step 8: Stop before pushing**

Ask exactly: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests
mergen?“ Do not push or create a PR before the user answers.
