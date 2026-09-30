# Unternehmensdaten in Shop und Versand – PR 4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bankkonto, Impressumsangaben und Standard-Versandanschrift aus dem aktiven Unternehmensprofil verwenden, bestehende Versand-Overrides erhalten und die doppelte Steuerpflege entfernen.

**Architecture:** Reine Projektionen bilden die vorhandenen Unternehmensdaten für Shop und Versand ab. StoreService hält nur Shop-Konfiguration und liest Unternehmenswerte separat; FulfillmentService entscheidet anhand einer gespeicherten Auswahl zwischen Unternehmensanschrift und Override. Legacy-Shopdaten bleiben in der Datenbank erhalten und echte Bankdaten werden ausschließlich als ausdrücklich zu speichernder Vorschlag angeboten.

**Tech Stack:** Bestehendes Angular 22, Signals, Shared-Komponenten, Tailwind und Supabase. Keine Abhängigkeitsupdates.

**Spec:** `docs/superpowers/specs/2026-09-30-account-company-settings-design.md`, Abschnitte Shop & Zahlungen, Versand, Workspace und PR 4.

## Global Constraints

- Rechtliche Geschäftsdaten werden ausschließlich unter „Unternehmen“ gepflegt.
- Unternehmensdaten sind workspacebezogen und nur für Owner/Admin änderbar.
- Bestehende individuelle Versandadressen bleiben aktiv; neue Konfigurationen verwenden standardmäßig die Unternehmensanschrift.
- Keine automatische Übernahme alter Demo-Werte, keine Änderungen historischer Dokumente, keine entfernten Legacy-Felder vor geprüftem Übergang.
- Antworten und Oberfläche Deutsch, Bezeichner Englisch, gemeinsame Bezeichnung Juna.
- Schema deklarativ, Migration erzeugen und Typen generieren; nur eine eigens angelegte lokale Testdatenbank zurücksetzen.

## Review Focus

- Workspace-Wechsel während des Ladens oder Speicherns darf weder fremde Bankdaten zeigen noch falsche Absender verwenden.
- Ein unvollständiges oder fehlgeschlagen geladenes Unternehmensprofil darf keine Demo-Fallbacks und kein verwendbares Bankkonto erzeugen.
- Wechsel zur Unternehmensanschrift und zurück muss den alten Override unverändert erhalten.
- Unbekannte alte JSON-Zahlungsfelder bleiben beim Speichern der Zahlungsmethoden erhalten; abgeleitete Unternehmenswerte werden nicht zurückgeschrieben.
- Ein Vorschlag aus Legacy-Daten darf ein vorhandenes Unternehmenskonto nicht überschreiben und wird erst durch ausdrückliches Speichern dauerhaft.

### Task 1: Unternehmensprojektionen und Shop-Service

**Files:** Neue `src/app/core/models/company-store.models.ts` und `.spec.ts`; `store.models.ts`, `store.service.ts` und gezielter `company-store.service.spec.ts`.

**Interfaces:** Consumes `CompanyProfileService.profile()` und `WorkspaceService.currentWorkspace()?.id`. Produces `companyBankAccount()`, `companyImprint()`, `legacyBankAccount()` und `canUseBankTransfer()` auf StoreService. Bankkonto verwendet `bankAccountHolder`, `iban`, `bic`, `bankName`; Impressum verwendet ausschließlich rechtliche Profilangaben.

- [x] Failing tests: vollständiges aktuelles Konto, fehlender Inhaber/IBAN, fremdes Profil, reale Legacy-Vorschläge und erkannte Demo-IBAN; Service ignoriert Legacy-Impressum und bewahrt Legacy-Zahlungsfelder beim Speichern.
- [x] Run `npx vitest run --project=node src/app/core/models/company-store.models.spec.ts src/app/core/services/company-store.service.spec.ts`; Expected: neue Verhaltensprüfungen FAIL.
- [x] Implement reine Projektionen und aktuelle Workspace-Prüfung; PaymentGatewayConfig enthält keine Bankstammdaten mehr, StoreSettings kein editierbares Impressum. Defaults enthalten keine erfundenen Konten/Kontakte. Banküberweisung ohne aktuelles Unternehmenskonto wird vor Bestellanlage abgewiesen.
- [x] Run dieselbe Node-Auswahl einschließlich `store.service.spec.ts`; Expected: PASS. Vorhandene Bestellabläufe bleiben unverändert, außer fehlendem Bankkonto.
- [x] Commit `feat(core): derive store company details from the active profile` und Nachweis im Ledger.

### Task 2: Versand-Vererbung und Schema

**Files:** `fulfillment.models.ts`, `fulfillment.service.ts`; neue `company-shipping.service.spec.ts`; neue `supabase/schemas/300_company_shipping.sql`, erzeugte Migration, `supabase/config.toml`, generierte Typen und `supabase/tests/company_shipping.test.sql`.

**Interfaces:** Consumes aktuelles Unternehmensprofil. Produces `CarrierConfig.useCompanyAddress: boolean`; `getSenderAddress(): AddressInfo | null` bleibt kompatibel. Datenbankspalte `use_company_address boolean` ist nullable: null bedeutet ausschließlich alte Konfiguration automatisch anhand vollständiger Override-Felder einordnen, nicht die Adresse überschreiben.

- [x] Failing tests: neue Konfiguration zentral, bestehender vollständiger Override bleibt individuell, Profiländerung wirkt nur im zentralen Modus, fremdes/fehlendes Profil liefert null, Umschalten bewahrt Override-Felder.
- [x] Run neue und vorhandene Fulfillment-Tests; Expected: neue Verhaltensprüfungen FAIL.
- [x] Implement Auswahl und Versandprojektion; null aus alten Daten explizit als vollständiger Override oder zentral abbilden. Beim Speichern nur die Auswahl und vorhandenen Carrier-/Override-Felder schreiben.
- [x] Deklaratives Schema schreiben, gezielten Abgleich aus unveränderter Migrationsbasis erzeugen, Typen neu generieren. DB-Prüfungen für Legacy-null, explizite Modi und Workspace-Isolation.
- [x] Run Versandtests und `npx supabase test db --db-url <isolierte lokale Prüfdatenbank>`; Expected: PASS.
- [x] Commit `feat(core): inherit company shipping addresses and preserve overrides` und Nachweis im Ledger.

### Task 3: Einstellungsseiten und Storefront

**Files:** Shop-, Versand-, Workspace- und Unternehmens-Einstellungsseiten samt Angular-Tests; Store-Layout, Checkout und Bestellerfolg samt betroffenen Tests.

**Interfaces:** Consumes StoreService-Projektionen und CarrierConfig.useCompanyAddress. Shop zeigt maskierte IBAN und RouterLink `/settings/company`. Versand zeigt Schalter „Unternehmensanschrift verwenden“, zentrale Adresse schreibgeschützt oder Override-Felder. Company-Seite bietet echte alte Bankdaten nur bei leerem Konto als Formularvorschlag an; kein automatischer Datenbankaufruf.

- [x] Failing Angular-/DOM-Tests: keine Bank-Formfelder in Shop, maskiertes aktuelles Konto, korrekter Unternehmenslink; zentraler Versand ohne bearbeitbare Adressfelder, Override wieder sichtbar; Workspace ohne Steuer-Auswahl; Legacy-Übernahme nur ins Formular ohne Speichern.
- [x] Run betroffene Angular-/DOM-Auswahl; Expected: neue Verhaltensprüfungen FAIL.
- [x] Implement mit vorhandenen Shared-Buttons, Cards, Feldern, Checkboxen und Badges. Formulargültigkeit berücksichtigt nur aktive Versandadresse. Unternehmens- und Carrier-Ladefehler bleiben sichtbar.
- [x] Store-Impressum, Checkout und Bestellerfolg lesen Unternehmensprojektionen. Keine Anzeige von Legacy-/Demo-Werten; bei fehlendem Konto Banküberweisung nicht anbieten und verständlichen Hinweis zeigen.
- [x] Run betroffene Angular-/DOM-Auswahl, Typprüfung, Shared-UI-Prüfung und Produktionsbuild; Expected: PASS.
- [x] Commit `feat(ui): centralize company settings for store and shipping` und Nachweis im Ledger.

### Task 4: Browserabnahme und Gesamtprüfung

**Files:** neuer `e2e/company-shop-shipping.spec.ts`, Browser-Auswahlvertrag und `docs/AI-CHANGELOG.md`.

**Interfaces:** Consumes Tasks 1–3. Browserfälle sind `@core-smoke` und nutzen echte Workspace-Daten.

- [x] Browsertest: Unternehmensbankkonto statt Legacy, maskierte Anzeige, Impressumsname aktuell, neue Versandkonfiguration zentral und bestehender Override unverändert. Automatisches WCAG AA, schmale Ansicht ohne horizontalen Überlauf.
- [x] Run Browserauswahl in eigener Testumgebung; Expected: PASS.
- [x] Run betroffene Tests, vollständige lokale DB-Prüfungen, Suite-Audit, Format/Lint, Typprüfung und Produktionsbuild; Expected: PASS. Vollständige Anwendungssuite bleibt gemäß AGENTS.md einmalige PR-CI.
- [ ] Abschließendes unabhängiges Review nach Skill; wichtige Befunde mit fehlschlagendem Regressionstest beheben, Nebenvorschläge protokollieren.
- [ ] Commit geprüften Abschlussstand; erst dann fragen: „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“

## Geprüfter Stand

- Task 1: 27 Node-Tests; Task 2: 31 Node-Tests. Task 3: 94 Angular-, DOM- und Node-Tests. Neue Prüfungen wurden zuerst fehlschlagend ausgeführt.
- Vollständige Datenbankprüfung: 69 Dateien, 2.303 Prüfungen erfolgreich. Neue Migration in eigener Datenbank angewendet; Typen neu erzeugt.
- Echter Chromium-Browserfall auf `http://127.0.0.1:4200`, eigene lokale Supabase auf Port 45351: Unternehmensbank, erhaltene Legacy-Daten, aktuelles Impressum, neue zentrale Versandanschrift, alter individueller Absender und Formularvorschlag ohne Speichern erfolgreich. Automatische WCAG-AA-Prüfungen und 390px ohne horizontalen Überlauf erfolgreich.
- Browser-Plugin nicht verfügbar; bestehende Playwright-Infrastruktur verwendet. Screenshots außerhalb des Repositorys, keine Laufzeitfehler im geprüften Ablauf.
- Typprüfung, Produktionsbuild, Shared-UI-Prüfung, Suite-Audit und Schema-/Migrations-/Browserauswahl-Verträge erfolgreich. Bestehender pako-Bauhinweis bleibt bestehen. Supabase Advisors melden zwei bestehende Hinweise zu mehrfachen Lese-Policies bei Sniper-Abfragen und Workspace-Lizenzen; keine neue Warnung für diesen Umbau.

## Entscheidungen zum Übergang

1. Die neue Versand-Auswahl bleibt für Altzeilen nullable; vollständige alte Absender gelten weiterhin als individuell. Bei einer falsch eingeordneten unvollständigen Adresse wird sie nicht verwendet; ihre Werte bleiben erhalten.
2. Legacy-Shopfelder bleiben gespeichert, sind aber keine aktive Bank-/Impressumsquelle. Nur ausdrücklich gespeicherte Vorschläge werden Unternehmenskonto. Wird eine echte alte IBAN irrtümlich als Demo erkannt, fehlt lediglich der Vorschlag; der gespeicherte Altwert bleibt erhalten.
3. Gemäß AGENTS.md läuft die vollständige Anwendungssuite einmal in der PR-CI; lokal wurden die relevanten Anwendungstests und sämtliche Datenbanktests ausgeführt. Sachfremde Regressionen können dadurch erst im PR-Lauf auffallen.
