# Vintz: Rangliste, Rewards, Empfehlungen und Discord im Vergleich mit Flipbase

Stand: 18.10.2026, Juna. Gesondert freigegebener Analyseblock V-20. Danach
stoppen und besprechen. Keine Teilnahme, Freigabe, Einladung, Verknüpfung,
Belohnungsanforderung oder Umsetzung freigegeben.

## Ergebnis

Vintz verbindet vier unterschiedliche Bindungsmechaniken: Wettbewerb nach
Verkaufsanzahl, persönliche Umsatzmeilensteine, Credit-Prämien für Empfehlungen
und Discord-Rollen nach Tarif. Besonders gelungen sind die sichtbaren Ziele,
die Vorschau noch gesperrter Belohnungen und die Erklärung der Zählweise.
Das aktuelle leere Ranking und zwei ältere Feed-Einträge belegen allerdings
keine lebhafte Community oder zuverlässige automatische Prämienvergabe.

Flipbase hat bereits einen echten freiwilligen Discord-Ablauf mit
Serverbeitritt und Beta-Tester-Rolle. Rangliste, Verkaufs-Rewards und
Empfehlungsprämien fehlen im abgegrenzten geprüften Code. Die tatsächlichen
Beta-Einladungen sind ein Betreiberprozess und kein Empfehlungsprogramm.

## Prüfrahmen und Nachweise

- Vintz: [Rangliste](https://vintz.ai/leaderboard),
  [Meilensteine](https://vintz.ai/milestones),
  [Konto/Empfehlungen](https://vintz.ai/settings) und
  [Discord](https://vintz.ai/discord) in separaten Lesetabs geprüft.
- Ranglistenhilfe, Tag/Woche/Monat, unveränderter Beitrittsdialog,
  Fortschrittshilfe und gesperrte T-Shirt-Vorschau gelesen. Beitritt abgebrochen;
  kein Schalter geändert. Wochenansicht wiederhergestellt.
- Gewöhnliche Aktualisieren-Buttons rufen Rangliste, Feed und Rewards lesend
  ab. HTTP 200 und ausgewählte Zähler/Freigaben gesichert. Keine Vinted-
  Synchronisierung und kein schreibender Fachauftrag.
- Geladene eigene Webquellen gelesen, keine Serverquellen von Vintz verfügbar.
  Sicherheits-/Verifikationsversprechen bleiben deshalb von geprüfter
  Serverdurchsetzung getrennt.
- Flipbase: [Discord-Onboarding](https://app.flipbase.de/onboarding/discord)
  live gelesen; aktuell keine Verbindung für diesen Beta-Zugang verfügbar.
  Quellen unabhängig bei HEAD `8cef6b78ad34b9cbecf7c81be728d5e34883319a`
  untersucht. Kein OAuth-Start, kein Serverbeitritt.
- Keine mobilen, AXE-, Last-, Missbrauchs-, Zustell- oder vollständigen
  Einlöse-/Zahlungstests. Bestehende Nutzer-Tabs und pausierte Cloudverbindung
  bleiben unberührt.

Bereinigte [GET- und Quellenbelege](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-community-rewards-evidence.json)
enthalten keine Kontokennung, E-Mail, Empfehlungskennung, Adresse oder Tokens.
Die Fremdquellen werden nicht in Flipbase übernommen.

## Rangliste: Verkaufsanzahl und öffentliche Freigabe

Die Seite bietet Tag, Woche und Monat sowie eigene Position, Verkäufe im
Zeitraum, Gesamtverkäufe und Abstand zum ersten Platz. Der Code zeigt maximal
die ersten 100 Positionen sowie gegebenenfalls die eigene Position. Die
Verkäufertabelle enthält Rang, Anzeigename, Verkaufsanzahl und letzten Verkauf.
Es handelt sich um einen Wettbewerb nach **Anzahl**, nicht nach Gewinn oder
Umsatz. Kosten, Marge und Retourenquote sind hier kein sichtbares Rankingmaß.

Aktueller Zustand: nicht teilnehmend, anonym, Feed-Freigabe aus,
Kontoverbindung vorhanden, Position leer und Verkaufszähler null. Die normale
Wochenabfrage liefert keine Ranglisteneinträge; auch Tag/Monat zeigten keine.
Zwei abgeschlossene Bestellungen aus V-09 widersprechen diesem Nullstand nicht
zwangsläufig: Die Ranglistenhilfe schließt rückwirkendes Anrechnen früherer
Verkäufe ausdrücklich aus.

Die Hilfe beschreibt vier Prüfungen: Vinted-Bestätigung eines zunächst noch
aktiven Angebots, Serverzeit statt Browserzeit, einmaliges Zählen je
Marktplatzartikel und gesonderte Prüfung der Kontoinhaberschaft. Persönliche
Browseralarme reichen laut Text nicht aus. Diese Oberfläche belegt die
erklärte Regel, nicht deren serverseitige Unumgehbarkeit.

Der Beitrittsbutton öffnet zunächst einen **lokalen Dialog**. Erst dessen
Formularabschluss sendet einen PATCH an `/api/seller/leaderboard` mit
Anzeigename, Anonymität, Teilnahme und Feed-Freigabe. Live unverändert gelesen:

- „Meinen Namen ausblenden“ ist an; das vorausgefüllte Namensfeld ist gesperrt.
- „Verkäufe im Live-Feed teilen“ ist im neuen Beitrittsdialog ebenfalls an,
  obwohl der gespeicherte Feed-Zustand vor Teilnahme aus ist.
- „Nicht jetzt“ schließt ohne Speicherung. Keine Teilnahme ausgeführt.

Der geladene Code begrenzt den Namen auf 32 Zeichen und sieht später Profil-
Speicherung sowie Austritt vor. Beim Austritt wird die Feed-Freigabe im PATCH
ebenfalls ausgeschaltet. Ob der Server bereits veröffentlichte Daten zuverlässig
entfernt, wurde nicht getestet. Anbieterangaben zu dieser Rücknahme stehen in
der [Datenschutzerklärung](https://vintz.ai/datenschutz).

### Feed und Wochenprämien

Der Feed zeigte zwei Verkäufe desselben angezeigten Verkäufers: 29,95 € vom
28.09. und 24,95 € vom 23.09.; am Prüftag als ungefähr 20 beziehungsweise
25 Tage alt dargestellt. „Live“ ist hier die Bezeichnung der Ansicht, kein
Nachweis neuer Verkäufe während der Untersuchung.

Das Frontend fragt `/api/seller/live-sales` bei Fokus und bei sichtbarem
Dokument alle 15 Sekunden ab. Keine dauerhafte Pushverbindung im gelesenen
Feedpfad. Das kleine Diagramm entsteht ab zwei Werten derselben Währung aus
maximal zehn Einträgen. Gemischte Währungen unterdrücken das Diagramm;
eine Umrechnung ist in diesem Pfad nicht vorhanden.

Die Seite nennt 1.000/500/250 Credits für die ersten drei Wochenplätze,
Montag bis Sonntag in Berliner Zeit, mit automatischer Gutschrift montags.
Keine eigene Qualifikation und keine Auszahlung beobachtet. Gleichstand,
Mindestteilnehmerzahl, Betrugsprüfung, Korrekturen und tatsächlicher
Abrechnungslauf bleiben ungeklärt. Diese Credits sind von physischen
Umsatzbelohnungen zu trennen.

## Meilensteine und physische Rewards

Aktuell 0 € gezählter Umsatz, 0 gezählte Verkäufe, 0/8 Abzeichen und keine
Anträge. GET `/api/seller/rewards` bestätigt als Datenquelle
`worker_verified_observed_prices`, außerdem null Verkäufe ohne belastbaren
Preis und null in anderen Währungen. Der Quellenname ist kein Nachweis der
vollständigen Worker-Implementierung.

| Umsatzschwelle | Sichtbarer Erfolg / Belohnung |
| -------------- | ----------------------------- |
| 500 €          | Erstes Abzeichen              |
| 1.000 €        | Abzeichen                     |
| 2.500 €        | Abzeichen                     |
| 5.000 €        | Vintz T-Shirt                 |
| 10.000 €       | Vintz Kappe                   |
| 25.000 €       | Abzeichen                     |
| 50.000 €       | Persönlicher Brief            |
| 100.000 €      | Vintz Medaille                |

Die Fortschrittsanzeige nennt das nächste Ziel und den fehlenden Betrag.
Die gesperrte T-Shirt-Karte öffnet eine Produktvorschau mit Beschreibung und
noch fehlenden 5.000 €. Das finale Produkt kann laut Hinweis abweichen.
Eine Vorschau ist keine Anforderung und keine zugesicherte Lieferqualität.

Die Hilfe trennt bestätigte EUR-Verkäufe zum letzten beobachteten Angebotspreis
von ausgehandelten Endpreisen. Bundles und Erstattungen können abweichen und
werden laut Text vor Versand geprüft. Manuelle Buchhaltung schaltet keine
Belohnungen frei. Daraus folgt: Der angezeigte Reward-Umsatz ist **kein
verlässlicher Ersatz für echten Erlös oder Gewinn**.

Im geladenen Code vorgesehen, nicht ausgeführt:

- Freigeschaltete Abzeichen erhalten eine lokale Bildkarte zum Speichern,
  Kopieren oder geräteabhängig Teilen.
- Antrag mit Name, Anschrift, Land und gegebenenfalls Kleidergröße. Zweite
  Prüf-/Bestätigungsstufe vor dem verbindlichen POST; keine Adresse eingegeben.
- Status `requested`, `approved`, `shipped`, `delivered`, `rejected`, `cancelled`.
  Rücknahme eines noch angefragten Rewards erfolgt als eigener POST.
- Behandlung einer fehlenden Mitgliedschaft und erneutes Laden bei Fehlern.
- Gemeinsamer Erfolgsbaustein für neue Umsatzstufen und ersten Verkauf:
  lokale Vormerkung bereits gefeierter Stufen pro Nutzer, höchstens alle zwei
  Minuten neue Rewardabfrage bei sichtbarer Seite, reduzierte Bewegung.
  Keine Feier absichtlich ausgelöst; erstmaliges Laden soll alte Stufen
  lediglich vormerken.

Ob Verifikation, einmalige Einlösung, Versand, Rücknahme und Statuswechsel
serverseitig funktionieren, bleibt ohne echte Berechtigung und Ausführung offen.

## Empfehlungen: Credits nach erster Zahlung

Im Konto stehen ein persönlicher kopierbarer Empfehlungslink, **100 Credits
für den Werber und 50 für den Freund**, Zähler für Eingeladen/Ausstehend/Belohnt
und die erhaltenen Credits. Alle vier Zähler aktuell null. Der Link wurde weder
kopiert noch geöffnet oder geteilt; keine persönliche Kennung im Bericht.

Die sichtbare Bedingung ist E-Mail-Bestätigung **und erster Credit-Kauf**.
Ein bloßes Registrieren reicht laut UI nicht. Ob ein Aboabschluss ohne
gesonderten Credit-Kauf genügt, bleibt offen. Keine Barauszahlung, prozentuale
Provision oder wiederkehrende Vergütung aus dieser Oberfläche ableitbar.

Das geladene Kopiermodul schreibt nur den vorhandenen Link in die Zwischenablage
und meldet Erfolg/Fehler. Der Weg `/settings#referrals` enthält zusätzlich einen
POST zum Empfehlungs-Prompt; er wurde nicht aufgerufen. Cookie-Laufzeit,
Zuordnungspriorität, Selbstwerbung, Mehrfachkonten, Erstattung, Prämienrücknahme
und tatsächliche Buchung sind nicht geklärt. Die Anzeige allein belegt kein
vollständig getestetes Empfehlungsprogramm.

## Discord: Vintz und Flipbase

Vintz trennt auf der Seite einen externen Serverbeitritt von „Discord verbinden“
unter `/discord/claim`. Angezeigt werden Community für Support/Updates/Tipps und
die Tarifrolle Pro. Kein OAuth-Link geöffnet und kein Server betreten; der
verbundene Zustand und dessen Fehlerhilfen wurden nicht live geprüft.

Nach [Anbieterangabe](https://vintz.ai/datenschutz) fordert Vintz nur `identify`
an, gleicht Starter-/Pro-/Scale-/Free-Rollen bei Tarifänderungen ab und entfernt
die Rolle beim Trennen. Das sind Anbieterbeschreibungen, keine in dieser
Untersuchung bestätigten Discord-API-Aktionen.

Flipbase hat einen konkreten serverseitigen Ablauf:

1. Freiwilliger dritter Registrierungsschritt mit Überspringen; zusätzlicher
   Dashboardbanner nur bei berechtigtem, konfiguriertem, unverknüpftem Zugang.
2. Berechtigt ist eine angenommene und registrierte Beta-Bewerbung mit aktiver,
   noch gültiger zugehöriger Lizenz. Der aktuelle Nutzer sieht live
   „Für diesen Beta-Zugang ist die Discord-Verbindung nicht verfügbar.“ Daraus
   folgt kein allgemeiner Ausfall der Discord-Konfiguration.
3. OAuth mit `identify guilds.join`; ein signierter, nutzergebundener und zehn
   Minuten gültiger Übergabewert schützt den Abschluss. `guilds.join` wird für
   den automatischen Beitritt benötigt; der größere Umfang gegenüber Vintz'
   beschriebenem Ablauf hat damit einen konkreten Zweck.
4. Nach Austausch des Codes: Discord-Identität lesen, Mitgliedschaft hinzufügen,
   konfigurierte Beta-Rolle vergeben, erst danach Erfolgszeitpunkt speichern.
5. Eindeutige Nutzer-/Discord-Zuordnung, Wiederholung mit demselben Discord-Konto
   bei unklarem Anbieterfehler. Code und Übergabewert werden aus der sichtbaren
   Callback-Adresse entfernt. Keine dauerhaften OAuth-Tokens in der Linktabelle.

Zwei konkrete Grenzen in Flipbase: `linked` beruht auf dem gespeicherten
Rollenzeitpunkt und prüft nicht bei jedem Statusaufruf die aktuelle Mitgliedschaft.
In der geprüften Actionliste stehen nur Status, Start und Abschluss; kein
Nutzerablauf zum Trennen/Wechseln und kein automatischer Rollenentzug bei
Beta-Ende gefunden. Aktuelle Discord-Rollen und produktive Anbieterzugriffe
wurden nicht getestet.

Die **Discord-Webhooks für Benachrichtigungen** sind davon unabhängig: Sie
senden Workspace-Mitteilungen an eine hinterlegte Webhook-Adresse. Die
Community-Verknüpfung aktiviert keinen Benachrichtigungskanal und keine Rewards.

## Vergleich und Vorschläge zur Besprechung

| Bereich             | Vintz                                                                | Flipbase                                            | Einordnung                                                                                   |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Rangliste           | Opt-in, verifizierte Verkaufsanzahl, drei Zeitfenster, Wochencredits | Kein entsprechender Pfad gefunden                   | Nachrangiger Community-Baustein; kein Beleg für bessere Verkaufssteuerung                    |
| Persönliche Erfolge | Acht Umsatzstufen, vier physische Rewards, Vorschau/Teilen           | Kein entsprechendes Modell gefunden                 | Ziele und Fortschritt sind gut übertragbar; physische Prämien schaffen laufenden Aufwand     |
| Empfehlungen        | Beidseitige Credits nach bestätigter E-Mail und erstem Credit-Kauf   | Kein Prämienprogramm gefunden                       | Späterer Wachstumsbaustein; benötigt zuerst belastbare Abrechnung und Missbrauchsregeln      |
| Beta-Einladung      | Hier nicht als Referral geprüft                                      | Echter Betreiber-/SMTP-Prozess                      | Keine Empfehlungsbelohnung, keine Werberzuordnung                                            |
| Discord             | Communitybeitritt getrennt von tarifabhängiger Rolle                 | Freiwilliger automatischer Beitritt plus Beta-Rolle | Grundlage bereits vorhanden; Zustandsprüfung, Trennen und Rollenentzug sinnvoller als Neubau |

Prioritäten als Vorschlag, keine Umsetzungsfreigabe:

1. **Bestehende Discord-Verbindung vervollständigen:** verständlicher Status,
   Trennen/Wechseln und klarer Umgang mit abgelaufenem Zugang. Betreiberentscheid
   über Rollen nach Beta-Ende erforderlich, nicht stillschweigend entziehen.
2. **Persönliche Meilensteine prüfen:** nachvollziehbare eigene Ziele mit
   eindeutiger Datenbasis. Umsatz, Erlös und Gewinn sauber trennen; keine
   fragwürdige Genauigkeit aus letzten Angebotspreisen übernehmen.
3. **Empfehlungen später bewerten:** beidseitiger Vorteil ist verständlich,
   aber erst bei passenden Tarifen, Kosten und nachvollziehbarer Prämienbuchung.
4. **Rangliste und Merch zurückstellen:** optionaler Community-Nutzen,
   keine vorrangige Lücke im Arbeitsablauf. Feed-Freigabe bei einer möglichen
   Übernahme bewusst separat wählen lassen; Vintz' Vorauswahl nicht ungeprüft
   übernehmen.

## Quellen und Abschluss

Flipbase, aktuelle Quellen:

- [Geschützter Einstieg](../../src/app/app.routes.ts#L135),
  [Discord-Oberfläche](../../src/app/features/beta-discord/pages/discord-onboarding/discord-onboarding.component.html),
  [Status/Start](../../src/app/features/beta-discord/pages/discord-onboarding/discord-onboarding.component.ts#L39),
  [Dashboardbanner](../../src/app/features/beta-discord/components/beta-discord-banner/beta-discord-banner.component.ts#L23).
- [Berechtigung, Status und OAuth](../../supabase/functions/beta-discord/index.ts#L173),
  [Beitritt/Rolle](../../supabase/functions/beta-discord/index.ts#L113),
  [signierter Übergabewert](../../supabase/functions/beta-discord/discord-oauth.ts#L29),
  [Wiederholungen](../../supabase/functions/beta-discord/complete-discord-link.ts),
  [Linktabelle](../../supabase/schemas/100_beta_discord.sql#L3).
- [Echte Beta-Einladung](../../supabase/functions/beta-invite/index.ts#L205),
  [SMTP-Ausführer](../../supabase/functions/_shared/beta-email-delivery.ts#L64),
  [separater Webhookversand](../../supabase/functions/webhook-dispatch/handler.ts#L39).

Die negative Suche umfasst Dateinamen und Inhalte in `src/app`,
`supabase/schemas`, `supabase/functions`, `services` und `landing`: unter anderem
`leaderboard`, `rangliste`, `ranking`, `reward`, `milestone`, `referral`,
`affiliate`, `loyalty`, `achievement`, `empfehlungsprogramm`, `empfehlungscode`.
Kein entsprechendes angeschlossenes Feature gefunden. Das ist kein Nachweis
gegen extern betriebene oder unveröffentlichte Systeme.

Vintz-Quellhashes stehen im oben verlinkten bereinigten Beleg: Ranglistenmodul
`05flzhxntb1_g.js`, Rewards `2msmta1-yqdck.js`, gemeinsamer Erfolgsbaustein
`3t_pt7lo8x2se.js`, Einstellungen/Kopieren `3b0d3xtusbnx1.js`.
Bildbelege: [Rangliste](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-leaderboard-overview.png),
[gesperrte Rewardvorschau](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/vintz-rewards-preview.png),
[Flipbase-Zugang](C:/Users/Grisc/.codex/visualizations/2026/10/17/01a14b74-eec9-7412-a66d-b0c8fce4fbbc/flipbase-discord-unavailable.png).

Keine Teilnahme, Namens-/Feedfreigabe, Prämienanforderung, Kopie/Weitergabe eines
Empfehlungslinks, Zahlung, Discord-Verbindung, Einladung oder Umsetzung.
Dialoge geschlossen, Wochenansicht zurückgesetzt, lesende Netzwerkdiagnose
beendet und separate Prüftabs geschlossen. Nur Dokumentation; Markdown,
lokale Verweise und Unterschiedskontrolle geprüft. Keine Anwendungstests nötig.
**Stopp zur Besprechung.** Die benannten Navigationsbereiche sind damit als
Vergleich eingeordnet; echte Ausführung, verborgene Funktionen und die
übergreifenden Prüflücken der Funktionsabdeckung bleiben davon unberührt.
