# Gemeinsames Vinted-Cloud-Postfach: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lokale und Cloud-Konten erhalten dasselbe nutzbare Postfach mit Eingangsmeldungen in der Glocke, bestätigtem Chatversand und vorhandenen Favoriten-Antworten samt Angeboten.

**Architecture:** Oberfläche, Daten und dauerhafte Aufträge bleiben gemeinsam. Die Extension übernimmt lokale Aufträge, der bestehende Cloudworker übernimmt separat autorisierte Cloud-Schreibaufträge im bestätigten Chromium-Profil. Eingangsereignisse werden unabhängig vom Öffnen ungelesener Gesprächsdetails übernommen und dauerhaft dedupliziert.

**Tech Stack:** Bestehendes Angular 22, Signals, Supabase/Postgres 17, private Broadcasts, Node-Worker, Playwright und Manifest-V3-Extension; keine neue Abhängigkeit.

**Spec:** [Bestätigter Ausbauentwurf](../specs/2026-10-08-vinted-cloud-inbox-design.md).

## Globale Vorgaben

- Gemeinsame Gesprächsseite; kein neues GoLogin-Abonnement oder Browseranbieterwechsel.
- Pro Konto genau ein Ausführer und höchstens eine Browseraktion; Profil und Proxy bleiben kontogebunden.
- Maximal 5.000 Zeichen und ein JPEG-/PNG-Bild nach Komprimierung mit maximal 256 KiB.
- Zustände bleiben `queued`, `claimed`, `sending`, `sent`, `failed`, `outcome_unknown` und `cancelled`.
- Automatische Abgleiche öffnen keine ungelesenen Gesprächsdetails; Zeitstempeländerung allein ist kein Eingangsereignis.
- Erstabgleich setzt einen Referenzstand; alte Historie erzeugt keine neuen Glockenmeldungen.
- Cloud-Versandfreigabe bleibt von Extension-Grants und von `syncRead` getrennt.
- Keine automatische Wiederholung nach unklarem Versand; Freigabe- und Betriebswechsel starten keine alten Versuche erneut.
- Bestehende Hintergrundintervalle und Pausen bleiben erhalten; manuelle Aktionen benötigen keine aktivierte Hintergrundautomatik.
- Favoritenregeln werden je Konto bewusst aktiviert; Angebote folgen nur auf bestätigte Favoritennachrichten.
- Deutsche UI, Kommentare und Dokumentation; englische Bezeichner und Conventional Commits; Assistentenname Juna.
- Keine Nutzer-/Proxygeheimnisse oder privaten Nachrichten in Fixtures, Logs oder Commits.
- Neue Tabellen mit RLS und getrennten Policies; Migrationen erzeugen, SQL prüfen und API-Typen aus der laufenden lokalen Datenbank erzeugen.
- Keine Tests gegen Produktion. Echtkonto-Abnahme mit Maike Vintage; tatsächlicher Versand erst mit festgelegtem Empfänger und Inhalt.

## Besondere Prüfpunkte

1. Ein neuer Eingang bei bereits ungelesenem Gespräch muss erkannt werden; derselbe Zeitstempel oder ein eigener Versand darf keinen falschen Eingang erzeugen. Aufgabe 1 und 5.
2. Eine Antwort auf eine alte Einreihungsanfrage darf nach Konto-/Arbeitsplatzwechsel weder einen fremden Entwurf leeren noch fremde Meldungen anzeigen. Aufgabe 6.
3. Ein Worker kann nach Versandbeginn sterben, obwohl Vinted die Nachricht schon angenommen hat; Recovery darf nicht erneut senden. Aufgabe 2 bis 4.
4. Ein neuer Ausführer darf nach Profilwechsel keinen alten Claim oder Erfolg für das neue Konto verwenden. Aufgabe 2, 4 und 7.
5. Abgeschnittene Ereignisse, verschobene Seiten und verpasste Broadcasts dürfen weder den Referenzstand voreilig abschließen noch bekannte Daten löschen. Aufgabe 1, 5 und 8.

## Arbeitsstand und Reihenfolge

Arbeitsverzeichnis: `C:\Users\gt\.codex\worktrees\cloud-login-warning-reset\flipbase`, eigener Zweig `juna/cloud-login-warning-reset`.
Die vorbereiteten Commits `735543d5` und `becf2ea1` bleiben enthalten. Vor der Implementierung aktuelle Artefakte und `origin/master` lesen; fremde Zweige und Nutzeränderungen erhalten. Keine parallele zweite Worker-Laufzeit oder ungefragte globale Schreibfreigabe einführen.

Der Plan beschreibt zusammenhängende Teile eines Postfachablaufs. Der Ereignisnachweis ist die erste Voraussetzung; Versand, Benachrichtigung und Favoriten nutzen danach dieselbe Kontoausführung und Rechteprüfung. Ein Zwischencommit ist kein Nachweis der gesamten Funktion.

## Zuständigkeiten der Dateien

| Bereich                  | Bestehend erweitern                                                       | Neue Verantwortung                                                    |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Belegter Ereignisvertrag | Extension-Core, lokaler Edge-Handler, gemeinsamer Cloud-Leser             | Gemeinsamer normalisierter Ereignisvertrag und reine Parser           |
| Rechte und Aufträge      | `360_marketplace_local_messaging.sql`, Browser-Sitzungen, Betriebswechsel | Cloud-Versandfreigabe und Cloud-Claim/Begin/Finish                    |
| Browser-Versand          | `vinted-browser-actions.ts`, `BrowserInfo`                                | Playwright-Adapter für Text-/Bildversand und dessen Bestätigung       |
| Serverausführung         | Bestehender Dispatcher, Session-/Profilstore, `main.ts`                   | Nachrichtenrunner und RPC-Adapter                                     |
| Glocke                   | Header und vorhandenes Benachrichtigungsmuster                            | Dauerhafte Eingangsmeldungen, Feed, Markierung und privater Broadcast |
| Gemeinsames Postfach     | Messaging-Store/API, Gesprächskomponente und Account-Store                | Betriebsartabhängige Freigabe statt UI-Sonderseite                    |
| Favoriten und Angebote   | Bestehende Regeln, Ereignisse, Einstellungen und Ergebniszustände         | Cloud-Adapter und serverseitige Ausführung                            |

## Aufgabe 1: Eingangsquelle belegen und gemeinsamen Ereignisvertrag definieren

**Dateien:**

- Lesen: `docs/implementation/vinted-local-inbox.md`, `tools/flipbase-extension/vinted-local-core.js`, `tools/flipbase-extension/vinted-local-favorites.js`, `services/marketplace-worker/src/vinted-account-import.ts`.
- Neu: `supabase/functions/_shared/marketplace-inbox-events.ts`, `tools/flipbase-extension/vinted-local-inbox-events.js`, `services/marketplace-worker/src/vinted-inbox-events.ts`.
- Tests neu: `services/marketplace-worker/test/vinted-inbox-events.test.ts`, `scripts/local-extension-inbox-events.test.mjs`.
- Nach Beleg: anonymisierte Fixtures unter `services/marketplace-worker/test/fixtures/vinted-inbox-events/`.

**Schnittstelle:**

```ts
export interface MarketplaceInboxEvent {
  readonly externalId: string;
  readonly externalConversationId: string;
  readonly occurredAt: string;
  readonly direction: 'inbound';
  readonly source: 'conversation_list' | 'vinted_notifications';
}
export interface MarketplaceInboxEventBatch {
  readonly observedAt: string;
  readonly events: readonly MarketplaceInboxEvent[];
  readonly complete: boolean;
}
export function parseVintedInboxEvents(
  input: unknown,
  accountId: string,
  observedAt: string,
): MarketplaceInboxEventBatch;
```

- [ ] Den bereits angemeldeten Testaccount ausschließlich lesend prüfen: tatsächliche Listen-/Benachrichtigungsform mit `mark_as_read=false`, stabile Ereignis- und Gesprächskennung sowie Beleg für eingehende Richtung ermitteln. Keine rohen Antworten oder Cookies protokollieren. Struktur mit ersetzten Kennungen festhalten; Inhalt privater Nachrichten entfernen.
- [ ] Beleg vor dem Parser festhalten: Welche beobachteten Felder identifizieren Eingang, Gespräch, Zeitpunkt und ein weiteres Ereignis bei bereits ungelesenem Gespräch? Keine erfundene `entry_type`-Zahl verwenden. Ist kein Beleg verfügbar, diesen Nachweis als offenen externen Prüfpunkt melden und keinen Parser auf Vermutungen freischalten.
- [ ] Zuerst Negativtests schreiben und ausführen:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVintedInboxEvents } from '../src/vinted-inbox-events.ts';
test('list timestamps do not invent inbound events', () => {
  const batch = parseVintedInboxEvents(
    { conversations: [{ id: '12', unread: true, updated_at: '2026-10-08T10:00:00Z' }] },
    '34',
    '2026-10-08T10:01:00Z',
  );
  assert.deepEqual(batch.events, []);
});
```

- [ ] Positive Tests aus der belegten Form hinzufügen: zwei eindeutige neue Eingänge im selben ungelesenen Gespräch, Wiederholung derselben Quelle, eigenes Ereignis, unbekannter Typ, ungültige Kennung, fehlende Zeit und abgeschnittene Seite. Ungültige Quelle ergibt keinen vollständigen Referenzabgleich.
- [ ] Reinen Parser mit strikten Kennungen/ISO-Zeiten implementieren; Cloud- und Extension-Version anhand derselben anonymisierten Fälle vergleichen. Maximal zwei Ereignisseiten mit je 100 Einträgen pro Lauf; weitere Seiten explizit als Teilstand behandeln. Kein Detail-Fallback für ungelesene Gespräche.
- [ ] Prüfen: `node --experimental-strip-types --test services/marketplace-worker/test/vinted-inbox-events.test.ts` und `node --test scripts/local-extension-inbox-events.test.mjs`. Beide müssen bestehen; ohne Quellenbeleg endet dieser Schritt nicht als erledigt.
- [ ] Fokussiert committen: `test(auth): establish inbound Vinted event contract` beziehungsweise `feat(auth): parse verified Vinted inbox events`.

## Aufgabe 2: Gemeinsame Outbox und Cloud-Versandfreigabe

**Dateien:**

- Neu: `supabase/schemas/355_marketplace_cloud_message_permissions.sql`, `supabase/schemas/365_marketplace_cloud_message_dispatch.sql`.
- Ändern: `supabase/schemas/360_marketplace_local_messaging.sql`, `supabase/schemas/370_marketplace_cloud_setup.sql`, `supabase/config.toml`.
- Tests neu: `supabase/tests/marketplace-cloud-messaging.test.sql`.
- Tests erhalten/erweitern: `supabase/tests/marketplace-local-messaging.test.sql`, `supabase/tests/marketplace-local-message-retry.test.sql`.
- Erzeugen: neue UTC-Migrationen und `src/app/core/models/supabase.types.ts`.

**Schnittstellen:** Authentifizierte `marketplace_read_message_permission`, `marketplace_approve_cloud_messages`, `marketplace_enqueue_message`, `marketplace_read_messages` und `marketplace_retry_message` mit Arbeitsplatz-/Kontoscope. Die drei Nachrichten-RPCs behalten die Argumente und JSON-Antwortform ihrer bisherigen lokalen Gegenstücke. Cloud-Freigabeantwort: `{ executionMode: 'cloud', allowed: boolean, authorizationVersion: number }`. Die Approval-RPC verlangt zusätzlich die erwartete externe Kontoidentität.

Cloud-Worker-RPCs: `marketplace_cloud_message_claim(worker, epoch, runner)`, `marketplace_cloud_message_check(workspace, connection, message, claim, worker, epoch)`, `marketplace_cloud_message_begin` mit demselben Scope und `marketplace_cloud_message_finish` zusätzlich mit Ergebnis, externer Nachrichtenkennung und Fehlercode. Check liefert aktive Sitzung und Ablaufzeiten; Finish bindet auch verspätete Ergebnisse an den ursprünglichen Versuch.

- [ ] SQL-Regressionen vor dem Schema schreiben: ohne eigene Cloud-Freigabe verweigert, fremder Arbeitsplatz verweigert, zwei gleiche Anfrage-IDs nur ein Auftrag, gleiche ID mit anderem Payload verweigert, alter Worker verweigert, lokale Extension kann Cloud-Auftrag nicht claimen.

```sql
select is(
  (select count(*) from public.marketplace_local_message_outbox
   where workspace_id = '20000000-0000-4000-8000-000000000001'
     and request_id = '20000000-0000-4000-8000-000000000002'),
  1::bigint,
  'A repeated request queues exactly one message'
);
```

Die Testdaten und beiden Einreihungsaufrufe davor verwenden die vorhandene Workspace-/Operator-/JWT-Fixture aus `marketplace-local-messaging.test.sql`; zusätzlich bestätigtes Cloudprofil und explizite Cloud-Freigabe einrichten. Nicht gegen Produktionskennungen testen.

- [ ] RLS-geschützte `marketplace_cloud_message_permissions` mit Scope, genehmigendem Nutzer, externer Identität, Profilreferenz, Freigabeversion und Widerrufszeit anlegen. Geschützte Daten nicht direkt dem Frontend öffnen; RPCs prüfen aktuelle Rechte. Leserechte und Verwaltungsrechte nicht vermischen.
- [ ] Bestehende Outbox um `execution_mode` mit Standard `local`, Cloud-Freigabeversion und Cloud-Versuchsdaten erweitern. Die lokale Grantgeneration ist nur bei lokalen Aufträgen Pflicht. SQL-Checks erzwingen disjunkte Berechtigungsbindungen. Bestehende Daten vollständig erhalten; kein Tabellen-Rewrite oder Rename.
- [ ] Neutrale RPCs nach Betriebsart verzweigen lassen. Lokale RPCs bleiben kompatibel, filtern aber ausschließlich lokale Aufträge. Claim reserviert die bestehende kontoweise Browsersitzung atomar und enthält kein Nutzertoken. Begin bestätigt noch einmal Konto/Freigabe/Profil/Worker und speichert `sending` vor Providerkontakt.
- [ ] Widerruf, Betriebs- oder Profilwechsel: wartende Aufträge abbrechen; begonnene/unklare Versuche nicht übertragen. Recovery setzt abgelaufene `sending`-Versuche auf `outcome_unknown`; `claimed` darf erst nach bestätigtem Browserstopp erneut verfügbar werden. Pausierte Hintergrundautomatik verhindert keinen manuell autorisierten Auftrag.
- [ ] Finish lässt Erfolg nur mit externer Nachrichtenkennung zu, verwirft fremde Claims, ist idempotent für gleiche Ergebnisse und erlaubt spätes `outcome_unknown` → `sent`. Die bisherige Wiederholungsabsicherung gegen verspäteten Originalerfolg erhalten.
- [ ] Schema registrieren, Migration über Supabase-Diff erzeugen, vollständig auf transaktionale SQL-/Rechteänderungen prüfen und auf isolierter Datenbank anwenden. Kein Ändern historischer Migrationen. Typen aus `public,graphql_public` neu erzeugen.
- [ ] DB-Prüfung: neue Cloudtests sowie lokale Messaging-/Retrytests und Browser-/Sync-Sperrtests mit `supabase test db <Dateien> --db-url <isolierte Testdatenbank>`. Die Test-URL kommt ausschließlich aus der lokalen Testkonfiguration. Bei Windows-Launcherproblemen den bereits belegten WSL-CLI-/Migra-Weg verwenden; keine historischen Migrationen dafür ändern.
- [ ] Fokussiert committen: `feat(auth): authorize shared Vinted message jobs`.

## Aufgabe 3: Cloud-Browseradapter für Text und Bild

**Dateien:**

- Neu: `services/marketplace-worker/src/vinted-browser-messages.ts`, `services/marketplace-worker/test/vinted-browser-messages.test.ts`.
- Ändern: `services/marketplace-worker/src/vinted-browser-actions.ts`, `services/marketplace-worker/src/gologin-cloud-browser.ts` (hier liegt nur der gemeinsame `BrowserInfo`-Typ, keine Anbieteraktivierung).
- Referenz: `tools/flipbase-extension/vinted-local-messages.js`.
- Neu: `supabase/functions/_shared/marketplace-message-contracts.ts`.

**Schnittstellen:**

```ts
export interface MarketplaceMessageAttachment {
  readonly name: string;
  readonly mimeType: 'image/jpeg' | 'image/png';
  readonly base64: string;
}
export interface MarketplaceMessageCommand {
  readonly externalConversationId: string;
  readonly text: string;
  readonly attachment: MarketplaceMessageAttachment | null;
}
export interface MarketplaceMessageResult {
  readonly outcome: 'sent' | 'failed' | 'outcome_unknown';
  readonly externalMessageId?: string;
  readonly errorCode?: string;
}
```

`sendVintedMessage(page, accountId, command, authorize): Promise<MarketplaceMessageResult>` ist der Playwright-Adapter. `authorize(): Promise<void>` wird vor jeder externen Aktion aufgerufen. `BrowserInfo.sendMessage` erhält Konto, Command und diesen Callback.

- [ ] Vor der Implementierung Mock-Page-Tests für kein Write bei falscher Identität/Freigabe, genau einen Reply-Versuch, verlorene Antwort, Antwort ohne Beleg, mehrere gleichlautende Nachrichten und Bild-Upload ohne Nachrichtenbeleg anlegen. Testtabelle:

```ts
const expectedOutcomes = [
  ['identity_changed_before_reply', 'failed', 0],
  ['one_new_external_message', 'sent', 1],
  ['reply_timeout', 'outcome_unknown', 1],
  ['upload_without_reply_evidence', 'outcome_unknown', 1],
] as const;
```

Jeder Fall erzeugt eine eigene Mock-Page, zählt Reply-POSTs und prüft Ergebnis plus Identitäts-/Autorisierungscallbacks. Kein externer Netzwerkzugriff im Test.

- [ ] CSRF-Lesen und Antwortform nach der vorhandenen Extension übernehmen. Nur auf der bestätigten Vinted-Seite mit deren Sitzung arbeiten; kein beliebiger URL-/Script-Endpunkt. Bildsignatur, MIME, Base64, Größen- und Textgrenze vor Upload validieren.
- [ ] Baseline-Nachrichtenkennungen lesen, tatsächliche Identität prüfen, gegebenenfalls einen Bild-Upload ausführen, unmittelbar vor Reply erneut autorisieren und genau einen Reply-Versuch ausführen. Danach Verlauf prüfen. `sent` nur bei eindeutigem neuen externen Nachrichtenbeleg des richtigen Kontos; Bild ohne eindeutigen Bezug bleibt unklar.
- [ ] Fehler vor Reply unterscheiden von Fehlern nach möglichem Replybeginn. Keine HTTP-POST-Wiederholung, kein eigener Navigationsretry nach möglicher Schreibaktion. Login, Challenge und Drosselung als feste, geheimnisfreie Fehlercodes weitergeben.
- [ ] BrowserInfo und `vintedBrowserActions` um diesen Adapter erweitern, ohne Listing-/Profil-Schreibfreigaben zu aktivieren. Test: `node --experimental-strip-types --test services/marketplace-worker/test/vinted-browser-messages.test.ts`; anschließend Worker-Typecheck.
- [ ] Fokussiert committen: `feat(auth): send Vinted messages through bound cloud browsers`.

## Aufgabe 4: Cloud-Nachrichtenrunner im vorhandenen Worker

**Dateien:**

- Neu: `services/marketplace-worker/src/supabase-marketplace-message-store.ts`, `services/marketplace-worker/src/marketplace-message-runner.ts` und gleichnamige Tests unter `services/marketplace-worker/test/`.
- Ändern: `marketplace-sync-dispatcher.ts`, `marketplace-browser-session-broker.ts`, `supabase-browser-session-store.ts`, `main.ts` und deren Tests im Worker.
- Prüfen/Tests erweitern: `chromium-bound-profile-store.ts` und `test/chromium-bound-profile-store.test.ts`; die bestehende Profil-/Netzwerkbindung bleibt maßgeblich.

**Schnittstellen:**

```ts
export interface CloudMessageClaim {
  readonly kind: 'message';
  readonly messageId: string;
  readonly claimToken: string;
  readonly scope: BrowserSessionScope;
  readonly accountId: string;
  readonly command: MarketplaceMessageCommand;
}
export interface MarketplaceCloudWriteDispatch<Job> {
  claim(workerId: string, workerEpoch: number, runnerId: string): Promise<Job | null>;
  run(job: Job): Promise<void>;
}
```

Die Imports stammen aus Aufgabe 3 und dem vorhandenen Broker. `BrowserSessionScope` erhält ein internes `messageWrite` mit `messageId`, `claimToken`, `workerId`, `workerEpoch`, `runnerId`, `sessionId`, `expiresAt`, `absoluteExpiresAt`. Es darf nie aus HTTP-Body übernommen werden und nicht gleichzeitig mit `syncRead` oder `cloudSetup` gesetzt sein. Store bietet `claim`, `check`, `begin`, `finish`; Runner bietet `run(claim): Promise<void>`.

- [ ] Tests zuerst: alter Epoch, unpassender Claim, konkurrierende Anmeldung, verlorener Begin-Response, Neustart nach Providerbeginn, fehlgeschlagener Browserstopp, manuelle Nachricht bei pausierter Automatik und kein weiterer Claim nach verlorenem Runtime-Lease.
- [ ] Store ruft ausschließlich die neuen Cloud-RPCs auf und validiert Scope, UUIDs, Zeiten, Command und Ergebnis. Authentifizierte UI-Anfragen werden weiterhin mit Nutzertoken geprüft; interne Claims kommen ausschließlich aus der serverseitigen Abwicklung.
- [ ] Broker-Vergleich, Lease-Prüfung und Profilauflösung um den disjunkten `messageWrite`-Fall erweitern. Profil kommt aus bestätigter reservierter Sitzung. Kein Cloud-Schreiben durch Erzeugen eines `syncRead`-Scopes.
- [ ] Runner: Browser öffnen, Claim/Freigabe prüfen, Begin dauerhaft bestätigen, `sendMessage` mit erneuter Autorisierung ausführen, Finish speichern und Browserstop bestätigen. Geht die Begin-Antwort verloren, keine externe Aktion starten; Recovery muss den begonnenen Zustand konservativ behandeln. Fehlender Stopp hält die Kontosperre.
- [ ] Dispatcher erhält optional `writes: MarketplaceCloudWriteDispatch<CloudMessageClaim>`. Innerhalb des vorhandenen Polls zuerst einen wartenden manuellen Schreibauftrag übernehmen, sonst bisherigen Leseclaim ausführen. Derselbe Runtime-Lease, Heartbeat und Polltimer; keine zweite Workerinstanz. Laufende Reads nicht abbrechen und Anzahl Jobs je Poll weiter begrenzen.
- [ ] `main.ts` verdrahtet Store/Runner nur für den eigenen Cloudbetrieb. Nachrichtenausführung prüft individuelle Freigabe; `MARKETPLACE_CHROMIUM_WRITES_ENABLED` bleibt für die bisherigen anderen Schreibfunktionen unabhängig.
- [ ] Prüfen: gezielte Runner-/Store-/Broker-/Dispatchertests mit Node; Worker-Typecheck und Build. Geheimniswerte in simulierten Providerfehlern dürfen nie im öffentlichen Ergebnis erscheinen.
- [ ] Fokussiert committen: `feat(auth): dispatch fenced cloud message jobs`.

## Aufgabe 5: Eingangsmeldungen dauerhaft speichern und zur Glocke liefern

**Dateien:**

- Neu: `supabase/schemas/425_marketplace_message_notifications.sql`, `supabase/tests/marketplace-message-notifications.test.sql`.
- Ändern: `supabase/schemas/350_marketplace_local_extension.sql`, `supabase/functions/marketplace-local-extension/handler.ts`, `index.ts` und Tests; `supabase/functions/_shared/marketplace-local-extension-contracts.ts`.
- Ändern: `tools/flipbase-extension/vinted-local-background.js`, `vinted-local-scheduler.js`, `manifest.json`; `scripts/local-extension-runtime.test.mjs` und neuer Ereignistest aus Aufgabe 1.
- Ändern: Worker-Ereignisleser, `marketplace-sync-runner.ts`, `supabase-vinted-import-writer.ts` und Tests; `supabase/config.toml`.
- Erzeugen: neue Migration und API-Typen.

**Schnittstellen:** `marketplace_import_inbox_events` ist service-only und verlangt geprüfte kontoabhängige Sitzungs-/Grantbindung plus `MarketplaceInboxEventBatch`. `marketplace_read_message_notifications(workspace)` liefert `{ workspaceId, items, unreadCount }`; Items enthalten `id`, `connectionId`, `conversationId`, `accountName`, `observedAt`, `read`. `marketplace_mark_message_notifications(workspace, notificationId?, clear)` liefert `{ ok: true }`.

- [ ] SQL-Tests vor dem Schema: vollständiger Erstabgleich ohne Meldung, weiterer Eingang einmal gemeldet, zwei neue Ereignisse bei unverändertem Ungelesen-Flag, wiederholter Import, Teilstand vor Baseline, verspätete alte Seite, fremder Scope und gelöschtes/neu verknüpftes Konto.

```sql
select is(
  (select count(*) from public.marketplace_message_notifications
   where connection_id = '20000000-0000-4000-8000-000000000003'
     and notified_at is not null and cleared_at is null),
  1::bigint,
  'Repeated import keeps one new inbound notification'
);
```

Die Fixture erzeugt zuvor einen vollständigen Referenzabgleich und importiert danach dieselbe neue Ereigniskennung zweimal. Ein zweites unterschiedliches Ereignis muss den Zähler auf zwei erhöhen.

- [ ] RLS-geschützte Ereignisse/Meldungen und Referenzstände pro Konto und externer Identität anlegen. Eindeutigkeit auf Scope, Quelle und externe Ereigniskennung. Referenzabgleich erst bei vollständiger belegter Quelle abschließen; neue Ereignisse während eines laufenden Erstabgleichs anhand seines festen Beginns einordnen. Spätere alte Backfill-Ereignisse erzeugen keine Eingangsmeldung.
- [ ] Import validiert externe Gesprächszuordnung und verknüpft nur zum kontogebundenen Gespräch. Noch nicht vorhandene Gespräche warten auf den regulären Import, ohne das Ereignis zu verlieren. Zustand und private Broadcast-Mitteilung erst in derselben erfolgreichen Transaktion schreiben.
- [ ] Broadcast: `workspace:<id>:marketplace_message_notifications`, Ereignis `message_notifications_changed`, `private: true`. RLS richtet sich nach vorhandenen Arbeitsplatz-Leserechten; Markierung prüft die gleiche berechtigte Zuständigkeit. Keine `postgres_changes`.
- [ ] Cloud-Runner übernimmt belegte Events beim regulären Abgleich. Ereignisfehler überschreiben nicht erfolgreiche Profil-/Gesprächsdaten; Quelle wird separat als Teilstand/Fehler geführt. Lokaler Edge-Pfad erhält eine explizite, versionierte Ereignisaktion mit Grantprüfung; alte Extension-Payloads bleiben gültig. Erst nach vorhandenen Nachrichtenleserechten pollen.
- [ ] Extension fragt die begrenzten Ereignisseiten im vorhandenen Fünf-Minuten-Ablauf ab, erhält Pausen/Drosselung und teilt, wenn möglich, die bereits belegte Benachrichtigungsantwort mit dem Favoritenleser. Versionsanhebung erst im Featurecommit; später die bereits registrierte Extension-Folderinstallation aktualisieren.
- [ ] Prüfen: SQL-Tests, lokaler Edge-Handler mit Deno, Extension-Workflowtests und Worker-Importtests. Migration prüfen/anwenden und Typen neu erzeugen.
- [ ] Fokussiert committen: `feat(auth): persist new Vinted inbox notifications`.

## Aufgabe 6: Gemeinsame Oberfläche und Versandfreigabe

**Dateien:**

- Neu: `src/app/features/marketplaces/models/marketplace-message-notifications.ts`, `services/marketplace-message-notification-api.service.ts`, `services/marketplace-message-notification.store.ts` und passende Angular-/Modelltests.
- Ändern: `services/vinted-messaging-api.service.ts`, `vinted-messaging.store.ts`, `marketplace-account.store.ts` und Tests.
- Ändern: `components/vinted-messages/vinted-messages.component.ts`, `.html`, `.angular.spec.ts`; `layout/header/header.component.ts`, `.html`, `.angular.spec.ts`.
- Ändern: `e2e/vinted-inbox-experience.spec.ts`.

**Schnittstellen:** Messaging-API verwendet die neutralen RPCs aus Aufgabe 2. `readPermission(scope)` liefert die dort definierte Freigabeantwort; `approveCloud(scope, expectedAccountId)` genehmigt nur die erwartete Identität. Store stellt gemeinsame `canSend`, `busy`, `messages`, `error`, `send`, `retry` bereit. Lokale Freigabe läuft weiter über den bestehenden Extension-Dialog; Cloud über die neue RPC. Der neue NotificationStore folgt dem vorhandenen FeedbackStore-Muster mit `notifications`, `unreadCount`, `reload`, `markAsRead`, `markAllAsRead`, `clearNotifications`.

- [ ] Angular-Regressionen zuerst für Cloud-Composer, Freigabedialog, keine Extension-Anforderung bei Cloud, keine zweite Anfrage bei Doppelklick, alte Erfolgsantwort nach Kontowechsel, Entwurferhalt bei fehlgeschlagener Einreihung und Markierung ausschließlich des richtigen Feedtyps.

```ts
it('keeps the new account draft when the old enqueue completes', async () => {
  api.listConnections.mockResolvedValue({
    canManage: true,
    connections: accounts.map((account) => ({ ...account, executionMode: 'local' })),
  });
  local.messagesAllowed.set(true);
  const fixture = await render();
  button(fixture, 'Anfrage zum Schal').click();
  await settle(fixture);
  let completeEnqueue: ((accepted: boolean) => void) | undefined;
  messaging.send.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        completeEnqueue = resolve;
      }),
  );
  const previousDraft = 'Antwort im alten Konto';
  const nextDraft = 'Antwort im neuen Konto';
  fixture.componentInstance.composer.controls.text.setValue(previousDraft);
  const sending = fixture.componentInstance.sendMessage();
  await store.selectConnection(accounts[1].connectionId);
  await settle(fixture);
  fixture.componentInstance.composer.controls.text.setValue(nextDraft);
  if (!completeEnqueue) throw new Error('Der alte Auftrag wurde nicht eingereiht');
  completeEnqueue(true);
  await sending;
  expect(fixture.componentInstance.composer.controls.text.value).toBe(nextDraft);
});
```

`render`, `button`, `settle`, `accounts`, `store`, `local`, `api` und `messaging` stammen aus dem bestehenden Component-Testaufbau. Dessen Messaging-Mock um die neue gemeinsame `canSend`-Freigabe ergänzen. Zusätzlich denselben Fall mit Cloud-Betriebsart und Cloud-Freigabe prüfen.

- [ ] Store-Kontext um Cloud erweitern und Workspace-/Benutzerrevisionen erhalten. Freigabestatus aus dem aktuellen Konto laden; nach Konto-/Profilwechsel alte Freigabe verwerfen. Text-/Bildentwürfe je Kontoscope und Gespräch speichern und erst nach bestätigt angenommener aktueller Anfrage leeren.
- [ ] Composer für beide Betriebsarten zeigen. Wartehinweis nennt bei Cloud den Server und bei lokal die Erweiterung. Fortschritt und Unklarheit bleiben sichtbar. Retry prüft aktuellen Verlauf, verhindert belegte Duplikate und verlangt bewusste Bestätigung eines ungeklärten Ergebnisses.
- [ ] Nachrichtenglocke in gemeinsamen Header einsortieren und alle Lese-/Lösch-/Aktualisierungsaktionen auch zum neuen Store routen. Feed-Antworten streng auf Workspace prüfen; Logout, Rechteverlust und Reconnect wie beim FeedbackStore behandeln. Deep-Link wählt Konto plus Gespräch mit vorhandener Routinglogik.
- [ ] Account-/Gesprächsstand nach bestätigter Speicherung nachladen, ohne vollständigen Seitenreload und ohne gespeicherte Daten als neu synchronisiert auszugeben. Lesen für berechtigte Leser erhalten; Composer nur für Verwaltungs-/Versandrechte.
- [ ] Prüfen: gezielte Angular-Tests, Modelle/Parser, Prettier/ESLint der geänderten Dateien und `npm run build`. Postfach/Glocke in vorhandener Playwright-Fixture auf Desktop/Mobil, Tastatur und AXE testen.
- [ ] Fokussiert committen: `feat(ui): enable shared Vinted cloud messaging and alerts`.

## Aufgabe 7: Vorhandene Favoriten-Antworten und Angebote in Cloud ausführen

**Dateien:**

- Ändern: `supabase/schemas/380_marketplace_favorite_messages.sql`; neu `supabase/schemas/385_marketplace_cloud_favorite_dispatch.sql` und `supabase/tests/marketplace-cloud-favorite-messages.test.sql`.
- Ändern/erweitern: bestehende Favorite-/Offer-SQLtests, `vinted-favorite-message-api.service.ts`, `components/vinted-favorite-messages/vinted-favorite-messages.component.ts`, `.html`, `.angular.spec.ts`; `supabase/config.toml`.
- Neu: `services/marketplace-worker/src/vinted-browser-favorites.ts`, `supabase-marketplace-favorite-message-store.ts`, `marketplace-favorite-message-runner.ts` und passende Tests.
- Ändern: `vinted-browser-actions.ts`, gemeinsamer `BrowserInfo`, Dispatcherverdrahtung in `main.ts`; bestehende Extension bleibt kompatibel.

**Schnittstellen:** Favoriten-Settings und Eventdaten bleiben gemeinsam. Nachricht verwendet `MarketplaceMessageResult`; Angebot ein eigenes Ergebnis mit `outcome`, `externalOfferId?`, `errorCode?`. Der serverseitig geprüfte Claim lautet:

```ts
export interface CloudFavoriteClaim {
  readonly kind: 'favorite_message' | 'favorite_offer';
  readonly eventId: string;
  readonly claimToken: string;
  readonly scope: BrowserSessionScope;
  readonly accountId: string;
  readonly authorizationVersion: number;
  readonly settingsVersion: number;
  readonly text: string;
  readonly itemId: string;
  readonly recipientId: string;
  readonly offer: { readonly type: 'amount' | 'percentage'; readonly value: number } | null;
}
```

`BrowserSessionScope.favoriteWrite` enthält `eventId`, `phase: 'message' | 'offer'`, `claimToken`, `workerId`, `workerEpoch`, `runnerId`, `sessionId`, `expiresAt`, `absoluteExpiresAt`. Der neue Fall ist zu `messageWrite`, `syncRead` und `cloudSetup` disjunkt; Broker und Sessionstore prüfen ihn über die entsprechenden Favoriten-RPCs, statt ein Ereignis als manuellen Nachrichtenauftrag auszugeben.

- [ ] SQL-/Runner-Tests zuerst für explizite Aktivierung, Regeln/Zeitzone/Verzögerung, neues Ereignis, bestehenden Verlauf, Konfigurationswechsel, widerrufene Freigabe, unklare Nachricht und kein daraus folgendes Angebot.
- [ ] Bestehende Settings/Events um Betriebsart und Cloud-Freigabebindung erweitern. `marketplace_save_favorite_messages` verlangt je Betriebsart die richtige Freigabe und behält Versionsvergleich, Aktivierungszeit und Stornierung wartender Altaufträge. Lokale Claims können keine Cloud-Ereignisse übernehmen.
- [ ] Cloud-RPCs für Favoriten-Claim/Begin/Finish und Angebots-Claim/Begin/Finish mit den gleichen Begin-/Recovery-/Stoppregeln wie Aufgabe 2 erstellen. Keine doppelte Fachregelberechnung; vorhandene Konfigurationsvalidierung und Preisprüfung wiederverwenden.
- [ ] Browseradapter übernimmt die belegten Abläufe aus `vinted-local-favorites.js`: Identität prüfen, passenden Artikel/Empfänger bestätigen, bestehenden Gesprächsverlauf prüfen und nur zulässigen neuen Favoritenauftrag ausführen. Textversand nutzt den Adapter aus Aufgabe 3. Angebotsbetrag serverseitig anhand der bestehenden Regel bestätigen; Offer nur nach eindeutigem Nachrichtenerfolg.
- [ ] Angebote prozentual und als Betrag testen, einschließlich Mindestpreis, Rundung, veränderter Artikelpreis und doppelter/later Antwort. Kein success allein aus HTTP200 oder aus Bild-/Textähnlichkeit ableiten.
- [ ] Dispatcher-Schreibadapter auf `CloudWriteClaim = CloudMessageClaim | CloudFavoriteClaim` erweitern: erst manuelle Nachrichten, dann fällige Favoritenphasen, anschließend reguläre Reads. Reine Hintergrundfavoriten respektieren Automatikpause/RetryAfter und ausdrücklich aktivierte Regel; gleiche Worker-/Kontosperre.
- [ ] Bestehende Einstellungen für Cloud zugänglich machen, ohne Regeln automatisch einzuschalten. Bei Ausführer-/Profilwechsel Freigabe und Aktivierung bewusst erneuern; lokale Konfiguration und Extension-Grants nicht stillschweigend umdeuten.
- [ ] SQL-/Worker-/Angulartests samt vorhandenen lokalen Favoriten-/Offer-Tests ausführen; Migration und API-Typen erzeugen. Fokussiert committen: `feat(auth): execute existing favorite replies in cloud`.

## Aufgabe 8: Zusammenspiel, Kompatibilität und begrenzte Abrufe prüfen

**Dateien:** Bestehende Import-/Scheduler-/Broker-/Dispatcher-/Browser-APItests, `supabase/tests/marketplace-import-reliability.test.sql`, `marketplace-sync-scheduling.test.sql`, `e2e/vinted-inbox-experience.spec.ts`, `e2e/vinted-favorite-messages.spec.ts`; neue integrierte `services/marketplace-worker/test/marketplace-cloud-inbox.test.ts`.

- [ ] Integration zuerst als Fixture testen: Eingang → Import → Glocke → bewusstes Öffnen → Auftrag → Cloudversand → gespeicherter Erfolg → erneuter Verlauf; gleicher Ablauf lokal mit bestehender Extension.
- [ ] Weitere Fälle abdecken: alte Seiten mit neuen Importzeitpunkten, fehlender Nachrichtenbeleg, Provider429/401/Challenge, verspäteter Broadcast, Reconnect nach Logout, Worker-Verlust, ungeklärter Browserstopp und Betriebsmode-Wechsel mit laufendem Write.
- [ ] Nicht erforderliche Profil-/Inserats-/Bewertungs-/Verkaufsrequests beim expliziten Gesprächsabruf bleiben übersprungen. Begrenzte Quellenwerte und Cache-Reuse erhalten. Teilimporte überschreiben keinen vollständigen gespeicherten Stand und leeren keine Artikel-/Verlaufdaten.
- [ ] Autopause nach Authentifizierungsfehler und Entfernung erledigter Loginwarnung prüfen; laufender Write wird dadurch nicht als bestätigt ausgegeben. Vorbereitete Regressionen aus `735543d5` und `becf2ea1` erhalten.
- [ ] Einmal passende Worker-Gesamtsuite/Typecheck/Build, gezielte DB-Matrix, lokale Edge-/Extensiontests und Angular-/Playwrightprüfungen ausführen. Für die UI den Produktionsbau und AXE nicht durch Typecheck ersetzen. Volle verbindliche PR-Prüfung erfolgt nach Freigabe in CI.
- [ ] Fokussiert committen: `test(auth): verify cloud inbox lifecycle and local compatibility`.

## Aufgabe 9: Review, Veröffentlichung und Echtkonto-Abnahme

**Dateien:** `docs/AI-CHANGELOG.md`, `docs/implementation/vinted-local-inbox.md`, dieser Plan; nur tatsächlich geänderte Releasekonfiguration bei notwendiger Workerverdrahtung.

- [ ] Gesamtänderung gegen aktuellen `origin/master` prüfen; alle neuen APIs, RLS/Grants, SQL-Migrationen, Teilstände und Brokerzustände prüfen. Kein Merge fremder erledigter Zweige als Integrationsbasis. Ein unabhängiges Review folgt der vom Nutzer gewählten Ausführungsweise.
- [ ] Changelog und bestehenden Postfachplan mit tatsächlich bestandenen Tests und noch nicht live belegten Punkten aktualisieren. Formatierung, Diffcheck und Commitstand verifizieren; keine privaten Fixtures/Geheimnisse committen.
- [ ] Nach fertiger Umsetzung genau fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“ Nur mit dieser Abschlussfreigabe pushen, PR erstellen/anhängen, alle erforderlichen erfolgreichen Prüfungen abwarten und Merge-Commit verwenden.
- [ ] Release und passende Worker-Version anhand des gemergten Gitstands prüfen. Kontoprofil-/Proxyzuordnung erhalten; keine zweite Produktivinstanz öffnen. Notwendige Extensionaktualisierung überschreibt die bereits registrierte ausgepackte Installation.
- [ ] Mit Maike Vintage lesend prüfen: aktuelles Konto, gleiches Profil/Proxy, Abgleich, Glockenmeldung eines echten belegten Eingangs und Direktlink. Ungelesene Details bleiben bis zum bewussten Öffnen geschlossen.
- [ ] Für einen echten Sendetest Empfänger plus Text oder Bild vom Nutzer festlegen lassen. Einen Auftrag ausführen, externe Nachricht und Flipbase-Status vergleichen; danach Worker-Neustart/erneuten Verlauf prüfen. Kein erneuter Testversand bei unklarem Ausgang.
- [ ] Favoriten-/Angebotstest nur nach gezielter Konto-/Regel-/Empfängerfreigabe. Eindeutigen Erfolg oder klare Einschränkung dokumentieren. Nicht belegte Bildbestätigung ausdrücklich weiter als unklar darstellen.
- [ ] Erst nach erfolgreichem Merge und gesichertem Stand eigene Remote-/lokale Zweige und zugehörigen Worktree gemäß Abschlussfreigabe aufräumen. Alle Beanspruchungen nach tatsächlichen Tests unterscheiden; gesamte Lösung erst nach Echtkonto-Abnahme abschließen.

## Planprüfung und Übergabe

Der Plan deckt alle Bereiche des bestätigten Entwurfs ab. Ereignisnachweis,
API-Verträge und Ausführungsautorität sind Voraussetzungen der jeweiligen
Nachbaraufgaben; die fünf besonderen Prüfpunkte sind ihren Testaufgaben zugeordnet.
Anbieterfeldwerte werden aus einem belegten lesenden Nachweis übernommen,
niemals in diesem Plan geraten. Planung oder Unit-Tests ersetzen keine
Anbieterabnahme.

Empfohlene Ausführung: in dieser Sitzung durch den Hauptbearbeiter, anschließend
unabhängiges Gesamt-Review. Die Arbeit betrifft dieselben Konto-, Freigabe- und
Sitzungsverträge; zusammenhängende Bearbeitung hält deren Änderungen konsistent.
Alternativ ist aufgabenweise Umsetzung mit jeweils getrennten Implementierungs-
und Review-Agenten möglich. Vor Produktänderungen prüft der Nutzer diesen Plan
und wählt die Ausführungsweise.
