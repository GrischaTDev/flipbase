# Vintz: Bestellungen und Versand im Vergleich mit Flipbase

Untersuchung von Juna am 18.10.2026. Freigegeben war ausschließlich die Analyse
von Bestellungen und Versand mit anschließendem Stopp. Keine Umsetzung,
Aktivierung, Etikettenanforderung, Buchung oder Änderung einer Bestellung.

## Ergebnis und Beleggrenzen

Vintz verbindet verkaufte Artikel, Versandetiketten, Packarbeit und den
Buchhaltungsimport enger als Flipbase. Besonders interessant sind die
Etikettenzustände und der geführte Packablauf. Dessen erfolgreiche praktische
Ausführung ist in dieser Untersuchung jedoch nicht nachgewiesen.

Flipbase besitzt bereits eine interne Versandzentrale, Lager-/Verkaufsbuchungen
und Retouren. Die Vinted-Verkaufskopie ist damit noch nicht durchgängig verbunden.
Ein sichtbares Druckfenster ist außerdem keine echte Versandmarke: Die heutige
Flipbase-Vorschau enthält einen simulierten Barcode.

| Belegart                          | Umfang und Grenze                                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vintz live                        | Ein Cloudkonto, zwei abgeschlossene Verkäufe, kein offener Versandfall. Verkaufsansicht, Bestellkennzahlen, Aktionsmenü und Postfachfilter gelesen.                                                            |
| Vintz ausgelieferter Frontendcode | Bestellabruf, Labelanforderung/-datei, Packmodus, Sammel-PDF, Statusableitung, Import und Rechnungszugang untersucht. Das belegt vorgesehene Abläufe, keine erfolgreiche Serverausführung.                     |
| Flipbase                          | Quellen bei `e3ef736370640125c1abddcaf82de6079205d9fa`, einschließlich Vinted-Import, Versandzentrale, Verkäufen, Einkäufen und Retouren. Keine neue produktive Browserprüfung von Flipbase in diesem Schritt. |
| Nicht ausgeführt                  | Etikett anfordern/holen, öffnen, herunterladen oder drucken; Packfortschritt speichern; Buchhaltung importieren; Rechnung erzeugen; Nachrichten, Versandstatus, Storno oder Erstattung auslösen.               |

Die Bestellansicht kann beim Öffnen einen normalen Hintergrundabgleich anstoßen.
Es wurde kein fachlicher Schreibauftrag über die untersuchten Schaltflächen
ausgelöst. Das ist keine Behauptung, dass Seitenaufrufe keinerlei Hintergrund-
oder Protokolländerung verursachen. Maike Vintage in Flipbase nicht fortgesetzt.

## Sichtbare Vintz-Bestellansicht

Einstieg: [Angebote](https://vintz.ai/listings) → **Verkauft** →
**Bestellungen & Versand**. Beschreibung: „Versandscheine, Buchhaltung und
Gebührenrechnungen für deine verkauften Artikel.“

| Beobachtung            | Tatsächlicher Zustand                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Kennzahlen             | Verkaufte Bestellungen **2**, offene Bestellungen **0**, Umsatz **48,50 €**       |
| Verkauf 1              | Polo Ralph Lauren Jacke, **32,50 €**, 24.09.2026, Transaktion erfolgreich beendet |
| Verkauf 2              | Nike Pullover, **16,00 €**, 21.09.2026, Transaktion erfolgreich beendet           |
| Bestellzeile           | Artikel, Preis, Datum, Anbieterstatus, Käuferland DE und bezahlter Betrag         |
| Aktionen je Zeile      | Importieren, Rechnung, Drei-Punkte-Menü sowie Etikettenstatus und Holen           |
| Sammelzugang           | Alle importieren; Bestellungen aktualisieren vorhanden, nicht betätigt            |
| Etiketten              | Beide Nicht verfügbar; trotzdem jeweils Holen angeboten                           |
| Geöffnetes Aktionsmenü | Nur List again; geschlossen, nicht ausgeführt                                     |
| Darunter               | Zwei verkaufte Angebotszeilen; Preis-/Bearbeitungsaktionen deaktiviert            |

Keine Käuferadresse, Versandfrist, ausführliche Sendungsverfolgung oder eigene
Bestelldetailansicht in diesen beiden Bestellzeilen gesehen. Packmodus und
Sammel-Labelaktion erscheinen im Code nur bei passenden Versandaufträgen und
waren hier nicht sichtbar. Daraus folgt weder, dass sie fehlen, noch dass sie
funktionieren.

Bildbeleg:
[Verkaufs- und Versandansicht](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-orders-shipping-2026-10-18.png).

## Bestellquelle, Status und Zuordnung

Der geladene Vintz-Code trennt Browser-/Erweiterungskonto und isolierte
Cloudkonten. Cloudbestellungen werden über
`GET /api/seller/account-orders?offset=…` nachgeladen, bis zum Ende oder zur
Frontendgrenze von **2.000 Bestellzeilen**; für abgeschnittene Ergebnisse ist
ein Hinweis vorgesehen. Im Browserpfad wird `getSoldOrders` mit Seite 1 und
100 Einträgen aufgerufen. Diese Grenzen nicht als Vollständigkeit beliebig
großer Konten ausgeben. Zusammenführung berücksichtigt Konto und Transaktion.

Vintz unterscheidet im Modell offen, abgeschlossen, storniert, erstattet und
zurückgegeben. Probleme beziehungsweise laufende Rückgaben können zunächst
offen bleiben. Ein Teil der Erkennung basiert auf Statuswörtern. Das ist kein
Nachweis, dass jeder Vinted-Zustand in jeder Sprache korrekt erkannt wird.

Wichtig für Kennzahlen: `orderCountsAsRevenue` schließt endgültig stornierte,
erstattete und zurückgegebene Vorgänge aus, umfasst aber auch offene Verkäufe.
„Umsatz“ darf deshalb nicht als ausgezahltes Guthaben oder Gewinn verstanden
werden. Der gelesene Summenhelfer rechnet unterschiedliche Währungen nicht um.

Zwei unterschiedliche Versandprüfungen sind vorhanden: Die strengere Prüfung
kann bei unbekanntem Status „unbekannt“ zurückgeben; die für Packwarteschlange
und Cloud-Sammellabel verwendete Prüfung nimmt auch einen unbekannten
Versandmeilenstein auf. Daher keine einheitliche Vorsicht bei unklaren Daten
unterstellen.

Im [Postfach](https://vintz.ai/inbox) zeigte der Filter **Bestellungen 2** zwei
andere Gespräche als die beiden abgeschlossenen Verkäufe; beide hatten die
Kennzeichnung **Angebot angenommen**. Der gelesene Filter prüft `hasOrder`,
das aus den zugeordneten Verkaufs-/Kaufgesprächskennungen stammt. Er prüft
nicht einfach nur ein angenommenes Angebot. Die Ursache der abweichenden
Zuordnung ist ohne die betreffenden Serverdaten offen. Deshalb weder eine
nachgewiesene Fehlbuchung behaupten noch die Postfachzahl als abgeglichene
Liste bezahlter Verkäufe übernehmen.

Weitere Filter für angekommen, abgeholt, abgeschlossene Bestellungen, eigene
Verkäufe und eigene Käufe sind im Postfachcode vorgesehen. Sie ersetzen keinen
Nachweis eines eigenständigen vollständigen Vintz-Einkaufs-/Retourenablaufs.

## Etiketten: Status, Anforderung und Datei

Vintz unterscheidet im Cloudpfad unter anderem nicht angefordert, in Arbeit,
auf Vinted vorhanden, lokal verfügbar und keine aktive Sendung. Ein gespeichertes
Dokument ermöglicht Öffnen, Herunterladen und Drucken. PDF, PNG und JPEG werden
an der Dateisignatur erkannt; Bilddateien können in ein PDF überführt werden.
QR-Dokumente haben einen eigenen Darstellungs-/Druckbezug.

Der entscheidende Unterschied zwischen Lesen und Schreiben:

| Zugang                        | Im geladenen Cloudcode vorgesehene Wirkung                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Status abrufen                | `GET /api/seller/multi-accounts/{connection}/shipping-label` mit Bestell-/Gesprächsbezug                                    |
| Holen / Create now            | `POST` an denselben Labelbereich, mit Transaktionskennung und neuer Anfragekennung; kann eine Etikettenanforderung auslösen |
| Auftrag verfolgen             | Abfrage queued/running, ungefähr alle 2,5 Sekunden, bis zu drei Minuten; danach Labelstatus erneut lesen                    |
| Vorhandene Datei öffnen/laden | `GET …/shipping-label/file?transaction=…`, Download mit Zusatzparameter                                                     |

**Holen ist damit kein sicherer reiner Lesezugang.** Auch die sichtbare Zeile
„Nicht verfügbar“ rechtfertigt keinen Klick im Analyseauftrag. Keine dieser
Aktionen wurde ausgelöst. Eine neue Anfragekennung allein beweist keinen
serverseitigen Schutz vor doppelter Anforderung.

Ein eigener Zustand behandelt den Fall, dass Vinted ein Label besitzt, dieses
aber nicht in Vintz gespeichert werden konnte. Ein erfolgreicher Hintergrundjob
ist also noch kein Beweis für eine abrufbare Datei. Das ist ein sinnvolles
Vorbild für verständliche Teilergebnisse.

**Datenhaltung bleibt gesondert zu klären:** Die Automationsoberfläche beschrieb
zuvor einen Ablauf, bei dem das Label auf Vinted bleibt. Der manuelle Cloudpfad
enthält dagegen ausdrücklich Dateispeicherung und Dateiausgabe über Vintz.
Beide Pfade nicht zu einer allgemeinen Aussage „Vintz speichert keine
Käuferadressen“ zusammenziehen. Kein aktuelles Käuferlabel wurde abgerufen;
tatsächliche Speicherung, Aufbewahrung und Löschung sind nicht geprüft.

## Packmodus und Sammeldruck: im Code belegt

Der Packmodus sammelt versandbedürftige Bestellungen und sortiert die ältesten
zuerst. Er sieht Einzelkarten, Fortschritt, Vor/Zurück, Überspringen und eine
Abschlussübersicht vor. Drei Merkmale sind unabhängig abhackbar:

1. Artikel eingepackt.
2. Etikett gedruckt beziehungsweise QR-Code gedruckt.
3. Etikett am Paket beziehungsweise QR-Code für Abgabe bereit.

Ein interner Abschluss setzt den Packfortschritt. Er ist kein Beleg für
„bei Vinted versendet“. Ebenso bedeutet ein geöffnetes Druckfenster nicht,
dass ein physischer Druck gelungen ist. Diese Trennung ist für Flipbase wichtig.

Der Code sieht Artikelbilder, Artikel-/Bestellangaben, Käuferkennung,
Dienstleister und Trackingcode vor. Ein Empfängername kann lokal aus dem
Label-PDF gelesen und dem Paket zugeordnet werden. Das ersetzt keine geprüfte
vollständige Adressverwaltung.

Fortschritt liegt unter `vintz:packing-mode:v1` lokal und wird zusätzlich über
`GET/PATCH /api/seller/packing-progress` mit dem Server abgeglichen. Der Code
kann bis zu 200 Paketstände behalten. Serverabgleich und tatsächliche
Wiederaufnahme über mehrere Geräte wurden nicht getestet. Ein gespeicherter
Empfängername ist auch bei ansonsten rein lokalen PDF-Auswertungen zu beachten.

Sammelausgaben können Dokumente zu einem PDF kombinieren, optional zuschneiden
und einen Artikelbezug ergänzen. Enthaltene und fehlgeschlagene Dokumente
werden getrennt ausgewiesen. Eine Packliste ist vorgesehen; der untersuchte
Cloudaufruf übergibt dabei **keine SKU**. Cloud-Sammelausgabe und der im
Packmodus gefundene Browser-Sammeldruck sind unterschiedliche Pfade; keine
vollständig einheitliche Umsetzung behaupten.

Ohne offene Sendung wurde keine dieser Masken live durchgespielt, kein
Druckfenster geöffnet und kein Fortschritt geschrieben.

## Import, Rechnung, Storno und Rückgabe

„Importieren“ schreibt über `POST /api/seller/bookkeeping` unter anderem Titel,
Preis, Währung, Verkaufsdatum, Konto und Transaktionsbezug in die Vintz-
Buchhaltung. Die Antwort kann einen vorhandenen Eintrag melden. Das belegt
vorgesehene Dublettenbehandlung, keinen geprüften Schutz gegen alle Doppelbuchungen.
„Alle importieren“ verarbeitet geladene Bestellungen nacheinander und meldet
Teil-Erfolge/-Fehler.

**Der Knopf Rechnung führt denselben Import zunächst aus und öffnet erst danach
die Rechnungsansicht.** Er ist deshalb kein unverbindlicher Vorschauknopf.
Nicht angeklickt. Rechnungsvorschau, Rechnungsausstellung und Zahlung bleiben
verschiedene Vorgänge; das vollständige Finanzmodul ist ein anderer Analyseblock.

Stornierte/erstattete/zurückgegebene Verkäufe werden im Modell berücksichtigt,
für den Import als cancelled behandelt und von dieser Rechnungserstellung
ausgeschlossen. Im untersuchten Vintz-Bestellbereich ist damit noch keine
Aktion belegt, die eine echte Vinted-Stornierung oder Erstattung ausführt.
Bundle-Anzahl und Gesamtbetrag sind im Bestellmodell vorgesehen; eine
vollständige Aufteilung auf einzelne Lagerartikel oder eine Retourenabwicklung
pro Bundle-Position wurde nicht nachgewiesen.

## Vergleich mit Flipbase

| Aufgabe                          | Vintz, belegter Stand                                                                                                  | Flipbase, belegter Stand                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vinted-Verkäufe ansehen          | Bestellzeilen mit Preis, Datum, Anbieterstatus, Käuferland, Label- und Importzugang; zwei abgeschlossene Verkäufe live | Kontolesekopie als Karten mit Bild, Titel, Preis, Status und Versandstatus. Kein vollständiger Bestelldialog. Lokaler Pilot weist auf fehlenden Verkaufssync hin.                                    |
| Alle Verkaufszustände übernehmen | Breiteres Statusmodell, Cloudbestellabruf; tatsächliche Vollständigkeit offen                                          | Worker übernimmt im untersuchten Pfad nur Transaktionen des Verkäufers mit `order.id` und deutschem Status exakt Versendet. Noch offene Sendungen sind damit nicht vollständig erfasst.              |
| Zentrale Verkauf-/Lagerbuchung   | Separater manueller Buchhaltungsimport, kein geprüfter Lagerabgang                                                     | Vinted-Kopie landet in `marketplace_account_entries`, erzeugt in diesem Pfad keinen zentralen Verkauf und keine Sendung. Interne zentrale Verkäufe buchen dagegen mit `record_sale` Lagerpositionen. |
| Echte Plattformetiketten         | Cloudanforderung/-datei und Browserbrücke im Frontend vorhanden; nicht praktisch angefordert                           | Keine entsprechende Vinted-Labelanbindung gefunden. Markenkauf ausdrücklich nicht angebunden.                                                                                                        |
| Sichtbare Etikettenvorschau      | Vorgesehene Anzeige einer abgerufenen Datei; kein echtes Label getestet                                                | Sichtbare selbst erzeugte DHL-/Hermes-Vorschau mit simuliertem Barcode, keine gültig gekaufte Marke und kein Vinted-PDF.                                                                             |
| Packarbeit                       | Geführter Packmodus und drei Paketmerkmale im Code                                                                     | Interne Versandzentrale mit Suche, Statusfiltern, Empfängerangaben und Einzelaktionen; kein entsprechender geführter Packlauf gefunden.                                                              |
| Mehrere Labels / Packliste       | Sammel-PDF, Zuschnitt, Artikelbezug und Teilergebnisse im Code                                                         | In untersuchter Versandkomponente keine Mehrfachauswahl/Sammellabelausgabe. Einzellabel und Lieferschein vorhanden.                                                                                  |
| Sendungsverfolgung               | Status-/Meilensteinmodell; Packkarte kann Dienstleister/Tracking zeigen; keine echte aktuelle Sendung geprüft          | Nummer und Link manuell erfassbar. Internes Versendet/Zugestellt ist eine Datenbankänderung und kein Vinted-Aufruf. Einkaufstracking fragt keine Paketstationen oder Prognosen ab.                   |
| Bundles                          | Anzahl und Gesamtbetrag im Bestellmodell                                                                               | Interne Bündelung gleicher Empfänger per Datenbankfunktion; kein natives Vinted-Bundle, keine Zusammenführung von Plattformmarken. Beispieltarife für Ersparnisse.                                   |
| Retouren                         | Statusauswertung, aber keine ausgeführte native Erstattung/Stornierung belegt                                          | Interne atomare Retourenbuchung mit Erstattungsbetrag und optionaler Wiedereinlagerung/Gutschrift; keine Vinted-Erstattung.                                                                          |

Keinen regulären Erzeugungspfad von Vinted-Verkäufen zu neuen `shipping_orders`
gefunden. Eine `sale_id` im Versandmodell allein beweist diesen Ablauf nicht.
Die vorhandene eBay-Bestellprüfung/-Buchung darf ebenfalls nicht als bereits
vorhandene Vinted-Funktion gezählt werden.

## Vorschläge für die gemeinsame Besprechung

1. **Zuerst eine gemeinsame verlässliche Bestellung:** Vinted-Konto,
   Transaktion, Artikel/Lagerbezug und Status verbinden. Angenommener Preis,
   bezahlter Kauf, gepackt, versendet und abgeschlossen müssen unterscheidbar
   bleiben. Damit werden Versand, Nachrichten und Buchhaltung belastbar.
2. **Echte Etiketten vor optischer Vorschau:** Originaldatei/QR der Plattform,
   überprüfter Dokumentstatus, Wiederholen ohne Doppelanforderung und klare
   Fehlermeldungen. Die simulierte Flipbase-Marke nicht als Versandfunktion
   weiterbewerten.
3. **Packablauf von Vintz als Vorbild:** Bild, Lagerplatz/SKU, packen, drucken,
   aufkleben; fortsetzbarer Fortschritt und eindeutige Fehlmengen. Internes
   Packen vom bestätigten Anbieter-Versand trennen.
4. **Sammeldruck mit Zuordnung:** Echte PDFs, Artikel-/SKU-Bezug, Packliste und
   genaue Rückmeldung über fehlende Dokumente. Keine stillschweigend vollständige
   Erfolgsmeldung bei einem Teilfehler.
5. **Flipbase-Stärken anbinden:** Vorhandene Lager-/Verkaufsbuchung und interne
   Retouren erhalten; Import vorab prüfen, Konto-/Transaktionsbezug gegen
   Dubletten sichern. Vorschau und dauerhafte Buchung klar beschriften.

Versandfristen, Abholstationen, Zustellereignisse, Bundles, Storno, Teilretouren,
mehrere Konten und größere Mengen sind noch keine bestandenen Praxistests.
Offene Sendungen nur in einem gesondert freigegebenen Schritt prüfen.

## Quellen und Nachprüfbarkeit

Vintz: angemeldete [Angebotsansicht](https://vintz.ai/listings) und
[Postfach](https://vintz.ai/inbox), dazu bereits vom Browser geladene
Erstanbietermodule. Keine fremden Quelltexte im Projekt gespeichert.

| Modul              | Untersuchte Funktion                                          | SHA-256 des gelesenen Quelltextes                                  |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `0lkkxxow0cxi7.js` | Bestellungen, Label, Sammeldateien, Import-/Rechnungseinstieg | `666c0e5fc362344d992eaea71b9db13b15455d964d87e28a6d5790aaa4dfc024` |
| `1j22i9b9w6di7.js` | Packmodus und Fortschritt                                     | `61a4962026bcc8e93857fd12476049851e5dcd6664c05675e0cea40f396b3f5e` |
| `0fq95l_un25qf.js` | Postfach-Bestellfilter                                        | `f2b6f851d431ab7f3bad19a601a4e6901a14817b4117f5166677abb405ca2164` |
| `0vjwd7fvap9iu.js` | Gesprächszuordnung, strengere Versandprüfung                  | `1588b92fc130b6aa075a5c01a4b305a69126298956dae4500a606b8d042ba00b` |
| `2cjn1m-e122cd.js` | Breitere Versandprüfung für Packwarteschlange                 | `3422fb853a5957f49307d9bf83a69046a62348977b6fdc9df6404d590edccb46` |

Flipbase-Quellen, Zeilenstand bei obigem Commit:

- [Vinted-Verkaufskarten](../../src/app/features/marketplaces/components/vinted-account-content/vinted-account-content.component.html), ab Zeile 15;
  [Worker-Auswahl und Felder](../../services/marketplace-worker/src/vinted-account-import.ts), ab Zeile 675.
- [Speicherung der Kontokopie](../../supabase/schemas/360_beta_business_access.sql), ab Zeile 6319;
  [Vinted-Routen](../../src/app/features/marketplaces/marketplaces.routes.ts), ab Zeile 142.
- [Versandservice](../../src/app/core/services/fulfillment.service.ts): Bündelvorschläge 165,
  Laden 223, Versandstatus 444, Bündeln 591, fehlende Labelanbindung 732, Zustellung 832.
- [Versandoberfläche und simuliertes Label](../../src/app/features/fulfillment/fulfillment.component.html),
  Aktionen ab 333, Druckknopf 372, Vorschau 447;
  [Versandmodell](../../src/app/core/models/fulfillment.models.ts), ab 47.
- [Zentrale Verkaufsbuchung](../../src/app/core/services/sales.service.ts), ab 298;
  [Vinted-Versandvorgabe](../../src/app/features/sales/components/sale-create-modal/sale-create-modal.component.ts), ab 1241.
- [Retouren](../../src/app/core/services/return.service.ts), ab 161;
  [Grenzen des Einkaufstrackings](../../src/app/core/services/inbound-tracking.service.ts), ab 232;
  [separater eBay-Prüfablauf](../../src/app/features/sales/services/ebay-sale-review.store.ts), ab 80.

Nur Dokumentation geändert. Markdown, lokale Berichtslinks und
Unterschiedskontrolle geprüft; keine Anwendungstests für diese Analyse notwendig.
Danach Stopp zur Besprechung.
