# Vinted-Relisting: Maskenabruf und unveränderte Aktionsleiste

## Bestätigter Fehler

Der Nutzer startet einen Relist und erhält anschließend die Meldung, das
Vinted-Inserat könne nicht gelesen werden. Die produktive technische Einordnung
nennt am 3. November 2026 `content/read`, Phase `read`, Schritt `category`.
Es wurde kein Inseratauftrag angelegt. Die Meldung allein beweist keinen
Anmeldeverlust, weil die Oberfläche verschiedene Lesefehler gleich bezeichnet.

Die normale Cloud-Browsersitzung des betroffenen verbundenen Kontos wurde für
eine begrenzte Leseprobe verwendet. Aktuelle Kontoidentität und servergebundene
eigene Artikelkennung stimmen; die Artikelantwort liefert gültige numerische
Kategorie- und Markenkennungen. Der bisherige Referenzparser würde diese
Antwort akzeptieren. Keine API-Kennungen aus Texten oder geratenen URLs ableiten.

Die eigene Bearbeitungsmaske enthält dagegen weder direkt nach dem sichtbaren
Titelfeld noch nach zusätzlichem passivem Warten ein `#category`-Element.
Die Kategorie ist ein gelabelter Button mit
`data-testid="catalog-select-dropdown-input"` und dynamischer React-ID;
daneben steht ein Input mit `name="category"`. Marke, Größe, Zustand, Farbe
und Material verwenden entsprechend feste Testkennungen an Buttons und
benannte Inputs. Auch Titel, Beschreibung und Preis besitzen dynamische IDs.
Die vorhandenen Tests hatten stattdessen Inputs mit festen IDs modelliert.

## Zusammenhängender Vertrag

Kategoriebezeichner, Öffnen der Auswahl, Neuanlagevorbereitung und spätere
Unverändertheitsprüfung müssen dieselben belegten Controls verwenden. Eine
isolierte Reparatur nur des ersten Kategorieabrufs genügt nicht. Die vorhandene
Unterstützung alter Masken bleibt erhalten; unbekannte, versteckte, falsch
gebundene oder mehrdeutige Controls bleiben gesperrt. Aktuelle Kontobindung,
Lease, Benutzerrechte und Identität werden weiterhin geprüft.

Der gemeinsame Formularsammler darf bekannte native Felder mit ihren richtigen
Namen und Tag-Verträgen nicht allein wegen einer dynamischen ID als unbekannt
einordnen. Daraus folgt keine allgemeine Erlaubnis für zusätzliche Felder.
Konkrete Fehler aus dem Lesen einzelner Auswahllisten sollen ihren bestehenden
Schritt behalten; ein tatsächlicher Rechteverlust hat weiterhin Vorrang.

## Darstellung und Planung

Die Aktionsleiste wurde bislang während lokaler Arbeit aus dem DOM entfernt.
Ein angenommener Plan ersetzte die gesamte Artikelkarte durch eine kürzere
Plankarte. Beides erzeugte die vom Nutzer beobachteten Höhenänderungen.

Karte, Position und vier Aktionsplätze bleiben nun erhalten. Während einer
Aktion sind Artikelaktionen gesperrt. Die vorhandene Planbearbeitung nutzt
denselben zweiten Platz, solange der Auftrag noch bearbeitbar ist. Die
Darstellung bleibt auch erhalten, wenn der bisherige Anbieterartikel beim
normalen Datenabgleich nicht mehr erscheint.

Der Countdown verwendet den verbindlichen `scheduledAt`-Wert des vorhandenen
Auftragsdokuments. Dieser enthält bereits den wirksamen Termin aus
`relist_publish_at` beziehungsweise `scheduled_at`. Kein jeweils neuer Termin
aus der aktuellen Uhrzeit oder einer noch nicht begonnenen Relist-Verzögerung.
Ein fälliger wartender Auftrag wird nicht als bereits laufend dargestellt.
Vorbereitung, bestätigter Löschabschnitt und Neuveröffentlichung erhalten die
zum tatsächlichen Zustand gehörende Beschriftung und Ladeanzeige.

## Nachweise und Grenzen

Die Produktionsdiagnose liest ausschließlich feste technische Merkmale sowie
bekannte Formularattribute. Keine Zugangsdaten, privaten Artikelkennungen,
Titel, Beschreibungstexte oder vollständigen Anbieterantworten veröffentlichen.
Keine erneute Verknüpfung, Freigabeänderung, Veröffentlichung oder Löschung zur
Prüfung auslösen. Die normale Diagnosesitzung wird danach geordnet geschlossen;
Intervalle und Konfiguration bleiben unverändert.

Lokale Browserfälle verwenden abgefangene Anbieterantworten und prüfen die
aktuellen Controlformen ebenso wie bisherige Masken und negative Gegenproben.
Die Oberflächenfälle prüfen Desktop/Touch und Hell/Dunkel, unveränderte
Karten-/Leistenhöhe, gesperrte Aktionen, herunterzählende Wartezeit und die
tatsächlichen Ausführungszustände. Vollständige Protokolle und Sichtbelege
bleiben privat außerhalb der Aufgaben-Arbeitskopie. Verbindlicher Vorabcheck
und gegebenenfalls zusätzliche CI-Nachweise folgen am endgültigen Stand.

## Noch offener echter Gesamtnachweis

Ein begrenzter Lauf des tatsächlich korrigierten Formularlesers wurde innerhalb
einer normalen Cloud-Sitzung mit technisch gesperrten Nichtleseanfragen
ausgeführt. Der bisherige Kategorieabruf wurde überwunden; anschließend brach
der Lauf mit dem festen Schritt `category_close` ab. Ein vollständiger Snapshot
wurde nicht bestätigt. Keine Inserat-API-Mutation oder Formularübermittlung
wurde zugelassen.

Der Schritt entstand ausschließlich durch einen verworfenen Escape-Aufruf.
Die bisherige Fehlerbehandlung konnte dabei einen früheren Öffnungs- oder
Lesefehler überdecken. Dies ist mit echten synthetischen Browserfällen belegt
und korrigiert: ursprüngliche Fehler behalten Vorrang, der Schließversuch bleibt
verpflichtend und ein alleiniger Schließfehler bleibt ein Fehler. Kein blinder
Escape-Wiederholungsversuch und keine ungeprüfte Annahme über das Popupverhalten.

Die normale Sitzung wurde nach dem Leserabbruch als geschlossen bestätigt;
ihr regulärer Ablaufzeitpunkt lag danach. Ein gewöhnlicher Sitzungsablauf ist
damit nicht als Ursache belegt. Warum Seite beziehungsweise Sitzung endeten,
bleibt offen. Eine kleine Folgeprobe trennt deshalb ursprünglichen Öffnungs-
und Escapefehler, Sichtbarkeit, Seiten-/Browserzustand und Popupmetadaten.
Sie wurde noch nicht ausgeführt.

Die eigene Diagnoseansicht scheiterte anschließend am Versionswechsel auf die
parallel veröffentlichte Anwendung 0.405.0. Der Computerzugriff wurde beendet,
weil die aktive Windows-Browseradresse nicht hinreichend sicher bestimmt werden
konnte. Keine weitere Browsersteuerung im betroffenen Durchlauf. Der echte
Gesamtnachweis und die Veröffentlichung dieser Fehlerkorrektur bleiben offen;
lokale Änderungen und private Nachweise werden für die Fortsetzung erhalten.

## Lokaler Abschlussstand vor der Browserunterbrechung

Auf dem zusammengeführten Stand mit Hauptzweig `6cf4268e` und korrigierter
Popup-Fehlererhaltung sind `npm run preflight:plan` und `npm run preflight`
unter Node 22 erfolgreich. Format, Lint, Typen und Suite-Audit bestehen;
188 Skriptfälle, acht Orchestrierungsfälle, 40 Modellfälle und 791 Angularfälle
sowie der Angular-Bau sind erfolgreich. Zwei Skript- und drei
Orchestrierungsfälle wurden unter Windows regulär ausgelassen. Bekannte
Warnungen zu Imports, Bundlegröße und CommonJS bleiben bestehen.

Die Workerprüfungen bestätigen 798 erfolgreiche Fälle und acht reguläre
Auslassungen. 157 gemeinsame Runtime-/Erweiterungsfälle und 92 native
Browserverbraucher bestehen; die anschließend ergänzte Popup-Fehlererhaltung
ist mit zehn gezielten echten Browserfällen geprüft. Vier vorhandene
Oberflächenfälle decken Desktop/Touch und Hell/Dunkel ab. Ein zusätzlicher
schmaler Dunkel-Fall beginnt mit unbekanntem Listenpreis und bestätigt auch
dort vier Aktionsplätze sowie gleiche Höhen bis zur Ausführung.

Diese Nachweise ersetzen weder den weiterhin offenen echten Formularleser
noch die ausgewählten CI-/Imageprüfungen vor einer Veröffentlichung. Der
Arbeitszweig bleibt unveröffentlicht für die Fortsetzung erhalten.
