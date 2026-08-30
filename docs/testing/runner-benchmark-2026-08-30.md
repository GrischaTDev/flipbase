# Vorläufige Angular-Runner-Entscheidung vom 30. August 2026

## Ergebnis

Flipbase verwendet vorläufig den isolierten Vitest-Fallback für
`npm run test:angular`. Der offizielle Angular-Builder und der manuelle
Benchmark-Workflow bleiben bis zu drei kalten CI-Stichproben je Kandidat erhalten.
Erst diese externe Messung macht die Entscheidung endgültig.

Beide Kandidaten führen dieselben 20 Angular-Dateien mit denselben 148 Tests
erfolgreich aus. Lokal war der Builder im Median jedoch 5,721 Sekunden oder rund
43 Prozent langsamer. Damit erfüllt er die Übernahmeregel nicht.

## Vergleichsgrundlage aus Task 1 und Task 2

| Stand                                | Dateien | Tests |      Gemeldete Vitest-Dauer | Einordnung                                                |
| ------------------------------------ | ------: | ----: | --------------------------: | --------------------------------------------------------- |
| Ursprünglicher Runner aus Task 1     |     131 | 1.039 |                     26,37 s | einzelner lokaler Lauf, noch ohne Klassifikation          |
| Klassifizierter Split aus Task 2     |     131 | 1.039 | nicht separat protokolliert | funktional grün; 98 Node-, 13 DOM- und 20 Angular-Dateien |
| Split nach zentralem Setup in Task 3 |     131 | 1.039 |                     23,77 s | lokaler Funktionslauf, keine kalte CI-Messung             |

Die in Task 2 vorgesehene GitHub-Messung wurde gemäß Projekt-Ruling nicht extern
gestartet. Es werden daher keine CI-Werte erfunden oder aus lokalen Werten
abgeleitet.

## Lokaler Angular-Vergleich

Vor jeder Stichprobe wurde `npx ng cache clean` ausgeführt. Jede Stichprobe lief
in einem neuen Prozess. Angegeben ist die gesamte gemessene Befehlsdauer, nicht
nur die interne Vitest-Dauer.

| Kandidat                    |   Lauf 1 |   Lauf 2 |   Lauf 3 |  Minimum |   Median |  Maximum | Ergebnis                    |
| --------------------------- | -------: | -------: | -------: | -------: | -------: | -------: | --------------------------- |
| Offizieller Angular-Builder | 19,296 s | 19,042 s | 19,024 s | 19,024 s | 19,042 s | 19,296 s | 20 Dateien, 148 Tests, grün |
| Isolierter Vitest-Fallback  | 13,153 s | 13,321 s | 13,377 s | 13,153 s | 13,321 s | 13,377 s | 20 Dateien, 148 Tests, grün |

Der Fallback nutzt `jsdom`, `vmThreads` und `isolate: true`. Die
`TestBed`-Initialisierung liegt ausschließlich in
`src/test-setup.angular-fallback.ts`; die weiterhin benötigte private
Ressourcenauflösung in den Specs bleibt bis zu einer späteren Builder-Übernahme
unverändert.

## Ausstehende kalte CI-Messung

`.github/workflows/test-benchmark.yml` vergleicht weiterhin je drei Stichproben
über `test:angular-builder` und `test:angular-fallback`. Der Workflow wird in
diesem Task weder gestartet noch gepusht. Nach sechs erfolgreichen Jobs mit je
20 Dateien und 148 Tests werden Minimum, Median und Maximum gegenübergestellt.

Der Builder darf nur übernommen werden, wenn alle Tests bestehen, sein kalter
CI-Median nicht langsamer als der Fallback ist und der parallele Gesamtlauf das
lokale Zeitbudget erfüllt. Bis dahin bleiben auch `angular.json`,
`vitest.split.config.ts` und der Benchmark-Workflow als messbare
Vergleichsinfrastruktur erhalten.
