# Prüfung der Live-Tauglichkeit — 21.08.2026

Anlass: Die Anwendung läuft seit dem 20.08.2026 öffentlich unter
`app.flipbase.de`. Vorher waren an mehreren Stellen Daten stillschweigend
verlorengegangen oder erfunden. Diese Prüfung sucht systematisch nach
demselben Muster im Rest der Anwendung.

Jeder Befund ist mit Fundstelle belegt und wurde nachgeprüft — entweder im
Quelltext, in der laufenden Anwendung oder in der Produktivdatenbank.

---

## Sofort: der Shop ist öffentlich und gibt vor, ein echter Händler zu sein

**`https://app.flipbase.de/shop` ist ohne Anmeldung erreichbar.** Nachgeprüft
am 21.08.2026 im Browser. In [app.routes.ts](../../src/app/app.routes.ts)
liegt der Zweig `shop` außerhalb des `authGuard`.

Drei Dinge machen das gefährlich, unabhängig voneinander:

### 1. Erfundene Pflichtangaben

Die Seite zeigt im Fußbereich ein vollständiges Impressum:

> Flipbase Reselling · Musterstraße 12 · 10115 Berlin ·
> service@flipbase-store.de · Tel: +49 (0) 30 12345678 ·
> USt-IdNr.: DE 123456789 (Differenzbesteuert gem. § 25a UStG)

Diese Angaben stammen aus [store.service.ts:59](../../src/app/core/services/store.service.ts)
und sind Platzhalter. Anschrift, Telefonnummer und Umsatzsteuer-Identifikations­nummer
existieren nicht. Dazu Aussagen wie „GEPRÜFTER HÄNDLER", „100 %
Funktionsgarantie" und „Käuferschutz".

Ein geschäftsmäßig auftretender deutscher Auftritt unterliegt der
Impressumspflicht; falsche Angaben und unbelegte Werbeaussagen sind
abmahnfähig. Die genaue rechtliche Einordnung gehört zu einer Anwältin oder
einem Anwalt — die Feststellung hier ist nur: **die Angaben sind erfunden und
öffentlich sichtbar.**

### 2. Die Bezahlung ist vorgetäuscht

[store.service.ts:327](../../src/app/core/services/store.service.ts),
`processStripePayment`:

```ts
async processStripePayment(_amount, _cardDetails) {
  await new Promise((res) => setTimeout(res, 50));
  return { success: true, transactionId: 'ch_stripe_' + Math.random()... };
}
```

Betrag und Kartendaten werden nicht benutzt (die Unterstriche sagen es), es
wird 50 Millisekunden gewartet und **immer Erfolg gemeldet**. Für PayPal
dasselbe. Die Bestellung wird danach als **bezahlt** geführt, ohne dass Geld
geflossen ist.

### 3. Es wird nach Kartennummern gefragt

Die Kasse hat ein Feld „Kartennummer"
([store-checkout.component.html:327](../../src/app/features/store/pages/store-checkout/store-checkout.component.html)).
Die Nummer wird nirgendwohin übertragen — nur die letzten vier Ziffern gehen
in die vorgetäuschte Zahlung. Aber eine öffentlich erreichbare Seite, die
Fremde nach Kartennummern fragt, ist unabhängig davon nicht vertretbar.

**Entschärfend:** Derzeit ist kein Artikel im Shop gelistet (nachgeprüft, null
Produkte). Der Weg zur Kasse ist damit praktisch versperrt — aber die Seite
selbst steht offen.

**Empfehlung:** Den Shop hinter den `authGuard` legen oder in Caddy sperren,
bis Impressum, Bezahlung und Rechtstexte echt sind. Das ist ein Handgriff und
sollte vor allem anderen passieren.

---

## Erfundene Daten - erledigt

Alle vier Stellen aus der ersten Fassung sind abgeschaltet oder ehrlich
gemacht. Nichts davon zeigt noch Zahlen, die nach Marktdaten aussehen.

| Funktion                    | Was daraus wurde                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Versandmarke kaufen         | Einstieg ausgeblendet, Funktion verweigert. Der ehrliche Weg (Marke beim Zusteller kaufen, echte Nummer eintragen) war schon da. |
| Vergleichspreise (Research) | Rueckfall entfernt. Ohne Anbindung sagt die Seite das - mit Verweis auf die echten Plattform-Links.                              |
| Preis-Radar                 | Scan-Knopf weg, Hinweis "Marktdaten sind nicht angebunden". Beobachtete Artikel bleiben.                                         |
| KI-Foto-Scan                | Beide Einstiege ausgeblendet. Das Autofill daneben bleibt - es liest, was der Nutzer selbst getippt hat.                         |

Nebenbefund: Die eBay-Anbindung haette ohnehin nie funktioniert. Sie braucht
einen `EBAY_APP_ID`, und die zugehoerige Edge Function liegt gar nicht auf dem
Server - dort stehen nur `hello` und `main`.

## Weitere Funde beim Durchgehen der Bereiche

| Bereich         | Befund                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Steuern & DATEV | `bank_transactions` wurde **nur gelesen, nie geschrieben** (null Zeilen auf dem Server). Der gesamte Kontenabgleich lag im Speicher eines Browsers. Behoben. |
| Steuern & DATEV | "Demo-Kontoauszug laden" legte sechs erfundene Bankbewegungen an, die sich echten Bestellungen zuordnen liessen. Jetzt nur noch im Demo-Modus.               |
| Inventar        | Bild-Upload meldete jeden Fehlschlag als Erfolg. Foto war nach dem Neuladen weg, ohne Hinweis. Behoben.                                                      |
| Analytics       | Die Heatmap wertete Tageszeiten aus, obwohl `sale_date` keine Uhrzeit hat - alle drei Zeitspalten standen immer auf null. Auf Wochentage reduziert.          |
| Listing Studio  | Der Steuerhinweis stand an vier Stellen fest auf § 25a, obwohl drei Modi einstellbar sind. Wird jetzt aus der Einstellung abgeleitet.                        |
| Verkaeufe       | Die Verkaufsmeldung ging vor dem Speichern raus - auch nach Discord und Telegram. Jetzt danach.                                                              |

Unauffaellig geblieben: DATEV-Export und Steuerrechnung (20 Tests decken
Belegdatum, Buchungsrichtung, EXTF-Kopf, Vorsteuer und Formelschutz ab),
Analytics im Uebrigen, Einstellungen, Deal Calculator, Barcode-Suche (echte
Open-Food-Facts-Abfrage).

## Bereits behoben (20./21.08.2026)

| Befund                                                                 | Commit    |
| ---------------------------------------------------------------------- | --------- |
| 15 Schreibbefehle wurden nie abgeschickt (fehlendes `await`)           | `c1b0fda` |
| Lokaler Spiegel als Quelle im angemeldeten Betrieb                     | `246766d` |
| Sendungsverfolgung erfand Stationen und Zustellprognose                | `f09dca1` |
| Benachrichtigung verlinkte ins Nichts, "gelesen" wurde nie gespeichert | `4d4bc75` |
| Einzelkauf erzeugte keinen Inventar-Artikel                            | `714cbf4` |
| Einkaufsart in Meldungen falsch benannt                                | `b8ad6fa` |
| Planungsverweise in der Oberflaeche, Shop als DEMO gekennzeichnet      | `6bd8b1f` |
| Bild-Upload meldete Fehlschlag als Erfolg                              | `afd338a` |
| Erfundene Marktdaten abgeschaltet                                      | `8a75b89` |
| Erfundene Sendungsnummern beim Versand                                 | `b7b2596` |
| Bankabgleich wird in der Datenbank gespeichert                         | `2817870` |
| Heatmap ohne Uhrzeit-Auswertung                                        | `dc74b9e` |
| Steuerhinweis im Inserat aus der Einstellung                           | `7ca3068` |
| Verkaufsmeldung erst nach dem Speichern                                | `e41f6e2` |

## Offen

- **Der Shop** bleibt geparkt: erfundenes Impressum, erfundene USt-IdNr.,
  vorgetaeuschte Bezahlung. Er zieht spaeter auf eine eigene Domain um und ist
  bis dahin hinter der Anmeldung, im Menue als DEMO gekennzeichnet.
- **Nicht selbst pruefbar:** Ob der Bankabgleich wirklich in der Datenbank
  landet, laesst sich nur mit einem angemeldeten Konto sehen. Einmal einen
  Kontoauszug importieren, dann in `bank_transactions` nachzaehlen.
- **Zwei Werbeaussagen** im erzeugten Inserat sind Zusagen, die der Verkaeufer
  ungefragt macht: "Schneller Versand innerhalb von 24 Stunden nach
  Zahlungseingang" und "Sichere und gepolsterte Verpackung garantiert".
  Bewusst nicht stillschweigend geaendert - das ist eine Entscheidung des
  Betreibers, keine Fehlerkorrektur.
- **Systemnachrichten vom Betreiber** (Wartung, News an alle Kunden) sind ein
  eigenes Vorhaben und zurueckgestellt.
- Die verbliebenen leeren `catch`-Bloecke betreffen den Browser-Speicher, Ton,
  Geraete-APIs und den Research-Verlauf - dort steht nichts vom Nutzer auf dem
  Spiel.
