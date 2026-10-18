import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageLayoutService, pageContentMaxWidth } from './page-layout.service';

afterEach(() => vi.restoreAllMocks());

describe('PageLayoutService', () => {
  it('verwendet ohne gespeicherte Auswahl Mittel', () => {
    expect(new PageLayoutService().width()).toBe('medium');
  });

  it('speichert die Auswahl und stellt sie beim nächsten Start wieder her', () => {
    const layout = new PageLayoutService();
    layout.setWidth('narrow');
    expect(layout.width()).toBe('narrow');
    expect(new PageLayoutService().width()).toBe('narrow');
    layout.setWidth('full');
    expect(new PageLayoutService().width()).toBe('full');
    layout.setWidth('medium');
    expect(new PageLayoutService().width()).toBe('medium');
  });

  it('verwirft unbekannte gespeicherte Werte', () => {
    localStorage.setItem('flipbase_page_width', 'invalid');
    expect(new PageLayoutService().width()).toBe('medium');
  });

  it('funktioniert auch bei gesperrtem Browserspeicher', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const layout = new PageLayoutService();
    expect(layout.width()).toBe('medium');
    layout.setWidth('narrow');
    expect(layout.width()).toBe('narrow');
  });
});

describe('pageContentMaxWidth', () => {
  it.each(['/dashboard', '/purchases', '/catalog', '/catalog?view=stock', '/sales'])(
    'lässt %s im Standard breit',
    (url) => {
      expect(pageContentMaxWidth('medium', url)).toBeNull();
      expect(pageContentMaxWidth('narrow', url)).toBe('64rem');
      expect(pageContentMaxWidth('full', url)).toBeNull();
    },
  );

  it.each([
    '/marketplaces',
    '/vinted-bot',
    '/vinted-bot/filters',
    '/vinted-bot/favorites',
    '/marketplaces/ebay',
    '/expenses',
    '/accounting',
    '/analytics',
    '/purchases/new',
    '/catalog/brands',
    '/sales/new',
  ])('begrenzt %s einheitlich', (url) => {
    expect(pageContentMaxWidth('medium', url)).toBe('80rem');
    expect(pageContentMaxWidth('narrow', url)).toBe('64rem');
    expect(pageContentMaxWidth('full', url)).toBeNull();
  });
});
