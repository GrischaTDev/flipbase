import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import {
  LucideAngularModule,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  CheckCircle2,
  Sparkles,
  Tag,
  Eye,
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { InventoryItem } from '../../../../core/models/reflip.models';

@Component({
  selector: 'app-store-catalog',
  imports: [RouterLink, ReactiveFormsModule, CurrencyPipe, LucideAngularModule],
  templateUrl: './store-catalog.component.html',
  styleUrl: './store-catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreCatalogComponent {
  readonly storeService = inject(StoreService);

  readonly searchIcon = Search;
  readonly filterIcon = SlidersHorizontal;
  readonly bagIcon = ShoppingBag;
  readonly checkIcon = CheckCircle2;
  readonly sparklesIcon = Sparkles;
  readonly tagIcon = Tag;
  readonly eyeIcon = Eye;

  readonly searchControl = new FormControl('');
  readonly selectedCategory = signal<string>('all');
  readonly selectedCondition = signal<string>('all');
  readonly sortBy = signal<'newest' | 'price_asc' | 'price_desc'>('newest');

  readonly categories = computed(() => {
    const items = this.storeService.publicProducts();
    const cats = new Set<string>();
    for (const item of items) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats);
  });

  readonly filteredProducts = computed(() => {
    let items = this.storeService.publicProducts();
    const query = this.searchControl.value?.toLowerCase().trim() || '';
    const cat = this.selectedCategory();
    const cond = this.selectedCondition();
    const sort = this.sortBy();

    if (query) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          i.brand?.toLowerCase().includes(query) ||
          i.model?.toLowerCase().includes(query) ||
          i.category?.toLowerCase().includes(query)
      );
    }

    if (cat !== 'all') {
      items = items.filter((i) => i.category === cat);
    }

    if (cond !== 'all') {
      items = items.filter((i) => i.condition === cond);
    }

    // Sort
    return items.sort((a, b) => {
      const priceA = a.expected_value ?? a.allocated_purchase_cost * 1.5;
      const priceB = b.expected_value ?? b.allocated_purchase_cost * 1.5;

      if (sort === 'price_asc') return priceA - priceB;
      if (sort === 'price_desc') return priceB - priceA;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      return timeB - timeA;
    });
  });

  getConditionBadge(condition: string): { label: string; class: string } {
    switch (condition) {
      case 'new':
        return { label: 'Neu & OVP', class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'like_new':
        return { label: 'Wie neu', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
      case 'very_good':
        return { label: 'Sehr gut', class: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' };
      case 'used':
        return { label: 'Gebraucht', class: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'heavily_used':
        return { label: 'Stark gebraucht', class: 'bg-orange-500/15 text-orange-400 border-orange-500/30' };
      default:
        return { label: 'Geprüft', class: 'bg-rf-subtle text-rf-text-muted border-rf-border' };
    }
  }

  getItemPrice(item: InventoryItem): number {
    return item.expected_value ?? item.allocated_purchase_cost * 1.5;
  }

  getItemThumbnail(item: InventoryItem): string | null {
    if (item.media && item.media.length > 0) {
      const primary = item.media.find((m) => m.is_primary) || item.media[0];
      return primary.storage_path;
    }
    return null;
  }
}
