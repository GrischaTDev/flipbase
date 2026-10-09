# IPRoyal-Cloud-IP automatisch nachbuchen

Stand: 09.10.2026. Implementiert und lokal geprüft; produktiv noch nicht aktiviert.

## Verhalten

Beim Einrichten oder Cloudwechsel prüft Flipbase die vorhandene Berechtigung und
gleicht zunächst bereits gekaufte IPs ab. Eine freie, geprüfte deutsche
Dedicated-ISP-IP wird zuerst reserviert. Fehlt sie und ist die Nachbuchung
aktiviert, liest der Worker das aktuelle Produkt, den deutschen Anbieterbestand
und das Preisangebot. Er kauft genau eine IP im Tarif `30 Days`. Es gibt keine
Preisobergrenze und keine automatische Verlängerung. Die Zahlung verwendet das
IPRoyal-Guthaben; Kartendaten werden nicht übermittelt.

Vor dem Kauf speichert die Datenbank eine einmalige Kaufabsicht. Eine globale
Sperre verhindert parallele Käufe. Wiederholte Klicks, verlorene Antworten und
Worker-Neustarts dürfen keinen weiteren Zahlungsaufruf für denselben Versuch
auslösen. Bekannte Bestellungen werden erneut gelesen. Erst der vorhandene
Bestandsabgleich einschließlich Prüfung des deutschen Ausgangs registriert die
IP; erst danach darf die Kontoeinrichtung fortfahren.

Die Oberfläche prüft eine ausstehende Bestellung bis zu achtmal mit derselben
Anfragekennung und zwei Sekunden Abstand. Dauert es länger, erscheint eine
Wartemeldung. Ein erneuter Klick setzt dieselbe Anfrage fort. Eine bestätigte,
registrierte IP einer verlassenen Einrichtung wird nach zwei Minuten bei der
nächsten berechtigten Bestandsprüfung wieder freigegeben. Unbekannte
Zahlungsantworten werden niemals durch Zeitablauf freigegeben.

## Aktivierung nach Veröffentlichung

1. Die Migration `20261009132051_marketplace_cloud_ip_purchase.sql` gemeinsam
   mit Anwendung und Worker veröffentlichen. Einen Worker mit dem neuen Code
   verwenden; der Web-App-Rollout allein aktualisiert den separat betriebenen
   Pilotworker nicht.
2. Die bestehende private Worker-Umgebung muss `IPROYAL_API_TOKEN`, den privaten
   Datenbankzugang und eine persistente beschreibbare Netzwerkdatei mit Modus
   0600 enthalten. Das Anbieter-Konto muss ausschließlich für Flipbase vorgesehen
   sein und ausreichendes Guthaben besitzen.
3. In dieser Umgebung `IPROYAL_AUTO_PURCHASE_ENABLED=1` setzen und den Worker mit
   seiner bestehenden Chromium-Konfiguration neu erstellen. Der Beispielwert
   bleibt `0`; dann verwendet Flipbase ausschließlich vorhandene IPs.
4. Mit einem freigeschalteten Pilotkonto eine Cloud-Einrichtung starten. Bei
   freier IP entsteht keine Bestellung. Ist der Bestand belegt, erfolgt ein
   echter kostenpflichtiger Kauf einer weiteren IP für 30 Tage.

Zum Abschalten den Schalter auf `0` zurücksetzen und den Worker neu erstellen.
Gespeicherte Kaufabsichten und bereits zugeordnete IPs bleiben erhalten.

## Unklare Bestellungen prüfen

`marketplace_cloud_ip_purchases` ist nur für den Server zugänglich. Die Zustände
sind `submitting` (Zahlungsversuch noch ungeklärt), `ordered` (Bestellkennung
gespeichert), `failed` (eindeutige Ablehnung) und `completed` (Reservierung oder
verifizierter Bestandsabgleich bestätigt). `price_cents` dokumentiert das
Preisangebot, nicht eine unabhängig bestätigte endgültige Kontobelastung.

Bei `submitting` zuerst Bestellungen und Belastung im IPRoyal-Konto prüfen.
Keinen Datensatz löschen oder die Sperre blind zurücksetzen. Wurde bezahlt,
muss die eindeutig zu diesem Versuch gehörende Bestellkennung kontrolliert
übernommen werden. Nur wenn sicher keine Bestellung und keine Belastung
entstanden sind, darf der Versuch administrativ als fehlgeschlagen abgeschlossen
werden. Dafür gibt es bewusst keinen automatischen Wiederholungs- oder
Entsperrknopf. Ein eindeutig abgewiesener Versuch wird ebenfalls nicht automatisch
erneut bezahlt; eine neue ausdrückliche Einrichtung kann einen neuen Versuch
auslösen.

## Spätere Abopakete

`marketplace_cloud_ip_allowances` bietet eine optionale IP-Grenze pro Arbeitsplatz.
Ohne Eintrag bleibt die vorhandene Pilotfreigabe maßgeblich; eine Grenze von fünf
oder zehn wird noch nicht erfunden. Mit Eintrag zählen alle noch nicht aufgehobenen
Cloud-Reservierungen und Zuordnungen gegen die Grenze, bevor eine weitere IP
reserviert oder gekauft wird.

Die spätere Abo-Anbindung muss diese Grenze und die Cloud-Berechtigung aus dem
Paket ableiten und den monatlichen Anspruch, Verlängerung, Kündigung sowie
verbleibende bezahlte Laufzeit regeln. Aktuell beginnt jede gekaufte IP ihren
eigenen 30-Tage-Zeitraum beim Anbieter. Ein gemeinsamer Abrechnungsstichtag mit
Flipbase ist noch nicht umgesetzt.

## Ausgeführte Prüfungen

Getrennte lokale Datenbank mit vollständiger Migrationswiederholung, 121
Datenbankprüfungen sowie ein echter Konkurrenztest mit zwei Datenbanksitzungen.
Worker-Tests prüfen unter anderem Preisänderungen, Anbieterbestand,
30-Tage-Tarif, Neustarts, verlorene Antworten und doppelte Anfragen. Die
Oberflächentests prüfen Wartestatus, gleiche Anfragekennung und Paketgrenzen.
Typprüfung, Formatierung, Lint, Angular-Produktionsbau sowie Worker-Containerbau
und Modulimport bestehen.

Ein lesender Test mit dem echten Anbieter-Konto bestätigte am 09.10.2026 den
30-Tage-Tarif für Deutschland und ein Preisangebot von 4 USD. Es wurde keine IP
gekauft. Der erste echte Kauf bleibt eine Prüfung nach Veröffentlichung und
Aktivierung.
