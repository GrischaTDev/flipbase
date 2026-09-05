# Vinted Deal Monitor — Etappe 2: Filter, Treffer, Zustellung

**Stand:** 02.09.2026
**Baut auf:** `docs/superpowers/plans/2026-08-30-vinted-deal-monitor-etappe-1.md` (abgeschlossen)
**Status:** Entwurf abgenommen, Implementierungsplan steht aus

## Ausgangslage

Etappe 1 sammelt. Ein Dienst unter `services/sniper/` fragt Vinted-Katalogabfragen
ab, normalisiert die Antwort und schreibt sie nach `sniper_listings`. Belegt am
02.09.2026 mit 111 echten Funden aus einer Abfrage.

Was fehlt, ist alles danach: Ein Nutzer kann keinen Filter anlegen, es gibt keinen
Begriff von „Treffer", und niemand erfährt von einem Fund.

## Zielbild

Ein Nutzer legt in Flipbase einen Filter an. Der Dienst sammelt weiter wie bisher.
Wenn ein Fund **auffällig günstig für seine Art** ist, wird daraus ein Treffer, und
der Nutzer erfährt davon schnell genug, um zu handeln.

Der Unterschied zu vergleichbaren Diensten ist bewusst: Sie posten jeden Fund, der
durch den Filter passt, und überlassen die Bewertung dem Menschen. Hier entscheidet
das Werkzeug, ob ein Preis ungewöhnlich ist.

## Sichtbarkeit zwischen Arbeitsbereichen

Etappe 1 hat beide Tabellen arbeitsbereichsübergreifend angelegt, damit zwei Nutzer
mit demselben Filter sich über `query_key` **eine** Abfrage teilen und Vinted nur
einmal gefragt wird. Der Sparmechanismus ist richtig und bleibt.

Falsch ist nur die Sichtbarkeit: Heute sieht jeder Angemeldete alle Abfragen. Welche
Filter jemand beobachtet, ist seine Einkaufsstrategie — das darf nicht zwischen
Nutzern durchsickern. Die Funde selbst sind öffentliche Vinted-Angebote und
unkritisch.

Die Lösung ist keine Kopie je Arbeitsbereich, sondern eine Zuordnung.

## Datenmodell

### `sniper_query_subscriptions`

| Spalte                       | Zweck                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| `workspace_id`               | wem das Abonnement gehört                                              |
| `query_id`                   | auf welche geteilte Abfrage es zeigt                                   |
| `discount_threshold_percent` | ab wie viel Prozent unter dem Median ein Treffer entsteht, Standard 40 |
| `is_active`, `created_at`    |                                                                        |

Die Schwelle gehört an das Abonnement, nicht an die Abfrage: Zwei Nutzer mit
demselben Filter dürfen unterschiedlich streng sein.

RLS: Ein Arbeitsbereich sieht ausschließlich seine eigenen Abonnements. Die
Sichtbarkeit von `sniper_queries` hängt künftig daran statt an `using (true)`.

### `sniper_hits`

| Spalte                      | Zweck                                             |
| --------------------------- | ------------------------------------------------- |
| `subscription_id`           | zu wessen Abonnement der Treffer gehört           |
| `listing_id`                | welcher Fund                                      |
| `reference_price`           | der Median der Gruppe zum Zeitpunkt der Bewertung |
| `discount_percent`          | wie weit darunter                                 |
| `created_at`, `notified_at` |                                                   |

Ein Treffer gehört zum Abonnement, nicht zum Fund — eben weil die Schwelle je
Abonnent verschieden ist. Derselbe Artikel kann für den einen ein Treffer sein und
für den anderen nicht.

`reference_price` wird mitgeschrieben statt später neu berechnet. Der Median
verschiebt sich mit jedem neuen Fund; ohne den festgehaltenen Wert ließe sich
später nicht mehr nachvollziehen, warum etwas gemeldet wurde.

`notified_at` verhindert Doppelmeldungen über Neustarts des Dienstes hinweg.

## Schreibweg

`authenticated` darf weiterhin nicht in `sniper_queries` schreiben. Stattdessen eine
Datenbankfunktion:

```
create_sniper_subscription(search_text, brand_id, price_from, price_to, threshold)
```

Sie bildet den `query_key`, legt die Abfrage an **oder verwendet die vorhandene
wieder**, und erzeugt das Abonnement. `security definer` mit `set search_path = ''`,
weil der Aufrufer die Abfragetabelle selbst nicht beschreiben darf.

Damit bleibt der Sparmechanismus erhalten: Zwei Nutzer, eine Abfrage, ein Poll.

## Filterumfang

Der Sammler schickt heute `search_text`, `order=newest_first`, `page`, `per_page`
und optional `catalog_ids`, `brand_ids`, `price_to`.

Am 02.09.2026 gegen die echte Schnittstelle gemessen:

| Achse                           | Endpunkt                                           | Befund                                                 |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Marke                           | `/api/v2/brands?keyword=`                          | **200**, zehn Treffer je Suche mit Kennung (Nike = 53) |
| Größe, Zustand, Farbe, Material | `/api/v2/catalog/filters`                          | **200**, Achsen bestätigt, Optionen werden nachgeladen |
| Kategorie                       | `/api/v2/catalogs`, `/api/v2/catalog/initializers` | **404**, Endpunkt unbekannt                            |

**Marken sind eine Suche, keine Liste.** Das Formular bekommt ein Markenfeld mit
Vorschlägen, das während des Tippens bei Vinted nachfragt — es gibt nichts zu
pflegen. Das war die Sorge, die gegen ein eigenes Formular sprach, und sie ist
ausgeräumt.

Etappe 2 umfasst damit: **Suchbegriff, Preisspanne, Marke.**

Die Kategorie bleibt draußen, bis der Endpunkt gefunden ist. Sie ist keine
Voraussetzung.

## Trefferregel

**Ein Treffer ist ein Fund, dessen Artikelpreis mindestens `threshold` Prozent unter
dem Median seiner Gruppe liegt. Eine Gruppe ist eine Abfrage und ein Zustand.**

### Warum nach Zustand getrennt

Gemessen an den 111 echten Funden vom 02.09.2026:

| Zustand           | Funde |  Median |
| ----------------- | ----: | ------: |
| Sehr gut          |    59 | 20,00 € |
| Gut               |    25 | 14,00 € |
| Neu, mit Etikett  |    12 | 50,00 € |
| Zufriedenstellend |    10 | 10,00 € |
| Neu               |     5 | 35,00 € |

Ein gemeinsamer Median läge bei etwa 20 € — er würde jedes abgetragene Paar unter
20 € als Schnäppchen melden und ein neues für 34,99 € übersehen. Genau verkehrt
herum. Der Zustand ist der größte Preistreiber und steht in jedem Datensatz.

Die Größe zusätzlich einzubeziehen wäre genauer, lässt aber Gruppen von zwei bis
drei Werten übrig — daraus lässt sich kein Median bilden.

### Warum Prozent statt Ausreißerstatistik

Das klassische Verfahren (Q1 − 1,5 × Interquartilsabstand) wurde an denselben Daten
geprüft und **kann hier nicht auslösen**:

| Zustand           | Tukey-Grenze | Treffer Tukey | Treffer bei 30 % |
| ----------------- | -----------: | ------------: | ---------------: |
| Sehr gut          |      −7,50 € |             0 |               10 |
| Gut               |      −5,00 € |             0 |                5 |
| Zufriedenstellend |     −11,63 € |             0 |                1 |

In drei von fünf Gruppen liegt die Grenze im negativen Bereich. Gebrauchtpreise
streuen so breit, dass der Interquartilsabstand etwa so groß ist wie der Median
selbst; anderthalb Spannweiten darunter landen unter null.

Eine Perzentil-Regel („die günstigsten zehn Prozent") passt sich zwar an, meldet
aber **immer** zehn Prozent — auch wenn gerade nichts Gutes dabei ist. Die
Prozentmarke darf tagelang schweigen, und das ist richtig: An manchen Tagen gibt es
kein Schnäppchen.

**Nachtrag vom 04.09.2026:** Der Startwert liegt bei **40 Prozent**, nicht bei 30.
An 96 frisch gesammelten Funden gemessen haetten bei 30 Prozent **25 davon**
gemeldet - jeder vierte. Das ist kein Melder mehr, sondern ein Strom, und ein
Strom wird stummgeschaltet. Bei 40 Prozent sind es rund acht. Die Tabelle mit den
Tukey-Werten oben bezieht sich noch auf die 30-Prozent-Marke; sie bleibt stehen,
weil ihr Punkt ein anderer ist - das Ausreisserverfahren kann hier gar nicht
ausloesen, unabhaengig von der Schwelle.

Der Startwert ist kein Naturgesetz. Nach einigen Wochen echter Daten
lässt er sich je Abonnement nachjustieren.

### Zwei Schutzregeln

**Mindestzahl.** Eine Gruppe urteilt erst ab einer Mindestmenge an Funden. Bei fünf
Werten ist ein Median Zufall.

**Anschlagserkennung.** Klebt ein großer Teil einer Gruppe an der Preisgrenze der
Abfrage, schneidet die Grenze in die Verteilung und der Median ist wertlos. In den
Messdaten trifft das „Neu, mit Etikett" mit Median 50,00 bei Höchstwert 50,00 und
`price_to=50` — Neuware kostet dort mehr als die Grenze, also klebt alles am
Anschlag.

Ohne diese Regel bliebe das Werkzeug in genau der Kategorie stumm, in der die echten
Schnäppchen stecken. Es meldet stattdessen, dass der Maßstab unbrauchbar ist, und
schlägt vor, die Preisgrenze anzuheben.

### Wo gerechnet wird

In Postgres mit `percentile_cont`, aufgerufen vom Dienst, nachdem neue Funde
gespeichert sind. So sieht die Oberfläche dieselben Zahlen wie der Melder, und es
bleibt bei einer Abfrage statt einer Rechnung im Dienst.

## Zustellung

In dieser Reihenfolge zu bauen:

**1. Discord.** Der Dienst schickt bei einem neuen Treffer an einen Webhook: Bild,
beide Preise, Vergleich zum Gruppenmedian, Zustand, Verkäufer, Verweis auf den
Artikel. Braucht kein fertiges Frontend und ist damit der schnellste Weg zu etwas
Nutzbarem. `notified_at` verhindert Doppelmeldungen.

Der Webhook gehört je Arbeitsbereich hinterlegt, nicht global — und nicht in eine
Datei, sondern in eine Tabelle mit RLS. Es ist ein Zugangsschlüssel: Wer ihn hat,
schreibt in den Kanal.

**2. Trefferliste in der Oberfläche.** Ein Feature-Bereich unter
`src/app/features/deal-monitor/`, der `sniper_hits` mit den Funden verbindet: Bilder,
Preis gegen Gruppenmedian, Verweis auf Vinted. Zum Nachschauen und Vergleichen; zum
schnellen Zuschlagen ist er zu langsam, das leistet Discord.

**3. Browser-Benachrichtigung.** Service Worker, Berechtigung, VAPID-Schlüssel. Der
aufwendigste Teil und der letzte.

## Bewusst nicht in Etappe 2

- **Kategorie-Filter** — Endpunkt unbekannt, siehe oben
- **Detailseiten-Nachladen** für Verkäuferbewertung, Beschreibung, Land und
  Aktualisierungszeitpunkt. Der Katalog liefert sie nicht. Lohnend wäre es nur für
  Treffer, nicht für jeden Fund — und damit ein eigener, klar abgegrenzter Schritt
- **Preishistorie** eines bekannten Artikels — eigene Tabelle, Etappe 3
- **Automatischer Kauf** — braucht die Vinted-Sitzung des Nutzers, eine eigene
  Sicherheitsbetrachtung und eine bewusste Entscheidung
- **Aufbewahrungsfrist** auf `sniper_listings` — in Etappe 1 als Pflicht vermerkt,
  seit dort Verkäuferdaten liegen. Gehört zu Etappe 3, wird aber dringender, sobald
  der Dienst dauerhaft läuft

## Umfang: mehr als ein Plan

Das hier ist ein Entwurf, kein Arbeitspaket. Er zerfällt in drei Teile, die
nacheinander umgesetzt und einzeln abgenommen werden sollten:

1. **Datenmodell und Schreibweg** — die zwei Tabellen, die RLS-Umstellung auf
   Abonnements, die Anlege-Funktion. Danach kann ein Nutzer einen Filter besitzen,
   auch wenn noch nichts damit passiert.
2. **Trefferregel und Discord** — Medianberechnung, die zwei Schutzregeln, der
   Melder. Danach ist das Werkzeug nutzbar, ohne dass eine Angular-Komponente
   existiert.
3. **Oberfläche** — Formular mit Markensuche, Trefferliste, zuletzt der
   Browser-Push.

Jeder Teil bekommt einen eigenen Implementierungsplan. Teil 2 ist der, der den
eigentlichen Wert liefert; Teil 1 ist seine Voraussetzung.

## Offene Fragen für den Implementierungsplan

1. Mindestzahl je Gruppe — welcher Wert? Aus den Messdaten wären acht bis zehn
   plausibel, das sollte an mehr Abfragen geprüft werden.
2. Ab welchem Anteil am Anschlag gilt eine Gruppe als abgeschnitten?
3. Über welchen Zeitraum wird der Median gebildet — alle Funde der Abfrage oder ein
   gleitendes Fenster? Preise driften saisonal.
4. Was passiert mit Treffern, wenn ein Nutzer die Schwelle nachträglich ändert —
   rückwirkend neu bewerten oder nur ab jetzt?
