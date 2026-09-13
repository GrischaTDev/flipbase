import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SellableItemRef } from '../../../core/models/store.models';
import {
  productSeoDescription,
  productSeoTitle,
  productStorePath,
} from '../../../core/utils/product-seo';

/** An die Detailseite gebunden: Metadaten dürfen nicht in die Verwaltung weiterleben. */
@Injectable()
export class ProductPageSeoService {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly originalTitle = this.title.getTitle();
  private lastTitle = this.originalTitle;
  private readonly previousNodes = Array.from(
    this.document.head.querySelectorAll(
      'meta[name="description"], meta[name="robots"], link[rel="canonical"]',
    ),
  );
  private readonly ownedNodes = new Set<Element>();

  constructor() {
    this.previousNodes.forEach((node) => node.remove());
    inject(DestroyRef).onDestroy(() => {
      this.clearNodes();
      this.previousNodes.forEach((node) => this.document.head.appendChild(node));
      if (this.title.getTitle() === this.lastTitle) this.title.setTitle(this.originalTitle);
    });
  }

  update(item: SellableItemRef | null, storeName: string): void {
    this.clearNodes();
    this.lastTitle = item ? productSeoTitle(item.title, item.seoTitle) : storeName;
    this.title.setTitle(this.lastTitle);
    // Der integrierte Shop ist bewusst nur nach Anmeldung erreichbar.
    const robots = this.meta.addTag({ name: 'robots', content: 'noindex, nofollow' }, true);
    if (robots) this.ownedNodes.add(robots);
    if (!item) return;
    const description = productSeoDescription(item.description, item.seoDescription);
    if (description) {
      const tag = this.meta.addTag({ name: 'description', content: description }, true);
      if (tag) this.ownedNodes.add(tag);
    }
    const origin = this.document.location?.origin;
    if (origin && origin !== 'null') {
      const canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      canonical.href = new URL(productStorePath(item.id, item.urlHandle), origin).href;
      this.document.head.appendChild(canonical);
      this.ownedNodes.add(canonical);
    }
  }

  private clearNodes(): void {
    this.ownedNodes.forEach((node) => node.remove());
    this.ownedNodes.clear();
  }
}
