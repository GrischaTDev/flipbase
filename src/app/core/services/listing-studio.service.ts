import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { InventoryService } from './inventory.service';
import { MockDataStoreService } from './mock-data-store.service';
import { InventoryItem, ListingDraft } from '../models/reflip.models';
import { LoggerService } from './logger.service';

export type ListingPlatform = 'kleinanzeigen' | 'ebay' | 'vinted' | 'custom_store' | 'social';
export type ListingStyleTone = 'dealer' | 'bargain' | 'collector' | 'casual';

export interface ListingTemplateOptions {
  includeDisclaimer: boolean;
  isCommercialSeller: boolean;
  includeNonSmoking: boolean;
  includeShipping: boolean;
  includePickup: boolean;
  includeNegotiable: boolean;
  styleTone: ListingStyleTone;
  customNotes?: string;
}

export interface GeneratedListing {
  platform: ListingPlatform;
  title: string;
  price: number;
  description: string;
  htmlDescription?: string;
  hashtags?: string[];
  platformUrl?: string;
}

export interface SeoOptimizationResult {
  score: number; // 0 - 100
  titleScore: number;
  descriptionScore: number;
  charCount: number;
  maxChars: number;
  detectedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  optimizedTitle: string;
  optimizedDescription: string;
}

@Injectable({
  providedIn: 'root',
})
export class ListingStudioService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });
  private readonly inventoryService = inject(InventoryService, { optional: true });

  readonly savedDrafts = signal<ListingDraft[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung in Phase 8 auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadDrafts(ws.id);
        } else {
          this.savedDrafts.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadDrafts(_workspaceId: string): Promise<void> {
    try {
      if (!this.supabase || this.mockStore?.isDemoMode()) return;
      const { data, error } = await this.supabase.client
        .from('listing_drafts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        this.savedDrafts.set(data as ListingDraft[]);
      }
    } catch (err) {
      this.logger.error('Error loading listing drafts:', err);
    }
  }

  /**
   * Generates a platform-optimized title and description with customizable style profiles.
   */
  generateListing(
    item: InventoryItem,
    platform: ListingPlatform,
    price: number,
    options: ListingTemplateOptions = {
      includeDisclaimer: true,
      isCommercialSeller: true,
      includeNonSmoking: true,
      includeShipping: true,
      includePickup: true,
      includeNegotiable: false,
      styleTone: 'dealer',
    },
  ): GeneratedListing {
    const conditionGerman = this.getConditionText(item.condition);
    const title = this.buildPlatformTitle(item, platform, options);
    let description = '';
    let htmlDescription: string | undefined = undefined;

    switch (platform) {
      case 'kleinanzeigen':
        description = this.buildKleinanzeigenText(item, price, conditionGerman, options);
        break;
      case 'ebay':
        description = this.buildEbayText(item, price, conditionGerman, options);
        htmlDescription = this.buildEbayHtml(item, price, conditionGerman, options);
        break;
      case 'vinted':
        description = this.buildVintedText(item, price, conditionGerman, options);
        break;
      case 'custom_store':
        description = this.buildStoreText(item, price, conditionGerman, options);
        htmlDescription = this.buildStoreHtml(item, price, conditionGerman, options);
        break;
      case 'social':
        description = this.buildSocialText(item, price, conditionGerman, options);
        break;
    }

    const hashtags =
      platform === 'vinted' || platform === 'social' ? this.buildHashtags(item) : undefined;
    const platformUrl = this.getPlatformPublishUrl(platform, item.id);

    return {
      platform,
      title,
      price,
      description,
      htmlDescription,
      hashtags,
      platformUrl,
    };
  }

  /**
   * AI SEO Analyzer & Optimizer for maximum search rank on eBay, Kleinanzeigen, and Vinted.
   */
  analyzeAndOptimizeListing(
    item: InventoryItem,
    platform: ListingPlatform,
    currentTitle?: string,
    currentDesc?: string,
  ): SeoOptimizationResult {
    const title = (currentTitle || item.title || '').trim();
    const desc = (currentDesc || item.description || '').trim();

    const maxChars = platform === 'ebay' ? 80 : platform === 'kleinanzeigen' ? 70 : 60;
    const charCount = title.length;

    const detectedKeywords: string[] = [];
    const missingKeywords: string[] = [];
    const suggestions: string[] = [];

    // Check Brand
    if (item.brand && title.toLowerCase().includes(item.brand.toLowerCase())) {
      detectedKeywords.push(`Marke: ${item.brand}`);
    } else if (item.brand) {
      missingKeywords.push(`Marke: ${item.brand}`);
      suggestions.push(`Füge den Herstellernamen "${item.brand}" an den Titelanfang.`);
    }

    // Check Model
    if (item.model && title.toLowerCase().includes(item.model.toLowerCase())) {
      detectedKeywords.push(`Modell: ${item.model}`);
    } else if (item.model) {
      missingKeywords.push(`Modell: ${item.model}`);
      suggestions.push(`Ergänze die genaue Modellbezeichnung "${item.model}".`);
    }

    // Check Condition Tag
    const hasCond =
      title.toLowerCase().includes('neu') ||
      title.toLowerCase().includes('ovp') ||
      title.toLowerCase().includes('sehr gut') ||
      title.toLowerCase().includes('top');
    if (hasCond) {
      detectedKeywords.push('Zustand/OVP');
    } else {
      missingKeywords.push('Zustand / OVP');
      suggestions.push(
        'Füge einen prägnanten Zustandshinweis wie "OVP", "Wie Neu" oder "Top Zustand" ein.',
      );
    }

    // Title score calculation
    let titleScore = 40;
    if (platform === 'ebay') {
      if (charCount >= 70 && charCount <= 80) titleScore += 40;
      else if (charCount >= 55) titleScore += 25;
      else titleScore += 10;
    } else {
      if (charCount >= 50 && charCount <= 70) titleScore += 40;
      else if (charCount >= 35) titleScore += 25;
      else titleScore += 10;
    }

    if (detectedKeywords.length >= 2) titleScore += 20;

    titleScore = Math.min(100, Math.max(20, titleScore));

    // Description score calculation
    let descriptionScore = 40;
    if (desc.includes('•') || desc.includes('-') || desc.includes('*')) descriptionScore += 25;
    if (desc.toLowerCase().includes('versand') || desc.toLowerCase().includes('abholung'))
      descriptionScore += 20;
    if (
      desc.toLowerCase().includes('gewährleistung') ||
      desc.toLowerCase().includes('differenzbesteuerung') ||
      desc.toLowerCase().includes('garantie')
    )
      descriptionScore += 15;

    descriptionScore = Math.min(100, Math.max(25, descriptionScore));
    const overallScore = Math.round(titleScore * 0.55 + descriptionScore * 0.45);

    if (charCount < 45) {
      suggestions.push(
        `Titel nutzt nur ${charCount}/${maxChars} Zeichen. Nutze relevante Suchbegriffe aus!`,
      );
    }

    // Build optimized high-conversion title
    const brand = item.brand ? `${item.brand} ` : '';
    const model =
      item.model && !item.title.toLowerCase().includes(item.model.toLowerCase())
        ? ` ${item.model}`
        : '';
    const condTag =
      item.condition === 'new'
        ? 'NEU & OVP'
        : item.condition === 'like_new'
          ? 'Wie Neu OVP'
          : 'Sehr Gut Geprüft';

    let optimizedTitle: string;
    if (platform === 'ebay') {
      optimizedTitle = `${brand}${item.title}${model} | ${condTag} | Blitzversand`.trim();
      if (optimizedTitle.length > 80) {
        optimizedTitle = `${brand}${item.title}${model} ${condTag}`.trim().slice(0, 80);
      }
    } else if (platform === 'kleinanzeigen') {
      optimizedTitle = `${brand}${item.title}${model} (${condTag})`.trim().slice(0, 70);
    } else {
      optimizedTitle = `${brand}${item.title}${model} - ${condTag}`.trim().slice(0, 60);
    }

    // Build optimized description
    const optimizedDescription = this.buildOptimizedSeoDescription(item, platform);

    return {
      score: overallScore,
      titleScore,
      descriptionScore,
      charCount,
      maxChars,
      detectedKeywords,
      missingKeywords,
      suggestions:
        suggestions.length > 0
          ? suggestions
          : ['Hervorragend! Dein Listing ist maximal suchmaschinenoptimiert.'],
      optimizedTitle,
      optimizedDescription,
    };
  }

  private buildOptimizedSeoDescription(item: InventoryItem, _platform: ListingPlatform): string {
    const conditionText = this.getConditionText(item.condition);
    const lines: string[] = [
      `Top-Angebot: ${item.brand ? item.brand + ' ' : ''}${item.title}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `LIEFERUMFANG & HIGHLIGHTS:`,
      `• Artikel: ${item.title}`,
      item.brand ? `• Hersteller: ${item.brand}` : '',
      item.model ? `• Modell: ${item.model}` : '',
      `• Zustand: ${conditionText}`,
      item.condition_notes ? `• Details zum Zustand: ${item.condition_notes}` : '',
      item.description ? `\nBESCHREIBUNG:\n${item.description}` : '',
      `\nVERSAND & ABHOLUNG:`,
      `• Versicherter DHL / Hermes Versand mit Sendungsverfolgung möglich`,
      `• Sichere und gepolsterte Verpackung garantiert`,
      `• Schneller Versand innerhalb von 24 Stunden nach Zahlungseingang`,
      `• Barzahlung bei Abholung oder Überweisung / PayPal`,
      `\nRECHTLICHER HINWEIS:`,
      `Geprüfte Gebrauchtware vom Händler. Differenzbesteuerung gem. § 25a UStG.`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].filter(Boolean);

    return lines.join('\n');
  }

  private buildPlatformTitle(
    item: InventoryItem,
    platform: ListingPlatform,
    options: ListingTemplateOptions,
  ): string {
    const brand = item.brand ? `${item.brand} ` : '';
    const cond =
      item.condition === 'new' ? 'NEU & OVP' : item.condition === 'like_new' ? 'WIE NEU' : '';

    if (platform === 'kleinanzeigen') {
      const vb = options.includeNegotiable ? ' (VB)' : '';
      const prefix = options.styleTone === 'collector' ? 'TOP ' : '';
      const base = `${prefix}${brand}${item.title} ${cond}`.trim();
      return `${base}${vb}`.slice(0, 70);
    } else if (platform === 'ebay') {
      const model = item.model ? ` ${item.model}` : '';
      const base = `${brand}${item.title}${model} | ${cond || 'Geprüfter Zustand'}`.trim();
      return base.slice(0, 80);
    } else if (platform === 'vinted') {
      return `${brand}${item.title}`.trim().slice(0, 60);
    } else {
      return `${brand}${item.title} zu verkaufen!`;
    }
  }

  private buildKleinanzeigenText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions,
  ): string {
    const lines: string[] = [];

    if (options.styleTone === 'collector') {
      lines.push(`Hallo Sammler & Enthusiasten,`);
      lines.push(``);
      lines.push(`angeboten wird hier: ${item.title} in tollem Erhaltungszustand.`);
    } else if (options.styleTone === 'bargain') {
      lines.push(`Schnäppchen-Angebot:`);
      lines.push(``);
      lines.push(`Ich biete hier einen/eine ${item.title} zum fairen Festpreis an.`);
    } else {
      lines.push(`Hallo zusammen,`);
      lines.push(``);
      lines.push(`zum Verkauf steht hier ein(e) ${item.title}.`);
    }

    if (item.brand || item.model) {
      lines.push(`• Hersteller / Modell: ${[item.brand, item.model].filter(Boolean).join(' - ')}`);
    }
    lines.push(`• Zustand: ${conditionText}`);
    if (item.condition_notes) {
      lines.push(`• Zustandsdetails: ${item.condition_notes}`);
    }
    lines.push(``);

    if (item.description) {
      lines.push(`Beschreibung:`);
      lines.push(item.description);
      lines.push(``);
    }

    lines.push(
      `Preis: ${price.toFixed(2)} €${options.includeNegotiable ? ' (Verhandlungsbasis / VB)' : ' (Festpreis)'}`,
    );
    lines.push(``);

    if (options.includeNonSmoking) {
      lines.push(`• Gepflegter Nichtraucherhaushalt ohne Haustiere.`);
    }
    if (options.includePickup && options.includeShipping) {
      lines.push(`• Abholung vor Ort nach Absprache oder versicherter Versand möglich.`);
    } else if (options.includePickup) {
      lines.push(`• Nur an Selbstabholer.`);
    } else if (options.includeShipping) {
      lines.push(`• Versicherter Versand mit Sendungsverfolgung.`);
    }

    if (options.includeDisclaimer) {
      lines.push(``);
      if (options.isCommercialSeller) {
        lines.push(`Rechtlicher Hinweis:`);
        lines.push(
          `Verkauf durch gewerblichen Händler. Differenzbesteuerung gemäß § 25a UStG (kein gesonderter MwSt.-Ausweis).`,
        );
      } else {
        lines.push(`Rechtlicher Hinweis:`);
        lines.push(
          `Privatverkauf. Der Verkauf erfolgt unter Ausschluss jeglicher Sachmängelhaftung.`,
        );
      }
    }

    return lines.join('\n');
  }

  private buildEbayText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions,
  ): string {
    const lines: string[] = [];
    lines.push(`=========================================`);
    lines.push(`${item.title.toUpperCase()}`);
    lines.push(`=========================================`);
    lines.push(``);
    lines.push(`PRODUKTBESCHREIBUNG:`);
    if (item.brand) lines.push(`• Marke: ${item.brand}`);
    if (item.model) lines.push(`• Modell: ${item.model}`);
    lines.push(`• Zustand: ${conditionText}`);
    if (item.condition_notes) lines.push(`• Zustandshinweise: ${item.condition_notes}`);
    lines.push(``);

    if (item.description) {
      lines.push(`DETAILS:`);
      lines.push(item.description);
      lines.push(``);
    }

    lines.push(`HIGHLIGHTS:`);
    lines.push(`• Schneller und versicherter Versand`);
    lines.push(`• Fachgerecht und sicher verpackt`);
    if (options.includeNonSmoking) lines.push(`• Aus Nichtraucherhaushalt`);
    lines.push(``);

    if (options.includeDisclaimer) {
      lines.push(`RECHTLICHES:`);
      if (options.isCommercialSeller) {
        lines.push(`Gewerblicher Verkauf mit Rechnung (Differenzbesteuert gem. § 25a UStG).`);
      } else {
        lines.push(`Privatverkauf ohne Garantie und Gewährleistung.`);
      }
    }

    return lines.join('\n');
  }

  private buildEbayHtml(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions,
  ): string {
    return `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
  <div style="background: #1e1b4b; color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">${item.title}</h1>
    <p style="margin: 6px 0 0 0; color: #a5b4fc; font-size: 14px;">Geprüfte Gebrauchtware & Schnäppchen</p>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
    <h3 style="color: #4338ca; border-bottom: 2px solid #e0e7ff; padding-bottom: 8px;">Artikelübersicht</h3>
    <ul style="list-style: none; padding-left: 0;">
      ${item.brand ? `<li><strong>Marke:</strong> ${item.brand}</li>` : ''}
      ${item.model ? `<li><strong>Modell:</strong> ${item.model}</li>` : ''}
      <li><strong>Zustand:</strong> ${conditionText}</li>
      ${item.condition_notes ? `<li><strong>Zustandsdetails:</strong> ${item.condition_notes}</li>` : ''}
    </ul>
    ${item.description ? `<h3 style="color: #4338ca; border-bottom: 2px solid #e0e7ff; padding-bottom: 8px; margin-top: 24px;">Beschreibung</h3><p>${item.description.replace(/\n/g, '<br/>')}</p>` : ''}
    <div style="margin-top: 32px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 12px; color: #64748b;">
      ${options.isCommercialSeller ? 'Gewerblicher Verkauf mit Rechnung (§ 25a UStG Differenzbesteuerung).' : 'Privatverkauf unter Ausschluss jeglicher Sachmängelhaftung.'}
    </div>
  </div>
</div>`;
  }

  private buildVintedText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    _options: ListingTemplateOptions,
  ): string {
    const lines: string[] = [];
    lines.push(`${item.title}`);
    lines.push(``);
    lines.push(`Zustand: ${conditionText}`);
    if (item.brand) lines.push(`Marke: ${item.brand}`);
    if (item.condition_notes) lines.push(`Details: ${item.condition_notes}`);
    lines.push(``);
    if (item.description) {
      lines.push(item.description);
      lines.push(``);
    }
    lines.push(`Schneller und sicherer Versand garantiert!`);
    lines.push(``);
    lines.push(this.buildHashtags(item).join(' '));
    return lines.join('\n');
  }

  private buildSocialText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    _options: ListingTemplateOptions,
  ): string {
    return `${item.title}
Preis: ${price.toFixed(2)} €
Zustand: ${conditionText}

${item.description || ''}

Bei Interesse gerne melden!
${this.buildHashtags(item).join(' ')}`.trim();
  }

  private buildHashtags(item: InventoryItem): string[] {
    const tags: string[] = ['#reflip', '#secondhand'];
    if (item.title?.toLowerCase().includes('vintage')) tags.push('#vintage');
    if (item.title?.toLowerCase().includes('retro')) tags.push('#retro');
    if (item.brand) tags.push(`#${item.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    if (item.category) tags.push(`#${item.category.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    if (item.condition === 'new' || item.condition === 'like_new') tags.push('#neuwertig');
    return tags;
  }

  private getConditionText(cond: string): string {
    switch (cond) {
      case 'new':
        return 'Neu & Originalverpackt (OVP)';
      case 'like_new':
        return 'Wie neu (keine sichtbaren Gebrauchsspuren)';
      case 'very_good':
        return 'Sehr gut (minimale Gebrauchsspuren, voll funktionsfähig)';
      case 'used':
        return 'Gebraucht (altersübliche Gebrauchsspuren, voll funktionsfähig)';
      case 'heavily_used':
        return 'Stark gebraucht (sichtbare Spuren, technisch in Ordnung)';
      case 'defective':
        return 'Defekt / Für Bastler';
      default:
        return 'Geprüfter Zustand';
    }
  }

  private buildStoreText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    _options: ListingTemplateOptions,
  ): string {
    const lines: string[] = [];
    lines.push(`${item.title}`);
    lines.push(``);
    if (item.brand || item.model) {
      lines.push(`Hersteller & Modell: ${[item.brand, item.model].filter(Boolean).join(' - ')}`);
    }
    lines.push(`Zustand: ${conditionText}`);
    if (item.condition_notes) {
      lines.push(`Zustandsdetails: ${item.condition_notes}`);
    }
    lines.push(``);
    if (item.description) {
      lines.push(item.description);
      lines.push(``);
    }
    lines.push(`• Sofort lieferbar • Sichere Zahlung per Stripe / PayPal / Überweisung`);
    lines.push(`• Differenzbesteuert gem. § 25a UStG (Gebrauchtwaren)`);
    return lines.join('\n');
  }

  private buildStoreHtml(
    item: InventoryItem,
    price: number,
    conditionText: string,
    _options: ListingTemplateOptions,
  ): string {
    return `<div class="store-product-description">
  <h3>${item.title}</h3>
  <p><strong>Zustand:</strong> ${conditionText}</p>
  ${item.condition_notes ? `<p class="notes">${item.condition_notes}</p>` : ''}
  <div class="details">${item.description || ''}</div>
  <ul class="highlights">
    <li>Geprüfte Gebrauchtware vom Händler</li>
    <li>Sicherer Käuferschutz mit PayPal / Kreditkarte</li>
    <li>Schneller, versicherter DHL-Versand</li>
  </ul>
</div>`;
  }

  private getPlatformPublishUrl(platform: ListingPlatform, itemId?: string): string {
    switch (platform) {
      case 'kleinanzeigen':
        return 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html';
      case 'ebay':
        return 'https://www.ebay.de/sl/sell';
      case 'vinted':
        return 'https://www.vinted.de/items/new';
      case 'custom_store':
        return itemId ? `/shop/item/${itemId}` : '/shop';
      case 'social':
        return 'https://www.facebook.com/marketplace/create';
    }
  }

  /**
   * Publishes item directly to the public Webshop!
   */
  async publishToCustomStore(
    itemId: string,
    listingPrice: number,
  ): Promise<{ success: boolean; url: string }> {
    if (this.inventoryService) {
      await this.inventoryService.updateItem(itemId, {
        is_public_store: true,
        status: 'ready',
        expected_value: listingPrice,
      });
    }
    return {
      success: true,
      url: `/shop/item/${itemId}`,
    };
  }

  /**
   * Marks item as listed on a specific platform in ReFlip OS!
   */
  async markItemAsListed(itemId: string, platform: string, listingPrice: number): Promise<void> {
    if (!this.inventoryService) return;
    await this.inventoryService.updateItem(itemId, {
      status: 'listed',
      expected_value: listingPrice,
    });
  }
}
