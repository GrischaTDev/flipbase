# Task 10 — Zeit-, Sicherheits- und Rollout-Abnahme

## Ergebnis

Der lokale Task-10-Scope ist umgesetzt. Der vollständige Go/No-Go-Bericht
steht unter
`docs/superpowers/reports/2026-08-30-teststrategie-und-ci-abnahme.md`.
Die operative Entscheidung ist **NO-GO für Produktion**, weil der
Feature-Branch auf GitHub nicht existiert, 0/5 neue PR-Läufe vorliegen, die
dynamische RLS-Abnahme wegen Docker blockiert ist und weder externer
Negativlauf noch Produktionslauf autorisiert oder ausgeführt wurden.

Es gab keinen Push, PR, Merge, `workflow_dispatch` oder Deployment. GitHub
wurde ausschließlich read-only abgefragt.

## Ausgangsstand und Worktree-Sicherheit

- Feature-Worktree:
  `K:\GitHub\Repos\flipbase\.worktrees\teststrategie-ci`
- Branch: `codex/teststrategie-ci-beschleunigung`
- Basis/HEAD vor Task 10:
  `7293435b9a2d93f14e36d53aab66d62cddfc2fa9`
- `git status --short --branch`: vor der Mutationsarbeit sauber.
- Temporärer Worktree:
  `K:\GitHub\Repos\flipbase\.worktrees\teststrategie-ci-task10-mutations`
- Der absolute Pfad wurde vor Erstellung und Entfernung als direktes Kind von
  `K:\GitHub\Repos\flipbase\.worktrees` geprüft.
- Erstellung: `git worktree add --detach <path> 7293435...`; danach bestätigte
  `git rev-parse HEAD` exakt die Basis.
- Installation im temporären Worktree: `npm ci`, 660 Pakete, Audit 0
  Schwachstellen; der Worktree blieb sauber.
- Vor Entfernung: `git diff --exit-code 7293435...` Exit 0 und
  `git status --short --branch` ohne Änderungen.
- Entfernung: exakte Registrierung über `git worktree list --porcelain`
  geprüft, dann `git worktree remove <path>`; `Test-Path` danach `False`.

## Mutationsnachweise

### Falscher Steuerfaktor — PASS

- Patch: regulärer Divisor in
  `src/app/core/services/tax-engine.service.ts` von `1.19` auf `1.2`.
- Mutationscommit: `7660280dda4b6a568221c1f3e00a05fa2d8f1d31`
  (`test(mutant): use wrong regular tax factor`).
- Befehl:
  `npx vitest run --project=node src/app/core/services/tax-engine.service.spec.ts`
- RED: Exit 1, 1 Datei rot, 2/14 Tests rot. Steuerbasis, Umsatzsteuer,
  Zahllast, Periodensumme und Nettogewinn wichen ab.
- Revert: `bde302aca0af996c098a102f4bae39de9f090d32`.
- GREEN nach allen Reverts: Exit 0, 14/14 grün.

### Doppelverkauf eines Einzelstücks — PASS

- Patch: zentrale Demo-Sperre in
  `MockDataStoreService.bookSaleAtomically` so logisch geschwächt, dass ein
  bereits verkauftes Einzelstück erneut gebucht werden konnte.
- Mutationscommit: `6ec39805847dcce310653b8b370f0d8e45a742c4`
  (`test(mutant): permit duplicate demo item sale`).
- Befehl:
  `npx vitest run --project=dom src/app/core/services/sales.service.dom.spec.ts`
- RED: Exit 1, 1 Datei rot, 1/16 Tests rot; der zweite Aufruf lieferte keinen
  Fehler mehr und verletzte den Verkaufsservicevertrag.
- Revert: `36084ff1d0d0228bf4e974a326c2bfa555d23ae9`.
- GREEN nach allen Reverts: Exit 0, 16/16 grün.

### RLS fremder Workspace — BLOCKED

- Begrenzter read-only Befehl: `docker info` in einem PowerShell-Job mit
  20-Sekunden-Grenze.
- Ergebnis: Docker-Client antwortete; der Serverzugriff scheiterte sofort an
  der fehlenden Pipe `//./pipe/dockerDesktopLinuxEngine`.
- Daher kein `supabase start`, keine SQL-Mutation, kein pgTAP-Lauf und kein
  Ersatz gegen eine linked oder produktive Datenbank.
- Der statische Workflowvertrag wird ausdrücklich nicht als dynamischer
  RLS-Ersatz gewertet.

### Falsche Rücknavigation — PASS

- Nicht gewerteter Vorversuch: `6f55adf` änderte den typisierten
  `backLink`-Wert und wurde bereits vom Angular-Compiler blockiert. Er wurde
  normal mit `72e3b70` revertiert und nicht als Browsernachweis gezählt.
- Gültiger Patch: der echte Back-Link in
  `item-detail.component.html` wurde minimal auf `/inventory` umgeleitet.
- Mutationscommit: `621595026a48510bf1a5bc9a9b9de6f40e49b446`
  (`test(mutant): misroute purchase item navigation`).
- Befehl mit eigenem, nicht wiederverwendetem Dev-Server:
  `CI=1 npx playwright test e2e/purchase-item-navigation.spec.ts --project=chromium`.
- RED: Exit 1. Der exakte Test erwartete `/purchases/pur-demo-2`, erhielt
  `/inventory`; Hauptlauf und Retry waren rot.
- Revert: `74e0d6bb7688c32c1cacaba99915858f2a3410c0`.
- GREEN nach Revert: Exit 0, 1/1 grün in 22,9 s.

## Lokaler Workflow-Gate-Negativnachweis

Befehl: `node --test scripts/ci-workflow.test.mjs`.

Ergebnis: Exit 0, 16/16 grün. Die In-Memory-Negativfixtures wiesen unter
anderem folgende unsichere Varianten zurück:

- Test-Gate mit `!= failure` statt exakt `success`;
- Image-Bau auch für Pull Requests;
- Deploy-Ausdruck mit `|| true`;
- Deploy ohne Browser-Pflichtgate;
- Datenbank-Gates, die falsches `skipped` oder einen fehlgeschlagenen
  Changes-Job durchlassen.

Der positive Vertrag belegt außerdem Push-only Image, genau ein SHA-Tag ohne
`latest` und Deploy-Abhängigkeit von allen Pflicht-Gates. Das ist ein lokaler
Struktur-/Fixture-Nachweis, kein echter GitHub-Lauf. Ein absichtlich roter
externer Shard bleibt offen.

## Read-only GitHub-Bestand

Ausgeführte Abfragen:

- `gh auth status`
- `gh repo view --json nameWithOwner,defaultBranchRef,url`
- `gh api repos/GrischaTDev/flipbase/branches/codex/teststrategie-ci-beschleunigung --silent`
- `gh run list --branch codex/teststrategie-ci-beschleunigung ...`
- `gh run list --workflow ci.yml ...`
- `gh run view 33299028439 --json ...`

Ergebnisse:

- Authentifiziert als `GrischaTDev`; Remote und Repository stimmen.
- Feature-Branch: HTTP 404, also nicht auf GitHub vorhanden.
- Feature-Runs: leere Liste `[]`; Stand 0/5.
- Run `33299028439` ist ein historischer Push auf `master` am alten SHA
  `0768233...`: Verify 10:32, Image 2:46, Deploy 0:22, Gesamtlauf 13:50.
  Er zählt nicht für die neue Pipeline.
- Die abgefragte GitHub-Ausgabe enthielt keine belastbaren abgerechneten
  Runner-Minuten; es wurde kein Wert erfunden.

## Dokumentation und Entscheidung

Der Abnahmebericht enthält Executive Summary, Task-1-bis-9-Scope,
Testpyramide/Gates, lokale Messwerte, fünf offene PR-Slots, vier
Mutationsnachweise, Workflow-Negativstatus, Pre-/Deploy-/Post-Checklisten,
Produktionsmessplan, vorab definierte Rollback-Trigger, selektiven
Rollback-Ablauf sowie die Bedingungen für ein späteres GO.

`docs/AI-CHANGELOG.md` erhält als obersten Eintrag nach der Regelsektion Modell
`Codex GPT-5.6`, Art `Konfiguration + Tests + Doku`, den Gesamtscope und nur
belegte lokale Ergebnisse.

Frische finale Verifikation:

- `npm run format:check`: Exit 0;
- `npm run test:workflow`: Exit 0, 72/72 grün;
- `git diff --check`: Exit 0;
- Inhaltsaudit: exakt fünf offene PR-Zeilen, klare NO-GO-Aussage und keine
  TODO-/TBD- oder Produktions-Go-Platzhalter.

Commit-Nachricht: `docs: record test strategy rollout evidence`. Der Hash des
Commits kann nicht in seinem eigenen Inhalt stehen und wird dem Hauptagenten
separat gemeldet.

## Offene Punkte

- fünf aufeinanderfolgende neue PR-Läufe und daraus p95 ≤ 3 Minuten;
- tatsächliche GitHub-Runner-Minuten innerhalb des Budgets;
- externer roter Shard mit `deploy=skipped` und ohne `latest`;
- dynamische Supabase-/RLS-Abnahme;
- Critical/Important-Reviewfreigabe;
- echter Produktionslauf mit Merge-zu-`healthz=ok` ≤ 5 Minuten, gesundem
  Container, HTTP 200 und exakt ausgeliefertem Merge-SHA.

Bis alle Punkte kumulativ belegt sind, bleibt die Entscheidung **NO-GO für
Produktion**.
