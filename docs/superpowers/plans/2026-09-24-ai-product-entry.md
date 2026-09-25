# Plan: Einheitliche Artikelerstellung und KI-Produktsuche mit mehreren Fotos

Stand: 24.09.2026 · Branch: `juna/ai-product-flow` · Grundlage: `origin/master` (`99137dfb`)

## Ziel und Erfolgskriterien

Eine Produktanlage verwendet überall dieselbe vollständige Seite `/catalog/new`. Der Einkauf bleibt beim Wechsel erhalten und erhält nach dem Speichern den neuen Artikel als Position. EAN-Scan und KI-Fotosuche stehen als Aktionen im Seitenkopf; das Formular wächst beim Suchen nicht um weitere Bedienelemente. Die Fotosuche verarbeitet mehrere Ansichten desselben Produkts, zeigt überprüfbare Vorschläge und überträgt nur normalisierte Angaben in das bearbeitbare Formular.

Die folgenden Entscheidungen konkretisieren die Nutzerbeschreibung: Ein erfolgreich im Einkauf angelegter Artikel wird dort automatisch als neue Position ergänzt. Ein Abbruch ohne Artikelspeicherung kehrt zum unveränderten Einkauf zurück. Fotos für die Suche werden nicht automatisch zu veröffentlichten Produktbildern.

## Befund im aktuellen Master

- `/catalog/new` rendert bereits die große `ProductDetailComponent`. `purchase-line-editor` öffnet dagegen die separate `ProductDialogComponent` mit EAN-Online-Suche, Scan und KI-Suche mitten im Dialog. Auch `/inventory/new` verwendet diesen Dialog. Damit existieren zwei verschiedene Oberflächen für denselben Katalogartikel.
- Auf `/catalog/new` öffnet „KI-Produktsuche mit Foto“ eine zusätzliche Karte oberhalb des Formulars. `BarcodeAiLookupService` akzeptiert derzeit genau ein Foto bis 5 MB. Die Supabase-Funktion `barcode-ai-search` nutzt `gpt-6-luna`, `web_search` und ein striktes JSON-Schema.
- Der Server lässt Webkandidaten nur mit einer URL aus den tatsächlich zurückgegebenen Suchquellen zu. Titel, Größe und Kategorie bleiben trotzdem freie Modelltexte. `useAiSuggestion()` übernimmt die Größe direkt und reicht die Kategorie nur als Suchhinweis an den Kategorie-Picker weiter. Ein Vorschlag enthält keine gesicherte Kategorie-ID.
- Der Einkauf schützt ungespeicherte Eingaben mit `unsavedEntryGuard`. Eine gewöhnliche Navigation würde eine Verlustwarnung auslösen und beim Verlassen die Komponente mit ihrem Entwurf zerstören. `ProductDetailComponent.save()` führt nach Neuanlage derzeit zu `/catalog/:id` statt zurück in den Einkauf.
- Für Produktkategorien besteht bereits eine gepflegte Hierarchie mit `ProductCategoryService` und `CategoryPickerComponent`. Die KI soll daraus eine gültige Kategorie vorschlagen, keine freie neue Kategorie erfinden.

## Gewählter Ansatz

Die Katalogseite bleibt der einzige Editor für neue Katalogprodukte. Der Einkauf übergibt einen eng definierten Rückkehrkontext und einen Entwurfsschlüssel; der Katalogeditor liefert bei Erfolg die neue Produkt-ID zurück. Für laufende KI-Suchen wird ein eigener Dialog auf dieser Seite verwendet. Die bestehende Supabase-Funktion wird gezielt erweitert, statt einen zweiten KI-Endpunkt mit abweichenden Regeln einzuführen.

Alternative 1 wäre, den Produktdialog nur optisch aufzuräumen. Das ließe weiterhin zwei Formulare mit unterschiedlichen Funktionen und doppelter Pflege bestehen. Alternative 2 wäre, den Einkauf vor jedem Seitenwechsel automatisch zu speichern. Das scheitert, wenn Verkäufer oder andere Pflichtangaben noch fehlen. Deshalb wird der ungespeicherte Einkauf für den internen Wechsel als Entwurf gesichert.

## Paket 1: Navigation und Einkaufsentwurf

1. Alle Einstiege „Produkt/Artikel erstellen“ im Katalog und in der Einkaufsauswahl auf `/catalog/new` führen. Den alten `ProductDialogComponent` danach aus dem Katalogartikel-Anlagepfad entfernen. Den Bestandseinstieg `/inventory/new` gesondert anschließen, ohne die bestehende Bestandsanlage oder ihre Barcode-Vorbelegung zu verlieren.
2. Vor dem Wechsel aus `/purchases/new` oder `/purchases/:id/edit` den aktuellen Einkaufszustand erfassen: Formularwerte, Positionsentwürfe, Preise, Kosten und zugehörige Workspace-ID. Ein kleiner, nur für diesen Ablauf zuständiger Service hält den Zustand und einen einmaligen Rückkehr-Token. Serialisierbare Daten werden zusätzlich in `sessionStorage` gehalten, damit ein Neuladen auf der Artikelseite nicht zwangsläufig den Einkauf löscht. Temporäre `File`-Objekte lassen sich dort nicht wiederherstellen; bei bereits ausgewählten, noch nicht gespeicherten Belegen wird der Wechsel mit einer klaren Meldung aufgehalten, bis sie gespeichert oder entfernt sind.
3. Nur für den erfolgreich gesicherten internen Wechsel erlaubt der Einkaufs-Guard die Navigation ohne die allgemeine Verlustwarnung. Normales Verlassen bleibt geschützt. Rückkehrkontext und Entwurf werden ausschließlich für denselben Workspace und dieselbe Sitzung akzeptiert; keine beliebige Rücksprung-URL aus einem Query-Parameter ausführen.
4. Nach erfolgreicher Artikelspeicherung zurück zum Einkaufsentwurf navigieren, Katalogprodukte neu laden und die gespeicherte Produkt-ID genau einmal als Einkaufsposition hinzufügen. Die bisherige Menge, Kosten und andere Eingaben bleiben erhalten. „Zurück“ oder „Abbrechen“ ohne Artikelspeicherung stellt den Einkauf ohne zusätzliche Position wieder her. Nach Verbrauch wird der Rückkehr-Token gelöscht. Für Start aus der Artikelliste bleibt das bisherige Verhalten: Nach dem Speichern die Artikeldetailseite öffnen.
5. Beim Wechsel des Workspaces oder ungültigem Token keine fremden Produkt- oder Einkaufsdaten übernehmen. Eine verständliche Meldung und ein sicherer Rückweg bleiben verfügbar.

## Paket 2: Fotosuche als eigener Dialog

1. Der Kopf der Artikelerstellungsseite zeigt „EAN scannen“ und „KI-Produktsuche mit Foto“. Der KI-Button öffnet `ModalShellComponent` als großen, auf Tablet und Desktop nutzbaren Dialog. Die zusätzliche KI-Karte im Formular entfällt. Es gibt keine EAN-Online-Suchschaltfläche im Artikel- oder Einkaufsformular; eine EAN-Suche bleibt Teil des vorhandenen Scan-Ablaufs.
2. In der Dialogmitte steht eine große Fotozone. Bis zu fünf JPG-, PNG- oder WebP-Bilder können nacheinander oder gemeinsam hinzugefügt werden: z. B. Karton, Etikett und Schuh. Vorschau, Dateiname, Entfernen und Reihenfolge sind sichtbar; Kameraaufnahme auf dem Tablet und Dateiauswahl am PC funktionieren über denselben Einstieg. EAN ist optional. Suche startet erst mit mindestens einem Foto oder einer gültigen EAN. Dateityp, Größe und Gesamtmenge werden vor dem Senden geprüft; Bilder werden bei Bedarf für den Upload verkleinert, ohne lesbare Etiketttexte unnötig zu zerstören.
3. Ladezustand, Fehler, Quellen und Kandidaten bleiben im Dialog. Quelle und Sicherheit werden pro Vorschlag gezeigt. „Daten übernehmen“ schließt den Dialog und füllt das normale Formular nur mit geprüften Feldern. Manuelle Änderungen bleiben danach möglich. Schließen ohne Übernahme verändert das Formular nicht. Fokus wird beim Öffnen in den Dialog und beim Schließen zum Auslöser zurückgeführt; Escape, Tabletgröße, Kontrast und AXE werden geprüft.

## Paket 3: KI-Verarbeitung und Feldregeln

1. `BarcodeAiLookupService` und `barcode-ai-search` nehmen eine begrenzte Liste von Bildern an. Der Server prüft Anzahl, Dateitypen und Gesamtgröße erneut. Die Bilder werden in einer Responses-Anfrage als getrennte `input_image`-Elemente übergeben; die Anweisung erklärt, dass alle Bilder dasselbe Produkt aus verschiedenen Blickwinkeln zeigen.
2. Zuerst lesbare Identifikatoren aus allen Bildern sammeln: EAN, Marke, Modell, Herstellerartikelnummer, Farbe, Größenangaben. Danach gezielt im Web suchen. Bildangaben und Webtreffer getrennt ausweisen. Ein Webkandidat braucht eine belegte Quelle; „exakt“ nur, wenn Kennung und konkrete Variante belegt sind. Widersprüche zwischen Foto und Quelle als unsicher markieren. Fehlt ein belastbarer Treffer, nur die abgelesenen Angaben als solchen Vorschlag zeigen.
3. Eine kleine, testbare Normalisierung zwischen KI-Antwort und Formular verwenden. Durchgehend großgeschriebene gewöhnliche Wörter werden in lesbare Schreibweise gebracht; Marken, Akronyme, EAN und Herstellerkennungen behalten ihre korrekte Schreibweise. Größe wird als **eine EU-Größe** gespeichert: `EU 37 / UK 3` wird `37`; `US 5` allein bleibt leer, solange keine verlässliche EU-Entsprechung mit passender Produktart und Größentabelle belegt ist. Gemischte oder widersprüchliche Größen gelangen nicht unverändert ins Formular.
4. Eine Kategorie wird aus Produktmerkmalen und belegten Webangaben gegen die vorhandene Kategoriehierarchie ermittelt. Der Vorschlag zeigt den gefundenen Kategoriepfad und setzt eine vorhandene Kategorie-ID nur bei eindeutigem Treffer. Bei Mehrdeutigkeit bleibt das Feld offen und der Nutzer wählt im vorhandenen Picker. Keine neue Kategorie durch die KI anlegen.
5. Der strukturierte Antwortvertrag trennt Rohangaben, normalisierte Felder, Quellen und Unsicherheit. Datenbankwerte werden erst nach ausdrücklicher Auswahl und normalisierter Formularprüfung gespeichert. Suchfotos werden nicht automatisch als Produktmedien gespeichert.

## Paket 4: Modellwahl und Messung

OpenAI unterstützt mehrere Bilder in einem `content`-Array; jedes Bild kostet Eingabetokens. `gpt-6-luna` unterstützt Bildanalyse, Websuche und strukturierte Ausgaben und ist bereits im Projekt eingebaut. Die aktuelle Funktion fordert `reasoning.effort: 'low'` an, begrenzt die gesamte Ausgabe einschließlich unsichtbarer Denktokens auf 1.800 Tokens und bricht nach 45 Sekunden ab. Ein isolierter Wechsel auf `high` kann deshalb unvollständige Antworten oder Timeouts erzeugen; Ausgabelimit und Laufzeit müssen bei den Vergleichsläufen mitgeprüft werden.

### Zusätzliche Recherche zur Modellwahl

OpenAI nennt für Luna die Stufen `none`, `low`, `medium` (Standard), `high`, `xhigh` und `max`. Mehr Denkleistung erhöht gewöhnlich Tokenverbrauch und Wartezeit; sie ist keine Garantie für bessere Bilderkennung. `pro` ist ein separater Modus und ebenfalls kein kostenloser Qualitätsregler. OpenAI empfiehlt `xhigh`/`max` nur bei nachgewiesenem Gewinn im eigenen Anwendungsfall.

Roboflow hat die Modelle auf denselben allgemeinen Bildaufgaben mit jeweils drei Durchläufen bei `low` und `high` geprüft. Die Ergebnisse sind ein **Hinweis**, kein Test für Flipbase-Schuhe oder die Kombination mit Websuche:

| Aufgabe                  | Luna `low` | Luna `high` | Sol `low` |
| ------------------------ | ---------: | ----------: | --------: |
| Bildidentifikation       |     81,3 % |      80,2 % |    91,7 % |
| Texterkennung (OCR)      |     87,9 % |      88,5 % |    91,7 % |
| Datenfeld aus Bild lesen |     68,0 % |      66,7 % |    80,4 % |
| Visuelles Schlussfolgern |     52,1 % |      60,7 % |    72,2 % |

Gerade das Auslesen von Marke, Artikelnummer und Größe ist für Flipbase wichtig. Bei Roboflow lag Sol `low` dabei vor Luna `high`. Eine höhere Luna-Stufe verbesserte visuelles Schlussfolgern, aber nicht Identifikation oder Datenextraktion. Die allgemeinen Low-Effort-Gesamtwerte waren 68,6 % für Luna und 80,7 % für Sol. Die Roboflow-Kosten pro Beispiel ($0,0004 vs. $0,0065) enthalten nicht Flipbases Websuche und Fotosatz; sie dürfen nicht als Kosten pro Produktsuche ausgegeben werden. OpenAI berechnet aktuell $0,10/$0,50 pro Million Luna-Ein-/Ausgabetokens und $2/$10 bei Sol, zusätzlich $0,01 je Websuche und Suchinhaltstokens.

Direkte Erfahrungsberichte zu GPT-6 Luna sind zwei Tage nach Veröffentlichung noch dünn. Ein Entwickler berichtet von besserer Verarbeitung mehrerer Bilder gegenüber GPT-5.6 Luna in einem anderen Bild-/Video-Agenten. Das ist ein einzelner, nicht unabhängig geprüfter Fall und belegt weder Schuhidentifikation noch einen Vorteil von Luna gegenüber Sol.

**Empfehlung für den Prototyp:** Für die kombinierte Foto- und Websuche `gpt-6-sol` mit `low` als Qualitätskandidaten vorsehen. Die aktuelle Konfiguration Luna `low` bleibt Vergleichsbasis und kann für einfache, eindeutige EAN-Fälle wirtschaftlich bleiben. Luna `medium` und `high` gegen Sol `low` auf denselben echten Fällen messen; Sol `medium` nur ergänzen, wenn Sol `low` bei Mehrdeutigkeit Fehler macht. Luna `xhigh`/`max` und `pro` nicht als Standard einplanen. Eine bedingte zweite Suche nur vorsehen, wenn der Nutzen gegenüber einer einzigen Sol-Suche gemessen ist. Diese Empfehlung ist eine Übertragung allgemeiner Bildtests auf Flipbases Aufgabe und muss mit Produktfotos bestätigt werden.

Vor einer produktiven Modellumstellung einen kleinen, anonymisierten Testsatz echter Fälle aufbauen: eindeutiges Etikett, Karton + Schuh, verdeckte EAN, mehrere ähnliche Modelle, Uppercase-Titel, EU/US/UK-Mischgrößen, fehlende oder mehrdeutige Kategorien und widersprüchliche Quellen. Für alle Modell-/Stufenkombinationen dieselben Fälle mit identischem Prompt auswerten. Messen: richtige Produktvariante, falsche „exakt“-Treffer, korrekte EU-Größe, gültige Kategorie-ID, Anteil brauchbarer Vorschläge, Antwortzeit einschließlich P95, Timeouts und tatsächliche Gesamtkosten einschließlich Websuche. Die bisherige Kostenschätzung im Server bei jeder Modelländerung aktualisieren.

Quellen (abgerufen am 24.09.2026):

- [Mehrere Bilder und Abrechnung](https://developers.openai.com/api/docs/guides/images-vision)
- [Responses-Websuche und Quellen](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Strukturierte Ausgaben](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) und [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)
- [Denkstufen und Ausgabelimit](https://developers.openai.com/api/docs/guides/reasoning), [Modellwahl](https://developers.openai.com/api/docs/guides/model-selection) und [Preise einschließlich Websuche](https://developers.openai.com/api/docs/pricing)
- [Roboflows Bildtests: Luna](https://playground.roboflow.com/models/openai/gpt-6-luna), [Sol](https://playground.roboflow.com/models/openai/gpt-6-sol) und [Methodik](https://playground.roboflow.com/evals)
- [Ein direkter Erfahrungsbericht zur Verarbeitung mehrerer Bilder](https://www.reddit.com/r/codex/comments/1wnxl45/we_need_reviews_on_gpt_56_luna_and_gpt_6_luna_api/); anekdotisch und ohne Schuh-/Websuchtest
- [Anwendungsbezogene Evaluierung](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

## Umsetzung und Abnahme

Die Arbeit erfolgt in der Reihenfolge Navigation/Entwurfsrückkehr → Fotodialog → Serververtrag und Normalisierung → Modellvergleich. Jeder Schritt bleibt auf dem neuen Branch prüfbar. Es sind nach aktuellem Befund keine Datenbankänderungen nötig.

- Angular-Tests: Start aus Artikelliste und aus neuem/bestehendem Einkauf; Rückkehr mit und ohne Speichern; genau eine neue Position; unveränderte Entwurfsfelder; Workspace-Wechsel; Browser-Zurück; Guard-Verhalten.
- Dialogtests: Mehrfachauswahl, Vorschau/Entfernen, Grenzen, EAN ohne Foto, Foto ohne EAN, Fehler, Fokus und AXE. Visuelle Abnahme auf Tablet und Desktop nach `docs/design/admin-ui-guidelines.md`.
- Supabase-Funktionstests: mehrere Bilder, Eingabegrenzen, belegte Quellen, Widersprüche, Großschreibung, `EU 37 / UK 3`, nur `US 5`, mehrdeutige Kategorien und fehlende Webtreffer.
- Vor dem Push: betroffene Tests, Formatierung/Lint und Angular-Bau. Der PR erhält anschließend die vollständigen Pflichtprüfungen.

## Nachtrag vom 25.09.2026: Suche mit drei Fotos ohne Ergebnis

Die erste produktive Mehrfoto-Suche gab keinen nutzbaren Treffer zurück. In der vorhandenen Implementierung kann das auch passieren, wenn die Bildanalyse eine Modellvermutung erkennt: Ohne lesbares Etikett und ohne Produktseite in der eng geprüften Webquellenliste bleibt die Antwort für Nutzer leer. Die genaue Ursache dieses Falls lässt sich ohne die drei Fotos und die zugehörige Suchantwort nicht sicher feststellen.

Für den nächsten Versuch wird die Fotosuche auf Sol `low` umgestellt und um Bildsuchergebnisse erweitert. Tatsächlich gefundene Produktseiten bleiben als Webtreffer gekennzeichnet. Eine nur visuell begründete Erkennung erscheint separat mit ihrem sichtbaren Indiz und wird erst nach Auswahl in das Formular übernommen. Die EAN-Suche nutzt weiter Luna `low`. Die Funktion protokolliert nur Anzahlen zu Fotos, vorgeschlagenen und akzeptierten Webtreffern; Bildinhalt und Produkttext werden nicht gespeichert.

**Nächste Abnahme:** Dieselben drei Fotos noch einmal durch die produktiv ausgerollte Suche schicken und mit dem Chat-Ergebnis vergleichen. Dabei prüfen: richtiges Modell, nachvollziehbare Quelle oder sichtbare Kennzeichnung als Vermutung, EU-Größe nur mit Beleg, Kategoriezuordnung, Antwortzeit und tatsächliche Kosten. Falls Sol `low` das Modell weiter verfehlt, mit denselben Bildern Sol `medium` und Luna `high` vergleichen. Die Bildsuche und die dafür verfügbaren Ergebnisfelder sind in der [OpenAI-Dokumentation zur Websuche](https://developers.openai.com/api/docs/guides/tools-web-search) beschrieben.
