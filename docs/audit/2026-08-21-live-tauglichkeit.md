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

## Schwer: Erfundenes wird als echt ausgegeben

Dasselbe Muster wie bei der Sendungsverfolgung, die am 20.08. bereinigt wurde.
Diese Stellen sind noch offen:

| Funktion                    | Fundstelle                                                                           | Was wirklich passiert                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versandmarke kaufen         | [fulfillment.service.ts:604](../../src/app/core/services/fulfillment.service.ts)     | Wartet 800 ms und **erfindet eine Sendungsnummer** im echten DHL-Format (`00340434…`). Es wird keine Marke gekauft, nichts gedruckt. Die Nummer wandert an Käufer. |
| Vergleichspreise (Research) | [research.service.ts:406](../../src/app/core/services/research.service.ts)           | Erzeugt „verkaufte" Angebote mit Zufallspreisen ±22 % um einen Schätzwert, mit erfundenen Titeln, Plattformangaben und Daten. Grundlage für Preisentscheidungen.   |
| Preis-Radar                 | [price-tracker.service.ts:315](../../src/app/core/services/price-tracker.service.ts) | Marktpreise ändern sich je Abruf um einen **Zufallsfaktor** ±4 %, Angebotszahlen sind Zufall. Daraus entstehen Warnungen wie „unterboten" — aus Rauschen.          |
| KI-Foto-Scan                | [ai-assistant.service.ts:168](../../src/app/core/services/ai-assistant.service.ts)   | Keine Bilderkennung. Wartet 500 ms „für realistisches Gefühl" und rät das Produkt aus dem **Dateinamen**.                                                          |

Zusätzlich in [fulfillment.service.ts:604](../../src/app/core/services/fulfillment.service.ts):
Wird der Versandauftrag nicht gefunden, greift `if (!order) order = this.orders()[0]`
— dann wird stillschweigend **ein fremder Auftrag** bearbeitet.

---

## Bereits behoben (20./21.08.2026)

| Befund                                                                 | Commit    |
| ---------------------------------------------------------------------- | --------- |
| 15 Schreibbefehle wurden nie abgeschickt (fehlendes `await`)           | `c1b0fda` |
| Lokaler Spiegel als Quelle im angemeldeten Betrieb                     | `246766d` |
| Sendungsverfolgung erfand Stationen und Zustellprognose                | `f09dca1` |
| Benachrichtigung verlinkte ins Nichts, „gelesen" wurde nie gespeichert | `4d4bc75` |
| Einzelkauf erzeugte keinen Inventar-Artikel                            | `714cbf4` |
| Einkaufsart in Meldungen falsch benannt                                | `b8ad6fa` |

---

## Noch nicht abschließend geprüft

- **117 leere `catch`-Blöcke.** Viele davon sind harmlos (Browser-Speicher
  nicht verfügbar), aber jeder verschluckt im Zweifel einen echten Fehler. Muss
  einzeln durchgesehen werden.
- **20 Stellen mit `.then(…)` ohne Fehlerbehandlung.** Werden ausgeführt, aber
  ein Fehler bleibt unsichtbar.
- **Behelfskennungen ohne Austausch:** Bei Benachrichtigungen wurde die
  vorläufige Kennung durch die der Datenbank ersetzt. Rechnungen, Shop-Bestellungen
  und Einladungen erzeugen ähnliche Kennungen — ob dort getauscht wird, ist offen.
- **Rechtstexte** (Datenschutz, AGB, Widerrufsbelehrung) im Shop: Inhalt nicht
  geprüft.

---

## Vorgeschlagene Reihenfolge

1. Shop öffentlich sperren (Minuten, beseitigt die rechtliche Aussetzung)
2. Erfundene Daten entweder abschalten oder klar als Schätzung kennzeichnen —
   angefangen bei der Versandmarke, weil deren Nummer nach außen geht
3. Die verbliebenen Fehlerschlucker durchgehen
4. Erst danach: Funktionen echt anbinden (Zahlungsanbieter, Zusteller, Marktdaten)
