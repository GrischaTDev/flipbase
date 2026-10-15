import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../button/button.component';
import { ModalShellComponent } from '../modal-shell/modal-shell.component';
import { ProductThumbnailComponent } from '../product-thumbnail/product-thumbnail.component';
import { ProductGalleryComponent } from './product-gallery.component';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: ProductGalleryComponent,
      path: 'src/app/shared/components/product-gallery/product-gallery.component.ts',
    },
    {
      type: ProductThumbnailComponent,
      path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
function setup(count: number) {
  const fixture = TestBed.createComponent(ProductGalleryComponent);
  fixture.componentRef.setInput('title', 'Testjacke');
  fixture.componentRef.setInput(
    'images',
    Array.from({ length: count }, (_, i) => `https://images.example.test/${i}.webp`),
  );
  fixture.detectChanges();
  return fixture;
}
describe('Produktgalerie', () => {
  it('begrenzt nur die Vorschau auf fünf Fotos und öffnet auch alle übrigen', () => {
    const fixture = setup(20);
    const component = fixture.componentInstance;
    expect(component.previewImages()).toHaveLength(5);
    component.open(4);
    for (let i = 5; i < 20; i++) component.move(1);
    expect(component.currentImage()).toBe('https://images.example.test/19.webp');
    component.move(1);
    expect(component.selectedIndex()).toBe(19);
    component.close();
    expect(component.currentImage()).toBeNull();
  });
  it('schließt die Großansicht bei einem Artikelwechsel statt alte Fotos zu zeigen', () => {
    const fixture = setup(3);
    fixture.componentInstance.open(1);
    fixture.componentRef.setInput('images', ['https://images.example.test/new.webp']);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedIndex()).toBeNull();
    expect(fixture.componentInstance.currentImage()).toBeNull();
  });
  it('stellt ohne Fotos einen beschrifteten Platzhalter dar', () => {
    const fixture = setup(0);
    expect(fixture.nativeElement.textContent).toContain('Keine Fotos vorhanden');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
});
