# Eigene Vinted-Botsitzung – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der zentrale Artikelbot pausiert bei einer Prüfseite dauerhaft und sammelt erst nach erfolgreicher manueller Browserfreigabe wieder Artikel.

**Architecture:** Ein regulärer Chrome-Prozess besitzt ein eigenes persistentes Profil. Ein lokaler CDP-Leser liefert automatische Katalogantworten an den vorhandenen Parser; eine exklusive manuelle Sitzung verwendet native Eingaben. Scheduler, Browser und Betreiber-API teilen die Abrufsperre; angenommenes Speichern geht der Wiederaufnahme voraus.

**Tech Stack:** Node 22, TypeScript, Supabase, regulärer Google Chrome unter Xvfb, Playwright `1.63.0`, Angular 22, Tailwind, Vitest, Docker und Caddy.

**Spec:** [Freigegebener Entwurf](../specs/2026-10-07-vinted-bot-browser-design.md)

## Globale Grenzen

- Arbeitszweig `juna/vinted-access-analysis`; Basis `96126477`. Fremde Änderungen nicht zurückdrehen.
- Eigene Sitzung unter `/var/lib/flipbase-sniper/browser`, Verzeichnisrechte `0700`, Dienstnutzer ohne Rootrechte.
- Playwright-Version `1.63.0`; keine Paket-Upgrades, keine zusätzlichen Browserframeworks.
- Profil und Cookies nicht exportieren. CDP nur auf Loopback. Keine persönliche Kontositzung verwenden.
- `interaction_required` bedeutet eine dauerhafte Pause ohne automatische Probe, auch nach Neustart.
- Manuelle Sitzung exklusiv und zehn Minuten gültig. Jeder API-Aufruf prüft das Token und `is_platform_operator` mit Aufruferrechten.
- Keine automatisierte Challenge-Bedienung, Proxyrotation oder Browseridentitätsänderung.
- Keine Datenbankmigrationen und keine manuelle Bearbeitung generierter Typen.
- Deutscher Chat, UI, Kommentare und PR; englische Bezeichner und Conventional-Commit-Titel. Changelogname ausschließlich Juna.
- Produktive Nike-Abfrage bleibt auf 60 Sekunden; andere bestehende Aufträge bleiben deaktiviert.
- Vor Angular-Änderungen `docs/design/admin-ui-guidelines.md` lesen. Bestehende Modal-, Button-, Badge- und Kartenkomponenten nutzen.
- Keine Produktionsänderungen während der Umsetzung. PR-/Releasefreigabe nach lokalen Prüfungen einholen.

## Besonderer Prüffokus

1. Ein Filter wird während einer manuellen Prüfung deaktiviert oder geändert: Antwort verwerfen und die Pause erhalten; Tests in Aufgabe 3.
2. Eine erfolgreich geladene Antwort kann nicht gespeichert werden: keine Freigabe; Tests in Aufgaben 1 und 3.
3. Der Browser fällt beim Öffnen oder Schließen aus und sein Profil bleibt belegt: keine zweite Sitzung, keine Freigabe; Tests in Aufgabe 2.
4. Eine abgelaufene Sitzung oder entzogene Betreiberrolle wird für Bilder/Eingaben weiterverwendet: jeden Aufruf ablehnen; Tests in Aufgabe 4.
5. Ein verspätet geladener Screenshot trifft nach dem Schließen ein: keine neue Blob-URL und kein weiterer Timer; Tests in Aufgabe 5.

## Dateiverantwortung

Neue Botmodule unter `services/sniper/src/browser/`: `vinted-browser.ts` für Chrome/CDP, `browser-desktop.ts` für native Eingaben, `browser-session.ts` für exklusive Bedienung und Prüfung, `browser-http-api.ts` für HTTP/Auth, `browser-types.ts` für den vollständigen API-Vertrag. Kein allgemeines Framework und kein Umbau persönlicher Kontomodule.

Neue Adminmodule: `models/sniper-browser.model.ts`, `services/sniper-browser.service.ts` und `components/sniper-browser-connect/sniper-browser-connect.component.ts/.html`. UI-Vertrag gehört zur tatsächlich implementierten neuen API, nicht zu einem Ersatz für generierte Supabase-Proxies.

Die bestehenden Module für Retry, Scheduler, Kategorieauffrischung, Collector, Konfiguration und Prozessstart werden gezielt angepasst. Dockerbau, Compose, Caddy und deren Tests bilden die Veröffentlichungsvoraussetzungen ab.

## Task 1: Dauerhafte Prüfungspause und sichere Erfolgsreihenfolge

**Dateien:** Ändern: `services/sniper/src/runtime/retry-policy.ts`, `scheduler.ts`, `refresh-categories.ts`; Tests: die gleichnamigen Dateien unter `services/sniper/test/runtime/`.

**Schnittstellen:** `evaluateFailure(error, query, now): RetryDecision` bleibt erhalten. `OriginStateStoreLike.setBlocked(origin, reason, notBefore?: Date)` wird zusätzlich von der Kategoriefehlerbehandlung verwendet; die optionale Anbieterwartezeit wird im vorhandenen `blocked_until` gespeichert und hebt `interaction_required` niemals automatisch auf. Das echte OriginStore-Modul und der In-Memory-Teststore erhalten diese optionale Signatur. `ListingStoreLike.completeRun(listings, query)` liefert weiterhin `SearchFilterRunResult` mit `accepted`.

- [ ] Den bisherigen Prüfseiten-Proben-Test durch diesen Regressionstest ergänzen und bestehende generische 403-/429-Tests erhalten:

```ts
it('requires manual interaction for a confirmed challenge', () => {
  const decision = evaluateFailure(
    new ForbiddenError('challenge', { challengeDetected: true }),
    { consecutiveFailures: 2 },
    new Date('2026-10-07T12:00:00Z'),
  );
  expect(decision.originUpdate).toEqual({
    state: 'blocked',
    blockedUntil: null,
    reason: 'interaction_required',
  });
  expect(decision.runState).toBe('blocked');
});
```

- [ ] In `services/sniper` ausführen: `npm test -- test/runtime/retry-policy.spec.ts`. Vor der Änderung muss der neue Test wegen des bisherigen Cooldowns scheitern.
- [ ] Vor der bisherigen generischen 403-Behandlung den bestätigten Prüfseitenfall abzweigen. Bei `Retry-After` erhalten `RetryDecision.nextAttemptAt` und `originUpdate.blockedUntil` denselben frühesten manuellen Navigationstermin; ohne Header sind beide null. Die gemeinsame Sperre hat kein automatisches Ablaufdatum. `errorKind` bleibt für den gespeicherten HTTP-Fehler `forbidden`, der Origin-Grund lautet `interaction_required`.

```ts
if (originState.state === 'blocked' && originState.reason === 'interaction_required') {
  report.originPause = { reason: 'interaction_required', until: null };
  return report;
}
```

- [ ] Schedulerregressionen ergänzen: selbst weit in der Zukunft keine Probe bei diesem Grund; alte `blocked`-Zustände behalten ihre bisherige Probe. Kategorien speichern die neue Sperre und laden bei bestehender Sperre keine Startseite.
- [ ] Die Probe erst nach angenommenem `completeRun` freigeben. Bei `{ accepted: false }` oder abgelehntem Speicherpromise `releaseProbe(origin, true)` nicht aufrufen. Für alte Filterformate folgt die Freigabe ebenfalls erst auf erfolgreiches Speichern und Erfolgsaufzeichnung.
- [ ] Alle drei betroffenen Testdateien ausführen; anschließend `npm run typecheck`. Commit: `fix(sniper): pause confirmed challenges until manual verification`.

## Task 2: Regulären Browser und eigenen Katalogtransport bereitstellen

**Dateien:** Neu: `services/sniper/src/browser/vinted-browser.ts`, `browser-desktop.ts`, `browser-types.ts`; ändern: `services/sniper/src/vinted/collector.ts`, `config.ts`, `index.ts`, `package.json`/`package-lock.json`; Tests: `test/browser/vinted-browser.spec.ts`, `browser-desktop.spec.ts`, vorhandene Collector-, Konfigurations- und Timingtests.

**Schnittstellen:** Der Browser implementiert den vorhandenen `FetchLike`-Vertrag. `buildVintedCatalogUrl(query: SniperQuery, baseUrl: string): URL` wird aus dem Collector herausgelöst und von manueller Navigation wiederverwendet. `browser-types.ts` definiert zunächst den Eingabevertrag; Aufgabe 3 ergänzt den Sitzungsvertrag.

```ts
export type BrowserInput =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' };
export interface VintedBrowser {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  openManual(url: URL): Promise<void>;
  stopManual(): Promise<void>;
  captureFrame(): Promise<Uint8Array>;
  input(command: BrowserInput): Promise<void>;
  close(): Promise<void>;
}
```

- [ ] `playwright` exakt auf `1.63.0` als Bot-Laufzeitabhängigkeit hinzufügen; Lockfile mit npm erzeugen. `npm ci` im isolierten Arbeitszweig ausführen, nicht im ursprünglichen Checkout. Bot benutzt weiterhin seinen eigenen TypeScript-/Vitest-Vertrag.
- [ ] URL-Regressionstest mit bestehender Queryfixture schreiben: derselbe Kategorie-/Marken-/Preisabruf wie bisher, einschließlich rotierendem Markenrequest und Titelprüfung. Browsertransporttest mit injiziertem CDP-Testadapter schreiben: Status, Header und HTML bleiben erhalten; Skript im synthetischen Dokument wird nicht ausgeführt. Ein Test prüft, dass mitgegebenes `User-Agent`/`Cookie` nicht an Chrome weitergereicht wird.
- [ ] `npm test -- test/browser/vinted-browser.spec.ts test/vinted/collector.spec.ts` ausführen und den neuen Fehler bestätigen.
- [ ] Chrome regulär über `spawn` mit Argumentliste starten: eigener Profilpfad, `--no-first-run`, `--lang=de-DE`, Fenstergröße `1280,900`, Loopback-CDP, vorhandene sichere Chrome-Flags. Xvfb und optional vorhandenes Windowmanager-Muster übernehmen. Kein `--no-sandbox`. Prozessstart lazy, Profilprüfung vor Start; beendete Kindprozesse führen zu einem sichtbaren Browserfehler. Bei Shutdown sauber schließen, Profil nicht löschen.
- [ ] Lokales CDP anbinden. Einen Dokumentabruf pro Aufruf kontrollieren, die Antwort im Response-Intercept erfassen und die Navigation ohne Ausführung des gelieferten HTML beenden. Browser-Cookies bleiben im Profil. Timeout/Abbruch beendet die eigene Navigation und räumt Listener auf. Redirects auf fremde Origins und zusätzliche Katalognavigationen werden abgewiesen.
- [ ] Collector auf Browseridentität umstellen: manuelle Cookie-Map und gefälschte Chrome133-Header entfallen im aktiven Browserpfad. Parser, Normalisierung, Fehlererkennung und Titelmatcher bleiben erhalten. Kein automatischer Wechsel auf Node-HTTP bei Fehlern.
- [ ] Bestehende `pacedVintedFetch`, `countingFetch`, `RequestMetrics` und Budget verwenden; Kategorieabruf verwendet denselben Transport. Browsernebenanfragen bleiben im automatischen Modus verhindert. Native Desktopsteuerung übernimmt begrenzte `xdotool`-/Bildschirmbild-Muster des Workers, Text über stdin, keine Shellinterpolation.
- [ ] Tests ergänzen für Timeout mit verspäteter Antwort, Profilkonflikt, Prozessabsturz und fehlgeschlagenen Shutdown: keine zweite Sitzung. Alle Collector-, Browser-, Timing- und Konfigurationstests sowie `npm run typecheck` und `npm run build` ausführen. Commit: `feat(sniper): collect catalogs through a dedicated browser profile`.

## Task 3: Exklusive manuelle Sitzung und geprüfte Wiederaufnahme

**Dateien:** Neu: `services/sniper/src/browser/browser-session.ts`; ändern: `browser-types.ts`, `services/sniper/src/store/query.store.ts`, `runtime/scheduler.ts`, `index.ts`; Tests: `test/browser/browser-session.spec.ts` und relevante Scheduler-/QueryStoretests.

**Schnittstellen:** Der API-Vertrag wird hier vollständig definiert:

```ts
export type BrowserInput =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' };
export interface BrowserStatus {
  state: 'ready' | 'interaction_required' | 'manual' | 'unavailable';
  sessionId: string | null;
  expiresAt: string | null;
  message: string | null;
}
export interface BrowserSession {
  status(operatorId: string): Promise<BrowserStatus>;
  open(operatorId: string): Promise<BrowserStatus>;
  frame(operatorId: string, sessionId: string): Promise<Uint8Array>;
  input(operatorId: string, sessionId: string, command: BrowserInput): Promise<void>;
  verify(operatorId: string, sessionId: string): Promise<BrowserStatus>;
  close(operatorId: string, sessionId: string): Promise<void>;
  runAutomatic<T>(operation: () => Promise<T>): Promise<T>;
}
```

`QueryStore.activeQueries(): Promise<SniperQuery[]>` liest aktive, nicht ungültige Aufträge ohne Due-Filter. `dueQueries` verwendet denselben Lese-/Mappingpfad und behält seine Zeitfilter. Manuelle Prüfung wählt deterministisch den aktiven Auftrag mit frühestem letztem Abruf; nicht unterstützte alte Filterformate führen zu einem verständlichen Fehler ohne Freigabe.

- [ ] Test schreiben: Aus `interaction_required` öffnen, einen Betreiber zulassen, zweiten Betreiber ablehnen, genau zehn Minuten Laufzeit. Bei bereits geschlossenem/abgelaufenem Besitzerzugriff bleibt der Browser unbedient.
- [ ] `npm test -- test/browser/browser-session.spec.ts` ausführen und den fehlenden Sitzungsablauf bestätigen.
- [ ] Sitzung durch injizierte Uhr, `randomUUID`, bestehende Origin-/Query-/Listingstores und Browser betreiben. Kein Token im Sitzungsobjekt. Alle automatischen Zyklen einschließlich Kategorien laufen in `runAutomatic`; manuelle Bedienung beansprucht dieselbe Exklusivität. Die Laufzeitschleife prüft vor `runAutomatic` die persistierte Sperre und aktive Bedienung und überspringt dann den Zyklus ohne Fehlerzähleränderung. Beginnt ein Öffnen während eines automatischen Abrufs, wartet es auf dessen Ende und liest den Sperrzustand erneut.
- [ ] Öffnen nur bei `interaction_required`; aktive Query laden und aktuelle Mindestabstände, `nextAttemptAt`/`Retry-After` und Budget prüfen. Ohne Query keine Navigation. CDP vor manueller Navigation trennen; Chrome selbst bedient danach JS/Cookies. Ablauf beendet Bedienung und lässt die persistierte Pause bestehen.
- [ ] Verifizieren: Besitzer/Laufzeit prüfen, manuelle Bedienung beenden, aktuelle Query neu lesen, genau einen Collectorabruf unter Budget/Timing durchführen. `completeRun` für dessen Revision/Cursor aufrufen. Nur bei `accepted: true` und weiter gültiger Sitzung danach Origin freigeben. Andere Ergebnisse behalten die Sperre und melden den konkreten Fehler. Wiederholungsoption für den Collector beim manuellen Nachweis auf einen Request begrenzen.

```ts
const result = await listings.completeRun(collectedListings, currentQuery);
if (!result.accepted) throw new Error('Suchauftrag wurde während der Prüfung geändert.');
await origin.reset('vinted');
```

Dieser Ausschnitt liegt innerhalb der exklusiven Operation nach erneut geprüfter Sitzungsberechtigung; ein Fehler vor `reset` darf den Origin nicht freigeben.

- [ ] Regressionen ergänzen: Filteränderung/Deaktivierung während Antwort, Speichern wirft, Sitzung läuft während Prüfung ab, erneute Prüfseite, Providerwartezeit, kein aktiver Auftrag, Neustart mit bestehender Dauersperre. Jeder Fall prüft explizit, dass `reset` nicht aufgerufen und keine Nebenprobe gestartet wird. Die bestehenden Testfixtures/Factories statt Produktionsdaten verwenden.
- [ ] Betroffene Tests, `npm run typecheck` und `npm run build` ausführen. Commit: `feat(sniper): require accepted catalog proof before resuming collection`.

## Task 4: Betreiber-API mit vollständiger Authentifizierung

**Dateien:** Neu: `services/sniper/src/browser/browser-http-api.ts`; ändern: `services/sniper/src/config.ts`, `index.ts`; Test: `test/browser/browser-http-api.spec.ts`.

**Schnittstellen:** `startBrowserApi({ host, port, session, verifyOperator }): Server`. `verifyOperator(token: string): Promise<string>` liefert ausschließlich die verifizierte Betreiberkennung oder wirft. API-Endpunkte:

| Methode | Pfad                                  | Nutzlast/Antwort                |
| ------- | ------------------------------------- | ------------------------------- |
| GET     | `/sniper-browser/status`              | `BrowserStatus`                 |
| POST    | `/sniper-browser/sessions`            | keine Nutzlast, `BrowserStatus` |
| GET     | `/sniper-browser/sessions/:id/frame`  | JPEG, keine JSON-Hülle          |
| POST    | `/sniper-browser/sessions/:id/input`  | `BrowserInput`, 204             |
| POST    | `/sniper-browser/sessions/:id/verify` | keine Nutzlast, `BrowserStatus` |
| DELETE  | `/sniper-browser/sessions/:id`        | 204                             |

- [ ] Tests mit localhost-HTTPserver und synthetischem Verifier schreiben: Jeder Endpunkt ohne Token 401; kein Betreiber 403; falscher Sitzungsbesitzer 409. Verifier wird auch für jedes Bild und jede Eingabe aufgerufen.
- [ ] `npm test -- test/browser/browser-http-api.spec.ts` ausführen; danach minimalen HTTPserver mit `node:http` und bestehendem Fehler-/Bodylimit-Muster des Workers implementieren.
- [ ] Token via `auth.getUser(token)` prüfen, anschließend `is_platform_operator` unter dem Benutzer-Bearer-Token abfragen. Service-Key weder als Betreiberidentität behandeln noch an den Browser schicken. Authfehler werden nicht gecacht. Nur auf dem konfigurierten privaten Host lauschen.
- [ ] Eingabe durch Zod validieren: Koordinaten endlich und in `[0,1]`; Text höchstens 256 Zeichen ohne Steuerzeichen; nur die vier genannten Tasten. Bodylimit 16 KiB, JPEG maximal 6 MiB und gültige JPEG-Kennung. `no-store` für alle Antworten; unbekannte Pfade 404, falsche Methode 405, Fehlerantworten ohne Token/HTML/Profilpfad.
- [ ] Tests für abgelaufenes Token, nach Öffnen entzogene Betreiberrolle, fremde UUID, ungültige Koordinaten, zu großen Body, ungültiges/zu großes Bild und API-Verfügbarkeit ohne laufenden Chrome ergänzen. Verifikation und Sitzungsschließen dürfen keine ungeschützten Sonderwege erhalten.
- [ ] Bot-API-Tests, Konfigurationstests und Typprüfung ausführen. Commit: `feat(sniper): expose operator-protected manual browser controls`.

## Task 5: Manuellen Zugriff in der vorhandenen Adminseite anbieten

**Dateien:** Neu: `src/app/features/platform-admin/models/sniper-browser.model.ts`, `services/sniper-browser.service.ts`, `components/sniper-browser-connect/sniper-browser-connect.component.ts/.html`; ändern: `pages/sniper-operation/sniper-operation.component.ts/.html`; Tests: neue `*.angular.spec.ts` neben Service/Dialog und `e2e/sniper-administration.spec.ts`.

**Schnittstellen:** Frontendmodelle spiegeln den in Aufgabe 3 implementierten JSON-Vertrag. Service bietet `status`, `open`, `frame`, `input`, `verify`, `close` mit denselben Endpunktsemantiken. Jede Anfrage verwendet das aktuelle Token aus `SupabaseService`; Bilder werden autorisiert als Blob geladen. Dialogoutput `closed` lädt anschließend den bestehenden Adminstand neu.

- [ ] Adminrichtlinie lesen. Angular-Service-Test mit echter Servicegrenze und Fetch-Testdouble schreiben: `/frame` bekommt Authorization, niemals einen URL-Token. API-Fehler werden sichtbar weitergegeben; fehlende Anmeldung startet keinen Request.
- [ ] `npm run test:angular -- src/app/features/platform-admin/services/sniper-browser.service.angular.spec.ts` ausführen und fehlende Serviceimplementierung bestätigen.
- [ ] Service implementieren, Typen aus dem tatsächlichen API-Vertrag definieren. Bestehende Supabase-Proxies bleiben unverändert. Status lädt erst auf der Botseite, nicht global im Header oder auf persönlichen Kontoseiten.
- [ ] Dialog mit `ModalShellComponent`, Buttons, externer HTML-Datei, OnPush und Signals umsetzen. Öffnen zeigt Ladezustand; erfolgreicher Start zeigt Bild, Restlaufzeit und Bedienung. Frame-Fetch seriell alle 1.000 ms, bei unsichtbarem Dokument pausieren. Koordinaten aus der tatsächlich gerenderten Bildfläche normalisieren, keine Einträge bei fehlendem Bild.
- [ ] Für Tastaturbedienung Fokusfläche und beschriftetes Texteingabefeld sowie Enter/Tab/Escape/Backspace-Steuerungen anbieten. „Zugriff erneut prüfen“ zeigt den serverseitigen Nachweisstatus, „Schließen“ gibt nur die manuelle Sitzung frei. Fehler oder Zeitablauf zeigen die bestehende Zugriffspause.
- [ ] `DestroyRef` räumt Timer/AbortController/Blob-URL auf. Späte Antworten werden über eine Sitzungs-/Abrufgeneration verworfen. Für genau die aktive Blob-URL gilt:

```ts
const previousFrame = this.frameUrl();
this.frameUrl.set(URL.createObjectURL(frame));
if (previousFrame) URL.revokeObjectURL(previousFrame);
```

Beim Schließen dieselbe URL widerrufen und den Signalwert leeren; eine Antwort einer bereits beendeten Generation darf diesen Ausschnitt nicht erreichen.

- [ ] Botseite um den neuen Status „Manuelle Prüfung erforderlich“ und Öffnenknopf ergänzen. Tests für doppelte Klicks, 401/403/409, Verifikationsfehler, abgelaufene Sitzung und verspätete Screenshots nach Close schreiben. E2E mit ausschließlich gefälschten Browserantworten um Tastatur/Fokus und vorhandene AXE-Prüfung ergänzen.
- [ ] Gezielt Angular-Tests für Dialog/Service und betroffene Adminseite ausführen; `npm run typecheck`, gezieltes ESLint, `npm run build`. Commit: `feat(sniper): add manual Vinted verification to the admin bot page`.

## Task 6: Browserfähiges Abbild und überprüfbaren Releasevertrag erstellen

**Dateien:** Ändern: `services/sniper/Dockerfile`, `.dockerignore`, `scripts/smoke-image.mjs`; `deploy/docker-compose.sniper.yml`, `deploy/Caddyfile`, `deploy/deploy.sh`, `scripts/deploy-script.test.mjs`; bei relevanter Erkennung `.github/workflows/ci.yml`; neue Bot-Browsersmoketests unter `services/sniper/test/browser/`.

**Schnittstellen:** `SNIPER_BROWSER_HOST=172.18.0.1`, `SNIPER_BROWSER_PORT=8081`, `SNIPER_BROWSER_PROFILE_DIR=/var/lib/flipbase-sniper/browser`, `SNIPER_BROWSER_CDP_PORT=9228`. Test-/Smokekonfiguration nutzt Loopback. `SUPABASE_ANON_KEY` wird als öffentliche Auth-API-Konfiguration geführt, ausschließlich serverseitige Schlüssel bleiben serverseitig. Gesundheitsendpunkte bleiben `127.0.0.1:8080`.

- [ ] Vorhandene Chrome-Docker-/Sandbox-Muster lesen. Deploytest ergänzen: Caddyroute `/sniper-browser/*` erreicht die private API, öffentliche IP-/CDP-Routen fehlen, Botkonfiguration wird vor Start geprüft. `node --test scripts/deploy-script.test.mjs` ausführen und den fehlenden Vertrag bestätigen.
- [ ] Debian-Chrome-Laufzeit nach `services/marketplace-worker/Dockerfile.chromium-session` bauen, weiterhin Multi-Stage, `USER node`, native Sandbox. Nur benötigte Xvfb/Desktoppakete übernehmen; keine persönlichen Manifest-/Broker-/Proxyabhängigkeiten.
- [ ] Compose um eigenes Profilvolume, `/tmp`-tmpfs, 128 MiB Shared Memory, 1 GiB Speicherlimit und ausreichendes PID-Limit ergänzen. Vorhandenen Chromium-Seccomp-Vertrag verwenden, `no-new-privileges`, `cap_drop: ALL`, nötige Sandbox-Capability aus dem geprüften vorhandenen Muster. Profile nicht als World-writable anlegen.
- [ ] Caddy ergänzt innerhalb `app.flipbase.de` vor dem Web-Fallback:

```caddyfile
@sniper_browser path /sniper-browser/*
handle @sniper_browser {
    reverse_proxy 172.18.0.1:8081
}
```

- [ ] Releasevorbereitung ergänzen: bereitgestelltes Compose, eigenes Profil mit UID/GID 1000 und `0700`, lesbare Seccomp-Datei und neue Envwerte vor dem Botstart prüfen. `deploy/deploy.sh` nutzt derzeit serverseitige Compose-Dateien; eine reine Änderung im Repo darf daher nicht als ausgeliefert gelten. Benötigte Konfiguration aus dem überprüften Releaseartefakt versionstreu bereitstellen oder im Release ausdrücklich vorbereiten und durch Deploytests absichern. Keine Livevorbereitung vor Releasefreigabe.
- [ ] Image-Smoke bleibt ohne Netzwerk erfolgreich: `/live` 200, `/health` 503, UID ungleich 0, kein Chrome ohne aktive Query. Zusätzlicher isolierter Browser-Smoke mit synthetischer lokaler Katalog-/Prüfseite prüft echten Chrome, Sandbox, Profilpersistenz, Response-Intercept ohne JS-Ausführung und native manuelle Bedienung. Dafür keine Vinted-URL und keine Produktionsprofile verwenden.
- [ ] In `services/sniper`: `npm test`, `npm run typecheck`, `npm run build`, `docker build --tag flipbase-sniper:manual-browser .`, `node scripts/smoke-image.mjs flipbase-sniper:manual-browser`. Deploytests und Caddyvalidierung mit bereitgestellten Testvariablen ausführen. CI führt diesen isolierten Browser-Smoke beim betroffenen Botbau aus.
- [ ] Geänderte Dateien formatieren und linten, Suitezuordnung prüfen, Changelog mit tatsächlichen Ergebnissen aktualisieren. Commit: `ci(sniper): provision and verify the dedicated browser runtime`.

## Abschluss und produktive Abnahme

- [ ] Gesamten Branch gegen die freigegebene Spec prüfen. Keine behobene Liveverbindung behaupten. Abhängigkeiten, Rollenprüfung, Pause, Speicherreihenfolge und Artefakt-/Serverkonfiguration unabhängig prüfen lassen.
- [ ] Gezielte lokale Prüfungen müssen erfolgreich sein; Ergebnisse und notwendige Servervorbereitung konkret berichten. Projektfrage stellen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“
- [ ] Nach Freigabe Branch pushen, deutschen PR erstellen und im Chat anhängen, Pflichtprüfungen abwarten, Merge-Commit verwenden. Releasepfad und bereitgestellte Browserkonfiguration prüfen; fehlende Voraussetzung vor dem Start beheben oder Release begründet stoppen.
- [ ] Nach Veröffentlichung wartet die manuelle Sitzung auf den Betreiber. Er bedient eine tatsächlich angebotene Prüfung selbst. Der Bot nimmt einen gültigen aktiven Katalog an; anschließend mindestens zehn reguläre 60-Sekunden-Abrufe beobachten. Eine erneute Prüfseite pausiert sofort und dauerhaft. Bei weiter abgewiesenem Zugriff den Befund melden.
- [ ] Erst nach bestätigtem Merge eigenen Remote-/lokalen Branch und zugehörigen Worktree nach Projektregel aufräumen. Persönliche Kontositzungen und Produktionssuchbedingungen bleiben getrennt von diesem Abschluss.

## Ausführungswahl

Empfohlen: Umsetzung durch Juna in dieser Sitzung, Aufgabe für Aufgabe, danach eine unabhängige Prüfung des gesamten Branches. Die Browser-, Sitzungs- und Schedulerteile teilen enge Schnittstellen; eine gemeinsame Umsetzung vermeidet zusätzliche Übergaben. Alternativ kann jede Aufgabe von einem eigenen Unteragenten umgesetzt und geprüft werden. Umsetzung beginnt nach Prüfung dieses Plans und Wahl des Vorgehens.
