# Arbeitsstand: Vinted-Marktplatzverwaltung

## 2026-09-26 – Juna – Kontodaten und Auftragsprüfung begonnen

Basis: `master` bei `6fc7bd6a8ef2d20f19fb6717347efb47bb524313`.
Branch: `juna/vinted-marketplace-foundation`.

**Auftrag:** Einen eigenen GitHub-Branch erstellen und mit dem abgestimmten
Vinted-Konzept beginnen, ohne die laufende Anwendung oder echte Konten zu verändern.

**Änderung:** Gemeinsame Typen für Plattformen, Kontoverbindungen, Fähigkeiten,
Aufträge und nullable Kennzahlen. Strikte Prüfung von Workspace-/Konto-ID,
aktionsspezifischen Nutzdaten und unbekannten Feldern. Validierte Aufträge sind
unabhängige, eingefrorene Kopien; Änderungen des Aufrufers ändern ihr Konto nicht.
Frontend-Typen und künstliche A/B-Daten sind vorbereitet. Keine neue Route,
kein ausführender Server-Endpunkt und kein Browseranbieter sind angeschlossen.

## Tatsächlich ausgeführte Prüfungen

```sh
node --experimental-strip-types --test 'supabase/functions/_shared/marketplace-*.test.ts'
```

Node 22.16.0: zuerst 53 Fehler und 1 Erfolg am bewusst unvollständigen Platzhalter;
nach Implementierung 54 Vertragstests erfolgreich. Ein zusätzlicher Fixture-Test
fand den zunächst fehlenden Workspacebezug in Inseraten und Gesprächen. Nach der
Korrektur: insgesamt 59 Tests erfolgreich, 0 Fehler, Exitcode 0.
Geprüft werden unter anderem fehlende Kontozuordnung, unbekannte Aktionen,
unzulässige Identitäts-/Providerfelder, unterschiedliche Nutzdaten je Aktion,
begrenzte Pagination, unveränderter Nachrichtentext, Kopien der Auftragsscope
und fehlende beziehungsweise unbestätigte Fähigkeiten.

Die neuen TypeScript-Dateien einschließlich Tests und Frontend-Typimport wurden
isoliert mit TypeScript 5.8.3 und `--strict --noEmit` geprüft: Exitcode 0.
Dies ist nicht die vollständige Projektprüfung mit der projektgebundenen Version.

## Grenzen dieser Prüfung

Der GitHub-Zugriff funktionierte über die Projektverbindung. Ein vollständiger
Git-Clone scheiterte in dieser Ausführungsumgebung an der DNS-Auflösung.
Projektabhängigkeiten und Deno standen hier nicht zur Verfügung. Daher sind
reguläre Edge-Suite, Projekt-ESLint/Prettier, Angular-Bau und vollständige
Regressionen noch nicht ausgeführt. Der bestehende ESLint-Vertrag nimmt
`supabase/**` aus; für diese Dateien ersetzt das keine fachlichen Tests.
Die Dateien wurden mit der dokumentierten Formatvorgabe vorbereitet, nicht als
von Prettier erfolgreich geprüft ausgegeben.

Der neue Test importiert nur `node:test`, `node:assert/strict` und lokale Dateien.
Er liegt im vorhandenen Glob von `npm run test:edge`; dessen tatsächlicher
Deno-Lauf bleibt vor einem PR erforderlich.

## Entscheidungen und nächste Schritte

- Der heutige Auftrag ist ein Implementierungsstart, nicht die Fertigstellung
  aller zehn Arbeitspakete. AP01 bleibt hinsichtlich Datenbank-/Rechteabgleich offen.
- Keine Rolle, Kontoberechtigung oder Plattformfreigabe wird aus gültigen DTOs
  abgeleitet. Serverseitige Autorisierung folgt in AP03 und ist zwingend.
- Der frühe Anbieter-/Session-Nachweis bleibt vor dem breiten UI-Ausbau.
- G0 bis G4 sind nicht erteilt. Keines der bestehenden Vinted-Konten wurde benutzt.
- Keine Datenbank, bestehende Seite, Abhängigkeit oder Deployment-Datei wurde geändert.
- Der bestehende lange Haupt-Changelog konnte hier nicht verlustfrei als Datei
  übernommen werden. Er bleibt unverändert; der exakte ergänzende Patch liegt
  daneben und muss im Vollcheckout vor dem PR angewendet werden. Kein historischer
  Eintrag wurde gekürzt oder überschrieben.

Die nächsten Änderungen setzen diesen Branch fort. Vor einem Merge sind die
Projektprüfungen auszuführen und die offenen Freigaben sichtbar zu halten.
