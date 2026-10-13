# Flipbase als PWA auf Smartphone und Tablet

Stand: 13.10.2026. Planungsstand, keine Freigabe für Produktcode, Migrationen oder Veröffentlichung.
Geprüfte Grundlage: `origin/master`, Commit `c1d4564a65d88b93e24ca4a4fadd2f2fd8f15099`.

**Aktuelle Nutzerkorrektur vom 13.10.2026 nach der Veröffentlichung:** Installation nur auf Smartphone und Tablet anbieten. Keine sichtbaren lokalen Entwürfe, zusätzlichen Menüpunkte oder manuelle Übernahme. Die normale Einkaufsmaske erhält einen internen Puffer; ausschließlich bereits beauftragte Speicherungen werden bei erreichbarer Verbindung mit unverändertem Auftrag und aktueller Rechteprüfung fortgesetzt. Diese Entscheidung ersetzt die nachfolgenden historischen Aussagen zu einem gesonderten Offline-Einkaufsablauf. Die übrigen PWA-/Push-Verträge bleiben bestehen.

## Auftrag und bestätigte Entscheidungen

Flipbase soll sich beim Installieren, Starten und täglichen Bedienen wie eine sorgfältig ausgearbeitete App anfühlen. Gewünscht sind ein eigener Ladebildschirm und echte Push-Benachrichtigungen bei geschlossener App.

Bestätigt wurden:

- Offline: App-Start und lokale Einkaufsentwürfe mit ausdrücklicher späterer Übertragung.
- Erste Push-Kategorien: neue Marktplatznachrichten, neue Bestellungen und Kontoprobleme.
- Verkäufe, Bestandsbuchungen und Marktplatzaktionen bleiben online.

Die folgenden Detailentscheidungen sind begründete Vorschläge dieses Plans. Sie sind noch nicht einzeln vom Nutzer freigegeben. Insbesondere lokale Aufbewahrung, Entwurfsumfang und die neue serverseitige Versandbibliothek werden vor Umsetzung zusammen mit diesem Dokument überprüft.

## Verifizierter Bestand

| Bereich         | Vorhanden                                                                                                                                         | Konkrete Lücke / Konsequenz                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installation    | `public/manifest.webmanifest`: `id: /`, `start_url: /`, `display: standalone`, normale und maskierbare Icons; Apple-Metadaten in `src/index.html` | `PwaService.promptInstall()` funktioniert nur mit gespeichertem `beforeinstallprompt`. Der Einstellungsbutton wird trotzdem immer angezeigt, solange die App nicht als installiert erkannt wird.                               |
| App-Modus       | `display-mode: standalone` und `navigator.standalone` werden geprüft                                                                              | Installationsstatus und tatsächlich gestarteter App-Modus werden vermischt; Installation im Browser heißt nicht, dass dieses Fenster standalone läuft.                                                                         |
| Service Worker  | Eigener `public/sw.js`, Registrierung nur in Produktion                                                                                           | Fester Cache `flipbase-os-v4`, sofortiges `skipWaiting()`, Löschen aller anderen Cache-Namen, kein vollständiger Cache der Angular-Chunks. Ein unveränderter Worker erfährt von einem neuen App-Build nicht zuverlässig.       |
| Offline         | Statische Dateien werden gespeichert; Supabase-Verkehr wird ausgespart                                                                            | App-Dateien sind kein Geschäftsdaten-Cache. Noch nicht besuchte Lazy-Routen können offline fehlen. Alte Einkaufsaufnahmen werden nur durch `LegacyPurchaseRecoveryService` gesichert, nicht neu erfasst oder synchronisiert.   |
| Start           | `src/main.ts` bootstrapped Angular; `src/app/app.html` enthält Router und Toasts                                                                  | Kein sichtbarer Zustand vor JavaScript/Angular; Bootstrapfehler landen nur in der Konsole.                                                                                                                                     |
| Zugriff         | `authGuard`, `workspaceAccessGuard`, `workspaceSetupGuard` prüfen Sitzung und Workspace                                                           | Onlineabfragen beim Start; der Workspace-Guard leitet auch bei Abruffehlern zu `beta-ended`. Ein Offline-Cache allein genügt nicht.                                                                                            |
| Mobile UI       | Responsive Shell, Sidebar und `bottom-nav`; gemeinsame Touch-Controls                                                                             | Kein zentraler Safe-Area-Vertrag; Shell verwendet `min-h-screen`; kein eigener Nachweis für installierte App, Tastatur und iPad-Split-View.                                                                                    |
| Push            | `WebPushService` fragt `Notification`-Berechtigung ab und erzeugt `new Notification()`                                                            | Kein PushManager-Abonnement, VAPID, serverseitiger Versand, `push`- oder `notificationclick`-Handler. Die laufende Seite ist Voraussetzung.                                                                                    |
| Meldungsquellen | Nachrichteneingänge in `425_marketplace_message_notifications.sql`; eBay-Bestellimport, Shop-Bestellungen und Kontostatus existieren              | Keine gemeinsame dauerhafte Push-Versandliste. Vinted-Nachrichten sind an vorhandene Verwaltungsrechte gebunden. `app_notifications` kann von Clients beschrieben werden und ist allein keine vertrauenswürdige Versandquelle. |
| Wiederholungen  | `PurchaseService.createPurchase(payload)` unterstützt `request_id`; `create_purchase` sperrt und dedupliziert pro Workspace                       | Vorhandenen Vertrag für Entwurfsübertragung wiederverwenden; keinen zweiten Einkaufs-Endpunkt erfinden.                                                                                                                        |
| Auslieferung    | Nginx schützt `sw.js` und `index.html` vor HTTP-Caching; CSP erlaubt Skripte und Worker nur von eigener Herkunft                                  | Start-Fallback als eigene Datei, kein Inline-Skript. Manifest wurde als `application/octet-stream` ausgeliefert; MIME-Typ korrigieren. Der allgemeine Immutable-Block trifft auch unversionierte statische Dateien.            |
| Tests           | Kleine PWA-Diensttests; gerenderte Einstellungs-/Navigationstests; E2E über Entwicklungsserver                                                    | Entwicklungsserver aktiviert den Worker nicht. Eigene Tests mit Produktionsbau und realem Worker fehlen.                                                                                                                       |

Öffentlich am 13.10.2026 geprüft: Manifest, Worker, 192-/512-Pixel-Icons und Apple-Icon unter `https://app.flipbase.de` jeweils HTTP 200. Der Worker entspricht der geprüften Quelldatei. Dies belegt die Auslieferung, keine erfolgreiche Geräteinstallation, Offline-Bedienung oder Push-Zustellung.

## Architekturentscheidung

Empfehlung: bestehenden Service Worker gezielt ausbauen, native Web-Push-Standards nutzen und Einkaufsentwürfe getrennt von Serverdaten speichern. Die vorhandenen Angular-, Supabase- und Shared-UI-Muster bleiben maßgeblich.

Alternativen:

1. Angular Service Worker: etablierte Build-Versionierung und Update-/Push-APIs, aber zusätzliches Paket und Migration des eigenen Workers. Für dieses Vorhaben zunächst mehr Umbau; bei der technischen Umsetzung erneut bewerten, wenn der eigene Versionsvertrag wesentlich komplexer wird.
2. Native Verpackung, etwa Capacitor: eigener Store-/Plattformbetrieb und weitere Abhängigkeiten. Kein Bestandteil des PWA-Auftrags.

Ein eigener Push-Versanddienst ist gerechtfertigt: Er muss unabhängig von geöffneten Browserseiten und Marktplatz-Browsersitzungen laufen. Keine neue allgemeine Ereignisplattform und kein zusätzlicher Message Broker. Postgres speichert Ereignisse und Versandversuche dauerhaft; ein kleiner Worker arbeitet sie ab. Web-Push-Verschlüsselung wird mit einer überprüften, exakt gepinnten serverseitigen Bibliothek umgesetzt, nicht selbst geschrieben.

## Paket A: Installation, Start und mobile Bedienung

### Installation und Gerätestatus

- `PwaService` trennt `isStandalone`, Verfügbarkeit eines Installationsdialogs, Worker-Bereitschaft, Offline-Dateibereitschaft und Netzwerkhinweis. Kein Erfolgssignal ohne bestätigte Aktion.
- Installation und Worker-Lebenszyklus werden bereits am App-Einstieg initialisiert, auch auf der Anmeldung. Sie dürfen weder auf eine spätere Header-Injektion warten noch den sichtbaren Start auf Worker-/Netzbereitschaft blockieren.
- Android/Chromium: eigener Installationsbutton nur bei vorhandenem Installationsereignis. Abbrechen ist kein Fehler; nach Verbrauch des Ereignisses nicht erneut damit arbeiten.
- iPhone/iPad: verständliche Hilfe zum Hinzufügen zum Home-Bildschirm und anschließenden Öffnen von dort. UI mit nicht unterstützter Fähigkeit bietet Hilfe statt eines wirkungslosen Buttons.
- Kein wiederholtes Installationsbanner nach Ablehnung. Hilfe bleibt unter App & Geräte erreichbar.
- `id: /` bleibt stabil, damit bestehende Installationen nicht als neue App behandelt werden. Manifest bekommt explizites `scope: /`, `lang: de`, überprüfte Schnellziele und korrekten MIME-Typ. Startziel berücksichtigt lokalen Offline-Einstieg, Online-Normalziel und sichere Rücksprünge.

### Ladebildschirm

Zwei unterschiedliche Startflächen: den betriebssystemseitigen PWA-Start bestimmt der Browser; den anschließenden Flipbase-Start gestalten wir selbst. Keine Zusage eines identischen nativen Splashscreens auf allen Betriebssystemen.

- Sofort sichtbares HTML in `src/index.html`, außerhalb von `app-root`: vorhandenes Flipbase-Logo, Name und „Flipbase wird gestartet …“.
- Ruhiger themegerechter Hintergrund, gelber Markenakzent `#fcc601`, dezente Logo-/Ringbewegung; kein Video, keine neue Schrift, keine künstliche Prozentanzeige und keine Mindestwartezeit.
- Vor Angular anhand `flipbase_theme` und Systemdesign initialisieren; Zugriff auf gesperrten Speicher abfangen. Ein kleiner externer Starthelfer erfüllt die bestehende CSP.
- Entfernen nach erster abgeschlossener Routennavigation und erstem Rendern ihres sichtbaren Zustands. Nicht auf alle Fachdaten, Bilder oder Hintergrundimporte warten. Route-spezifische Ladeskeletons bleiben zuständig.
- Nach 10 Sekunden: „Der Start dauert länger als erwartet.“ Nach 30 Sekunden: „Flipbase konnte nicht gestartet werden.“ mit „Erneut versuchen“. Ein später erfolgreicher Start darf sich erholen.
- Bootstrap-, Chunk- und Navigationsfehler führen zu einem verständlichen Wiederholungszustand, keiner Endlosschleife. Wiederholen lädt die Seite einmal bewusst neu.
- Bewegungsreduktion respektieren; Status für Screenreader, keine Fokusfalle. Warmes Zurückkehren zur laufenden App zeigt den Startbildschirm nicht erneut.

### Smartphone und Tablet

- `viewport-fit=cover` nur gemeinsam mit Safe-Area-Padding für Header, Bottom-Navigation, Inhalt, Dialoge und Toasts einführen. Bestehende Abstände bleiben zusätzlich erhalten.
- Dynamische Viewporthöhe, sichtbare Eingabefelder und erreichbare Speichern-Aktionen bei Bildschirmtastatur. Kein blockiertes Zoomen.
- Tablet richtet sich nach verfügbarer Breite und Eingabegerät; Split-View und Querformat sind eigene Testfälle. Kein pauschales Desktoplayout für jedes iPad.
- Bestehende gemeinsame Komponenten verwenden; alle nötigen Touch-Aktionen mindestens 44 × 44 CSS-Pixel nach Projektvertrag.

## Paket B: Versionssicherer Worker und Updates

- Jeder Produktionsbau erzeugt ein Inventar der statischen App-Dateien und eine daraus berechnete Build-ID. Alle Angular-Chunks, auch lazy geladene, Startdateien, benötigte Icons und Schriften gehören hinein. Geschäfts-/API-/Privatmedien und `deployment.json` gehören nicht hinein.
- Inventar und Worker werden im Bau erzeugt; keine generierten Dateien committen. Der Worker enthält die Build-ID und verändert dadurch bei jedem geänderten App-Bau seine Bytes. Installation prüft dieselbe ID im Inventar und die vollständige Dateimenge; fehlende/abweichende Dateien verhindern Aktivierung.
- Build-ID aus Asset-Hashes und Worker-Vorlage ableiten; erzeugten Worker, Inventar und Release-Metadaten vom Asset-Inventar ausschließen, damit keine selbstreferenzielle Hashberechnung entsteht.
- Der aktive Worker liefert seine passende App-Shell und die dazugehörigen Dateien. Ein Netzantwort-`index.html` aus einem anderen Bau ersetzt sie nicht. So bleiben Oberfläche und Lazy-Chunks konsistent.
- Nach erfolgreicher Installation fehlende oder beschädigte Cachedateien nur mit einer Datei nachladen, deren Hash zum gespeicherten Inventar desselben Builds passt. Andernfalls `offlineAssetsReady` zurücknehmen und einen sichtbaren Wiederholungs-/Reparaturzustand anbieten; kein ungeprüfter Fallback in eine alte Shell. Reparaturversuch einmal pro Datei und Start, keine Reload-Schleife.
- Ein neuer Worker wartet. Meldung: „Eine neue Version ist bereit.“ Aktionen „Jetzt aktualisieren“ und „Später“.
- Aktualisierung erst nach Schutz ungespeicherter Eingaben, laufender Uploads/Schreibaktionen und bestätigter lokaler Entwurfsspeicherung. `WorkspaceContextLockService.locked` hilft konservativ, ersetzt aber keine Prüfung ungespeicherter Änderungen.
- Vor Aktivierung alle offenen App-Clients um Zustimmung bitten. Ein gesperrter Client oder eine fehlende Antwort blockiert das Update; die aktive Ansicht erklärt, dass die andere Ansicht zuerst gespeichert oder geschlossen werden muss. Kein globaler Controllerwechsel mit erzwungenem Reload einer ungespeicherten zweiten Ansicht.
- Zustimmung gehört zu Build-ID und Aktivierungsversuch. Zustimmung gebende Clients halten ihren sicheren Zustand bis zum Controllerwechsel; neue Eingaben oder Schreibaktionen widerrufen sie. Der wartende Worker erfasst Fenster mit `includeUncontrolled: true`, prüft neue Clients unmittelbar vor Aktivierung erneut und verwirft veraltete Zustimmung nach Neustart.
- Erst nach bewusster Freigabe aktivieren; `controllerchange` lädt einmal neu. Keine wiederholte Reload-Schleife und kein automatisches Wegwerfen eines Formulars.
- Cachebereinigung löscht nur eigene PWA-Caches. Aktiver und unmittelbar vorheriger Bau bleiben für noch geöffnete Clients nutzbar; weitere eigene Versionen werden begrenzt entfernt. Unter hoher Speicherauslastung kann der Browser trotzdem Daten verwerfen.
- API-, Auth-, Storage- und Functions-Verkehr nie durch die PWA zwischenspeichern, auch nicht über zukünftige eigene Proxy-Pfade. Dateiendungen allein sind keine Cachefreigabe.
- HTTP-Cache: `index.html`, Worker, Inventar und Release-Metadaten erhalten passende Revalidierung; Immutable nur für tatsächlich versionierte Dateien. Offline-Bereitschaft wird erst nach vollständiger Installation angezeigt.

## Paket C: echte Push-Benachrichtigungen

### Nutzerablauf und Fähigkeiten

Gerät anmelden → Kategorien je Workspace wählen → ausdrücklich „Push aktivieren“ → Browserfreigabe → Abonnement speichern → echte Testmeldung vom Server. „Aktiv“ erst nach Browserabonnement UND serverseitiger Registrierung, „Test gesendet“ ist noch kein Zustellnachweis.

Auf iOS/iPadOS ist Web Push für Home-Bildschirm-Web-Apps ab 16.4 eingeführt worden. UI erkennt Fähigkeiten und App-Modus und erklärt erforderliche Schritte. Aktuelle reale Geräteversionen sind zusätzlich zu testen. Berechtigung nur infolge einer Nutzeraktion; Ablehnung erklärt das Wiederaktivieren in den Geräte-/Browsereinstellungen.

### Geräte, Rechte und Quellen

- Abonnement gehört einer Installation und einem angemeldeten Nutzer, nicht einem Workspace allein. Mehrere Geräte pro Nutzer; mehrere freigegebene Workspaces pro Gerät mit eigenen Kategorien.
- VAPID-Schlüssel: öffentlicher Teil für Client, privater Teil nur Server-Secret; VAPID-Version am Abonnement speichern, Schlüsselrotation planbar. Keine Push-Endpunkte/Schlüssel in Logs.
- Authentifizierte `settings`-Aktion liefert vor dem Freigabeklick öffentlichen VAPID-Key samt Key-ID, eigene Gerätebindung, gespeicherte Präferenzen und erlaubte Kategorien. Nach Reload, Deaktivierung und Schlüsselwechsel serverseitigen Zustand neu lesen. Bei Rotation neue Subscription ausdrücklich herstellen; alten Key nur für noch gültige alte Bindungen befristet weiterführen, nie ein altes Abonnement still einem neuen Key zuordnen.
- Bei jedem Versand aktueller Workspacezugriff, Kategorie, konkretes Ereignisrecht und Gerätefreigabe erneut prüfen. Worker-Service-Role darf hierfür nicht `marketplace_can_manage` mit fehlender Empfängeridentität aufrufen. Service-only Prüfung mit gespeicherter Empfänger-ID: aktueller Zugang über `user_can_access_workspace`, Vinted zusätzlich aktuelle Betreiber- und Workspaceadministrationsrechte, eBay konkreter Kontobesitzer, Shop aktueller Workspacezugriff. Normale Client-Fachrechte bleiben unverändert.
- Quellen: belegte neue Vinted-Nachricht/Angebotsnachricht; neu beobachtete eBay-/Shop-Bestellung; belegter Übergang einer zuvor nutzbaren Kontoverbindung zu erneuter Anmeldung. Keine Meldung für bloßes `connected`, einzelne Netzfehler oder vom Nutzer pausierte Konten.
- eBay-Bestellabruf erfolgt heute nur nach Browseranfrage; kurzlebige manuelle Review-Snapshots sind keine Hintergrundquelle. Neuer begrenzter Beobachter im bestehenden eBay-Funktionsdienst nutzt vorhandene OAuth-/Kontoleases, Tokens bleiben dort. Versandworker stößt Prüfung alle 5 Minuten für ausdrücklich aktivierte und berechtigte Kontobindungen an; je Lauf maximal 5 Seiten. Cursor und Watermark gehören zur Kontobindung/Umgebung/Kontoidentität mit eingefrorenem Scanfenster, Deduplizierung zusätzlich zur einzelnen Bestell-ID. Fortsetzung behält dieses Fenster; erst der vollständige Scan schreibt Watermark weiter, mit 10-Minuten-Überlappung im nächsten Fenster. Erstbaseline erzeugt keine Meldungen. Rate-Limits und OAuth-Erholung begrenzen Wiederholungen; keine unbegrenzte Browserautomation oder automatische Einkaufs-/Verkaufsbuchung.
- Vinted-Kontoprobleme an den tatsächlichen Zustand in `marketplace_sync_schedules.paused_reason` und dessen Schreiber koppeln: vorhandene Schwelle im `marketplace_sync_finish` erhalten; erste zwei weiche Loginablehnungen lösen keine Meldung aus. Bestätigte Cloud-Schreib-Reauthentifizierung und Erholungswege ebenfalls berücksichtigen; `marketplace_connections.status` allein reicht nicht.
- Die Erstanbindung importiert historischen Bestand ohne Push-Sturm. Wiederkehrende Imports derselben Quelle erzeugen kein neues Ereignis. Aktivieren von Push versendet keine alten Ereignisse.
- Nachrichtentexte und Kundendaten erscheinen standardmäßig nicht auf dem Sperrbildschirm. Texte: „Du hast eine neue Nachricht.“, „Eine neue Bestellung ist eingegangen.“, „Eine Kontoverbindung braucht deine Anmeldung.“
- Geplante spätere Kategorien, z. B. Vinted-Funde, werden noch nicht gebaut. Browser-/OS-Ton und Fokusmodi bleiben maßgeblich; kein Versprechen eigener Klingeltöne oder garantierter Zustellzeit.

### Versand und Lebenszyklus

- Datenbank-Ereignis und Outbox-Eintrag entstehen in derselben Transaktion. Pro Ereignis und Gerätebindung höchstens ein logischer Versandauftrag; Sendebestätigung des Anbieters ist keine garantierte Anzeige am Gerät.
- Worker übernimmt Aufträge mit Lease, begrenzter Parallelität und atomarer Bestätigung. Retries bei 429/5xx/Transportfehlern: `Retry-After` beachten, sonst 30 s, 2 min, 10 min, 30 min; spätestens nach 24 h verwerfen. Keine Zusage absolut einmaliger Netzwerkzustellung nach einem Prozessabsturz; stabiler Notification-Tag reduziert sichtbare Dopplungen.
- Jede Übernahme erhält einen eigenen Claim-Token; Bestätigung/Retry vergleicht Auftrag, Bindungsgeneration und Claim-Token atomar. Eine verspätete Workerantwort darf eine bereits neu übernommene Lieferung nicht überschreiben. Providervertrag trägt normalisierte `Retry-After`-Information statt sie auf einen Statusstring zu reduzieren.
- 404/410 deaktivieren abgelaufene Abonnements. 401/403 als Schlüssel-/Konfigurationsfehler behandeln, Alarm auslösen und nicht alle Geräte löschen. Keine endlose Wiederholung.
- HTTPS-Push-Endpunkte nur nach überprüfter Anbieterfreigabe, ohne freie Redirects oder interne Netzadressen; Schutz vor serverseitigen Abrufen beliebiger Client-URLs.
- `push` verarbeitet einen versionierten, validierten Payload und zeigt eine sichtbare Meldung per `showNotification()`. Kein stiller Push als Hintergrund-Synchronisierung.
- Antippen öffnet/fokussiert die App. Ziel ist eine validierte interne Route aus strukturierten IDs; niemals eine beliebige URL aus dem Payload. Anmeldung und Workspace-/Ereignisrechte werden beim Öffnen erneut geprüft.
- Vinted-Ziel entspricht `/marketplaces/vinted/messages?connectionId=…&conversationId=…`; Bestellziel verweist auf `/marketplaces/ebay/orders` oder den bestehenden Shop-Bestellbereich. Kontoprobleme öffnen die konkrete Kontoverwaltung. Workspacewechsel berücksichtigt laufende Formulare und den Context-Lock.
- Abmelden online deaktiviert zuerst die serverseitige Gerätebindung. Offline wird das lokale Abonnement abgemeldet und eine dauerhafte Sperr-/Revoke-Absicht hinterlegt; der nächste Online-Lauf bereinigt den Servereintrag vor erneuter Bindung. Anderswo widerrufene Sitzungen werden serverseitig gegen die registrierte Sitzung geprüft. Bereits ausgelieferte OS-Meldungen können nicht zuverlässig zurückgerufen werden; deshalb inhaltsarme Texte.
- Client erzeugt vor Registrierung ein zufälliges 256-Bit-Widerrufstoken und sichert es samt Registrierungs-/Generations-ID dauerhaft lokal. Erst danach sendet `register` dessen SHA-256-Hash und bindet ihn serverseitig an die unveränderliche Generation. Antwortverlust wiederholt exakt denselben Registrierungsdatensatz; Status „aktiv“ erst nach lokaler Speicherung der bestätigten Bindungs-ID. Verlorener lokaler Datensatz erfordert online authentifizierten Widerruf der eigenen alten Bindung und frische Registrierung. Separater idempotenter `revoke_binding`-Vertrag erlaubt ausschließlich Widerruf dieser Generation, auch ohne alten Nutzer-JWT. Lokale Revoke-Absicht speichert nur Bindungs-ID und dieses Token, keine Anmelde-Tokens. Spätes Abarbeiten darf eine neue Nutzerbindung nie deaktivieren. Offline ist sofortiger serverseitiger Versandstopp nicht garantiert; diesen Zustand ehrlich anzeigen. Versand prüft die registrierte `session_id` gegen `auth.sessions`, nicht bloß JWT-Gültigkeit.
- Widerruf adressiert die vorab bekannte Generation, auch wenn die Registerantwort noch fehlt. Register und Revoke werden pro Generation atomar serialisiert; Revoke hinterlegt einen terminalen Zustand/Tombstone auch vor einer verspäteten Registrierung. Bei vorhandener Generation muss der Tokenhash passen; eine fremde bekannte Generation darf nicht übernommen werden. Dieselbe Generation wird niemals reaktiviert. Die allgemeine Bereinigung deaktivierter Bindungen darf diesen Wiederaktivierungsschutz nicht mitlöschen; kompakte Generationstombstones bekommen einen getrennten, im SQL-Review geprüften Aufbewahrungsvertrag.
- Stummschalten und Deaktivieren unterscheiden sich: Kategorien deaktivieren Versand; Gerät entfernen widerruft die Bindung. Neue Anmeldung auf einem gemeinsam genutzten Gerät übernimmt nie still das Abonnement des vorherigen Nutzers.

## Paket D: Zwischenspeicher der normalen Einkaufsmaske

- Keine eigene Oberfläche, Liste, Navigation, Exportabfrage oder Übernahmeaktion. Normale Einkaufsmaske und Speicheraktionen bleiben bestehen; alte Offlineadressen leiten ohne alte Entwurfsparameter zu den normalen Einkäufen weiter. App-Guards bleiben wirksam; keine lokale Kopie ganzer Geschäftstabellen.
- Einmaliger Online-Besuch mit bestätigter Sitzung, aktivem Workspace und abgeschlossener Einrichtung registriert den lokalen Kontext. Gespeichert werden nur `userId`, `workspaceId`, Workspace-Anzeigename und Prüfzeit. Vorschlag: lokaler Zugriff bis 7 Tage nach dieser Bestätigung; danach erneute Online-Bestätigung. Dies ist lokale Gerätezuordnung, keine offline prüfbare Serverberechtigung.
- Nur der zugeordnete und erneut berechtigte Nutzer kann seine Eingaben wiederherstellen. Logout, Nutzerwechsel oder erkannte Sitzungsaufhebung sperren den Puffer. Kein tokenloses Öffnen fremder Daten über eine manipulierte Workspace-ID.
- Vollständige normale Formulareingaben, Positionen, Zusatzkosten und gewählte Belege sichern. Belegbytes mit Dateiname, Typ und Änderungszeit speichern und daraus Dateien rekonstruieren; native File-/Blob-Persistenz ist in der WebKit-Testumgebung nicht zuverlässig verfügbar. Bytevorbereitung außerhalb laufender IndexedDB-Transaktionen ausführen. Keine zusätzliche Offline-Artikelsuche, Wareneingänge oder Buchungen einführen.
- IndexedDB speichert Entwürfe versioniert nach `userId + workspaceId + draftId`. Jeder Entwurf erhält dauerhaft `requestId`, Revision und UTC-Änderungszeit. Centpreise lokal als Integer; Einkaufsdatum als lokales ISO-Kalenderdatum, nicht aus UTC abgeschnitten.
- Eingaben nach Änderungen intern sichern; vor Navigation eine laufende Sicherung abwarten. Keine zusätzliche Speicheranzeige. Höchstgrenzen: 100 Einträge, 100 Positionen je Eintrag, 10 MiB Metadaten und 100 MiB Belegbytes insgesamt; bestehende 20-MiB-Dateigrenze bleibt. Online darf ein nicht verfügbarer Puffer die normale Server-Speicherung nicht verhindern, sofern noch kein ungeklärter Auftrag existiert.
- Erst die normale ausdrückliche Speicheraktion beauftragt einen Serverauftrag. Nicht abgesendete Eingaben werden bei Rückkehr der Verbindung niemals automatisch gebucht. Fehlgeschlagene, bereits beauftragte Speicherungen nach erneuter Onlineprüfung derselben Anmeldung und Workspace-Rechte fortsetzen. Fachliche 4xx-Fehler nicht endlos wiederholen; Netzwerk-, Server- und Verbindungsfehler behalten denselben Auftrag. Verkauf, Bestand und endgültiger Einkaufsabschluss benötigen eine Verbindung.
- Vor dem ersten Serveraufruf vollständigen Online-Payload einschließlich Ergänzungen und aktuelle Revision als unveränderlichen Übertragungsversuch atomar lokal speichern. Nach verlorener Antwort gilt `outcome_unknown`; Wiederholung verwendet exakt diesen Versuch. Neuere Eingaben bleiben als nächste Revision erhalten und dürfen nicht aufgrund einer Antwort auf die ältere Revision als übertragen gelten.
- Bestehenden Einkaufswiederholungsvertrag zuerst absichern: `create_purchase` liefert beim Wiederholen anders sortierte Positionen als beim ersten Anlegen; `PurchaseService` weist EANs momentan per Arrayindex erneut zu. Die RPC-Antwort wird daher nach diesem Vorabfix serverautoritativ verarbeitet, ohne indexabhängige Nachschreibaktion. Regression mit zwei unterschiedlichen EANs und abweichender Rückgabereihenfolge ist Voraussetzung für Offlineübertragung.
- Katalog-Handoff über `/catalog/new` und zurück zur Einkaufsmaske erhält Entwurfs-ID, Revision, Request-ID und den gesamten Review-/Übertragungszustand. Reload oder neue Formularinstanz erzeugen dabei keinen neuen logischen Anlegeversuch. Bei unbekanntem Ausgang ist vor einer geänderten erneuten Buchung der erste Ausgang zu klären.
- Servererfolg ordnet die bestätigte `purchaseId` der normalen Maske zu, auch wenn Belege noch ausstehen. Belege verwenden dauerhafte IDs; verlorene Metadatenantworten durch Metadaten- und Originalbyteprüfung abgleichen. Ein möglicherweise referenziertes Original nicht aufgrund einer verlorenen Antwort löschen. Erst vollständige Bestätigung schließt den unveränderten Vorgang normal ab. Neuere Felder, Positionen, Belege und noch offene Editorzustände erhalten; der nächste normale Save bearbeitet den bestätigten Einkauf. Zwei Tabs verwenden Revisionen und Lease; fremd bestätigte Vorgänge werden auch im ursprünglichen Fenster übernommen.
- Vollständig bestätigte, unveränderte Puffereinträge entfernen. Explizites Verwerfen noch nicht beauftragter Eingaben verhindert Wiederherstellung. Logout sperrt bestehende Puffer ohne zusätzlichen Dialog; erst derselbe erneut berechtigte Nutzer kann sie wieder nutzen. Alte `flipbase_offline_purchase_entries` bleiben unter dem bisherigen Recovery-Vertrag und werden nicht ungefragt importiert.
- Gerätverlust, Browserbereinigung oder Speicherverdrängung können den Puffer löschen. Keine Behauptung eines Backups oder einer Verschlüsselung durch bloße Nutzerpartitionierung.

## Abnahme und Veröffentlichungsreihenfolge

1. Installation + Ladebildschirm + mobile Safe Areas, ohne Offline-/Push-Versprechen vor deren Fertigstellung.
2. Versionssicherer Worker und Update-Dialog; Grundlage für zuverlässigen Offline-Start und Push.
3. Push-Backend samt Vertrags-/Rechtetests und zunächst deaktiviertem Versand; anschließend Client und Pilotgerät. Push hat Vorrang vor dem Offline-Entwurfsausbau.
4. Lokaler Entwurfsbereich und Onlineübernahme mit vorhandener Einkaufs-ID-Deduplizierung.
5. Geräteabnahme und kontrollierte Freigabe je Paket über PR mit grünen Pflichtprüfungen.

Pflichtgeräte: echtes iPhone und iPad, Android-Smartphone/Chromium, Android-Tablet/Chromium und Desktop. Emulatoren ergänzen diese Prüfung, ersetzen sie nicht. Testfälle umfassen Erstinstallation, Warmstart, kalter Offlinestart nach vollständiger Vorbereitung, Querformat, Tastatur, iPad-Split-View, Hell/Dunkel, reduzierte Bewegung, neue Version mit offenem Formular, geschlossene App mit echter Push-Meldung sowie Antippen nach abgelaufener Sitzung oder entzogenem Workspacezugriff.

Automatisierte Produktions-Worker-Tests laufen ausschließlich in Chromium. Playwright-WebKit prüft Oberfläche und Startablauf, nicht den Service Worker; Safari-/iOS-Cache und Worker-Updates brauchen reale Geräte. Diese Nachweise werden in CI und Abnahmematrix getrennt ausgewiesen.

Leistungsziele als zu messende Projektwerte, nicht Browsergarantien: zusätzlicher Startcode ≤ 10 KiB gzip; Startbildschirm erzeugt keine Zusatz-Netzaufrufe außer eigenen Assets; keine künstliche Startverzögerung. Versand unter gesunder Infrastruktur spätestens 30 s nach gespeichertem Ereignis zur Push-Plattform; tatsächliche Plattformzustellung separat messen.

Push-Release verdrahtet Paketinstallation, Typ-/Diensttests, Worker-Imagebau und Smoke, privilegierte Veröffentlichung erst nach Pflichtprüfungen, unveränderlichen Imagedigest, eng validierten Deploybefehl, Functionauslieferung und Health-/Versionsnachweis. Reihenfolge: Backup und Migration → neue Functions → Worker mit Versand aus → kompatible App → Pilotfreigabe. Rücknahme stoppt Versand/Beobachter und setzt bekannte kompatible Function-/Imagedigests zurück; neue Tabellen werden dabei nicht destruktiv zurückgerollt.

## Backend-Abhängigkeit und Umsetzungsgate

Push braucht neue Serverunterstützung. Spezifikation und Abnahmekriterien stehen zusätzlich in `C:/Users/gt/Desktop/Backend Issues/pwa-mobile-plan/01-pwa-web-push.md`. Schema, erzeugte Migration, Geräteverwaltung, Versanddienst und serverseitige Ereignisquellen gehören zusammen. Keine Frontend-Mocks als vermeintlich fertiger Push und keine manuell gepflegten generierten Supabase-Typen.

Der Agent-Review hat zusätzlich den Einkaufswiederholungsvertrag als Voraussetzung identifiziert. Befund und prüfbarer Auftrag stehen in `C:/Users/gt/Desktop/Backend Issues/pwa-mobile-plan/02-purchase-retry-contract.md`; dies verlangt zunächst Frontend-/RPC-Vertragskorrektur und Regressionstests, keine pauschale neue Schemaänderung.

Der Nutzer hat die Planung beauftragt; deshalb werden Design und Umsetzungsplan gemeinsam als prüfbarer Entwurf erstellt. Umsetzung, neue Abhängigkeiten, Migrationen und Veröffentlichung beginnen erst nach Prüfung dieses konkreten Plans. Die allgemeinen Vorgaben zu getrennten Backend-Zuständigkeiten sind dabei zu beachten; Supabase-Aufgaben werden ausdrücklich einem zuständigen Backend-Umsetzungspaket zugeordnet.

## Quellen

- [WebKit: Web Push für iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) – Home-Bildschirm und Nutzeraktion.
- [MDN: beforeinstallprompt](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event) – kein universeller Installationsdialog.
- [MDN: showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification) – Meldungen aus aktivem Service Worker.
- [WebKit: Safe Areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) – `viewport-fit` zusammen mit Insets.
- [web.dev: Web-Push-Protokoll](https://web.dev/articles/push-notifications-web-push-protocol) – Serverversand und VAPID.
- [Angular: Service Worker](https://angular.dev/ecosystem/service-workers/getting-started) – bewertete Framework-Alternative und Produktionstest.
- [Playwright: Service Workers](https://playwright.dev/docs/service-workers) – Worker-Unterstützung nur in Chromium; WebKit-Oberflächentests getrennt.
- [MDN: Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) – eingeschränkte Verfügbarkeit; keine Basis für zuverlässige Entwurfsübertragung.
- [Supabase: Queues](https://supabase.com/docs/guides/queues) – bewertete Alternative; neue Queue-Erweiterung wird hier nicht vorausgesetzt.
- [Supabase: Sessions](https://supabase.com/docs/guides/auth/sessions) – `session_id` und serverseitige Prüfung widerrufener Sitzungen.

Alle Plattformquellen am 13.10.2026 gelesen; reale Gerätefähigkeiten sind Bestandteil der Abnahme, keine aus Dokumentation abgeleitete Bestätigung der Flipbase-Funktion.
