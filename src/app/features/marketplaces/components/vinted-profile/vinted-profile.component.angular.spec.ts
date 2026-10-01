import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import axe from 'axe-core';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import type { MarketplaceSnapshot } from '../../models/marketplace-read.models';
import { parseMarketplaceSnapshot } from '../../models/marketplace-response';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { VintedFeedbackListComponent } from '../vinted-feedback-list/vinted-feedback-list.component';
import { VintedProfileEditorComponent } from '../vinted-profile-editor/vinted-profile-editor.component';
import { VintedRatingComponent } from '../vinted-rating/vinted-rating.component';
import { VintedProfileComponent } from './vinted-profile.component';

const connection = createMarketplaceFixtures().connections[0];
const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
const emptyPage = { items: [], total: 0, nextCursor: null };
function snapshot(profile: Record<string, unknown> | null = {}) {
  return parseMarketplaceSnapshot(
    {
      ...scope,
      profile:
        profile === null
          ? null
          : {
              ...scope,
              displayName: 'Mein Vinted Shop',
              username: 'my_shop',
              bio: 'Vintage aus Berlin',
              bioState: 'loaded',
              feedbackCount: 1,
              feedbacks: [
                { id: 'feedback-1', text: 'Schneller Versand', rating: 5, isAutomatic: false },
              ],
              ...profile,
            },
      publications: emptyPage,
      conversations: emptyPage,
      sales: emptyPage,
      activity: emptyPage,
    },
    scope,
  );
}

describe('VintedProfileComponent', () => {
  let fixture: ComponentFixture<VintedProfileComponent>;
  let resetBindings: (() => void) | undefined;
  let fragment: BehaviorSubject<string | null>;
  const accountSnapshot = signal<MarketplaceSnapshot | null>(null);
  const selectedConnection = signal(connection);

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
      { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
      { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
      {
        type: NoticeBannerComponent,
        path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
      },
      {
        type: ProductThumbnailComponent,
        path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
      },
      {
        type: TextFieldComponent,
        path: 'src/app/shared/components/text-field/text-field.component.ts',
      },
      {
        type: VintedFeedbackListComponent,
        path: 'src/app/features/marketplaces/components/vinted-feedback-list/vinted-feedback-list.component.ts',
      },
      {
        type: VintedProfileEditorComponent,
        path: 'src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component.ts',
      },
      {
        type: VintedRatingComponent,
        path: 'src/app/features/marketplaces/components/vinted-rating/vinted-rating.component.ts',
      },
      {
        type: VintedProfileComponent,
        path: 'src/app/features/marketplaces/components/vinted-profile/vinted-profile.component.ts',
      },
    ]);
  });
  afterAll(() => resetBindings?.());
  afterEach(() => {
    fixture.destroy();
    (fixture.nativeElement as HTMLElement).remove();
  });

  beforeEach(async () => {
    TestBed.resetTestingModule();
    accountSnapshot.set(snapshot());
    selectedConnection.set({ ...connection, status: 'connected' });
    fragment = new BehaviorSubject<string | null>(null);
    await TestBed.configureTestingModule({
      imports: [VintedProfileComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { fragment, snapshot: { fragment: null } } },
        {
          provide: MarketplaceAccountStore,
          useValue: { snapshot: accountSnapshot, selectedConnection },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VintedProfileComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
  });

  it('zeigt Identität, Beschreibung und gespeicherte Bewertungen genau einmal im Profil', () => {
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Mein Vinted Shop');
    expect(element.textContent).toContain('Vintage aus Berlin');
    expect(element.querySelectorAll('app-vinted-feedback-list')).toHaveLength(1);
    expect(element.querySelector('#reviews')?.textContent).toContain('Schneller Versand');
  });

  it('fokussiert den Bewertungsabschnitt bei direktem Fragment und späterer Fragmentänderung', async () => {
    fragment.next('reviews');
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const reviews = element.querySelector<HTMLElement>('#reviews');
    expect(reviews).not.toBeNull();
    expect(document.activeElement).toBe(reviews);
    fragment.next(null);
    fixture.detectChanges();
    reviews?.blur();
    fragment.next('reviews');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(reviews);
  });

  it('wartet mit dem Ankerfokus auf den geladenen Snapshot', async () => {
    accountSnapshot.set(null);
    fragment.next('reviews');
    fixture.detectChanges();
    accountSnapshot.set(snapshot());
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('reviews');
  });

  it('behält die Profilbearbeitung ausschließlich für das verbundene Konto', () => {
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-vinted-profile-editor')).not.toBeNull();
    selectedConnection.set({ ...connection, status: 'needs_login' });
    fixture.detectChanges();
    expect(element.querySelector('app-vinted-profile-editor')).toBeNull();
  });

  it('zieht den Fokus bei einer Hintergrundaktualisierung nicht erneut auf Bewertungen', async () => {
    fragment.next('reviews');
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const editButton = element.querySelector<HTMLButtonElement>('app-vinted-profile-editor button');
    editButton?.focus();
    accountSnapshot.set(snapshot({ bio: 'Aktualisierte Beschreibung' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(editButton);
  });

  it('unterscheidet fehlende Beschreibung, bestätigten leeren Text und fehlende Profildaten', () => {
    accountSnapshot.set(snapshot({ bio: null, bioState: 'not_loaded' }));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Noch keine Profilbeschreibung gespeichert');
    accountSnapshot.set(snapshot({ bio: '', bioState: 'loaded' }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Keine Profilbeschreibung vorhanden');
    accountSnapshot.set(snapshot(null));
    fixture.detectChanges();
    expect(element.textContent).toContain('Noch keine Profildaten gespeichert');
    expect(element.querySelector('app-vinted-profile-editor')).toBeNull();
  });

  it('stellt Profil und Bewertungsabschnitt mit zugänglichen Namen bereit', async () => {
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
