# eBay-Artikelzuordnung und bewusste Bestellübernahme

Stand: 1. Oktober 2026. Assistent: Juna.
Basis: `origin/master` auf `f1c9e623` mit den integrierten PRs #273 und #274.

## Auftrag und Freigabestand

Flipbase zeigt bereits die eigenen eBay-Inserate und Bestellungen eines persönlich
verbundenen Kontos an. Der Nutzer möchte als nächstes Inserate Flipbase-Artikeln
zuordnen und Bestellungen bewusst als Verkäufe übernehmen.

Der Nutzer hat eine Prüfmaske **pro Bestellung** mit „Verkauf buchen“ gewählt und
den folgenden Entwurf ausdrücklich zum schriftlichen Festhalten freigegeben:
gespeicherte Artikelzuordnungen, bestätigte Kosten, gemeinsame Verkaufs- und
Bestandsbuchung, Schutz vor Doppelübernahme und eine Markierung für bereits
manuell gebuchte Bestellungen. Diese Zustimmung erlaubt das Schreiben dieser
Spezifikation. Die Freigabe der schriftlichen Spezifikation und anschließend des
Umsetzungsplans stehen noch aus. Produktcode und Migrationen sind noch nicht
umgesetzt.

Der zusätzliche echte Kontotest mit zwei normalen Flipbase-Nutzern bleibt als
separater Nachweis offen. Der Nutzer hat die Weiterarbeit an diesem Paket gewählt.
Die vorhandenen Datenbanktests zu persönlichen Kontorechten ersetzen diesen
echten Nachweis nicht.

## Gewählter Ansatz

Die bestehende Verkaufserfassung erhält einen schmalen Übergabevertrag für extern
vorbereitete Verkäufe. Das eBay-Feature bereitet Bestellung, Zuordnung und
Importstatus vor; die Verkaufserfassung stellt die vorhandene Artikelauswahl,
Kostenfelder und Prüfmaske bereit. Der bestehende Datenbankablauf `record_sale`
bleibt für Bestand, Einkaufskosten, Nummerierung und Geschäftsereignisse zuständig.
Eine eBay-spezifische Buchungsfunktion prüft die vertrauenswürdige Bestellquelle und
speichert den Übernahmenachweis in derselben Transaktion.

Eine vollständig eigene eBay-Verkaufserfassung würde gemeinsame Regeln und
Oberflächenelemente doppelt führen. Eine bloße Vorbefüllung der bisherigen Maske
würde keine verbindliche Quellenprüfung und keinen ausreichenden Schutz gegen
parallele oder wiederholte Übernahme bieten. Beide Alternativen werden verworfen.

## Umfang

- Manuelle, gespeicherte Zuordnung eines eBay-Inserats beziehungsweise einer
  konkreten Inseratvariante zu einem Flipbase-Einzelstück oder einer konkreten
  Katalogvariante.
- Zuordnung fehlender Artikel direkt in einer Bestellprüfmaske, auch wenn das
  ursprüngliche Inserat nicht mehr unter den aktiven Inseraten erscheint.
- Übernahme einer vollständigen, bezahlten EUR-Bestellung ohne Storno oder
  Erstattung nach persönlicher Prüfung.
- Bestätigte eBay-Gebühren und tatsächlich anfallende Versandkosten; zusätzliche
  Kosten über die bestehenden Verkaufsfelder.
- Dauerhafter, kontenbezogener Schutz vor doppelter Übernahme innerhalb desselben
  Workspaces und eine bewusst bestätigte Erledigt-Markierung ohne Neubuchung.

Nicht enthalten sind Sammelbuchungen, automatische Bestandsänderungen beim Abruf,
automatische Gebührenabrechnung, Fremdwährungsumrechnung, eBay-Inseratveröffentlichung,
Versandmeldungen an eBay, automatische Retouren oder ein neuer Hintergrundabruf.
Die drei vorhandenen OAuth-Rechte reichen für die vorgesehenen lesenden Anfragen.

## Nutzerablauf

### Inserat zuordnen

Die Inseratansicht zeigt „Artikel zuordnen“ und anschließend den zugeordneten
Artikel mit konkreten Variantenmerkmalen. Die vorhandene datenlose
`ArticlePickerComponent` erhält ihre Einträge vom Feature-Service. Sie lädt selbst
keine Daten. Artikelgruppen sind keine buchbaren Ziele; konkrete Varianten und
Einzelstücke sind erforderlich.

Die Zuordnung gilt für Workspace, eBay-Umgebung, dauerhaftes eBay-Konto und
Inseratkennung, bei Varianten zusätzlich für die Variantenkennung. Ein bloßer
Namensvergleich löst keine Zuordnung aus. SKU und Titel dürfen als Suchhilfe
angezeigt werden, ersetzen aber keine Nutzerbestätigung. Eine fehlende oder
mehrdeutige Variantenkennung verhindert die Wiederverwendung einer allgemeinen
Inseratzuordnung für eine konkrete Variante.

Zuordnungen können geändert und entfernt werden. Änderungen beeinflussen bereits
gebuchte Verkäufe nicht. Ein ausverkauftes oder archiviertes Ziel bleibt als
gespeicherte Zuordnung erkennbar, ist aber für eine neue Buchung nicht verfügbar.

### Bestellung prüfen

„Als Verkauf übernehmen“ öffnet eine eigene Route im Verkaufsfeature. Vor der
Anzeige liest der Server genau diese Bestellung erneut von eBay und legt einen
kurzlebigen, normalisierten Prüfsnapshot an. Die Maske zeigt:

- eBay-Konto, Bestellnummer, Verkaufsdatum und Abrufzeit;
- alle Bestellpositionen mit eBay-Titel, Menge und rabattiertem Warenbetrag;
- vorgeschlagene beziehungsweise fehlende konkrete Flipbase-Artikel;
- Warenumsatz und vom Käufer bezahlten Versand getrennt;
- eBay-Gebühr, tatsächliche Versandkosten und vorhandene zusätzliche Kosten;
- verständliche Gründe, falls eine Übernahme nicht möglich ist.

Die übernommenen Mengen, Quellbeträge, Bestellnummer und Plattform sind geschützt.
Der Nutzer bestätigt die Beträge und wählt die Artikel. Er erfasst die tatsächlichen
Kosten, ohne Warenumsatz oder Versandumsatz als Kosten zu behandeln. Unbekannte
eBay-Gebühren und Versandkosten beginnen leer. „0,00 €“ ist erst nach ausdrücklicher
Eingabe beziehungsweise Bestätigung ein bekannter Wert. Solange Pflichtkosten
ungeklärt sind, bleibt „Verkauf buchen“ gesperrt; es entsteht kein Verkauf mit
scheinbar vollständigem Gewinn. Dieses Paket benötigt deshalb keinen neuen
vorläufigen Gewinnzustand in der allgemeinen Finanzberechnung.

Die Maske nutzt die vorhandene Verkaufserfassung und deren gemeinsame Bausteine,
das Seitenlayout mit Positionen links und Details/Kosten rechts sowie eine
Hauptaktion oben. Zurückkehren führt in die eBay-Bestellansicht desselben Workspaces.
Offene Formulare verwenden den vorhandenen Workspace-Kontextschutz. Beim
Abbrechen wird weder Verkauf noch Bestand verändert; bereits ausdrücklich
gespeicherte Artikelzuordnungen bleiben erhalten.

### Verkauf buchen

Der Klick veranlasst einen erneuten lesenden Abruf der Bestellung. Haben sich
buchungsrelevante Daten geändert, erhält der Nutzer eine aktualisierte Prüfmaske
und muss sie neu bestätigen. Kosten- und Artikelaingaben bleiben soweit möglich
erhalten; Änderungen werden deutlich angezeigt. Eine bloße Änderung des
Versandstatus ohne Änderung der Buchbarkeit oder Beträge erzwingt keine unnötige
Neueingabe.

Die serverseitige Buchungsfunktion prüft Identität, aktive Mitgliedschaft,
Workspace, Konto, Umgebung, aktuelle Autorisierungsfassung und den bestätigten
Snapshot. Sie prüft alle Positionsmengen und Verkaufsziele gegen denselben
Workspace und verwendet anschließend den vorhandenen `record_sale`-Ablauf.
Verkauf, Verkaufspositionen, Bestandsabgänge und Quellenbeleg werden gemeinsam
gespeichert oder gemeinsam verworfen.

Nach Erfolg zeigt die Bestellung „Übernommen“ mit Link zum bestehenden Verkauf.
Ein wiederholter identischer Versuch liefert denselben Verkauf zurück. Ein
Verbindungsabbruch mit unbekanntem Ergebnis wird durch Abfragen des gespeicherten
Status geklärt, bevor eine weitere Buchung angeboten wird. Geänderte Eingaben
erzeugen bei einer bereits übernommenen Bestellung keinen zweiten Verkauf.
Verkauf und Bestand werden über die vorhandenen Services aktualisiert.

### Bereits manuell gebucht

Die Aktion „Bereits manuell gebucht“ verlangt eine ausdrückliche Bestätigung und
einen kurzen Grund; optional kann der Nutzer einen vorhandenen Verkauf desselben
Workspaces auswählen. Sie speichert einen Quellenbeleg mit Bearbeiter und Zeit,
erzeugt aber keinen Verkauf und keinen Bestandsabgang. Die Bestellung erscheint
anschließend als erledigt.

Ein vorhandener eBay-Verkauf mit derselben externen Bestellnummer wird vor einer
Neubuchung erkannt. Er löst keine automatische Zuordnung zu einem fremden Konto
aus. Unklare Altbelege sperren die Übernahme und verlangen eine bewusste
Erledigt-Markierung nach Prüfung. Eine versehentliche manuelle Markierung kann
nach erneuter Bestätigung aufgehoben werden, sofern kein Importverkauf verknüpft
ist. Ein echter Übernahmenachweis bleibt auch nach Storno oder Retoure des
Flipbase-Verkaufs erhalten; diese Vorgänge erlauben keinen erneuten Import.

## Daten und Verantwortlichkeiten

### eBay-Quellvertrag

Die bestehenden serverseitigen und frontendseitigen Verträge werden gezielt
erweitert. Bestellungen enthalten stabile `orderId` und `lineItemId`,
`legacyItemId`, gegebenenfalls `legacyVariationId`, SKU, Menge, Währung,
Warenbetrag vor/nach Rabatt, Versandbeträge, relevanten Zahlungs-, Storno- und
Erstattungsstatus sowie Änderungs-/Abrufzeit. Fehlende Quellwerte bleiben fehlend.
Artikelzuordnung verwendet Inserat-/Variantenkennungen; Doppelübernahmeschutz
verwendet die Bestellung und ihre Positionskennungen.

Der Einzelbestellabruf und der vorhandene Listenabruf verwenden denselben
normalisierenden Parser. Keine Käuferanschriften, Nachrichten, Tokens oder
vollständigen rohen eBay-Antworten werden für diesen Ablauf gespeichert.

### Persistenz

Ein eigener deklarativer Themenbereich, vorgesehen als
`supabase/schemas/330_ebay_order_import.sql`, definiert:

1. `ebay_article_mappings`: bestätigte Inserat-/Variantenzuordnungen mit Workspace,
   Konto-/Umgebungsbezug, Ziel und Änderungsnachweis.
2. `ebay_order_snapshots`: serverseitig erzeugte, normalisierte Prüfstände mit
   ursprünglicher Verbindung, Autorisierungsfassung, Quellfingerabdruck und
   Ablaufzeit. Sie gelten höchstens fünf Minuten und werden bei Änderungen ersetzt.
3. `ebay_order_bookings`: minimale dauerhafte Quellenbelege für `imported` oder
   `recorded_elsewhere`, mit Workspace, Umgebung, stabilem serverseitigem
   Quellenfingerabdruck, Verkaufsverweis, Bearbeiter und Zeit.

Der eindeutige Übernahmeschlüssel umfasst Workspace, Umgebung, dauerhaftes
eBay-Konto und Bestellnummer. Er wird serverseitig als zweckgebundener
Fingerabdruck erzeugt; der Browser darf ihn weder erzeugen noch überschreiben.
Eine neue Verbindung desselben Kontos hebt den Schutz nicht auf. Derselbe
eBay-Account bei zwei Flipbase-Nutzern im selben Workspace darf dieselbe
Bestellung insgesamt nur einmal übernehmen. Andere Konten, Umgebungen und
Workspaces haben getrennte Schlüssel.

Der Quellenfingerabdruck ist HMAC-SHA-256 über eine eindeutig kodierte Kombination
dieser Kennungen. Sein Schlüssel wird mit Web Crypto und HKDF unter einem eigenen
Zwecknamen aus dem vorhandenen serverseitigen Token-Verschlüsselungsschlüssel
abgeleitet. Er wird nie an den Browser gesendet. Der bestehende Schlüssel bleibt
unverändert; ein späterer Schlüsselwechsel muss auch die Quellenbelege planen.

Die unveränderliche Verbindung zwischen eBay-Positionskennungen und erzeugten
Verkaufspositionen wird im Quellenbeleg mitgeführt. Damit bleibt der Ursprung
auch bei mehrfach vorhandenen Zielartikeln nachvollziehbar. Der Buchungsbeleg
darf nicht durch Löschen oder Wiederverbinden einer OAuth-Verbindung verschwinden.

Alle Tabellen haben RLS, explizite Rechte und getrennte Policies je zulässiger
Operation. Private Snapshots sind ausschließlich serverseitig beschreibbar.
Frontend-Lesezugriff auf Quellinformationen verlangt eine eigene aktive Verbindung
zu genau diesem Konto und aktive Workspace-Mitgliedschaft. Eine Rolle als
Administrator ersetzt den persönlichen Kontozugriff nicht. Gemeinsame normale
Verkaufsdaten folgen weiterhin den bestehenden Workspace-Rechten.

Private Prüfstände gehören zusätzlich zum anfordernden Nutzer. Der Nutzer darf
keinen Prüfstand eines anderen Mitglieds bestätigen, auch wenn beide dasselbe
eBay-Konto verbunden haben. Ein bereits abgeschlossener Quellenbeleg kann beiden
nach bestätigtem Zugriff auf genau dieses Konto denselben Importstatus liefern.

Schreibrechte auf Zuordnung und Quellenbelege werden über eng begrenzte Funktionen
ausgeübt. Standard ist `security invoker`; eine ausdrücklich erforderliche
`security definer`-Buchungsfunktion wird auf die geprüfte Nutzeridentität,
private Snapshots und den bestehenden Verkaufsaufruf begrenzt. Alle Funktionen
erhalten `set search_path = ''`, vollqualifizierte Namen und ausdrücklich
vergebene Ausführungsrechte. Ein Client darf durch direkte Tabellenoperationen
keinen geprüften Quellenbeleg oder Importstatus vortäuschen.

### Server und Frontend

- Das bestehende eBay-Edge-Feature authentifiziert den Nutzer mit `getUser`, liest
  eBay-Daten mit vorhandenen Tokens und erzeugt vertrauenswürdige Prüfstände.
  Token-/Verbindungssperren und Autorisierungsfassungen bleiben maßgeblich.
- Die Datenbankbuchung sperrt zuerst den eindeutigen Quellenbeleg und prüft danach
  die aktuellen Ziele/Bestände über den vorhandenen Verkaufsablauf. Sie benötigt
  keine Netzwerkaufrufe innerhalb der Transaktion.
- Das Marktplatzfeature besitzt Zuordnungs- und Bestellstatus-Services. Keine
  Datenbankabfragen gelangen direkt in UI-Komponenten.
- Das Verkaufsfeature besitzt den schlanken, typisierten Übergabevertrag und die
  Prüfansicht. Der allgemeine `SalesService` erhält keine eBay-Abruflogik.
- Die bestehende Verkaufserfassung erhält einen austauschbaren Speichervorgang
  für externe Vorlagen. Manuelle Verkäufe verwenden unverändert ihren bisherigen
  Vorgang. Gemeinsame Formelemente werden wiederverwendet.

Die Quellensperre gilt auch vor dem ersten Quellenbeleg: Die Buchungsfunktion
verwendet eine Transaktionssperre für den serverseitigen Quellenschlüssel,
prüft danach erneut den vorhandenen Beleg und führt erst dann `record_sale` aus.
Die eindeutige Datenbankbeschränkung bleibt zusätzlich aktiv. Dadurch können zwei
gleichzeitige erste Übernahmen nicht beide mangels vorhandener Zeile starten.
Alle Buchungs- und Erledigt-Aktionen verwenden dieselbe Sperrreihenfolge.

## Beträge, Datum und Buchbarkeit

Geldwerte werden beim Einlesen als Währung plus exakter Dezimalbetrag geprüft und
für Abgleiche in ganzen Cent verarbeitet. Binäre Rundungsfehler dürfen keinen
Abgleich passieren lassen. Nicht endliche, negative, fehlende oder unerwartet
genaue Beträge werden abgewiesen.

Der Warenbetrag einer Position ist `discountedLineItemCost`, wenn dieser geliefert
wird, sonst `lineItemCost`. `total` einer Position ist kein Stückpreis, weil darin
auch Versand und andere Beträge enthalten sein können. Die rabattierten
Positionswarenbeträge und der rabattierte Versandumsatz müssen zusammen den
normalisierten Bestellumsatz ergeben. Nicht eindeutig abbildbare Steuern,
zusätzliche Entgelte oder Anpassungen blockieren diese erste Übernahmestufe;
sie werden weder stillschweigend eingerechnet noch verworfen.

Ist ein rabattierter Positionsbetrag nicht gleichmäßig in Cent auf die Menge
teilbar, darf derselbe konkrete Artikel in höchstens zwei Verkaufszeilen mit
benachbarten Cent-Stückpreisen stehen. Gesamtmenge und Gesamtbetrag bleiben exakt
gleich; beide Zeilen tragen dieselbe Quellpositionskennung. Das Verfahren wird
zentral und deterministisch implementiert und geprüft.

Gebühren werden nicht automatisch aus einer eBay-Abrechnung übernommen. Die
Prüfmaske verlangt bekannte beziehungsweise vom Nutzer bestätigte Werte und
übernimmt sie in die vorhandenen Kostenfelder. Versandumsatz und tatsächliche
Versandkosten bleiben getrennt. Die vorhandenen Steuer- und Einkaufskostenregeln
des ausgewählten Bestands bleiben maßgeblich; aus eBay-Daten wird kein
Steuermodell erraten.

Das Verkaufsdatum wird aus der eBay-Erstellungszeit in `Europe/Berlin` abgeleitet
und in der Prüfmaske angezeigt. Diese explizite Regel gilt für den neuen Import;
die vorhandene manuelle Datumserfassung wird nicht umgestellt. Ein fehlender
oder ungültiger Zeitpunkt blockiert die Übernahme. Das Datum wird nicht durch
das heutige Abrufdatum ersetzt.

Nur vollständige bezahlte EUR-Bestellungen ohne laufenden/abgeschlossenen Storno
und ohne vollständige oder teilweise Erstattung sind buchbar. Unbekannte Status
sind gesperrt. Alle Positionen müssen eindeutig zugeordnet und gemeinsam
buchbar sein. Einzelstücke benötigen Menge eins; Mengenartikel genügend
verfügbaren Bestand. Archivierte, fremde oder nicht eindeutige Ziele werden
abgewiesen. Bei veraltetem Bestand bleibt die Prüfmaske mit ihren Eingaben offen.

## Fehler, Sperren und Lebenszyklus

- Abruf- oder eBay-Fehler erzeugen keine Verkaufsbuchung. Kosten und Zuordnung
  bleiben in der offenen Maske soweit möglich erhalten; erneuter Abruf ist bewusst.
- Workspacewechsel, Abmeldung, Trennen oder neue Autorisierungsfassung machen
  offene Prüfstände unbrauchbar. Verspätete Antworten dürfen keine Daten in einen
  anderen Workspace oder ein anderes Konto einsetzen.
- Die Buchung hält die relevante Mitgliedschaft und Verbindung bis zum Commit
  gesperrt. Ein parallel entzogener Zugriff oder ein paralleles Trennen darf die
  Prüfung nicht zwischen Berechtigungsprüfung und Bestandsbuchung unterlaufen.
- Parallelversuche sind durch den eindeutigen Quellenbeleg und Transaktionssperren
  geschützt. Ein Konflikt wird als vorhandener Status zurückgegeben.
- Fehler nach einem erfolgreichen Commit werden als Aktualisierungsproblem
  behandelt. Die Anwendung bietet keine zweite Neubuchung an.
- Abgelaufene Prüfstände werden begrenzt serverseitig bereinigt. Sie besitzen
  keinen Anspruch auf dauerhafte Speicherung und sind keine Verkaufsentwürfe.
- Die bestehende Kontolöschungsverarbeitung wird um das Entfernen der neuen
  Artikelzuordnungen und temporären Quellstände für das betroffene Konto erweitert.
  Bereits gebuchte Flipbase-Verkäufe werden dadurch nicht rückgebucht. Minimale
  Geschäfts- und Quellenbelege unterliegen dem bestehenden Aufbewahrungsablauf;
  sie enthalten keine OAuth-Verbindung, Käuferdaten oder rohe eBay-Antwort.
- Eine Quellenprüfung ist eine Momentaufnahme. Änderungen bei eBay nach der
  Buchung werden in diesem Paket nicht automatisch als Retoure übernommen.

## Oberfläche und Barrierefreiheit

Angular-Komponenten bleiben OnPush mit Signals, externen HTML-Vorlagen und der
nativen Control-Flow-Syntax. Styling erfolgt mit Tailwind direkt im HTML und nach
`docs/design/admin-ui-guidelines.md`. Der Markenakzent bleibt `#fcc601`.

Die bestehenden gemeinsamen Buttons, Formfelder, Artikelauswahl, Karten und
Dialograhmen werden genutzt. Sichtbare Zustände sind „Nicht zugeordnet“,
„Bereit zur Prüfung“, „Übernommen“, „Bereits manuell gebucht“ und konkrete
Sperrgründe; Farben sind nicht die einzige Unterscheidung. Tastaturfokus,
Fehlermeldungszuordnung, Ladezustände, beschriftete Aktionen und mobile Darstellung
gehören zum Vertrag. AXE muss bestehen und WCAG AA eingehalten werden.

## Nachweise vor Veröffentlichung

1. Parser-/Geldtests: stabile Kennungen, Varianten, fehlende Werte, Mengen,
   Rabatte, Cent-Aufteilung, Währungen, Versand, Steuern/Anpassungen und Status.
2. Edge-Tests: authentifizierte Einzelbestellung, fremdes Konto/Workspace,
   manipulierte Quellwerte, geänderter oder abgelaufener Prüfstand, Refresh,
   neue Autorisierungsfassung und begrenzte Anbieterfehler.
3. Datenbanktests: RLS und Funktionen mit normalen Mitgliedern, direkter
   Clientzugriff, fremde/archivierte Ziele, gleiche Quelle bei zwei Nutzern,
   Wiederverbindung, Sandbox/Production, atomarer Rollback und Beleglebenszyklus.
4. Echte Paralleltests gegen isolierte Testdatenbank: zwei Übernahmen derselben
   Bestellung und zwei Verkäufe bei gemeinsam knappem Bestand. Es entsteht
   höchstens ein Quellenverkauf beziehungsweise kein negativer Bestand.
5. Angular-Tests: gespeicherte Zuordnung, konkrete Varianten, Kostenbestätigung,
   gesperrte Zustände, Mehrfachklick, unbekanntes Ergebnis, Wiederholung und
   Workspacewechsel. Bestehende manuelle Verkäufe bleiben geprüft.
6. Browserfall mit künstlichen Bestellungen und Testbestand: Zuordnung, Prüfung,
   Buchung, erneuter Aufruf, Erledigt-Markierung, Tastatur, mobile/breite Ansicht
   und AXE. Keine produktive eBay-Bestellung wird dafür gebucht.
7. Generierte Migration und Datenbanktypen, Schemaabgleich, Format/Lint,
   Anwendungstypen und Angular-Produktionsbau. Die vollständigen Pflichtprüfungen
   laufen im PR vor dem Merge; kein lokaler Docker-Bau.

Schema und automatisch erzeugte Migration gehören in denselben PR. Die Migration
wird vollständig geprüft und bleibt transaktional ohne externe Seiteneffekte.
Produktive historische Bestellungen werden nicht als Testbestand benutzt. Eine
echte produktive Buchung benötigt später eine konkret ausgewählte Bestellung und
die bewusste Nutzerbestätigung in der Prüfmaske.

## Fertig, wenn

Ein normaler Nutzer kann seine eBay-Inserate konkreten Artikeln zuordnen, eine
geeignete Bestellung mit vollständigen und bestätigten Kosten prüfen und genau
einen Verkauf mit korrektem Bestandsabgang buchen. Fehlende Berechtigungen,
unpassende Bestellungen, geänderte Quellstände, fehlender Bestand und doppelte
Versuche bleiben ohne zusätzliche Buchung. Bereits manuell gebuchte Bestellungen
lassen sich ohne Bestandsänderung erledigen. Manuelle Flipbase-Verkäufe behalten
ihren bisherigen Ablauf.

## Quellen und bestehende Verträge

- [eBay Fulfillment OpenAPI, v1.20.7](https://developer.ebay.com/api-docs/master/sell/fulfillment/openapi/3/sell_fulfillment_v1_oas3.json),
  am 1. Oktober 2026 abgerufen; insbesondere `Order`, `LineItem` und `PricingSummary`.
- [Supabase: Datenbankfunktionen](https://supabase.com/docs/guides/database/functions).
- `docs/implementation/ebay-api-integration-analysis.md`.
- `docs/sales-entry-refactor-2026-09-29.md`.
- `docs/implementation/sales-variant-picker-table.md`.
- `supabase/schemas/320_ebay_accounts.sql` und der bestehende `record_sale`-Vertrag.
