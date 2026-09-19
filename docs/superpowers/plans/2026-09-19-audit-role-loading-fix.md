# Audit Role Loading Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent “Daten & Protokolle” from showing a false authorization error while the current workspace membership is still loading.

**Architecture:** Keep workspace authorization in `WorkspaceMemberService`, but explicitly expose whether the membership context for the active workspace has finished loading. Make `DataAndAuditComponent` wait for that state and react when the resolved role changes from pending `null` to the real workspace role.

**Tech Stack:** Angular 22 signals/effects, TypeScript 6, Vitest 4, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-19-expense-entry-redesign-design.md`

## Global Constraints

- German UI text, English code identifiers.
- Keep the red header Admin badge unchanged; it represents platform operator status.
- Workspace audit access continues to allow only `owner`, `admin`, and `accountant`.
- A temporary unresolved role must not be treated as a completed authorization denial.
- Add regression coverage before implementation.
- Record implementation in `docs/AI-CHANGELOG.md`.
- Finish on a dedicated feature branch and follow the PR/CI workflow in `AGENTS.md`.

---

### Task 1: Expose resolved workspace-membership state

**Files:**
- Modify: `src/app/core/services/workspace-member.service.ts`
- Create/Test: `src/app/core/services/workspace-member-role-loading.dom.spec.ts`

**Interfaces:**
- Produce: `readonly loadedWorkspaceId = signal<string | null>(null)`
- Produce: `readonly isCurrentWorkspaceLoaded = computed<boolean>(...)`
- Preserve: `readonly currentUserRole: Signal<WorkspaceRole | null>`

- [ ] **Step 1: Write the failing service test**

Create a focused test fixture with an active workspace and delayed member query.

Assert:

```ts
expect(service.isCurrentWorkspaceLoaded()).toBe(false);

await service.loadMembers(workspace.id);

expect(service.isCurrentWorkspaceLoaded()).toBe(true);
expect(service.currentUserRole()).toBe('owner');
```

Add a superseded-request case: when workspace B starts loading before workspace A finishes, A must not mark the current membership context as loaded.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
npm run test:dom -- src/app/core/services/workspace-member-role-loading.dom.spec.ts
```

Expected: FAIL because the explicit loaded-workspace state does not yet exist.

- [ ] **Step 3: Implement the minimal loading-state contract**

Add:

```ts
readonly loadedWorkspaceId = signal<string | null>(null);
readonly isCurrentWorkspaceLoaded = computed(
  () => this.loadedWorkspaceId() === (this.workspaceService.currentWorkspace()?.id ?? null),
);
```

When a new real workspace load starts, clear `loadedWorkspaceId`. When the current request finishes — success or handled failure — mark that workspace id as loaded. Guard every completion with the existing `membersLoadVersion` so stale responses cannot mark the wrong workspace ready.

- [ ] **Step 4: Run the focused service test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/workspace-member.service.ts src/app/core/services/workspace-member-role-loading.dom.spec.ts
git commit -m "fix(core): expose workspace member loading state"
```

---

### Task 2: Make Data & Audit wait for the resolved role

**Files:**
- Modify: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.ts`
- Modify/Test: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.spec.ts` or add a focused Angular fixture spec beside it.

**Interfaces:**
- Consume: `memberService.isCurrentWorkspaceLoaded()`
- Consume: `memberService.currentUserRole()`
- Preserve: `canExportAuditData(role)`

- [ ] **Step 1: Add the failing production regression**

Reproduce this sequence:

```ts
// Active workspace exists.
loadedWorkspaceId.set(null);
members.set([]);
fixture.detectChanges();

expect(component.error()).toBeNull();
expect(listEvents).not.toHaveBeenCalled();

// Member load resolves.
members.set([ownerMember]);
loadedWorkspaceId.set(workspaceId);
fixture.detectChanges();
await flushAsync();

expect(listEvents).toHaveBeenCalledTimes(1);
expect(component.error()).toBeNull();
```

Add a second test for a completed membership load with role `member`; only that case should produce:

`Für das globale Prüfprotokoll ist eine Inhaber-, Admin- oder Buchhaltungsrolle erforderlich.`

- [ ] **Step 2: Run the focused Angular test and verify failure**

```bash
npm run test:angular-fallback -- src/app/features/settings/pages/data-and-audit
```

Expected: FAIL because the current effect only keys off the workspace id.

- [ ] **Step 3: Implement the reactive authorization gate**

The component effect must read:

- current workspace id
- membership-loaded state
- current user role

Behavior:

```ts
if (!workspaceId) return;

if (!membershipLoaded) {
  this.error.set(null);
  return;
}

if (!canExportAuditData(role)) {
  this.events.set([]);
  this.nextCursor.set(null);
  this.error.set(AUTH_MESSAGE);
  return;
}

void this.loadPage(true);
```

Prevent duplicate loads with a marker that is only set for a resolved authorized workspace/role state. Do not mark a workspace “loaded” while membership is still pending.

- [ ] **Step 4: Run focused tests**

```bash
npm run test:dom -- src/app/core/services/workspace-member-role-loading.dom.spec.ts
npm run test:angular-fallback -- src/app/features/settings/pages/data-and-audit
```

Expected: PASS.

- [ ] **Step 5: Update changelog and commit**

```bash
git add src/app/core/services/workspace-member.service.ts src/app/core/services/workspace-member-role-loading.dom.spec.ts src/app/features/settings/pages/data-and-audit docs/AI-CHANGELOG.md
git commit -m "fix(ui): wait for workspace role before audit access"
```

---

### Task 3: Verify the isolated fix

**Files:**
- No new source files unless verification exposes a real defect.

- [ ] **Step 1: Format touched files**

```bash
npx prettier --write src/app/core/services/workspace-member.service.ts src/app/core/services/workspace-member-role-loading.dom.spec.ts src/app/features/settings/pages/data-and-audit/data-and-audit.component.ts src/app/features/settings/pages/data-and-audit/data-and-audit.component.spec.ts docs/AI-CHANGELOG.md
```

- [ ] **Step 2: Run targeted tests**

```bash
npm run test:dom -- src/app/core/services/workspace-member-role-loading.dom.spec.ts
npm run test:angular-fallback -- src/app/features/settings/pages/data-and-audit
```

- [ ] **Step 3: Run lint/type/build**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Diff review**

Confirm:
- no changes to `HeaderComponent` or `PlatformOperatorService`
- owner/admin/accountant remain the only audit roles
- pending membership never creates a false access error
- real unauthorized roles still do

- [ ] **Step 5: PR handoff**

After successful verification ask exactly:

`Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?`
