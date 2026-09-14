import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { InventoryService } from './inventory.service';
import { InventoryItem } from '../models/flipbase.models';

/**
 * Interne Artikelnummern und eindeutige Kennungen beim Anlegen.
 *
 * Beim Erfassen von fünf gleichen Stücken kamen nur zwei an. Die vorläufige
 * Kennung war `item-${Date.now()}` — wer mehrere Artikel in derselben
 * Millisekunde anlegt, bekommt dieselbe Kennung, und der spätere überschreibt
 * den früheren. Sichtbar wurde es nur, weil danach fünf Nummern vergeben, aber
 * zwei Artikel gespeichert waren.
 */
describe('Anlegen mehrerer Artikel', () => {
  /** Dienst ohne Injektionskontext, mit dem Nötigsten bestückt. */
  function dienstMitBestand(vorhandene: InventoryItem[] = []) {
    const items = signal<InventoryItem[]>(vorhandene);
    const gespeichert: InventoryItem[] = [];

    const dienst = Object.create(InventoryService.prototype) as InventoryService;
    Object.assign(dienst as object, {
      items,
      workspaceService: { currentWorkspace: () => ({ id: 'ws-1' }) },
      mockStore: {
        isDemoMode: () => true,
        saveItem: (i: InventoryItem) => {
          gespeichert.push(i);
        },
        getItems: () => gespeichert,
        saveActivityLog: () => undefined,
        applyCategoryBrandText: (i: InventoryItem) => i,
      },
      // logActivity schreibt im Demo-Modus nur lokal.
      activityLogs: signal([]),
    });

    return { dienst, items, gespeichert };
  }

  const vorlage = {
    title: 'Handyhülle iPhone 13',
    condition: 'new' as const,
    allocated_purchase_cost: 3,
  };

  it('vergibt fortlaufende Artikelnummern', async () => {
    const { dienst, items } = dienstMitBestand();

    await dienst.createItem(vorlage);
    await dienst.createItem(vorlage);
    await dienst.createItem(vorlage);

    const nummern = items()
      .map((i) => i.sku)
      .sort();
    const jahr = new Date().getFullYear();
    expect(nummern).toEqual([`FB-${jahr}-0001`, `FB-${jahr}-0002`, `FB-${jahr}-0003`]);
  });

  it('legt wirklich jedes Stück an, auch in derselben Millisekunde', async () => {
    // Der gemeldete Fall: fünf Stück erfassen.
    const { dienst, items } = dienstMitBestand();

    for (let i = 0; i < 5; i++) {
      await dienst.createItem(vorlage);
    }

    expect(items().length).toBe(5);
  });

  it('gibt keine Kennung zweimal aus', async () => {
    const { dienst, items } = dienstMitBestand();

    for (let i = 0; i < 5; i++) {
      await dienst.createItem(vorlage);
    }

    const kennungen = new Set(items().map((i) => i.id));
    expect(kennungen.size).toBe(5);
  });

  it('zählt hinter vorhandenen Nummern weiter', async () => {
    const jahr = new Date().getFullYear();
    const { dienst, items } = dienstMitBestand([
      {
        id: 'alt-1',
        workspace_id: 'ws-1',
        title: 'Alt',
        condition: 'used',
        status: 'received',
        allocated_purchase_cost: 0,
        sku: `FB-${jahr}-0041`,
      } as InventoryItem,
    ]);

    await dienst.createItem(vorlage);

    expect(items().some((i) => i.sku === `FB-${jahr}-0042`)).toBe(true);
  });
});
