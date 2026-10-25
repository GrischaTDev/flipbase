# Vintz-Neueinstellen und Flipbase im Vergleich

Untersuchung von Juna am 17.10.2026. Auftrag: Neueinstellen bei Vintz genauer
untersuchen, mit Flipbase vergleichen und anschließend stoppen. Keine Umsetzung.
Die Empfehlungen zur Angebotsübersicht sind als Richtung festgehalten; daraus
entsteht keine Veröffentlichungs- oder Umsetzungsfreigabe.

## Ergebnis und Beweisgrenzen

Vintz bietet einen eigenen, kompakten Ablauf für das Neueinstellen: ein einzelnes
Angebot mit Preis, Ablauf, Bildern und Text oder bis zu fünf Angebote gemeinsam
mit Zeitabständen und Starttermin. Flipbase hat derzeit keinen entsprechenden
ausgeführten Vinted-Relisting-Ablauf. Vorhandene Bausteine für Entwürfe, Bilder,
Neuveröffentlichung, Termine und Wiederholschutz sind eine Grundlage.

- **Live beobachtet:** Dialoge unter `https://vintz.ai/listings` im gebuchten
  Prozugang mit einem verbundenen Cloudkonto und fünf aktiven Angeboten. Vier
  Ablaufvarianten, Zeitabstände, Terminwahl, Bild- und Textmasken angesehen.
  Lokale Auswahländerungen anschließend verworfen beziehungsweise zurückgesetzt.
- **Aus geliefertem Vintz-Code gelesen:** Bild-/Beschreibungsabruf, Grenzen,
  Auftragsdaten, Wiederholkennung und Sammelverarbeitung. Das beschreibt den
  Browserpfad; Vintz' Serverausführung ist damit nicht überprüft.
- **Flipbase-Codebefund:** Stand
  `e3ef736370640125c1abddcaf82de6079205d9fa`. Die im vorherigen Schritt betrachtete
  Produktivoberfläche und dieser lokale Stand sind unterschiedliche Belegarten.
  Kein neuer vollständiger Veröffentlichungsversuch und keine Anwendungstests.
- **Nicht ausgeführt:** Neueinstellen, Planungsauftrag, Veröffentlichung,
  Löschen, Kontoübertragung, KI-Bearbeitung, KI-Textgenerierung oder Bild-Upload.
  Bereits das Öffnen der Einzelmaske kann allerdings einen vorbereitenden
  Leseauftrag für Fotos und Beschreibung erzeugen. „Nichts veröffentlicht“
  bedeutet deshalb nicht „keinerlei POST-Anfrage möglich“.

## Vier Varianten mit unterschiedlicher Wirkung auf das Original

| Vintz-Auswahl     | Sichtbar angekündigter Ablauf                               | Konsequenz für die Bewertung                                                                                                                                   |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direkt            | Neues Angebot geht online, danach wird das alte entfernt    | Original soll bis zum neuen Angebot erhalten bleiben. Zwischenzeitliche Dublette und Löschen nach Teilerfolg müssen behandelt werden.                          |
| Nahtlos, Beta     | Erst Entwurf, dann Original entfernen, dann veröffentlichen | Nach dem Entfernen kann ein Fehler vor Veröffentlichung eine Lücke hinterlassen. „Nahtlos“ ist eine Produktbezeichnung, keine belegte Ausfallfreiheit.         |
| Als Entwurf, Beta | Original entfernen, neues als Entwurf speichern             | Endzustand soll ein unveröffentlichtes Angebot sein. Die Kurzbeschreibung belegt nicht, ob der Server den Entwurf schon vor dem Entfernen vollständig sichert. |
| Nur Entwurf, Beta | Original bleibt, neues wird als Entwurf gespeichert         | Kein Ersatz des aktiven Originals. Ein echter nativer Vinted-Entwurf ist trotzdem eine externe Schreibaktion.                                                  |

Nur „Direkt“ trägt in der Maske keinen Beta-Hinweis. Der Standard im geladenen
Code ist `publish_then_delete`, das normale Tempo ist `normal`.

Die primäre Aktion ändert ihre Beschriftung passend zu Veröffentlichung,
Entwurf oder Planung. In der Unterseite „So wird neu eingestellt“ kann bereits
ausgeführt werden; „Zurück“ ist keine notwendige abschließende Kontrollstufe.
Der Hinweis zum Entfernen steht in der Beschreibung, die Schaltfläche selbst
heißt beispielsweise nur „Neu einstellen“. Für Flipbase sollte die Wirkung auf
das Original vor der Bestätigung besonders deutlich bleiben.

## Ein einzelnes Angebot

### Einstieg, Preis und Zielkonto

Der Weg führt über das Menü eines Angebots → „Relisting“. Die kompakte
Übersicht zeigt Artikel, Konto und nach erfolgreichem Laden die Fotoanzahl.
Beim untersuchten Artikel wurden vier Fotos und die vorhandene Beschreibung
geladen. Preis, Ablauf, Fotos und Text bleiben getrennt erreichbar.

- Preis direkt änderbar; Schnellaktionen −5 % und −10 % sichtbar.
- Im Übertragungscode werden Preisänderungen auf Cent gerundet; unveränderte
  Inhalte werden nicht als Textänderung mitgesendet.
- Bei mehreren geeigneten Konten sieht der Code eine Zielkontoauswahl vor.
  Mit dem einen verbundenen Cloudkonto war sie nicht live prüfbar.
- Für ein anderes Zielkonto erlaubt der Einzelpfad nur die Direkt-Strategie;
  die Entwurfsvarianten gelten innerhalb eines Kontos.
- Die Erfolgsmeldung einer Kontoübertragung kündigt an, das Original bis zur
  bestätigten Zielveröffentlichung zu erhalten. Dieser Serverablauf wurde nicht
  ausgeführt und ist deshalb eine angekündigte Absicherung.

### Fotos und Beschreibung werden nachgeladen

Die Maske startet zunächst mit „Wird geladen …“. Der gelieferte Code liest
`/api/seller/multi-accounts/{connectionId}/listing-photos?itemId=…`.
Fehlen vollständige Fotos oder Beschreibung, ist ein POST zum vorbereitenden
Abruf vorgesehen. Danach wird mit Auftragskennung bis zu etwa 75 Sekunden
nachgesehen: zunächst sekündlich, später alle zwei Sekunden. Beim Schließen
bricht der Browser die laufende Beobachtung ab; das belegt keine serverseitige
Auftragsstornierung.

Der Code unterscheidet vollständige und unvollständige Fotos und bietet
Fehlerhinweise beziehungsweise erneuten Abruf an. Das ist für ein gutes
Neueinstellen wichtig: Das Listen-Vorschaubild allein reicht nicht zur
vollständigen Wiederherstellung.

**Grenze:** Die Absende-Sperre verlangt vollständige Bildvorschauen insbesondere
bei Bildänderungen. Ohne Änderungen ist im untersuchten Browserpfad keine
allgemeine Pflicht „vollständige Sicherung fertig, erst dann absenden“ erkennbar.
Der Server kann zusätzliche Sicherungen haben; dessen Verhalten bleibt offen.

### Bildoptionen

| Option              | Aktueller Befund                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bilder ansehen      | Vier Originalbilder mit Nummern, Vor/Zurück und Titelbildkennzeichnung live gesehen                         |
| Titelbild ändern    | Gelieferter Code kann das gewählte Bild an die erste Position setzen; nicht gespeichert oder veröffentlicht |
| Stil                | Original, Hell, Weich, Klar live sichtbar                                                                   |
| Größe               | Original, 1600 px, 2400 px live sichtbar                                                                    |
| Metadaten entfernen | Schalter vorhanden, beim unveränderten Einzelangebot zunächst aus                                           |
| KI je Bild          | Weißer Hintergrund, Studiolicht, Glätten & schärfen, Flatlay sichtbar; nicht ausgelöst                      |
| Vorher/Nachher      | Im gelieferten Code für bearbeitete Bilder vorgesehen; keine Bearbeitung erzeugt                            |
| KI-Kennzeichnung    | Der Code setzt bei verwendeter KI-Fotoänderung `aiPhoto` für den Relisting-Auftrag                          |

**Kostenhinweis präzisiert:** Die erste Textaufnahme zeigte „je 10 Credits“.
Im anschließend gesicherten Bildschirm stand „Free this weekend“. Der Code
schaltet anhand einer geladenen Studioaktion zwischen diesen Anzeigen um.
Zehn Credits sind somit die hinterlegte reguläre Angabe, kein in dieser Sitzung
bestätigter Abzug. Keine KI-Aktion oder tatsächliche Abrechnung geprüft.

Bildverarbeitung erfolgt im Browser vor dem Relisting-Auftrag. Werden Bilder
verändert oder umgeordnet, rendert der Einzelpfad die ausgewählten Bilder und
übergibt JPEG-Dateien zusammen mit den Auftragsdaten. Größen-, Filter- und
Metadatenänderungen sind kein Nachweis, dass Vinted das Angebot anders bewertet.

**Korrektur der älteren Demo-Recherche:** Der
[Audit vom 15.10.2026](../audit/2026-10-15-vinted-listing-layout-relisting.md)
beschrieb automatische Foto-Versionen und Ähnlichkeitsprüfung. Im heute geladenen
Modul ist `PHOTO_VARIATIONS_ENABLED` aus, aktive Einstellungen erzwingen den
manuellen Modus ohne Ähnlichkeitsprüfung, und die Versionsfunktion meldet
„temporarily unavailable“. Diese älteren Demo-Angaben dürfen nicht als aktuell
nutzbare Funktion des untersuchten Live-Ablaufs übernommen werden.

### Text

Titel und Beschreibung sind auf einer eigenen Unterseite vorbefüllt editierbar.
Die HTML-Grenzen betragen 100 beziehungsweise 2000 Zeichen. „Mit KI überarbeiten“
ist vorhanden, wurde aber nicht ausgelöst.

Der gelieferte Code beschreibt einen separaten Generierungsaufruf an
`/api/seller/listing-variants`. Vorschlag und Original werden anschließend
gegenübergestellt; Titel, Beschreibung oder beide Änderungen können übernommen
oder verworfen werden. Das ist eine sinnvolle Kontrollstufe vor einer
KI-Textübernahme, deren Ergebnisqualität hier nicht geprüft wurde.

## Zeitplanung und mehrere Angebote

| Punkt         | Vintz-Befund                                                                            |
| ------------- | --------------------------------------------------------------------------------------- |
| Start         | Jetzt oder später; lokales Datum-/Uhrzeitfeld                                           |
| Vorlauf       | Geladener Code begrenzt auf 14 Tage und enthält Vergangenheits-/Datumsprüfung           |
| Sofort        | 0 Sekunden Abstand                                                                      |
| Zügig         | 90–120 Sekunden                                                                         |
| Normal        | 90–180 Sekunden                                                                         |
| Vorsichtig    | 120–240 Sekunden                                                                        |
| Einzelangebot | Tempoauswahl nur bei „Nahtlos“ als Pause vor Veröffentlichung sichtbar                  |
| Sammelauftrag | Tempoauswahl als Abstand zwischen Artikeln auch bei „Direkt“ sichtbar                   |
| Menge         | Fünf Angebote live im Dialog; Code begrenzt Sammel-Neueinstellen auf fünf               |
| Konten        | Jedes ausgewählte Angebot bleibt beim Sammel-Neueinstellen in seinem eigenen Cloudkonto |

Der Sammeldialog zeigt Artikel, Konto und Preis. Eine Bearbeitung jedes einzelnen
Titels, Preises oder Fotos ist in dieser Prüfmaske nicht vorgesehen. Diese
Möglichkeiten der Einzelmaske dürfen nicht als Sammelbearbeitung ausgegeben
werden.

Der Browser berechnet die folgenden Startzeitpunkte mit zufälligen Abständen
innerhalb der gewählten Spanne. Bei fünf Artikeln im normalen Tempo liegen
erster und fünfter geplanter Start damit ungefähr sechs bis zwölf Minuten
auseinander. Das sind geplante Startabstände; tatsächliche Laufzeiten,
Serververzögerungen und ein garantiert serieller Abschluss sind nicht belegt.

Vintz zeigt bei der geprüften Terminwahl keine eigene Zeitzonenauswahl und keine
Regel für verpasste Termine. Der Browser wandelt die lokale Eingabe in einen
ISO-Zeitpunkt um. Die Quellprüfung belegt die 14-Tage-Grenze; die versuchte
Änderung auf einen zu späten Termin lieferte keine ausreichend konsistente
UI-Beobachtung für einen gesonderten bestandenen Validierungstest.

Strategie und Tempo können im Einzelpfad bereits beim Ändern im lokalen
Browserspeicher erhalten bleiben, auch wenn anschließend abgebrochen wird.
Darum wurden „Direkt“, „Normal“ und „Jetzt“ wiederhergestellt. Ein Starttermin
wird über diesen Präferenzschlüssel nicht dauerhaft gespeichert.

## Auftragsannahme, Wiederholschutz und Fehler

Die gelesene Auftragsübergabe verwendet
`POST /api/seller/multi-accounts/{connectionId}/relist` mit Originalkennung,
Zielkonto, geänderten Inhalten, Ausführungsmodus `requests` und Anfragekennung.
Abweichende Strategie, Termin und bei „Nahtlos“ das Tempo werden ergänzt;
bearbeitete Fotos gehen als Formular mit Dateien mit. Das belegt die
Client-Schnittstelle, keine abgefangene oder erfolgreiche Relisting-Ausführung.

- Gleiche Eingaben verwenden im Browser dieselbe Anfragekennung aus dem
  Sitzungsspeicher. Sie hängt unter anderem von Quellartikel, Abgleichsstand,
  Zielkonto und Änderungen ab. Nach angenommener HTTP-Antwort wird sie entfernt.
  Serverseitige dauerhafte Wiederholsicherheit ist damit noch nicht bewiesen.
- Laufendes Absenden wird lokal gesperrt. Auswahl berücksichtigt aktive,
  verbundene, innerhalb von 24 Stunden synchronisierte Artikel und blockiert
  bekannte offene Aufträge mit `queued`, `running` oder `needs_review`.
- Beim Sammel-Neueinstellen werden die Anfragen nacheinander gestellt.
  Angenommene Einträge verschwinden aus der Auswahl, Fehler bleiben artikelweise
  mit Konto und Grund erhalten. „Eingereiht“ ist nicht „neu veröffentlicht“.
- Der untersuchte Annahmepfad prüft primär HTTP-Erfolg. Er belegt keine
  abgeschlossene neue Veröffentlichung, bestätigte Entfernung des Originals
  oder vollständige Wiederherstellung nach Teilerfolg.

Die Oberfläche kennt einen Zustand für erforderliche Nachprüfung. Wie Vintz
einen verlorenen Ergebnisbeleg, „neu erstellt, alt noch vorhanden“ oder
„alt entfernt, neu fehlgeschlagen“ konkret auflöst, bleibt ohne echten
Ausführungsfall und Serversicht offen.

## Flipbase: vorhandene Bausteine und fehlender Zusammenhang

| Bereich                      | Tatsächlicher Flipbase-Codebefund                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Vinted-Neueinstellen         | Kein eigener zusammenhängender UI-/Auftrags-/Ausführungspfad gefunden                                            |
| Neue Vinted-Veröffentlichung | Vorhanden, mit Cloudkonto und zusätzlicher Serverfreigabe; keine pauschale Aussage zur produktiven Freischaltung |
| Original behandeln           | Keine Originalkennung plus Lösch-/Ersetzstrategie im vorhandenen Neuanlageauftrag                                |
| Native Vinted-Entwürfe       | Typ `vinted_draft` existiert, der Browser-Ausführer lehnt ihn derzeit ausdrücklich als nicht unterstützt ab      |
| Interne Entwürfe             | Versionierte Flipbase-Inhalte, gespeicherte Bilder, Reihenfolge und festes Zielkonto vorhanden                   |
| Planung                      | Einzeltermin mit ausdrücklicher Zeitzone, Zeitumstellungsbehandlung und Regel für Ausfall vorhanden              |
| Mehrere Artikel              | Auswahl vorhanden; keine entsprechende Sammel-Neueinstellung oder Zeitabstandssteuerung                          |
| Wiederholschutz              | Identische Anfragekennung, Anfragehash und Sperre offener/unklarer Aufträge desselben Entwurfs vorhanden         |
| Ergebnisbeleg                | Neuer Artikel, richtiges Konto, Inhalte, Fotos und aktiver Zustand werden für die Neuanlage geprüft              |
| Unklarer Ausgang             | Nach Schreibbeginn keine automatische neue Veröffentlichung; `outcome_unknown` bleibt zur Klärung erhalten       |

Die vorhandenen Sicherungen für eine Neuanlage sind wertvoll. Sie verhindern
noch keine Dublette über einen anderen Entwurf und verknüpfen noch kein altes
mit einem neuen Vinted-Angebot.

Vor dem ersten Foto-Upload wird der Schreibbeginn dauerhaft bestätigt. Der
vorhandene Vinted-Ausführer verlangt außerdem, dass die Zusatzoption `bump`
ausgeschaltet ist. Das ist ein konkreter Schutz vor dieser Zusatzoption,
keine umfassend nachgewiesene Kontrolle sämtlicher möglicher Gebühren.

**Nicht mit Kleinanzeigen verwechseln:** Das ältere Flipbase-Feature `/listings`
hat „Inserat erneut einstellen“. Dort muss der Nutzer ausdrücklich bestätigen,
dass das alte Kleinanzeigen-Inserat bereits entfernt wurde. Danach werden die
Inhalte vorbereitet und an die Erweiterung übergeben. Das ist weder ein
Vinted-Relisting noch eine automatische Entfernung oder bestätigte neue
Veröffentlichung.

## Empfehlungen für die gemeinsame Besprechung

1. **Die kompakte Vorbereitung übernehmen:** Artikel und Konto, Preis,
   Ablauf, Fotos und Text in einer verständlichen Übersicht. Bestehende
   Flipbase-Komponenten und verbindliche Gestaltung weiterverwenden.
2. **Zunächst einen klar abgesicherten Ersatzablauf planen:** Quelle vollständig
   sichern, neues Angebot nachweislich bestätigen, erst danach das Original
   entfernen. Falls die Entfernung scheitert, beide Kennungen zeigen und diesen
   Schritt gezielt klären. Keine blinde neue Veröffentlichung starten.
3. **Beta-Varianten nicht automatisch mit übernehmen:** „Nahtlos“ und „Als
   Entwurf“ können das Original vor dem fertigen neuen aktiven Angebot entfernen.
   Nutzen und Wiederherstellung müssen vor einer Freigabe geklärt sein.
   „Nur Entwurf“ setzt zunächst eine verifizierte native Vinted-Entwurfsfunktion
   voraus.
4. **Termine und kleine Sammelaufträge ergänzen, wenn der Einzelablauf trägt:**
   Zielkonto, Alt-/Neu-Zuordnung, Einzelresultat, Abbruch und verpasste Termine
   müssen nachvollziehbar bleiben. Flipbases ausdrückliche Zeitzone erhalten.
   Vintz' Fünfergrenze und Tempoangaben sind Referenzen, keine begründete
   technische Grenze oder Sicherheitsempfehlung für Flipbase.
5. **Bild- und Textänderungen bewusst bestätigen:** Originale erhalten,
   Titelbildwahl und Vorschau anbieten, KI-Vorschläge getrennt übernehmen und
   aktuelle Kosten vor einem KI-Auftrag eindeutig nennen. Keine Garantie
   zur Vinted-Erkennung aus Filtern oder Metadatenänderungen ableiten.
6. **Verlauf über das Neueinstellen erhalten:** Alt und Neu verknüpfen und
   klar anzeigen, welche Historie intern weitergeführt wird. Übernahme alter
   Vinted-Aufrufe, Favoriten, Gespräche oder Angebotskennungen wurde nicht
   nachgewiesen und darf nicht versprochen werden.

Vor einer späteren Umsetzung bleiben zu klären: vollständige Sicherung aller
Fotos/Felder, zwischenzeitlicher Verkauf, Teilfehler beim Entfernen,
Wiederaufnahme nach Verbindungsabbruch, Kontrolle geplanter Aufträge und
Abgrenzung zur wiederkehrenden Automatisierung. Ein Auto-Relist-Modell ist im
geladenen Code erkennbar; seine Aktivierung und eigene Bedienung wurden in
diesem Schritt nicht untersucht.

## Quellen und Bildschirmbelege

Gezielt gelesener, bereits im Browser geladener Vintz-Code; keine fremden
Quelltexte in das Repository übernommen:

| Modul                                                   | SHA-256 des UTF-8-Quelltexts                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `https://vintz.ai/_next/static/chunks/06s0-dtw1aw-c.js` | `1734475e61a659b48dbc9045732f69257ef66b80073efd84e68b33e5ef45eb8a` |
| `https://vintz.ai/_next/static/chunks/2cjn1m-e122cd.js` | `3422fb853a5957f49307d9bf83a69046a62348977b6fdc9df6404d590edccb46` |
| `https://vintz.ai/_next/static/chunks/2qk7k3fdycnvp.js` | `01fdae84a480215c6169f71b9ffecb07e8397d039705ad987484b6e4c2246083` |

Erstes Modul: Einzelmaske, Abruf von Fotos/Beschreibung, Auftrag und Sammelpfad.
Zweites Modul: Strategien, Zeitspannen und 14-Tage-Grenze.
Drittes Modul: Bildoptionen, Aktionshinweis für KI und deaktivierte Foto-Versionen.

Relevante Flipbase-Stellen:

- [Auftragsmodell und Wiederholschutz](../../supabase/schemas/463_marketplace_listing_jobs.sql).
- [Tatsächlicher Vinted-Ausführer](../../services/marketplace-worker/src/vinted-browser-listing-submit.ts)
  und [Behandlung des Schreibbeginns und unklarer Ergebnisse](../../services/marketplace-worker/src/marketplace-listing-runner.ts).
- [Veröffentlichungsvorschau](../../src/app/features/marketplaces/components/vinted-listing-publication-preview/vinted-listing-publication-preview.component.ts).
- [Zeitzone und Ausfallregel](../../src/app/features/marketplaces/components/vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component.html).
- [Bildspeicherung](../../src/app/features/marketplaces/services/vinted-listing-image.service.ts)
  und [begrenzte Quellübernahme zu Kleinanzeigen](../../src/app/features/marketplaces/services/listing-transfer.service.ts).
- [Separater Kleinanzeigen-Ablauf](../../src/app/features/listings/pages/listing-overview/listing-overview.component.ts).

Lokale Bildschirmbelege außerhalb des Repositorys:

- [Vier Relisting-Varianten](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-relisting-strategies.png).
- [Bildoptionen einschließlich Aktionshinweis](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-relisting-photos.png).
- [Sammelauftrag mit fünf Artikeln](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-relisting-bulk.png).

## Abschluss dieses Schritts

### Nachtrag: vom Nutzer vorgemerkten Auftrag abbrechen

Nach der Untersuchung hat der Nutzer selbst das Mares-Angebot zum Neueinstellen
vorgemerkt und nach einer Rücknahme gefragt. Live erscheint am Artikel
„Vorgemerkt / Neu einstellen“; unter Vinted-Konten → Aktivität & Fehler steht
der zugehörige Auftrag auf „In Warteschlange“. Das bestätigt keine bereits
begonnene neue Veröffentlichung.

Im Artikelmenü, im übergreifenden Angebotsmenü und in der Kontoaktivität ist
für diesen Auftrag keine Abbruchaktion sichtbar. Die zentrale Anzeige
„Handlungsbedarf“ liefert dafür ebenfalls keinen Zugang. Geladener Code enthält
jedoch `MultiAccountJobDismiss`: wartende Aufträge können nach „Auftrag
abbrechen?“ / „Ja, abbrechen“ über den vorhandenen
`/api/seller/multi-accounts/jobs/{jobId}/dismiss`-Pfad storniert werden.
Eine tatsächlich erfolgreiche Stornierung ist nicht geprüft.

Die separate Auftragsliste der Angebotsübersicht filtert Aufträge aus, deren
Zielartikel noch regulär im Bestand steht. Dort ist die Abbruchkomponente
eingebunden; am geprüften Bestandsartikel fehlt sie. Das erklärt die beobachtete
Bedienlücke im untersuchten Browserpfad. „Angebot löschen“ bezeichnet dagegen
die Entfernung des Vinted-Inserats und ist kein Ersatz für Auftragsabbruch.

Keine Stornierung oder Entfernung ausgelöst. Für Flipbase als zusätzlichen
Prüfpunkt festhalten: direkt am vorgemerkten Artikel verständlich abbrechen
können und den bestätigten Abbruch anzeigen. Keine Umsetzungsfreigabe.

Alle Dialoge geschlossen, Auswahl geleert, Vintz weiterhin bei allen Konten,
aktiven Angeboten, leerer Suche und Listenansicht. Strategie/Tempo auf
Direkt/Normal zurückgestellt, kein Termin beauftragt. Keine Veröffentlichung,
Entfernung, KI-Aktion oder Produktumsetzung. Flipbases pausierte Verbindung
unverändert. Nur Dokumentation; Markdown-Formatierung und Unterschiedskontrolle
werden für diese Dateien ausgeführt. Kein Anwendungstest erforderlich.

**Stopp zur Besprechung.** Die Empfehlungen in diesem Bericht sind Vorschläge
und noch nicht als Umsetzung freigegeben.
