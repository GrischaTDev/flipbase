# Umsetzungsplan: Vinted-Cloudpilot mit festem IP-Bestand

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine vorhandene freie IPRoyal-IP sicher einem Cloudkonto zuordnen und lokale Konten ohne Verlust ihrer Daten zur Cloud wechseln lassen.

**Architecture:** Supabase verwaltet Bestand, Reservierungen und den atomaren Betriebswechsel. Der bestehende Chromiumworker bereitet ein privates Kontoprofil mit ausdrücklich zugeordneter Netzwerkkennung vor. Einrichtungssitzungen dürfen Anmeldung und Identitätsprüfung ausführen; normale Cloudaufträge beginnen erst nach Abschluss.

**Tech Stack:** Angular 22, Signals, vorhandene Flipbase-Komponenten, Supabase/Postgres, Node.js ab 22.16, vorhandenes Playwright 1.63.0 im Worker. Keine neue Abhängigkeit.

**Spec:** [Freigegebener Entwurf](vinted-cloud-ip-pilot.md), vom Nutzer am 05.10.2026 bestätigt.

## Globale Vorgaben

- „Cloudprofile erhalten jeweils eine eigene feste deutsche Dedicated-ISP-IP.“
- „Automatische Käufe, Verlängerungen, Kündigungen und Änderungen an Kundenabonnements sind spätere Aufgaben.“
- „Proxyzugangsdaten bleiben in der bestehenden privaten Serverkonfiguration“.
- Ohne freie IP: „Aktuell sind keine freien Cloud-IPs vorhanden.“
- Bei einem Prüffehler: „Die Cloud-IP-Verfügbarkeit konnte nicht geprüft werden. Bitte versuche es erneut.“
- „Bestehende Datensätze behalten ihre Verbindungs-ID.“
- „Ein abgebrochener Wechsel erhält die lokale Betriebsart und Freigabe.“
- „Ein bloßer Zeitablauf einer Reservierung reicht nicht“ zur Wiederfreigabe einer IP.
- Keine direkte Server-IP als Ersatz, keine automatischen IP-Wechsel.
- Nur Pilotnutzer; vorhandene Plattformoperator-Prüfung zusätzlich zu Arbeitsplatzrechten verwenden.
- Codebezeichner Englisch, Oberfläche und Erläuterungen Deutsch mit Du-Ansprache.
- Migration erzeugen und prüfen, Typen generieren; keine produktive Datenbankänderung während der lokalen Umsetzung.
- Vor UI-Arbeit `docs/design/admin-ui-guidelines.md` lesen. Vor Supabase-Umsetzung den Supabase-Skill und aktuelle relevante Dokumentation prüfen.

## Prüfschwerpunkte

| Bedingung                                                                                 | Erwartung                                                                                                               | Zuständigkeit    |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Antwort geht nach erfolgreicher Reservierung oder Umschaltung verloren                    | Derselbe Vorgang wird wiedergefunden; keine zweite IP und keine zweite Umschaltung                                      | Aufgaben 1, 3, 4 |
| Bereits lokal betriebenes Konto besitzt noch ein früheres Serverprofil                    | Kein ungeprüfter Start mit dessen alter Netzwerkkennung; ruhendes Profil kontrolliert archivieren, neues Profil anlegen | Aufgabe 2        |
| Nachricht ist `sending` oder `outcome_unknown`                                            | Wechsel blockieren, Grant erhalten; die Nachricht niemals automatisch erneut senden                                     | Aufgaben 1, 3    |
| Berechtigung, Arbeitsplatz oder lokale Grant-Generation ändert sich während der Anmeldung | Abschluss scheitert; verspätete Antworten verändern keine neue Ansicht                                                  | Aufgaben 1, 3, 4 |
| Worker stirbt nach Browserstart oder Prozessstopp bleibt unbestätigt                      | Reservierung bleibt gesperrt; Wiederherstellung bestätigt Stopp vor Freigabe                                            | Aufgaben 2, 3    |

## Integrationsstand und Dateiverantwortung

`origin/master` wurde am 05.10.2026 neu geladen: `52ac4270`, PR 301. Die
Kontoverwaltung bietet bereits die Auswahl lokal/Cloud; diese Auswahl erweitern,
nicht eine zweite Kontoverwaltung bauen. Das Nachrichtenpostfach besitzt bereits
eine lokale Versandwarteschlange. Der Plan führt keine neue GoLogin-Anbindung ein.

Vor Produktänderungen einen eigenen aktuellen Arbeitszweig unter `juna/`
verwenden. Den fremden Hauptcheckout und andere laufende Worktrees nicht verändern.
Den Entwurf und diesen Plan in den Implementierungszweig übernehmen.

| Bereich                                                  | Verantwortung                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `supabase/schemas/370_marketplace_cloud_setup.sql`       | Bestand, Einrichtung, serverseitige Zustandsübergänge                                         |
| Bestehende lokale/Cloud-Schemafunktionen                 | Claim-Sperre beim Abschluss, spezielle Einrichtungssitzung, IP-Prüfung normaler Cloudaufträge |
| `_shared/marketplace-cloud-setup-contracts.d.ts`         | Gemeinsamer öffentlicher Einrichtungsvertrag; keine Geheimnisse                               |
| Worker-Profilregistry und neuer Cloud-Einrichtungsdienst | Privates Profil, Anmeldung, Identität, bestätigte Bereinigung                                 |
| Marktplatz-Kontoverwaltung und Browserdialog             | Auswahl, Upgrade, Fortschritt, Kapazitätsmeldung                                              |
| Bestehendes Rollout-Dokument                             | Konkreter manueller Pilot, Ablaufzeit und tatsächlich erreichte Prüfungen                     |

Die unten genannten neuen Funktionen sind geplante Projektfunktionen. Sie sind
keine bereits vorhandenen Anbieter-APIs. Ein IPRoyal-API-Abgleich und automatisches
Nachkaufen gehören nicht zu dieser Umsetzung.

### Task 1: IP-Bestand und atomare Kontoeinrichtung

**Dateien:** Neu `supabase/schemas/370_marketplace_cloud_setup.sql`,
`supabase/tests/marketplace-cloud-setup.test.sql`,
`supabase/test-support/marketplace-cloud-setup-concurrency.mjs`,
`supabase/functions/_shared/marketplace-cloud-setup-contracts.d.ts`.
Ändern `supabase/config.toml`, `supabase/schemas/350_marketplace_local_extension.sql`,
`supabase/schemas/360_marketplace_local_messaging.sql`,
`supabase/schemas/260_marketplace_live_browser_sessions.sql`,
`supabase/schemas/310_marketplace_sync_scheduling.sql`.
Migration und `src/app/core/models/supabase.types.ts` ausschließlich generieren.

**Schnittstellen:** Öffentlicher Vertrag aus der neuen gemeinsamen Datei:

```ts
export type CloudSetupState =
  'reserved' | 'login' | 'verified' | 'finalizing' | 'completed' | 'cleanup_pending' | 'cancelled';
export type CloudSetupRequest =
  | { workspaceId: string; connectionId: string; requestId: string }
  | { workspaceId: string; displayName: string; requestId: string };
export interface CloudSetupView {
  workspaceId: string;
  connectionId: string;
  setupId: string;
  state: CloudSetupState;
  sessionId: string | null;
}
export type CloudSetupResult =
  { status: 'ready'; setup: CloudSetupView } | { status: 'no_capacity' };
```

Serverintern enthält eine Einrichtung zusätzlich `networkId`, `profileId`,
`expectedExternalAccountId`, `expectedGrantGeneration`, Worker-ID/-Epoch und
Fristen. Diese Felder nicht in `CloudSetupView` aufnehmen. Zustände als echte
Übergänge validieren; `verified` allein erlaubt keine Cloudjobs.

- [ ] SQL-Tests mit zwei Arbeitsplätzen, Pilotoperator und Nichtoperator,
      einer deutschen aktiven IP, einer abgelaufenen IP und zwei lokalen Konten
      schreiben. Vorhandene Fixtures aus `marketplace-local-extension.test.sql`
      übernehmen. Folgende konkrete Assertions hinzufügen:

```sql
select is(
  public.marketplace_cloud_setup_begin(
    '37100000-0000-4000-8000-000000000011',
    '37100000-0000-4000-8000-000000000021',
    '37100000-0000-4000-8000-000000000031', null
  )->>'status', 'ready', 'First account reserves the only eligible IP'
);
select is(
  public.marketplace_cloud_setup_begin(
    '37100000-0000-4000-8000-000000000011',
    '37100000-0000-4000-8000-000000000022',
    '37100000-0000-4000-8000-000000000032', null
  )->>'status', 'no_capacity', 'Second account cannot reuse a reserved IP'
);
select is(
  (select execution_mode from public.marketplace_connections
   where id='37100000-0000-4000-8000-000000000021'),
  'local', 'Reservation does not switch execution mode'
);
```

- [ ] Tests zunächst gegen fehlende Funktionen scheitern lassen:
      `npx supabase test db supabase/tests/marketplace-cloud-setup.test.sql`.
- [ ] Tabellen `marketplace_cloud_ips` und `marketplace_cloud_setups` anlegen:
      Identity-IDs, Tabellenkommentare, RLS mit separaten Service-Role-Policies.
      Keine direkten Tabellenrechte für Kunden. IP-Felder: eindeutige
      `network_id`, Anbieter-/Bestellreferenz, Land, Dedicated-ISP-Kennzeichen,
      Ablaufzeit, `enabled`, bestätigter Prüfzeitpunkt und Registrierungszeitpunkt.
      Einrichtung: öffentliche UUID, Benutzer/Arbeitsplatz/Verbindung, IP-Referenz,
      Request-ID, Ausgangsidentität/Grant-Generation, Zustand und Workerbindung.
      Keine Proxyzugangsdaten in den Tabellen.
- [ ] `marketplace_cloud_setup_begin(uuid,uuid,uuid,text) returns jsonb`
      für authentifizierte Pilotoperatoren implementieren. Zweiter Parameter darf
      für ein neues Konto `null` sein; dann den Anzeigenamen validieren. Bei
      Wiederholung vorhandene Einrichtung zurückgeben und geänderte Nutzdaten
      derselben Request-ID ablehnen. Erst nach IP-Reservierung eine neue Verbindung
      in `needs_login` anlegen. Ein neuer Vorgang ohne Kapazität legt kein Konto an.
      Den bestehenden Advisory-Lock `(91731,1)` der lokalen Freigabe für Beginn,
      Abschluss und Bereinigung übernehmen. Einheitliche Sperrreihenfolge:
      Advisory-Lock, Verbindung, Einrichtung, IP, lokale Grant-/Outboxzeilen.
      Verbindungen sperren, dann IPs in fester Reihenfolge reservieren:

```sql
select ip.id into v_ip_id
from public.marketplace_cloud_ips ip
where ip.enabled and ip.country_code='DE' and ip.is_dedicated_isp
  and ip.verified_at is not null and ip.expires_at>clock_timestamp()
  and not exists (
    select 1 from public.marketplace_cloud_setups setup
    where setup.cloud_ip_id=ip.id and setup.state<>'cancelled'
  )
order by ip.created_at,ip.id
limit 1 for update of ip skip locked;
```

      Zusätzlich eindeutige partielle Indizes für nicht freigegebene IPs und
      nicht abgeschlossene Einrichtungen je Verbindung verwenden. `completed`
      hält die IP weiterhin zugeordnet. Fremde Arbeitsplätze und nicht freigegebene
      Pilotnutzer erhalten `42501`; leere Kapazität ist ein reguläres Ergebnis.

- [ ] Benutzer-RPC `marketplace_cloud_setup_read(workspace,setup)` und
      `marketplace_cloud_setup_cancel(workspace,setup)` hinzufügen. Abbruch setzt
      nur `cleanup_pending`; bereits abgeschlossener Wechsel bleibt abgeschlossen.
      Server-RPCs für Profilbindung, bestätigte Identität, Abschluss und bestätigte
      Freigabe ausschließlich an `service_role` vergeben. Diese prüfen zusätzlich
      den initiierenden Benutzer, aktuelle Arbeitsplatzrechte und Worker-Epoch.
- [ ] Den Abschluss als zwei kontrollierte Schritte implementieren:
      `marketplace_cloud_setup_finalize` setzt unter Kontosperre `finalizing`,
      prüft Generation/Identität und blockiert neue lokale Enqueue-/Claim-/Start-
      Versuche. `claimed`, `sending` und `outcome_unknown` blockieren den Übergang.
      Bereits `queued` gebliebene Nachrichten beim erfolgreichen Abschluss als
      `cancelled` mit `execution_changed` markieren; sie nicht in Cloudaufträge
      umwandeln. Bei abgebrochenem Wechsel bleibt die Warteschlange bestehen.
      `marketplace_cloud_setup_complete` prüft die Voraussetzungen erneut und setzt
      atomar Betriebsart, IP-Zuordnung und Grant-Widerruf. Grant-Generation erhöhen;
      Capability-Nachweise auf bestätigte Cloudfähigkeiten beschränken. IDs und
      vorhandene Konto-/Anzeigendatensätze nicht löschen oder neu zuordnen.
- [ ] `cloud_setup_id` als optionale FK an Browsersitzungen ergänzen. Nur die neue
      `marketplace_cloud_setup_session_reserve(workspace,setup)` darf eine solche
      Sitzung bei lokalem Konto erzeugen. Allgemeine Session-Reserve, Operations
      und Schedules bleiben für lokale Konten verboten. Check/Heartbeat prüfen
      Einrichtung, Benutzer, Sitzung, Worker und Ablauf. Normale Cloudsessions
      sowie Sync-Check/-Heartbeat prüfen bei IP-verwalteten Konten die aktive
      Zuordnung; bestehende fremde Legacykonten nicht ungefragt umstellen.
- [ ] Tests für widerrufene Rechte/Generation, falsche Identität, gesperrte oder
      abgelaufene IP, laufenden Versand, wiederholten Abschluss und verspäteten
      lokalen Import ergänzen. Zwei echte parallele Datenbanksitzungen mit der
      vorhandenen Concurrency-Harness-Struktur aus
      `supabase/test-support/ebay-order-import-concurrency.mjs` starten: genau eine
      IP-Reservierung, genau eine Kapazitätsmeldung. Ein serieller Test genügt nicht.
- [ ] Schemadatei am Ende der bestehenden `schema_paths` registrieren. Im eigenen
      wegwerfbaren Supabase-Testprojekt Migration erzeugen, vollständig lesen,
      auf Transaktionalität und Rechte prüfen, anschließend Replay und Typen:

```powershell
npx supabase stop
npx supabase db diff -f marketplace_cloud_setup
npx supabase start
npx supabase db reset --local
npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts
npx supabase test db supabase/tests/marketplace-cloud-setup.test.sql
npx supabase test db supabase/tests/marketplace-local-extension.test.sql
npx supabase test db supabase/tests/marketplace-local-messaging.test.sql
```

      Keine fremde lokale Datenbank stoppen/zurücksetzen. Bei fehlender isolierter
      Datenbank die vorhandene CI-Erzeugung nutzen; keinen handgeschriebenen
      Migrationsersatz anlegen. Commit: `feat(core): add atomic cloud IP reservations`.

### Task 2: Privates Profil mit reservierter Netzwerkkennung

**Dateien:** Ändern `services/marketplace-worker/src/chromium-account-profile-registry.ts`,
`chromium-profile-provisioner.ts`, `main.ts` und zugehörige Tests in `test/`.
Neu `src/supabase-marketplace-cloud-setup-store.ts` und
`test/supabase-marketplace-cloud-setup-store.test.ts` innerhalb des Workers.

**Schnittstellen:** `NewAccountProfile` erhält `networkId?: string`. Bestehende
Aufrufer behalten ihre Standardkennung; Cloud-Einrichtungen müssen ausdrücklich
die reservierte Kennung übergeben. Neuer Store liest den privaten Zustand aus
Aufgabe 1 und bietet `readAuthorized(scope, setupId)`, `bindProfile(scope, setupId,
profileId)`, `assertNetwork(scope)` und `confirmCleanup(scope, setupId)`.
`prepareCloudSetup(scope, setupId): Promise<void>` ist ein eigener
Provisionerpfad; `prepare(scope)` lockert keine bestehenden Cloudberechtigungen.

- [ ] Registrytest schreiben und zunächst scheitern lassen:

```ts
test('an explicit account network survives a registry restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-cloud-ip-'));
  try {
    const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    const profile = await registry.create({
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
      networkId: 'iproyal-test-a',
    });
    const restarted = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    assert.equal((await restarted.resolve(profile.profileId)).networkId, 'iproyal-test-a');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] Kennung mit bestehendem Pattern validieren und
      `networkId: account.networkId ?? this.networkId` speichern. Der neue
      Provisionerpfad verweigert `direct`, unbekannte Konfigurationen und abweichende
      Bindungen, bevor ein Browser startet. Proxy-Datei weiter mit bestehenden
      privaten Dateirechten laden; keine Zugangsdaten im Manifest ablegen.
- [ ] Vorhandenes ruhendes Serverprofil eines lokalen Kontos berücksichtigen:
      alle bisherigen Sitzungen kontrolliert beenden, Prozessstopp bestätigen,
      ausschließlich die alte Browserprofilzuordnung entfernen und das Profil
      privat archivieren. Danach frisches Profil für dieselbe Verbindung mit der
      reservierten Kennung erstellen. Archivoperation dafür ausdrücklich auf
      „bestätigt unzugeordnet und beendet“ begrenzen; die Verbindung nicht löschen.
      Bei unklarem Stopp oder widersprüchlicher Zuordnung blockieren. Vorhandene
      Legacy-Anbieterprofile privat referenzieren, nicht beim Anbieter löschen.
- [ ] Profilbindung bei verlorenem DB-ACK nachlesen. Wiederholte Vorbereitung
      verwendet dasselbe profilgebundene Setup. Nach Neustart darf ein Manifest
      mit unklarer DB-Bindung nicht durch ein weiteres Profil ersetzt werden.
      IP- und Workerbindung vor jeder Browserverwendung erneut prüfen.
- [ ] Store- und Provisionertests: ungültige Fremdzuordnung, ruhendes Profil mit
      alter Kennung, fehlende Proxydatei, unbestätigter Stopp, Profil-ACK verloren,
      gleicher Vorgang nach Neustart. Erwartung jeweils kein direkter Ersatzstart.
      In `main.ts` nur die neuen Abhängigkeiten verbinden; kein globaler Wechsel
      von `MARKETPLACE_CHROMIUM_NETWORK_ID` auf die gekaufte IP.
- [ ] Im Worker ausführen:

```powershell
node --experimental-strip-types --test test/chromium-account-profile-registry.test.ts test/chromium-profile-provisioner.test.ts test/supabase-marketplace-cloud-setup-store.test.ts
npm run typecheck
npm run build
```

      Commit: `feat(core): bind cloud setup profiles to reserved IPs`.

### Task 3: Begrenzte Anmeldung, Abschluss und Wiederherstellung

**Dateien:** Neu Worker `src/marketplace-cloud-setup.ts`,
`test/marketplace-cloud-setup.test.ts`. Ändern
`marketplace-browser-http-api.ts`, `marketplace-browser-session-broker.ts`,
`supabase-browser-session-store.ts`, `marketplace-browser-recovery.ts`, `main.ts`
und entsprechende Tests.

**Schnittstellen:** `BrowserSessionScope` erhält die nur intern konstruierte
Erweiterung `cloudSetup?: { setupId: string }`. `sameScope` vergleicht diese
Referenz zusätzlich. Der Einrichtungsdienst verwendet den Store aus Aufgabe 2,
den vorhandenen Broker und die vorhandene Vinted-Identitätsprüfung:

```ts
interface MarketplaceCloudSetup {
  begin(request: CloudSetupRequest, userId: string, accessToken: string): Promise<CloudSetupResult>;
  read(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView>;
  complete(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView>;
  cancel(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView>;
}
```

Die HTTP-API ergänzt `POST /marketplace-browser/cloud-setups/begin` und
`POST /marketplace-browser/cloud-setups/{setupId}/{read|complete|cancel}`.
Anmeldeaktionen erhalten denselben Setup-Pfad mit `{frame|input|login|verify|identify}`.
Jede Anfrage prüft Benutzer und Setup-Zuordnung serverseitig. Ein vom Client
gesendetes `cloudSetup`-Objekt wird nicht als Berechtigung übernommen.

- [ ] HTTP-/Brokertests zuerst schreiben: Ein Setup-Browser kann über normale
      Session-, Sync- oder Edit-Routen nicht verwendet werden. Normaler Browser
      kann umgekehrt nicht als Setup ausgegeben werden. Fehlerkapazität liefert
      `{ status: 'no_capacity' }`; technische DB-Fehler liefern HTTP 503 mit
      `cloud_ip_check_failed`, ohne Einrichtungs-/Browserstart.
- [ ] Interne Setup-Referenz erst nach `readAuthorized` erzeugen. Sessionstore
      verwendet dann die spezielle Reserve-RPC aus Aufgabe 1. Bekannte Login-,
      SMS- und Identitätsadapter wiederverwenden. Identität nur im Setup
      bestätigen; nicht vorzeitig `SupabaseVintedAccountWriter.confirm` aufrufen.
      Direkte Browserbedienung auf den bestehenden Anmelde-/Prüfungsablauf begrenzen;
      nach beobachtetem Login nur Identitätsprüfung/Abschluss zulassen. Keine
      automatischen Kontosynchronisierungen, Nachrichten oder Listingänderungen
      während der Einrichtung. Bei Sperrseite den Versuch beenden.
- [ ] Abschlussfolge implementieren: Browseridentität lesen → serverseitige
      Identitätsbestätigung → `finalize` → Browser kontrolliert beenden →
      bestätigten Stopp prüfen → `complete`. Ein Stoppfehler lässt `finalizing`
      bestehen; keine Cloudjobs und keine IP-Freigabe. Wiederholter Abschluss
      liest den tatsächlich erreichten Zustand. Erfolgreicher Abschluss öffnet
      keine zweite Browsersitzung und aktiviert keine Automatik von selbst.
- [ ] Abbruchfolge: `cancel` → neue Browseraktionen sperren → Browser beenden →
      Setup-Profilzuordnung kontrolliert entfernen → privates Profil archivieren →
      `confirmCleanup`. Erst dann `cancelled` und IP verfügbar. Beim Abbruch aus
      `finalizing` lokale Claim-Sperre aufheben, ohne Grant oder Versandhistorie
      zurückzusetzen. Eine verlorene Antwort nach `completed` darf keinen Abbruch
      des nun aktiven Cloudkontos auslösen.
- [ ] Wiederherstellung integriert vorhandene Worker-Epoch-/Stopnachweise.
      Setup-Sitzungen nach einem Neustart prüfen; abgelaufene Vorgänge in
      Bereinigung überführen. Kein Timer gibt IPs ungeprüft frei. Beim Wechsel
      zurück zur Erweiterung nach bestätigtem Cloudstopp auch die private
      IP-Zuordnung über denselben Bereinigungsweg freigeben. Dafür darf nur eine
      Serveroperation eine bisher `completed`-Zuordnung bereinigen, nachdem sie
      die tatsächlich lokale Betriebsart und den bestätigten Cloudstopp erneut
      geprüft hat. Die Benutzer-Abbruchfunktion bleibt für abgeschlossene
      Cloudwechsel wirkungslos. Ist die Freigabe
      ungeklärt, bleibt die IP gesperrt und das Problem administrativ sichtbar.
- [ ] Folgende konkrete Ablaufassertions mit injizierten Store-/Browseradaptern
      im Worker-Test ergänzen; Testfixtures enthalten nur künstliche IPs:

```ts
assert.deepEqual(events, ['verify-identity', 'finalize', 'stop-browser', 'complete']);
assert.equal(localGrantRevokedBeforeComplete, false);
assert.equal(startedNormalCloudJobs, 0);
assert.equal(releasedIpAfterUncertainStop, false);
assert.equal(repeatedComplete.setupId, firstComplete.setupId);
```

      Zusätzlich abweichende Identität, widerrufene Rechte, verlorene Antwort nach
      Commit und eine während des Logins abgelaufene IP prüfen.

- [ ] Im Worker die neuen Tests sowie HTTP-API-, Sessionstore-, Broker- und
      Recoverytests ausführen; danach `npm run typecheck` und `npm run build`.
      Commit: `feat(core): complete and recover cloud account setup safely`.

### Task 4: Bestehende Kontooberfläche um Cloud-Einrichtung erweitern

**Dateien:** Neu im Marketplace-Feature `models/marketplace-cloud-setup.ts`
(Parser und Reexport des gemeinsamen Vertrags),
`services/marketplace-cloud-setup-api.service.ts`,
`services/marketplace-cloud-setup.store.ts` und deren Tests.
Ändern Komponenten `marketplace-accounts`, `vinted-account-grid`,
`marketplace-connect`, `marketplace-browser-test` jeweils TS/HTML und
`services/marketplace-browser-test-api.service.ts`,
`marketplace-browser-test.store.ts`, `marketplace-account.store.ts` samt Tests.
Neu `components/marketplace-accounts/marketplace-accounts.component.angular.spec.ts`.

**Schnittstellen:** API-Service verwendet den gemeinsamen Vertrag und bestehende
authentifizierte Worker-Requests. Setupstore bietet `begin(request)`,
`read(scope, setupId)`, `complete(scope, setupId)` und `cancel(scope, setupId)` sowie
Signals `setup`, `busy` und `error`. Browserdialog erhält
`cloudSetupId = input<string | null>(null)`; der API-Service wählt anhand dieser
Referenz den Setup-Pfad. Keine Proxyfelder in Formularen.

- [ ] UI-Test für die echte neue Cloud-Kontoverknüpfung schreiben: API gibt
      `no_capacity` zurück; erwarteter Hinweis erscheint, Konto wird nicht
      angelegt, Browserdialog bleibt geschlossen. Lokale Auswahl bleibt nutzbar.
      Erst gegen die fehlende Integration scheitern lassen.
- [ ] Bestehende Auswahl „Lokale Erweiterung“/„Cloudbrowser“ behalten. Bei Cloud
      zuerst `begin` aufrufen. Nach `ready` Kontoliste laden und Browserdialog mit
      `setupId` öffnen. Bei lokalem Konto Verwaltungsaktion „Auf Cloud wechseln“
      hinzufügen; dieselbe Verbindung an `begin` übergeben. Nur für freigegebene
      Pilotnutzer mit Verwaltungsrecht anzeigen, zusätzlich Serverprüfung. Dafür
      eine authentifizierte `POST /marketplace-browser/cloud-setups/availability`-
      Abfrage mit `workspaceId` ergänzen; Antwort `{ canSetup: boolean }` enthält
      allein die Pilot-/Verwaltungsfreigabe. Die eigentliche Kapazitätsprüfung
      bleibt in `begin`, damit eine frühere Anzeige keine IP verspricht.
- [ ] Strict Parser prüft Zustand, UUIDs, Arbeitsplatz-/Verbindungsbezug und
      öffentliche Feldliste. Bei falscher Antwort fester Fehler statt Übernahme
      fremder Kontoansicht. Setup-API und Store benutzen denselben neuen Vertrag;
      keine temporären Frontend-DTOs als Ersatz für fehlende Backendfunktionen.
- [ ] Meldung exakt abbilden:

```ts
if (result.status === 'no_capacity') {
  this.error.set('Aktuell sind keine freien Cloud-IPs vorhanden.');
  return;
}
this.setup.set(result.setup);
```

- [ ] Bestehende manuelle Anmeldung und SMS-Bedienung im Browserdialog verwenden.
      „Anmeldung prüfen & verbinden“ prüft im Setup die Identität; eigener
      Abschluss zeigt „Cloud aktiv“. Den normalen Browserwriter nicht umgehen.
      In `finalizing` den ausstehenden Wechsel sichtbar machen und Versand
      sperren. Bei `completed` Kontoliste samt bestehenden Daten nachladen;
      `connectionId` erhalten. Bei Abbruch den lokalen Zustand nachladen.
- [ ] Arbeitsplatz-/Benutzer-/Kontowechsel und Destroy invalidieren laufende
      Antworten mit dem etablierten Kontext-/Revisionsmuster. Den privaten
      Setupzustand nicht über `localStorage` oder URLs mit Zugangsdaten speichern.
      Nach Verbindungsabbruch zunächst `read` nutzen; gleicher `requestId` bei
      Wiederholung, keine automatischen neuen Einrichtungen.
- [ ] Angular-Tests für fehlende IP, Doppelklick, technischen Fehler, verworfene
      verspätete Antwort, abgebrochenes Upgrade und erfolgreicher Wechsel mit
      unveränderter Konto-ID schreiben. Servertests aus Aufgabe 3 beweisen die
      Sicherheit; UI-Tests prüfen die sichtbare Bedienung und Statusübergänge.
- [ ] Betroffene Angulartests mit
      `npm run test:angular -- src/app/features/marketplaces/services/marketplace-cloud-setup.store.angular.spec.ts src/app/features/marketplaces/components/marketplace-accounts/marketplace-accounts.component.angular.spec.ts`
      ausführen. Geänderte Dateien formatieren/linten, `npm run build` für echte
      Templateprüfung ausführen. Vorhandene Marketplace-Browser-/Accounttests
      ergänzend ausführen. Commit: `feat(ui): add cloud setup and local account upgrade`.

### Task 5: Private Bestandsaufnahme und vollständige Pilotprüfung

**Dateien:** Neu Worker `src/register-marketplace-cloud-ip.ts`,
`test/register-marketplace-cloud-ip.test.ts`. Ergänzen
`docs/implementation/vinted-worker-rollout.md` und `docs/AI-CHANGELOG.md`.
Nur falls erforderlich vorhandenes Pilot-Compose um den privaten, nur lesenden
Proxy-Dateimount ergänzen; keine IP oder Geheimnisse in Compose eintragen.

**Schnittstellen:** Wartungs-CLI liest einen absoluten privaten Dateipfad,
Bestellreferenz, Ablaufzeit und Netzwerkkennung. Sie verwendet
`ChromiumNetworkProfiles.load` und einen expliziten Proxy-Verbindungstest. Sie
registriert erst nach bestätigtem deutschen Ausgang die Metadaten im Bestand
aus Aufgabe 1. Ein administrativer Lesemodus `--list` zeigt interne Kennung,
Bestellreferenz, Ablaufzeit und Zustand, ohne Proxyzugangsdaten. Für den Standort
die deutsche Bestellregion und eine externe Geo-IP-Auskunft zum tatsächlich
gemessenen Ausgang abgleichen; bei widersprüchlichen Ergebnissen nicht freigeben.

- [ ] CLI-Tests schreiben: falsche Dateirechte, Symlink, fehlende Zugangsdaten,
      falscher Standort, abgelaufene Bestellung und DB-ACK-Verlust. Keiner dieser
      Fälle registriert eine ungeprüfte freie IP; Geheimnisse erscheinen weder
      in Fehlertexten noch in der Standardausgabe.
- [ ] Private Datei auf dem Server mit Modus `0600` und dem bestehenden
      Worker-Besitzer vorbereiten; Struktur des bereits vorhandenen Loaders:

```json
{
  "networkProfiles": [
    {
      "id": "iproyal-pilot-a",
      "kind": "proxy",
      "server": "http://PROXY_HOST:12323",
      "username": "PRIVATE_USERNAME",
      "password": "PRIVATE_PASSWORD"
    }
  ]
}
```

      Diese Werte sind ausschließlich ein Formatbeispiel. Echte Werte nur im
      privaten Serverbestand verwenden. Externe IP-Auskunft und Standort über
      diesen Proxy prüfen; kein Vintedlogin als Konnektivitätstest. Bei unklarem
      Standort IP nicht freigeben. Ablaufzeit aus der konkreten Bestellung
      übernehmen, nicht aus dem Datum des Screenshots schätzen.

- [ ] Geänderte Worker-/Datenbank-/Angularprüfungen erneut nur bei weiteren
      Änderungen ausführen. Für den fertigen PR laufen die verpflichtenden
      vollständigen CI-Prüfungen. Lokal zusätzlich Schema-/Migrationserkennung,
      Format/Lint, Workerbau und Angularbau prüfen. Datenbank-Concurrencytest
      tatsächlich gegen die isolierte Datenbank ausführen.
- [ ] Bestehende E2E-Fälle in `e2e/marketplace-accounts.spec.ts` und
      `e2e/vinted-account-grid.spec.ts` um Kapazitätsmeldung und Upgrade erweitern.
      Bildschirme auf Desktop/Mobil prüfen; AXE-Checks bestehen lassen. Alle
      Testkonten und IPs hierfür sind künstliche Fixtures.
- [ ] Nach fertiger Umsetzung und erfolgreichen lokalen Prüfungen exakt fragen:
      „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“
      Vor dieser Freigabe nicht pushen oder deployen. PR verknüpfen und die
      vorgeschriebenen Prüfungen sowie Merge-/Releaseabläufe einhalten.
- [ ] Der echte Hetzner-Test beginnt erst nach ausdrücklicher Freigabe der
      Produktionskonfiguration und Benennung des Pilotkontos. Der Kontoname ist
      bereits separat angefragt; bis zur Antwort keine echte Kontozuordnung
      vornehmen. Die gekaufte IP ist noch nicht im Serverbestand registriert.
      Vorhandene private Pilotkonfiguration anhand des aktuellen Hosts prüfen,
      nicht ungeprüft eine historische Compose-Datei starten.
- [ ] Auf Hetzner nach Registrierung: Anmeldung und Identität für das benannte
      Konto, lesender Profil-/Anzeigenabgleich, Worker-Neustart mit derselben
      IP-Zuordnung und fehlende Kapazität bei zweitem Testkonto nachweisen.
      Keine automatischen Schreibaktionen einschalten. Ablaufzeit administrativ
      sichtbar halten. Den tatsächlichen Ausgang im Rollout-Dokument festhalten;
      lokale Tests nicht als erfolgreichen Vinted-Livetest ausgeben.

## Abschluss und Ausführung

Der Plan ist fachlich und technisch durchgesehen. Er ist noch nicht umgesetzt.
Empfohlen ist die direkte Umsetzung in dieser Sitzung: Die fünf Aufgaben hängen
eng an denselben Zuständen und Schnittstellen; das spart wiederholte Übergaben.
Danach erfolgt eine unabhängige Prüfung des gesamten Zweigs. Alternativ können
einzelne Aufgaben mit separaten Implementierungs- und Prüfagenten ausgeführt werden.
Vor Beginn den Plan vom Nutzer prüfen und die Ausführungsart wählen lassen.
