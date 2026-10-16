# Zentrale Marktplatzverwaltung: Planungsgrundlage

Stand: 15.10.2026. Der Nutzer hat Aufbau und ersten Transferweg Vinted → Kleinanzeigen bestätigt. Die folgende Bestandsaufnahme beschreibt den ersten Planungsstand; maßgeblich für die nächste Prüfung sind die konkretisierte Spezifikation und die drei neuen Teilpläne.

## Ziel und Umfang

Unter „Marktplätze“ entsteht ein gemeinsamer Einstieg „Übersicht“. Dort sollen
aktivierte Plattformen, verbundene Accounts und deren Inserate sichtbar und direkt
bedienbar sein. Plattformseiten bleiben für spezielle Funktionen wie Bestellungen,
Nachrichten und Statistiken erhalten.

Gewünscht sind Erstellen, Bearbeiten, Löschen, erneutes Einstellen und die
Übernahme eines vorhandenen Inserats auf eine andere Plattform. Mehrfachauswahl
und späteres Veröffentlichen auf mehreren Plattformen gehören zum Zielbild.
Ein Zielentwurf muss dessen eigenes Formular verwenden und vor der Ausführung
bearbeitbar sein. Titel und andere Inhalte dürfen pro Zielplattform abweichen.

## Geprüfter Bestand

Basis dieser Planung ist der lokal vorhandene Stand von origin/master bei
36723117 im eigenen Zweig juna/marketplace-hub-planning. Zusätzlich wurde die
laufende Vinted-Galerie-/Altersarbeit im ursprünglichen Checkout lesend geprüft.
Deren Integration wird nicht vorausgesetzt. Kein Abruf echter Konten und kein
Live-Versuch zum Erstellen, Bearbeiten, Löschen oder erneuten Einstellen.

- Die Marktplatz-Startadresse leitet bislang auf Vinted weiter:
  src/app/features/marketplaces/marketplaces.routes.ts.
- Aktivierungsschalter bestehen bereits und filtern die Sidebar. Sie werden
  derzeit ausschließlich im Browser gespeichert, nicht je Nutzer und Workspace:
  src/app/core/services/marketplace-settings.service.ts.
- Vinted besitzt kontobezogene Inseratimporte und Bearbeitungswege. Für neue
  Inserate gibt es Entwürfe, Veröffentlichungsaufträge und lokale sowie
  serverseitige Ausführungsbausteine. Vorhandene Dateien sind kein Nachweis
  einer vollständig angeschlossenen oder veröffentlichten Ausführung.
- Insbesondere werden vinted-listing-client.js und vinted-listing-runtime.js
  im geprüften Extension-Manifest und Hintergrund-Einstieg nicht geladen.
  Vollautomatische lokale Vinted-Veröffentlichung deshalb nicht als fertig
  einplanen. Die README beschreibt noch einen lesenden Inseratpiloten.
- eBay hat eine eigene Anbindung, Inseratansicht und Bearbeitungsseite.
  ebay_connections erlaubt aktuell eine persönliche Verbindung je Nutzer,
  Workspace und Umgebung. Beliebig viele eBay-Accounts sind damit noch kein
  vorhandenes Merkmal.
- Die Kleinanzeigen-Seite besteht derzeit aus Hinweisen und Links, ohne
  eigenen Account- oder Inseratabgleich. Ihr Text über eine direkte Übernahme
  aus Vinted belegt keinen angeschlossenen Übertragungsablauf.
- Die vorhandenen Kleinanzeigen-Entwürfe liegen im separaten Feature listings.
  Dessen Modell hat keine Accountzuordnung und ist keine bestätigte Lesekopie
  aller auf Kleinanzeigen veröffentlichten Inserate.
- Die Extension öffnet das Kleinanzeigen-Formular und überträgt unterstützte
  Angaben sowie Bilder. Kategorieauswahl und abschließendes Veröffentlichen
  bleiben manuell. Ihre positive Rückmeldung bestätigt nur die Tabübergabe.
  Beleg: tools/flipbase-extension/kleinanzeigen-autofill.js und background.js.
- Die bestehende Aktion zum erneuten Einstellen in listings setzt ausdrücklich
  voraus, dass der Nutzer das alte Inserat selbst entfernt hat. Sie ist kein
  automatisches Löschen und Wiederveröffentlichen.

## Mögliche Aufteilungen

1. **Empfohlen: Übersicht mit direkt bedienbaren Plattformabschnitten.**
   Accounts und Kennzahlen oben, darunter nachladbare Inseratlisten je Plattform.
   Entspricht dem gewünschten Scrollen, Auswählen und Ausführen.
2. **Übersicht und zusätzliche zentrale Seite „Inserate“.**
   Gut für eine sehr große gemeinsame Tabelle, erzeugt aber einen zusätzlichen
   Einstieg und muss gegen doppelte Funktionen abgegrenzt werden.
3. **Übersicht mit ausschließlich verlinkten Plattformkarten.**
   Schnell umsetzbar, erfüllt die gewünschte direkte Verwaltung jedoch nicht.

Vorschlag ist Variante 1. Ein späterer Filter „Alle Plattformen“ kann dieselben
Daten und Aktionen verwenden, falls dafür ein echter Bedarf entsteht.

## Navigation und Übersicht

Unter „Marktplätze“: Übersicht, anschließend die aktivierten Plattformen.
Der vorhandene Vinted Feed behält seinen gesonderten Zweck.
Übersicht bleibt auch bei null aktivierten Plattformen erreichbar und bietet
dann den Einstieg zum Aktivieren.

Oben stehen „Inserat erstellen“ und „Marktplätze verwalten“. Pro Plattform werden
Accounts, bekannte aktive Inseratzahl, letzter Abgleich und Verbindungszustand
angezeigt. Unbekannte oder unvollständige Zahlen erscheinen nicht als null.
Summen zählen Plattforminserate; sie sind keine Anzahl verschiedener Lagerartikel.

Jeder Plattformabschnitt enthält Accountfilter, Statusfilter, Suche und eine
seitenweise geladene Liste. Nicht sämtliche Accountbestände beim Seitenstart
abrufen. Gemeinsame Tabellen-, Button-, Checkbox-, Badge- und Dialogbausteine
verwenden; bestehende Admin-Gestaltungsregeln gelten.

Zeilen zeigen Foto, Titel, Preis/Währung, Plattform, Account, Zustand,
Veröffentlichungsalter und angebotene Aktionen. Fehlende Altersdaten bleiben
unbekannt; Import oder Bearbeitung setzen das Alter nicht zurück.
Die laufende Vinted-Altersarbeit liefert die vorhandene Fachlogik mit
72/120/168-Stunden-Grenzen. Für andere Plattformen Zeitquellen und gewünschte
Schwellen getrennt prüfen. Ein Wochenziel ist eine Arbeitsregel, keine
automatische Freigabe oder Pflicht zur Wiederveröffentlichung.

Aktivieren, Konto verbinden und Ausführungsberechtigung sind getrennte Zustände.
Deaktivieren löscht keine Accounts oder Inserate. Vor Umsetzung ist ausdrücklich
festzulegen, ob der Schalter nur die Anzeige oder auch wartende Aufträge steuert.
Für geräteübergreifende Einstellungen empfiehlt sich eine persönliche Speicherung
je Nutzer und Workspace; die Migration der bisherigen Browserauswahl gehört dazu.

## Vorhandenes Inserat auf anderer Plattform einstellen

Ablauf: Quellinserat auswählen → „Inserieren auf …“ → Zielplattform und Zielaccount
wählen → Zielentwurf prüfen und ergänzen → Veröffentlichung starten → Ergebnis sehen.

Es wird eine Kopie für das Ziel erstellt. Das Quellinserat bleibt bestehen.
Spätere Änderungen an Quelle oder Ziel überschreiben die andere Fassung nicht
automatisch. Eine Übernahme ist keine laufende Synchronisierung.

Beispiel Vinted nach Kleinanzeigen:

| Vorhandene Angabe            | Verhalten im Zielentwurf                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| Titel und Beschreibung       | Vorbefüllen, Ziellimits prüfen, nicht still abschneiden                     |
| Verkaufspreis                | Bei passender Währung übernehmen und bearbeitbar machen                     |
| Fotos                        | Verfügbarkeit, vollständige Übertragung und Reihenfolge prüfen              |
| Marke, Größe, Farbe, Zustand | Nur bei passender Zielbedeutung zuordnen; sonst als Übernahmehinweis zeigen |
| Kategorie                    | Gültige Zielkategorie bestimmen; fremde Kategorie-ID niemals übernehmen     |
| Versand und Standort         | Zielkonto und Kleinanzeigen-Auswahl verwenden, fehlende Angaben ergänzen    |

Für die vollständige Beschreibung oder Originalbilder können zusätzliche
Quellabfragen nötig sein. Ein kleines Vorschaubild allein genügt nicht.
Nicht übertragene Angaben bleiben für den Nutzer erkennbar.
Kategorieabhängige Pflichtfelder werden mit dem Ziel geprüft.

Ein Dialog ist für den einzelnen Transfer geeignet; umfangreiche Bearbeitung
und Mehrplattform-Erstellung erhalten eine vollständige, verlinkbare Editorseite.
Dort kann später je Plattform ein eigener Reiter entstehen. Gemeinsame Angaben
werden einmal vorgeschlagen; anschließende Änderungen gelten nur für den
gewählten Zielentwurf. Jeder Zielentwurf hat einen eigenen Bereitschaftsstatus.

## Gemeinsame Grundlage für die Ausführung

Vier Dinge getrennt behandeln: interner Artikel/Bestand, externes Inserat,
bearbeitbarer Zielentwurf und auszuführender Auftrag.

Externes Inserat eindeutig durch Workspace, Verbindung und externe Inserat-ID
zuordnen. Eine externe ID allein genügt nicht. Ein interner Artikel kann mehrere
Plattforminserate haben; eine vorhandene Zuordnung wird beim Übertragen erhalten.
Bei unbekannter Zuordnung nicht allein anhand des Titels automatisch verbinden.

Die Übersicht verwendet vorhandene Vinted- und eBay-Dienste über eine gemeinsame
Leseschnittstelle. Plattformeditoren und ausführende Plattformdienste bleiben
getrennt. Keine zweite Veröffentlichungslogik in der Übersichtsseite aufbauen.
Vorhandene Auftragszustände, Versionsprüfungen und Duplikatsperren wiederverwenden
und nur dort erweitern, wo die gemeinsame Nutzung es tatsächlich verlangt.

Welche Aktionen verfügbar sind, hängt von Plattform, Account, Berechtigung,
Inseratzustand und Ausführungsweg ab. eBay verwendet seine bestehende Anbindung;
die Extension ist nicht zwingend der technische Weg für jede Plattform.
Kleinanzeigen braucht zuerst verlässliche Accountidentität, Inseratimport und
danach überprüfbare Schreibaktionen.

Zielaccount unmittelbar vor jeder Schreibaktion gegen das tatsächlich angemeldete
Konto prüfen. Bei Abweichung pausieren und das richtige Browserprofil verlangen.

Aufträge unterscheiden vorbereitet, wartend, läuft, bestätigt, fehlgeschlagen
und Ergebnis unklar. Die bestehenden konkreten Zustände werden fachlich darauf
abgebildet, nicht ungeprüft ersetzt. „Veröffentlicht“ erst nach bestätigter
Ziel-ID und passendem Ergebnis; ein geöffneter Tab genügt nicht.
Unklare Ergebnisse zuerst abgleichen, nicht blind wiederholen.

## Mehrfachauswahl und erneutes Einstellen

Checkboxen und Auswahlgrundlage früh vorsehen, zunächst nur für den sichtbaren
Accountabschnitt. „Alle auf dieser Seite“ ist eindeutig beschriftet; eine spätere
Auswahl aller Suchtreffer braucht eine ausdrückliche Auswahl samt Gesamtzahl.
Account-, Workspace- oder Filterwechsel entfernt nicht mehr passende Auswahlen.

Ein Sammelauftrag enthält nachvollziehbare Einzelaufträge. Pro Account werden
Schreibaktionen geordnet ausgeführt. Kein gleichzeitiges Öffnen zahlreicher
Inserat-Tabs. Vor dem Start gibt es eine gemeinsame Prüfung mit Anzahl, Zielaccounts,
fehlenden Angaben und nicht unterstützten Einträgen. Ein Ergebnis je Inserat
verhindert, dass ein Teilerfolg als vollständiger Erfolg erscheint.
Bei Loginproblemen oder unklarem Ergebnis den betroffenen Account pausieren.

Relisting bleibt plattformspezifisch: Daten und Bilder sichern, Ziel vollständig
vorbereiten, aktuellen Verkaufs-/Reservierungszustand prüfen, zulässige Reihenfolge
für Entfernen und Wiederveröffentlichen ausführen und beide Inserat-IDs im Verlauf
behalten. Veröffentlichung und Alter nur nach bestätigtem Ergebnis aktualisieren.
Ein Ablauf darf weder verlustfreie Entfernung noch unterbrechungsfreie Erreichbarkeit
versprechen, solange das nicht belegt ist. Plattformregeln und erlaubter
Ausführungsweg sind vor Implementierung konkret zu prüfen.

Die geplante Vinted-Relisting-Funktion soll von Anfang an dieselbe Aktion liefern,
die später aus Kleiderschrank, Detailseite und zentraler Übersicht aufgerufen wird.
Die zentrale Übersicht selbst wartet nicht auf fertiges Bulk-Relisting.

## Empfohlene Umsetzungspakete

1. **Gemeinsamer Einstieg und Lesen:** Navigation, Aktivierung, echte Accountdaten,
   Kennzahlen und direkt bedienbare Inseratlisten aus vorhandenen Quellen.
   Fehlenden Kleinanzeigen-Abgleich ausdrücklich als solchen zeigen.
   Vorhandene Detail-/Bearbeitungswege wiederverwenden.
2. **Kleinanzeigen-Accounts und Abgleich:** Kontoidentität, Inseratliste,
   Zustände und belastbare Veröffentlichungszeitpunkte importieren.
   Bestehende Entwürfe erhalten und ohne erfundene Accountzuordnung übernehmen.
3. **Erster vollständiger Transfer Vinted nach Kleinanzeigen:** Zielentwurf,
   Kategorie-/Pflichtfelder, Zielaccountprüfung, Veröffentlichung und bestätigte
   Rückmeldung. Automatisches Veröffentlichen separat im echten Ablauf nachweisen;
   bis dahin ehrlich den noch manuellen Schritt anzeigen.
4. **Einzelaktionen und Relisting:** Fehlende Bearbeiten-/Löschen-/Relisting-Wege
   pro Plattform ergänzen. Die bereits geplante Vinted-Arbeit kann unabhängig
   vorgezogen werden, wenn sie den gemeinsamen Aktionsvertrag verwendet.
5. **Mehrfachaktionen und weitere Ziele:** Warteschlangen, Teilergebnisse,
   Wiederaufnahme, zusätzliche Übertragungsrichtungen und Mehrplattform-Editor.
   Vollständiges eBay-Neuanlegen und mehrere eBay-Accounts sind eigene Erweiterungen.

## Prüfungen vor einer Umsetzung

- Vorhandene Navigation, Plattformaktivierung und direkte Links einschließlich
  Rechteprüfung; keine Erweiterung bestehender Vinted-Zugriffsrechte durch die Übersicht.
- Vollständige Zählung gegenüber nur geladener Seite; unbekannte Werte und
  veraltete Stände; Ladefehler einzelner Plattformen ohne Ausfall der gesamten Seite.
- Account- und Workspacewechsel, verspätete Antworten und Kontextwechsel während
  einer Bearbeitung oder Auswahl.
- Übernahme mit fehlender Beschreibung, fehlenden Bildern, fremden Kategorien,
  Ziellimits, unterschiedlichen Währungen und unveränderten Quellinseraten.
- Extension fehlt oder ist veraltet, falsches Zielkonto, Anmeldung abgelaufen,
  Validierungsfehler, Abbruch vor und nach dem Absenden, Duplikatvermeidung.
- Relisting mit zwischenzeitlichem Verkauf, fehlender Sicherung und unklarem
  Lösch-/Veröffentlichungsergebnis; Teilerfolge und Wiederaufnahme im Sammellauf.
- Bestehende betroffene Browserfälle sowie neue Abläufe bei CI-Breiten, Touch,
  Tastatur, Hell/Dunkel und AXE; Testauswahlregistrierung, Formatierung, Lint,
  Typen und Angular-Bau. Bei Schemaänderungen erzeugte Migrationen, RLS,
  Datenbanktests und neu generierte Typen.

Für diese Planungsgrundlage wurden nur lokale Quellen gelesen. Es wurden keine
Anwendungstests ausgeführt und keine externen Formularfelder live verifiziert.

## Nächste Besprechungsentscheidung

Zuerst den vorgeschlagenen Aufbau und den ersten Umfang bestätigen:
Übersicht mit Plattformabschnitten und vorhandenen Account-/Inseratdaten,
anschließend Kleinanzeigen-Abgleich und Vinted-nach-Kleinanzeigen-Transfer.
Danach eine freigegebene Spezifikation und den konkreten Implementierungsplan
ausarbeiten. Offene Detailentscheidungen sind die Wirkung des Aktivierungsschalters
auf Aufträge und die gewünschte Priorität mehrerer eBay-Accounts.

## Konkretisierung nach Freigabe

Der Aufbau ist im Chat bestätigt. Aktuelle Grundlage ist
[die konkretisierte Spezifikation](../superpowers/specs/2026-10-15-marketplace-overview-transfer-design.md)
mit [Umsetzungsfolge und drei Teilplänen](../superpowers/plans/2026-10-15-marketplace-overview-transfer-roadmap.md).
Die Galerie-/Altersarbeit ist inzwischen in origin/master integriert.
Der Sichtbarkeitsschalter steuert die persönliche Anzeige je Nutzer/Workspace;
Accountpause und Freigabewiderruf bleiben getrennte Aktionen.
Mehrere eBay-Verbindungen folgen nach dem ersten vollständigen Übertragungsweg.
