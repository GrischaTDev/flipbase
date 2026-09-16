## 2026-09-16 – ChatGPT – CI auf Kernabläufe reduzieren

**Auftrag:** CI für eine kleine SaaS-Lösung deutlich vereinfachen und unnötige
Pflicht- und Zusatzläufe entfernen.

**Änderung:** Sechs allgemeine Browser-Kernfälle statt 17. Die vier bisherigen
Daten-/Geldfälle bleiben unverändert; zwei kurze Demo-/Artikelprüfungen ergänzen
sie. Die vollständige bestehende Browserregression bleibt gezielt/manuell
aufrufbar. Keine täglichen oder wöchentlichen Zusatzläufe mehr. Der separate
Benchmark-Workflow und seine Messskripte werden entfernt. Traces im Pflichtlauf
nur auf ausdrücklichen Diagnosewunsch, Fehler-Screenshots bleiben aktiv. Die
Prüfung der Playwright-Auswahl führt nur noch zwei Listenaufrufe aus statt
wiederholt Konfigurationen zu kopieren und Playwrights Verhalten nachzutesten.
Die vorbereitete Trennung `application_tests` verhindert fachfremde Frontendjobs
bei reinen Bot-Paketänderungen. V2-Nachweise binden die Wiederverwendung an den
tatsächlich geprüften Umfang. Auslieferung, SQL und Anwendungscode unverändert.

**Abwägung:** Zusätzliche Feature-/UI-Browsertests sind nicht als automatische
Merge-Gates erzwungen. Sie werden bei relevanten Änderungen vor dem Merge gezielt
ausgeführt und im PR dokumentiert. Dafür entsteht keine weitere Testauswahl-Engine.
Alle bestehenden Node-, DOM- und Angular-Fälle bleiben für Frontendänderungen
aktiv. Der allgemeine Browserlauf ist kein echter Backend-Auth-/RLS-Nachweis.

**Prüfung:** 31 lokale Node-Tests der Änderungserkennung, Pflichtprüfung und
Nachweiswiederverwendung bestanden. Fünf lokale Konfigurationsprüfungen bestätigen
sechs Kernfälle und den Erhalt aller 19 erweiterten Fälle; diese verwenden einen
kleinen defineConfig-Ersatz und sind ausdrücklich kein Playwright-Lauf. YAML und
JavaScript-/TypeScript-Syntax separat geprüft. Echte Playwright-Auswahl/-Ausführung,
Projektformatierung, ESLint, actionlint und Projektbuild bleiben in CI zu prüfen,
weil die Projektabhängigkeiten in dieser Umgebung nicht installiert werden können.
Keine neue Laufzeit- oder Kosteneinsparquote behauptet.

**Dokumentation:** Dieser Nachtrag liegt separat vor, weil das zentrale Protokoll
über die verfügbare Schnittstelle nicht als kleine Einfügung geändert werden kann.
Die bestehende vollständige Historie in `docs/AI-CHANGELOG.md` bleibt unverändert;
die zentrale Übernahme ist noch offen. Der abschließende CI- und Merge-Stand wird
im zugehörigen PR festgehalten.
