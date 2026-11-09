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
- [x] Gerenderte Schalter und Probehören durch Angular-DOM-Tests auf der vorhandenen Einstellungsseite prüfen. Die anschließende Live-Bedienprüfung vom 9. November ist unten dokumentiert; eine akustische Bewertung wurde nicht vorgenommen.
- [x] Unabhängige Gesamtprüfung durchführen und konkrete Fehler beheben.
- [x] Eigene Dateien formatieren, Vorabcheck mit Node 22 ausführen und tatsächliche Prüflücken dokumentieren. Nach zwei behobenen Umgebungseinflüssen wurden die Orchestrierung und sämtliche verbleibenden Prüfungen desselben Plans erfolgreich ausgeführt; bestandene unveränderte Prüfungen wurden wiederverwendet.
- [x] `docs/AI-CHANGELOG.md` mit Umsetzung und Nachweisen abschließen und den lokalen Aufgabenzweig für die Übergabe vorbereiten. Der Nutzer hat Branch-Push, PR, Merge nach erfolgreichen Pflichtprüfungen und anschließende Bereinigung ausdrücklich freigegeben.

## Lokaler Umsetzungsnachweis vom 8. November 2026

- 904 Node-, 227 DOM- und 2.620 Angular-Tests im ausgewählten lokalen Umfang bestanden.
- 168 Skriptverträge und 11 Orchestrierungsfälle bestanden; Format, Lint, Typen und Suite-Audit geprüft.
- 12 Edge-Handlerfälle und 30 SQL-Fälle bestanden; Migration auf Altbestand und leerer Folge-Diff nachgewiesen.
- Produktionsbuild mit Angular-Vorlagen und PWA-Paket erfolgreich.
- Unabhängige Codeprüfung ohne offene Befunde.
- Der ausgewählte CI-Freigabeumfang wurde anschließend mit PR #595 bestätigt. Die Live-Bedienprüfung folgt unten; die hörbare Wiedergabe wurde nicht akustisch bewertet.

## Nachtrag: getrennte Bereitstellung von Web und Edge-Funktion

PR #595 ist nach grüner vollständiger CI als `ee59d34` gemergt. Web-Release,
SQL-Migration und öffentliche Auslieferung sind erfolgreich nachgewiesen.
Der öffentliche Handler `webhook-dispatch` wird laut dokumentiertem Releaseweg
separat installiert. Die zunächst betriebene Fassung lehnte den neuen Verkaufston-Schlüssel ab;
der dafür notwendige Betreiberzugang war am 8. November in dieser Umgebung
nicht verfügbar.

- [x] Auf `juna/notification-sound-compatibility` bestätigte Serverunterstützung
      getrennt vom Legacy-Tonstatus führen; alte Handler erhalten keine neuen
      Schlüssel und die zweite Option erscheint erst nach Bestätigung.
- [x] Legacy-Speichern und vorgeschaltetes Speichern beim Webhook-Test rot/grün
      prüfen; neue unabhängige Optionen und Workspace-Grenzen erhalten.
- [x] Korrektur lokal prüfen und für einen erneut grünen PR vorbereiten:
      723 Node-, 189 DOM- und 2.260 Angular-Fälle, 148 Skriptfälle,
      11 Orchestrierungsfälle sowie Produktionsbau nachgewiesen. Eine veraltete
      Workspace-Fixture korrigiert und gezielt nachgeprüft; erfolgreiche
      unveränderte Prüfungen weiterverwendet und den identischen Plan vollständig
      abgeschlossen. Die Korrektur wurde mit PR #598 veröffentlicht.
      Die vorhandene Nutzerfreigabe für den Soundauftrag umfasst die notwendige
      Korrektur.
- [x] Geprüften Handler über den bestehenden Betreiberzugang atomar installiert,
      Host-Prüfsumme bestätigt und den bestehenden Container neu gestartet.
- [x] Tatsächlichen Laufzeitstand über Container-Gesundheit und Dateihash
      bestätigt; unabhängiges Speichern mit jeweils einem ausgeschalteten Ton
      in der öffentlichen Oberfläche durch erneutes Laden geprüft.
- [x] Remote-Aufgabenbranches der PRs #595 und #598 gelöscht; am 9. November
      bestätigt.

## Betriebsnachweis vom 9. November 2026

Der Betreiberzugang über die Hetzner-Konsole ist jetzt verfügbar. Die Zieldatei
wurde nach Sicherung der bisherigen Datei atomar eingesetzt; der Host bestätigt
den Zielhash. Der bestehende Funktionscontainer wurde erfolgreich neu gestartet.
Der [Betriebsnachweis](../../implementation/notification-sound-rollout.md) hält
Ausgangslage und Eingriff fest. Derselbe Container ist nach dem Neustart gesund;
die Datei im Container entspricht dem Zielhash. Die öffentliche Einstellungsseite
in Version `0.426.1` zeigt beide Schalter und Vorschauen. Aus/an und an/aus wurden
jeweils gespeichert und nach erneutem Laden bestätigt; an/an wurde anschließend
wiederhergestellt und ebenso bestätigt. Beide Vorschauen blieben ohne
UI-Fehlermeldung; eine akustische Bewertung ist damit nicht belegt.

Backup unter `/root/sound.Mdbu0i/webhook-settings.ts` mit der ursprünglichen
Prüfsumme und Verzeichnismodus `0700` bestätigt. Der Containerstart ist mit
`2026-11-09T11:26:50.682470354Z` belegt. Der separate Rollout und die funktionale
Live-Prüfung sind abgeschlossen. Es wurden weder ein echtes Verkaufsereignis
noch ein externer Webhook ausgelöst; die Nachweise betreffen Einstellungen und
Vorschauaufrufe.
