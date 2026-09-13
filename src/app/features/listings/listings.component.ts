import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideFileText as FileText,
  LucideCopy as Copy,
  LucideCheck as Check,
  LucideSparkles as Sparkles,
  LucideTag as Tag,
  LucideBoxes as Boxes,
  LucideExternalLink as ExternalLink,
  LucideShieldCheck as ShieldCheck,
  LucideSend as Send,
  LucideEye as Eye,
  LucideSliders as Sliders,
  LucideCode as Code,
  LucideImage as ImageIcon,
  LucideShare2 as Share2,
  LucideZap as Zap,
  LucideGauge as Gauge,
  LucideCheckCircle2 as CheckCircle2,
  LucideAlertCircle as AlertCircle,
  LucideTrendingUp as TrendingUp,
  LucideStore as Store,
  LucideBriefcase as Briefcase,
  LucideGamepad2 as Gamepad2,
  LucideShirt as Shirt,
  LucideLightbulb as Lightbulb,
  LucideTruck as Truck,
  LucideMapPin as MapPin,
  LucideDownload as Download,
  LucideHelpCircle as HelpCircle,
  LucideRocket as Rocket,
  LucideRefreshCw as RefreshCw,
} from '@lucide/angular';
import {
  ListingStudioService,
  GeneratedListing,
  ListingPlatform,
  ListingStyleTone,
  ListingPriceType,
  KleinanzeigenListingPayload,
  SeoOptimizationResult,
} from '../../core/services/listing-studio.service';
import { InventoryService } from '../../core/services/inventory.service';
import { MediaService } from '../../core/services/media.service';
import { InventoryItem } from '../../core/models/flipbase.models';
import { isSellableInventoryItem } from '../../core/models/inventory-sellability';

import { CustomCheckboxComponent } from '../../shared/components/custom-checkbox/custom-checkbox.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';

@Component({
  selector: 'app-listings',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    TranslatePipe,
    LucideDynamicIcon,
    CustomCheckboxComponent,
    CustomSelectComponent,
  ],
  templateUrl: './listings.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsComponent {
  /**
   * Vorgaben fuer die eigenen Auswahlfelder.
   *
   * Die Liste haengt am Bestand und aendert sich zur Laufzeit, deshalb ein
   * berechneter Wert. Ein natives Auswahlfeld klappt eine Liste auf, die das
   * Betriebssystem zeichnet - hell und mit fremder Schrift; deshalb
   * uebernimmt `app-custom-select`.
   */
  readonly artikelOptionen = computed<SelectOption<string>[]>(() =>
    this.availableItems().map((it) => ({
      value: it.id,
      label: `${it.title} (EK: ${(it.total_item_cost ?? 0).toFixed(2).replace('.', ',')} €)`,
    })),
  );

  readonly listingStudio = inject(ListingStudioService);
  readonly inventoryService = inject(InventoryService);
  readonly mediaService = inject(MediaService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

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
  readonly storeIcon = Store;
  readonly briefcaseIcon = Briefcase;
  readonly gamepadIcon = Gamepad2;
  readonly shirtIcon = Shirt;
  readonly lightbulbIcon = Lightbulb;
  readonly rocketIcon = Rocket;
  readonly downloadIcon = Download;
  readonly mapPinIcon = MapPin;
  readonly truckIcon = Truck;
  readonly helpCircleIcon = HelpCircle;
  readonly refreshIcon = RefreshCw;

  readonly selectedItemId = signal<string>('');
  readonly selectedPlatform = signal<ListingPlatform>('kleinanzeigen');
  readonly selectedTone = signal<ListingStyleTone>('dealer');
  readonly customPrice = signal<number | null>(null);
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

  // Extension Integration
  readonly isExtensionInstalled = signal<boolean>(false);
  readonly priceType = signal<ListingPriceType>('FIXED');
  readonly postalCode = signal<string>('');
  readonly shippingPrice = signal<number>(5.49);
  readonly isPublishingViaExtension = signal<boolean>(false);
  readonly showExtensionHelpModal = signal<boolean>(false);

  readonly availableItems = computed<InventoryItem[]>(() => {
    return this.inventoryService.items().filter(isSellableInventoryItem);
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
    const price = this.listingPrice(item);

    if (price === null) return null;
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
      this.currentDesc(),
    );
  });

  constructor() {
    effect(() => {
      const item = this.selectedItem();
      if (item && this.customPrice() === null) {
        this.customPrice.set(this.suggestedPrice(item));
      }
    });

    if (typeof window !== 'undefined') {
      const messageHandler = (event: MessageEvent) => {
        if (event.source !== window || !event.data || typeof event.data !== 'object') return;
        if (event.data.type === 'FLIPBASE_EXTENSION_STATUS') {
          this.isExtensionInstalled.set(Boolean(event.data.installed));
        }
        if (event.data.type === 'FLIPBASE_PUBLISH_KLEINANZEIGEN_RESULT') {
          this.isPublishingViaExtension.set(false);
          if (event.data.success) {
            this.toast.success(
              'Übertragung an Kleinanzeigen gestartet!',
              'Der Tab wurde geöffnet und die Daten werden ausgefüllt.',
            );
          } else {
            this.toast.error(
              'Fehler bei der Übertragung',
              event.data.error || 'Unbekannter Fehler',
            );
          }
        }
      };

      const customEventHandler = () => {
        this.isExtensionInstalled.set(true);
      };

      window.addEventListener('message', messageHandler);
      window.addEventListener('flipbase:extension-ready', customEventHandler);

      const checkInterval = setInterval(() => {
        if (
          typeof document !== 'undefined' &&
          document.documentElement.dataset['flipbaseExtensionInstalled'] === 'true'
        ) {
          this.isExtensionInstalled.set(true);
        }
        window.postMessage({ type: 'FLIPBASE_CHECK_EXTENSION' }, '*');
      }, 1000);

      if (
        typeof document !== 'undefined' &&
        document.documentElement.dataset['flipbaseExtensionInstalled'] === 'true'
      ) {
        this.isExtensionInstalled.set(true);
      }
      window.postMessage({ type: 'FLIPBASE_CHECK_EXTENSION' }, '*');

      this.destroyRef?.onDestroy?.(() => {
        clearInterval(checkInterval);
        window.removeEventListener('message', messageHandler);
        window.removeEventListener('flipbase:extension-ready', customEventHandler);
      });
    }
  }

  checkExtensionNow(): void {
    if (
      typeof document !== 'undefined' &&
      document.documentElement.dataset['flipbaseExtensionInstalled'] === 'true'
    ) {
      this.isExtensionInstalled.set(true);
      this.showExtensionHelpModal.set(false);
      this.toast.success('Erweiterung erkannt!', 'Der 1-Klick-Assistent ist einsatzbereit.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.postMessage({ type: 'FLIPBASE_CHECK_EXTENSION' }, '*');
      setTimeout(() => {
        if (
          typeof document !== 'undefined' &&
          document.documentElement.dataset['flipbaseExtensionInstalled'] === 'true'
        ) {
          this.isExtensionInstalled.set(true);
          this.showExtensionHelpModal.set(false);
          this.toast.success('Erweiterung erkannt!', 'Der 1-Klick-Assistent ist einsatzbereit.');
        } else {
          this.toast.info(
            'Erweiterung noch nicht aktiv',
            'Klicke in chrome://extensions auf das Aktualisieren-Symbol (⟳) bei der Erweiterung und lade diese Seite neu.',
          );
        }
      }, 250);
    }
  }

  onSelectItem(id: string): void {
    this.selectedItemId.set(id);
    this.customTitleOverride.set(null);
    this.customDescOverride.set(null);
    const item = this.availableItems().find((i) => i.id === id);
    if (item) {
      this.customPrice.set(this.suggestedPrice(item));
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

    const price = this.listingPrice(item);
    if (price === null) {
      this.meldeFehler('Verkaufspreis fehlt.', new Error('Bitte einen Verkaufspreis eingeben.'));
      return;
    }
    this.isMarkingListed.set(true);
    try {
      const { error } = await this.listingStudio.markItemAsListed(
        item.id,
        this.selectedPlatform(),
        price,
      );
      if (error) {
        this.meldeFehler('Artikel konnte nicht als gelistet markiert werden.', error);
        return;
      }
      this.toast.success('Artikel wurde als gelistet markiert.');
    } catch (error: unknown) {
      this.meldeFehler('Artikel konnte nicht als gelistet markiert werden.', error);
    } finally {
      this.isMarkingListed.set(false);
    }
  }

  async publishToStore(): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;

    const price = this.listingPrice(item);
    if (price === null) {
      this.meldeFehler('Verkaufspreis fehlt.', new Error('Bitte einen Verkaufspreis eingeben.'));
      return;
    }
    this.isMarkingListed.set(true);
    try {
      const { error } = await this.listingStudio.publishToCustomStore(item.id, price);
      if (error) {
        this.meldeFehler('Artikel konnte nicht im Shop veröffentlicht werden.', error);
        return;
      }
      this.toast.success('Artikel wurde im Shop veröffentlicht.');
    } catch (error: unknown) {
      this.meldeFehler('Artikel konnte nicht im Shop veröffentlicht werden.', error);
    } finally {
      this.isMarkingListed.set(false);
    }
  }

  openPlatformPublish(): void {
    const gen = this.baseGeneratedListing();
    if (gen?.platformUrl) {
      window.open(gen.platformUrl, '_blank');
    }
  }

  private suggestedPrice(item: InventoryItem): number | null {
    return (
      item.expected_value ??
      (item.allocated_purchase_cost === null
        ? null
        : Number((item.allocated_purchase_cost * 1.5).toFixed(2)))
    );
  }

  private listingPrice(item: InventoryItem): number | null {
    const price = this.customPrice() ?? this.suggestedPrice(item);
    return price !== null && Number.isFinite(price) && price >= 0 ? price : null;
  }

  getMediaUrl(storagePath?: string | null): string {
    if (!storagePath) return '';
    return this.mediaService?.getMediaUrl(storagePath) || storagePath;
  }

  setPriceType(type: ListingPriceType): void {
    this.priceType.set(type);
  }

  onPostalCodeInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.postalCode.set(val);
  }

  onShippingPriceInput(event: Event): void {
    const price = (event.target as HTMLInputElement).valueAsNumber;
    this.shippingPrice.set(Number.isFinite(price) ? price : 5.49);
  }

  async publishViaExtension(): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;

    const price = this.listingPrice(item);
    if (price === null) {
      this.toast.error('Verkaufspreis fehlt.', 'Bitte gib einen gültigen Verkaufspreis an.');
      return;
    }

    this.isPublishingViaExtension.set(true);

    const images = (item.media ?? []).map((m, idx) => ({
      url: this.getMediaUrl(m.storage_path),
      name: m.file_name || `artikel-bild-${idx + 1}.jpg`,
    }));

    const payload: KleinanzeigenListingPayload = {
      itemId: item.id,
      title: this.currentTitle(),
      description: this.currentDesc(),
      price,
      priceType: this.priceType(),
      postalCode: this.postalCode().trim() || undefined,
      shippingType:
        this.optShipping() && this.optPickup()
          ? 'both'
          : this.optShipping()
            ? 'shipping'
            : 'pickup',
      shippingPrice: this.optShipping() ? this.shippingPrice() : undefined,
      images,
    };

    this.listingStudio.publishViaExtension(payload);

    setTimeout(() => {
      if (this.isPublishingViaExtension()) {
        this.isPublishingViaExtension.set(false);
        this.toast.info(
          'Inserat an Erweiterung übergeben',
          'Kleinanzeigen wird im neuen Tab vorbereitet.',
        );
      }
    }, 1200);
  }

  onPriceInput(event: Event): void {
    const price = (event.target as HTMLInputElement).valueAsNumber;
    this.customPrice.set(Number.isFinite(price) ? price : null);
  }

  private meldeFehler(titel: string, error: unknown): void {
    if (this.syncStatus.istZentralGemeldet(error)) return;
    this.toast.error(titel, error instanceof Error ? error.message : String(error));
  }
}
