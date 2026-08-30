# SDD ledger — plan: docs/superpowers/plans/2026-08-30-teststrategie-und-ci-beschleunigung.md

## Preflight

| Bezug                  | Produziert / konsumiert                                        | Befund                                                                                       |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Task 1 intern          | Audit, Split-Konfiguration und manueller Benchmark             | Konsistent; der Split ist erst nach Task 2 ausfuehrbar.                                      |
| Task 2 intern          | Benennt 20 Angular- und 13 DOM-Dateien um                      | Konsistent; die exakte Testzahl 1.039 bleibt das Gate.                                       |
| Task 3 intern          | Waehlt Angular-Builder oder Fallback und setzt stabile Skripte | Lokaler Vergleich ist moeglich, die vorgeschriebene kalte CI-Messung benoetigt einen Push.   |
| Task 4 intern          | Konsolidiert schwere Spec-Dateien                              | Konsistent, sofern Szenario- und Testfallzahl vor jeder Gruppe erfasst werden.               |
| Task 5 intern          | Ersetzt vier tautologische Steuerpruefungen                    | Konsistent; TDD-Mutationsnachweis ist zwingend.                                              |
| Task 6 intern          | Parallelisiert Quality, Unit, Image und Deploy-Gates           | Workflow kann lokal validiert werden; echte Gate-Wirkung benoetigt einen PR-Lauf.            |
| Task 7 intern          | Repariert pgTAP-Struktur und fuegt Datenbank-Gate hinzu        | Konsistent; lokale DB nur transaktional, keine Produktion.                                   |
| Task 8 intern          | Fuegt vier Dateien mit fuenf Browser-Smoke-Szenarien hinzu     | Konsistent; alter A11y-Quelltexttest erst nach gruenem Browserersatz entfernen.              |
| Task 9 intern          | Coverage-Boden und Nightly-Suite                               | Konsistent; Coverage-Schwellen werden gegen den gemessenen Stand rot/gruen validiert.        |
| Task 10 intern         | Rollout-Abnahme                                                | Externe PR-, GitHub- und Produktionslaeufe sind nicht allein im Worktree ausfuehrbar.        |
| Task 1 → Task 2        | Split-Konfiguration konsumiert Dateikategorien                 | Kein Konflikt; Ausfuehrung des Splits folgt nach der Umbenennung.                            |
| Task 2 → Task 3        | Kategorien werden von beiden Runnern konsumiert                | Kein Konflikt.                                                                               |
| Task 3 → Task 4        | Finaler Runner misst Konsolidierung                            | Kein Konflikt; Task 4 darf die fachliche Fallzahl nicht reduzieren.                          |
| Task 3 → Task 6        | Oeffentliche Testskripte steuern CI-Matrix                     | Kein Konflikt.                                                                               |
| Task 5 → Task 9        | Echte Steuerpruefungen tragen Coverage                         | Kein Konflikt.                                                                               |
| Task 6 → Task 7        | `ci.yml` erhaelt Datenbank-Gate                                | Sequentielle Erweiterung erforderlich.                                                       |
| Task 7 → Task 8        | `ci.yml` erhaelt Browser-Gate                                  | Sequentielle Erweiterung erforderlich.                                                       |
| Task 3/7/8 → Task 9    | Runner, DB und Browser werden im Nightly konsumiert            | Kein Konflikt.                                                                               |
| Task 6/7/8/9 → Task 10 | Fertige Gates werden extern abgenommen                         | Lokale Umsetzung endet vor Push/PR/Deployment, falls keine ausdrueckliche Freigabe vorliegt. |

Ruling: Externe `workflow_dispatch`-, PR-, Push- und Produktionsschritte werden bis zur ausdruecklichen Freigabe nicht ausgefuehrt; lokal werden Struktur, Syntax und Verhalten vollstaendig vorbereitet — Grund ist die externe Nebenwirkung — Kosten bei falscher Entscheidung: CI-Median und p95 bleiben bis zur Freigabe vorlaeufig.

Ruling: Der Angular-Runner wird lokal nur vorlaeufig gewaehlt und der Benchmark-Workflow bleibt erhalten, bis drei kalte CI-Laeufe die Entscheidung bestaetigen — Grund ist die bindende Messregel der Spec — Kosten bei falscher Entscheidung: eine temporaere Workflow-Datei bleibt laenger im Branch.

Ruling: Task 10 wird bis zu den externen Schritten umgesetzt und dokumentiert dann `No-Go/pending external evidence`, statt Messwerte zu erfinden — Grund ist die Nachweispflicht — Kosten bei falscher Entscheidung: Abschlussbericht ist vor dem PR bewusst vorlaeufig.

Baseline aus Task 1: Commit 2d0e0d7; `npm run test:current` gruen mit 131 Dateien und 1.039 Tests; belegte Vitest-Dauer 26,37 s (`task-1-report.md`), keine Wall-Clock-Messung. Bekannte `localStorage`-Warnungen sind Gegenstand von Task 3.

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

Task 8 Fixrunde 2 Ruling: Der Dashboard-Smoke darf nicht vom realen Kalendermonat abhängen. Playwright setzt die Browserzeit vor der ersten Navigation mit `page.clock.setFixedTime()` auf den 30.08.2026 mittags und den Kontext explizit auf `Europe/Berlin`. Der Test sucht den 14.08.-Tooltip durch eine begrenzte Folge echter Mausbewegungen anhand des sichtbaren Live-Status statt über eine einzelne Canvas-Prozentposition; Canvas-Pixel und Chart.js-Interna bleiben unberührt.

Task 8 Fixrunde 2: complete locally (separater Commit `fix(test): freeze dashboard smoke test time`; September-Mutation am 01.09.2026 erwartungsgemäß rot wegen fehlendem August-Verkauf; gezielter August-Fall 1/1 grün; 5 Chromium-Szenarien zweimal grün in 10,3 s und 10,1 s; Format, Lint, Typprüfung und Diff-Check grün; externe GitHub-Ausführung weiterhin ausstehend)

Task 9 Ruling: Die fachliche Kostenverteilung liegt vollständig in `ProfitEngineService.allocateCosts`; es wird keine Scheindatei für eine künstliche Dateischwelle erzeugt. Der breite Models-Ausschluss wird auf konkrete reine Typdateien verengt, sodass alle ausführbaren Modelldateien gemessen werden. Nightly-Pipelines mit `tee` verwenden explizit `shell: bash` und werden durch eine Pipefail-Negativfixture abgesichert. Docker bleibt nach einem begrenzten read-only `docker info` wegen der fehlenden `dockerDesktopLinuxEngine`-Pipe blockiert; DB-Ergebnisse werden nicht ersetzt oder erfunden — Grund sind fachlich echte Coverage- und Fail-closed-Verträge ohne Produktions-/Docker-Risiko — Kosten bei falscher Entscheidung: Die dynamische DB-Abnahme und echte GitHub-Matrix bleiben bis zu einer funktionsfähigen ephemeren Umgebung offen.

Task 9: complete locally (globale Coverage 56,59/49,95/56,02/57,99; Profit 100/96,07, Tax 99,17/93,81, Sellability 100/100 Statements/Branches; 20 Seeds mit je 747 Node-Tests grün in 163,469 s; Workflow-Vertrag 39/39; Chromium 5/5 in 10,818 s; Docker/DB sowie externe GitHub-, Firefox- und WebKit-Ausführung ausstehend)

Task 9 Fixrunde 1 Ruling: Der Nightly-Vertrag darf erwartete Schritte nicht nur namentlich auffinden, sondern muss jeden Job vollständig und positionsgebunden erlauben. Exakte Schrittzahlen und vollständige Schrittobjekte schließen zusätzliche Befehle, Uploads, Felder und Remote-Zugriffe fail-closed aus. Datenbankbefehle erhalten zusätzlich eine ausdrückliche lokale Allowlist und Remote-/Produktionsverbote; Browserinstallation und -lauf bleiben exakt an `${{ matrix.browser }}` gebunden — Grund ist, dass acht echte Zusatzangriffe den vorherigen Namensvertrag umgingen — Kosten bei falscher Entscheidung: Eine zukünftige beabsichtigte Workflow-Erweiterung muss bewusst zusammen mit dem Vertrag freigegeben werden.

Task 9 Fixrunde 1: complete locally (separater Fixcommit; RED 11/19 grün und 8/19 rot durch zuvor akzeptierte Zusatzangriffe; GREEN 19/19 Nightly-Fälle und gesamter Workflow-Vertrag 49/49; exakte Schritte 5/5/10/6; Format, Lint, Typprüfung, 116 Dateien/1.070 Tests und Build 6,951 s grün; produktiver Nightly-Workflow unverändert; externe und Docker-/DB-Abnahmen weiterhin ausstehend)

Task 9 Fixrunde 2 Ruling: Die exakte Step-Allowlist reicht allein nicht aus. Das Workflow-Top-Level, jeder Job, die Browserstrategie und ihre Matrix erhalten ebenfalls vollständige Schlüssel-Allowlists und definierte Werte. Eine vorangestellte Serialisierungsprüfung aller Jobs verbietet Remote-URLs, Secrets-Kontexte sowie Produktions-/Service-Role-Variablen, lässt aber die benötigten `github.run_id`, `github.run_attempt` und `matrix.browser`-Kontexte zu — Grund ist, dass zwölf echte Block-Erweiterungen den vorherigen Vertrag umgingen — Kosten bei falscher Entscheidung: Jede beabsichtigte neue Workflow-, Job- oder Matrix-Funktion muss bewusst gleichzeitig im Vertrag freigegeben werden.

Task 9 Fixrunde 2: complete locally (separater Fixcommit; 14 neue Negativfixtures; RED 21/33 grün und 12/33 rot, GREEN 33/33 Nightly-Fälle und gesamter Workflow-Vertrag 63/63; Format, Lint, Typprüfung, 116 Dateien/1.070 Tests und Build 6,814 s grün; produktiver Nightly-Workflow unverändert; externe und Docker-/DB-Abnahmen weiterhin ausstehend)

Task 9 Fixrunde 3 Ruling: Der Workflowvertrag normalisiert ausschließlich ungetaggte öffentliche Prettier-YAML-AST-Knoten vom Typ `plain`: YAML-Booleans, Nullwerte und sichere endliche Dezimalzahlen erhalten echte JavaScript-Typen. `quoteSingle`, `quoteDouble`, getaggte Skalare, unsichere Zahlen, GitHub-Ausdrücke, Cron und bewusst gequotete Action-Inputs bleiben Strings — Grund ist, dass der vorherige reine Stringkonverter fünf semantisch falsche Quote-/Unquote-Mutanten akzeptierte — Kosten bei falscher Entscheidung: Neue bewusst numerische oder boolesche Workflowfelder müssen im erwarteten Objekt typgerecht ergänzt werden.

Task 9 Fixrunde 3: complete locally (separater Fixcommit; 6 neue Scalar-/Quelltextverträge; RED 33/39 grün und 6/39 rot, GREEN 39/39 Nightly-Fälle und gesamter Workflow-Vertrag 69/69; öffentliche Prettier-/yaml-unist-AST-Metadaten ohne private Debug-API; Format, Lint, Typprüfung, 116 Dateien/1.070 Tests und Build 6,746 s grün; produktiver Nightly-Workflow unverändert; externe und Docker-/DB-Abnahmen weiterhin ausstehend)

Task 9 Hauptagent-Nachkorrektur: complete locally (lexikalische Präzisionsprüfung vor JavaScript-Zahlenrundung; `15.0000000000000001`, `9007199254740991.1` und `1e-400` bleiben Strings und können numerische Workflowwerte nicht imitieren; 42/42 Nightly- und 72/72 Gesamt-Workflowverträge grün; produktiver Nightly-Workflow unverändert)

Task 10 Ruling: Die lokale Rollout-Abnahme kann fachliche Mutationen und den strukturierten Workflowvertrag belegen, aber externe PR-, Registry- und Produktionswirkung nicht ersetzen. Da der Feature-Branch auf GitHub fehlt, liegen 0/5 neue PR-Läufe vor; p95 und Runner-Minuten werden nicht extrapoliert. Docker bleibt wegen der fehlenden `dockerDesktopLinuxEngine`-Pipe blockiert, daher bleibt die dynamische RLS-Mutation `BLOCKED` — Grund ist die verbindliche Nachweispflicht ohne Push-/Deploy-Autorisierung — Kosten bei falscher Entscheidung: Ein verfrühtes GO würde ungeprüfte Scheduler-, DB- und Produktionswirkung akzeptieren.

Task 10: complete locally / production NO-GO (Steuermutant 2/14 rot, Doppelverkaufsmutant 1/16 rot, Playwright-Navigationsmutant 1/1 rot einschließlich Retry; nach normalen Reverts 14/14, 16/16 und 1/1 grün; RLS BLOCKED; lokaler CI-Workflowvertrag 16/16; temporärer Worktree exakt auf `7293435`, final ohne Diff und verifiziert entfernt; GitHub read-only 0/5 Feature-Runs; keine externen Aktionen)

Task 10 Fixrunde 1 Ruling: Der serielle Rückfallpunkt `0768233` ist nur Topologiereferenz und niemals Revert-Ziel. Ein späterer Rollback ist ein neuer, normaler Commit mit exklusivem Diff auf `.github/workflows/ci.yml`; er erhält alle heutigen Fachtests/Gates und das SHA-only-Image. Ein reines Nightly-Budgetproblem wird separat ausschließlich über `.github/workflows/quality-nightly.yml` pausiert. Runnerbudget wird erst bei mindestens fünf vergleichbaren historischen PR-Läufen mit positiven GitHub-Billable-Gesamtwerten aus der festen Kohorte bestimmt (`B = Median`, `T = 1,2 × B`); jeder der fünf neuen Läufe muss einzeln `R_ni ≤ T` erfüllen, während Gate-p95 separat ≤ 3 Minuten bleibt — Grund ist, dass Wandzeiten und ein einzelner alter Push-Lauf weder Billable-Budget noch Rollback-Sicherheit belegen — Kosten bei falscher Entscheidung: pauschale Commit-Reverts könnten Fachschutz entfernen und unbelegte Minutenwerte ein falsches Produktions-Go erzeugen.

Task 10 Fixrunde 1: complete locally / production NO-GO (Task-1-Baseline auf belegte Vitest-Dauer 26,37 s korrigiert; Rollback-Checkbox offen bis zur praktischen pfadbegrenzten Validierung; Baseline- und neue Runner-Minuten-Kohorten operationalisiert; keine Code-/Workflowänderung und kein externer Lauf)
