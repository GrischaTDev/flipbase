# Systemweite Aktionsmeldungen – Design

## Ziel

Flipbase bestätigt jede ausdrücklich vom Nutzer ausgelöste Änderung einheitlich unten rechts. Erfolgreiche Aktionen verschwinden automatisch. Fehlgeschlagene Aktionen bleiben sichtbar, bis der Nutzer sie schließt, und erklären verständlich, was nicht funktioniert hat.

## Geltungsbereich

Eine Aktionsmeldung erscheint nach folgenden vom Nutzer ausgelösten Vorgängen:

- anlegen und erstellen,
- speichern und bearbeiten,
- löschen und entfernen,
- archivieren und wiederherstellen,
- veröffentlichen und zurückziehen,
- versenden und stornieren,
- importieren und buchen,
- Status oder Zuordnungen ändern,
- Dateien und Medien hochladen oder löschen,
- Verbindungen und Integrationen testen.

Das gilt insbesondere für Einstellungen, Profil, Workspaces, Mitglieder und Einladungen, Quellen und Lieferanten, Einkäufe, Inventar, Medien, Verkäufe und Retouren, Listings, Fulfillment, Buchhaltung, Rechnungen, Shop-Bestellungen, Webhooks sowie Push-Benachrichtigungen.

Keine Aktionsmeldung erscheint bei Navigation, automatischem Laden, Suche, Vorschau, Öffnen oder Schließen eines Dialogs, lokaler Auswahl, Kopieren in die Zwischenablage oder einer noch nicht abgeschlossenen Formularvalidierung.

## Verhalten und Stapelung

Die Meldungen stehen unten rechts und bilden einen vertikalen Stapel. Neue Meldungen erscheinen unten und schieben ältere Meldungen nach oben. Verschwindet eine Meldung, rutschen die verbleibenden Meldungen wieder nach unten.

| Art         | Farbe | Dauer      | Schließen                |
| ----------- | ----- | ---------- | ------------------------ |
| Erfolg      | Grün  | 4 Sekunden | automatisch oder manuell |
| Information | Blau  | 4 Sekunden | automatisch oder manuell |
| Warnung     | Gelb  | 6 Sekunden | automatisch oder manuell |
| Fehler      | Rot   | unbegrenzt | ausschließlich manuell   |

Normale Meldungen sind auf vier gleichzeitig sichtbare Einträge begrenzt. Angepinnte Fehlermeldungen werden nicht automatisch verworfen. Damit der Bildschirm bei vielen Fehlern weiter bedienbar bleibt, erhält der Stapel eine maximale Höhe und eine eigene vertikale Scrollmöglichkeit.

## Inhalt und Sprache

Jede Meldung besteht aus:

- einem kurzen Titel, der das Ergebnis nennt,
- einer optionalen Beschreibung mit Ursache oder nächstem sinnvollen Schritt,
- Typ und Kennung,
- der Angabe, ob sie dauerhaft sichtbar bleibt.

Erfolgstitel verwenden die tatsächliche Aktion, beispielsweise:

- „Einstellungen wurden gespeichert.“
- „Artikel wurde gelöscht.“
- „Lieferant wurde archiviert.“
- „Einladung wurde versendet.“

Fehlermeldungen erklären zuerst den fehlgeschlagenen Vorgang und danach die Ursache, beispielsweise:

- Titel: „Lieferant konnte nicht gelöscht werden.“
- Beschreibung: „Dem Lieferanten sind noch Einkäufe zugeordnet. Entferne zuerst diese Zuordnungen.“

Rohe Datenbankmeldungen, Tabellenbezeichnungen, Stacktraces und technische Fremdschlüsseltexte werden nicht angezeigt. Bekannte Supabase-Codes und wiederkehrende Ursachen werden zentral in verständliche deutsche Texte übersetzt. Ist keine verlässliche Ursache bekannt, lautet die Beschreibung: „Bitte versuche es erneut. Wenn der Fehler bestehen bleibt, prüfe die Verbindung zum Server.“

## Verhältnis zu Formularfehlern

Feldbezogene Hinweise bleiben direkt am betroffenen Feld, zum Beispiel „Gib eine gültige E-Mail-Adresse ein“. Solange ein Formular aufgrund solcher Eingaben gar nicht abgesendet wird, erscheint kein Toast.

Schlägt ein tatsächlich gestarteter Speichervorgang fehl, bleibt das Formular geöffnet und behält seine Eingaben. Zusätzlich erscheint ein angepinnter roter Toast mit der übergeordneten Ursache. Dadurch weiß der Nutzer sowohl, welches Feld zu korrigieren ist, als auch, ob der Servervorgang fehlgeschlagen ist.

## Architektur

### Toast-Service

Der bestehende `ToastService` wird um ein ausdrucksstärkeres Modell erweitert:

```ts
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  readonly id: number;
  readonly type: ToastType;
  readonly title: string;
  readonly description?: string;
  readonly persistent: boolean;
}
```

Die öffentlichen Methoden bleiben einfach:

```ts
success(title: string, description?: string): number;
error(title: string, description?: string): number;
warning(title: string, description?: string): number;
info(title: string, description?: string): number;
dismiss(id: number): void;
```

`error` erzeugt standardmäßig eine dauerhafte Meldung. Die anderen Typen verwenden die festgelegten Anzeigedauern. Timer werden beim manuellen Schließen oder Verwerfen einer normalen Meldung immer beendet.

### Darstellung

Der `ToastContainerComponent` bleibt genau einmal im Shell-Layout eingebunden. Er rendert Titel und optionale Beschreibung, passende Symbole, eine Schließen-Schaltfläche und semantisch korrekte Rollen:

- Fehler verwenden `role="alert"`.
- Andere Meldungen verwenden `role="status"`.
- Der Container verwendet eine passende Live-Region.
- Fokus, Kontrast und Schließen-Schaltfläche erfüllen WCAG AA.
- Bewegung wird bei `prefers-reduced-motion` reduziert.

### Datenbankfehler

`SyncStatusService` bleibt die zentrale Quelle für fehlgeschlagene Datenbankvorgänge und deren verständliche Übersetzung. Der bisherige große `SyncErrorBannerComponent` wird aus dem Shell-Layout entfernt, damit derselbe Fehler nicht doppelt angezeigt wird.

Eine kleine Brücke auf Layout-Ebene überführt neue `SyncFehler` genau einmal in dauerhafte Fehler-Toasts. Das vermeidet eine Abhängigkeit der Core-Dienste von visuellen Shared-Komponenten. Das Schließen des Toasts verwirft zugleich den zugehörigen Eintrag im `SyncStatusService`.

Feature-Komponenten zeigen bei zurückgegebenen Fehlern keinen zweiten identischen Toast, wenn der Fehler bereits über `SyncStatusService` gemeldet wurde. Für fachliche Fehlschläge ohne Sync-Eintrag erzeugt die Feature-Komponente selbst einen Fehler-Toast.

## Ablauf einer Aktion

1. Der Nutzer startet eine Änderung.
2. Die Komponente zeigt einen vorhandenen Ladezustand und verhindert unbeabsichtigte Mehrfachausführung.
3. Der Feature-Service führt die Änderung aus und gibt ein eindeutiges Ergebnis zurück.
4. Bei Erfolg aktualisiert die Komponente die Ansicht, schließt gegebenenfalls den Dialog und zeigt einen konkreten Erfolgstoast.
5. Bei Fehler bleiben Dialog, Eingaben und aktuelle Navigation erhalten.
6. Ein technischer Speicherfehler wird über `SyncStatusService` als dauerhafter Toast dargestellt. Ein rein fachlicher Fehler wird von der Feature-Komponente gemeldet.

Navigation oder Dialogschließung erfolgen erst nach bestätigtem Erfolg. Ein Toast darf niemals einen fehlgeschlagenen Vorgang als erfolgreich darstellen.

## Bestehende Rückmeldungen

Allgemeine lokale Erfolgsbanner und kurzlebige Erfolgssignale werden entfernt, sobald dieselbe Aktion einen Toast erhält. Feldbezogene Fehler, ausführliche Ergebnisansichten und dauerhafte fachliche Statusanzeigen bleiben bestehen. Browser-Dialoge oder `alert()` für abgeschlossene Aktionen werden durch Toasts ersetzt.

## Umsetzung nach Features

Die Umstellung erfolgt in überprüfbaren Gruppen:

1. Toast-Modell, Stapelverhalten und Sync-Brücke.
2. Einstellungen, Profil, Workspaces, Mitglieder und Integrationen.
3. Quellen, Lieferanten, Einkäufe und Inventar einschließlich Medien.
4. Verkäufe, Retouren, Listings und Fulfillment.
5. Buchhaltung, Rechnungen, Shop und verbleibende Schreibaktionen.
6. Abschlussprüfung auf Aktionen ohne Rückmeldung und auf doppelte Meldungen.

Jede Gruppe erhält Verhaltenstests für mindestens einen Erfolgs- und einen Fehlerpfad. Der abschließende Audit vergleicht alle vom Nutzer ausgelösten Schreibmethoden mit der Liste der eingebundenen Toasts.

## Qualitätsanforderungen

- Keine neue externe Bibliothek.
- Keine Datenbankmigration.
- Keine Toasts für automatische Hintergrund-Ladevorgänge.
- Keine doppelte Fehleranzeige über Banner und Toast.
- Keine verlorenen Formulareingaben oder Navigation bei einem Fehler.
- Alle bestehenden und neuen Tests, TypeScript-Prüfung, Lint und Produktionsbuild müssen erfolgreich sein.
