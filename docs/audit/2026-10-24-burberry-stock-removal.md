# Ungeklärter Bestandsabgang beim Burberry-Schal

Untersuchung am 24.10.2026, ausschließlich lesend in Produktion. Die folgenden
Befunde beschreiben den Stand vor dem anschließenden ausdrücklichen Korrekturauftrag.
Geprüfter Quellstand: `382fc5d32797a15c353338b850c9e83d2f443ed6`.

## Ergebnis

Der fehlende vierte Burberry-Schal wurde am **23.10.2026 um 13:02:46 Uhr
(Europe/Berlin)** über `public.remove_article_stock` als `loss` ausgebucht.
Ein tatsächlich erfolgreicher Browseraufruf und der zugehörige unveränderliche
Geschäftsbeleg sind vorhanden. Es handelt sich nicht um eine bloß falsche
Bestandsanzeige oder eine Reservierung durch den neuen eBay-Entwurf.

Der Nutzer erklärt ausdrücklich, diese Verlustausbuchung nicht vorgenommen zu
haben. **Die verfügbaren Nachweise erklären nicht, wer den Browser bedient hat
oder warum der Aufruf ausgelöst wurde.** Die Zuordnung zum angemeldeten Benutzer
beweist keine bewusste Eingabe durch diesen Menschen. Ein unbeabsichtigter Klick,
ein Bedienfehler der Oberfläche oder ein Assistentenaufruf werden deshalb nicht
als nachgewiesene Ursache behauptet.

## Nachweise

### Datenbank

- Workspace: Wiehen Store; Artikel: Burberry Schal Rot, Weinrot, wie neu.
- Vier Stück empfangen, drei Stück durch die vorhandenen Vinted-Verkäufe
  abgegangen, ein weiteres Stück als Verlust entfernt; verbleibende Menge null.
- Bestandsabgang `stock_removals.id = 1`, Menge eins, Grund `loss`, keine Notiz.
- Anforderungskennung: `eab5e509-f7a5-4010-a342-168ac8913bc6`.
- Geschäftsereignis `stock_removal_recorded` zur selben Zeit und Ausbuchung.
  Die genaue Loszuordnung enthält Stückkosten und steuerliche Einkaufskosten
  von jeweils 13 Euro. Es wurde keine Verkaufsposition angelegt.
- Der gespeicherte Akteur entspricht dem Besitzer der persönlichen
  eBay-Verbindung. Der Beleg speichert keine Browser-Tab- oder
  Assistenten-Sitzungskennung.
- Die alte Tabelle `activity_logs` enthält im geprüften engen Zeitfenster keinen
  Eintrag; der maßgebliche Nachweis liegt in `business_events`.

### Öffentlicher API-Zugang

Das erhaltene Zugriffsprotokoll von `supabase-envoy` enthält am
`2026-10-23T11:02:46Z` genau einen erfolgreichen
`POST /rest/v1/rpc/remove_article_stock` mit Status 200, unmittelbar nach einem
OPTIONS-Aufruf. Als Referenzseite ist `https://app.flipbase.de/` gespeichert,
als Browserkennung Chrome 155 unter Windows. Anschließend werden Bestand,
Bestandsbewegungen und Artikel neu geladen.

Das ist ein Nachweis des Browserzugriffs auf die Ausbuchungsfunktion. Er enthält
weder den einzelnen auslösenden Klick noch eine Bildschirmaufnahme. Die interne
Proxyadresse identifiziert keine Person und wird nicht als Herkunftsnachweis
verwendet. Ein gleichzeitig protokollierter eBay-Beobachteraufruf ist ein
getrennter Hintergrundabruf.

### Aufrufweg im Code und verfügbare Prüfverläufe

`ArticleLifecycleService.removeStock` ruft die Funktion aus dem Dialog
`ArticleStockRemovalComponent` auf. Verkaufsbuchung, Archivierung und
eBay-Zuordnung sind getrennte Wege. Der Dialog setzt zunächst `damage`
(„Beschädigt / nicht mehr verkaufbar“); `loss` ist kein Standardwert.
Die Auswahlliste verhindert bei Enter die normale Formularübermittlung.
Eine automatische Umwandlung eines Verkaufs in diesen Verlust wurde nicht
gefunden. Diese Quellenprüfung ersetzt keine Aufzeichnung des damaligen Klicks.

In den verfügbaren lokalen Sitzungsprotokollen wurden die exakte Artikel- und
Anforderungskennung sowie der enge Zeitpunkt geprüft. Kein entsprechender
Assistentenaufruf wurde gefunden. Der parallele Vinted-Prüflauf verwendete zu
dieser Zeit eine lokale Vorschau auf Port 4281 und prüfte Verkaufskarten. Der
eBay-Chat begann erst nach dem Verlustabgang. Daraus lässt sich keine sichere
Zuordnung zu einer bestimmten Person oder einem anderen Werkzeug ableiten.

## Zustand des eBay-Entwurfs

Der zuvor ausdrücklich beauftragte Entwurf für `01-15334-57587` besteht und ist
mit genau diesem Katalogartikel und einer Bestellposition verbunden. Sein
Status ist `needs_stock` („Bestand prüfen“), seine Verkaufs-ID ist leer und es
besteht keine aktive Reservierung. Die belegte eBay-Gebühr beträgt 4,68 Euro;
eigene Versandkosten bleiben unbekannt. Er wurde nicht endgültig gebucht.

Diese Untersuchung hat weder den Entwurf noch Verkäufe, Mengen, Einkaufskosten,
Ausbuchungsbelege, Berechtigungen oder Datenbankschema verändert.

## Erforderliche Korrektur vor der endgültigen Buchung

Für die ausdrücklich bestrittene Verlustausbuchung fehlt derzeit ein regulärer
Rücknahmeweg: Die bestehenden Trigger schützen Ausbuchungsbelege und zugehörige
Bewegungen vor Änderung und Löschung. Ein bloßes Hochsetzen der Losmenge oder ein
neuer fiktiver Einkauf wäre keine vollständige Korrektur des Belegs und seiner
Kosten.

Eine nachvollziehbare Rücknahme muss den ursprünglichen Verlustbeleg erhalten,
eine ausdrücklich begründete Gegenbuchung mit Bezug auf Beleg 1 speichern und
genau ein Stück einschließlich der belegten 13 Euro Stück- und Steuerkosten
wiederherstellen. Mehrfache Ausführung darf kein zusätzliches Stück erzeugen.
Danach muss die normale eBay-Entwurfsprüfung dieses eine Stück reservieren.
Die drei Vinted-Verkäufe bleiben unverändert; Umsatz und Gewinn für eBay zählen
erst nach der späteren persönlichen endgültigen Buchung.

Ein solcher Rücknahmeweg wurde in dieser reinen Untersuchung weder implementiert
noch ausgeführt. Die Bestandsblockade ist daher noch nicht beseitigt.

## Nachfolgender ausdrücklicher Korrekturauftrag

Der Nutzer hat die nachvollziehbare Gegenbuchung und Reservierung für eBay 7587
inzwischen ausdrücklich beauftragt. Der
[Umsetzungsplan](../superpowers/plans/2026-10-24-burberry-stock-reversal.md)
beschreibt den dazu ergänzten Rücknahmeweg. Die Funktion erhält Originalbeleg und
Originalbewegung, fügt eine geschützte Eingangsbewegung mit demselben Abgangsbezug
und ein eigenes Geschäftsereignis hinzu und verhindert eine doppelte Rücknahme.
Verkauf und erneute Ausbuchung verwenden anschließend den Nettobetrag der Bewegungen.

Die neue Migration führt selbst keine Änderung an produktiven Bestandsdaten aus.
Nach geprüfter Veröffentlichung erfolgen die konkrete Gegenbuchung und die normale
eBay-Entwurfsspeicherung gemeinsam in einer Transaktion. Zusätzliche Prüfungen
verlangen unveränderte ursprüngliche Belege und Vinted-Verkäufe, genau ein Stück
mit 13 Euro Geschäfts- und Steuerkosten, genau eine Reservierung für den bestehenden
Entwurf und weiterhin keinen endgültigen eBay-Verkauf. Eine unbekannte Versandhöhe
wird nicht durch null ersetzt.
