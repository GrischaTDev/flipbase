# Speicherfeedback und Toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Fremdschlüsselfehler beim Anlegen von Einkaufsartikeln beseitigen und ein zentrales, zugängliches Toast-System bereitstellen.

**Architecture:** Der Inventardienst schreibt abhängige Protokolle erst nach erfolgreicher Primäränderung und rollt fehlgeschlagene Optimistic-UI-Einträge zurück. Ein zustandsloser Shared-Container rendert die Meldungen eines zentralen signalbasierten Toast-Service einmal im Shell-Layout.

**Tech Stack:** Angular 22, TypeScript 6, Signals, Tailwind CSS 4, Vitest 4, Supabase JS 2

**Spec:** `docs/superpowers/specs/2026-08-24-speicherfeedback-und-toast-design.md`

## Global Constraints

- Keine neue externe Bibliothek und keine Datenbankmigration.
- Standalone Components, Signals, OnPush und separate HTML-Templates verwenden.
- Tailwind-Klassen direkt im Template verwenden; keine neue SCSS-Datei.
- Kritische Sync-Fehler bleiben zusätzlich im bestehenden dauerhaften Banner sichtbar.
- Produktionscode wird erst nach einem passend fehlschlagenden Test geändert.

---

### Task 1: Speicherreihenfolge des Inventars

**Files:**

- Create: `src/app/core/services/inventory-persistence.spec.ts`
- Modify: `src/app/core/services/inventory.service.ts`

**Interfaces:**

- Consumes: Supabase-Query-Builder und bestehende Signale des `InventoryService`.
- Produces: `createItem`, `updateItemStatus` und `addItemCost` mit Primärschreibvorgang-vor-Protokoll-Vertrag.

- [ ] Failing Tests schreiben: Die Insert-Reihenfolge muss `inventory_items` vor `activity_logs` zeigen; bei Artikelfehlern darf kein Protokoll entstehen und der vorläufige Artikel muss verschwinden.
- [ ] `npm test -- src/app/core/services/inventory-persistence.spec.ts` ausführen und die erwarteten Fehler bestätigen.
- [ ] `InventoryService` minimal so ändern, dass Demo-Modus lokal bleibt, Live-Protokolle aber erst nach erfolgreichem Primärschreiben mit der echten ID entstehen.
- [ ] Den fokussierten Test erneut ausführen und grün bestätigen.

### Task 2: Zentraler Toast

**Files:**

- Create: `src/app/shared/components/toast/toast.service.ts`
- Create: `src/app/shared/components/toast/toast.service.spec.ts`
- Create: `src/app/shared/components/toast/toast-container.component.ts`
- Create: `src/app/shared/components/toast/toast-container.component.html`
- Modify: `src/app/layout/shell/shell.component.ts`
- Modify: `src/app/layout/shell/shell.component.html`

**Interfaces:**

- Produces: `ToastService.success(message)`, `error(message)`, `warning(message)`, `info(message)` und `dismiss(id)`.
- Produces: `ToastContainerComponent`, genau einmal in der Shell gerendert.

- [ ] Failing Tests für Typ, Reihenfolge, Begrenzung, Schließen und automatisches Ausblenden schreiben.
- [ ] Den fokussierten Toast-Test ausführen und erwartete Fehler bestätigen.
- [ ] Service und Container mit Signal-State, Timern, ARIA-Rollen und Tailwind implementieren.
- [ ] Toast-Test erneut ausführen und grün bestätigen.

### Task 3: Einkaufsaktionen anbinden

**Files:**

- Create: `src/app/features/purchases/pages/purchase-detail/purchase-detail-actions.spec.ts`
- Modify: `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`

**Interfaces:**

- Consumes: `ToastService` aus Task 2 sowie bestehende Service-Ergebnisse `{ error }` und `{ data, error }`.
- Produces: Formulare schließen und Navigation erfolgen ausschließlich nach erfolgreichem Speichern/Löschen.

- [ ] Failing Tests für beibehaltenes Artikelformular bei Fehler sowie Erfolgs-/Fehler-Toast schreiben.
- [ ] Den fokussierten Test ausführen und die erwarteten Fehler bestätigen.
- [ ] Artikel-, Einkaufskosten- und Löschaktionen an `ToastService` anbinden und Fehlerpfade früh beenden.
- [ ] Den fokussierten Test erneut ausführen und grün bestätigen.

### Task 4: Gesamtprüfung

**Files:**

- Modify: nur Dateien aus Tasks 1–3, falls die Prüfungen konkrete Probleme zeigen.

**Interfaces:**

- Consumes: alle Ergebnisse der vorherigen Tasks.
- Produces: kompilierbare, gelintete und getestete Anwendung.

- [ ] `npm test` ausführen.
- [ ] `npm run lint` ausführen.
- [ ] `npm run typecheck` ausführen.
- [ ] `npm run build` ausführen.
- [ ] Diff und Git-Status prüfen; keine fremden oder generierten Änderungen aufnehmen.
