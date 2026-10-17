# Kategorieauswahl für den Wiederverkauf eingrenzen

Stand: 17.10.2026. Assistent: Juna. **Am 17.10.2026 zur Umsetzung freigegeben. Filter im eigenen Kategorie-Zweig umgesetzt; Originaldaten und bestehende Zuordnungen bleiben erhalten. Noch kein Deployment.**

## Auftrag und untersuchte Quellen

Die Kategorieauswahl bleibt für den breiteren Wiederverkauf offen. Der Nutzer hat am 17.10.2026 die zunächst vorgeschlagene Beschränkung auf Mode korrigiert: Technik, Haushalt, Beauty, allgemeine Babyausstattung, Sport und Medien/Hobby sollen ebenfalls erhalten bleiben. Damen-, Herren-, Kinder- und Babykleidung bleibt vollständig enthalten. Die folgenden Entscheidungen bilden nach der anschließenden ausdrücklichen Nutzerfreigabe die Grundlage der Auswahlfilter.

| Quelle                                       |                       Untersucht | Stand und Nachweis                                                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flipbase (ursprüngliche Datenquelle Shopify) |  14.539 Knoten, 21 Hauptbereiche | Version 2026-08 aus der vorhandenen Importmigration; Anzahl, aktive Zeilen, Hauptbereiche und Version lesend mit der Produktionsdatenbank abgeglichen                                                                       |
| Vinted                                       | 2.920 Knoten, neun Hauptbereiche | Vollständiger gespeicherter Produktionsbaum, ausschließlich lesend exportiert; letzte erfolgreiche Auffrischung 09.10.2026. Der letzte Versuch meldet HTTP 307. Dieser Bericht behauptet keinen neuen Live-Scan von Vinted. |
| Kleinanzeigen                                |   3.239 Knoten, 15 Hauptbereiche | Vollständiger Browser-Scan vom 17.10.2026 aus dem eigenen Kategorie-Zweig                                                                                                                                                   |

Alle drei Bestände auf eindeutige Kennungen, vorhandene Eltern, Erreichbarkeit aller Knoten und konsistente Namen/Pfade geprüft. Keine fehlenden Eltern oder widersprüchlichen Pfade festgestellt. Bei Shopify sind Dienstleistungen, Gutscheine, Bundles, Produkt-Add-Ons und „Nicht kategorisiert“ bereits beim Import ausgeschlossen; die anschließend freigegebenen zusätzlichen Ausschlüsse sind im eigenen Kategorie-Zweig umgesetzt.

## Freigegebene Bereiche behalten

| Bereich                                | Enthaltene Beispiele                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Kleidung, Schuhe und Modeaccessoires   | Damen, Herren, Kinder, Babys, Sport-/Arbeits-/Motorradbekleidung, Taschen, Schmuck, Uhren, Designerartikel und Kleidungspakete |
| Elektronik und Software                | Technik, Computer, Kameras, Konsolen, Software, Smartwatches und Fitness-Tracker                                               |
| Haushalt und Einrichtung               | Möbel, Dekoration, Bettwäsche, Heimtextilien, Küchen- und Haushaltsgeräte                                                      |
| Beauty und Gesundheit                  | Pflegeprodukte, Kosmetik, Parfüm, Hygiene- und Gesundheitsartikel                                                              |
| Allgemeine Baby- und Kinderausstattung | Kinderwagen, Autositze, Babyphone, Flaschen, weitere Ausstattung und textile Babysachen                                        |
| Sportgeräte und Camping                | Sportgeräte, Fitnessausrüstung, Zelte, Campingbedarf und Sportausstattung                                                      |
| Medien, Spielzeug und Hobby            | Bücher, Musik, Filme, Spielzeug, Sammelkarten, Instrumente, Bastel- und Hobbybedarf                                            |

Die anschließende Nutzerfreigabe „setze die Filter jetzt ... entsprechend um“ bestätigt das Behalten der genannten Bereiche.

Die früher vorgeschlagenen Ausschlüsse von Elektronik, Möbeln, Beauty, Babyausstattung, Sportgeräten und Medien sind aufgehoben. Das gilt auch für daraus abgeleitete Einschränkungen: Smartwatches/Fitness-Tracker werden nicht mehr als Elektronik ausgeschlossen; Sporthelme und Protektoren nicht pauschal als Sportausrüstung. Nähmaschinen, Stoffe und Schnittmuster werden nicht allein wegen des fehlenden Modebezugs ausgeschlossen, da Hobby erhalten bleiben soll. Konkrete Überschneidungen mit ausgeschlossenem Gewerbe-/Baubedarf anhand des tatsächlichen Unterbereichs prüfen.

## Freigegebene Bereiche ausschließen

| Bereich                         | Gemeinte Inhalte                                                                                  | Bekleidung und andere Abgrenzungen                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs und Dienstleistungen       | Stellenangebote, angebotene Dienstleistungen, Betreuung, Reparatur- und Transportleistungen       | Arbeitskleidung ist ein Produkt und bleibt erhalten.                                                                                                                                                                        |
| Fahrzeuge und Immobilien        | Autos, Motorräder, Fahrräder, Boote, Wohnmobile, Fahrzeugteile, Häuser, Wohnungen und Grundstücke | Motorrad-/Rennbekleidung und passende Schuhe/Handschuhe bleiben Bekleidung. Fahrräder nicht wegen der Einordnung unter Sport wieder freigeben. Kinderwagen und Autositze bleiben nach ausdrücklicher Entscheidung erhalten. |
| Garten-, Bau- und Gewerbebedarf | Pflanzen, Gartenbedarf, Bau-/Heimwerkerbedarf, Werkzeuge, Maschinen und gewerblicher Bedarf       | Haushaltsgeräte und Einrichtung bleiben erhalten. Arbeitskleidung und Sicherheitsschuhe nicht allein aufgrund ihres übergeordneten Bereichs entfernen.                                                                      |
| Tiere und Lebensmittel          | Tiere, Tierbedarf einschließlich Tierkleidung/-futter sowie Lebensmittel und Getränke             | Menschliche Bekleidung bleibt erhalten. Beauty-/Gesundheitsartikel nicht mit Lebensmitteln gleichsetzen; tatsächliche Lebensmittel auch unter Hobby oder Haushalt ausschließen.                                             |

Die vier genannten Ausschlussbereiche haben bei fachlichen Überschneidungen Vorrang: Ein Fahrrad bleibt ein Fahrzeug, auch wenn es unter „Sport“ steht; ein Tierprodukt bleibt Tierbedarf, auch wenn es unter „Home“ steht. Die ausdrücklich genannten Ausnahmen haben wiederum Vorrang vor dem bloßen Namen eines Oberbereichs. Einfache Wortfilter reichen dafür nicht: „Damen“ gibt es auch bei Fahrrädern, „Kabelschuhe“ sind keine Schuhe, Kinderwagen sollen ausdrücklich erhalten bleiben.

## Noch nicht ausdrücklich entschiedene Bereiche

Es gibt keine gesonderte Ausschlussentscheidung zu Eintrittskarten, Tabak, Waffen, Erotikartikeln, religiösen Artikeln oder allgemeinen Verschenken-/Tauschen-/Verleihen-Kategorien. Auch die frühere Sonderempfehlung zu Reisegepäck und einzelnen Hilfsmitteln wurde nicht bestätigt. Diese Bereiche werden deshalb durch diese Änderung nicht zusätzlich ausgeblendet.

## Konkrete Auswirkungen je Baum

### Kleinanzeigen

- `153` Mode & Beauty einschließlich `153/224` Beauty & Gesundheit behalten.
- `161` Elektronik und `17` Familie, Kind & Baby einschließlich allgemeiner Ausstattung behalten. Die zuvor vorgeschlagene Beschränkung auf Baby-/Kinderkleidung und Schuhe entfällt.
- `80` Haus & Garten aufteilen: Einrichtung, Heimtextilien und Haushaltsartikel behalten; `80/89` Gartenzubehör & Pflanzen, `80/84` Heimwerken und `80/239` Dienstleistungen Haus & Garten ausschließen.
- `185` Freizeit, Hobby & Nachbarschaft und `73` Musik, Filme & Bücher grundsätzlich für Waren erhalten. `185/230` Sport & Camping bleibt erhalten; die Dienste `185/191` Künstler/-in & Musiker/-in und `185/233` Reise & Eventservices fallen unter Dienstleistungen, `185/248` Essen & Trinken unter Lebensmittel.
- `210` Auto, Rad & Boot ausschließen, Bekleidungsausnahme `210/306/kleidung` erhalten. `195` Immobilien, `102` Jobs, `297` Dienstleistungen und `130` Haustiere ausschließen. Weitere Dienstleistungsunterbereiche ebenfalls nach Inhalt ausschließen.
- Die frühere enge Prüfvariante mit 95 Knoten ist mit diesem breiteren Umfang nicht mehr maßgeblich. Neue Zielzahlen erst aus der abschließend abgestimmten Abgrenzung ableiten.

### Vinted

- `1904` Damen und `5` Herren einschließlich Beauty/Körperpflege behalten; `146` und `139` nicht mehr ausschließen.
- `1193` Kinder einschließlich Ausstattung behalten; `2993` Designerartikel, `2309` Bücher & andere Medien und `2994` Elektronik bleiben erhalten.
- `1918` Home behalten, ausgeschlossene Unterbereiche gezielt entfernen: `3811` Werkzeuge & Heimwerken, `3812` Außenbereich & Garten und `5106` Haustierbedarf. Vorhandene passende Bekleidungsunterkategorien bleiben Ausnahmen.
- `4332` Sport behalten; Fahrzeuge darin ausschließen, insbesondere tatsächliche Fahrräder unter Fahrradfahren. Fahrrad-/Campingbekleidung oder Autositze nicht als Fahrräder behandeln.
- `4824` Hobby- & Sammlerartikel behalten. Lebensmittel und andere ausdrücklich ausgeschlossene Inhalte werden anhand ihrer Kennungen unabhängig vom Hauptbereich behandelt.

### Interne Flipbase-Kategorien

- `aa` Bekleidung & Accessoires und `lb` Taschen & Gepäck nicht mehr ausschließlich nach Modebezug ausdünnen. Die Sonderempfehlung zu Reisegepäck bleibt offen.
- `co` Kameras & Optik, `el` Elektronik, `so` Software, `fr` Möbel, `hb` Gesundheit & Schönheit, `bt` Baby & Kleinkind, `sg` Sportartikel, `me` Medien, `tg` Spielzeuge & Spiele und `ae` Kunst & Unterhaltung bleiben grundsätzlich erhalten.
- `hg` Heim & Garten aufteilen: Haushalt, Einrichtung, Heimtextilien und Geräte bleiben; Garten und entsprechende Dienstleistungen werden entfernt. `hg-12` Rasen & Garten sowie `hg-17` Pflanzen werden ausgeschlossen. Tierbezogene Dekoration und Vogel-/Futterspender unter `hg-3-7` bis `hg-3-11` fallen unter Tierbedarf. Passende Kleidung wie Schürzen bleibt erhalten.
- `ha` Heimwerkerbedarf und `bi` Wirtschaft & Industrie fallen unter Bau-/Gewerbebedarf, mit bestehenden Bekleidungsausnahmen; `ap` Tiere & Tierbedarf und `fb` Nahrungsmittel, Getränke & Tabak nicht pauschal ohne Beachtung der offenen Tabakentscheidung gleichsetzen. Lebensmittel-/Getränkeäste konkret bestimmen.
- `vp` Fahrzeuge & Teile grundsätzlich ausschließen, passende Motorrad-/Rennbekleidung erhalten. Sportartikel dürfen tatsächliche Fahrräder, Fahrzeuge und deren Teile nicht versehentlich wieder zur Auswahl hinzufügen. Pferdebedarf einschließlich Sattel-/Zaumzeug, Voltigier- und Stallbedarf sowie Jagdhund-Ausrüstung und Wildtierfutter werden als Tierbedarf ebenfalls ausgeschlossen; menschliche Reitausrüstung bleibt erhalten.
- Weitere Hauptbereiche und frühere Sonderausschlüsse nicht allein aufgrund des alten Vorschlags entfernen, sondern erst nach der abschließenden inhaltlichen Prüfung zuordnen.

## Bestandsschutz bei der Umsetzung

Die Originalbäume und Anbieterkennungen intern erhalten und die Auswahl auf den abgestimmten Umfang begrenzen. Vorhandene Artikel und Inserate mit später ausgeblendeten Kategorien müssen weiter lesbar und bearbeitbar bleiben. Keine Kategorien löschen, die bestehende Datensätze referenzieren. Suchergebnisse und aufklappbare Ebenen müssen dieselbe Auswahl zeigen.

Die Eingrenzung erweitert keine Veröffentlichungsfreigaben. Das Behalten von Technik-, Baby- oder anderen Kategorien bedeutet nicht automatisch, dass jeder Veröffentlichungsweg diese Bereiche bereits unterstützt.

## Umsetzung und Prüfung

Die Auswahlfilter verwenden ausschließlich geprüfte Anbieterkennungen und echte Elternpfade. Sie ändern keine Tabellen, Originaldatensätze oder gespeicherten Zuordnungen. Ausgeblendete Werte bleiben über getById lesbar; notwendige Eltern bleiben ausschließlich als nicht auswählbare Navigationspfade sichtbar. Die internen Datenbankabfragen filtern vor der Ergebnisbegrenzung. Es gibt keine Laufzeitverbindung zu Shopify und keinen automatischen Shopify-Abgleich. Die allgemeine Liste heißt Flipbase-Kategorien; historische Importe, Kennungen und Herkunfts-/Lizenznachweise bleiben erhalten.

Der konkrete Umfang, die tatsächlich ausgeführten Prüfungen und der nächste eBay-Schritt stehen in [der Umsetzungsdokumentation](../implementation/resale-category-selection.md). Der breite PR-Prüflauf und eine Veröffentlichung sind gesonderte nächste Schritte.
