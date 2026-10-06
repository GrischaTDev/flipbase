# 🤖 KI-Änderungsprotokoll

## 2026-10-06 - Juna - bestätigte Sicherheitsbefunde korrigieren

**Auftrag:** Nach Freigabe die bestätigten Befunde im eigenen Zweig
`juna/security-report-triage` korrigieren und prüfen.

**Umsetzung:** Caddy sperrt `/mcp` und `/api/mcp` einschließlich Unterpfaden vor
der öffentlichen API-Freigabe. Alle fünf TLS-Domains erhalten HSTS mit zunächst
300 Sekunden ohne Subdomainbindung oder Preload. Webhook-Konfigurationen werden
nicht mehr im Browser gespeichert; beide früheren Speicherschlüssel werden bereits
vor Angular und der Präfix-Migration entfernt. Speichern setzt die vollständig
geladene Konfiguration des aktiven Workspace voraus. Eigene Webhook-Tests melden
den fehlenden Versand korrekt. Nodemailer gehört im Hauptprojekt nur noch zu den
Testabhängigkeiten. Die zusammengehörigen Angular-Pakete sind auf 22.2.1 aktualisiert;
die abhängigen Buildpakete einschließlich Piscina 5.3.2 sind neu aufgelöst.

**Prüfung:** Paket-Audit ohne bekannte Schwachstellen, vollständige Anwendungssuiten
(Node, DOM, Angular), 222 Workflow-Tests sowie Build, Lint und Typprüfung bestanden.
Die unabhängige Prüfung zeigte zwei zusätzliche Browser-/Workspace-Pfade; die neuen
Regressionstests reproduzierten sie vor der Korrektur und bestehen danach zusammen
mit den zugehörigen Service-, Speicher- und gerenderten Einstellungsprüfungen.
Caddy-Konfiguration validiert und mit dem installierten Image in einem kurzlebigen
Container ohne Netzanschluss gegen lokale Testgegenstellen geprüft: sechs MCP-Pfade
abgewiesen, öffentliche APIs und angemeldetes Studio erreichbar, anonymes Studio
abgewiesen, Browserroute und HSTS aller fünf Hosts erhalten. Testcontainer entfernt.
Der währenddessen gemergte PR #318 ist aus `origin/master` übernommen; beide
Protokolleinträge bleiben erhalten. Auf dem verbundenen Stand bestehen zusätzlich
127 betroffene Angular-Tests, die Typprüfung und der Produktionsbau.

**Offen:** Produktionskonfiguration nur gelesen, keine Auslieferung. Das installierte
Envoy verweigert MCP bereits; Caddy ergänzt die äußere Sperre. Serverseitiger
Webhook-Geheimnisspeicher und die Trennung des Docker-Controllers erfordern Backend-
beziehungsweise Betriebsarbeit. Gemäß der Frontend-Grenze liegen dafür die nummerierten
Dateien `01-webhook-secrets-and-server-dispatch.md` und
`02-docker-controller-privilege-boundary.md` auf dem Desktop unter
`Backend Issues/security-report-triage`. Keine Backend-, Schema- oder Edge-Änderung.

## 2026-10-06 - Juna - externen Sicherheitsbericht prüfen

**Auftrag:** Die Befunde des bereitgestellten Sicherheitsberichts am aktuellen Projektstand prüfen und Sicherheitsrisiken von Funktionsfehlern und Wartungsaufgaben unterscheiden.

**Analyse:** Der untersuchte Arbeitsstand `c7d5c2cc` und `origin/master` `d73e990b` enthalten dieselben für den Bericht relevanten Konfigurationen. `/mcp` umgeht im Caddyfile Authelia; eine anonyme administrative Zugriffsmöglichkeit bleibt ohne die installierte Gateway-Konfiguration unbewiesen. HSTS fehlt in den versionierten Headerkonfigurationen. Der Chromium-Pilotcontroller erhält den Docker-Socket, die Browsercontainer erhalten ihn nicht; eine reine Freigabe von Container-Erstellung und Start würde gefährliche Hostmounts nicht verhindern. Telegram-Token und Discord-Webhook-URL werden im Browser verarbeitet und lokal gespeichert; die Tabelle ist durch Workspace-RLS geschützt. Custom-Webhooks besitzen dagegen keinen tatsächlichen Versand, und ihr Test meldet ohne Anfrage Erfolg. Nodemailer wird außerhalb der Edge Function nur im Testfixture importiert und gehört dort in die Entwicklungsabhängigkeiten; das Produktionsimage enthält keinen Node-Laufzeitserver. Die beiden Marketplace-Preview-Workflows haben keinen passenden Remotezweig mehr; der Product-Preview-PR #46 ist bereits gemergt, sein lokaler Worktree besteht noch. Die beiden genannten Hilfsskripte haben keine gefundenen produktiven Aufrufer; daraus folgt bei manuellen Wartungswerkzeugen noch keine sichere Löschfreigabe. 20 ignorierte `.superpowers`-Dateien sind weiterhin versioniert. Die genannten großen Dateien existieren mit den angegebenen Größen; ihre Aufteilung ist eine Wartungsaufgabe.

**Prüfung:** Statische Quellcode-, Konfigurations-, Schema-, Lockfile- und CI-Prüfung sowie lesende GitHub-Abfragen. Die aktuellen Herstellerhinweise zu Supabase-MCP, Docker, HSTS und den betroffenen Angular-/Piscina-Paketen wurden geprüft. `npm audit --json --ignore-scripts` meldet 13 betroffene Pakete (3 kritisch, 7 hoch, 3 moderat). Ohne Entwicklungsabhängigkeiten bleibt ein hoher Angular-Router-Befund; dessen SSR-Voraussetzung fehlt bei der dokumentierten statischen Browserauslieferung. Keine Tests, Builds, Exploitversuche oder Produktionszugriffe. Kein Produktcode geändert; nur dieser vorgeschriebene Sitzungseintrag im eigenen Worktree.

## 2026-10-06 – Juna – Einkaufskosten bei unbepreisten Artikeln korrigiert und Mehrfach-Farbauswahl ermöglicht

**Auftrag:** Bei der Einkaufserfassung soll die Kostenübersicht den aktuellen Gesamtpreis weiterhin anhand aller ausgefüllten Stückpreise berechnen, selbst wenn neu hinzugefügte Positionen noch keinen Preis tragen (statt 0 anzuzeigen). Bei der Produkterstellung soll die Farbauswahl mehrere Farben unterstützen.

**Änderung:**

- Im Einkaufsformular (`PurchaseEntryFormComponent`) berechnet `updatePurchaseBasePriceFromLines` den Warenwert nun als Summe aller vorhandenen, ausgefüllten Positionspreise (`lineTotal`). Frisch hinzugefügte, noch unbepreiste Zeilen setzen den Kopfpreis und die Kostenübersicht nicht mehr auf `null`/`0` zurück.
- Im `AttributePickerComponent` werden ausgewählte Werte bei `multiple: true` mit Farbpunkten (Swatches) dargestellt, sofern für die Farbe ein Farbwert hinterlegt ist. Klicks auf bereits gewählte Optionen schalten diese wieder ab (Toggle).
- In der Produkterstellung (`ProductDialogComponent`), der Variantenanlage (`ProductVariantCreateFormComponent`) und den Artikeldetails (`ProductDetailComponent`) ist die Farbauswahl nun für Mehrfachauswahl (`[multiple]="true"`) aktiviert.

**Prüfung:**

- Angular-Komponententests für `PurchaseEntryFormComponent`, `AttributePickerComponent`, `ProductDialogComponent`, `ProductVariantCreateFormComponent` und `ProductDetailComponent` erfolgreich ausgeführt (302 Tests in 29 Testdateien).
- Prettier-Formatierung und ESLint ohne Fehler/Warnungen abgeschlossen.
- TypeScript-Typprüfung (`npm run typecheck`) ohne Fehler.
- Angular-Produktionsbau (`ng build`) erfolgreich durchgelaufen.

## 2026-10-06 - Juna - Cloud-Chrome über PR #317 abschließen

**Freigabe:** Der Nutzer bestätigt PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und anschließende Bereinigung des eigenen Zweigs. Der aktuelle master f53eb483 wird übernommen; sein Feed und beide Protokollarchive bleiben erhalten. Der einzige Merge-Konflikt betrifft die vorangestellten Einträge im Änderungsprotokoll. Image-Prüfungen und produktive Cloud-Verknüpfung bleiben bis zu ihrem tatsächlichen Nachweis offen.

## 2026-10-06 - Juna - normalen Chrome in die bestehende Cloud-Einrichtung integrieren

**Auftrag:** Den erfolgreich angemeldeten eigenständigen Chrome-Pilot als
Browsermodell für Flipbase übernehmen. Vorhandene Cloud-IP-Reservierung,
Kontoprüfung, Wiederaufnahme und Abbruch verwenden; kein GoLogin-Abonnement.

**Umsetzung:** Das Sitzungsimage startet Google Chrome als eigenen Betriebssystemprozess
mit isoliertem Profil, Sandbox und Anzeige. Erst danach verbindet sich der Worker
über seinen privaten CDP-Zugang ohne Playwright-Kontextvorgaben. Der bereits geprüfte
Proxy-Weiterleiter und der reguläre Fensterschließweg werden aus dem Pilot verwendet.
Zugangsdaten gelangen über eine private Startdatei und den Eingabekanal in den Container,
nicht über Browserargumente. Die manuelle Browseransicht nutzt native Bildschirmaufnahme,
Maus und Tastatur im verifizierten Kontocontainer. Unbestätigter regulärer Browserstopp
führt zu Exitcode 75; Profil und IP bleiben dadurch reserviert. Ein altes Sitzungsimage
wird vor einem neuen Containerstart abgewiesen. Die Anmeldedialoge erhalten die
vorhandene große Dialogvariante und erklären das Einfügen von Text.

**Prüfung:** 38 gezielte Worker-Tests, Worker-Typprüfung und Worker-Bau sowie
43 Angular-Tests einschließlich vorhandener gerenderter Kontodialogprüfungen bestanden.
Geänderte TypeScript- und HTML-Dateien sind gelintet. Der Angular-Produktionsbau
besteht mit dem gebündelten Node 24.19.0; die systemweite Version 22.16.0 ist für
die aktuelle Angular-CLI zu alt. Die vollständige Worker-Suite besteht in einem
temporären Linux-Testordner mit 327 erfolgreichen und einem übersprungenen Test.
Unter Windows besteht sie mit Node 24.19.0 mit 321 erfolgreichen und sieben
übersprungenen Tests. Fünf unveränderte IPRoyal-Abgleichstests schlagen nur mit
dem alten systemweiten Node 22.16.0 fehl. Acht Tests der wiederverwendeten
Pilot-Helfer sowie YAML- und Shell-Syntaxprüfung bestehen. Das neue Browserimage erhält in CI eine Prüfung
für echte native Eingaben, Bildschirmaufnahme, Profiltrennung und regulären Stopp.

**Grenzen:** Das neue Image wurde noch nicht gebaut oder aktiviert; sein Linux-Smoke
läuft im PR. Keine produktive Cloud-Verknüpfung oder Datenbankänderung. Das angemeldete
Maike-Vintage-Pilotprofil bleibt erhalten. Anbieterprüfungen oder Sperren können
weiterhin auftreten; aus dem Pilot folgt keine Garantie für jedes Konto.

## 2026-10-06 - Juna - automatischen Seitenneuladeweg im echten Cloudbrowser prüfen

**Auftrag:** Nach dem Nutzerhinweis auf sein manuelles Neuladen den vorhandenen
HTTP-401-Wiederanlauf ohne weitere Nutzerbedienung prüfen. Das Profil und die
gespeicherten Anmeldedaten bleiben erhalten; keine produktive Kontoumstellung.

**Prüfung:** 31 bestehende Tests für Kontoimport und Identität bestanden,
einschließlich erfolgreicher 401-Erneuerung, entzogener Freigabe und Abbruch
bei 403/429. Im echten Chrome bestätigt ein kurzer Baselineabruf das Konto
mit zwei HTTP-200-Antworten ohne Neuladen. Anschließend beantwortet ein
temporärer Playwright-Test ausschließlich den ersten Profil-GET synthetisch
mit HTTP 401. Der unveränderte produktive Import lädt selbst einmal das
Hauptdokument neu; danach wird die erwartete Identität bestätigt. Fünf weitere
beobachtete API-Antworten liefern HTTP 200, keine sichtbare Mensch-Prüfung und
keine beobachteten API-Schreibaufrufe. Der Test endet vor dem erneuten Abruf
von Inseraten/Gesprächen. Die temporäre Antwortsimulation wird entfernt und
der Testclient beendet; der Browser bleibt geöffnet. Keine Datenbankzugriffe.

**Messgrenze:** Zwei Hauptframe-Navigationsereignisse bedeuten hier einen echten
Dokumentabruf plus ein weiteres Browserereignis. Die zunächst zu strenge
Testbedingung wurde auf die tatsächliche Hauptdokumentanfrage korrigiert;
der wiederholte begrenzte Test bestätigt genau einen solchen Abruf. Kein
Produktcode geändert. Dieser Test beweist den automatischen 401-Ablauf bei
gültiger gespeicherter Anmeldung, nicht die Erneuerung wirklich abgelaufener
Anmeldedaten. Die Ursache des vorherigen echten 401 bleibt offen. Der
vorhandene Synchronisierungsrunner ruft diesen Import direkt auf; die
gesonderte Identitätsprüfung des Loginablaufs ist damit nicht mitgeprüft.

## 2026-10-06 - Juna - echten lesenden Cloudabruf bei Maike Vintage prüfen

**Auftrag:** Nach der erneuten Nutzerbestätigung der angemeldeten Vinted-Startseite
den vorhandenen produktiven Kontoabruf im unabhängigen Chrome-Pilot testen.
Das Browserprofil bleibt erhalten und ist weiterhin keiner Flipbase-Verbindung
zugeordnet. Kein produktiver Workerwechsel oder Datenbankimport.

**Nachweis:** Der unveränderte kompilierte Kontoimport aus dem laufenden Worker
liefert ein Profil, fünf Inserate, acht Gespräche, 28 Nachrichten aus bereits
gelesenen Gesprächen und zwei Bewertungen. Profil, Inserate, Gesprächsübersicht
und Bewertungen sind vollständig gemäß dem bestehenden Leser. Nachrichten und
Verkäufe bleiben ausdrücklich Teilstände; ungelesene Gespräche werden nicht
geöffnet. Zwei Identitätsprüfungen bestätigen Maike Vintage vor den weiteren
Kontobereichen und nach dem Import. 17 Quellanfragen plus diese beiden Prüfungen
liefern ausschließlich HTTP 200. Keine sichtbare Mensch-Prüfung, kein beobachteter
API-Schreibaufruf und kein Datenbankzugang. Der Testclient endet ohne Browserstopp.

**Einordnung:** Eine vorherige einzelne Identitätsprüfung lieferte HTTP 401 und
wurde beendet. Im anschließenden produktiven Import trat dieser Fehler nicht
erneut auf; dessen vorhandener Seitenneuladeweg wurde deshalb nicht ausgelöst.
Der Nutzer bestätigt nachträglich, während des ersten API-Fehlers die Vinted-Seite
manuell neu geladen zu haben. Der erfolgreiche Folgeabruf ist deshalb nach
diesem manuellen Eingriff einzuordnen, nicht als Nachweis selbstständiger
Sitzungserneuerung. Eine Erneuerung der API-Anmeldung durch den Seitenaufbau
ist eine plausible Erklärung; ein eingefrorener Browser ist nicht nachgewiesen.
Die genaue Ursache des ersten 401 bleibt offen. Es wurden keine Cookies,
Passwörter, Nachrichteninhalte oder vollständigen Antworten gespeichert oder
ausgegeben. Der Test ist auf 40 API-Anfragen und 120 Sekunden begrenzt.
Cloud-Verknüpfung, Favoritenereignisse, Schreibaktionen und Dauerbetrieb bleiben
eigene Abnahmen. Keine Funktion oder Anmeldeerkennung geändert.

## 2026-10-06 - Juna - Account-Favoriten über PR #316 abschließen

**Freigabe:** Der Nutzer hat PR-Erstellung, Merge nach erfolgreichen Pflichtprüfungen und das anschließende Aufräumen des eigenen Featurezweigs ausdrücklich bestätigt. PR #316 führt `juna/vinted-feed-account-favorites` nach `master`.

**Integration:** Der geprüfte Feedstand `c40f9f42` wird mit dem aktuellen master `845fc8af` verbunden. Dessen Änderungen am Cloudbrowser-Piloten und seiner Dokumentation bleiben unverändert. Die Überschneidung liegt im gemeinsam vorangestellten Änderungsprotokoll, nicht im Anwendungscode.

**Historie erhalten:** Die vollständigen Protokolle beider Stände bleiben über dieselben Git-Blobs erhalten, ohne Kürzung oder Rekonstruktion. Die Archive liegen weiterhin direkt unter `docs/`, damit ihre relativen Verweise gültig bleiben:

- [Vollständiger master-Verlauf bis zu diesem Abgleich](AI-CHANGELOG-2026-10-06-master.md), unveränderter Blob `d808f266052fb7f3d669ad341592e6d47a2f53f4`. Enthält insbesondere die zwischenzeitlichen Cloudbrowser-Arbeiten und sämtliche älteren Einträge.
- [Vollständiger geprüfter Feed-Verlauf](AI-CHANGELOG-2026-10-06-feed.md), unveränderter Blob `4543609f7f1a6895ab07f42a41212d1790818c31`. Enthält die Implementierungs- und Fehleranalyse der Account-Favoriten sowie den Abschlussnachweis.

**Prüfstand:** Der erneut gelesene Integrationslauf `37497892235` ist erfolgreich: 222 betroffene Anwendungstests, 246 Collector-Tests, 3.209 Datenbankprüfungen und neun Browserabläufe ohne Retry; Produktionsbau, Formatierung, Lint, Typprüfung und Workflow-Verträge bestanden. Die regulären vollständigen PR-Prüfungen auf dem verbundenen Stand sind noch ausstehend. Kein Merge nach master und kein Deployment wurden zu diesem Zeitpunkt durchgeführt.

**Umfang:** Persönliche Account-Favoriten je Benutzer und Workspace, ausdrücklich bestätigter Altimport ohne Wiederherstellung manuell entfernter Einträge, keine zeitliche Löschung und keine 500er-Verdrängung. Normale Funde und Referenzpreise verwenden sieben Tage. Feed mit Titelsuche vor der Seitengrenze, fünf Desktopspalten, kleineren Bildaktionen, Heute/Gestern und gemeinsamem Kategorie-Wähler mit Vinted-Datenquelle.

**Grenzen:** Die Browserprüfungen verwenden getrennte Desktop-/Tablet-Kontexte mit Testantworten. Kein echter Vinted-Abruf, kein unabhängiger zweiter Reviewer und keine Spiegelung externer Produktbilder. Ältere Hinweise auf damals offene Prüfungen bleiben in den historischen Archiven unverändert.
