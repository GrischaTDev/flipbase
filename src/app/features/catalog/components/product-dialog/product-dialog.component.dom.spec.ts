import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { ProductDialogComponent } from './product-dialog.component';

describe('ProductDialogComponent', () => {
  it('öffnet die KI-Suche ohne EAN und übernimmt einen Fotovorschlag', async () => {
    const photo = new File(['photo'], 'jako-label.jpg', { type: 'image/jpeg' });
    const candidate = {
      title: 'JAKO J-SFG Twist',
      brand: 'JAKO',
      model: 'J-SFG Twist',
      size: '40',
      color: 'Skydiver',
      category: 'Fußballschuhe',
      sourceUrl: 'https://shop.example.test/jako-twist',
      confidence: 'likely' as const,
      evidence: 'Modell und Farbe genannt',
    };
    const search = vi.fn(async () => ({
      candidates: [candidate],
      usage: { inputTokens: 1000, outputTokens: 200, webSearchCalls: 1, estimatedCostUsd: 0.0102 },
    }));
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      platformOperator: { isOperator: vi.fn(async () => true) },
      barcodeAiLookup: { search },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      barcodeRequestId: 0,
      barcodeLoading: signal(false),
      aiSearchEan: signal<string | null>(null),
      labelPhoto: signal<File | null>(null),
      aiLoading: signal(false),
      aiResult: signal(null),
      aiError: signal(null),
      barcodeMessage: signal(null),
      brandSuggestion: signal(null),
      categorySuggestion: signal(null),
      form: new FormGroup({
        ean: new FormControl('', { nonNullable: true }),
        title: new FormControl('', { nonNullable: true }),
        model: new FormControl('', { nonNullable: true }),
        size: new FormControl('', { nonNullable: true }),
        color: new FormControl('', { nonNullable: true }),
      }),
    });

    component.openAiSearch();
    expect(component.aiSearchEan()).toBe('');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [photo] });
    component.selectLabelPhoto({ target: input } as unknown as Event);
    await component.searchWithAi();

    expect(search).toHaveBeenCalledWith('', photo);
    component.useAiSuggestion(candidate);
    expect(component.form.getRawValue()).toMatchObject({
      ean: '',
      title: 'JAKO J-SFG Twist',
      model: 'J-SFG Twist',
    });
  });

  it('ersetzt nach Fotoauswahl eine veraltete Fehlmeldung durch die Aufforderung zur erneuten Suche', () => {
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    const photo = new File(['photo'], 'jako-label.jpg', { type: 'image/jpeg' });
    Object.assign(component, {
      labelPhoto: signal<File | null>(null),
      aiResult: signal(null),
      aiError: signal(null),
      barcodeMessage: signal('Auch die KI-Suche hat keinen belegten Produktvorschlag gefunden.'),
    });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [photo] });

    component.selectLabelPhoto({ target: input } as unknown as Event);

    expect(component.labelPhoto()).toBe(photo);
    expect(component.barcodeMessage()).toContain('Starte die KI-Suche erneut');
  });

  it('unterscheidet einen erfolglosen Suchlauf mit Foto von einer Suche ohne Foto', async () => {
    const photo = new File(['photo'], 'jako-label.jpg', { type: 'image/jpeg' });
    const search = vi.fn(async () => ({
      candidates: [],
      usage: { inputTokens: 1000, outputTokens: 200, webSearchCalls: 1, estimatedCostUsd: 0.0102 },
    }));
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      platformOperator: { isOperator: vi.fn(async () => true) },
      barcodeAiLookup: { search },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      barcodeRequestId: 1,
      aiSearchEan: signal('4099758601276'),
      labelPhoto: signal<File | null>(photo),
      aiLoading: signal(false),
      aiResult: signal(null),
      aiError: signal(null),
      barcodeMessage: signal(null),
      form: new FormGroup({
        ean: new FormControl('4099758601276', { nonNullable: true }),
      }),
    });

    await component.searchWithAi();

    expect(search).toHaveBeenCalledWith('4099758601276', photo);
    expect(component.barcodeMessage()).toContain('mit diesem Foto');
  });

  it('übernimmt erkennbare Etikettangaben ohne Webbeleg in die bearbeitbare Artikelform', async () => {
    const photo = new File(['photo'], 'jako-label.jpg', { type: 'image/jpeg' });
    const labelSuggestion = {
      title: 'JAKO J-SFG TWIST',
      brand: 'JAKO',
      model: 'J-SFG TWIST',
      size: '40',
      color: 'SKYDIVER/SULPHUR SPRING',
      category: '',
      articleNumber: '310127 002 443',
    };
    const result = {
      candidates: [],
      labelSuggestion,
      usage: { inputTokens: 1000, outputTokens: 200, webSearchCalls: 1, estimatedCostUsd: 0.0102 },
    };
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      platformOperator: { isOperator: vi.fn(async () => true) },
      barcodeAiLookup: { search: vi.fn(async () => result) },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      barcodeRequestId: 1,
      aiSearchEan: signal('4099758601276'),
      labelPhoto: signal<File | null>(photo),
      aiLoading: signal(false),
      aiResult: signal(null),
      aiError: signal(null),
      barcodeMessage: signal(null),
      brandSuggestion: signal(null),
      categorySuggestion: signal(null),
      form: new FormGroup({
        ean: new FormControl('4099758601276', { nonNullable: true }),
        title: new FormControl('', { nonNullable: true }),
        model: new FormControl('', { nonNullable: true }),
        size: new FormControl('', { nonNullable: true }),
        color: new FormControl('', { nonNullable: true }),
      }),
    });

    await component.searchWithAi();
    expect(component.barcodeMessage()).toContain('Etikett wurde gelesen');
    component.useAiLabelSuggestion(labelSuggestion);
    expect(component.form.getRawValue()).toMatchObject({
      ean: '4099758601276',
      title: 'JAKO J-SFG TWIST',
      model: 'J-SFG TWIST',
      size: '40',
      color: 'SKYDIVER/SULPHUR SPRING',
    });
    expect(component.brandSuggestion()).toBe('JAKO');
    expect(component.aiResult()).toBeNull();
  });

  it('zeigt KI-Vorschlaege nur nach Betreiberfreigabe und uebernimmt die gewaehlte Variante', async () => {
    const candidate = {
      title: 'JAKO J-SFG Twist',
      brand: 'JAKO',
      model: 'J-SFG Twist',
      size: '40',
      color: 'Skydiver',
      category: 'Fußballschuhe',
      sourceUrl: 'https://shop.example.test/schuh',
      confidence: 'likely' as const,
      evidence: 'Modell und Farbe genannt',
    };
    const result = {
      candidates: [candidate],
      usage: { inputTokens: 1000, outputTokens: 200, webSearchCalls: 1, estimatedCostUsd: 0.0102 },
    };
    const search = vi.fn(async () => result);
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      platformOperator: { isOperator: vi.fn(async () => true) },
      barcodeAiLookup: { search },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      barcodeRequestId: 1,
      aiSearchEan: signal('4099758601276'),
      labelPhoto: signal(null),
      aiLoading: signal(false),
      aiResult: signal(null),
      aiError: signal(null),
      barcodeMessage: signal(null),
      brandSuggestion: signal(null),
      categorySuggestion: signal(null),
      form: new FormGroup({
        ean: new FormControl('4099758601276', { nonNullable: true }),
        title: new FormControl('', { nonNullable: true }),
        model: new FormControl('', { nonNullable: true }),
        size: new FormControl('', { nonNullable: true }),
        color: new FormControl('', { nonNullable: true }),
      }),
    });

    await component.searchWithAi();
    expect(search).toHaveBeenCalledWith('4099758601276', null);
    expect(component.aiResult()?.candidates).toEqual([candidate]);
    component.useAiSuggestion(candidate);
    expect(component.form.getRawValue()).toMatchObject({
      ean: '4099758601276',
      title: 'JAKO J-SFG Twist',
      model: 'J-SFG Twist',
      size: '40',
      color: 'Skydiver',
    });
    expect(component.brandSuggestion()).toBe('JAKO');
  });

  it('sendet nach Workspacewechsel während des Listenladens kein fremdes Produkt an den Einkauf', async () => {
    const workspace = signal({ id: 'workspace-1' });
    const created = { emit: vi.fn() };
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: {
        createProduct: vi
          .fn()
          .mockResolvedValue({ data: { id: 'p', workspace_id: 'workspace-1' }, error: null }),
        loadProducts: vi.fn(async () => workspace.set({ id: 'workspace-2' })),
      },
      workspace: { currentWorkspace: workspace },
      workspaceChanged: () => false,
      savedProduct: signal(null),
      images: signal<readonly File[]>([]),
      saving: signal(false),
      error: signal(null),
      created,
      form: new FormGroup({
        title: new FormControl('X'),
        ean: new FormControl(''),
        condition: new FormControl(''),
      }),
    });
    await component.save();
    expect(created.emit).not.toHaveBeenCalled();
  });
  it('behält beim Bildfehler Stamm und Formwerte und legt beim Wiederholen kein zweites Produkt an', async () => {
    const product = { id: 'product-1', workspace_id: 'workspace-1', title: 'Schuh' };
    const createProduct = vi.fn().mockResolvedValue({ data: product, error: null });
    const uploadProductMedia = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('Upload gesperrt') })
      .mockResolvedValueOnce({ data: { id: 'image-1' }, error: null });
    const created = { emit: vi.fn() };
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: { createProduct, loadProducts: vi.fn() },
      media: { uploadProductMedia },
      savedProduct: signal(null),
      images: signal<readonly File[]>([new File(['bild'], 'bild.png', { type: 'image/png' })]),
      workspaceChanged: () => false,
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      created,
      saving: signal(false),
      error: signal(null),
      form: new FormGroup({
        title: new FormControl('Schuh'),
        ean: new FormControl(''),
        condition: new FormControl('defective'),
        conditionNotes: new FormControl('Naht beschädigt'),
        isPublicStore: new FormControl(false),
        listingPrice: new FormControl(null),
      }),
    });
    await component.save();
    expect(component.error()).toContain(
      'Produkt gespeichert. Bild konnte nicht gespeichert werden',
    );
    expect(component.savedProduct()).toEqual(product);
    expect(component.form.getRawValue()).toMatchObject({
      title: 'Schuh',
      conditionNotes: 'Naht beschädigt',
    });
    expect(created.emit).not.toHaveBeenCalled();
    await component.save();
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(uploadProductMedia).toHaveBeenCalledTimes(2);
    expect(created.emit).toHaveBeenCalledExactlyOnceWith(product);
  });

  it('lädt alle ausgewählten Bilder für denselben Artikel hoch', async () => {
    const product = { id: 'product-1', workspace_id: 'workspace-1', title: 'Schuh' };
    const uploadProductMedia = vi.fn(async (_id: string, file: File) => ({
      data: { id: `image-${file.name}` },
      error: null,
    }));
    const created = { emit: vi.fn() };
    const files = [
      new File(['eins'], 'vorne.png', { type: 'image/png' }),
      new File(['zwei'], 'hinten.png', { type: 'image/png' }),
    ];
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: {
        createProduct: vi.fn().mockResolvedValue({ data: product, error: null }),
        loadProducts: vi.fn(),
      },
      media: { uploadProductMedia },
      savedProduct: signal(null),
      images: signal<readonly File[]>(files),
      workspaceChanged: () => false,
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      created,
      saving: signal(false),
      error: signal(null),
      form: new FormGroup({
        title: new FormControl('Schuh'),
        ean: new FormControl(''),
        condition: new FormControl(''),
        isPublicStore: new FormControl(false),
        listingPrice: new FormControl(null),
      }),
    });

    await component.save();

    expect(uploadProductMedia).toHaveBeenCalledTimes(2);
    expect(uploadProductMedia).toHaveBeenNthCalledWith(1, product.id, files[0]);
    expect(uploadProductMedia).toHaveBeenNthCalledWith(2, product.id, files[1]);
    expect(component.images()).toEqual([]);
    expect(created.emit).toHaveBeenCalledExactlyOnceWith(product);
  });
  it('beendet den Speichervorgang und zeigt einen geworfenen Servicefehler an', async () => {
    const createProduct = vi.fn().mockRejectedValue(new Error('Speicher nicht verfügbar'));
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: { createProduct, loadProducts: vi.fn() },
      savedProduct: signal(null),
      images: signal<readonly File[]>([]),
      workspaceChanged: () => false,
      created: { emit: vi.fn() },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      saving: signal(false),
      closed: { emit: vi.fn() },
      error: signal<string | null>(null),
      form: new FormGroup({
        title: new FormControl('LED-Lampe', {
          nonNullable: true,
          validators: [Validators.required, Validators.minLength(2)],
        }),
        ean: new FormControl('', { nonNullable: true }),
        condition: new FormControl('', { nonNullable: true }),
        isPublicStore: new FormControl(false, { nonNullable: true }),
        listingPrice: new FormControl<number | null>(null),
      }),
    });

    await component.save();

    expect(component.saving()).toBe(false);
    expect(component.error()).toBe('Speicher nicht verfügbar');
    expect(component.savedProduct()).toBeNull();
  });

  it('verlangt für einen öffentlichen Artikel einen positiven Shoppreis', () => {
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      form: new FormGroup(
        {
          title: new FormControl('LED-Lampe', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(2)],
          }),
          ean: new FormControl('', { nonNullable: true }),
          trackingMode: new FormControl('quantity', { nonNullable: true }),
          isPublicStore: new FormControl(true, { nonNullable: true }),
          listingPrice: new FormControl<number | null>(null),
        },
        { validators: ProductDialogComponent.publicListingPriceValidator },
      ),
    });

    expect(component.form.invalid).toBe(true);
    component.form.controls.listingPrice.setValue(0);
    expect(component.form.invalid).toBe(true);
    component.form.controls.listingPrice.setValue(12.5);
    expect(component.form.valid).toBe(true);
  });

  it('persistiert den validierten Shoppreis beim Anlegen', async () => {
    const createProduct = vi
      .fn()
      .mockResolvedValue({ data: { id: 'product-1', workspace_id: 'workspace-1' }, error: null });
    const component = Object.create(ProductDialogComponent.prototype) as ProductDialogComponent;
    Object.assign(component, {
      catalog: { createProduct, loadProducts: vi.fn() },
      savedProduct: signal(null),
      images: signal<readonly File[]>([]),
      workspaceChanged: () => false,
      created: { emit: vi.fn() },
      workspace: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      saving: signal(false),
      closed: { emit: vi.fn() },
      error: signal<string | null>(null),
      form: new FormGroup(
        {
          title: new FormControl('LED-Lampe', { nonNullable: true }),
          ean: new FormControl('', { nonNullable: true }),
          trackingMode: new FormControl('quantity', { nonNullable: true }),
          isPublicStore: new FormControl(true, { nonNullable: true }),
          listingPrice: new FormControl<number | null>(12.5),
        },
        { validators: ProductDialogComponent.publicListingPriceValidator },
      ),
    });

    await component.save();

    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ isPublicStore: true, listingPrice: 12.5 }),
    );
  });
});
