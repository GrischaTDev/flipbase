# Weiße App-Icons, Installation und Gerätebenachrichtigungen

Verbindliche Spezifikation: der vom Nutzer am 14.10.2026 ausdrücklich zur Umsetzung freigegebene Plan „Weiße App-Icons, direkte Installation und Push auf Handy, Tablet und Windows“.

## Global Constraints

- Bestehendes Flipbase-Symbol unverändert, weißer Iconhintergrund, sichtbare Symbolausdehnung 64 %, mittig; App-Theme unverändert.
- Installation nur mobil anbieten. Push auf Windows Chrome/Edge ohne installierte App ermöglichen. Browserfreigabe ausschließlich durch direkten Aktivierungsklick.
- Vier Kategorien: `message`, `order`, `favorite`, `connection`. Erstaktivierung zeigt verfügbare Kategorien vorausgewählt und bestätigt sie durch Aktivieren. Bestehende Einstellungen bleiben erhalten; neue Kategorie dort aus.
- `favorite` verweist auf `vinted_favorites` mit `connectionId` (UUID). Klick öffnet `/marketplaces/vinted/listings?connectionId=…` nach erneuter Rechteprüfung. Keine Kundendaten im Sperrbildschirmpayload.
- `push-settings` unterstützt optional `apiVersion: 2`; fehlend bedeutet Version 1 mit bisherigen drei Kategorien. Alte Einstellungsaufrufe erhalten keine unbekannten Kategorien; alte Schreibaufrufe erhalten gespeicherte neuere Kategorien.
- Eine vorhandene Favoriten-Glocken-Sammelmeldung erzeugt genau einen Versandauftrag. Keine Altmeldungsübernahme, keine Erstbaseline, gleiche oder sinkende Zähler; bestehende Import- und Rechtebedingungen erhalten.
- Bestehende Sitzungs-, Geräte-, Workspace-, Logout-, Sperr- und sichere Navigationsprüfungen erhalten. Keine Änderungen an Einkaufsabläufen oder Zwischenspeicher.
- Backend ist ausdrücklich autorisiert. Schemadateien pflegen, Migration erzeugen, Typen aus lokaler Datenbank neu erzeugen. Keine bestehenden Migrationen ändern, keine Geheimnisse veröffentlichen, keine neuen Abhängigkeiten.
- Nutzer hat grünen PR, Merge und Veröffentlichung ausdrücklich beauftragt. Versand zunächst auf sein Konto beschränken; Freigabe für andere erst nach realer Geräteabnahme.
- Browserprüfungen belegen keine reale OS-Zustellung. Android, iPad-Home-App und Windows Chrome/Edge müssen separat real abgenommen werden. Eine Testannahme ist kein Empfangsnachweis.

### Task 1: Favoritenquelle und kompatibler Versandvertrag

Verantwortung: `supabase/schemas/330_marketplace_favorite_notifications.sql`, `470_web_push_devices.sql`, `471_web_push_delivery.sql`, `472_web_push_events.sql`, `supabase/functions/push-settings/`, relevante `_shared`-Verträge, `services/push-worker/`, `public/sw.js` (nur Push-Vertrag, Iconpfade folgen Task 2), deren Tests, neue erzeugte Migration und generierte Supabase-Typen.

Ergänze `favorite` durch alle Verträge und die Versandautorisierung. Verwende die vorhandene serverseitige Glocken-Sammelmeldung beim Abschluss des bestätigten Favoritenimports; ein stabiler eindeutiger Quellschlüssel verhindert Duplikate und es gibt keine Rückübernahme alter Meldungen. Ergänze `vinted_favorites {connectionId}` ausschließlich für berechtigte Vinted-Verbindungen. Sperrbildschirmtext bleibt allgemein. Bewahre alle vorhandenen Sicherheitsprüfungen.

Versioniere `push-settings` optional mit `apiVersion: 2`; Version 1 liest nur alte Kategorien und bewahrt bei Einstellungsänderungen bereits gespeichertes `favorite` atomar. Version 2 ersetzt die ausdrücklich bestätigte Auswahl. Bestehende Registrierungen dürfen `favorite` nicht automatisch aktivieren.

Vor Produktionsänderungen gezielte fehlschlagende Vertrags-/Versand-/Datenbanktests ausführen; danach grün einschließlich alter Clients, Kategorie-Rechte, Baseline, sinkenden Zählern, Wiederholung, Widerruf und Logout. Datenbank isoliert betreiben, keine fremde Instanz stoppen. `supabase db diff` erzeugt die Migration; anschließend prüfen und Typen regenerieren. Lint/Format betroffener Dateien. Keine Commits anderer Aufgaben aufnehmen. Bericht nennt exakte Befehle, Ergebnisse, Migrationserzeugung und offene Grenzen.

### Task 2: Weiße Icons, direkter Installationseinstieg und Geräte-Einstellungen

Verantwortung: Installations- und Geräte-Frontend (`pwa.service`, `web-push`-Modelle/API/Service, Push-Navigation), Root-Installationsdialog, Sidebar/App-Einstellungen, Benachrichtigungseinstellungen und Glockenlink, Iconassets/Manifest/Apple-Verweis und SW-Iconpfade, relevante Frontend-/Browser-/Assettests.

Nutze vorhandenes Symbol unverändert auf Weiß, mittig mit 64 % sichtbarer Ausdehnung; neue Dateinamen für normale Icons, maskable und Apple-Touch. Monochromes transparentes Android-Badge separat. Themefarben erhalten. Assets deterministisch aus vorhandener Marke erstellen, keine neue Logoform erfinden.

Mobil ruft „App installieren“ direkt einen verfügbaren Systemdialog auf. Ohne Angebot erscheint ein kurzer Shared-Modal-Dialog auf derselben Seite. Trifft das Angebot später ein, erscheint „Jetzt installieren“ ohne automatischen Prompt. Abbruch, Fehler, Mehrfachklick und bestätigte Installation behandeln. Desktop zeigt kein Installationsangebot.

Gerätebereich an Anfang von Einstellungen → Benachrichtigungen, Glockenlink „Benachrichtigungen einstellen“. Beschriftung „Benachrichtigungen auf diesem Gerät aktivieren“. Push im Windows-Browser ohne App-Installation; iPad aus Home-App. Kategorien durch Rechte gefiltert. Bei erster Aktivierung Auswahl sichtbar vorausgewählt, Aktivierung bestätigt sie; bestehende inklusive leerer Präferenzen erhalten, neue Kategorie aus. Freigabe nur durch Klick. Jeder Browser hat seine eigene Registrierung. Zustände, Testannahme und Ausschalten klar nennen. Frontend ruft `apiVersion: 2` auf. Favoritenklick erneut autorisieren und gefilterte Inserateliste öffnen.

Bestehende Shared-Dialoge und Controls, Signals/OnPush und separate HTML-Dateien nutzen; zuerst `docs/design/admin-ui-guidelines.md` lesen. Angemessene fehlschlagende Verhaltenstests vor Änderungen, danach gezielte Node/DOM/Angular- und reale gerenderte Browserprüfungen für Dialog/Installation/Windowsfähigkeit/Kategorien/Navigationssicherheit. Neue Vorlagen im Angular-Ressourcenresolver registrieren. Icongeometrie und sichere Maskenränder automatisiert prüfen. Format/Lint/Typen und Produktionsbau. Keine tatsächliche OS-Zustellung behaupten.

### Task 3: Geschützte Laufzeit und unveränderte Betriebsfreigabe

Verantwortung: `deploy/deploy.sh`, Push-Compose-Dateien, Beispielkonfiguration, passende Deploymenttests und knappe Betriebsanleitung.

Deploy liest geschützte Konfiguration konsistent für Edge Functions und Worker. Vorhandene ausdrückliche `WEB_PUSH_ENABLED`/Pilotfreigabe bleibt bei späteren Releases erhalten; ohne Konfiguration bleibt aus. Keine pauschale Ausschaltung auf jedem Release. Kill-Switch, Schutzmodus und Schlüsselkennung erhalten. Keine privaten Schlüssel oder Service-Role-Werte protokollieren.

Einmalige serverseitige Schlüsselgenerierung und Pilotaktivierung werden nach grünem PR durch den Controller ausgeführt. Implementierung liefert dafür überprüfbare Schritte; keine anderen Nutzer pauschal freigeben. Tests vor Änderung für erhaltene Freigabe, Standard-aus, gemeinsame Konfiguration, unzulässigen Dateimodus und Kill-Switch. Bestehende Deployment-Verträge weiter prüfen, Shellsyntax und Format.

### Task 4: Integration, Gegenprüfung und Veröffentlichung

Der Controller integriert die geprüften Aufgaben, führt angemessene Gesamtprüfungen und frische unabhängige Gesamtdiffprüfung aus. Änderungen werden über einen vollständig grünen PR mit Merge-Commit veröffentlicht, die öffentliche Commitkennung geprüft und nur das verifizierte Nutzerkonto als Pilot geschützt freigegeben.

Reale Abnahme bleibt dokumentiert: Android/iPad bei offener, geschlossener und gesperrter App; Windows Chrome und Edge ohne installierte App bei offenem/minimiertem/geschlossenem Tab, Browser vollständig beendet separat; OS-Banner, Benachrichtigungszentrale und Klickziel. Betriebssystemfreigabe und „Nicht stören“ werden nicht überschrieben. Kein Empfang wird ohne Nachweis behauptet; andere Nutzer bleiben bis erfolgreicher Abnahme gesperrt.
