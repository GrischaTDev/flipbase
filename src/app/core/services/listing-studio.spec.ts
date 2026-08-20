import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ListingStudioService } from './listing-studio.service';
import { InventoryItem } from '../models/flipbase.models';

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
    expect(listing.htmlDescription).toContain('Artikelübersicht');
    expect(listing.htmlDescription).toContain('Bosch Professional');
  });

  it('should analyze listing SEO score and detect key keywords', () => {
    const analysis = service.analyzeAndOptimizeListing(
      sampleItem,
      'ebay',
      'Bosch Professional Akku-Bohrschrauber GSR 18V-55 Sehr Gut Geprüft',
      'Beschreibung mit • Aufzählung und DHL Versand',
    );

    expect(analysis.score).toBeGreaterThan(60);
    expect(analysis.maxChars).toBe(80);
    expect(analysis.detectedKeywords.length).toBeGreaterThan(0);
    expect(analysis.optimizedTitle).toContain('Bosch Professional');
    expect(analysis.optimizedDescription).toContain('LIEFERUMFANG & HIGHLIGHTS');
  });

  it('should generate optimized Vinted title and hashtags', () => {
    const analysis = service.analyzeAndOptimizeListing(sampleItem, 'vinted');

    expect(analysis.maxChars).toBe(60);
    expect(analysis.optimizedTitle.length).toBeLessThanOrEqual(60);
  });
});
