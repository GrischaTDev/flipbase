# Freigabezeit und Kaufoption bei Vinted

Am 22. November 2026 wurden vier frische Ralph-Lauren-Vorschauen von Vintz anhand ihrer Vinted-ID auf der normalen Artikelseite verfolgt. Die Schätzzeit ergibt sich aus der Uhrzeit der Beobachtung plus der angezeigten, auf Sekunden gerundeten Restzeit. Der früheste beobachtete Kaufstatus wurde durch eine aktive Schaltfläche „Kaufen“ und `can_buy: true` bestimmt. Die Messpunkte grenzen den Umschaltzeitpunkt ein.

| Vinted-ID                                              | Restzeit bei Vintz | Geschätzte Freigabe (MEZ) | Zuletzt ohne Artikelseite (MEZ) | Erste sichtbare Kaufoption (MEZ) |
| ------------------------------------------------------ | -----------------: | ------------------------- | ------------------------------- | -------------------------------- |
| [10932376939](https://www.vinted.de/items/10932376939) |               14 s | 22:21:26,3                | 22:21:13,3                      | 22:21:29,9                       |
| [10932377933](https://www.vinted.de/items/10932377933) |               18 s | 22:21:30,3                | 22:21:14,0                      | 22:21:33,8                       |
| [10932385219](https://www.vinted.de/items/10932385219) |                9 s | 22:22:01,0                | 22:22:04,4                      | 22:22:10,9                       |
| [10932386217](https://www.vinted.de/items/10932386217) |               13 s | 22:22:05,0                | 22:21:53,2                      | 22:22:04,0                       |

Für `10932385219` begann die letzte Abfrage ohne Artikelseite rund drei Sekunden nach Ablauf der Schätzung. Der erste positive Abruf begann rund 8,4 Sekunden nach Ablauf und zeigte die Kaufoption rund 9,9 Sekunden nach Ablauf. `10932386217` zeigte die Kaufoption knapp eine Sekunde vor der berechneten Schätzzeit. Dieser Abstand liegt etwa in der Rundungsbreite der angezeigten Restzeit. Für die ersten zwei Artikel liegt das tatsächliche Umschalten nur zwischen den Tabellenzeitpunkten.

Vor dem Wechsel zeigte Vinted für alle vier IDs „Page not found“. In den untersuchten mitgelieferten Daten gab es zu diesem Zeitpunkt keinen Artikeldatensatz. Sobald die Kaufoption sichtbar war, trugen die Artikeldaten jeweils `can_buy: true`, `is_hidden: false` und `is_reserved: false`. Ein geplanter Freigabezeitpunkt war in diesen Artikeldaten nicht zu finden. Bei einem der positiven Abrufe waren `discountStartDate` und `discountEndDate` in den Seitendaten gesetzt und `closet_countdown_end_date` stand auf `null`.

Vier weitere frisch in Flipbase erschienene Anzeigen hatten bei der jeweils ersten verwertbaren Detailbeobachtung etwa zwei bis dreieinhalb Sekunden nach dem gespeicherten Erstfund bereits eine aktive Kaufoption. Sie lieferten keinen beobachteten Wechsel. Die Vinted-Hilfe beschreibt eine automatische Prüfung beim Hochladen mit variabler Dauer. [Angebote verwalten](https://www.vinted.de/help/4/60-jak-ukryc-lub-usunac-przedmiot)

Für den Countdown kommt auf Basis dieser Daten eine als solche gekennzeichnete Schätzung infrage. Nach Ablauf sollte der Status bis zum bestätigten Kaufsignal weiter „Wartet auf Freigabe“ anzeigen. Der vorhandene eigene Testfeed wurde kurz aktiviert und nach der Messung wieder pausiert. Geprüft wurde die sichtbare Kaufoption auf der Artikelseite.

## Nachmessung im Ralph-Lauren-Feed

Im laufenden Feed „Juna Test – Ralph Lauren DE“ war der Marktplatz `vinted.de` ausgewählt. Der Feed zeigte bestätigte Verkäuferländer Deutschland, Frankreich und Italien. Die Vintz-Hilfe definiert die Sekundenanzeige als Zeit seit dem Erstfund durch Sniper und die Restzeit als Schätzung aus jüngeren Anzeigen. „Verkäuferland noch offen“ steht für ein bisher unbestätigtes Land. [So funktioniert Sniper](https://docs.vintz.ai/sniper#how-sniper-works) · [Karten und Verkäuferland](https://docs.vintz.ai/sniper/listings#sniper-listings-mdx)

Die Vorschau [10932636992](https://www.vinted.de/items/10932636992) zeigte um 22:40:17 MEZ noch etwa zwei Sekunden bis live. Ein Vinted-Abruf um 22:40:20 meldete weiterhin „Page not found“. Um 22:40:28 zeigte Vinted erstmals „Kaufen“, bei Vintz stand noch „Jeden Moment live“. Um 22:40:37 war der Vinted-Knopf nachweislich aktiv. Um 22:40:53 zeigte dieselbe Vintz-Karte weiterhin „Veröffentlichung wird geprüft“, „Verkäuferland noch offen“ und „Pre-Fire“. Im selben Feed erschienen währenddessen weitere Karten mit Countdown.

Der beobachtete Rückstand betrifft die Bestätigung bei Vintz. Seine serverseitige Quelle für frühe Vorschauen geht aus der Oberfläche und der Vintz-Hilfe nicht hervor. Das Alter der vom Nutzer erwähnten eine Woche alten Anzeige wurde mangels eindeutiger ID nicht nachgemessen.

## Öffentlicher Vinted-Katalog und Flipbase

Am 22. November 2026 zwischen 22:46 und 22:49 MEZ wurde im Vintz-Feed „Juna Test – Ralph Lauren DE“ die Konfiguration für `vinted.de` geprüft. Aktiv war ausschließlich die Marke Ralph Lauren. Im öffentlichen Vinted-Katalog wurde [dieselbe Marke mit den neuesten Artikeln zuerst](https://www.vinted.de/catalog?brand_ids%5B%5D=88&order=newest_first) geöffnet. Gezählt wurden Treffer derselben IDs in geladenen Katalogseiten und auf den normalen Artikelseiten. Die Abrufe waren Stichproben.

| Vinted-ID   | Erste Vintz-Vorschau (MEZ) | Erstmals „Kaufen“ gesehen | Erstmals im geladenen Vinted-Katalog gesehen |
| ----------- | -------------------------- | ------------------------- | -------------------------------------------- |
| 10932723123 | 22:46:30                   | Im Messfenster offen      | Kein Treffer im Messfenster                  |
| 10932722973 | 22:46:30                   | Im Messfenster offen      | Kein Treffer im Messfenster                  |
| 10932737253 | 22:47:35                   | 22:47:53                  | 22:48:11                                     |
| 10932735083 | 22:47:35                   | 22:48:26                  | 22:48:26                                     |

Vor der kaufbaren Artikelseite gab es für diese IDs keinen Treffer im geladenen Markenkatalog. Bei `10932737253` zeigte die Artikelseite bereits „Kaufen“, während die ID im parallel geladenen Katalog fehlte und die Vintz-Karte noch ungefähr zehn Sekunden Restzeit anzeigte. Die ID war beim nächsten erfolgreich ausgewerteten Katalogabruf auch in den mitgelieferten Seitendaten enthalten. `10932735083` fehlte noch beim Katalogmesspunkt um 22:48:11. Durch die Abtastung lässt sich die Reihenfolge des tatsächlichen Umschaltens bei dieser ID nicht bestimmen. Die Vinted-Hilfe beschreibt den [normalen Katalog und weitere Wege zur Artikelsuche](https://www.vinted.de/help/424/35-artikelen-vinden). Eine frühe Vinted-Quelle wurde bei diesem Abgleich nicht nachgewiesen.

Der Flipbase-Linkimport meldete „Die Marke aus dem Link ist für den Flipbase-Feed nicht hinterlegt.“ Der Entwurf wurde verworfen. Der gemeinsame Flipbase-Feed enthielt die IDs bei den Stichproben nicht. Ein Geschwindigkeitsvergleich mit gleicher Sammlerkonfiguration ist damit offen. Persönliche Suchfilter sind aktuell an den Arbeitsbereich gebunden und filtern den gemeinsamen Artikelbestand. Die Marktplatzabrufe laufen über getrennte, administrativ gepflegte Sammelaufträge. [Schema der persönlichen Suchfilter](../../supabase/schemas/106_sniper_watchlists.sql)

Für persönliche Feeds kann die Oberfläche leer starten und je aktivem Feed einen Sammelbedarf für Markt und Filter anmelden. Identische Suchen können aus einem gemeinsamen Abruf bedient werden. Die Kosten lassen sich anhand der Zahl eindeutiger aktiver Suchen, tatsächlicher Abrufe und übertragenem Volumen sowie der Verteilung der Fundlatenz bemessen. Vintz nennt zwölf Feeds pro Marktplatz. Ein Flipbase-Limit hängt von den eigenen Betriebsdaten ab. [Vintz-Feed-Limit](https://docs.vintz.ai/sniper/feeds#sniper-feeds-mdx)
