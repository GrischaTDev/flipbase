# Sitzungsdauer und Anmeldehinweis auf der Landingpage

**Datum:** 2026-08-23
**Beteiligt:** Grischa Tänzer, Claude Opus 5
**Status:** Entwurf, freigegeben – Umsetzung offen

---

## Ausgangsfrage

Ein Klick auf "Anmelden" auf der Landingpage führte ohne jede Rückmeldung
direkt ins Dashboard. Zwei Fragen ergaben sich daraus:

1. Ist das eine Sicherheitslücke, und gibt es Vorgaben, wann eine Anmeldung
   von selbst ablaufen muss?
2. Kann die Landingpage anzeigen, dass man bereits angemeldet ist?

Zur ersten Frage: **keine Lücke.** Der Link zeigt auf `app.flipbase.de`,
Supabase stellt die im Browser gespeicherte Sitzung wieder her
(`persistSession: true`), der `authGuard` lässt durch und der `guestGuard`
schickt Angemeldete von der Anmeldeseite direkt aufs Dashboard. Serverseitig
ist jede der 32 Tabellen mit RLS geschützt (127 Policies). Der Demo-Modus
scheidet aus, weil `allowDemoMode` im Produktions-Build `false` ist.

Ein echter Mangel blieb: **die Sitzung läuft nie ab.** Das Refresh-Token
wird endlos erneuert.

## Rechercheergebnis: Vorgaben zur Sitzungsdauer

Kein Gesetz nennt eine Zahl. Die DSGVO (Art. 32) verlangt "angemessene
Maßnahmen nach dem Stand der Technik"; die konkreten Werte stammen aus
Standards:

| Quelle                        | Inaktivität                         | Absolut                         |
| ----------------------------- | ----------------------------------- | ------------------------------- |
| OWASP                         | 15–30 Min gering, 2–5 Min sensibel  | 4–8 Std bei ganztägiger Nutzung |
| NIST 800-63B, AAL1 (Passwort) | optional                            | **höchstens 30 Tage**           |
| NIST 800-63B, AAL2 (mit MFA)  | 30 Min                              | 12 Std                          |
| BSI IT-Grundschutz            | Bildschirmsperre am Gerät (~10 Min) | – (warnt vor Datenverlust)      |

Zwei Punkte bestimmen die Entscheidung: OWASP besteht darauf, dass der Ablauf
**serverseitig** erzwungen wird – eine Uhr im Frontend ist manipulierbar. Und
der BSI-Einwand trifft Flipbase direkt: Wer mitten in einem Einkaufs- oder
Verkaufsformular abgemeldet wird, verliert Eingaben. Ein kurzes
Inaktivitäts-Timeout wäre hier schädlich.

Flipbase meldet mit Passwort ohne zweiten Faktor an, das entspricht AAL1.
Maßgeblich ist damit die 30-Tage-Grenze.

### Wie es in der Praxis gehandhabt wird

Die Normen sind nur die eine Hälfte. Gegengeprüft, was verbreitete Dienste
tun:

- **Verbrauchershops (Amazon & Co.):** Sitzung praktisch unbegrenzt auf dem
  vertrauten Browser. Möglich ist das, weil eine zweite Schranke dahinter
  sitzt: Vor Passwortänderung, Zahlungsmitteln und Lieferadressen wird erneut
  das Passwort verlangt, dazu kommt Risikoerkennung bei neuem Gerät oder Ort.
- **Büro-Software (Microsoft 365, Google Workspace, Slack):** Standard ist
  ebenfalls "angemeldet bleiben". Feste Abmeldezeiten schaltet ein
  Administrator bewusst ein; Microsoft erlaubt dabei 1 bis 24 Stunden
  Inaktivität.
- **Banking und Steuerkanzleien:** 5–15 Minuten.

Flipbase liegt dazwischen: Geschäfts- und Steuerdaten, aber ein Nutzer auf dem
eigenen Rechner und keine Zahlung, die jemand auslösen könnte. Bankenwerte
wären hier unangemessen. Die Bequemlichkeit der Verbrauchershops ist
vertretbar – nur fehlt uns deren zweite Schranke, deshalb bleibt eine absolute
Obergrenze sinnvoll.

## Getroffene Entscheidungen

| Frage                       | Entscheidung                                           | Begründung                                                                                                                                  |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Absolute Sitzungsdauer      | **30 Tage** (`GOTRUE_SESSIONS_TIMEBOX=720h`)           | Die AAL1-Obergrenze. Etwa monatliches Neuanmelden auf dem eigenen Rechner; ein kopiertes Token wird spätestens dann wertlos.                |
| Inaktivitätsgrenze          | **7 Tage** (`GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=168h`) | Ein Browser, der eine Woche ungenutzt bleibt, schließt sich selbst. Kurze Werte scheiden wegen des Datenverlusts in offenen Formularen aus. |
| Verlorenes Gerät            | **Knopf "Von allen Geräten abmelden"**                 | Wirkt sofort statt "in bis zu 30 Tagen". Genau das bieten Amazon und Google statt kurzer Timeouts.                                          |
| Wo erzwungen                | **Supabase Auth auf dem Server**                       | OWASP: serverseitig. Selbst gehostet, deshalb greift die Pro-Plan-Beschränkung der gehosteten Version nicht.                                |
| Hinweis auf der Landingpage | **Caddy-Template mit Cookie-Bedingung**                | Landingpage bleibt ohne JavaScript, CSP `script-src 'none'` bleibt unangetastet, nur eine `index.html`.                                     |
| Inhalt des Cookies          | **`1`, sonst nichts**                                  | Kein Token, keine Kennung. Wer es ausliest, erfährt nur, dass hier jemand angemeldet war.                                                   |
| Hinweis in der App          | **Band beim Wiederherstellen einer Sitzung**           | Die Rückmeldung, die beim automatischen Durchwinken fehlte.                                                                                 |

### Verworfene Alternativen

- **Mini-Skript auf der Landingpage** – am wenigsten Aufwand, hätte aber die
  bewusst JavaScript-freie Seite und die strenge CSP gekostet. Schlechter
  Tausch für einen Knopftext.
- **Zweite HTML-Datei für den angemeldeten Zustand** – würde die über
  600 Zeilen lange Landingpage duplizieren.
- **Nur der Hinweis in der App, ohne Cookie** – vermeidet die Cookie-Frage
  ganz, erfüllt aber nur die Hälfte des Wunsches.
- **Kurzes Inaktivitäts-Timeout nach OWASP-Vorbild (15–30 Min)** – wegen des
  Datenverlusts in offenen Formularen verworfen.
- **Timebox 7 Tage, Inaktivität 24 Stunden** – erster Vorschlag, nach dem
  Blick auf die gängige Praxis verworfen. Wöchentliches Neuanmelden bei
  täglicher Nutzung ist für ein Werkzeug dieser Art strenger als üblich, und
  der Sicherheitsgewinn gegenüber 30 Tagen ist gering, solange die
  Inaktivitätsgrenze den vergessenen fremden Browser ohnehin schließt.
- **Gar keine Timebox ("Amazon-Gefühl")** – erwogen. Verworfen, weil uns die
  zweite Schranke fehlt, mit der Verbrauchershops sich das erlauben können.

### Rechtlicher Graubereich

Nach § 25 TDDDG braucht ein Cookie eine Einwilligung, sofern es nicht
"unbedingt erforderlich" ist. Login-Cookies gelten ausdrücklich als
erforderlich; ein Komfort-Hinweis auf einer **anderen** Domain ist es
strenggenommen nicht. Die Einschätzung: gut vertretbar, weil das Cookie keine
Kennung speichert, nicht ausgewertet wird, keine Tracking-Funktion hat und zur
Anmeldefunktion gehört. Das ist eine Abwägung, keine Rechtsberatung.

---

## Zielbild

```
flipbase.de (Caddy, statisch)          app.flipbase.de (Angular)
        │                                      │
        │  liest Cookie beim Ausliefern        │  setzt/löscht Cookie
        └──────────  flipbase_angemeldet=1  ───┘
                     Domain=.flipbase.de
```

### 1. Serverseitiger Ablauf

Im Auth-Container von Supabase (liegt **außerhalb dieses Repos**, siehe
"Offene Punkte"):

```
GOTRUE_SESSIONS_TIMEBOX: "720h"
GOTRUE_SESSIONS_INACTIVITY_TIMEOUT: "168h"
```

Zwei unabhängige Uhren: Die Timebox zählt ab der **Anmeldung**, unabhängig von
der Nutzung. Die Inaktivitätsgrenze zählt ab der **letzten Token-Erneuerung** –
und supabase-js erneuert nur, solange ein Tab offen und im Vordergrund ist
(die Bibliothek startet und stoppt das mit dem Tab-Fokus). "Inaktivität"
bedeutet hier also "die App war nicht offen", nicht "es wurde nichts geklickt".
Ein im Hintergrund vergessener Tab hält die Sitzung nicht künstlich am Leben.

Gekappt wird nicht sekundengenau: Die Prüfung greift bei der nächsten
Erneuerung, die tatsächliche Dauer kann also um bis zu eine Token-Laufzeit
(1 Stunde) überschritten werden.

Go-Zeitformat. Die Variable weglassen bedeutet "nie"; `0` wird abgelehnt.

### 2. Der neue Dienst

`src/app/core/services/landing-hint.service.ts` – einzige Aufgabe: das eine
Cookie setzen und löschen.

```
flipbase_angemeldet=1; Domain=.flipbase.de; Path=/; Secure; SameSite=Lax; Max-Age=604800
```

`Max-Age` sind 7 Tage – bewusst **nicht** die 30-Tage-Timebox. Das Cookie wird
bei jeder Token-Erneuerung neu gesetzt, die Laufzeit rutscht also staendig
nach vorn, waehrend die Timebox ab der Anmeldung zaehlt und nicht rutscht. Mit
30 Tagen wuerde ein aktiver Nutzer ein Cookie tragen, das die Sitzung um fast
30 Tage ueberlebt. 7 Tage bilden stattdessen die ebenfalls gleitende
7-Tage-Inaktivitaetsgrenze fast genau nach. Kein `HttpOnly`, weil die App es
selbst schreibt und löscht. Die Domain kommt aus der Umgebung; ist sie leer,
tut der Dienst nichts.

### 3. Anbindung im AuthService

Drei Stellen in `src/app/core/services/auth.service.ts`:

- `applySession()` → Cookie setzen
- `signOut()` → Cookie löschen
- `watchAuthState()`, wenn Supabase `null` meldet → Cookie löschen. Deckt den
  Ablauf durch die Timebox und das Abmelden in einem anderen Tab mit ab.

### 4. Umgebungsdateien und CI

Neues Feld `landingHintCookieDomain`:

- `src/environments/environment.development.ts`: `''` – lokal passiert nichts.
- `src/environments/environment.ts`: `'.flipbase.de'`
- **`.github/workflows/ci.yml`**: Die CI schreibt `environment.ts` beim Bauen
  per Heredoc komplett neu. Ohne Ergänzung dort fehlt das Feld im
  Produktions-Abbild, ohne dass etwas auffällt.

### 5. Caddy und Landingpage

In `deploy/Caddyfile`, Block `flipbase.de`: `templates` ergänzen (steht in
Caddys Standardreihenfolge vor `file_server`) und `Vary Cookie` in die
Kopfzeilen, damit kein Zwischenspeicher den falschen Zustand ausliefert.

In `landing/index.html` ändert sich nur der Kopf-Link – Kurzform:

    {{if .Cookie "flipbase_angemeldet"}}Zur App{{else}}Anmelden{{end}}

### 6. Hinweis in der App

`AuthService` bekommt ein Signal `sitzungWiederhergestellt`, das
ausschließlich `initAuth()` setzt – also nur beim Wiederherstellen einer
gespeicherten Sitzung, nie nach frischem Anmelden. Die Shell zeigt daraufhin
ein schmales Band im Stil von `shared/components/sync-error-banner`:

> Angemeldet als grischa@… – nicht du? **Abmelden**

Wegklickbar. Beim Neuladen erscheint es wieder; das ist gewollt.

### 7. Abmelden – Reichweite richtigstellen

Beim Ausarbeiten gefunden: `supabase.auth.signOut()` verwendet **standardmäßig
den Bereich `global`**. Der Aufruf in `auth.service.ts:296` übergibt nichts,
also beendet der Knopf "Abmelden" im Kopfbereich schon heute **alle** Sitzungen
auf **allen** Geräten. Wer sich am Handy abmeldet, fliegt am Rechner mit raus –
ohne Hinweis, und niemand erwartet das.

Daraus werden zwei getrennte Dinge:

- **`signOut()`** bekommt `{ scope: 'local' }`. Der gewohnte Knopf beendet dann
  nur die Sitzung in diesem Browser – das erwartete Verhalten.
- **Neu in den Einstellungen: "Von allen Geräten abmelden"** ruft `signOut()`
  mit `{ scope: 'global' }` auf, abgesichert über den vorhandenen
  `shared/components/confirm-dialog`. Das ist die sofortige Antwort auf einen
  verlorenen Laptop – ohne auf die 30-Tage-Grenze warten zu müssen.

---

## Was schiefgehen kann

| Fall                                      | Folge                                            | Umgang                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie überlebt die abgelaufene Sitzung   | Knopf sagt "Zur App", es erscheint die Anmeldung | Laufzeit = 7 Tage, gleitend wie die Inaktivitätsgrenze; löschen bei jedem Sitzungsende. Folge ist harmlos.                                                                                                                                                        |
| `templates` fehlt in Caddy                | Die Template-Zeile steht sichtbar auf der Seite  | Nach dem Ausrollen mit und ohne Cookie per `curl` prüfen.                                                                                                                                                                                                         |
| Feld in der CI vergessen                  | Cookie wird live nie gesetzt, lokal schon        | Änderung an `ci.yml` gehört zwingend zur Umsetzung.                                                                                                                                                                                                               |
| Zwischenspeicher liefert falschen Zustand | Falscher Knopftext                               | `Vary Cookie` und `Cache-Control: no-cache`, beide über einen Matcher gezielt auf `/` und `/index.html` – ein Matcher auf den exakten Pfad `/index.html` allein hätte nie gegriffen, weil Besucher `/` anfragen und die Auflösung erst im `file_server` passiert. |

## Prüfung

- **Tests (vitest):** Cookie entsteht bei Anmeldung, verschwindet beim
  Abmelden, verschwindet bei `onAuthStateChange(null)`, wird bei leerer Domain
  nie gesetzt. Signal `sitzungWiederhergestellt` ist nach frischem Anmelden
  `false`. `signOut()` ruft Supabase mit `scope: 'local'` auf, der neue Knopf
  mit `scope: 'global'`.
- **Von Hand nach dem Ausrollen:** `curl` auf `https://flipbase.de` mit und
  ohne Cookie-Kopfzeile; anmelden und Landingpage neu laden; abmelden und
  erneut laden; App neu laden und auf das Band achten.
- **Sitzungsdauer:** Nach dem Setzen der Variablen den Auth-Container neu
  starten und prüfen, dass eine bestehende Anmeldung weiterhin funktioniert.
- **Abmelde-Reichweite:** In zwei Browsern anmelden, in einem normal abmelden –
  der andere muss angemeldet bleiben. Danach "Von allen Geräten abmelden" –
  jetzt muss der andere beim nächsten Laden bei der Anmeldung landen.

## Bewusst weggelassen

- Merken, ob das Band schon gezeigt wurde. Beim Neuladen erscheint es wieder –
  ehrlicher und ohne zusätzlichen Zustand.
- `GOTRUE_SESSIONS_SINGLE_PER_USER`. Bei einem Nutzer mit mehreren Geräten
  wäre das eher lästig als nützlich.
- Zweiter Faktor. Er würde die Anforderungen von AAL2 auslösen (12 Std /
  30 Min) und ist eine eigene Entscheidung.

## Offene Punkte

- Die Namen der GoTrue-Variablen stammen aus der Supabase-Dokumentation und
  einer offiziellen Diskussion; sie sind **nicht** gegen die laufende Instanz
  geprüft. Vor dem Setzen die Fassung des Auth-Containers abgleichen.
- Die Supabase-Konfiguration liegt nicht in diesem Repo:
  `deploy/docker-compose.app.yml` hängt sich nur in das fremde Netz
  `supabase_default`. Die Änderung passiert auf dem Server. `jwt_expiry = 3600`
  in `supabase/config.toml` gilt nur für die lokale Entwicklung.

## Quellen

- OWASP Session Management Cheat Sheet – https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Session Timeout – https://owasp.org/www-community/Session_Timeout
- NIST SP 800-63B – https://pages.nist.gov/800-63-4/sp800-63b.html
- BSI IT-Grundschutz, SYS.2.1 Allgemeiner Client – https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Grundschutz/IT-GS-Kompendium/
- Supabase, User sessions – https://supabase.com/docs/guides/auth/sessions
- Supabase Discussion #34368 (selbst gehostete Sitzungsdauer) – https://github.com/orgs/supabase/discussions/34368
- Caddy, templates-Direktive – https://caddyserver.com/docs/caddyfile/directives/templates
- DSK, Orientierungshilfe für Anbieter digitaler Dienste – https://www.datenschutzkonferenz-online.de/media/oh/OH_Digitale_Dienste.pdf
