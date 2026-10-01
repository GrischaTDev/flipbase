import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { VintedFeedbackListComponent } from './vinted-feedback-list.component';
import type { MarketplaceFeedback, MarketplaceProfile } from '../../models/marketplace-read.models';

describe('VintedFeedbackListComponent', () => {
  let fixture: ComponentFixture<VintedFeedbackListComponent>;
  let component: VintedFeedbackListComponent;
  let resetBindings: (() => void) | undefined;

  const sampleFeedbacks: MarketplaceFeedback[] = [
    {
      id: 'fb-1',
      authorName: 'anna_muster',
      authorImageUrl: 'https://example.com/avatar1.jpg',
      rating: 5,
      text: 'Super lieber Kontakt und schneller Versand!',
      occurredAt: '2026-09-20T10:00:00Z',
      isAutomatic: false,
      itemTitle: 'Vintage Lederjacke',
    },
    {
      id: 'fb-2',
      authorName: 'Vinted System',
      authorImageUrl: null,
      rating: 5,
      text: 'Automatische Bewertung: Die Transaktion wurde erfolgreich abgeschlossen.',
      occurredAt: '2026-09-18T12:00:00Z',
      isAutomatic: true,
      itemTitle: 'Sommerkleid blau',
    },
    {
      id: 'fb-3',
      authorName: 'markus99',
      authorImageUrl: null,
      rating: 4,
      text: 'Alles gut gelaufen.',
      occurredAt: '2026-09-15T08:30:00Z',
      isAutomatic: false,
    },
  ];

  const sampleProfile: MarketplaceProfile = {
    workspaceId: 'ws-1',
    connectionId: 'conn-1',
    username: 'my_vinted_shop',
    displayName: 'Mein Vinted Shop',
    location: 'Berlin',
    bio: 'Vintage Mode aus Berlin',
    imageUrl: null,
    feedbackCount: 3,
    feedbackReputation: 4.8,
    positiveFeedbackCount: 3,
    neutralFeedbackCount: 0,
    negativeFeedbackCount: 0,
    itemCount: 15,
    feedbacks: sampleFeedbacks,
  };

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
      { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
      {
        type: ProductThumbnailComponent,
        path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
      },
      {
        type: VintedFeedbackListComponent,
        path: 'src/app/features/marketplaces/components/vinted-feedback-list/vinted-feedback-list.component.ts',
      },
    ]);
  });

  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VintedFeedbackListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VintedFeedbackListComponent);
    component = fixture.componentInstance;
  });

  it('erstellt die Komponente erfolgreich', () => {
    expect(component).toBeTruthy();
  });

  it('berechnet die Zähler für Mitglieder und automatische Bewertungen korrekt', () => {
    fixture.componentRef.setInput('profile', sampleProfile);
    fixture.detectChanges();

    expect(component.totalFeedbacksCount()).toBe(3);
    expect(component.memberCount()).toBe(2);
    expect(component.automaticCount()).toBe(1);
    expect(component.reputationScore()).toBe(4.8);
    expect(component.filledStars()).toBe(5);
  });

  it('filtert Bewertungen nach Auswahl (all, member, automatic)', () => {
    fixture.componentRef.setInput('profile', sampleProfile);
    fixture.detectChanges();

    expect(component.filteredFeedbacks().length).toBe(3);

    component.setFilter('member');
    expect(component.filteredFeedbacks().length).toBe(2);
    expect(component.filteredFeedbacks().every((f) => !f.isAutomatic)).toBe(true);

    component.setFilter('automatic');
    expect(component.filteredFeedbacks().length).toBe(1);
    expect(component.filteredFeedbacks()[0].isAutomatic).toBe(true);

    component.setFilter('all');
    expect(component.filteredFeedbacks().length).toBe(3);
  });

  it('verwendet für jeden aktiven Filter den Texttoken des gelben Markenakzents', () => {
    fixture.componentRef.setInput('profile', sampleProfile);
    fixture.detectChanges();
    const tabs = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    expect(tabs).toHaveLength(3);
    for (const selectedTab of tabs) {
      selectedTab.click();
      fixture.detectChanges();
      for (const tab of tabs) {
        const selected = tab === selectedTab;
        expect(tab.getAttribute('aria-selected')).toBe(String(selected));
        expect(tab.classList.contains('bg-fb-primary')).toBe(selected);
        expect(tab.classList.contains('text-fb-on-accent')).toBe(selected);
        expect(tab.classList.contains('text-fb-primary-contrast')).toBe(false);
        expect(tab.classList.contains('text-fb-text-secondary')).toBe(!selected);
      }
    }
  });

  it('zeigt den Empty State an, wenn keine Bewertungen vorhanden sind', () => {
    const emptyProfile: MarketplaceProfile = {
      ...sampleProfile,
      feedbackCount: 0,
      feedbacks: [],
    };

    fixture.componentRef.setInput('profile', emptyProfile);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Noch keine detaillierten Bewertungen geladen');
  });

  it('rendert Bewertungen mit Badges und Texten in der Liste', () => {
    fixture.componentRef.setInput('profile', sampleProfile);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('anna_muster');
    expect(element.textContent).toContain('Super lieber Kontakt und schneller Versand!');
    expect(element.textContent).toContain('Automatisch');
    expect(element.textContent).toContain('Mitglied');
    expect(element.textContent).toContain('Vintage Lederjacke');
  });

  it('zählt eine unbekannte Herkunft weder als Mitglied noch als automatisch und zeigt fehlende Daten', () => {
    fixture.componentRef.setInput('profile', {
      ...sampleProfile,
      feedbackCount: 4,
      feedbacks: [
        ...sampleFeedbacks,
        {
          id: 'fb-unknown',
          authorName: null,
          authorImageUrl: null,
          rating: null,
          text: 'Bewertung ohne vollständige Angaben',
          occurredAt: null,
          isAutomatic: null,
        },
      ],
    });
    fixture.detectChanges();

    expect(component.memberCount()).toBe(2);
    expect(component.automaticCount()).toBe(1);
    expect(component.filteredFeedbacks()).toHaveLength(4);
    const element = fixture.nativeElement as HTMLElement;
    const articles = element.querySelectorAll('article');
    const unknownFeedback = articles.item(3);
    expect(unknownFeedback.textContent).toContain('Autor unbekannt');
    expect(unknownFeedback.textContent).toContain('Herkunft unbekannt');
    expect(unknownFeedback.textContent).toContain('Sternebewertung unbekannt');
    expect(unknownFeedback.textContent).not.toContain('Mitglied');
    expect(unknownFeedback.querySelector('[aria-label$="von 5 Sternen"]')).toBeNull();

    component.setFilter('member');
    expect(component.filteredFeedbacks().map((feedback) => feedback.id)).toEqual(['fb-1', 'fb-3']);
    component.setFilter('automatic');
    expect(component.filteredFeedbacks().map((feedback) => feedback.id)).toEqual(['fb-2']);
  });

  it('zeigt eine bestätigte Null-Sterne-Bewertung als null Sterne an', () => {
    fixture.componentRef.setInput('profile', {
      ...sampleProfile,
      feedbacks: [{ ...sampleFeedbacks[0], rating: 0 }],
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('article [aria-label="0 von 5 Sternen"]')).not.toBeNull();
    expect(element.querySelectorAll('article .fill-current')).toHaveLength(0);
    expect(element.textContent).not.toContain('Sternebewertung unbekannt');
  });
});
