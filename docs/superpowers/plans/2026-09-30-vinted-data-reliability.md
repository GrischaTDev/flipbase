# Verlässliche Vinted-Abrufe – erstes Umsetzungspaket

**Goal:** Erfolgreiche Bereiche unabhängig übernehmen, unbekannte Bewertungen ehrlich anzeigen und Daten mit Abrufständen atomar speichern.

**Architecture:** Der Browser liefert pro Quelle `complete`, `partial` oder `failed`. Eine kontogebundene Datenbankfunktion prüft Zugriff und Identität innerhalb derselben Transaktion wie Einträge und Abrufstände. Der Auftragsstatus zeigt Teilfehler; ungelesene Gespräche werden weiterhin nicht geöffnet.

**Tech Stack:** Angular 22, TypeScript, bestehender Marketplace-Worker mit Playwright, Supabase/Postgres und pgTAP. Keine neuen Abhängigkeiten.

**Spec:** [Agentengeprüfter Gesamtplan](../../audit/2026-09-30-vinted-sync-listing-flow.md), Paket 1. Die anschließenden Pakete für Zeitsteuerung, Benachrichtigungen und Inserate bleiben eigenständige Änderungen.

## Global Constraints

- Bestehende Rechte: Plattformbetreiber und Workspace-Administrator. Keine Hintergrundberechtigung ohne Benutzeranmeldung in diesem Paket.
- Anmeldeverlust, entzogener Zugriff und nicht bestätigte Identität brechen den Abruf ab. Andere Quellenfehler werden getrennt erfasst.
- Fehlgeschlagene Quellen dürfen vorhandene Einträge nicht löschen. Vollständige leere Listen sind echte erfolgreiche Ergebnisse.
- Bewertungen ohne Sterne oder eindeutige Herkunft bleiben unbekannt. Text allein ist kein Beleg für Automatik.
- Keine Vinted-Veröffentlichung, Nachricht oder fremde lokale Datenbank ändern.
- Migrationen generieren; neue und bestehende Schemas gemeinsam abgleichen. Keine bestehenden Migrationen ändern.
- Änderungen auf eigenem `juna/vinted-data-reliability`-Zweig. Kein Push vor der vorgeschriebenen PR-Frage.

## Task 1: Quelle und Bewertungsdaten unterscheiden

**Files:** `services/marketplace-worker/src/vinted-account-import.ts`, zugehöriger Node-Test; Frontend `marketplace-read.models.ts`, `marketplace-response.ts` und `vinted-feedback-list` samt Tests.

**Interfaces:** Snapshot `areas` enthält `profile`, `publications`, `conversations`, `messages`, `sales`, `feedback`, jeweils `{status, failure?}`. `rating` ist `number | null`, `isAutomatic` ist `boolean | null`. Der Beobachtungszeitpunkt ist der Beginn des Abrufs nach Identitätsprüfung.

1. Regressionen für fehlende Sterne/Herkunft, Fehler in Bewertungen und unabhängigen Listen, begrenzte Pagination, einzelne Chatfehler und Zugriffsentzug schreiben.
2. Gezielt ausführen. **Expected:** Die neuen Regressionen schlagen beim bisherigen Verhalten fehl.
3. Bereichsergebnisse implementieren, erfolgreich gelesene Seiten/Chats behalten, ungelesene Gespräche auslassen und weitere Zugriffprüfungen erzwingen.
4. Node-Tests und betroffene Frontend-Tests ausführen. **Expected:** Alle bestehen.

## Task 2: Import atomar speichern

**Files:** `supabase/schemas/300_marketplace_import_reliability.sql`, `270_marketplace_operations.sql`, `config.toml`, neue Migration/pgTAP-Test/generierte Typen; `supabase-vinted-import-writer.ts` und Tests.

**Interfaces:** `marketplace_apply_vinted_import(p_workspace_id, p_connection_id, p_session_id, p_user_id, p_snapshot)` ist ausschließlich für den Serverdienst erreichbar (`security invoker`). Die Funktion prüft den tatsächlichen Sitzungsbesitzer und seine aktuellen Betreiber-/Administrationsrechte. Sie übernimmt genau einen Snapshot in einer Transaktion und liefert Zähler für `profile`, `publication`, `conversation`, `message`, `sale`. Neue `marketplace_account_sync_sources` halten die getrennten Abrufstände. `source_results` ergänzt den Auftragsstatus.

1. RPC-, Berechtigungs-, Teilfehler-, Leerlisten-, Veraltungs- und Rollback-Regressionen zuerst ausführen. **Expected:** Sie schlagen ohne neue Funktion fehl.
2. Schema und Funktion implementieren; Rechte, Sitzungsbesitzer und Ablauf innerhalb der Schreibtransaktion erneut prüfen. Den vorhandenen Benutzercheck weiterhin vor dem Serveraufruf ausführen.
3. Worker ersetzt unabhängige HTTP-Schreiboperationen durch den einzelnen RPC-Aufruf mit seinem Dienstschlüssel. Browsernutzer dürfen weder Quellenstände noch Kontoeinträge direkt erfinden.
4. Migration in eigener lokaler Prüfdatenbank erzeugen und ansehen; Typen neu erzeugen. **Expected:** Nur die geplanten Tabellen/Funktionen/Spalten ändern sich.
5. Datenbank- und Worker-Tests ausführen. **Expected:** Alle bestehen; kein Teilstand nach Fehler.

## Task 3: Teilfehler anzeigen und Gesamtergebnis prüfen

**Files:** `marketplace-sync-runner.ts`, `supabase-marketplace-operation-store.ts` und Tests; Frontend Sync-API, Fortschrittsdialog und Workspace samt Tests; `docs/AI-CHANGELOG.md`.

**Interfaces:** Ein erfolgreich gespeicherter Snapshot trägt die Bereiche im Auftragsstatus. Der Dialog zeigt fehlgeschlagene Bereiche und schließt bei Teilfehlern nicht automatisch. Erfolgreiche Kontodaten werden weiterhin neu geladen.

1. Tests für Weitergabe der Bereichsergebnisse und sichtbare Teilwarnung schreiben und fehlend beobachten.
2. Status und Anzeige implementieren; nur feste Bereichsnamen ohne Anbieterantworten ausgeben.
3. Worker-Suite, Typprüfung und Bau, gezielte Frontend-Tests, Angular-Bau, ESLint/Format sowie Schema-/Migrationsverträge ausführen. **Expected:** Alle erforderlichen Prüfungen bestehen.
4. Unabhängiges Abschlussreview und tatsächliche Ergebnisse im Changelog dokumentieren.
5. Geprüften Stand lokal erhalten und die vorgeschriebene PR-Frage stellen.

## Review Focus

Zugriffsentzug während mehrseitiger Abrufe; fremde Sitzung/Identität; veralteter Snapshot gegenüber neuer Cacheänderung; fehlgeschlagene Bewertung gegenüber erfolgreicher leerer Liste; teilweise gelesene Listen ohne Löschrecht; Chatfehler ohne Verlust anderer Chats; Rollback spät erkannter Fehler; keine erfundenen Sterne, Autoren oder Verkaufsergebnisse; ehrliche sichtbare Teilwarnungen.
