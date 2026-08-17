import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ListingStudioService } from './listing-studio.service';
import { InventoryItem } from '../models/reflip.models';

describe('Listing Studio & Multi-Platform Generator (Phase 7)', () => {
  let service: ListingStudioService;

  beforeEach(() => {
    service = Object.create(ListingStudioService.prototype);
  });

  const sampleItem: InventoryItem = {
    id: 'item-bosch-1',
    workspace_id: 'ws-1',
    title: 'Akku-Bohrschrauber GSR 18V-55',
    brand: 'Bosch Professional',
    model: 'GSR 18V-55',
    category: 'Werkzeug',
    condition: 'very_good',
    status: 'ready',
    allocated_purchase_cost: 35.0,
    expected_value: 75.0,
    description: 'Inklusive 2x 2.0Ah Akku und Ladegerät im Koffer.',
  };

  it('should generate optimized Kleinanzeigen listing with VB and polite tone (Chapter 21)', () => {
    const listing = service.generateListing(sampleItem, 'kleinanzeigen', 75.0, {
      includeDisclaimer: true,
      isCommercialSeller: false,
      includeNonSmoking: true,
      includeShipping: true,
      includePickup: true,
      includeNegotiable: true,
      styleTone: 'dealer',
    });

    expect(listing.platform).toBe('kleinanzeigen');
    expect(listing.title).toContain('Bosch Professional');
    expect(listing.title).toContain('(VB)');
    expect(listing.description).toContain('Hallo zusammen,');
    expect(listing.description).toContain('Sehr gut');
    expect(listing.description).toContain('75.00 € (Verhandlungsbasis / VB)');
    expect(listing.description).toContain('Sachmängelhaftung');
  });

  it('should generate structured eBay listing with clear sections and HTML template (Chapter 21)', () => {
    const listing = service.generateListing(sampleItem, 'ebay', 75.0, {
      includeDisclaimer: true,
      isCommercialSeller: true,
      includeNonSmoking: false,
      includeShipping: true,
      includePickup: true,
      includeNegotiable: false,
      styleTone: 'dealer',
    });

    expect(listing.platform).toBe('ebay');
    expect(listing.description).toContain('PRODUKTBESCHREIBUNG');
    expect(listing.description).toContain('HIGHLIGHTS');
    expect(listing.description).toContain('LIEFERUMFANG:');
    expect(listing.htmlDescription).toBeDefined();
    expect(listing.htmlDescription).toContain('Artikeldetails');
  });

  it('should generate fashion/lifestyle Vinted listing with hashtags (Chapter 21)', () => {
    const jacketItem: InventoryItem = {
      id: 'item-jacket-1',
      workspace_id: 'ws-1',
      title: 'Vintage Bomberjacke',
      brand: 'Alpha Industries',
      category: 'Jacken',
      condition: 'very_good',
      status: 'ready',
      allocated_purchase_cost: 20.0,
      expected_value: 65.0,
    };

    const listing = service.generateListing(jacketItem, 'vinted', 65.0, {
      includeDisclaimer: true,
      isCommercialSeller: false,
      includeNonSmoking: true,
      includeShipping: true,
      includePickup: false,
      includeNegotiable: false,
      styleTone: 'casual',
    });

    expect(listing.platform).toBe('vinted');
    expect(listing.hashtags).toBeDefined();
    expect(listing.hashtags).toContain('#vintage');
    expect(listing.hashtags).toContain('#alphaindustries');
  });

  it('should generate social media teaser with hashtags and emojis', () => {
    const listing = service.generateListing(sampleItem, 'social', 75.0, {
      includeDisclaimer: false,
      isCommercialSeller: false,
      includeNonSmoking: true,
      includeShipping: true,
      includePickup: true,
      includeNegotiable: false,
      styleTone: 'bargain',
    });

    expect(listing.platform).toBe('social');
    expect(listing.description).toContain('🔥 Zu verkaufen');
    expect(listing.description).toContain('75.00 €');
  });
});
