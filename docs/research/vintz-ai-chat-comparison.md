# Vintz: eigenständiger KI-Chat im Vergleich mit Flipbase

Untersuchung von Juna am 18.10.2026. Bildstudio-Punkte als Richtung festgehalten;
freigegeben ist ausschließlich die Analyse des eigenständigen KI-Chats.
Danach stoppen, nichts umsetzen oder ausführen. Deshalb **keine Frage abgesendet**,
auch keine unverbindliche Starterfrage.

## Ergebnis und Beleggrenzen

Vintz besitzt einen eigenständigen Chat als gemeinsamen Zugang zu Verkäuferdaten,
Auswertungen und vorbereiteten Aktionen. Flipbase hat derzeit keinen entsprechenden
allgemeinen KI-Chat. Vorhandene Produktrecherche und lokale Hilfsfunktionen sind
unterschiedliche Bausteine und dürfen nicht als fertiger Chat gezählt werden.

Das interessante Vintz-Vorbild ist die Verbindung aus verständlicher Frage,
strukturierter Datenkarte, weiterführendem Seitenzugang und gesonderter
Aktionsfreigabe. Erfolgreiche Antworten oder Ausführungen sind in diesem Schritt
jedoch nicht nachgewiesen. Im gelesenen Freigabecode besteht zudem eine konkrete
Unstimmigkeit im Datenfluss.

| Belegart       | Umfang                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vintz live     | [KI-Chat](https://vintz.ai/assistant) mit leerem Eingabefeld, vier Starterfragen, sichtbarem Kontobezug und leerem Verlaufsmenü gelesen.                                   |
| Vintz Frontend | Geladene Module zu Karten, Kontextaufnahme, Streaming, Verlauf, Freigabe, Kostenlimit und Bedienung untersucht.                                                            |
| Flipbase       | Quellen bei `e3ef736370640125c1abddcaf82de6079205d9fa`, einschließlich tatsächlicher KI-Produktrecherche und lokaler Simulationen.                                         |
| Nicht geprüft  | Antwortqualität, tatsächliche Werkzeugdaten, Kontext-/Kontentrennung auf dem Server, Modellanbieter, erfolgreiche Freigabe, Wiederholschutz, reale Kosten oder Ausführung. |

Kein Testprompt, keine Modellanfrage, kein Abbruch einer aktiven Berechnung, keine
Kontoaktion, Nachricht, Automationsübergabe, Datei oder Mikrofonfreigabe.
Vorhandene anderweitig belegte Tabs nicht übernommen. Ein separater Lesetab wurde
verwendet und geschlossen.

## Sichtbarer Einstieg und Bedienung

Die Seite zeigt „KI-Chat“, „Live-Shopdaten“, Verlauf und Neuer Chat. Im aktuellen
Verlauf stand **Noch keine Chats**. Das leere Eingabefeld hat einen deaktivierten
Sendeknopf. Der Hinweis sagt, dass Vintz sich irren kann und Shopänderungen eine
Freigabe brauchen.

Vier vorgeschlagene Fragen:

- Was soll ich heute erledigen?
- Wie laufen meine Verkäufe diesen Monat?
- Was ist eine Levi's 501 W32 wert?
- Welche Artikel brauchen einen Schub?

Der Code sendet Starterfragen **direkt beim Anklicken**. Sie füllen nicht nur
ein Eingabefeld vor. Deshalb nicht angeklickt. Dasselbe gilt für spätere
Folgefragen und Erneut fragen.

Enter sendet, Umschalt+Enter erzeugt einen Zeilenumbruch; laufende Eingaben werden
gegen Doppelsenden gesperrt. Während einer Antwort ersetzt ein Stoppknopf den
Sendeknopf. Neuer Chat ist währenddessen deaktiviert; Wechsel zu einem vorhandenen
Chat kann die laufende Anfrage abbrechen. Keine Datei-, Bild-, Audio- oder
Mikrofoneingabe und keine Nutzermodellwahl in dieser Oberfläche oder ihrem
untersuchten Eingabecode gefunden.

Die Seite unterstützt Deutsch/Englisch. Antworten können Überschriften, Listen,
Tabellen, Zitate, Links und Kopierknöpfe darstellen. Externe Links im Text werden
im Renderer auf festgelegte Anbieter-/Marktplatzdomains begrenzt. Das ist eine
Darstellungsregel, kein Beweis überprüfter Quellen oder korrekter Aussagen.

## Vorgesehene Datenkarten und Aufgaben

Der geladene Renderer kennt folgende Werkzeugergebnisse. Das belegt passende
Karten und Datenfelder; es bestätigt weder, dass der Server jedes Werkzeug
bereitstellt, noch dass dessen Berechnung vollständig ist.

| Bereich                    | Vorgesehene Werkzeuge und Darstellung                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tagesübersicht             | `get_seller_overview`: ungelesene Chats, zu versendende Bestellungen, fehlgeschlagene Aufträge und ältere Angebote.                                 |
| Angebote und Suche         | `get_listings`, `search_inventory`, `get_listing_performance`: Artikel, Preis, Status, Alter, Aufrufe/Favoriten, gegebenenfalls Buchhaltungsquelle. |
| Postfach und Preisangebote | `get_recent_messages`, `get_pending_offers`: Käufer-/Artikelbezug, letzte Nachricht, ungelesen, Angebotspreis und Rabatt.                           |
| Bestellungen und Versand   | `get_orders`, `get_shipping_tasks`: Status, Datum, Konto und Versandbedarf; Zugang zur Bestellansicht.                                              |
| Betrieb                    | `get_failed_jobs`, `get_account_health`: Fehler, Kontozustand und Einschränkungen.                                                                  |
| Tarif                      | `get_plan_and_usage`, `get_plans`: Plan, Kontingente und Studiocredits mit Tarifvergleich.                                                          |
| Auswertung                 | `get_sales_summary`, `get_bookkeeping_summary`: Umsatz, Stückzahl, Durchschnitt, Marge sowie Vorperiodenvergleich.                                  |
| Marktpreis                 | `market_price_check`: Empfehlung, Schnellverkauf, Spanne und Vergleichsangebote mit Quellenbezug. Reale Vergleichsqualität hier nicht geprüft.      |
| Automation vorbereiten     | `create_automation_draft`: strukturierter Entwurf mit Übergabe an den bestehenden Regelbaukasten. Kein Beleg sofortiger Aktivierung.                |
| Navigation                 | `open_route`, `open_conversation`: Seiten-/Gesprächszugang aus der Antwort.                                                                         |

Diese Ergebnisse verbinden die bereits separat untersuchten Angebots-,
Versand-, Finanz- und Automationsbereiche. Ein Chatwert ist deshalb nicht
automatisch vollständiger oder aktueller als seine Datenquelle. Die Definitions-
und Importgrenzen aus den vorherigen Berichten gelten weiterhin.

## Kontext: Was vor einer Frage vorbereitet würde

Die Anfrage an `POST /api/seller/assistant` enthält Nachricht, Sprache, aktuelle
Seite, die letzten **acht Nachrichtenobjekte mit Text** aus dem Gespräch und
gegebenenfalls einen Browserdaten-Auszug. Nicht der vollständige gespeicherte
Chat wird bei jeder Frage übertragen. Frühere Karten und Aktionsobjekte werden
in diesem Verlaufsausschnitt nicht als vollständiger strukturierter Kontext
mitgesendet.

Für ein persönliches Browser-/Erweiterungskonto sieht der Client vor:

- Verbindungs-/Profilprüfung; auf iOS ohne diese Browserbrücke nicht verfügbar.
- Erste Seite mit bis zu 60 Angeboten, 20 Gesprächen und 20 Verkäufen.
- Wiederverwendung zuletzt gelesener Daten, zum Teil bis zu zwei Minuten alt.
- Bis zu fünf kürzlich geöffnete Gespräche aus dem lokalen Zwischenspeicher,
  dort je bis zu acht Textnachrichten und bis zu drei aktuelle Preisangebote.
- Metadaten wie Lesedatum, Anbieterkennung, Konto und Verfügbarkeit; Fehler
  werden als fehlender Kontext behandelt.

Dieser vorbereitende Browserauszug entfällt im Teammodus. Cloud-/Teamdaten
müssten serverseitig ergänzt werden; dessen tatsächliche Abfragen wurden nicht
eingesehen. Auch die sichtbare globale Auswahl „Maike Vintage“ beweist nicht,
dass sämtliche Antworten nur dieses Konto berücksichtigen: Die gelesene
Chat-Anfrage enthält keinen ausdrücklichen Cloud-`accountScope`-Parameter.
Serverseitige Kontentrennung bleibt offen.

Die Browserprüfung beginnt erst beim Absenden, nicht durch den bloßen leeren
Seiteneinstieg. In diesem Schritt nicht ausgelöst. **Lokal gespeicherter Verlauf
bedeutet nicht lokal berechnete Antworten:** Frage, Verlaufsausschnitt und
Browserdaten würden an Vintz übertragen. Externer Modellanbieter,
Unterauftragsverarbeitung und serverseitige Speicherung sind damit nicht geklärt.

„Live-Shopdaten“ ist zudem mit dem im Antwortcode vorgesehenen Hinweis zu lesen,
dass Zahlen vom letzten Abgleich stammen und veraltet sein können. Eine vollständige
Echtzeitabfrage aller Verkäufe ist daraus nicht abzuleiten.

## Antworten, Verlauf und Wiederaufnahme

Der Client fordert einen Ereignisstrom an und verarbeitet Statusmeldungen,
Werkzeugkarten, Aktionsvorschläge, Textteile, Abschluss und Fehler. Für normale
JSON-Antworten existiert ein Ersatzpfad. Bis zu drei Seitenzugänge und drei
Folgefragen können nach einer Antwort angezeigt werden.

Die aufklappbare Schrittdarstellung zeigt vom Server gelieferte Statusnamen.
„Nachgedacht für …“ wird aus dem Zeitabstand bis zum ersten Text abgeleitet.
Das ist kein Einblick in verifiziertes internes Modellreasoning.

Stopp verwendet einen clientseitigen Anfrageabbruch. Das ist kein Nachweis,
dass serverseitige Arbeit gestoppt, Kosten zurückerstattet oder bereits
gestartete Aufträge rückgängig gemacht werden. Eine unterbrochene Antwort kann
erneut angefragt werden; der eigenständige Seiteneinstieg hat keinen belegten
Offlineantwortdienst.

Der Verlaufshelfer speichert in **Local Storage**, mit Nutzerkennung und
gegebenenfalls Workspace im Schlüssel:

- Bis zu 30 Chats, je bis zu 40 Nachrichtenobjekte.
- Titel aus der ersten Nutzerfrage; Sortierung nach letzter Aktualisierung.
- Bei größerem serialisiertem Inhalt werden ältere Chats entfernt, solange
  mehrere vorhanden sind.
- Lokale Suche nach Chattitel, Wechsel und direkte Löschung eines Chats.
- Nutzerwechselprüfung beim Speichern und Signale für andere Tabs.

Das ist kein nachgewiesener geräteübergreifender Serververlauf. Keine
Verschlüsselung des lokalen Verlaufs aus diesen Schlüsseln ableiten. Die
Oberfläche erklärt die lokalen Aufbewahrungsgrenzen im gesehenen Leereinstieg
nicht. Ein leerer Seiteneinstieg kann bereits eine aktive lokale Chatkennung
setzen; daraus entsteht noch keine gesendete Unterhaltung.

## Freigaben: gutes Bedienkonzept, Ausführung unbestätigt

Aktionsvorschläge sind als Karten mit Titel, Beschreibung und Fakten vorgesehen.
Freigeben und Jetzt nicht sind getrennt. Zustände: ausstehend, wird eingereicht,
freigegeben, abgewiesen und fehlgeschlagen. Ablehnen ändert zunächst den lokalen
Kartenzustand; Freigeben ruft `/api/seller/assistant/action` auf.

Die Rückmeldung unterscheidet unter anderem ein-/ausgeschaltet, bereits so
eingestellt, bereits eingeplant und neu eingeplant. Ein eingeplanter Auftrag
ist noch kein erfolgreicher Abschluss beim Marktplatz. Die Darstellung kann
dafür bereits einen abgeschlossenen Freigabeschritt zeigen; die tatsächliche
Auftragswirkung muss getrennt verfolgt werden.

**Konkrete Unstimmigkeit im gelesenen Frontend:** Beim Empfang eines
Aktionsvorschlags übernimmt der Client `id`, `tool`, `args`, Titel, Beschreibung
und Fakten. Der Freigabeaufruf erwartet dagegen `action.token` und `action.tool`.
Das Token wird im untersuchten Empfangspfad nicht übernommen. In diesem
Datenfluss entfällt es beim JSON-Serialisieren als `undefined`.

Das ist eine belegte Inkonsistenz und eine mögliche Frontendlücke. Eine
serverseitige Fehlfunktion ist damit **nicht** bewiesen: alternative Zuordnung
oder andere Pfade sind unbekannt. Keine Aktion zum Testen erzeugt oder
freigegeben. Ebenso keine Garantie über Ablaufzeit, Wiederholschutz oder
serverseitige Rechteprüfung allein aus der Karte ableiten.

Der vollständige Katalog tatsächlich erlaubter Schreibwerkzeuge liegt nicht
im gelesenen Renderer. Deshalb keine frei erfundene Fähigkeit wie beliebige
Preisänderungen, Nachrichten oder Relistings als erfolgreich ausgeführte
Chatfunktion auflisten.

## Kosten und Modell

Im sichtbaren Chat kein konkreter Preis pro Frage, Verbrauchszähler oder
Modellname. Der Anfragehelfer behandelt serverseitige Monatslimits mit HTTP 402
und `ai_monthly_limit`, Rücksetzdatum und möglichem Tarifwechselzugang. Daraus
folgt kein geprüftes Kontingent für den eigenständigen Chat und keine Aussage,
dass Fragen kostenlos oder mit Studiocredits bezahlt werden. Keine Anfrage
ausgeführt, also auch kein realer Verbrauch gemessen.

## Flipbase: vorhandene Funktionen sauber trennen

| Bereich                              | Tatsächlicher Stand                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allgemeiner Chat                     | In untersuchten Routen, Navigation, Features, Services, Edge Functions und Schemas kein angebundener allgemeiner KI-Chat mit Verlauf oder Werkzeugauswahl gefunden.                                  |
| `AiAssistantService.identifyProduct` | Lokale Marken-/Stichwortprüfung mit festen Produkt-/Preiswerten. Tatsächlich für Lager-Autofill verwendet; kein Sprachmodell.                                                                        |
| `AiAssistantService.analyzeImage`    | 500-ms-Wartezeit und vorbereitete Antworten anhand von Dateiname/Hinweis. Keine Untersuchung der Bildpixel; auch Kameraaufnahme führt in diese Logik.                                                |
| Textverbesserung/Vorlagen            | Feste Textbausteine; `enhanceListingCopy` ohne gefundene produktive Aufrufstelle außerhalb der Tests. Kleinanzeigen-Vorlagen sind ebenfalls kein allgemeiner Chat.                                   |
| Echte Katalog-KI                     | EAN-/Fotorecherche über `barcode-ai-search` mit serverseitiger OpenAI-Anfrage, Websuche und strukturiertem Ergebnis. Kein allgemeiner Zugriff auf Verkäufe/Postfach oder frei wählbare Shopaktionen. |
| Postfach                             | Normaler Nachrichteneditor und regelbasierte Automationen; keine allgemeine KI-Unterhaltung daraus ableiten.                                                                                         |

Die tatsächliche Katalogrecherche nimmt EAN und bis zu fünf JPG-/PNG-/WebP-Fotos
mit höchstens 5 MB je Foto und 15 MB insgesamt entgegen. Sie unterscheidet
Quellentreffer, gelesene Etikettangaben und unsichere visuelle Vorschläge.
Übernehmen füllt zunächst das Formular; es speichert/veröffentlicht nicht
automatisch den Artikel.

Modelle sind im Servercode festgelegt, nicht vom Nutzer gewählt. Es gibt eine
Schätzung aus Token-/Suchverbrauch mit im Code hinterlegten Preiswerten und
einem lokalen Sitzungssummenzähler. Das ist kein Abrechnungsledger, Guthaben
oder hartes Kostenlimit. Keine aktuelle Anbieterpreisprüfung oder tatsächliche
Modellverfügbarkeit in diesem Analyseblock behaupten.

Die Katalog-KI wartet auf eine vollständige JSON-Antwort. Frontendschutz kann
verspätete Ergebnisse bei geändertem Artikelkontext verwerfen; das ist kein
Abbruch des Anbieteraufrufs. Zugriff ist im gelesenen Serverpfad auf angemeldete
Plattformoperatoren mit Workspace-Zugang begrenzt. `store: false` ist gesetzt;
Fotos und Suchauftrag werden trotzdem übertragen. Keine weitergehende
Datenschutzgarantie daraus ableiten.

## Vergleich und Übernahmekandidaten

| Aufgabe                         | Vintz                                                                    | Flipbase                                                                              |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Offene Fragen an Verkäuferdaten | Eigenständiger Chat und viele vorgesehene Datenkarten                    | Kein entsprechender allgemeiner Zugang                                                |
| Kontextbezug                    | Begrenzter Browserauszug, weiterer Serverkontext unbekannt               | Echte Katalogrecherche erhält gezielt EAN/Fotos und festen Rechercheauftrag           |
| Antworten                       | Streaming, Karten, Tabellen, Links, Folgefragen im Code                  | Strukturierte Produkttreffer; kein Chatstream                                         |
| Verlauf                         | Nutzer-/Workspace-getrennter lokaler Verlauf                             | Kein allgemeiner KI-Gesprächsverlauf gefunden                                         |
| Aktionen                        | Gesonderte Freigabekarten; Datenfluss inkonsistent, Ausführung ungeprüft | Keine allgemeine Modellauswahl von Shopaktionen; gezielte Formularübernahme vorhanden |
| Kosten                          | Allgemeiner Monatslimitpfad, konkrete Chatkosten offen                   | Schätzung für eng begrenzte Produktrecherche, kein Chatkontingent                     |

Für die Besprechung:

1. **Ein zentraler Leseassistent wäre ein neuer Funktionsbereich.** Tagesaufgaben,
   relevante Artikel und verständliche Zahlen wären nützlichere erste Aufgaben
   als möglichst viele schreibende Werkzeuge.
2. **Strukturierte Ergebnisse mit überprüfbarem Bezug übernehmen:** Datenkarte,
   Quelle, Zeitraum, Konto/Workspace, Aktualität und Zugang zur passenden Ansicht.
3. **Freigabe vor Wirkung:** konkrete Artikel, vorher/nachher, Kosten und Umfang
   zeigen; Vorschlag, Freigabe, Warteschlange und tatsächlichen Erfolg trennen.
   Vintz' unbelegten Freigabepfad nicht ungeprüft nachbauen.
4. **Verlauf und Datenumfang erklären:** lokal oder servergespeichert, tatsächliche
   Grenzen und Löschung verständlich machen. Sichtbare Kontowahl muss zur
   Datenabfrage passen.
5. **Vorhandene Grundlagen ehrlich bewerten:** Die echte Katalogrecherche liefert
   Erfahrung mit Quellen und geprüfter Übernahme. Der simulierte Bildscan ist
   keine bestehende Chat- oder Bilderkennungsgrundlage.

Keine Antwortqualität oder Zeitersparnis bestätigt. Ein späterer Lesetest mit
konkreten, nachrechenbaren Aufgaben wäre ein eigener freizugebender Schritt;
dieser Auftrag bleibt ohne Modellaufruf abgeschlossen.

## Quellen und Nachprüfbarkeit

Vintz: [eigenständiger Chat](https://vintz.ai/assistant) und bereits im Browser
geladene Erstanbietermodule. Keine fremden Quelltexte im Projekt gespeichert.

| Modul              | Bereich                                       | SHA-256                                                            |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------ |
| `1-fj4w87jfzmw.js` | Karten, Kontext, Streaming, Aktionsdatenfluss | `ac18edf9deedd1a2f6856f019e168bdc30024f552cddef491920c8516db14761` |
| `3l3bsr4b6dnkf.js` | Eigenständige Chatseite                       | `52128e4236cd1853bc66d7104f83dda938f4d455bc8251c6702f81168338fef1` |
| `0phyucjyrrvcf.js` | Lokaler Verlauf und Workspacebezug            | `f35c618de38d00ed45d62d1a8b59cd6e66f9bc0dc2d232c21c1c1f30f0464492` |
| `2z_q9tyop8si8.js` | Nutzerspezifische lokale Schlüssel            | `b60b929c14dcfa59ed7afca037450495cf8a2336f60d79512828f8a5290e52b0` |
| `2be85nvndtyhu.js` | Status-/Freigabekarten                        | `879b4309014e67788b796d2b4f9c8e000e8daa127ab3627dca203dba69bbf5f7` |
| `1_f4nrn8dk85w.js` | Monatliche KI-Limithinweise                   | `afb0096092b9134d56062053e0365fbc4db35229ad5bf61b8df8c1a58f240fe6` |

[Leerer Chat-Einstieg](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-ai-chat-entry-2026-10-18.png).

Flipbase-Quellen, Zeilen beim oben genannten Stand:

- [Lokale Erkennung/Simulation/Textbausteine](../../src/app/core/services/ai-assistant.service.ts),
  ab 45/162/240/270;
  [Lager-Autofill](../../src/app/features/inventory/components/item-create-modal/item-create-modal.component.ts), ab 238;
  [Kameraeingabe](../../src/app/shared/components/ai-photo-scanner-modal/ai-photo-scanner-modal.component.ts), ab 100.
- [Kleinanzeigen-Vorlagen](../../src/app/features/listings/services/listing-template.service.ts), ab 15.
- [Echte KI-Recherche](../../src/app/core/services/barcode-ai-lookup.service.ts), ab 49/118;
  [Serverprüfung und Anbieteraufruf](../../supabase/functions/barcode-ai-search/index.ts), ab 360/438/455/479/514/530.
- [Geprüfte Formularübernahme](../../src/app/features/catalog/pages/product-detail/product-detail.component.ts), ab 562/594;
  [Kostenanzeige](../../src/app/features/catalog/pages/product-detail/product-detail.component.html), ab 165.
- [Postfachcomposer](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.html), ab 527;
  [Nachrichtenversand](../../src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts), ab 625.
- [App-Routen](../../src/app/app.routes.ts) und repositoryweite Suche in
  `src/app`, `services`, `supabase/functions` und den Schemas nach allgemeinen
  KI-Chat-/Verlaufs-/Assistentenpfaden.

Nur Dokumentation geändert. Markdown, lokale Links und Unterschiedskontrolle
geprüft; keine Anwendungstests oder Modellaufrufe. Stopp zur Besprechung.
