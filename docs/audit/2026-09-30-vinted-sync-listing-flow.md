# Vinted: automatische Aktualisierung und vorbereitete Inserate

## Agentenrecherche 02.10.2026: Eigenbetrieb, Netzwerk und Vergleichsprojekte

Der Nutzer beauftragt ausdrücklich zusätzliche Webrecherche mit Agents.
Drei getrennte Untersuchungen behandeln Anbieter, Netzwerk-/Communityberichte
und GitHub-Bausteine. Alle drei sind abgeschlossen. Quellen wurden lesend
geprüft; keine Browser gestartet, Konten verändert oder Ressourcen bestellt.
Die folgende Bewertung ergänzt die Planprüfung und autorisiert keinen Rollout.

### Was die zusätzlichen Quellen klären

| Frage                                | Nachweis und Grenze                                                                                                                                                                                                                                                                                                                                          | Konsequenz für Flipbase                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ist GoLogin notwendig?               | [Revendor](https://revendor.app/guide/how-multi-account-works) nennt normale Browserprofile und GoLogin als mögliche, nicht verpflichtende Umgebungen. [Playwright](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context) unterstützt eigene dauerhafte Profile.                                                         | Technischer Eigenbetrieb ist begründet; Vinted-Eignung der konkreten Runtime noch prüfen.                                                                                     |
| Eine bezahlte IP je Konto?           | [Bleams Cloudhilfe](https://bleam.app/en/help/bleam-cloud) nennt bis zu zehn getrennte Sitzungen und zusätzliche dedizierte IPs als Option.                                                                                                                                                                                                                  | Keine allgemeine Pflicht-IP je Konto aus Konkurrenzangaben ableiten.                                                                                                          |
| Eine gemeinsame IP für alle Kunden?  | [Bleams Vergleichsartikel vom 29.09.2026](https://bleam.app/en/blog/business/bleam-vs-redrip-comparatif-2026) beschreibt einen eigenen Server mit eigener Ausgangs-IP je Kunde. Das ist Anbieter-Selbstauskunft, kein unabhängiger Test; die technische Hilfe präzisiert das Kunden-/IP-Verhältnis nicht.                                                    | Kunden-/Workspacezuordnung des Netzwerkzugangs als eigene Option vorsehen. Die Modelle je Konto, je Kunde und für alle Kunden unterscheiden; keines ohne Pilot festschreiben. |
| Reiner mobiler Erstlogin?            | [Bleams mobile Hilfe](https://bleam.app/en/help/application-mobile) beschreibt Bedienung und Aufträge; die Cloudhilfe den Login im Vinted-Fenster. Ein vollständiger Smartphone-Erstlogin mit Codeeingabe ist daraus nicht hinreichend nachgewiesen.                                                                                                         | Erstanmeldung, Code, Touch/Tastatur und Reconnect bleiben eigene Abnahme, vorhandenen Flipbase-Dialog zuerst verwenden.                                                       |
| Jede Aktualisierung sofort?          | [Bleams Inboxhilfe](https://bleam.app/en/help/messagerie-centralisee) beschreibt Warteschlangen, nächste Agentdurchläufe und verfallende Nachrichtenaufträge. [Revendor](https://revendor.app/guide/settings-and-sync) unterscheidet laufende Erkennung und periodischen Abgleich.                                                                           | Datenfrische, Auftragserfolg und Ablaufzeit ausdrücklich zeigen; Werbeaussagen über 24/7 nicht mit Echtzeit gleichsetzen.                                                     |
| Kann Export erneuten Login ersparen? | [GoLogin CSV](https://support.gologin.com/en/articles/14405649-export-import-overview) enthält Konfiguration, aber keine Cookies/Sitzungen. [Cookieexport](https://support.gologin.com/en/articles/14363118-cookies-import-and-export) existiert separat. [Playwright Auth](https://playwright.dev/docs/auth) unterscheidet Authzustand und Session Storage. | Profilübernahme ist kein zugesicherter Exportknopf. Kontrollierte Neuanmeldung als verlässlichen Produktweg vorsehen; Übernahme nur nach eigener Prüfung.                     |

Zusätzlicher Gegenbeleg gegen pauschale Cloudvergleiche: Closos
[ältere Cloudhilfe](https://app.closo.co/help/a/how-closo-cloud-keeps-marketplaces-connected)
beschreibt Serverbrowser und lokale Cookieübernahme. Die jüngere
[Tarifhilfe](https://app.closo.co/help/a/subscription-plans-explained) beschreibt
dagegen lokale Extensionausführung ohne getrennte Serversitzung; die
[September-Anleitung](https://app.closo.co/help/a/connect-a-marketplace)
fordert Anmeldung im Browser mit Extension. Closo daher nicht als
belastbaren aktuellen Nachweis für das gewünschte Cloudprodukt verwenden.

### GitHub: brauchbare Bausteine, kein nachgewiesener Gesamtstack

| Projekt                                                   | Geprüfter Nutzen                                                                                                                                            | Grenze und Empfehlung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Playwright](https://github.com/microsoft/playwright)     | Apache-2.0; dauerhafte Profile und Browsersteuerung, aktiv gepflegt.                                                                                        | Runtimegrundlage übernehmen. Kein verteiltes Leasing oder Vinted-Funktionsnachweis. Dasselbe Profil darf nicht parallel geöffnet werden.                                                                                                                                                                                                                                                                                                                                                                                                    |
| [noVNC](https://github.com/novnc/noVNC)                   | Browserclient für Fernanzeige/-eingabe, Touch und Tastatur; Kern MPL-2.0. [API](https://github.com/novnc/noVNC/blob/master/docs/API.md) erlaubt Einbettung. | Möglicher kleiner Zusatz für manuelle Anmeldung. Braucht VNC-/WebSocketdienst sowie eigene kurzlebige Konto-/Leaseautorisierung; kein fertiger Loginadapter.                                                                                                                                                                                                                                                                                                                                                                                |
| [Neko](https://github.com/m1k1o/neko)                     | Apache-2.0; Containerbrowser mit WebRTC und Eingabesteuerung.                                                                                               | Vergleichskandidat für Remoteansicht bei unzureichender bestehender Bedienung. Zusätzlicher Betriebsumfang; Mehrbenutzerrechte nicht mit Flipbase-Kontorechten gleichsetzen.                                                                                                                                                                                                                                                                                                                                                                |
| [Neko Rooms](https://github.com/m1k1o/neko-rooms)         | Apache-2.0; Containerstart/-stopp und [private Raumspeicher](https://github.com/m1k1o/neko-rooms/blob/master/docs/storage.md).                              | Architekturreferenz für einzelne Sitzungscontainer. Controllerbeispiel nutzt Docker-Socket; Browser erhalten weder Socket noch andere Kontoprofile.                                                                                                                                                                                                                                                                                                                                                                                         |
| [Browserless](https://github.com/browserless/browserless) | Gepflegte Browserinfrastruktur. README nennt SSPL beziehungsweise kommerzielle Lizenz und kommerzielle Lizenz für proprietären kommerziellen Einsatz.       | Kein ungeprüft kostenloser Ersatz für GoLogin. Anbieter-Lizenzbedingungen berücksichtigen, nicht als Standardabhängigkeit einplanen.                                                                                                                                                                                                                                                                                                                                                                                                        |
| [Vinted MCP](https://github.com/andrijdavid/vinted-mcp)   | AGPL-3.0-or-later; manueller Playwright-Login und persistentes Profilmuster.                                                                                | Nur Referenz. [Profilcode](https://github.com/andrijdavid/vinted-mcp/blob/main/src/vinted-core/auth/profile-auth.ts) verwendet `profile-<country>` statt Konto-/Workspaceprofil. Geprüfte [Live-Tests](https://github.com/andrijdavid/vinted-mcp/blob/main/tests/mcp-server.test.cjs) betreffen Leseflüsse, [Favoritentests](https://github.com/andrijdavid/vinted-mcp/blob/main/tests/favourite.test.cjs) Stubs. Kein hinreichender Mehrkonto-/2FA-/Restart-/Schreibnachweis gefunden; manipulierte Browsereigenschaften nicht übernehmen. |

Die [offizielle Playwright-Containerdokumentation](https://playwright.dev/docs/docker)
bezeichnet das Standardimage als Test-/Entwicklungsimage und erläutert
Benutzer-/Sandbox-/seccomp-Anforderungen für fremde Webseiten. Ein vorhandenes
Image allein erfüllt daher nicht die Mehrkundengrenzen des Plans. Zunächst
bestehende Flipbase-Browserbedienung prüfen; noVNC/Neko nur bei konkret
nachgewiesenem Bedarf ergänzen. Lizenznamen sind Projektangaben, keine
abschließende Prüfung des Lizenzumfangs unserer späteren Integration.

### Netzwerk und Community: konkrete Beobachtungen, begrenzte Aussage

- [Vinted-Notifications #109](https://github.com/Fuyucch1/Vinted-Notifications/issues/109),
  03.04.2026: Python-Katalogabfrage auf `vinted.co.uk` erhält 403 mit
  Cloudflare-Challenge. Konkreter Fehlerbericht, kein Playwright-Login,
  keine nachgewiesene Hetzner-IP und keine isolierte IP-Ursache.
- [Vinted-Notifications #104](https://github.com/Fuyucch1/Vinted-Notifications/issues/104),
  25.02.2026: AWS ohne Proxy wird als Frage gestellt. Kein Erfolgsnachweis.
- [vinted-api-wrapper #25](https://github.com/herissondev/vinted-api-wrapper/issues/25),
  09.02.2025: Entwickler berichtet wiederkehrende 403 nach wenigen Abfragen.
  Netzwerk und genaue Ursache unbekannt; keine allgemeine zulässige Rate ableiten.
- [Reddit: zwei Konten im selben Haushalt](https://www.reddit.com/r/vinted/comments/1dj4tk5/can_my_sister_have_an_account_with_the_same_ip_or/),
  Juni 2024: Ein Nutzer meldet problemlosen gemeinsamen Zugang, ein anderer
  eine Warnung nach Nutzung desselben WLANs. Die Prognose einer sicheren
  späteren Sperre ist dessen Vermutung. Keine Serverumgebung und kein
  kontrollierter Vergleich; weder Pflicht-IP noch sicherer gemeinsamer Zugang.
- [Reddit: Residential-Proxy](https://www.reddit.com/r/proxies/comments/1u9mfp3/proxy_vinted/),
  Juni 2026: OP berichtet Herausforderungen trotz Residential-Proxys.
  Auto-Buy-Anwendungsfall, keine lesende Verwaltung. Antwort eines
  Proxyanbietergründers ist Werbung, kein unabhängiger Benchmark.
- [Reddit: Chrome-Sitzung](https://www.reddit.com/r/vintedUK/comments/1mtjuzb/anyone_else_have_session_refresh_issues_on_google/),
  August/Dezember 2025: Nutzer melden temporär defekte Browserzustände;
  Cache/Inkognito beziehungsweise VPN ändern das Verhalten. Einzelberichte,
  keine reproduzierbare Diagnose und kein Cloudnachweis.

Die Recherche fand keinen belastbaren öffentlichen Langzeitnachweis für
gewöhnliches Chromium mit authentifizierter Vinted-Verwaltung auf Hetzner
ohne Proxy. Das ist eine Grenze der gefundenen Quellen, kein Beweis der
Unmöglichkeit. Öffentlicher Katalogzugriff, private Anmeldung und schreibende
Aktionen bleiben getrennte Prüffälle. Laut
[Cloudflare](https://developers.cloudflare.com/bots/concepts/bot-detection-engines/)
gehen mehrere Browser-, Sitzungs- und Verhaltenssignale in Erkennung ein;
die tatsächliche Vinted-Konfiguration ist nicht bekannt.

### Präzisierungen des Piloten

1. Runtimeanbieter, exklusives Kontoprofil und Netzwerkausgang unabhängig
   zuordnen. Expliziten Proxy bei Ausfall nicht still durch Direktzugang ersetzen.
2. Ein Konto zuerst: Login/Code, tatsächliche externe Identität, privater
   lesender Abgleich, bestätigter Stopp, Neustart und erneuter Zugriff.
   Beim kontrollierten Vergleich jeweils nur Browser oder Netzwerk ändern.
3. Zwei Konten mit getrennten Profilen und bestehenden Sperren prüfen.
   Netzwerk je Konto beziehungsweise je Workspace als separate Pilotoption;
   kein automatischer IP-Einkauf und keine ungeprüfte globale gemeinsame IP.
4. Mehrtägige Stabilität dokumentieren: Ausgangs-IP, Browserversion, Start-/
   Abgleich-/Stoppdauer, Traffic, Rückstau, Herausforderungen und erneute Logins.
   Ein erreichbarer Seitentitel genügt nicht. Anschließend die gewünschte
   Datenfrische für 30 Konten und reale iOS-/Android-Anmeldung abnehmen.
5. [Hetzner](https://docs.hetzner.com/cloud/billing/faq/) berechnet Cloudtraffic
   nach ausgehendem Volumen; eingehender/interner Traffic ist laut FAQ kostenlos.
   Enthaltenes Volumen hängt vom Paket ab. Ein extern bezahlter Proxy folgt
   weiterhin seinem eigenen Vertrag. Kostenentscheidung nach Messung treffen.

Ergebnis: Zielrichtung des Plans technisch gestützt, Netzwerk- und
Vinted-Abnahme weiterhin offen. Kein gefundener Gesamtstack ersetzt unsere
Kontoprüfung, dauerhafte Aufträge, Stoppbestätigung und sichere Migration.

## Prüfung 02.10.2026: Übergabeplan Version 2.0

Prüfgegenstand: die vollständig gelesene Nutzerdatei
`Flipbase_Vinted_Cloud_KI_Uebergabeplan_v2_2026-10-02.md`.
Codebasis: `3d0c42cd` mit den unveröffentlichten Änderungen auf
`juna/vinted-network-review`. Die Datei beschreibt eine neue Zielrichtung;
ihre eingebetteten Implementierungsaufträge werden durch den aktuellen
Auftrag „schau dir den Plan an“ nicht automatisch ausgeführt.

**Bewertung:** Eigener Chromium-/Playwright-Betrieb ist eine sinnvolle
Alternative für das gewünschte Cloudprodukt. Der Plan trennt Browserbetrieb,
Netzwerk, Kontenzustand und aktive Ressourcen nachvollziehbar. Die frühere
Empfehlung einer festen kostenpflichtigen IP je Konto ist keine nachgewiesene
Vinted-Anforderung. Ihre verpflichtende Beschaffung wird für diesen Vorschlag
nicht empfohlen. Auch günstiger Direktzugang ist erst nach dem Pilot tragfähig.

### Quellenprüfung

[Bleam](https://bleam.app/en/help/bleam-cloud) beschreibt bis zu zehn getrennte
Cloudsitzungen, einen französischen Zugang und optionale zusätzliche IPs.
Das belegt weder gewöhnliches Chromium noch Hetzner, Residential-Herkunft
oder die Zuverlässigkeit unserer eigenen Netzwerkkonfiguration.
[Revendor](https://revendor.app/guide/how-multi-account-works) nennt getrennte
Browserumgebungen und GoLogin als optionale Umgebung, nicht als Pflicht.
[Playwright](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
unterstützt dauerhafte Profilverzeichnisse, schließt aber gleichzeitige Starts
mit demselben Verzeichnis aus. Die
[Containerdokumentation](https://playwright.dev/docs/docker) verlangt besondere
Beachtung von Benutzer, Sandbox und seccomp bei fremden Webseiten.
Diese Kernquellen wurden erneut gelesen; die übrigen Anbieterbehauptungen
wurden in dieser Prüfung nicht einzeln erneut verifiziert.

### Abgleich mit echten Projektpfaden

| Bereich                       | Vorhandener Stand und notwendige Ergänzung                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser                       | `services/marketplace-worker/src/local-playwright-browser.ts` startet flüchtige Testkontexte, besitzt keine dauerhaften Kontoprofile und bietet keine produktiven Vinted-Aktionen. Nicht einfach den Modus `local` produktiv aktivieren.                                                                                      |
| Wiederverwendbare Aktionen    | `services/marketplace-worker/src/vinted-browser-actions.ts`, Login, Identitätsprüfung und Reader sind vorhanden. Ein Chromium-Adapter kann dieselben fachlichen Aktionen verwenden.                                                                                                                                           |
| Anbieterwahl                  | `services/marketplace-worker/src/main.ts` und `marketplace-browser-server-config.ts` wählen den Anbieter für den gesamten Worker. Das erlaubt die geplante kontoweise Migration noch nicht.                                                                                                                                   |
| Profilzuordnung               | `supabase/schemas/260_marketplace_live_browser_sessions.sql` enthält `marketplace_browser_profiles` mit einer Profilreferenz, aber keine Anbieterauswahl oder Hostbindung. Für parallelen Bestand und Pilot eine additive Zuordnung entwickeln; Kontoverbindungs-ID erhalten.                                                 |
| Sperren und Queue             | `260_marketplace_live_browser_sessions.sql`, `270_marketplace_operations.sql` und `310_marketplace_sync_scheduling.sql` sind vorhanden. Die Datenbank begrenzt heute alle Konten zusammen auf einen aktiven oder ungeklärt stoppenden Browser. Ein Worker-Pool erfordert mehr als eine neue Prozesszahl in der Konfiguration. |
| Verbindung und mobile Eingabe | `src/app/features/marketplaces/components/marketplace-connect/`, `marketplace-browser-test/` und die Worker-HTTP-API besitzen Anmelde-, Code- und Browserbedienwege. Auf neuer Runtime und echten Mobilgeräten erneut prüfen; kein kompletter Neubau als Ausgangsannahme.                                                     |
| Schreibaufträge               | Begrenzte Profil-/Inseratänderungen laufen derzeit direkt über Worker-HTTP-Routen mit Ergebnisprüfung. Daraus folgt keine allgemeine dauerhafte Schreibqueue für Nachrichten, Veröffentlichung oder jede spätere Aktion.                                                                                                      |
| Betrieb und Isolation         | Die vorbereitete GoLogin-Servervariante nutzt einen gemeinsamen Workercontainer mit Profilvolume. Der Plan verlangt stärkere Abschottung je aktiver Sitzung, kontrollierten Runner, gezielte Profilmounts und Netzwerkgrenzen. Das ist zusätzlicher Umfang.                                                                   |

### Empfehlungen zur Reihenfolge

1. P0 auf vorhandene Verträge abbilden. Für den Vergleich vorhandene
   Berechtigungen, Profilexklusivität und Stoppbestätigung bereits vor P2
   erhalten; diese Grundlagen nicht erst nach realem Login ergänzen.
2. P1 klein halten: ein aktiver Browser, zwei getrennte Testprofile,
   dauerhafter Zustand, Neustart, Startabbruch und bestätigter Stopp.
   Zugriff auf fremde Profile und interne Dienste ebenfalls begrenzen.
3. P2 ist die erste Entscheidung über Tragfähigkeit: Login, Codeeingabe,
   externe Identität, lesender Abgleich und Neustart. Browser und Netzwerk
   beim Vergleich getrennt variieren. Ein Wechsel beider Variablen zugleich
   erlaubt keine belastbare Zuordnung eines Fehlers. Reale iOS-/Android-
   Abnahme gesondert führen; hierfür kann Mitwirkung des Nutzers nötig sein.
4. Erst danach Providerzuordnung und Migration ausbauen, zwei echte Konten
   nachweisen und Verarbeitungslast messen. Die gewünschte Datenfrische bei
   30 Konten und drei beziehungsweise fünf Minuten ist ein eigenes
   Abnahmekriterium; ein einzelner erfolgreicher Abgleich genügt nicht.
5. Nachrichtenautomationen, Bulk-Aktionen und UI-Umbau getrennt freigeben.
   Sie gehören nicht zum notwendigen ersten Nachweis des GoLogin-Ersatzes.

Die vorbereiteten GoLogin-Serveränderungen wurden weder verworfen noch
veröffentlicht. Gemeinsame Aktionswege, Stopp-/Wiederherstellungsfälle und
Queueverbesserungen können nützlich bleiben; der neue Python-SDK und der
verpflichtende exklusive IP-Pool wären kein Bestandteil des Chromium-Zielwegs.
Keine GoLogin-Kündigung, kein Proxykauf und kein Wechsel bestehender Konten
folgt aus dieser Bewertung. Der zuvor geprüfte Serverstand wurde in dieser
Prüfung nicht erneut live abgefragt. Es gab keinen echten Chromium-/Vinted-
Pilot; technische und wirtschaftliche Eignung sind weiterhin offen.

Stand: 30. September 2026. Untersucht wurde `origin/master` bei `8dec8967`.
Dieses Dokument enthält Befunde und den nach unabhängigen Agentenreviews
überarbeiteten Ablaufvorschlag zur Abstimmung.
Die beschriebenen Funktionen sind noch nicht umgesetzt oder live geprüft.

## Ergebnis der Agentenprüfung

Der Nutzer hat die unabhängige Prüfung und zusätzliche Recherche ausdrücklich
beauftragt. Zwei vollständige Reviews behandeln Hintergrundabrufe und
Benachrichtigungen. Das Inserate-/Mehrkonten-Review lieferte konkrete Befunde,
wurde aber vor seinem Abschluss durch ein Nutzungslimit beendet. Die Befunde
zu Artikelbindung, Eindeutigkeit und Bildlöschung wurden anschließend am Code
nachgeprüft; Plattformquellen und Einführung wurden ergänzend untersucht.
Alle Prüfungen waren lesend. Es wurden keine Livekonten geöffnet.

Die Grundrichtung bleibt: gemeinsame Inserate, getrennte Entwürfe und
Übertragungen, serverseitige Abrufe und die vorhandene Glocke. **Der heutige
Vollimport darf dafür nicht einfach periodisch gestartet werden.** Zuerst
braucht es zuverlässige Bereichsstände, Hintergrundrechte und Auftragsrecovery.

| Befund der zweiten Prüfung                                                                                    | Entscheidung für den Ausbau                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SellerAiders fünf Minuten beziehen sich auf Favoriten/Like-Benachrichtigungen und anschließendes Senden.      | Diesen Wert nicht als Standard für eingehende Nachrichten verwenden.                              |
| Marktplatzrechte verlangen Plattformbetreiber und Workspaceadmin.                                             | Hintergrundfreigaben und Meldungen müssen genau diese bestehende Grenze erhalten.                 |
| Aufträge starten heute im Prozess; Neustart markiert alle wartenden/laufenden Aufträge global fehlgeschlagen. | Dauerhaften Dispatcher, Besitzerkennung und geordnete Recovery ergänzen.                          |
| Kontosperren begrenzen keine gleichzeitig gestarteten Browser anderer Konten.                                 | Globale Kapazitätsgrenze vor automatischen Starts; zunächst genau eine Workerinstanz.             |
| Quellen-Upserts, Löschabgleich und Sync-Marke sind getrennte Transaktionen.                                   | Quelle, Ereignis, Meldung und Fortschritt je erfolgreichem Bereich gemeinsam übernehmen.          |
| Erstmals gelesene Chats enthalten auch ältere Nachrichten.                                                    | Ausgangsbasis zusätzlich je Gespräch; Nachlieferung ist nicht automatisch ein neues Ereignis.     |
| Fehlender Bewertungsautor bedeutet heute automatisch, fehlende Sterne bedeuten fünf Sterne.                   | Unbekannte Herkunft und Sterne ehrlich als unbekannt behandeln.                                   |
| Gelesen und Löschen sind gemeinsame Zustände der Workspace-Glocke.                                            | Dieses Teamverhalten vorerst erhalten; alle Aktionen nach der tatsächlichen Sichtbarkeit filtern. |
| Ein Broadcast-Kanal kann nach Rechteentzug noch verbunden bleiben.                                            | Nur inhaltsfreie Nachladehinweise senden; Inhalte erneut über aktuelle Datenbankrechte laden.     |
| Der Inseratservice blendet Einträge ohne internen Artikel aus.                                                | Listenmodell und Ladeweg für externe Bestandsinserate erweitern, nicht nur die Datenbankprüfung.  |
| Ein zusätzliches Zielkonto in der Eindeutigkeit würde dasselbe Einzelstück mehrfach freigeben.                | Pro Einzelstück und Plattform höchstens ein aktives Zielkonto; Mengenmodell getrennt behandeln.   |
| Gespeicherte Entwurfänderungen können bisherige Bilddateien löschen.                                          | Übertragungsaufträge erhalten eigene unveränderliche Bildkopien.                                  |
| Worker-Browsertests und Marketplace-Preview sind nicht allgemein Teil der PR-Pflichtauswahl.                  | Die neuen Abnahmefälle ausdrücklich in die verbindliche CI-Auswahl aufnehmen.                     |

## Nutzerauftrag

- Vinted-Konten automatisch im Abstand von 5, 10 oder 15 Minuten aktualisieren.
- Neue Nachrichten, Preisangebote, Käufe und Bewertungen im bestehenden
  Flipbase-Benachrichtigungssystem anzeigen.
- Einen weiteren bestehenden Vinted-Account verbinden können.
- Inserate unter Verkauf → Inserate vorbereiten, mit früher Plattformauswahl
  zwischen eBay, Kleinanzeigen und Vinted und jeweils passenden Feldern.
- Neue Vinted-Inserate auf einem ausdrücklich ausgewählten Konto veröffentlichen.
- Bestehende Vinted-Inserate in Flipbase bearbeiten, dort speichern und erst
  danach ausdrücklich zu Vinted übertragen. Bearbeiten soll keinen Browserstart
  bei Vinted voraussetzen.

## Aktueller Code und konkrete Lücken

| Bereich          | Befund                                                                                                                                                                                                | Folge                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bearbeiten       | `vinted-listing-detail.component.ts`: `edit()` wartet auf `readListingEdit()`, `save()` ruft `saveListingEdit()` auf. Auch fehlender Beschreibungstext kann beim Öffnen einen Anbieterabruf auslösen. | Bearbeiten hängt vom Anbieterbrowser ab; Speichern und Übertragen sind dieselbe Aktion.                                                             |
| Inserate         | `listing.models.ts` und `230_listings.sql` erlauben nur `kleinanzeigen`; der Service setzt die Plattform beim Lesen fest.                                                                             | Plattformabhängige Modelle, Datenbankprüfungen und Veröffentlichungswege müssen gemeinsam erweitert werden.                                         |
| Herkunft         | Inserate verlangen einen Lagerartikel oder ein Katalogprodukt; Marktplatzimporte liegen getrennt in `marketplace_account_entries`.                                                                    | Externe Bestandsinserate brauchen einen zulässigen Bezug, ohne künstliche Lagerartikel anzulegen.                                                   |
| Mehrere Konten   | Kontoliste, Anlage-RPC und getrennte Kontodaten sind vorhanden. Die externe Kontoidentität ist eindeutig.                                                                                             | Die Basis existiert. Zwei echte Konten mit getrennten Browserprofilen wurden in dieser Sitzung nicht getestet.                                      |
| Hintergrundabruf | Der Sync wird per HTTP vom Nutzer gestartet. Der 30-Sekunden-Timer in `main.ts` bereinigt Sitzungen.                                                                                                  | Der vorhandene Timer synchronisiert keine Konten.                                                                                                   |
| Berechtigung     | `BrowserSessionScope` und die Enqueue-RPC verwenden ein aktuelles Nutzer-Zugangstoken.                                                                                                                | Ein dauerhafter Serverabruf benötigt einen eigenen, begrenzten und widerrufbaren Auftragszugriff. Nutzer-Tokens nicht für spätere Zyklen speichern. |
| Nachrichten      | Der Import überspringt Details ungelesener Gespräche, um den Vinted-Lesestatus nicht zu verändern. Sender werden als eingehend, ausgehend oder unbekannt unterschieden.                               | Eine geänderte Unterhaltung ist belegbar; einzelne neue Nachrichten und Angebote benötigen eine nachgewiesene Quelle ohne Lese-Nebenwirkung.        |
| Verkäufe         | Der Parser verlangt eine Bestellkennung, das eigene Verkäuferkonto und den Textstatus `Versendet`. Verkäufe stammen aus gelesenen Gesprächen.                                                         | Ein gerade erfolgter Kauf wird so noch nicht erkannt. Vollständige Bestellabdeckung fehlt.                                                          |
| Bewertungen      | Bewertungen haben externe Kennungen und liegen im Profil. Ein Abruffehler wird bisher als leere Liste behandelt.                                                                                      | Ereigniserkennung darf einen Fehler nicht als leeren Bestand oder neue Ausgangsbasis behandeln.                                                     |
| Meldungen        | `WebhookService` lädt die vorhandenen Meldungen; kein Broadcast-Abonnement für neue Vinted-Ereignisse. `WebPushService.sendNotification()` erzeugt selbst zusätzlich eine `system`-Meldung.           | Persistente Ereignisse, Aktualisierung des Feeds und Browseranzeige müssen getrennt werden, damit keine doppelten Meldungen entstehen.              |
| Sichtbarkeit     | Marktplatzdaten sind für Verwaltungsberechtigte; `app_notifications` ist für alle Workspace-Mitglieder lesbar.                                                                                        | Vinted-Meldungen brauchen dieselbe eingeschränkte Sichtbarkeit wie ihre Quelle, auch beim Broadcast.                                                |

Die bestehende Planung vom 28. September bleibt die Grundlage für
Auftragssteuerung, Cache-Versionen und eindeutige Schreibbestätigung:
[Zuverlässigkeit der Vinted-Verwaltung](../superpowers/plans/2026-09-28-vinted-reliability.md).
Historische offene Checklisten wurden mit dem heutigen Code abgeglichen;
sie sind kein Nachweis des heutigen Livebetriebs.

Zusätzlich geprüfte Grundlagen:

- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
  beschreibt private Channel-Policies und während der Verbindung gespeicherte
  Zugriffsentscheidungen. Deshalb werden Inhalte nach jedem Hinweis erneut
  berechtigungsgeprüft geladen.
- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
  ist der Aktualisierungskanal, nicht der dauerhafte Meldungsbestand.
- [Dotb Inseraterstellung](https://dotb.io/docs/dashboard-listing-creator)
  trennt kontogebundene Vorbereitung und Speichern im Dashboard von der
  späteren Übernahme durch die Erweiterung. Das bestätigt einen vergleichbaren
  Produktablauf, nicht unseren Browseradapter.
- [Dotb Bearbeitung](https://dotb.io/docs/bulk-edit)
  dokumentiert zusätzliche Kategorie-, Marken-, Farb-, Größen- und Materialfelder.
  Ihre tatsächlich zulässigen Werte müssen wir für unseren Anbieterweg prüfen.
- [eBay Inventory API](https://developer.ebay.com/api-docs/sell/inventory/overview.html)
  trennt Artikelbestand, Angebot und Veröffentlichung und benötigt unter anderem
  Verkäuferstandort, SKU und Verkäuferregeln. Damit braucht eBay eine eigene
  Integration; ein Vinted-Formular kann diese Anforderungen nicht übernehmen.
- [Supabase-Changelog](https://supabase.com/changelog)
  wurde ergänzend gelesen. Aus den aktuellen Hinweisen folgt kein Grund, für
  diesen Ausbau neue Infrastruktur oder ungefragte Hauptversionsupdates einzuführen.

## Ergänzung 02.10.2026: Cloudbetrieb ohne GB-Kontingent

**Status:** Umstellung vorbereitet, noch nicht implementiert oder veröffentlicht.
Geprüfter Code: `origin/master`, Commit `3d0c42cd`. Der Nutzer verlangt weiterhin
automatische Aktualisierung bei ausgeschaltetem Nutzer-PC. Eine lokale
Browsererweiterung ist deshalb kein Ersatz für das Flipbase-Feature.

### Problem

Die enthaltenen 2 GB sind keine tragfähige Grundlage für einen gemeinsamen
Cloudbetrieb mit vielen Kundenkonten. Die konkrete tägliche Datenmenge ist
unbekannt; sie muss die Ablehnung dieser gemeinsamen Kontingentarchitektur
nicht erst bestätigen. Browserprofile, Browserausführung und Netzwerkausgang
sind getrennte Leistungen und Kostenstellen.

### Was andere Anbieter tatsächlich dokumentieren

| Anbieter                                                                       | Nachgewiesener Betriebsweg                                                                                                                                                             | Grenze des Nachweises                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Revendor](https://revendor.app/fr/guide/comment-fonctionne-le-multi-compte)   | Ein aktives Vinted-Konto je Browserprofil; Erweiterung verbindet die Daten mit dem Dashboard. Offlinekonten synchronisieren nicht.                                                     | Kein Beleg für einen vollständig serverseitigen Betrieb oder eine Pflicht zu Residential-Proxys.                                                    |
| [Bleam, mehrere Konten](https://bleam.app/fr/help/connecter-plusieurs-comptes) | Ein getrenntes Chrome-/Brave-Profil je Konto, jeweils mit Erweiterung.                                                                                                                 | Cookie-/Sitzungstrennung belegt keine getrennte IP.                                                                                                 |
| [Bleam Cloud](https://bleam.app/en/help/bleam-cloud)                           | Eigener Cloudserver, bis zu zehn isolierte Sitzungen, auch bei ausgeschaltetem PC; 20 EUR monatlich zusätzlich zum Grundabo. Französischer IP-Ausgang; dedizierte IP als Zusatzoption. | Proxytyp, Verkehrslimit, Serverkosten und interne Technik sind nicht offengelegt. Kein Beleg für garantierte Vinted-Kompatibilität unseres Servers. |

[Revendor: Synchronisierung](https://revendor.app/guide/settings-and-sync)
beschreibt sofortige Nachrichtenübertragung und einen Abgleich weiterer Bereiche
alle 15 Minuten. Nur Änderungen gehen zum Dashboard. Das belegt eine reduzierte
Übertragung zum Dashboard, nicht den Umfang der vorherigen Vinted-Abfragen und
nicht die Existenz eines für Flipbase verwendbaren Ereignisfeeds.

Eine Pflicht zu rotierenden Residential-Proxys pro Konto ist aus diesen
Vinted-Produktbeschreibungen nicht ableitbar. Ebenso wenig ist belegt, dass
beliebige Server-IPs oder ein gemeinsamer IP-Ausgang bei uns zuverlässig
funktionieren. Aussagen über MAC-Adressen und garantierte Sperrfreiheit aus
Herstellerblogs werden nicht als technische Nachweise übernommen.

### Feste Kosten statt GB-Abrechnung

- [GoLogin Dedicated IP](https://support.gologin.com/en/articles/15030065-faq-gologin-proxies)
  ist eine feste ISP-IP, im Rechenzentrum betrieben, ohne GB-Kontingent.
  [GoLogin nennt 5 USD monatlich je IP](https://support.gologin.com/en/articles/15030060-purchasing-gologin-proxies).
- [IPRoyal Static Residential / ISP](https://iproyal.com/pricing/static-residential-proxies/)
  nennt dedizierte IPs und unbegrenzten Verkehr ab 2,70 USD je IP für 30 Tage.
  [Deutschland wird angeboten](https://iproyal.com/static-residential-proxies/).
  Einstiegspreis, verfügbare deutsche IPs und Vertragsbedingungen müssen vor
  Bestellung im tatsächlichen Angebot bestätigt werden. Kein eigener Vinted-Test.
- [Webshare Bandbreitenregeln](https://help.webshare.io/en/articles/8370524-how-does-the-bandwidth-limit-work)
  nennen für dedizierte statische Residential-Proxys unbegrenzten Verkehr erst ab
  50 IPs. Ein günstiger Preis pro IP bedeutet daher nicht automatisch Flatrate
  oder Exklusivität bei unserem Kontoumfang.

Bei zunächst einer festen IP je Vinted-Verbindung sind 30 Verbindungen genau
30 reservierte IPs: ab 81 USD je 30 Tage bei dem genannten IPRoyal-Einstiegspreis
oder 150 USD monatlich beim genannten GoLogin-Preis. Das ist ausschließlich die
Proxykomponente, ohne Steuern, Währungsumrechnung, Browserabo, Server, Speicher
und Betrieb. Die Zuordnung je Verbindung ist eine konservative Pilotentscheidung,
keine nachgewiesene Vinted-Pflicht. Sie bietet keinen Schutzverspruch gegen Sperren.

### Browserausführung ebenfalls umstellen

[GoLogin-Tarife](https://support.gologin.com/en/articles/14617029-pricing)
nennen für Professional einen gleichzeitigen Cloudstart und 100 Stunden.
Die tatsächlichen Vertragswerte sind nicht eingesehen. Ein Proxywechsel allein
beseitigt weder Profilplatz- noch Cloudlaufzeit- oder Parallelitätsgrenzen.

Der [offizielle GoLogin-SDK](https://github.com/gologinapp/gologin)
kann ein bestehendes Profil herunterladen, Orbita selbst starten, den
Automatisierungszugang liefern und beim Beenden das Profil speichern.
Das [offizielle Docker-Beispiel](https://github.com/gologinapp/gologin/blob/master/docker-compose.yml)
belegt einen serverseitigen Ausführungsweg. Es ist kein fertiges Produktionsimage
und wird mit seinem alten Node-18-Unterbau nicht unverändert übernommen.
Selbst ausgeführte Browser sind von gekauften GoLogin-Cloudstunden zu unterscheiden;
Profilplätze, API-Zugang und SDK-/Orbita-Vertragsbedingungen bleiben zu prüfen.

### Vorschlag und Alternativen

**Vorschlag für den ersten Umbau:** Vorhandene GoLogin-Profile zunächst behalten,
Orbita über den offiziellen SDK im Flipbase-Serverdienst ausführen und einen
festen externen ISP-Proxy je Pilotverbindung zuordnen. Damit bleiben Sitzung und
Browseridentität beim Wechsel der Ausführung möglichst erhalten. Das ist ein
zu prüfender Migrationsweg, keine bereits verifizierte Vinted-Anbindung.

Nur Dedicated IP plus GoLogin Cloud wäre ein begrenzter Zwischenschritt: Das
GB-Problem entfällt, die übrigen Cloudgrenzen bleiben. GoLogin vollständig durch
eigene persistente Chromium-Profile zu ersetzen wäre ein eigener größerer
Umstieg mit neuer Browseridentität und möglicherweise erneuter Anmeldung.
Dieser zweite Umbau wird nicht gleichzeitig vorgenommen.

Die offizielle [Vinted Pro Integrations API](https://pro-docs.svc.vinted.com/)
ist nur für freigeschaltete Pro-Unternehmen verfügbar. Artikel, Bestellungen und
Webhooks sind dokumentiert; eine vollständige Privatkonto-Inbox ist dadurch
nicht belegt. Sie ist daher kein kurzfristiger Ersatz für die bestehenden Konten.

### Konkrete Codeänderungen und Abnahme

1. `services/marketplace-worker/src/gologin-profile-network.ts`: Die feste
   Bindung neuer Profile an `residentTrafficData` und den GoLogin-Zuordnungsweg
   durch eine ausdrücklich provisionierte ISP-Zuordnung ersetzen. Keine
   automatischen Käufe, keine Rotation und kein Rückfall auf GB-Proxys.
2. `gologin-cloud-browser.ts`, `main.ts` und
   `marketplace-browser-server-config.ts`: Einen Produktionsadapter für
   serverseitiges Orbita ergänzen. Den bestehenden Testadapter
   `local-playwright-browser.ts` nicht als Produktionsersatz freischalten.
3. `deploy/` und vorhandenen Worker-Container: Browserabhängigkeiten und
   kontrollierte Versionen, dauerhaften Profilspeicher, Prozesszuordnung und
   Ressourcenbegrenzung einrichten. Keine offenen CDP-Ports. Das ist eine
   Serveränderung, kein Frontend-Schalter.
4. Bestehende Kontosperren, Berechtigungsprüfung, interaktive Anmeldung,
   geordnete Stopps und Wiederanlauf weiterverwenden. Erst GoLogin Cloud
   bestätigt stoppen, dann dieselbe Pilotverbindung exklusiv auf dem Server
   starten. Kein gleichzeitiger Zugriff aus zwei Browsern auf ein Konto.
5. Ein ausdrücklich freigegebenes Pilotkonto prüfen: Kontoidentität,
   Sitzungserhalt über mehrere Start-/Stoppzyklen und Serverneustart,
   vollständige angeforderte Kontobereiche, keine Fremdkontodaten und keine
   unbeabsichtigten Schreibaktionen. Bei 401/403/Challenge/429 anhalten bzw.
   die bestehende Wartefrist respektieren. Auf die übrigen Konten erst nach
   erfolgreicher Pilotabnahme umstellen; bestehenden Rückweg bereithalten.
6. CPU, RAM, Start-/Abrufzeit, Anfragen und Übertragungsmenge je Lauf messen.
   Mit künstlichen Konten die Queue für 30 Verbindungen bei ausgeschaltetem
   Nutzer-PC prüfen. Keine Lastversuche mit 30 echten Vinted-Konten.
7. Schnellen Änderungsabruf und vollständigen Bestandsabgleich trennen. Heute
   lädt `readVintedAccountImport` auch Artikel-, Inbox- und Bewertungsseiten;
   unveränderte gelesene Gesprächsdetails werden bereits teilweise übersprungen.
   Neue kürzere Abfragen benötigen einen eigenen nachgewiesenen Datenweg.

Der frisch abgeglichene Code erlaubt bereits 3, 5, 10, 15, 30 und 60 Minuten;
15 Minuten ist die Vorgabe. Die frühere Aussage im Chat, nur 15 Minuten seien
fest möglich, beruhte auf einem älteren lokalen Remote-Stand. Kein produktiver
Kontoplan wurde in dieser Recherche gelesen oder verändert.

**Umsetzung am 02.10.2026:** Der Nutzer hat die Backend-Grenze ausdrücklich
aufgehoben. Der neue Serveradapter verwendet den offiziellen Python-SDK
`2026.6.24` mit fest versionierten Laufzeitabhängigkeiten, weil das geprüfte
Node-SDK kritische Abhängigkeitsmeldungen enthielt. Die Python-Laufzeitprüfung
meldet keine bekannten Sicherheitslücken. Feste Proxyzuordnung, echte
Ausgangs-IP-Prüfung vor dem Browserstart, persistente Profilkopien, bestätigter
Upload und Wiederherstellung sind implementiert. Der Wartungsbefehl sperrt die
Runtime vor Änderungen an bestehenden Profilen. Der Servermodus leert die
Warteschlange ohne Timer-Lücken; die globale Grenze von einem Browser bleibt.

**Noch offen:** Beschaffung und Zugangsdaten der deutschen Pilot-Proxys,
SDK-/Orbita-Livekompatibilität, echte Anmeldung/Neustart, Sitzungsmigration
und Veröffentlichung. Der Server wurde ausschließlich gelesen: drei
GoLogin-Profile mit GB-Proxy-Modus `geolocation`, keine feste Proxydatei und
ein gesunder Cloudworker. Etwa 7,6 GiB RAM und vier CPU-Kerne sind vorhanden;
das neue 2-GiB-Containerbudget ist ein Pilotbudget, kein Lastnachweis. Der
Ein kurzlebiges Testprofil bestätigte die Proxy-API live: PATCH 204,
`proxyEnabled: true` und korrekte Zugangsfelder. Das Testprofil wurde bestätigt
gelöscht; kein Browser und kein Vinted-Konto wurden gestartet. Der
konkrete Wechsel steht im bestehenden Worker-Rollout. Der früher abgelegte
Backend-Auftrag dokumentiert inzwischen die Freigabe und Umsetzung.

## Recherche: Intervalle und Integrationsweg

Geprüfte Primärquellen, jeweils am 30. September 2026:

- [Revendor: Settings and sync](https://revendor.app/guide/settings-and-sync)
  beschreibt kontinuierliche Nachrichtenerkennung und einen Abgleich anderer
  Bereiche alle 15 Minuten. Die Erweiterung benötigt einen geöffneten Browser
  mit Vinted-Seite. Diese Herstellerbeschreibung belegt weder unseren
  serverseitigen Abruf noch dessen Kosten oder Laufzeit. Geänderte Daten werden
  zum Dashboard übertragen; daraus folgt kein bestimmter Abrufumfang bei Vinted.
- [SellerAider: Features](https://guide.selleraider.com/grow/vinted/features)
  nennt alle 5 Minuten ausdrücklich für Favoriten-/Like-Benachrichtigungen,
  woraufhin Nachrichten oder Angebote gesendet werden. **Kein Nachweis für
  eingehende Nachrichten, eingehende Preisangebote oder einen Kontoimport.**
- [Vinted Pro Integrations](https://pro-docs.svc.vinted.com/)
  bietet Artikelverwaltung, Bestellungen und Webhooks, aber nur für ausdrücklich
  freigeschaltete Pro-Unternehmen. Die dokumentierten Ereignisse belegen keine
  vollständige Privatkonto-Inbox einschließlich Nachrichten und Bewertungen.
- [Deutsche Vinted-AGB](https://www.vinted.de/terms-and-conditions)
  zeigt bereits die neue Fassung, gültig ab **5. Oktober 2026**. Diese Fassung
  beschränkt zusätzliche Accounts und externe Automatisierung ohne
  Anbietererlaubnis; sie ist am Untersuchungstag noch nicht die gültige Fassung.
  Die bisher gültige deutsche Fassung wurde hier nicht gesondert nachgewiesen.
  Das Vorhandensein anderer Tools belegt keine Freigabe für Flipbase.

Es wurde kein allgemeiner Intervallstandard und kein garantiert zulässiges
Intervall für unseren Abruf nachgewiesen. **Vorschlag: 15 Minuten als Vorgabe,
pro Konto 5, 10 oder 15 Minuten als Zielauswahl sowie pausierbar.** Das ist eine
Produktentscheidung, keine Zusicherung von Vinted.
Bei durchgehendem Betrieb entstehen rechnerisch 96, 144 oder 288 Zyklen
pro Tag und Konto; jeder Zyklus enthält mehrere Anfragen. Laufzeit,
Browserkapazität und Kosten müssen am eigenen Verfahren gemessen werden.

Die kürzeren Intervalle werden erst mit einem nachgewiesenen geeigneten
Abrufumfang und ausreichender Kapazität freigegeben. Im Pilot gilt 15 Minuten.
Ein schneller Lauf soll aktuelle Änderungen prüfen; ergänzende vollständige
Bestandsabgleiche bleiben getrennt. Die passende Änderungsquelle ist noch zu
belegen; die Auswahl darf keine vollständige Historie alle fünf Minuten auslösen.
[GoLogin-Tarife](https://support.gologin.com/en/articles/14617029-pricing)
unterscheiden Profilplätze, parallele Cloudstarts, Stunden und API-Kontingente.
Der tatsächliche Flipbase-Vertrag wurde hier nicht abgefragt.

## Vorgeschlagener Ablauf

### Automatische Aktualisierung und Meldungen

Der vorhandene Serverdienst übernimmt fällige Kontoaufträge auch bei
geschlossener Flipbase-Seite. Zeitplan und letzter erfolgreicher Stand werden
dauerhaft gespeichert. Manuelle und automatische Abrufe verwenden dieselbe
Kontosperre. Ein weiterer Klick oder ein zweiter Tab erzeugt keinen zweiten
laufenden Auftrag. Verpasste Zyklen werden nach Neustart zusammengefasst.

Ein berechtigter Plattformbetreiber mit Workspace-Adminrolle aktiviert die
automatische Aktualisierung für ein Konto. Ein normaler Workspaceadmin ohne
Betreiberrolle erhält dadurch keine neuen Marktplatzrechte.
Vor jedem Lauf prüft der Server erneut Workspace, Kontoverbindung und die
fortbestehende Berechtigung des Aktivierenden. Pausierung, Löschung,
Rechteentzug oder nötige Neuanmeldung beenden den Zugriff. Der Serverzugriff
ersetzt keine Nutzeranmeldung bei interaktiven Aktionen und ist ausschließlich
für die freigegebenen Leseaufträge verwendbar.

Der Zeitplan enthält Verbindung, Aktivierenden, Intervall, nächste Fälligkeit,
Freigabeversion, letzten Versuch, letzten Erfolg und gegebenenfalls Wartefrist
und Pausengrund. Nutzer aktivieren/widerrufen über ihre bestehende Anmeldung.
Eine eigene, nur für den Server zugängliche Claim-Funktion prüft die Freigabe
anhand aktueller Datenbankzeilen: Betreiberrolle, Workspace-Adminrolle, aktiver
Workspace, verbundenes Vinted-Konto und Freigabeversion. Sie erstellt ein auf
`sync_read` begrenztes Auftragsscope. Kein Nutzer-JWT wird gespeichert oder
nachgebildet; die Freigabe autorisiert keine Login- oder Schreibaktion.

Der Dispatcher liest dauerhaft wartende Aufträge aus der Datenbank. Claim,
Besitzerkennung, Lebenszeichen und Sperrversion verhindern Doppelstart und
Übernahme durch einen alten Prozess. Alle Browseraktionen verwenden dieselbe
Kontosperre und Kapazitätsreservierung. Wartende Benutzeraktionen erhalten
Vorrang. Bei Laufzeiten über dem Intervall wird kein zweiter Kontolauf gestartet.

Zunächst begrenzte Browserkapazität und serielle Aktionen je Konto;
Bedienaktionen erhalten Vorrang vor wartenden Hintergrundläufen.
Anbieterablehnung und Ratenbegrenzung führen zu Pause beziehungsweise
größerem Abstand. Fehler je Datenbereich behalten ihren letzten gültigen
Stand. Eine Fehlermeldung wird nicht in jedem Zyklus erneut versendet.

Die heute feste Zehn-Minuten-Browsersperre erhält eine geprüfte Erneuerung
während eines aktiven Auftrags sowie eine absolute Laufzeitgrenze. Diese
Grenze wird anhand gemessener Start-/Abruf-/Stoppzeiten festgelegt. Ein Ablauf
allein gibt das Profil nicht frei: Ein möglicherweise laufender Browser muss
zuerst nachweislich beendet sein. Der Wiederanlauf behandelt wartende,
laufende und bereits übermittelte Schreibaufträge unterschiedlich; kein
globales Fehlermarkieren ohne Rücksicht auf den Auftragstyp.

Zunächst bleibt genau eine Workerinstanz die Betriebsgrenze. Vor einer
weiteren Instanz muss die bisher globale Browserrecovery besitzergebunden
arbeiten und fremde gültige Lebenszeichen respektieren. Ein zusätzlicher
Wartungsprozess darf die heutige Recovery nicht nebenläufig ausführen.

Fehler werden dauerhaft unterscheidbar: 401 → Anmeldung erforderlich;
403/zusätzliche Prüfung → eigener Pausengrund ohne blinden Neuversuch;
429 → Anbieterwartefrist, soweit vorhanden; Netz-/5xx-Fehler → begrenzte
Wiederholung mit wachsendem Abstand. Ein unklarer Browserstopp sperrt weitere
Starts dieses Profils. Lesen darf nach bestätigter Bereinigung erneut geplant
werden; möglicherweise bereits übermittelte Schreibaktionen nicht.

Ereignisse werden bei der erfolgreichen atomaren Übernahme der jeweiligen
Quelle serverseitig erkannt und eindeutig gespeichert. Ausgangsbestand und
Ereignisfortschritt sind je Konto und Datenbereich getrennt. Beim ersten
erfolgreichen Abgleich wird eine Ausgangsbasis erfasst, damit die gesamte
Historie nicht als neu gemeldet wird. Wiederholte Imports und gelöschte
Benachrichtigungen erzeugen alte Ereignisse nicht erneut. **Quelle, Ereignis,
In-App-Meldung und Fortschritt** werden in derselben Datenbanktransaktion
übernommen. Nur Ereignis und Meldung zusammenzuschreiben reicht nicht:
Ein vorheriger Quellen-Upsert könnte nach einem Absturz das neue Ereignis
beim nächsten Vergleich unsichtbar machen.

Jeder gelesene Bereich erhält ein Ergebnis mit Zustand, Quellenzeitpunkt,
Beobachtungszeitpunkt und Vollständigkeit. Große Ergebnisse werden zunächst
auftragsgebunden zwischengespeichert und erst nach vollständigem Lesen
übernommen. Inserate, Profil, Gesprächsliste, Gesprächsdetails, Bestellungen
und Bewertungen haben getrennte Ausgangsstände. Gespräch plus Nachrichten
werden gemeinsam übernommen; abgeleitete Bestellungen behalten ihre Herkunft.
Aktuelle Betreiber-/Adminrolle, aktiver Workspace, Kontostatus sowie Freigabe-
und Sperrversion werden vor weiteren Anbieterabrufen und erneut in derselben
Transaktion wie die Bereichsübernahme geprüft. Ein erfolgreicher früherer
Claim berechtigt nicht zur Übernahme nach zwischenzeitlichem Rechteentzug.
Fehlende Seiten bedeuten weder leeren Bestand noch verschwundene Einträge.
Die bisherigen Grenzen von 20 Listenseiten und 500 Cachegesprächen müssen
als begrenzter Umfang erkennbar bleiben und erhalten eigene Regressionstests.

Ein dauerhaftes Ereignisregister verwendet die Eindeutigkeit aus Workspace,
Konto, Ereignisart und stabiler Quellenkennung. `observed_at`, fehlende
Quellenzeitpunkte und ein geändertes komplettes Antwortobjekt sind keine
neuen Ereigniskennungen. Bei Angeboten werden Objekt und fachlicher
Zustandswechsel getrennt. Nachträglich erstmals gelesene Chats erhalten eine
eigene historische Ausgangsbasis. Ein Quellenfortschritt läuft auch bei
ausgeschalteten Meldungen weiter; erneutes Aktivieren meldet keine alte Historie.

Vor der Ereignisimplementierung braucht jede Quelle belegte Beispiele für
Kennung, Kontobezug, Richtung/Zustand, Datum, Vollständigkeit und Nebenwirkungen.
Ungelesene Nachricht, eingehendes Angebot, bezahlte Bestellung, Abbruch sowie
manuelle und automatische Bewertung müssen getrennt nachgewiesen sein.
Öffentliche Herstellerbeschreibungen ersetzen diese eigenen Quellenbelege nicht.
Ein fehlender Bewertungsautor oder fehlende Sterne werden als unbekannt
gespeichert, nicht als automatische Fünf-Sterne-Bewertung erfunden.

| Ereignis                 | Erforderlicher Nachweis                                                                                                                                                            | Anzeige und Ziel                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Neue Nachricht           | Neue eingehende Nachrichtenkennung; bei nur belegter Gesprächsänderung entsprechend zurückhaltende Meldung. Eigene und unbekannte Absender nicht als erhaltene Nachricht ausgeben. | Konto und Gespräch; keine Veränderung des Lesestatus durch den Hintergrundabruf.                       |
| Neues Preisangebot       | Eigenes bestätigtes Angebotsereignis und dessen Zustand, nicht Textsuche nach „Angebot“.                                                                                           | Konto und zugehöriger Vorgang; keine zusätzliche allgemeine Meldung für dasselbe Ereignis.             |
| Artikel gekauft          | Belegte neue Bestellung mit eigenem Verkäuferkonto und passendem Kauf-/Zahlungszustand. Nicht auf „Versendet“ warten.                                                              | Konto und Bestellung; kein automatischer bestätigter Flipbase-Verkauf ohne eigene fachliche Zuordnung. |
| Neue Bewertung           | Neue Bewertungskennung nach erfolgreichem Bewertungsabruf.                                                                                                                         | Konto und Bewertungen; automatische Bewertungen erkennbar unterscheiden.                               |
| Konto benötigt Anmeldung | Zustandswechsel mit erforderlicher Nutzeraktion.                                                                                                                                   | Konto und Anmeldeaktion; einmalige Meldung statt Meldung pro Zyklus.                                   |

Alle Meldungen landen in der bestehenden Glocke mit Kontoangabe und direktem
Ziel. Eigene Einstellungen für Nachrichten, Angebote, Käufe und Bewertungen
werden im vorhandenen Benachrichtigungsbereich ergänzt. Ein privater,
berechtigungsgeprüfter Broadcast aktualisiert den Feed bei geöffneter App;
nach Wiederverbindung wird der persistente Stand nachgeladen. Browseranzeigen
dürfen die bestehende Meldung anzeigen, ohne eine zweite zu schreiben.

Der private Kanal `workspace:<id>:marketplace_notifications` sendet nur einen
inhaltsfreien Hinweis `notifications_changed`. Kein Nachrichtentext,
Angebotspreis, Käufername oder Kontoname geht über den Broadcast. Ein bereits
verbundener Nutzer kann nach Rechteentzug noch Hinweise empfangen; der folgende
RLS-geschützte Datenabruf muss die Inhalte sofort verweigern. Nutzer erhalten
kein Senderecht für diesen Kanal. Alle vorhandenen permissiven Kanalpolicies
werden auf unbeabsichtigte zusätzliche Berechtigungen geprüft.

Vinted-Meldungen erhalten serverseitige Quellenzuordnung und eigene Typen.
`system` bleibt für Betreiberankündigungen reserviert. Lesen, Aktualisieren,
Löschen und Bulk-Aktionen beachten die eingeschränkte Audience; normale
Client-Schreibrechte dürfen weder Vinted-Meldungen fälschen noch deren Quelle
oder Sichtbarkeit öffnen. Bestehende breite permissive Policies müssen dafür
angepasst werden; eine zusätzliche engere Policy kann ihre Berechtigung nicht
einschränken. Browseranzeige verwendet die bestehende Meldungs-ID
und deren internes, konto-/workspacegebundenes Ziel. Späte Antworten nach
Workspacewechsel werden verworfen; Offline-Nachladung erzeugt keine laute
Serie historischer Browsermeldungen.

Die vorhandene Team-Glocke bleibt vorerst gemeinsam: Gelesenmarkierung und
Löschen gelten für die sichtbaren Team-Meldungen. Persönliche Lesestände
werden nicht beiläufig eingeführt. Der Ungelesen-Zähler wird über alle
berechtigt sichtbaren Meldungen ermittelt, nicht nur aus den ersten 50
geladenen Zeilen; ältere Meldungen sind paginierbar.

Die aktuelle Browserbenachrichtigung ist kein nachgewiesener Push-Dienst für
geschlossene Browser. In-App-Meldungen bleiben bei geschlossener Seite gespeichert.
Echter Web-Push und externe Kanäle bei geschlossenem Browser benötigen eine
gesonderte serverseitige Zustellung; sie sind nicht mit dem ersten Schritt versprochen.

### Verkauf → Inserate als gemeinsamer Arbeitsbereich

**Empfehlung:** Den bestehenden Inseratbereich erweitern. Gemeinsame
Artikelinformationen und Bilder werden wiederverwendet; Plattformauswahl
bestimmt Formular, Pflichtfelder und Veröffentlichung.

- Kleinanzeigen behält seinen bestehenden Ablauf einschließlich Erweiterung.
- Vinted erhält Kategorie, Marke, passende Größe, Zustand, Farben, Material,
  Paketgröße und weitere tatsächlich geforderte Kategorieattribute. Werte
  verwenden Anbieterkennungen; interne Freitexte sind nur Vorschläge.
  Vinted-Pro-Metadaten dienen als Vergleich, nicht als ungeprüfter Vertrag
  des Privatkonto-Browserwegs. Land, Währung, Kategorie und Versionsstand
  gehören zur Optionsquelle; fehlende oder ungültige Auswahlwerte werden
  vor der Übertragung erneut geprüft. Die heutige globale Kategorie-/Markensuche
  liefert keinen belegten vollständigen Veröffentlichungsvertrag.
- eBay erhält einen eigenen Vertrag für Kategorie, Artikelmerkmale und
  Angebotsformat. Eine auswählbare Plattform darf keine funktionierende
  Veröffentlichung vortäuschen. Der eBay-Veröffentlichungsweg ist gesondert
  zu untersuchen und auszuliefern.

Gemeinsame Inhalte und plattformspezifische Attribute bleiben getrennt typisiert.
Die heutigen Kleinanzeigen-Limits dürfen nicht ungeprüft für Vinted oder
eBay gelten. Vorbefüllung verwendet Verkaufswerte, keine Einkaufskosten.
Bei einem Plattformwechsel bleiben gemeinsame Inhalte erhalten; unpassende
Attribute werden nicht still übertragen.

Ein interner Artikel kann vorbereitete Inserate für mehrere Plattformen haben.
Die Zielkonto-Zuordnung wird bei Vinted spätestens vor Veröffentlichung
ausdrücklich bestätigt. Bestehende externe Inserate sind bereits an ihr
Herkunftskonto gebunden. Das Umschalten des ausgewählten Kontos in der
Navigation darf dieses Veröffentlichungsziel nicht ändern.

Für ein **Einzelstück** ist je Plattform höchstens ein aktives Zielkonto
zulässig. Ein Kontowechsel braucht die belegte Beendigung des bisherigen
Inserats. Mehrere Plattformen bleiben möglich; automatisches Auslisten nach
einem Verkauf und plattformübergreifender Überverkaufsschutz sind damit noch
nicht nachgewiesen. Katalogmengen werden später ausdrücklich Zielkonten
zugewiesen; deren Summe darf die verfügbare Menge nicht überschreiten.
Laufende und unklare Veröffentlichungen belegen ihre Zuordnung weiter.
Ein pauschales zusätzliches Konto in einem Unique-Index würde diese Regel
nicht ausreichend absichern.

Das Datenmodell trennt drei Verantwortungen: bearbeitbarer Inseratentwurf,
zugeordnetes Anbieterinserat mit letztem bestätigtem Stand und unveränderlicher
Übertragungsauftrag. Der interne Artikelbezug wird für importierte externe
Inserate optional; der Listeneintrag kann seine Anzeige aus dem Anbieterstand
beziehen. Bestehende Kleinanzeigen-Online-Markierungen bleiben historisch
erhalten und werden nicht nachträglich als Anbieterbestätigung ausgegeben.
Ein Plattformwechsel erzeugt keine Umdeutung eines schon veröffentlichten
Anbieterinserats. Entwurfversion und Anbieter-Ausgangsversion sind getrennt.

### Bestehende Inserate bearbeiten

1. Importierte Bestandsinserate behalten Konto, externe Artikelkennung und
   unveränderten letzten bestätigten Vinted-Stand.
2. „Bearbeiten“ öffnet sofort die gespeicherten Felder. Fehlende Werte werden
   als noch nicht geladen gekennzeichnet; fehlende Beschreibung ist kein
   belegter leerer Text und darf nicht automatisch hochgeladen werden.
3. Änderungen bilden einen getrennten Entwurf. „Entwurf speichern“ speichert
   in Flipbase und bleibt nach Neuladen erhalten. Ein neuer Import verändert
   laufende Eingaben oder gespeicherte Entwürfe nicht.
4. „Bei Vinted aktualisieren“ erstellt einen Auftrag für genau dieses Konto
   und Inserat. Server und Oberfläche prüfen dieselben erforderlichen Felder.
5. Vor dem Schreiben wird die gespeicherte Ausgangsversion mit dem aktuellen
   Anbieterstand abgeglichen. Fremde Änderungen führen zu einer verständlichen
   Konfliktanzeige statt stiller Überschreibung.
6. Erst bestätigte Speicherung aktualisiert den Vinted-Stand in Flipbase.
   Wartend, läuft, bestätigt, abgelehnt und Ausgang unklar sind sichtbar getrennt.
   Ein unklarer Ausgang wird lesend geprüft, nicht automatisch erneut geschrieben.

Extern importierte Inserate dürfen ohne künstlichen Lagerartikel bearbeitet
werden. Eine freiwillige spätere Artikelzuordnung ist möglich. Dafür muss die
heutige Zielregel der Inseratdatenbank ausdrücklich erweitert werden.

### Neue Inserate veröffentlichen und weiteres Konto

Bei einem neuen Vinted-Inserat folgt auf „Entwurf speichern“ die Aktion
„Bei Vinted veröffentlichen“ mit bestätigtem Zielkonto. Der Auftrag übernimmt
eine unveränderliche Kopie der gespeicherten Entwurfsversion und Fotoreihenfolge.

Fotos werden dafür als eigene unveränderliche Dateien kopiert, mit Reihenfolge,
Dateityp und Integritätskennung. Nur die bisherigen Storage-Pfade zu speichern
reicht nicht: `ListingImagesService.save()` entfernt alte Dateien bei
Entwurfänderungen. Laufende und unklare Aufträge behalten ihre Kopien mit
serverseitigem Löschschutz. Auch Entfernen eines internen Artikels darf einen
laufenden Auftrag nicht unbeobachtet kaskadierend löschen. Freigabe und
Aufräumen erfolgen erst nach bekanntem Ausgang beziehungsweise bewusst
abgeschlossener Klärung. Entfernte Providerbilder bleiben nicht einfach
unbefristete oder möglicherweise abgelaufene URL-Verweise im Auftrag.

Erfolg verlangt eine nachgewiesene externe Artikelkennung und einen passenden
Anbieterzustand. Doppelter Klick und unklare Rückmeldung dürfen kein zweites
Inserat durch einen neuen Auftrag auslösen. Ohne belegte Anbieter-Idempotenz
ist eine Genau-einmal-Garantie über einen Browserweg nicht möglich. Vor dem
Absenden wird die Übermittlungsgrenze dauerhaft markiert. Bei Verbindungsabbruch
bleibt der Ausgang unklar; eine lesende Klärung sucht das passende Inserat,
ohne sich allein auf Titel oder Preis zu verlassen. Ohne eindeutigen Nachweis
bleibt ein weiterer Veröffentlichungsversuch gesperrt und benötigt eine
bewusste Klärung. Die bisherige Schreibfunktion unterstützt nur Titel,
Beschreibung und Preis bestehender Inserate; neue Inserate und zusätzliche
Felder brauchen einen eigenen Veröffentlichungsnachweis.

Ein zweites bestehendes Konto wird über die vorhandene Kontoverwaltung
verbunden. Kontoprofil, Abrufstände, Ereignisse, Entwürfe und Aufträge bleiben
getrennt. Ein echter zweiter Login benötigt die vom Nutzer gewählte
Kontoverbindung und seine Anmeldung. Die vorhandene Oberfläche allein
belegt weder unabhängige Profile noch eine erfolgreiche Zwei-Konten-Abnahme.

## Alternativen und empfohlene Reihenfolge

Ein gemeinsamer Inseratbereich vermeidet doppelte Bild-, Text- und
Artikelverwaltung. Ein eigener Vinted-Editor wäre schneller isoliert baubar,
würde aber denselben Vorbereitungsablauf doppelt pflegen. Die offizielle
Pro-Integration wäre bei bestätigter Freischaltung ein weiterer Anbieterweg;
ihre Zugänglichkeit für die vorhandenen Konten ist nicht nachgewiesen.

Die Arbeit in sechs überprüfbare Umsetzungspakete teilen:

1. **Verlässliche Datenbasis und Quellenprüfung.** Bereichsstände,
   Vollständigkeit, atomare Übernahme und ehrliche Bewertungszustände; frühzeitige
   Kaufzustände und ungelesene Nachrichten mit geeigneten Beispielen belegen.
   Abnahme: Fehler oder fehlende Seiten löschen keine gültigen Daten; ein
   Prozessabbruch verliert kein bereits erkanntes Ereignis. Dieses Paket
   verbessert auch den heutigen manuellen Abruf.
2. **Automatischer Abruf als begrenzter Kontopilot.** Widerrufbare
   Hintergrundrechte, Dispatcher, Sperrversion, Lebenszeichen, globale
   Cloudkapazität und Recovery; zunächst 15 Minuten. Abnahme: geschlossene App,
   abgelaufenes Nutzer-JWT, zwei künstliche Konten, Rechteentzug und Neustart.
   Laufzeit, Anfragezahl, Queuewartezeit und Cloudstunden messen; danach
   nachgewiesen geeignete 5-/10-Minuten-Abrufe freigeben.
3. **Benachrichtigungen in der vorhandenen Glocke.** Stabile Ereignisse,
   Ausgangsbasis je Quelle/Gespräch, Anzeigeeinstellungen, eingeschränkte
   SQL-Rechte, inhaltsfreier Broadcast, getrennte Browseranzeige und richtiger
   Zähler. Abnahme: echte fachliche Unterschiede zwischen Angebot, Kauf,
   Versand und Storno; keine Historienflut, Fälschung oder doppelte Meldung.
4. **Gemeinsame Entwürfe und sofortige Bestandsbearbeitung.** Plattformmodell,
   externe Artikel ohne Inventarzwang, Entwurf-/Anbieterversionen und separat
   ausgelöste Update-Aufträge. Kleinanzeigen bleibt funktionsfähig. Abnahme:
   Öffnen und Speichern ohne Vinted-Browser, Wiederöffnen desselben Entwurfs,
   paralleler Import ohne Überschreiben und verständliche Versionskonflikte.
5. **Neue Vinted-Veröffentlichung und Zwei-Konten-Abnahme.** Geprüfte
   Kategorieoptionen, geschützte Fotokopien, Bestands-/Kontozuordnung,
   Übermittlungsgrenze und bestätigte Artikelkennung. Abnahme: Doppel-Klick,
   zweiter Tab, Foto-/Artikellöschung und Abbruch nach Absenden erzeugen keinen
   neuen Auftrag zum ungeklärten Inserat. Danach die beiden konkret gewählten
   Konten und einen ausdrücklich bestimmten Testartikel live prüfen.
6. **eBay-Vorbereitung und Veröffentlichung.** Das gemeinsame Modell ist dafür
   vorgesehen. Kategorie-/Merkmalquelle, Verkäuferverbindung, Angebotsformat,
   Versand-/Zahlungs-/Rückgaberegeln und separater Veröffentlichungsadapter
   bilden ein eigenes Paket mit Sandbox-Abnahme. eBay ist damit weiter im
   Gesamtumfang enthalten; die Vinted-Etappen behaupten keinen fertigen eBay-Weg.

Pakete 1–3 hängen hinsichtlich der Ereignisquellen voneinander ab. Paket 4
kann nach abgestimmtem gemeinsamen Datenvertrag parallel vorbereitet werden;
Paket 5 braucht die bestätigten Schreib- und Sperrverträge. Die Implementierung
erfolgt in zusammengehörigen PRs aus dem aktuellen `origin/master`, nicht durch
Zusammenführen historischer abgeschlossener Zweige.

Das ist ein Vorschlag zur Abstimmung, kein bereits freigegebener
Implementierungsplan. Für jeden Schritt werden Schemaänderungen deklarativ
definiert, Migrationen erzeugt und geprüft und Supabase-Typen neu generiert.
Kein isolierter Dokumentations-PR; diese Untersuchung gehört zur späteren Umsetzung.

## Änderungspunkte im vorhandenen Projekt

Die endgültigen SQL-Dateipräfixe werden am dann aktuellen Hauptstand gewählt.
Neue Schemadateien müssen in `supabase/config.toml` ausdrücklich nach ihren
Abhängigkeiten registriert werden; der heutige Bestand verwendet eine explizite
Ladereihenfolge. Die bestehenden Dateien werden nicht pauschal umsortiert.

| Paket | Verantwortliche vorhandene Bereiche                                                                                                                      | Geplante zusätzliche Verantwortung                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1     | `vinted-account-import.ts`, `supabase-vinted-import-writer.ts`, `marketplace-read.models.ts`, zugehörige SQL-Lesefunktionen                              | Geprüfte Quellen-/Bereichsergebnisse und atomare Übernahme statt loser Upsert-Folge.                          |
| 2     | `marketplace-sync-runner.ts`, `marketplace-browser-session-broker.ts`, `supabase-browser-session-store.ts`, `marketplace-browser-recovery.ts`, `main.ts` | Fällige Konten, begrenzter Hintergrundzugriff, gemeinsame Auftragsclaims und Cloudkapazität.                  |
| 3     | `webhook.models.ts`, `webhook.service.ts`, `web-push.service.ts`, Header und Benachrichtigungseinstellungen                                              | Dauerhaftes Marktplatzereignisregister, Anzeigeeinstellungen, Sichtbarkeit und inhaltsfreie Nachladehinweise. |
| 4     | `features/listings/models/`, `listing.service.ts`, Listing-Editor/Übersicht, Vinted-Inseratdetail                                                        | Gemeinsamer Entwurf und externe Veröffentlichung als getrennte Modelle; Versionsschutz.                       |
| 5     | Listing-Images-Service, `vinted-browser-listing-edit.ts`, Worker-HTTP-API und Veröffentlichungsaufträge                                                  | Neue Inseraterstellung, auftragsgebundene Fotokopien und sichere Klärung eines unbekannten Ausgangs.          |
| 6     | Gemeinsame Listings-Grenze; neue eBay-Verbindung und eigener Feature-Adapter                                                                             | Offizielle eBay-Verkäuferanmeldung, Metadaten, Angebotsverwaltung und Sandboxprüfungen.                       |

Keine UI-Datenbankabfragen in Komponenten. Bestehende Shared-Felder, Buttons,
Dialoge, Karten und Plattformidentitäten verwenden; kein zweites lokales
Designsystem. Separate HTML-Dateien, Signals, OnPush und die bestehenden
Layoutregeln bleiben verbindlich. Neue Bibliotheken sind für Zeitplan,
Ereignisregister und Auftragssteuerung nicht erforderlich.

## Einführung und Betrieb

1. Datenbankänderungen additiv einführen: deklaratives Schema, erzeugte neue
   Migration, geprüfte Rechte und neu generierte Typen im selben PR. Bereits
   vorhandene Migrationen bleiben unverändert. Übernahme bestehender Inserate
   und Team-Meldungen ist ausdrücklich Teil der Datenbankabnahme.
2. Neue Worker-Browsertests müssen in den allgemeinen Pflichtjob. Dieser ruft
   heute nur `typecheck`, `test` und `build` auf; `test:browser` gehört noch
   nicht dazu. Neue UI-Abnahmen müssen ausdrücklich in
   `playwright.pr.config.ts` und den Auswahlvertrag
   `scripts/playwright-pr-smoke.test.mjs` aufgenommen werden. Die separate
   Marketplace-Preview ist an einen historischen Branch gebunden und ersetzt
   keine allgemeine PR-Abnahme.
3. Web-App, Datenbank und separat veröffentlichtes Worker-Image anhand des
   geprüften Merge-Stands abgleichen. Der Worker-Image-Workflow ist heute
   `workflow_dispatch`; ein grüner Webbau veröffentlicht ihn nicht mit.
   Vor Aktivierung die tatsächlich verfügbare Funktion über einen kompatiblen
   Fähigkeitsvertrag prüfen. Die heutige feste `apiVersion === 2` darf weder
   eine neue Fähigkeit vortäuschen noch alte Clients ungeplant aussperren.
4. Neue Zeitpläne bleiben bis zur bewussten Aktivierung des Kontopiloten aus.
   Die Rücknahme deaktiviert zuerst weitere Claims, lässt bekannte laufende
   Ergebnisse sichern und bestätigt Browserstopps. Ein Rollback löscht keine
   Entwürfe, Ereignisstände oder Aufträge mit unklarem Ausgang.
5. Betrieb protokolliert nur Auftrag, Phase, Dauer und normierte Fehler.
   Keine Token, Browserbilder, privaten Nachrichtentexte oder Käuferdaten in
   Logs und CI-Artefakten. Messwerte für Start, Lesen, Speicherung, Stopp,
   Wartezeit, Anfrageanzahl und tatsächliche Cloudkapazität entscheiden über
   die kürzeren Intervalle. Ein Healthcheck ist keine Funktionsabnahme.

## Noch notwendige eigene Nachweise

| Offener Nachweis                                                                  | Was ohne ihn bereits umgesetzt/geprüft werden kann                                              | Freigabegrenze                                                                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ungelesene Nachricht ohne Lese-Nebenwirkung und stabiles Angebotsereignis         | Bereichsverträge, historische Baselines, konservative Gesprächsänderung und synthetische Tests. | Keine Behauptung vollständiger Nachrichten-/Angebotserkennung.                                  |
| Bezahlte neue Bestellung, manuelle Abwicklung und Storno                          | Atomare Übernahme und geprüfte Trennung der nachgewiesenen Zustände.                            | Keine Kaufmeldung aus „Versendet“ oder bloßer Textsuche ableiten.                               |
| Vollständige Vinted-Formularoptionen für den gewählten Kontotyp und die Kategorie | Gemeinsame Entwürfe und bestehende bestätigte Titel-/Text-/Preis-Updates.                       | Keine frei erfundenen Anbieterwerte veröffentlichen.                                            |
| Cloudkapazität, kurzer Abruf und Laufzeiten des tatsächlichen Vertrags            | Dispatcher und alle Intervalle mit künstlicher Uhr/Kapazität testen.                            | 5/10 Minuten erst nach belastbarer Messung aktivieren.                                          |
| Zweites konkret gewähltes Konto und eigener Testartikel                           | Zwei-Konten-Isolation, Profilzuordnung und Uploadfälle mit künstlichen Daten.                   | Reale Anmeldung/Veröffentlichung nur am bestimmten Ziel, nicht an beliebigen Bestandsinseraten. |
| Geeigneter Anbieterzugang für den realen Betriebsweg                              | Lokale Entwicklung und Tests, Pro-/Browserweg getrennt planen.                                  | Öffentliche Konkurrenzfunktionen sind keine Anbieterfreigabe.                                   |

Die offenen Nachweise blockieren nicht sämtliche Arbeit. Sie begrenzen die
jeweiligen Zusagen und produktiven Aktionen; die davor liegenden überprüfbaren
Verbesserungen können nach Abstimmung des Entwurfs umgesetzt werden.

## Abnahme für die spätere Umsetzung

- Zeitgesteuerter Abruf funktioniert bei geschlossener Flipbase-Seite und nach
  Worker-Neustart; Pause und Rechteentzug verhindern den nächsten Lauf.
- Zwei Konten und zwei Workspaces bleiben bei Zeitplan, Browserprofil,
  Entwürfen, Aufträgen und Meldungen getrennt.
- Erstimport meldet keine Historie; erneuter Import, zweiter Tab und Neustart
  duplizieren keine Ereignisse. Fehlgeschlagene Teilabrufe behalten ihren Stand.
- Neue Nachricht, Preisangebot, bezahlte Bestellung, Abbruch und Bewertung
  haben eigene geprüfte Fälle. Ungelesene Chats bleiben ungelesen.
- Vinted-Meldungen sind ausschließlich für Berechtigte sichtbar; Browseranzeige
  und Broadcast erzeugen keine zusätzliche Datenbankmeldung.
- „Bearbeiten“ und „Entwurf speichern“ starten keinen Vinted-Browser.
  Neuladen erhält den Entwurf; paralleler Import erhält laufende Eingaben.
- Aktualisieren und Veröffentlichen prüfen Zielkonto und Entwurfsversion;
  unklare Schreibausgänge erlauben keinen automatischen zweiten Versuch.
- Bestehender Kleinanzeigen-Ablauf, Angular-Vorlagenbau, relevante Datenbank-,
  Worker- und Komponententests sowie Browserabläufe einschließlich AXE bestehen.

Zusätzlich aus den Reviews verbindlich aufnehmen:

- Absturz nach jedem Übernahmeschritt verliert kein Ereignis; ein veralteter
  Sperrbesitzer darf auch nach Wiederanlauf keinen Bereich übernehmen.
- Ein Lauf länger als das Intervall erzeugt weder einen zweiten Browser noch
  eine wachsende Liste verpasster Einzelzyklen. Cloudkapazität gilt über alle Konten.
- Ein erstmalig gelesener alter Chat erzeugt keine Nachrichtengeschichte als
  neue Meldungen; fehlende Quellenzeit und veränderte Antwortformatierung ebenfalls nicht.
- Fehlender Bewertungsautor oder Sternwert wird nicht erfunden. Eine neue
  Bewertung und eine Änderung vorhandener Bewertung bleiben unterscheidbar.
- Normales Mitglied, Workspaceadmin ohne Betreiberrolle und ein bereits
  verbundener Client nach Rechteentzug können keine Vinted-Inhalte nachladen.
- Direkte Client-Inserts und Updates dürfen keine geschützten Vinted-Meldungen
  erzeugen oder die Audience öffnen; Bulk-Aktionen ändern nur sichtbare Meldungen.
- Verlorene, doppelte und vertauschte Broadcasts sowie Reconnect ergeben den
  Datenbankstand. Ungelesenzähler bleibt bei mehr als 50 Meldungen richtig.
- Fotoaustausch, Dateilöschung und Löschen des Quellartikels nach Auftragsannahme
  verändern den gespeicherten Veröffentlichungsinhalt nicht.
- Einzelstück auf einem zweiten Vinted-Konto wird bis zur bestätigten Beendigung
  des ersten Zielinserats abgewiesen. Ein unklarer Ausgang behält seine Sperre.
- Abbruch unmittelbar vor oder nach dem Absenden bleibt fachlich unterscheidbar;
  ein Fehler bei Cachepflege oder Browserstopp wiederholt keine bestätigte Mutation.
- Älterer Worker mit neuer Web-App und umgekehrt startet keine ungestützte Aktion;
  die tatsächlich ausgeführten PR-Tests enthalten alle neuen Browserabnahmen.
- Rechteentzug, Archivierung oder Kontopause nach erfolgreichem Claim verhindert
  weitere Anbieterabrufe und die Bereichsübernahme in der Datenbank.
- Ein fehlerhafter Nachrichten-/Bewertungsbereich behält seinen alten Stand;
  erfolgreiche unabhängige Bereiche werden trotzdem einschließlich Fortschritt
  übernommen. Ein erfolgreicher leerer Abruf ist ausdrücklich ein anderer Fall.
- Gleichzeitige Dispatcheraufrufe und manueller/automatischer Start für dasselbe
  Konto erzeugen höchstens einen Auftrag/Browser. Nach Absturz oder Leaseablauf
  bleibt ein neuer Start bis zum bestätigten Anbieterstopp gesperrt.
- Neue stabile eingehende Nachrichtenkennung erzeugt „Neue Nachricht“;
  ausgehender oder unbekannter Absender niemals. Eine reine Gesprächsänderung
  erhält eine eigene zurückhaltende Bezeichnung.
- Meldung löschen und denselben Quellvorgang erneut importieren lässt die
  Meldung gelöscht; unabhängiges Ereignisregister und Fortschritt bleiben erhalten.
- Anzeige ausschalten, Ereignisse synchronisieren, Worker/App neu starten und
  wieder einschalten behält die Einstellung und erzeugt keine Historienflut.

Die integrierte Fassung wurde abschließend von den beiden vollständig
abgeschlossenen Reviewagenten gegengelesen. Deren sechs Ergänzungen zu
laufendem Rechteentzug, Teilerfolg, Doppelclaim/Bereinigung, Nachrichtenrichtung,
gelöschten Meldungen und Anzeigeeinstellungen sind oben aufgenommen.

In dieser Untersuchung wurden ausschließlich Projektcode und öffentliche
Herstellerdokumentation gelesen. Keine Vinted-Sitzung wurde gestartet, kein
Konto hinzugefügt und kein Inserat verändert. Anwendungstests und Live-Abnahme
gehören zur Umsetzung; aus dieser Dokumentation folgt kein Funktionsnachweis.
