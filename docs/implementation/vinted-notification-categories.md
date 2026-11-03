# Vinted-Benachrichtigungen nach Ereignisart

Die Glocke und Pushmeldungen unterscheiden belegte Vinted-Ereignisse. Normale
Chatnachrichten nennen in der App den Gesprächspartner. Systemereignisse erhalten
feste deutsche Titel; private Chattexte werden weder als Status ausgewertet noch
in Pushmeldungen übertragen. Ein Kauf oder erfolgreicher Abschluss wird nur bei
passenden belegten Anbieterfeldern benannt.

## Kontoweise Einstellungen

Neben den bestehenden Favoriten sind folgende Kategorien unabhängig schaltbar:

| Kategorie                      | Ereignisse und Beispiele                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Neue Nachrichten               | Normale eingehende Chatnachrichten                                                                                                               |
| Preisvorschläge                | Eingehende Preisvorschläge                                                                                                                       |
| Bestellungen und Verkäufe      | Artikel verkauft/gekauft, Bestellung storniert/abgeschlossen/unterbrochen, Transaktion abgebrochen, Artikel wieder eingestellt, Problem gemeldet |
| Versand und Zustellung         | Versandlabel verfügbar, Sendung verschickt/abholbereit/zugestellt, Rücksendung verschickt                                                        |
| Zahlungen und Rückerstattungen | Rückerstattung eingeleitet/abgeschlossen/angenommen                                                                                              |
| Neue Bewertungen               | Empfangene Bewertungen und belegte Bewertungsschritte                                                                                            |
| Weitere Statusmeldungen        | Supportchat beendet, Artikel nicht verfügbar, unbekannte Systemereignisse                                                                        |

Neue Kategorien übernehmen vorhandene Nachrichtenpräferenzen; Bewertungen
behalten ihren bisher aktivierten Standard. Einzelne Änderungen beeinflussen
keine andere Kategorie. Alle Einstellungen verwenden dieselbe Versionskontrolle
und dieselben Konto-, Workspace- und Rechteprüfungen. Alte Clients behalten ihren
bisherigen Gesamtschalter für Postfachereignisse; eine ausdrückliche
Bewertungswahl wird dadurch nicht verändert.

Ausgeschaltete Ereignisse werden mit ihrer Quellkennung weiter gespeichert,
erzeugen jedoch keine Benachrichtigung. Eine erneute Aktivierung berücksichtigt
das Ereignisdatum und meldet während einer Pause entstandene Historie nicht nach.
Die Aktivierungsgrenze hat Sekundenpräzision, weil Vinted teilweise nur Sekunden
liefert. Ereignisse aus derselben Quellsekunde bleiben zulässig; ihre genaue
Reihenfolge innerhalb dieser Sekunde ist aus den Anbieterdaten nicht bestimmbar.

## Ereignisvertrag und sichere Anzeige

Die vorhandenen fünf Quellarten bleiben erhalten: `message`,
`offer_request_message`, `status_message`, `action_message` und `payment_message`.
Das optionale Feld `notificationKind` enthält eine von 23 festgelegten Arten.
Cloud und Erweiterung verwenden dieselbe Klassifikation. Hashes und
Ereigniskennungen ändern sich durch die Klassifikation nicht. Unbekannte Felder,
Arten oder widersprüchliche Quell-/Facharten werden an den Übergaben abgewiesen;
alte Pakete ohne Zusatzfeld bleiben gültig.

Unbekannte Systemereignisse heißen „Status bei Vinted aktualisiert“ und gehören
zur abschaltbaren Kategorie für weitere Statusmeldungen. Insbesondere beweist
`payment_message` allein keine abgeschlossene Zahlung und
`shipment_completed` allein keinen Versand: Derselbe Anbieterwert kommt auch bei
Stornierungen vor. Die bekannten Storno- und Versandfälle werden unterschieden.

Die Cloud meldet empfangene Bewertungen über die vorhandene deduplizierte
Profilquelle. Derselbe Bewertungseingang wird nicht zusätzlich über den Chat
gemeldet. Lokale Konten besitzen diese Profilquelle nicht und verwenden deshalb
das belegte Chatereignis. Bei einer ausdrücklich gesetzten Bewertungszeitgrenze
bleiben unbekannte oder ungültige Ereigniszeiten still; gültige Bewertungsdaten
werden mit ihrem tatsächlichen Datum geprüft.
`occurredAtVerified` unterscheidet dabei eine echte Anbieterzeit von der
bisherigen Ersatzzeit für die Anzeige. Eine gespeicherte Null-Zeitgrenze aus
der Änderung einer anderen Kategorie gilt nicht als Bewertungsaktivierung.

Der Pushvertrag bleibt unverändert. Die Kategorie `message` ist weiterhin der
Gerätemaster und heißt dort „Nachrichten und Statusmeldungen“. Nur feste bekannte
Titel werden angezeigt; freie Anbietertexte und Nachrichtentexte bleiben
verborgen. Alte Service Worker können dieselben Pakete weiterhin allgemein
anzeigen. Vor dem Versand wird die aktuelle Kontokategorie nochmals geprüft,
einschließlich zwischenzeitlich widerrufener Freigaben.

## Historie und begrenzte Abrufe

Die Migration erhält vorhandene Ereignisse und Konto-Baselines. Für alte Konten
beginnt die Systemereignis-Benachrichtigung mit der Veröffentlichungsgrenze;
ältere bislang unbekannte Statusereignisse werden still aufgenommen.
Neue Konten setzen die Grenze mit ihrer ersten belegten Beobachtung.
Die historischen Benachrichtigungen aus dem [Vorfall](../audit/2026-11-03-vinted-historical-system-notifications.md)
werden weder gelöscht noch erneut versandt.

Es bleiben höchstens zehn Gespräche und 2.000 Ereignisse pro Batch. Die
zusätzliche Klassifikation benötigt mehr Platz; der überprüfte Übergabevertrag
erlaubt nun 768 KiB. Ein voller klassifizierter Batch überschreitet 512 KiB und
wird ohne Abschneiden von Ereignissen übernommen. Diese Grenze gilt gemeinsam
für Erweiterung, HTTP-/Edge-Vertrag, isolierten Worker und SQL.

## Nachweise

Gezielte Tests decken Klassifikation, unveränderte Kennungen, Legacy-Pakete,
Kataloggleichheit zwischen Datenbank/App/Push, unbekannte Daten und Batchgrenzen
ab. SQL prüft getrennte Kategorien, Kontorechte, konkurrierende Änderungen,
Aktivierungszeitpunkte, alte Systemereignisse, Cloud-/Lokalbewertungen und
Pushtexte. Bestehende Browserfälle prüfen Einstellungen und Persistenz,
Kontowechsel, konkrete Glockentexte, Bedienbarkeit und Barrierefreiheit auf
Desktop und Mobilansicht. Der endgültige lokale Vorabcheck und die noch
ausstehenden CI-Nachweise werden im Änderungsprotokoll festgehalten.
