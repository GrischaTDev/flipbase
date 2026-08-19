import { Injectable } from '@angular/core';

export interface BarcodeProductInfo {
  ean: string;
  title: string;
  brand?: string;
  model?: string;
  category?: string;
  estimatedPrice?: number;
}

@Injectable({
  providedIn: 'root',
})
export class BarcodeLookupService {
  // Built-in database of common reselling test items & EANs
  private readonly sampleDatabase: Record<string, BarcodeProductInfo> = {
    '4005317316719': {
      ean: '4005317316719',
      title: 'Bosch Akku-Bohrschrauber GSR 18V-55 Professional',
      brand: 'Bosch Professional',
      model: 'GSR 18V-55',
      category: 'Werkzeug & Garten',
      estimatedPrice: 95.0,
    },
    '0194252033488': {
      ean: '0194252033488',
      title: 'Apple AirPods Pro (2. Generation) mit MagSafe Case',
      brand: 'Apple',
      model: 'AirPods Pro 2',
      category: 'Elektronik & Audio',
      estimatedPrice: 175.0,
    },
    '0045496452629': {
      ean: '0045496452629',
      title: 'Nintendo Switch OLED Konsole (Neon-Rot/Neon-Blau)',
      brand: 'Nintendo',
      model: 'Switch OLED',
      category: 'Gaming & Konsolen',
      estimatedPrice: 240.0,
    },
    '4006501726055': {
      ean: '4006501726055',
      title: 'Leifheit Bodenwischer Profi XL Micro Duo',
      brand: 'Leifheit',
      model: 'Profi XL',
      category: 'Haushalt & Reinigung',
      estimatedPrice: 32.0,
    },
    '4242005183869': {
      ean: '4242005183869',
      title: 'Bosch Akku-Staubsauger Unlimited Serie 6 BBS611PCK',
      brand: 'Bosch',
      model: 'Unlimited Serie 6',
      category: 'Haushaltsgeräte',
      estimatedPrice: 149.0,
    },
  };

  /**
   * Looks up product details by EAN / Barcode.
   */
  async lookupByEan(ean: string): Promise<BarcodeProductInfo | null> {
    const cleanEan = ean.trim().replace(/[^0-9]/g, '');
    if (!cleanEan) return null;

    // 1. Check local catalog
    if (this.sampleDatabase[cleanEan]) {
      return this.sampleDatabase[cleanEan];
    }

    // 2. Try Open Food / Product Facts API for public EANs
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${cleanEan}.json`,
      );
      if (response.ok) {
        const json = await response.json();
        if (json.status === 1 && json.product) {
          const p = json.product;
          return {
            ean: cleanEan,
            title: p.product_name || p.generic_name || `Produkt ${cleanEan}`,
            brand: p.brands || undefined,
            category: p.categories?.split(',')[0]?.trim() || 'Verbrauchsgüter',
            estimatedPrice: undefined,
          };
        }
      }
    } catch {
      // Heuristic fallback if offline
    }

    // 3. Fallback generic product object
    return {
      ean: cleanEan,
      title: `Gescanntes Produkt (${cleanEan})`,
      category: 'Diverses',
    };
  }
}
