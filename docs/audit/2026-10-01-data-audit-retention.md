# Datenexport, Änderungsnachweise und Aufbewahrung

Stand: 1. Oktober 2026. Geprüfte Codebasis: `e753200e8a5aac72945e0af150fd8e4b80dff544`.

## Ergebnis

Die normale Einstellungsseite kann auf Datenexport reduziert werden. Eine ständig sichtbare globale Liste aller Änderungen ist in den geprüften Rechtsgrundlagen nicht vorgeschrieben. Erforderliche Einzelinformationen müssen trotzdem während der Aufbewahrung lesbar und für Prüfungen zugänglich bleiben. Ein Export ersetzt weder die Speicherung der notwendigen Nachweise noch sämtliche gesetzlich möglichen Zugriffsarten.

Empfohlenes Ziel: eine einfache Exportseite, vollständige lesbare und maschinell auswertbare Nachweise bei Bedarf, kleine Änderungen statt wiederholter Vollkopien sowie begründete Aufbewahrungs- und Löschregeln. Diese Untersuchung ist eine technische Einordnung anhand amtlicher Quellen, keine verbindliche rechtliche Abnahme des konkreten Buchführungsverfahrens.

## Rechtliche Grenzen

- [§ 146 Abs. 4 AO](https://www.gesetze-im-internet.de/ao_1977/__146.html): Ursprüngliche Inhalte steuerlicher Buchungen und Aufzeichnungen müssen nach Änderungen feststellbar bleiben.
- [GoBD im amtlichen AO-Handbuch 2026](https://amtliche-handbuecher.bundesfinanzministerium.de/ao/2026/Anhaenge/BMF-Schreiben-und-gleichlautende-Laendererlasse/Anhang-33/anhang-33.html), insbesondere Rz. 59, 84, 107–111: Der relevante Nachweis kann schon vor dem ausdrücklich bezeichneten Abschluss beginnen. Die Bezeichnung „Entwurf“ allein erlaubt deshalb keine unprotokollierte Änderung oder pauschale Löschung. Rz. 111 berücksichtigt auch steuerrelevante Steuerungs- und Stammdaten. Nicht jede Bedienhandlung ist damit aufbewahrungspflichtig.
- [§ 147 Abs. 2, 5 und 6 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html): Erforderliche Daten müssen verfügbar, lesbar und maschinell auswertbar bleiben. Die Finanzverwaltung kann Einsicht, Auswertungen oder Datenüberlassung verlangen. Ein technisch unverständlicher JSON-Download allein gewährleistet diese Anforderungen nicht.
- [§ 147 Abs. 3 und 4 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html): Grundsätzlich zehn Jahre für Bücher/Aufzeichnungen, acht Jahre für Buchungsbelege und sechs Jahre für sonstige dort genannte Unterlagen. Fristbeginn regelmäßig am Ende des maßgeblichen Kalenderjahres; steuerliche Sachverhalte können den Ablauf verlängern. Änderungsnachweise dürfen nicht unabhängig von den Unterlagen gelöscht werden, deren Verständnis sie sichern. Die genaue Zuordnung muss anhand des tatsächlichen Verfahrens erfolgen.
- [DSGVO, Art. 5 Abs. 1 Buchstaben c und e](https://eur-lex.europa.eu/legal-content/DE/TXT/PDF/?uri=CELEX:32016R0679): Personenbezogene Daten auf den erforderlichen Umfang und die erforderliche Dauer beschränken. Für entbehrliche Historie ist eine unbegrenzte Speicherung daher kein sinnvoller Standard. Eine gesetzliche Aufbewahrungspflicht bleibt zu berücksichtigen.

## Tatsächlich gemessener Stand

Nur lesende Produktionsabfragen; keine Kundennamen, Inhalte von Belegen, Adressen oder Kontodaten ausgegeben. Abfrage in einer Read-only-Transaktion mit zehn Sekunden Zeitlimit.

| Bereich                                     | Einträge | Größe einschließlich Indizes |
| ------------------------------------------- | -------: | ---------------------------: |
| Geschäftsereignisse (`business_events`)     |      172 |      344.064 Bytes / 336 KiB |
| Ältere Artikelaktivitäten (`activity_logs`) |       15 |        65.536 Bytes / 64 KiB |
| Summe                                       |      187 |      409.600 Bytes / 400 KiB |

Geschäftsereignisse enthalten durchschnittlich rund 802 Bytes Änderungsdaten; der größte gemessene Inhalt umfasst 2.106 Bytes. 71 Ereignisse stammen aus den letzten sieben Tagen. 46 Änderungen von Einkaufsentwürfen enthalten im Mittel 1.380 Bytes Änderungsdaten; 24 Entwurfserstellungen im Mittel 1.257 Bytes. 31 Einkaufsabschlüsse liegen im Mittel bei 298 Bytes. Die Messung beschreibt den aktuellen kleinen Bestand und prognostiziert keine langfristige Auslastung.

Reines Rechenbeispiel: 100 täglich aktive Nutzer mit je 20 Ereignissen ergeben 730.000 Ereignisse im Jahr. Bei angenommenen 2 kB je Ereignis wären das rund 1,46 GB jährlich, ohne zusätzliche Sicherungskopien und ohne eine belastbare Aussage über zukünftige Zeilengrößen. Große Paketkäufe können deutlich mehr Daten erzeugen. Nutzerzahl allein ist kein brauchbares Speicherlimit.

## Konkrete Probleme im aktuellen Code

1. `data-and-audit.component.html` zeigt Ereigniscodes und Datensatzkennungen. `formattedChanges()` gibt die Nutzlast als JSON aus. Das ist keine verständliche Nutzeransicht.
2. `update_purchase_draft()` in `220_purchase_open_prices.sql` speichert bei einer tatsächlichen Änderung vollständige Vorher-/Nachher-Pakete für Einkauf, Positionen und Kosten. Ein unveränderter Aufruf erzeugt dort bereits keinen Eintrag. Einsparpotenzial besteht vor allem bei der Nutzlast, nicht beim pauschalen Abschalten aller Änderungsnachweise.
3. `business_events` blockiert Änderungen, Löschungen und Truncate. Im geprüften Repository gibt es keine fristgesteuerte Bereinigung dieses Journals. Unveränderbarkeit während der erforderlichen Aufbewahrung wird umgesetzt; deren späteres Ende bisher nicht.
4. Parallel existiert `activity_logs` für Artikelstatus und Kostenaktionen. Ob einzelne Nachweise doppelt vorliegen, muss pro Schreibweg geprüft werden. Der ganze Bestand ist nicht als reine technische Historie qualifiziert.
5. Workspace-Löschung wird bereits durch beliebige Geschäftsereignisse verhindert. Damit reicht beispielsweise eine frühere Archivierung als dauerhafter Löschhinderungsgrund. Das ist eine technische Schutzentscheidung, kein Beweis einer gesetzlichen Pflicht für genau dieses Ereignis.
6. Der vollständige Export aus `60_audit_snapshot.sql` wird bei insgesamt über 100.000 Datensätzen oder über 50 MiB JSON pro Workspace abgebrochen. Das verhindert übergroße Einzelantworten, begrenzt aber nicht die Speicherung. Für dauerhaft wachsende Daten ist dieser Exportweg noch nicht ausreichend.
7. Unternehmensänderungen speichern bereits nur die Namen geänderter Felder. Nicht alle Ereignisse sind große Vollkopien. Notwendige historische Belegdaten liegen zusätzlich in den jeweiligen Dokument-Snapshots.

## Vorschlag für den minimalen Umfang

Diese Tabelle ist eine Arbeitsgrundlage. Sie autorisiert keine Löschung vorhandener Daten.

| Bereich                                                                                          | Vorgeschlagene Behandlung                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beträge, Mengen, Kostenverteilung, Steuerverfahren, geschäftlich relevante Daten und Zuordnungen | Erforderlichen Originalzustand und jede relevante spätere Änderung erhalten; geänderte Werte statt kompletter unveränderter Datensätze speichern      |
| Verkauf, Storno, Retoure, Erstattung, Bestandskorrektur                                          | Buchungs- und Bestandsnachweise mit nachvollziehbarer Verbindung zur Originalbuchung erhalten                                                         |
| Hinzufügen/Entfernen oder Ersetzen von Belegen                                                   | Nachweis und erforderliche Originaldateien mit passenden Beziehungen erhalten                                                                         |
| Unternehmens- und Systemeinstellungen                                                            | Nur notwendige Steuerungsdaten und historische Dokumentquellen qualifizieren; aktuelle Profilpflege nicht pauschal als vollständig löschbar behandeln |
| Einkaufsentwürfe                                                                                 | Tatsächliche Beleg-/Aufzeichnungsfunktion beurteilen; Pflichtnachweise erhalten, redundante Vollkopien durch rekonstruierbare Änderungen ersetzen     |
| Technische Abrufe, unveränderte Wiederholungen, Oberfläche, Cache, Diagnose                      | Nur bei begründetem Zweck speichern; wo entbehrlich, gar kein dauerhafter Geschäftsprotokolleintrag                                                   |
| Versandstatus und Sendungsnummern                                                                | Wiederholungen vermeiden; benötigte Liefer-/Geschäftsnachweise behalten, reine technische Abrufhistorie separat behandeln                             |
| Export-, Archivierungs- und sonstige Betriebsereignisse                                          | Konkreten Sicherheits-/Betriebszweck prüfen; ohne Buchführungsfunktion nicht automatisch dauerhaftes Löschhindernis                                   |

Für optionalen Verlauf und technische Diagnose sind beispielsweise 30 oder 90 Tage mögliche Produktentscheidungen, keine pauschal gesetzlich vorgeschriebenen Fristen. Die Entscheidung muss zum dokumentierten Zweck passen. Nachweise mit ungeklärter Einstufung bleiben bis zur Klärung erhalten.

## Konkrete Umsetzungspakete

### 1. Einfache Exportseite und nutzbares Archiv

- Globale Rohdatenliste, technische Filter und „Änderungen anzeigen“ von der normalen Seite entfernen.
- Einen klaren Hauptexport anbieten; zusätzliche CSV-Formate nur bei tatsächlichem Nutzerbedarf behalten.
- Im Archiv lesbare Übersicht und verständliche Feld-/Statusbeschreibungen zusätzlich zu den maschinell auswertbaren Daten liefern. Notwendige Detailinformationen vollständig erhalten.
- Bestehende lesbare Belegansichten und Zugriffsrechte erhalten. Für eine Prüfung erforderliche Einsicht/Auswertung weiterhin ermöglichen.
- Export auch für große Workspaces aus einem konsistenten Stand ermöglichen; aktuelle Grenzen durch einen serverseitigen Exportlauf oder konsistente Teilarchive ersetzen. Nicht bloß ohne Konsistenzschutz mehrere Seiten zusammenfügen.

### 2. Weniger gespeicherte Daten

- Alle tatsächlichen Ereignisschreibwege erfassen und den Zweck jedes Ereignisses dokumentieren.
- Relevante Änderungsfelder speichern; Ausgangsstand und nötige Beziehungen für vollständige Rekonstruktion erhalten.
- Keine Ereignisse für unveränderte Wiederholungen. Vorhandene Entwurf-/Tracking-Prüfungen beibehalten.
- Optionale Historie von erforderlichen Geschäftsereignissen unterscheiden; doppelte Artikelaktivitäten erst nach nachgewiesener vollständiger Abdeckung abbauen.
- Bereits vorhandene Pflichtnachweise nicht still nachträglich kürzen oder überschreiben.

### 3. Begrenzte Aufbewahrung und Archivierung

- Zweck, Kategorie, zugehörige Unterlagen, Fristberechnung und Sperrgründe pro Nachweis festlegen. Kein einheitliches „alle Ereignisse nach 90 Tagen löschen“.
- Technische Historie nach ihrer begründeten Frist automatisch in kleinen Batches löschen.
- Erforderliche Geschäftsarchive können aus der aktiven Datenbank in ein geprüftes Archiv ausgelagert werden, wenn Vollständigkeit, Integrität, Lesbarkeit, Zugriff und Wiederherstellung gesichert bleiben. Ein Nutzerdownload ist kein belastbarer serverseitiger Archivierungsnachweis.
- Erst nach tatsächlichem Ablauf aller einschlägigen Fristen und ohne laufende Sperrgründe endgültig bereinigen. Abhängigkeiten und Sicherungskopien im Löschkonzept berücksichtigen.
- Die spätere Bereinigung als begrenzten internen Serverweg umsetzen. Normale Nutzer dürfen keine Geschäftshistorie manipulieren oder Schutzschalter setzen.

### 4. Betrieb und Prüfungen

- Größe, tägliches Wachstum und größte Nutzlasten messen; Warnungen vor Speicher- und Exportgrenzen.
- Export-/Rekonstruktionsprüfungen, Rollen-/Workspace-Isolation und unveränderbare historische Belege prüfen.
- Fristtests mit Jahresende, Korrekturen, abhängigen Belegen, Sperrgründen und wiederholter Bereinigung.
- Schema deklarativ ändern, Migration erzeugen, Typen neu generieren und Datenbanktests ausführen. Veröffentlichung erst über einen geprüften PR.

## Vor endgültiger Löschfreigabe zu klären

- Welche Flipbase-Einkaufszustände bereits Beleg- oder Grundaufzeichnungsfunktion erfüllen.
- Welche Felder und Begleitdaten für Bestand, Kostenrechnung und Besteuerung tatsächlich erforderlich sind.
- Zuordnung der Nachweise zu den jeweiligen gesetzlichen Fristen und deren Startdatum.
- Verantwortlichkeiten und Zugänglichkeit bei Kündigung, Workspace-Löschung und ausgelagerten Archiven.

Diese Fragen benötigen eine Beurteilung des konkreten Buchführungsverfahrens, gegebenenfalls mit Steuerberatung. Die Prüfung anhand der amtlichen Quellen liefert keinen pauschalen Freibrief zur Löschung. Die sichtbare technische Liste kann unabhängig davon vereinfacht werden.

## Ausgeführte Prüfung

Die erste Etappe wurde auf dem eigenen Zweig `juna/data-audit-retention` umgesetzt:

- Die Einstellungsseite heißt „Datenexport“ und bietet einen Gesamtexport. Globale Rohdatenliste, technische Filter, JSON-Dialog und zusätzliche Teil-CSV-Aktionen sind entfernt. Die bestehende belegbezogene Chronik und Druckansicht bleiben erhalten.
- Das ZIP enthält zusätzlich `changes.html` und `README.txt`; vorhandene maschinenlesbare Dateien und Originalbelege bleiben enthalten. Titelwechsel, Mengen, Preise und hinzugefügte/entfernte Positionen sind lesbar. Vollständige Einkaufsstände können zusätzlich aufgeklappt werden. Fehlende Originaldateien bleiben ausdrücklich ausgewiesen. Das Manifest hat Version 1.5.0 und prüft auch die neuen Dateien.
- Neue Einkaufsentwurfsänderungen entfernen redundante Werte nur bei nachgewiesen identischem Vorherzustand. Listen behalten die Anzahl identischer Einträge. Unveränderte Wiederholungen erzeugen weiterhin keinen zusätzlichen Eintrag. Historische Ereignisse werden nicht verändert.
- `audit_snapshot` in neuen Ereignissen beschreibt vollständige Stände und kompakte Änderungen. Eine konkrete `basis_event_id` verbindet jede kompakte Änderung mit einem bereits gespeicherten identischen Stand desselben Einkaufs/Workspace. Interne SHA-256-Werte vergleichen vollständige PostgreSQL-Schnappschüsse; sie sind wegen möglicher JSON-Zahlen-/Formatnormalisierung keine externen Dateiprüfsummen. Die Rekonstruktion über Basiskennungen ist im Archiv erklärt.
- Ein vollständiges späteres Update darf ebenfalls als neue Ausgangsbasis dienen. Das erweitert bewusst den ursprünglichen Vorschlag mit ausschließlich Erstellungsbaselines: Alte Ereignisse ohne Formatmarker, unabhängige Kosten-/Verkäuferänderungen oder neue Schemafelder erzwingen zunächst eine neue Vollkopie. Erst danach sind wieder kompakte Änderungen möglich. Die bloße Existenz eines früheren Erstellungsereignisses genügt nicht.
- Workspace-/Rechtewechsel und Abbruch verhindern veraltete Downloads. Sprechende Artikelnamen ersetzen irreführende Positionsnummern in der Entwurfschronik. Beschreibungen und Versionsfuß des Einstellungsrahmens verwenden den kontraststarken vorhandenen Textfarbwert.

Die neue Migration wurde mit dem bestehenden CLI-/migra-Abgleich gegen den historischen Migrationsstand in einer eigenen lokalen Datenbank erzeugt. Migra lässt Funktionsrechte und Kommentare aus; sie wurden automatisch aus dem deklarativen Schema ergänzt. Die endgültige Migration wurde durch vollständigen lokalen Neuaufbau geprüft. Vorhandene Migrationen bleiben unverändert; Datenbanktypen sind neu erzeugt. Die Sicherheitsprüfung des lokalen Backends meldet keine Befunde.

Das unabhängige Review fand eine Rekonstruktionslücke durch Änderungen außerhalb des Entwurfsformulars sowie fehlende lesbare Positionsdetails. Beide wurden behoben. Die vorher fehlschlagenden Zustandsprüfungen bestehen mit der neuen Basisprüfung. 2.375 Datenbankprüfungen in 71 Dateien sowie 64 gezielte Anwendungstests und 11 Angular-Tests sind erfolgreich. Der echte Browserfall prüft Export, Originaldaten, kompakte Nutzlast, Offlineansicht, mobile Breite und automatische WCAG-AA-Prüfungen. Die PR-Pflichtauswahl enthält diesen Fall und wird durch ihren Auswahlvertrag geprüft.

### Noch offen

- Die Grenze von 100.000 Datensätzen beziehungsweise 50 MiB Snapshot-JSON besteht weiter. Dieses Paket liefert keinen neuen serverseitigen Exportlauf für größere Bestände.
- Keine automatische Journalbereinigung oder neue Löschfrist wurde eingeführt. Kategorien, Aufbewahrungsbeginn, abhängige Unterlagen und Sperrgründe bleiben vor einer Lösch-/Archivierungslösung zu klären.
- Ereigniszwecke außerhalb von Einkaufsentwürfen und mögliche Doppelungen von Artikelaktivitäten sind noch einzeln zu prüfen. Die neue Entwurfskompaktierung ist kein allgemeines Speicherlimit.

Typprüfung, Produktionsbau, gezieltes ESLint, Formatprüfung und Git-Diff-Prüfung sind erfolgreich. Der Browserfall besteht mit Desktop/Handy in beiden Farbschemata und jeweils ohne automatische WCAG-AA-Befunde. Die abschließende Gegenprüfung bestätigt die geschlossenen Reviewpunkte. Der Bau meldet lediglich die vorhandene CommonJS-Optimierungswarnung für `pako` aus `pdf-lib`.

Die Produktionsmessung blieb ausschließlich lesend. Das Umsetzungspaket ist lokal vorbereitet; die Veröffentlichung erfolgt erst nach Freigabe über einen geprüften PR. Die Quellenprüfung und diese technische Etappe bestätigen keine vollständige GoBD-Konformität des gesamten Buchführungsverfahrens.
