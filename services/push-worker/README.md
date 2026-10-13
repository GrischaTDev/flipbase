# Pushversand

Der Dienst verarbeitet dauerhafte SQL-Aufträge alle 5 Sekunden, maximal vier pro Batch und vier parallel. Vor jedem Versand prüft SQL erneut Bindung, Sitzung, Workspace und Kategorie. Schema 472 ergänzt die Rechteprüfung für Nachrichten, Bestellungen und Kontoprobleme. Eigentests werden ebenfalls wirklich eingereiht. Anbieterannahme bestätigt keine Anzeige am Gerät.

`web-push` ist exakt auf 3.6.7 gepinnt, einschließlich npm-Integritätslock. Geprüfte Primärquellen: [Versionscode](https://github.com/web-push-libs/web-push/blob/v3.6.7/src/web-push-lib.js) und [Bibliotheksvertrag](https://github.com/web-push-libs/web-push/tree/v3.6.7). Die Bibliothek erzeugt Verschlüsselung und VAPID-Header. Der HTTPS-Transport prüft alle DNS-Adressen, bindet die konkret geprüfte Adresse und folgt keinen Redirects. 404/410 widerrufen diese Generation; 401/403 bleiben Konfigurationsfehler.

Nach 60 Sekunden kann eine Lease erneut übernommen werden. Alle Quittungen vergleichen Auftrag, Generation und Claimtoken. Es gibt maximal 5 Versuche inklusive Erstversuch, Rückstände von 30 Sekunden / 2 Minuten / 10 Minuten / 30 Minuten, Retry-After und 24 Stunden Ereignisablauf. Ein Crash nach Anbieterannahme kann einen zweiten Netzversand verursachen; `eventId` bleibt gleich und dient dem Service Worker als stabiler Notificationtag.

## Release und Erstinstallation

Einmalig `/opt/flipbase-push/push.env` nach `deploy/push.env.example` mit Eigentümer root:root und Modus 0600 vorbereiten. Privater VAPID-Key und Service Role gehören nur auf den Server. Supabase-Hauptcompose, deren `.env` und der Release-v1-Migrationsbootstrap müssen bereits vorhanden sein. Fehlende Vorbereitung stoppt den Rollout.

CI prüft Paket, Deno-Functions, echten Workercontainer und isolierten Edge Runtime/Gateway. Erst nach den Pflichtprüfungen werden Web- und Pushimage veröffentlicht. Der Deploybefehl akzeptiert `release-v1 <app-sha256> push <push-sha256>` und optional den Sniperdigest. Das Functionpaket im Appimage und das Pushimage müssen denselben Commit tragen.

Reihenfolge: Backup/Migrationen, versioniertes Functionpaket, isolierte push-functions und gedrosselter Pushgateway, Worker mit ausgeschaltetem Versand, kompatible App und Caddy, Health/Commit/Abbildvergleich. Vorhandene Functions/main bleiben erhalten. Die Push-URLbereiche gehen ausschließlich an den Gateway; Functions und Gateway erhalten keinen neuen Hostport. Der Workerhealthport ist an 127.0.0.1:4177 gebunden.

Der Gateway erlaubt maximal 120 Anfragen/Minute insgesamt und 10/Minute je IP, maximal 512 Byte Widerrufsbody und 4096 Byte Settingsbody. Caddy ersetzt den IP-Header. Das begrenzt auch unbekannte Generationen vor SQL. Generationstombstones werden niemals durch die Bindungsbereinigung nach 30 Tagen entfernt.

## Pilot, breite Freigabe und Rücknahme

Jeder Release startet mit `WEB_PUSH_ENABLED=false` und `WEB_PUSH_ALLOW_ALL=false`. Zuerst freigegebene UUIDs in `WEB_PUSH_PILOT_DEVICE_IDS` oder `WEB_PUSH_PILOT_USER_IDS` in push.env eintragen. Die Referenzen stehen nach Erfolg in `/opt/flipbase-push/current-release`: Appdigest, Pushdigest, Functioncommit. Diese Referenzen beim Betrieb in Umgebungsvariablen bereitstellen: `FLIPBASE_PUSH_IMAGE`, `FLIPBASE_PUSH_COMMIT`, `PUSH_FUNCTIONS_DIRECTORY=/opt/flipbase-push/releases/<commit>` und `PUSH_ENV_FILE=/opt/flipbase-push/push.env`.

Dann beide Composeaufrufe mit `WEB_PUSH_ENABLED=true WEB_PUSH_ALLOW_ALL=false` ausführen:

```sh
cd /opt/supabase
WEB_PUSH_ENABLED=true WEB_PUSH_ALLOW_ALL=false docker compose --env-file .env --env-file "$PUSH_ENV_FILE" -f docker-compose.yml -f /opt/flipbase-push/docker-compose.push-functions.yml up -d --no-deps push-functions push-gateway
WEB_PUSH_ENABLED=true WEB_PUSH_ALLOW_ALL=false docker compose -f /opt/flipbase-push/docker-compose.push.yml up -d push-worker
```

Erst nach echter Geräteabnahme beide Composeprozesse mit `WEB_PUSH_ALLOW_ALL=true` neu erzeugen. Die API braucht weiter `WEB_PUSH_ENABLED=true`. Für einen Notfall beide Aufrufe mit `WEB_PUSH_ENABLED=false WEB_PUSH_ALLOW_ALL=false` ausführen. Das stoppt neue Claims; bereits laufende Sends können abschließen. Derselbe Releaseaufruf mit bekannten kompatiblen App-/Pushdigests setzt auch das zugehörige Functionpaket zurück. Keine Tabellen, Bindungen oder Tombstones löschen. Ein Rückfall vor dieses Pushpaket erfordert zuerst ausgeschalteten Versand; die neuen Tabellen bleiben bestehen.

`GET /healthz` zeigt Commit, Freigabeumfang und dauerhafte Zähler waiting/accepted/retry/expired/configuration_error. Konfigurationsfehler werden über dieses Feld und kontrollierte interne ID-Logs sichtbar. SQL-Bereinigung läuft stündlich in 1000er-Batches, auch bei ausgeschaltetem Versand, sofern Backendkonfiguration vorhanden ist: Historie 7 Tage, Ereignisse 30 Tage, deaktivierte Bindungen 30 Tage; Tombstones dauerhaft.

Lokale Prüfung: `npm ci`, `npm run typecheck`, `npm test`, `npm run build` im Paket; Imagesmoke über `scripts/smoke-image.mjs`, Functionssmoke über `scripts/smoke-functions.mjs`. Diese Containerprüfungen belegen keine echte Android-/iOS-Zustellung.

Der interne eBay-Bestellbeobachter arbeitet nur fuer berechtigte Accountbesitzer mit aktiver Bestellpraeferenz und Pilotfreigabe. Derselbe verschluesselte OAuth-Bestand wird im Functions-Dienst verarbeitet; dafuer die bestehenden EBAY-Serverwerte in push.env uebernehmen. Der Versanddienst besitzt keine OAuth-Tokens. Ein eigenes internes Docker-Netz verbindet Worker und Functions; der Gateway gibt den Observer nicht frei. Jeder Konto-Scan nutzt ein gefrorenes Zeitfenster, maximal fuenf Seiten pro Lauf, zehn Minuten Ueberlappung und dauerhafte Bestellkennungen. Erstbaseline und historischer Backfill bleiben still; keine automatischen Buchhaltungsimporte. Die eBay-Fulfillment-API liefert nur die letzten 90 Tage. Ein fehlerhafter Teilscan haelt seine Watermark und setzt nach Wartezeit denselben Cursor fort.
