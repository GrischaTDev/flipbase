import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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
  Code,
  Image as ImageIcon,
  Share2,
  Zap,
  Gauge,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from 'lucide-angular';
import {
  ListingStudioService,
  GeneratedListing,
  ListingPlatform,
  ListingStyleTone,
  SeoOptimizationResult,
} from '../../core/services/listing-studio.service';
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
  readonly codeIcon = Code;
  readonly imageIcon = ImageIcon;
  readonly shareIcon = Share2;
  readonly zapIcon = Zap;
  readonly gaugeIcon = Gauge;
  readonly checkCircleIcon = CheckCircle2;
  readonly alertCircleIcon = AlertCircle;
  readonly trendingIcon = TrendingUp;

  readonly selectedItemId = signal<string>('');
  readonly selectedPlatform = signal<ListingPlatform>('kleinanzeigen');
  readonly selectedTone = signal<ListingStyleTone>('dealer');
  readonly customPrice = signal<number>(0);
  readonly showHtmlMode = signal<boolean>(false);

  // User edited text overrides
  readonly customTitleOverride = signal<string | null>(null);
  readonly customDescOverride = signal<string | null>(null);
  readonly aiOptimizedApplied = signal<boolean>(false);

  // Template options
  readonly optCommercial = signal<boolean>(true);
  readonly optDisclaimer = signal<boolean>(true);
  readonly optNonSmoking = signal<boolean>(true);
  readonly optShipping = signal<boolean>(true);
  readonly optPickup = signal<boolean>(true);
  readonly optNegotiable = signal<boolean>(false);

  // Feedbacks
  readonly copiedTitle = signal<boolean>(false);
  readonly copiedDesc = signal<boolean>(false);
  readonly copiedAll = signal<boolean>(false);
  readonly isMarkingListed = signal<boolean>(false);

  readonly availableItems = computed<InventoryItem[]>(() => {
    return this.inventoryService
      .items()
      .filter((i) => i.status !== 'sold' && i.status !== 'returned' && i.status !== 'archived');
  });

  readonly selectedItem = computed<InventoryItem | null>(() => {
    const id = this.selectedItemId();
    if (!id) return this.availableItems()[0] || null;
    return this.availableItems().find((i) => i.id === id) || null;
  });

  readonly baseGeneratedListing = computed<GeneratedListing | null>(() => {
    const item = this.selectedItem();
    if (!item) return null;

    const platform = this.selectedPlatform();
    const price = this.customPrice() > 0 ? this.customPrice() : (item.expected_value ?? item.allocated_purchase_cost * 1.5);

    return this.listingStudio.generateListing(item, platform, price, {
      includeDisclaimer: this.optDisclaimer(),
      isCommercialSeller: this.optCommercial(),
      includeNonSmoking: this.optNonSmoking(),
      includeShipping: this.optShipping(),
      includePickup: this.optPickup(),
      includeNegotiable: this.optNegotiable(),
      styleTone: this.selectedTone(),
    });
  });

  readonly currentTitle = computed<string>(() => {
    if (this.customTitleOverride() !== null) {
      return this.customTitleOverride()!;
    }
    return this.baseGeneratedListing()?.title || '';
  });

  readonly currentDesc = computed<string>(() => {
    if (this.customDescOverride() !== null) {
      return this.customDescOverride()!;
    }
    return this.baseGeneratedListing()?.description || '';
  });

  readonly seoAnalysis = computed<SeoOptimizationResult | null>(() => {
    const item = this.selectedItem();
    if (!item) return null;
    return this.listingStudio.analyzeAndOptimizeListing(
      item,
      this.selectedPlatform(),
      this.currentTitle(),
      this.currentDesc()
    );
  });

  constructor() {
    effect(() => {
      const item = this.selectedItem();
      if (item && this.customPrice() === 0) {
        this.customPrice.set(item.expected_value ?? Number((item.allocated_purchase_cost * 1.5).toFixed(2)));
      }
    });
  }

  onSelectItem(id: string): void {
    this.selectedItemId.set(id);
    this.customTitleOverride.set(null);
    this.customDescOverride.set(null);
    const item = this.availableItems().find((i) => i.id === id);
    if (item) {
      this.customPrice.set(item.expected_value ?? Number((item.allocated_purchase_cost * 1.5).toFixed(2)));
    }
  }

  onSelectPlatform(platform: ListingPlatform): void {
    this.selectedPlatform.set(platform);
    this.customTitleOverride.set(null);
    this.customDescOverride.set(null);
  }

  onSelectTone(tone: ListingStyleTone): void {
    this.selectedTone.set(tone);
    this.customTitleOverride.set(null);
    this.customDescOverride.set(null);
  }

  applyAiOptimization(): void {
    const analysis = this.seoAnalysis();
    if (!analysis) return;

    this.customTitleOverride.set(analysis.optimizedTitle);
    this.customDescOverride.set(analysis.optimizedDescription);
    this.aiOptimizedApplied.set(true);
    setTimeout(() => this.aiOptimizedApplied.set(false), 3000);
  }

  onTitleInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.customTitleOverride.set(val);
  }

  onDescInput(event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.customDescOverride.set(val);
  }

  copyToClipboard(text: string, type: 'title' | 'desc' | 'all'): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'title') {
        this.copiedTitle.set(true);
        setTimeout(() => this.copiedTitle.set(false), 2000);
      } else if (type === 'desc') {
        this.copiedDesc.set(true);
        setTimeout(() => this.copiedDesc.set(false), 2000);
      } else {
        this.copiedAll.set(true);
        setTimeout(() => this.copiedAll.set(false), 2000);
      }
    }
  }

  copyAll(): void {
    const title = this.currentTitle();
    const desc = this.currentDesc();
    if (!title && !desc) return;
    const fullText = `${title}\n\n${desc}`;
    this.copyToClipboard(fullText, 'all');
  }

  async markAsListed(): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;

    const price = this.customPrice() > 0 ? this.customPrice() : (item.expected_value ?? item.allocated_purchase_cost * 1.5);
    this.isMarkingListed.set(true);
    await this.listingStudio.markItemAsListed(item.id, this.selectedPlatform(), price);
    this.isMarkingListed.set(false);
  }

  openPlatformPublish(): void {
    const gen = this.baseGeneratedListing();
    if (gen?.platformUrl) {
      window.open(gen.platformUrl, '_blank');
    }
  }
}
