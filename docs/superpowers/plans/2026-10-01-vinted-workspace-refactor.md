# Vinted-Ansicht: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Der Nutzer erlaubt ausdrücklich Agents; unabhängige Pakete dürfen nach vereinbarten Schnittstellen parallel umgesetzt werden.

**Goal:** Eine kompakte Vinted-Arbeitsansicht mit gut sichtbaren Nachrichten,
nützlicher Übersicht und flüssiger, kontogebundener Inseratdarstellung.

**Architecture:** Der bestehende Workspace behält seinen `MarketplaceAccountStore`
und Zeitplan-Lebenszyklus. Fachliche Ansichten werden aus der großen
Mehrzweckkomponente herausgelöst; Shared-Bausteine bleiben die Gestaltungsgrundlage.
Das vorhandene Speichern von Beschreibungen wird für schnelle Anzeige genutzt.

**Tech Stack:** Bestehendes Angular 22, Signals, Tailwind, Supabase und Lucide.
Keine neuen Abhängigkeiten und zunächst keine SQL-/Workeränderung.

**Spec:** [Designentwurf](../specs/2026-10-01-vinted-workspace-design.md).
Navigation vom Nutzer bestätigt; übriger Entwurf steht zur Prüfung. Dieser
Plan beauftragt keine Veröffentlichung und enthält noch keine Produktimplementierung.

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

## Review Focus

1. Geschlossenes Einstellungsmodal: Automatik und Hintergrundübernahme funktionieren weiter.
2. Mehr als 50 gespeicherte Einträge: Übersicht behauptet keine Gesamtwerte aus Teilseiten.
3. Kontextwechsel bei laufender Detailanfrage: fremde Texte, Bilder und Formwerte erscheinen nie.
4. Bereits gespeicherte leere Beschreibung und `cache: pending`: kein wiederholter Browserstart.
5. Ungelesenes Gespräch und Hintergrundreload: kein Vinted-Lesestatuswechsel, keine verlorene Leseposition.

## Paket 1: Kontokopf, Einstellungen und Navigation

**Dateien:** `vinted-workspace.component.{ts,html,angular.spec.ts}`,
`models/marketplace-presentation.ts`, `marketplaces.routes.ts`,
`components/vinted-sync-schedule/*`, neu
`components/vinted-account-controls/vinted-account-controls.component.{ts,html}`.
Alle Featurepfade liegen unter `src/app/features/marketplaces/`.

**Schnittstellen:** `VintedAccountControlsComponent` erhält
`connections: readonly MarketplaceConnection[]`, `account: MarketplaceConnection`,
`canManage: boolean`, `refreshing: boolean`, `loading: boolean` als Signal-Inputs.
Outputs: `accountSelected: string`, `refreshRequested: void`,
`synchronized: MarketplaceSyncSchedule`. Das Konto bleibt im Elternstore.
`VintedSyncScheduleComponent` bleibt außerhalb der Modalbedingung gemountet
und liefert weiterhin `synchronized`. Der Workspace behält `sync()` und
den vorhandenen `MarketplaceSyncProgressComponent`.

- [ ] Kontokopf mit vorhandenem `PageHeader`, `CustomSelect`, Icon-Buttons und kurzer
      Datenstandangabe zusammensetzen. Normalen Konto-/Automatik-Riesenblock entfernen.
- [ ] Vorhandenes Automatikmodal zu Kontoeinstellungen erweitern: Abstand,
      Pause/Fortsetzen, Anmelderoute, Kontenverwaltung und eingeklappte Abrufdetails.
      Kontextwechsel schließt alte Kontoeinstellungen. Fehler und notwendige Aktionen
      bleiben außerhalb des Modals erreichbar.
- [ ] `VINTED_SECTIONS` in bestätigte RouteTabs mit stabilen IDs überführen;
      Aktivitäten aufnehmen, `/listings/:connectionId/:entryId` als Inserate aktiv halten.
      `/feedback` auf `/profile#reviews` weiterführen. Paket 2 stellt das Ziel bereit.
- [ ] Bestehende Workspace-/Zeitplantests erweitern: `settingsClosedStillRefreshesSnapshot`,
      `contextChangeClosesSettings`, `pausedScheduleRemainsPaused`,
      `listingDetailKeepsListingsActive`, `activityAndProfileDeepLinks`.
      Erwartungen: geschlossener Dialog verhindert weder Zeitplanladen noch
      `synchronized`; Pause wird nicht aufgehoben; keine alte Kontoeinstellung bleibt offen.
- [ ] Gezielt Angular-Tests und Template-Bau ausführen; keine zweite globale
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

- [ ] Drei kleine Gesamtzahlen mit Bereichslinks, letzte Gespräche und letzte
      gespeicherte Verkäufe darstellen. Profilidentität zur kompakten Ergänzung machen.
- [ ] Keine Summen aus der ersten Seite erzeugen. Tests `overviewUsesStoredTotals`
      und `overviewKeepsUnknownValues` verwenden etwa `items.length = 50`,
      `total = 87`; angezeigt wird die gespeicherte Gesamtzahl 87, kein erfundener
      Ungelesen-, Umsatz- oder Angebotswert.
- [ ] Bewertungen in Profil integrieren; `/profile#reviews` führt und fokussiert
      den Bewertungsabschnitt. Keine doppelte Bewertungsladung durch den Altlink.
- [ ] Aktivitäten mit vorhandener Datenquelle zeigen; leerer Zustand nennt
      fehlende gespeicherte Vinted-Aktivitäten. Keine technischen Workerereignisse erfinden.
- [ ] Gespräche aus Übersicht gezielt öffnen: Treffer, inzwischen entfernter Eintrag,
      fremde Kennung und Kontextwechsel prüfen. Nur gespeicherte Supabase-Abfragen.

## Paket 3: Inserate, Bilder und Beschreibungsladen

**Dateien:** neu `components/vinted-listings/vinted-listings.component.{ts,html}`;
`components/vinted-listing-detail/*`,
`src/app/shared/components/product-thumbnail/*`,
`services/marketplace-account.store.{ts,angular.spec.ts}`,
`services/marketplace-browser-test-api.service.{ts,angular.spec.ts}`,
neu `models/vinted-listing-description.ts`; `e2e/marketplace-accounts.spec.ts`.

**Schnittstellen:** Bestehende `readListingEdit()` und `saveListingEdit()` bleiben
für die ausdrücklich gewählte Bearbeitung frisch und behalten ihren Vertrag.
Neue typisierte Leseantwort `VintedListingReadResult` enthält
`fields: VintedListingEditFields` und `cacheState: 'stored' | 'pending'`.
Ein erfolgreicher aktueller Endpunkt ohne `cache: pending` bedeutet `stored`;
unbekannte/fehlerhafte Antworten werden weiter zurückgewiesen.
`MarketplaceBrowserTestApiService.readListingData(scope, entryId, accessToken)`
liefert diese Antwort; die bisherige Editmethode kann deren frische `fields` verwenden.
`MarketplaceAccountStore.readListingDescription(connectionId, entryId)` nutzt
Snapshot/Textcache oder den einmaligen Leseweg und liefert
`Promise<{ description: string; cacheState: 'stored' | 'pending' }>`.

- [ ] Auge/Herz als dekorative Lucide-Icons in neutralen Shared-Badges ergänzen.
      Bedeutung zugänglich beschriften; `null` bleibt unbekannt, `0` bleibt sichtbar.
- [ ] Zusätzlichen Thumbnail-Modus `listing-detail` mit `object-contain` und
      vereinbartem Größenlimit einführen. `listing` für Raster nicht verändern.
      Galerie links begrenzen, Angaben rechts und mobil direkt unter kompakter Galerie zeigen.
- [ ] Gespeicherte Snapshotdaten unmittelbar darstellen. Fehlender Eintrag nutzt
      `readPublication()`. Beschreibung separat laden; Routeparameter reaktiv lesen,
      lokale Zustände bei neuem Inserat zurücksetzen und Rückläufe vollständig prüfen.
- [ ] Im AccountStore Anfragen je Nutzer/Workspace/Konto/Inserat zusammenführen.
      Sitzungsergebnisse an bestehenden Kontext-/Auswahlversionen binden, bei deren
      Wechsel löschen. Maximal 50 Beschreibungen im Sitzungscache behalten; keine Tokens.
      Bestätigte Bearbeitung aktualisiert Anzeige und Snapshot, unbestätigte nicht.
- [ ] `cache: pending` bis zum Store erhalten. Bei fehlender Beschreibung und
      Ladefehler „Erneut versuchen“ anbieten. Bereits geladenen leeren Text nicht neu lesen.
      Keine neue Aktualisieren-Aktion für schon geladene Beschreibung und keine
      aus Listenzeiten abgeleitete Frischeangabe.
- [ ] Verhalten zuerst absichern: `knownDescriptionStartsNoBrowser`,
      `emptyLoadedDescriptionStartsNoBrowser`, `descriptionReadIsDeduplicated`,
      `pendingCacheSurvivesReopenWithinContext`, `lateDescriptionCannotCrossContext`,
      `detailRouteChangeResetsPhoto`, `editReadsFreshFields`,
      `unconfirmedSaveKeepsPreviousSnapshot`. API- und Storetests verwenden echte
      asynchrone Reihenfolgen statt bloßer Methodenaufruf-Zählung.
- [ ] E2E: Foto-/Textposition bei 1440 × 900 und 390 px; Bildausfall,
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

- [ ] Gesprächsliste und Verlauf in einen Arbeitsbereich setzen; Desktopliste
      300 px, mobil Liste/Verlauf mit Zurückaktion. Vorschau eine Zeile, ergänzende
      Texte mindestens 12 px. Fokus beim Öffnen und Zurück bewusst führen.
- [ ] Feste Pastellfarben entfernen; Themefarben für Fläche und Schrift gemeinsam
      verwenden. Neue Theme-Rolle nur, wenn bestehende neutrale/Infofarben nicht passen.
      Eingehend links, ausgehend rechts, System mittig, Angebote als reine Anzeige.
- [ ] Abstand und Innenpadding auf die vereinbarten 8 px setzen; kurze Nachrichten
      eng, lange Texte lesbar. Hintergrunddaten erhalten Fokus und Scrollposition;
      ältere Nachrichten behalten die sichtbare Lesestelle.
- [ ] Zustände unterscheiden: lädt, leer, Lesefehler, noch nicht importierter
      ungelesener Verlauf. Kontextbezogene Hilfe statt pauschalem großen Hinweisblock.
- [ ] E2E ergänzt eingehende/ausgehende Nachrichten, Angebote, Systemmeldungen,
      unbekannte Richtung, lange URL, beide Themes und AXE ausdrücklich im Chat.
      Farben tatsächlich berechnen: mindestens 4,5:1, keine bloßen Klassenprüfungen.
- [ ] Store-/Browsertests: `unreadConversationMakesNoProviderRequest`,
      `backgroundReloadKeepsConversationAndScroll`,
      `olderMessagesKeepReadingPosition`, `lateMessagesCannotCrossWorkspace`.
      Kein Composer, keine Angebotsannahme und keine Lesebestätigung hinzufügen.

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

## Prüfungen und Abschluss

- [ ] Für jedes Paket betroffene Angular-/Modelltests gezielt ausführen;
      Beispiel: `npm run test:angular -- src/app/features/marketplaces/`.
- [ ] `npx playwright test e2e/marketplace-accounts.spec.ts` mit künstlichen
      Daten und abgefangenen Anbieterantworten; bestehende Demo-/CI-Konfiguration verwenden.
- [ ] Geänderte Dateien mit Prettier und ESLint prüfen; `npm run typecheck`,
      `npm run build`, `node scripts/check-admin-shared-ui.mjs` und
      `npm run test:audit` ausführen. Angular-Templateprüfung nicht durch tsc ersetzen.
- [ ] Screenshots hell/dunkel, 1440 × 900, 390 und 320 px; 200 % Zoom,
      Tastatur, Fokus, Touch, Reduced Motion und AXE manuell/automatisch abnehmen.
- [ ] AI-Changelog ergänzen; lokale Prüfergebnisse und tatsächlich verbleibende
      Grenzen dokumentieren. Keine Produktivkonten ändern, um bloß Layouttests zu bestehen.
- [ ] Nach fertiger Umsetzung exakt fragen:
      „Soll ich jetzt den PR erstellen und nach erfolgreichen Tests mergen?“
      Erst nach dieser Freigabe pushen und den grünen PR per Merge-Commit integrieren.

## Separater späterer Ausbau

Verlässliche Beschreibungsfrische: `body.textCheckedAt`, tatsächlicher
Beobachtungszeitpunkt, gezieltes dauerhaftes Neuladen und Schutz gegen ältere Reads.
Betroffen wären `supabase/schemas/275_marketplace_listing_cache.sql`,
`marketplace_cache_listing_text`, `marketplace_preserve_listing_text`, Workerleseweg
und Frontendparser. Dafür generierte Migration, neue Typen, Datenbank-/Workerprüfungen
und gesonderter Workerrollout. Ohne diesen Vertrag keine neue Frischezusage.
