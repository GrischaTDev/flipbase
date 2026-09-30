# Konto und Unternehmensdaten sauber trennen

Stand: 30. September 2026.

Diese Spezifikation beschreibt den Umbau der Flipbase-Einstellungen in zwei klar
getrennte Bereiche:

1. **Konto** für die natürliche Person, die Flipbase benutzt.
2. **Unternehmen** für die rechtlichen und geschäftlichen Daten des aktiven
   Workspace.

Der Umbau umfasst außerdem die zentrale Nutzung der Unternehmensdaten für
Rechnungen, Gutschriften, Eigenbelege, Shop-Zahlungen und Versand. Historische
Dokumente behalten dabei immer den Datenstand zum Zeitpunkt ihrer Erstellung.

## Nutzerentscheidungen

- Die aktuelle Konto-Seite reicht nicht aus und wird zu einem echten Nutzerprofil
  mit Profil-, Sicherheits- und Sitzungsbereich ausgebaut.
- Direkt unter „Konto“ entsteht der neue Einstellungsbereich **„Unternehmen“**.
- Unternehmensdaten sind **workspacebezogen**, nicht benutzerbezogen.
- Rechnungen, Belege und andere Geschäftsdokumente sollen ihre Absenderdaten aus
  einer zentralen Unternehmensquelle beziehen.
- Unternehmensname und rechtlicher Name/Inhaber werden getrennt gepflegt.
- Basisdaten, Geschäftsanschrift, Steuerdaten, Unternehmenslogo und
  Bankverbindung gehören in „Unternehmen“.
- Steuer-, Bank- und Versanddaten sollen nicht an mehreren Stellen unabhängig
  voneinander gepflegt werden.
- Bestehende historische Rechnungen und Belege dürfen sich durch spätere Änderungen
  der Unternehmensdaten nicht verändern.
- Das UI folgt den aktuellen Flipbase-Designregeln und vorhandenen
  Shared-Komponenten; keine neuen lokalen Button-, Feld-, Card- oder Farbvarianten.
- Die Umsetzung wird in mehrere PRs zerlegt, damit Konto, Stammdaten,
  Dokumentintegration und die spätere Bereinigung bestehender Dubletten jeweils
  separat prüfbar bleiben.

## Vorgefundener Stand

### Konto

Die aktuelle Route `/settings/account` kann nur `profiles.full_name` ändern,
zeigt die Anmelde-E-Mail schreibgeschützt und bietet „Von allen Geräten abmelden“.
Das Profilmodell besitzt bereits `avatar_url`, die aktuelle Seite nutzt es aber
nicht.

### Workspace

`/settings/workspace` vermischt heute zwei Arten von Angaben:

- interne Workspace-Daten und Deal-Vorgaben,
- den steuerlichen Modus `workspaces.tax_mode`.

Der steuerliche Modus wird bereits von Verkäufen und Rechnungen verwendet und
bleibt deshalb technisch zunächst auf `workspaces`. Die sichtbare Pflege wandert
jedoch in „Unternehmen“.

### Rechnungen

`InvoiceService.getSellerParty()` erzeugt aktuell feste Demo-Absenderdaten
(unter anderem Demo-Firma, Berliner Demo-Anschrift, Demo-Steuernummer und
Demo-Bankverbindung). Neu erzeugte Rechnungen dürfen diese Werte künftig niemals
verwenden.

Positiv ist bereits: Die Tabelle `invoices` speichert `seller` als JSON-Snapshot.
Damit existiert die richtige Grundidee für unveränderliche historische
Unternehmensdaten bereits.

### Shop und Zahlungen

`StoreService` enthält ebenfalls Demo-Geschäftsdaten:

- Bankdaten innerhalb der Payment-Konfiguration,
- Impressums-/Unternehmensdaten innerhalb von `imprint`,
- Demo-Werte in den Default-Store-Einstellungen.

Diese Daten dürfen nach dem Umbau nicht mehr zweite, unabhängige Quellen für
Unternehmensdaten sein.

### Versand

`carrier_configs` besitzt eine vollständige Absenderadresse je Workspace.
Eine Versandadresse kann legitim von der Geschäftsanschrift abweichen. Deshalb
wird sie nicht entfernt, sondern künftig als expliziter Override behandelt.

## Fachliche Grenzen

### Konto

„Konto“ beschreibt ausschließlich den angemeldeten Benutzer.

Dazu gehören:

- angezeigter Name,
- Anmelde-E-Mail,
- Profilrepräsentation/Initialen,
- Passwort,
- Kontoschutz,
- Sitzungen und Abmeldung.

Nicht dazu gehören Firmenanschrift, Steuernummer, IBAN oder Workspace-Vorgaben.

### Unternehmen

„Unternehmen“ beschreibt die Geschäftseinheit des **aktiven Workspace**.

Dazu gehören:

- Unternehmens-/Geschäftsname,
- rechtlicher Name,
- Rechtsform,
- geschäftliche Kontaktangaben,
- Geschäftsanschrift,
- optionale abweichende Postanschrift,
- Steuerdaten,
- Bankverbindung,
- Unternehmenslogo.

### Workspace

„Workspace“ bleibt die organisatorische Flipbase-Einheit.

Dort bleiben:

- interner Workspace-Name,
- Workspace-Auswahl, Erstellen, Archivieren und Wiederherstellen,
- Währung,
- Mindest-ROI,
- Mindest-Reingewinn,
- weitere rein betriebliche Vorgaben.

Der steuerliche Modus bleibt technisch auf `workspaces.tax_mode`, wird aber nicht
mehr auf der Workspace-Seite gepflegt.

## Zielnavigation

Die Einstellungsnavigation lautet in dieser Reihenfolge:

1. Konto — Persönliche Daten & Sicherheit
2. Unternehmen — Geschäfts- und Rechnungsdaten
3. Workspace — Mandanten und Vorgaben
4. Nummernkreise — Formate und Zähler
5. Team & Rollen — Zugriffe verwalten
6. Account-Verwaltung — Marktplatzkonten verwalten
7. Benachrichtigungen — Webhooks und Browser-Push
8. Shop & Zahlungen — Zahlungsarten konfigurieren
9. Versand — Versanddienste anbinden
10. App & Geräte — PWA und Geräte
11. Daten & Protokolle — Prüfprotokoll und Exporte

Desktop und Mobile verwenden dieselbe Navigationsquelle.

# Konto

## Profilkarte

Die bisherige einzelne „Mein Konto“-Card wird durch klar getrennte Abschnitte
ersetzt. Der Profilbereich zeigt:

- Initialen-Avatar als V1-Profilrepräsentation,
- angezeigten Namen,
- Anmelde-E-Mail,
- bearbeitbares Feld „Angezeigter Name“,
- primäre Aktion „Änderungen speichern“.

Die E-Mail bleibt zunächst schreibgeschützt. Eine E-Mail-Änderung ist nicht Teil
dieses Umbaus, weil sie einen separaten Bestätigungsablauf benötigt.

Ein Bild-Avatar-Upload ist ebenfalls nicht Teil der ersten Umsetzung.
`profiles.avatar_url` wird nicht entfernt und kann später genutzt werden.

## Sicherheit

Eigene Card „Sicherheit“:

- Passwort ändern,
- Statushinweis zur Zwei-Faktor-Authentifizierung.

Das Passwort wird nicht direkt in der Profilkarte geändert. „Passwort ändern“
öffnet einen Dialog mit:

- aktuellem Passwort,
- neuem Passwort,
- Wiederholung des neuen Passworts.

Vor `updateUser({ password })` wird die Identität mit der aktuellen
E-Mail-Adresse und dem aktuellen Passwort erneut bestätigt. Das neue Passwort
muss mindestens 10 Zeichen lang sein und mit der Wiederholung übereinstimmen.
Fehlgeschlagene Bestätigung oder Validierung ändert nichts.

2FA wird in dieser Initiative noch nicht implementiert. Die Oberfläche darf
höchstens neutral darauf hinweisen, dass sie noch nicht eingerichtet bzw. noch
nicht verfügbar ist; kein funktionsloser Primärbutton.

## Sitzungen

Eigene Card „Sitzungen“:

- kennzeichnet neutral „Dieser Browser“ als aktuelle Sitzung, ohne Betriebssystem
  oder Browser aus einem User-Agent zu erraten,
- erklärt den Zweck der globalen Abmeldung,
- bietet weiterhin die bestehende, bestätigungspflichtige Aktion
  „Von allen Geräten abmelden“.

Eine Liste tatsächlicher anderer Geräte wird nicht erfunden. Eine echte
serverseitige Geräte-/Sessionverwaltung ist außerhalb dieses Scopes.

# Unternehmen

Neue Route:

`/settings/company`

Neue Navigation:

- Label: „Unternehmen“
- Beschreibung: „Geschäfts- und Rechnungsdaten“

Die Seite arbeitet immer auf dem aktuell aktiven Workspace. Beim Workspace-Wechsel
werden ungespeicherte Eingaben nicht still verworfen. Die Seite nutzt denselben
Unsaved-Changes-Vertrag wie andere bearbeitbare Einstellungsseiten.

## Datenmodell

Neue Tabelle:

`public.workspace_company_profiles`

Ein Workspace besitzt höchstens genau ein Unternehmensprofil. `workspace_id`
ist Primärschlüssel und Fremdschlüssel auf `workspaces(id)`.

V1-Felder:

| Feld                      | Bedeutung                                           |
| ------------------------- | --------------------------------------------------- |
| `workspace_id`            | fachlicher Besitzer                                 |
| `company_name`            | Geschäfts-/Markenname, z. B. „Wiehen Store“         |
| `legal_name`              | rechtlicher Name, bei Einzelunternehmen der Inhaber |
| `legal_form`              | kontrollierte Rechtsform                            |
| `email`                   | geschäftliche Kontakt-E-Mail                        |
| `phone`                   | geschäftliche Telefonnummer                         |
| `website`                 | optionale Website                                   |
| `street`                  | Straße der Geschäftsanschrift                       |
| `house_number`            | Hausnummer                                          |
| `postal_code`             | Postleitzahl                                        |
| `city`                    | Ort                                                 |
| `country_code`            | ISO-3166-1-Alpha-2, V1 standardmäßig DE             |
| `mailing_address_enabled` | abweichende Postanschrift aktiv                     |
| `mailing_street`          | optionale Postanschrift                             |
| `mailing_house_number`    | optionale Postanschrift                             |
| `mailing_postal_code`     | optionale Postanschrift                             |
| `mailing_city`            | optionale Postanschrift                             |
| `mailing_country_code`    | optionale Postanschrift                             |
| `tax_number`              | Steuernummer                                        |
| `vat_id`                  | USt-IdNr.                                           |
| `tax_office`              | optionales Finanzamt                                |
| `federal_state`           | optionales Bundesland                               |
| `bank_account_holder`     | Kontoinhaber                                        |
| `bank_name`               | Bankname                                            |
| `iban`                    | IBAN                                                |
| `bic`                     | BIC                                                 |
| `logo_path`               | Pfad des aktuell verwendeten Unternehmenslogos      |
| `created_at`              | Anlage                                              |
| `updated_at`              | letzte Änderung                                     |

Bewusst nicht in V1:

- Fax,
- Handelsregisterdaten,
- SEPA-Gläubiger-ID,
- DATEV-Kontenrahmen,
- E-Rechnungs-Routing-IDs,
- steuerliche Detailparameter ohne aktuelle Flipbase-Nutzung.

## Rechtsform

V1 bietet eine kontrollierte Auswahl:

- Einzelunternehmen,
- GbR,
- UG (haftungsbeschränkt),
- GmbH,
- Sonstige.

Im Datenmodell wird ein stabiler Code gespeichert, nicht das deutsche UI-Label.
Bei „Sonstige“ wird kein freier juristischer Text erzwungen; eine spätere
Erweiterung kann zusätzliche Rechtsformen ergänzen.

## Erzeugung der Profilzeile

Die Migration legt für jeden bestehenden Workspace eine **leere**
`workspace_company_profiles`-Zeile an. Es werden keine rechtlichen Angaben aus
dem internen Workspace-Namen abgeleitet.

Neue Workspaces erhalten beim Erstellen ebenfalls eine leere Profilzeile.

Der Grund ist bewusst konservativ: Ein Workspace-Name wie „Vintage Test“ ist
keine belastbare Firmenbezeichnung und darf nicht automatisch auf Rechnungen
erscheinen.

## UI-Struktur

Die Unternehmensseite besteht aus vier Cards und einer kompakten Statusanzeige.

### Unternehmensprofil

Felder:

- Unternehmensname,
- rechtlicher Name,
- Rechtsform,
- E-Mail,
- Telefon,
- Website.

Im selben Abschnitt steht die Logo-Verwaltung. Auf schmalen Viewports steht sie
unter den Textfeldern.

### Geschäftsanschrift

Felder:

- Straße,
- Hausnummer,
- PLZ,
- Ort,
- Land.

Darunter ein Shared-Schalter „Abweichende Postanschrift verwenden“. Erst bei
Aktivierung erscheinen die Postanschrift-Felder.

### Steuerdaten

Felder:

- Besteuerung,
- Steuernummer,
- USt-IdNr.,
- Bundesland,
- Finanzamt.

„Besteuerung“ bearbeitet weiterhin `workspaces.tax_mode` mit den vorhandenen
Werten:

- `diff_25a`,
- `kleinunternehmer_19`,
- `regular_19`.

Die Unternehmensseite speichert Unternehmensprofil und Steuer-Modus als eine
Nutzeraktion. Dafür gibt es eine transaktionale RPC
`update_workspace_company_settings(p_workspace_id, p_profile, p_tax_mode)`.
Sie prüft die Owner/Admin-Rolle, normalisiert und validiert die Eingaben,
aktualisiert `workspace_company_profiles` und `workspaces.tax_mode` und schreibt
das Audit-Ereignis in derselben Datenbanktransaktion. Bei einem Fehler wird keine
der Teiländerungen committed.

### Bankverbindung

Felder:

- Kontoinhaber,
- Bankname,
- IBAN,
- BIC.

IBAN wird in Großbuchstaben ohne Leerzeichen gespeichert; BIC ebenfalls in
Großbuchstaben ohne Leerzeichen. In der Anzeige darf die IBAN zur Lesbarkeit in
Vierergruppen formatiert werden. Die UI zeigt keine ungeprüft formatierten
Demo-Werte.

## Visuelle Regeln

Die neue Konto- und Unternehmensoberfläche verwendet:

- `CardComponent`,
- `ButtonComponent`,
- `TextFieldComponent`,
- `CustomSelectComponent`,
- vorhandene Checkbox-/Schalter-Komponenten,
- `ModalShellComponent`,
- zentrale Toasts und Statusfarben.

Keine dekorative Versalschrift, kein `tracking-wider`, keine Indigo-/Violett-
Parallelpalette. Primäre Aktionen nutzen das vorhandene Flipbase-Gelb
`#fcc601`.

Formulare erhalten eine lesbare Einstellungsbreite und ein 4-px-basiertes
Abstandssystem. Es entsteht keine Card-in-Card-Struktur.

# Unternehmenslogo

## Storage

Neuer privater Storage-Bucket:

`company-assets`

Kanonischer Pfad:

`<workspace-id>/logos/<uuid>.<ext>`

Unterstützt werden in V1:

- PNG,
- JPEG,
- WebP.

SVG wird in V1 nicht angenommen, um aktive bzw. unerwartete SVG-Inhalte nicht
ungeprüft in Dokumentansichten zu übernehmen.

Vor dem Upload gelten feste V1-Grenzen:

- maximal 5 MiB pro Datei,
- maximal 4096 × 4096 Pixel,
- MIME-Typ muss zu PNG, JPEG oder WebP passen.

Ungültige Dateien werden vor einem Storage-Write abgelehnt.

## Versionierung

Neue Logos erhalten immer einen neuen Pfad. Der alte Blob wird nicht beim
Ersetzen überschrieben.

`workspace_company_profiles.logo_path` zeigt nur auf das aktuelle Logo.

Historische Dokumente speichern den Logo-Pfad, der bei ihrer Erstellung gültig
war. Beim Anzeigen wird für genau diesen gespeicherten privaten Pfad eine
kurzlebige URL erzeugt. Fehlt der historische Blob, wird die Rechnung ohne Logo
gerendert; sie fällt niemals auf das aktuell eingestellte Logo zurück. Ein späterer
Logo-Wechsel verändert alte Dokumente deshalb nicht.

Nicht mehr referenzierte Logos dürfen erst durch einen separaten, referenzsicheren
Cleanup entfernt werden; das ist nicht Teil dieses Umbaus.

# Rechte und RLS

## Lesen

Alle Mitglieder des Workspace dürfen Unternehmensdaten lesen. Das ist nötig, damit
berechtigte Mitarbeiter Rechnungen und andere Dokumente mit korrektem Absender
erzeugen können.

## Schreiben

Nur Rollen:

- `owner`,
- `admin`

dürfen Unternehmensdaten oder das aktuelle Unternehmenslogo verändern.

Die Policy prüft die Rolle über `workspace_members`. Falls bereits ein
rollenbasierter Helper existiert, wird er wiederverwendet; andernfalls entsteht
ein eng begrenzter Helper für genau diese Prüfung.

Storage-Policies verwenden dieselben Regeln.

Normale `member`-, `fulfillment`-, `accountant`- und `readonly`-Mitglieder
dürfen die Daten nicht ändern. Die Unternehmensseite bleibt für sie lesbar,
rendert die Felder schreibgeschützt und zeigt keine Speichern- oder Logo-Ändern-
Aktion.

# Änderungsprotokoll

Änderungen an Unternehmensdaten erzeugen einen Eintrag in
`business_events`:

- `entity_type = 'company_profile'`,
- `entity_id = workspace_id`,
- `event_type = 'company_profile_updated'`.

Das Ereignis protokolliert die **geänderten Feldnamen**, nicht vollständige
sensible Vorher-/Nachherwerte.

Insbesondere werden vollständige IBAN, Steuernummer oder USt-ID nicht als
Audit-Payload dupliziert.

Logoänderungen erscheinen als Änderung des Felds `logo_path`, ohne privaten
Storage-Pfad unnötig in UI-Historien auszugeben.

# CompanyProfileService

Neue zentrale Anwendungsschicht:

`CompanyProfileService`

Verantwortung:

- Profil des aktiven Workspace laden,
- Lade- und Fehlerzustand halten,
- Unternehmensdaten normalisieren,
- Owner/Admin-Schreibvorgang ausführen,
- Logo hochladen/wechseln,
- Company-Readiness für Dokumente berechnen,
- Unternehmensdaten in einen unveränderlichen Dokument-Snapshot projizieren.

Speichern erfolgt ausschließlich über die transaktionale Company-Settings-RPC;
der Service führt keine voneinander getrennten Profile- und Workspace-Updates aus.

Der Service lädt keine Rechnungen, Shopdaten oder Carrier-Konfigurationen und
bleibt dadurch unabhängig testbar.

Andere Features lesen Unternehmensdaten ausschließlich über diesen Service bzw.
über eine kleine reine Snapshot-Funktion. Sie fragen nicht selbst direkt die
Tabelle ab.

# Dokument-Snapshot

## Grundregel

Unternehmensdaten sind Stammdaten. Ein erzeugtes Geschäftsdokument ist dagegen
historisch.

Ablauf:

```text
workspace_company_profiles + workspaces.tax_mode
                    ↓
           Snapshot erzeugen
                    ↓
     invoice / credit note / receipt
                    ↓
      Snapshot bleibt unverändert
```

Eine alte Rechnung darf beim Öffnen niemals aktuelle Unternehmensdaten nachladen.

## InvoiceParty

Das bestehende `InvoiceParty` bleibt die Dokumentgrenze.

Mapping:

- `name` ← `legal_name`,
- `company` ← `company_name` wenn vorhanden,
- Anschrift ← Geschäftsanschrift,
- `email`, `phone`,
- `taxId` ← `tax_number`,
- `vatId` ← `vat_id`,
- `iban`, `bic`, `bankName`,
- optionaler `logoPath` für den historischen Logo-Snapshot.

Bestehende gespeicherte Rechnungen ohne `logoPath` bleiben weiterhin lesbar.

## Dokumentbereitschaft

Neu erzeugte Rechnungen verwenden keinen Demo-Fallback mehr.

Für V1 gilt als technische Mindestanforderung:

- rechtlicher Name,
- Straße,
- Hausnummer,
- PLZ,
- Ort,
- Land,
- gültiger Steuer-Modus.

Zusätzlich muss mindestens Steuernummer oder USt-IdNr. vorhanden sein, bevor
Flipbase eine Rechnung als „Unternehmensdaten vollständig“ behandelt. Diese
Produktregel ist kein Ersatz für individuelle Steuerberatung; zusätzliche
gesetzliche Pflichtangaben werden nicht aus Vermutungen erzwungen.

Fehlen Pflichtdaten, bricht die Rechnungserstellung **vor** dem Persistieren ab und
liefert einen strukturierten Fehler mit Verweis auf `/settings/company`.

Keine teilweise erzeugte Rechnung und kein zufälliger Demo-Absender.

# Rechnungen, Gutschriften und Eigenbelege

## Rechnungen

`InvoiceService.getSellerParty()` verliert sämtliche Hardcoded-Demo-Daten und
bezieht den Snapshot aus `CompanyProfileService`.

Die vorhandene Persistenz des `seller`-JSON bleibt bestehen.

## Gutschriften

Gutschriften, die zu einer vorhandenen Rechnung gehören, verwenden den bereits
gespeicherten Verkäufer-Snapshot der ursprünglichen Dokumentkette und nicht
stillschweigend neue Unternehmensdaten.

## Eigenbelege

Neue Eigenbelege verwenden beim Erstellen denselben Unternehmens-Snapshot. Bereits
gespeicherte Eigenbelege werden nicht nachträglich umgeschrieben.

Falls das heutige Eigenbeleg-Datenmodell noch keinen vollständigen Absender-
Snapshot speichert, wird dieser in der Dokumentintegrations-PR ergänzt.

# Shop & Zahlungen

## Bankdaten

Die Bankverbindung wird fachlich aus `store_settings.payments` entfernt.

„Shop & Zahlungen“ entscheidet nur noch:

- Banküberweisung aktiviert/deaktiviert,
- Stripe aktiviert/deaktiviert,
- PayPal aktiviert/deaktiviert,
- weitere shopbezogene Zahlungsoptionen.

Wenn Banküberweisung aktiviert ist, zeigt die UI das aktuell verwendete
Unternehmenskonto maskiert an und verlinkt zu „Unternehmen“.

## Bestehende Daten

Vorhandene Bankdaten in `store_settings.payments` werden nicht blind in das neue
Profil kopiert, weil alte Demo-Defaults existieren können.

Übergang:

- Sind Unternehmens-Bankdaten leer und existieren alte Bankdaten, darf die
  Unternehmensseite sie als **Vorschlag zur Übernahme** anzeigen.
- Persistiert werden sie erst nach ausdrücklichem Speichern.
- Nach erfolgreicher Zentralisierung liest der Shop Bankdaten nur noch aus dem
  Unternehmensprofil.
- Legacy-Felder werden erst entfernt, wenn die Übergangslogik und Datenprüfung
  abgeschlossen sind.

## Impressum

Die bisherigen Demo-Impressumsdaten im Store dürfen nicht als zweite
Unternehmensquelle fortbestehen.

Unternehmensname, rechtlicher Name, Anschrift, Kontakt- und Steuerkennung kommen
aus dem Unternehmensprofil. Shop-spezifische Texte wie Tagline oder Hinweistext
bleiben in `store_settings`.

# Versand

`carrier_configs` behält seine Absenderfelder als möglichen Override.

Neue UI:

- Schalter „Unternehmensanschrift verwenden“,
- standardmäßig für neue Workspaces aktiv,
- bei Aktivierung zeigt Versand die zentralen Unternehmensdaten schreibgeschützt,
- bei Deaktivierung erscheinen die bestehenden Absenderfelder zur abweichenden
  Versandadresse.

Bestehende Workspaces mit einer vollständigen individuellen Absenderadresse
werden nicht automatisch umgestellt. Ihre vorhandene Adresse bleibt aktiv, bis
der Nutzer bewusst „Unternehmensanschrift verwenden“ einschaltet.

Dadurch geht keine tatsächlich verwendete Versandadresse verloren.

# Workspace

Nach Einführung der Unternehmensseite wird die Workspace-Seite fokussiert:

Bleibt:

- Workspace-Name,
- Workspace-Verwaltung,
- Währung,
- Mindest-ROI,
- Mindest-Reingewinn.

Verschwindet aus der Workspace-UI:

- sichtbare Pflege des Steuer-Modus.

`workspaces.tax_mode` bleibt zunächst unverändert im Datenmodell, da vorhandene
Steuer- und Verkaufslogik darauf zugreift.

# Laden, Speichern und Workspace-Wechsel

## Ladezustand

Konto und Unternehmen zeigen keine scheinbar leeren, speicherbaren Formulare,
solange die zugehörigen Daten noch laden.

Bei Ladefehlern:

- verständliche Fehlermeldung,
- „Erneut versuchen“,
- kein Überschreiben mit leeren Defaultwerten.

## Speichern

Speichern arbeitet requestgebunden an den Workspace, der beim Start des
Speichervorgangs aktiv war.

Wechselt der Workspace während eines Requests:

- die Antwort darf den neuen Workspace nicht überschreiben,
- UI meldet den veralteten Speichervorgang neutral,
- Daten werden anschließend für den aktiven Workspace neu geladen.

## Ungespeicherte Änderungen

Die Unternehmensseite nutzt den vorhandenen Unsaved-Entry-Guard bzw. denselben
zentralen Vertrag. Navigation oder Workspace-Wechsel mit geänderten, nicht
gespeicherten Feldern erfordert eine Entscheidung.

# Migration und Kompatibilität

## Datenbank

Neue Schema-Datei plus reguläre Migration:

- Tabelle `workspace_company_profiles`,
- RLS,
- Storage-Bucket/Policies,
- bestehende Workspaces erhalten leere Profilzeilen,
- Workspace-Erstellung erzeugt künftig ebenfalls die Profilzeile.

Die Migration ändert keine historischen `invoices.seller`-Snapshots.

## Supabase-Typen

Nach der Migration werden die generierten Supabase-Typen aktualisiert. Keine
handgeschriebenen Abweichungen.

## Demo-/Fallback-Modus

Auch der lokale/demoartige Fallback darf keine Fake-Rechnungsadresse mehr
erfinden. Wo kein persistentes Unternehmensprofil existiert, muss eine
Rechnungserstellung mit „Unternehmensdaten fehlen“ abbrechen.

UI-Demos können klar gekennzeichnete Beispielprofile verwenden, aber nie als
Produktionsfallback.

# Umsetzung in vier PRs

## PR 1 – Konto modernisieren

Scope:

- Konto-UI neu strukturieren,
- Profilkarte mit Initialen,
- Anzeigename und E-Mail,
- Passwort-Änderungsdialog mit Re-Authentifizierung,
- Sitzungsbereich,
- bestehende globale Abmeldung integrieren,
- alte lokale Konto-Card-Gestaltung entfernen,
- keine Unternehmens- oder Datenbankänderung.

Abnahme:

- Profil speichern funktioniert unverändert,
- falsches aktuelles Passwort blockiert Passwortwechsel,
- neues Passwort wird nur bei gültiger Wiederholung gespeichert,
- globales Abmelden bleibt bestätigungspflichtig,
- Light/Dark und mobile Darstellung,
- Shared-UI-Prüfung und AXE.

## PR 2 – Unternehmensdaten als Fundament

Scope:

- Schema und Migration,
- RLS und Storage,
- `CompanyProfileService`,
- Route und Navigation,
- Unternehmensprofil-, Anschrift-, Steuer-, Bank- und Logo-UI,
- `tax_mode` auf dieser Seite pflegen,
- Audit-Event,
- Dokumentbereitschaft berechnen,
- noch keine Rechnungserzeugung umstellen.

Abnahme:

- Workspace-Isolation,
- Owner/Admin schreiben,
- andere Rollen nur lesen,
- Logo workspacegebunden,
- alter Workspace-Name wird nicht als rechtlicher Name übernommen,
- Workspace-Wechsel und unsaved changes sicher,
- DB-, Angular-, Accessibility- und Build-Prüfungen.

## PR 3 – Geschäftsdokumente anbinden

Scope:

- Hardcoded Seller-Demo-Daten entfernen,
- Invoice-Snapshot aus CompanyProfile,
- Logo-Pfad im Snapshot,
- fehlende Unternehmensdaten blockieren neue Rechnung,
- Gutschriften auf konsistente Snapshot-Nutzung prüfen,
- Eigenbelege anbinden,
- alte Rechnungen unverändert und weiterhin lesbar.

Abnahme:

- neue Rechnung enthält aktuelle Unternehmensdaten,
- Änderung am Profil ändert alte Rechnung nicht,
- neue Rechnung nach Profiländerung nutzt neue Werte,
- Workspace-Wechsel verwendet richtige Firma,
- keine Demo-Absenderdaten im Produktivpfad,
- Snapshot-Persistenz per DB-Test,
- Regressionstests für Rechnungen/Gutschriften/Eigenbelege.

## PR 4 – Doppelte Quellen aufräumen

Scope:

- Bankdaten aus der Shop-Pflege entfernen und CompanyProfile verwenden,
- Store-Impressumsdaten auf CompanyProfile umstellen,
- Demo-Bank-/Impressumswerte entfernen,
- Versand mit „Unternehmensanschrift verwenden“ plus bestehendem Override,
- sichtbare Steuer-Modus-Pflege aus Workspace entfernen,
- Legacy-Daten nur nach sicherem Übergang zurückbauen.

Abnahme:

- Banküberweisung verwendet Unternehmensbankkonto,
- bestehende Versand-Overrides bleiben erhalten,
- neue Workspaces verwenden standardmäßig Unternehmensanschrift,
- Store zeigt keine Demo-Unternehmensdaten,
- Workspace enthält nur organisatorische Vorgaben,
- keine zweite editierbare Quelle für Firmenadresse, Steuerkennung oder Bankdaten.

# Testmatrix

## Datenbank

- Profilzeile pro Workspace,
- keine Sicht auf fremden Workspace,
- Mitglied darf lesen,
- Owner/Admin dürfen schreiben,
- andere Rollen dürfen nicht schreiben,
- Storage-Lesen/Schreiben entspricht denselben Rollen,
- Audit-Event bei Änderung,
- Audit enthält keine vollständigen sensiblen Werte,
- Workspace-Erstellung erzeugt Unternehmensprofil,
- historische Invoice-Snapshots bleiben unverändert.

## Anwendung

- Konto: Name, Passwortfehler, Passworterfolg, Abmelden,
- Unternehmen: Laden, Fehler, Speichern, Validierung,
- Rollenabhängige Schreibsperre,
- Workspace-Wechsel,
- Logo-Upload und -Wechsel,
- Company-Readiness,
- Snapshot-Mapping,
- Shop-Bankreferenz,
- Versand-Vererbung/Override.

## Browser

Mindestens:

- Konto Desktop + Mobil,
- Unternehmen Desktop + Mobil,
- Light + Dark,
- Passwortdialog,
- Unternehmenslogo,
- ungespeicherte Änderungen,
- Workspace-Wechsel,
- fehlende Unternehmensdaten vor Rechnungserstellung,
- AXE ohne relevante Befunde,
- keine horizontalen Überläufe.

# Erfolgskriterien

Nach Abschluss der vier PRs gilt:

- Eine Person bearbeitet persönliche Daten ausschließlich unter „Konto“.
- Rechtliche Geschäftsdaten werden ausschließlich unter „Unternehmen“ gepflegt.
- Ein Workspace kann eigene Unternehmensdaten besitzen.
- Neue Rechnungen verwenden keine Demo-Daten.
- Alte Dokumente bleiben historisch unverändert.
- Shop und Versand pflegen keine konkurrierenden Kopien derselben
  Unternehmensdaten mehr.
- Die Workspace-Seite enthält nur organisatorische und betriebliche Vorgaben.
- Unternehmensdaten sind für alle Workspace-Mitglieder lesbar, aber nur für
  Owner/Admin änderbar.
- Fehlende Unternehmensdaten werden sichtbar blockiert statt durch erfundene
  Fallbackwerte ersetzt.
