# 🤖 KI-Änderungsprotokoll

Neue Sitzungen werden hier oben ergänzt: Datum, Assistent, Thema sowie Auftrag,
Änderung und tatsächlich ausgeführte Prüfungen. Die Vorgaben aus `AGENTS.md` gelten
unverändert.

Die vollständige bisherige Historie ist im
[Archiv bis zum Stand vom 16. September 2026](AI-CHANGELOG-archive-2026-09-16.md)
bytegleich erhalten. Das Archiv liegt im selben Ordner, damit seine relativen
Dateiverweise weiterhin denselben Ausgangspunkt haben.

## 2026-09-16 – ChatGPT – Abschluss der CI-Dokumentation

**Auftrag:** Die nach PR #96 offenen Aufräumpunkte angehen. Keine weitere
Testreduzierung oder Angular-Optimierung beauftragt.

**Änderung:** Den Abschluss der CI-Vereinfachung in das zentrale Protokoll
übernommen. Die vorherige vollständige Protokolldatei wird mit demselben Git-Blob
`17c987d1989d4a9db61bce71e897cf855d4c41d2` archiviert, nicht gekürzt oder
rekonstruiert. Der ursprüngliche
[Arbeitsstand des CI-Nachtrags](development/2026-09-16-lean-ci-log.md) bleibt als
historischer Zwischenstand erhalten; seine offene zentrale Übernahme ist durch
diesen Eintrag erledigt. Anwendung, Tests und Workflows bleiben unverändert.

**Prüfung:** PR #96 und dessen Merge-Stand erneut gelesen. Der Produktionsjob
bestätigt erfolgreiches Deployment und erfolgreiche öffentliche Versionsprüfung.
Die identische Blob-ID sichert den unveränderten Inhalt der bisherigen Historie.
Die Formatprüfung dieser Dokumentationsänderung erfolgt im regulären PR.

**Offen:** Der gemergte Remote-Branch `ci/lean-validation-20260916` konnte über die
verfügbare GitHub-Schnittstelle nicht gelöscht werden. Es wurde keine Löschung
behauptet und kein zusätzlicher Workflow für eine Löschung eingerichtet.

## 2026-09-16 – ChatGPT – CI auf Kernabläufe reduziert und ausgeliefert

**Auftrag:** Die automatische Prüfung einer kleinen SaaS-Lösung vereinfachen und
unnötige Pflicht- und Zusatzläufe entfernen.

**Änderung:** Sechs allgemeine Browser-Kernfälle statt 17. Die vier bestehenden
Daten- und Geldfälle bleiben inhaltlich unverändert. Zwei kurze Fälle prüfen
Appstart/Navigation sowie das Speichern und Wiederöffnen eines Artikels mit Bild.
Die 13 übrigen bisherigen Pflichtfälle bleiben gezielt manuell ausführbar. Der
erweiterte markierte Bestand umfasst einschließlich der zwei neuen Fälle 19
Tests.

Tägliche und wöchentliche Zusatzläufe sowie das separate Benchmark-System wurden
entfernt. Traces im Pflichtlauf sind nur zur gezielten Diagnose einschaltbar;
Fehler-Screenshots bleiben aktiv. Die Prüfung der Browser-Testauswahl wurde auf
zwei tatsächliche Listenaufrufe vereinfacht.

Der Schalter `application_tests` verhindert fachfremde Frontend-Testjobs bei reinen
Änderungen am Bot-Paket `services/sniper/`. V2-Nachweise binden die Wiederverwendung
an den geprüften Dateistand und Umfang. Bei Frontendänderungen bleiben alle
vorhandenen Node-, DOM- und Angular-Fälle aktiv. Die bestehenden Datenbank-, Bot-,
Image-, Migrations- und Deployment-Jobblöcke bleiben unverändert.

**Abwägung:** Zusätzliche Feature- und UI-Browsertests sind außerhalb des
Kernbestands nicht automatisch als Merge-Voraussetzung erzwungen. Bei relevanten
Änderungen sind sie gezielt vor dem Merge auszuführen und im PR zu dokumentieren.
Die Browserfälle verwenden Demo-Daten oder Mocks und ersetzen keine echten
Backend-Auth- oder RLS-Prüfungen. Details stehen in den
[aktuellen Testregeln](testing/lean-ci.md).

**Verifiziertes Ergebnis:**
[PR #96](https://github.com/GrischaTDev/flipbase/pull/96) wurde nach erfolgreicher
CI mit Merge-Commit `b3b41c63182403900aa3e853f04defed249a3500` integriert. Der
[PR-Prüflauf](https://github.com/GrischaTDev/flipbase/actions/runs/35097477856)
bestand im ersten Versuch: Formatierung, ESLint, Typen, actionlint,
Workflowprüfungen, Node/DOM, beide Angular-Gruppen, Datenbankprüfungen,
Migrations-Transaktionstest, Bot-Prüfungen, Build und Required checks.

Der vollständige Browserjob benötigte 1:58 statt zuvor 8:56 Minuten; der
Testschritt einschließlich Appstart 1:22 statt 8:18 Minuten. Die beobachtete
Differenz des Browserjobs beträgt 6:58 Minuten, rund 78 Prozent. Das ist ein
Vergleich regulärer Läufe mit bewusst unterschiedlichem Prüfumfang, keine
Beschleunigung derselben 17 Tests und keine Hochrechnung auf die gesamte
GitHub-Rechnung. Die erste Angular-Gruppe benötigte weiterhin 7:24 Minuten.

Der anschließende
[Produktionslauf](https://github.com/GrischaTDev/flipbase/actions/runs/35098360646)
hat das Image veröffentlicht, das Deployment ausgeführt und die öffentlich
ausgelieferte Version erfolgreich geprüft.
