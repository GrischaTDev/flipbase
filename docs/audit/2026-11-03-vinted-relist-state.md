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
