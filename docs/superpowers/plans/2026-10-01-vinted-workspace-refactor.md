# Vinted-Ansicht: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Der Nutzer erlaubt ausdrücklich Agents; unabhängige Pakete dürfen nach vereinbarten Schnittstellen parallel umgesetzt werden.

**Goal:** Eine kompakte Vinted-Arbeitsansicht mit gut sichtbaren Nachrichten,
nützlicher Übersicht, flüssiger Inseratdarstellung, sichtbaren Kennzahlenänderungen
und dauerhaften Favoritenmeldungen für berechtigte Kontonutzer.

**Architecture:** Der bestehende Workspace behält seinen `MarketplaceAccountStore`
und Zeitplan-Lebenszyklus. Fachliche Ansichten werden aus der großen
Mehrzweckkomponente herausgelöst; Shared-Bausteine bleiben die Gestaltungsgrundlage.
Das vorhandene Speichern von Beschreibungen wird für schnelle Anzeige genutzt.
Lokale Kennzahlendifferenzen entstehen im kontogebundenen Store; dauerhafte
Favoritenereignisse entstehen einmalig im erfolgreichen Import und werden als
eigener berechtigter Meldungsstrom in die vorhandene Glocke integriert.

**Tech Stack:** Bestehendes Angular 22, Signals, Tailwind, Supabase und Lucide.
Keine neuen Abhängigkeiten. Pakete 1–4 benötigen keine SQL-/Workeränderung;
Paket 5 benötigt deklaratives Schema, generierte Migration und Importanpassung.

**Spec:** [Designentwurf](../specs/2026-10-01-vinted-workspace-design.md).
Navigation und Umsetzung vom Nutzer bestätigt. Pakete 1–5 sind implementiert und
unabhängig geprüft. Die Veröffentlichung bleibt gesondert freizugeben.

## Global Constraints

- Navigation: Übersicht → Nachrichten → Inserate → Verkäufe → Aktivitäten → Profil.
- Bewertungen im Profil; bestehende `/feedback`-Links sinnvoll weiterführen.
- Markengelb `#fcc601`; bestehende Shared-Komponenten und Themevariablen nutzen.
- Normale Texte mindestens 13 px, ergänzende Angaben mindestens 12 px;
  mindestens 4,5:1 für Nachrichtentexte und Zeitangaben in beiden Themes.
- Detailfoto höchstens 360 × 420 px auf Desktop, höchstens 260 px Höhe mobil;
  vorläufige Flipbase-Werte, keine Behauptung gemessener Shopify-Maße.
- Nutzer-, Workspace-, Konto- und Inseratbindung erhalten; keine neuen Rechte.
- Ungelesene Vinted-Gespräche nicht öffnen; kein Senden und keine Angebotsannahme.
- Bestehende Automatik, Pausen und Übernahme nach Hintergrundimport erhalten.
- Keine Beschreibungs-Massenabrufe oder zusätzlichen Abrufe im Zeitplantakt.
- Kennzahlendifferenzen nur zwischen bekannten Werten neuerer Beobachtungen;
  Erstimport setzt eine Basis. Favoritenmeldungen sind Nettoanstiege, keine Echtzeitereignisse.
- Favoritenmeldungen innerhalb Flipbase; keine externe Nachricht oder Browser-Pushzustellung.

## Review Focus

1. Geschlossenes Einstellungsmodal: Automatik und Hintergrundübernahme funktionieren weiter.
2. Mehr als 50 gespeicherte Einträge: Übersicht behauptet keine Gesamtwerte aus Teilseiten.
3. Kontextwechsel bei laufender Detailanfrage: fremde Texte, Bilder und Formwerte erscheinen nie.
4. Bereits gespeicherte leere Beschreibung und `cache: pending`: kein wiederholter Browserstart.
5. Ungelesenes Gespräch und Hintergrundreload: kein Vinted-Lesestatuswechsel, keine verlorene Leseposition.
6. Favoritenereignisse: einmalige Übernahme, keine Erstimportmeldungen und keine
   Vinted-Details für unberechtigte Workspace-Mitglieder.

## Paket 1: Kontokopf, Einstellungen und Navigation

**Dateien:** `vinted-workspace.component.{ts,html,angular.spec.ts}`,
`models/marketplace-presentation.ts`, `marketplaces.routes.ts`,
`components/vinted-sync-schedule/*`, neu
`components/vinted-account-controls/vinted-account-controls.component.{ts,html}`.
Alle Featurepfade liegen unter `src/app/features/marketplaces/`.

**Schnittstellen:** `VintedAccountControlsComponent` erhält
`connections: readonly MarketplaceConnection[]`, `account: MarketplaceConnection`,
`canManage: boolean`, `refreshing: boolean`, `loading: boolean` als Signal-Inputs.
Outputs: `accountSelected: string | null`, `refreshRequested: void`,
`synchronized: MarketplaceSyncSchedule`. Das Konto bleibt im Elternstore.
`VintedSyncScheduleComponent` bleibt außerhalb der Modalbedingung gemountet
und liefert weiterhin `synchronized`. Der Workspace behält `sync()` und
den vorhandenen `MarketplaceSyncProgressComponent`.

- [x] Kontokopf mit vorhandenem `PageHeader`, `CustomSelect`, Icon-Buttons und kurzer
      Datenstandangabe zusammensetzen. Normalen Konto-/Automatik-Riesenblock entfernen.
- [x] Vorhandenes Automatikmodal zu Kontoeinstellungen erweitern: Abstand,
      Pause/Fortsetzen, Anmelderoute, Kontenverwaltung und eingeklappte Abrufdetails.
      Kontextwechsel schließt alte Kontoeinstellungen. Fehler und notwendige Aktionen
      bleiben außerhalb des Modals erreichbar.
- [x] `VINTED_SECTIONS` in bestätigte RouteTabs mit stabilen IDs überführen;
      Aktivitäten aufnehmen, `/listings/:connectionId/:entryId` als Inserate aktiv halten.
      `/feedback` auf `/profile#reviews` weiterführen. Paket 2 stellt das Ziel bereit.
- [x] Bestehende Workspace-/Zeitplantests erweitern: `settingsClosedStillRefreshesSnapshot`,
      `contextChangeClosesSettings`, `pausedScheduleRemainsPaused`,
      `listingDetailKeepsListingsActive`, `activityAndProfileDeepLinks`.
      Erwartungen: geschlossener Dialog verhindert weder Zeitplanladen noch
      `synchronized`; Pause wird nicht aufgehoben; keine alte Kontoeinstellung bleibt offen.
- [x] Gezielt Angular-Tests und Template-Bau ausführen; keine zweite globale
      AccountStore-Instanz oder allein im Modal lebenden Zeitplancontroller einführen.

## Paket 2: Übersicht, Profil und Aktivitäten

**Dateien:** neu `components/vinted-overview/vinted-overview.component.{ts,html}`
und `components/vinted-profile/vinted-profile.component.{ts,html}`;
bestehende `components/vinted-account-content/*`, `components/vinted-feedback-list/*`,
`services/marketplace-account.store.{ts,angular.spec.ts}` nur für gezielte Gesprächsauswahl.

**Schnittstellen:** Beide neuen Komponenten verwenden den Workspace-Store.
Übersicht nutzt `MarketplaceSnapshot`, bestehende `total`-Werte und höchstens
drei Vorschauen pro Sammlung. Gesprächsvorschau navigiert zu Nachrichten mit
kontogebundener Gesprächskennung; Ziel ruft `openConversation(conversationId)` nur
nach Prüfung des aktuellen Kontos und des gespeicherten Gesprächs auf.
Profil enthält die vorhandenen Profiledit-/Bewertungsbausteine und Anker `reviews`.

- [x] Drei kleine Gesamtzahlen mit Bereichslinks, letzte Gespräche und letzte
      gespeicherte Verkäufe darstellen. Profilidentität zur kompakten Ergänzung machen.
- [x] Keine Summen aus der ersten Seite erzeugen. Tests `overviewUsesStoredTotals`
      und `overviewKeepsUnknownValues` verwenden etwa `items.length = 50`,
      `total = 87`; angezeigt wird die gespeicherte Gesamtzahl 87, kein erfundener
      Ungelesen-, Umsatz- oder Angebotswert.
- [x] Bewertungen in Profil integrieren; `/profile#reviews` führt und fokussiert
      den Bewertungsabschnitt. Keine doppelte Bewertungsladung durch den Altlink.
- [x] Aktivitäten mit vorhandener Datenquelle zeigen; leerer Zustand nennt
      fehlende gespeicherte Vinted-Aktivitäten. Keine technischen Workerereignisse erfinden.
- [x] Gespräche aus Übersicht gezielt öffnen: Treffer, inzwischen entfernter Eintrag,
      fremde Kennung und Kontextwechsel prüfen. Nur gespeicherte Supabase-Abfragen.

## Paket 3: Inserate, Bilder und Beschreibungsladen

**Dateien:** neu `components/vinted-listings/vinted-listings.component.{ts,html}`;
`components/vinted-listing-detail/*`,
`src/app/shared/components/product-thumbnail/*`,
`services/marketplace-account.store.{ts,angular.spec.ts}`,
`services/marketplace-browser-test-api.service.{ts,angular.spec.ts}`,
neu `models/vinted-listing-description.ts`; `e2e/marketplace-accounts.spec.ts`.
Für Kennzahlen zusätzlich neu `models/vinted-listing-metric-change.ts` mit
Modelltests; Zustand und Vergleich im bestehenden kontogebundenen Store.

**Schnittstellen:** Bestehende `readListingEdit()` und `saveListingEdit()` bleiben
für die ausdrücklich gewählte Bearbeitung frisch und behalten ihren Vertrag.
Neue typisierte Leseantwort `VintedListingReadResult` enthält
`fields: VintedListingEditFields` und `cacheState: 'unconfirmed' | 'pending'`.
Ohne `cache: pending` ist die dauerhafte Speicherung nicht bestätigt: der
Cachewriter ist optional und ältere Antworten enthalten keine Speicherbestätigung.
Unbekannte/fehlerhafte Feldantworten werden weiter zurückgewiesen.
`MarketplaceBrowserTestApiService.readListingData(scope, entryId, accessToken)`
liefert diese Antwort; die bisherige Editmethode kann deren frische `fields` verwenden.
`MarketplaceAccountStore.readListingDescription(connectionId, entryId)` nutzt
Snapshot/Textcache oder den einmaligen Leseweg und liefert
`Promise<{ description: string; cacheState: 'stored' | 'unconfirmed' | 'pending' }>`.
`stored` ist nur bei einem bereits geladenen Datenbank-/Snapshottext belegt;
aktuell gelesener Text ohne Speicherwarnung bleibt `unconfirmed`.

- [x] Auge/Herz als dekorative Lucide-Icons in neutralen Shared-Badges ergänzen.
      Bedeutung zugänglich beschriften; `null` bleibt unbekannt, `0` bleibt sichtbar.
- [x] Im Store bei neuerem `metrics.observedAt` positive Aufruf-/Favoritendifferenzen
      pro Inserat halten. Erstes Laden, neuer Eintrag und unbekannt → bekannt setzen
      nur die Basis. Sinkende Werte aktualisieren die Basis ohne positive Meldung.
      Vergleich unabhängig vom Mounten einer Karte, nur innerhalb des aktuellen Kontos.
- [x] Kleine `+N`-Zusätze im Raster und Detail darstellen; einmalige dezente
      Hervorhebung für etwa zwei Sekunden, statisch bei Reduced Motion.
      Zusatz bis zur nächsten neueren Beobachtung oder Verlassen von Raster/Detail;
      Vergleichsbasis im gleichen Kontokontext erhalten, bereits dargestellte Beobachtungen
      getrennt kennzeichnen. Wiedereintritt startet denselben Effekt nicht erneut;
      noch nicht angezeigte Änderungen dürfen erstmals erscheinen. Konto-/Workspacewechsel
      verwirft Differenzen. Eine zusammenfassende Live-Region statt vieler Einzelansagen.
- [x] Kennzahlenfälle absichern: `firstObservationSetsBaseline`,
      `unknownCounterMakesNoDelta`, `zeroToOneShowsIncrease`,
      `olderOrRepeatedObservationMakesNoEffect`, `decreaseResetsBaseline`,
      `metricChangesCannotCrossAccount`. Effekte, Fokus und Reduced Motion im E2E prüfen.
- [x] Zusätzlichen Thumbnail-Modus `listing-detail` mit `object-contain` und
      vereinbartem Größenlimit einführen. `listing` für Raster nicht verändern.
      Galerie links begrenzen, Angaben rechts und mobil direkt unter kompakter Galerie zeigen.
- [x] Gespeicherte Snapshotdaten unmittelbar darstellen. Fehlender Eintrag nutzt
      `readPublication()`. Beschreibung separat laden; Routeparameter reaktiv lesen,
      lokale Zustände bei neuem Inserat zurücksetzen und Rückläufe vollständig prüfen.
- [x] Im AccountStore Anfragen je Nutzer/Workspace/Konto/Inserat zusammenführen.
      Sitzungsergebnisse an bestehenden Kontext-/Auswahlversionen binden, bei deren
      Wechsel löschen. Maximal 50 Beschreibungen im Sitzungscache behalten; keine Tokens.
      Bestätigte Bearbeitung aktualisiert Anzeige und Snapshot, unbestätigte nicht.
- [x] `cache: pending` bis zum Store erhalten. Bei fehlender Beschreibung und
      Ladefehler „Erneut versuchen“ anbieten. Bereits geladenen leeren Text nicht neu lesen.
      Keine neue Aktualisieren-Aktion für schon geladene Beschreibung und keine
      aus Listenzeiten abgeleitete Frischeangabe.
- [x] Verhalten zuerst absichern: `knownDescriptionStartsNoBrowser`,
      `emptyLoadedDescriptionStartsNoBrowser`, `descriptionReadIsDeduplicated`,
      `pendingCacheSurvivesReopenWithinContext`, `lateDescriptionCannotCrossContext`,
      `detailRouteChangeResetsPhoto`, `editReadsFreshFields`,
      `unconfirmedSaveKeepsPreviousSnapshot`. API- und Storetests verwenden echte
      asynchrone Reihenfolgen statt bloßer Methodenaufruf-Zählung.
- [x] E2E: Foto-/Textposition bei 1440 × 900 und 390 px; Bildausfall,
      Hoch-/Querformat, lange Titel, bekannte/leere/fehlende Beschreibung,
      Rücknavigation und erneutes Öffnen. Anbieteraufrufe im Test abfangen.

## Paket 4: Kompakte und kontrastgerechte Nachrichten

**Dateien:** neu `components/vinted-messages/vinted-messages.component.{ts,html}`;
bestehende `components/vinted-account-content/*`,
`src/app/shared/components/button/*`, bei Bedarf `src/styles/flipbase-theme.css`,
`services/marketplace-account.store.angular.spec.ts`,
`e2e/marketplace-accounts.spec.ts`.

**Schnittstellen:** Nachrichten verwenden den bestehenden Workspace-Store,
`openConversation()`, `selectedConversationId`, `messages()` und
`refreshImportedSnapshot()`. Gemeinsame Listenbuttons erhalten eine ausdrückliche
Option `density: 'default' | 'compact'`; Default bleibt unverändert.
Kompakt gilt nur für die Gesprächsliste, mit mindestens 44 px Touchfläche.

- [x] Gesprächsliste und Verlauf in einen Arbeitsbereich setzen; Desktopliste
      300 px, mobil Liste/Verlauf mit Zurückaktion. Vorschau eine Zeile, ergänzende
      Texte mindestens 12 px. Fokus beim Öffnen und Zurück bewusst führen.
- [x] Feste Pastellfarben entfernen; Themefarben für Fläche und Schrift gemeinsam
      verwenden. Neue Theme-Rolle nur, wenn bestehende neutrale/Infofarben nicht passen.
      Eingehend links, ausgehend rechts, System mittig, Angebote als reine Anzeige.
- [x] Abstand und Innenpadding auf die vereinbarten 8 px setzen; kurze Nachrichten
      eng, lange Texte lesbar. Hintergrunddaten erhalten Fokus und Scrollposition;
      ältere Nachrichten behalten die sichtbare Lesestelle.
- [x] Zustände unterscheiden: lädt, leer, Lesefehler, noch nicht importierter
      ungelesener Verlauf. Kontextbezogene Hilfe statt pauschalem großen Hinweisblock.
- [x] E2E ergänzt eingehende/ausgehende Nachrichten, Angebote, Systemmeldungen,
      unbekannte Richtung, lange URL, beide Themes und AXE ausdrücklich im Chat.
      Farben tatsächlich berechnen: mindestens 4,5:1, keine bloßen Klassenprüfungen.
- [x] Store-/Browsertests: `unreadConversationMakesNoProviderRequest`,
      `backgroundReloadKeepsConversationAndScroll`,
      `olderMessagesKeepReadingPosition`, `lateMessagesCannotCrossWorkspace`.
      Kein Composer, keine Angebotsannahme und keine Lesebestätigung hinzufügen.

## Paket 5: Dauerhafte Favoritenmeldungen

**Betroffene Bereiche:** `services/marketplace-worker/src/vinted-account-import.ts`,
bestehende Import-RPC und Zuordnung unter `supabase/schemas/`, neue thematische
Schemadatei für Marktplatzmeldungen, generierte Migration, generierte Supabase-Typen,
Marktplatz-Feature-Service und vorhandene Glockenanzeige/Benachrichtigungsservice.
Die genaue Schemadatei und RPC-Schnittstelle vor der Umsetzung anhand des dann
aktuellen Importvertrags festlegen. Keine Änderung bereits veröffentlichter Migrationen.

**Schnittstellen:** Ein gespeichertes Favoritenereignis enthält Workspace, Konto,
externe Inserat-ID, vorherigen/neuen bekannten Wert, tatsächlichen Beobachtungszeitpunkt
und stabilen Importschlüssel. Ereignisse entstehen serverseitig innerhalb derselben
Transaktion wie die gültige Kennzahlenübernahme. Die Glocke konsumiert autorisierte
Ereignisse beziehungsweise deren kontoweise Zusammenfassung mit stabiler Kennung;
`WebhookService.addNotification()` wird nicht aus einem Snapshotvergleich aufgerufen.

- [x] Import-Sperren und vorhandenen Schutz gegen ältere Beobachtungen erhalten.
      Bekannte Favoritenzahlen atomar vergleichen; erste/fehlende/unveränderte oder
      sinkende Werte erzeugen kein positives Ereignis. Einzigartiger Ereignisschlüssel
      verhindert Wiederholung und Parallelmeldungen; auch Konto-/Importzusammenfassung
      erhält einen eindeutigen Schlüssel. Nur tatsächlich vom bedingten Upsert übernommene
      Inseratzeilen erzeugen Ereignisse; zurückgewiesene alte Zeilen erzeugen keines.
      Fehlgeschlagene Speicherung darf
      keine Meldung zu einem nicht übernommenen Datenstand erzeugen.
- [x] Eigene Marktplatzmeldungen mit RLS und expliziten Operations-/Rollenpolicies
      definieren. Lesen und als gelesen markieren verlangen dieselben Betreiber-
      und Workspace-Adminrechte wie Vinted. Workspace-/Kontozuordnung unveränderbar
      halten; normale Clients dürfen keine Importereignisse selbst erzeugen.
      Neue Favoritenmeldungen nicht in den allgemeinen `app_notifications`-Feed kopieren.
- [x] Kontoabhängige Einstellung für Favoritenmeldungen persistieren. Neue Konten
      erhalten In-App-Meldungen ohne Ton; deaktivierte oder gerade aktivierte Konten
      erzeugen keine nachträglichen historischen Meldungen. Die Basis wird auch während
      deaktivierter Meldungen weiter aktualisiert. Der erste erfolgreiche Abruf nach
      Aktivierung setzt nur die Meldungsbasis, auch wenn alte Kennzahlen vorhanden sind.
      Einstellungsänderung und laufender Import prüfen dieselbe Einstellungsfassung.
      Workspaceweiter Gelesen-Status wie bisher.
- [x] Deklarativen Schemaabgleich ausführen, Migration generieren und vollständig
      prüfen; nach Migration Supabase-Typen neu erzeugen. Keine manuelle Produktionsänderung.
- [x] Pro Konto und Import eine Glockenmeldung aus Ereignissen bilden, unabhängig
      von geöffneten Seiten und der Snapshotgrenze 50. Ein Treffer verlinkt das Inserat,
      mehrere die richtige Inserateliste. Entfernte Inserate ergeben einen verständlichen
      Zielzustand. Importbatch und Einzelereignisse beim Nachladen stabil deduplizieren.
- [x] Berechtigte private Broadcast-Kanäle mit Nachladen verbinden; Reconnect und
      App-Neustart holen fehlende Meldungen nach. Keine Abhängigkeit von aktiver
      Vinted-Komponente, kein `postgres_changes`. DestroyRef-Cleanup, Kontextwechsel
      und Rechteverlust leeren Subscription und geladene Vinted-Meldungen.
      Feed und Ungelesen-Zähler aus denselben autorisierten Quellen bilden;
      keine Gesamtzahl aus lediglich 50 geladenen Glockeneinträgen ableiten.
- [x] Datenbank-/Workerprüfungen: Erstimport, `0 → 1`, `null → 5`, `5 → null`,
      `5 → 4 → 5`, Wiederholung, verspäteter/gleichzeitiger Import, Transaktionsfehler,
      vom Upsert zurückgewiesene Zeile, wiederholter Batch ohne zweite Sammelmeldung,
      deaktivierte Meldungen, Aktivierung während Import und mehr als 50 Inserate.
      Fremder Workspace, normaler
      Workspace-Mitgliedszugang und Rechteverlust müssen Details und Zähler ausschließen.
- [x] Frontend-/E2E-Prüfungen: Vinted-Ansicht geschlossen, zwei Tabs, erneutes
      Verbinden und späteres App-Öffnen ergeben eine gespeicherte Meldung;
      keine externe Nachricht, kein zusätzlicher GoLogin-Abruf und kein doppelter Ton.
      Neue private Channels und Importschnittstelle unabhängig prüfen lassen.

## Agentenaufteilung und Integration

Paket 1 definiert die gemeinsame Kopf-/Navigationsebene. Danach können drei Agents
Übersicht/Profil, Inserate/Details und Nachrichten in getrennten neuen Komponenten
umsetzen. Nur der koordinierende Agent ändert die gemeinsame Routerdatei,
`vinted-account-content` und finale Store-Schnittstellen. Die gemeinsamen
`marketplace-account.store.angular.spec.ts` und `e2e/marketplace-accounts.spec.ts`
gehören ebenfalls ausschließlich dem Koordinator; Agents liefern ihre Prüffälle
zur seriellen Integration. Store-/Shared-Änderungen werden vor Parallelstart
abgesprochen; keine konkurrierenden Änderungen derselben Datei.
Nach Zusammenführung prüft ein unabhängiger Agent die ganze Ansicht und ihre Rechte.
Paket 5 wird mit eigener Schema-/Importzuständigkeit nach festgelegtem Ereignisvertrag
umgesetzt. Glockenadapter und finale Storeänderungen integriert der Koordinator
seriell; kein gleichzeitiger Umbau gemeinsamer Benachrichtigungsdateien.

## Prüfungen und Abschluss

- [x] Für jedes Paket betroffene Angular-/Modelltests gezielt ausführen;
      Beispiel: `npm run test:angular -- src/app/features/marketplaces/`.
- [x] `npx playwright test e2e/marketplace-accounts.spec.ts` mit künstlichen
      Daten und abgefangenen Anbieterantworten; bestehende Demo-/CI-Konfiguration verwenden.
- [x] Geänderte Dateien mit Prettier und ESLint prüfen; `npm run typecheck`,
      `npm run build`, `node scripts/check-admin-shared-ui.mjs` und
      `npm run test:audit` ausführen. Angular-Templateprüfung nicht durch tsc ersetzen.
- [x] Screenshots hell/dunkel, 1440 × 900, 390 und 320 px; 200 % Zoom,
      Tastatur, Fokus, Touch, Reduced Motion und AXE manuell/automatisch abnehmen.
- [x] Für Paket 5 betroffene Datenbank-/Workerprüfungen, Schemaabgleich und
      Migrationstypen prüfen; tatsächliche serverseitige Zustellung in die berechtigte
      Glocke vor Abschluss nachweisen. Der bestehende Worker ruft unverändert den
      Import-RPC auf; die neuen Hooks benötigen Schema-/Anwendungsrelease.
- [x] AI-Changelog ergänzen; lokale Prüfergebnisse und tatsächlich verbleibende
      Grenzen dokumentieren. Keine Produktivkonten ändern, um bloß Layouttests zu bestehen.
- [x] Nach fertiger Umsetzung exakt fragen:
      „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“
      Erst nach dieser Freigabe pushen und den grünen PR per Merge-Commit integrieren.

## Lokale Abnahme am 1. Oktober 2026

Die fünf Pakete wurden umgesetzt und unabhängig geprüft. Konkrete Reviewfehler
bei Dialogfokus, Nachrichtenwiederholung, alten Beschreibungsantworten,
Kontoparametern in Glockenlinks und verspäteten Antworten nach Rechteentzug sind
behoben und mit Regressionen abgesichert.

- Breiter Anwendungslauf: 3.448 Tests erfolgreich; nach den letzten Korrekturen
  gezielt nochmals 296 betroffene Angular-Tests erfolgreich.
- Abschließende Typprüfung und Produktionsbau erfolgreich. Der bestehende
  pako-CommonJS-Hinweis bleibt ohne neuen Buildfehler.
- Generierte Migration auf unverändertem lokalem Ausgangsstand angewendet:
  acht Datenbanksuiten mit 344 Prüfungen sowie drei echte parallele
  Import-/Einstellungsabläufe erfolgreich. Funktionsrümpfe unabhängig abgeglichen.
- Kombinierter Chromium-Lauf: 19 Fälle erfolgreich, mit künstlichen
  Serverantworten statt Produktivkonten. Hell/dunkel, 1440/390/320 px,
  200 % Vergrößerung, AXE, Tastatur und Fokus, Reduced Motion,
  Hintergrundübernahme bei geschlossenem Dialog und zwei offene Tabs geprüft.
- Zusätzlich vier gezielte Inserat-Browserfälle erfolgreich: echte synthetische
  Hoch-/Querformate, Bildfehler ohne Layoutsprung, lange Titel,
  geladener leerer Text ohne Abruf und fehlender Text mit genau einem
  kontogebundenen Abruf samt Wiederöffnen bei ausstehender Datenbankbestätigung.
- Die sechs UI-Fälle zusätzlich mit eingehenden/ausgehenden Nachrichten,
  Angeboten, Systemmeldungen, unbekannter Richtung und langer URL erfolgreich.
  Tatsächlich berechneter Mindestkontrast 5,78:1, Schriftgrößen 13/12 px.
  Ein erst am langen Verlauf belegter AXE-Fehler wurde durch Tastaturfokus mit
  kontrastreicher Markierung behoben; Tab und Home/End scrollen den Verlauf.
- Shared-UI-Prüfung: 129 Dateien, keine Befunde. Teststrukturprüfung:
  372 Testdateien erfolgreich geprüft. Geänderte Dateien formatiert und gelintet.

Kennzahlenzeit belegt keine Beschreibungsfrische. Noch nicht datenbankbestätigter
Sitzungstext bleibt deshalb innerhalb seines Kontokontexts erhalten. Kein
zusätzlicher Anbieterabruf oder Beschreibungszeitvertrag wurde eingeführt.
Favoritenmeldungen zeigen beobachtete Nettoanstiege, keine einzelnen Personen.
Die schnelle Benachrichtigung über Nachrichten, Angebote und Verkäufe bleibt
ein separater Ausbau. Veröffentlichung und tatsächliche Produktionszustellung
werden erst nach Freigabe über den geprüften PR vorgenommen.

## Separater späterer Ausbau

Verlässliche Beschreibungsfrische: `body.textCheckedAt`, tatsächlicher
Beobachtungszeitpunkt, gezieltes dauerhaftes Neuladen und Schutz gegen ältere Reads.
Betroffen wären `supabase/schemas/275_marketplace_listing_cache.sql`,
`marketplace_cache_listing_text`, `marketplace_preserve_listing_text`, Workerleseweg
und Frontendparser. Dafür generierte Migration, neue Typen, Datenbank-/Workerprüfungen
und gesonderter Workerrollout. Ohne diesen Vertrag keine neue Frischezusage.
