# Schlanke CI für Flipbase

Stand: 16. September 2026. Diese Entscheidung ersetzt die frühere tägliche und
wöchentliche Prüfplanung sowie die Cache-/Runner-Benchmarkplanung.

## Vor dem Merge

Format, Lint, Typprüfung und Build bleiben. Bei Frontendänderungen bleiben auch
alle vorhandenen Node-, DOM- und Angular-Tests erhalten. Datenbank- und Botchecks
laufen weiterhin bei passenden Änderungen. Reine Bot-Paketänderungen starten
keine fachfremden Frontend-Testjobs und keinen zusätzlichen Frontend-PR-Build.

Der allgemeine Chromium-Pflichtlauf prüft sechs Arbeitsabläufe:

1. Demo starten und die zentralen Arbeitsbereiche über die Navigation öffnen.
2. Artikel mit einem Bild speichern und nach Neuladen wieder öffnen.
3. Einkaufsentwurf bearbeiten, Änderungen verwerfen und speichern.
4. Kostenherkunft nach erneutem Öffnen erhalten.
5. Steuerwerte anzeigen und ungeprüfte Exporte sperren.
6. Ein Einzelstück verkaufen und einen erneuten Verkauf im Frontend verhindern.

Die ersten beiden Fälle sind kleine neue Tests mit `@core-smoke`. Die übrigen
vier werden aus den vorhandenen, unveränderten Testfällen explizit ausgewählt.
Das historische Kennzeichen `@pr-smoke` bezeichnet den bestehenden erweiterten
Regressionstestbestand und macht neue Fälle nicht automatisch zur PR-Pflicht.
Die Auswahlliste steht direkt in `playwright.pr.config.ts`.

Die Browserfälle verwenden Demo-Daten oder Mocks. Sie beweisen weder eine echte
Backend-Anmeldung noch die serverseitige Mandantentrennung. Die bestehenden
Datenbank-, Berechtigungs-, Migrations- und fachlichen Tests werden nicht ersetzt.

## Gezielte Prüfung einer Änderung

Es gibt bewusst keine neue automatische Abhängigkeits- oder Testauswahl-Engine.
Vor dem Push führt die bearbeitende Person die betroffenen zusätzlichen
Browsertests aus und hält das Ergebnis im PR fest. Insbesondere bei Änderungen
an Routing, Anmeldung, gemeinsamem Layout, Formularbausteinen oder Abhängigkeiten
gehört die erweiterte Browserregression vor dem Merge dazu.

Beispiele:

```bash
# Allgemeiner, kleiner Pflichtlauf
npm run test:e2e:pr

# Vollständige Testdateien der bearbeiteten Funktion, auch nicht markierte Fälle
npm run test:e2e -- e2e/product-editor-storefront.spec.ts
npm run test:e2e -- e2e/deal-monitor.spec.ts e2e/sniper-administration.spec.ts
npm run test:e2e -- e2e/entry-pages.spec.ts e2e/purchase-dropdown-layer.spec.ts

# Alle bisherigen 17 markierten Fälle plus zwei neue Fälle in einem Browser
npm run test:e2e:nightly -- --project=chromium
```

Diese erweiterten Prüfungen sind außerhalb des kleinen Pflichtlaufs nicht
technisch als Merge-Gate erzwungen. Das ist eine bewusste Vereinfachung für das
kleine Team, kein Versprechen gleicher automatischer Abdeckung wie zuvor.
Bei Problemen lässt sich vor einer Auslieferung der erweiterte Lauf starten.

## Keine automatischen Zusatzläufe

`Optional quality checks` ist ausschließlich manuell startbar. Ausgewählt wird
genau ein Bereich: Browserregression, vollständige Testabdeckung oder lokale
Datenbankprüfungen einschließlich parallelem Verkauf. Bei Browserprüfungen wird
außerdem genau eine Engine gewählt; standardmäßig Chromium.

Die täglichen/wöchentlichen Wiederholungen, ihr zusätzlicher Steuerungsjob und
der automatische 20-fache Node-Stresstest entfallen. Die npm-Befehle für gezielte
Testabdeckung und Reihenfolge-Diagnose bleiben als manuelle Werkzeuge erhalten.
`quality-nightly.yml` und `test:e2e:nightly` behalten ihre Namen aus Kompatibilität;
sie führen nicht mehr zu einem nächtlichen Start.

Der zusätzliche Benchmark-Workflow und seine beiden Messskripte werden entfernt.
Historische Messberichte bleiben als Dokumentation erhalten, nicht als aktuelle
Arbeitsanweisung. Es gibt keine neue Benchmark-Infrastruktur.

## Diagnose ohne dauerhafte Aufzeichnung

Im Pflichtlauf bleiben Fehler-Screenshots erhalten. Traces sind standardmäßig
ausgeschaltet, bei Bedarf einschaltbar. Unter Bash beispielsweise:

```bash
E2E_TRACE=1 npm run test:e2e:pr
```

Unter PowerShell:

```powershell
$env:E2E_TRACE = '1'
npm run test:e2e:pr
Remove-Item Env:E2E_TRACE
```

Für einen einzelnen Sonderfall kann alternativ Playwrights `--trace on` verwendet
werden. Bestehende explizite Screenshots der ausführlichen Tests entstehen nur,
wenn diese Tests gezielt beziehungsweise im erweiterten Lauf ausgeführt werden.

## Auslieferung und Nachweise

Produktionsbau, Images, Migrationen, Image-Smoke, öffentlicher Versionscheck und
Release bleiben unverändert. `application_tests` trennt die Testauswahl vom
bestehenden Release-Schalter. Ein V2-Prüfnachweis erlaubt Wiederverwendung nur
für identischen Git-Inhalt und ausreichenden Umfang. Alte Nachweise ersetzen
die neue Prüfung nicht.

## Messgrenzen

Die Konfiguration reduziert den allgemeinen Browserbestand von 17 auf sechs
Fälle. Das ist keine Behauptung einer bestimmten prozentualen Laufzeitersparnis.
Die vier Daten-/Geldfälle bleiben unverändert. Alle Angular-Tests laufen bei
Frontendänderungen weiterhin; sie können deshalb auch nach der Verschlankung
noch den längsten Pfad des PR-Prüflaufs bestimmen.

Die erste echte CI-Ausführung muss Laufzeit, ausgewählte Fälle und Erfolg
bestätigen. Keine zusätzlichen vollständigen Benchmarkläufe nur zur Ermittlung
einer schöneren Prozentzahl starten.
