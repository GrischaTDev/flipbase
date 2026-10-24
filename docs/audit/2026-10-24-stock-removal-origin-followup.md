# Vertiefte Prüfung der falschen Burberry-Verlustbuchung

Untersuchung am 24.10.2026. Quellstand: `f6a5a2abdbcefaba232b733fdb97ccdfe90a4f05`.
Produktion wurde ausschließlich gelesen. Die bereits ausgeführte Gegenbuchung
und Reservierung wurden nicht verändert; der eBay-Verkauf wurde nicht gebucht.

## Was sich zur Herkunft belegen lässt

Am 23.10.2026 um **13:02:46 Uhr, Europe/Berlin**, wurde die eigenständige
Funktion `remove_article_stock` erfolgreich aufgerufen: Burberry-Schal,
ein Stück, Grund `loss`, keine Notiz. Der unveränderliche Beleg und ein
erfolgreicher API-Aufruf mit Referenz `app.flipbase.de` und der Kennung
Chrome unter Windows passen zusammen. Ein OPTIONS-Aufruf hat keine Buchung
erzeugt; der nachfolgende POST ist der schreibende Aufruf.

Im Zeitfenster 13:00–13:05 Uhr wurden außerdem zwölf Katalogartikel archiviert.
Die Verlustbuchung liegt zwischen diesen Archivierungen; die betreffenden
Geschäftsereignisse haben denselben gespeicherten Akteur. Eine zeitlich eng
begrenzte Prüfung des Chrome-Verlaufs fand einen Aufruf einer zu dieser Serie
passenden Katalogdetailseite um 13:01:36 Uhr. Dies belegt einen Zusammenhang mit
Bestandsbearbeitung, aber weder die Absicht noch die Person am Browser.

Nach der Untersuchung bestätigt der Nutzer ausdrücklich: **„Ich habe damals
Artikel archiviert.“** Die Archivierungsserie ist damit als seine Aufräumaktion
eingeordnet. Diese Aussage bestätigt ausschließlich das Archivieren, keinen
bewussten Verlustauftrag und keinen bestimmten Tastendruck. Die Verlustbuchung
liegt zeitlich innerhalb dieser Aktion; ob ein unbeabsichtigter Tastendruck,
eine Verwechslung der Aktionen oder ein anderer Auslöser vorlag, bleibt offen.

Der Aniston-Verkauf wurde bereits um **12:48:35 Uhr** als eigener Verkauf
gespeichert. Verkaufsbuchung und Bestandsverlust verwenden unterschiedliche
Aufrufwege. Im untersuchten Code wurde kein Pfad gefunden, der diesen Verkauf
in einen Verlust eines anderen Artikels umwandelt. Die Artikelkennung wird beim
Öffnen des Abgangsdialogs vom ausgewählten Datensatz übernommen.

Verfügbare lokale Sitzungsdateien wurden anhand ihrer **äußeren** Zeitstempel
im engen Ereignisfenster untersucht. Die damals aktive Vinted-Prüfung startete
eine lokale Vorschau auf Port 4281 und führte Vinted-Browserfälle aus. Kein
passender produktiver Verlustaufruf wurde darin gefunden. Auch in den geprüften
Projektprotokollen eines weiteren lokalen Assistenten wurde kein Ereignis in
diesem Zeitfenster gefunden. Das ist kein vollständiger Ausschluss aller
möglichen Bediener, Werkzeuge oder nicht mehr vorhandenen Aufzeichnungen.

**Der konkrete historische Klick oder Tastendruck bleibt unbelegt.**
Aus einer Benutzerkennung folgt keine bewusste Handlung des Kontoinhabers.
Die Archivierungsserie ist ein neuer Anhaltspunkt, keine bewiesene Ursache.

## Reproduzierter Schwachpunkt der Oberfläche

Eine isolierte Angular-Vorschau importierte den **unveränderten echten**
`ArticleStockRemovalComponent` einschließlich seiner ausgelagerten Vorlage.
Der echte Serverdienst wurde durch einen ausschließlich lokalen Aufrufzähler
ersetzt. `connect-src 'none'` sperrte Netzwerkzugriffe aus der Seite; es wurden
nur synthetische Kennungen verwendet. Keine produktive Buchung wurde getestet.

Reproduktion im echten Chrome:

1. Dialog mit einem lokal simulierten Stück öffnen.
2. Als Grund „Verloren / fehlt im Lager“ auswählen; Notiz leer lassen.
3. Das Mengenfeld fokussieren und **Enter** drücken.
4. Ohne Betätigung des sichtbaren roten Buchungsbuttons erscheint die
   Erfolgsmeldung. Der Ersatzdienst registriert genau einen Aufruf mit
   Menge `1`, Grund `loss` und leerer Notiz.

Ursache dieses reproduzierten Verhaltens: Die Vorlage enthält einen unsichtbaren
Submit-Button; `(ngSubmit)` ruft unmittelbar `submit()` auf. Das Mengenfeld ist
ein natives Zahlenfeld. `submit()` prüft Menge und Formular, verlangt aber keine
gesonderte Bestätigung. Eine leere Notiz ist im Formular und im Server erlaubt.

Gegenprobe: Enter in der Grundauswahl öffnet bzw. bestätigt nur die Auswahl und
erzeugt **keinen** Dienstaufruf. „Verlust“ ist außerdem **nicht** voreingestellt;
der Standard ist „Beschädigt“. Ein bloßes Öffnen des Dialogs erklärt deshalb
keine Verlustbuchung. Der Mengenfeld-Befund ist mit dem gespeicherten Vorgang
vereinbar, beweist aber nicht dessen historischen Auslöser.

Die Dialogdateien stimmen mit dem untersuchten Stand vor dem Ereignis
(`3477b3e5f8304e792853f8042573058ad25ab16b`) überein. Die Lücke wurde also nicht
erst durch die neue Gegenbuchung oder eBay-Reservierung eingeführt.

## Vorhandener Schutz des jetzt reservierten Schals

Die erneute reine Statusabfrage am 24.10.2026 um 10:49 Uhr bestätigt:
Restmenge eins, reserviert eins, Entwurf `needs_costs`, keine Verkaufs-ID und
kein endgültiger eBay-Übernahmebeleg. Der Trigger `protect_ebay_lot_reservation`
ist aktiv. Zusätzlich prüft der Abgangsdienst offene Reservierungsbewegungen.
Das reservierte Stück darf deshalb nicht erneut als freier Verlust ausgebucht
werden. Für diesen Nachweis wurde keine echte Ausbuchung versucht.

## Empfohlene Vorbeugung

Diese Punkte sind ein konkreter Umsetzungsvorschlag, **noch keine ausgelieferte
Änderung**:

1. **Buchung bewusst bestätigen.** Enter in Mengen- oder Notizfeldern darf keinen
   Bestandsabgang auslösen. Ein eigener Prüfschritt zeigt Artikel, Variante,
   Menge, Grund und verbleibenden Bestand; erst „Verlust verbindlich buchen“
   führt die Änderung aus. Tastaturbedienung des sichtbaren Bestätigungsbuttons
   bleibt möglich. Archivieren und Verkauf bleiben klar getrennte Aktionen.
2. **Grund aktiv wählen und erklären.** Keine Grund-Vorauswahl; insbesondere
   für Verlust eine kurze Erklärung verlangen und diese Anforderung auch auf
   dem Server prüfen. Ein ausgewähltes Dropdown allein ist keine Erklärung.
3. **Die Herkunft des Aufrufs besser belegen.** Im geschützten Geschäftsbeleg
   serverseitig ermittelte Anmeldesitzung und Anforderungskennung sowie begrenzt
   erlaubte Angaben zu Anwendungsversion, Ansichtsweg und Bestätigungsschritt
   speichern. Keine Tokens, Passwörter oder vollständigen Request-Header ablegen.
   Clientangaben sind Diagnosehinweise, kein verlässlicher Beweis für die Person
   am Gerät. Zeitlich begrenzte Serverprotokolle und Geschäftsbeleg müssen über
   dieselbe Anforderungskennung zuordenbar sein.

Ein dauerhaftes Verbot aller Bestandskorrekturen wäre dafür zu weitgehend.
Die vorhandene Sperre für reservierte Mengen und die nachvollziehbare
Gegenbuchung bleiben erhalten.

## Anschließend beauftragte Absicherung

Der Nutzer hat den zusätzlichen Bestätigungsschritt für Bestandsverluste und
die Unterbindung direkter Mengenfeld-Enter-Buchungen ausdrücklich beauftragt,
einschließlich PR und Merge nach erfolgreichen Tests. Dieser erste Punkt wird
im Zweig `juna/stock-loss-confirmation` umgesetzt: Die direkte Formularanbindung
und der versteckte Submitbutton entfallen. Der sichtbare Aktionsbutton verlangt
bei Verlust eine gesonderte Bestätigung mit Artikel, Menge, Grund und bekanntem
Restbestand. Abbruch erhält Eingaben und Tastaturfokus; veraltete Rückfragen und
mehrfache Betätigung erzeugen keine Buchung. Die globale Dialogkomponente bleibt
unverändert. Tatsächliche Verlustbuchungen in den Prüfungen betreffen ausschließlich
synthetische Artikel in einer eigenen lokalen Testdatenbank.

Die zusätzliche Pflichtbegründung und erweiterte Herkunftsprotokollierung aus den
Punkten zwei und drei sind nicht Teil dieser Umsetzung. Auch die historische
Ursache wird dadurch nicht nachträglich als bewiesen ausgegeben.

## Prüfungen und Grenzen

- Isolierte Angular-Vorschau erfolgreich gebaut, echte Chrome-Bedienung,
  Mengenfeld-Enter positiv und Grundauswahl-Enter negativ reproduziert.
- Zehn bestehende Dialog-/Diensttests erfolgreich. Diese prüfen die Methoden,
  aber nicht die native Formularübermittlung per Enter; der Befund erklärt die
  bisherige Abdeckungslücke.
- Keine Änderungen an Anwendungscode, Datenbankschema, Rechten oder Geschäftsdaten.
  Keine neue Schutzfunktion als bereits umgesetzt ausgegeben.
- Keine umfassende Browsermatrix erforderlich für diese Untersuchung;
  die spätere Umsetzung benötigt einen gezielten Browserfall für den Fehler,
  Abbruch/Bestätigung, Tastaturbedienung und unveränderte Reservierungen.
- Ein erwartungsgemäßer positiver Serverbeleg existiert; eine damalige
  Bildschirm- oder Eingabeaufzeichnung existiert in den geprüften Quellen nicht.

Quelle für die vorgeschlagene begrenzte serverseitige Request-Zuordnung:
[PostgREST: Transaction-scoped settings](https://docs.postgrest.org/en/stable/references/transactions.html#transaction-scoped-settings).
Der ursprüngliche Untersuchungsbericht steht unter
[Burberry-Verlustausbuchung](2026-10-24-burberry-stock-removal.md).
