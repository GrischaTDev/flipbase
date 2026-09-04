# Release pipeline simplification

## Global Constraints

- Work only in the existing purchase-costing-foundation worktree on chore/streamline-release-pipeline; preserve unrelated work and changelog entries.
- No push, merge, production database writes, or server installation in this implementation task. Document any necessary one-time operator step explicitly.
- English code, branch, commit and workflow names; German explanations and comments. No AI commit signatures.
- Keep money, inventory and access-control tests. No global suite deletion. No dependency upgrades.
- Use behavioral tests for scripts, actionlint for workflow syntax, targeted verification while iterating and one full npm run verify at the end.
- Production deployment must fail closed, remain serialized, and ship an immutable tested revision. PR jobs must not receive production credentials.

## Task 1: Simplify CI selection and required checks

Implement conservative change selection, one required-check aggregator and useful test timing in .github/workflows/ci.yml and scripts.

- Extend the existing changed-path detector with an application output: only known documentation-only changes (docs/, root markdown documentation) can skip application tests/build/browser/image/deployment; unknown paths default to full application validation. Changes to AGENTS.md, tooling/configuration, dependencies, workflows, Docker, landing and source always count. Preserve Supabase and service selection, but include shared dependencies and relevant test/deploy tooling as triggers where required.
- Replace Test gate, Database gate, Sniper gate with Required checks. Validate all expected success/skipped states and failure/cancelled/unknown change detection fail closed. Keep quality format/lint/typecheck/workflow checks on all changes; separate its build step conditionally if needed. No deployment on docs-only changes.
- Keep PR and master validation; preserve concurrency protections and permissions. Note the required branch protection names must be updated by an operator, do not alter remote rules.
- Measure Angular suite from existing GitHub job logs if practical; add reusable timing/report output without heavyweight infrastructure. Move node from two tiny shards to one and Angular to two shards only if configuration supports partitioning correctly; run both shards locally to establish complete coverage. Keep DOM separate.
- Ensure existing landing contract tests run in CI; currently only local verify runs them explicitly.
- Do not change Docker build strategy or migration execution in this task. Keep downstream deploy interface straightforward for Task 2.
- Write behavior tests for selection/aggregator first and observe RED; implement then GREEN. Run workflow tests, focused script tests, actionlint if available and modified suites as appropriate. Commit only own files (not controller's plan/changelog). Report evidence and required external configuration.

## Task 2: Controlled migration deployment and build reuse

Inspect current deploy/deploy.sh, Dockerfile, backup.sh and server migration runner (controller supplies read-only findings). Implement a minimal safe automatic path; never apply production migrations during development.

- Obtain migrations from the same immutable release image, not arbitrary uploaded paths. Avoid broadening the forced SSH command to an unrestricted shell. Validate tags/commands, bound inputs, preserve least privilege and avoid credential logging.
- Only apply pending migrations, in order, under a database/deployment lock. Each migration and history registration must commit atomically; errors stop the rollout. Verify all expected migrations before application rollout. SQL migrations that cannot run transactionally or destructive changes require an explicit reviewed path rather than blind retry.
- Require a fresh successful database backup before pending migration application; document backup confidentiality, restore verification limitations and compatibility/rollback responsibilities. Do not silently trust the existing backup script exit code: it tolerates absent encryption and failed offsite transfer.
- Preserve existing production gate until server capability supports the new path; a clean actionable bootstrap error is preferable to bypassing checks. Document exact one-time installation requirements, with no remote mutation in this task.
- Reduce production build duplication where safe: use the production Docker build as the master build check, keep PR Angular template build, and test the production image with a lightweight health/asset smoke before publishing/deploying. Browser demo tests must retain their development/demo configuration; don't silently run them against disabled demo mode or publish a demo build. Prefer this smaller change over a broad artifact architecture if configurations differ.
- Add focused behavioral tests covering success, no-op, backup failure, SQL failure/retry, transaction/history atomicity, rejected input and deployment failure. Use isolated local Docker/Postgres for database semantics if available, never shared local/production databases.
- Document before/after pipeline and measured versus projected timing. Commit implementation and tests with English Conventional Commit. No push or server installation.

## Task 3: Integration verification

Review task diffs, resolve findings, run npm run verify on combined changes, syntax-check shell/workflow files, and run applicable focused deployment integration tests. Record results and any server/branch-protection prerequisites. No claim of faster GitHub wall-clock without a new real run. Report code-ready versus live separately.
