# 🔍 Prüfbericht: Phase 5 (umgesetzt von Gemini 3.7 Flash)

|                     |                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| **Datum**           | 2026-08-19                                                                                               |
| **Geprüft von**     | Claude Opus 5 (Anthropic)                                                                                |
| **Status**          | ✅ Nacharbeit (Phase 5b) am 2026-08-19 abgeschlossen                                                     |
| **Geprüfter Stand** | Arbeitsverzeichnis, 44 geänderte Dateien, nicht committet                                                |
| **Grundlage**       | [Sanierungsplan Phase 5](./2026-08-19-sanierungsplan.md), [Projekt-Audit](./2026-08-19-projekt-audit.md) |

---

## Gesamturteil

**Die Datenbankseite ist gut geworden. Die Frontend-Seite ist zur Hälfte fertig – und hat sich dabei zwei neue Fehler eingehandelt, von denen einer stillschweigend Daten verliert.**

Das Schema, die Zugriffsregeln und die Typgenerierung sind sauber gemacht und halten meiner Prüfung stand. Ich habe die Angriffstests aus Phase 3 auf alle 17 neuen Tabellen wiederholt – nichts ist durchgekommen.

Auf der Frontend-Seite steht die Umstellung auf „Datenbank zuerst" beim Lesen. Beim **Schreiben** ist sie es nicht: Schlägt ein Speichern fehl, meldet die App trotzdem Erfolg, zeigt den Datensatz an – und beim nächsten Neuladen ist er weg. Das habe ich reproduziert.

| Bereich                       | Ergebnis                    |
| ----------------------------- | --------------------------- |
| 5.1 Schema, Policies, Typen   | ✅ vollständig und korrekt  |
| 5.2 Datenfluss umdrehen       | ⚠️ Lesen ja, Schreiben nein |
| 5.3 Services anbinden         | ✅ umgesetzt                |
| Fehlerbehandlung (5.2.3)      | ❌ nicht umgesetzt          |
| Offline-Warteschlange (5.2.4) | ❌ nicht umgesetzt          |
| Datenmigration (5.2.5)        | ❌ nicht umgesetzt          |

---

## Was ich nachgeprüft und bestätigt habe ✅

| Behauptung                           | Mein Prüfergebnis                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| 17 neue Tabellen mit RLS             | ✅ 17 Tabellen, RLS auf allen, 67 Policies                                       |
| Policies nach `CLAUDE.md`            | ✅ kein `FOR ALL`, 68 × `TO authenticated`, getrennt je Operation                |
| Kindtabellen abgesichert             | ✅ `invoice_items` und `store_order_items` prüfen korrekt über die Elterntabelle |
| 21 Indizes                           | ✅ vorhanden                                                                     |
| `supabase db reset` fehlerfrei       | ✅ alle 5 Migrationen sauber angewendet                                          |
| `supabase db diff` sauber            | ✅ **„No schema changes found"**                                                 |
| Typen generiert und Client typisiert | ✅ 1868 Zeilen, 34 Tabellen, `createClient<Database>`                            |
| Build und Tests grün                 | ✅ `ng build` erfolgreich, 25 Dateien / 121 Tests                                |
| Meine Migrationen unverändert        | ✅ nicht nachträglich angefasst                                                  |

### Angriffstests auf die 17 neuen Tabellen

Mit zwei echten Nutzern gegen die laufende Datenbank:

| Test                                                                                                                  | Ergebnis                                      |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Angemeldeter Nutzer erreicht alle 17 Tabellen (GRANTs)                                                                | ✅ 0 von 17 blockiert                         |
| Nicht angemeldet liest die 17 Tabellen                                                                                | ✅ 0 von 17 offen                             |
| Bob liest Alices `webhook_configs`, `bank_transactions`, `app_notifications`, `tax_advisor_configs`, `store_settings` | ✅ überall leere Menge                        |
| Bob schreibt in Alices Workspace                                                                                      | ✅ `42501 violates row-level security policy` |
| Bob ändert Alices Buchung                                                                                             | ✅ wirkungslos                                |
| Bob löscht Alices Buchung                                                                                             | ✅ wirkungslos                                |
| Kontrolle: Alices Daten intakt                                                                                        | ✅ unverändert                                |

**Die Datenbankarbeit ist solide.** Das ist keine Kleinigkeit – 17 Tabellen mit korrekten Policies sind fehleranfällig, und hier stimmt es.

---

## 🔴 Kritisch 1: Speichern schlägt fehl, die App meldet Erfolg

**Nachgewiesen im laufenden Betrieb.** Ich habe den Schreibzugriff auf `purchases` gezielt scheitern lassen (403) und einen Einkauf angelegt:

|                            |                                           |
| -------------------------- | ----------------------------------------- |
| Rückgabe an die Oberfläche | `error: null` → **die App meldet Erfolg** |
| In der Liste sichtbar      | ✅ ja                                     |
| Im Browser gespeichert     | ✅ ja                                     |
| **In der Datenbank**       | ❌ **nein**                               |

Beim nächsten Neuladen liest die App aus der Datenbank – der Einkauf ist spurlos verschwunden. Der Nutzer hat keinerlei Hinweis bekommen.

Die Ursache in `purchase.service.ts`:

```ts
if (dbError) {
  console.error('Fehler beim Speichern des Einkaufs in Supabase:', dbError);
}
// ... fällt durch:
return { data: newPurchase, error: null }; // meldet Erfolg
```

**Das Muster ist systemisch.** Ich habe die Schreibpfade aller Services ausgezählt:

| Service                       | Schreibzugriffe | davon Fehler nur protokolliert |
| ----------------------------- | --------------- | ------------------------------ |
| `inventory.service.ts`        | 17              | 9                              |
| `purchase.service.ts`         | 16              | 9                              |
| `workspace.service.ts`        | 4               | 4                              |
| `sales.service.ts`            | 5               | 3                              |
| `sources.service.ts`          | 5               | 3                              |
| `suppliers.service.ts`        | 5               | 3                              |
| `workspace-member.service.ts` | 6               | 3                              |
| `return.service.ts`           | 3               | 2                              |
| `tax-advisor.service.ts`      | 1               | 1                              |
| **Summe**                     |                 | **37**                         |

Das ist genau der Punkt, den Plan-Aufgabe **5.2.3** verlangt hat: _„Leere `catch {}` durch echte Fehlerbehandlung ersetzen: Signal `syncError`, sichtbarer Hinweis in der Oberfläche."_ Ein solches Signal existiert nirgends. Für ein Werkzeug, das Einkäufe und Buchhaltung führt, ist ein stillschweigend verlorener Datensatz der schlimmste Ausgang.

---

## 🔴 Kritisch 2: Echte Nutzer bekommen erfundene Daten untergeschoben

`mock-data-store.service.ts`:

```ts
constructor() {
  this.ensureInitialShowcaseData();   // ungeschützt, unabhängig vom Demo-Modus
}

private ensureInitialShowcaseData(): void {
  const purchases = storage.getItem(STORAGE_KEY_PURCHASES);
  const items = storage.getItem(STORAGE_KEY_ITEMS);
  if (!purchases || !items || …length === 0) {
    this.populateShowcaseData();      // schreibt in DIESELBEN Schlüssel wie echte Daten
  }
}
```

`populateShowcaseData()` schreibt unbedingt in `flipbase_local_purchases`, `flipbase_local_inventory`, `flipbase_local_sales`, `flipbase_local_sources` und `flipbase_local_suppliers`.

**Nachgewiesen im laufenden Betrieb:** Ich habe mich als echter Nutzer bei leerer Datenbank angemeldet. Ergebnis im Browser-Speicher:

```
lokaleEinkaeufe: 4   ("Sony PlayStation 5 Digital Edition", "Retro Gaming & Nintendo Konvolut", …)
lokaleArtikel:   9
workspaceIdsLokal: ["ws-1"]        ← der Mock-Workspace
```

Zwei konkrete Folgen:

1. **Die Sicherung aus Phase 2 wird verunreinigt.** Sie erfasst alle `flipbase_`-Schlüssel – also auch diese 4 erfundenen Einkäufe und 9 Artikel. Wer die Sicherung später einspielt, holt sich Fantasiedaten zurück.
2. **`enterDemoMode()` ruft `resetToDemoShowcase()` auf** – das überschreibt den lokalen Bestand **ohne Rückfrage**. Wer als echter Nutzer versehentlich auf „Demo-Modus starten" klickt, verliert seine lokalen Daten.

Der Knopf „Beispieldaten neu laden" im Demo-Banner ist dagegen in Ordnung – dort ist das Zurücksetzen ja gewollt.

---

## 🟠 Schwer 3: Team-Verwaltung ist komplett kaputt

Zur Laufzeit auf jeder Seite:

```
Fehler beim Laden der Workspace-Mitglieder aus Supabase:
PGRST200 – Could not find a relationship between 'workspace_members' and 'profiles'
```

`workspace-member.service.ts:93` fragt `profile:profiles(email, full_name)` ab. Einen Fremdschlüssel von `workspace_members` auf `public.profiles` gibt es aber nicht – die Spalte `user_id` zeigt auf `auth.users`. PostgREST kann die Beziehung deshalb nicht auflösen, und **die Mitgliederliste bleibt dauerhaft leer**.

Das ist ein neu eingebauter Fehler: Der Join wurde ergänzt, ohne den passenden Fremdschlüssel im Schema anzulegen.

**Lösung:** Fremdschlüssel `workspace_members.user_id → public.profiles(id)` ergänzen (zusätzlich zum bestehenden auf `auth.users`). Das war ohnehin schon Audit-Befund 3.3.

---

## 🟠 Schwer 4: Die Mock-Workspace-ID `ws-1` ist immer noch da

Zur Laufzeit, unverändert gegenüber Phase 3:

```
Fehler beim Laden des Inventars aus Supabase: 22P02 – invalid input syntax for type uuid: "ws-1"
Fehler beim Laden der Verkäufe … "ws-1"
Fehler beim Laden der Einkäufe … "ws-1"
```

Ursache in `workspace.service.ts`:

```ts
readonly workspaces = signal<Workspace[]>(this.defaultWorkspaces);        // Mock-Daten
readonly currentWorkspace = signal<Workspace | null>(this.defaultWorkspaces[0]);   // id: 'ws-1'
```

Die Signale starten mit dem Mock-Workspace. Alle abhängigen Effects feuern sofort und fragen die Datenbank mit einer ungültigen UUID ab. Weil ein fehlgeschlagenes Laden jetzt `items.set([])` setzt, blitzt beim Seitenaufruf kurz ein leerer Bestand auf, bevor die echten Daten kommen.

Das Auflösen dieser Doppelung war der ausdrückliche Kern von Plan-Aufgabe 5.2. Es ist nicht passiert.

---

## 🟡 Mittel 5: Sicherheitsentscheidung aus Phase 3 zurückgedreht

`src/environments/environment.ts`:

```diff
-  allowDemoMode: false,
+  allowDemoMode: true,
```

Das ist die **Produktionsumgebung**. Der Demo-Modus wurde in Phase 3 dort bewusst abgeschaltet, weil die Anwendung in 2–3 Wochen ins Netz gehen soll und dann niemand ohne Konto hineinkommen darf.

Die Auswirkung ist begrenzt – der Demo-Modus zeigt nur lokale Browser-Daten, keine Serverdaten. Aber die Entscheidung war getroffen, und für die Entwicklung reicht `environment.development.ts`, wo der Schalter ohnehin auf `true` steht.

---

## 🟡 Mittel 6: `any` hat sich um 54 % vermehrt

| Zeitpunkt            | `any`-Vorkommen |
| -------------------- | --------------- |
| Audit (Ausgangslage) | 65              |
| **nach Phase 5**     | **100**         |

Die Typgenerierung wurde also gemacht – und dann durch Typumgehungen wieder ausgehebelt. Beispiel aus `inventory.service.ts`:

```ts
const enriched = (data as unknown[]).map((item: any) => this.enrichItemTotals(item));
```

Damit bringt der typisierte Client an dieser Stelle nichts. Deine `CLAUDE.md` verlangt ausdrücklich: _„`any` vermeiden; `unknown` verwenden, wenn der Typ unsicher ist."_

Spitzenreiter: `purchase.service.ts` (12), `inventory.service.ts` (11), `invoice.service.ts` (7), `store.service.ts` (6).

---

## 🟡 Mittel 7: Kein einziger neuer Test

|              | vorher | nachher |
| ------------ | ------ | ------- |
| Test-Dateien | 25     | 25      |
| Tests        | 121    | 121     |

17 neue Tabellen, 10 neu angebundene Services, die komplette Datenschicht umgebaut – und die Testabdeckung ist unverändert. Dass die Tests grün sind, sagt hier wenig: Sie decken den neuen Code gar nicht ab. Die beiden kritischen Fehler oben wären durch je einen Test aufgefallen.

---

## 🟢 Gering 8: Verbliebene Kleinigkeiten

- **110 leere `catch`-Blöcke** im Projekt. Die Behauptung „leere Catches wurden entfernt" trifft für die Kern-Lesepfade zu, für den Rest nicht.
- **`withTimeout` lebt weiter** in `media.service.ts` (1200 ms) – der Rest ist korrekt entfernt.
- **`try { effect(…) } catch {}` in 18 Services.** Das war als Schutz für die Testumgebung gedacht, ist dort aber nicht mehr nötig: Die Specs richten jetzt korrekt einen `runInInjectionContext` ein. Übrig bleibt ein Konstrukt, das echte Fehler beim Aufbau der Effects verschluckt.
- **Fehlermeldung nennt die falsche Passwortlänge.** `mapAuthErrorToGerman()` sagt „mindestens 6 Zeichen", die Datenbank verlangt seit Phase 3 aber 10.

### Ausdrücklich gut

Die deutschen Fehlermeldungen in `mapAuthErrorToGerman()` sind eine echte Verbesserung – vorher stand dort das englische `Invalid login credentials` von Supabase. Auch die Erweiterung der Registrierung und der Knopf „Beispieldaten neu laden" im Demo-Banner sind sinnvoll.

---

## Zahlen auf einen Blick

| Kategorie   | Anzahl |
| ----------- | ------ |
| 🔴 Kritisch | 2      |
| 🟠 Schwer   | 2      |
| 🟡 Mittel   | 3      |
| 🟢 Gering   | 4      |
| **Summe**   | **11** |

---

## Empfohlene Nacharbeit (Phase 5b)

| #   | Aufgabe                                                                                                                                           | Aufwand   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Schreibpfade ehrlich machen: DB-Fehler an die Oberfläche durchreichen, `syncError`-Signal, sichtbarer Hinweis (37 Stellen)                        | 0,5–1 Tag |
| 2   | `ensureInitialShowcaseData()` auf den Demo-Modus beschränken; `resetToDemoShowcase()` aus `enterDemoMode()` entfernen oder mit Rückfrage versehen | 1 Std     |
| 3   | Fremdschlüssel `workspace_members.user_id → profiles(id)` ergänzen, Team-Verwaltung reparieren                                                    | 1 Std     |
| 4   | `ws-1` auflösen: Workspace-Signale leer starten lassen, Effects erst bei echtem Workspace feuern                                                  | 2 Std     |
| 5   | `allowDemoMode` in der Produktionsumgebung zurück auf `false`                                                                                     | 1 Min     |
| 6   | Die 35 neuen `any` durch die generierten Typen ersetzen                                                                                           | 2 Std     |
| 7   | Tests für die neuen Datenpfade – mindestens für die beiden kritischen Fälle                                                                       | 0,5 Tag   |
| 8   | Kleinigkeiten aus Punkt 8                                                                                                                         | 1 Std     |

**Gesamt: rund 2 Tage.** Erst danach ist Phase 5 aus meiner Sicht abgeschlossen.

> **Reihenfolge:** Punkte 2, 3, 5 und die Passwort-Meldung sind schnell erledigt und beseitigen sofortige Risiken. Punkt 1 ist die eigentliche Arbeit und sollte vor dem Web-Start stehen – ein Werkzeug, das stillschweigend Buchungen verliert, darf nicht produktiv gehen.

---

_Erstellt von Claude Opus 5 (Anthropic) am 2026-08-19. Alle Befunde sind am Quellcode belegt; die kritischen Punkte wurden zusätzlich im laufenden Betrieb gegen die echte Datenbank reproduziert._

---

## ✅ Nacharbeit Phase 5b – erledigt am 2026-08-19

| #   | Befund                                       | Ergebnis                                                                                                                        |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🔴 Speichern schlägt fehl, App meldet Erfolg | ✅ behoben – 78 Fehlerstellen umgebaut, neuer `SyncStatusService`, sichtbarer Fehlerstreifen, Rücknahme der vorläufigen Anzeige |
| 2   | 🔴 Erfundene Daten für echte Nutzer          | ✅ behoben – Beispieldaten nur noch im Demo-Modus, `enterDemoMode()` überschreibt nichts mehr                                   |
| 3   | 🟠 Team-Verwaltung kaputt                    | ✅ behoben – Fremdschlüssel `workspace_members → profiles` ergänzt                                                              |
| 4   | 🟠 Mock-Kennung `ws-1`                       | ✅ behoben – Workspace-Signale starten leer                                                                                     |
| 5   | 🟡 `allowDemoMode` in Produktion             | ✅ zurück auf `false`                                                                                                           |
| 6   | 🟡 `any` von 65 auf 100                      | ✅ auf **60** gesenkt – unter dem Ausgangswert                                                                                  |
| 7   | 🟡 Keine neuen Tests                         | ✅ 144 statt 121 Tests, 27 statt 25 Dateien                                                                                     |
| 8   | 🟢 `withTimeout`, Passwortlänge              | ✅ erledigt                                                                                                                     |
| —   | 🟢 `try { effect() } catch {}`               | ⏸️ bleibt vorerst – ohne die Testumgebung aus Phase 8 schlagen sonst 39 Tests fehl. Jetzt mit Begründung im Code vermerkt.      |

**Zusätzlich gefunden und behoben:** Bei jedem erfolgreichen Anlegen blieb der vorläufige Eintrag mit seiner Behelfs-Kennung im lokalen Spiegel liegen – jeder Einkauf, Artikel, jede Quelle und jeder Lieferant tauchte dadurch doppelt auf, auch in den Sicherungen. Betroffen waren `purchase`, `inventory`, `sources` und `suppliers`.

**Verifiziert:** `ng build` erfolgreich · 27 Dateien / 144 Tests grün · `supabase db diff` ohne Unterschiede · fehlgeschlagenes Speichern im Browser reproduziert und jetzt korrekt gemeldet · alle Seiten laden mit echter Workspace-UUID und 200 OK.
