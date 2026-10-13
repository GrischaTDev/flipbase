import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { NavigationCancel, NavigationError, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { AppStartupService } from './app-startup.service';

it('reports actual navigation errors, ignores cancellations and removes its router listener on destruction', () => {
  const events = new Subject<unknown>();
  const injector = Injector.create({ providers: [{ provide: Router, useValue: { events } }] });
  const dispatch = vi.spyOn(window, 'dispatchEvent');
  const service = runInInjectionContext(injector, () => new AppStartupService());
  events.next(new NavigationCancel(1, '/', 'redirect'));
  expect(dispatch).not.toHaveBeenCalled();
  events.next(new NavigationError(2, '/', new Error('asset')));
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'flipbase:startup-failed', detail: { reason: 'navigation' } }),
  );
  service.failStartup('bootstrap');
  expect(dispatch).toHaveBeenCalledTimes(2);
  injector.destroy();
  events.next(new NavigationError(3, '/', new Error('asset')));
  expect(dispatch).toHaveBeenCalledTimes(2);
  dispatch.mockRestore();
});
