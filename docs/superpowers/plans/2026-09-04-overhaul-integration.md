# Overhaul Integration Plan

## Goal

Integrate the approved master changes into the existing overhaul branch, preserve other assistants' work, and verify the combined application before any release decision.

## Global Constraints

- Work only in `feature/purchase-inventory-overhaul` and its existing worktree.
- No push, production migration, deployment, or changes to foreign branches.
- Preserve both sides of the AI changelog and record this session.
- German user-facing text; English Conventional Commits without assistant signatures.
- Keep unknown costs distinct from zero and preserve purchase/sale audit history.
- Keep the faster test strategy; add targeted checks for concrete integration risks.

## Task 1: Integrate master

Preserve pending notes, merge `origin/master` into this worktree, resolve the changelog by retaining both histories, and inspect the combined diff. Do not alter foreign branches.

## Task 2: Review and repair integration risks

Review the combined CI/deployment gates and daily coverage selection. Independently review the overhaul's sale metrics, audit exports, and remaining implementation-plan gaps. Fix confirmed defects with focused regression tests; no speculative rewrite or dependency upgrade.

## Task 3: Verify combined state

Run `npm run verify`, focused critical coverage, and available local database/browser checks. Report actual failures or unavailable infrastructure explicitly. Never treat older green runs as proof of the new state.

## Task 4: Review landing page separately

Compare visible promises with implemented signup and product behavior. Document unresolved product/legal claims without inventing policy or legal compliance. Avoid redesigning the page without need.

## Task 5: Hand off

Record exact verification, outstanding work, and release blockers. No claim of production readiness without completing required checks; no push or deployment.
