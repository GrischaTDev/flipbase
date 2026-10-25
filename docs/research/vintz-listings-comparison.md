# Vintz-Angebotsübersicht und Flipbase im Vergleich

Untersuchung von Juna am 17.10.2026. Auftrag: Angebotsübersicht im Detail
untersuchen, mit Flipbase vergleichen und danach zur gemeinsamen Besprechung
stoppen. Keine Umsetzung freigegeben.

## Grundlage und Grenzen

- Live untersucht: `https://vintz.ai/listings`, gebuchter Prozugang, ein verbundenes
  Cloudkonto. Listen- und Kartenansicht, Filter, Suche, Auswahl, Aktionsmenüs und
  vorgeschaltete Prüfmasken wurden bedient. Keine Fachaktion bestätigt.
- Live verglichen: Flipbase-Kleiderschrank und der Vinted-Kontoabschnitt in der
  übergreifenden Marktplatzübersicht unter `https://app.flipbase.de`.
- Vergleich desselben Kontos mit fünf aktiven Artikeln. Preise und sichtbare
  Aufrufe/Favoriten stimmten in dieser Stichprobe überein.
- Flipbase-Konto war pausiert. Vorhandene Daten blieben lesbar; die Pause wurde
  weder verändert noch für diesen Vergleich aufgehoben. Live-Zuverlässigkeit
  des Flipbase-Anbieterabrufs wird deshalb nicht bewertet.
- Zusätzlich Codeprüfung von Flipbase bei
  `e3ef736370640125c1abddcaf82de6079205d9fa` und gezielte Prüfung der geladenen
  Vintz-Übersichtsmodule. Laufende Anwendung und lokaler Code sind unterschiedliche
  Belegarten; die exakte ausgelieferte Flipbase-Commitkennung wurde nicht bestimmt.
- Desktopbreite 2.109 CSS-Pixel. Mobile Layoutprobe mit 390 × 844 Pixeln,
  vorübergehend gesetzt und danach zurückgesetzt. Keine vollständige
  Browsermatrix, keine AXE-Prüfung und kein WCAG-Konformitätsnachweis.

## Zwei unterschiedliche Flipbase-Oberflächen

**Vinted → Kleiderschrank** ist eine bebilderte Kontoansicht. Sie zeigt in der
untersuchten breiten Ansicht fünf große Karten, Inseratsalter, Preis, Merkmale,
Zustand sowie Aufrufe und Favoriten. Über die Zeitraumwahl lassen sich Änderungen
der Kennzahlen vergleichen. Titelsuche, Statusfilter, Ansichtswechsel und
Sammelaktionen fehlen dort.

**Marktplatzübersicht → Kontoabschnitt** hat bereits Titelsuche, Statusfilter,
Einzel-/Seitenauswahl, Desktop-Tabelle, mobile Liste und Seitennavigation.
Die Auswahl zeigt ihre Anzahl, bietet bisher jedoch keine anschließende
Sammelaktion. Vinted ist dort laut lokalem Code nur für Betreiber freigeschaltet;
es darf nicht als allgemein verfügbarer Funktionsumfang beschrieben werden.
Diese Einschränkung erklärt, warum die gemeinsame Angebotsverwaltung für normale
Vinted-Nutzer weiterhin eine echte Produktfrage ist.

## Geprüfte Funktionen von Vintz

### Aufbau, Konto und Darstellung

- Seitenkopf mit Angebote, Kontokontext, relativer Ladezeit, Einstellungen,
  neuem Angebot und Menü für weitere Angebotsaktionen.
- Kontoauswahl für alle Konten, Browserkonto und einzelne Cloudkonten.
  Das unverbundene Browserkonto ist deaktiviert. Bei Auswahl aller Konten
  erscheint trotzdem ein deaktivierter Connect-Ladebutton; im einzelnen
  Cloudkonto entfällt dieser Einstieg.
- Wechsel zwischen Liste und Karten ohne Datenänderung. Desktopliste hat
  Angebot, Status/Aktivität, Preis und Aktionen. Karten verwenden größere
  Fotos, zweizeilig gekürzte Titel, Merkmale, Konto, Alter, Preis und Kennzahlen.
- Angebotstitel öffnen beim untersuchten aktiven Cloudartikel direkt eine
  Bearbeitungsmaske. Fotoaktionen heißen Foto bearbeiten. Eine reine
  Großbildgalerie wurde in diesem Schritt nicht nachgewiesen.
- Auf Desktop stehen in der Liste fünf Zeilen sehr kompakt untereinander.
  Karten nutzen ebenfalls fünf Spalten, aber deutlich kleinere Bilder als
  Flipbases Kleiderschrank. Die Gesamtgestaltung ist kein Übernahmeauftrag;
  Flipbase-Gelb und die bestehende Shared-UI-/Shopify-Grundlage gelten weiter.

### Suche, Filter und Summen

| Prüfung                          | Beobachtung                                                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Aktive Angebote                  | Fünf Artikel.                                                                                                                                  |
| Seit 7+ Tagen unverkauft         | Keine Treffer. Alle fünf aktiven Vintz-Artikel haben unbekanntes Veröffentlichungsdatum.                                                       |
| Auf Vinted ausgeblendet          | Keine Treffer, entsprechender Leerzustand.                                                                                                     |
| Vinted-Entwürfe                  | Keine Treffer; Erklärung zum späteren Erscheinen von in der Vinted-App begonnenen Entwürfen.                                                   |
| Verkauft                         | Zwei verkaufte Artikel und zusätzlich Bestellungen/Versand mit Import-, Rechnungs- und Labelaktionen. Diese weiteren Abläufe nicht ausgeführt. |
| Alle                             | Sieben Artikel: fünf aktive und zwei verkaufte.                                                                                                |
| Suche Nike bei aktiven Angeboten | Ein Treffer.                                                                                                                                   |
| Suche ohne Treffer               | Eigener Leerzustand; keine künstlichen Einträge angelegt.                                                                                      |
| Rücksetzen der Suche             | Fünf aktive Treffer wieder sichtbar. Vorherige Auswahl blieb nicht erhalten.                                                                   |

Die Desktopliste summiert die **aktuelle Ansicht**: fünf Angebote, Angebotspreise
163,68 Euro, 299 Aufrufe, 32 Favoriten. Bei Suche Nike waren es ein Artikel,
17,99 Euro, 108 Aufrufe und zwölf Favoriten. Das ist eine Summe von Angebotspreisen,
kein Umsatz. In der Kartenansicht steht stattdessen die Artikelanzahl oberhalb
des Rasters; derselbe Summenfooter war dort nicht sichtbar.

Im Cloudmodul umfasst die Suche laut gelesenem Code Titel, Marke, Größe sowie
Kontoname/-login, ohne Unterscheidung von Groß-/Kleinschreibung. Der Cloudclient
fordert Inventarseiten mit Limit 1.000 an und filtert den geladenen Bestand.
Weiteres Nachladen und seitenübergreifendes Einsammeln für eine Auswahl sind
vorgesehen. Das tatsächliche Serverlimit und Verhalten bei mehr als 1.000
Artikeln wurden mit dem kleinen Konto nicht geprüft. Keine frei bedienbare
Preis-/Alters-/Kennzahlensortierung oder Spaltenkonfiguration in den untersuchten
Menüs gefunden; daraus keine Aussage über andere Produktbereiche ableiten.

### Auswahl und Fachaktionen

- Einzelne Auswahl sowie Aktive auswählen wurden geprüft; alle fünf aktiven
  Cloudartikel konnten zusammen ausgewählt und anschließend geleert werden.
- Eine Auswahl blendet eine eigene Aktionsleiste mit Anzahl, Leeren, Preis,
  Neu einstellen und Angebote ein.
- Zusätzlich bleibt Alle auswählen deaktiviert, obwohl aktive Cloudartikel
  vorhanden sind. Der gelesene Code unterscheidet lokale und Cloudauswahl.
  Das wirkt in dieser gemischten Oberfläche uneindeutig; es ist kein Beleg,
  dass die Cloud-Mehrfachauswahl insgesamt defekt ist.
- Wechsel zu einer Suche ohne Treffer und Rückkehr ließ die vorherige Auswahl
  nicht wieder erscheinen. Flipbase setzt seine Auswahl ebenfalls bei Such-,
  Filter- und Seitenwechsel zurück; Suche und Reset live bestätigt.

| Aktion                            | Tatsächlich untersuchte Prüfmaske / Grenze                                                                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direkte Preiseingabe in der Zeile | Lokale Änderung 29,99 auf 29,00 Euro öffnete eine Bestätigungsleiste mit Alt-/Neupreis. Escape stellte 29,99 wieder her. Keine Preisänderung bestätigt. Kein ungesichertes Speichern allein beim Verlassen des Felds aus diesem Befund ableiten.                                                   |
| Gesammelte Preise                 | Prozentual senken/erhöhen, festen Betrag abziehen/addieren oder exakten Preis setzen; Alt-/Neu-Vorschau je Artikel. Vorgabe zehn Prozent ergab bei 17,99 Euro eine Vorschau von 16,19 Euro. Abgebrochen.                                                                                           |
| Neu einstellen                    | Direkt, Nahtlos, Als Entwurf und Nur Entwurf; mehrere Varianten als Beta. Abstand und sofortiger/späterer Start vorgesehen. Texte erklären unterschiedliche Reihenfolge von Veröffentlichung und Entfernung. Nur geöffnet, keine Strategie ausgeführt.                                             |
| Angebotsregeln                    | Prüfung erforderlich oder automatisch annehmen, prozentualer Mindestpreis, maximaler Rabatt, Wartezeitspanne und Mindestpreisvorschau je Artikel. Voreinstellungen sind keine Empfehlung für Flipbase. Ohne Speichern abgebrochen.                                                                 |
| Titel / Listing bearbeiten        | Titel, Beschreibung, Marke, Preis. Bei dem untersuchten Nike-Artikel war die Beschreibung nicht im Abgleich enthalten; leeres Feld soll vorhandenen Vinted-Text erhalten. Änderungen werden eingeplant; unklarer externer Ausgang soll manuell geprüft werden. Ohne Eingabe/Speichern geschlossen. |
| Menü pro aktivem Angebot          | Preis senken, Relisting, Studio, auf Vinted ausblenden, Angebot löschen. Sichtbarkeit ist kein erfolgreicher Funktionsnachweis.                                                                                                                                                                    |
| Weiteres Seitenmenü               | Paket scannen, CSV importieren/exportieren, ausgewählte Artikel ausblenden. Keine Kamera, Dateiübertragung oder Ausblendung gestartet. Der gelesene Exportpfad verweist auf einen Buchhaltungsexport; Inhalt und Eignung als vollständiger Inseratexport ungeprüft.                                |

Der Cloudcode begrenzt gesammelte Preisänderungen und Angebotsregeln auf fünf
Artikel pro Vorgang. Nur die Auswahl von bis zu fünf vorhandenen Artikeln und
Prüfmasken wurden live geprüft; keine Fehlerbedingung durch echte Schreibaufträge
erzeugt. Teile der Aktionslisten hängen von Ausführungsmodus, Tarif/Fähigkeiten,
Verbindungszustand und vorhandenen Automatisierungen ab. Aus den sichtbaren
Menüs dieses Zugangs keine allgemeine Verfügbarkeit aller Funktionen ableiten.

### Einstellungsbezug

Der Einstellungsbutton führt zur Angebotsrubrik der allgemeinen Einstellungen.
Dort sichtbar: Vorgabe für Artikelzustand, optionale SKU von Hand/fortlaufend,
automatisches Hochladen, Voll-/Halbautomatik, Ausblenden anderer Kontoangebote
nach Verkauf sowie ein Hinweis ab einer Anzahl Tagen ohne Aufrufe, aktuell drei.
Die Seite speichert automatisch; es wurde kein Wert verändert. Einige
Erklärungen sprechen weiterhin nur von der Erweiterung, obwohl Cloud verwendet
wird. Die tatsächliche Wirkung der Einstellungen wurde nicht untersucht.

## Vergleich am gleichen Bestand

| Thema            | Vintz live                                                                  | Flipbase-Kleiderschrank live                                                     | Flipbase-Marktplatzübersicht live / Code                                                                   |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Darstellung      | Liste und Karten umschaltbar                                                | Große Karten                                                                     | Desktop-Tabelle/mobile Liste, kein benutzerwählbarer Umschalter                                            |
| Suche            | Suchfeld, ein Nike-Treffer bestätigt                                        | Kein Suchfeld                                                                    | Suchfeld, derselbe Treffer bestätigt; laut Code über gesamte gespeicherte Lesekopie                        |
| Status           | Sechs direkt sichtbare Filter                                               | Keine Statusleiste                                                               | Alle gespeicherten, Online, Reserviert, Beendet; Reserviert ist ein zusätzlicher sinnvoller eigener Status |
| Alter            | Bei den fünf aktiven Artikeln unbekannt                                     | Drei Artikel 22 Tage, zwei 15 Tage; gerundete Vinted-Quelle kenntlich            | Dieselben Altersangaben vorhanden                                                                          |
| Kennzahlen       | Aufrufe/Favoriten in Liste und Karten                                       | Werte und Vergleichszeitraum; Zuwachslogik im Code                               | Nicht in der bestehenden Tabelle enthalten                                                                 |
| Auswahlsummen    | Gefilterte Summen in Liste                                                  | Keine entsprechende Summenleiste                                                 | Keine entsprechende Summenleiste                                                                           |
| Mehrfachauswahl  | Nutzbare Leiste mit nachfolgenden Fachaktionen                              | Nicht vorhanden                                                                  | Auswahl und Anzahl vorhanden, keine anschließende Sammelaktion                                             |
| Preis bearbeiten | Feld mit Bestätigungsleiste und gesammelte Vorschau                         | Über Detail/Bearbeiten, abhängig von Verbindung                                  | In untersuchter Tabelle Preis als Lesewert                                                                 |
| Konto            | Gemeinsamer Filter alle/einzeln                                             | Einzelnes Konto                                                                  | Einzelne Kontoabschnitte und Kontofilter                                                                   |
| Detailzugang     | Titel öffnet Bearbeitungsdialog                                             | Interne Detailansicht mit Bildern                                                | Ansehen führt zur internen Vinted-Detailansicht                                                            |
| Transfer         | Im hier geprüften Menüsatz nicht nachgewiesen                               | Implementiert, abhängig von Zielkonfiguration; hier kein sichtbarer Kartenbutton | Inserieren pro Artikel live sichtbar                                                                       |
| Abgleich         | Kurzer Kontext-/Zeitbadge, Aktualisierungsaktion                            | Konto-/Abgleichskopf mit Zuständen; hier bewusst pausiert                        | Letzter Abgleich direkt am Kontoabschnitt                                                                  |
| Umfang           | Verkaufte Artikel in derselben Arbeitsfläche, zusätzliche Versandfunktionen | Separate Vinted-Unterseiten                                                      | Plattformübergreifende Verwaltungsgrundlage, Vinted laut Code Betreiberzugang                              |

Die drei verkauften Einträge in Flipbases Kontoübersicht wurden nicht einzeln
gegen die zwei Vintz-Bestellungen abgeglichen. Unterschiedliche Status-/Datums-
oder Importregeln sind möglich. Keine pauschale Behauptung eines Datenverlusts.

## Bedienung und Zugänglichkeit

- Bei 390 Pixeln zeigt Vintz zwei Karten nebeneinander oder eine gestapelte
  Liste. Suche steht prominent, Statusfilter scrollen horizontal. Neues Angebot
  wandert vom Desktopkopf in die feste mobile Plusaktion.
- Zwei beispielhaft gemessene Preisaktionen der Karten wuchsen auf 44 Pixel
  Höhe; am Desktop waren die fünf gemessenen Kartenaktionen jeweils 32 Pixel
  hoch. Das ist eine Stichprobe, kein Nachweis aller Touchflächen.
- Flipbases übergreifende Tabelle wechselt mobil auf eine beschriftete Liste
  mit Auswahl, Preis, Alter und Aktionen. Viele Kontoköpfe beanspruchen davor
  allerdings erheblich Platz; bei drei Konten ist das konkrete Konto weniger
  direkt erreichbar als mit Vintz' kompaktem Kontofilter.
- Beide bieten benannte Bedienelemente. Vintz mischt in geprüften Leerzuständen
  und Dialogbeschriftungen Deutsch und Englisch. Einige kurze Aktionen wie
  Angebote sind ohne die geöffnete Maske wenig eindeutig.
- Listenbilder in Vintz sind kleiner, dafür sind Kennzahlen und Aktionen schneller
  zu überblicken. Flipbases große Produktbilder bleiben für visuelles Erkennen
  nützlich; eine kompakte Alternative ergänzt diesen Zweck.
- Vollständige Kontrastmessung, Tastaturreihenfolge, Screenreaderprüfung und
  AXE-Lauf stehen aus. Vorhandene Flipbase-Testdefinitionen sind keine in dieser
  Sitzung ausgeführten Tests.

## Empfehlungen zur gemeinsamen Entscheidung

**Nutzerrückmeldung vom 17.10.2026:** Die folgenden Punkte werden als gemeinsame
Richtung festgehalten. Das ist keine Freigabe zur Umsetzung. Auf Wunsch folgt
als eigener Schritt die [Untersuchung des Neueinstellens](vintz-relisting-comparison.md),
danach erneut Stopp und Besprechung.

1. **Eine gemeinsame Vinted-Arbeitsfläche aus vorhandenen Bausteinen entwickeln.**
   Suche, Status und Auswahl der bestehenden Verwaltung mit den Bildern,
   Altersangaben und Kennzahlen des Kleiderschranks verbinden. Doppelpflege
   und dauerhaft zwei unterschiedliche Vinted-Listen vermeiden. Betreibergrenze
   ausdrücklich berücksichtigen, nicht stillschweigend entfernen.
2. **Liste/Karten umschaltbar anbieten.** Gleiche Filter und Datenbasis verwenden;
   große Bildansicht für visuelles Arbeiten erhalten. Keine neue Fremdgestaltung
   neben den verbindlichen Flipbase-Komponenten einführen.
3. **Gefilterte Zusammenfassung ergänzen.** Anzahl, Summe der Angebotspreise,
   Aufrufe und Favoriten passend zur sichtbaren Treffermenge benennen. Bei
   Nachladen klar zwischen geladenem Teil und gesamtem Suchergebnis unterscheiden.
4. **Sammelpreisänderung mit Alt-/Neu-Vorschau priorisieren.** Vorhandene Auswahl
   nutzbar machen; Zielkonten, Rundung, Grenzen, Teilfehler, Auftragsannahme und
   bestätigte Wirkung sauber behandeln. Einzelpreiseingabe mit expliziter
   Bestätigung kann denselben Ablauf später verkürzen.
5. **Alter und Leistungsentwicklung als eigenen Vorteil behalten.** Sieben-Tage-
   Filter auf belegte Altersdaten stützen, unbekanntes Alter getrennt behandeln.
   Nicht aufgrund fehlender Daten versehentlich Altbestand als jung ausgeben.
6. **Neueinstellen und Angebotsregeln separat planen.** Die sichtbaren Vintz-
   Prüfmasken sind hilfreiche Referenzen, aber nicht durch diesen Rundgang
   fachlich abgenommen. Veröffentlichung/Löschung, Bildbearbeitung und
   Automatisierung verdienen jeweils einen eigenen Untersuchungsschritt.

Kein Bedarf, Vintz' unklare parallele Auswahlbuttons, gemischte Sprache oder
unbekannte Altersangaben zu übernehmen. Freie Sortierung und sinnvolle Filter
nach Preis/Kennzahlen bleiben mögliche eigene Verbesserungen; sie wurden vom
Nutzer in diesem Schritt noch nicht als Umsetzungsumfang festgelegt.

## Quellen und Nachvollziehbarkeit

Relevante Flipbase-Stellen:

- [Kleiderschrank](../../src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.html),
  [Kennzahlen](../../src/app/features/marketplaces/components/vinted-listings/vinted-listing-metrics.component.html).
- [Kontoabschnitt mit Suche/Auswahl](../../src/app/features/marketplaces/components/marketplace-listing-section/marketplace-listing-section.component.html),
  [Abfrage und Suche](../../src/app/features/marketplaces/services/marketplace-api.service.ts).
- [Vinted-Betreibergrenze](../../src/app/features/marketplaces/components/marketplace-overview/marketplace-overview.component.ts),
  [Altersmodell](../../src/app/features/marketplaces/models/vinted-listing-age.ts).
- [Verbindliche Gestaltung](../design/admin-ui-guidelines.md).

Gezielt gelesene Vintz-Module aus dem bereits geladenen Browsercode:

- `https://vintz.ai/_next/static/chunks/06s0-dtw1aw-c.js`,
  SHA-256 `1734475e61a659b48dbc9045732f69257ef66b80073efd84e68b33e5ef45eb8a`.
- `https://vintz.ai/_next/static/chunks/2zjr9e7-x2k0q.js`,
  SHA-256 `51f740ae7ef76b748f140cc2cf4682acc54a170cdd03e7a5d5664816284729b2`.

Quelltexte wurden nicht ins Repository übernommen. Die passenden Stellen
erklären Dialogauslöser, Suche, Nachladen und Aktionsgrenzen; ein sichtbarer
Codepfad ist kein Nachweis erfolgreicher externer Schreibaktionen.

Lokale Bildschirmbelege außerhalb des Repositorys:

- [Vintz-Liste](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-listings-list.png),
  [Vintz-Karten](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-listings-cards.png).
- [Vintz-Preisvorschau](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-listings-price-preview.png),
  [Auswahl](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-listings-selection.png).
- [Flipbase-Kleiderschrank](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-vinted-listings-cards.png),
  [Flipbase-Verwaltung](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-marketplace-listings-table.png).
- [Vintz mobil, Karten](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-listings-mobile.png),
  [Vintz mobil, Liste](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-listings-mobile-list.png),
  [Flipbase-Verwaltung mobil](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-marketplace-listings-mobile.png).

Die temporäre Größe wurde zurückgesetzt. Vintz endet wieder mit allen Konten,
aktiven Angeboten, leerer Suche, Listenansicht, ohne Auswahl oder offenen Dialog.
Die lokale Preisvorschau wurde verworfen und der Originalpreis 29,99 Euro
kontrolliert. Flipbases Suche und Auswahl sind geleert, der zusätzliche
Kontoabschnitt wieder zugeklappt. Fachliche Einstellungen, Preise, Inserate
und Automatisierungen wurden nicht geändert.

**Stopp zur Besprechung.** Empfehlungen sind Vorschläge, keine freigegebene
Umsetzung. Kein Funktionsbereich außerhalb dieser Übersicht wird fortgesetzt.
