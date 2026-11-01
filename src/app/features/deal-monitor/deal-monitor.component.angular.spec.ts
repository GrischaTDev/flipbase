import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DealMonitorComponent, MAX_FEED_SEARCHES } from './deal-monitor.component';
import { PageLayoutService } from '../../core/services/page-layout.service';
import { WorkspaceService } from '../../core/services/workspace.service';

describe('DealMonitorComponent', () => {
  let page: DealMonitorComponent;
  let layout: PageLayoutService;

  beforeEach(() => {
    localStorage.removeItem('flipbase_widescreen');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DealMonitorComponent,
        { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'ws-1' }) } },
      ],
    });
    // Hier zählt nur die Spaltenlogik; die Suchen selbst prüft ihr eigener Test.
    TestBed.overrideComponent(DealMonitorComponent, { set: { template: '', imports: [] } });
    layout = TestBed.inject(PageLayoutService);
    page = TestBed.inject(DealMonitorComponent);
  });

  afterEach(() => {
    localStorage.removeItem('flipbase_widescreen');
    TestBed.resetTestingModule();
  });

  it('bietet weitere Suchen nur im Widescreen-Modus an', () => {
    expect(page.canAddSearch()).toBe(false);
    page.addSearch();
    expect(page.searches()).toEqual([1]);

    layout.setWidescreen(true);
    expect(page.canAddSearch()).toBe(true);
    page.addSearch();
    expect(page.searches()).toEqual([1, 2]);
    expect(page.searchColumns()).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('teilt die Breite bis zur Höchstzahl und behält Nummern beim Entfernen', () => {
    layout.setWidescreen(true);
    for (let i = 0; i < MAX_FEED_SEARCHES + 2; i++) page.addSearch();
    expect(page.searches()).toHaveLength(MAX_FEED_SEARCHES);
    expect(page.canAddSearch()).toBe(false);

    page.removeSearch(2);
    page.removeSearch(1);
    expect(page.searches()).toEqual([1, 3, 4]);
    page.addSearch();
    expect(page.searches()).toEqual([1, 3, 4, 5]);
  });

  it('zeigt nach dem Ausschalten wieder nur die erste Suche', () => {
    layout.setWidescreen(true);
    page.addSearch();
    layout.setWidth('full');
    expect(layout.widescreen()).toBe(false);
    expect(page.searches()).toEqual([1]);
    expect(page.searchColumns()).toBe('repeat(1, minmax(0, 1fr))');
  });
});
