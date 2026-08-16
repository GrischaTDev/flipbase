import { Injectable, signal } from '@angular/core';
import { ItemCondition } from '../models/reflip.models';

export interface AiProductIdentification {
  cleanTitle: string;
  brand: string | null;
  model: string | null;
  category: string;
  condition: ItemCondition;
  estimatedMarketPrice: number;
  detectedDefects: string[];
  keyFeatures: string[];
  confidence: number;
}

export interface AiEnhanceResult {
  enhancedTitle: string;
  enhancedDescription: string;
  suggestedKeywords: string[];
}

@Injectable({
  providedIn: 'root',
})
export class AiAssistantService {
  readonly isProcessing = signal<boolean>(false);

  /**
   * Identifies product details, brand, model, condition and defects from raw text or query (Kapitel 13 & 14).
   */
  async identifyProduct(rawInput: string): Promise<AiProductIdentification> {
    this.isProcessing.set(true);
    try {
      // Simulate/perform extraction heuristics
      const lower = rawInput.toLowerCase();
      let brand: string | null = null;
      let model: string | null = null;
      let category = 'Allgemein';
      let condition: ItemCondition = 'used';
      let estimatedPrice = 50.0;
      const defects: string[] = [];
      const features: string[] = [];

      // 1. Detect Brands
      const knownBrands = [
        'Apple',
        'Sony',
        'Bosch',
        'Makita',
        'Nintendo',
        'Samsung',
        'Dyson',
        'Lego',
        'Nike',
        'Adidas',
        'Alpha Industries',
        'Logitech',
      ];
      for (const b of knownBrands) {
        if (lower.includes(b.toLowerCase())) {
          brand = b;
          break;
        }
      }

      // 2. Detect Categories & Models
      if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('macbook')) {
        category = 'Elektronik & Smartphones';
        if (!brand) brand = 'Apple';
        if (lower.includes('iphone 13')) {
          model = 'iPhone 13';
          estimatedPrice = 380;
        } else if (lower.includes('iphone 14')) {
          model = 'iPhone 14';
          estimatedPrice = 490;
        } else {
          model = 'Apple Device';
          estimatedPrice = 300;
        }
        features.push('Retina Display', 'iOS', 'Originalverpackung ggf. vorhanden');
      } else if (lower.includes('playstation') || lower.includes('ps5') || lower.includes('ps4') || lower.includes('xbox') || lower.includes('switch')) {
        category = 'Gaming & Konsolen';
        if (lower.includes('ps5')) {
          model = 'PlayStation 5';
          estimatedPrice = 360;
        } else if (lower.includes('switch')) {
          model = 'Nintendo Switch';
          estimatedPrice = 180;
        }
        features.push('HDMI Kabel', 'Controller', 'Stromkabel');
      } else if (lower.includes('bohr') || lower.includes('akkuschrauber') || lower.includes('gsr') || lower.includes('werkzeug')) {
        category = 'Heimwerken & Werkzeug';
        if (lower.includes('gsr 18v')) {
          model = 'GSR 18V-55';
          estimatedPrice = 85;
        } else {
          estimatedPrice = 65;
        }
        features.push('Bürstenloser Motor', 'Schnellspannbohrfutter', 'Akkubetrieb');
      } else if (lower.includes('jacke') || lower.includes('schuhe') || lower.includes('sneaker')) {
        category = 'Kleidung & Mode';
        estimatedPrice = 45;
        features.push('Gepflegter Zustand', 'Originale Etiketten');
      }

      // 3. Detect Condition keywords (Kapitel 17)
      if (lower.includes('wie neu') || lower.includes('neuwertig') || lower.includes('makellos')) {
        condition = 'like_new';
      } else if (lower.includes('ovp') || lower.includes('neu ') || lower.includes('neuer ') || lower.includes('ungeöffnet') || lower.includes('versiegelt')) {
        condition = 'new';
      } else if (lower.includes('sehr gut') || lower.includes('kaum genutzt')) {
        condition = 'very_good';
      } else if (lower.includes('stark gebraucht') || lower.includes('starke kratzer') || lower.includes('abnutzung')) {
        condition = 'heavily_used';
      } else if (lower.includes('defekt') || lower.includes('bastler') || lower.includes('ersatzteil') || lower.includes('geht nicht')) {
        condition = 'defective';
        estimatedPrice = Number((estimatedPrice * 0.25).toFixed(2));
      }

      // 4. Detect Defects & Risks (Kapitel 16)
      if (lower.includes('kratzer')) defects.push('Kratzer auf Gehäuse oder Display vorhanden');
      if (lower.includes('akku schwach') || lower.includes('akku defekt')) defects.push('Akkukapazität eingeschränkt');
      if (lower.includes('ohne kabel') || lower.includes('ohne zubehör')) defects.push('Zubehör/Kabel fehlt');

      const cleanTitle = rawInput.trim();

      return {
        cleanTitle: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
        brand,
        model,
        category,
        condition,
        estimatedMarketPrice: estimatedPrice,
        detectedDefects: defects,
        keyFeatures: features,
        confidence: brand && model ? 0.95 : 0.8,
      };
    } finally {
      this.isProcessing.set(false);
    }
  }

  /**
   * Enhances raw listing description with high-converting copy and defect transparency (Kapitel 15 & 16).
   */
  async enhanceListingCopy(
    title: string,
    rawNotes: string,
    condition: ItemCondition,
    platform: 'kleinanzeigen' | 'ebay' | 'vinted'
  ): Promise<AiEnhanceResult> {
    this.isProcessing.set(true);
    try {
      const keywords = [title, condition, 'schneller Versand', 'geprüft', 'top Zustand'];

      let enhancedDescription = '';
      if (platform === 'kleinanzeigen') {
        enhancedDescription = [
          `Hallo zusammen,`,
          ``,
          `zum Verkauf steht ein(e) sehr gepflegte(r) **${title}**.`,
          ``,
          `🔎 **Zustand & Details:**`,
          `• Zustand: ${condition}`,
          rawNotes ? `• Besonderheiten: ${rawNotes}` : `• Voll funktionsfähig und sofort einsatzbereit.`,
          ``,
          `📦 **Abholung & Versand:**`,
          `• Persönliche Abholung vor Ort nach Vereinbarung möglich`,
          `• Schneller und sicherer Versand per DHL / Hermes`,
          ``,
          `Bei Fragen einfach kurz anschreiben!`,
        ].join('\n');
      } else {
        enhancedDescription = [
          `=====================================`,
          `ANGEBOTSBESCHREIBUNG: ${title.toUpperCase()}`,
          `=====================================`,
          ``,
          `HIGHLIGHTS:`,
          `• Geprüfte Funktion und ordentlicher Zustand (${condition})`,
          rawNotes ? `• Wichtige Hinweise: ${rawNotes}` : `• Schneller und sicherer Versand garantiert`,
          ``,
          `LIEFERUMFANG:`,
          `• 1x ${title}`,
        ].join('\n');
      }

      return {
        enhancedTitle: `${title} | Geprüft & Einwandfrei`,
        enhancedDescription,
        suggestedKeywords: keywords,
      };
    } finally {
      this.isProcessing.set(false);
    }
  }
}
