import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideArrowLeft as ArrowLeft,
  LucideShoppingBag as ShoppingBag,
  LucideTag as Tag,
  LucideShare2 as Share2,
  LucideCheck as Check,
} from '@lucide/angular';
import { StoreService } from '../../../../core/services/store.service';
import { MediaService } from '../../../../core/services/media.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { SellableItemRef } from '../../../../core/models/store.models';
import { ProductPageSeoService } from '../../services/product-page-seo.service';
import { productStorePath } from '../../../../core/utils/product-seo';
import { CatalogService } from '../../../../core/services/catalog.service';

interface ProductPhoto {
  readonly id: string;
  readonly path: string;
}

@Component({
  selector: 'app-store-item-detail',
  imports: [RouterLink, CurrencyPipe, LucideDynamicIcon],
  providers: [ProductPageSeoService],
  templateUrl: './store-item-detail.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreItemDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly storeService = inject(StoreService);
  readonly mediaService = inject(MediaService);
  private readonly catalog = inject(CatalogService);
  private readonly workspace = inject(WorkspaceService);
  private readonly seo = inject(ProductPageSeoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly loadedPhotos = signal<{
    item: SellableItemRef;
    workspaceId: string;
    photos: readonly ProductPhoto[];
  } | null>(null);
  private readonly failedImageUrls = signal<ReadonlySet<string>>(new Set());
  readonly imageError = signal(false);
  readonly imagesLoading = signal(false);
  readonly shareError = signal(false);
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  readonly backIcon = ArrowLeft;
  readonly bagIcon = ShoppingBag;
  readonly tagIcon = Tag;
  readonly shareIcon = Share2;
  readonly copiedIcon = Check;

  readonly activeImageIndex = signal<number>(0);
  readonly linkCopied = signal<boolean>(false);

  readonly item = computed<SellableItemRef | null>(() => {
    const id = this.params().get('id');
    if (!id) return null;
    return this.storeService.publicProducts().find((product) => product.id === id) ?? null;
  });
  readonly variantChoices = computed(() => {
    const current = this.item();
    if (!current?.variantGroupId) return [];
    const sellableIds = new Set(this.storeService.publicProducts().map((item) => item.id));
    return this.catalog
      .products()
      .filter(
        (product) =>
          product.workspace_id === current.workspaceId &&
          product.variant_group_id === current.variantGroupId &&
          product.is_public_store &&
          !product.archived_at,
      )
      .map((product) => ({
        id: product.id,
        size: product.size,
        color: product.color,
        urlHandle: product.url_handle,
        available: sellableIds.has(product.id),
      }));
  });
  readonly productStorePath = productStorePath;

  readonly images = computed(() => {
    const loaded = this.loadedPhotos();
    return loaded?.item === this.item() &&
      loaded?.workspaceId === this.workspace.currentWorkspace()?.id
      ? loaded.photos
      : [];
  });
  readonly activePhoto = computed(() => this.images()[this.activeImageIndex()] ?? this.images()[0]);
  readonly activeImageUrl = computed(() => {
    const photo = this.activePhoto();
    return photo ? this.photoUrl(photo.path) : '';
  });
  readonly imageDisplayError = computed(() => this.imageError() || this.failedImageUrls().size > 0);

  photoUrl(path: string): string {
    const url = this.mediaService.getMediaUrl(path);
    return this.failedImageUrls().has(url) ? '' : url;
  }

  onImageError(path: string, url: string): void {
    if (this.failedImageUrls().has(url)) return;
    this.failedImageUrls.update((previous) => new Set([...previous, url]));
    this.mediaService.reportMediaFailure(path);
  }

  constructor() {
    effect((onCleanup) => {
      const item = this.item();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      this.activeImageIndex.set(0);
      this.loadedPhotos.set(null);
      this.failedImageUrls.set(new Set());
      this.imageError.set(false);
      this.imagesLoading.set(false);
      let current = true;
      onCleanup(() => {
        current = false;
      });
      if (!item || !workspaceId) return;
      if (item.kind === 'inventory_item') {
        const photos = [...(item.media ?? [])].sort(
          (a, b) =>
            Number(b.is_primary) - Number(a.is_primary) ||
            (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );
        this.loadedPhotos.set({
          item,
          workspaceId,
          photos: photos.map((photo) => ({ id: photo.id, path: photo.storage_path })),
        });
        return;
      }
      this.imagesLoading.set(true);
      void this.mediaService
        .loadProductMedia(item.variantGroupId ?? item.id)
        .then((photos) => {
          if (!current || this.workspace.currentWorkspace()?.id !== workspaceId) return;
          this.loadedPhotos.set({
            item,
            workspaceId,
            photos: photos
              .filter(
                (photo) =>
                  photo.workspace_id === workspaceId &&
                  photo.catalog_product_id === (item.variantGroupId ?? item.id),
              )
              .sort(
                (a, b) =>
                  Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
              )
              .map((photo) => ({ id: photo.id, path: photo.storage_path })),
          });
        })
        .catch(() => {
          if (current) this.imageError.set(true);
        })
        .finally(() => {
          if (current) this.imagesLoading.set(false);
        });
    });
    effect(() => this.seo.update(this.item(), this.storeService.storeSettings().storeName));
    this.destroyRef.onDestroy(() => clearTimeout(this.copyTimer));
  }

  getConditionBadge(condition?: string): { label: string; class: string } {
    switch (condition) {
      case 'new':
        return {
          label: 'Neu & Originalverpackt',
          class: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'like_new':
        return {
          label: 'Wie neu (Keine Gebrauchsspuren)',
          class: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'very_good':
        return {
          label: 'Sehr gut (Minimale Spuren)',
          class: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'used':
        return {
          label: 'Geprüfter Gebrauchtzustand',
          class: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'heavily_used':
        return {
          label: 'Starke Gebrauchsspuren',
          class: 'bg-orange-50 text-orange-700 border-orange-200',
        };
      default:
        return {
          label: 'Zustand nicht angegeben',
          class: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  }

  getItemPrice(item: SellableItemRef): number {
    return item.unitPrice ?? 0;
  }

  onAddToCart(item: SellableItemRef): void {
    if (this.item() !== item) return;
    this.storeService.addToCart(item);
  }

  onBuyNow(item: SellableItemRef): void {
    if (this.item() !== item) return;
    this.storeService.addToCart(item);
    this.router.navigate(['/shop/checkout']);
  }

  async onShareProduct(): Promise<void> {
    this.shareError.set(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (this.destroyRef.destroyed) return;
      this.linkCopied.set(true);
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.linkCopied.set(false), 2500);
    } catch {
      if (!this.destroyRef.destroyed) this.shareError.set(true);
    }
  }
}
