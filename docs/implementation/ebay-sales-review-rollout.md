# eBay: gespeicherte Listen und Verkaufsprüfung betreiben

Stand: 23. Oktober 2026. Dieser Ablauf ergänzt die historische
[Ersteinrichtung](ebay-production-rollout.md).
Er beschreibt den freigegebenen Ausbau; eine lokale Prüfung allein bestätigt
keine produktiv aktualisierten Hintergrunddienste.

## Fachlicher Ablauf

- Neue Verbindungen übernehmen zunächst still die letzten 90 Tage und die aktiven
  Inserate. Historische Bestellungen werden zuerst abgeglichen: einem vorhandenen
  vollständigen eBay-Verkauf zuordnen, ausdrücklich neu vorbereiten oder als
  tatsächlich außerhalb von Flipbase erfasst kennzeichnen.
- Eine neue belegte Zahlung nach der abgeschlossenen Erstbasis erzeugt eine
  Meldung. Ist die Bestellung vollständig mit Bestand verknüpft, entsteht ein
  dauerhafter Verkaufsentwurf mit eigener sofortiger Mengenreservierung. Eine
  fehlende Zuordnung bleibt zur Bearbeitung sichtbar. Ein Versandupdate allein
  macht aus einer historisch bezahlten Bestellung keinen neuen Verkauf.
- Der Entwurf zählt nicht als endgültiger Verkauf und erzeugt weder Umsatz,
  Gewinn noch Rechnung. Belegte eBay-Gebühren und Käuferporto werden getrennt
  vorbereitet. Fehlende tatsächliche Versandkosten ergänzt Du selbst. Ein
  unbekannter Kostenwert ist keine bestätigte Null.
- Erst die Bestätigung liest die konkrete Bestellung erneut und bucht Verkauf,
  eigenen Bestandsabgang und Quellenbeleg gemeinsam. Eine unklare Antwort zuerst
  über den gespeicherten Buchungsstatus klären; die Wiederholung darf keinen
  zweiten Verkauf erzeugen.
- Die Zuordnung zu einem vorhandenen Verkauf verwendet dessen Positionen, auch
  bei bereits verkauften Artikeln. Bestätigte Altbeträge und Bestandsabgänge
  bleiben erhalten. Eine Bestellung wird im ersten Ausbau vollständig einem
  vollständigen Verkauf zugeordnet.

## Hintergrundabgleich und Fehlersuche

Bestellungen werden alle fünf Minuten über `lastmodifieddate` mit zehn Minuten
Überlappung abgeglichen, aktive Inserate stündlich vollständig. Jeder Aufruf
verarbeitet höchstens fünf Seiten. Ein unvollständiger Durchlauf bestätigt keine
Abschlussmarke. Gespeicherte Quellen bleiben erhalten, auch wenn sie später
außerhalb des Anbieterzeitfensters liegen. Ein schrumpfender Trefferstand beginnt
den Durchlauf sicher erneut, ohne vorhandene Daten zu leeren.

Die Oberfläche liest die Datenbank. „Aktualisieren“ fordert den Hintergrunddienst
an; es ersetzt die Tabelle nicht durch einen leeren Anbieterabruf. Bei der
Fehlersuche letzten vollständigen Abgleich, Fehlerstatus und gespeicherten
Seitenfortschritt prüfen. Keine Tokens, Käuferanschriften oder vollständigen
Anbieterantworten in Logs, Chat oder Tickets kopieren.

Der Abgleich ist von Push-Freigabe und Pilotlisten unabhängig. `WEB_PUSH_ENABLED`
steuert den Pushversand. `EBAY_CACHE_ENABLED=false` schaltet den eBay-Abrufdienst
separat ab. Meldungen und Quellen verlangen weiterhin eine aktuelle persönliche
Freigabe für dasselbe externe Konto; allgemeine Workspace-Mitgliedschaft ersetzt
sie nicht. Ein einzelner Anbieterabruf kann mehrere persönlich berechtigte
Push-Empfänger bedienen, jeweils mit deren eigener Zustimmung.

## Reservierungen und Klärfälle

Reservierungen gehören einem konkreten Entwurf. Pakete werden vollständig oder
gar nicht reserviert; Fehlbestand bleibt ein Klärfall. Andere manuelle Verkäufe
und Bestandsabgänge dürfen die reservierten Mengen nicht verbrauchen.

Ein eindeutig abgeschlossener Storno vor Buchung gibt ausschließlich die eigene
Reservierung frei. Eine Erstattung oder ein unklarer Status bestätigt keine
Warenrückkehr und gibt sie nicht automatisch frei. Nach Buchung bleiben die
vorhandenen Retouren-/Korrekturwege maßgeblich. Das Trennen eines eBay-Kontos löscht
weder Belege noch Reservierungen; offene interne Bestandsklärungen bleiben
für die berechtigten Warenwirtschaftsnutzer zugänglich, ohne private eBay-Quelle
freizugeben.

## Gemeinsamer Rollout nach freigegebenem PR

1. Aktuellen Merge-Commit und erfolgreiche Pflichtprüfungen festhalten. Den
   regulären gesicherten Releaseweg verwenden: Backup, erzeugte Migrationen,
   passende Funktionen/Hintergrunddienste und Anwendung. Historische Migrationen
   und bestehende Verschlüsselungsschlüssel erhalten.
2. Die neuen Migrationen gemeinsam mit den deklarativen Quellen ausliefern.
   Funktionen für Cache, Entwürfe und Quellenbuchung müssen zur App passen.
   Zusätzlich das private Push-Functionpaket mit `ebay-order-observer` und den
   aufrufenden Worker aus demselben Release aktualisieren; ein reines Webrelease
   bestätigt keinen aktiven eBay-Abgleich. Das Paketieren und dessen
   Integritätsliste erzeugt der bestehende Bau, keine manuell gepflegten Hashes.
3. Vorhandene OAuth-Werte und die konfigurierte eBay-Umgebung prüfen. Dieser Ausbau
   benötigt keine zusätzlichen Finances-Rechte. Bestehende Push-Einwilligungen und
   Pilotgrenzen erhalten. Keine beliebigen echten Verkäufe als Abnahmetest buchen.
4. Lesend nachprüfen: passende Commit-/Abbildreferenzen, gesunder Worker und
   Functiondienst, privater Observer ohne öffentliche Gatewayroute, fortschreitende
   gespeicherte Abgleiche und weiter lesbarer Stand bei einem Fehler.
5. Mit dem berechtigten Konto Bestellbilder, Inseratzuordnung, historische
   Altverkaufsauswahl, Entwürfe und Glocke prüfen. Ein künstlicher lokaler Ablauf
   belegt weder eine reale eBay-Zahlung noch die Anzeige eines Handy-Pushs.
   Bestehende Bestellung mit Endnummer 7587 erneut prüfen: eine ausdrücklich leere
   Erstattungsliste bei fehlendem Positionsfeld darf die falsche Sperre nicht mehr
   auslösen; neue echte Erstattungen bleiben gesperrt.

Bei einem Problem zuerst den eBay-Abgleich mit dem eigenen Schalter anhalten und
Logs/gespeicherten Fortschritt prüfen. Keine Entwurfs-, Reservierungs- oder
Quellenbelege löschen. Bereits gebuchte Verkäufe nicht durch ein Datenbankrollback
rückgängig machen. Einen kompatiblen vorherigen Release über den bestehenden
Releaseweg wählen; neue additive Tabellen bleiben erhalten. Push bei Bedarf
zusätzlich über seinen eigenen vorhandenen Schalter anhalten.

## Quellen und Prüfgrenzen

Der freigegebene [Gesamtentwurf](../superpowers/specs/2026-10-23-ebay-sales-review-design.md)
beschreibt Entscheidungen und Abnahmefälle. Die
[Worker-Betriebsanleitung](../../services/push-worker/README.md) enthält
Betriebsfreigaben und den privaten Functionweg. Die offiziellen eBay-Verträge
beschreiben [Bestellfelder einschließlich Zahlungszeit und Gebühren](https://developer.ebay.com/api-docs/master/sell/fulfillment/openapi/3/sell_fulfillment_v1_oas3.json).
Tatsächliche externe Portokosten sind dadurch nicht allgemein verfügbar.
