# Vintz: Browser-Erweiterung und Cloudbetrieb im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Gesondert freigegebener Vergleich V-17. Danach stoppen;
keine Installation, Kopplung, Anmeldung, Synchronisierung, Automationsaktivierung
oder Umsetzung durch Juna.

## Ergebnis

Vintz hat zwei Ausführungswege und einen zusätzlichen Fernzugriff:

1. **Browserkonto:** Das im eigenen Browser angemeldete Vinted-Konto wird über
   Vintz Connect bedient. Die Erweiterung muss erreichbar sein.
2. **Cloudkonto:** Ein Server arbeitet mit der gespeicherten Kontositzung und
   einem zugeordneten Proxy. Der eigene PC ist nicht der Ausführer.
3. **Handy-Fernsteuerung:** Ein Handy erteilt dem eigenen PC ausgewählte Befehle.
   Das ist weiterhin Browserbetrieb und benötigt den laufenden PC/Browser.

Flipbase besitzt bereits lokale Erweiterung und Cloudbetrieb. Der Hauptbedarf
ist deshalb **keine zweite Grundarchitektur**, sondern ein einfacher Einstieg,
eine klare Übersicht der tatsächlich unterstützten Funktionen und verlässliche
Betriebsanzeigen. Vintz' Handy-Fernsteuerung ist ein zusätzlicher Ansatz, aber
noch kein praktisch geprüfter Vorteil für unseren Alltag.

## Belegarten und Ausgangszustand

| Beleg                     | Umfang und Grenze                                                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vintz live                | Kontenübersicht, Browser-Einrichtungsanleitung, Cloud-Aktionsmenü und vorhandene Aktivität. Erweiterung nicht verbunden; kein Auftrag gestartet.                                                                                                                                        |
| Vintz ausgelieferter Code | Verbindungsbrücke, Fähigkeiten, Versionsprüfungen, Kontozuordnung, Fehler, Updatehilfe und Handy-Fernsteuerung. Webclient, nicht der vollständige Erweiterungs- oder Workerquellcode.                                                                                                   |
| Anbieterangaben           | Aktuelle Startseite und Datenschutzerklärung vom 17.10.2026 gelesen. Aussagen zu Serverbetrieb und Datenhaltung nicht als unabhängige Prüfung ausgegeben.                                                                                                                               |
| Store                     | Offizieller Chrome-Store-Link in der Anleitung bestätigt. Direkter Storeabruf war nicht zugänglich; Suchindex nennt einen älteren Stand. Kein Nachweis der aktuellen Paketversion oder Berechtigungen daraus.                                                                           |
| Flipbase live             | Drei Cloudkarten: zwei verbunden mit aktuellen Synczeitpunkten, Maike weiterhin pausiert. Lokale/Cloud-Auswahl im leeren Einrichtungsdialog gelesen und abgebrochen.                                                                                                                    |
| Flipbase Quellen          | Ausgangsstand `e3ef736370640125c1abddcaf82de6079205d9fa`, unabhängiger Quellenabgleich. Während der Analyse rückte master auf `d8993677cac943e2e280c47a973518d32274a519` vor; betroffene Erweiterungs-/Konteneinstiegsunterschiede gezielt gegengelesen. Keine fremde Arbeit verändert. |

Das vorliegende Prokonto hat drei enthaltene Cloudplätze laut früherer
[tatsächlicher Kontoantwort](vintz-cloud-connection-analysis.md). In diesem
Schritt kein neuer Tarif-/Abrechnungsnachweis; vollständige Kontingente bleiben
V-18. Keine Messung mit ausgeschaltetem PC, kein längerer Ausfalltest und keine
Mehrprofil-/Mehrgeräteprüfung.

Die neu integrierten Unterschiede betreffen unter anderem eingebettete lokale
Anmeldedialoge und Chatpreise. Die hier beschriebenen grundlegenden lokalen
Ausführungswege, Cloudfreigaben, Zeitpläne und Modussperren werden dadurch nicht
ersetzt. Der geöffnete Produktionsstand wurde nicht einer Commitkennung
zugeordnet; UI-Beobachtung und Quellenstand bleiben getrennte Belege.

## Vintz: Einrichtung und täglicher Betrieb

### Browserkonto

Der Button „Browser-Konto verbinden“ klappt zunächst **nur die Anleitung** auf.
Diese fordert: Erweiterung aus dem offiziellen Store hinzufügen, Vinted im
gleichen Chrome-Profil anmelden, in der Erweiterung Region und Verbinden wählen,
anschließend zu Vintz zurückkehren und Verbindung prüfen. Kein Installations-
oder Verbindungsbutton wurde betätigt; die Anleitung wurde wieder geschlossen.

Der Client erkennt die Erweiterung über eine kurze Ping-Anfrage. Anschließend
liest er deren Status und das gebundene Profil. Verbindungszustände unterscheiden
Prüfung, fehlende Erweiterung, getrennt, verbunden und Fehler. Fokus, Rückkehr
zur Seite und Sichtbarkeitswechsel können die Statusprüfung erneut anstoßen.
Das ist eine Erreichbarkeitsprüfung, kein Beweis erfolgreicher Vinted-Aktionen.

Die Webbrücke verwendet Nachrichten mit eindeutiger Anfragekennung sowie Prüfung
von Ursprung und Antwortquelle. Bestimmte Aktionen prüfen unmittelbar vorher
Konto-ID und Vinted-Region gegen den aktuellen Erweiterungsstatus. Ein
abweichendes Konto führt zum Hinweis, die Seite vor Fortsetzung zu aktualisieren.
Die Oberfläche unterstützt einen Browserkontokontext neben mehreren isolierten
Cloudkonten; daraus folgt keine gleichzeitige Mehrkontoanmeldung im selben
Vinted-Browserprofil.

Die Kontenanleitung nennt Chrome. Der Client enthält außerdem Safari-/iOS- und
Edge-bezogene Zweige und Fehlermeldungen; daraus wird keine getestete
Browserfreigabe abgeleitet. Die native iPhone-App lehnt den direkten lokalen
Erweiterungszugriff im gelesenen Code ab und besitzt einen eigenen Fernzugriff.

Die Webkonfiguration kennt 27 Vinted-Regionen, die Anleitung verlangt deren
bewusste Auswahl. Das ersetzt keine Prüfung, welche Regionen die tatsächlich
gelieferte Erweiterung freigibt. Im Browserweg ist keine eigene Cloud-Proxy-
zuteilung belegt; maßgeblich ist der Netzweg des ausführenden Browserprofils.
Eine bestehende lokale VPN-/Proxykonfiguration wurde nicht untersucht.

### Cloudkonto und vorhandener Verlauf

Das vorhandene Cloudkonto war als verbunden mit eingeschaltetem Auto-Sync
angezeigt. Sein Menü nennt HTTP-Proxy in Deutschland sowie Pause und Entfernen;
keine dieser Aktionen ausgeführt. Die vorherige Kontoantwort meldete den
Ausführungsmodus `requests`. Das aktuell geladene identische Kontenmodul enthält
diesen Weg weiterhin. Das belegt weder eine bestimmte Programmiersprache noch
einen dauerhaft laufenden GoLogin-Browser.

Der vorhandene Aktivitätsbereich zeigte **36 Einträge: 31 erfolgreich und fünf
fehlgeschlagen**. Darunter erfolgreiche Anmeldung/Einmalcode, Synchronisierungen,
Gesprächsabrufe, Metadaten und ein bereits vorhandenes Neueinstellen. Die neueste
Synchronisierung war etwa 36 Minuten alt; zwei fehlgeschlagene Proxy-Ausgangsprüfungen
etwa vier Stunden. Die Fehlertexte erklären, dass kein direkter Verbindungsversuch
ohne Proxy erfolgt sei. Ältere Loginfehler nennen Bot-Schutz und eine bereits
anderweitig verwendete IP. Das sind gelesene Auftragsmeldungen, kein Einblick in
die tatsächliche Ausgangs-IP oder die interne Zuteilungslogik.

**Die Kontokarte nannte gleichzeitig „Letzter Abgleich vor 14 Stunden“.**
Auftragsabschluss und angezeigter Datenstand sind damit hier nicht konsistent
erklärt. Ob ein Teilabgleich, ein anderes Zeitfeld oder eine Anzeigeabweichung
vorliegt, bleibt offen. Keine Erfolgsmessung aus den 36 angezeigten Einträgen
und keine Behauptung, alle Daten seien durch die jüngsten Jobs aktualisiert.
Juna hat das schon vorhandene Neueinstellen nicht ausgelöst oder erneut gestartet.

Die Auftragsansicht beschreibt die Ausführung als serverseitig mit verbundener
Sitzung. Das stützt die Trennung vom Browserkonto, bestätigt aber keine
unterbrechungsfreie 24-Stunden-Verfügbarkeit. Für zusätzliche Browserunabhängigkeit
verweist die [aktuelle Anbieter-FAQ](https://vintz.ai/) auf Cloudkonten, die bei
geschlossenem Browser synchronisieren und Automationen ausführen.

### Server und Proxys: was weiterhin nur Anbieterangabe ist

Laut [Datenschutzerklärung](https://vintz.ai/datenschutz), Stand 17.10.2026,
betreibt Vintz den Worker bei netcup in Nürnberg. Genannt werden NodeMaven-Mobilproxys,
feste Pooladressen und eigene Proxys, IPWhoIs zur Länderprüfung, Hyper Solutions
für Bot-Schutzprüfungen sowie Firebase für kontoweise Pushregistrierungen.
Tokens seien verschlüsselt gespeichert und würden dem Worker auftragsbezogen
bereitgestellt; Passwort und Einmalcode nur vorübergehend.

Für das konkrete Konto bleiben Proxyanbieter, Ausgangs-IP, exklusive oder geteilte
Nutzung, tatsächliche Wechselhäufigkeit und Durchsatz unbekannt. Aus „HTTP ·
Deutschland“ lässt sich weder Mobilfunk noch eine feste ISP-Adresse ableiten.
Kein Proxywechsel oder Bot-Schutzversuch durch Juna. Frühere historische
GoLogin-Bezeichnungen werden nicht als Beweis des aktuellen Vintz-Cloudbetriebs
verwendet.

## Vintz: gleiche Oberfläche bedeutet keine vollständige Funktionsgleichheit

Der Webclient besitzt eine zentrale Fähigkeitsliste. Browserfunktionen richten
sich nach dem Bericht der Erweiterung; ältere Versionen erhalten begrenzte
Rückfallannahmen. Cloudfunktionen hängen unter anderem von Konto-Bereitschaft,
Verwaltungsbefugnis, Worker und freigegebenen Operationen ab. Ein Eintrag in
dieser Liste ist **kein praktisch bestätigter Ausführungserfolg**.

| Funktion                                                          | Browserweg im geladenen Client                                           | Cloudweg im geladenen Client                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Profil/Angebote, Postfach, verkaufte Bestellungen lesen           | Brückenaufrufe vorhanden                                                 | Sync-/Gesprächsaufträge vorgesehen                                                 |
| Antworten, Preisangebot annehmen                                  | Vorhanden, teilweise zusätzliche Versions-/Kontoprüfung                  | Eigene Kontoaufträge und Workerfähigkeiten                                         |
| Echtes Gegenangebot                                               | Keine entsprechende Connect-Aktion; Browserchat behält einen Textentwurf | Eigene `counter_offer`-Operation vorgesehen                                        |
| Angebote erstellen/bearbeiten/löschen, verstecken, neu einstellen | Brückenaktionen mit unterschiedlichen Versions-/Modusgrenzen             | Einzelne Workeroperationen; aktuelles Rollout entscheidend                         |
| Versandetiketten                                                  | Eigene Erzeugungs-/Abruf-/Downloadwege                                   | Eigene Workeroperationen und Dokumentpfad                                          |
| Gekaufte Bestellungen, aktuelle Größengruppen, visuelle Suche     | Als Browserfähigkeiten geführt                                           | In dieser gemeinsamen Liste kein gleichwertiger Cloudweg freigegeben               |
| Sitzung/Proxy und allgemeine Server-Antwort-/Angebotsregeln       | Kein eigener Ersatz des Cloud-Sitzungsdienstes                           | Gesonderte Serverfähigkeiten; manuelle Antwortfähigkeit beweist keine aktive Regel |

Favoritenautomationen besitzen Browser- und gesonderte Serverpfade; die
Browserfähigkeitenliste allein ist keine vollständige Aussage über
Cloud-Favoritenfunktionen. Entsprechendes gilt für separat freigegebene
Archivübertragungen. Die Einzelvergleiche zu
[Preisangeboten](vintz-price-offers-comparison.md),
[Automationen](vintz-other-automations-comparison.md),
[Archiv](vintz-archive-comparison.md) und
[Versand](vintz-orders-shipping-comparison.md) bleiben maßgeblich.

Konkrete Versionsgrenzen im Webclient: Bildantwort über die lokale Erweiterung
ab `0.3.54`, Bildantwort über Handy-Fernsteuerung ab `0.3.65`. Das sind benötigte
Mindeststände, **keine ermittelte aktuell installierte oder angebotene Version**.
Ein Suchindexstand des Storeeintrags nennt noch `0.3.24` vom August; dieser
veraltete Hinweis trägt keine Aussage über heutige Lieferbarkeit.

## Vintz: Fehler, Updates und unklare Ergebnisse

Der Browserclient unterscheidet fehlende Erweiterung, abgelaufene Anmeldung,
blockierte Anfrage, nicht mehr vorhandenen Artikel, ungültige Eingaben,
Anfragelimit, Server-/Netzfehler und notwendiges Update. Die Hilfen verlangen
beispielsweise Vinted im richtigen Profil zu öffnen, anzumelden oder eine
angezeigte Prüfung selbst abzuschließen. Keine solche Prüfung ausgeführt.

Fähigkeitsprüfung und Kontovergleich sind sinnvoll, aber nicht für jede
Brückenmethode identisch sichtbar. Ohne Erweiterungspaket kann die tatsächliche
Prüfung im Ausführer nicht vollständig nachvollzogen werden.

Der Updatehelfer fragt im verbundenen Fall höchstens ungefähr alle 30 Minuten
nach Updates. Nach erkannter Erneuerung lädt er die Seite nur dann selbst neu,
wenn zwischenzeitlich keine erfasste Nutzerinteraktion stattfand; sonst erscheint
ein Hinweis zum Neuladen. Das ist ein gelesener Mechanismus, kein ausgeführter
Updateversuch oder Nachweis der Verteilung über den Store.

Für Bildantworten verlangt der lokale Pfad einen Beleg für den Anhang. Bei
fehlender Bestätigung wird zur Prüfung des Gesprächs aufgefordert. Der
Fernsteuerungspfad unterscheidet ebenfalls unklaren Ausgang von sicherem
Fehlschlag und warnt vor erneutem Versand. Ein Timeout beweist nicht, dass nichts
gesendet wurde. Eine generelle Genau-einmal-Garantie für Browser und Cloud ist
aus dem Webclient nicht ableitbar.

## Handy-Fernsteuerung als dritter Zugang

Im gelieferten Webcode wird ein PC als Host registriert; das Handy koppelt sich
mit einem achtstelligen Code. Der Client erzeugt einen nicht exportierbaren
privaten Geräteschlüssel und legt ihn in IndexedDB ab. Er prüft einen
codegebundenen Bestätigungsbeleg des Hosts und signiert spätere Befehle. Befehle
binden Host, Gerät, Konto, Region, Art, eindeutige Kennung und Ablaufzeit.
Das ist ein nachvollziehbarer Cliententwurf; Server-/Erweiterungsprüfung wurde
nicht unabhängig validiert, keine Kopplung angelegt.

Die freigegebenen Funktionen sind begrenzt: Postfach/Gespräch lesen, antworten
und Preisangebot annehmen; keine vollständige Fernbedienung aller Verkäuferseiten.
Der Client prüft Host-/Gerätezustände und bietet offline, ausstehend, gekoppelt
und getrennt an. Bei fehlender Bestätigung soll der Nutzer das Ergebnis auf
Vinted prüfen. Ein ausgeschalteter PC wird dadurch nicht durch die Cloud ersetzt.

Die [Datenschutzerklärung](https://vintz.ai/datenschutz) beschreibt die
Weiterleitung von Befehlen und Ergebnissen über Vintz. Auch beim Browsermodus
werden Verkäuferdaten an den Arbeitsbereich übertragen; lokal ausgeführte
Aktionen bedeuten daher keine vollständig lokale Datenhaltung. Laut Anbieter
werden Vinted-Passwort und Browsercookies nicht an Vintz übermittelt.
Die optionale Änderungsmeldung der Erweiterung soll nur bereinigte
Schnittstellenstrukturen erfassen; Schalter und tatsächliche Datenminimierung
wurden ohne Erweiterungspaket nicht geprüft.

## Flipbase: vorhandene Ausführungswege und wichtige Unterschiede

### Lokale Erweiterung

Das vorhandene Manifest ist Version `1.10.2`, Manifest V3. Es deklariert
`storage`, `activeTab` und `alarms` sowie feste Website-/API-Zugriffe für Vinted,
Kleinanzeigen und Flipbase/lokale Entwicklungsdienste. Keine deklarierte
`cookies`- oder `proxy`-Berechtigung. Das beweist keine vollständige Datenfreiheit;
deklarierte Rechte und tatsächliche Verarbeitung sind getrennt zu beurteilen.
Für Vinted nennt dieses Manifest ausschließlich `www.vinted.de`; keine
gleichartige Freigabe der übrigen 26 Vintz-Regionen daraus ableiten.

Ein Browserprofil wird an Installation, Workspace, Verbindung und erkannte
Vinted-Identität gebunden. Ein zufälliges Installationsgeheimnis bleibt in
geschütztem Erweiterungsspeicher; der Server speichert seinen Hash. Die lokale
Bestätigung gilt 24 Stunden, Postfachlesen und Senden benötigen getrennte
Freigaben. Passwort, SMS und Sicherheitsprüfungen erfolgen direkt bei Vinted.
Ein Widerruf ist serverseitig auch bei nicht erreichbarer Erweiterung möglich.

Die Erweiterung öffnet einen reservierten, angehefteten Vinted-Arbeitstab und
stellt ihn nach Schließen wieder her. Ein offener Flipbase-Tab ist für ihren
Hintergrundzeitplan nicht nötig. Das richtige Browserprofil und der Rechner
müssen jedoch laufen; Schlafmodus oder Browserende verhindern lokale Ausführung.
Ausgelesene Daten werden nach Flipbase übernommen: auch hier bedeutet „lokal“
die Ausführung, nicht ausschließlich lokale Datenhaltung.

Ein Alarm läuft ungefähr alle 30 Sekunden; er ist **kein 30-Sekunden-Vollabgleich**.
Die hinterlegten Fälligkeiten unterscheiden aktuellen Postfachabruf und
Favoritenprüfung mit fünf Minuten, fortgesetzten Erstimport mit einer Minute
sowie Nachrichten-/Verhandlungs-/Favoritenaufträge mit 90 Sekunden. Profil und
Inserate stehen nicht in dieser automatischen Liste; dafür existiert ein
ausdrücklicher Synchronisierungsaufruf. Zeiten sind Codevorgaben, keine gemessene
Zustellgarantie.

Anmeldebedarf, Sicherheitsprüfung, blockierte Sitzung, ungültige Freigabe und
Kontoabweichung pausieren die lokale Arbeit. Anfragelimits führen zu Wartezeit.
Identität und gespeicherte Ergebnisbelege schützen vor blindem erneutem Versand
nach einem Neustart. Das ist eine bestehende Grundlage, kein neu zu bauender
Vintz-Vorteil.

### Installation und Funktionsumfang

Der unveränderte Flipbase-Dialog bietet „Lokale Erweiterung“ und „Cloudbrowser“.
Für lokal beschreibt er derzeit eine entpackte Installation im Entwicklermodus
und ein eigenes Chrome-/Brave-Profil je Konto. Die Repository-Anleitung nennt
noch keinen veröffentlichten Storeeintrag; nicht extern als vollständige
Storeinventur geprüft. Ein neues ZIP aktualisiert die gewählte Installation
nicht automatisch; der tatsächlich verwendete Ordner muss aktualisiert und
neu geladen werden. Vintz hat hier mit direktem Store-Einstieg einen klaren
Komfortvorsprung, ohne dass dessen aktuelle Updateversorgung getestet wäre.

| Aufgabe                                                                  | Tatsächlicher Flipbase-Stand im integrierten Code                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profil und Inserate lokal lesen                                          | Angebunden, Identitätsprüfung und begrenzte Datenübernahme vorhanden.                                                                                                           |
| Postfach, Antworten, Verhandlungen, Favoritennachrichten/-angebote lokal | Ausführer, getrennte Freigaben und Hintergrundaufträge vorhanden; hier nichts ausgeführt.                                                                                       |
| Verkäufe lokal übernehmen                                                | Nicht angebunden. Vorhandene gespeicherte Verkäufe sind kein Nachweis eines lokalen Verkaufsimports.                                                                            |
| Vinted-Angebote lokal veröffentlichen                                    | Vorbereitete Backend-/Client-/Ausführerdateien vorhanden, aber nicht durchgehend in Erweiterung und Scheduler angeschlossen. Keine bestätigte lokale Ende-zu-Ende-Funktion.     |
| Cloudantworten, Verhandlungen und Favoriten                              | Im Chromium-Worker verdrahtet; Freigaben und Konfiguration entscheiden über den Betrieb.                                                                                        |
| Neue Vinted-Angebote in der Cloud                                        | Zusätzlich eigene Veröffentlichungsfreigabe nötig; `MARKETPLACE_LISTING_PUBLISH_ENABLED` ist standardmäßig aus. Vorhandener Code belegt keine heutige produktive Freischaltung. |
| Vinted-Neueinstellen                                                     | Kein eigener zusammenhängender Ausführungsweg im bisherigen Vergleich; siehe [Neueinstellen](vintz-relisting-comparison.md).                                                    |
| Handy steuert lokalen PC                                                 | Kein angeschlossener entsprechender Pfad im untersuchten Paket gefunden. Lokale Kopplungsbestätigung ist keine Handy-Fernsteuerung.                                             |

Die fehlende lokale Veröffentlichung folgt nicht aus einem Dateinamen: Der
Hintergrund-Einstieg lädt die vorhandenen Vinted-Listingdateien nicht; Kern und
Zeitplan besitzen keinen entsprechenden Listingauftrag. Die vorhandene
Kleinanzeigen-Veröffentlichung ist davon zu trennen.

### Cloud, Proxys und Moduswechsel

Flipbase hat einen eigenen Chromium-Worker mit dauerhaften Kontoprofilen und
getrennter Netzwerkzuordnung; daneben existiert ein älterer GoLogin-Adapter.
Die Workerbezeichnung `provider=local` meint einen begrenzten Testadapter und
darf nicht mit der Nutzer-Erweiterung verwechselt werden.

Der untersuchte eigene Cloudpfad reserviert deutsche IPRoyal-Dedicated-ISP-IPs
je Konto und verlangt aktivierte, geprüfte, nicht abgelaufene Zuordnungen.
Die Registrierung prüft den öffentlichen Ausgang; eine fehlende
Netzwerkkonfiguration wird abgelehnt. Kein stiller Wechsel auf eine direkte
Verbindung im geprüften Auflösungspfad. **Eine erneute Ausgangsprüfung vor
jedem einzelnen Anbieteraufruf ist damit nicht nachgewiesen.** Vintz' konkrete
Proxyart bleibt trotz der breiteren Anbieterangaben unbekannt; kein belegter
Qualitäts- oder Kostenvorteil gegenüber dieser Flipbase-Zuordnung.

Der Cloudzeitplan besitzt Pause, Wartezeiten und Fehlerzähler. Netzwerk-/Server-
fehler werden mit wachsender Wartezeit behandelt, ab drei Fehlern pausiert.
Anfragelimits warten mindestens 15 Minuten. Wiederholter Anmeldebedarf pausiert
nach einer kurzen Toleranz, harte Rechte-/Sicherheits-/Bereinigungsfehler sperren
den Zeitplan. Ein erfolgreicher Teilauftrag bedeutet nicht automatisch einen
vollständigen erfolgreichen Datenstand.

Flipbase wechselt nicht automatisch zur Cloud, wenn der eigene Browser ausfällt.
Der kontrollierte Wechsel besitzt bereits konkrete Sperren:

- Cloud → lokal: aktive/stoppende Cloudsitzung, offene/unklare Operation oder
  eingeschalteter Cloudzeitplan verhindern die lokale Freigabe.
- Lokal → Cloud: erneute Identitätsprüfung und bestätigter Browserstopp;
  lokale Freigabe wird widerrufen, Generation erhöht und wartende lokale
  Nachrichten werden storniert. Keine Cookieübertragung als nahtlose Migration.
- Auftragsrouting berücksichtigt den gespeicherten Ausführungsmodus;
  Anfragekennungen dürfen nicht unbemerkt als neuer Modusauftrag gelten.
  Begonnene Listingaufträge mit geändertem Kontext bleiben gegebenenfalls unklar,
  statt erneut veröffentlicht zu werden.

Der Cloudbetrieb besitzt zudem einen konservativen gemeinsamen Browserplatz:
aktive oder stoppende Sitzungen verhindern einen weiteren Start. Das begrenzt
Parallelität; eine Messung oder Umgestaltung wurde nicht vorgenommen. Lokaler
Zeitplan und Ausführer verhindern ebenfalls parallele eigene Läufe. Daraus
folgt keine universelle Dublettenprüfung gegenüber manueller Vinted-Bedienung
oder allen denkbaren Aktionen.

## Festgehaltene Empfehlungen, keine Umsetzung

| Priorität   | Für Flipbase sinnvoll                                      | Später zu prüfendes Ergebnis                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zuerst      | Funktionsumfang pro Betriebsart ehrlich ausweisen          | Jede Aktion ist als verfügbar, gesperrt oder noch nicht angebunden erklärt; vorhandene Dateien werden nicht als fertige Funktion beworben.                                                        |
| Zuerst      | Betriebs- und Datenstand getrennt anzeigen                 | Rechner/Erweiterung, Vinted-Anmeldung, Freigabeablauf, letzter erfolgreicher Abruf je Bereich, Warteschlange und Fehler sind unterscheidbar. Vintz' widersprüchliche Synczeiten nicht übernehmen. |
| Danach      | Erweiterungsinstallation und Updates vereinfachen          | Geprüfter Storeweg, erkennbare Version, Updatehilfe und Erhalt ungesendeter Arbeit. Bestehende Kontobestätigung und getrennte Rechte erhalten.                                                    |
| Danach      | Lokale Verkäufe und Veröffentlichung gezielt fertigstellen | Je ein klar begrenzter, bestätigter Ablauf mit richtigem Konto und Ergebnisbeleg; keine stillschweigende Aktivierung durch diese Analyse.                                                         |
| Beibehalten | Moduswechsel und unklaren Ausgang absichern                | Keine parallele lokale/Cloudausführung derselben offenen Aufgabe, kein automatischer Neuversand bei fehlendem Ergebnisbeleg.                                                                      |
| Später      | Handy-Fernsteuerung nach tatsächlichem Bedarf bewerten     | Klar begrenzte Funktionen und verständlicher PC-offline-Zustand; eigener Freigabe-/Entzugs-/Ergebnisschutz. Keine Gleichsetzung mit autonomer Cloud.                                              |

Ein Wechsel der Cloudarchitektur zu direkten Anfragen wird aus dieser Analyse
nicht empfohlen. Dafür fehlen gleichartige Last-, Kosten-, Zuverlässigkeits-
und Wartungsmessungen. Die bereits vorhandenen Cloud-/Proxybausteine bleiben
Ausgangspunkt einer späteren Entscheidung.

## Offene technische Grenzen

- Kein Vintz-Erweiterungspaket untersucht: Manifest, tatsächliche Website-
  und Browserrechte, Hintergrundalarme, Warteschlangenspeicherung und eigener
  Updatecode bleiben unbekannt. Der Webclient kann das nicht ersetzen.
- Keine erfolgreiche neue Kopplung, Profilwechsel, abgelaufene Sitzung,
  Browserneustart oder abgeschalteter Rechner praktisch getestet.
- Keine Migration desselben Kontos zwischen Browser und Cloud; keine sichere
  Übernahme von Regeln, Historie oder offenen Aufträgen nachgewiesen.
- Kein praktischer Parallelbetrieb beider Wege für dieselbe Vinted-Identität;
  globaler Schutz gegen doppelte Nachrichten/Preisaktionen bleibt offen.
- Keine Messung von Serverkosten, Antworttempo, Ressourcenverbrauch oder
  Zuverlässigkeit. `requests` ist kein ausreichender Grund für einen
  Architekturwechsel bei Flipbase.

## Nachweise und Abschluss

Vintz: tatsächlich geladene Quellen `38fzxmdofhtgc.js`, `2atfpqotnbadu.js`,
`2xesihr9dsymb.js`, `3aytnojhurpd2.js` und `1_f4nrn8dk85w.js` unter
`https://vintz.ai/_next/static/chunks/`. URLs, Länge und SHA-256 in den lokalen
[Quellenkennungen](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-extension-cloud-source-identities-2026-10-18.json).
Keine Cookies, Passwörter, geheimen Schlüssel oder vollständigen
Verbindungsantworten exportiert. Keine durchgehende Netzwerkaufzeichnung;
vergangene Aufrufe wurden nicht rekonstruiert.

Belege:
[Browser-Anleitung](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-browser-setup-2026-10-18.png),
[Cloud-Aktivität](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-extension-cloud-activity-2026-10-18.png),
[bereinigte Aktivitätsnotizen ohne Artikelkennungen](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-extension-cloud-activity-2026-10-18.json),
[Flipbase-Cloudkarten](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-cloud-accounts-2026-10-18.png).

Flipbase-Quellen:

- [Manifest](../../tools/flipbase-extension/manifest.json),
  [Hintergrund-Einstieg](../../tools/flipbase-extension/background.js),
  [lokaler Hintergrunddienst](../../tools/flipbase-extension/vinted-local-background.js),
  [lokaler Zeitplan](../../tools/flipbase-extension/vinted-local-scheduler.js),
  [Installations-/Updateanleitung](../../tools/flipbase-extension/README.md).
- [Lokale Freigabeoberfläche](../../src/app/features/marketplaces/components/vinted-local-connect/vinted-local-connect.component.html),
  [Freigabeservice](../../src/app/features/marketplaces/services/vinted-local-extension.store.ts),
  [lokale Serverbindung](../../supabase/schemas/350_marketplace_local_extension.sql),
  [Nachrichtenrouting](../../supabase/schemas/365_marketplace_cloud_message_dispatch.sql).
- [Cloudabschluss und Moduswechsel](../../supabase/schemas/370_marketplace_cloud_setup.sql),
  [Listing-Wechselschutz](../../supabase/schemas/464_marketplace_listing_execution.sql),
  [Workerverdrahtung](../../services/marketplace-worker/src/main.ts),
  [Freischaltungen](../../services/marketplace-worker/src/marketplace-browser-server-config.ts).
- [Cloudnetzwerk](../../services/marketplace-worker/src/chromium-network-profiles.ts),
  [Ausgangsregistrierung](../../services/marketplace-worker/src/register-marketplace-cloud-ip.ts),
  [Syncfehler und Wartezeit](../../supabase/schemas/310_marketplace_sync_scheduling.sql),
  [Browserplatz](../../supabase/schemas/260_marketplace_live_browser_sessions.sql).

Den zunächst fremd geänderten `vinted-local-core.js` aus dem Ausgangscommit
gegengeprüft; nach Integration die Preisänderungen bis `d8993677` gezielt gelesen.
Der Arbeitsstand wurde nicht geändert. Nur Analysedokumentation
ergänzt. Kein Anwendungstest nötig, weil keine Anwendung geändert wurde;
praktische Betriebsnachweise sind auf die beschriebenen Lesezustände begrenzt.
Browseranleitung zurückgesetzt, Flipbase-Dialog abgebrochen und separate Lesetabs
geschlossen. Bestehende Tabs und pausierte Maike-Verbindung unberührt.
**Danach Stopp zur Besprechung.**
