# Listing Studio: gespeicherte Kleinanzeigen-Inserate

Stand: 20.09.2026 · Basis: `origin/master` bei `a845cf4d` (`v0.187.0`)

## Ziel

Das bestehende Listing Studio erzeugt Texte und überträgt sie zusammen mit
Artikelbildern über die Browser-Erweiterung an Kleinanzeigen. Es speichert den
fachlichen Zustand eines Inserats jedoch nicht. Dadurch fehlen Übersicht,
Bearbeitung, Statusführung und ein verlässlicher Ablauf zum erneuten Einstellen.

Das Listing Studio wird zu einem klaren Kleinanzeigen-Arbeitsbereich mit
gespeicherten Inseraten. Nutzer können ein Inserat vorbereiten, über die bereits
vorhandene Erweiterung öffnen, anschließend als online markieren, bearbeiten,
beenden und später neu einstellen. Der Status des zugehörigen Artikels bleibt
damit abgestimmt.

## Bereits vorhandene Grundlage

- `/listings` ist eine produktive, lazy geladene Angular-Seite.
- Die Browser-Erweiterung erkennt Flipbase und füllt das echte
  Kleinanzeigen-Formular aus.
- Titel, Beschreibung, Preis, Versand, Postleitzahl und signierte Artikelbilder
  werden bereits an die Erweiterung übertragen.
- `listing_drafts` existiert in der Datenbank, wird von der App aber nur gelesen;
  ein vollständiger Speicher- und Statusablauf fehlt.
- Demo-Modus und `MockDataStoreService` wurden inzwischen vollständig entfernt.

Diese Grundlage wird weiterverwendet. Die Erweiterung selbst wird in diesem
Projekt nicht neu gebaut.

## Verbindliche Nutzerentscheidungen

| Thema | Entscheidung |
| --- | --- |
| Plattform | Nur Kleinanzeigen. eBay, Vinted, WhatsApp und Webshop gehören nicht in diesen Arbeitsbereich. |
| Status | Ein Inserat entsteht als `prepared`, wird manuell auf `online` gesetzt und endet als `ended`. |
| Neu einstellen | Derselbe Datensatz wird weitergeführt. Zähler und letzter Zeitpunkt werden aktualisiert; der Inhalt darf vorher bearbeitet werden. |
| Artikelkopplung | `online` setzt einen zulässigen Artikel auf `listed`; ein Verkauf beendet das offene Inserat automatisch mit Grund `sold`. |
| Artikelauswahl | Alle nicht archivierten und nicht verkauften Artikel werden gezeigt. Nicht zulässige Zustände erhalten einen verständlichen Hinweis. |
| Textgenerator | Regelbasierte Kleinanzeigen-Vorlagen bleiben. Nicht vorhandene KI-SEO-Funktionen und unfertige Plattformversprechen entfallen. |
| Offene Inserate | Pro Artikel darf höchstens ein nicht beendetes Kleinanzeigen-Inserat existieren. |

## Gewählter Rollout

Die Umsetzung erfolgt in zwei eigenen PRs.

### Schritt 1: Speichern, Übersicht und Statusablauf

- neue Tabelle `public.listings` und abgesicherte Datenbankfunktionen;
- `ListingService` als einziger Frontend-Zugriff auf Inseratsdaten;
- Übersicht `/listings`;
- Erstellen unter `/listings/new` mit dem bestehenden Generator;
- Bearbeiten unter `/listings/:id`;
- Navigation mit den Unterpunkten „Übersicht“ und „Erstellen“;
- vorhandene Browser-Erweiterung erhält Daten aus dem gespeicherten Inserat;
- bisherige `listing_drafts`-Tabelle bleibt vorerst unverändert bestehen, wird im
  Frontend aber nicht mehr gelesen.

### Schritt 2: Altteile entfernen und Datenbestand bereinigen

- Produktionsdaten in `listing_drafts` vor der Migration ausdrücklich prüfen;
- vorhandene Kleinanzeigen-Entwürfe, falls fachlich vollständig, in `listings`
  übernehmen;
- unbekannte oder unvollständige Altzeilen als Auditbefund behandeln, niemals
  still löschen;
- danach `listing_drafts`, seinen Frontend-Typ und zugehörige Policies entfernen;
- alte Plattformkarten, Webshop-Aktion, HTML-Modus und KI-SEO-Anzeige entfernen;
- Generator auf den neuen Kleinanzeigen-Ablauf reduzieren.

Diese Aufteilung ersetzt den früher geplanten sofortigen Tabellenabbruch. Ein
automatisches Deployment darf weder wegen unbekannter Altdaten überraschend
scheitern noch Daten still verwerfen.

## Datenmodell

Die deklarative Definition liegt in `supabase/schemas/230_listings.sql` und wird
in `supabase/config.toml` nach `220_purchase_open_prices.sql` registriert. Die
Migration wird mit `supabase db diff` erzeugt und anschließend inhaltlich geprüft.

### Tabelle `public.listings`

| Spalte | Typ und Regel |
| --- | --- |
| `id` | `uuid` Primärschlüssel mit `gen_random_uuid()` |
| `workspace_id` | `uuid not null`, Fremdschlüssel auf `workspaces`, Löschung kaskadiert |
| `inventory_item_id` | `uuid not null`, zusammengesetzter Fremdschlüssel mit `workspace_id` auf `inventory_items` |
| `platform` | `text not null`, ausschließlich `kleinanzeigen` |
| `status` | `text not null`, `prepared`, `online` oder `ended` |
| `end_reason` | `sold`, `manual` oder `null`; nur bei `ended` gesetzt |
| `title` | getrimmter Text mit 1 bis 65 Zeichen |
| `description` | Text mit höchstens 4.000 Zeichen |
| `price` | `numeric(12,2)`, 0 bis 99.999.999 |
| `price_type` | `FIXED` oder `NEGOTIABLE` |
| `shipping_type` | `pickup`, `shipping` oder `both` |
| `shipping_price` | `numeric(12,2)` oder `null`; nur bei Versand erlaubt |
| `postal_code` | fünf Ziffern oder `null` |
| `listed_count` | nichtnegative Ganzzahl, Standard 0 |
| `last_listed_at` | Zeitpunkt der letzten Übergabe an die Erweiterung |
| `online_since` | Zeitpunkt des Wechsels auf `online` |
| `ended_at` | Zeitpunkt des Beendens |
| `created_at` | Erstellungszeitpunkt |
| `updated_at` | letzter Änderungszeitpunkt |

Ein partieller eindeutiger Index auf `(inventory_item_id, platform)` für
`status <> 'ended'` verhindert zwei offene Inserate desselben Artikels. Indizes
decken `workspace_id`, `inventory_item_id`, `status` und die Listenreihenfolge ab.

## Rechte und Datenbankfunktionen

RLS ist aktiviert. `anon` erhält keine Tabellen- oder Funktionsrechte.
`authenticated` darf Inserate seines aktuellen Workspace lesen und ausschließlich
die bearbeitbaren Inhaltsspalten aktualisieren. Direkte Inserts, Löschungen und
Statusänderungen sind nicht erlaubt.

Status und Zähler werden über folgende `security definer`-Funktionen geändert.
Alle Funktionen verwenden `set search_path = ''`, vollqualifizierte Namen,
prüfen die Workspace-Mitgliedschaft und lehnen archivierte Workspaces ab.

- `prepare_listing(workspace_id, inventory_item_id, content)` legt ein neues
  Inserat an oder bereitet ein bestehendes, manuell beendetes Inserat erneut vor.
  Es erhöht `listed_count`, setzt `last_listed_at` und liefert den Datensatz zurück.
- `set_listing_online(workspace_id, listing_id)` erlaubt nur den Übergang von
  `prepared` zu `online`. Ein zulässiger Artikel wechselt dabei zu `listed`.
- `end_listing(workspace_id, listing_id)` beendet ein vorbereitetes oder aktives
  Inserat manuell. Ein weiterhin als `listed` geführter Artikel wechselt zu
  `ready`.
- Ein Trigger auf `inventory_items.status` beendet beim Wechsel auf `sold` alle
  offenen Inserate des Artikels mit `end_reason = 'sold'`.

Die Funktionen sperren betroffene Inserats- und Artikelzeilen mit `for update`,
damit parallele Aktionen keine widersprüchlichen Zustände erzeugen.

## Fachliche Statusregeln

- Inserierbar sind nicht archivierte Artikel mit `received`, `needs_review`,
  `researched`, `ready`, `listed` oder `returned`.
- `reserved`, `sold`, `defective` und `archived` werden mit konkreter Begründung
  abgelehnt.
- Ein Artikel aus einem wieder geöffneten Einkauf bleibt durch die vorhandenen
  Bestandsregeln blockiert. Die Datenbankmeldung wird verständlich angezeigt.
- „Kleinanzeigen erneut öffnen“ überträgt ein bereits vorbereitetes Inserat
  erneut, verändert aber weder Zähler noch Status.
- „Neu einstellen“ bestätigt zuerst, dass das alte Kleinanzeigen-Inserat gelöscht
  wurde, ruft dann `prepare_listing` auf und überträgt die aktuellen Bilder.
- Flipbase erkennt nicht automatisch, ob das Inserat auf Kleinanzeigen wirklich
  veröffentlicht oder gelöscht wurde. Der Nutzer bestätigt diese Zustände.

## Seiten und Navigation

Der Navigationseintrag „Inserate erstellen“ wird zu „Inserate“ und erhält zwei
Unterpunkte:

- „Übersicht“ → `/listings`
- „Erstellen“ → `/listings/new`

`/listings/:id` bearbeitet ein Inserat. Erstellen und Bearbeiten verwenden den
vorhandenen Schutz vor ungespeicherten Änderungen.

### Übersicht `/listings`

Die Seite folgt dem gemeinsamen Tabellenvertrag aus
`docs/design/admin-ui-guidelines.md` und verwendet ausschließlich Shared
Components. Sie zeigt Artikel, Preis, Status, Anzahl der Übergaben, letzten
Übergabezeitpunkt und „Online seit“.

Filter: Offen als Standard, Online, Beendet und Alle. Suche erfolgt nach
Inserats- und Artikeltitel. Laden, leerer Datenbestand, keine Suchtreffer und
Fehler sind getrennte Zustände; Suche und Filter bleiben bei null Treffern
sichtbar.

Aktionen:

- `prepared`: online setzen, Kleinanzeigen erneut öffnen, bearbeiten, beenden;
- `online`: neu einstellen, bearbeiten, beenden;
- `ended/manual`: neu einstellen, sofern der Artikel zulässig ist;
- `ended/sold`: Hinweis zum Entfernen auf Kleinanzeigen, keine erneute Einstellung.

### Erstellen und Bearbeiten

Der Editor verwendet eine breite Hauptspalte für Artikel, Titel und Beschreibung
sowie eine schmale Seitenspalte für Preis, Versand, Postleitzahl und Textvorlage.
Beim Erstellen ist der Artikel auswählbar, beim Bearbeiten fest.

Die primäre Erstellen-Aktion speichert über `prepare_listing` und öffnet danach
Kleinanzeigen über die Erweiterung. Ein Erweiterungsfehler lässt das gespeicherte
Inserat als `prepared` bestehen und zeigt die Installationshilfe. Bearbeiten
speichert nur Inhalt; „Neu einstellen“ nutzt denselben Ablauf wie die Übersicht.

## Angular-Struktur

- `features/listings/models/`: Inseratsmodell, Status- und Formtypen;
- `features/listings/services/listing.service.ts`: Laden, Inhaltsänderung,
  Funktionsaufrufe und Aufbau der Erweiterungsdaten;
- `features/listings/pages/listing-overview/`: Tabelle und Aktionen;
- `features/listings/pages/listing-editor/`: Erstellen und Bearbeiten;
- `features/listings/components/`: rein darstellende, nur dort verwendete Bausteine;
- `core/services/listing-studio.service.ts`: zunächst Vorlagenerzeugung und
  vorhandene Erweiterungsübergabe; die weitere Bereinigung erfolgt in Schritt 2.

Alle Komponenten sind standalone, verwenden Signals, Reactive Forms, OnPush und
externe Templates. Datenbankabfragen bleiben vollständig im `ListingService`.

## Fehler und Rückmeldungen

- Ladefehler bleiben auf der betroffenen Seite sichtbar und bieten „Erneut
  versuchen“.
- Doppeltes offenes Inserat verweist auf das bestehende Inserat.
- Ungültige Statuswechsel laden den aktuellen Datensatz neu und erklären den
  erlaubten nächsten Schritt.
- Fehlende Erweiterung zeigt die bestehende Installationshilfe.
- Fehlende oder abgelaufene Bild-URLs blockieren das Speichern nicht. Die
  Übertragung nennt betroffene Bilder und fordert zum manuellen Hochladen auf.
- Erfolgs-Toasts erscheinen erst nach tatsächlich erfolgreichem Speichern oder
  Datenbankstatuswechsel. Das Öffnen von Kleinanzeigen wird als gestarteter
  Vorgang bezeichnet, nicht als veröffentlichtes Inserat.

## Tests und Abnahme

- pgTAP: RLS, Rechte, Workspace-Trennung, Archivschutz, erlaubte und verbotene
  Statuswechsel, Parallelitätsschutz, eindeutiges offenes Inserat, Verkaufstrigger.
- Service: Laden, Workspacewechsel, Inhaltsupdate, Funktionsaufrufe,
  Erweiterungsdaten und Bildfehler.
- Angular/DOM: Tabellenzustände, Filter, Aktionssichtbarkeit, Bestätigungen,
  Editorvalidierung, ungespeicherte Änderungen, Tastatur und AXE.
- Navigation: Unterpunkte und aktive Zustände.
- Browser: Erstellen → Erweiterung öffnen → online setzen → beenden sowie neu
  einstellen.
- Abschluss: Format, Lint, Typen, Anwendungstests, Datenbanktests, Build und
  manuelle Sichtprüfung auf Desktop/Mobil sowie hell/dunkel.

## Nicht Teil dieses Projekts

- automatische Erkennung des echten Kleinanzeigen-Status oder der Aufrufzahlen;
- automatische Auswahl der Kleinanzeigen-Kategorie;
- Veröffentlichung auf eBay, Vinted, WhatsApp oder im Webshop;
- echte KI-Texterzeugung;
- neue Browser-Erweiterung oder Umgehung von Kleinanzeigen-Schutzmaßnahmen.
