# Arbeitsstand: Vinted-Marktplatzverwaltung

## 28. September 2026 – Browserdienst nach PR #231 aktiviert

PR #231 wurde nach grünen Pflichtprüfungen als Merge-Commit `e912b17b` in
`master` übernommen. Der automatische Produktionslauf lieferte die Web-App
auf genau diesem Commit aus. Das separat veröffentlichte Worker-Image
`sha-e912b17b3b7a6658f2eafb9af87acf62a783b7d0` wurde nach ausdrücklicher
Freigabe als einzige Browserdienst-Instanz gestartet. Das vorherige Image
`sha-1a93cbf6716b7ed4e828d25cfdba12c92e5f947a` bleibt für einen
Rückweg verfügbar.

Der Container ist gesund. Der öffentliche Gesundheitscheck antwortet mit
HTTP 200, `apiVersion: 2` und `readOnly: false`; ein Sitzungsstart ohne
Benutzeranmeldung wird mit HTTP 401 abgewiesen. Vor und nach dem Wechsel
waren sechs Browsersitzungen geschlossen und keine offen. GoLogin antwortete
lesend mit HTTP 200 und meldete weiterhin zehn Profile. Weder ein Konto
noch ein Anbieterprofil wurde gelöscht oder ein Vinted-Login ausgelöst.
Der nächste Live-Nachweis ist die Löschung einer ausdrücklich ausgewählten
eigenen Verbindung beziehungsweise die Klärung des Profilkontingents;
danach kann der Nutzer erneut eine Anmeldung starten.

## 28. September 2026 – Livefehler bei Kontoanlage, Löschung und Browserstart

Nach PR #230 ist die Web-App mit Commit `8b020be5` öffentlich ausgeliefert. Der
produktive Browserdienst läuft dagegen noch mit dem älteren Image `1a93cbf6`.
Dieses Image hat den neuen Löschpfad nicht; ein Löschversuch aus der Web-App
endet deshalb ohne Datenänderung mit der allgemeinen Fehlermeldung. Das bereits
gebaute Worker-Image für `8b020be5` ist noch nicht als laufender Container
bestätigt. Der öffentliche Gesundheitscheck liefert HTTP 200, enthält aber
keinen Versionsnachweis.

Ein vom Nutzer neu angelegter Eintrag blieb auf `needs_login`; für ihn existieren
weder ein GoLogin-Profil noch eine Browsersitzung. Eine begrenzte Anbieterprobe
mit dem serverseitig vorhandenen Schlüssel erhielt bei der Profilerstellung
HTTP 403 mit der Meldung, dass die maximale Profilzahl erreicht ist. Die
GoLogin-Liste enthält zehn Profile, darunter ein Flipbase-benanntes Profil ohne
gespeicherte Zuordnung und ohne Sitzung. Es passt namentlich zu einer noch
vorhandenen Verbindung und wurde deshalb nicht eigenmächtig gelöscht. Das
Residential-Kontingent ist nicht erschöpft: 40.253.215 von 2.147.483.648 Bytes
waren zum Prüfzeitpunkt verbraucht. Ein Vinted-Login wurde für diese Diagnose
nicht gesendet.

Auf `juna/vinted-connection-repair` entsteht der interne Datensatz erst beim
ausdrücklichen Anmeldeklick, nicht schon bei „Weiter zur Anmeldung“. Die
Haupttabelle zeigt nur Konten mit bestätigter Vinted-ID; unbestätigte Einträge
stehen getrennt zum Fortsetzen oder Löschen bereit. Der Worker erkennt genau
die beobachtete GoLogin-Profilgrenze und gibt nur einen festen Fehlercode aus;
die Oberfläche erklärt diesen statt eines allgemeinen Sitzungsfehlers.
Der Worker nennt seine API-Version im Gesundheitscheck; die Web-App sperrt
Anmeldung und Löschung bei einem veralteten Worker mit einer klaren Meldung.
Produktiv nötig bleiben der geprüfte Worker-Rollout, ein freier beziehungsweise
erweiterter GoLogin-Profilplatz und danach ein vom Nutzer gestarteter neuer
Versuch. Bestehende Anbieterprofile und Konten wurden nicht gelöscht.

## 28. September 2026 – Zweite Vinted-Anmeldestufe und Kontoverwaltung

Der Nutzer meldete bei einem selbst gestarteten Login einen per SMS gesendeten,
zwei Minuten gültigen Code. Der letzte zugehörige Browserversuch war bereits
geschlossen. Sein gespeichertes Profil stand beim rein lesenden Nachsehen auf
`https://www.vinted.de/member/login/2fa`; die Sitzung wurde anschließend beim
Anbieter bestätigt gestoppt. Es wurden weder Passwort noch SMS-Code gelesen,
gespeichert oder erneut gesendet.

Auf `juna/vinted-otp-onboarding` erkennt der Worker diese Zweitfaktor-Seite
als eigenen Zustand. Flipbase zeigt im selben Konto- und Workspace-Kontext ein
Codefeld. Der Code wird nur nach ausdrücklichem Klick, nur auf der festen
Vinted-Seite und mit erneuter Sitzungsprüfung gesendet. Bei unklarem Ausgang
erfolgt keine automatische Wiederholung. Der bisherige einminütige
Ergebniszeitraum wird für den angeforderten Code erweitert. Eine bestätigte
Identität bleibt die einzige Grundlage für den Status `connected`.

„Account hinzufügen“ öffnet nun ein zweistufiges Seitenfenster: zuerst
Plattform und Name, danach Anmeldung mit mittigem Ladezeichen und gegebenenfalls
Codeeingabe. Die Tabellenaktion öffnet denselben Anmeldedialog. Konten können
nach Bestätigung gelöscht werden. Der Server pausiert sie zuerst, stoppt
ungeklärte Sitzungen und löscht das GoLogin-Profil vor den lokalen Kontodaten;
bei unklarem Anbieterzustand bleibt das Konto zur Wiederholung erhalten.

Die tatsächlichen Eingabefelder und der Absende-Knopf der Vinted-Code-Seite
waren nach Ablauf der echten Herausforderung nicht mehr sichtbar. Die
Selektoren sind mit künstlichen Browserobjekten und einer vollständig
abgefangenen eigenen HTML-Seite im echten Chromium geprüft; ein echter
SMS-Durchlauf nach Veröffentlichung bleibt nötig. Auch die private
Identitätsroute `/api/v2/users/current` ist nach erfolgreicher Bestätigung
noch nicht live nachgewiesen. Kein Liveimport, Nachrichtenversand oder
produktives Deployment in dieser Sitzung.

## 28. September 2026 – GoLogin-Zugang nach Abo freigeschaltet

Nach Aktivierung eines Standard-Abos antwortete die produktive GoLogin-API bei der Proxy-Kontingentabfrage mit HTTP 200 statt HTTP 403; etwa 2 GB waren verfügbar. Ein leeres, nicht mit Vinted geöffnetes Anbieter-Testprofil wurde erfolgreich angelegt (HTTP 201) und wieder gelöscht (HTTP 204). Danach startete auf der vom Nutzer geöffneten Flipbase-Seite ein echter Anmeldeversuch. Die Datenbank bestätigte für diese Verbindung ein dauerhaftes GoLogin-Profil und eine aktive Browsersitzung. Ein Browserklick des Assistenten scheiterte an einem inzwischen veralteten Seitenknoten und löste keine zweite Eingabe aus.

Der Nutzer erhielt nach einer Minute den Hinweis, dass die Anmeldung nicht bestätigt wurde; erst danach verließ er die Seite. Die Browsersitzung wurde geschlossen und die Verbindung blieb auf `needs_login`. Das gespeicherte GoLogin-Profil wurde anschließend zweimal lesend geöffnet und jedes Mal beim Anbieter bestätigt gestoppt (HTTP 204). Es zeigte `/member/login/email` mit leeren Feldern und ohne sichtbaren Fehler- oder Bestätigungshinweis. Die bisher unbestätigte private Identitätsroute antwortete dort mit HTTP 403 und `access_denied`. Damit sind Profilanlage und Browserstart live belegt, aber weder ein bestätigter Vinted-Login noch ein funktionierender Kontodatenabruf. Falsche Zugangsdaten oder eine zusätzliche Vinted-Prüfung lassen sich aus diesem späteren Zustand nicht ableiten. Zugangsdaten wurden nicht ausgelesen oder erneut gesendet.

Für den nächsten Versuch wird ein weiterhin sichtbares Vinted-Anmeldeformular beim Identitätscheck als eigener Zustand an die Oberfläche gemeldet. Nach dem Zeitlimit nennt Flipbase diesen konkreten Befund, statt nur mehrere mögliche Ursachen aufzulisten. Die Zuordnung bleibt an Sitzung, Konto und Workspace gebunden; ohne bestätigte Identität bleibt der Verbindungsstatus ausstehend. Dieser lokale Code muss vor einem neuen Produktivtest über PR und Prüfungen veröffentlicht werden.

## 28. September 2026 – GoLogin-API-Limit beim echten Sitzungsstart

Bei der vom Nutzer angestoßenen Anmeldung erschien „Die Browsersitzung konnte nicht bestätigt werden“. Die Fehlermeldung entsteht beim Öffnen der Browsersitzung, bevor der Worker die Vinted-Zugangsdaten erhält. Für die betroffene Verbindung gab es in der produktiven Datenbank weder ein gespeichertes Anbieterprofil noch eine gestartete Sitzung. Lesende Proben des produktiven GoLogin-Zugangs auf zwei API-Routen antworteten mit HTTP 403 und dem Text „You have reached your free API requests limit. Please subscribe to continue.“ Der Vinted-Benutzername und das Passwort wurden bei diesem Versuch nicht geprüft.

Der Worker erkennt diese konkrete Anbieterantwort und gibt nur den festen Code `gologin_api_limit_reached` weiter. Die Flipbase-Oberfläche nennt die API-Grenze und verweist auf „API & MCP“; unbekannte Anbieterfehler bleiben allgemein. Auf der angemeldeten GoLogin-Webseite stehen „Versuch“ und „Noch 7 Tage“. Im Bereich „API & MCP“ steht zugleich, dass die volle API-Version nur in der bezahlten Version verfügbar ist. Ein Vergleich anonymisierter Fingerabdrücke bestätigte, dass das dort angezeigte Token mit dem produktiven Worker-Token übereinstimmt; kein Klartext wurde ausgegeben. Die [GoLogin-Hilfe](https://support.gologin.com/en/articles/14617029-pricing) bezeichnet den siebentägigen Test als Zugang mit vollem Funktionsumfang. Wie viele kostenlose API-Anfragen für diesen Test gelten und ob das Kontingent zurückgesetzt wird, ist in den geprüften Quellen nicht angegeben. Ein Kauf wird daher nicht allein aus der Fehlermeldung empfohlen. Erst nach geklärtem API-Zugang soll der Nutzer die Anmeldung erneut selbst auslösen. Eine erfolgreiche Vinted-Anmeldung, die Identitätsroute und der Liveimport sind weiter unbestätigt.

**Prüfung:** 70 Worker- und 33 gezielte Angular-Tests bestanden, ebenso Worker-Typprüfung/-Bau, Angular-Produktionsbau und gezieltes ESLint. Siehe `vinted-ui-verification.md`. Keine Zugangsdaten wurden ausgelesen oder erneut gesendet. Keine Datenbankmigration und keine neue Abhängigkeit.

## 27. September 2026 – Direkte Account-Anmeldung und GoLogin-Proxy

Aktuell ist PR #220 bereits in master enthalten (`c46d225`). Die Fortsetzung
liegt auf `juna/vinted-account-connection`; der ursprüngliche Foundation-Branch
ist kein ungemergter Ausgangspunkt mehr. Neuere Arbeiten wurden erhalten.

Umgesetzt: Account-Verwaltung mit direkter Weiterleitung vom Kontodialog zur
Anmeldung; einmalige Übergabe von Mitgliedsname/E-Mail und Passwort an das feste
Vinted-Webformular; erneute Berechtigungsprüfung vor den Eingaben; automatische
Identitätsprüfung und Verbindung; manuelle Browserbedienung für Zusatzprüfungen.
Neue Profile erhalten einen deutschen GoLogin-Residential-Proxy aus vorhandenem
Kontingent. Bestehende Profile werden wiederverwendet und nur auf vorhandene
Proxykonfiguration geprüft, ohne automatische Änderung oder Rotation.

Die unabhängige Prüfung fand einen blockierten Stopp während laufender Anmeldung.
Der neue Regressionstest reproduzierte zunächst HTTP 429. Nach der Korrektur
kann `/close` die Anmeldung unterbrechen; Folgeeingaben werden vom Broker
verweigert. Auch der sichtbare Beenden-Knopf funktioniert während der Anmeldung.

Nachweise: 65 Worker-Tests einschließlich HTTP-Konto-/Workspace-/Benutzertrennung,
Ablauf und Abbruch; echte Formularprüfung auf ausschließlich eigener abgefangener
HTML-Testseite mit zwei getrennten Browserkontexten; 84 Angular-Tests und
14 Navigationstests; fünf Playwright-Abläufe auf Desktop und Mobilgröße. Die
Anbieterprobe prüfte Profilanlage, deutschen Proxy und erneutes Lesen mit dem
tatsächlichen Adapter, anschließend wurden die temporären Profile gelöscht.
Keine Vinted-Zugangsdaten und kein Vinted-Konto wurden verwendet.

Offen bleibt die produktive Aktivierung: Caddy-Ziel vorhanden, Workercontainer
fehlt. [Konkreter Veröffentlichungsablauf](vinted-worker-rollout.md). Der letzte
öffentliche Befund ist HTTP 502. Kein Merge oder Deployment dieses Branches.
Die private Vinted-Identitätsroute bleibt ohne eigenen Live-Login unbestätigt;
ein solcher Login kann außerdem eine Sicherheitsprüfung erfordern. Die getrennten
Profile und Proxyzuordnungen garantieren keine Erkennung als unabhängige Geräte,
keine exklusive IP und keine Sperrfreiheit. Liveimport und Nachrichtenversand
bleiben eigene Folgepakete.

Die folgenden Abschnitte dokumentieren frühere Zwischenstände.

## 27. September 2026 – Kontobestätigung für normales Vinted-Konto

Die vorhandene Admin-Anmeldeseite kann nach der interaktiven Anmeldung eine
Kontoprüfung auslösen. Der Worker liest im zugeordneten GoLogin-Browser nur
numerische Vinted-Konto-ID und Nutzernamen. Die Datenbank setzt eine Verbindung
erst dann auf `connected`, wenn Browsersitzung, Workspace, Flipbase-Verbindung,
Bediener und Betreiberrecht weiterhin übereinstimmen. Ein schon verbundenes
Flipbase-Konto darf nicht auf eine andere Vinted-ID umgestellt werden; dieselbe
Vinted-ID darf nicht zwei Verbindungen zugeordnet werden. Als erster Datenstand
wird nur das Profil in der bestehenden kontogebundenen Lesekopie gespeichert.

Die verwendete Vinted-Identitätsroute `/api/v2/users/current` ist eine private,
nicht dokumentiert zugesicherte Schnittstelle. Sie wurde nur mit künstlichen
Antworten getestet. Ein tatsächlicher Login mit eigenem, freigegebenem Konto
ist nötig, um Erreichbarkeit, Antwortformat und die Bestätigung in Flipbase
zu prüfen. Die offizielle Vinted-Pro-API setzt eine Pro-Freigabe voraus und
passt nicht zum angegebenen normalen Konto. Ein erfolgreicher Status
`connected` wäre noch kein Nachweis für einen Liveimport von Inseraten,
Nachrichten oder Verkäufen.

**Lokal geprüft:** 54 Worker-Tests, 16 gezielte Angular-Tests und 113
Marktplatz-Datenbankprüfungen; Worker- und Angular-Typprüfung sowie Angular-Bau.
Die neue SQL-Prüfung erfasst fremde Konten und Workspaces, anderen Bediener,
abgelaufene Sitzung, entzogene Betreiberrolle und doppelte Vinted-ID. Die
Migration wurde aus `supabase db diff` erzeugt, auf die neue Funktion begrenzt
und nach einem zunächst roten Rechte-Test um den ausgelassenen Entzug für
`authenticated` ergänzt. Typen wurden lokal neu erzeugt.

**Noch offen:** Worker und Proxy kontrolliert bereitstellen, eigener
Vinted-Livetest, tatsächliche Identitätsantwort, lesende Importwege und
Fehlerverhalten bei Plattformänderungen. Keine Zugangsdaten im Repository,
kein produktiver Login oder Deployment in dieser Sitzung.

---

## 27. September 2026 – Admin-Einstieg und Anmeldeweg geklärt

Die Sidebar kennzeichnet den nur für Plattformbetreiber sichtbaren
Vinted-Bereich jetzt mit „Admin“. In der Kontoverwaltung heißt die erste
Aktion „Verbindung vorbereiten“ und erklärt, dass ein frei gewählter Name
noch kein Vinted-Konto anmeldet. Jede Verbindung hat eine sichtbare Aktion
„Anmeldung öffnen“, die zur genau passenden Verbindung führt. Die Route
öffnet für unbekannte IDs keinen Browser. Ist der Browserdienst nicht
erreichbar, steht der Grund direkt auf der Anmeldeseite.

Der öffentliche Browser-Endpunkt antwortete bei der Prüfung mit HTTP 502.
Der separate Worker läuft noch nicht produktiv. Ein Login kann deshalb
derzeit nicht über Flipbase ausgeführt werden. Auch nach einem Login gäbe es
noch keine verifizierte Vinted-Kontokennung und keinen Liveimport. Dafür sind
die getrennten Schritte in AP04e und AP05 des Plans festgehalten. Es wurde
kein echtes Vinted-Konto verwendet und kein Worker gestartet.

---

## 27. September 2026 – Admin-Pilot für interaktive Anmeldung vorbereitet

Der bestehende Vinted-Bereich und seine Kontoverwaltung sind nun für den
Pilot auf Plattformbetreiber mit Adminrechten im eigenen Workspace begrenzt.
Das gilt in Navigation, Routen und den Datenbankfunktionen; ein normaler
Workspace-Admin wird auch bei direktem Zugriff abgewiesen. Der Kontodialog
bleibt bestehen. Beim ersten Browserstart einer freigegebenen Verbindung
erstellt der Worker ein eigenes GoLogin-Linuxprofil und speichert dessen
Kennung nur serverseitig. Weitere Starts verwenden dasselbe Profil. Die
feste Startseite ist `https://www.vinted.de/`; die Bedienung ist auf zehn
Minuten begrenzt. Die Eingabeoberfläche entfernt Text nach dem Senden aus
dem Feld und verbirgt ihn während der Eingabe.

Ein Worker-Abbild, Compose-Vorlage, Caddy-Route und ein manueller Workflow
für die Abbildveröffentlichung sind vorbereitet. Der Produktionsserver hat
den Worker, den GoLogin-Token und die neue Route noch nicht erhalten. Deshalb
ist die Funktion nach einem bloßen Web-Release noch nicht live verfügbar.
Eine echte Vinted-Anmeldung und der Anmeldestatus in Flipbase wurden nicht
geprüft; importierte Daten entstehen dadurch noch nicht. Die laufenden
Cloudkosten, Proxy-Zuordnung und sichere Nutzung mehrerer echter Konten sind
weiter offen.

**Prüfung:** Gezielte Worker-, Angular- und Datenbanktests bestanden;
Angular-Bau und Worker-Containerbau waren erfolgreich. Die Einzelheiten
stehen im UI-Prüfprotokoll.

---

## 27. September 2026 – GoLogin-Cloudprofile live geprüft

Ein neuer GoLogin-API-Token wurde außerhalb des Repositorys lokal verschlüsselt
gespeichert. Die Anbieter-API bestätigte den Zugang. Zwei eigene Linux-Profile
wurden nur für diesen Test angelegt. Über Playwright-CDP öffnete das erste
Profil `https://example.com/` (HTTP 200) und lieferte ein JPEG. Anschließend
funktionierte auch der vorhandene `GoLoginCloudBrowser`-Adapter: Öffnen,
Browseraktion, Bildaufnahme und ausdrücklicher Provider-Stopp (HTTP 204).

Beide Profile ließen sich gleichzeitig starten. Unterschiedliche künstliche
Werte im lokalen Browserspeicher blieben zunächst voneinander getrennt und
waren nach Stopp und erneutem Öffnen jeweils nur im richtigen Profil vorhanden.
Nach Entfernen der Testwerte wurden beide Cloud-Sitzungen mit HTTP 204 gestoppt.
Beide Testprofile wurden danach per Anbieter-API mit HTTP 204 gelöscht; die
Profilzahl entsprach wieder dem Ausgangsstand.

Damit sind Cloud-Verbindung, zwei parallele Profile, einfache Trennung und
Beständigkeit der Sitzungsdaten im Anbieterbetrieb belegt. Es gab keinen
Vinted-Zugriff, keine Anmeldung und keine Flipbase-Ende-zu-Ende-Prüfung mit
diesem Anbieter. Der Versuch sagt nichts darüber aus, ob Vinted Profile als
unabhängige Geräte einstuft, ob Konten gesperrt werden oder wie 200–300
gespeicherte Profile unter echter Last betrieben werden können. Für G1 bleibt
ein ausdrücklich freigegebenes eigenes Testkonto nötig.

---

## 27. September 2026 – Lokale Browserkapazität gemessen

Ein künstlicher Produktkatalog ohne Netzzugriff wurde in getrennten
Playwright-Chromium-Browsern geöffnet. Bei 1, 2, 4, 8 und 16 gleichzeitig
laufenden Browsern stieg das gesamte Windows-Working-Set der Testprozesse
auf rund 0,2 / 0,5 / 1,1 / 2,2 / 4,6 GB. Bei 16 Browsern betrug der
private Speicher rund 1,36 GB. Alle 16 lieferten ein JPEG; nach dem
Schließen blieben null Testbrowserprozesse übrig. Testrechner: 64 GB RAM,
32 logische Prozessoren; vor dem Versuch etwa 24 GB freier RAM.
Das Working Set ist die Summe der Prozesswerte und kann geteilte Seiten
mehrfach zählen.

Das ist ein lokaler Belastungsversuch mit flüchtigen Browsern und einer
einfachen Testseite. Für Vinted, dauerhafte Profile und 200–300 gleichzeitige
Sitzungen ist daraus keine verlässliche Kapazität abzuleiten. Ein GoLogin-
API-Zugang war nicht eingerichtet; Anbieterprofil und echte Anmeldung wurden
nicht getestet. Der kostenlose GoLogin-Testzugang sollte zuerst für einen
kleinen Anbieter-Smoke-Test verwendet werden, bevor ein kostenpflichtiger
Tarif gewählt wird.

---

## 27. September 2026 – Browserprofile und Geräteidentität recherchiert

Die öffentliche Dokumentation von GoLogin, AdsPower und Kameleo beschreibt
dauerhafte Kontoprofile mit eigenen Sitzungsdaten und Browsermerkmalen;
Netzadressen werden über den jeweiligen Anbieter beziehungsweise Proxies
zugeordnet. GoLogin veröffentlicht ein Steuerungs-SDK und einen Docker-Rahmen,
aber keinen offenen Quellcode des Orbita-Browsers in diesen Repositories.
Camoufox ist ein offenes Beispiel für Änderungen in Firefox selbst und warnt
vor noch fehlender Produktivreife.

Der jetzige lokale Playwright-Test ist weiterhin auf einen flüchtigen,
lesenden Seitenaufruf begrenzt. Er belegt keine getrennte Geräteidentität und
keine Vinted-Anmeldung. Für die Web-App bleibt die serverseitige Kontobindung
verwendbar; vor einem echten G1-Schritt müssen Profilanbieter oder eigener
Browserbetrieb anhand eines berechtigten Testkontos bewertet werden. Eine
behauptete Erfolgsquote gegen Vinteds Kontozuordnung ist nicht belegt.
Quellen und die drei Architekturwege stehen im Implementierungsplan.
Für den nächsten G1-Piloten ist ein verwalteter Profilanbieter die vorläufige
Empfehlung. Bei 200–300 Profilen sind vor allem gleichzeitig laufende
Cloud-Sitzungen, Anbieterrechte und laufende Kosten offen; die regulären
GoLogin-Tarife nennen nur zwei beziehungsweise drei parallele Cloud-Sitzungen
bei 300 beziehungsweise 1000 gespeicherten Profilen.

**Prüfung:** Nur offizielle Anbieter- und Playwright-Unterlagen sowie das
öffentliche Camoufox-Repository ausgewertet; keine Anbieterintegration und
kein Vinted-Kontozugriff ausgeführt.

---

## 27. September 2026 – Echte lokale Testseite und Ablaufkorrektur

Die bestehende Seite `/marketplaces/vinted/session-test` wurde mit einem
künstlichen Nutzer und zwei eigenen Flipbase-Testverbindungen gegen eine
getrennte lokale Supabase-Instanz und den laufenden Playwright-Worker geprüft.
Der lesende Browser zeigte auf Desktop (1280 × 900) und iPad-Größe (820 × 1180)
ein geladenes Bild mit 1100 × 720 Pixeln. Ein Abruf derselben Sitzung mit
anderem Konto oder Workspace wurde mit 409 abgewiesen; ein Klickversuch mit 403.

Expliziter Stopp und Kontowechsel beendeten den Browser und gaben die
Datenbanksperre frei. Es wurden keine Vinted-Zugangsdaten verwendet.

Beim ersten Ablauf-Test blieb ein altes Browserbild sichtbar, obwohl der Worker
die abgelaufene Sitzung bereits geschlossen hatte. Die Angular-Ansicht gibt
das Bild nach einer fehlgeschlagenen Aktualisierung jetzt frei und blendet es
aus. Die Gegenprüfung zeigte danach, dass ein bestätigter Ablauf den neuen
Start trotzdem blockierte. Der Worker antwortet nun nur nach erfolgreich
bestätigtem Stopp mit 410. Dann verwirft die Ansicht auch die alte Sitzung
und erlaubt einen neuen Test. Bei unklarem Stopp bleibt die Sperre erhalten.
Gezielte Tests schlugen vor den Korrekturen fehl und bestanden danach; der
erneute echte Ablauf-Durchlauf bestätigte Bildfreigabe, Datenbank-Stopp und
erneut aktivierten Startknopf.

**Prüfungen:** Vier erfolgreiche lokale UI-Durchläufe (Desktop-Stopp,
iPad-Stopp, Ablauf, Kontowechsel) mit echten lokalen Auth-/REST-Antworten,
40 Worker-Tests und 13 gezielte Angular-Tests. Alle Testnutzer und zugehörigen
Verbindungen wurden nach bestätigtem Browser-Stopp entfernt. Der öffentliche
Seitenaufruf belegt weiterhin keine Vinted-Anmeldung oder inhaltlich geprüfte
Profilansicht. G1 sowie Liveimport und Nachrichtenversand bleiben offen.

---

## 27. September 2026 – Lokaler Browser für einen lesenden Test

Auf `juna/vinted-browser-worker` kann der Worker jetzt ohne GoLogin einen
flüchtigen Playwright-Chromium-Browser starten. Die Zieladresse kommt nur aus
der Serverumgebung und muss eine öffentliche Vinted-Profilseite sein. Der
Browserkontext speichert keine Anmeldung. Netzwerkziele außerhalb der Vinted-
Domains, Schreibanfragen und WebSockets werden gesperrt. Eingaben sind im
HTTP-Dienst und auf der Testseite gesperrt; nur Bild, Aktualisierung und Stopp
bleiben.

Der Sitzungsbroker bindet die Bedienung weiterhin an Nutzer, Workspace und
Flipbase-Konto. Ein ungeklärter Stopp hält die Datenbanksperre aufrecht.

**Tatsächlich geprüft:** 39 Worker-Tests, 9 gezielte Angular-Tests, beide
Typprüfungen, Worker- und Angular-Bau sowie gezieltes ESLint bestanden. Ein
lokaler Chromium-Test öffnete eine künstliche Seite, lieferte ein JPEG und
beendete den Browser. Zwei lesende Aufrufe der ausdrücklich genannten
öffentlichen Vinted-Profiladresse lieferten JPEG-Bilder, zuletzt nach der
Netzwerksperre mit 21.814 Byte; der Browser wurde jeweils beendet. Es gab keine Anmeldung, keinen Klick und keinen
Nachrichtenversand.

**Grenze:** Der vollständige Weg über die Flipbase-Testseite und eine echte
Supabase-Testverbindung wurde mangels lokaler Serverzugänge noch nicht
durchlaufen. Das Bild belegt den Seitenaufruf, nicht den sichtbaren Profilinhalt
oder G1. Nach einem ungeordneten Worker-Abbruch kann der lokale Browserprozess
nicht sicher wiedergefunden werden; der Start bleibt dann bis zur geprüften
manuellen Bereinigung gesperrt. Keine produktive Anbindung, kein Deployment.

---

## 27. September 2026 – Begrenzte Browserweiterleitung an die Testseite

Auf `juna/vinted-browser-worker` ergänzt die vorhandene Sitzungstestseite einen
getrennten Browserbereich. Der Worker authentisiert jede Anfrage über Supabase,
prüft Workspace, Konto, Bediener und dauerhafte Sperre vor Aktionen und gibt nur
begrenzte JPEG-Bilder sowie ausdrücklich einzelne Eingaben weiter. Nach
Token-Erneuerung bleibt die Bindung an dieselbe Person und dasselbe Konto
erhalten. Unklare Eingaben werden nicht wiederholt. Vor dem Serverstart wird
offener Anbieterzustand bereinigt; aktive Sitzungen werden regelmäßig geprüft
und bei geordnetem Stopp geschlossen.

Der Browserbereich bleibt ohne lokal bewusst gestarteten Worker gesperrt.
Weder GoLogin noch Vinted wurden mit einem echten Konto oder Profil geöffnet.
Die produktive Weiterleitung und G1-Prüfung auf Desktop und iPad sind offen;
dafür ist zuerst eine konkrete G0-Freigabe erforderlich.

**Prüfungen:** 37 Worker-Tests mit künstlichen Antworten, Worker-Typprüfung und
-Bau; 10 gezielte Angular-Tests mit synthetischem HTTP-/Bildpfad und AXE-
Strukturprüfung; App-Typprüfung, Produktionsbau und gezieltes ESLint bestanden.

---

## 27. September 2026 – Dauerhafte Browsersperre und Wiederanlauf

Auf `juna/vinted-browser-worker` sind die zuvor nur simulierten Sperrregeln für
einen künftigen Live-Browser als eigene Tabellen und Benutzer-RPCs umgesetzt.
Eine Reservierung bindet Workspace, Verbindung und Bediener transaktional.
Profil-IDs sind nur für den Serverdienst lesbar und werden beim Start in der
Sitzung festgehalten, damit eine spätere Änderung der Profilzuordnung keinen
falschen Browser stoppen lässt. Abgelaufene, pausierte und widerrufene
Sitzungen bleiben bis zum bestätigten Anbieter-Stopp gesperrt. Ungeklärte
Sitzungen verhindern auch das Löschen der Verbindung. Wird ein Bediener
gelöscht, bleibt seine ungeklärte Sitzung als Sperre für den Worker erhalten.

Der Worker besitzt nun Datenbankadapter für Reservierung, erneute Prüfung,
Profilauflösung und Freigabe. Vor dem ersten neuen Browserstart bereinigt er
gespeicherte Sitzungen nach einem Neustart. Ein fehlgeschlagener Anbieter-Stopp
hält die Sperre aufrecht und kann erneut versucht werden. Der Adapter prüft die
Benutzeranmeldung beim Auth-Dienst und nutzt den Service-Role-Schlüssel nur
serverseitig. Das Benutzerzugriffstoken liegt während der kurzen Sitzung im
Worker-Speicher, nie in Tabellen oder Antworten.

**Tatsächlich geprüft:** Die neue Migration wurde in einer getrennten lokalen
Supabase-Instanz erzeugt, um die vom Generator ausgelassenen Rechteentzüge
ergänzt und aus leerer Datenbank erneut aufgespielt. 32 neue gezielte
Datenbankprüfungen und 61 Datenbankdateien mit 2159 Tests bestanden. Zwei
gleichzeitige Transaktionen ergaben genau eine Reservierung; die zweite wurde
gesperrt. Ein zusätzlicher lokaler REST-Versuch mit einem eigens erzeugten
Testbenutzer bestätigte Reservierung, Profilauflösung, Statusprüfung und
Freigabe gegen die echte Supabase-API. Datenbank-Lint meldete keine Fehler.
27 Worker-Tests mit künstlichem Anbieter und Datenbankantworten sowie
Worker-Typprüfung und Paketbau bestanden. Es wurde kein
echtes GoLogin-Profil und kein Vinted-Konto geöffnet.

**Weiter offen:** Eine authentisierte Flipbase-API und begrenzte Bild- und
Eingabeweiterleitung zur vorhandenen Testseite. Erst danach ist ein G1-Test
mit einem ausdrücklich freigegebenen isolierten Anbieterprofil möglich. Die
Testseite bleibt bis dahin eine Simulation.

---

## 27. September 2026 – GoLogin-/Playwright-Dienstkern begonnen

Auf dem neuen Branch `juna/vinted-browser-worker` wurde aus dem aktuellen
`master` ein getrenntes Node-Paket für den künftigen Marktplatz-Worker
angelegt. Es verbindet `playwright-core` über den dokumentierten GoLogin-CDP-
Endpunkt, hält Token und Profil-ID im Serverprozess und ruft beim Beenden den
Anbieter-Stopp ausdrücklich auf. Die GoLogin-Anleitung zeigt, dass die
CDP-Verbindung das Profil bereits startet; der gesonderte Aufruf für eine
Liveansicht wird nicht benötigt und nicht ausgeführt.

Der Dienstkern prüft bei jeder internen Aktion Workspace, Kontoverbindung,
Bediener und den aktuellen Sperrstatus. Bei Ablauf, Widerruf oder Browserfehler
wird gestoppt. Scheitert der Stopp, bleiben Sperre und Sitzung im Speicher zur
erneuten Bereinigung erhalten; weitere Aktionen werden gesperrt. Ein
fehlgeschlagener Browserstart gibt die Sperre nur nach dem vorgesehenen
Bereinigungspfad frei. Fehlertexte enthalten keine Anbieter-URL und keinen
Token.

**Tatsächlich geprüft:** 20 Node-Tests mit künstlichem Anbieter und
Sperrspeicher; die neuen Schutzfälle schlugen vor der jeweiligen Korrektur
fehl und bestanden danach. Geprüft sind auch parallele Stopps, ablaufende
Sperren und die erneute Bereinigung nach einem ungewissen Anbieter-Stopp.
Paket-Typprüfung und Build, gezieltes ESLint sowie die vollständige
Anwendungstestsuite (1507 Node-, 270 DOM- und 1199 Angular-Tests),
App-Typprüfung und Angular-Produktionsbau erfolgreich. Die Paketprüfungen
sind in den CI-Qualitätsjob aufgenommen; Workflowtests und Formatprüfung
bestanden. Es wurde kein
GoLogin-Profil und kein Vinted-Konto geöffnet. Die vorhandene Angular-
Testseite bleibt eine Simulation.

**Offen für AP04:** Die Sperrschnittstelle braucht eine dauerhafte, atomare
Datenbankimplementierung mit Profilzuordnung und Wiederanlauf-Abgleich. Eine
authentisierte Bild-/Eingabeweiterleitung zur Testseite fehlt. Besonders ein
unklarer Anbieter-Stopp nach Prozessabbruch darf nicht als sichere Freigabe
gelten. Ein echter G1-Test benötigt ein isoliertes Testprofil und G0-Freigaben.

---

## 27. September 2026 – Korrektur für den Docker-Produktionsbau

PR #207 wurde nach grünen Pflichtprüfungen als Merge-Commit `8386afb8` in
`master` übernommen. Der automatische [Produktionslauf](https://github.com/GrischaTDev/flipbase/actions/runs/36310542011)
brach beim Docker-Bau ab: `.dockerignore` schloss den reinen Typvertrag
`supabase/functions/_shared/marketplace-contracts.ts` aus, den Angular beim
Bauen benötigt. Die Datei ist nun einzeln für den Docker-Kontext freigegeben;
andere Edge-Function-Dateien bleiben ausgeschlossen. Ein Docker-Kontexttest und
der vollständige Build der Docker-Baustufe bestanden lokal. Die tatsächliche
Veröffentlichung ist erst nach einem erfolgreichen neuen Produktionslauf belegt.

## 27. September 2026 – Kontogebundene Testsitzung

Basis: `c004b0d4` auf `juna/vinted-marketplace-foundation`. Der bestehende
Kontobereich und die gespeicherten Ansichten wurden weiterverwendet.

Der Anbieterabgleich ergab: GoLogin bietet Cloud-Start/-Stopp und eine
`remoteOrbitaUrl`; diese Liveansicht-URL ist selbst ein Zugang. Playwright kann
einen Chromium-Browser über CDP verbinden, die Unterstützung ist dabei
eingeschränkt. Eine sichere, pro Flipbase-Nutzer widerrufbare Einbettung wurde
aus den öffentlichen Anbieterunterlagen nicht nachgewiesen. Deshalb gibt die
neue Testseite weder Anbieter-Token noch CDP- oder Liveansicht-URLs aus.
Quellen und Umsetzungsschritte stehen im [Plan](../superpowers/plans/2026-09-26-vinted-marketplace.md#ap04a-kontogebundene-testsitzung-vor-anbieteranschluss).

Die neue Seite `/marketplaces/vinted/session-test` prüft ausschließlich eine
künstliche Sitzung. Die Datenbank bindet sie an Workspace, Verbindung und
angemeldeten Benutzer. Ein zweiter Start desselben Kontos wird gesperrt;
Fristablauf, Pause, Widerruf und simulierter Browserabbruch verhindern weitere
Aktionen. Ein zweiter Admin desselben Workspace darf die fremde Sitzung nicht
lesen oder widerrufen. Eine andere Kontoverbindung behält ihren eigenen Zustand. Auch eine
verspätete Antwort nach A → B → A wird in Angular verworfen. Die neue
Migration wurde aus dem isolierten Unterschied zwischen vorhandenen Migrationen
und dem neuen Schema erzeugt. Der Generator ließ ausdrückliche `revoke`-Rechte
aus; ein getesteter Nachbearbeitungsschritt ergänzte sie aus der Schemadatei.

**Tatsächlich geprüft:** Neuer Test zunächst rot; nach Umsetzung 32 neue und
31 bestehende Marktplatz-Datenbanktests grün. Frisch aufgebaute lokale Datenbank
mit der erzeugten Migration; gesamte Datenbanktestsuite: 60 Dateien, 2127 Tests
grün. Sechs neue Modelltests und 38 gezielte Angular-Tests grün. TypeScript,
gezieltes ESLint und Angular-Produktionsbau erfolgreich. Drei Chromium-Abläufe
mit künstlicher Anmeldung und abgefangenen RPC-Antworten grün; die neue Testseite
wurde bei 390 px einschließlich AXE und Überlauf geprüft. Drei Tests für die
Migration-Nachbearbeitung grün.
Die vollständige Anwendungstestsuite ist nach Korrektur zweier veralteter
Einstellungs-Routenerwartungen ebenfalls grün: 1502 Node-, 268 DOM- und
1183 Angular-Tests. Die bestehende Route `settings/marketplaces` war in diesen
alten Testlisten noch nicht enthalten. Die Shared-UI-Prüfung meldete null
Abweichungen; Schema- und Migrations-Workflowtests bestanden.
`supabase db lint --schema public --fail-on error` bestand nach dem erneuten
Migrations-Neuaufbau; verbleibende Warnungen betreffen bestehende Funktionen.

**Grenze:** Es wurde kein GoLogin-Profil geöffnet, kein Vinted-Konto benutzt,
kein Liveimport und kein Nachrichtenversand eingerichtet. Die Simulation ist
kein G1-Nachweis für eine echte interaktive Anmeldung. Der spätere Worker muss
Providerprofile bei Ablauf und Widerruf ausdrücklich stoppen und die Liveansicht
ohne Anbieter-URL auf Flipbase-Berechtigungen begrenzen. G0-Freigaben bleiben offen.
Die Datenbanktests prüfen die zweite Anmeldung nacheinander; ein Test mit zwei
tatsächlich gleichzeitigen Transaktionen steht für die Worker-Anbindung noch aus.

---

## Native Oberfläche: Fortsetzung am 26. September 2026

Basis: `611687a43d214f3532f2464a9e04dedd94082c2c` auf demselben Feature-Branch.

Der Bereich `/marketplaces/vinted` ist jetzt im Quellcode an die bestehende
Navigation angeschlossen. Fünf Inhaltsbereiche und die gesonderte Aktivitätsseite
teilen sich eine kontogebundene Auswahl. Unter `/settings/marketplaces` werden
Verbindungen über die bereits vorhandenen RPCs angelegt, umbenannt und pausiert.
Das ist keine Vinted-Registrierung und keine Browseranmeldung.

Die API prüft jede Serverantwort vor der Anzeige. Fehlende Kennzahlen bleiben
unbekannt; ein echter Wert `0` bleibt sichtbar. Ein Benutzer-/Workspacewechsel
verbirgt private Daten sofort. Antwortversionen verhindern alte Daten auch beim
Wechsel A → B → A. Dasselbe gilt für Gesprächsverläufe und nachgeladene Seiten.
Alle Anfragen verwenden den vorhandenen Supabase-Client ohne privilegierte Schlüssel.

### Prüfnachweise dieser Fortsetzung

- Antwortprüfung: zunächst fehlgeschlagene Tests, danach 12 erfolgreich.
- API-Anbindung: zunächst 8 fehlgeschlagen, danach 8 erfolgreich.
- Kontozustand: zunächst 13 fehlgeschlagen, danach 13 erfolgreich; ein zusätzlicher
  Gesprächswechseltest reproduzierte eine alte Seitensperre und bestand nach der
  Korrektur (14 Tests).
- Sichtbare Oberfläche: zunächst 7 fehlgeschlagen, danach 8 erfolgreich,
  einschließlich Kontowechsel, Formularspeicherung und strukturellem AXE-Check.
- Guard: 4 Tests erfolgreich; Navigation und Übersetzungen zusammen 20 erfolgreich.
- Typprüfung für App und Tests mit den tatsächlichen Projektpaketen: erfolgreich.
- Der lokale Vollbau endete mit Exitcode 137 an der Speichergrenze. Ein weiterer
  speicherbegrenzter Versuch wurde abgebrochen. Deshalb bleibt ein erfolgreicher
  vollständiger Bau auf dem GitHub-Runner das Freigabekriterium.
- Browser-Prüfung: `e2e/marketplace-accounts.spec.ts`, getrennte Konfiguration
  `e2e/support/marketplace-preview.config.ts`; ausschließlich künstliche Sitzungen
  und HTTP-Antworten. Der Lauf wird gegen den tatsächlichen Angular-Bau geprüft,
  nicht gegen eine nachgebaute HTML-Seite. Bilder und Laufprotokolle bleiben Artefakte.

Für den direkten Wiederholungslauf die Anwendung lokal starten und dann
`npx playwright test --config e2e/support/marketplace-preview.config.ts` ausführen.
Die Konfiguration hat kein globales Anmelde-Setup; kein Benutzerkonto wird benötigt.

### Abgrenzung

Konten und gespeicherte Ansichten sind angebunden. GoLogin-Anmeldung, Liveimport,
Nachrichtenversand und globale Push-Ereignisse bleiben getrennte weitere Schritte.
Es wurden keine Datenbanktabellen, Migrationen oder produktiven Konten geändert.
Die sichtbare Seite ist erst nach separater Veröffentlichung in der laufenden
Flipbase-Installation erreichbar.

---

## Wiederaufnahme: Konten und Datenbankprüfung

**Stand:** Die gespeicherten Arbeiten des unterbrochenen Laufs wurden ab
`f40524aed0f80abb704fc4c7306c1fc76a0f639d` auf demselben Branch weitergeführt.
Die folgenden älteren Abschnitte dokumentieren den ersten Implementierungsstart;
sie sind keine Beschreibung des jetzigen Prüfumfangs.

**Umgesetzt:** Zwei kontogebundene Datenbereiche für Verbindungen und Lesekopien,
RPCs zum Erstellen, Auflisten, Umbenennen und Pausieren von Verbindungen sowie
zum Lesen paginierter Kontodaten. Inhaber und Administratoren des zugehörigen,
nicht archivierten Workspaces erhalten Zugriff. Direkte Schreibzugriffe normaler
angemeldeter Nutzer bleiben gesperrt. Diese Datensätze erstellen kein Vinted-Konto
und melden niemanden bei Vinted an.

**Korrigiert:** Der Migrationsabgleich vergleicht ausschließlich die bestehende
Migrationshistorie mit dem neuen Marktplatzschema in einer wegwerfbaren lokalen
CI-Datenbank. Fremde Änderungen an Einkauf, Produktmedien und Suchfiltern werden
nicht übernommen. Explizite Rechte werden aus dem Schema ergänzt, bevor die
Migration auf einer neu aufgebauten Datenbank getestet wird. Versionierte
Migrationen werden von der Ergänzung abgelehnt.

**Prüfungen auf `c7192319dc118b420b397496ff35af6268a0a8a9`:**

- 59 Vertragstests und 17 Tests zur Migrationserzeugung erfolgreich.
- App- und Test-Typprüfung mit den tatsächlichen Projektabhängigkeiten erfolgreich.
- GitHub-Codejob `108428234801`: Angular-Produktionsbau erfolgreich.
- GitHub-Datenbankjob `108428234848`: Migration erzeugt und vollständig neu
  eingespielt; 31 Marktplatz-Datenbanktests erfolgreich.
- Gesamte Datenbank-Regressionssuite auf dem GitHub-Runner erfolgreich.
- Generierte Datenbanktypen erneut lokal mit App- und Test-TypeScript geprüft.

Der erzeugte Commit `986381c5cecccbf0c6f56234ecb8a9ad580d09fc` enthält die
Migration `20260926150818_marketplace_accounts.sql`, die Schemaregistrierung,
aktualisierte Typen und einen ergänzenden Haupt-Changelog-Eintrag. Der Review
bestätigte ausschließlich Marktplatz-Schemaänderungen; bestehende Typen und
historische Changelog-Einträge wurden nicht entfernt.

Die Änderungen wurden testgetrieben geprüft. Die letzte Ergänzung reproduzierte
zuerst zwei fehlgeschlagene Workflowtests; danach bestanden alle 17 Tests.
Die jeweils geänderten Workflow-/Testdateien bestanden Prettier, ESLint und die
Bash-Syntaxprüfung des Generierungsschritts.

**Prüfumgebung:** Der vollständige Quellstand und die festgeschriebenen
Projektpakete konnten über GitHub-Artefakte lokal gelesen werden. Ein normaler
Git-Clone war weiterhin nicht möglich. Der lokale Angular-Bau wurde mit
Exitcode 137 wegen der Speichergrenze beendet; der oben genannte erfolgreiche
Bau lief deshalb auf GitHub. Die vollständige Angular-/Deno-Testgruppe und die
regulären PR-Pflichtprüfungen sind damit nicht als abgeschlossen ausgewiesen.

**Produktstand:** Noch keine neue Benutzeroberfläche, keine Browsersitzung,
keine produktiven Kontozugriffe, kein Merge und kein Deployment. Als Nächstes
folgen der anbieterunabhängige Sitzungstest und der native Kontobereich gemäß
Plan. Ein erfolgreicher Datenbanktest ist kein Vinted-Livetest.

---

## 2026-09-26 – Juna – Kontodaten und Auftragsprüfung begonnen

Basis: `master` bei `6fc7bd6a8ef2d20f19fb6717347efb47bb524313`.
Branch: `juna/vinted-marketplace-foundation`.

**Auftrag:** Einen eigenen GitHub-Branch erstellen und mit dem abgestimmten
Vinted-Konzept beginnen, ohne die laufende Anwendung oder echte Konten zu verändern.

**Änderung:** Gemeinsame Typen für Plattformen, Kontoverbindungen, Fähigkeiten,
Aufträge und nullable Kennzahlen. Strikte Prüfung von Workspace-/Konto-ID,
aktionsspezifischen Nutzdaten und unbekannten Feldern. Validierte Aufträge sind
unabhängige, eingefrorene Kopien; Änderungen des Aufrufers ändern ihr Konto nicht.
Frontend-Typen und künstliche A/B-Daten sind vorbereitet. Keine neue Route,
kein ausführender Server-Endpunkt und kein Browseranbieter sind angeschlossen.

## Tatsächlich ausgeführte Prüfungen

```sh
node --experimental-strip-types --test 'supabase/functions/_shared/marketplace-*.test.ts'
```

Node 22.16.0: zuerst 53 Fehler und 1 Erfolg am bewusst unvollständigen Platzhalter;
nach Implementierung 54 Vertragstests erfolgreich. Ein zusätzlicher Fixture-Test
fand den zunächst fehlenden Workspacebezug in Inseraten und Gesprächen. Nach der
Korrektur: insgesamt 59 Tests erfolgreich, 0 Fehler, Exitcode 0.
Geprüft werden unter anderem fehlende Kontozuordnung, unbekannte Aktionen,
unzulässige Identitäts-/Providerfelder, unterschiedliche Nutzdaten je Aktion,
begrenzte Pagination, unveränderter Nachrichtentext, Kopien der Auftragsscope
und fehlende beziehungsweise unbestätigte Fähigkeiten.

Die neuen TypeScript-Dateien einschließlich Tests und Frontend-Typimport wurden
isoliert mit TypeScript 5.8.3 und `--strict --noEmit` geprüft: Exitcode 0.
Dies ist nicht die vollständige Projektprüfung mit der projektgebundenen Version.

## Grenzen dieser Prüfung

Der GitHub-Zugriff funktionierte über die Projektverbindung. Ein vollständiger
Git-Clone scheiterte in dieser Ausführungsumgebung an der DNS-Auflösung.
Projektabhängigkeiten und Deno standen hier nicht zur Verfügung. Daher sind
reguläre Edge-Suite, Projekt-ESLint/Prettier, Angular-Bau und vollständige
Regressionen noch nicht ausgeführt. Der bestehende ESLint-Vertrag nimmt
`supabase/**` aus; für diese Dateien ersetzt das keine fachlichen Tests.
Die Dateien wurden mit der dokumentierten Formatvorgabe vorbereitet, nicht als
von Prettier erfolgreich geprüft ausgegeben.

Der neue Test importiert nur `node:test`, `node:assert/strict` und lokale Dateien.
Er liegt im vorhandenen Glob von `npm run test:edge`; dessen tatsächlicher
Deno-Lauf bleibt vor einem PR erforderlich.

## Entscheidungen und nächste Schritte

- Der heutige Auftrag ist ein Implementierungsstart, nicht die Fertigstellung
  aller zehn Arbeitspakete. AP01 bleibt hinsichtlich Datenbank-/Rechteabgleich offen.
- Keine Rolle, Kontoberechtigung oder Plattformfreigabe wird aus gültigen DTOs
  abgeleitet. Serverseitige Autorisierung folgt in AP03 und ist zwingend.
- Der frühe Anbieter-/Session-Nachweis bleibt vor dem breiten UI-Ausbau.
- G0 bis G4 sind nicht erteilt. Keines der bestehenden Vinted-Konten wurde benutzt.
- Keine Datenbank, bestehende Seite, Abhängigkeit oder Deployment-Datei wurde geändert.
- Der bestehende lange Haupt-Changelog konnte hier nicht verlustfrei als Datei
  übernommen werden. Er bleibt unverändert; der exakte ergänzende Patch liegt
  daneben und muss im Vollcheckout vor dem PR angewendet werden. Kein historischer
  Eintrag wurde gekürzt oder überschrieben.

Die nächsten Änderungen setzen diesen Branch fort. Vor einem Merge sind die
Projektprüfungen auszuführen und die offenen Freigaben sichtbar zu halten.

## 27.09.2026 – Login-Fehlerrückmeldung nach Veröffentlichung

PR #224 ist gemergt; Weboberfläche und GoLogin-Worker wurden mit Commit
3c3ee4d960eaa344fbe060c4c7c8fa276262a587 aktiviert. Öffentliche Versionsprüfung,
Healthcheck und Ablehnung anonymer Sitzungsstarts (401) bestanden.

Der erste beobachtete Nutzerlogin erreicht das Vinted-Formular; Vinted meldet
ungültigen Mitgliedsnamen oder Passwort. Das belegt keine erfolgreiche Anmeldung.
Die Korrektur auf `juna/vinted-login-fix` beendet bei dieser Meldung das Polling
und erlaubt eine neue ausdrückliche Eingabe im bestehenden Profil. Die
unbestätigte Identitäts-API und Liveimport bleiben offene Integrationspunkte.

## 28.09.2026 – Hintergrundanmeldung, aktueller lokaler Stand

PR #225 ist in `master` enthalten (`537ce883`). Die weitere Korrektur liegt auf
`juna/vinted-background-login`. Die historischen Abschnitte oben sind keine
vollständige Beschreibung des aktuell ausgelieferten Funktionsumfangs.

Der normale Login zeigt ausschließlich das Flipbase-Formular, Fortschritt,
Fehler und „Anmeldung beenden“. Manuelle Browserfelder, Bildschirmbilder und
„Verbindung erneut prüfen“ entfallen. Der öffentliche lesende Testmodus bleibt
eine getrennte Ansicht. Das Hintergrundprofil bleibt kontogebunden bei GoLogin.

Playwright wartet auf das feste deutsche Formular und bedient den am 28.09.
öffentlich beobachteten Cookiebutton „Notwendige auswählen“, einschließlich
späterer Einblendungen. Fehlendes Formular und unklarer Absendeausgang werden
unterschieden. Die Prüfung sendet keine Zugangsdaten erneut, endet nach einer
Minute ohne Bestätigung und übernimmt keine Antwort nach Konto-/Workspacewechsel
oder Abbruch. Nach unklarem Transport oder Beenden ist ein neuer Versuch gesperrt,
bis das Beenden bestätigt ist. HTTP-Anfragen sind auf 90 Sekunden begrenzt.

67 Worker-Tests, 5 Chromium-Abläufe auf vollständig abgefangenen eigenen Seiten,
88 Angular-Tests und 7 lokale Oberflächenabläufe bestanden. Bau und statische
Prüfungen siehe `vinted-ui-verification.md`. Keine neue Migration/Abhängigkeit.

**Offen:** `/api/v2/users/current` wurde weiterhin nicht mit einem erfolgreich
angemeldeten eigenen Konto bestätigt. Öffentliche Recherche liefert keinen
belastbaren Nachweis für diesen privaten Vertrag. Weder eine öffentliche
Profiladresse noch ein abgeschicktes Formular genügt als Anmeldebeweis.
Nach Veröffentlichung ist dieser konkrete End-to-End-Nachweis erforderlich;
bei abweichender Antwort muss der Identitätsleser anhand des beobachteten
angemeldeten Ablaufs angepasst werden. Persönliche Verifizierung und der
vollständige Liveimport sind damit ebenfalls nicht als fertig abgenommen.
In dieser Sitzung wurden keine echten Zugangsdaten erneut gesendet und keine
Serveränderungen veröffentlicht.
