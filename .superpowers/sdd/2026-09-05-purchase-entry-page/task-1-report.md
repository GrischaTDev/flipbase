# Task 1 Report: Gemeinsames Einkaufsformular und eigene Seite

## Ergebnis

- Die bisherige Persistenzlogik liegt einmalig im `PurchaseEntryFormComponent`.
- Der bestehende Dialog ist ein dünner, barrierefrei beschrifteter Wrapper für die Bearbeitung.
- Neue Einkäufe öffnen unter `/purchases/new`; Liste und Leerzustand navigieren dorthin.
- Die Seite fragt bei ungespeicherten Änderungen über `canDeactivate` und `beforeunload` nach.
- Erfolgreiches Speichern beziehungsweise Finalisieren hebt die Navigationssperre auf.
- Die Artikel-Schnellerfassung enthält kein verschachteltes Formular mehr, verhindert Doppelklicks
  und stellt auch bei geworfenen Fehlern den Ladezustand wieder her.
- Sichtbare Artikelbegriffe wurden auf `Artikel`, `Vorhandenen Artikel wählen`,
  `Neuen Artikel anlegen`, `Einzelstück hinzufügen`, `Stückpreis` und `Gesamt` vereinfacht.

## RED

- Der neue Guard-Test scheiterte zunächst, weil `purchase-entry.guard.ts` noch nicht existierte.
- Der neue Seitentest scheiterte zunächst, weil `purchase-create.component.ts` noch nicht existierte.
- Der neue Playwright-Test beschrieb vor der Umsetzung die erwartete Navigation und Seitenstruktur.
- Der erste Build nach der Fehlerbehandlung der Artikel-Schnellerfassung fand einen fehlenden
  `reportedBySyncStatus`-Wert; die vollständige Mutation-Antwort wurde danach ergänzt.

## GREEN und Prüfung

- `npx vitest run --project=angular ...` für Guard, Seite, Formular, Positionseditor und
  Einkaufsübersicht: **48 Tests bestanden**.
- `npx playwright test e2e/purchase-entry.spec.ts --project=chromium`: **1 Test bestanden**.
- `npx eslint ...` für alle geänderten TypeScript-/Testdateien: **bestanden**.
- `npx prettier --write ...` für alle geänderten Taskdateien: **bestanden**.
- `npm run build`: **bestanden**.

## Hinweise

- Keine Datenbank-, Servicevertrag-, Abhängigkeits- oder Deployment-Änderungen.
- Die vollständige Suite wurde bewusst nicht erneut ausgeführt; die Abschlussprüfung gehört dem
  Controller. Die gezielten Regressionstests decken die verschobene Persistenzlogik ab.
- `docs/AI-CHANGELOG.md` wurde nicht von diesem Task bearbeitet; der Controller besitzt diese Datei.

## Nachbesserung nach Browser-QA

- Die Seitenansicht verwendet keinen Modalrahmen und keine Schließen-Schaltfläche mehr. Ab `xl`
  stehen Hauptformular und kompakte, haftende Kostenübersicht nebeneinander; darunter werden sie
  ohne zweiten Formular-DOM gestapelt. Der Bearbeitungsdialog behält seinen Rahmen.
- Die Schließen-Schaltfläche des Dialogs hat nun einen zugänglichen Namen. Der Controller prüfte
  zehn helle/dunkle Ansichten ohne Überlauf sowie AXE ohne Befund.
- Einkaufstypen verwenden neutrale Flächen und einen gemeinsamen gelben Auswahlakzent.
- Eine laufende Speicherung kann nicht mehr durch Bestätigung verlassen werden. Pristine,
  abgebrochene und bestätigte Navigation sind zusätzlich im Browser abgesichert.
- Die Seite reagiert nur noch auf `closed`; die aufeinanderfolgenden Erfolgsereignisse verursachen
  dadurch keine doppelte Navigation.
- Der Mystery-Regressionsfall prüft im echten Browser: Titel bleibt beim Typwechsel erhalten,
  `100 + 10` ergibt `110`, und der Entwurf ist ohne Inhaltszeilen speicherbar. Im bereitgestellten
  sequenziellen Account-Skript war beim Fehlschlag der Titelwert leer, während Kosteneditor und
  Mystery-Daten gültig waren. Der isolierte Browser-Regressionsfall besteht; dies belegt einen
  Ablauf-/Wartefehler im QA-Skript statt einer Mystery-Validierungsregel.
