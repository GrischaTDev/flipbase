# Audit Role Loading Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent „Daten & Protokolle“ from showing a false authorization error while the current workspace membership is still loading, and automatically load the audit log once the real owner/admin/accountant role resolves.

**Architecture:** `WorkspaceMemberService` exposes whether the member context for the active workspace has been successfully resolved. `DataAndAuditComponent` waits for that readiness instead of treating transient `null` as unauthorized, and reacts to workspace + readiness + resolved role as one access context.

**Tech Stack:** Angular 22 standalone components, Signals, Vitest/Angular TestBed, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-19-expense-entry-redesign-design.md`

## Global Constraints

- The red header „Admin“ badge remains a platform-operator indicator and is not changed.
- Audit access remains limited to `owner`, `admin`, and `accountant`.
- A transient loading state must never be presented as an authorization failure.
- A failed member query stays a technical SyncStatus error, not a false role error.
- UI text remains German.
- Record the implementation in `docs/AI-CHANGELOG.md`.

---

### Task 1: Expose resolved workspace-member context

**Files:**
- Modify: `src/app/core/services/workspace-member.service.ts`
- Create/Test: `src/app/core/services/workspace-member-role-loading.spec.ts`

**Interfaces:**
- Produces `loadedWorkspaceId: Signal<string | null>`
- Produces `currentWorkspaceMembersResolved: Signal<boolean>`
- Keeps `currentUserRole(): WorkspaceRole | null`

- [ ] **Step 1:** Write deferred-query tests proving unresolved before completion, resolved owner after success, invalidation on workspace switch, and unresolved state on query failure.
- [ ] **Step 2:** Run `npx vitest run src/app/core/services/workspace-member-role-loading.spec.ts` and confirm failure.
- [ ] **Step 3:** Add a private loaded-workspace signal. Set it only after a successful member query for that workspace. Expose a computed readiness signal that is true in demo mode or when the active workspace equals the successfully loaded workspace and loading is false.
- [ ] **Step 4:** Re-run the focused test and confirm pass.
- [ ] **Step 5:** Commit `fix(core): expose resolved workspace membership context`.

### Task 2: Make Data & Audit react to readiness and role

**Files:**
- Modify: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.ts`
- Modify/Test: `src/app/features/settings/pages/data-and-audit/data-and-audit.component.spec.ts`

**Interfaces:**
- Consumes `memberService.currentWorkspaceMembersResolved()`
- Consumes `memberService.currentUserRole()`
- Keeps `canExportAuditData(role)`

- [ ] **Step 1:** Add regression tests: unresolved/null role shows no authorization error and performs no audit request; readiness then owner triggers the request automatically; resolved member role shows the existing error; member-load failure does not masquerade as unauthorized.
- [ ] **Step 2:** Run the focused spec and confirm failure.
- [ ] **Step 3:** Replace the workspace-only load gate with an access-context key built from workspace ID + readiness + resolved role. Do not mark a workspace as loaded while membership is unresolved. Only let `loadPage()` emit the authorization error after readiness is true.
- [ ] **Step 4:** Run the focused spec plus `settings-behavior.angular.spec.ts` and the new service spec.
- [ ] **Step 5:** Update `docs/AI-CHANGELOG.md` and commit `fix(ui): wait for workspace role before audit authorization`.

### Task 3: Verify the bugfix branch

- [ ] **Step 1:** Run formatting/lint for touched files.
- [ ] **Step 2:** Run the focused role/settings tests and the project quality/build command selected by CI.
- [ ] **Step 3:** Review the diff: platform Admin logic untouched; owner/admin/accountant semantics unchanged; no false role error while unresolved; real unauthorized users still see the message.
- [ ] **Step 4:** Prepare a dedicated `fix/audit-role-loading` PR only after the repository merge workflow permits it.
