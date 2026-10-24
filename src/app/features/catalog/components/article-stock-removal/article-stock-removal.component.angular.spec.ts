import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
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
  let confirmation: ConfirmDialogService;
  beforeEach(() => {
    removeStock.mockReset().mockResolvedValue(undefined);
    setArchived.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: ArticleLifecycleService, useValue: { removeStock, setArchived } }],
    });
    component = TestBed.runInInjectionContext(() => new ArticleStockRemovalComponent());
    Object.defineProperty(component, 'target', { value: signal(target) });
    confirmation = TestBed.inject(ConfirmDialogService);
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
    const pending = component.submit();
    confirmation.antworte(true);
    await pending;
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

  it('wartet bei Verlust mit der Buchung auf eine ausdrückliche Bestätigung', async () => {
    component.form.controls.quantity.setValue(2);
    component.form.controls.reason.setValue('loss');
    const pending = component.submit();
    expect(removeStock).not.toHaveBeenCalled();
    expect(confirmation.anfrage()).toMatchObject({
      titel: 'Bestandsverlust bestätigen',
      bestaetigenText: 'Verlust buchen',
      gefahr: true,
    });
    expect(confirmation.anfrage()?.text).toContain('Schuh 42');
    expect(confirmation.anfrage()?.text).toContain('2 Stück');
    expect(confirmation.anfrage()?.text).toContain('Verloren / fehlt im Lager');
    confirmation.antworte(true);
    await pending;
    expect(removeStock).toHaveBeenCalledTimes(1);
  });

  it('behält nach Abbruch der Verlustbestätigung alle Eingaben ohne Buchung', async () => {
    component.form.controls.reason.setValue('loss');
    component.form.controls.notes.setValue('Noch einmal nachsehen');
    const pending = component.submit();
    confirmation.antworte(false);
    await pending;
    expect(removeStock).not.toHaveBeenCalled();
    expect(component.completed()).toBe(false);
    expect(component.saving()).toBe(false);
    expect(component.form.enabled).toBe(true);
    expect(component.form.controls.notes.value).toBe('Noch einmal nachsehen');
  });

  it('öffnet bei mehrfachem Betätigen nur eine Verlustbestätigung', async () => {
    const ask = vi.spyOn(confirmation, 'frage');
    component.form.controls.reason.setValue('loss');
    const pending = component.submit();
    await component.submit();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(removeStock).not.toHaveBeenCalled();
    confirmation.antworte(true);
    await pending;
    expect(removeStock).toHaveBeenCalledTimes(1);
  });

  it('bucht nach einem Artikelwechsel während der Bestätigung keinen alten Artikel', async () => {
    component.form.controls.reason.setValue('loss');
    const pending = component.submit();
    Object.defineProperty(component, 'target', {
      value: signal({ ...target, id: 'different-article' }),
    });
    confirmation.antworte(true);
    await pending;
    expect(removeStock).not.toHaveBeenCalled();
    expect(component.completed()).toBe(false);
  });

  it('schließt eine eigene offene Bestätigung beim Verlassen ohne Buchung', async () => {
    component.form.controls.reason.setValue('loss');
    const pending = component.submit();
    expect(confirmation.anfrage()).not.toBeNull();
    TestBed.resetTestingModule();
    expect(confirmation.anfrage()).toBeNull();
    await pending;
    expect(removeStock).not.toHaveBeenCalled();
  });

  it('verlangt nach einem Buchungsfehler eine neue Verlustbestätigung', async () => {
    removeStock.mockRejectedValueOnce(new Error('Bestand erneut prüfen'));
    component.form.controls.reason.setValue('loss');
    const first = component.submit();
    confirmation.antworte(true);
    await first;
    expect(component.error()).toBe('Bestand erneut prüfen');
    const retry = component.submit();
    expect(removeStock).toHaveBeenCalledTimes(1);
    confirmation.antworte(false);
    await retry;
    expect(removeStock).toHaveBeenCalledTimes(1);
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
