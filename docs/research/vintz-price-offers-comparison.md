# Vintz-Preisangebote und Angebotsautomatisierung im Vergleich mit Flipbase

Untersuchung von Juna am 17.10.2026. Auftrag: Preisangebote und deren
Automatisierung bei Vintz analysieren, mit Flipbase vergleichen und danach
stoppen. Keine Regel aktivieren oder speichern, keine Nachricht und kein
Preisangebot versenden, keine Umsetzung.

## Ergebnis

Flipbase hat bereits manuelle Angebotsaktionen, automatische Verhandlung mit
mehreren Preisstufen und echte optionale Angebote nach Favorisierung. Diese
Funktionen sind im Ausführungscode vorhanden; ihre Oberfläche wurde am selben
pausierten Konto gelesen. Es handelt sich nicht um einen neuen Produktivtest.

Vintz bündelt einige Einstellungen verständlicher und bietet insbesondere
Artikelregeln, einen Modus zur vorherigen Prüfung, einen grafischen
Favoritenablauf und eine sichtbare gemeinsame Ruhezeit. Vintz' untersuchte
Cloud-Annahmeregel ersetzt keine mehrstufige Verhandlung. Die sinnvolle
Übernahme betrifft konkrete Lücken und die Bedienung, keinen kompletten Neubau.

## Grundlage und Grenzen

- Live: Vintz-Prozugang, Konto Maike Vintage, fünf gespeicherte aktive Artikel.
  Vier auswählbar; der vom Nutzer selbst vorgemerkte Relisting-Artikel war für
  diese Auswahl gesperrt. Dessen Auftrag wurde nicht verändert.
- Vintz-Angebotsregeln aus der Bestandsauswahl und aus einer historischen
  Preisangebotskarte im Postfach gelesen. Im Konto war die Annahmeregel aus;
  es waren keine Artikelregeln gespeichert.
- Ungespeicherte Favoritenvorlage geöffnet, deren Rabattoption ausschließlich
  im lokalen Entwurf sichtbar gemacht, anschließend vollständig verworfen.
  Danach wieder zwei bestehende, pausierte Automationen und keine aktive.
- Ruhezeit und leeres Automationsprotokoll gelesen. Kein Lauf, Nachholen alter
  Favoriten oder Freigeben eines wartenden Versands ausgelöst.
- Flipbase-Oberflächen für automatische Verhandlung und Favoritennachrichten
  am selben weiterhin pausierten Konto gelesen. Beide Automatikschalter aus.
- Lokaler Flipbase-Code bei
  `e3ef736370640125c1abddcaf82de6079205d9fa`. Produktivoberfläche und lokaler
  Quellstand sind unterschiedliche Belege; die ausgelieferte Commitkennung
  wurde nicht neu bestimmt.
- Gezielt geladene Vintz-Browsermodule gelesen. Sichtbare Beschreibung und
  Client-Schnittstelle sind kein Beleg für den tatsächlichen Serverablauf.
  Keine echte Annahme, Ablehnung, Gegenangebot, Favoritennachricht oder
  Rabattberechnung auf Vinted ausgeführt.
- Keine vollständige Prüfung von Tastaturbedienung, Kontrast, AXE oder
  Browsermatrix. Bestehende Flipbase-Testdefinitionen nicht ausgeführt.

## Drei Abläufe auseinanderhalten

| Ablauf                           | Auslöser                                | Erwartete Aktion                                                                             |
| -------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Eingehendes Preisangebot         | Käufer bietet einen Preis               | Manuell annehmen, gegenbieten oder anderweitig behandeln; optional automatische Annahmeregel |
| Favoriten-Nachfassen             | Interessent favorisiert eigenen Artikel | Nachricht vorbereiten oder senden; optional privates Rabattangebot                           |
| Öffentlichen Artikelpreis ändern | Verkäufer ändert den gelisteten Preis   | Allgemeiner Angebotspreis ändert sich; das ist eine andere Funktion                          |

Ein privates Rabattangebot senkt laut Vintz-Oberfläche den öffentlichen Preis
nicht. Ein angenommenes Preisangebot ist außerdem noch kein bestätigter Kauf.
Diese Trennung ist auch in Flipbase bereits ausdrücklich vorhanden.

## Vintz: Regeln für eingehende Preisangebote

### Kontoregel im Postfach

In einer vorhandenen Angebotskarte lässt sich hinter „Details“ die
„Angebotsregel“ aufklappen. Der entsprechende Bereich ist in die Unterhaltung
eingebettet; es ist kein eigener Dialog. Die untersuchte Unterhaltung enthielt
ein bereits angenommenes Angebot und diente nur zur Ansicht der Einstellungen.
Auch „Erhalten“ enthält in der Stichprobe bereits angenommene Angebote; seine
Anzahl darf nicht als Anzahl noch offener Entscheidungen verstanden werden.

Gelesener Zustand und Möglichkeiten:

| Feld          | Zustand / Bedeutung                                   |
| ------------- | ----------------------------------------------------- |
| An            | Aus; Angebote werden nur angezeigt                    |
| Modus         | Prüfung erforderlich oder Automatisch annehmen        |
| Mindestpreis  | Optionaler absoluter Betrag                           |
| Max. Rabatt   | 10 Prozent im geladenen Ausgangszustand               |
| Wartezeit     | Mindestens 5, höchstens 15 Minuten im Ausgangszustand |
| Artikelregeln | Keine gespeichert                                     |
| Anwenden      | Ausdrückliche Schaltfläche „Regel speichern“          |

Die Beschreibung des eingeschalteten Modells lautet sinngemäß: Angebote bis
zum maximalen Rabatt und mindestens zum optionalen Mindestpreis werden nach
der Wartezeit angenommen; im Prüfmodus wird die Annahme vorgeschlagen und der
Nutzer entscheidet. Eine automatische Gegenangebotsfolge oder automatische
Ablehnung unterhalb der Grenze wurde in diesem Cloud-Regelpfad nicht gefunden.

Der Client speichert eine Kontoregel mit `itemId: null`, Modus `review` oder
`auto`, Preisgrenzen und Verzögerung über `PUT /api/seller/offer-rules`.
`activeFrom` und `activeTo` werden in dieser Maske als `null` übertragen;
die Zeitzone wird aus dem Browser übernommen. Ein eigenes Zeitfenster oder
eine tägliche Versandquote ist hier nicht einstellbar.

### Regeln für ausgewählte Artikel

Bestandsauswahl → „Angebote“ öffnet die gemeinsame Prüfmaske. Das Wort
„Angebote“ bezeichnet hier die Regelverwaltung; es versendet nicht unmittelbar
einen einmaligen Preisvorschlag an sämtliche Favoriten.

- Regel an/aus, Prüfmodus oder automatische Annahme.
- Mindestpreis als Prozentwert zur gemeinsamen Vorbereitung; Standard 75.
- Maximaler Rabatt; Standard 10 Prozent.
- Minimale/maximale Wartezeit; Standard 5–15 Minuten.
- Pro Artikel Vorschau mit aktuellem Preis und absolutem Mindestpreis.
- Abschnitt für gespeicherte Artikelregeln.
- Höchstens fünf Artikel pro Speichervorgang laut gelesenem Clientcode.

Die vier lokalen Mindestpreisvorschauen bei 75 Prozent waren:

| Artikel            | Listenpreis | Angezeigter Mindestpreis |
| ------------------ | ----------- | ------------------------ |
| Ralph-Lauren-Jacke | 38,90 €     | 29,18 €                  |
| Nike-Hose          | 17,99 €     | 13,49 €                  |
| Puma-Jacke         | 36,90 €     | 27,68 €                  |
| Burberry-Schal     | 39,90 €     | 29,93 €                  |

**Wichtig:** Der Browser berechnet daraus einen absoluten Betrag und überträgt
`minPrice`, nicht „75 Prozent“ als dauerhaft dynamische Formel. Ob dieser Betrag
nach einer späteren Preisänderung automatisch angepasst wird, ist nicht belegt.

Mindestpreis und maximaler Rabatt wirken laut Beschreibung gemeinsam.
Beispiel: Bei 100 Euro Listenpreis, 75 Euro Mindestpreis und höchstens zehn
Prozent Rabatt wäre eine Annahmegrenze von 90 Euro zu erwarten. Die allein
angezeigte Mindestpreisvorschau von 75 Euro erklärt diese kombinierte Grenze
noch nicht. Serverberechnung und Rundung wurden nicht durch eine echte
Annahme geprüft.

Gelesene Clientvalidierung: Mindestpreis-Prozent 1–100, maximaler Rabatt 0–90
mit höchstens einer Dezimalstelle, Wartezeiten ganzzahlig 0–1440 Minuten und
Minimum nicht größer als Maximum. Fehlende gültige aktuelle Artikelpreise
blockieren die gemeinsame Übernahme. Das sind gelesene Prüfungen, keine
erfolgreich ausgeführten Grenzwerttests auf dem Server.

Beim Speichern würde je Artikel eine eigene PUT-Anfrage gestellt; erfolgreiche
Einträge werden aus der Auswahl entfernt, Teilfehler mit Konto, Artikel und
Grund gesammelt. Reihenfolge und Vorrang einer Artikelregel gegenüber der
Kontoregel sind ohne Serversicht nicht abschließend belegt. Die vorhandene
Artikelregelverwaltung kann laut Code Regeln abschalten oder löschen; beides
wurde nicht bedient. Ob ein Abschalten schon vorgemerkte Annahmen sicher
storniert, bleibt offen.

## Vintz: manuelle Angebotsaktionen und Preisassistent

Der gelesene Cloud-Postfachpfad bietet bei nachweislich offenen Angeboten
Annehmen, Gegenangebot und Ignorieren. In dieser Sitzung lagen in der
untersuchten Ansicht bereits angenommene Angebote vor; keine dieser
Schreibaktionen wurde ausprobiert.

**Ignorieren bedeutet laut Code ausdrücklich nur „in Vintz ignoriert, nichts
an Vinted gesendet“.** Das darf nicht als echte Ablehnung bei Vinted gelten.
Bei einer geplanten Annahme heißt die entsprechende Aktion „Cancel“; ihr
tatsächlicher Abbruch wurde nicht getestet.

Gegenangebote verlangen im gelesenen Cloudformular einen centgenauen Betrag
über dem Käuferangebot und unter dem Listenpreis. Der Client übergibt die
erwarteten Käuferpreis-Cents und eine Anfragekennung, lädt danach den Status
nach und kennt wartend, läuft, erfolgreich, fehlgeschlagen sowie erforderliche
Nachprüfung. Bei unklarem Gegenangebotsausgang soll der Nutzer auf Vinted
prüfen. Die Oberfläche beschreibt einen erneuten Offenheitscheck vor dem
Versand; dessen Serverausführung wurde nicht beobachtet.

Der untersuchte Client erzeugt beim Absenden eine Anfragekennung. Eine über
alle erneuten Versuche dauerhaft wiederverwendete Kennung ist in diesem
Handler nicht erkennbar. Das ist eine Beweisgrenze, kein Nachweis fehlenden
serverseitigen Wiederholschutzes.

Die Angebotskarte zeigt Listenpreis, Rabatt, Status, Regelschwelle und eine
Gewinnschätzung bei bekannten Einkaufskosten. Der unter „Erhalten“ betrachtete
Beleg war historisch angenommen; daraus wird kein Erfolg einer heutigen
Vintz-Automation abgeleitet. Einkaufskosten wurden nicht eingetragen.

Zusätzlich enthält geladener Code einen **separaten Preisassistenten** mit
Mindestpreis, Einkaufskosten, Zielgewinn, Annahmegrenze und Gegenangebotsbereich.
Er berechnet Vorschläge für Annehmen/Gegenangebot/Ablehnen und erzwingt dort
`reviewRequired: true`. Beispielsweise geht die größere Grenze aus absolutem
Mindestpreis und Einkaufskosten plus Zielgewinn ein. Diese zusätzlichen
Vorschlagsregeln sind nicht identisch mit der Cloud-Autoannahmeregel und
belegen keine automatisch ausgeführte Ablehnung oder Gegenangebotsserie.
Die konkrete Assistentenmaske wurde in diesem Schritt nicht vollständig live
bedient.

## Vintz: Nachricht und Rabatt nach Favorisierung

### Vorbereitung und Versandmodus

Automationen → Neue Automatisierung → Vorlage „Nach einem Favoriten nachfassen“
öffnet zunächst einen **ungespeicherten** Ablauf:

1. Ein Käufer favorisiert ein aktives Angebot.
2. Standardmäßig einen Tag warten.
3. Nachricht zur Prüfung vorbereiten.

Sichtbar sind Erst prüfen oder Automatisch senden. Die Nachricht ist editierbar,
mit Platzhaltern für Käufername und Artikeltitel. Der Ausgangstext war in dieser
deutschen Sitzung englisch. Ein neuer lokaler Entwurf trägt intern bereits
`enabled: true`, wird aber erst nach ausdrücklichem Speichern übernommen.
Die Anzeige „Automatisierung ist an“ innerhalb dieses ungespeicherten Entwurfs
ist daher leicht missverständlich. Es wurde kein Entwurf gespeichert.

Die Ablaufoberfläche erlaubt weitere Bedingungen, Warte- und Nachrichtenschritte.
Favoritenbedingungen können Angebotstitel, Käufername oder Benachrichtigung
betreffen. Der allgemeine Zeitplanbaustein war für diesen Favoritenablauf nicht
verfügbar, sondern als nur für Angebots-Automatisierungen gekennzeichnet.
Aus einem allgemein verfügbaren Baustein darf keine beliebige ausführbare
Kombination abgeleitet werden.

Der gelesene Validator verlangt einen zusammenhängenden Ablauf, genau einen
Favoritenauslöser, mindestens eine Nachricht, vollständige Bedingungen und ein
Nachrichtenende. Mehrere Nachrichtenschritte sind im Modell möglich; tatsächliche
Folgen und ihre Behandlung nach Käuferantwort wurden nicht ausgeführt.

### Echtes privates Rabattangebot

Die Checkbox „Mit dieser Nachricht einen Rabatt senden“ blendet ein:

- Prozentnachlass, regulär im Client auf **1–40 Prozent** begrenzt.
- Absoluten Mindestpreis; im lokalen Ausgangsentwurf null Euro.
- Hinweis: aktueller Artikelpreis und dessen Währung; privates Vinted-Angebot,
  öffentlicher Listenpreis bleibt unverändert.

Diese Werte hängen im Ablaufmodell an der jeweiligen Nachrichtenaktion.
Das erlaubt mehr als eine einzige kontoweite Nachlassvorgabe im Modell.
Ein fester Euro-Nachlass ist in der untersuchten Vintz-Favoritenmaske nicht
angeboten. Verhalten bei einem Mindestpreis über dem aktuellen Artikelpreis,
Cent-Rundung, Versand-Reihenfolge von Nachricht und Angebot, Teilerfolg und
tatsächliche Marktannahme bleiben ohne Ausführung offen.

### Konten, Nachholen und Mengenbegrenzung

Die Vorlage kann ausgewählten Serverkonten zugeordnet werden. Laut Oberfläche
laufen diese auch bei geschlossenem Browser; öffentliche Änderungen erlauben
eine private Bestätigung. Der Browsercode kennt getrennte Funktionen und
Fähigkeitsprüfungen für Serverkonten und Vintz Connect. Im aktuellen Zugang
wurde nur das verbundene Cloudkonto betrachtet, kein Erweiterungsablauf getestet.

„Frühere Favoriten nachholen“ ist ein ausdrücklich manueller Zusatzlauf:

- Rückblick von zwei Stunden bis sieben Tage.
- Höchstens 100 aktuelle Benachrichtigungen und 50 Nachrichten pro Durchlauf
  laut Anzeige; bei Erreichen kann die Zeitspanne unvollständig abgedeckt sein.
- Eine Prüfung je Konto alle zehn Minuten.
- Vorherige Kontakte und Versuche werden laut Hinweis übersprungen.
- Gewählter Versandmodus bleibt gültig; Wartezeiten beginnen mit dem Nachhol-Lauf.
- Erst nach gespeicherter und aktivierter Regel startbar.

Nicht gestartet. Diese Durchlaufgrenzen sind keine belegte tägliche Quote
für sämtliche automatischen Angebote. Der Client kennt außerdem monatliche
Tarifkontingente und abgelaufene Versandfreigaben; ein konkreter verfügbarer
Pro-Tarifrest wurde nicht bestimmt. Dauerhafter serverseitiger Dublettenschutz
über mehrere Regeln, Konten und Neustarts bleibt ungeprüft.

## Vintz: Ruhezeiten, Freigaben und Verlauf

In der Automationsübersicht steht eine gemeinsame Ruhezeit von **00:00 bis
08:00 Uhr**, eingeschaltet. Die Maske beschreibt ausdrücklich, dass nachts
nicht geprüft und am Morgen nachgeholt wird. Zeiten und Schalter wurden nicht
verändert. Der gelesene Standard verwendet Europe/Berlin.

Das ist eine stärkere Funktion als eine reine Auswahl eines anderen
Nachrichtentextes nach Uhrzeit. Es ist aber noch kein Beleg, dass jede
eingehende Cloud-Preisannahme, jeder manuelle Nachhol-Lauf und jeder bereits
wartende Versandschritt dieselbe Pause berücksichtigt. Diese Reichweite bleibt
als offene Frage bestehen.

Das Automationsprotokoll hat Filter für Prüfungen, Benachrichtigungen und
Nachrichten. In der Sitzung gab es keine Einträge. Der Code kennt Warteschlange,
erfolgreich, fehlgeschlagen, gestoppt und Nachprüfung; außerdem einen separaten
Freigabepfad für vorbereitete Favoritennachrichten. Kein tatsächlicher Versand,
Fehlerfall, Freigabe oder Stopp eines solchen Eintrags wurde geprüft.

## Flipbase: vorhandene Funktionen

### Manuelle Reaktion

Annehmen, echte Ablehnung bei Vinted und Gegenangebot sind implementiert.
Das Gegenangebot hat eine lokale Preis-/Rabattvorschau und wird erst danach
vorgemerkt. Der Preis muss über dem Käuferangebot, mindestens bei der Hälfte
und höchstens beim Originalpreis liegen. Das sind implementierte Flipbase-
Grenzen; daraus wird keine allgemeine aktuelle Vinted-Regel abgeleitet.

Veraltete oder unklare Angebote, falsches Konto/Artikel/Gespräch, Bundle und
abgeschlossener Kauf blockieren den untersuchten Aktionspfad. Ein freies erstes
manuelles Angebot an einen beliebigen Interessenten ohne strukturiertes
eingehendes Angebot wurde in diesem Pfad nicht gefunden.

### Automatische eingehende Verhandlung

Live gelesen: ausgeschaltet oder ohne Freigabe, allgemeiner Nachlass zehn
Prozent, Stufen 50/80/100, Vorschau bei 50 Euro: Mindestpreis 45 Euro und
Gegenangebote 47,50 → 46,00 → 45,00 Euro. Das Konto blieb pausiert.
Ein historischer Annahmeeintrag wurde als „Bestätigt ausgeführt“ angezeigt;
dies ist ein gespeicherter Beleg, kein in dieser Sitzung neu geprüfter Versand.

Im zugehörigen Ausführungscode vorhanden:

- Nachlass in Euro oder Prozent, optional bis zu 20 Preisbereiche.
- Bis zu zehn Gegenangebotsstufen. Ab Mindestpreis annehmen, darunter bei einem
  **neuen Käuferangebot** in die nächste Stufe wechseln. Keine komplette
  zeitgesteuerte Rabattserie ohne Käuferantwort.
- Nach letzter Stufe optionale Nachricht; keine automatische Ablehnung in
  diesem Entscheidungszweig.
- Ereigniswartezeit bis sieben Tage, zusätzliche Verzögerungen in Nachrichtenfolgen.
- Reihenfolge Angebot/Nachricht wählbar; Annahmetext erst nach bestätigter Annahme.
- Bis zu fünf Nachrichten pro Ereignis und zehn Textvarianten pro Nachricht.
- Mehrere Ereignisse einschließlich letztem Gegenangebot, erneutem Angebot
  und bestätigtem Kauf.
- Käuferannahme des eigenen Gegenangebots ausdrücklich noch nicht zuverlässig
  verfügbar; dafür gespeicherte Texte werden nicht ersatzweise als Kauf ausgelöst.

### Favoritennachricht mit Preisangebot

Live: Automatik und optionales Angebot aus. Die Oberfläche erklärt den
tatsächlichen Ablauf: Erst nach bestätigter Nachricht folgt das echte Angebot.

- Optionaler Euro-/Prozentnachlass gilt kontoweit für alle Text- und Zeitregeln.
  Keine jeweils eigene Nachlasskonfiguration je Nachrichtenregel.
- Prozentbereich 1–50; Preis muss unter dem Originalpreis und mindestens bei
  dessen Hälfte liegen. Ungültiger Preis wird ausgelassen statt still angepasst.
- Verzögerung vor der Nachricht bis sieben Tage.
- Texte nach Uhrzeit, Wochentag und Artikelpreis; ohne passende Regel wird die
  Standardnachricht verwendet.
- Frühere Favorisierungen, Eigenfavorisierung, nicht aktive/reservierte Artikel
  und bestehende Gespräche werden im gelesenen Auslösepfad ausgelassen.
- Derselbe Interessent und Artikel werden über eindeutige Datenbankschlüssel
  nur einmal erfasst.

**Zeitregeln sind keine Ruhezeiten:** Außerhalb einer passenden Textregel fällt
der Standardtext an. Ein regelübergreifendes nächtliches Versandverbot oder eine
einstellbare allgemeine Tagesquote wurde im untersuchten Konfigurationspfad
nicht gefunden. Der gemeinsame Cloudschutz kann bei Rate-Limits pausieren;
das ersetzt keine vom Nutzer gewählte Ruhezeit.

### Ausführung und Kontrolle

Cloud-Worker und lokale Erweiterung haben tatsächliche Ausführungspfade.
Annehmen/Ablehnen wird durch erneutes Lesen des passenden Angebotsstatus
bestätigt. Gegen- und Favoritenangebote benötigen eine konkrete neue Angebots-ID.
Vorher werden Identität, Gespräch, Artikel und Preisbezug geprüft.

Identische manuelle Anfragen behalten denselben Auftrag; nach unklarem
Schreibausgang gibt es keine ungeprüfte zweite Aktion. Manuelle Übernahme,
neues Käuferangebot oder geänderte Einstellungen verwerfen alte wartende
Automatik. Stufenzähler und Folgen laufen erst nach bestätigtem Vorgänger weiter.

Diese Sicherungen sind Codebefunde, keine erneut bestätigte Zuverlässigkeit
gegenüber dem aktuellen Vinted-Server. Bestehende Versandfreigabe, gültige
Kontoverbindung und beim Cloud-Favoritenlauf geplante Synchronisierung sind
erforderlich. Die Pause des Vergleichskontos wurde nicht aufgehoben.

Verlauf: bis zu 50 Verhandlungsaktionen beziehungsweise 30 letzte
Favoritennachrichten; getrennte Nachrichten-/Angebotszustände und Hinweise bei
unklarem Ergebnis. Eine gemeinsame artikelübergreifende Angebotsverwaltung
mit Suche, Sammelregeln und individuellen Artikelmindestpreisen ist in diesem
Pfad nicht nachgewiesen.

## Direkter Vergleich

| Bereich                              | Vintz, untersuchter Pfad                                                      | Flipbase, untersuchter Pfad                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Manuelle Annahme/Gegenangebot        | Cloud-Code vorhanden, historische Karte live gelesen                          | UI und Ausführungscode vorhanden                                                                         |
| Ablehnen                             | Ignorieren in Vintz sendet keine Ablehnung an Vinted                          | Echte manuelle Ablehnung implementiert                                                                   |
| Automatische Annahme                 | Konto- und Artikelregel; alternativ Vorschlag zur Prüfung                     | Kontoautomatik mit Preisbereichen und Stufen                                                             |
| Automatische Gegenangebotsstufen     | Im Cloud-Annahmepfad nicht nachgewiesen; separater Assistent macht Vorschläge | Bis zu zehn Stufen mit Ereignissen/Nachrichtenfolgen                                                     |
| Mindestpreis je Artikel              | Absolute Artikelregel, aus Sammel-Prozentvorschau vorbereitbar                | Keine entsprechende individuelle Artikelregel im untersuchten Modell                                     |
| Vorheriger Prüfmodus                 | Für Preisannahme und Favoritenversand vorgesehen                              | Manuelle Einzelaktion vorhanden; kein gleichartiger Freigabestapel für künftige Automatik belegt         |
| Favoritenrabatt                      | Prozent und Mindestpreis je Nachrichtenaktion im Ablaufmodell                 | Euro oder Prozent kontoweit für alle Textregeln                                                          |
| Mehrere Regeln gemeinsam vorbereiten | Bis zu fünf Artikel, eigene Vorschau                                          | Keine entsprechende Sammelregelmaske                                                                     |
| Nachts pausieren                     | Gemeinsame Ruhezeit sichtbar; Reichweite teilweise ungeklärt                  | Textwahl nach Zeit vorhanden, allgemeine Ruhezeit nicht belegt                                           |
| Frühere Favoriten                    | Bewusster Nachhol-Lauf mit Mengen- und Zeitgrenzen                            | Alte Favorisierungen werden regulär ausgelassen; kein entsprechender Nachhol-Button im untersuchten Pfad |
| Bedienung                            | Kompakte Karten, grafischer Ablauf, mehrere getrennte Regelorte               | Umfangreiche Einstellungsseite mit Preisvorschau; höhere Funktionsdichte                                 |
| Ende-zu-Ende heute getestet          | Nein                                                                          | Nein                                                                                                     |

## Empfehlungen zur Besprechung, keine Umsetzung

**Nutzerrückmeldung vom 17.10.2026:** Die Punkte werden als gemeinsame Richtung
festgehalten. Keine Umsetzungsfreigabe. Als nächster eigener Schritt folgt der
[Vergleich der neuen Angebotserstellung](vintz-listing-creation-comparison.md),
anschließend wieder Stopp zur Besprechung.

1. **Bestehende Flipbase-Verhandlung erhalten und verständlicher aufbauen.**
   Einfacher Einstieg mit Nachlass, klarer Preisvorschau und Modus; Stufen und
   Nachrichtenfolgen als erweiterte Möglichkeiten erreichbar halten.
2. **Prüfen vor Automatik ergänzen.** Geeignete Fälle zunächst in einer
   Freigabeansicht sammeln. Moduswechsel und einmalige Freigabe einer Aktion
   klar unterscheiden; unklare Ergebnisse weiter sperren.
3. **Artikelmindestpreise und Sammelvorschau planen.** Vor Speichern die wirksame
   kombinierte Grenze zeigen, nicht nur eine Prozentvorschau. Vorrang vor
   Kontoregeln und Verhalten bei geänderten Preisen eindeutig festlegen.
4. **Echte Ruhezeiten getrennt von Textregeln anbieten.** Reichweite, Zeitzone,
   Sommerzeit, nachträgliches Abarbeiten und schon vorgemerkte Aktionen müssen
   ausdrücklich geregelt sein. Morgendlichen unkontrollierten Versandstau vermeiden.
5. **Favoritenangebote gezielter konfigurierbar machen.** Falls benötigt, je
   passender Regel eigener Nachlass/Mindestpreis; vorhandenen Euro-Nachlass und
   „Angebot erst nach bestätigter Nachricht“ erhalten. Eine gemeinsame Vorschau
   sollte Nachricht und echten Angebotspreis zusammen erklären.
6. **Nachholen nur bewusst und mit Vorschau erwägen.** Zeitraum, Empfängerzahl,
   bereits kontaktierte Interessenten, zulässige Menge und Versandmodus vor
   einem Lauf zeigen. Vintz' Zahlen sind Produktgrenzen, keine für Flipbase
   begründeten Plattformgrenzen.
7. **Bezeichnungen schärfen.** Öffentliches Senken, privates Angebot, lokale
   Ignorierung, echte Ablehnung, Annahme und Kauf stets unterscheiden. Nicht
   die verteilten Vintz-Regelorte und teilweise englischen Vorlagentexte kopieren.

Offen bleiben insbesondere Vintz' serverseitiger Regelvorrang, sichere
Stornierung wartender Annahmen, Änderung/Verkauf zwischen Auslöser und Versand,
Wiederholschutz und Reichweite der Ruhezeit. Erfolgsquoten und tatsächliche
Angebotszustellung erfordern einen später ausdrücklich abgestimmten echten
Test; sie werden aus der heutigen Analyse nicht abgeleitet.

## Quellen und Belege

Vintz live: `https://vintz.ai/listings`, `https://vintz.ai/automations`,
`https://vintz.ai/inbox`, ergänzend Antwortregeln unter `/inbox/rules`.
Letztere enthalten allgemeine automatische Nachrichten und sind kein Ersatz
für eine Preisangebotsregel.

Gezielt gelesene eigene, bereits geladene Browsermodule:

| URL unter `https://vintz.ai/_next/static/chunks/` | SHA-256 des UTF-8-Quelltexts                                       |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `06s0-dtw1aw-c.js`                                | `1734475e61a659b48dbc9045732f69257ef66b80073efd84e68b33e5ef45eb8a` |
| `0fq95l_un25qf.js`                                | `f2b6f851d431ab7f3bad19a601a4e6901a14817b4117f5166677abb405ca2164` |
| `2oj4qgz94r4-o.js`                                | `01597b3c16ed55af5cf2fd515665b723a51dec6abf6f45fe931a9c90018129c5` |
| `2igg7m1g4ppc7.js`                                | `8e09ae77a0a03b451ef0a8d37c29f9f28e74efd5a3ebe7281099124a83ad4309` |
| `1_f4nrn8dk85w.js`                                | `afb0096092b9134d56062053e0365fbc4db35229ad5bf61b8df8c1a58f240fe6` |
| `0dqwuq1nz_n8m.js`                                | `7708dd6a65b889181705cb7647a0ac484a153cf39a4a547b48ac61c37b72b1fe` |

Reihenfolge: Sammelregeln; Cloud-Postfach/Annahmeregel; Automationsverwaltung;
grafischer Ablauf; Favoritenmodell/Validierung; separater Preisassistent.
Fremde Quellen nicht in das Repository übernommen, keine Rohantworten oder
vollständigen Unterhaltungen gespeichert.

Flipbase-Belege:

- [Manuelle Aktionen und Vorschau](../../src/app/features/marketplaces/components/vinted-offer-actions/vinted-offer-actions.component.html),
  [Preisgrenzen](../../src/app/features/marketplaces/models/vinted-negotiation.ts),
  [Aktionszustand und Wiederholung](../../src/app/features/marketplaces/services/vinted-negotiation-action.store.ts).
- [Verhandlungseinstellungen](../../src/app/features/marketplaces/components/vinted-negotiation/vinted-negotiation.component.html),
  [Konfigurationsmodell](../../supabase/functions/_shared/negotiation-config.ts),
  [Entscheidung und Aufträge](../../supabase/schemas/426_marketplace_negotiation.sql).
- [Favoritenoberfläche](../../src/app/features/marketplaces/components/vinted-favorite-messages/vinted-favorite-messages.component.html),
  [Preisberechnung](../../src/app/features/marketplaces/models/vinted-favorite-messages.ts),
  [Auslöser, Textwahl und Wiederholschutz](../../supabase/schemas/380_marketplace_favorite_messages.sql).
- [Cloud-Favoritenausführung](../../services/marketplace-worker/src/vinted-browser-favorites.ts),
  [Angebotsausführung der Erweiterung](../../tools/flipbase-extension/vinted-negotiation-runtime.js).
- [Vorhandene Angebotsaktionen-Tests](../../src/app/features/marketplaces/components/vinted-offer-actions/vinted-offer-actions.component.angular.spec.ts),
  [Cloud-Angebotstests](../../services/marketplace-worker/test/vinted-browser-negotiation.test.ts),
  [Favoritenausführungstests](../../services/marketplace-worker/test/vinted-browser-favorites.test.ts).
  Nur Definitionen gelesen, keine Testläufe für diese Dokumentationsanalyse.

Bildschirmbelege außerhalb des Repositorys:

- [Vintz-Sammelregeln](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-offer-rules-bulk.png).
- [Vintz-Kontoregel, Ausschnitt ohne Unterhaltung](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-offer-account-rule.png).
- [Ungespeicherter Vintz-Favoritenentwurf](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-favorite-offer-draft.png).
- [Flipbase-Verhandlung](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-automatic-negotiation.png),
  [Flipbase-Favoritenangebote](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-favorite-offers.png).

## Abschluss

Nur Dokumentation. Kein Versand, keine Angebotsentscheidung, kein Nachhol-Lauf,
keine gespeicherte oder aktivierte Regel, keine Umsetzung. Die lokalen
Vintz-Prüfmasken wurden geschlossen, Favoritenentwurf verworfen und
Bestandsauswahl geleert. Vintz endet wieder in der Liste aktiver Angebote
für Maike Vintage mit leerer Suche. Flipbase endet in der Marktplatzübersicht,
die Maike-Verbindung bleibt pausiert. Markdown-Formatierung und
Unterschiedskontrolle für die Dokumentation; keine Anwendungstests erforderlich.

**Stopp zur Besprechung.** Empfehlungen sind noch keine Umsetzungsfreigabe.
