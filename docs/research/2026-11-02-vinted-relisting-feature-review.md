# Vinted-Relisten: Gegenprüfung mit Vintz und Bleam

Stand: 02.11.2026. Analyse: Juna. Geprüfter Aufgabenstand: `ea282af6` auf `juna/vinted-wardrobe-relisting`; frisch abgerufenes `origin/master`: `8d2d65c9`.

Nachtrag zu den anschließenden Nutzeraufträgen: Die
[Originalspeicherung und getrennte Vinted-Ausgabe](../implementation/vinted-listing-original-photos.md)
aus Punkt 1 und die
[Planungs- und Anzeigekorrekturen](../implementation/vinted-relisting-plans.md)
aus den Punkten 2–4 sind inzwischen umgesetzt und gezielt geprüft. Die folgenden
Befunde dokumentieren den damaligen Prüfstand. Die Pflichtprüfungen in GitHub
stehen weiterhin aus.

## Ergebnis

Der beauftragte Einzelablauf ist umgesetzt: Artikel bearbeiten, anschließend optionale Bilder und Veröffentlichung festlegen; erst das Original löschen, dann sofort oder später veröffentlichen. Gegenüber den Konkurrenzfunktionen fehlen vor allem zusätzliche lokale Bildwerkzeuge, Original-/Ergebnisvergleich und optionale Text-KI. Dafür ist zunächst kein zusätzlicher KI-Dienst nötig.

Vor einem abschließenden PR sollten jedoch vier konkrete Punkte im bestehenden Ablauf korrigiert werden: mehrfaches JPEG-Kodieren, unerwünschtes Wiederanstellen beim Schließen eines fehlgeschlagenen Plans, Anzeige eines neueren Entwurfs statt des beauftragten Inhalts und der Übergang vom abgeschlossenen Plan zum neuen Inserat. Die bisherigen erfolgreichen Funktionstests deckten diese Fehlerkombinationen nicht ab.

Dieser Auftrag ist eine Gegenprüfung. Es wurden keine Anwendungsfunktionen, Bildoptionen oder KI-Anbindungen geändert und kein PR angelegt.

## Quellen und Aussagegrenzen

- Vorhandene Untersuchungen: [Vintz-Relisten, 17.10.](vintz-relisting-comparison.md), [Vintz-Erstellung, 17.10.](vintz-listing-creation-comparison.md), [Vintz-Bildstudio, 18.10.](vintz-image-studio-gallery-comparison.md), [Fotoerkennung und Text, 21.10.](2026-10-21-vintz-listing-photo-ai.md), [Bleam-Protokoll](bleam-vinted-analysis.md), insbesondere Beobachtungen 28–30.
- Am 02.11. erneut öffentliche Primärquellen gelesen: [Vintz](https://vintz.ai/), [Vintz-Tarife](https://vintz.ai/pricing), [Bleam-Relisten](https://bleam.app/en/help/republier-annonce), [Bleam-Kleiderschrank](https://bleam.app/en/help/dressing), [Bleam-Planung](https://bleam.app/en/help/planification-annonces).
- Konkurrenzfunktionen aus den alten Sitzungen bleiben datierte Beobachtungen beziehungsweise Befunde des damals geladenen Codes. Die heutigen öffentlichen Hilfeseiten bestätigen das angebotene Produkt, nicht dessen interne Ausführung oder Ergebnisqualität. Kein neuer angemeldeter Rundgang, KI-Auftrag oder Konkurrenz-Relisting.
- Die erste Suchansicht der Vintz-Tarife enthielt ältere Modell-/Anbieterangaben, die die anschließend direkt geöffnete aktuelle Seite nicht mehr enthielt. Deshalb keine bestimmte aktuelle Modellwahl, Generierungsgeschwindigkeit oder Kostenbehauptung daraus übernommen.
- Insbesondere war Vintz' automatische Foto-Versionsfunktion am 17.10. deaktiviert. Weder als heute aktive Funktion übernommen noch heute erneut als deaktiviert behauptet.

## Funktionsvergleich

| Bereich                 | Flipbase, geprüfter Zweig                                                                          | Vintz, bisherige Untersuchung und heutige öffentliche Angaben                                                  | Bleam, bisherige Beobachtung und heutige Hilfe                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Details vor Relisten    | Dasselbe vorausgefüllte Artikelformular, danach Weiter                                             | Preis, Text und Fotos getrennt bearbeitbar                                                                     | Bildoptionen, Artikeländerungen und Ausführung getrennt                                                            |
| Reihenfolge             | Löschen vor Veröffentlichung, ausdrücklich so beauftragt                                           | Am 17.10. vier Strategien; heutige Startseite bewirbt Veröffentlichung vor Entfernung                          | Ein früherer echter Nutzertest bestätigte neues Inserat und entfernte Quelle, aber nicht lückenlos die Reihenfolge |
| Planung                 | Sofort, Wartezeit ab Löschbestätigung oder fester Zeitpunkt; geplante Karte bearbeitbar            | Einzelplanung und Sammelabstände; damals bis fünf Artikel                                                      | Sammelauswahl, Planung und Kartenstatus angeboten                                                                  |
| Metadaten               | Neurendern automatisch; auch neue Dateien im Relist-Pfad                                           | Damals eigener optionaler Schalter                                                                             | Lokale Fotomodifikationen angeboten; keine separate aktuelle Aussage über vollständige Metadatenbereinigung belegt |
| Auflösung               | Originalpixelmaße oder 1200/1600/2400 an der längeren Kante, gleiches Seitenverhältnis             | Damals Original/1600/2400                                                                                      | Keine konkrete entsprechende Auflösungsliste aus den gelesenen Hilfen belegt                                       |
| Einfache Bildwerkzeuge  | Ersetzen, Entfernen, Sortieren, Hauptbild, Zuschnitt und 90°-Drehung; Auflösung im zweiten Schritt | Damals zusätzlich Hell/Weich/Klar                                                                              | Rahmen, Zuschnitt, Farbkorrekturen, Rauschen/JPEG-Qualität und feste Rotation laut Relist-Hilfe                    |
| Original und Ergebnis   | Kein eigener dauerhaft unveränderter Quellbildsatz samt Bearbeitungsrezept im Relist-Pfad          | Vorher/Nachher im damaligen Code vorgesehen                                                                    | Vorher/Nachher und wählbare Sicherungsfotos laut Kleiderschrank-Hilfe                                              |
| Text-KI                 | Keine im Relist-Editor; KI-Foto-Checkbox ist lediglich eine Kennzeichnung                          | Damals Textvorschläge mit getrenntem Übernehmen/Verwerfen                                                      | Optionale Titel-/Beschreibungskorrektur in vier Stärken laut Relist-Hilfe                                          |
| Generative Bilder       | Keine im Relist-Editor                                                                             | Studio bewirbt Produktbilder, Flatlays und Tragebilder; ältere Untersuchung zusätzlich Hintergrund und Upscale | Optionale Foto-KI in Beta; tatsächliche Modelltechnik und Qualität nicht nachgewiesen                              |
| Sammel-/Dauerautomation | Kein Sammel-Relisten und kein wiederkehrender Relist-Zyklus in diesem Feature                      | Sammelweg und getrenntes Auto-Relist-Angebot                                                                   | Sammelweg und weitere Automationen angeboten                                                                       |

Vintz' Veröffentlichung vor Löschung übernehmen wir nicht: Der Nutzer hat ausdrücklich die andere Reihenfolge gewählt. Native Vinted-Entwürfe, Kontotransfers und wiederkehrendes Relisten sind ebenfalls zusätzliche Produktentscheidungen, keine übersehenen Voraussetzungen für den beauftragten Einzelablauf.

## Vier Nachbesserungen vor dem PR

### 1. Bilder mehrfach als JPEG kodiert; unveränderte Quelle fehlt

[Editor](../../src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.ts): `load()` rendert jedes geladene Quellfoto bereits über `prepareVintedListingPhoto`. `persist()` rendert dieselbe Datei für Relists nochmals. Bei gewählter Auflösungsanpassung liegt `preparePhotos()` dazwischen. Normal sind damit zwei, mit Größenanpassung drei JPEG-Kodierungen möglich; manuelle Zuschnitte können weitere Verarbeitung hinzufügen.

Die damalige Fotovorbereitung (`vinted-listing-photo-preparation.ts`, inzwischen entfernt) schrieb jeweils JPEG mit Qualität 0,95. Originalauflösung bedeutet gleiche Pixelmaße, nicht unveränderte Originaldatei. Das kann unnötige Qualitätsverluste erzeugen; ein sichtbarer Qualitätsverlust wurde in dieser Sitzung nicht gemessen. Größerrechnen auf 2400 Pixel ergänzt außerdem keine echten Bilddetails.

**Korrekturziel:** Quellblob und Bearbeitungsparameter getrennt erhalten. Vorschau und Export aus derselben unveränderten Quelle berechnen; genau eine abschließende JPEG-Ausgabe pro Veröffentlichung. Danach Metadatenfreiheit prüfen. Hochskalierung nur als bewusste Größenänderung, ohne Qualitätsversprechen. Rücksetzen sowie Vorher/Nachher werden damit ohne KI möglich.

**Nachweis:** Aufrufkette im aktuellen Code, keine behauptete neue Bildqualitätsmessung.

### 2. Fehlgeschlagenen Plan öffnen und schließen kann ihn erneut starten

[Plan-RPC](../../supabase/schemas/463_marketplace_listing_jobs.sql): `marketplace_edit_relisting_plan` akzeptiert beim Öffnen `failed`, `paused` und `queued`, speichert den vorherigen Zustand aber nicht. Beim Schließen wird immer `queued` gesetzt. Damit ist ein bloßes Schließen kein verlässlicher Abbruch der Bearbeitung. Bei einem bereits fälligen fehlgeschlagenen Auftrag kann dadurch eine erneute Ausführung folgen.

**Korrekturziel:** Vorherigen Zustand und Fehler erhalten. Unverändertes Schließen stellt diesen Zustand wieder her. Ein fehlgeschlagener oder aus anderen Gründen pausierter Auftrag wird nur durch eine ausdrückliche erneute Beauftragung wieder ausführbar. Bearbeitung darf nicht gleichzeitig als Wiederholung gelten.

**Nachweis:** Zusätzliche private SQL-Probe in der eigenen isolierten Datenbank: `failed → paused/editing → queued` reproduziert. Die Transaktion wurde vollständig zurückgerollt. Die Probe bestätigt den Fehler, keine erfolgreiche Fehlerbehebung.

### 3. Geplante Karte kann Inhalt zeigen, der gar nicht beauftragt ist

[Plan-Store](../../src/app/features/marketplaces/services/vinted-relisting-plan.store.ts) lädt den aktuellen veränderlichen Entwurf; der Worker verwendet dagegen die unveränderliche Auftragsaufnahme. [Speichern im Editor](../../src/app/features/marketplaces/components/vinted-listing-editor/vinted-listing-editor.component.ts) erfolgt vor der separaten Auftragsersetzung.

Konkreter Fall: Auftrag mit Revision 1 und Preis 20 €. Neue Angaben werden als Entwurf Revision 2 mit Preis 25 € gespeichert; die folgende Auftragsersetzung scheitert. Beim späteren Lesen kann die Karte Revision 2 zeigen, während der fortgesetzte Auftrag weiterhin Revision 1 veröffentlicht. Der Store prüft nicht, ob der geladene Entwurf tatsächlich zur beauftragten Revision passt.

**Korrekturziel:** Geplante Karten aus der angenommenen Auftragsaufnahme darstellen, einschließlich Fotos und Preis. Neuere noch nicht beauftragte Eingaben getrennt erhalten. Fehler bei der Ersetzung dürfen weder die alte Planung anders darstellen noch Änderungen unbemerkt zur Veröffentlichung machen. Antwortverlust und gleichzeitige Änderungen gezielt absichern.

**Nachweis:** Private Komponenten-/Serviceprobe: Auftragsrevision 1, geladener Entwurf Revision 2, dargestellter Titel aus Revision 2 reproduziert.

### 4. Nach Erfolg fehlt der zuverlässige Wechsel zum neuen Inserat

[Planabfrage](../../supabase/schemas/463_marketplace_listing_jobs.sql) liefert bestätigte Aufträge nicht mehr. Der [Kleiderschrank](../../src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.ts) blendet die alte Anzeige jedoch nur anhand dieser noch vorhandenen Pläne aus. Im bestehenden Ausführungsabschluss ist kein unmittelbar damit verbundener Import des neuen Inserats erkennbar. Der normale Kontoabgleich folgt einem neuen Importstand, nicht allein der erfolgreichen Auftragsbestätigung.

Damit kann die geplante Karte verschwinden und die alte zwischengespeicherte Anzeige wieder erscheinen, bevor ein späterer Abgleich das neue Inserat liefert.

**Korrekturziel:** Bestätigtes Ergebnis samt neuer Anbieterkennung bis zum abgeglichenen neuen Eintrag anzeigen und die alte Kennung weiter ausblenden. Kontogebundenen Abgleich gezielt anstoßen beziehungsweise dessen Abschluss beobachten. Kein Erfolg durch ein bloßes Neuladen vortäuschen.

**Nachweis:** Zweite private Komponentenprobe: alter Cacheeintrag wird während des Plans ausgeblendet und nach Entfernen des bestätigten Plans wieder sichtbar. Ein echter Vinted-Neuimport wurde für diese Analyse nicht ausgelöst.

## Bildbearbeitung ohne zusätzlichen Dienst

Flipbase hat bereits einen lokalen [Bildoptimierer](../../src/app/features/image-optimizer/), unter anderem [Helligkeit, Kontrast, Sättigung, Wärme und Schärfe](../../src/app/features/image-optimizer/models/image-adjustments.ts), [gemeinsames Rendern von Vorschau und Ausgabe](../../src/app/features/image-optimizer/services/image-renderer.ts) und [Rotation](../../src/app/features/image-optimizer/services/image-rotation.service.ts).

| Option                                                            | Umsetzung ohne zusätzliche KI-Anbindung                                     | Priorität                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| Metadaten entfernen, Größe und JPEG-Ausgabe                       | Vorhandene Canvas-Verarbeitung vereinheitlichen                             | Zuerst Qualität und Originale korrigieren  |
| Weißer, grauer oder schwarzer Rahmen                              | Hintergrund zeichnen, komplettes Foto proportional etwas kleiner zentrieren | Kleine, optionale Ergänzung                |
| Weicher Bildhintergrund als Rahmen                                | Vergrößerte unscharfe Hintergrundebene plus unverändertes Vordergrundfoto   | Optional                                   |
| Helligkeit, Kontrast, Sättigung, Weißabgleich, maßvolle Schärfung | Vorhandene lokale Rechenwege wiederverwenden                                | Nach Vorschau und Rücksetzen               |
| Zuschnitt, 90°-Drehung, Reihenfolge                               | Im aktuellen Medieneditor schon erreichbar                                  | Nicht nochmals bauen                       |
| Freier kleiner Drehwinkel                                         | Canvas-Transformation; anders als vorhandene 90°-Drehung                    | Nur bei gewünschtem Nutzen ergänzen        |
| Vorher/Nachher, Rücksetzen, ein Bild oder alle Bilder             | Unveränderte Quelle plus Parameter, keine Bildgenerierung                   | Sinnvoller als weitere Filterstufen        |
| Rauschen und absichtliche Qualitätsminderung                      | Technisch lokal möglich                                                     | Für Verkaufsfotos zunächst nicht empfehlen |

Ein Rahmen soll den vorhandenen Ausschnitt erhalten. Bei festem Ausgabeformat das Foto innerhalb der Fläche proportional verkleinern, statt Ränder abzuschneiden oder das Kleidungsstück zu verzerren. Ein ausschließlich links/rechts außen hinzugefügter Rand verändert dagegen das Seitenverhältnis. Diese Varianten dürfen technisch nicht gleichgesetzt werden.

Wiederverwendbare reine Renderfunktionen bei Bedarf gemeinsam bereitstellen, ohne den gesamten Bildoptimierer in den Relist-Dialog einzubauen. Plattformprofile und vorhandene Export-/Metadatenfunktionen dabei erhalten. Keine neuen Bedienhinweise, Bewertungsanzeigen oder Pflicht-Bildänderungen ergänzen.

Metadaten-, Größen-, Rahmen- oder Farbänderungen sind kein belegter Schutz vor Shadowbans oder Sperren. Die Anbieterempfehlungen belegen keine Wirkung von Vinteds internem Erkennungsverfahren. Deshalb keine entsprechende Garantie und keine absichtlich versteckte Veränderung als Standard.

## Welche KI-Funktionen tatsächlich einen zusätzlichen Modellaufruf brauchen

| Funktion                                                   | Einordnung für Flipbase                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Titel/Beschreibung überarbeiten                            | Für Relisten am ehesten sinnvoll: vorhandene Fakten verwenden, Vorschlag anzeigen und ausdrücklich übernehmen lassen. Kein neues Anbieterabo technisch nötig, wenn die bestehende serverseitige Anbindung geeignet freigegeben wird.         |
| Marke, Größe, Kategorie und Farbe aus Fotos erkennen       | Eher für neue Inserate hilfreich. Beim Relisten liegen diese Angaben bereits vor. Keine automatische kostenpflichtige Neuerkennung starten.                                                                                                  |
| Hintergrund sauber freistellen                             | Lokales Segmentierungsmodell oder ein Dienst nötig, wenn der Nutzer nicht selbst maskiert. Kann ohne entfernten Dienst gehen, erfordert aber Modellpaket, Browser-/Speicherprüfung und zusätzliche Pflege. Keine bloße Canvas-Farbkorrektur. |
| Hintergrund neu erzeugen, Flatlay oder Tragebild erstellen | Echte generative Bildbearbeitung; eigener Modell-/Auftragsweg erforderlich. Keine Kernvoraussetzung für Relisten.                                                                                                                            |
| KI-Upscaling                                               | Eigenständige Bildrekonstruktion, während normale Vergrößerung nur Pixel interpoliert. Logos, Stoff und Gebrauchsspuren müssen erhalten bleiben; Konkurrenzqualität nicht geprüft.                                                           |
| KI-Kennzeichnung                                           | Bestehende Checkbox kennzeichnet Bilder. Sie erzeugt und prüft keine Bilder.                                                                                                                                                                 |

[Fotoerkennung im Backend](../../supabase/functions/barcode-ai-search/index.ts) nutzt bereits eine echte serverseitige OpenAI-Anbindung. Dieser vorhandene Foto-/Produktsuchweg erzwingt jedoch Websuche und ist nicht unverändert als schlanke Inseratshilfe geeignet. Anbieteranbindung gegebenenfalls wiederverwenden; fachlich getrennten Auftrag, Rechte, begrenzte Kosten und strukturierte Vorschläge vorsehen. Die ältere `AiAssistantService`-Fotosimulation anhand von Dateinamen ist keine produktive Vision-Anbindung.

Vintz’ am 21.10. untersuchter Angebots-Score besteht aus festen Browserregeln und erfordert keinen KI-Aufruf. Er ist kein gemessener Verkaufserfolg; für Flipbase entsteht daraus kein Anlass für einen weiteren Score oder zusätzliche Tipps.

Für KI-Text später vorzugsweise eine ausdrückliche Aktion, Vergleich mit dem Original und getrenntes Übernehmen von Titel/Beschreibung. Keine Änderungen an inzwischen bearbeiteten Feldern. Für Fotoerkennung Vorschläge gegen echte Marken-/Kategoriedaten auflösen und unsichere Angaben leer lassen. Keine neuen Zustands-, Echtheits- oder Versandbehauptungen erzeugen.

## Empfohlene Reihenfolge

1. Die vier bestehenden Qualitäts-/Auftragslücken korrigieren und mit konkreten Regressionen sichern. Keine neue KI-Abhängigkeit.
2. Originale, Vorschau und Rücksetzen fertigstellen; danach optional wenige Rahmen-/Lichtoptionen aus den vorhandenen lokalen Werkzeugen ergänzen. Zwei Relistschritte und knappe Oberfläche erhalten.
3. Optional Titel/Beschreibung über die bestehende Anbieteranbindung überarbeiten lassen. Das ist ein eigener kleiner Fachablauf, kein automatischer Teil jedes Relistings.
4. Bildgenerierung, Fotoerkennung für neue Inserate, Sammel-Relisten und wiederkehrende Regeln getrennt priorisieren. Sie für diesen Einzelablauf nicht stillschweigend als fehlende Pflichtfunktionen ergänzen.

## Tatsächlich ausgeführte Prüfung

- Git-Stand und ungesicherte Dateien kontrolliert, `git fetch origin --prune`; Aufgabenstand enthält den aktuellen Hauptzweig. Keine fremden Änderungen oder Arbeitskopien verändert.
- Genannte Analysen sowie betroffene Editor-, Medien-, Bildoptimierer-, Auftrags-, SQL- und Abgleichspfade gelesen. Öffentliche Primärseiten erneut aufgerufen; keine Anmeldung oder private Konkurrenzdaten gelesen.
- Zwei gezielte private Angular-/Serviceproben erfolgreich reproduziert, elf unbetroffene Fälle bewusst nicht ausgewählt. Sie bestätigen unerwünschtes Verhalten und sind keine Nachweise für eine Korrektur.
- Eigene isolierte Datenbank: vorhandene 39 Cloudfälle und zwei zusätzliche Zustandsproben ausgeführt; gesamte Transaktion zurückgerollt. Kein Produktivkonto, Bild oder Inserat geändert.
- Private Probeunterlagen: `C:/Users/Grisc/.codex/tmp/vinted-relist-comparison-probes.log`, `C:/Users/Grisc/.codex/tmp/vinted-relist-comparison-state-probe.log`, SQL unter `C:/Users/Grisc/.codex/tmp/vinted-relist-db-review/comparison-state-probe.sql`. Probequellen unter `C:/Users/Grisc/.codex/tmp/vinted-relist-db-review/comparison-probes/` erhalten; die dafür ergänzte private QA-Kopie anschließend wieder auf den Aufgabenstand zurückgeführt.
- Für die Dokumentation gezielt Prettier und Unterschiedskontrolle. Keine Anwendung neu gebaut und keine bestandene Gesamtsuite für diesen neuen Analyseumfang behauptet. Die zuvor dokumentierten Pflichtprüfungen auf GitHub bleiben offen.
