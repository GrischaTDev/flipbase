# Flipbase Listing-Assistent (Browser-Erweiterung)

Diese Erweiterung verbindet **Flipbase OS** mit Verkaufsportalen wie **Kleinanzeigen**, um Inserate per 1-Klick automatisch, sicher und ohne Bot-Sperren zu übertragen.

---

## 🚀 Installation in 30 Sekunden (Google Chrome, Brave, Edge, Opera)

1. Öffne in deinem Browser die Erweiterungsverwaltung:
   - In Chrome: `chrome://extensions/`
   - In Brave: `brave://extensions/`
   - In Edge: `edge://extensions/`
2. Aktiviere oben rechts den Schalter **„Entwicklermodus“** (Developer mode).
3. Klicke links oben auf **„Entpackte Erweiterung laden“** (Load unpacked).
4. Wähle diesen Ordner aus:
   `k:\GitHub\Repos\flipbase\tools\flipbase-extension`

Fertig! Die Erweiterung ist sofort aktiv.

> **Hinweis bei Updates:** Wenn Dateien der Erweiterung geändert werden, klicke in `chrome://extensions` einfach auf das kreisförmige **Aktualisieren-Symbol (⟳)** bei der Kachel des Flipbase Listing-Assistenten.

---

## ⚡ So funktioniert es

1. Öffne Flipbase und gehe ins **Listing Studio** (`/listings`).
2. Wähle einen Artikel aus und passe ggf. Titel, Preis (Festpreis oder VB) und Optionen an.
3. Klicke auf den gelben Button **„⚡ 1-Klick auf Kleinanzeigen inserieren“**.
4. Ein neuer Tab öffnet direkt das Kleinanzeigen-Formular (`p-anzeige-aufgeben-schritt2.html`):
   - Titel, Beschreibung, Preis mit Preistyp und die PLZ werden automatisch eingetragen.
   - Die Produktbilder aus Flipbase werden geladen und hochgeladen.
   - Oben rechts zeigt der **Flipbase Assistent** jeden Schritt ehrlich an: grün = erledigt,
     orange = bitte selbst erledigen, rot = fehlgeschlagen.
5. Du wählst die **Kategorie**. Danach blendet Kleinanzeigen die Versandauswahl ein; der
   Assistent setzt sie dann automatisch.
6. Du prüfst die Angaben und klickst auf **„Anzeige aufgeben“**.

> Wird das Formular nicht gefunden (z. B. weil du nicht angemeldet bist), bleiben die Daten
> 15 Minuten gespeichert. Nach dem Anmelden die Formularseite einfach neu laden.

Die Feldkennungen des Formulars stehen in `autofill-core.js` und wurden am 14.09.2026 live
geprüft. Ändert Kleinanzeigen das Formular, zeigt der Assistent rote Schritte – dann dort anpassen.

---

## 🔒 Warum diese Lösung 100% sicher ist

- **Kein DataDome-Bann:** Du surfst in deinem echten Browser mit deiner ganz normalen privaten Internetverbindung. Für Kleinanzeigen bist du ein normaler menschlicher Besucher.
- **Keine Passwörter auf Servern:** Es werden keine Passwörter oder Anmeldedaten irgendwo gespeichert oder übertragen.
- **Keine Proxy-Kosten:** Funktioniert direkt über deinen Browser.
