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
  Truck,
  ShieldCheck,
  RotateCcw,
  Star,
  ChevronDown,
  ArrowRight,
  Flame,
  Wrench,
  Laptop,
  Headphones,
  Gamepad2,
  Home,
  Check,
  BadgePercent,
  HelpCircle,
  Mail,
  Zap,
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { InventoryItem } from '../../../../core/models/reflip.models';

interface FaqItem {
  question: string;
  answer: string;
}

interface Testimonial {
  name: string;
  city: string;
  rating: number;
  item: string;
  text: string;
}

@Component({
  selector: 'app-store-catalog',
  imports: [RouterLink, ReactiveFormsModule, CurrencyPipe, LucideAngularModule],
  templateUrl: './store-catalog.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreCatalogComponent {
  readonly storeService = inject(StoreService);

  // Lucide Icons
  readonly searchIcon = Search;
  readonly filterIcon = SlidersHorizontal;
  readonly bagIcon = ShoppingBag;
  readonly checkCircleIcon = CheckCircle2;
  readonly sparklesIcon = Sparkles;
  readonly tagIcon = Tag;
  readonly eyeIcon = Eye;
  readonly truckIcon = Truck;
  readonly shieldIcon = ShieldCheck;
  readonly returnIcon = RotateCcw;
  readonly starIcon = Star;
  readonly chevronDownIcon = ChevronDown;
  readonly arrowRightIcon = ArrowRight;
  readonly flameIcon = Flame;
  readonly wrenchIcon = Wrench;
  readonly laptopIcon = Laptop;
  readonly headphonesIcon = Headphones;
  readonly gamepadIcon = Gamepad2;
  readonly homeIcon = Home;
  readonly checkIcon = Check;
  readonly percentIcon = BadgePercent;
  readonly helpIcon = HelpCircle;
  readonly mailIcon = Mail;
  readonly zapIcon = Zap;

  // Filter & Search Controls
  readonly searchControl = new FormControl('');
  readonly selectedCategory = signal<string>('all');
  readonly selectedCondition = signal<string>('all');
  readonly sortBy = signal<'newest' | 'price_asc' | 'price_desc' | 'savings'>('newest');

  // Interactive UI State
  readonly openFaqIndex = signal<number | null>(null);
  readonly addedItemId = signal<string | null>(null);
  readonly newsletterEmail = new FormControl('');
  readonly newsletterSubscribed = signal<boolean>(false);

  // Dynamic Categories from available store products
  readonly categories = computed(() => {
    const items = this.storeService.publicProducts();
    const cats = new Set<string>();
    for (const item of items) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats);
  });

  // Top Deals / Featured Products (First 4 items or like_new / new)
  readonly featuredDeals = computed(() => {
    const items = this.storeService.publicProducts();
    return items.slice(0, 4);
  });

  // Filtered & Sorted Products
  readonly filteredProducts = computed(() => {
    let items = [...this.storeService.publicProducts()];
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
          i.category?.toLowerCase().includes(query) ||
          i.sku?.toLowerCase().includes(query)
      );
    }

    if (cat !== 'all') {
      items = items.filter((i) => i.category === cat);
    }

    if (cond !== 'all') {
      items = items.filter((i) => i.condition === cond);
    }

    // Sorting
    return items.sort((a, b) => {
      const priceA = a.expected_value ?? a.allocated_purchase_cost * 1.5;
      const priceB = b.expected_value ?? b.allocated_purchase_cost * 1.5;
      const origA = this.getOriginalPrice(a);
      const origB = this.getOriginalPrice(b);
      const savingsA = origA - priceA;
      const savingsB = origB - priceB;

      if (sort === 'price_asc') return priceA - priceB;
      if (sort === 'price_desc') return priceB - priceA;
      if (sort === 'savings') return savingsB - savingsA;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      return timeB - timeA;
    });
  });

  // Testimonials
  readonly testimonials: Testimonial[] = [
    {
      name: 'Michael K.',
      city: 'Berlin',
      rating: 5,
      item: 'Bosch Professional Akku-Bohrschrauber',
      text: 'Super schneller Versand! Das Gerät war wie neu, sauber verpackt und funktioniert einwandfrei. Werde definitiv wieder bestellen!',
    },
    {
      name: 'Sarah T.',
      city: 'München',
      rating: 5,
      item: 'Apple AirPods Pro (2. Gen)',
      text: 'Erst war ich skeptisch wegen Second-Hand, aber der Zustand war absolut makellos. Rechnung mit § 25a UStG lag direkt bei. Top Händler!',
    },
    {
      name: 'Dennis W.',
      city: 'Hamburg',
      rating: 5,
      item: 'Sony WH-1000XM4 Kopfhörer',
      text: 'Schnäppchen des Jahres! Über 100€ ggü. Neupreis gespart. Nach 2 Tagen war das Paket bei mir. 5 Sterne!',
    },
  ];

  // FAQs
  readonly faqs: FaqItem[] = [
    {
      question: 'Wie werden die Artikel vor dem Verkauf geprüft?',
      answer:
        'Jeder Artikel durchläuft vor der Freigabe einen mehrstufigen Qualitätscheck: Technische Funktionstests, Reinigung, Prüfung aller Anschlüsse und Zubehörteile sowie eine ehrliche optische Zustandsklassifizierung.',
    },
    {
      question: 'Welche Zahlungsmethoden stehen zur Verfügung?',
      answer:
        'Du kannst sicher und bequem mit PayPal, Kreditkarte (Visa, Mastercard, Amex via Stripe), Klarna / Sofortüberweisung, normaler Banküberweisung oder in bar bei persönlicher Abholung bezahlen.',
    },
    {
      question: 'Wie schnell erfolgt der Versand und was kostet er?',
      answer:
        'Wir versenden alle Bestellungen innerhalb von 24 Stunden per DHL Paket oder Hermes inklusive Sendungsverfolgung. Ab einem Bestellwert von 50 € ist der Versand innerhalb Deutschlands komplett kostenlos.',
    },
    {
      question: 'Habe ich ein Rückgaberecht?',
      answer:
        'Ja, selbstverständlich! Als gewerblicher Händler gewähren wir dir das volle gesetzliche 14-tägige Widerrufsrecht. Sollte dir ein Artikel nicht gefallen, kannst du ihn unkompliziert zurücksenden.',
    },
    {
      question: 'Wie wird die Mehrwertsteuer auf der Rechnung ausgewiesen?',
      answer:
        'Da es sich um geprüfte Gebrauchtgegenstände handelt, unterliegen unsere Verkäufe der Differenzbesteuerung nach § 25a UStG. Du erhältst eine ordnungsgemäße Rechnung, die USt. wird jedoch nicht gesondert ausgewiesen.',
    },
  ];

  getConditionBadge(condition: string): { label: string; class: string } {
    switch (condition) {
      case 'new':
        return { label: 'Neu & OVP', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'like_new':
        return { label: 'Wie neu', class: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'very_good':
        return { label: 'Sehr gut', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'used':
        return { label: 'Gebraucht', class: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'heavily_used':
        return { label: 'Stark gebraucht', class: 'bg-orange-50 text-orange-700 border-orange-200' };
      default:
        return { label: 'Geprüft', class: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  }

  getItemPrice(item: InventoryItem): number {
    return item.expected_value ?? item.allocated_purchase_cost * 1.5;
  }

  getOriginalPrice(item: InventoryItem): number {
    const price = this.getItemPrice(item);
    // Estimated MSRP multiplier based on condition
    switch (item.condition) {
      case 'new':
        return Math.round(price * 1.2);
      case 'like_new':
        return Math.round(price * 1.4);
      case 'very_good':
        return Math.round(price * 1.6);
      default:
        return Math.round(price * 1.8);
    }
  }

  getDiscountPercent(item: InventoryItem): number {
    const orig = this.getOriginalPrice(item);
    const curr = this.getItemPrice(item);
    if (orig <= curr) return 0;
    return Math.round(((orig - curr) / orig) * 100);
  }

  getItemThumbnail(item: InventoryItem): string | null {
    if (item.media && item.media.length > 0) {
      const primary = item.media.find((m) => m.is_primary) || item.media[0];
      return primary.storage_path;
    }
    return null;
  }

  onAddToCart(item: InventoryItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.storeService.addToCart(item, 1);
    this.addedItemId.set(item.id);
    setTimeout(() => {
      if (this.addedItemId() === item.id) {
        this.addedItemId.set(null);
      }
    }, 2000);
  }

  toggleFaq(index: number): void {
    if (this.openFaqIndex() === index) {
      this.openFaqIndex.set(null);
    } else {
      this.openFaqIndex.set(index);
    }
  }

  onSubscribeNewsletter(): void {
    if (this.newsletterEmail.valid && this.newsletterEmail.value) {
      this.newsletterSubscribed.set(true);
      this.newsletterEmail.reset();
    }
  }

  scrollToCatalog(): void {
    const el = document.getElementById('catalog-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
