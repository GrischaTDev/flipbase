# Automatische Vinted-Abrufe – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bewusst freigegebene Vinted-Leseabrufe je Konto auch bei geschlossener App zuverlässig ausführen und ihren Zeitplan verständlich anzeigen.

**Architecture:** Ein gemeinsamer Dispatcher übernimmt dauerhaft autorisierte manuelle und geplante Leseaufträge. Die Datenbank reserviert Auftrag, Browsersitzung und globale Kapazität zusammen; aktuelle Rechte und Sperrversion werden vor Anbieteranfragen und in der Importtransaktion geprüft. Interaktive Anmeldung und Schreibaktionen behalten ihren bestehenden Nutzerzugriff.

**Tech Stack:** Bestehendes Angular, Supabase/Postgres, Node-Worker und GoLogin; keine neuen Abhängigkeiten.

**Spec:** [Geprüfter Gesamtplan](../../audit/2026-09-30-vinted-sync-listing-flow.md), Paket 2; Paket 1 ist über PR #267 bereits integriert und veröffentlicht.

## Global Constraints

- Ein Worker und höchstens ein aktiver oder ungeklärt zu stoppender Browser weltweit im Pilot.
- Standard und zunächst freigegebenes Intervall: 15 Minuten. Das Modell berücksichtigt 5/10 Minuten; Aktivierung erst nach belastbarer Kapazitäts- und Laufzeitmessung.
- Automatik bleibt ohne bewusste Kontofreigabe und ohne serverseitige Aktivierung ausgeschaltet.
- Keine Nutzer-JWTs, Anbieter-Cookies oder privaten Vinted-Inhalte in Aufträgen, Logs oder Testartefakten speichern.
- Nur Plattformbetreiber mit aktueller Owner-/Adminrolle in einem aktiven Workspace dürfen freigeben; diese Rechte gelten auch beim späteren Lauf.
- Alte manuelle RPC-Signaturen bleiben während des getrennten Web-/Worker-Rollouts kompatibel.
- SQL deklarativ, Migration automatisch erzeugen und prüfen, Typen automatisch erneuern; keine produktiven Anbieteraktionen als lokale Tests.
- Eigener Zweig `juna/vinted-scheduled-sync`, Shared-UI, separate Templates, Signals, OnPush und deutsche Du-Texte.

## Review Focus

- Widerruf oder Rollenverlust zwischen Claim und Import verhindert weitere Anbieteranfragen und die Datenübernahme.
- Ein zweiter Worker darf gültige fremde Lebenszeichen weder übernehmen noch durch Recovery unterbrechen.
- Eine ungeklärte Browserbeendigung hält Kontosperre und globale Kapazität besetzt, auch nach Ablauf der Lease.
- Neue manuelle Leseaufträge brauchen nach ihrer einmaligen echten Autorisierung kein gespeichertes JWT; alte wartende Aufträge erhalten keine neue Freigabe.
- Worker-/Nutzer-/Workspacewechsel und verspätete Antworten dürfen keine fremden Kontodaten oder vermeintlich aktive Automatik anzeigen.

## Gemeinsame Schnittstellen

Die genaue SQL-Schnittstelle wird vor den jeweiligen Implementierungen in der auftragseigenen Datei `.superpowers/sdd/2026-10-01-vinted-scheduled-sync/database-contract.md` festgehalten. Sie enthält Argumente, gebundene Scopewerte und feste JSON-Felder; Änderungen werden mit Worker und Oberfläche abgestimmt.

Authentifizierte Oberfläche:

- `marketplace_read_sync_schedule(p_workspace_id, p_connection_id)` liefert den kanonischen Kontozeitplan.
- `marketplace_set_sync_schedule(p_workspace_id, p_connection_id, p_enabled, p_interval_minutes, p_authorization_version)` prüft die erwartete Freigabeversion und liefert den bestätigten Stand.
- Rückgabe: `workspaceId`, `connectionId`, `enabled`, `intervalMinutes`, `nextDueAt`, `lastAttemptAt`, `lastSuccessAt`, `pausedReason`, `retryAfter`, `authorizationVersion`. Fehlender Zeitplan bedeutet aus, 15 Minuten, Version 0.

Serverdienst:

- `marketplace_worker_claim`, `marketplace_worker_heartbeat` und `marketplace_worker_release` binden einen Prozess an die einzige Runtimezeile und eine steigende `workerEpoch`.
- `marketplace_sync_dispatch_claim(workerId, workerEpoch, runnerId, includeScheduled)` liefert höchstens einen bereits atomar reservierten Leseauftrag mit `operationId`, Kontoscope, `runnerId`, Autorisierungsart/-version, `sessionId`, `expiresAt` und `absoluteExpiresAt`.
- `marketplace_sync_check`, `marketplace_sync_heartbeat`, `marketplace_sync_progress`, `marketplace_sync_finish` und `marketplace_apply_vinted_sync_import` prüfen die gespeicherte Bindung aus Auftrag, Besitzer und Epoch.
- `marketplace_sync_recover` behandelt alte wartende und unterbrochene laufende Aufträge erst nach Browserrecovery; neue autorisierte wartende Aufträge bleiben erhalten.
- `/healthz` ergänzt `scheduledSync: { enabled, authorizationVersion: 1, allowedIntervals: [15] }`. Die Fähigkeit ist nur bei laufendem Dispatcher und bewusst aktiviertem Cloudbetrieb verfügbar; die bisherige `apiVersion: 2` allein belegt sie nicht.

## Task 1: Zeitplan, Freigaben und atomare Claims

**Files:** neue `supabase/schemas/310_marketplace_sync_scheduling.sql`; bestehende Schemas `260_marketplace_live_browser_sessions.sql`, `270_marketplace_operations.sql` und gegebenenfalls Importprüfung in `300_marketplace_import_reliability.sql`; `supabase/config.toml`; neue `supabase/tests/marketplace-sync-scheduling.test.sql`; automatisch erzeugte Migration und `src/app/core/models/supabase.types.ts`.

**Interfaces:** Produziert den gemeinsamen RPC-Vertrag. `marketplace_sync_enqueue` behält seine Signatur und autorisiert ausschließlich neue einmalige manuelle Leseaufträge. Neue Felder bleiben für alte Datensätze nullable.

- [x] Fehlende RPCs, fremde Konten, fehlende Betreiberrolle und nicht verbundene Konten zuerst durch fehlschlagende pgTAP-Verhaltensprüfungen nachstellen.
- [x] Zeitplan und Runtime mit RLS, expliziten Grants/Policies und Indizes implementieren; ausgeschalteter Anfangsstand, Versionenkonflikt und 15-Minuten-Grenze prüfen.
- [x] Manuelle Priorität, zusammengefasste verpasste Zyklen, zwei Konten, doppelte Claims, globale Kapazität einschließlich interaktiver Sitzungen und ungeklärter Stopps testen.
- [x] Heartbeat: 90 Sekunden erneuerbare Lease, höchstens die bestehende absolute Zehn-Minuten-Grenze; veraltete Besitzer/Epochs verlieren alle Schreibrechte auf den Auftrag.
- [x] Betreiber-/Mitgliedschafts-/Workspace-/Kontorechte sowie Freigabeversion innerhalb der Importtransaktion erneut sperren und prüfen; Widerruf während des Laufs abnehmen.
- [x] Alle betroffenen Marketplace-Datenbanksuiten ausführen, Migration mit CLI erzeugen und vollständig reviewen, Typen automatisch generieren.

## Task 2: Gemeinsamer Dispatcher und begrenzter Browserbetrieb

**Files:** neue `services/marketplace-worker/src/marketplace-sync-dispatcher.ts` und `supabase-marketplace-sync-dispatch-store.ts` mit Tests; vorhandener Sync-Runner, Operations-/Browserstore, Broker, Recovery, Importwriter, HTTP-API, Serverkonfiguration und `main.ts`; passende bestehende Worker-Tests und Konfigurationsvorlage.

**Interfaces:** Konsumiert Task 1. Internes `syncRead`-Scope ist auf den gespeicherten Leseauftrag begrenzt; öffentliche HTTP-Anfragen erzeugen ausschließlich die bisherigen interaktiven Scopes. Der Browserstore verwendet für einen Claim dessen bereits reservierte Sitzung.

- [x] Dispatcher mit künstlicher Uhr zuerst rot prüfen: manuelle Aufträge zuerst, zwei Konten isoliert, keine Doppelstarts, Neustart und abgelaufenes Nutzer-JWT nach echter Einmalfreigabe.
- [x] Runtime vor jeder Recovery beanspruchen; Heartbeat und Verlust der Runtime verhindern weitere Starts. Zweiter Prozess führt keine Providerstopps aus.
- [x] Sync-Runner wiederverwenden, jede weitere Anbieteranfrage und den atomaren Import über den gebundenen Leseauftrag prüfen; Edit-/Loginpfade dürfen kein Hintergrundscope akzeptieren.
- [x] Auftragsheartbeat und erneuerbare Browsersperre bis zur absoluten Grenze abnehmen; unklarer Stopp gibt keinen neuen Browser frei.
- [x] Feste Pausengründe und begrenzte Wiederholungen für Anmeldung, Prüfung, Anbieterablehnung, Rate-Limit, Netz- und Serverfehler persistieren; auch relevante Quellen-Teilfehler beeinflussen den nächsten Termin.
- [x] Serverflag `MARKETPLACE_SCHEDULED_SYNC_ENABLED` standardmäßig aus; Dispatcher führt manuelle Aufträge unabhängig davon aus. Healthfähigkeit entspricht dem tatsächlichen Betriebsstand.
- [x] Worker-Tests, Typprüfung und Build ausführen; Logs enthalten ausschließlich feste Zustände, Laufzeiten und Auftragkennungen.

## Task 3: Bewusste Kontoaktivierung und Statusanzeige

**Files:** neue Modelle, `marketplace-sync-schedule-api.service.ts`, lokaler Zeitplanstore und Feature-Komponente `vinted-sync-schedule`; Einbindung in `vinted-workspace.component.html/.ts`; gezielte Angular-/Parserprüfungen und gemeinsamer Marketplace-Browserfall.

**Interfaces:** Konsumiert die beiden authentifizierten Zeitplan-RPCs und die neue Healthfähigkeit. Fehlende oder ungültige Fähigkeit verhindert Aktivierung; Deaktivierung bleibt über die Datenbank möglich.

- [x] Ohne Kontofreigabe, beim Öffnen und bei altem Worker darf keine Aktivierung stattfinden; diese Fälle zuerst rot testen.
- [x] Shared-Karte, Select/Button/Status und zugängliche Statusanzeige verwenden; bewusstes Aktivieren/Pausieren, nächste Fälligkeit, letzter Versuch/Erfolg und Pausengrund anzeigen.
- [x] Doppelklick, Konfliktversion, Lese-/Schreibfehler, pausiertes Konto und verspätete Antworten nach Nutzer-/Workspace-/Kontowechsel testen.
- [x] Browserfall mit künstlichen Antworten für Tastatur, Mobilansicht, Aktivierung/Pause und AXE abnehmen; ausdrücklich in die PR-Pflichtauswahl aufnehmen.

## Task 4: Integration, unabhängiges Review und Rolloutvertrag

**Files:** `docs/AI-CHANGELOG.md`, Worker-/Rolloutdokumentation, dieser Plan, gegebenenfalls `.github/workflows/ci.yml` und `scripts/playwright-pr-smoke.test.mjs` für neue verpflichtende Testfälle.

- [x] Teilpakete gegen Spec und Schnittstellen unabhängig prüfen; funktionale Befunde zuerst als fehlschlagende Regression nachstellen und beheben.
- [x] Geänderte Dateien formatieren/linten; relevante SQL-/Worker-/Angular-Tests, App-/Worker-Typprüfung und beide Bauten erfolgreich abschließen.
- [x] Messungen aus künstlichen Tests von realen Anbieter-/Cloudnachweisen trennen; 5/10 Minuten und echte Kontopilotaktivierung nicht als bereits abgenommen ausgeben.
- [x] Alte Worker-Kompatibilität nach Migration und ausgeschalteten Zustand bis zum getrennten Worker-Rollout dokumentieren; kein automatisches Löschen von Zeitplänen oder ungeklärten Aufträgen beim Rückweg.
- [x] Erst nach fertiger lokaler Abnahme die verbindliche PR-/Merge-Frage aus `AGENTS.md` stellen.
