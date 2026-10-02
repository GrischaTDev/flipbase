# Beta-Registrierung und Laufzeiten: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sieben Tage gültige, widerrufbare Beta-Einladungen und Betreiberaktionen
zum Löschen offener Registrierungen sowie Verlängern und Beenden von Betas liefern.

**Architecture:** Die Beta verwaltet ihre Linkfrist selbst; Supabase behält Auth
und Passwortverwaltung. Gesperrte oder abgelaufene Zugänge werden auf dem Server
und in der Anwendung geprüft, die Anmeldung und eine Dankesseite bleiben erreichbar.
Externe Auth-Aktionen bekommen wiederholbare, auf dem Server gespeicherte Vorgänge.

**Tech Stack:** Angular 22, Signals, Tailwind, Supabase/Postgres, Deno, bestehende
Vitest-, pgTAP- und Playwright-Prüfungen. Keine neuen Produktabhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-10-02-beta-access-lifecycle-design.md`, vom Nutzer
am 02.10.2026 mit „dann los“ zur weiteren Umsetzung freigegeben.

## Globale Vorgaben

- Neue Beta-Links: genau sieben mal 24 Stunden; andere Auth-E-Mails unverändert.
- Verlängerung: positive ganze Tage von 1 bis 3650; aktive Beta ab bisherigem Ende,
  sonst ab aktuellem Serverzeitpunkt. Beendigung ist keine Kontolöschung.
- Deutsche UI und E-Mails in Du-Ansprache; Code und Dateien Englisch; Assistent Juna.
- Separate HTML-Dateien, OnPush, Signals und vorhandene Shared-Dialoge/-Buttons.
- `#fcc601` bleibt der Markenakzent; `docs/design/admin-ui-guidelines.md` beachten.
- RLS, explizite Grants und Operationen, leeres `search_path`, qualifizierte Namen.
- Keine Berechtigungsentscheidungen aufgrund nutzerveränderbarer Auth-Metadaten.
- Schema deklarativ; Migration per CLI erzeugen, bestehende Migrationen unverändert.
- Nur private Broadcast-Kanäle, Cleanup über DestroyRef, kein `postgres_changes`.
- Daten registrierter Konten bleiben erhalten. Keine produktive Löschung während
  der Umsetzung. Stripe, Pakete und Zahlungsabwicklung sind nicht enthalten.
- Worktree `C:/Users/Grisc/.codex/worktrees/beta-access-lifecycle/flipbase`,
  Branch `juna/beta-access-lifecycle`; ursprüngliche lokale Arbeit nicht anfassen.
- Vor Push die konkrete Abschlussfrage aus `AGENTS.md`; kein direkter Master-Push.

## Prüfschwerpunkte

1. Frist endet zwischen Öffnen und Passwortspeichern: Server lehnt die Aktivierung ab.
2. Auth-Konto ist gelöscht, Antwort oder Datenbankabschluss fällt aus: erneut löschen
   ist möglich und eine widerrufene Freigabe wird nicht reaktiviert.
3. Nutzer hat weitere nutzbare Arbeitsbereiche: diese bleiben zugänglich; ein alter
   Browserwert darf ihn nicht im abgelaufenen Arbeitsbereich festhalten.
4. Doppelklick, Timeout und parallele Registrierung/Löschung: eine Betreiberaktion
   wirkt genau einmal, die Registrierung und das Löschen können nicht beide gewinnen.
5. Dienst mit erhöhten Rechten oder bereits laufender Import: kein Geschäftszugriff
   nach Lizenzende, trotz weiterhin gültigem Anmeldetoken.

Die zugehörigen Fälle stehen in den Tests der Aufgaben 1 bis 7.

## Dateiverantwortung

- `supabase/schemas/350_beta_registration.sql`: Linkfristen, geschützte Link-Hashes,
  externe Vorgänge, Widerruf und Registrierung; bestehende Aktivierung anpassen.
- `supabase/schemas/355_beta_access.sql`: Lizenzaktionen, Zugangsauskunft, geschützte
  serverseitige Prüfung und Broadcast.
- `supabase/schemas/360_beta_business_access.sql`: abschließende Policy- und RPC-
  Definitionen für Geschäftsgrenzen. Erst nach den Zugangsfunktionen geladen;
  keine Vorwärtsverweise aus früheren Schema-Dateien auf noch fehlende Funktionen.
- `supabase/functions/_shared/beta-registration-link.ts`: Zufallslink, Hash und URL.
- `supabase/functions/beta-register/index.ts`: Linkprüfung und Passwortabschluss.
- `supabase/functions/beta-invite/pending-beta-withdrawal.ts`: Auth-Bereinigung.
- `supabase/functions/beta-invite/index.ts`: Betreiberaktionen und Einladungsversand.
- `src/app/core/services/workspace-access.service.ts`: aktueller Zugang, Zeitgrenze,
  Aktualisierung und privater Kanal; keine Kopie der Auth-Sitzung.
- `src/app/core/guards/workspace-access.guard.ts`: fachlicher Zugang nach Login.
- `src/app/features/auth/services/beta-registration.service.ts`: Beta-Link-Anfragen.
- `src/app/features/auth/beta-ended/beta-ended.component.{ts,html}`: Dankesseite.
- `src/app/features/platform-admin/models/beta-lifecycle-status.ts`: gemeinsame
  Statusanzeige für Bewerbungen und Nutzerübersicht.
- `src/app/features/platform-admin/components/beta-duration-dialog/`: gemeinsamer
  Dialog zum Verlängern und Beenden, separate TS-/HTML-Dateien.
- Bestehende Modelle, Dienste, Seiten und E-Mail-Vorlagen werden gezielt erweitert.

## Aufgabe 1: Frist, Widerruf und serverseitig bestätigte Registrierung

**Dateien:** Neu `supabase/schemas/350_beta_registration.sql`,
`supabase/tests/beta_registration_lifecycle.sql`; ändern `supabase/config.toml`
und `supabase/schemas/99_platform_admin.sql`.

**Schnittstellen:**

- `beta_applications`: am Ende `invitation_expires_at timestamptz`,
  `registration_link_kind text` (`legacy`/`managed`), `revoked_at timestamptz`,
  `withdrawal_user_id uuid`, `withdrawal_workspace_id uuid`,
  `withdrawal_status text` (`not_requested`/`revoked`/`auth_deleted`/`failed`),
  `withdrawal_last_error text`; die Löschkennungen bleiben ohne kaskadierenden FK.
- `public.beta_registration_links`: identity-ID, `application_id`,
  `token_hash`, `issued_at`, `expires_at`, `revoked_at`, `consumed_at`.
- `public.beta_lifecycle_operations`: identity-ID, eindeutige `request_id uuid`,
  `application_id`, `action`, `status`, `lease_id`, `lease_expires_at`,
  `result jsonb`, `created_at`; keine Passwörter, Rohlinks oder Sitzungstokens.
- Service-only RPCs `prepare_beta_invitation(p_application_id uuid,
  p_request_id uuid, p_token_hash text) returns jsonb`,
  `complete_beta_invitation(p_request_id uuid, p_sent boolean,
  p_error text) returns jsonb`, `begin_beta_registration(p_token_hash text,
  p_request_id uuid) returns jsonb`, `complete_beta_registration(p_request_id uuid,
  p_lease_id uuid) returns jsonb` und `inspect_beta_registration(p_token_hash text)
  returns jsonb`. Ergebnisse nennen `application_id`, `auth_user_id`,
  `workspace_id`, `lease_id`, `expires_at`, soweit für die Aktion erforderlich.

- [ ] pgTAP-Fälle schreiben: Hash nicht öffentlich lesbar; fehlender/widerrufener/
  ersetzter Link abgewiesen; bei `expires_at <= now()` ungültig; Frist beim
  Passwortabschluss erneut geprüft; doppelte `request_id` kein doppelter Beginn;
  `user_metadata` allein aktiviert keine Beta; unterbrochene Registrierung ohne
  abgeschlossenen Fachvorgang bleibt ohne Geschäftszugang.
- [ ] `npx supabase test db supabase/tests/beta_registration_lifecycle.sql` ausführen;
  die neuen Fälle müssen vor Implementierung fehlen beziehungsweise scheitern.
- [ ] Tabellen/RPCs mit Bewerbungssperre, genau einem aktiven Link und exklusivem
  Vorgang je Bewerbung implementieren. Registrierung und Rücknahme verwenden
  dieselbe Sperrgrenze; Lease und Frist werden beim Abschluss erneut geprüft.
  Der Aktivierungsbeleg kommt aus dem serverseitigen Vorgang, nicht aus Metadaten.
  Das bestehende `activate_beta_access()` darf keine neue Managed-Registrierung
  umgehen. Für Altlinks den gültigen Legacy-Pfad mit seiner bisherigen Frist erhalten.
- [ ] Legacy-Fristen nach dokumentiertem Produktionsstand aus dem tatsächlichen
  letzten Bestätigungs-/Einladungsversand mit 24 Stunden abbilden; keine sieben
  Tage rückwirkend. Bestehende bereits registrierte Betas unverändert erhalten.
  Neue Schema-Datei einmal nach ihren Abhängigkeiten in `schema_paths` registrieren.
- [ ] Tests nach der in Aufgabe 7 erzeugten Migration erneut ausführen;
  Schemaänderungen erst gemeinsam mit der erzeugten Migration committen.

## Aufgabe 2: Eigene Wochenlinks und Registrierung per Passwort

**Dateien:** Neu `supabase/functions/_shared/beta-registration-link.ts`,
dessen `.test.ts`, `supabase/functions/beta-register/index.ts` und `index.test.ts`,
`src/app/features/auth/services/beta-registration.service.ts` und `.angular.spec.ts`;
ändern `beta-invite/index.ts`, `beta-invite/index.test.ts`,
`_shared/beta-email-template.ts` und `.test.ts`, bestehende Passwortseite TS/HTML/Tests,
`supabase/config.toml`, `deploy/README.md`,
`scripts/beta-registration-boundary.test.mjs`.

**Schnittstellen:**

- `createBetaRegistrationToken(): string`: 32 kryptografisch zufällige Bytes,
  Base64url. `hashBetaRegistrationToken(token: string): Promise<string>`: SHA-256.
  `buildBetaRegistrationUrl(siteUrl: string, token: string): string`:
  `/auth/set-password#beta_token=...`; keine Rohlinks in Logs oder Betreiberantworten.
- Öffentliche Edge Function `beta-register`: POST `inspect` mit `token`,
  POST `complete` mit `token`, `password`, `acceptedTerms: true`, `requestId`.
  Prüfen liefert nur gültig/ungültig und Frist; Abschluss liefert nach erfolgreichem
  Fachabschluss eine Supabase-Sitzung. Antwort/Anfrage `no-store`, begrenzte Größe,
  CORS, keine Nutzerdaten bei ungültigem Link und begrenzte Fehlversuche.
- `BetaRegistrationService.inspect(token: string): Promise<{expiresAt: string}>`;
  `complete(token: string, password: string, requestId: string): Promise<void>`
  setzt die vom Server gelieferte Sitzung über den zentralen SupabaseService.

- [ ] Tests schreiben: sieben Tage, Hash statt Rohlink; Linkaufruf allein registriert
  niemanden; falsche Herkunft/zu große Anfrage/zu viele Versuche abgewiesen;
  Hash nicht in Mail, Mail nennt genaue Frist; Spätabschluss scheitert; derselbe
  abgeschlossene Vorgang aktualisiert ein Passwort nicht erneut.
- [ ] `deno test --allow-env supabase/functions/_shared/beta-registration-link.test.ts
  supabase/functions/beta-register/index.test.ts supabase/functions/beta-invite/index.test.ts
  supabase/functions/_shared/beta-email-template.test.ts` ausführen, Scheitern prüfen.
- [ ] Initiales vorbereitetes Auth-Konto ohne zusätzliche native Einladungsmail
  erzeugen; die vorhandene fachliche Kontoanlage bleibt erhalten. Für Annahme und
  Wiederholung eigene Beta-Mail versenden. Ein verlorenes Auth-Ergebnis anhand
  der serverseitigen Bewerbungsverknüpfung wiederaufnehmen; keine beliebigen
  bestehenden Konten anhand der E-Mail übernehmen.
- [ ] Abschluss über Aufgabe-1-Lease: Passwort und E-Mail-Bestätigung über Auth-Admin,
  danach Fachabschluss; erst danach über frisch erzeugte native Bestätigung und
  `verifyOtp` eine Sitzung liefern. Jede Stufe prüft Konto-ID und Lease. Kein
  Mailversand beim Abschluss. Teilfehler verändern keine Lizenz zu aktiv, solange
  der bestätigte Abschluss fehlt. Auth-Ban/Sperren vor Beginn respektieren.
- [ ] Passwortseite für neuen Hashpfad erweitern; bisherigen Supabase-Hashpfad und
  Passwortänderung im Review-Modus erhalten. Token sofort aus sichtbarer URL in
  den Arbeitsspeicher übernehmen; keine Wiederverwendung für andere Konten.
  Edge-/Angulartests erneut grün prüfen und Deploy-Anleitung um Endpunkt ergänzen.

## Aufgabe 3: Offene Freigabe zurückziehen und vollständig löschen

**Dateien:** Neu `supabase/functions/beta-invite/pending-beta-withdrawal.ts` und
`.test.ts`; ändern `350_beta_registration.sql`, `beta_registration_lifecycle.sql`,
`beta-invite/index.ts` und `index.test.ts`.

**Schnittstellen:** Betreiberaktion `withdraw` mit `applicationId`, `requestId`.
RPCs `begin_pending_beta_withdrawal(p_application_id uuid, p_request_id uuid)
returns jsonb`, `mark_pending_beta_auth_deleted(p_request_id uuid) returns void`,
`complete_pending_beta_withdrawal(p_request_id uuid) returns uuid`,
`fail_pending_beta_withdrawal(p_request_id uuid, p_error text) returns void`.
Antwort nach vollständigem Erfolg `{deletedApplicationId: string}`.

- [ ] Tests schreiben: früh und nach Ablauf löschbar; registrierte Konten, weitere
  Mitglieder, Betreiber und Geschäftsdaten abgewiesen; Widerruf vor Auth-Löschung;
  Auth-Fehler und verlorene Erfolgsantwort wiederholbar; ursprüngliche IDs bleiben
  nach FK-`set null` vorhanden; neue Bewerbung mit gleicher E-Mail funktioniert.
- [ ] Edge-Testdateien ausführen, pgTAP-Fälle nach Migration in Aufgabe 7 ausführen.
- [ ] Anfangs-RPC prüft Rolle und vorbereitete Kontoanlage, speichert Auth-/Workspace-ID,
  widerruft Links und sperrt Aktivierung. Unbenutztheit anhand der vorhandenen
  `prevent_workspace_with_business_data_deletion()`-Grenze und Mitglieder-/Rollen-
  Prüfung feststellen; nicht anhand des bloßen Login-Zeitpunkts.
- [ ] Auth-Konto löschen; „bereits nicht vorhanden“ ausschließlich bei gespeicherter,
  geprüfter Ziel-ID als wiederaufnehmbaren Erfolg behandeln. Abschluss-RPC prüft
  erneut unbenutzte Struktur, entfernt diese und zuletzt die Bewerbung atomar.
  Andere Daten niemals als Aufräummaßnahme löschen. Bei Teilfehler bleibt eine
  sichtbar widerrufene Bewerbung mit wiederholbarer Löschaktion bestehen.
- [ ] Parallele `complete`-/`withdraw`-Anfragen prüfen: genau ein Vorgang gewinnt;
  bereits abgeschlossene Registrierung wird niemals von diesem Weg gelöscht.

## Aufgabe 4: Laufzeitaktionen und vollständige Servergrenze

**Dateien:** Neu `supabase/schemas/355_beta_access.sql`,
`supabase/schemas/360_beta_business_access.sql`,
`supabase/tests/beta_access.sql`, `docs/audit/2026-10-02-beta-access-boundaries.md`;
ändern `beta-invite/index.ts`/Tests,
`supabase/config.toml`. Edge-Dateien mit Geschäftszugriff:
`barcode-ai-search/index.ts`, `article-media-cleanup/index.ts`,
`vinted-brand-search/handler.ts`, `ebay-account/handler.ts`,
`ebay-account/order-import.ts`, `beta-discord/index.ts` und deren Tests.

**Schnittstellen:** `public.workspace_license_allows_access(p_workspace_id uuid)
returns boolean` als interne Lizenzprüfung; `public.can_access_workspace(ws_id uuid)
returns boolean` verbindet Mitgliedschaft und Lizenz; `public.list_my_workspace_access()
returns table(workspace_id uuid, access_state text, ends_at timestamptz,
ended_at timestamptz, server_now timestamptz)`. Zustände:
`active`, `pending_registration`, `registration_expired`, `expired`, `ended`, `suspended`.
`public.change_beta_duration(p_application_id uuid, p_request_id uuid,
p_action text, p_days integer) returns public.workspace_licenses`, Aktion `extend`/`end`.
`workspace_licenses.ended_at timestamptz` hält bewusstes Beenden getrennt von Sperren.
`public.list_platform_user_beta_access() returns table(user_id uuid,
application_id uuid, invitation_expires_at timestamptz, revoked_at timestamptz,
withdrawal_status text, ended_at timestamptz)` ergänzt die vorhandene Betreiber-
Nutzerauskunft, ohne deren bestehende Rückgabetypen aufzubrechen.

- [ ] pgTAP schreiben: unberechtigter Betreiberaufruf scheitert; +3 Tage vor Ende
  verlängert exakt um 72 Stunden; nach Ende ab Serverzeit; Werte 0/1.5/3651
  abgewiesen; doppelte Anfrage wirkt einmal; `end` sperrt bei bestehendem JWT;
  unabhängig `suspended` bleibt gesperrt; Auskunft ohne Geschäftszugriff erreichbar.
- [ ] Grenzen im Audit vollständig erfassen: RLS auch über Elternbeziehungen,
  SECURITY-DEFINER-RPCs, Storage, Realtime und Service-Role-Edge-/Workerzugriffe.
  Reine Mitgliedschafts-/Profil-/Lizenzauskunft bleibt erreichbar; Geschäftsgrenzen
  nutzen `can_access_workspace`. Bestehende `is_workspace_member/admin` nicht
  umdefinieren. Für jede Grenze mindestens einen negativen Direktzugriff testen.
  Geänderte Policy-/RPC-Enddefinitionen in `360_beta_business_access.sql` nach
  den Zugangsfunktionen deklarieren; ausdrücklich benannte Policies ersetzen,
  keine zusätzliche permissive Policy als vermeintliche Sperre hinzufügen.
- [ ] Bestehende unlizenzierte Nicht-Beta-Arbeitsbereiche mit explizitem `manual`
  Bestandszugang erhalten. Fehlende Lizenz nicht pauschal erlauben.
  `create_workspace(p_name text)` so begrenzen, dass ein pending/abgelaufener
  Beta-Nutzer sich keinen neuen manuellen Zugang erzeugt. Weitere gültige
  Arbeitsbereiche und Betreiberrecht in eigener serverseitiger Regel berücksichtigen.
- [ ] Worker-RPCs `marketplace_sync_dispatch_claim`, `marketplace_sync_validate`,
  `marketplace_apply_vinted_sync_import`, `marketplace_sync_finish` und
  `ebay_lock_import_connection` prüfen Lizenzzeit unabhängig von `auth.uid()`.
  Ausgelaufene Aufträge beenden und Browserressourcen freigeben; Cleanup- und
  externe eBay-Löschmitteilungen bleiben auch ohne aktive Beta ausführbar.
- [ ] Änderungen über `workspace:<id>:access` privat mit `access_changed` senden.
  Ereignis enthält nur Anlass/Workspace-ID; Clients lesen aktuellen Serverstand.
  Zugriffsprüfung bei natürlichem Ende benötigt kein periodisches Datenbankupdate.
  DB-/Edge-Tests nach Aufgabe 7 grün und Audit ohne ungeprüfte Geschäftsgrenze.

## Aufgabe 5: Übersicht, Friststatus und Betreiberdialog

**Dateien:** Neu `features/platform-admin/models/beta-lifecycle-status.ts`/`.spec.ts`,
`components/beta-duration-dialog/beta-duration-dialog.component.{ts,html}` und
`.angular.spec.ts`; ändern die bestehenden Beta-/PlatformUser-Modelle und Dienste,
beide Übersichtsseiten TS/HTML/Tests sowie gemeinsame Übersetzungen.
Alle genannten Feature-Pfade liegen unter `src/app/`.

**Schnittstellen:** `betaLifecycleStatus(application: BetaApplication,
now: number): {label: string; tone: BadgeTone}`. Modelle enthalten
`invitationExpiresAt`, `revokedAt`, `withdrawalStatus`, `endedAt`, Nutzer zusätzlich
`applicationId`. `BetaApplicationService.withdraw(id: string, requestId: string)
returns Promise<void>` und `changeDuration(id: string, days: number | null,
action: 'extend' | 'end', requestId: string): Promise<BetaApplication>`.
Dialoginputs `application`, `processing`, `error`, Outputs
`extend: number`, `end: void`, `closed: void` mit modernen Angular-Funktionen.

- [ ] Status-/DOMtests schreiben: offene Frist „Wartet auf Registrierung“, exakt
  am Ende „Registrierungsfrist abgelaufen“; neuer Versand aktualisiert die Frist;
  erneutes Senden auch bei `sent`; Freigabe vor und nach Ablauf löschbar;
  abgebrochener Dialog verändert nichts; widerrufener Teilfehler zeigt Wiederholung.
- [ ] Betroffene Vitest-Projekte gezielt ausführen und das anfängliche Scheitern prüfen.
- [ ] Gemeinsame Statusfunktion in beiden Übersichten verwenden. Zeit-Signal mit
  DestroyRef-Cleanup aktualisieren; Timer schlafen lassen, wenn Seite verborgen.
  Serverzeiten und lokale Anzeige unterscheiden. Vorgangs-ID bis zum endgültigen
  Ergebnis behalten, Buttons während Anfrage sperren, Listen nach Erfolg neu laden.
- [ ] Dialog mit Enddatum-Vorschau, Tagesfeld und zusätzlicher Beendigungsbestätigung
  implementieren; UI zeigt endgültiges Server-Enddatum. Bestehende Bestätigungs-
  und Modal-Komponenten für Fokus, Escape, Abbrechen und Fehler verwenden.
- [ ] Tests für beide Seiten, Dienst und Dialog grün; Tastatur/Fokus und AXE prüfen,
  keine zusätzliche CSS-Datei. Format und Shared-UI-Prüfung durchführen.

## Aufgabe 6: Login erhalten, Anwendung sperren und Dankesseite anzeigen

**Dateien:** Neu `src/app/core/models/workspace-access.model.ts`,
`src/app/core/services/workspace-access.service.ts`/`.angular.spec.ts`,
`src/app/core/guards/workspace-access.guard.ts`/`.angular.spec.ts`,
`src/app/features/auth/beta-ended/beta-ended.component.{ts,html}`/`.angular.spec.ts`;
ändern `app.routes.ts`, `core/services/workspace.service.ts`/Tests,
`core/guards/workspace-setup.guard.ts`/Tests, Login TS, Übersetzungen
und die neue Registrierung aus Aufgabe 2.

**Schnittstellen:** `WorkspaceAccessService.ensureLoaded(): Promise<void>`,
`refresh(): Promise<void>`, readonly Signals `access`, `loading`, `error`,
computed `usableWorkspaceIds` und `betaEndedReason`. Auth-Sitzung bleibt im
SupabaseService/AuthService. `workspaceAccessGuard: CanActivateFn` prüft vor
geschäftlicher Route; Dankesseite nutzt nur echte Anmeldung als Voraussetzung.

- [ ] Guard-/Servicetests schreiben: Login bleibt möglich, Ende führt zur Dankesseite;
  pending Registrierung führt zum Abschluss, natürliche Frist zur passenden
  Fehlermeldung; Netzwerkfehler erlaubt keinen Geschäftszugriff und wird nicht
  fälschlich als Beta-Ende angezeigt; weitere gültige Workspace-ID bleibt nutzbar.
- [ ] Gezielte Angular-Tests ausführen, anfängliche Fehler dokumentieren.
- [ ] Geschäftsroute zusätzlich schützen; Plattform-Admin und Dankesseite getrennt
  halten. Workspace-Auswahl mit erlaubten IDs abgleichen und gespeicherte
  abgelaufene Auswahl korrigieren. Nach Registrierung Zugangsauskunft aktualisieren.
  Kontrolliertes Laden verhindert Start-Rennen und Weiterleitungsschleifen.
- [ ] Privaten Broadcast und Zeitgrenze abonnieren, nach Fokuswechsel neu lesen;
  laufenden Kanal/Timer über DestroyRef entfernen und bei Nutzerwechsel alte
  Antworten verwerfen. Vorhandene Datenansicht bei Zugangsentzug verlassen.
- [ ] Dankesseite mit festgelegter Du-Ansprache, DE/EN und Abmelden implementieren.
  Guards, Arbeitsbereichwechsel, Login, Fristablauf und AXE grün prüfen.

## Aufgabe 7: Migration erzeugen und Gesamtablauf nachweisen

**Dateien:** Neue, ausschließlich erzeugte Migration unter `supabase/migrations/`,
neu erzeugte `src/app/core/models/supabase.types.ts`; ändern
`e2e/beta-registration.spec.ts`, neu `e2e/beta-access-lifecycle.spec.ts`,
`scripts/beta-registration-boundary.test.mjs`, `deploy/README.md`,
`docs/AI-CHANGELOG.md`; Testauswahl in `playwright.pr.config.ts` falls erforderlich.

- [ ] Supabase-CLI über `--help` prüfen. Für diesen Worktree eine getrennte lokale
  Datenbank verwenden; keine gemeinsam benutzten Container stoppen oder zurücksetzen.
  Mit Projektverfahren `supabase stop` und `supabase db diff -f beta_access_lifecycle`
  die Migration erzeugen. Erzeugtes SQL vollständig prüfen: transaktional, keine
  eigenen Transaktionen/externen Befehle, vorhandene Migrationen unverändert.
- [ ] Neue Migration in isolierter DB anwenden, Typen mit dem Projektbefehl
  `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts`
  neu erzeugen. `npm run test:db` für passende Tests und betroffene Nachbarbereiche;
  registrierte Seeds/Bestand und nicht-Beta-Accounts auf unveränderten Zugang prüfen.
- [ ] Browserfälle schreiben und ausführen: Annahme → neue Mail → Passwort → aktive
  Beta; Woche abgelaufen → erneut senden → Abschluss; zurückziehen → alter Link
  ungültig → gleiche E-Mail neu bewerben; Verlängerung und sofortiges Beenden in
  einer zweiten geöffneten Sitzung; weiterer gültiger Arbeitsbereich; Teilfehler
  bei Auth-Löschung wiederholen. `npx playwright test e2e/beta-registration.spec.ts
  e2e/beta-access-lifecycle.spec.ts` im bestehenden lokalen Testaufbau ausführen.
- [ ] Geänderte Dateien formatieren, Lint, Typecheck, Angular-Bau, betroffene Edge-
  und Anwendungstests, Shared-UI und Schema-/Migrationsprüfungen ausführen.
  Weil Zugangsschutz viele Grenzen integriert, einmal `npm run verify` mit
  erfasstem echtem Exitcode ausführen. Nur bei neuen Änderungen/Fehlern wiederholen.
  Unabhängige Schlussprüfung gemäß gewählter Ausführung durchführen; Funde beheben.
- [ ] Changelog mit tatsächlichen Ergebnissen ergänzen, selbst geprüften Umfang und
  Grenzen melden. Kleine zusammenhängende Commits unter konfiguriertem Nutzer,
  keine KI-Signatur. Erst dann fragen: „Soll ich jetzt den PR erstellen und nach
  erfolgreichen Tests mergen?“ Keine Veröffentlichung vorher.

## Ausführung und aktueller Stand

Empfehlung: Umsetzung durch die Hauptsitzung, abschließend eine unabhängige
Prüfung. Die Aufgaben teilen viele Datenbank- und Auth-Schnittstellen; ein
durchgängiger Umsetzer vermeidet widersprüchliche Zwischenstände. Getrennte
Umsetzungs- und Prüfassistenten je Aufgabe sind möglich, wenn der Nutzer das wählt.

Noch keine Produktänderung. Plan wurde gegen den freigegebenen Entwurf geprüft:
Frist, Wiederversand, Löschung, Teilfehler, Laufzeitaktionen, weiterer Workspace,
Bestand, Servergrenze, geöffnete Sitzung, Dankesseite und Veröffentlichung sind
jeweils einer Aufgabe und passenden Prüfungen zugeordnet.
