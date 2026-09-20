import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { InventoryItem } from '../../../core/models/flipbase.models';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ListingTemplateService } from './listing-template.service';

describe('ListingTemplateService', () => {
  const item: InventoryItem = {
    id: 'item-bosch-1',
    workspace_id: 'workspace-1',
    title: 'Akku-Bohrschrauber GSR 18V-55 mit umfangreichem Zubehörpaket',
    brand: 'Bosch Professional',
    model: 'GSR 18V-55',
    category: 'Werkzeug',
    condition: 'very_good',
    status: 'ready',
    allocated_purchase_cost: 35,
    expected_value: 75,
    description: 'Inklusive zwei Akkus, Ladegerät und Transportkoffer.',
  };

  afterEach(() => TestBed.resetTestingModule());

  function createService(taxMode?: string): ListingTemplateService {
    TestBed.configureTestingModule({
      providers: [
        ListingTemplateService,
        {
          provide: WorkspaceService,
          useValue: {
            currentWorkspace: () => (taxMode ? { tax_mode: taxMode } : null),
          },
        },
      ],
    });
    return TestBed.inject(ListingTemplateService);
  }

  it('limits generated Kleinanzeigen titles to 65 characters', () => {
    const listing = createService('diff_25a').generateKleinanzeigenListing(item, 75, {
      includeDisclaimer: true,
      includeNonSmoking: false,
      styleTone: 'dealer',
    });

    expect(listing.title).toHaveLength(65);
    expect(listing.title).toBe('Bosch Professional Akku-Bohrschrauber GSR 18V-55 mit umfangreiche');
  });

  it('uses the workspace tax mode in the legal notice', () => {
    const listing = createService('kleinunternehmer_19').generateKleinanzeigenListing(item, 75, {
      includeDisclaimer: true,
      includeNonSmoking: false,
      styleTone: 'dealer',
    });

    expect(listing.description).toContain('§ 19 UStG');
    expect(listing.description).not.toContain('§ 25a UStG');
  });

  it('omits a tax paragraph when no workspace tax mode is known', () => {
    const listing = createService().generateKleinanzeigenListing(item, 75, {
      includeDisclaimer: true,
      includeNonSmoking: false,
      styleTone: 'dealer',
    });

    expect(listing.description).toContain('Gebrauchtware vom Händler.');
    expect(listing.description).not.toContain('§ 19 UStG');
    expect(listing.description).not.toContain('§ 25a UStG');
    expect(listing.description).not.toContain('gesetzlichen Umsatzsteuer');
  });

  it('keeps pickup, shipping, non-smoking and tone options in the generated text', () => {
    const listing = createService('diff_25a').generateKleinanzeigenListing(item, 75, {
      includeDisclaimer: false,
      includeNonSmoking: true,
      styleTone: 'collector',
    });

    expect(listing.description).toContain('Hallo Sammler & Enthusiasten,');
    expect(listing.description).toContain('75.00 € (Festpreis)');
    expect(listing.description).toContain('Gepflegter Nichtraucherhaushalt ohne Haustiere.');
    expect(listing.description).toContain(
      'Abholung vor Ort nach Absprache oder versicherter Versand möglich.',
    );
    expect(listing.description).not.toContain('Rechtlicher Hinweis:');
  });
});
