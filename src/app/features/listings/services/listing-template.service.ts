import { Injectable, inject } from '@angular/core';
import type { InventoryItem } from '../../../core/models/flipbase.models';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type {
  GeneratedListingText,
  KleinanzeigenGenerationOptions,
  ListingStyleTone,
} from '../models/listing.models';

@Injectable({ providedIn: 'root' })
export class ListingTemplateService {
  private readonly workspaceService = inject(WorkspaceService);

  generateKleinanzeigenListing(
    item: InventoryItem,
    price: number,
    options: KleinanzeigenGenerationOptions,
  ): GeneratedListingText {
    return {
      title: this.buildTitle(item, options.styleTone).slice(0, 65),
      description: this.buildDescription(item, price, options),
    };
  }

  private buildTitle(item: InventoryItem, styleTone: ListingStyleTone): string {
    const brand = item.brand ? `${item.brand} ` : '';
    const condition =
      item.condition === 'new' ? 'NEU & OVP' : item.condition === 'like_new' ? 'WIE NEU' : '';
    const prefix = styleTone === 'collector' ? 'TOP ' : '';
    return `${prefix}${brand}${item.title} ${condition}`.trim();
  }

  private buildDescription(
    item: InventoryItem,
    price: number,
    options: KleinanzeigenGenerationOptions,
  ): string {
    const lines: string[] = [];

    if (options.styleTone === 'collector') {
      lines.push('Hallo Sammler & Enthusiasten,', '');
      lines.push(`angeboten wird hier: ${item.title} in tollem Erhaltungszustand.`);
    } else if (options.styleTone === 'bargain') {
      lines.push('Schnäppchen-Angebot:', '');
      lines.push(`Ich biete hier einen/eine ${item.title} zum fairen Festpreis an.`);
    } else {
      lines.push('Hallo zusammen,', '');
      lines.push(`zum Verkauf steht hier ein(e) ${item.title}.`);
    }

    if (item.brand || item.model) {
      lines.push(`• Hersteller / Modell: ${[item.brand, item.model].filter(Boolean).join(' - ')}`);
    }
    lines.push(`• Zustand: ${this.getConditionText(item.condition)}`);
    if (item.condition_notes) {
      lines.push(`• Zustandsdetails: ${item.condition_notes}`);
    }
    lines.push('');

    if (item.description) {
      lines.push('Beschreibung:', item.description, '');
    }

    lines.push(`Preis: ${price.toFixed(2)} € (Festpreis)`, '');

    if (options.includeNonSmoking) {
      lines.push('• Gepflegter Nichtraucherhaushalt ohne Haustiere.');
    }
    lines.push('• Abholung vor Ort nach Absprache oder versicherter Versand möglich.');

    if (options.includeDisclaimer) {
      lines.push('', 'Rechtlicher Hinweis:', this.taxNotice());
    }

    return lines.join('\n');
  }

  private getConditionText(condition: InventoryItem['condition']): string {
    switch (condition) {
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

  private taxNotice(): string {
    switch (this.workspaceService.currentWorkspace()?.tax_mode) {
      case 'kleinunternehmer_19':
        return 'Gebrauchtware vom Händler. Kein Ausweis von Umsatzsteuer gem. § 19 UStG (Kleinunternehmerregelung).';
      case 'regular_19':
        return 'Gebrauchtware vom Händler. Preis inklusive der gesetzlichen Umsatzsteuer.';
      case 'diff_25a':
        return 'Geprüfte Gebrauchtware vom Händler. Differenzbesteuerung gem. § 25a UStG.';
      default:
        return 'Gebrauchtware vom Händler.';
    }
  }
}
