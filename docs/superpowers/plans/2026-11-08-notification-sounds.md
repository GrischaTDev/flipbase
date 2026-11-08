# Notification Sounds Implementation Plan

> **For agentic workers:** Use the existing project checks and review the complete change before publication. Independent persistence and settings tasks share the contracts below.

**Goal:** Allgemeiner Benachrichtigungston und Verkaufston lassen sich in den vorhandenen Benachrichtigungseinstellungen unabhängig abschalten.

**Architecture:** Der bestehende Workspace-Speicherweg bleibt erhalten. Ein gemeinsamer Audiendienst erzeugt zwei kurze eigene Klänge und berücksichtigt die Browserfreigabe. Neue Meldungen verwenden den passenden Ton; Laden bestehender Meldungen erzeugt keinen Ton.

**Tech Stack:** Angular 22, Signals, Web Audio, Supabase, Vitest.

**Spec:** Nutzerauftrag vom 08.11.2026 und der folgende Abschnitt.

## Vereinbarter Umfang und Entscheidungen

- Vorhandene Einstellungsseite und gemeinsame Formularbausteine verwenden.
- `soundEnabled` steuert allgemeine Meldungen; `saleSoundEnabled` steuert ausschließlich neue Verkäufe. Kein Ersatzton bei ausgeschaltetem Verkaufston.
- Beide Schalter bleiben unabhängig vom Anzeigen einer Meldung. Bestehende Einstellungen für Ereignisse und Versand bleiben erhalten.
- Fehlende Verkaufstoneinstellung übernimmt den bisherigen Tonstatus. Bereits stumme Workspaces werden nicht ungefragt hörbar.
- Zwei eigene kurze Klänge, darunter ein Kassenton. Keine Shopify-Audiodatei übernehmen.
- Probehören erzeugt keine Benachrichtigung und speichert keine Einstellung.
- Keine Behauptung eigener Web-Push-Töne bei geschlossener PWA; keine native App in dieser Aufgabe.
- Anmeldung, Workspace-Wechsel, erneutes Laden, Lesen und Löschen dürfen alte Meldungen nicht erneut vertonen.

## Global Constraints

- Änderungen auf `juna/notification-sounds`, Grundlage frisch abgerufenes `origin/master`.
- Englische Bezeichner; deutsche Beschriftungen und Dokumentation.
- Keine neuen Anwendungsabhängigkeiten, keine produktiven Datenbankänderungen.
- Migration mit einem tatsächlichen Schemaabgleich erzeugen; bestehende Migrationen erhalten.
- Node 22, gezielte Formatierung, `preflight:plan`, `preflight`, Format und Lint vor Veröffentlichung.

## Review Focus

- Allgemeiner Ton aus und Verkaufston an sowie umgekehrt funktionieren unabhängig.
- Alte stumme Konfigurationen bleiben stumm; Serverbestätigung und Workspace-Grenzen bleiben wirksam.
- Neu eingehende Marktplatzmeldungen unterscheiden tatsächliche Verkäufe von Stornos, Einkäufen und Erstattungen.
- Erste Datenladung, wiederholte Feeds und nicht mehr aktuelle Workspace-Antworten bleiben stumm.
- Blockierte oder suspendierte Audiowiedergabe verursacht weder Fehler im Fachablauf noch später nachgeholte Töne.

### Task 1: Speicherung und Einstellungen

- [x] Bestehende Handler- und Komponententests für getrennte Schalter und Legacy-Verhalten erweitern; UI-Rot/Grün vor und nach der Änderung belegt, Handlerfälle nach der Änderung erfolgreich ausgeführt.
- [x] Nullable `webhook_configs.sale_sound_enabled` ergänzen; effektiven Wert über `sale_sound_enabled ?? sound_enabled` bereitstellen und unabhängig speichern.
- [x] Schemaabgleich, Migration und passende SQL-Nachweise erzeugen; Rechte und Geheimnisbehandlung erhalten.
- [x] Bestehendes Formular um `saleSoundEnabled` und Probehören erweitern; Lade-, Speicher- und Workspace-Wechsel berücksichtigen.

**Interfaces:** `WebhookConfig.saleSoundEnabled?: boolean`; `NotificationSoundService.preview(kind: 'general' | 'sale'): Promise<boolean>`.

### Task 2: Wiedergabe und Ereignisse

- [x] Gezielte Tests für Soundwahl, blockiertes Audio und neue gegenüber bereits geladenen Meldungen zunächst fehlschlagen lassen.
- [x] `src/app/core/services/notification-sound.service.ts` für kurze eigene Töne mit begrenzter Ressourcenlebensdauer ergänzen.
- [x] Bestehende Meldewege am passenden Eingang anbinden; Verkauf anhand strukturierter Ereignisdaten erkennen.
- [x] Wiederholte, bereits gelesene oder beim Einstieg vorhandene Meldungen nicht abspielen.

### Task 3: Prüfung und Übergabe

- [x] Gezielte betroffene Service-, Modell-, Handler- und Komponententests ausführen.
- [x] Gerenderte Schalter und Probehören durch Angular-DOM-Tests auf der vorhandenen Einstellungsseite prüfen. Manuelle Browserprüfung wegen getrennter Loopback-Netze nicht möglich; echte Browser-/Audiofreigabe bleibt offen.
- [x] Unabhängige Gesamtprüfung durchführen und konkrete Fehler beheben.
- [x] Eigene Dateien formatieren, Vorabcheck mit Node 22 ausführen und tatsächliche Prüflücken dokumentieren. Nach zwei behobenen Umgebungseinflüssen wurden die Orchestrierung und sämtliche verbleibenden Prüfungen desselben Plans erfolgreich ausgeführt; bestandene unveränderte Prüfungen wurden wiederverwendet.
- [x] `docs/AI-CHANGELOG.md` mit Umsetzung und Nachweisen abschließen und den lokalen Aufgabenzweig für die Übergabe vorbereiten. Der Nutzer hat Branch-Push, PR, Merge nach erfolgreichen Pflichtprüfungen und anschließende Bereinigung ausdrücklich freigegeben.

## Abschlussnachweis

- 904 Node-, 227 DOM- und 2.620 Angular-Tests im ausgewählten lokalen Umfang bestanden.
- 168 Skriptverträge und 11 Orchestrierungsfälle bestanden; Format, Lint, Typen und Suite-Audit geprüft.
- 12 Edge-Handlerfälle und 30 SQL-Fälle bestanden; Migration auf Altbestand und leerer Folge-Diff nachgewiesen.
- Produktionsbuild mit Angular-Vorlagen und PWA-Paket erfolgreich.
- Unabhängige Codeprüfung ohne offene Befunde.
- Echte Browser-Audiowiedergabe sowie vollständige Datenbank-, Browser- und PWA-Freigabe bleiben CI beziehungsweise Geräteprüfung vorbehalten.
