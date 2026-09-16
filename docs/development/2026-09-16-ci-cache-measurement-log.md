# CI-Cache: Änderungsprotokoll vom 16. September 2026

**Auftrag:** Freigegebenes erstes CI-Optimierungspaket veröffentlichen, den
begrenzten Cache-Vergleich ausführen und nur nach erfolgreicher Prüfung mergen.

**Umfang:** Angular erlaubt den Diskcache in CI. Ein begrenzter Cache-Vergleich
und eine getrennte Importdiagnose ergänzen den bisherigen manuellen Benchmark.
Sieben Tests prüfen die Auswertung und Wiederherstellung der Konfiguration.
Anwendungstestumfang, Isolation, Paketversionen, Pflichtprüfungen und Deployment
bleiben unverändert.

**Ausführung:** Die Connector-Schnittstelle bietet keinen Workflow-Dispatch.
Nach Ankündigung im Chat startet deshalb ausschließlich `pull_request: opened`
vom eigenen Branch `perf/ci-cache-measurement-20260916` den freigegebenen
Cache-Vergleich. Keine neuen Läufe bei weiteren Pushes oder anderen Branches.

**Vorabprüfung:** Sieben Node-Tests erneut bestanden, JavaScript-Syntax und
Workflowstruktur geprüft. npm-Registry hier nicht erreichbar; vollständige
Angular-, Browser-, Formatierungs- und Lintprüfung erfolgt im vorhandenen PR-CI.
Kein Geschwindigkeitsgewinn ohne tatsächliches Vergleichsergebnis behauptet.

**Dokumentationsgrenze:** Verlustfreier separater Nachtrag für den zentralen
`docs/AI-CHANGELOG.md`. Die verfügbare Schreibaktion ersetzt komplette Dateien;
die große zentrale Historie wird nicht durch einen unvollständigen Auszug ersetzt.
PR-Beschreibung und Messartefakte dokumentieren die anschließend verifizierten Ergebnisse.
