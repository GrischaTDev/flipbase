# Deal-Monitor: Sammelweg und Oberfläche

**Stand 06.09.2026.** Entwurf, kein Arbeitspaket — er zerfällt in mehrere Pläne
(siehe „Umfang" am Ende).

Dieser Entwurf setzt den Teil 3 aus
`2026-09-02-vinted-deal-monitor-etappe-2-design.md` um („Oberfläche") und ändert
dabei zwei Entscheidungen, die dort getroffen wurden. Die Gründe stehen unten in
gemessenen Zahlen.

## Ausgangslage

Der Deal-Monitor läuft, aber niemand kann ihn bedienen.

| Teil                                                          | Stand                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Dienst `services/sniper/`, pollt Vinted                       | steht                                                    |
| `sniper_queries`, `sniper_listings`, Abonnements, Treffer     | stehen                                                   |
| Trefferregel `sniper_evaluate_hits`, `sniper_reference_price` | steht                                                    |
| Schreibweg `create_sniper_subscription`                       | steht                                                    |
| **Oberfläche**                                                | **fehlt: keine Route, kein Menüpunkt, keine Komponente** |

Es gibt keinen Weg, eine Suche anzulegen oder einen Treffer zu sehen. Der
Monitor ist heute nur über SQL bedienbar.

## Messungen vom 06.09.2026

Alles Folgende wurde an diesem Tag gegen `www.vinted.de` gemessen, nicht
geschätzt.

### Die Kategorieliste ist beschaffbar

Der alte Entwurf hielt fest: `/api/v2/catalogs` und
`/api/v2/catalog/initializers` antworten mit 404, der Endpunkt sei unbekannt.
Das stimmt weiterhin. Es gibt aber einen anderen Weg: **Der vollständige
Kategoriebaum steht im HTML der Startseite**, in einem Next.js-Flight-Block
unter dem Schlüssel `catalogTree`.

```text
Wurzeln: 9 · Kategorien gesamt: 2920 · Tiefe: 5 Ebenen
Felder je Knoten: id, title, url, catalogs, photo

 1904 Damen (5)      2994 Elektronik (10)      1918 Home (12)
    5 Herren (4)     2309 Bücher & Medien (4)  4824 Hobby & Sammler (12)
 2993 Designer (2)   4332 Sport (12)           1193 Kinder (12)
```

Ein GET auf die Startseite, kein Login, kein Token. Die Kategorie ist damit
keine Sperre mehr.

### Sammeln nach reiner Kategorie funktioniert

`catalog_ids=1049` ohne `search_text` liefert HTTP 200 mit vollen Ergebnissen,
ebenso in Verbindung mit `price_to`. Der Sammler des Dienstes holt 96 Funde je
Anfrage.

### Der Zulauf entscheidet über die Anfragezahl — nicht die Kundenzahl

Zwei Abrufe derselben Kategorie im Abstand von drei und sechs Sekunden, gezählt
wurde die Überschneidung:

| Kategorie   | nach 3 s noch da | nach 6 s noch da | geschätzter Zulauf |
| ----------- | ---------------- | ---------------- | ------------------ |
| Damenschuhe | 65 von 95        | 45 von 94        | ~500–600 / Minute  |
| Elektronik  | 88 von 96        | 75 von 94        | ~160–200 / Minute  |

Daraus folgt der nötige Takt, damit bei 96 Funden je Seite keine Lücke entsteht:

| Zuschnitt                    | nötiger Takt | Anfragen je Minute |
| ---------------------------- | ------------ | ------------------ |
| Damenschuhe, ganze Kategorie | alle 10 s    | **6**              |
| Elektronik, ganze Kategorie  | alle 32 s    | ~2                 |
| Stiefel mit `price_to=50`    | 60 s reichen | <1                 |

Das Anfragebudget des Dienstes liegt bei 30 Anfragen je Minute
(`SNIPER_REQUESTS_PER_MINUTE`, gleitendes Fenster in `budget.ts`). Es reicht
also für etwa **fünf** breite Kategorien — nicht für 2920.

**Die sichere Sammeleinheit ist deshalb nicht „eine Kategorie", sondern „ein
Zuschnitt, dessen Zulauf unter 96 Funde je Takt bleibt".** In aller Regel heißt
das: Kategorie plus Preisobergrenze. Das passt zur Sache — gesucht werden
Schnäppchen, keine Designerware zum vollen Preis.

### Die Marke trennt den Preis stärker als der Zustand

480 Stiefel (Kategorie 1049), Mediane je Gruppe, nur Gruppen ab acht Funden:

| Gruppierung     | Spanne der Mediane | brauchbare Gruppen |
| --------------- | ------------------ | ------------------ |
| keine           | 17 € (ein Wert)    | —                  |
| nur Zustand     | 10 – 35 €          | 5                  |
| **nur Marke**   | **5 – 65 €**       | 9                  |
| Marke + Zustand | 5,50 – 65 €        | 6                  |

UGG und Dr. Martens liegen bei 65 €, H&M und Ware ohne Marke bei 10 €. Die
Marke trennt um Faktor 13, der Zustand nur um Faktor 3,5.

Was passiert, wenn die Marke unberücksichtigt bleibt und gegen den
Gesamtmedian von 17 € gemessen wird, bei 40 Prozent Schwelle:

- Eine **UGG für 35 €** — 46 Prozent unter dem UGG-Median — wird **nicht**
  gemeldet, weil 35 € über 17 € liegen. Das echte Schnäppchen rutscht durch.
- Ein **Paar ohne Marke für 9 €** — ein normaler Preis dafür — **wird**
  gemeldet, weil 9 € rund 47 Prozent unter 17 € liegen. Fehlalarm.

Genau verkehrt herum. Die Marke muss in die Gruppe.

## Zweck

**Der Monitor bekommt zwei Oberflächen, und der Sammelweg wird von den
Nutzerfiltern getrennt.**

- In der **Administration** wird eingestellt, _was_ der Bot dauerhaft abgrast,
  und beobachtet, _wie_ er läuft.
- Im **Arbeitsbereich** stellt jeder Nutzer ein, _was ihn interessiert_ und _wie
  streng_ er sein will, und sieht seine Treffer.

Der Bot bleibt ein einziger Dienst. Die Zahl seiner Vinted-Anfragen hängt an der
Zahl der Sammelaufträge, nicht an der Zahl der Kunden.

## Der Weg eines Funds

```text
1. Sammeln     ->  Sammelauftrag (Kategorie + Preisgrenze) pollt Vinted
2. Speichern   ->  jeder Fund einmal in sniper_listings
3. Bewerten    ->  Referenzpreis je Kategorie + Marke + Zustand
4. Zuordnen    ->  Nutzerfilter je Arbeitsbereich greifen auf die Funde zu
5. Melden      ->  Treffer in der Oberflaeche, Discord wie gehabt
```

Der entscheidende Unterschied zu heute: Schritt 1 und Schritt 4 sind getrennt.
Heute ist der Nutzerfilter zugleich die Vinted-Abfrage.

## Datenmodell

### Was bleibt

`sniper_listings` bleibt unverändert. Die Aufbewahrungsfrist darauf bleibt der
offene Punkt aus Etappe 1 — sie wird mit diesem Umbau dringend, weil deutlich
mehr Funde anfallen (siehe „Offene Punkte").

`sniper_hits` behält seinen Aufbau, hängt aber künftig am Merkzettel statt am
Abonnement: `subscription_id` wird zu `watchlist_id`, samt Eindeutigkeit
(`watchlist_id`, `listing_id`), Index und Lesepolicy. Ein Treffer gehört zu dem,
was ein Mensch eingestellt hat — und das ist nach diesem Umbau der Merkzettel.

### `sniper_queries` wird zum Sammelauftrag

Die Tabelle bleibt, ihre Bedeutung ändert sich: Eine Zeile ist künftig kein
Nutzerfilter mehr, sondern ein zentral gepflegter Sammelauftrag. Damit fällt
`search_text` als Pflichtfeld weg — ein Sammelauftrag ist in der Regel eine
Kategorie mit Preisobergrenze.

- `search_text` wird nullable. Ein Auftrag braucht **entweder** einen Suchtext
  **oder** eine Kategorie.
- `is_standard` fällt weg. Die Spalte wird nirgends gelesen — im Dienst nicht und
  in keiner Funktion. Sie ist toter Rest aus Etappe 1.
- `poll_interval_ms` bleibt und bekommt in der Oberfläche eine sichtbare
  Begründung: Der Takt muss zum gemessenen Zulauf passen.
- Neu: `notes text` — warum es diesen Auftrag gibt. Wer in einem halben Jahr auf
  die Liste schaut, soll nicht raten müssen.

### Neu: `vinted_categories`

Der Kategoriebaum wird **gespeichert, nicht bei jeder Anzeige geholt**. Sonst
hängt die Bedienoberfläche an einem HTML-Format, das Vinted jederzeit ändern
kann.

Spalten: `id` (die Vinted-Nummer, keine eigene), `parent_id`, `title`, `slug`,
`path` (lesbarer Pfad wie „Damen > Schuhe > Stiefel"), `is_leaf`, `updated_at`.
RLS: lesen dürfen alle Angemeldeten, schreiben nur der Dienst.

Der Stand des ganzen Baums steht **nicht** an jeder Zeile, sondern in einer
eigenen Einzeilentabelle `vinted_category_syncs`: wann zuletzt gelesen wurde, ob
jemand eine Auffrischung angefordert hat, was zuletzt schiefging. Ein Zeitpunkt
je Kategorie beantwortete die eigentliche Frage nicht — „wie alt ist meine
Liste" gilt für den Baum, nicht für einzelne Knoten. Über diese Tabelle stößt
die Administration das erneute Einlesen an: Sie setzt ein Feld, der Dienst sieht
es beim nächsten Takt. Der Dienst braucht dafür keinen offenen Eingang.

Ein Auffrischungslauf liest den Baum neu ein und meldet Abweichungen. Bricht das
Parsen, bleibt die gespeicherte Liste gültig und die Oberfläche funktioniert
weiter — sie zeigt dann nur an, dass die Liste alt ist.

### Neu: `sniper_watchlists` (der Nutzerfilter)

Tritt an die Stelle von `sniper_query_subscriptions` als Sache des Nutzers.

Spalten: `workspace_id`, `title` (frei wählbar), `catalog_id` (nullable),
`brand_id` (nullable), `search_text` (nullable), `price_from`, `price_to`,
`condition` (nullable), `discount_threshold_percent` (wie bisher, Standard 40),
`is_active`, `created_at`.

Ein Filter greift auf die bereits gesammelten Funde zu und löst **keine**
Vinted-Anfrage aus. Damit kann ein Nutzer beliebig viele anlegen, ohne dass es
jemanden etwas kostet.

`sniper_query_subscriptions` wird nicht gelöscht, sondern verliert seine Rolle
als Nutzerfilter: Es bleibt die Verbindung von Arbeitsbereich zu Sammelauftrag
für die Bestandsdaten. Die Migration überführt vorhandene Abonnements in
Merkzettel.

### Rechte

Alle Schreibwege bleiben RPC-Funktionen mit `security definer`, wie schon bei
`create_sniper_subscription`. Direkte `insert`-Rechte gibt es weiterhin nicht.

- `create_sniper_watchlist`, `update_sniper_watchlist`, `delete_sniper_watchlist`
  — prüfen `public.is_workspace_member(p_workspace_id)`.
- `upsert_sniper_query`, `set_sniper_query_active` — nur für die Administration.
  Die Befugnis liegt in der vorhandenen Betreiberprüfung aus
  `99_platform_admin.sql`, nicht in einer neuen Rolle.

## Trefferregel

**Die Gruppe wird Kategorie + Marke + Zustand, mit Rückfall auf Kategorie +
Zustand.**

`sniper_reference_price(p_query_id, p_condition)` wird zu
`sniper_reference_price(p_catalog_id, p_brand, p_condition)`. Der Rest der
Funktion bleibt, wie er ist, und das ist gut so:

- gleitendes Fenster von 14 Tagen,
- Mindestzahl acht Funde,
- Schutz gegen abgeschnittene Gruppen: liegt mehr als ein Drittel der Funde am
  Preislimit, ist der Median unbrauchbar und es wird nichts gemeldet.

Neu ist allein die Reihenfolge der Versuche:

1. Kategorie + Marke + Zustand. Genug Funde? Dann dieser Median.
2. Sonst Kategorie + Zustand.
3. Sonst nichts melden. **Kein Raten.**

Welche Stufe gegriffen hat, wird am Treffer festgehalten — sonst ist später
nicht nachvollziehbar, wogegen gemessen wurde. `sniper_hits.reference_price`
bleibt wie bisher der festgehaltene Wert; dazu kommt `reference_scope text`.

Der Preislimit-Schutz braucht dabei eine genauere Formulierung als bisher. Heute
gehören alle Funde einer Gruppe zu **einer** Abfrage und damit zu **einer**
Preisobergrenze. Künftig kann dieselbe Gruppe Funde aus mehreren Sammelaufträgen
mit verschiedenen Grenzen enthalten. Gezählt wird deshalb je Fund gegen die
Obergrenze des Auftrags, der ihn entdeckt hat (`discovered_by_query_id`) — liegt
über ein Drittel der Funde am jeweils eigenen Limit, bleibt die Gruppe
unbrauchbar.

## Oberfläche: Administration

Drei Seiten unter `/admin`, im Menü künftig **Administration**. (Nur der
Ordner heißt `platform-admin`; die Route heißt `/admin`.)

**1. Sammelaufträge.** Die Liste dessen, was der Bot abgrast: Kategorie (als
lesbarer Pfad), Preisgrenzen, Takt, Zustand der letzten Abfrage, Zahl der Funde
in den letzten 24 Stunden. Anlegen über einen Kategoriewähler auf Basis von
`vinted_categories` — Suchfeld und Baum, nicht 2920 Einträge in einer Liste.

Beim Anlegen zeigt das Formular die Rechnung: bei diesem Takt so und so viele
Anfragen je Minute, davon sind so viele im Budget frei. Wer einen zu breiten
Zuschnitt wählt, sieht das vorher statt es später zu merken.

**2. Botbetrieb.** Anfragen je Minute gegen das Budget, Anteil abgewiesener
Antworten, Aufträge im Zustand `rate_limited` oder `forbidden`, Aufträge, die
nach drei Fehlschlägen abgeschaltet wurden. Kein Diagramm um des Diagramms
willen: Diese vier Zahlen beantworten „läuft er noch und wie nah ist er an der
Grenze".

**3. Kategorieliste.** Wann zuletzt aufgefrischt, wie viele Kategorien, und ein
Knopf zum erneuten Einlesen. Für den Fall, dass Vinted das Seitenformat ändert,
ist hier zuerst sichtbar, dass etwas klemmt.

## Oberfläche: Arbeitsbereich

Ein Menüpunkt **Deal-Monitor** mit zwei Ansichten.

**Merkzettel.** Was mich interessiert: Kategorie, Marke, Preisspanne, Zustand,
Suchbegriff, Rabattschwelle. Das Markenfeld fragt beim Tippen bei Vinted nach
(`/api/v2/brands?keyword=`, in Etappe 2 als funktionierend gemessen); die
Kategorie kommt aus unserer gespeicherten Liste.

Der Merkzettel zeigt an, ob er überhaupt bedient wird: Liegt seine Kategorie in
keinem Sammelauftrag, steht dort „Für diesen Bereich sammelt der Monitor noch
nicht" statt einer leeren Liste. Das ist der wichtigste Hinweis der ganzen
Oberfläche — sonst wartet jemand wochenlang auf Treffer, die nie kommen können.

**Treffer.** Bild, Titel, Preis, Referenzpreis, Abstand in Prozent, Marke,
Zustand, Verweis auf Vinted. Dazu, gegen welche Gruppe gemessen wurde. Zum
Nachschauen und Vergleichen — zum schnellen Zuschlagen bleibt Discord der Weg,
das war schon die Feststellung aus Etappe 2.

## Umbenennung: Betreiber wird Administration

Der Code heißt bereits durchgehend englisch (`platform-admin`,
`PLATFORM_ADMIN`). Betroffen sind nur sichtbare Texte und Kommentare:

| Datei                                         | Stelle                        |
| --------------------------------------------- | ----------------------------- |
| `src/app/core/i18n/translations.ts`           | `PLATFORM_ADMIN: 'Betreiber'` |
| `src/app/layout/sidebar/sidebar.component.ts` | Label und Kommentar           |
| `src/app/layout/header/header.component.html` | Kommentar                     |
| `src/app/app.routes.ts`                       | zwei Kommentare               |

Die Route `/admin` bleibt, wie sie ist. Ein Pfadwechsel bräche
gespeicherte Verweise ohne Gegenwert.

## Bewusst nicht dabei

- **Automatischer Kauf.** Braucht die Vinted-Sitzung des Nutzers und eine eigene
  Sicherheitsbetrachtung. Unverändert außen vor.
- **Detailseiten nachladen** für Verkäuferbewertung, Beschreibung und Land.
  Lohnt sich nur für Treffer, nicht für jeden Fund — eigener Schritt.
- **Browser-Benachrichtigung.** Service Worker und VAPID-Schlüssel, der
  aufwendigste Teil aus Etappe 2. Bleibt hinten.
- **Preishistorie** eines bekannten Artikels.
- **Automatisches Anlegen von Sammelaufträgen** aus Nutzerwünschen. Verlockend,
  aber es gibt genau den Kostentreiber zurück, den dieser Umbau beseitigt.

## Umfang: vier Pläne

Nacheinander umzusetzen und einzeln abzunehmen:

1. **Kategorieliste** — Tabelle, Einlesen aus dem Seitenkopf, Auffrischung,
   Administrationsseite. Unabhängig von allem anderen baubar und Voraussetzung
   für den Kategoriewähler.
2. **Sammelaufträge** — Umbau von `sniper_queries`, die RPC-Funktionen, die
   Administrationsseiten für Aufträge und Botbetrieb. Danach lässt sich
   steuern, was gesammelt wird.
3. **Trefferregel** — neue Gruppe mit Rückfall, `reference_scope` am Treffer,
   Anpassung von `sniper_evaluate_hits`. Der Teil, der über Nutzen oder
   Rauschen entscheidet.
4. **Nutzeroberfläche** — Merkzettel und Treffer im Arbeitsbereich.

Die Umbenennung von „Betreiber" auf „Administration" wandert in Paket 1: Dort
entsteht ohnehin die erste neue Seite in diesem Bereich, und es wäre seltsam,
sie unter einem Namen anzulegen, der bald ein anderer ist.

Teil 1 und 2 gehören zusammen; Teil 3 ist der wertvollste; Teil 4 ist der
sichtbarste.

## Offene Punkte

1. **Aufbewahrungsfrist entschieden am 12.09.2026:** Der Nutzer wählt 30 Tage
   seit Erstfund für Artikel samt zugehörigen Treffern. Umsetzung in Paket 3:
   Bereinigung in Paketen durch den Bot, Aufträge und Abonnements bleiben
   erhalten. Der Referenzpreis nutzt weiterhin nur die letzten 14 Tage.
2. **Welche Sammelaufträge zum Start?** Eine fachliche Entscheidung, keine
   technische. Der Zuschnitt bestimmt, was der Monitor überhaupt finden kann.
3. **Zulauf je Auftrag messen statt schätzen.** Der nötige Takt lässt sich aus
   den eigenen Daten ableiten, sobald gesammelt wird: Wie viele Funde je
   Abfrage waren neu? Nähert sich der Wert 96, ist der Takt zu langsam. Das
   gehört als Kennzahl in die Betriebssicht.
4. **Verhalten bei `forbidden`.** Heute wird nach drei Fehlschlägen abgeschaltet.
   Ob ein Rückzug mit wachsender Wartezeit besser wäre, ist offen — dafür fehlen
   Beobachtungen aus dem Dauerbetrieb.
