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
Sperre, Profilzuordnung und Wiederanlauf-Bereinigung liegen als Datenbankschema
und Serverbausteine vor. Es gibt noch keinen HTTP-Endpunkt und keine begrenzte
Bild-/Eingabeweiterleitung. Das Paket wird daher nicht produktiv gestartet. Die
vorhandene Seite `/marketplaces/vinted/session-test` bleibt eine Simulation.

Vor einer Aktivierung müssen die offenen Schritte in AP04b des
[Vinted-Plans](../../docs/superpowers/plans/2026-09-26-vinted-marketplace.md)
erfüllt und mit einem isolierten, ausdrücklich freigegebenen Testprofil geprüft
werden. Geheimnisse gehören ausschließlich in die Serverumgebung.
