# Marktplatz-Worker: Serverkern

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
werden. Das ist ein anderer Modus mit Eingaben und wurde nicht live geprüft.

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
Einzeleingabe und Stopp unter `/marketplace-browser/sessions`. Jede Aktion wird
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

Der Dienst wurde nicht mit einer echten Vinted-Anmeldung gestartet. Eine produktive
Reverse-Proxy- oder Container-Anbindung ist nicht eingerichtet. Den Start mit
einem isolierten Testprofil erst nach G0-Freigabe durchführen und die in AP04b
beschriebenen Desktop-/iPad-Prüfungen danach protokollieren.

Vor einer Aktivierung müssen die offenen Schritte in AP04b des
[Vinted-Plans](../../docs/superpowers/plans/2026-09-26-vinted-marketplace.md)
erfüllt und mit einem isolierten, ausdrücklich freigegebenen Testprofil geprüft
werden. Geheimnisse gehören ausschließlich in die Serverumgebung.
