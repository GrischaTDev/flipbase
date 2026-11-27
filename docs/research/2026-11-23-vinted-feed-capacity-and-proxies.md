# Vinted-Feed: Abrufkapazität und Proxy-Plan

Stand 23. November 2026, nach Auslieferung von PR 726 (persönliche Feeds aus
gemeinsamen Quellen). Die Messung lief in Produktion von 19:21 bis 20:36 UTC
mit Mess-Feeds, die danach wieder gelöscht wurden. Auch die Einstellungen
wurden danach zurückgesetzt (30 Abrufe/min, 2,5 s Mindestabstand).

## Ausgangslage

- Der Sniper ruft Vinted über **eine** Serveradresse und **einen** anonymen
  Chrome ab, Seite für Seite nacheinander. Proxy-Unterstützung gibt es nicht.
- Eingestellt war `SNIPER_REQUESTS_PER_MINUTE=30`. Der Mindestabstand blieb
  beim Standard von 2,5 s, und damit sind höchstens 24 Starts pro Minute
  möglich.
- Last kommt nur noch von Quellen: Hauptquelle Damen (1904), Hauptquelle
  Herren (5) und eine Kategoriequelle je verwendeter Kategorie, Standardtakt
  90 s.

## Messung

Je Stufe etwa 15 Minuten, ausgewertet aus dem Dienstprotokoll und
`sniper_runtime_status`. Ein Lauf ist der Abruf einer Quelle mit einer bis drei
Seiten.

| Stufe | Abstand | Last            | Seiten/min | Läufe/min | neue Artikel/min | aufgeholt | Fehler                        | 403/429/Challenge |
| ----- | ------- | --------------- | ---------- | --------- | ---------------- | --------- | ----------------------------- | ----------------- |
| 0     | 2,5 s   | Damen + Herren  | 18,7       | 8,7       | ~1.130           | 84 / 87   | 3 Netzwerk                    | 0                 |
| 1     | 2,0 s   | Damen + Herren  | 17,9       | 10,0      | ~1.180           | 137 / 138 | 3 Netzwerk, 1 Browserabsturz  | 0                 |
| 2     | 1,5 s   | Damen + Herren  | 20,9       | 12,2      | ~1.450           | 169 / 171 | 2 Netzwerk                    | 0                 |
| 2b    | 1,5 s   | + 10 Kategorien | 25,1       | 17,4      | ~1.340           | 244 / 244 | 2 Netzwerk                    | 0                 |
| 3     | 1,0 s   | + 10 Kategorien | 24,6       | 17,8      | ~1.360           | 233 / 236 | 1 Netzwerk, 1 Browserneustart | 0                 |

Weitere Werte unter Last (Stufe 3):

- Dauer eines Abrufs: Kategorie und Herren etwa 1,2 s je Seite, Damen
  2,4 s für einen Lauf mit zwei Seiten.
- Frische: Alle Kategorien blieben innerhalb ihres 90-s-Takts, eine lag
  einmal bei 97 s. In Stufe 2b blieben alle unter 66 s.
- Server: Der Sniper-Container brauchte etwa 70 % eines Kerns und
  0,9 von 2 GiB Speicher, die Datenbank etwa 1 % CPU.

## Erkenntnisse

1. **Die Bremse ist der serielle Browser, nicht der Abstand.** Ab 1,5 s
   steigen die Seiten pro Minute nicht mehr. Jeder Abruf dauert gut 1 s, dazu
   kommt die Verarbeitung. Bei 1,0 s änderte sich nichts außer einem
   Browserneustart.
2. **Vinted hat in keiner Stufe gesperrt.** Es gab keine 403, 429 oder
   Challenge bis etwa 25 Seiten pro Minute von einer Adresse. Kurze
   Netzwerkfehler (1–3 je 15 min) gab es in allen Stufen, auch bei 2,5 s.
3. **1,5 s macht den Feed frischer.** Bei gleicher Abrufmenge kommen 40 %
   mehr Läufe pro Minute zustande (12,2 statt 8,7), damit wird jede
   Hauptquelle häufiger abgefragt.
4. **10 Kategorien passen sicher.** Damen und Herren holten dabei weiter
   vollständig auf, alle Kategorien blieben im Takt.
5. **Die Datenbank ist kein Engpass mehr.** Der frühere Hauptverbraucher
   (Bewertung über den ganzen 3-Tage-Bestand) ist weg.

## Empfehlung für den Dauerbetrieb

`SNIPER_REQUEST_MIN_INTERVAL_MS=1500` und `SNIPER_REQUESTS_PER_MINUTE=40`
setzen; Grenze 10 Kategorien und Takt 90 s beibehalten. Danach 24 Stunden
lang die Karte **Systemzustand → Vinted-Quellen** und das Protokoll auf 403,
429, Challenges und Browserneustarts beobachten. Die Messung lief abends und
je Stufe nur 15 Minuten; Vinteds Bot-Schutz kann verzögert reagieren.

Umsetzung wie im Sniper-README: Konfiguration sichern, die zwei Werte in
`/opt/flipbase-sniper/sniper.env` setzen und den Dienst mit dem laufenden
Abbild neu erstellen.

## Wann wie viele Proxys

Benötigte Seiten pro Minute, grob:

```
Seiten/min ≈ 16 (Damen + Herren) + Kategorien × 60 / Takt in Sekunden
```

Gemessen schafft eine Adresse mit einem seriellen Browser unter Last etwa
25 Seiten pro Minute. Die folgende Tabelle ist daraus abgeleitet, nicht
gemessen:

| Kategorien | Takt | Seiten/min | Adressen seriell | mit 2 parallelen Abrufen je Adresse (Annahme ~45/min) |
| ---------- | ---- | ---------- | ---------------- | ----------------------------------------------------- |
| 10         | 90 s | ~23        | 1                | 1                                                     |
| 20         | 90 s | ~29        | 1–2              | 1                                                     |
| 40         | 90 s | ~43        | 2                | 1                                                     |
| 60         | 60 s | ~76        | 3–4              | 2                                                     |
| 100        | 60 s | ~116       | 5                | 3                                                     |

### Reihenfolge

1. **Jetzt:** Dauerwert 1,5 s wie oben, Grenze 10. Bei Bedarf die Grenze
   schrittweise anheben (zum Beispiel auf 15, dann 20) und jeweils prüfen, ob
   Damen und Herren `caught_up` bleiben und die Kategorien ihren Takt halten.
2. **Mehr als etwa 20 Kategorien:** Zuerst Parallelität auf derselben Adresse,
   also zwei gleichzeitige Abrufe in getrennten Tabs oder Browserkontexten.
   - Das braucht Code im Planer: Abrufe gleichzeitig vergeben, gemeinsames
     Budget, Pause je Adresse.
   - Außerdem eine CPU-Prüfung: Der Host hat 4 Kerne, Chrome braucht heute
     etwa 0,7 Kern.
   - Gestuft messen wie oben.
3. **Proxys erst, wenn mindestens einer dieser Fälle eintritt:**
   - Vinted antwortet mit 403, 429 oder einer Challenge, auch nach Rücknahme
     auf 1,5 s und einen Abruf zur Zeit.
   - Parallelität auf einer Adresse führt zu Sperren.
   - Mehr Kategorien sind gewünscht, als zwei parallele Abrufe auf einer
     Adresse schaffen (etwa 40–50 bei 90 s).
4. **Proxy-Pool umsetzen:**
   - Der Pool gehört Flipbase, Cloud-Konto-Adressen der Nutzer werden nicht
     verwendet.
   - Je Adresse ein eigener Browserkontext mit eigenem Budget und eigener
     Pause nach 403/429.
   - Der Planer verteilt die Quellen reihum.
   - Mit gemeinsamen Quellen erhöht jede Adresse die Kapazität für alle
     Nutzer gleich.

### Kosten

- Bisherige ISP-Adressen von IPRoyal für die Cloud-Konten: zwei Käufe zu je
  4 USD.
- Laufzeit, Verlängerungspreis und Bandbreitengrenzen je Adresse vor einem
  Kauf beim Anbieter prüfen.
- Größenordnung: Eine Katalogseite ist eine vollständige HTML-Seite, etwa
  25 Seiten pro Minute je Adresse ergeben spürbaren Datenverkehr.
- Adressen aus Rechenzentren sind günstiger, werden vom Bot-Schutz aber
  eher erkannt.

## Offen

- **Dauerlauf:** 24 Stunden mit 1,5 s, wenn freigegeben.
- **Browserabstürze:** In der Messung gab es zwei („Target crashed“ bzw.
  „Feed-Browser muss neu gestartet werden“). Ihre Häufigkeit im Dauerbetrieb
  beobachten, ebenso das Speicherlimit des Containers (2 GiB).
- **Tageszeit:** Messung zu Spitzenzeiten wiederholen. Die Zahl der neuen
  Artikel schwankt mit der Tageszeit und bestimmt, wie viele Seiten Damen
  und Herren je Lauf brauchen.
