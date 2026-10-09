# Lokales Vinted-Postfach

Stand: 04.10.2026. Folgepaket zum erfolgreichen Profil-/Inseratepilot, auf
Nutzerauftrag anhand der Bleam-Codebefunde (Rechercheprotokoll, Punkt 37).

## Folgepaket vom 05.10.2026

### Favoritennachrichten: erste lokale Automatisierung

Die eigene Vinted-Seite **Favoritennachrichten** setzt die belegten Abläufe aus
dem [Bleam-Rechercheprotokoll, Punkt 39](../research/bleam-vinted-analysis.md)
mit eigenem Code um. Pro Konto sind mehrere Standardtexte, geordnete Regeln
nach Uhrzeit, Wochentag und Preis sowie eine Verzögerung bis sieben Tage möglich.
Die erste passende Regel gilt, sonst ein Standardtext. Die Auswahl einer Variante
bleibt für denselben Versuch stabil. `{article}` ersetzt den Artikeltitel;
Uhrzeit und Wochentag beziehen sich auf den Versand in Europe/Berlin.

Aktivierung und Speichern sind getrennt von der Bearbeitung. Die Grundeinstellung
ist aus. Vor der ersten Aktivierung bestätigt der Nutzer die automatische
Nachricht und erteilt bei Bedarf die vorhandenen lokalen Lese-/Versandrechte.
Ein neuer Freigabestand übernimmt die Automatik nicht stillschweigend; die
erneute Bestätigung setzt den Beginn für neue Favorisierungen neu.

Erweiterung **1.4.0** prüft etwa alle fünf Minuten die neuesten Benachrichtigungen
über `/web/api/notifications/notifications` mit `mark_as_read=false`, höchstens
zwei Seiten mit je 100 Einträgen. Nur Favoriten mit bestätigter Interessenten-,
Artikel- und Ereigniskennung werden übernommen. Dieser lesende Endpunkt wurde
im freigegebenen Browser bestätigt; die reale neue Favorisierung wurde nicht
zum automatischen Versand verwendet. Frühere Ereignisse bleiben ausgeschlossen.

Fällige Aufträge werden etwa alle 90 Sekunden einzeln übernommen. Im reservierten,
inaktiven Arbeitstab werden Konto, verfügbarer Artikel und vorhandene Gespräche
erneut geprüft. Die Erweiterung erstellt die Unterhaltung mit
`seller_enters_notification` und nutzt danach den vorhandenen bestätigten
Nachrichtenversand. Dafür wird kein zusätzlicher Aktionstab geöffnet. Bestehende
Unterhaltungen und jeder bereits gefüllte zurückgegebene Verlauf werden zunächst
konservativ ausgelassen. Dieser letzte Fall braucht die Echtkonto-Abnahme.

Ereignis, Claim, Versandbeginn und Ergebnis bleiben in der Datenbank gespeichert.
Der lokale Ergebnisauftrag wird erst nach bestätigtem Serverstart und vor dem
Provideraufruf gespeichert. Ein zuvor abgelehnter Auftrag blockiert dadurch
keine weiteren Abgleiche; ein Abbruch nach Serverstart bleibt dort unklar.
Ein Versuch pro Interessent/Artikel, kein automatischer Neuversand nach unklarem
Ausgang. Ein unbegonnener abgelaufener Claim darf wieder aufgenommen werden;
ein begonnener abgelaufener Versand wird unklar. Nach einem Browserneustart wird
nur das gespeicherte Ergebnis erneut gemeldet. Regeländerung und Abschalten
verwerfen noch nicht begonnene Nachrichten. Anmeldung, Identitätswechsel,
Prüfungsfenster und Abrufbegrenzung verwenden die vorhandenen Pausen.

Der Verlauf zeigt die letzten 30 Ereignisse und den Zeitpunkt der Prüfung.
Angebote, Mehrartikelvorlagen und der Cloud-Ausführer gehören zum Folgepaket.
Die bereits vorhandenen Favoritenmeldungen anhand der Inseratzähler bleiben
separat; diese Automatik beantwortet neue Favorisierungen mit Textnachrichten.

**Prüfung:** 62 neue Datenbankassertions und 153 bestehende lokale Assertions
nach Einspielen der erzeugten Migration erfolgreich. Der vollständige öffentliche
Schema-Dump inklusive Rechten stimmt mit dem Zielstand überein. Datenbanktypen
sind aus der migrierten Datenbank neu erzeugt. 107 betroffene Workflowprüfungen,
21 Deno-Tests einschließlich der tatsächlichen RPC-Zuordnung, drei Modelltests
und fünf Angular-Komponententests bestanden. Desktop-/Mobiltest mit AXE,
Typprüfung, betroffene Lint-/Formatprüfung und Produktionsbau bestanden.
Der zusätzliche Angular-CLI-Testbuilder scheitert an vorhandenen Tests in
Einkauf und Shell; der projektübliche Angular-Vitest-Lauf ist grün.

**Rollout und Abnahme:** Anwendung, Migration und Edge Function gehören gemeinsam
in den PR. Danach den bisherigen entpackten Erweiterungsordner auf 1.4.0
aktualisieren und die Erweiterung sowie Vinted/Flipbase neu laden. Erst im
bestätigten Konto einen geprüften deutschen Text aktivieren und eine danach
eingehende neue Favorisierung vom gespeicherten Ereignis bis zur tatsächlich
sichtbaren Nachricht abnehmen. Ausschalten, vorhandenes Gespräch und Kontowechsel
mitprüfen. Keine echte automatische Nachricht ist bislang gesendet.

### Gespeicherte Gespräche sofort anzeigen und im Hintergrund prüfen

Bereits geladene Verläufe bleiben im Arbeitsspeicher des aktuellen Kontostores
(höchstens 50 Gespräche). Beim Wiederöffnen erscheinen Kopf, Artikel, Nachrichten
und Antwortfooter sofort. Ohne diesen Zwischenspeicher wird zuerst der vorhandene
Datenbankstand gelesen; sobald Nachrichten vorliegen, erscheinen sie bereits
während des nachfolgenden Vinted-Abgleichs. Ein noch fehlender Verlauf zeigt
den mittigen gelben Ladeindikator.

Der orange Shared-Status „Wird aktualisiert“ bleibt bis zum Ende von
Datenbankabruf, Vinted-Import und erneutem Datenbanklesen sichtbar. Danach
erscheint der grüne Status; bei Fehlern bleiben die gespeicherten Nachrichten
sichtbar und der Status nennt den fehlgeschlagenen Abgleich. Bereits nachgeladene
ältere Nachrichten werden ebenfalls erneut aus der Datenbank gelesen, damit
der sichtbare Verlauf nicht auf die erste Seite zurückfällt.

Die bewusste Vinted-Prüfung bei jedem Öffnen bleibt erhalten. Schnell wechselnde
Auswahlen warten den laufenden Detailabruf ab; überholte Auswahlen starten danach
keinen zusätzlichen Abruf. Konto-/Nutzer-/Workspacewechsel, Rechteentzug und
Zerstören des Stores leeren den Zwischenspeicher. Nachrichten werden nicht in
localStorage geschrieben. Die Erweiterung und ihre Rechte bleiben unverändert.

### Korrektur nach der Kontoabnahme: Erweiterung 1.3.1

Der Antworteditor bleibt im Kartenfooter, der Gesprächskopf darüber mit letzter
bekannter Aktivität und schlankem Artikelstreifen. Der Verlauf scrollt separat;
Tagestrenner und Uhrzeiten, Angebotsbeträge mit durchgestrichenem Ausgangspreis
und Entscheidung bilden den Ablauf ab. Produktbilder füllen den Listenrahmen.
Filter zeigen die Anzahl der **gespeicherten** Gespräche je Kategorie, auch Null.
Die Kontopille zeigt Profil und letzten Postfachabgleich; Warteschlangenhinweise
erscheinen erst bei tatsächlich ausstehenden Nachrichten.

Der eigene Arbeitstab bleibt bei bewussten Gesprächsabrufen und Fehlern im
Hintergrund. Fehlende Tabs werden inaktiv angelegt, gespeicherte wiederverwendet.
Der Tab ist angeheftet und steht zuerst, mit gelbem Flipbase-Symbol und Titel;
sein Rahmen folgt dem Browserdesign. Anmeldungen und Prüfungen bleiben manuell
bedienbar, führen aber nicht mehr zu einem ungefragten Fokuswechsel.

Detailantworten ohne `updated_at` verwenden die neueste echte Nachrichtenzeit
oder die bekannte Listenrevision. Unterstützt werden `created_at_ts` und
`created_at` am Nachrichtenobjekt und in `entity`; fehlende oder ungültige Zeiten
werden nicht erfunden. Die Schlüssel vorhandener Systemereignisse bleiben
stabil. Angebotsstatus 10/20/30/40 wird als offen/angenommen/abgelehnt/abgebrochen
angezeigt. Beide belegten Beträge stehen im bestehenden `priceLabel`-Feld;
hierfür ist keine Migration nötig.

Die Änderungen sind lokal mit synthetischen Konten prüfbar. Die Echtkonto-Abnahme
erfordert nach Veröffentlichung auch ein Neuladen der Erweiterung 1.3.1.

Der echte lesende Kontotest war erfolgreich. Der nächste Schritt erweitert den
Pilot um das produktbezogene Postfach und den laufenden lokalen Betrieb:

1. Artikelbilder in der Gesprächsliste; Partner und bekannte letzte Aktivität
   im Chatkopf, darunter Artikelbild, Titel und Preis. Fehlende Angaben bleiben
   leer. Suchfeld, Statusfilter und Sortierung verwenden gespeicherte Fakten.
2. Kompakter Kontostatus mit Zeitpunkt des letzten Postfachimports und manuellem
   Aktualisieren statt großen Importzählungen. Aktionsbedarf bleibt sichtbar.
3. Persistierte Chrome-Alarme prüfen die neuesten Gespräche alle fünf Minuten;
   ältere Seiten werden separat in begrenzten Ein-Minuten-Schritten nachgeladen.
   Ausstehende Versandaufträge werden ungefähr alle 90 Sekunden geprüft.
   Chrome kann Alarme verzögern. Neustarts holen keine unbeschränkten versäumten
   Durchläufe nach.
4. Bewusstes Öffnen lädt den ausgewählten Verlauf direkt. Der automatische
   Abgleich öffnet ungelesene Details weiterhin nicht. Es wird kein expliziter
   Vinted-Markierungsparameter gesetzt; dessen mögliche Lesewirkung wird beim
   echten Kontotest geprüft.
5. Separat freigegebener Text- und Einzelbildversand: maximal 5.000 Zeichen,
   JPEG/PNG nach Komprimierung maximal 256 KiB. Geschützte Auftragsdaten enthalten
   Bildbytes, öffentliche Statusantworten nur Dateiname und Format.
6. Stabile Anfrage-ID verhindert doppeltes Einreihen. Ein Auftrag wird atomar
   übernommen und vor genau einem Provider-Versuch als begonnen gespeichert.
   `queued`, `claimed`, `sending`, `sent`, `failed`, `outcome_unknown` und
   `cancelled` bleiben unterscheidbar. Ein HTTP-Erfolg ohne eindeutigen externen
   Nachrichtenbeleg zählt nicht als bestätigter Versand. Unbekannte Ergebnisse
   werden nicht automatisch erneut gesendet.

Bleam-Protokolle dienen als belegte Schnittstellenreferenz; Originalquellcode,
Pakete und Zugangsdaten werden nicht übernommen. Anmeldung, SMS, Captcha, Sperren
und Drosselung pausieren den Browserbetrieb. Die gemeinsame Identitätsprüfung,
Kontofreigabe und Ausführungssperre gelten auch für Alarme und Versand.

Erweiterungsversion: 1.3.0. Die erzeugte Migration wurde transaktional auf den
bisherigen Stand angewandt; 292 Datenbankprüfungen sind grün. Produktionsbau,
Typen, gezielte Frontend-/Erweiterungs-/Edge-Tests und die Postfach-Browserprüfung
auf Desktop und Mobil samt AXE sind bestanden. Es gab keine Live-Vinted-Anfrage
und keinen echten Versand. Die vollständige Historie wird weiterhin nicht
behauptet; der kompakte Synchronisierungsstatus nennt den letzten übernommenen
Stand. Fragen-/Verhandlungsfilter nutzen vorhandene Text- und Statusmerkmale.

Der Bildversand hat noch keinen im Echtkonto belegten Bestätigungsvertrag.
Nach einem einzelnen Versandversuch bleibt das Ergebnis deshalb gegebenenfalls
`outcome_unknown`; die Oberfläche weist vor dem Senden darauf hin. Nach dem
Rollout prüfen wir eine bewusst freigegebene Text-/Bildnachricht und den
Lesestatus beim bewussten Öffnen eines ungelesenen Gesprächs.

Am 08.10.2026 um 23:52 Uhr wurde ein ausdrücklich freigegebenes Flipbase-Testlogo
von Maike Vintage an wiehenvintage genau einmal über Cloud versendet. Text und
Bild sind beim Empfänger auf Vinted sichtbar. Der Cloudauftrag bleibt dennoch
`outcome_unknown` / `reply_unconfirmed`; er wurde nicht wiederholt. Die beobachtete
`legacy_reply` enthält Bildadressen in `data.entity.photos`, aber keine temporäre
Uploadkennung. Der Cloudimport übernimmt diese Foto-Entity jetzt in das bestehende
`imageUrls`-Feld, auch bei reinen Bildnachrichten. Diese Importkorrektur ist noch
nicht veröffentlicht. Der sichtbare Empfang ersetzt weiterhin keinen automatischen
Nachweis der Zuordnung zum konkreten Upload.

Die folgenden Abschnitte dokumentieren den vorherigen lesenden Pilot 1.2.0.

## Ziel und Grenzen

Eine bestehende lokale Installation erhält nach ausdrücklicher Bestätigung
den separaten Nachrichtenlesezugriff (`messagesRead`). Gespräche und bereits
gelesene Verläufe werden gezielt in den
bestehenden Kontospiegel übernommen. Ungelesene Verläufe bleiben geschlossen.
Keine Nachrichten senden, Verkäufe ableiten oder Cloudarbeit starten.

Der Vinted-Abgleich ist vom Lesen gespeicherter Daten getrennt. Die Erweiterung
liest mit der bestehenden Sitzung im reservierten Tab. Anmeldung, SMS, Captcha,
Sperren und HTTP429 unterbrechen den Abruf; keine Wiederholung von Provider-Reads.
Alte Grants bleiben ohne Nachrichtenrecht. Die Erweiterung erhält niemals
Supabase-Nutzertoken, Cookies oder Servergeheimnisse.

## Gemeinsamer Vertrag

- Grant: `messages_read boolean default false`, `inbox_next_page integer default 1`.
- Binding und Heartbeat: `messagesRead` (bei alten Antworten optional, dann false).
- Authentifizierte RPC `marketplace_approve_local_inbox(workspace, connection,
token_hash, expected_external_account_id)` ergänzt genau diese Installation;
  kein Austausch des Hashes, keine Verlängerung der bestehenden Ablaufzeit.
- Edge-Aktion `inbox_state` liefert nach voller Grantprüfung `ok`, `externalAccountId`,
  `expiresAt`, `messagesRead`, `nextPage` und `versions` (höchstens 400 gespeicherte
  Gesprächsversionen, gleiche Form wie der vorhandene Cloud-Leser).
- Edge-Aktion `inbox_import` hat `batch`: `identity`, `observedAt`, `page`,
  `nextPage`, `conversationsComplete`, `entries`.
- Ein Abruf liest eine Inbox-Seite à 20 Gespräche, höchstens drei neue/geänderte
  bereits gelesene Details, höchstens 200 Nachrichten insgesamt. Der nächste
  Lauf setzt bei der nächsten Inboxseite fort; nach dem letzten Blatt wieder
  Seite 1. Höchstens 20 Seiten; größere Postfächer bleiben ausdrücklich Teilstand.
- Ein Batch enthält höchstens 20 Gespräche und 200 Nachrichten, maximal 512 KiB.
  Stabile IDs/Elternzuordnung entsprechen den vorhandenen Cloud-Importobjekten.
  Systemereignisse ohne ID verwenden denselben deterministischen SHA256-Schlüssel.
- Unveränderte Verläufe mit `detailCheckedAt` jünger als 24 Stunden werden
  übersprungen; vorhandene Detailvorschau bleibt erhalten. Bei abgeschnittenen
  Details wird kein neuer Detailprüfzeitpunkt gespeichert.
- Gespräche zuerst schreiben, Nachrichten über deren kontogebundene Eltern.
  Wiederholungen dürfen weder Duplikate noch eine neue Elternzuordnung erzeugen.
  Teilimporte löschen nichts. Quellenaktualität getrennt für Profil/Inserate und
  Postfach; Nachrichten bleiben ausdrücklich Teilstand.
- Neue Bridge-Aktion `FLIPBASE_VINTED_LOCAL_INBOX_SYNC`, interne Aktion `INBOX_SYNC`.
  Ergebnis: Kontoscope, Identität, Ablaufzeit, `observedAt`,
  `counts: { conversation, message }`, `conversationsComplete`, `nextPage`.

## Umsetzung und Prüfung

1. Schema, Freigabe, strikte Edge-Verträge und atomare Inbox-RPC mit Tests.
   Migration erzeugen, SQL prüfen, DB-Typen aus der isolierten Datenbank erzeugen.
2. Eigener lokaler Inbox-Leser und Runtime, mit synthetischen Providerantworten:
   Versionsvergleich, ungelesene Gespräche, Kontowechsel, IDs, Größen-/Zeitgrenzen,
   Fehler, Widerruf sowie Wiederaufnahme nach Neustart.
3. Postfach: Freigabe bestätigen, gezielt synchronisieren, gespeicherte Gespräche
   anzeigen, Erfolg/Teilstand/Quelle sichtbar. Bestehende Kontokontext- und
   Lesepositionsregeln erhalten. Angular-, Build-, Browser-/AXE-Prüfungen.
4. Gemeinsames Review und Abnahme mit echtem Konto nach Veröffentlichung.

Regelmäßige Abgleiche werden nach dem echten lesenden Kontotest aktiviert.
Bleams nomineller Fünf-Minuten-Takt ist die Ausgangshypothese für dieses spätere
Betriebspaket; tatsächliche Abrufe, Laufzeit und Verbrauch werden dann gemessen.

## Gemeinsamer Ausbau vom 08.10.2026

Der bestätigte [Cloud-Postfachplan](../superpowers/plans/2026-10-08-vinted-cloud-inbox.md)
ergänzt diesen ursprünglichen lokalen Vertrag. Cloud und Extension übernehmen
jetzt belegte Eingangsdaten über denselben atomaren Import. Der ausdrücklich
freigegebene Echtkonto-GET einer ungelesenen Gesprächskopie hat deren Ungelesen-Flag
vorher/nachher erhalten. Drei begrenzte Kopien pro Lauf liefern echte Nachrichten-
und Preisvorschlagskennungen; der Gelesen-Aufruf bleibt vom Eingangsabruf getrennt.

Die Glocke führt zum richtigen Konto und Gespräch. Gemeinsamer Composer und
Warteschlange bedienen beide Ausführer; Cloud benötigt eine eigene aktuelle
Schreibfreigabe. Vorhandene Favoriten-/Angebotsregeln bleiben ausgeschaltet, bis
Du sie bewusst aktivierst. Der isolierte Cloud-Browserdienst unterstützt diese
Aktionen einschließlich zentraler Preisbestätigung.

Anmeldeprüfung, geänderte Identität und Abrufbegrenzung nach einem Cloudversand
pausieren auch weitere Nachrichten desselben Kontos. Manuelle Nachrichten
benötigen keine eingeschaltete Hintergrundautomatik, beachten aber deren
Anmelde-/Prüfungspause und Wartezeit. Alte Profilabschlüsse ändern keine neue
Kontofreigabe. Eine bestätigte Neuanmeldung entfernt den alten Anmeldefehler;
eine andere Prüfungspause bleibt bis zur bewussten Wiederaufnahme erhalten.
Ein bestätigtes Versandresultat bleibt nach späterem Widerruf gespeichert,
ohne dadurch eine weitere Browseraktion zu erlauben.

Scheitert der zusätzliche Favoritenabruf, werden bestätigte normale Kontodaten
und Nachrichteneingänge trotzdem übernommen. Die Fehlermeldung und Wartezeit
bleiben erhalten; ein fehlgeschlagener Favoritenabruf gilt nicht als leere Liste
oder vollständiger Erfolg. Ein Postfach ohne prüfbare Gesprächskopien setzt
keinen Erstbestand, solange seine tatsächliche Leere nicht bestätigt ist.

Unabhängiges Review und dessen Regressionen, 663 Datenbankprüfungen, 468
Workerprüfungen, die vollständigen Anwendungssuiten und 16 Browser-/AXEfälle
bestehen. Sieben bestehende Workerprüfungen sind ausgelassen. Beide Container-
bauten und der Runtime-Smoke mit ausgeschaltetem Netzwerk bestehen. Die
veröffentlichte Anwendung und registrierte Extension wurden noch nicht aktualisiert.
Glockeneingang und Versand im Echtkonto müssen nach Veröffentlichung abgenommen
werden. Ohne eindeutigen Bildnachweis bleibt ein Bildversand als unklar markiert.
