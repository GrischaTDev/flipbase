# Vintz: erster Befund zu Cloud-Anmeldung und Proxys

Untersucht von Juna am 17.10.2026, erster Befund um 22:13 Uhr Europe/Berlin.
Nachtrag zum manuellen Anmeldeversuch: 22:28 Uhr, siehe letzter Abschnitt.
Aktueller Stand nach Live-Beobachtung bis 22:42 Uhr: Anmeldung mit Einmalcode
und erster Abgleich erfolgreich. Die vorherigen Fehler bleiben als historische
Befunde erhalten; den erfolgreichen Ablauf beschreibt der letzte Nachtrag.
Auftrag: ausschließlich den ersten Cloud-/Proxy-Schritt untersuchen, anschließend
stoppen und mit dem Nutzer den Stand besprechen. Keine automatische Fortsetzung.

## Ergebnis

Der Zugang hat drei enthaltene Cloud-Kontoplätze. Die tatsächlich beobachtete
Serverantwort meldet den Ausführungsmodus `requests`, einen deutschen HTTP-Proxy
und einen fehlgeschlagenen Anmeldeauftrag. Ein erfolgreicher Login oder Abgleich
ist nicht belegt. Die sichtbare Meldung ordnet den Fehler einer vom Bot-Schutz
blockierten IP zu; die tatsächliche Vinted-Antwort ist von außen nicht beobachtet.

Der aktuelle Ablauf deutet auf serverseitige Vinted-Anfragen mit gespeicherter
Sitzung hin. Ein dauerhaft laufender GoLogin-/Playwright-Browser ist dadurch
nicht belegt. `requests` ist hier ein Modusname, kein Nachweis der gleichnamigen
Python-Bibliothek oder einer bestimmten Programmiersprache.

## Beleg A: unveränderter offener Anmeldedialog

Quelle: bestehender Nutzer-Tab `https://vintz.ai/accounts`, ohne Neuladen,
Klicken, Eingeben oder Absenden untersucht.

- Einrichtung zeigt drei Abschnitte: Konto, Proxy, Anmeldung.
- Anmeldeformular enthält Vinted-E-Mail und Passwort sowie einen Proxywechsel.
- Oberfläche meldet eine durch Vinteds Bot-Schutz blockierte IP und bietet
  einen Wechsel an. Sie beschreibt serverseitige Anmeldung ohne Browserfenster.
- Die Formulierung verspricht zugleich Sitzungserhalt beim IP-Wechsel. Für
  das untersuchte Konto ist dieser Sitzungserhalt nicht bestätigt.
- Derselbe Dialog und Fehler waren am Ende weiterhin sichtbar.

E-Mail, Passwort, Kontokennung und Sitzungswerte wurden nicht dokumentiert.

## Beleg B: tatsächlich laufende Kontoabfrage

Eine ohnehin durch die Seite ausgeführte Antwort von
`GET /api/seller/multi-accounts?scope=management` mit HTTP 200 wurde über die
Browserdiagnose gelesen. Keine eigene API-Aktion oder Wiederholung ausgelöst.
Nur nachstehende nicht geheime Zustände wurden übernommen.

| Feld                                      | Beobachteter Wert               | Bedeutung / Grenze                                                                 |
| ----------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `feature.maxProfiles`                     | `3`                             | Konkretes Zugangslimit.                                                            |
| `extraAccounts.included` / `purchased`    | `3` / `0`                       | Drei enthaltene, keine zusätzlich gekauften Plätze.                                |
| `extraAccounts.planPriceCents`            | `2790`                          | Backendkonfiguration entspricht dem öffentlichen Propreis; keine Rechnungsprüfung. |
| `feature.configured` / `workerConfigured` | jeweils `true`                  | Dienst meldet Konfiguration; kein erfolgreicher Auftragsnachweis.                  |
| `feature.execution`                       | `requests`                      | Aktuell gemeldeter Ausführungsmodus.                                               |
| `requestMode.enabled` / `workerAvailable` | jeweils `true`                  | Anfragemodus freigeschaltet und Worker als verfügbar gemeldet.                     |
| `feature.allowNoProxy`                    | `false`                         | Zugang lässt laut Konfiguration keinen proxyfreien Betrieb zu.                     |
| Konto: `domain` / `proxyCountryCode`      | `de` / `DE`                     | Vinted-Region und geprüftes Proxyland.                                             |
| Konto: `proxyMode`                        | `http`                          | Proxyprotokoll; sagt nichts über mobile, ISP- oder Rechenzentrums-IP aus.          |
| Konto: `proxyDirect`                      | `false`                         | Server meldet keine direkte Verbindung.                                            |
| Konto: `proxyCheckedAt`                   | `2026-10-17T20:02:06.804+00:00` | Zeitpunkt laut Backend; Prüfung selbst nicht beobachtet.                           |
| Konto: `state`                            | `needs_login`                   | Konto braucht Anmeldung.                                                           |
| Konto: `vintedUserId`                     | nicht vorhanden                 | Keine bestätigte Vinted-Identität im Ergebnis.                                     |
| Konto: `lastSyncAt`                       | nicht vorhanden                 | Kein erfolgreicher Abgleich dokumentiert.                                          |
| Konto: `backgroundSyncEnabled`            | `true`                          | Hintergrundabgleich konfiguriert; Erfolg daraus nicht ableitbar.                   |
| Konto: `nextSyncAt`                       | vorhanden                       | Geplanter Zeitpunkt; kein Beleg tatsächlicher Ausführung.                          |
| Auftrag: `kind` / `status`                | `login` / `failed`              | Bisheriger Loginauftrag fehlgeschlagen.                                            |

Der Server liefert außerdem eine Liste freigeschalteter Operationen, darunter
Abgleich, Antworten, Angebote, Inserate und Versandetiketten. Das ist eine
Fähigkeitsdeklaration und kein Ende-zu-Ende-Nachweis dieser Funktionen.

Die ausgewertete Kontoantwort enthält keine Felder für Proxyhost, Ausgangs-IP
oder Proxyanbieter. Ihre Feldnamen wurden kontrolliert, keine Proxy-Zugangsdaten
exportiert. Daraus folgt keine Aussage über andere, nicht untersuchte Antworten.

## Beleg C: bereits geladener Browsercode

45 bereits geladene eigene JavaScript-Ressourcen wurden aus dem Browsercache
gelesen und gezielt nach Cloud-/Proxybezügen durchsucht. Vertieft wurde das
Kontenmodul, keine vollständige Sicherheits- oder Codeprüfung vorgenommen.

Identität des Kontenmoduls:

- URL: `https://vintz.ai/_next/static/chunks/2xesihr9dsymb.js`
- SHA-256 des als UTF-8 gelesenen Quelltexts:
  `c8db6de635061eab127b7a520f4cb15cda552fcf5a579d91f0e931da14b8973b`
- Länge: 107.323 UTF-16-Codeeinheiten.
- Positionsangaben unten sind nullbasierte UTF-16-Offsets dieser Fassung,
  keine Zeilennummern.

Nachvollzogener Ablauf, ausschließlich statisch:

1. **Konto und Region:** Anzeigename und Vinted-Land auswählen.
2. **Proxy:** enthaltenen Vintz-Proxy anfordern oder eigenen Proxy eintragen.
3. **Prüfung:** eigener Proxy wird vor der Einrichtung serverseitig auf
   nutzbare Ausgangs-IP und Land geprüft. Eingabeänderungen starten die Prüfung
   nach 500 Millisekunden; Ergebnis darf nicht fehlen.
4. **Bereitstellung:** eine Anforderungskennung schützt wiederholte
   Einrichtungsversuche. Bei Poolmangel ist eine Warteschlange vorgesehen.
5. **Anmeldung:** Formular sendet E-Mail und Passwort an den kontobezogenen
   Login-Endpunkt. Das Passwortfeld wird nach Rückkehr der Anfrage geleert.
6. **Zusatzcode:** separater Ablauf für Einmalcode mit Ablaufzeit und erneuter
   Anmeldung vorgesehen.
7. **Status:** bei offenem Login alle 2,5 Sekunden Kontoabfrage; bei laufenden
   Aufträgen oder ausstehender Löschung sonst alle fünf Sekunden. Sichtbarkeit
   des Tabs und laufende Abfrage werden berücksichtigt.

| Position ungefähr | Gelesene Verantwortung                                          |
| ----------------- | --------------------------------------------------------------- |
| 27.500–29.500     | Eigene Proxyzeilen und Protokolle HTTP, HTTPS, SOCKS5 einlesen. |
| 29.500–34.000     | Poolanfragen und Wartestatus.                                   |
| 34.000–43.000     | Anmeldung, Einmalcode und Fehlerrückmeldung.                    |
| 61.000–65.000     | Anforderungskennung, Kontoladen und Statusabfrage.              |
| 66.500–70.300     | Enthaltenen Proxy anfordern oder eigenen speichern.             |
| 77.300–79.400     | Prüfung der Ausgangs-IP und des Landes.                         |
| 82.500–89.000     | Einrichtung und Auswahl zwischen enthaltenem/eigenem Proxy.     |

**Pool und Ersatz:** Das Frontend behandelt sofortige Zuteilung und fehlenden
Bestand getrennt. Ein bestehender Proxy soll bis zum verfügbaren Ersatz bestehen
bleiben. Bei offenem, unbekanntem Einrichtungsergebnis ist Klärung vorgesehen,
statt denselben Vorgang blind erneut auszulösen. Weder tatsächliche Zuteilung
noch Proxywechsel wurden in dieser Untersuchung gestartet.

**Wichtig:** Ältere GoLogin-/Playwright-Bezeichnungen kommen weiterhin in
geladenen Texten beziehungsweise Standardwerten vor. Die konkrete Serverantwort
meldet jedoch `requests`. Solche alten Bezeichnungen beweisen keine aktuelle
GoLogin-Nutzung für dieses Konto.

## Beleg D: aktuelle Anbieterangaben

Die folgenden Angaben stammen aus Vintz-Dokumenten, nicht aus einem Einblick in
den Server. Zusammenfassung der
[Datenschutzerklärung vom 16.10.2026](https://vintz.ai/datenschutz):

- Worker bei netcup in Nürnberg, Umzug von Hetzner am 15.10.2026.
- Mobile NodeMaven-Verbindungen, feste Adressen aus einem Vintz-Pool oder
  eigener Proxy; für NodeMaven eine Sitzungskennung je Konto.
- IPWhoIs zur Länderprüfung, Hyper Solutions für DataDome-Prüfungen.
- Passwort und Einmalcode höchstens etwa zehn Minuten; danach Löschung.
  Sitzungstokens bis zur Trennung verschlüsselt mit AES-256-GCM gespeichert.
- Push-Empfang über eine Firebase-Registrierung je Konto. Auftragsinhalte
  nach 30 Tagen gelöscht; separater Schutz gegen doppelte Ausführung.

Die [Preisseite](https://vintz.ai/pricing) nennt Pro mit 27,90 Euro monatlich und
drei Cloud-Konten einschließlich Proxys. Das passt zur beobachteten Konfiguration.
Die Starter-Karte nennt ebenfalls Cloud, während eine FAQ Cloud erst ab Pro/Scale
beschreibt. Dieser Widerspruch betrifft nicht das bestätigte Drei-Konten-Limit.

[NodeMaven](https://docs.nodemaven.com/en/articles/12663937-understanding-your-proxy-string)
beschreibt Sitzungskennungen für zeitweise gleichbleibende IPs. Das beweist keine
dauerhaft exklusive Vintz-IP.
[Hyper Solutions](https://hypersolutions.co/products/datadome) bietet einen
entsprechenden Dienst an. Die konkrete Vintz-Integration wurde nicht beobachtet.

## Einordnung für Flipbase

Vergleichsgrundlage: lokaler integrierter Git-Stand
`e3ef736370640125c1abddcaf82de6079205d9fa`. Keine Produktionsprüfung von Flipbase.

- `services/marketplace-worker/src/main.ts` und
  `marketplace-profile-browser.ts` verdrahten isolierte Chromiumprofile und
  einen optionalen GoLogin-Weg. Vintz meldet hier stattdessen den Anfragemodus.
  Das ist eine relevante Architekturfrage, noch kein belegter Kostenvorteil.
- `iproyal-cloud-ip-sync.ts` gleicht IPRoyal-Produkte vom Typ ISP Dedicated ab;
  `marketplace-cloud-setup.ts` organisiert Einrichtung und IP-Beschaffung.
  Die Bausteine existieren bereits; Vintz belegt nicht, dass unsere Versorgung
  oder Trennung schlechter ist.
- Interessante Vergleichspunkte: drei verständliche Einrichtungsschritte,
  enthaltener oder eigener Proxy, transparente Poolwarteschlange und kontrollierter
  Ersatz. Vor einer Übernahme den tatsächlichen Flipbase-Ablauf vergleichen.
- Vintz zeigt im konkreten Fehlerfall zugleich eine fehlende Anmeldung und
  einen behaupteten Sitzungserhalt. Für Flipbase müssen Wiederanmeldung,
  Proxywechsel und bestätigter Sitzungserhalt klar unterscheidbar bleiben.

Ein Anfragemodus könnte Browserstarts und Speicherbedarf reduzieren, erfordert
aber eigene verlässliche Sitzungs-, Schnittstellen- und Fehlerbehandlung.
Ohne erfolgreichen Vintz-Ablauf, Lastmessung und konkrete Implementierungsbelege
wird kein Architekturwechsel empfohlen.

## Offene Fragen und sinnvoller nächster Einzelschritt

- Welcher Anbieter und welche IP-Art sind diesem konkreten Konto zugeordnet?
- Exklusive oder geteilte IP, wie lange stabil, wann gewechselt, welches Volumen?
- Ist bereits automatisch ein Ersatz zugeteilt worden oder steht er noch aus?
- Funktioniert der nächste Login und gegebenenfalls Einmalcode tatsächlich?
- Bleibt eine zuvor nachgewiesene Sitzung beim späteren Wechsel erhalten?
- Welche Workerbibliothek und welcher TLS-/HTTP-Client laufen tatsächlich?

Nach gemeinsamer Besprechung wäre der nächste Einzelschritt, den angebotenen
Proxywechsel zunächst bis zur Auswahl anzusehen und einen ausdrücklich
abgestimmten Wiederanmeldeversuch zu beobachten. Damit könnten Zuteilung,
Statusfolge und Fehlerausgang geprüft werden. Ein fremder fester Poolanbieter
wird dadurch möglicherweise weiterhin nicht sichtbar.

## Grenzen und Eingriffe

Kein Login, Proxywechsel, CAPTCHA, Kontoanlegen, Versand oder Kauf ausgelöst.
Keine zusätzlichen API-Endpunkte aufgerufen. Browserdiagnose vorübergehend
aktiviert und anschließend beendet. Der offene Anmeldedialog blieb erhalten.

Kein frei erreichbarer CDP-Endpunkt für die eigenständigen REA-Browserwerkzeuge
ermittelt; die vorhandene Browser-Diagnoseschnittstelle lieferte stattdessen
Ressourcen und laufende Antworten. Direkter Abruf öffentlicher Skripte aus der
Shell scheiterte am Netzwerkzugriff; die Auswertung nutzte erfolgreich den
bereits vorhandenen Browsercache. Keine Installation oder Konfigurationsänderung.

Keine vollständigen Quelltexte, Netzwerkarchive oder geheimen Antwortwerte im
Repository gespeichert. Dokumentation enthält bereinigte Zustände, Quellidentität
und Untersuchungsgrenzen. Kein Anwendungsbau oder Anwendungstest nötig, weil
ausschließlich Analyse und Dokumentation erfolgten.

**Stopp nach diesem Schritt.** Weitere Untersuchung und jede echte
Verbindungsaktion erst nach dem gemeinsamen Abgleich.

## Nachtrag: erneute Anmeldung und IP-Konflikt

Der Nutzer startete nach Abstimmung erneut die Anmeldung und meldete wieder
Bot-Schutz. Die anschließende Untersuchung löste keine Anmeldung und keinen
Proxywechsel aus. Der Dialog zeigt weiterhin denselben Fehler.

### Einschränkung der Aufzeichnung

Vor dem Versuch wurde um 22:23 Uhr die Netzwerkdiagnose aktiviert und der
Empfang laufender Kontoantworten nachgewiesen. Beim Wiederaufnehmen nach der
Nutzernachricht lieferte die Browseranbindung jedoch keinen der angeforderten
Netzwerkdatensätze zurück: `truncated: true`, Cursor 318 auf 410. Der über die
Nachrichtengrenze erwartete Puffer war nicht erhalten.

Die ursprüngliche Login-Anfrage, ihre unmittelbare Antwort, eventuelle
Zwischenzustände und die Folge der Netzwerkanfragen wurden deshalb für diesen
Versuch nicht gesichert. Die frühere Zusage einer durchgängigen Aufzeichnung
war zu weitgehend und wurde im Chat ausdrücklich korrigiert. Aus dem
Pufferverlust ist nicht ableitbar, dass keine Anfrage stattgefunden hat.

Die Diagnose wurde erneut verbunden. Eine danach ohnehin laufende Kontoabfrage
mit HTTP 200 lieferte die folgende Auftragshistorie. Diese ist ein nachträglich
gelesener Serverstand, keine vollständige Live-Aufzeichnung des Loginablaufs.

### Zwei neue fehlgeschlagene Aufträge

Zeiten am 17.10.2026 in Europe/Berlin, Laufzeiten aus den Serverzeitstempeln:

| Auftrag       | Beginn       | Abschluss    | Laufzeit        | Von Vintz gemeldeter Grund                                                                                             |
| ------------- | ------------ | ------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Neuer Login A | 22:25:48,962 | 22:25:51,166 | 2,204 Sekunden  | Ein anderes Konto habe diese IP verwendet; nichts sei gesendet worden und der nächste Versuch verwende eine andere IP. |
| Neuer Login B | 22:26:12,925 | 22:26:39,362 | 26,437 Sekunden | Bot-Schutz habe die IP blockiert; Wechsel der IP und späterer erneuter Versuch angekündigt.                            |

Beide Aufträge melden `executionMode: requests`, `status: failed` und
`progressStep: failed`. Detaillierte `diagnostic`-/`execution`-Daten und Warnungen
fehlen. Der jeweilige Auftrag ist laut Antwort nicht wiederholbar und hat
keinen verknüpften Folgeauftrag. Ein neuer manueller Login kann dennoch einen
neuen Auftrag erzeugen; die Aussage betrifft nur die Wiederholung desselben
Auftrags. Zwei neue Auftragsdatensätze beweisen nicht zwei bewusste Klicks des
Nutzers oder eine bestimmte automatische Wiederholungsstrategie.

### Aktueller Kontostand

- Weiterhin `needs_login`, keine bestätigte Vinted-Identität.
- Weiterhin kein erfolgreicher Abgleich und kein bestätigter letzter Kontakt.
- Proxyland `DE`, Protokoll `http`.
- Proxyprüfzeit jetzt `2026-10-17T20:26:38.819+00:00`, entsprechend 22:26 Uhr.
  Dieser Zeitstempel hat sich gegenüber dem ersten Befund geändert.
- Kontoeinschränkung ausdrücklich `unknown`, ohne Prüf- oder Endzeit.
  Eine Sperre des Vinted-Kontos ist damit nicht nachgewiesen.

### Was daraus folgt und was nicht

Die gespeicherte IP-Konfliktmeldung spricht für eine Schutzprüfung gegen die
Nutzung derselben Ausgangs-IP durch mehrere Konten. Ein Pool mit wechselnden
oder wiederverwendeten IPs ist eine mögliche Erklärung. Das beweist weder
dauerhaft geteilte IPs noch den Anbieter, die IP-Art oder eine konkrete
Kontentrennung. Die Aussage, beim ersten neuen Auftrag sei nichts an Vinted
gesendet worden, bleibt eine Backendmeldung ohne unabhängigen Verkehrsnachweis.

Die geänderte Prüfzeit belegt eine neu gemeldete Proxyprüfung. Ohne alte und
neue Ausgangs-IP belegt sie keinen tatsächlichen IP-Wechsel. Aus 26 Sekunden
Laufzeit lässt sich auch kein Aufruf oder Erfolg eines DataDome-Dienstleisters
ableiten. Die Netzwerkverbindung Browser → Vintz war bei der späteren
Statusabfrage erfolgreich; deren HTTP 200 bezeichnet nicht den Vinted-Login.

### Nächster möglicher Schritt nach Besprechung

Nicht denselben Login unverändert wiederholen. Zunächst den angebotenen
Proxywechsel bis zur Auswahl untersuchen. Eine tatsächliche Änderung und ein
weiterer Login werden als eigener Schritt abgestimmt. Für eine nächste
Live-Aufzeichnung die aktive Untersuchung innerhalb eines laufenden Turns
behalten und Ereignisse fortlaufend auslesen und bereinigt sichern; die
Durchgängigkeit über eine weitere Nachrichtengrenze nicht voraussetzen.

Beobachtung nach Auswertung beendet. Keine Zugangsdaten oder Rohantworten in
Dateien übernommen; keine Produktänderung. Erneuter Stopp zum gemeinsamen Abgleich.

## Nachtrag: erfolgreicher Verbindungsablauf live erfasst

Auf erneuten Nutzerauftrag wurde die Beobachtung während seiner Tests im
laufenden Turn gehalten. Ereignisse wurden fortlaufend ausgelesen und direkt
bereinigt in eine lokale Datei geschrieben. Keine Formularaktion durch Juna.

### Ausgangszustand und Kontobegriff

Der Nutzerscreenshot und die gelesene Oberfläche zeigen bereits eine angelegte
Vintz-Kontoverbindung mit Handlungsbedarf und fehlender Anmeldung. Diese
Verbindung ist ein Verwaltungsdatensatz und kein neu erstelltes Vinted-Konto.
Ein angezeigter Anzeigename bestätigt noch keine erfolgreiche Vinted-Sitzung.
Der bereits angelegte Datensatz wurde im folgenden Ablauf tatsächlich verbunden.

### Beobachtete Folge

17.10.2026, Europe/Berlin. Auftragszeiten stammen aus den live gelesenen
Serverantworten. Anfragezeiten und Laufzeiten wurden über Browserereignisse
erfasst. Passwörter, Einmalcode und Authentifizierungsheader wurden nicht exportiert.

| Phase                       | Zeitpunkt / Dauer                      | Beobachtung                                                                                                                                              |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formular absenden           | 22:37:47 Uhr; HTTP-Antwort nach 720 ms | `POST /api/seller/multi-accounts/:id/login`, HTTP 200.                                                                                                   |
| Anmeldeauftrag              | 22:37:48 bis 22:38:07 Uhr; 19,29 s     | `queued` → `running`, Vorbereitung und Absenden der Anmeldung → `succeeded`.                                                                             |
| Zusätzlicher Nachweis nötig | ab 22:38:07 Uhr laut Server            | Konto `verifying_otp`, weiterhin ohne bestätigte Vinted-Identität. Der erfolgreiche Loginauftrag allein schließt die Kontoverbindung also noch nicht ab. |
| Code absenden               | 22:38:33 Uhr; HTTP-Antwort nach 576 ms | `POST /api/seller/multi-accounts/:id/verify-otp`, HTTP 200.                                                                                              |
| Codeprüfauftrag             | 22:38:33 bis 22:38:47 Uhr; 14,16 s     | Vorbereitung einer Server-Anfragesitzung, Codeprüfung, danach `succeeded`.                                                                               |
| Konto bestätigt             | ab 22:38:47 Uhr laut Server            | `ready`, bestätigte Vinted-Nutzerkennung vorhanden, kein letzter Fehler.                                                                                 |
| Erster Abgleich             | 22:38:48 bis 22:39:41 Uhr; 53,14 s     | Eigener `sync`-Auftrag startet unmittelbar im Anschluss. Sitzung vorbereiten → Inserate und Gespräche abgleichen → `succeeded`.                          |
| Weitere Aktualisierung      | 22:41:28 und 22:42:08 Uhr              | Zweimal `POST /api/seller/multi-accounts/refresh`, jeweils HTTP 200; 713 bzw. 874 ms.                                                                    |

Alle drei beobachteten Fachaufträge melden `executionMode: requests`. Vor dem
ersten Sync erschien im beobachteten Browserverkehr kein eigener Sync-POST;
der Auftrag entstand direkt im Anschluss an die Codeprüfung. Ein serverseitig
ausgelöster Erstabgleich ist deshalb eine naheliegende Ableitung. Der genaue
auslösende Backendpfad ist nicht einsehbar.

### Bestätigter Endzustand

Letzte gesicherte Kontoantwort um 22:41:28 Uhr:

- Konto `ready`, Vinted-Identität bestätigt.
- `lastError: null`.
- Erfolgreicher Abgleichszeitpunkt `2026-10-17T20:39:39.538+00:00`, also
  22:39:39 Uhr lokal.
- Einschränkungszustand vom Backend als `none` gemeldet.
- Deutscher HTTP-Proxy, keine direkte Verbindung gemeldet.
- Proxyprüfzeit `2026-10-17T20:37:49.275+00:00`.

Bei der abschließenden UI-Kontrolle war der Nutzer auf der Angebotsseite.
Dort waren fünf importierte Inserate mit Preisen, Aufrufen und Favoriten sichtbar.
Diese Anzeige stützt den erfolgreichen Datenabruf; Vollständigkeit und Richtigkeit
aller Inserate oder Gespräche wurden in diesem Schritt nicht geprüft.

### Technische Erkenntnisse

1. Die kurze Formularantwort bestätigt die Annahme, während der Fachauftrag
   weiterläuft. HTTP 200, erfolgreicher Einzelauftrag, bestätigtes Konto und
   vollständiger Abgleich müssen getrennt ausgewertet werden.
2. Anmeldung und Codeprüfung sind getrennte dauerhafte Aufträge. Ein
   erfolgreicher Anmeldeauftrag kann noch eine Codeeingabe erfordern.
3. Die Fortschrittsangaben und `requests` bestätigen den gemeldeten
   serverseitigen Anfragemodus nun auch für einen erfolgreichen Ablauf.
   Programmiersprache, HTTP-Bibliothek und eventuelle interne Browsernutzung
   sind dadurch weiterhin nicht bewiesen.
4. Ein expliziter Proxyänderungsaufruf wurde während des erfassten Ablaufs
   nicht beobachtet. Warum diese Anmeldung nach den vorherigen Blockierungen
   funktionierte, ist offen. Erholung, Hintergrundwechsel oder andere
   serverseitige Maßnahmen lassen sich nicht voneinander unterscheiden.
5. Proxyanbieter, Ausgangs-IP und dauerhafte Exklusivität bleiben unbekannt.
   Der erfolgreiche Login beweist weder eine bestimmte Proxyklasse noch eine
   garantierte Zuverlässigkeit zukünftiger Anmeldungen.

Für Flipbase sind klar getrennte Zustände und der automatische Erstabgleich
die konkreten Vergleichspunkte. Vorhandene eigene Gegenstücke und ihr tatsächliches
Verhalten müssen vor jeder Änderung geprüft werden. Die Messwerte stammen aus
einem erfolgreichen Durchlauf, nicht aus einem belastbaren Geschwindigkeitsvergleich.

### Aufzeichnung und Grenzen

- 683 Browserereignisse ausgewertet, 21 geänderte Antwortzusammenfassungen gesichert.
- Kein vom Ereignispuffer gemeldeter Verlust während dieses Beobachtungsfensters.
- Eine Antwort zur letzten Kontoaktualisierung war nach Beendigung nicht mehr
  als Body abrufbar. Anfrage, HTTP 200 und Abschlussmetadaten sind vorhanden.
  Die Antwortinhalte dieser letzten Aktualisierung bleiben unbekannt.
- Die Aufzeichnung enthält auch technische Abrufe beim vom Nutzer ausgelösten
  Seitenwechsel. Andere Funktionsbereiche wurden damit nicht umfassend untersucht.
- Interner Verkehr Vintz → Vinted, Proxyanbieter oder DataDome-Dienstleister
  war nicht einsehbar. Keine Aussagen über ausgeführte Schutzprüfungen allein
  aus den Wartezeiten ableiten.
- Netzwerkdiagnose um 22:42:12 Uhr beendet, Restpuffer anschließend ausgelesen.

Die bereinigte lokale Aufzeichnung liegt außerhalb des Repositorys:
[Netzwerkmetadaten als JSONL](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-cloud-live-2026-10-17.jsonl).
Größe 511.305 Byte, SHA-256:
`c3e73ec4f4cc3d1e14da41ae55c722f4705fcf1df0dc19d8488d3d4cd3cede2c`.
Enthalten sind normalisierte URLs ohne Querywerte, technische Metadaten,
Feldformen und ausdrücklich ausgewählte Zustände. Konten und Aufträge sind
durch lokale Aliasnamen ersetzt. Keine Request-Bodys, Zugangsdaten, Cookies,
Tokens, Käufernachrichten oder vollständigen Angebotsdaten gespeichert.

**Stopp nach erfolgreicher Verbindung und Erstabgleich.** Dauerbetrieb,
Sitzungserhalt nach Browserende und konkrete Proxyzuordnung bleiben weitere,
einzeln abzustimmende Untersuchungsschritte.

## Nutzerbewertung: SMS-Code und Status direkt am Konto

Nach dem erfolgreichen Ablauf bestätigt der Nutzer die SMS-Code-Maske und
bewertet ihre Gestaltung als gelungener als die aktuelle Flipbase-Maske.
Diese visuelle Bewertung stammt vom Nutzer; während der Live-Beobachtung
wurden vor allem Netzwerk- und Zustandswechsel erfasst, keine vollständigen
visuellen Maße der Code-Maske.

Für die spätere Flipbase-Umsetzung festgehaltener Nutzerwunsch:

- SMS-Code-Eingabe anhand der Vintz-Gestaltung konkret vergleichen und verbessern.
- Nach Eingabe der vierten Ziffer automatisch die Codeprüfung starten, ohne
  einen zusätzlichen Klick auf Senden vorauszusetzen.
- Den anschließenden Datenabgleich sichtbar direkt am betroffenen Konto zeigen.
  Der Nutzer berichtet, dort während des Abrufs den Synchronisierungsstatus
  und danach die relative Zeit seit dem letzten Abgleich gesehen zu haben.
- Status des automatischen Abgleichs am Konto erkennbar halten; der Nutzer
  sieht nach Abschluss Auto-Sync als eingeschaltet.

Bei der späteren technischen Ausarbeitung sind vollständiges Einfügen des
Codes, Vermeidung doppelter Anfragen, sichtbarer Prüfstatus und erneute Eingabe
nach einem Fehler zu berücksichtigen. Das sind technische Prüfpunkte, keine
bereits ausgearbeitete oder implementierte Lösung.

Das Feld mit dem Wert Standard gehört zum Schreibstil. In der zuvor erfassten
Kontenoberfläche war das Auswahlfeld ausdrücklich als Schreibstil des Kontos
beschriftet. Eine Auswahl oder Wirkung dieses Felds wurde noch nicht untersucht.

Keine Produktänderung begonnen. Die Punkte sind als Vergleichsanforderungen
für eine spätere, gesondert abgestimmte Umsetzung dokumentiert.
