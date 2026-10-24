# Burberry-Bestandsabgang nachvollziehbar zurücknehmen

**Ziel:** Den ausdrücklich bestrittenen Verlust genau einmal gegenbuchen, den
Schal für eBay 7587 reservieren und die endgültige Verkaufsbuchung offen lassen.

**Grundlage:** [Untersuchung](../../audit/2026-10-24-burberry-stock-removal.md)
und ausdrücklicher Nutzerauftrag vom 24.10.2026. Keine neue Oberfläche, kein
fiktiver Einkauf, keine Änderung oder Löschung des ursprünglichen Verlustbelegs.

## Umsetzung und Prüfung

- [x] SQL-Regression: vier Stück, drei echte Verkäufe, ein falscher Verlust;
      fehlenden Rücknahmeweg zuerst rot nachweisen.
- [x] In `470_article_stock_removals.sql` eine berechtigte, begründete Rücknahme
      für ausschließlich losbasierte Mengenartikel ergänzen. Originalbeleg und
      ursprüngliche Bewegung bleiben unverändert; neue geschützte Eingangsbewegung
      mit demselben Abgangsbezug und ein Geschäftsereignis halten die Korrektur fest.
      Sperren in bestehender Reihenfolge und eindeutiger Index verhindern Doppelbuchung.
- [x] Mengen- und Kostenabgleich in `remove_article_stock` und `record_sale`
      berücksichtigt Aus- und Gegenbuchungen mit ihrem Vorzeichen. Exakte
      gespeicherte Stück- und Steuerkosten wiederherstellen; unbekannte oder
      widersprüchliche Zuordnungen vollständig zurückweisen.
- [x] Regressionen für Rechte, Wiederholung, unveränderte Originale, Restcent,
      Folgeverkauf, fehlende Belege und eBay-Reservierung ausführen. Sämtliche
      bestehenden SQL-Fälle auf frisch aufgebauter eigener Datenbank prüfen.
- [x] Migration aus deklarativen Quellen erzeugen und vollständig prüfen;
      Datenbanktypen neu erzeugen; Typen, Registrierung und betroffene Vertragsprüfungen.
- [ ] Unabhängiger SQL-Review, anschließend Veröffentlichung gemäß bestehender
      Freigabe für den eBay-Auftrag und sämtlichen erforderlichen Prüfungen.
- [ ] Vor Produktion aktuellen Zustand erneut prüfen und Sicherung festhalten.
      Gegenbuchung und normale Entwurfsreservierung in einer Transaktion ausführen;
      Originale und drei Vinted-Verkäufe bytegleich, Bestand eins/reserviert eins,
      kein eBay-Verkauf, unbekannte Versandkosten weiterhin offen.

## Besondere Prüfpunkte

- Fremde und ausgeloggte Benutzer erhalten keinen Zugriff.
- Gleiche Gegenbuchung liefert denselben Beleg, auch nach verloren gegangener Antwort.
- Eine Teilzuordnung oder fehlende Kostenfolge verändert weder Menge noch Journal.
- Die reguläre spätere eBay-Buchung rechnet die 13 Euro Einkaufskosten genau einmal an.
- Reservierung ist keine endgültige Buchung und verändert keinen bestehenden Verkauf.
