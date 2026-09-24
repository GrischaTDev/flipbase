# Verbindliche Gestaltungsgrundlage der Verwaltungsoberfläche

Stand: 6. September 2026. Diese Dokumentation ergänzt die Projektregeln; sie beschreibt den Zielstandard, nicht den bereits vollständig umgesetzten Zustand.

**Live-Referenz verfügbar:** Der angemeldete Admin wurde inzwischen über zahlreiche Seiten und Komponentenfamilien geprüft. [Messprotokoll mit Seitendeckung, CSS-Werten und offenen Zuständen](shopify-admin-live-reference.md). Diese konkreten Messungen haben Vorrang vor früheren vorläufigen Größenannahmen.

## Auftrag und Rangfolge

Der Nutzer möchte das sichtbare Shopify-Admin-Design möglichst **1:1** treffen: Formen, Radien, Abstände, Typografie, Schatten, Dichte, Zustände und Bewegungen. Eine bloß lose Inspiration oder pauschales „kompakter machen“ genügt nicht. Flipbase-Logo und das helle Logo-Gelb bleiben erhalten; eigene Icons und Angular-Implementierung sind zulässig. Shopify-Originalpakete und Assets werden nicht ohne passende Nutzungsgrundlage übernommen. Selbst geschriebener Code ist keine automatische rechtliche Freigabe einer identischen Produktdarstellung; diese Frage bleibt vom technischen Messauftrag getrennt.

Rangfolge bei Gestaltungsentscheidungen:

1. Ausdrückliche Nutzerentscheidungen: Logo-Gelb; hohe Referenztreue; Steuer/DATEV vorerst nur als Tabelle.
2. Geprüfte Messung des aktuellen Shopify-Admins für die entsprechende Komponentenrolle und den entsprechenden Zustand.
3. Aktuelle offizielle Designrichtlinien und Komponentenbeschreibung, mit Version und Quelle.
4. Als solche bezeichnete vorläufige Vorschläge. Sie sind keine verbindlichen Shopify-Maße.

Barrierefreiheit und korrekte Fachabläufe bleiben verbindlich. Ein Konflikt wird dokumentiert und gelöst, nicht durch unbemerkte Designänderung übergangen. Ohne gemessene Referenz darf niemand behaupten, eine Oberfläche sei pixelgenau abgeglichen.

## Verbindliche Shared-Komponenten-Grenze

Wiederkehrende sichtbare Grundelemente der Verwaltungsoberfläche werden zentral unter `src/app/shared/components/` umgesetzt. Feature-Templates setzen diese Bausteine zusammen und liefern Fachwerte, Labels, Form-Controls, Validierung und Ereignisse. Sie definieren keine eigenen Varianten für Geometrie, Radius, Rahmen, Schatten, Typografie, Fokus oder semantische Statusfarben, wenn dafür bereits eine Shared-Komponente existiert.

Das gilt insbesondere für Buttons, Statusbadges, Text-/Such-/Zahl-/Datumsfelder, Selects, Checkboxen, Karten, Dialograhmen, Seitenköpfe, Tabellenleisten, Sortierung, Spaltenauswahl, Kostenanzeige, Chronik und Toasts. Bestehende Komponenten werden erweitert, wenn eine wiederkehrende Variante fehlt. Eine zweite parallele Komponente für dieselbe Bedienrolle ist unzulässig.

Rohe native Formelemente gehören in die verantwortliche Shared-Komponente. Im Feature sind sie nur für einen konkret dokumentierten Sonderfall zulässig, etwa ein technisch notwendiges verstecktes Datei- oder Radioelement, das der Komponentenvertrag nicht sinnvoll kapseln kann. Ein Sonderfall darf nicht durch kopierte `linear-input`-, Button-, Badge- oder Fokusklassen als eigene Designvariante entstehen.

Eine wiederkehrende Kombination wird als Shared-Komposition angelegt, sobald mindestens zwei Features dieselbe Bedienrolle besitzen. Einmalige fachliche Teilmasken bleiben im Feature, verwenden für ihre sichtbaren Grundelemente aber die Shared-Bausteine. Der Storefront-Bereich besitzt einen anderen Oberflächenkontext und wird nicht blind an Admin-Maße angeglichen; Wiederholungen werden auch dort innerhalb des eigenen Kontexts zentral gelöst.

Neue oder geänderte Admin-Oberflächen müssen eine automatisierte Architekturprüfung bestehen, die neue native Select-Nachbauten und lokale Status-Pills erkennt. Notwendige Ausnahmen werden pfadgenau mit Begründung geführt. Ein vorhandener Altbestand ist kein Freibrief für neue Abweichungen und wird bei den betroffenen Arbeiten schrittweise abgebaut.

## Verbindlicher Tabellen- und Listenstandard

Nutzerfestlegung vom 19.09.2026: Verwaltbare Datenlisten im Admin verwenden
`DataTableComponent` als gemeinsamen Rahmen. Feature-Seiten liefern Daten,
Spalten, fachliche Filter, Zeileninhalte und Aktionen, definieren aber nicht mehr
selbst die Geometrie der Tabellenleiste oder die Position der Bedienelemente.

Die Reihenfolge in der Tabellenleiste ist verbindlich:
**Ansicht/Status → Suche → fachliche Filter → Spalten/Sortierung**. Die Suche nimmt
den flexiblen Platz ein; das Spalten-/Sortiermenü steht, sofern die Tabelle
konfigurierbare Spalten besitzt, am rechten Ende. Suchfeld und Toolbar-Selects
sind bereits im Ruhezustand durch eine sehr dezente neutrale Fläche und einen
leichten Rahmen als bedienbare Elemente erkennbar. Hover verstärkt diesen
Zustand nur, statt ihn erstmals sichtbar zu machen.

Nutzerpräzisierung vom 24.09.2026: Das gemeinsame Suchfeld zeigt nur seine
eigene Zurücksetzen-Aktion, kein zusätzliches Browser-X. Fachliche Filter
tragen handlungsorientierte Beschriftungen; interne IDs bleiben bei der Auswahl
und in sichtbaren Filterelementen unsichtbar.

Für die Einkaufsliste zeigt ein zentrierter, nicht klickbarer orangefarbener
Badge „Filter aktiv“ oberhalb der Tabelle eine aktive Suche, Status- oder
Verkäuferfilterung an. Ein zusätzlicher wegklickbarer Verkäuferchip entfällt.
Reine Sortier- und Spaltenänderungen lösen diesen Hinweis nicht aus; die
bestehende Rücksetzung bleibt unverändert.

Feature-Templates verwenden `TableColumnMenuComponent` und die frühere
`TableToolbarComponent` nicht direkt. `DataTableComponent` kapselt
Tabellenfläche, Toolbar, Suche, optionales Spalten-/Sortiermenü sowie Lade-,
Fehler- und Leerzustände. Fachliche Filter werden über die vorgesehenen
Projektionsbereiche eingesetzt und dürfen deren Reihenfolge nicht umgehen.

Kleine statische Tabellen wie CSV-Vorschauen, Druckansichten, reine
Detailaufstellungen und Berichtstabellen brauchen keine künstliche
Such-/Filterleiste. Solche Tabellen werden in der automatisierten Shared-UI-
Prüfung ausdrücklich und eng als statisch klassifiziert. Eine pauschale
Ausnahme für ganze Features oder Verzeichnisse ist unzulässig.

Die Sidebar führt mit einem Eintrag „Artikel“ zu einer gemeinsamen Tabelle.
Aktive, archivierte und bestandsbezogene Ansichten sind Filter dieser Tabelle.
Artikel ohne Bestand bleiben sichtbar; Mengen, Verfügbarkeit und Bestandswert
werden als getrennte Angaben gezeigt. Bearbeiten, Archivieren und das nur für
unbenutzte Artikel erlaubte Löschen sind direkt an der Zeile erreichbar.

Die Architekturprüfung `scripts/check-admin-shared-ui.mjs` schützt diesen
Vertrag: direkte Spaltenmenüs, die alte Tabellen-Toolbar, native Suchfelder an
verwaltbaren Tabellen und nicht klassifizierte Tabellenvarianten werden als
Abweichung gemeldet.

## Verbindliche Präzisierung: Schreibweise und Farbdisziplin

Nutzerfestlegung vom 06.09.2026: Seiten-, Karten-, Abschnitts- und Tabellenüberschriften sowie Feldbeschriftungen verwenden normale deutsche Groß-/Kleinschreibung. Keine dekorative Versalschrift durch `uppercase`, keine künstlich gesperrten Überschriften durch `tracking-wider`/`tracking-widest`. Fachliche Kürzel wie SKU, EAN, EUR und DATEV bleiben korrekt geschrieben; Eingaben, Marken und Kennungen werden nicht pauschal kleingeschrieben. Auch Badges erhalten keine automatische Versalschrift.

Neutrale Hintergründe, weiße beziehungsweise themegerechte Karten, dezente Rahmen und einheitliche Textfarben dominieren. Farbe kennzeichnet Bedeutung: Statusbadges, erforderliche Hinweise, Fehler und die bestehenden primären Markenaktionen. Keine dekorativ wechselnden Indigo-, Violett-, Grün- oder Orangeflächen an Karten, Titeln, Icons oder normalen Beträgen. Statusfarben zentral und in allen Bereichen mit derselben Bedeutung verwenden; Text/Symbol ergänzt die Farbe. Das ausdrücklich festgelegte Logo-Gelb `#fcc601` bleibt bestehen.

Nutzerpräzisierung vom 18.09.2026: Das helle Admin-Theme verwendet das echte
Flipbase-Gelb auch sichtbar für aktive Navigation und Brand-Badges; stumpfe
Gold-/Brauntöne sind dafür keine Ersatz-Markenfarbe. Weil `#fcc601` als Text
auf hellem Grund nicht genügend Kontrast hat, liegt das Gelb dort auf der
abgerundeten aktiven Fläche beziehungsweise ihrem Rahmen und die Beschriftung
bleibt dunkel. **Keine zusätzliche Seitenlinie, kein farbiger Innenstrich und
keine Unterstreichung am aktiven Menüpunkt**; der aktive Menüeintrag bleibt
dieselbe ruhige, vollflächige Navigation wie im übrigen Admin. Der Plattform-
Admin-Badge ist eine bewusst auffällige Rollenkennzeichnung und bleibt kräftig
rot; er darf nicht in die normale Brand-Farbe umgefärbt werden. Bildoptimierer,
Fotoguide und andere Spezialoberflächen verwenden dieselben zentralen
Theme-Farben und Shared-Komponenten statt eigener Indigo-, Sky-, Amber- oder
sonstiger Parallelpaletten. Der Fotoguide verwendet den gemeinsamen
`ModalShellComponent`. Sichtbare Upload-Aktionen verwenden ebenfalls den
`ButtonComponent`; ein verstecktes natives `input[type='file']` darf nur
den technischen Dateiauswahldialog bereitstellen und bekommt keine eigene
Button-Gestaltung.

Nutzerentscheidung vom 23.09.2026: Das Admin-Badge verwendet dasselbe kräftige
Rot wie die Ausgaben-Säule im Dashboard. Hervorgehobene Finanzwerte in Tabellen
sind bei positivem Ergebnis grün und bei negativem Ergebnis rot; die Textfarben
sind für helle und dunkle Tabellenflächen kontrastgerecht abgestuft. Gewöhnliche
Kosten, Nullwerte und noch nicht berechenbare Ergebnisse bleiben neutral. Die
Gewinn-Kachel im Dashboard verwendet dieselben Finanztextfarben wie das
Verkaufsjournal; die Säule behält ihr kräftigeres Diagrammgrün.

Nutzerentscheidung vom 24.09.2026: Aktive Menüeinträge verwenden in beiden
Themes eine vollflächige gelbe Markierung mit dunkler Schrift und ohne sichtbare
Kontur. Statusbadges nutzen ruhige Farbflächen mit kräftiger, kontrastreicher
Schrift: Jadegrün für Erfolg, Orange für Bestellt/Warnung, Rot für kritische
Zustände, Gelb für Angekommen, kühles Info-Blau für Entwurf und Grau für
neutrale Zustände. Die Farbpaare sind für helles und dunkles Theme getrennt;
alle Badge-Schriftfarben erfüllen auch bei kleiner Schrift WCAG AA. Das
Flipbase-Gelb `#fcc601` bleibt für Marke, primäre Aktionen und aktive
Navigation unverändert. Der Admin-Rollenbadge bleibt kräftig rot. Ruhige
Hinweis- und Dialogflächen behalten ihre bisherigen Statusvariablen. In der
schreibgeschützten Einkaufsansicht stehen Kaufdatum, Referenznummer und
Beschreibung wie in der Erfassung gesammelt rechts unter „Einkaufsdetails“;
Verkäufer und Bezugsquelle bleiben links. Doppelte Referenz- und Notizangaben
entfallen.

Einkaufserfassung und -details folgen der sichtbaren Shopify-Referenz in Anordnung und Proportionen: zentrierter Seitenbereich, breite Positionskarte links, schmalere Kosten-/Detailkarten rechts, Chronik unter dem Arbeitsbereich. Eigene Verkäufer-, Paket- und Kostenfunktionen in diese Struktur integrieren. Visuelle Abnahme bei vergleichbarer Fenstergröße gegen Referenz einschließlich Feldern, Dialogen, Tabellen, Leerzuständen, Radien, Schatten und Bewegung; gemessene Abweichungen dokumentieren.

Präzisierung vom 07.09.2026: Erstellen, Ansicht und Bearbeiten verwenden denselben Seitenrahmen und dieselbe Zweispalten-Komposition. Die Chronik liegt unter den Positionen **innerhalb der linken Spalte**, nicht über die gesamte Seitenbreite. Bearbeiten öffnet die gemeinsame Erfassungsmaske im Arbeitsbereich; gespeicherte Einkäufe behalten Chronik und relevante Zusatzinformationen. Keine separate Einkaufsart-Auswahl: Inhaltskenntnis und Preisführung sind unabhängige Einstellungen. Technische Altdaten-Typen werden dadurch nicht ungeprüft entfernt.

Die Kostenübersicht verwendet eine gemeinsame fachliche Komposition aus Shared-Elementen. „Kostenübersicht verwalten“ enthält flache Zeilen mit Anpassungsart, Betrag und Entfernen sowie „Anpassung hinzufügen“. Rabatt ist eine Anpassungszeile, kein zusätzliches dauerhaftes Sonderfeld und keine positive Kostenbuchung. Dialogänderungen bleiben bis „Speichern“ vorläufig; „Abbrechen“, Schließen und Escape verwerfen sie. Primäre Speichern-/Posten-Aktionen bleiben gelb; eine schwarze Primärvariante ist nicht vorgesehen und wird automatisiert beanstandet.

Präzisierung vom 08.09.2026: Auswahlmenüs müssen über dem Modal-Inhalt und dessen Footer sichtbar und anklickbar bleiben. Die Shared-Auswahl nutzt dafür die native oberste Popover-Ebene ([Browservertrag](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover)); ein höherer `z-index` innerhalb eines abschneidenden Containers genügt nicht. Escape schließt zuerst die Auswahl, nicht den Dialog; der Fokus bleibt am Auslöser. Bei Scrollen des Ankers oder Fenstergrößenänderung schließt die Auswahl. Tests prüfen die tatsächliche Treffbarkeit per Hit-Test und nicht allein DOM-Sichtbarkeit.

Kopfaktionen verwenden gemeinsame Größen und erkennbare sekundäre Flächen; die Hauptaktion steht ganz rechts. Zurück-Pfeil, Nummer und Status sind vertikal zentriert. Der Altbestands-Kostenreparaturablauf entfällt auf ausdrücklichen Nutzerwunsch; dies ist keine Freigabe zum Löschen von Geschäftsdaten.

Gespeicherte Einkaufsentwürfe öffnen unmittelbar dieselbe editierbare Maske wie die Neuanlage. Keine zusätzliche Nur-Ansicht-Tabelle, Spaltenanpassung oder „Artikel bearbeiten“-Zwischenaktion für Entwürfe. Speichern/Verwerfen erscheinen bei Änderungen; statusverändernde Aktionen arbeiten ausschließlich mit gespeicherten Angaben. Wareneingang und Tracking bleiben als fachliche Zusatzbereiche erhalten, abgeschlossene Einkäufe behalten ihre Sperren. Die Chronik liegt weiterhin links, zeigt bei Systemereignissen Uhrzeit und Akteur und behält ungesendete Kommentare beim Speichern des Einkaufs. Fehlende Ereignisse dürfen nicht aus aktuellen Daten als vermeintliche historische Vorgänge konstruiert werden.

Shared-Buttons: Standard und schmal 28 px Höhe, große Variante 32 px; Schrift bewusst mindestens 13 px bei 16 px Zeilenhöhe. Die Desktophöhe folgt dem Live-Messprotokoll, die Mindestschrift bleibt eine Zugänglichkeitsentscheidung. Auf Geräten mit grobem Zeiger sind Ziele mindestens 44 × 44 px. Interne Navigationsaktionen können dieselbe Komponente als semantischen Link verwenden. Globale Adminregeln überschreiben diese Größen nicht. Die Chronik behält ihren Aufbau mit einer 32-px-Kommentarfläche und rund 102 px Composerhöhe; diese Verdichtung ist eine Nutzeranpassung, kein behauptetes Originalmaß der Shopify-Chronik.

Nutzerpräzisierung vom 08.09.2026: Shared-Badges zeigen ausschließlich den Status als Text, ohne führenden Punkt, Quadrat, Icon oder Pulsieren. Diese Entscheidung ersetzt frühere Marker-Vorgaben aus dem Tabellenplan und weicht bewusst von der Shopify-Referenz ab. Die alten Marker-/Icon-/Versalschrift-Eingänge entfallen gemeinsam mit allen Aufrufern. Statusfarben und Größen bleiben zentral; Kennungen und Kürzel behalten ihre originale Schreibweise. Chronikpunkte und Diagrammlegenden sind keine Badges und bleiben unberührt. Eine globale CSS-Übersteuerung ersetzt diese Komponentenregel nicht.

## Markenfarbe: nachgewiesener Stand

| Gegenstand                 | Beleg                                                                                                                                              | Konsequenz                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Ursprüngliches Logo-Symbol | Seit Commit `1e659bc` vom 22.08.2026 unverändert; `public/images/logo-mark.png` und `logo-mark-192.png`                                            | Diese Bilddateien sind die konkrete Farbreferenz                                                                                            |
| Helles Gelb                | RGB `252, 198, 1` = `#FCC601` ist im 96-px-Symbol 189-mal als nahezu vollständig deckender Pixel vorhanden                                         | `--fb-brand-yellow: #fcc601` ist ein tatsächlich im Logo vorkommender Referenzton                                                           |
| Verlauf und Skalierung     | Benachbarte häufige Töne sind `#FCC501`, `#FCC701`, `#FCC801`; auch Orange ist enthalten. Die 192-px-Version hat eine andere Häufigkeitsverteilung | Keine Behauptung, das gesamte Logo habe exakt eine Farbe. Kein Mittelwert über Gelb und Orange zur Buttonfarbe machen                       |
| Frühere Buttons            | `e603458` vom 22.08.2026 setzt den dunklen Aktionsakzent auf `#F89D13`; damals auch Verlaufsbuttons. Heller Basisakzent war Indigo                 | „Früher war alles exakt dasselbe Gelb“ ist durch diese Historie nicht belegt                                                                |
| Gelbe Navigation           | `238eba6` fügt am 06.09.2026 `#FCC601` als Markentoken ein                                                                                         | Markentoken zentral weiterverwenden                                                                                                         |
| Gelbe Admin-Buttons        | `399a5e0`, in Master `04def2e`, bindet primäre Adminaktionen in beiden Themes daran                                                                | Normalzustand ist dort bereits das gemessene Gelb; der laufende ältere Feature-Branch ist kein zuverlässiger Beleg für den aktuellen Master |
| Hover                      | Aktueller Master verwendet `#E5B201`                                                                                                               | Dokumentierter dunklerer Zustand, keine nachgewiesene ursprüngliche Logo-Festlegung. Bei Referenzabnahme gesondert prüfen                   |

Messverfahren: PNG als RGBA lesen; Pixel mit Alpha >245, Rot >220, Grün >150 und Blau <100 zählen; Originaldateien unverändert lassen. `logo-640.png` ist eine andere Darstellung mit Wortmarke/Verlauf und darf nicht als pauschaler Farbdurchschnitt verwendet werden.

**Regel:** Normale primäre Buttons benutzen das helle `#FCC601` mit dunkler Schrift. Kein Wechsel zu Orange, Goldbraun, einem Tailwind-Standardgelb oder einem geschätzten Farbwert. Hover, Pressed, Disabled und Fokus sind eigene Zustände; sie dürfen den Basiston nicht ersetzen. Transparenz, Gradienten und farbige Schatten sind Teil der Farbabnahme, weil sie den sichtbaren Eindruck verändern. Bestehende Statusfarben nicht über denselben Markentoken umdefinieren.

## Quellen und dokumentierte Übertragung

Die folgenden Abschnitte decken die aufgerufenen Hauptkapitel der App Design Guidelines ab. Sie sind eine thematische Arbeitsgrundlage für Flipbase, keine vollständige Kopie aller Shopify-API- und Unterseiten. Detail-APIs werden vor der jeweiligen Umsetzung nachgeschlagen. Der aktuelle Admin-Zustand muss zusätzlich gemessen werden.

### Ziele und Grundprinzipien

Vorhersehbare Bedienung, kurze Wege zur Aufgabe, mobile Nutzbarkeit und Zugänglichkeit für unterschiedliche Nutzer sind die Leitziele. Gestaltung soll Arbeitsabläufe erleichtern und auf allen Seiten dieselben Erwartungen erfüllen. Für Flipbase heißt das: gleiche Aktion, gleiche Darstellung und gleiche Rückmeldung. Ein grüner Build ersetzt keine visuelle Abnahme. [App Design Guidelines](https://shopify.dev/docs/apps/design)

### Seitenaufbau und Navigation

Globale Navigation, Seitentitel und inhaltliche Aktionen haben getrennte Aufgaben. Detailseiten bieten einen Rückweg. Vollflächige Arbeitsbereiche passen zu aufwendigen Editoren; beim Verlassen mit ungespeicherten Änderungen muss der Nutzer entscheiden können. Keine unnötigen Bestätigungen bei unverändertem Inhalt. Die Shopify-eigene Einbettungs- und Extension-Technik wird nicht in Flipbase nachgebaut. [App structure](https://shopify.dev/docs/apps/design/app-structure)

Menüeinträge kurz, substantivisch und nach Aufgaben geordnet benennen. Aktive Seite klar kennzeichnen. Tabs verändern den Inhalt unter sich, bleiben an ihrer Position und brechen nicht in mehrere Zeilen um. Hauptnavigation nicht als zweite Linkliste im Seiteninhalt wiederholen. Headeraktionen beziehen sich auf die aktuelle Seite. Shopify-spezifische App-nav-Grenzen wie die Behandlung ab sieben Einträgen sind keine allgemeine Vorgabe für Flipbases gesamte Sidebar. [Navigation](https://shopify.dev/docs/apps/design/navigation)

### Layout und Dichte

Abstände folgen einem 4-px-Raster. Datenreiche Listen nutzen die verfügbare Breite. Formulare und Einstellungen brauchen eine lesbare, aufgabenbezogene Breite. Unterschiedliche Dichte innerhalb derselben Arbeitsfläche vermeiden. Karten bündeln Zusammengehöriges; höchstens eine visuell primäre Aktion je Karte. Aktionen in Tabellen bleiben zurückhaltend. Einfache Berichtstabellen und verwaltbare Datensammlungen sind unterschiedliche Muster. [Layout](https://shopify.dev/docs/apps/design/layout)

**Flipbase-Abnahme:** Tabellenkopf plus Kinder gemeinsam messen. Eine Zielhöhe am `th` reicht nicht, wenn Sortierbutton und Padding die tatsächliche Zeile höher machen. Fachlich notwendige zweite Zeilen und offene Details ausdrücklich gestalten. Scrollbereiche dürfen Popover nicht abschneiden.

### Visuelle Hierarchie, Schrift, Farbe und Icons

Normaler Text und beschriftete Interaktionen mindestens 13 px; ergänzende kleine Texte mindestens 12 px. Seitentitel muss als Hauptüberschrift erkennbar sein. Neutrale Textfarben dominieren. Status benötigt Text oder Symbol zusätzlich zur Farbe. Finanz- und Warnfarben erfüllen fachliche Aufgaben. Einheitlicher Einsatz von Icons in wiederkehrenden Listen. [Visual design](https://shopify.dev/docs/apps/design/visual-design)

Flipbase behält lokal eingebundenes Inter und Lucide. Die Markenfarbe ist eine ausdrücklich festgelegte Abweichung von Shopifys Aktionspalette. Anordnung, Geometrie und Zustände sollen dennoch anhand der Referenz übereinstimmen. Keine neue Schrift oder Bibliothek als spontane Geschmacksentscheidung.

### Karten, Ecken und Ebenen

Shopifys aktuelle `Section` organisiert zusammengehörige Inhalte; Gestaltung und Überschriften passen sich dem Verschachtelungskontext an. Deshalb ist ein einzelner pauschaler Radius für alle Flächen keine belastbare Ableitung. [Section](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section)

Nachgewiesenes Flipbase-Problem: `src/styles.css` setzt bei `.fb-admin :is(.linear-surface, .linear-card, .linear-card-interactive, .linear-kpi, .card)` `border-radius: 0.5rem`. `CardComponent` bietet gleichzeitig `rounded-md/lg/xl`. Insbesondere Surface-/KPI-Varianten werden damit unabhängig vom gewünschten Radius auf 8 px überschrieben. Andere Varianten und Popover können abweichen.

**Regeln:** Radius getrennt für Karte, Tabellencontainer, verschachtelten Bereich, Feld, Button, Badge, Menü und Dialog dokumentieren. Außen- und Innenecken, Clipping, Trennlinien und Schatten gemeinsam erfassen. Kein globales 8-/12-/16-px-Rezept ohne Messung. Nach der Festlegung müssen Varianten im Komponentenvertrag nachvollziehbar sein; globale Overrides dürfen sie nicht aushebeln.

### Tabellen und Listen

Das Index-Table-Muster kombiniert Suche, Filter, Sortierung und bei passenden Aufgaben Mehrfachaktionen. Für größere Datenmengen wird eine Seitennavigation gebraucht. Titel/Link, Auswahl und Nebenaktion müssen unterscheidbar bedienbar sein. Hover-Aktionen erhalten auch Tastatur-/Touchzugang. [Index table](https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table)

Tabellen können auf schmalen Bildschirmen in priorisierte Listen übergehen. Währungen und Zahlen werden passend ausgerichtet. Datenladezustand und Seitennavigation sind Teil des Komponentenverhaltens. [Table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table)

Zusätzlicher Flipbase-Vertrag: Suche und Filter bleiben bei null Treffern sichtbar. „Keine Treffer“, „Noch keine Daten“, „Lädt“ und „Fehler“ sind getrennte Zustände. Ausgeblendete Spalten ändern keinen Export. Datumssortierung heißt Älteste/Neueste, numerische Sortierung Kleinste/Größte, Textsortierung A–Z/Z–A. Unbekannte Beträge werden nicht als null dargestellt. Persönliche Ansichten müssen Konto- und Workspacewechsel berücksichtigen.

### Buttons und Eingaben

Primäre, sekundäre und weitere Aktionsvarianten vermitteln unterschiedliche Wichtigkeit. Laden verhindert doppelte Auslösung. Navigationslinks und auslösende Aktionen bleiben semantisch unterscheidbar. [Button](https://shopify.dev/docs/api/app-home/latest/web-components/actions/button)

Für Flipbase wird je Variante Normal, Hover, Pressed, Focus-visible, Disabled und Loading geprüft. Icon-only-Buttons benötigen einen zugänglichen Namen. Buttonhöhe, Iconmaß, Abstand zum Text, Rand und Schatten zusammen dokumentieren. Kein pauschales Skalieren aller Buttons beim Drücken ohne Referenzprüfung.

### Formulare und Speichern

Lange Formulare in benannte Abschnitte aufteilen; bei mehr als fünf Eingaben strukturiert gruppieren. Bedingte Eingaben erst zeigen, wenn relevant. Umfangreiche Bearbeitung gehört auf eine eigene Seite, nicht in ein überfülltes Modal. Shopify verwendet eine kontextbezogene Speichernleiste statt stiller automatischer Speicherung großer Formulare. [Forms](https://shopify.dev/docs/apps/design/user-experience/forms)

Flipbase überträgt dieses Bedienmuster mit Angular: Änderungen sichtbar machen, Speichern/Verwerfen anbieten und Datenverlust beim Verlassen behandeln. Vorhandene bewusst automatische Einzelaktionen bleiben als gesonderte Interaktion dokumentiert. Reactive Forms und bestehende Validierungsregeln erhalten.

### Rückmeldungen und Fehler

Banner für anhaltende bzw. übergreifende Informationen, Inline-Meldungen direkt am Problem und kurze Toasts für unkritische Aktionsbestätigung verwenden. Toasts unten mittig und sehr kurz halten; Fehlermeldungen nicht ausschließlich kurz aufblitzen lassen. Warnungen sparsam einsetzen. Fehler erklären das Problem und einen nächsten Schritt. Feldfehler unter dem Feld anzeigen, üblicherweise nach Fokuswechsel oder Absenden statt während jeder Eingabe. Karten-/Dialogfehler gehören an den Anfang des betroffenen Bereichs. Weggeklickte Hinweise nicht ständig erneut anzeigen. [Alerts](https://shopify.dev/docs/apps/design/user-experience/alerts)

Flipbase unterscheidet angefordert, läuft und abgeschlossen. Ein gestarteter Hintergrundauftrag ist noch kein Erfolg. Bestands-/Kostenwarnungen verschwinden nicht aus ästhetischen Gründen. Kein allgemeines Modal nur zum Anzeigen eines gewöhnlichen Feldfehlers.

### Sprache und Inhalt

Kurze verständliche Sätze, scannbare Überschriften und konsistente Begriffe verwenden. Dopplungen von Titel, Beschreibung und Navigation vermeiden. Ton an Situation anpassen: Fehlermeldungen sachlich und hilfreich. [Content](https://shopify.dev/docs/apps/design/content)

Flipbase-Begriffe im Alltag der Anwender halten: Einkauf, Artikel, Bestand, Verkauf und Kosten. Nicht „Request dispatched“ oder interne Datenbankbegriffe anzeigen. Beispiel: „Aktualisierung angefordert“ statt „Kategorien aktualisiert“, solange der Auftrag noch nicht abgeschlossen ist. Screenreader-Namen genauso sorgfältig formulieren wie sichtbare Texte.

### Startseite und Einführung

Die Startseite liefert täglich relevante Kennzahlen, Status und nächste Aktionen. Hilfe ist auffindbar, aber behindert die Arbeit nicht. [App Home page](https://shopify.dev/docs/apps/design/user-experience/app-home-page)

Einführung kurz und zielgerichtet halten; nur notwendige Angaben verlangen, Fortschritt verständlich zeigen und nicht notwendige Schritte überspringbar machen. Shopify empfiehlt höchstens fünf Schritte. [Onboarding](https://shopify.dev/docs/apps/design/user-experience/onboarding)

Für Flipbase: Dashboard auf Handlungsbedarf und verlässliche Kennzahlen konzentrieren. Keine neue Onboarding-Funktion als Nebenaufgabe des Tabellenumbaus hinzufügen.

### Diagramme im Dashboard

Nutzerentscheidung vom 08.09.2026: ApexCharts für den eigenen Betrieb, keine Händlerplattform für Dritte. Jahresumsatz einschließlich verbundener Unternehmen unter 2 Mio. USD bestätigt. Verwendet wird ApexCharts 7.1.0 unter den geprüften [Community-Bedingungen](https://apexcharts.com/license/community/); Lizenzhinweise bleiben im generierten `3rdpartylicenses.txt`. Bei geänderter Nutzung/Umsatzgrenze Lizenz erneut prüfen, keine automatische kommerzielle Lizenz erwerben.

Aktualisierte Nutzerentscheidung vom 23./24.09.2026: Die sechs Dashboard-Kacheln zeigen Umsatz, Einkäufe, Betriebsausgaben, Ausgaben gesamt, Gewinn und Marge; bei ausreichender Breite stehen sie in einer Reihe. Cashflow erscheint nicht mehr im Dashboard. Der Shared-RevenueChart zeigt Umsatz, Ausgaben gesamt und denselben verkaufsbezogenen Gewinn wie die Kachel. Einkäufe umfassen im Zeitraum gekaufte Ware unabhängig vom Verkauf, Betriebsausgaben nur bezahlte allgemeine Kosten; die Gesamtausgaben enthalten zusätzlich direkte Verkaufsgebühren und Versand. Gewinn und Marge bleiben verkaufsbezogen. Bei einzelnen Plattformen bleiben nicht zurechenbare Ausgaben unbekannt. Nicht bestimmbare Werte bleiben unbekannt, echte Nullwerte null und negative Ergebnisse negativ. Auf den Säulen erscheinen keine Betragszahlen und keine Kontur; Detailwerte bleiben per Tastatur, Berührung und zugängliche Datentabelle erreichbar. Umsatz nutzt das Flipbase-Gelb, Ausgaben ein kräftiges Rot und Gewinn ein kräftiges Grün. Die Kachel „Ausgaben gesamt“ zeigt einen bekannten positiven Ausgabenbetrag in kontrastgerechtem Rot; Einkäufe, Betriebsausgaben, Null und unbekannte Werte bleiben neutral. Darstellung, Legende, Tastatur-/Touchdetails und Datentabelle bilden eine gemeinsame Komponente; das Verkaufsjournal bleibt eine semantische Berichtstabelle ohne zusätzliche Grid-Bibliothek. Abschnittsüberschriften verwenden normale Schreibweise, normale Texte mindestens 13 px und ergänzende Angaben mindestens 12 px.

Technische Präzisierung gegenüber dem ursprünglichen Plan: Der geprüfte Angular-Wrapper 3.1.0 bietet keinen vollständigen Fehlervertrag für Import/Konstruktion/Rendern. Daher bindet ein kleiner typisierter Adapter die offizielle ApexCharts-API direkt ein, mit dynamisch geladenem Core-/Säulenmodul (`apexcharts/bar`), Fehleranzeige, Wiederholen und geregeltem Abbau. Keine privaten Wrapper-Hooks, globalen Scripts oder parallele Chart.js-Installation. Diese Abweichung betrifft die technische Einbindung, nicht den vereinbarten sichtbaren oder fachlichen Vertrag. [Offizielle Angular-/Moduldokumentation](https://apexcharts.com/docs/angular-charts/).

### Marketing und Spezialbereiche

Marke zurückhaltend einsetzen; Werbung darf die Arbeit nicht unterbrechen. Promotion ist ausblendbar und nachrangig, beispielsweise unten auf der Startseite oder auf einer separaten Seite. [Marketing](https://shopify.dev/docs/apps/design/user-experience/marketing)

Das Kapitel Subscription apps beschreibt Abonnement-Kaufoptionen für Shopify-Kunden, einschließlich klarer Preise und Anpassung an das Storefront-Theme. Das ist keine Vorgabe, Flipbase um Abonnements zu erweitern. Aktuell nicht Teil des UI-Auftrags. [Subscription apps](https://shopify.dev/docs/apps/design/user-experience/subscription-apps)

### Zugänglichkeit und Bewegung

Native Struktur für Überschriften, Links, Buttons, Navigation und Tabellen verwenden. Sichtbarer Tastaturfokus, Zoom, Skip-Link, eindeutige Labels und Fehlerzuordnung gehören zum Standard. Nicht allein von Hover abhängen. Dynamische Rückmeldungen sind auch ohne Sicht verständlich. Modals erhalten Fokus und begrenzen ihn während der Öffnung; Escape und Fokus-Rückgabe funktionieren. Navigation ist kein ARIA-Menü. [Accessibility](https://shopify.dev/docs/apps/build/accessibility)

Flipbase prüft AXE und zusätzlich manuell Tastatur, Kontrast, Fokus, Touch und reduzierte Bewegung. Navigation-Dropdown, Listbox, Radio-Gruppe, nichtmodales Popover und Modal haben unterschiedliche Tastaturverträge; nicht überall denselben Fokusmechanismus einsetzen. Alle Bewegungen brauchen definierte Dauer, Kurve, Richtung, Ein-/Ausblendung und Reduced-motion-Verhalten. Exakte Shopify-Bewegungswerte sind bis zur Live-Messung offen.

## Messprotokoll für den Shopify-Admin

Je Element festhalten: Datum, Route, Viewport, Browserzoom, Theme, Komponentenrolle, Zustand und Screenshot-Ausschnitt. Nur nichtinhaltliche Gestaltungsdaten dokumentieren; keine Kundendaten oder vollständigen internen CSS-Bundles ins Repo übernehmen.

| Messgruppe  | Zu erfassen                                                                         |
| ----------- | ----------------------------------------------------------------------------------- |
| Geometrie   | Breite/Höhe, min/max, Padding je Seite, Gap, Margin, Borderbreite                   |
| Ecken       | Alle vier berechneten Radien, äußere/innere Container, Overflow/Clipping            |
| Oberfläche  | Hintergrund, Verlauf, Borderfarbe, Box-Shadow und Pseudoelemente                    |
| Typografie  | Familie, Größe, Gewicht, Zeilenhöhe, Buchstabenabstand, Zahlenformat                |
| Zustände    | Normal, Hover, Pressed, Fokus, Disabled, Loading, ausgewählt                        |
| Bewegung    | Transition-/Animationsname, Dauer, Delay, Kurve, Transform-Origin, Öffnen/Schließen |
| Platzierung | Anker, Abstand, Öffnungsrichtung, Verhalten an Fensterrändern und beim Scrollen     |
| Responsiv   | Toolbarumbruch, Tabellen-/Listenwechsel, Spaltenpriorität, Touchflächen             |

**Gemessen:** Inventar, Spalten-/Sortiermenü, Filter-/Suchmodus, Produktauswahl, Arbeitskarten, Detailseiten, Felder, Dialoge und weitere Seitenfamilien. Arbeitskarten/Popover 12 px, Felder/Buttons/Badges 8 px, Checkbox 4 px, normale Dialoge 16 px; Startseiten-Empfehlungskarten separat 24 px. Kontext, Schatten, Bewegung und Grenzen stehen im [Live-Messprotokoll](shopify-admin-live-reference.md). Noch offen sind insbesondere vollständige Zustandsmatrix, Mobile, Zoom und Reduced Motion.

## Pflege und Abnahme

- Neue/geänderte Komponente verweist auf die passende Regel und gegebenenfalls ihren gemessenen Referenzzustand.
- Abweichungen dokumentieren: Nutzerentscheidung, fachliche Notwendigkeit oder Zugänglichkeit. Keine unaufgeforderte Änderung des Markengelbs.
- Rollenbezogene Themevariablen zentral, Komponentenlayout in Tailwind-HTML. Neue visuelle Sonderfälle zunächst gegen existierende Bausteine prüfen.
- Für jede relevante Komponente Desktop/Mobil, hell/dunkel, Tastatur und Reduced-motion vergleichen. Screenshots prüfen und nicht automatisch als neue Wahrheit übernehmen.
- Steuer & DATEV: aktuell ausschließlich Tabelle, zugehörige Spaltenbedienung und Tabellenfehler. Gesamte Seite, Kennzahlen, Exportablauf und Steuerberaterdialog bleiben zurückgestellt.
- Diese Datei und der Messstand werden bei Referenzänderungen aktualisiert. Ein alter npm-Tokenwert ist kein Beweis für das aktuelle Shopify-Admin-Design.
