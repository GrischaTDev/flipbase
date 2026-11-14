# Vinted-Cloud: Plan für parallele Konten und wartende Aktionen

Stand: 14. November 2026. Grundlage: [Codeanalyse](../research/2026-11-14-vinted-cloud-actions-analysis.md) gegen `origin/master` auf `35553d11`.

Status: Alle Produktentscheidungen sind bestätigt. Die Agenten beginnen die Umsetzung nach dem gemeinsamen Auftragsvertrag. Angaben des früheren Übergabeprotokolls gelten nicht als aktuelle Freigabe.

## Ziel und feste Grenzen

- Höchstens eine Browseraktion je tatsächlichem Vinted-Konto; unterschiedliche Konten können bis zur wirksamen Serverkapazität gleichzeitig arbeiten.
- Gültige Cloudaktionen dauerhaft annehmen und bei belegtem Konto oder Pool warten lassen. Annahme ist kein Anbietererfolg.
- Vorhandene Auftragstabellen, Aktionsübersicht und private Änderungsmeldungen erweitern. Kein neuer Warteschlangendienst.
- Gespeicherte Listen, Entwürfe und browserfreie Fotoabrufe bleiben ohne Browserplatz nutzbar.
- Bestehende Rechte, Kontobindungen, lokale Erweiterungswege und unveränderte Originalbilder erhalten.
- Ein möglicherweise wirksamer Schreibversuch wird nicht automatisch wiederholt. Eine abgelaufene Reservierung ersetzt keinen bestätigten Browserstopp.

## Abzustimmende Produktentscheidungen

Alle nachstehenden Entscheidungen hat der Nutzer ausdrücklich bestätigt. Die Aufbewahrung betrifft ausschließlich den abgeschlossenen Aktionsverlauf, keine Artikel, Bilder oder Nachrichten.

| Entscheidung                       | Empfehlung                                                                                                                                                                                                                                    | Grund                                                                                                                      | Stand     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| Startkapazität                     | Mit einem Browserplatz ausliefern; zwei eigene Konten mit zwei Plätzen unter Last prüfen und nur nach erfolgreicher Messung dabei bleiben.                                                                                                    | Die Warteschlange wirkt bereits mit einem Platz; die Tragfähigkeit von zwei Browsern ist bisher nicht gemessen.            | Bestätigt |
| Reihenfolge                        | Nutzeraktionen vor automatischen Abgleichen; automatische Abgleiche nach fünf Minuten Wartezeit gleichrangig behandeln, dann entscheidet das Alter. Abhängige Artikeländerungen bleiben in Annahmereihenfolge.                                | Schnelle bewusste Bedienung und begrenzte Verdrängung automatischer Arbeit.                                                | Bestätigt |
| Browserabhängige Abrufe            | Dauerhaft annehmen, späteres Ergebnis laden, Warten in der betroffenen Ansicht zeigen.                                                                                                                                                        | Einheitliches Verhalten bei belegtem Pool und keine minutenlang gehaltene HTTP-Verbindung.                                 | Bestätigt |
| Wartelimit und Aufbewahrung        | Höchstens 50 wartende direkte Cloud-Aufträge je Konto; erledigte, fehlgeschlagene und abgebrochene direkte Aufträge 30 Tage aufbewahren. Ungeklärte Ergebnisse bis zur Klärung erhalten; Duplikatschutz über die Bereinigung hinaus erhalten. | Nutzdaten begrenzen, ohne gültige Aufträge still zu verlieren oder alte Anfragen erneut auszuführen.                       | Bestätigt |
| Folgeaktionen bei unklarer Wirkung | Zunächst lesend nachprüfen; bei verbleibender Unklarheit nur abhängige Folgeänderungen zurückhalten. Andere Artikel und Konten laufen weiter. Kein automatischer neuer Schreibversuch.                                                        | Ungeklärte Wirkungen nicht durch weitere Änderungen verdecken; den übrigen Betrieb erhalten.                               | Bestätigt |
| Einrichtung und Anmeldung          | Sichtbar warten und bei freiem Platz automatisch starten, solange der Einrichtungsdialog geöffnet und verbunden ist. Nach Schließen erst durch erneutes Öffnen wieder startberechtigt.                                                        | Eine unbeaufsichtigte Anmeldung verbraucht keinen Browserplatz; kein zusätzlicher Bestätigungsklick bei geöffnetem Dialog. | Bestätigt |

Für die bestätigte Reihenfolge gilt: Die Aufwertung greift bei noch nicht begonnenen automatischen Abgleichen nach fünf Minuten tatsächlicher Wartezeit. Bei gleichem Rang entscheidet das Alter des ausführbaren Auftrags; abhängige Änderungen dürfen nicht überholt werden. Laufende Aktionen werden durch neu eintreffende Aufträge nicht unterbrochen.

Für die bestätigten Leserouten gilt: Annahme und Ergebnisabruf sind getrennt. Ein verspätetes Ergebnis darf weder nach einem Kontowechsel noch nach neuerer Formulareingabe ungeprüft übernommen werden. Gespeicherte Listen, Entwürfe und browserfreie Fotoabrufe bleiben direkt nutzbar.

Die Warteschlangengrenze ist eine harte Annahmegrenze: Bei 50 wartenden direkten Aufträgen wird ein weiterer neuer Auftrag weder gespeichert noch ausgeführt, auch nicht über einen sofortigen Nebenweg. Die Oberfläche meldet: „Maximale Anzahl wartender Aktionen erreicht. Bitte warte, bis ein Platz frei wird.“ Die Wiederholung einer bereits angenommenen Anfrage liefert weiterhin deren bisherigen Auftrag.

Nach 30 Tagen werden abgeschlossene direkte Aufträge aus dem Verlauf entfernt und ihre Nutzdaten/Ergebnisse bereinigt. Eine minimale unveränderliche Anfragequittung bleibt in derselben Zeile erhalten; dadurch kann dieselbe alte Anfrage niemals eine zweite Ausführung auslösen. Ungeklärte Ergebnisse werden nicht automatisch bereinigt. Artikel, Bilder, Nachrichten und fachliche Dokumente werden durch diese Verlaufsbereinigung nicht gelöscht.

## Schritt 0: Vertrag vollständig festlegen

Nach den Produktentscheidungen eine gemeinsame Aktionsmatrix erstellen: Route, Browserbedarf, vorhandene oder neue Auftragstabelle, Annahmeantwort, Ergebnis, Rechte, Kontobindung und Beginn einer möglichen Anbieterwirkung.

Bearbeitung als einen fachlichen Auftrag definieren: ursprüngliche Basis und Änderungen speichern; frisches Lesen, Zusammenführen, Konfliktprüfung und Schreiben gemeinsam ausführen. Profil-, Kategorie-, Stadtsuche-, Versandetikett- und Chatabrufe ausdrücklich aufnehmen. Browserfreien Fotoabruf und vorhandenen gespeicherten Abgleich erhalten.

Abnahmekriterium: Keine betroffene Route bleibt unzugeordnet; alle Agenten verwenden denselben Zustands-, Anfrage- und Ergebnisvertrag.

## Schritt 1: Datenbank und sichere Vergabe

Verantwortlich: Datenbankagent; gemeinsame Verträge und Integration durch Juna koordinieren.

- Kapazitätswunsch und tatsächlich nutzbares Hostlimit verbindlich zusammenführen.
- Unter der bestehenden kurzen Transaktionssperre ausführbare Aufträge über die vorhandenen Tabellen auswählen und Konto/Poolplatz atomar reservieren.
- Neue direkte Aufträge mit stabiler Anfragekennung, Inhaltsvergleich, unveränderlicher Identität, Freigabe, Version, Schreibphase, Ergebnis und Zeitstempeln speichern.
- Annahme, Claim, Beginn, Abschluss, wartenden Abbruch und Wiederherstellung absichern. Bei einer wiederholten Anfrage weder doppelt schreiben noch wegen eines inzwischen vollen Wartelimits denselben Auftrag ablehnen.
- Rechte bei Annahme und Ausführung prüfen; bestehende Sichtbarkeit erhalten. Private Broadcastmeldungen enthalten nur Änderungshinweise.
- Bestehende Übersicht erweitern; Wartegründe aus dem aktuellen Zustand bestimmen.

Nachweis: SQL-Verträge sowie getrennte konkurrierende Transaktionen für Pool eins/zwei, gleiches Konto, mehrere Arbeitsbereiche, Abbruch gegen Claim und ungeklärten Stopp. Bestehende Erwartungen auf globale Ablehnung gezielt berichtigen.

## Schritt 2: Host und Worker

Verantwortlich: Workeragent; Start nach verbindlicher Festlegung des Datenbankvertrags. Unabhängige Arbeiten aus Schritt 1 dürfen parallel laufen, gemeinsam bearbeitete Dateien nicht.

- Hostbefehle je Profil ordnen und unterschiedliche Profile parallel bedienen.
- Globale Startplätze einschließlich noch startender Browser atomar reservieren; unklaren Start oder Stopp nicht voreilig freigeben.
- Globale Sitzungsauswahl und Wiederverwendung durch kontobezogene Verwaltung ersetzen.
- Dispatcher auf begrenzte aktive Ausführungen umstellen; Heartbeat, Runtimeverlust und geordnetes Beenden für alle laufenden Aufträge erhalten.
- Neue direkte Aufträge mit gebundenem Claim und dauerhaftem Schreibbeginn ausführen. Bestätigte Kontofehler isolieren, unbekannten Workerbesitz weiterhin global absichern.

Nachweis: Tatsächliche Überlappung verschiedener Konten, Ausschluss desselben Kontos, freier Fortschritt von B bei wartendem Poll von A, geordnete Befehle desselben Profils, Startgrenze und bestätigter Stopp. Absenken der Kapazität beendet keine bereits laufende Aktion.

## Schritt 3: HTTP und fachliche Ausführung

Verantwortlich: Workeragent; Datenbankagent ergänzt nur abgestimmte fehlende Serververträge.

- Betroffene direkte Routen antworten nach dauerhafter Annahme mit Auftragskennung; Status und private Ergebnisse getrennt abrufen.
- Bisherige Belegt- und In-flight-Ablehnungen für gültige neue Aufträge ersetzen.
- Routenspezifische Validierung, Größenlimits, Konfliktprüfung und fachliche Ergebnisdaten erhalten.
- Bestätigte Anbieterwirkung und nachträglichen Cachefehler unterschiedlich behandeln.
- Interaktive Sitzungen nach abgestimmtem Vertrag anschließen; vorhandene Auftragswege nicht doppeln.

Nachweis: Vertragsfälle für Antwortverlust und gleiche Anfragekennung, anderer Inhalt bei gleicher Kennung, Rechteentzug, Kontowechsel, vollständige Bearbeitung und unklaren Ausgang ohne erneuten Schreibversuch.

## Schritt 4: Oberfläche und dauerhafte Ergebnisse

Verantwortlich: Oberflächenagent; typisierte Verträge aus Schritt 0 sind Voraussetzung, vorhandene Verbraucher vollständig erfassen.

- Bestehende Aktionsübersicht, Parser, Headerfilter, Zähler und Darstellung um Warten, Wartegrund, Abbruch und unklaren Ausgang ergänzen.
- Serverstand initial und nach Reconnect laden; Version und Kontextrevision gegen verspätete Ergebnisse verwenden.
- Stabile Anfragekennung vor Absenden sichern; angenommene und prüfbedürftige eigene Aufträge auch bei ausgeschalteter optionaler Übersicht erreichbar halten.
- Preis, Bestand, Profil, Versanddatei und Erfolgsmeldung erst nach bestätigtem Ergebnis aktualisieren.
- Browserabhängige Abrufe nach abgestimmtem Vertrag anbinden; überholte wartende Leseabrufe dürfen zusammengeführt oder verworfen werden, Schreibaufträge nicht.
- Cloud-Busy-Wiederholungen in Chat und Versandetiketten entfernen; lokale Wege und deren Wiederholungen erhalten.

Nachweis: Bestehende Angularfälle und betroffene Browserfälle für Annahme → Warten → Ergebnis, Reload, Konto A→B→A, deaktivierte optionale Übersicht, Abbruch und unbekannten Ausgang. Relevante Breiten, Hell/Dunkel, Touch und AXE einbeziehen.

## Schritt 5: Migration, Rollout und gemeinsame Abnahme

Verantwortlich: Juna integriert die Agentenergebnisse; Datenbankagent betreut den Schemaabgleich.

- Migration aus eigenen isolierten Datenbanken erzeugen, vollständig prüfen und auf eine frische Ausgangskopie anwenden; Typen neu erzeugen.
- Neue Schema- und Testdateien in Auswahl und Registrierung nachweisen.
- Rolloutstatus, geordnetes Beenden und Wiederanlauf um neue Aufträge ergänzen. Wartende Aufträge überleben eine Auslieferung.
- Geänderte Dateien gezielt formatieren; finalen Preflightplan und tatsächlichen lokalen Preflight mit Node 22 ausführen. Format/Lint sowie ausgewählte zusätzliche CI-Nachweise vollständig behandeln.
- Zusammenhängenden Aufgabenstand prüfen; ein PR für den vollständigen Umbau. Die Projektfrage vor Push/PR/Merge bleibt bestehen.

Abnahmekriterien: Konto-/Poolmatrix, faire Reihenfolge, kein verlorener Auftrag, keine doppelte Wirkung, wiederherstellbare Anzeige und korrekte Rechte. Fehlende Prüfungen ausdrücklich benennen. Eine spätere Produktionsmessung mit zwei Konten setzt eine konkret abgestimmte Auslieferung und Messung voraus.

## Arbeitsweise mit den Agenten

Die drei Fachagenten bearbeiten abgegrenzte Dateien und denselben vereinbarten Vertrag. Juna führt Ergebnisse zusammen und prüft die Übergänge zwischen Datenbank, Worker und Oberfläche. Nach jedem zusammenhängenden Schritt zählt dessen konkreter Funktionsnachweis; erfolgreiche unveränderte Prüfungen werden nicht grundlos wiederholt. Keine parallelen Bauten während eines Browserlaufs gegen dieselbe Vorschau.

Offene Produktentscheidungen werden nicht still durch Agenten entschieden. Technische Routinedetails innerhalb des abgestimmten Plans werden selbstständig erledigt.
