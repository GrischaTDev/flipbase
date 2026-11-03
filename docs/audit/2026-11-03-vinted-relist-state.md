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

## Echter Gesamtnachweis

Der tatsächlich korrigierte Formularleser ist am 3. November um 16:36:51 UTC
innerhalb einer normalen Cloud-Sitzung vollständig durchgelaufen. Konto- und
Inseratbindung stimmen; Kategorie, Titel, Beschreibung, Preis und vier Fotos
sind gültig. Marke, Größe, Zustand, Farbe, Material und Paketgröße wurden
einschließlich Auswahlmöglichkeiten gelesen. Native Vorher-/Nachherprüfung
und abschließender Snapshotparser bestehen. Die eigene Prüfseite wurde
geschlossen, die ursprüngliche Seite erhalten.

Die Diagnose erlaubt neben normalen Leseanfragen ausschließlich drei beim
unveränderten Editorstart beobachtete Lookup-POSTs: Kategorieempfehlungen,
Attributempfehlungen und Attribute. Alle drei antworteten mit HTTP 200. Andere
Nichtleseanfragen und Formularübermittlungen bleiben gesperrt; keine
Inseratmutation wurde zugelassen oder erkannt. POST wird dabei ausdrücklich
nicht pauschal als Speicherung oder als GET ausgewiesen. Die serverinterne
Implementierung dieser normalen UI-Lookups ist damit nicht vollständig geprüft.

Ein früherer Prüflauf hatte sämtliche POSTs blockiert und damit bereits beim
Editorstart einen kritischen Fehlerdialog erzeugt. Die gezielte Folgeprobe
bestätigt einen funktionierenden Escape-Aufruf; ein allgemeiner Fehler beim
Schließen des Kategoriepopups ist nicht belegt. Der ursprüngliche Schritt
`category_close` konnte einen früheren Fehler überdecken. Diese unabhängig
belegte Fehlererhaltung ist korrigiert: ursprüngliche Fehler behalten Vorrang,
das Schließen bleibt verpflichtend und ein alleiniger Schließfehler bleibt ein
Fehler. Kein blinder Escape-Wiederholungsversuch. Warum die frühere Sitzung
vor ihrem regulären Ablauf endete, bleibt offen; ein Leerlaufablauf wurde nicht
belegt und ist für den erfolgreichen Gesamtnachweis nicht erforderlich.

Die erfolgreiche Prüfsitzung anschließend über die normale Oberfläche beendet
und den geschlossenen Zustand samt beendetem Anbieter bestätigt. Konto- und
Abrufplankonfigurationen sind unverändert; alle drei Pläne bleiben aktiv ohne
Pause oder Fehler. Nach dem Sitzungsende läuft bereits wieder ein regulärer
Hintergrundabruf. Kein tatsächliches Löschen, Veröffentlichen oder vollständiger
produktiver Relist zur Prüfung ausgelöst.

## Lokaler Prüfnachweis

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

Danach den eigenen Zweig auf den aktuellen Hauptstand `8e93e7dd` übernommen;
ausschließlich den Changelogkonflikt unter Erhalt beider vollständiger
Sitzungseinträge gelöst. Die neuen Hauptzweigänderungen betreffen den
Kontoabgleichdialog; der geprüfte Workerleser bleibt unverändert. Erneuter
Vorabcheck unter Node 22 auf diesem zusammenhängenden Stand erfolgreich:
Format, Lint, Typen, Suite-Audit, 188 Skriptfälle (zwei reguläre Auslassungen),
acht Orchestrierungsfälle (drei reguläre Auslassungen), 40 Modell- und
794 Angularfälle sowie Angular-Bau. Nach abschließender Ergänzung dieses
Markdownnachweises Formatprüfung und Plan erneut erfolgreich.

Der echte Formularleser ist nun bestätigt. Der Nutzer hat PR, Merge nach
erfolgreichen Pflichtprüfungen und Worker-Rollout ausdrücklich freigegeben.
Ausgewählte CI-/Imageprüfungen bleiben vor Merge erforderlich; nach dem Merge
den unveränderlichen Release und den tatsächlich laufenden Worker prüfen.
Keine produktive Veröffentlichung oder Löschung als Test dieses Rollouts.

## Bestehende Preisaktion in der CI

Der erste PR-Lauf bestätigt alle übrigen ausgewählten Bereiche einschließlich
nativer Workerbrowser und Image-Isolation. Der bestehende Preisdialogfall bei
390 Pixeln und hellem Design findet jedoch einen Darstellungsfehler: Die neue
obere Relistanzeige war auch auf laufende Preisaktionen angewandt worden. Die
unveränderte Erwartung einer mittigen Bildanzeige scheitert in der CI mit
86 Pixeln Abstand und lokal mit demselben Fehlerbild bei 94 Pixeln.

Die obere Position gilt nun ausdrücklich nur für einen Relistplan oder eine
typisierte laufende Relistvorbereitung mit passender Konto-/Artikelbindung.
Preis- und Löschaktionen behalten ihre bisherige Bildmitte. Derselbe vorhandene
Preisfall ist lokal anschließend erfolgreich; der vorhandene Relistfall bei
390 Pixeln und dunklem Design bestätigt weiterhin Countdown, Leistenhöhen und
die obere Position. Beide Browserfälle sowie zwei passende Komponentenfälle
und gezielte Format-/Lintprüfung erfolgreich. Keine Erwartung abgeschwächt;
der finale Vorabcheck und die erforderliche CI folgen auf diesem Korrekturstand.
