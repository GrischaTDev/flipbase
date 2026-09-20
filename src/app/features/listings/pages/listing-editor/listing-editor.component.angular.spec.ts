import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListingStudioService } from '../../../../core/services/listing-studio.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ListingExtensionService } from '../../services/listing-extension.service';
import { ListingService } from '../../services/listing.service';
import { ListingEditorComponent } from './listing-editor.component';

describe('ListingEditorComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function createEditor() {
    const items = signal([
      {
        id: 'item-expected-value',
        workspaceId: 'workspace-a',
        title: 'Kamera',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: 79,
        allocatedPurchaseCost: 34,
        media: [],
      },
      {
        id: 'item-cost-only',
        workspaceId: 'workspace-a',
        title: 'Kopfhörer',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: 22,
        media: [],
      },
      {
        id: 'item-without-value',
        workspaceId: 'workspace-a',
        title: 'Kabel',
        brand: null,
        category: null,
        condition: 'used' as const,
        conditionNotes: null,
        description: null,
        status: 'ready' as const,
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: [],
      },
    ]);
    const load = vi.fn(async () => undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ListingService,
          useValue: {
            items,
            rows: signal([]),
            loadedWorkspaceId: signal<string | null>(null),
            load,
            clear: vi.fn(),
            getById: vi.fn(() => null),
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'workspace-a' }) },
        },
        {
          provide: ListingExtensionService,
          useValue: { start: vi.fn(), available: vi.fn(() => false) },
        },
        { provide: ListingStudioService, useValue: { generateKleinanzeigenListing: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    });

    return {
      editor: TestBed.runInInjectionContext(() => new ListingEditorComponent()),
      load,
    };
  }

  it('loads listing data for a directly opened editor route', () => {
    const { load } = createEditor();

    TestBed.flushEffects();

    expect(load).toHaveBeenCalledWith('workspace-a');
  });

  it('prefills the expected value or available cost and preserves a manual price', () => {
    const { editor } = createEditor();

    editor.form.controls.inventoryItemId.setValue('item-expected-value');
    expect(editor.selectedItem()?.title).toBe('Kamera');
    expect(editor.form.controls.price.value).toBe(79);

    editor.form.controls.inventoryItemId.setValue('item-cost-only');
    expect(editor.form.controls.price.value).toBe(22);

    editor.form.controls.inventoryItemId.setValue('item-without-value');
    expect(editor.form.controls.price.value).toBe(0);

    editor.form.controls.price.setValue(65);
    editor.form.controls.price.markAsDirty();
    editor.form.controls.inventoryItemId.setValue('item-cost-only');

    expect(editor.form.controls.price.value).toBe(65);
  });
});
