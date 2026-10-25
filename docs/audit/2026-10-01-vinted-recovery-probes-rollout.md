# Veröffentlichung der begrenzten Vinted-Wiederprüfungen

Datum: 2026-10-01. Uhrzeiten in Europe/Berlin, sofern nicht ausdrücklich UTC.

## Freigabe und Prüfungen

Der Nutzer autorisierte mit „ja“ den PR, das Abwarten erfolgreicher
Pflichtprüfungen, den Merge-Commit und das Aufräumen des eigenen Zweigs.

- PR: <https://github.com/GrischaTDev/flipbase/pull/276>
- Geprüfter Zweig: `juna/vinted-recovery-probes`, Commit `25e75985`.
- Merge-Commit: `fd4dc95f6e7d3ba35b68b534110e603dbf78fad1`.
- PR-Prüfung: <https://github.com/GrischaTDev/flipbase/actions/runs/36924321561>
- Veröffentlichung: <https://github.com/GrischaTDev/flipbase/actions/runs/36924757666>
- Version: `v0.276.5`, veröffentlicht um 22:58:12 Uhr.

Lokal waren 204 Bot-Tests, Typprüfung, Dienstbau, gezieltes Format/Lint,
Docker-Bau und isolierter Image-Starttest erfolgreich. Im PR bestanden die
Qualitätsprüfung, Botprüfung und abschließenden Pflichtprüfungen. Der
Veröffentlichungslauf verwendete die erfolgreichen Prüfungen für denselben
Dateibaum wieder; Web- und Bot-Produktionsbau, beide Image-Starttests,
Deployment und öffentliche Prüfungen waren ebenfalls erfolgreich.
Keine Schemaänderung oder neue Migration.

## Tatsächlicher Wiederanlauf

Die bisher gespeicherte Pause wurde nicht zurückgesetzt. Ihre reguläre Probe
um 22:52:18 Uhr war bereits mit dem bisherigen Bot-Abbild erfolgreich.
Der erste danach gespeicherte Erstfund stammt von 22:52:20 Uhr. Die anderen
beiden aktiven Marken nahmen anschließend ebenfalls den Abruf wieder auf.
Dieser Erfolg trat vor dem Deployment auf und ist nicht der neuen Regel
zuzuschreiben.

Das neue Abbild `ghcr.io/grischatdev/flipbase-sniper:sha-fd4dc95` läuft seit
22:57:52 Uhr. Bei der anschließenden lesenden Betriebsprüfung war der Container
gesund, ohne Neustarts. Alle drei aktiven Marken hatten nach dem Deployment
erfolgreiche Abrufe und Fehlerzähler null. Die gemeinsame Quelle war bereit,
ohne gespeicherte Pause oder laufende Wiederprobe. Seit der Wiederaufnahme
waren 850 zuvor unbekannte Artikel gespeichert, der letzte Erstfund um
22:58:44 Uhr. Die Startmeldung bestätigt weiterhin zehn Sekunden
Mindestabstand und 20 Sekunden Anfragezeitlimit.

Die veröffentlichte Änderung erlaubt nach einer bestätigten Prüfseite alle
fünf Minuten eine einzelne zentrale Probe, sofern der Anbieter keine längere
Wartezeit vorgibt. Erst ein erfolgreich gelesener Katalog hebt die Pause auf.
Andere 403-Antworten und 429-Antworten behalten ihre bisherigen Regeln.
Bestehende gespeicherte Pausen werden nicht rückwirkend verkürzt.

## Grenzen und Abschluss

Der ursprüngliche Prüfseitenauslöser bleibt unbekannt. Der aktuelle Zulauf
belegt einen erfolgreichen Wiederanlauf, keine langfristige Ausfallsicherheit.
Die neue Regel wurde mit wiederholten Prüfseiten, mehreren Marken und
Scheduler-Neustarts lokal geprüft; ein weiterer echter Prüfseitenzyklus nach
dem Deployment ist in diesem kurzen Beobachtungsfenster nicht nachgewiesen.

Der Remote-Zweig wurde erst nach dem Nachweis entfernt, dass sein geprüfter
Commit in `origin/master` enthalten ist. Der eigene Worktree wurde archiviert
und der lokale Zweig nach erneutem Merge-Nachweis gelöscht. Fremde Zweige und lokale Änderungen bleiben
erhalten. Diese Abschlussdokumentation liegt im ursprünglichen Checkout und
wird nicht als weiterer Produktionsrelease veröffentlicht.
