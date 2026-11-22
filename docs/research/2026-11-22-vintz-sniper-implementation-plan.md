# Vintz-Sniper und der nächste Flipbase-Feed

Stand 22. November 2026. Messung im angemeldeten Vintz-Konto, Vergleich mit
dem produktiven Flipbase-Feed und der normalen deutschen Vinted-Suche.
Zeiten in MEZ. Artikel wurden anhand ihrer Vinted-ID abgeglichen.

## Was bei Vintz sichtbar ist

| Bereich             | Beobachtung                                                                                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einstieg            | Ein leerer Workspace zeigt das Formular für die erste Suche. Zwei ausdrücklich gestartete Testfeeds liefen parallel. Der Markt und das Kaufkonto sind getrennte Auswahlen.                                                                                                               |
| Filter              | Der importierte Vinted-Link erkannte Carhartt und „Fleecejacken · Herren“. Die zugehörigen Kennungen wurden gespeichert. Ein zweiter Lauf bestätigte Suchbegriffe mit ODER, Größen-, Zustands- und Preisfilter sowie Ausschlüsse im Webanfragevertrag.                                   |
| Ordner              | Ein Ordner kann mehrere Feeds gruppieren. Beim Wechsel des sichtbaren Ordners liefen beide Feeds weiter. Ein einzelner Feed ließ sich anhalten und fortsetzen.                                                                                                                           |
| Verkäuferland       | Die Oberfläche unterscheidet bestätigtes Land, Hinweise aus früheren Angeboten, Schätzung und unbekanntes Land. Ein Schalter bestimmt, ob unbekannte Länder mitlaufen. Der Verkäuferlandfilter hängt am ausgewählten Markt, die Kaufprüfung nutzt bestätigte Angaben.                    |
| Ansichten           | Vollständig, kompakt und Galerie sowie Karten, Zeilen, Kacheln und getrennte oder zusammengefasste Feeds. Zeit, Artikeldaten und Schnellaktionen lassen sich einzeln sichtbar machen.                                                                                                    |
| Kaufen und Historie | Das Kaufkonto ist wählbar. Sofortkauf ist eine eigene Einstellung. Versand, Zahlungsart, Gesamtpreis und Versandkosten lassen sich begrenzen. Pre-Fire war auf Vorschaukarten sichtbar. Kaufhistorie und Aktivität haben eigene Ansichten. Eine echte Transaktion wurde nicht ausgelöst. |

Die Mitgliedschaft nennt zwölf Live-Feeds pro Vinted-Land, Linkimport,
Verkäuferland, Pre-Fire und Kaufhistorie. Die zwölf Feeds sind ein sichtbares
Tarifmerkmal. Daraus lässt sich die Anzahl der Abrufprozesse nicht ableiten.
[Vintz-Mitgliedschaft](https://vintz.ai/sniper/membership)

## Browsertransport und Artikelzustände

Die Start- und Speicheraktionen laufen im angemeldeten Browser über reguläre
HTTP-Aufrufe. Nach Speicherung der Suchkonfiguration erhielt der Browser eine
Stream-Sitzung. Der Live-Kanal antwortete mit WebSocket-Handshake 101 und
lieferte pro Suche vier beobachtete Nachrichtentypen:

- `snapshot` liefert den aktuellen Bestand, im beobachteten Ausschnitt bis
  118 Karten. Die mitgelieferte Richtlinie nennt 120 Karten je Feed.
- `delta` ändert einzelne Karten oder entfernt Kennungen. Ein neuer Treffer
  und dessen spätere bestätigte Details haben dieselbe Artikel-ID.
- `status` liefert den Suchzustand und kann verzögerte Details melden.
- `heartbeat` signalisiert eine laufende Verbindung.

Die Nutzdaten tragen bei suchbezogenen Meldungen Revision, Epoch und Cursor.
Sie erlauben das Erkennen einer geänderten Suche oder eines verlorenen
Zwischenstands. Eine Wiederverbindung im Browser und die mitgelieferten
Felder sind belegt. Welchen historischen Cursor der Server tatsächlich noch
bedienen kann, wurde nicht durch erneutes Abspielen privater Anfragen geprüft.

Die Artikeldaten enthielten `unverified`, `catalogue` und `public`.
Vorschauen hatten `observedAt`, `expectedDetailsAt`, einen Zähler für die
Schätzstichprobe und einen gesonderten Preisprüfstatus. Bestätigte Karten
kamen später als Aktualisierung; `observedAt` blieb bei 17 beobachteten
Übergängen identisch. Daher zeigt die Kartenzeit das Alter seit Monitorfund.
Der Wert für die erwarteten Details ist eine Schätzung aus Vorschauen und
kein vom Verkäufer übermittelter Relist-Termin.

In den 17 gemeinsam beobachteten Vorschau- und Detailereignissen lag die
Schätzung im Median bei **27,5 Sekunden** nach Erstfund. Vintz speicherte die
bestätigten Details im Median nach **33,7 Sekunden**. In dieser Stichprobe
lag das bestätigte Ereignis zwischen **3,7 und 7,3 Sekunden** nach der
Schätzung. In einer gesonderten kurzen Beobachtung wechselte ein Artikel
bereits bei 25 Sekunden auf „Jetzt kaufen“, andere zeigten bei 27 bis 30
Sekunden weiter Pre-Fire und wurden erst bei 31 bis 37 Sekunden bestätigt.
Die beiden Stichproben messen unterschiedliche Zeitpunkte.

Der direkte Aufruf von Vinted-Artikel `10922609470` zeigte um 14:13:10,6
noch keinen Kaufknopf, während Vintz bei 26 Sekunden Kartenalter „Live in
ca. 3 s“ anzeigte. Um 14:13:17,2 zeigte dieselbe Vinted-Seite „Kaufen“.
Das grenzt einen tatsächlichen Übergang im Beobachtungsfenster ein.
[Vinted-Artikel](https://www.vinted.de/items/10922609470)

## Tempo und Aussetzer

- **Vintz-Vorschau vor Flipbase.** In der ersten 27-Sekunden-Beobachtung
  waren 41 verschiedene Vintz-Karten im betrachteten sichtbaren Ausschnitt,
  einschließlich des Anfangsbestands. 15 Kennungen kamen in einer der parallel erfassten
  Vinted-Suchstichproben vor. Zwei überschneidende Flipbase-Artikel waren um
  14:09:04,5 bei Vintz schon als Vorschau sichtbar und hatten in Flipbase
  den gespeicherten Erstfund 14:09:19,5. Die normale Vinted-Suche zeigte
  sie in den Stichproben um 14:09:13,5 und 14:09:22,0. Browserupdates der
  Suchseite geben Stichprobenzeiten an.
- **Gleichmäßiger Zulauf ist messbar.** Von 14:18:20,5 bis 14:18:53,0
  wurden 20 Stichproben in einem laufenden Ralph-Lauren-Feed genommen.
  Darin kamen 19 neue sichtbare Artikel hinzu. Zwölf Stichproben enthielten
  einen neuen Fund, der größte beobachtete Abstand lag bei 5,1 Sekunden.
  Der Kanal lieferte 50 Deltas, 9 Statusmeldungen und 5 Heartbeats.
  Die Oberfläche zeigte währenddessen durchgehend verzögerte
  Veröffentlichungsdetails. Vorschauzulauf kann also weitergehen, während
  die Bestätigung hinterherhinkt.
- **Vintz hatte einen tatsächlichen Ausfall.** Der erste Speicherversuch
  erhielt HTTP 503. Der Feedabruf meldete, dass sich der private Dienst neu
  verbindet. Der Stream wartete mit HTTP 409 auf gespeicherte
  Suchkonfiguration. Nach Neuladen war der erste Testfeed serverseitig
  nicht vorhanden. Ein zweiter Versuch und der anschließende erneute
  Linkimport wurden erfolgreich gespeichert und zeigten beide Live-Feeds.
  Die Messung liefert keine Tagesverfügbarkeit oder Ausfallquote.
- **Serverparameter sind keine beobachteten Anfrageraten.** Vintz lieferte
  dem Browser ein Zielintervall von 1.000 ms und getrennte Obergrenzen für
  Katalog, Details und Wartung in der Richtlinie. Der laufende Suchstatus
  zeigte ein wirksames Ziel um 5,25 Sekunden, gerundet 6 Sekunden in der
  Oberfläche. Der Browserverkehr zeigt die Auslieferung durch Vintz.
  Vintz' serverseitige Vinted-Quelle, Anzahl Verbindungen, tatsächliche
  Abrufrate und interne Vergabe des Schätzwerts sind damit nicht belegt.
- **Flipbase hat einen konkreten Engpass.** Der zentrale Dienst bündelt
  identische Quellanfragen bereits und arbeitet mit einem gemeinsamen
  Abrufbudget. Verschiedene Quellen warten aufeinander. Die
  dokumentierten Standardwerte lauten 2,5 Sekunden Mindestabstand und
  24 Starts pro Minute. Der Betriebsbericht vom Oktober nennt für
  den damaligen Produktionsstand 10 Sekunden Mindestabstand. Aktuell
  geladene Produktionswerte wurden in dieser Untersuchung nicht abgelesen.
  [Dokumentation des Sammlers](../../services/sniper/README.md#gleichmäßige-abrufe-und-zugriffspausen)

## Umsetzung in Flipbase

### 1. Messbarkeit und Filter zuerst

Den vorhandenen Vinted-Feed und die bestehenden Suchfilter weiterverwenden.
Vinted-Kataloglinks lokal auswerten und erkannte Filter vor dem Speichern
in den normalen Editor übernehmen. Marke, Kategorie, Größen und Zustand
über Vinted-Kennungen auflösen. Markt, Währung und Verkäuferland getrennt
speichern. Unterstützte Suchparameter und Mehrfachwerte übernehmen.
Unbekannte gesetzte Filter im Import markieren, bevor eine Suche breiter
als beauftragt startet.

Pro Quellabfrage Abrufbeginn, Antwort, gespeicherten Erstfund und Ankunft
im geöffneten Feed mit Artikel-ID und Messuhr zusammenführen. Über
gleichzeitig beobachtete, gleich gefilterte Artikel vergleichen. Als
Kennzahlen Median und 95. Perzentil der Fund- und Anzeigenlatenz, lokale
Abgleichabdeckung, neue Treffer pro Minute, Bild- und Detailverzögerung,
Fehlerdauer und Wiederaufnahme protokollieren. Messläufe nach Markt,
Suchbreite und Tageszeit ausweisen. Den aktuell geladenen Produktionsstand
vor Änderungen am Abrufbudget und bei Auswertung erfassen.

### 2. Quelle, Verteilung und gezielte Bestätigung entkoppeln

Den bestehenden Browserabruf, Abfrageplaner, Verbindungszustand und
Abdeckungsnachweis erhalten. Gleiche Quellanfragen weiterhin einmal
ausführen. Überschneidende Suchfilter zusätzlich aus einer gemeinsamen
breiten Quelle versorgen, sobald ihr beobachtetes Fenster vollständig
aufgeholt ist und alle für die Filterung benötigten Felder enthält.
Bei begrenzter Abdeckung präzise Einzelquellen nutzen und die Lücke
ausweisen. Ein voller allgemeiner Katalogabruf mit unklarem Ausschnitt
darf die präzisen Suchabfragen nicht verdrängen. Märkte getrennt planen.

Vorschauen unmittelbar an zulässige Feeds verteilen, sobald die
zugelassene Quelle sie tatsächlich liefert. Ein Fund und seine
Aktualisierungen teilen Markt und externe Artikel-ID. Priorisierte
Detailabfragen nur für geeignete Vorschauen und ausdrückliche Aktionen
planen. Quelle und Details erhalten eigenen Anteil am bestehenden Budget,
wobei Pausen und Fehlerzustände weiterhin gelten. Ein zunächst unbekanntes
Land bleibt unbekannt; Schätzungen können als solche sichtbar sein.

Der entscheidende Freigabepunkt ist die Quelle. Flipbases normaler
Katalogparser hat in der bisherigen Beobachtung kein verlässliches
Vorschau- oder Freigabesignal vor dem öffentlichen Auftauchen geliefert.
Ein WebSocket und schnellere Karten allein ändern das nicht. Vor einem
Produktionsrollout muss eine zulässige Quelle den Vorschauzustand und
nachfolgende Kaufbarkeit für gleiche Artikel nachweisbar liefern.
Andernfalls bleibt diese Phase auf normal gefundenen Katalogartikeln
und anschließend bestätigten Details. Anbieterfehler geben Anlass zur
Pause und Klassifikation, nicht zur ungebremsten Wiederholung.

### 3. Zustände und Updates in derselben Karte

Erstfund und relative Zeit sind bereits im lokalen Flipbase-Zweig
implementiert. Darüber hinaus explizite Zustände für Vorschau, Katalogfund,
bestätigte Verfügbarkeit und nicht verfügbar einführen. Die bestehende
Speicherung muss deduplizieren und zugleich neuere Zustände übernehmen.
Ein neuerer Preis- oder Statusbeleg kann eine Karte aktualisieren, ohne
die Fundzeit zu ersetzen. Veraltete Antworten können eine Bestätigung
nicht zurücksetzen.

Den Countdown erst mit ausreichenden eigenen bestätigten Messpaaren pro
Markt anzeigen. Anfangs „Wartet auf Freigabe“. Nach Ablauf dieselbe Karte
weiter warten lassen. Erst bestätigte Kaufbarkeit ändert die Aktion.
Die gleiche Statusfläche belegt durchgehend denselben Platz. Keine
Verkäuferländer oder Kaufpreise aus Schätzungen bestätigen.

Auf dem vorhandenen privaten Supabase-Broadcast aufbauen. Kleine
berechtigte Änderungen mit Feedrevision und Cursor ausliefern, während
der bestehende Feed-Endpunkt konsistente Bestandsaufnahmen liefert.
Nach Lücke oder Filterwechsel neue Bestandsaufnahme laden. Neustart und
Wiederverbindung dürfen weder doppelte Karten noch eine falsche
Behauptung vollständiger Abdeckung verursachen.

### 4. Ordner, Länder und schneller Kauf

Ordner als Auswahl im bestehenden Feed ergänzen. „Alle Feeds“ und die
bisherige Ansicht bleiben reguläre Ansichten. Auswahl und Anzeigeoptionen
dürfen Erfassungsaufträge nicht anhalten. Länderfilter mit bestätigter
Herkunft anwenden und auf Wunsch unbekannte Herkunft weiter anzeigen.
Erstfassung der Filter nach vorhandener Designrichtlinie erstellen und
auf Desktop und Touch in Hell/Dunkel prüfen.

Pre-Fire erst nach einem ausdrücklich ausgelösten Kaufauftrag für genau
einen Artikel, ein verbundenes Konto und eine sichtbare
Gesamtpreisgrenze anbieten. Nach Freigabe aktuelle Kaufbarkeit, Gesamtpreis,
Währung und Versandwahl prüfen. Käufe über den dafür zugelassenen
Kaufweg ausführen. Parallel gefundene Karten dürfen denselben Auftrag
nicht doppelt starten. Einen unklaren Kauf zuerst mit der Bestellhistorie
abgleichen. Die Kaufhistorie zeigt bestätigte Bestellungen. Konten,
Kaufweg und eventuell nötige Anbieterfreigabe müssen vor einem echten
Kaufpilot verifiziert sein. Ohne diesen Nachweis bleibt der Ablauf lokal
simuliert oder öffnet die bekannte Vinted-Artikelseite zur manuellen Aktion.

## Lokaler Funktionsnachweis und Abnahme

Der [Replay-Prototyp](../../tools/sniper-feed-prototype/feed-replay.test.mjs)
arbeitet mit synthetischen Daten und simuliert Kaufantworten. Er prüft
Vinted-Linkimport und Filterauflösung, vollständige und begrenzte
Quellfenster, Wiederaufnahme anhand eines Cursors, Countdown und
Statuswechsel, Ordner, Länder, Pre-Fire und Kaufhistorie. Im vollständigen
Testfenster ersetzt ein breiter Abruf drei präzise Quellen bei gleichen
Treffern. Der Fall mit einer Lücke nutzt präzise Quellen und meldet
unvollständige Abdeckung. In diesem zweiten Fall kostet der breite
Versuch einen zusätzlichen Abruf. Bei drei sonst nötigen Anfragen lohnt
er sich nach Anzahl erst, wenn mehr als ein Drittel der breiten Versuche
alle drei Quellen ersetzen. In der echten Messung zusätzlich Antwortzeit,
Paginierung und Detailkosten einrechnen. Der Replay belegt die beiden
Pfade unter kontrollierten Bedingungen.

```bash
node --test tools/sniper-feed-prototype/feed-replay.test.mjs
```

| Änderung                 | Nachweis vor dem Rollout                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import und Ordner        | Die importierten Kennungen entsprechen der ursprünglichen Vinted-Suche. Bestehende gespeicherte Filter sind weiterhin bedienbar. Ordnerwechsel und kombinierte Ansicht verändern laufende Aufträge nicht.                                                                                                     |
| Gemeinsame Erfassung     | Mit denselben Suchfiltern parallel messen. Der gemeinsame Weg liefert im beobachteten Fenster mindestens dieselben Treffer und spart Anfragen oder senkt die Latenz. Breite Abfragen mit unzuverlässigem Abdeckungsnachweis bleiben auf präzisen Quellen. Den gemeinsamen Weg je Markt zurückschalten können. |
| Vorschau und Live-Status | Derselbe Artikel wechselt anhand eines bestätigten Quellereignisses. Status und Freigabe bleiben bei ausbleibenden Details offen. Korrektes Ergebnis bei wiederholtem, verspätetem oder ausgefallenem Ereignis. Nach Verbindungsabbruch wird der Stand aus Cursor oder Snapshot wiederhergestellt.            |
| Pre-Fire                 | Zuerst simulierte Freigabe, fehlgeschlagene Preisprüfung, Kauf unter dem Limit, doppelter Anstoß und Bestellabgleich prüfen. Erst danach einen ausdrücklich zugelassenen echten Kaufpilot mit dem gewählten Konto ausführen.                                                                                  |
