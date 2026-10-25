# Vinted-Chatpreise: fehlende Worker-Aktualisierung

## Livebefund am 18.10.2026

Der Nutzer meldet nach PR #436, dass auch nach erneutem Öffnen bereits gesendete Angebote keinen Originalpreis zeigen. Im vorhandenen Chrome-Tab wurde der betroffene Chat ohne Navigation oder Versand gelesen: Artikelstreifen und gesendetes Angebot zeigen beide 24,21 €, ohne durchgestrichenen Originalpreis. Die Ansicht meldet einen erfolgreichen Abgleich.

Die produktive Web-App wurde durch PR #436 als Version 0.357.2 veröffentlicht. Der separate Container `flipbase-marketplace-worker` läuft jedoch weiterhin mit dem Image aus `e3ef736370640125c1abddcaf82de6079205d9fa`, Digest `sha256:45e1553269bdf77db1e7602cf79bd3612b9f4671f512aeca008cb7c52f93e2e1`.

Rein lesende Kontrolle des kompilierten Preisparsers im laufenden Container bestätigt: `transaction.offer_price` wird weiterhin vor `item.price` benutzt, die neue Funktion `offerPriceLabel` fehlt. Die Anzeige ist damit trotz aktualisierter Web-App weiter von den alten Importwerten abhängig. Die vorherige Chat-Aussage, ein erneutes Öffnen reiche bereits aus, war für den produktiven Zustand falsch.

## Veröffentlichungsweg und vorbereitete Korrektur

Der Workflow `marketplace-worker-image.yml` testet auf Pull Requests und veröffentlicht nur bei ausdrücklichem `workflow_dispatch`. Ein Web-Release übernimmt den Worker nicht. Der letzte erfolgreiche Veröffentlichungsaufruf verwendete `e3ef7363`; die erfolgreichen PR-Prüfungen für #436 waren kein Worker-Rollout.

Ziel ist der bereits mit grünen Pflichtprüfungen gemergte Stand `d8993677cac943e2e280c47a973518d32274a519`. Gegenüber dem laufenden Stand ändert sich im Worker-Quellcode ausschließlich der Preisimport in `vinted-account-import.ts`; Worker-Abhängigkeiten, Dockerfile und Compose-Vorlage sind unverändert.

Für die Aktualisierung das geprüfte Worker-Abbild veröffentlichen, laufende Arbeit geordnet beenden, die aktive Compose-Konfiguration sichern und ausschließlich den Worker auf den neuen Digest umstellen. Anschließend Gesundheit, tatsächlich geladenen Preisparser und einen bestehenden Chat einschließlich Artikel- und Angebotspreis prüfen. Broker, Sitzungsimage, Kontoprofile und bestehende Automatik-/Schreibfreigaben unverändert erhalten. Keine neue Nachricht und kein neues Angebot versenden. Aktive Compose-Datei: `/opt/flipbase-marketplace/chat-activity-e3ef7363/compose.release.json`.

## Freigabegrenze

Die automatische Freigabeprüfung hat den angeforderten Workflowstart mit dem Hinweis abgelehnt, dass für diese konkrete Produktionsänderung keine ausdrückliche Nutzerfreigabe vorliegt. Der Workflow wurde nicht gestartet, kein Image veröffentlicht und kein Dienst neu gestartet. Es wurden ausschließlich Oberfläche, Workflowhistorie, Container-Version, Preisparser und ausgewählte Betriebsflags gelesen. Die Aktualisierung wartet auf die ausdrückliche Freigabe des Nutzers.

## Ausdrückliche Freigabe und erste Aktualisierung

Am 18.10.2026 hat der Nutzer PR/Merge für das Angebotsavatar und die Cloud-Aktualisierung für die Preisanzeige ausdrücklich freigegeben. Der Veröffentlichungsworkflow 39138337934 für den aktuellen Hauptzweig 5880c744 lief erfolgreich. Der Worker verwendet jetzt Digest sha256:2a33fcc1d04c0c91251494a080ecaf6ca4ffe1e02de3f404d9b04ea114c7f22e und ist gesund. Keine laufenden Abrufe, Schreibvorgänge oder Sitzungen beim Wechsel; alle 27 Umgebungswerte und die Brokerinstanz blieben gleich. Sicherungen und neue Compose-Datei unter /opt/flipbase-marketplace/chat-prices-5880c744/ mit geschützten Dateirechten.

Die erneute Livekontrolle zeigt noch unveränderte Preise: Der tatsächliche ImportAccount-Aufruf wird im getrennten Browser-Sitzungsabbild ausgeführt. Auch dieses enthält den alten Preisparser. Deshalb reicht die Worker-Aktualisierung allein nicht. Der zusätzlich erforderliche Veröffentlichungsworkflow 39139012453 für dasselbe geprüfte Quellcommit wurde im Rahmen der ausdrücklichen Cloudfreigabe gestartet. Nach erfolgreicher Prüfung muss dessen Digest in den bestehenden Sitzungsabbild-Einstellungen von Broker und Worker gesetzt werden; Profile, übrige Freigaben und Broker-Abbild bleiben erhalten.

Avatar-Korrektur: PR #438, https://github.com/GrischaTDev/flipbase/pull/438. Die serverseitige Lesefunktion prüft bestätigte Angebotsbelege. Ein bestehendes Angebot im gemeldeten Gespräch passt bereits per Angebotskennung und Gesprächskennung zu seinem gespeicherten automatischen Versandbeleg. Die abschließende gemeinsame Sichtprüfung folgt nach erfolgreicher Pflicht-CI, Merge, Migration und Anwendungsauslieferung.

## Vollständiger Cloudstand und verbliebene Kopfzeile

Der getrennte Browser-Veröffentlichungsworkflow 39139012453 für 5880c744 war erfolgreich. Das tatsächlich verwendete Sitzungsabbild ist jetzt sha256:84ddef6d08521cf367cdf1c0e218add92648b6faf891897aeb37d4386155778e. Im alten Abbild fehlten beide Preisparser-Korrekturen nachweislich; das neue wurde vor Einsatz ohne Netzwerk, Profil oder Browserstart auf beide Quellpfade geprüft. Anschließend Worker geordnet angehalten, genau MARKETPLACE_CHROMIUM_IMAGE in Worker und Broker geändert, Broker und Worker gesund gestartet. Profile/Mounts, sämtliche übrigen Umgebungswerte und beide Dienstabbilder gleich geblieben. Geschützte Sicherung unter /opt/flipbase-marketplace/chat-prices-session-5880c744/.

Die Livekontrolle eines alten Angebots zeigt nun 26,90 € durchgestrichen vor 24,21 €. Der Kopf blieb bei 24,21 €. Rein lesender Preisvergleich bestätigt im Gespräch den alten Wert 24,21 €, im genau verknüpften Inserat 26,90 €. Fehlende neue item.price-Werte überschreiben den alten Kopfpreis nicht. Deshalb ergänzt PR #438 die serverseitige Kopfprojektion aus dem passenden gespeicherten Inserat. Preis und Währung werden gemeinsam und kontogebunden geprüft; fehlender/ungültiger Treffer und bekannte Bundles erhalten das bisherige Paar. Der Kopf zeigt bewusst den letzten gespeicherten Inseratspreis, keine historische Rabatt-Rückrechnung.

Zwölf neue Datenbankfälle reproduzierten drei erwartete Fehler vor der Korrektur. Danach alle 172 gezielten und alle 4.546 Datenbankprüfungen erfolgreich; kombinierte Migration automatisch neu erzeugt, in frischer Kopie transaktional eingespielt und leeren Zielvergleich nachgewiesen. Zweiter unabhängiger Review ohne offenen Befund. Der endgültige PR-Stand d0eb7a416e6aee760256147fb5630bab0b6c47e5 läuft in CI 39139979023; der überholte erste Lauf wurde vor dem Korrektur-Push beendet. Keine Nachricht und kein Angebot testweise versandt. Die abschließende gemeinsame Livekontrolle folgt nach grünem PR und Deployment.

## Erfolgreicher Abschluss und echte Altangebotskontrolle

PR #438 nach sämtlichen erfolgreichen Pflichtprüfungen mit Merge-Commit 8cef6b78ad34b9cbecf7c81be728d5e34883319a integriert. CI 39139979023: alle Anwendungstests, Datenbank, Produktions-PWA, Qualitätsprüfung und 224 Browserfälle erfolgreich (210 allgemeine plus 14 vollständige geänderte Postfachfälle); abschließende Required-checks-Prüfung grün. Produktionslauf 39141542144 ebenfalls vollständig erfolgreich. Migration 20261018125321 am 18.10.2026 um 15:43:01 UTC angewendet; öffentliche Auslieferung des Merge-Commits unabhängig mit verify-public-deployment.mjs bestätigt.

Live wurden danach die bestehenden Gespräche mleszkoi (Angebot 14:16 Uhr) und sky2k26 (Angebot 13:49 Uhr) im ursprünglichen angemeldeten Tab geöffnet. Beide zeigen im Artikelkopf 26,90 €, im Angebot 26,90 € durchgestrichen vor 24,21 € und jeweils das KI-Avatar an Text und Angebot. Synchronisierung 17:43 beziehungsweise17:44 Uhr deutscher Zeit bestätigt. Rein lesende Datenbankkontrolle zeigt je Gespräch weiterhin genau zwei ausgehende Nachrichten, darunter genau ein Angebot. Keine Nachricht und kein Angebot erneut versandt. Bildschirmbelege in der Visualisierungsablage unter vinted-existing-offer-mleszkoi.png und vinted-existing-offer-sky2k26.png gesichert; ursprünglichen Chat wieder ausgewählt.

Worker weiterhin gesund, Broker läuft; beide nutzen das geprüfte neue Sitzungsabbild. Der lokale Hauptzweig wurde auf den Merge vorgezogen; sämtliche 202 vorhandenen unveröffentlichten Changelog-Zeilen exakt erhalten. Eigene Testdatenbank ist gestoppt, temporäre Konfiguration zurückgesetzt, Supabase-Typen unverändert. Eigene Test-/CI-/Deploymentnachweise vor dem abschließenden Zweig-/Worktree-Aufräumen unter tmp/vinted-offer-avatar-20261018/ gesichert.
