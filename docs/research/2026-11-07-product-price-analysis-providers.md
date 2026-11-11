# Anbieter für Produkt- und Preisanalyse

Stand: 7. November 2026. Öffentliche Produktseiten, technische Dokumentation,
Datenschutzhinweise und ein offener Quellcode wurden geprüft. Kein bezahlter
Zugang, keine Registrierung, kein Leistungsvergleich an identischen Artikeln.
Anbieterangaben sind keine unabhängig bestätigten Qualitätsnachweise.

## Verbindliche Vorgabe und Ergebnis für Flipbase

Der Nutzer schließt zusätzliche externe APIs und kostenpflichtige Zusatzprodukte
für die Umsetzung aus. Die nachfolgende Anbieterübersicht bleibt als Recherche
zum Funktionsprinzip erhalten, ist keine Integrationsauswahl. SerpApi, Lykdat,
ResellTrack und andere Datenanbieter werden nicht eingebunden.

Empfohlen ist eine selbst betriebene Vinted-Artikelanalyse mit dem vorhandenen
Sammler, eigenen Vergleichsdaten, eigener Preisrechnung und dem bestehenden
KI-Zugang. Der konkrete Codeabgleich, der erfolgreiche direkte Katalogabruf und
die noch fehlende Historie stehen im
[Konzept zur internen Analyse](2026-11-07-internal-vinted-article-analysis.md).
Die bestehende Flipbase-Funktion und das Deployment wurden nicht verändert.

## Vintz.ai

Der vom Nutzer bestätigte Anbieter bewirbt Fotoanalyse, Anzeigentexte, Shop-Chat,
Verkaufsanalyse und regelbasierte Preissenkungen mit Mindestpreis. Auf den
geprüften öffentlichen Seiten ist keine separat dokumentierte, modellgenaue
Marktwertrecherche mit belastbaren Fremdverkäufen erkennbar. Daraus folgt nicht,
dass eine solche Funktion hinter der Anmeldung sicher fehlt.
[Produktseite](https://vintz.ai/),
[Preisratgeber](https://vintz.ai/de/articles/vinted-pricing).

Die Datenschutzerklärung nennt APIYI als Weiterleitung zu Modellanbietern,
unter anderem Anthropic, Google/Gemini und Alibaba/Qwen. Das belegt die
Dienstleisterkette, nicht die Modellwahl oder Suchstrategie einer bestimmten
Preisanalyse. Die tatsächlichen System-Prompts und ein vollständiger technischer
Ablauf sind in den geprüften Quellen nicht offengelegt.
[Technische Dienstleister](https://vintz.ai/datenschutz).

## Fertige Anwendungen und Datenangebote

| Anbieter                                                                                  | Belegtes Angebot laut Anbieter                                                                                                                 | Einordnung für Flipbase                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ResellTrack Lens](https://reselltrack.io/en/blog/vinted-image-search)                    | Foto oder Vinted-Link, Bildausschnitt, ähnliche vergangene Verkäufe, Verteilung, Spanne und Fallzahl. Bildsuche ab 24 EUR/Monat.               | Enger fachlicher Vergleich für unseren Ablauf. Herkunft der tatsächlich ausgehandelten Endpreise bleibt in den geprüften Seiten unklar.                                |
| [ResellTrack MCP](https://reselltrack.io/en/blog/vinted-ai-chatgpt-claude-mcp)            | Artikelbewertung, Bildsuche, Angebots- und Verkaufssuche sowie Marktstatistiken als KI-Werkzeuge. Laut Anbieter bis zu 24 Stunden Datenverzug. | Ab Pro, 39 EUR/Monat, 100 KI-Anfragen. Eine Nutzung als Datenquelle für sämtliche Flipbase-Nutzer ist dadurch noch nicht zugesichert.                                  |
| [ResellIQ AI Scan](https://www.reselliq.app/help/ai-scan)                                 | Bis zu acht Fotos, Etiketten/Merkmale, niedriger/mittlerer/hoher Preis und Markttext. Beworbene Dauer 20–40 Sekunden.                          | Guter Vergleich für Mehrbildanalyse und Darstellung; keine hier nachgewiesene Überlegenheit. [Tarif](https://www.reselliq.app/pricing): 29,99 GBP/Monat mit 250 Scans. |
| [Vintefy Listing Checker](https://vintefy.com/vinted-listing-checker)                     | Öffentlichen Inseratlink prüfen, Preisvorschlag von Vinted, soweit vorhanden; andernfalls gekennzeichnete KI-Schätzung.                        | Gut zugänglicher Vergleich, aber kein Beleg für echte Verkaufshistorie.                                                                                                |
| [Comps by Swanum](https://swanum.com/comps/docs)                                          | REST/MCP für sieben Vinted-Länder, Marken-/Größenfilter, Median, Quartile, beobachtete Verkaufsdauer und Datenabdeckung.                       | Technisch konkret. Die Dokumentation erklärt ausdrücklich: Preis ist der zuletzt beobachtete Angebotspreis vor dem Verkauf, nicht der ausgehandelte Endbetrag.         |
| [eBay Product Research](https://www.ebay.com/help/selling/selling-tools/research?id=4853) | Drei Jahre Verkaufshistorie einschließlich angenommener Preisvorschläge, Filter und Verkaufsquote. Für Verkäufer mit Seller Hub zugänglich.    | Wertvolle Referenz für tatsächlich gezahlte Preise. Das Verkäuferwerkzeug bedeutet keinen frei verfügbaren API-Zugang zu diesen Daten.                                 |

ResellIQ nennt für seinen Betrieb OpenAI, eBay, gegebenenfalls Apify sowie
Upstash zum Zwischenspeichern. Das ist öffentlich nachvollziehbarer als ein
bloßes KI-Versprechen, legt aber weder Prompts noch die Herkunft jedes einzelnen
Preisbelegs offen.
[Datenschutzhinweise](https://www.reselliq.app/privacy).

Vintefys separater Rechner verwendet feste Regeln. Seine Kategorienstatistik
besteht aus früheren KI-Preisvorschlägen, ausdrücklich nicht aus Verkaufspreisen.
Solche Zahlen sollten wir nicht als unabhängige Marktdaten übernehmen.
[Rechnermethode](https://vintefy.com/vinted-price-calculator).

Für eBay wird die Marketplace Insights API in der offiziellen Entwicklerhilfe
weiterhin als Limited Release geführt. Vor einer Integration wäre ein konkret
verfügbarer Zugang zu bestätigen; die normale Angebotssuche ersetzt ihn nicht.
[Offizielle API-Abgrenzung](https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application).

## Recherchierte externe Bausteine, nicht zur Integration freigegeben

| Baustein                                                                               | Öffentliche Schnittstelle                                                                                                                        | Einsatz und Grenzen                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [SerpApi Google Lens](https://serpapi.com/google-lens-api)                             | Bild-URL, Bildsuche mit ergänzendem Text, visuelle/exakte Treffer, Links und teilweise Preis/Lieferbarkeit.                                      | Konkrete Kandidaten und Produktseiten vor einer KI-Bewertung finden. Drittanbieter für Google-Ergebnisse, keine offizielle Google-Lens-API. Ähnlichkeit bestätigt noch keine genaue Variante.                                                                                                                                 |
| [Lykdat](https://apidocs.lykdat.com/)                                                  | Fashion-Bildsuche im eigenen oder angebotenen globalen Katalog, Erkennung und Merkmalszuordnung. Treffer mit Preis, Quelle und Ähnlichkeitswert. | Speziell für Kleidung; Abdeckung gebrauchter und älterer Modelle müsste gemessen werden. Ein Katalogtreffer liefert keine Transaktionshistorie.                                                                                                                                                                               |
| [metoda Price API](https://www.priceapi.com/data-sources/idealo)                       | Strukturierte Idealo-Angebote und weitere Preisquellen; Suche über Kennung, GTIN oder Text.                                                      | Interessant nach Modellbestimmung für Neuware. [Dokumentierter Einstieg](https://readme.priceapi.com/docs/costs-subscription-plans-and-contracts): 499 EUR/Monat. [Weiterverwendung für Dritte](https://www.priceapi.com/legal/terms) erfordert laut Bedingungen vorherige Freigabe; für Flipbase ein konkreter Auswahlpunkt. |
| [Vinted Pro Integrations](https://pro-docs.svc.vinted.com/#get-item-price-suggestions) | Preisvorschlags-Endpunkt nach Kategorie, Marke und Zustand, gestützt auf historische Verkäufe.                                                   | Liefert einen maximalen Preisvorschlag, keine modellgenauen Vergleichsdatensätze und keine Bildsuche. Dokumentierter Zugang über Pro-Portal; tatsächliche Freischaltung für unseren Markt nicht geprüft.                                                                                                                      |

[SerpApi-Tarife](https://serpapi.com/pricing): 250 Suchen kostenlos, danach
beispielsweise 25 USD für 1.000 Suchen/Monat. Vier Suchaufrufe entsprechen bei
voller Nutzung dieses Tarifs rechnerisch 0,10 USD. Modellkosten, weitere
Datenquellen und Seitenabrufe kommen hinzu; bei geringer Nutzung steigt der
anteilige Preis. Das ist eine Kostenrechnung, kein Angebot für eine komplette
Analyse und kein gemessener Vergleich zum bisherigen Astra-Lauf.

## Was öffentlich über die Technik erkennbar ist

[ViSenze](https://www.visenze.com/newsletter/multimodal-ai-shaping-the-future-of-commerce-search-and-product-discovery/)
beschreibt gemeinsame Vektordarstellungen aus Bildern und Text. Sie ermöglichen
Ähnlichkeitssuche in einem Produktbestand; das ist von einer freien
Preisantwort eines Sprachmodells zu unterscheiden. Für Flipbase wäre dafür
auch ein ausreichend guter, aktueller Artikelbestand nötig.

Das offene Projekt
[Vinted AutoLister](https://github.com/LorenzoMascia/vinted_autolister) trennt
Bilderkennung, Vergleichssuche, Preisrechnung und Text. Der
[Bildprompt](https://github.com/LorenzoMascia/vinted_autolister/blob/main/src/core/vision_analyzer.py)
fordert schlicht strukturierte Kleidungsmerkmale an. Der
[Preiscode](https://github.com/LorenzoMascia/vinted_autolister/blob/main/src/core/price_analyzer.py)
verwendet Median und feste Strategie-/Zustandsfaktoren. Kein verborgener
Spezialprompt erklärt diese Aufteilung. Das Projekt nutzt nur ein Bild,
Angebotspreise und bei Ausfällen gekennzeichnete Demodaten; diese Grenzen und
pauschalen Faktoren sind keine Empfehlung zur Übernahme.

Auch eine
[Forschungsarbeit zur Secondhand-Preisvorhersage](https://arxiv.org/abs/2012.06009)
kombiniert Bildmerkmale mit Plattformstatistik und einem Regressionsmodell.
Sie belegt ein anderes technisches Verfahren, keine aktuelle Überlegenheit
für unsere Kleidungsauswahl.

## Empfohlener Ablauf und Prompt-Verantwortung

Die folgenden allgemeinen Schritte sind ein eigener Vorschlag. Für die Umsetzung
gilt inzwischen das verlinkte interne Konzept ohne zusätzliche Anbieterzugänge:

1. Alle Originalfotos und Inseratmerkmale einlesen. Sichtbare Fakten,
   Verkäuferangaben und Vermutungen getrennt ausgeben; lesbare Modellnummern und
   Etiketten priorisieren. Für die Identifikation den Kaufpreis zurückhalten,
   damit er nicht unnötig die Modell- oder Wertschätzung beeinflusst.
2. Aus Übersicht und wichtigen Details gezielte Bildsuchen starten; Textsuche
   um Marke, Modell und gegebenenfalls Artikelnummer ergänzen. Alle Fotos bleiben
   für die Analyse verfügbar, müssen aber nicht einzeln dieselbe Suche auslösen.
3. Ein Modell prüft wenige Kandidaten gegen Fotos und Merkmale: Modellfamilie,
   genaue Ausführung, Größe, Zustand und Abweichungen. Ein Ergebnis für eine
   ähnlich aussehende Jacke bleibt ein Vergleich und wird nicht zur Identität.
4. Neuangebote und Gebrauchtbelege getrennt sammeln. Jeden Preis mit URL,
   Abrufdatum, Währung, Größe/Zustand und Belegart speichern: laufendes Angebot,
   Angebot eines später verkauft markierten Artikels oder belegter Endpreis.
5. Code berechnet nach Deduplizierung und Relevanzprüfung Fallzahl, Median und
   Streuung. Bei dünner oder abweichender Grundlage keine präzise Zahl erzwingen.
   Erst anschließend Einkaufspreis gegenüberstellen.
6. Die KI erklärt die Rechnung anhand der ausgewählten Belege. Zusätzliche
   Recherche nur bei widersprüchlichen oder zu wenigen Treffern; vorhandene
   Artikelidentitäten und ausreichend frische Belege wiederverwenden.

Der System-Prompt sollte diese Aufgaben und Abbruchbedingungen kurz und prüfbar
festlegen. Jeder Modellkandidat braucht konkrete stützende und widersprechende
Merkmale; jede Preisaussage eine Belegkennung. Eine selbst genannte
Konfidenzzahl allein ersetzt keine bestätigte Trefferqualität.

Vor einem Umbau empfiehlt sich ein Vergleich an beispielsweise 30–50 realen
Artikeln, darunter die Carhartt-Jacke: exakte Modell-/Variantentreffer,
brauchbare Belege, falsche Verkaufspreisbehauptungen, Kosten, Laufzeit und
sinnvolle Unsicherheit erfassen. Aktueller Ablauf gegen Bildsuche plus begrenzte
KI-Auswertung vergleichen. Erst damit ließen sich bessere Qualität und
Ersparnis belastbar behaupten. Dieser Vergleich wurde noch nicht ausgeführt.
