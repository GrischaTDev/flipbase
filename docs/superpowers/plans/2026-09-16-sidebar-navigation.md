# Sidebar Navigation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to verify and integrate this approved change.

**Goal:** Die freigegebene Arbeitsnavigation und den aufklappbaren Ideenbereich implementieren.

**Architecture:** Eine frameworkfreie Navigationskonfiguration enthält explizite Gruppen und Pfadzuordnungen. Die vorhandene Sidebar rendert ein gemeinsames Linktemplate; ein Signal hält den Klappzustand.

**Tech Stack:** Vorhandenes Angular 22, TypeScript, Tailwind und ngx-translate; keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-09-16-sidebar-navigation-design.md`

## Umsetzung

- [x] Explizite Konfiguration und 13 Logiktests unter `src/app/core/config/workspace-navigation.ts` und `workspace-navigation.spec.ts` erstellen.
- [x] `sidebar.component.ts` und `sidebar.component.html` auf fachliche Gruppen sowie das Ideen-Disclosure umstellen.
- [x] Bestehende Sidebar-Tests unverändert erhalten; zehn ergänzende Tests in `sidebar-ideas.angular.spec.ts` ablegen.
- [x] Deutsche und englische Navigationsschlüssel in `translations.ts` ergänzen, bestehende Texte erhalten.
- [x] Vorbereitete Dateiinhalte gegen die Git-Blob-Prüfsummen des Änderungspakets prüfen.
- [x] 13 Navigationslogiktests mit lokalem Node-Testadapter erneut ausführen; kein Ersatz für Angular-Tests.
- [x] Freigabe zum Branch-Push, PR und Merge nach grünen Pflichtprüfungen im Chat einholen.
- [ ] Vollständige CI mit Formatierung, ESLint, Typprüfung, Vitest-Suites, Browser-Smoke und Produktionsbau auswerten.
- [ ] Manuellen visuellen Desktop-/Mobilabgleich und Tastaturbedienung prüfen.
- [ ] Den aktuellen PR-Dateistand nach allen erfolgreichen Pflichtprüfungen per Merge-Commit integrieren.

## Prüfbefehle im vollständigen Projekt

```sh
npx vitest run --project=node src/app/core/config/workspace-navigation.spec.ts
npx vitest run --project=angular src/app/layout/sidebar
npm run format:check
npm run lint
npm run typecheck
npm run build
```

Lokale Ausführungsgrenzen und der fehlende zentrale Changelog-Nachtrag stehen im begleitenden Prüfprotokoll. Es gibt keinen direkten Push auf `master` und keine Abschwächung vorhandener CI-Prüfungen.
