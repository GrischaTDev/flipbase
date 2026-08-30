# SDD ledger — plan: docs/superpowers/plans/2026-08-30-teststrategie-und-ci-beschleunigung.md

## Preflight

| Bezug | Produziert / konsumiert | Befund |
| --- | --- | --- |
| Task 1 intern | Audit, Split-Konfiguration und manueller Benchmark | Konsistent; der Split ist erst nach Task 2 ausfuehrbar. |
| Task 2 intern | Benennt 20 Angular- und 13 DOM-Dateien um | Konsistent; die exakte Testzahl 1.039 bleibt das Gate. |
| Task 3 intern | Waehlt Angular-Builder oder Fallback und setzt stabile Skripte | Lokaler Vergleich ist moeglich, die vorgeschriebene kalte CI-Messung benoetigt einen Push. |
| Task 4 intern | Konsolidiert schwere Spec-Dateien | Konsistent, sofern Szenario- und Testfallzahl vor jeder Gruppe erfasst werden. |
| Task 5 intern | Ersetzt vier tautologische Steuerpruefungen | Konsistent; TDD-Mutationsnachweis ist zwingend. |
| Task 6 intern | Parallelisiert Quality, Unit, Image und Deploy-Gates | Workflow kann lokal validiert werden; echte Gate-Wirkung benoetigt einen PR-Lauf. |
| Task 7 intern | Repariert pgTAP-Struktur und fuegt Datenbank-Gate hinzu | Konsistent; lokale DB nur transaktional, keine Produktion. |
| Task 8 intern | Fuegt vier Dateien mit fuenf Browser-Smoke-Szenarien hinzu | Konsistent; alter A11y-Quelltexttest erst nach gruenem Browserersatz entfernen. |
| Task 9 intern | Coverage-Boden und Nightly-Suite | Konsistent; Coverage-Schwellen werden gegen den gemessenen Stand rot/gruen validiert. |
| Task 10 intern | Rollout-Abnahme | Externe PR-, GitHub- und Produktionslaeufe sind nicht allein im Worktree ausfuehrbar. |
| Task 1 → Task 2 | Split-Konfiguration konsumiert Dateikategorien | Kein Konflikt; Ausfuehrung des Splits folgt nach der Umbenennung. |
| Task 2 → Task 3 | Kategorien werden von beiden Runnern konsumiert | Kein Konflikt. |
| Task 3 → Task 4 | Finaler Runner misst Konsolidierung | Kein Konflikt; Task 4 darf die fachliche Fallzahl nicht reduzieren. |
| Task 3 → Task 6 | Oeffentliche Testskripte steuern CI-Matrix | Kein Konflikt. |
| Task 5 → Task 9 | Echte Steuerpruefungen tragen Coverage | Kein Konflikt. |
| Task 6 → Task 7 | `ci.yml` erhaelt Datenbank-Gate | Sequentielle Erweiterung erforderlich. |
| Task 7 → Task 8 | `ci.yml` erhaelt Browser-Gate | Sequentielle Erweiterung erforderlich. |
| Task 3/7/8 → Task 9 | Runner, DB und Browser werden im Nightly konsumiert | Kein Konflikt. |
| Task 6/7/8/9 → Task 10 | Fertige Gates werden extern abgenommen | Lokale Umsetzung endet vor Push/PR/Deployment, falls keine ausdrueckliche Freigabe vorliegt. |

Ruling: Externe `workflow_dispatch`-, PR-, Push- und Produktionsschritte werden bis zur ausdruecklichen Freigabe nicht ausgefuehrt; lokal werden Struktur, Syntax und Verhalten vollstaendig vorbereitet — Grund ist die externe Nebenwirkung — Kosten bei falscher Entscheidung: CI-Median und p95 bleiben bis zur Freigabe vorlaeufig.

Ruling: Der Angular-Runner wird lokal nur vorlaeufig gewaehlt und der Benchmark-Workflow bleibt erhalten, bis drei kalte CI-Laeufe die Entscheidung bestaetigen — Grund ist die bindende Messregel der Spec — Kosten bei falscher Entscheidung: eine temporaere Workflow-Datei bleibt laenger im Branch.

Ruling: Task 10 wird bis zu den externen Schritten umgesetzt und dokumentiert dann `No-Go/pending external evidence`, statt Messwerte zu erfinden — Grund ist die Nachweispflicht — Kosten bei falscher Entscheidung: Abschlussbericht ist vor dem PR bewusst vorlaeufig.

Baseline: Commit 2d0e0d7; `npm test` gruen mit 131 Dateien und 1.039 Tests; 41,93 s Vitest-Dauer. Bekannte `localStorage`-Warnungen sind Gegenstand von Task 3.

Task 1: complete (commits 2d0e0d7..c29df1b, review clean)

Task 2 Ruling: 39 breite Regex-Treffer werden nicht blind zu DOM-Dateien; Ziel bleibt 20 Angular + 13 nachweislich zur Laufzeit DOM-abhaengige Dateien + 98 Node-Dateien. Typ-, Fixture- und Quelltextnennungen werden durch gezielte Node-Ausfuehrung beurteilt und im Audit ohne Freifahrtschein fuer echte Runtime-Zugriffe behandelt — Grund ist die bindende Spec-Planungsbasis und der bereits gemessene 33er-Browsersplit — Kosten bei falscher Entscheidung: eine uebersehene Runtime-Abhaengigkeit wuerde den Node-Split rot machen und muss vor Abschluss korrigiert werden.

Task 2: minor (deferred): Die sechs Node-Ausnahmen im Audit sind dateibasiert; eine kuenftige neue Browser-API in derselben Datei koennte unbemerkt bleiben. Finalreview soll marker-/stellenbasierte Verengung pruefen.

Task 2: complete (commits c29df1b..78472d6, review clean; 1 deferred minor)

Task 3 Ruling: Der Vitest-Fallback ist lokal vorlaeufig gewaehlt (20 Dateien/148 Tests; Median 13,321 s statt 19,042 s beim Angular-Builder). Der Benchmark-Workflow und der offizielle Builder bleiben bis zur kalten CI-Messung erhalten. Der lokale Gesamtlauf lag vor Task 4 bei Median 22,025 s und verfehlt das 20-s-Ziel noch.

Task 3: complete (commits 78472d6..1ed0cf9, review approved after Windows process-cleanup hardening; 131 files/1.039 tests green)

Task 4 Ruling: Reine Spec-Konsolidierung reduziert 131 auf 117 Dateien, behaelt exakt 1.039 Laufzeitfaelle, 960 statische Testdefinitionen und 2.308 `expect`-Aufrufe. Der lokale Median sank von 22,025 s auf 19,825 s; CI-Bestaetigung bleibt ausstehend.

Task 4: complete (commits 1ed0cf9..e2d0682, review approved; audit exceptions marker/line scoped)

Task 5: complete (commits e2d0682..70d86d1, review clean; 4 tautologies replaced by 4 mutation-proven production behavior tests)

Task 6 Ruling: Externe PR-Gate-Negativ-/Positivlaeufe bleiben ausstehend. Lokal prueft ein strukturierter Workflow-Vertrag die exakten sicherheitskritischen Expressions; Image bleibt push-only, SHA-only und parallel, Deploy braucht quality + test-gate + image success.

Task 6: complete (commits 70d86d1..efd6101, review approved; local shards 90/717 + 9/92 + 18/230)

Task 7 Ruling: Offizielle Supabase-Dokumentation bestaetigt lokale rekursive pgTAP-Entdeckung und transaktionale Ruecknahme. SQL-/Gate-Struktur ist statisch freigegeben; die dynamische Abnahme bleibt ausstehend, weil Docker Desktop 4.88.0 am gesperrten Runtime-Socket `sailor-ingest.sock` abstuerzt. Keine Produktions-/Linked-DB als Ersatz verwenden.

Task 7: complete statically (commits efd6101..ea86e9f, review approved with dynamic Docker/DB acceptance pending; 6 files/214 assertions)

Task 8 Ruling: Der lokale Demo-Modus muss die in der Oberfläche zugesagte gemeinsame Inventaransicht tatsächlich mit Mengenposition und Einzelstück zeigen. Der rote Browserlauf belegte zusätzlich einen Widerspruch zwischen sichtbarer Verkaufsschaltfläche und abgewiesenem Abschluss. Deshalb wurden eine fachlich vollständige Demo-Mengenposition und ein expliziter `no_active_sale`-Zustand nur für den verkaufbaren SNES-Demoartikel ergänzt. Die allgemeine Fail-closed-Regel für fehlende Verkaufszustände bleibt durch den bestehenden Unit-Vertrag erhalten — Grund ist der echte Nutzervertrag statt bloßer Fixture-Kosmetik — Kosten bei falscher Entscheidung: Der Demo-Smoke würde entweder einen nicht vorhandenen Mengenweg prüfen oder einen von der UI angebotenen Verkauf weiterhin nicht abschließen können.

Task 8: complete locally (Task-Commit `test(e2e): cover critical inventory and sales journeys`; 5 Chromium-Szenarien zweimal grün in 8,9 s und 9,0 s; Workflow-Vertrag 24/24; Gesamtlauf 116 Dateien/1.038 Tests nach beabsichtigtem 1:1-A11y-Ersatz; externe GitHub-Ausführung ausstehend)

Task 8 Fixrunde 1 Ruling: Der Chart-Pixelvergleich wird durch einen sichtbaren externen DOM-Tooltip mit Live-Status und exakten Fachwerten ersetzt. Dabei belegte der Browser einen echten Demo-Produktfehler: Dem eBay-Verkauf fehlte die Inventar-/COGS-Relation, weshalb 332,61 € statt 95,62 € Gewinn sichtbar waren. Die Relation und konsistenten Spiegelwerte wurden minimal im Demo-Seed korrigiert; die allgemeine Gewinnformel blieb unverändert. Der Mengenposten gehört nun zu einem eigenen vollständigen Fünfer-Konvoluteinkauf statt zum Canon-Einzelkauf. Verkaufsanzahl/-preis und Registrierungsrollen wurden mit echten roten Mutanten belegt; Browser-Parallelität und Checkout-/Setup-Node-SHA-Pins mit Negativfixtures abgesichert.

Task 8 Fixrunde 1: complete locally (separater Commit `fix(test): harden browser smoke contracts`; Verkaufsmutanten 2 statt 1 sowie 36,00 € statt 35,00 € rot; alter `preventDefault`-Scheinlink rot; 5 Chromium-Szenarien zweimal grün in 10,0 s und 9,9 s; Workflow-Vertrag 27/27; Gesamtlauf 116 Dateien/1.041 Tests; Build 6,772 s; externe GitHub-Ausführung weiterhin ausstehend)
