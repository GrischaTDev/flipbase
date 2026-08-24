import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ToastService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stellt Titel und Beschreibung einer Erfolgsmeldung bereit', () => {
    service.success('Artikel wurde angelegt.', 'Die Artikelnummer lautet A-100.');

    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde angelegt.',
      description: 'Die Artikelnummer lautet A-100.',
      persistent: false,
    });
  });

  it('pinnt Fehler an, bis sie ausdrücklich geschlossen werden', () => {
    const id = service.error(
      'Lieferant konnte nicht gelöscht werden.',
      'Dem Lieferanten sind noch Einkäufe zugeordnet.',
    );

    vi.advanceTimersByTime(60_000);
    expect(service.toasts()).toContainEqual({
      id,
      type: 'error',
      title: 'Lieferant konnte nicht gelöscht werden.',
      description: 'Dem Lieferanten sind noch Einkäufe zugeordnet.',
      persistent: true,
    });

    service.dismiss(id);
    expect(service.toasts()).toEqual([]);
  });

  it('blendet Erfolg nach vier Sekunden automatisch aus', () => {
    service.success('Gespeichert.');

    vi.advanceTimersByTime(3999);
    expect(service.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(service.toasts()).toEqual([]);
  });

  it('behält alle angepinnten Fehler und höchstens vier normale Meldungen', () => {
    service.error('Fehler Eins');
    service.error('Fehler Zwei');
    service.error('Fehler Drei');
    service.error('Fehler Vier');
    service.error('Fehler Fünf');
    service.info('Eins');
    service.info('Zwei');
    service.warning('Drei');
    service.info('Vier');
    service.success('Fünf');

    expect(service.toasts().map(({ title }) => title)).toEqual([
      'Fehler Eins',
      'Fehler Zwei',
      'Fehler Drei',
      'Fehler Vier',
      'Fehler Fünf',
      'Zwei',
      'Drei',
      'Vier',
      'Fünf',
    ]);
  });

  it('löscht den Timer einer durch das Limit entfernten Normalmeldung', () => {
    service.info('Eins');
    service.info('Zwei');
    service.info('Drei');
    service.info('Vier');
    service.info('Fünf');

    expect(vi.getTimerCount()).toBe(4);
  });
});
