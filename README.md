# 🚀 Flipbase Reselling OS

> **Das All-in-One Entscheidungs-, Finanz- und Fulfillment-Betriebssystem für professionelle Reseller, Flohmarkthändler und E-Commerce-Unternehmer.**

![Flipbase Banner](https://images.unsplash.com/photo-1556742049-0a67e55722c0?auto=format&fit=crop&w=1200&q=80)

---

## 🌟 Übersicht & Kernfunktionalitäten

Flipbase ist eine moderne, hochperformante **Angular 22 Standalone Web-Applikation (Zoneless Signals Architecture)** mit **Tailwind CSS 4**, die den gesamten Lifecycle eines Reselling-Geschäfts digitalisiert:

### 1. 🔍 Recherche & Konkurrenz-Radar ([`/research`](http://localhost:4200/research))

- **Echtzeit-Verkaufspreise**: Multi-Plattform-Analyse (eBay Sold, Kleinanzeigen, Vinted) mit Produktfotos und Ausreißer-Bereinigung.
- **📡 Konkurrenz-Radar**: Live-Überwachung von Preisen mit Unterbietungs-Alarmen (`undercut`) und Preisanstiegs-Chancen (`price_surge`).
- **1-Klick Inventar-Preisanpassung**: Optimiert Preise direkt ins Inventar und Listing Studio.
- **📷 Barcode-Scanner & KI-Foto-Erkennung**: EAN/UPC-Scanner mit Kamera und KI-Zustandserkennung.

### 2. 📦 Sourcing & Einkaufs-Management ([`/purchases`](http://localhost:4200/purchases))

- **Mehrere Einkaufstypen**: Einzelartikel, Mystery Packs, Konvolute/Lots und Retourenpaletten.
- **Intelligente Kostenallokation**: Wertgewichtet, gleichmäßig oder manuell mit Nebenkosten (Versand, Aufbereitung).
- **📱 Flohmarkt-Schnellerfassung (PWA Offline-Modus)**: 1-Sekunden-Schnelleingabe für Märkte, inklusive **Live-Bargeld-Cockpit (Cash Wallet)** und automatischem Cloud-Sync bei Netzverbindung.

### 3. 🏷️ Multi-Plattform Listing Studio ([`/listings`](http://localhost:4200/listings))

- **1-Klick-Crosslisting**: Generiert optimierte Inserate für eBay, Kleinanzeigen und Vinted.
- **🤖 KI-SEO-Score & Optimierer**: Prüft Zeichenlimits (80/70/60 Zeichen), Keyword-Dichte und schlägt suchmaschinenoptimierte Titel vor.
- **Listing-Status-Tracking**: Synchronisiert aktive Inserate mit dem Inventar.

### 4. 💰 Verkäufe, Retouren & Gutschriften ([`/sales`](http://localhost:4200/sales))

- **Live-Profit-Engine**: Berechnet ROI, Haltedauer, Plattformgebühren und Netto-Reingewinn in Echtzeit.
- **🤖 Retouren- & Reklamations-Abwicklung**: Flexible Voll- oder Teilerstattungen mit automatischer Wiedereinlagerung (`ready`, `needs_review`, `defective`).
- **📄 § 25a UStG DIN-A4 PDF-Gutschriften**: Offizielle Storno- und Gutschriftsbelege mit 1-Klick Druckansicht.

### 5. 📊 Buchhaltung, § 25a Differenzbesteuerung & DATEV ([`/accounting`](http://localhost:4200/accounting))

- **Finanzamtskonforme Differenzbesteuerung (§ 25a UStG)**: Automatische Trennung von Differenz- und 19% Regelumsätzen.
- **📑 DATEV EXTF Buchungsstapel-Export**: Standardkonforme ASCII/CSV-Dateien für SKR03 und SKR04.
- **📜 § 25a Differenzbesteuerungs-Journal**: Einzelnachweis aller Handelsspannen und Bemessungsgrundlagen für Betriebsprüfungen.
- **📧 Automatischer Steuerberater-Monatsabschluss**: 1-Klick-Versand des gesamten Monatspakets an die Kanzlei.

### 6. 🚚 Packtisch, Fulfillment & Kombiversand ([`/fulfillment`](http://localhost:4200/fulfillment))

- **🧠 Intelligente Paket-Bündelung**: Erkennt automatisch Mehrfachkäufe desselben Kunden und berechnet die Portoersparnis.
- **⚡ 1-Klick Sammelpaket-Erzeugung**: Bündelt Bestellungen zu einer Sendung mit flexiblem Entbündeln (Unbundle).
- **Carrier-API-Anbindung**: Bucht Live-Versandmarken für DHL und Hermes inkl. DIN-A6 Etikettendruck und Tracking.

### 7. 🏪 Eigener Webshop mit Stripe & PayPal Live-Checkout ([`/store`](http://localhost:4200/store))

- Öffentlicher Reseller-Storefront mit Warenkorb, Bestandsreservierung und rechtssicheren Kundenbestellungen.
- Automatischer Lagerabgleich bei Verkäufen.

### 8. 🏢 Multi-Workspace & Holding-Konsolidierung ([`/analytics`](http://localhost:4200/analytics))

- Trennung verschiedener Geschäftszweige (z. B. _Electronics HQ_, _Vintage Studio_, _Flohmarkt Outlet_).
- **🏢 Holding-Modus**: Konsolidiertes Gesamt-Dashboard mit aggregierten KPIs, Gesamtkapital und Standortvergleich.

---

## 🛠️ Technologie-Stack & Architektur

- **Framework**: Angular 22 (Standalone Components, `provideZonelessChangeDetection()`, Signal-based State Management).
- **Styling**: Tailwind CSS 4 mit linearem Dark Canvas Theme (`#282c37`/`#323846`, Electric Indigo & Emerald Green Akzente).
- **Testing**: Vitest mit **22/22 Test-Suiten und 86/86 bestandenen Unit-Tests**.
- **Internationalisierung**: `@ngx-translate/core` mit synchronem deutschen Sprachpaket.
- **Benachrichtigungen**: W3C Web Push Notification API, Discord/Telegram Webhooks und In-App Notifications.
- **Icons**: `lucide-angular`.

---

## 🚀 Installation & Start

### Voraussetzungen

- Node.js >= 20.x
- npm >= 10.x

### Entwicklungsserver starten

```bash
# Abhängigkeiten installieren
npm install

# Lokalen Dev-Server starten (Port 4200)
npm start
# oder
ng serve
```

Die Anwendung ist im Browser unter `http://localhost:4200/` erreichbar.

### Lokales Testkonto

Nach `npx supabase db reset` gibt es lokal das Konto `test@flipbase.local` mit dem
Passwort `flipbase-test` und einigen Beispieldaten. Es existiert nur in der lokalen
Datenbank.

### Unit Tests ausführen

```bash
# Vitest Testrunner starten
npm test
```

### Production Build

```bash
npm run build
```

---

## 🧰 Qualitaetspruefungen

Vor jedem Commit formatiert ein Git-Hook die vorgemerkten Dateien automatisch. Aktivieren nach dem Klonen:

```bash
git config core.hooksPath .githooks
```

Die gleichen Pruefungen wie in der CI lassen sich auch von Hand ausfuehren:

| Befehl              | Prueft                       |
| ------------------- | ---------------------------- |
| `npm run format`    | formatiert alles             |
| `npm run lint`      | statische Analyse            |
| `npm run typecheck` | Typen in Anwendung und Tests |
| `npm test`          | Unit-Tests                   |

## 📄 Lizenz & Datenschutz

Entwickelt für Reseller und E-Commerce-Unternehmen. 100% datenschutzkonform mit lokaler Datenspeicherung und optionalem Supabase Cloud-Backend.
