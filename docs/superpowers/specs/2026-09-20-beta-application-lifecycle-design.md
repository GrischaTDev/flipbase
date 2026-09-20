# Beta-Bewerbung, Einladung und Aktivierung

**Stand:** 20.09.2026
**Status:** Vom Nutzer bestätigter Entwurf für die Umsetzung

## Ziel

Die bestehende Beta-Bewerbung wird zu einem durchgängigen, nachvollziehbaren
Ablauf. Eine Bewerbung erscheint sofort im Betreiberbereich und löst eine
Eingangsbestätigung per E-Mail aus. Erst nach ausdrücklicher Annahme durch einen
Betreiber wird eine Registrierungseinladung verschickt. Nach erfolgreicher
Passwortvergabe werden Bewerbung, Nutzer, Workspace und Beta-Zugang fest
verknüpft; erst dann beginnt die bewilligte Laufzeit.

## Abgrenzung

Dieses Arbeitspaket umfasst:

- ein zugängliches Danke-Modal auf der statischen Landingpage;
- eine Eingangsbestätigung per E-Mail ohne Registrierungslink;
- einen Freigabedialog mit Name, E-Mail und standardmäßig 60 Tagen;
- verlässliche, sichtbare Zustände für Bewerbung, Einladung und Registrierung;
- die feste Verknüpfung von Bewerbung, Auth-Nutzer, Workspace und Beta-Zugang;
- eine einfache Betreiberseite „Nutzer“ mit Beta-Zeitraum und Registrierungsstatus;
- das Schließen der freien Registrierung während der geschlossenen Beta.

Nicht Teil dieses Arbeitspakets sind Stripe, PayPal, Tarife, Zahlungen,
Rechnungen, Mahnungen, automatische Ablauf-E-Mails und die Schreibsperre nach
Ablauf. Das Datenmodell hält diese späteren Funktionen ausdrücklich von der
Bewerbung getrennt. Die Erinnerung sieben Tage vor Ablauf ist ein späteres
Arbeitspaket und kann den hier eingeführten Mailversand sowie das Enddatum
verwenden.

## Verwendete Oberfläche

Die Verwaltungsoberfläche erhält keine neue Komponentenfamilie. Sie verwendet
die vorhandenen Bausteine:

- `ModalShellComponent` für den Freigabedialog;
- `NumberInputComponent` für die Laufzeit;
- `ButtonComponent` für alle Aktionen;
- `BadgeComponent` für Zustände;
- `DataTableComponent` für Bewerbungen und Nutzer;
- vorhandene Feld-, Fehler- und Fokuskonventionen.

Die globale Laufzeiteingabe im Seitenkopf und das Notizfeld in jeder Tabellenzeile
entfallen. Die statische Landingpage kann Angular-Komponenten technisch nicht
importieren. Ihr Danke-Modal verwendet deshalb die bereits vorhandenen
Landingpage-Farben, Karten, Buttons und Abstände sowie denselben zugänglichen
Dialogvertrag: Fokus beim Öffnen in den Dialog, Escape und Schließen-Schaltfläche,
Fokus-Rückgabe zum Absenden-Knopf und deaktivierter Hintergrund.

## Sichtbarer Ablauf

### 1. Bewerbung

Das vorhandene Formular bleibt bei Vorname, Nachname, E-Mail und
Datenschutzeinwilligung. Nach erfolgreicher Speicherung:

1. Das Formular wird zurückgesetzt.
2. Ein Danke-Modal erscheint:
   - Titel: „Vielen Dank für Ihre Anmeldung zur Beta“
   - Text: „Wir haben Ihre Bewerbung erhalten und eine Bestätigung an
     <E-Mail-Adresse> gesendet. Wir prüfen Ihre Angaben und melden uns
     schnellstmöglich bei Ihnen.“
   - Aktion: „Schließen“
3. Parallel versendet der Server eine Eingangsbestätigung ohne Aktionslink.

Ist die Bewerbung gespeichert, aber die E-Mail konnte nicht verschickt werden,
bleibt die Bewerbung erhalten. Das Modal erklärt, dass die Anmeldung eingegangen
ist, die Bestätigungsmail aber gerade nicht zugestellt werden konnte. Im
Betreiberbereich wird der Versandfehler sichtbar und kann erneut versucht werden.

### 2. Prüfung im Betreiberbereich

Die Tabelle zeigt einen aus den gespeicherten Zuständen abgeleiteten
Hauptstatus:

- „Offen“
- „Angenommen – Einladung wird versendet“
- „Einladung gesendet“
- „Einladung fehlgeschlagen“
- „Beta aktiv“
- „Beta abgelaufen“
- „Abgelehnt“

Ein Fehler der Eingangsbestätigung erscheint zusätzlich als zurückhaltender
Warnhinweis und ersetzt nicht den Hauptstatus der Bewerbung.

Bei „Annehmen“ öffnet sich ein `ModalShellComponent` mit:

- vollständigem Namen;
- E-Mail-Adresse;
- Zahlenfeld „Beta-Laufzeit“ mit Vorgabe 60 Tage, Minimum 1 und Maximum 3650;
- erklärendem Hinweis, dass die Laufzeit erst mit abgeschlossener Registrierung
  beginnt;
- sekundärer Aktion „Abbrechen“;
- primärer Aktion „Beta-Anmeldung genehmigen“.

Die primäre Aktion zeigt einen Ladezustand und verhindert Doppelklicks. Der
Dialog schließt erst, wenn Entscheidung und Versandzustand gespeichert sind.
Ein Versandfehler bleibt im Dialog sichtbar. Die Tabellenzeile bietet danach
„Einladung erneut senden“.

„Ablehnen“ verwendet den bestehenden Bestätigungsdialog. Eine Ablehnung
verschickt keine E-Mail.

### 3. Einladung und Registrierung

Die vorhandene Einladungsmail und die vorhandene Route
`/auth/set-password` bleiben Grundlage. Vorname, Nachname, E-Mail und
Bewerbungs-ID werden serverseitig in der Einladung mitgeführt. Die E-Mail ist
im Auth-Konto festgelegt; Vor- und Nachname werden aus der Bewerbung übernommen.
Der Nutzer muss nur sein Passwort wählen und die Bedingungen bestätigen.

Nach erfolgreicher Passwortvergabe aktiviert eine idempotente Datenbankfunktion
den Beta-Zugang. Erst dieser Schritt setzt Start- und Enddatum. Bei einer
vorübergehenden Störung bleibt das Konto bestehen; die Aktivierung wird beim
nächsten Anmelden erneut versucht und kann Start- oder Enddatum nicht doppelt
verschieben.

### 4. Nutzerübersicht

Unter `/admin/users` entsteht eine einfache, vorhandene
`DataTableComponent`-Ansicht. Sie zeigt ausschließlich die für den Betrieb
benötigten Angaben:

- Name und E-Mail;
- Workspace;
- Bewerbungs- und Registrierungsstatus;
- Registrierungsdatum;
- Beta-Beginn;
- Beta-Ende;
- verbleibende Tage beziehungsweise „Ausstehend“, „Abgelaufen“ oder „Gesperrt“.

Es werden keine erfundenen Spalten „Bezahlt“ oder „Rechnung“ angezeigt, solange
keine echte Abrechnung existiert. Der spätere Abrechnungsbereich wird am
Workspace ergänzt, nicht an der Bewerbung.

## Datenmodell

### Erweiterung `public.beta_applications`

Die bestehende Tabelle bleibt die Quelle für Bewerbung und Betreiberentscheidung.
Sie erhält:

- `receipt_email_status text not null default 'pending'` mit
  `pending | sent | failed`;
- `receipt_email_sent_at timestamptz`;
- `receipt_email_last_error text`;
- `auth_user_id uuid unique references auth.users(id) on delete set null`;
- `invitation_status text not null default 'not_sent'` mit
  `not_sent | sending | sent | failed`;
- `invitation_sent_at timestamptz`;
- `invitation_last_error text`;
- `registered_at timestamptz`.

Der bestehende Entscheidungsstatus `open | accepted | rejected` bleibt
erhalten. Bewerbungsentscheidung und technischer Einladungsversand sind bewusst
getrennt: Eine angenommene Bewerbung kann einen fehlgeschlagenen Versand haben,
ohne fälschlich wieder „offen“ zu werden.

### Neue Tabelle `public.workspace_licenses`

Eine Zeile je Workspace beschreibt ausschließlich den aktuellen Zugang:

- `workspace_id uuid primary key references public.workspaces(id)`;
- `beta_application_id uuid unique references public.beta_applications(id)`;
- `access_source text` mit `beta | subscription | manual`;
- `status text` mit `pending | active | expired | suspended`;
- `granted_days integer`;
- `starts_at timestamptz`;
- `ends_at timestamptz`;
- `created_at timestamptz`;
- `updated_at timestamptz`.

Die Zeile wird bei der Auth-Einladung als `pending` angelegt. Die Aktivierung
setzt atomar `starts_at = now()`, `ends_at = starts_at + granted_days` und
`status = 'active'`. Bereits gesetzte Zeitpunkte werden nie überschrieben.
Für Beta-Zugänge ist ein Enddatum Pflicht. Ein späterer unbefristeter
Abonnementzugang darf dagegen `ends_at = null` verwenden.

Eine spätere Tabelle für Stripe-Abonnements referenziert den Workspace und kann
die Lizenz auf `access_source = 'subscription'` umstellen. Bewerbung und
Zahlungsdaten werden dadurch nicht vermischt.

## Serverabläufe

### Eingangsbestätigung

`beta-application` bleibt der einzige öffentliche Schreibweg. Nach Validierung,
Drosselung und Einfügen der Bewerbung versendet die Funktion über einen kleinen
gemeinsamen SMTP-Baustein eine markenkonforme Eingangsbestätigung. Verwendet
werden die bereits für Supabase Auth betriebenen Mailbox.org-Zugangsdaten; die
Edge Functions erhalten dieselben Werte über Servergeheimnisse und die bestehende
Compose-Zusatzdatei. Geheimnisse werden nicht eingecheckt.

Der gemeinsame Baustein liegt unter
`supabase/functions/_shared/beta-email-delivery.ts`, verwendet
`npm:nodemailer@10.0.10` und liefert strukturierte Fehler zurück. Die Funktion
speichert `sent` oder `failed`, gibt aber bei bereits gespeicherter Bewerbung
keinen internen Fehler oder Bestandsunterschied preis.

### Annahme und Einladung

Der Browser darf Bewerbungen nicht mehr direkt aktualisieren. Eine geschützte
Edge Function übernimmt die Annahme:

1. JWT und Betreiberrolle prüfen.
2. Bewerbung mit einer Datenbankfunktion sperren und validieren.
3. Entscheidung, Laufzeit und `invitation_status = 'sending'` speichern.
4. Über die vorhandene Supabase-Admin-Einladung den Auth-Nutzer erzeugen und die
   bestehende Einladungsmail versenden.
5. `auth_user_id`, `invitation_sent_at` und `sent` speichern.
6. Bei einem Fehler `failed` und eine für Betreiber verständliche
   Fehlerbeschreibung speichern.

Die Metadaten der Einladung enthalten die Bewerbungs-ID. Der bestehende
`handle_new_user()`-Trigger erstellt weiterhin Profil, Workspace,
Mitgliedschaft und Standardquellen. Für Beta-Einladungen verknüpft er zusätzlich
die Bewerbung mit dem neuen Nutzer und legt die ausstehende
`workspace_licenses`-Zeile an. Diese Schritte laufen in derselben
Datenbanktransaktion wie die Auth-Nutzeranlage.

Ein erneuter Versand erzeugt keinen zweiten Nutzer und keinen zweiten Workspace.
Für einen bereits angelegten, aber noch nicht registrierten Auth-Nutzer wird ein
neuer sicherer Einrichtungslink erzeugt und über denselben Mailbaustein
verschickt. Aktive Nutzer erhalten keine neue Registrierungseinladung.

### Aktivierung

`public.activate_beta_access()` ist `security definer`, setzt
`search_path = ''` und verwendet ausschließlich `auth.uid()`. Sie:

1. findet die angenommene Bewerbung über `auth_user_id`;
2. sperrt Bewerbung und Lizenzzeile;
3. setzt `registered_at` einmalig;
4. setzt Start, Ende und Status einmalig;
5. gibt die aktivierte Lizenz zurück.

Die Funktion ist für andere Nutzer wirkungslos und kann beliebig oft mit
demselben Ergebnis aufgerufen werden.

## Sicherheit

- Anonyme Nutzer erhalten weiterhin keinerlei Tabellenrechte.
- Angemeldete Nutzer dürfen Bewerbungen nicht mehr direkt aktualisieren.
- Betreiber lesen Bewerbungen und die begrenzte Nutzerübersicht über explizite
  Policies beziehungsweise eine eng begrenzte Funktion.
- Nur die Serverfunktion mit Dienstschlüssel erzeugt Einladungen und versendet
  E-Mails.
- In der Datenbank werden keine Einladungslinks, Tokens oder SMTP-Geheimnisse
  gespeichert.
- RLS ist auf `workspace_licenses` aktiv; nur Betreiber lesen alle Lizenzen,
  Workspace-Mitglieder höchstens die Lizenz ihres eigenen Workspace.
- Die freie Registrierung wird serverseitig über
  `[auth].enable_signup = false` beziehungsweise
  `GOTRUE_DISABLE_SIGNUP=true` deaktiviert. Der E-Mail-Anbieter bleibt über
  `[auth.email].enable_signup = true` aktiv, damit Einladungen und Anmeldung
  bestehender Nutzer weiter funktionieren. Die sichtbare Route
  `/auth/register` leitet während der geschlossenen Beta zur Landingpage
  beziehungsweise Anmeldung weiter.

## Fehler- und Wiederholungsverhalten

- Doppelte Formularübermittlung erzeugt weiterhin keine zweite Bewerbung.
- Ein Fehler der Eingangsbestätigung löscht keine Bewerbung.
- Ein Fehler der Einladung macht eine angenommene Bewerbung nicht wieder offen.
- Jede Versandaktion besitzt einen sichtbaren Lade-, Erfolgs- und Fehlerzustand.
- Wiederholungen sind idempotent: kein zweiter Auth-Nutzer, kein zweiter
  Workspace, keine zweite Lizenz und kein verschobener Beta-Start.
- Abgelaufene Einladungslinks können durch „Einladung erneut senden“ ersetzt
  werden.

## Alternativen

### Nur die bestehende Oberfläche flicken

Ein Modal und eine Vorgabe von 60 Tagen wären schnell, ließen aber die fehlende
Nutzerverknüpfung, unsichtbare Mailfehler und wirkungslose Laufzeit bestehen.
Diese Variante ist ausgeschlossen.

### Abrechnung sofort mitbauen

Stripe, Tarife, Rechnungen und Beta-Ablauf in einem Paket würden fachliche und
rechtliche Entscheidungen erzwingen, die für eine funktionierende Beta nicht
nötig sind. Diese Variante ist ebenfalls ausgeschlossen.

### Gewählte Lösung

Der kleine, vollständige Beta-Lebenszyklus schließt die aktuellen Lücken und
führt nur die Daten ein, die für Bewerbung, Einladung, Registrierung und
Zeitmessung tatsächlich benötigt werden. Abrechnung bleibt ein eigener späterer
Bereich.

## Prüfung

Die Umsetzung muss mindestens nachweisen:

- Landingpage: Erfolg öffnet den zugänglichen Dialog; Versandfehler zeigt die
  abweichende Meldung; Doppelklick sendet nur einmal; beide Sprachen bleiben
  funktionsfähig; CSP-Prüfsumme ist aktuell.
- Edge Function: gültige Bewerbung, Dublette, SMTP-Erfolg, SMTP-Fehler,
  unzulässige Herkunft und Drosselung.
- Datenbank: neue Spalten und Tabelle, RLS, Betreibergrenzen, transaktionale
  Nutzerverknüpfung, idempotente Aktivierung sowie Start-/Endberechnung.
- Betreiberoberfläche: Freigabedialog mit Vorgabe 60, veränderbare Laufzeit,
  Lade- und Fehlerzustände, erneuter Versand und korrekte Badges.
- Registrierung: Einladung übernimmt die Personendaten; erfolgreiche
  Passwortvergabe startet die Beta einmalig.
- Nutzerübersicht: nur erlaubte Stammdaten und korrekte Beta-Zeitpunkte.
- Produktionsbau und gezielte Browserprüfung für Landingpage,
  Freigabedialog, Registrierung und Nutzerübersicht.

## Veröffentlichung

Schemaänderung und erzeugte Migration gehören in denselben PR. Für die
Produktion müssen zusätzlich die Edge Functions, die Compose-Variablen,
die aktualisierte Landingpage-CSP-Prüfsumme und die serverseitige Sperre der
freien Registrierung gemeinsam ausgerollt werden. Eine echte Testbewerbung an
ein externes Postfach sowie Annahme, Linkeinlösung und Beta-Aktivierung sind
Pflichtbestandteil der Produktionsabnahme.
