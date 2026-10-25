# Vintz-Cockpit und Widgets im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Einzeln freigegebener Untersuchungsblock nach dem
KI-Chat. Danach Stopp; keine Umsetzung, Aktivierung oder automatische
Fortsetzung mit der eigenständigen Auswertung.

## Ergebnis

Vintz bündelt Vinted-Verkaufsentwicklung, Käuferländer, Umsatzverteilung und
zwei nächste Schritte. Ein globaler Handlungsbedarf öffnet konkrete Nachrichten.
Flipbase besitzt bereits ein umfangreicheres Geschäfts-Dashboard mit Gewinn,
Marge, Bestandskapital, Kostenaufgaben, letzten Verkäufen und Lageralter.
Die Datenbasen unterscheiden sich: Vintz liest hier Vinted-Bestellhistorien,
Flipbase zentral erfasste Geschäftsvorgänge des aktiven Workspace.

Sinnvolle Ergänzungen für Flipbase wären vor allem eine gemeinsame Übersicht
offener Marktplatzaufgaben und klar sichtbare Datenstände. Gestaltete
Statistikkarten sind eine optionale Ergänzung. Ein frei zusammenstellbarer
Cockpit-Widgetbaukasten wurde bei keinem Produkt im untersuchten Pfad gefunden.
Native iPhone-Widgets sind gesondert einzuordnen; dafür gibt es Vintz-Frontendcode,
aber in dieser Desktopprüfung keinen praktischen Nachweis.

## Prüfrahmen und Belege

- Vintz: angemeldeter Prozugang, persönlicher Workspace, Cloudkonto Maike
  Vintage, [Cockpit](https://vintz.ai/cockpit). Separaten Lesetab verwendet.
- Live: vollständige Übersicht, Kontenauswahl, Datendefinitionen,
  Handlungsbedarf und Statistikvorschau geöffnet/gelesen, danach geschlossen.
- Die Auswahl blieb auf „Heute“ und Maike Vintage. Zeitraum, Vergleichsschalter,
  Diagrammart und gespeicherte Einstellungen wurden nicht geändert.
- Nur bereits geladene Erstanbieter-Skripte über Browser-CDP gelesen. Keine
  privaten Zustandsobjekte, Cookies, Zugangsdaten oder Serverinternas ausgelesen.
  Beschriebene Abruf-/Schreibpfade sind Codebefunde, keine vollständige
  Netzwerkaufzeichnung und kein Nachweis ihres serverseitigen Innenlebens.
- Flipbase: Dashboard live im Workspace Wiehen Store gelesen; Berechnungen
  zusätzlich anhand HEAD `e3ef736370640125c1abddcaf82de6079205d9fa` untersucht
  und unabhängig gegenprüfen lassen. Keine Gleichheit von Konto und Datenbestand
  beider Anwendungen angenommen; keine Leistungs-/Betragsschlussfolgerung aus
  unterschiedlich gefüllten Konten.

Bildschirmbelege:
[Vintz-Übersicht](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-cockpit-overview-2026-10-18.png),
[Statistikvorschau](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-cockpit-share-2026-10-18.png),
[Flipbase-Dashboard](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-dashboard-2026-10-18.png).

## Sichtbare Vintz-Übersicht

| Baustein            | Beobachtung und Grenze                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kontobezug          | Globale aktive Kontoauswahl und zusätzliche Umsatz-Kontenauswahl. Dort „Alle Accounts“ und Maike Vintage angehakt; bei nur einem Konto beide deaktiviert. Mehrkontoergebnis nicht getestet.                              |
| Zeitraum            | Heute, Gestern, letzte 7/30/90 Tage, eigener Zeitraum. Vorperiodenvergleich an. Keine Auswahl geändert.                                                                                                                  |
| Verkaufsentwicklung | Umsatz, Bestellungen, durchschnittlicher Bestellwert als umschaltbare Kennzahl; Balken-/Linienansicht, Datenstand und Spitze. Heute Umsatz 0, Bestellungen 0, Bestellwert unbekannt.                                     |
| Käuferländer        | Europakarte, Anzahl Länder und Umsatz mit Länderangabe; leerer Zustand. Länder aus Verkäufen/Rechnungsanschriften, keine exakten Standorte.                                                                              |
| Nächste Schritte    | „Zu versenden“ 0 → `/listings?filter=sold`; „Angebote prüfen“ 0 → `/listings?filter=stale`, mindestens sieben Tage unverkauft. Explizit unabhängig vom Analysezeitraum. Zielfilter hier nicht erneut praktisch getestet. |
| Umsatzverteilung    | Kategorien oder Käuferland, Ringgrafik und Tabelle. Heute leer.                                                                                                                                                          |
| Datenquelle         | „Gespeicherte Bestellhistorie · 18.10.2026, 00:30:11“. Der laufende Zeitraum endet entsprechend um 00:30, nicht am Zeitpunkt dieser späteren Prüfung.                                                                    |
| Handlungsbedarf     | Globale Schaltfläche mit 1. Dialog enthält eine Nachricht mit direktem Gesprächs-/Antwortlink und „Als erledigt markieren“. Keine Nachricht geöffnet oder erledigt.                                                      |
| Einstiege           | Neues Angebot, Aktualisieren, Neu laden und Link zur separaten Auswertung. Keine dieser fachlichen Folgeaktionen gestartet.                                                                                              |

Die heute leeren Zahlen widerlegen die zuvor gefundenen Septemberverkäufe
nicht: Sie liegen außerhalb der unverändert gelesenen Tagesauswahl.
Teilweise erschien direkt nach dem Öffnen kurz englische Beschriftung, danach
Deutsch. Einzelne Formulierungen blieben gemischt, etwa „local timezone“ und
„Accounts“; kein flächendeckender Sprachtest.

## Technische Mechanik und Grenzen

### Verkaufszahlen, Kategorien und Vergleich

Die Cockpitberechnung verwendet Bestellungen mit auswertbarem Verkaufsdatum
innerhalb des Zeitfensters und schließt die entsprechenden endgültigen
Storno-/Erstattungszustände aus. Der angezeigte Artikel-/Bestellpreis ist vor
Gebühren; er ist weder Auszahlung noch Gewinn. Offene, nicht endgültig
ausgeschlossene Bestellungen können nach den bereits untersuchten
[Statusregeln](vintz-orders-shipping-comparison.md) zum Verkaufswert zählen.

Geldwerte benötigen Preis und Währung; verschiedene Währungen werden nicht
einfach summiert. Bestellanzahl kann verfügbar bleiben, wenn Geldwerte fehlen.
Käuferland kommt zunächst aus Bestelldaten, sonst aus eindeutig zuordenbaren
Finanzeinträgen. Kategorien stammen aus abgeglichenen Finanz-/Artikeldaten;
bei Bundles wird eine Aufteilung nur bei passender Zuordnung und
übereinstimmender Summe verwendet. Sonst bleiben Angaben gegebenenfalls
„Unbekannt“. „Ø Artikel / Bestellung“ ist damit keine garantiert vollständige
Stückzahlstatistik aller Bestellungen.

Vorperioden sind gleich lange, **direkt vor dem gewählten Fenster liegende**
Zeitspannen. Live zeigte Heute 00:00–00:30 die Vorperiode des Vortags
23:29–00:00; die Minutenanzeige rundet Sekunden ab. Das ist kein Vergleich mit
gestern 00:00–00:30. Prozentwerte erfordern vollständige Historie und gültige
Verkaufsdaten; beim Umsatz zusätzlich kompatible Geldwerte. Vorwert 0 wird als
„Neu“ beziehungsweise „Unverändert“ behandelt. Diese Regel ist transparent,
aber für Tagesvergleiche nicht automatisch die fachlich sinnvollste Wahl.

Die Datendefinitionen nennen fehlende Aufrufhistorie und eine nicht verfügbare
verlässliche Rückgabenquote ausdrücklich. Stornos sind keine Rückgaben.
Die Karte ist keine Liste unterstützter Vinted-Länder. Solche Lücken sollten
bei einer Übernahme ebenso sichtbar bleiben.

### Cloud, Browser, Aktualisierung und Speicherung

Cloud-Bestellungen werden im Frontend seitenweise über
`GET /api/seller/account-orders` gelesen; ein einzelnes Konto wird eingegrenzt.
Aktuelle Artikel werden separat über den Inventarpfad von
`GET /api/seller/multi-accounts` geladen. Vollständigkeit wird je gewähltem
Konto und Quelle betrachtet. Für den gemeinsamen Datenstand verwendet der
Code den ältesten vorhandenen Abgleichzeitpunkt der ausgewählten Quellen.
Aktuelle Versand-/Altangebotszähler bleiben vom Umsatzzeitraum getrennt.
Altangebote benötigen ein verwertbares Veröffentlichungs-/Listungsdatum;
fehlendes Datum beweist keine frische Ware.

„Neu laden“ erhöht einen lokalen Abrufzähler und liest gespeicherte Quellen
erneut. Ein gesonderter Zustand für Konten ohne Verkaufshistorie bietet
„Jetzt importieren“; dieser Weg sendet einen Sync-POST je betroffenem Konto und
liest danach zeitweise weiter. Daher Nachladen, Kontoprüfung und frischen
Vinted-Abgleich nicht als dieselbe Operation darstellen. Kein Knopf betätigt.

Für ein verbundenes Browserkonto gibt es getrennte Brückenabrufe von Angeboten,
Bestellungen und Postfach sowie eine lokale IndexedDB-Lesekopie, je Nutzer und
Browserkonto. Ein vorhandener Stand kann beim Einstieg wiederverwendet werden;
bei fehlendem Stand kann der Seiteneinstieg selbst Browserdaten abrufen.
Teilstände/fehlende Quellen werden getrennt geführt. Browsercode sieht zudem
ergänzende Bestelldetail-/Labelzustandsabrufe vor. Diese Pfade wurden am
Cloudkonto nicht als ausgeführter Browserablauf getestet.

Der gewählte Zeitraum liegt unter `vintz:overview-period` im lokalen
Browserspeicher; dieser Schlüssel enthält keine sichtbare Nutzer-/Workspace-
Trennung. Freie Datumsgrenzen und weitere Diagrammzustände sind im gelesenen
Komponentenpfad lokal. Die zusätzliche Umsatz-Kontenauswahl ist lokaler
Komponentenzustand, der bei Änderung des globalen Kontobezugs zurückgesetzt
wird. Kein gespeichertes frei anordbares Cockpitlayout gefunden.

Der globale Handlungsbedarf liest `/api/seller/attention` beim Einstieg und
bei Fokus/Sichtbarkeit mit kurzer Abrufsperre. „Als erledigt markieren“ führt
im gelesenen Pfad zu einem POST auf `/api/seller/inbox-state`; nicht betätigt.
Ein sichtbarer Hinweis ist kein Beleg für ständige Liveaktualität.

### Statistikgrafik und native Widgets

„Teilen“ öffnet zunächst eine Vorschau: Verkaufswert oder Verkäufe, zehn Designs,
Beitrag 4:5, Story 9:16 und Quadrat 1:1. Die sichtbare Beitragsvorschau nennt
1080 × 1350 PNG, Zeitraum, Konto und Datenstand. Der Kontoname ist hier
standardmäßig eingeblendet und abwählbar. Bei null Verkäufen meldet Vintz
fehlende Zahlen und sperrt Speichern/Teilen. Kein Export und keine Übertragung
ausgelöst. Der geladene Code erzeugt die Grafik im Browser und verwendet beim
Teilen die native Teilen-Funktion, andernfalls einen Dateidownload.

Ein zusätzlicher Frontendpfad übergibt einen Snapshot an das native
`VintzWidget`-Plugin ausschließlich bei erkannter iOS-Umgebung. Darin liegen
unter anderem heutiger/gestriger Umsatz, heutige Bestellungen, aktive Angebote,
offener Versand, ungelesene Nachrichten und ein Teilstandsmerkmal. Ein
VPS-Verkaufsfeed kann eine eigene Quelle sein. Diese Werte sind vom Desktop-
Cockpit zu unterscheiden; insbesondere ist der dort gebildete Tagesgewinn
aus Finanzeinträgen keine bestätigte Übernahme der Desktopberechnung.
Installation, Aktualisierungsintervall, Hintergrundzustellung und tatsächliche
Darstellung eines Home-Bildschirm-Widgets wurden nicht geprüft. Keine neue
Benachrichtigungs- oder App-Berechtigung erteilt.

## Vergleich mit Flipbase

| Gesichtspunkt   | Vintz-Cockpit                                                                         | Flipbase im geprüften Stand                                                                                            |
| --------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Datenbezug      | Vinted-Browser-/Cloudkonten und deren gespeicherte Historie                           | Zentrale Einkäufe, Verkäufe und physischer Bestand im aktiven Workspace; Plattformname „Vinted“ ist kein Cloudkonto    |
| Kennzahlen      | Verkaufswert, Bestellungen, Ø Bestellwert                                             | Umsatz, direkter Verkaufsgewinn, gewichtete Marge, aktuelles Bestandskapital, Verkäufe/Stückzahl                       |
| Verlauf         | Kennzahl und Balken/Linie umschaltbar, Vorperiode                                     | Umsatz/Ausgaben/Gewinn mit ausblendbaren Reihen, Tastatur-/Touchdetails und Tabellenalternative                        |
| Zeitraum        | Heute/Gestern/7/30/90 Tage/frei                                                       | Heute/7 Tage/laufender Monat/laufendes Jahr; kein freies Fenster im Dashboard                                          |
| Vergleiche      | Unmittelbar vorausgehendes Fenster gleicher Dauer; vollständige Historie erforderlich | Gestern/Vorwoche/gleicher Kalendertag des Vormonats bzw. Vorjahrs. Grenzen und unbekannte Kosten gesondert zu beachten |
| Aufgaben        | Versand, alte Angebote, global konkrete Nachrichten                                   | Kostenlücken in Einkauf/Bestand/Verkauf; vier feste Schnellaktionen                                                    |
| Verteilung      | Kategorie/Käuferland einschließlich Karte                                             | Verkaufsplattform, höchstens vier Segmente einschließlich gegebenenfalls „Sonstige“                                    |
| Bestandsarbeit  | Im sichtbaren Desktopcockpit kein EK-Kapital-/Lageralterblock                         | Gesamtstückzahl, bekannter EK-Wert, Durchschnitts-EK, 61–90 und über 90 Tage; unbekannte Kosten/Alter genannt          |
| Letzte Verkäufe | Kein entsprechender Listenblock im gelesenen Cockpit                                  | Fünf letzte gefilterte zentrale Verkäufe mit direktem Verkaufslink                                                     |
| Speicherung     | Zeitraum lokal im Browser, übrige untersuchte Zustände lokal                          | Zeitraum/Plattform im nutzerbezogenen Auth-Metadatum `flipbase_dashboard`, nicht je Workspace                          |
| Anpassbarkeit   | Keine freie Widgetauswahl/-reihenfolge gefunden                                       | Ebenfalls fester Aufbau; temporäre Diagrammreihensteuerung                                                             |
| Teilen          | Statistikgrafik mit Designs/Formatvorschau                                            | Kein gleichwertiger Kartenexport im untersuchten Dashboardpfad                                                         |

Flipbase zeigte live das laufende Jahr, fünf KPIs, einen Kostenhinweis, Verlauf,
letzte Verkäufe, Plattformverteilung und aktuellen Bestand. Die Quellen
bestätigen die sichtbaren Hilfetexte: Gewinn nach Wareneinsatz und direkten
Verkaufskosten; Betriebsausgaben und Steuern sind nicht abgezogen. Unbekannte
Kosten bleiben sichtbar und werden nicht als kostenlos gerechnet.
Die Ausgabenkurve enthält im Gesamtmodus zusätzlich bezahlte Betriebsausgaben
und Einkäufe; sie hat eine andere Bedeutung als der direkte Verkaufsgewinn.

Bei Quellenfehlern zeigt Flipbase unbekannte Werte statt einen unvollständigen
Gesamtstand als vollständig auszugeben. Eine verbleibende Grenze: Die
Vollständigkeit der Vorperiodenkosten wird nicht gesondert als Vergleichsmerkmal
übergeben. Aktuelle Kostenlücken unterdrücken außerdem auch den ansonsten
berechenbaren Umsatzvergleich. Ein Vorteil bei Definitionen rechtfertigt
deshalb keine pauschale Fehlerfreiheit des gesamten Vergleichs.

Quellen:
[Dashboard/KPIs/Aufgaben](../../src/app/features/dashboard/dashboard.component.ts#L168),
[Vorlage](../../src/app/features/dashboard/dashboard.component.html),
[Berechnung und Zeitfenster](../../src/app/core/services/dashboard-report.service.ts#L174),
[Präferenzen](../../src/app/features/dashboard/services/dashboard-preferences.service.ts#L96),
[Bestand/Verteilung](../../src/app/features/dashboard/models/dashboard-overview.ts),
[Diagrammbedienung](../../src/app/shared/components/revenue-chart/revenue-chart.component.ts#L123).

## Festhalten für die gemeinsame Entscheidung

1. **Hoher Nutzen:** Offene Nachrichten, Versand und Konto-/Syncprobleme mit
   Anzahl, Grund und direktem Ziel bündeln. Bestehende Kostenaufgaben bleiben
   ein eigenständiger wertvoller Teil. Gleicher Konto-/Workspacebezug für Zahl
   und Zielansicht muss nachvollziehbar sein.
2. **Hoher Nutzen:** Datenstand, Quelle und Vollständigkeit an Kennzahlen
   sichtbar machen. Gespeicherte Vinted-Historie, frisch gelesene Daten und
   zentrale Geschäftsvorgänge müssen erkennbar bleiben.
3. **Prüfen:** Freier Zeitraum, Ø Bestellwert und Kategorie-/Länderanalyse,
   soweit belastbare Quelldaten vorhanden sind. Vorperiodenregel fachlich
   festlegen; Vintz' unmittelbar vorhergehende Zeitspanne nicht blind übernehmen.
4. **Optional:** Statistikgrafiken mit einfacher Kontoausblendung und
   verständlicher Betragsdefinition. Kein Vorrang vor verlässlichen Daten.
5. **Noch kein belegter Bedarf:** Frei verschiebbare Widgets. Dafür wurde hier
   kein Vintz-Vorsprung gefunden. Native iPhone-Widgets benötigen einen eigenen
   Geräte-/Betriebstest; keine Gleichsetzung mit Web-Dashboardkarten.

Dies sind Empfehlungen zur Besprechung, keine Umsetzungsfreigabe.

## Quellenidentität, offene Fragen und Abschluss

Bereits geladene Vintz-Quellen, SHA-256 des UTF-8-Texts:

| Chunk              | Rolle                                                            | SHA-256                                                            |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `2tnyr2wwyg9a4.js` | Cockpitdaten, Zeitfenster, Karte, Statistikvorschau              | `e342e200208f1f5a5002a9d623c1390b71fa8b6f5d5d16e9b43df785fe525742` |
| `0vjwd7fvap9iu.js` | Seite, lokale Browserlesekopie, native Widgets, Altangebotsregel | `1588b92fc130b6aa075a5c01a4b305a69126298956dae4500a606b8d042ba00b` |
| `3t_pt7lo8x2se.js` | Gemeinsamer Handlungsbedarf                                      | `900afb125efe33c0d18cdcaef2244241a3fc1d4a6697335a73fcd94fa3e650c9` |
| `1_f4nrn8dk85w.js` | Gemeinsame Bestellzustände                                       | `afb0096092b9134d56062053e0365fbc4db35229ad5bf61b8df8c1a58f240fe6` |

Basis jeweils `https://vintz.ai/_next/static/chunks/`. Identitätsliste zusätzlich
[lokal gesichert](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-cockpit-source-identities-2026-10-18.json).
Kein fremder Anwendungscode ins Repository übernommen.

Offen bleiben echte Mehrkonto-/Mehrwährungsdaten, nichtleere Länder-/Bundle-
Zuordnung, freie Zeitraumsauswahl in Ausführung, große Historien, tatsächliche
Fehler-/Wiederholfälle, Dateiexport und natives Teilen sowie iOS-Widgets.
Keine allgemeine Mobil-/AXE-/Leistungsmessung. Die eigene Auswertungsseite
`/analytics` wurde nicht geöffnet oder als abgeschlossen behandelt.

Keine fachlichen Schreibaktionen, Aktualisierung, Import, Erledigt-Markierung,
Nachricht, Veröffentlichung, Buchung oder Umsetzung. Normale Hintergrundabrufe
beim Öffnen der Seiten sind davon zu unterscheiden. Beide separaten Lesetabs
geschlossen; vorhandene Nutzertabs und pausierte Flipbase-Verbindung unberührt.
Nur Dokumentation geändert; Markdown, lokale Links und Unterschiedskontrolle
sind erfolgreich geprüft. Anwendungstests für diesen Dokumentationsschritt
nicht erforderlich. Danach Stopp zur Besprechung.
