# Prüfung der Terra-Umsetzung: Pakete 1–4

Stand: 19.09.2026. Geprüfte Grundlage: `52abbd9b`, Änderungen seit `faf3dc37`.
Umfang: PRs [126](https://github.com/GrischaTDev/flipbase/pull/126),
[127](https://github.com/GrischaTDev/flipbase/pull/127),
[128](https://github.com/GrischaTDev/flipbase/pull/128) und
[129](https://github.com/GrischaTDev/flipbase/pull/129).

## Einschätzung

Die Umsetzung ist brauchbar und muss nicht verworfen werden. Paket 1 repariert
den tatsächlichen PostgREST-Konfliktschlüssel und das erneute Speichern bereits
angelegter Regeln. Paket 3 ergänzt Archivschutz, Export und Änderungsprotokoll
zusammenhängend. Paket 4 verwendet denselben Filter für Tabelle und Summen und
lässt den Zahlungsdatumsbezug des Dashboard-Cashflows bestehen.

Paket 2 war noch nicht vollständig abgenommen: Drei konkrete Probleme bestanden
bei schnellen Workspace-Wechseln und größeren Datenmengen. Paket 4 hatte zusätzlich
eine zeitabhängige Testlücke. Alle vier Befunde wurden zuerst reproduziert und im
Nachtrag `codex/terra-quality-review` gezielt behoben. Ein vollständiger Neuaufbau
war nicht erforderlich.

Die vier Pakete sind keine allgemeine Vergleichsmessung der Modelle. Eine
Zuverlässigkeitsquote oder Überlegenheit von Sol lässt sich daraus nicht ableiten.

## R1 · P2 · A → B → A kann dauerhaft leer angezeigt werden

**Status: behoben.**

**Stelle:** `src/app/core/services/expense.service.ts:58–59`, Reset ab Zeile 298.

Läuft die erste Datenabfrage für A noch, wird sie beim Wechsel nach B durch die
Anfragesequenz ungültig. Beim Wechsel zurück nach A findet
`ensureCurrentWorkspaceLoaded()` trotzdem deren Promise in `syncPromises`:
Der Schlüssel enthält nur Workspace-ID und Datum. Die neue Initialisierung
wartet auf die ungültige alte Anfrage. Deren Antwort wird verworfen; eine frische
A-Abfrage fehlt. Tabelle und Cashflow können leer beziehungsweise zu niedrig
bleiben, bis erneut geladen wird.

**Nachweis:** Zusätzlicher Test mit verzögerter A-Antwort, vollständig geladenem B
und Rückkehr nach A: erwartet `['workspace-a']`, tatsächlich `[]`. Die zehn
vorhandenen ExpenseService-Tests bestehen daneben. Der Test verwendet öffentliche
Service-Methoden und dieselbe Testumgebung wie die vorhandenen Service-Tests.

**Lösung:** Beim Kontextwechsel wird die Liste der teilbaren laufenden Vorgänge
geleert. Ein Rückwechsel startet deshalb eine frische Abfrage; die bestehende
Anfragesequenz verhindert weiterhin, dass alte Antworten aktuellen Zustand setzen.
Der zuvor rote A→B→A-Test ist als dauerhafte Regression übernommen.

## R2 · P2 · Ausgaben werden über Seitengrenzen nicht eindeutig sortiert

**Status: behoben.**

**Stelle:** `src/app/core/services/expense.service.ts:218–219`.

Die neue Abfrage lädt Seiten mit 1.000 Einträgen, sortiert aber nur nach
`expense_date`. Gleich datierte Ausgaben haben keine eindeutige Reihenfolge.
Unterschiedliche LIMIT/OFFSET-Abfragen können daher dieselbe ID in zwei Seiten
liefern und andere IDs auslassen. Die nachträgliche Sortierung im Client behebt
die fehlenden oder doppelten Datensätze nicht; Summen können falsch sein.

**Nachweis:** In der lokalen PostgreSQL-Datenbank eine temporäre Tabelle mit
5.000 Einträgen desselben Datums angelegt. Dieselbe Sortierung und die Bereiche
0–999 bzw. 1000–1999 liefern jeweils 1.000 Zeilen, darunter eine gemeinsame ID.
Alles wurde in einer Transaktion zurückgerollt. Der vorhandene 1001-Test gibt
bereits korrekt sortierte Array-Ausschnitte zurück und kann dies nicht erkennen.

**Lösung:** Die Serverabfrage sortiert nun absteigend nach `expense_date` und als
eindeutigen zweiten Schlüssel nach `id`. Ein Test schützt diesen Abfragevertrag.

```sql
begin;
create temporary table review_expense_order as
select g as id, date '2026-09-19' as expense_date
from generate_series(1,5000) as g;
with first_page as (
  select id from review_expense_order order by expense_date desc limit 1000 offset 0
), second_page as (
  select id from review_expense_order order by expense_date desc limit 1000 offset 1000
)
select count(*) as duplicate_ids from first_page join second_page using (id);
rollback;
```

## R3 · P2 · Die Belegabfrage skaliert nicht mit der Ausgabenliste

**Status: behoben.**

**Stelle:** `src/app/core/services/expense-document.service.ts:69–73`, aufgerufen
mit allen geladenen IDs durch `ExpensesComponent.loadDocumentSummary()`.

Nach dem Laden aller Ausgaben werden sämtliche IDs in einen einzigen GET-Filter
`in('expense_id', uniqueIds)` geschrieben. Bei 1.001 UUIDs entsteht eine URL von
etwa 39 KB. Der lokale API-Gateway weist sie mit HTTP 414 zurück. Der Fehlerpfad
entfernt die Belegzähler, sodass vorhandene Belege als fehlend erscheinen können.
Zusätzlich fehlt eine Seitennavigation für die Antwort; `max_rows = 1000` begrenzt
auch die Belegzeilen, selbst wenn die Anzahl der angefragten Ausgaben klein ist.

**Nachweis:** Eine GET-Anfrage mit 1.001 synthetischen UUIDs an die lokale API
ergab `414 / URI too long`; die kurze Kontrollanfrage erreichte mit `401` die
Authentifizierung. Dafür wurden keine Zugangsdaten oder Geschäftsdaten benötigt.

Die einzelne IN-Abfrage bestand bereits vor Terra. Die versprochene Unterstützung
großer Ausgabenlisten in Paket 2 wurde aber nicht bis zu diesem Folgeschritt
durchgeprüft; dies ist eine verbliebene Integrationslücke.

**Lösung:** Der Dienst teilt Ausgaben-IDs in Pakete zu höchstens 100 Einträgen
und lädt für jedes Paket alle Antwortseiten mit eindeutiger Sortierung. Tests
decken 1.001 Ausgaben sowie mehr als 1.000 Belegzeilen innerhalb eines Pakets ab.

## R4 · P2 · Vier Komponententests hängen am September 2026

**Status: behoben.**

**Stelle:** `src/app/features/expenses/expenses.component.angular.spec.ts`,
Fixture ab Zeile 229 und Tests ab Zeilen 323, 451, 460, 494 auf dem geprüften Stand.

Die Testdaten liegen fest im September. Seit Paket 4 verwendet die Komponente
standardmäßig den echten aktuellen Monat. Nicht alle betroffenen Tests setzen
eine feste Uhrzeit. Ab Oktober passen ihre Erwartungen zu Beträgen, Zeilen und
Aktionen nicht mehr zum Monatsfilter, obwohl sich der Produktivcode nicht ändert.

**Nachweis:** Alle 16 Seitentests bestehen am Prüfdatum. Bei simulierter Uhrzeit
`2026-10-01T12:00:00+02:00` scheitern vier: Summen/Tabelle, Statusfilter,
Anbietersuche und Icon-Aktionen. Die Anzeige enthält dann korrekt Oktober und
0,00 EUR, während die Tests Septemberdaten erwarten.

**Lösung:** Die Seitensuite verwendet jetzt für jeden Test eine kontrollierte
Uhrzeit und stellt echte Timer danach wieder her. Abweichende Monats- und
Jahresfälle setzen ihren Zeitpunkt weiterhin ausdrücklich.

## Ausgeführte Prüfungen und Grenzen

- GitHub: Alle vier PRs hatten erfolgreiche Pflichtprüfungen. Der Workflow
  `35454114015` auf Merge-Commit `52abbd9b` ist ebenfalls erfolgreich.
- Nach der Korrektur bestanden die fokussierten Gruppen mit 32 Service-DOM-,
  44 Node- und 26 Angular-Tests. Darunter Ausgaben, Kategorien, Regeln, Belege,
  Export, Fälligkeiten, Dashboard und alle Ausgabendialoge.
- Erneut lokal: 157 Datenbanktests aus `expenses.test.sql`,
  `workspace_retention.sql` und `audit_snapshot.sql` bestanden.
- Die vier neuen Regressionen wurden vor der Korrektur rot und danach grün
  ausgeführt; vier vorhandene Seitentests wurden mit Oktober-Uhrzeit rot
  ausgeführt und anschließend durch die kontrollierte Suite-Zeit stabilisiert.
- `npm run verify` bestand nach der Korrektur vollständig: Format, Lint, Typen,
  72 Workflow-Tests, Test-Audit, 1.449 Node-, 305 DOM-, 926 Angular- und 13
  Landing-Tests sowie der Produktionsbau. Der Bau meldete nur die drei bereits
  bekannten NG8113-Hinweise zu `LucideDynamicIcon`.
- Keine neue visuelle Browserabnahme und kein erneuter Test gegen die
  Produktionsdatenbank. Die vorhandenen grünen Browserprüfungen sind CI-Nachweise,
  keine hier neu durchgespielte vollständige Bedienabnahme.
- Die alte, bereits dokumentierte Abweichung zwischen deklarativem Schema und
  älteren Migrationen ist weiterhin ein eigener Aufräumpunkt.

Die Diagnose und Korrekturen liegen im separaten Worktree auf
`codex/terra-quality-review`. Die Regressionen sind dauerhaft aktiv. Schema und
Migrationen wurden nicht geändert.

## Empfehlung für die Fortsetzung

1. Den geprüften Nachtrag nach erfolgreichen Gesamtprüfungen über einen eigenen
   PR integrieren.
2. Terra weiter für klar begrenzte Implementierungen und Tests einsetzen. Aus
   diesem Review folgt kein Anlass, alle bisherigen Änderungen neu zu schreiben.
3. Workspace-Nebenläufigkeit, Berechtigungen, Migrationen und finanzielle
   Berechnungen vor dem Merge unabhängig gegenlesen lassen, etwa mit dem hier
   verwendeten stärkeren Modell. Sol ist eine mögliche Zwischenstufe; ein
   pauschaler Wechsel wäre durch diese vier Pakete nicht begründet.
4. Jede Abnahmebedingung einzeln mit einem Nachweis abhaken. A→B→A und stabile
   Seitensortierung standen bereits ausdrücklich im Reparaturplan. Die hohe
   Gesamtzahl grüner Tests hat diese fehlenden Nachweise verdeckt.
5. Produktionscode nicht an eine unvollständige Testumgebung anpassen:
   Die neuen pauschalen `try/catch`-Blöcke um `effect()` sollten perspektivisch
   durch Tests mit echtem Angular-Kontext entbehrlich werden. Sie können echte
   Initialisierungsfehler still unterdrücken.

„Sehr hoch“ ist kein Ersatz für diese gezielten Prüfungen. Eine niedrigere
Denkstufe ist durch dieses Review nicht evaluiert; die Modellentscheidung sollte
an Aufgabe und Reviewbedarf hängen, nicht nur an der Anzahl bestandener Tests.
