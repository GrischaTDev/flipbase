# Analytics auf der öffentlichen Startseite

Die Startseite `https://flipbase.de/` ist eine einzelne Seite. Unterschiedliche
Seitentitel in GA4 bedeuten daher nicht automatisch unterschiedliche Seiten.
Für Seitenaufrufe den Pfad beziehungsweise die Seitenadresse ansehen; für den
Weg innerhalb der Startseite die folgenden Ereignisse verwenden.

| Ereignis         | Bedeutung                                                                           |
| ---------------- | ----------------------------------------------------------------------------------- |
| `page_view`      | Startseite aufgerufen; wird von GA4 gesendet.                                       |
| `features_view`  | Abschnitt „Funktionen“ erreicht.                                                    |
| `roadmap_view`   | Abschnitt „Roadmap“ erreicht.                                                       |
| `faq_view`       | Abschnitt „FAQ“ erreicht.                                                           |
| `beta_form_view` | Abschnitt mit dem Beta-Formular erreicht.                                           |
| `beta_cta_click` | Beta-Link im Einstiegsbereich der Startseite angeklickt.                            |
| `app_link_click` | Link zur App angeklickt.                                                            |
| `generate_lead`  | Neue Beta-Bewerbung erfolgreich gespeichert; in GA4 als Schlüsselereignis markiert. |

Abschnittsaufrufe werden höchstens einmal pro Seitenaufruf gezählt. Ein Klick auf
den Beta-Link ist noch keine Bewerbung. Die Ereignisse werden nur nach
Analytics-Einwilligung und nur auf `flipbase.de` oder `www.flipbase.de` gesendet.
Lokale Vorschauen und die angemeldete App sind nicht Teil dieser Messung.

## Herkunft von Besuchen

Bei einem Besuch von einer anderen Website sendet die Startseite nur deren
Domain als Referrer. Pfad und Suchanfrage werden entfernt. Für eigene Kampagnen
Links mit `utm_source` und `utm_medium` versehen, zum Beispiel:

`https://flipbase.de/?utm_source=newsletter&utm_medium=email&utm_campaign=beta_launch`

`utm_campaign` und `utm_id` sind optional. Erlaubt sind Buchstaben, Zahlen,
Unterstriche und Bindestriche, maximal 80 Zeichen je Wert. Keine Namen,
E-Mail-Adressen oder sonstigen personenbezogenen Angaben in Kampagnenwerte
schreiben. Interne Links nicht mit UTM-Parametern versehen, da dies die
ursprüngliche Herkunft verfälschen würde. Ohne erkennbaren Referrer oder
Kampagnenangaben bleibt ein Besuch in GA4 unter `(direct) / (none)`; frühere
Besuche lassen sich nicht nachträglich zuordnen.

Die vorhandene Search-Console-Property `flipbase.de` ist mit dem GA4-Webstream
„Flipbase“ verknüpft. Suchanfragen und Indexierung stehen in der Search Console;
für die Verknüpfung ist kein eigenes Google-Cloud-Projekt nötig. Die Sitemap
`https://flipbase.de/sitemap.xml` wurde am 28.09.2026 eingereicht. Die Search
Console meldet weiterhin „Konnte nicht abgerufen werden“. Ihr Live-Test hat
dieselbe XML-Datei jedoch erfolgreich mit dem Google-Prüftool abgerufen;
`robots.txt` und die Sitemap antworten öffentlich mit HTTP 200; ein IPv6-Abruf
vom Webserver selbst war ebenfalls erfolgreich. Die Startseite ist laut
URL-Prüfung bereits indexiert. Die Einreichung wurde nach
diesem Befund entfernt und neu angelegt. Den Sitemap-Bericht nach Googles
nächster Verarbeitung erneut prüfen; derzeit gibt es keinen belegten Fehler
an der ausgelieferten Datei.
