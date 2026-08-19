# 🤖 KI-Änderungsprotokoll

Dieses Projekt wird teilweise mit KI-Assistenten entwickelt. **Jede** von einer KI durchgeführte Änderung wird hier mit Namen und Modell des Assistenten dokumentiert.

## Regel für alle KI-Assistenten

> Wenn du ein KI-Assistent bist und an diesem Projekt arbeitest: Trage **jede** Arbeitssitzung hier ein – mit deinem Modellnamen, dem Datum, was du getan hast und warum. Auch reine Analysen ohne Codeänderung. Neueste Einträge kommen nach oben.

**Format je Eintrag:**

```markdown
## YYYY-MM-DD – <Modellname> – <Kurztitel>
**Art:** Analyse | Feature | Bugfix | Refactoring | Doku | Konfiguration
**Betroffen:** <Dateien oder Bereiche>
**Was:** <Was wurde gemacht>
**Warum:** <Begründung>
**Verifiziert durch:** <Build / Tests / manuell – mit Ergebnis>
```

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 4: UI-Blockaden & helles Design

**Art:** Feature, Barrierefreiheit, Bugfix

**Betroffen:** `src/styles.css` (neu aufgebaut), `src/index.html`, `src/app/core/services/theme.service.ts` (neu geschrieben), `src/app/layout/{shell,header}/`, `public/fonts/` (neu), 37 Templates

**Was:**

1. **`select-none` entfernt, wo es Inhalte blockierte.** 35 von 52 Vorkommen: Shell-Wurzel, 14 Seiten-Wurzeln und alle Modal-Container. Damit lassen sich SKU, Sendungs- und Rechnungsnummern wieder markieren und kopieren. Auf Buttons und Navigation bleiben 17 Vorkommen erhalten – dort ist die Einstellung korrekt.

2. **Zoom entsperrt.** `user-scalable=no` aus `index.html` entfernt (WCAG 1.4.4).

3. **Helles Design gebaut.** `styles.css` neu aufgebaut: `:root` trägt die helle Palette, `html.dark` die bisherige dunkle. Die dunklen Werte sind unverändert übernommen, das dunkle Design sieht also exakt aus wie vorher.

   Der Kniff, der 985 Template-Änderungen erspart hat: Die Akzentfarben von Tailwind (`--color-emerald-400` und Verwandte) zeigen jetzt auf themenabhängige Variablen. Dadurch passen sich rund 480 bereits vorhandene Klassen wie `text-emerald-400` automatisch an, ohne dass die Templates angefasst werden mussten. Im hellen Design werden sie abgedunkelt, weil die Originaltöne auf Weiß nur rund 2:1 Kontrast hätten.

4. **Templates auf Design-Tokens umgestellt.** 563 fest verdrahtete Farbklassen ersetzt: 134 × `text-white`, 106 × `text-slate-400`, 162 arbiträre Hex-Werte wie `border-[#373e4d]` und weitere. Im dunklen Design ergeben die Tokens exakt dieselben Farben. Die 10 Stellen, an denen weißer Text auf farbigem Grund sitzt, haben ein eigenes Token `text-rf-on-accent` bekommen und bleiben weiß.

5. **Theme-Umschalter gebaut.** Er war im Header gar nicht vorhanden – Dienst und Icons waren eingebunden, das Template hatte den Knopf nie. `ThemeService` neu geschrieben: folgt standardmäßig der Systemvoreinstellung, reagiert auf deren Änderung, merkt sich eine bewusste Auswahl und färbt die Adressleiste mobiler Browser mit.

6. **Sichtbarer Fokusrahmen** für alle bedienbaren Elemente über `:focus-visible` (WCAG 2.4.7) und **Sprunglink** „Zum Inhalt springen" in der Shell (WCAG 2.4.1).

7. **`prefers-reduced-motion` wird respektiert** (WCAG 2.3.3).

8. **Schriften lokal.** Plus Jakarta Sans und JetBrains Mono liegen als 4 woff2-Dateien (90 KB, nur Latin) unter `public/fonts/`. Damit entfällt der Aufruf an `fonts.gstatic.com` bei jedem Seitenaufruf, der die IP-Adresse jedes Besuchers in die USA überträgt – und die Typografie steht auch offline, was für die beworbene Flohmarkt-Nutzung entscheidend ist.

9. **Öffentlicher Shop vom Umschalter ausgenommen.** `/shop` ist ein eigenständiges, dauerhaft helles Kundendesign mit dunklen Leisten. Es behält über `.rf-palette-fixed` immer die Originalfarben.

**Zwei weitere vorhandene Fehler gefunden und behoben:**

10. **Über 100 Verwendungen undefinierter Design-Klassen** (Audit 7.13). `accounting.component.html` nutzte durchgängig `text-muted`, `text-accent-emerald`, `bg-surface-2`, `card`, `kpi-value` und weitere – aus einem älteren Design-System, das nie migriert wurde. Sie erzeugten keinerlei Wirkung: Kennzahlen und Karten der Buchhaltungsseite waren schlicht unformatiert. `card`, `kpi-label` und `kpi-value` sind jetzt definiert, die übrigen auf Tokens abgebildet.

11. **11 Stellen mit weißem Text auf zu hellem Farbgrund** (Audit 7.14), teils nur 2,15:1 statt 4,5:1 – in **beiden** Designs, also kein Problem des neuen hellen. Angehoben auf `emerald-700` (5,55:1), `amber-700` (4,99:1) und `rose-600` (4,70:1).

**Korrektur eines eigenen Fehlers:**

12. **Audit-Befund 7.5 („12 Bilder ohne `alt`") war falsch und wurde zurückgezogen.** Mein ursprünglicher Test war ein zeilenbasiertes `grep`; die `<img>`-Tags sind mehrzeilig formatiert, das `alt` steht auf der Folgezeile. Korrekt geprüft: 14 Bilder, 0 ohne `alt`. Hier war nichts zu tun.

**Verifiziert durch:**
- `npx ng build` → erfolgreich; `npx vitest run` → 25 Dateien / 121 Tests grün
- **Rechnerische Kontrastprüfung im Browser** über 11 Seiten (Dashboard, Einkäufe, Inventar, Verkäufe, Buchhaltung, Einstellungen, Analytics, Listings, Fulfillment, Research, Quellen, Deal Calculator): **0 Verstöße** bei den Textfarben im hellen Design
- Weiß-auf-Farbe gesondert geprüft: Sprunglink 6,29:1, Primär-Buttons 6,29:1, alle Badges nach der Korrektur ≥ 4,5:1
- **Sichtprüfung** beider Designs auf Dashboard, Buchhaltung, Inventar und Shop
- Shop bei dunklem Admin-Design geprüft: bleibt hell, Akzente bleiben hell (`rgb(52, 211, 153)`)
- Textmarkierung praktisch getestet: Überschrift lässt sich auswählen, Sidebar bleibt geschützt
- Schriften: `document.fonts` meldet 6 geladene Schnitte, **0 externe Aufrufe** an Google

**Bewusst nicht geändert:** Die Druckkomponenten (Rechnung, Etikett, Lieferschein) bleiben weiß mit schwarzem Text – sie werden auf Papier ausgegeben.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 3: Sicherheit (Anmeldung & Datenbank)

**Art:** Sicherheit, Bugfix, Konfiguration

**Betroffen:**
- `src/app/core/services/auth.service.ts` (neu geschrieben)
- `src/app/core/guards/auth.guard.ts` (neu geschrieben, `guestGuard` ergänzt)
- `src/app/app.routes.ts`, `src/app/features/auth/login/`, `src/app/layout/shell/`
- `src/app/core/services/media.service.ts`, `workspace-member.service.ts`, `workspace.service.ts`
- `src/environments/*`, `angular.json`, `supabase/config.toml`, `public/sw.js`
- `supabase/migrations/20260819120000_security_hardening.sql` (neu)
- `supabase/migrations/20260819130000_grant_api_roles.sql` (neu)
- `supabase/schemas/database.sql` (vervollständigt)

**Was:**

*Anmeldung*
1. **Demo-Modus von Anmeldung getrennt.** `isAuthenticated` bedeutet jetzt ausschliesslich „echte Supabase-Sitzung". Der Demo-Modus ist ein eigener, bewusst zu wählender Zustand (Standard: aus) und wird durch ein Banner in der Shell deutlich gekennzeichnet. Der Guard prüft `canAccessApp`.
2. **Unsicheren Login-Fallback entfernt.** Zuvor wurde bei einer Zeitüberschreitung von 1200 ms **jede** Kombination aus E-Mail und Passwort akzeptiert. Jetzt gibt es keinen Ersatzweg mehr.
3. **`authGuard` an alle geschützten Routen gehängt**, dazu ein `guestGuard`, der Angemeldete von Anmeldung und Registrierung fernhält. Der Guard **wartet** auf `sessionReady` statt 50 ms zu raten – dadurch bleibt man beim Neuladen angemeldet.
4. **`onAuthStateChange` angebunden** – Token-Erneuerung und Abmeldung in anderen Tabs wirken jetzt.
5. **Umgebungsschalter `allowDemoMode`**: in der Entwicklung an, in der Produktion aus. Dazu die fehlenden `fileReplacements` in `angular.json` ergänzt – `environment.development.ts` wurde bisher **nie** verwendet.

*Datenbank*
6. **Kritische Lücke geschlossen:** Die INSERT-Policy auf `workspace_members` erlaubte `OR user_id = auth.uid()`. Jeder angemeldete Nutzer konnte sich damit in jeden fremden Workspace eintragen. Ersetzt durch eine Prüfung auf Verwalterrolle; neue Workspaces entstehen über die neue Funktion `public.create_workspace()`.
7. **Alle Policies neu geschrieben** nach `CLAUDE.md`: kein `FOR ALL`, getrennte Policies je Operation, immer `TO authenticated`, immer `(select auth.uid())`, fehlende DELETE-Policies ergänzt. 60 Policies über 15 Tabellen.
8. **`set search_path = ''`** in allen `SECURITY DEFINER`-Funktionen.
9. **17 Indizes** auf allen Spalten, die in Policies geprüft werden.
10. **Storage-Bucket abgesichert:** `public = false`, die beiden `anon`-Policies (Hochladen **und Löschen**) entfernt. `MediaService` nutzt jetzt signierte URLs mit Signal-gestütztem Zwischenspeicher, damit Templates weiter synchron binden können.
11. **`supabase/schemas/database.sql` vervollständigt** – enthielt nur Tabellen, keine Sicherheitsregeln. `supabase db diff` hätte vorgeschlagen, alle Policies zu löschen. Jetzt meldet der Befehl „No schema changes found".
12. `config.toml`: `site_url` auf 4200 korrigiert, Passwort-Mindestlänge von 6 auf 10, Weiterleitungs-URLs ergänzt.

*Zwei gravierende Funde, die erst beim Test gegen die laufende Datenbank sichtbar wurden*
13. **Der Datenbank fehlten sämtliche GRANTs** (Audit 2.11). Jede Abfrage endete mit `42501 permission denied` – für `authenticated`, `anon` **und `service_role`**. Die Datenbank war seit Projektbeginn vollständig unbenutzt; die leeren `catch {}`-Blöcke im Frontend haben das verdeckt. Behoben, inklusive `alter default privileges` für künftige Tabellen.
14. **Der lokale Supabase-Stack lief auf von Windows gesperrten Ports** (Audit 2.12). Hyper-V reserviert auf diesem Rechner 57322–57921; darin lagen fünf der sieben konfigurierten Ports. Zusätzlich Kollision mit zwei anderen Supabase-Projekten. Umgestellt auf 54350–54359.

*Zwei Folgefehler, die dadurch erst auftraten*
15. **Service Worker blockierte die Datenbank.** Er fing alle GET-Anfragen ab und beantwortete sie mit „503 Offline" – auch Supabase. Vorgezogen aus Phase 7 und neu geschrieben: er fasst jetzt nur noch eigene, statische Dateien an und lässt fremde Herkünfte unberührt. Damit ist auch das Zwischenspeichern von Geschäfts- und Anmeldedaten beendet (Audit 2.7).
16. **Absturz in `workspace-member.service.ts`.** `m.email.toLowerCase()` – die Tabelle `workspace_members` hat gar keine Spalte `email`, das Feld existiert nur im TypeScript-Modell (Audit 3.3). Sobald echte Zeilen kamen, warf das eine Ausnahme mitten in der Änderungserkennung. Vorläufig abgesichert; die saubere Lösung (Verknüpfung mit `profiles`) gehört zur Angleichung von Modell und Schema in Phase 5.

**Verifiziert durch:**
- `npx ng build` → erfolgreich; `npx vitest run` → 25 Dateien / 121 Tests grün
- `npx supabase db reset` → alle vier Migrationen sauber angewendet
- `npx supabase db diff` → **„No schema changes found"**
- **Angriffstests gegen die laufende Datenbank** mit zwei echten Nutzern (Alice, Bob):
  - Bob trägt sich in Alices Workspace ein → `42501 violates row-level security policy` ✅
  - Bob liest Alices Einkäufe → leere Menge ✅
  - Bob schreibt in Alices Workspace → abgewiesen ✅
  - Bob liest Alices Mitgliedschaften → leere Menge ✅
  - Nicht angemeldet liest Einkäufe → `permission denied` ✅
  - Nicht angemeldet lädt in den Bucket hoch → `403 AccessDenied` ✅
  - Nicht angemeldet löscht eine vorhandene Datei → `403 AccessDenied` ✅
  - Öffentlicher Bucket-Abruf → HTTP 400 (nicht mehr öffentlich) ✅
  - Kontrolle: Alice sieht ihre eigenen Daten, angemeldeter Upload funktioniert ✅
- **Anmeldefluss im echten Browser:** `/dashboard` ohne Anmeldung → Umleitung mit `redirectTo`; falsches Passwort → abgewiesen; richtiges Passwort → Dashboard mit **echten Daten aus der Datenbank**; Neuladen bleibt angemeldet; `/auth/login` als Angemeldeter → Umleitung; Abmelden → gesperrt und Token entfernt; Demo-Modus → Banner sichtbar
- Datenbank anschliessend zurückgesetzt, Testnutzer entfernt

**Bewusst offen gelassen (gehört zu Phase 5):**
Die App fragt weiter parallel mit der Mock-Workspace-ID `ws-1` ab, was `400 Bad Request` erzeugt (keine gültige UUID). Die Abfragen mit echter UUID liefern korrekt Daten. Das ist die localStorage/Datenbank-Doppelung aus Audit 3.1 und wird in Phase 5 aufgelöst.

**Auswirkung für dich:** Die Anwendung ist ohne Anmeldung nicht mehr nutzbar. In der Entwicklung steht weiterhin der Demo-Modus zur Verfügung, im Produktions-Build nicht.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 2: Datensicherung

**Art:** Feature & Bugfix

**Betroffen:**
- `src/app/core/models/backup.models.ts` (neu)
- `src/app/core/services/backup.service.ts` (neu)
- `src/app/core/services/backup.service.spec.ts` (neu, 26 Tests)
- `src/app/features/settings/components/backup-panel/` (neu)
- `src/app/features/settings/settings.component.{ts,html}`
- `src/app/layout/header/header.component.{ts,html}`
- `src/app/core/services/export.service.{ts,spec.ts}`

**Was:**

1. **Vollständige Sicherung.** Der neue `BackupService` erfasst **alle** 25 Speicherbereiche mit dem Präfix `reflip_` – auch Retouren, Rechnungen, Shop-Bestellungen, Artikelkosten, Belege, Bargeldkasse, Offline-Warteschlange und Konfigurationen. Werte werden geparst abgelegt, damit die Datei lesbar bleibt; nicht parsbare Werte (z. B. `reflip_theme` = `dark`) landen unverändert und werden in `rawKeys` vermerkt, damit das Einspielen zeichengenau bleibt.

2. **Wiederherstellung mit Prüfung und Vorschau.** Vor dem Überschreiben wird die Datei geprüft (Format, Version, keine projektfremden Schlüssel) und der Inhalt angezeigt: Anzahl Einkäufe, Artikel, Verkäufe, Retouren, Rechnungen, Shop-Bestellungen, Datenbereiche, Dateigrösse. Erst danach ist das Einspielen möglich. Der aktuelle Stand wird dabei automatisch als Datei heruntergeladen, bevor er ersetzt wird.

3. **Erinnerung.** Ist die letzte Sicherung älter als 7 Tage oder wurde noch nie gesichert, erscheint ein Hinweis in den Einstellungen und ein Abzeichen im Header, das direkt dorthin führt.

4. **Irreführenden bisherigen Export ersetzt.** Der Knopf „Vollständiges Backup" sicherte tatsächlich nur 4 von 25 Bereichen (Workspace, Einkäufe, Inventar, Verkäufe) – und es gab keinerlei Möglichkeit, ihn wieder einzuspielen. Das erzeugte falsche Sicherheit. `generateJsonBackup` wurde aus dem `ExportService` entfernt; an seiner Stelle steht jetzt ein CSV-Export der Einkäufe, und für die echte Sicherung der neue Bereich.

5. **Kaputten Formularbezug behoben** (siehe Audit 7.11). `settings.component.html` band an `formControlName="bankName"`, das Feld fehlte aber in der `paymentForm`-Gruppe. Die Ausnahme brach bei jedem Rendern die Änderungserkennung ab – sichtbare Folge: leere Sidebar-Navigation, leerer Header und nicht gerenderte `@if`-Blöcke auf der Einstellungsseite. Gefunden beim Testen im echten Browser, nicht durch statische Analyse.

**Entwurfsentscheidungen mit Begründung:**

- **Kein modaler Dialog für die Bestätigung.** Die 22 vorhandenen Overlays im Projekt haben weder `role="dialog"` noch Fokus-Falle (Audit 7.3). Statt einen 23. unzugänglichen Dialog zu bauen, sitzt die Bestätigung als Karte direkt auf der Seite.
- **Vollständiges Ersetzen statt Zusammenführen.** Ohne verlässliche Zeitstempel pro Datensatz liesse sich beim Zusammenführen zweier Bestände nicht entscheiden, welche Fassung gilt. Das Ergebnis wäre stillschweigend falsch. Deshalb: klar angesagtes Ersetzen, mit automatischer Sicherheitskopie vorher.
- **Anmeldezustand wird nicht mitgesichert.** `reflip_logged_out` bleibt aussen vor, damit eine alte Sicherung nicht den aktuellen Anmeldestatus überschreibt.
- **Speicherzugriff als Parameter.** `StorageLike` erlaubt es, den Dienst in Tests ohne Browser mit einer Attrappe zu betreiben – passend zur bestehenden Konvention, Dienste per `new` zu instanziieren.

**Verifiziert durch:**
- `npx vitest run` → **25 Test-Dateien, 121 Tests bestanden** (vorher 24/96: +26 neue Sicherungstests, −1 Test des entfernten Teil-Exports)
- `npx ng build` → **erfolgreich**
- **Test im echten Browser** (Chrome, `ng serve`): Rundlauf Sicherung → Daten zerstören → Einspielen stellt Einkauf, beide Artikel und den nicht-JSON-Wert `reflip_theme` zeichengenau wieder her; nach der Sicherung entstandene Reste werden entfernt; fremde Speicherschlüssel bleiben unangetastet
- **Ablehnung geprüft:** fremde JSON-Datei und beschädigtes JSON werden mit verständlicher Meldung abgewiesen
- **Oberfläche geprüft:** Statusbox, Header-Abzeichen, Vorschau mit korrekten Zahlen (1 Einkauf, 2 Artikel), Warnhinweis und beide Schaltflächen erscheinen wie vorgesehen

**Offen aus Phase 2:** nichts.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Phase 1: Build repariert

**Art:** Bugfix & Konfiguration

**Betroffen:**
- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.ts`
- `src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html`
- `.gitattributes` (neu)

**Was:**
1. **Build-Fehler behoben.** Im Template lief `@for (step of ['pending', ...])` über ein Inline-Array von Zeichenketten und griff mit `$any(step)` auf `InboundTrackingService.statusConfig` zu. `$any()` erzeugt genau den `any`-Typ, den der Indexzugriff auf ein `Record<InboundTrackingStatus, …>` dann ablehnt – daher 2 × `TS7053`. Die Stufen liegen jetzt als typisiertes Feld `trackingSteps: readonly InboundTrackingStatus[]` in der Komponente; `$any()` ist entfernt.
2. **Die 50 uncommitteten Änderungen gesichert** – zusammenhängende Arbeiten aus der vorherigen Sitzung mit Google Gemini (InboundTrackingService, CustomCheckbox, CustomSearchInput, `.linear-table`-Styles, überarbeitete Templates), in zwei Commits getrennt nach Code und Doku.
3. **`.gitattributes` angelegt** (`* text=auto eol=lf`) – bewusst als letzter Schritt, damit sich die Zeilenende-Normalisierung nicht mit den inhaltlichen Änderungen vermischt.

**Warum:**
`ng build` brach ab – damit war kein Docker-Image baubar, und jede weitere Arbeit hätte darauf blockiert.

**Verifiziert durch:**
- `npx ng build` → **erfolgreich**, Initial-Bundle 825,88 kB (192,85 kB übertragen)
- `npx vitest run` → **24 Test-Dateien, 96 Tests bestanden**
- `git status` → sauber

**Offen aus Phase 1:** nichts.

---

## 2026-08-19 – Claude Opus 5 (Anthropic) – Vollständiger Projekt-Audit

**Art:** Analyse & Doku (keine Änderung am Anwendungscode)

**Betroffen:**
- `docs/audit/2026-08-19-projekt-audit.md` (neu)
- `docs/audit/2026-08-19-sanierungsplan.md` (neu)
- `docs/AI-CHANGELOG.md` (neu)

**Was:**
Vollständige Untersuchung des Projekts auf Wunsch von Grischa Tänzer – Codesauberkeit, Fehler, Sicherheit, Datenbank, Docker, UI und Barrierefreiheit. Ergebnis: **56 Befunde** (12 kritisch, 11 schwer, 24 mittel, 9 gering), festgehalten im Audit-Dokument, sowie ein 7-Phasen-Sanierungsplan.

Wichtigste Befunde:
1. `ng build` schlägt aktuell fehl (2 × TS7053 in `purchase-detail.component.html`)
2. Kein Login-Schutz – `authGuard` existiert, ist aber nirgends eingehängt und wäre wirkungslos, weil `isAuthenticated` den Demo-Modus mit einschließt
3. `localStorage` ist die Quelle der Wahrheit, nicht die Datenbank – 20 von 34 Services haben keine Supabase-Anbindung, ~60 % der Anwendung hat keine Tabellen
4. Rechenfehler in Kostenverteilung, DATEV-Export und Steuerberechnung
5. Datenbank: jeder angemeldete Nutzer kann sich in jeden fremden Workspace eintragen; Storage-Bucket öffentlich und anonym beschreib-/löschbar
6. 22 modale Dialoge ohne jede Tastatur- und Screenreader-Unterstützung; `select-none` blockiert das Kopieren in der gesamten App
7. Die Doku beschreibt Stripe, PayPal, DHL und Hermes als „live" – tatsächlich sind sie simuliert

Ausdrücklich positiv: Die Angular-Grundlagen sind sauber – durchgängig Signals, moderne Control-Flow-Syntax, Standalone Components, `input()`/`output()`, kein `ngClass`/`ngStyle`, Lazy Loading für alle Feature-Routes, Ordnerstruktur exakt nach `CLAUDE.md`.

**Warum:**
Das Projekt wurde zuvor mit Google Gemini aufgesetzt. Vor der weiteren Entwicklung sollte der Ist-Zustand unabhängig geprüft werden.

**Verifiziert durch:**
- `npx ng build` → **fehlgeschlagen**, 2 Fehler (TS7053)
- `npx vitest run` → **24 Test-Dateien, 96 Tests bestanden**, 1,58 s
- `npm ls` → Doppelinstallation `lucide-angular@1.0.0` + `@lucide/angular@1.31.0` bestätigt
- Alle weiteren Aussagen einzeln am Quellcode nachgeprüft; jeder Befund im Audit ist mit Datei und Zeile belegt

**Nicht geändert:**
Am Anwendungscode wurde nichts angefasst. Der Sanierungsplan wartet auf Freigabe.
