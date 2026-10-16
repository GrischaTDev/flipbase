# Zentrale Marktplatzübersicht und erster vollständiger Inserattransfer

Stand: 15.10.2026. Aufbau und erster Übertragungsweg wurden im Chat freigegeben;
dieses Dokument konkretisiert diese Entscheidung für die Planprüfung.
Noch keine Freigabe für Produktcode, Veröffentlichung oder echte Inseratänderungen.

## Ziel und erster Lieferumfang

„Marktplätze → Übersicht“ ist die gemeinsame Arbeitsfläche für aktivierte
Plattformen, Accounts und deren Inserate. Erster vollständiger Übertragungsweg:
ein eigenes, bestehendes Vinted-Inserat in einen bearbeitbaren
Kleinanzeigen-Entwurf übernehmen, auf dem ausgewählten Kleinanzeigen-Account
veröffentlichen und das bestätigte Ergebnis in Flipbase anzeigen.
Die Vinted-Fassung bleibt unverändert.

Drei einzeln lieferbare Pakete: Übersicht mit vorhandenen Daten; lokale
Kleinanzeigen-Verbindung und vollständiger Inseratabgleich; Einzeltransfer mit
bestätigter Veröffentlichung. Erst das dritte Paket erfüllt den Gesamtweg.
Relisting, Bulk-Ausführung, weitere Richtungen, Mehrplattform-Erstellung und
mehrere persönliche eBay-Verbindungen folgen in eigenen Plänen. Die Grundlage
für Auswahl und plattformspezifische Aktionen wird jetzt berücksichtigt.

## Verbindliche Entscheidungen

- Angular 22, bestehende stabile Abhängigkeiten, keine zusätzlichen Pakete geplant.
- Tailwind direkt in externen HTML-Templates, OnPush, Signals, Reactive Forms,
  Lazy Loading und gemeinsame Admin-Bausteine; keine zweite Button-/Tabellenfamilie.
- Deutsche Du-Ansprache; englische Datei- und Codebezeichner; Juna als KI-Bezeichnung.
- Logo-Gelb #fcc601; docs/design/admin-ui-guidelines.md und die dort verlinkten
  Messungen gelten. 320/390/834/1440 px, Touch, Tastatur, Hell/Dunkel und AXE prüfen.
- Aktivierung steuert die persönliche Sichtbarkeit je Nutzer und Workspace.
  Die Einstellung heißt im Dialog „In Marktplätze anzeigen“. Sie widerruft keine
  Kontofreigabe und verändert keine laufenden oder wartenden Aufträge.
  „Konto pausieren“ und „Freigabe trennen“ bleiben eigene, eindeutige Aktionen.
- Einstellungen und Übersicht verwenden denselben Dienst. Bestehende Browserwerte
  werden nur nach erfolgreicher Anmeldung und Kontextladung einmal übernommen;
  vorhandene Serverwerte haben Vorrang. Kein Weitertragen in ein anderes Konto.
- Übersicht bleibt ohne aktivierte Plattform erreichbar. Direkte Links und
  serverseitige Rechteprüfung funktionieren unabhängig von Sichtbarkeitsschaltern.
- Vinted bleibt auf die bisherigen Betreiber-/Workspace-Rechte begrenzt; eBay
  bleibt persönlich. Die Übersicht erweitert keine dieser Berechtigungen.
- Neue Kleinanzeigen-Verbindungen und Lesekopien gehören zum Workspace.
  Aktive Mitglieder dürfen öffentliche Metadaten sehen. Veröffentlichen verlangt
  zusätzlich eine ausdrückliche, dem anfordernden Nutzer zugeordnete lokale Freigabe.
  Geheimnisse und Freigabe-Hashes sind nicht über normale Tabellenabfragen lesbar.
- Ein Browserprofil kann gleichzeitig eine geprüfte Kleinanzeigen-Identität haben.
  Weitere Accounts verwenden getrennte Browserprofile. Keine automatische Abmeldung.
- Einzeltransfer und Veröffentlichung können vorhandene Artikelzuordnungen erhalten,
  benötigen aber keinen Lagerartikel. Keine automatischen Lagerartikel aus Importen.
- Gleiche Quellfassung und gleiches Zielkonto erzeugen bei Doppelklick, Wiederholung
  oder zweitem Tab denselben Zielentwurf bzw. denselben ungeklärten Auftrag.
- Quelltexte bleiben vollständig erhalten. Kein stilles Kürzen, keine fremden
  Kategorie-IDs, keine geratenen Versandpreise oder Standortübernahme aus Vinted.
- Erste automatische Veröffentlichung ist auf einen nachweislich gebührenfreien
  Standardablauf beschränkt. Kostenpflichtige Optionen, Buchungsschritte oder
  unklare Gebühren führen zu „Deine Prüfung erforderlich“ vor einem verbindlichen Klick.
- Anbieterprüfungen und geänderte Formulare führen zur Pause; keine Umgehung.
  Bestehendes manuelles Autofill bleibt ausdrücklich als solches erkennbar.

## Bestand und bewusste Wiederverwendung

Planbasis: lokal vorliegendes origin/master d69357225a783d2e29b862ebe4f0078b4b8a5ceb,
einschließlich Galerie und Altersanzeige aus PR #423. Vor Implementierung erneut
gegen den dann aktuellen Integrationsstand prüfen. Der Planungszweig selbst
basiert noch auf 36723117 und wird nicht als Produktcodebasis weiterverwendet.

Vinted: MarketplaceApiService.listConnections/readAccountPreview/readPage und
die bestehenden Detail-/Bearbeitungswege. eBay: EbayAccountApiService.loadStatus/
loadListings/loadListingDetails/updateListing. AccountStore enthält einen
ausgewählten Account und ist deshalb nicht der globale Zustand aller Abschnitte.

Kleinanzeigen: public.listings und public.listing_images bleiben die einzige
gespeicherte Entwurfsquelle. Das bestehende Feature listings wird erweitert,
keine zweite Tabelle konkurrierender Kleinanzeigen-Entwürfe.
Neue externe Lesekopien liegen davon getrennt in kleinanzeigen_publications.
Bestehende Entwurfs-UUIDs, Artikelzuordnungen, Medien und alte Links bleiben gültig.

Die bestehenden Vinted-Auftrags- und Freigabe-RPCs sind fachlich Vinted-gebunden.
Kleinanzeigen nutzt deren bewährte Zustände und Claim-/Revisionsmuster über einen
eigenen Adapter; keine pauschale Öffnung der Vinted-RPCs für fremde Plattformen.
Die Übersicht führt selbst keine Browseraktion aus.

Der ältere Plan docs/superpowers/plans/2026-10-09-cross-marketplace-listing-transfer.md
ist für diesen Umfang ersetzt: keine automatische Titelkürzung, keine ungeprüften
Zustands-Enums, keine dauerhaft kopierten signierten URLs und keine festen
Versandpreise. Seine historischen Aussagen werden nicht als aktuelle Anbieterwerte
übernommen.

## Gemeinsame Lese- und Auswahlverträge

Neue Typen in features/marketplaces/models/marketplace-overview.models.ts:

- MarketplaceListingReference: platform, workspaceId, connectionId, externalId;
  alle IDs als unveränderte Strings.
- MarketplaceOverviewAccount: Referenz mit platform/workspaceId/connectionId,
  displayName, status, activeCount: number | null, observedAt: string | null,
  completeness: 'complete' | 'partial' | 'unknown'.
- MarketplaceOverviewListing: reference, title, priceCents: number | null,
  currency, imageUrl: string | null, publishedAt: string | null,
  state: 'active' | 'reserved' | 'ended' | 'processing' | 'unknown',
  actions: readonly MarketplaceListingAction[].
- MarketplaceListingAction: 'view' | 'edit' | 'publish_elsewhere' | 'delete' | 'relist'.
  Nur tatsächlich unterstützte und erlaubte Aktionen werden angeboten.
- MarketplaceOverviewPage: items, total: number | null, nextCursor: string | null,
  completeness. Cursor sind opak, zusätzlich an Account, Filter und Sortierung gebunden.
- MarketplaceListingQuery: state: 'all' | 'active' | 'reserved' | 'ended',
  search: string, cursor?: string, limit: number. Standard limit = 25,
  zulässig 1 bis 100. In erster Version Suche auf Server-/Anbieterseite;
  kein als Vollbestand ausgegebener Filter nur der geladenen Seite. Ein Such- oder Statusfilter wird nur angeboten, wenn der Adapter die vollständige gefilterte Quelle lesen kann.

MarketplaceOverviewService:
loadAccounts(workspaceId: string): Promise<readonly MarketplaceOverviewAccount[]>;
loadListings(account: MarketplaceOverviewAccount, query: MarketplaceListingQuery):
Promise<MarketplaceOverviewPage>.

Fehler werden je Plattform/Account angezeigt; ein gescheiterter Abschnitt leert
keine funktionierenden Abschnitte. Zählungen stammen aus vollständigen oder
exakt gezählten Quellen. Eine unbekannte aktive Zahl ist null, nicht Listenlänge.
Bei eBay ohne entsprechenden Vollbestandsnachweis bleibt sie unbekannt.

Auswahl pro Accountabschnitt und sichtbarer Seite. Schlüssel ist die vollständige
ListingReference. Account-, Workspace-, Filter- oder Seitenwechsel leert die
betroffene Auswahl. „Alle auf dieser Seite“ selektiert höchstens die sichtbaren
25 Einträge. In Paket 1 keine funktionslose Sammel-Veröffentlichen-Aktion.

## Kleinanzeigen-Verbindung und Import

Neue Tabellen haben bigint identity als id und werden als Dezimalstrings übertragen.
Ausnahme bleiben bestehende UUIDs in listings und listing_images.
Neue Tabellen: kleinanzeigen_connections, kleinanzeigen_local_grants,
kleinanzeigen_sync_runs, kleinanzeigen_sync_entries, kleinanzeigen_publications und später
kleinanzeigen_listing_jobs. Jede Tabelle erhält RLS, getrennte Operationspolicies,
indizierte Zugriffs-/FK-Spalten und Archivschutz.

KleinanzeigenAccountService:
list(workspaceId: string): Promise<readonly KleinanzeigenConnection[]>;
connect(input: KleinanzeigenConnectRequest): Promise<KleinanzeigenConnection>;
synchronize(scope: AccountScope): Promise<KleinanzeigenSyncRun>;
readPage(scope: AccountScope, query: MarketplaceListingQuery):
Promise<MarketplaceOverviewPage>.

KleinanzeigenConnection enthält AccountScope, displayName, externalAccountId,
status, lastSyncedAt und capabilities. ConnectRequest enthält workspaceId,
requestId und eine einmalige von der Extension vorbereitete Bindungsbestätigung;
keine Sitzungscookies und kein dauerhaftes Secret im Frontend.
Einrichtung verwendet angemeldete Nutzer-Authentifizierung; die Extension erhält
ein widerrufbares Installationssecret mit account-/nutzergebundener Generation.

Der separate Endpoint kleinanzeigen-local-extension übernimmt vom gebundenen
Profil importierte Daten und Auftragsmeldungen. Er verwendet ein fest erlaubtes
Serverziel, begrenzte Nutzlasten, strict parsing und serverseitige Zuordnung.
Nutzeraktionen laufen über kleinanzeigen-account mit JWT und Mitgliedschaftsprüfung.

Synchronisieren läuft zunächst manuell. Der Import liest Identität vor und nach
der vollständigen paginierten Aufnahme. Nur ein abgeschlossener Lauf darf
abwesende Inserate als nicht mehr vorhanden kennzeichnen. Teilimporte und
Fehler entfernen nichts; ein abwesendes Inserat ist nicht automatisch „verkauft“.
publishedAt ausschließlich aus expliziten Veröffentlichungsdaten übernehmen;
Importdatum ist kein Ersatz. „processing“ ist von „active“ zu unterscheiden.

## Entwurf, Bilder und Transfer

Neue contracts in supabase/functions/_shared/kleinanzeigen-listing-contracts.ts;
Frontend importiert nur Typen und nutzt einen eigenen strikten Antwortparser.
BaseContent enthält title: string, description: string, priceCents: number, currency: 'EUR',
priceType: 'FIXED' | 'NEGOTIABLE', postalCode: string | null und shippingType: 'pickup' | 'shipping' | 'both'.
KleinanzeigenDraftContent ist BaseContent mit den folgenden Ergänzungen: categoryId: string | null, categoryFields: Readonly<Record<string,string>>,
schemaRevision: string | null und images: readonly { id: string; storagePath: string; sortOrder: number }[].

Die bestehenden Entwurfs-Basisgrenzen 65 Titelzeichen und 4000 Beschreibungszeichen
bleiben zunächst interne Speichergrenzen. Sie sind kein neu verifizierter
Anbietervertrag. Aufgabe zur Formularprüfung gleicht sie ab; notwendige Anpassungen
erfolgen gemeinsam in Datenbank, Modell und Tests. Ein zu langer Quelltext bleibt
im noch nicht gespeicherten Transferformular vollständig erhalten, mit Feldfehler.
Speichern verlangt gültige Basisangaben; Kategorie oder andere Zielpflichtfelder
dürfen im gespeicherten Entwurf noch fehlen. Veröffentlichung verlangt alle Angaben.

listings erhält am Ende target_connection_id bigint, source_reference jsonb,
revision bigint, category_id text, category_fields jsonb, schema_revision text und
transfer_request_id uuid. Eine gültige serverseitig bestätigte source_reference
erlaubt einen Entwurf ohne inventory_item_id/catalog_product_id. Die bisherigen
beiden Entwurfsarten und ihre Constraints bleiben erhalten.
source_reference enthält die vollständige Quellreferenz und den Inhaltsfingerprint.
Ein Quellkontolöschen entfernt keine gesicherte Zielfassung.

ListingRow.item wird nullable; die bestehenden Übersicht-/Editor-/Medienpfade
werden dafür gezielt angepasst. Ein gültiger source-only-Entwurf darf weder beim
Join verschwinden noch zur Anlage eines erfundenen Lagerartikels führen.
Bestehende alte Statusangaben werden als bisher manuell gepflegter Stand geführt;
sie erhalten weder erfundene Ziel-ID noch eine bestätigte Veröffentlichung.

ListingTransferService:
prepare(source: MarketplaceListingReference, targetConnectionId: string,
requestId: string): Promise<KleinanzeigenTransferPreview>;
save(preview: KleinanzeigenTransferPreview, content: KleinanzeigenDraftContent,
expectedRevision: number | null): Promise<KleinanzeigenDraft>.

prepare akzeptiert im ersten Weg ausschließlich eigene Vinted-Inserate. Der
Server prüft den bestehenden Vinted-Zugriff. Vollständige Cache-Daten dürfen verwendet werden; fehlende Quelldetails werden je Ausführungsmodus gelesen. Im Cloudmodus läuft dies über den bestehenden Worker-Inhaltspfad, im lokalen Modus über einen eigenen nur lesenden source_details-Import der gebundenen Vinted-Installation. Keine Cloud-Veröffentlichung oder lokale Vinted-Schreibaktion ist dafür Voraussetzung. Der Server lädt fehlende vollständige
Quellangaben über den vorhandenen Lesepfad nach. KleinanzeigenDraft erweitert den bestehenden Listing-Vertrag um Zielkonto, Quellreferenz, Revision und Kategorie-/Schemaspalten; Bilder sind die geordnete gespeicherte Auswahl. KleinanzeigenTransferPreview hat source: MarketplaceListingReference, target: AccountScope,
sourceFingerprint: string, content: KleinanzeigenDraftInput, warnings: readonly { field: string; code: string; message: string }[] und originalPhotoReferences: readonly string[]. KleinanzeigenDraftInput entspricht KleinanzeigenDraftContent, erlaubt aber priceCents: number | null. Ungültige Längen bleiben im Input sichtbar; erst save verlangt die gültigen Basisangaben.
Speichern validiert den Quellbezug erneut. Fotos werden vollständig in den
privaten vorhandenen item-media-Bereich listings/<workspace>/<draft>/<file>
übernommen; Reihenfolge bleibt erhalten. Zugriff erfolgt über kurzlebige URLs
erst bei Übergabe. Keine dauerhafte Speicherung von Zugangsdaten oder fremden URLs
als Beleg gesicherter Bilder. Unvollständige Fotoübernahme blockiert Veröffentlichung.

Die externe Bildübernahme verwendet nur verifizierte Anbieter-Bildreferenzen:
HTTPS, explizite aus der Anbieterprüfung stammende Hostliste, keine beliebigen
Weiterleitungen, begrenzte Anzahl/Größe und geprüfter MIME-Inhalt.
Kein Serverabruf beliebiger vom Frontend übergebener URLs.
Vorhandene Bildformate werden nicht als automatisch zielgeeignet angenommen.

## Veröffentlichungsauftrag und Wiederaufnahme

KleinanzeigenListingJobService:
enqueue(scope: AccountScope, draftId: string, expectedRevision: number,
requestId: string): Promise<KleinanzeigenListingJob>;
load(scope: AccountScope, jobId: string): Promise<KleinanzeigenListingJob>;
reconcile(scope: AccountScope, jobId: string): Promise<KleinanzeigenListingJob>.

Job enthält id, scope, draftId, draftRevision, immutableSnapshot,
requestedBy, grantGeneration, state, externalId: string | null,
providerState: 'active' | 'processing' | null, verifiedAt: string | null und errorCode.
Zustände: queued, claimed, writing, confirmed, failed, outcome_unknown, cancelled,
needs_user_action. confirmed verlangt Ziel-ID, überprüfte Kontoidentität,
aktiven Anbieterzustand und verifiedAt. Bei processing bleibt die Anzeige „Wird
von Kleinanzeigen verarbeitet“; nur lesende Nachprüfung, kein erneuter Submit.

enqueue/claim/begin/finish sind atomar, versionsgebunden und wiederholbar ohne
Doppelveröffentlichung. Ein ungelöster Auftrag pro Entwurf, eine schreibende
Aktion pro Zielaccount. Abgelaufene claimed-Lease vor begin darf neu beansprucht
werden; nach begin führt eine abgelaufene Lease zu outcome_unknown.

Extension prüft Secret/Freigabe, tatsächlichen Account, Formularschema, Gebühren,
alle Pflichtfelder und vollständigen Bilderupload unmittelbar vor begin/Submit.
begin wird dauerhaft bestätigt, bevor geklickt wird. Nach Neustart bei writing
niemals erneut klicken. Ergebnis zuerst im verbundenen Account abgleichen.
Fehlt ein eindeutiger Zielbeleg, bleibt outcome_unknown; Titelähnlichkeit allein
belegt weder Erfolg noch das Fehlen einer Veröffentlichung.

Bestätigung und Speicherung der externen Lesekopie geschehen in derselben
Datenbanktransaktion. Bei processing wird zuerst der identifizierte
Verarbeitungsstand gespeichert; spätere Bestätigung aktualisiert beide.
Fortschritt in der ersten Version durch begrenztes Polling, mit DestroyRef-Cleanup.
Kein neues Realtime-System nötig.

## Anbieterprüfung und Abnahme

Vor Produktcode für den Kleinanzeigen-Browseradapter entsteht ein lesend
geprüfter Anbieterbericht: stabile Identität, eigene Inseratseiten, Pagination,
Veröffentlichungszeiten, Kategoriebaum, dynamische Pflichtfelder, Versand,
Fotos, kostenloser Submit, Gebühren-/Prüfschritte und Erfolgsbelege.
Selektoren oder private Endpoints werden nicht aus dem alten Konzept erfunden.
Nicht belegbare Teilfunktionen werden als konkrete fehlende Voraussetzung
dokumentiert; das Ziel wird nicht still auf „Tab geöffnet“ reduziert.

Offizielle Hilfe bestätigt Kategorie und Pflichtangaben, aber kein technisches
Automatisierungsprotokoll:
[Anzeige aufgeben](https://hilfe.kleinanzeigen.de/hc/de/articles/17083044980764-Wie-kann-ich-eine-Anzeige-aufgeben).
Gebühren sind account-/kontingentabhängig; kein fester Preis wird im Code hinterlegt:
[Gebühren für gewerbliche Nutzer](https://themen.kleinanzeigen.de/gebuehren-kleinanzeigen-gewerbliche-nutzer/).
Diese Quellen sind keine Anbieterfreigabe für Browserautomatisierung.

Definition des vollständigen Wegs: ausgewähltes eigenes Vinted-Inserat, sichtbares
Zielkonto, bearbeitete Kleinanzeigen-Felder, gesicherte Bilder, ein bestätigter
Auftrag mit Ziel-ID und anschließend dasselbe Inserat in der zentralen Liste.
Kein Quellverlust, kein geratenes „online“, keine Doppelveröffentlichung nach
Neustart oder Wiederholung. Für eine Live-Abnahme einen ausdrücklich ausgewählten
Testartikel verwenden; die Planungsfreigabe erlaubt keine echte Veröffentlichung.

## Datenbank- und Integrationsregeln

Schema ausschließlich deklarativ; neue Dateien nach Abhängigkeiten ausdrücklich in
supabase/config.toml registrieren. Migrationen mit supabase stop und
supabase db diff -f <name> erzeugen, vollständig prüfen, bestehende Migrationen
unverändert lassen. Keine laufende gemeinsam genutzte lokale Datenbank ungefragt
stoppen; isolierte Instanz verwenden. Typen danach neu generieren.
Jede Schemaänderung und zugehörige erzeugte Migration kommen in denselben PR.

SQL kleingeschrieben, public, Kommentare, search_path leer, Invoker als Standard;
Definer nur mit dokumentiertem Grund, strenger Prüfung und expliziten Grants.
Separate Policies pro Operation/Rolle; für nicht erlaubte Operationen keine Grants.
RLS-Tests gegen fremde Nutzer/Workspaces, archivierte Workspaces und anonyme Zugriffe.
Vor Implementierung aktuelle Dokumentation prüfen:
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[deklarative Schemas](https://supabase.com/docs/guides/local-development/declarative-database-schemas).
Der Abruf von supabase.com/changelog.md lieferte in der Planung einen Fehler;
versionsbezogene Prüfung vor einer tatsächlichen Änderung bleibt erforderlich.

Jedes Paket auf aktuellem origin/master in eigenem Zweig, ohne fremde Zweige
einzumischen. Formatierung, betroffene bestehende/neue Tests, CI-Testregistrierung
und Angular-Bau vor dem ersten Push; Pflichtprüfungen im PR abwarten.
Linux-/Chrome-Extension-Neustarttest für den Veröffentlichungsweg einplanen.
Push, PR und Merge erst nach der in AGENTS.md festgelegten Abschlussfrage.

## Ergänzung: Standard-Privataccounts und Bekleidung

Nutzerpräzisierung vom 15.10.2026: Erster Abnahmefall ist ein Standard-Privataccount
ohne PRO. Eine Integration setzt kein PRO-Abo voraus. Privat-/Gewerbestatus und
PRO-Abonnement werden getrennt behandelt; fehlendes PRO beweist keinen Privatstatus.
Die [Quellenrecherche zu Kleidung und Privatkontingent](../../research/2026-10-15-kleinanzeigen-private-listing-quota.md)
ergänzt den Anbieterbericht aus Paket B1. Der tatsächliche Kontingentstand wird nur
bei belegter Quelle und mit Abrufzeit angezeigt; andernfalls bleibt er unbekannt.
Die aktive Inseratzahl ist dafür kein Ersatz. Aktueller Gebührenhinweis vor
Veröffentlichung bleibt maßgeblich. Verlängern und Löschen/Neuanlegen sind getrennte
Aktionen; die spätere Relisting-Planung muss deren Kontingentwirkung berücksichtigen.
