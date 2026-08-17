import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { PwaService } from './pwa.service';

describe('PWA & Offline Service', () => {
  let pwaService: PwaService;

  beforeEach(() => {
    pwaService = new PwaService();
  });

  it('should initialize with default online and installation states', () => {
    expect(pwaService.isOnline()).toBeDefined();
    expect(pwaService.isInstalled()).toBeDefined();
    expect(pwaService.isInstallable()).toBeDefined();
  });

  it('should return false when promptInstall is called without a deferred prompt', async () => {
    const result = await pwaService.promptInstall();
    expect(result).toBe(false);
  });
});
