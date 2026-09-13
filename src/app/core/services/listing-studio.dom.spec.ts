import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ListingStudioService, KleinanzeigenListingPayload } from './listing-studio.service';

describe('ListingStudioService – DOM-Interaktion', () => {
  it('sendet Inseratsdaten per postMessage an die Browser-Erweiterung', () => {
    const service = Object.create(ListingStudioService.prototype) as ListingStudioService;
    const postMessageSpy = vi.spyOn(window, 'postMessage');

    const payload: KleinanzeigenListingPayload = {
      itemId: 'item-1',
      title: 'Titel',
      description: 'Beschreibung',
      price: 50,
      priceType: 'FIXED',
      shippingType: 'both',
      images: [{ url: 'https://example.com/img.jpg', name: 'img.jpg' }],
    };

    service.publishViaExtension(payload);

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN',
        payload,
      },
      '*',
    );

    postMessageSpy.mockRestore();
  });
});
