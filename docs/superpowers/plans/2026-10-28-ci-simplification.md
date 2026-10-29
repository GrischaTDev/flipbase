# FlipBase CI-Vereinfachung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Vermeidbare CI-Fehler und pauschalen Prüfaufwand reduzieren, bei nachvollziehbar erhaltener Risikodeckung.

**Architecture:** Bestehende Änderungserkennung und Testauswahl bleiben die gemeinsame Quelle. Browser-Kern, betroffene Regressionen, spezialisierte Integrationsprüfungen und echte Abschluss-Gates werden klar getrennt. Der lokale Vorabcheck verwendet dieselben Auswahl- und Ausführungsbausteine wie die CI.

**Tech Stack:** Angular 22, Vitest 4, Playwright, Node 22, GitHub Actions, npm, Supabase/pgTAP und Deno.

**Spec:** CI-Audit und Nutzerauftrag vom 28. Oktober 2026 im gemeinsamen Gespräch: alle sinnvollen Punkte umsetzen, Aufgaben auf Agenten verteilen und anschließend unabhängig kritisch gegenprüfen. Die fünf bereits umgesetzten Konfigurationskorrekturen bleiben erhalten.

## Global Constraints

- Bestehenden Branch juna/ci-audit-followups fortsetzen, Basis 9e14638; origin/master ist frisch abgeglichen.
- GitHub Free und später privates Repository: keine technische Merge-Sperre voraussetzen.
- Ubuntu 24.04, Node 22, gesperrte Abhängigkeiten; kein Framework-Major-Upgrade.
- Geld, Datenintegrität, RLS, Berechtigungen und Veröffentlichungsgrenzen erhalten.
- Kein Testgrün durch gelockerte Assertions, allgemeine Retries oder stilles Überspringen erforderlicher Prüfungen.
- Keine Produktionszugriffe, Nachrichten, Pushes oder Merges während der Umsetzung.
- Änderungen in getrennt zugewiesenen Dateien; gemeinsame Schnittstellen früh abstimmen.
- Kommentare/Dokumentation Deutsch, Bezeichner Englisch. Keine KI-Autorschaft; Commits ausschließlich durch Root.

## Review Focus

- Neue, gelöschte und umbenannte Dateien dürfen keine erforderlichen Tests verlieren.
- Globale, unbekannte, Rechte- und Datenbankänderungen dürfen keine leere oder unbegründet schmale Auswahl ergeben.
- Fehler, Abbruch oder fehlende Prüfwerkzeuge müssen den Abschluss verhindern; legitime Nichtauswahl darf kein falsches Pending erzeugen.
- Testressourcen und Signal-Metadaten dürfen weder verwechselt noch durch leere Ersatzwerte kaschiert werden.
- Geteilte Docker-Buildinputs und native Veröffentlichungsfälle müssen trotz Zusammenführung geprüft bleiben.

## Task 1: Browser-Auswahl nach Risiko aufteilen

**Files:** scripts/affected-tests.mjs, scripts/affected-tests.test.mjs, scripts/run-affected-tests.mjs, scripts/playwright-pr-smoke.test.mjs, playwright.pr.config.ts, playwright.affected.config.ts; bei Bedarf eine kleine zentrale Browser-Kernliste unter scripts/.

Ziel: Die bisher pauschal gewachsenen 250 Browserfälle durch einen expliziten kleinen Kern (ungefähr 10–20 zentrale Abläufe als Richtwert, kein starres Löschziel) plus passende betroffene Regressionen ersetzen. Bestehende fachliche Browserfälle bleiben verfügbar. Geld-/Beleg-/Bestands-, Anmelde-/Berechtigungs-, Veröffentlichungs- und wichtige PWA-Risiken erhalten. Globale/unbekannte Änderungen müssen konservativ breiter als gezielte Änderungen geprüft werden, nicht still als leer gelten.
Bestehende öffentliche Schnittstellen selectAffectedTests(paths, files), buildUnitMatrix(plan), buildBrowserMatrix(plan), selectionHash(plan), readSelectionFiles() und run-affected-tests.mjs unit|browser weiterverwendbar halten. Zusätzliche Planfelder sind möglich; Root und Workflow-Agent früh darüber informieren. Kleinere normale Änderungen dürfen nur passende Seitenvarianten ausführen. Explizit geänderte Browserdateien vollständig prüfen; bei globalen/layoutbezogenen Änderungen die tatsächlich nötigen Varianten wählen. Die bisherige riesige Soll-Liste nicht einfach gegen eine zweite riesige Snapshot-Liste ersetzen: zentrale Auswahl und wenige aussagekräftige Grenzfälle.
Fehler-Traces in PR-Browserjobs bei Fehlern behalten; keine allgemeinen Retries oder gelockerten Assertions. Kein pauschales Herausnehmen von Accessibility oder absichtlichen Produktgrenzen.
Schritte: aktuellen Selektor verstehen; konkrete Auswahlrisiken durch wenige vorhandene/ergänzte Tests abdecken; Auswahl minimal ändern; echte Playwright --list-Ausgabe und Matrizenzusammenstellung für global, Galerie, Einkauf, Marketplace, Doku, geänderten unmarkierten Test sowie gelöschte/umbenannte Dateien prüfen. Vorher/Nachher-Zahlen und erhaltene Risikodeckung berichten.
Keine Änderungen an package.json, .github/, docs/AI-CHANGELOG.md oder Angular-Testaufbau. Keine Commits oder Pushes; Root führt zusammen.

- [x] Bestehenden Ablauf und konkrete Fehlerfälle prüfen.
- [x] Abgegrenzte Änderung mit passenden vorhandenen/gezielt ergänzten Tests umsetzen.
- [x] Verhalten und Auswahl prüfen, Ergebnisse und Grenzen dokumentieren.
- [x] Unabhängigen Review auswerten und notwendige Korrekturen prüfen.

## Task 2: Angular-Testaufbau stabilisieren und messen

**Files:** src/test-setup.angular-fallback.ts, e2e/support/marketplace-rendering.ts, vitest.config.ts, vitest.split.config.ts, gezielt betroffene Angular-Testhilfen/-tests; optional kleine neue zentrale Hilfsdatei.

Ziel: Konkrete Fehlerursachen und unnötige Vorbereitung im eigenen Angular-JIT-Testaufbau reduzieren. Der Audit fand fehlende manuelle Template-Zuordnungen (vinted-action-overview, action-status-indicator), private ɵcmp-Patches und lange Setup-Zeiten. Keine pauschale Abschaltung von Angular-Tests oder Umstellung auf unbewiesene schnellere Architektur.
Vergleiche eine repräsentative aktuelle Auswahl des direkten Vitest-Laufs mit dem vorhandenen npm-Befehl test:angular-builder, sofern mit den gesperrten Abhängigkeiten ausführbar. Miss gleiche Auswahl und Node22-Umgebung; kalte/warme Vorbereitung und fehlgeschlagene Versuche ehrlich unterscheiden. Suche eine kleine robuste Lösung gegen transitive/umbenannte Ressourcen und widersprüchliche Metadatenzuordnung. Private Metadaten nur entfernen, wenn ihr Verhalten durch den Ersatz erhalten bleibt; Fehler dürfen nicht durch leere Templates, unterdrückte Unknown-Property-Fehler oder blindes Ignorieren verschwinden.
Wichtige Gegenfälle: transitiv eingebundene Komponente, gleichnamige Ressourcen in verschiedenen Verzeichnissen, echte fehlende Ressource, Signal-Input/Output/Model-Alias und sauberer Zustand nach Testende. Ergänze nur die Fälle, die die geänderte Logik benötigen. Keine mechanischen Tests für triviale Konfiguration.
Bewerte vmMemoryLimit mit pool=forks anhand tatsächlicher Vitest-Version; entferne wirkungslose Optionen nur bei belegter Bedeutung. Experimentelle Runneränderung nur übernehmen, wenn Kompatibilität und Nutzen nachgewiesen sind.
Keine Änderung an package.json, .github/, Browser-Auswahl oder docs/AI-CHANGELOG.md. Falls zusätzliche npm-Abhängigkeit oder Änderung von angular.json nötig scheint: erst mit Root abstimmen. Keine Commits/Pushes. Baseline, Lösung, betroffene grüne Tests und verbleibende Grenzen im Report dokumentieren.

- [x] Bestehenden Ablauf und konkrete Fehlerfälle prüfen.
- [x] Abgegrenzte Änderung mit passenden vorhandenen/gezielt ergänzten Tests umsetzen.
- [x] Verhalten und Auswahl prüfen, Ergebnisse und Grenzen dokumentieren.
- [x] Unabhängigen Review auswerten und notwendige Korrekturen prüfen.

## Task 3: Workflow-Doppelarbeit entfernen und Image-Prüfungen vervollständigen

**Files:** .github/workflows/*.yml, bei Bedarf eine wiederverwendbare lokale Action; scripts/required-checks.mjs/.test.mjs, passende Image-Auswahl-/Prüfskripte und deren gezielte Tests; ausgewählte native Worker-Browser-Prüfung.

Ziel: Bestehende CI vereinfachen, konkrete Lücken schließen und lokale/CI-Auswahl zusammenhalten. Vorhandene Ubuntu24-Pins, korrigierten Commit-Zeitstempel, Dependabot und Preview-Entfernung erhalten. Keine Branch Protection/Rulesets einführen (GitHub Free, später privat).
Die beiden Kleinanzeigen-Extension-Browserprüfungen dürfen pro erforderlichem Workflowlauf nur einmal ausgeführt werden; passende eigenständige Prüfung statt Wiederholung in jedem Browser-Shard. Ergebnis im vorhandenen echten Required-checks-Aggregat und vor Veröffentlichung berücksichtigen, auch bei Fehler/Abbruch; bei legitimer Nichtauswahl kein unnötiger Lauf.
Identischen Chromium-Session-Build und Import-Smoke aus marketplace-worker-image.yml/marketplace-chromium-image.yml gemeinsam ausführen. Unterschiedliche Sandbox-/Profil-/Containerprüfungen erhalten. Wähle minimale Konsolidierung; keine eigene Build-Orchestrierungsplattform. Spezifische Imageänderungen sollen passende Prüfungen wählen. Alle tatsächlich kopierten Buildinputs (insbesondere tools/flipbase-extension/vinted-listing-runtime.js und marketplace-*-contracts.d.ts) müssen Auslöser erreichen. Überholte PR-Image-Läufe abbrechen, Hauptzweigveröffentlichungen nicht abbrechen.
Gezielte native Worker-Browsertests für geänderte Veröffentlichungs-/Formular-/Uploadfunktion in den Prüfweg aufnehmen; vorhandene test:browser-Dateien sinnvoll anhand Imports oder klaren Pfadgruppen auswählen. Keine echte Marketplace-Sitzung/Produktionsdaten verwenden, nur lokale Testmasken. Keine gleichzeitigen teuren Browser-Benchmarks mit Angular-Agent.
Root erstellt scripts/preflight.mjs und gemeinsame Befehle. Kommuniziere benötigte Schnittstellen und Skriptnamen früh. CI und Preflight sollen dieselben Auswahl-/Prüfbefehle verwenden; Root übernimmt finale Integration in ci.yml nach deiner Fertigmeldung. package.json nicht selbst ändern, benötigte Einträge melden.
Schritte: tatsächliche Docker-Inputs und vorhandene Prüfwege erfassen; Auswahl-/Gate-Gegenfälle gezielt absichern; minimale Zusammenführung; Actionlint, Auswahltests und verfügbare echte Image-/Workerchecks ausführen. Falls Docker nicht verfügbar, klar ausweisen, keinen Erfolg vortäuschen. Keine Commits/Pushes, keine docs/AI-CHANGELOG.md-Änderung.

- [x] Bestehenden Ablauf und konkrete Fehlerfälle prüfen.
- [x] Abgegrenzte Änderung mit passenden vorhandenen/gezielt ergänzten Tests umsetzen.
- [x] Verhalten und Auswahl prüfen, Ergebnisse und Grenzen dokumentieren.
- [x] Unabhängigen Review auswerten und notwendige Korrekturen prüfen.

## Task 4: Gemeinsamen Vorabcheck, Testbereinigung und Dokumentation integrieren

**Files:** package.json, scripts/preflight.mjs, scripts/preflight.test.mjs, docs/testing/README.md, docs/testing/lean-ci.md, docs/testing/affected-test-selection.md, docs/AI-CHANGELOG.md; belegte redundante Tests und nachgelagerte CI-Integration.

Root-Aufgabe. Einen lokalen Vorabcheck mit überprüfbarer Planansicht auf Basis derselben bestehenden Änderungserkennung und Testauswahl wie CI bereitstellen. Arbeitsverzeichnisänderungen und neue Dateien berücksichtigen; Git-Vergleich zum Merge-Base des Zielbranches, unbekannte Änderungen konservativ behandeln. Kein allgemeiner Komplettlauf bei jedem kleinen Push. Erforderliche fehlende Programme/Docker-Prüfungen klar als nicht bestanden/unvollständig ausweisen, nicht still erfolgreich überspringen. Dieselben ausgewählten Unit-/Browser-Kommandos, Worker-/Edge-/DB-/PWA-/Imagechecks wie CI verwenden. Ein Planmodus darf keine Prüfungen ausführen und muss erforderliche Schritte verständlich zeigen. Kindprozessfehler und Exitcodes weitergeben; keine ungewollten Produktionsverbindungen.
Bestehende passende npm-Skripte/Runner wiederverwenden; keine parallele allgemeine CI-Engine oder unnötige neue Abhängigkeit. Wirklich doppelte Prettier-Quelldateiprüfungen entfernen. Den SQL-Regex-Test nur entfernen/ersetzen, wenn die konkrete UUID-/Supplier-Regression auf Datenbankebene erhalten ist; sonst belegte Entscheidung dokumentieren.
Testing-Dokumentation auf den tatsächlichen neuen Ablauf, Kern-/Regressionsumfang, Ausnahmen und manuelle volle Regression vereinheitlichen. Alte Angaben sechs/250 verpflichtende Kernfälle und fehlende Auswahlmaschine ersetzen. README und Detaildoku auf eine klare Quelle ausrichten.
Final: gezielte Kontrakt-/Selektions-/Gate-Tests, echte ausgewählte Anwendungstests/Build, verfügbare Browser-/DB-/Imageprüfungen; neue Fälle nur für konkrete Auswahl-/Isolationsfehler. Unabhängiger Review aller Teilaufgaben und des Gesamt-Diffs; wichtige Befunde korrigieren und gezielt nachprüfen. Messwerte und Ausführungsgrenzen festhalten.

- [x] Bestehenden Ablauf und konkrete Fehlerfälle prüfen.
- [x] Abgegrenzte Änderung mit passenden vorhandenen/gezielt ergänzten Tests umsetzen.
- [x] Verhalten und Auswahl prüfen, Ergebnisse und Grenzen dokumentieren.
- [x] Unabhängigen Review auswerten und notwendige Korrekturen prüfen.

## Abschlussnachweis

Alle vier Aufgaben sind umgesetzt und unabhängig geprüft; Teilreviews sowie abschließender scoped Gesamtnachreview sind Approved. Der Gesamtreview führte zusätzlich zur expliziten Hostgrenze für privilegierte Marketplace-Imageprüfungen. Der breite Angular-Restlauf fand einen reproduzierbaren Bereinigungsfehler; lebende Fixtures werden jetzt vor dem Metadaten-Restore zerstört. Der gezielte Nachlauf mit 5 Dateien/55 Fällen ist grün. Der historische Restlauf mit 230 Dateien/2329 bestandenen Testkörpern und einer unbehandelten Ausnahme bleibt als fehlgeschlagen dokumentiert.

Erfolgreich: 2733 Nodefälle, 354 DOMfälle, die dokumentierten Angular-Verbraucher und gezielten Gegenfälle, 613 verfügbare Workflowfälle, 249 Deno- und 734 Workerfälle sowie 502 weitere Dienst-/Skriptfälle. Produktionsbau, Format, Lint, Typen, Suite-Audit, Actionlint und relevante Shellsyntax sind geprüft. Bestehende optionale Auslassungen und drei lokal ausgeschlossene Dockerfälle sind im Changelog ausgewiesen; Teilgruppen werden wegen Überschneidungen nicht addiert.

Echte Docker-, Datenbank- und Browserintegration ist in dieser Umgebung nicht ausführbar. Der erforderliche GitHub-Nachweis steht vor Merge aus. Kein vollständiger grüner Nach-Fix-Gesamtlauf oder garantierter Zeitgewinn behauptet. Umsetzung auf dem eigenen unveröffentlichten Branch; Push/PR/Merge benötigen die abschließende Nutzerfreigabe nach AGENTS.md.
