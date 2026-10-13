# Flipbase PWA: genauer Umsetzungsplan

> **Für die Umsetzung:** Aufgaben einzeln mit `superpowers:executing-plans` abarbeiten. Parallele Agentenarbeit nur nach ausdrücklicher Auswahl durch den Nutzer. Jeder Schritt hat ein überprüfbares Ergebnis. Dieses Dokument ist ein Planungsentwurf; Produktcode und Veröffentlichung sind noch nicht beauftragt.

**Ziel:** Installierbare mobile Flipbase-App mit sichtbarem Start, sicheren Updates, echten Push-Meldungen und lokalen Einkaufsentwürfen.

**Architektur:** Bestehenden Worker um baugebundene statische Dateien und Push-Empfang ergänzen. Geräteverwaltung und dauerhafter Versand entstehen serverseitig; lokale Einkaufsentwürfe bleiben fachlich und technisch von Serverdaten getrennt und werden ausdrücklich im vorhandenen Onlineformular übernommen.

**Techstack:** Angular 22.2, Tailwind 4, Signals, native Service Worker / Push API / IndexedDB, Supabase/Postgres, Deno für Geräte-API, kleiner Node-Versanddienst; Vitest und Playwright. Versionen stammen aus `package.json`, keine Versionsanhebung geplant.

**Design:** [Zielbild und geprüfter Bestand](../specs/2026-10-13-pwa-mobile-app-design.md).

## Globale Vorgaben

- Bestehende Installation mit `id: /` erhalten; `scope: /`, Sprache `de`, Markenakzent `#fcc601`.
- Deutsch und Du-Ansprache in UI; englische Bezeichner und Dateinamen; neue Branches `juna/…`.
- Shared-Controls und `docs/design/admin-ui-guidelines.md` verwenden; kein neues UI-Kit.
- Kein API-/Auth-/Privatmedien-Cache. Offline nur App-Start und Einkaufsentwürfe; keine automatische Buchung.
- Keine manuelle Änderung generierter Supabase-Typen; Backend-Verträge zuerst, danach lokale Typengenerierung.
- Push zunächst `message`, `order`, `connection`; keine neue Vinted-Fundfunktion.
- Neue Versandbibliothek und Betriebsdienst sind vorgeschlagene Backend-Abhängigkeiten, vor Umsetzung zusammen mit dem Plan zu bestätigen. Keine handgeschriebene Web-Push-Kryptografie.
- Entwurfsgrenzen: 100 Entwürfe, 100 Positionen je Entwurf, 10 MiB insgesamt; lokaler Kontext 7 Tage; Autosave ≤ 500 ms.
- Startwarnung nach 10 s, Fehlerzustand nach 30 s; keine künstliche Mindestladezeit; zusätzlicher Startcode ≤ 10 KiB gzip.
- Keine riskanten Migrationen oder Paket-Upgrades ohne Auftrag. Schema + generierte Migration + Backendtests in demselben PR.
- Nur eigene Dateien und Branches verändern. `docs/AI-CHANGELOG.md` je Umsetzungssitzung pflegen.
- Vor Push gezielte Tests, geänderte Dateien formatieren/linten und bei Angular-Änderungen Produktionsbau; volle Pflichtprüfungen einmal im PR. Nach Umsetzung gilt die vereinbarte PR-/Merge-Rückfrage.

## Besonders zu prüfende Grenzfälle

| Risiko                                             | Erwartetes Verhalten                                                                                   | Zuständige Aufgaben |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| Netz meldet online, API ist unerreichbar           | Keine Erfolgsmeldung, kein falsches „Beta beendet“; nur lokale Entwürfe anbieten                       | 5, 11, 12           |
| Neue Version bei offenem Formular oder zweitem Tab | Kein erzwungener Reload/Datenverlust; alte Lazy-Chunks bleiben nutzbar                                 | 4, 5, 14            |
| Abgemeldet, anderer Nutzer, entzogene Rechte       | Keine fremden Entwürfe/Push-Inhalte; Zugriff erneut prüfen                                             | 6, 8, 10, 11, 13    |
| Kauf wurde gespeichert, Antwort geht verloren      | Wiederholung mit identischer `request_id` liefert denselben Kauf                                       | 13                  |
| Gerät verwirft Speicher oder beendet den Worker    | Zustand bleibt ehrlich; Wiederholung begrenzt; lokal ungesicherte Daten nicht als gespeichert anzeigen | 4, 7, 11, 12        |

## Reihenfolge und Zuständigkeit

| Paket                          | Aufgaben | Ergebnis                                                         | Abhängigkeit                                  |
| ------------------------------ | -------- | ---------------------------------------------------------------- | --------------------------------------------- |
| A: Installation und App-Gefühl | 1–3      | Ladebildschirm, ehrliche Installation, Smartphone-/Tablet-Rahmen | keine neue Backendfunktion                    |
| B: Worker und Updates          | 4–5      | Vollständiger Offline-Dateistand und kontrollierte Updates       | A; versionswechselnder Produktionsbau         |
| C1: Push-Server                | 6–8      | Geräteverträge und dauerhafter Versand, zunächst Pilotfreigabe   | Backend-Zuständigkeit und Bibliotheksfreigabe |
| C2: Push-App                   | 9–10     | Aktivierung, Testmeldung, Antippen und Abmeldung                 | B + C1                                        |
| D: Einkaufsentwürfe            | 11–13    | Lokal erfassen, online prüfen und sicher speichern               | B; vorhandener `create_purchase`-Vertrag      |
| E: Geräteabnahme               | 14       | Tatsächlich getestete PWA statt bloßer Sourcecode-Zusage         | alle Pakete                                   |

Empfohlen: A, B, C1, C2, D, E. Push hat vor dem Offline-Entwurfsausbau Vorrang. Jeder PR muss einen sinnvollen Teilstand liefern; unfertige Push-Schalter und Offline-Versprechen bleiben unsichtbar.

## Gemeinsame Vertragsnamen

Die folgenden Namen sind geplante neue Verträge, keine Behauptung vorhandener APIs. Implementierung und Vertragsprüfungen entstehen gemeinsam in ihrer jeweiligen Aufgabe.

- `PwaInstallState = 'standalone' | 'prompt_available' | 'manual' | 'unsupported'`.
- `PwaService.isStandalone`, `installState`, `offlineAssetsReady`, `updateAvailable`; Netzwerkhinweis bleibt `isOnline` und beweist keine API-Erreichbarkeit.
- `AppStartupService.markRouteRendered(): void`, `failStartup(reason: 'bootstrap' | 'navigation' | 'asset'): void`.
- `PwaUpdateService.checkForUpdate(): Promise<void>`, `applyUpdate(): Promise<'applied' | 'blocked' | 'failed'>`.
- `PushCategory = 'message' | 'order' | 'connection'`; `PushDeviceStatus = 'unsupported' | 'needs_installation' | 'permission_required' | 'denied' | 'registering' | 'active' | 'error'`.
- `WebPushService.enableDevice(): Promise<void>`, `disableDevice(): Promise<void>`, `sendTest(): Promise<{ eventId: string }>`, `updatePreferences(workspaceId: string, categories: readonly PushCategory[]): Promise<void>`.
- Geräte-API: neue Edge Function `push-settings`, POST-Aktionen `register`, `preferences`, `test`, `revoke`. Antworten liefern Geräte-ID und Status, nie private VAPID-Schlüssel oder andere Geräte-Endpunkte.
- `PushPayloadV1`: `version: 1`, `eventId`, `category`, `workspaceId`, `title`, `body`, `target`. Ziel ist eine diskriminierte Struktur für Nachrichten-/Bestell-/Kontoziel, keine freie URL.
- `OfflinePurchaseDraft`: `schemaVersion: 1`, `draftId`, `requestId`, `userId`, `workspaceId`, `revision`, `updatedAt`, `content`, `state: 'local' | 'review_required' | 'transferring' | 'transferred'`, optionale `purchaseId`.
- `OfflinePurchaseDraftStore.list(context)`, `read(context, draftId)`, `save(draft, expectedRevision)`, `markTransferred(context, draftId, purchaseId)`, `export(context)`; alle asynchron, `context = { userId, workspaceId }`.
- Übertragung nutzt vorhandenes `PurchaseService.createPurchase(payload: CreatePurchasePayload): Promise<CreatePurchaseResult>` und `request_id`; kein neuer Einkaufs-RPC.

## Aufgabe 1: sichtbarer Start mit Fehlerbehandlung

**Dateien:** ändern `src/index.html`, `src/main.ts`, `src/app/app.ts`, `src/styles.css`; neu `public/app-startup.js`, `src/app/core/services/app-startup.service.ts`, `src/app/core/services/app-startup.service.dom.spec.ts`, `scripts/app-startup.test.mjs`.

**Vertrag:** externer Helfer empfängt `flipbase:startup-ready` und `flipbase:startup-failed` vom Dienst. Er verändert nur die eigene Startfläche per DOM-APIs; keine HTML-Injektion. `Router`-Ergebnis plus `afterNextRender` geben die App frei.

- [ ] Test für sichtbares HTML ohne Angular schreiben; Status 10 s/30 s mit Fake-Timern, blockierten localStorage, reduzierte Bewegung und später erfolgreichen Start prüfen.
- [ ] `node --test scripts/app-startup.test.mjs` sowie `npx vitest run --project=dom src/app/core/services/app-startup.service.dom.spec.ts` ausführen; neue Anforderungen müssen zunächst rot sein.
- [ ] Statische Startfläche und externen Helfer umsetzen. Theme-Auswahl mit vorhandenem `flipbase_theme` kompatibel halten. Normale Bootstraps, Navigationsabbrüche und tatsächliche Fehler auseinanderhalten; keine Freigabe bei leerem `app-root`.
- [ ] `markRouteRendered()` beim ersten sichtbaren Routenzustand auslösen, Bootstrap-Catch in `main.ts` an `failStartup()` anbinden. Nach Erfolg Helfer-Timer und Zuhörer entfernen.
- [ ] Tests grün ausführen, `npm run typecheck`, Produktionsbau und CSP-konforme Browserprüfung. Kein Inline-Skript, kein Flash vom falschen Theme, keine Mindestwartezeit.
- [ ] Fokussierten Commit erstellen: `feat(core): add a resilient app startup screen`.

**Abnahme:** Nutzer sieht sofort Logo und Status; Startfehler haben Wiederholungsaktion; Warmresume erzeugt keinen künstlichen Neustart.

## Aufgabe 2: Installation und App-Status richtig darstellen

**Dateien:** ändern `public/manifest.webmanifest`, `src/app/app.config.ts`, `src/app/core/services/pwa.service.ts`, `src/app/core/services/pwa.service.spec.ts`, `src/app/features/settings/pages/app-settings/app-settings.component.{ts,html}`, `src/app/layout/sidebar/sidebar.component.html`; neu `src/app/core/services/pwa.service.dom.spec.ts`; vorhandene `src/app/features/settings/pages/settings-behavior.angular.spec.ts` ergänzen.

**Vertrag:** `installState` unterscheidet laufenden App-Modus, verfügbaren Dialog und manuelle Hilfe. `promptInstall()` meldet nur bestätigte Annahme; Verbrauch/Abbruch/Fehler setzen den gespeicherten Dialog passend zurück. Browserfenster bleibt Browserfenster nach bloßem `appinstalled`.

- [ ] Tests für Chromium-Dialog, Verbrauch und zweiten Klick, Abbruch, manuelle Apple-Hilfe, nicht unterstütztes Gerät und Wechsel von `display-mode` schreiben.
- [ ] Node-/DOM-/Angular-Tests gezielt ausführen und neue Fälle rot bestätigen.
- [ ] Manifest auf stabile Identität und existierende Schnellziele prüfen; explizites Scope/Sprache ergänzen. Installation im Sidebar-/Einstellungsbereich konsistent und ohne wiederholte Aufforderung abbilden.
- [ ] PWA-Lebenszyklus im App-Einstieg initialisieren, bevor eine lazy Headerkomponente entsteht; keine Startup-Blockade durch eine Promise auf Worker-/Netzbereitschaft. Test auf der Loginroute ohne Header ergänzt die Dialogtests.
- [ ] Texte „native App“, „Offline-Zugriff beim Sourcing“ und „Offline-Cache aktiv“ durch belegbare Status ersetzen. Bis Aufgabe 12 nur Datei-Cache und Online-Erfordernis nennen.
- [ ] Alle drei Testprojekte grün; Format/ESLint der betroffenen Dateien; `npm run build`.
- [ ] Commit: `fix(core): clarify PWA installation and device status`.

**Abnahme:** Kein sichtbarer wirkungsloser Installationsbutton; Hilfe und App-Modus sind nachvollziehbar.

## Aufgabe 3: mobile Bildschirmflächen und Tastatur

**Dateien:** ändern `src/index.html`, `src/styles.css`, `src/app/layout/shell/shell.component.html`, `src/app/layout/header/header.component.html`, `src/app/layout/bottom-nav/bottom-nav.component.html`; nötige Änderungen zentral in `src/app/shared/components/modal-shell/` und `src/app/shared/components/toast/`; neu `e2e/pwa-mobile-layout.spec.ts`.

**Vertrag:** zentrale CSS-Variablen für vier Safe-Area-Insets, dynamische Mindesthöhe und Bottom-Navigation inklusive zusätzlicher Safe Area; Inhalte berechnen ihren unteren Abstand daraus.

- [ ] E2E für 390 × 844, 844 × 390, 768 × 1024 und 512 × 768 schreiben: kein horizontaler Seitenüberlauf, Fokusfeld erreichbar, Footeraktionen sichtbar, Overlays über Navigation, 200-%-Zoom.
- [ ] Reale Tastatur und Displayaussparung zusätzlich in die Gerätecheckliste übernehmen; Emulation als Ergänzung kennzeichnen.
- [ ] `viewport-fit=cover` mit Insets gemeinsam einführen. Bestehende 44-Pixel-Touchziele und Shell-Abstände erhalten; keine pauschale neue Tabletdichte.
- [ ] `npm run test:e2e -- e2e/pwa-mobile-layout.spec.ts`, vorhandene Shell-/Bottom-Nav-/Modal-Tests und AXE für Hell/Dunkel ausführen; Produktionsbau.
- [ ] Commit: `fix(ui): adapt app layout to mobile safe areas`.

**Abnahme:** Home-Indikator, Querformat und Bildschirmtastatur verdecken keine Hauptaktion.

## Aufgabe 4: vollständiger und baugebundener App-Cache

**Dateien:** ändern `public/sw.js`, `package.json`, `docker/nginx.conf`, bei nötiger Bauintegration `docker/Dockerfile`; neu `scripts/write-pwa-assets.mjs`, `scripts/write-pwa-assets.test.mjs`, `scripts/service-worker-cache.test.mjs`. `dist/flipbase/browser/pwa-assets.json` entsteht ausschließlich als Bauartefakt.

**Vertrag:** `write-pwa-assets.mjs <browser-output>` erfasst erlaubte Dateien, deren SHA-256 und eine daraus deterministisch abgeleitete Build-ID; ersetzt den Worker-Buildplatzhalter im dist-Worker. Gleicher Dateistand ergibt gleiche ID. `sw.js` prüft Inventar-ID und Dateihashes, bevor er den neuen eigenen Cache freigibt. Entwicklungsquelle bleibt ohne produktiven Worker.

- [ ] Tests für neue Lazy-Chunk-Datei ohne Workerquelländerung, fehlende Datei, veränderten Dateiinhalt, manipuliertes Inventar und unveränderten Build schreiben.
- [ ] Cachetests mit echten Request/Response-Objekten für Auth/API/Storage/Functions/Proxy-URLs schreiben; eigene Geschäftsdatei mit `.json` darf nicht allein durch die Endung cachebar werden.
- [ ] Skript in den npm-Produktionsbau einbinden, sodass auch Testbau und Docker denselben Vertrag nutzen. Node-Kernbibliotheken genügen; keine Abhängigkeit nötig.
- [ ] Worker installiert Dateien vollständig mit `event.waitUntil`; keine Aktivierung bei Teilfehler. Navigation liefert den zum aktiven Bau passenden Shell-Stand. Eigene Caches begrenzen und fremde Cache-Namen erhalten; Hashfiles früherer Clients weiterhin aus eigenem Altcache finden.
- [ ] Nginx: `application/manifest+json` für Manifest, JSON-MIME für Inventar; Starthelfer, Worker, Manifest und Inventar revalidieren. Immutable-Header nur für nachweislich versionierte Dateinamen. Vorhandene Sicherheitsheader bleiben in allen Locations erhalten.
- [ ] `node --test scripts/write-pwa-assets.test.mjs scripts/service-worker-cache.test.mjs`, `npm run build` und zwei aufeinanderfolgende Produktionsbau-Stände prüfen. Neue Workerbytes und vollständig gespeicherte Chunks nachweisen.
- [ ] Commit: `feat(core): bind offline app assets to each production build`.

**Abnahme:** Offline-Erstbesuch einer vorbereiteten Lazy-Route funktioniert; unvollständiger neuer Bau ersetzt keinen funktionierenden aktiven Bau.

## Aufgabe 5: kontrollierte Aktualisierung ohne Eingabeverlust

**Dateien:** ändern `public/sw.js`, `src/app/core/services/pwa.service.ts`, `src/app/layout/header/header.component.{ts,html}`, `src/app/layout/shell/shell.component.ts`; neu `src/app/core/services/pwa-update.service.ts`, `src/app/core/services/pwa-update.service.dom.spec.ts`, `src/app/shared/components/pwa-update-notice/pwa-update-notice.component.{ts,html}`, zugehörige `.angular.spec.ts`.

**Vertrag:** Worker sendet Update-/Dateibereitschaftsstatus, aktiviert erst nach `ACTIVATE_UPDATE`; Dienst bietet `applyUpdate()` und prüft Context-Lock sowie laufende lokale Sicherungen. Eine Routenregistrierung für ungespeicherte Änderungen wird mit vorhandenen Formular-/Guard-Verträgen verbunden, keine neue globale Formulararchitektur.

- [ ] Tests für Updatebereitstellung, „Später“, offene Einkaufsmaske, Upload, laufendes Autosave, zweiten Tab und genau einen Reload bei Controllerwechsel schreiben.
- [ ] Sofortiges `skipWaiting()` ersetzen. Aktualisierung beim Start und Rückkehr aus längerem Hintergrund prüfen, ohne jedes Sichtbarkeitsereignis in einen Netzsturm zu verwandeln.
- [ ] Aktivierungsbarriere für alle offenen App-Clients implementieren: Zustimmung nur nach lokal geprüftem sicheren Zustand. Nach 2 s ohne Antwort oder bei gesperrter Ansicht Update blockieren und Speichern/Schließen der anderen Ansicht erklären. Controllerwechsel nicht automatisch in jeder Ansicht erzwingen.
- [ ] Hinweis mit Shared-Buttons und ehrlichen Meldungen implementieren. Blockiertes Update erklärt „Speichere oder verwerfe zuerst deine offenen Änderungen.“ Lokale gespeicherte Entwürfe verhindern unnötige Blockade nicht dauerhaft.
- [ ] API-Nichterreichbarkeit getrennt vom `navigator.onLine`-Hint halten; kein automatisches neues Auth-/Beta-Verhalten in diesem Paket.
- [ ] DOM-/Angular-Tests grün, alter und neuer Produktionsbau im Browser mit offenem Formular; Format/Lint/Bau.
- [ ] Commit: `feat(core): protect unsaved work during PWA updates`.

**Abnahme:** App-Update ist sichtbar und steuerbar; ungespeicherte Daten werden nicht automatisch verworfen.

## Aufgabe 6: Backend-Vertrag für Geräte und Einstellungen

**Zuständigkeit:** Backend-Umsetzung. Pflichtauftrag: `C:/Users/gt/Desktop/Backend Issues/pwa-mobile-plan/01-pwa-web-push.md`.

**Geplante Dateien:** `supabase/schemas/470_web_push_devices.sql`, erzeugte neue Migration, `supabase/config.toml`, `supabase/tests/web-push-devices.test.sql`, `supabase/functions/push-settings/{index,handler,contracts}.ts`, `supabase/functions/push-settings/handler.test.ts`. Generierte `src/app/core/models/supabase.types.ts` nur nach laufender lokaler API erzeugen.

**Vertrag:** Tabellen `web_push_devices` und `web_push_preferences`. Gerät enthält interne ID, Nutzer-/Sitzungsbindung, Installation-ID, Endpunktfingerprint, geschützten Endpunkt und Schlüssel, VAPID-Version, Aktivstatus und letzte Bestätigung. Präferenzen enthalten Geräte-ID, Workspace-ID und freigegebene Kategorien. Endpunkt und Schlüssel sind nicht für andere Clients lesbar.

- [ ] SQL-/API-Tests für Nutzer A/B, fremden Workspace, widerrufene Sitzung, gleiche Installation bei neuem Nutzer, doppelte Registrierung, fehlende Berechtigung und unbekannte Payloadfelder schreiben.
- [ ] `register` validiert authentifizierten Nutzer und Sitzung; Idempotenz auf Installation-/Endpunktbindung; keine vom Client frei übernommene `user_id`. `preferences` verlangt aktuelle Mitgliedschaft und passende Fachrechte.
- [ ] `revoke` deaktiviert nur eigenes Gerät; `test` ist auf eigene aktive Bindung und aktuellen Workspace begrenzt, höchstens 3 Anfragen pro Minute und Gerät. Neue Kategorien standardmäßig aus; Aktivierung braucht ausdrückliche Nutzeraktion.
- [ ] SQL nach Projektvorgabe deklarativ pflegen, `schema_paths` ergänzen, Diff erzeugen und vollständig reviewen. Separate Operation-/Rollenpolicies, RLS, notwendige Indizes und serverseitige Rechte festlegen. Keine Secrets in generierten Typen/Frontendkonfiguration.
- [ ] `npm run test:db` und `deno test --allow-env supabase/functions/push-settings/handler.test.ts`; nach laufendem lokalem Schema Typen generieren und API-Vertrag dokumentieren.
- [ ] Backend-Commit: `feat(core): register authenticated web push devices`.

**Abnahme:** Ein Gerät kann sicher registriert, konfiguriert, getestet und widerrufen werden; anderer Nutzer bekommt weder Binding noch Geheimnisse.

## Aufgabe 7: dauerhafter Push-Versand

**Zuständigkeit:** Backend/Betrieb. Geplante Dateien `supabase/schemas/471_web_push_delivery.sql`, Migration und `supabase/tests/web-push-delivery.test.sql`; neuer begrenzter Dienst `services/push-worker/` mit `package.json`, Lockfile, `Dockerfile`, `src/{main,config,push-dispatcher,push-delivery-store,push-provider}.ts`, `test/*.test.ts`; `deploy/docker-compose.push.yml` und erforderliche Integration in `deploy/deploy.sh`.

**Vertrag:** `web_push_events` speichert serverseitig belegtes Ereignis; `web_push_deliveries` enthält pro Ereignis/Gerät Unique-Schlüssel, Lease, Attempts, `next_attempt_at`, Anbieterbestätigung und letzte Fehlerklasse. SQL-Claim nutzt atomare Zeilensperre/Lease. `PushProvider.send(subscription, payload): Promise<'accepted' | 'expired' | 'retry' | 'configuration_error'>` kapselt Bibliothek und Anbieterstatus.

- [ ] Tests für zwei Worker, Crash nach Lease, Crash nach Anbieterannahme, wiederholte Quelle, 404/410, 429 mit `Retry-After`, 5xx, falschen VAPID-Key, fremde/innere Endpoint-URLs und Redirect schreiben.
- [ ] Pin einer überprüften Web-Push-Bibliothek festlegen und Deno-/Node-Verfügbarkeit nicht behaupten: Versand bewusst im Node-Dienst; Edge Function bleibt Geräteverwaltung. Keine Übernahme unversionierter npm-Abhängigkeit.
- [ ] Versanddienst als eigenen ressourcenbegrenzten Prozess implementieren: Poll alle 5 s, maximal 20 Claims je Batch, maximal 4 parallele Sends, 10-s-Sendtimeout, 60-s-Lease. Temporäre Fehler maximal 5 Versuche inklusive Erstversuch, mit den im Design genannten Abständen und 24-h-Ereignisgrenze.
- [ ] Aktuelle Nutzer-/Workspace-/Kategorie-/Sitzungsrechte unmittelbar vor Send prüfen. Anbieter-URLs vor Registrierung und vor Send verifizieren; DNS/Redirect-Schutz und Grenzen nicht allein an einen Regex delegieren.
- [ ] VAPID-Secrets nur im Serverprozess; erforderliche Umgebungsvariablen `WEB_PUSH_ENABLED=false`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`, `WEB_PUSH_VAPID_KEY_ID` im Betrieb dokumentieren, ohne Werte in Logs/Repo. Selektive Pilotfreigabe je Nutzer/Gerät vor globaler Freigabe.
- [ ] Gesundheitsstatus und Zähler für wartend/accepted/retry/expired/configuration_error anbieten; Protokolle nur interne IDs. Versand deaktivieren stoppt neue Claims, lässt andere Appfunktionen weiterlaufen. Versandhistorie 7 Tage, Ereignisse 30 Tage, deaktivierte Bindungen 30 Tage halten und kontrolliert bereinigen.
- [ ] SQLtests, Diensttests und Container-Smoke ausführen; Migration erzeugen/reviewen. Datenbank-Commit und zugehörigen Betriebsstand im selben PR liefern.
- [ ] Commit: `feat(core): deliver web push from a durable outbox`.

**Abnahme:** Gespeicherte Ereignisse überleben Neustarts; keine unbeschränkte Wiederholung; Konfigurationsfehler deaktivieren nicht alle Endgeräte.

## Aufgabe 8: echte Ereignisse statt Client-Auslöser

**Geplante Dateien:** neue `supabase/schemas/472_web_push_events.sql`, erzeugte Migration, `supabase/tests/web-push-events.test.sql`; eng begrenzte Integration an `425_marketplace_message_notifications.sql`, `330_ebay_order_import.sql`, `database.sql` für `store_orders` und `250_marketplace_accounts.sql` bzw. dem zuständigen Kontostatusschreiber. Bestehende Migrationen nicht ändern; Deklarativänderung und erzeugter Diff gehören zusammen.

**Vertrag:** stabile Source-ID und Kategorien `message`, `order`, `connection`. Ereignis + Outbox im gleichen Commit der Geschäftstransaktion. Event-Erzeugung erst bei autoritativer Speicherung; keine freie `app_notifications`-Zeile als Sendebefehl.

- [ ] Tests für Erstbestand, später neue Nachricht, zunächst unbekanntes Gespräch und spätere Auflösung, identischen Folgeimport, neue Bestellung und historisches Bestell-Backfill schreiben.
- [ ] Nachrichten: nur vorhandene belegte Eingangsereignisse und aufgelöste Gesprächsreferenz; Erstbaseline und eigene ausgehende Nachrichten unterdrücken. Erst neu sichtbare Meldung einmalig in die Outbox aufnehmen.
- [ ] Bestellungen: erste nach Aktivierungswatermark beobachtete neue eBay-/Shop-Bestellung senden; Erstimport historischer Bestellungen ausdrücklich ohne Benachrichtigung. Bestehende Bestellupdates erzeugen keine „neue Bestellung“.
- [ ] Kontoprobleme: nur belegter Wechsel aus nutzbar zu notwendiger Reauthentifizierung, mit einem Ereignis pro Störungsfolge; Pause/Disconnect durch Nutzer und flüchtiger Netzwerkfehler nicht melden. Erholung beendet die Folge und erlaubt eine spätere neue Störung.
- [ ] Ereignisrechte pro Empfänger aus aktuellen fachlichen Policies ableiten. Bestehende workspaceweite Gelesen-Markierung nicht durch gerätespezifischen Push verändern.
- [ ] SQLtests grün; wiederholten Import und Membership-Entzug vor Versand nachweisen; generierte Migration reviewen.
- [ ] Commit: `feat(core): enqueue push for verified marketplace events`.

**Abnahme:** Neue fachliche Ereignisse werden einmal logisch aufgenommen; Reconnect und Erstimport verursachen keinen Meldungssturm.

## Aufgabe 9: Push-Gerät in der App aktivieren und prüfen

**Dateien:** ändern `src/app/core/services/web-push.service.ts`, vorhandene Verbraucher in `store.service.ts`, `fulfillment.service.ts`, `return.service.ts`, `tax-advisor.service.ts` nur soweit ihr Vertrag betroffen ist; Einstellungen `notification-settings.component.{ts,html}`; neu `src/app/core/models/web-push.models.ts`, `src/app/core/services/web-push-api.service.ts`, entsprechende `.dom.spec.ts`/`.spec.ts`; vorhandene Einstellungs-Angulartests ergänzen.

**Vertrag:** `WebPushService` verwendet die gemeinsamen Status-/Kategorieverträge und die echte Geräte-API. Alte lokale `sendNotification`-Nutzer bleiben zunächst inhaltsarme Vordergrundhinweise; sie legen keine Push-Ereignisse an. Ein lokaler Funktionsaufruf darf nicht als Serverversand dargestellt werden.

- [ ] Tests für fehlende Fähigkeiten, Apple-Browser statt Home-App, Freigabe abgelehnt, Worker nicht bereit, Subscribe ok/API fehlgeschlagen, vorhandenes Abonnement und Kontowechsel schreiben.
- [ ] Fähigkeit vor Nutzeraktion prüfen. `Notification.requestPermission()` muss direkt aus der Nutzeraktion stammen, nicht erst nach langen Netzoperationen. Worker-/Schlüsselbereitschaft vorher herstellen und dann `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` ausführen.
- [ ] Registrierung und Kategorien speichern; Fehler rollbacken oder als ausstehend zeigen. Persistierte Browserfreigabe allein ist nicht „Push aktiv“.
- [ ] Einstellungen bieten „Dieses Gerät aktivieren“, drei Kategorien je Workspace, Geräte deaktivieren und „Testbenachrichtigung senden“. Test muss durch Aufgabe 7 gehen, nicht `new Notification()` verwenden. UI sagt bei Anbieterannahme „Test zur Zustellung übergeben“.
- [ ] Alte globale Browserpräferenzen nicht ungefragt als serverseitige Freigabe migrieren. Shared-Buttons/Checkboxen verwenden; Berechtigungsdialog nicht bei jedem Start erneut öffnen.
- [ ] DOM-/Node-/Angular-Vertragstests, Typecheck und Bau; Pilot mit gültigem Backend auf eigenem Gerät.
- [ ] Commit: `feat(core): enable real push notifications per device`.

**Abnahme:** Angezeigter Aktivstatus entspricht Browser und Server; echte Testmeldung erreicht das Pilotgerät auch bei geschlossener App.

## Aufgabe 10: Push empfangen, öffnen und sauber widerrufen

**Dateien:** ändern `public/sw.js`, `src/app/core/services/auth.service.ts`, `src/app/core/services/web-push.service.ts`, bei Bedarf `src/app/layout/shell/shell.component.ts`; neu `src/app/core/services/push-navigation.service.ts`, `src/app/core/services/push-navigation.service.angular.spec.ts`, `scripts/service-worker-push.test.mjs`, `e2e/pwa-push-navigation.spec.ts`.

**Vertrag:** validierter `PushPayloadV1`, `showNotification` mit stabilem Tag aus `eventId`; `notificationclick` übermittelt nur strukturierte IDs. Navigation löst Anmeldung, Rechte und vorhandenen Context-Lock auf, bevor sie Workspace/Ziel wechselt. Ein Same-Origin-Einstiegsziel erhält den Pushkontext; kein freier fremder URL-Parameter.

- [ ] Tests für kaputtes JSON, falsche Version, fremde URL, unaufgelöste IDs, offene und geschlossene App, abgelaufene Sitzung, entzogenes Workspace-Recht und offenes Formular schreiben.
- [ ] `push`/`notificationclick` mit `event.waitUntil` implementieren. Bestehenden passenden Client fokussieren oder App öffnen; immer sichtbare, inhaltsarme Meldung. Nachrichtenziel entspricht dem geprüften Nachrichten-Inbox-Vertrag.
- [ ] Server-Revoke im Logoutfluss einbinden, lokale Subscription bereinigen; nach Offline-Logout dauerhafte Revoke-Absicht vor Neuaktivierung abarbeiten. Kein Rückfall auf Altbesitzer bei neuen Logins. Benutzeraktion und erzwungenen Sitzungswiderruf unterscheiden.
- [ ] Vordergrundhinweise und OS-Push deduplizieren, ohne Glocken-Lesestatus ungefragt zu verändern. Zugestellte alte OS-Meldungen zeigen beim Öffnen keine ungeprüften Details.
- [ ] `node --test scripts/service-worker-push.test.mjs`, Angular-/E2E-Navigationstests; echte Push-Zustellung nach Schließen separat auf iOS/Android nachweisen.
- [ ] Commit: `feat(core): handle push navigation and device revocation`.

**Abnahme:** Antippen führt zum berechtigten Ziel; Logout und Nutzerwechsel hinterlassen keine aktive Bindung des alten Nutzers.

## Aufgabe 11: lokaler Entwurfsspeicher und begrenzter Kontext

**Dateien:** neu `src/app/features/purchases/models/offline-purchase-draft.models.ts`, `src/app/features/purchases/services/offline-purchase-draft.store.ts`, `src/app/features/purchases/services/offline-purchase-context.service.ts`, jeweilige `.dom.spec.ts`; ändern Auth-/Workspace-Lebenszyklus nur für lokale Registrierung/Sperre. Vorhandene `browser-storage-initialization.ts` und `legacy-business-cache.ts` bleiben mit ihrem Bereinigungsvertrag kompatibel.

**Vertrag:** IndexedDB `flipbase-purchase-drafts`, DB-Version 1, Stores `contexts` und `drafts`; Entwurfschlüssel `[userId, workspaceId, draftId]`. Nutzer-/Workspace-Kontext entsteht nur nach erfolgreicher Onlineprüfung. Keine Auth-Tokenkopie in Entwurfsdaten.

- [ ] Tests für Reload, zwei Nutzer/Workspaces, abgelaufenen 7-Tage-Kontext, IndexedDB unavailable/QuotaExceeded, unbekannte SchemaVersion, Revisionskonflikt und Fremd-ID schreiben.
- [ ] Native IndexedDB implementieren; pro Schreibaktion klare Transaktionsbestätigung. `requestId` einmal erzeugen und immer erhalten; Preiscentwerte integer, ISO-Kalenderdatum lokal und UTC-Metadaten getrennt.
- [ ] Grenzen und Validierung vor Schreiben prüfen. Autosave serialisieren, nicht ältere Antworten über neue Revision legen. Bei Fehlern bleibt UI-Inhalt erhalten und unsaved.
- [ ] Nutzerwechsel/Logout sperrt Kontext sofort. Erzwungener Logout löscht Entwürfe nicht still; erneute Onlineanmeldung des ursprünglichen Nutzers darf sie wieder öffnen. Lokaler Kontext ist kein Serverzugriffsrecht.
- [ ] DOM-Speichertests grün, realer IndexedDB-Reload in Produktionse2e; keine neue Speicherbibliothek und kein globaler Geschäftsdatencache.
- [ ] Commit: `feat(purchases): persist isolated local purchase drafts`.

**Abnahme:** Erfolg wird erst nach persistierter Transaktion gemeldet; andere Konten sehen keine Entwürfe des bisherigen Nutzers.

## Aufgabe 12: Offline-Einkaufsbereich und zuverlässiger Start

**Dateien:** neu `src/app/features/purchases/pages/offline-purchases/offline-purchases.component.{ts,html}`, `.angular.spec.ts`, `src/app/features/purchases/guards/offline-purchase-context.guard.ts`, zugehörige `.angular.spec.ts`; ändern `src/app/app.routes.ts`, `src/app/core/guards/workspace-access.guard.ts` nur zur Fehlerdifferenzierung, PWA-Einstellungen, Sidebar und Bottom-Nav-Einstieg. Neue UI bleibt im Feature und verwendet Shared-Controls.

**Vertrag:** `/offline/purchases` bietet Liste, lokalen Editor und Export. Route befindet sich außerhalb der normalen online geprüften Shell, ohne ihre Guards zu lockern. Lokaler Context-Guard erlaubt nur gespeicherte Zuordnung; kein Backendladen in dieser Seite. Online-APIfehler werden nicht pauschal als fehlender Beta-Zugang ausgegeben.

- [ ] Tests für kalten Start ohne Netzwerk, fehlenden Kontext, abgelaufenen Kontext, APIfehler trotz `navigator.onLine`, gesperrten Nutzer und Wiederkehr online schreiben.
- [ ] V1-Formular aus Titel/Datum/Notizen und einfachen Positionen mit Zustand/Menge/optionalem EAN/Preis aufbauen. Nicht die gesamte Online-Erfassung mit ihren datenladenden Diensten offline freigeben.
- [ ] Autosave ≤ 500 ms, explizites „Auf diesem Gerät gespeichert“ und ausstehende Sicherung im Navigationsschutz. Export lädt ausschließlich den gewählten eigenen Kontext herunter; keine automatische Weitergabe.
- [ ] Bei vorbereiteter App und API-Netzfehler begrenzten Offline-Einstieg anbieten. Erstinstallation offline und erstmalige Online-Anmeldung ohne Netzwerk bleiben als unmöglich erklärt; keine falsche Beta-Ende-Meldung.
- [ ] Bei Verbindung Rückkehr zu normalem Login/Workspace-Check anbieten, ohne automatisch einen Kauf zu erzeugen. Kontowechsel und Entwurfsexport/-verwerfen vor freiwilligem Logout abdecken.
- [ ] Angular-Tests, Produktionse2e, AXE und Bau; Flugmodus-Reopen auf echtem Mobilgerät.
- [ ] Commit: `feat(purchases): add a limited offline draft workspace`.

**Abnahme:** Vorbereiteter Nutzer kann ohne Internet lokale Einkaufsnotizen speichern und wieder öffnen; Buchungen und normale App-Rechte bleiben online.

## Aufgabe 13: Entwurf im vorhandenen Einkaufsformular übernehmen

**Dateien:** ändern `src/app/features/purchases/pages/purchase-create/purchase-create.component.{ts,html}`, `components/purchase-entry-form/purchase-entry-form.component.ts`, deren Angular-Specs; neu `src/app/features/purchases/services/offline-purchase-transfer.service.ts`, `.angular.spec.ts`, `src/app/features/purchases/utils/offline-purchase-mapping.ts`, `.spec.ts`, `e2e/pwa-purchase-drafts.spec.ts`. `PurchaseService` und sein vorhandener Payloadvertrag werden wiederverwendet.

**Vertrag:** `OfflinePurchaseTransferService.openForReview(draftId): Promise<void>` lädt nur eigenen Entwurf, prüft aktuellen Nutzer/Workspace und übergibt den lokalen Inhalt samt stabiler `requestId` an die vorhandene Erfassung. Fehlende Katalog-/Verkäufer-/Quelldaten werden dort sichtbar ergänzt. Die endgültige Speicheraktion bleibt `PurchaseService.createPurchase(payload)`; bestätigte `purchaseId` wird lokal atomar gespeichert.

- [ ] Tests für centgenaues Mapping, unbekannten Preis, anderes Datum um Mitternacht, fehlendes Katalogziel, entzogenes Recht und Nutzer-/Workspacewechsel während Übertragung schreiben.
- [ ] Vorhandene `requestId`-Erzeugung in der Erfassung um vertrauenswürdig geladene Entwurfs-ID erweitern. Nicht frei beliebige Request-/Nutzer-ID aus der URL übernehmen. Revision prüfen und Imports im lokalen Store mit Lease sperren.
- [ ] Übernahme öffnet prüfbares normales Formular; Nutzer ergänzt Fachangaben und bestätigt. Wareneingänge, Dokumente und zusätzliche Aktionen bleiben bewusst normale Onlinehandlungen, nicht Teil einer stillen Übertragung.
- [ ] Antwortverlust simulieren: Server hat Kauf erstellt, Client hält Entwurf; Wiederholung verwendet dieselbe `request_id`, liefert dieselbe `purchaseId` und markiert denselben Entwurf übertragen. Zwei Tabs dürfen keinen zweiten Kauf erzeugen.
- [ ] Bei Serverfehlern Entwurf und eingegebene Ergänzungen erhalten. Nur nach bestätigtem Servererfolg als übertragen kennzeichnen; Entwurfsänderungen nach begonnener Übertragung werden als neue Revision erkannt, nicht unter bereits verwendeter Request-ID still überschrieben.
- [ ] Node-/Angular-/E2E-Tests sowie vorhandene Einkaufs-Erfassungsprüfungen grün; Typecheck/Format/Lint/Bau.
- [ ] Commit: `feat(purchases): review and safely transfer local drafts`.

**Abnahme:** Ein lokaler Entwurf wird genau einem bestätigten Einkauf zugeordnet; verlorene Antworten führen nicht zum zweiten Kauf.

## Aufgabe 14: Produktionse2e, Geräteabnahme und Rollout

**Dateien:** neu `playwright.pwa.config.ts`, `scripts/start-pwa-test-server.mjs`, `e2e/pwa-production.spec.ts`, `docs/testing/pwa-device-acceptance.md`; ändern `scripts/verify-public-deployment.mjs`, relevante Workflowtests und `.github/workflows/ci.yml`. PWA-Tests behalten echte Workeraktivierung; E2E-Fixtures ersetzen nur autorisierte Backendantworten.

**Vertrag:** Testserver liefert echten Produktionsbau mit korrekten MIME-/Cache-/CSP-Headern auf vertrauenswürdigem localhost. Konfiguration testet Chromium und WebKit; Standalone-, Gerätezustellung und Tastatur bleiben zusätzliche reale Gerätetests.

- [ ] Produktionstest für HTML-Start, fertigen Cache, erstmalige Lazy-Route offline, Netzwechsel, kaputtes Cachefile und alte→neue Releaseversion mit offenem Formular schreiben.
- [ ] `npm run build` und `npx playwright test --config=playwright.pwa.config.ts` ausführen. Worker muss wirklich kontrollieren; Tests mit gesperrten Service Workern zählen nicht als PWA-Abnahme.
- [ ] CI ergänzt gezielte PWA-Produktionssuite und Worker-/Asset-Skripttests. Bestehende Pflichtprüfungen und zentrale Suite-Orchestrierung erhalten; keine redundante komplette lokale Suite pro Push.
- [ ] Öffentliche Prüfung erweitert um Manifest-Scope/MIME, Worker-/Inventar-Build-ID, Iconerreichbarkeit und Cache-Header. Nicht nur HTTP 200 prüfen, sondern richtige Inhaltsform, Versionsbezug und fehlende SPA-Fallback-Antworten.
- [ ] Gerätematrix ausfüllen: iPhone/iPad Home-App, Android Smartphone/Tablet, Desktop; Installation, Kalt/Warmstart, Airplane-Reopen, Tastatur/Querformat/Split-View, Hell/Dunkel, reduced-motion, Update mit Eingabe, echte Push-Zustellung bei geschlossener App, denied→enabled, Logout und Rechteentzug.
- [ ] Befunde samt realen OS-/Browserständen, Geräteart und Datum dokumentieren. Fehlende echte Hardware ist eine offene Abnahme, keine bestanden erklärte Emulation. Push-Latenz ab gespeichertem Ereignis getrennt von Marktplatz-Pollintervall messen.
- [ ] Pro Paket Rollout vorbereiten; Push zunächst `WEB_PUSH_ENABLED=false`, dann freigegebene Pilotgeräte, dann breiter aktivieren. Notfall: Sendefreigabe aus, Geräte-/Entwurfsdaten erhalten, letztes funktionierendes App-Abbild zurück. Ein fehlerhafter Worker braucht einen neuen korrigierten Bau, keine manuelle Massenlöschung von Browserdaten.
- [ ] Vor Veröffentlichung genau die vereinbarte PR-/Merge-Freigabe einholen; nach grünen Pflichtprüfungen Merge-Commit, Releasechecks, öffentliche Versionsprüfung und nur eigene Branch-/Worktree-Bereinigung.
- [ ] Commit: `test(core): verify production PWA and mobile device flows`.

**Abnahme:** Die ausgefüllte Matrix belegt Installation, Offline-Entwürfe und Push auf realen Geräten; alle veröffentlichten Versprechen entsprechen diesem Nachweis.

## Definition „fertig“

- [ ] Alle 14 Aufgaben beziehungsweise ausdrücklich freigegebenen Pakete umgesetzt und mit ihrem eigenen Prüfumfang grün.
- [ ] Erststart und Fehlerzustände vor Angular sichtbar; Bewegung/Theme/CSP geprüft.
- [ ] Neue Version übernimmt keine offene Erfassung und liefert keine Mischung verschiedener Builds.
- [ ] Push kommt nachweislich aus dem Server bei geschlossener App; Rechte, Gerätewechsel und Abmeldung geprüft.
- [ ] Lokale Entwürfe überstehen Reopen und werden mit stabilem `request_id` ausdrücklich übertragen.
- [ ] Echte iPhone-/iPad-/Android-Abnahme erfolgt; offene Plattformgrenzen stehen sichtbar in der Hilfe.
- [ ] Keine geheimen Push-Endpunkte/privaten Schlüssel, keine handgeänderten generierten Typen, keine bestehenden Migrationen verändert.
- [ ] Changelog, PR-Prüfungen und veröffentlichter Versionsnachweis vollständig.

## Prüfstand dieses Plans

Plan und Design wurden auf Anforderungsabdeckung, gemeinsame Vertragsnamen, Paketabhängigkeiten, Risiko-/Testzuordnung und lokale Dateipfade gegengeprüft. Backend-Dateien und APIs sind explizit als neu gekennzeichnet. Die dokumentierten Testbefehle sind Ausführungsanweisungen für spätere Umsetzung; sie sind kein Nachweis bereits implementierter PWA-Funktionen. Beim Einstieg in die Umsetzung den dann aktuellen `origin/master` erneut prüfen, weil parallele Arbeiten Dateipfade und Verträge ändern können.
