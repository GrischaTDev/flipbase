# Vintz: Tarife, Kontingente und Zusatzkosten im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Gesondert freigegebener Analyseblock V-18. Danach
stoppen. Keine Buchung, Tarifänderung, Kündigung, Zahlung, Generierung oder
Umsetzung freigegeben.

## Ergebnis

Vintz verkauft monatliche Verkäuferpakete und zusätzlich Bild-Credits.
**Verkaufsaktionen, Cloudplätze, Teamplätze und Bild-Credits sind verschiedene
Kontingente.** Mehr Bild-Credits kaufen hebt kein ausgeschöpftes
Verkaufsaktionslimit auf. Monatliche Aktionen und enthaltene Bild-Credits haben
hier außerdem unterschiedliche Rücksetzzeitpunkte.

Flipbase ist öffentlich weiterhin kostenlos während der Beta. Die angekündigten
späteren Preise sind vorläufig; die ausführbare Zugangsverwaltung besteht aus
Beta-Lizenzen. Ein angeschlossener SaaS-Abokauf, Kunden-Creditkonto oder eine
tarifbezogene Abrechnung wurde im geprüften Umfang nicht gefunden. Interne
Proxybeschaffung darf damit nicht als Preis eines Nutzerabos dargestellt werden.

## Prüfrahmen

- Live: Vintz-Zahlungen, Tarifvergleich und Creditpaket-Vorschau ohne Checkout;
  vorhandene Cloudkonfiguration und aktive Gratisaktion im Bildstudio.
- Normale Seiten-GETs für Mitgliedschaft, Aktionsverbrauch, KI-Kontingent und
  Kontenkonfiguration passiv mitgelesen. Nur nicht geheime Preis-/Statusfelder
  gespeichert, keine Zahlungs-, Kunden-, Konto- oder Sitzungskennungen.
- Aktuelle [Preisseite](https://vintz.ai/pricing),
  [Startseite](https://vintz.ai/) und
  [AGB](https://vintz.ai/terms) gelesen. Produktbedingungen beschrieben,
  keine rechtliche Prüfung oder Zusicherung.
- Flipbase: [öffentliche Preise](https://flipbase.de/#pricing) live bestätigt;
  unabhängiger Quellenabgleich bei HEAD
  `d8993677cac943e2e280c47a973518d32274a519`.
- Keine Testzahlung, kein Limit ausgeschöpft, kein Refund, keine Verlängerung
  oder Zahlungsausfall praktisch erzeugt. Kein aktueller Anbieterpreis für
  Flipbases Infrastruktur abgefragt.

## Vintz: aktuelle Pakete

Die drei bezahlten Pakete stimmen in öffentlicher Preisseite, geöffnetem
Tarifdialog und geladenen Definitionen überein. Alle dargestellten Europreise
laut Anbieter inklusive MwSt., monatliche Abrechnung.

| Merkmal                             | Free |    Starter |        Pro |      Scale |
| ----------------------------------- | ---: | ---------: | ---------: | ---------: |
| Monatspreis                         |  0 € |     9,90 € |    27,90 € |    49,90 € |
| Cloudkonten inkl. Proxy             |    0 |          1 |          3 |         10 |
| Weitere Teamplätze laut Definition  |    0 |          0 |          1 |          5 |
| Studio-Credits je Abrechnungsmonat  |    0 |        250 |      1.000 |      3.000 |
| Neue Angebote je Monat              |    5 |        100 |      1.000 | unbegrenzt |
| Neueinstellen je Monat              |    3 |         50 |        800 | unbegrenzt |
| Favoriten-Nachrichten je Monat      |   10 |        250 |      1.500 | unbegrenzt |
| Automatische Preisangebote je Monat |    5 |        150 |        900 | unbegrenzt |
| KI-Textkontingent laut Definition   |   30 | unbegrenzt | unbegrenzt | unbegrenzt |

Belege: Live-Tarifdialog, eigene Definitionen in `017ne7iwbqmbb.js` und
[öffentliche Preisübersicht](https://vintz.ai/pricing). „Unbegrenzt“ ist die
Tarifdarstellung beziehungsweise `-1` im Modell; keine Zusage unbegrenzter
technischer Parallelität, ohne Anfragelimits oder ohne Produktgrenzen.
Die genaue Zählweise zusätzlicher Teammitglieder wurde ohne Teamaufnahme
nicht praktisch bestätigt.

Free nutzt den verbundenen Browserzugang. Starter hat laut aktueller Karte
und Definition bereits einen Cloudplatz; sein Modulumfang schließt jedoch
Cloudautomationen und Team aus. Pro/Scale enthalten diese Module.
Die FAQ formuliert Cloudzugang weiterhin als Pro-/Scale-Funktion. Diese
uneinheitliche Beschreibung bleibt als Produkttextlücke festgehalten.

Analyse/Buchhaltung sind in den bezahlten Moduldefinitionen enthalten, in Free
gesperrt. Normale Bestellungen und Postfach besitzen keinen separaten sichtbaren
Monatszähler in dieser Übersicht. Daraus folgt keine allgemeine Nutzung ohne
technische Grenzen oder gesonderte Aktionsquoten.

Der Code enthält außerdem Basic/Pro-Alttarife mit abweichenden Preisen und
Grenzen. Sie werden als „legacy“ geführt und sind nicht die aktuellen
kaufbaren Pakete. Frühere Scale-Angaben mit 30 Konten oder ältere Creditwerte
werden deshalb nicht als heutiges Standardangebot übernommen.

## Dein tatsächlich gemeldeter Abo- und Verbrauchsstand

Die normale Mitgliedschaftsantwort meldete:

- Tarif `seller-pro-2026`, Name Pro, Abrechnungsanbieter Stripe, Status aktiv.
- Bestehendes Abo, keine Kündigung zum Periodenende, kein geplanter Tarifwechsel.
- Nächste Verlängerung am **16.11.2026**; für dieses Konto kein neuer Trial verfügbar.
- Drei enthaltene Cloudplätze, null Zusatzplätze. Standardtarifpreis 27,90 €
  in der Konfiguration; keine Rechnung geöffnet und keine tatsächliche einzelne
  Belastung aus diesem Konfigurationswert abgeleitet.

| Verkaufsaktion             | Gemeldet verwendet | Monatslimit | Verbleibend |
| -------------------------- | -----------------: | ----------: | ----------: |
| Neue Angebote              |                  0 |       1.000 |       1.000 |
| Favoriten-Nachrichten      |                  0 |       1.500 |       1.500 |
| Automatische Preisangebote |                  0 |         900 |         900 |
| Neueinstellen              |                  1 |         800 |         799 |

Das vorhandene Neueinstellen stammt aus dem bestehenden Kontoverlauf; Juna
hat keines ausgeführt. Die separate KI-Kontingentantwort meldet Pro,
unbegrenzt, verwendet null. Dieser Text-/KI-Zähler ist kein Bild-Creditguthaben.

Der Server liefert für Aktions- und KI-Kontingent als nächste Rücksetzung
**01.11.2026, 00:00 UTC**, in Berlin an diesem Datum 01:00 Uhr. Die enthaltenen
Studio-Credits werden laut Tarifdialog dagegen zum jeweiligen Abrechnungszeitraum
zurückgesetzt, hier an der Novemberverlängerung. Diese zwei Uhren müssen
verständlich nebeneinander erscheinen.

Die Abrechnungsseite zeigt 1.000 verfügbare Credits, null als Aufladungen und
20 als verbraucht. Der Verlauf enthält die frühere 20-Credit-Anmeldung, zwei
alte 10-Credit-Verbräuche und später eine 1.000-Credit-Anpassung. Die 20 sind
damit kein Beleg für einen aktuellen Verbrauch aus den heutigen 1.000 Credits.

## Zählweise, Warnungen und Limitende

Der geladene Webclient reserviert Aktionskontingent vor bestimmten Aufträgen
über `POST /api/seller/usage` und bestätigt oder löst die Reservierung danach
über `PATCH` auf. Teilreservierungen und Referenzkennungen sind vorgesehen.
Bei einem Limitfehler zeigt er die passende Tariferweiterung und den
Rücksetzzeitpunkt. **Nicht praktisch getestet:** ob jeder Ausführer genau den
bestätigten Erfolg zählt und jeder Fehler/Abbruch zuverlässig freigibt.

Die Kontingentanzeige warnt bei etwa 20 % Restmenge beziehungsweise 80 %
Verbrauch, zeigt verbleibende Aktionen und unterscheidet ausgeschöpft von
unbegrenzt. Die Produkttexte beschreiben gemeinsame Aktionskontingente über
Konten. Die genaue Abrechnung geteilter Team-Workspaces wurde nicht bestätigt;
aus einer URL ohne Konto-ID allein wird sie nicht abgeleitet.

Nach Tariftext und AGB bleiben bei ausgeschöpftem Limit Warten bis zum Reset
oder Upgrade. Ein Bild-Creditpaket erhöht die Verkäuferquote nicht. Eine
automatische kostenpflichtige Überschreitung wurde in den gelesenen Abläufen
nicht gefunden; Zahlungsausfall und Grenzfall wurden nicht provoziert.

## Bild-Credits und tatsächliche Zusatzkosten

| Einmaliges Paket |   Preis | Reguläre 2K-Ausgaben bei 10 Credits | Reguläre 4K-Ausgaben bei 20 Credits | Rechnerisch je 2K / 4K |
| ---------------- | ------: | ----------------------------------: | ----------------------------------: | ---------------------- |
| 500 Credits      |  9,90 € |                                  50 |                                  25 | 19,8 / 39,6 Cent       |
| 1.200 Credits    | 19,90 € |                                 120 |                                  60 | ca. 16,6 / 33,2 Cent   |
| 3.000 Credits    | 39,90 € |                                 300 |                                 150 | 13,3 / 26,6 Cent       |

Die Vorschau öffnete mit vorausgewählten 1.200 Credits; nichts ausgewählt oder
gekauft. Die Centwerte sind eigene Division von Paketpreis durch die angegebene
Bildanzahl, keine Anbieter-Selbstkosten und keine Bewertung der Bildqualität.
Monatliche Abo-Credits nicht einfach durch den Abopreis teilen: Das Abo enthält
auch Verkäuferfunktionen, Konten und Proxys.

Der geladene Code erlaubt einen eigenen Betrag von 40 bis 500 € und berechnet
Credits im Zehnerschritt nach dem Kurs des großen Pakets. Kein eigener Betrag
eingegeben und kein Checkoutpreis für diese Option bestätigt. Mehrere Ausgaben
multiplizieren die regulären Generierungskosten. Der Chat-Fitpic-Baustein nennt
regulär 20 Credits; weitere Bedingungen wurden im
[Bildstudio-/Galerievergleich](vintz-image-studio-gallery-comparison.md) begrenzt.

Gekaufte Credits verfallen laut Dialog nicht und funktionieren auch im Free-Tarif.
Enthaltene monatliche Credits werden nicht angesammelt. Die AGB beschreiben,
dass enthaltene Credits zuerst verbraucht und technisch fehlgeschlagene,
bereits belastete Generierungen gegebenenfalls automatisch erstattet werden.
Verbrauchsreihenfolge und Erstattung nicht praktisch getestet.

### Laufende Gratisaktion und optionale Downloadfreigabe

Das Studio zeigte aktuell **„Studio ist gratis – Ohne Credits“** mit etwa
dreieinhalb Stunden Restzeit. Das ist eine befristete Aktion und kein regulärer
Tarifpreis. Es wurde kein Bild erzeugt; kein tatsächlicher Null-Abzug geprüft.

Ein optionaler, gesonderter Downloadpfad enthält im geladenen Dialog einen
10-Credit-Freischaltpreis einmal für Bild oder Batch. Verfügbarkeit hängt vom
Kennzeichnungs-/Aktionsmodus ab; dieser Pfad wurde nicht ausgelöst. Das ist
keine Gebühr für jeden normalen Galerie-Download. Die frühere Formulierung
„pro Ausgabe“ in V-11 wird auf diese tatsächliche Dialogdarstellung präzisiert;
die serverseitige Kostenberechnung bleibt ohne Ausführung offen.

## Zusätzliche Cloudkonten

Die aktuell gelesene Konfiguration des Prozugangs enthält:

| Feld                    |           Wert | Einordnung                                                                                 |
| ----------------------- | -------------: | ------------------------------------------------------------------------------------------ |
| Enthalten               |              3 | Bestätigtes Prokontingent                                                                  |
| Zusätzlich gekauft      |              0 | Kein Zusatzabo vorhanden                                                                   |
| Zusatzkauf verfügbar    |           nein | Kein kaufbares Zusatzangebot für dieses Prokonto                                           |
| Hinterlegter Stückpreis | 2,00 € / Monat | Preisfeld der Konfiguration, keine ausgeführte Bestellung                                  |
| `max`                   |             27 | Zusatzgrenze dieses Antwortmodells; nicht als pauschale Gesamtzahl aller Tarife ausgegeben |

Im gelieferten Kontenmodul wird die Zubuchung im Scale-Kontext und bei mindestens
zehn belegten Konten angeboten, zusätzlich abhängig von Serverfreigabe und
Kaufumgebung. Der Text beschreibt Proxy inklusive, anteilige Berechnung beim
Erhöhen und Gutschrift einer Verringerung auf der nächsten Rechnung. Bereits
belegte Konten bilden eine Untergrenze; eine eigene Anforderungskennung schützt
den Buchungsaufruf. Ohne berechtigtes Scale-Angebot und Rechnung sind diese
Konditionen **Frontendbeschreibung, keine bestätigte Abrechnung**.

Keine universelle Maximalkontenzahl oder 2-Euro-Verfügbarkeit für jedes Abo
daraus ableiten. Eigene Proxyverträge können außerhalb von Vintz eigene Kosten
haben; deren Höhe wurde nicht untersucht. Versandporto, Marktplatzleistungen
und eigene Infrastruktur nicht allein wegen eines enthaltenen Proxys als
kostenlos bewerten.

## Laufzeit, Trial, Tarifwechsel und Zahlungswege

Die Startseite nennt für berechtigte Neumitglieder sieben kostenlose Tage mit
Zahlungsmittel, anschließend automatische monatliche Abrechnung, und einmalig
100 Trial-Credits. Das ist kein Trialangebot für dein bereits aktives Konto.

Der aktuelle Stripe-Tarifdialog erklärt anteilig berechnete Upgrades mit
Bestätigung bei Stripe; Downgrades gelten zur nächsten Verlängerung. Die
AGB beschreiben Kündigung zum Ende des laufenden Abrechnungsmonats mit Zugang
bis dahin, danach Free. Überzählige Cloudkonten sollen nach Tarifverkleinerung
pausieren und Daten erhalten bleiben. Keine dieser Änderungen getestet.

Der Webclient enthält zusätzlich PayPal- und Apple-Kaufwege; dein tatsächliches
Abo meldet Stripe. Native Applepreise und regionale Unterschiede wurden nicht
abgerufen. Zahlungsanbieter können deshalb nicht allein anhand vorhandener
SDKs als funktionierend oder preisgleich gelten. Keine Zahlungsdaten,
Vertragszustimmung oder Bestellbestätigung eingegeben.

## Flipbase: heutiger Preisstand und angekündigte Pakete

Die öffentliche Seite bestätigt die folgende Darstellung. **Alle Pakete derzeit
0 € während der Beta; spätere Preise und Grenzen ausdrücklich vorläufig.**

| Paket    | Später gezeigter Monatspreis | Geplante Grenzen laut Landing                                                  |
| -------- | ---------------------------: | ------------------------------------------------------------------------------ |
| Standard |                         15 € | 1 Workspace                                                                    |
| Plus     |                         29 € | 3 Workspaces, bis 3 Vinted-Konten, weitere KI-/Suchfunktionen                  |
| Pro      |                         49 € | 5 Workspaces, bis 5 Vinted-Konten, größere KI-/Suchkontingente, bis 3 Personen |

Alle Buttons führen zur Beta-Bewerbung. Diese Paketnamen und Zahlen sind nicht
mit den ausführbaren Vintz-Paketen gleichzusetzen. Eine durchgesetzte
Standard-/Plus-/Pro-Zuordnung in der geprüften Zugangslogik wurde nicht gefunden.
Die Landing beschreibt Multi-Account noch als geplant, während in der App
bereits Cloudkonten vorhanden sind; Marketingstand und Funktionsstand sind
deshalb auch bei Flipbase auseinanderzuhalten.

### Was tatsächlich angebunden ist

- **Beta-Lizenz je Workspace:** Quelle, Status und Laufzeit. Die Betreiberfreigabe
  schlägt 60 Tage vor und erlaubt individuelle Dauer. Das ist keine öffentlich
  frei buchbare 60-Tage-Testphase. Laufzeitbeginn erfolgt bei Aktivierung;
  Ablauf/Widerruf wird serverseitig und in der Navigation berücksichtigt.
- **Workspace-/Kontengrenzen:** eigene Beta-Erstellungsregeln sowie optionales
  Cloud-IP-Limit je Workspace. Die IP-Grenze zählt nicht stornierte Einrichtungen
  und ist nicht automatisch der Landing-Paketgrenze gleichgestellt. Kein
  nachgewiesener tarifbezogener Teamplatzverkauf.
- **KI-Nutzung:** echte externe Recherche mit Token-/Suchkosten-Schätzung im
  abgegrenzten Betreiberpfad. Im untersuchten Pfad keine dauerhafte
  Kunden-Creditbuchung, Monatsquote oder Kostenreservierung vor dem Aufruf.
  Sitzungszähler ist kein Abrechnungskonto. Hinterlegte Anbieter-Rechenpreise
  wurden nicht als aktuelle Marktpreise verifiziert oder ausgegeben.
- **Bezahlwege:** Kein angeschlossener SaaS-Checkout, Aborechnungs-/Webhook-/
  Kündigungs-/Upgradeprozess im geprüften Umfang gefunden. Die vorhandenen
  Stripe-/PayPal-Namen im Waren-Webshop gehören zu simulierten Zahlfunktionen;
  sie belegen keine SaaS-Abrechnung.

### Interne Cloudkosten getrennt betrachten

Die optionale IPRoyal-Beschaffung kauft eine deutsche Dedicated-ISP-IP für
30 Tage. Der Code prüft das tatsächliche Angebot und begrenzt es auf höchstens
8 USD inklusive der gelieferten Steuerangabe; dies ist eine Sicherheitsgrenze,
**kein gemessener tatsächlicher Preis und kein Nutzeraufpreis**.

Die Zahlung verwendet ein serverseitiges Anbieterzahlungsmittel. Kaufabsicht und
Belege bleiben gespeichert; ungeklärte Zahlung verhindert automatischen Neukauf.
Verlängerung und Freigabe werden separat gesteuert. Server, Browsercontainer und
andere Betriebskosten sind in dieser Acht-Dollar-Grenze nicht enthalten.
Keine eigene Beschaffung oder Verlängerung ausgelöst und keine Kostenrechnung
aus der Grenze gegenüber Vintz' 2-Euro-Konfiguration abgeleitet.

## Festgehaltene Empfehlungen, keine Umsetzung

| Priorität | Richtung für Flipbase                                     | Später überprüfbares Ergebnis                                                                                                                |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Zuerst    | Paketdefinition und tatsächliche Berechtigungen verbinden | Landing, App und Server benutzen dieselben freigegebenen Grenzen; geplante Funktionen bleiben erkennbar.                                     |
| Zuerst    | Betriebskosten vor festen Cloudpaketen bestimmen          | Tatsächliche IP-/Server-/KI-Kosten und durchschnittliche Nutzung messen; Beschaffungsobergrenzen sind keine Kalkulation.                     |
| Danach    | Verbrauch und Rücksetztermine transparent machen          | Konten, Team, Verkäuferaktionen und Credits getrennt, inklusive gemeinsamer Kontenwirkung und konkretem Datum.                               |
| Danach    | Kosten nur nach klarer Bestätigung                        | Reservierung, Ergebnis, Rückgabe bei Fehler, Upgrade und unklarer Zahlungsstatus nachvollziehbar; kein scheinbarer Erfolg durch Platzhalter. |
| Danach    | Befristete Aktionen sauber ausweisen                      | Regulärpreis, aktueller Aktionspreis und Ende sichtbar; Preisänderung vor Start erneut bestätigen.                                           |
| Später    | Aboverwaltung vollständig planen                          | Buchung, Verlängerung, anteiliger Wechsel, Kündigung, Zahlungsausfall und Rechteänderung zusammenhängend prüfen.                             |

Vintz' konkrete Preise und Limits sind Vergleichswerte, keine freigegebene
Flipbase-Preisstrategie. Kein neuer Tarif oder Kontingentmechanismus beschlossen.

## Belege und offene Fragen

Geladene Vintz-Quellen: `017ne7iwbqmbb.js` (Tarife/Credits),
`27_-kqsl9q6fz.js` (Tarifdialog/Downloadkosten), `34zo03lcgnagc.js`
(Abrechnung/Verbrauch), `3t_pt7lo8x2se.js` (Reservierung/Aktion) und
`2xesihr9dsymb.js` (Zusatzkonten) unter `https://vintz.ai/_next/static/chunks/`.
[Quellenkennungen und SHA-256](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-pricing-source-identities-2026-10-18.json).

Bereinigte GET-Belege:
[Abo](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-subscription-status-2026-10-18.json),
[Aktionskontingent](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-seller-usage-2026-10-18.json),
[KI-Kontingent](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-ai-allowance-2026-10-18.json),
[Zusatzkonto-Konfiguration](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-extra-account-offer-2026-10-18.json).

Bilder:
[Tarifvergleich](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-plan-comparison-2026-10-18.png),
[Creditpakete](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-credit-packs-2026-10-18.png),
[Abrechnungsseite](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-billing-usage-2026-10-18.png),
[Gratisaktion](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-studio-free-promotion-2026-10-18.png),
[Flipbase-Betapreise](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-public-beta-pricing-2026-10-18.png).

Flipbase:
[Landing](../../landing/index.html),
[Lizenzschema](../../supabase/schemas/99_platform_admin.sql),
[Zugangsablauf](../../supabase/schemas/355_beta_access.sql),
[Cloud-IP-Limits und Kaufbelege](../../supabase/schemas/450_marketplace_cloud_ip_purchase.sql),
[IP-Beschaffung](../../services/marketplace-worker/src/iproyal-cloud-ip-purchase.ts),
[IP-Verlängerung](../../services/marketplace-worker/src/iproyal-cloud-ip-renewal.ts),
[KI-Kostenpfad](../../supabase/functions/barcode-ai-search/index.ts),
[KI-Sitzungszähler](../../src/app/core/services/barcode-ai-lookup.service.ts),
[Waren-Webshop-Zahlsimulation](../../src/app/core/services/store.service.ts).

Offen: Vintz-Abrechnungsgenauigkeit bei Fehler/Abbruch, echter Refund,
Apple-/PayPalpreise, berechtigter Zusatzkontokauf, Zählung geteilter Teams,
Downgrade mit überzähligen Konten und tatsächlicher Zahlungsausfall.
Keine vollständige Rechnung oder Kreditkartenabrechnung untersucht.

**Abschluss:** Nur Dokumentation ergänzt. Preisdialoge geschlossen,
Browserdiagnose beendet und vier separate Lesetabs geschlossen. Bestehende
Tabs und pausierte Flipbase-Verbindung unberührt. Keine Buchung, Zustimmung,
Kündigung, Generierung oder Umsetzung. Danach Stopp zur Besprechung.
