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
      includeNonSmoking: true,
      includeShipping: true,
      includePickup: true,
      includeNegotiable: true,
    });

    expect(listing.platform).toBe('kleinanzeigen');
    expect(listing.title).toContain('Bosch Professional');
    expect(listing.title).toContain('(VB)');
    expect(listing.description).toContain('Hallo zusammen,');
    expect(listing.description).toContain('Sehr gut');
    expect(listing.description).toContain('75.00 € (Verhandlungsbasis / VB)');
    expect(listing.description).toContain('Ausschluss jeglicher Sachmängelhaftung');
  });

  it('should generate structured eBay listing with clear sections (Chapter 21)', () => {
    const listing = service.generateListing(sampleItem, 'ebay', 75.0, {
      includeDisclaimer: true,
      includeNonSmoking: false,
      includeShipping: true,
      includePickup: true,
      includeNegotiable: false,
    });

    expect(listing.platform).toBe('ebay');
    expect(listing.description).toContain('PRODUKTBESCHREIBUNG');
    expect(listing.description).toContain('HIGHLIGHTS & DETAILS:');
    expect(listing.description).toContain('LIEFERUMFANG:');
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
      includeNonSmoking: true,
      includeShipping: true,
      includePickup: false,
      includeNegotiable: false,
    });

    expect(listing.platform).toBe('vinted');
    expect(listing.hashtags).toBeDefined();
    expect(listing.hashtags).toContain('#vintage');
    expect(listing.hashtags).toContain('#alphaindustries');
  });
});
