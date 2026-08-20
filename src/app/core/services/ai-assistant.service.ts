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

export interface AiVisualScanResult {
  title: string;
  brand: string | null;
  model: string | null;
  category: string;
  condition: ItemCondition;
  conditionNotes?: string;
  estimatedMarketValue: number;
  confidenceScore: number;
  detectedLabels: string[];
  suggestedEan?: string;
  previewImageUrl?: string;
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
        'Bose',
        'Canon',
        'Nikon',
      ];
      for (const b of knownBrands) {
        if (lower.includes(b.toLowerCase())) {
          brand = b;
          break;
        }
      }

      // 2. Detect Categories & Models
      if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('macbook')) {
        category = 'Smartphones & Tablets';
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
        features.push('Retina Display', 'iOS');
      } else if (lower.includes('playstation') || lower.includes('ps5') || lower.includes('ps4')) {
        category = 'Gaming & Konsolen';
        if (!brand) brand = 'Sony';
        if (lower.includes('ps5')) {
          model = 'PlayStation 5';
          estimatedPrice = 360;
        } else {
          model = 'PlayStation 4 Pro';
          estimatedPrice = 160;
        }
      } else if (lower.includes('switch') || lower.includes('nintendo')) {
        category = 'Gaming & Konsolen';
        if (!brand) brand = 'Nintendo';
        model = lower.includes('oled') ? 'Switch OLED' : 'Switch';
        estimatedPrice = 210;
      } else if (
        lower.includes('bohrschrauber') ||
        lower.includes('akkuschrauber') ||
        lower.includes('gsr')
      ) {
        category = 'Heimwerken & Werkzeug';
        if (lower.includes('gsr 18v')) model = 'GSR 18V-55';
        estimatedPrice = 75;
      }

      // 3. Detect Condition
      if (lower.includes('wie neu') || lower.includes('neuwertig')) {
        condition = 'like_new';
      } else if (lower.includes('ovp') || lower.includes('brandneu') || lower.includes('neu ')) {
        condition = 'new';
      } else if (lower.includes('sehr gut')) {
        condition = 'very_good';
      } else if (lower.includes('defekt') || lower.includes('bastler')) {
        condition = 'defective';
        estimatedPrice = Math.max(10, estimatedPrice * 0.25);
      }

      // 4. Detect Defects
      if (lower.includes('kratzer')) defects.push('Sichtbare Kratzer am Gehäuse');
      if (lower.includes('riss') || lower.includes('gesplittert'))
        defects.push('Riss / Beschädigung');
      if (lower.includes('akku schwach')) defects.push('Akkuleistung reduziert');
      if (lower.includes('ohne kabel')) defects.push('Ladekabel fehlt');

      const cleanTitle = [brand, model || rawInput.trim()].filter(Boolean).join(' ');

      return {
        cleanTitle: cleanTitle || rawInput.trim(),
        brand,
        model,
        category,
        condition,
        estimatedMarketPrice: estimatedPrice,
        detectedDefects: defects,
        keyFeatures: features,
        confidence: brand ? 0.92 : 0.75,
      };
    } finally {
      this.isProcessing.set(false);
    }
  }

  /**
   * Analyzes an uploaded photo or camera snapshot to extract product metadata.
   */
  async analyzeImage(
    imageSrcOrFile: File | string,
    filenameHint?: string,
  ): Promise<AiVisualScanResult> {
    this.isProcessing.set(true);

    // Simulate AI vision latency (500ms) for realistic UX
    await new Promise((resolve) => setTimeout(resolve, 500));

    const hint = (
      filenameHint ||
      (typeof imageSrcOrFile === 'string' ? imageSrcOrFile : imageSrcOrFile.name) ||
      ''
    ).toLowerCase();

    // Jeder Zweig der folgenden Kette setzt alle Werte, der letzte ist ein
    // else - Vorgabewerte waeren deshalb toter Code.
    let title: string;
    let brand: string | null;
    let model: string | null;
    let category: string;
    let condition: ItemCondition;
    let conditionNotes: string;
    let estimatedMarketValue: number;
    let confidenceScore: number;
    const detectedLabels: string[] = ['Secondhand', 'Geprüft'];

    if (hint.includes('ps5') || hint.includes('playstation') || hint.includes('sony')) {
      title = 'Sony PlayStation 5 Digital Edition (CFI-1116B)';
      brand = 'Sony';
      model = 'CFI-1116B';
      category = 'Gaming & Konsolen';
      condition = 'very_good';
      conditionNotes =
        'Geringe Gebrauchsspuren, weiße Seitenschalen sauber, Lüftergitter staubfrei.';
      estimatedMarketValue = 350.0;
      confidenceScore = 0.96;
      detectedLabels.push('PlayStation', 'Konsole', 'White', 'NextGen');
    } else if (hint.includes('switch') || hint.includes('nintendo') || hint.includes('mario')) {
      title = 'Nintendo Switch Konsole (OLED-Modell) Neon-Rot/Blau';
      brand = 'Nintendo';
      model = 'Switch OLED (HEG-001)';
      category = 'Gaming & Konsolen';
      condition = 'like_new';
      conditionNotes = 'Display makellos ohne Kratzer, Joy-Cons ohne Stick-Drift.';
      estimatedMarketValue = 230.0;
      confidenceScore = 0.94;
      detectedLabels.push('Nintendo', 'Handheld', 'OLED', 'Gaming');
    } else if (hint.includes('iphone') || hint.includes('apple') || hint.includes('phone')) {
      title = 'Apple iPhone 13 Pro (128 GB, Graphit)';
      brand = 'Apple';
      model = 'iPhone 13 Pro 128GB';
      category = 'Smartphones & Tablets';
      condition = 'very_good';
      conditionNotes = 'Kameraglas intakt, minimale Mikrokratzer am Rahmen.';
      estimatedMarketValue = 420.0;
      confidenceScore = 0.95;
      detectedLabels.push('Apple', 'Smartphone', 'OLED', 'Triple-Camera');
    } else if (hint.includes('bosch') || hint.includes('schrauber') || hint.includes('tool')) {
      title = 'Bosch Professional Akku-Bohrschrauber GSR 18V-55';
      brand = 'Bosch Professional';
      model = 'GSR 18V-55';
      category = 'Heimwerken & Werkzeug';
      condition = 'very_good';
      conditionNotes = 'Bohrfutter läuft rund, Gummierung griffig, Werkstattgeprüft.';
      estimatedMarketValue = 85.0;
      confidenceScore = 0.92;
      detectedLabels.push('Bosch', '18V', 'Brushless', 'Werkzeug');
    } else if (hint.includes('jacket') || hint.includes('jacke') || hint.includes('alpha')) {
      title = 'Vintage Alpha Industries Bomberjacke MA-1 (Schwarz, Gr. L)';
      brand = 'Alpha Industries';
      model = 'MA-1 Flight Jacket';
      category = 'Kleidung & Accessoires';
      condition = 'very_good';
      conditionNotes = 'Bündchen elastisch, Reißverschluss leichtgängig, keine Flecken.';
      estimatedMarketValue = 65.0;
      confidenceScore = 0.91;
      detectedLabels.push('Vintage', 'Streetwear', 'Bomberjacke');
    } else {
      title = 'Sony WH-1000XM4 Noise-Cancelling Kopfhörer';
      brand = 'Sony';
      model = 'WH-1000XM4';
      category = 'Audio & HiFi';
      condition = 'very_good';
      conditionNotes = 'Ohrpolster weich und ohne Risse, Akkulaufzeit hervorragend.';
      estimatedMarketValue = 160.0;
      confidenceScore = 0.89;
      detectedLabels.push('Audio', 'Bluetooth', 'ANC');
    }

    this.isProcessing.set(false);

    return {
      title,
      brand,
      model,
      category,
      condition,
      conditionNotes,
      estimatedMarketValue,
      confidenceScore,
      detectedLabels,
    };
  }

  /**
   * Enhances listing text (Kapitel 15).
   */
  async enhanceListingCopy(
    rawTitle: string,
    rawNotes: string,
    condition: ItemCondition,
    platform: 'kleinanzeigen' | 'ebay' | 'vinted',
  ): Promise<AiEnhanceResult> {
    const ident = await this.identifyProduct(rawTitle);
    const cleanTitle = ident.cleanTitle;

    let desc: string;
    if (platform === 'kleinanzeigen') {
      desc = `Hallo zusammen,\n\nich verkaufe hier meinen/meine ${cleanTitle}.\n\nZustand: ${condition}\n`;
      if (rawNotes) desc += `\nDetails: ${rawNotes}\n`;
      desc += `\nAbholung vor Ort oder versicherter Versand via DHL möglich. Bei Fragen gerne schreiben!`;
    } else {
      desc = `PRODUKT: ${cleanTitle}\nZUSTAND: ${condition}\n\n${rawNotes || 'Technisch und optisch einwandfrei.'}`;
    }

    return {
      enhancedTitle: cleanTitle,
      enhancedDescription: desc,
      suggestedKeywords: [ident.brand || '', ident.model || '', condition].filter(Boolean),
    };
  }
}
