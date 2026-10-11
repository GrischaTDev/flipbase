# Vinted-Statistikseite – Entwurf

Stand: 11.10.2026 · Assistent: Juna · Zweig: `juna/vinted-statistics-page`

## Ziel

Eine eigene Seite „Statistik“ im Vinted-Bereich zeigt, wie viele Aufrufe und
Favoriten die Inserate in einem gewählten Zeitraum bekommen haben – je Konto
oder für alle Konten zusammen – und welche Artikel am beliebtesten sind. Die
Zahlen sind echte Messwerte und bleiben auch dann stehen, wenn ein Artikel
verkauft oder gelöscht wurde.

## Ausgangslage

- Im Kleiderschrank stehen seit PR 374 zwei Kacheln und ein Diagramm
  (`VintedWardrobeStatisticsComponent`). Das Diagramm zeigt **keine echten
  Verläufe**: `vinted-wardrobe-statistics.ts` verteilt die Gesamtsumme nach
  festen Prozentsätzen auf Tage, nutzt ohne Daten die Beispielwerte 342/46 und
  gibt „Beste Zeit: Sonntag 19–22 Uhr“ fest aus.
- Echte Messwerte gibt es bereits: `marketplace_listing_metric_observations`
  speichert je akzeptiertem Abruf Aufrufe und Favoriten je Inserat
  (`supabase/schemas/340_marketplace_listing_statistics.sql`). Genutzt werden
  sie bisher nur für die „+N“-Zahlen an den Artikelkarten.
- Verschwindet ein Inserat aus einer vollständigen Vinted-Liste, löscht der
  Import den Eintrag in `marketplace_account_entries`; die Messungen werden per
  `on delete cascade` mitgelöscht. Vergangene Zeiträume würden dadurch
  nachträglich kleiner.

## Entscheidungen des Nutzers

- Nur Vinted; keine Verkaufs- oder Gewinnanalyse in diesem Schritt.
- Kacheln und Diagramm kommen aus dem Kleiderschrank heraus; die „+N“-Zahlen
  an den Karten bleiben.
- Ansicht je Konto **und** gebündelt über alle Konten.
- Verkaufte und gelöschte Artikel zählen in ihren Zeiträumen weiter mit.

## Oberfläche

### Menü

- Neuer Eintrag „Statistik“ in `VINTED_WORKSPACE_NAVIGATION_GROUPS`, Gruppe
  „Konto“, direkt nach „Kleiderschrank“. Pfad `/marketplaces/vinted/statistics`.
- Die mobile untere Leiste bleibt unverändert.

### Seite

Reihenfolge von oben nach unten:

1. **Schalterzeile**
   - Konto: „Dieses Konto“ / „Alle Konten“. „Dieses Konto“ ist das oben im
     Seitenkopf gewählte Konto; die Seite bekommt keine zweite Kontoauswahl.
     Gibt es nur ein Konto, entfällt der Schalter.
   - Zeitraum: „24 Stunden“ / „7 Tage“ / „30 Tage“, Vorgabe „7 Tage“.
2. **Drei Kacheln**: Aufrufe im Zeitraum, Favoriten im Zeitraum, aktive
   Inserate. Aufrufe und Favoriten zeigen die Veränderung zum gleich langen
   Zeitraum davor. Fehlt dafür die Historie, steht dort „Noch kein Vergleich“.
3. **Diagramm** (ApexCharts, wie im Dashboard), etwa 320 px hoch, Säulen je
   Zeitabschnitt. Umschalter „Aufrufe“ / „Favoriten“, weil beide Größen sehr
   unterschiedlich groß sind.
   - 24 Stunden: 24 Stundenabschnitte.
   - 7 Tage / 30 Tage: ein Abschnitt je Kalendertag (Europe/Berlin).
   - Darunter für Bildschirmleser dieselben Werte als Tabelle.
4. **Bestenliste** als Tabelle mit den vorhandenen Tabellenbausteinen: Bild,
   Titel, Preis, Aufrufe im Zeitraum, Favoriten im Zeitraum, Aufrufe gesamt,
   Favoriten gesamt. Sortierbar nach Aufrufen oder Favoriten im Zeitraum,
   Vorgabe Aufrufe. Höchstens 25 Zeilen.
   - Bei „Alle Konten“ zusätzliche Spalte „Konto“.
   - Artikel, die noch online sind, verlinken auf die Inserat-Detailseite.
   - Entfernte Artikel tragen ein Schild „Nicht mehr online“ und sind nicht
     verlinkt. Lässt sich ein Verkauf über die Artikelnummer sicher zuordnen,
     heißt das Schild „Verkauft“; das wird beim Bau geprüft, sonst entfällt es.
   - Fehlt das Bild, erscheint der übliche Platzhalter.

### Zustände

- Laden: Hinweistext mit `role="status"`.
- Fehler: Hinweisbanner mit „Erneut versuchen“.
- Zu wenig Historie: Hinweis „Die Messhistorie beginnt am …“, Diagramm und
  Liste zeigen nur vorhandene Werte. Keine Beispielzahlen.
- Keine Verwaltungsrechte: die Seite zeigt denselben Hinweis wie die übrigen
  Kontoseiten und lädt nichts.

### Gestaltung

- `docs/design/admin-ui-guidelines.md` gilt. Akzent `#fcc601`; Türkis und Rosa
  des bisherigen Diagramms entfallen. Farben über die vorhandenen
  `fb-`-Farbnamen, damit helles und dunkles Design stimmen.
- Tailwind im Template, kein eigenes SCSS.
- WCAG AA: Schalter als Tastengruppe mit `aria-pressed`, sichtbarer Fokus,
  Tabellen mit Spaltenköpfen, Diagramm mit Textalternative.

## Daten

### Neue Tabelle `public.marketplace_listing_statistic_items`

Dauerhafter Statistik-Datensatz je Vinted-Artikel und Konto.

| Spalte                                    | Bedeutung                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `id`                                      | `bigint generated always as identity`                             |
| `workspace_id`, `connection_id`           | Fremdschlüssel auf `marketplace_connections`, `on delete cascade` |
| `external_id`                             | Vinted-Artikelnummer                                              |
| `title`, `image_url`, `price`, `currency` | letzter bekannter Stand                                           |
| `first_seen_at`, `last_seen_at`           | erste und letzte Messung                                          |
| `removed_at`                              | gesetzt, sobald das Inserat aus dem Kleiderschrank verschwindet   |

- `unique (workspace_id, connection_id, external_id)`.
- RLS aktiv; getrennte Policies wie bei den Messungen: Lesen für
  `authenticated` über `marketplace_can_manage(workspace_id)`, Schreiben nur
  `service_role`.
- Wird ein Konto aus Flipbase entfernt, verschwindet seine Statistik mit.

### Änderung an `marketplace_listing_metric_observations`

- Neue Spalte `statistic_item_id` (Pflicht, `on delete cascade` auf die neue
  Tabelle), neuer Eindeutigkeitsschlüssel `(statistic_item_id, observed_at)`.
- `entry_id` wird wahlfrei und wechselt von `on delete cascade` auf
  `on delete set null`. Die bestehende Funktion für die „+N“-Zahlen arbeitet
  unverändert weiter.
- Migration: für jede vorhandene Messung den Statistik-Datensatz aus dem noch
  vorhandenen Eintrag anlegen und verknüpfen. Bereits gelöschte Inserate sind
  nicht wiederherstellbar.

### Trigger

- `marketplace_record_listing_metrics` legt zusätzlich den Statistik-Datensatz
  an oder aktualisiert Titel, Bild, Preis und `last_seen_at`, setzt
  `removed_at` zurück und schreibt die Messung mit `statistic_item_id`.
- Neuer Lösch-Trigger auf `marketplace_account_entries` für
  `kind = 'publication'`: setzt `removed_at` am Statistik-Datensatz.

### Neue Lesefunktion

`public.marketplace_read_listing_statistics_overview(p_workspace_id uuid,
p_connection_id uuid, p_period text)` → `jsonb`, `stable`, `security invoker`,
`search_path = ''`.

- `p_connection_id = null` bedeutet alle Vinted-Konten des Workspace.
- `p_period` ∈ `24h`, `7d`, `30d`; alles andere wird abgelehnt.
- Zugriff nur mit `marketplace_can_manage`; sonst Fehler `42501`.
- Rechenregel: Zuwachs = Summe der positiven Differenzen aufeinanderfolgender
  Messungen eines Artikels. Der Zuwachs zählt für den Abschnitt der späteren
  Messung. Ausgangswert ist die letzte Messung vor Zeitraumbeginn. Unbekannte
  Werte (`null`) werden übersprungen, nie als 0 gewertet. Die allererste
  Messung eines Artikels ergibt keinen Zuwachs. Sinkende Zähler ergeben 0.
- Rückgabe: Zeitraum, Summen, Summen des Vorzeitraums (oder `null`), Anzahl
  aktiver Inserate, Beginn der Historie, Abschnitte mit Aufrufen/Favoriten,
  die 25 stärksten Artikel je Sortierung mit Stammdaten, Konto und
  `removedAt`.

Nach der Migration werden die Supabase-Typen neu erzeugt.

## Aufbau im Code

Alles unter `src/app/features/marketplaces/`:

- `components/vinted-statistics/` – Seite, dazu kleine Bausteine für Kacheln,
  Diagramm und Bestenliste, jeweils mit eigener `.html`.
- `services/vinted-statistics.store.ts` – hält Konto-Umfang, Zeitraum und
  Ergebnis als Signals; verwirft verspätete Antworten wie
  `MarketplaceListingStatisticsStore`.
- `models/vinted-statistics-overview.ts` – Typen und reine Umrechnung der
  Antwort in Diagrammdaten.
- `MarketplaceApiService` bekommt den Aufruf der neuen Funktion.
- Route `statistics` in `marketplaces.routes.ts`, per `loadComponent`.

Entfernt werden `components/vinted-wardrobe-statistics/`,
`models/vinted-wardrobe-statistics.ts` samt Tests sowie die Einbindung in
`vinted-listings.component`.

## Prüfung

- Datenbanktests: Zuwachs über mehrere Messungen, Lücken, `null`-Werte,
  sinkende Zähler, Vorzeitraum, mehrere Konten gebündelt, entferntes Inserat
  behält Messungen, fremder Workspace wird abgelehnt, ungültiger Zeitraum.
- Tests für Modell, Store und Seite: Schalter, leerer Zustand, Fehler,
  entfernte Artikel ohne Link, Kontospalte nur bei „Alle Konten“.
- Bestehende Tests für Kleiderschrank, Navigation und E2E anpassen.
- Format, Lint, Typen, Bau; AXE-Prüfung der neuen Seite.

## Nicht Teil dieses Schritts

- Verkaufsanalyse (Verkaufsdauer, Umsatz je Artikel).
- Berechnete „beste Zeit“ zum Einstellen.
- Verdichten alter Messungen. Bei 15-Minuten-Abrufen entstehen rund 100
  Zeilen je Artikel und Tag; das wird beobachtet und bei Bedarf später zu
  Tageswerten zusammengefasst.
