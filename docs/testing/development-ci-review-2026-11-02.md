# Entwicklung und CI vor der Beta entschlacken

Analyse vom 2. November 2026 auf `origin/master` (`d0682bdc`). Die Befunde und
Empfehlungen dokumentieren den Ausgangsstand. Die anschließend beauftragte
Umsetzung steht im letzten Abschnitt; die aktualisierten Regeln stehen in
`AGENTS.md` und den beiden aktuellen Testdokumentationen.

## Ergebnis

Der aktuelle Pflichtumfang ist für kleine Entwicklungsänderungen zu groß.
Die größten Hebel sind die lokale Wiederholung der gesamten CI, die zu schnell
ausgelöste Vollauswahl und die breite Browserregression im normalen PR.
Die fünf Angular-Gruppen sind dagegen aufgeteilte Tests, keine fünf identischen
Komplettläufe. Sie einfach zusammenzulegen würde den Engpass nicht beheben.

Empfohlenes Ziel: während einer Korrektur nur den Fehler und seine direkten
Folgen prüfen; vor dem Merge einen kurzen, risikobezogenen CI-Lauf ausführen.
Breite Geräte-, Layout- und Browsermatrizen bleiben als bewusst gestartete
Regression vor Beta-Meilensteinen verfügbar. Ein zusätzlicher täglicher
Pflichtlauf ist dafür nicht erforderlich.

## Tatsächliche Wartezeit

Die Zeiten stammen aus GitHubs Lauf- und Jobzeitstempeln, nicht aus den
Job-Zeitlimits. Die Stichprobe umfasst vier erfolgreiche PR-Läufe desselben
Tages; sie ist keine langfristige Leistungsstatistik. Gesamtdauer ist die Zeit
vom Laufstart bis zum Abschluss, Jobdauer die Zeit vom jeweiligen Jobstart bis
zu dessen Abschluss. Parallele Jobzeiten dürfen nicht zur Wartezeit addiert werden.

| PR und Änderung                                                                                                      | Gesamtdauer | Langsamster Job                | Größter Angular-Job |
| -------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------ | ------------------- |
| [#538: Kleinanzeigen-Aktionen und Darstellung](https://github.com/GrischaTDev/flipbase/actions/runs/41436305299)     | 30:23 min   | Chromium-Fachgruppe: 27:41 min | 5:12 min            |
| [#543: fehlende Artikel-ID in der SQL-Leseantwort](https://github.com/GrischaTDev/flipbase/actions/runs/41490021932) | 20:00 min   | Layoutgruppe: 18:19 min        | 5:20 min            |
| [#544: kompaktere Oberflächenaktionen](https://github.com/GrischaTDev/flipbase/actions/runs/41503815163)             | 23:01 min   | Chromium-Fachgruppe: 21:43 min | 5:28 min            |
| [#545: Kleiderschrankaktionen und Relisten](https://github.com/GrischaTDev/flipbase/actions/runs/41511412456)        | 19:32 min   | Layoutgruppe: 18:11 min        | 4:48 min            |

Bei #544 liefen 24 Jobs erfolgreich, darunter 13 Anwendungsbrowsergruppen.
Sie verbrauchten zusammen rund 233 Jobminuten. Der langsamste Browserjob
benötigte 50 Sekunden für npm, 25 Sekunden für Chromium, 2:08 Minuten für
Supabase und 17:45 Minuten für den Browserprüfschritt einschließlich Vorschau.
Die langen Tests selbst sind damit der wichtigste Engpass; nur Downloads zu
cachen reicht nicht.

Auch nach dem Merge gibt es einen zweiten Engpass: Im
[Produktionslauf zu #545](https://github.com/GrischaTDev/flipbase/actions/runs/41514776997)
war die Webauslieferung nach rund 3:25 Minuten abgeschlossen, der gesamte Lauf
erst nach 19:11 Minuten. Der Marketplace-Veröffentlichungsjob dauerte 14:02
Minuten; davon entfielen 9:52 Minuten auf die erneuten lokalen Erweiterungs- und
Workerbrowserprüfungen. PR-Freigabe und vollständige Marketplace-Auslieferung
sind daher als getrennte Wartezeiten zu betrachten.

## Ursachen im Projekt

### 1. Die lokale Pflicht bildet die CI nochmals nach

`AGENTS.md` verlangt vor jedem Push den tatsächlichen Preflight. Dessen
`runPreflight` in `scripts/preflight.mjs` führt die ausgewählten CI-Gruppen
nacheinander aus und setzt auch lokal `CI=true`. Jeder Anwendungsbrowseraufruf
startet über `playwright.config.ts` eine neue Vorschau. Anschließend laufen die
ausgewählten Prüfungen auf GitHub erneut.

Das erklärt lange Chat-Sitzungen zusätzlich zur PR-Wartezeit. Der Bedarf an
Docker, PowerShell, Deno und passendem Datenbankstand führt außerdem zu lokaler
Einrichtungsarbeit. Bei ausgewählten privilegierten Marketplace-Imageprüfungen
bricht der lokale Gesamtaufruf sogar absichtlich vor allen Prüfkommandos ab;
diese dürfen ausschließlich auf einem wegwerfbaren GitHub-Linux-Runner laufen.
Die dokumentierten lokalen Ersatznachweise bleiben anschließend umfangreich.

**Änderungsvorschlag:** Einen lokalen Entwicklungsumfang vom verbindlichen
CI-Freigabeumfang trennen. Lokal den Fehler reproduzieren, passende Tests und
den betroffenen Ablauf prüfen; abschließend Format/Lint sowie bei Bedarf
Typprüfung und Angular-Bau. Die breite CI nicht vor jedem Push nachbauen.
Eine gemeinsame Auswahl kann bestehen bleiben, ohne überall dieselbe
Ausführungspflicht aufzuerlegen. Dafür müssen `AGENTS.md`, Preflight und
Testdokumentation gemeinsam angepasst werden.

### 2. Ein gemeinsamer Button löst die Vollauswahl aus

`scripts/affected-tests.mjs` verfolgt Rückwärtsimports bis zu globalen Wurzeln.
Bei #544 genügt bereits dieser Weg:

```text
button.component.ts → push-navigation-notice.component.ts → src/app/app.ts
```

Damit wird `full=true`. Die historische Auswahl des PR-Stands `ff96e6b6`
enthält 239 Node-, 48 DOM- und 279 Angular-Testdateien, sieben Unitjobs,
13 Browserjobs sowie PWA. Die Selektorimplementierung ist zwischen diesem
PR-Stand und der analysierten Hauptversion unverändert. Eine isolierte Änderung
am Marktplatz-Abschnittstemplate bleibt dagegen gezielt; die Auswahl funktioniert
also grundsätzlich, eskaliert bei gemeinsamen Komponenten aber zu schnell.

Außerdem gilt jede Datei unter `layout/` und `supabase/` unmittelbar als global.
Das erklärt, weshalb auch eine kleine SQL-Lesekorrektur die Frontend-Vollauswahl
und PWA auslösen kann. Selbst ohne Vollauswahl kann ein visueller Baustein PWA
aktivieren, sobald ein Rückwärtsimport zum Offline-Einkaufsformular führt.

**Änderungsvorschlag:** Gemeinsame visuelle Komponenten mit ihren eigenen Tests
und repräsentativen Verbrauchern absichern. Der bloße Import durch die Appwurzel
darf nicht jeden Hover-Fix zu einer Vollregression einschließlich PWA machen.
Unitumfang, Browserumfang, PWA, Datenbank, Marketplace und Landing müssen getrennt
entschieden werden, statt dieselbe Vollauswahl ungeprüft auf alle zu übertragen.
Änderungen an Anmeldung, Berechtigungen, Startlogik und globaler technischer
Konfiguration benötigen weiterhin einen passend breiten Umfang. Die neuen
Auswahlregeln selbst müssen durch konkrete Selektortests abgesichert werden.

### 3. Der Browser-Smoke ist eine umfangreiche Regression

`docs/testing/lean-ci.md` beschreibt bereits 20 Kernfälle und 186 zusätzliche
Layoutfälle vor weiteren Fachfällen. Die Aufteilung auf sechs bis neun
Chromium-Gruppen reduziert deren Umfang nicht. Direkt geänderte Browserdateien
laufen vollständig, auch wenn nur eine kleine Erwartung geändert wurde.

**Änderungsvorschlag:** Einen ausdrücklich kleinen PR-Kern festlegen, zunächst
etwa fünf bis zehn zentrale Abläufe, ergänzt um den betroffenen Fehlerfall.
Normale Fachänderungen benötigen keinen allgemeinen Rundgang durch alle Seiten.
Mobile Breite, Touch, Dunkelmodus, Tastatur und AXE nach Änderungsrisiko auswählen;
die vollständige Kombination aller Varianten gehört nicht in jeden Fix.
Bei geänderten gemeinsamen Controls gezielt deren Bedienung und repräsentative
Verbraucher prüfen. Vor einer Beta-Freigabe die breite Regression bewusst starten.

### 4. Reine Oberflächentests starten echte Datenbanken

Jede reguläre Browsergruppe installiert Pakete und Browser, startet Supabase
und legt über das globale Setup ein Testkonto an. Mehrere Layout- und
Marktplatzdateien verwenden anschließend ohnehin abgefangene API-Antworten.
`e2e/settings-layout.spec.ts` nutzt beispielsweise `mockMarketplace` und einen
leeren Sitzungsstand.

Mit `e2e/support/marketplace-preview.config.ts` gibt es bereits eine eigene
Konfiguration für 14 Mock-/Layoutdateien ohne echte Anmeldung und globales Setup.
Sie ist noch kein Ersatz für eine sauber registrierte CI-Auswahl, zeigt aber,
dass die Trennung mit dem vorhandenen Stack möglich ist.

**Änderungsvorschlag:** UI-Fixtures ohne Datenbank ausführen; echte Anmeldung,
API-/RLS-Verträge und Speichervorgänge in getrennten Integrationsfällen behalten.
Ein gemockter Test wird dabei ausdrücklich nicht als Datenbanknachweis ausgegeben.
Nach der Umfangskürzung weniger Browserjobs und eine unverändert bereitgestellte
Vorschau nutzen; Parallelität anhand tatsächlicher Laufzeiten bestimmen.

### 5. Zusatzprüfungen sind zu breit gekoppelt

Die Vollauswahl aktiviert PWA. `scripts/build-pwa-test-builds.mjs` baut dafür
einen historischen Vorgänger mit eigener Paketinstallation und zwei aktuelle
Versionen. Der Qualitätsjob führt auch für UI-Änderungen sämtliche Workflow-
und Deploymentverträge sowie das Suite-Audit aus. Bei #544 dauerte Quality
7:27 Minuten, davon 4:54 Minuten für Format, Lint, Typen und Workflowverträge
zusammen. Dieser Sammelschritt erlaubt keine genauere Schuldzuweisung an einen
einzelnen dieser Befehle.

**Änderungsvorschlag:** PWA nur bei tatsächlichen Änderungen an Update, Cache,
Offlineverhalten und betroffenen Start-/Sitzungsgrenzen. Workflow-/Deploymenttests
bei Änderungen ihrer Skripte, Konfiguration oder Abhängigkeiten. Format und
Lint beibehalten; für reine Dokumentation keinen Anwendungsbau auslösen.
Geänderte Testregistrierung weiterhin prüfen.

### 6. Nach dem Merge wird teilweise nochmals breit geprüft

Die vorhandene Wiederverwendung erfolgreicher PR-Nachweise funktioniert für
passende identische Git-Dateistände. Sie gilt aber nicht automatisch für
`marketplace-image-publish.yml`: Der Veröffentlichungsjob wählt mit
`selectMarketplaceChecks(null)` nochmals alle Marketplace-Fälle und prüft
Images erneut.

**Änderungsvorschlag für einen zweiten Schritt:** Geprüfte unveränderliche
Artefakte und Image-Digests zur Veröffentlichung übernehmen. Dafür müssen
Git-Dateistand, konkrete Testauswahl, Laufzeit und Herkunft nachweislich passen;
ein beliebiger älterer grüner Lauf genügt nicht. Registryrechte bleiben auf
`master`, und Image-Isolation, Migration/Backup sowie öffentliche
Auslieferungsprüfung bleiben erhalten.

## Vorgeschlagener Ablauf

| Anlass                             | Lokal während der Arbeit                                            | Pflicht vor Merge                                                                              |
| ---------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Text oder Dokumentation            | Inhalt und betroffene Formatierung                                  | Format/Lint gemäß vereinbarter Dokumentationsregel; keine Anwendungssuite                      |
| Kleiner UI-Fix                     | Fehler reproduzieren, passende Komponentenfälle, betroffener Ablauf | Qualität, nötiger Angular-Bau, betroffene Tests; kleine passende Browserauswahl                |
| Fachlogik oder Speicherung         | Modell-/Servicefälle und konkrete Fehlerkombination                 | Betroffene Unit-/Integrationstests und ein relevanter durchgehender Ablauf                     |
| Gemeinsames Control                | Eigene Bedienungsfälle und repräsentative Verbraucher               | Passende Layout-/Tastatur-/Touch-/AXE-Fälle statt aller Fachseiten                             |
| Kontentrennung, RLS oder Migration | Rechte-/Datenintegritätsfälle                                       | Passende SQL-, Integrations- und Kontengrenzprüfungen vor Merge                                |
| Anbieter-Schreibweg                | Synthetischer realitätsnaher Fehlerfall                             | Betroffene native Browserfälle, Schutz vor Doppelaktionen, Originalbild-/Gebühren-/Kontoschutz |
| PWA-Lebenszyklus                   | Betroffene Update-/Offlineprobe                                     | Produktions-PWA einschließlich relevanter Vorgängerversion                                     |
| Beta-Meilenstein                   | Kein täglicher Pflichtnachbau                                       | Bewusst gestartete breite Regression einschließlich zusätzlicher Browser/Geräte                |

Als Arbeitsziel sind ein bis drei Minuten für die normale lokale Rückmeldung
und fünf bis acht Minuten für einen normalen kleinen UI-PR sinnvoll. Das sind
Zielbudgets, keine bereits gemessene Beschleunigung oder Zusage für Schema-,
PWA- und Anbieteränderungen. Der heutige Qualitätsjob liegt teilweise bereits
an dieser PR-Grenze und muss deshalb ebenfalls gezielt vermessen werden.

## Reihenfolge der Umsetzung und Abnahme

1. Lokale Entwicklungsprüfung und CI-Freigabe trennen; Projektregeln und
   Befehle konsistent ändern. Unveränderte bestandene Bereiche nicht wiederholen.
2. Rückwärtsimport-Eskalation begrenzen und durch historische Beispiele wie
   #544 absichern. Ein Button-Hover-Fix darf keine PWA-/Gesamtbrowserauswahl erzeugen.
3. Kleinen PR-Kern und betroffene Fachfälle von der breiten Regression trennen;
   UI-Fixtures ohne Supabase registrieren. Echte Integrationsfälle erhalten.
4. PWA- und Workflowtests präzise auswählen. Erst danach Build-/Artefaktwiederverwendung
   und Marketplace-Veröffentlichung optimieren.
5. Vorher/nachher dieselben Änderungsklassen messen: lokale Wartezeit,
   PR-Gesamtdauer, langsamster Job, gesamte Jobminuten und später entdeckte Fehler.
   Kein Erfolg allein durch weniger sichtbare Jobnamen oder höhere Zeitlimits.

Keine neuen Frameworks, Backends oder Hauptversionswechsel sind dafür nötig.
`quality-nightly.yml` läuft derzeit ausdrücklich nur manuell; es existiert kein
heimlicher Nachtlauf, der zuerst abgeschaltet werden müsste. Auch npm-Downloadcache,
Abbruch überholter PR-Läufe und PR-Nachweiswiederverwendung sind bereits vorhanden.

## Weniger Prüfungen mit besserem Fehlersignal

Die bisherigen vielen Fälle garantieren keine realistische Anbieterabdeckung.
[PR #543](https://github.com/GrischaTDev/flipbase/pull/543) dokumentiert, dass
Browser-Fixtures die fehlende externe Artikel-ID bereits enthielten und dadurch
den tatsächlichen SQL-Vertragsfehler verdeckten. Der
[Kleinanzeigen-Fix #538](https://github.com/GrischaTDev/flipbase/pull/538)
beschreibt einen echten Löschbutton, dessen Text von der synthetischen Fixture
abwich. Ein passender Antwort-/DOM-Vertragsfall hilft hier mehr als dieselbe
unrealistische Fixture in zusätzlichen Bildschirmgrößen.

Die Kürzung verschiebt einen Teil unerwarteter Wechselwirkungen in die spätere
breite Regression. Dieses Restrisiko ist bewusst zu akzeptieren; fehlerfreie
Features lassen sich nicht garantieren. Kontentrennung, Geldbeträge, Datenverlust,
Originalbilder und sichere externe Schreibaktionen bleiben vor dem Merge geschützt.

## Einordnung durch offizielle Quellen

- [Google Testing Blog](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html):
  viele schnelle gezielte Tests, wenige durchgehende Browserabläufe. Die bekannte
  Testpyramide ist eine Orientierung, keine einzuhaltende Prozentquote.
- [Vitest CLI](https://vitest.dev/guide/cli.html#vitest-related): gezielte Dateien,
  `related` und `--changed` sind vorhanden. Statische Imports ersetzen keine
  fachliche Auswahl für Angular-HTML, Styles und dynamische Abhängigkeiten.
- [Playwright-Projekte](https://playwright.dev/docs/test-projects): Browser,
  Geräte und Testauswahl können getrennt ausgeführt werden. Daraus folgt keine
  Pflicht, jede Variante bei jeder Änderung zu starten.
- [Playwright CI](https://playwright.dev/docs/ci): benötigte Browser gezielt
  installieren; Ressourcen und Shards beachten. Browsercache wird nicht pauschal
  als Beschleunigung empfohlen.
- [setup-node](https://github.com/actions/setup-node#caching-global-packages-data):
  der npm-Cache speichert Paketdownloads, nicht `node_modules`; die Installation
  pro Job bleibt ein Aufwand.

## Nachweis und Grenzen dieser Analyse

GitHub wurde frisch abgerufen. Workflows, Auswahlskripte, aktuelle Arbeitsregeln
und relevante Browser-Fixtures wurden gelesen; die Job- und Schrittzeiten von
vier PR- und zwei Produktionsläufen wurden über die GitHub-API ausgewertet.
Die Auswahl von #544 wurde aus dessen historischen Git-Blobs rekonstruiert,
ohne eine fremde Arbeitskopie zu verändern. Diese Auswahlberechnung auf dem
vorhandenen Node 26 ist kein Anwendungstest oder Node-22-CI-Nachweis.

Private Rohmessungen und die historische Auswahl liegen im lokalen Ordner
`ci-audit` des Analyseartefakts. Für die reinen Dokumentationsänderungen werden
Formatierung und Git-Diff geprüft; Anwendungstests, Builds und die vollständige
CI wurden für die reine Analyse nicht gestartet. Die Umsetzung wird getrennt
geprüft; einen nachfolgenden GitHub-Lauf gibt es vor dem Push noch nicht.

## Beauftragte Umsetzung

- Der lokale Standardpreflight prüft Qualität, passende Skriptverträge und
  tatsächlich betroffene Units; je Suite nur ein Aufruf. Bei generischen Controls
  prüft er deren eigene Unitverträge, während CI zusätzlich alle abhängigen
  Komponenten prüft. Angular-Quelländerungen behalten den nötigen Bau.
- `--ci` beziehungsweise `--full` wählt ausdrücklich den vollständigen
  Integrationsumfang. `--native` ergänzt lokal die ausgewählten nativen
  Anbieterbrowser. Die übrigen CI-Nachweise bleiben im Plan sichtbar.
- Der allgemeine PR-Kern enthält acht Fälle. Gemeinsame generische Controls
  erhalten sechs explizite UI-Verbraucher mit Touch und Hell/Dunkel. Die
  Produktgalerie bleibt dagegen mit ihren eigenen Fachfällen verbunden.
- Die 14 geprüften UI-Fixturedateien laufen ohne Datenbank/globales Authsetup.
  Echte Backendgruppen behalten beides. Direkt geänderte Browserdateien bleiben
  vollständig; normale Fachauswahlen reduzieren bekannte Wiederholungsfamilien.
- PWA, Marketplace, Landing und Workflowverträge werden getrennt ausgewählt.
  Ein Buttonimport durch einen PWA-Hinweis aktiviert keine PWA-Vollprüfung mehr.
  Auth-/Startgrenzen, SQL-/Datenintegrität und Image-Isolation bleiben passend
  in der verbindlichen CI ausgewählt. Die spätere Wiederverwendung geprüfter
  Marketplace-Imageartefakte gehört zu einem gesonderten zweiten Schritt.

Die Neuberechnung derselben Änderungspfade aus #544 auf dem aktuellen Quellbaum
wählt vier statt 13 Browsergruppen und keine Produktions-PWA. Drei dieser vier
Gruppen benötigen keine Datenbank. Die Unitdateiauswahl sinkt von 566 auf 163
Dateien; lokal bleiben elf gezielte Unitdateien. Ein einzelner Buttonpfad wählt
lokal genau seine eine Angular-Testdatei und in CI weiterhin die 163 abhängigen
Unitdateien sowie sechs gemeinsame UI-Fälle. Eine Marktplatz-Templateänderung
wählt eine Node- und vier Angular-Dateien sowie eine datenbankfreie UI-Gruppe.

Dies ist ein Vergleich der Auswahl, keine gemessene neue PR-Gesamtdauer. Die
vorherige exakte Rekonstruktion benutzt historische Dateien; der Nachhervergleich
benutzt ausdrücklich den aktuellen Baum und dieselben historischen Pfade.

Der abschließende lokale Preflight besteht unter Node 22.23.4 in 136,7 Sekunden:
Format, Lint, Typen, Suite-Audit, Actionlint und 172 Skriptfälle erfolgreich.
Zwei bestehende Linux-SSH-Fälle bleiben als solche gekennzeichnet in CI.
Die sechs echten datenbankfreien UI-Fälle bestehen in 32,7 Sekunden gegen eine
eigene ruhende Vorschau, einschließlich Touch und Hell/Dunkel. Ein gesonderter
Auflistungsvergleich bestätigt sämtliche 31 direkt geänderten Galeriefälle.
Der vorangegangene Windows-Pfadfehler ist mit echtem Git-Kindprozess aus npm
abgesichert; die beiden Infrastruktur-Vertragsdateien bleiben vollständig in
der CI registriert. Eine vollständige GitHub-Freigabe wird daraus nicht abgeleitet.
