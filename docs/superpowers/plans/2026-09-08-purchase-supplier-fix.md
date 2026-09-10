# Paket A – Lieferanten-Speicherfehler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neue Einkäufe mit gültigem Lieferanten speichern, ohne die Workspace-Prüfung aufzuweichen.

**Architecture:** Ausschließlich die fehlerhafte UUID-Formprüfung von `create_purchase` korrigieren; bestehende Autorisierung und Lieferantenabfrage erhalten. Neuer Regressionsfall ergänzt die Chroniktests.

**Tech Stack:** PostgreSQL/pgTAP, Supabase, vorhandene Migrations-CI.

**Spec:** `docs/superpowers/specs/2026-09-08-unified-products-admin-design.md`

## Globale Grenzen

Die Grenzen des [Hauptplans](2026-09-08-unified-products-admin.md) gelten vollständig. Kein Docker oder DB-Test auf dem Arbeitslaptop. Keine Korrektur direkt im Produktionsdashboard.

## A1 – Roten Test ergänzen

**Dateien:** Ändern `supabase/tests/purchase_draft_audit.test.sql`; neue fokussierte Datei `supabase/tests/purchase_supplier_validation.test.sql`.

**Schnittstelle:** Bestehendes `public.create_purchase(p_workspace_id uuid, p_purchase jsonb, p_costs jsonb, p_lines jsonb)`; Ein-/Ausgabe unverändert.

- [ ] Den vorhandenen echten Lieferanten bereits vor dem ersten `create_purchase` in den Chronik-Testpayload aufnehmen:

```sql
update draft_input
set purchase = purchase || '{"supplier_id":"a8100000-0000-4000-8000-000000000021"}'::jsonb;
```

- [ ] Für den späteren Lieferantenwechsel einen zweiten Lieferanten desselben Workspaces anlegen und dessen ID verwenden; der bestehende Änderungsnachweis darf nicht zu einer No-op-Prüfung werden.
- [ ] Eigenen pgTAP-Fall mit zwei Workspaces, je einem Lieferanten und authentifiziertem Mitglied vorbereiten: gültige eigene ID → Erfolg; fremde ID, gültig geformte fehlende ID und ungültiger Text → `22023`; JSON `null`/fehlender Lieferant → weiterhin erlaubt.
- [ ] Wiederholung derselben Request-ID erzeugt keinen zweiten Einkauf und genau ein Erstellungsevent. Fehlversuch hinterlässt weder Kopf, Positionen, Kosten noch Ereignis.
- [ ] Rotlauf in isolierter CI/Testumgebung dokumentieren. Lokal darf ergänzend das Schema-Prüfmuster statisch gegen UUID-Beispiele getestet werden; dies ersetzt den SQL-Test nicht.

## A2 – Minimale Korrektur und neue Migration

**Dateien:** Ändern `supabase/schemas/database.sql`; erzeugte neue Migration mit Suffix `purchase_supplier_uuid_validation.sql`. Bestehende Datei `20260908192408_purchase_draft_audit.sql` nicht ändern.

- [ ] In `create_purchase` das Muster angleichen:

```sql
'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
```

- [ ] Keine `exists`-Workspace-Prüfung entfernen, keine Lieferanten-ID im Frontend umschreiben und keinen automatischen Lieferantenersatz bauen.
- [ ] Migration in einer freigegebenen isolierten Umgebung aus dem Schema erzeugen. Falls diese nicht verfügbar ist, die bereits besprochene mechanische Ableitung der vollständigen Funktionsdefinition mit Rechten gesondert dokumentieren und in CI ausführen; kein lokaler Docker-Fallback. UTC-Dateiname vom Werkzeug erzeugen lassen.
- [ ] Gegen Schema vergleichen: Nur `create_purchase` geändert, Signatur/Owner/Grants, Audit und idempotente Rückgabe erhalten; keine zusätzlichen Schemaänderungen.

## A3 – Prüfung und fokussierter Abschluss

- [ ] `purchase_supplier_validation` und `purchase_draft_audit` in DB grün; vollständige Datenbanksuite im PR.
- [ ] Lokal ausführen:

```powershell
node --test scripts/check-migration-changes.test.mjs scripts/package-migrations.test.mjs
git diff --check
```

- [ ] SQL-Review und Befund im AI-Changelog dokumentieren. Bei Commitfreigabe `fix(purchases): accept valid supplier ids when creating drafts`.
- [ ] Auf Veröffentlichungsauftrag unabhängig von B/C über grünen PR ausliefern. Kein Warten auf ApexCharts oder die Bestandsmigration erforderlich.
