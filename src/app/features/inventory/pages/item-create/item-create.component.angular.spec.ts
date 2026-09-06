import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ItemCreateComponent } from './item-create.component';

describe('ItemCreateComponent', () => {
  it('kehrt nach erfolgreicher Anlage zum Inventar zurück', () => {
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { navigate } }],
    });

    const component = TestBed.runInInjectionContext(() => new ItemCreateComponent());
    component.itemCreated();

    expect(navigate).toHaveBeenCalledWith(['/inventory']);
    expect(component.hasUnsavedChanges()).toBe(false);
  });
});
