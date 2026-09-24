import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarcodeScannerComponent } from './barcode-scanner.component';

afterEach(() => vi.useRealTimers());

describe('BarcodeScannerComponent', () => {
  it('übernimmt eine manuelle Eingabe auch ohne gestartete Kamera', () => {
    vi.useFakeTimers();
    const detected = { emit: vi.fn() };
    const closed = { emit: vi.fn() };
    const scanner = Object.create(BarcodeScannerComponent.prototype) as BarcodeScannerComponent;
    Object.assign(scanner, {
      scanGeneration: 0,
      isScanning: signal(false),
      scannedResult: signal(null),
      manualEanControl: new FormControl('4006381333931'),
      detected,
      closed,
    });

    scanner.onManualSubmit();
    vi.advanceTimersByTime(400);

    expect(detected.emit).toHaveBeenCalledWith('4006381333931');
    expect(closed.emit).toHaveBeenCalledOnce();
  });
});
