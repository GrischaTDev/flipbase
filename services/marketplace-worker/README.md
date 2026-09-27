# Marktplatz-Worker: Serverkern

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

Die Tests verwenden ausschließlich künstliche Anbieterantworten. Die dauerhafte
Sperre, Profilzuordnung, Wiederanlauf-Bereinigung und authentisierte HTTP-API
liegen vor. Die API bietet `GET /marketplace-browser/healthz` sowie Start, Bild,
Einzeleingabe und Stopp unter `/marketplace-browser/sessions`. Jede Aktion wird
mit dem Supabase-Benutzertoken und der Datenbanksperre geprüft. Bilder sind auf
512 KiB begrenzt; Anbieter-Token, Profil-ID und CDP-Adresse verlassen den Worker
nicht. Vor dem ersten HTTP-Zugriff werden ungeklärte Profile bereinigt. Der
laufende Prozess prüft aktive Sitzungen alle 30 Sekunden und stoppt sie beim
geordneten Herunterfahren.

Der Dienst startet nur mit `MARKETPLACE_BROWSER_TEST_ENABLED=1` und den
serverseitigen Werten `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` und `GOLOGIN_API_TOKEN`. Er bindet standardmäßig
an `127.0.0.1:4179`. Die Angular-Entwicklungsumgebung leitet ausschließlich
`/marketplace-browser/**` dorthin weiter. Die vorhandene Seite
`/marketplaces/vinted/session-test` zeigt einen getrennten Browser-Testbereich;
ohne erreichbaren Dienst bleibt sein Start gesperrt. Die bisherige Simulation
bleibt bestehen.

Der Dienst wurde nicht mit einem echten Profil gestartet. Eine produktive
Reverse-Proxy- oder Container-Anbindung ist nicht eingerichtet. Den Start mit
einem isolierten Testprofil erst nach G0-Freigabe durchführen und die in AP04b
beschriebenen Desktop-/iPad-Prüfungen danach protokollieren.

Vor einer Aktivierung müssen die offenen Schritte in AP04b des
[Vinted-Plans](../../docs/superpowers/plans/2026-09-26-vinted-marketplace.md)
erfüllt und mit einem isolierten, ausdrücklich freigegebenen Testprofil geprüft
werden. Geheimnisse gehören ausschließlich in die Serverumgebung.
