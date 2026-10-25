# Cloudbereitstellung der Chatkorrektur vom 17.10.2026

Der Nutzer hat die getrennte Cloudaktualisierung ausdrücklich freigegeben. Bereitgestellt ist der in PR #433 geprüfte Merge-Commit `e3ef736370640125c1abddcaf82de6079205d9fa`. Der Dateistand stimmt mit dem grünen PR überein; Anwendung und Datenbankmigration waren bereits produktiv.

## Veröffentlichte Abbilder

- [Worker-/Broker-Veröffentlichung](https://github.com/GrischaTDev/flipbase/actions/runs/39055740877): erfolgreich, exakt dieser Commit.
- [Browser-Veröffentlichung](https://github.com/GrischaTDev/flipbase/actions/runs/39055742816): erfolgreich, exakt dieser Commit.
- Worker: `ghcr.io/grischatdev/flipbase-marketplace-worker@sha256:45e1553269bdf77db1e7602cf79bd3612b9f4671f512aeca008cb7c52f93e2e1`.
- Broker: `ghcr.io/grischatdev/flipbase-chromium-broker@sha256:b3ec4a238f0c2022c6ca918e1c8bd23e3f71b605c786b6b967d400f3e1a25740`.
- Sitzungsabbild: `ghcr.io/grischatdev/flipbase-chromium-session@sha256:0fe2e94228019594596204004e5a1d3b63a1e5587b416a09653771347e66774f`.

Worker und Broker verwenden beide das neue Sitzungsabbild. Das Laufzeitlabel `isolated-actions-v1` ist vorhanden. Der bereits laufende Provider bleibt Chromium; die aktuellen Repository-Vorgaben für neue GoLogin-Installationen wurden nicht auf diese Installation übertragen.

## Gesicherter Wechsel

Die effektive bestehende Konfiguration wurde aus den bisherigen Compose-Dateien und den tatsächlichen Laufzeitwerten rekonstruiert und mit der laufenden Umgebung verglichen. Der private Zustand, `.env` und `marketplace-worker.env` liegen ausschließlich auf dem Server unter `/opt/flipbase-marketplace/chat-activity-e3ef7363`, Verzeichnis 0700 und sensible Dateien 0600. Diese privaten Dateien wurden nicht in lokale Nachweise oder Git übernommen.

Die neue Konfiguration ändert ausschließlich Worker-/Broker-Digests und deren Sitzungsabbildverweise. Umgebungswerte, Zeitpläne, Schutzgrenzen, Profilpfade und Zugriffsrechte sind mit dem vorherigen Stand verglichen. Controller und Broker behalten je 512 MiB und ein schreibgeschütztes Grunddateisystem. Profilablagen wurden weder kopiert noch umgeschrieben.

Vor jedem Wechsel waren keine aktiven oder zu bereinigenden Sitzungen, laufenden Leseaufträge oder beanspruchten/senden­den Cloud-Nachrichten, Angebote und Favoritenaktionen vorhanden. Der Worker wurde zuerst geordnet beendet und ließ laufende Arbeit auslaufen; anschließend wurde der Broker beendet. Danach starteten neuer Broker und neuer Worker. Der endgültige Wechsel erfolgte am 17.10.2026 um 18:03:37 UTC (20:03:37 Uhr Europe/Berlin).

Zwei anfängliche Schutzabbrecher stellten den bisherigen gesunden Stand automatisch wieder her. Ursache waren ausschließlich zu strenge Annahmen im Bereitstellungsskript: Broker-SIGTERM wird regulär als 143 gemeldet; Bind-Listen können bei identischem Inhalt anders sortiert sein. Nach Prüfung wurden der erwartete Signalvertrag und der Vergleich vollständiger Bind-Einträge ohne Reihenfolgenabhängigkeit verwendet. Tatsächliche Abweichungen, offene Aktionen, OOM und erzwungenes Beenden bleiben gesperrt. Die anschließende Prüfung war erfolgreich.

## Abnahme

- Je sieben netzlose synthetische Fälle aus Workerabbild und Sitzungsabbild: Verfügbarkeitsstatus bleibt im Verlauf, aktualisiert die Chataktivität nicht; gleiche echte Nachrichten bleiben wirksam; offener Detailstand durchläuft die isolierte Prozessgrenze.
- Dieselben sieben Fälle direkt aus dem geladenen Code des laufenden Cloud-Workers erfolgreich.
- Öffentlicher Gesundheitsstatus HTTP 200, `ok=true`, `readOnly=false`, `apiVersion=2`, automatische Synchronisierung weiterhin aktiv.
- Anonymer POST auf `/marketplace-browser/connections/sync/start` mit HTTP 401 abgewiesen; kein Auftrag angelegt.
- Nachkontrolle um 18:04:55 UTC: richtiger Worker-/Broker-Digest, Worker gesund, Broker laufend, beide ohne Neustarts oder OOM und ohne kritische Startmeldungen.

Für die Abnahme wurden keine echten Nachrichten versandt, keine Anzeigen veröffentlicht und keine manuellen Vinted-Abrufe ausgelöst. Die normale freigegebene Automatik bleibt aktiv. Die Änderung greift beim nächsten Cloud-Abgleich. Eine Reparatur vorhandener falscher Vorschauen setzt eine belegte frühere Aktivität oder passende datierte Nachrichten voraus; historische Positionen werden nicht erfunden.

## Rückweg

Die bisherigen Images und die geschützte vollständige vorherige Compose-Konfiguration sind erhalten. Bei einem Rückfall zuerst Worker geordnet anhalten, offene Sitzungen/Schreibaktionen erneut prüfen, Broker beenden, dann Broker und Worker gemeinsam aus `compose.before.json` starten und Gesundheit sowie unveränderte Konfiguration bestätigen. Keine Profilablage, Sperre oder Aufträge löschen und keine Datenbankmigration zurückdrehen. Die automatische Rückkehr auf den vorherigen gesunden Stand wurde bei den beiden Schutzabbrüchen bereits tatsächlich bestätigt.
