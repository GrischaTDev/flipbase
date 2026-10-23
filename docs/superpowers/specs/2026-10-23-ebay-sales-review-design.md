# eBay: gespeicherte Daten, Bestandsverknüpfung und Verkaufsprüfung

Stand: 23.10.2026. Assistent: Juna. Untersuchte Integrationsbasis:
`origin/master` bei `3477b3e5`.

## Auftrag und Entscheidungen

Der Nutzer möchte eBay-Inserate vor oder nach einem Kauf mit konkreten Artikeln
aus dem Flipbase-Bestand verknüpfen. Ein bestätigter eBay-Verkauf soll automatisch
unter Verkäufe zur Prüfung erscheinen. Preis, Mengen, Datum, Gebühren und
Versandbeträge werden aus belegten Quellen vorbereitet. Erst nach persönlicher
Bestätigung wird endgültig gebucht. Eine vollständig automatische Buchung ist
ein späterer Auftrag.

Ausdrücklich bestätigt am 23.10.2026: Bei Erkennung des Verkaufs die verknüpfte
Menge sofort reservieren. Umsatz und Gewinn zählen erst nach der Bestätigung.
Bereits manuell gebuchte Verkäufe werden nachträglich zugeordnet, ohne weiteren
Verkauf oder Bestandsabgang. Nicht zugeordnete Bestellungen bleiben nachbearbeitbar.

Zusätzlich: gespeicherte Listen statt wiederholter vollständiger Anbieterabrufe,
Bestellungen mit Artikelbildern im Stil der Inseratliste sowie dauerhafte
eBay-Meldungen in der Glocke neben dem bestehenden Handy-Push.

Dieses Dokument beschreibt den am 23.10.2026 ausdrücklich zur Umsetzung
freigegebenen Gesamtumbau. Die eng begrenzte Korrektur der nachgewiesenen Erstattungssperre wird
bereits separat im eigenen Zweig vorbereitet; sie ändert keine Buchung und
erzeugt keine Entwürfe. Es wurde nichts veröffentlicht oder produktiv verändert.

## Nachgewiesener Ausgangsstand

- `EbayAccountStore` gehört zur jeweiligen Seitenkomponente, verwirft beim
  Initialisieren die Listen und ruft anschließend `ebay-account` auf.
  Dessen Listenaktionen lesen direkt bei eBay. Die Datenbank enthält Zuordnungen,
  kurzlebige Prüfstände und Buchungsbelege, aber keine vollständige gespeicherte
  Inserat- und Bestellliste für diese Oberfläche.
- Inserate haben bereits eine Zuordnungsaktion. Die Bestellprüfung kann fehlende
  Artikel auswählen und einen vorhandenen Verkauf als manuell erfasst zuordnen.
  Die Funktionen müssen verbessert werden; ein zweiter Buchungsweg ist unnötig.
- `buildEbaySaleEntryDraft` erzeugt nur ein Formularmodell im Arbeitsspeicher.
  Es existiert noch kein dauerhafter Verkaufsentwurf aus eBay-Bestellungen.
- Der Hintergrundbeobachter speichert nur Bestellkennung und Kaufzeit und
  erzeugt Push-Ereignisse. Er hängt an aktiven Push-Geräten und fragt nach
  Erstellungszeit ab. Er liefert weder vollständige Bestelldaten noch einen
  verlässlichen Änderungsabgleich älterer Bestellungen.
- Die Glocke liest eigene Meldungsquellen; der eBay-Beobachter schreibt derzeit
  keinen passenden Eintrag hinein. Die visuelle Erkennung eines eBay-Logos ist
  im Header bereits vorhanden.
- Die laufende Vinted-Arbeit im fremden Zweig `juna/vinted-sales-lifecycle`
  behandelt Anbieter-Verkäufe und Stornierungen. Laut dortiger Dokumentation
  ist die Bestandsverknüpfung ein Folgeauftrag. Dieser Zweig wird weder verändert
  noch als zusätzliche Integrationsbasis übernommen.

### Bestellung mit Endnummer 7587

Lesende Produktionsprüfung am 23.10.2026, anschließend genau ein lesender
Einzelbestellabruf bei eBay mit bereits gültigem Zugang:

- Zahlung `PAID`, Versand `FULFILLED`, Storno `NONE_REQUESTED`.
- `paymentSummary.refunds` ist ausdrücklich eine leere Liste.
- `lineItems[0].refunds` fehlt in der Anbieterantwort.
- Die bisherige Normalisierung setzt deshalb `hasRefund=true` und ausschließlich
  den Sperrgrund `refund_or_unknown`.
- Kein eBay-Übernahmebeleg vorhanden. Kein bestehender Verkauf mit genau dieser
  externen Bestellnummer gefunden. Das schließt einen früher ohne Nummer
  erfassten Verkauf ausdrücklich nicht aus.
- `totalMarketplaceFee` ist vorhanden; tatsächliche Versandkosten stehen nicht
  als eigener Bestellbetrag in dieser Antwort.

Weder rohe Anbieterantwort noch Zugangsdaten, Käuferanschriften oder komplette
Bestellkennungen wurden als Diagnoseartefakt gespeichert. Kein Token erneuert,
keine Bestellung verändert, kein Verkauf gebucht.

## Ansatz und Alternativen

Empfohlen wird eine dauerhafte, kontogebundene Lesekopie in Supabase mit einem
gemeinsamen Hintergrundabgleich. Bestehende Zuordnungen, Quellenkennungen und
die endgültige Buchung über `record_sale` bleiben die Grundlage.

Nur ein Browser-Zwischenspeicher würde den erneuten Seitenbesuch beschleunigen,
aber weder Gerätewechsel noch automatische Entwürfe bei geschlossener App
abdecken. Ein eigener paralleler eBay-Verkaufsbestand würde die bestehenden
Kosten-, Mengen- und Bestandsregeln verdoppeln. Beide Alternativen passen deshalb
nicht zum Auftrag. Die vorgeschlagene Umsetzung erweitert den vorhandenen Weg.

## Gespeicherte Listen und Hintergrundabgleich

Eigene deklarative eBay-Schemadateien definieren gespeicherte Inserate,
Bestellungen mit Positionen sowie Abgleichstände. Die bestehende persönliche
eBay-Kontoverbindung wird nicht mit einer Vinted-Verbindung gleichgesetzt.

Schlüssel enthalten Workspace, eBay-Umgebung, stabiles eBay-Konto und die echte
Inserat-/Bestell-/Positionskennung. Eine Verbindung kann nach erneutem Anmelden
auf dasselbe Konto dieselben Daten wiederverwenden, wenn der persönliche Zugriff
neu bestätigt ist. Gleichlautende Titel und SKUs erzeugen keine Verknüpfung.

Der erste Abgleich lädt aktive Inserate und zunächst die vorhandene
90-Tage-Bestellansicht vollständig seitenweise. Der zuletzt vollständige Stand
bleibt währenddessen sichtbar. Teilantworten dürfen keine fehlenden Inserate
als beendet markieren. Ein unvollständiger Abgleich verschiebt seine Abschluss-
marke nicht. Bereits gespeicherte Bestellungen bleiben auch nach Verlassen des
Anbieter-Zeitfensters als bearbeitbare Quellenbelege erhalten.

Folgeabrufe lesen Bestelländerungen mit dem offiziell unterstützten
Änderungszeitfilter, festem Zeitfenster, Seitenfortschritt und überlappendem
Rand. Neu entstandene und später bezahlte, versendete, stornierte oder erstattete
Bestellungen werden erfasst. Ein regelmäßiger vollständiger Abgleich der aktiven
Inserate bleibt nötig, wenn der benutzte eBay-Leseweg keinen vollständigen
Änderungsnachweis liefert. „Nur Änderungen“ wird für diese Quelle nicht behauptet.

Der Ablauf verwendet Kontosperren, begrenzte Anfragen, Wiederholpausen und eine
Fortsetzung nach Abbruch. Als technische Vorgabe vorgeschlagen: Bestellabgleich
im bestehenden Fünf-Minuten-Takt; Inserate seltener und zusätzlich nach einer
erfolgreichen Bearbeitung. Konkrete Grenzen werden anhand der dokumentierten
eBay-Limits festgelegt. Es entsteht kein zusätzlicher paralleler Poller pro Seite.

Der Abgleich arbeitet für berechtigte verbundene Konten unabhängig von aktiven
Push-Abonnements. Push-Opt-in und seine Pilotgrenzen steuern weiterhin nur die
Push-Zustellung. Trennen, fehlende Berechtigung oder Archivierung stoppen den
Abruf und verhindern den weiteren Zugriff auf private eBay-Quelldaten.

Beim Öffnen liest Angular zuerst den gespeicherten Stand. „Wird aktualisiert“
ersetzt die vorhandenen Zeilen nicht durch eine leere Tabelle. Beim ersten
Import wird ein verständlicher Ladezustand gezeigt. Abruffehler erhalten die
Daten und nennen den letzten erfolgreichen Abgleich. Ein zusätzlicher
seitenbezogener Signalspeicher verhindert unnötiges Leeren bei Rücknavigation;
er wird bei Nutzer-, Konto- und Workspacewechsel sicher getrennt.

## Bilder und Bestellübersicht

Die Bestellliste nutzt dieselben Tabellen-, Vorschaubild-, Status- und
Aktionsbausteine wie Inserate. Pro Position werden Bild, Titel, Menge und
zugeordneter Bestandsartikel gezeigt. Bezahlt, versendet und übernommen sind
getrennte Zustände.

Bildquellen: vorhandenes gespeichertes eBay-Inserat anhand der Anbieterkennung,
danach Bild des ausdrücklich verknüpften Bestandsartikels. Bei historischen
Bestellungen kann ein begrenzter offizieller Inseratdetailabruf fehlende Bilder
ergänzen, soweit die bestehende Berechtigung und Quelle das erlauben. Er läuft
im Hintergrund, wird zwischengespeichert und erzeugt keine Einzelanfrage beim
Rendern jeder Zeile. Ohne Bild bleibt der bestehende zugängliche Platzhalter.

## Zuordnen und nachträglich abgleichen

Inserataktion: „Mit Bestand verknüpfen“, anschließend sichtbarer Zielartikel
und gegebenenfalls konkrete Variante. Zuordnungen dürfen geändert oder gelöst
werden. Eine Änderung schreibt historische bestätigte Verkäufe nicht um.

Bestellaktion: „Bestellung prüfen“ öffnet zwei verständliche Wege:

1. „Noch nicht erfasst“: verfügbare konkrete Bestandsartikel und Mengen wählen;
   gültige bestehende Inseratzuordnungen werden vorgeschlagen.
2. „Bereits als Verkauf erfasst“: einen vorhandenen Verkauf mit seinen
   Positionen auswählen. Die Zuordnung verwendet dessen Artikel und verändert
   weder seine bestätigten Kosten noch seinen Bestandsabgang automatisch.

Die zweite Auswahl liest bestehende Verkaufspositionen einschließlich verkaufter
Artikel, nicht nur aktuell verfügbaren Bestand. Fremde Workspaces, zurückgenommene
und bereits anderweitig vollständig zugeordnete Verkäufe werden ausgeschlossen.
Mengen, Positionen und eBay-Plattform müssen nachvollziehbar zusammenpassen;
abweichende Altangaben werden sichtbar erklärt. Kein automatischer Treffer allein
wegen eines ähnlichen Titels oder Betrags. Im ersten Ausbau wird eine vollständige
eBay-Bestellung einem vollständigen internen Verkauf zugeordnet; mehrere interne
Verkäufe für eine Bestellung werden als manueller Klärfall angeboten und nicht
still zusammengeführt.

Die bisherige ausdrückliche Markierung ohne Verkaufsverweis bleibt als
Ausnahme für tatsächlich außerhalb von Flipbase erfasste Bestellungen erhalten.
Sie ist vom Verknüpfen mit einem bestehenden Flipbase-Verkauf klar getrennt.
Eine bloße historische Zuordnung eines ausverkauften Artikels erlaubt keinen
neuen Verkauf ohne verfügbare Menge.

## Dauerhafter Verkaufsentwurf und Reservierung

Eine bezahlte, nicht stornierte und nicht erstattete Bestellung mit vollständig
eindeutiger Bestandszuordnung erzeugt genau einen dauerhaften eBay-Entwurf.
Dieser erscheint unter „Verkäufe“ im Bereich „Zu prüfen“. Unverknüpfte
Bestellungen bleiben in der Bestellübersicht mit „Zuordnung fehlt“; ihre
Prüfung kann einen unvollständigen Entwurf speichern. Nach vollständiger
Zuordnung greift derselbe Reservierungsablauf.

Mehrere Positionen bilden einen Entwurf. Eine Reservierung erfolgt gemeinsam
für alle zugeordneten Mengen oder gar nicht. Fehlbestand erzeugt den Hinweis
„Bestand prüfen“ und keine Teilreservierung. Jede Reservierung gehört eindeutig
zu ihrem Entwurf und darf fremde manuelle Reservierungen nicht übernehmen oder
freigeben. Vorhandene Bestandsbewegungsregeln werden verwendet und nötigenfalls
um einen eindeutigen Entwurfsbezug ergänzt.

Technische Zustände: `needs_mapping`, `needs_stock`, `needs_costs`,
`ready_for_review`, `blocked`, `booked`, `linked_existing`, `dismissed`.
Oberflächentexte bleiben Deutsch. `blocked` beschreibt eine unzulässige oder
ungeklärte Quelle; `needs_costs` ist ein bearbeitbarer Entwurf. Ein Entwurf ist
kein Datensatz in der bisherigen endgültigen Verkaufsauswertung. Er erhält
keine endgültige Verkaufsnummer und erzeugt keine Rechnung, Umsatz- oder
Gewinnbuchung.

Vor der Bestätigung liest der Server die konkrete Bestellung erneut bei eBay,
prüft Änderungen, Mengen, aktuelle Kosten und Quellenbelege. Eine inhaltliche
Änderung verlangt erneute Prüfung. Verkauf, Positionen, Umwandlung der eigenen
Reservierung in einen endgültigen Abgang, Nummerierung und Übernahmebeleg
werden gemeinsam transaktional gebucht. Eine Wiederholung liefert denselben
Verkauf. Unklare Transportantworten werden vor einer Wiederholung aufgelöst.

Eine nachträgliche Zuordnung zu einem bestehenden Verkauf löst nur die eigene
offene Entwurfsreservierung, schließt den Entwurf und speichert den Quellenbeleg.
Der bestehende Verkauf wird nicht erneut gebucht. Quellen- und Verkaufszuordnung
werden gegen parallele Abgleiche und doppelte Bestätigung gesperrt.

Bei eindeutigem Storno vor endgültiger Buchung wird die eigene Reservierung
freigegeben; der Vorgang bleibt sichtbar. Bei Erstattung oder unklarem
Quellstatus bleibt die Reservierung bis zur bewussten Klärung bestehen, weil
eine Erstattung keine belegte Rückkehr der Ware ins Lager ist. Nach endgültiger
Buchung werden Storno und Erstattung als Klärbedarf mit Verweis auf den
bestehenden Retouren-/Korrekturweg gezeigt; keine automatische zweite Buchung
oder automatische Wiedereinlagerung. Der Doppelübernahmeschutz bleibt erhalten.
Trennen eines Kontos löscht weder Belege noch Reservierungen stillschweigend;
eine interne Klärung bleibt für berechtigte Warenwirtschaftsnutzer erreichbar.

Beim ersten Datenimport werden historische Bestellungen nicht massenhaft
reserviert. Sie erscheinen zunächst zum Abgleichen; der Nutzer kann sie als
bereits erfasst zuordnen oder bewusst zur Übernahme vorbereiten. Neue
Bestellungen nach abgeschlossener Erstbasis werden automatisch vorbereitet.
Damit werden früher ohne eBay-Nummer manuell erfasste Verkäufe nicht noch
einmal reserviert oder gebucht.

## Gebühren und Versand

Warenumsatz, Käufer-Versandzahlung und eigene Kosten bleiben getrennt.
`totalMarketplaceFee` dient als belegter Gebührenbetrag, sofern vorhanden,
gültig und in derselben unterstützten Währung. `totalFeeBasisAmount` ist die
Berechnungsgrundlage und darf nicht als Gebühr übernommen werden. Eine fehlende
Gebühr bleibt unbekannt; eine ausdrücklich gelieferte Null ist ein bekannter Wert.

Der erste Ausbau nutzt die vorhandene Fulfillment-Berechtigung. Die offizielle
Dokumentation bestätigt die Bestell-Gebührensumme; ihre genaue Zusammensetzung
und mögliche spätere Korrekturen werden im Review sichtbar gehalten.
Werbekosten dürfen nicht zusätzlich angesetzt werden, wenn sie bereits in der
übernommenen Summe enthalten sind.

Tatsächliche Versandkosten werden aus einem bereits eindeutig zugeordneten
Portobeleg übernommen, soweit vorhanden. Die Käufer-Versandzahlung wird niemals
als eigene Versandkosten kopiert. Fehlt ein belegter Kostenwert, bleibt er leer,
der Entwurf nennt „Versandkosten ergänzen“ und die Buchung wartet. Gleiches gilt
für manuell nötige Zusatzkosten. Bekannte Kosten werden vorausgefüllt und
bleiben vor der Bestätigung prüfbar.

Ein zusätzlicher offizieller Finances-Abgleich für Gebührenaufschlüsselung und
eBay-Portobelege kann später dieselben Kostenquellen ergänzen. Seine zusätzlichen
Rechte sind heute nicht im konfigurierten Scope enthalten. Dieser Ausbau darf
nicht durch geschätzte Werte oder einen stillen Rechtewechsel ersetzt werden.
Extern gekauftes Porto lässt sich auch mit dieser API nicht allgemein ermitteln.

## Glocke und Handy-Push

Neue eBay-Verkäufe erzeugen einen dauerhaften, kontogebundenen Meldungseintrag
mit eBay-Logo und Link zur passenden Bestellung beziehungsweise Verkaufsprüfung.
Lesestatus und Löschen des Meldungsverlaufs bleiben getrennt vom Verkaufsbeleg.
Private Quelldaten werden nur bei persönlichem Zugriff auf dasselbe eBay-Konto
angezeigt; ein allgemeiner Workspace-Eintrag darf keine zusätzliche Kontofreigabe
umgehen.

Eine eindeutige Ereigniskennung verhindert doppelte Einträge bei Wiederholung
oder mehreren Verbindungen desselben Kontos. Der Erstimport ist still; ein
späterer Wechsel von unbezahlt zu bezahlt erzeugt höchstens die eine passende
Verkaufsmeldung. Push bleibt zusätzlich und freiwillig. Entwurfserstellung und
spätere Buchung desselben Verkaufs erzeugen keinen zweiten „Neuer Verkauf“-Push.
Fehlende Zuordnung und Kosten führen zu einem zutreffenden Prüfhinweis.

## Rechte, Daten und Umsetzungsspielraum

Neue Tabellen liegen in `public`, haben RLS, explizite Rechte und getrennte
Policies je Operation und Rolle. Datenbankfunktionen validieren Workspace,
aktuelle Mitgliedschaft, Konto, Umgebung und Autorisierungsfassung. Private
Quellkopien sind serverseitig geschrieben und weder anonyme API noch allgemeiner
Workspace-Bestand. Authentifizierte Nutzer können keine freigegebenen Quellen,
Buchungsbelege oder Reservierungsbesitzer direkt fälschen.

Keine Käuferanschriften oder vollständigen Anbieterantworten speichern, wenn
normalisierte Bestell- und Kostendaten genügen. Auth-Zustand bleibt zentral.
Frontendabfragen gehören in Feature-Services, Sichtzustand in Signals.
Private Broadcast-Kanäle können gespeicherte Änderungen mitteilen;
`postgres_changes` wird nicht verwendet.

Schemaänderungen werden deklarativ in getrennten Themen-Dateien gepflegt;
neue Migrationen werden daraus erzeugt und geprüft. Anschließend Typen
regenerieren. Bestehende Migrationen und der fremde Vinted-Zweig bleiben erhalten.
Neue Bibliotheken oder ein Framework-Update sind hierfür nicht vorgesehen.

Konkrete Dateiaufteilung, RPC-Namen und interne Auftragsgröße entscheidet die
Umsetzung anhand dieser Grenzen. Keine neue Veröffentlichung von Inseraten,
keine Änderung auf eBay und keine automatische endgültige Buchung enthalten.

## Abnahme und Prüfungen

1. Bezahlte/versendete Bestellung mit leerer Bestell-Erstattungsliste und ohne
   Positionsfeld bleibt buchbar; echte und unklare Erstattungen sperren weiter.
2. Rücknavigation zeigt gespeicherte Zeilen; Hintergrundfehler erhalten sie.
   Nutzer-/Konto-/Workspacewechsel zeigen keine fremden Daten.
3. Vollständiger Erstimport, Folgeseiten, Abbruch, Wiederaufnahme und ältere
   geänderte Bestellung; unabhängiger Betrieb ohne Push-Gerät.
4. Inserat- und nachträgliche Bestellzuordnung mit Varianten und Mengen;
   Altverkauf auch bei bereits verkauftem Artikel auswählbar, ohne Doppelabgang.
5. Genau ein Entwurf und eine eigene Reservierung je Quellenbestellung auch
   bei parallelen Abrufen; Paket vollständig oder keine Reservierung.
6. Fehlende und echte Nullkosten, Gebührenbasis gegenüber tatsächlicher Gebühr,
   Käuferporto gegenüber eigenen Versandkosten und Cent-Verteilung prüfen.
7. Bestätigung, Quelländerung, Antwortverlust, Wiederholung, Storno, Erstattung,
   Fehlbestand, Kontotrennung und erneute Verbindung testen.
8. Glocke mit eBay-Logo, passendem Ziel, Lesestatus, stillem Erstimport und
   unveränderter Push-Freiwilligkeit; keine doppelten Verkaufsmeldungen.

Die Umsetzung bestimmt den Prüfumfang mit `scripts/affected-tests.mjs`, den
realen Imports und der CI-Auswahl. Betroffene bestehende Modell-, Angular-,
Edge-, Datenbank- und Workerfälle gehören dazu, ebenso die vorhandenen
eBay-Import- und Verkaufsbrowserfälle. Neue fachliche Regressionen müssen in
den Soll-Listen und der Auswahl registriert sein. Gemeinsame Reservierungs-
oder Verkaufsregeln beziehen ihre tatsächlichen anderen Verbraucher ein.

Vorlagenänderungen benötigen einen Angular-Bau. Betroffene Browseransichten
werden in relevanten CI-Breiten, Hell/Dunkel, Touch, Tastatur und mit AXE
geprüft. Schema- und übergreifende Auswahländerungen verlangen zusätzlich
den vom Projekt vorgesehenen breiten Pflichtlauf. Keine fachfremden manuellen
Browserabläufe allein wegen einer Tabellenänderung.

Nach geprüfter Umsetzung folgt die projektübliche separate Frage zur
PR-Erstellung und zum Merge. Anschließend Migrationen, Funktions- und
Hintergrunddienste sowie öffentlich ausgelieferte App gemeinsam prüfen.
Ein reines Webrelease bestätigt keinen aktualisierten Abrufdienst.

## Quellen

- [Bisheriger eBay-Importentwurf](2026-10-01-ebay-order-import-design.md)
- [Betroffene Tests auswählen](../../testing/affected-test-selection.md)
- [Verbindliche Verwaltungsrichtlinie](../../design/admin-ui-guidelines.md)
- [eBay: getOrder](https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrder)
- [eBay: getOrders](https://developer.ebay.com/api-docs/sell/fulfillment/resources/order/methods/getOrders)
- [eBay: dokumentierte Gebührenfelder](https://developer.ebay.com/api-docs/sell/fulfillment/release-notes-archive.html)

Der konkrete Erstattungsbefund stammt zusätzlich aus der oben beschriebenen
lesenden Anbieterprüfung. API-Filter, Kostenabdeckung und Berechtigungen werden
vor ihrer Implementierung erneut anhand der aktuellen offiziellen Verträge geprüft.
