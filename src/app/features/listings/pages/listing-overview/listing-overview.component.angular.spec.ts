import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import { ListingExtensionHelpComponent } from '../../components/listing-extension-help/listing-extension-help.component';
import type { ListingRow, ListingStatus } from '../../models/listing.models';
import { ListingExtensionService } from '../../services/listing-extension.service';
import { ListingService } from '../../services/listing.service';
import { ListingOverviewComponent } from './listing-overview.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(BadgeComponent, ['tone', 'size', 'mono']);
  registerSignalInputs(ButtonComponent, [
    'variant',
    'size',
    'loading',
    'disabled',
    'icon',
    'iconPosition',
    'iconOnly',
    'fullWidth',
    'type',
    'link',
    'href',
    'target',
    'queryParams',
    'ariaLabel',
    'title',
    'ariaExpanded',
    'ariaPressed',
    'ariaControls',
    'ariaHaspopup',
  ]);
  registerSignalInputs(DataTableComponent, [
    'ariaLabel',
    'searchValue',
    'searchPlaceholder',
    'searchAriaLabel',
    'searchEnabled',
    'toolbarVisible',
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
    'loading',
    'errorMessage',
    'hasRows',
    'loadingText',
    'emptyTitle',
    'emptyText',
  ]);
  registerSignalInputs(CustomSearchInputComponent, [
    'value',
    'placeholder',
    'disabled',
    'clearable',
    'size',
    'variant',
    'id',
    'ariaLabel',
  ]);
  registerSignalInputs(ListingExtensionHelpComponent, ['open', 'checking']);
  registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'icon', 'backLink', 'backLabel']);
  registerSignalInputs(ProductThumbnailComponent, ['src', 'alt', 'size']);
  registerSignalInputs(TableColumnMenuComponent, [
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
  ]);
});

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

function createRow(status: ListingStatus, id = `listing-${status}`): ListingRow {
  return {
    listing: {
      id,
      workspaceId: 'workspace-a',
      inventoryItemId: `item-${id}`,
      platform: 'kleinanzeigen',
      status,
      endReason: status === 'ended' ? 'manual' : null,
      content: {
        title: `${status} Kamera`,
        description: 'Beschreibung',
        price: 79,
        priceType: 'FIXED',
        shippingType: 'pickup',
        shippingPrice: null,
        postalCode: null,
      },
      listedCount: 1,
      lastListedAt: '2026-09-20T10:00:00.000Z',
      onlineSince: status === 'online' ? '2026-09-20T10:01:00.000Z' : null,
      endedAt: status === 'ended' ? '2026-09-20T11:00:00.000Z' : null,
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
    },
    item: {
      id: `item-${id}`,
      workspaceId: 'workspace-a',
      title: `Artikel ${status}`,
      brand: 'Flipbase',
      category: null,
      condition: 'used',
      conditionNotes: null,
      description: null,
      status: status === 'ended' ? 'ready' : 'listed',
      archivedAt: null,
      expectedValue: 79,
      allocatedPurchaseCost: 30,
      media: [],
    },
    primaryImagePath: null,
  };
}

describe('ListingOverviewComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function configure(rowsValue: readonly ListingRow[] = [createRow('prepared')]) {
    const rows = signal(rowsValue);
    const warning = vi.fn();
    const buildExtensionPayload = vi.fn(async () => ({
      payload: {
        itemId: rowsValue[0]!.item.id,
        title: rowsValue[0]!.listing.content.title,
        description: '',
        price: 79,
        priceType: 'FIXED' as const,
        shippingType: 'pickup' as const,
        images: [],
      },
      missingImages: ['missing.jpg'] as string[],
    }));

    TestBed.configureTestingModule({
      imports: [ListingOverviewComponent],
      providers: [
        provideRouter([]),
        {
          provide: ListingService,
          useValue: {
            rows,
            loading: signal(false),
            error: signal<string | null>(null),
            load: vi.fn(async () => undefined),
            clear: vi.fn(),
            setOnline: vi.fn(async () => ({ data: null, error: null })),
            end: vi.fn(async () => ({ data: null, error: null })),
            prepare: vi.fn(async () => ({ data: null, error: null })),
            getById: vi.fn(() => null),
            buildExtensionPayload,
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'workspace-a' }) },
        },
        {
          provide: ListingExtensionService,
          useValue: {
            start: vi.fn(),
            available: vi.fn(() => true),
            checking: signal(false),
            checkNow: vi.fn(),
            publish: vi.fn(),
          },
        },
        { provide: ConfirmDialogService, useValue: { frage: vi.fn(async () => true) } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn(), warning } },
      ],
    });

    return { buildExtensionPayload, rows, warning };
  }

  it('filters open, online, ended and searched listings', () => {
    configure([createRow('prepared'), createRow('online'), createRow('ended')]);
    const component = TestBed.runInInjectionContext(() => new ListingOverviewComponent());

    expect(component.filteredRows()).toHaveLength(2);
    component.filter.set('online');
    expect(component.filteredRows().map((row) => row.listing.status)).toEqual(['online']);
    component.filter.set('all');
    component.search.set('Artikel ended');
    expect(component.filteredRows().map((row) => row.listing.status)).toEqual(['ended']);
  });

  it('uses correct singular wording when one image cannot be transferred', async () => {
    const row = createRow('prepared');
    const { warning } = configure([row]);
    const component = TestBed.runInInjectionContext(() => new ListingOverviewComponent());

    await component.openAgain(row);

    expect(warning).toHaveBeenCalledWith('1 Bild konnte nicht übertragen werden.');
  });

  it('shows the desktop table only from medium screens and includes mobile actions', async () => {
    configure([createRow('prepared')]);
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ListingOverviewComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const desktop = host.querySelector<HTMLElement>('[table-content]');
    const mobile = host.querySelector<HTMLElement>('[table-mobile]');

    expect(desktop?.classList.contains('hidden')).toBe(true);
    expect(desktop?.classList.contains('md:block')).toBe(true);
    expect(mobile?.textContent).toContain('Artikel prepared');
    expect(mobile?.querySelector('[aria-label="Inserat online setzen"]')).not.toBeNull();
    expect(mobile?.querySelector('[aria-label="Inserat bearbeiten"]')).not.toBeNull();
    expect(mobile?.querySelector('[aria-label="Inserat beenden"]')).not.toBeNull();
  });

  it('has no detectable accessibility violations in the rendered overview', async () => {
    configure([createRow('prepared'), createRow('online'), createRow('ended')]);
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ListingOverviewComponent);
    fixture.detectChanges();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });

  it('routes to inventory for individual items and to catalog for catalog products', () => {
    configure();
    const component = TestBed.runInInjectionContext(() => new ListingOverviewComponent());

    expect(
      component.itemRoute({
        id: 'item-1',
        workspaceId: 'workspace-a',
        targetKind: 'inventory_item',
        title: 'Einzelstück',
        brand: null,
        category: null,
        condition: 'used',
        conditionNotes: null,
        description: null,
        status: 'ready',
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: [],
      }),
    ).toEqual(['/inventory', 'item-1']);

    expect(
      component.itemRoute({
        id: 'prod-1',
        workspaceId: 'workspace-a',
        targetKind: 'catalog_product',
        title: 'Mengenprodukt',
        brand: null,
        category: null,
        condition: 'new',
        conditionNotes: null,
        description: null,
        status: 'ready',
        archivedAt: null,
        expectedValue: null,
        allocatedPurchaseCost: null,
        media: [],
      }),
    ).toEqual(['/catalog', 'prod-1']);
  });
});
