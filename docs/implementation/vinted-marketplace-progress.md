# Arbeitsstand: Vinted-Marktplatzverwaltung

## 27. September 2026 – Korrektur für den Docker-Produktionsbau

PR #207 wurde nach grünen Pflichtprüfungen als Merge-Commit `8386afb8` in
`master` übernommen. Der automatische [Produktionslauf](https://github.com/GrischaTDev/flipbase/actions/runs/36310542011)
brach beim Docker-Bau ab: `.dockerignore` schloss den reinen Typvertrag
`supabase/functions/_shared/marketplace-contracts.ts` aus, den Angular beim
Bauen benötigt. Die Datei ist nun einzeln für den Docker-Kontext freigegeben;
andere Edge-Function-Dateien bleiben ausgeschlossen. Ein Docker-Kontexttest und
der vollständige Build der Docker-Baustufe bestanden lokal. Die tatsächliche
Veröffentlichung ist erst nach einem erfolgreichen neuen Produktionslauf belegt.

## 27. September 2026 – Kontogebundene Testsitzung

Basis: `c004b0d4` auf `juna/vinted-marketplace-foundation`. Der bestehende
Kontobereich und die gespeicherten Ansichten wurden weiterverwendet.

Der Anbieterabgleich ergab: GoLogin bietet Cloud-Start/-Stopp und eine
`remoteOrbitaUrl`; diese Liveansicht-URL ist selbst ein Zugang. Playwright kann
einen Chromium-Browser über CDP verbinden, die Unterstützung ist dabei
eingeschränkt. Eine sichere, pro Flipbase-Nutzer widerrufbare Einbettung wurde
aus den öffentlichen Anbieterunterlagen nicht nachgewiesen. Deshalb gibt die
neue Testseite weder Anbieter-Token noch CDP- oder Liveansicht-URLs aus.
Quellen und Umsetzungsschritte stehen im [Plan](../superpowers/plans/2026-09-26-vinted-marketplace.md#ap04a-kontogebundene-testsitzung-vor-anbieteranschluss).

Die neue Seite `/marketplaces/vinted/session-test` prüft ausschließlich eine
künstliche Sitzung. Die Datenbank bindet sie an Workspace, Verbindung und
angemeldeten Benutzer. Ein zweiter Start desselben Kontos wird gesperrt;
Fristablauf, Pause, Widerruf und simulierter Browserabbruch verhindern weitere
Aktionen. Ein zweiter Admin desselben Workspace darf die fremde Sitzung nicht
lesen oder widerrufen. Eine andere Kontoverbindung behält ihren eigenen Zustand. Auch eine
verspätete Antwort nach A → B → A wird in Angular verworfen. Die neue
Migration wurde aus dem isolierten Unterschied zwischen vorhandenen Migrationen
und dem neuen Schema erzeugt. Der Generator ließ ausdrückliche `revoke`-Rechte
aus; ein getesteter Nachbearbeitungsschritt ergänzte sie aus der Schemadatei.

**Tatsächlich geprüft:** Neuer Test zunächst rot; nach Umsetzung 32 neue und
31 bestehende Marktplatz-Datenbanktests grün. Frisch aufgebaute lokale Datenbank
mit der erzeugten Migration; gesamte Datenbanktestsuite: 60 Dateien, 2127 Tests
grün. Sechs neue Modelltests und 38 gezielte Angular-Tests grün. TypeScript,
gezieltes ESLint und Angular-Produktionsbau erfolgreich. Drei Chromium-Abläufe
mit künstlicher Anmeldung und abgefangenen RPC-Antworten grün; die neue Testseite
wurde bei 390 px einschließlich AXE und Überlauf geprüft. Drei Tests für die
Migration-Nachbearbeitung grün.
Die vollständige Anwendungstestsuite ist nach Korrektur zweier veralteter
Einstellungs-Routenerwartungen ebenfalls grün: 1502 Node-, 268 DOM- und
1183 Angular-Tests. Die bestehende Route `settings/marketplaces` war in diesen
alten Testlisten noch nicht enthalten. Die Shared-UI-Prüfung meldete null
Abweichungen; Schema- und Migrations-Workflowtests bestanden.
`supabase db lint --schema public --fail-on error` bestand nach dem erneuten
Migrations-Neuaufbau; verbleibende Warnungen betreffen bestehende Funktionen.

**Grenze:** Es wurde kein GoLogin-Profil geöffnet, kein Vinted-Konto benutzt,
kein Liveimport und kein Nachrichtenversand eingerichtet. Die Simulation ist
kein G1-Nachweis für eine echte interaktive Anmeldung. Der spätere Worker muss
Providerprofile bei Ablauf und Widerruf ausdrücklich stoppen und die Liveansicht
ohne Anbieter-URL auf Flipbase-Berechtigungen begrenzen. G0-Freigaben bleiben offen.
Die Datenbanktests prüfen die zweite Anmeldung nacheinander; ein Test mit zwei
tatsächlich gleichzeitigen Transaktionen steht für die Worker-Anbindung noch aus.

---

## Native Oberfläche: Fortsetzung am 26. September 2026

Basis: `611687a43d214f3532f2464a9e04dedd94082c2c` auf demselben Feature-Branch.

Der Bereich `/marketplaces/vinted` ist jetzt im Quellcode an die bestehende
Navigation angeschlossen. Fünf Inhaltsbereiche und die gesonderte Aktivitätsseite
teilen sich eine kontogebundene Auswahl. Unter `/settings/marketplaces` werden
Verbindungen über die bereits vorhandenen RPCs angelegt, umbenannt und pausiert.
Das ist keine Vinted-Registrierung und keine Browseranmeldung.

Die API prüft jede Serverantwort vor der Anzeige. Fehlende Kennzahlen bleiben
unbekannt; ein echter Wert `0` bleibt sichtbar. Ein Benutzer-/Workspacewechsel
verbirgt private Daten sofort. Antwortversionen verhindern alte Daten auch beim
Wechsel A → B → A. Dasselbe gilt für Gesprächsverläufe und nachgeladene Seiten.
Alle Anfragen verwenden den vorhandenen Supabase-Client ohne privilegierte Schlüssel.

### Prüfnachweise dieser Fortsetzung

- Antwortprüfung: zunächst fehlgeschlagene Tests, danach 12 erfolgreich.
- API-Anbindung: zunächst 8 fehlgeschlagen, danach 8 erfolgreich.
- Kontozustand: zunächst 13 fehlgeschlagen, danach 13 erfolgreich; ein zusätzlicher
  Gesprächswechseltest reproduzierte eine alte Seitensperre und bestand nach der
  Korrektur (14 Tests).
- Sichtbare Oberfläche: zunächst 7 fehlgeschlagen, danach 8 erfolgreich,
  einschließlich Kontowechsel, Formularspeicherung und strukturellem AXE-Check.
- Guard: 4 Tests erfolgreich; Navigation und Übersetzungen zusammen 20 erfolgreich.
- Typprüfung für App und Tests mit den tatsächlichen Projektpaketen: erfolgreich.
- Der lokale Vollbau endete mit Exitcode 137 an der Speichergrenze. Ein weiterer
  speicherbegrenzter Versuch wurde abgebrochen. Deshalb bleibt ein erfolgreicher
  vollständiger Bau auf dem GitHub-Runner das Freigabekriterium.
- Browser-Prüfung: `e2e/marketplace-accounts.spec.ts`, getrennte Konfiguration
  `e2e/support/marketplace-preview.config.ts`; ausschließlich künstliche Sitzungen
  und HTTP-Antworten. Der Lauf wird gegen den tatsächlichen Angular-Bau geprüft,
  nicht gegen eine nachgebaute HTML-Seite. Bilder und Laufprotokolle bleiben Artefakte.

Für den direkten Wiederholungslauf die Anwendung lokal starten und dann
`npx playwright test --config e2e/support/marketplace-preview.config.ts` ausführen.
Die Konfiguration hat kein globales Anmelde-Setup; kein Benutzerkonto wird benötigt.

### Abgrenzung

Konten und gespeicherte Ansichten sind angebunden. GoLogin-Anmeldung, Liveimport,
Nachrichtenversand und globale Push-Ereignisse bleiben getrennte weitere Schritte.
Es wurden keine Datenbanktabellen, Migrationen oder produktiven Konten geändert.
Die sichtbare Seite ist erst nach separater Veröffentlichung in der laufenden
Flipbase-Installation erreichbar.

---

## Wiederaufnahme: Konten und Datenbankprüfung

**Stand:** Die gespeicherten Arbeiten des unterbrochenen Laufs wurden ab
`f40524aed0f80abb704fc4c7306c1fc76a0f639d` auf demselben Branch weitergeführt.
Die folgenden älteren Abschnitte dokumentieren den ersten Implementierungsstart;
sie sind keine Beschreibung des jetzigen Prüfumfangs.

**Umgesetzt:** Zwei kontogebundene Datenbereiche für Verbindungen und Lesekopien,
RPCs zum Erstellen, Auflisten, Umbenennen und Pausieren von Verbindungen sowie
zum Lesen paginierter Kontodaten. Inhaber und Administratoren des zugehörigen,
nicht archivierten Workspaces erhalten Zugriff. Direkte Schreibzugriffe normaler
angemeldeter Nutzer bleiben gesperrt. Diese Datensätze erstellen kein Vinted-Konto
und melden niemanden bei Vinted an.

**Korrigiert:** Der Migrationsabgleich vergleicht ausschließlich die bestehende
Migrationshistorie mit dem neuen Marktplatzschema in einer wegwerfbaren lokalen
CI-Datenbank. Fremde Änderungen an Einkauf, Produktmedien und Suchfiltern werden
nicht übernommen. Explizite Rechte werden aus dem Schema ergänzt, bevor die
Migration auf einer neu aufgebauten Datenbank getestet wird. Versionierte
Migrationen werden von der Ergänzung abgelehnt.

**Prüfungen auf `c7192319dc118b420b397496ff35af6268a0a8a9`:**

- 59 Vertragstests und 17 Tests zur Migrationserzeugung erfolgreich.
- App- und Test-Typprüfung mit den tatsächlichen Projektabhängigkeiten erfolgreich.
- GitHub-Codejob `108428234801`: Angular-Produktionsbau erfolgreich.
- GitHub-Datenbankjob `108428234848`: Migration erzeugt und vollständig neu
  eingespielt; 31 Marktplatz-Datenbanktests erfolgreich.
- Gesamte Datenbank-Regressionssuite auf dem GitHub-Runner erfolgreich.
- Generierte Datenbanktypen erneut lokal mit App- und Test-TypeScript geprüft.

Der erzeugte Commit `986381c5cecccbf0c6f56234ecb8a9ad580d09fc` enthält die
Migration `20260926150818_marketplace_accounts.sql`, die Schemaregistrierung,
aktualisierte Typen und einen ergänzenden Haupt-Changelog-Eintrag. Der Review
bestätigte ausschließlich Marktplatz-Schemaänderungen; bestehende Typen und
historische Changelog-Einträge wurden nicht entfernt.

Die Änderungen wurden testgetrieben geprüft. Die letzte Ergänzung reproduzierte
zuerst zwei fehlgeschlagene Workflowtests; danach bestanden alle 17 Tests.
Die jeweils geänderten Workflow-/Testdateien bestanden Prettier, ESLint und die
Bash-Syntaxprüfung des Generierungsschritts.

**Prüfumgebung:** Der vollständige Quellstand und die festgeschriebenen
Projektpakete konnten über GitHub-Artefakte lokal gelesen werden. Ein normaler
Git-Clone war weiterhin nicht möglich. Der lokale Angular-Bau wurde mit
Exitcode 137 wegen der Speichergrenze beendet; der oben genannte erfolgreiche
Bau lief deshalb auf GitHub. Die vollständige Angular-/Deno-Testgruppe und die
regulären PR-Pflichtprüfungen sind damit nicht als abgeschlossen ausgewiesen.

**Produktstand:** Noch keine neue Benutzeroberfläche, keine Browsersitzung,
keine produktiven Kontozugriffe, kein Merge und kein Deployment. Als Nächstes
folgen der anbieterunabhängige Sitzungstest und der native Kontobereich gemäß
Plan. Ein erfolgreicher Datenbanktest ist kein Vinted-Livetest.

---

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
