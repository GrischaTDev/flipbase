import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import {
  AppErrorReportService,
  appErrorDevice,
  visibleAlertText,
} from './app-error-report.service';
import { SupabaseService } from './supabase.service';

let rpc: ReturnType<typeof vi.fn>;
let user: ReturnType<typeof signal<{ id: string } | null>>;
let service: AppErrorReportService;

beforeEach(() => {
  vi.useFakeTimers();
  rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  user = signal<{ id: string } | null>({ id: 'user-a' });
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: { rpc } } },
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: Router, useValue: { url: '/marketplaces/vinted?tab=1' } },
    ],
  });
  service = TestBed.inject(AppErrorReportService);
});
afterEach(() => {
  TestBed.resetTestingModule();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

async function showAlert(text: string, attributes: Record<string, string> = {}) {
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  for (const [name, value] of Object.entries(attributes)) alert.setAttribute(name, value);
  alert.textContent = text;
  document.body.append(alert);
  await vi.advanceTimersByTimeAsync(2_000);
  return alert;
}

describe('Fehlermeldungen der App protokollieren', () => {
  it('meldet eine sichtbare Fehlermeldung einmal mit Seite und Geräteklasse', async () => {
    service.start();
    await showAlert('Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.');
    await showAlert('Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.');
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('platform_report_app_error', {
      p_code: 'visible_error',
      p_message: 'Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.',
      p_page: '/marketplaces/vinted',
      p_device: expect.any(String),
    });
  });

  it('übergeht kurz aufblitzende Meldungen, Feldfehler und abgemeldete Besucher', async () => {
    service.start();
    const flash = document.createElement('p');
    flash.setAttribute('role', 'alert');
    flash.textContent = 'Lädt kurz falsch';
    document.body.append(flash);
    flash.remove();
    await vi.advanceTimersByTimeAsync(2_000);

    const input = document.createElement('input');
    input.setAttribute('aria-describedby', 'price-error');
    document.body.append(input);
    await showAlert('Bitte gib einen Preis ein.', { id: 'price-error' });

    user.set(null);
    await showAlert('Sitzung abgelaufen');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('meldet unbehandelte Ausnahmen und übersteht einen Protokollfehler', async () => {
    rpc.mockRejectedValueOnce(new Error('offline'));
    service.reportException(new TypeError('x is undefined'));
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledWith(
      'platform_report_app_error',
      expect.objectContaining({ p_code: 'exception', p_message: 'TypeError: x is undefined' }),
    );
  });

  it('bestimmt nur eine grobe Geräteklasse', () => {
    const view = (coarse: boolean, width: number, standalone = false) => ({
      innerWidth: width,
      matchMedia: (query: string) =>
        ({
          matches: query.includes('pointer') ? coarse : standalone,
        }) as MediaQueryList,
    });
    expect(appErrorDevice(view(false, 1400))).toBe('desktop');
    expect(appErrorDevice(view(true, 390, true))).toBe('phone-pwa');
    expect(appErrorDevice(view(true, 900))).toBe('tablet');
    const hidden = document.createElement('div');
    hidden.hidden = true;
    hidden.innerHTML = '<p role="alert">Versteckt</p>';
    document.body.append(hidden);
    expect(visibleAlertText(hidden.firstElementChild!, document)).toBeNull();
  });
});
