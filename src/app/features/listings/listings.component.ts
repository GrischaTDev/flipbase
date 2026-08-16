import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  FileText,
  Copy,
  Check,
  Sparkles,
  Tag,
  Boxes,
  ExternalLink,
  ShieldCheck,
  Send,
  Eye,
  Sliders,
} from 'lucide-angular';
import { ListingStudioService, GeneratedListing, ListingTemplateOptions } from '../../core/services/listing-studio.service';
import { InventoryService } from '../../core/services/inventory.service';
import { InventoryItem } from '../../core/models/reflip.models';

@Component({
  selector: 'app-listings',
  imports: [ReactiveFormsModule, CurrencyPipe, TranslatePipe, LucideAngularModule],
  templateUrl: './listings.component.html',
  styleUrl: './listings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsComponent {
  readonly listingStudio = inject(ListingStudioService);
  readonly inventoryService = inject(InventoryService);

  readonly fileIcon = FileText;
  readonly copyIcon = Copy;
  readonly checkIcon = Check;
  readonly sparklesIcon = Sparkles;
  readonly tagIcon = Tag;
  readonly boxesIcon = Boxes;
  readonly linkIcon = ExternalLink;
  readonly shieldIcon = ShieldCheck;
  readonly sendIcon = Send;
  readonly eyeIcon = Eye;
  readonly slidersIcon = Sliders;

  readonly selectedItemId = signal<string>('');
  readonly selectedPlatform = signal<'kleinanzeigen' | 'ebay' | 'vinted'>('kleinanzeigen');
  readonly customPrice = signal<number>(0);

  // Options toggles
  readonly optDisclaimer = signal<boolean>(true);
  readonly optNonSmoking = signal<boolean>(true);
  readonly optShipping = signal<boolean>(true);
  readonly optPickup = signal<boolean>(true);
  readonly optNegotiable = signal<boolean>(false);

  // Copy feedbacks
  readonly copiedTitle = signal<boolean>(false);
  readonly copiedDesc = signal<boolean>(false);
  readonly isMarkingListed = signal<boolean>(false);
  readonly markSuccess = signal<boolean>(false);

  // Selected item
  readonly selectedItem = computed<InventoryItem | null>(() => {
    const id = this.selectedItemId();
    if (!id) {
      // Default to first unlisted item if available
      const unlisted = this.inventoryService.items().find((i) => i.status !== 'listed' && i.status !== 'sold');
      return unlisted || this.inventoryService.items()[0] || null;
    }
    return this.inventoryService.items().find((i) => i.id === id) || null;
  });

  // Generated listing
  readonly generatedListing = computed<GeneratedListing | null>(() => {
    const item = this.selectedItem();
    if (!item) return null;

    const price = this.customPrice() > 0 ? this.customPrice() : (Number(item.expected_value) || item.total_item_cost || 50);
    const options: ListingTemplateOptions = {
      includeDisclaimer: this.optDisclaimer(),
      includeNonSmoking: this.optNonSmoking(),
      includeShipping: this.optShipping(),
      includePickup: this.optPickup(),
      includeNegotiable: this.optNegotiable(),
    };

    return this.listingStudio.generateListing(item, this.selectedPlatform(), price, options);
  });

  selectItem(item: InventoryItem): void {
    this.selectedItemId.set(item.id);
    this.customPrice.set(Number(item.expected_value) || item.total_item_cost || 50);
    this.markSuccess.set(false);
  }

  async copyToClipboard(text: string, type: 'title' | 'desc'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'title') {
        this.copiedTitle.set(true);
        setTimeout(() => this.copiedTitle.set(false), 2000);
      } else {
        this.copiedDesc.set(true);
        setTimeout(() => this.copiedDesc.set(false), 2000);
      }
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  }

  async onMarkAsListed(): Promise<void> {
    const item = this.selectedItem();
    const listing = this.generatedListing();
    if (!item || !listing) return;

    this.isMarkingListed.set(true);
    await this.listingStudio.markItemAsListed(item.id, listing.platform, listing.price);
    await this.listingStudio.saveDraft(item.id, listing.platform, listing.title, listing.description, listing.price);

    this.isMarkingListed.set(false);
    this.markSuccess.set(true);
  }
}
