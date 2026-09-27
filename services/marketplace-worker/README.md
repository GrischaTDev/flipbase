# Marktplatz-Worker: Serverkern

Dieses Paket enthält den noch nicht gestarteten Dienstkern für kontogebundene
Cloud-Browser. `GoLoginCloudBrowser` verbindet Playwright über CDP mit einem
serverseitig bekannten Profil. `MarketplaceBrowserSessionBroker` prüft die
Sperre vor jeder internen Aktion. Token, CDP-URL und Anbieteransicht werden
nicht an Angular ausgegeben.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Die Tests verwenden ausschließlich künstliche Anbieterantworten. Es gibt noch
keinen HTTP-Endpunkt, keine dauerhafte Sperrimplementierung, keine gespeicherte
Zuordnung zwischen Flipbase-Verbindung und GoLogin-Profil und keinen
Wiederanlauf-Abgleich. Das Paket wird daher nicht produktiv gestartet. Die
vorhandene Seite `/marketplaces/vinted/session-test` bleibt eine Simulation.

Vor einer Aktivierung müssen die offenen Schritte in AP04b des
[Vinted-Plans](../../docs/superpowers/plans/2026-09-26-vinted-marketplace.md)
erfüllt und mit einem isolierten, ausdrücklich freigegebenen Testprofil geprüft
werden. Geheimnisse gehören ausschließlich in die Serverumgebung.
