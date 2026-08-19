# 🛠️ ReFlip – Sanierungsplan

| | |
|---|---|
| **Datum** | 2026-08-19 (überarbeitet nach Abstimmung mit Grischa Tänzer) |
| **Erstellt von** | Claude Opus 5 (Anthropic) – KI-Assistent |
| **Grundlage** | [Projekt-Audit vom 2026-08-19](./2026-08-19-projekt-audit.md) – 56 Befunde |
| **Arbeitsweise** | Eine Phase komplett, dann Freigabe durch Grischa für die nächste |

---

## Entscheidungen von Grischa (2026-08-19)

| Frage | Entscheidung | Auswirkung auf den Plan |
|---|---|---|
| Light-Theme? | **Ja, bauen** | Phase 4 wird umfangreicher (~0,5 Tag statt 5 Min) |
| Echte Daten vorhanden? | **Ja** – 1 Mystery-Paket mit 2 Artikeln | Datensicherung wird **auf Phase 2 vorgezogen** |
| Stripe / DHL / PayPal echt? | **Ja, alles echt** | Eigene Phase 9 – nach dem Web-Start |
| Web-Termin | **In 2–3 Wochen** | Sicherheitsphase wird **von 6 auf 3 vorgezogen** |
| Freigabe | **Phase für Phase** | Nach jeder Phase: Bericht + Freigabe abwarten |

---

## ⚠️ Konflikt beim Zeitplan – bitte lesen

Der Wunsch „in 2–3 Wochen ins Web **und** echte Stripe-/DHL-Anbindung" ist zusammen nicht machbar. Die Gründe:

**Sanierung allein:** 9–14 Arbeitstage. Das füllt die 2–3 Wochen bereits vollständig aus.

**Echte Zahlungen (Stripe/PayPal):** Ein Checkout mit echtem Geld darf niemals im Frontend abgewickelt werden – der geheime Stripe-Schlüssel wäre sonst für jeden im Browser lesbar. Nötig ist ein serverseitiger Teil (Supabase Edge Functions) für Payment Intents, Webhook-Verarbeitung und Bestellabgleich. Dazu kommen Impressum, Widerrufsbelehrung, AGB und Datenschutzerklärung – bei einem echten Shop keine Formalie, sondern Abmahnrisiko. **Realistisch: 1–2 Wochen.**

**Echter DHL-Versand:** Für die Geschäftskundenversand-API brauchst du zuerst einen **DHL-Geschäftskundenvertrag mit EKP-Nummer** und einen freigeschalteten API-Zugang. Das ist ein Vorgang mit Vorlaufzeit, den kein Code abkürzen kann. Erst danach beginnt die Entwicklung. **Realistisch: 1 Woche Entwicklung, plus Wartezeit auf den Vertrag.**

### Mein Vorschlag

| Zeitraum | Inhalt |
|---|---|
| **Woche 1–3** | Phasen 1–8: Sanierung, Sicherheit, Datenschicht, Steuern, Qualität |
| **Ende Woche 3** | 🚀 **Ins Web – ohne den öffentlichen Shop.** Die Verwaltungs-App (Einkauf, Inventar, Verkäufe, Buchhaltung) ist dein eigentliches Arbeitswerkzeug und dann sicher und stabil. Die Shop-Route wird vorerst deaktiviert. |
| **Ab Woche 4** | Phase 9: echte Integrationen. Parallel dazu läufst du schon produktiv. |

**Parallel ab sofort erledigen (durch dich, nicht durch mich):** DHL-Geschäftskundenvertrag beantragen und Stripe-Konto verifizieren lassen. Beides hat Vorlaufzeit – wenn das im Hintergrund läuft, verlierst du keine Zeit.

> Wenn du den Shop unbedingt zum Web-Start dabei haben willst, geht das – dann verschiebt sich der Start auf **5–6 Wochen**. Das ist deine Entscheidung, ich setze um, was du sagst.

---

## Phasenübersicht

| Phase | Inhalt | Aufwand | Status |
|---|---|---|---|
| **1** | Build reparieren | 0,5 Std | 🔄 in Arbeit |
| **2** | Datensicherung (Export/Import) | 0,5 Tag | ⏳ |
| **3** | Sicherheit – Anmeldung & Datenbank | 1,5 Tage | ⏳ |
| **4** | UI-Blockaden + Light-Theme | 1 Tag | ⏳ |
| **5** | Datenschicht: Datenbank wird Quelle der Wahrheit | 3–5 Tage | ⏳ |
| **6** | Finanzen & Steuern korrigieren | 1–2 Tage | ⏳ |
| **7** | Sicherheit – Auslieferung & Barrierefreiheit | 1,5 Tage | ⏳ |
| **8** | Qualität, Aufräumen, Strict Mode | 1–2 Tage | ⏳ |
| — | 🚀 **Web-Start ohne Shop** | | |
| **9** | Echte Integrationen: Stripe, PayPal, DHL, Hermes | 2–3 Wochen | ⏳ |
| **10** | Doku ehrlich machen | 3 Std | 🔁 laufend |

---

## Phase 1 – Wieder baubar machen ⏱️ ~30 Min 🔄

**Warum zuerst:** Solange der Build kaputt ist, kannst du kein Docker-Image bauen.

| # | Aufgabe | Datei |
|---|---|---|
| 1.1 | `TS7053` beheben: `trackingSteps: readonly InboundTrackingStatus[]` als Feld in die Komponente, `$any(step)` im Template entfernt | `purchase-detail.component.{ts,html}` |
| 1.2 | `ng build` verifizieren | – |
| 1.3 | `vitest run` verifizieren (keine Regression) | – |
| 1.4 | Die 50 uncommitteten Änderungen in sinnvollen Commits sichern | – |
| 1.5 | `.gitattributes` mit `* text=auto eol=lf` – **erst nach 1.4**, sonst vermischt sich die Zeilenende-Normalisierung mit den inhaltlichen Änderungen | neu |

**Fertig, wenn:** `ng build` Exit-Code 0, alle Tests grün, `git status` sauber.

---

## Phase 2 – Deine Daten sichern ⏱️ ~0,5 Tag

**Vorgezogen, weil echte Daten vorhanden sind.** Bevor irgendjemand die Datenschicht anfasst, brauchst du ein Sicherheitsnetz. Aktuell liegt dein Mystery-Paket mit den zwei Artikeln ausschließlich im `localStorage` deines Browsers – ein geleerter Cache und es ist weg.

| # | Aufgabe |
|---|---|
| 2.1 | **Sofort-Sicherung:** Den aktuellen `localStorage`-Inhalt als JSON-Datei außerhalb des Browsers ablegen – bevor wir irgendetwas anderes tun |
| 2.2 | `BackupService`: Export **aller** `reflip_local_*`-Schlüssel als eine JSON-Datei mit Versionskennzeichen und Zeitstempel |
| 2.3 | Import-Funktion mit Validierung und Vorschau („Diese Sicherung enthält 1 Einkauf, 2 Artikel, 0 Verkäufe – wirklich einspielen?") |
| 2.4 | Bedienoberfläche dafür in den Einstellungen |
| 2.5 | Erinnerung im Header, wenn die letzte Sicherung älter als 7 Tage ist |
| 2.6 | Tests für Export → Import → identischer Datenbestand |

**Fertig, wenn:** Du deine Daten mit zwei Klicks sichern und wiederherstellen kannst, und eine Sicherungsdatei außerhalb des Browsers liegt.

---

## Phase 3 – Sicherheit: Anmeldung & Datenbank ⏱️ ~1,5 Tage 🔴

**Vorgezogen wegen des Web-Termins.** Diese Punkte dürfen am Tag des Web-Starts nicht offen sein – und je früher sie sitzen, desto weniger baut die restliche Arbeit auf falschen Annahmen auf.

### 3.1 Anmeldung

| # | Aufgabe | Bezug |
|---|---|---|
| 3.1.1 | Demo-Modus und Anmeldung trennen: `isAuthenticated` darf `isDemoUser` **nicht** mehr enthalten | Audit 2.2 |
| 3.1.2 | Den unsicheren Login-Fallback in `signIn()` entfernen – niemals ohne Passwortprüfung einloggen | Audit 2.3 |
| 3.1.3 | `authGuard` an alle geschützten Routen hängen (`canActivate`) | Audit 2.1 |
| 3.1.4 | Demo-Modus zu einem bewusst gewählten, sichtbar gekennzeichneten Zustand machen (Banner „Demo-Daten") | – |
| 3.1.5 | Guard so bauen, dass er die Sitzungsprüfung **abwartet**, statt 50 ms zu raten | Audit 2.1 |

> **Wichtig für dich:** Nach 3.1.1 ist die App ohne Anmeldung nicht mehr nutzbar. Du brauchst dann ein echtes Konto in deinem lokalen Supabase. Deine bisherigen Daten aus dem Demo-Modus übernehmen wir mit der Import-Funktion aus Phase 2.

### 3.2 Datenbank

| # | Aufgabe | Bezug |
|---|---|---|
| 3.2.1 | `OR user_id = auth.uid()` aus der `workspace_members`-INSERT-Policy entfernen, Einladungsverfahren stattdessen | Audit 2.4 |
| 3.2.2 | Storage-Bucket auf `public = false`, beide `anon`-Policies löschen, signierte URLs verwenden | Audit 2.5 |
| 3.2.3 | `set search_path = ''` in `is_workspace_member()` und `handle_new_user()` | Audit 2.6 |
| 3.2.4 | Alle Policies nach `CLAUDE.md` neu schreiben: kein `FOR ALL`, getrennte Policies je Operation, immer `TO authenticated`, immer `(select auth.uid())` | – |
| 3.2.5 | Indizes auf alle `workspace_id`-Spalten | – |
| 3.2.6 | Fehlende DELETE-Policies ergänzen | – |
| 3.2.7 | `supabase/config.toml`: `site_url` korrigieren, `minimum_password_length` auf ≥ 10 | Audit 6.7 |

---

## Phase 4 – UI-Blockaden + Light-Theme ⏱️ ~1 Tag

| # | Aufgabe | Wirkung |
|---|---|---|
| 4.1 | `select-none` von Shell und allen Inhaltsbereichen entfernen (52 Stellen → nur Buttons/Navigation) | Kopieren funktioniert wieder |
| 4.2 | `user-scalable=no` aus `index.html` streichen | Zoom auf dem Handy |
| 4.3 | **Light-Theme bauen:** alle `--rf-*`-Variablen für hell definieren, `.dark`-Umschaltung in `styles.css`, Systemvoreinstellung berücksichtigen | Der Schalter tut endlich etwas |
| 4.4 | Alle ~50 Templates auf fest verdrahtete dunkle Tailwind-Klassen prüfen und auf `rf-`-Variablen umstellen | Ohne diesen Schritt bleibt das Light-Theme fleckig |
| 4.5 | Kontraste im Light-Theme gegen WCAG AA prüfen | – |
| 4.6 | Globaler `:focus-visible`-Fokusring | Tastaturnavigation sichtbar |
| 4.7 | `@media (prefers-reduced-motion: reduce)` | Systemeinstellung respektiert |
| 4.8 | Google Fonts lokal nach `public/fonts/` | Offline nutzbar + DSGVO |
| 4.9 | Die 12 `<img>` ohne `alt` ergänzen | – |

> 4.4 ist der eigentliche Aufwand am Light-Theme. Ich gehe alle Templates durch – vermutlich finde ich dabei noch weitere Ungereimtheiten.

---

## Phase 5 – Datenschicht: Datenbank wird Quelle der Wahrheit ⏱️ ~3–5 Tage 🔴

**Das Kernstück.** Solange `localStorage` gewinnt, ist ein geleerter Browser-Cache gleichbedeutend mit dem Verlust deiner Buchhaltung.

### 5.1 Fundament (Reihenfolge einhalten)

| # | Aufgabe |
|---|---|
| 5.1.1 | `supabase/schemas/database.sql` vervollständigen: RLS, Policies, Funktionen, Trigger übernehmen – sonst löscht `supabase db diff` alle Sicherheitsregeln |
| 5.1.2 | Fehlende Spalten nachziehen: `workspaces.currency`, `workspaces.tax_mode`, `sources.type`, `sources.is_active`, `purchases.tracking_*`, `inventory_items.tax_mode_override` |
| 5.1.3 | Fehlende Tabellen anlegen: Retouren, Gutschriften, Versandlabels, Shop-Bestellungen, Rechnungen, Preisalarme, Benachrichtigungen, Bankabgleich, Offline-Warteschlange |
| 5.1.4 | `npx supabase gen types typescript --local > src/app/core/models/supabase.types.ts` |
| 5.1.5 | `createClient<Database>(...)` typisieren – ab hier findet TypeScript Schema-Abweichungen selbst |

### 5.2 Datenfluss umdrehen

| # | Aufgabe |
|---|---|
| 5.2.1 | `{ ...item, ...local }` in `inventory.service.ts`, `purchase.service.ts`, `sales.service.ts` ersetzen: Datenbank gewinnt; lokal nur bei noch nicht synchronisierten Einträgen (`pending_sync`) |
| 5.2.2 | `withTimeout(..., 1000)` entfernen oder auf ≥ 10 s anheben |
| 5.2.3 | Leere `catch {}` durch echte Fehlerbehandlung ersetzen, sichtbarer Hinweis in der Oberfläche |
| 5.2.4 | Eine einzige Offline-Warteschlange für **alle** Schreibvorgänge, mit Statusanzeige „x Änderungen nicht synchronisiert" |
| 5.2.5 | Migration deiner vorhandenen Daten (Mystery-Paket + 2 Artikel) aus `localStorage` in die echte Datenbank – mit Prüfung vorher/nachher |

### 5.3 Restliche Services anbinden

Reihenfolge nach Wichtigkeit: `return.service` → `invoice.service` → `tax-advisor.service` → `fulfillment.service` → `store.service` → Rest.

---

## Phase 6 – Finanzen & Steuern ⏱️ ~1–2 Tage 🔴

| # | Aufgabe | Bezug |
|---|---|---|
| 6.1 | Kostenverteilung auf Cent-Arithmetik (Largest-Remainder) – die Summe muss **exakt** dem Einkaufspreis entsprechen | Audit 4.1 |
| 6.2 | Wertgewichtete Verteilung: Rückfall auf gleichmäßig, wenn keine erwarteten Werte gepflegt sind | Audit 4.2 |
| 6.3 | DATEV-Belegdatum auf `TTMM` korrigieren | Audit 4.3 |
| 6.4 | DATEV-Buchungsrichtung korrigieren (`Konto = 1200`, `Gegenkonto = 8200`) | Audit 4.4 |
| 6.5 | Vollständigen EXTF-Header mit 31 Feldern, korrekte Zeichenkodierung | Audit 4.5 |
| 6.6 | `netProfitAfterTax` gegen `netTaxLiability` rechnen | Audit 4.6 |
| 6.7 | CSV-Exporte gegen Formel-Injection absichern | Audit 4.7 |
| 6.8 | Für **jeden** Punkt zuerst einen Test schreiben, der den Fehler zeigt, dann korrigieren | – |

> ⚠️ Ich bin kein Steuerberater. Bevor du einen erzeugten DATEV-Stapel einreichst, sollte deine Kanzlei einen Testexport gegenlesen. Die DATEV-Formatvorgaben sind detailliert und versionsabhängig.

---

## Phase 7 – Sicherheit: Auslieferung & Barrierefreiheit ⏱️ ~1,5 Tage 🔴

### 7.1 Auslieferung

| # | Aufgabe | Bezug |
|---|---|---|
| 7.1.1 | Security-Header in `nginx.conf`: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy | Audit 2.8 |
| 7.1.2 | `index.html` auf `no-cache` | Audit 2.8 |
| 7.1.3 | Service Worker: API- und Auth-Antworten **nicht** cachen; möglichst auf `@angular/service-worker` umstellen | Audit 2.7 |
| 7.1.4 | Edge Function: `Deno.serve`, CORS auf eigene Domain, JWT prüfen | Audit 2.9 |
| 7.1.5 | Alle API-Schlüssel aus dem Frontend entfernen | Audit 2.10 |
| 7.1.6 | Docker: `HEALTHCHECK`, Port `8080:80`, `.env`-Mechanismus | Audit 6.8 |
| 7.1.7 | `enable_confirmations = true` in Supabase, echter SMTP-Versand | Audit 6.7 |

### 7.2 Barrierefreiheit (WCAG AA)

| # | Aufgabe | Bezug |
|---|---|---|
| 7.2.1 | Gemeinsame `<app-modal>`-Komponente: `role="dialog"`, `aria-modal`, Fokus-Falle, Escape, Fokus-Rückgabe – alle 22 Overlays umstellen | Audit 7.3 |
| 7.2.2 | Die 5 klickbaren `<div>`s zu `<button>`s | Audit 7.9 |
| 7.2.3 | Sprunglink „Zum Inhalt springen" | Audit 7.10 |
| 7.2.4 | `NgOptimizedImage` für statische Bilder | Audit 7.6 |
| 7.2.5 | Kleinste Schriftgrade anheben, Kontraste prüfen | Audit 7.11 |

---

## Phase 8 – Qualität & Aufräumen ⏱️ ~1–2 Tage

| # | Aufgabe |
|---|---|
| 8.1 | Icons: 36 Dateien von `lucide-angular` auf `@lucide/angular` umstellen, altes Paket entfernen |
| 8.2 | `--legacy-peer-deps` aus Dockerfile und CI entfernen (geht nach 8.1) |
| 8.3 | `@ngx-translate/http-loader` deinstallieren, `public/i18n/*.json` löschen |
| 8.4 | Die ~30 leeren `.scss`-Dateien löschen |
| 8.5 | ESLint mit `angular-eslint` einrichten |
| 8.6 | `vitest.config.ts` anlegen (`jsdom`, Angular-Setup, Coverage) |
| 8.7 | CI erweitern: `npm test`, Lint, Format-Check |
| 8.8 | 17 × `console.*` durch `LoggerService` ersetzen |
| 8.9 | `OnPush` in `src/app/app.ts` |
| 8.10 | `theme.service.ts`: `localStorage` aus der Feld-Initialisierung |
| 8.11 | **`"strict": true` + `strictTemplates`** einschalten und Fehler abarbeiten – zum Schluss |

---

## 🚀 Web-Start (ohne öffentlichen Shop)

Vor dem Umschalten abzuhaken:

- [ ] Alle Phasen 1–8 abgeschlossen und freigegeben
- [ ] `ng build` und alle Tests grün
- [ ] Shop-Route (`/shop`) deaktiviert oder hinter Anmeldung
- [ ] Echtes Supabase-Projekt (nicht mehr lokal), Migrationen eingespielt
- [ ] Anon-Key und URL über Umgebungsvariablen, nicht fest im Bundle
- [ ] Sicherung deiner Daten eingespielt und geprüft
- [ ] HTTPS, Security-Header aktiv
- [ ] Datenschutzerklärung und Impressum vorhanden

---

## Phase 9 – Echte Integrationen ⏱️ ~2–3 Wochen (nach dem Web-Start)

### 9.1 Stripe & PayPal

| # | Aufgabe |
|---|---|
| 9.1.1 | Edge Function `create-payment-intent` – geheimer Schlüssel **nur** dort, nie im Frontend |
| 9.1.2 | Edge Function `stripe-webhook` mit Signaturprüfung für Zahlungsbestätigungen |
| 9.1.3 | Stripe Elements im Checkout einbinden (die Kartendaten berühren deinen Server nie) |
| 9.1.4 | PayPal Server-SDK, Bestellung anlegen und erfassen |
| 9.1.5 | Bestandsreservierung mit Ablaufzeit, damit Artikel nicht doppelt verkauft werden |
| 9.1.6 | Rechtstexte: Impressum, AGB, Widerrufsbelehrung, Datenschutzerklärung, Versand- und Zahlungsinformationen |
| 9.1.7 | Test mit Stripe-Testkarten, dann eine echte Kleinstzahlung |

> **Voraussetzung von dir:** verifiziertes Stripe-Konto, PayPal-Geschäftskonto. Beides jetzt schon beantragen.

### 9.2 DHL & Hermes

| # | Aufgabe |
|---|---|
| 9.2.1 | Edge Function als Vermittler zur DHL-Geschäftskundenversand-API (Zugangsdaten nur dort) |
| 9.2.2 | Labelerzeugung mit echten Sendungsnummern, PDF-Rückgabe |
| 9.2.3 | Echte Sendungsverfolgung statt simulierter Prüfpunkte |
| 9.2.4 | Hermes ProfiPaketService analog |
| 9.2.5 | Kombiversand auf echte Tarife umstellen |

> **Voraussetzung von dir:** DHL-Geschäftskundenvertrag mit EKP-Nummer und freigeschaltetem API-Zugang. **Bitte jetzt beantragen** – das hat Vorlaufzeit und blockiert sonst die ganze Phase.

### 9.3 Weitere

| # | Aufgabe |
|---|---|
| 9.3.1 | eBay-Anbindung über Edge Function mit echtem Entwicklerkonto (der jetzige Direktaufruf aus dem Browser scheitert ohnehin an CORS) |
| 9.3.2 | Preis-Radar auf echte Daten statt simulierter Bewegungen |
| 9.3.3 | „KI"-Funktionen: entweder echtes Modell anbinden oder ehrlich als regelbasiert bezeichnen |

---

## Phase 10 – Doku ehrlich machen 🔁 laufend

| # | Aufgabe |
|---|---|
| 10.1 | `README.md`: simulierte Funktionen als solche kennzeichnen – bis Phase 9 sie ersetzt |
| 10.2 | Versionsangaben korrigieren: Angular 22, 24 Suiten / 96 Tests |
| 10.3 | `ARCHITECTURE.md`: Behauptungen zu Strict Mode, „100 % deterministisch", „sauberer Build" erst wieder aufnehmen, wenn sie stimmen |
| 10.4 | „100 % datenschutzkonform" streichen, bis Fonts lokal liegen |
| 10.5 | Docker- und Supabase-Startablauf dokumentieren |
| 10.6 | Reifegrad-Tabelle je Feature: *fertig / prototypisch / simuliert* |
| 10.7 | Nach jeder Phase: Eintrag im [KI-Änderungsprotokoll](../AI-CHANGELOG.md) |

---

*Erstellt von Claude Opus 5 (Anthropic) am 2026-08-19, überarbeitet nach Abstimmung mit Grischa Tänzer am selben Tag.*
