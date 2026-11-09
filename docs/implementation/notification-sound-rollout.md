# Betriebsnachweis für die Benachrichtigungstöne

Stand: 9. November 2026. **Rollout und funktionale Live-Prüfung abgeschlossen.** Dieser Eintrag ergänzt den
[Umsetzungsplan](../superpowers/plans/2026-11-08-notification-sounds.md).

Web und SQL aus PR #595 sind veröffentlicht. Der Kompatibilitätsschutz aus
PR #598 erhält das bisherige Speichern, solange der öffentliche Handler den
Verkaufston noch nicht bestätigt. Die getrennt betriebene Edge-Funktion wurde
jetzt zusätzlich aktualisiert und im tatsächlichen Ablauf geprüft.

## Bestätigter Ausgangsstand

Die folgenden Angaben stammen aus der lesenden Prüfung über die Hetzner-Konsole.

| Merkmal                    | Befund                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Server                     | `168.119.246.33`                                                                         |
| Öffentlicher Container     | `a1e41cb80c5e` / `supabase-edge-functions`, gesund                                       |
| Compose-Projekt und Dienst | `supabase` / `functions`                                                                 |
| Image-ID                   | `sha256:8c17262ecf2fcc43fe19c48d239280592129f2164e61f0f17ba56533120f92d5`                |
| Bindmount                  | `/opt/supabase/volumes/functions` → `/home/deno/functions`; kein separater Dateioverride |
| Betroffene Hostdatei       | `/opt/supabase/volumes/functions/webhook-dispatch/webhook-settings.ts`                   |
| Dateityp und Rechte        | Reguläre Datei, `root:root`, `0664`                                                      |

## Dateistände

Die Zieldatei stammt aus `supabase/functions/webhook-dispatch/webhook-settings.ts`
im abgeglichenen `master` `406b179b`. Größe und Prüfsumme wurden lokal bestätigt.

| Stand                             | Bytes | SHA-256                                                            |
| --------------------------------- | ----: | ------------------------------------------------------------------ |
| Host vor dem Rollout und Backup   | 4.941 | `5aa0c83afaa2a02ff8fe183363bfeb45eae02179119f28083781676cd7fa8e62` |
| Zieldatei und Host nach Austausch | 5.128 | `15608a6c1c1d97a7ead6efaa794d9f7657b7e82eba4894e11aeecef83082be51` |

Nach dem Neustart wurde derselbe Zielhash auch im laufenden Container bestätigt.

## Durchgeführter Eingriff

1. Die bisherige Datei mit `cp -a` nach
   `/root/sound.Mdbu0i/webhook-settings.ts` gesichert. Das durch `mktemp`
   erzeugte Verzeichnis hat den Modus `0700`. Die Sicherungsprüfsumme entspricht
   der bisherigen Hostdatei; der Pfad wurde zusätzlich zeichenweise geprüft.
2. Die Zieldatei aus dem unveränderlichen Feature-Merge
   `ee59d34a5343471c66ebd7ebc9f94aadb795feca` nach `.sound-stage` geladen und die
   SHA-256-Prüfsumme bestätigt.
3. Mit `cp --attributes-only --preserve=all` die bisherigen Dateimetadaten
   übernommen. Nach erfolgreichem `cmp -s` zwischen Original und Backup mit
   `mv -T` atomar eingesetzt. Anschließend am Host `root:root`, `0664`,
   5.128 Bytes und den Zielhash bestätigt.
4. `docker restart a1e41cb80c5e` erfolgreich ausgeführt; der Befehl gab dieselbe
   Container-ID zurück. Kein Recreate und keine Konfigurationsänderung.

## Laufzeit und öffentliche Bedienprüfung

`docker exec a1e41cb80c5e sha256sum /home/deno/functions/webhook-dispatch/webhook-settings.ts`
lieferte den Zielhash. `docker ps --filter id=a1e41cb80c5e` zeigte denselben
Container `supabase-edge-functions` mit `supabase/edge-runtime:v1.74.0` und
`Up 2 minutes (healthy)`. `.State.StartedAt` bestätigt den Neustartzeitpunkt
`2026-11-09T11:26:50.682470354Z`.

Die [öffentliche Einstellungsseite](https://app.flipbase.de/settings/notifications)
in Version `0.426.1` zeigte nach frischem Laden „Allgemeiner Benachrichtigungston“,
„Verkaufston“ und beide „Probehören“-Schaltflächen. Die zweite Option wird erst
nach bestätigter Serverunterstützung angezeigt.

| Schritt                           | Allgemeiner Ton | Verkaufston | Nachweis                                               |
| --------------------------------- | --------------- | ----------- | ------------------------------------------------------ |
| Ausgangszustand                   | an              | an          | Frisch geladen                                         |
| Allgemeiner Ton ausgeschaltet     | aus             | an          | Gespeichert, Erfolgsmeldung, nach Neuladen unverändert |
| Verkaufston ausgeschaltet         | an              | aus         | Gespeichert, Erfolgsmeldung, nach Neuladen unverändert |
| Ausgangszustand wiederhergestellt | an              | an          | Gespeichert und nach erneutem Laden bestätigt          |

## Prüfgrenzen

Beide Vorschauen wurden einzeln angeklickt; dabei erschien keine
UI-Fehlermeldung. Eine akustische Bewertung wurde nicht vorgenommen.
Es wurden keine Testverkäufe oder externen Webhooks ausgelöst.

Für diesen Betriebsschritt wurden keine weiteren Datenbankänderungen benötigt.
