# Vinted: Erstellungszeit, Veröffentlichungsstatus und Kleiderschrankreihenfolge

## Getrennte Quellen und Bedeutung

Die Lesekopie unterscheidet den Artikelzustand (`status`, beispielsweise „Sehr gut“)
vom Veröffentlichungsstatus (`publicationState`). Ebenso getrennt bleiben:

| Feld                            | Bedeutung                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `createdAt`                     | Gültige Erstellung des passenden Vinted-Artikels aus `created_at_ts` oder `created_at`; kann bereits beim Anlegen eines Entwurfs entstehen. |
| `occurredAt` / UI `publishedAt` | Bestätigte eigene Veröffentlichung aus einem passenden `marketplace_listing_jobs`-Auftrag.                                                  |
| `publicationAge`                | Gerundete Vinted-Angabe mit Einheit und ursprünglichem Beobachtungszeitpunkt; keine genaue Uhrzeit.                                         |
| `observed_at`                   | Zeitpunkt des Abrufs, niemals Ersatz für die Artikelchronologie.                                                                            |

Für eine eigene Veröffentlichungsbestätigung müssen Workspace, Verbindung,
Inserat und aktuelle externe Kontoidentität passen. Der Auftrag muss `confirmed`,
`publish` und `active` sein. Entwurfs-, Auftrags-, Änderungs- und Importzeiten sind
keine Veröffentlichungszeit. Ungültige Kalender- und Zukunftswerte verdrängen
keinen gültigen Fallback.

Der bestehende Detailseitenleser verwendet ausschließlich den Text unter
`[data-testid="item-attributes-upload_date"] [itemprop="upload_date"]`.
Er versteht auch die am 22.10.2026 tatsächlich beobachtete Kurzform `1 h`.
Auf der dabei geprüften aktuellen Artikel- und Entwurfsseite war kein genaues
Artikel-Erstellungsdatum im HTML belegt. Ein `created_at` des eingeloggten Nutzers
gehört nicht zum Artikel und wird nicht übernommen. Es gibt keinen zusätzlichen
geratenen Anbieter-Endpunkt und keine globale Suche nach beliebigen Datumswerten.

## Status vom Anbieter bis zur Anzeige

Cloudimport und lokale Erweiterung verwenden dieselbe Priorität:

1. `is_draft === true`: `draft`.
2. `is_hidden === true`: `hidden`.
3. `is_closed === true`: `ended`; wie bisher nicht als offenes Angebot importieren.
4. Bei ansonsten widersprüchlichen Flagtypen: `unknown`.
5. `is_reserved === true`: `reserved`.
6. `is_visible === true`: `active`.
7. Sonst: `unknown`.

`is_visible: false` allein beweist keinen Entwurf. Ebenso belegen
`is_closed: false` und `is_reserved: false` keine aktive Veröffentlichung.
Ein ausdrücklicher Entwurf bleibt auch bei widersprüchlichen anderen Flags als
Entwurf erhalten. Die beiden Importverträge prüfen die neuen Felder ausdrücklich.

Die Oberfläche zeigt Entwurf, Reserviert, Versteckt, Beendet oder Status unbekannt
in Raster, Liste und Detail. Die gemeinsame Marktplatzübersicht filtert Seite und
Gesamtzahl nach dem gespeicherten `publicationState`. Die zusätzlichen Filter
Entwürfe, Versteckt und Status unbekannt werden nur für Vinted angeboten.

Nur aktive und reservierte Vinted-Artikel erhalten eine Online-Dauer. Fehlt deren
Veröffentlichungszeit, kann ein vorhandenes gerundetes Veröffentlichungsalter
weiterverwendet werden. Ein reines Erstellungsdatum erscheint neutral als
„Vor … Tagen erstellt“, kompakt „… T · erstellt“, und mit dem genauen Erstelldatum
im Tooltip. Auch bei bekanntem Veröffentlichungsalter bleibt ein vorhandenes
Erstelldatum separat im Tooltip sichtbar. Unbelegte Zeiten bleiben unbekannt.

Ein lokaler Flipbase-Entwurf ist eine getrennte Arbeitskopie. Das Vorhandensein
dieser Arbeitskopie verändert niemals den Status des veröffentlichten Originals.

## Abruf, Speicherung und Statuswechsel

Die normale kontogebundene Inseratsliste wird weiter über den bestehenden
Kleiderschrankabruf gelesen. Bekannte Entwürfe und versteckte Artikel benötigen
keinen zusätzlichen HTML-Abruf ihres Veröffentlichungsalters. Erfolgreich gelesene
relative Angaben behalten ihren ursprünglichen Beobachtungszeitpunkt und zählen
ab dort weiter. Folgeabrufe ergänzen nur noch fehlende Angaben. Für erfolglose
Zusatzabrufe bleibt die tägliche Wiederholpause erhalten. Vor weiteren Anfragen
wird die Berechtigung geprüft; 403/429 stoppen weitere Anbieteranfragen, 401
beendet den autorisierten Kontoimport.

`marketplace_publication_versions` liefert der aktiven autorisierten Cloud-Sitzung
gespeicherte Erstellungs- und Alterswerte sowie unabhängig bestätigte eigene
Veröffentlichungszeiten. Ein altes `body.occurredAt` ist dafür keine Bestätigung.
Die strikte Übergabe an den isolierten Browser akzeptiert die erweiterten
Cachefelder. Die Datenbank erhält bekannte Zustände auch dann, wenn ein älterer
Client die neuen Felder noch nicht sendet.

Ein aktuell belegter Entwurf gewinnt vor einer historischen Veröffentlichung.
Beim späteren Wechsel zu aktiv dürfen weder sein altes Online-Alter noch ein
früherer Veröffentlichungsauftrag wieder auftauchen. Der Datenbanktrigger erhält
deshalb intern den letzten belegten Entwurfsabruf als `publicationDraftObservedAt`;
dieser Wert ist kein vom lokalen Client beschreibbares Vertragsfeld. Nur passende
Veröffentlichungsbestätigungen nach dieser Grenze können eine neue aktive
Veröffentlichungszeit belegen. Das tatsächliche Erstellungsdatum bleibt erhalten.

Entwürfe erzeugen keine neuen aktiven Statistikbeobachtungen. Die Aktivzahl
berücksichtigt ausschließlich aktuelle aktive oder reservierte Lesekopien;
vorhandene Messhistorie wird nicht gelöscht.

## Stabile Reihenfolge über sämtliche Seiten

Der Datenbanktrigger berechnet `sort_at` für Vinted-Inserate aus:

1. Zulässiger bestätigter Veröffentlichungszeit.
2. Echtem `createdAt` des Artikels.
3. Einem zulässigen relativen Altersanker: `publicationAge.observedAt` minus Alter.
4. Einer festen Unix-Epoche als unbekanntem Wert am Listenende.

Für die ungefähre Sortierung sind Monate 30 und Jahre 365 Tage. Daraus entsteht
kein als exakt ausgegebenes Datum. Die ursprüngliche Beobachtungszeit bleibt
maßgeblich; ein weiterer Abruf schiebt alte Artikel nicht nach oben.
Die vorhandene serverseitige Reihenfolge `sort_at desc, id desc` und derselbe
Cursor gelten weiterhin für alle Seiten. Es gibt keine lokale Umsortierung nur
der bereits geladenen Teilmenge. Andere Eintragsarten behalten ihre Zeitregeln.

## Bestand, Migration und Veröffentlichung

Deklarative Quellen sind `340_marketplace_listing_statistics.sql`,
`350_marketplace_local_extension.sql` und `467_marketplace_publication_times.sql`.
Die Korrekturmigration `20261022091312_vinted_wardrobe_state_order.sql` ergänzt die bereits veröffentlichte Migration
`20261016082736_marketplace_publication_times.sql`; historische Migrationen bleiben
unverändert.

Der Bestandsabgleich führt Vinted-Inserate durch denselben Normalisierungstrigger.
Ein alter `occurredAt`-Wert wird ohne identischen eigenen Veröffentlichungsbeleg
als Quellerstellung erhalten. Fehlende Statusmerkmale bleiben bis zum nächsten
autorisierten Vinted-Abruf unbekannt. Beschreibungen, Übernahmeinformationen,
andere Marktplätze und andere Eintragsarten bleiben erhalten. Es werden keine
Vinted-Anzeigen erstellt, veröffentlicht, verändert oder gelöscht.

Die Migration wird aus dem geprüften PostgreSQL-Zielzustand erzeugt, auf einer
frischen Migrationsbasis transaktional angewendet und mit Schema- und
Rechtevergleich sowie pgTAP geprüft. Interne SQL-Helfer erhalten keine
Ausführungsrechte für `anon` oder `authenticated`.

Nach erfolgreicher PR-Integration zuerst den Web-Release einschließlich Migration
abwarten. Worker, Broker und Sitzungsimage müssen anschließend aus demselben
Merge-Stand stammen. Die lokale Erweiterung muss für die neue Statusübertragung
ebenfalls aktualisiert werden; alte Clients bleiben kompatibel, können aber
keinen bisher fehlenden Anbieterstatus nachliefern. Der nächste reguläre oder
manuell angeforderte Kontodatenabgleich aktualisiert die vorhandenen Anzeigen.
