import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleLifecycleService } from '../../services/article-lifecycle.service';
import {
  ArticleStockRemovalComponent,
  StockRemovalTarget,
} from './article-stock-removal.component';

describe('Bestandsabgang im Dialog', () => {
  const target: StockRemovalTarget = {
    workspaceId: 'workspace',
    kind: 'catalog',
    id: 'shoe42',
    title: 'Schuh 42',
    onHand: 3,
  };
  const removeStock = vi.fn();
  const setArchived = vi.fn();
  let component: ArticleStockRemovalComponent;
  beforeEach(() => {
    removeStock.mockReset().mockResolvedValue(undefined);
    setArchived.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: ArticleLifecycleService, useValue: { removeStock, setArchived } }],
    });
    component = TestBed.runInInjectionContext(() => new ArticleStockRemovalComponent());
    Object.defineProperty(component, 'target', { value: signal(target) });
  });
  afterEach(() => TestBed.resetTestingModule());

  it.each([0, 1.5, 4])(
    'weist ungültige oder zu große Menge %s vor der Buchung zurück',
    async (quantity) => {
      component.form.controls.quantity.setValue(quantity);
      await component.submit();
      expect(removeStock).not.toHaveBeenCalled();
      expect(component.error()).toContain('ganze Stückzahl');
    },
  );

  it('bucht eine Teilmenge einmal und lässt den Artikel aktiv', async () => {
    component.form.controls.quantity.setValue(2);
    component.form.controls.reason.setValue('loss');
    component.form.controls.notes.setValue('Fehlt im Regal');
    await component.submit();
    await component.submit();
    expect(removeStock).toHaveBeenCalledExactlyOnceWith(
      'workspace',
      'catalog',
      'shoe42',
      2,
      'loss',
      'Fehlt im Regal',
    );
    expect(setArchived).not.toHaveBeenCalled();
    expect(component.completed()).toBe(true);
  });

  it('bewahrt Eingaben bei einem Fehler für einen erneuten Versuch', async () => {
    removeStock.mockRejectedValueOnce(new Error('Bitte Inserat zuerst beenden.'));
    component.form.controls.notes.setValue('Beschädigt');
    await component.submit();
    expect(component.form.enabled).toBe(true);
    expect(component.form.controls.notes.value).toBe('Beschädigt');
    expect(component.error()).toContain('Inserat');
    await component.submit();
    expect(component.completed()).toBe(true);
    expect(component.error()).toBeNull();
  });

  it('verhindert Schließen und doppelte Buchung während eines laufenden Abgangs', async () => {
    let finish!: () => void;
    removeStock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const closed = vi.fn();
    component.closed.subscribe(closed);
    const pending = component.submit();
    component.close();
    await component.submit();
    expect(removeStock).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    finish();
    await pending;
    component.close();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
