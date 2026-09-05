# Gemeinsame Chronik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Kommentare und automatische Änderungen gemeinsam in Einkauf und Verkauf anzeigen, ohne Buchungen zu verändern.
**Architecture:** Neue getrennte Kommentartabelle; ein geprüfter, seitenweise ladbarer Zeitstrahl verbindet Kommentare und bestehende business_events. Der Feature-Container lädt Daten; Shared-Komponenten zeigen ausschließlich übergebene Daten an.
**Tech Stack:** Angular 22, Tailwind, vorhandenes Supabase/Postgres und pgTAP.
**Spec:** docs/superpowers/specs/2026-09-05-admin-workflow-refresh.md, Paket 3, ausdrücklich zur Umsetzung freigegeben.

**Abnahme 2026-09-05:** Implementiert in `2ce6bf4`, Integrationstest-Nachbesserung `a430c3e`. Aufgabenprüfung und gezielte Nachprüfung bestanden; lokale Konto-QA Einkauf/Verkauf inklusive Reload und unveränderter Einkaufsdaten, 390/1440/2560 px, Chronik-Axe ohne Befund. Gesamtprüfung folgt nach Paketen 4/5. Zwei kleine Punkte für Abschlussprüfung festgehalten: Unicode-Leerraumdefinition zwischen SQL/JS angleichen und bestehende Test-Runner-Farbwarnung vermeiden. Kein Push/Deployment.

## Global Constraints

- Deutsche Oberfläche, englische neue Bezeichner/Commits, keine KI-Signatur, kein codex-Branchpräfix.
- Eigener vorhandener Worktree; keine Produktionsdaten, kein Push/Merge/Deployment.
- Kommentare sind keine Buchungsänderungen. Unveränderbare business_events und bestehende Exportverträge unverändert lassen.
- Zugriff nur im aktuellen Workspace und auf existierende Einkäufe/Verkäufe für berechtigte Mitglieder. Autor und Zeit serverseitig; kein Vertrauen auf clientseitige Rechte oder Auth-user_metadata.
- Neue Schemas in eigener numerisch präfixierter Datei, Migration generieren und prüfen, Typen neu generieren; keine fremden Container stoppen/zurücksetzen.
- Inter, neutrale Flächen, gelbe Akzente, vorhandene dunkle Anthrazitflächen erhalten. Keine Shop-/Landingpageänderungen.

## Task 1: Sichere gemeinsame Chronik

**Files:** Create `supabase/schemas/96_record_comments.sql`, generated migration, `supabase/tests/record_comments.test.sql`; update generated `src/app/core/models/supabase.types.ts`; create `src/app/features/audit/models/record-timeline.models.ts`, `services/record-timeline.service.ts` and tests, `components/record-timeline/record-timeline.component.ts`, `.html`, `.angular.spec.ts`; update `features/audit/components/record-history/record-history.container.ts/.html/.angular.spec.ts`; create reusable presentation under `shared/components/record-timeline/` if needed instead of fetching from shared; preserve existing record-history for inventory/export consumers. Adapt `features/purchases/pages/purchase-detail` and sales history entrypoint only where integration needs it. Add `e2e/record-timeline.spec.ts`.

**Interfaces:**

```ts
export interface RecordTimelineEntry {
  readonly id: string;
  readonly kind: 'event' | 'comment';
  readonly createdAt: string;
  readonly actorName: string;
  readonly body: string | null;
  readonly event: BusinessEvent | null;
}
// Feature service:
// list(workspaceId, entityType: 'purchase'|'sale', entityId, cursor?) -> {entries,nextCursor}
// addComment(workspaceId, entityType, entityId, body) -> saved comment; throws on failure.
```

- [ ] Write failing tests for chronological merge, tied timestamps with stable cursor, comment whitespace/length validation, permission denial and stale workspace responses. Example: `expect(entries.map(e => e.kind)).toEqual(['comment','event','comment'])` for fixed descending timestamps; `expect(canSubmit('   ')).toBe(false)`; never assert only component existence.
- [ ] Define `record_comments` with UUID domain identity, workspace_id, exactly one purchase_id or sale_id and composite workspace/entity foreign keys, author_id, server created_at and body trimmed length 1..5000. Enable RLS, explicit select/insert policies for authenticated current members + entity existence, no client update/delete grants; no anonymous access. Comments initially append-only, plain text (no HTML/attachments/edit/delete UI). Reuse existing membership helpers and forbid writes to archived workspaces consistently with existing workspace retention rules. Author must equal auth.uid(); preserve referential history. SQL comments explain purpose and grants.
- [ ] Implement `list_record_timeline` with explicit workspace membership/entity checks before returning anything, descending stable pagination across both event kinds (created_at + kind + id), max100/default20. Return author full_name where available, neutral fallback when missing; never expose emails or arbitrary auth records. Preserve redaction and event detail functionality. If security definer is required to union existing restricted business_events, justify it, set empty search_path, fully qualify, authenticate and validate exact entity scope, revoke public/anon execution, grant authenticated only.
- [ ] Generate migration from declared schema using discovered CLI commands; inspect complete generated SQL for unrelated changes, apply only locally, generate types. Run pgTAP proving same-workspace allowed; foreign workspace/anonymous denied; spoofed author, wrong entity association, empty/oversize comments rejected; no update/delete or business-event modification. Do not reset shared local test data. Escalate if clean migration generation cannot proceed safely.
- [ ] Feature service uses central SupabaseService only; demo comments isolated by workspace/entity in existing demo storage, no backend writes. Component discards stale load/post responses after entity/workspace switch and blocks duplicate posting. Failed post preserves draft, displays understandable error, successful post appears once. Keep previously loaded entries on load-more failure.
- [ ] Render title `Chronik`, comment composer `Kommentar schreiben`, `Posten`, hint `Nur für Mitglieder dieses Workspace sichtbar`. Comments are visibly distinct neutral cards with author and text; system events compact along one timeline. Both share descending time ordering, relative time plus exact timestamp in time/title. Dates grouped by day, event details expandable. Use Angular escaped text and accessible labels/focus; no raw HTML. No hardcoded user identity. Purchase/sale use timeline; other history types continue old behavior.
- [ ] Verify real UI post/reload and mixed event/comment ordering, no duplicate entries after pagination, anonymous/cross-workspace DB checks, responsive390/1440/2560 and axe. Run focused tests, changed-file ESLint/Prettier and build. Controller runs final broad integration checks once across remaining packages. Commit `feat(core): add shared record chronicle`; leave docs/AI-CHANGELOG.md controller-owned; report exact test evidence.

## Task 2: Abnahme

- [ ] Independent task review, corrections by original implementer and scoped review.
- [ ] Main local-account QA confirms comment retained after reload, no changes to purchase totals/sale records, cross-workspace denial and visual review.
- [ ] Record outcome and limitations. No publication. Whole remaining-workflow final review after packages 4 and 5.

## Self-review

No dependency on future archive/CSV work. Both timeline kinds use one cursor rather than independently paginated lists. SQL owns author, membership and existence checks; comments cannot masquerade as business events. Existing non-purchase/sale history preserved.
