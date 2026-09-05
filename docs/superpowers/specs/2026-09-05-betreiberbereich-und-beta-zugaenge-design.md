# Betreiberbereich und Beta-Zugänge

**Stand 05.09.2026.** Entwurf, kein Arbeitspaket — er zerfällt in mehrere Pläne
(siehe „Umfang" am Ende).

## Ausgangslage

Flipbase soll in den nächsten Wochen an ausgewählte Interessenten als Beta
herausgehen. Dafür fehlt alles, was Zugang steuerbar macht. Am 05.09.2026
nachgesehen:

| Befund                                                                          | Bedeutung                                                                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/auth/register` ist offen erreichbar                                           | Jeder kann sich anlegen und die App unbegrenzt nutzen                                    |
| `enable_confirmations = false`                                                  | E-Mail-Adressen werden nie bestätigt                                                     |
| Die „Beta anmelden"-Formulare der Landing Page haben `action="…/auth/register"` | Sie speichern nichts. Es ist eine Abkürzung in die offene Registrierung, keine Bewerbung |
| `flipbase.de` hat keinen MX-Eintrag                                             | Die Domain kann keine Mail empfangen. Antworten auf eine Einladung prallen ab            |
| Kein SPF, kein DMARC                                                            | Niemand ist berechtigt, im Namen der Domain zu senden                                    |
| Keine Tabelle für Lizenz, Laufzeit, Tarif oder Bewerbung                        | Grüne Wiese                                                                              |
| `workspace_members.role` gilt je Arbeitsbereich                                 | Es gibt keine betreiberweite Rolle                                                       |
| 144 Schreib-Policies, fast alle über `is_workspace_member(workspace_id)`        | Ein Ansatzpunkt: die Lizenzprüfung lässt sich mechanisch einziehen                       |

Der offene Punkt „echter SMTP-Versand" steht bereits im Sanierungsplan vom
19.08.2026. Er ist seit Wochen bekannt und blockiert jetzt konkret die Beta.

## Zweck

**Beta-Zugänge vergeben, befristen und entziehen — und sehen, was damit
passiert.** Kein Geld, keine Rechnungen, keine Tarife.

Alles andere, was eine Betreiberkonsole später enthält, wird hier nur so weit
mitgedacht, dass das Datenmodell später nicht umgebaut werden muss.

## Der Weg eines Interessenten

```text
1. Bewerbung  ->  Landing Page, Formular an eine Edge Function
2. Pruefung   ->  Betreiberbereich: annehmen oder ablehnen, mit Notiz
3. Freigabe   ->  Einladung mit Laufzeit, Supabase verschickt sie
4. Anmeldung  ->  Registrierung nur mit gueltiger Einladung
5. Discord    ->  Einladungslink liegt in derselben Mail, Rolle von Hand
```

**Das Formular bleibt klein:** Vorname, Nachname, E-Mail, Einwilligungshaken mit
Datenschutzhinweis. Mehr nicht. Jedes zusätzliche Feld kostet Bewerber, und für
die Entscheidung „einladen oder nicht" reicht der Name.

**Warum eine Bewerbung kein Konto ist.** Eine Bewerbung kommt von jemandem, den
es im System noch nicht gibt. Als „inaktives Konto" angelegt, hätten wir
Karteileichen in der Anmeldung und müssten überall prüfen, ob ein Konto echt
ist. Beides bleibt getrennt.

**Ablehnung verschickt nichts.** Sie bleibt mit Grund stehen, damit dieselbe
Person nicht zweimal in der Liste auftaucht.

**Die Laufzeit** ist standardmäßig sechs Monate und je Einladung überschreibbar.

## Datenmodell

Drei neue Tabellen. Alle im Schema `public`, alle mit RLS.

**`beta_applications`** — Vorname, Nachname, E-Mail, Eingang, Status
(offen/angenommen/abgelehnt), Entscheidungsnotiz, Entscheider, Entscheidungszeit
und **die bewilligte Laufzeit**. Für `anon` vollständig gesperrt; geschrieben
wird ausschließlich durch die Edge Function.

Die Laufzeit steht bewusst hier und nicht in einer eigenen Einladungstabelle:
Zwischen Freigabe und Registrierung muss sie irgendwo überleben, und Supabase
verwaltet zwar den Einladungslink, aber nichts Fachliches dazu. Beim Einlösen
wird die Bewerbung über die E-Mail-Adresse wiedergefunden — es ist dieselbe, an
die die Einladung ging — und daraus die Lizenz gebildet.

**`workspace_licenses`** — je Arbeitsbereich eine Zeile, angelegt zusammen mit
dem Arbeitsbereich: Status (Test, aktiv, abgelaufen, gesperrt), Enddatum,
Notizfeld. Keine Historie — Änderungen stehen im Prüfprotokoll, das seit dem
Einstellungs-Audit vorhanden ist.

Ein Arbeitsbereich **ohne** Lizenzzeile gilt als nicht schreibberechtigt. So
bleibt kein Arbeitsbereich durch eine vergessene Zeile unbegrenzt offen: Der
Fehlerfall ist die Sperre, nicht die Freigabe.

**`platform_operators`** — Betreiber, quer über alle Arbeitsbereiche. Bewusst
eine eigene Tabelle statt eines Feldes am Profil: Eine Rolle mit dieser Reichweite
soll man an einer Stelle sehen und entziehen können.

**Platz für die Abrechnung.** Tarif und Abrechnung hängen später am
Arbeitsbereich, nicht an der Lizenz — eine Lizenz sagt „darf nutzen bis", ein
Tarif sagt „darf was und kostet wieviel". Die beiden Begriffe werden hier nicht
vermischt, damit `plans` und `invoices` später danebengestellt werden können,
ohne `workspace_licenses` anzufassen.

## Lizenz und Sperre

Eine abgelaufene oder gesperrte Lizenz bedeutet: **anmelden ja, lesen ja,
schreiben nein.** Niemand wird von seinen eigenen Geschäftszahlen ausgesperrt.

Das ist inhaltlich die richtige und technisch die teurere Wahl. Ein kompletter
Zugangsstopp wäre eine Zeile; „nur lesen" heißt, dass jede schreibende Regel in
der Datenbank die Lizenz kennen muss.

Machbar wird es durch den Befund von oben:

- Neuer Helfer **`can_write_workspace(workspace_id)`** — Mitglied **und** Lizenz
  erlaubt Schreiben. `stable`, damit er je Anweisung einmal ausgewertet wird.
- In allen schreibenden Policies wird `is_workspace_member(...)` durch den neuen
  Helfer ersetzt. **Lesende Regeln bleiben unangetastet.**
- **Wächtertest (pgTAP):** Keine `insert`/`update`/`delete`-Policy auf einer
  Arbeitsbereichs-Tabelle darf noch den bloßen Mitgliedschaftshelfer verwenden.
  Als Arbeitsbereichs-Tabelle gilt dabei jede Tabelle im Schema `public` mit
  einer Spalte `workspace_id`. Der Test liest `pg_policies` und fällt deshalb
  auch bei Tabellen an, die später dazukommen — auch bei solchen von anderen
  Assistenten.

**Ausnahmen, die trotz Sperre gehen müssen:** das eigene Profil ändern, sich
abmelden, den Arbeitsbereich verlassen. Ohne sie sperrt man Leute aus ihrem
eigenen Konto aus.

**Das Risiko liegt im Umfang, nicht in der Idee.** Eine übersehene Regel bleibt
still beschreibbar — das fängt der Wächtertest. Eine zu viel gesperrte blockiert
etwas Harmloses — das fängt die Ausnahmeliste plus Tests.

## Betreiberrolle und Sichtbarkeit

Der Betreiber bekommt **keinen** Lesezugriff auf Geschäftsdaten der Kunden.

Das ist kein Verzicht, sondern die günstigere und sauberere Lösung: Sonst müssten
über hundert Policies um Betreiberausnahmen erweitert werden — mehr Arbeit,
größere Angriffsfläche. Und fremde Einkaufspreise gehen den Betreiber nichts an.

Sichtbar sind: Arbeitsbereiche, Nutzer mit Name, E-Mail und Registrierdatum,
Lizenzen, Bewerbungen.

**Nutzungszahlen** liefert eine eigene Funktion, die nur Zahlen zurückgibt — wie
viele Artikel, wie viele Verkäufe, letzte Anmeldung. Der Betreiber sieht _dass_
jemand arbeitet, nicht _was_ er tut. Für eine Beta ist genau das die gesuchte
Auskunft.

Jeder Betreibereingriff wird protokolliert.

## E-Mail

Ohne funktionierenden Versand gibt es keine Einladung und damit keine Beta.
Supabase läuft hier selbst gehostet und hat **keinen** eingebauten Mailversand —
ohne hinterlegten SMTP-Zugang verschickt der Anmeldedienst gar nichts, auch keine
Passwort-Zurücksetzung.

**Zwei getrennte Wege:**

| Aufgabe               | Weg                                 |
| --------------------- | ----------------------------------- |
| Empfangen (Antworten) | netcup-Postfach, per MX-Eintrag     |
| Senden (Einladungen)  | Versanddienst, per SMTP an Supabase |

Die Absenderadresse bleibt in beiden Fällen `@flipbase.de`.

**Kein eigener Mailserver.** Nicht wegen der Kosten — ein eigener Server auf dem
vorhandenen Hetzner-Server wäre kostenlos. Der Preis ist Zustellbarkeit: Eine
frische Server-IP hat keinen Ruf bei Gmail und Outlook, ausgehender Port 25 ist
bei Hetzner ab Werk gesperrt, und das Versagen ist unsichtbar — die Mail landet
still im Spam. Ausgerechnet die Mail, mit der ein Interessent seinen Zugang
bekommt. Dazu Dauerpflege: Sperrlisten, Rückläufer, Zertifikate, und ein falsch
konfigurierter Server wird zum offenen Relay.

**Vorschlag: Brevo** — französisch, Verarbeitung in der EU, AV-Vertrag im
Standard, kostenlose Stufe. Die aktuellen Mengengrenzen werden vor der Umsetzung
geprüft.

SPF, DKIM und DMARC werden in **jedem** Fall gebraucht — diese Arbeit spart kein
Weg ein.

**Die Wahl ist reversibel.** Supabase will nur SMTP-Zugangsdaten. Ein Wechsel des
Dienstes ändert keine Zeile Code.

**Voraussetzungen durch den Betreiber:** Postfach bei netcup anlegen,
Brevo-Konto anlegen, Zugangsdaten bereitstellen. Die Zugangsdaten gehören in die
Servergeheimnisse, nicht ins Projekt.

## Aufbau in der App

`src/app/features/platform-admin/`, nachgeladen unter `/admin`, im Menü nur für
Betreiber sichtbar. Der Routen-Wächter dient der Bedienbarkeit; **die Befugnis
liegt in der Datenbank.**

**Bindende Regel:** Der Bereich darf nichts aus den Kundenfeatures benutzen, nur
`core/` und `shared/`. Das ist die Bedingung dafür, dass ein späterer Umzug in
eine eigene Anwendung ein Verschieben bleibt und kein Umbau.

Seiten: Bewerbungen (Liste, annehmen/ablehnen), Kunden (Liste der
Arbeitsbereiche mit Lizenzstatus), Kundendetail (Lizenz setzen, verlängern,
sperren, Nutzungszahlen).

### Warum kein getrenntes Deployment

Bei großen Anbietern ist die interne Verwaltung fast immer eine eigene
Anwendung. Der Grund ist selten Technik: Dort arbeiten Support, Buchhaltung und
Vertrieb mit unterschiedlichen Befugnissen, und es muss belegbar sein, wer wann
in fremde Kundendaten gesehen hat. Hier gibt es einen Betreiber und null zahlende
Kunden.

Bei kleinen Anbietern ist der eingebaute Betreiberbereich der Normalfall — so
sehr, dass ganze Werkzeuge nur dafür existieren (Djangos Admin, ActiveAdmin,
Nova). Entscheidend für die Seriosität sind nicht eine oder zwei Anwendungen,
sondern: Befugnis in der Datenbank, Protokoll über jeden Eingriff, getrennte
Rollen ohne Generalschlüssel, und Zurückhaltung beim Einsehen fremder Daten.

Ein zweiter Auslieferungsweg würde Wochen kosten und heute nichts schützen, was
RLS nicht schon schützt.

## Änderungen im Kundenbereich

- Registrierung nur noch mit gültiger Einladung; die offene Registrierung wird
  vorübergehend deaktiviert
- E-Mail-Bestätigung eingeschaltet
- Deutlicher Hinweis bei abgelaufener Lizenz, mit Erklärung statt Fehlermeldung

## Bewusst nicht in diesem Schritt

- **Abrechnung, Tarife, Rechnungen** — das Datenmodell lässt Platz, gebaut wird
  nichts. Sobald echtes Geld fließt, hängen Rechnungspflichtangaben,
  Umsatzsteuer, Aufbewahrungsfristen und Widerrufsrecht daran; das ist nicht
  schwer, aber schwer zu korrigieren, wenn die ersten Rechnungen falsch draußen
  sind
- **Automatische Discord-Rollenvergabe** — bräuchte Discord-Anmeldung, einen Bot
  mit Rechteverwaltung und die Verknüpfung beider Konten. Größer als der ganze
  Bewerbungsweg
- **„Als Kunde ansehen"** — im Alltag wertvoll, aber der heikelste Knopf.
  Kommt erst mit Protokollpflicht und zeitlicher Begrenzung
- **Botsteuerung des Deal Monitors** — kommt direkt danach; sie war der Auslöser
  dieser Überlegung
- **Eigene Admin-Anwendung** — später möglich, der Bereich wird nur passend
  geschnitten

## Wie geprüft wird

Datenbankseitig:

- Unangemeldete kommen weder lesend noch schreibend an `beta_applications`
- Nichtbetreiber kommen nicht an fremde Arbeitsbereiche oder Lizenzen
- Bei abgelaufener Lizenz schlägt Schreiben fehl, Lesen geht weiter
- Die Ausnahmen (eigenes Profil, Austritt) funktionieren trotz Sperre
- Der Wächtertest über alle Schreib-Policies

In der App: Komponententests für die drei Seiten, und der Nachweis, dass der
Menüpunkt für Nichtbetreiber nicht erscheint.

Und einer, der sich nicht simulieren lässt: **eine echte Einladung an ein echtes
Postfach**, bei Gmail und Outlook, mit Blick in den Spam-Ordner.

## Umfang: mehrere Pläne

Nacheinander umzusetzen und einzeln abzunehmen:

1. **E-Mail-Grundlage** — Postfach, Versanddienst, DNS-Einträge,
   Supabase-Konfiguration, Zustelltest. Voraussetzung für alles Weitere und
   unabhängig vom Rest baubar.
2. **Bewerbungsweg** — Tabelle, Edge Function, Formular auf der Landing Page,
   Bewerbungsliste im Betreiberbereich.
3. **Lizenz und Sperre** — Tabellen, Betreiberrolle, der Helfer, die Umstellung
   der 144 Policies, der Wächtertest, Hinweis im Kundenbereich.
4. **Einladung und Registrierung** — Einladung erzeugen und verschicken,
   Registrierung nur noch mit Einladung, offene Registrierung schließen.

Teil 1 ist die Voraussetzung. Teil 3 ist der größte und der einzige, der
bestehende Regeln in großer Zahl anfasst.

## Offene Punkte

1. Ob im netcup-Vertrag Postfächer enthalten sind — muss der Betreiber
   nachsehen.
2. Die aktuellen Mengengrenzen der kostenlosen Brevo-Stufe.
3. Ob die Landing Page einen Datenschutzhinweis hat, der eine Bewerbung abdeckt.
   Beim Shop sind die Rechtstexte laut Routenkommentar Platzhalter; für ein
   Formular, das personenbezogene Daten speichert, reicht das nicht.
