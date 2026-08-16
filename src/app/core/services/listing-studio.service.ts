import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { InventoryService } from './inventory.service';
import { InventoryItem, ListingDraft } from '../models/reflip.models';

export interface ListingTemplateOptions {
  includeDisclaimer: boolean;
  includeNonSmoking: boolean;
  includeShipping: boolean;
  includePickup: boolean;
  includeNegotiable: boolean;
  customNotes?: string;
}

export interface GeneratedListing {
  platform: 'kleinanzeigen' | 'ebay' | 'vinted';
  title: string;
  price: number;
  description: string;
  hashtags?: string[];
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
   * Generates a platform-optimized title and description (Kapitel 21 & 22).
   */
  generateListing(
    item: InventoryItem,
    platform: 'kleinanzeigen' | 'ebay' | 'vinted',
    price: number,
    options: ListingTemplateOptions = {
      includeDisclaimer: true,
      includeNonSmoking: true,
      includeShipping: true,
      includePickup: true,
      includeNegotiable: false,
    }
  ): GeneratedListing {
    const conditionGerman = this.getConditionText(item.condition);
    const title = this.buildPlatformTitle(item, platform, options);
    let description = '';

    if (platform === 'kleinanzeigen') {
      description = this.buildKleinanzeigenText(item, price, conditionGerman, options);
    } else if (platform === 'ebay') {
      description = this.buildEbayText(item, price, conditionGerman, options);
    } else {
      description = this.buildVintedText(item, price, conditionGerman, options);
    }

    const hashtags = platform === 'vinted' ? this.buildHashtags(item) : undefined;

    return {
      platform,
      title,
      price,
      description,
      hashtags,
    };
  }

  private buildPlatformTitle(
    item: InventoryItem,
    platform: 'kleinanzeigen' | 'ebay' | 'vinted',
    options: ListingTemplateOptions
  ): string {
    const brand = item.brand ? `${item.brand} ` : '';
    const cond = item.condition === 'new' ? 'NEU / OVP' : item.condition === 'like_new' ? 'WIE NEU' : '';

    if (platform === 'kleinanzeigen') {
      const vb = options.includeNegotiable ? ' (VB)' : '';
      const base = `${brand}${item.title} ${cond}`.trim();
      return `${base}${vb}`.slice(0, 70); // Kleinanzeigen max length
    } else if (platform === 'ebay') {
      const model = item.model ? ` ${item.model}` : '';
      const base = `${brand}${item.title}${model} | ${cond || 'Top Zustand'}`.trim();
      return base.slice(0, 80); // eBay max length
    } else {
      // Vinted
      return `${brand}${item.title}`.trim().slice(0, 60);
    }
  }

  private buildKleinanzeigenText(
    item: InventoryItem,
    price: number,
    conditionText: string,
    options: ListingTemplateOptions
  ): string {
    const lines: string[] = [];

    lines.push(`Hallo zusammen,`);
    lines.push(``);
    lines.push(`ich verkaufe hier meinen/meine ${item.title}.`);
    if (item.brand || item.model) {
      lines.push(`Marke / Modell: ${[item.brand, item.model].filter(Boolean).join(' - ')}`);
    }
    lines.push(`Zustand: ${conditionText}`);
    lines.push(``);

    if (item.description) {
      lines.push(`Details zum Artikel:`);
      lines.push(item.description);
      lines.push(``);
    }

    lines.push(`Preis: ${price.toFixed(2)} € ${options.includeNegotiable ? '(Verhandlungsbasis / VB)' : '(Festpreis)'}`);
    lines.push(``);

    const logistics: string[] = [];
    if (options.includePickup) {
      logistics.push(`• Abholung vor Ort gerne nach Absprache möglich (Barzahlung oder PayPal vor Ort).`);
    }
    if (options.includeShipping) {
      logistics.push(`• Versicherter Versand gegen Kostenübernahme (DHL / Hermes) möglich.`);
    }
    if (logistics.length > 0) {
      lines.push(`Abholung & Versand:`);
      lines.push(...logistics);
      lines.push(``);
    }

    if (options.includeNonSmoking) {
      lines.push(`• Aus einem gepflegten, tierfreien Nichtraucherhaushalt.`);
    }

    if (options.includeDisclaimer) {
      lines.push(``);
      lines.push(`Rechtlicher Hinweis:`);
      lines.push(`Der Verkauf erfolgt unter Ausschluss jeglicher Sachmängelhaftung. Keine Garantie, Gewährleistung oder Rücknahme, da Privatverkauf.`);
    }

    lines.push(``);
    lines.push(`Bei Fragen einfach kurz schreiben – antworte in der Regel sehr schnell!`);

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
    lines.push(`PRODUKTBESCHREIBUNG`);
    lines.push(`=========================================`);
    lines.push(`Artikel: ${item.title}`);
    if (item.brand) lines.push(`Hersteller / Marke: ${item.brand}`);
    if (item.model) lines.push(`Modellbezeichnung: ${item.model}`);
    lines.push(`Zustand: ${conditionText}`);
    lines.push(``);

    lines.push(`HIGHLIGHTS & DETAILS:`);
    if (item.description) {
      lines.push(item.description);
    } else {
      lines.push(`• Hochwertige Verarbeitung und zuverlässige Funktion`);
      lines.push(`• Technisch einwandfrei und sofort einsatzbereit`);
    }
    lines.push(``);

    lines.push(`LIEFERUMFANG:`);
    lines.push(`• 1x ${item.title}`);
    lines.push(``);

    lines.push(`VERSAND & BEZAHLUNG:`);
    if (options.includeShipping) {
      lines.push(`• Schneller und sorgfältig gepolsterter Versand mit Sendungsverfolgung.`);
    }
    if (options.includePickup) {
      lines.push(`• Barzahlung bei Selbstabholung möglich.`);
    }
    lines.push(``);

    if (options.includeDisclaimer) {
      lines.push(`HINWEIS / PRIVATVERKAUF:`);
      lines.push(`Dies ist ein Privatverkauf. Der Artikel wird unter Ausschluss jeglicher Gewährleistung und Sachmängelhaftung verkauft. Umtausch oder Rücknahme sind ausgeschlossen.`);
    }

    return lines.join('\n');
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

    if (options.includeDisclaimer) {
      lines.push(``);
      lines.push(`Privatverkauf – keine Rücknahme oder Garantie.`);
    }

    return lines.join('\n');
  }

  private buildHashtags(item: InventoryItem): string[] {
    const tags: string[] = ['#resell', '#vintage', '#fashion', '#secondhand'];
    if (item.brand) tags.push(`#${item.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    if (item.category) tags.push(`#${item.category.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    return tags;
  }

  private getConditionText(condition: string): string {
    switch (condition) {
      case 'new':
        return 'Neu und originalverpackt (OVP)';
      case 'like_new':
        return 'Wie neu (kaum bis keine Gebrauchsspuren)';
      case 'very_good':
        return 'Sehr gut (leichte, normale Nutzungsspuren)';
      case 'used':
        return 'Gebraucht (voll funktionsfähig, normale Gebrauchsspuren)';
      case 'heavily_used':
        return 'Stark gebraucht (deutliche Gebrauchsspuren, Funktion intakt)';
      case 'defective':
        return 'Defekt / Für Bastler & Ersatzteilgewinnung';
      default:
        return 'Guter Zustand';
    }
  }

  async markItemAsListed(itemId: string, platform: string, listingPrice: number): Promise<void> {
    await this.inventoryService.updateItemStatus(
      itemId,
      'listed',
      `Gelistet auf ${platform} für ${listingPrice.toFixed(2)} €`
    );
  }

  async saveDraft(
    inventoryItemId: string,
    platform: 'ebay' | 'kleinanzeigen' | 'vinted',
    title: string,
    description: string,
    price: number
  ): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client.from('listing_drafts').insert({
        inventory_item_id: inventoryItemId,
        platform,
        title,
        description,
        price,
        status: 'draft',
      });

      if (error) return { error };

      const ws = this.workspaceService.currentWorkspace();
      if (ws) await this.loadDrafts(ws.id);

      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }
}
