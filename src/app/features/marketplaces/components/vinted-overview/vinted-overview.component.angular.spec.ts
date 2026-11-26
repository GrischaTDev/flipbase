import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceSnapshot } from '../../models/marketplace-read.models';
import { parseMarketplacePage, parseMarketplaceSnapshot } from '../../models/marketplace-response';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { VintedAccountViewService } from '../../services/vinted-account-view.service';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';
import { VintedOverviewComponent } from './vinted-overview.component';

const scope = { workspaceId: 'workspace-1', connectionId: 'connection-1' };
const otherScope = { ...scope, connectionId: 'connection-2' };
const emptyPage = { items: [], total: 0, nextCursor: null };
const entry = (id: string, occurredAt: string | null = null) => ({
  ...scope,
  id,
  title: id,
  occurredAt,
  price: null,
  unread: null,
  metrics: {},
});
function snapshot(overrides: Record<string, unknown> = {}): MarketplaceSnapshot {
  return parseMarketplaceSnapshot(
    {
      ...scope,
      profile: null,
      publications: emptyPage,
      conversations: emptyPage,
      sales: emptyPage,
      activity: emptyPage,
      ...overrides,
    },
    scope,
  );
}

describe('VintedOverviewComponent', () => {
  let fixture: ComponentFixture<VintedOverviewComponent>;
  let resetBindings: (() => void) | undefined;
  const accountSnapshot = signal<MarketplaceSnapshot | null>(null);
  const localInboxUnavailable = signal(false);
  const localSalesUnavailable = signal(false);
  const showAllAccounts = signal(false);
  const readVintedList = vi.fn<MarketplaceApiService['readVintedList']>();
  const readAccountPreview = vi.fn<MarketplaceApiService['readAccountPreview']>();
  const connections = signal([
    { ...scope, displayName: 'Konto A' },
    { ...otherScope, displayName: 'Konto B' },
  ]);

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
      { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
      { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
      {
        type: ProductThumbnailComponent,
        path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
      },
      {
        type: VintedRatingComponent,
        path: 'src/app/features/marketplaces/components/vinted-rating/vinted-rating.component.ts',
      },
      {
        type: VintedOverviewComponent,
        path: 'src/app/features/marketplaces/components/vinted-overview/vinted-overview.component.ts',
      },
    ]);
  });
  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    accountSnapshot.set(snapshot());
    localInboxUnavailable.set(false);
    localSalesUnavailable.set(false);
    showAllAccounts.set(false);
    readVintedList.mockReset();
    readAccountPreview.mockReset().mockImplementation(async (accountScope) => ({
      workspaceId: accountScope.workspaceId,
      connectionId: accountScope.connectionId,
      profile: null,
      publicationCount: 0,
      saleCount: 0,
    }));
    await TestBed.configureTestingModule({
      imports: [VintedOverviewComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: 'user-1' }) } },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: scope.workspaceId }) },
        },
        { provide: VintedAccountViewService, useValue: { showAllAccounts } },
        { provide: MarketplaceApiService, useValue: { readVintedList, readAccountPreview } },
        {
          provide: MarketplaceAccountStore,
          useValue: {
            snapshot: accountSnapshot,
            localInboxUnavailable,
            localSalesUnavailable,
            canManage: signal(true),
            connections,
            observeCombinedImports: () => () => undefined,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VintedOverviewComponent);
  });

  it('zeigt die Kontogesamtsummen und verlinkt Inserate und Verkäufe mit ihrem Namensbadge', async () => {
    const totals = { publication: 81, conversation: 27, sale: 12, provider_draft: 0, activity: 0 };
    readVintedList.mockImplementation(async ({ kind }) => {
      const title =
        kind === 'publication' ? 'Neues Inserat' : kind === 'sale' ? 'Letzter Verkauf' : 'Frage';
      return {
        ...parseMarketplacePage(
          {
            total: totals[kind],
            nextCursor: 'next',
            items: [{ ...entry(title), ...otherScope, id: kind, publicationState: 'active' }],
          },
          otherScope,
        ),
        filterCounts: {},
      };
    });
    showAllAccounts.set(true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const values = () =>
      [...element.querySelectorAll('[data-overview-total]')].map((node) =>
        node.textContent?.trim(),
      );
    expect(values()).toEqual(['–', '–', '–']);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(values()).toEqual(['81', '27', '12']);
    expect(
      element.querySelector('[data-listing-preview] [data-overview-account]')?.textContent,
    ).toContain('Konto B');
    expect(element.querySelector('[data-listing-preview] a')?.getAttribute('href')).toBe(
      '/marketplaces/vinted/listings/connection-2/publication',
    );
    expect(
      element.querySelector('[data-sale-preview] [data-overview-account]')?.textContent,
    ).toContain('Konto B');
    expect(element.querySelector('[data-sale-preview] a')?.getAttribute('href')).toBe(
      '/marketplaces/vinted/sales?connectionId=connection-2&saleId=sale',
    );
  });

  it('zeigt fehlende lokale Datenquellen als unbekannt und erhält gespeicherte Daten', () => {
    localInboxUnavailable.set(true);
    localSalesUnavailable.set(true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      [...element.querySelectorAll('[data-overview-total]')].map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['0', '–', '–']);
    expect(element.textContent).toContain('Noch nicht lokal synchronisiert');
    accountSnapshot.set(
      snapshot({
        conversations: { items: [entry('Gespeichertes Gespräch')], total: 1, nextCursor: null },
        sales: { items: [entry('Gespeicherter Verkauf')], total: 1, nextCursor: null },
      }),
    );
    fixture.detectChanges();
    expect(
      [...element.querySelectorAll('[data-overview-total]')].map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['0', '1', '1']);
    expect(element.textContent).toContain('Gespeichertes Gespräch');
    expect(element.textContent).toContain('Gespeicherter Verkauf');
  });

  it('zeigt Wiederaufnahmen auch in den letzten Verkäufen nicht mehr an', () => {
    accountSnapshot.set(
      snapshot({
        sales: {
          items: [
            { ...entry('Wiederaufnahme'), saleState: 'relisted' },
            { ...entry('Stornierung'), saleState: 'cancelled' },
            { ...entry('Verkauf'), saleState: 'sold' },
          ],
          total: 3,
          nextCursor: null,
        },
      }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).not.toContain('Wiederaufnahme');
    expect(element.textContent).toContain('Stornierung');
    expect(element.textContent).toContain('Verkauf');
  });

  it('overviewUsesStoredTotals: zeigt Kontogesamtzahlen statt der geladenen Teilseite', () => {
    const items = Array.from({ length: 50 }, (_, index) => entry(`listing-${index}`));
    accountSnapshot.set(
      snapshot({
        publications: { items, total: 87, nextCursor: 'next' },
        conversations: { items: [entry('conversation-1')], total: 23, nextCursor: 'next' },
        sales: { items: [entry('sale-1')], total: 11, nextCursor: 'next' },
      }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      [...element.querySelectorAll('[data-overview-total]')].map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['87', '23', '11']);
    expect(element.querySelector('a[href="/marketplaces/vinted/listings"]')).not.toBeNull();
    expect(element.querySelector('a[href="/marketplaces/vinted/messages"]')).not.toBeNull();
    expect(element.querySelector('a[href="/marketplaces/vinted/sales"]')).not.toBeNull();
  });

  it('overviewKeepsUnknownValues: zeigt unbekannte Preise und Zeitpunkte ohne erfundene Kennzahlen', () => {
    accountSnapshot.set(
      snapshot({ sales: { items: [entry('sale-unknown')], total: 1, nextCursor: null } }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const sale = element.querySelector('[data-sale-preview]');
    expect(sale?.querySelector('[data-price]')?.textContent?.trim()).toBe('—');
    expect(sale?.textContent).toContain('Zeitpunkt unbekannt');
    expect(
      [...element.querySelectorAll('[data-overview-total]')].map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['0', '0', '1']);
    expect(element.textContent).not.toMatch(/Umsatz|Gewinn|Ungelesen|Angebote/);
  });

  it('begrenzt Vorschauen auf drei neueste bekannte Zeitpunkte und lässt unbekannte hinten', () => {
    const items = [
      entry('unknown'),
      entry('older', '2026-09-01T10:00:00Z'),
      entry('newest', '2026-10-01T10:00:00Z'),
      entry('middle', '2026-09-20T10:00:00Z'),
      entry('oldest', '2026-08-01T10:00:00Z'),
    ];
    accountSnapshot.set(
      snapshot({
        conversations: { items, total: 5, nextCursor: null },
        sales: { items, total: 5, nextCursor: null },
      }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      [...element.querySelectorAll('[data-conversation-preview] [data-preview-title]')].map(
        (node) => node.textContent?.trim(),
      ),
    ).toEqual(['newest', 'middle', 'older']);
    expect(
      [...element.querySelectorAll('[data-sale-preview] [data-preview-title]')].map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['newest', 'middle', 'older']);
    expect(accountSnapshot()?.conversations.items.map((item) => item.id)).toEqual([
      'unknown',
      'older',
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('bindet Gesprächslinks an das Konto und entfernt Vorschauen bei Kontextverlust', () => {
    accountSnapshot.set(
      snapshot({ conversations: { items: [entry('conversation-1')], total: 1, nextCursor: null } }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-conversation-preview] a')?.getAttribute('href')).toBe(
      '/marketplaces/vinted/messages?connectionId=connection-1&conversationId=conversation-1',
    );
    accountSnapshot.set(null);
    fixture.detectChanges();
    expect(element.querySelector('[data-conversation-preview]')).toBeNull();
  });

  it('zeigt einen echten Nullpreis und verlinkt das Profil', () => {
    accountSnapshot.set(
      snapshot({
        profile: {
          ...scope,
          username: 'shop',
          displayName: 'Mein Shop',
          feedbackCount: null,
          feedbackReputation: null,
        },
        sales: {
          items: [{ ...entry('free'), price: 0, currency: 'EUR' }],
          total: 1,
          nextCursor: null,
        },
      }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-price]')?.textContent).toMatch(/0[.,]00/);
    expect(element.querySelector('a[href="/marketplaces/vinted/profile"]')).not.toBeNull();
  });

  it('hält Vorschauen und Bereichslinks zugänglich', async () => {
    accountSnapshot.set(
      snapshot({
        profile: { ...scope, username: 'shop', feedbackCount: 2, feedbackReputation: 1 },
        conversations: {
          items: [{ ...entry('Anfrage zum Schal'), unread: true }],
          total: 1,
          nextCursor: null,
        },
        sales: { items: [entry('Schal')], total: 1, nextCursor: null },
      }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    try {
      const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
      expect(result.violations.map((violation) => violation.id)).toEqual([]);
    } finally {
      element.remove();
    }
  });
});
