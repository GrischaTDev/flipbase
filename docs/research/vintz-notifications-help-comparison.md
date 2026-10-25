# Vintz: Benachrichtigungen und Hilfen im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Gesondert freigegebener Analyseblock V-19. Danach
stoppen und besprechen. Keine Aktivierung, Browserberechtigung, Testmitteilung,
Nachricht, Lesemarkierung, Löschung oder Umsetzung freigegeben.

## Ergebnis

Vintz bietet einen kompakten **Handlungsbedarf für offene Aufgaben** und eine
ausführliche **iPhone-Mitteilungsseite** mit Geräteübersicht, Tonauswahl,
Vorschau, verzögertem Test und konkreten Fehlerhilfen. Besonders übertragbar ist
die Erklärung, warum ein registriertes Gerät noch keine erfolgreiche Zustellung
bedeutet und warum eine Tonvorschau keinen Live-Verkaufsalarm prüft.

Flipbase hat bereits Web-Push, vier auswählbare Kategorien, sichere Zielöffnung,
einen Ereignisverlauf und technische Wiederhol-/Widerrufswege. Diese Grundlage
fehlt nicht. Allerdings ist der untersuchte Vinted-Pushpfad auf Betreiber mit
passender Workspace-Rolle begrenzt; daraus folgt keine allgemeine Freigabe für
alle Beta-Nutzer. Der Ereignisverlauf ist außerdem kein gleichwertiger Ersatz
für eine priorisierte Liste offener Aufgaben.

## Prüfrahmen und Zustand

- Vintz: [Cockpit](https://vintz.ai/cockpit), Handlungsbedarf und Befehlsmenü
  live gelesen; keinen Gesprächslink oder Erledigt-Button betätigt.
- [iPhone-Mitteilungen](https://vintz.ai/settings/notifications) im Desktopbrowser
  gelesen. Kein Mobilgerät verbunden; Aktivieren/Speichern/Test dort nicht
  verfügbar. Nur Fehlerhilfe aufgeklappt, keine Tonvorschau abgespielt.
- Produkt-E-Mail-Schalter unverändert gelesen. Normale GET-Antwort bestätigt
  HTTP 200 und `enabled: false`; keine Marketing-Einstellung geändert.
- Geladene eigene Webquellen und ergänzend der zuvor untersuchte Kontenbaustein
  gelesen. Kein Zugriff auf iOS-Appquellcode, APNs-Konfiguration oder tatsächlichen
  serverseitigen Pushversand. Aktuelle
  [Anbieterangaben](https://vintz.ai/datenschutz) getrennt eingeordnet.
- Flipbase: [Benachrichtigungen](https://app.flipbase.de/settings/notifications),
  aufklappbare Pushhilfe und Glocke live gelesen. Push war auf diesem Gerät
  **bereits aktiviert**, vier Kategorien bereits ausgewählt. Version `v0.357.2`.
- Quellen und unabhängiger Abgleich bei HEAD
  `d8993677cac943e2e280c47a973518d32274a519`; keine Gleichsetzung mit dem Stand
  jedes produktiven Hintergrunddiensts.
- Kein Zustell-, Sperrbildschirm-, Offline-, Mobil-, AXE- oder Belastungstest.
  Kein Fehler, Geräteverlust oder Kontowechsel absichtlich erzeugt.

## Vintz: drei unterschiedliche Benachrichtigungswege

| Weg                                  | Zweck und Beleggrenze                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handlungsbedarf in der Weboberfläche | Offene Aufgaben gruppieren und zum passenden Vorgang führen; hier ein Gespräch. Kein Systempush und kein vollständiger Ereignisverlauf.                                   |
| Mitteilungen an die iPhone-App       | Gerätefreigabe und native Hinweise für Verkäufe/Automationen. Seite und Clientmechanik gelesen, Zustellung nicht geprüft.                                                 |
| Vinted-Push an den Cloudworker       | Laut Anbieter kontoweiser Ereigniseingang über Firebase, etwa Nachrichten, Angebote, Favoriten und Verkäufe. Kein Beleg, dass der Desktopbrowser deshalb Web-Push erhält. |

Die [Datenschutzerklärung](https://vintz.ai/datenschutz) nennt Firebase für
eingehende Vinted-Ereignisse und Apple APNs für ausgehende iOS-Mitteilungen.
Diese Server-/Dienstleisterbeschreibung wurde nicht durch einen eigenen
Zustellversuch bestätigt.

### Handlungsbedarf

Der globale Button zeigte eine offene Nachricht. Der Dialog gruppiert sie als
Nachrichten und bietet Gespräch/Antwort sowie „Als erledigt markieren“.
Inhalt und private Kennungen werden hier nicht wiedergegeben. Der Gesprächslink
enthält den Cloudkontobezug, sodass nicht nur eine unbestimmte Postfachstartseite
geöffnet würde. Linkziel gelesen, Navigation nicht ausgeführt.

Der Baustein liest `/api/seller/attention` beim Einstieg sowie bei Fokus und
Rückkehr zur sichtbaren Seite; kurze Abrufsperren vermeiden unmittelbare
Doppelanfragen. Öffnen selbst liest nach. Ein Fehler behält einen gesonderten
Fehlerzustand statt einfach eine erfolgreiche leere Liste zu behaupten.
Das ist keine bestätigte sofortige Echtzeitversorgung.

„Erledigt“ sendet dagegen `POST /api/seller/inbox-state` mit Revision und
Bearbeitungsstand. Erst nach Erfolg wird der lokale Eintrag ausgeblendet,
anschließend nachgeladen; Fehler führen zu einer Meldung. Die Revision ist ein
sichtbarer Entwurf für Aktualitätsschutz, kein getesteter Mehrnutzerbeleg.
Badge über 99 wird als `99+` dargestellt. Auf einzelnen mobilen Arbeitsseiten
wird der zusätzliche schwebende Einstieg bewusst ausgeblendet.

Wichtig: **Offene Aufgabe, ungelesene Nachricht und historische Mitteilung sind
unterschiedliche Zustände.** Ein erfolgter Versand, ein abgeschlossenes Lesen
oder eine bloße Datenaktualisierung muss eine Aufgabe nicht automatisch erledigen.

### iPhone-Geräte und Voraussetzungen

Die eigenständige Seite ist über `/settings/notifications` erreichbar; in den
neun gelesenen Desktop-Einstellungsreitern war sie nicht als eigener Reiter
sichtbar. Funktionen sind dadurch vorhanden, aber im Desktop weniger leicht
auffindbar.

Die Geräteübersicht lädt registrierte aktive Geräte per GET und aktualisiert
bei Fokus, Sichtbarkeit, Geräteereignis sowie ungefähr minütlich. Sie unterscheidet
Laden, leer, vorhanden und Fehler. Nichtleere Einträge sollen Gerätename und
letzte Registrierung zeigen. Der Text erklärt ausdrücklich, dass Registrierung
keine aktuelle Onlineverbindung beweist. Hier war die Liste leer.

Die native Steuerung unterscheidet Berechtigung, technische Konfiguration und
lokalen Einschaltzustand. Aktivieren würde die iPhone-Berechtigung anfordern,
das Gerät registrieren und den Zustand speichern; Deaktivieren entfernt die
Serverregistrierung. Keine dieser Aktionen ausgeführt. Bestehende autorisierte
native Registrierungen können bei App-/Sitzungsereignissen erneuert werden;
das ist vom Desktopaufruf zu trennen.

### Töne, Vorschau und Test

Der Client enthält acht eigene Klänge sowie Systemstandard und lautlos.
Die eigenen Klänge sind in Glocken-, Kassen-/Münz- und Erfolgsgruppen eingeordnet.
Die Vorschau soll die Auswahl nicht ändern. Im Desktop waren Vorschaubuttons
verfügbar, alle Auswahlradios und Tests dagegen gesperrt. Nichts abgespielt.

Im nativen Pfad gibt es sofortigen Test oder **Test nach zehn Sekunden**, damit
der Nutzer den Bildschirm vorher sperren kann. Der gelesene Code ruft dafür
das native Testplugin auf. Ein Test kann bei fehlender Freigabe selbst eine
Berechtigungsanfrage auslösen. Er prüft deshalb nicht unabhängig den vollständigen
Weg von Vinted-Ereignis über Cloudregel und Server bis zum Gerät.

Die aufgeklappte Hilfe erklärt konkret:

- Lautlosmodus und Hinweislautstärke; Vorschau verwendet dagegen Medienlautstärke.
- Fokus und geplante Mitteilungsübersicht als mögliche Unterdrückung/Verzögerung.
- Sperrbildschirm und Banner in den iPhone-Einstellungen.
- Für laufende Verkaufsalarme zusätzlich verbundene Konten und aktivierte
  Benachrichtigungsautomationen.

Versionsabhängige Pluginfähigkeiten, fehlende Konfiguration, gesperrte
Berechtigung und nicht abspielbare Vorschau besitzen eigene Texte. Teilweise
verbleiben englische Beschriftungen innerhalb der deutschen Seite.
Die Hilfetexte sind ein Produktbefund, keine eigene Prüfung sämtlicher
iOS-Einstellungen.

### Navigation nach einer Mitteilung

Der native Webclient nimmt nur begrenzte relative Pfade derselben Herkunft an.
Eine erlaubte Routenliste enthält unter anderem Konten, Postfach, Einstellungen,
Galerie, Finanzen und Automationen; ein älteres Bestellziel wird umgeleitet.
Das schützt diesen Übergang vor beliebigen externen Zielen. Rollen-/Kontozugriff
des Servers und Verhalten bei ungespeicherten Eingaben sind dadurch noch nicht
umfassend geprüft. Die eigentliche Navigation wurde nicht ausgelöst.

### Produkt-E-Mails und Regelbenachrichtigungen

Produkt-E-Mails sind ein eigener freiwilliger Schalter für Tipps, Beispiele und
Creditangebote. Hier bestätigt aus. Das ist keine Einstellung für Verkaufsalarme
oder Transaktionsmails. Der gelesene Client fällt bei einem Ladefehler allerdings
ebenfalls auf aus zurück; ein gesonderter sichtbarer Fehlerzustand wäre klarer.
In diesem konkreten Fall wurde der Zustand zusätzlich mit erfolgreicher
GET-Antwort bestätigt.

Automationsregeln bieten eigene Pushtexte und Bedingungen, etwa Aufruf-/
Favoritenschwellen oder Verkauf; siehe
[Automationsvergleich](vintz-other-automations-comparison.md). Eine vorbereitete
Regel, ein angehaktes Teilstück und ein registriertes Gerät beweisen zusammen
noch keinen aktiven Gesamtprozess. Keine Regel eingeschaltet oder Testregel angelegt.

## Fehlerhilfen, Wiederherstellung und Support bei Vintz

Der geladene Kontenbaustein verbindet konkrete Fehler mit einem nächsten Schritt:

| Zustand                           | Vorgesehene Hilfe, nicht ausgeführt                                          |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Unklarer vorheriger Ausgang       | Aktivität und Vinted prüfen, bevor erneut versucht wird.                     |
| Anfragelimit                      | Wartezeit respektieren und Status prüfen.                                    |
| Abgelaufener Einmalcode           | Erneut anmelden und den neuesten Code verwenden.                             |
| Fehlende Anmeldung/Identität      | Konto erneut verbinden; gespeicherte Angebote sollen erhalten bleiben.       |
| Fehlender Proxy                   | Verbindung vervollständigen, bevor Anmeldung/Sync versucht werden.           |
| Fehlende Erweiterung/Berechtigung | Connect und passende Vinted-Seite prüfen.                                    |
| Allgemeine Erreichbarkeit         | Netz prüfen, richtigen Vinted-Tab offen halten und Verbindung erneut prüfen. |

Technische Details sind einklappbar. Diese Reihenfolge ist verständlicher als
ein allgemeiner Wiederholen-Button. Sie ist trotzdem keine Garantie sicherer
Wiederholung jeder Operation; siehe
[Cloud-/Erweiterungsvergleich](vintz-extension-cloud-comparison.md).

Ein ausgelieferter allgemeiner Fehlerbildschirm enthält erneuten Versuch,
Startseite, Support-Mail und gegebenenfalls eine Fehlerreferenz. Er wurde nicht
absichtlich ausgelöst. Die Formulierung „Deine Daten sind sicher“ ist eine
Anbieteraussage, kein hier bestätigter Nachweis für jeden lokalen Entwurf.

Support-Mail und Discordzugang sind in Produkt-/öffentlichen Verweisen vorhanden;
der Protarif nennt bevorzugten Support. Keine Mail, Discordverbindung oder
Supportanfrage ausgeführt. Keine Antwortzeit gemessen. In den gelesenen
Desktop-Navigations-/Befehlsmenü- und Supportverweisen kein eigener
Ticketverlauf oder durchgehend verlinktes Wissenszentrum gefunden. Das Tarifwort
„Help center“ allein belegt keine tatsächlich zugängliche Wissensdatenbank.

## Flipbase: vorhandene Benachrichtigungen und konkrete Grenzen

### Web-Push und Oberfläche

Die Live-Einstellungen zeigen vier Kategorien: Marktplatznachrichten,
Bestellungen, Vinted-Favoriten und erneute Anmeldung. Alle waren hier schon
ausgewählt. Kategorienänderungen speichern bei aktivem Gerät sofort; Aktivieren,
Deaktivieren und Test sind echte Aktionen. Nichts davon betätigt.

Die vorhandene Hilfe erklärt geräteweise Aktivierung, iPad-Installation auf dem
Home-Bildschirm, Gerätesteuerung für Ton/Nicht-stören und keine rückwirkende
Zustellung alter Meldungen. Im geprüften Code kein eigener Ruhezeitenplan
gefunden. Browserunterstützung und tatsächliche Gerätezustellung nicht neu getestet.

Gerät, Nutzer, Sitzung, Bindungsgeneration und Workspaceauswahl werden getrennt
geführt. Kategorien gelten je Gerät und Workspace. Neue Kategorien sollen nicht
ungefragt einschalten. Bei Offline-Deaktivierung wird der Widerruf vorgemerkt;
normales Statusprüfen kann ältere ausstehende Bindungen bereinigen. Daher ist
der Seiteneinstieg nicht für alle Ausgangszustände streng frei von
Serverbereinigung. Hier keine solche Bereinigung gesondert nachgewiesen und
keine aktive Änderung angestoßen.

Der Server besitzt Ereignis-/Geräteschutz gegen doppelte Zustellaufträge,
24 Stunden Ablauf und höchstens fünf Versuche. Abgelaufene Endpunkte werden
deaktiviert, vorübergehende Fehler kontrolliert wiederholt. **Annahme durch den
Pushanbieter bedeutet nicht bestätigte Anzeige, Ton oder Lesen.** Die Oberfläche
„Dieses Gerät ist für Push aktiviert“ ist deshalb keine Zustellbestätigung.

Die geprüften Vinted-Ereignisse erfordern zusätzlich Plattformbetreiber und
Owner-/Adminrolle. Versandfreigabe, VAPID-Konfiguration und mögliche Pilotlisten
liegen getrennt im Pushworker. Ein vorhandener Schalter allein belegt keine
allgemeine Freischaltung für normale Beta-Nutzer.

### Welche Ereignisse tatsächlich belegt sind

| Ereignis                    | Flipbase-Codebefund                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nachrichten/Preisvorschläge | Importbezogene Meldung mit Gesprächsziel und Referenz-/Wiederholschutz; alte nachgeladene Historie soll keine neue Meldung erzeugen.                   |
| Favoriten                   | Aus belegtem Importzuwachs und kontoweiser Freigabe; Glocke und Pushpfad vorhanden. Kein unmittelbarer Vinted-Ereignisempfang allein dadurch bewiesen. |
| Bewertungen                 | Glockenmeldungen und Profilziel vorhanden; kein entsprechender Bewertungspush in den geprüften Pushkategorien.                                         |
| Verbindungsstörung          | Meldung für bestätigte Störungsepisode; weiche Ablehnung bleibt still, bestätigte Erholung setzt spätere Episode frei.                                 |
| Bestellungen                | Waren-Shop-/eBay-Ereignisse vorhanden. Vinted-Verkaufskopie allein erzeugt in diesen untersuchten Pfaden keinen belegten Verkaufs-Push.                |

Diese Unterschiede sollten in Hilfe und Kategorienbezeichnungen sichtbar sein.
Insbesondere „Neue Bestellungen“ nicht als Beweis eines bereits angeschlossenen
Vinted-Verkaufsalarms verstehen.

### Glocke und gemeinsame Zustände

Die Glocke verbindet allgemeine Meldungen, Favoriten, Bewertungen und
Nachrichten/Preisvorschläge; nach Zeit sortiert, höchstens 50 sichtbare Einträge.
Live waren Artikel-/Gesprächsziele mehrerer Konten vorhanden. Keine Meldung
angeklickt, nichts gelesen markiert oder geleert. Mehrere Einträge zu demselben
Artikel/Gespräch beweisen für sich keine fehlerhaften Dubletten.

Öffnen lädt Feeds nach und markiert **nicht** gelesen. Ein Meldungsklick speichert
dagegen den Gelesenzustand; ohne Ziel öffnet er einen Textdialog. „Gelesen“ und
„Verlauf leeren“ betreffen alle vier Ströme und unter Umständen mehr als die
50 gerade sichtbaren Einträge. Im Leeren-Handler fehlt eine vorgeschaltete
Bestätigung. **Diese Zustände sind Workspacezustände, kein persönliches
Nutzerpostfach.** Das ist bei Teamarbeit wesentlich.

Ein Teil des Verlaufs wird tatsächlich gelöscht, andere Ereignisse werden
intern nur ausgeblendet und für Wiederholschutz erhalten. Die vier
Sammeloperationen laufen unabhängig; bei Teilerfolg gibt es keinen gemeinsamen
Rollback, aber eine Fehlermeldung. Der Header zeigt ausdrücklich nur den
Favoriten-Feedfehler; andere Quellen besitzen ebenfalls mögliche Ladefehler.
Eine einheitliche Teilstands-/Fehleranzeige fehlt damit im gelesenen Template.

Marktplatzfeeds besitzen private Livekanäle, Wiederverbindung und zusätzlichen
Abgleich. Suche, Kategorienfilter und vollständige nachladbare Historie wurden
im Glockenmenü nicht gefunden. Die Glocke darf daher nicht als vollständiges
Prüfarchiv ausgegeben werden.

### Zielöffnung, Webhooks und sonstige Hilfen

Pushziele werden vor Öffnen mit Anmeldung, Workspacezugang sowie passendem Konto
und Gespräch geprüft. Offene Erfassungen verhindern ungewollten Workspacewechsel;
das Ziel bleibt vorgehalten. Diese vorhandene Absicherung sollte erhalten bleiben.
Ein Pushklick selbst ist keine Gelesen-Markierung der Glocke; die geöffnete
Fachansicht kann anschließend eigene Leseaktionen durchführen. Nicht getestet.

Discord, Telegram und eigener Webhook besitzen getrennte Workspacekonfiguration.
Hier waren alle drei Kanäle aus. **Ein Webhook-Test speichert zuerst die
Konfiguration und sendet danach extern.** Deshalb weder Test noch Kanal-/
Zugangsdatenfeld betätigt. Kein Nachweis erfolgreicher externer Zustellung.

Flipbase hat außerdem Offlinehinweis, PWA-Installationshilfe, Updatehinweis und
zentrale Fehlermeldungen. Schließen eines Fehlertoasts repariert keinen Datensatz
und wiederholt keinen Anbieterauftrag. Die Offlinehülle ist keine allgemeine
Offlinekopie von Auth, API und privaten Medien.

Die Navigation „Ideen“ enthält zurückgestellte Produktseiten, kein
Vorschlags-/Supportboard. Im untersuchten Appumfang kein allgemeiner
Supportchat-/Ticketpfad gefunden. Beta-Discord ist ein eigener Zugang;
dessen Verbindung wäre ein echter OAuth-Vorgang und wurde nicht gestartet.

## Festgehaltene Empfehlungen, noch ohne Umsetzung

| Priorität   | Richtung für Flipbase                         | Später überprüfbares Ergebnis                                                                                                     |
| ----------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Zuerst      | Aufgaben und Ereignisverlauf unterscheiden    | Offene Antworten/Verbindungsprobleme mit nächstem Schritt; historischer Verlauf bleibt getrennt.                                  |
| Zuerst      | Geltungsbereich erklären                      | Nutzer, Gerät, Workspace und Konto erkennbar; gemeinsame Lesemarkierung/Leeraktion verständlich.                                  |
| Zuerst      | Tatsächliche Pushabdeckung sichtbar machen    | Betreiber-/Pilotgrenzen und fehlender Vinted-Verkaufsalarm nicht durch breite Kategorienbezeichnungen verdecken.                  |
| Danach      | Geräte- und Fehlerhilfe ergänzen              | Aktiviert, registriert, erreichbar, Anbieterannahme und tatsächlicher Test werden getrennt angezeigt; konkrete Lösung je Zustand. |
| Danach      | Teststufen klar benennen                      | Vorschau, Gerätetest und echter Ereignisweg unterscheiden; verzögerter Test als sinnvolle Vintz-Referenz.                         |
| Danach      | Verlauf komfortabler und transparenter machen | Filter/Gruppierung und Teilstandsfehler prüfen; Löschwirkung und Sammelaktionen deutlich erklären.                                |
| Beibehalten | Geschützte Zielöffnung und Widerruf           | Kein Verlust offener Erfassung, korrekter Konto-/Workspacebezug, Offline-Widerruf nachvollziehbar.                                |
| Später      | Hilfezugänge bündeln                          | Einstieg für Verbindung, Push, Installation, Updates und Support mit unkritischer Fehlerreferenz.                                 |

Keine neue Aktivierung, kein Testversand und kein allgemeiner Supportkanal
beschlossen. Die iPhone-Töne sind eine Komfortreferenz, kein Grund für eine
ungeprüfte native Neuentwicklung.

## Belege und Abschluss

Vintz-Quellen: `3t_pt7lo8x2se.js` (Handlungsbedarf/native Übergabe),
`35zhr7v0amv8-.js` (Push-/Tonkonfiguration), `3wieb1b7_id2f.js`
(iPhone-Seite), `0k10gzq8aymr7.js` (Fehlerbildschirm),
`1uazo7jif0xsj.js` (Supportverweise), ergänzend `2xesihr9dsymb.js`
(zuvor geladene Kontenhilfe). URLs, Länge und SHA-256 in den
[Quellenkennungen](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-notification-help-source-identities-2026-10-18.json).

Bildbelege:
[Vintz-iPhone-Seite](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-iphone-notifications-2026-10-18.png),
[Flipbase-Pushhilfe](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-notification-settings-help-2026-10-18.png),
[bereinigte E-Mail-Präferenz](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-email-preference-2026-10-18.json).
Keine privaten Gesprächsinhalte oder vollständigen Push-/Geräteantworten in den
Bericht übernommen; keine Zugangsdaten exportiert.

Flipbase-Belege:

- [Einstellungsoberfläche](../../src/app/features/settings/pages/notification-settings/notification-settings.component.html),
  [Einstellungsaktionen](../../src/app/features/settings/pages/notification-settings/notification-settings.component.ts),
  [Glockenlogik](../../src/app/layout/header/header.component.ts),
  [Glockenvorlage](../../src/app/layout/header/header.component.html).
- [Geräte-/Widerrufsdienst](../../src/app/core/services/web-push.service.ts),
  [geschützte Navigation](../../src/app/core/services/push-navigation.service.ts),
  [Service Worker](../../public/sw.js),
  [Versandfreischaltung](../../services/push-worker/src/config.ts).
- [Geräte und Kategorien](../../supabase/schemas/470_web_push_devices.sql),
  [Zustellmodell](../../supabase/schemas/471_web_push_delivery.sql),
  [Ereignisse und Fachrechte](../../supabase/schemas/472_web_push_events.sql),
  [Nachrichtenereignisse](../../supabase/schemas/425_marketplace_message_notifications.sql).
- [Zentrale Fehler](../../src/app/core/services/sync-status.service.ts),
  [PWA-Hilfe](../../src/app/core/services/pwa.service.ts),
  [Updatehinweis](../../src/app/shared/components/pwa-update-notice/pwa-update-notice.component.html),
  [Ideennavigation](../../src/app/core/config/workspace-navigation.ts).

Offen: tatsächliche Zustellung und Berechtigungs-/Gerätewechsel, Delay und
Fokusverhalten, Rückstände/Dubletten unter Last, Rollenentzug, Teamzustände und
reale Supportantwort. Keine pauschale Aussage, jede vorhandene Meldung sei
vollständig oder jedes Gerät werde zuverlässig erreicht.

Nur Dokumentation geändert. Die Browseroberfläche reagierte beim Aufräumen
verzögert; anschließend alle vier separaten Lesetabs erfolgreich geschlossen.
Keine Aktivierung, Erlaubnis, Tonprobe, Lesemarkierung, Verlaufslöschung,
Testmitteilung, Supportnachricht oder Umsetzung ausgeführt. Bestehende Tabs und
pausierte Flipbase-Verbindung unberührt. **Danach Stopp zur Besprechung.**
