# Cross-Marketplace Listing Transfer: Vinted ➔ Kleinanzeigen

> **Status:** Konzept & Architekturplan  
> **Datum:** 2026-10-09  
> **Autor:** Juna  
> **Kontext:** Flipbase Marktplatz-Modularisierung & Cross-Selling

---

## 1. Problemstellung & Motivation

Flipbase-Nutzer erfassen Mode- und Streetwear-Artikel primär als strukturierte Vinted-Inserate (mit Attributen wie Marke, Größe, Vinted-Paketgröße, exakten Abmessungen wie Brustweite und Rückenlänge). 
Um die Reichweite und Verkaufsgeschwindigkeit zu erhöhen, sollen dieselben Artikel auch auf weiteren Marktplätzen – allen voran **Kleinanzeigen** – angeboten werden.

### Herausforderung: Asymmetrische Datenmodelle
Ein globales „Einheitsformular“ für alle Marktplätze scheitert an den fundamental unterschiedlichen Datenmodellen:
- **eBay** erfordert sehr komplexe Schemas (Kategorienbaum, Artikelmerkmale, HTML-Templates, Rücknahmebedingungen, detaillierte Versandprofile).
- **Vinted** besitzt standardisierte Mode-Attribute (Größenraster, Marken-Katalog, interne Paketgrößen S/M/L, feste Maße).
- **Kleinanzeigen** ist bewusst simpel aufgebaut (Titel max. 65 Zeichen, Freitext-Beschreibung, Preisart Festpreis/VB, Standard-Versandkosten, PLZ/Ort). Es gibt keine strukturierten Datenbankfelder für Maße wie „Achsel zu Achsel“.

### Ziel
Ein intelligenter **1-Klick-Transfer**:
Ein in Flipbase gepflegtes Vinted-Inserat oder ein Vinted-Entwurf wird auf Knopfdruck in einen **Kleinanzeigen-Entwurf** dupliziert. 
- Alle kompatiblen Attribute werden 1:1 oder transformiert übernommen.
- Felder, die Kleinanzeigen nicht als Strukturfeld unterstützt (z. B. exakte Maße), werden intelligent in den Fließtext der Beschreibung formatiert.
- Der neue Kleinanzeigen-Entwurf steht anschließend im Kleinanzeigen-Bereich zur Durchsicht und Übergabe an die Flipbase-Browser-Extension bereit.

---

## 2. Attribut-Mapping & Transformations-Regeln

| Attribut | Vinted-Modell (`VintedListing`) | Kleinanzeigen-Modell (`KleinanzeigenListingDraft`) | Transformations-Regel |
| :--- | :--- | :--- | :--- |
| **Titel** | String (bis zu 100 Zeichen) | String (max. 65 Zeichen) | Falls > 65 Zeichen: Intelligente Kürzung am letzten Leerzeichen vor Zeichen 62 + `...`. Nutzer kann im Entwurf nachjustieren. |
| **Preis** | Numerisch (z. B. `45.00`) | Numerisch (`45.00`) + Preis-Typ | Standardmäßig 1:1 als Festpreis (`FIXED`) oder konfigurierbar als Verhandlungsbasis (`NEGOTIABLE` / VB). |
| **Beschreibung** | Freitext | Freitext + Formatierungs-Zusatz | Der Vinted-Text wird übernommen. Falls Vinted-Maße (Brust, Länge etc.) gepflegt sind, werden diese als formatierter Textblock unten angehängt (siehe unten). |
| **Bilder** | Array von Bild-URLs/Keys | Array von Bild-URLs/Keys | 1:1 Übernahme der Storage-URLs (Reihenfolge bleibt erhalten, Titelbild bleibt Index 0). |
| **Zustand** | Vinted Enum (`new_with_tags`, `very_good`, `good`, `satisfactory`) | Kleinanzeigen Enum (`NEW`, `VERY_GOOD`, `GOOD`, `ACCEPTABLE`) | Deterministisches Mapping: <br>• `new_with_tags` / `new_without_tags` ➔ `NEW`<br>• `very_good` ➔ `VERY_GOOD`<br>• `good` ➔ `GOOD`<br>• `satisfactory` ➔ `ACCEPTABLE` |
| **Kategorie** | Vinted Category-ID (z. B. Herren / Pullover) | Kleinanzeigen Kategorie-Pfad / ID | Mapping über eine Zuordnungstabelle der Hauptkategorien (z. B. Mode & Beauty › Herrenbekleidung › Pullover & Sweatshirts). |
| **Maße (Brust, Länge, etc.)** | Dedizierte numerische Felder | *Nicht im Kleinanzeigen-Schema vorhanden* | **Automatische Text-Injektion** in die Beschreibung: <br>`---`<br>`Maße:`<br>`• Brustweite (Achsel zu Achsel): 58 cm`<br>`• Gesamtlänge: 71 cm` |
| **Versandart** | Vinted Paket S / M / L | Kleinanzeigen Versandoption + Preis | Voreinstellung aus den Kleinanzeigen-Einstellungen (z. B. DHL Paket mit Sendungsverfolgung, 5,49 €). |
| **Standort** | Benutzerkonto-Standort | PLZ & Ort | Übernahme aus den Unternehmens- oder Workspace-Einstellungen (`workspace.zip_code` & `workspace.city`). |

---

## 3. Datenstrukturen & TypeScript-Definitionen

```typescript
// src/app/features/marketplaces/models/cross-listing.models.ts

export type MarketplaceType = 'vinted' | 'ebay' | 'kleinanzeigen';

export interface CrossListingSource {
  readonly marketplace: 'vinted';
  readonly sourceListingId: string;
}

export type KleinanzeigenPriceType = 'FIXED' | 'NEGOTIABLE' | 'GIVE_AWAY';

export type KleinanzeigenCondition = 'NEW' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE';

export interface KleinanzeigenListingDraft {
  readonly id: string;
  readonly workspaceId: string;
  readonly source?: CrossListingSource;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly priceType: KleinanzeigenPriceType;
  readonly condition: KleinanzeigenCondition;
  readonly categoryId?: string;
  readonly images: readonly string[];
  readonly shippingCost?: number;
  readonly shippingPossible: boolean;
  readonly postalCode: string;
  readonly city: string;
  readonly status: 'DRAFT' | 'READY_FOR_AUTOFILL' | 'PUBLISHED';
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

---

## 4. UI/UX Workflow

### 1. Ausgangspunkt: Vinted Inserate / Editor
In der Vinted-Inseratsliste (`/marketplaces/vinted/listings`) sowie im Listing-Editor gibt es ein Aktionsmenü:
- Button: **„Auf Kleinanzeigen übertragen“** (mit Kleinanzeigen-Logo).

### 2. Schnelle Übertragungs-Modalvorschau (`TransferDialog`)
Vor dem Anlegen öffnet sich ein kompaktes Flipbase-Modal:
- Zeigt das Quell-Inserat und den generierten Kleinanzeigen-Entwurf im Vergleich.
- **Hinweis-Badges:**
  - *Titel angepasst:* Falls der Titel von z. B. 75 Zeichen auf 65 gekürzt wurde, wird das hervorgehoben.
  - *Maße integriert:* Zeigt an: „2 Maßangaben wurden in die Beschreibung übernommen“.
- Auswahl: Preis als Festpreis oder VB übernehmen.
- Bestätigen mit Button: **„Als Kleinanzeigen-Entwurf speichern“**.

### 3. Neuer Kleinanzeigen-Bereich (`/marketplaces/kleinanzeigen`)
Unter `Marktplätze › Kleinanzeigen` in der Sidebar:
- **Inserate & Entwürfe:** Übersicht aller erstellten Entwürfe.
- Kennzeichnung: Badge `Aus Vinted übertragen` mit Link zum Ursprungsinserat.
- **Autofill-Button:** Startet das Ausfüllen auf Kleinanzeigen.de über die Flipbase Browser-Extension (nutzt `autofill-core.js`).

---

## 5. Implementierungs-Roadmap

1. **Phase 1: Marktplatz-Steuerung (Aktueller Task)**
   - Einstellungen `/settings/marketplaces` mit Ein-/Ausschaltern für Vinted, eBay und Kleinanzeigen.
   - Dynamische Sidebar: Nicht genutzte Marktplätze werden ausgeblendet.
   - Pufferzone `pb-8` im Sidebar-Footer gegen Link-Overlay.

2. **Phase 2: Kleinanzeigen-Modell & Service**
   - Anlegen von `src/app/features/marketplaces/kleinanzeigen/`
   - Implementierung von `CrossListingTransferService` für das Attribut-Mapping und die String-Kürzung.

3. **Phase 3: Transfer-UI in Vinted**
   - Aktionsbutton in Vinted-Listings.
   - Vorschau- und Bestätigungs-Modal.

4. **Phase 4: Extension Autofill-Kopplung**
   - Anbindung der Entwurfsdaten an die Flipbase-Extension für nahtloses Veröffentlichen auf Kleinanzeigen.de.
