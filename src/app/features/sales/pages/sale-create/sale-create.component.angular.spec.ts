import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SaleCreateComponent } from './sale-create.component';

describe('SaleCreateComponent', () => {
  it('kehrt nach einer Inventar-Vorbelegung zum aufrufenden Bereich zurück', () => {
    const navigateByUrl = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            getCurrentNavigation: () => ({ extras: { state: { returnUrl: '/inventory' } } }),
            navigateByUrl,
          },
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new SaleCreateComponent());
    component.returnToSales();

    expect(navigateByUrl).toHaveBeenCalledWith('/inventory');
  });

  it('kehrt nach einem Artikelverkauf zur Bestandsansicht zurück', () => {
    const navigateByUrl = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            getCurrentNavigation: () => ({
              extras: { state: { returnUrl: '/catalog?view=stock' } },
            }),
            navigateByUrl,
          },
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new SaleCreateComponent());
    component.returnToSales();

    expect(navigateByUrl).toHaveBeenCalledWith('/catalog?view=stock');
  });

  it('ignoriert fremde Rücksprungziele und kehrt zur Verkaufsliste zurück', () => {
    const navigateByUrl = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            getCurrentNavigation: () => ({
              extras: { state: { returnUrl: 'https://example.com' } },
            }),
            navigateByUrl,
          },
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new SaleCreateComponent());
    component.returnToSales();

    expect(navigateByUrl).toHaveBeenCalledWith('/sales');
  });
});
