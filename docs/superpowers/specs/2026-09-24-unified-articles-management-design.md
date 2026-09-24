# Eine Artikelseite mit Bestand und Artikelaktionen

Stand: 24. September 2026. Der Entwurf wurde im Gespräch freigegeben.

## Ziel und feste Entscheidungen

Der Bereich „Artikel“ bekommt einen verständlichen Einstieg mit einer Tabelle.
Ein angelegter Artikel ist dort auffindbar und kann sichtbar bearbeitet,
archiviert und unter engen Bedingungen gelöscht werden. Ein Artikel ohne
Wareneingang bleibt mit Bestand null sichtbar. Unterschiedliche gebrauchte
Einzelstücke bleiben getrennte Artikel; gleiche Titel oder EAN lösen keine
Zusammenführung aus.

Archivieren ist auch bei vorhandenem Bestand möglich. Es ändert weder Menge
noch Bestandswert noch Belege oder Buchungen. Löschen ist nur für einen
vollständig unbenutzten Artikel ohne Einkaufs-, Bestands-, Verkaufs- oder
Inseratsbezug zulässig. Ein aktives Inserat oder eine offene Reservierung
muss vor dem Archivieren geklärt werden.

## Ausgangslage

- `/catalog` zeigt bereits Stammartikel und eigenständige ältere
  `inventory_items` in einer abgeleiteten Liste. Bisher zeigt diese nur die
  verfügbare Menge; ein expliziter Bearbeiten-Einstieg fehlt.
- `/inventory` zeigt zusätzlich Lagerbestand, Reservierungen, Wert, Herkunft
  und Aktionen. Die Sidebar trennt beide Ansichten mit „Alle Artikel“ und
  „Bestand“. Die ältere Regel in `docs/design/admin-ui-guidelines.md` beschreibt
  diese Trennung und wird bei der Umsetzung aktualisiert.
- Der Stammartikel unter `/catalog/:id` lässt sich bereits bearbeiten. Ältere
  Einzelstücke haben einen eigenen Detail- und Bearbeitungsweg unter
  `/inventory/:id`.
- `catalog_products` hat noch keinen Archivstatus. Die vorhandene
  `set_inventory_item_archived`-Funktion erlaubt die Archivierung nur für
  eindeutig verkaufte Einzelstücke. Bestehende Mengenberechnungen setzen
  archivierte Einzelstücke teilweise auf null; das muss für physisch
  vorhandene Stücke korrigiert werden.
- Produktbilder liegen in privatem Storage. Die Löschrechte für deren Dateien
  setzen derzeit voraus, dass der zugehörige Stammartikel noch existiert.

## Navigation und Tabelle

Die Sidebar zeigt einen einzigen Eintrag „Artikel“ mit Ziel `/catalog`, ohne
die Unterpunkte „Alle Artikel“ und „Bestand“. `/catalog` bleibt die kanonische
Listenadresse. Alte Aufrufe von `/inventory` leiten auf die Artikeltabelle mit
aktivem Bestandsfilter weiter; vorhandene Links zu `/inventory/:id` bleiben für
ältere Einzelstücke gültig. `/inventory/new` führt zur einheitlichen
Artikelerstellung `/catalog/new`. Bestehende externe Detail-Links werden nicht
durch eine unsichere automatische Zuordnung umgeschrieben.

Die Tabelle verwendet den vorhandenen `DataTableComponent` samt Suche,
Spalteneinstellungen, Lade-, Fehler- und Leerzuständen. Jede Zeile steht für
genau eine vorhandene Artikelidentität: einen `catalog_products`-Datensatz
oder ein eigenständiges älteres `inventory_items`-Stück. Über eine gespeicherte
Einkaufsposition verknüpfte Einzelstücke werden dem Stammartikel zugeordnet
und erscheinen nicht doppelt. Unklare Beziehungen werden als „Zu prüfen“
angezeigt, nicht nach Titel oder Barcode geraten.

Standardspalten sind „Artikel“ mit Bild und Titel, „Auf Lager“, „Verfügbar“,
„Status“ und „Aktionen“. Einblendbar sind EAN, Kategorie, Marke, Zustand,
„Reserviert“, Herkunft, Stückkosten und Bestandswert, soweit sie für die Zeile
verlässlich ermittelt werden können. Fehlende oder widersprüchliche Mengen
heißen „Zu prüfen“ und werden nicht als null dargestellt. Suche, Sortierung
und Spaltenreihenfolge bleiben pro Workspace gespeichert. Die Ansichten
„Aktiv“, „Archiv“, „Alle“, „Auf Lager“, „Ohne Bestand“ und „Zu prüfen“ sind
Filter derselben Tabelle; die Archivansicht zeigt auch archivierte Artikel mit
Bestand. Mobil sind dieselben Angaben und Aktionen erreichbar.

Die Tabelle ist eine operative Übersicht. Sie ersetzt weder einen
stichtagsbezogenen Inventurbeleg noch die Buchungs- und Kostenhistorie.

## Mengen und Status

„Auf Lager“ bezeichnet die physisch vorhandene Menge aus den bestehenden
Bestandsquellen. Archivieren lässt diese Menge und ihren Wert unverändert.
„Verfügbar“ bezeichnet die für neue Verkaufsvorgänge nutzbare Menge; bei
archivierten Artikeln ist sie null, obwohl „Auf Lager“ größer null sein kann.
Reservierungen bleiben getrennt sichtbar. Ein als verkauft verbuchtes
Einzelstück hat unabhängig vom Archivstatus keinen Lagerbestand. Ein
Archivstatus darf einen ungeklärten Verkaufs- oder Bestandszustand nicht
überdecken; der Hinweis „Zu prüfen“ bleibt sichtbar.

Archivstatus und bestehender fachlicher Artikelstatus sind getrennte Felder.
Für Stammartikel wird `archived_at` samt Akteur eingeführt. Für ältere
Einzelstücke wird die vorhandene Archivmetadatenfunktion erweitert, ohne den
fachlichen Status künstlich auf „verkauft“ oder „archiviert“ zu setzen.
Bestandsberechnungen, Berichte und Wertanzeigen lesen die tatsächlichen
Buchungen und Mengen; nur die Verkaufbarkeit berücksichtigt zusätzlich den
Archivstatus.

## Bearbeiten und Archivieren

Jede Zeile erhält eine beschriftete Aktion „Bearbeiten“. Sie öffnet den
bestehenden passenden Editor und zeigt den Rückweg zur Artikeltabelle.
Artikelstammdaten bleiben dort mit den bisherigen Prüfungen speicherbar.
Gebuchte Mengen, Einstandskosten, Verkäufe und Belege werden nicht über
Stammdatenfelder rückwirkend geändert. Ein nicht gespeichertes Formular
behält den vorhandenen Verlassensschutz.

„Archivieren“ und „Wiederherstellen“ sind bestätigungspflichtige Aktionen.
Eine gesicherte Datenbankfunktion prüft Mitgliedschaft, Workspace-Zustand,
Artikelidentität und aktuelle Abhängigkeiten in derselben Transaktion. Sie
setzt ausschließlich Archivmetadaten und schreibt ein nachvollziehbares
Ereignis. Das Archivieren wird abgelehnt, wenn für den Artikel ein vorbereitetes
oder aktives Inserat, eine offene Reservierung oder ein offener
Verkaufs-/Shopauftrag besteht. Beendete Inserate und abgeschlossene Verkäufe
bleiben erhalten. Flipbase beendet keine Inserate automatisch.

Archivierte Artikel bleiben über „Archiv“ und direkte Detail-Links sichtbar
und ihre Stammdaten bearbeitbar. Sie werden in Auswahlfenstern für neue
Einkaufspositionen, Verkäufe und Inserate nicht angeboten. Serverseitige
Schreibwege lehnen neue Verkaufs- und Inseratsvorgänge mit archivierten
Artikeln ebenfalls ab. Wiederherstellen macht einen Artikel nur dann erneut
verkaufbar, wenn sein übriger Zustand dies zulässt; es erzeugt keinen Bestand.
Der Fehlerdialog nennt bei gesperrter Archivierung den konkreten offenen
Vorgang, damit er zuerst bearbeitet werden kann.

## Löschen unbenutzter Artikel

Die Aktion „Löschen“ erscheint nur, wenn die aktuell geladenen Daten einen
unbenutzten Artikel vermuten lassen. Sie erhält einen gesonderten Dialog mit
Artikelname und Hinweis auf die endgültige Entfernung. Die Anzeige ist keine
Berechtigungsentscheidung: Eine transaktionale, auf Workspace und Artikel
begrenzte Datenbankfunktion prüft beim Ausführen erneut sämtliche fachlichen
Bezüge. Dazu gehören insbesondere Einkaufspositionen, Einzelstücke mit
Kaufbezug, Lagerlose und -bewegungen, Bestandspositionen, Verkaufspositionen,
Reservierungen, Shopaufträge sowie Inserate jeder Statusstufe. Verknüpfte
Artikel dürfen auch bei aktuellem Bestand null nicht gelöscht werden. Eine
gleichzeitige neue Verknüpfung darf die Prüfung nicht umgehen; Sperren und
Fremdschlüssel sichern die Operation ab. Bei einem Bezug wird nichts
gelöscht und eine verständliche Begründung angezeigt.

Eigene Bilder eines sonst unbenutzten Artikels verhindern das Löschen nicht.
Die Funktion entfernt Bildmetadaten und Artikel in einer Datenbanktransaktion
und hinterlegt die exakten privaten Dateipfade in einer geschützten
Aufräumwarteschlange. Ein berechtigter Hintergrundschritt löscht diese Dateien
aus Storage und wiederholt vorübergehende Fehler. Die Warteschlange hat RLS,
explizite Rollenrechte und prüft Workspace, Bucket und kanonischen Pfad; der
Service-Role-Schlüssel bleibt ausschließlich serverseitig. Das ist nötig,
weil die heutigen Storage-Rechte nach Entfernung des Artikels kein Löschen
durch den Browser mehr zulassen. Bei älteren Einzelstücken gilt dieselbe
Regel für ihre Medien und Bezüge. Ein nicht bereinigtes Bild ist als Fehler
sichtbar und erneut bearbeitbar, kein stiller Erfolg.

Ein Löschereignis mit Artikel-ID und Titelsnapshot bleibt als technischer
Nachweis erhalten. Es enthält keine erfundene Buchung. Die Oberfläche zeigt
für solche Ereignisse „Gelöschter Artikel“ statt eines defekten Detail-Links.
Fachliche Historie wird niemals kaskadierend mitgelöscht; die heutigen
`on delete cascade`-Beziehungen der Inserate werden durch die vorherige
Bezugssperre nicht als Löschmechanismus benutzt.

## Umsetzungsschnittstellen

Ein fachlicher Zeilenadapter im Artikel-Feature führt Katalogdaten,
Bestandsansicht und ältere Einzelstücke für die Darstellung zusammen. Er
enthält keine Datenbankabfragen. Dedizierte Feature-Services laden Daten und
führen Archiv- und Löschaktionen aus; UI-Komponenten greifen nicht direkt
auf Tabellen zu. Die neuen Datenbankregeln liegen in thematisch getrennten
Dateien unter `supabase/schemas/`; die Migration wird daraus erzeugt,
anschließend geprüft und mit den generierten Typen im selben PR eingereicht.
Vorhandene SQL-Schreibwege für Inserate, Verkäufe, Shopaufträge und
Artikelauswahl werden auf den Archivstatus abgestimmt. Die bestehende
Produktreferenz auf `archived_at` in `230_listings.sql` wird mit der tatsächlichen
Tabellendefinition abgeglichen.

Die ältere Bestandsliste liefert ihre fachlichen Berechnungen und Aktionen
an die gemeinsame Artikelseite; es entsteht keine zweite aktive
Bestandstabelle unter neuer Adresse. Nicht zu diesem Umbau gehören eine
automatische Zusammenführung historischer Artikel, ein neues Variantenmodell,
neue Inventurbuchungen oder eine Änderung der Kosten- und Verkaufsregeln.

## Fehlerfälle und Prüfung

- Tabellen und Detailseiten zeigen Ladefehler mit Wiederholen, leere Treffer
  und unbekannte Mengen unterscheidbar an. Ein Workspace-Wechsel verwirft
  veraltete Antworten und verhindert Aktionen im alten Workspace.
- Während Archivieren, Wiederherstellen oder Löschen läuft, ist die jeweilige
  Aktion gesperrt. Nach Erfolg werden Liste, Bestandsanzeige und Detailstatus
  aktualisiert; nach Fehler bleiben sie unverändert.
- Tests prüfen Zeilenidentität und keine automatische Zusammenführung,
  Bestand null, unbekannte Mengen, Lager- und Wertkonstanz bei Archivierung,
  Verkaufbarkeit null im Archiv sowie Rückkehr nach Wiederherstellung.
- Datenbanktests prüfen Mitgliedschaft, archivierten Workspace, parallele
  Verknüpfung, alle fachlichen Löschsperren, aktive Inserate/Reservierungen,
  wiederholte Aktionen, Medienwarteschlange und fehlgeschlagene Bereinigung.
- Angular-Tests prüfen sichtbare Aktionen, Dialoge, Filter, alte Links,
  Workspace-Wechsel, Tastaturbedienung und Fokus nach Dialogschluss. AXE,
  gezieltes Lint/Format und der Angular-Produktionsbau gehören zur Abnahme.

## Einordnung der Aufzeichnungspflichten

Die Oberfläche darf Artikel und Bestand gemeinsam zeigen. Die getrennte
Nachvollziehbarkeit von Geschäftsvorfällen, Inventur, Belegen und Werten bleibt
erforderlich; diese Spezifikation ändert sie nicht. Die gemeinsame Tabelle
ist keine rechtliche Aussage über eine abgeschlossene Inventur.

- [§ 238 HGB](https://www.gesetze-im-internet.de/hgb/__238.html)
- [§ 240 HGB](https://www.gesetze-im-internet.de/hgb/__240.html)
- [§ 146 AO](https://www.gesetze-im-internet.de/ao_1977/__146.html)
- [Shopify: Bestand anzeigen](https://help.shopify.com/en/manual/products/inventory/adjusting-inventory/viewing-inventory)
- [WooCommerce: Produkte filtern](https://woocommerce.com/document/managing-products/feature-filter-and-sort-products/)
