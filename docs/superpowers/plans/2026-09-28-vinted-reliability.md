# Vinted: zuverlässige und schnelle Kontoverwaltung

> For agentic workers: Use superpowers:executing-plans for task-by-task execution.
> Entscheidungs- und Arbeitsplan auf ausdrücklichen Nutzerwunsch. Die Umsetzung
> wurde am 28.09.2026 beauftragt; eine Veröffentlichung ist nicht freigegeben. Offene Anbieterbefunde werden
> durch Untersuchung geschlossen, nicht durch erfundene Endpunkte oder Statuscodes.

**Goal:** Verlässliche Aktualisierung, richtige Verkaufszuordnung und eindeutig
bestätigte Bearbeitung mit unmittelbar verständlichem Fortschritt.

**Architecture:** Vorhandene Angular-Oberfläche, Kontorechte, Supabase-Daten und
GoLogin-Profile erhalten. Persistente Aufträge statt minutenlanger HTTP-Anfragen;
gespeicherte Ansichten statt Browserstart beim Anzeigen jedes Details. Begrenzte
Wiederverwendung eines kontogebundenen Browsers nach Messung und Kostenprüfung.

**Tech Stack:** Bestehendes Angular, TypeScript, Supabase, Playwright und GoLogin.
Keine neue Browser-Engine, keine zusätzliche Bibliothek für diesen Plan.

**Spec:** [Bestehender Produktvertrag](../specs/2026-09-26-vinted-marketplace-design.md),
ergänzt durch die Nutzeranforderungen vom 28.09.2026 zu Zuverlässigkeit,
Ladezeiten, Verkaufszuordnung und Fortschrittsmodal.

## Umsetzungsstand vom 28.09.2026

Im Arbeitszweig umgesetzt: getrennte Profilrouten, strengere Verkaufsprüfung,
kontogebundene Beschreibungscaches, lesender Konfliktcheck vor Profiländerung,
spätere Werteprüfung nach Speicherklick, dauerhaft gespeicherter manueller
Synchronisationsauftrag und Fortschrittsmodal mit echten Schritten. Der Import
spart doppelte Navigation und den doppelten Profilabruf. Unveränderte gelesene
Chats nutzen ihre gespeicherte Detailversion höchstens 24 Stunden; ungelesene
Chats werden weiterhin nicht geöffnet. Der Start begrenzt die Historie nach
20 Seiten, ohne den früheren zusätzlichen Abbruch bei 100 Gesprächen.

Noch offen: Live-Abgleich des fraglichen Artikels und realer Statusvarianten,
unabhängige Quelle für vollständige Verkäufe, atomare Übernahme je Datenbereich,
Teilerfolg bei einem Lesefehler, Wiederaufnahme nach Worker-Neustart,
Browserwiederverwendung mit Kapazitätsmessung und Live-Abnahme der
Schreibbestätigung. Die bisherige Auftragswiederherstellung markiert einen
unterbrochenen Auftrag als fehlgeschlagen; sie setzt ihn nicht automatisch fort.
Der Fortschrittsdialog zeigt nur vollständige Erfolge. Automatische Aktualisierung,
neue Inserate und Nachrichtenversand bleiben spätere Pakete.

## Global Constraints

- Admin-Pilot, unveränderliche Workspace-/Kontobindung und erneute Rechteprüfung.
- Keine Passwörter, Cookies, Provider-Token oder Benutzer-Bearer-Token in Aufträgen,
  Protokollen oder Repository speichern. Hintergrundrechte serverseitig prüfen.
- Keine ungefragten Live-Schreibversuche oder automatische Wiederholung bei
  unbekanntem Schreibausgang. Zusätzliche Anmeldung als eigenen Zustand behandeln.
- Bestehende Shared Components, ModalShell und Markenakzent `#fcc601` verwenden.
- Schema deklarativ, Migration erzeugen und Typen aktualisieren, sobald Paket 4
  umgesetzt wird.
- Keine isolierten Dokumentations-PRs; Dokumentation mit der Umsetzung übernehmen.

## Bestätigte Befunde

Untersucht: `origin/master` bei `dbf45d80`; der laufende Worker verwendet
`1c7b65752c95653d17fe30ddb51a6bcc05d7ca1f`. Read-only-Betriebsprüfung:
Container gesund, keine Neustarts, in den letzten sechs Stunden keine Logzeilen.
Keine Vinted-Sitzung gestartet und keine Profildaten verändert.

| Beobachtung                       | Nachweis im Code                                                                                          | Konsequenz                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Viele Wartephasen                 | `marketplace-browser-http-api.ts`: jedes Lesen/Speichern öffnet und schließt den Browser                  | Detail öffnen, Editor öffnen und Speichern bezahlen den Start jeweils erneut                     |
| Zusätzliche Navigation            | `main.ts` öffnet `/`; `readVintedAccountImport` navigiert erneut nach `/`                                 | Ein Import enthält einen redundanten Seitenaufruf                                                |
| Zusätzlicher Profilabruf          | Identitätsprüfung und Profilimport laden beide `/api/v2/users/current`                                    | Dieselbe Quelle wird unmittelbar zweimal angefragt                                               |
| Langsamer Vollimport              | `vinted-account-import.ts`: alle gelesenen Gespräche und Transaktionen werden seriell erneut geladen      | Arbeit wächst mit der gesamten Historie; über 100 Gespräche wird abgebrochen                     |
| Alles-oder-nichts beim Lesen      | Ein fehlgeschlagenes Gespräch verwirft das gesamte gelesene neue Importergebnis                           | Erfolgreiche andere Bereiche erreichen den Writer nicht                                          |
| Schreiben nicht atomar            | `supabase-vinted-import-writer.ts`: mehrere Upserts und Bereinigungen nacheinander                        | Ein Speicherfehler kann bereits teilweise erneuerte Daten hinterlassen                           |
| Falsche Verkaufsannahme           | Parser verlangt `order` als Objekt, aber keinen belegten Verkaufszustand                                  | Auch `{}` genügt; Angebot/abgebrochen/bezahlt werden nicht sauber unterschieden                  |
| Alte Fehlklassifikation bleibt    | Writer entfernt fehlende Inserate/Gespräche, aber keine alten Verkaufszeilen                              | Ein Parserfix allein bereinigt falsch importierte Altverkäufe nicht                              |
| Beschreibungen fehlen absichtlich | Parser setzt `text: null`; Detail lädt das Bearbeitungsformular und hält Beschreibung nur lokal           | Jeder neue Besuch kann einen Browserstart auslösen                                               |
| Unsichere Speicherbestätigung     | Profil wartet 1000 ms, Inserat 1200 ms, danach neue Navigation und Feldvergleich                          | Speicherdauer und Antwort werden nicht gezielt abgewartet; echte Ursache des Nutzerfehlers offen |
| Falsche Fehlermeldung             | Beide Speicherwege verwenden `VintedEditUnconfirmedError` mit „Prüfe den Artikel“                         | Profilfehler erhält einen Artikelhinweis; auch Fehler vor dem Klick heißen unbestätigt           |
| Zu wenig Diagnose                 | Kein Zeit-/Fehlerprotokoll; Import verliert Ursache; Broker übersetzt Operationsfehler in Sitzungsabbruch | 403, Zeitlimit, Formfehler, Start und Stopp sind nachträglich nicht zuverlässig unterscheidbar   |

Lokale Reproduktion mit künstlichen Daten und echtem Parser: ein aktives Inserat,
eine Transaktion mit `order: {}` und Status „Angebot“ ergaben gleichzeitig
`activeListings: 1`, `sales: 1`. Eine übergebene Beschreibung ergab `null`.
Das belegt die Parserlücken, **nicht** den tatsächlichen Vinted-Status des
vom Nutzer genannten Polo-Artikels. Dessen exakte Herkunft muss Paket 2 abgleichen.

Der erste fehlgeschlagene Abruf und der Profil-Speicherfehler sind nicht live
reproduziert. Neustart/Kaltstart, Vinted-Ablehnung, verspätete Seite, Rechteablauf
und fehlgeschlagener Browserstopp bleiben unterscheidbare Hypothesen. Größere
Timeouts oder pauschale Wiederholungen sind ohne Messung keine Lösung.

## Recherche und Entscheidung

1. [GoLogin SDK](https://github.com/gologinapp/gologin) dokumentiert Profilstart,
   Browserverbindung und Stoppen. [Cloud Browser](https://gologin.com/cloud-browser/)
   stellt eine Playwright-/Puppeteer-Verbindung zu persistenten Profilen bereit.
   Daraus folgt keine Vinted-spezifische Garantie für Daten oder Schreibaktionen.
2. [Dotb Multi-Account Chat](https://dotb.io/docs/multi-account-chat) benötigt eine
   aktivierte Erweiterungsbrücke. [Revendor](https://revendor.app/guide/messages-in-the-extension)
   beschreibt Weiterleitung von Nachrichten und wartende Aufträge bei offline
   befindlicher Erweiterung. Das sind Herstellerbeschreibungen, keine unabhängig
   gemessenen Leistungswerte oder Belege ihrer internen API-Implementierung.
3. [Vinted Scraper](https://github.com/Giglium/vinted_scraper) dokumentiert den
   Wechsel vom mit 403 antwortenden Artikel-JSON-Endpunkt zu öffentlichen
   Seitenmetadaten. Der Such-/Artikelleser liefert keine vollständige Verwaltung
   angemeldeter Konten. Fremde private Endpunkte nicht ungeprüft übernehmen.
4. [Vinted Pro Integrations](https://pro-docs.svc.vinted.com/) bietet Artikel,
   Bestellungen und Webhooks, ist aber auf freigeschaltete Pro-Unternehmen
   beschränkt. Für das bestätigte Privatkonto ist dies derzeit kein Ersatz.
5. [Playwright Netzwerkbeobachtung](https://playwright.dev/docs/network) ermöglicht
   das Warten auf konkrete Browserantworten. Dies ist die Grundlage für
   nachvollziehbare Speicherbestätigung anstelle fester Schlafzeiten.

**Empfehlung:** GoLogin zunächst behalten. Flipbase erhält eine Auftragssteuerung
und gezielte Datenleser. Ein Wechsel auf lokale Orbita-Browser wäre eine spätere,
gemessene Betriebsoption innerhalb derselben Adaptergrenze, falls Cloudstart oder
Kosten dominieren. Eine Erweiterung wäre eine Produktänderung, weil der Browser
des Nutzers verfügbar sein müsste. Kein Anbieterwechsel ohne Vergleichsmessung.
Für Vince AI wurde keine belastbare technische Primärdokumentation gefunden;
aus einem Ankündigungsvideo lassen sich weder Latenzen noch innere Abläufe ableiten.

## Vertiefter Produktvergleich vom 28.09.2026

Auf erneute Nutzerfrage die konkreten Anbieterabläufe geprüft. Alle folgenden
Funktionen sind Herstellerangaben aus deren Dokumentation, keine selbst
ausgeführten Produkt- oder Zuverlässigkeitstests.

| Anbieter  | Dokumentierter Funktionsumfang                                                                                                                                                                                | Dokumentierter Ausführungsweg                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dotb      | Inserat im Dashboard für ausgewähltes Konto vorbereiten; Fotos, Titel, Beschreibung, Kategorie und Preis; Sammelbearbeitung unter anderem von Preis, Text, Marke, Größe, Farbe und Material; gemeinsame Chats | Dashboard speichert Entwurf, Erweiterung übernimmt ihn in Vinted; Chat benötigt Erweiterungsbrücke                                                          |
| Revendor  | Mehrere Vinted-Konten, vollständiger Inseratentwurf, Veröffentlichung sofort/geplant, Auftragsliste; getrennte Synchronisationsstände                                                                         | Ein Browserprofil und eine Erweiterungsinstanz je Konto; Dashboard-Aufträge nennen Zielkonto; offline wartet der Auftrag                                    |
| Crosslist | Neue Inserate erstellen und einzeln oder gesammelt im Hintergrund veröffentlichen                                                                                                                             | Dokumentierte Warteschlange mit serieller Veröffentlichung; mobil muss Anwendung offen bleiben; mehrere Marktplätze belegen keine Mehrfachkonten auf Vinted |
| Zipsale   | Aktive Inserate einschließlich Fotos und Beschreibung importieren; Crosslisting                                                                                                                               | Für Vinted Desktop-Chrome-Erweiterung und angemeldetes Marktplatzkonto im Browser erforderlich                                                              |
| Rello     | Vinted-Bestand importieren, Preis/Marke/Status gesammelt ändern, Entwürfe und geplante Veröffentlichung                                                                                                       | Chrome-Erweiterung; Mehrfachkonten durch diese Produktseite nicht belegt                                                                                    |

Konkrete Quellen:

- [Dotb Erstellung](https://dotb.io/docs/dashboard-listing-creator),
  [Bearbeitung](https://dotb.io/docs/bulk-edit),
  [Chat](https://dotb.io/docs/multi-account-chat).
- [Revendor Kontomodell](https://revendor.app/guide/how-multi-account-works),
  [Inseraterstellung und Aufträge](https://revendor.app/guide/the-poster),
  [Synchronisation](https://revendor.app/guide/settings-and-sync).
- [Crosslist Veröffentlichung](https://docs.crosslist.com/getting-started/listing-new-inventory).
- [Zipsale Einrichtung](https://zipsalehelp.zendesk.com/hc/en-gb/articles/4405228303633-Getting-Started-Guide).
- [Rello Produktumfang](https://relloapp.io/).

Revendor dokumentiert kontinuierliche Nachrichtenerkennung, alle 15 Minuten
einen Abgleich der anderen Bereiche und Übertragung geänderter Daten. Ein
Fehler pro Datentyp hält die anderen nicht auf. Das belegt keine konkrete
private Vinted-API oder garantierte Echtzeitfähigkeit für Flipbase, liefert aber
ein direktes Vorbild für getrennte Aktualisierungszustände und Teilfehler.

Ableitung für Flipbase: Revendor als Ablaufreferenz, Dotb als Referenz für
Inseratfelder/Bearbeitung und Crosslist als Referenz für die Auftragsanzeige.
Die lokale Erweiterungsbrücke ersetzen wir im vorgeschlagenen eigenen Modell
durch den bereits vorhandenen serverseitigen GoLogin-/Playwright-Adapter.
Belegter Funktionsumfang anderer Anbieter ersetzt keine eigene Ende-zu-Ende-Abnahme.

## Ergebnis der unabhängigen Review-Runde

Drei vom Nutzer beauftragte Agenten prüften Architektur, Daten/Schreiben und
externe Anbieter. Ihre Befunde wurden am Code bzw. den verlinkten Quellen
abgeglichen. Keine Implementierung oder Livekontoprüfung in dieser Runde.

**Bestätigt:** Gespeicherte Ansichten, kontogebundene Aufträge, nachvollziehbarer
Fortschritt und begrenzte Browserwiederverwendung passen zum Produktziel.
**Geändert:** Bestehendes Speichern vor dem größeren Auftragsumbau korrigieren;
Wiederverwendung erst nach getrennter Autorisierungsprüfung und serieller
Ausführung. Ein einzelner Worker bleibt zunächst die Betriebsgrenze.

Neue Quellen und ihre Grenzen:

- [Dotb Public API](https://dotb.io/docs/api-reference) und
  [OpenAPI-Vertrag](https://dotb.io/api/public/v1/openapi.json) sind öffentlich
  abrufbar. Sie dokumentieren Entwürfe, Fotos, Konten/Brückenstatus, Bestellungen
  und kategorieabhängige Formularoptionen. Die API arbeitet mit Dotb-Daten;
  Veröffentlichung erfolgt über die Erweiterung. Als Vertragsreferenz wertvoll,
  als Zukauf nur ein Teilersatz mit zusätzlicher Anbieterabhängigkeit. Keine
  API-Aufrufe an private Konten oder Abonnements für diese Untersuchung.
- [VinDrop Cloud](https://vindrop.me/guide/cloud) beschreibt serverseitige
  Automatisierung bei ausgeschaltetem PC. Das macht Cloudbetrieb zu einem
  dokumentierten Wettbewerbsmodell; die knappe Anleitung ohne fertige Videodemo
  belegt weder Zuverlässigkeit, technische Infrastruktur noch Integrations-API.
- [Revendor Sync](https://revendor.app/guide/settings-and-sync) belegt die
  Übertragung geänderter Daten **zum Dashboard**. Daraus lässt sich kein
  sparsamerer Abruf **bei Vinted** ableiten. Unser geplanter inkrementeller
  Vinted-Abruf braucht eigene Messung und nachgewiesene Änderungsmerkmale.
- [GoLogin Cloud-FAQ](https://support.gologin.com/en/articles/15737249-faq-web-app-cloud-browser)
  beschreibt 15 Minuten Inaktivitätsdauer für den Web-/Cloudbrowser. Das ist
  keine bestätigte CDP-Vertragsgarantie für unseren Adapter. Eigener Stopp,
  Maximaldauer und Kapazitätsgrenze bleiben erforderlich.
- [Supabase Queues](https://supabase.com/docs/guides/queues) ist eine mögliche
  Postgres-basierte Alternative. Für den Pilot bevorzugen wir das vorhandene
  Projektmuster mit atomaren SQL-Aufträgen (`50_sniper.sql`,
  `106_sniper_watchlists.sql`), um keine weitere Komponente einzuführen.
  Die garantierte Nachrichtenzustellung innerhalb eines Sichtbarkeitsfensters
  garantiert keine einmalige externe Vinted-Schreibwirkung.
- [Playwright](https://playwright.dev/docs/api/class-page#page-wait-for-response)
  unterstützt das Registrieren der Antwortprüfung vor der Aktion. Eine beliebige
  HTTP-200-Antwort genügt nicht; Operation, Konto und zurückgelesener Inhalt
  müssen zu dem konkreten Speicherversuch passen.

Zusätzliche Produktideen für das spätere Erstellen von Inseraten:

- Ein vollständiger, gespeicherter Entwurf mit landes-/kategorieabhängigen
  Pflichtfeldern, Fotos und Vorschau. Änderungen der Kategorie invalidieren
  unpassende Größen-/Merkmalswerte; fremde Dotb-Schemas sind nur eine Referenz.
- Getrennte Zustände: Entwurf in Flipbase gespeichert, Veröffentlichung wartet,
  an Vinted gesendet, externes Inserat mit ID bestätigt. Erst die letzte Stufe
  heißt veröffentlicht. Nach unklarem Ausgang erst auf ein bestehendes Inserat
  abgleichen, nie durch erneutes Senden ein Duplikat riskieren.
- Kontostatus unterscheidet verbunden, Browser verfügbar, beschäftigt und
  erneute Anmeldung nötig. Ein schlafender Browser bedeutet nicht abgemeldet.
- Schließbares Fortschrittsmodal plus wiederauffindbarer letzter Auftrag.
  Bedienaktionen haben vor noch nicht begonnenem Hintergrundabgleich Vorrang;
  ein laufender Schreibvorgang wird dafür nicht unterbrochen.

## Review Focus

- Konto-/Workspacewechsel, Rechteentzug und abgelaufene Anmeldung während eines Auftrags.
- Aktives Inserat mit Angebot, abgebrochener Bestellung oder altem falschem Verkauf.
- Prozess-/Netzabbruch nach erfolgtem Speicherklick, aber vor Rückmeldung.
- Ein fehlerhafter Importbereich und mehrere Seiten mit verspäteten Antworten.
- Doppelter Klick, zweiter Tab und abgelaufene Sperre bei noch laufendem Browser.

## Paket 1: Messbaren Ablauf herstellen

**Dateien:** `services/marketplace-worker/src/marketplace-browser-http-api.ts`,
`marketplace-browser-session-broker.ts`, `gologin-cloud-browser.ts`,
`vinted-account-import.ts`; zugehörige bestehende Tests in `test/`.
Neue fokussierte Datei: `services/marketplace-worker/src/marketplace-operation-events.ts`.

- [ ] Pro Auftrag zufällige Korrelations-ID, Operation, feste Phase, Dauer,
      Ergebnis und normierten Fehlercode erfassen. Nur erlaubte Felder ausgeben,
      keine URLs mit Token, Antwortkörper, Inhalte oder externen Personen-IDs.
- [ ] Start, Seitenbereitschaft, Identität, Datenbereiche, Persistenz und Stopp
      getrennt messen; Rückmeldung mit Korrelations-ID versehen.
- [ ] Profilrouten strikt trennen: `/read` akzeptiert keinen `about`-Inhalt und
      kann niemals `updateProfileAbout` ausführen. `/save` validiert seinen
      eigenen Vertrag. Aktuell entscheidet der Inhalt statt der Route über
      Schreiben; die Längenprüfung greift nur auf `/save`. Regression mit
      künstlichem Payload: `/read` plus `about` wird vor Browserstart abgelehnt.
- [ ] Test: künstlicher Providerfehler mit Geheimnis im Text darf ausschließlich
      Phase/Fehlerklasse ausgeben; ein fehlgeschlagener Stopp darf einen bereits
      bestätigten Schreibausgang nicht in „nicht gespeichert“ umdeuten.
- [ ] Ersten und zweiten ausdrücklichen lesenden Abruf am eigenen Konto messen;
      kalten und wiederverwendeten Browserstart vergleichen. Kein Neustart des
      Produktionsdienstes nur zur Messung; Kaltstart auf eigener Testumgebung.

**Abnahme:** Ein erneuter Fehler benennt seine Phase und technische Fehlerklasse.
Erst mit den Ergebnissen Entscheidungen zu Start-/Netzproblemen treffen.

## Paket 2: Verkaufsstatus und gespeicherte Inhalte korrigieren

**Dateien:** `vinted-account-import.ts`, `supabase-vinted-import-writer.ts`,
deren Tests; `src/app/features/marketplaces/services/marketplace-api.service.ts`,
`marketplace-account.store.ts` und `components/vinted-listing-detail/`.

- [ ] Gespeicherten fraglichen Vorgang gezielt mit der vorhandenen Quelle abgleichen:
      Artikel-ID, Transaktions-/Bestellbeziehung und Status; keine Inhalte loggen.
- [ ] Vertrag für beobachtete Zustände dokumentieren: Angebot, ausstehende Zahlung,
      bestätigter Verkauf, Versand, Abschluss, Abbruch und unbekannt. Unbekannt
      erzeugt keinen bestätigten Verkauf. Reale numerische Codes erst nach Beobachtung.
- [ ] Regression mit obiger künstlicher `order: {}`-Konstellation muss null Verkäufe
      liefern. Bestätigter Verkauf bleibt sichtbar; Abbruch/relisteter Artikel und
      fremder Verkäufer erhalten eigene Fälle. Historische Verkäufe nicht pauschal
      wegen eines aktiven, möglicherweise neu eingestellten Artikels löschen.
- [ ] Herkunft und Zuordnung persistieren. Bereits falsch eingeordnete Zeilen
      kontrolliert neu bewerten; echte Verkaufshistorie erhalten.
- [ ] Beschreibung aus einer nachgewiesenen Lesequelle speichern. Fehlende Details
      gezielt einmal nachladen und persistieren; keine Edit-Seite beim bloßen Anzeigen.
      Wiederholter Detailaufruf aus dem Cache darf keinen Browserstart erzeugen.
- [ ] Feldzustände `not_loaded`, `loaded` und `unavailable` sowie Quelle und
      serverseitige Version führen. Ein gelesener leerer Text ist gültig.
      Listenimport ohne Beschreibung darf einen vorhandenen Detailtext nicht
      durch `null` ersetzen; bestätigte neuere Schreibwerte dürfen durch einen
      älteren Import nicht überschrieben werden. Beide Fälle gezielt testen.
- [ ] Verkaufsumfang gesondert kennzeichnen: Aktuell werden ausschließlich
      Transaktionen aus bereits gelesenen Chats ausgewertet. Eine vollständige
      Inbox beweist keine vollständige Verkaufsliste. Unabhängige Bestellquelle
      lesend untersuchen; bis zum Nachweis Teilumfang zeigen und daraus keine
      vollständigen Umsatzkennzahlen bilden.

**Abnahme:** Fraglicher Artikel stimmt mit seinem tatsächlichen Vorgang überein;
vollständige gespeicherte Detailansicht ist ohne Anbieteraufruf bedienbar.

## Paket 3: Schreiben eindeutig bestätigen

**Dateien:** `vinted-browser-profile-edit.ts`, `vinted-browser-listing-edit.ts`,
HTTP-API und Frontend-API-Service; Profil-/Inserateditor. Neue Browsertests
`test/browser/vinted-edit.browser.test.ts` auf eigenen abgefangenen Seiten.

- [ ] Ergebnis unterscheidet `not_submitted`, `rejected`, `confirmed` und
      `outcome_unknown`; passende Meldung für Profil oder Inserat.
- [ ] Unsicherheitsgrenze beginnt unmittelbar vor `save.click()`: Auch ein
      Klick-Timeout kann nach tatsächlicher Übermittlung entstehen. Den Klick
      selbst in die Ergebniserfassung aufnehmen. Nach möglicher Übermittlung
      bedeutet Abbruch nicht `cancelled`, sondern zunächst `outcome_unknown`.
- [ ] Vor Klick beobachtete Speicherantwort abonnieren, Formularfehler erfassen;
      anschließend gezielt tatsächliche gespeicherte Werte lesen. Feste Pausen
      von 1000/1200 ms ersetzen. Fehlende Netzbestätigung allein ist kein Misserfolg.
- [ ] Bestätigte Werte kontogebunden persistieren; anderen Ansichten direkt zur
      Verfügung stellen. Vorherige Version prüfen, damit ein zwischenzeitlich auf
      Vinted geänderter Inhalt nicht still überschrieben wird.
- [ ] Vinted-Ergebnis, Cacheübernahme und Browserbereinigung getrennt behandeln:
      `confirmed` plus `cache_pending` oder `cleanup_pending` ist möglich.
      Erst den bekannten Ausgang festhalten, dann Folgearbeiten. Scheitert die
      Persistenz des Ausgangs, bleibt nur lesender Abgleich zulässig. Ein
      fehlgeschlagener Cache-/Stoppversuch darf keine erneute Mutation auslösen.
- [ ] Tests mit verzögerter Antwort über zwei Sekunden, Ablehnung vor Absenden,
      abweichendem gespeicherten Inhalt, Verbindungsabbruch nach Übernahme und
      anschließendem fehlgeschlagenem Browserstopp. Genau ein Schreibversuch.
- [ ] Danach einen vom Nutzer konkret bestimmten Profiltext einmal live speichern,
      auf Vinted unabhängig zurücklesen und in Flipbase vergleichen. Erst danach
      einen getrennten Inserat-Schreibtest durchführen.

**Abnahme:** Echte Schreibbestätigung nachgewiesen; unbekannter Ausgang bleibt
gesperrt für automatische Wiederholung und lässt sich lesend abgleichen.

## Paket 4: Persistente Aufträge und Fortschrittsmodal

**Dateien:** Neue `supabase/schemas/270_marketplace_operations.sql`, erzeugte
Migration und Typen; neuer `services/marketplace-worker/src/marketplace-operation-runner.ts`;
bestehende HTTP-API, Broker und Importwriter; neues Feature
`src/app/features/marketplaces/components/marketplace-sync-progress/` mit externem
Template, vorhandener API-Service und `vinted-workspace.component.*`.

Vorgeschlagener Vertrag (eigener Flipbase-Vertrag, keine Vinted-API):

```ts
type OperationState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'needs_login'
  | 'outcome_unknown'
  | 'cancelled';
type SyncStep =
  'browser' | 'profile' | 'publications' | 'conversations' | 'sales' | 'persist' | 'cleanup';
type StepState = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
```

- [ ] POST bestätigt kurzfristig einen Auftrag mit ID (202); GET liefert seinen
      dauerhaft gespeicherten Status. Authentisierung plus serverseitige Rechte-
      und Kontoprüfung für Start, Lesen, Abbruch und jeden Arbeitsschritt.
- [ ] Ein aktiver Auftrag je Verbindung, Doppelklick führt zum selben Auftrag.
      DB-Sperre mit Besitzerkennung und Ablauf; Neustart gleicht Browser und Auftrag
      ab, bevor Arbeit fortgesetzt wird. Ungeklärter Stopp blockiert neue Bedienung.
- [ ] Zunächst nur persistente Leseaufträge im vorhandenen einzelnen Worker.
      Identische Leseaufträge zusammenfassen. Bei späteren Schreibaufträgen bindet
      die Wiederholungskennung an Operation, Konto und Inhaltsversion; derselbe
      Schlüssel mit anderem Inhalt wird abgewiesen. Verschiedene Schreibabsichten
      dürfen niemals still zu einem Auftrag zusammengefasst werden.
- [ ] Hintergrundauftrag speichert Initiator und autorisierten Zweck. Vorschlag:
      Schließen/Logout der Oberfläche beendet bereits angenommene Aufträge nicht;
      ausdrücklicher Abbruch, Rechteentzug oder Kontopause dagegen schon.
      Serverseitig aktuelle Betreiber-/Workspace-Rechte prüfen. Vinted-Anmeldung
      abgelaufen und Flipbase-Berechtigung entzogen sind unterschiedliche Fehler.
- [ ] Persistenz im vorhandenen Postgres belassen: fokussierte Auftragstabelle
      und atomare Übernahme nach bestehendem `skip locked`-Projektmuster.
      Keine zusätzliche Queueplattform im Pilot. Vor mehreren Workern Recovery
      auf Besitzer/Lebenszeichen umstellen; aktuell stoppt sie global alle offenen
      Sitzungen. Ablauf einer Sperre allein erlaubt keinen zweiten Browserstart.
- [ ] Ergebnis je vollständig gelesenem Bereich atomar übernehmen. Bereinigung
      nur bei nachgewiesener vollständiger Liste dieses Bereichs; nie nach einer
      einzelnen erfolgreichen Seite. Teilfehler erhalten erfolgreiche andere Bereiche.
- [ ] Jede Übernahme prüft in derselben DB-Transaktion aktuelle Rechte, Konto,
      Auftragseigentümer und Sperrversion und schreibt anschließend Daten plus
      Bereichsergebnis. Profil/Inserate sind getrennte Bereiche; Gespräch und
      zugehörige Nachrichten bilden eine konsistente Einheit. Verkäufe aus Chats
      behalten diese Quellenabhängigkeit. Je Bereich letzter Versuch, letzter
      Erfolg und Umfang `complete`, `partial` oder `skipped` speichern.
- [ ] Fortschrittsmodal mit ModalShell: Verbindung vorbereiten, Profil abrufen,
      Inserate laden, Nachrichten laden, Verkäufe abgleichen, Daten übernehmen.
      Gelber Spinner am aktiven Schritt; grün erst nach bestätigtem Ergebnis.
      Bei Teilfehler bleibt die Meldung sichtbar und bietet gezielten Neuversuch.
- [ ] Vollständiger Erfolg schließt nach kurzer sichtbarer Bestätigung; reduzierte
      Bewegung, Fokus-Rückgabe, `aria-live`. Schließen des Modals ist kein Abbruch.
      Wiederöffnen liest denselben Auftrag. Kein simuliertes Prozentversprechen.
- [ ] Tests: Fremdkonto/Fremdworkspace verweigert; Rechteentzug beendet Arbeit;
      Doppelstart bleibt einer; Prozessabbruch hinterlässt einen wiederauffindbaren
      Auftrag; Fehler bei Nachrichten erhält erfolgreiches Profil und Inserate;
      unvollständige Pagination löscht keine gespeicherten Zeilen.

**Abnahme:** Browser- oder HTTP-Verbindungsdauer entscheidet nicht mehr darüber,
ob die Oberfläche weiß, was der Auftrag getan hat. Statusanzeige folgt echten Phasen.

## Paket 5: Startkosten und überflüssige Arbeit reduzieren

**Dateien:** Broker, `gologin-cloud-browser.ts`, `vinted-account-import.ts`,
Auftragsrunner und Importwriter aus den vorherigen Paketen.

- [ ] Doppelte Startnavigation und doppelten Profilabruf entfernen; Identität aus
      derselben geprüften Profilantwort gewinnen. Bereits verbundene Seite verwenden.
- [ ] Kurze Browser-Wiederverwendung zunächst mit 60 Sekunden Inaktivitätsgrenze
      als messbarer Konfiguration erproben. Kapazitätslimit, harte Maximaldauer,
      Rechteentzug und bestätigtes Stoppen bleiben verbindlich. Dauer anhand
      gemessener Startkosten, Nutzungsverhalten und Anbieterabrechnung festlegen.
- [ ] Vor Wiederverwendung eine äußere Ausführungswarteschlange je Verbindung
      einführen und Rechteprüfungen als `assertAuthorized` davon trennen. Aktuell
      rufen Autorisierungs-Callbacks verschachtelt `broker.run` auf. Eine einfache
      Sperre in `run` würde sich selbst blockieren. Stop/Abbruch koordiniert die
      laufende Operation, neue Navigationen dürfen sich nicht überlappen.
- [ ] Browserhandle an eindeutige Seite und Kontozuordnung binden; bei fehlender
      Seite neu prüfen statt einfach das letzte offene Tab zu verwenden. Wartezeit
      auf freie Anbieterkapazität separat anzeigen. Untätige Browser zuerst
      freigeben, wenn andere Konten warten. 60 Sekunden sind kein festes Produktziel.
- [ ] Pro Konto bleibt die Ausführung seriell. Unveränderte gelesene Gespräche
      anhand geprüfter Änderungsmerkmale überspringen; regelmäßiger vollständiger
      Abgleich bleibt nötig. Detailhistorie paginieren, keine 100-Gespräche-Abbruchgrenze
      als Vollständigkeit ausgeben. Ungelesene Nachrichten nicht beiläufig als gelesen setzen.
- [ ] Wiederholung nur für beobachtete vorübergehende Lesefehler begrenzen.
      401/403/zusätzliche Prüfung benötigen eigene Behandlung; 429 wartet nach
      Anbieterhinweis. Schreibaufträge nicht blind wiederholen.
- [ ] Tests: zwei schnelle Aktionen nutzen höchstens einen Browser, zwei Konten
      niemals dasselbe Profil; Ablauf während Inaktivität stoppt; abgelaufener
      Sperrbesitzer darf keine Daten mehr übernehmen.

**Abnahme:** Vorher-/Nachhermessung für Start, Datenabruf, Speichern und Stopp.
Zielwerte für gespeicherte Detailansicht und Auftragsannahme: unter einer Sekunde
im Testnetz. Keine zugesagte Vinted-Gesamtdauer, bevor Messdaten vorliegen.

## Reihenfolge und spätere Erweiterungen

Pakete 1–2 zuerst: Fehler messbar machen, Profilrouten trennen und Daten
korrigieren. Paket 3 bestätigt die vorhandenen Schreibwege zuverlässig. Dann
Paket 4 für persistente Leseaufträge und ehrlichen Fortschritt, Paket 5 für
begrenzte Browserwiederverwendung. Persistente Schreibaufträge erst anschließend
auf den bestätigten Schreibvertrag aufsetzen. Zusammenhängende Codepakete einschließlich ihrer Doku
prüfen und veröffentlichen; keine Veröffentlichungen nur für diesen Plan.

Automatische Aktualisierung, neue Inserate und Nachrichtenversand folgen erst
auf dieser Grundlage. Später Nachrichten häufiger, Profil/Historie seltener
abrufen; keine vollständige Historie alle fünf Minuten erneut laden.

Kapazität später aus Messwerten planen: erforderliche mittlere Browserzahl
ungefähr `Konten × Laufzeit / Intervall`, zusätzlich Reserve für Bedienung und
Lastspitzen. Rechenbeispiel, kein gemessener Wert: 300 Konten × 20 Sekunden /
300 Sekunden = 20 gleichzeitig benötigte Browser im Mittel. Gespeicherte
Profilplätze sagen nichts über die ausreichende Ausführungskapazität aus.

Gezielte Prüfungen pro Codepaket: Worker-Testgruppe, betroffene Angular-Tests,
Format/Lint, bei UI Angular-Bau und Desktop-/Mobil-AXE; bei Schema DB-Tests.
Keine vollständige Suite für die jetzige reine Planungsänderung.
