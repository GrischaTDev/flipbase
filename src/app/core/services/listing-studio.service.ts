import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { InventoryService } from './inventory.service';
import { InventoryItem, ListingDraft } from '../models/reflip.models';

export type ListingPlatform = 'kleinanzeigen' | 'ebay' | 'vinted' | 'social';
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

@Injectable({
  providedIn: 'root',
})
export class ListingStudioService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly inventoryService = inject(InventoryService);

  readonly savedDrafts = signal<ListingDraft[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.loadDrafts(ws.id);
      } else {
        this.savedDrafts.set([]);
      }
    });
  }

  async loadDrafts(workspaceId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('listing_drafts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        this.savedDrafts.set(data as ListingDraft[]);
      }
    } catch (err) {
      console.error('Error loading listing drafts:', err);
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
    }
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
      case 'social':
        description = this.buildSocialText(item, price, conditionGerman, options);
        break;
    }

    const hashtags = platform === 'vinted' || platform === 'social' ? this.buildHashtags(item) : undefined;
    const platformUrl = this.getPlatformPublishUrl(platform);

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

  private buildPlatformTitle(
    item: InventoryItem,
    platform: ListingPlatform,
    options: ListingTemplateOptions
  ): string {
    const brand = item.brand ? `${item.brand} ` : '';
    const cond = item.condition === 'new' ? 'NEU & OVP' : item.condition === 'like_new' ? 'WIE NEU' : '';

    if (platform === 'kleinanzeigen') {
      const vb = options.includeNegotiable ? ' (VB)' : '';
      const prefix = options.styleTone === 'collector' ? '⭐ TOP ⭐ ' : '';
      const base = `${prefix}${brand}${item.title} ${cond}`.trim();
      return `${base}${vb}`.slice(0, 70); // Kleinanzeigen max length
    } else if (platform === 'ebay') {
      const model = item.model ? ` ${item.model}` : '';
      const base = `${brand}${item.title}${model} | ${cond || 'Geprüfter Zustand'}`.trim();
      return base.slice(0, 80); // eBay max length
    } else if (platform === 'vinted') {
      return `${brand}${item.title}`.trim().slice(0, 60);
    } else {
      return `🔥 ${brand}${item.title} zu verkaufen!`;
    }
  }

  private buildKleinanzeigenText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions
  ): string {
    const lines: string[] = [];

    if (options.styleTone === 'collector') {
      lines.push(`Hallo Sammler & Enthusiasten, 🎮`);
      lines.push(``);
      lines.push(`angeboten wird hier: ${item.title} in tollem Erhaltungszustand.`);
    } else if (options.styleTone === 'bargain') {
      lines.push(`Schnäppchen-Alarm! ⚡`);
      lines.push(``);
      lines.push(`Ich biete hier einen/eine ${item.title} zum absoluten Festpreis an.`);
    } else {
      lines.push(`Hallo zusammen, 👋`);
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

    lines.push(`💰 Preis: ${price.toFixed(2)} € ${options.includeNegotiable ? '(Verhandlungsbasis / VB)' : '(Festpreis)'}`);
    lines.push(``);

    const logistics: string[] = [];
    if (options.includePickup) {
      logistics.push(`• 📍 Selbstabholung vor Ort flexibel nach Terminabsprache möglich (Barzahlung oder PayPal).`);
    }
    if (options.includeShipping) {
      logistics.push(`• 📦 Sicherer und versicherter Versand via DHL / Hermes mit Sendungsnummer.`);
    }
    if (logistics.length > 0) {
      lines.push(`Abholung & Versand:`);
      lines.push(...logistics);
      lines.push(``);
    }

    if (options.includeNonSmoking) {
      lines.push(`• 🚭 Gepflegter Nichtraucherhaushalt.`);
    }

    if (options.includeDisclaimer) {
      lines.push(``);
      lines.push(`Rechtlicher Hinweis:`);
      if (options.isCommercialSeller) {
        lines.push(`Gewerblicher Verkauf mit Rechnung (Differenzbesteuerung gem. § 25a UStG bei Gebrauchtwaren). 14 Tage gesetzliches Widerrufsrecht.`);
      } else {
        lines.push(`Privatverkauf: Der Verkauf erfolgt unter Ausschluss jeglicher Sachmängelhaftung. Keine Garantie oder Rücknahme.`);
      }
    }

    lines.push(``);
    lines.push(`Bei Fragen einfach kurz eine Nachricht schreiben – antworte zügig!`);

    return lines.join('\n');
  }

  private buildEbayText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions
  ): string {
    const lines: string[] = [];

    lines.push(`=========================================`);
    lines.push(`PRODUKTBESCHREIBUNG & ZUSTAND`);
    lines.push(`=========================================`);
    lines.push(`Artikel: ${item.title}`);
    if (item.brand) lines.push(`Hersteller / Marke: ${item.brand}`);
    if (item.model) lines.push(`Modellbezeichnung: ${item.model}`);
    if (item.ean) lines.push(`EAN: ${item.ean}`);
    lines.push(`Zustand: ${conditionText}`);
    if (item.condition_notes) lines.push(`Zustandsdetails: ${item.condition_notes}`);
    lines.push(``);

    lines.push(`HIGHLIGHTS:`);
    if (item.description) {
      lines.push(item.description);
    } else {
      lines.push(`• Funktionsgeprüft und technisch einwandfrei`);
      lines.push(`• Vor dem Verkauf gründlich gereinigt`);
    }
    lines.push(``);

    lines.push(`LIEFERUMFANG:`);
    lines.push(`• 1x ${item.title}`);
    lines.push(``);

    lines.push(`VERSAND & SERVICE:`);
    if (options.includeShipping) {
      lines.push(`• Sorgfältig und stoßsicher gepolsterter Paketversand mit Sendungsverfolgung.`);
    }
    if (options.includePickup) {
      lines.push(`• Kostenlose Selbstabholung vor Ort nach Vereinbarung.`);
    }
    lines.push(``);

    if (options.includeDisclaimer) {
      lines.push(`RECHTLICHE INFORMATIONEN:`);
      if (options.isCommercialSeller) {
        lines.push(`Gewerbliches Händlerangebot. Rechnungsstellung erfolgt unter Anwendung der Differenzbesteuerung gem. § 25a UStG (Gebrauchtgegenstände/Sonderregelung).`);
      } else {
        lines.push(`Privatverkauf unter Ausschluss jeglicher Gewährleistung und Sachmängelhaftung.`);
      }
    }

    return lines.join('\n');
  }

  private buildEbayHtml(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions
  ): string {
    return `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #222; line-height: 1.6;">
  <div style="background: #282c37; color: #fff; padding: 20px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 22px;">${item.title}</h1>
    <p style="margin: 5px 0 0 0; color: #a5b4fc; font-size: 14px;">Zustand: ${conditionText}</p>
  </div>
  <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; background: #fff;">
    <h3 style="color: #4f46e5; border-bottom: 2px solid #e0e7ff; padding-bottom: 6px;">Artikeldetails</h3>
    <ul style="padding-left: 20px;">
      ${item.brand ? `<li><strong>Marke:</strong> ${item.brand}</li>` : ''}
      ${item.model ? `<li><strong>Modell:</strong> ${item.model}</li>` : ''}
      <li><strong>Zustand:</strong> ${conditionText}</li>
      ${item.condition_notes ? `<li><strong>Hinweis:</strong> ${item.condition_notes}</li>` : ''}
    </ul>
    <h3 style="color: #4f46e5; border-bottom: 2px solid #e0e7ff; padding-bottom: 6px; margin-top: 20px;">Beschreibung</h3>
    <p style="white-space: pre-line;">${item.description || 'Geprüfter Artikel in einwandfreiem Zustand.'}</p>
    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 12px; color: #64748b;">
      ${options.isCommercialSeller ? 'Gewerblicher Verkauf mit Rechnung (Differenzbesteuerung gem. § 25a UStG). 14 Tage Widerrufsrecht.' : 'Privatverkauf ohne Garantie oder Rücknahme.'}
    </div>
  </div>
</div>`.trim();
  }

  private buildVintedText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions
  ): string {
    const lines: string[] = [];

    lines.push(`✨ ${item.title} ✨`);
    lines.push(``);
    lines.push(`• Zustand: ${conditionText}`);
    if (item.brand) lines.push(`• Marke: ${item.brand}`);
    if (item.category) lines.push(`• Kategorie: ${item.category}`);
    if (item.condition_notes) lines.push(`• Details: ${item.condition_notes}`);
    lines.push(``);

    if (item.description) {
      lines.push(item.description);
      lines.push(``);
    }

    if (options.includeNonSmoking) {
      lines.push(`🚭 Nichtraucherhaushalt & tierfrei`);
    }

    if (options.includeShipping) {
      lines.push(`📦 Schneller Versand (meist innerhalb von 24h)`);
    }

    const tags = this.buildHashtags(item);
    if (tags.length > 0) {
      lines.push(``);
      lines.push(tags.join(' '));
    }

    return lines.join('\n');
  }

  private buildSocialText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions
  ): string {
    const brand = item.brand ? `${item.brand} ` : '';
    return `🔥 Zu verkaufen: ${brand}${item.title}
💵 Preis: ${price.toFixed(2)} € ${options.includeNegotiable ? '(VB)' : '(Festpreis)'}
✨ Zustand: ${conditionText}
📦 Versand oder Abholung möglich!

Bei Interesse gerne PN / Direktnachricht schreiben! 📩
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

  private getPlatformPublishUrl(platform: ListingPlatform): string {
    switch (platform) {
      case 'kleinanzeigen':
        return 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html';
      case 'ebay':
        return 'https://www.ebay.de/sl/sell';
      case 'vinted':
        return 'https://www.vinted.de/items/new';
      case 'social':
        return 'https://www.facebook.com/marketplace/create';
    }
  }

  /**
   * Marks item as listed on a specific platform in ReFlip OS!
   */
  async markItemAsListed(itemId: string, platform: string, listingPrice: number): Promise<void> {
    await this.inventoryService.updateItem(itemId, {
      status: 'listed',
      expected_value: listingPrice,
    });
  }
}
