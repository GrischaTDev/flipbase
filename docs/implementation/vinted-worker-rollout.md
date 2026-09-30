# Vinted-Browserdienst: Veröffentlichung des Admin-Piloten

## Aktueller Betriebsstand vom 30.09.2026 – verlässliche Teilabrufe

Nach dem erfolgreichen PR #267 und der bereits veröffentlichten Web-App samt
Migration wurde der separat freigegebene Worker-Rollout durchgeführt. Der
Workflow [36781655658](https://github.com/GrischaTDev/flipbase/actions/runs/36781655658)
baute erfolgreich genau den Merge-Commit
`e753200e8a5aac72945e0af150fd8e4b80dff544`. Die bestehende einzelne Instanz läuft
mit `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-e753200e8a5aac72945e0af150fd8e4b80dff544`.
Der geladene Image-Digest ist
`sha256:053d819f00a1e710704bb1c0cbad4c7aa0aae8db1b44cae55046098642526673`.

Die Compose-Datei stimmt per SHA-256 mit dem geprüften Repository überein.
Vor dem Wechsel wurden `.env.before-e753200e` und
`docker-compose.before-e753200e.yml` unter `/opt/flipbase-marketplace/` mit
Modus 0600 gesichert. Das zuvor tatsächlich laufende Image
`sha-cdc9747f131b85e46f08f3e781788660d20c3c7d` bleibt für den Rückweg erhalten.
Ein Rückweg erfolgt durch Wiederherstellen der gesicherten `.env` und erneutes
Starten ausschließlich des Worker-Dienstes mit der bestehenden Compose-Datei.

Vor dem Wechsel waren 39 Browsersitzungen geschlossen; es gab keine aktive
oder ungeklärte Sitzung und keinen wartenden oder laufenden Auftrag. Diese
beiden Sperrkriterien wurden direkt vor dem Wechsel und danach erneut
bestätigt. Die Migration `20260930210350` ist installiert. Die atomare
Importfunktion ist verfügbar und ausführbar für `service_role`, aber weder
für `anon` noch für `authenticated`.

Der neue Container meldet `running` und `healthy`. Der öffentliche Healthcheck
liefert HTTP 200 mit `ok: true`, `readOnly: false` und `apiVersion: 2`;
ein anonymer POST auf `/marketplace-browser/connections/sync/start` wird mit
HTTP 401 abgewiesen. Die öffentliche Web-App liefert weiterhin denselben
Merge-Commit aus. Ein echter Kontodatenabruf wurde durch den Rollout nicht
ausgeführt; dieser Live-Nachweis bleibt separat offen. Automatische Abrufe,
neue Benachrichtigungen und lokale Inseratentwürfe folgen in den weiteren
geplanten Paketen.

## Aktueller Betriebsstand vom 28.09.2026 – Auftragsabruf

Nach gesonderter Nutzerfreigabe wurde das aus dem bereits veröffentlichten
Merge-Commit `cdbe3f5f195cdbd4267869de73cad35b13439896` erfolgreich gebaute
Worker-Image `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-cdbe3f5f195cdbd4267869de73cad35b13439896`
auf die bestehende einzelne Instanz umgestellt. Die Compose-Datei stimmte
per SHA-256 mit dem Repository überein und wurde vor dem Wechsel mit Modus
0600 gesichert. Das vorige Image `sha-1c7b65752c95653d17fe30ddb51a6bcc05d7ca1f`
bleibt für einen Rückweg erhalten.

Vor und nach dem Wechsel waren 19 Browsersitzungen geschlossen, keine aktiv
oder ungeklärt; die Auftragstabelle war leer. Der Container ist gesund. Der
öffentliche Healthcheck meldete HTTP 200 mit `ok: true`, `readOnly: false`
und `apiVersion: 2`. Ein nicht angemeldeter POST auf den neuen
Auftragsendpunkt wurde mit HTTP 401 abgewiesen. Ein echter Abruf des eigenen
Kontos ist weiterhin vom Nutzer in Flipbase zu prüfen. Der Healthcheck allein
bestätigt keine erfolgreichen Vinted-Daten.

## Aktueller Betriebsstand vom 28.09.2026 – manueller Datenimport

Nach dem grünen PR #237 wurde der Merge-Commit
`47a1529102bf16829cf448a84915d95fa0913543` automatisch als Web-App
veröffentlicht und öffentlich geprüft. Nach gesonderter Nutzerfreigabe baute
der Workflow „Publish Marketplace Worker Image“ aus genau diesem Commit das
Image `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-47a1529102bf16829cf448a84915d95fa0913543`.
Nur die bestehende Worker-Instanz wurde auf dieses Image umgestellt. Die
Compose-Datei stimmte mit dem geprüften Repository-Stand überein; eine Kopie
mit Modus 0600 und das vorige Image `sha-db63bf194c99798f8de59d761ff59782f29ba438`
bleiben für den Rückweg auf dem Server.

Vor und nach der Umstellung gab es fünf geschlossene und keine aktiven oder
ungeklärten Browsersitzungen. Der Container ist gesund. Der öffentliche
Healthcheck meldet `ok: true`, `apiVersion: 2`, `readOnly: false`; ein
anonymer Sitzungsstart liefert HTTP 401. Es wurde kein Vinted-Datenabruf und
kein Nachrichtenversand durch den Rollout ausgelöst. Ein vom Nutzer gestarteter
erster Import und der mögliche erneute HTTP-403-Fehler sind noch zu prüfen.

## Vorheriger Betriebsstand vom 28.09.2026

Nach PR #235 und gesonderter Freigabe läuft der Worker mit dem Image
`ghcr.io/grischatdev/flipbase-marketplace-worker:sha-db63bf194c99798f8de59d761ff59782f29ba438`.
Die Web-App liefert denselben Merge-Commit aus. Der Container ist gesund,
der öffentliche Gesundheitscheck meldet `ok: true`, `apiVersion: 2` und
`readOnly: false`, und ein Sitzungsstart ohne Anmeldung wird mit HTTP 401
abgewiesen. Vor und nach dem Wechsel gab es null aktive und null ungeklärte
Browsersitzungen. Das vorige Image
`sha-ece0676d1cf2e06ae01ff9dbe188857e7dfbb608` und die vorige
Compose-Zuordnung bleiben auf dem Server für einen Rückweg erhalten. Nach dem
Rollout startete der Nutzer das eigene ausstehende Konto erneut; Flipbase
meldete „Das Konto ist verbunden“. Eine lesende Datenbankprüfung bestätigte
genau eine `connected`-Verbindung und fünf geschlossene statt zuvor vier
Browsersitzungen, ohne offene Sitzung. Ein echter Codeversand und die Löschung
eines ausgewählten Kontos bleiben als Live-Nachweise offen.

Die folgende Anleitung dokumentiert die ursprüngliche Einrichtung und den
Rückweg. Ihre Bestandsaufnahme vom 27.09.2026 ist historisch.

Historischer Stand vom 27.09.2026: Die Veröffentlichung war zu diesem
Zeitpunkt noch nicht ausgeführt und brauchte die Freigabe des geprüften PRs
sowie die Freigabe zur produktiven Aktivierung.

## Lesend bestätigter Serverstand

- SSH auf dem Flipbase-Server funktioniert.
- Caddy leitet `/marketplace-browser/*` bereits an `flipbase-marketplace-worker:4179` weiter.
- Dieser Container existiert noch nicht; daher antwortet der öffentliche Endpunkt mit 502.
- Das Docker-Netz `supabase_default` enthält den Gateway-Alias `api-gw`.
- Der GoLogin-Token liegt lokal benutzergebunden verschlüsselt vor. Er gehört
  weder in Git noch in eine Chatnachricht oder einen Browserlink.
- Ein früheres Worker-Abbild enthält noch nicht diesen Anmeldeablauf. Es darf
  nicht als Veröffentlichung dieses Arbeitspakets verwendet werden.

## Schritte nach Freigabe

1. Branch über den PR mit erfolgreichen Pflichtprüfungen integrieren und den
   tatsächlichen Merge-SHA festhalten. Web-Deployment auf diesen Stand abwarten.
2. `Publish Marketplace Worker Image` auf diesem geprüften master-Stand ausführen.
   Image `ghcr.io/grischatdev/flipbase-marketplace-worker:sha-<MERGE_SHA>` verwenden;
   Workflow und Image-SHA müssen übereinstimmen.
3. Serverordner `/opt/flipbase-marketplace` mit Modus 0700 anlegen. Die vorhandene
   Compose-Datei aus demselben Commit dorthin übertragen. `marketplace-worker.env`
   mit Modus 0600 erstellen. Nur die Variablennamen aus
   `deploy/marketplace-worker.env.example` verwenden; Supabase-Schlüssel auf dem
   Server aus der vorhandenen Konfiguration übernehmen. GoLogin-Token ausschließlich
   über den verschlüsselten SSH-Eingabekanal übertragen, nicht als Kommandoargument.
   Keine Ausgabe des Datei- oder Container-Umgebungsinhalts.
4. `FLIPBASE_MARKETPLACE_IMAGE` auf genau das SHA-Abbild setzen. Compose mit
   `config --quiet` prüfen, ausschließlich den neuen Worker starten. Bestehende
   Supabase- und Webcontainer bleiben in Betrieb. Nur eine Worker-Instanz starten.
5. Container-Health und öffentlichen `/marketplace-browser/healthz` prüfen
   (`ok: true`, `readOnly: false`). Nicht angemeldete Sitzungsstarts müssen 401
   zurückgeben. Ein normaler Workspace-Admin ohne Betreiberrolle darf keinen
   Browser starten.
6. Der Betreiber meldet sein eigenes Vinted-Konto in Flipbase an. Zusätzliche
   Sicherheitsprüfungen werden von ihm durchgeführt. Erst nach tatsächlichem
   Identitätsnachweis und erneutem Öffnen desselben Profils ist der Kontopilot
   nachgewiesen. Passwort und Browserbilder nicht in Testartefakte aufnehmen.
7. Danach Ablauf, Abbruch und erneute Anmeldung am freigegebenen Konto prüfen.
   Vor einem zweiten Konto außerdem Anbieterparallelität, Proxy-IP-Verhalten,
   Kosten und benötigte Plattformrechte prüfen. 500 MiB vorhandenes Kontingent
   ist kein Kapazitätsnachweis für 100 Nutzer.

## Abbruch und Rücknahme

Bei fehlgeschlagenem Stopp bleibt die Datenbanksperre bestehen. Keine Sperre
manuell löschen, solange ein Anbieterbrowser möglicherweise noch läuft.
Worker geordnet stoppen und dessen Wiederanlauf-Abgleich verwenden. Bei einer
Rücknahme den letzten geprüften Image-SHA verwenden; bei dieser Erstinstallation
den neuen Worker stoppen. Profilzuordnungen und Sitzungstabellen nicht entfernen.

Ein grüner Gesundheitscheck bestätigt den Dienstbetrieb. Er beweist weder einen
Vinted-Login noch Profilimport, Nachrichtenversand oder Sperrfreiheit.
