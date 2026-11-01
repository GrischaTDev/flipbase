# eBay-Inserate und Postfach fortsetzen

## Ziel und Entscheidungen

Der Nutzer beauftragt die Fortsetzung mit der neuen Listing API und einem Postfach
im vorhandenen Flipbase-/Vinted-Stil. Die konkrete Umsetzung ist an Juna übergeben.
Bestellungen, Verkaufsentwürfe, Bestandszuordnung und bestehende Seitenziele bleiben
erhalten. Erfolg bedeutet einen geprüften Ablauf von Eingabe über Anbieterprüfung
bis bestätigter Veröffentlichung sowie Lesen und bewusstes Antworten im Postfach.
Ein lokaler Test ersetzt dabei keine produktive Anbieterabnahme.

## Anbindung

- Listing API 1.0.0 (26.10.2026): feste GraphQL-Operationen über
  `https://graphqlapi.ebay.com/graphql`, Sandbox auf eigenem Host. Öffentlichen
  SDL-Vertrag am 01.11.2026 gelesen. Details/Bearbeitung und Erstellung über diese
  Schnittstelle; keine beliebigen Operationen aus dem Frontend.
- Message API 1.0.0: Mitglieder- und eBay-Nachrichten, paginierte Gespräche und
  Nachrichten, Antworten ausschließlich in bestehenden Mitgliedergesprächen.
  eBay-Systemnachrichten bleiben lesbar und ohne Antwortformular.
- Die Kontobindung und verschlüsselten Tokens bleiben zentral. Neue Scopes werden
  erst durch bewusste erneute Nutzerfreigabe wirksam. Rechte und Verbindungsversion
  werden vor schreibenden Aufrufen erneut geprüft.
- Der bewährte Hintergrundcache bleibt zunächst beim vorhandenen Lesevertrag:
  Eine bloße Entsprechung von GraphQL-Feldnamen belegt noch keine vollständige
  Abdeckung von Varianten, Beobachtern und Scanfortsetzung. Keine stille
  Vollmigration oder automatische Umwandlung bestehender Angebote.

## Oberfläche und Schutz vor Doppelwirkungen

Vorhandene Shared Components, Signals, externe Templates und bestehende
Seitenbreiten. Das Postfach zeigt links Gespräche und rechts den Verlauf; mobil
einen Bereich mit Rücknavigation. Filter unterscheiden Mitglieder/eBay und
ungelesene Gespräche. Konto-/Workspacewechsel verwerfen fremde Daten und Entwürfe.
Senden braucht einen sichtbaren Klick. Bei unklarer Antwort kein automatischer
zweiter Sendeklick. Neue Inserate erhalten eine feste Idempotenzkennung; Prüfung
und Veröffentlichung werden getrennt. Gebühren und Anbieterfehler bleiben sichtbar.

Eine normale Sitzungserneuerung mit denselben Nutzer-/Workspacekennungen erhält
ungesicherte Eingaben. Der Prüfabdruck zur Veröffentlichung bindet die
eBay-Kontoverbindung und ihre Autorisierungsfassung ein; eine erneute eBay-Freigabe
verlangt vor dem Schreiben einen neuen Prüfstand und eine bewusste Bestätigung.

## Prüfung

Gezielte Backendfälle für Verträge, Rechte, unbekannte Ergebnisse und Pagination;
Frontendfälle für Kontowechsel, Filter, Sendesperre und Pflichtfelder. Betroffene
Browserabläufe mit ruhender Vorschau, Hell/Dunkel, Maus/Touch und AXE. Anschließend
der tatsächliche Preflight-Plan; keine echten Nachrichten oder Inserate zu Testzwecken.

Quellen: [Listing-Vertrag](https://developer.ebay.com/develop/api/spec/listing.graphqls),
[Message-Vertrag](https://developer.ebay.com/api-docs/master/commerce/message/openapi/3/commerce_message_v1_oas3.json).
