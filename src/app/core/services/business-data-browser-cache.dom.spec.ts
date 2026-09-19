import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { PriceTrackerService } from './price-tracker.service';
import { ReturnService } from './return.service';
import { FulfillmentService } from './fulfillment.service';
import { prepareBrowserStorage } from '../utils/browser-storage-initialization';

describe('Geschäftsdaten im Browser-Cache', () => {
  it('übernimmt keine Retouren aus einem globalen Browser-Cache', () => {
    localStorage.setItem(
      'flipbase_saved_returns',
      JSON.stringify([{ id: 'return-a', workspace_id: 'workspace-a' }]),
    );
    prepareBrowserStorage(localStorage);

    const service = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new ReturnService(),
    );

    expect(service.returns()).toEqual([]);
    expect(localStorage.getItem('flipbase_saved_returns')).toBeNull();
  });

  it('übernimmt keine Preisbeobachtungen aus einem globalen Browser-Cache', () => {
    localStorage.setItem(
      'flipbase_price_radar_items',
      JSON.stringify([{ id: 'track-a', workspace_id: 'workspace-a' }]),
    );
    prepareBrowserStorage(localStorage);

    const service = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new PriceTrackerService(),
    );

    expect(service.trackedItems()).toEqual([]);
    expect(localStorage.getItem('flipbase_price_radar_items')).toBeNull();
  });

  it('übernimmt keine Versanddaten aus einem globalen Browser-Cache', () => {
    localStorage.setItem(
      'flipbase_shipping_orders',
      JSON.stringify([{ id: 'shipping-a', workspace_id: 'workspace-a' }]),
    );
    localStorage.setItem(
      'flipbase_carrier_config',
      JSON.stringify({ dhlEnabled: true, dhlEkp: 'foreign-account' }),
    );
    prepareBrowserStorage(localStorage);

    const service = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new FulfillmentService(),
    );

    expect(service.orders()).toEqual([]);
    expect(service.carrierConfig()).toMatchObject({ dhlEnabled: false, dhlEkp: '' });
    expect(localStorage.getItem('flipbase_shipping_orders')).toBeNull();
    expect(localStorage.getItem('flipbase_carrier_config')).toBeNull();
  });
});
