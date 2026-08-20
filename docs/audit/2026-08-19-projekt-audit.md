# 🔍 Flipbase – Vollständiger Projekt-Audit

|                      |                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Datum**            | 2026-08-19                                                                                       |
| **Durchgeführt von** | Claude Opus 5 (Anthropic) – KI-Assistent                                                         |
| **Stand**            | Branch `master`, letzter Commit `0fa228f`, plus 50 uncommittete Änderungen im Arbeitsverzeichnis |
| **Umfang**           | Doku, Build, Tests, Angular-Code, Supabase/Datenbank, Docker, UI & Barrierefreiheit              |

---

## 0. Kurzfassung in einfachen Worten

Das Projekt ist **äußerlich sehr weit** – schöne Oberfläche, viele Funktionen, moderne Angular-Technik. Aber es hat drei grundlegende Probleme:

1. **Der Build ist gerade kaputt.** `ng build` bricht mit 2 Fehlern ab. Die App lässt sich aktuell nicht in Docker bauen.
2. **Es gibt praktisch keinen Login-Schutz.** Jeder kann alle Seiten öffnen, auch ohne Anmeldung. Der eingebaute Türsteher (`authGuard`) ist geschrieben, aber nirgendwo eingehängt – und selbst wenn, würde er immer "ja" sagen.
3. **Die Daten liegen im Browser, nicht in der Datenbank.** Fast alles wird in `localStorage` gespeichert. Supabase ist nur ein optionaler Zusatz – und wenn beide etwas sagen, gewinnt immer der Browser. Ein Großteil der beworbenen Funktionen (Buchhaltung, Retouren, Shop, Versand) hat **gar keine Tabellen** in der Datenbank.

Dazu kommt: Die Doku beschreibt Dinge als "live", die in Wirklichkeit simuliert sind (Stripe, PayPal, DHL, Hermes). Und die Steuer-Exporte haben echte Rechenfehler.

**Die gute Nachricht:** Die Angular-Grundlagen sind sauber – Signals, moderne Control-Flow-Syntax, Standalone Components, kein `ngClass`/`ngStyle`, keine alten Decorators. Das ist eine solide Basis. Die Probleme sind fixbar und liegen fast alle in Konfiguration, Datenschicht und Doku – nicht im Komponentencode.

---

## 1. Zustand von Build & Tests (gemessen, nicht geschätzt)

| Prüfung                         | Ergebnis                                        |
| ------------------------------- | ----------------------------------------------- |
| `npx ng build`                  | ❌ **FEHLGESCHLAGEN** – 2 × `TS7053`            |
| `npx vitest run`                | ✅ 24 Test-Dateien, 96 Tests bestanden (1,58 s) |
| Test-Abdeckung UI               | ❌ 0 Komponenten-Tests – nur Services           |
| ESLint                          | ❌ nicht vorhanden                              |
| CI (`.github/workflows/ci.yml`) | ⚠️ baut nur, führt **keine Tests** aus          |

### 1.1 Die konkreten Build-Fehler

`src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html:513` und `:514`

```
TS7053: Element implicitly has an 'any' type because expression of type 'any'
can't be used to index type 'Record<InboundTrackingStatus, {...}>'
```

Ursache: In der `@for`-Schleife läuft `step` als `string` über ein Array von Literalen. `$any(step)` hilft hier nicht, weil `$any()` genau den `any` erzeugt, den der Indexzugriff dann ablehnt. Lösung: das Array typisieren (`readonly trackingSteps: InboundTrackingStatus[] = [...]` in der Komponente) statt es inline im Template zu schreiben.

> ⚠️ Das ist eine der 50 uncommitteten Änderungen. Der letzte Commit baut vermutlich noch. Aktuell ist der Arbeitsstand aber nicht baubar.

---

## 2. 🔴 Kritisch – Sicherheit

### 2.1 Kein Login-Schutz auf irgendeiner Route

`src/app/core/guards/auth.guard.ts` existiert, wird aber in `src/app/app.routes.ts` **nirgendwo** verwendet (`canActivate` kommt im gesamten Projekt nicht vor). Jede Route – Dashboard, Buchhaltung, Einkäufe, Einstellungen – ist ohne Anmeldung erreichbar.

### 2.2 Der Guard wäre auch eingehängt wirkungslos

`src/app/core/services/auth.service.ts:29`

```ts
readonly isDemoUser = signal<boolean>(true);              // Standard: true
readonly isAuthenticated = computed(() => !!this.currentUser() || this.isDemoUser());
```

`isAuthenticated()` ist **immer wahr**, solange niemand explizit ausloggt. Demo-Modus und echte Anmeldung sind in derselben Variable vermischt. Diese beiden Begriffe müssen getrennt werden: „ist angemeldet" ≠ „darf die App sehen".

### 2.3 Login-Fallback lässt jeden rein

`auth.service.ts` in `signIn()`:

```ts
if (!res || res.error) {
  if (email.toLowerCase().includes('demo') || !res) {
    this.loginAsDemo(); // <- Erfolg zurückgeben, ohne Passwortprüfung
    return { error: null };
  }
}
```

Wenn Supabase nicht innerhalb von 1200 ms antwortet (`withTimeout`), ist `res === null` → **jede beliebige E-Mail mit jedem beliebigen Passwort wird eingeloggt.** Ein Angreifer müsste nur die Verbindung zu Supabase stören.

### 2.4 Datenbank: Jeder angemeldete Nutzer kann in jeden fremden Workspace

`supabase/migrations/20260816000001_initial_schema.sql`:

```sql
CREATE POLICY "Members can insert membership" ON public.workspace_members
FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id) OR user_id = auth.uid());
```

Das `OR user_id = auth.uid()` erlaubt jedem angemeldeten Nutzer, sich selbst in **jeden beliebigen Workspace** einzutragen – und damit alle Einkäufe, Verkäufe, Umsätze und Steuerdaten fremder Nutzer zu lesen und zu ändern. Das ist der schwerwiegendste Datenbank-Fehler. Aktuell (nur du, lokal) harmlos; beim geplanten Web-Betrieb ein Totalschaden.

### 2.5 Storage-Bucket: öffentlich + anonym beschreib- und löschbar

`supabase/migrations/20260817000002_storage_setup.sql`:

- `public = true` → **alle** hochgeladenen Artikelfotos und PDFs sind per URL öffentlich abrufbar, ohne Anmeldung
- Policy `"Anon users can upload item-media in dev"` → **nicht angemeldete** Besucher dürfen Dateien hochladen (10 MB, auch PDF)
- Policy `"Anon users can delete item-media in dev"` → **nicht angemeldete** Besucher dürfen **alle** Dateien löschen

### 2.6 `SECURITY DEFINER`-Funktionen ohne `search_path`

`is_workspace_member()` und `handle_new_user()` laufen mit erhöhten Rechten, setzen aber kein `set search_path = ''`. Klassische Angriffsfläche für `search_path`-Manipulation. Deine `CLAUDE.md` schreibt das explizit vor.

### 2.7 Service Worker cacht API-Antworten inklusive Nutzerdaten

`public/sw.js` cacht **jede** erfolgreiche GET-Antwort – auch Supabase-REST-Abfragen mit deinen Geschäftsdaten und Auth-Endpunkte. Die Daten bleiben unbegrenzt im Browser-Cache liegen, überleben ein Logout und werden nie invalidiert. Zusätzlich: veraltete Daten in der App, weil der Cache bei Netzproblemen greift.

### 2.8 Keine Security-Header in nginx

`docker/nginx.conf` setzt keine `Content-Security-Policy`, kein `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. Außerdem fehlt eine `no-cache`-Regel für `index.html` → nach einem Neu-Deploy siehst du unter Umständen weiter die alte App.

### 2.9 Edge Function offen für alle Herkünfte

`supabase/functions/marketplace-search/index.ts`: `'Access-Control-Allow-Origin': '*'`, kein JWT-Check, nutzt das veraltete `serve` aus `deno.land/std@0.168.0` statt `Deno.serve` (deine `CLAUDE.md` verlangt Letzteres), und `error.message` auf einem `unknown`.

### 2.10 API-Schlüssel im Frontend-Quellcode

`store.service.ts:35` (`pk_test_flipbase_live_sample_key_123`), `fulfillment.service.ts:295/298` (`dhl_sandbox_key_live_2026_demo`). Aktuell reine Platzhalter – aber das Muster lädt dazu ein, später echte Schlüssel dort einzutragen. Alles im Angular-Bundle ist öffentlich lesbar. Geheimnisse gehören ausschließlich in Edge Functions.

### 2.11 🔴 Nachtrag: Der Datenbank fehlten sämtliche Zugriffsrechte – sie hat nie funktioniert

> Gefunden am 2026-08-19 während Phase 3, beim ersten echten Test gegen die laufende Datenbank.

Die Tabellen wurden angelegt, ohne den Rollen der Supabase-API Rechte zu erteilen. Jede Abfrage über PostgREST endete mit:

```
42501 – permission denied for table profiles
```

Und zwar **noch bevor** Row Level Security überhaupt ausgewertet wurde. Betroffen waren `authenticated`, `anon` **und sogar `service_role`** – also wirklich jeder Zugriffsweg.

Aufgefallen ist das nie, weil sämtliche Datenbankaufrufe im Frontend in leeren `catch {}`-Blöcken enden (Befund 3.1). Die Anwendung ist stillschweigend auf den `localStorage` zurückgefallen. **Die Datenbank war seit Projektbeginn vollständig unbenutzt** – was auch erklärt, warum die Datenschicht so gebaut ist, wie sie gebaut ist: Sie musste ohne Datenbank funktionieren, weil es faktisch keine gab.

**Behoben** in Phase 3 durch Migration `20260819130000_grant_api_roles.sql`, inklusive `alter default privileges`, damit dieselbe Lücke bei der nächsten Tabelle nicht erneut entsteht.

### 2.12 🟠 Nachtrag: Der lokale Supabase-Stack lief auf von Windows gesperrten Ports

> Gefunden am 2026-08-19 während Phase 3.

`supabase/config.toml` verwendete die Ports 57320–57329. Windows reserviert auf diesem Rechner für Hyper-V unter anderem den Bereich **57322–57921** – darin lagen fünf der sieben Supabase-Ports (Datenbank, Studio, Mailpit, Analytics, Pooler). Der Stack ließ sich dadurch nicht mehr starten:

```
bind: Der Zugriff auf einen Socket war aufgrund der Zugriffsrechte
des Sockets unzulässig
```

Diese reservierten Bereiche verschieben sich nach Neustarts – das Problem tritt also sporadisch auf und ist schwer zuzuordnen. Zusätzlich kollidierten die Standardports mit zwei anderen Supabase-Projekten auf demselben Rechner (`finance-management`, `movie-collection`).

**Behoben** in Phase 3: Umstellung auf 54350–54359 (frei und außerhalb aller reservierten Bereiche). Prüfen lässt sich das mit:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

---

## 3. 🔴 Kritisch – Architektur der Datenschicht

### 3.1 `localStorage` ist die Wahrheit, die Datenbank ist Beiwerk

`inventory.service.ts:83`:

```ts
const merged = local ? { ...item, ...local } : item; // local überschreibt IMMER die DB
```

Der gleiche Aufbau steckt in `purchase.service.ts` und `sales.service.ts`. Die Konsequenzen:

- Was in der Datenbank steht, kann nie gewinnen. Änderungen von einem anderen Gerät gehen verloren.
- `withTimeout(..., 1000)` – bei 1 Sekunde Latenz gilt die Datenbank als „weg" und wird stillschweigend ignoriert.
- Fehler werden komplett verschluckt (`catch { }` ohne Meldung). Du merkst nie, dass ein Speichern fehlgeschlagen ist.
- Browser-Cache leeren = **alle Geschäftsdaten weg**. Kein Backup, keine Warnung.
- `localStorage` hat ~5–10 MB Limit. Mit Bildern in Base64 ist das schnell voll – dann schlagen Schreibvorgänge lautlos fehl (`catch {}`).

Das ist für ein Werkzeug, das Buchhaltung und Steuerdaten verwaltet, das größte strukturelle Risiko.

### 3.2 Datenbankschema deckt nur ~40 % der App ab

**Tabellen vorhanden (15):** profiles, workspaces, workspace_members, sources, suppliers, purchases, purchase_costs, inventory_items, item_costs, item_media, market_research, research_comparables, listing_drafts, sales, activity_logs

**Ohne jede Tabelle – existiert nur im Browser:**

| Bereich                            | Betroffene Services              |
| ---------------------------------- | -------------------------------- |
| Retouren & Gutschriften            | `return.service.ts`              |
| Versand, Labels, Bündelung         | `fulfillment.service.ts`         |
| Webshop, Bestellungen, Zahlungen   | `store.service.ts`               |
| Buchhaltung, DATEV, Kanzlei-Paket  | `tax-advisor.service.ts`         |
| Bankabgleich                       | `bank-reconciliation.service.ts` |
| Konkurrenz-Radar & Preisalarme     | `price-tracker.service.ts`       |
| Rechnungen                         | `invoice.service.ts`             |
| Benachrichtigungen & Webhooks      | `webhook.service.ts`             |
| Offline-Warteschlange, Cash Wallet | `offline-sync.service.ts`        |
| Wareneingangs-Tracking             | `inbound-tracking.service.ts`    |

20 von 34 Services fassen Supabase überhaupt nicht an.

### 3.3 Modelle und Datenbank passen nicht zusammen

Felder, die im TypeScript-Modell existieren, aber **nicht** in der Tabelle:

| Modell            | Feld                                                                            | Tabelle                       |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| `Workspace`       | `currency`, `tax_mode`                                                          | fehlen in `workspaces`        |
| `Source`          | `type`, `is_active`                                                             | fehlen in `sources`           |
| `WorkspaceMember` | `email`, `full_name`, `joined_at`                                               | fehlen in `workspace_members` |
| `Purchase`        | `tracking_number`, `tracking_carrier`, `tracking_status`, `total_purchase_cost` | fehlen in `purchases`         |
| `InventoryItem`   | `tax_mode_override`                                                             | fehlt in `inventory_items`    |

Sobald du wirklich mit Supabase arbeitest, schlagen diese Inserts fehl oder verlieren Felder. `tax_mode_override` wird im Steuermodul aktiv verwendet – der Wert kann derzeit nie dauerhaft gespeichert werden.

### 3.4 Keine generierten Datenbank-Typen

`src/app/core/models/supabase.types.ts` existiert nicht, `createClient` ist untypisiert. Damit ist **jede** Datenbankabfrage `any` – TypeScript kann keinen der obigen Fehler finden. Deine `CLAUDE.md` verlangt die Typgenerierung ausdrücklich.

### 3.5 Deklaratives Schema ist unvollständig und driftet

`supabase/schemas/database.sql` (206 Zeilen) enthält **nur Tabellen** – keine RLS, keine Policies, keine Trigger, keine Funktionen (`grep` findet 0 Treffer). Die Migration hat all das. Ein `supabase db diff` würde also vorschlagen, sämtliche Sicherheitsregeln zu **löschen**. Genau der Ablauf, den deine `CLAUDE.md` als Standard vorsieht, ist damit gefährlich.

---

## 4. 🟠 Schwer – Rechenfehler in Finanzen & Steuern

Die Doku behauptet „100 % deterministisch", „zentimetergenau", „finanzamtskonform". Das trifft nicht zu.

### 4.1 Kostenverteilung verliert Cent-Beträge

`profit-engine.service.ts:51`

```ts
allocateCostsEvenly(totalPurchaseCost, itemCount) {
  return Number((totalPurchaseCost / itemCount).toFixed(2));
}
```

100 € auf 3 Artikel → 33,33 € × 3 = **99,99 €**. Ein Cent verschwindet. Bei einer Palette mit 60 Artikeln fehlen bis zu 60 Cent im Wareneinsatz. Die Summe der zugeordneten Kosten entspricht damit **nie garantiert** dem Einkaufspreis – und genau diese Summe landet im § 25a-Journal und im DATEV-Export.

Richtig wäre: in ganzen Cent rechnen und den Rest auf die ersten _n_ Artikel verteilen (Largest-Remainder-Verfahren).

### 4.2 Wertgewichtete Verteilung verschluckt den kompletten Einkaufspreis

`profit-engine.service.ts:64`

```ts
if (sumAllExpectedValues <= 0) return 0;
```

Wenn bei keinem Artikel ein erwarteter Wert eingetragen ist (der Normalfall bei einer frisch erfassten Palette), bekommt **jeder** Artikel 0 € Wareneinsatz zugeordnet. Der gesamte Einkaufspreis verschwindet aus der Kalkulation → jeder Verkauf sieht aus wie 100 % Gewinn. Nötig: Rückfall auf gleichmäßige Verteilung.

### 4.3 DATEV-Export: falsches Datumsformat

`tax-engine.service.ts`

```ts
const dateFormatted = r.sale_date.replace(/-/g, '').substring(4, 8); // ergibt MMTT
```

`2026-08-17` → `20260817` → `substring(4,8)` = `"0817"` = **Monat 08, Tag 17**. DATEV erwartet im Feld _Belegdatum_ aber `TTMM`, also `1708`. Jede exportierte Buchung hat damit ein falsches Datum – und `"0817"` wird als Tag 08 / Monat 17 gelesen, also ein ungültiger Monat. Der Stapel wird von DATEV abgelehnt oder falsch verbucht.

### 4.4 DATEV-Export: falsche Buchungsrichtung

```ts
let konto = '8200';           // Erlöskonto
const gegenkonto = '1200';    // Bank
...
'S',                          // Soll
```

Ein Verkauf wird gebucht als _Bank an Erlöse_. Hier steht das Erlöskonto im Feld `Konto` mit Kennzeichen `S` (Soll) – das bucht den Umsatz auf die falsche Seite. Korrekt ist `Konto = 1200`, `Gegenkonto = 8200`, `S`.

### 4.5 DATEV-Header ist kein gültiger EXTF-Header

```ts
'EXTF;700;21;DATEV Format;1.0;' + ... + ';;;;'
```

Ein echter EXTF-Buchungsstapel-Header hat **31 Felder** in fester Reihenfolge (Berater-Nr., Mandanten-Nr., WJ-Beginn, Sachkontenlänge, Datum von/bis, Bezeichnung, Währung …). Der hier erzeugte Header hat 10. DATEV kann die Datei nicht einlesen. Außerdem fehlt die von DATEV erwartete Zeichenkodierung (ANSI/ISO-8859-1 bzw. UTF-8 mit BOM).

### 4.6 Reingewinn nach Steuern rechnet die Vorsteuer nicht gegen

```ts
netProfitAfterTax = grossMargin - operatingCosts - vatAmount;
```

Die abziehbare Vorsteuer (`inputTaxDeductible`) wird ignoriert, obwohl sie zwei Zeilen darüber berechnet wird. Korrekt wäre `- netTaxLiability` (also USt minus Vorsteuer). Der ausgewiesene Reingewinn ist dadurch systematisch zu niedrig.

### 4.7 CSV-Injection in den Exporten

Titel wie `=HYPERLINK(...)` oder `+1+1` werden ungeprüft in die CSV geschrieben und beim Öffnen in Excel als Formel ausgeführt. Bei einer Datei, die an die Steuerkanzlei geht, sollte das abgesichert sein (führende `=`, `+`, `-`, `@` mit `'` maskieren).

---

## 5. 🟠 Schwer – Doku beschreibt Dinge, die nicht existieren

Die `README.md` bewirbt als fertige Funktionen, was tatsächlich **Simulation mit Zufallszahlen** ist:

| Doku-Aussage                                      | Realität im Code                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Stripe & PayPal **Live**-Checkout"               | `store.service.ts:229` – _„Simulates processing a Stripe credit card transaction"_, Transaktions-ID via `Math.random()`                           |
| „Bucht **Live**-Versandmarken für DHL und Hermes" | `fulfillment.service.ts` – erzeugte Trackingnummern, Platzhalter-API-Keys, kein einziger API-Aufruf                                               |
| „Carrier-API-Anbindung"                           | nur Tracking-**Links** auf dhl.de / myhermes.de                                                                                                   |
| „Live-Überwachung von Preisen"                    | `price-tracker.service.ts` – simulierte Preisbewegungen                                                                                           |
| „KI-Foto-Erkennung / KI-Zustandserkennung"        | `ai-assistant.service.ts` – regelbasiert, kein KI-Modell                                                                                          |
| „22/22 Test-Suiten, 86/86 Tests"                  | tatsächlich 24 Suiten / 96 Tests                                                                                                                  |
| „Angular 21"                                      | `package.json` sagt Angular **22**                                                                                                                |
| „TypeScript Strict Mode: 100 % typsicher"         | `strict` ist in `tsconfig.json` **nicht gesetzt** (siehe 6.1)                                                                                     |
| „Saubere Kompilierung ohne Warnungen"             | Build schlägt aktuell fehl                                                                                                                        |
| „100 % datenschutzkonform"                        | Google Fonts werden von `fonts.gstatic.com` geladen → IP-Übertragung in die USA bei jedem Seitenaufruf (DSGVO-relevant, in DE mehrfach abgemahnt) |

Simulation ist für eine lokale Entwicklungsversion völlig in Ordnung. Nur muss die Doku es sagen – sonst verlässt du dich später auf etwas, das nicht da ist.

---

## 6. 🟡 Mittel – Konfiguration & Code-Qualität

### 6.1 TypeScript Strict Mode ist aus

`tsconfig.json` setzt `noImplicitOverride`, `noImplicitReturns` usw. – aber **weder `"strict": true`** noch `strictTemplates`. Das widerspricht `CLAUDE.md` („Strikte Typenprüfung verwenden") und der `ARCHITECTURE.md`. Folge: 65 `any`-Vorkommen bleiben unentdeckt, `null`/`undefined` werden nirgends geprüft.

> Hinweis: Einschalten wird zunächst eine größere Zahl an Fehlern erzeugen. Deshalb ist das im Plan ein eigener, schrittweiser Punkt.

### 6.2 Zwei Icon-Bibliotheken gleichzeitig installiert

```
+-- @lucide/angular@1.31.0     (aktuell, ungenutzt)
`-- lucide-angular@1.0.0       (veraltet, überall importiert)
```

36 Dateien importieren aus dem **alten** Paket. Das alte Paket hat Peer-Dependencies auf ältere Angular-Versionen – **das ist der Grund, warum überall `--legacy-peer-deps` steht** (Dockerfile, CI). Dieser Schalter deaktiviert die Abhängigkeitsprüfung von npm komplett und versteckt damit auch alle _anderen_ Konflikte.

### 6.3 Ungenutzte Abhängigkeiten und tote Dateien

- `@ngx-translate/http-loader` – installiert, nirgends importiert (die App nutzt `SyncTranslateLoader`)
- `public/i18n/de.json` + `en.json` – werden nie geladen; die Übersetzungen liegen in `core/i18n/translations.ts`. Zwei Quellen, die auseinanderlaufen werden.
- ~30 `.scss`-Dateien mit ausschließlich `:host { display: block; }` – reines Rauschen. Deine `CLAUDE.md` sagt: SCSS nur im Ausnahmefall. Nur 8 Dateien haben echten Inhalt (Print-Styles, Animationen) – die sind berechtigt.

### 6.4 Vitest ohne Konfiguration

Es gibt keine `vitest.config.ts`. Die Tests laufen in der Node-Umgebung ohne DOM (daher die `localStorage`-Warnungen). Komponenten-Tests sind so gar nicht möglich – deshalb existiert auch keiner. Es fehlt: `environment: 'jsdom'`, Angular-Test-Setup, Coverage-Konfiguration.

### 6.5 CI ist zahnlos

`.github/workflows/ci.yml` baut nur. Kein `npm test`, kein Lint, kein Format-Check. Ein fehlschlagender Test fällt nicht auf.

### 6.6 Fehlende `.gitattributes`

Auf Windows erzeugt jede Bearbeitung CRLF/LF-Rauschen (bei `git diff` sichtbar). Eine `.gitattributes` mit `* text=auto eol=lf` beendet das.

### 6.7 Supabase-Konfiguration passt nicht zur App

`supabase/config.toml`:

- `site_url = "http://127.0.0.1:3000"` – die App läuft auf **4200** (dev) bzw. **80** (Docker). Bestätigungs- und Passwort-Reset-Links zeigen ins Leere.
- `minimum_password_length = 6` – zu kurz
- `enable_confirmations = false` – für lokal ok, muss vor dem Web-Betrieb an

### 6.8 Docker

- Kein `HEALTHCHECK` im Dockerfile
- `docker-compose.yml` belegt fest Port **80** auf dem Host – kollidiert mit allem anderen, was dort lauscht. Besser: `8080:80`.
- Der Supabase-Stack ist **nicht** Teil des Compose-Setups. Du musst `supabase start` immer separat ausführen. Das gehört dokumentiert oder integriert.
- Kein `.env`-Mechanismus – Supabase-URL und Key sind fest ins Bundle kompiliert.

### 6.9 Verstreute Kleinigkeiten

- 17 × `console.log` / `console.warn` im Produktionscode
- `src/app/app.ts` – einzige Komponente ohne `ChangeDetectionStrategy.OnPush`
- `theme.service.ts` liest `localStorage` direkt in der Feld-Initialisierung → wirft in Tests und bei SSR
- Zahlreiche leere `catch { }`-Blöcke verschlucken Fehler ersatzlos

---

## 7. 🟡 Mittel – UI & Barrierefreiheit

Deine `CLAUDE.md` fordert: _„Muss alle AXE-Checks bestehen. Muss alle WCAG-AA-Mindestanforderungen erfüllen."_ Das ist derzeit nicht erfüllt.

### 7.1 Nichts in der App lässt sich markieren oder kopieren

`select-none` steht **52-mal** in den Templates – unter anderem auf dem obersten `<div>` der gesamten Shell (`shell.component.html:1`). Damit lassen sich SKU, Sendungsnummer, Bestellnummer, IBAN, Betrag – **nichts** – mit der Maus markieren und kopieren. Für ein Werkzeug, in dem man ständig Nummern in andere Systeme überträgt, ist das die spürbarste Alltagsbremse. `select-none` gehört nur auf Buttons und Navigation, niemals auf Inhaltsbereiche.

### 7.2 Der Theme-Umschalter tut nichts

`theme.service.ts` startet mit `'light'` und setzt/entfernt die CSS-Klasse `dark` am `<html>`. In `src/styles.css` gibt es aber **keine einzige** `.dark`-Regel – das gesamte Design ist fest dunkel verdrahtet. Der Schalter im Header ist sichtbar, klickbar und wirkungslos. Entweder ein echtes Light-Theme bauen oder den Schalter entfernen.

### 7.3 Modale Dialoge sind für Tastatur und Screenreader unbrauchbar

22 modale Overlays im Projekt. Davon:

- `role="dialog"`: **0**
- `aria-modal="true"`: **0**
- Escape-Taste schließt: **3 von 22**
- Fokus-Falle (Tab bleibt im Dialog): **0**
- Fokus-Rückgabe beim Schließen: **0**

Wer mit der Tastatur arbeitet, tabbt aus dem offenen Dialog heraus in die Seite dahinter. Ein Screenreader liest die Seite hinter dem Dialog vor. Das ist der größte einzelne AXE-Verstoß. Lösung: eine gemeinsame `<app-modal>`-Shell mit `role="dialog"`, `aria-modal`, Fokus-Falle, Escape-Handler und Fokus-Rückgabe – und alle 22 Stellen darauf umstellen. Alternativ das native `<dialog>`-Element, das Fokus-Falle und Escape von Haus aus mitbringt.

### 7.4 Zoom ist gesperrt

`src/index.html`: `user-scalable=no`. Verstößt gegen **WCAG 1.4.4 (Resize Text, Level AA)**. Auf dem Handy – dem Hauptgerät für die Flohmarkt-Schnellerfassung – kannst du nicht hineinzoomen. Ersatzlos streichen.

### 7.5 ~~12 Bilder ohne `alt`-Attribut~~ — ❌ **Fehlalarm, zurückgezogen**

> Korrektur vom 2026-08-19 während Phase 4.

Dieser Befund war falsch. Mein ursprünglicher Test war ein zeilenbasiertes `grep` nach `<img` ohne `alt=` in derselben Zeile. Die `<img>`-Tags im Projekt sind aber über mehrere Zeilen formatiert, das `alt` steht jeweils auf der Folgezeile.

Eine korrekte Prüfung über den gesamten Tag hinweg ergibt: **14 `<img>`-Tags, davon 0 ohne `alt`.** Hier war nichts zu tun.

### 7.6 `NgOptimizedImage` wird nirgends verwendet

0 Treffer im gesamten Projekt, obwohl `CLAUDE.md` es für alle statischen Bilder vorschreibt. Auswirkung: keine Größenvorgaben → Layout springt beim Laden (Cumulative Layout Shift), keine automatischen `srcset`.

### 7.7 Kein `focus-visible`, kein Fokus-Ring

0 Treffer für `focus-visible` in den Templates, keine globale Fokus-Regel in `styles.css`. Wer mit Tab navigiert, sieht nicht, wo er gerade ist. WCAG 2.4.7.

### 7.8 Keine Rücksicht auf `prefers-reduced-motion`

`styles.css` definiert Animationen (`fadeIn`, `modalCardPop`, mehrere `animate-pulse`), respektiert aber die Systemeinstellung „Bewegung reduzieren" nicht. Relevant für Menschen mit vestibulären Beschwerden.

### 7.9 Klickbare `<div>`s statt Buttons

5 Stellen mit `(click)` auf `<div>` ohne `tabindex`, `role` oder Tastaturunterstützung – z. B. die Bildvorschau in `research.component.html:248`. Per Tastatur nicht erreichbar.

### 7.10 Kein Sprunglink zum Inhalt

Tastaturnutzer müssen sich auf jeder Seite durch die komplette 13-Punkte-Navigation tabben. Ein „Zum Inhalt springen"-Link fehlt.

### 7.11 🔴 Nachtrag: Ein kaputter Formularbezug legte das Rendern der ganzen App lahm

> Gefunden am 2026-08-19 während Phase 2, beim Testen im echten Browser. Statisch war das nicht sichtbar – der Fehler tritt erst zur Laufzeit auf.

`settings.component.html` bindet an vier Bankfelder:

```html
formControlName="bankName"
<!-- existierte nicht -->
formControlName="bankIban" formControlName="bankBic" formControlName="bankAccountHolder"
```

Die `paymentForm`-Gruppe in `settings.component.ts` enthielt jedoch **kein** Feld `bankName`. Sobald die Zahlungsarten-Karte sichtbar wurde, warf Angular bei jedem Durchlauf:

```
ERROR Error: Cannot find control with name: 'bankName'
```

Eine Ausnahme mitten in der Änderungserkennung bricht den restlichen Durchlauf ab. Sichtbare Folge: Auf der Einstellungsseite blieben **die komplette Sidebar-Navigation und der Header leer**, und sämtliche `@if`-Blöcke, die nach der defekten Stelle ausgewertet wurden, rendern nicht. Die Seite sah aus wie ein halb geladener Torso.

Warum das lange unbemerkt blieb: Der Fehler landet nur in der Browser-Konsole, die Seite stürzt nicht ab, und es gibt keinen einzigen Komponenten-Test (siehe 6.4), der so etwas gefunden hätte.

**Behoben** in Phase 2 durch Ergänzen des fehlenden `bankName`-Controls.

**Lehre daraus für den Plan:** Genau solche Fehler sind der Grund, warum in Phase 8 Komponenten-Tests und eine `vitest.config.ts` mit `jsdom` stehen. Ein einziger Rendertest der Einstellungsseite hätte das sofort gezeigt.

### 7.13 🟡 Nachtrag: Über 100 Verwendungen undefinierter Design-Klassen

> Gefunden am 2026-08-19 während Phase 4.

`accounting.component.html` verwendete durchgängig Klassen aus einem älteren Design-System, das nie migriert wurde und nirgendwo definiert ist:

| Klasse                          | Verwendungen |
| ------------------------------- | ------------ |
| `text-muted`                    | 41           |
| `text-accent-emerald`           | 17           |
| `bg-surface-3`                  | 10           |
| `kpi-label` / `kpi-value`       | je 8         |
| `bg-accent-emerald`             | 7            |
| `bg-surface-2`                  | 5            |
| `card`                          | 5            |
| `border-accent-emerald`         | 4            |
| `bg-surface-1`, `border-border` | je 1         |

Diese Klassen erzeugten **keinerlei Wirkung**. Auf der Buchhaltungsseite hatten die betroffenen Elemente also weder Hintergrund noch Textfarbe – Kennzahlen und Karten waren schlicht unformatiert. Behoben in Phase 4: `card`, `kpi-label` und `kpi-value` sind jetzt definiert, die übrigen auf die Design-Tokens abgebildet.

### 7.14 🟡 Nachtrag: 11 Stellen mit weißem Text auf zu hellem Farbgrund

> Gefunden am 2026-08-19 während Phase 4 durch eine rechnerische Kontrastprüfung.

Weißer Text auf voll deckenden Akzentflächen erreichte teils nur ein Viertel des geforderten Kontrasts – und zwar in **beiden** Designs, es ist also kein Problem des neuen hellen Designs:

| Fläche           | Kontrast mit Weiß | Nötig | Betroffen                                                                    |
| ---------------- | ----------------- | ----- | ---------------------------------------------------------------------------- |
| `bg-amber-500`   | 2,15:1            | 4,5:1 | 2 Buttons                                                                    |
| `bg-emerald-500` | 2,54:1            | 4,5:1 | 6 Stellen (Login, Registrierung, Benachrichtigungs-Abzeichen, Artikel-Badge) |
| `bg-amber-600`   | 3,19:1            | 4,5:1 | 2 Buttons                                                                    |
| `bg-rose-500`    | 3,67:1            | 4,5:1 | 1 Badge                                                                      |

Behoben durch Anheben auf `emerald-700` (5,55:1), `amber-700` (4,99:1) und `rose-600` (4,70:1).

### 7.15 Kleinere UI-Themen

- Externe Google Fonts ohne lokales Fallback: bei fehlender Internetverbindung – also genau im beworbenen **Offline-Modus auf dem Flohmarkt** – bricht die Typografie ein
- Der Sidebar-Punkt „Mein Online-Shop" führt nach `/shop` in ein anderes Layout **ohne Rückweg** in die Verwaltung
- Sehr viele Schriftgrößen unter 12 px (`text-[10px]`, `text-[9px]`, `text-[11px]`) – am Rand der Lesbarkeit, insbesondere auf dem Handy

---

## 8. ✅ Was ausdrücklich gut ist

Damit das Bild vollständig bleibt – hier wurde vieles richtig gemacht:

|     |                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------- |
| ✅  | **0** Verwendungen von `ngClass` / `ngStyle` – durchgängig `class`/`style`-Bindings                                   |
| ✅  | **0** Verwendungen von `*ngIf` / `*ngFor` / `*ngSwitch` – durchgängig `@if` / `@for` / `@switch`                      |
| ✅  | **0** `@Input()` / `@Output()` Decorators – durchgängig `input()` / `output()`                                        |
| ✅  | **0** `@HostBinding` / `@HostListener`                                                                                |
| ✅  | **0** Inline-Templates – alle in eigenen `.html`-Dateien                                                              |
| ✅  | 38 von 39 Komponenten mit `ChangeDetectionStrategy.OnPush`                                                            |
| ✅  | Durchgängig Standalone Components, `provideZonelessChangeDetection()`, `inject()` statt Konstruktor-Injection         |
| ✅  | Lazy Loading für **alle** Feature-Routes                                                                              |
| ✅  | Ordnerstruktur exakt nach deiner `CLAUDE.md`: `core/` – `shared/` – `layout/` – `features/`                           |
| ✅  | Sauberes, zentrales Design-System in `styles.css` mit CSS-Variablen an einer Stelle – gut gemacht und gut kommentiert |
| ✅  | 96 grüne Unit-Tests für die Geschäftslogik                                                                            |
| ✅  | Kein `innerHTML`, kein `bypassSecurityTrust` – keine XSS-Fläche im Frontend                                           |
| ✅  | Mehrstufiges Dockerfile mit korrektem Layer-Caching                                                                   |

Der Komponentencode entspricht deinen Vorgaben nahezu vollständig. Die Probleme liegen fast ausnahmslos in Konfiguration, Datenschicht, Datenbank und Dokumentation.

---

## 9. Zahlen auf einen Blick

| Kategorie                                                       | Anzahl |
| --------------------------------------------------------------- | ------ |
| 🔴 Kritisch (Sicherheit / Datenverlust / defektes Rendern)      | 14     |
| 🟠 Schwer (falsche Berechnungen / irreführende Doku / Umgebung) | 12     |
| 🟡 Mittel (Qualität, UI, Barrierefreiheit)                      | 25     |
| 🟢 Gering (Aufräumen)                                           | 9      |
| ❌ Zurückgezogen (Fehlalarm)                                    | 1      |
| **Summe (gültig)**                                              | **60** |

> Nachträge 2026-08-19: Die Befunde 7.11, 2.11 und 2.12 kamen beim Testen gegen
> die laufende Anwendung und Datenbank hinzu und sind bereits behoben. Keiner
> davon wäre durch statische Codeanalyse allein auffindbar gewesen.

---

_Erstellt von Claude Opus 5 (Anthropic) am 2026-08-19. Alle Aussagen wurden am Quellcode verifiziert; Build- und Testergebnisse stammen aus tatsächlichen Läufen von `npx ng build` und `npx vitest run`._
