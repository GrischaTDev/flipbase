# AI Search im Vinted-Feed

Stand: 06.11.2026. Erste Stufe ausschließlich für Plattformadmins mit gültigem
Zugang zum ausgewählten Arbeitsbereich. Der vorhandene serverseitige
`OPENAI_API_KEY` wird unverändert verwendet.

## Ablauf und Ergebnisse

„AI Search“ auf einer Feed-Karte öffnet den gemeinsamen Dialog und startet die
Recherche. Der Browser sendet nur Arbeitsbereich, Inserat-ID und Modell. Die
Edge Function `vinted-ai-search` liest Titel, vorhandene Beschreibung, Preise,
Marke, Größe, Zustand und bis zu fünf unterschiedliche HTTPS-Fotos von
`*.vinted.net` aus dem gespeicherten Feed-Inserat. Fehlende Beschreibung und
Bildanzahl werden im Ergebnis sichtbar; nicht vorhandene Angaben werden nicht
ergänzt. Inserate mit anderer Währung als EUR sind zunächst ausgeschlossen.

Das Modell identifiziert die offizielle Modellvariante und recherchiert
Hersteller, bekannte Shops und Gebrauchtangebote. Vergleichspreise benötigen
eine konkrete, in der API-Websuche enthaltene HTTPS-Quelle, EUR und dieselbe
Variante. Mehrere Query-Links derselben Seite zählen nur einmal. Hersteller-
und Shop-Neupreise, belegte Verkaufspreise und Angebotspreise werden getrennt
ausgegeben. Ein „verkauft“-Status belegt nicht den tatsächlich gezahlten Preis.
Die Erkennung und Zuordnung bleiben KI-Ergebnisse, keine Echtheitsprüfung.

## Gewinnspanne und Ampel

Eine Spanne entsteht nur bei eindeutiger Modellzuordnung und mindestens drei
vergleichbaren Gebrauchtpreisen. Belegte Verkäufe haben Vorrang. Verwendet
werden das untere und obere Quartil der Stichprobe; bei kleinen Stichproben
wird nach außen gerundet. Sind nur Angebote vorhanden, wird die Spanne mit
15–30 % Abschlag als Angebots-Schätzung ausgewiesen. Diese erste Heuristik ist
noch nicht anhand realer Wiederverkäufe kalibriert.

Abgezogen werden mindestens der Artikelpreis beziehungsweise der höhere
gemeldete Gesamtpreis einschließlich Käuferschutz, eingegebener Einkaufsversand,
prozentuale Verkaufsgebühren und weitere Kosten einschließlich Verkaufsversand.
Änderungen dieser Kosten rechnen lokal und lösen keine neue API-Anfrage aus.
Der ausgewiesene Überschuss gilt vor Steuern.

- Grün: belegte Verkäufe und bereits am unteren Ende mindestens 20 EUR sowie
  30 % Überschuss auf den gesamten kalkulierten Einkauf.
- Gelb: positiver Spielraum, der diese Bedingungen nicht erreicht, oder eine
  ausschließlich aus Angebotspreisen abgeleitete Schätzung.
- Rot: selbst das obere Ende liefert keinen positiven Überschuss.
- Ohne ausreichende Daten oder mit ungültigen Kosten: keine Ampel.

## Modelle und Kosten

Standard ist `gpt-6-luna`, ein Vergleich mit `gpt-6.1-sol` startet nur über einen
zusätzlichen, ausdrücklich als kostenpflichtig beschrifteten Klick. Das erste
Ergebnis bleibt für den direkten Vergleich von Identifikation, Spanne und
Kosten erhalten. Beide verwenden dieselben Bilder und Recherchegrenzen:
`reasoning.effort=low`, maximal 3 Webwerkzeugaufrufe, 3.200 Ausgabetokens,
85 Sekunden Anbieterzeit und `store=false`. Titel und Beschreibung sind auf
300 beziehungsweise 5.000 Zeichen begrenzt. Es gibt keine automatischen
Wiederholungen und keine automatische Eskalation auf das größere Modell.

Die [OpenAI-Preisliste](https://developers.openai.com/api/docs/pricing) und die
[Luna-Modellseite](https://developers.openai.com/api/docs/models/gpt-6-luna)
wurden am 06.11.2026 geprüft. Hinterlegte Standardpreise in USD:

| Modell      | Eingabe / 1 Mio. | Gecacht / 1 Mio. | Ausgabe / 1 Mio. |
| ----------- | ---------------: | ---------------: | ---------------: |
| GPT-6 Luna  |             0,10 |             0,01 |             0,50 |
| GPT-6.1 Sol |             2,00 |             0,10 |            10,00 |

Zusätzlich 0,01 USD je Webwerkzeugaufruf; Suchinhaltstokens werden zum Modelltarif
berechnet. Die Erfassung verwendet die von der Responses API gemeldeten Ein-,
Cache- und Ausgabetokens einschließlich interner Ausgabetokens, zählt die
`web_search_call`-Ausgaben und speichert den verwendeten Tarif mit Datum.
Beispiel: 1.000 Eingabe-, 500 Ausgabetokens und zwei Webaufrufe ergeben bei Luna
ohne Cache ungefähr 0,02035 USD. Das ist ein Rechenbeispiel, kein gemessener
Durchschnitt echter Inserate. Rechnungsbetrag, Steuern und Wechselkurse sind
nicht Bestandteil dieser Schätzung.

## Verbrauch und Begrenzung

`public.vinted_ai_searches` speichert je kostenpflichtig reservierter Anfrage
Nutzer, Arbeitsbereich, Inserat-ID ohne löschenden Inserat-Fremdschlüssel,
Eingabehash, Modell, Status, Antwortkennung, Verbrauch, Kostenschätzung,
Tarifaufnahme, Ergebnis und Zeitpunkte. Bilddateien und Inseratbeschreibung
werden nicht im Protokoll dupliziert. Das Ergebnis enthält die begrenzte
Modellerkennung und Preisquellen. Ein gelöschter Nutzer oder Arbeitsbereich
entfernt seine Analysezeilen.

Eine Dienstrollen-RPC prüft die Adminrolle und den konkreten Workspacezugang
erneut und serialisiert Reservierungen je Nutzer. Maximal eine laufende
Analyse, 20 neue Anfragen pro rollender Stunde und 100 pro rollendem Tag gelten
über alle Arbeitsbereiche und beide Modelle hinweg. Identische erfolgreiche
Ergebnisse werden nutzer-, arbeitsbereichs- und modellgebunden 24 Stunden
wiederverwendet, auch wenn das Anfragekontingent bereits ausgeschöpft ist.
Inhalt, Bilder, Preisänderungen und Promptversion bestimmen den Cachehash.

Die Reservierung muss vor dem Anbieteraufruf dauerhaft bestehen. Gemeldeter
Verbrauch wird vor der Ergebnisvalidierung gespeichert, auch bei unvollständigen
Antworten. Abbrüche ohne vollständigen Verbrauch bleiben ausdrücklich
`unknown` mit NULL-Kosten. Ein zwei Minuten alter offener Request gilt beim
nächsten Start als unterbrochen. Fehlende Erfassung verhindert neue Aufrufe.
Der Dialog zeigt den gespeicherten eigenen 30-Tage-Verbrauch im Arbeitsbereich
je Modell, Durchschnitt der bekannten Kosten und Anzahl ungeklärter Anfragen.
Cachetreffer erzeugen keine neue kostenpflichtige Zeile.

RLS erlaubt ausschließlich Admins das Lesen eigener Zeilen in zugänglichen
Arbeitsbereichen. Browser haben keine Schreib- oder Sequenzrechte; die
Reservierungsfunktion ist ausschließlich für `service_role` ausführbar.
Spätere Monatskontingente oder Kundencredits sind noch nicht freigeschaltet.
Für die spätere Kalkulation sind Token- **und** Werkzeugkosten maßgeblich.

## Migration, Tests und Freischaltung

Die Migration wurde mit der Projekt-CLI gegen eine aus den bisherigen
Migrationen frisch aufgebaute, isolierte PostgreSQL-Instanz erzeugt. Die
CLI-Diffausgabe wird übernommen; der bestehende Abschlusshelfer ergänzt die
vom Diff ausgelassenen expliziten Rechte direkt aus dem deklarativen Schema:

```sh
node scripts/marketplace-migration-permissions.mjs --vinted-ai-search
```

Der Abschlusshelfer akzeptiert nur eine neue, noch nicht versionierte
Migration. Ein Neuaufbau aus dem generierten Diff ist nötig, wenn sich der
Rechtevertrag nach dem Abschluss ändert. Bereits veröffentlichte Migrationen
werden nie nachbearbeitet. Datenbanktypen wurden für `public,graphql_public`
aus der isolierten Datenbank neu erzeugt.

Edge-Fälle sind im bestehenden Marketplace-Deno-Job registriert; die
Änderungsauswahl aktiviert diesen Job für den neuen Funktionsordner.
SQL-Fälle laufen mit der bestehenden Datenbanksuite. Die neuen Browserfälle
stehen in der bereits registrierten Feed-Datei und prüfen 320/390/834/1440 px,
Hell/Dunkel, Maus/Touch, AXE, Ladezustand, Adminsichtbarkeit, lokale Kostenrechnung,
Modellvergleich, Escape/Rückfokus und verspätete Antworten nach dem Schließen.
Alle Entwicklungsdaten und Anbieterantworten dieser Prüfungen sind synthetisch.

Die [Freischaltung auf dem selbst gehosteten Server](../../deploy/README.md)
benötigt vor dem ersten realen Klick die Migration und das Übertragen des neuen
Funktionsordners samt gemeinsamem Import. Die vorhandene Schlüsselweitergabe
bleibt bestehen. Vor einem Merge sind sämtliche ausgewählten CI-Pflichtprüfungen
erforderlich. Erst der anschließende Admin-Pilot mit echten freigegebenen
Artikeln liefert belastbare Werte für Erkennungsqualität, Laufzeit, Trefferquote
und Durchschnittskosten. Der Standard ist ein kostengünstiger Startkandidat;
ein nachgewiesener Qualitätsvorteil eines Modells wird noch nicht behauptet.
