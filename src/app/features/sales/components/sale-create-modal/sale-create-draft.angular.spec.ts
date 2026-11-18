import '@angular/compiler';
import { signal } from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import type { SaleDraft } from '../../models/sale-draft.models';
import { SaleDraftService } from '../../services/sale-draft.service';
import { SaleCreateModalComponent } from './sale-create-modal.component';

type DraftSubject = SaleCreateModalComponent;
/** Zugriff auf private Hilfsmethoden, die die Seite über Eingänge auslöst. */
interface DraftInternals {
  applyDraft(draft: SaleDraft): void;
  removeBookedDraft(): Promise<void>;
}
const internals = (component: DraftSubject) => component as unknown as DraftInternals;

function createDraftSubject() {
  const draftService = {
    save: vi.fn(async (_input: unknown) => 'draft-1'),
    remove: vi.fn(async (_workspaceId: string, _id: string) => undefined),
  };
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const component = Object.create(SaleCreateModalComponent.prototype) as DraftSubject;
  const form = new FormGroup({
    lines: new FormArray<ReturnType<SaleCreateModalComponent['lines']['at']>>([]),
    platform: new FormControl('', { nonNullable: true }),
    saleDate: new FormControl('2026-11-05', { nonNullable: true }),
    platformFee: new FormControl<number | null>(0, { nonNullable: true }),
    shippingCost: new FormControl<number | null>(0, { nonNullable: true }),
    shippingRevenue: new FormControl(0, { nonNullable: true }),
    shippingMode: new FormControl<'pickup' | 'seller_arranged' | 'unknown'>('pickup', {
      nonNullable: true,
    }),
    additionalCosts: new FormArray<ReturnType<SaleCreateModalComponent['additionalCosts']['at']>>(
      [],
    ),
    packagingCost: new FormControl(0, { nonNullable: true }),
    otherCosts: new FormControl(0, { nonNullable: true }),
    externalOrderId: new FormControl('', { nonNullable: true }),
    buyerNotes: new FormControl('', { nonNullable: true }),
  });
  Object.assign(component, {
    form,
    lines: form.controls.lines,
    additionalCosts: form.controls.additionalCosts,
    purchaseReferences: signal(new Map()),
    draftId: signal<string | null>(null),
    draft: signal<SaleDraft | null>(null),
    isSavingDraft: signal(false),
    isSubmitting: signal(false),
    isPersisted: signal(false),
    errorMessage: signal<string | null>(null),
    workspaceService: { currentWorkspace: signal({ id: 'workspace-1' }) },
    sale: signal(null),
    correctionSale: signal(null),
    externalDraft: signal(null),
    legacyReconciliation: signal(null),
    grossRevenue: signal(45),
    hasExplicitShippingMode: false,
    toast,
    injector: { get: (token: unknown) => (token === SaleDraftService ? draftService : null) },
    updateQuantityValidator: vi.fn(),
    articleTitle: (line: { controls: { target: { value: string } } }) =>
      line.controls.target.value.replace('free:', ''),
  });
  return { component, draftService, toast };
}

function addLine(component: DraftSubject, target: string, price: number, purchaseId = '') {
  const line = (
    component as unknown as { createLineForm(): ReturnType<DraftSubject['lines']['at']> }
  ).createLineForm();
  line.setValue({ target, quantity: 1, unitSalePrice: price });
  component.lines.push(line);
  if (purchaseId) component.setPurchaseReference(line, purchaseId);
  return line;
}

describe('Verkaufsentwürfe in der Verkaufserfassung', () => {
  it('stellt einen gespeicherten Stand vollständig wieder her', () => {
    const source = createDraftSubject().component;
    addLine(source, 'free:Pullover', 25, 'purchase-1');
    addLine(source, 'free:Jacke', 20);
    source.additionalCosts.push(
      (
        source as unknown as {
          createAdditionalCostForm(
            value: object,
          ): ReturnType<DraftSubject['additionalCosts']['at']>;
        }
      ).createAdditionalCostForm({ category: 'packaging', description: '', amount: 1.5 }),
    );
    source.form.patchValue({ platform: 'vinted', buyerNotes: 'Abholung Freitag' });
    const snapshot = source.draftSnapshot();

    const target = createDraftSubject().component;
    internals(target).applyDraft({
      id: 'draft-7',
      workspaceId: 'workspace-1',
      title: 'Pullover und 1 weitere',
      saleAmount: 45,
      updatedAt: '2026-11-05T10:00:00Z',
      snapshot,
    });

    expect(target.draftSnapshot()).toEqual(snapshot);
    expect(target.purchaseReferences().get(target.lines.at(0))).toBe('purchase-1');
    expect(target.draftId()).toBe('draft-7');
    expect(target.form.dirty).toBe(false);
  });

  it('speichert ohne Buchung und aktualisiert danach denselben Entwurf', async () => {
    const { component, draftService } = createDraftSubject();
    addLine(component, 'free:Pullover', 25);
    addLine(component, 'free:Jacke', 20);
    component.form.markAsDirty();

    await expect(component.saveDraft()).resolves.toBe(true);
    expect(draftService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        workspaceId: 'workspace-1',
        title: 'Pullover und 1 weitere',
        saleAmount: 45,
      }),
    );
    expect(component.form.dirty).toBe(false);

    await component.saveDraft();
    expect(draftService.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'draft-1' }));
  });

  it.each([
    { shopEnabled: true, sourceTarget: 'inventory:article-1', target: 'inventory:article-1' },
    { shopEnabled: false, sourceTarget: 'free:Pullover', target: 'free:Pullover' },
    { shopEnabled: true, sourceTarget: 'free:Pullover', target: '' },
    { shopEnabled: false, sourceTarget: 'inventory:article-1', target: 'free:Pullover' },
  ])(
    'öffnet einen Vinted-Entwurf für den aktuellen Shop-Modus ($target)',
    ({ shopEnabled, sourceTarget, target }) => {
      const { component } = createDraftSubject();
      Object.assign(component, {
        workspaceService: {
          currentWorkspace: signal({ id: 'workspace-1', shop_enabled: shopEnabled }),
        },
      });
      const draft: SaleDraft = {
        id: 'vinted-draft-1',
        workspaceId: 'workspace-1',
        title: 'Pullover',
        saleAmount: 24.5,
        updatedAt: '2026-11-18T10:00:00Z',
        vintedSource: {
          saleState: 'sold',
          title: 'Pullover',
          amount: 24.5,
          currency: 'EUR',
          isBundle: false,
        },
        snapshot: {
          ...component.draftSnapshot(),
          platform: 'vinted',
          saleDate: '2026-11-17',
          externalOrderId: '53621',
          lines: [
            {
              target: sourceTarget,
              quantity: 1,
              unitSalePrice: 24.5,
              purchaseId: null,
              sourceTitle: 'Pullover',
            },
          ],
        },
      };

      internals(component).applyDraft(draft);

      expect(component.lines.at(0).getRawValue()).toMatchObject({
        target,
        quantity: 1,
        unitSalePrice: 24.5,
      });
      expect(component.form.getRawValue()).toMatchObject({
        platform: 'vinted',
        saleDate: '2026-11-17',
        externalOrderId: '53621',
      });
      expect(component.form.controls.externalOrderId.disabled).toBe(true);
    },
  );

  it('bietet keinen Entwurf für Korrekturen oder eine leere Erfassung an', () => {
    const { component } = createDraftSubject();
    expect(component.canSaveDraft()).toBe(false);
    addLine(component, 'free:Pullover', 25);
    expect(component.canSaveDraft()).toBe(true);
    (component as unknown as { correctionSale: ReturnType<typeof signal> }).correctionSale = signal(
      { id: 'sale-1' },
    );
    expect(component.canSaveDraft()).toBe(false);
  });

  it('löscht den Entwurf nach dem Buchen und meldet einen Löschfehler ohne die Buchung zu verwerfen', async () => {
    const { component, draftService, toast } = createDraftSubject();
    component.draftId.set('draft-3');
    await internals(component).removeBookedDraft();
    expect(draftService.remove).toHaveBeenCalledWith('workspace-1', 'draft-3');
    expect(component.draftId()).toBeNull();

    component.draftId.set('draft-4');
    draftService.remove.mockRejectedValueOnce(new Error('offline'));
    await internals(component).removeBookedDraft();
    expect(toast.warning).toHaveBeenCalledOnce();
  });
});
