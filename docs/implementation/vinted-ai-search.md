# AI Search im Vinted-Feed

Stand: 07.11.2026. Erste Stufe ausschließlich für Plattformadmins mit gültigem
Zugang zum ausgewählten Arbeitsbereich. Der vorhandene serverseitige
`OPENAI_API_KEY` wird unverändert verwendet.

## Ablauf und Ergebnisse

„AI Search“ auf einer Feed-Karte öffnet den gemeinsamen Dialog. Erst nach der
Modellauswahl und dem Klick auf „Suchen“ startet die Recherche. Der Browser sendet nur Arbeitsbereich, Inserat-ID und Modell. Die
Edge Function `vinted-ai-search` liest die gespeicherten Inseratdaten und lädt
anschließend die öffentliche Vinted-Inseratseite ohne Anmeldung nach (maximal
sieben Sekunden, drei MB, keine Weiterleitungen). Aus den React-Datensätzen
werden ausschließlich Beschreibung und Fotos mit passender Inseratkennung
übernommen. Fremde Empfehlungen, Verkäuferdaten und ausführbare Scripts werden
nicht übernommen. Bei gesperrter oder veränderter Seite bleiben die gespeicherten
Daten erhalten; der Dialog kennzeichnet den fehlgeschlagenen Detailabruf.

Die Modellbestimmung erhält Titel, Beschreibung (maximal 5.000 Zeichen), Marke,
Größe, Zustand, Inserat-URL, Artikelpreis und gemeldeten Gesamtpreis einschließlich
Käuferschutz sowie **alle verfügbaren sicheren Fotos** (bis zur Kataloggrenze von
100). Die frühere Begrenzung auf fünf entfällt. Die Anzahl im Ergebnis bezeichnet
die tatsächlich übergebenen Fotos. Fehlen Bilder oder Beschreibung, werden sie
nicht erfunden. EUR bleibt die unterstützte Währung.

Die Recherche besteht aus drei ausdrücklich getrennten Responses-Anfragen mit
dem vom Nutzer gewählten Modell:

1. Modellbestimmung anhand sämtlicher Fotos, sichtbarer Etiketten und Merkmale,
   mit Webabgleich und begründeter Unsicherheit.
2. Neupreisrecherche bei Hersteller, Shops und passenden Preisvergleichsplattformen
   einschließlich Idealo. Ausgelaufene Varianten und ähnliche Nachfolger bleiben
   unterscheidbar.
3. Gebrauchtmarktrecherche mit getrennten Suchen nach laufenden und verkauften
   Angeboten, insbesondere Vinted, eBay und Kleinanzeigen; dazu eine begründete
   Einschätzung zum konkreten Einkauf.

Die Marktanfragen laufen nach der Modellbestimmung parallel und erhalten deren
Ergebnis. Jede Teilrecherche muss das Webwerkzeug verwenden. Modellbegründung,
Marktzusammenfassung, konkrete Lücken und bis zu sechs benannte Quellen pro
Bereich bleiben auch ohne passenden Preis sichtbar. Quellen müssen in den echten
Webwerkzeugausgaben oder URL-Zitaten derselben Recherche vorkommen. Interne
Zitiermarker werden entfernt; URLs erscheinen als bedienbare Links.

Preisvergleiche benötigen eine gefundene HTTPS-Quelle und EUR. Ähnliche Varianten
bleiben sichtbar gekennzeichnet, fließen aber nicht in Durchschnittswerte oder
die rechnerische Spanne ein. Das untersuchte Inserat selbst zählt nicht als
Vergleich, auch nicht unter einer anderen Vinted-Länderdomain. Trackingvarianten
werden mit gefundenen Quellen abgeglichen; dieselbe Produktseite zählt nur einmal.
Hersteller-/Shopneupreise, tatsächlich belegte Gebrauchtverkäufe und geforderte
Gebrauchtpreise bleiben getrennt. Ein „verkauft“-Status belegt keinen tatsächlich
gezahlten Preis. Erkennung, Preiszuordnung und textliche Bewertung bleiben
KI-Ergebnisse, keine Echtheitsprüfung oder unabhängige Preisverifikation.

## Wiederverkaufsbewertung

Die Analyse bewertet Modell, Zustand, Marktlage und den konkreten Einkauf anhand
der recherchierten Belege. Die manuellen Versand-, Gebühren- und Zusatzkostenfelder
entfallen. Einkauf einschließlich gemeldetem Käuferschutz bleibt sichtbar; der
Preisabstand ist ausdrücklich vor Versand, Verkaufsgebühren und Steuern und wird
nicht als Gewinn ausgegeben. Die frühere Gewinnampel entfällt im Dialog.

Eine zusätzliche rechnerische Spanne entsteht bei identifiziertem oder begründet
wahrscheinlichem Modell und mindestens drei passenden Gebrauchtpreisen. Bei
wahrscheinlicher Zuordnung steht ausdrücklich „vorläufig“. Unbekannte Modelle
und bloß ähnliche Vergleiche erlauben keine solche Spanne. Belegte Verkäufe haben
Vorrang; verwendet werden unteres und oberes Quartil. Reine Angebote erhalten
weiterhin 15–30 % Abschlag. Diese Heuristik ist nicht anhand realer Wiederverkäufe
kalibriert. Eine textliche, als solche begründete KI-Schätzung auf eingeschränkter
Vergleichsbasis ersetzt keinen rechnerisch belegten Marktwert.

## Modelle und Kosten

Vor jeder Suche stehen `gpt-6-luna`, `gpt-6.1-terra`, `gpt-6.1-sol` und
`gpt-6-astra` zur Auswahl. Luna bleibt vorausgewählt. Das Öffnen und Wechseln
der Auswahl erzeugt keine Analyse; erst „Suchen“ startet den gewählten Lauf.
Bereits getestete Modelle bleiben im Dialog zum Vergleich von Identifikation,
Spanne, Tokens, Webaufrufen und Kosten erhalten. Die Anfragen verwenden
`reasoning.effort=medium`, hohen Suchkontext und beantragte Werkzeugbudgets von
4/5/6 sowie Ausgabelimits von 2.600/4.800/4.800 Tokens. Die tatsächlichen
Werkzeugausgaben werden gezählt; die beantragten Budgets sind kein Ersatz für
diesen Verbrauchsnachweis. Alle drei Anfragen teilen sich 85 Sekunden ab Beginn
der Modellbestimmung und verwenden `store=false`. Mit dem begrenzten Detailabruf
bleibt die vorhandene Servergrenze von 95 Sekunden bestehen. Es gibt keine
automatischen Wiederholungen oder Modellwechsel.

Unvollständige Modellbestimmung führt zum vorhandenen Analysefehler; gemeldeter
Verbrauch bleibt erhalten. Eine gescheiterte Marktrecherche erhält einen sichtbaren
Teilfehler und unterdrückt erfolgreiche andere Ergebnisse nicht. Solche Teilergebnisse
werden nicht als vollständiger 24-Stunden-Cache wiederverwendet. Vollständig
gemeldete Tokens werden über alle Anfragen addiert. Fehlt bei einer abgerissenen
Anfrage der Verbrauch, bleiben Gesamttokens und Gesamtkosten unbekannt; bekannte
Werkzeugausgaben werden weiter erfasst. Unbekannte Teilkosten werden nicht als
kostenlos behandelt.

Die [OpenAI-Preisliste](https://developers.openai.com/api/docs/pricing) und die
[Luna-Modellseite](https://developers.openai.com/api/docs/models/gpt-6-luna)
wurden am 06.11.2026 geprüft. Hinterlegte Standardpreise in USD:

| Modell        | Eingabe / 1 Mio. | Gecacht / 1 Mio. | Ausgabe / 1 Mio. |
| ------------- | ---------------: | ---------------: | ---------------: |
| GPT-6 Luna    |             0,10 |             0,01 |             0,50 |
| GPT-6.1 Terra |             1,00 |             0,05 |             5,00 |
| GPT-6.1 Sol   |             2,00 |             0,10 |            10,00 |
| GPT-6 Astra   |            10,00 |             1,00 |            50,00 |

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
über alle Arbeitsbereiche und alle freigegebenen Modelle hinweg. Identische erfolgreiche
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
Hell/Dunkel, Maus/Touch, AXE, Ladezustand, Adminsichtbarkeit, bedienbare Quellen ohne Kostenformular,
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

## Nachweis mit dem gemeldeten Carhartt-Inserat am 07.11.2026

Beim [gemeldeten Inserat](https://www.vinted.de/items/10693973187-giacca-carhartt)
enthielt der Feed ein Bild ohne Beschreibung, die öffentliche Detailseite dagegen
sechs Bilder und den italienischen Beschreibungstext. Der begrenzte Detailparser
hat beides auch auf dem bestehenden Server gelesen. Ein reservierter Pilotlauf
mit dem vorhandenen Serverzugang und `gpt-6-astra` erfasste Modellbestimmung sowie
beide Marktbereiche erfolgreich in 82 Sekunden. Ergebnis: wahrscheinlich Carhartt
WIP Prentis Liner, Wax/Wall; acht konkrete Neu-/Gebrauchtvergleiche, sämtlich mit
Variantenabweichung gekennzeichnet. Keine tatsächlich gezahlten Gebrauchtpreise
belegt. Textliche Schätzung 55–75 EUR ausdrücklich aus eingeschränkt passenden
Angebotspreisen; keine exakte Vergleichsspanne und keine Gewinnbehauptung.

Der Pilot meldete 135.029 Eingabe-, 4.755 Ausgabetokens und 18 Werkzeugausgaben,
geschätzt 1,76804 USD. Reservierung und Verbrauch wurden über den bestehenden
serverseitigen Erfassungsweg gespeichert. Schlüssel blieben im vorhandenen
Functions-Container. Kein Funktionscode wurde produktiv ersetzt. Dieser einzelne
Pilot ist kein allgemeiner Qualitäts-, Kosten- oder Laufzeitdurchschnitt; das
Zeitbudget ist knapp. Anschließend wurde die Quellenliste auf explizit benannte,
gegen echte Werkzeugquellen geprüfte Belege begrenzt; dieser Ausgabezusatz ist
separat synthetisch geprüft. Private Protokolle:
`C:/Users/Grisc/.codex/tmp/flipbase-feed-ai-research/`.
