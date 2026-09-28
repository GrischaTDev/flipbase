# Vinted-Browserdienst: Veröffentlichung des Admin-Piloten

## Aktueller Betriebsstand vom 28.09.2026

Nach PR #233 und gesonderter Freigabe läuft der Worker mit dem Image
`ghcr.io/grischatdev/flipbase-marketplace-worker:sha-ece0676d1cf2e06ae01ff9dbe188857e7dfbb608`.
Die Web-App liefert denselben Merge-Commit aus. Der Container ist gesund,
der öffentliche Gesundheitscheck meldet `apiVersion: 2` und
`readOnly: false`, und ein Sitzungsstart ohne Anmeldung wird mit HTTP 401
abgewiesen. Vor und nach dem Wechsel gab es null aktive und null ungeklärte
Browsersitzungen. Das vorige Image
`sha-e912b17b3b7a6658f2eafb9af87acf62a783b7d0` und die vorige
Compose-Zuordnung bleiben auf dem Server für einen Rückweg erhalten. Ein
echter Codeversand, die bestätigte Vinted-Identität und die Löschung eines
ausgewählten Kontos bleiben als Live-Nachweise offen.

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
