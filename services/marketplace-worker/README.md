# Marktplatz-Worker: Serverkern

## Eigener Chromium-Cloudpilot

`MARKETPLACE_BROWSER_PROVIDER=chromium` verwendet dauerhafte Kontoprofile im
eigenen Serverbetrieb. Der Start verlangt `MARKETPLACE_CHROMIUM_PILOT_ENABLED=1`,
einen privaten `MARKETPLACE_BROWSER_PROFILE_ROOT`, den zugehörigen
`MARKETPLACE_CHROMIUM_HOST_PROFILE_ROOT`, eine feste Hostkennung und das geprüfte
Chromium-Sitzungsimage. Jeder aktive Browser läuft in einem eigenen Container;
nur der vertrauenswürdige Controller besitzt Docker-Zugriff. Das feste Netz
`flipbase-browser` und ein aktueller Host-Firewallnachweis sind erforderlich.

Neue Konten erhalten `chromium_<uuid>`-Referenzen. Bestehende GoLogin-Referenzen
werden weiter über den bisherigen Cloudadapter ausgeführt, solange
`GOLOGIN_API_TOKEN` konfiguriert bleibt. Ein fehlendes oder fremdes privates
Kontomanifest wird nicht automatisch neu erzeugt. Die vorhandenen Konto-
und Sitzungsverträge bleiben bestehen; eine neue Datenbankmigration ist nicht nötig.

Automatische Abrufe sind zunächst pausiert. `MARKETPLACE_SCHEDULED_SYNC_ENABLED=1`
aktiviert sie nach der Abnahme. Profil-/Listingänderungen sind ebenfalls zunächst
gesperrt und benötigen separat `MARKETPLACE_CHROMIUM_WRITES_ENABLED=1`. Anmeldung,
Sicherheitsabfragen und manuelle Leseabrufe nutzen die vorhandene Browseroberfläche.

`MARKETPLACE_CHROMIUM_NETWORK_ID=direct` nutzt den Serverausgang. Optional kann
`MARKETPLACE_CHROMIUM_NETWORK_FILE` eine private Datei mit Modus 0600 bezeichnen:

```json
{
  "networkProfiles": [
    {
      "id": "isp-pilot",
      "kind": "proxy",
      "server": "http://proxy.example.test:10000",
      "username": "REPLACE_ON_SERVER",
      "password": "REPLACE_ON_SERVER"
    }
  ]
}
```

Die Netzwerkkennung wird unveränderlich im Kontomanifest gespeichert. Fehlende
Zugänge verhindern den Start; es gibt keinen automatischen Netzwerkwechsel.
Mit serverseitigem `IPROYAL_API_TOKEN` liest der Worker beim Hinzufügen eines
Cloudkontos oder beim Cloudwechsel zuerst die bereits gekauften Bestellungen
aus dem IPRoyal-Konto. Dieses Konto muss für den Flipbase-Bestand vorgesehen
sein; Nutzungen außerhalb von Flipbase meldet die Anbieter-API nicht.
Neue deutsche Dedicated-ISP-IPs werden vor der Reservierung geprüft und privat
ergänzt. Die Netzwerkdatei braucht dafür einen persistenten beschreibbaren Mount,
Modus 0600 und den Worker als Eigentümer. Belegte und administrativ gesperrte IPs
bleiben gebunden beziehungsweise gesperrt. API-Fehler brechen die Einrichtung ab;
ohne freie IP erscheint die Kapazitätsmeldung. Ohne API-Token bleibt der manuell
registrierte Bestand verwendbar. Es gibt keine automatischen Käufe.
Umstellung, Wartungsbefehl und Rückweg sind im
[Rolloutplan](../../docs/implementation/vinted-worker-rollout.md) beschrieben.
Linux-Sandbox, tatsächlicher Vinted-Zugang, mobile Anmeldung und ausreichende
Kapazität werden im CI beziehungsweise im realen Pilot geprüft.

## Geplante Vinted-Leseabrufe

Im GoLogin-Betrieb übernimmt ein gemeinsamer Dispatcher neue manuelle
und freigegebene automatische Abrufe. `MARKETPLACE_SCHEDULED_SYNC_ENABLED`
ist im GoLogin-Betrieb standardmäßig `1`; ein ausdrücklich gesetztes `0`
pausiert den automatischen Dispatcher. Nach bestätigter Anmeldung entsteht
ein Zeitplan mit 15 Minuten. Bestehende verbundene Konten ohne Zeitplan
werden beim Öffnen durch einen berechtigten Nutzer aktiviert, sobald der
Dienst seine Bereitschaft bestätigt. Gespeicherte Pausen bleiben erhalten. Die Planung
braucht keine geöffnete Web-App und speichert keine Nutzer-Zugangstokens.

Der Worker reserviert seine alleinige Runtime vor der Browserrecovery.
Auftrag und Browser werden atomar beansprucht; aktuelle Nutzerrechte und
die gespeicherte Freigabeversion begrenzen alle weiteren Anbieteranfragen
und Imports. Manuelle Abrufe haben Vorrang; verpasste Zyklen erzeugen keine
Abrufserie. Höchstens ein weltweit reservierter Browser ist im Pilot
zulässig. Ein unbestätigter Providerstopp hält den Platz weiterhin besetzt.

Die Runtime und Auftragslease werden erneuert; die absolute Auftragsgrenze
bleibt zehn Minuten. Unklare Reservierungsantworten verlangen einen Neustart
mit Recovery vor weiteren Claims. Auch nach einem Absturz zwischen Import
und Auftragsabschluss werden Quellenwarnungen und Wartezeiten übernommen.
HTTP 403 und 429 verhindern weitere JSON-Anfragen innerhalb desselben
Abrufs. Logging enthält nur feste Zustände, Kennungen, Phasenlaufzeiten und
Anfragezahlen.

Die Healthfähigkeit `scheduledSync` wird nur vom tatsächlich bereiten,
aktivierten Dispatcher gemeldet. Ein altes Image oder fehlende Fähigkeit
sperrt das Aktivieren; gespeicherte Freigaben bleiben über die Datenbank
pausierbar. Die getrennte Veröffentlichung und der Rückweg stehen unter
[Vinted-Worker-Rollout](../../docs/implementation/vinted-worker-rollout.md).

Die Healthfähigkeit mit `authorizationVersion: 2` bestätigt die Abstände
`[3, 5, 10, 15, 30, 60]`. Die Oberfläche zeigt nur vom Dienst bestätigte
Abstände; ein älterer Dienst mit Version 1 bestätigt weiterhin nur 15 Minuten.
Die Wahl gilt für den vorhandenen gesamten Kontoabruf. Separate schnelle
Ereignisabrufe und Benachrichtigungen für Nachrichten, Angebote und Verkäufe
sind damit noch nicht implementiert. Künstliche Tests belegen weder echte
Vinted-Abrufzeiten noch die Cloudkapazität weiterer Konten.

Bei einer initialen Profil-401 lädt der Import die feste Vinted-Startseite
einmal vollständig und prüft die bestehende Anmeldung bis zu dreimal erneut
(750 und 1500 Millisekunden Abstand zwischen den Wiederholungen). Jeder
Schritt prüft die Freigabe erneut. Sichtbare Login-/2FA-Seiten, 403, 429,
Netzwerk- und Browserfehler werden nicht mit weiteren Identitätsabrufen
wiederholt. Es werden weder Zugangsdaten eingegeben noch Cookies gelöscht.
Die anschließende Importtransaktion verlangt weiterhin die bestätigte
Identität des zugeordneten Kontos. Bleibt die 401 bestehen, ist eine manuelle
Prüfung erforderlich. Die Browsertests verwenden ausschließlich künstliche
Antworten; der produktive Nachweis folgt nach dem Workerwechsel.

## Lokaler, lesender Testmodus

Der Worker verwendet standardmäßig einen eigenen Playwright-Chromium-Browser.
`MARKETPLACE_BROWSER_PROVIDER=local` ist optional. Der Start verlangt weiterhin
`MARKETPLACE_BROWSER_TEST_ENABLED=1`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` und
`SUPABASE_SERVICE_ROLE_KEY`. Zusätzlich muss
`MARKETPLACE_BROWSER_PUBLIC_TEST_URL` eine ausdrücklich freigegebene öffentliche
Profiladresse unter `https://www.vinted.de/member/...` enthalten. Diese Adresse
wird serverseitig geprüft; der Client kann sie nicht ändern. Im lesenden Modus
werden nur GET/HEAD-Anfragen an Vinted-Domains zugelassen und WebSockets
geschlossen. Weiterleitungen der Hauptseite werden verworfen. Die HTTP-API verweigert Klicks,
Texte und Tasten; die Testseite zeigt nur Bild, Aktualisierung und Stopp.

Chromium wird separat mit `npx playwright install chromium` im Worker-Paket
installiert. Der Browserkontext ist flüchtig, ohne Anmeldung und ohne gespeicherte
Cookies. Der lokale Modus erfordert weiterhin eine serverseitige Profilzuordnung
für die ausgewählte Flipbase-Verbindung; diese ID dient hier nur als eindeutige
Sitzungssperre. Es findet keine Zuordnung des öffentlichen Vinted-Profils zu
dieser Verbindung statt. Nach einem ungeordneten Worker-Abbruch kann der neue
Prozess einen alten lokalen Browser nicht sicher identifizieren. Die
Datenbanksperre bleibt deshalb bestehen und verlangt eine geprüfte manuelle
Bereinigung. Dieser Stand ist ausschließlich für lokale Tests gedacht.

Für den vorhandenen GoLogin-Adapter kann weiterhin
`MARKETPLACE_BROWSER_PROVIDER=gologin` zusammen mit `GOLOGIN_API_TOKEN` gesetzt
werden. Im Admin-Pilot erstellt der Worker beim ersten Browserstart für eine
freigegebene Flipbase-Verbindung ein dauerhaftes Linux-Profil über die GoLogin-
API und speichert nur dessen ID in der serverseitigen Zuordnung. Er prüft die
Plattformbetreiberrolle und die Workspace-Berechtigung vor der Erstellung und
erneut vor dem Speichern. Ein erneuter Start verwendet dasselbe Profil.
Danach öffnet der Cloud-Browser die feste Vinted-Startseite. Der Nutzer führt
die Anmeldung selbst aus; Flipbase speichert weder Passwort noch Cookies.
Nach der Anmeldung kann der Worker über die feste Vinted-Domain ausschließlich
die angemeldete Konto-ID und den Nutzernamen lesen. Die neue Bestätigungsaktion
setzt eine Flipbase-Verbindung nur dann auf `connected`, wenn die aktive
Browsersitzung weiterhin zu genau diesem Workspace, Konto und Bediener gehört.
Als Datenstand entsteht zunächst nur eine Profilkopie. Die verwendete private
Vinted-Identitätsroute `/api/v2/users/current` ist mit künstlichen Antworten
geprüft und muss an einem ausdrücklich freigegebenen eigenen Konto live
bestätigt werden. Bei fehlender Antwort bleibt die Verbindung unbestätigt;
Inserate, Nachrichten und Verkäufe werden noch nicht importiert.
Eine Bedienung gilt zehn Minuten. Ablauf, Pause oder Widerruf stoppen die
Cloud-Sitzung ausdrücklich. Bei unklarer Datenbankantwort während der
Profilerstellung bleibt ein mögliches Anbieterprofil zur manuellen Prüfung
erhalten, damit kein bereits zugeordnetes Profil versehentlich gelöscht wird.

### Direkte Anmeldung und Proxyzuordnung

`POST /marketplace-browser/sessions/:id/login` akzeptiert ausschließlich den
Kontobezug und `credentials: { username, password }` (je höchstens 256 Zeichen).
Es verwendet die vorhandene Benutzer-/Workspace-/Kontoprüfung. Vor jeder
Formulareingabe und dem Absenden wird die Berechtigung erneut geprüft. Das
beobachtete Vinted-Formular liegt auf `/member/login/email`; der Adapter gibt bei
geändertem Formular, Weiterleitung oder Sicherheitsprüfung die Bedienung an den
Nutzer zurück. Passwörter werden nicht gespeichert oder zurückgegeben. Ein
gesendeter Login wird bei unklarem Ergebnis nicht automatisch wiederholt.

Neue Profile erhalten über GoLogin `/users-proxies/mobile-proxy` einen deutschen
Residential-Proxy aus vorhandenem Kontingent. Es werden keine Kontingente gekauft.
Der Worker überprüft `proxyEnabled`, Modus, Host und Port vor der Nutzung; bei
gespeicherten Profilen wird die vorhandene Konfiguration nur gelesen. Alte Profile
ohne Proxy müssen vor dem Start bewusst beim Anbieter eingerichtet werden. Der
Adapter ändert weder bestehende Proxys noch Browsermerkmale bei jedem Start.
Diese Konfigurationsprüfung beweist keine exklusiven oder unveränderlichen
Ausgangs-IP-Adressen und keine Sperrfreiheit bei Vinted.

Anbieterprobe am 27.09.2026: vorhandenes Residential-Kontingent 524288000 Bytes,
damals ungenutzt; temporäres Profil erstellt, Proxy zugeordnet, mit dem neuen
Adapter erneut geprüft und gelöscht. Tatsächlicher Proxy-Modus: `geolocation`.
Quelle: [offizielles GoLogin-SDK](https://github.com/gologinapp/gologin/blob/master/src/gologin-api.js).

`npm run test:browser` prüft die echte Formulareingabe in zwei isolierten
Browserkontexten gegen `test/fixtures/vinted-login.html`. Sämtliche URLs werden
abgefangen; kein Netzwerkzugriff auf Vinted und keine echten Zugangsdaten.

Die Anbieter-API, CDP-Verbindung, zwei gleichzeitige isolierte Testprofile und
der ausdrückliche Stopp wurden am 27.09.2026 nur mit `example.com` geprüft.
Die vollständige Admin-Oberfläche mit einem Vinted-Login ist damit noch nicht
live bestätigt. Ein GoLogin-Profil allein garantiert keine eigene IP-Adresse;
vor mehreren echten Konten müssen Proxy und zulässige Kontonutzung pro Profil
geprüft werden.

Dieses Paket enthält den noch nicht gestarteten Dienstkern für kontogebundene
Cloud-Browser. `GoLoginCloudBrowser` verbindet Playwright über CDP mit einem
serverseitig bekannten Profil. `MarketplaceBrowserSessionBroker` prüft die
Sperre vor jeder internen Aktion. `SupabaseBrowserSessionStore` verwendet die
anfragende Benutzeranmeldung für Reservierung und Prüfung. Die Profil-ID liest
der Server aus der bei der Reservierung festgehaltenen Sitzung. Sie kommt nicht
aus der Browseranfrage. Token, CDP-URL und Anbieteransicht werden nicht an
Angular ausgegeben.

`SupabaseBrowserRecoveryStore` liest ungeklärte Sitzungen mit dem nur auf dem
Server vorhandenen Service-Role-Schlüssel. `MarketplaceBrowserRecovery` stoppt
deren Anbieterprofile und bestätigt erst danach die Freigabe. Der Broker sperrt
neue Starts, bis diese Bereinigung erfolgreich war. Schlägt ein Anbieter-Stopp
fehl, bleibt der Datenbankeintrag ungeklärt. Ein Benutzerzugriffstoken bleibt
höchstens für die kurze Sitzung im Speicher des Workers; es wird nicht in der
Datenbank oder im Repository abgelegt. Pro Workerprozess muss genau eine
Brokerinstanz für alle Benutzeranfragen verwendet werden. Der erste
Betriebsstand ist auf eine Worker-Instanz begrenzt.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Die automatischen Worker-Tests verwenden künstliche Anbieterantworten. Die dauerhafte
Sperre, Profilzuordnung, Wiederanlauf-Bereinigung und authentisierte HTTP-API
liegen vor. Die API bietet `GET /marketplace-browser/healthz` sowie Start, Bild,
Einzeleingabe, Kontobestätigung und Stopp unter `/marketplace-browser/sessions`.
Jede Aktion wird
mit dem Supabase-Benutzertoken und der Datenbanksperre geprüft. Bilder sind auf
512 KiB begrenzt; Anbieter-Token, Profil-ID und CDP-Adresse verlassen den Worker
nicht. Vor dem ersten HTTP-Zugriff werden ungeklärte Profile bereinigt. Der
laufende Prozess prüft aktive Sitzungen alle 30 Sekunden und stoppt sie beim
geordneten Herunterfahren.

Der Dienst bindet standardmäßig
an `127.0.0.1:4179`. Die Angular-Entwicklungsumgebung leitet ausschließlich
`/marketplace-browser/**` dorthin weiter. Die vorhandene Seite
`/marketplaces/vinted/session-test` zeigt einen getrennten Browser-Testbereich;
ohne erreichbaren Dienst bleibt sein Start gesperrt. Die bisherige Simulation
bleibt bestehen.

Der lesende Modus wurde außerdem mit einer getrennten lokalen Supabase-Instanz,
einem künstlichen Flipbase-Nutzer und zwei künstlichen Kontoverbindungen auf der
vorhandenen Testseite geprüft. Desktop und iPad-Größe, Kontowechsel, Ablauf,
Eingabesperre und bestätigter Stopp bestanden. Bei einem sicher beendeten
Browser liefert der Worker 410 und die Testseite erlaubt einen neuen Start.
Ein nicht bestätigter Stopp bleibt gesperrt. Der gezeigte Seiteninhalt wurde
nicht inhaltlich ausgewertet.

Der Dienst wurde nicht mit einer echten Vinted-Anmeldung gestartet. Ein
Containerabbild und die Caddy-/Compose-Vorlagen für den Admin-Pilot liegen im
Repository; auf dem Produktionsserver sind Worker, Token und Proxy noch nicht
eingerichtet. Die Freigaben und Desktop-/iPad-Prüfungen aus AP04b bleiben offen.

Vor einer Aktivierung müssen die offenen Schritte in AP04b des
[Vinted-Plans](../../docs/superpowers/plans/2026-09-26-vinted-marketplace.md)
erfüllt und mit einem isolierten, ausdrücklich freigegebenen Testprofil geprüft
werden. Geheimnisse gehören ausschließlich in die Serverumgebung.
