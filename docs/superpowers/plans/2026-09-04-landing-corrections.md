# Landing Page Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the confirmed mobile, accessibility, and product-copy inconsistencies on the existing bilingual landing page without redesigning it or inventing legal promises.

**Architecture:** Keep the zero-JavaScript static page and its existing Caddy template. Make narrowly scoped semantic/CSS changes in `landing/index.html`, guard stable copy and structure with a fast Node test, and validate all German/English, light/dark, desktop/mobile combinations through the production-like Caddy rendering path.

**Tech Stack:** Static HTML/CSS, Caddy templates, Node test runner, Playwright, AXE.

**Spec:** `docs/superpowers/reports/2026-09-04-landing-integration-review.md`

## Global Constraints

- Preserve the FAQ accordion, language/theme controls, logo, form email prefill, and the visual direction integrated from Gemini.
- Keep the page JavaScript-free and compatible with the current Caddy `templates` directive and CSP.
- Both languages, both themes, and 1440 × 1000 plus 390 × 844 must remain usable.
- Do not publish claims such as `DSGVO-konform`, `ohne US-Datentransfer`, exact data-center locations, automatic backups, or cryptographic workspace isolation unless separately proven from the real production operation.
- Do not write replacement legal terms or privacy policies. Keep `noindex, nofollow` until reviewed legal texts and production configuration are supplied.
- The existing form behavior is a direct GET to `https://app.flipbase.de/auth/register?email=…`; unless the product owner explicitly chooses a real waitlist, make the surrounding copy describe direct beta registration rather than an invitation request.
- Deal-Sniper behavior that is not available end to end must be described as planned/in development.
- Do not add dependencies, analytics, remote assets, or external requests.
- Chat and user-facing copy remain German/English as applicable; identifiers, test names, branch, commit and workflow titles remain English. Commit message uses a valid English Conventional Commit scope `landing` and contains no AI signature.

---

### Task 1: Add a static landing regression contract

**Files:**

- Create: `scripts/landing-page.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `landing/index.html`, current `node --test` runner.
- Produces: `npm run test:landing`, included in `npm run verify` before the production build.

- [ ] **Step 1: Write the failing tests**

Parse the landing HTML as text and assert both forms keep the exact registration action and GET method; the document remains script-free; both toggles are native checkboxes; all required local assets exist; the Caddy `{{if .Cookie ...}}` block remains; and the confirmed misleading strings are absent in both languages.

```js
assert.equal(matches(html, /action="https:\/\/app\.flipbase\.de\/auth\/register"/gu), 2);
assert.equal(matches(html, /method="get"/gu), 2);
assert.doesNotMatch(html, /<script\b/iu);
for (const phrase of [
  'DSGVO-konform',
  'GDPR Compliant',
  'ohne US-Datentransfer',
  'without US cloud routing',
  'sofort eine Benachrichtigung',
  'instant alerts',
  'Beta-Phase 0.1',
  'Beta Phase 0.1',
])
  assert.doesNotMatch(html, new RegExp(escapeRegExp(phrase), 'u'));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/landing-page.test.mjs`

Expected: FAIL on the existing unverified/privacy/version/Deal-Sniper wording.

- [ ] **Step 3: Register the test**

Add exactly:

```json
"test:landing": "node --test scripts/landing-page.test.mjs"
```

and insert `npm run test:landing` into `verify` before `npm run build`. Do not add it to every sharded application-test run.

- [ ] **Step 4: Keep RED evidence and proceed without weakening assertions**

Store the command and relevant failing assertions in this task's SDD report. Do not change the forbidden-string list to make existing copy pass.

### Task 2: Fix semantics, mobile header, and color contrast

**Files:**

- Modify: `landing/index.html`
- Test: `scripts/landing-page.test.mjs`

**Interfaces:**

- Consumes: current CSS variables and native checkboxes.
- Produces: no horizontal overflow at 390 px, visible keyboard focus, a valid heading hierarchy, and zero serious/critical AXE findings in all eight display combinations.

- [ ] **Step 1: Make toggle semantics native**

Move the two `.sr-only` checkbox inputs inside the page header landmark before `.kopf-aktionen`. Remove invalid `role="button"` and `tabindex="0"` from their labels. Keep the label `for` attributes, and expose focus on the visible labels:

```css
#theme-toggle:focus-visible ~ .kopf-aktionen label[for='theme-toggle'],
#lang-toggle:focus-visible ~ .kopf-aktionen label[for='lang-toggle'] {
  outline: 2px solid var(--amber);
  outline-offset: 3px;
}
```

Verify Space toggles each focused checkbox and the visible state changes.

- [ ] **Step 2: Fix the mobile header at its source**

At `max-width: 560px`, keep brand and controls within the viewport. Allow the header to wrap, make `.kopf-aktionen` fill the second row, and let the login/app link use remaining width without a minimum-content overflow:

```css
header {
  flex-wrap: wrap;
}
.kopf-aktionen {
  min-width: 0;
}
@media (max-width: 560px) {
  header {
    align-items: center;
  }
  .kopf-aktionen {
    width: 100%;
    justify-content: space-between;
  }
  .kopf-cta {
    min-width: 0;
    text-align: center;
  }
}
```

Adjust only if the rendered 390 px measurement still exceeds `document.documentElement.clientWidth`; do not hide the login action.

- [ ] **Step 3: Correct the heading hierarchy**

Change section-card headings currently jumping from `h2` to `h4` to `h3`. Give footer link groups a hierarchy that does not skip a level (for example visually unchanged `h2` headings). Preserve text and CSS selectors by extending selectors from `.tech-box h4`/`.fuss-spalte h4` to the semantic elements, then remove the obsolete `h4` markup.

- [ ] **Step 4: Correct contrast tokens**

Do not change only individual repeated badges. Dark inactive language/footer text must use at least `--ink-muted`; the light-mode `--amber` and text tokens must measure at least 4.5:1 on their actual backgrounds. Use one darker light-mode amber shared by badge, kicker and highlighted text; keep the brighter dark-mode amber. Re-run AXE after finite transitions finish and use its computed-color result as the gate.

- [ ] **Step 5: Extend structural assertions and verify GREEN**

Add assertions that labels have no invalid role/tabindex, no `h2`→`h4` jump remains, and the mobile media query contains the header action wrap contract. Run:

`node --test scripts/landing-page.test.mjs`

Expected: structure tests pass; copy tests remain RED until Task 3.

### Task 3: Align product copy with actual behavior

**Files:**

- Modify: `landing/index.html`
- Test: `scripts/landing-page.test.mjs`

**Interfaces:**

- Consumes: direct registration route, implemented product status documented in the integration report.
- Produces: matching German and English claims without a fixed `0.1` marketing version.

- [ ] **Step 1: Describe direct registration consistently**

Because the form submits directly to registration, replace invitation language consistently:

```text
Beta-Registrierung öffnen →
Open beta registration →

Trage deine E-Mail ein und fahre mit der Registrierung in der Flipbase-App fort.
Enter your email and continue registration in the Flipbase app.
```

The FAQ must say access is currently a beta and that availability can change; it must not say requests are enabled in invitation waves. Use `Beta` without the fixed marketing version `0.1`.

- [ ] **Step 2: Mark Deal-Sniper as planned**

Keep its roadmap state `In Entwicklung` / `In development`. Change current-tense instant-alert and one-click-import claims to explicit planned behavior:

```text
Geplant ist, gespeicherte Suchfilter im Hintergrund zu prüfen und passende Treffer für den späteren Import anzuzeigen.
The planned flow checks saved searches in the background and surfaces matching listings for later import.
```

- [ ] **Step 3: Remove unverified infrastructure/privacy promises**

Replace exact locations, automatic-backup, absolute RLS and compliance claims with implementation-bounded wording:

```text
Workspace-getrennter Datenzugriff
Workspace-scoped data access

Die Anwendung schützt Workspace-Daten mit serverseitigen Zugriffsregeln. Die konkrete Betriebs- und Datenschutzkonfiguration wird vor dem öffentlichen Start gesondert geprüft.
The application protects workspace data with server-side access rules. The production privacy and hosting configuration is reviewed separately before public launch.
```

Do not add substitute claims about processors, locations, certifications, transfer mechanisms, backups, encryption scope, or legal compliance.

- [ ] **Step 4: Run static GREEN tests**

Run: `npm run test:landing`

Expected: all registration, claim, asset, Caddy-template and no-script assertions pass.

### Task 4: Validate production-like rendering

**Files:**

- Modify only if a regression is found: `landing/index.html`, `scripts/landing-page.test.mjs`

**Interfaces:**

- Consumes: a temporary read-only bind mount of `landing/` into the existing local Caddy image.
- Produces: screenshot and interaction evidence outside the repository.

- [ ] **Step 1: Render through Caddy**

Start a temporary container bound only to `127.0.0.1:4180`; mount `landing/` read-only and use a temporary Caddyfile outside the repository with `templates` and `file_server`. Do not modify or restart production/shared containers.

- [ ] **Step 2: Check eight display combinations**

With existing Playwright/AXE, verify German/English × light/dark × 1440 × 1000/390 × 844. For every combination assert correct title and visible `h1`, no raw Caddy directive, no console/page/asset errors, no horizontal overflow, and no AXE violation. Wait for finite CSS transitions before AXE contrast measurement.

- [ ] **Step 3: Check interactions without submitting forms**

Use keyboard Space for theme/language checkboxes and Enter for FAQ open/close. Assert both forms resolve to `https://app.flipbase.de/auth/register`, include the entered email as a GET query parameter, but intercept navigation before any registration request is sent.

- [ ] **Step 4: Capture evidence and run the repository gate**

Save one desktop-light and one mobile-dark screenshot outside the repository. Run `npm run verify` to a log without a pipeline and confirm its own exit code. Stop only the exact temporary landing QA container after validation.

- [ ] **Step 5: Commit**

```bash
git add landing/index.html scripts/landing-page.test.mjs package.json docs/AI-CHANGELOG.md docs/superpowers/plans/2026-09-04-landing-corrections.md
git commit -m "fix(landing): align mobile layout and product claims"
```

No push, PR, production deployment, account creation, or external form submission is part of this plan.
