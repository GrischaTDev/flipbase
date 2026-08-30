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

## Konsolidierung der Modulgraphen in Task 4

Die wiederholten Komponenten- und `PurchaseService`-Modulgraphen wurden ohne
Verlust von Testfällen oder Assertions zusammengeführt. Die Suite sank dadurch
von 131 auf 117 Spec-Dateien. Der Audit meldet nun 90 Node-, 9 DOM- und 18
Angular-Dateien; die 1.039 Vitest-Testfälle bleiben unverändert.

Wie in Task 3 wurde vor jeder lokalen Stichprobe `npx ng cache clean`
ausgeführt. Jede Stichprobe startete `npm test` in einem neuen Prozess;
angegeben ist die gesamte gemessene Befehlsdauer.

| Stand                                    |   Lauf 1 |   Lauf 2 |   Lauf 3 |  Minimum |   Median |  Maximum | Ergebnis                 |
| ---------------------------------------- | -------: | -------: | -------: | -------: | -------: | -------: | ------------------------ |
| Vor Task 4                               | 22,025 s | 22,135 s | 21,882 s | 21,882 s | 22,025 s | 22,135 s | 131 Dateien, 1.039 Tests |
| Nach Modulgraph-Konsolidierung in Task 4 | 19,825 s | 20,075 s | 19,758 s | 19,758 s | 19,825 s | 20,075 s | 117 Dateien, 1.039 Tests |

Der Median sank um 2,200 Sekunden beziehungsweise rund 10,0 Prozent. Das lokale
20-Sekunden-Ziel wird im Median mit 0,175 Sekunden Abstand erreicht. Einer der
drei Läufe lag mit 20,075 Sekunden knapp über dem Ziel; die Abnahme bewertet
deshalb weiterhin den Median und nicht einen beschönigten Einzelwert.

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

## Vertrag des parallelen Gesamtlaufs

`npm test` startet Node, DOM und Angular parallel. Der Orchestrator beendet die
vollständigen Prozessbäume bei `SIGINT`, `SIGTERM` oder nach dem standardmäßigen
Zeitlimit von 15 Minuten. Ein abweichendes positives Zeitlimit in Millisekunden
kann über `FLIPBASE_TEST_TIMEOUT_MS` gesetzt werden.

Unter POSIX behält die zweistufige Beendigung ihre ursprüngliche
Prozessgruppen-ID auch dann, wenn der direkte npm-Prozess während der Schonfrist
bereits endet. Der referenzierte Grace-Timer hält den Standalone-Runner bis zur
abschließenden `SIGKILL`-Stufe am Leben.

Unter Windows gibt es bewusst keine verzögerte zweite Stufe: Jeder noch bekannte
Root-Prozessbaum wird bei Abbruch oder Timeout genau einmal sofort mit
`taskkill /pid <root> /t /f` beendet. Dadurch werden weder PIDs gespeichert noch
nach einer Schonfrist möglicherweise wiederverwendete PIDs erneut adressiert.
Jeder `taskkill`-Hilfsprozess besitzt ein unabhängiges Zeitlimit von fünf
Sekunden; Fehler oder Zeitüberschreitungen werden gemeldet und können den Runner
nicht unbegrenzt blockieren.

Zusätzliche Argumente an `npm test` werden absichtlich mit Exitcode 2 abgelehnt,
weil eine mehrdeutige Weitergabe an drei Prozesse fehleranfällig wäre. Eine
einzelne Gruppe kann stattdessen eindeutig aufgerufen werden:

```text
npm run test:node -- <Vitest-Argumente>
npm run test:dom -- <Vitest-Argumente>
npm run test:angular -- <Vitest-Argumente>
```

Die Orchestrator-Verträge laufen über `test:orchestrator` und automatisch vor
`test:node`. Dadurch werden sie sowohl bei einem gezielten Node-Lauf als auch bei
jedem regulären `npm test` genau einmal geprüft, ohne den Orchestrator rekursiv
aufzurufen. Ihre Parallelitäts- und Signaltests verwenden bestätigte
Datei-/Ausgabebarrieren statt knapper Annahmen über die Laufzeit.
