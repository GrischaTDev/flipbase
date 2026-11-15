import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { VintedRatingComponent } from './vinted-rating.component';

describe('VintedRatingComponent', () => {
  let resetBindings: (() => void) | undefined;

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      {
        type: VintedRatingComponent,
        path: 'src/app/features/marketplaces/components/vinted-rating/vinted-rating.component.ts',
      },
    ]);
  });

  afterEach(() => TestBed.resetTestingModule());
  afterAll(() => resetBindings?.());

  it.each([
    { reputation: 1, filled: 5 },
    { reputation: 4.8, filled: 5 },
    { reputation: 2.4, filled: 2 },
    { reputation: 0, filled: 0 },
  ])(
    'zeigt $filled gefüllte Sterne für die Bewertung $reputation',
    async ({ reputation, filled }) => {
      await TestBed.configureTestingModule({
        imports: [VintedRatingComponent],
      }).compileComponents();
      const fixture = TestBed.createComponent(VintedRatingComponent);
      fixture.componentRef.setInput('reputation', reputation);
      fixture.componentRef.setInput('count', 1);
      fixture.detectChanges();
      const rating = (fixture.nativeElement as HTMLElement).querySelector('[role="img"]');
      expect(rating?.querySelectorAll('svg')).toHaveLength(5);
      expect(rating?.querySelectorAll('svg.fill-current')).toHaveLength(filled);

      fixture.componentRef.setInput('reputation', null);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('[role="img"]')).toBeNull();
    },
  );
});
