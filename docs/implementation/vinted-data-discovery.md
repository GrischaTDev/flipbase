# Vinted-Datenprobe des verbundenen Privatkontos

Stand: 28.09.2026. Eine einmalige, lesende Strukturprüfung im vom Nutzer
verbundenen eigenen Konto. Sie ist kein freigegebener Dauerbetrieb und keine
öffentlich dokumentierte Vinted-Integrationsschnittstelle.

## Vorgehen und Schutz

Vor Beginn und nach Abschluss waren in Flipbase nur geschlossene
Browsersitzungen vorhanden.
Jeder Versuch nutzte ausschließlich das bereits zugeordnete GoLogin-Profil.
Die Vinted-Identität wurde mit der bestätigten Flipbase-Verbindung verglichen.
Alle sechs gestarteten Anbieterbrowser wurden ausdrücklich gestoppt und der
Stopp wurde jeweils bestätigt. Es wurden keine Zugangsdaten, Cookies, Kennungen,
Nachrichtentexte, Namen, Preise oder Bewertungen ausgegeben oder gespeichert.
Bei Gesprächen wurde nur ein bereits als gelesen markierter Verlauf geöffnet.
Es wurde keine Nachricht gesendet und keine Benachrichtigungsseite geöffnet.

| Bereich            | Lesender Nachweis                                 | Beobachtete Struktur                                                                                                                          | Grenze                                                                                                   |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Eigenes Profil     | `/api/v2/users/current`, HTTP 200                 | Bewertungsanzahl und -anteile, Reputation, Artikelanzahl, Ort und Bild als Felder vorhanden                                                   | Werte und einzelne Bewertungen nicht geprüft                                                             |
| Eigene Inserate    | `/api/v2/wardrobe/{id}/items`, HTTP 200           | Paginierte Liste mit sechs Artikeln in der beobachteten Antwort; ID, Titel, Preis, Status, Bilder, Aufrufe und Favoriten als Felder vorhanden | Weitere Seiten, gelöschte Artikel und stabile Bedeutung der Statuswerte nicht geprüft                    |
| Posteingang        | `/api/v2/inbox`, HTTP 200                         | Paginierte Liste mit Gesprächs-ID, Zeit, Gegenseite und Ungelesen-Status; die Einzelantworten enthielten fünf beziehungsweise sechs Gespräche | Noch kein vollständiger Import und keine Aussage über alle Ordner                                        |
| Einzelner Verlauf  | `/api/v2/conversations/{id}`, HTTP 200            | Fünf Nachrichteneinträge im ausgewählten bereits gelesenen Verlauf; Antwortfreigabe und Transaktionsbezug als Felder vorhanden                | Nachrichtentypen, Anhänge, Lesestatus-Nebenwirkungen bei ungelesenen Verläufen und Versand nicht geprüft |
| Transaktion        | `/api/v2/transactions/{id}`, HTTP 200             | Bestellung, Käufer/Verkäufer-Seite, Versand, Status und Beträge als Felder vorhanden                                                          | Ein verknüpfter Verlauf belegt keine vollständige Verkaufsliste und keinen neuen Verkauf                 |
| Benachrichtigungen | Navigationspfad `/member/notifications` vorhanden | Keine Datenantwort gelesen                                                                                                                    | Neue Ereignisse und Push nicht nachgewiesen                                                              |

Die Verlaufsseite hatte Text-Eingabefelder. Das belegt nur die Bedienoberfläche;
ein erfolgreicher Versand, seine Bestätigung und der Wiederholschutz sind
gesondert zu prüfen. Die Feldstrukturen stammen aus nicht dokumentierten
Webschnittstellen und können sich ohne Ankündigung ändern. Auch ein HTTP 200
belegt weder eine Erlaubnis für automatischen Dauerabruf noch einen stabilen
Datenvertrag.

## Konsequenz für den nächsten Ausbau

1. Plattformberechtigung für den geplanten Zugriff und Datenverarbeitung klären.
   Die offizielle Vinted-Pro-Integrations-API ist nur für freigeschaltete
   Pro-Unternehmen zugänglich; das verbundene Konto ist ein Privatkonto.
2. Einen explizit gestarteten, begrenzten Leseimport für dieses Konto bauen.
   Die vorhandene Tabelle `marketplace_account_entries` trennt Workspace und
   Konto und hat eindeutige Fremd-IDs je Eintragsart. Nur geprüfte Felder
   übernehmen, Seitenzahl und Laufzeit begrenzen, `observed_at` setzen und
   nach Abbruch ohne doppelte Einträge fortsetzen. Statuswerte zunächst roh
   speichern, nicht aus einem verschwundenen Artikel einen Verkauf ableiten.
3. Gespräche zunächst als Liste importieren. Einzelnachrichten erst nach
   Prüfung der Lesestatus-Wirkung; Verkaufsereignisse erst nach einem eigenen
   Nachweis der Bestellliste und der Statusübergänge.
4. Für neue Daten ein kontogebundenes Ereignis mit eindeutiger Fremd-ID bilden.
   Die Flipbase-Glocke und spätere Push-Zustellung verwenden dasselbe Ereignis.
   Nur Änderungen nach dem ersten vollständigen Abgleich als „neu“ melden.
5. Antworten als ausdrückliche Nutzeraktion mit dem gewählten Konto senden.
   Nach einem unklaren Ausgang nicht automatisch erneut senden, sondern zuerst
   den Verlauf auf die Nachricht prüfen und gegebenenfalls `outcome_unknown`
   anzeigen.

Ein Abruf alle fünf Minuten wären 288 Läufe pro Konto und Tag. Bei 200–300
Konten wären es 57.600–86.400 Läufe täglich. Die hier beobachteten einzelnen
Prüfaufrufe dauerten einschließlich Serververbindung, Prüfung und Stopp etwa
19–30 Sekunden; das ist keine isolierte Messung der Anbieter-Browserzeit.
Mit 300 Konten und angenommenen 20 Sekunden Browserzeit je Lauf wäre für fünf Minuten
Abstand rechnerisch eine mittlere Parallelität von 20 nötig. GoLogin nennt
für seine regulären Cloud-Tarife ein bis drei parallele Sitzungen. Daher ist
ein fester Fünf-Minuten-Takt für alle Konten nicht zugesagt. Zuerst gehören
ein einzelnes Pilotkonto, tatsächliche Laufzeit/Proxy-Nutzung, Fehlerquote,
Sperrverhalten und zulässige Abruffrequenz gemessen.

Quellen: [Vinted-Pro-Integrations-API](https://pro-docs.svc.vinted.com/),
[GoLogin Cloud Browser](https://gologin.com/cloud-browser/),
[GoLogin: gleichzeitige Cloud-Sitzungen](https://gologin.com/docs/general/account-and-billing/active-sessions).

## 28.09.2026 – Manueller Import im lokalen Branch

Auf `juna/vinted-data-discovery` ist ein ausdrücklich gestarteter Leseimport
eingebaut. Er verwendet das zugeordnete Browserprofil, prüft die verbundene
Vinted-Identität und die Flipbase-Sitzungsfreigabe, liest paginierte Inserate und
Gespräche und speichert nur ausgewählte Felder in den vorhandenen
`marketplace_account_entries`. Maximal 20 Seiten je Liste und 100 Gespräche
werden bearbeitet. Einzelverläufe werden nur für bereits gelesene Gespräche
geöffnet, um den Lesestatus ungelesener Gespräche nicht unbeabsichtigt zu ändern.
Verkäufe entstehen nur aus Transaktionen mit nachgewiesener Bestellung und
Verkäuferidentität; dies ist keine vollständige Verkaufsliste.

Die Speicherung ist je Workspace, Konto, Art und Vinted-ID wiederholbar.
Nach einem vollständig geschriebenen Abruf werden veraltete Inserate und
Gespräche dieses Kontos entfernt; historische Verkäufe bleiben erhalten.
`last_synced_at` wird erst nach vollständig bestätigter Speicherung gesetzt.
Nach einem Abbruch können bereits geschriebene Einträge vorhanden sein; der
nächste Lauf aktualisiert sie ohne Duplikate. Die Oberfläche zeigt Profil,
Inserate, Gespräche, Nachrichten aus gelesenen Verläufen und die belegten
Verkäufe sowie einen manuellen Aktualisierungsbutton. Es gibt keinen geplanten
Hintergrundabruf, Nachrichtensenden oder Push.

Ein weiterer einmaliger lesender Liveversuch bestätigte die Kontoidentität,
erhielt danach aber HTTP 403 auf `/api/v2/users/current`. Der Browser wurde
bestätigt gestoppt. Deshalb ist die neue Importstrecke noch nicht mit echten
Daten erfolgreich abgeschlossen; der erste produktive Versuch muss diese
Anbieterantwort beobachten und bei Bedarf den Leser anpassen. Zugangsdaten,
Nachrichtentexte und private Werte wurden bei dieser Prüfung nicht ausgegeben.
