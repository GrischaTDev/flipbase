# Vinted-Verkäufe, Stornierung und Wiederaufnahme

## Auftrag vom 23.10.2026

Der Kleiderschrank soll gespeicherte Vinted-Alterswerte wieder anzeigen und danach
über alle Seiten sortieren. Verkäufe werden bereits vor dem Versand erfasst,
Stornierungen bleiben nachvollziehbar und sämtliche Artikel eines Pakets werden
gemeinsam behandelt. Navigation: Übersicht, Postfach, Verkäufe, Kleiderschrank.

Die Nutzerklärung unterscheidet ausdrücklich zwei Abläufe:

- **Jetzt:** die native Vinted-Wiederaufnahme nach einer Stornierung über
  „Artikel wieder einstellen“ im Vinted-Chat erkennen. Keine neue Anzeige
  erzeugen oder eine vorhandene Anzeige löschen.
- **Später:** ein eigenes allgemeines Relisting mit Zeitplanung und optionalen
  Änderungen an Titel, Beschreibung und Bildern. Dieses Werkzeug ist hier nicht
  beauftragt. Anbieterregeln und Veröffentlichungsfreigaben müssen dabei separat
  geprüft werden; Änderungen an Inhalten sind kein Nachweis einer Erlaubnis.

## Nachgewiesene Ursachen

Die Korrektur #461 ist einschließlich Abrufdienst und Migration produktiv.
Bei der lesenden Diagnose waren dennoch sämtliche 29 regulären Inserate als
`unknown` gespeichert, obwohl alle einen gültigen `publicationAge` besitzen.
Die aktuelle eigene Kleiderschrankliste liefert `is_draft`, `is_hidden`,
`is_closed`, `is_reserved` und `is_processing`, aber kein `is_visible`.
Die bisherige Erkennung verlangte für aktiv ausschließlich `is_visible=true`.
Anzeige, Lesemodell und Sortierung verwarfen anschließend den Altersfallback
für unbekannte Zustände.

Der Verkaufsimport akzeptierte nur `status_title='Versendet'`. Die gespeicherten
Systemnachrichten enthalten jedoch bereits Verkauf, Stornierung und native
Wiederaufnahme. Beim beobachteten Sechserpaket sind Käufer- und Verkäuferkonto
beide verbunden; derselbe Chat darf deshalb nicht auf beiden Seiten als eigener
Verkauf zählen. Private Nachrichtentexte sind kein Verkaufsnachweis.

## Daten und Übergänge

Ein Vorgang behält die Vinted-Transaktionskennung und das zugehörige Konto.
`saleState` unterscheidet `sold`, `shipped`, `completed`, `cancelled`, `relisted`.
`saleStateAt` bezeichnet den belegten Zustandszeitpunkt, `occurredAt` den ersten
belegten Kaufzeitpunkt. Abrufzeiten werden nicht als Kaufdatum ausgegeben.

Verkäuferkennung und bekannte Kontoseite müssen widerspruchsfrei sein. Ein
strukturiertes Vinted-Systemereignis „Verkauft“ kann die Verkäuferseite belegen.
Ein angenommenes Preisangebot und ein geschlossenes Inserat allein reichen nicht.
Stornierung und Wiederaufnahme sind endgültig gegenüber alten Verkaufs- oder
Versandinformationen derselben Transaktion. Die bisherige gezielte Bereinigung
fälschlich erfasster Angebote entfernt keine modernen bestätigten Vorgänge.

Paketartikel werden über `itemIds` zugeordnet. Der Paketpreis kommt aus dem
Transaktionspreis, niemals aus einem repräsentativen Inseratpreis. Fehlende
Kennungen und Preise bleiben ausdrücklich unvollständig; Titelähnlichkeiten
erzeugen keine Zuordnung. Teilantworten erhalten bereits gespeicherte Kennungen,
Kaufzeit und Preise.

Die RLS-geschützte Sicht `marketplace_visible_account_entries` blendet verkaufte
und noch nicht wieder eingestellte stornierte Artikel aus dem Kleiderschrank aus.
Sie gilt für Seitenauswahl, Gesamtzahl und Marktplatzübersicht. Die ursprünglichen
Lesekopien und Verkaufsvorgänge bleiben erhalten. Nach dem Vinted-Ereignis
`cancelation/reuploaded` werden tatsächlich in der Anbieter-Kleiderschrankliste
vorhandene Artikel wieder angezeigt. Neue Anbieterkennungen erscheinen durch den
regulären Import; es wird keine unbewiesene Alt-/Neu-Verknüpfung hergestellt.
Bei mehreren Transaktionen entscheidet der neueste belegte Vorgang. Ein weiterer
bestätigter Verkauf ohne Quellzeit sperrt konservativ, bis sein eigener Ablauf
geklärt ist. Ein späterer erneuter Kauf sperrt auch nach einer früheren Wiederaufnahme.

Die Verkaufsseite trennt wieder eingestellte Stornierungen von aktuellen
Vorgängen. Der Chatlink verwendet die interne Gesprächskennung desselben Kontos.
Die lokale Pilotverbindung wird weiterhin nicht als vollständige Verkaufsquelle
ausgegeben. Die Cloudliste bleibt ein Teilstand aus den tatsächlich gelesenen
Chats; Kontopausen und bestehende Abrufgrenzen bleiben wirksam. Ältere unveränderte
Chats werden einmalig unter denselben Schranken nachgelesen. Gebundene
Transaktions- und Verkäuferbelege überleben auch manuelle Vollimporte und
ermöglichen die Zuordnung späterer verkürzter Stornoverläufe.

Bei unbekanntem Inseratstatus bleibt ein belegtes gerundetes Alter neutral als
Vinted-Angabe sichtbar. Es bestätigt keinen aktuellen Onlinestatus. Entwürfe und
versteckte Artikel erhalten weiterhin kein Online-Alter. Der feste Altersanker
bestimmt die serverseitige Reihenfolge, unabhängig vom jüngsten Abruf.

## Abnahme mit den echten Konten

Nach Veröffentlichung und aktualisiertem Abrufdienst gemeinsam prüfen:

1. Ein Einzelstück zwischen zwei eigenen Konten kaufen: nur beim Verkäufer als
   Verkauf erfassen; aus dessen Kleiderschrank entfernen.
2. Stornieren: Status „Storniert“, Vorgang bleibt unter Verkäufe; keine
   automatische Rückkehr als verfügbarer Artikel.
3. Im **Vinted-Chat** „Artikel wieder einstellen“ ausführen: Vinted-Ereignis und
   aktuelle Kleiderschrankliste abgleichen; Artikel erscheint wieder dort,
   stornierter Vorgang bleibt im gesonderten Verlauf.
4. Dasselbe mit einem Paket prüfen: alle Kennungen und die vollständige
   Wiederaufnahme kontrollieren, ohne Paketpreis auf Einzelartikel zu kopieren.
5. Den vorhandenen Sechserpaketfall nach dem nächsten passenden Chatabruf prüfen.

Käufe und Stornierungen führt der Nutzer aus. Automatisierte Prüfungen ersetzen
keinen echten Anbieterbeleg. Ein Webrelease allein aktualisiert weder Worker,
Broker und Sitzungsimage noch eine lokal installierte Browsererweiterung.

## Später: Verknüpfung mit dem Warenbestand

Als eigener Folgeauftrag festgehalten: Vinted-Inserate beim Erstellen oder
nachträglich mit konkreten Artikeln und Mengen im Flipbase-Warenbestand
verknüpfen. Ein bestätigter Kauf soll anschließend genau einen internen Verkauf
mit tatsächlichem Preis, Plattform Vinted und Kaufdatum erzeugen und den Bestand
aktualisieren. Mehrfachimporte müssen ohne Doppelbuchung bleiben. Stornierungen,
Pakete, Mengen, abweichende Wiederveröffentlichungskennungen und anteilige
Paketpreise brauchen vor der Umsetzung eine ausdrückliche fachliche Regel.
Diese Änderung erzeugt keine Lagerbewegungen und keine Buchhaltungsverkäufe.

## Lokaler Prüfnachweis

- Worker: vollständige Suite mit 709 erfolgreichen Fällen und acht bestehenden
  Auslassungen; HTTP-Vollimport, Kontoseiten, Paketkennungen und verkürzte
  Chatverläufe durch konkrete Regressionen abgesichert.
- Oberfläche: fachlicher Auswahlplan mit 18 Node-Dateien/162 Fällen und
  70 Angular-Dateien/940 Fällen erfolgreich. Erweiterungsruntime 123 Fälle.
- Datenbank: vollständige lokale Suite mit 128 Dateien/4.719 Assertions.
  Frischer transaktionaler Replay der generierten Migration; anschließend
  36 Marketplace-Dateien/1.731 Assertions erfolgreich. 553 öffentliche Funktionen
  einschließlich Owner, Rechte und Definer-Einstellung sowie die neue Sicht
  entsprechen dem Zielkatalog; nur Zeilenenden normalisiert.
- Browser: alle 58 Fälle der fünf betroffenen Kernansichten Übersicht, Kontoraster,
  Kleiderschrank/Detail, Arbeitsfläche und Verkäufe erfolgreich. 320 bis 1440 Pixel,
  Hell/Dunkel, Touch, Tastatur und AXE eingeschlossen. Die vier neuen Verkaufsfälle
  bestätigen außerdem das tatsächlich gesetzte Farbschema und fehlerfreie
  zusätzliche Kontoantworten. Mobil/Desktop visuell geprüft.
- Typprüfung für Anwendung und Worker, Angular-Produktionsbau einschließlich
  Vorlagen und PWA-Assetverarbeitung, gezieltes Lint, Shared-UI-Prüfung und
  Suite-Audit erfolgreich. Neue Tests sind in gezielter Auswahl und tatsächlicher
  PR-Sollliste registriert; 197 Auswahl-/Migrations-/Erweiterungsverträge erfolgreich.

Die isolierte SQL-Datenbank ist ein vollständiger Schemaklon der vorhandenen
lokalen Basis mit den erforderlichen technischen Referenzdaten. Keine privaten
Geschäftsdaten oder Produktionsdaten wurden für die Tests kopiert. Die aktuelle
CLI lieferte beim neuen URL-Diff keinen Unterschied trotz belegter Änderungen;
der historische CLI-Abgleich scheiterte an einer unveränderten alten Migration.
Deshalb entstand die neue Migration aus dem geprüften Basis-/Zielkatalog mit
`migra`; Sichtoptionen, Rechte und Bestandsabgleich stammen aus der deklarativen
Schemaquelle. Historische Migrationen bleiben unverändert.

Schema, generierte Typen und Testauswahlskript führen in CI bewusst zum breiten
Pflichtlauf. Die lokale fachliche Prüfung ersetzt weder diesen vollständigen
PR-Lauf unter Linux noch die gemeinsame echte Vinted-Abnahme. Es wurden keine
Anzeigen, Käufe, Stornierungen, Kontoaktivierungen oder produktiven Daten geändert.

Die Browsertests liefen mit künstlichen Daten gegen eine ruhende lokale
Entwicklungsvorschau. Der erste Vorschauversuch verwendete die Produktions-CSP
für den lokalen Entwicklungs-Backendport und blockierte dadurch die Testdaten;
das Produkt wurde dafür nicht geändert. Der erneute Abruf eines 503-Fehlers wurde
mit dem unveränderten 15-Sekunden-Erwartungsfenster der CI nachgestellt; der
Supabase-Client wiederholt solche Abfragen selbst. Ein veralteter erwarteter
Alterstext für unbekannten Status wurde auf die neue neutrale Vinted-Angabe
angepasst und weiterhin auf fehlende Veröffentlichungsbehauptungen geprüft.

Die acht weiteren Dateien der fachlich breiteren Browserauswahl sowie sämtliche
fachfremden Anwendungstests und die durch Schema-/Auswahländerung ebenfalls
angewählten PWA-Fälle sind lokal nicht vollständig ausgeführt; sie bleiben Teil
der verpflichtenden CI-Auswahl. Es wurde kein erfolgreicher Linux-Gesamtlauf
behauptet.
